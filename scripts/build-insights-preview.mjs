// Build a small, static design-preview dataset from public results only.
// This reads the existing local database without changing or syncing it.
import { execFileSync } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const db = resolve(root, "apps/api/data/pca.sqlite3")
const query = sql => JSON.parse(execFileSync("sqlite3", ["-readonly", "-json", db, sql], { maxBuffer: 128 * 1024 * 1024 }).toString() || "[]")
const snapshot = query("SELECT export_version, latest_year FROM api_statisticssnapshot WHERE is_active=1")[0]
const rows = query(`SELECT r.person_id person, r.person_name name, r.event_id event,
  e.name eventName, r.average, r.best single, r.pos place, rt.name round, rt.final,
  r.value1, r.value2, r.value3, r.value4, r.value5,
  c.id competition, c.name competitionName, c.city_name city, c.country_id country,
  printf('%04d-%02d-%02d',c.year,c.month,c.day) date, a.region_code hostRegion
  FROM wca_result r JOIN wca_competition c ON c.id=r.competition_id
  JOIN wca_event e ON e.id=r.event_id JOIN wca_roundtype rt ON rt.id=r.round_type_id
  LEFT JOIN wca_competitionregionassignment a ON a.competition_id=c.id AND a.status='assigned'
  WHERE r.person_id IS NOT NULL AND r.country_id='Philippines'
  ORDER BY c.year,c.month,c.day,c.id,rt.rank,r.id`)
const homes = new Map(query(`SELECT wca_id, MIN(region) region FROM api_user
  WHERE wca_id IS NOT NULL AND region IS NOT NULL AND region!=''
  GROUP BY wca_id HAVING COUNT(DISTINCT region)=1`).map(r => [r.wca_id, r.region]))
const timed = new Set(["333", "222", "444", "555", "666", "777", "333oh", "clock", "minx", "pyram", "skewb", "sq1"])
const median = values => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
}
const firstDate = new Map()
const names = new Map()
const entries = new Map()
const personCompetitions = new Map()
for (const row of rows) {
  if (!firstDate.has(row.person)) firstDate.set(row.person, row.date)
  names.set(row.person, row.name)
  if (!personCompetitions.has(row.person)) personCompetitions.set(row.person, new Set())
  personCompetitions.get(row.person).add(row.competition)
  if (!timed.has(row.event) || row.average <= 0) continue
  const key = `${row.person}|${row.event}|${row.competition}`
  if (!entries.has(key)) entries.set(key, { ...row, rounds: [], average: Infinity, single: Infinity })
  const item = entries.get(key)
  item.average = Math.min(item.average, row.average)
  if (row.single > 0) item.single = Math.min(item.single, row.single)
  item.rounds.push({ name: row.round, average: row.average, place: row.place, final: Boolean(row.final), solves: [row.value1, row.value2, row.value3, row.value4, row.value5].filter(v => v !== 0) })
}
const histories = new Map()
const changes = []
for (const item of entries.values()) {
  const key = `${item.person}|${item.event}`
  if (!histories.has(key)) histories.set(key, [])
  const history = histories.get(key)
  // Same-day competitions do not establish a reliable before/after ordering.
  const before = history.filter(r => r.date < item.date)
  const prior = before.length ? Math.min(...before.map(r => r.average)) : null
  const baseline = before.length ? median(before.slice(-5).map(r => r.average)) : null
  const enriched = { ...item, prior, baseline, previousCompetitions: before.length,
    improvement: prior && item.average < prior ? (prior - item.average) / prior * 100 : 0 }
  history.push(enriched)
  if (item.country === "Philippines") changes.push(enriched)
}
const localRows = rows.filter(r => r.country === "Philippines")
const end = localRows.at(-1).date
const daysBefore = days => {
  const date = new Date(`${end}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}
const story = (r, kind) => ({ person: r.person, name: names.get(r.person), event: r.event, eventName: r.eventName,
  competition: r.competition, competitionName: r.competitionName, date: r.date, city: r.city,
  homeRegion: homes.get(r.person) || null, hostRegion: r.hostRegion || null, kind,
  average: r.average, prior: r.prior, improvement: Math.round(r.improvement * 10) / 10,
  previousCompetitions: r.previousCompetitions, primaryEvent: null, place: null })
const periods = [7, 28].map(days => {
  const start = daysBefore(days - 1)
  const recentRows = localRows.filter(r => r.date >= start)
  const recent = changes.filter(r => r.date >= start)
  const improvements = recent.filter(r => r.improvement > 0 && r.previousCompetitions >= 3)
    .sort((a, b) => b.improvement - a.improvement)
  const stories = []
  const seen = new Set()
  const add = item => { const key = `${item.person}|${item.event}|${item.kind}`; if (!seen.has(key)) { seen.add(key); stories.push(item) } }
  for (const r of improvements.slice(0, 12)) add(story(r, "improvement"))
  for (const r of improvements.filter(r => r.improvement >= 10)) {
    const priorEvents = [...histories.entries()].filter(([key]) => key.startsWith(`${r.person}|`))
      .map(([key, h]) => ({ event: key.split("|")[1], name: h[0].eventName, count: h.filter(i => i.date < start).length }))
      .sort((a, b) => b.count - a.count)
    const primary = priorEvents[0]
    if (primary && primary.event !== r.event && primary.count > r.previousCompetitions) {
      add({ ...story(r, "new-strength"), primaryEvent: primary.event })
    }
  }
  const newcomers = new Set(recentRows.filter(r => firstDate.get(r.person) >= start).map(r => r.person))
  for (const person of [...newcomers].slice(0, 4)) {
    const r = recent.find(item => item.person === person)
    if (r) add(story(r, "debut"))
  }
  for (const r of recent.filter(r => r.rounds.some(round => round.final && round.place <= 3)).slice(0, 6)) {
    const final = r.rounds.find(round => round.final && round.place <= 3)
    add({ ...story(r, "podium"), average: final.average, place: final.place })
  }
  const participants = new Set(recentRows.map(r => r.person))
  return { days, start, end, participants: participants.size, competitions: new Set(recentRows.map(r => r.competition)).size,
    newcomers: newcomers.size, averagePbs: new Set(recent.filter(r => r.improvement > 0).map(r => `${r.person}|${r.event}`)).size,
    matchedHomeRegions: [...participants].filter(id => homes.has(id)).length,
    spotlight: improvements[0] ? story(improvements[0], "improvement") : null,
    stories: stories.sort((a, b) => b.date.localeCompare(a.date)) }
})
const profileIds = [...new Set(periods.flatMap(p => [p.spotlight?.person, ...p.stories.filter(s => s.kind === "new-strength").map(s => s.person), ...p.stories.map(s => s.person)]).filter(Boolean))].slice(0, 16)
const profiles = profileIds.map(id => ({ id, name: names.get(id), homeRegion: homes.get(id) || null,
  competitionCount: personCompetitions.get(id).size,
  events: [...histories.entries()].filter(([key]) => key.startsWith(`${id}|`)).map(([key, history]) => {
    const last = history.at(-1)
    return { id: key.split("|")[1], name: last.eventName, bestAverage: Math.min(...history.map(r => r.average)),
      bestSingle: Math.min(...history.map(r => r.single)), appearances: history.length,
      latest: { date: last.date, competition: last.competition, competitionName: last.competitionName, average: last.average,
        baseline: last.baseline, prior: last.prior, previousCompetitions: last.previousCompetitions, rounds: last.rounds },
      history: history.slice(-10).map(r => ({ date: r.date, average: r.average, competition: r.competition, name: r.competitionName })) }
  }).sort((a, b) => b.appearances - a.appearances) }))
const competitions = [...new Map(localRows.filter(r => r.date >= daysBefore(27)).map(r => [r.competition, {
  id: r.competition, name: r.competitionName, date: r.date, city: r.city, hostRegion: r.hostRegion,
}])).values()].reverse()
const output = { snapshot: snapshot.export_version, startYear: 2007, latestResultDate: end, periods, profiles, competitions }
const target = resolve(root, "apps/web/src/data/insights-preview.json")
await mkdir(dirname(target), { recursive: true })
await writeFile(target, JSON.stringify(output) + "\n")
console.log(`Preview: ${periods.map(p => `${p.days} days: ${p.stories.length} stories`).join("; ")}, ${profiles.length} profiles. Latest results: ${end}.`)
