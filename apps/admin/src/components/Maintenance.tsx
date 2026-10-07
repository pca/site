import { formatDateTime, timeAgo } from "@pca/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useState } from "react"

import { api, errorMessage, maintenanceQuery, type MaintenanceState } from "../lib/api"

// In development the public site runs on its own Vite server.
const PREVIEW_URL = import.meta.env.DEV
  ? "http://localhost:3000/maintenance"
  : `${(import.meta.env.VITE_SITE_URL || "").replace(/\/$/, "")}/maintenance`

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-zinc-300 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${checked ? "bg-amber-500" : "bg-zinc-300"}`}
    >
      <span className={`inline-block size-5 rounded-full bg-white shadow-sm ring-1 ring-zinc-900/5 transition-transform duration-200 ${checked ? "translate-x-5.5" : "translate-x-0.5"}`} />
    </button>
  )
}

function useSetMaintenance(onDone?: (message: string) => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) => api<{ message: string; state: MaintenanceState }>("maintenance", { method: "PUT", json: { enabled } }),
    onSuccess: res => {
      queryClient.setQueryData(maintenanceQuery.queryKey, res.state)
      onDone?.(res.message)
    },
  })
}

export function MaintenanceCard() {
  const { data } = useQuery(maintenanceQuery)
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const set = useSetMaintenance(msg => {
    setConfirming(false)
    setMessage(msg)
  })
  if (!data) return null
  const on = data.enabled

  return (
    <section className={`card mb-6 overflow-hidden ${on ? "border-amber-300 ring-1 ring-amber-200" : ""}`}>
      <div className="flex flex-wrap items-center gap-4 px-4 py-3.5">
        <div className={`grid size-9 shrink-0 place-items-center rounded-full ${on ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-500"}`}>
          <ToolsIcon />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Maintenance mode</h2>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${on ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
              {on ? "Site offline" : "Site live"}
            </span>
          </div>
          <p className="text-sm text-zinc-500">
            {on
              ? "Every page of the public site shows “We’ll be back soon”. The admin and the API keep working."
              : "Switch on during upgrades to show a maintenance page on every page of the public site."}
            {data.updated_at && (
              <span className="text-zinc-400" title={formatDateTime(data.updated_at)}>
                {" "}
                {on ? "Turned on" : "Last changed"} {timeAgo(data.updated_at)} by {data.updated_by}.
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a href={PREVIEW_URL} target="_blank" rel="noreferrer" className="link text-sm">
            Preview page
          </a>
          <Switch
            label="Maintenance mode"
            checked={on || confirming}
            disabled={set.isPending}
            onChange={next => {
              setMessage(null)
              if (next) setConfirming(true)
              else if (confirming) setConfirming(false)
              else set.mutate(false)
            }}
          />
        </div>
      </div>
      {confirming && (
        <div className="flex flex-wrap items-center gap-3 border-t border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <span className="flex-1 text-amber-900">Take the public site offline? Visitors will see the maintenance page until you switch this off.</span>
          <button type="button" className="btn" onClick={() => setConfirming(false)}>
            Cancel
          </button>
          <button type="button" className="btn border-amber-600 bg-amber-500 text-white hover:bg-amber-600" disabled={set.isPending} onClick={() => set.mutate(true)}>
            {set.isPending ? "Switching…" : "Turn on maintenance"}
          </button>
        </div>
      )}
      {(message || set.error) && (
        <div className={`border-t px-4 py-2 text-sm ${set.error ? "border-red-200 bg-red-50 text-red-800" : "border-zinc-100 bg-zinc-50 text-zinc-600"}`}>
          {set.error ? errorMessage(set.error) : message}
        </div>
      )}
    </section>
  )
}

/** Shown on every admin page while the public site is offline. */
export function MaintenanceBanner() {
  const { data } = useQuery(maintenanceQuery)
  const set = useSetMaintenance()
  if (!data?.enabled) return null
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-400 px-4 py-2 text-sm text-amber-950">
      <ToolsIcon />
      <span>
        <strong className="font-semibold">Maintenance mode is on.</strong> The public site shows the maintenance page.
      </span>
      <button type="button" className="font-semibold underline underline-offset-2 hover:no-underline" disabled={set.isPending} onClick={() => set.mutate(false)}>
        {set.isPending ? "Turning off…" : "Turn off"}
      </button>
      <Link to="/" className="underline-offset-2 hover:underline">
        Details
      </Link>
    </div>
  )
}

function ToolsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4.5" aria-hidden>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z" />
    </svg>
  )
}
