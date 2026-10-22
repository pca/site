// TanStack's pages.json includes even sitemap-excluded routes. Keep the
// public page list consistent with the sitemap for the static website.
// Usage: node scripts/filter-public-pages.mjs <pages.json>
import { readFile, writeFile } from "node:fs/promises"

const file = process.argv[2]
if (!file) throw new Error("Expected a pages.json path")
const source = await readFile(file, "utf8").catch(error => {
  if (error.code === "ENOENT") return null // Sitemap generation may be disabled.
  throw error
})
if (source !== null) {
  const data = JSON.parse(source)
  data.pages = data.pages.filter(page => page.sitemap?.exclude !== true)
  await writeFile(file, JSON.stringify(data, null, 2) + "\n")
}
