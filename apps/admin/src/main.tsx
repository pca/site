import { parseSearch, stringifySearch } from "@pca/shared"
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { isUnauthorized } from "./lib/api"
import { routeTree } from "./routeTree.gen"
import "./styles.css"

// Any 401 means the session ended: forget it and let the guard redirect.
const onError = (error: unknown) => {
  if (isUnauthorized(error)) {
    queryClient.setQueryData(["session"], null)
    router.invalidate()
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: { staleTime: 10_000, retry: (count, error) => !isUnauthorized(error) && count < 1 },
  },
})

const router = createRouter({
  routeTree,
  basepath: import.meta.env.BASE_URL.replace(/\/$/, "") || "/",
  context: { queryClient },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
  parseSearch,
  stringifySearch,
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
