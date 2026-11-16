/** Framework-independent tracking rules. No credentials or visitor profile data. */
export const ANALYTICS_HOSTS = ["pinoycubers.org", "www.pinoycubers.org"]
const BETA_ANALYTICS_HOST = "beta.pinoycubers.org"
// Also protect the checked-in production stream when a beta build omits its ID.
const PRODUCTION_STREAM_ID = "G-EGQD2JBT77"
const validMeasurementId = (id: string) => /^G-[A-Z0-9]+$/.test(id)
export const ANALYTICS_PAGES: Record<string, string> = {
  "/regional-rankings": "Regional Rankings",
  "/regional-statistics": "Regional Statistics",
}
export type AnalyticsFeature = "rankings_filters" | "region_prompt" | "statistics_tabs"
export interface AnalyticsEvents {
  content_view: { content_page: "rankings" | "statistics"; event_id?: string; region_id?: string; result_type?: "single" | "average"; view_id?: string; content_entry: "initial" | "change" }
  feature_exposed: { feature_name: AnalyticsFeature; exposure_method: "viewport" | "interaction" }
  feature_used: { feature_name: AnalyticsFeature; action: "event_changed" | "region_changed" | "format_changed" | "view_changed" | "login_started" }
  rankings_filter_changed: { filter_name: "event" | "region" | "format"; event_id: string; result_type: "single" | "average"; region_id: string }
  statistics_view_changed: { view_id: string }
  statistics_event_changed: { event_id: string }
  region_prompt_viewed: Record<string, never>
  wca_login_started: Record<string, never>
  wca_login_completed: Record<string, never>
  wca_login_failed: Record<string, never>
  region_request_submitted: Record<string, never>
  region_request_failed: Record<string, never>
}
export type AnalyticsMode = "off" | "debug" | "production" | "beta"
/** An identifier alone must not silently enable collection in a release. */
export function analyticsBuildMode(settings:{development:boolean;production:boolean;debug?:string;enabled?:string}):AnalyticsMode {
  if(settings.development&&settings.debug==="1")return "debug"
  return settings.production&&settings.enabled==="1"?"production":"off"
}
/** The exact beta host has its own opt-in and never falls back to production. */
export function analyticsDestination(raw: string, settings: Parameters<typeof analyticsBuildMode>[0] & {
  productionId: string
  betaId?: string
  betaEnabled?: string
}): { id: string; mode: AnalyticsMode } {
  const off = { id: "", mode: "off" } as const
  try {
    const url = new URL(raw)
    const productionId = settings.productionId.trim()
    if (url.hostname === BETA_ANALYTICS_HOST) {
      const id = settings.betaId?.trim() ?? ""
      if (!settings.production || settings.development || url.protocol !== "https:" || settings.betaEnabled !== "1" ||
          !validMeasurementId(id) || id === productionId || id === PRODUCTION_STREAM_ID) return off
      return { id, mode: "beta" }
    }
    return { id: productionId, mode: analyticsBuildMode(settings) }
  } catch { return off }
}
export interface AnalyticsRuntime {
  href: () => string
  referrer: () => string
  permitted: () => boolean
  send: (...args: unknown[]) => void
  loadTag: (id: string) => void
  disable: (id: string, disabled: boolean) => void
}
const EVENT_FIELDS: Record<keyof AnalyticsEvents, readonly string[]> = {
  content_view: ["content_page", "event_id", "region_id", "result_type", "view_id", "content_entry"],
  feature_exposed: ["feature_name", "exposure_method"],
  feature_used: ["feature_name", "action"],
  rankings_filter_changed: ["filter_name", "event_id", "result_type", "region_id"],
  statistics_view_changed: ["view_id"],
  statistics_event_changed: ["event_id"],
  region_prompt_viewed: [], wca_login_started: [], wca_login_completed: [], wca_login_failed: [],
  region_request_submitted: [], region_request_failed: [],
}

/** Explicit campaign fields survive URL sanitization, never arbitrary queries.
 * Only a complete, consistently named external-entry campaign is accepted.
 */
export function safeCampaign(raw: string, referrer: string) {
  const safe: Record<string, string> = {}
  try {
    const url = new URL(raw)
    if (referrer) {
      const host = new URL(referrer).hostname
      if (ANALYTICS_HOSTS.includes(host) || (host === BETA_ANALYTICS_HOST && url.hostname === BETA_ANALYTICS_HOST)) return safe
    }
    const keys = { utm_source: "campaign_source", utm_medium: "campaign_medium", utm_campaign: "campaign_name", utm_content: "campaign_content" }
    if (!["utm_source", "utm_medium", "utm_campaign"].every(key => url.searchParams.has(key))) return safe
    for (const [input, output] of Object.entries(keys)) {
      const values = url.searchParams.getAll(input)
      if (values.length > 1 || (values.length && !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(values[0]))) return {}
      if (values.length) safe[output] = values[0]
    }
    return safe
  } catch { return {} }
}

export function cleanPagePath(pathname: string) {
  return pathname.replace(/\/+$/, "") || "/"
}

/** Strip queries, fragments, credentials, and arbitrary paths from referrers. */
export function safeReferrer(raw: string) {
  try {
    const url = new URL(raw)
    if (!/^https?:$/.test(url.protocol)) return ""
    const path = cleanPagePath(url.pathname)
    return `${url.origin}${ANALYTICS_HOSTS.includes(url.hostname) && ANALYTICS_PAGES[path] ? path : ""}`
  } catch { return "" }
}

export function eligiblePage(raw: string, mode: AnalyticsMode) {
  try {
    const url = new URL(raw)
    const path = cleanPagePath(url.pathname)
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    if (mode === "off" || !ANALYTICS_PAGES[path]) return null
    if (mode === "production" && (url.protocol !== "https:" || !ANALYTICS_HOSTS.includes(url.hostname))) return null
    if (mode === "beta" && (url.protocol !== "https:" || url.hostname !== BETA_ANALYTICS_HOST)) return null
    if (mode === "debug" && !local) return null
    // Wait for the OAuth handler to remove sensitive callback values before loading Google.
    const sensitive = /^(code|state|access_token|id_token|token|key|email|password|auth|authorization)$/i
    if ([...url.searchParams.keys()].some(key => sensitive.test(key))) return null
    if (/(?:code|token|password|email)=/i.test(url.hash)) return null
    return { path, location: `${url.origin}${path}`, title: `${ANALYTICS_PAGES[path]} | Philippine Cubers Association` }
  } catch { return null }
}

export function createAnalyticsTracker(id: string, mode: AnalyticsMode, runtime: AnalyticsRuntime) {
  let initialized = false
  let lastLocation = ""
  let currentReferrer = ""
  let lastContent = ""
  const exposures = new Set<AnalyticsFeature>()
  const pendingOutcomes: (keyof Pick<AnalyticsEvents, "wca_login_completed" | "wca_login_failed">)[] = []

  const send = (name: string, parameters: Record<string, unknown>) => runtime.send("event", name, {
    ...parameters, send_to: id, tracking_version: "2",
  })

  function syncPage() {
    const page = eligiblePage(runtime.href(), mode)
    if (!validMeasurementId(id) || (mode === "beta" && id === PRODUCTION_STREAM_ID) || !page || !runtime.permitted()) {
      if (validMeasurementId(id)) runtime.disable(id, true)
      return false
    }
    runtime.disable(id, false)
    const changed = lastLocation !== page.location
    if (changed) currentReferrer = lastLocation || safeReferrer(runtime.referrer())
    const metadata = { page_location: page.location, page_referrer: currentReferrer, page_title: page.title }
    // Keep defaults safe for automatic session/engagement events, not just explicit events.
    runtime.send("set", metadata)
    if (!initialized) {
      runtime.send("set", safeCampaign(runtime.href(), runtime.referrer()))
      runtime.send("js", new Date())
      runtime.send("config", id, {
        // Page defaults stay at the global level so later route updates take effect.
        send_page_view: false,
        cookie_expires: 0,
        ...(mode === "beta" ? { cookie_domain: "none", cookie_prefix: "pca_beta" } : {}),
        allow_google_signals: false, allow_ad_personalization_signals: false,
      })
      runtime.loadTag(id)
      initialized = true
    }
    if (changed) {
      lastLocation = page.location
      exposures.clear()
      lastContent = ""
      send("page_view", metadata)
    }
    for (const name of pendingOutcomes.splice(0)) send(name, metadata)
    return true
  }

  function track<K extends keyof AnalyticsEvents>(name: K, parameters: AnalyticsEvents[K]) {
    if (!syncPage()) return false
    // Restrict runtime payloads too: accidental extra fields and free text are dropped.
    const safe: Record<string, string> = {}
    for (const key of EVENT_FIELDS[name]) {
      const value = (parameters as Record<string, unknown>)[key]
      if (typeof value === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(value)) safe[key] = value
    }
    send(name, { ...safe, page_location: lastLocation, page_referrer: currentReferrer })
    return true
  }

  function expose(feature: AnalyticsFeature, method: "viewport" | "interaction" = "viewport") {
    if (!syncPage() || exposures.has(feature)) return false
    if (!track("feature_exposed", { feature_name: feature, exposure_method: method })) return false
    exposures.add(feature)
    if (feature === "region_prompt") track("region_prompt_viewed", {})
    return true
  }

  function use(feature: AnalyticsFeature, action: AnalyticsEvents["feature_used"]["action"]) {
    // Actual use can precede the visibility timer; count it as an interaction exposure.
    expose(feature, "interaction")
    return track("feature_used", { feature_name: feature, action })
  }

  function loginOutcome(name: "wca_login_completed" | "wca_login_failed") {
    // Hold only a fixed outcome name while the callback URL is cleaned.
    if (!track(name, {}) && mode !== "off" && runtime.permitted() && pendingOutcomes.length === 0) pendingOutcomes.push(name)
  }

  function contentView(content: Omit<AnalyticsEvents["content_view"], "content_entry">) {
    if (!syncPage()) return false
    const page = eligiblePage(runtime.href(), mode)
    if ((content.content_page === "rankings" ? "/regional-rankings" : "/regional-statistics") !== page?.path) return false
    const key = JSON.stringify([content.content_page, content.event_id ?? "", content.region_id ?? "", content.result_type ?? "", content.view_id ?? ""])
    if (lastContent === key) return false
    const entry = lastContent ? "change" : "initial"
    if (!track("content_view", { ...content, content_entry: entry })) return false
    lastContent = key
    return true
  }

  return { syncPage, track, expose, use, loginOutcome, contentView }
}
