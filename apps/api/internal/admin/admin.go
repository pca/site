// Package admin serves the JSON API behind the staff SPA: region requests,
// user regions and worker jobs. Sessions use an HttpOnly cookie and every
// unsafe request must echo the session's CSRF token in X-CSRF-Token.
package admin

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/pca/backend/internal/auth"
	"github.com/pca/backend/internal/config"
	"github.com/pca/backend/internal/db"
	"github.com/pca/backend/internal/jobs"
	"github.com/pca/backend/internal/maintenance"
	"github.com/pca/backend/internal/store"
)

const (
	// Prefix is where the admin API is mounted.
	Prefix        = "/api/admin"
	sessionCookie = "pca_admin"
	csrfHeader    = "X-CSRF-Token"
	sessionTTL    = 14 * 24 * time.Hour
	pageSize      = 50
)

// Admin is the staff API. regionsChanged is called after any change to user
// regions so the API can refresh rankings.
type Admin struct {
	cfg            config.Config
	db             *db.DB
	log            *slog.Logger
	regionsChanged func(context.Context) error
	limiter        *loginLimiter
	backupMu       sync.Mutex
	maintenance    *maintenance.Switch
}

func New(cfg config.Config, d *db.DB, log *slog.Logger, regionsChanged func(context.Context) error, m *maintenance.Switch) *Admin {
	return &Admin{cfg: cfg, db: d, log: log, regionsChanged: regionsChanged, limiter: newLoginLimiter(), maintenance: m}
}

func (a *Admin) Handler() http.Handler {
	mux := http.NewServeMux()
	p := Prefix
	mux.HandleFunc("GET "+p+"/session", a.getSession)
	mux.HandleFunc("POST "+p+"/session", a.login)
	mux.HandleFunc("DELETE "+p+"/session", a.staff(a.logout))

	mux.HandleFunc("GET "+p+"/dashboard", a.staff(a.dashboard))
	mux.HandleFunc("GET "+p+"/requests", a.staff(a.listRequests))
	mux.HandleFunc("POST "+p+"/requests/decide", a.staff(a.decideRequests))
	mux.HandleFunc("GET "+p+"/users", a.staff(a.listUsers))
	mux.HandleFunc("POST "+p+"/users", a.staff(a.createUser))
	mux.HandleFunc("GET "+p+"/users/{id}", a.staff(a.getUser))
	mux.HandleFunc("PUT "+p+"/users/{id}/region", a.staff(a.setRegion))
	mux.HandleFunc("PUT "+p+"/users/{id}/staff", a.staff(a.setStaff))
	mux.HandleFunc("PUT "+p+"/users/{id}/password", a.staff(a.setPassword))
	mux.HandleFunc("GET "+p+"/jobs", a.staff(a.listJobs))
	mux.HandleFunc("POST "+p+"/jobs", a.staff(a.enqueueJob))
	mux.HandleFunc("GET "+p+"/jobs/{id}", a.staff(a.getJob))
	mux.HandleFunc("GET "+p+"/schedule", a.staff(a.getSchedule))
	mux.HandleFunc("PUT "+p+"/schedule", a.staff(a.setSchedule))
	mux.HandleFunc("DELETE "+p+"/schedule", a.staff(a.resetSchedule))
	mux.HandleFunc("GET "+p+"/backups", a.staff(a.getBackups))
	mux.HandleFunc("POST "+p+"/backups", a.staff(a.createBackup))
	mux.HandleFunc("GET "+p+"/backups/{name}", a.staff(a.downloadBackup))
	mux.HandleFunc("DELETE "+p+"/backups/{name}", a.staff(a.deleteBackup))
	mux.HandleFunc("GET "+p+"/maintenance", a.staff(a.getMaintenance))
	mux.HandleFunc("PUT "+p+"/maintenance", a.staff(a.setMaintenance))
	mux.HandleFunc(p+"/", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusNotFound, "Not found.")
	})

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Cache-Control", "no-store")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "same-origin")
		mux.ServeHTTP(w, r)
	})
}

// JSON helpers.

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func (a *Admin) serverError(w http.ResponseWriter, r *http.Request, err error) {
	a.log.Error("admin", "path", r.URL.Path, "err", err)
	writeError(w, http.StatusInternalServerError, "Something went wrong: "+err.Error())
}

// readJSON decodes a small JSON object body into v.
func readJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		writeError(w, http.StatusBadRequest, "Send a JSON object.")
		return false
	}
	return true
}

// Sessions.

type session struct {
	user  *store.User
	csrf  string
	token string
}

type sessionKey struct{}

func current(r *http.Request) *session {
	s, _ := r.Context().Value(sessionKey{}).(*session)
	return s
}

func (a *Admin) loadSession(r *http.Request) *session {
	c, err := r.Cookie(sessionCookie)
	if err != nil || c.Value == "" {
		return nil
	}
	s, err := store.SessionByToken(r.Context(), a.db.Read, c.Value)
	if err != nil {
		return nil
	}
	u, err := store.UserByID(r.Context(), a.db.Read, s.UserID)
	if err != nil || !u.IsActive || !u.IsStaff {
		return nil
	}
	return &session{user: u, csrf: s.CSRFToken, token: c.Value}
}

// staff requires a staff session, and the CSRF header on unsafe methods.
func (a *Admin) staff(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		s := a.loadSession(r)
		if s == nil {
			writeError(w, http.StatusUnauthorized, "Sign in to continue.")
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead &&
			subtle.ConstantTimeCompare([]byte(r.Header.Get(csrfHeader)), []byte(s.csrf)) != 1 {
			writeError(w, http.StatusForbidden, "Your session expired. Reload the page and try again.")
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), sessionKey{}, s)))
	}
}

func (a *Admin) setSessionCookie(w http.ResponseWriter, token string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: token, Path: Prefix, MaxAge: maxAge,
		HttpOnly: true, Secure: a.cfg.AdminSecureCookies, SameSite: http.SameSiteStrictMode,
	})
}

func (a *Admin) sessionBody(s *session) map[string]any {
	return map[string]any{
		"user":       sessionUser(s.user),
		"csrf_token": s.csrf,
		"meta":       a.meta(),
	}
}

func (a *Admin) getSession(w http.ResponseWriter, r *http.Request) {
	s := a.loadSession(r)
	if s == nil {
		writeError(w, http.StatusUnauthorized, "Sign in to continue.")
		return
	}
	writeJSON(w, http.StatusOK, a.sessionBody(s))
}

func (a *Admin) login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	ip := clientIP(r)
	if !a.limiter.allow(ip) {
		writeError(w, http.StatusTooManyRequests, "Too many failed attempts. Wait a few minutes and try again.")
		return
	}
	u, err := store.UserByUsername(r.Context(), a.db.Read, strings.TrimSpace(body.Username))
	if err != nil || !u.IsActive || !u.IsStaff || !auth.CheckPassword(body.Password, u.Password) {
		a.limiter.fail(ip)
		writeError(w, http.StatusUnauthorized, "Wrong username or password, or the account is not staff.")
		return
	}
	a.limiter.reset(ip)
	var token string
	var sess store.Session
	err = a.db.Tx(r.Context(), func(tx *sql.Tx) error {
		var err error
		if token, sess, err = store.CreateSession(r.Context(), tx, u.ID, sessionTTL); err != nil {
			return err
		}
		return store.TouchLastLogin(r.Context(), tx, u.ID)
	})
	if err != nil {
		a.serverError(w, r, err)
		return
	}
	a.setSessionCookie(w, token, int(sessionTTL.Seconds()))
	writeJSON(w, http.StatusOK, a.sessionBody(&session{user: u, csrf: sess.CSRFToken, token: token}))
}

func (a *Admin) logout(w http.ResponseWriter, r *http.Request) {
	_ = store.DeleteSession(r.Context(), a.db.Write, current(r).token)
	a.setSessionCookie(w, "", -1)
	w.WriteHeader(http.StatusNoContent)
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// loginLimiter blocks an address after repeated failed sign-ins.
type loginLimiter struct {
	mu       sync.Mutex
	attempts map[string][]time.Time
}

const (
	loginWindow   = 10 * time.Minute
	loginMaxFails = 10
)

func newLoginLimiter() *loginLimiter { return &loginLimiter{attempts: map[string][]time.Time{}} }

func (l *loginLimiter) recent(ip string) []time.Time {
	cutoff := time.Now().Add(-loginWindow)
	kept := l.attempts[ip][:0]
	for _, t := range l.attempts[ip] {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) == 0 {
		delete(l.attempts, ip)
		return nil
	}
	l.attempts[ip] = kept
	return kept
}

func (l *loginLimiter) allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.recent(ip)) < loginMaxFails
}

func (l *loginLimiter) fail(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.attempts[ip] = append(l.recent(ip), time.Now())
}

func (l *loginLimiter) reset(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.attempts, ip)
}

// afterRegionChange refreshes the API's rankings and queues a statistics
// rebuild, since regional statistics depend on user regions. It returns a
// note to append to the success message.
func (a *Admin) afterRegionChange(ctx context.Context, by string) string {
	if err := a.regionsChanged(ctx); err != nil {
		a.log.Error("refresh after region change", "err", err)
		return " Rankings could not be refreshed: " + err.Error()
	}
	if !a.cfg.AutoRebuildStatistics {
		return ""
	}
	if _, _, err := jobs.Enqueue(ctx, a.db.Write, jobs.KindStatistics, "admin", by, jobs.Options{}); err != nil {
		a.log.Error("enqueue statistics", "err", err)
		return " The statistics rebuild could not be queued: " + err.Error()
	}
	return " Statistics will be rebuilt by the worker."
}

func pageParam(r *http.Request) int {
	p, err := strconv.Atoi(r.URL.Query().Get("page"))
	if err != nil || p < 1 {
		return 1
	}
	return p
}

func pages(total int) int {
	return max(1, (total+pageSize-1)/pageSize)
}

func plural(n int, word string) string {
	if n == 1 {
		return word
	}
	return word + "s"
}

// Bootstrap creates or updates a staff superuser from configuration.
func Bootstrap(ctx context.Context, d *db.DB, username, password string) (bool, error) {
	if username == "" || password == "" {
		return false, nil
	}
	existing, err := store.UserByUsername(ctx, d.Read, username)
	if err != nil && !errors.Is(err, store.ErrNotFound) {
		return false, err
	}
	var hash string
	if existing == nil || !auth.CheckPassword(password, existing.Password) {
		if hash, err = auth.HashPassword(password); err != nil {
			return false, err
		}
	}
	err = d.Tx(ctx, func(tx *sql.Tx) error {
		if existing == nil {
			_, err := store.CreateUser(ctx, tx, store.NewUser{Username: username, Password: hash, IsStaff: true, IsSuper: true})
			return err
		}
		if hash != "" {
			if err := store.SetPassword(ctx, tx, existing.ID, hash); err != nil {
				return err
			}
		}
		return store.SetStaff(ctx, tx, existing.ID, true, true)
	})
	return existing == nil, err
}
