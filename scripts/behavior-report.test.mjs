import {test} from "node:test"
import assert from "node:assert/strict"
import {sampleBehavior,validBehavior,startingWeeks,behaviorCsv} from "../apps/admin/src/lib/behavior-report.ts"
test("journeys use nested identities, consistent scope and fixed definitions",()=>{
 for(const device of ["all","mobile","desktop","tablet"])for(const days of [7,28])for(const funnel of ["region","rankings_statistics"]){
  const scope={mode:"sample",device,days},sample=sampleBehavior("journeys",scope,funnel),live={...sample,source:"ga4"}
  assert.equal(validBehavior(live,"journeys",scope,funnel),true)
  for(let i=1;i<sample.steps.length;i++)assert.ok(sample.steps[i].users<=sample.steps[i-1].users)
  assert.equal(validBehavior(sample,"journeys",scope,funnel),false)
  assert.equal(validBehavior({...live,device:"unknown"},"journeys",scope,funnel),false)
  const wrong=structuredClone(live);wrong.steps[1].users=wrong.steps[0].users+1;assert.equal(validBehavior(wrong,"journeys",scope,funnel),false)
  assert.match(behaviorCsv(sample),/SAMPLE DATA/);assert.match(behaviorCsv(sample),/not same-session/)
 }
})
test("cohorts align to Google Sunday weeks and never show unfinished follow-up cells",()=>{
 assert.deepEqual(startingWeeks("2026-10-18").at(-1),{start:"2026-10-11",end:"2026-10-17"})
 assert.deepEqual(startingWeeks("2026-10-17").at(-1),{start:"2026-10-11",end:"2026-10-17"})
 for(const device of ["all","mobile","desktop","tablet"]){
  const scope={mode:"sample",days:7,device},r=sampleBehavior("retention",scope),live={...r,source:"ga4"}
  assert.equal(r.days,28);assert.equal(validBehavior(live,"retention",scope,"region"),true)
  assert.equal(r.cohorts.at(-1).counts[1],null)
  for(const g of r.cohorts)for(const n of g.counts)assert.ok(n===null||n<=g.size)
  const wrong=structuredClone(live);wrong.cohorts.at(-1).counts[1]=0;assert.equal(validBehavior(wrong,"retention",scope,"region"),false)
  assert.match(behaviorCsv(r),/Unavailable/);assert.match(behaviorCsv(r),/Sunday weeks/)
 }
})
test("malformed behavior reports fail closed, including missing counts and wrong denominators",()=>{
 const search={mode:"ga4",days:28,device:"all"},r={...sampleBehavior("retention",search),source:"ga4"}
 for(const value of [null,{}, {...r,cohorts:null},{...r,timeZone:"invalid"},{...r,hosts:["beta.pinoycubers.org"]},{...r,end:"2026-02-30"}])assert.equal(validBehavior(value,"retention",search,"region"),false)
 const missing=structuredClone(r);missing.cohorts[0].counts[1]=null;assert.equal(validBehavior(missing,"retention",search,"region"),true)
 const wrong=structuredClone(r);wrong.cohorts[0].counts[0]=wrong.cohorts[0].size+1;assert.equal(validBehavior(wrong,"retention",search,"region"),false)
})
