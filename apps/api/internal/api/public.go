package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/pca/backend/internal/jsonx"
	"github.com/pca/backend/internal/rankings"
	"github.com/pca/backend/internal/regions"
	"github.com/pca/backend/internal/store"
	"github.com/pca/backend/internal/timefmt"
	"github.com/pca/backend/internal/wcaformat"
)

func marshal(v any) ([]byte, error) { return jsonx.Marshal(v) }

var (
	regionsJSON = jsonx.MustMarshal(regions.Regions)
	zonesJSON   = jsonx.MustMarshal(regions.Zones)
)

func (s *Server) handleRegions(w http.ResponseWriter, r *http.Request) {
	s.serveCached(w, r, "regions", func() ([]byte, int) { return regionsJSON, http.StatusOK })
}

func (s *Server) handleZones(w http.ResponseWriter, r *http.Request) {
	s.serveCached(w, r, "zones", func() ([]byte, int) { return zonesJSON, http.StatusOK })
}

func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	s.serveCached(w, r, "events", func() ([]byte, int) { return s.dataset.Load().EventsJSON, http.StatusOK })
}

const defaultLimit = 100

// pyInt parses a query integer for ASCII input: surrounding whitespace, an
// optional sign, and single underscores between digits.
// Values outside int64 report n < 0, as the database cannot bind them.
func pyInt(s string) (int, bool) {
	s = strings.TrimSpace(s)
	neg := false
	if s != "" && (s[0] == '+' || s[0] == '-') {
		neg = s[0] == '-'
		s = s[1:]
	}
	if s == "" || s[0] == '_' || s[len(s)-1] == '_' || strings.Contains(s, "__") {
		return 0, false
	}
	n, overflow := 0, false
	for _, c := range s {
		if c == '_' {
			continue
		}
		if c < '0' || c > '9' {
			return 0, false
		}
		d := int(c - '0')
		if n > (math.MaxInt64-d)/10 {
			overflow = true
			continue
		}
		n = n*10 + d
	}
	if overflow {
		return -1, true
	}
	if neg {
		n = -n
	}
	return n, true
}

func (s *Server) handleRanking(scope string, kind rankings.Kind) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		eventID := r.PathValue("event_id")
		scopeID := r.PathValue("region_id") + r.PathValue("zone_id")
		ds := s.dataset.Load()
		if _, ok := ds.Event(eventID); !ok {
			writeDetail(w, http.StatusNotFound, "Event not found.")
			return
		}
		var regionIDs []string
		switch scope {
		case "regional":
			regionIDs = []string{scopeID}
		case "zonal":
			ids, ok := regions.ZoneRegions[scopeID]
			if !ok {
				writeDetail(w, http.StatusBadRequest, "Invalid zone. Valid zones are: "+strings.Join(regions.ZoneIDs(), ", "))
				return
			}
			regionIDs = ids
		}
		limit := defaultLimit
		if values := r.URL.Query()["limit"]; len(values) > 0 {
			n, ok := pyInt(values[len(values)-1])
			switch {
			case !ok:
				writeDetail(w, http.StatusBadRequest, "Invalid limit")
				return
			case n < 0:
				// The contract answers negative and out-of-range limits with a 500.
				writeServerError(w)
				return
			}
			limit = n
		}
		key := "rank|" + scope + "|" + scopeID + "|" + eventID + "|" + strconv.Itoa(int(kind)) + "|" + strconv.Itoa(limit)
		s.serveCached(w, r, key, func() ([]byte, int) {
			return ds.Render(s.regions.Load(), eventID, kind, regionIDs, limit), http.StatusOK
		})
	}
}

// Persons.

type rankResult struct {
	Best          *string `json:"best"`
	WorldRank     int     `json:"world_rank"`
	ContinentRank int     `json:"continent_rank"`
	CountryRank   int     `json:"country_rank"`
}

func (s *Server) handlePerson(w http.ResponseWriter, r *http.Request) {
	wcaID := r.PathValue("wca_id")
	s.serveCached(w, r, "person|"+wcaID, func() ([]byte, int) {
		body, err := s.buildPerson(r.Context(), wcaID)
		if errors.Is(err, store.ErrNotFound) {
			return detailBody("Not found."), http.StatusNotFound
		}
		if err != nil {
			s.log.Error("person", "wca_id", wcaID, "err", err)
			return detailBody("A server error occurred."), http.StatusInternalServerError
		}
		return body, http.StatusOK
	})
}

func (s *Server) buildPerson(ctx context.Context, wcaID string) ([]byte, error) {
	q := s.db.Read
	var name, country, gender sql.NullString
	err := q.QueryRowContext(ctx, `SELECT name, country_id, gender FROM wca_person WHERE id = ? ORDER BY subid DESC LIMIT 1`, wcaID).
		Scan(&name, &country, &gender)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, store.ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	var competitionCount int
	if err := q.QueryRowContext(ctx, `SELECT COUNT(*) FROM (SELECT DISTINCT competition_id FROM wca_result WHERE person_id = ?)`, wcaID).
		Scan(&competitionCount); err != nil {
		return nil, err
	}

	var solves, nrS, nrA, wrS, wrA, crS, crA, gold, silver, bronze int
	err = q.QueryRowContext(ctx, `SELECT
		COALESCE(SUM(r.value1 > 0) + SUM(r.value2 > 0) + SUM(r.value3 > 0) + SUM(r.value4 > 0) + SUM(r.value5 > 0), 0),
		COALESCE(SUM(r.regional_single_record = 'NR'), 0),
		COALESCE(SUM(r.regional_average_record = 'NR'), 0),
		COALESCE(SUM(r.regional_single_record = 'WR'), 0),
		COALESCE(SUM(r.regional_average_record = 'WR'), 0),
		COALESCE(SUM(r.regional_single_record IS NOT NULL AND r.regional_single_record NOT IN ('NR', 'WR')), 0),
		COALESCE(SUM(r.regional_average_record IS NOT NULL AND r.regional_average_record NOT IN ('NR', 'WR')), 0),
		COALESCE(SUM(rt.final = 1 AND r.best > 0 AND r.pos = 1), 0),
		COALESCE(SUM(rt.final = 1 AND r.best > 0 AND r.pos = 2), 0),
		COALESCE(SUM(rt.final = 1 AND r.best > 0 AND r.pos = 3), 0)
		FROM wca_result r LEFT JOIN wca_roundtype rt ON rt.id = r.round_type_id WHERE r.person_id = ?`, wcaID).
		Scan(&solves, &nrS, &nrA, &wrS, &wrA, &crS, &crA, &gold, &silver, &bronze)
	if err != nil {
		return nil, err
	}

	records := jsonx.NewObject()
	for _, table := range []struct {
		name    string
		key     string
		average bool
	}{{"wca_rankssingle", "single", false}, {"wca_ranksaverage", "average", true}} {
		rows, err := q.QueryContext(ctx, `SELECT k.event_id, e.format, k.best, k.world_rank, k.continent_rank, k.country_rank
			FROM `+table.name+` k JOIN wca_event e ON e.id = k.event_id WHERE k.person_id = ? ORDER BY e.rank, k.id`, wcaID)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var eventID, format string
			var best sql.NullInt64
			var rr rankResult
			if err := rows.Scan(&eventID, &format, &best, &rr.WorldRank, &rr.ContinentRank, &rr.CountryRank); err != nil {
				rows.Close()
				return nil, err
			}
			if best.Valid {
				rr.Best = wcaformat.Value(int(best.Int64), format, table.average)
			}
			obj, ok := records.Get(eventID)
			if !ok {
				obj = jsonx.NewObject()
				records.Set(eventID, obj)
			}
			obj.(*jsonx.Object).Set(table.key, rr)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}

	avatar, err := store.AvatarJSON(ctx, q, wcaID)
	if err != nil {
		return nil, err
	}
	var avatarValue any
	if avatar != nil {
		avatarValue = json.RawMessage(avatar)
	}

	genderValue := any(nil)
	if gender.Valid {
		switch gender.String {
		case "m":
			genderValue = "Male"
		case "f":
			genderValue = "Female"
		default:
			genderValue = gender.String
		}
	}

	national, world, continental := nrS+nrA, wrS+wrA, crS+crA
	payload := struct {
		ID      string  `json:"id"`
		Name    *string `json:"name"`
		Country *string `json:"country"`
		Gender  any     `json:"gender"`
		Avatar  any     `json:"avatar"`
		Career  any     `json:"career"`
	}{
		ID:      wcaID,
		Name:    nullable(name),
		Country: nullable(country),
		Gender:  genderValue,
		Avatar:  avatarValue,
		Career: struct {
			CompetitionCount int           `json:"competition_count"`
			SolveCount       int           `json:"solve_count"`
			PersonalRecords  *jsonx.Object `json:"personal_records"`
			Records          any           `json:"records"`
			Medals           any           `json:"medals"`
		}{
			CompetitionCount: competitionCount,
			SolveCount:       solves,
			PersonalRecords:  records,
			Records: struct {
				National    int `json:"national"`
				Continental int `json:"continental"`
				World       int `json:"world"`
				Total       int `json:"total"`
			}{national, continental, world, national + continental + world},
			Medals: struct {
				Gold   int `json:"gold"`
				Silver int `json:"silver"`
				Bronze int `json:"bronze"`
				Total  int `json:"total"`
			}{gold, silver, bronze, gold + silver + bronze},
		},
	}
	return marshal(payload)
}

func nullable(s sql.NullString) *string {
	if !s.Valid {
		return nil
	}
	return &s.String
}

// News (Facebook page feed, cached for 10 minutes like cache_page).

type newsCache struct {
	mu      sync.Mutex
	body    []byte
	expires time.Time
}

const newsTTL = 10 * time.Minute

func (s *Server) handleNews(w http.ResponseWriter, r *http.Request) {
	s.news.mu.Lock()
	if s.news.body == nil || time.Now().After(s.news.expires) {
		s.news.body = s.fetchNews(r.Context())
		s.news.expires = time.Now().Add(newsTTL)
	}
	body, expires := s.news.body, s.news.expires
	s.news.mu.Unlock()

	w.Header().Set("Cache-Control", "max-age="+strconv.Itoa(int(time.Until(expires).Seconds())))
	w.Header().Set("Expires", expires.UTC().Format(http.TimeFormat))
	writeJSON(w, r, http.StatusOK, body, true)
}

type fbPost struct {
	FullPicture  *string `json:"full_picture"`
	Message      *string `json:"message"`
	CreatedTime  *string `json:"created_time"`
	PermalinkURL *string `json:"permalink_url"`
	From         *struct {
		Name *string `json:"name"`
	} `json:"from"`
}

type newsItem struct {
	FromName  *string `json:"from_name"`
	Message   *string `json:"message"`
	Image     *string `json:"image"`
	Permalink *string `json:"permalink"`
	CreatedAt *string `json:"created_at"`
}

func (s *Server) fetchNews(ctx context.Context) []byte {
	empty := []byte("[]")
	u := "https://graph.facebook.com/v10.0/" + url.PathEscape(s.cfg.FBPageID) + "/feed?" + url.Values{
		"fields":       {"full_picture,message,created_time,permalink_url,from"},
		"access_token": {s.cfg.FBPageToken},
		"limit":        {s.cfg.FBPageFeedLimit},
	}.Encode()
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return empty
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		s.log.Warn("news fetch failed", "err", err)
		return empty
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return empty
	}
	var feed struct {
		Data []fbPost `json:"data"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 8<<20)).Decode(&feed); err != nil {
		return empty
	}
	items := make([]newsItem, 0, len(feed.Data))
	valid := true
	for _, p := range feed.Data {
		item := newsItem{Message: p.Message, Image: p.FullPicture, Permalink: p.PermalinkURL, CreatedAt: p.CreatedTime}
		if p.From != nil {
			item.FromName = p.From.Name
		}
		if item.FromName == nil || item.Message == nil || item.Image == nil || item.Permalink == nil || item.CreatedAt == nil {
			valid = false
		}
		items = append(items, item)
	}
	// Timestamps are only normalized when every post validates; otherwise
	// the feed is returned unchanged.
	if valid {
		for i := range items {
			t, err := parseFBTime(*items[i].CreatedAt)
			if err != nil {
				valid = false
				break
			}
			formatted := timefmt.Serializer(t)
			items[i].CreatedAt = &formatted
		}
	}
	if !valid {
		for i, p := range feed.Data {
			items[i].CreatedAt = p.CreatedTime
		}
	}
	body, err := marshal(items)
	if err != nil {
		return empty
	}
	return body
}

func parseFBTime(s string) (time.Time, error) {
	for _, layout := range []string{"2006-01-02T15:04:05-0700", time.RFC3339Nano, "2006-01-02T15:04:05.999999999-0700"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, errors.New("invalid time")
}
