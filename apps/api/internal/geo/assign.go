package geo

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/pca/backend/internal/timefmt"
)

// AssignResult summarizes one classification run.
type AssignResult struct {
	Total, Changed int
	Statuses       map[string]int
}

func (r AssignResult) String() string {
	keys := make([]string, 0, len(r.Statuses))
	for k := range r.Statuses {
		keys = append(keys, k)
	}
	slices.Sort(keys)
	parts := make([]string, len(keys))
	for i, k := range keys {
		parts[i] = fmt.Sprintf("%s=%d", k, r.Statuses[k])
	}
	return fmt.Sprintf("%d Philippine competitions, %d changed, %d unchanged (%s)",
		r.Total, r.Changed, r.Total-r.Changed, strings.Join(parts, ", "))
}

// EnsureDataset records the boundary dataset row, rejecting a reused version
// with different contents.
func (s *Snapshot) EnsureDataset(ctx context.Context, tx *sql.Tx) error {
	m := s.Metadata
	var checksum, sourceURL, retrievedOn, crs, license, attribution, notes string
	var count int
	err := tx.QueryRowContext(ctx, `SELECT checksum_sha256, source_url, retrieved_on, coordinate_system, license,
		attribution, processing_notes, feature_count FROM wca_boundarydataset WHERE version = ?`, m.Version).
		Scan(&checksum, &sourceURL, &retrievedOn, &crs, &license, &attribution, &notes, &count)
	if errors.Is(err, sql.ErrNoRows) {
		_, err = tx.ExecContext(ctx, `INSERT INTO wca_boundarydataset (version, source_url, retrieved_on, coordinate_system,
			license, attribution, processing_notes, checksum_sha256, feature_count, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, m.Version, m.SourceURL, m.RetrievedOn, m.CoordinateSystem, m.License,
			m.Attribution, m.ProcessingNotes, s.Checksum, s.FeatureCount, timefmt.FormatDB(timefmt.Now()))
		return err
	}
	if err != nil {
		return err
	}
	if checksum != s.Checksum {
		return fmt.Errorf("Boundary version %s already exists with another checksum; use a new version.", m.Version)
	}
	if sourceURL != m.SourceURL || retrievedOn[:min(10, len(retrievedOn))] != m.RetrievedOn || crs != m.CoordinateSystem ||
		license != m.License || attribution != m.Attribution || notes != m.ProcessingNotes || count != s.FeatureCount {
		return fmt.Errorf("Boundary version %s already exists with different provenance metadata; use a new version.", m.Version)
	}
	return nil
}

type existingAssignment struct {
	id               int64
	dataset          string
	region           sql.NullString
	status           string
	latitude, longit sql.NullInt64
}

func nullInt(p *int64) sql.NullInt64 {
	if p == nil {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: *p, Valid: true}
}

func nullStr(p *string) sql.NullString {
	if p == nil {
		return sql.NullString{}
	}
	return sql.NullString{String: *p, Valid: true}
}

// Assign classifies every Philippine competition and saves changed rows.
func (s *Snapshot) Assign(ctx context.Context, tx *sql.Tx) (AssignResult, error) {
	res := AssignResult{Statuses: map[string]int{}}
	if err := s.EnsureDataset(ctx, tx); err != nil {
		return res, err
	}
	existing := map[string]existingAssignment{}
	rows, err := tx.QueryContext(ctx, `SELECT a.id, a.competition_id, a.boundary_dataset_id, a.region_code, a.status,
		a.classified_latitude, a.classified_longitude FROM wca_competitionregionassignment a
		JOIN wca_competition c ON c.id = a.competition_id WHERE c.country_id = 'Philippines'`)
	if err != nil {
		return res, err
	}
	for rows.Next() {
		var e existingAssignment
		var comp string
		if err := rows.Scan(&e.id, &comp, &e.dataset, &e.region, &e.status, &e.latitude, &e.longit); err != nil {
			rows.Close()
			return res, err
		}
		existing[comp] = e
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return res, err
	}

	type comp struct {
		id       string
		lat, lon *int64
	}
	var comps []comp
	rows, err = tx.QueryContext(ctx, `SELECT id, latitude, longitude FROM wca_competition WHERE country_id = 'Philippines' ORDER BY id`)
	if err != nil {
		return res, err
	}
	for rows.Next() {
		var c comp
		var lat, lon sql.NullInt64
		if err := rows.Scan(&c.id, &lat, &lon); err != nil {
			rows.Close()
			return res, err
		}
		if lat.Valid {
			c.lat = &lat.Int64
		}
		if lon.Valid {
			c.lon = &lon.Int64
		}
		comps = append(comps, c)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return res, err
	}

	now := timefmt.FormatDB(timefmt.Now())
	insert, err := tx.PrepareContext(ctx, `INSERT INTO wca_competitionregionassignment (region_code, status,
		classified_latitude, classified_longitude, classified_at, boundary_dataset_id, competition_id) VALUES (?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return res, err
	}
	defer insert.Close()
	update, err := tx.PrepareContext(ctx, `UPDATE wca_competitionregionassignment SET boundary_dataset_id = ?, region_code = ?,
		status = ?, classified_latitude = ?, classified_longitude = ?, classified_at = ? WHERE id = ?`)
	if err != nil {
		return res, err
	}
	defer update.Close()

	version := s.Metadata.Version
	for _, c := range comps {
		region, status := s.Classify(c.lat, c.lon)
		res.Total++
		res.Statuses[status]++
		e, ok := existing[c.id]
		r, lat, lon := nullStr(region), nullInt(c.lat), nullInt(c.lon)
		if ok && e.dataset == version && e.region == r && e.status == status && e.latitude == lat && e.longit == lon {
			continue
		}
		res.Changed++
		if !ok {
			_, err = insert.ExecContext(ctx, r, status, lat, lon, now, version, c.id)
		} else {
			_, err = update.ExecContext(ctx, version, r, status, lat, lon, now, e.id)
		}
		if err != nil {
			return res, err
		}
	}
	return res, nil
}
