package admin

import (
	"context"
	"encoding/json"
	"github.com/pca/backend/internal/config"
	"github.com/pca/backend/internal/db"
	"github.com/pca/backend/internal/store"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func TestWorkflowStaffAndCSRFProtection(t *testing.T) {
	ctx := context.Background()
	d, err := db.Open(ctx, filepath.Join(t.TempDir(), "staff-workflows.sqlite3"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	if _, err := Bootstrap(ctx, d, "qa-workflow", "test-only-password"); err != nil {
		t.Fatal(err)
	}
	a := New(config.Config{}, d, slog.New(slog.NewTextHandler(io.Discard, nil)), nil, nil)
	h := a.Handler()
	login := httptest.NewRecorder()
	h.ServeHTTP(login, httptest.NewRequest("POST", "/api/admin/session", strings.NewReader(`{"username":"qa-workflow","password":"test-only-password"}`)))
	if login.Code != 200 {
		t.Fatal("login", login.Code)
	}
	var session struct {
		CSRF string `json:"csrf_token"`
	}
	_ = json.Unmarshal(login.Body.Bytes(), &session)
	cookie := login.Result().Cookies()[0]
	paths := []struct{ method, path string }{{"GET", "/api/admin/analytics/behavior?kind=journeys"}, {"GET", "/api/admin/analytics/behavior?kind=retention"}, {"GET", "/api/admin/feedback"}, {"GET", "/api/admin/feedback/does-not-exist"}, {"PATCH", "/api/admin/feedback/does-not-exist"}, {"GET", "/api/admin/experiment-plans"}, {"POST", "/api/admin/experiment-plans"}, {"PATCH", "/api/admin/experiment-plans/does-not-exist"}}
	call := func(method, path, body string, auth, csrf bool) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		if auth {
			r.AddCookie(cookie)
		}
		if csrf {
			r.Header.Set("X-CSRF-Token", session.CSRF)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	for _, p := range paths {
		if w := call(p.method, p.path, `{}`, false, false); w.Code != 401 || w.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("anonymous access", p, w.Code)
		}
		if p.method != "GET" {
			if w := call(p.method, p.path, `{}`, true, false); w.Code != 403 {
				t.Fatal("missing CSRF accepted", p, w.Code)
			}
		}
	}
	for _, kind := range []string{"journeys", "retention"} {
		if w := call("GET", "/api/admin/analytics/behavior?kind="+kind, "", true, false); w.Code != 503 {
			t.Fatal("unconfigured behavior", w.Code)
		}
	}
	for _, path := range []string{"/api/admin/feedback?type=email", "/api/admin/feedback?offset=-1", "/api/admin/experiment-plans?mode=sample", "/api/admin/analytics/behavior?kind=retention&property=secret"} {
		if w := call("GET", path, "", true, false); w.Code != 400 {
			t.Fatal(path, w.Code)
		}
	}
	p := store.ExperimentPlan{ID: "12345678901234567890123456789012", Definition: store.ExperimentDefinition{Title: "A saved test question", Status: "draft", Baseline: 20, Change: 5, Traffic: 50, MinimumDays: 14}, AuthorID: 999}
	body, _ := json.Marshal(p)
	created := call("POST", "/api/admin/experiment-plans", string(body), true, true)
	if created.Code != 201 {
		t.Fatal("create plan", created.Code, created.Body.String())
	}
	var plan store.ExperimentPlan
	_ = json.Unmarshal(created.Body.Bytes(), &plan)
	if plan.AuthorID == 999 || plan.Revision != 1 {
		t.Fatal("client could spoof author", plan)
	}
	if w := call("POST", "/api/admin/experiment-plans", string(body)+`{}`, true, true); w.Code != 400 {
		t.Fatal("trailing JSON accepted", w.Code)
	}
	f, _, err := store.CreateFeedback(ctx, d, 8, store.FeedbackInput{Key: "qa-feedback-key-0001", Type: "data_issue", Title: "Ranking region needs checking", Task: "I tried to inspect the rankings.", Observed: "The selected region was unexpected.", Expected: "I expected the approved region.", Context: store.FeedbackContext{Page: "rankings"}, Reviewed: true})
	if err != nil {
		t.Fatal(err)
	}
	review := `{"type":"ux_feedback","status":"reviewing","note":"Reproduce this first","revision":1}`
	if w := call("PATCH", "/api/admin/feedback/"+f.ID, review, true, true); w.Code != 200 {
		t.Fatal("review", w.Code)
	}
	if w := call("PATCH", "/api/admin/feedback/"+f.ID, review, true, true); w.Code != 409 {
		t.Fatal("conflict", w.Code)
	}
	if w := call("GET", "/api/admin/feedback/"+f.ID, "", true, false); w.Code != 200 || !strings.Contains(w.Body.String(), `"originalType":"data_issue"`) {
		t.Fatal("review context lost", w.Code)
	}
	if _, err := d.Write.ExecContext(ctx, `UPDATE api_user SET is_staff=0 WHERE username='qa-workflow'`); err != nil {
		t.Fatal(err)
	}
	for _, p := range paths {
		if w := call(p.method, p.path, `{}`, true, true); w.Code != http.StatusUnauthorized {
			t.Fatal("revoked staff kept access", p, w.Code)
		}
	}
}
