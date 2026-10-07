// Local development without Docker.
//
//   node scripts/dev.mjs [api|worker|<app> ...]       dev servers (default: all)
//   node scripts/dev.mjs serve                        built sites from the Go server, like production
//   node scripts/dev.mjs setup                        create the local database if missing
//   node scripts/dev.mjs reset                        recreate the local database from the seed
//
// Settings come from the root .env (optional), overridden by the shell
// environment. The database lives in apps/api/data, separate from Docker's volume.

import { spawn, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, watch } from "node:fs"
import { createInterface } from "node:readline"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const apiDir = join(root, "apps", "api")
const binDir = join(apiDir, "bin")
const isWin = process.platform === "win32"
const exe = name => join(binDir, isWin ? `${name}.exe` : name)

const env = loadEnv()
const apiPort = env.PORT || "8000"
const dataDir = resolve(root, env.DATA_DIR || join(apiDir, "data"))
const dbPath = resolve(root, env.DB_PATH || join(dataDir, "pca.sqlite3"))
const seedDir = resolve(root, env.SEED_DIR || "archive/web-backend/data")
const seedDb = join(seedDir, env.SEED_DATABASE || "rebuilt-october-2026.sqlite3")
const seedManifest = join(seedDir, env.SEED_MANIFEST || "rebuilt-october-2026-manifest.json")

// Every app with a pcaSite field and a dev script runs as a service named
// after its directory. Its URL comes from `--port N` in that script.
const SITES = readdirSync(join(root, "apps"), { withFileTypes: true })
  .filter(d => d.isDirectory() && existsSync(join(root, "apps", d.name, "package.json")))
  .map(d => ({ dir: d.name, pkg: JSON.parse(readFileSync(join(root, "apps", d.name, "package.json"), "utf8")) }))
  .filter(({ pkg }) => pkg.pcaSite && pkg.scripts?.dev)
  .map(({ dir, pkg }) => {
    const port = pkg.scripts.dev.match(/--port[= ](\d+)/)?.[1]
    const mount = pkg.pcaSite.mount.replace(/\/?$/, "/")
    return { name: dir, pkg: pkg.name, mount, url: port && `http://localhost:${port}${mount}` }
  })
const SERVICES = ["api", "worker", ...SITES.map(s => s.name)]
const COLORS = { api: 36, worker: 35, dev: 90 }
SITES.forEach((s, i) => (COLORS[s.name] = [32, 33, 34, 31, 96, 92][i % 6]))
const useColor = process.stdout.isTTY && !process.env.NO_COLOR

async function main() {
  const [command = "dev", ...rest] = process.argv.slice(2)
  switch (command) {
    case "setup":
      requireGo()
      setup()
      return
    case "reset":
      requireGo()
      for (const suffix of ["", "-wal", "-shm"]) rmSync(dbPath + suffix, { force: true })
      log("dev", `deleted ${rel(dbPath)}`)
      setup()
      return
    case "serve":
      return serve()
  }
  const wanted = SERVICES.includes(command) ? [command, ...rest] : command === "dev" && rest.length ? rest : SERVICES
  const unknown = [command, ...wanted].filter(s => s !== "dev" && !SERVICES.includes(s))
  if (unknown.length) fail(`unknown command or service: ${unknown.join(", ")}\nservices: ${SERVICES.join(", ")}; commands: serve, setup, reset`)
  return dev(new Set(wanted))
}

async function dev(wanted) {
  const goServices = ["api", "worker"].filter(s => wanted.has(s))
  if (goServices.length) {
    requireGo()
    setup()
    buildGo(binDir)
  }

  const rootSite = SITES.find(s => s.mount === "/" && s.url)
  const callbacks = [rootSite && `${rootSite.url}regional-rankings`, `http://localhost:${apiPort}/regional-rankings`].filter(Boolean)
  const goEnv = {
    ...goBaseEnv(),
    WCA_DEFAULT_CALLBACK_URL: env.WCA_DEFAULT_CALLBACK_URL || callbacks[0],
    WCA_ALLOWED_CALLBACK_URLS: env.WCA_ALLOWED_CALLBACK_URLS || callbacks.join(","),
  }
  const viteEnv = {
    ...env,
    API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
    VITE_WCA_CLIENT_ID: env.VITE_WCA_CLIENT_ID || env.WCA_CLIENT_ID || "",
    VITE_GA_MEASUREMENT_ID: env.VITE_GA_MEASUREMENT_ID || env.GA_MEASUREMENT_ID || "",
  }

  const group = new Group()
  if (wanted.has("api")) group.add("api", exe("api"), ["serve"], goEnv)
  if (wanted.has("worker")) group.add("worker", exe("worker"), ["run"], goEnv)
  const sites = SITES.filter(s => wanted.has(s.name))
  for (const site of sites) group.add(site.name, "pnpm", ["--filter", site.pkg, "dev"], viteEnv)

  const urls = [
    ...sites.map(s => `${s.name.padEnd(6)} ${s.url ?? "(see its output)"}`),
    wanted.has("api") && `api    http://localhost:${apiPort}/api/docs`,
    wanted.has("api") && `staff login: ${goEnv.ADMIN_BOOTSTRAP_USERNAME} / ${goEnv.ADMIN_BOOTSTRAP_PASSWORD}`,
  ].filter(Boolean)
  log("dev", `starting ${[...wanted].join(", ")}\n  ${urls.join("\n  ")}`)
  group.startAll()

  if (goServices.length) watchGo(group, goServices)
  await group.done
}

async function serve() {
  const sites = join(root, "dist", "sites")
  if (!existsSync(join(sites, "sites.json"))) fail("dist/sites is missing; run `pnpm build` first (or `pnpm start`)")
  requireGo()
  setup()
  buildGo(binDir)
  const goEnv = {
    ...goBaseEnv(),
    SITES_DIR: sites,
    WCA_DEFAULT_CALLBACK_URL: env.WCA_DEFAULT_CALLBACK_URL || `http://localhost:${apiPort}/regional-rankings`,
  }
  const group = new Group()
  group.add("api", exe("api"), ["serve"], goEnv)
  group.add("worker", exe("worker"), ["run"], goEnv)
  const urls = SITES.map(s => `${s.name.padEnd(6)} http://localhost:${apiPort}${s.mount}`)
  log("dev", `serving the built sites\n  ${urls.join("\n  ")}\n  staff login: ${goEnv.ADMIN_BOOTSTRAP_USERNAME} / ${goEnv.ADMIN_BOOTSTRAP_PASSWORD}`)
  group.startAll()
  await group.done
}

function goBaseEnv() {
  return {
    ...env,
    DB_PATH: dbPath,
    DATA_DIR: dataDir,
    ADDR: `:${apiPort}`,
    ADMIN_BOOTSTRAP_USERNAME: env.ADMIN_BOOTSTRAP_USERNAME || "admin",
    ADMIN_BOOTSTRAP_PASSWORD: env.ADMIN_BOOTSTRAP_PASSWORD || "change-me-please",
  }
}

// Creates the local database from the seed with the same command Docker's
// init-db service runs. The seed files are only read.
function setup() {
  if (existsSync(dbPath)) return
  for (const file of [seedDb, seedManifest]) {
    if (!existsSync(file)) fail(`seed file not found: ${rel(file)}\nSet SEED_DIR (and SEED_DATABASE / SEED_MANIFEST) in .env to where they live.`)
  }
  mkdirSync(dataDir, { recursive: true })
  log("dev", `creating ${rel(dbPath)} from ${rel(seedDb)} (first run only)`)
  run("go", ["run", "./cmd/worker", "init-db", `--from=${seedDb}`, `--manifest=${seedManifest}`], { cwd: apiDir, env: goBaseEnv() })
}

function buildGo(out) {
  log("dev", "building Go commands")
  const result = spawnSync("go", ["build", "-o", out + "/", "./cmd/..."], { cwd: apiDir, stdio: "inherit" })
  return result.status === 0
}

// Rebuilds and restarts the Go processes when Go sources change. The new
// binaries are built next to the running ones, so a compile error leaves the
// old processes running (and Windows can't overwrite a running .exe).
function watchGo(group, services) {
  const next = join(binDir, ".next")
  let timer
  let building = false
  let again = false
  const rebuild = async () => {
    if (building) return void (again = true)
    building = true
    log("dev", "Go sources changed; rebuilding")
    rmSync(next, { recursive: true, force: true })
    if (buildGo(next)) {
      await Promise.all(services.map(s => group.stop(s)))
      for (const name of ["api", "worker"]) {
        const file = isWin ? `${name}.exe` : name
        if (existsSync(join(next, file))) renameSync(join(next, file), join(binDir, file))
      }
      services.forEach(s => group.start(s))
    } else {
      log("dev", "build failed; still running the previous version")
    }
    building = false
    if (again) {
      again = false
      rebuild()
    }
  }
  watch(apiDir, { recursive: true }, (_event, file) => {
    if (!file || /^(bin|data)[\\/]/.test(file) || !/\.(go|json|geojson|sql)$|^go\.(mod|sum)$/.test(file)) return
    clearTimeout(timer)
    timer = setTimeout(rebuild, 300)
  })
}

class Group {
  procs = new Map()
  specs = new Map()
  stopping = false

  constructor() {
    this.done = new Promise(r => (this.resolveDone = r))
    const shutdown = () => this.shutdown(0)
    process.on("SIGINT", shutdown)
    process.on("SIGTERM", shutdown)
  }

  add(name, cmd, args, childEnv) {
    this.specs.set(name, { cmd, args, env: childEnv })
  }

  startAll() {
    for (const name of this.specs.keys()) this.start(name)
  }

  start(name) {
    const spec = this.specs.get(name)
    const [cmd, args] = spec.cmd === "pnpm" ? pnpm(spec.args) : [spec.cmd, spec.args]
    const child = spawn(cmd, args, {
      cwd: spec.cmd === "pnpm" ? root : apiDir,
      env: spec.env.NO_COLOR ? spec.env : { ...spec.env, FORCE_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    })
    const entry = { child, exited: new Promise(r => child.on("exit", r)), expected: false }
    this.procs.set(name, entry)
    for (const stream of [child.stdout, child.stderr]) {
      createInterface({ input: stream }).on("line", line => log(name, line))
    }
    child.on("error", err => log(name, `failed to start: ${err.message}`))
    entry.exited.then(code => {
      if (this.procs.get(name) === entry) this.procs.delete(name)
      if (this.stopping || entry.expected) return
      log(name, `exited with code ${code}`)
      if (code !== 0) this.shutdown(code ?? 1)
    })
  }

  async stop(name) {
    const entry = this.procs.get(name)
    if (!entry) return
    entry.expected = true
    kill(entry.child)
    await entry.exited
  }

  async shutdown(code) {
    if (this.stopping) return
    this.stopping = true
    log("dev", "stopping")
    await Promise.race([Promise.all([...this.procs.keys()].map(n => this.stop(n))), new Promise(r => setTimeout(r, 5000))])
    this.resolveDone()
    process.exit(code)
  }
}

// Runs pnpm's own entry script with Node when started through pnpm, so no
// shell is needed to find pnpm.cmd on Windows.
function pnpm(args) {
  const entry = process.env.npm_execpath
  if (entry && /\.c?js$/.test(entry)) return [process.execPath, [entry, ...args]]
  return isWin ? ["cmd.exe", ["/d", "/s", "/c", "pnpm", ...args]] : ["pnpm", args]
}

function kill(child) {
  if (child.exitCode !== null) return
  if (isWin) spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" })
  else child.kill("SIGTERM")
}

function log(name, line) {
  const tag = name.padEnd(6)
  for (const part of String(line).split("\n")) {
    process.stdout.write(useColor ? `\x1b[${COLORS[name] ?? 37}m${tag}\x1b[0m ${part}\n` : `${tag} ${part}\n`)
  }
}

function fail(message) {
  log("dev", message)
  process.exit(1)
}

function run(cmd, args, opts) {
  const result = spawnSync(cmd, args, { stdio: "inherit", ...opts })
  if (result.status !== 0) fail(`${cmd} ${args.join(" ")} failed`)
}

function requireGo() {
  if (spawnSync("go", ["version"], { stdio: "ignore" }).status !== 0) fail("Go is not installed or not on PATH (needs Go 1.26+)")
}

function rel(p) {
  return p.startsWith(root) ? p.slice(root.length + 1) : p
}

// Root .env values, with the real environment taking precedence.
function loadEnv() {
  const fromFile = {}
  const file = join(root, ".env")
  if (existsSync(file)) {
    for (let line of readFileSync(file, "utf8").split(/\r?\n/)) {
      line = line.trim().replace(/^export\s+/, "")
      if (!line || line.startsWith("#")) continue
      const eq = line.indexOf("=")
      if (eq < 0) continue
      let value = line.slice(eq + 1).trim()
      if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1)
      fromFile[line.slice(0, eq).trim()] = value
    }
  }
  return { ...fromFile, ...process.env }
}

await main()
