import assert from "node:assert/strict"
import { test } from "node:test"
import { consumeFeedbackLogin, feedbackReturnPath, FEEDBACK_LOGIN_RETURN_KEY, rememberFeedbackLogin, wcaAuthorizeUrl } from "../apps/web/src/lib/feedback-login.ts"

const origin = "https://pinoycubers.org"
function storage() {
  const items = new Map()
  return { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value), removeItem: key => items.delete(key) }
}

test("feedback login returns to the original view and reopens the form, once", () => {
  const saved = storage()
  rememberFeedbackLogin(saved, `${origin}/regional-statistics?tab=region&event=444bf`, origin, 1000)
  assert.equal(consumeFeedbackLogin(saved, origin, 2000), "/regional-statistics?event=444bf&tab=region#website-feedback")
  assert.equal(consumeFeedbackLogin(saved, origin, 2000), null)
})

test("rankings selections survive without storing OAuth codes or arbitrary parameters", () => {
  assert.equal(feedbackReturnPath(`${origin}/regional-rankings?event=222&region=NCR&format=average&code=secret&email=private#old`, origin), "/regional-rankings?event=222&region=NCR&format=average#website-feedback")
  assert.equal(feedbackReturnPath(`${origin}/regional-statistics/`, origin), "/regional-statistics/#website-feedback")
})

test("return destinations cannot leave the two supported public pages", () => {
  for (const path of ["https://evil.example/regional-statistics", "//evil.example/regional-statistics", "/admin", "/regional-statistics/../admin", "javascript:alert(1)", "https://user:password@pinoycubers.org/regional-statistics"]) {
    assert.equal(feedbackReturnPath(path, origin), null, path)
  }
})

test("expired, future, malformed and tampered intents are discarded", () => {
  for (const raw of ["not json", "null", JSON.stringify({path:"/regional-statistics",created:0}), JSON.stringify({path:"/regional-statistics",created:9999999}), JSON.stringify({path:"//evil.example",created:1000000}), JSON.stringify({path:"/regional-statistics"})]) {
    const saved = storage()
    saved.setItem(FEEDBACK_LOGIN_RETURN_KEY, raw)
    assert.equal(consumeFeedbackLogin(saved, origin, 1000000), null)
    assert.equal(saved.getItem(FEEDBACK_LOGIN_RETURN_KEY), null)
  }
})

test("blocked session storage safely disables the return intent", () => {
  const blocked = { getItem() { throw Error("blocked") }, setItem() { throw Error("blocked") }, removeItem() { throw Error("blocked") } }
  assert.equal(consumeFeedbackLogin(blocked, origin), null)
  assert.throws(() => rememberFeedbackLogin(blocked, `${origin}/regional-statistics`, origin))
})

test("sign-in uses the existing WCA callback and no additional scopes", () => {
  const url = new URL(wcaAuthorizeUrl("http://127.0.0.1:3000", "https://www.worldcubeassociation.org", "test-client"))
  assert.equal(url.pathname, "/oauth/authorize/")
  assert.equal(url.searchParams.get("client_id"), "test-client")
  assert.equal(url.searchParams.get("redirect_uri"), "http://127.0.0.1:3000/regional-rankings")
  assert.equal(url.searchParams.get("scope"), "")
  assert.equal(url.searchParams.get("response_type"), "code")
})
