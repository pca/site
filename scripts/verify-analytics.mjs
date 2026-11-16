// No live Google requests, account credentials, production writes or deployment.
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm, readdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const args = process.argv.slice(2)
if (args.some(arg => arg !== "--unit")) throw new Error("Supported option: --unit (JavaScript checks only)")
const [major, minor] = process.versions.node.split(".").map(Number)
if (major < 22 || (major === 22 && minor < 18)) throw new Error("Use Node 22.18+ or Node 24+ for the TypeScript test imports.")

const unitOnly = args.includes("--unit")
const tests = [
  "analytics.test.mjs", "analytics-workbench.test.mjs", "analytics-signals.test.mjs",
  "analytics-release.test.mjs", "analytics-v4.test.mjs", "analytics-deployment.test.mjs", "analytics-workspace.test.mjs", "acquisition-preview.test.mjs",
  "behavior-preview.test.mjs", "behavior-report.test.mjs", "experiment-plan.test.mjs", "measurement-status.test.mjs", "admin-theme.test.mjs",
]
const failures = []
const temporary = await mkdtemp(join(tmpdir(), "pca-analytics-check-"))
const contractFile = join(temporary, "mock-report-contract.json")
const comparisonFile = join(temporary, "mock-comparison-contract.json")
const behaviorFile = join(temporary, "mock-behavior-contract.json")
const env = {
  ...process.env,
  PATH: `${dirname(process.execPath)}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}`,
  // Never use an actual account configuration for this check.
  GA4_PROPERTY_ID: "", GA4_SERVICE_ACCOUNT_FILE: "", NO_UPDATE_NOTIFIER: "1",
}

async function run(label, command, commandArgs, options = {}) {
  console.log(`\n${label}`)
  const passed = await new Promise(resolve => {
    const child = spawn(command, commandArgs, {
      cwd: options.cwd ?? root, env: { ...env, ...options.env }, stdio: "inherit", shell: false,
    })
    const timeout = setTimeout(() => { console.error(`${label}: timed out`); child.kill("SIGTERM") }, 180_000)
    child.on("error", error => { console.error(`${label}: ${error.message}`) })
    child.on("close", code => { clearTimeout(timeout); resolve(code === 0) })
  })
  if (!passed) failures.push(label)
  return passed
}

try {
  await run("Analytics rules and workflow tests", process.execPath, ["--test", ...tests.map(name => `scripts/${name}`)])
  if (!unitOnly) {
    const apiPassed = await run("API tests, concurrency checks and simulated Google reports", "go", ["test", "-race", "-count=1", "./..."], {
      cwd: join(root, "apps/api"), env: { PCA_ANALYTICS_CONTRACT_OUTPUT: contractFile, PCA_ANALYTICS_COMPARISON_OUTPUT: comparisonFile, PCA_ANALYTICS_BEHAVIOR_OUTPUT:behaviorFile, GOPROXY: "off", GOSUMDB: "off" },
    })
    if (apiPassed) {
      try {
        const { validReport, reportDimensions, reportCsv } = await import("../apps/admin/src/lib/analytics-workbench.ts")
        const matrix = JSON.parse(await readFile(contractFile, "utf8"))
        const expected = new Set()
        for (const [kind, breakdowns] of Object.entries(reportDimensions)) for (const breakdown of Object.keys(breakdowns)) {
          for (const page of kind === "content" ? ["all", "rankings", "statistics"] : [""]) {
            for (const device of ["all", "mobile", "desktop", "tablet"]) for (const days of [7, 28]) {
              expected.add(JSON.stringify([kind, breakdown, page, device, days]))
            }
          }
        }
        for (const { query, result } of matrix) {
          const key = JSON.stringify([query.Report, query.Breakdown, query.ContentPage, query.Device, query.Days])
          assert.ok(expected.delete(key), `Unexpected or duplicate API contract: ${key}`)
          assert.equal(validReport(result, query.Report, query.Device, query.Breakdown, query.ContentPage || "all", query.Days), true, `Admin rejected API response: ${key}`)
          assert.ok(reportCsv(result, result.table.rows ?? []).startsWith('"GA4 report"'))
          assert.equal(validReport(result, query.Report, query.Device, query.Breakdown, query.ContentPage || "all", query.Days === 7 ? 28 : 7), false, "Wrong reporting period accepted")
        }
        assert.equal(expected.size, 0, "Missing API contract coverage")
        console.log(`\nPASS: ${matrix.length} API → admin → CSV contracts (fake Google service only).`)
        const {validRelease,releaseCsv}=await import("../apps/admin/src/lib/release-comparison.ts")
        const comparisons=JSON.parse(await readFile(comparisonFile,"utf8"))
        assert.equal(comparisons.length,24)
        for(const comparison of comparisons){
          const request={date:comparison.releaseDate,days:comparison.days,breakdown:comparison.breakdown},search={mode:"ga4",days:28,device:comparison.device}
          assert.equal(validRelease(comparison,request,search),true,"Admin rejected comparison contract")
          assert.ok(releaseCsv(comparison).includes("release day excluded"))
        }
        console.log(`PASS: ${comparisons.length} release comparison API → admin contracts.`)
        const {validBehavior,behaviorCsv}=await import("../apps/admin/src/lib/behavior-report.ts")
        const behaviors=JSON.parse(await readFile(behaviorFile,"utf8"))
        assert.equal(behaviors.length,20)
        for(const report of behaviors){assert.equal(validBehavior(report,report.kind,{mode:"ga4",days:report.days,device:report.device},report.funnel||"region"),true,"Admin rejected behavior contract");assert.match(behaviorCsv(report),/GA4 report/)}
        console.log(`PASS: ${behaviors.length} journey/retention API → admin → CSV contracts.`)
      } catch (error) {
        failures.push("API → admin contract")
        console.error(error)
      }
    } else {
      console.error("API → admin contract not verified because the API tests failed.")
    }
    // Use the installed workspace tools directly. Verification must not trigger
    // a package-manager auto-install or replace another chat's dependencies.
    const admin = join(root, "apps/admin"), web = join(root, "apps/web")
    await run("Admin TypeScript", process.execPath, [join(admin, "node_modules/typescript/bin/tsc"), "--noEmit"], { cwd: admin })
    await run("Public website TypeScript", process.execPath, [join(web, "node_modules/typescript/bin/tsc"), "--noEmit"], { cwd: web })
    if(await run("Admin production build", process.execPath, [join(admin, "node_modules/vite/bin/vite.js"), "build"], { cwd: admin })){
      try{
        async function scan(folder){for(const entry of await readdir(folder,{withFileTypes:true})){
          const path=join(folder,entry.name)
          if(entry.isDirectory())await scan(path)
          else if(/\.(js|css|html)$/.test(entry.name)){
            const text=await readFile(path,"utf8")
            for(const privateMarker of ["/admin/analytics-before/","/Users/simon/","BEGIN PRIVATE KEY","Private project working agreements"]){assert.equal(text.includes(privateMarker),false,`Private/development content in ${entry.name}`)}
          }
        }}
        await scan(join(admin,"dist"))
        console.log("PASS: production admin bundle excludes saved comparison links and private-file markers.")
      }catch(error){failures.push("Admin production packaging audit");console.error(error)}
    }
  }
} finally {
  // This fresh directory contains only generated mock reports, never user data.
  await rm(temporary, { recursive: true, force: true })
}

if (failures.length) {
  console.error(`\nFAILED: ${failures.join(", ")}`)
  process.exitCode = 1
} else {
  console.log(`\nPASS: ${unitOnly ? "local JavaScript checks" : "local release checks"}.`)
}
console.log("Not verified here: live Google access/delivery/attribution, consent, public-site prerender deployment, or deferred preview-only features.")
