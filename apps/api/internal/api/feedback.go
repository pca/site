package api

import (
	"encoding/json"
	"errors"
	"github.com/pca/backend/internal/store"
	"io"
	"net/http"
)

func (s *Server) handleFeedback(w http.ResponseWriter, r *http.Request) {
	var input store.FeedbackInput
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16384))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&input) != nil || decoder.Decode(&struct{}{}) != io.EOF || !store.ValidateFeedback(input) {
		writeDetail(w, 400, "Review all required fields and attach only the supported page context.")
		return
	}
	f, duplicate, err := store.CreateFeedback(r.Context(), s.db, currentUser(r).ID, input)
	switch {
	case errors.Is(err, store.ErrFeedbackLimit):
		w.Header().Set("Retry-After", "86400")
		writeDetail(w, 429, "You can submit up to three reports in a rolling 24 hours. Please combine related details.")
		return
	case errors.Is(err, store.ErrFeedbackConflict):
		writeDetail(w, 409, "This submission key was already used with different details. Reopen the form to start a new report.")
		return
	case err != nil:
		writeServerError(w)
		return
	}
	code := 201
	if duplicate {
		code = 200
	}
	payload, _ := marshal(map[string]any{"id": f.ID, "status": f.Status, "duplicate": duplicate})
	writeJSON(w, r, code, payload, false)
}
