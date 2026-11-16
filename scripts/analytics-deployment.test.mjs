import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"

test("container context excludes local comparison archives, private instructions and environment files",async()=>{
  const ignore=await readFile(new URL("../.dockerignore",import.meta.url),"utf8")
  for(const rule of ["archive","**/AGENTS*.md","**/.env*","**/.agents","**/.codex","**/.aws"]){assert.ok(ignore.split(/\r?\n/).includes(rule),`Missing container exclusion: ${rule}`)}
})
test("optional Google credential mount is read-only, required explicitly and not part of default compose",async()=>{
  const override=await readFile(new URL("../docker-compose.analytics.yml",import.meta.url),"utf8"),base=await readFile(new URL("../docker-compose.yml",import.meta.url),"utf8")
  assert.match(override,/read_only: true/);assert.match(override,/create_host_path: false/)
  assert.match(override,/GA4_SERVICE_ACCOUNT_HOST_FILE:\?/)
  assert.match(override,/GA4_PROPERTY_ID:\?/)
  assert.equal(base.includes("pca-ga4.json"),false)
  assert.match(base,/VITE_ANALYTICS_ENABLED: \$\{ANALYTICS_ENABLED:-0\}/)
})

test("Docker passes a separate beta stream ID and defaults beta collection to off", async () => {
  const compose = await readFile(new URL("../docker-compose.yml", import.meta.url), "utf8")
  const dockerfile = await readFile(new URL("../Dockerfile", import.meta.url), "utf8")
  assert.match(compose, /VITE_BETA_GA_MEASUREMENT_ID: \$\{BETA_GA_MEASUREMENT_ID:-\}/)
  assert.match(compose, /VITE_BETA_ANALYTICS_ENABLED: \$\{BETA_ANALYTICS_ENABLED:-0\}/)
  assert.match(dockerfile, /ARG VITE_BETA_ANALYTICS_ENABLED="0"/)
  for (const key of ["VITE_BETA_GA_MEASUREMENT_ID", "VITE_BETA_ANALYTICS_ENABLED"]) {
    assert.ok(dockerfile.includes(`${key}=$${key}`), `${key} must reach Vite during the build`)
  }
})
