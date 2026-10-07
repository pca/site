// Package store contains SQL access for users, tokens and region requests.
package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"regexp"
	"strconv"
	"strings"
	"unicode"

	"github.com/pca/backend/internal/db"
	"github.com/pca/backend/internal/timefmt"
	"golang.org/x/text/unicode/norm"
)

const WCAProvider = "worldcubeassociation"

var ErrNotFound = errors.New("not found")

type User struct {
	ID              int64
	Password        string
	Username        string
	FirstName       string
	LastName        string
	Email           string
	IsStaff         bool
	IsSuperuser     bool
	IsActive        bool
	WCAID           sql.NullString
	Region          sql.NullString
	RegionUpdatedAt db.Time
	CreatedAt       db.Time
	DateJoined      db.Time
	LastLogin       db.Time
}

const userColumns = `u.id, u.password, u.username, u.first_name, u.last_name, u.email, u.is_staff,
	u.is_superuser, u.is_active, u.wca_id, u.region, u.region_updated_at, u.created_at, u.date_joined, u.last_login`

func scanUser(row interface{ Scan(...any) error }) (*User, error) {
	var u User
	err := row.Scan(&u.ID, &u.Password, &u.Username, &u.FirstName, &u.LastName, &u.Email, &u.IsStaff,
		&u.IsSuperuser, &u.IsActive, &u.WCAID, &u.Region, &u.RegionUpdatedAt, &u.CreatedAt, &u.DateJoined, &u.LastLogin)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func UserByID(ctx context.Context, q db.Execer, id int64) (*User, error) {
	return scanUser(q.QueryRowContext(ctx, `SELECT `+userColumns+` FROM api_user u WHERE u.id = ?`, id))
}

func UserByUsername(ctx context.Context, q db.Execer, username string) (*User, error) {
	return scanUser(q.QueryRowContext(ctx, `SELECT `+userColumns+` FROM api_user u WHERE u.username = ?`, username))
}

// UserByToken resolves an API auth token.
func UserByToken(ctx context.Context, q db.Execer, key string) (*User, error) {
	return scanUser(q.QueryRowContext(ctx, `SELECT `+userColumns+`
		FROM authtoken_token t JOIN api_user u ON u.id = t.user_id WHERE t.key = ?`, key))
}

func randomHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

// GetOrCreateToken returns the user's API token, creating it if needed.
func GetOrCreateToken(ctx context.Context, q db.Execer, userID int64) (string, error) {
	var key string
	err := q.QueryRowContext(ctx, `SELECT key FROM authtoken_token WHERE user_id = ?`, userID).Scan(&key)
	if err == nil {
		return key, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}
	key = randomHex(20)
	_, err = q.ExecContext(ctx, `INSERT INTO authtoken_token (key, created, user_id) VALUES (?, ?, ?)`,
		key, timefmt.FormatDB(timefmt.Now()), userID)
	return key, err
}

func DeleteToken(ctx context.Context, q db.Execer, userID int64) error {
	_, err := q.ExecContext(ctx, `DELETE FROM authtoken_token WHERE user_id = ?`, userID)
	return err
}

// UnusablePassword returns a hash that never matches a password ("!" prefix).
func UnusablePassword() string {
	const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, 40)
	rand.Read(b)
	for i := range b {
		b[i] = chars[int(b[i])%len(chars)]
	}
	return "!" + string(b)
}

type NewUser struct {
	Username  string
	FirstName string
	LastName  string
	Email     string
	WCAID     *string
	Region    *string
	Password  string
	IsStaff   bool
	IsSuper   bool
}

func CreateUser(ctx context.Context, q db.Execer, nu NewUser) (int64, error) {
	now := timefmt.FormatDB(timefmt.Now())
	password := nu.Password
	if password == "" {
		password = UnusablePassword()
	}
	var regionUpdated any
	if nu.Region != nil {
		regionUpdated = now
	}
	res, err := q.ExecContext(ctx, `INSERT INTO api_user (password, last_login, is_superuser, username,
		first_name, last_name, email, is_staff, is_active, date_joined, wca_id, region_updated_at,
		created_at, updated_at, region) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
		password, nu.IsSuper, nu.Username, nu.FirstName, nu.LastName, nu.Email, nu.IsStaff, now,
		db.NullString(nu.WCAID), regionUpdated, now, now, db.NullString(nu.Region))
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

var usernameStrip = regexp.MustCompile(`[^\w\s@+.-]`)

// UniqueUsername approximates allauth's generate_unique_username.
func UniqueUsername(ctx context.Context, q db.Execer, candidates ...string) (string, error) {
	base := ""
	for _, c := range candidates {
		c = norm.NFKD.String(c)
		c = strings.Map(func(r rune) rune {
			if r > unicode.MaxASCII {
				return -1
			}
			return r
		}, c)
		c = usernameStrip.ReplaceAllString(c, "")
		c = strings.Join(strings.Fields(c), "_")
		c = strings.ToLower(c)
		if c != "" {
			base = c
			break
		}
	}
	if base == "" {
		base = "user"
	}
	if len(base) > 30 {
		base = base[:30]
	}
	for i := 0; i < 10000; i++ {
		name := base
		if i > 0 {
			name = base + strconv.Itoa(i)
		}
		var exists int
		err := q.QueryRowContext(ctx, `SELECT 1 FROM api_user WHERE username = ?`, name).Scan(&exists)
		if errors.Is(err, sql.ErrNoRows) {
			return name, nil
		}
		if err != nil {
			return "", err
		}
	}
	return base + randomHex(4), nil
}

// SocialAccount is an allauth WCA account row.
type SocialAccount struct {
	ID        int64
	UserID    int64
	UID       string
	ExtraData string
}

func SocialAccountByUID(ctx context.Context, q db.Execer, uid string) (*SocialAccount, error) {
	var a SocialAccount
	err := q.QueryRowContext(ctx, `SELECT id, user_id, uid, extra_data FROM socialaccount_socialaccount
		WHERE provider = ? AND uid = ?`, WCAProvider, uid).Scan(&a.ID, &a.UserID, &a.UID, &a.ExtraData)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// MappingUserByWCAID finds the oldest user with this WCA ID that has no WCA
// social account yet (accounts imported from region mappings).
func MappingUserByWCAID(ctx context.Context, q db.Execer, wcaID string) (*User, error) {
	return scanUser(q.QueryRowContext(ctx, `SELECT `+userColumns+` FROM api_user u
		WHERE u.wca_id = ? AND NOT EXISTS (
			SELECT 1 FROM socialaccount_socialaccount s WHERE s.user_id = u.id AND s.provider = ?)
		ORDER BY u.id LIMIT 1`, wcaID, WCAProvider))
}

func CreateSocialAccount(ctx context.Context, q db.Execer, userID int64, uid, extra string) error {
	now := timefmt.FormatDB(timefmt.Now())
	_, err := q.ExecContext(ctx, `INSERT INTO socialaccount_socialaccount (provider, uid, last_login,
		date_joined, user_id, extra_data) VALUES (?, ?, ?, ?, ?, ?)`, WCAProvider, uid, now, now, userID, extra)
	return err
}

func UpdateSocialAccountLogin(ctx context.Context, q db.Execer, id int64, extra string) error {
	_, err := q.ExecContext(ctx, `UPDATE socialaccount_socialaccount SET extra_data = ?, last_login = ? WHERE id = ?`,
		extra, timefmt.FormatDB(timefmt.Now()), id)
	return err
}

func TouchLastLogin(ctx context.Context, q db.Execer, userID int64) error {
	_, err := q.ExecContext(ctx, `UPDATE api_user SET last_login = ? WHERE id = ?`, timefmt.FormatDB(timefmt.Now()), userID)
	return err
}

// AvatarJSON returns the WCA avatar object stored for the first user with
// this WCA ID, or nil.
func AvatarJSON(ctx context.Context, q db.Execer, wcaID string) ([]byte, error) {
	var avatar sql.NullString
	err := q.QueryRowContext(ctx, `SELECT json_extract(s.extra_data, '$.avatar')
		FROM api_user u JOIN socialaccount_socialaccount s ON s.user_id = u.id AND s.provider = ?
		WHERE u.wca_id = ? AND json_valid(s.extra_data) ORDER BY u.id, s.id LIMIT 1`, WCAProvider, wcaID).Scan(&avatar)
	if errors.Is(err, sql.ErrNoRows) || !avatar.Valid {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	// json_extract returns objects as JSON text and scalars unquoted.
	s := strings.TrimSpace(avatar.String)
	if strings.HasPrefix(s, "{") || strings.HasPrefix(s, "[") {
		return []byte(s), nil
	}
	return nil, nil
}

// SetUserRegion updates a user's home region and its timestamp.
func SetUserRegion(ctx context.Context, q db.Execer, userID int64, region *string) error {
	now := timefmt.FormatDB(timefmt.Now())
	var regionUpdated any
	if region != nil {
		regionUpdated = now
	}
	_, err := q.ExecContext(ctx, `UPDATE api_user SET region = ?, region_updated_at = COALESCE(?, region_updated_at),
		updated_at = ? WHERE id = ?`, db.NullString(region), regionUpdated, now, userID)
	return err
}
