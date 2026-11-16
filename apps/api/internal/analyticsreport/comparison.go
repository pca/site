package analyticsreport

import (
	"context"
	"errors"
	"net/url"
	"time"
)

var ErrComparisonWindow = errors.New("choose complete comparison windows within the last 180 days")

type ReleaseQuery struct {
	Date              string
	Days              int
	Device, Breakdown string
}
type ReleaseResult struct {
	Source      string `json:"source"`
	ReleaseDate string `json:"releaseDate"`
	Days        int    `json:"days"`
	Device      string `json:"device"`
	Breakdown   string `json:"breakdown"`
	Before      Result `json:"before"`
	After       Result `json:"after"`
}

func ParseReleaseQuery(values url.Values) (ReleaseQuery, error) {
	for key, items := range values {
		if (key != "date" && key != "days" && key != "device" && key != "breakdown") || len(items) != 1 {
			return ReleaseQuery{}, ErrComparisonWindow
		}
	}
	date, err := time.Parse("2006-01-02", values.Get("date"))
	if err != nil || date.Format("2006-01-02") != values.Get("date") {
		return ReleaseQuery{}, ErrComparisonWindow
	}
	base, err := ParseQuery(url.Values{"report": {"pages"}, "breakdown": {"date"}, "days": {values.Get("days")}, "device": {values.Get("device")}})
	if err != nil {
		return ReleaseQuery{}, ErrComparisonWindow
	}
	if values.Get("days") == "" {
		base.Days = 7
	}
	breakdown := values.Get("breakdown")
	if breakdown == "" {
		breakdown = "trend"
	}
	if breakdown != "trend" && breakdown != "device" && breakdown != "source" {
		return ReleaseQuery{}, ErrComparisonWindow
	}
	return ReleaseQuery{date.Format("2006-01-02"), base.Days, base.Device, breakdown}, nil
}

// ReleaseComparison is descriptive: two equal, complete date windows, with the
// mixed deployment day excluded. It neither records nor launches a deployment.
func (c *Client) ReleaseComparison(ctx context.Context, q ReleaseQuery) (ReleaseResult, error) {
	if c.state != "ready" {
		return ReleaseResult{}, ErrNotConfigured
	}
	date, err := time.Parse("2006-01-02", q.Date)
	if err != nil || (q.Days != 7 && q.Days != 28) || (q.Device != "all" && q.Device != "mobile" && q.Device != "desktop" && q.Device != "tablet") {
		return ReleaseResult{}, ErrComparisonWindow
	}
	beforeStart, beforeEnd := date.AddDate(0, 0, -q.Days), date.AddDate(0, 0, -1)
	afterStart, afterEnd := date.AddDate(0, 0, 1), date.AddDate(0, 0, q.Days)
	now := c.now()
	if beforeStart.Before(now.UTC().AddDate(0, 0, -181)) || afterEnd.After(now.UTC().AddDate(0, 0, 1)) {
		return ReleaseResult{}, ErrComparisonWindow
	}
	kind, breakdown := "pages", "date"
	switch q.Breakdown {
	case "trend":
	case "device":
		kind, breakdown = "audience", "device"
	case "source":
		kind, breakdown = "acquisition", "source"
	default:
		return ReleaseResult{}, ErrComparisonWindow
	}
	query := Query{Report: kind, Breakdown: breakdown, Device: q.Device, Days: q.Days, startDate: beforeStart.Format("2006-01-02"), endDate: beforeEnd.Format("2006-01-02")}
	before, err := c.Report(ctx, query)
	if err != nil {
		return ReleaseResult{}, err
	}
	zone, err := time.LoadLocation(before.Totals.Metadata.TimeZone)
	if err != nil || afterEnd.Format("2006-01-02") >= now.In(zone).Format("2006-01-02") {
		return ReleaseResult{}, ErrComparisonWindow
	}
	// Enforce the history bound in the property timezone, not just server UTC.
	if beforeStart.Format("2006-01-02") < now.In(zone).AddDate(0, 0, -180).Format("2006-01-02") {
		return ReleaseResult{}, ErrComparisonWindow
	}
	query.startDate, query.endDate = afterStart.Format("2006-01-02"), afterEnd.Format("2006-01-02")
	after, err := c.Report(ctx, query)
	if err != nil {
		return ReleaseResult{}, err
	}
	if before.Totals.Metadata.TimeZone != after.Totals.Metadata.TimeZone {
		return ReleaseResult{}, errors.New("comparison timezone changed")
	}
	return ReleaseResult{"ga4", q.Date, q.Days, q.Device, q.Breakdown, before, after}, nil
}
