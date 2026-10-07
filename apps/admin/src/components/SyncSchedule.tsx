import { formatDateTime, timeAgo } from "@pca/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { api, errorMessage, scheduleQuery, type SyncSchedule } from "../lib/api"
import { Select, type SelectOption } from "./Select"

type Frequency = "daily" | "12h" | "6h" | "weekly" | "off" | "custom"

interface Draft {
  frequency: Frequency
  hour: string
  day: string
  custom: string
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

const FREQUENCIES: SelectOption[] = [
  { value: "daily", label: "Every day", description: "At the hour you pick" },
  { value: "12h", label: "Every 12 hours", description: "Midnight and noon" },
  { value: "6h", label: "Every 6 hours", description: "12 AM, 6 AM, 12 PM and 6 PM" },
  { value: "weekly", label: "Once a week", description: "On the day and hour you pick" },
  { value: "off", label: "Off", description: "Only run syncs by hand" },
  { value: "custom", label: "Custom", description: "Any cron expression" },
]

const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"}`
const HOURS: SelectOption[] = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: hourLabel(h) }))
const DAY_OPTIONS: SelectOption[] = DAYS.map((d, i) => ({ value: String(i), label: d }))

/** parse maps a cron expression onto the presets; anything else is custom. */
function parse(cron: string): Draft {
  const base: Draft = { frequency: "custom", hour: "4", day: "1", custom: cron }
  const expr = cron.trim().replace(/\s+/g, " ")
  if (expr === "") return { ...base, frequency: "off" }
  if (expr === "0 */12 * * *" || expr === "0 0,12 * * *") return { ...base, frequency: "12h" }
  if (expr === "0 */6 * * *" || expr === "0 0,6,12,18 * * *") return { ...base, frequency: "6h" }
  if (expr === "@daily" || expr === "@midnight") return { ...base, frequency: "daily", hour: "0" }
  let m = /^0 (\d{1,2}) \* \* \*$/.exec(expr)
  if (m && +m[1] < 24) return { ...base, frequency: "daily", hour: String(+m[1]) }
  m = /^0 (\d{1,2}) \* \* ([0-6])$/.exec(expr)
  if (m && +m[1] < 24) return { ...base, frequency: "weekly", hour: String(+m[1]), day: m[2] }
  return base
}

function toCron(d: Draft): string {
  switch (d.frequency) {
    case "daily":
      return `0 ${d.hour} * * *`
    case "12h":
      return "0 */12 * * *"
    case "6h":
      return "0 */6 * * *"
    case "weekly":
      return `0 ${d.hour} * * ${d.day}`
    case "off":
      return ""
    case "custom":
      return d.custom.trim().replace(/\s+/g, " ")
  }
}

function describe(cron: string): string {
  const d = parse(cron)
  switch (d.frequency) {
    case "daily":
      return `Every day at ${hourLabel(+d.hour)}`
    case "12h":
      return "Every 12 hours"
    case "6h":
      return "Every 6 hours"
    case "weekly":
      return `Every ${DAYS[+d.day]} at ${hourLabel(+d.hour)}`
    case "off":
      return "Off: syncs only run when queued by hand"
    case "custom":
      return "Custom schedule"
  }
}

export function SyncScheduleCard() {
  const { data } = useQuery(scheduleQuery)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const save = useMutation({
    mutationFn: (cron: string | null) =>
      api<{ message: string; schedule: SyncSchedule }>("schedule", cron === null ? { method: "DELETE" } : { method: "PUT", json: { cron } }),
    onSuccess: res => {
      queryClient.setQueryData(scheduleQuery.queryKey, res.schedule)
      queryClient.invalidateQueries({ queryKey: ["jobs"] })
      setDraft(null)
      setMessage(res.message)
    },
  })

  if (!data) return null
  const off = data.cron === ""
  const nextCron = draft ? toCron(draft) : data.cron
  const unchanged = nextCron === data.cron
  const update = (patch: Partial<Draft>) => setDraft(d => (d ? { ...d, ...patch } : d))

  return (
    <section className="card mb-6 overflow-hidden">
      <div className="flex flex-wrap items-center gap-4 px-4 py-3.5">
        <div className={`grid size-9 shrink-0 place-items-center rounded-full ${off ? "bg-zinc-100 text-zinc-400" : "bg-sky-100 text-sky-700"}`}>
          <ClockIcon />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">WCA sync schedule</h2>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${off ? "bg-zinc-100 text-zinc-600" : data.custom ? "bg-sky-100 text-sky-800" : "bg-emerald-100 text-emerald-800"}`}
            >
              {off ? "Off" : data.custom ? "Custom" : "Default"}
            </span>
          </div>
          <p className="text-sm text-zinc-500">
            {describe(data.cron)}
            {!off && (
              <>
                {" "}
                · <code className="text-xs">{data.cron}</code> (Manila time)
              </>
            )}
            {data.updated_at && (
              <span className="text-zinc-400" title={formatDateTime(data.updated_at)}>
                {" "}
                Changed {timeAgo(data.updated_at)} by {data.updated_by}.
              </span>
            )}
          </p>
          {data.next_runs.length > 0 && (
            <p className="mt-1 text-xs text-zinc-400">
              Next: {data.next_runs.slice(0, 3).map(t => formatDateTime(t)).join(" · ")}
            </p>
          )}
        </div>
        {!draft && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setMessage(null)
              save.reset()
              setDraft(parse(data.cron))
            }}
          >
            Change
          </button>
        )}
      </div>

      {draft && (
        <form
          className="space-y-3 border-t border-zinc-200 bg-zinc-50/60 px-4 py-4"
          onSubmit={e => {
            e.preventDefault()
            save.mutate(nextCron)
          }}
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-zinc-500">Frequency</span>
              <Select aria-label="Frequency" className="w-72" value={draft.frequency} options={FREQUENCIES} onChange={v => update({ frequency: v as Frequency })} />
            </label>
            {draft.frequency === "weekly" && (
              <label className="grid gap-1 text-sm">
                <span className="text-zinc-500">Day</span>
                <Select aria-label="Day" className="w-40" value={draft.day} options={DAY_OPTIONS} onChange={day => update({ day })} />
              </label>
            )}
            {(draft.frequency === "daily" || draft.frequency === "weekly") && (
              <label className="grid gap-1 text-sm">
                <span className="text-zinc-500">Time (Manila)</span>
                <Select aria-label="Time" className="w-32" value={draft.hour} options={HOURS} onChange={hour => update({ hour })} />
              </label>
            )}
            {draft.frequency === "custom" && (
              <label className="grid min-w-64 flex-1 gap-1 text-sm">
                <span className="text-zinc-500">Cron expression (minute hour day month weekday)</span>
                <input
                  className="input font-mono"
                  value={draft.custom}
                  onChange={e => update({ custom: e.target.value })}
                  placeholder="30 3 * * 1-5"
                  spellCheck={false}
                  autoFocus
                />
              </label>
            )}
          </div>
          <p className="text-xs text-zinc-500">
            {draft.frequency === "custom"
              ? "Five fields in Manila time, e.g. 30 3 * * 1-5 for 3:30 AM on weekdays. Syncs must be at least an hour apart."
              : draft.frequency === "off"
                ? "The worker stops queueing syncs. You can still queue one by hand below."
                : `${describe(nextCron)} (${nextCron}). A sync only downloads when WCA has published a new export.`}
          </p>
          {save.error && <p className="text-sm text-red-700">{errorMessage(save.error)}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="btn btn-primary" disabled={save.isPending || unchanged || (draft.frequency === "custom" && nextCron === "")}>
              {save.isPending ? "Saving…" : "Save schedule"}
            </button>
            <button type="button" className="btn" onClick={() => setDraft(null)}>
              Cancel
            </button>
            {data.custom && (
              <button type="button" className="btn ml-auto" disabled={save.isPending} onClick={() => save.mutate(null)} title={`${describe(data.default_cron)}${data.default_cron ? ` (${data.default_cron})` : ""}`}>
                Use server default
              </button>
            )}
          </div>
        </form>
      )}

      {message && !draft && <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-2 text-sm text-zinc-600">{message}</div>}
    </section>
  )
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4.5" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}
