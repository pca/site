/** Version-two fixtures. Everything here is invented; no visitor/account data. */
export const workspaceSections = [
  { id: "summary", label: "Summary", question: "What needs attention?" },
  { id: "pages", label: "Pages & audience", question: "What are visitors viewing, and where do they come from?" },
  { id: "acquisition", label: "Acquisition", question: "Which sources bring visits that lead to useful activity?" },
  { id: "features", label: "Features", question: "Are features being discovered and used?" },
  { id: "journeys", label: "Journeys", question: "Where do visitors continue or stop?" },
  { id: "retention", label: "Retention", question: "Do visitors come back in later weeks?" },
  { id: "feedback", label: "Feedback & issues", question: "What are visitors telling us?" },
  { id: "experiments", label: "Experiments", question: "Which change should we test?" },
] as const
export type WorkspaceSection = typeof workspaceSections[number]["id"] | "settings"
export type WorkspaceDevice = "all" | "mobile" | "desktop"
export interface WorkspaceSearch { device: WorkspaceDevice; days: 7 | 28; item?: string }
export const defaultWorkspaceSearch: WorkspaceSearch = { device: "all", days: 28 }
export function workspaceSearch(input: Record<string, unknown>): WorkspaceSearch {
  const item = typeof input.item === "string" && /^(FB-\d{3}|region-copy|filter-label|score-help)$/.test(input.item) ? input.item : undefined
  return { device: input.device === "mobile" || input.device === "desktop" ? input.device : "all", days: Number(input.days) === 7 ? 7 : 28, ...(item ? { item } : {}) }
}
export const fmt = (n: number) => n.toLocaleString("en-US")
export const ratio = (n: number, d: number) => d ? `${(100 * n / d).toFixed(1)}%` : "—"
export const weeks = ["2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12"]
const dayDate = (day: number) => new Date(Date.UTC(2026, 7, 24 + day)).toISOString().slice(0, 10)
const events = ["333", "222", "444", "pyram", "skewb"] as const
const initialEvents = ["333", "333", "333", "333", "222", "222", "444", "pyram", "skewb"] as const
export const eventLabels: Record<string, string> = { "333": "3×3", "222": "2×2", "444": "4×4", pyram: "Pyraminx", skewb: "Skewb" }
export const pageDefinitions = [
  { id: "rankings", name: "Regional Rankings", path: "/regional-rankings", goal: "Explore an event or region" },
  { id: "statistics", name: "Regional Statistics", path: "/regional-statistics", goal: "Compare regions and understand scores" },
] as const
export type PageId = typeof pageDefinitions[number]["id"]
export const featureCatalogue = [
  { id: "filters", name: "Ranking filters", page: "rankings", action: "Changed event, region or result type", opportunity: "Opened Rankings", event: "rankings_filter_changed" },
  { id: "region", name: "Home-region prompt", page: "rankings", action: "Started WCA login", opportunity: "Unauthenticated Rankings session", event: "wca_login_started" },
  { id: "tabs", name: "Statistics views", page: "statistics", action: "Changed the statistics tab", opportunity: "Opened Statistics", event: "statistics_view_changed" },
  { id: "help", name: "Score explanation", page: "statistics", action: "Expanded the score explanation", opportunity: "Opened Statistics", event: "explanation_opened (proposed)" },
] as const
export type FeatureId = typeof featureCatalogue[number]["id"]
export interface TrafficSource { channel: string; source: string; medium: string; campaign: string | null; tagged: boolean }
/** Fictional processed source labels; not a reimplementation of GA4 attribution. */
export const trafficSources: TrafficSource[] = [
  { channel: "Direct", source: "(direct)", medium: "(none)", campaign: null, tagged: false },
  { channel: "Organic Search", source: "google", medium: "organic", campaign: null, tagged: false },
  { channel: "Organic Search", source: "bing", medium: "organic", campaign: null, tagged: false },
  { channel: "Organic Social", source: "facebook", medium: "social", campaign: "regional-rankings-launch", tagged: true },
  { channel: "Organic Social", source: "instagram", medium: "social", campaign: "regional-rankings-launch", tagged: true },
  { channel: "Referral", source: "worldcubeassociation.org", medium: "referral", campaign: null, tagged: false },
  { channel: "Email", source: "pca_newsletter", medium: "email", campaign: "october-community-update", tagged: true },
  { channel: "Paid Search", source: "google", medium: "cpc", campaign: "rankings-search-pilot", tagged: true },
  { channel: "Unassigned", source: "(not set)", medium: "(not set)", campaign: null, tagged: false },
]
const sourceWeights = [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 3, 3, 4, 5, 5, 6, 6, 7, 8]
export interface ContentView { page: PageId; event: string; region: string; format: "single" | "average"; entry: boolean }
export interface SampleSession {
  id: string; identity: string; day: number; device: "mobile" | "desktop"; channel: string; acquisition: TrafficSource; engaged: boolean;
  pages: PageId[]; content: ContentView[]; eligible: FeatureId[]; exposed: FeatureId[]; used: FeatureId[]; onboarding: boolean[]
}
export const sampleIdentities = weeks.flatMap((week, cohort) => Array.from({ length: 60 + cohort * 7 }, (_, index) => {
  const seed = index * 43 + cohort * 71
  return {
    id: `${cohort}-${index}`, week, cohort, seed,
    device: (seed * 17 + 23) % 101 < 71 ? "mobile" as const : "desktop" as const,
    active: Array.from({ length: 8 - cohort }, (_, offset) => offset === 0 || (seed + offset * 29) % 100 < Math.max(12, 47 - offset * 4)),
  }
}))
export const sampleSessions: SampleSession[] = sampleIdentities.flatMap(person => person.active.flatMap((active, offset) => !active ? [] : Array.from({ length: 1 + (person.seed + offset) % 3 }, (_, visit) => {
  const seed = person.seed + offset * 113 + visit * 47
  const startsRanking = seed % 5 !== 0
  const pages: PageId[] = startsRanking ? (seed % 3 === 0 ? ["rankings", "statistics"] : ["rankings"]) : (seed % 4 === 0 ? ["statistics", "rankings"] : ["statistics"])
  const eligible: FeatureId[] = [], exposed: FeatureId[] = [], used: FeatureId[] = []
  if (pages.includes("rankings")) {
    eligible.push("filters")
    if (seed % 10 < 9) { exposed.push("filters"); if (seed % 100 < (person.device === "mobile" ? 40 : 61)) used.push("filters") }
    if (seed % 4 !== 0) {
      eligible.push("region")
      if (seed % 10 < 6) { exposed.push("region"); if (seed % 100 < 29) used.push("region") }
    }
  }
  if (pages.includes("statistics")) {
    eligible.push("tabs", "help")
    if (seed % 10 < 9) { exposed.push("tabs"); if (seed % 100 < 52) used.push("tabs") }
    if ((seed * 7) % 10 < 4) { exposed.push("help"); if (seed % 100 < 48) used.push("help") }
  }
  const content = pages.flatMap(page => {
    const first: ContentView = { page, event: initialEvents[(seed * 13 + Math.floor(seed / 7)) % initialEvents.length], region: seed % 3 === 0 ? "NCR" : "PH", format: seed % 2 === 0 ? "single" : "average", entry: true }
    return page === "rankings" && used.includes("filters") ? [first, { ...first, event: events[(events.findIndex(event => event === first.event) + 1) % events.length], entry: false }] : [first]
  })
  const prompt = exposed.includes("region"), started = used.includes("region"), completed = started && seed % 100 < 23, submitted = completed && seed % 100 < 14
  const acquisition = trafficSources[sourceWeights[(seed * 37 + Math.floor(seed / 11)) % sourceWeights.length]]
  return { id: `${person.id}-${offset}-${visit}`, identity: person.id, day: (person.cohort + offset) * 7 + (seed % 7), device: person.device, channel: acquisition.channel, acquisition, engaged: seed % 100 < 66, pages, content, eligible, exposed, used, onboarding: [prompt, started, completed, submitted] }
})))

export function workspaceReport(search: WorkspaceSearch) {
  const sessions = sampleSessions.filter(s => s.day >= 56 - search.days && (search.device === "all" || s.device === search.device))
  const count = (fn: (s: SampleSession) => boolean) => sessions.filter(fn).length
  const total = sessions.length
  const pages = pageDefinitions.map(p => ({ ...p, views: sessions.reduce((n, s) => n + s.pages.filter(id => id === p.id).length, 0), sessions: count(s => s.pages.includes(p.id)), entries: count(s => s.pages[0] === p.id) }))
  const features = featureCatalogue.map(f => ({ ...f, eligible: count(s => s.eligible.includes(f.id)), exposed: count(s => s.exposed.includes(f.id)), used: count(s => s.used.includes(f.id)) }))
  const paths = ["rankings", "statistics", "rankings,statistics", "statistics,rankings"].map(path => ({ pages: path.split(",") as PageId[], count: count(s => s.pages.join(",") === path) })).sort((a, b) => b.count - a.count)
  return {
    sessions, total, people: new Set(sessions.map(s => s.identity)).size, engaged: count(s => s.engaged), pageviews: pages.reduce((n, p) => n + p.views, 0), pages, features, paths,
    onboarding: [0, 1, 2, 3].map(step => count(s => s.onboarding[step])),
    daily: Array.from({ length: search.days }, (_, i) => { const day = 56 - search.days + i; return { date: dayDate(day), count: count(s => s.day === day) } }),
    devices: ["mobile", "desktop"].map(device => ({ name: device === "mobile" ? "Mobile" : "Desktop", count: count(s => s.device === device) })),
    channels: [...new Set(trafficSources.map(s => s.channel))].map(name => ({ name, count: count(s => s.channel === name) })).sort((a, b) => b.count - a.count),
    start: dayDate(56 - search.days), end: dayDate(55),
  }
}
export type WorkspaceReport = ReturnType<typeof workspaceReport>

export function retentionReport(device: WorkspaceDevice) {
  const people = sampleIdentities.filter(p => device === "all" || p.device === device)
  const rows = weeks.map((week, cohort) => {
    const members = people.filter(p => p.cohort === cohort)
    return { week, size: members.length, counts: Array.from({ length: 8 }, (_, offset) => offset < 8 - cohort ? members.filter(p => p.active[offset]).length : null) }
  })
  const at = (offset: number) => rows.reduce((r, row) => row.counts[offset] === null ? r : { active: r.active + row.counts[offset]!, eligible: r.eligible + row.size }, { active: 0, eligible: 0 })
  return { rows, people: people.length, week1: at(1), week4: at(4) }
}

export const issueCategories = ["All types", "Data issue", "Confusing interface", "Suggestion", "Usefulness"] as const
export type IssueStatus = "New" | "Reviewing" | "Resolved"
export const issueSamples = [
  { id: "FB-108", type: "Data issue", page: "rankings", title: "My region looks out of date", text: "My profile shows NCR, but this result still appears under my previous region.", event: "333", region: "NCR", format: "average", device: "Mobile", date: "Oct 18", snapshot: "demo-export-2026-10-18", status: "New" as IssueStatus, theme: "Region data", themeSource: "Visitor-selected category; suggested theme needs review", experiment: "region-copy" },
  { id: "FB-107", type: "Confusing interface", page: "statistics", title: "What goes into the regional score?", text: "I can see the score, but I am not sure whether a smaller number is better.", event: "333", region: "PH", format: "average", device: "Desktop", date: "Oct 18", snapshot: "demo-export-2026-10-18", status: "Reviewing" as IssueStatus, theme: "Score explanation", themeSource: "Rule-based suggestion; not a confirmed diagnosis", experiment: "score-help" },
  { id: "FB-106", type: "Suggestion", page: "rankings", title: "Keep my last event selected", text: "I usually check 2×2. Could the site remember that the next time I open it?", event: "222", region: "PH", format: "single", device: "Mobile", date: "Oct 17", snapshot: "demo-export-2026-10-18", status: "New" as IssueStatus, theme: "Saved preferences", themeSource: "Rule-based suggestion; not a confirmed diagnosis", experiment: null },
  { id: "FB-105", type: "Usefulness", page: "rankings", title: "Useful — easier to compare my home region", text: "The average rankings are what I check most often.", event: "333", region: "NCR", format: "average", device: "Desktop", date: "Oct 16", snapshot: "demo-export-2026-10-18", status: "Resolved" as IssueStatus, theme: "Positive feedback", themeSource: "Visitor-selected usefulness answer", experiment: null },
  { id: "FB-104", type: "Confusing interface", page: "rankings", title: "I missed the region selector", text: "I changed the event but did not notice I could also change the region.", event: "444", region: "PH", format: "single", device: "Mobile", date: "Oct 15", snapshot: "demo-export-2026-10-18", status: "New" as IssueStatus, theme: "Filter discovery", themeSource: "Rule-based suggestion; not a confirmed diagnosis", experiment: "filter-label" },
  { id: "FB-103", type: "Data issue", page: "statistics", title: "Please check this contributor list", text: "I expected a different competitor in this region's contributing results.", event: "pyram", region: "NCR", format: "average", device: "Desktop", date: "Oct 14", snapshot: "demo-export-2026-10-18", status: "Reviewing" as IssueStatus, theme: "Contributors", themeSource: "Visitor-selected category; suggested theme needs review", experiment: null },
] as const
export const experimentSamples = [
  { id: "region-copy", title: "Clarify the region setup steps", area: "Home-region prompt", status: "Draft", hypothesis: "Explaining that WCA login and region submission are separate steps may improve completed submissions.", control: "Current prompt", variant: "Prompt with the three setup steps", outcome: "Region submitted within the same exposed session", guardrail: "Login failures per login-start session", exposure: "First visible prompt after a stable 50/50 browser assignment", a: [420, 63], b: [418, 74], issue: "FB-108" },
  { id: "filter-label", title: "Make the region filter easier to find", area: "Ranking filters", status: "Results example", hypothesis: "An explicit Filter by region label may increase filter use among sessions exposed to the control.", control: "Region", variant: "Filter by region", outcome: "Region filter used within the same exposed session", guardrail: "Empty-result sessions and mobile layout errors", exposure: "First visible filter after a stable 50/50 browser assignment", a: [302, 116], b: [306, 125], issue: "FB-104" },
  { id: "score-help", title: "Explain lower scores beside the chart", area: "Score explanation", status: "Draft", hypothesis: "Putting a short score definition near the result may reduce reported confusion. Opening help alone would not prove understanding.", control: "Question-mark explanation", variant: "Short inline definition plus details", outcome: "Useful answer among respondents after chart exposure", guardrail: "Page speed and feedback response rate", exposure: "First visible chart after a stable 50/50 browser assignment", a: [250, 42], b: [248, 46], issue: "FB-107" },
] as const

export const previewLibrary = [
  { group: "Current · workspace 04", links: [
    { label:"Overview", href:"/admin/analytics-workbench/overview", note:"Guide · workflow and implementation map" },
    { label:"Pages & audience", href:"/admin/analytics-workbench/pages", note:"Coded core · pages, technology and event/region content views" },
    { label:"Audience technology", href:"/admin/analytics-workbench/pages?view=audience", note:"Devices, operating systems, browsers and device brands" },
    { label:"Event & region content", href:"/admin/analytics-workbench/pages?view=content", note:"Cubing events, selected content regions and combined breakdowns" },
    { label:"Acquisition", href:"/admin/analytics-workbench/acquisition", note:"Coded core · sources, campaigns, landing pages and analysis log" },
    { label:"Campaign link builder", href:"/admin/campaigns", note:"UTM builder · saved browser-local links and CSV" },
    { label:"Feature discovery", href:"/admin/analytics-workbench/features", note:"Coded lightweight report · exposure and use signals" },
    { label:"Journeys", href:"/admin/analytics-workbench/journeys", note:"Fixed ordered user funnels · Google verification pending" },
    { label:"Retention", href:"/admin/analytics-workbench/retention", note:"Returning starting groups · complete Sunday weeks and recognition limits" },
    { label:"Feedback & issues", href:"/admin/analytics-workbench/feedback", note:"Account-submitted reports · private staff inbox and review history" },
    { label:"Release impact", href:"/admin/analytics-workbench/releases", note:"Implemented · equal complete before/after windows and traffic mix" },
    { label:"Experiments", href:"/admin/analytics-workbench/experiments", note:"Saved test plans, sample-size estimates and results worksheet · no delivery" },
    { label:"Measurement", href:"/admin/analytics-workbench/measurement", note:"Coded core · server setup, definitions and validation" },
  ] },
  { group: "Earlier · workspace 02", links: [...workspaceSections.map(s => ({ label: s.label, href: `/admin/analytics/${s.id}`, note: s.question })), { label: "Settings & measurement", href: "/admin/analytics/settings", note: "Sources, definitions, measurement health and release notes" }] },
  { group: "Earlier · analytics and experiments", links: [
    { label:"Feature discovery concept", href:"/admin/analytics-feature-concept", note:"Earlier eligible → exposed → used concept; sample only" },
    { label: "Overview", href: "/admin/ux-analytics?tab=overview", note: "First analytics layout" },
    { label: "Journeys", href: "/admin/ux-analytics?tab=journeys", note: "First funnel examples" },
    { label: "Feature usage", href: "/admin/ux-analytics?tab=features", note: "First usage table" },
    { label: "GA4 setup", href: "/admin/ux-analytics?tab=setup", note: "Earlier integration notes" },
    { label: "Experiments", href: "/admin/experiments", note: "First A/B concepts" },
  ] },
  { group: "Earlier · UX example collection", links: [
    { label: "All UX examples", href: "/admin/ux-examples", note: "Earlier gallery" },
    { label: "Audience", href: "/admin/ux-examples/audience", note: "Audience and experience segments" },
    { label: "Retention", href: "/admin/ux-examples/retention", note: "Earlier weekly cohorts" },
    { label: "Usability studies", href: "/admin/ux-examples/usability", note: "Moderated study example · deferred workflow" },
    { label: "Feedback", href: "/admin/ux-examples/feedback", note: "Earlier response inbox" },
    { label: "Experience quality", href: "/admin/ux-examples/quality", note: "Performance and manual accessibility examples" },
  ] },
] as const
