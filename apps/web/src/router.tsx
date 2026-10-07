import { parseSearch, stringifySearch } from "@pca/shared"
import { QueryClient } from "@tanstack/react-query"
import { createRouter } from "@tanstack/react-router"
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query"

import { NotFound } from "./components/NotFound"
import { routeTree } from "./routeTree.gen"

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 5 * 60 * 1000, retry: 1, refetchOnWindowFocus: false },
    },
  })
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultNotFoundComponent: NotFound,
    parseSearch,
    stringifySearch,
  })
  setupRouterSsrQueryIntegration({ router, queryClient })
  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
