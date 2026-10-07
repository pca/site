import { timeAgo } from "@pca/shared"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"

import { ErrorState, JobBadge, Loading, PageHeader, RegionLabel, Stat } from "../../components/ui"
import { MaintenanceCard } from "../../components/Maintenance"
import { WorkerStatus } from "../../components/WorkerStatus"
import { dashboardQuery } from "../../lib/api"

export const Route = createFileRoute("/_authed/")({
  loader: ({ context }) => context.queryClient.prefetchQuery(dashboardQuery),
  component: DashboardPage,
})

function DashboardPage() {
  const { data, error, isPending, refetch } = useQuery(dashboardQuery)
  if (isPending) return <Loading />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const maxCount = Math.max(1, ...data.regions.map(r => r.count))
  const withRegion = data.users_total - (data.regions.find(r => r.id === "none")?.count ?? 0)

  return (
    <>
      <PageHeader title="Dashboard" description="Region requests, user regions and background jobs at a glance." />

      <MaintenanceCard />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/requests" search={{ status: "p" }}>
          <Stat label="Pending requests" value={data.request_counts.pending} hint="Waiting for review" />
        </Link>
        <Stat label="Approved" value={data.request_counts.approved} hint={`${data.request_counts.denied} denied`} />
        <Stat label="Users" value={data.users_total.toLocaleString()} hint={`${withRegion.toLocaleString()} with a region`} />
        <Stat
          label="Statistics snapshot"
          value={data.snapshot ? `#${data.snapshot.id}` : "None"}
          hint={data.snapshot ? `${data.snapshot.export_version} · through ${data.snapshot.latest_year}` : "Run a statistics rebuild"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <h2 className="font-semibold">Pending requests</h2>
            <Link to="/requests" search={{ status: "p" }} className="link text-sm">
              Review all
            </Link>
          </div>
          {data.pending.length === 0 ? (
            <p className="px-4 py-6 text-sm text-zinc-500">Nothing to review.</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {data.pending.map(r => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <Link to="/users/$id" params={{ id: r.user_id }} className="link font-medium">
                      {r.user.name}
                    </Link>{" "}
                    <span className="text-zinc-400">{r.user.wca_id}</span>
                    <div className="truncate text-xs text-zinc-500">
                      <RegionLabel id={r.user.region} /> → <strong className="text-zinc-700">{r.region}</strong>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-zinc-400">{timeAgo(r.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <h2 className="font-semibold">Worker</h2>
            <Link to="/jobs" className="link text-sm">
              Jobs
            </Link>
          </div>
          <div className="px-4 py-3">
            <WorkerStatus worker={data.worker} />
          </div>
          <ul className="divide-y divide-zinc-100 border-t border-zinc-200">
            {data.jobs.map(j => (
              <li key={j.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <Link to="/jobs/$id" params={{ id: j.id }} className="link">
                  {j.kind_label} #{j.id}
                </Link>
                <span className="flex items-center gap-2 text-xs text-zinc-400">
                  {timeAgo(j.created_at)} <JobBadge status={j.status} />
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card lg:col-span-2">
          <div className="border-b border-zinc-200 px-4 py-3">
            <h2 className="font-semibold">Users by region</h2>
          </div>
          <ul className="grid gap-x-8 gap-y-1.5 px-4 py-4 sm:grid-cols-2">
            {data.regions.map(r => (
              <li key={r.id} className="text-sm">
                <Link to="/users" search={{ region: r.id }} className="flex items-center gap-3 hover:text-ink">
                  <span className="w-56 shrink-0 truncate" title={r.name}>
                    {r.name}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                    <span className="block h-full rounded-full bg-brand" style={{ width: `${(r.count / maxCount) * 100}%` }} />
                  </span>
                  <span className="w-12 text-right tabular-nums text-zinc-500">{r.count.toLocaleString()}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}
