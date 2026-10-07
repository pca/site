package worker

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/pca/backend/internal/db"
	"github.com/pca/backend/internal/geo"
	"github.com/pca/backend/internal/jobs"
	"github.com/pca/backend/internal/statsbuild"
	"github.com/pca/backend/internal/timefmt"
	"github.com/pca/backend/internal/wcaimport"
)

// exportInfo is the WCA public export API response.
type exportInfo struct {
	ExportDate       string          `json:"export_date"`
	ExportVersion    string          `json:"export_version"`
	TSVURL           string          `json:"tsv_url"`
	TSVFilesizeBytes json.RawMessage `json:"tsv_filesize_bytes"`
}

// normalizedTimestamp parses WCA export dates such as "2026-10-06 19:33:30 UTC"
// and "2026-10-06T19:33:30Z".
func normalizedTimestamp(v string) (time.Time, error) {
	v = strings.TrimSpace(strings.Replace(v, " UTC", "+00:00", 1))
	if strings.HasSuffix(v, "Z") {
		v = strings.TrimSuffix(v, "Z") + "+00:00"
	}
	for _, layout := range []string{"2006-01-02T15:04:05.999999999-07:00", "2006-01-02 15:04:05.999999999-07:00"} {
		if t, err := time.Parse(layout, v); err == nil {
			return t.UTC(), nil
		}
	}
	for _, layout := range []string{"2006-01-02T15:04:05.999999999", "2006-01-02 15:04:05.999999999", "2006-01-02"} {
		if t, err := time.ParseInLocation(layout, v, time.UTC); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("invalid timestamp %q", v)
}

func sameExport(info exportInfo, state *jobs.ImportState) bool {
	a, err1 := normalizedTimestamp(info.ExportDate)
	b, err2 := normalizedTimestamp(state.ExportDate)
	if err1 != nil || err2 != nil {
		return false
	}
	return a.Equal(b) && strings.TrimPrefix(info.ExportVersion, "v") == strings.TrimPrefix(state.ExportFormatVersion, "v")
}

func (w *Worker) fetchExportInfo(ctx context.Context) (exportInfo, error) {
	var info exportInfo
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, w.cfg.WCAExportAPIURL, nil)
	resp, err := w.http.Do(req)
	if err != nil {
		return info, fmt.Errorf("Unable to read the WCA export API: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return info, fmt.Errorf("Unable to read the WCA export API: HTTP %d", resp.StatusCode)
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return info, fmt.Errorf("Unable to read the WCA export API: %w", err)
	}
	return info, nil
}

func validateExportInfo(info exportInfo) (int64, error) {
	var missing []string
	size := strings.Trim(string(info.TSVFilesizeBytes), `"`)
	for _, f := range [][2]string{{"export_date", info.ExportDate}, {"export_version", info.ExportVersion},
		{"tsv_url", info.TSVURL}, {"tsv_filesize_bytes", size}} {
		if f[1] == "" || f[1] == "null" || f[1] == "0" {
			missing = append(missing, f[0])
		}
	}
	if len(missing) > 0 {
		return 0, fmt.Errorf("WCA export API is missing: %s", strings.Join(missing, ", "))
	}
	if major, _, _ := strings.Cut(strings.TrimPrefix(info.ExportVersion, "v"), "."); major != wcaimport.SupportedMajor {
		return 0, fmt.Errorf("Unsupported WCA export format %s. Review the importer before syncing.", info.ExportVersion)
	}
	n, err := strconv.ParseInt(size, 10, 64)
	if err != nil || n <= 0 {
		return 0, errors.New("WCA export API returned an invalid TSV file size.")
	}
	return n, nil
}

func (w *Worker) download(ctx context.Context, url, dest string, expected int64, logf func(string, ...any)) (string, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	client := *w.http
	client.Timeout = 0
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("Unable to download the WCA TSV export: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("Unable to download the WCA TSV export: HTTP %d", resp.StatusCode)
	}
	f, err := os.Create(dest)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	start := time.Now()
	n, err := io.Copy(io.MultiWriter(f, h), &stallReader{r: resp.Body, ctx: ctx})
	if err != nil {
		return "", fmt.Errorf("Unable to download the WCA TSV export: %w", err)
	}
	if n != expected {
		return "", fmt.Errorf("WCA TSV download size mismatch: expected %d, received %d bytes.", expected, n)
	}
	if err := f.Sync(); err != nil {
		return "", err
	}
	logf("Downloaded %.1f MB in %s.", float64(n)/(1<<20), time.Since(start).Round(time.Second))
	return hex.EncodeToString(h.Sum(nil)), nil
}

// stallReader aborts a download when ctx is cancelled.
type stallReader struct {
	r   io.Reader
	ctx context.Context
}

func (s *stallReader) Read(p []byte) (int, error) {
	if err := s.ctx.Err(); err != nil {
		return 0, err
	}
	return s.r.Read(p)
}

// partialArchive is where a sync downloads the export. It is deleted after
// the import, and on worker start in case a download was interrupted.
func (w *Worker) partialArchive() string {
	return filepath.Join(w.cfg.DataDir, "WCA_export_v2.tsv.zip.part")
}

// Sync downloads and imports a new WCA export when one is available, then
// refreshes competition regions and statistics.
func (w *Worker) Sync(ctx context.Context, force bool, logf func(string, ...any)) (string, error) {
	info, err := w.fetchExportInfo(ctx)
	if err != nil {
		return "", err
	}
	logf("WCA export available: %s (%s).", info.ExportDate, info.ExportVersion)
	state, err := jobs.ReadImportState(ctx, w.db.Read)
	if err != nil {
		return "", err
	}
	if !force && state != nil && sameExport(info, state) {
		logf("WCA data is current; refreshing regional classification and statistics.")
		if err := w.refresh(ctx, logf); err != nil {
			return "", err
		}
		return jobs.StatusSkipped, nil
	}
	size, err := validateExportInfo(info)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(w.cfg.DataDir, 0o755); err != nil {
		return "", err
	}
	archive := w.partialArchive()
	defer os.Remove(archive)
	logf("Downloading %s (%.1f MB).", info.TSVURL, float64(size)/(1<<20))
	checksum, err := w.download(ctx, info.TSVURL, archive, size, logf)
	if err != nil {
		return "", err
	}
	if err := w.importArchive(ctx, archive, checksum, size, "sync", &info, logf); err != nil {
		return "", err
	}
	if err := w.refresh(ctx, logf); err != nil {
		return "", err
	}
	logf("WCA import, regional classification, and statistics refresh completed.")
	return jobs.StatusSucceeded, nil
}

// ImportArchive imports a local export archive, then refreshes statistics.
func (w *Worker) ImportArchive(ctx context.Context, path string, logf func(string, ...any)) error {
	checksum, size, err := fileSHA256(path)
	if err != nil {
		return err
	}
	if err := w.importArchive(ctx, path, checksum, size, "archive:"+filepath.Base(path), nil, logf); err != nil {
		return err
	}
	return w.refresh(ctx, logf)
}

func fileSHA256(path string) (string, int64, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", 0, err
	}
	defer f.Close()
	h := sha256.New()
	n, err := io.Copy(h, f)
	if err != nil {
		return "", 0, err
	}
	return hex.EncodeToString(h.Sum(nil)), n, nil
}

func (w *Worker) importArchive(ctx context.Context, path, checksum string, size int64, source string, info *exportInfo,
	logf func(string, ...any)) error {
	zr, err := zip.OpenReader(path)
	if err != nil {
		return fmt.Errorf("open archive: %w", err)
	}
	defer zr.Close()
	for _, f := range zr.File {
		if strings.Contains(f.Name, "..") || filepath.IsAbs(f.Name) {
			return fmt.Errorf("WCA archive contains an unsafe path: %s", f.Name)
		}
	}
	meta, err := wcaimport.ReadMetadata(&zr.Reader)
	if err != nil {
		return err
	}
	if info != nil {
		a, err1 := normalizedTimestamp(meta.ExportDate)
		b, err2 := normalizedTimestamp(info.ExportDate)
		if err := errors.Join(err1, err2); err != nil {
			return fmt.Errorf("Invalid WCA archive metadata: %w", err)
		}
		if !a.Equal(b) || meta.Version() != strings.TrimPrefix(info.ExportVersion, "v") {
			return errors.New("Downloaded WCA archive does not match the export API.")
		}
	}
	data, err := wcaimport.Parse(ctx, &zr.Reader, logf)
	if err != nil {
		return err
	}
	start := time.Now()
	err = w.db.Tx(ctx, func(tx *sql.Tx) error {
		if err := data.Apply(ctx, tx); err != nil {
			return err
		}
		if err := jobs.WriteImportState(ctx, tx, jobs.ImportState{ExportDate: meta.ExportDate,
			ExportFormatVersion: meta.ExportFormatVersion, ArchiveSHA256: checksum, ArchiveBytes: size,
			ImportedAt: time.Now().UTC(), Source: source}); err != nil {
			return err
		}
		return db.BumpGeneration(ctx, tx)
	})
	if err != nil {
		return fmt.Errorf("write WCA data: %w", err)
	}
	logf("Wrote WCA data in %s.", time.Since(start).Round(time.Millisecond))
	return nil
}

// refresh reclassifies competitions and rebuilds statistics.
func (w *Worker) refresh(ctx context.Context, logf func(string, ...any)) error {
	if err := w.AssignRegions(ctx, logf); err != nil {
		return err
	}
	return w.Statistics(ctx, logf)
}

func (w *Worker) AssignRegions(ctx context.Context, logf func(string, ...any)) error {
	start := time.Now()
	var res geo.AssignResult
	err := w.db.Tx(ctx, func(tx *sql.Tx) error {
		var err error
		res, err = w.boundary.Assign(ctx, tx)
		return err
	})
	if err != nil {
		return err
	}
	logf("Classified competitions with %s in %s: %s.", w.boundary.Metadata.Version,
		time.Since(start).Round(time.Millisecond), res)
	return nil
}

func (w *Worker) Statistics(ctx context.Context, logf func(string, ...any)) error {
	state, err := jobs.ReadImportState(ctx, w.db.Read)
	if err != nil {
		return err
	}
	if state == nil || len(state.ArchiveSHA256) != 64 {
		return errors.New("Imported WCA state has no valid archive checksum for statistics. " +
			"Run a WCA sync, or `worker seed-state` for a database built from a known export.")
	}
	start := time.Now()
	res, err := statsbuild.Build(ctx, w.db, statsbuild.Input{
		ExportVersion:   state.SnapshotVersion(),
		ExportChecksum:  strings.ToLower(state.ArchiveSHA256),
		BoundaryVersion: w.boundary.Metadata.Version,
		LatestYear:      timefmt.LocalYear(),
	}, logf)
	if err != nil {
		return fmt.Errorf("Statistics snapshot build failed: %w", err)
	}
	if res.Changed {
		logf("Built and activated statistics snapshot %d in %s (strength: %s; growth: %s).", res.SnapshotID,
			time.Since(start).Round(time.Millisecond), res.Strength, res.Growth)
	} else {
		logf("Statistics snapshot %d is already up to date.", res.SnapshotID)
	}
	return nil
}

// SeedState records which export the current database was built from, for
// databases created outside the worker.
func (w *Worker) SeedState(ctx context.Context, archive, manifest string) (*jobs.ImportState, error) {
	var state jobs.ImportState
	switch {
	case archive != "":
		zr, err := zip.OpenReader(archive)
		if err != nil {
			return nil, err
		}
		meta, err := wcaimport.ReadMetadata(&zr.Reader)
		zr.Close()
		if err != nil {
			return nil, err
		}
		sum, size, err := fileSHA256(archive)
		if err != nil {
			return nil, err
		}
		state = jobs.ImportState{ExportDate: meta.ExportDate, ExportFormatVersion: meta.ExportFormatVersion,
			ArchiveSHA256: sum, ArchiveBytes: size, Source: "seed:" + filepath.Base(archive)}
	case manifest != "":
		b, err := os.ReadFile(manifest)
		if err != nil {
			return nil, err
		}
		var m struct {
			ExportDate          string `json:"export_date"`
			ExportFormatVersion string `json:"export_format_version"`
			ArchiveSHA256       string `json:"archive_sha256"`
			ArchiveSizeBytes    int64  `json:"archive_size_bytes"`
		}
		if err := json.Unmarshal(b, &m); err != nil {
			return nil, err
		}
		t, err := normalizedTimestamp(m.ExportDate)
		if err != nil {
			return nil, err
		}
		state = jobs.ImportState{ExportDate: t.Format("2006-01-02 15:04:05") + " UTC",
			ExportFormatVersion: m.ExportFormatVersion, ArchiveSHA256: strings.ToLower(m.ArchiveSHA256),
			ArchiveBytes: m.ArchiveSizeBytes, Source: "seed:" + filepath.Base(manifest)}
	default:
		return nil, errors.New("pass --archive or --manifest")
	}
	if len(state.ArchiveSHA256) != 64 || state.ExportDate == "" {
		return nil, errors.New("the archive or manifest does not identify a WCA export")
	}
	state.ImportedAt = time.Now().UTC()
	if err := jobs.WriteImportState(ctx, w.db.Write, state); err != nil {
		return nil, err
	}
	return &state, nil
}
