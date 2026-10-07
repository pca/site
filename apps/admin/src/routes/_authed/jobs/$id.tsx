import { formatDateTime, formatDuration } from "@pca/shared"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import { useEffect, useRef } from "react"

import { ErrorState, JobBadge, Loading, PageHeader } from "../../../components/ui"
import { jobQuery } from "../../../lib/api"

export const Route = createFileRoute("/_authed/jobs/$id")({
  params: {
    parse: ({ id }) => {
      const n = Number(id)
      if (!Number.isInteger(n) || n <= 0) throw notFound()
      return { id: n }
    },
    stringify: ({ id }) => ({ id: String(id) }),
  },
  loader: ({ context, params }) => context.queryClient.prefetchQuery(jobQuery(params.id)),
  component: JobPage,
})

function JobPage() {
  const { id } = Route.useParams()
  const { data: job, error, isPending, refetch } = useQuery(jobQuery(id))
  const logRef = useRef<HTMLPreElement>(null)
  const active = job?.status === "queued" || job?.status === "running"

  useEffect(() => {
    const el = logRef.current
    if (el && active) el.scrollTop = el.scrollHeight
  }, [job?.log, active])

  if (isPending) return <Loading />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  return (
    <>
      <div className="mb-2 text-sm">
        <Link to="/jobs" className="link">
          ← Jobs
        </Link>
      </div>
      <PageHeader title={`${job.kind_label} #${job.id}`} actions={<JobBadge status={job.status} />} />

      <section className="card mb-6 p-4 text-sm">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-3">
          <Field label="Queued">{formatDateTime(job.created_at)}</Field>
          <Field label="Started">{job.started_at ? formatDateTime(job.started_at) : "—"}</Field>
          <Field label="Finished">{job.finished_at ? formatDateTime(job.finished_at) : "—"}</Field>
          <Field label="Duration">{job.finished_at ? formatDuration(job.duration_ms) : active ? "Running…" : "—"}</Field>
          <Field label="Started by">{job.requested_by || job.source}</Field>
          <Field label="Force">{job.force ? "Yes" : "No"}</Field>
        </dl>
        {job.error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-red-800">{job.error}</p>}
      </section>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 className="font-semibold">Log</h2>
          {active && <span className="text-xs text-zinc-500">Updating live</span>}
        </div>
        <pre ref={logRef} className="max-h-[60vh] overflow-auto bg-zinc-950 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-zinc-100">
          {job.log || (job.status === "queued" ? "Waiting for the worker to pick this up…" : "No output.")}
        </pre>
      </section>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-zinc-400">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
