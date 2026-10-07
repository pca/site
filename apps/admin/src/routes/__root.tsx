import type { QueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router"

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Outlet,
  notFoundComponent: () => (
    <div className="mx-auto max-w-md p-10 text-center">
      <h1 className="text-lg font-semibold">Page not found</h1>
      <Link to="/" className="link mt-3 inline-block">
        Back to the dashboard
      </Link>
    </div>
  ),
})
