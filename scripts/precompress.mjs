// Writes .br and .gz siblings for compressible build output so the Go server
// can send them without compressing per request.
// Usage: node scripts/precompress.mjs DIR
import { readdir, readFile, writeFile, stat } from "node:fs/promises"
import { join, extname } from "node:path"
import { pathToFileURL } from "node:url"
import { brotliCompressSync, gzipSync, constants } from "node:zlib"

const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".svg", ".json", ".txt", ".xml", ".webmanifest", ".ttf", ".map"])

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(path)
    else yield path
  }
}

/** precompress compresses every eligible file under root and returns stats. */
export async function precompress(root) {
  let count = 0
  let saved = 0
  for await (const path of walk(root)) {
    if (!COMPRESSIBLE.has(extname(path))) continue
    const { size } = await stat(path)
    if (size < 512) continue
    const data = await readFile(path)
    const br = brotliCompressSync(data, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: size },
    })
    const gz = gzipSync(data, { level: 9 })
    if (br.length < size) await writeFile(path + ".br", br)
    if (gz.length < size) await writeFile(path + ".gz", gz)
    count++
    saved += size - Math.min(br.length, size)
  }
  return { count, saved }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.argv[2]
  if (!root) {
    console.error("usage: precompress.mjs DIR")
    process.exit(2)
  }
  const { count, saved } = await precompress(root)
  console.log(`precompressed ${count} files in ${root} (brotli saves ${(saved / 1024).toFixed(0)} KiB)`)
}
