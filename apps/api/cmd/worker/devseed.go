package main

import (
	"compress/gzip"
	"context"
	"database/sql"
	"fmt"
	"io"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

// unusedTables are present in the seed database but never read or written.
// Indexes are dropped as well; opening the database recreates the ones the
// services use.
var unusedTables = []string{
	"wca_scramble", "wca_competition_delegates", "wca_competition_events", "wca_competition_organizers",
	"account_emailaddress", "account_emailconfirmation", "admin_interface_theme",
	"auth_group_permissions", "auth_group", "auth_permission", "api_user_groups", "api_user_user_permissions",
	"socialaccount_socialtoken", "socialaccount_socialapp_sites",
	"django_admin_log", "django_content_type", "django_migrations", "django_session", "django_site",
}

// devSeed writes a gzipped copy of src without unused tables and indexes,
// small enough to commit for local development. src is only read.
func devSeed(ctx context.Context, src, out string) error {
	out, err := filepath.Abs(out)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(out), 0o755); err != nil {
		return err
	}
	tmp := out + ".tmp.sqlite3"
	os.Remove(tmp)
	defer os.Remove(tmp)

	abs, err := filepath.Abs(src)
	if err != nil {
		return err
	}
	in, err := sql.Open("sqlite", "file:"+filepath.ToSlash(abs)+"?mode=ro")
	if err != nil {
		return err
	}
	_, err = in.ExecContext(ctx, `VACUUM INTO ?`, tmp)
	in.Close()
	if err != nil {
		return fmt.Errorf("copy %s: %w", src, err)
	}

	d, err := sql.Open("sqlite", "file:"+filepath.ToSlash(tmp))
	if err != nil {
		return err
	}
	stmts := []string{}
	for _, t := range unusedTables {
		stmts = append(stmts, fmt.Sprintf(`DROP TABLE IF EXISTS "%s"`, t))
	}
	rows, err := d.QueryContext(ctx, `SELECT name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL`)
	if err != nil {
		d.Close()
		return err
	}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			rows.Close()
			d.Close()
			return err
		}
		stmts = append(stmts, fmt.Sprintf(`DROP INDEX IF EXISTS "%s"`, name))
	}
	rows.Close()
	stmts = append(stmts, `VACUUM`)
	for _, s := range stmts {
		if _, err := d.ExecContext(ctx, s); err != nil {
			d.Close()
			return fmt.Errorf("%s: %w", s, err)
		}
	}
	if err := d.Close(); err != nil {
		return err
	}
	return gzipFile(tmp, out)
}

func gzipFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	f, err := os.Create(dst + ".part")
	if err != nil {
		return err
	}
	zw, _ := gzip.NewWriterLevel(f, gzip.BestCompression)
	if _, err := io.Copy(zw, in); err != nil {
		f.Close()
		return err
	}
	if err := zw.Close(); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return os.Rename(dst+".part", dst)
}
