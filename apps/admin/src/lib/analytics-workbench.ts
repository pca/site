import type { SampleSession } from "./analytics-workspace"
import { featureExamples, previewRate, returningGroups, returnWeeks } from "./behavior-preview.ts"
import { sampleSignalReport, signalMetricNames, type ContentPage } from "./analytics-signals.ts"
import { workbenchSections, type WorkbenchSearch, type WorkbenchSection, type WorkbenchDevice } from "./analytics-navigation.ts"
export { workbenchSections, workbenchSearch, type WorkbenchSearch, type WorkbenchSection, type WorkbenchDevice } from "./analytics-navigation.ts"

export type ReportKind = "pages"|"audience"|"acquisition"|"content"|"features"
export const reportDimensions:Record<ReportKind,Record<string,string>> = {
  pages:{ "":"pagePath", date:"date" }, audience:{device:"deviceCategory", os:"operatingSystem", browser:"browser", brand:"mobileDeviceBranding"},
  acquisition:{source:"sessionSourceMedium", channel:"sessionDefaultChannelGroup", campaign:"sessionCampaignName", landing:"landingPage"},
  content:{event:"customEvent:event_id",event_region:"customEvent:event_id",region:"customEvent:region_id",format:"customEvent:result_type",view:"customEvent:view_id",entry:"customEvent:content_entry",page:"customEvent:content_page"},
  features:{feature:"customEvent:feature_name"},
}
export const metricNames = ["sessions","engagedSessions","activeUsers","screenPageViews"] as const
export const metricNamesFor = (kind:string):readonly string[] => kind==="content"||kind==="features" ? signalMetricNames : metricNames
interface Cell { value:string }
export interface ReportRow { dimensionValues:Cell[]; metricValues:Cell[] }
export interface ReportTable {
  dimensionHeaders:{name:string}[]; metricHeaders:{name:string}[]; rows:ReportRow[]|null; rowCount:number
  metadata:{timeZone:string; subjectToThresholding:boolean; dataLossFromOtherRow:boolean; samplingMetadatas?:{samplesReadCount:string; samplingSpaceSize:string}[]}
}
export interface WorkbenchReport {
  source:"sample"|"ga4"; report:string; device:string; breakdown:string; start:string; end:string; fetchedAt:string; cached:boolean; hosts:string[]; table:ReportTable; totals:ReportTable
  contentPage?:ContentPage
}
export interface ReportingStatus {state:"not_configured"|"invalid_configuration"|"ready";message:string;hosts:string[];cacheSeconds:number}
export function measurementConnectionStatus(status:ReportingStatus|undefined, loading:boolean, error:boolean):{tone:"warning"|"error"|"neutral";label:string} {
  if(loading) return {tone:"neutral",label:"Checking server setup…"}
  if(error) return {tone:"error",label:"Server check failed"}
  if(status?.state==="invalid_configuration") return {tone:"error",label:"Configuration error"}
  if(status?.state==="ready") return {tone:"warning",label:"Configured · access unverified"}
  if(status?.state==="not_configured") return {tone:"warning",label:"Setup needed"}
  return {tone:"neutral",label:"Setup not checked"}
}
export const isCoreSection = (id:WorkbenchSection) => id!=="overview"
export function metric(row:ReportRow|undefined, name:string, table:ReportTable) {
  const i = table.metricHeaders.findIndex(h=>h.name===name)
  const n = Number(row?.metricValues[i]?.value ?? 0)
  return Number.isFinite(n) && n>=0 ? n:0
}
export function percent(n:number,d:number) { return d>0 ? `${(n/d*100).toFixed(1)}%`:"—" }
const record = (value:unknown):value is Record<string,unknown> => !!value && typeof value === "object" && !Array.isArray(value)
const reportNumber = (value:unknown):value is string => typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value)) && Number(value)<=1e15
function reportDate(value:unknown) {
  if(typeof value!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN
  const stamp=Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0,10)===value ? stamp:NaN
}
function validTable(value:unknown, dimensions:readonly string[], metrics:readonly string[]):value is ReportTable {
  if(!record(value) || !Array.isArray(value.dimensionHeaders) || !Array.isArray(value.metricHeaders)) return false
  if(value.dimensionHeaders.length!==dimensions.length || value.metricHeaders.length!==metrics.length) return false
  if(!value.dimensionHeaders.every((header,i)=>record(header)&&header.name===dimensions[i]) || !value.metricHeaders.every((header,i)=>record(header)&&header.name===metrics[i])) return false
  const meta=value.metadata
  if(!record(meta) || typeof meta.timeZone!=="string" || !meta.timeZone || typeof meta.subjectToThresholding!=="boolean" || typeof meta.dataLossFromOtherRow!=="boolean") return false
  try { new Intl.DateTimeFormat("en",{timeZone:meta.timeZone}) } catch { return false }
  if(meta.samplingMetadatas!==undefined && (!Array.isArray(meta.samplingMetadatas) || !meta.samplingMetadatas.every(item=>record(item)&&reportNumber(item.samplesReadCount)&&reportNumber(item.samplingSpaceSize)&&Number(item.samplesReadCount)<=Number(item.samplingSpaceSize)))) return false
  if(value.rows!==null && !Array.isArray(value.rows)) return false
  const rows=value.rows??[]
  if(typeof value.rowCount!=="number" || !Number.isInteger(value.rowCount) || value.rowCount<rows.length || rows.length>200 || (dimensions.length===0 && rows.length>1)) return false
  return rows.every(row=>record(row)&&Array.isArray(row.metricValues)&&row.metricValues.length===metrics.length&&row.metricValues.every(cell=>record(cell)&&reportNumber(cell.value))&&Array.isArray(row.dimensionValues)&&row.dimensionValues.length===dimensions.length&&row.dimensionValues.every(cell=>record(cell)&&typeof cell.value==="string"))
}
/** Treat network JSON as unknown; malformed reports must fail closed, not crash. */
export function validReport(value:unknown, kind:ReportKind, device:WorkbenchDevice, breakdown:string, page:ContentPage="all", days?:7|28):value is WorkbenchReport {
  const expected=reportDimensions[kind]?.[breakdown]
  if(!record(value) || value.source!=="ga4" || value.report!==kind || value.device!==device || value.breakdown!==breakdown || !expected) return false
  if(kind==="content" ? value.contentPage!==page:value.contentPage!==undefined) return false
  if(!Array.isArray(value.hosts) || value.hosts.length!==2 || !value.hosts.includes("pinoycubers.org") || !value.hosts.includes("www.pinoycubers.org")) return false
  const length=(reportDate(value.end)-reportDate(value.start))/86_400_000+1
  if(days ? length!==days:![7,28].includes(length)) return false
  const names=metricNamesFor(kind), dimensions=kind==="features"?[expected,"eventName"]:kind==="content"&&breakdown==="event_region"?[expected,"customEvent:region_id"]:[expected]
  if(!validTable(value.table,dimensions,names) || !validTable(value.totals,[],names)) return false
  return value.table.metadata.timeZone===value.totals.metadata.timeZone
}

/** All sample views are partitions/projections of one explicitly invented model. */
export function sampleReport(universe:SampleSession[], search:WorkbenchSearch, kind:ReportKind, breakdown:string, page:ContentPage="all", range?:{start:string;end:string}):WorkbenchReport {
  if(kind==="content"||kind==="features")return sampleSignalReport(universe,search,kind,breakdown,page)
  const dateFor=(day:number)=>new Date(Date.UTC(2026,7,24+day)).toISOString().slice(0,10)
  const sessions = universe.filter(s=>(range?dateFor(s.day)>=range.start&&dateFor(s.day)<=range.end:s.day>=56-search.days) && (search.device==="all" || s.device===search.device))
  const dimension = reportDimensions[kind][breakdown]
  const groups = new Map<string,SampleSession[]>()
  const add = (name:string,s:SampleSession) => groups.set(name,[...(groups.get(name)??[]),s])
  const tech = (s:SampleSession) => {
    const n = [...s.identity].reduce((sum,ch)=>sum+ch.charCodeAt(0),0)%5
    if(s.device==="mobile") return n<2 ? {os:"iOS",browser:"Safari",brand:"Apple"}:{os:"Android",browser:"Chrome",brand:n===2?"Google":"Samsung"}
    return n<2 ? {os:"macOS",browser:"Safari",brand:"Apple"}:{os:"Windows",browser:n===2?"Edge":"Chrome",brand:"(not set)"}
  }
  for(const s of sessions) {
    if(kind==="pages"&&breakdown==="date") add(new Date(Date.UTC(2026,7,24+s.day)).toISOString().slice(0,10).replaceAll("-",""),s)
    else if(kind==="pages") for(const p of s.pages) add(p==="rankings"?"/regional-rankings":"/regional-statistics",s)
    if(kind==="audience") add(breakdown==="device"?s.device:tech(s)[breakdown as "os"|"browser"|"brand"],s)
    if(kind==="acquisition") add(breakdown==="source"?`${s.acquisition.source} / ${s.acquisition.medium}`:breakdown==="channel"?s.channel:breakdown==="campaign"?s.acquisition.campaign??"(not set)":s.pages[0]==="rankings"?"/regional-rankings":"/regional-statistics",s)
  }
  const values=(items:SampleSession[],page=false) => [items.length,items.filter(s=>s.engaged).length,new Set(items.map(s=>s.identity)).size,items.reduce((sum,s)=>sum+(page?1:s.pages.length),0)].map(n=>({value:String(n)}))
  const headers=metricNames.map(name=>({name}))
  const metadata={timeZone:"Asia/Manila",subjectToThresholding:false,dataLossFromOtherRow:false}
  const rows=[...groups].map(([name,members])=>({dimensionValues:[{value:name}],metricValues:values(members,kind==="pages"&&breakdown!=="date")})).sort((a,b)=>Number(b.metricValues[0].value)-Number(a.metricValues[0].value))
  return {source:"sample",report:kind,device:search.device,breakdown,start:range?.start??(search.days===7?"2026-10-12":"2026-09-21"),end:range?.end??"2026-10-18",fetchedAt:"",cached:false,hosts:["pinoycubers.org","www.pinoycubers.org"],table:{dimensionHeaders:[{name:dimension}],metricHeaders:headers,rows,rowCount:rows.length,metadata},totals:{dimensionHeaders:[],metricHeaders:headers,rows:[{dimensionValues:[],metricValues:values(sessions)}],rowCount:1,metadata}}
}

// Formula-like external labels must remain text when opened in a spreadsheet.
export const safeCsvCell=(value:string) => `"${(/^[\s]*[=+@-]/.test(value)?"'":"")+value.replaceAll('"','""')}"`
export function reportCsv(report:WorkbenchReport, rows:ReportRow[]) {
  return [[report.source==="sample"?"SAMPLE DATA — invented":"GA4 report",report.start,report.end,report.device,report.table.metadata.timeZone,report.contentPage??""],[...report.table.dimensionHeaders.map(header=>header.name),...report.table.metricHeaders.map(header=>header.name)],...rows.map(r=>[...r.dimensionValues.map(d=>d.value),...r.metricValues.map(m=>m.value)])].map(r=>r.map(safeCsvCell).join(",")).join("\n")
}

export interface AnalysisNote {id:string;source:"sample"|"ga4";section:WorkbenchSection;question:string;evidence:string;action:string;createdAt:string}
export function analysisNotesCsv(notes:AnalysisNote[]) {
  return [["Dev Analysis Log — browser-local notes, not shared server records"],["source","section","created_at","question","evidence","next_action"],...notes.map(note=>[note.source,note.section,note.createdAt,note.question,note.evidence,note.action])].map(row=>row.map(safeCsvCell).join(",")).join("\n")
}
export function parseNotes(raw:string|null):AnalysisNote[] {
  try { const data=JSON.parse(raw??"[]"); return Array.isArray(data)?data.filter((n:AnalysisNote)=>n && typeof n.id==="string" && ["sample","ga4"].includes(n.source) && workbenchSections.some(s=>s.id===n.section) && [n.question,n.evidence,n.action,n.createdAt].every(v=>typeof v==="string" && v.length<=3000)).slice(0,30):[] } catch{return []}
}

export const designSpecs = {
  features:{primary:"Discovery → use",decision:"Prioritize visibility before redesigning a control that few sessions saw.",columns:["Feature","Eligible sessions","Exposed sessions","Used sessions","Use / exposed"],rows:featureExamples.map(item=>[item.name,item.eligible.toLocaleString("en-US"),item.exposed.toLocaleString("en-US"),item.used.toLocaleString("en-US"),previewRate(item.used,item.exposed)]),detail:"The preview shows exposure and action rules. Validated device splits and linked feedback would require additional reporting.",needs:"Validated exposure events and same-session identity joins. Collection exists in draft code; the reporting join is not implemented.",caution:"Visibility is not understanding. An interaction is not proof of task success."},
  journeys:{primary:"Region setup",decision:"Find the step to investigate before changing the flow.",columns:["Ordered step","Sessions","Share of entry"],rows:[["Prompt visible","733","100%"],["Login started","210","28.6%"],["Login completed","144","19.6%"],["Region submitted","100","13.6%"]],detail:"A second view would show page paths, separate from this closed task funnel. Source/device drilldowns must retain the same entry population.",needs:"Ordered events, a declared session/window and verified continuity across WCA login. No ordered reporting backend is implemented.",caution:"A stop can be intentional or technical; it does not diagnose confusion."},
  retention:{primary:"Returning cohorts",decision:"See whether a useful first visit is followed by later activity.",columns:["First week","Browser IDs",...returnWeeks.map(week=>`Week ${week}`)],rows:returningGroups.map(group=>[group.week,String(group.size),...group.returned.map(count=>previewRate(count,group.size))]),detail:"The preview links a curve, heatmap and original denominator. Acquisition-source comparisons would be a later drilldown, not part of this visual pass.",needs:"Privacy-reviewed durable identity and enough completed history. Current session-only cookies limit cross-session retention; no retention backend is implemented.",caution:"Returning browsers are not necessarily returning people. Unfinished weeks are not zero."},
  feedback:{primary:"Contextual inbox",decision:"Separate data issues, UX problems and suggestions; triage what to investigate.",columns:["Example report","Type","Context","Status"],rows:[["Ranking looks incorrect","Data issue","Rankings · 3×3 · NCR","New"],["Cannot find event control","UX feedback","Statistics · mobile","Reviewing"]],detail:"Selecting a message would reveal its wording, allowlisted page/event/region/snapshot context and review history. The public form would be optional and asynchronous.",needs:"Protected feedback storage, rate limits, moderation and retention policy. No public feedback form or storage is activated.",caution:"Code can attach context and categories. Free-text interpretation needs human review or an explicitly approved classifier; feedback is self-selected."},
  releases:{primary:"Release comparison",decision:"Check whether observed behavior changed around a specific release.",columns:["Metric","Before","After","Interpretation"],rows:[["Filter-use sessions","32.1%","35.4%","Descriptive only"],["Mobile share","68.0%","75.0%","Traffic mix changed"],["Login failure rate","—","—","Tracking needed"]],detail:"A release timeline would show deployment notes and matching before/after windows, with device/source controls and measurement-version markers.",needs:"Release records, comparable windows and stable metric definitions. No deployment integration or release-impact calculation is implemented.",caution:"Seasonality, traffic mix and other changes can explain a difference. Before/after is not a randomized test."},
  experiments:{primary:"Experiment plan",decision:"Decide whether a test is feasible before building or launching variants.",columns:["Plan element","Example"],rows:[["Hypothesis","Clearer region instructions increase completed setup"],["Primary outcome","Region submitted / exposed browser IDs"],["Guardrail","Login failure rate"],["Decision rule","Define sample, duration and uncertainty before launch"]],detail:"A plan would progress from draft to tracking QA to an explicitly authorized launch. Results would include uncertainty and assignment checks, not just uplift.",needs:"Stable assignment, exposure delivery, a sample-size plan and a kill switch. No assignment, experiment delivery or winner calculation is implemented.",caution:"A higher percentage is not automatically a winner. Low traffic may make an A/B test impractical."},
} as const
