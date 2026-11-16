import assert from "node:assert/strict"
import { test } from "node:test"
import { sampleSessions } from "../apps/admin/src/lib/analytics-workspace.ts"
import { analysisNotesCsv, metric, reportCsv, sampleReport, validReport } from "../apps/admin/src/lib/analytics-workbench.ts"
import { acquisitionLabel, contentBreakdowns, featureSignalRows, measuredFeatures } from "../apps/admin/src/lib/analytics-signals.ts"
import { campaignDraftCsv, campaignIssues, campaignPresets, defaultCampaignDraft } from "../apps/admin/src/lib/campaign-link.ts"
import { campaignExample } from "../apps/admin/src/lib/acquisition-preview.ts"

test("content totals reconcile across every page, device, period and breakdown without adding users", () => {
  for (const days of [7,28]) for (const device of ["all","mobile","desktop","tablet"]) for (const page of ["all","rankings","statistics"]) {
    const search = { mode:"sample",days,device }
    const selected = sampleSessions.filter(session=>session.day>=56-days&&(device==="all"||session.device===device))
    const views = selected.flatMap(session=>session.content.filter(view=>page==="all"||view.page===page).map(view=>({view,identity:session.identity})))
    for (const breakdown of Object.keys(contentBreakdowns)) {
      const report = sampleReport(sampleSessions,search,"content",breakdown,page)
      const total = report.totals.rows[0]
      assert.equal(report.contentPage,page)
      assert.equal(metric(total,"eventCount",report.totals),views.length)
      assert.equal(metric(total,"totalUsers",report.totals),new Set(views.map(item=>item.identity)).size)
      assert.equal(report.table.rows.reduce((sum,row)=>sum+metric(row,"eventCount",report.table),0),views.length)
      assert.ok(report.table.rows.every(row=>metric(row,"totalUsers",report.table)<=metric(row,"eventCount",report.table)))
      const live = {...report,source:"ga4"}
      assert.equal(validReport(live,"content",device,breakdown,page),true)
      assert.equal(validReport(live,"content",device,breakdown,page==="all"?"rankings":"all"),false)
    }
  }
})

test("feature signal counts are separate events and deduplicated browser populations, not a fake conversion", () => {
  for (const days of [7,28]) for (const device of ["all","mobile","desktop","tablet"]) {
    const search = {mode:"sample",days,device}, report = sampleReport(sampleSessions,search,"features","feature")
    const rows = featureSignalRows(report), sessions = sampleSessions.filter(session=>session.day>=56-days&&(device==="all"||session.device===device))
    measuredFeatures.forEach((feature,i)=>{
      const exposed = sessions.filter(session=>session.exposed.includes(feature.fixtureId)), used = sessions.filter(session=>session.used.includes(feature.fixtureId))
      assert.equal(rows[i].exposureSignals,exposed.length)
      assert.equal(rows[i].useSignals,used.length)
      assert.equal(rows[i].exposedUsers,new Set(exposed.map(session=>session.identity)).size)
      assert.equal(rows[i].usedUsers,new Set(used.map(session=>session.identity)).size)
      assert.equal("conversionRate" in rows[i],false)
    })
    assert.equal(validReport({...report,source:"ga4"},"features",device,"feature"),true)
    const malformed = structuredClone(report);malformed.source="ga4";malformed.table.dimensionHeaders.reverse()
    assert.equal(validReport(malformed,"features",device,"feature"),false)
  }
})

test("signal CSV preserves all dimensions, scope and formula protection", () => {
  const report = sampleReport(sampleSessions,{mode:"sample",days:28,device:"all"},"features","feature")
  report.table.rows[0].dimensionValues[0].value = '=HYPERLINK("unexpected")'
  const csv = reportCsv(report,[report.table.rows[0]])
  assert.match(csv,/"customEvent:feature_name","eventName","eventCount","totalUsers"/)
  assert.match(csv,/"'=HYPERLINK/)
  assert.match(csv,/feature_exposed|feature_used/)
  const content = sampleReport(sampleSessions,{mode:"sample",days:7,device:"mobile"},"content","region","rankings")
  assert.match(reportCsv(content,content.table.rows),/"mobile","Asia\/Manila","rankings"/)
})

test("campaign field guidance and exported URLs use the same bounded validation", () => {
  assert.deepEqual(campaignIssues(defaultCampaignDraft),{})
  for (const preset of campaignPresets) {
    const draft = {...defaultCampaignDraft,...preset}
    assert.deepEqual(campaignIssues(draft),{})
    const url = new URL(campaignExample(draft))
    assert.equal(url.hostname,"pinoycubers.org")
    assert.equal(url.searchParams.get("utm_source"),preset.source)
    assert.ok(campaignDraftCsv(draft).includes(url.href))
  }
  for (const patch of [{source:"person@example.com"},{source:"Google"},{campaign:""},{campaign:"x".repeat(65)},{content:"+formula"},{page:"https://external.example"},{medium:"unknown"}]) {
    const draft = {...defaultCampaignDraft,...patch}
    assert.ok(Object.keys(campaignIssues(draft)).length)
    assert.equal(campaignExample(draft),null)
    assert.equal(campaignDraftCsv(draft),null)
  }
  const optional = {...defaultCampaignDraft,content:""}
  assert.deepEqual(campaignIssues(optional),{})
  assert.equal(new URL(campaignExample(optional)).searchParams.has("utm_content"),false)
})

test("Dev Analysis Log export keeps provenance and makes formula-like notes plain text", () => {
  const csv = analysisNotesCsv([{id:"qa",source:"sample",section:"features",createdAt:"2026-10-23T00:00:00Z",question:"=QUESTION()",evidence:"Invented, not live",action:"\t+ACTION()"}])
  assert.match(csv,/browser-local notes, not shared/)
  assert.match(csv,/"sample","features"/)
  assert.ok(csv.includes("'=QUESTION()"))
  assert.ok(csv.includes("'\t+ACTION()"))
})

test("unknown source labels stay explicit, and statistics does not invent a selected region", () => {
  assert.equal(acquisitionLabel("(not set) / (not set)").title,"Unknown source / medium")
  assert.match(acquisitionLabel("(direct) / (none)").detail,/not necessarily/)
  const report = sampleReport(sampleSessions,{mode:"sample",days:28,device:"all"},"content","region","statistics")
  assert.deepEqual(report.table.rows.map(row=>row.dimensionValues[0].value),["(not set)"])
})
