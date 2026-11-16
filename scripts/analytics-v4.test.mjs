import assert from "node:assert/strict"
import { test } from "node:test"
import { sampleSessions } from "../apps/admin/src/lib/analytics-workspace.ts"
import { sampleReport, metric } from "../apps/admin/src/lib/analytics-workbench.ts"
import { trendPoints, trendPath } from "../apps/admin/src/lib/analytics-trend.ts"
import { releaseWindows, sampleRelease, validRelease, releaseSummary, releaseCsv } from "../apps/admin/src/lib/release-comparison.ts"
import {contentMatrix} from "../apps/admin/src/lib/content-matrix.ts"
import {parseSavedCampaigns,campaignLibraryCsv,defaultCampaignDraft} from "../apps/admin/src/lib/campaign-link.ts"

test("daily totals reconcile with period counts without summing distinct users",()=>{
  for(const days of [7,28])for(const device of ["all","mobile","desktop","tablet"]){
    const data=sampleReport(sampleSessions,{mode:"sample",days,device},"pages","date")
    for(const name of ["sessions","engagedSessions","screenPageViews"]){
      const points=trendPoints(data,name)
      assert.equal(points.length,days)
      assert.equal(points[0].date,data.start);assert.equal(points.at(-1).date,data.end)
      assert.equal(points.reduce((n,point)=>n+point.value,0),metric(data.totals.rows[0],name,data.totals))
      assert.equal(new Set(points.map(point=>point.date)).size,days)
    }
  }
})
test("withheld daily values stay gaps, not invented zeros or interpolated lines",()=>{
  const report=sampleReport(sampleSessions,{mode:"sample",days:7,device:"all"},"pages","date")
  report.table.rows=report.table.rows.slice(0,2);report.table.rowCount=2
  report.table.metadata={...report.table.metadata,subjectToThresholding:true}
  const points=trendPoints(report,"sessions")
  assert.equal(points.filter(point=>point.value===null).length,5)
  const path=trendPath([{date:"a",value:3},{date:"b",value:null},{date:"c",value:5}]).line
  assert.equal((path.match(/M/g)??[]).length,2)
  assert.equal(path.includes("L"),false)
  assert.equal(path.includes("NaN"),false)
  assert.equal(trendPath([{date:"a",value:50}],760,180,100).max,100)
  assert.match(trendPath([{date:"a",value:50}],760,180,100).line,/,90\.00/)
})
test("daily malformed or duplicate dates cannot silently become a blank plausible chart",()=>{
  for(const raw of ["20260230","unexpected","20260101"]){
    const report=sampleReport(sampleSessions,{mode:"sample",days:7,device:"all"},"pages","date")
    report.table.rows[0].dimensionValues[0].value=raw
    assert.throws(()=>trendPoints(report,"sessions"))
  }
  const report=sampleReport(sampleSessions,{mode:"sample",days:7,device:"all"},"pages","date")
  report.table.rows.push(structuredClone(report.table.rows[0]))
  assert.throws(()=>trendPoints(report,"sessions"))
})
test("release windows exclude the mixed release day and retain equal exact populations",()=>{
  assert.deepEqual(releaseWindows("2026-10-10",7),{before:{start:"2026-10-03",end:"2026-10-09"},after:{start:"2026-10-11",end:"2026-10-17"}})
  assert.equal(releaseWindows("2026-02-30",7),null)
  assert.equal(releaseWindows("nonsense",7),null)
  for(const device of ["all","mobile","desktop","tablet"])for(const breakdown of ["trend","device","source"]){
    const request={date:"2026-10-10",days:7,breakdown},search={mode:"sample",days:28,device},data=sampleRelease(request,search)
    assert.ok(data)
    const windows=releaseWindows(request.date,request.days)
    for(const side of ["before","after"]){
      const sessions=sampleSessions.filter(session=>{
        const date=new Date(Date.UTC(2026,7,24+session.day)).toISOString().slice(0,10)
        return date>=windows[side].start&&date<=windows[side].end&&(device==="all"||device===session.device)
      })
      assert.equal(metric(data[side].totals.rows[0],"sessions",data[side].totals),sessions.length)
      assert.equal(metric(data[side].totals.rows[0],"activeUsers",data[side].totals),new Set(sessions.map(session=>session.identity)).size)
      assert.equal(data[side].start,windows[side].start);assert.equal(data[side].end,windows[side].end)
    }
    assert.equal(validRelease(data,request,search),false)
    const live=structuredClone(data);live.source="ga4";live.before.source="ga4";live.after.source="ga4"
    assert.equal(validRelease(live,request,search),true)
    const wrong=structuredClone(live);wrong.after.start=wrong.before.start
    assert.equal(validRelease(wrong,request,search),false)
    assert.equal(validRelease(live,{...request,date:"2026-10-11"},search),false)
    assert.match(releaseCsv(data),/release day excluded/)
    assert.match(releaseCsv(data),/SAMPLE DATA/)
  }
})
test("zero baseline and insufficient sample history never produce fake uplift or early results",()=>{
  const search={mode:"sample",days:28,device:"tablet"},request={date:"2026-10-10",days:7,breakdown:"trend"}
  const summary=releaseSummary(sampleRelease(request,search))
  assert.equal(summary.relativeChange,null);assert.equal(summary.rateChange,null)
  assert.equal(summary.sessionsBefore,0);assert.equal(summary.sessionsAfter,0)
  assert.equal(sampleRelease({...request,days:28},search),null)
  assert.equal(sampleRelease({...request,date:"2026-10-17"},search),null)
})
test("event-region matrix cells retain exact returned rows and never synthesize missing combinations",()=>{
  const report=sampleReport(sampleSessions,{mode:"sample",days:28,device:"all"},"content","event_region")
  const matrix=contentMatrix(report)
  assert.ok(matrix.eventIds.length<=10);assert.ok(matrix.regionIds.length<=8)
  for(const [key,row] of matrix.cells){assert.equal(key,JSON.stringify(row.dimensionValues.map(item=>item.value)));assert.ok(report.table.rows.includes(row))}
  assert.equal(matrix.cells.size,report.table.rows.length)
  assert.equal(matrix.limited,false)
  const empty=structuredClone(report);empty.table.rows=[];empty.table.rowCount=0
  assert.equal(contentMatrix(empty).cells.size,0)
  const removed=report.table.rows.pop(),key=JSON.stringify(removed.dimensionValues.map(item=>item.value))
  assert.equal(contentMatrix(report).cells.has(key),false)
  report.table.rowCount=201;assert.equal(contentMatrix(report).limited,true)
})
test("saved campaign links are bounded, deduplicated and revalidated rather than trusting stored URLs",()=>{
  const item={id:"qa",createdAt:"2026-10-24T12:00:00Z",draft:{...defaultCampaignDraft},url:"javascript:unexpected()"}
  const parsed=parseSavedCampaigns(JSON.stringify([item,{...item,id:"duplicate"},{...item,id:"bad",draft:{...item.draft,source:"person@example.com"}}]))
  assert.equal(parsed.length,1)
  assert.equal("url" in parsed[0],false)
  assert.equal(campaignLibraryCsv(parsed).includes("javascript:"),false)
  assert.match(campaignLibraryCsv(parsed),/https:\/\/pinoycubers.org\/regional-rankings\?utm_source=/)
  assert.equal(parseSavedCampaigns("broken").length,0)
  assert.equal(parseSavedCampaigns(JSON.stringify([{...item,createdAt:"not-a-date"}])).length,0)
  assert.equal(parseSavedCampaigns(JSON.stringify(Array.from({length:60},(_,index)=>({...item,id:`qa-${index}`,draft:{...item.draft,campaign:`campaign-${index}`}})))).length,50)
})
