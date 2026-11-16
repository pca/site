/** Fixed, invented examples only. No identity storage or collection is enabled here. */
export const featureExamples = [
  { name: "Ranking filters", eligible: 1669, exposed: 1501, used: 679, context: "Regional rankings", availability: "Rankings visits where the filter controls are available.", exposure: "At least half of the filter group visible for one continuous second.", action: "A filter change after exposure, within the same visit." },
  { name: "Region prompt", eligible: 1220, exposed: 733, used: 210, context: "Region setup", availability: "Visits where the visitor can encounter the region prompt.", exposure: "At least half of the prompt visible for one continuous second.", action: "Login started from the prompt after exposure, within the same visit." },
] as const

export const returnWeeks = [1, 2, 3, 4] as const
export const returningGroups = [
  { week: "Aug 31", size: 67, returned: [29, 29, 24, 20] },
  { week: "Sep 7", size: 74, returned: [32, 31, 27, 22] },
  { week: "Sep 14", size: 81, returned: [35, 34, 29, 25] },
  { week: "Sep 21", size: 88, returned: [38, 36, 31, null] },
  { week: "Sep 28", size: 95, returned: [41, 38, null, null] },
  { week: "Oct 5", size: 102, returned: [44, null, null, null] },
] as const

export function previewRate(numerator: number | null, denominator: number): string {
  return numerator === null || denominator <= 0 ? "Not observed" : `${(100 * numerator / denominator).toFixed(1)}%`
}

/** Null periods are omitted, never connected to a fabricated zero. Week 0 is the start. */
export function retentionPoints(group: { size: number; returned: readonly (number | null)[] }) {
  return [{ week: 0, count: group.size, rate: 100 }, ...group.returned.flatMap((count, index) => count === null ? [] : [{ week: index + 1, count, rate: 100 * count / group.size }])]
}
