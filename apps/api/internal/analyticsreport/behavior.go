package analyticsreport

// Fixed reports only: no raw visitor histories, arbitrary event queries or new identity store.
import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type BehaviorQuery struct {
	Kind, Device, Funnel string
	Days                 int
}
type FunnelStepResult struct {
	Name  string `json:"name"`
	Event string `json:"event"`
	Users *int64 `json:"users"`
}
type CohortResult struct {
	Start  string   `json:"start"`
	End    string   `json:"end"`
	Size   *int64   `json:"size"`
	Counts []*int64 `json:"counts"`
}
type BehaviorResult struct {
	Source    string             `json:"source"`
	Kind      string             `json:"kind"`
	Device    string             `json:"device"`
	Funnel    string             `json:"funnel"`
	Days      int                `json:"days"`
	Start     string             `json:"start"`
	End       string             `json:"end"`
	TimeZone  string             `json:"timeZone"`
	FetchedAt time.Time          `json:"fetchedAt"`
	Cached    bool               `json:"cached"`
	Hosts     []string           `json:"hosts"`
	Steps     []FunnelStepResult `json:"steps"`
	Cohorts   []CohortResult     `json:"cohorts"`
	Limited   bool               `json:"limited"`
}
type cachedBehavior struct {
	result BehaviorResult
	until  time.Time
}
type funnelDefinition struct{ Name, Event, Page string }

func funnelDefinitions(id string) []funnelDefinition {
	switch id {
	case "region":
		return []funnelDefinition{{"Prompt visible", "region_prompt_viewed", ""}, {"WCA login started", "wca_login_started", ""}, {"WCA login completed", "wca_login_completed", ""}, {"Region submitted", "region_request_submitted", ""}}
	case "rankings_statistics":
		return []funnelDefinition{{"Rankings viewed", "page_view", "/regional-rankings"}, {"Statistics viewed", "page_view", "/regional-statistics"}}
	}
	return nil
}
func ParseBehaviorQuery(v url.Values) (BehaviorQuery, error) {
	for key, items := range v {
		if (key != "kind" && key != "days" && key != "device" && key != "funnel") || len(items) != 1 {
			return BehaviorQuery{}, errors.New("unsupported parameter")
		}
	}
	base, err := ParseQuery(url.Values{"report": {"pages"}, "days": {v.Get("days")}, "device": {v.Get("device")}})
	q := BehaviorQuery{Kind: v.Get("kind"), Device: base.Device, Days: base.Days, Funnel: v.Get("funnel")}
	if err != nil || (q.Kind != "journeys" && q.Kind != "retention") {
		return q, errors.New("unsupported behavior report")
	}
	if q.Kind == "journeys" {
		if q.Funnel == "" {
			q.Funnel = "region"
		}
		if funnelDefinitions(q.Funnel) == nil {
			return q, errors.New("unsupported funnel")
		}
	} else if q.Funnel != "" {
		return q, errors.New("funnel applies only to journeys")
	}
	return q, nil
}
func behaviorFilters(device string) map[string]any {
	filters := []any{stringFilter("hostName", hosts())}
	if device != "all" {
		filters = append(filters, stringFilter("deviceCategory", []string{device}))
	}
	return map[string]any{"andGroup": map[string]any{"expressions": filters}}
}
func funnelBody(q BehaviorQuery, start, end string) map[string]any {
	steps := []any{}
	for i, s := range funnelDefinitions(q.Funnel) {
		expr := map[string]any{"funnelEventFilter": map[string]any{"eventName": s.Event}}
		if s.Page != "" {
			expr = map[string]any{"andGroup": map[string]any{"expressions": []any{expr, map[string]any{"funnelFieldFilter": map[string]any{"fieldName": "pagePath", "inListFilter": map[string]any{"values": []string{s.Page, s.Page + "/"}, "caseSensitive": true}}}}}}
		}
		step := map[string]any{"name": s.Name, "isDirectlyFollowedBy": false, "filterExpression": expr}
		if i > 0 {
			step["withinDurationFromPriorStep"] = "1800s"
		}
		steps = append(steps, step)
	}
	return map[string]any{"dateRanges": []any{map[string]string{"startDate": start, "endDate": end}}, "funnel": map[string]any{"isOpenFunnel": false, "steps": steps}, "dimensionFilter": behaviorFilters(q.Device), "limit": "20", "returnPropertyQuota": false}
}
func (c *Client) runFunnel(ctx context.Context, body map[string]any) (Table, error) {
	payload, err := json.Marshal(body)
	if err != nil {
		return Table{}, err
	}
	endpoint := strings.Replace(c.baseURL, "/v1beta/", "/v1alpha/", 1) + c.property + ":runFunnelReport"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return Table{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	response, err := c.http.Do(req)
	if err != nil {
		return Table{}, errors.New("funnel transport unavailable")
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return Table{}, errors.New("funnel unavailable")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, (2<<20)+1))
	if err != nil || len(data) > 2<<20 {
		return Table{}, errors.New("invalid funnel response size")
	}
	var result struct {
		Table Table `json:"funnelTable"`
	}
	if json.Unmarshal(data, &result) != nil {
		return Table{}, errors.New("invalid funnel response")
	}
	t := result.Table
	if len(t.DimensionHeaders) != 1 || t.DimensionHeaders[0].Name != "funnelStepName" || len(t.Rows) > 4 || len(t.MetricHeaders) > 10 {
		return Table{}, errors.New("invalid funnel shape")
	}
	return t, nil
}
func countValue(value string) (int64, error) {
	n, err := strconv.ParseInt(value, 10, 64)
	if err != nil || n < 0 || n > 1e15 {
		return 0, errors.New("invalid count")
	}
	return n, nil
}
func extractFunnel(table Table, q BehaviorQuery) ([]FunnelStepResult, bool, error) {
	metricIndex := -1
	for i, column := range table.MetricHeaders {
		if column.Name == "activeUsers" {
			if metricIndex != -1 {
				return nil, false, errors.New("duplicate metric")
			}
			metricIndex = i
		}
	}
	if metricIndex < 0 {
		return nil, false, errors.New("missing users")
	}
	definitions := funnelDefinitions(q.Funnel)
	steps := make([]FunnelStepResult, len(definitions))
	seen := map[int]bool{}
	for i, d := range definitions {
		steps[i] = FunnelStepResult{Name: d.Name, Event: d.Event}
	}
	for _, row := range table.Rows {
		if len(row.DimensionValues) != 1 || len(row.MetricValues) != len(table.MetricHeaders) {
			return nil, false, errors.New("invalid funnel row")
		}
		value := row.DimensionValues[0].Value
		index := -1
		for i, d := range definitions {
			if value == fmt.Sprintf("%d. %s", i+1, d.Name) {
				index = i
			}
		}
		if index < 0 || seen[index] {
			return nil, false, errors.New("unexpected funnel step")
		}
		seen[index] = true
		count, err := countValue(row.MetricValues[metricIndex].Value)
		if err != nil {
			return nil, false, err
		}
		steps[index].Users = &count
	}
	var previous *int64
	for _, step := range steps {
		if step.Users != nil {
			if previous != nil && *step.Users > *previous {
				return nil, false, errors.New("non-nested funnel")
			}
			previous = step.Users
		}
	}
	return steps, len(seen) != len(steps) || len(table.Metadata.SamplingMetadatas) > 0, nil
}
func cohortWindows(end string, zone *time.Location) []CohortResult {
	day, _ := time.ParseInLocation("2006-01-02", end, zone)
	today := day.AddDate(0, 0, 1)
	latest := today.AddDate(0, 0, -int(today.Weekday())-7)
	result := []CohortResult{}
	for i := 5; i >= 0; i-- {
		start := latest.AddDate(0, 0, -7*i)
		result = append(result, CohortResult{Start: start.Format("2006-01-02"), End: start.AddDate(0, 0, 6).Format("2006-01-02"), Counts: make([]*int64, 5)})
	}
	return result
}
func cohortBody(q BehaviorQuery, groups []CohortResult) map[string]any {
	cohorts := []any{}
	for i, g := range groups {
		cohorts = append(cohorts, map[string]any{"name": fmt.Sprintf("start_%d", i), "dimension": "firstSessionDate", "dateRange": map[string]string{"startDate": g.Start, "endDate": g.End}})
	}
	return map[string]any{"dimensions": []Column{{"cohort"}, {"cohortNthWeek"}}, "metrics": []Column{{"cohortActiveUsers"}, {"cohortTotalUsers"}}, "dimensionFilter": behaviorFilters(q.Device), "cohortSpec": map[string]any{"cohorts": cohorts, "cohortsRange": map[string]any{"granularity": "WEEKLY", "startOffset": 0, "endOffset": 4}}, "limit": rowLimit, "returnPropertyQuota": false}
}
func extractCohorts(table Table, groups []CohortResult, end string) ([]CohortResult, bool, error) {
	seen := map[string]bool{}
	for _, row := range table.Rows {
		if len(row.DimensionValues) != 2 || len(row.MetricValues) != 2 {
			return nil, false, errors.New("invalid cohort row")
		}
		group := -1
		for i := range groups {
			if row.DimensionValues[0].Value == fmt.Sprintf("start_%d", i) {
				group = i
			}
		}
		week, err := strconv.Atoi(row.DimensionValues[1].Value)
		if err != nil || group < 0 || week < 0 || week > 4 {
			return nil, false, errors.New("unexpected cohort")
		}
		key := fmt.Sprintf("%d/%d", group, week)
		if seen[key] {
			return nil, false, errors.New("duplicate cohort cell")
		}
		seen[key] = true
		active, err := countValue(row.MetricValues[0].Value)
		if err != nil {
			return nil, false, err
		}
		total, err := countValue(row.MetricValues[1].Value)
		if err != nil || active > total {
			return nil, false, errors.New("invalid cohort denominator")
		}
		start, _ := time.Parse("2006-01-02", groups[group].Start)
		if start.AddDate(0, 0, week*7+6).Format("2006-01-02") > end {
			continue
		} // Never show an unfinished follow-up week as zero.
		if groups[group].Size != nil && *groups[group].Size != total {
			return nil, false, errors.New("inconsistent cohort size")
		}
		groups[group].Size = &total
		groups[group].Counts[week] = &active
	}
	limited := table.RowCount > len(table.Rows) || table.Metadata.SubjectToThresholding || table.Metadata.DataLossFromOtherRow || len(table.Metadata.SamplingMetadatas) > 0
	return groups, limited, nil
}
func (c *Client) Behavior(ctx context.Context, q BehaviorQuery) (BehaviorResult, error) {
	validated, err := ParseBehaviorQuery(url.Values{"kind": {q.Kind}, "days": {strconv.Itoa(q.Days)}, "device": {q.Device}, "funnel": {q.Funnel}})
	if err != nil || validated != q {
		return BehaviorResult{}, errors.New("invalid behavior query")
	}
	if c.state != "ready" {
		return BehaviorResult{}, ErrNotConfigured
	}
	// An existing bounded report supplies the actual property timezone and exact complete dates.
	anchor, err := c.Report(ctx, Query{Report: "pages", Device: q.Device, Days: q.Days})
	if err != nil {
		return BehaviorResult{}, err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	now := c.now()
	if cached, ok := c.behaviorCache[q]; ok && now.Before(cached.until) && cached.result.End == anchor.End {
		r := cached.result
		r.Cached = true
		return r, nil
	}
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	result := BehaviorResult{Source: "ga4", Kind: q.Kind, Device: q.Device, Funnel: q.Funnel, Days: q.Days, Start: anchor.Start, End: anchor.End, TimeZone: anchor.Totals.Metadata.TimeZone, FetchedAt: now.UTC(), Hosts: hosts(), Steps: []FunnelStepResult{}, Cohorts: []CohortResult{}}
	if q.Kind == "journeys" {
		table, e := c.runFunnel(ctx, funnelBody(q, anchor.Start, anchor.End))
		if e != nil {
			return BehaviorResult{}, e
		}
		result.Steps, result.Limited, err = extractFunnel(table, q)
	} else {
		zone, _ := time.LoadLocation(result.TimeZone)
		groups := cohortWindows(anchor.End, zone)
		table, e := c.run(ctx, cohortBody(q, groups))
		if e != nil {
			return BehaviorResult{}, e
		}
		if table.Metadata.TimeZone != "" && table.Metadata.TimeZone != result.TimeZone {
			return BehaviorResult{}, errors.New("cohort timezone changed")
		}
		result.Start = groups[0].Start
		result.Cohorts, result.Limited, err = extractCohorts(table, groups, anchor.End)
	}
	if err != nil {
		return BehaviorResult{}, err
	}
	if c.behaviorCache == nil || len(c.behaviorCache) >= 32 {
		c.behaviorCache = make(map[BehaviorQuery]cachedBehavior)
	}
	c.behaviorCache[q] = cachedBehavior{result, now.Add(5 * time.Minute)}
	return result, nil
}
