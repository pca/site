import type { QueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router"
import type { ReactNode } from "react"

import { Analytics, analyticsScripts } from "../components/Analytics"
import { NotFound } from "../components/NotFound"
import { SITE_DESCRIPTION, SITE_TITLE } from "../lib/config"
import appCss from "../styles.css?url"

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: SITE_TITLE },
      { name: "description", content: SITE_DESCRIPTION },
      { name: "theme-color", content: "#ffd329" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/pca-logo.png" },
      { rel: "apple-touch-icon", href: "/pca-logo.png" },
    ],
    scripts: analyticsScripts(),
  }),
  shellComponent: RootDocument,
  component: RootComponent,
  notFoundComponent: NotFound,
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="text-text">
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function RootComponent() {
  return (
    <>
      <Analytics />
      <Outlet />
    </>
  )
}
