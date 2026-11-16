package analyticsreport

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
)

func TestSignalQueryBounds(t *testing.T) {
	for _, raw := range []string{"report=content", "report=content&breakdown=event_region&page=rankings", "report=content&breakdown=region&page=rankings", "report=content&breakdown=entry&page=statistics&device=mobile&days=7", "report=features", "report=features&breakdown=feature&device=tablet"} {
		values, _ := url.ParseQuery(raw)
		if _, err := ParseQuery(values); err != nil {
			t.Fatalf("valid %s: %v", raw, err)
		}
	}
	for _, raw := range []string{"report=content&breakdown=email", "report=content&page=profile", "report=features&page=rankings", "report=pages&page=rankings", "report=content&page=all&page=rankings", "report=features&breakdown=identity", "report=content&region=NCR", "report=content&hostname=beta.pinoycubers.org"} {
		values, _ := url.ParseQuery(raw)
		if _, err := ParseQuery(values); err == nil {
			t.Fatalf("accepted %s", raw)
		}
	}
}

func TestSignalRequestsRemainBoundedAndEventScoped(t *testing.T) {
	for _, q := range []Query{{Report: "content", Breakdown: "event", ContentPage: "rankings", Device: "mobile", Days: 7}, {Report: "content", Breakdown: "event_region", ContentPage: "rankings", Device: "all", Days: 28}, {Report: "features", Breakdown: "feature", Device: "all", Days: 28}} {
		dim, _ := dimension(q)
		body := requestBody(q, dim)
		text := string(mustJSON(t, body))
		for _, want := range []string{"eventCount", "totalUsers", "hostName", "pinoycubers.org", "yesterday", "200"} {
			if !strings.Contains(text, want) {
				t.Fatalf("missing %s: %s", want, text)
			}
		}
		for _, bad := range []string{"engagedSessions", "screenPageViews", "beta.pinoycubers.org", "userId", "pageLocation"} {
			if strings.Contains(text, bad) {
				t.Fatalf("unexpected %s", bad)
			}
		}
		if q.Report == "content" {
			for _, want := range []string{"content_view", "customEvent:content_page", "rankings", "customEvent:event_id"} {
				if !strings.Contains(text, want) {
					t.Fatal(want)
				}
			}
			if q.Breakdown == "event_region" && len(body["dimensions"].([]Column)) != 2 {
				t.Fatal("event-region report lost a dimension")
			}
		}
		if q.Report == "features" {
			if len(body["dimensions"].([]Column)) != 2 {
				t.Fatal("feature and event name must stay separate dimensions")
			}
			for _, want := range []string{"feature_exposed", "feature_used", "rankings_filters", "region_prompt", "statistics_tabs"} {
				if !strings.Contains(text, want) {
					t.Fatal(want)
				}
			}
		}
		if strings.Contains(string(mustJSON(t, requestBody(q, ""))), "dimensions") {
			t.Fatal("totals must be independently deduplicated")
		}
	}
}

func TestFeatureSignalReportKeepsTwoDimensionsAndTwoMetrics(t *testing.T) {
	c := fakeClient(t, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Dimensions []Column `json:"dimensions"`
			Metrics    []Column `json:"metrics"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		values := []Value{}
		if len(body.Dimensions) > 0 {
			values = []Value{{"rankings_filters"}, {"feature_exposed"}}
		}
		_ = json.NewEncoder(w).Encode(Table{DimensionHeaders: body.Dimensions, MetricHeaders: body.Metrics, Rows: []Row{{DimensionValues: values, MetricValues: []Value{{"20"}, {"12"}}}}, RowCount: 1, Metadata: Metadata{TimeZone: "Asia/Manila"}})
	})
	result, err := c.Report(context.Background(), Query{Report: "features", Breakdown: "feature", Device: "all", Days: 28})
	if err != nil || result.Report != "features" || len(result.Table.DimensionHeaders) != 2 || len(result.Table.MetricHeaders) != 2 || len(result.Totals.DimensionHeaders) != 0 {
		t.Fatalf("bad signal report: %+v %v", result, err)
	}
}

func TestContentCacheSeparatesPageScopes(t *testing.T) {
	var calls atomic.Int32
	c := fakeClient(t, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		var body struct {
			Dimensions []Column `json:"dimensions"`
			Metrics    []Column `json:"metrics"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		values := []Value{}
		for range body.Dimensions {
			values = append(values, Value{"333"})
		}
		_ = json.NewEncoder(w).Encode(Table{DimensionHeaders: body.Dimensions, MetricHeaders: body.Metrics, Rows: []Row{{DimensionValues: values, MetricValues: []Value{{"20"}, {"12"}}}}, RowCount: 1, Metadata: Metadata{TimeZone: "Asia/Manila"}})
	})
	for _, page := range []string{"all", "rankings", "statistics"} {
		q := Query{Report: "content", Breakdown: "event", Device: "all", Days: 7, ContentPage: page}
		result, err := c.Report(context.Background(), q)
		if err != nil || result.ContentPage != page || result.Cached {
			t.Fatalf("bad content scope: %+v %v", result, err)
		}
		if len(result.Table.MetricHeaders) != 2 || len(result.Totals.DimensionHeaders) != 0 {
			t.Fatal("wrong signal report schema")
		}
		cached, err := c.Report(context.Background(), q)
		if err != nil || !cached.Cached {
			t.Fatal("scope cache missing")
		}
	}
	if calls.Load() != 6 {
		t.Fatalf("expected 2 upstream calls per distinct scope, got %d", calls.Load())
	}
}

func TestFeatureReportRejectsMismatchedSignalHeaders(t *testing.T) {
	c := fakeClient(t, func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(Table{DimensionHeaders: []Column{{"customEvent:feature_name"}, {"eventName"}}, MetricHeaders: []Column{{"eventCount"}, {"sessions"}}, RowCount: 0, Metadata: Metadata{TimeZone: "Asia/Manila"}})
	})
	if _, err := c.Report(context.Background(), Query{Report: "features", Breakdown: "feature", Device: "all", Days: 7}); err == nil {
		t.Fatal("accepted a different population metric")
	}
	if len(c.cache) != 0 {
		t.Fatal("invalid result cached")
	}
}
