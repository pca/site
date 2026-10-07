package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/pca/backend/internal/db"
	"github.com/pca/backend/internal/timefmt"
)

const (
	StatusPending  = "p"
	StatusApproved = "a"
	StatusDenied   = "d"
)

var StatusDisplay = map[string]string{
	StatusPending:  "Pending",
	StatusApproved: "Approved",
	StatusDenied:   "Denied",
}

type RegionRequest struct {
	ID         int64
	UserID     int64
	Region     string
	Status     string
	StaffNotes string
	CreatedAt  db.Time
	UpdatedAt  db.Time
}

func (r RegionRequest) StatusLabel() string {
	if s, ok := StatusDisplay[r.Status]; ok {
		return s
	}
	return r.Status
}

func RequestsForUser(ctx context.Context, q db.Execer, userID int64) ([]RegionRequest, error) {
	rows, err := q.QueryContext(ctx, `SELECT id, user_id, region, status, staff_notes, created_at, updated_at
		FROM api_regionupdaterequest WHERE user_id = ? ORDER BY created_at DESC, id DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []RegionRequest
	for rows.Next() {
		var r RegionRequest
		if err := rows.Scan(&r.ID, &r.UserID, &r.Region, &r.Status, &r.StaffNotes, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func CreateRequest(ctx context.Context, q db.Execer, userID int64, region string) (*RegionRequest, error) {
	now := timefmt.Now()
	res, err := q.ExecContext(ctx, `INSERT INTO api_regionupdaterequest (status, created_at, updated_at, user_id,
		staff_notes, region) VALUES (?, ?, ?, ?, '', ?)`, StatusPending, timefmt.FormatDB(now), timefmt.FormatDB(now), userID, region)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return &RegionRequest{ID: id, UserID: userID, Region: region, Status: StatusPending,
		CreatedAt: db.Time{Time: now, Valid: true}, UpdatedAt: db.Time{Time: now, Valid: true}}, nil
}

// AdminRequest is a request joined with its user and WCA person name.
type AdminRequest struct {
	RegionRequest
	Username      string
	FirstName     string
	LastName      string
	WCAID         sql.NullString
	CurrentRegion sql.NullString
	PersonName    sql.NullString
}

func (r AdminRequest) DisplayName() string {
	if r.PersonName.Valid && r.PersonName.String != "" {
		return r.PersonName.String
	}
	if n := strings.TrimSpace(r.FirstName + " " + r.LastName); n != "" {
		return n
	}
	return r.Username
}

type RequestFilter struct {
	Status string
	Query  string
	Region string
	Limit  int
	Offset int
}

func (f RequestFilter) where() (string, []any) {
	var clauses []string
	var args []any
	if f.Status != "" {
		clauses = append(clauses, "r.status = ?")
		args = append(args, f.Status)
	}
	if f.Region != "" {
		clauses = append(clauses, "r.region = ?")
		args = append(args, f.Region)
	}
	if q := strings.TrimSpace(f.Query); q != "" {
		like := "%" + strings.ToLower(q) + "%"
		clauses = append(clauses, `(lower(u.wca_id) LIKE ? OR lower(u.username) LIKE ? OR
			lower(u.first_name || ' ' || u.last_name) LIKE ? OR lower(p.name) LIKE ?)`)
		args = append(args, like, like, like, like)
	}
	if len(clauses) == 0 {
		return "", nil
	}
	return " WHERE " + strings.Join(clauses, " AND "), args
}

const adminRequestFrom = ` FROM api_regionupdaterequest r
	JOIN api_user u ON u.id = r.user_id
	LEFT JOIN wca_person p ON p.id = u.wca_id`

func ListAdminRequests(ctx context.Context, q db.Execer, f RequestFilter) ([]AdminRequest, int, error) {
	where, args := f.where()
	var total int
	if err := q.QueryRowContext(ctx, `SELECT COUNT(*)`+adminRequestFrom+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	order := " ORDER BY r.created_at DESC, r.id DESC"
	if f.Status == StatusPending {
		order = " ORDER BY r.created_at ASC, r.id ASC"
	}
	rows, err := q.QueryContext(ctx, `SELECT r.id, r.user_id, r.region, r.status, r.staff_notes, r.created_at,
		r.updated_at, u.username, u.first_name, u.last_name, u.wca_id, u.region, p.name`+adminRequestFrom+where+order+
		` LIMIT ? OFFSET ?`, append(args, f.Limit, f.Offset)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var out []AdminRequest
	for rows.Next() {
		var r AdminRequest
		if err := rows.Scan(&r.ID, &r.UserID, &r.Region, &r.Status, &r.StaffNotes, &r.CreatedAt, &r.UpdatedAt,
			&r.Username, &r.FirstName, &r.LastName, &r.WCAID, &r.CurrentRegion, &r.PersonName); err != nil {
			return nil, 0, err
		}
		out = append(out, r)
	}
	return out, total, rows.Err()
}

func CountRequestsByStatus(ctx context.Context, q db.Execer) (map[string]int, error) {
	rows, err := q.QueryContext(ctx, `SELECT status, COUNT(*) FROM api_regionupdaterequest GROUP BY status`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var s string
		var n int
		if err := rows.Scan(&s, &n); err != nil {
			return nil, err
		}
		out[s] = n
	}
	return out, rows.Err()
}

// DecideRequest changes a request's status and notes. Moving a request into
// the approved state applies its region to the user. It returns whether a user's region changed.
func DecideRequest(ctx context.Context, tx *sql.Tx, id int64, status string, notes *string) (bool, error) {
	if _, ok := StatusDisplay[status]; !ok {
		return false, fmt.Errorf("invalid status %q", status)
	}
	var userID int64
	var region, current string
	err := tx.QueryRowContext(ctx, `SELECT user_id, region, status FROM api_regionupdaterequest WHERE id = ?`, id).
		Scan(&userID, &region, &current)
	if errors.Is(err, sql.ErrNoRows) {
		return false, ErrNotFound
	}
	if err != nil {
		return false, err
	}
	now := timefmt.FormatDB(timefmt.Now())
	if notes != nil {
		_, err = tx.ExecContext(ctx, `UPDATE api_regionupdaterequest SET status = ?, staff_notes = ?, updated_at = ? WHERE id = ?`,
			status, *notes, now, id)
	} else {
		_, err = tx.ExecContext(ctx, `UPDATE api_regionupdaterequest SET status = ?, updated_at = ? WHERE id = ?`,
			status, now, id)
	}
	if err != nil {
		return false, err
	}
	if status == StatusApproved && current != StatusApproved {
		if err := SetUserRegion(ctx, tx, userID, &region); err != nil {
			return false, err
		}
		return true, nil
	}
	return false, nil
}
