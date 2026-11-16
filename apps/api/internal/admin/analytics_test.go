package admin

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pca/backend/internal/config"
	"github.com/pca/backend/internal/db"
)

func TestAnalyticsRequiresStaffSession(t *testing.T) {
	a := New(config.Config{}, nil, slog.New(slog.NewTextHandler(io.Discard, nil)), nil, nil)
	for _, path := range []string{"/api/admin/analytics/status", "/api/admin/analytics/report?report=pages", "/api/admin/analytics/report?report=content&breakdown=event_region&page=rankings", "/api/admin/analytics/report?report=features", "/api/admin/analytics/release?date=2026-10-10"} {
		r := httptest.NewRequest("GET", path, nil)
		w := httptest.NewRecorder()
		a.Handler().ServeHTTP(w, r)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("%s got %d", path, w.Code)
		}
		if w.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("staff data must not be browser-cached")
		}
	}
}

func TestStaffAnalyticsConfigurationWithoutGoogleAccess(t *testing.T) {
	ctx := context.Background()
	d, err := db.Open(ctx, filepath.Join(t.TempDir(), "staff-test.sqlite3"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	if _, err := Bootstrap(ctx, d, "qa-staff", "test-only-password"); err != nil {
		t.Fatal(err)
	}
	a := New(config.Config{}, d, slog.New(slog.NewTextHandler(io.Discard, nil)), nil, nil)
	h := a.Handler()
	login := httptest.NewRecorder()
	h.ServeHTTP(login, httptest.NewRequest("POST", "/api/admin/session", strings.NewReader(`{"username":"qa-staff","password":"test-only-password"}`)))
	if login.Code != http.StatusOK {
		t.Fatalf("test login failed %d", login.Code)
	}
	cookies := login.Result().Cookies()
	if len(cookies) == 0 {
		t.Fatal("missing session cookie")
	}
	for _, target := range []struct {
		path   string
		status int
	}{{"/api/admin/analytics/status", 200}, {"/api/admin/analytics/report?report=pages", 503}, {"/api/admin/analytics/report?report=content&breakdown=event_region&page=rankings", 503}, {"/api/admin/analytics/report?report=features", 503}, {"/api/admin/analytics/report?report=features&page=rankings", 400}, {"/api/admin/analytics/report?report=pages&days=10000", 400}, {"/api/admin/analytics/release?date=2026-10-10", 503}, {"/api/admin/analytics/release?date=2026-02-30", 400}} {
		r := httptest.NewRequest("GET", target.path, nil)
		r.AddCookie(cookies[0])
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != target.status {
			t.Fatalf("%s: %d", target.path, w.Code)
		}
		if target.status == 200 {
			var body map[string]any
			if json.Unmarshal(w.Body.Bytes(), &body) != nil || body["state"] != "not_configured" {
				t.Fatal("unexpected status")
			}
		}
	}
	// Existing session cookies cannot retain report access after staff is revoked.
	if _, err := d.Write.ExecContext(ctx, "UPDATE api_user SET is_staff=0 WHERE username='qa-staff'"); err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest("GET", "/api/admin/analytics/status", nil)
	r.AddCookie(cookies[0])
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 401 {
		t.Fatalf("non-staff access returned %d", w.Code)
	}
}
