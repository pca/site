import type { SampleSession } from "./analytics-workspace"
import type { ReportRow, WorkbenchReport, WorkbenchSearch } from "./analytics-workbench"

export type ContentPage = "all" | "rankings" | "statistics"
export const contentBreakdowns = {
  event: "Cubing event", event_region: "Cubing event × selected region", region: "Selected content region", format: "Result type",
  view: "Statistics view", entry: "Initial view / changed selection", page: "Content page",
} as const
export const signalMetricNames = ["eventCount", "totalUsers"] as const
export const measuredFeatures = [
  { id: "rankings_filters", fixtureId: "filters", name: "Ranking filters", page: "Regional Rankings", action: "Event, region or result type changed", exposure: "At least 50% of the controls visible for one continuous second in a foreground tab, or an earlier interaction." },
  { id: "region_prompt", fixtureId: "region", name: "Region prompt", page: "Regional Rankings", action: "WCA login started from the prompt", exposure: "At least 50% of the prompt visible for one continuous second in a foreground tab, or an earlier interaction." },
  { id: "statistics_tabs", fixtureId: "tabs", name: "Statistics views", page: "Regional Statistics", action: "Statistics view changed", exposure: "At least 50% of the view controls visible for one continuous second in a foreground tab, or an earlier interaction." },
] as const

/** The small report deliberately does not invent session joins or conversion rates. */
export function featureSignalRows(report: WorkbenchReport) {
  const eventIndex = report.table.metricHeaders.findIndex(header => header.name === "eventCount")
  const userIndex = report.table.metricHeaders.findIndex(header => header.name === "totalUsers")
  const value = (row: ReportRow | undefined, index: number) => row ? Number(row.metricValues[index]?.value ?? 0) : 0
  return measuredFeatures.map(feature => {
    const rows = report.table.rows ?? []
    const exposed = rows.find(row => row.dimensionValues[0]?.value === feature.id && row.dimensionValues[1]?.value === "feature_exposed")
    const used = rows.find(row => row.dimensionValues[0]?.value === feature.id && row.dimensionValues[1]?.value === "feature_used")
    return { ...feature, exposureSignals: value(exposed, eventIndex), useSignals: value(used, eventIndex), exposedUsers: value(exposed, userIndex), usedUsers: value(used, userIndex) }
  })
}

export function sampleSignalReport(universe: SampleSession[], search: WorkbenchSearch, kind: "content" | "features", breakdown: string, page: ContentPage = "all"): WorkbenchReport {
  const sessions = universe.filter(session => session.day >= 56 - search.days && (search.device === "all" || session.device === search.device))
  const entries: { dimensions: string[]; identity: string }[] = []
  for (const session of sessions) {
    if (kind === "content") for (const view of session.content) {
      if (page !== "all" && view.page !== page) continue
      // V2 fixtures lack view IDs. Do not fabricate a statistics-view breakdown.
      const region = view.page === "rankings" ? view.region : "(not set)"
      const dimension = { event: view.event, event_region: view.event, region, format: view.page === "rankings" ? view.format : "(not set)", entry: view.entry ? "initial" : "change", page: view.page, view: "(not set)" }[breakdown] ?? "(not set)"
      entries.push({ dimensions: breakdown === "event_region" ? [dimension, region] : [dimension], identity: session.identity })
    }
    if (kind === "features") for (const feature of measuredFeatures) {
      if (session.exposed.includes(feature.fixtureId)) entries.push({ dimensions: [feature.id, "feature_exposed"], identity: session.identity })
      if (session.used.includes(feature.fixtureId)) entries.push({ dimensions: [feature.id, "feature_used"], identity: session.identity })
    }
  }
  const values = (items: typeof entries) => [{ value: String(items.length) }, { value: String(new Set(items.map(item => item.identity)).size) }]
  const grouped = new Map<string, typeof entries>()
  for (const item of entries) { const key = JSON.stringify(item.dimensions); grouped.set(key, [...(grouped.get(key) ?? []), item]) }
  const rows = [...grouped.values()].map(items => ({ dimensionValues: items[0].dimensions.map(value => ({ value })), metricValues: values(items) })).sort((a, b) => Number(b.metricValues[0].value) - Number(a.metricValues[0].value))
  const metadata = { timeZone: "Asia/Manila", subjectToThresholding: false, dataLossFromOtherRow: false }
  const dimensionNames = kind === "features" ? ["customEvent:feature_name", "eventName"] : breakdown === "event_region" ? ["customEvent:event_id", "customEvent:region_id"] : [`customEvent:${{ event: "event_id", region: "region_id", format: "result_type", entry: "content_entry", page: "content_page", view: "view_id" }[breakdown]}`]
  return {
    source: "sample", report: kind, device: search.device, breakdown, ...(kind === "content" ? { contentPage: page } : {}),
    start: search.days === 7 ? "2026-10-12" : "2026-09-21", end: "2026-10-18", fetchedAt: "", cached: false,
    hosts: ["pinoycubers.org", "www.pinoycubers.org"],
    table: { dimensionHeaders: dimensionNames.map(name => ({ name })), metricHeaders: signalMetricNames.map(name => ({ name })), rows, rowCount: rows.length, metadata },
    totals: { dimensionHeaders: [], metricHeaders: signalMetricNames.map(name => ({ name })), rows: [{ dimensionValues: [], metricValues: values(entries) }], rowCount: 1, metadata },
  }
}

/** Direct/referrer labels are GA4 classifications, not claims about visitor intent. */
export function acquisitionLabel(raw: string) {
  if (raw === "(not set) / (not set)") return { title: "Unknown source / medium", detail: "Both source and medium are unavailable. Keep this traffic visible rather than assigning a guessed channel." }
  if (raw === "(not set)") return { title: "Not set", detail: "GA4 did not provide this dimension." }
  if (raw === "(direct) / (none)") return { title: "Direct / no known source", detail: "No clear referrer or campaign attribution; not necessarily a typed URL." }
  if (raw === "Unassigned") return { title: "Unassigned", detail: "GA4 could not place this traffic in a default channel." }
  return { title: raw, detail: "" }
}
