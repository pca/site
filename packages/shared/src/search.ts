// Search params as plain strings. TanStack Router's default codec turns
// "444" or "11" into numbers and quotes them back as %22444%22, which breaks
// event and region IDs in shared links.

export const parseSearch = (search: string): Record<string, string> =>
  Object.fromEntries(new URLSearchParams(search.startsWith("?") ? search.slice(1) : search))

export const stringifySearch = (search: Record<string, unknown>): string => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(search)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value))
  }
  const s = params.toString()
  return s ? `?${s}` : ""
}

/** pageSearch reads a 1-based page number, returning undefined for page 1. */
export const pageSearch = (value: unknown): number | undefined => {
  const n = Number(value)
  return Number.isInteger(n) && n > 1 ? n : undefined
}
