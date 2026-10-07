// Package regions holds the PCA home-region and island-group definitions.
package regions

type Choice struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

const (
	NCR   = "NCR"
	CAR   = "CAR"
	R01   = "01"
	R02   = "02"
	R03   = "03"
	R4A   = "4A"
	R4B   = "4B"
	R05   = "05"
	R06   = "06"
	R07   = "07"
	R08   = "08"
	R09   = "09"
	R10   = "10"
	R11   = "11"
	R12   = "12"
	R13   = "13"
	BARMM = "BARMM"
	R18   = "18"
)

// Regions is ordered exactly like the public /regions/ endpoint.
var Regions = []Choice{
	{NCR, "NCR (Luzon - Metro Manila)"},
	{CAR, "CAR (Luzon - Cordillera Region)"},
	{R01, "Region I (Luzon - Ilocos Region)"},
	{R02, "Region II (Luzon - Cagayan Valley)"},
	{R03, "Region III (Luzon - Central Luzon)"},
	{R4A, "Region IV-A (Luzon - Calabarzon)"},
	{R4B, "Region IV-B (Luzon - Mimaropa)"},
	{R05, "Region V (Luzon - Bicol Region)"},
	{R06, "Region VI (Visayas - Western Visayas)"},
	{R07, "Region VII (Visayas - Central Visayas)"},
	{R08, "Region VIII (Visayas - Eastern Visayas)"},
	{R09, "Region IX (Mindanao - Zamboanga Peninsula)"},
	{R10, "Region X (Mindanao - Northern Mindanao)"},
	{R11, "Region XI (Mindanao - Davao Region)"},
	{R12, "Region XII (Mindanao - Soccsksargen)"},
	{R13, "Region XIII (Mindanao - Caraga)"},
	{BARMM, "BARMM (Mindanao - Bangsamoro)"},
	{R18, "Region XVIII (Visayas - Negros Island Region)"},
}

const (
	ZoneLuzon    = "luzon"
	ZoneVisayas  = "visayas"
	ZoneMindanao = "mindanao"
)

var Zones = []Choice{
	{ZoneLuzon, "Luzon"},
	{ZoneVisayas, "Visayas"},
	{ZoneMindanao, "Mindanao"},
}

var ZoneRegions = map[string][]string{
	ZoneLuzon:    {NCR, CAR, R01, R02, R03, R4A, R4B, R05},
	ZoneVisayas:  {R06, R07, R08, R18},
	ZoneMindanao: {R09, R10, R11, R12, R13, BARMM},
}

var names = func() map[string]string {
	m := make(map[string]string, len(Regions))
	for _, r := range Regions {
		m[r.ID] = r.Name
	}
	return m
}()

var order = func() map[string]int {
	m := make(map[string]int, len(Regions))
	for i, r := range Regions {
		m[r.ID] = i + 1
	}
	return m
}()

func Name(id string) (string, bool) {
	n, ok := names[id]
	return n, ok
}

func Valid(id string) bool {
	_, ok := names[id]
	return ok
}

// Order returns the 1-based position of a region, or 0 for the national scope.
func Order(id string) int {
	if id == "" {
		return 0
	}
	if o, ok := order[id]; ok {
		return o
	}
	return 999
}

func IDs() []string {
	ids := make([]string, len(Regions))
	for i, r := range Regions {
		ids[i] = r.ID
	}
	return ids
}

func ZoneIDs() []string {
	ids := make([]string, len(Zones))
	for i, z := range Zones {
		ids[i] = z.ID
	}
	return ids
}

// Zone returns the zone containing a region.
func Zone(regionID string) string {
	for zone, ids := range ZoneRegions {
		for _, id := range ids {
			if id == regionID {
				return zone
			}
		}
	}
	return ""
}
