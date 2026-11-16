package api

import (
	"context"
	"encoding/json"
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

func TestFeedbackRequiresAccountAndStrictReviewedBody(t *testing.T) {
	ctx := context.Background()
	d, err := db.Open(ctx, filepath.Join(t.TempDir(), "feedback-api.sqlite3"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	id, err := store.CreateUser(ctx, d.Write, store.NewUser{Username: "feedback-user"})
	if err != nil {
		t.Fatal(err)
	}
	token, err := store.GetOrCreateToken(ctx, d.Write, id)
	if err != nil {
		t.Fatal(err)
	}
	s := &Server{db: d, log: slog.New(slog.NewTextHandler(io.Discard, nil))}
	mux := http.NewServeMux()
	s.route(mux, "/user/feedback", map[string]http.HandlerFunc{"POST": s.requireUser(s.handleFeedback)})
	input := store.FeedbackInput{Key: "test-http-request-0001", Type: "ux_feedback", Title: "Event picker is not visible", Task: "I tried to select another event.", Observed: "The event picker was not visible.", Expected: "I expected to find the control.", Context: store.FeedbackContext{Page: "statistics", Event: "333", View: "event"}, Reviewed: true}
	payload, _ := json.Marshal(input)
	call := func(body, auth string) int {
		r := httptest.NewRequest("POST", "/user/feedback", strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		if auth != "" {
			r.Header.Set("Authorization", "Token "+auth)
		}
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		return w.Code
	}
	if code := call(string(payload), ""); code != 401 {
		t.Fatal("anonymous report", code)
	}
	for _, body := range []string{`{}`, string(payload) + `{}`, strings.Replace(string(payload), `"reviewed":true`, `"reviewed":false`, 1), strings.Replace(string(payload), `"reviewed":true`, `"reviewed":true,"token":"must-not-be-stored"`, 1), strings.Repeat("x", 20000)} {
		if code := call(body, token); code != 400 {
			t.Fatal("invalid payload", code)
		}
	}
	if code := call(string(payload), token); code != 201 {
		t.Fatal("valid report", code)
	}
	if code := call(string(payload), token); code != 200 {
		t.Fatal("idempotent retry", code)
	}
	_, _ = d.Write.ExecContext(ctx, `UPDATE api_user SET is_active=0 WHERE id=?`, id)
	if code := call(string(payload), token); code != 401 {
		t.Fatal("inactive account", code)
	}
}
