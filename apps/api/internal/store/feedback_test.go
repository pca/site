package store

import (
	"context"
	"github.com/pca/backend/internal/db"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
)

func feedbackFixture(key string) FeedbackInput {
	return FeedbackInput{Key: key, Type: "data_issue", Title: "A specific ranking issue", Task: "I tried to check the rankings.", Observed: "The result was in a different region.", Expected: "I expected my approved region.", Context: FeedbackContext{Page: "rankings", Event: "333", Region: "NCR", Format: "average"}, Reviewed: true}
}
func TestFeedbackValidationAndIdempotentLimits(t *testing.T) {
	ctx := context.Background()
	d, err := db.Open(ctx, filepath.Join(t.TempDir(), "feedback.sqlite3"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	in := feedbackFixture("test-request-key-0001")
	first, dup, err := CreateFeedback(ctx, d, 1, in)
	if err != nil || dup || first.Revision != 1 {
		t.Fatal(first, dup, err)
	}
	repeated, dup, err := CreateFeedback(ctx, d, 1, in)
	if err != nil || !dup || repeated.ID != first.ID {
		t.Fatal("retry duplicated report", err)
	}
	in.Title = "A changed report title"
	if _, _, err := CreateFeedback(ctx, d, 1, in); err != ErrFeedbackConflict {
		t.Fatal("key reuse accepted", err)
	}
	for _, key := range []string{"test-request-key-0002", "test-request-key-0003"} {
		if _, _, err := CreateFeedback(ctx, d, 1, feedbackFixture(key)); err != nil {
			t.Fatal(err)
		}
	}
	if _, _, err := CreateFeedback(ctx, d, 1, feedbackFixture("test-request-key-0004")); err != ErrFeedbackLimit {
		t.Fatal("limit missed", err)
	}
	all, total, err := ListFeedback(ctx, d.Read, FeedbackFilter{Type: "data_issue", Page: "rankings"})
	if err != nil || len(all) != 3 || total != 3 {
		t.Fatal(total, err)
	}
	for _, bad := range []FeedbackInput{{}, func() FeedbackInput { v := feedbackFixture("test-request-key-0005"); v.Reviewed = false; return v }(), func() FeedbackInput {
		v := feedbackFixture("test-request-key-0005")
		v.Context.Snapshot = "https://evil.test/?token=x"
		return v
	}()} {
		if ValidateFeedback(bad) {
			t.Fatal("invalid input accepted")
		}
	}
}
func TestFeedbackConcurrentRateLimitAndReviewAudit(t *testing.T) {
	ctx := context.Background()
	d, err := db.Open(ctx, filepath.Join(t.TempDir(), "concurrent.sqlite3"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	var accepted atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			key := "test-request-key-000" + string(rune('0'+i))
			_, _, err := CreateFeedback(ctx, d, 5, feedbackFixture(key))
			if err == nil {
				accepted.Add(1)
			} else if err != ErrFeedbackLimit {
				t.Error(err)
			}
		}(i)
	}
	wg.Wait()
	if accepted.Load() != 3 {
		t.Fatal("racing submissions bypassed limit", accepted.Load())
	}
	items, _, _ := ListFeedback(ctx, d.Read, FeedbackFilter{})
	f := items[0]
	review := FeedbackReview{Type: "ux_feedback", Status: "reviewing", Note: "Check the mobile filter first.", Revision: 1}
	updated, err := ReviewFeedback(ctx, d, f.ID, 9, review)
	if err != nil || updated.Revision != 2 || updated.OriginalType != "data_issue" || updated.Type != "ux_feedback" {
		t.Fatal(updated, err)
	}
	if _, err := ReviewFeedback(ctx, d, f.ID, 10, review); err != ErrFeedbackConflict {
		t.Fatal("stale review overwrote newer edit", err)
	}
	history, err := FeedbackHistory(ctx, d.Read, f.ID)
	if err != nil || len(history) != 1 || history[0].ReviewerID != 9 || history[0].Revision != 2 {
		t.Fatal(history, err)
	}
	empty, total, err := ListFeedback(ctx, d.Read, FeedbackFilter{Query: "unmatched"})
	if err != nil || len(empty) != 0 || total != 0 {
		t.Fatal(empty, total, err)
	}
}
