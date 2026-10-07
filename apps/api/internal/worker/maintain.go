package worker

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"
)

const (
	// keepJobs is how many finished jobs (with their logs) stay in history.
	keepJobs = 200
	// VACUUM rewrites the whole file, so it only runs once free pages are
	// both large in absolute terms and a large share of the file.
	vacuumMinFreeBytes = 32 << 20
	vacuumMinFreeRatio = 0.25
)

// Maintain keeps the database from growing across syncs. Every new WCA
// export produces a new statistics snapshot (about 10k rows), so superseded
// snapshots and old job logs are deleted, the WAL is truncated, and the file
// is vacuumed when deletions left a lot of free space.
func (w *Worker) Maintain(ctx context.Context, logf func(string, ...any)) error {
	var snapshots, jobsDeleted int64
	err := w.db.Tx(ctx, func(tx *sql.Tx) error {
		var err error
		if snapshots, err = pruneSnapshots(ctx, tx); err != nil {
			return fmt.Errorf("prune statistics snapshots: %w", err)
		}
		res, err := tx.ExecContext(ctx, `DELETE FROM pca_job WHERE status NOT IN ('queued', 'running')
			AND id NOT IN (SELECT id FROM pca_job ORDER BY id DESC LIMIT ?)`, keepJobs)
		if err != nil {
			return fmt.Errorf("prune jobs: %w", err)
		}
		jobsDeleted, _ = res.RowsAffected()
		return nil
	})
	if err != nil {
		return err
	}
	if snapshots > 0 || jobsDeleted > 0 {
		logf("Removed %d superseded statistics snapshot(s) and %d old job(s).", snapshots, jobsDeleted)
	}

	pageSize, pages, free, err := w.pageStats(ctx)
	if err != nil {
		return err
	}
	freeBytes := free * pageSize
	if freeBytes >= vacuumMinFreeBytes && float64(free) >= vacuumMinFreeRatio*float64(pages) {
		start := time.Now()
		if _, err := w.db.Write.ExecContext(ctx, `VACUUM`); err != nil {
			return fmt.Errorf("vacuum: %w", err)
		}
		_, after, _, err := w.pageStats(ctx)
		if err != nil {
			return err
		}
		logf("Compacted the database from %.1f MB to %.1f MB in %s.", mb(pages*pageSize), mb(after*pageSize),
			time.Since(start).Round(time.Millisecond))
	}

	// Writes since the last checkpoint live in the WAL file; TRUNCATE folds
	// them into the database and resets the WAL to zero bytes.
	if _, err := w.db.Write.ExecContext(ctx, `PRAGMA wal_checkpoint(TRUNCATE)`); err != nil {
		return fmt.Errorf("checkpoint: %w", err)
	}
	return nil
}

// pruneSnapshots deletes every statistics snapshot except the active one and
// the one before it. The previous snapshot stays because the API may still be
// reading its rows at the moment a new one is activated.
func pruneSnapshots(ctx context.Context, tx *sql.Tx) (int64, error) {
	rows, err := tx.QueryContext(ctx, `SELECT id FROM api_statisticssnapshot WHERE is_active = 1
		UNION SELECT id FROM (SELECT id FROM api_statisticssnapshot WHERE is_active = 0 AND status = 'ready'
			ORDER BY activated_at DESC, id DESC LIMIT 1)`)
	if err != nil {
		return 0, err
	}
	var keep []any
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return 0, err
		}
		keep = append(keep, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	if len(keep) == 0 {
		return 0, nil
	}
	in := strings.TrimSuffix(strings.Repeat("?,", len(keep)), ",")
	for _, table := range []string{"api_regionalstrengthrecord", "api_growthannualrecord"} {
		if _, err := tx.ExecContext(ctx, `DELETE FROM `+table+` WHERE snapshot_id NOT IN (`+in+`)`, keep...); err != nil {
			return 0, err
		}
	}
	res, err := tx.ExecContext(ctx, `DELETE FROM api_statisticssnapshot WHERE id NOT IN (`+in+`)`, keep...)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (w *Worker) pageStats(ctx context.Context) (pageSize, pages, free int64, err error) {
	q := w.db.Write
	if err = q.QueryRowContext(ctx, `PRAGMA page_size`).Scan(&pageSize); err != nil {
		return
	}
	if err = q.QueryRowContext(ctx, `PRAGMA page_count`).Scan(&pages); err != nil {
		return
	}
	err = q.QueryRowContext(ctx, `PRAGMA freelist_count`).Scan(&free)
	return
}

func mb(bytes int64) float64 { return float64(bytes) / (1 << 20) }
