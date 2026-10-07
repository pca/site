package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"sort"

	"github.com/pca/backend/internal/db"
	"github.com/pca/backend/internal/jsonx"
	"github.com/pca/backend/internal/regions"
	"github.com/pca/backend/internal/timefmt"
)

const (
	metricNewAttendees      = "new_attendees"
	metricAttendances       = "attendances"
	metricActiveCompetitors = "active_competitors"
	metricPopularEvents     = "popular_events"

	officialFormat = "official"
)

var officialSingleEvents = []string{"333bf", "444bf", "555bf", "333mbf"}

const regionalEventMethodology = "Each region uses its five best national ranks for this event. Empty slots " +
	"use the worst national rank in the complete WCA export. Lower scores are " +
	"better, and equal scores use standard competition ranking."

const regionalRegionMethodology = "Each event uses its official WCA result type: averages for standard events " +
	"and Fewest Moves, and singles for blindfolded events and Multi-Blind. Every " +
	"event uses the same five-slot regional score. Events are ordered by the " +
	"region's placement, then official WCA event order."

var growthMethodology = map[string]string{
	metricNewAttendees: "A Filipino competitor counts in the year and host region of their " +
		"first-ever WCA competition, only when that first competition was in " +
		"the Philippines and its coordinates could be classified.",
	metricAttendances: "One Filipino competitor at one Philippine competition counts as one " +
		"confirmed competition attendance, regardless of events or rounds.",
	metricActiveCompetitors: "A Filipino competitor counts once per host region and year. The " +
		"nationwide value counts each person only once per year.",
	metricPopularEvents: "Event participation counts each competitor-event-competition once, " +
		"regardless of rounds. Unique competitors are reported separately.",
}

type snapshot struct {
	ID            int64
	ExportVersion string
	LatestYear    int
	ActivatedAt   db.Time
	coverage      map[string]json.RawMessage
}

type snapshotMeta struct {
	ID            int64   `json:"id"`
	ExportVersion string  `json:"export_version"`
	LatestYear    int     `json:"latest_year"`
	ActivatedAt   *string `json:"activated_at"`
}

func (s snapshot) meta() snapshotMeta {
	m := snapshotMeta{ID: s.ID, ExportVersion: s.ExportVersion, LatestYear: s.LatestYear}
	if s.ActivatedAt.Valid {
		v := timefmt.Encoder(s.ActivatedAt.Time)
		m.ActivatedAt = &v
	}
	return m
}

// section returns coverage[name] (or a nested key) normalized, or {}.
func (s snapshot) section(path ...string) json.RawMessage {
	empty := json.RawMessage(`{}`)
	cur := s.coverage
	for i, key := range path {
		raw, ok := cur[key]
		if !ok {
			return empty
		}
		if i == len(path)-1 {
			out, err := jsonx.Normalize(raw)
			if err != nil {
				return empty
			}
			return out
		}
		var next map[string]json.RawMessage
		if json.Unmarshal(raw, &next) != nil {
			return empty
		}
		cur = next
	}
	return empty
}

var errNoSnapshot = errors.New("no active snapshot")

func (s *Server) activeSnapshot(ctx context.Context) (*snapshot, error) {
	var snap snapshot
	var coverage string
	err := s.db.Read.QueryRowContext(ctx, `SELECT id, export_version, latest_year, activated_at, coverage
		FROM api_statisticssnapshot WHERE is_active = 1 AND status = 'ready' ORDER BY id LIMIT 1`).
		Scan(&snap.ID, &snap.ExportVersion, &snap.LatestYear, &snap.ActivatedAt, &coverage)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errNoSnapshot
	}
	if err != nil {
		return nil, err
	}
	if json.Unmarshal([]byte(coverage), &snap.coverage) != nil {
		snap.coverage = map[string]json.RawMessage{}
	}
	return &snap, nil
}

// statsResponse converts handler errors into {"detail": ...} responses.
func (s *Server) statsResponse(build func() (any, error)) ([]byte, int) {
	payload, err := build()
	if err != nil {
		var he *httpError
		switch {
		case errors.As(err, &he):
			return detailBody(he.detail), he.status
		case errors.Is(err, errNoSnapshot):
			return detailBody("Prepared statistics are not available yet."), http.StatusServiceUnavailable
		default:
			s.log.Error("statistics", "err", err)
			return detailBody("A server error occurred."), http.StatusInternalServerError
		}
	}
	body, err := marshal(payload)
	if err != nil {
		return detailBody("A server error occurred."), http.StatusInternalServerError
	}
	return body, http.StatusOK
}

type httpError struct {
	status int
	detail string
}

func (e *httpError) Error() string { return e.detail }

func badRequest(msg string) error { return &httpError{http.StatusBadRequest, msg} }
func notFound(msg string) error   { return &httpError{http.StatusNotFound, msg} }

// queryParam mirrors QueryDict.get: the last value of a repeated key.
func queryParam(r *http.Request, name string) (string, bool) {
	values := r.URL.Query()[name]
	if len(values) == 0 {
		return "", false
	}
	return values[len(values)-1], true
}

func rankType(r *http.Request, allowOfficial bool) (string, error) {
	value, ok := queryParam(r, "format")
	if !ok {
		value = "single"
	}
	if value == "single" || value == "average" || (allowOfficial && value == officialFormat) {
		return value, nil
	}
	if allowOfficial {
		return "", badRequest("format must be single, average, or official")
	}
	return "", badRequest("format must be single or average")
}

func regionName(code string) string {
	if n, ok := regions.Name(code); ok {
		return n
	}
	return code
}

type namedID struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type regionStrength struct {
	RegionID         string          `json:"region_id"`
	RegionName       string          `json:"region_name"`
	Placement        int             `json:"placement"`
	Score            int             `json:"score"`
	ContributorCount int             `json:"contributor_count"`
	Slots            json.RawMessage `json:"slots"`
}

type eventStrength struct {
	EventID          string          `json:"event_id"`
	EventName        string          `json:"event_name"`
	Format           string          `json:"format"`
	Placement        int             `json:"placement"`
	Score            int             `json:"score"`
	ContributorCount int             `json:"contributor_count"`
	Slots            json.RawMessage `json:"slots"`
}

func normalizedSlots(raw string) json.RawMessage {
	out, err := jsonx.Normalize([]byte(raw))
	if err != nil {
		return json.RawMessage(raw)
	}
	return out
}

func (s *Server) handleStrengthByEvent(w http.ResponseWriter, r *http.Request) {
	eventID := r.PathValue("event_id")
	format, hasFormat := queryParam(r, "format")
	key := "strength-event|" + eventID + "|" + format + "|" + boolKey(hasFormat)
	s.serveCached(w, r, key, func() ([]byte, int) {
		return s.statsResponse(func() (any, error) {
			rt, err := rankType(r, false)
			if err != nil {
				return nil, err
			}
			ev, ok := s.dataset.Load().Event(eventID)
			if !ok {
				return nil, notFound("Event not found.")
			}
			snap, err := s.activeSnapshot(r.Context())
			if err != nil {
				return nil, err
			}
			rows, err := s.db.Read.QueryContext(r.Context(), `SELECT region_code, placement, score, contributor_count, slots
				FROM api_regionalstrengthrecord WHERE snapshot_id = ? AND event_id = ? AND rank_type = ?
				ORDER BY placement, region_code`, snap.ID, eventID, rt)
			if err != nil {
				return nil, err
			}
			defer rows.Close()
			list := []regionStrength{}
			for rows.Next() {
				var rs regionStrength
				var slots string
				if err := rows.Scan(&rs.RegionID, &rs.Placement, &rs.Score, &rs.ContributorCount, &slots); err != nil {
					return nil, err
				}
				rs.RegionName = regionName(rs.RegionID)
				rs.Slots = normalizedSlots(slots)
				list = append(list, rs)
			}
			if err := rows.Err(); err != nil {
				return nil, err
			}
			if len(list) == 0 {
				return nil, notFound("No ranking list exists for this event and format.")
			}
			return struct {
				Snapshot    snapshotMeta     `json:"snapshot"`
				Event       namedID          `json:"event"`
				Format      string           `json:"format"`
				Methodology string           `json:"methodology"`
				Coverage    json.RawMessage  `json:"coverage"`
				Regions     []regionStrength `json:"regions"`
			}{snap.meta(), namedID{ev.ID, ev.Name}, rt, regionalEventMethodology,
				snap.section("regional_strength", rt+":"+ev.ID), list}, nil
		})
	})
}

func boolKey(b bool) string {
	if b {
		return "1"
	}
	return "0"
}

func (s *Server) handleStrengthByRegion(w http.ResponseWriter, r *http.Request) {
	regionID := r.PathValue("region_id")
	format, hasFormat := queryParam(r, "format")
	key := "strength-region|" + regionID + "|" + format + "|" + boolKey(hasFormat)
	s.serveCached(w, r, key, func() ([]byte, int) {
		return s.statsResponse(func() (any, error) {
			if !regions.Valid(regionID) {
				return nil, badRequest("Unknown region.")
			}
			rt, err := rankType(r, false)
			if err != nil {
				return nil, err
			}
			snap, err := s.activeSnapshot(r.Context())
			if err != nil {
				return nil, err
			}
			rows, err := s.db.Read.QueryContext(r.Context(), `SELECT k.event_id, e.name, k.rank_type, k.placement, k.score,
				k.contributor_count, k.slots FROM api_regionalstrengthrecord k JOIN wca_event e ON e.id = k.event_id
				WHERE k.snapshot_id = ? AND k.region_code = ? AND k.rank_type = ?
				ORDER BY k.placement, e.rank, e.name, k.event_id`, snap.ID, regionID, rt)
			if err != nil {
				return nil, err
			}
			defer rows.Close()
			events := []eventStrength{}
			for rows.Next() {
				var es eventStrength
				var slots string
				if err := rows.Scan(&es.EventID, &es.EventName, &es.Format, &es.Placement, &es.Score, &es.ContributorCount, &slots); err != nil {
					return nil, err
				}
				es.Slots = normalizedSlots(slots)
				events = append(events, es)
			}
			if err := rows.Err(); err != nil {
				return nil, err
			}
			if len(events) == 0 {
				return nil, notFound("No event strengths exist for this region and format.")
			}
			coverage := jsonx.NewObject()
			for _, es := range events {
				coverage.Set(es.EventID, snap.section("regional_strength", rt+":"+es.EventID))
			}
			return struct {
				Snapshot    snapshotMeta    `json:"snapshot"`
				Region      namedID         `json:"region"`
				Format      string          `json:"format"`
				Methodology string          `json:"methodology"`
				Coverage    *jsonx.Object   `json:"coverage"`
				Events      []eventStrength `json:"events"`
			}{snap.meta(), namedID{regionID, regionName(regionID)}, rt, regionalRegionMethodology, coverage, events}, nil
		})
	})
}

func (s *Server) handleStrengthRegions(w http.ResponseWriter, r *http.Request) {
	format, hasFormat := queryParam(r, "format")
	key := "strength-regions|" + format + "|" + boolKey(hasFormat)
	s.serveCached(w, r, key, func() ([]byte, int) {
		return s.statsResponse(func() (any, error) {
			rt, err := rankType(r, true)
			if err != nil {
				return nil, err
			}
			snap, err := s.activeSnapshot(r.Context())
			if err != nil {
				return nil, err
			}
			filter := `k.rank_type = ?`
			args := []any{snap.ID, rt}
			if rt == officialFormat {
				filter = `((k.rank_type = 'single' AND k.event_id IN (?, ?, ?, ?)) OR
					(k.rank_type = 'average' AND k.event_id NOT IN (?, ?, ?, ?)))`
				args = []any{snap.ID}
				for range 2 {
					for _, e := range officialSingleEvents {
						args = append(args, e)
					}
				}
			}
			rows, err := s.db.Read.QueryContext(r.Context(), `SELECT k.region_code, k.event_id, e.name, k.rank_type,
				k.placement, k.score, k.contributor_count, k.slots FROM api_regionalstrengthrecord k
				JOIN wca_event e ON e.id = k.event_id WHERE k.snapshot_id = ? AND `+filter+`
				ORDER BY k.region_code, k.placement, e.rank, e.name`, args...)
			if err != nil {
				return nil, err
			}
			defer rows.Close()
			grouped := map[string][]eventStrength{}
			for rows.Next() {
				var region, slots string
				var es eventStrength
				if err := rows.Scan(&region, &es.EventID, &es.EventName, &es.Format, &es.Placement, &es.Score, &es.ContributorCount, &slots); err != nil {
					return nil, err
				}
				es.Slots = normalizedSlots(slots)
				grouped[region] = append(grouped[region], es)
			}
			if err := rows.Err(); err != nil {
				return nil, err
			}
			type group struct {
				Region namedID         `json:"region"`
				Events []eventStrength `json:"events"`
			}
			groups := make([]group, 0, len(regions.Regions))
			for _, reg := range regions.Regions {
				events := grouped[reg.ID]
				if events == nil {
					events = []eventStrength{}
				}
				groups = append(groups, group{namedID{reg.ID, reg.Name}, events})
			}
			return struct {
				Snapshot    snapshotMeta `json:"snapshot"`
				Format      string       `json:"format"`
				Methodology string       `json:"methodology"`
				Regions     []group      `json:"regions"`
			}{snap.meta(), rt, regionalRegionMethodology, groups}, nil
		})
	})
}

type annualValue struct {
	Year          int            `json:"year"`
	Value         int            `json:"value"`
	Change        *int           `json:"change"`
	PercentChange *jsonx.PyFloat `json:"percent_change"`
}

type growthSeries struct {
	RegionID   string        `json:"region_id"`
	RegionName string        `json:"region_name"`
	Values     []annualValue `json:"values"`
}

func (s *Server) handleGrowth(metric string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		s.serveCached(w, r, "growth|"+metric, func() ([]byte, int) {
			return s.statsResponse(func() (any, error) {
				snap, err := s.activeSnapshot(r.Context())
				if err != nil {
					return nil, err
				}
				rows, err := s.db.Read.QueryContext(r.Context(), `SELECT region_code, year, value FROM api_growthannualrecord
					WHERE snapshot_id = ? AND metric = ? AND event_id = '' ORDER BY year`, snap.ID, metric)
				if err != nil {
					return nil, err
				}
				defer rows.Close()
				byRegion := map[string][]annualValue{}
				for rows.Next() {
					var region string
					var v annualValue
					if err := rows.Scan(&region, &v.Year, &v.Value); err != nil {
						return nil, err
					}
					byRegion[region] = append(byRegion[region], v)
				}
				if err := rows.Err(); err != nil {
					return nil, err
				}
				scopes := append([]string{""}, regions.IDs()...)
				series := make([]growthSeries, 0, len(scopes))
				for _, code := range scopes {
					values := byRegion[code]
					if values == nil {
						values = []annualValue{}
					}
					for i := 1; i < len(values); i++ {
						change := values[i].Value - values[i-1].Value
						values[i].Change = &change
						if prev := values[i-1].Value; prev != 0 {
							pct := jsonx.PyFloat(float64(change) * 100.0 / float64(prev))
							values[i].PercentChange = &pct
						}
					}
					id, name := code, regionName(code)
					if code == "" {
						id, name = "national", "Nationwide"
					}
					series = append(series, growthSeries{id, name, values})
				}
				return struct {
					Snapshot    snapshotMeta    `json:"snapshot"`
					Metric      string          `json:"metric"`
					Methodology string          `json:"methodology"`
					Coverage    json.RawMessage `json:"coverage"`
					Series      []growthSeries  `json:"series"`
				}{snap.meta(), metric, growthMethodology[metric], snap.section("growth"), series}, nil
			})
		})
	}
}

type popularValue struct {
	Year              int  `json:"year"`
	Participations    int  `json:"participations"`
	UniqueCompetitors *int `json:"unique_competitors"`
}

type popularSeries struct {
	EventID   string         `json:"event_id"`
	EventName string         `json:"event_name"`
	Values    []popularValue `json:"values"`
}

func (s *Server) handlePopularEvents(w http.ResponseWriter, r *http.Request) {
	requested, ok := queryParam(r, "region")
	if !ok {
		requested = "national"
	}
	s.serveCached(w, r, "popular|"+requested, func() ([]byte, int) {
		return s.statsResponse(func() (any, error) {
			var regionCode, scopeName string
			switch {
			case requested == "national":
				scopeName = "Nationwide"
			case regions.Valid(requested):
				regionCode, scopeName = requested, regionName(requested)
			default:
				return nil, badRequest("region must be national or a valid region ID")
			}
			snap, err := s.activeSnapshot(r.Context())
			if err != nil {
				return nil, err
			}
			rows, err := s.db.Read.QueryContext(r.Context(), `SELECT event_id, year, value, unique_competitors
				FROM api_growthannualrecord WHERE snapshot_id = ? AND metric = ? AND region_code = ?
				ORDER BY event_id, year`, snap.ID, metricPopularEvents, regionCode)
			if err != nil {
				return nil, err
			}
			defer rows.Close()
			ds := s.dataset.Load()
			var events []popularSeries
			index := map[string]int{}
			for rows.Next() {
				var eventID string
				var v popularValue
				var unique sql.NullInt64
				if err := rows.Scan(&eventID, &v.Year, &v.Participations, &unique); err != nil {
					return nil, err
				}
				if unique.Valid {
					n := int(unique.Int64)
					v.UniqueCompetitors = &n
				}
				i, ok := index[eventID]
				if !ok {
					ev, known := ds.Event(eventID)
					if !known {
						continue
					}
					i = len(events)
					index[eventID] = i
					events = append(events, popularSeries{EventID: eventID, EventName: ev.Name})
				}
				events[i].Values = append(events[i].Values, v)
			}
			if err := rows.Err(); err != nil {
				return nil, err
			}
			sort.SliceStable(events, func(a, b int) bool {
				ea, _ := ds.Event(events[a].EventID)
				eb, _ := ds.Event(events[b].EventID)
				if ea.Rank != eb.Rank {
					return ea.Rank < eb.Rank
				}
				if ea.Name != eb.Name {
					return ea.Name < eb.Name
				}
				return ea.ID < eb.ID
			})
			if events == nil {
				events = []popularSeries{}
			}
			return struct {
				Snapshot    snapshotMeta    `json:"snapshot"`
				Scope       namedID         `json:"scope"`
				Metric      string          `json:"metric"`
				Methodology string          `json:"methodology"`
				Coverage    json.RawMessage `json:"coverage"`
				Events      []popularSeries `json:"events"`
			}{snap.meta(), namedID{requested, scopeName}, metricPopularEvents, growthMethodology[metricPopularEvents],
				snap.section("growth"), events}, nil
		})
	})
}
