import { formatDateTime } from "@pca/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import { useEffect, useState, type ReactNode } from "react"

import { ErrorState, Loading, Notice, PageHeader, RegionLabel, RegionSelect, RequestBadge } from "../../../components/ui"
import { api, errorMessage, userQuery, type AdminUser, type Message } from "../../../lib/api"

export const Route = createFileRoute("/_authed/users/$id")({
  params: {
    parse: ({ id }) => {
      const n = Number(id)
      if (!Number.isInteger(n) || n <= 0) throw notFound()
      return { id: n }
    },
    stringify: ({ id }) => ({ id: String(id) }),
  },
  loader: ({ context, params }) => context.queryClient.prefetchQuery(userQuery(params.id)),
  component: UserPage,
})

function UserPage() {
  const { id } = Route.useParams()
  const { data, error, isPending, refetch } = useQuery(userQuery(id))
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null)

  if (isPending) return <Loading />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  const { user, requests, is_self } = data

  return (
    <>
      <div className="mb-2 text-sm">
        <Link to="/users" className="link">
          ← Users
        </Link>
      </div>
      <PageHeader
        title={user.name || user.username}
        description={
          <>
            {user.wca_id ? (
              <a href={`https://www.worldcubeassociation.org/persons/${user.wca_id}`} target="_blank" rel="noreferrer" className="link">
                {user.wca_id}
              </a>
            ) : (
              "No WCA ID"
            )}{" "}
            · {user.username}
            {user.email && <> · {user.email}</>}
          </>
        }
      />

      {notice && (
        <Notice kind={notice.kind} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <RegionCard user={user} onNotice={setNotice} />

          <section className="card">
            <h2 className="border-b border-zinc-200 px-4 py-3 font-semibold">Region requests</h2>
            {requests.length === 0 ? (
              <p className="px-4 py-6 text-sm text-zinc-500">No requests yet.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Requested</th>
                    <th>Status</th>
                    <th>Notes</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map(r => (
                    <tr key={r.id}>
                      <td className="font-medium">
                        <RegionLabel id={r.region} />
                      </td>
                      <td>
                        <RequestBadge status={r.status} />
                      </td>
                      <td className="text-zinc-500">{r.staff_notes || "—"}</td>
                      <td className="whitespace-nowrap text-zinc-500">{formatDateTime(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {requests.some(r => r.status === "p") && (
              <div className="border-t border-zinc-200 px-4 py-3 text-sm">
                <Link to="/requests" search={{ q: user.wca_id ?? user.username }} className="link">
                  Review the pending request
                </Link>
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="card p-4 text-sm">
            <h2 className="mb-3 font-semibold">Account</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
              <Row label="Joined">{formatDateTime(user.date_joined)}</Row>
              <Row label="Last login">{user.last_login ? formatDateTime(user.last_login) : "Never"}</Row>
              <Row label="Sign-in">{user.has_wca_account ? "WCA account" : "Added by staff"}</Row>
              <Row label="Active">{user.is_active ? "Yes" : "No"}</Row>
              <Row label="Role">{user.is_superuser ? "Superuser" : user.is_staff ? "Staff" : "Member"}</Row>
            </dl>
          </section>
          <StaffCard user={user} isSelf={is_self} onNotice={setNotice} />
        </div>
      </div>
    </>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-zinc-400">{label}</dt>
      <dd>{children}</dd>
    </>
  )
}

type OnNotice = (n: { kind: "success" | "error"; text: string }) => void

function useUserMutation<T>(user: AdminUser, path: string, onNotice: OnNotice, onSuccess?: () => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (json: T) => api<Message>(`users/${user.id}/${path}`, { method: "PUT", json }),
    onSuccess: res => {
      onNotice({ kind: "success", text: res.message })
      onSuccess?.()
      queryClient.invalidateQueries({ queryKey: ["user", user.id] })
      queryClient.invalidateQueries({ queryKey: ["users"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    },
    onError: err => onNotice({ kind: "error", text: errorMessage(err) }),
  })
}

function RegionCard({ user, onNotice }: { user: AdminUser; onNotice: OnNotice }) {
  const [region, setRegion] = useState(user.region ?? "")
  useEffect(() => setRegion(user.region ?? ""), [user.region])
  const save = useUserMutation<{ region: string | null }>(user, "region", onNotice)

  return (
    <section className="card p-4">
      <h2 className="mb-1 font-semibold">Region</h2>
      <p className="mb-3 text-sm text-zinc-500">
        Currently <strong className="text-zinc-700"><RegionLabel id={user.region} /></strong>
        {user.region_updated_at && <> · set {formatDateTime(user.region_updated_at)}</>}. Changing it here skips the request queue.
      </p>
      <form
        className="flex flex-wrap gap-3"
        onSubmit={e => {
          e.preventDefault()
          save.mutate({ region: region || null })
        }}
      >
        <RegionSelect className="max-w-sm" aria-label="Region" value={region} onChange={setRegion} extra={[{ value: "", label: "No region" }]} />
        <button type="submit" className="btn btn-primary" disabled={save.isPending || region === (user.region ?? "")}>
          {save.isPending ? "Saving…" : "Save region"}
        </button>
      </form>
    </section>
  )
}

function StaffCard({ user, isSelf, onNotice }: { user: AdminUser; isSelf: boolean; onNotice: OnNotice }) {
  const [password, setPassword] = useState("")
  const staff = useUserMutation<{ staff: boolean }>(user, "staff", onNotice)
  const pass = useUserMutation<{ password: string }>(user, "password", onNotice, () => setPassword(""))

  return (
    <section className="card p-4 text-sm">
      <h2 className="mb-1 font-semibold">Admin access</h2>
      <p className="mb-3 text-zinc-500">
        {user.is_staff
          ? user.has_password
            ? "Can sign in to this admin."
            : "Is staff but has no password yet, so cannot sign in."
          : "Staff can sign in here with a username and password."}
      </p>
      <button
        type="button"
        className={`btn w-full ${user.is_staff ? "btn-deny" : ""}`}
        disabled={staff.isPending || (isSelf && user.is_staff)}
        title={isSelf && user.is_staff ? "You cannot remove your own staff access." : undefined}
        onClick={() => {
          if (user.is_staff && !confirm(`Remove admin access for ${user.name || user.username}?`)) return
          staff.mutate({ staff: !user.is_staff })
        }}
      >
        {user.is_staff ? "Remove staff access" : "Make staff"}
      </button>

      {user.is_staff && (
        <form
          className="mt-4 border-t border-zinc-200 pt-4"
          onSubmit={e => {
            e.preventDefault()
            pass.mutate({ password })
          }}
        >
          <label className="label" htmlFor="new-password">
            {user.has_password ? "Change password" : "Set password"}
          </label>
          <input
            id="new-password"
            type="password"
            className="input mb-2"
            autoComplete="new-password"
            minLength={10}
            required
            placeholder="At least 10 characters"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          <p className="mb-3 text-xs text-zinc-500">
            Sign-in username: <code>{user.username}</code>
          </p>
          <button type="submit" className="btn w-full" disabled={pass.isPending}>
            {pass.isPending ? "Saving…" : "Save password"}
          </button>
        </form>
      )}
    </section>
  )
}
