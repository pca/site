package admin

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/pca/backend/internal/auth"
	"github.com/pca/backend/internal/db"
	"github.com/pca/backend/internal/jobs"
	"github.com/pca/backend/internal/regions"
	"github.com/pca/backend/internal/store"
)

// Response shapes.

func timeJSON(t db.Time) *string {
	if !t.Valid {
		return nil
	}
	s := t.Time.UTC().Format(time.RFC3339)
	return &s
}

func nullJSON(s sql.NullString) *string {
	if !s.Valid || s.String == "" {
		return nil
	}
	return &s.String
}

type userJSON struct {
	ID              int64   `json:"id"`
	Username        string  `json:"username"`
	Name            string  `json:"name"`
	FirstName       string  `json:"first_name"`
	LastName        string  `json:"last_name"`
	Email           string  `json:"email"`
	WCAID           *string `json:"wca_id"`
	Region          *string `json:"region"`
	RegionUpdatedAt *string `json:"region_updated_at"`
	IsStaff         bool    `json:"is_staff"`
	IsSuperuser     bool    `json:"is_superuser"`
	IsActive        bool    `json:"is_active"`
	HasWCAAccount   bool    `json:"has_wca_account"`
	HasPassword     bool    `json:"has_password"`
	RequestCount    int     `json:"request_count"`
	DateJoined      *string `json:"date_joined"`
	LastLogin       *string `json:"last_login"`
}

func adminUserJSON(u store.AdminUser) userJSON {
	return userJSON{
		ID: u.ID, Username: u.Username, Name: u.DisplayName(), FirstName: u.FirstName, LastName: u.LastName,
		Email: u.Email, WCAID: nullJSON(u.WCAID), Region: nullJSON(u.Region), RegionUpdatedAt: timeJSON(u.RegionUpdatedAt),
		IsStaff: u.IsStaff, IsSuperuser: u.IsSuperuser, IsActive: u.IsActive, HasWCAAccount: u.HasWCAAccount,
		HasPassword: auth.UsablePassword(u.Password), RequestCount: u.RequestCount,
		DateJoined: timeJSON(u.DateJoined), LastLogin: timeJSON(u.LastLogin),
	}
}

func sessionUser(u *store.User) map[string]any {
	name := strings.TrimSpace(u.FirstName + " " + u.LastName)
	if name == "" {
		name = u.Username
	}
	return map[string]any{"id": u.ID, "username": u.Username, "name": name, "is_superuser": u.IsSuperuser}
}

type requestJSON struct {
	ID         int64   `json:"id"`
	UserID     int64   `json:"user_id"`
	Region     string  `json:"region"`
	Status     string  `json:"status"`
	StaffNotes string  `json:"staff_notes"`
	CreatedAt  *string `json:"created_at"`
	UpdatedAt  *string `json:"updated_at"`
}

func regionRequestJSON(r store.RegionRequest) requestJSON {
	return requestJSON{ID: r.ID, UserID: r.UserID, Region: r.Region, Status: r.Status, StaffNotes: r.StaffNotes,
		CreatedAt: timeJSON(r.CreatedAt), UpdatedAt: timeJSON(r.UpdatedAt)}
}

type adminRequestJSON struct {
	requestJSON
	User struct {
		Username string  `json:"username"`
		Name     string  `json:"name"`
		WCAID    *string `json:"wca_id"`
		Region   *string `json:"region"`
	} `json:"user"`
}

func adminRequestsJSON(list []store.AdminRequest) []adminRequestJSON {
	out := make([]adminRequestJSON, len(list))
	for i, r := range list {
		out[i].requestJSON = regionRequestJSON(r.RegionRequest)
		out[i].User.Username = r.Username
		out[i].User.Name = r.DisplayName()
		out[i].User.WCAID = nullJSON(r.WCAID)
		out[i].User.Region = nullJSON(r.CurrentRegion)
	}
	return out
}

type jobJSON struct {
	ID          int64   `json:"id"`
	Kind        string  `json:"kind"`
	KindLabel   string  `json:"kind_label"`
	Status      string  `json:"status"`
	Source      string  `json:"source"`
	RequestedBy string  `json:"requested_by"`
	Force       bool    `json:"force"`
	Error       string  `json:"error"`
	CreatedAt   *string `json:"created_at"`
	StartedAt   *string `json:"started_at"`
	FinishedAt  *string `json:"finished_at"`
	DurationMS  int64   `json:"duration_ms"`
	Log         *string `json:"log,omitempty"`
}

func toJobJSON(j jobs.Job, withLog bool) jobJSON {
	out := jobJSON{ID: j.ID, Kind: j.Kind, KindLabel: j.KindLabel(), Status: j.Status, Source: j.Source,
		RequestedBy: j.RequestedBy, Force: j.Options.Force, Error: j.Error, CreatedAt: timeJSON(j.CreatedAt),
		StartedAt: timeJSON(j.StartedAt), FinishedAt: timeJSON(j.FinishedAt), DurationMS: j.Duration().Milliseconds()}
	if withLog {
		out.Log = &j.Log
	}
	return out
}

func jobsJSON(list []jobs.Job) []jobJSON {
	out := make([]jobJSON, len(list))
	for i, j := range list {
		out[i] = toJobJSON(j, false)
	}
	return out
}

func (a *Admin) meta() map[string]any {
	kinds := []map[string]string{}
	for _, k := range []string{jobs.KindSync, jobs.KindStatistics, jobs.KindAssignRegions} {
		kinds = append(kinds, map[string]string{"id": k, "label": jobs.KindLabels[k]})
	}
	regionList := make([]map[string]string, len(regions.Regions))
	for i, reg := range regions.Regions {
		regionList[i] = map[string]string{"id": reg.ID, "name": reg.Name}
	}
	return map[string]any{
		"regions":                 regionList,
		"job_kinds":               kinds,
		"auto_rebuild_statistics": a.cfg.AutoRebuildStatistics,
	}
}

func (a *Admin) workerJSON(r *http.Request) map[string]any {
	heartbeat, _ := jobs.ReadHeartbeat(r.Context(), a.db.Read)
	importState, _ := jobs.ReadImportState(r.Context(), a.db.Read)
	out := map[string]any{"alive": false, "heartbeat": nil, "import": nil}
	if heartbeat != nil {
		out["alive"] = heartbeat.Alive(a.cfg.JobPollInterval)
		out["heartbeat"] = heartbeat
	}
	if importState != nil {
		out["import"] = importState
	}
	return out
}

func statusCounts(counts map[string]int) map[string]int {
	return map[string]int{
		"pending":  counts[store.StatusPending],
		"approved": counts[store.StatusApproved],
		"denied":   counts[store.StatusDenied],
	}
}

// Dashboard.

func (a *Admin) dashboard(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	counts, err := store.CountRequestsByStatus(ctx, a.db.Read)
	if err != nil {
		a.serverError(w, r, err)
		return
	}
	byRegion, totalUsers, err := store.CountUsersByRegion(ctx, a.db.Read)
	if err != nil {
		a.serverError(w, r, err)
		return
	}
	regionCounts := make([]map[string]any, 0, len(regions.Regions)+1)
	for _, reg := range regions.Regions {
		regionCounts = append(regionCounts, map[string]any{"id": reg.ID, "name": reg.Name, "count": byRegion[reg.ID]})
	}
	regionCounts = append(regionCounts, map[string]any{"id": "none", "name": "No region", "count": byRegion[""]})

	pending, _, err := store.ListAdminRequests(ctx, a.db.Read, store.RequestFilter{Status: store.StatusPending, Limit: 6})
	if err != nil {
		a.serverError(w, r, err)
		return
	}
	recentJobs, _, err := jobs.List(ctx, a.db.Read, 6, 0)
	if err != nil {
		a.serverError(w, r, err)
		return
	}
	var snapshot any
	var s struct {
		ID            int64
		ExportVersion string
		LatestYear    int
		ActivatedAt   db.Time
	}
	err = a.db.Read.QueryRowContext(ctx, `SELECT id, export_version, latest_year, activated_at FROM api_statisticssnapshot
		WHERE is_active = 1 AND status = 'ready' ORDER BY id LIMIT 1`).Scan(&s.ID, &s.ExportVersion, &s.LatestYear, &s.ActivatedAt)
	switch {
	case err == nil:
		snapshot = map[string]any{"id": s.ID, "export_version": s.ExportVersion, "latest_year": s.LatestYear,
			"activated_at": timeJSON(s.ActivatedAt)}
	case !errors.Is(err, sql.ErrNoRows):
		a.serverError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"request_counts": statusCounts(counts),
		"users_total":    totalUsers,
		"regions":        regionCounts,
		"pending":        adminRequestsJSON(pending),
		"jobs":           jobsJSON(recentJobs),
		"worker":         a.workerJSON(r),
		"snapshot":       snapshot,
	})
}

// Region update requests.

func (a *Admin) listRequests(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	status := q.Get("status")
	switch status {
	case "all":
		status = ""
	case store.StatusPending, store.StatusApproved, store.StatusDenied:
	default:
		status = store.StatusPending
	}
	page := pageParam(r)
	f := store.RequestFilter{Status: status, Query: q.Get("q"), Region: q.Get("region"),
		Limit: pageSize, Offset: (page - 1) * pageSize}
	list, total, err := store.ListAdminRequests(r.Context(), a.db.Read, f)
	if err != nil {
		a.serverError(w, r, err)
		return
	}
	counts, err := store.CountRequestsByStatus(r.Context(), a.db.Read)
	if err != nil {
		a.serverError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items": adminRequestsJSON(list), "total": total, "page": page, "pages": pages(total),
		"page_size": pageSize, "counts": statusCounts(counts),
	})
}

var decisionStatus = map[string]string{
	"approve": store.StatusApproved,
	"deny":    store.StatusDenied,
	"reopen":  store.StatusPending,
}

func (a *Admin) decideRequests(w http.ResponseWriter, r *http.Request) {
	var body struct {
		IDs    []int64 `json:"ids"`
		Action string  `json:"action"`
		Notes  string  `json:"notes"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	status, ok := decisionStatus[body.Action]
	if !ok {
		writeError(w, http.StatusBadRequest, "Choose approve, deny or reopen.")
		return
	}
	if len(body.IDs) == 0 {
		writeError(w, http.StatusBadRequest, "Select at least one request.")
		return
	}
	var notes *string
	if n := strings.TrimSpace(body.Notes); n != "" {
		notes = &n
	}
	regionChanged := false
	updated := 0
	err := a.db.Tx(r.Context(), func(tx *sql.Tx) error {
		for _, id := range body.IDs {
			changed, err := store.DecideRequest(r.Context(), tx, id, status, notes)
			if errors.Is(err, store.ErrNotFound) {
				continue
			}
			if err != nil {
				return err
			}
			updated++
			regionChanged = regionChanged || changed
		}
		return nil
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not update requests: "+err.Error())
		return
	}
	msg := fmt.Sprintf("%d %s marked %s.", updated, plural(updated, "request"), strings.ToLower(store.StatusDisplay[status]))
	if regionChanged {
		msg += " User regions were updated." + a.afterRegionChange(r.Context(), current(r).user.Username)
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": msg, "updated": updated, "regions_changed": regionChanged})
}

// Users.

func (a *Admin) listUsers(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	page := pageParam(r)
	f := store.UserFilter{Query: q.Get("q"), Region: q.Get("region"), Staff: q.Get("staff") == "1",
		Limit: pageSize, Offset: (page - 1) * pageSize}
	if f.Region != "" && f.Region != "none" && !regions.Valid(f.Region) {
		f.Region = ""
	}
	list, total, err := store.ListAdminUsers(r.Context(), a.db.Read, f)
	if err != nil {
		a.serverError(w, r, err)
		return
	}
	items := make([]userJSON, len(list))
	for i, u := range list {
		items[i] = adminUserJSON(u)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items": items, "total": total, "page": page, "pages": pages(total), "page_size": pageSize,
	})
}

var wcaIDPattern = regexp.MustCompile(`^[0-9]{4}[A-Z]{4}[0-9]{2}$`)

// createUser adds a WCA ID to region mapping without an account. The person
// can later sign in with WCA and keep it.
func (a *Admin) createUser(w http.ResponseWriter, r *http.Request) {
	var body struct {
		WCAID  string `json:"wca_id"`
		Region string `json:"region"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	ctx := r.Context()
	wcaID := strings.ToUpper(strings.TrimSpace(body.WCAID))
	region := body.Region
	if !wcaIDPattern.MatchString(wcaID) {
		writeError(w, http.StatusBadRequest, "Enter a WCA ID like 2016JRAC01.")
		return
	}
	if region != "" && !regions.Valid(region) {
		writeError(w, http.StatusBadRequest, "Choose a valid region.")
		return
	}
	if id, exists, err := store.UserIDByWCAID(ctx, a.db.Read, wcaID); err != nil {
		a.serverError(w, r, err)
		return
	} else if exists {
		writeJSON(w, http.StatusConflict, map[string]any{
			"error": wcaID + " already has a user. You can change the region there.", "user_id": id})
		return
	}
	name, found, err := store.PersonName(ctx, a.db.Read, wcaID)
	if err != nil {
		a.serverError(w, r, err)
		return
	}
	if !found {
		writeError(w, http.StatusBadRequest, wcaID+" is not a Filipino competitor in the imported WCA data.")
		return
	}
	var id int64
	err = a.db.Tx(ctx, func(tx *sql.Tx) error {
		username, err := store.UniqueUsername(ctx, tx, wcaID)
		if err != nil {
			return err
		}
		nu := store.NewUser{Username: username, WCAID: &wcaID}
		if region != "" {
			nu.Region = &region
		}
		id, err = store.CreateUser(ctx, tx, nu)
		return err
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not create the user: "+err.Error())
		return
	}
	msg := "Added " + name + " (" + wcaID + ")."
	if region != "" {
		msg += " User regions were updated." + a.afterRegionChange(ctx, current(r).user.Username)
	}
	writeJSON(w, http.StatusCreated, map[string]any{"message": msg, "id": id})
}

func (a *Admin) userFromPath(w http.ResponseWriter, r *http.Request) (*store.AdminUser, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusNotFound, "No such user.")
		return nil, false
	}
	u, err := store.AdminUserByID(r.Context(), a.db.Read, id)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "No such user.")
		return nil, false
	}
	if err != nil {
		a.serverError(w, r, err)
		return nil, false
	}
	return u, true
}

func (a *Admin) getUser(w http.ResponseWriter, r *http.Request) {
	u, ok := a.userFromPath(w, r)
	if !ok {
		return
	}
	requests, err := store.RequestsForUser(r.Context(), a.db.Read, u.ID)
	if err != nil {
		a.serverError(w, r, err)
		return
	}
	list := make([]requestJSON, len(requests))
	for i, req := range requests {
		list[i] = regionRequestJSON(req)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"user": adminUserJSON(*u), "requests": list, "is_self": u.ID == current(r).user.ID,
	})
}

func (a *Admin) setRegion(w http.ResponseWriter, r *http.Request) {
	u, ok := a.userFromPath(w, r)
	if !ok {
		return
	}
	var body struct {
		Region *string `json:"region"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	value := body.Region
	if value != nil && *value == "" {
		value = nil
	}
	if value != nil && !regions.Valid(*value) {
		writeError(w, http.StatusBadRequest, "Choose a valid region.")
		return
	}
	if u.Region.Valid && u.Region.String != "" && value != nil && u.Region.String == *value ||
		(!u.Region.Valid || u.Region.String == "") && value == nil {
		writeJSON(w, http.StatusOK, map[string]any{"message": "The region is unchanged."})
		return
	}
	if err := store.SetUserRegion(r.Context(), a.db.Write, u.ID, value); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not set the region: "+err.Error())
		return
	}
	label := "No region"
	if value != nil {
		label, _ = regions.Name(*value)
	}
	msg := "Region set to " + label + "." + a.afterRegionChange(r.Context(), current(r).user.Username)
	writeJSON(w, http.StatusOK, map[string]any{"message": msg})
}

func (a *Admin) setStaff(w http.ResponseWriter, r *http.Request) {
	u, ok := a.userFromPath(w, r)
	if !ok {
		return
	}
	var body struct {
		Staff bool `json:"staff"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	if !body.Staff && u.ID == current(r).user.ID {
		writeError(w, http.StatusBadRequest, "You cannot remove your own staff access.")
		return
	}
	if err := store.SetStaff(r.Context(), a.db.Write, u.ID, body.Staff, body.Staff && u.IsSuperuser); err != nil {
		a.serverError(w, r, err)
		return
	}
	msg := u.DisplayName() + " can no longer use the admin."
	if body.Staff {
		msg = u.DisplayName() + " can now use the admin. Set a password so they can sign in."
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": msg})
}

func (a *Admin) setPassword(w http.ResponseWriter, r *http.Request) {
	u, ok := a.userFromPath(w, r)
	if !ok {
		return
	}
	var body struct {
		Password string `json:"password"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	if len(body.Password) < 10 {
		writeError(w, http.StatusBadRequest, "Use a password of at least 10 characters.")
		return
	}
	hash, err := auth.HashPassword(body.Password)
	if err != nil {
		a.serverError(w, r, err)
		return
	}
	if err := store.SetPassword(r.Context(), a.db.Write, u.ID, hash); err != nil {
		a.serverError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": "Password updated."})
}

// Jobs.

func (a *Admin) listJobs(w http.ResponseWriter, r *http.Request) {
	page := pageParam(r)
	list, total, err := jobs.List(r.Context(), a.db.Read, pageSize, (page-1)*pageSize)
	if err != nil {
		a.serverError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items": jobsJSON(list), "total": total, "page": page, "pages": pages(total), "page_size": pageSize,
		"worker": a.workerJSON(r),
	})
}

func (a *Admin) enqueueJob(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Kind  string `json:"kind"`
		Force bool   `json:"force"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	if _, ok := jobs.KindLabels[body.Kind]; !ok || body.Kind == jobs.KindImportArchive {
		writeError(w, http.StatusBadRequest, "Unknown job.")
		return
	}
	id, created, err := jobs.Enqueue(r.Context(), a.db.Write, body.Kind, "admin", current(r).user.Username,
		jobs.Options{Force: body.Force})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not queue the job: "+err.Error())
		return
	}
	msg := jobs.KindLabels[body.Kind] + " queued."
	if !created {
		msg = jobs.KindLabels[body.Kind] + " was already queued."
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": msg, "id": id, "created": created})
}

func (a *Admin) getJob(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusNotFound, "No such job.")
		return
	}
	j, err := jobs.Get(r.Context(), a.db.Read, id)
	if err != nil {
		a.serverError(w, r, err)
		return
	}
	if j == nil {
		writeError(w, http.StatusNotFound, "No such job.")
		return
	}
	writeJSON(w, http.StatusOK, toJobJSON(*j, true))
}
