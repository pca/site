// Package statsbuild prepares the regional strength and growth statistics
// snapshot.
package statsbuild

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"strconv"

	"github.com/pca/backend/internal/db"
	"github.com/pca/backend/internal/jsonx"
	"github.com/pca/backend/internal/timefmt"
)

type Input struct {
	ExportVersion   string
	ExportChecksum  string
	BoundaryVersion string
	LatestYear      int
}

type SyncCounts struct {
	Created, Updated, Unchanged, Deleted int
}

func (c SyncCounts) String() string {
	return fmt.Sprintf("%d created, %d updated, %d unchanged, %d deleted", c.Created, c.Updated, c.Unchanged, c.Deleted)
}

func (c SyncCounts) dirty() bool { return c.Created+c.Updated+c.Deleted > 0 }

type Result struct {
	SnapshotID int64
	Changed    bool
	Strength   SyncCounts
	Growth     SyncCounts
}

var sha256Pattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

// record is one desired snapshot row keyed for comparison with stored rows.
type record struct {
	key    string
	hash   string
	values []any
}

type prepared struct {
	strength []record
	growth   []record
	coverage []byte
}

// Build computes the snapshot from current data and activates it. Rows whose
// content is unchanged are left alone; when nothing changed at all, nothing
// is written and Result.Changed is false.
func Build(ctx context.Context, d *db.DB, in Input, logf func(string, ...any)) (*Result, error) {
	if !sha256Pattern.MatchString(in.ExportChecksum) {
		return nil, errors.New("export checksum must be a 64-character SHA-256")
	}
	p, err := prepare(ctx, d.Read, in, logf)
	if err != nil {
		return nil, err
	}
	res := &Result{}
	err = d.Tx(ctx, func(tx *sql.Tx) error {
		now := timefmt.FormatDB(timefmt.Now())
		var status, coverage, exportVersion string
		var active bool
		var latestYear int
		err := tx.QueryRowContext(ctx, `SELECT id, status, is_active, coverage, export_version, latest_year
			FROM api_statisticssnapshot WHERE export_checksum = ? AND boundary_dataset_id = ?`,
			in.ExportChecksum, in.BoundaryVersion).Scan(&res.SnapshotID, &status, &active, &coverage, &exportVersion, &latestYear)
		created := false
		if errors.Is(err, sql.ErrNoRows) {
			created = true
			r, err := tx.ExecContext(ctx, `INSERT INTO api_statisticssnapshot (export_version, export_checksum, latest_year,
				status, is_active, coverage, error_message, created_at, completed_at, activated_at, boundary_dataset_id)
				VALUES (?, ?, ?, 'building', 0, '{}', '', ?, NULL, NULL, ?)`,
				in.ExportVersion, in.ExportChecksum, in.LatestYear, now, in.BoundaryVersion)
			if err != nil {
				return err
			}
			if res.SnapshotID, err = r.LastInsertId(); err != nil {
				return err
			}
		} else if err != nil {
			return err
		}

		res.Strength, err = syncRecords(ctx, tx, res.SnapshotID, strengthTable, p.strength)
		if err != nil {
			return fmt.Errorf("regional strength rows: %w", err)
		}
		res.Growth, err = syncRecords(ctx, tx, res.SnapshotID, growthTable, p.growth)
		if err != nil {
			return fmt.Errorf("growth rows: %w", err)
		}
		res.Changed = created || res.Strength.dirty() || res.Growth.dirty() || status != "ready" || !active ||
			coverage != string(p.coverage) || exportVersion != in.ExportVersion || latestYear != in.LatestYear
		if !res.Changed {
			return nil
		}
		if _, err := tx.ExecContext(ctx, `UPDATE api_statisticssnapshot SET is_active = 0 WHERE is_active = 1 AND id != ?`,
			res.SnapshotID); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE api_statisticssnapshot SET export_version = ?, latest_year = ?,
			status = 'ready', is_active = 1, coverage = ?, error_message = '', completed_at = ?, activated_at = ?
			WHERE id = ?`, in.ExportVersion, in.LatestYear, string(p.coverage), now, now, res.SnapshotID); err != nil {
			return err
		}
		return db.BumpGeneration(ctx, tx)
	})
	if err != nil {
		return nil, err
	}
	return res, nil
}

func prepare(ctx context.Context, rdb *sql.DB, in Input, logf func(string, ...any)) (*prepared, error) {
	conn, err := rdb.Conn(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Close()
	// One read transaction gives every query the same database snapshot.
	if _, err := conn.ExecContext(ctx, "BEGIN"); err != nil {
		return nil, err
	}
	defer conn.ExecContext(context.WithoutCancel(ctx), "ROLLBACK")

	if err := validateAssignments(ctx, conn, in.BoundaryVersion); err != nil {
		return nil, err
	}

	type event struct {
		id, name string
		rank     int
	}
	var events []event
	rows, err := conn.QueryContext(ctx, `SELECT id, name, rank FROM wca_event ORDER BY rank, name, id`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var e event
		if err := rows.Scan(&e.id, &e.name, &e.rank); err != nil {
			rows.Close()
			return nil, err
		}
		events = append(events, e)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	var pairs [][2]string
	rows, err = conn.QueryContext(ctx, `SELECT wca_id, region FROM api_user WHERE wca_id IS NOT NULL AND region IS NOT NULL`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var p [2]string
		if err := rows.Scan(&p[0], &p[1]); err != nil {
			rows.Close()
			return nil, err
		}
		pairs = append(pairs, p)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	home := newHomeRegions(pairs)

	ranks := map[string]map[string][]rankRow{}
	for _, rt := range rankTables {
		byEvent := map[string][]rankRow{}
		rows, err := conn.QueryContext(ctx, `SELECT r.event_id, r.person_id, p.name, r.country_rank FROM `+rt.table+` r
			LEFT JOIN wca_person p ON p.id = r.person_id WHERE r.country_rank > 0 AND r.event_id IS NOT NULL
			ORDER BY r.event_id, r.country_rank, r.person_id`)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var eventID string
			var r rankRow
			if err := rows.Scan(&eventID, &r.personID, &r.name, &r.rank); err != nil {
				rows.Close()
				return nil, err
			}
			byEvent[eventID] = append(byEvent[eventID], r)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
		ranks[rt.rankType] = byEvent
	}

	p := &prepared{}
	strengthCoverage := jsonx.NewObject()
	for _, e := range events {
		if e.rank >= currentEventRankCutoff {
			continue
		}
		for _, rt := range rankTables {
			entries, worst, cov := eventInputs(ranks[rt.rankType][e.id], home)
			strengthCoverage.Set(rt.rankType+":"+e.id, cov)
			if worst == 0 {
				continue
			}
			results, err := calculateEventStrength(entries, worst)
			if err != nil {
				return nil, fmt.Errorf("%s %s: %w", e.id, rt.rankType, err)
			}
			for _, r := range results {
				rec, err := strengthRecord(e.id, rt.rankType, r)
				if err != nil {
					return nil, err
				}
				p.strength = append(p.strength, rec)
			}
		}
	}

	var parts []participation
	rows, err = conn.QueryContext(ctx, `SELECT r.person_id, r.competition_id, c.year, c.month, c.day,
		COALESCE(c.country_id, ''), a.region_code, r.event_id
		FROM wca_result r JOIN wca_competition c ON c.id = r.competition_id
		LEFT JOIN wca_competitionregionassignment a ON a.competition_id = r.competition_id
		WHERE r.person_id IS NOT NULL AND r.competition_id IS NOT NULL AND r.event_id IS NOT NULL`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var pt participation
		var region sql.NullString
		if err := rows.Scan(&pt.personID, &pt.competitionID, &pt.year, &pt.month, &pt.day, &pt.countryID, &region, &pt.eventID); err != nil {
			rows.Close()
			return nil, err
		}
		if region.Valid {
			pt.region = &region.String
		}
		parts = append(parts, pt)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	eventIDs := make([]string, len(events))
	for i, e := range events {
		eventIDs[i] = e.id
	}
	values, growthCoverage, err := calculateGrowth(parts, eventIDs, in.LatestYear)
	if err != nil {
		return nil, err
	}
	for _, v := range values {
		rec, err := growthRecord(v)
		if err != nil {
			return nil, err
		}
		p.growth = append(p.growth, rec)
	}

	outcomes := jsonx.NewObject()
	rows, err = conn.QueryContext(ctx, `SELECT a.status, COUNT(a.id) FROM wca_competitionregionassignment a
		JOIN wca_competition c ON c.id = a.competition_id
		WHERE c.country_id = 'Philippines' AND a.boundary_dataset_id = ? GROUP BY a.status ORDER BY a.status`, in.BoundaryVersion)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var status string
		var n int
		if err := rows.Scan(&status, &n); err != nil {
			rows.Close()
			return nil, err
		}
		outcomes.Set(status, n)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	growthCoverage.Set("classification_outcomes", outcomes)

	coverage := jsonx.NewObject()
	coverage.Set("regional_strength", strengthCoverage)
	coverage.Set("growth", growthCoverage)
	if p.coverage, err = jsonx.PyDumps(coverage); err != nil {
		return nil, err
	}
	logf("Prepared %d regional strength rows and %d growth rows from %d results.", len(p.strength), len(p.growth), len(parts))
	return p, nil
}

func validateAssignments(ctx context.Context, conn *sql.Conn, boundary string) error {
	var total, matching int
	if err := conn.QueryRowContext(ctx, `SELECT COUNT(*) FROM wca_competition WHERE country_id = 'Philippines'`).Scan(&total); err != nil {
		return err
	}
	if err := conn.QueryRowContext(ctx, `SELECT COUNT(*) FROM wca_competitionregionassignment a
		JOIN wca_competition c ON c.id = a.competition_id
		WHERE c.country_id = 'Philippines' AND a.boundary_dataset_id = ?
		AND a.classified_latitude IS c.latitude AND a.classified_longitude IS c.longitude`, boundary).Scan(&matching); err != nil {
		return err
	}
	if matching != total {
		return fmt.Errorf("Competition-region assignments are incomplete or stale: %d of %d match boundary %s.",
			matching, total, boundary)
	}
	return nil
}

func hashOf(payload any) (string, error) {
	b, err := jsonx.PyCanonical(payload)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:]), nil
}

func strengthRecord(eventID, rankType string, r regionStrength) (record, error) {
	slotMaps := make([]map[string]any, len(r.slots))
	for i, s := range r.slots {
		slotMaps[i] = map[string]any{"wca_id": s.WCAID, "name": s.Name, "national_rank": s.NationalRank, "is_penalty": s.IsPenalty}
	}
	hash, err := hashOf(map[string]any{"score": r.score, "placement": r.placement,
		"contributor_count": r.contributors, "slots": slotMaps})
	if err != nil {
		return record{}, err
	}
	slots, err := jsonx.PyDumps(r.slots)
	if err != nil {
		return record{}, err
	}
	return record{
		key:    eventID + "\x00" + rankType + "\x00" + r.region,
		hash:   hash,
		values: []any{eventID, rankType, r.region, r.score, r.placement, r.contributors, string(slots)},
	}, nil
}

func growthRecord(v growthValue) (record, error) {
	var unique any
	if v.uniqueCompetitors != nil {
		unique = *v.uniqueCompetitors
	}
	hash, err := hashOf(map[string]any{"metric": v.metric, "year": v.year, "region_code": v.region,
		"event_id": v.eventID, "value": v.value, "unique_competitors": unique})
	if err != nil {
		return record{}, err
	}
	return record{
		key:    v.metric + "\x00" + strconv.Itoa(v.year) + "\x00" + v.region + "\x00" + v.eventID,
		hash:   hash,
		values: []any{v.metric, v.year, v.region, v.eventID, v.value, unique},
	}, nil
}

type table struct {
	name    string
	keySQL  string
	keyCols []string
	valCols []string
}

var strengthTable = table{
	name:    "api_regionalstrengthrecord",
	keySQL:  "event_id || char(0) || rank_type || char(0) || region_code",
	keyCols: []string{"event_id", "rank_type", "region_code"},
	valCols: []string{"score", "placement", "contributor_count", "slots"},
}

var growthTable = table{
	name:    "api_growthannualrecord",
	keySQL:  "metric || char(0) || year || char(0) || region_code || char(0) || event_id",
	keyCols: []string{"metric", "year", "region_code", "event_id"},
	valCols: []string{"value", "unique_competitors"},
}

// syncRecords creates, updates and deletes rows so the snapshot holds exactly
// the desired records, skipping rows whose content hash already matches.
func syncRecords(ctx context.Context, tx *sql.Tx, snapshotID int64, t table, desired []record) (SyncCounts, error) {
	var c SyncCounts
	type stored struct {
		id   int64
		hash string
	}
	existing := map[string]stored{}
	rows, err := tx.QueryContext(ctx, `SELECT id, `+t.keySQL+`, content_hash FROM `+t.name+` WHERE snapshot_id = ?`, snapshotID)
	if err != nil {
		return c, err
	}
	for rows.Next() {
		var s stored
		var key string
		if err := rows.Scan(&s.id, &key, &s.hash); err != nil {
			rows.Close()
			return c, err
		}
		existing[key] = s
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return c, err
	}

	cols := append(append([]string{}, t.keyCols...), t.valCols...)
	var insertSQL, updateSQL bytes.Buffer
	fmt.Fprintf(&insertSQL, "INSERT INTO %s (snapshot_id", t.name)
	for _, col := range cols {
		insertSQL.WriteString(", " + col)
	}
	insertSQL.WriteString(", content_hash) VALUES (?")
	for range cols {
		insertSQL.WriteString(", ?")
	}
	insertSQL.WriteString(", ?)")
	fmt.Fprintf(&updateSQL, "UPDATE %s SET ", t.name)
	for _, col := range t.valCols {
		updateSQL.WriteString(col + " = ?, ")
	}
	updateSQL.WriteString("content_hash = ? WHERE id = ?")
	insert, err := tx.PrepareContext(ctx, insertSQL.String())
	if err != nil {
		return c, err
	}
	defer insert.Close()
	update, err := tx.PrepareContext(ctx, updateSQL.String())
	if err != nil {
		return c, err
	}
	defer update.Close()

	seen := map[string]bool{}
	nKeys := len(t.keyCols)
	for _, r := range desired {
		if seen[r.key] {
			return c, errors.New("Prepared snapshot rows contain a duplicate key")
		}
		seen[r.key] = true
		cur, ok := existing[r.key]
		if !ok {
			args := append(append([]any{snapshotID}, r.values...), r.hash)
			if _, err := insert.ExecContext(ctx, args...); err != nil {
				return c, err
			}
			c.Created++
			continue
		}
		delete(existing, r.key)
		if cur.hash == r.hash {
			c.Unchanged++
			continue
		}
		args := append(append([]any{}, r.values[nKeys:]...), r.hash, cur.id)
		if _, err := update.ExecContext(ctx, args...); err != nil {
			return c, err
		}
		c.Updated++
	}
	for _, s := range existing {
		if _, err := tx.ExecContext(ctx, `DELETE FROM `+t.name+` WHERE id = ?`, s.id); err != nil {
			return c, err
		}
		c.Deleted++
	}
	return c, nil
}
