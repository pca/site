import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from "./config"

/** pageHead builds the per-route title, description, canonical and social tags. */
export function pageHead({ title, description = SITE_DESCRIPTION, path }: { title: string; description?: string; path?: string }) {
  const fullTitle = `${title} | ${SITE_TITLE}`
  const canonical = SITE_URL && path ? `${SITE_URL}${path}` : undefined
  return {
    meta: [
      { title: fullTitle },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: SITE_TITLE },
      ...(canonical ? [{ property: "og:url", content: canonical }] : []),
      ...(SITE_URL ? [{ property: "og:image", content: `${SITE_URL}/pca-logo.png` }] : []),
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ],
    links: canonical ? [{ rel: "canonical", href: canonical }] : [],
  }
}
