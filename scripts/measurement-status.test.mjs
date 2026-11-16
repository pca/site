import assert from "node:assert/strict"
import { test } from "node:test"
import { measurementConnectionStatus } from "../apps/admin/src/lib/analytics-workbench.ts"

const status = state => ({ state, message: "", hosts: ["pinoycubers.org", "www.pinoycubers.org"], cacheSeconds: 300 })

test("measurement status never presents configuration alone as verified Google access", () => {
  assert.deepEqual(measurementConnectionStatus(status("ready"), false, false), { tone: "warning", label: "Configured · access unverified" })
  assert.deepEqual(measurementConnectionStatus(status("not_configured"), false, false), { tone: "warning", label: "Setup needed" })
  assert.deepEqual(measurementConnectionStatus(status("invalid_configuration"), false, false), { tone: "error", label: "Configuration error" })
})

test("failed checks override stale configuration and pending checks show neutral status", () => {
  assert.deepEqual(measurementConnectionStatus(status("ready"), false, true), { tone: "error", label: "Server check failed" })
  assert.deepEqual(measurementConnectionStatus(status("ready"), true, true), { tone: "neutral", label: "Checking server setup…" })
  assert.deepEqual(measurementConnectionStatus(undefined, false, false), { tone: "neutral", label: "Setup not checked" })
})
