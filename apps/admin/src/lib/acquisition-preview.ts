import type { PageId, SampleSession, TrafficSource } from "./analytics-workspace"

export type AcquisitionScope = "session" | "first"
export type AcquisitionDimension = "channel" | "source" | "campaign" | "landing"
export interface AcquisitionUnit {
  id: string; source: TrafficSource; landing: PageId; sessions: SampleSession[]
  engaged: boolean; filterUsed: boolean; submitted: boolean
}
export function acquisitionUnits(sessions: SampleSession[], scope: AcquisitionScope, universe: SampleSession[]): AcquisitionUnit[] {
  if (scope === "session") return sessions.map(s => ({ id: s.id, source: s.acquisition, landing: s.pages[0], sessions: [s], engaged: s.engaged, filterUsed: s.used.includes("filters"), submitted: s.onboarding[3] }))
  const firstSessions = new Map<string, SampleSession>()
  for (const session of [...universe].sort((a, b) => a.day - b.day || a.id.localeCompare(b.id))) {
    if (!firstSessions.has(session.identity)) firstSessions.set(session.identity, session)
  }
  // First-acquisition view includes only identities whose actual first session is
  // in the selected period/device slice. Keep outcomes in that selected period.
  const selectedIds = new Set(sessions.map(s => s.id))
  const groups = new Map<string, SampleSession[]>()
  for (const session of sessions) {
    const first = firstSessions.get(session.identity)
    if (!first) throw new Error("Selected session is missing from the acquisition history")
    if (!selectedIds.has(first.id)) continue
    const group = groups.get(session.identity) ?? []
    group.push(session)
    groups.set(session.identity, group)
  }
  return [...groups].map(([id, group]) => {
    const first = firstSessions.get(id)!
    return { id, source: first.acquisition, landing: first.pages[0], sessions: group, engaged: group.some(s => s.engaged), filterUsed: group.some(s => s.used.includes("filters")), submitted: group.some(s => s.onboarding[3]) }
  })
}

export function acquisitionKey(unit: AcquisitionUnit, dimension: AcquisitionDimension) {
  if (dimension === "channel") return unit.source.channel
  if (dimension === "source") return `${unit.source.source} / ${unit.source.medium}`
  if (dimension === "campaign") return unit.source.campaign ?? "No named campaign"
  return unit.landing === "rankings" ? "/regional-rankings" : "/regional-statistics"
}
export function acquisitionTotals(units: AcquisitionUnit[]) {
  return {
    count: units.length,
    sessions: units.reduce((n, u) => n + u.sessions.length, 0),
    engaged: units.filter(u => u.engaged).length,
    filterUsed: units.filter(u => u.filterUsed).length,
    submitted: units.filter(u => u.submitted).length,
    tagged: units.filter(u => u.source.tagged).length,
    unknown: units.filter(u => u.source.channel === "Unassigned").length,
  }
}
export function acquisitionRows(units: AcquisitionUnit[], dimension: AcquisitionDimension) {
  const grouped = new Map<string, AcquisitionUnit[]>()
  for (const unit of units) {
    const key = acquisitionKey(unit, dimension)
    const group = grouped.get(key) ?? []
    group.push(unit)
    grouped.set(key, group)
  }
  return [...grouped].map(([name, members]) => ({ name, members, ...acquisitionTotals(members) })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

const slug = /^[a-z0-9][a-z0-9_-]{0,63}$/
export function campaignExample({ page, source, medium, campaign, content }: { page: string; source: string; medium: string; campaign: string; content: string }) {
  if (!["/regional-rankings", "/regional-statistics"].includes(page) || !["social", "email", "cpc", "referral"].includes(medium) || !slug.test(source) || !slug.test(campaign) || (content !== "" && !slug.test(content))) return null
  const url = new URL(page, "https://pinoycubers.org")
  url.searchParams.set("utm_source", source)
  url.searchParams.set("utm_medium", medium)
  url.searchParams.set("utm_campaign", campaign)
  if (content) url.searchParams.set("utm_content", content)
  return url.href
}

export function acquisitionCsv(rows: ReturnType<typeof acquisitionRows>, scope: AcquisitionScope, period: string, device: string, denominator: number) {
  const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`
  const lines: (string | number)[][] = [
    ["SAMPLE DATA ONLY — invented, not Google Analytics results"],
    ["scope", scope === "session" ? "session acquisition" : "first acquisition of new browser identities"],
    ["sample period", period, "device", device, "whole-scope denominator", denominator],
    ["group", "units", "sessions", "engaged units", "filter-use units", "region-submission units", "share of whole scope", "engaged rate", "filter-use rate", "submission rate"],
    ...rows.map(r => [r.name, r.count, r.sessions, r.engaged, r.filterUsed, r.submitted, denominator ? r.count / denominator : "", r.count ? r.engaged / r.count : "", r.count ? r.filterUsed / r.count : "", r.count ? r.submitted / r.count : ""]),
  ]
  return lines.map(line => line.map(quote).join(",")).join("\n")
}
