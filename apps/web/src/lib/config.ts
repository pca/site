const env = import.meta.env

/** Base URL of the public API. Same-origin /api when served by the Go binary. */
export const API_URL: string = (env.VITE_API_URL || "/api").replace(/\/$/, "")

/**
 * Absolute API URL used only while prerendering, so the static HTML can ship
 * with data. Unset means pages are prerendered without data and fetch it in
 * the browser.
 */
export const PRERENDER_API_URL: string | undefined = import.meta.env.SSR
  ? (process.env.PRERENDER_API_URL || "").replace(/\/$/, "") || undefined
  : undefined

/** Public origin of the site (for canonical links and Open Graph). */
export const SITE_URL: string = (env.VITE_SITE_URL || "").replace(/\/$/, "")

export const SITE_TITLE = "Philippine Cubers Association"
export const SITE_DESCRIPTION = "Official Website of Philippine Cubers Association"

export const WCA_URL: string = (env.VITE_WCA_URL || "https://www.worldcubeassociation.org").replace(/\/$/, "")
export const WCA_CLIENT_ID: string =
  env.VITE_WCA_CLIENT_ID || "6751d55b9b1cc5710fed3a47d9c69eca871af9b0f83ec5388a5b0cebe1f93037"

export const GA_MEASUREMENT_ID: string = env.VITE_GA_MEASUREMENT_ID || ""

export const PCA_FACEBOOK_URL = "https://www.facebook.com/groups/PINOYCUBERS"
export const PCA_EMAIL = "pcadevteam@gmail.com"

/** Builds an API URL; during prerendering it targets PRERENDER_API_URL. */
export const apiUrl = (path: string) => `${PRERENDER_API_URL ?? API_URL}/${path.replace(/^\//, "")}`
