// Package geo classifies competition venues into PCA regions with
// deterministic point-in-polygon rules.
package geo

import (
	"bytes"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"slices"
	"strings"
	"time"

	"github.com/pca/backend/internal/regions"
)

//go:embed boundaries/philippines-regions.geojson
var defaultGeoJSON []byte

//go:embed boundaries/philippines-regions.metadata.json
var defaultMetadata []byte

const (
	coordinateScale       = 1_000_000
	boundaryEpsilon       = 1e-12
	boundaryProbeDistance = 1e-7
	// bboxMargin is far wider than boundaryEpsilon, so skipping shapes whose
	// box excludes the point never changes a result.
	bboxMargin = 1e-9
)

const (
	StatusAssigned           = "assigned"
	StatusMissingCoordinates = "missing_coordinates"
	StatusInvalidCoordinates = "invalid_coordinates"
	StatusOutsideBoundary    = "outside_boundary"
	StatusBoundary           = "boundary"
	StatusOverlappingRegions = "overlapping_regions"
)

type relation int

const (
	outside relation = iota
	inside
	boundary
)

type point struct{ x, y float64 }

type bbox struct{ minX, minY, maxX, maxY float64 }

func (b bbox) excludes(p point) bool {
	return p.x < b.minX-bboxMargin || p.x > b.maxX+bboxMargin || p.y < b.minY-bboxMargin || p.y > b.maxY+bboxMargin
}

type polygon struct {
	rings [][]point
	box   bbox
}

// geometry is a Polygon (one entry) or MultiPolygon.
type geometry struct {
	polygons []polygon
	multi    bool
}

type Metadata struct {
	Version          string `json:"version"`
	SourceURL        string `json:"source_url"`
	RetrievedOn      string `json:"retrieved_on"`
	CoordinateSystem string `json:"coordinate_system"`
	License          string `json:"license"`
	Attribution      string `json:"attribution"`
	ProcessingNotes  string `json:"processing_notes"`
	GeoJSONChecksum  string `json:"geojson_checksum_sha256"`
}

// Snapshot is a validated, versioned boundary dataset.
type Snapshot struct {
	Metadata     Metadata
	Checksum     string
	FeatureCount int
	regionOrder  []string
	byRegion     map[string][]geometry
}

// Load reads boundary files from disk, or the embedded snapshot when both
// paths are empty.
func Load(geojsonPath, metadataPath string) (*Snapshot, error) {
	if geojsonPath == "" && metadataPath == "" {
		return Parse(defaultGeoJSON, defaultMetadata)
	}
	if metadataPath == "" {
		metadataPath = strings.TrimSuffix(geojsonPath, ".geojson") + ".metadata.json"
	}
	g, err := os.ReadFile(geojsonPath)
	if err != nil {
		return nil, err
	}
	m, err := os.ReadFile(metadataPath)
	if err != nil {
		return nil, err
	}
	return Parse(g, m)
}

type rawFeature struct {
	Properties struct {
		RegionCode string `json:"region_code"`
	} `json:"properties"`
	Geometry *struct {
		Type        string          `json:"type"`
		Coordinates json.RawMessage `json:"coordinates"`
	} `json:"geometry"`
}

func Parse(geojson, metadata []byte) (*Snapshot, error) {
	var doc struct {
		Type     string       `json:"type"`
		Features []rawFeature `json:"features"`
	}
	if err := json.Unmarshal(geojson, &doc); err != nil {
		return nil, err
	}
	var meta Metadata
	if err := json.Unmarshal(metadata, &meta); err != nil {
		return nil, err
	}
	if doc.Type != "FeatureCollection" {
		return nil, errors.New("Boundary file must be a GeoJSON FeatureCollection")
	}
	if len(doc.Features) == 0 {
		return nil, errors.New("Boundary file must contain region features")
	}
	s := &Snapshot{Metadata: meta, FeatureCount: len(doc.Features), byRegion: map[string][]geometry{}}
	for _, f := range doc.Features {
		code := f.Properties.RegionCode
		if !regions.Valid(code) {
			return nil, errors.New("Boundary feature uses an unknown PCA region code")
		}
		if f.Geometry == nil || (f.Geometry.Type != "Polygon" && f.Geometry.Type != "MultiPolygon") {
			return nil, errors.New("Boundary features must use Polygon or MultiPolygon")
		}
		g, err := parseGeometry(f.Geometry.Type, f.Geometry.Coordinates)
		if err != nil {
			return nil, err
		}
		if _, seen := s.byRegion[code]; !seen {
			s.regionOrder = append(s.regionOrder, code)
		}
		s.byRegion[code] = append(s.byRegion[code], g)
	}
	var missing []string
	for _, id := range regions.IDs() {
		if _, ok := s.byRegion[id]; !ok {
			missing = append(missing, id)
		}
	}
	if len(missing) > 0 {
		slices.Sort(missing)
		return nil, fmt.Errorf("Boundary file is missing region codes: %s", strings.Join(missing, ", "))
	}
	var missingMeta []string
	for _, kv := range [][2]string{{"version", meta.Version}, {"source_url", meta.SourceURL}, {"retrieved_on", meta.RetrievedOn},
		{"coordinate_system", meta.CoordinateSystem}, {"license", meta.License}, {"attribution", meta.Attribution},
		{"processing_notes", meta.ProcessingNotes}, {"geojson_checksum_sha256", meta.GeoJSONChecksum}} {
		if kv[1] == "" {
			missingMeta = append(missingMeta, kv[0])
		}
	}
	if len(missingMeta) > 0 {
		return nil, fmt.Errorf("Boundary metadata is missing: %s", strings.Join(missingMeta, ", "))
	}
	if _, err := time.Parse("2006-01-02", meta.RetrievedOn); err != nil {
		return nil, errors.New("Boundary metadata retrieved_on must be an ISO date")
	}
	if meta.CoordinateSystem != "EPSG:4326" {
		return nil, errors.New("Boundary coordinates must use EPSG:4326")
	}
	sum := sha256.Sum256(geojson)
	s.Checksum = hex.EncodeToString(sum[:])
	if s.Checksum != meta.GeoJSONChecksum {
		// Git checkouts with autocrlf rewrite line endings in the file.
		lf := sha256.Sum256(bytes.ReplaceAll(geojson, []byte("\r\n"), []byte("\n")))
		if hex.EncodeToString(lf[:]) != meta.GeoJSONChecksum {
			return nil, errors.New("Boundary GeoJSON checksum does not match its metadata")
		}
		s.Checksum = meta.GeoJSONChecksum
	}
	return s, nil
}

func parseGeometry(kind string, raw json.RawMessage) (geometry, error) {
	var polys [][][][2]float64
	if kind == "Polygon" {
		var p [][][2]float64
		if err := json.Unmarshal(raw, &p); err != nil {
			return geometry{}, err
		}
		polys = [][][][2]float64{p}
	} else if err := json.Unmarshal(raw, &polys); err != nil {
		return geometry{}, err
	}
	if len(polys) == 0 || len(polys[0]) == 0 {
		return geometry{}, errors.New("Boundary feature geometry cannot be empty")
	}
	g := geometry{multi: kind == "MultiPolygon"}
	for _, rings := range polys {
		if len(rings) == 0 {
			return geometry{}, errors.New("GeoJSON polygons must contain an exterior ring")
		}
		p := polygon{box: bbox{math.Inf(1), math.Inf(1), math.Inf(-1), math.Inf(-1)}}
		for i, ring := range rings {
			if len(ring) < 4 {
				return geometry{}, errors.New("GeoJSON polygon rings must contain at least four points")
			}
			pts := make([]point, len(ring))
			for j, c := range ring {
				pts[j] = point{c[0], c[1]}
				if i == 0 {
					p.box.minX, p.box.maxX = min(p.box.minX, c[0]), max(p.box.maxX, c[0])
					p.box.minY, p.box.maxY = min(p.box.minY, c[1]), max(p.box.maxY, c[1])
				}
			}
			p.rings = append(p.rings, pts)
		}
		g.polygons = append(g.polygons, p)
	}
	return g, nil
}

// Explicit float64 conversions stop the compiler from fusing multiply-adds,
// which would change rounding and so the stored classifications.

func pointOnSegment(p, a, b point) bool {
	cross := float64((p.x-a.x)*(b.y-a.y)) - float64((p.y-a.y)*(b.x-a.x))
	if math.Abs(cross) > boundaryEpsilon {
		return false
	}
	return min(a.x, b.x)-boundaryEpsilon <= p.x && p.x <= max(a.x, b.x)+boundaryEpsilon &&
		min(a.y, b.y)-boundaryEpsilon <= p.y && p.y <= max(a.y, b.y)+boundaryEpsilon
}

func ringRelation(p point, ring []point) relation {
	in := false
	prev := ring[len(ring)-1]
	for _, cur := range ring {
		if pointOnSegment(p, prev, cur) {
			return boundary
		}
		if (prev.y > p.y) != (cur.y > p.y) {
			ix := prev.x + float64(float64((p.y-prev.y)*(cur.x-prev.x))/(cur.y-prev.y))
			if ix > p.x {
				in = !in
			}
		}
		prev = cur
	}
	if in {
		return inside
	}
	return outside
}

func polygonRelation(p point, poly polygon) relation {
	if poly.box.excludes(p) {
		return outside
	}
	ext := ringRelation(p, poly.rings[0])
	if ext != inside {
		return ext
	}
	for _, hole := range poly.rings[1:] {
		switch ringRelation(p, hole) {
		case boundary:
			return boundary
		case inside:
			return outside
		}
	}
	return inside
}

func geometryRelation(p point, g geometry) relation {
	if !g.multi {
		return polygonRelation(p, g.polygons[0])
	}
	sawBoundary := false
	for _, poly := range g.polygons {
		switch polygonRelation(p, poly) {
		case inside:
			return inside
		case boundary:
			sawBoundary = true
		}
	}
	if sawBoundary {
		return boundary
	}
	return outside
}

func regionRelation(p point, geoms []geometry) relation {
	sawBoundary := false
	for _, g := range geoms {
		switch geometryRelation(p, g) {
		case inside:
			return inside
		case boundary:
			sawBoundary = true
		}
	}
	if !sawBoundary {
		return outside
	}
	// A border shared by adjacent province polygons is internal to the
	// region; it counts as interior only when every probe is covered.
	for step := range 16 {
		angle := float64(step) * (2 * math.Pi / 16)
		probe := point{p.x + float64(boundaryProbeDistance*math.Cos(angle)), p.y + float64(boundaryProbeDistance*math.Sin(angle))}
		covered := false
		for _, g := range geoms {
			if geometryRelation(probe, g) != outside {
				covered = true
				break
			}
		}
		if !covered {
			return boundary
		}
	}
	return inside
}

// Classify returns the region and status for WCA microdegree coordinates.
func (s *Snapshot) Classify(lat, lon *int64) (*string, string) {
	if lat == nil || lon == nil {
		return nil, StatusMissingCoordinates
	}
	latitude := float64(*lat) / coordinateScale
	longitude := float64(*lon) / coordinateScale
	if latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 {
		return nil, StatusInvalidCoordinates
	}
	p := point{longitude, latitude}
	var interior, onBoundary []string
	for _, code := range s.regionOrder {
		switch regionRelation(p, s.byRegion[code]) {
		case inside:
			interior = append(interior, code)
		case boundary:
			onBoundary = append(onBoundary, code)
		}
	}
	switch {
	case len(interior) > 1:
		return nil, StatusOverlappingRegions
	case len(interior) == 1:
		for _, b := range onBoundary {
			if b != interior[0] {
				return nil, StatusOverlappingRegions
			}
		}
		code := interior[0]
		return &code, StatusAssigned
	case len(onBoundary) > 0:
		return nil, StatusBoundary
	}
	return nil, StatusOutsideBoundary
}
