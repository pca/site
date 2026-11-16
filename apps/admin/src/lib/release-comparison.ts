import { sampleReport, validReport, metric, reportCsv, safeCsvCell, type ReportKind, type WorkbenchReport, type WorkbenchSearch } from "./analytics-workbench.ts"
import { sampleSessions } from "./analytics-workspace.ts"

export type ReleaseBreakdown="trend"|"device"|"source"
export interface ReleaseRequest { date:string;days:7|28;breakdown:ReleaseBreakdown }
export interface ReleaseComparison {source:"sample"|"ga4";releaseDate:string;days:7|28;device:string;breakdown:ReleaseBreakdown;before:WorkbenchReport;after:WorkbenchReport}
export function releaseWindows(date:string,days:7|28) {
  const stamp=Date.parse(`${date}T00:00:00Z`)
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,10)!==date||![7,28].includes(days)) return null
  const at=(offset:number)=>new Date(stamp+offset*86_400_000).toISOString().slice(0,10)
  return {before:{start:at(-days),end:at(-1)},after:{start:at(1),end:at(days)}}
}
export function releaseReportSpec(breakdown:ReleaseBreakdown):{kind:ReportKind;dimension:string} {
  return breakdown==="device"?{kind:"audience",dimension:"device"}:breakdown==="source"?{kind:"acquisition",dimension:"source"}:{kind:"pages",dimension:"date"}
}
export function sampleRelease(request:ReleaseRequest,search:WorkbenchSearch):ReleaseComparison|null {
  const windows=releaseWindows(request.date,request.days)
  if(!windows||windows.before.start<"2026-08-24"||windows.after.end>"2026-10-18")return null
  const {kind,dimension}=releaseReportSpec(request.breakdown),scope={...search,days:request.days}
  return {source:"sample",releaseDate:request.date,days:request.days,device:search.device,breakdown:request.breakdown,
    before:sampleReport(sampleSessions,scope,kind,dimension,"all",windows.before),after:sampleReport(sampleSessions,scope,kind,dimension,"all",windows.after)}
}
export function validRelease(value:unknown,request:ReleaseRequest,search:WorkbenchSearch):value is ReleaseComparison {
  if(!value||typeof value!=="object")return false
  const result=value as ReleaseComparison,windows=releaseWindows(request.date,request.days),spec=releaseReportSpec(request.breakdown)
  if(!windows||result.source!=="ga4"||result.releaseDate!==request.date||result.days!==request.days||result.device!==search.device||result.breakdown!==request.breakdown)return false
  if(!validReport(result.before,spec.kind,search.device,spec.dimension,"all",request.days)||!validReport(result.after,spec.kind,search.device,spec.dimension,"all",request.days))return false
  return result.before.start===windows.before.start&&result.before.end===windows.before.end&&result.after.start===windows.after.start&&result.after.end===windows.after.end&&result.before.totals.metadata.timeZone===result.after.totals.metadata.timeZone
}
export function releaseSummary(data:ReleaseComparison) {
  const get=(period:WorkbenchReport,name:string)=>metric(period.totals.rows?.[0],name,period.totals)
  const sessionsBefore=get(data.before,"sessions"),sessionsAfter=get(data.after,"sessions")
  const beforeRate=sessionsBefore>0?get(data.before,"engagedSessions")/sessionsBefore:null,afterRate=sessionsAfter>0?get(data.after,"engagedSessions")/sessionsAfter:null
  return {sessionsBefore,sessionsAfter,sessionChange:sessionsAfter-sessionsBefore,relativeChange:sessionsBefore>0?(sessionsAfter-sessionsBefore)/sessionsBefore:null,
    beforeRate,afterRate,rateChange:beforeRate===null||afterRate===null?null:(afterRate-beforeRate)*100}
}
export function releaseCsv(data:ReleaseComparison) {
  return [["Release comparison",data.source,data.releaseDate,`${data.days} days each side; release day excluded`,data.device,data.breakdown,"Descriptive, not causal"].map(safeCsvCell).join(","),
    '"BEFORE"',reportCsv(data.before,data.before.table.rows??[]),'"AFTER"',reportCsv(data.after,data.after.table.rows??[])].join("\n")
}
