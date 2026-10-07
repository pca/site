// Removes scripts and module preloads from a prerendered page so it stays
// static wherever it is served. maintenance.html needs this: shown in place of
// another URL, the client router would otherwise boot and render that URL's
// real page.
//
// Usage: node scripts/static-page.mjs <file.html>...   (missing files are skipped)
import { readFile, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

export async function staticPage(file) {
  const html = await readFile(file, "utf8").catch(() => null)
  if (html === null) return false
  const stripped = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<link\b[^>]*rel=["']?modulepreload["']?[^>]*>/gi, "")
  await writeFile(file, stripped)
  await rm(file + ".gz", { force: true })
  await rm(file + ".br", { force: true })
  return true
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  for (const file of process.argv.slice(2)) await staticPage(file)
}
