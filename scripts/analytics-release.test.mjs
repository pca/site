import assert from "node:assert/strict"
import { test } from "node:test"
import { createAnalyticsTracker, safeCampaign } from "../apps/web/src/lib/analytics-core.ts"
import { campaignExample } from "../apps/admin/src/lib/acquisition-preview.ts"
import { campaignPresets, defaultCampaignDraft } from "../apps/admin/src/lib/campaign-link.ts"
import { sampleReport, validReport } from "../apps/admin/src/lib/analytics-workbench.ts"
import { sampleSessions } from "../apps/admin/src/lib/analytics-workspace.ts"

const liveReport = () => ({
  ...sampleReport(sampleSessions, { mode: "sample", days: 7, device: "all" }, "content", "event_region", "rankings"),
  source: "ga4", fetchedAt: "2026-10-19T01:00:00Z",
})

test("malformed upstream reports are rejected without throwing or rendering plausible zeroes", () => {
  const changes = [
    value => { value.table.dimensionHeaders = null },
    value => { value.table.dimensionHeaders = {} },
    value => { value.table.dimensionHeaders[0] = null },
    value => { value.table.metricHeaders = "eventCount,totalUsers" },
    value => { value.table.rows = [null] },
    value => { value.table.rows[0].metricValues = [null, { value: "1" }] },
    value => { value.table.rows[0].dimensionValues[0].value = { private: "unexpected" } },
    value => { value.table.metadata.subjectToThresholding = "false" },
    value => { value.table.metadata.samplingMetadatas = [{ samplesReadCount: "10", samplingSpaceSize: "NaN" }] },
    value => { value.table.rows[0].metricValues[0].value = "1000000000000001" },
    value => { value.totals.rows.push(structuredClone(value.totals.rows[0])) },
    value => { value.table.rows = Array.from({ length: 201 }, () => structuredClone(value.table.rows[0])); value.table.rowCount = 201 },
    value => { value.table.rowCount = 0 },
    value => { value.table.metadata.timeZone = "not-a-timezone" },
    value => { value.table.metadata = { ...value.table.metadata, timeZone: "UTC" } },
    value => { value.start = "2026-02-30" },
    value => { value.end = "2026-10-01" },
    value => { value.hosts = ["beta.pinoycubers.org"] },
  ]
  for (const change of changes) {
    const value = liveReport()
    change(value)
    let accepted
    assert.doesNotThrow(() => { accepted = validReport(value, "content", "all", "event_region", "rankings", 7) }, change.toString())
    assert.equal(accepted, false, change.toString())
  }
  for (const value of [null, undefined, [], "not-json", {}]) {
    assert.equal(validReport(value, "content", "all", "event_region", "rankings", 7), false)
  }
})

test("report validation preserves empty, thresholded, sampled and top-N results without changing their meaning", () => {
  const value = liveReport()
  assert.equal(validReport(value, "content", "all", "event_region", "rankings", 7), true)
  assert.equal(validReport(value, "content", "all", "event_region", "rankings", 28), false)
  value.table.rowCount = 1000
  value.table.metadata.subjectToThresholding = true
  value.table.metadata.dataLossFromOtherRow = true
  value.table.metadata.samplingMetadatas = [{ samplesReadCount: "100", samplingSpaceSize: "1000" }]
  assert.equal(validReport(value, "content", "all", "event_region", "rankings", 7), true)
  value.table.rows = null
  value.table.rowCount = 0
  value.totals.rows = null
  value.totals.rowCount = 0
  assert.equal(validReport(value, "content", "all", "event_region", "rankings", 7), true)
})

test("every campaign preset survives the real collection rules, once, without leaking arbitrary query values", () => {
  for (const preset of campaignPresets) {
    const draft = { ...defaultCampaignDraft, ...preset }
    const url = campaignExample(draft)
    assert.ok(url)
    assert.equal(safeCampaign(url, "https://external.example").campaign_name, draft.campaign)
    const commands = [], tags = []
    let href = `${url}&private=not-for-analytics`
    const tracker = createAnalyticsTracker("G-EGQD2JBT77", "production", {
      href: () => href, referrer: () => "https://external.example/private", permitted: () => true,
      send: (...args) => commands.push(args), loadTag: id => tags.push(id), disable: () => {},
    })
    tracker.syncPage()
    tracker.syncPage()
    tracker.contentView({ content_page: "rankings", event_id: "333", region_id: "NCR", result_type: "average" })
    tracker.contentView({ content_page: "rankings", event_id: "333", region_id: "NCR", result_type: "average" })
    tracker.use("rankings_filters", "event_changed")
    tracker.contentView({ content_page: "rankings", event_id: "222", region_id: "NCR", result_type: "average" })
    href = "https://pinoycubers.org/regional-statistics?utm_source=internal&utm_medium=email&utm_campaign=wrong"
    tracker.syncPage()
    const campaigns = commands.filter(command => command[0] === "set" && command[1].campaign_source)
    assert.equal(campaigns.length, 1)
    assert.deepEqual(campaigns[0][1], safeCampaign(url, "https://external.example"))
    assert.equal(tags.length, 1)
    const events = commands.filter(command => command[0] === "event")
    assert.equal(events.filter(event => event[1] === "page_view").length, 2)
    assert.deepEqual(events.filter(event => event[1] === "content_view").map(event => event[2].content_entry), ["initial", "change"])
    assert.deepEqual(events.filter(event => event[1].startsWith("feature_")).map(event => event[1]), ["feature_exposed", "feature_used"])
    assert.equal(JSON.stringify(commands).includes("not-for-analytics"), false)
    assert.ok(events.every(event => !event[2].page_location.includes("?")))
  }
})
