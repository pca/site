package admin

// Opt-in loopback fixture for browser QA. This _test.go file is never built into
// the deployed binary. It creates a disposable DB, not a bypass for real accounts.
import (
	"context"
	"fmt"
	"github.com/pca/backend/internal/api"
	"github.com/pca/backend/internal/config"
	"github.com/pca/backend/internal/db"
	"github.com/pca/backend/internal/static"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"testing"
	"time"
)

func TestBrowserWorkflowFixture(t *testing.T) {
	if os.Getenv("PCA_ANALYTICS_BROWSER_FIXTURE") != "1" {
		t.Skip("opt-in local browser fixture")
	}
	sitesDir := os.Getenv("PCA_ANALYTICS_FIXTURE_SITES")
	if sitesDir == "" {
		t.Fatal("set the built sites directory")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	d, err := db.Open(ctx, filepath.Join(t.TempDir(), "browser-fixture.sqlite3"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	if _, err := d.Write.ExecContext(ctx, `INSERT INTO wca_event(id,name,rank,format,cell_name) VALUES('333','QA 3x3x3 Cube',1,'time','3x3x3')`); err != nil {
		t.Fatal(err)
	}
	if _, err := Bootstrap(ctx, d, "qa-analytics", "local-fixture-only-2026"); err != nil {
		t.Fatal(err)
	}
	wca := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/oauth/token/" {
			_ = r.ParseForm()
			if r.Form.Get("code") != "qa-local-browser-code" {
				http.Error(w, "invalid fixture code", 400)
				return
			}
			io.WriteString(w, `{"access_token":"fixture-only-not-real"}`)
			return
		}
		if r.URL.Path == "/api/v0/me" && r.Header.Get("Authorization") == "Bearer fixture-only-not-real" {
			io.WriteString(w, `{"me":{"id":999999999,"wca_id":null,"name":"QA Visitor"}}`)
			return
		}
		http.NotFound(w, r)
	}))
	defer wca.Close()
	cfg := config.Config{WCABaseURL: wca.URL, WCAClientID: "fixture", WCAClientSecret: "fixture", WCADefaultCallbackURL: "http://localhost:8002/regional-rankings", CachePollInterval: time.Second}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	server, err := api.New(ctx, cfg, d, logger)
	if err != nil {
		t.Fatal(err)
	}
	mounts := []api.Mount{{Prefix: Prefix, Handler: New(cfg, d, logger, nil, nil).Handler()}}
	sites, err := static.LoadSites(sitesDir)
	if err != nil {
		t.Fatal(err)
	}
	for _, site := range sites {
		mounts = append(mounts, api.Mount{Prefix: site.Spec.Mount, Handler: site.Site})
	}
	handler, err := server.Handler(mounts)
	if err != nil {
		t.Fatal(err)
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:8002")
	if err != nil {
		t.Fatal(err)
	}
	httpServer := &http.Server{Handler: handler, ReadHeaderTimeout: 5 * time.Second}
	done := make(chan error, 1)
	go func() { done <- httpServer.Serve(listener) }()
	fmt.Println("DISPOSABLE QA ONLY: http://localhost:8002 · synthetic staff qa-analytics · fixture password in this test source · no real Google/WCA requests")
	select {
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := httpServer.Shutdown(shutdown); err != nil {
			t.Error(err)
		}
	case err := <-done:
		if err != http.ErrServerClosed {
			t.Error(err)
		}
	}
}
