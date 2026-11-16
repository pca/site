package admin

import (
	"errors"
	"net/http"

	"github.com/pca/backend/internal/analyticsreport"
)

func (a *Admin) analyticsStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, a.analytics.Status())
}

func (a *Admin) analyticsBehavior(w http.ResponseWriter, r *http.Request) {
	query, err := analyticsreport.ParseBehaviorQuery(r.URL.Query())
	if err != nil {
		writeError(w, 400, "Choose a supported journey/retention report, funnel, period and device.")
		return
	}
	result, err := a.analytics.Behavior(r.Context(), query)
	if errors.Is(err, analyticsreport.ErrNotConfigured) {
		writeError(w, 503, "GA4 reporting is not configured. No sample result is substituted.")
		return
	}
	if err != nil {
		writeError(w, 502, "Google could not provide this behavior report. Check API availability, access and quota. No partial or sample result is substituted.")
		return
	}
	writeJSON(w, 200, result)
}

func (a *Admin) analyticsReport(w http.ResponseWriter, r *http.Request) {
	query, err := analyticsreport.ParseQuery(r.URL.Query())
	if err != nil {
		writeError(w, http.StatusBadRequest, "Choose a supported report, period, device and breakdown.")
		return
	}
	report, err := a.analytics.Report(r.Context(), query)
	if errors.Is(err, analyticsreport.ErrNotConfigured) {
		writeError(w, http.StatusServiceUnavailable, "GA4 reporting is not configured. Sample reports are available separately.")
		return
	}
	if err != nil {
		// Do not expose upstream bodies, tokens, credential paths or account details.
		writeError(w, http.StatusBadGateway, "GA4 could not return this report. Check the property, Viewer access, enabled Data API and quota; then retry.")
		return
	}
	writeJSON(w, http.StatusOK, report)
}

func (a *Admin) analyticsRelease(w http.ResponseWriter, r *http.Request) {
	query, err := analyticsreport.ParseReleaseQuery(r.URL.Query())
	if err != nil {
		writeError(w, http.StatusBadRequest, "Choose a valid release date, 7 or 28 days, device and trend/device/source view.")
		return
	}
	result, err := a.analytics.ReleaseComparison(r.Context(), query)
	if errors.Is(err, analyticsreport.ErrNotConfigured) {
		writeError(w, http.StatusServiceUnavailable, "GA4 reporting is not configured. No sample comparison is substituted.")
		return
	}
	if errors.Is(err, analyticsreport.ErrComparisonWindow) {
		writeError(w, http.StatusBadRequest, "Both comparison windows must be complete and within the last 180 days. The release day is excluded.")
		return
	}
	if err != nil {
		writeError(w, http.StatusBadGateway, "The comparison could not be loaded. Check Google access and report availability; no partial result is shown.")
		return
	}
	writeJSON(w, http.StatusOK, result)
}
