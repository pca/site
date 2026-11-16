/** Deterministic synthetic sessions for layout review; never send these to GA4. */
export const SAMPLE_END = "2026-10-20"
export type Device = "all" | "mobile" | "desktop"
export type Journey = "onboarding" | "insights"
export type UxTab = "overview" | "journeys" | "features" | "setup"

export const featureDefinitions = [
  { name: "Regional Rankings", path: "/regional-rankings", event: "rankings_filter_changed", action: "Changed an event or region", status: "Existing page" },
  { name: "Regional Statistics", path: "/regional-statistics", event: "statistics_view_changed", action: "Changed a statistics view", status: "Existing page" },
  { name: "Performance Report", path: "/performance", event: "report_history_opened", action: "Opened exact historical results", status: "Concept preview" },
  { name: "Competition Highlights", path: "/insights", event: "highlight_opened", action: "Opened a highlight", status: "Concept preview" },
  { name: "Region Pulse", path: "/region-pulse", event: "region_followed", action: "Followed a region in this browser", status: "Concept preview" },
] as const

export const journeyDefinitions = {
  onboarding: {
    title: "Set a home region",
    description: "An ordered journey within one session, beginning when the login prompt is actually visible.",
    labels: ["Saw region prompt", "Started WCA login", "Completed WCA login", "Submitted region"],
    events: ["region_prompt_viewed", "wca_login_started", "wca_login_completed", "region_request_submitted"],
  },
  insights: {
    title: "Explore a performance report",
    description: "An ordered journey within one session. An interaction indicates exploration; it does not prove comprehension.",
    labels: ["Viewed report", "Changed event", "Opened history", "Opened official source"],
    events: ["report_viewed", "report_event_changed", "report_history_opened", "official_source_opened"],
  },
} as const

const sessions = Array.from({ length: 28 }, (_, day) =>
  Array.from({ length: 84 + (day * 17 % 63) }, (_, index) => {
    const seed = day * 131 + index * 37
    const mobile = seed % 10 < 7
    const device = mobile ? "mobile" : "desktop"
    const feature = seed % 5
    const onboarding = seed % 100 < 64
    const loginStarted = onboarding && seed % 100 < (mobile ? 31 : 43)
    const loginCompleted = loginStarted && seed % 100 < (mobile ? 24 : 35)
    const submitted = loginCompleted && seed % 100 < (mobile ? 15 : 25)
    const report = feature === 2
    return {
      day, device, feature, returning: seed % 100 < 29,
      engaged: seed % 100 < (mobile ? 57 : 72),
      interacted: seed % 100 < (mobile ? 49 : 65),
      seconds: 20 + seed % 205,
      source: seed % 10 < 4 ? "Direct" : seed % 10 < 7 ? "Organic search" : seed % 10 < 9 ? "Social" : "Referral",
      onboarding: [onboarding, loginStarted, loginCompleted, submitted],
      insights: [report, report && seed % 100 < 75, report && seed % 100 < 45, report && seed % 100 < 23],
    }
  }),
).flat()

export const percent = (value: number, total: number) => total ? value / total * 100 : 0
export const rate = (value: number, total: number) => `${percent(value, total).toFixed(1)}%`
export const number = (value: number) => value.toLocaleString("en-US")

export function previewReport(days: number, device: Device) {
  const selected = sessions.filter(s => s.day >= 28 - days && (device === "all" || s.device === device))
  const total = selected.length
  const count = (predicate: (session: typeof sessions[number]) => boolean) => selected.filter(predicate).length
  return {
    total,
    engaged: count(s => s.engaged),
    returning: count(s => s.returning),
    averageSeconds: Math.round(selected.reduce((sum, s) => sum + s.seconds, 0) / (total || 1)),
    mobile: count(s => s.device === "mobile"),
    daily: Array.from({ length: days }, (_, index) => {
      const day = 28 - days + index
      const date = new Date(`${SAMPLE_END}T00:00:00Z`)
      date.setUTCDate(date.getUTCDate() - (27 - day))
      return { date: date.toISOString().slice(0, 10), sessions: count(s => s.day === day), engaged: count(s => s.day === day && s.engaged) }
    }),
    journeys: {
      onboarding: [0, 1, 2, 3].map(step => count(s => s.onboarding[step])),
      insights: [0, 1, 2, 3].map(step => count(s => s.insights[step])),
    },
    features: featureDefinitions.map((feature, index) => ({ ...feature, views: count(s => s.feature === index), actions: count(s => s.feature === index && s.interacted) })),
    sources: ["Direct", "Organic search", "Social", "Referral"].map(name => ({ name, count: count(s => s.source === name) })),
  }
}

export const experiments = [
  { id: "region-copy", name: "Make the next step clearer", area: "Region onboarding", hypothesis: "Explaining why a home region matters will help more visitors complete their region submission.", control: "Want to see your regional rank here?", variant: "Find your place in the cubing community", metric: "Region submission per exposed visitor", event: "region_request_submitted", a: [420, 63], b: [418, 74], guardrail: "WCA login error rate", task: "Choose your home region after signing in with WCA." },
  { id: "report-order", name: "Lead with the performance story", area: "Performance Report", hypothesis: "A short performance summary above the charts will help visitors discover their competition history.", control: "Charts first", variant: "Performance summary first", metric: "History opens per exposed visitor", event: "report_history_opened", a: [180, 54], b: [176, 61], guardrail: "Report load time", task: "Find out how the latest competition compares with previous competitions." },
  { id: "filter-label", name: "Use a more familiar filter label", area: "Regional Rankings", hypothesis: "Using Home region instead of Region will make the rankings filter easier to understand.", control: "Region", variant: "Home region", metric: "Filter use per exposed visitor", event: "rankings_filter_changed", a: [302, 116], b: [306, 125], guardrail: "Empty-result rate", task: "Find 3×3 average rankings for your home region." },
] as const
