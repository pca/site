package admin

import "net/http"

func (a *Admin) getMaintenance(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, a.maintenance.State())
}

func (a *Admin) setMaintenance(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Enabled *bool `json:"enabled"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	if body.Enabled == nil {
		writeError(w, http.StatusBadRequest, "enabled must be true or false.")
		return
	}
	by := current(r).user.Username
	state, err := a.maintenance.Set(r.Context(), *body.Enabled, by)
	if err != nil {
		a.serverError(w, r, err)
		return
	}
	a.log.Info("maintenance mode changed", "enabled", state.Enabled, "by", by)
	msg := "The public site is back online."
	if state.Enabled {
		msg = "The public site now shows the maintenance page."
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": msg, "state": state})
}
