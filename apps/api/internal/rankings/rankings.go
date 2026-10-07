// Package rankings keeps national/regional/zonal rankings in memory.
//
// Only results whose country is the
// Philippines with a positive value count; each person's best row is chosen by
// (value, result id); rows are ordered by (value, person id).
package rankings

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"sort"

	"github.com/pca/backend/internal/jsonx"
	"github.com/pca/backend/internal/wcaformat"
)

const PhilippinesCountryID = "Philippines"

type Event struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Rank     int    `json:"rank"`
	Format   string `json:"format"`
	CellName string `json:"cell_name"`
}

type Kind int

const (
	Single Kind = iota
	Average
)

type entry struct {
	personID string
	value    int
	resultID int64
	// prefix is the encoded row up to and including `"region":`.
	prefix []byte
}

type Dataset struct {
	Events     []Event
	EventsJSON []byte
	eventByID  map[string]*Event
	lists      map[string]*[2][]entry
}

func (d *Dataset) Event(id string) (*Event, bool) {
	e, ok := d.eventByID[id]
	return e, ok
}

type resultRow struct {
	id              int64
	personID        string
	personName      sql.NullString
	eventID         string
	best, average   int
	values          [5]int
	competitionID   sql.NullString
	competitionName sql.NullString
}

// Load builds the dataset from the database.
func Load(ctx context.Context, q *sql.DB) (*Dataset, error) {
	d := &Dataset{eventByID: map[string]*Event{}, lists: map[string]*[2][]entry{}}

	rows, err := q.QueryContext(ctx, `SELECT id, name, rank, format, cell_name FROM wca_event ORDER BY rank, id`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var e Event
		if err := rows.Scan(&e.ID, &e.Name, &e.Rank, &e.Format, &e.CellName); err != nil {
			rows.Close()
			return nil, err
		}
		d.Events = append(d.Events, e)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if d.Events == nil {
		d.Events = []Event{}
	}
	eventJSON := map[string][]byte{}
	for i := range d.Events {
		e := &d.Events[i]
		d.eventByID[e.ID] = e
		eventJSON[e.ID] = jsonx.MustMarshal(e)
	}
	d.EventsJSON = jsonx.MustMarshal(d.Events)

	rows, err = q.QueryContext(ctx, `SELECT r.id, r.person_id, r.person_name, r.event_id, r.best, r.average,
		r.value1, r.value2, r.value3, r.value4, r.value5, r.competition_id, c.name
		FROM wca_result r LEFT JOIN wca_competition c ON c.id = r.competition_id
		WHERE r.country_id = ? AND r.person_id IS NOT NULL AND r.event_id IS NOT NULL AND (r.best > 0 OR r.average > 0)`,
		PhilippinesCountryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type key struct{ event, person string }
	var best [2]map[key]*resultRow
	best[Single] = map[key]*resultRow{}
	best[Average] = map[key]*resultRow{}
	for rows.Next() {
		r := &resultRow{}
		if err := rows.Scan(&r.id, &r.personID, &r.personName, &r.eventID, &r.best, &r.average,
			&r.values[0], &r.values[1], &r.values[2], &r.values[3], &r.values[4],
			&r.competitionID, &r.competitionName); err != nil {
			return nil, err
		}
		k := key{r.eventID, r.personID}
		if r.best > 0 {
			if cur, ok := best[Single][k]; !ok || r.best < cur.best || (r.best == cur.best && r.id < cur.id) {
				best[Single][k] = r
			}
		}
		if r.average > 0 {
			if cur, ok := best[Average][k]; !ok || r.average < cur.average || (r.average == cur.average && r.id < cur.id) {
				best[Average][k] = r
			}
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	for kind := Single; kind <= Average; kind++ {
		for k, r := range best[kind] {
			ev, ok := d.eventByID[k.event]
			if !ok {
				continue
			}
			lists := d.lists[k.event]
			if lists == nil {
				lists = &[2][]entry{}
				d.lists[k.event] = lists
			}
			value := r.best
			if kind == Average {
				value = r.average
			}
			lists[kind] = append(lists[kind], entry{
				personID: r.personID,
				value:    value,
				resultID: r.id,
				prefix:   encodePrefix(r, ev, eventJSON[ev.ID], kind),
			})
		}
	}
	for _, lists := range d.lists {
		for kind := range lists {
			l := lists[kind]
			sort.Slice(l, func(i, j int) bool {
				if l[i].value != l[j].value {
					return l[i].value < l[j].value
				}
				return l[i].personID < l[j].personID
			})
		}
	}
	return d, nil
}

func nullableJSON(s *string) []byte {
	if s == nil {
		return []byte("null")
	}
	return jsonx.String(*s)
}

func encodePrefix(r *resultRow, ev *Event, eventJSON []byte, kind Kind) []byte {
	var b bytes.Buffer
	b.WriteString(`{"competition":{"id":`)
	if r.competitionID.Valid {
		b.Write(jsonx.String(r.competitionID.String))
	} else {
		b.WriteString("null")
	}
	b.WriteString(`,"name":`)
	if r.competitionName.Valid {
		b.Write(jsonx.String(r.competitionName.String))
	} else {
		b.WriteString("null")
	}
	b.WriteString(`},"event":`)
	b.Write(eventJSON)

	average := kind == Average
	value := r.best
	if average {
		value = r.average
	}
	b.WriteString(`,"value":`)
	b.Write(nullableJSON(wcaformat.Value(value, ev.Format, average)))
	b.WriteString(`,"person_name":`)
	if r.personName.Valid {
		b.Write(jsonx.String(r.personName.String))
	} else {
		b.WriteString("null")
	}
	b.WriteString(`,"wca_id":`)
	b.Write(jsonx.String(r.personID))
	b.WriteString(`,"solves":{`)
	solves := wcaformat.Solves(r.values, r.average, ev.ID, ev.Format, average)
	for i, s := range solves {
		if i > 0 {
			b.WriteByte(',')
		}
		fmt.Fprintf(&b, `"value%d":`, i+1)
		b.Write(nullableJSON(s))
	}
	b.WriteString(`},"region":`)
	return b.Bytes()
}

// Regions maps WCA IDs to PCA home regions.
type Regions struct {
	// display is the region of the lowest-id user with each WCA ID.
	display map[string]sql.NullString
	// members lists every WCA ID that has at least one eligible user in a
	// region.
	members map[string]map[string]struct{}
}

// LoadRegions reads user regions. With requireWCAAccount only users linked
// to a WCA social account count towards regional and zonal membership.
func LoadRegions(ctx context.Context, q *sql.DB, requireWCAAccount bool) (*Regions, error) {
	rows, err := q.QueryContext(ctx, `SELECT u.wca_id, u.region, EXISTS (
			SELECT 1 FROM socialaccount_socialaccount s
			WHERE s.user_id = u.id AND s.provider = 'worldcubeassociation')
		FROM api_user u WHERE u.wca_id IS NOT NULL ORDER BY u.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	r := &Regions{display: map[string]sql.NullString{}, members: map[string]map[string]struct{}{}}
	for rows.Next() {
		var wcaID string
		var region sql.NullString
		var linked bool
		if err := rows.Scan(&wcaID, &region, &linked); err != nil {
			return nil, err
		}
		if _, seen := r.display[wcaID]; !seen {
			r.display[wcaID] = region
		}
		if region.Valid && (linked || !requireWCAAccount) {
			set := r.members[region.String]
			if set == nil {
				set = map[string]struct{}{}
				r.members[region.String] = set
			}
			set[wcaID] = struct{}{}
		}
	}
	return r, rows.Err()
}

func (r *Regions) regionJSON(wcaID string) []byte {
	if region, ok := r.display[wcaID]; ok && region.Valid {
		return jsonx.String(region.String)
	}
	return []byte("null")
}

// Render writes the ranking JSON array. regionIDs nil means national.
func (d *Dataset) Render(r *Regions, eventID string, kind Kind, regionIDs []string, limit int) []byte {
	var list []entry
	if lists := d.lists[eventID]; lists != nil {
		list = lists[kind]
	}
	var sets []map[string]struct{}
	if regionIDs != nil {
		for _, id := range regionIDs {
			if s := r.members[id]; s != nil {
				sets = append(sets, s)
			}
		}
	}
	var b bytes.Buffer
	b.Grow(256 * min(limit, len(list)+1))
	b.WriteByte('[')
	n := 0
	for i := range list {
		if n >= limit {
			break
		}
		e := &list[i]
		if regionIDs != nil && !inAny(sets, e.personID) {
			continue
		}
		if n > 0 {
			b.WriteByte(',')
		}
		b.Write(e.prefix)
		b.Write(r.regionJSON(e.personID))
		b.WriteByte('}')
		n++
	}
	b.WriteByte(']')
	return b.Bytes()
}

func inAny(sets []map[string]struct{}, id string) bool {
	for _, s := range sets {
		if _, ok := s[id]; ok {
			return true
		}
	}
	return false
}
