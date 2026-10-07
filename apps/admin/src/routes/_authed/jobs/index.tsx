import { formatDateTime, formatDuration, pageSearch, timeAgo } from "@pca/shared"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useState } from "react"

import { ErrorState, JobBadge, Loading, Notice, PageHeader, Pager } from "../../../components/ui"
import { api, errorMessage, jobsQuery } from "../../../lib/api"
import { SyncScheduleCard } from "../../../components/SyncSchedule"
import { WorkerStatus } from "../../../components/WorkerStatus"

const KIND_HELP: Record<string, string> = {
  sync: "Download the latest WCA results export, import it, then rebuild statistics.",
  statistics: "Rebuild the regional and growth statistics from the current data.",
  assign_regions: "Re-match Philippine competitions to regions using the boundary map.",
}

export const Route = createFileRoute("/_authed/jobs/")({
  validateSearch: (s: Record<string, unknown>): { page?: number } => ({
    page: pageSearch(s.page),
  }),
  loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
  loader: ({ context, deps }) => context.queryClient.prefetchQuery(jobsQuery(deps.page)),
  component: JobsPage,
})

function JobsPage() {
  const { page = 1 } = Route.useSearch()
  const { session } = Route.useRouteContext()
  const navigate = useNavigate({ from: Route.fullPath })
  const queryClient = useQueryClient()
  const { data, error, isPending, refetch } = useQuery({ ...jobsQuery(page), placeholderData: keepPreviousData })
  const [force, setForce] = useState(false)
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string; id?: number } | null>(null)

  const enqueue = useMutation({
    mutationFn: (kind: string) => api<{ message: string; id: number; created: boolean }>("jobs", { method: "POST", json: { kind, force } }),
    onSuccess: res => {
      setNotice({ kind: "success", text: res.message, id: res.id })
      queryClient.invalidateQueries({ queryKey: ["jobs"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    },
    onError: err => setNotice({ kind: "error", text: errorMessage(err) }),
  })

  return (
    <>
      <PageHeader
        title="Jobs"
        description="The worker runs these in the background, on a schedule or when queued here."
      />

      <SyncScheduleCard />

      {notice && (
        <Notice kind={notice.kind} onClose={() => setNotice(null)}>
          {notice.text}{" "}
          {notice.id && (
            <Link to="/jobs/$id" params={{ id: notice.id }} className="underline">
              Follow job #{notice.id}
            </Link>
          )}
        </Notice>
      )}

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <section className="card p-4 lg:col-span-2">
          <h2 className="mb-3 font-semibold">Run now</h2>
          <ul className="space-y-3">
            {session.meta.job_kinds.map(kind => (
              <li key={kind.id} className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <div className="font-medium">{kind.label}</div>
                  <div className="text-zinc-500">{KIND_HELP[kind.id]}</div>
                </div>
                <button type="button" className="btn btn-primary" disabled={enqueue.isPending} onClick={() => enqueue.mutate(kind.id)}>
                  Queue
                </button>
              </li>
            ))}
          </ul>
          <label className="mt-4 flex cursor-pointer items-center gap-2 border-t border-zinc-200 pt-3 text-sm select-none">
            <input type="checkbox" className="checkbox" checked={force} onChange={e => setForce(e.target.checked)} />
            Force: re-import the WCA export even when it hasn't changed
          </label>
        </section>
        <section className="card p-4">
          <h2 className="mb-3 font-semibold">Worker</h2>
          {data ? <WorkerStatus worker={data.worker} /> : <Loading />}
        </section>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isPending ? (
        <Loading />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Status</th>
                <th>Started by</th>
                <th>Queued</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-zinc-500">
                    No jobs have run yet.
                  </td>
                </tr>
              )}
              {data.items.map(j => (
                <tr key={j.id}>
                  <td>
                    <Link to="/jobs/$id" params={{ id: j.id }} className="link font-medium">
                      {j.kind_label} #{j.id}
                    </Link>
                    {j.force && <span className="ml-2 text-xs text-zinc-400">forced</span>}
                    {j.error && <div className="max-w-md truncate text-xs text-red-600">{j.error}</div>}
                  </td>
                  <td>
                    <JobBadge status={j.status} />
                  </td>
                  <td className="text-zinc-500">{j.requested_by || j.source}</td>
                  <td className="whitespace-nowrap text-zinc-500" title={formatDateTime(j.created_at)}>
                    {timeAgo(j.created_at)}
                  </td>
                  <td className="tabular-nums text-zinc-500">{j.finished_at ? formatDuration(j.duration_ms) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.pages > 1 && (
            <Pager page={data.page} pages={data.pages} total={data.total} onPage={p => navigate({ search: { page: p > 1 ? p : undefined } })} />
          )}
        </div>
      )}
    </>
  )
}
