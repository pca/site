package admin

import (
	"compress/gzip"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/pca/backend/internal/timefmt"
)

// Backups are gzipped, compacted copies of the database in DATA_DIR/backups.
// Only the newest BACKUP_KEEP are kept so they cannot fill the volume.

var backupName = regexp.MustCompile(`^pca-\d{8}-\d{6}\.sqlite3\.gz$`)

type backupJSON struct {
	Name      string    `json:"name"`
	SizeBytes int64     `json:"size_bytes"`
	CreatedAt time.Time `json:"created_at"`
}

func (a *Admin) backupDir() string { return filepath.Join(a.cfg.DataDir, "backups") }

func (a *Admin) listBackups() ([]backupJSON, error) {
	entries, err := os.ReadDir(a.backupDir())
	if errors.Is(err, os.ErrNotExist) {
		return []backupJSON{}, nil
	}
	if err != nil {
		return nil, err
	}
	out := []backupJSON{}
	for _, e := range entries {
		if e.IsDir() || !backupName.MatchString(e.Name()) {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		out = append(out, backupJSON{Name: e.Name(), SizeBytes: info.Size(), CreatedAt: info.ModTime().UTC()})
	}
	// Names embed the timestamp, so they sort chronologically.
	slices.SortFunc(out, func(x, y backupJSON) int { return strings.Compare(y.Name, x.Name) })
	return out, nil
}

func (a *Admin) getBackups(w http.ResponseWriter, r *http.Request) {
	list, err := a.listBackups()
	if err != nil {
		a.serverError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": list, "keep": a.cfg.BackupKeep})
}

func (a *Admin) createBackup(w http.ResponseWriter, r *http.Request) {
	if !a.backupMu.TryLock() {
		writeError(w, http.StatusConflict, "A backup is already being created.")
		return
	}
	defer a.backupMu.Unlock()
	start := time.Now()
	b, err := a.writeBackup(r)
	if err != nil {
		a.serverError(w, r, err)
		return
	}
	removed, err := a.pruneBackups()
	if err != nil {
		a.log.Warn("prune backups", "err", err)
	}
	a.log.Info("database backup created", "name", b.Name, "bytes", b.SizeBytes, "by", current(r).user.Username,
		"took", time.Since(start).Round(time.Millisecond))
	msg := fmt.Sprintf("Backup %s created (%.1f MB).", b.Name, float64(b.SizeBytes)/(1<<20))
	if removed > 0 {
		msg += fmt.Sprintf(" Removed %d older %s.", removed, plural(removed, "backup"))
	}
	writeJSON(w, http.StatusCreated, map[string]any{"message": msg, "backup": b})
}

// writeBackup copies the live database with VACUUM INTO, which reads one
// consistent snapshot while the API and worker keep running, then gzips it.
func (a *Admin) writeBackup(r *http.Request) (*backupJSON, error) {
	dir := a.backupDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	name := "pca-" + time.Now().In(timefmt.Manila).Format("20060102-150405") + ".sqlite3.gz"
	raw := filepath.Join(dir, ".tmp-"+strings.TrimSuffix(name, ".gz"))
	part := filepath.Join(dir, ".tmp-"+name)
	defer os.Remove(raw)
	defer os.Remove(part)

	// The read pool is query_only, which rejects VACUUM INTO.
	if _, err := a.db.Write.ExecContext(r.Context(), `VACUUM INTO ?`, raw); err != nil {
		return nil, fmt.Errorf("copy database: %w", err)
	}
	src, err := os.Open(raw)
	if err != nil {
		return nil, err
	}
	defer src.Close()
	dst, err := os.Create(part)
	if err != nil {
		return nil, err
	}
	gz, _ := gzip.NewWriterLevel(dst, gzip.DefaultCompression)
	gz.Name = strings.TrimSuffix(name, ".gz")
	_, err = io.Copy(gz, src)
	if err == nil {
		err = gz.Close()
	}
	if err == nil {
		err = dst.Sync()
	}
	if cerr := dst.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		return nil, fmt.Errorf("compress backup: %w", err)
	}
	final := filepath.Join(dir, name)
	if err := os.Rename(part, final); err != nil {
		return nil, err
	}
	info, err := os.Stat(final)
	if err != nil {
		return nil, err
	}
	return &backupJSON{Name: name, SizeBytes: info.Size(), CreatedAt: info.ModTime().UTC()}, nil
}

func (a *Admin) pruneBackups() (int, error) {
	list, err := a.listBackups()
	if err != nil || len(list) <= a.cfg.BackupKeep {
		return 0, err
	}
	removed := 0
	for _, b := range list[a.cfg.BackupKeep:] {
		if err := os.Remove(filepath.Join(a.backupDir(), b.Name)); err != nil {
			return removed, err
		}
		removed++
	}
	return removed, nil
}

func (a *Admin) backupPath(w http.ResponseWriter, r *http.Request) (string, bool) {
	name := r.PathValue("name")
	if !backupName.MatchString(name) {
		writeError(w, http.StatusNotFound, "Backup not found.")
		return "", false
	}
	path := filepath.Join(a.backupDir(), name)
	if _, err := os.Stat(path); err != nil {
		writeError(w, http.StatusNotFound, "Backup not found.")
		return "", false
	}
	return path, true
}

func (a *Admin) downloadBackup(w http.ResponseWriter, r *http.Request) {
	path, ok := a.backupPath(w, r)
	if !ok {
		return
	}
	f, err := os.Open(path)
	if err != nil {
		a.serverError(w, r, err)
		return
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		a.serverError(w, r, err)
		return
	}
	h := w.Header()
	h.Set("Content-Type", "application/gzip")
	h.Set("Content-Disposition", `attachment; filename="`+info.Name()+`"`)
	h.Set("Cache-Control", "no-store")
	http.ServeContent(w, r, info.Name(), info.ModTime(), f)
}

func (a *Admin) deleteBackup(w http.ResponseWriter, r *http.Request) {
	path, ok := a.backupPath(w, r)
	if !ok {
		return
	}
	if err := os.Remove(path); err != nil {
		a.serverError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": "Backup " + filepath.Base(path) + " deleted."})
}
