package statsbuild

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"testing"
)

func TestContributorResults(t *testing.T) {
	tests := []struct {
		name, format, want string
		best               int64
		average, valid     bool
	}{
		{name: "average time", format: "time", best: 182, average: true, valid: true, want: "1.82"},
		{name: "single time", format: "time", best: 12345, valid: true, want: "2:03.45"},
		{name: "fewest moves average", format: "number", best: 2333, average: true, valid: true, want: "23.33"},
		{name: "fewest moves single", format: "number", best: 23, valid: true, want: "23"},
		{name: "multi blind", format: "multi", best: 970006001, valid: true, want: "3/4 1:00"},
		{name: "missing result", format: "time"},
		{name: "zero result", format: "time", valid: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rows := []rankRow{{
				personID: sql.NullString{String: "2022PADU02", Valid: true},
				rank:     2, best: sql.NullInt64{Int64: tt.best, Valid: tt.valid},
			}}
			home := newHomeRegions([][2]string{{"2022PADU02", "NCR"}})
			entries, worst, _ := eventInputs(rows, home, tt.format, tt.average)
			results, err := calculateEventStrength(entries, worst)
			if err != nil {
				t.Fatal(err)
			}
			record, err := strengthRecord("test", rankSingle, results[0])
			if err != nil {
				t.Fatal(err)
			}
			var slots []slot
			if err := json.Unmarshal([]byte(record.values[6].(string)), &slots); err != nil {
				t.Fatal(err)
			}
			if len(slots) != teamSize || slots[0].IsPenalty {
				t.Fatalf("unexpected contributor slots: %+v", slots)
			}
			got := slots[0].Result
			if tt.want == "" {
				if got != nil {
					t.Fatalf("missing result must remain null, got %q", *got)
				}
			} else if got == nil || *got != tt.want {
				t.Fatalf("got result %v, want %q", got, tt.want)
			}
			for _, penalty := range slots[1:] {
				if !penalty.IsPenalty || penalty.Result != nil {
					t.Fatalf("penalty must not have a result: %+v", penalty)
				}
			}
		})
	}
}

func TestContributorResultAffectsSnapshotHash(t *testing.T) {
	first, second := "1.82", "1.83"
	r := regionStrength{slots: []slot{{NationalRank: 2, Result: &first}}}
	a, err := strengthRecord("pyram", rankAverage, r)
	if err != nil {
		t.Fatal(err)
	}
	r.slots[0].Result = &second
	b, err := strengthRecord("pyram", rankAverage, r)
	if err != nil {
		t.Fatal(err)
	}
	if a.hash == b.hash {
		t.Fatal("changed result must change the snapshot content hash")
	}
}

func TestEventStrengthContributorTiers(t *testing.T) {
	var entries []rankedCompetitor
	add := func(region string, count, rank int) {
		for i := 0; i < count; i++ {
			entries = append(entries, rankedCompetitor{
				wcaID: fmt.Sprintf("%s-%d", region, i), region: region, rank: rank,
			})
		}
	}
	// A full team must beat even a much lower-scoring four-person team.
	add("01", 5, 100)
	add("02", 4, 1)
	add("03", 3, 100)
	add("4A", 2, 100)
	add("4B", 1, 100)
	// A second full team verifies score ordering inside a contributor tier.
	add("05", 5, 99)
	// Equal contributor counts and scores must still share a placement.
	add("06", 4, 1)

	results, err := calculateEventStrength(entries, 100)
	if err != nil {
		t.Fatal(err)
	}
	wantRegions := []string{"05", "01", "02", "06", "03", "4A", "4B"}
	wantPlaces := []int{1, 2, 3, 3, 5, 6, 7}
	for i, region := range wantRegions {
		if results[i].region != region || results[i].placement != wantPlaces[i] {
			t.Fatalf("row %d: got %s in place %d, want %s in place %d", i, results[i].region, results[i].placement, region, wantPlaces[i])
		}
	}
	// Several tiers have the same total (500); they must not tie across tiers.
	for _, result := range results[len(wantRegions):] {
		if result.contributors != 0 || result.placement != 8 {
			t.Fatalf("empty team %s: got %d contributors and place %d, want 0 and 8", result.region, result.contributors, result.placement)
		}
	}
}
