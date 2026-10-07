import { formatDateTime, isRegionId, pageSearch, timeAgo } from "@pca/shared"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { ErrorState, Loading, Notice, PageHeader, Pager, RegionLabel, RegionSelect, RequestBadge } from "../../components/ui"
import { api, errorMessage, requestsQuery, type RequestFilters, type RequestStatus } from "../../lib/api"

type Action = "approve" | "deny" | "reopen"

const STATUS_TABS: { id: RequestStatus | "all"; label: string; count?: keyof Counts }[] = [
  { id: "p", label: "Pending", count: "pending" },
  { id: "a", label: "Approved", count: "approved" },
  { id: "d", label: "Denied", count: "denied" },
  { id: "all", label: "All" },
]
type Counts = { pending: number; approved: number; denied: number }

export const Route = createFileRoute("/_authed/requests")({
  validateSearch: (s: Record<string, unknown>): RequestFilters => ({
    status: s.status === "a" || s.status === "d" || s.status === "all" ? s.status : undefined,
    q: typeof s.q === "string" && s.q ? s.q : undefined,
    region: isRegionId(s.region) ? s.region : undefined,
    page: pageSearch(s.page),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.prefetchQuery(requestsQuery(deps)),
  component: RequestsPage,
})

function RequestsPage() {
  const filters = Route.useSearch()
  const { session } = Route.useRouteContext()
  const navigate = useNavigate({ from: Route.fullPath })
  const queryClient = useQueryClient()
  const { data, error, isPending, refetch, isPlaceholderData } = useQuery({ ...requestsQuery(filters), placeholderData: keepPreviousData })
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [notes, setNotes] = useState("")
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null)
  const [q, setQ] = useState(filters.q ?? "")

  useEffect(() => setSelected(new Set()), [filters.status, filters.q, filters.region, filters.page])
  useEffect(() => setQ(filters.q ?? ""), [filters.q])

  const decide = useMutation({
    mutationFn: ({ ids, action }: { ids: number[]; action: Action }) =>
      api<{ message: string }>("requests/decide", { method: "POST", json: { ids, action, notes } }),
    onSuccess: res => {
      setNotice({ kind: "success", text: res.message })
      setSelected(new Set())
      setNotes("")
      queryClient.invalidateQueries({ queryKey: ["requests"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["users"] })
      queryClient.invalidateQueries({ queryKey: ["user"] })
    },
    onError: err => setNotice({ kind: "error", text: errorMessage(err) }),
  })

  const setFilters = (next: Partial<RequestFilters>) =>
    navigate({ search: prev => ({ ...prev, page: undefined, ...next }) })

  const status = filters.status ?? "p"
  const items = data?.items ?? []
  const allSelected = items.length > 0 && items.every(r => selected.has(r.id))
  const toggle = (id: number) =>
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const run = (action: Action, ids: number[]) => {
    if (action === "deny" && !confirm(`Deny ${ids.length} request${ids.length === 1 ? "" : "s"}?`)) return
    decide.mutate({ ids, action })
  }

  return (
    <>
      <PageHeader
        title="Region requests"
        description={
          session.meta.auto_rebuild_statistics
            ? "Approving a request sets the user's region, refreshes rankings and queues a statistics rebuild."
            : "Approving a request sets the user's region and refreshes rankings."
        }
      />

      {notice && (
        <Notice kind={notice.kind} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      <div className="mb-4 flex flex-wrap gap-1 border-b border-zinc-200">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilters({ status: tab.id === "p" ? undefined : tab.id })}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${status === tab.id ? "border-zinc-900 font-medium text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800"}`}
          >
            {tab.label}
            {tab.count && data && <span className="ml-1.5 text-xs text-zinc-400">{data.counts[tab.count].toLocaleString()}</span>}
          </button>
        ))}
      </div>

      <form
        className="mb-4 flex flex-wrap items-end gap-3"
        onSubmit={e => {
          e.preventDefault()
          setFilters({ q: q.trim() || undefined })
        }}
      >
        <div className="min-w-60 flex-1">
          <label className="label" htmlFor="q">
            Search
          </label>
          <input id="q" className="input" placeholder="Name, WCA ID or username" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="w-72">
          <label className="label" htmlFor="region">
            Requested region
          </label>
          <RegionSelect
            id="region"
            value={filters.region ?? ""}
            onChange={region => setFilters({ region: region || undefined })}
            extra={[{ value: "", label: "Any region", any: true }]}
          />
        </div>
        <button type="submit" className="btn">
          Search
        </button>
      </form>

      {selected.size > 0 && (
        <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
          <strong className="text-sm">{selected.size} selected</strong>
          <input
            className="input max-w-md flex-1"
            placeholder="Staff notes (optional, saved on every selected request)"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
          <button type="button" className="btn btn-approve" disabled={decide.isPending} onClick={() => run("approve", [...selected])}>
            Approve
          </button>
          <button type="button" className="btn btn-deny" disabled={decide.isPending} onClick={() => run("deny", [...selected])}>
            Deny
          </button>
          <button type="button" className="btn" disabled={decide.isPending} onClick={() => run("reopen", [...selected])}>
            Reopen
          </button>
        </div>
      )}

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isPending ? (
        <Loading />
      ) : (
        <div className={`card overflow-x-auto ${isPlaceholderData ? "opacity-60" : ""}`}>
          <table className="table">
            <thead>
              <tr>
                <th className="w-8">
                  <input
                    type="checkbox"
                    className="checkbox"
                    aria-label="Select all"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(items.map(r => r.id)))}
                  />
                </th>
                <th>Person</th>
                <th>Current region</th>
                <th>Requested</th>
                <th>Status</th>
                <th>Submitted</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-zinc-500">
                    No requests match these filters.
                  </td>
                </tr>
              )}
              {items.map(r => (
                <tr key={r.id} className={selected.has(r.id) ? "bg-amber-50/60" : ""}>
                  <td>
                    <input type="checkbox" className="checkbox" aria-label={`Select request ${r.id}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                  </td>
                  <td>
                    <Link to="/users/$id" params={{ id: r.user_id }} className="link font-medium">
                      {r.user.name}
                    </Link>
                    <div className="text-xs text-zinc-500">
                      {r.user.wca_id ? (
                        <a href={`https://www.worldcubeassociation.org/persons/${r.user.wca_id}`} target="_blank" rel="noreferrer" className="link">
                          {r.user.wca_id}
                        </a>
                      ) : (
                        r.user.username
                      )}
                    </div>
                  </td>
                  <td>
                    <RegionLabel id={r.user.region} />
                  </td>
                  <td className="font-medium">
                    <RegionLabel id={r.region} />
                    {r.staff_notes && <div className="mt-0.5 text-xs font-normal text-zinc-500">Note: {r.staff_notes}</div>}
                  </td>
                  <td>
                    <RequestBadge status={r.status} />
                  </td>
                  <td className="whitespace-nowrap text-zinc-500" title={formatDateTime(r.created_at)}>
                    {timeAgo(r.created_at)}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <div className="inline-flex gap-1.5">
                      {r.status !== "a" && (
                        <button type="button" className="btn btn-approve px-2 py-1 text-xs" disabled={decide.isPending} onClick={() => run("approve", [r.id])}>
                          Approve
                        </button>
                      )}
                      {r.status !== "d" && (
                        <button type="button" className="btn btn-deny px-2 py-1 text-xs" disabled={decide.isPending} onClick={() => run("deny", [r.id])}>
                          Deny
                        </button>
                      )}
                      {r.status !== "p" && (
                        <button type="button" className="btn px-2 py-1 text-xs" disabled={decide.isPending} onClick={() => run("reopen", [r.id])}>
                          Reopen
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.pages > 1 && (
            <Pager page={data.page} pages={data.pages} total={data.total} onPage={page => setFilters({ page: page > 1 ? page : undefined })} />
          )}
        </div>
      )}
    </>
  )
}
