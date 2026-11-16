package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"github.com/pca/backend/internal/db"
	"math"
	"regexp"
	"time"
)

type ExperimentDefinition struct {
	Title        string  `json:"title"`
	Question     string  `json:"question"`
	Control      string  `json:"control"`
	Variant      string  `json:"variant"`
	Outcome      string  `json:"outcome"`
	Population   string  `json:"population"`
	Guardrail    string  `json:"guardrail"`
	DecisionRule string  `json:"decisionRule"`
	Status       string  `json:"status"`
	Baseline     float64 `json:"baseline"`
	Change       float64 `json:"change"`
	Traffic      int     `json:"traffic"`
	MinimumDays  int     `json:"minimumDays"`
}
type ExperimentPlan struct {
	ID         string               `json:"id"`
	Definition ExperimentDefinition `json:"definition"`
	Revision   int                  `json:"revision"`
	AuthorID   int64                `json:"authorId"`
	UpdatedBy  int64                `json:"updatedBy"`
	CreatedAt  string               `json:"createdAt"`
	UpdatedAt  string               `json:"updatedAt"`
}

func ValidExperimentDefinition(d ExperimentDefinition) bool {
	if !boundedText(d.Title, 3, 120) || (d.Status != "draft" && d.Status != "ready" && d.Status != "archived") || math.IsNaN(d.Baseline) || math.IsInf(d.Baseline, 0) || math.IsNaN(d.Change) || math.IsInf(d.Change, 0) || d.Baseline < 0.1 || d.Baseline > 99 || d.Change < 0.1 || d.Baseline+d.Change >= 100 || d.Traffic < 1 || d.Traffic > 10000000 || d.MinimumDays < 7 || d.MinimumDays > 90 {
		return false
	}
	for _, text := range []string{d.Question, d.Control, d.Variant, d.Outcome, d.Population, d.Guardrail, d.DecisionRule} {
		min := 0
		if d.Status == "ready" {
			min = 10
		}
		if !boundedText(text, min, 2000) {
			return false
		}
	}
	return true
}
func scanPlan(row interface{ Scan(...any) error }) (ExperimentPlan, error) {
	var p ExperimentPlan
	var definition string
	err := row.Scan(&p.ID, &definition, &p.Revision, &p.AuthorID, &p.UpdatedBy, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return p, ErrNotFound
	}
	if err == nil {
		err = json.Unmarshal([]byte(definition), &p.Definition)
	}
	return p, err
}
func GetExperimentPlan(ctx context.Context, q db.Execer, id string) (ExperimentPlan, error) {
	return scanPlan(q.QueryRowContext(ctx, `SELECT id,definition,revision,author_id,updated_by,created_at,updated_at FROM pca_experiment_plan WHERE id=?`, id))
}
func ListExperimentPlans(ctx context.Context, q db.Execer) ([]ExperimentPlan, error) {
	rows, err := q.QueryContext(ctx, `SELECT id,definition,revision,author_id,updated_by,created_at,updated_at FROM pca_experiment_plan ORDER BY updated_at DESC,id LIMIT 100`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ExperimentPlan{}
	for rows.Next() {
		p, err := scanPlan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
func SaveExperimentPlan(ctx context.Context, d *db.DB, user int64, p ExperimentPlan, create bool) (ExperimentPlan, error) {
	if !regexp.MustCompile(`^[a-f0-9]{32}$`).MatchString(p.ID) || !ValidExperimentDefinition(p.Definition) || (!create && p.Revision < 1) {
		return ExperimentPlan{}, ErrFeedbackInvalid
	}
	definition, _ := json.Marshal(p.Definition)
	var result ExperimentPlan
	err := d.Tx(ctx, func(tx *sql.Tx) error {
		stamp := time.Now().UTC().Format(time.RFC3339Nano)
		if create {
			existing, err := GetExperimentPlan(ctx, tx, p.ID)
			if err == nil {
				if existing.Definition == p.Definition {
					result = existing
					return nil
				}
				return ErrFeedbackConflict
			}
			if !errors.Is(err, ErrNotFound) {
				return err
			}
			var count int
			if err = tx.QueryRowContext(ctx, `SELECT count(*) FROM pca_experiment_plan`).Scan(&count); err != nil {
				return err
			}
			if count >= 100 {
				return ErrFeedbackLimit
			}
			if _, err = tx.ExecContext(ctx, `INSERT INTO pca_experiment_plan(id,definition,revision,author_id,updated_by,created_at,updated_at) VALUES(?,?,1,?,?,?,?)`, p.ID, string(definition), user, user, stamp, stamp); err != nil {
				return err
			}
			p.Revision = 1
		} else {
			old, err := GetExperimentPlan(ctx, tx, p.ID)
			if err != nil {
				return err
			}
			if old.Revision != p.Revision {
				return ErrFeedbackConflict
			}
			p.Revision++
			if _, err = tx.ExecContext(ctx, `UPDATE pca_experiment_plan SET definition=?,revision=?,updated_by=?,updated_at=? WHERE id=?`, string(definition), p.Revision, user, stamp, p.ID); err != nil {
				return err
			}
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO pca_experiment_plan_history(plan_id,definition,revision,reviewer_id,created_at) VALUES(?,?,?,?,?)`, p.ID, string(definition), p.Revision, user, stamp); err != nil {
			return err
		}
		var err error
		result, err = GetExperimentPlan(ctx, tx, p.ID)
		return err
	})
	return result, err
}
