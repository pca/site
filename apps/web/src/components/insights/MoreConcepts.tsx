import { Link } from "@tanstack/react-router"
import { useState, type ReactNode } from "react"
import competitions from "../../data/competition-preview.json"
import preview from "../../data/insights-preview.json"
import { Layout } from "../Layout"
import { formatTime } from "./Insights"
import "../../concepts.css"

const compUrl = (id: string) => `https://www.worldcubeassociation.org/competitions/${id}`
const personUrl = (id: string) => `https://www.worldcubeassociation.org/persons/${id}`
const number = (value: number) => value.toLocaleString("en-US")
const period = preview.periods.find(period => period.days === 28)!
type Concept = "competition" | "milestones" | "recap"

function ConceptsPage({ active, title, description, children }: { active: Concept; title: string; description: string; children: ReactNode }) {
  return <Layout><div className="insights-page concepts-page">
    <div className="concepts-topline"><Link to="/insights">← First three ideas</Link><span>More page ideas · Simple prototypes</span></div>
    <h1>{title}</h1><p className="concepts-description">{description}</p>
    <nav className="insights-tabs" aria-label="More page ideas">
      <Link to="/competition-breakdown" aria-current={active === "competition" ? "page" : undefined}>Competition breakdown</Link>
      <Link to="/milestones" aria-current={active === "milestones" ? "page" : undefined}>Event milestones</Link>
      <Link to="/competition-recap" aria-current={active === "recap" ? "page" : undefined}>Competition recap</Link>
    </nav>
    <p className="concepts-note">Real snapshot results through {preview.latestResultDate}. Not live data.</p>
    {children}
    <p className="concepts-footnote">Source: WCA export {preview.snapshot}. These are unlisted, noindex prototypes.</p>
  </div></Layout>
}

function EventLabel({ id, name }: { id: string; name: string }) {
  return <span className="concepts-event"><img src={`/images/${id}.svg`} width={22} height={22} alt="" />{name}</span>
}

function Metric({ value, label }: { value: string | number; label: string }) {
  return <div><strong>{typeof value === "number" ? number(value) : value}</strong><span>{label}</span></div>
}

export function CompetitionBreakdown() {
  const [id, setId] = useState(competitions[0].id)
  const [eventId, setEventId] = useState("333")
  const comp = competitions.find(comp => comp.id === id)!
  const event = comp.events.find(event => event.id === eventId) ?? comp.events[0]
  const winner = event?.results.find(result => result.place === 1)
  const second = event?.results.find(result => result.place === 2)
  const margin = winner && second ? second.average - winner.average : null
  return <ConceptsPage active="competition" title="Competition Breakdown" description="Final results, winning margins and solve-by-solve results.">
    <div className="concepts-controls"><label>Competition<select value={id} onChange={e => setId(e.target.value)}>{competitions.map(comp => <option key={comp.id} value={comp.id}>{comp.name}</option>)}</select></label><a href={compUrl(comp.id)} target="_blank" rel="noopener noreferrer">Official results ↗</a></div>
    <p className="concepts-note">{comp.date} · {comp.city}</p>
    <div className="insights-filters" aria-label="Final event">{comp.events.map(item => <button type="button" key={item.id} aria-pressed={item.id === event?.id} onClick={() => setEventId(item.id)}><EventLabel id={item.id} name={item.name} /></button>)}</div>
    {event ? <><div className="concepts-metrics"><Metric value={comp.people} label="Competitors at this competition" /><Metric value={event.finalists} label="Finalists with a valid average" /><Metric value={margin === null ? "—" : `${(margin / 100).toFixed(2)} s`} label="Average gap between 1st and 2nd" /></div>
      <div className="concepts-columns"><section className="concepts-box"><h2><EventLabel id={event.id} name={event.name} /> final</h2><div className="concepts-table-scroll"><table><thead><tr><th>Place</th><th>Competitor</th><th>Average</th><th>Gap to 1st</th></tr></thead><tbody>{event.results.map(result => <tr key={result.person}><td><span className={`statistics-rank-tag medal-${result.place}`}>{result.place}</span></td><th scope="row"><a href={personUrl(result.person)} target="_blank" rel="noopener noreferrer">{result.name} ↗</a></th><td><strong>{formatTime(result.average)}</strong></td><td>{winner ? (result.average === winner.average ? "—" : `+${((result.average - winner.average) / 100).toFixed(2)} s`) : "—"}</td></tr>)}</tbody></table></div><p className="concepts-note">Top 8 valid-average results. Gaps compare official averages, not single solves.</p></section>
      <aside className="concepts-box concepts-tint"><h2>Winner’s solves</h2>{winner ? <><a href={personUrl(winner.person)} target="_blank" rel="noopener noreferrer">{winner.name} ↗</a><ol className="concepts-solve-list">{winner.solves.map((value, index) => <li key={index}><span>Solve {index + 1}</span><strong>{formatTime(value)}</strong></li>)}</ol><p className="concepts-note">All attempts shown, including solves trimmed from the average.</p></> : <p>No valid winning average in this sample.</p>}</aside></div></> : <p>No supported timed-average finals in this snapshot.</p>}
  </ConceptsPage>
}

// These are illustrative personal targets, not official WCA record categories.
const thresholds: Record<string, number[]> = {
  "333": [1000, 1500, 2000, 3000], "222": [300, 500, 1000], "444": [3000, 4000, 6000],
  "555": [6000, 9000, 12000], "666": [12000, 18000], "777": [18000, 24000],
  "333oh": [1500, 2000, 3000], clock: [500, 1000, 1500], minx: [6000, 9000, 12000],
  pyram: [300, 500, 1000], skewb: [300, 500, 1000], sq1: [1500, 2000, 3000],
}
const candidates = period.stories.filter(story => story.kind === "improvement" || story.kind === "new-strength")
const crossings = [...new Map(candidates.flatMap(story => (thresholds[story.event] ?? []).filter(target => story.prior !== null && story.prior >= target && story.average < target).map(target => ({ ...story, target }))).sort((a, b) => a.date.localeCompare(b.date)).map(item => [`${item.person}-${item.event}-${item.target}`, item])).values()]

export function MilestonesPage() {
  const [eventId, setEventId] = useState("333")
  const [target, setTarget] = useState(0)
  const events = [...new Map(candidates.map(story => [story.event, story.eventName])).entries()]
  const limits = thresholds[eventId] ?? []
  const rows = crossings.filter(item => item.event === eventId && (!target || item.target === target))
  return <ConceptsPage active="milestones" title="Event Milestones" description="First recorded average PBs below selected time targets.">
    <div className="concepts-controls"><label>Event<select value={eventId} onChange={e => { setEventId(e.target.value); setTarget(0) }}>{events.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><span>{period.start} – {period.end}</span></div>
    <div className="insights-filters" aria-label="Time target"><button type="button" aria-pressed={!target} onClick={() => setTarget(0)}>All targets</button>{limits.map(limit => <button type="button" key={limit} aria-pressed={target === limit} onClick={() => setTarget(limit)}>Sub-{limit / 100} seconds <span className="concepts-count">{crossings.filter(item => item.event === eventId && item.target === limit).length}</span></button>)}</div>
    <p className="concepts-note">Selected PB improvements only, not all national results. Targets are examples, not official record categories.</p>
    <div className="concepts-milestone-grid" aria-live="polite">{rows.map(item => <article className="concepts-box" key={`${item.person}-${item.target}`}><span className="concepts-milestone-tag">First sub-{item.target / 100} average</span><h2><a href={personUrl(item.person)} target="_blank" rel="noopener noreferrer">{item.name} ↗</a></h2><div className="concepts-before-after"><span><small>Previous PB</small>{formatTime(item.prior)}</span><span aria-hidden="true">→</span><strong><small>New PB</small>{formatTime(item.average)}</strong></div><a className="concepts-small-link" href={compUrl(item.competition)} target="_blank" rel="noopener noreferrer">{item.competitionName} ↗</a><p className="concepts-note">{item.date}</p></article>)}</div>
    {!rows.length && <div className="concepts-box"><p>No selected results crossed this target. Try another event or target.</p></div>}
    <p className="concepts-footnote">A crossing requires a previous average PB at or above the target and a new PB strictly below it. “First” refers to the available snapshot history.</p>
  </ConceptsPage>
}

export function CompetitionRecap() {
  const [person, setPerson] = useState(preview.profiles[0].id)
  const profile = preview.profiles.find(profile => profile.id === person)!
  const latest = [...profile.events].sort((a, b) => b.latest.date.localeCompare(a.latest.date))[0].latest
  const events = profile.events.filter(event => event.latest.competition === latest.competition)
  const pbs = events.filter(event => event.latest.prior !== null && event.latest.average < event.latest.prior)
  const firsts = events.filter(event => event.latest.prior === null)
  return <ConceptsPage active="recap" title="Competition Recap" description="One competitor’s latest competition, across events.">
    <div className="concepts-controls"><label>Preview competitor<select value={person} onChange={e => setPerson(e.target.value)}>{preview.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label><span>16 public examples · No login required</span></div>
    <div className="concepts-recap-heading"><h2><a href={compUrl(latest.competition)} target="_blank" rel="noopener noreferrer">{latest.competitionName} ↗</a></h2><span>{latest.date}</span></div>
    <div className="concepts-metrics"><Metric value={events.length} label="Events represented in this sample" /><Metric value={pbs.length} label="New average PBs" /><Metric value={firsts.length} label="First valid averages in an event" /></div>
    <section className="concepts-box"><h2>Results by event</h2><div className="concepts-table-scroll"><table><thead><tr><th>Event</th><th>Previous average PB</th><th>Competition-best average</th><th>Result</th></tr></thead><tbody>{events.map(event => { const prior = event.latest.prior; const improved = prior !== null && event.latest.average < prior; return <tr key={event.id}><th scope="row"><EventLabel id={event.id} name={event.name} /></th><td>{formatTime(prior)}</td><td><strong>{formatTime(event.latest.average)}</strong></td><td>{prior === null ? <span className="concepts-status">First average</span> : improved ? <span className="concepts-status">PB · {((prior - event.latest.average) / prior * 100).toFixed(1)}% lower</span> : "No new average PB"}</td></tr> })}</tbody></table></div></section>
    <div className="concepts-recap-links"><Link to="/performance" search={{ person: profile.id }}>View event history →</Link><a href={personUrl(profile.id)} target="_blank" rel="noopener noreferrer">WCA profile ↗</a></div>
    <p className="concepts-footnote">Latest competition represented in this profile sample. Covers 12 timed-average events, not all WCA events. PB comparisons use strictly earlier competition dates.</p>
  </ConceptsPage>
}
