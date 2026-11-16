/** Only a short-lived, same-tab return destination; never account or report data. */
export const FEEDBACK_LOGIN_RETURN_KEY = "pcaFeedbackLoginReturn"
export const FEEDBACK_ANCHOR = "website-feedback"
export const FEEDBACK_OPEN_EVENT = "pca:open-feedback"
export const FEEDBACK_SLOT = "website-feedback-slot"
export const FEEDBACK_GROUP = "website-feedback-group"
const RETURN_TTL = 15 * 60 * 1000

export function feedbackReturnPath(href: string, origin: string): string | null {
  try {
    const url = new URL(href, origin)
    if (url.origin !== origin || url.username || url.password ||
      !["/regional-rankings", "/regional-statistics"].includes(url.pathname.replace(/\/$/, ""))) return null
    const search = new URLSearchParams()
    for (const key of ["event", "region", "format", "tab"]) {
      const value = url.searchParams.get(key)
      if (value) search.set(key, value)
    }
    return `${url.pathname}${search.size ? `?${search}` : ""}#${FEEDBACK_ANCHOR}`
  } catch { return null }
}

export function rememberFeedbackLogin(storage: Storage, href: string, origin: string, now = Date.now()) {
  const path = feedbackReturnPath(href, origin)
  if (!path) throw new Error("Cannot return to this feedback page.")
  storage.setItem(FEEDBACK_LOGIN_RETURN_KEY, JSON.stringify({ path, created: now }))
}

export function consumeFeedbackLogin(storage: Storage, origin: string, now = Date.now()): string | null {
  try {
    const raw = storage.getItem(FEEDBACK_LOGIN_RETURN_KEY)
    storage.removeItem(FEEDBACK_LOGIN_RETURN_KEY)
    if (!raw) return null
    const intent = JSON.parse(raw)
    if (typeof intent.path !== "string" || typeof intent.created !== "number" ||
      now < intent.created || now - intent.created > RETURN_TTL) return null
    return feedbackReturnPath(intent.path, origin)
  } catch { return null }
}

export function wcaAuthorizeUrl(origin: string, wcaUrl: string, clientId: string) {
  return `${wcaUrl}/oauth/authorize/?${new URLSearchParams({
    client_id: clientId, redirect_uri: `${origin}/regional-rankings`, response_type: "code", scope: "",
  })}`
}
