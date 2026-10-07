// Collects every built frontend into dist/sites and writes dist/sites/sites.json,
// which the Go server reads (SITES_DIR) to mount each one.
//
// A frontend opts in with a "pcaSite" field in its package.json:
//   "pcaSite": { "mount": "/admin", "dist": "dist", "spa": true }
// mount  URL path it is served under; "/" for the site that owns every
//        otherwise unmatched path (at most one).
// dist   build output directory, relative to the app.
// spa    true serves index.html for unknown paths (client-side routing);
//        false serves 404.html with status 404 (prerendered sites).
//
// A site may ship maintenance.html, which the server shows on every page while
// maintenance mode is on. Its scripts are removed (see static-page.mjs).
//
// SITES=admin,web limits the collection to those app directories; unset
// collects every app (e.g. the public site is hosted elsewhere).
//
// Usage: node scripts/build-sites.mjs   (run after the apps are built)
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

import { precompress } from "./precompress.mjs"
import { staticPage } from "./static-page.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const out = join(root, "dist", "sites")
// Paths the Go server answers itself. /api is shared by every backend.
const RESERVED = ["/api", "/healthz", "/docs", "/openapi.json"]

const fail = message => {
  console.error(`build-sites: ${message}`)
  process.exit(1)
}

const only = (process.env.SITES ?? "").split(",").map(s => s.trim()).filter(Boolean)

const sites = []
for (const entry of await readdir(join(root, "apps"), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  if (only.length > 0 && !only.includes(entry.name)) continue
  const appDir = join(root, "apps", entry.name)
  let pkg
  try {
    pkg = JSON.parse(await readFile(join(appDir, "package.json"), "utf8"))
  } catch {
    continue
  }
  const site = pkg.pcaSite
  if (!site) continue
  const mount = site.mount === "/" ? "/" : String(site.mount ?? "").replace(/\/+$/, "")
  if (!/^\/[a-z0-9\-_/]*$/i.test(mount)) fail(`${entry.name}: "mount" must be a path like "/admin"`)
  if (RESERVED.some(r => mount === r || mount.startsWith(r + "/"))) fail(`${entry.name}: ${mount} is reserved for the server`)
  const dist = join(appDir, site.dist ?? "dist")
  if (!(await stat(dist).catch(() => null))?.isDirectory()) fail(`${entry.name}: ${relative(root, dist)} is missing; build the app first`)
  sites.push({ name: entry.name, mount, spa: Boolean(site.spa), dir: entry.name, dist })
}

if (sites.length === 0) fail(only.length > 0 ? `no pcaSite app matches SITES=${only.join(",")}` : "no app declares a pcaSite")
const seen = new Map()
for (const s of sites) {
  if (seen.has(s.mount)) fail(`${s.name} and ${seen.get(s.mount)} are both mounted at ${s.mount}`)
  seen.set(s.mount, s.name)
}

await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })
for (const s of sites) {
  const target = join(out, s.dir)
  await cp(s.dist, target, { recursive: true })
  await staticPage(join(target, "maintenance.html"))
  const { count } = await precompress(target)
  console.log(`site ${s.name}: ${s.mount} (${s.spa ? "spa" : "static"}), ${count} files precompressed`)
}

sites.sort((a, b) => a.mount.localeCompare(b.mount))
const manifest = sites.map(({ name, mount, spa, dir }) => ({ name, mount, spa, dir }))
await writeFile(join(out, "sites.json"), JSON.stringify(manifest, null, 2) + "\n")
console.log(`wrote ${relative(root, join(out, "sites.json"))}`)
