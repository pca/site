import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, Outlet, redirect, useRouter, useLocation, useSearch } from "@tanstack/react-router"
import { Fragment } from "react"

import { MaintenanceBanner } from "../components/Maintenance"
import { api, dashboardQuery, sessionQuery } from "../lib/api"
import { workbenchSections, workbenchSearch } from "../lib/analytics-navigation"
import { AnalyticsSectionIcon } from "../components/analytics/AnalyticsSectionIcon"
import "../analytics-shell.css"

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery)
    if (!session) throw redirect({ to: "/login", search: { redirect: location.href } })
    return { session }
  },
  component: AuthedLayout,
})

const NAV = [
  { to: "/", label: "Dashboard", exact: true },
  { to: "/analytics-workbench", label: "Analytics", exact: false },
  { to: "/campaigns", label: "Campaigns", exact: true },
  { to: "/preview-library", label: "Preview library", exact: false },
  { to: "/requests", label: "Region requests", exact: false },
  { to: "/users", label: "Users", exact: false },
  { to: "/jobs", label: "Jobs", exact: false },
  { to: "/backups", label: "Backups", exact: false },
  { to: "/settings", label: "Settings", exact: false },
] as const

function AuthedLayout() {
  const { session } = Route.useRouteContext()
  const queryClient = useQueryClient()
  const router = useRouter()
  const location = useLocation()
  const analyticsOpen = location.pathname.includes("/analytics-workbench")
  const search = workbenchSearch(useSearch({ strict: false }) as Record<string, unknown>)
  const pending = useQuery({ ...dashboardQuery, select: d => d.request_counts.pending })

  const logout = useMutation({
    mutationFn: () => api("session", { method: "DELETE" }),
    onSettled: async () => {
      queryClient.clear()
      queryClient.setQueryData(sessionQuery.queryKey, null)
      await router.navigate({ to: "/login" })
    },
  })

  return (
    <div className={`min-h-screen md:flex ${analyticsOpen?"admin-analytics-shell":""}`}>
      <aside className="admin-shell-sidebar border-b border-zinc-200 bg-white md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-brand text-xs font-bold text-zinc-900 admin-brand">PCA</span>
          <span className="font-semibold">Admin</span>
          {analyticsOpen&&<button type="button" className="ml-auto text-xs text-zinc-500 md:hidden" onClick={()=>logout.mutate()}>Sign out</button>}
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-0" aria-label="Admin">
          {NAV.map(item => <Fragment key={item.to}>
            <Link
              to={item.to}
              search={item.to === "/campaigns" ? { ...search, view: undefined } : undefined}
              activeOptions={{ exact: item.exact, includeSearch: false }}
              className="flex shrink-0 items-center justify-between rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
              activeProps={{ className: "bg-zinc-100 font-medium text-zinc-900" }}
            >
              {item.label}
              {item.to === "/requests" && !!pending.data && (
                <span className="ml-2 rounded-full bg-brand px-2 text-xs font-semibold text-zinc-900">{pending.data}</span>
              )}
            </Link>
            {analyticsOpen && item.to === "/analytics-workbench" && (
              <div className="admin-analytics-subnav" aria-label="Analytics sections">
                {["Report", "Investigate", "Improve", "Setup"].map(group => (
                  <div key={group}>
                    <span>{group}</span>
                    {workbenchSections.filter(entry => entry.group === group).map(entry => (
                      <Link
                        key={entry.id}
                        to="/analytics-workbench/$section"
                        params={{ section: entry.id }}
                        search={{ ...search, view: undefined }}
                        activeOptions={{ includeSearch: false }}
                        activeProps={{ className: "is-active" }}
                      >
                        <AnalyticsSectionIcon section={entry.id} />
                        <span>{entry.label}</span>
                        {entry.stage === "Design only" && <small>Preview</small>}
                      </Link>
                    ))}
                  </div>
                ))}
                <Link to="/analytics-workbench/$section" params={{ section: "overview" }} search={{ ...search, view: undefined }} className="admin-guide-link">
                  Workspace guide
                </Link>
              </div>
            )}
          </Fragment>)}
        </nav>
        <div className="hidden px-4 py-4 text-xs text-zinc-500 md:absolute md:bottom-0 md:block">
          Signed in as <strong className="text-zinc-700">{session.user.username}</strong>
          <button type="button" className="link mt-1 block" onClick={() => logout.mutate()}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <MaintenanceBanner />
        <div className="p-4 md:p-8">
        {!analyticsOpen&&<div className="mb-4 flex justify-end md:hidden">
          <button type="button" className="btn" onClick={() => logout.mutate()}>
            Sign out
          </button>
        </div>}
        <Outlet />
        </div>
      </main>
    </div>
  )
}
