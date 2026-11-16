// Local, sanitized comparison backup. Never copies Git, credentials or databases.
import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const destination = process.argv[2] && resolve(process.argv[2])
if (!destination || destination === root || !relative(root, destination).startsWith("..")) {
  throw new Error("Provide a new backup directory outside the repository.")
}
await stat(join(root, "apps/admin/dist/index.html"))
await mkdir(destination, { recursive: false }) // Refuse to overwrite an earlier backup.
const paths = [
  "apps/admin/src", "apps/admin/package.json", "apps/admin/tsconfig.json", "apps/admin/vite.config.ts",
  "apps/api/internal/analyticsreport", "apps/api/internal/admin/analytics.go", "apps/api/internal/admin/analytics_test.go",
  "apps/web/src/lib/analytics-core.ts", "apps/web/src/lib/analytics.ts", "apps/web/src/lib/useFeatureExposure.ts",
  "docs/analytics-local-implementation.md", "docs/analytics-workbench-v3.md", "docs/analytics-verification.md",
]
for (const path of paths) {
  await mkdir(dirname(join(destination, "source", path)), { recursive: true })
  await cp(join(root, path), join(destination, "source", path), { recursive: true, errorOnExist: true, force: false })
}
await cp(join(root, "apps/admin/dist"), join(destination, "admin"), { recursive: true, errorOnExist: true, force: false })
const files = []
async function inventory(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) await inventory(path)
    else if (entry.isFile()) files.push({ path: relative(destination, path), sha256: createHash("sha256").update(await readFile(path)).digest("hex") })
    else throw new Error("Unexpected non-file in backup")
  }
}
await inventory(destination)
await writeFile(join(destination, "snapshot.json"), JSON.stringify({ version: 1, label: "Before · Workspace 03", createdAt: new Date().toISOString(), sampleOnly: true, files }, null, 2), { flag: "wx" })
console.log(`Saved ${files.length} source/build files to ${destination}. No credentials, database, Git or private instructions included.`)
