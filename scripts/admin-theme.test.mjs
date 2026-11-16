import assert from "node:assert/strict"
import { test } from "node:test"
import { applyAdminTheme, getInitialAdminTheme } from "../apps/admin/src/lib/theme.ts"

test("admin appearance respects saved preference and falls back safely", () => {
  let saved = null
  globalThis.window = { matchMedia: () => ({ matches: true }) }
  globalThis.localStorage = {
    getItem: () => saved,
    setItem: (_key, value) => { saved = value },
  }
  globalThis.document = { documentElement: { dataset: {} } }
  assert.equal(getInitialAdminTheme(), "dark")
  applyAdminTheme("light", true)
  assert.equal(saved, "light")
  assert.equal(document.documentElement.dataset.adminTheme, "light")
  assert.equal(getInitialAdminTheme(), "light")
  localStorage.getItem = () => { throw new Error("Storage blocked") }
  localStorage.setItem = () => { throw new Error("Storage blocked") }
  assert.equal(getInitialAdminTheme(), "dark")
  assert.doesNotThrow(() => applyAdminTheme("dark", true))
  assert.equal(document.documentElement.dataset.adminTheme, "dark")
})
