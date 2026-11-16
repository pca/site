import { createAnalyticsTracker, analyticsDestination } from "./analytics-core"
import { GA_MEASUREMENT_ID } from "./config"

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    dataLayer?: unknown[]
    /** Local QA only; never sent to Google. */
    pcaAnalyticsDebug?: unknown[][]
  }
}

const href = () => typeof window === "undefined" ? "" : window.location.href
const { id, mode } = analyticsDestination(href(), {
  development: import.meta.env.DEV,
  production: import.meta.env.PROD,
  debug: import.meta.env.VITE_ANALYTICS_DEBUG,
  enabled: import.meta.env.VITE_ANALYTICS_ENABLED,
  productionId: GA_MEASUREMENT_ID,
  betaEnabled: import.meta.env.VITE_BETA_ANALYTICS_ENABLED,
  betaId: import.meta.env.VITE_BETA_GA_MEASUREMENT_ID,
})
const debug = mode === "debug"

function permitted() {
  if (typeof window === "undefined") return false
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
  if (nav.doNotTrack === "1" || (window as Window & { doNotTrack?: string }).doNotTrack === "1" || nav.globalPrivacyControl) return false
  try { return localStorage.getItem("pca-analytics-opt-out") !== "1" } catch { return false }
}

export const analytics = createAnalyticsTracker(id, mode, {
  href,
  referrer: () => typeof document === "undefined" ? "" : document.referrer,
  permitted,
  disable: (id, disabled) => {
    if (typeof window !== "undefined") (window as unknown as Record<string, unknown>)[`ga-disable-${id}`] = disabled
  },
  send: (...args) => {
    if (debug) {
      const events = window.pcaAnalyticsDebug ??= []
      if (events.length >= 200) events.shift()
      events.push(args)
      console.debug(`[PCA analytics] ${JSON.stringify(args)}`)
      return
    }
    window.dataLayer ??= []
    window.gtag ??= function () { window.dataLayer!.push(arguments) }
    window.gtag(...args)
  },
  loadTag: id => {
    if (debug) return
    const script = document.createElement("script")
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
    document.head.appendChild(script)
  },
})
