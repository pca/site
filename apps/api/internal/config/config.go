// Package config loads service settings from the environment (and an optional
// .env file).
package config

import (
	"bufio"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	DBPath  string
	DataDir string
	// BackupKeep is how many admin database backups DATA_DIR/backups keeps.
	BackupKeep int
	Addr       string
	Debug      bool

	// SitesDir holds the built frontends and their sites.json manifest
	// (written by `pnpm build`). Empty serves the API only.
	SitesDir string
	// Upstreams are other backend services proxied under a prefix, as
	// "/prefix=http://host:port" pairs separated by commas.
	Upstreams string

	CORSAllowedOrigins []string
	CORSAllowAll       bool

	WCABaseURL             string
	WCAClientID            string
	WCAClientSecret        string
	WCADefaultCallbackURL  string
	WCAAllowedCallbackURLs []string
	WCAExportAPIURL        string

	FBPageID        string
	FBPageToken     string
	FBPageFeedLimit string

	AdminBootstrapUsername string
	AdminBootstrapPassword string
	AdminSecureCookies     bool
	AutoRebuildStatistics  bool

	// RankingsRequireWCAAccount restricts regional/zonal membership to users
	// linked to a WCA social account.
	RankingsRequireWCAAccount bool

	SyncCron          string
	JobPollInterval   time.Duration
	CachePollInterval time.Duration
	BoundaryGeoJSON   string
	BoundaryMetadata  string
}

func Load() Config {
	loadDotEnv(env("ENV_FILE", ".env"))
	return Config{
		DBPath:     env("DB_PATH", "data/pca.sqlite3"),
		DataDir:    env("DATA_DIR", "data"),
		BackupKeep: max(1, intEnv("BACKUP_KEEP", 5)),
		Addr:       env("ADDR", ":8000"),
		Debug:      boolEnv("DEBUG", false),

		SitesDir:  env("SITES_DIR", ""),
		Upstreams: env("UPSTREAMS", ""),

		CORSAllowedOrigins: listEnv("CORS_ALLOWED_ORIGINS"),
		CORSAllowAll:       boolEnv("CORS_ALLOW_ALL_ORIGINS", false),

		WCABaseURL:             strings.TrimRight(env("WCA_BASE_URL", "https://www.worldcubeassociation.org"), "/"),
		WCAClientID:            env("WCA_CLIENT_ID", ""),
		WCAClientSecret:        env("WCA_CLIENT_SECRET", ""),
		WCADefaultCallbackURL:  env("WCA_DEFAULT_CALLBACK_URL", "http://localhost:8080/wca-callback"),
		WCAAllowedCallbackURLs: listEnv("WCA_ALLOWED_CALLBACK_URLS"),
		WCAExportAPIURL:        env("WCA_EXPORT_API_URL", "https://www.worldcubeassociation.org/api/v0/export/public"),

		FBPageID:        env("FB_PAGE_ID", ""),
		FBPageToken:     env("FB_PAGE_TOKEN", ""),
		FBPageFeedLimit: env("FB_PAGE_FEED_LIMIT", "5"),

		AdminBootstrapUsername: env("ADMIN_BOOTSTRAP_USERNAME", ""),
		AdminBootstrapPassword: env("ADMIN_BOOTSTRAP_PASSWORD", ""),
		AdminSecureCookies:     boolEnv("ADMIN_SECURE_COOKIES", false),
		AutoRebuildStatistics:  boolEnv("AUTO_REBUILD_STATISTICS", true),

		RankingsRequireWCAAccount: boolEnv("RANKINGS_REQUIRE_WCA_ACCOUNT", false),

		SyncCron:          env("SYNC_CRON", "0 4 * * *"),
		JobPollInterval:   durationEnv("JOB_POLL_INTERVAL", 2*time.Second),
		CachePollInterval: durationEnv("CACHE_POLL_INTERVAL", 2*time.Second),
		BoundaryGeoJSON:   env("BOUNDARY_GEOJSON", ""),
		BoundaryMetadata:  env("BOUNDARY_METADATA", ""),
	}
}

func env(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok {
		return v
	}
	return fallback
}

func boolEnv(key string, fallback bool) bool {
	v, ok := os.LookupEnv(key)
	if !ok {
		return fallback
	}
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off", "":
		return false
	}
	return fallback
}

func intEnv(key string, fallback int) int {
	if n, err := strconv.Atoi(strings.TrimSpace(env(key, ""))); err == nil {
		return n
	}
	return fallback
}

func durationEnv(key string, fallback time.Duration) time.Duration {
	if v, ok := os.LookupEnv(key); ok {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
		if n, err := strconv.Atoi(v); err == nil {
			return time.Duration(n) * time.Second
		}
	}
	return fallback
}

func listEnv(key string) []string {
	var out []string
	for _, part := range strings.Split(env(key, ""), ",") {
		if part = strings.TrimSpace(part); part != "" {
			out = append(out, part)
		}
	}
	return out
}

// loadDotEnv sets variables from a KEY=VALUE file without overriding the
// real environment.
func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if len(value) >= 2 && (value[0] == '"' && value[len(value)-1] == '"' || value[0] == '\'' && value[len(value)-1] == '\'') {
			value = value[1 : len(value)-1]
		}
		if _, exists := os.LookupEnv(key); !exists {
			os.Setenv(key, value)
		}
	}
}
