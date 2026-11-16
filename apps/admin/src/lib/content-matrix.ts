import { metric, type ReportRow, type WorkbenchReport } from "./analytics-workbench.ts"

/** Bounded projection of returned event × region rows, never a fabricated census. */
export function contentMatrix(report:WorkbenchReport) {
  if(report.report!=="content"||report.breakdown!=="event_region")throw new Error("Event × region report required")
  const rows=report.table.rows??[],events=new Map<string,number>(),regions=new Map<string,number>()
  for(const row of rows){const [event,region]=row.dimensionValues.map(item=>item.value),count=metric(row,"eventCount",report.table);events.set(event,(events.get(event)??0)+count);regions.set(region,(regions.get(region)??0)+count)}
  const top=(groups:Map<string,number>,limit:number)=>[...groups].sort((a,b)=>b[1]-a[1]).slice(0,limit).map(([name])=>name)
  const eventIds=top(events,10),regionIds=top(regions,8),cells=new Map<string,ReportRow>()
  for(const row of rows){const [event,region]=row.dimensionValues.map(item=>item.value);if(eventIds.includes(event)&&regionIds.includes(region))cells.set(JSON.stringify([event,region]),row)}
  const max=Math.max(1,...[...cells.values()].map(row=>metric(row,"eventCount",report.table)))
  return {eventIds,regionIds,cells,max,limited:events.size>eventIds.length||regions.size>regionIds.length||report.table.rowCount>rows.length}
}
