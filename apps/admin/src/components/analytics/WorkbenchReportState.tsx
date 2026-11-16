import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { api } from "../../lib/api"
import { sampleSessions } from "../../lib/analytics-workspace"
import { sampleReport, validReport, type ReportKind, type ReportingStatus, type WorkbenchReport, type WorkbenchSearch } from "../../lib/analytics-workbench"
import type { ContentPage } from "../../lib/analytics-signals"

export function useWorkbenchReport(kind: ReportKind, breakdown: string, search: WorkbenchSearch, status?: ReportingStatus, statusError = false, page: ContentPage = "all") {
  const sample = useMemo(() => sampleReport(sampleSessions, search, kind, breakdown, page), [kind, breakdown, search.days, search.device, page])
  const ready = status?.state === "ready" && !statusError
  const query = useQuery({
    queryKey: ["analytics-report", kind, breakdown, search.days, search.device, page], enabled: search.mode === "ga4" && ready,
    queryFn: async () => {
      const params = new URLSearchParams({ report: kind, breakdown, days: String(search.days), device: search.device })
      if (kind === "content") params.set("page", page)
      const result = await api<WorkbenchReport>(`analytics/report?${params}`)
      if (!validReport(result, kind, search.device, breakdown, page, search.days)) throw new Error("The report shape did not match this request.")
      return result
    }, retry: false, staleTime: 300_000, refetchOnWindowFocus: false,
  })
  // A cached live result must not survive a lost/failed reporting-setup check.
  return { data: search.mode === "sample" ? sample : ready ? query.data : undefined, query: { ...query, error: search.mode === "sample" ? null : query.error } }
}

export function ReportGate({ search, status, statusError, pending, error, retry }: { search: WorkbenchSearch; status?: ReportingStatus; statusError: boolean; pending: boolean; error: boolean; retry: () => void }) {
  if (search.mode === "sample") return null
  if (statusError) return <div className="wb-empty" role="alert"><strong>Reporting service unavailable</strong><p>The local API may need to be restarted with the new code. No sample numbers are substituted.</p></div>
  if (!status) return <div className="wb-empty" role="status">Checking reporting setup…</div>
  if (status.state !== "ready") return <div className="wb-empty"><strong>Connect GA4 to see actual reports</strong><p>{status.message}</p><Link to="/analytics-workbench/$section" params={{ section: "measurement" }} search={search}>Review connection requirements →</Link></div>
  if (pending) return <div className="wb-empty" role="status">Requesting GA4 report…</div>
  if (error) return <div className="wb-empty" role="alert"><strong>Report could not be loaded</strong><p>Check property access, required custom dimensions, the enabled Data API and quota. No sample fallback.</p><button type="button" onClick={retry}>Retry report</button></div>
  return null
}

export function ReportLimitations({ data }: { data: WorkbenchReport }) {
  const metadata = [data.table.metadata, data.totals.metadata]
  return <>{metadata.some(item => item.subjectToThresholding) && <p className="wb-warning">GA4 thresholding applies. Some data may be withheld.</p>}{metadata.some(item => item.dataLossFromOtherRow) && <p className="wb-warning">GA4 reports high-cardinality data loss. Breakdown rows may be incomplete.</p>}{metadata.some(item => item.samplingMetadatas?.length) && <p className="wb-warning">GA4 sampling applies. These are not complete event counts.</p>}</>
}

export function ReportMeta({ data }: { data: WorkbenchReport }) {
  return <div className="wb-report-meta"><span>{data.start} – {data.end} · {data.table.metadata.timeZone} · {data.device}{data.contentPage ? ` · ${data.contentPage === "all" ? "both content pages" : data.contentPage}` : ""}</span><span>{data.source === "sample" ? "Invented fixtures" : `${data.cached ? "Cached" : "Fetched"} ${new Date(data.fetchedAt).toLocaleString()} · up to 5 min cache`}</span></div>
}
