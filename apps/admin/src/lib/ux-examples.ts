// Entirely invented records for exploring dashboard layouts and calculations.
// No records are derived from visitors, analytics accounts, or research sessions.
export type ExampleView = "audience" | "retention" | "usability" | "feedback" | "quality"
export const exampleViews = [
  { id: "audience", title: "Audience", description: "Compare devices, experience levels, and acquisition channels.", question: "Who is this experience working for?", icon: "◎", source: "Analytics + optional research segmentation" },
  { id: "retention", title: "Retention", description: "Explore weekly cohorts without counting unfinished weeks.", question: "Do people find a reason to come back?", icon: "↻", source: "Analytics or a cohort export" },
  { id: "usability", title: "Usability studies", description: "Inspect task success, time, ease, and participant observations.", question: "Can people complete the task?", icon: "✓", source: "Moderated or unmoderated research" },
  { id: "feedback", title: "Feedback", description: "Read, filter, and try prioritizing example survey responses.", question: "What are people telling us?", icon: "☷", source: "Survey or feedback collection" },
  { id: "quality", title: "Experience quality", description: "Review sample speed measurements and accessibility checks.", question: "What gets in the way of using the site?", icon: "◈", source: "Performance monitoring + manual checks" },
] as const

export const cohortWeeks = ["2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12"]
export const audiencePeople = cohortWeeks.flatMap((week, cohort) => Array.from({ length: 60 + cohort * 7 }, (_, index) => {
  const seed = index * 43 + cohort * 71
  const active = Array.from({ length: 8 - cohort }, (_, offset) => offset === 0 || (seed + offset * 29) % 100 < Math.max(12, 47 - offset * 4))
  return {
    id: `${cohort}-${index}`, cohort, week,
    device: (seed * 17 + 23) % 101 < 71 ? "mobile" : "desktop",
    experience: (seed * 29 + 41) % 103 < 41 ? "newcomer" : "regular",
    channel: ["Organic search", "Direct", "Social", "Referral"][seed % 4],
    active,
    sessions: active.reduce((sum, returned, offset) => sum + (returned ? 1 + (seed + offset) % 3 : 0), 0),
  }
}))
export type AudiencePerson = typeof audiencePeople[number]
export type ExperienceFilter = "all" | "newcomer" | "regular"
export const peopleFor = (experience: ExperienceFilter) => audiencePeople.filter(person => experience === "all" || person.experience === experience)
export function cohortCells(people: AudiencePerson[]) {
  return cohortWeeks.map((week, cohort) => {
    const members = people.filter(person => person.cohort === cohort)
    return { week, size: members.length, values: Array.from({ length: 8 }, (_, offset) => offset <= 7 - cohort ? members.filter(person => person.active[offset]).length : null) }
  })
}

export const studyTasks = [
  { id: "rankings", name: "Find a regional ranking", prompt: "Find the 3×3 average rankings for your home region.", finding: "Several sample participants looked for a region in the event menu.", recommendation: "Test clearer separation between the event and region controls." },
  { id: "baseline", name: "Understand a baseline", prompt: "Explain whether this competitor did better than their recent typical result.", finding: "Some sample participants interpreted the recent median as a personal best.", recommendation: "Test a brief example beside the baseline definition." },
  { id: "region", name: "Submit a home region", prompt: "Sign in with WCA and submit the region where you live.", finding: "Some sample participants expected WCA login to select their region automatically.", recommendation: "Explain the separate login and region submission steps." },
] as const
export const studyAttempts = studyTasks.flatMap((task, taskIndex) => Array.from({ length: 8 }, (_, index) => {
  const seed = index * 19 + taskIndex * 31
  const status = seed % 10 < 5 ? "independent" : seed % 10 < 8 ? "assisted" : "incomplete"
  return {
    task: task.id, participant: `P${String(index + 1).padStart(2, "0")}`, device: index % 3 === 0 ? "desktop" : "mobile",
    status, seconds: 24 + seed % 128, ease: status === "independent" ? 5 + seed % 3 : status === "assisted" ? 3 + seed % 3 : 1 + seed % 3,
    observation: status === "independent" ? "Completed without a hint; checked the result before finishing." : status === "assisted" ? "Paused at the key step; completed after a moderator hint." : "Stopped without reaching the requested outcome.",
  }
}))
export function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  if (!sorted.length) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export const feedbackExamples = [
  { id: "F01", feature: "Rankings", topic: "Findability", rating: 2, device: "mobile", text: "I found my event, but it took me a while to notice the region selector.", date: "2026-10-20" },
  { id: "F02", feature: "Performance Report", topic: "Comprehension", rating: 3, device: "desktop", text: "Is the baseline my personal best, or an average of my competitions?", date: "2026-10-20" },
  { id: "F03", feature: "Region onboarding", topic: "Expectations", rating: 2, device: "mobile", text: "After signing in, I thought my region would already be filled in.", date: "2026-10-19" },
  { id: "F04", feature: "Performance Report", topic: "Value", rating: 5, device: "mobile", text: "The competition history helps me see progress even when I miss a PB.", date: "2026-10-19" },
  { id: "F05", feature: "Regional Statistics", topic: "Comprehension", rating: 3, device: "desktop", text: "I want a clearer explanation of how a region's score is calculated.", date: "2026-10-18" },
  { id: "F06", feature: "Rankings", topic: "Accessibility", rating: 2, device: "mobile", text: "Some of the small text is hard for me to read.", date: "2026-10-18" },
  { id: "F07", feature: "Competition Highlights", topic: "Value", rating: 5, device: "desktop", text: "It is nice to see achievements from people who are not on the podium.", date: "2026-10-17" },
  { id: "F08", feature: "Region Pulse", topic: "Expectations", rating: 3, device: "mobile", text: "Will following a region send notifications, or only save a preference?", date: "2026-10-17" },
  { id: "F09", feature: "Performance Report", topic: "Findability", rating: 4, device: "mobile", text: "The exact result table was useful once I found it below the chart.", date: "2026-10-16" },
  { id: "F10", feature: "Rankings", topic: "Value", rating: 4, device: "desktop", text: "Switching between events is quick and easy.", date: "2026-10-16" },
  { id: "F11", feature: "Regional Statistics", topic: "Accessibility", rating: 2, device: "desktop", text: "I would like a text explanation alongside the colors in the chart.", date: "2026-10-15" },
  { id: "F12", feature: "Region onboarding", topic: "Expectations", rating: 3, device: "mobile", text: "I submitted my region. When should I check back for approval?", date: "2026-10-14" },
] as const
export type FeedbackStatus = "New" | "Reviewing" | "Reviewed"

export const qualityExamples = [
  { page: "Regional Rankings", mobile: { lcp: 2.8, inp: 215, cls: .08, requests: 800, failures: 12 }, desktop: { lcp: 1.7, inp: 145, cls: .03, requests: 450, failures: 3 } },
  { page: "Regional Statistics", mobile: { lcp: 3.2, inp: 245, cls: .12, requests: 570, failures: 14 }, desktop: { lcp: 2.1, inp: 170, cls: .04, requests: 300, failures: 2 } },
  { page: "Performance Report", mobile: { lcp: 2.3, inp: 185, cls: .05, requests: 250, failures: 2 }, desktop: { lcp: 1.5, inp: 120, cls: .02, requests: 180, failures: 1 } },
] as const
export const accessibilityExamples = [
  { area: "Keyboard navigation", task: "Use filters and reach the result table without a mouse.", status: "Needs review", note: "Sample observation: focus position after changing a filter needs investigation." },
  { area: "Chart alternatives", task: "Read the same information in an accessible table.", status: "Example pass", note: "Sample observation: a table alternative is available in the test scenario." },
  { area: "Text resizing", task: "Increase text size and check the controls and content.", status: "Needs review", note: "Sample observation: inspect long control labels at narrow widths." },
  { area: "Meaning beyond color", task: "Understand a region or status without relying on color alone.", status: "Needs review", note: "Sample observation: consider explicit labels alongside colored indicators." },
] as const
