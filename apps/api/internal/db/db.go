// Package db opens the shared SQLite database used by the API and worker.
package db

import (
	"context"
	"database/sql"
	_ "embed"
	"errors"
	"fmt"
	"net/url"
	"path/filepath"
	"runtime"
	"strconv"
	"time"

	"github.com/pca/backend/internal/timefmt"
	_ "modernc.org/sqlite"
)

//go:embed core_schema.sql
var coreSchema string

//go:embed schema.sql
var goSchema string

// DB holds a read pool and a single-connection write pool. SQLite permits one
// writer at a time; funnelling writes through one connection avoids
// SQLITE_BUSY churn inside a process while WAL keeps readers unblocked.
type DB struct {
	Read  *sql.DB
	Write *sql.DB
	Path  string
}

func dsn(path string, readOnly bool) string {
	q := url.Values{}
	q.Add("_pragma", "busy_timeout(15000)")
	q.Add("_pragma", "journal_mode(WAL)")
	q.Add("_pragma", "synchronous(NORMAL)")
	// A WAL file is reused, not shrunk, after checkpoints. Without a limit it
	// stays as large as the biggest transaction (a full WCA import).
	q.Add("_pragma", "journal_size_limit(67108864)")
	q.Add("_pragma", "foreign_keys(0)")
	q.Add("_pragma", "temp_store(MEMORY)")
	q.Add("_pragma", "cache_size(-65536)")
	q.Add("_pragma", "mmap_size(268435456)")
	if readOnly {
		q.Add("_pragma", "query_only(1)")
	} else {
		q.Set("_txlock", "immediate")
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		abs = path
	}
	return "file:" + filepath.ToSlash(abs) + "?" + q.Encode()
}

func Open(ctx context.Context, path string) (*DB, error) {
	w, err := sql.Open("sqlite", dsn(path, false))
	if err != nil {
		return nil, err
	}
	w.SetMaxOpenConns(1)
	w.SetMaxIdleConns(1)
	w.SetConnMaxLifetime(0)
	if err := w.PingContext(ctx); err != nil {
		w.Close()
		return nil, fmt.Errorf("open %s: %w", path, err)
	}
	if err := ensureSchema(ctx, w); err != nil {
		w.Close()
		return nil, err
	}

	r, err := sql.Open("sqlite", dsn(path, true))
	if err != nil {
		w.Close()
		return nil, err
	}
	n := runtime.NumCPU()
	if n < 4 {
		n = 4
	}
	r.SetMaxOpenConns(n)
	r.SetMaxIdleConns(n)
	r.SetConnMaxLifetime(0)
	return &DB{Read: r, Write: w, Path: path}, nil
}

func ensureSchema(ctx context.Context, w *sql.DB) error {
	if _, err := w.ExecContext(ctx, coreSchema); err != nil {
		return fmt.Errorf("ensure core schema: %w", err)
	}
	if _, err := w.ExecContext(ctx, goSchema); err != nil {
		return fmt.Errorf("ensure schema: %w", err)
	}
	return nil
}

func (d *DB) Close() error {
	return errors.Join(d.Read.Close(), d.Write.Close())
}

// Tx runs fn inside a write transaction (BEGIN IMMEDIATE).
func (d *DB) Tx(ctx context.Context, fn func(*sql.Tx) error) error {
	tx, err := d.Write.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit()
}

// Execer is satisfied by *sql.DB and *sql.Tx.
type Execer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
}

const (
	MetaDataGeneration  = "data_generation"
	MetaWCAImportState  = "wca_import_state"
	MetaWorkerHeartbeat = "worker_heartbeat"
	MetaMaintenance     = "maintenance"
	MetaSyncSchedule    = "sync_schedule"
)

func GetMeta(ctx context.Context, q Execer, key string) (string, bool, error) {
	var v string
	err := q.QueryRowContext(ctx, `SELECT value FROM pca_meta WHERE key = ?`, key).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return v, true, nil
}

func SetMeta(ctx context.Context, q Execer, key, value string) error {
	_, err := q.ExecContext(ctx, `INSERT INTO pca_meta (key, value, updated_at) VALUES (?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		key, value, timefmt.FormatDB(timefmt.Now()))
	return err
}

func DeleteMeta(ctx context.Context, q Execer, key string) error {
	_, err := q.ExecContext(ctx, `DELETE FROM pca_meta WHERE key = ?`, key)
	return err
}

// BumpGeneration signals other processes that cached data must be reloaded.
func BumpGeneration(ctx context.Context, q Execer) error {
	_, err := q.ExecContext(ctx, `INSERT INTO pca_meta (key, value, updated_at) VALUES (?, '1', ?)
		ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = excluded.updated_at`,
		MetaDataGeneration, timefmt.FormatDB(timefmt.Now()))
	return err
}

func Generation(ctx context.Context, q Execer) (int64, error) {
	v, ok, err := GetMeta(ctx, q, MetaDataGeneration)
	if err != nil || !ok {
		return 0, err
	}
	return strconv.ParseInt(v, 10, 64)
}

// Time scans a datetime column that the driver may return as text or
// time.Time.
type Time struct {
	Time  time.Time
	Valid bool
}

func (t *Time) Scan(src any) error {
	switch v := src.(type) {
	case nil:
		t.Valid = false
		return nil
	case time.Time:
		t.Time, t.Valid = v.UTC(), true
		return nil
	case string:
		return t.parse(v)
	case []byte:
		return t.parse(string(v))
	}
	return fmt.Errorf("db.Time: unsupported type %T", src)
}

func (t *Time) parse(s string) error {
	parsed, err := timefmt.ParseDB(s)
	if err != nil {
		return err
	}
	t.Time, t.Valid = parsed, true
	return nil
}

// NullString returns nil for empty values, for nullable text columns.
func NullString(s *string) any {
	if s == nil {
		return nil
	}
	return *s
}
