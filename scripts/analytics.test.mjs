import assert from "node:assert/strict"
import { test } from "node:test"
import { createAnalyticsTracker, eligiblePage, safeReferrer, safeCampaign, analyticsBuildMode, analyticsDestination } from "../apps/web/src/lib/analytics-core.ts"

const ID = "G-EGQD2JBT77"
const BETA_ID = "G-TESTBETA123"
const betaURL = "https://beta.pinoycubers.org/regional-rankings"
test("production collection needs explicit release enablement, while debug remains local-only",()=>{
  for(const enabled of [undefined,"","0","true","yes"]){
    assert.equal(analyticsBuildMode({development:false,production:true,enabled}),"off")
  }
  assert.equal(analyticsBuildMode({development:false,production:true,enabled:"1"}),"production")
  assert.equal(analyticsBuildMode({development:true,production:false,enabled:"1"}),"off")
  assert.equal(analyticsBuildMode({development:true,production:false,debug:"1"}),"debug")
  assert.equal(analyticsBuildMode({development:false,production:true,debug:"1"}),"off")
})
function harness(mode = "production", id = ID) {
  const state = { href: "https://pinoycubers.org/regional-rankings", referrer: "https://search.example/results?q=private", permitted: true }
  const commands = [], tags = [], disabled = []
  const tracker = createAnalyticsTracker(id, mode, {
    href: () => state.href, referrer: () => state.referrer, permitted: () => state.permitted,
    send: (...args) => commands.push(args), loadTag: id => tags.push(id), disable: (id, value) => disabled.push([id, value]),
  })
  const events = name => commands.filter(command => command[0] === "event" && (!name || command[1] === name))
  return { tracker, state, commands, tags, disabled, events }
}

test("production permits only the main site's public routes over HTTPS", () => {
  for (const href of [
    "http://pinoycubers.org/regional-rankings", "https://arena.pinoycubers.org/regional-rankings",
    "https://deploy-preview-12.netlify.app/regional-rankings", "http://localhost:3000/regional-rankings",
    "https://pinoycubers.org/admin", "https://pinoycubers.org/performance",
    "https://pinoycubers.org/growth-statistics", "https://pinoycubers.org/",
  ]) assert.equal(eligiblePage(href, "production"), null, href)
  assert.equal(eligiblePage("https://www.pinoycubers.org/regional-statistics/", "production").path, "/regional-statistics")
  assert.equal(eligiblePage("http://localhost:3000/regional-rankings", "debug").path, "/regional-rankings")
  assert.equal(eligiblePage("https://pinoycubers.org/regional-rankings", "debug"), null)
})

test("beta needs a release build, a separate valid ID, and its own explicit opt-in", () => {
  const settings = { development: false, production: true, productionId: ID, betaId: BETA_ID, betaEnabled: "1" }
  const off = { id: "", mode: "off" }
  for (const overrides of [
    { betaEnabled: undefined, enabled: "1" }, { betaEnabled: "0" }, { betaEnabled: "true" },
    { betaId: undefined }, { betaId: "invalid" }, { betaId: ID }, { betaId: ID, productionId: "" },
    { betaId: "G-OTHERPROD", productionId: "G-OTHERPROD" },
    { development: true, production: false, debug: "1" },
  ]) assert.deepEqual(analyticsDestination(betaURL, { ...settings, ...overrides }), off)
  assert.deepEqual(analyticsDestination(betaURL.replace("https:", "http:"), settings), off)
  assert.deepEqual(analyticsDestination(betaURL, settings), { id: BETA_ID, mode: "beta" })
  assert.deepEqual(analyticsDestination("https://pinoycubers.org/regional-rankings", settings), { id: ID, mode: "off" })
  assert.deepEqual(analyticsDestination("https://www.pinoycubers.org/regional-statistics", { ...settings, enabled: "1" }), { id: ID, mode: "production" })
})

test("beta collection stays on the exact HTTPS host and curated routes, and sends only to beta", () => {
  for (const href of [
    "http://beta.pinoycubers.org/regional-rankings", "https://beta.pinoycubers.org/admin",
    "https://beta.pinoycubers.org/", "https://beta.pinoycubers.org.example.org/regional-rankings",
    "https://pinoycubers.org/regional-rankings", "https://arena.pinoycubers.org/regional-rankings",
    "https://example.netlify.app/regional-rankings", "http://localhost:3000/regional-rankings",
    `${betaURL}?code=private`,
  ]) assert.equal(eligiblePage(href, "beta"), null, href)
  assert.equal(eligiblePage(betaURL, "production"), null)
  const h = harness("beta", BETA_ID)
  h.state.href = `${betaURL}?event=222&private=hidden`
  h.state.permitted = false
  assert.equal(h.tracker.syncPage(), false)
  assert.deepEqual(h.tags, [])
  h.state.permitted = true
  h.tracker.contentView({ content_page: "rankings", event_id: "222" })
  h.tracker.contentView({ content_page: "rankings", event_id: "333" })
  h.state.href = "https://beta.pinoycubers.org/regional-statistics/"
  h.tracker.syncPage()
  assert.deepEqual(h.tags, [BETA_ID])
  assert.equal(h.events("page_view").length, 2)
  assert.equal(h.events("content_view").length, 2)
  assert.ok(h.events().every(([, , params]) => params.send_to === BETA_ID))
  assert.equal(h.events("page_view")[0][2].page_location, betaURL)
  const config = h.commands.find(command => command[0] === "config")[2]
  assert.equal(config.cookie_domain, "none")
  assert.equal(config.cookie_prefix, "pca_beta")
  assert.equal(config.cookie_expires, 0)
  const unsafe = harness("beta", ID)
  unsafe.state.href = betaURL
  assert.equal(unsafe.tracker.syncPage(), false)
  assert.deepEqual(unsafe.tags, [])
})

test("beta-to-beta navigation does not accept campaign tags as external entry", () => {
  const tagged = `${betaURL}?utm_source=qa&utm_medium=manual&utm_campaign=beta_smoke`
  assert.deepEqual(safeCampaign(tagged, "https://beta.pinoycubers.org/"), {})
  assert.equal(safeCampaign(tagged, "").campaign_name, "beta_smoke")
})

test("OAuth callbacks and sensitive values prevent tag initialization", () => {
  for (const suffix of ["?code=secret", "?CODE=secret", "?access_token=secret", "?email=private", "#token=secret"]) {
    const h = harness()
    h.state.href += suffix
    assert.equal(h.tracker.syncPage(), false)
    assert.equal(h.tags.length, 0)
    assert.equal(h.commands.length, 0)
  }
})

test("page metadata drops query strings, fragments and external referrer paths", () => {
  const h = harness()
  h.state.href += "?event=222&other=private#private"
  h.tracker.syncPage()
  const metadata = h.events("page_view")[0][2]
  assert.equal(metadata.page_location, "https://pinoycubers.org/regional-rankings")
  assert.equal(metadata.page_referrer, "https://search.example")
  assert.equal(safeReferrer("https://user:secret@pinoycubers.org/regional-statistics?code=private#private"), "https://pinoycubers.org/regional-statistics")
  assert.equal(safeReferrer("javascript:alert(1)"), "")
  assert.equal(JSON.stringify(h.commands).includes("private"), false)
})

test("strict-effect repeats and query-only changes do not duplicate page views", () => {
  const h = harness()
  h.tracker.syncPage()
  h.tracker.syncPage()
  h.state.href += "?event=222"
  h.tracker.syncPage()
  assert.equal(h.events("page_view").length, 1)
  h.state.href = "https://pinoycubers.org/regional-statistics"
  h.tracker.syncPage()
  assert.equal(h.events("page_view")[1][2].page_referrer, "https://pinoycubers.org/regional-rankings")
  h.state.href = "https://pinoycubers.org/regional-rankings"
  h.tracker.syncPage()
  assert.equal(h.events("page_view").length, 3)
  assert.deepEqual(h.tags, [ID])
  const config = h.commands.find(command => command[0] === "config")[2]
  assert.equal(config.send_page_view, false)
  assert.equal(config.cookie_expires, 0)
  assert.equal(config.page_location, undefined, "initial route must not override later global page defaults")
  assert.equal(config.allow_google_signals, false)
  assert.equal(config.allow_ad_personalization_signals, false)
})

test("interaction creates exposure before use, deduped per route view", () => {
  const h = harness()
  h.tracker.use("rankings_filters", "event_changed")
  h.tracker.expose("rankings_filters")
  h.tracker.use("rankings_filters", "format_changed")
  assert.equal(h.events("feature_exposed").length, 1)
  assert.equal(h.events("feature_exposed")[0][2].exposure_method, "interaction")
  assert.equal(h.events("feature_used").length, 2)
  const names = h.events().map(event => event[1])
  assert.ok(names.indexOf("feature_exposed") < names.indexOf("feature_used"))
  h.state.href = "https://pinoycubers.org/regional-statistics"
  h.tracker.syncPage()
  h.state.href = "https://pinoycubers.org/regional-rankings"
  h.tracker.expose("rankings_filters")
  assert.equal(h.events("feature_exposed").length, 2)
})

test("extra payload keys and free text cannot become analytics properties", () => {
  const h = harness()
  h.tracker.track("rankings_filter_changed", {
    filter_name: "event", event_id: "333", result_type: "average", region_id: "PH",
    email: "private@example.org", code: "secret", name: "A Visitor",
  })
  const payload = h.events("rankings_filter_changed")[0][2]
  assert.equal(payload.event_id, "333")
  assert.equal(payload.email, undefined)
  assert.equal(payload.code, undefined)
  h.tracker.track("statistics_view_changed", { view_id: "private@example.org" })
  assert.equal(h.events("statistics_view_changed")[0][2].view_id, undefined)
})

test("login outcome waits for OAuth cleanup and is sent once without credentials", () => {
  const h = harness()
  h.state.href += "?code=secret"
  h.tracker.loginOutcome("wca_login_completed")
  assert.equal(h.commands.length, 0)
  h.state.href = "https://pinoycubers.org/regional-rankings"
  h.tracker.syncPage()
  h.tracker.syncPage()
  assert.equal(h.events("wca_login_completed").length, 1)
  assert.equal(JSON.stringify(h.commands).includes("secret"), false)
})

test("disabled mode, invalid ID, and privacy opt-out all prevent collection", () => {
  for (const h of [harness("off"), harness("production", "GA"), harness("production", "")]) {
    h.tracker.use("rankings_filters", "event_changed")
    assert.equal(h.commands.length, 0)
    assert.equal(h.tags.length, 0)
  }
  const h = harness()
  h.state.permitted = false
  h.tracker.expose("rankings_filters")
  assert.equal(h.commands.length, 0)
  h.state.permitted = true
  h.tracker.syncPage()
  h.state.permitted = false
  h.tracker.track("region_request_submitted", {})
  assert.equal(h.events("region_request_submitted").length, 0)
  assert.deepEqual(h.disabled.at(-1), [ID, true])
})

test("external campaign fields are bounded and never keep arbitrary queries",()=>{
  const url="https://pinoycubers.org/regional-rankings?utm_source=pca_newsletter&utm_medium=email&utm_campaign=launch&utm_content=header&private=secret"
  assert.deepEqual(safeCampaign(url,"https://external.example"),{campaign_source:"pca_newsletter",campaign_medium:"email",campaign_name:"launch",campaign_content:"header"})
  for(const suffix of ["?utm_source=hello", "?utm_source=user%40example.org&utm_medium=email&utm_campaign=launch", "?utm_source=a&utm_source=b&utm_medium=email&utm_campaign=launch", "?utm_source=Mixed%20Name&utm_medium=email&utm_campaign=launch"]){assert.deepEqual(safeCampaign("https://pinoycubers.org/regional-rankings"+suffix,""),{})}
  assert.deepEqual(safeCampaign(url,"https://www.pinoycubers.org/regional-statistics"),{})
  const h=harness();h.state.href=url;h.tracker.syncPage();h.state.href="https://pinoycubers.org/regional-statistics?utm_source=internal&utm_medium=email&utm_campaign=other";h.tracker.syncPage()
  const campaigns=h.commands.filter(c=>c[0]==="set"&&c[1].campaign_source)
  assert.equal(campaigns.length,1);assert.equal(campaigns[0][1].campaign_source,"pca_newsletter");assert.equal(JSON.stringify(h.commands).includes("secret"),false)
  assert.equal(h.events("page_view").length,2)
})
test("content views include direct entry, meaningful changes and re-entry without inflating page views",()=>{
  const h=harness(),content={content_page:"rankings",event_id:"222",region_id:"NCR",result_type:"average"}
  h.tracker.contentView(content);h.tracker.contentView(content)
  assert.equal(h.events("content_view").length,1);assert.equal(h.events("content_view")[0][2].content_entry,"initial")
  h.tracker.contentView({...content,event_id:"333"});h.tracker.contentView(content)
  assert.equal(h.events("content_view").length,3);assert.equal(h.events("content_view")[1][2].content_entry,"change");assert.equal(h.events("page_view").length,1)
  h.state.href="https://pinoycubers.org/regional-statistics";h.tracker.contentView({content_page:"statistics",view_id:"region"})
  h.state.href="https://pinoycubers.org/regional-rankings";h.tracker.contentView(content)
  assert.equal(h.events("content_view")[4][2].content_entry,"initial");assert.equal(h.events("page_view").length,3)
  assert.equal(h.tracker.contentView({content_page:"statistics",view_id:"event"}),false)
})
test("content collection respects exclusions, opt-out and callback cleanup",()=>{
  const h=harness();h.state.href+="?code=secret";assert.equal(h.tracker.contentView({content_page:"rankings",event_id:"333"}),false);assert.equal(h.commands.length,0)
  h.state.href="https://beta.pinoycubers.org/regional-rankings";assert.equal(h.tracker.contentView({content_page:"rankings",event_id:"333"}),false);assert.equal(h.tags.length,0)
  h.state.href="https://pinoycubers.org/regional-rankings";h.state.permitted=false;assert.equal(h.tracker.contentView({content_page:"rankings",event_id:"333"}),false)
  h.state.permitted=true;h.tracker.contentView({content_page:"rankings",event_id:"333"});assert.equal(h.events("content_view")[0][2].content_entry,"initial");assert.equal(h.events("content_view")[0][2].tracking_version,"2")
})
