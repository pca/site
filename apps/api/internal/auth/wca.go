package auth

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/pca/backend/internal/db"
	"github.com/pca/backend/internal/store"
)

var (
	ErrNotConfigured = errors.New("WCA login is not configured")
	ErrExchange      = errors.New("Failed to exchange code for access token")
	ErrProfile       = errors.New("Incorrect value")
)

type WCA struct {
	BaseURL      string
	ClientID     string
	ClientSecret string
	HTTP         *http.Client
}

func NewWCA(baseURL, clientID, clientSecret string) *WCA {
	return &WCA{
		BaseURL:      strings.TrimRight(baseURL, "/"),
		ClientID:     clientID,
		ClientSecret: clientSecret,
		HTTP:         &http.Client{Timeout: 20 * time.Second},
	}
}

// credentials falls back to the allauth SocialApp row when no environment
// credentials are configured.
func (w *WCA) credentials(ctx context.Context, q db.Execer) (string, string, error) {
	if w.ClientID != "" && w.ClientSecret != "" {
		return w.ClientID, w.ClientSecret, nil
	}
	var id, secret string
	err := q.QueryRowContext(ctx, `SELECT client_id, secret FROM socialaccount_socialapp
		WHERE provider = ? ORDER BY id LIMIT 1`, store.WCAProvider).Scan(&id, &secret)
	if errors.Is(err, sql.ErrNoRows) || id == "" {
		return "", "", ErrNotConfigured
	}
	return id, secret, err
}

func (w *WCA) exchange(ctx context.Context, clientID, secret, code, redirectURI string) (string, error) {
	form := url.Values{
		"redirect_uri":  {redirectURI},
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"client_id":     {clientID},
		"client_secret": {secret},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, w.BaseURL+"/oauth/token/", strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	resp, err := w.HTTP.Do(req)
	if err != nil {
		return "", ErrExchange
	}
	defer resp.Body.Close()
	var body struct {
		AccessToken string `json:"access_token"`
	}
	if resp.StatusCode != http.StatusOK || json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&body) != nil || body.AccessToken == "" {
		return "", ErrExchange
	}
	return body.AccessToken, nil
}

type Profile struct {
	UID   string
	WCAID string
	Name  string
	Raw   []byte
}

func (w *WCA) me(ctx context.Context, token string) (*Profile, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, w.BaseURL+"/api/v0/me", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := w.HTTP.Do(req)
	if err != nil {
		return nil, ErrProfile
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, ErrProfile
	}
	var body struct {
		Me json.RawMessage `json:"me"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&body); err != nil || len(body.Me) == 0 {
		return nil, ErrProfile
	}
	dec := json.NewDecoder(bytes.NewReader(body.Me))
	dec.UseNumber()
	var me struct {
		ID    json.RawMessage `json:"id"`
		WCAID *string         `json:"wca_id"`
		Name  *string         `json:"name"`
	}
	if err := dec.Decode(&me); err != nil || len(me.ID) == 0 || string(me.ID) == "null" {
		return nil, ErrProfile
	}
	p := &Profile{Raw: body.Me, UID: strings.Trim(string(me.ID), `"`)}
	if me.WCAID != nil {
		p.WCAID = *me.WCAID
	}
	if me.Name != nil {
		p.Name = *me.Name
	}
	return p, nil
}

// Login exchanges an authorization code and returns the user's API token.
func (w *WCA) Login(ctx context.Context, d *db.DB, code, redirectURI string) (string, error) {
	clientID, secret, err := w.credentials(ctx, d.Read)
	if err != nil {
		return "", err
	}
	token, err := w.exchange(ctx, clientID, secret, code, redirectURI)
	if err != nil {
		return "", err
	}
	profile, err := w.me(ctx, token)
	if err != nil {
		return "", err
	}

	var key string
	err = d.Tx(ctx, func(tx *sql.Tx) error {
		userID, err := upsertWCAUser(ctx, tx, profile)
		if err != nil {
			return err
		}
		if err := store.TouchLastLogin(ctx, tx, userID); err != nil {
			return err
		}
		key, err = store.GetOrCreateToken(ctx, tx, userID)
		return err
	})
	return key, err
}

func upsertWCAUser(ctx context.Context, tx *sql.Tx, p *Profile) (int64, error) {
	extra := string(p.Raw)
	account, err := store.SocialAccountByUID(ctx, tx, p.UID)
	if err == nil {
		if err := store.UpdateSocialAccountLogin(ctx, tx, account.ID, extra); err != nil {
			return 0, err
		}
		if p.WCAID != "" {
			// Users who logged in before receiving a WCA ID get it on a later login.
			if _, err := tx.ExecContext(ctx, `UPDATE api_user SET wca_id = ? WHERE id = ? AND (wca_id IS NULL OR wca_id = '')`,
				p.WCAID, account.UserID); err != nil {
				return 0, err
			}
		}
		return account.UserID, nil
	}
	if !errors.Is(err, store.ErrNotFound) {
		return 0, err
	}

	first, _, _ := strings.Cut(p.Name, " ")
	last := ""
	if i := strings.IndexByte(p.Name, ' '); i >= 0 {
		last = p.Name[i+1:]
	}

	if p.WCAID != "" {
		mapped, err := store.MappingUserByWCAID(ctx, tx, p.WCAID)
		if err == nil {
			if _, err := tx.ExecContext(ctx, `UPDATE api_user SET first_name = CASE WHEN first_name = '' THEN ? ELSE first_name END,
				last_name = CASE WHEN last_name = '' THEN ? ELSE last_name END WHERE id = ?`, first, last, mapped.ID); err != nil {
				return 0, err
			}
			return mapped.ID, store.CreateSocialAccount(ctx, tx, mapped.ID, p.UID, extra)
		}
		if !errors.Is(err, store.ErrNotFound) {
			return 0, err
		}
	}

	username, err := store.UniqueUsername(ctx, tx, first, last, "user")
	if err != nil {
		return 0, err
	}
	nu := store.NewUser{Username: username, FirstName: truncate(first, 150), LastName: truncate(last, 150)}
	if p.WCAID != "" {
		nu.WCAID = &p.WCAID
	}
	userID, err := store.CreateUser(ctx, tx, nu)
	if err != nil {
		return 0, fmt.Errorf("create user: %w", err)
	}
	return userID, store.CreateSocialAccount(ctx, tx, userID, p.UID, extra)
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n])
	}
	return s
}
