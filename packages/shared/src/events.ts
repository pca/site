export interface WcaEvent {
  id: string
  name: string
  rank: number
  format: "time" | "number" | "multi"
}

export const EVENTS: readonly WcaEvent[] = [
  { id: "222", name: "2x2x2 Cube", rank: 20, format: "time" },
  { id: "333", name: "3x3x3 Cube", rank: 10, format: "time" },
  { id: "333bf", name: "3x3x3 Blindfolded", rank: 70, format: "time" },
  { id: "333fm", name: "3x3x3 Fewest Moves", rank: 80, format: "number" },
  { id: "333ft", name: "3x3x3 With Feet", rank: 996, format: "time" },
  { id: "333mbf", name: "3x3x3 Multi-Blind", rank: 180, format: "multi" },
  { id: "333mbo", name: "3x3x3 Multi-Blind Old Style", rank: 999, format: "multi" },
  { id: "333oh", name: "3x3x3 One-Handed", rank: 90, format: "time" },
  { id: "444", name: "4x4x4 Cube", rank: 30, format: "time" },
  { id: "444bf", name: "4x4x4 Blindfolded", rank: 160, format: "time" },
  { id: "555", name: "5x5x5 Cube", rank: 40, format: "time" },
  { id: "555bf", name: "5x5x5 Blindfolded", rank: 170, format: "time" },
  { id: "666", name: "6x6x6 Cube", rank: 50, format: "time" },
  { id: "777", name: "7x7x7 Cube", rank: 60, format: "time" },
  { id: "clock", name: "Clock", rank: 110, format: "time" },
  { id: "magic", name: "Magic", rank: 997, format: "time" },
  { id: "minx", name: "Megaminx", rank: 120, format: "time" },
  { id: "mmagic", name: "Master Magic", rank: 998, format: "time" },
  { id: "pyram", name: "Pyraminx", rank: 130, format: "time" },
  { id: "skewb", name: "Skewb", rank: 140, format: "time" },
  { id: "sq1", name: "Square-1", rank: 150, format: "time" },
]

/** Current WCA events (rank below 990), in official order. */
export const ACTIVE_EVENTS: readonly WcaEvent[] = EVENTS.filter(event => event.rank < 990).sort(
  (a, b) => a.rank - b.rank,
)

/** Events without an average ranking. */
export const SINGLE_ONLY_EVENTS = new Set(["333mbf"])

export const findEvent = (id: string) => EVENTS.find(event => event.id === id)

export const isActiveEventId = (id: unknown): id is string =>
  typeof id === "string" && ACTIVE_EVENTS.some(event => event.id === id)
