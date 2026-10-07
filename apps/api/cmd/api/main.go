// Command api serves the public PCA API (also under /api), the staff admin
// API, the API docs, the built frontends listed in SITES_DIR/sites.json, and
// any backend services proxied through UPSTREAMS.
//
//	api                         serve HTTP (default)
//	api createadmin USERNAME    create or update a staff account (prompts for a password)
//	api healthcheck             exit non-zero unless the local server answers /healthz
package main

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/pca/backend/internal/admin"
	"github.com/pca/backend/internal/api"
	"github.com/pca/backend/internal/config"
	"github.com/pca/backend/internal/db"
	"github.com/pca/backend/internal/maintenance"
	"github.com/pca/backend/internal/static"
	"github.com/pca/backend/internal/upstream"
)

func main() {
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))
	if err := run(log); err != nil {
		log.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func healthcheck(addr string) error {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return fmt.Errorf("cannot parse ADDR %q: %w", addr, err)
	}
	if ip := net.ParseIP(host); host == "" || (ip != nil && ip.IsUnspecified()) {
		host = "127.0.0.1"
	}
	client := http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://" + net.JoinHostPort(host, port) + "/healthz")
	if err != nil {
		return err
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("healthz returned %s", resp.Status)
	}
	return nil
}

func run(log *slog.Logger) error {
	cfg := config.Load()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		return healthcheck(cfg.Addr)
	}

	d, err := db.Open(ctx, cfg.DBPath)
	if err != nil {
		return err
	}
	defer d.Close()

	args := os.Args[1:]
	if len(args) > 0 && args[0] != "serve" {
		switch args[0] {
		case "createadmin":
			return createAdmin(ctx, d, args[1:])
		default:
			return fmt.Errorf("unknown command %q (commands: serve, createadmin)", args[0])
		}
	}

	if created, err := admin.Bootstrap(ctx, d, cfg.AdminBootstrapUsername, cfg.AdminBootstrapPassword); err != nil {
		return fmt.Errorf("bootstrap admin: %w", err)
	} else if created {
		log.Info("created bootstrap admin", "username", cfg.AdminBootstrapUsername)
	}

	srv, err := api.New(ctx, cfg, d, log)
	if err != nil {
		return err
	}
	go srv.WatchGeneration(ctx)

	maint, err := maintenance.Load(ctx, d)
	if err != nil {
		return fmt.Errorf("load maintenance state: %w", err)
	}
	go maint.Watch(ctx, cfg.CachePollInterval)

	// Backends built into this binary. Add new Go modules here.
	mounts := []api.Mount{
		{Prefix: admin.Prefix, Handler: admin.New(cfg, d, log, srv.RegionsChanged, maint).Handler()},
		{Prefix: maintenance.StatusPath, Handler: maint.StatusHandler()},
	}
	routes, err := upstream.Parse(cfg.Upstreams)
	if err != nil {
		return err
	}
	for _, r := range routes {
		mounts = append(mounts, api.Mount{Prefix: r.Prefix, Handler: r.Handler(log)})
		log.Info("proxying", "prefix", r.Prefix, "target", r.Target.String())
	}
	if cfg.SitesDir != "" {
		sites, err := static.LoadSites(cfg.SitesDir)
		if err != nil {
			return err
		}
		for _, s := range sites {
			var h http.Handler = s.Site
			hasPage := s.Site.HasFile(maintenance.PageName)
			if hasPage {
				h = maint.Wrap(s.Site)
			}
			mounts = append(mounts, api.Mount{Prefix: s.Spec.Mount, Handler: h})
			log.Info("serving site", "name", s.Spec.Name, "mount", s.Spec.Mount, "spa", s.Spec.SPA, "maintenance_page", hasPage)
		}
		if maint.Enabled() {
			log.Warn("maintenance mode is on; turn it off in the admin")
		}
	}
	handler, err := srv.Handler(mounts)
	if err != nil {
		return err
	}

	httpServer := &http.Server{
		Addr:              cfg.Addr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	errc := make(chan error, 1)
	go func() {
		log.Info("listening", "addr", cfg.Addr, "db", cfg.DBPath)
		errc <- httpServer.ListenAndServe()
	}()
	select {
	case err := <-errc:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
	}
	shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return httpServer.Shutdown(shutdown)
}

func createAdmin(ctx context.Context, d *db.DB, args []string) error {
	if len(args) != 1 {
		return errors.New("usage: api createadmin USERNAME (reads the password from ADMIN_PASSWORD or stdin)")
	}
	password := os.Getenv("ADMIN_PASSWORD")
	if password == "" {
		fmt.Fprint(os.Stderr, "Password: ")
		line, err := bufio.NewReader(os.Stdin).ReadString('\n')
		if err != nil && line == "" {
			return err
		}
		password = strings.TrimRight(line, "\r\n")
	}
	if len(password) < 10 {
		return errors.New("use a password of at least 10 characters")
	}
	created, err := admin.Bootstrap(ctx, d, args[0], password)
	if err != nil {
		return err
	}
	if created {
		fmt.Printf("Created staff account %q.\n", args[0])
	} else {
		fmt.Printf("Updated staff account %q.\n", args[0])
	}
	return nil
}
