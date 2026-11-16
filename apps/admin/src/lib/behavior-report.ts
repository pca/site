import {sampleSessions,type SampleSession} from "./analytics-workspace.ts"
import type {WorkbenchSearch} from "./analytics-navigation.ts"

export const funnelDefinitions={
 region:[{name:"Prompt visible",event:"region_prompt_viewed"},{name:"WCA login started",event:"wca_login_started"},{name:"WCA login completed",event:"wca_login_completed"},{name:"Region submitted",event:"region_request_submitted"}],
 rankings_statistics:[{name:"Rankings viewed",event:"page_view"},{name:"Statistics viewed",event:"page_view"}],
} as const
export type FunnelId=keyof typeof funnelDefinitions
export interface BehaviorReport {
 source:"sample"|"ga4";kind:"journeys"|"retention";device:WorkbenchSearch["device"];funnel:FunnelId|"";days:7|28;start:string;end:string;timeZone:string;fetchedAt:string;cached:boolean;hosts:string[];limited:boolean;
 steps:{name:string;event:string;users:number|null}[];
 cohorts:{start:string;end:string;size:number|null;counts:(number|null)[]}[];
}
const day=(value:string,offset=0)=>new Date(Date.parse(value+"T00:00:00Z")+offset*86400000).toISOString().slice(0,10)
const date=(value:unknown):value is string=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+"T00:00:00Z"))&&day(value)===value
const count=(value:unknown):value is number|null=>value===null||(typeof value==="number"&&Number.isSafeInteger(value)&&value>=0&&value<=1e15)
export function startingWeeks(end:string){const today=day(end,1),weekday=new Date(today+"T00:00:00Z").getUTCDay();return Array.from({length:6},(_,i)=>{const start=day(today,-weekday-7-7*(5-i));return {start,end:day(start,6)}})}
export function validBehavior(value:unknown,kind:BehaviorReport["kind"],search:WorkbenchSearch,funnel:FunnelId):value is BehaviorReport {
 try{
  const r=value as BehaviorReport
  if(!r||r.source!=="ga4"||r.kind!==kind||r.device!==search.device||r.days!==(kind==="retention"?28:search.days)||r.funnel!==(kind==="journeys"?funnel:"")||!date(r.start)||!date(r.end)||r.end<r.start||!Number.isFinite(Date.parse(r.fetchedAt))||typeof r.cached!=="boolean"||typeof r.limited!=="boolean"||r.hosts.length!==2||r.hosts[0]!=="pinoycubers.org"||r.hosts[1]!=="www.pinoycubers.org")return false
  new Intl.DateTimeFormat("en",{timeZone:r.timeZone})
  if(!Array.isArray(r.steps)||!Array.isArray(r.cohorts))return false
  if(kind==="journeys"){
   if(day(r.start,search.days-1)!==r.end||r.cohorts.length||r.steps.length!==funnelDefinitions[funnel].length)return false
   let previous=Infinity
   for(const [i,s]of r.steps.entries()){const d=funnelDefinitions[funnel][i];if(!s||s.name!==d.name||s.event!==d.event||!count(s.users))return false;if(s.users!==null){if(s.users>previous)return false;previous=s.users}}
  }else{
   const windows=startingWeeks(r.end)
   if(r.steps.length||r.cohorts.length!==6||r.start!==windows[0].start)return false
   for(const [i,g]of r.cohorts.entries()){
    if(!g||g.start!==windows[i].start||g.end!==windows[i].end||!count(g.size)||!Array.isArray(g.counts)||g.counts.length!==5)return false
    for(const [week,n]of g.counts.entries()){if(!count(n)||(n!==null&&(g.size===null||n>g.size||day(g.end,week*7)>r.end)))return false}
   }
  }
  return true
 }catch{return false}
}
export function sampleBehavior(kind:BehaviorReport["kind"],search:WorkbenchSearch,funnel:FunnelId="region",sessions:SampleSession[]=sampleSessions):BehaviorReport {
 const result:BehaviorReport={source:"sample",kind,device:search.device,funnel:kind==="journeys"?funnel:"",days:kind==="retention"?28:search.days,start:day("2026-10-18",1-search.days),end:"2026-10-18",timeZone:"Asia/Manila",fetchedAt:"2026-10-19T00:00:00Z",cached:false,hosts:["pinoycubers.org","www.pinoycubers.org"],limited:false,steps:[],cohorts:[]}
 const deviceSessions=sessions.filter(s=>search.device==="all"||s.device===search.device)
 if(kind==="journeys"){
  const chosen=deviceSessions.filter(s=>s.day>=56-search.days)
  result.steps=funnelDefinitions[funnel].map((d,i)=>({...d,users:new Set(chosen.filter(s=>funnel==="region"?s.onboarding.slice(0,i+1).every(Boolean):s.pages[0]==="rankings"&&(i===0||s.pages.includes("statistics"))).map(s=>s.identity)).size}))
 }else{
  const first=new Map<string,number>();for(const s of sessions)first.set(s.identity,Math.min(first.get(s.identity)??Infinity,s.day))
  result.cohorts=startingWeeks(result.end).map(g=>{
   const members=new Set(deviceSessions.filter(s=>{const start=day("2026-08-24",first.get(s.identity)!);return start>=g.start&&start<=g.end}).map(s=>s.identity))
   return {...g,size:members.size,counts:Array.from({length:5},(_,week)=>day(g.end,week*7)>result.end?null:new Set(deviceSessions.filter(s=>{const d=day("2026-08-24",s.day);return members.has(s.identity)&&d>=day(g.start,week*7)&&d<=day(g.end,week*7)}).map(s=>s.identity)).size)}
  });result.start=result.cohorts[0].start
 }
 return result
}
export function behaviorCsv(r:BehaviorReport){
 const safe=(v:unknown)=>'"'+String(v??"Unavailable").replace(/^[\s]*[=+@-]/,"'$&").replaceAll('"','""')+'"'
 const metadata=[r.source==="sample"?"SAMPLE DATA · invented":"GA4 report",r.kind,r.start,r.end,r.timeZone,r.device,r.limited?"Limited upstream data":"Missing cells remain unavailable",r.kind==="journeys"?"Closed user funnel; <=30min between steps; not same-session":"Sunday weeks; firstSessionDate; session-only cookies limit recognition"].map(safe).join(",")
 const rows= r.kind==="journeys"?[["Step","Event","Recognized users"],...r.steps.map(s=>[s.name,s.event,s.users])]:[["First-visit week","Week end","Group size","Week 0","Week 1","Week 2","Week 3","Week 4"],...r.cohorts.map(g=>[g.start,g.end,g.size,...g.counts])]
 return metadata+"\n"+rows.map(row=>row.map(safe).join(",")).join("\n")
}
