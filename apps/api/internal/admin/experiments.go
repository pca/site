package admin

import (
	"encoding/json"
	"errors"
	"github.com/pca/backend/internal/store"
	"io"
	"net/http"
)

func (a *Admin) experimentList(w http.ResponseWriter, r *http.Request) {
	if len(r.URL.Query()) != 0 {
		writeError(w, 400, "Experiment plans do not accept report filters.")
		return
	}
	items, err := store.ListExperimentPlans(r.Context(), a.db.Read)
	if err != nil {
		writeError(w, 500, "Plans could not be loaded.")
		return
	}
	writeJSON(w, 200, map[string]any{"items": items, "deliveryEnabled": false})
}
func (a *Admin) experimentSave(w http.ResponseWriter, r *http.Request) {
	var p store.ExperimentPlan
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 20000))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&p) != nil || decoder.Decode(&struct{}{}) != io.EOF {
		writeError(w, 400, "Send one bounded experiment plan.")
		return
	}
	create := r.Method == http.MethodPost
	if !create && p.ID != r.PathValue("id") {
		writeError(w, 400, "Plan ID does not match.")
		return
	}
	result, err := store.SaveExperimentPlan(r.Context(), a.db, current(r).user.ID, p, create)
	switch {
	case errors.Is(err, store.ErrFeedbackInvalid):
		writeError(w, 400, "Check plan fields, planning assumptions and readiness requirements.")
		return
	case errors.Is(err, store.ErrFeedbackConflict):
		writeError(w, 409, "This plan changed. Reload the saved plan before editing again.")
		return
	case errors.Is(err, store.ErrFeedbackLimit):
		writeError(w, 409, "The plan library is full (100). No saved plan was replaced.")
		return
	case errors.Is(err, store.ErrNotFound):
		writeError(w, 404, "Plan not found.")
		return
	case err != nil:
		writeError(w, 500, "Plan could not be saved.")
		return
	}
	code := 200
	if create {
		code = 201
	}
	writeJSON(w, code, result)
}
