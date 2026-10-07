package store

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/pca/backend/internal/db"
	"github.com/pca/backend/internal/timefmt"
)

// AdminUser is a user row with its WCA person name and latest request.
type AdminUser struct {
	User
	PersonName    sql.NullString
	HasWCAAccount bool
	RequestCount  int
}

func (u AdminUser) DisplayName() string {
	if u.PersonName.Valid && u.PersonName.String != "" {
		return u.PersonName.String
	}
	if n := strings.TrimSpace(u.FirstName + " " + u.LastName); n != "" {
		return n
	}
	return u.Username
}

type UserFilter struct {
	Query  string
	Region string // "", region ID, or "none"
	Staff  bool
	Limit  int
	Offset int
}

func (f UserFilter) where() (string, []any) {
	var clauses []string
	var args []any
	switch f.Region {
	case "":
	case "none":
		clauses = append(clauses, "(u.region IS NULL OR u.region = '')")
	default:
		clauses = append(clauses, "u.region = ?")
		args = append(args, f.Region)
	}
	if f.Staff {
		clauses = append(clauses, "u.is_staff = 1")
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

func ListAdminUsers(ctx context.Context, q db.Execer, f UserFilter) ([]AdminUser, int, error) {
	where, args := f.where()
	from := ` FROM api_user u LEFT JOIN wca_person p ON p.id = u.wca_id`
	var total int
	if err := q.QueryRowContext(ctx, `SELECT COUNT(*)`+from+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := q.QueryContext(ctx, `SELECT `+userColumns+`, p.name,
		EXISTS (SELECT 1 FROM socialaccount_socialaccount s WHERE s.user_id = u.id AND s.provider = '`+WCAProvider+`'),
		(SELECT COUNT(*) FROM api_regionupdaterequest r WHERE r.user_id = u.id)`+from+where+
		` ORDER BY COALESCE(u.wca_id, u.username) LIMIT ? OFFSET ?`, append(args, f.Limit, f.Offset)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var out []AdminUser
	for rows.Next() {
		var u AdminUser
		if err := rows.Scan(&u.ID, &u.Password, &u.Username, &u.FirstName, &u.LastName, &u.Email, &u.IsStaff,
			&u.IsSuperuser, &u.IsActive, &u.WCAID, &u.Region, &u.RegionUpdatedAt, &u.CreatedAt, &u.DateJoined,
			&u.LastLogin, &u.PersonName, &u.HasWCAAccount, &u.RequestCount); err != nil {
			return nil, 0, err
		}
		out = append(out, u)
	}
	return out, total, rows.Err()
}

func AdminUserByID(ctx context.Context, q db.Execer, id int64) (*AdminUser, error) {
	users, _, err := listOne(ctx, q, id)
	if err != nil {
		return nil, err
	}
	if len(users) == 0 {
		return nil, ErrNotFound
	}
	return &users[0], nil
}

func listOne(ctx context.Context, q db.Execer, id int64) ([]AdminUser, int, error) {
	rows, err := q.QueryContext(ctx, `SELECT `+userColumns+`, p.name,
		EXISTS (SELECT 1 FROM socialaccount_socialaccount s WHERE s.user_id = u.id AND s.provider = '`+WCAProvider+`'),
		(SELECT COUNT(*) FROM api_regionupdaterequest r WHERE r.user_id = u.id)
		FROM api_user u LEFT JOIN wca_person p ON p.id = u.wca_id WHERE u.id = ?`, id)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var out []AdminUser
	for rows.Next() {
		var u AdminUser
		if err := rows.Scan(&u.ID, &u.Password, &u.Username, &u.FirstName, &u.LastName, &u.Email, &u.IsStaff,
			&u.IsSuperuser, &u.IsActive, &u.WCAID, &u.Region, &u.RegionUpdatedAt, &u.CreatedAt, &u.DateJoined,
			&u.LastLogin, &u.PersonName, &u.HasWCAAccount, &u.RequestCount); err != nil {
			return nil, 0, err
		}
		out = append(out, u)
	}
	return out, len(out), rows.Err()
}

func CountUsersByRegion(ctx context.Context, q db.Execer) (map[string]int, int, error) {
	rows, err := q.QueryContext(ctx, `SELECT COALESCE(region, ''), COUNT(*) FROM api_user GROUP BY 1`)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := map[string]int{}
	total := 0
	for rows.Next() {
		var r string
		var n int
		if err := rows.Scan(&r, &n); err != nil {
			return nil, 0, err
		}
		out[r] = n
		total += n
	}
	return out, total, rows.Err()
}

func PersonName(ctx context.Context, q db.Execer, wcaID string) (string, bool, error) {
	var name sql.NullString
	err := q.QueryRowContext(ctx, `SELECT name FROM wca_person WHERE id = ? ORDER BY subid DESC LIMIT 1`, wcaID).Scan(&name)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return name.String, true, nil
}

func UserIDByWCAID(ctx context.Context, q db.Execer, wcaID string) (int64, bool, error) {
	var id int64
	err := q.QueryRowContext(ctx, `SELECT id FROM api_user WHERE wca_id = ? ORDER BY id LIMIT 1`, wcaID).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, false, nil
	}
	return id, err == nil, err
}

func SetPassword(ctx context.Context, q db.Execer, userID int64, hash string) error {
	_, err := q.ExecContext(ctx, `UPDATE api_user SET password = ?, updated_at = ? WHERE id = ?`,
		hash, timefmt.FormatDB(timefmt.Now()), userID)
	return err
}

func SetStaff(ctx context.Context, q db.Execer, userID int64, staff, superuser bool) error {
	_, err := q.ExecContext(ctx, `UPDATE api_user SET is_staff = ?, is_superuser = ?, updated_at = ? WHERE id = ?`,
		staff, superuser, timefmt.FormatDB(timefmt.Now()), userID)
	return err
}

func CountStaff(ctx context.Context, q db.Execer) (int, error) {
	var n int
	err := q.QueryRowContext(ctx, `SELECT COUNT(*) FROM api_user WHERE is_staff = 1 AND is_active = 1`).Scan(&n)
	return n, err
}

// Admin sessions.

type Session struct {
	UserID    int64
	CSRFToken string
	ExpiresAt time.Time
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func CreateSession(ctx context.Context, q db.Execer, userID int64, ttl time.Duration) (token string, s Session, err error) {
	token = randomHex(32)
	now := timefmt.Now()
	s = Session{UserID: userID, CSRFToken: randomHex(32), ExpiresAt: now.Add(ttl)}
	_, err = q.ExecContext(ctx, `INSERT INTO pca_admin_session (token_hash, user_id, csrf_token, created_at, expires_at)
		VALUES (?, ?, ?, ?, ?)`, hashToken(token), userID, s.CSRFToken, timefmt.FormatDB(now), timefmt.FormatDB(s.ExpiresAt))
	if err != nil {
		return "", Session{}, err
	}
	_, _ = q.ExecContext(ctx, `DELETE FROM pca_admin_session WHERE expires_at < ?`, timefmt.FormatDB(now))
	return token, s, nil
}

func SessionByToken(ctx context.Context, q db.Execer, token string) (*Session, error) {
	var s Session
	var expires db.Time
	err := q.QueryRowContext(ctx, `SELECT user_id, csrf_token, expires_at FROM pca_admin_session WHERE token_hash = ?`,
		hashToken(token)).Scan(&s.UserID, &s.CSRFToken, &expires)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	s.ExpiresAt = expires.Time
	if time.Now().After(s.ExpiresAt) {
		return nil, ErrNotFound
	}
	return &s, nil
}

func DeleteSession(ctx context.Context, q db.Execer, token string) error {
	_, err := q.ExecContext(ctx, `DELETE FROM pca_admin_session WHERE token_hash = ?`, hashToken(token))
	return err
}
