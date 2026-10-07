import { formatDateTime, timeAgo } from "@pca/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { ErrorState, Loading, Notice, PageHeader } from "../../components/ui"
import { api, backupDownloadUrl, backupsQuery, errorMessage, type Backup } from "../../lib/api"

export const Route = createFileRoute("/_authed/backups")({
  loader: ({ context }) => context.queryClient.prefetchQuery(backupsQuery),
  component: BackupsPage,
})

const formatBytes = (n: number) =>
  n >= 1 << 30 ? `${(n / (1 << 30)).toFixed(2)} GB` : n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`

function BackupsPage() {
  const queryClient = useQueryClient()
  const { data, error, isPending, refetch } = useQuery(backupsQuery)
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null)

  const create = useMutation({
    mutationFn: () => api<{ message: string; backup: Backup }>("backups", { method: "POST" }),
    onSuccess: res => {
      setNotice({ kind: "success", text: res.message })
      queryClient.invalidateQueries({ queryKey: ["backups"] })
    },
    onError: err => setNotice({ kind: "error", text: errorMessage(err) }),
  })

  const remove = useMutation({
    mutationFn: (name: string) => api<{ message: string }>(`backups/${encodeURIComponent(name)}`, { method: "DELETE" }),
    onSuccess: res => {
      setNotice({ kind: "success", text: res.message })
      queryClient.invalidateQueries({ queryKey: ["backups"] })
    },
    onError: err => setNotice({ kind: "error", text: errorMessage(err) }),
  })

  const items = data?.items ?? []
  const total = items.reduce((sum, b) => sum + b.size_bytes, 0)

  return (
    <>
      <PageHeader
        title="Backups"
        description="Snapshots of the live database, taken without stopping the site or the worker."
        actions={
          <button type="button" className="btn btn-primary" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? (
              <>
                <Spinner /> Creating backup…
              </>
            ) : (
              "Create backup"
            )}
          </button>
        }
      />

      {notice && (
        <Notice kind={notice.kind} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <Loading />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="card h-fit overflow-hidden lg:col-span-2">
            {items.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <DatabaseIcon />
                <p className="mt-3 font-medium">No backups yet</p>
                <p className="mt-1 text-sm text-zinc-500">Create one to download a copy of the database.</p>
              </div>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {items.map((b, i) => (
                  <BackupRow key={b.name} backup={b} latest={i === 0} deleting={remove.isPending && remove.variables === b.name} onDelete={() => remove.mutate(b.name)} />
                ))}
              </ul>
            )}
          </section>

          <aside className="card h-fit p-4 text-sm">
            <h2 className="mb-3 font-semibold">About backups</h2>
            <dl className="space-y-3">
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Stored</dt>
                <dd className="font-medium tabular-nums">
                  {items.length} of {data.keep} · {formatBytes(total)}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-zinc-500">
              Only the newest {data.keep} are kept; creating another removes the oldest. Files are gzipped SQLite databases saved in{" "}
              <code className="text-zinc-700">DATA_DIR/backups</code>.
            </p>
            <p className="mt-3 text-zinc-500">
              To restore, stop the services, unzip the file and put it at <code className="text-zinc-700">DB_PATH</code>.
            </p>
          </aside>
        </div>
      )}
    </>
  )
}

function BackupRow({ backup, latest, deleting, onDelete }: { backup: Backup; latest: boolean; deleting: boolean; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(false), 4000)
    return () => clearTimeout(t)
  }, [confirming])

  return (
    <li className="flex flex-wrap items-center gap-4 px-4 py-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-500">
        <FileIcon />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-sm">{backup.name}</span>
          {latest && <span className="rounded-full bg-brand/30 px-2 py-0.5 text-[11px] font-semibold text-zinc-800">Latest</span>}
        </div>
        <div className="mt-0.5 text-xs text-zinc-500">
          <span title={formatDateTime(backup.created_at)}>{timeAgo(backup.created_at)}</span> · {formatDateTime(backup.created_at)} · {formatBytes(backup.size_bytes)}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <a className="btn" href={backupDownloadUrl(backup.name)} download={backup.name}>
          <DownloadIcon /> Download
        </a>
        {confirming ? (
          <button type="button" className="btn btn-deny" disabled={deleting} onClick={onDelete}>
            {deleting ? "Deleting…" : "Confirm delete"}
          </button>
        ) : (
          <button type="button" className="btn text-zinc-500 hover:text-red-700" aria-label={`Delete ${backup.name}`} onClick={() => setConfirming(true)}>
            <TrashIcon />
          </button>
        )}
      </div>
    </li>
  )
}

function Spinner() {
  return <span className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />
}

const iconProps = { viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const

function DownloadIcon() {
  return (
    <svg {...iconProps} className="size-4">
      <path d="M10 3.5v9m0 0-3.5-3.5M10 12.5l3.5-3.5M4 15.5h12" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg {...iconProps} className="size-4">
      <path d="M4 6h12M8 6V4.5h4V6m-6.5 0 .7 9.5h7.6l.7-9.5" />
    </svg>
  )
}

function FileIcon() {
  return (
    <svg {...iconProps} className="size-5">
      <ellipse cx="10" cy="5" rx="5.5" ry="2" />
      <path d="M4.5 5v10c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2V5M4.5 10c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2" />
    </svg>
  )
}

function DatabaseIcon() {
  return (
    <div className="mx-auto grid size-12 place-items-center rounded-full bg-zinc-100 text-zinc-400">
      <FileIcon />
    </div>
  )
}
