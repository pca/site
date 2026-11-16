package store

import (
	"context"
	"fmt"
	"github.com/pca/backend/internal/db"
	"path/filepath"
	"testing"
)

func experimentFixture() ExperimentDefinition {
	return ExperimentDefinition{Title: "A specific design question", Status: "draft", Baseline: 20, Change: 5, Traffic: 50, MinimumDays: 14}
}
func TestExperimentPlanningStorageAndRevisionSafety(t *testing.T) {
	ctx := context.Background()
	d, err := db.Open(ctx, filepath.Join(t.TempDir(), "plans.sqlite3"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	p := ExperimentPlan{ID: "01234567890123456789012345678901", Definition: experimentFixture(), AuthorID: 999}
	result, err := SaveExperimentPlan(ctx, d, 1, p, true)
	if err != nil || result.Revision != 1 || result.AuthorID != 1 || result.UpdatedBy != 1 {
		t.Fatal(result, err)
	}
	retry, err := SaveExperimentPlan(ctx, d, 1, p, true)
	if err != nil || retry.ID != result.ID || retry.Revision != 1 {
		t.Fatal("create retry duplicated plan", err)
	}
	var history int
	_ = d.Read.QueryRowContext(ctx, `SELECT count(*) FROM pca_experiment_plan_history`).Scan(&history)
	if history != 1 {
		t.Fatal("retry duplicated history", history)
	}
	update := result
	update.Definition.Question = "Would a clearer label improve discovery?"
	saved, err := SaveExperimentPlan(ctx, d, 2, update, false)
	if err != nil || saved.Revision != 2 || saved.AuthorID != 1 || saved.UpdatedBy != 2 {
		t.Fatal(saved, err)
	}
	if _, err := SaveExperimentPlan(ctx, d, 3, update, false); err != ErrFeedbackConflict {
		t.Fatal("stale edit accepted", err)
	}
	update = saved
	update.Definition.Status = "ready"
	if _, err := SaveExperimentPlan(ctx, d, 2, update, false); err != ErrFeedbackInvalid {
		t.Fatal("incomplete plan marked ready", err)
	}
	update.Definition.Status = "running"
	if _, err := SaveExperimentPlan(ctx, d, 2, update, false); err != ErrFeedbackInvalid {
		t.Fatal("running status accepted", err)
	}
	update.Definition.Status = "archived"
	archived, err := SaveExperimentPlan(ctx, d, 2, update, false)
	if err != nil || archived.Revision != 3 {
		t.Fatal(err)
	}
	all, err := ListExperimentPlans(ctx, d.Read)
	if err != nil || len(all) != 1 || all[0].Definition.Status != "archived" {
		t.Fatal(all, err)
	}
	_ = d.Read.QueryRowContext(ctx, `SELECT count(*) FROM pca_experiment_plan_history`).Scan(&history)
	if history != 3 {
		t.Fatal("audit history missing", history)
	}
}
func TestExperimentLibraryBoundDoesNotReplacePlans(t *testing.T) {
	ctx := context.Background()
	d, err := db.Open(ctx, filepath.Join(t.TempDir(), "bounded.sqlite3"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	for i := 0; i < 100; i++ {
		if _, err := SaveExperimentPlan(ctx, d, 1, ExperimentPlan{ID: fmt.Sprintf("%032x", i), Definition: experimentFixture()}, true); err != nil {
			t.Fatal(i, err)
		}
	}
	if _, err := SaveExperimentPlan(ctx, d, 1, ExperimentPlan{ID: fmt.Sprintf("%032x", 101), Definition: experimentFixture()}, true); err != ErrFeedbackLimit {
		t.Fatal("library cap missed", err)
	}
	all, err := ListExperimentPlans(ctx, d.Read)
	if err != nil || len(all) != 100 {
		t.Fatal("plans replaced", len(all), err)
	}
}
