// Package analyticsreport provides a bounded, read-only GA4 reporting surface.
// The browser cannot choose a property, hostname, arbitrary dimensions or URLs.
package analyticsreport

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"sync"
	"time"
	_ "time/tzdata"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

var ErrNotConfigured = errors.New("GA4 reporting not configured")

const endpoint = "https://analyticsdata.googleapis.com/v1beta/properties/"
const scope = "https://www.googleapis.com/auth/analytics.readonly"
const rowLimit = 200

type Query struct {
	Report, Device, Breakdown string
	Days                      int
	ContentPage               string
	// Only ReleaseComparison constructs fixed windows. ParseQuery never accepts
	// arbitrary dates, and the unexported fields are not browser-controlled.
	startDate, endDate string
}

func ParseQuery(values url.Values) (Query, error) {
	q := Query{Report: values.Get("report"), Device: values.Get("device"), Breakdown: values.Get("breakdown"), ContentPage: values.Get("page"), Days: 28}
	for key, items := range values {
		if (key != "report" && key != "device" && key != "breakdown" && key != "days" && key != "page") || len(items) != 1 {
			return q, errors.New("unsupported parameter")
		}
	}
	if q.Device == "" {
		q.Device = "all"
	}
	if v := values.Get("days"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return q, err
		}
		q.Days = n
	}
	if q.Days != 7 && q.Days != 28 {
		return q, errors.New("unsupported period")
	}
	if q.Device != "all" && q.Device != "mobile" && q.Device != "desktop" && q.Device != "tablet" {
		return q, errors.New("unsupported device")
	}
	if q.Report == "content" {
		if q.ContentPage == "" {
			q.ContentPage = "all"
		}
		if q.ContentPage != "all" && q.ContentPage != "rankings" && q.ContentPage != "statistics" {
			return q, errors.New("unsupported content page")
		}
	} else if q.ContentPage != "" {
		return q, errors.New("content page applies only to content reports")
	}
	if q.Breakdown == "" {
		if q.Report == "audience" {
			q.Breakdown = "device"
		} else if q.Report == "acquisition" {
			q.Breakdown = "source"
		} else if q.Report == "content" {
			q.Breakdown = "event"
		} else if q.Report == "features" {
			q.Breakdown = "feature"
		}
	}
	if _, ok := dimension(q); !ok {
		return q, errors.New("unsupported report")
	}
	return q, nil
}

func dimension(q Query) (string, bool) {
	var names map[string]string
	switch q.Report {
	case "pages":
		if q.Breakdown == "" {
			return "pagePath", true
		}
		if q.Breakdown == "date" {
			return "date", true
		}
		return "", false
	case "audience":
		names = map[string]string{"device": "deviceCategory", "os": "operatingSystem", "browser": "browser", "brand": "mobileDeviceBranding"}
	case "acquisition":
		names = map[string]string{"source": "sessionSourceMedium", "channel": "sessionDefaultChannelGroup", "campaign": "sessionCampaignName", "landing": "landingPage"}
	case "content":
		names = map[string]string{"event": "customEvent:event_id", "event_region": "customEvent:event_id", "region": "customEvent:region_id", "format": "customEvent:result_type", "view": "customEvent:view_id", "entry": "customEvent:content_entry", "page": "customEvent:content_page"}
	case "features":
		names = map[string]string{"feature": "customEvent:feature_name"}
	}
	value, ok := names[q.Breakdown]
	return value, ok
}

type Column struct {
	Name string `json:"name"`
}
type Value struct {
	Value string `json:"value"`
}
type Row struct {
	DimensionValues []Value `json:"dimensionValues"`
	MetricValues    []Value `json:"metricValues"`
}
type Metadata struct {
	TimeZone              string `json:"timeZone"`
	SubjectToThresholding bool   `json:"subjectToThresholding"`
	DataLossFromOtherRow  bool   `json:"dataLossFromOtherRow"`
	SamplingMetadatas     []struct {
		SamplesReadCount  string `json:"samplesReadCount"`
		SamplingSpaceSize string `json:"samplingSpaceSize"`
	} `json:"samplingMetadatas,omitempty"`
}
type Table struct {
	DimensionHeaders []Column `json:"dimensionHeaders"`
	MetricHeaders    []Column `json:"metricHeaders"`
	Rows             []Row    `json:"rows"`
	RowCount         int      `json:"rowCount"`
	Metadata         Metadata `json:"metadata"`
}
type Result struct {
	Source      string    `json:"source"`
	Report      string    `json:"report"`
	Device      string    `json:"device"`
	Breakdown   string    `json:"breakdown"`
	ContentPage string    `json:"contentPage,omitempty"`
	Start       string    `json:"start"`
	End         string    `json:"end"`
	FetchedAt   time.Time `json:"fetchedAt"`
	Cached      bool      `json:"cached"`
	Hosts       []string  `json:"hosts"`
	Table       Table     `json:"table"`
	Totals      Table     `json:"totals"`
}
type Status struct {
	State        string   `json:"state"`
	Message      string   `json:"message"`
	Hosts        []string `json:"hosts"`
	CacheSeconds int      `json:"cacheSeconds"`
}
type cachedResult struct {
	result Result
	until  time.Time
}
type Client struct {
	property      string
	state         string
	http          *http.Client
	cache         map[Query]cachedResult
	mu            sync.Mutex
	now           func() time.Time
	baseURL       string
	behaviorCache map[BehaviorQuery]cachedBehavior
}

func hosts() []string { return []string{"pinoycubers.org", "www.pinoycubers.org"} }

func New(property, credentialFile string) *Client {
	c := &Client{property: property, state: "not_configured", cache: make(map[Query]cachedResult), now: time.Now, baseURL: endpoint}
	if property == "" && credentialFile == "" {
		return c
	}
	c.state = "invalid_configuration"
	if !regexp.MustCompile(`^[0-9]{1,20}$`).MatchString(property) || credentialFile == "" {
		return c
	}
	f, err := os.Open(credentialFile)
	if err != nil {
		return c
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, 65537))
	if err != nil || len(data) > 65536 {
		return c
	}
	// Only service-account credentials are accepted, with the official token URL.
	// Do not accept external-account configs that can fetch arbitrary endpoints.
	var kind struct {
		Type     string `json:"type"`
		TokenURI string `json:"token_uri"`
	}
	if json.Unmarshal(data, &kind) != nil || kind.Type != "service_account" || kind.TokenURI != "https://oauth2.googleapis.com/token" {
		return c
	}
	jwt, err := google.JWTConfigFromJSON(data, scope)
	if err != nil || jwt.Email == "" || len(jwt.PrivateKey) == 0 {
		return c
	}
	// No token exchange occurs until an authenticated staff report request.
	transportClient := &http.Client{Timeout: 12 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	ctx := context.WithValue(context.Background(), oauth2.HTTPClient, transportClient)
	c.http = &http.Client{Timeout: 15 * time.Second, Transport: &oauth2.Transport{Source: jwt.TokenSource(ctx), Base: transportClient.Transport}, CheckRedirect: transportClient.CheckRedirect}
	c.state = "ready"
	return c
}
func (c *Client) Status() Status {
	message := "Add the numeric GA4 property ID and a server-only service-account file. The G-code alone cannot read reports."
	if c.state == "invalid_configuration" {
		message = "Server reporting configuration needs attention. No credentials are shown in this dashboard."
	}
	if c.state == "ready" {
		message = "Server configuration is present. Request a report to verify property access; this is not yet a successful connection check."
	}
	return Status{c.state, message, hosts(), 300}
}

func stringFilter(name string, values []string) map[string]any {
	return map[string]any{"filter": map[string]any{"fieldName": name, "inListFilter": map[string]any{"values": values, "caseSensitive": false}}}
}
func signalFilter(name string, values []string) map[string]any {
	return map[string]any{"filter": map[string]any{"fieldName": name, "inListFilter": map[string]any{"values": values, "caseSensitive": true}}}
}
func requestBody(q Query, dim string) map[string]any {
	filters := []any{stringFilter("hostName", hosts())}
	if q.Device != "all" {
		filters = append(filters, stringFilter("deviceCategory", []string{q.Device}))
	}
	metrics := []Column{{"sessions"}, {"engagedSessions"}, {"activeUsers"}, {"screenPageViews"}}
	if q.Report == "content" || q.Report == "features" {
		metrics = []Column{{"eventCount"}, {"totalUsers"}}
	}
	if q.Report == "content" {
		filters = append(filters, signalFilter("eventName", []string{"content_view"}))
		if q.ContentPage != "" && q.ContentPage != "all" {
			filters = append(filters, signalFilter("customEvent:content_page", []string{q.ContentPage}))
		}
	}
	if q.Report == "features" {
		filters = append(filters, signalFilter("eventName", []string{"feature_exposed", "feature_used"}), signalFilter("customEvent:feature_name", []string{"rankings_filters", "region_prompt", "statistics_tabs"}))
	}
	body := map[string]any{"dateRanges": []any{map[string]string{"startDate": fmt.Sprintf("%ddaysAgo", q.Days), "endDate": "yesterday"}}, "metrics": metrics, "dimensionFilter": map[string]any{"andGroup": map[string]any{"expressions": filters}}, "limit": rowLimit, "returnPropertyQuota": false}
	if q.startDate != "" && q.endDate != "" {
		body["dateRanges"] = []any{map[string]string{"startDate": q.startDate, "endDate": q.endDate}}
	}
	if dim != "" {
		body["dimensions"] = []Column{{dim}}
		if q.Report == "features" {
			body["dimensions"] = []Column{{dim}, {"eventName"}}
		}
		if q.Report == "content" && q.Breakdown == "event_region" {
			body["dimensions"] = []Column{{dim}, {"customEvent:region_id"}}
		}
		body["orderBys"] = []any{map[string]any{"metric": map[string]string{"metricName": metrics[0].Name}, "desc": true}}
	}
	return body
}
func (c *Client) run(ctx context.Context, body map[string]any) (Table, error) {
	var table Table
	data, err := json.Marshal(body)
	if err != nil {
		return table, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+c.property+":runReport", bytes.NewReader(data))
	if err != nil {
		return table, errors.New("invalid request")
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := c.http.Do(req)
	if err != nil {
		return table, errors.New("GA4 transport unavailable")
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return table, errors.New("GA4 report unavailable")
	}
	// Read one extra byte to detect oversize replies, including a valid JSON
	// prefix with a huge trailing body. Unmarshal also rejects a second object.
	payload, err := io.ReadAll(io.LimitReader(res.Body, (2<<20)+1))
	if err != nil || len(payload) > 2<<20 {
		return table, errors.New("invalid GA4 response size")
	}
	if err := json.Unmarshal(payload, &table); err != nil {
		return table, errors.New("invalid GA4 response")
	}
	// Defensive shape checking before any table reaches the browser.
	if table.DimensionHeaders == nil {
		table.DimensionHeaders = []Column{}
	}
	expectedMetrics := body["metrics"].([]Column)
	if len(table.Rows) > rowLimit || len(table.MetricHeaders) != len(expectedMetrics) {
		return table, errors.New("invalid report shape")
	}
	for i, column := range expectedMetrics {
		if table.MetricHeaders[i].Name != column.Name {
			return table, errors.New("unexpected metric header")
		}
	}
	expectedDimensions, _ := body["dimensions"].([]Column)
	if len(table.DimensionHeaders) != len(expectedDimensions) {
		return table, errors.New("unexpected dimension header")
	}
	for i, column := range expectedDimensions {
		if table.DimensionHeaders[i].Name != column.Name {
			return table, errors.New("unexpected dimension header")
		}
	}
	if table.RowCount < len(table.Rows) || (len(expectedDimensions) == 0 && len(table.Rows) > 1) {
		return table, errors.New("invalid report total")
	}
	for i := range table.Rows {
		if table.Rows[i].DimensionValues == nil {
			table.Rows[i].DimensionValues = []Value{}
		}
		row := table.Rows[i]
		if len(row.MetricValues) != len(expectedMetrics) || len(row.DimensionValues) != len(table.DimensionHeaders) {
			return table, errors.New("invalid row shape")
		}
		for _, metric := range row.MetricValues {
			n, err := strconv.ParseFloat(metric.Value, 64)
			if err != nil || math.IsNaN(n) || math.IsInf(n, 0) || n < 0 || n > 1e15 {
				return table, errors.New("invalid metric")
			}
		}
	}
	return table, nil
}
func (c *Client) Report(ctx context.Context, q Query) (Result, error) {
	if c.state != "ready" {
		return Result{}, ErrNotConfigured
	}
	dim, ok := dimension(q)
	if !ok || (q.Days != 7 && q.Days != 28) || (q.Device != "all" && q.Device != "mobile" && q.Device != "desktop" && q.Device != "tablet") {
		return Result{}, errors.New("invalid query")
	}
	if (q.Report == "content" && q.ContentPage != "all" && q.ContentPage != "rankings" && q.ContentPage != "statistics") || (q.Report != "content" && q.ContentPage != "") {
		return Result{}, errors.New("invalid content scope")
	}
	if (q.startDate == "") != (q.endDate == "") {
		return Result{}, errors.New("invalid fixed period")
	}
	// Bound both quota consumption and concurrent upstream calls; no polling.
	c.mu.Lock()
	defer c.mu.Unlock()
	now := c.now()
	if cached, ok := c.cache[q]; ok && now.Before(cached.until) {
		result := cached.result
		result.Cached = true
		return result, nil
	}
	ctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	table, err := c.run(ctx, requestBody(q, dim))
	if err != nil {
		return Result{}, err
	}
	totals, err := c.run(ctx, requestBody(q, ""))
	if err != nil {
		return Result{}, err
	}
	// GA4 dates are relative to the property's timezone, not the server's.
	zone, err := time.LoadLocation(totals.Metadata.TimeZone)
	if err != nil || totals.Metadata.TimeZone == "" || table.Metadata.TimeZone != totals.Metadata.TimeZone {
		return Result{}, errors.New("missing property timezone")
	}
	end := now.In(zone).AddDate(0, 0, -1)
	result := Result{Source: "ga4", Report: q.Report, Device: q.Device, Breakdown: q.Breakdown, ContentPage: q.ContentPage, Start: now.In(zone).AddDate(0, 0, -q.Days).Format("2006-01-02"), End: end.Format("2006-01-02"), FetchedAt: now.UTC(), Hosts: hosts(), Table: table, Totals: totals}
	if q.startDate != "" {
		result.Start, result.End = q.startDate, q.endDate
	}
	for key, value := range c.cache {
		if now.After(value.until) {
			delete(c.cache, key)
		}
	}
	if len(c.cache) >= 64 {
		clear(c.cache)
	}
	c.cache[q] = cachedResult{result, now.Add(5 * time.Minute)}
	return result, nil
}
