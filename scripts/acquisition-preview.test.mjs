import assert from "node:assert/strict"
import { test } from "node:test"
import { sampleSessions, workspaceReport } from "../apps/admin/src/lib/analytics-workspace.ts"
import { acquisitionCsv, acquisitionKey, acquisitionRows, acquisitionTotals, acquisitionUnits, campaignExample } from "../apps/admin/src/lib/acquisition-preview.ts"

test("every acquisition breakdown partitions the same declared units", () => {
  for (const days of [7, 28]) for (const device of ["all", "mobile", "desktop"]) {
    const report = workspaceReport({ days, device })
    for (const scope of ["session", "first"]) {
      const units = acquisitionUnits(report.sessions, scope, sampleSessions)
      const total = acquisitionTotals(units)
      assert.ok(total.count > 0)
      assert.equal(new Set(units.map(u => u.id)).size, units.length)
      for (const dim of ["channel", "source", "campaign", "landing"]) {
        const rows = acquisitionRows(units, dim)
        for (const key of ["count", "sessions", "engaged", "filterUsed", "submitted", "tagged", "unknown"]) assert.equal(rows.reduce((n, r) => n + r[key], 0), total[key])
        for (const row of rows) {
          assert.ok(row.engaged <= row.count && row.filterUsed <= row.count && row.submitted <= row.count)
          assert.ok(row.members.every(unit => acquisitionKey(unit, dim) === row.name))
        }
      }
      if (scope === "session") {
        assert.equal(total.count, report.total)
        assert.equal(total.engaged, report.engaged)
        assert.equal(total.submitted, report.onboarding[3])
        for (const channel of report.channels) assert.equal(acquisitionRows(units, "channel").find(r => r.name === channel.name)?.count ?? 0, channel.count)
      }
    }
  }
})

test("first acquisition uses earliest-ever source, not earliest within the filter", () => {
  const report = workspaceReport({ days: 7, device: "all" })
  const units = acquisitionUnits(report.sessions, "first", sampleSessions)
  for (const unit of units) {
    const first = sampleSessions.filter(s => s.identity === unit.id).sort((a, b) => a.day - b.day || a.id.localeCompare(b.id))[0]
    assert.ok(first.day >= 49 && first.day <= 55)
    assert.deepEqual(unit.source, first.acquisition)
    assert.equal(unit.landing, first.pages[0])
    assert.ok(unit.sessions.every(s => s.day >= 49 && s.day <= 55 && s.identity === unit.id))
    assert.equal(unit.submitted, unit.sessions.some(s => s.onboarding[3]))
  }
  const expected = new Set(sampleSessions.filter(s => s.day >= 49).map(s => s.identity).filter(id => !sampleSessions.some(s => s.identity === id && s.day < 49)))
  assert.deepEqual(new Set(units.map(u => u.id)), expected)
  assert.ok(units.length < report.people, "returning browsers are excluded from this new-acquisition view")
})

test("source labels distinguish direct, unassigned, untagged and named campaigns", () => {
  const units = acquisitionUnits(workspaceReport({ days: 28, device: "all" }).sessions, "session", sampleSessions)
  const sources = acquisitionRows(units, "source")
  assert.ok(sources.some(s => s.name === "(direct) / (none)"))
  assert.ok(sources.some(s => s.name === "(not set) / (not set)"))
  assert.ok(sources.some(s => s.name === "google / organic"))
  assert.ok(sources.some(s => s.name === "google / cpc"))
  const campaigns = acquisitionRows(units, "campaign")
  assert.ok(campaigns.some(c => c.name === "No named campaign"))
  assert.ok(campaigns.some(c => c.name === "regional-rankings-launch"))
})

test("campaign builder permits only bounded non-personal naming examples and known landing pages", () => {
  const data = { page: "/regional-rankings", source: "pca_newsletter", medium: "email", campaign: "rankings-launch", content: "header-link" }
  const url = new URL(campaignExample(data))
  assert.equal(url.origin, "https://pinoycubers.org")
  assert.equal(url.searchParams.get("utm_source"), "pca_newsletter")
  assert.equal(url.searchParams.get("utm_medium"), "email")
  assert.equal(url.searchParams.get("utm_campaign"), "rankings-launch")
  assert.equal(url.searchParams.get("utm_content"), "header-link")
  assert.equal(new URL(campaignExample({ ...data, content: "" })).searchParams.has("utm_content"), false)
  for (const change of [{ page: "https://elsewhere.example" }, { source: "visitor@example.org" }, { campaign: "" }, { source: "A Mixed Name" }, { content: "x".repeat(65) }, { medium: "made-up" }]) assert.equal(campaignExample({ ...data, ...change }), null)
})

test("sample CSV retains scope, exact counts and whole-scope share denominator", () => {
  const units = acquisitionUnits(workspaceReport({ days: 28, device: "mobile" }).sessions, "session", sampleSessions)
  const rows = acquisitionRows(units, "source").slice(0, 2)
  const csv = acquisitionCsv(rows, "session", "Sep 21 – Oct 18", "mobile", units.length)
  assert.match(csv, /SAMPLE DATA ONLY/)
  assert.match(csv, /whole-scope denominator/)
  assert.match(csv, /session acquisition/)
  assert.ok(csv.includes(String(units.length)))
  assert.ok(csv.includes(rows[0].name))
  assert.equal(csv.split("\n").length, 6)
})
