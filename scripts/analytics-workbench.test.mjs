import assert from "node:assert/strict"
import {test} from "node:test"
import {designSpecs,isCoreSection,metric,metricNames,parseNotes,percent,reportCsv,reportDimensions,sampleReport,validReport,workbenchSearch,workbenchSections} from "../apps/admin/src/lib/analytics-workbench.ts"
import {previewLibrary,sampleSessions} from "../apps/admin/src/lib/analytics-workspace.ts"

test("expanded implementation scope stays explicit with designs and links for every area",()=>{
  assert.equal(workbenchSections.filter(s=>isCoreSection(s.id)).length,9)
  assert.equal(Object.keys(designSpecs).length,6)
  assert.equal(workbenchSections.length,10)
  const links=previewLibrary.flatMap(g=>g.links)
  for(const section of workbenchSections)assert.ok(links.some(l=>l.href===`/admin/analytics-workbench/${section.id}`))
  for(const section of Object.keys(designSpecs)){assert.ok(workbenchSections.some(s=>s.id===section));assert.ok(designSpecs[section].needs&&designSpecs[section].caution)}
  assert.ok(links.some(link=>link.href==="/admin/analytics-feature-concept"))
})
test("search allows only known modes, devices and periods",()=>{
  assert.deepEqual(workbenchSearch({mode:"live",days:365,device:"visitor-email"}),{mode:"sample",days:28,device:"all"})
  assert.deepEqual(workbenchSearch({mode:"ga4",days:"7",device:"tablet"}),{mode:"ga4",days:7,device:"tablet"})
  assert.equal(workbenchSearch({view:"campaign"}).view,"campaign")
  assert.equal(workbenchSearch({view:"content"}).view,"content")
  assert.equal(workbenchSearch({view:"feedback_saved"}).view,"feedback_saved")
  assert.equal(workbenchSearch({view:"plans_saved"}).view,"plans_saved")
  assert.equal(workbenchSearch({view:"anything"}).view,undefined)
})
test("sample report tables share exact session scope and independently deduplicated totals",()=>{
  for(const days of [7,28])for(const device of ["all","mobile","desktop","tablet"]){
    const search={days,device,mode:"sample"},sessions=sampleSessions.filter(s=>s.day>=56-days&&(device==="all"||s.device===device))
    for(const kind of ["pages","audience","acquisition"])for(const dim of Object.keys(reportDimensions[kind])){
      const r=sampleReport(sampleSessions,search,kind,dim),total=r.totals.rows[0]
      assert.equal(metric(total,"sessions",r.totals),sessions.length)
      assert.equal(metric(total,"activeUsers",r.totals),new Set(sessions.map(s=>s.identity)).size)
      assert.equal(metric(total,"screenPageViews",r.totals),sessions.reduce((n,s)=>n+s.pages.length,0))
      for(const row of r.table.rows){assert.ok(metric(row,"engagedSessions",r.table)<=metric(row,"sessions",r.table));assert.ok(metric(row,"activeUsers",r.table)<=metric(row,"sessions",r.table))}
      if(kind!=="pages")assert.equal(r.table.rows.reduce((sum,row)=>sum+metric(row,"sessions",r.table),0),sessions.length)
      else assert.equal(r.table.rows.reduce((sum,row)=>sum+metric(row,"screenPageViews",r.table),0),metric(total,"screenPageViews",r.totals))
      assert.equal(r.source,"sample");assert.equal(r.table.metadata.timeZone,"Asia/Manila")
    }
  }
})
test("report validation prevents scope/header mismatch and invalid values",()=>{
  const sample=sampleReport(sampleSessions,{mode:"sample",days:28,device:"all"},"acquisition","source")
  assert.equal(validReport(sample,"acquisition","all","source"),false)
  const live={...sample,source:"ga4"}
  assert.equal(validReport(live,"acquisition","all","source"),true)
  assert.equal(validReport(live,"acquisition","mobile","source"),false)
  assert.equal(validReport(live,"acquisition","all","campaign"),false)
  const invalid=structuredClone(live);invalid.table.rows[0].metricValues[0].value="NaN";assert.equal(validReport(invalid,"acquisition","all","source"),false)
  const wrong=structuredClone(live);wrong.table.metricHeaders.reverse();assert.equal(validReport(wrong,"acquisition","all","source"),false)
  assert.equal(metricNames.length,4);assert.equal(percent(0,0),"—")
})
test("CSV identifies source, dates, device and defuses spreadsheet formulas",()=>{
  const r=sampleReport(sampleSessions,{mode:"sample",days:28,device:"all"},"acquisition","source")
  r.table.rows[0].dimensionValues[0].value='=HYPERLINK("malicious")'
  const csv=reportCsv(r,[r.table.rows[0]])
  assert.match(csv,/SAMPLE DATA/);assert.match(csv,/2026-09-21/);assert.match(csv,/Asia\/Manila/);assert.ok(csv.includes("'=HYPERLINK"));assert.equal(csv.split("\n").length,3)
})
test("local analysis notes are bounded and keep sample/live provenance",()=>{
  const note={id:"qa",source:"sample",section:"acquisition",question:"Which source?",evidence:"Invented data",action:"Verify collection",createdAt:"2026-10-23T00:00:00Z"}
  assert.deepEqual(parseNotes(JSON.stringify([note])),[note]);assert.deepEqual(parseNotes("corrupt"),[])
  assert.equal(parseNotes(JSON.stringify([{...note,source:"unknown"},{...note,evidence:"x".repeat(3001)},{...note,section:"passwords"}])).length,0)
  assert.equal(parseNotes(JSON.stringify(Array.from({length:40},()=>note))).length,30)
})
