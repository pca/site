// Package jobs is a small SQLite-backed queue shared by the API (which
// enqueues manual runs from the admin) and the worker (which executes them).
package jobs

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/pca/backend/internal/db"
	"github.com/pca/backend/internal/timefmt"
)

const (
	KindSync          = "sync"
	KindStatistics    = "statistics"
	KindAssignRegions = "assign_regions"
	KindImportArchive = "import_archive"
)

var KindLabels = map[string]string{
	KindSync:          "WCA sync",
	KindStatistics:    "Rebuild statistics",
	KindAssignRegions: "Classify competition regions",
	KindImportArchive: "Import local archive",
}

const (
	StatusQueued    = "queued"
	StatusRunning   = "running"
	StatusSucceeded = "succeeded"
	StatusFailed    = "failed"
	StatusSkipped   = "skipped"
)

type Options struct {
	Force   bool   `json:"force,omitempty"`
	Archive string `json:"archive,omitempty"`
}

type Job struct {
	ID          int64
	Kind        string
	Status      string
	Source      string
	RequestedBy string
	Options     Options
	Log         string
	Error       string
	CreatedAt   db.Time
	StartedAt   db.Time
	FinishedAt  db.Time
}

func (j Job) KindLabel() string {
	if l, ok := KindLabels[j.Kind]; ok {
		return l
	}
	return j.Kind
}

func (j Job) Duration() time.Duration {
	if !j.StartedAt.Valid {
		return 0
	}
	end := time.Now()
	if j.FinishedAt.Valid {
		end = j.FinishedAt.Time
	}
	return end.Sub(j.StartedAt.Time).Round(100 * time.Millisecond)
}

func (j Job) Active() bool { return j.Status == StatusQueued || j.Status == StatusRunning }

const columns = `id, kind, status, source, requested_by, options, log, error, created_at, started_at, finished_at`

func scan(row interface{ Scan(...any) error }) (*Job, error) {
	var j Job
	var opts string
	err := row.Scan(&j.ID, &j.Kind, &j.Status, &j.Source, &j.RequestedBy, &opts, &j.Log, &j.Error,
		&j.CreatedAt, &j.StartedAt, &j.FinishedAt)
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal([]byte(opts), &j.Options)
	return &j, nil
}

// Enqueue adds a job unless the same kind is already queued. It returns the
// queued job's ID and whether a new row was created.
func Enqueue(ctx context.Context, q db.Execer, kind, source, requestedBy string, opts Options) (int64, bool, error) {
	var existing int64
	err := q.QueryRowContext(ctx, `SELECT id FROM pca_job WHERE kind = ? AND status = ? ORDER BY id LIMIT 1`,
		kind, StatusQueued).Scan(&existing)
	if err == nil {
		return existing, false, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return 0, false, err
	}
	optJSON, _ := json.Marshal(opts)
	res, err := q.ExecContext(ctx, `INSERT INTO pca_job (kind, status, source, requested_by, options, created_at)
		VALUES (?, ?, ?, ?, ?, ?)`, kind, StatusQueued, source, requestedBy, string(optJSON), timefmt.FormatDB(timefmt.Now()))
	if err != nil {
		return 0, false, err
	}
	id, err := res.LastInsertId()
	return id, true, err
}

// ClaimNext atomically marks the oldest queued job as running.
func ClaimNext(ctx context.Context, q db.Execer) (*Job, error) {
	row := q.QueryRowContext(ctx, `UPDATE pca_job SET status = ?, started_at = ?
		WHERE id = (SELECT id FROM pca_job WHERE status = ? ORDER BY id LIMIT 1)
		RETURNING `+columns, StatusRunning, timefmt.FormatDB(timefmt.Now()), StatusQueued)
	j, err := scan(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return j, err
}

// Start records a job that is executed immediately (CLI runs).
func Start(ctx context.Context, q db.Execer, kind, source string, opts Options) (int64, error) {
	optJSON, _ := json.Marshal(opts)
	now := timefmt.FormatDB(timefmt.Now())
	res, err := q.ExecContext(ctx, `INSERT INTO pca_job (kind, status, source, options, created_at, started_at)
		VALUES (?, ?, ?, ?, ?, ?)`, kind, StatusRunning, source, string(optJSON), now, now)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func AppendLog(ctx context.Context, q db.Execer, id int64, line string) error {
	stamp := time.Now().In(timefmt.Manila).Format("15:04:05")
	_, err := q.ExecContext(ctx, `UPDATE pca_job SET log = log || ? WHERE id = ?`, stamp+"  "+strings.TrimRight(line, "\n")+"\n", id)
	return err
}

func Finish(ctx context.Context, q db.Execer, id int64, status string, jobErr error) error {
	msg := ""
	if jobErr != nil {
		msg = jobErr.Error()
	}
	_, err := q.ExecContext(ctx, `UPDATE pca_job SET status = ?, error = ?, finished_at = ? WHERE id = ?`,
		status, msg, timefmt.FormatDB(timefmt.Now()), id)
	return err
}

// FailInterrupted marks jobs left running by a previous worker process.
func FailInterrupted(ctx context.Context, q db.Execer) error {
	_, err := q.ExecContext(ctx, `UPDATE pca_job SET status = ?, error = 'Interrupted: the worker stopped before this job finished.',
		finished_at = ? WHERE status = ?`, StatusFailed, timefmt.FormatDB(timefmt.Now()), StatusRunning)
	return err
}

func Get(ctx context.Context, q db.Execer, id int64) (*Job, error) {
	j, err := scan(q.QueryRowContext(ctx, `SELECT `+columns+` FROM pca_job WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return j, err
}

func List(ctx context.Context, q db.Execer, limit, offset int) ([]Job, int, error) {
	var total int
	if err := q.QueryRowContext(ctx, `SELECT COUNT(*) FROM pca_job`).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := q.QueryContext(ctx, `SELECT `+columns+` FROM pca_job ORDER BY id DESC LIMIT ? OFFSET ?`, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var out []Job
	for rows.Next() {
		j, err := scan(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, *j)
	}
	return out, total, rows.Err()
}

func LastFinished(ctx context.Context, q db.Execer, kind string) (*Job, error) {
	j, err := scan(q.QueryRowContext(ctx, `SELECT `+columns+` FROM pca_job WHERE kind = ? AND status IN (?, ?, ?)
		ORDER BY id DESC LIMIT 1`, kind, StatusSucceeded, StatusFailed, StatusSkipped))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return j, err
}
