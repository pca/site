package admin

import (
	"net/http"
	"strings"

	"github.com/pca/backend/internal/jobs"
)

func (a *Admin) scheduleJSON(r *http.Request) (map[string]any, error) {
	stored, err := jobs.ReadSchedule(r.Context(), a.db.Read)
	if err != nil {
		return nil, err
	}
	expr := jobs.EffectiveCron(stored, a.cfg.SyncCron)
	out := map[string]any{
		"cron":         expr,
		"default_cron": a.cfg.SyncCron,
		"custom":       stored != nil,
		"updated_by":   nil,
		"updated_at":   nil,
		"next_runs":    jobs.NextRuns(expr, 5),
	}
	if stored != nil {
		out["updated_by"] = stored.UpdatedBy
		out["updated_at"] = stored.UpdatedAt
	}
	return out, nil
}

func (a *Admin) getSchedule(w http.ResponseWriter, r *http.Request) {
	out, err := a.scheduleJSON(r)
	if err != nil {
		a.serverError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// setSchedule stores a cron expression; "" turns scheduled syncs off.
func (a *Admin) setSchedule(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Cron *string `json:"cron"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	if body.Cron == nil {
		writeError(w, http.StatusBadRequest, "cron is required; use an empty string to turn scheduled syncs off.")
		return
	}
	expr := strings.Join(strings.Fields(*body.Cron), " ")
	if expr != "" {
		if _, err := jobs.ParseCron(expr); err != nil {
			writeError(w, http.StatusBadRequest, "Invalid schedule: "+err.Error()+".")
			return
		}
	}
	by := current(r).user.Username
	if _, err := jobs.WriteSchedule(r.Context(), a.db.Write, expr, by); err != nil {
		a.serverError(w, r, err)
		return
	}
	a.log.Info("sync schedule changed", "cron", expr, "by", by)
	msg := "Sync schedule saved."
	if expr == "" {
		msg = "Scheduled syncs are off."
	}
	a.respondSchedule(w, r, msg)
}

func (a *Admin) resetSchedule(w http.ResponseWriter, r *http.Request) {
	if err := jobs.ClearSchedule(r.Context(), a.db.Write); err != nil {
		a.serverError(w, r, err)
		return
	}
	a.log.Info("sync schedule reset to SYNC_CRON", "cron", a.cfg.SyncCron, "by", current(r).user.Username)
	a.respondSchedule(w, r, "Sync schedule reset to the server default.")
}

func (a *Admin) respondSchedule(w http.ResponseWriter, r *http.Request, msg string) {
	out, err := a.scheduleJSON(r)
	if err != nil {
		a.serverError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": msg, "schedule": out})
}
