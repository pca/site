import { metric, type WorkbenchReport } from "./analytics-workbench.ts"

export interface TrendPoint { date:string; value:number|null }
export function trendPoints(report:WorkbenchReport, metricName:string):TrendPoint[] {
  if(report.table.dimensionHeaders.length!==1||report.table.dimensionHeaders[0].name!=="date") throw new Error("Daily report required")
  const dates=new Map<string,number>()
  for(const row of report.table.rows??[]) {
    const raw=row.dimensionValues[0]?.value??"",date=`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`
    if(!/^\d{8}$/.test(raw)||!Number.isFinite(Date.parse(date))||new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date||date<report.start||date>report.end||dates.has(date)) throw new Error("Invalid or duplicate daily date")
    dates.set(date,metric(row,metricName,report.table))
  }
  const meta=[report.table.metadata,report.totals.metadata]
  const incomplete=meta.some(item=>item.subjectToThresholding||item.dataLossFromOtherRow||item.samplingMetadatas?.length)||report.table.rowCount>(report.table.rows?.length??0)
  const points:TrendPoint[]=[]
  for(let stamp=Date.parse(`${report.start}T00:00:00Z`),end=Date.parse(`${report.end}T00:00:00Z`);stamp<=end;stamp+=86_400_000) {
    const date=new Date(stamp).toISOString().slice(0,10)
    points.push({date,value:dates.get(date)??(incomplete?null:0)})
  }
  return points
}

export function trendPath(points:TrendPoint[],width=760,height=180,ceiling?:number) {
  const max=Math.max(1,ceiling??0,...points.map(point=>point.value??0))
  let open=false
  const line=points.map((point,index)=>{
    if(point.value===null){open=false;return ""}
    const x=points.length>1?index/(points.length-1)*width:width/2,y=height-point.value/max*height
    const segment=`${open?"L":"M"}${x.toFixed(2)},${y.toFixed(2)}`;open=true;return segment
  }).join(" ")
  return {line,max}
}
