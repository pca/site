export type Zone = "luzon" | "visayas" | "mindanao"

export interface Region {
  id: string
  /** Name used by the API, e.g. "NCR (Luzon - Metro Manila)". */
  name: string
  codeName: string
  fullName: string
  shortName: string
  /** Roman-numeral tag shown in the rankings table. */
  tag: string
  zone: Zone
}

export const REGIONS: readonly Region[] = [
  { id: "NCR", name: "NCR (Luzon - Metro Manila)", codeName: "NCR", fullName: "Metro Manila", shortName: "NCR · Metro Manila", tag: "NCR", zone: "luzon" },
  { id: "CAR", name: "CAR (Luzon - Cordillera Region)", codeName: "CAR", fullName: "Cordillera Administrative Region", shortName: "CAR · Cordillera", tag: "CAR", zone: "luzon" },
  { id: "01", name: "Region I (Luzon - Ilocos Region)", codeName: "Region I", fullName: "Ilocos Region", shortName: "I · Ilocos", tag: "I", zone: "luzon" },
  { id: "02", name: "Region II (Luzon - Cagayan Valley)", codeName: "Region II", fullName: "Cagayan Valley", shortName: "II · Cagayan Valley", tag: "II", zone: "luzon" },
  { id: "03", name: "Region III (Luzon - Central Luzon)", codeName: "Region III", fullName: "Central Luzon", shortName: "III · C. Luzon", tag: "III", zone: "luzon" },
  { id: "4A", name: "Region IV-A (Luzon - Calabarzon)", codeName: "Region IV-A", fullName: "CALABARZON", shortName: "IV-A · CALABARZON", tag: "IV-A", zone: "luzon" },
  { id: "4B", name: "Region IV-B (Luzon - Mimaropa)", codeName: "Region IV-B", fullName: "MIMAROPA", shortName: "IV-B · MIMAROPA", tag: "IV-B", zone: "luzon" },
  { id: "05", name: "Region V (Luzon - Bicol Region)", codeName: "Region V", fullName: "Bicol Region", shortName: "V · Bicol", tag: "V", zone: "luzon" },
  { id: "06", name: "Region VI (Visayas - Western Visayas)", codeName: "Region VI", fullName: "Western Visayas", shortName: "VI · W. Visayas", tag: "VI", zone: "visayas" },
  { id: "07", name: "Region VII (Visayas - Central Visayas)", codeName: "Region VII", fullName: "Central Visayas", shortName: "VII · C. Visayas", tag: "VII", zone: "visayas" },
  { id: "08", name: "Region VIII (Visayas - Eastern Visayas)", codeName: "Region VIII", fullName: "Eastern Visayas", shortName: "VIII · E. Visayas", tag: "VIII", zone: "visayas" },
  { id: "09", name: "Region IX (Mindanao - Zamboanga Peninsula)", codeName: "Region IX", fullName: "Zamboanga Peninsula", shortName: "IX · Zamboanga", tag: "IX", zone: "mindanao" },
  { id: "10", name: "Region X (Mindanao - Northern Mindanao)", codeName: "Region X", fullName: "Northern Mindanao", shortName: "X · N. Mindanao", tag: "X", zone: "mindanao" },
  { id: "11", name: "Region XI (Mindanao - Davao Region)", codeName: "Region XI", fullName: "Davao Region", shortName: "XI · Davao", tag: "XI", zone: "mindanao" },
  { id: "12", name: "Region XII (Mindanao - Soccsksargen)", codeName: "Region XII", fullName: "SOCCSKSARGEN", shortName: "XII · SOCCSKSARGEN", tag: "XII", zone: "mindanao" },
  { id: "13", name: "Region XIII (Mindanao - Caraga)", codeName: "Region XIII", fullName: "Caraga", shortName: "XIII · Caraga", tag: "XIII", zone: "mindanao" },
  { id: "BARMM", name: "BARMM (Mindanao - Bangsamoro)", codeName: "BARMM", fullName: "Bangsamoro Autonomous Region", shortName: "BARMM · Bangsamoro", tag: "BARMM", zone: "mindanao" },
  { id: "18", name: "Region XVIII (Visayas - Negros Island Region)", codeName: "Region XVIII", fullName: "Negros Island Region", shortName: "XVIII · Negros Island", tag: "XVIII", zone: "visayas" },
]

const byId = new Map(REGIONS.map(region => [region.id, region]))
const byName = new Map(REGIONS.map(region => [region.name, region]))

export const findRegion = (id?: string | null, name?: string | null): Region | undefined =>
  (id ? byId.get(id) : undefined) ?? (name ? byName.get(name) : undefined)

export const isRegionId = (id: unknown): id is string => typeof id === "string" && byId.has(id)

export const regionName = (id?: string | null) => (id ? (byId.get(id)?.name ?? id) : "No region")

export const shortRegionName = (name: string) => byName.get(name)?.shortName ?? name

export const ZONE_COLORS: Record<Zone | "unknown", string> = {
  luzon: "#9A6500",
  visayas: "#0A4C84",
  mindanao: "#A62D24",
  unknown: "#666666",
}
