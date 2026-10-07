package statsbuild

import (
	"fmt"
	"slices"
	"strconv"

	"github.com/pca/backend/internal/jsonx"
	"github.com/pca/backend/internal/regions"
)

const (
	startYear     = 2007
	nationalScope = ""
	philippines   = "Philippines"

	metricNewAttendees      = "new_attendees"
	metricAttendances       = "attendances"
	metricActiveCompetitors = "active_competitors"
	metricPopularEvents     = "popular_events"
)

type participation struct {
	personID, competitionID string
	year, month, day        int
	countryID               string
	region                  *string
	eventID                 string
}

type growthValue struct {
	metric            string
	year              int
	region            string
	eventID           string
	value             int
	uniqueCompetitors *int
}

type scopeYear struct {
	region string
	year   int
}

type scopeYearEvent struct {
	region  string
	year    int
	eventID string
}

type set map[string]struct{}

func (s set) add(k string) { s[k] = struct{}{} }

func addTo[K comparable](m map[K]set, k K, v string) {
	s := m[k]
	if s == nil {
		s = set{}
		m[k] = s
	}
	s.add(v)
}

func lessCompetition(a, b participation) bool {
	if a.year != b.year {
		return a.year < b.year
	}
	if a.month != b.month {
		return a.month < b.month
	}
	if a.day != b.day {
		return a.day < b.day
	}
	return a.competitionID < b.competitionID
}

func calculateGrowth(rows []participation, eventIDs []string, latestYear int) ([]growthValue, *jsonx.Object, error) {
	if latestYear < startYear {
		return nil, nil, fmt.Errorf("Latest year cannot be earlier than the history start year")
	}
	validEvents := map[string]bool{}
	for _, e := range eventIDs {
		validEvents[e] = true
	}
	kept := rows[:0:0]
	for _, r := range rows {
		if r.personID == "" || r.competitionID == "" {
			continue
		}
		if !validEvents[r.eventID] {
			return nil, nil, fmt.Errorf("Participation uses an unknown event ID")
		}
		if r.region != nil && !regions.Valid(*r.region) {
			return nil, nil, fmt.Errorf("Participation uses an unknown region code")
		}
		kept = append(kept, r)
	}

	first := map[string]participation{}
	for _, r := range kept {
		cur, ok := first[r.personID]
		if !ok || lessCompetition(r, cur) {
			first[r.personID] = r
		}
	}
	newAttendees := map[scopeYear]set{}
	unclassifiedNew := map[int]set{}
	for person, f := range first {
		if f.countryID != philippines {
			continue
		}
		if f.region == nil {
			addTo(unclassifiedNew, f.year, person)
			continue
		}
		addTo(newAttendees, scopeYear{nationalScope, f.year}, person)
		addTo(newAttendees, scopeYear{*f.region, f.year}, person)
	}

	attendances := map[scopeYear]set{}
	active := map[scopeYear]set{}
	popular := map[scopeYearEvent]set{}
	popularPeople := map[scopeYearEvent]set{}
	assigned := set{}
	unclassified := set{}
	for _, r := range kept {
		if r.countryID != philippines {
			continue
		}
		attendance := r.personID + "\x00" + r.competitionID
		addTo(attendances, scopeYear{nationalScope, r.year}, attendance)
		addTo(active, scopeYear{nationalScope, r.year}, r.personID)
		addTo(popular, scopeYearEvent{nationalScope, r.year, r.eventID}, attendance)
		addTo(popularPeople, scopeYearEvent{nationalScope, r.year, r.eventID}, r.personID)
		comp := r.competitionID + "\x00" + strconv.Itoa(r.year)
		if r.region == nil {
			unclassified.add(comp)
			continue
		}
		assigned.add(comp)
		addTo(attendances, scopeYear{*r.region, r.year}, attendance)
		addTo(active, scopeYear{*r.region, r.year}, r.personID)
		addTo(popular, scopeYearEvent{*r.region, r.year, r.eventID}, attendance)
		addTo(popularPeople, scopeYearEvent{*r.region, r.year, r.eventID}, r.personID)
	}

	scopes := append([]string{nationalScope}, regions.IDs()...)
	var out []growthValue
	standard := func(metric string, values map[scopeYear]set) {
		for year := startYear; year <= latestYear; year++ {
			for _, scope := range scopes {
				out = append(out, growthValue{metric: metric, year: year, region: scope, value: len(values[scopeYear{scope, year}])})
			}
		}
	}
	standard(metricNewAttendees, newAttendees)
	standard(metricAttendances, attendances)
	standard(metricActiveCompetitors, active)
	for year := startYear; year <= latestYear; year++ {
		for _, scope := range scopes {
			for _, e := range eventIDs {
				k := scopeYearEvent{scope, year, e}
				unique := len(popularPeople[k])
				out = append(out, growthValue{metric: metricPopularEvents, year: year, region: scope, eventID: e,
					value: len(popular[k]), uniqueCompetitors: &unique})
			}
		}
	}

	years := make([]int, 0, len(unclassifiedNew))
	for y := range unclassifiedNew {
		years = append(years, y)
	}
	slices.Sort(years)
	byYear := jsonx.NewObject()
	for _, y := range years {
		byYear.Set(strconv.Itoa(y), len(unclassifiedNew[y]))
	}
	cov := jsonx.NewObject()
	cov.Set("assigned_competitions", len(assigned))
	cov.Set("unclassified_competitions", len(unclassified))
	cov.Set("new_attendees_unclassified", byYear)
	return out, cov, nil
}
