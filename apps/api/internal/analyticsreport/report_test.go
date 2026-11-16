package analyticsreport

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestQueryBounds(t *testing.T) {
	for _, raw := range []string{"report=pages", "report=audience&breakdown=brand&days=7&device=tablet", "report=acquisition&breakdown=landing&days=28&device=mobile"} {
		values, _ := url.ParseQuery(raw)
		if _, err := ParseQuery(values); err != nil {
			t.Fatalf("valid %s: %v", raw, err)
		}
	}
	for _, raw := range []string{"report=anything", "report=pages&days=365", "report=pages&device=tv", "report=pages&property=999", "report=pages&days=7&days=28", "report=audience&breakdown=email", "report=acquisition&breakdown=pageLocation", "report=pages&breakdown=source"} {
		values, _ := url.ParseQuery(raw)
		if _, err := ParseQuery(values); err == nil {
			t.Fatalf("accepted %s", raw)
		}
	}
	q, _ := ParseQuery(url.Values{"report": {"audience"}, "breakdown": {"brand"}})
	dim, _ := dimension(q)
	if dim != "mobileDeviceBranding" {
		t.Fatal(dim)
	}
}
func TestFixedRequestScope(t *testing.T) {
	q := Query{Report: "acquisition", Breakdown: "source", Device: "mobile", Days: 7}
	data, _ := json.Marshal(requestBody(q, "sessionSourceMedium"))
	s := string(data)
	for _, want := range []string{"7daysAgo", "yesterday", "sessionSourceMedium", "hostName", "deviceCategory", "mobile", "www.pinoycubers.org"} {
		if !strings.Contains(s, want) {
			t.Fatalf("missing %s", want)
		}
	}
	for _, bad := range []string{"beta.pinoycubers.org", "pageLocation", "pagePathPlusQueryString", "today", "email"} {
		if strings.Contains(s, bad) {
			t.Fatalf("unexpected %s", bad)
		}
	}
	if strings.Contains(string(mustJSON(t, requestBody(q, ""))), "dimensions") {
		t.Fatal("total must be a separate no-dimension report")
	}
}
func mustJSON(t *testing.T, v any) []byte {
	t.Helper()
	data, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return data
}
func TestUnconfiguredNoRequest(t *testing.T) {
	c := New("", "")
	if c.Status().State != "not_configured" {
		t.Fatal(c.Status())
	}
	if _, err := c.Report(context.Background(), Query{}); err != ErrNotConfigured {
		t.Fatal(err)
	}
}
func TestCredentialRestrictions(t *testing.T) {
	file := filepath.Join(t.TempDir(), "not-a-real-credential.json")
	for _, data := range []string{`{"type":"external_account","token_uri":"https://oauth2.googleapis.com/token"}`, `{"type":"service_account","token_uri":"http://unexpected.example/token","private_key":"not-a-key"}`, `{"type":"authorized_user"}`, "not-json", strings.Repeat("x", 65537)} {
		if err := os.WriteFile(file, []byte(data), 0600); err != nil {
			t.Fatal(err)
		}
		c := New("123", file)
		if c.Status().State != "invalid_configuration" {
			t.Fatal(c.Status())
		}
		if strings.Contains(string(mustJSON(t, c.Status())), file) {
			t.Fatal("credential path disclosed")
		}
	}
	if New("G-PUBLIC", file).Status().State != "invalid_configuration" {
		t.Fatal("measurement ID is not a property ID")
	}
}
func fakeClient(t *testing.T, handler http.HandlerFunc) *Client {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	return &Client{state: "ready", property: "123", http: server.Client(), baseURL: server.URL + "/", cache: make(map[Query]cachedResult), now: func() time.Time { return time.Date(2026, 10, 23, 1, 0, 0, 0, time.UTC) }}
}
func response(t *testing.T, hasDim bool) Table {
	t.Helper()
	table := Table{MetricHeaders: []Column{{"sessions"}, {"engagedSessions"}, {"activeUsers"}, {"screenPageViews"}}, Metadata: Metadata{TimeZone: "Asia/Manila"}, Rows: []Row{{MetricValues: []Value{{"20"}, {"12"}, {"15"}, {"25"}}}}, RowCount: 1}
	if hasDim {
		table.DimensionHeaders = []Column{{"sessionSourceMedium"}}
		table.Rows[0].DimensionValues = []Value{{"google / organic"}}
	}
	return table
}
func TestReportsCacheAndTimezone(t *testing.T) {
	var calls atomic.Int32
	c := fakeClient(t, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.Method != "POST" || r.URL.Path != "/123:runReport" {
			t.Error("unexpected target")
		}
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		_, hasDim := body["dimensions"]
		_ = json.NewEncoder(w).Encode(response(t, hasDim))
	})
	q := Query{Report: "acquisition", Breakdown: "source", Device: "all", Days: 7}
	r, err := c.Report(context.Background(), q)
	if err != nil {
		t.Fatal(err)
	}
	if r.Start != "2026-10-16" || r.End != "2026-10-22" || r.Cached || r.Source != "ga4" {
		t.Fatalf("bad metadata: %+v", r)
	}
	if len(r.Totals.DimensionHeaders) != 0 || r.Totals.DimensionHeaders == nil || r.Totals.Rows[0].DimensionValues == nil {
		t.Fatal("no-dimension arrays must serialize as empty, not null")
	}
	r, err = c.Report(context.Background(), q)
	if err != nil || !r.Cached || calls.Load() != 2 {
		t.Fatalf("cache failed %v %d", err, calls.Load())
	}
	c.now = func() time.Time { return time.Date(2026, 10, 23, 1, 6, 0, 0, time.UTC) }
	_, _ = c.Report(context.Background(), q)
	if calls.Load() != 4 {
		t.Fatal("cache did not expire")
	}
}
func TestEmptyAndSuppressedReports(t *testing.T) {
	c := fakeClient(t, func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		_, dim := body["dimensions"]
		table := response(t, dim)
		table.Rows = nil
		table.RowCount = 0
		table.Metadata.SubjectToThresholding = true
		table.Metadata.DataLossFromOtherRow = true
		_ = json.NewEncoder(w).Encode(table)
	})
	r, err := c.Report(context.Background(), Query{Report: "acquisition", Breakdown: "source", Device: "all", Days: 28})
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Table.Rows) != 0 || !r.Table.Metadata.SubjectToThresholding || !r.Totals.Metadata.DataLossFromOtherRow {
		t.Fatal("empty/suppression metadata lost")
	}
}
func TestUpstreamErrorsAreSanitizedAndNotCached(t *testing.T) {
	var calls atomic.Int32
	c := fakeClient(t, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		http.Error(w, "SECRET token and account details", http.StatusForbidden)
	})
	q := Query{Report: "acquisition", Breakdown: "source", Device: "all", Days: 7}
	for range 2 {
		_, err := c.Report(context.Background(), q)
		if err == nil || strings.Contains(err.Error(), "SECRET") {
			t.Fatal(err)
		}
	}
	if calls.Load() != 2 || len(c.cache) != 0 {
		t.Fatal("failed report was cached")
	}
}
func TestInvalidNumbersAndShapesRejected(t *testing.T) {
	for _, value := range []string{"NaN", "+Inf", "-1", "not-a-number"} {
		t.Run(value, func(t *testing.T) {
			c := fakeClient(t, func(w http.ResponseWriter, r *http.Request) {
				table := response(t, true)
				table.Rows[0].MetricValues[0].Value = value
				_ = json.NewEncoder(w).Encode(table)
			})
			if _, err := c.Report(context.Background(), Query{Report: "acquisition", Breakdown: "source", Device: "all", Days: 7}); err == nil {
				t.Fatal("invalid number accepted")
			}
		})
	}
}
