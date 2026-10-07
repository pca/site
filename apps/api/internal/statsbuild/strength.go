package statsbuild

import (
	"cmp"
	"database/sql"
	"fmt"
	"slices"

	"github.com/pca/backend/internal/regions"
)

const (
	teamSize               = 5
	currentEventRankCutoff = 990
	rankSingle             = "single"
	rankAverage            = "average"
)

var rankTables = []struct{ rankType, table string }{
	{rankSingle, "wca_rankssingle"},
	{rankAverage, "wca_ranksaverage"},
}

type rankRow struct {
	personID sql.NullString
	name     sql.NullString
	rank     int
}

type rankedCompetitor struct {
	wcaID, name, region string
	rank                int
}

type slot struct {
	WCAID        *string `json:"wca_id"`
	Name         *string `json:"name"`
	NationalRank int     `json:"national_rank"`
	IsPenalty    bool    `json:"is_penalty"`
}

type regionStrength struct {
	region       string
	score        int
	placement    int
	contributors int
	slots        []slot
}

type matchCoverage struct {
	RankedCompetitors   int `json:"ranked_competitors"`
	MatchedHomeRegion   int `json:"matched_home_region"`
	MissingHomeRegion   int `json:"missing_home_region"`
	AmbiguousHomeRegion int `json:"ambiguous_home_region"`
}

// homeRegions resolves each WCA ID to its single PCA region; IDs mapped to
// several regions are ambiguous.
type homeRegions struct {
	resolved  map[string]string
	ambiguous map[string]bool
}

func newHomeRegions(pairs [][2]string) homeRegions {
	sets := map[string]map[string]bool{}
	for _, p := range pairs {
		if p[1] == "" {
			continue
		}
		if sets[p[0]] == nil {
			sets[p[0]] = map[string]bool{}
		}
		sets[p[0]][p[1]] = true
	}
	h := homeRegions{resolved: map[string]string{}, ambiguous: map[string]bool{}}
	for id, set := range sets {
		if len(set) == 1 {
			for r := range set {
				h.resolved[id] = r
			}
		} else {
			h.ambiguous[id] = true
		}
	}
	return h
}

// eventInputs mirrors load_event_strength_inputs for rows already ordered by
// (country_rank, person_id).
func eventInputs(rows []rankRow, home homeRegions) ([]rankedCompetitor, int, matchCoverage) {
	var cov matchCoverage
	if len(rows) == 0 {
		return nil, 0, cov
	}
	worst := 0
	ids := map[string]bool{}
	nullSeen := false
	var entries []rankedCompetitor
	matched := map[string]bool{}
	for _, r := range rows {
		worst = max(worst, r.rank)
		if !r.personID.Valid {
			nullSeen = true
			continue
		}
		id := r.personID.String
		ids[id] = true
		region, ok := home.resolved[id]
		if !ok {
			continue
		}
		name := id
		if r.name.Valid && r.name.String != "" {
			name = r.name.String
		}
		entries = append(entries, rankedCompetitor{wcaID: id, name: name, region: region, rank: r.rank})
		matched[id] = true
	}
	cov.RankedCompetitors = len(ids)
	if nullSeen {
		cov.RankedCompetitors++
	}
	cov.MatchedHomeRegion = len(matched)
	ambiguous := 0
	for id := range ids {
		if home.ambiguous[id] {
			ambiguous++
		}
	}
	missing := 0
	for id := range ids {
		if _, ok := home.resolved[id]; !ok && !home.ambiguous[id] {
			missing++
		}
	}
	if nullSeen {
		missing++
	}
	cov.MissingHomeRegion = missing
	cov.AmbiguousHomeRegion = ambiguous
	return entries, worst, cov
}

func calculateEventStrength(entries []rankedCompetitor, worst int) ([]regionStrength, error) {
	if worst <= 0 {
		return nil, fmt.Errorf("National ranks must be positive integers")
	}
	best := map[string]rankedCompetitor{}
	order := []string{}
	for _, e := range entries {
		if e.rank <= 0 {
			return nil, fmt.Errorf("National ranks must be positive integers")
		}
		cur, ok := best[e.wcaID]
		if !ok {
			order = append(order, e.wcaID)
		}
		if !ok || e.rank < cur.rank || (e.rank == cur.rank && (e.name < cur.name || (e.name == cur.name && e.region < cur.region))) {
			best[e.wcaID] = e
		}
	}
	grouped := map[string][]rankedCompetitor{}
	for _, id := range order {
		e := best[id]
		if !regions.Valid(e.region) {
			return nil, fmt.Errorf("Ranked competitor uses an unknown region code")
		}
		if e.rank > worst {
			return nil, fmt.Errorf("National rank cannot exceed the full-export worst rank")
		}
		grouped[e.region] = append(grouped[e.region], e)
	}
	results := make([]regionStrength, 0, len(regions.Regions))
	for _, reg := range regions.Regions {
		list := grouped[reg.ID]
		slices.SortStableFunc(list, func(a, b rankedCompetitor) int {
			return cmp.Or(cmp.Compare(a.rank, b.rank), cmp.Compare(a.wcaID, b.wcaID))
		})
		if len(list) > teamSize {
			list = list[:teamSize]
		}
		rs := regionStrength{region: reg.ID, contributors: len(list)}
		for _, e := range list {
			id, name := e.wcaID, e.name
			rs.slots = append(rs.slots, slot{WCAID: &id, Name: &name, NationalRank: e.rank})
		}
		for len(rs.slots) < teamSize {
			rs.slots = append(rs.slots, slot{NationalRank: worst, IsPenalty: true})
		}
		for _, s := range rs.slots {
			rs.score += s.NationalRank
		}
		results = append(results, rs)
	}
	slices.SortStableFunc(results, func(a, b regionStrength) int {
		return cmp.Or(cmp.Compare(a.score, b.score), cmp.Compare(a.region, b.region))
	})
	prevScore, prevPlacement := -1, 0
	for i := range results {
		placement := i + 1
		if i > 0 && results[i].score == prevScore {
			placement = prevPlacement
		}
		results[i].placement = placement
		prevScore, prevPlacement = results[i].score, placement
	}
	return results, nil
}
