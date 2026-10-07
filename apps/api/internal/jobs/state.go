package jobs

import (
	"context"
	"encoding/json"
	"time"

	"github.com/pca/backend/internal/db"
)

// Heartbeat is written by the worker so the admin can show whether it is alive.
type Heartbeat struct {
	At       time.Time `json:"at"`
	PID      int       `json:"pid"`
	Hostname string    `json:"hostname"`
	// Cron is the schedule in effect; "" means scheduled syncs are off.
	Cron     string     `json:"cron"`
	NextSync *time.Time `json:"next_sync"`
}

// Alive reports whether the heartbeat is recent enough to trust.
func (h Heartbeat) Alive(pollInterval time.Duration) bool {
	limit := 3 * pollInterval
	if limit < time.Minute {
		limit = time.Minute
	}
	return time.Since(h.At) < limit
}

func WriteHeartbeat(ctx context.Context, q db.Execer, h Heartbeat) error {
	b, _ := json.Marshal(h)
	return db.SetMeta(ctx, q, db.MetaWorkerHeartbeat, string(b))
}

func ReadHeartbeat(ctx context.Context, q db.Execer) (*Heartbeat, error) {
	v, ok, err := db.GetMeta(ctx, q, db.MetaWorkerHeartbeat)
	if err != nil || !ok {
		return nil, err
	}
	var h Heartbeat
	if json.Unmarshal([]byte(v), &h) != nil {
		return nil, nil
	}
	return &h, nil
}

// ImportState describes the WCA export currently loaded into the database.
// ExportDate and ExportFormatVersion keep the archive metadata.json strings.
type ImportState struct {
	ExportDate          string    `json:"export_date"`
	ExportFormatVersion string    `json:"export_format_version"`
	ArchiveSHA256       string    `json:"archive_sha256"`
	ArchiveBytes        int64     `json:"archive_bytes"`
	ImportedAt          time.Time `json:"imported_at"`
	Source              string    `json:"source"`
}

// SnapshotVersion is the export_version recorded on statistics snapshots.
func (s ImportState) SnapshotVersion() string {
	return s.ExportFormatVersion + ":" + s.ExportDate
}

func WriteImportState(ctx context.Context, q db.Execer, s ImportState) error {
	b, _ := json.Marshal(s)
	return db.SetMeta(ctx, q, db.MetaWCAImportState, string(b))
}

func ReadImportState(ctx context.Context, q db.Execer) (*ImportState, error) {
	v, ok, err := db.GetMeta(ctx, q, db.MetaWCAImportState)
	if err != nil || !ok {
		return nil, err
	}
	var s ImportState
	if err := json.Unmarshal([]byte(v), &s); err != nil {
		return nil, err
	}
	return &s, nil
}
