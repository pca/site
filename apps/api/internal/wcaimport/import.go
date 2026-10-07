// Package wcaimport loads the WCA v2 public results export into the database
// and compacts it to Philippine data.
package wcaimport

import (
	"archive/zip"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"slices"
	"strings"
	"sync"
	"time"
)

const (
	PhilippinesID      = "Philippines"
	SupportedMajor     = "2"
	attemptsPerResult  = 5
	metadataFile       = "metadata.json"
	championshipsFile  = "WCA_export_championships.tsv"
	competitionsFile   = "WCA_export_competitions.tsv"
	continentsFile     = "WCA_export_continents.tsv"
	countriesFile      = "WCA_export_countries.tsv"
	eventsFile         = "WCA_export_events.tsv"
	formatsFile        = "WCA_export_formats.tsv"
	personsFile        = "WCA_export_persons.tsv"
	ranksAverageFile   = "WCA_export_ranks_average.tsv"
	ranksSingleFile    = "WCA_export_ranks_single.tsv"
	resultAttemptsFile = "WCA_export_result_attempts.tsv"
	resultsFile        = "WCA_export_results.tsv"
	roundTypesFile     = "WCA_export_round_types.tsv"
)

var requiredFiles = []string{championshipsFile, competitionsFile, continentsFile, countriesFile, eventsFile,
	formatsFile, personsFile, ranksAverageFile, ranksSingleFile, resultAttemptsFile, resultsFile, roundTypesFile}

type Metadata struct {
	ExportDate          string `json:"export_date"`
	ExportFormatVersion string `json:"export_format_version"`
}

// Version returns the export format version without its "v" prefix.
func (m Metadata) Version() string { return strings.TrimPrefix(m.ExportFormatVersion, "v") }

type continent struct {
	id, name   string
	recordName *string
}

type country struct {
	id, name        string
	iso2, continent *string
}

type event struct {
	id, name, format string
	rank             int64
}

type format struct {
	id, name, sortBy, sortBySecond           string
	expectedSolves, trimFastest, trimSlowest int64
}

type roundType struct {
	id, name, cellName string
	rank, final        int64
}

type competition struct {
	id, name, cityName, cellName                       string
	countryID                                          string
	information, eventSpecs, delegates, organizers     *string
	venue, venueAddress, venueDetails, externalWebsite *string
	year, month, day, endMonth, endDay                 int64
	latitude, longitude                                *int64
}

type person struct {
	id                    string
	subid                 int64
	name, country, gender *string
}

type rank struct {
	personID, eventID                           string
	best, worldRank, continentRank, countryRank int64
}

type result struct {
	wcaID                                       int64
	competitionID, eventID, roundTypeID         string
	personID, countryID, formatID               string
	personName, regionalSingle, regionalAverage *string
	pos, best, average                          int64
	values                                      [attemptsPerResult]int64
}

type championship struct {
	id            int64
	competitionID *string
	kind          string
}

// Data is a parsed export, already reduced to what the database keeps.
type Data struct {
	Metadata      Metadata
	continents    []continent
	countries     []country
	events        []event
	formats       []format
	roundTypes    []roundType
	competitions  []competition
	persons       []person
	ranksSingle   []rank
	ranksAverage  []rank
	results       []result
	championships []championship
}

// Counts reports the rows that will be written.
func (d *Data) Counts() map[string]int {
	return map[string]int{
		"Continent": len(d.continents), "Country": len(d.countries), "Event": len(d.events),
		"Format": len(d.formats), "RoundType": len(d.roundTypes), "Competition": len(d.competitions),
		"Person": len(d.persons), "RanksSingle": len(d.ranksSingle), "RanksAverage": len(d.ranksAverage),
		"Result": len(d.results), "Championship": len(d.championships),
	}
}

func (d *Data) Summary() string {
	c := d.Counts()
	keys := make([]string, 0, len(c))
	for k := range c {
		keys = append(keys, k)
	}
	slices.Sort(keys)
	parts := make([]string, len(keys))
	for i, k := range keys {
		parts[i] = fmt.Sprintf("%s=%d", k, c[k])
	}
	return strings.Join(parts, ", ")
}

// ReadMetadata reads and validates metadata.json from an export archive.
func ReadMetadata(z *zip.Reader) (Metadata, error) {
	var m Metadata
	f, err := z.Open(metadataFile)
	if err != nil {
		return m, fmt.Errorf("Unable to read WCA export metadata: %w", err)
	}
	defer f.Close()
	if err := json.NewDecoder(f).Decode(&m); err != nil {
		return m, fmt.Errorf("Unable to read WCA export metadata: %w", err)
	}
	if m.ExportDate == "" || m.Version() == "" {
		return m, errors.New("WCA metadata must contain export_date and export_format_version.")
	}
	if major, _, _ := strings.Cut(m.Version(), "."); major != SupportedMajor {
		return m, fmt.Errorf("Unsupported WCA export format %s. This importer supports major version %s.", m.Version(), SupportedMajor)
	}
	var missing []string
	for _, name := range requiredFiles {
		if _, err := fs(z, name); err != nil {
			missing = append(missing, name)
		}
	}
	if len(missing) > 0 {
		return m, fmt.Errorf("WCA export is missing required file(s): %s", strings.Join(missing, ", "))
	}
	return m, nil
}

func fs(z *zip.Reader, name string) (*zip.File, error) {
	for _, f := range z.File {
		if f.Name == name {
			return f, nil
		}
	}
	return nil, fmt.Errorf("%s not found", name)
}

// scan calls fn for every record of a TSV inside the archive.
func scan(ctx context.Context, z *zip.Reader, name string, cols []string, fn func([][]byte) error) error {
	f, err := fs(z, name)
	if err != nil {
		return err
	}
	rc, err := f.Open()
	if err != nil {
		return err
	}
	defer rc.Close()
	r, err := newTSVReader(rc)
	if err != nil {
		return fmt.Errorf("%s: %w", name, err)
	}
	idx, err := r.columns(cols...)
	if err != nil {
		return fmt.Errorf("%s: %w", name, err)
	}
	picked := make([][]byte, len(idx))
	for n := 0; ; n++ {
		if n&0xFFFF == 0 && ctx.Err() != nil {
			return ctx.Err()
		}
		rec, err := r.Read()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		for i, j := range idx {
			if j < len(rec) {
				picked[i] = rec[j]
			} else {
				picked[i] = nil
			}
		}
		if err := fn(picked); err != nil {
			return fmt.Errorf("%s line %d: %w", name, r.line, err)
		}
	}
}

// ints parses several integer fields, stopping at the first error.
func ints(fields [][]byte, out ...*int64) error {
	for i, p := range out {
		n, err := integer(fields[i])
		if err != nil {
			return err
		}
		*p = n
	}
	return nil
}

func str(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// Parse reads an export archive. Large files are streamed and filtered so
// only Philippine rows are held in memory.
func Parse(ctx context.Context, z *zip.Reader, logf func(string, ...any)) (*Data, error) {
	meta, err := ReadMetadata(z)
	if err != nil {
		return nil, err
	}
	d := &Data{Metadata: meta}
	start := time.Now()

	// Persons decide which ranks are kept, so they are read first.
	personIndex := map[string]int{}
	err = scan(ctx, z, personsFile, []string{"name", "gender", "wca_id", "sub_id", "country_id"}, func(f [][]byte) error {
		if string(f[4]) != PhilippinesID {
			return nil
		}
		var subid int64
		if err := ints(f[3:4], &subid); err != nil {
			return err
		}
		p := person{id: string(f[2]), subid: subid, name: text(f[0]), country: text(f[4]), gender: text(f[1])}
		if i, ok := personIndex[p.id]; ok {
			d.persons[i] = p
		} else {
			personIndex[p.id] = len(d.persons)
			d.persons = append(d.persons, p)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	logf("Read %d Philippine persons.", len(d.persons))

	var (
		wg     sync.WaitGroup
		mu     sync.Mutex
		errs   []error
		allCmp []competition
	)
	run := func(label string, fn func() error) {
		wg.Go(func() {
			t := time.Now()
			if err := fn(); err != nil {
				mu.Lock()
				errs = append(errs, err)
				mu.Unlock()
				return
			}
			logf("Read %s in %s.", label, time.Since(t).Round(time.Millisecond))
		})
	}
	readRanks := func(name string, out *[]rank) func() error {
		return func() error {
			return scan(ctx, z, name, []string{"person_id", "event_id", "best", "world_rank", "continent_rank", "country_rank"},
				func(f [][]byte) error {
					if _, ok := personIndex[string(f[0])]; !ok {
						return nil
					}
					r := rank{personID: string(f[0]), eventID: string(f[1])}
					if err := ints(f[2:], &r.best, &r.worldRank, &r.continentRank, &r.countryRank); err != nil {
						return err
					}
					*out = append(*out, r)
					return nil
				})
		}
	}
	run("single ranks", readRanks(ranksSingleFile, &d.ranksSingle))
	run("average ranks", readRanks(ranksAverageFile, &d.ranksAverage))
	run("results and attempts", func() error { return d.readResults(ctx, z) })
	run("competitions", func() error {
		return scan(ctx, z, competitionsFile, []string{"id", "name", "city_name", "country_id", "information", "year",
			"month", "day", "end_month", "end_day", "event_specs", "delegates", "organizers", "venue", "venue_address",
			"venue_details", "external_website", "cell_name", "latitude_microdegrees", "longitude_microdegrees"},
			func(f [][]byte) error {
				c := competition{id: string(f[0]), name: string(f[1]), cityName: string(f[2]), countryID: string(f[3]),
					information: text(f[4]), eventSpecs: text(f[10]), delegates: text(f[11]), organizers: text(f[12]),
					venue: text(f[13]), venueAddress: text(f[14]), venueDetails: text(f[15]), externalWebsite: text(f[16]),
					cellName: string(f[17])}
				if err := ints(f[5:10], &c.year, &c.month, &c.day, &c.endMonth, &c.endDay); err != nil {
					return err
				}
				var err error
				if c.latitude, err = optionalInt(f[18]); err != nil {
					return err
				}
				if c.longitude, err = optionalInt(f[19]); err != nil {
					return err
				}
				allCmp = append(allCmp, c)
				return nil
			})
	})
	run("reference tables", func() error { return d.readReferences(ctx, z) })
	wg.Wait()
	if len(errs) > 0 {
		return nil, errors.Join(errs...)
	}

	// Keep Philippine competitions plus any competition a Filipino result
	// references, then the countries and continents those rows need.
	keep := map[string]bool{}
	for _, c := range allCmp {
		if c.countryID == PhilippinesID {
			keep[c.id] = true
		}
	}
	for _, r := range d.results {
		keep[r.competitionID] = true
	}
	countries := map[string]bool{}
	for _, c := range allCmp {
		if keep[c.id] {
			d.competitions = append(d.competitions, c)
			countries[c.countryID] = true
		}
	}
	for _, p := range d.persons {
		countries[str(p.country)] = true
	}
	for _, r := range d.results {
		countries[r.countryID] = true
	}
	var keptCountries []country
	continents := map[string]bool{}
	for _, c := range d.countries {
		if countries[c.id] {
			keptCountries = append(keptCountries, c)
			continents[str(c.continent)] = true
		}
	}
	d.countries = keptCountries
	var keptContinents []continent
	for _, c := range d.continents {
		if continents[c.id] {
			keptContinents = append(keptContinents, c)
		}
	}
	d.continents = keptContinents
	var keptChampionships []championship
	for _, c := range d.championships {
		if c.competitionID == nil || keep[*c.competitionID] {
			keptChampionships = append(keptChampionships, c)
		}
	}
	d.championships = keptChampionships
	logf("Parsed export %s (%s) in %s: %s.", meta.ExportDate, meta.ExportFormatVersion,
		time.Since(start).Round(time.Millisecond), d.Summary())
	return d, nil
}

func (d *Data) readResults(ctx context.Context, z *zip.Reader) error {
	byWCAID := map[int64]int{}
	err := scan(ctx, z, resultsFile, []string{"id", "pos", "best", "average", "competition_id", "round_type_id",
		"event_id", "person_name", "person_id", "format_id", "regional_single_record", "regional_average_record",
		"person_country_id"}, func(f [][]byte) error {
		if string(f[12]) != PhilippinesID {
			return nil
		}
		r := result{competitionID: string(f[4]), roundTypeID: string(f[5]), eventID: string(f[6]),
			personName: text(f[7]), personID: string(f[8]), formatID: string(f[9]), regionalSingle: text(f[10]),
			regionalAverage: text(f[11]), countryID: string(f[12])}
		if err := ints(f[0:4], &r.wcaID, &r.pos, &r.best, &r.average); err != nil {
			return err
		}
		byWCAID[r.wcaID] = len(d.results)
		d.results = append(d.results, r)
		return nil
	})
	if err != nil || len(d.results) == 0 {
		return err
	}
	return scan(ctx, z, resultAttemptsFile, []string{"value", "attempt_number", "result_id"}, func(f [][]byte) error {
		var resultID int64
		if err := ints(f[2:3], &resultID); err != nil {
			return err
		}
		i, ok := byWCAID[resultID]
		if !ok {
			return nil
		}
		var value, attempt int64
		if err := ints(f[0:2], &value, &attempt); err != nil {
			return err
		}
		if attempt < 1 || attempt > attemptsPerResult {
			return fmt.Errorf("WCA result %d has invalid attempt number %d.", resultID, attempt)
		}
		d.results[i].values[attempt-1] = value
		return nil
	})
}

func (d *Data) readReferences(ctx context.Context, z *zip.Reader) error {
	err := scan(ctx, z, continentsFile, []string{"id", "name", "record_name"}, func(f [][]byte) error {
		d.continents = append(d.continents, continent{id: string(f[0]), name: string(f[1]), recordName: text(f[2])})
		return nil
	})
	if err != nil {
		return err
	}
	err = scan(ctx, z, countriesFile, []string{"id", "name", "continent_id", "iso2"}, func(f [][]byte) error {
		d.countries = append(d.countries, country{id: string(f[0]), name: string(f[1]), continent: text(f[2]), iso2: text(f[3])})
		return nil
	})
	if err != nil {
		return err
	}
	err = scan(ctx, z, eventsFile, []string{"id", "name", "rank", "format"}, func(f [][]byte) error {
		e := event{id: string(f[0]), name: string(f[1]), format: string(f[3])}
		if err := ints(f[2:3], &e.rank); err != nil {
			return err
		}
		d.events = append(d.events, e)
		return nil
	})
	if err != nil {
		return err
	}
	err = scan(ctx, z, formatsFile, []string{"id", "name", "sort_by", "sort_by_second", "expected_solve_count",
		"trim_fastest_n", "trim_slowest_n"}, func(f [][]byte) error {
		x := format{id: string(f[0]), name: string(f[1]), sortBy: string(f[2]), sortBySecond: string(f[3])}
		if err := ints(f[4:7], &x.expectedSolves, &x.trimFastest, &x.trimSlowest); err != nil {
			return err
		}
		d.formats = append(d.formats, x)
		return nil
	})
	if err != nil {
		return err
	}
	err = scan(ctx, z, roundTypesFile, []string{"id", "rank", "name", "cell_name", "final"}, func(f [][]byte) error {
		rt := roundType{id: string(f[0]), name: string(f[2]), cellName: string(f[3])}
		if err := ints([][]byte{f[1], f[4]}, &rt.rank, &rt.final); err != nil {
			return err
		}
		d.roundTypes = append(d.roundTypes, rt)
		return nil
	})
	if err != nil {
		return err
	}
	return scan(ctx, z, championshipsFile, []string{"id", "competition_id", "championship_type"}, func(f [][]byte) error {
		c := championship{competitionID: text(f[1]), kind: string(f[2])}
		if err := ints(f[0:1], &c.id); err != nil {
			return err
		}
		d.championships = append(d.championships, c)
		return nil
	})
}

// Apply writes the parsed export inside tx. Reference rows are upserted;
// ranks and results are replaced.
func (d *Data) Apply(ctx context.Context, tx *sql.Tx) error {
	type step struct {
		sql  string
		rows int
		args func(i int) []any
	}
	steps := []step{
		{`INSERT INTO wca_continent (id, name, record_name, latitude, longitude, zoom) VALUES (?, ?, ?, NULL, NULL, NULL)
			ON CONFLICT(id) DO UPDATE SET name = excluded.name, record_name = excluded.record_name,
			latitude = NULL, longitude = NULL, zoom = NULL`,
			len(d.continents), func(i int) []any {
				c := d.continents[i]
				return []any{c.id, c.name, c.recordName}
			}},
		{`INSERT INTO wca_country (id, name, continent_id, iso2) VALUES (?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET name = excluded.name, continent_id = excluded.continent_id, iso2 = excluded.iso2`,
			len(d.countries), func(i int) []any {
				c := d.countries[i]
				return []any{c.id, c.name, c.continent, c.iso2}
			}},
		{`INSERT INTO wca_event (id, name, rank, format, cell_name) VALUES (?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET name = excluded.name, rank = excluded.rank, format = excluded.format,
			cell_name = excluded.cell_name`,
			len(d.events), func(i int) []any {
				e := d.events[i]
				return []any{e.id, e.name, e.rank, e.format, e.name}
			}},
		{`INSERT INTO wca_format (id, name, sort_by, sort_by_second, expected_solve_count, trim_fastest_n, trim_slowest_n)
			VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, sort_by = excluded.sort_by,
			sort_by_second = excluded.sort_by_second, expected_solve_count = excluded.expected_solve_count,
			trim_fastest_n = excluded.trim_fastest_n, trim_slowest_n = excluded.trim_slowest_n`,
			len(d.formats), func(i int) []any {
				f := d.formats[i]
				return []any{f.id, f.name, f.sortBy, f.sortBySecond, f.expectedSolves, f.trimFastest, f.trimSlowest}
			}},
		{`INSERT INTO wca_roundtype (id, rank, name, cell_name, final) VALUES (?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET rank = excluded.rank, name = excluded.name, cell_name = excluded.cell_name,
			final = excluded.final`,
			len(d.roundTypes), func(i int) []any {
				r := d.roundTypes[i]
				return []any{r.id, r.rank, r.name, r.cellName, r.final}
			}},
		{`INSERT INTO wca_competition (id, name, city_name, country_id, information, year, month, day, end_month, end_day,
			event_specs, wca_delegate, organizer, venue, venue_address, venue_details, external_website, cell_name,
			latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET name = excluded.name, city_name = excluded.city_name,
			country_id = excluded.country_id, information = excluded.information, year = excluded.year,
			month = excluded.month, day = excluded.day, end_month = excluded.end_month, end_day = excluded.end_day,
			event_specs = excluded.event_specs, wca_delegate = excluded.wca_delegate, organizer = excluded.organizer,
			venue = excluded.venue, venue_address = excluded.venue_address, venue_details = excluded.venue_details,
			external_website = excluded.external_website, cell_name = excluded.cell_name,
			latitude = excluded.latitude, longitude = excluded.longitude`,
			len(d.competitions), func(i int) []any {
				c := d.competitions[i]
				return []any{c.id, c.name, c.cityName, c.countryID, c.information, c.year, c.month, c.day, c.endMonth,
					c.endDay, c.eventSpecs, c.delegates, c.organizers, c.venue, c.venueAddress, c.venueDetails,
					c.externalWebsite, c.cellName, c.latitude, c.longitude}
			}},
		{`INSERT INTO wca_person (id, subid, name, country_id, gender) VALUES (?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET subid = excluded.subid, name = excluded.name, country_id = excluded.country_id,
			gender = excluded.gender`,
			len(d.persons), func(i int) []any {
				p := d.persons[i]
				return []any{p.id, p.subid, p.name, p.country, p.gender}
			}},
		{`DELETE FROM wca_ranksaverage`, 0, nil},
		{`INSERT INTO wca_ranksaverage (id, best, world_rank, continent_rank, country_rank, event_id, person_id)
			VALUES (?, ?, ?, ?, ?, ?, ?)`,
			len(d.ranksAverage), func(i int) []any {
				r := d.ranksAverage[i]
				return []any{i + 1, r.best, r.worldRank, r.continentRank, r.countryRank, r.eventID, r.personID}
			}},
		{`DELETE FROM wca_rankssingle`, 0, nil},
		{`INSERT INTO wca_rankssingle (id, best, world_rank, continent_rank, country_rank, event_id, person_id)
			VALUES (?, ?, ?, ?, ?, ?, ?)`,
			len(d.ranksSingle), func(i int) []any {
				r := d.ranksSingle[i]
				return []any{i + 1, r.best, r.worldRank, r.continentRank, r.countryRank, r.eventID, r.personID}
			}},
		{`DELETE FROM wca_result`, 0, nil},
		{`INSERT INTO wca_result (id, pos, best, average, person_name, value1, value2, value3, value4, value5,
			regional_single_record, regional_average_record, competition_id, country_id, event_id, format_id,
			person_id, round_type_id, wca_result_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			len(d.results), func(i int) []any {
				r := d.results[i]
				return []any{i + 1, r.pos, r.best, r.average, r.personName, r.values[0], r.values[1], r.values[2],
					r.values[3], r.values[4], r.regionalSingle, r.regionalAverage, r.competitionID, r.countryID,
					r.eventID, r.formatID, r.personID, r.roundTypeID, r.wcaID}
			}},
		{`INSERT INTO wca_championship (id, competition_id, championship_type) VALUES (?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET competition_id = excluded.competition_id,
			championship_type = excluded.championship_type`,
			len(d.championships), func(i int) []any {
				c := d.championships[i]
				return []any{c.id, c.competitionID, c.kind}
			}},
	}
	for _, s := range steps {
		if s.args == nil {
			if _, err := tx.ExecContext(ctx, s.sql); err != nil {
				return err
			}
			continue
		}
		stmt, err := tx.PrepareContext(ctx, s.sql)
		if err != nil {
			return err
		}
		for i := range s.rows {
			if _, err := stmt.ExecContext(ctx, s.args(i)...); err != nil {
				stmt.Close()
				return fmt.Errorf("%s: %w", strings.Fields(s.sql)[2], err)
			}
		}
		stmt.Close()
	}
	return nil
}
