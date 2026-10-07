package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/robfig/cron/v3"

	"github.com/pca/backend/internal/db"
	"github.com/pca/backend/internal/timefmt"
)

// MinSyncGap is the shortest allowed time between scheduled syncs.
const MinSyncGap = time.Hour

// Schedule is the sync schedule set by staff in the admin. Without one the
// worker uses SYNC_CRON. An empty Cron turns scheduled syncs off.
type Schedule struct {
	Cron      string     `json:"cron"`
	UpdatedBy string     `json:"updated_by"`
	UpdatedAt *time.Time `json:"updated_at"`
}

// ParseCron parses a five-field cron expression (or a descriptor such as
// @daily) evaluated in Asia/Manila, rejecting schedules that run more often
// than MinSyncGap.
func ParseCron(expr string) (cron.Schedule, error) {
	expr = strings.TrimSpace(expr)
	if strings.HasPrefix(expr, "TZ=") || strings.HasPrefix(expr, "CRON_TZ=") {
		return nil, errors.New("schedules always use Asia/Manila time; remove the time zone")
	}
	s, err := cron.ParseStandard(expr)
	if err != nil {
		return nil, err
	}
	prev := s.Next(time.Now().In(timefmt.Manila))
	if prev.IsZero() {
		return nil, errors.New("the schedule never runs")
	}
	for range 48 {
		next := s.Next(prev)
		if next.IsZero() {
			break
		}
		if next.Sub(prev) < MinSyncGap {
			return nil, errors.New("syncs must be at least an hour apart")
		}
		prev = next
	}
	return s, nil
}

// NextRuns lists the next n run times of a valid expression, in UTC. It is
// empty, never nil, when the expression is off or invalid.
func NextRuns(expr string, n int) []time.Time {
	out := make([]time.Time, 0, n)
	s, err := cron.ParseStandard(strings.TrimSpace(expr))
	if err != nil {
		return out
	}
	t := time.Now().In(timefmt.Manila)
	for range n {
		t = s.Next(t)
		if t.IsZero() {
			break
		}
		out = append(out, t.UTC())
	}
	return out
}

// ReadSchedule returns the stored schedule, or nil when SYNC_CRON applies.
func ReadSchedule(ctx context.Context, q db.Execer) (*Schedule, error) {
	v, ok, err := db.GetMeta(ctx, q, db.MetaSyncSchedule)
	if err != nil || !ok {
		return nil, err
	}
	var s Schedule
	if err := json.Unmarshal([]byte(v), &s); err != nil {
		return nil, err
	}
	return &s, nil
}

func WriteSchedule(ctx context.Context, q db.Execer, cronExpr, by string) (Schedule, error) {
	now := timefmt.Now()
	s := Schedule{Cron: strings.TrimSpace(cronExpr), UpdatedBy: by, UpdatedAt: &now}
	b, _ := json.Marshal(s)
	return s, db.SetMeta(ctx, q, db.MetaSyncSchedule, string(b))
}

// ClearSchedule returns to the SYNC_CRON default.
func ClearSchedule(ctx context.Context, q db.Execer) error {
	return db.DeleteMeta(ctx, q, db.MetaSyncSchedule)
}

// EffectiveCron is the expression the worker runs: the stored schedule if
// staff set one, otherwise def. "" means scheduled syncs are off.
func EffectiveCron(stored *Schedule, def string) string {
	if stored != nil {
		return stored.Cron
	}
	return def
}
