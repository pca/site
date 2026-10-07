import { ApiError, formatDateTime, isRegionId, pageSearch } from "@pca/shared"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { ErrorState, Loading, Notice, PageHeader, Pager, RegionLabel, RegionSelect } from "../../../components/ui"
import { api, errorMessage, usersQuery, type UserFilters } from "../../../lib/api"

export const Route = createFileRoute("/_authed/users/")({
  validateSearch: (s: Record<string, unknown>): UserFilters => ({
    q: typeof s.q === "string" && s.q ? s.q : undefined,
    region: s.region === "none" || isRegionId(s.region) ? (s.region as string) : undefined,
    staff: s.staff === "true" || s.staff === true ? true : undefined,
    page: pageSearch(s.page),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.prefetchQuery(usersQuery(deps)),
  component: UsersPage,
})

function UsersPage() {
  const filters = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { data, error, isPending, refetch, isPlaceholderData } = useQuery({ ...usersQuery(filters), placeholderData: keepPreviousData })
  const [q, setQ] = useState(filters.q ?? "")
  const [creating, setCreating] = useState(false)

  useEffect(() => setQ(filters.q ?? ""), [filters.q])

  const setFilters = (next: Partial<UserFilters>) => navigate({ search: prev => ({ ...prev, page: undefined, ...next }) })

  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone who signed in with WCA, plus people added by staff."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setCreating(v => !v)}>
            {creating ? "Close" : "Add by WCA ID"}
          </button>
        }
      />

      {creating && <CreateUser onDone={() => setCreating(false)} />}

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
          <input id="q" className="input" placeholder="Name, WCA ID, username or email" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="w-72">
          <label className="label" htmlFor="region">
            Region
          </label>
          <RegionSelect
            id="region"
            value={filters.region ?? ""}
            onChange={region => setFilters({ region: region || undefined })}
            extra={[
              { value: "", label: "Any region", any: true },
              { value: "none", label: "No region" },
            ]}
          />
        </div>
        <label className="flex h-[34px] cursor-pointer items-center gap-2 text-sm select-none">
          <input type="checkbox" className="checkbox" checked={!!filters.staff} onChange={e => setFilters({ staff: e.target.checked || undefined })} />
          Staff only
        </label>
        <button type="submit" className="btn">
          Search
        </button>
      </form>

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isPending ? (
        <Loading />
      ) : (
        <div className={`card overflow-x-auto ${isPlaceholderData ? "opacity-60" : ""}`}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>WCA ID</th>
                <th>Region</th>
                <th>Requests</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-zinc-500">
                    No users match these filters.
                  </td>
                </tr>
              )}
              {data.items.map(u => (
                <tr key={u.id}>
                  <td>
                    <Link to="/users/$id" params={{ id: u.id }} className="link font-medium">
                      {u.name || u.username}
                    </Link>
                    {u.is_staff && <span className="ml-2 rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold text-white uppercase">Staff</span>}
                    {!u.has_wca_account && <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 uppercase">Added</span>}
                  </td>
                  <td className="tabular-nums">{u.wca_id ?? <span className="text-zinc-400">—</span>}</td>
                  <td>
                    <RegionLabel id={u.region} />
                  </td>
                  <td className="tabular-nums">{u.request_count}</td>
                  <td className="whitespace-nowrap text-zinc-500">{formatDateTime(u.date_joined)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.pages > 1 && <Pager page={data.page} pages={data.pages} total={data.total} onPage={page => setFilters({ page: page > 1 ? page : undefined })} />}
        </div>
      )}
    </>
  )
}

function CreateUser({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [wcaId, setWcaId] = useState("")
  const [region, setRegion] = useState("")

  const create = useMutation({
    mutationFn: () => api<{ message: string; id: number }>("users", { method: "POST", json: { wca_id: wcaId.trim().toUpperCase(), region } }),
    onSuccess: res => {
      queryClient.invalidateQueries({ queryKey: ["users"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      onDone()
      navigate({ to: "/users/$id", params: { id: res.id } })
    },
  })
  const existingId =
    create.error instanceof ApiError && create.error.status === 409 ? (create.error.body as { user_id?: number } | undefined)?.user_id : undefined

  return (
    <form
      className="card mb-6 p-4"
      onSubmit={e => {
        e.preventDefault()
        create.mutate()
      }}
    >
      <p className="mb-3 text-sm text-zinc-500">
        Adds a person who has never signed in, so their results count for a region. Their name is taken from the WCA export.
      </p>
      {create.isError && (
        <Notice kind="error">
          {errorMessage(create.error)}{" "}
          {existingId && (
            <Link to="/users/$id" params={{ id: existingId }} className="underline">
              Open their profile
            </Link>
          )}
        </Notice>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <label className="label" htmlFor="new-wca">
            WCA ID
          </label>
          <input
            id="new-wca"
            className="input uppercase"
            placeholder="2016ABCD01"
            pattern="\d{4}[A-Za-z]{4}\d{2}"
            required
            value={wcaId}
            onChange={e => setWcaId(e.target.value)}
          />
        </div>
        <div className="w-72">
          <label className="label" htmlFor="new-region">
            Region
          </label>
          <RegionSelect id="new-region" value={region} onChange={setRegion} extra={[{ value: "", label: "No region yet" }]} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={create.isPending}>
          {create.isPending ? "Adding…" : "Add user"}
        </button>
      </div>
    </form>
  )
}
