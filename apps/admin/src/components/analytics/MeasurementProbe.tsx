import { useMutation } from "@tanstack/react-query"
import { api, errorMessage } from "../../lib/api"
import { validReport } from "../../lib/analytics-workbench"
import { Badge } from "./WorkbenchUI"

/** Explicit read-only check. Configuration alone must never become a green pass. */
export function MeasurementProbe({configured}:{configured:boolean}) {
  const probe=useMutation({mutationFn:async()=>{
    const report=await api<unknown>("analytics/report?report=pages&days=7&device=all")
    if(!validReport(report,"pages","all","","all",7))throw new Error("Google's report did not match the expected scope.")
    return report
  }})
  return <div className="wb-access-probe"><div><strong>2. Test Google report access</strong><p>Reads a bounded 7-day report. This does not change Google settings or verify browser tracking.</p></div><button type="button" disabled={!configured||probe.isPending} onClick={()=>probe.mutate()}>{probe.isPending?"Requesting report…":"Test report access"}</button>
    {!configured&&<p className="wb-footnote">Configure the server first. No Google request has been made by this check.</p>}
    {configured&&!probe.data&&!probe.error&&!probe.isPending&&<Badge tone="gold">Not tested</Badge>}
    {configured&&probe.error&&<p className="wb-warning" role="alert">{errorMessage(probe.error)}</p>}
    {configured&&probe.data&&<div className="wb-probe-result" role="status"><Badge tone="green">Google returned a report</Badge><p>{probe.data.start} – {probe.data.end} · {probe.data.table.metadata.timeZone} · {probe.data.cached?"server-cached response":"freshly fetched response"}</p><p>{probe.data.table.rows?.length?"Report access works for this query. Content/feature custom dimensions still need their own verification.":"No rows returned. Access succeeded, but this does not confirm that browser events are arriving."}</p><p>Next: verify a known browser action and its receipt in Google. This check alone does not certify measurement health.</p></div>}
  </div>
}
