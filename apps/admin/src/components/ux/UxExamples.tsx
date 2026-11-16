import { Link } from "@tanstack/react-router"
import { useState, type ReactNode } from "react"

import { number, percent, rate } from "../../lib/ux-preview"
import {
  accessibilityExamples, cohortCells, exampleViews, feedbackExamples, median, peopleFor,
  qualityExamples, studyAttempts, studyTasks,
  type ExampleView, type ExperienceFilter, type FeedbackStatus,
} from "../../lib/ux-examples"
import { Metric, Panel } from "./UxAnalytics"
import "../../ux-examples.css"

function ExampleShell({ view, children }: { view?: ExampleView; children: ReactNode }) {
  const current = exampleViews.find(item => item.id === view)
  return <div className="ux-page uxe-page">
    <div className="uxe-heading">
      <div><Link to="/ux-examples" className="ux-eyebrow">UX EXAMPLES</Link><h1>{current?.title ?? "Product analytics & UX research"}</h1><p>{current?.description ?? "Explore five ways to turn behavior and research into a useful next question."}</p></div>
      <span className="uxe-sample-badge">Sample data</span>
    </div>
    <div className="uxe-disclosure"><strong>Illustrative examples</strong><span>All numbers, responses, and observations are invented. No visitors were tracked or participants studied.</span></div>
    {current && <nav className="uxe-navigation" aria-label="UX examples">
      <Link to="/ux-examples">All examples</Link>
      {exampleViews.map(item => <Link key={item.id} to="/ux-examples/$view" params={{ view: item.id }} className={view === item.id ? "is-active" : ""} aria-current={view === item.id ? "page" : undefined}>{item.title}</Link>)}
    </nav>}
    {children}
  </div>
}

export function ExamplesHome() {
  return <ExampleShell>
    <div className="uxe-example-grid">{exampleViews.map((item, index) => <Link key={item.id} to="/ux-examples/$view" params={{ view: item.id }} className="uxe-example-card">
      <div><span className="uxe-example-icon" aria-hidden="true">{item.icon}</span><span className="ux-eyebrow">EXAMPLE 0{index + 1}</span></div>
      <h2>{item.title}</h2><p>{item.description}</p><strong>{item.question}</strong><span className="uxe-card-link">Explore example <span aria-hidden="true">→</span></span>
    </Link>)}<div className="uxe-example-card uxe-context-card"><span className="ux-eyebrow">USE THESE TO PRACTICE</span><h2>Observation → question → test</h2><p>Choose a metric, inspect its denominator, and pair the pattern with a research question before proposing a change.</p><Link to="/experiments" className="uxe-card-link">Review experiment concepts →</Link></div></div>
    <Panel title="Different questions need different evidence" description="GA4 is one part of the measurement plan."><div className="ux-table-scroll"><table className="table"><thead><tr><th>Example</th><th>Evidence needed for a real version</th><th>What it cannot establish alone</th></tr></thead><tbody>{exampleViews.map(item => <tr key={item.id}><th scope="row">{item.title}</th><td>{item.source}</td><td>{({ audience: "A person's intentions", retention: "Why people return", usability: "Population-wide prevalence", feedback: "What every visitor thinks", quality: "Complete accessibility conformance" })[item.id]}</td></tr>)}</tbody></table></div></Panel>
  </ExampleShell>
}

export function ExamplePage({ view }: { view: string }) {
  if (!exampleViews.some(item => item.id === view)) return <ExampleShell><Panel title="Example not found"><p className="ux-footnote">Choose an available example from the gallery.</p><Link to="/ux-examples" className="ux-text-link">Back to all examples →</Link></Panel></ExampleShell>
  return <ExampleShell view={view as ExampleView}>
    {view === "audience" && <Audience />}
    {view === "retention" && <Retention />}
    {view === "usability" && <Usability />}
    {view === "feedback" && <Feedback />}
    {view === "quality" && <Quality />}
  </ExampleShell>
}

function ResearchNote({ title, children, source }: { title: string; children: ReactNode; source: string }) {
  return <aside className="uxe-research-note"><div><span className="ux-eyebrow">NEXT RESEARCH QUESTION</span><h2>{title}</h2><p>{children}</p></div><div><span className="ux-eyebrow">LIVE DATA WOULD REQUIRE</span><p>{source}</p></div></aside>
}

function ExperienceSelect({ value, onChange }: { value: ExperienceFilter; onChange: (value: ExperienceFilter) => void }) {
  return <label className="uxe-control"><span>Experience segment</span><select className="input" value={value} onChange={event => onChange(event.target.value as ExperienceFilter)}><option value="all">All sample visitors</option><option value="newcomer">Newcomers</option><option value="regular">Regular competitors</option></select></label>
}

function Audience() {
  const [experience, setExperience] = useState<ExperienceFilter>("all")
  const people = peopleFor(experience)
  const sessions = people.reduce((sum, person) => sum + person.sessions, 0)
  const mobile = people.filter(person => person.device === "mobile").length
  const channels = ["Organic search", "Direct", "Social", "Referral"].map(channel => ({ channel, count: people.filter(person => person.channel === channel).length }))
  return <>
    <div className="uxe-filter-bar"><p>Sample acquisition cohorts: Aug 24–Oct 18, 2026</p><ExperienceSelect value={experience} onChange={setExperience} /></div>
    <div className="ux-metric-grid ux-three">
      <Metric label="Sample visitor identities" value={number(people.length)} note="Browser identities in this segment" definition="Distinct synthetic identities, not verified unique people. Shared browsers, cleared cookies, and multiple devices complicate real identity counts." />
      <Metric label="Sessions per identity" value={(sessions / people.length).toFixed(1)} note={`${number(sessions)} visits / ${number(people.length)} identities`} definition="Total visits divided by identities in the selected sample. More visits do not necessarily indicate a better experience." />
      <Metric label="Mobile share" value={rate(mobile, people.length)} note={`${number(mobile)} mobile identities`} definition="Sample identities assigned to mobile divided by identities in the segment. Real devices are normally session- or event-scoped." accent />
    </div>
    <div className="ux-two-columns">
      <Panel title="Device mix" description="Share of identities in the selected sample">
        <div className="uxe-device-bar" role="img" aria-label={`${rate(mobile, people.length)} mobile; ${rate(people.length - mobile, people.length)} desktop`}><span style={{ width: `${percent(mobile, people.length)}%` }} /><span style={{ width: `${percent(people.length - mobile, people.length)}%` }} /></div>
        <div className="uxe-device-legend"><div><i /><strong>Mobile</strong><span>{number(mobile)} · {rate(mobile, people.length)}</span></div><div><i /><strong>Desktop</strong><span>{number(people.length - mobile)} · {rate(people.length - mobile, people.length)}</span></div></div>
        <p className="ux-footnote">The sample assigns one device per identity. It does not model cross-device journeys.</p>
      </Panel>
      <Panel title="First acquisition channel" description="Identity-level source, rather than session acquisition">
        <div className="ux-source-list">{channels.map(channel => <div key={channel.channel}><div><span>{channel.channel}</span><strong>{rate(channel.count, people.length)}</strong></div><div className="ux-track"><span style={{ width: `${percent(channel.count, people.length)}%` }} /></div><small>{number(channel.count)} identities</small></div>)}</div><p className="ux-footnote">Do not compare this directly with session-source shares without aligning the scope.</p>
      </Panel>
    </div>
    <Panel title="Experience segments" description="Invented research labels, not classifications inferred from WCA results."><div className="ux-table-scroll"><table className="table"><thead><tr><th>Segment</th><th>Identities</th><th>Sessions</th><th>Sessions per identity</th><th>Useful research focus</th></tr></thead><tbody>{(["newcomer", "regular"] as const).map(segment => {
      const group = people.filter(person => person.experience === segment)
      const count = group.reduce((sum, person) => sum + person.sessions, 0)
      return <tr key={segment}><th scope="row">{segment === "newcomer" ? "Newcomers" : "Regular competitors"}</th><td>{number(group.length)}</td><td>{number(count)}</td><td>{group.length ? (count / group.length).toFixed(1) : "—"}</td><td>{segment === "newcomer" ? "Terminology and first-use expectations" : "Speed and repeat-use workflows"}</td></tr>
    })}</tbody></table></div></Panel>
    <ResearchNote title="Do newcomers understand the same words as regular competitors?" source="A GA4 reporting connection for device/channel metrics; an optional research question or declared segment for experience level.">Compare how both groups explain “average,” “home region,” and “baseline.” A segment difference suggests a question; it does not identify the cause.</ResearchNote>
  </>
}

function Retention() {
  const [experience, setExperience] = useState<ExperienceFilter>("all")
  const [mode, setMode] = useState("percent")
  const [selected, setSelected] = useState({ cohort: 0, week: 1 })
  const people = peopleFor(experience)
  const cohorts = cohortCells(people)
  const retained = (week: number) => {
    const mature = cohorts.filter(cohort => cohort.values[week] !== null)
    return { active: mature.reduce((sum, cohort) => sum + (cohort.values[week] ?? 0), 0), eligible: mature.reduce((sum, cohort) => sum + cohort.size, 0) }
  }
  const week1 = retained(1)
  const week4 = retained(4)
  const selectedCohort = cohorts[selected.cohort]
  const active = selectedCohort.values[selected.week] ?? 0
  return <>
    <div className="uxe-filter-bar"><p>Weekly cohorts · completed weeks through Oct 18, 2026</p><ExperienceSelect value={experience} onChange={setExperience} /></div>
    <div className="ux-metric-grid ux-three"><Metric label="Cohort identities" value={number(people.length)} note="First activity in one of eight weeks" definition="Each synthetic identity belongs to the week of first activity. Week 0 contains all members of that cohort." /><Metric label="Week 1 retention" value={rate(week1.active, week1.eligible)} note={`${number(week1.active)} / ${number(week1.eligible)} eligible identities`} definition="Identities active in calendar week 1 divided by identities whose week 1 has fully elapsed. This is exact-week retention, not rolling retention." accent /><Metric label="Week 4 retention" value={rate(week4.active, week4.eligible)} note={`${number(week4.active)} / ${number(week4.eligible)} eligible identities`} definition="Identities active in calendar week 4 divided by identities in cohorts with a completed week 4. Newer cohorts are excluded, not counted as zero." /></div>
    <Panel title="Weekly retention cohorts" description="Choose a cell to inspect the denominator. Week buckets begin Monday, Asia/Manila." help={<>
      <h3>How to read this table</h3>
      <p>Retention asks: of the visitors who first arrived together, how many came back in a later week? A <strong>cohort</strong> is that original group. Here, visitors are represented by sample browser identities, not verified individual people.</p>
      <dl>
        <div><dt>Read across a row</dt><dd>The date is the Monday of the group’s first-visit week. <strong>Size</strong> is the number of identities in that original group.</dd></div>
        <div><dt>Follow the week columns</dt><dd><strong>Week 0</strong> is the first-visit week, so it is 100%. <strong>Week 1</strong> is the following Monday–Sunday, Week 2 the week after that. These are calendar weeks in Asia/Manila, not seven-day windows measured from each person’s first visit.</dd></div>
        <div><dt>Read a cell</dt><dd>The percentage is original group members who visited at least once in that particular week, divided by the original group size. Multiple visits by one identity count once. Darker cells mean a higher percentage; “Show identities” displays the counts instead.</dd></div>
        <div><dt>Understand the dashes</dt><dd>A dash means that week has not fully elapsed in this sample. It is not 0%. A visitor can also skip one week and return in a later week.</dd></div>
      </dl>
      <p className="ux-panel-help-example"><strong>Example:</strong> in the {cohorts[0].week} row, {cohorts[0].values[1]} of {cohorts[0].size} identities returned during Week 1: <strong>{rate(cohorts[0].values[1] ?? 0, cohorts[0].size)}</strong>. Select any cell to inspect its calculation.</p>
      <p>A return visit shows activity, not necessarily satisfaction. All values here are invented for this preview.</p>
    </>} action={<label className="uxe-control"><span className="sr-only">Cohort display</span><select className="input" value={mode} onChange={event => setMode(event.target.value)}><option value="percent">Show percentages</option><option value="count">Show identities</option></select></label>}>
      <div className="ux-table-scroll"><table className="uxe-cohort-table"><caption className="sr-only">Synthetic exact-week retention. Dashes mean a week has not fully elapsed.</caption><thead><tr><th scope="col">First activity</th><th scope="col">Size</th>{Array.from({ length: 8 }, (_, week) => <th scope="col" key={week}>Week {week}</th>)}</tr></thead><tbody>{cohorts.map((cohort, cohortIndex) => <tr key={cohort.week}><th scope="row">{cohort.week}</th><td>{cohort.size}</td>{cohort.values.map((count, week) => <td key={week}>{count === null ? <span className="uxe-unobserved" title="Week not fully elapsed">—</span> : <button type="button" className="uxe-cohort-cell" style={{ backgroundColor: `rgba(10,76,132,${.04 + percent(count, cohort.size) / 100 * .75})`, color: percent(count, cohort.size) > 48 ? "white" : "#29465d" }} aria-label={`${cohort.week}, week ${week}: ${count} of ${cohort.size} identities, ${rate(count, cohort.size)}`} aria-pressed={selected.cohort === cohortIndex && selected.week === week} onClick={() => setSelected({ cohort: cohortIndex, week })}>{mode === "percent" ? rate(count, cohort.size) : count}</button>}</td>)}</tr>)}</tbody></table></div>
      <div className="uxe-cohort-inspect" aria-live="polite"><strong>{selectedCohort.week} cohort · Week {selected.week}</strong><p>{active} active identities / {selectedCohort.size} original identities = {rate(active, selectedCohort.size)}</p><span>Measured only in this week. An identity can miss a week and return in a later week.</span></div>
      <p className="ux-footnote">“Active” means at least one visit in a week in this sample. It is not a measure of satisfaction. Unobserved cells are excluded from aggregate denominators.</p>
    </Panel>
    <ResearchNote title="Is there a useful reason to return between competitions?" source="Reliable first-activity and returning-activity timestamps with stable identity, cohort definitions, and timezone rules. This is separate from returning-session share.">Try comparing a visitor’s return after a new result is published with their return during quiet weeks. Competition calendars can explain patterns that a product change did not cause.</ResearchNote>
  </>
}

function Usability() {
  const [taskId, setTaskId] = useState<string>(studyTasks[0].id)
  const [status, setStatus] = useState("all")
  const [participant, setParticipant] = useState("P01")
  const task = studyTasks.find(item => item.id === taskId) ?? studyTasks[0]
  const attempts = studyAttempts.filter(attempt => attempt.task === task.id)
  const visible = attempts.filter(attempt => status === "all" || attempt.status === status)
  const independent = attempts.filter(attempt => attempt.status === "independent")
  const duration = median(independent.map(attempt => attempt.seconds))
  const ease = attempts.reduce((sum, attempt) => sum + attempt.ease, 0) / attempts.length
  const inspected = visible.find(attempt => attempt.participant === participant) ?? visible[0]
  const statusName = (value: string) => value === "independent" ? "Independent" : value === "assisted" ? "With a hint" : "Incomplete"
  return <>
    <div className="uxe-filter-bar"><p>Sample moderated study · eight invented participants per task</p><label className="uxe-control"><span>Study task</span><select className="input" value={taskId} onChange={event => { setTaskId(event.target.value); setStatus("all") }}>{studyTasks.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
    <div className="ux-metric-grid ux-three"><Metric label="Independent completion" value={rate(independent.length, attempts.length)} note={`${independent.length} of ${attempts.length} attempts, without hints`} definition="Participants completing the predefined task without moderator assistance divided by all task attempts. With-hint completion is reported separately." accent /><Metric label="Median successful task time" value={duration === null ? "—" : `${duration} s`} note={`${independent.length} independently completed attempts only`} definition="Median elapsed time among independently completed attempts. Excluding incomplete attempts can make time look better; read it alongside completion." /><Metric label="Reported ease" value={`${ease.toFixed(1)} / 7`} note={`${attempts.length} post-task ratings`} definition="Mean answer to a 1–7 ease question, where 1 is very difficult and 7 very easy. This is not a System Usability Scale score or a population estimate." /></div>
    <div className="uxe-task-prompt"><span className="ux-eyebrow">TASK PROMPT</span><p>“{task.prompt}”</p></div>
    <div className="ux-two-columns"><Panel title="Task observations" description="Table filtering does not change the study-level metrics above." action={<label className="uxe-control"><span className="sr-only">Attempt outcome</span><select className="input" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All outcomes</option><option value="independent">Independent</option><option value="assisted">With a hint</option><option value="incomplete">Incomplete</option></select></label>}>
      <div className="ux-table-scroll"><table className="table"><thead><tr><th>Participant</th><th>Device</th><th>Outcome</th><th>Elapsed</th><th>Ease</th></tr></thead><tbody>{visible.map(attempt => <tr key={attempt.participant}><th scope="row"><button type="button" className="ux-text-button" aria-pressed={participant === attempt.participant} onClick={() => setParticipant(attempt.participant)}>{attempt.participant} ↗</button></th><td>{attempt.device}</td><td><span className={`uxe-outcome uxe-outcome-${attempt.status}`}>{statusName(attempt.status)}</span></td><td>{attempt.seconds} s</td><td>{attempt.ease}/7</td></tr>)}</tbody></table></div>
    </Panel><Panel title={`Observation · ${inspected.participant}`} description="Invented research notes for demonstrating the workflow."><div className="uxe-observation" aria-live="polite"><span className="ux-eyebrow">OBSERVED BEHAVIOR</span><p>{inspected.observation}</p><span className="ux-eyebrow">INTERPRETATION TO INVESTIGATE</span><p>{task.finding}</p><span className="ux-eyebrow">POSSIBLE NEXT TEST</span><p>{task.recommendation}</p></div></Panel></div>
    <ResearchNote title="What happened before the participant needed a hint?" source="Consented research sessions, a consistent task script, a clear success definition, and observation notes. These measurements do not come from GA4.">Keep observations separate from explanations. Eight example attempts illustrate a method; they do not establish how common a problem is across all visitors.</ResearchNote>
  </>
}

function Feedback() {
  const [topic, setTopic] = useState("all")
  const [query, setQuery] = useState("")
  const [statuses, setStatuses] = useState<Record<string, FeedbackStatus>>({})
  const [selected, setSelected] = useState<string>(feedbackExamples[0].id)
  const topics = [...new Set(feedbackExamples.map(response => response.topic))]
  const visible = feedbackExamples.filter(response => (topic === "all" || response.topic === topic) && `${response.text} ${response.feature} ${response.topic}`.toLowerCase().includes(query.toLowerCase().trim()))
  const inspected = visible.find(response => response.id === selected) ?? visible[0]
  const average = visible.length ? visible.reduce((sum, response) => sum + response.rating, 0) / visible.length : null
  const reviewing = visible.filter(response => statuses[response.id] === "Reviewing").length
  const reviewed = visible.filter(response => statuses[response.id] === "Reviewed").length
  return <>
    <div className="uxe-filter-bar"><p>Sample question: “How useful was this page?” · 1–5 scale</p><div className="uxe-filter-controls"><label className="uxe-control"><span>Theme</span><select className="input" value={topic} onChange={event => setTopic(event.target.value)}><option value="all">All themes</option>{topics.map(item => <option key={item}>{item}</option>)}</select></label><label className="uxe-control"><span>Search responses</span><input className="input" type="search" placeholder="Search text or feature…" value={query} onChange={event => setQuery(event.target.value)} /></label></div></div>
    <div className="ux-metric-grid ux-three"><Metric label="Matching responses" value={String(visible.length)} note={`${feedbackExamples.length} total invented responses`} definition="Count of responses matching the current theme and search. Respondents are self-selected; this is not all visitors." /><Metric label="Mean usefulness rating" value={average === null ? "—" : `${average.toFixed(1)} / 5`} note="Among matching responses" definition="Mean answer to the usefulness question, from 1 not useful to 5 very useful. This is not NPS and does not imply an overall satisfaction score." /><Metric label="Reviewed responses" value={String(reviewed)} note={`${reviewing} reviewing · browser preview only`} definition="Matching responses marked Reviewed in this page's local state. Changes are not saved to a server and reset when this page is reopened." accent /></div>
    <div className="ux-two-columns"><Panel title="Feedback inbox" description={`${visible.length} matching examples · select a response to inspect it`}><div className="uxe-feedback-list">{visible.length ? visible.map(response => <button type="button" key={response.id} className={inspected?.id === response.id ? "is-selected" : ""} aria-pressed={inspected?.id === response.id} onClick={() => setSelected(response.id)}><div><span>{response.feature}</span><span>{response.rating}/5 · {statuses[response.id] ?? "New"}</span></div><p>{response.text}</p><small>{response.topic} · {response.device} · {response.date}</small></button>) : <div className="uxe-empty"><h3>No matching sample responses</h3><p>Try another theme or a shorter search.</p><button type="button" className="btn" onClick={() => { setTopic("all"); setQuery("") }}>Clear filters</button></div>}</div></Panel>
      <Panel title={inspected ? `Response ${inspected.id}` : "Response details"} description="Triage changes are temporary and apply only to this preview.">{inspected ? <div className="uxe-response-detail" aria-live="polite"><span className="ux-pill">{inspected.topic}</span><blockquote>“{inspected.text}”</blockquote><dl><div><dt>Feature</dt><dd>{inspected.feature}</dd></div><div><dt>Usefulness</dt><dd>{inspected.rating} / 5</dd></div></dl><label className="uxe-control"><span>Review status for {inspected.id}</span><select className="input" value={statuses[inspected.id] ?? "New"} onChange={event => setStatuses(previous => ({ ...previous, [inspected.id]: event.target.value as FeedbackStatus }))}>{(["New", "Reviewing", "Reviewed"] as const).map(status => <option key={status}>{status}</option>)}</select></label><p>Practice grouping this comment with related observations before deciding on a change.</p></div> : <p className="ux-footnote">Choose a different filter to inspect a response.</p>}</Panel></div>
    <ResearchNote title="Are these comments a recurring pattern or a few individual preferences?" source="A survey or feedback form and a store for responses and review status. Text feedback and research notes should not be sent to GA4 as event properties.">Use themes to organize what to investigate. Pair comments with task observations and behavioral evidence; a small self-selected survey cannot represent every visitor.</ResearchNote>
  </>
}

function Quality() {
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile")
  const [selected, setSelected] = useState(0)
  const pages = qualityExamples.map(page => ({ page: page.page, ...page[device] }))
  const requests = pages.reduce((sum, page) => sum + page.requests, 0)
  const failures = pages.reduce((sum, page) => sum + page.failures, 0)
  const worst = { lcp: Math.max(...pages.map(page => page.lcp)), inp: Math.max(...pages.map(page => page.inp)), cls: Math.max(...pages.map(page => page.cls)) }
  return <>
    <div className="uxe-filter-bar"><p>Sample measurements · no performance scan or accessibility audit was run</p><label className="uxe-control"><span>Device sample</span><select className="input" value={device} onChange={event => setDevice(event.target.value as "mobile" | "desktop")}><option value="mobile">Mobile</option><option value="desktop">Desktop</option></select></label></div>
    <div className="ux-metric-grid"><Metric label="Slowest page LCP p75" value={`${worst.lcp.toFixed(1)} s`} note="Largest page-level value in the sample" definition="LCP describes when the largest content element appears. The card shows the maximum of the sample pages' 75th percentiles, not a combined site-wide percentile." /><Metric label="Slowest page INP p75" value={`${worst.inp} ms`} note="Largest page-level value in the sample" definition="INP measures responsiveness to interactions. These page-level percentiles are invented; they are not a live field measurement." /><Metric label="Largest page CLS p75" value={worst.cls.toFixed(2)} note="Layout shift score · unitless" definition="CLS describes unexpected visual movement. This is the maximum page-level sample percentile, not an average of percentiles." /><Metric label="Failed request share" value={rate(failures, requests)} note={`${failures} failures / ${number(requests)} requests`} definition="Failed sample API requests divided by all sample API requests. Requests are not people or sessions, and a failed request does not necessarily block a task." accent /></div>
    <Panel title="Page performance review" description="Illustrative page-level p75 measurements; no site-wide percentile is calculated."><div className="ux-table-scroll"><table className="table"><thead><tr><th>Page</th><th>LCP</th><th>INP</th><th>CLS</th><th>Failed requests</th><th>Example budget</th></tr></thead><tbody>{pages.map(page => <tr key={page.page}><th scope="row">{page.page}</th><td>{page.lcp.toFixed(1)} s</td><td>{page.inp} ms</td><td>{page.cls.toFixed(2)}</td><td>{page.failures} / {page.requests}</td><td><span className={`uxe-outcome ${page.lcp > 2.5 || page.inp > 200 || page.cls > .1 ? "uxe-outcome-assisted" : "uxe-outcome-independent"}`}>{page.lcp > 2.5 || page.inp > 200 || page.cls > .1 ? "Review" : "Within budget"}</span></td></tr>)}</tbody></table></div><p className="ux-footnote">Demonstration budgets: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.10. These samples do not establish real Core Web Vitals status. <a className="ux-text-link" href="https://web.dev/articles/vitals" target="_blank" rel="noopener noreferrer">Metric definitions ↗</a></p></Panel>
    <div className="ux-two-columns"><Panel title="Manual accessibility checks" description="Example checklist entries, not findings about the current application."><div className="uxe-access-list">{accessibilityExamples.map((check, index) => <button type="button" key={check.area} aria-pressed={selected === index} className={selected === index ? "is-selected" : ""} onClick={() => setSelected(index)}><span>{check.area}</span><span className="ux-pill ux-pill-neutral">{check.status}</span></button>)}</div></Panel><Panel title={accessibilityExamples[selected].area} description="Illustrative manual check"><div className="uxe-observation" aria-live="polite"><span className="ux-eyebrow">TASK TO TRY</span><p>{accessibilityExamples[selected].task}</p><span className="ux-eyebrow">EXAMPLE OBSERVATION</span><p>{accessibilityExamples[selected].note}</p><span className="ux-eyebrow">INTERPRETATION</span><p>A checklist is a starting point for review. It cannot establish accessibility conformance or replace testing with people who use assistive technology.</p></div></Panel></div>
    <ResearchNote title="Does a technical delay actually stop someone completing a task?" source="Field performance measurements or repeatable lab tests, request monitoring, and manual accessibility evaluation. GA4 page views alone do not supply these findings.">Connect a performance pattern with a concrete task. Review a slower page on a representative device and connection, then observe the effect on completion.</ResearchNote>
  </>
}
