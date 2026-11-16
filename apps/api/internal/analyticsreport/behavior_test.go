package analyticsreport

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestBehaviorQueryBounds(t *testing.T) {
	for _, raw := range []string{"kind=journeys", "kind=retention&days=28&device=tablet", "kind=journeys&funnel=rankings_statistics&days=7&device=mobile"} {
		v, _ := url.ParseQuery(raw)
		if _, err := ParseBehaviorQuery(v); err != nil {
			t.Fatal(raw, err)
		}
	}
	for _, raw := range []string{"kind=paths", "kind=journeys&funnel=checkout", "kind=retention&funnel=region", "kind=journeys&days=365", "kind=retention&device=email", "kind=retention&property=123", "kind=journeys&days=7&days=28"} {
		v, _ := url.ParseQuery(raw)
		if _, err := ParseBehaviorQuery(v); err == nil {
			t.Fatal("accepted", raw)
		}
	}
}
func TestBehaviorContracts(t *testing.T) {
	var calls atomic.Int32
	c := fakeClient(t, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		var body map[string]json.RawMessage
		if json.NewDecoder(r.Body).Decode(&body) != nil {
			t.Error("bad body")
			return
		}
		if !strings.Contains(string(body["dimensionFilter"]), "pinoycubers.org") {
			t.Error("missing host filter")
		}
		if strings.HasSuffix(r.URL.Path, ":runFunnelReport") {
			var funnel struct {
				IsOpen bool `json:"isOpenFunnel"`
				Steps  []struct {
					Name     string `json:"name"`
					Duration string `json:"withinDurationFromPriorStep"`
				} `json:"steps"`
			}
			if json.Unmarshal(body["funnel"], &funnel) != nil || funnel.IsOpen || len(funnel.Steps) < 2 {
				t.Error("bad funnel")
			}
			rows := []Row{}
			for i, s := range funnel.Steps {
				if i > 0 && s.Duration != "1800s" {
					t.Error("missing bounded step window")
				}
				rows = append(rows, Row{DimensionValues: []Value{{Value: string(rune('1'+i)) + ". " + s.Name}}, MetricValues: []Value{{Value: []string{"100", "70", "50", "20"}[i]}}})
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"funnelTable": Table{DimensionHeaders: []Column{{"funnelStepName"}}, MetricHeaders: []Column{{"activeUsers"}}, Rows: rows}})
			return
		}
		var dimensions, metrics []Column
		_ = json.Unmarshal(body["dimensions"], &dimensions)
		_ = json.Unmarshal(body["metrics"], &metrics)
		if _, ok := body["cohortSpec"]; ok {
			if _, ok := body["dateRanges"]; ok {
				t.Error("cohort dateRanges must be absent")
			}
			rows := []Row{}
			for g := 0; g < 6; g++ {
				for week := 0; week < 5; week++ {
					rows = append(rows, Row{DimensionValues: []Value{{Value: "start_" + string(rune('0'+g))}, {Value: "000" + string(rune('0'+week))}}, MetricValues: []Value{{"20"}, {"100"}}})
				}
			}
			_ = json.NewEncoder(w).Encode(Table{DimensionHeaders: dimensions, MetricHeaders: metrics, Rows: rows, RowCount: len(rows), Metadata: Metadata{TimeZone: "Asia/Manila"}})
			return
		}
		values := []Value{}
		for range dimensions {
			values = append(values, Value{"/regional-rankings"})
		}
		_ = json.NewEncoder(w).Encode(Table{DimensionHeaders: dimensions, MetricHeaders: metrics, Rows: []Row{{DimensionValues: values, MetricValues: []Value{{"100"}, {"70"}, {"80"}, {"120"}}}}, RowCount: 1, Metadata: Metadata{TimeZone: "Asia/Manila"}})
	})
	results := []BehaviorResult{}
	for _, device := range []string{"all", "mobile", "desktop", "tablet"} {
		for _, days := range []int{7, 28} {
			for _, funnel := range []string{"region", "rankings_statistics"} {
				q := BehaviorQuery{Kind: "journeys", Device: device, Days: days, Funnel: funnel}
				result, err := c.Behavior(context.Background(), q)
				if err != nil {
					t.Fatal(q, err)
				}
				if len(result.Steps) != len(funnelDefinitions(funnel)) || result.Limited {
					t.Fatal(result)
				}
				results = append(results, result)
				old := calls.Load()
				cached, err := c.Behavior(context.Background(), q)
				if err != nil || !cached.Cached || calls.Load() != old {
					t.Fatal("cache missed", err)
				}
			}
		}
		q := BehaviorQuery{Kind: "retention", Device: device, Days: 28}
		result, err := c.Behavior(context.Background(), q)
		if err != nil {
			t.Fatal(err)
		}
		if result.Start != "2026-09-06" || result.End != "2026-10-22" || len(result.Cohorts) != 6 || result.Cohorts[5].Counts[1] != nil || result.Cohorts[0].Counts[4] == nil {
			t.Fatal("wrong complete weeks", result)
		}
		results = append(results, result)
	}
	if len(results) != 20 {
		t.Fatal(len(results))
	}
	if output := os.Getenv("PCA_ANALYTICS_BEHAVIOR_OUTPUT"); output != "" {
		data, err := json.Marshal(results)
		if err != nil {
			t.Fatal(err)
		}
		if err = os.WriteFile(output, data, 0600); err != nil {
			t.Fatal(err)
		}
	}
}
func TestBehaviorMalformedAndMissingRows(t *testing.T) {
	q := BehaviorQuery{Kind: "journeys", Device: "all", Funnel: "region", Days: 28}
	table := Table{MetricHeaders: []Column{{"activeUsers"}}, Rows: []Row{{DimensionValues: []Value{{"1. Prompt visible"}}, MetricValues: []Value{{"10"}}}}}
	steps, limited, err := extractFunnel(table, q)
	if err != nil || !limited || steps[1].Users != nil {
		t.Fatal("missing rows became zero", err)
	}
	for _, row := range []Row{{DimensionValues: []Value{{"2. Unknown"}}, MetricValues: []Value{{"5"}}}, {DimensionValues: []Value{{"2. WCA login started"}}, MetricValues: []Value{{"11"}}}, {DimensionValues: []Value{{"2. WCA login started"}}, MetricValues: []Value{{"NaN"}}}} {
		bad := table
		bad.Rows = append(append([]Row{}, table.Rows...), row)
		if _, _, err := extractFunnel(bad, q); err == nil {
			t.Fatal("invalid funnel accepted")
		}
	}
	zone, _ := time.LoadLocation("Asia/Manila")
	groups := cohortWindows("2026-10-22", zone)
	bad := Table{Rows: []Row{{DimensionValues: []Value{{"start_0"}, {"0001"}}, MetricValues: []Value{{"101"}, {"100"}}}}}
	if _, _, err := extractCohorts(bad, groups, "2026-10-22"); err == nil {
		t.Fatal("invalid denominator accepted")
	}
}
func TestBehaviorUpstreamFailureReturnsNoPartialData(t *testing.T) {
	c := fakeClient(t, func(w http.ResponseWriter, r *http.Request) { http.Error(w, "secret upstream body", 500) })
	result, err := c.Behavior(context.Background(), BehaviorQuery{Kind: "journeys", Device: "all", Days: 28, Funnel: "region"})
	if err == nil || result.Source != "" || len(c.behaviorCache) != 0 {
		t.Fatal("partial result returned")
	}
	if _, err := New("", "").Behavior(context.Background(), BehaviorQuery{Kind: "retention", Device: "all", Days: 28}); err != ErrNotConfigured {
		t.Fatal(err)
	}
}
