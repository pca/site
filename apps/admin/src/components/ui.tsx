import { findRegion, REGIONS, regionName, ZONE_COLORS, type Zone } from "@pca/shared"
import type { ReactNode } from "react"

import { STATUS_LABELS, type JobStatus, type RequestStatus } from "../lib/api"
import { Select, type SelectOption } from "./Select"

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
      </div>
      {actions}
    </div>
  )
}

const REQUEST_BADGE: Record<RequestStatus, string> = {
  p: "bg-amber-100 text-amber-800",
  a: "bg-emerald-100 text-emerald-800",
  d: "bg-red-100 text-red-800",
}

export function RequestBadge({ status }: { status: RequestStatus }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${REQUEST_BADGE[status]}`}>{STATUS_LABELS[status]}</span>
}

const JOB_BADGE: Record<JobStatus, string> = {
  queued: "bg-zinc-100 text-zinc-700",
  running: "bg-sky-100 text-sky-800",
  succeeded: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
  skipped: "bg-zinc-100 text-zinc-500",
}

export function JobBadge({ status }: { status: JobStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${JOB_BADGE[status]}`}>
      {status === "running" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-600" />}
      {status}
    </span>
  )
}

export function RegionLabel({ id }: { id: string | null | undefined }) {
  if (!id) return <span className="text-zinc-400">No region</span>
  return <span title={regionName(id)}>{regionName(id)}</span>
}

export function Notice({ kind = "success", children, onClose }: { kind?: "success" | "error"; children: ReactNode; onClose?: () => void }) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={`mb-4 flex items-start justify-between gap-3 rounded-md px-3 py-2 text-sm ${kind === "error" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}
    >
      <span>{children}</span>
      {onClose && (
        <button type="button" className="text-lg leading-none opacity-60 hover:opacity-100" aria-label="Dismiss" onClick={onClose}>
          ×
        </button>
      )}
    </div>
  )
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-zinc-500" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
      {label}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Notice kind="error">
      {error instanceof Error ? error.message : "Something went wrong."}{" "}
      {onRetry && (
        <button type="button" className="underline" onClick={onRetry}>
          Retry
        </button>
      )}
    </Notice>
  )
}

export function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (page: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-3 text-sm text-zinc-500">
      <span>
        {total.toLocaleString()} total · page {page} of {pages}
      </span>
      <div className="flex gap-2">
        <button type="button" className="btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button type="button" className="btn" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  )
}

const ZONE_LABELS: Record<Zone, string> = { luzon: "Luzon", visayas: "Visayas", mindanao: "Mindanao" }

export function RegionTag({ id }: { id: string }) {
  const region = findRegion(id)
  if (!region) return null
  const color = ZONE_COLORS[region.zone]
  return (
    <span
      aria-hidden
      className="inline-flex h-5 min-w-11 shrink-0 items-center justify-center rounded-md px-1.5 text-[10px] font-semibold tracking-wide tabular-nums"
      style={{ color, backgroundColor: `${color}14`, boxShadow: `inset 0 0 0 1px ${color}33` }}
    >
      {region.tag}
    </span>
  )
}

/** Leading icon for non-region choices: a stack for "any", a slashed circle for "none". */
function ChoiceTag({ any }: { any: boolean }) {
  return (
    <span aria-hidden className="inline-flex h-5 min-w-11 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-400">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
        {any ? (
          <path d="m10 3.5 6.5 3.25L10 10 3.5 6.75 10 3.5Zm-6.5 6.75L10 13.5l6.5-3.25m-13 3.5L10 17l6.5-3.25" />
        ) : (
          <>
            <circle cx="10" cy="10" r="6" />
            <path d="m5.75 14.25 8.5-8.5" />
          </>
        )}
      </svg>
    </span>
  )
}

const REGION_OPTIONS: SelectOption[] = [...REGIONS]
  .sort((a, b) => Object.keys(ZONE_LABELS).indexOf(a.zone) - Object.keys(ZONE_LABELS).indexOf(b.zone))
  .map(r => ({
    value: r.id,
    label: r.fullName,
    description: r.codeName === r.tag ? undefined : r.codeName,
    group: ZONE_LABELS[r.zone],
    leading: <RegionTag id={r.id} />,
    keywords: `${r.name} ${r.tag}`,
  }))

/** Region picker. `extra` options (e.g. "Any region") are listed above the regions. */
export function RegionSelect({
  value,
  onChange,
  extra = [],
  ...rest
}: {
  value: string
  onChange: (value: string) => void
  extra?: { value: string; label: string; any?: boolean }[]
  id?: string
  className?: string
  "aria-label"?: string
}) {
  const options = [...extra.map(({ any, ...o }) => ({ ...o, leading: <ChoiceTag any={!!any} /> })), ...REGION_OPTIONS]
  return <Select value={value} onChange={onChange} options={options} searchable searchPlaceholder="Search regions…" placeholder="Choose a region" {...rest} />
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </div>
  )
}
