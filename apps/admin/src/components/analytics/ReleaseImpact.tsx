import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "../../lib/api"
import { metric, percent, type ReportingStatus, type WorkbenchSearch } from "../../lib/analytics-workbench"
import { releaseCsv, releaseSummary, releaseWindows, sampleRelease, validRelease, type ReleaseRequest, type ReleaseComparison, type ReleaseBreakdown } from "../../lib/release-comparison"
import { Panel, Badge, Stat } from "./WorkbenchUI"
import { ReportGate, ReportLimitations } from "./WorkbenchReportState"
import { TrendChart } from "./DailyTrend"
import { acquisitionLabel } from "../../lib/analytics-signals"

const num=(value:number)=>value.toLocaleString("en-US"),signed=(value:number)=>`${value>0?"+":""}${value.toFixed(1)}`
export function ReleaseImpact({search,onSearch,status,statusError}:{search:WorkbenchSearch;onSearch:(search:WorkbenchSearch)=>void;status?:ReportingStatus;statusError:boolean}) {
  const [date,setDate]=useState(search.mode==="sample"?"2026-10-10":new Date(Date.now()-15*86_400_000).toISOString().slice(0,10)),[days,setDays]=useState<7|28>(7)
  const [request,setRequest]=useState<ReleaseRequest>({date,days,breakdown:"trend"})
  const ready=status?.state==="ready"&&!statusError
  const query=useQuery({queryKey:["analytics-release",request.date,request.days,request.breakdown,search.device],enabled:search.mode==="ga4"&&ready,
    queryFn:async()=>{
      const params=new URLSearchParams({date:request.date,days:String(request.days),breakdown:request.breakdown,device:search.device})
      const result=await api<unknown>(`analytics/release?${params}`)
      if(!validRelease(result,request,search))throw new Error("Comparison did not match the selected windows.")
      return result
    },retry:false,staleTime:300_000,refetchOnWindowFocus:false})
  const data=search.mode==="sample"?sampleRelease(request,search):ready?query.data:undefined
  const error=search.mode==="ga4"?query.error:null
  const windows=releaseWindows(request.date,request.days),summary=data?releaseSummary(data):null
  const chartCeiling=data?Math.max(1,...[data.before,data.after].flatMap(period=>(period.table.rows??[]).map(row=>metric(row,"sessions",period.table)))):1
  const draftChanged=date!==request.date||days!==request.days
  const exportFile=()=>{if(!data)return;const url=URL.createObjectURL(new Blob([releaseCsv(data)],{type:"text/csv;charset=utf-8"})),link=document.createElement("a");link.href=url;link.download=`pca-${data.source}-release-${data.releaseDate}.csv`;link.click();URL.revokeObjectURL(url)}
  return <>
    <Panel title="Compare a website update" note="Select the release date manually. This does not launch or detect a deployment." help="Two equal complete windows surround the release day. That mixed day is excluded. A before/after difference is descriptive evidence, not proof that the release caused a change.">
      <form className="wb-release-form" onSubmit={event=>{event.preventDefault();if(releaseWindows(date,days))setRequest({...request,date,days})}}>
        <label>Release date<input type="date" value={date} required onChange={event=>setDate(event.target.value)}/></label>
        <label>Window on each side<select value={days} onChange={event=>setDays(Number(event.target.value) as 7|28)}><option value={7}>7 complete days</option><option value={28}>28 complete days</option></select></label>
        <label>Device<select value={search.device} onChange={event=>onSearch({...search,device:event.target.value as WorkbenchSearch["device"]})}><option value="all">All devices</option><option value="mobile">Mobile</option><option value="desktop">Desktop</option><option value="tablet">Tablet</option></select></label>
        <button type="submit" disabled={!releaseWindows(date,days)}>Update comparison</button>
      </form>
      {draftChanged&&<p className="wb-footnote" role="status">Date/window edited. Displayed results still use {request.date} and {request.days} days until you update.</p>}
      {windows&&<div className="wb-window-timeline"><div><span>Before</span><strong>{windows.before.start} – {windows.before.end}</strong></div><div className="wb-release-marker"><span>Release day excluded</span><strong>{request.date}</strong></div><div><span>After</span><strong>{windows.after.start} – {windows.after.end}</strong></div></div>}
      <div className="wb-release-context"><Badge>Descriptive comparison</Badge><span>No randomized control · dates use the property timezone</span></div>
    </Panel>
    <div className="wb-report-tabs" role="group" aria-label="Release comparison view">{[["trend","Traffic & engagement"],["device","Device mix"],["source","Source mix"]].map(([id,label])=><button type="button" key={id} aria-pressed={request.breakdown===id} onClick={()=>setRequest({...request,breakdown:id as ReleaseBreakdown})}>{label}</button>)}</div>
    <ReportGate search={search} status={status} statusError={statusError} pending={query.isFetching&&!data} error={!!query.error} retry={()=>{void query.refetch()}}/>
    {search.mode==="ga4"&&query.error&&<p className="wb-footnote" role="alert">Both windows must be complete and within the last 180 days. Access, quota and report errors can also prevent comparison; no partial result or sample fallback is shown.</p>}
    {search.mode==="sample"&&!data&&<div className="wb-empty"><strong>Not enough sample history for these windows</strong><p>The invented fixture covers Aug 24–Oct 18, 2026. Try October 10 with 7 days. A 28-day comparison needs 57 calendar days including the excluded release day; this sample has 56.</p></div>}
    {data&&!error&&summary&&<>
      <div className="wb-report-meta"><span>{data.source==="sample"?"Invented sample":"GA4"} · {data.before.table.metadata.timeZone} · {data.device} · independent totals per window</span><button type="button" onClick={exportFile}>Export both windows</button></div>
      <ReportLimitations data={data.before}/><ReportLimitations data={data.after}/>
      <div className="wb-stats"><Stat label="Sessions before" value={num(summary.sessionsBefore)} detail={`${data.days} complete days`} help="Independent session total for the before window."/><Stat label="Sessions after" value={num(summary.sessionsAfter)} detail={`${data.days} complete days`} help="Independent session total for the after window, excluding the release day."/><Stat label="Session difference" value={`${summary.sessionChange>0?"+":""}${num(summary.sessionChange)}`} detail={summary.relativeChange===null?"No baseline for a relative percentage":`${signed(summary.relativeChange*100)}% relative to before`} help="After minus before. An increase is not automatically an improvement and does not establish causation."/><Stat label="Engaged-share difference" value={summary.rateChange===null?"Unavailable":`${signed(summary.rateChange)} pp`} detail="Percentage points, not percent growth" help="After engaged sessions / after sessions minus the corresponding before rate. Zero-session windows have no engagement rate."/></div>
      {request.breakdown==="trend"?<div className="wb-two"><Panel title="Before the release" note={`${data.before.start} – ${data.before.end} · same vertical scale`}><TrendChart key={`before-${request.date}-${request.days}-${search.device}`} data={data.before} ceiling={chartCeiling}/></Panel><Panel title="After the release" note={`${data.after.start} – ${data.after.end} · same vertical scale`}><TrendChart key={`after-${request.date}-${request.days}-${search.device}`} data={data.after} ceiling={chartCeiling}/></Panel></div>:<ComparisonMix data={data}/>}
      <Panel title="Before drawing a conclusion"><div className="wb-rule-grid"><div><dt>Check traffic mix</dt><dd>Use Device mix and Source mix. A different audience can explain a change.</dd></div><div><dt>Check other changes</dt><dd>Campaigns, competition dates, holidays and tracking updates can affect both windows.</dd></div><div><dt>Record the evidence</dt><dd>Keep counts, dates and uncertainty in the Dev Analysis Log. This comparison does not declare a winner.</dd></div></div></Panel>
    </>}
  </>
}
function ComparisonMix({data}:{data:ReleaseComparison}) {
  const groups=new Map<string,{before:number;after:number}>()
  for(const side of ["before","after"] as const)for(const row of data[side].table.rows??[]){const name=row.dimensionValues[0].value,item=groups.get(name)??{before:0,after:0};item[side]=metric(row,"sessions",data[side].table);groups.set(name,item)}
  const totals=releaseSummary(data),rows=[...groups].sort((a,b)=>b[1].after-a[1].after)
  const truncated=[data.before,data.after].some(report=>report.table.rowCount>(report.table.rows?.length??0)||report.table.metadata.subjectToThresholding||report.table.metadata.dataLossFromOtherRow||report.table.metadata.samplingMetadatas?.length)
  return <Panel title={data.breakdown==="device"?"Device mix before and after":"Source mix before and after"} note="Shares use each window's independent session total."><div className="wb-scroll"><table><caption>Returned groups only. An absent or withheld row is unavailable, not a proven zero.</caption><thead><tr><th>Group</th><th>Before sessions</th><th>Before share</th><th>After sessions</th><th>After share</th></tr></thead><tbody>{rows.map(([name,counts])=>{
    const has=(side:"before"|"after")=>data[side].table.rows?.some(row=>row.dimensionValues[0].value===name)
    return <tr key={name}><th scope="row">{data.breakdown==="source"?acquisitionLabel(name).title:name}</th><td>{has("before")?num(counts.before):"Unavailable"}</td><td>{has("before")?percent(counts.before,totals.sessionsBefore):"—"}</td><td>{has("after")?num(counts.after):"Unavailable"}</td><td>{has("after")?percent(counts.after,totals.sessionsAfter):"—"}</td></tr>
  })}</tbody></table></div>{!rows.length&&<p className="wb-empty">No returned groups. Check collection and scope before interpreting interest.</p>}{truncated&&<p className="wb-warning">Some groups may be missing or sampled. Do not infer a complete traffic-mix comparison.</p>}</Panel>
}
