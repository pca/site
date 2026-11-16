import {test} from "node:test"
import assert from "node:assert/strict"
import {defaultExperiment,exampleExperiment,validExperimentDefinition,validExperimentPlan,experimentSampleSize,descriptiveExperiment,experimentPlanMarkdown} from "../apps/admin/src/lib/experiment-plan.ts"
import {validFeedbackRecord,feedbackSnapshotText} from "../packages/shared/src/feedback.ts"
test("experiment plans validate readiness without pretending ready means running",()=>{
 assert.equal(validExperimentDefinition(defaultExperiment),true)
 assert.equal(validExperimentDefinition({...defaultExperiment,status:"ready"}),false)
 assert.equal(validExperimentDefinition({...exampleExperiment,status:"ready"}),true)
 for(const d of [{...defaultExperiment,baseline:NaN},{...defaultExperiment,change:Infinity},{...defaultExperiment,baseline:90,change:20},{...defaultExperiment,status:"running"},{...defaultExperiment,traffic:0},{...defaultExperiment,minimumDays:1}])assert.equal(validExperimentDefinition(d),false)
 const p={id:"0".repeat(32),definition:exampleExperiment,revision:1,authorId:1,updatedBy:1,createdAt:"2026-10-25T00:00:00Z",updatedAt:"2026-10-25T00:00:00Z"}
 assert.equal(validExperimentPlan(p),true);assert.equal(validExperimentPlan({...p,revision:0}),false)
 const markdown=experimentPlanMarkdown(exampleExperiment)
 assert.match(markdown,/not running/);assert.match(markdown,/No visitor assignment/)
 assert.ok(markdown.split("\n").length>20);assert.equal(markdown.includes("\\n"),false)
})
test("sample-size estimates increase for smaller effects and lower eligible traffic",()=>{
 const a=experimentSampleSize(defaultExperiment),smaller=experimentSampleSize({...defaultExperiment,change:2}),slower=experimentSampleSize({...defaultExperiment,traffic:5})
 assert.ok(a.perArm>1000&&a.perArm<1200)
 assert.equal(a.total,2*a.perArm);assert.ok(smaller.perArm>a.perArm);assert.ok(slower.days>a.days)
 assert.equal(experimentSampleSize({...defaultExperiment,change:NaN}),null)
 assert.ok(experimentSampleSize({...defaultExperiment,traffic:100000,minimumDays:28}).days>=28)
})
test("aggregate worksheet rejects impossible counts and hides weak normal approximations",()=>{
 for(const args of [[0,0,10,1],[10,11,10,1],[100,1.5,100,4],[100,NaN,100,4],[-1,0,100,1]])assert.equal(descriptiveExperiment(...args),null)
 const zero=descriptiveExperiment(100,0,100,10);assert.equal(zero.relative,null);assert.equal(zero.interval,null)
 const r=descriptiveExperiment(1000,200,1000,250);assert.ok(Math.abs(r.difference-.05)<1e-10);assert.ok(r.interval[0]<r.difference&&r.interval[1]>r.difference)
 assert.equal(descriptiveExperiment(100,4,100,6).interval,null)
})
test("feedback records cannot pass malformed categories, context or review revisions to the UI",()=>{
 const f={id:"1".repeat(32),userId:1,originalType:"data_issue",type:"ux_feedback",status:"new",title:"Example",task:"Task",observed:"Observed",expected:"Expected",context:{page:"rankings",event:"333",region:"NCR",format:"average",view:"",snapshot:""},note:"",revision:1,createdAt:"2026-10-25T00:00:00Z",updatedAt:"2026-10-25T00:00:00Z"}
 assert.equal(validFeedbackRecord(f),true)
 for(const value of [null,{}, {...f,type:"toString"},{...f,context:null},{...f,revision:-1},{...f,expected:[]},{...f,context:{...f.context,page:"admin"}}])assert.equal(validFeedbackRecord(value),false)
})
test("ranking feedback fingerprints freeze selected public content and omit display names",()=>{
 const context={page:"rankings",event:"333",region:"NCR",format:"average",view:"",snapshot:""},row={wca_id:"2026QA01",person_name:"Not included",region:"NCR",value:"10.20",competition:{id:"QA2026",name:"Not included"},event:{id:"333",name:"Not included"},solves:{value2:"10",value1:"11"}}
 const text=feedbackSnapshotText(context,[row]);assert.equal(text.includes("Not included"),false)
 assert.equal(feedbackSnapshotText(context,[{...row,solves:{value1:"11",value2:"10"}}]),text)
 assert.notEqual(feedbackSnapshotText({...context,region:"PH"},[row]),text)
 assert.notEqual(feedbackSnapshotText(context,[{...row,value:"9.00"}]),text)
})
