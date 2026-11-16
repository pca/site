import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const data = JSON.parse(readFileSync(resolve(root, "apps/web/src/data/insights-preview.json"), "utf8"))
const query = sql => JSON.parse(execFileSync("sqlite3", ["-readonly", "-json", resolve(root, "apps/api/data/pca.sqlite3"), sql], { maxBuffer: 64 * 1024 * 1024 }).toString() || "[]")
const rows = query(`SELECT r.person_id person,r.event_id event,r.average, r.pos place, rt.final,
  c.id competition, c.country_id country, printf('%04d-%02d-%02d',c.year,c.month,c.day) date
  FROM wca_result r JOIN wca_competition c ON c.id=r.competition_id
  JOIN wca_roundtype rt ON rt.id=r.round_type_id WHERE r.country_id='Philippines'`)
const same = (row, story) => row.person === story.person && row.event === story.event
const median = values => { const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2 }

test("windows use actual result dates and independently match competition and participant counts", () => {
  const local = rows.filter(row => row.country === "Philippines")
  assert.equal(data.latestResultDate, local.map(row => row.date).sort().at(-1))
  for (const period of data.periods) {
    assert.equal((Date.parse(period.end) - Date.parse(period.start)) / 86400000 + 1, period.days)
    const recent = local.filter(row => row.date >= period.start && row.date <= period.end)
    assert.equal(period.participants, new Set(recent.map(row => row.person)).size)
    assert.equal(period.competitions, new Set(recent.map(row => row.competition)).size)
    const first = new Map()
    for (const row of rows) if (!first.has(row.person) || row.date < first.get(row.person)) first.set(row.person, row.date)
    assert.equal(period.newcomers, new Set(recent.filter(row => first.get(row.person) >= period.start).map(row => row.person)).size)
    const timed = new Set(["333", "222", "444", "555", "666", "777", "333oh", "clock", "minx", "pyram", "skewb", "sq1"])
    const pbs = new Set()
    for (const row of recent.filter(row => timed.has(row.event) && row.average > 0)) {
      const previous = rows.filter(previous => same(previous, row) && previous.date < row.date && previous.average > 0)
      if (previous.length && row.average < Math.min(...previous.map(previous => previous.average))) pbs.add(`${row.person}|${row.event}`)
    }
    assert.equal(period.averagePbs, pbs.size)
  }
})

test("stories agree with public source results, including final averages and less-entered events", () => {
  for (const period of data.periods) for (const story of period.stories) {
    assert.ok(story.date >= period.start && story.date <= period.end)
    const current = rows.filter(row => same(row, story) && row.competition === story.competition && row.average > 0)
    assert.ok(current.length)
    if (story.kind === "podium") {
      assert.ok(current.some(row => row.final && row.place === story.place && row.average === story.average))
      continue
    }
    assert.equal(Math.min(...current.map(row => row.average)), story.average)
    const previous = rows.filter(row => same(row, story) && row.date < story.date && row.average > 0)
    if (story.kind === "debut") {
      assert.equal(rows.some(row => row.person === story.person && row.date < period.start), false)
      continue
    }
    assert.equal(story.previousCompetitions, new Set(previous.map(row => row.competition)).size)
    assert.ok(story.previousCompetitions >= 3)
    assert.equal(story.prior, Math.min(...previous.map(row => row.average)))
    assert.equal(story.improvement, Math.round((story.prior - story.average) / story.prior * 1000) / 10)
    assert.ok(story.improvement > 0)
    if (story.kind === "new-strength") {
      assert.ok(story.improvement >= 10)
      assert.notEqual(story.primaryEvent, story.event)
      const other = rows.filter(row => row.person === story.person && row.event === story.primaryEvent && row.date < period.start && row.average > 0)
      assert.ok(new Set(other.map(row => row.competition)).size > story.previousCompetitions)
    }
  }
})

test("profile baselines and charts agree with source competition-best averages", () => {
  assert.equal(new Set(data.profiles.map(profile => profile.id)).size, data.profiles.length)
  for (const profile of data.profiles) for (const event of profile.events) {
    const source = rows.filter(row => row.person === profile.id && row.event === event.id && row.average > 0)
    const grouped = [...Map.groupBy(source, row => row.competition).values()].map(group => ({ date: group[0].date, competition: group[0].competition, average: Math.min(...group.map(row => row.average)) })).sort((a, b) => a.date.localeCompare(b.date) || a.competition.localeCompare(b.competition))
    assert.equal(event.bestAverage, Math.min(...source.map(row => row.average)))
    assert.equal(event.appearances, grouped.length)
    const before = grouped.filter(point => point.date < event.latest.date)
    assert.equal(event.latest.baseline, before.length ? median(before.slice(-5).map(point => point.average)) : null)
    for (const point of event.history) assert.ok(grouped.some(item => item.competition === point.competition && item.average === point.average))
  }
})
