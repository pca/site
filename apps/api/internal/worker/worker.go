// Package worker runs scheduled and admin-requested data jobs: WCA sync,
// competition-region classification and statistics builds.
package worker

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/robfig/cron/v3"

	"github.com/pca/backend/internal/config"
	"github.com/pca/backend/internal/db"
	"github.com/pca/backend/internal/geo"
	"github.com/pca/backend/internal/jobs"
	"github.com/pca/backend/internal/timefmt"
)

type Worker struct {
	cfg      config.Config
	db       *db.DB
	log      *slog.Logger
	boundary *geo.Snapshot
	http     *http.Client
}

func New(cfg config.Config, d *db.DB, log *slog.Logger) (*Worker, error) {
	boundary, err := geo.Load(cfg.BoundaryGeoJSON, cfg.BoundaryMetadata)
	if err != nil {
		return nil, fmt.Errorf("Unable to load boundary snapshot: %w", err)
	}
	return &Worker{cfg: cfg, db: d, log: log, boundary: boundary, http: &http.Client{Timeout: 5 * time.Minute}}, nil
}

// Run schedules syncs and executes queued jobs until ctx is cancelled.
func (w *Worker) Run(ctx context.Context) error {
	if err := jobs.FailInterrupted(ctx, w.db.Write); err != nil {
		return err
	}
	if err := os.Remove(w.partialArchive()); err == nil {
		w.log.Info("removed an interrupted download", "path", w.partialArchive())
	}
	if w.cfg.SyncCron != "" {
		if _, err := jobs.ParseCron(w.cfg.SyncCron); err != nil {
			return fmt.Errorf("invalid SYNC_CRON %q: %w", w.cfg.SyncCron, err)
		}
	}
	s := &scheduler{w: w, ctx: ctx, cron: cron.New(cron.WithLocation(timefmt.Manila))}
	s.refresh()
	s.cron.Start()
	defer s.cron.Stop()

	host, _ := os.Hostname()
	beat := func() {
		s.refresh()
		h := jobs.Heartbeat{At: time.Now().UTC(), PID: os.Getpid(), Hostname: host, Cron: s.expr, NextSync: s.next()}
		if err := jobs.WriteHeartbeat(ctx, w.db.Write, h); err != nil && ctx.Err() == nil {
			w.log.Warn("heartbeat", "err", err)
		}
	}
	beat()
	go func() {
		t := time.NewTicker(w.cfg.JobPollInterval)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				beat()
			}
		}
	}()
	w.log.Info("worker started", "cron", s.expr, "next_sync", s.next(), "boundary", w.boundary.Metadata.Version)

	t := time.NewTicker(w.cfg.JobPollInterval)
	defer t.Stop()
	for {
		for ctx.Err() == nil {
			job, err := jobs.ClaimNext(ctx, w.db.Write)
			if err != nil {
				w.log.Error("claim job", "err", err)
				break
			}
			if job == nil {
				break
			}
			w.execute(ctx, job)
		}
		select {
		case <-ctx.Done():
			return nil
		case <-t.C:
		}
	}
}

func (w *Worker) execute(ctx context.Context, job *jobs.Job) {
	logger := newJobLogger(w.db, w.log, job.ID)
	logf := logger.logf
	logf("Started %s (requested by %s).", job.KindLabel(), firstNonEmpty(job.RequestedBy, job.Source))
	start := time.Now()
	status, err := w.Do(ctx, job.Kind, job.Options, logf)
	if err != nil {
		logf("Failed: %v", err)
		status = jobs.StatusFailed
	} else {
		logf("Finished in %s.", time.Since(start).Round(time.Millisecond))
	}
	logger.close()
	if ferr := jobs.Finish(context.WithoutCancel(ctx), w.db.Write, job.ID, status, err); ferr != nil {
		w.log.Error("finish job", "job", job.ID, "err", ferr)
	}
}

// Do runs one job kind, then database maintenance, and returns the job's
// final status. A maintenance failure is logged but does not fail the job.
func (w *Worker) Do(ctx context.Context, kind string, opts jobs.Options, logf func(string, ...any)) (string, error) {
	status, err := w.run(ctx, kind, opts, logf)
	if err != nil {
		return status, err
	}
	if merr := w.Maintain(ctx, logf); merr != nil {
		logf("Database maintenance failed: %v", merr)
	}
	return status, nil
}

func (w *Worker) run(ctx context.Context, kind string, opts jobs.Options, logf func(string, ...any)) (string, error) {
	switch kind {
	case jobs.KindSync:
		return w.Sync(ctx, opts.Force, logf)
	case jobs.KindStatistics:
		if err := w.refresh(ctx, logf); err != nil {
			return "", err
		}
	case jobs.KindAssignRegions:
		if err := w.AssignRegions(ctx, logf); err != nil {
			return "", err
		}
	case jobs.KindImportArchive:
		if opts.Archive == "" {
			return "", errors.New("no archive path given")
		}
		if err := w.ImportArchive(ctx, opts.Archive, logf); err != nil {
			return "", err
		}
	default:
		return "", fmt.Errorf("unknown job kind %q", kind)
	}
	return jobs.StatusSucceeded, nil
}

// RunNow records and executes a job immediately, for CLI use.
func (w *Worker) RunNow(ctx context.Context, kind string, opts jobs.Options) error {
	id, err := jobs.Start(ctx, w.db.Write, kind, "cli", opts)
	if err != nil {
		return err
	}
	logger := newJobLogger(w.db, w.log, id)
	status, runErr := w.Do(ctx, kind, opts, logger.logf)
	if runErr != nil {
		logger.logf("Failed: %v", runErr)
		status = jobs.StatusFailed
	}
	logger.close()
	if err := jobs.Finish(context.WithoutCancel(ctx), w.db.Write, id, status, runErr); err != nil {
		return errors.Join(runErr, err)
	}
	return runErr
}

// scheduler keeps the cron entry in line with the schedule set in the admin,
// falling back to SYNC_CRON when none is stored.
type scheduler struct {
	w      *Worker
	ctx    context.Context
	cron   *cron.Cron
	expr   string
	entry  cron.EntryID
	active bool
	loaded bool
}

func (s *scheduler) refresh() {
	stored, err := jobs.ReadSchedule(s.ctx, s.w.db.Read)
	if err != nil {
		if s.ctx.Err() == nil {
			s.w.log.Warn("read sync schedule", "err", err)
		}
		if s.loaded {
			return
		}
	}
	expr := jobs.EffectiveCron(stored, s.w.cfg.SyncCron)
	if s.loaded && expr == s.expr {
		return
	}
	var sched cron.Schedule
	if expr != "" {
		if sched, err = jobs.ParseCron(expr); err != nil {
			s.w.log.Error("ignoring invalid sync schedule; using SYNC_CRON", "cron", expr, "err", err)
			expr = s.w.cfg.SyncCron
			sched, _ = jobs.ParseCron(expr)
		}
	}
	if s.active {
		s.cron.Remove(s.entry)
		s.active = false
	}
	if sched != nil {
		s.entry = s.cron.Schedule(sched, cron.FuncJob(s.enqueue))
		s.active = true
	}
	if s.loaded {
		s.w.log.Info("sync schedule changed", "cron", expr, "previous", s.expr)
	}
	s.expr, s.loaded = expr, true
}

func (s *scheduler) enqueue() {
	if _, created, err := jobs.Enqueue(s.ctx, s.w.db.Write, jobs.KindSync, "cron", "", jobs.Options{}); err != nil {
		s.w.log.Error("enqueue scheduled sync", "err", err)
	} else if created {
		s.w.log.Info("scheduled sync queued")
	}
}

// next is the next scheduled sync, or nil when scheduled syncs are off.
func (s *scheduler) next() *time.Time {
	if !s.active {
		return nil
	}
	if t := s.cron.Entry(s.entry).Next; !t.IsZero() {
		t = t.UTC()
		return &t
	}
	if runs := jobs.NextRuns(s.expr, 1); len(runs) == 1 {
		return &runs[0]
	}
	return nil
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

// jobLogger writes log lines to the job row without ever blocking the job:
// the job may hold the single write connection while it logs.
type jobLogger struct {
	lines chan string
	done  chan struct{}
	log   *slog.Logger
}

func newJobLogger(d *db.DB, log *slog.Logger, jobID int64) *jobLogger {
	l := &jobLogger{lines: make(chan string, 1024), done: make(chan struct{}), log: log.With("job", jobID)}
	go func() {
		defer close(l.done)
		for line := range l.lines {
			if err := jobs.AppendLog(context.Background(), d.Write, jobID, line); err != nil {
				log.Warn("job log", "err", err)
			}
		}
	}()
	return l
}

func (l *jobLogger) logf(format string, args ...any) {
	line := fmt.Sprintf(format, args...)
	l.log.Info(line)
	select {
	case l.lines <- line:
	default:
	}
}

func (l *jobLogger) close() {
	close(l.lines)
	<-l.done
}
