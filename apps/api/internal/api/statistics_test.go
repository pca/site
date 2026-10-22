package api

import (
	"strings"
	"testing"
)

func TestRegionalMethodologyIncludesOfficialResultTypes(t *testing.T) {
	for _, methodology := range []string{regionalEventMethodology, regionalRegionMethodology} {
		if strings.Count(methodology, regionalOfficialResultTypes) != 1 {
			t.Fatalf("methodology must explain official result types exactly once: %q", methodology)
		}
	}
}

func TestEligibleRegionEvents(t *testing.T) {
	// Empty events stay excluded and fuller teams rank first. Within a tier,
	// score wins over regional placement; equal scores preserve event order.
	events := []eventStrength{
		{EventID: "555bf", ContributorCount: 0, Placement: 1, Score: 85},
		{EventID: "333fm", ContributorCount: 1, Placement: 1, Score: 328},
		{EventID: "333", ContributorCount: 5, Placement: 6, Score: 300},
		{EventID: "222", ContributorCount: 5, Placement: 1, Score: 600},
		{EventID: "444", ContributorCount: 5, Placement: 3, Score: 400},
		{EventID: "555", ContributorCount: 5, Placement: 1, Score: 400},
		{EventID: "skewb", ContributorCount: 3, Placement: 8, Score: 10000},
		{EventID: "clock", ContributorCount: 2, Placement: 15, Score: 2790},
	}
	want := []string{"333", "444", "555", "222", "skewb", "clock", "333fm"}
	got := eligibleRegionEvents(events)
	if len(got) != len(want) {
		t.Fatalf("got %d events, want %d", len(got), len(want))
	}
	for i, id := range want {
		if got[i].EventID != id {
			t.Fatalf("position %d: got %s, want %s", i, got[i].EventID, id)
		}
	}
	// Do not mutate the response data supplied to this ordering helper.
	if events[0].EventID != "555bf" {
		t.Fatal("input events were reordered")
	}
}

func TestEligibleRegionEventsWithoutContributors(t *testing.T) {
	got := eligibleRegionEvents([]eventStrength{{EventID: "555bf", ContributorCount: 0, Placement: 1}})
	if got == nil || len(got) != 0 {
		t.Fatalf("want an empty event list, got %v", got)
	}
}
