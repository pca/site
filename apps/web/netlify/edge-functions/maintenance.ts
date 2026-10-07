// Netlify edge function: while maintenance mode is on in the admin, page
// requests get maintenance.html with a 503, matching what the Go server does
// for sites it hosts. Assets still load, and any API failure leaves the site up.
declare const Netlify: { env: { get(name: string): string | undefined } }

const CHECK_EVERY_MS = 15_000
let last = { enabled: false, at: 0 }

async function maintenanceEnabled(): Promise<boolean> {
  if (Date.now() - last.at < CHECK_EVERY_MS) return last.enabled
  const api = (Netlify.env.get("VITE_API_URL") ?? "").replace(/\/$/, "")
  let enabled = false
  if (api.startsWith("http")) {
    try {
      const res = await fetch(`${api}/maintenance`, { signal: AbortSignal.timeout(2000) })
      if (res.ok) enabled = Boolean(((await res.json()) as { enabled?: boolean }).enabled)
    } catch {
      enabled = last.enabled
    }
  }
  last = { enabled, at: Date.now() }
  return enabled
}

export default async (request: Request) => {
  if (request.method !== "GET" && request.method !== "HEAD") return
  const { pathname } = new URL(request.url)
  if (/\.[a-z0-9]+$/i.test(pathname) && !pathname.endsWith(".html")) return
  if (!(await maintenanceEnabled())) return

  const page = await fetch(new URL("/maintenance.html", request.url))
  if (!page.ok) return
  return new Response(request.method === "HEAD" ? null : page.body, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": "600",
      "X-Robots-Tag": "noindex",
    },
  })
}

export const config = {
  path: "/*",
  excludedPath: ["/assets/*", "/images/*", "/maintenance", "/maintenance.html"],
}
