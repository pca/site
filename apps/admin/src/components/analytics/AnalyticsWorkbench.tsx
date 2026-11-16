import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { useState, type ReactNode } from "react"

import { api } from "../../lib/api"
import { analysisNotesCsv, designSpecs, isCoreSection, measurementConnectionStatus, metric, parseNotes, percent, reportCsv, workbenchSections, type AnalysisNote, type ReportKind, type ReportingStatus, type WorkbenchReport, type WorkbenchSearch, type WorkbenchSection } from "../../lib/analytics-workbench"
import "../../analytics-workbench.css"
import "../../analytics-design-preview.css"
import "../../analytics-reports.css"
import "../../analytics-v4.css"
import { AnalyticsSectionIcon } from "./AnalyticsSectionIcon"
import { AnalyticsDesignPreview } from "./AnalyticsDesignPreview"
import { Badge, Help, Panel, Stat } from "./WorkbenchUI"
import { ReportGate, useWorkbenchReport as useReport } from "./WorkbenchReportState"
import { ContentReport, FeatureReport, ReportDistribution } from "./SignalReports"
import { acquisitionLabel } from "../../lib/analytics-signals"
import { DailyTrend } from "./DailyTrend"
import { ReleaseImpact } from "./ReleaseImpact"
import { MeasurementProbe } from "./MeasurementProbe"
import { MeasurementStatus } from "./MeasurementStatus"
import { BrowserCollectionGuide } from "./BrowserCollectionGuide"
import { MeasurementSetupGuide } from "./MeasurementSetupGuide"
import { BehaviorReports } from "./BehaviorReports"
import { FeedbackInbox } from "./FeedbackInbox"
import { ExperimentPlanner } from "./ExperimentPlanner"

const path = "/analytics-workbench/$section" as const
const num=(n:number)=>n.toLocaleString("en-US")
function WorkLink({section,search,children}:{section:WorkbenchSection;search:WorkbenchSearch;children:ReactNode}) {return <Link to={path} params={{section}} search={{...search,view:undefined}}>{children}</Link>}

export function AnalyticsWorkbench({section,search,onSearch,userId}:{section:WorkbenchSection;search:WorkbenchSearch;onSearch:(s:WorkbenchSearch)=>void;userId:number}) {
  const navigate=useNavigate()
  const meta=workbenchSections.find(s=>s.id===section)!
  const storageKey=`pca-analytics-notes-v1:${userId}`
  const [notes,setNotes]=useState<AnalysisNote[]>(()=>{try{return parseNotes(localStorage.getItem(storageKey))}catch{return []}})
  const [storageError,setStorageError]=useState("")
  const status=useQuery({queryKey:["analytics-reporting-status"],queryFn:()=>api<ReportingStatus>("analytics/status"),retry:false,staleTime:60_000,refetchOnWindowFocus:false})
  const saveNote=(question:string,evidence:string,action:string)=>{
    if(notes.length>=30){setStorageError("The local log is full (30 notes). No note was replaced. Copy this analysis to a file before leaving.");return false}
    const next=[{id:crypto.randomUUID(),source:search.mode,section,question,evidence,action,createdAt:new Date().toISOString()},...notes].slice(0,30)
    try{localStorage.setItem(storageKey,JSON.stringify(next));setNotes(next);setStorageError("");return true}catch{setStorageError("This browser could not save the note. Copy your text before leaving.");return false}
  }
  const undoNote=(id:string)=>{
    const next=notes.filter(n=>n.id!==id)
    try{localStorage.setItem(storageKey,JSON.stringify(next));setNotes(next);setStorageError("");return true}catch{setStorageError("Could not undo the save. Your saved note is unchanged.");return false}
  }
  return <div className="wb-workspace wb-v4">
    <header className="wb-top"><div><span className="wb-workspace-mark" aria-hidden="true"><AnalyticsSectionIcon section={section}/></span><strong>Analytics</strong><span className="wb-breadcrumb" aria-hidden="true">/</span><span>{meta.group}</span></div><div>{import.meta.env.DEV&&<a href={`/admin/analytics-before/analytics-workbench/${section}?mode=sample&days=${search.days}&device=${search.device}`} target="_blank" rel="noreferrer">Compare before ↗</a>}<Link to="/preview-library">Preview library</Link></div></header>
    <div className="wb-layout">
      <nav className="wb-nav" aria-label="Analytics workspace">
        {["Start","Report","Investigate","Improve","Setup"].map(group=>(
          <div key={group}>
            <span>{group}</span>
            {workbenchSections.filter(item=>item.group===group).map(item=>(
              <Link key={item.id} to={path} params={{section:item.id}} search={{...search,view:undefined}}
                className={section===item.id?"is-active":""}
                aria-current={section===item.id?"page":undefined}>
                <span className="wb-nav-label"><AnalyticsSectionIcon section={item.id}/><span>{item.label}</span></span>
                {item.stage==="Design only"&&<small>Design</small>}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <main className="wb-main">
        <label className="wb-mobile-nav">Analytics section
          <select value={section} onChange={event=>{
            void navigate({to:path,params:{section:event.target.value},search:{...search,view:undefined}})
          }}>
            {["Start","Report","Investigate","Improve","Setup"].map(group=>(
              <optgroup key={group} label={group}>
                {workbenchSections.filter(item=>item.group===group).map(item=>(
                  <option key={item.id} value={item.id}>{item.label}{item.stage==="Design only"?" · Design only":""}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <div className="wb-page-head flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="wb-title-line">
              <h1>{meta.label}</h1>
              {meta.stage==="Design only"?<Badge>Design preview</Badge>:meta.stage==="Guide"?<Badge>Guide</Badge>:<Badge tone="blue">{section==="experiments"?"Planning tool":"Implemented"}</Badge>}
            </div>
            <p>{meta.question}</p>
          </div>
          {section==="acquisition"&&(
            <Link className="btn" to="/campaigns" search={{...search,view:undefined}}>
              Create campaign link
            </Link>
          )}
        </div>
        {meta.stage!=="Design only"&&section!=="measurement"&&section!=="feedback"&&section!=="experiments"&&<div className={`wb-source ${search.mode==="sample"?"is-sample":""}`}><div><strong>{search.mode==="sample"?"Sample data":"GA4 reporting"}</strong><span>{search.mode==="sample"?"Invented numbers. No live findings or tests.":"Read-only reports. No sample fallback."}</span></div><label>Data source<select value={search.mode} onChange={e=>onSearch({...search,mode:e.target.value as WorkbenchSearch["mode"]})}><option value="sample">Sample data</option><option value="ga4">GA4 reporting</option></select></label></div>}
        {["pages","acquisition","features","journeys","retention"].includes(section)&&<div className="wb-filterbar">{section!=="retention"&&<label>Period<select value={search.days} onChange={e=>onSearch({...search,days:Number(e.target.value) as 7|28})}><option value={28}>Last 28 complete days</option><option value={7}>Last 7 complete days</option></select></label>}<label>Device<select value={search.device} onChange={e=>onSearch({...search,device:e.target.value as WorkbenchSearch["device"]})}><option value="all">All devices</option><option value="mobile">Mobile</option><option value="desktop">Desktop</option><option value="tablet">Tablet</option></select></label><span>{search.mode==="sample"?"Fixed sample period ending Oct 18, 2026":"Ends yesterday · GA4 property timezone"}</span></div>}
        <div className="wb-content" key={section}>
          {section==="overview"&&<Overview search={search} notes={notes} status={status.data} />}
          {section==="pages"&&<Pages search={search} status={status.data} statusError={!!status.error} onSearch={onSearch}/>}
          {section==="acquisition"&&<AcquisitionReport search={search} status={status.data} statusError={!!status.error}/>}
          {section==="features"&&<FeatureReport search={search} status={status.data} statusError={!!status.error}/>}
          {section==="measurement"&&<Measurement status={status.data} loading={status.isFetching} error={!!status.error} retry={()=>{void status.refetch()}} search={search} />}
          {section==="releases"&&<ReleaseImpact search={search} onSearch={onSearch} status={status.data} statusError={!!status.error}/>}
          {(section==="journeys"||section==="retention")&&<BehaviorReports kind={section} search={search} status={status.data} statusError={!!status.error}/>}
          {section==="feedback"&&<FeedbackInbox savedMode={search.view==="feedback_saved"} onMode={saved=>onSearch({...search,view:saved?"feedback_saved":undefined})}/>}
          {section==="experiments"&&<ExperimentPlanner savedMode={search.view==="plans_saved"} onMode={saved=>onSearch({...search,view:saved?"plans_saved":undefined})}/>}
          {section in designSpecs&&!isCoreSection(section)&&<AnalyticsDesignPreview section={section as keyof typeof designSpecs} />}
          {["pages","acquisition","features","releases","journeys","retention"].includes(section)&&<Analysis key={`${section}-${search.mode}`} source={search.mode} notes={notes.filter(n=>n.section===section&&n.source===search.mode)} save={saveNote} undo={undoNote} error={storageError} />}
        </div>
        <footer className="wb-footer"><span>{section==="experiments"?"Saved test plans + temporary results worksheet · no experiment delivery":section==="feedback"?"Account-submitted feedback · separate server storage, not GA4":section==="measurement"?"Configuration and explicit report-access checks · browser delivery checked separately":meta.stage==="Design only"?"Design preview · fixed illustrative examples":search.mode==="sample"?"Sample mode · invented data":"GA4 mode · account access not assumed"}</span><Link to="/preview-library">All designs & previews →</Link></footer>
      </main>
    </div>
  </div>
}

function Overview({search,notes,status}:{search:WorkbenchSearch;notes:AnalysisNote[];status?:ReportingStatus}) {
  return <>
    <div className="wb-steps" aria-label="Analysis workflow">{["Ask a question","Verify measurement","Inspect evidence","Record a decision"].map((s,i)=><span key={s}><b>{i+1}</b>{s}</span>)}</div>
    <div className="wb-two"><Panel title="Start with a question" note="One decision at a time, using online evidence."><div className="wb-start-links"><WorkLink section="acquisition" search={search}><strong>Marketing · Which sources bring engaged visits?</strong><span>Sources, campaigns and landing pages →</span></WorkLink><WorkLink section="pages" search={search}><strong>UX · What do visitors view on mobile?</strong><span>Pages, operating systems and browsers →</span></WorkLink></div></Panel><Panel title="Implementation scope"><div className="wb-status-row"><Badge tone="blue">{workbenchSections.filter(s=>isCoreSection(s.id)).length} areas with local code</Badge><span>Overview is a guide, not another analytics feature.</span></div><p className="wb-body">Read-only reports cover pages, audience, content, acquisition, feature signals, fixed journeys, returning groups and descriptive release comparison. Feedback has account-only submissions and a staff inbox. Experiments has saved plans and a results worksheet—not assignment or variant delivery. Live Google verification remains pending.</p><div className="wb-status-row"><Badge tone={status?.state==="ready"?"blue":"gold"}>{status?.state==="ready"?"Configuration present":"GA4 not connected"}</Badge><WorkLink section="measurement" search={search}>Review setup →</WorkLink></div></Panel></div>
    <Panel title="Workspace map" note="Report → investigate → improve. Design-only areas do not collect data or perform actions."><div className="wb-map">{workbenchSections.filter(s=>s.id!=="overview").map(s=><WorkLink key={s.id} section={s.id} search={search}><div><span>{s.group}</span><Badge tone={s.stage==="Core"?"blue":"neutral"}>{s.stage==="Core"?"Coded core":"Design only"}</Badge></div><strong className="wb-card-title"><AnalyticsSectionIcon section={s.id}/><span>{s.label}</span></strong><p>{s.outcome}</p></WorkLink>)}</div></Panel>
    <Panel title="Recent analysis notes" note="Saved on this browser for this staff account, not shared with the team.">{notes.length?<div className="wb-notes">{notes.slice(0,3).map(n=><article key={n.id}><Badge tone={n.source==="sample"?"gold":"blue"}>{n.source==="sample"?"Practice":"GA4 analysis"}</Badge><strong>{n.question}</strong><p>{n.action}</p><WorkLink section={n.section} search={{...search,mode:n.source}}>Open {n.section} →</WorkLink></article>)}</div>:<p className="wb-body">Use Pages or Acquisition to save a question, its evidence and a next action. Practice notes stay separate from GA4 analysis.</p>}</Panel>
  </>
}

function ReportCards({data}:{data:WorkbenchReport}) {
  const row=data.totals.rows?.[0]
  const sessions=metric(row,"sessions",data.totals),engaged=metric(row,"engagedSessions",data.totals)
  return <><div className="wb-report-meta"><span>{data.start} – {data.end} · {data.table.metadata.timeZone} · {data.device}</span><span>{data.source==="sample"?"Invented fixtures":`${data.cached?"Cached":"Fetched"} ${new Date(data.fetchedAt).toLocaleString()} · up to 5 min cache`}</span></div><div className="wb-stats"><Stat label="Sessions" value={num(sessions)} detail="Visits in the selected scope" help="One browser can have several sessions. Overall totals are queried separately; they are not a sum of page or source users."/><Stat label="Engaged-session share" value={percent(engaged,sessions)} detail={`${num(engaged)} / ${num(sessions)} sessions`} help="GA4 engagement criteria, or an invented flag in sample mode. Engagement is not proof of satisfaction or task success."/><Stat label="Active users" value={num(metric(row,"activeUsers",data.totals))} detail={data.source==="sample"?"Invented active browser identities":"GA4 active-user metric"} help="Identification depends on consent, cookies, devices and reporting identity. Do not add row-level users to calculate the total."/><Stat label="Page views" value={num(metric(row,"screenPageViews",data.totals))} detail="Page destinations, not filter changes" help="Page views can exceed sessions. Content views and feature actions are separate events."/></div></>
}
function DataTable({data,label,kind}:{data:WorkbenchReport;label:string;kind:ReportKind}) {
  const [search,setSearch]=useState("")
  const [sort,setSort]=useState("sessions")
  const [selected,setSelected]=useState("")
  const all=data.table.rows??[]
  const rows=all.filter(r=>(r.dimensionValues[0]?.value??"").toLowerCase().includes(search.toLowerCase())).sort((a,b)=>sort==="engagement"?(metric(b,"engagedSessions",data.table)/(metric(b,"sessions",data.table)||1)-metric(a,"engagedSessions",data.table)/(metric(a,"sessions",data.table)||1)):metric(b,sort,data.table)-metric(a,sort,data.table))
  const active=rows.find(r=>r.dimensionValues[0]?.value===selected)
  const exportFile=()=>{
    const url=URL.createObjectURL(new Blob([reportCsv(data,rows)],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=`pca-${data.source}-${kind}.csv`;a.click();URL.revokeObjectURL(url)
  }
  const meta=data.table.metadata,totalsMeta=data.totals.metadata
  return <Panel title={label} note={kind==="pages"?"Actual page paths. Query parameters are not separate pages.":"Session-scoped breakdown. Volume and engagement answer different questions."} help="Row users and page sessions may overlap and are not additive. Rates divide engaged sessions by sessions in the same row. A high rate with few sessions is not a winner." action={<button type="button" onClick={exportFile} disabled={!rows.length}>Export visible rows</button>}>
    <div className="wb-table-tools"><label>Find a row<input value={search} onChange={e=>setSearch(e.target.value)} placeholder={`Search ${label.toLowerCase()}`} /></label><label>Sort by<select value={sort} onChange={e=>setSort(e.target.value)}><option value="sessions">Sessions</option><option value="screenPageViews">Page views</option><option value="engagement">Engaged-session share</option></select></label></div>
    {meta.subjectToThresholding||totalsMeta.subjectToThresholding?<p className="wb-warning">GA4 thresholding applies. Some data may be withheld.</p>:null}{meta.dataLossFromOtherRow||totalsMeta.dataLossFromOtherRow?<p className="wb-warning">GA4 reports high-cardinality data loss. Breakdown rows may be incomplete.</p>:null}{meta.samplingMetadatas?.length||totalsMeta.samplingMetadatas?.length?<p className="wb-warning">GA4 sampling applies. These are not complete event counts.</p>:null}
    {rows.length?<div className="wb-scroll" role="region" aria-label={`${label} table`} tabIndex={0}><table><caption>{data.source==="sample"?"Sample data · ":"GA4 · "}{data.start} – {data.end} · {data.device}</caption><thead><tr><th>{label}</th><th>Sessions</th><th>Engaged sessions</th><th>Engaged share</th><th>Active users</th><th>Page views</th></tr></thead><tbody>{rows.map(row=>{const name=row.dimensionValues[0]?.value??"(not set)",display=kind==="acquisition"?acquisitionLabel(name).title:name,n=metric(row,"sessions",data.table),engaged=metric(row,"engagedSessions",data.table);return <tr key={name} className={selected===name?"is-selected":""}><th scope="row"><button type="button" className="wb-row-link" aria-pressed={selected===name} onClick={()=>setSelected(selected===name?"":name)}>{display} →</button>{display!==name&&<small><code>{name}</code></small>}{n<30&&<small>Small sample · caution only</small>}</th><td>{num(n)}</td><td>{num(engaged)}</td><td>{percent(engaged,n)}</td><td>{num(metric(row,"activeUsers",data.table))}</td><td>{num(metric(row,"screenPageViews",data.table))}</td></tr>})}</tbody></table></div>:<div className="wb-empty">{all.length?"No matching rows. Clear the search.":"No recorded rows in this period and device scope. This is not a connection failure."}</div>}
    <p className="wb-footnote">Showing {rows.length} of {all.length} returned rows{data.table.rowCount>all.length?` · GA4 has ${data.table.rowCount} groups; only the top 200 are fetched`:""}. Search changes rows, not headline totals. Small sample is not a statistical test.</p>
    {active&&<div className="wb-row-detail" role="status"><strong>{active.dimensionValues[0].value}</strong>{kind==="acquisition"&&acquisitionLabel(active.dimensionValues[0].value).detail&&<p>{acquisitionLabel(active.dimensionValues[0].value).detail}</p>}<p>{num(metric(active,"engagedSessions",data.table))} engaged / {num(metric(active,"sessions",data.table))} sessions = {percent(metric(active,"engagedSessions",data.table),metric(active,"sessions",data.table))}.</p><p>{kind==="acquisition"?"Check device and landing-page mix before suggesting why. This selection does not filter the other report.":"Use this as a lead for a question, not proof of task completion."}</p></div>}
  </Panel>
}
function Pages({search,status,statusError,onSearch}:{search:WorkbenchSearch;status?:ReportingStatus;statusError:boolean;onSearch:(search:WorkbenchSearch)=>void}) {
  const view=search.view==="content"||search.view==="audience"?search.view:"pages"
  return <><div className="wb-report-tabs" role="group" aria-label="Pages & audience reports">{[["pages","Pages"],["audience","Audience technology"],["content","Event & region content"]].map(([id,label])=><button type="button" key={id} aria-pressed={view===id} onClick={()=>onSearch({...search,view:id==="pages"?undefined:id as WorkbenchSearch["view"]})}>{label}</button>)}</div>
    {view==="content"?<ContentReport search={search} status={status} statusError={statusError}/>:<PageAudienceReport key={view} kind={view==="audience"?"audience":"pages"} search={search} status={status} statusError={statusError}/>}
  </>
}
function PageAudienceReport({kind,search,status,statusError}:{kind:"pages"|"audience";search:WorkbenchSearch;status?:ReportingStatus;statusError:boolean}) {
  const [breakdown,setBreakdown]=useState("device")
  const report=useReport(kind,kind==="pages"?"":breakdown,search,status,statusError)
  const label=kind==="pages"?"Page path":({device:"Device category",os:"Operating system",browser:"Browser",brand:"Device brand"}[breakdown]??"Technology")
  return <>
    {kind==="audience"&&<div className="wb-inline"><label>Break down by<select value={breakdown} onChange={e=>setBreakdown(e.target.value)}><option value="device">Device category</option><option value="os">Operating system</option><option value="browser">Browser</option><option value="brand">Device brand</option></select></label><p className="wb-footnote">iOS is an operating system; Google may be a device brand or traffic source. These are separate dimensions.</p></div>}
    <ReportGate search={search} status={status} statusError={statusError} pending={report.query.isFetching&&!report.data} error={!!report.query.error} retry={()=>{void report.query.refetch()}} />
    {report.data&&!report.query.error&&<><ReportCards data={report.data}/>{kind==="pages"&&<DailyTrend search={search} status={status} statusError={statusError}/>}<Panel title={kind==="pages"?"Page-view distribution":"Technology mix"} note={kind==="pages"?"Destinations, not filter changes":"Sessions by one technology dimension at a time"}><ReportDistribution data={report.data} metricName={kind==="pages"?"screenPageViews":"sessions"} title={kind==="pages"?"Where page views happen":`${label} share`}/></Panel><DataTable key={`${breakdown}-${search.mode}-${search.days}-${search.device}`} data={report.data} label={label} kind={kind}/></>}
  </>
}
function AcquisitionReport({search,status,statusError}:{search:WorkbenchSearch;status?:ReportingStatus;statusError:boolean}) {
  const [breakdown,setBreakdown]=useState("source")
  const {data,query}=useReport("acquisition",breakdown,search,status,statusError)
  return <><div className="wb-reading-guide"><AnalyticsSectionIcon section="acquisition"/><div><strong>Where did visits come from, and what happened next?</strong><p>Source / medium identifies a visit's origin; campaign identifies a tagged promotion; landing page is its first page. Compare visit counts alongside engagement, not just the highest percentage.</p></div></div><div className="wb-inline"><label>Break down by<select value={breakdown} onChange={e=>setBreakdown(e.target.value)}><option value="source">Source / medium</option><option value="channel">Channel group</option><option value="campaign">Campaign</option><option value="landing">Landing page</option></select></label><div><Badge>Visit acquisition</Badge><Help title="Visit acquisition">Every metric here is session-scoped, using GA4's processed session-source labels in GA4 mode. First-user acquisition and multi-touch attribution are deferred, not mixed into these rates.</Help></div></div>
    <ReportGate search={search} status={status} statusError={statusError} pending={query.isFetching&&!data} error={!!query.error} retry={()=>{void query.refetch()}}/>
    {data&&!query.error&&<><ReportCards data={data}/><Panel title="Acquisition mix" note="Traffic volume and engagement are different questions"><ReportDistribution data={data} label={raw=>acquisitionLabel(raw).title} title={{source:"Sources bringing visits",channel:"Channel share",campaign:"Campaign share",landing:"Landing-page share"}[breakdown]??"Visit sources"}/></Panel><DataTable key={`${breakdown}-${search.mode}-${search.days}-${search.device}`} data={data} label={{source:"Source / medium",channel:"Channel group",campaign:"Campaign",landing:"Landing page"}[breakdown]??"Source"} kind="acquisition"/></>}
    <div className="wb-two"><Panel title="Interpretation"><details><summary>Direct, unknowns and comparisons</summary><p>Direct means no clear source, not necessarily a typed address. An unnamed campaign can be normal organic/referral traffic. Keep unknowns visible. High engagement does not prove a source caused better behavior.</p></details><details><summary>Outcomes and cost metrics</summary><p>Region-submission conversion, cost per acquisition and return on ad spend are deliberately unavailable. They need validated outcome scope and, for cost metrics, connected spend. No numbers are estimated from visits.</p></details></Panel><Panel title="Next investigation"><p className="wb-body">Choose a source, record its counts and check whether a different device or landing-page mix might explain its rate.</p><WorkLink section="pages" search={search}>Inspect pages & audience →</WorkLink><p className="wb-footnote">This link retains period/device, not the selected source. Source-specific cross-filtering is deferred.</p></Panel></div>
  </>
}
function Analysis({source,notes,save,undo,error}:{source:"sample"|"ga4";notes:AnalysisNote[];save:(q:string,e:string,a:string)=>boolean;undo:(id:string)=>boolean;error:string}) {
  const [question,setQuestion]=useState(""),[evidence,setEvidence]=useState(""),[action,setAction]=useState(""),[saved,setSaved]=useState(false)
  const exportNotes=()=>{const url=URL.createObjectURL(new Blob([analysisNotesCsv(notes)],{type:"text/csv;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download=`pca-dev-analysis-${source}.csv`;link.click();URL.revokeObjectURL(url)}
  return <Panel title="Dev Analysis Log" note="Question → evidence → next action. Local browser storage only; no sensitive information." action={<button type="button" disabled={!notes.length} onClick={exportNotes}>Export these notes</button>}><Badge tone={source==="sample"?"gold":"blue"}>{source==="sample"?"Practice note · not a real finding":"GA4 analysis · verify your evidence"}</Badge><form onSubmit={e=>{e.preventDefault();if(save(question.trim(),evidence.trim(),action.trim())){setQuestion("");setEvidence("");setAction("");setSaved(true)}}}><div className="wb-form-grid"><label>Question<input required maxLength={500} value={question} onChange={e=>{setSaved(false);setQuestion(e.target.value)}} placeholder="What decision am I trying to make?"/></label><label>Evidence<textarea required maxLength={2000} value={evidence} onChange={e=>setEvidence(e.target.value)} placeholder="Dates, source, device, counts, denominator and limitations" rows={3}/></label><label>Next action<textarea required maxLength={1000} value={action} onChange={e=>setAction(e.target.value)} placeholder="What will I investigate or change, and when will I review it?" rows={3}/></label></div><button type="submit" disabled={!question.trim()||!evidence.trim()||!action.trim()}>Save on this browser</button>{saved&&<div role="status" className="wb-footnote">Note saved locally. It is not shared or backed up to the server. {notes[0]&&<button type="button" onClick={()=>{const n=notes[0];if(undo(n.id)){setQuestion(n.question);setEvidence(n.evidence);setAction(n.action);setSaved(false)}}}>Undo last save</button>}</div>}{error&&<p role="alert" className="wb-warning">{error}</p>}</form>{notes.length>0&&<details><summary>{notes.length} saved {source==="sample"?"practice":"GA4"} notes</summary><div className="wb-notes">{notes.map(n=><article key={n.id}><small>{new Date(n.createdAt).toLocaleString()}</small><strong>{n.question}</strong><p>{n.evidence}</p><p><b>Next:</b> {n.action}</p></article>)}</div></details>}</Panel>
}
function Measurement({status,loading,error,retry,search}:{status?:ReportingStatus;loading:boolean;error:boolean;retry:()=>void;search:WorkbenchSearch}) {
  const connection=measurementConnectionStatus(status,loading,error)
  return <><Panel title="1. Connect reporting" note="Read GA4 reports in this dashboard. This does not enable website tracking." action={<button type="button" onClick={retry} disabled={loading}>Check server setup</button>}>
    <div className="wb-connection-state" role="status">
      <MeasurementStatus tone={connection.tone}>{connection.label}</MeasurementStatus>
      <p>{error?"The reporting endpoint is unavailable. Check that the local API is running; this check does not contact Google.":loading?"Checking the local reporting configuration, not Google access.":status?.message??"Check server setup to see whether the reporting configuration is present."}</p>
    </div>
    <MeasurementSetupGuide/>
    <dl className="wb-definitions wb-measurement-definitions">
      <dt>Read scope</dt>
      <dd>
        <MeasurementStatus tone="success">Read-only requests</MeasurementStatus>
        <p>Reads summary reports without changing your GA4 settings.</p>
        <code>analytics.readonly</code>
      </dd>
      <dt>Host filter</dt>
      <dd>
        <MeasurementStatus tone="success">Main-site filter defined</MeasurementStatus>
        <div className="wb-domain-list"><code>pinoycubers.org</code><code>www.pinoycubers.org</code></div>
        <p>Only these two hostnames are included in report requests.</p>
      </dd>
      <dt>Freshness</dt>
      <dd>
        <MeasurementStatus tone="warning">Not real-time</MeasurementStatus>
        <ul><li>Complete days through yesterday.</li><li>Dates use the GA4 property's timezone.</li><li>Fetched reports are cached for 5 minutes.</li></ul>
      </dd>
      <dt>Not included</dt>
      <dd>
        <MeasurementStatus tone="neutral">Outside this reporting connection</MeasurementStatus>
        <ul><li>Beta and local-development traffic.</li><li>Advertising spend.</li><li>Running A/B tests or storing feedback.</li></ul>
      </dd>
    </dl>
    <p className="wb-footnote">Checks above describe rules defined in the code, not a successful live connection.</p>
    <MeasurementProbe key={`${status?.state}-${loading}-${error}`} configured={status?.state==="ready"&&!loading&&!error}/>
    </Panel>
    <Panel title="3. Verify browser collection" note="Check what the website sends—not just whether reports can be read."><BrowserCollectionGuide/><details><summary>Production enable switch and server credentials</summary><p>Public collection defaults to off, even with the G-code. After privacy and overlapping-tag review, set <code>VITE_ANALYTICS_ENABLED=1</code> in the Netlify build environment and rebuild. Docker public builds use <code>ANALYTICS_ENABLED=1</code>.</p><p>Reporting is separate. The optional <code>docker-compose.analytics.yml</code> mounts a protected service-account file read-only for the API. Neither switch creates credentials or grants property access.</p><p>Do not enable collection until any required consent gate is in place. DNT/GPC and the opt-out preference are not a consent-management system.</p></details></Panel>
    <div className="wb-two"><Panel title="Before collecting real evidence"><ol className="wb-checklist"><li>Confirm the property belongs to the main site, not Arena.</li><li>Review consent needs and the privacy notice. Do Not Track / GPC are not a full consent system.</li><li>Disable overlapping enhanced measurement for this curated collection pass.</li><li>Verify page, content and campaign behavior in local debug mode, then on an authorized production release.</li><li>Register only necessary custom dimensions for content and feature reports.</li></ol></Panel><Panel title="Definitions & limits"><details><summary>Content views versus page views</summary><p>A content view records successfully rendered event/region selections, including the initial direct-linked state. Page views describe destinations. Counts can repeat and neither proves task success.</p></details><details><summary>Session scope and identity</summary><p>Acquisition is visit-scoped. Active users are not additive across rows. First-user reports and retention need separate definitions; session-only cookies currently limit durable retention.</p></details><details><summary>Measurement health</summary><p>Setup state, fetch errors, GA4 thresholding/sampling and row limits are reported. Automated tracking audits or alerts are not implemented. A successful API call does not prove instrumentation is correct.</p></details><WorkLink section="pages" search={search}>Open coded reports →</WorkLink></Panel></div>
  </>
}
