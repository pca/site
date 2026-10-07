import { formatDateTime, timeAgo } from "@pca/shared"

import type { Worker } from "../lib/api"

export function WorkerStatus({ worker }: { worker: Worker }) {
  const hb = worker.heartbeat
  return (
    <div className="text-sm">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${worker.alive ? "bg-emerald-500" : "bg-red-500"}`} />
        <strong>{worker.alive ? "Worker running" : "Worker not responding"}</strong>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-zinc-600">
        {hb ? (
          <>
            <dt className="text-zinc-400">Last heartbeat</dt>
            <dd>{timeAgo(hb.at)}</dd>
            <dt className="text-zinc-400">Host</dt>
            <dd>
              {hb.hostname} (pid {hb.pid})
            </dd>
            <dt className="text-zinc-400">Schedule</dt>
            <dd>
              {hb.cron ? (
                <>
                  <code>{hb.cron}</code>
                  {hb.next_sync && <> · next sync {formatDateTime(hb.next_sync)}</>}
                </>
              ) : (
                "Off"
              )}
            </dd>
          </>
        ) : (
          <>
            <dt className="text-zinc-400">Heartbeat</dt>
            <dd>The worker has never reported in. Start the worker service.</dd>
          </>
        )}
        <dt className="text-zinc-400">WCA export</dt>
        <dd>
          {worker.import ? (
            <>
              {worker.import.export_date} (format {worker.import.export_format_version}) · imported{" "}
              {timeAgo(worker.import.imported_at)}
            </>
          ) : (
            "Not imported yet"
          )}
        </dd>
      </dl>
    </div>
  )
}
