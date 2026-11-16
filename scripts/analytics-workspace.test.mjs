import assert from "node:assert/strict"
import { test } from "node:test"
import { experimentSamples, featureCatalogue, issueSamples, pageDefinitions, previewLibrary, retentionReport, sampleIdentities, sampleSessions, workspaceReport, workspaceSearch, workspaceSections } from "../apps/admin/src/lib/analytics-workspace.ts"

test("traffic totals and breakdowns reconcile for every supported scope", () => {
  for (const days of [7, 28]) for (const device of ["all", "mobile", "desktop"]) {
    const r = workspaceReport({ days, device })
    assert.ok(r.total > 0)
    assert.equal(r.daily.reduce((n, d) => n + d.count, 0), r.total)
    assert.equal(r.paths.reduce((n, p) => n + p.count, 0), r.total)
    assert.equal(r.pages.reduce((n, p) => n + p.entries, 0), r.total)
    assert.equal(r.pages.reduce((n, p) => n + p.views, 0), r.pageviews)
    assert.equal(r.channels.reduce((n, c) => n + c.count, 0), r.total)
    assert.equal(r.devices.reduce((n, d) => n + d.count, 0), r.total)
    assert.equal(r.people, new Set(r.sessions.map(s => s.identity)).size)
    assert.ok(r.engaged <= r.total)
    if (device !== "all") assert.ok(r.sessions.every(s => s.device === device))
    assert.ok(r.sessions.every(s => s.day >= 56 - days && s.day <= 55))
  }
})

test("device slices partition sessions and the seven-day scope is a subset", () => {
  for (const days of [7, 28]) {
    assert.equal(workspaceReport({ days, device: "all" }).total, workspaceReport({ days, device: "mobile" }).total + workspaceReport({ days, device: "desktop" }).total)
  }
  const larger = new Set(workspaceReport({ days: 28, device: "all" }).sessions.map(s => s.id))
  assert.ok(workspaceReport({ days: 7, device: "all" }).sessions.every(s => larger.has(s.id)))
})

test("initial content views exist on entry and changes never inflate page views", () => {
  for (const s of sampleSessions) {
    assert.equal(s.content.filter(c => c.entry).length, s.pages.length)
    for (const page of s.pages) assert.equal(s.content.filter(c => c.entry && c.page === page).length, 1)
    assert.ok(s.content.every(c => s.pages.includes(c.page)))
    assert.equal(s.content.filter(c => !c.entry).length, s.used.includes("filters") ? 1 : 0)
    for (const changed of s.content.filter(c => !c.entry)) assert.notEqual(changed.event, s.content.find(c => c.entry && c.page === changed.page)?.event)
  }
})

test("feature rates use nested sessions, not independent click totals", () => {
  for (const s of sampleSessions) {
    assert.ok(s.used.every(f => s.exposed.includes(f)))
    assert.ok(s.exposed.every(f => s.eligible.includes(f)))
    assert.equal(new Set(s.exposed).size, s.exposed.length)
  }
  for (const device of ["all", "mobile", "desktop"]) {
    const r = workspaceReport({ days: 28, device })
    for (const f of r.features) assert.ok(f.used <= f.exposed && f.exposed <= f.eligible && f.eligible <= r.total)
  }
  assert.equal(featureCatalogue.length, 4)
})

test("funnel steps are ordered within each sample session", () => {
  for (const s of sampleSessions) {
    for (let i = 1; i < s.onboarding.length; i++) if (s.onboarding[i]) assert.equal(s.onboarding[i - 1], true)
    assert.equal(s.onboarding[0], s.exposed.includes("region"))
    assert.equal(s.onboarding[1], s.used.includes("region"))
  }
})

test("cohort retention shares identities and leaves incomplete weeks unavailable", () => {
  for (const device of ["all", "mobile", "desktop"]) {
    const r = retentionReport(device)
    assert.equal(r.rows.reduce((n, row) => n + row.size, 0), r.people)
    assert.ok(r.week1.active <= r.week1.eligible)
    assert.ok(r.week4.active <= r.week4.eligible)
    r.rows.forEach((row, cohort) => {
      assert.equal(row.counts[0], row.size)
      row.counts.forEach((n, offset) => {
        if (offset >= 8 - cohort) assert.equal(n, null)
        else assert.ok(n >= 0 && n <= row.size)
      })
    })
    assert.equal(r.week1.eligible, r.rows.slice(0, 7).reduce((n, row) => n + row.size, 0))
    assert.equal(r.week4.eligible, r.rows.slice(0, 4).reduce((n, row) => n + row.size, 0))
  }
  const ids = new Set(sampleIdentities.map(p => p.id))
  assert.ok(sampleSessions.every(s => ids.has(s.identity)))
  assert.equal(new Set(sampleSessions.map(s => s.id)).size, sampleSessions.length)
})

test("feedback context and related experiments resolve to known records", () => {
  for (const issue of issueSamples) {
    assert.ok(pageDefinitions.some(p => p.id === issue.page))
    assert.ok(issue.snapshot.startsWith("demo-"))
    if (issue.experiment) assert.ok(experimentSamples.some(e => e.id === issue.experiment))
  }
  for (const e of experimentSamples) {
    assert.ok(issueSamples.some(i => i.id === e.issue))
    assert.ok(e.a[1] <= e.a[0] && e.b[1] <= e.b[0])
  }
})

test("library includes every new section and all eleven earlier preview pages", () => {
  const links = previewLibrary.flatMap(group => group.links)
  assert.equal(new Set(links.map(l => l.href)).size, links.length)
  for (const section of [...workspaceSections.map(s => s.id), "settings"]) assert.ok(links.some(l => l.href === `/admin/analytics/${section}`))
  for (const tab of ["overview", "journeys", "features", "setup"]) assert.ok(links.some(l => l.href === `/admin/ux-analytics?tab=${tab}`))
  for (const view of ["audience", "retention", "usability", "feedback", "quality"]) assert.ok(links.some(l => l.href === `/admin/ux-examples/${view}`))
  assert.ok(links.some(l => l.href === "/admin/experiments"))
  assert.ok(links.some(l => l.href === "/admin/ux-examples"))
})

test("URL filters normalize invalid inputs and allow only known detail ID shapes", () => {
  assert.deepEqual(workspaceSearch({ days: "7", device: "mobile", item: "FB-104" }), { days: 7, device: "mobile", item: "FB-104" })
  assert.deepEqual(workspaceSearch({ days: -1, device: "phone", item: "private@example.org" }), { days: 28, device: "all" })
})
