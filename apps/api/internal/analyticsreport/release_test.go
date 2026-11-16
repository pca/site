package analyticsreport

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// This is a protocol simulation, not a claim that Google accepts every query.
// The full verification script also passes these real API result shapes to the
// admin's validator, catching independently changed dimensions/metrics/scopes.
func TestReleaseReportMatrix(t *testing.T) {
	var calls atomic.Int32
	c := fakeClient(t, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		var body struct {
			Dimensions []Column `json:"dimensions"`
			Metrics    []Column `json:"metrics"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
			w.WriteHeader(400)
			return
		}
		dims := []Value{}
		for _, column := range body.Dimensions {
			value := "333"
			if column.Name == "date" {
				value = "20261020"
			}
			if column.Name == "customEvent:feature_name" {
				value = "rankings_filters"
			}
			if column.Name == "eventName" {
				value = "feature_exposed"
			}
			dims = append(dims, Value{value})
		}
		metrics := []Value{}
		for range body.Metrics {
			metrics = append(metrics, Value{"12"})
		}
		_ = json.NewEncoder(w).Encode(Table{DimensionHeaders: body.Dimensions, MetricHeaders: body.Metrics,
			Rows: []Row{{DimensionValues: dims, MetricValues: metrics}}, RowCount: 1, Metadata: Metadata{TimeZone: "Asia/Manila"}})
	})
	variants := map[string][]string{
		"pages": {"", "date"}, "audience": {"device", "os", "browser", "brand"},
		"acquisition": {"source", "channel", "campaign", "landing"},
		"content":     {"event", "event_region", "region", "format", "view", "entry", "page"},
		"features":    {"feature"},
	}
	type contractCase struct {
		Query  Query  `json:"query"`
		Result Result `json:"result"`
	}
	results := []contractCase{}
	for kind, breakdowns := range variants {
		pages := []string{""}
		if kind == "content" {
			pages = []string{"all", "rankings", "statistics"}
		}
		for _, breakdown := range breakdowns {
			for _, page := range pages {
				for _, device := range []string{"all", "mobile", "desktop", "tablet"} {
					for _, days := range []int{7, 28} {
						values := url.Values{"report": {kind}, "breakdown": {breakdown}, "device": {device}, "days": {strconv.Itoa(days)}}
						if page != "" {
							values.Set("page", page)
						}
						q, err := ParseQuery(values)
						if err != nil {
							t.Fatal(err)
						}
						result, err := c.Report(context.Background(), q)
						if err != nil {
							t.Fatalf("%+v: %v", q, err)
						}
						if result.Source != "ga4" || result.Cached || result.Device != device || result.ContentPage != page {
							t.Fatalf("scope lost: %+v", result)
						}
						results = append(results, contractCase{q, result})
					}
				}
			}
		}
	}
	if len(results) != 256 || calls.Load() != int32(2*len(results)) {
		t.Fatalf("incomplete matrix: %d cases, %d calls", len(results), calls.Load())
	}
	if output := os.Getenv("PCA_ANALYTICS_CONTRACT_OUTPUT"); output != "" {
		data, err := json.Marshal(results)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(output, data, 0600); err != nil {
			t.Fatal(err)
		}
	}
}

func TestConcurrentReportRequestsShareOneUpstreamPair(t *testing.T) {
	var calls atomic.Int32
	c := fakeClient(t, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		_, hasDim := body["dimensions"]
		_ = json.NewEncoder(w).Encode(response(t, hasDim))
	})
	var wg sync.WaitGroup
	start := make(chan struct{})
	for range 16 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			if _, err := c.Report(context.Background(), Query{Report: "acquisition", Breakdown: "source", Device: "all", Days: 7}); err != nil {
				t.Error(err)
			}
		}()
	}
	close(start)
	wg.Wait()
	if calls.Load() != 2 {
		t.Fatalf("duplicate requests wasted quota: %d", calls.Load())
	}
}

func TestTotalsFailureDoesNotCachePartialReport(t *testing.T) {
	var calls atomic.Int32
	c := fakeClient(t, func(w http.ResponseWriter, r *http.Request) {
		call := calls.Add(1)
		if call == 2 {
			http.Error(w, "private upstream detail", 429)
			return
		}
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		_, hasDim := body["dimensions"]
		_ = json.NewEncoder(w).Encode(response(t, hasDim))
	})
	q := Query{Report: "acquisition", Breakdown: "source", Device: "all", Days: 7}
	if _, err := c.Report(context.Background(), q); err == nil || strings.Contains(err.Error(), "private") {
		t.Fatal("failed totals not handled safely", err)
	}
	if len(c.cache) != 0 {
		t.Fatal("partial result cached")
	}
	result, err := c.Report(context.Background(), q)
	if err != nil || result.Cached || calls.Load() != 4 {
		t.Fatal("cannot recover after failed totals", err)
	}
}

func TestReportResponseBoundaryFailures(t *testing.T) {
	for _, scenario := range []string{"oversized-valid-json", "trailing-json", "too-many-rows", "wrong-row-count", "mismatched-timezone", "unknown-timezone"} {
		t.Run(scenario, func(t *testing.T) {
			c := fakeClient(t, func(w http.ResponseWriter, r *http.Request) {
				var body map[string]any
				_ = json.NewDecoder(r.Body).Decode(&body)
				_, hasDim := body["dimensions"]
				table := response(t, hasDim)
				switch scenario {
				case "oversized-valid-json":
					_, _ = w.Write(mustJSON(t, table))
					_, _ = w.Write([]byte(strings.Repeat(" ", 2<<20)))
					return
				case "trailing-json":
					_, _ = w.Write(mustJSON(t, table))
					_, _ = w.Write([]byte(`{"unexpected":"extra"}`))
					return
				case "too-many-rows":
					for len(table.Rows) <= rowLimit {
						table.Rows = append(table.Rows, table.Rows[0])
					}
					table.RowCount = len(table.Rows)
				case "wrong-row-count":
					table.RowCount = 0
				case "mismatched-timezone":
					if hasDim {
						table.Metadata.TimeZone = "UTC"
					}
				case "unknown-timezone":
					table.Metadata.TimeZone = "not-a-timezone"
				}
				_ = json.NewEncoder(w).Encode(table)
			})
			if _, err := c.Report(context.Background(), Query{Report: "acquisition", Breakdown: "source", Device: "all", Days: 7}); err == nil {
				t.Fatal("accepted", scenario)
			}
			if len(c.cache) != 0 {
				t.Fatal("invalid result cached")
			}
		})
	}
}

func TestDatesFollowPropertyDayAcrossMonthAndYear(t *testing.T) {
	c := fakeClient(t, func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		_, hasDim := body["dimensions"]
		_ = json.NewEncoder(w).Encode(response(t, hasDim))
	})
	// Still December 31 in UTC, but already January 1 in the property timezone.
	c.now = func() time.Time { return time.Date(2026, 12, 31, 17, 0, 0, 0, time.UTC) }
	r, err := c.Report(context.Background(), Query{Report: "acquisition", Breakdown: "source", Device: "all", Days: 7})
	if err != nil || r.Start != "2026-12-25" || r.End != "2026-12-31" {
		t.Fatalf("wrong property dates: %+v %v", r, err)
	}
}
