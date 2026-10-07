// Package maintenance holds the switch staff flip in the admin to take the
// public site offline during upgrades. While it is on, page requests to the
// wrapped sites get their maintenance.html with a 503; assets, the admin and
// the API keep working.
package maintenance

import (
	"context"
	"encoding/json"
	"net/http"
	"path"
	"sync"
	"time"

	"github.com/pca/backend/internal/db"
	"github.com/pca/backend/internal/timefmt"
)

// PageName is the file a site provides to be served in maintenance mode.
const PageName = "/maintenance.html"

// State is the stored switch.
type State struct {
	Enabled   bool       `json:"enabled"`
	UpdatedBy string     `json:"updated_by"`
	UpdatedAt *time.Time `json:"updated_at"`
}

// Switch caches the stored state so checking it costs nothing per request.
type Switch struct {
	db    *db.DB
	mu    sync.RWMutex
	state State
}

func Load(ctx context.Context, d *db.DB) (*Switch, error) {
	s := &Switch{db: d}
	v, ok, err := db.GetMeta(ctx, d.Read, db.MetaMaintenance)
	if err != nil || !ok {
		return s, err
	}
	return s, json.Unmarshal([]byte(v), &s.state)
}

// Watch re-reads the stored state every interval, so a change made by another
// process sharing the database takes effect here too.
func (s *Switch) Watch(ctx context.Context, interval time.Duration) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		v, ok, err := db.GetMeta(ctx, s.db.Read, db.MetaMaintenance)
		if err != nil || !ok {
			continue
		}
		var st State
		if json.Unmarshal([]byte(v), &st) == nil {
			s.mu.Lock()
			s.state = st
			s.mu.Unlock()
		}
	}
}

func (s *Switch) State() State {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.state
}

func (s *Switch) Enabled() bool { return s.State().Enabled }

func (s *Switch) Set(ctx context.Context, enabled bool, by string) (State, error) {
	now := timefmt.Now()
	next := State{Enabled: enabled, UpdatedBy: by, UpdatedAt: &now}
	b, _ := json.Marshal(next)
	if err := db.SetMeta(ctx, s.db.Write, db.MetaMaintenance, string(b)); err != nil {
		return State{}, err
	}
	s.mu.Lock()
	s.state = next
	s.mu.Unlock()
	return next, nil
}

// StatusPath is the public endpoint reporting whether the switch is on. The
// public site's dev server reads it to behave like production.
const StatusPath = "/api/maintenance"

func (s *Switch) StatusHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		json.NewEncoder(w).Encode(map[string]bool{"enabled": s.Enabled()})
	})
}

// Page serves one file of a site, as static.Site does.
type Page interface {
	http.Handler
	ServeFile(w http.ResponseWriter, r *http.Request, name string, status int) bool
}

// Wrap serves site normally, or its maintenance page for page requests while
// the switch is on. Files with an extension (scripts, styles, fonts, images)
// are still served so the page renders.
func (s *Switch) Wrap(site Page) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.Enabled() && (path.Ext(r.URL.Path) == "" || path.Ext(r.URL.Path) == ".html") {
			h := w.Header()
			h.Set("Retry-After", "600")
			h.Set("X-Robots-Tag", "noindex")
			if site.ServeFile(w, r, PageName, http.StatusServiceUnavailable) {
				return
			}
			h.Del("Retry-After")
			h.Del("X-Robots-Tag")
		}
		site.ServeHTTP(w, r)
	})
}
