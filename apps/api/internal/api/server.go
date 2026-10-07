// Package api serves the public PCA HTTP API.
package api

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/pca/backend/internal/auth"
	"github.com/pca/backend/internal/config"
	"github.com/pca/backend/internal/db"
	"github.com/pca/backend/internal/rankings"
	"github.com/pca/backend/internal/store"
)

type Server struct {
	cfg config.Config
	db  *db.DB
	wca *auth.WCA
	log *slog.Logger

	dataset atomic.Pointer[rankings.Dataset]
	regions atomic.Pointer[rankings.Regions]
	cache   *responseCache
	news    newsCache

	generation atomic.Int64
	reloadMu   sync.Mutex
}

func New(ctx context.Context, cfg config.Config, d *db.DB, log *slog.Logger) (*Server, error) {
	s := &Server{
		cfg:   cfg,
		db:    d,
		wca:   auth.NewWCA(cfg.WCABaseURL, cfg.WCAClientID, cfg.WCAClientSecret),
		log:   log,
		cache: newResponseCache(8192),
	}
	gen, err := db.Generation(ctx, d.Read)
	if err != nil {
		return nil, err
	}
	if err := s.Reload(ctx); err != nil {
		return nil, err
	}
	s.generation.Store(gen)
	return s, nil
}

// Reload rebuilds all in-memory data and drops cached responses.
func (s *Server) Reload(ctx context.Context) error {
	s.reloadMu.Lock()
	defer s.reloadMu.Unlock()
	start := time.Now()
	ds, err := rankings.Load(ctx, s.db.Read)
	if err != nil {
		return err
	}
	regions, err := rankings.LoadRegions(ctx, s.db.Read, s.cfg.RankingsRequireWCAAccount)
	if err != nil {
		return err
	}
	s.dataset.Store(ds)
	s.regions.Store(regions)
	s.cache.Clear()
	s.log.Info("data loaded", "events", len(ds.Events), "took", time.Since(start).Round(time.Millisecond))
	return nil
}

// RegionsChanged reloads user regions after an in-process change and tells
// other processes to reload.
func (s *Server) RegionsChanged(ctx context.Context) error {
	regions, err := rankings.LoadRegions(ctx, s.db.Read, s.cfg.RankingsRequireWCAAccount)
	if err != nil {
		return err
	}
	s.regions.Store(regions)
	s.cache.Clear()
	if err := db.BumpGeneration(ctx, s.db.Write); err != nil {
		return err
	}
	if gen, err := db.Generation(ctx, s.db.Write); err == nil {
		s.generation.Store(gen)
	}
	return nil
}

// WatchGeneration reloads data when another process (the worker) bumps the
// shared data generation.
func (s *Server) WatchGeneration(ctx context.Context) {
	t := time.NewTicker(s.cfg.CachePollInterval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			gen, err := db.Generation(ctx, s.db.Read)
			if err != nil {
				s.log.Warn("generation check failed", "err", err)
				continue
			}
			if gen != s.generation.Load() {
				if err := s.Reload(ctx); err != nil {
					s.log.Error("reload failed", "err", err)
					continue
				}
				s.generation.Store(gen)
			}
		}
	}
}

// Mount serves Handler for Prefix and everything below it, next to the
// public API. Prefix "/" is the fallback for paths nothing else matched (the
// public site). Mounted handlers get no CORS headers and, under /api/, are not
// subject to the /api alias.
type Mount struct {
	Prefix  string
	Handler http.Handler
}

// Handler returns the API routes plus the mounted handlers. Every public API
// route also answers under /api so a same-origin frontend can call it.
func (s *Server) Handler(mounts []Mount) (handler http.Handler, err error) {
	mux := http.NewServeMux()
	get := func(path string, h http.HandlerFunc) { s.route(mux, path, map[string]http.HandlerFunc{"GET": h}) }

	get("/regions", s.handleRegions)
	get("/zones", s.handleZones)
	get("/events", s.handleEvents)
	get("/rankings/national-single/{event_id}", s.handleRanking("national", rankings.Single))
	get("/rankings/national-average/{event_id}", s.handleRanking("national", rankings.Average))
	get("/rankings/regional-single/{region_id}/{event_id}", s.handleRanking("regional", rankings.Single))
	get("/rankings/regional-average/{region_id}/{event_id}", s.handleRanking("regional", rankings.Average))
	get("/rankings/zonal-single/{zone_id}/{event_id}", s.handleRanking("zonal", rankings.Single))
	get("/rankings/zonal-average/{zone_id}/{event_id}", s.handleRanking("zonal", rankings.Average))
	get("/persons/{wca_id}", s.handlePerson)
	get("/news", s.handleNews)

	s.route(mux, "/auth/login/wca", map[string]http.HandlerFunc{"POST": s.handleWCALogin})
	s.route(mux, "/auth/logout", map[string]http.HandlerFunc{
		"GET": func(w http.ResponseWriter, r *http.Request) {
			writeDetail(w, http.StatusMethodNotAllowed, `Method "`+r.Method+`" not allowed.`)
		},
		"POST": s.handleLogout,
	})
	get("/user", s.requireUser(s.handleUser))
	s.route(mux, "/user/region-update-requests", map[string]http.HandlerFunc{
		"GET":  s.requireUser(s.handleListRequests),
		"POST": s.requireUser(s.handleCreateRequest),
	})

	get("/statistics/regional/strength/events/{event_id}", s.handleStrengthByEvent)
	get("/statistics/regional/strength/regions", s.handleStrengthRegions)
	get("/statistics/regional/strength/regions/{region_id}", s.handleStrengthByRegion)
	get("/statistics/growth/new-attendees", s.handleGrowth(metricNewAttendees))
	get("/statistics/growth/attendances", s.handleGrowth(metricAttendances))
	get("/statistics/growth/active-competitors", s.handleGrowth(metricActiveCompetitors))
	get("/statistics/growth/popular-events", s.handlePopularEvents)

	get("/openapi.json", s.handleOpenAPI)
	get("/docs", s.handleDocs)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	var fallback http.Handler
	var prefixes []string
	for _, m := range mounts {
		prefix := strings.TrimRight(m.Prefix, "/")
		if prefix == "" {
			if fallback != nil {
				return nil, errors.New(`two handlers are mounted at "/"`)
			}
			fallback = m.Handler
			continue
		}
		if err := handle(mux, prefix, m.Handler); err != nil {
			return nil, err
		}
		prefixes = append(prefixes, prefix)
	}
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if fallback != nil {
			fallback.ServeHTTP(w, r)
			return
		}
		h := w.Header()
		h.Set("Content-Type", "text/html")
		h.Set("X-Frame-Options", "DENY")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "same-origin")
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(notFoundPage))
	})

	mounted := func(p string) bool {
		for _, prefix := range prefixes {
			if p == prefix || strings.HasPrefix(p, prefix+"/") {
				return true
			}
		}
		return false
	}
	var h http.Handler = mux
	h = s.cors(h, mounted)
	h = apiPrefix(h, mounted)
	h = stripTrailingSlash(h)
	h = recoverer(h, s.log)
	return h, nil
}

// handle registers prefix and prefix/ and reports conflicting patterns,
// which ServeMux signals by panicking.
func handle(mux *http.ServeMux, prefix string, h http.Handler) (err error) {
	defer func() {
		if v := recover(); v != nil {
			err = fmt.Errorf("cannot mount %s: %v", prefix, v)
		}
	}()
	mux.Handle(prefix, h)
	mux.Handle(prefix+"/", h)
	return nil
}

// apiPrefix maps /api/X to the public API route /X, except for mounted paths.
func apiPrefix(next http.Handler, mounted func(string) bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		if rest, ok := strings.CutPrefix(p, "/api/"); ok && rest != "" && !mounted(p) {
			r2 := r.Clone(r.Context())
			r2.URL.Path = "/" + rest
			r2.URL.RawPath = ""
			r = r2
		}
		next.ServeHTTP(w, r)
	})
}

const (
	notFoundPage    = "\n<!doctype html>\n<html lang=\"en\">\n<head>\n  <title>Not Found</title>\n</head>\n<body>\n  <h1>Not Found</h1><p>The requested resource was not found on this server.</p>\n</body>\n</html>\n"
	serverErrorPage = "\n<!doctype html>\n<html lang=\"en\">\n<head>\n  <title>Server Error (500)</title>\n</head>\n<body>\n  <h1>Server Error (500)</h1><p></p>\n</body>\n</html>\n"
)

// writeServerError answers unhandled errors with a plain HTML 500 page.
func writeServerError(w http.ResponseWriter) {
	h := w.Header()
	h.Del("Allow")
	h.Del("Vary")
	h.Del("ETag")
	h.Set("Content-Type", "text/html")
	w.WriteHeader(http.StatusInternalServerError)
	w.Write([]byte(serverErrorPage))
}

// route dispatches by method; other methods get a 405 listing the allowed ones.
func (s *Server) route(mux *http.ServeMux, path string, methods map[string]http.HandlerFunc) {
	allowed := make([]string, 0, len(methods)+2)
	for m := range methods {
		allowed = append(allowed, m)
	}
	if _, ok := methods["GET"]; ok {
		allowed = append(allowed, "HEAD")
	}
	allowed = append(allowed, "OPTIONS")
	slices.SortFunc(allowed, func(a, b string) int { return methodOrder(a) - methodOrder(b) })
	allow := strings.Join(allowed, ", ")
	meta, ok := optionsByRoute[path]
	if !ok {
		meta = optionsMeta{Anonymous: "{}"}
	}

	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Allow", allow)
		h.Set("Vary", "Accept")
		h.Set("X-Frame-Options", "DENY")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "same-origin")
		if user, err := s.authenticate(r); err != nil {
			writeAuthError(w, err)
			return
		} else if user != nil {
			r = r.WithContext(context.WithValue(r.Context(), userKey{}, user))
		} else if meta.RequiresAuth {
			w.Header().Set("WWW-Authenticate", "Token")
			writeDetail(w, http.StatusUnauthorized, "Authentication credentials were not provided.")
			return
		}
		method := r.Method
		if method == http.MethodHead {
			method = http.MethodGet
		}
		if fn, ok := methods[method]; ok {
			fn(w, r)
			return
		}
		if r.Method == http.MethodOptions {
			writeJSON(w, r, http.StatusOK, meta.body(currentUser(r) != nil), false)
			return
		}
		writeDetail(w, http.StatusMethodNotAllowed, `Method "`+r.Method+`" not allowed.`)
	})
}

func methodOrder(m string) int {
	return strings.Index("GET POST PUT PATCH DELETE HEAD OPTIONS", m)
}

func stripTrailingSlash(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if p := r.URL.Path; len(p) > 1 && strings.HasSuffix(p, "/") {
			r2 := r.Clone(r.Context())
			r2.URL.Path = strings.TrimRight(p, "/")
			if r2.URL.Path == "" {
				r2.URL.Path = "/"
			}
			r2.URL.RawPath = ""
			r = r2
		}
		next.ServeHTTP(w, r)
	})
}

func recoverer(next http.Handler, log *slog.Logger) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				if v == http.ErrAbortHandler {
					panic(v)
				}
				log.Error("panic", "path", r.URL.Path, "err", v)
				writeServerError(w)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// cors answers allowed origins and preflight requests for the public API.
func (s *Server) cors(next http.Handler, mounted func(string) bool) http.Handler {
	allowed := map[string]bool{}
	for _, o := range s.cfg.CORSAllowedOrigins {
		allowed[strings.TrimRight(o, "/")] = true
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "" || mounted(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}
		h := w.Header()
		h.Add("Vary", "Origin")
		if !s.cfg.CORSAllowAll && !allowed[origin] {
			next.ServeHTTP(w, r)
			return
		}
		if s.cfg.CORSAllowAll {
			h.Set("Access-Control-Allow-Origin", "*")
		} else {
			h.Set("Access-Control-Allow-Origin", origin)
		}
		if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
			h.Set("Access-Control-Allow-Headers", "accept, accept-encoding, authorization, content-type, dnt, origin, user-agent, x-csrftoken, x-requested-with")
			h.Set("Access-Control-Allow-Methods", "DELETE, GET, OPTIONS, PATCH, POST, PUT")
			h.Set("Access-Control-Max-Age", "86400")
			h.Set("Content-Length", "0")
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// Authentication ("Authorization: Token <key>").

type userKey struct{}

type authError struct {
	status int
	detail string
}

func (e *authError) Error() string { return e.detail }

func currentUser(r *http.Request) *store.User {
	u, _ := r.Context().Value(userKey{}).(*store.User)
	return u
}

func (s *Server) authenticate(r *http.Request) (*store.User, error) {
	header := r.Header.Get("Authorization")
	if header == "" {
		return nil, nil
	}
	parts := strings.Fields(header)
	if len(parts) == 0 || !strings.EqualFold(parts[0], "Token") {
		return nil, nil
	}
	switch {
	case len(parts) == 1:
		return nil, &authError{http.StatusUnauthorized, "Invalid token header. No credentials provided."}
	case len(parts) > 2:
		return nil, &authError{http.StatusUnauthorized, "Invalid token header. Token string should not contain spaces."}
	}
	user, err := store.UserByToken(r.Context(), s.db.Read, parts[1])
	if errors.Is(err, store.ErrNotFound) {
		return nil, &authError{http.StatusUnauthorized, "Invalid token."}
	}
	if err != nil {
		return nil, err
	}
	if !user.IsActive {
		return nil, &authError{http.StatusUnauthorized, "User inactive or deleted."}
	}
	return user, nil
}

func writeAuthError(w http.ResponseWriter, err error) {
	var ae *authError
	if errors.As(err, &ae) {
		w.Header().Set("WWW-Authenticate", "Token")
		writeDetail(w, ae.status, ae.detail)
		return
	}
	writeServerError(w)
}

func (s *Server) requireUser(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if currentUser(r) == nil {
			w.Header().Set("WWW-Authenticate", "Token")
			writeDetail(w, http.StatusUnauthorized, "Authentication credentials were not provided.")
			return
		}
		next(w, r)
	}
}

// Responses.

func writeDetail(w http.ResponseWriter, status int, detail string) {
	body, _ := marshal(map[string]string{"detail": detail})
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	w.Write(body)
}

func writeJSON(w http.ResponseWriter, r *http.Request, status int, body []byte, compressible bool) {
	h := w.Header()
	h.Set("Content-Type", "application/json")
	if compressible && len(body) > 1024 && acceptsGzip(r) {
		var buf bytes.Buffer
		gz, _ := gzip.NewWriterLevel(&buf, gzip.BestSpeed)
		gz.Write(body)
		gz.Close()
		h.Set("Content-Encoding", "gzip")
		h.Add("Vary", "Accept-Encoding")
		body = buf.Bytes()
	}
	w.WriteHeader(status)
	if r.Method != http.MethodHead {
		w.Write(body)
	}
}

func acceptsGzip(r *http.Request) bool {
	return strings.Contains(r.Header.Get("Accept-Encoding"), "gzip")
}

// responseCache stores encoded 200 responses until the next data reload.
type responseCache struct {
	mu      sync.RWMutex
	entries map[string]*cached
	max     int
}

type cached struct {
	body []byte
	gz   []byte
	etag string
}

func newResponseCache(max int) *responseCache {
	return &responseCache{entries: map[string]*cached{}, max: max}
}

func (c *responseCache) Get(key string) *cached {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.entries[key]
}

func (c *responseCache) Put(key string, body []byte) *cached {
	sum := sha256.Sum256(body)
	e := &cached{body: body, etag: `"` + hex.EncodeToString(sum[:12]) + `"`}
	if len(body) > 1024 {
		var buf bytes.Buffer
		gz, _ := gzip.NewWriterLevel(&buf, gzip.BestCompression)
		gz.Write(body)
		gz.Close()
		e.gz = buf.Bytes()
	}
	c.mu.Lock()
	if len(c.entries) >= c.max {
		c.entries = map[string]*cached{}
	}
	c.entries[key] = e
	c.mu.Unlock()
	return e
}

func (c *responseCache) Clear() {
	c.mu.Lock()
	c.entries = map[string]*cached{}
	c.mu.Unlock()
}

// serveCached answers from the cache, computing the body on a miss. build
// returns (body, status); only 200 responses are cached.
func (s *Server) serveCached(w http.ResponseWriter, r *http.Request, key string, build func() ([]byte, int)) {
	e := s.cache.Get(key)
	if e == nil {
		body, status := build()
		if status == http.StatusInternalServerError {
			writeServerError(w)
			return
		}
		if status != http.StatusOK {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(status)
			w.Write(body)
			return
		}
		e = s.cache.Put(key, body)
	}
	h := w.Header()
	h.Set("Content-Type", "application/json")
	h.Set("ETag", e.etag)
	if match := r.Header.Get("If-None-Match"); match != "" && strings.Contains(match, e.etag) {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	body := e.body
	if e.gz != nil {
		h.Add("Vary", "Accept-Encoding")
		if acceptsGzip(r) {
			h.Set("Content-Encoding", "gzip")
			body = e.gz
		}
	}
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		w.Write(body)
	}
}

func detailBody(detail string) []byte {
	b, _ := marshal(map[string]string{"detail": detail})
	return b
}
