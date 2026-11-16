package store

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/pca/backend/internal/db"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

var ErrFeedbackLimit = errors.New("feedback limit reached")
var ErrFeedbackConflict = errors.New("feedback changed or duplicate submission key")
var ErrFeedbackInvalid = errors.New("invalid feedback")

type FeedbackContext struct {
	Page     string `json:"page"`
	Event    string `json:"event"`
	Region   string `json:"region"`
	Format   string `json:"format"`
	View     string `json:"view"`
	Snapshot string `json:"snapshot"`
}
type FeedbackInput struct {
	Key      string          `json:"key"`
	Type     string          `json:"type"`
	Title    string          `json:"title"`
	Task     string          `json:"task"`
	Observed string          `json:"observed"`
	Expected string          `json:"expected"`
	Context  FeedbackContext `json:"context"`
	Reviewed bool            `json:"reviewed"`
}
type Feedback struct {
	ID           string          `json:"id"`
	UserID       int64           `json:"userId"`
	OriginalType string          `json:"originalType"`
	Type         string          `json:"type"`
	Status       string          `json:"status"`
	Title        string          `json:"title"`
	Task         string          `json:"task"`
	Observed     string          `json:"observed"`
	Expected     string          `json:"expected"`
	Context      FeedbackContext `json:"context"`
	Note         string          `json:"note"`
	Revision     int             `json:"revision"`
	CreatedAt    string          `json:"createdAt"`
	UpdatedAt    string          `json:"updatedAt"`
}
type FeedbackReview struct {
	Type       string `json:"type"`
	Status     string `json:"status"`
	Note       string `json:"note"`
	Revision   int    `json:"revision"`
	ReviewerID int64  `json:"reviewerId"`
	CreatedAt  string `json:"createdAt"`
}

func FeedbackType(v string) bool { return v == "data_issue" || v == "ux_feedback" || v == "suggestion" }
func FeedbackStatus(v string) bool {
	return v == "new" || v == "reviewing" || v == "resolved" || v == "dismissed"
}
func boundedText(s string, min, max int) bool {
	n := utf8.RuneCountInString(strings.TrimSpace(s))
	return utf8.ValidString(s) && n >= min && n <= max && !strings.ContainsFunc(s, func(r rune) bool { return unicode.IsControl(r) && r != '\n' && r != '\r' && r != '\t' })
}
func ValidateFeedback(in FeedbackInput) bool {
	c := in.Context
	if !in.Reviewed || !regexp.MustCompile(`^[a-zA-Z0-9_-]{16,80}$`).MatchString(in.Key) || !FeedbackType(in.Type) || !boundedText(in.Title, 5, 120) || !boundedText(in.Task, 10, 600) || !boundedText(in.Observed, 10, 2000) || !boundedText(in.Expected, 10, 1200) {
		return false
	}
	if c.Page != "rankings" && c.Page != "statistics" {
		return false
	}
	for _, value := range []string{c.Event, c.Region, c.Format, c.View, c.Snapshot} {
		if len(value) > 120 || !regexp.MustCompile(`^[a-zA-Z0-9_.:-]*$`).MatchString(value) {
			return false
		}
	}
	return (c.Format == "" || c.Format == "single" || c.Format == "average") && (c.View == "" || c.View == "event" || c.View == "region")
}

const feedbackColumns = `id,user_id,original_type,type,status,title,task,observed,expected,context,staff_note,revision,created_at,updated_at`

func scanFeedback(row interface{ Scan(...any) error }) (Feedback, error) {
	var f Feedback
	var context string
	err := row.Scan(&f.ID, &f.UserID, &f.OriginalType, &f.Type, &f.Status, &f.Title, &f.Task, &f.Observed, &f.Expected, &context, &f.Note, &f.Revision, &f.CreatedAt, &f.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return f, ErrNotFound
	}
	if err == nil {
		err = json.Unmarshal([]byte(context), &f.Context)
	}
	return f, err
}
func GetFeedback(ctx context.Context, q db.Execer, id string) (Feedback, error) {
	return scanFeedback(q.QueryRowContext(ctx, `SELECT `+feedbackColumns+` FROM pca_feedback WHERE id=?`, id))
}
func CreateFeedback(ctx context.Context, d *db.DB, user int64, in FeedbackInput) (Feedback, bool, error) {
	if !ValidateFeedback(in) {
		return Feedback{}, false, ErrFeedbackInvalid
	}
	payload, _ := json.Marshal(in)
	hash := sha256.Sum256(payload)
	digest := hex.EncodeToString(hash[:])
	var result Feedback
	duplicate := false
	err := d.Tx(ctx, func(tx *sql.Tx) error {
		var id, oldHash string
		err := tx.QueryRowContext(ctx, `SELECT id,payload_hash FROM pca_feedback WHERE user_id=? AND submission_key=?`, user, in.Key).Scan(&id, &oldHash)
		if err == nil {
			if oldHash != digest {
				return ErrFeedbackConflict
			}
			duplicate = true
			result, err = GetFeedback(ctx, tx, id)
			return err
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		var count int
		now := time.Now().UTC()
		if err = tx.QueryRowContext(ctx, `SELECT count(*) FROM pca_feedback WHERE user_id=? AND created_at>=?`, user, now.Add(-24*time.Hour).Format(time.RFC3339Nano)).Scan(&count); err != nil {
			return err
		}
		if count >= 3 {
			return ErrFeedbackLimit
		}
		id = randomHex(16)
		context, _ := json.Marshal(in.Context)
		stamp := now.Format(time.RFC3339Nano)
		_, err = tx.ExecContext(ctx, `INSERT INTO pca_feedback(id,user_id,submission_key,payload_hash,original_type,type,title,task,observed,expected,context,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, user, in.Key, digest, in.Type, in.Type, strings.TrimSpace(in.Title), strings.TrimSpace(in.Task), strings.TrimSpace(in.Observed), strings.TrimSpace(in.Expected), string(context), stamp, stamp)
		if err != nil {
			return err
		}
		result, err = GetFeedback(ctx, tx, id)
		return err
	})
	return result, duplicate, err
}

type FeedbackFilter struct {
	Type, Status, Page, Query string
	Offset                    int
}

func ListFeedback(ctx context.Context, q db.Execer, f FeedbackFilter) ([]Feedback, int, error) {
	where := ` WHERE 1=1`
	args := []any{}
	if f.Type != "" {
		where += ` AND type=?`
		args = append(args, f.Type)
	}
	if f.Status != "" {
		where += ` AND status=?`
		args = append(args, f.Status)
	}
	if f.Page != "" {
		where += ` AND json_extract(context,'$.page')=?`
		args = append(args, f.Page)
	}
	if f.Query != "" {
		where += ` AND lower(title) LIKE ?`
		args = append(args, "%"+strings.ToLower(f.Query)+"%")
	}
	var total int
	if err := q.QueryRowContext(ctx, `SELECT count(*) FROM pca_feedback`+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := q.QueryContext(ctx, `SELECT `+feedbackColumns+` FROM pca_feedback`+where+` ORDER BY created_at DESC,id DESC LIMIT 30 OFFSET ?`, append(args, f.Offset)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []Feedback{}
	for rows.Next() {
		f, err := scanFeedback(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, f)
	}
	return out, total, rows.Err()
}
func ReviewFeedback(ctx context.Context, d *db.DB, id string, reviewer int64, review FeedbackReview) (Feedback, error) {
	if !FeedbackType(review.Type) || !FeedbackStatus(review.Status) || !boundedText(review.Note, 0, 2000) || review.Revision < 1 {
		return Feedback{}, ErrFeedbackInvalid
	}
	var result Feedback
	err := d.Tx(ctx, func(tx *sql.Tx) error {
		old, err := GetFeedback(ctx, tx, id)
		if err != nil {
			return err
		}
		if old.Revision != review.Revision {
			return ErrFeedbackConflict
		}
		stamp := time.Now().UTC().Format(time.RFC3339Nano)
		_, err = tx.ExecContext(ctx, `UPDATE pca_feedback SET type=?,status=?,staff_note=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?`, review.Type, review.Status, strings.TrimSpace(review.Note), stamp, id, review.Revision)
		if err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO pca_feedback_review(feedback_id,reviewer_id,type,status,note,revision,created_at) VALUES(?,?,?,?,?,?,?)`, id, reviewer, review.Type, review.Status, strings.TrimSpace(review.Note), review.Revision+1, stamp)
		if err != nil {
			return err
		}
		result, err = GetFeedback(ctx, tx, id)
		return err
	})
	return result, err
}
func FeedbackHistory(ctx context.Context, q db.Execer, id string) ([]FeedbackReview, error) {
	rows, err := q.QueryContext(ctx, `SELECT type,status,note,revision,reviewer_id,created_at FROM pca_feedback_review WHERE feedback_id=? ORDER BY revision DESC LIMIT 50`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []FeedbackReview{}
	for rows.Next() {
		var r FeedbackReview
		if err := rows.Scan(&r.Type, &r.Status, &r.Note, &r.Revision, &r.ReviewerID, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
