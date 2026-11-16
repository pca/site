// A loopback-only, sample-only viewer. No proxy to a real API; all writes denied.
import { createServer } from "node:http"
import { readFile, stat } from "node:fs/promises"
import { dirname, extname, relative, resolve, sep } from "node:path"
import { createHash } from "node:crypto"

const folder = process.argv[2] && resolve(process.argv[2])
if (!folder) throw new Error("Provide the saved snapshot folder.")
const manifest = JSON.parse(await readFile(resolve(folder, "snapshot.json"), "utf8"))
if (manifest.version !== 1 || !manifest.sampleOnly) throw new Error("Not a sample analytics snapshot")
for (const entry of manifest.files.filter(entry => entry.path.startsWith("admin/"))) {
  const path = resolve(folder, entry.path)
  if (!relative(folder, path).startsWith(`admin${sep}`)) throw new Error("Invalid asset path")
  if (createHash("sha256").update(await readFile(path)).digest("hex") !== entry.sha256) throw new Error(`Snapshot changed: ${entry.path}`)
}
const port = Number(process.env.PCA_SNAPSHOT_PORT ?? 3002)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid local viewer port")
const assetRoot = resolve(folder, "admin")
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png" }
const json = (res, code, body) => { res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(body)) }
const server = createServer(async (req, res) => {
  if (!["GET", "HEAD"].includes(req.method)) return json(res, 405, { message: "Saved comparison is read-only." })
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`)
    if (url.pathname.startsWith("/api/")) {
      // A synthetic staff session unlocks only this frozen, isolated UI. It has
      // no connection to the real application, account, database or credentials.
      if (url.pathname === "/api/admin/session") return json(res, 200, { user: { id: -1, username: "snapshot-viewer", name: "Sample comparison", is_superuser: false }, csrf_token: "", meta: { regions: [], job_kinds: [], auto_rebuild_statistics: false } })
      if (url.pathname === "/api/admin/dashboard") return json(res, 200, { request_counts: { pending: 0, approved: 0, denied: 0 } })
      if (url.pathname === "/api/maintenance") return json(res, 200, { enabled: false })
      if (url.pathname === "/api/admin/analytics/status") return json(res, 200, { state: "not_configured", message: "Saved comparison is sample-only. No Google connection is available.", hosts: ["pinoycubers.org", "www.pinoycubers.org"], cacheSeconds: 300 })
      return json(res, 503, { message: "Saved comparison has no live API. Use sample analytics pages." })
    }
    if (url.pathname === "/") { res.writeHead(302, { Location: "/admin/analytics-workbench/pages?mode=sample" }); return res.end() }
    if (!url.pathname.startsWith("/admin/")) return json(res, 404, { message: "Not found" })
    const path = resolve(assetRoot, decodeURIComponent(url.pathname.slice("/admin/".length)))
    if (path !== assetRoot && relative(assetRoot, path).startsWith("..")) return json(res, 404, { message: "Not found" })
    let file = path
    try { if (!(await stat(file)).isFile()) file = resolve(assetRoot, "index.html") } catch { file = resolve(assetRoot, "index.html") }
    let body = await readFile(file)
    if (extname(file) === ".html") body = Buffer.from(body.toString().replace(/(<body[^>]*>)/, '$1<div style="padding:9px 16px;background:#fff2bd;color:#46390c;font:12px system-ui;text-align:center" role="note">Saved before version · sample data only · isolated read-only viewer</div>'))
    res.writeHead(200, { "Content-Type": mime[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" })
    res.end(req.method === "HEAD" ? undefined : body)
  } catch { json(res, 404, { message: "Not found" }) }
})
server.listen(port, "127.0.0.1", () => console.log(`Saved comparison: http://127.0.0.1:${port}/admin/analytics-workbench/pages?mode=sample`))
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit()))
