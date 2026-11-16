import { useId, useState } from "react"
import { trendPath, trendPoints } from "../../lib/analytics-trend"
import { type ReportingStatus, type WorkbenchReport, type WorkbenchSearch } from "../../lib/analytics-workbench"
import { Panel } from "./WorkbenchUI"
import { ReportGate, ReportLimitations, useWorkbenchReport } from "./WorkbenchReportState"
import { downloadReport } from "./SignalReports"

const number=(value:number)=>value.toLocaleString("en-US")
export function TrendChart({data,metricName="sessions",ceiling}:{data:WorkbenchReport;metricName?:string;ceiling?:number}) {
  const [selected,setSelected]=useState<string>(""),id=useId().replaceAll(":","")
  let points
  try {points=trendPoints(data,metricName)}catch{return <p className="wb-warning" role="alert">The daily dates do not match this report. No trend is displayed.</p>}
  const {line,max}=trendPath(points,760,180,ceiling),active=points.find(point=>point.date===selected)
  const short=(date:string)=>new Date(`${date}T00:00:00Z`).toLocaleDateString("en",{month:"short",day:"numeric",timeZone:"UTC"})
  return <div className="wb-trend">
    <div className="wb-trend-legend"><span><i/>{metricName==="screenPageViews"?"Page views":metricName==="engagedSessions"?"Engaged sessions":"Sessions"}</span><span>{data.start} – {data.end}</span></div>
    <div className="wb-trend-plot"><div className="wb-trend-axis"><span>{number(max)}</span><span>{number(Math.round(max/2))}</span><span>0</span></div><svg viewBox="-8 -12 776 208" role="img" aria-labelledby={`${id}-title`} preserveAspectRatio="none"><title id={`${id}-title`}>Daily {metricName}. Exact dates and values are in the table below.</title><defs><linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".15"/><stop offset="100%" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>{[0,90,180].map(y=><line key={y} x1="0" x2="760" y1={y} y2={y} className="wb-chart-grid"/>)}{points.every(point=>point.value!==null)&&<path d={`${line} L760,180 L0,180 Z`} fill={`url(#${id}-fill)`}/>}<path d={line} fill="none" stroke="currentColor" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/>{active&&active.value!==null&&<circle cx={points.findIndex(point=>point.date===active.date)/(points.length-1)*760} cy={180-active.value/max*180} r="5" fill="currentColor"/>}</svg></div>
    <div className="wb-trend-labels"><span>{short(data.start)}</span><span>{short(points[Math.floor(points.length/2)]?.date??data.start)}</span><span>{short(data.end)}</span></div>
    <div className="wb-trend-inspect"><label>Inspect a day<select value={selected} onChange={event=>setSelected(event.target.value)}><option value="">Choose date</option>{points.map(point=><option key={point.date} value={point.date}>{short(point.date)}</option>)}</select></label><span role="status">{active?`${active.date} · ${active.value===null?"Unavailable":number(active.value)}`:"Daily values; not a cumulative total"}</span></div>
    <details className="wb-exact-values"><summary>Exact daily values</summary><div className="wb-scroll"><table><caption>Same dates/device as this chart. Daily users must not be added to estimate period users.</caption><thead><tr><th>Date</th><th>{metricName}</th></tr></thead><tbody>{points.map(point=><tr key={point.date}><th scope="row">{point.date}</th><td>{point.value===null?"Unavailable":number(point.value)}</td></tr>)}</tbody></table></div></details>
  </div>
}
export function DailyTrend({search,status,statusError}:{search:WorkbenchSearch;status?:ReportingStatus;statusError:boolean}) {
  const {data,query}=useWorkbenchReport("pages","date",search,status,statusError)
  const [metricName,setMetric]=useState("sessions")
  return <Panel title="Traffic over time" note="All measured main-site traffic · complete days only" help="This chart shares the period and device filters, but is not filtered by a selected source, page row or content selection. Missing withheld dates remain unavailable, not zero." action={<div className="wb-segmented" role="group" aria-label="Trend metric">{[["sessions","Sessions"],["screenPageViews","Page views"],["engagedSessions","Engaged"]].map(([id,label])=><button type="button" key={id} aria-pressed={metricName===id} onClick={()=>setMetric(id)}>{label}</button>)}</div>}>
    <ReportGate search={search} status={status} statusError={statusError} pending={query.isFetching&&!data} error={!!query.error} retry={()=>{void query.refetch()}}/>
    {data&&!query.error&&<><ReportLimitations data={data}/><TrendChart key={`${search.mode}-${search.device}-${search.days}`} data={data} metricName={metricName}/><div className="wb-chart-footer"><span>{data.source==="sample"?"Invented sample":data.table.metadata.timeZone} · no previous-period comparison</span><button type="button" disabled={!data.table.rows?.length} onClick={()=>downloadReport(data)}>Export daily rows</button></div></>}
  </Panel>
}
