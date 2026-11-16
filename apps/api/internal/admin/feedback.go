package admin

import (
	"encoding/json"
	"errors"
	"github.com/pca/backend/internal/store"
	"io"
	"net/http"
	"strconv"
)

func (a *Admin) feedbackList(w http.ResponseWriter, r *http.Request) {
	v := r.URL.Query()
	for key, values := range v {
		if (key != "type" && key != "status" && key != "page" && key != "q" && key != "offset") || len(values) != 1 {
			writeError(w, 400, "Unsupported inbox filter.")
			return
		}
	}
	offset := 0
	var err error
	if v.Get("offset") != "" {
		offset, err = strconv.Atoi(v.Get("offset"))
	}
	f := store.FeedbackFilter{Type: v.Get("type"), Status: v.Get("status"), Page: v.Get("page"), Query: v.Get("q"), Offset: offset}
	if err != nil || offset < 0 || offset > 100000 || (f.Type != "" && !store.FeedbackType(f.Type)) || (f.Status != "" && !store.FeedbackStatus(f.Status)) || (f.Page != "" && f.Page != "rankings" && f.Page != "statistics") || len(f.Query) > 120 {
		writeError(w, 400, "Choose a supported inbox filter.")
		return
	}
	items, total, err := store.ListFeedback(r.Context(), a.db.Read, f)
	if err != nil {
		writeError(w, 500, "The inbox could not be loaded.")
		return
	}
	writeJSON(w, 200, map[string]any{"items": items, "total": total, "offset": offset, "limit": 30})
}
func (a *Admin) feedbackDetail(w http.ResponseWriter, r *http.Request) {
	f, err := store.GetFeedback(r.Context(), a.db.Read, r.PathValue("id"))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, 404, "Report not found.")
		return
	}
	if err != nil {
		writeError(w, 500, "Report unavailable.")
		return
	}
	history, err := store.FeedbackHistory(r.Context(), a.db.Read, f.ID)
	if err != nil {
		writeError(w, 500, "Review history unavailable.")
		return
	}
	writeJSON(w, 200, map[string]any{"report": f, "history": history})
}
func (a *Admin) feedbackReview(w http.ResponseWriter, r *http.Request) {
	var review store.FeedbackReview
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16384))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&review) != nil || decoder.Decode(&struct{}{}) != io.EOF {
		writeError(w, 400, "Send one bounded review object.")
		return
	}
	f, err := store.ReviewFeedback(r.Context(), a.db, r.PathValue("id"), current(r).user.ID, review)
	switch {
	case errors.Is(err, store.ErrFeedbackInvalid):
		writeError(w, 400, "Choose a valid type/status and a review note up to 2000 characters.")
		return
	case errors.Is(err, store.ErrFeedbackConflict):
		writeError(w, 409, "Another reviewer changed this report. Reload it before saving.")
		return
	case errors.Is(err, store.ErrNotFound):
		writeError(w, 404, "Report not found.")
		return
	case err != nil:
		writeError(w, 500, "The review could not be saved.")
		return
	}
	writeJSON(w, 200, f)
}
