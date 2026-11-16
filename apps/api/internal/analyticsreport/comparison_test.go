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
)

func TestReleaseQueryBounds(t *testing.T) {
	for _, raw := range []string{"date=2026-10-10", "date=2026-10-10&days=28&device=mobile&breakdown=source", "date=2026-10-10&breakdown=device&device=tablet"} {
		values, _ := url.ParseQuery(raw)
		if _, err := ParseReleaseQuery(values); err != nil {
			t.Fatal(raw, err)
		}
	}
	for _, raw := range []string{"date=2026-02-30", "date=tomorrow", "date=2026-10-10&date=2026-10-11", "date=2026-10-10&days=365", "date=2026-10-10&device=email", "date=2026-10-10&breakdown=userId", "date=2026-10-10&property=secret", "date=2026-10-10&startDate=2020-01-01"} {
		values, _ := url.ParseQuery(raw)
		if _, err := ParseReleaseQuery(values); err == nil {
			t.Fatal("accepted", raw)
		}
	}
	q, _ := ParseReleaseQuery(url.Values{"date": {"2026-10-10"}})
	if q.Days != 7 || q.Device != "all" || q.Breakdown != "trend" {
		t.Fatal(q)
	}
}

func comparisonClient(t *testing.T, calls *atomic.Int32) *Client {
	return fakeClient(t, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		var body struct {
			Dimensions []Column `json:"dimensions"`
			Metrics    []Column `json:"metrics"`
			DateRanges []struct {
				Start string `json:"startDate"`
				End   string `json:"endDate"`
			} `json:"dateRanges"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
			return
		}
		if len(body.DateRanges) != 1 || strings.Contains(body.DateRanges[0].Start, "Ago") {
			t.Error("comparison lost fixed windows")
			return
		}
		values := []Value{}
		for _, column := range body.Dimensions {
			value := "mobile"
			if column.Name == "date" {
				value = strings.ReplaceAll(body.DateRanges[0].Start, "-", "")
			}
			if column.Name == "sessionSourceMedium" {
				value = "google / organic"
			}
			values = append(values, Value{value})
		}
		_ = json.NewEncoder(w).Encode(Table{DimensionHeaders: body.Dimensions, MetricHeaders: body.Metrics, Rows: []Row{{DimensionValues: values, MetricValues: []Value{{"20"}, {"12"}, {"15"}, {"25"}}}}, RowCount: 1, Metadata: Metadata{TimeZone: "Asia/Manila"}})
	})
}

func TestReleaseComparisonContracts(t *testing.T) {
	var calls atomic.Int32
	c := comparisonClient(t, &calls)
	results := []ReleaseResult{}
	for _, days := range []int{7, 28} {
		for _, device := range []string{"all", "mobile", "desktop", "tablet"} {
			for _, breakdown := range []string{"trend", "device", "source"} {
				date := "2026-10-10"
				if days == 28 {
					date = "2026-09-20"
				}
				q := ReleaseQuery{Date: date, Days: days, Device: device, Breakdown: breakdown}
				result, err := c.ReleaseComparison(context.Background(), q)
				if err != nil {
					t.Fatal(q, err)
				}
				if result.Source != "ga4" || result.Before.End >= date || result.After.Start <= date || result.Before.Table.Metadata.TimeZone != result.After.Table.Metadata.TimeZone {
					t.Fatal("windows overlap or metadata lost", result)
				}
				cached, err := c.ReleaseComparison(context.Background(), q)
				if err != nil || !cached.Before.Cached || !cached.After.Cached {
					t.Fatal("comparison cache lost", err)
				}
				results = append(results, result)
			}
		}
	}
	if len(results) != 24 || calls.Load() != 96 {
		t.Fatal("unexpected comparison quota", len(results), calls.Load())
	}
	if output := os.Getenv("PCA_ANALYTICS_COMPARISON_OUTPUT"); output != "" {
		data, err := json.Marshal(results)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(output, data, 0600); err != nil {
			t.Fatal(err)
		}
	}
}

func TestReleaseDatesAndCacheDoNotMixWithRollingPeriods(t *testing.T) {
	var calls atomic.Int32
	c := comparisonClient(t, &calls)
	result, err := c.ReleaseComparison(context.Background(), ReleaseQuery{"2026-10-10", 7, "all", "trend"})
	if err != nil || result.Before.Start != "2026-10-03" || result.Before.End != "2026-10-09" || result.After.Start != "2026-10-11" || result.After.End != "2026-10-17" {
		t.Fatal(result, err)
	}
	other, err := c.ReleaseComparison(context.Background(), ReleaseQuery{"2026-10-09", 7, "all", "trend"})
	if err != nil || other.Before.Cached || other.After.Cached || calls.Load() != 8 {
		t.Fatal("release date cache collision", other, err)
	}
}

func TestReleaseRejectsIncompleteAndOldWindowsWithoutReturningPartialResults(t *testing.T) {
	for _, date := range []string{"2025-01-01", "2026-10-20", "2026-10-16"} {
		var calls atomic.Int32
		c := comparisonClient(t, &calls)
		result, err := c.ReleaseComparison(context.Background(), ReleaseQuery{date, 7, "all", "trend"})
		if err != ErrComparisonWindow || result.Source != "" || result.Before.Source != "" || result.After.Source != "" {
			t.Fatal("partial/incomplete comparison", date, result, err)
		}
		if calls.Load() > 2 {
			t.Fatal("requested incomplete after window")
		}
	}
}
