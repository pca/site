import { findRegion, REGIONS } from "@pca/shared"
import { Link } from "@tanstack/react-router"
import { useEffect, useState, type ReactNode } from "react"

import preview from "../../data/insights-preview.json"
import { pageHead } from "../../lib/seo"
import { Layout } from "../Layout"
import "../../insights.css"

type Story = (typeof preview.periods)[number]["stories"][number]
type Period = (typeof preview.periods)[number]
type Profile = (typeof preview.profiles)[number]
type EventReport = Profile["events"][number]
const KINDS = [
  { id: "all", label: "All highlights" },
  { id: "improvement", label: "Average PBs" },
  { id: "new-strength", label: "Less-entered event PBs" },
  { id: "debut", label: "First competitions" },
  { id: "podium", label: "Podiums" },
] as const

export function insightsHead(title: string, path: string) {
  const head = pageHead({ title, path, description: "An experimental PCA view of competition highlights and personal progress, using a dated local results snapshot." })
  return { ...head, meta: [...head.meta, { name: "robots", content: "noindex, nofollow, noarchive" }] }
}

export const previewProfiles = preview.profiles
export const formatTime = (value: number | null) => {
  if (value === null) return "—"
  if (value < 0) return value === -1 ? "DNF" : "DNS"
  const seconds = Math.round(value) / 100
  return seconds < 60 ? seconds.toFixed(2) : `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`
}
const date = (value: string) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`))
const regionName = (id: string | null) => findRegion(id)?.fullName ?? "Home region not linked"
const eventName = (id: string) => preview.profiles.flatMap(profile => profile.events).find(event => event.id === id)?.name ?? id
const wcaPerson = (id: string) => `https://www.worldcubeassociation.org/persons/${id}`
const wcaCompetition = (id: string) => `https://www.worldcubeassociation.org/competitions/${id}`

// A general digest should expose different kinds of progress, not eight PBs
// followed by everything else. Category views retain their source order.
function selectStories(stories: Story[], kind: string, limit: number) {
  if (kind !== "all") return stories.filter(story => story.kind === kind).slice(0, limit)
  const queues = KINDS.filter(kind => kind.id !== "all").map(kind => stories.filter(story => story.kind === kind.id))
  const result: Story[] = []
  const seen = new Set<string>()
  while (queues.some(queue => queue.length) && result.length < limit) {
    for (const queue of queues) {
      let next = queue.shift()
      while (next && seen.has(`${next.person}-${next.event}`)) next = queue.shift()
      if (next && result.length < limit) {
        seen.add(`${next.person}-${next.event}`)
        result.push(next)
      }
    }
  }
  return result
}

function EventIcon({ id }: { id: string }) {
  return <img className="insight-event-icon" src={`/images/${id}.svg`} alt="" width={28} height={28} />
}

function ProfileLink({ story, children }: { story: Story; children?: ReactNode }) {
  return preview.profiles.some(profile => profile.id === story.person)
    ? <Link to="/performance" search={{ person: story.person, event: story.event }}>{children ?? story.name} <span aria-hidden="true">↗</span></Link>
    : <a href={wcaPerson(story.person)} target="_blank" rel="noopener noreferrer">{children ?? story.name} <span aria-hidden="true">↗</span></a>
}

function LabPage({ active, title, description, children }: { active: "highlights" | "performance" | "pulse"; title: string; description: string; children: ReactNode }) {
  return <Layout>
    <div className="insights-page">
      <div className="insights-heading"><p className="insights-eyebrow">PCA / INSIGHTS LAB <span>Concept preview</span></p><h1>{title}</h1><p>{description}</p></div>
      <nav className="insights-tabs" aria-label="Insights pages">
        <Link to="/insights" aria-current={active === "highlights" ? "page" : undefined}>Competition highlights</Link>
        <Link to="/performance" aria-current={active === "performance" ? "page" : undefined}>Performance report</Link>
        <Link to="/region-pulse" aria-current={active === "pulse" ? "page" : undefined}>Region Pulse</Link>
        <Link to="/competition-breakdown">More page ideas →</Link>
      </nav>
      <aside className="insights-preview-note"><strong>Snapshot preview · {date(preview.latestResultDate)}</strong><span>Real results, not live or this week’s activity.</span></aside>
      {children}
      <footer className="insights-source">Source: WCA export {preview.snapshot} · Static preview</footer>
    </div>
  </Layout>
}

function PeriodControl({ period, onChange }: { period: Period; onChange: (days: number) => void }) {
  return <div className="insights-period-bar"><div><span className="insights-eyebrow">RESULTS WINDOW</span><p>{date(period.start)} – {date(period.end)}</p></div><div className="insights-segment" aria-label="Results window">{preview.periods.map(option => <button type="button" key={option.days} aria-pressed={period.days === option.days} onClick={() => onChange(option.days)}>Last {option.days === 7 ? "7 days" : "4 weeks"}</button>)}</div></div>
}

function Stat({ label, value, note }: { label: string; value: string | number; note: string }) {
  return <div className="insights-stat"><span>{label}</span><strong>{typeof value === "number" ? value.toLocaleString("en-US") : value}</strong><small>{note}</small></div>
}

function StoryCard({ story }: { story: Story }) {
  const kind = KINDS.find(kind => kind.id === story.kind)!
  return <article className={`insights-story story-${story.kind}`}>
    <div className="insights-story-icon"><EventIcon id={story.event} /></div>
    <div className="insights-story-content"><div className="insights-story-meta"><span className={`insights-kind kind-${story.kind}`}>{kind.label}</span><time dateTime={story.date}>{date(story.date)}</time></div>
      <h3><ProfileLink story={story} /></h3>
      <p>{story.kind === "improvement" ? <><strong>{story.eventName} average PB.</strong> {story.improvement}% lower time.</> : story.kind === "new-strength" ? <><strong>{story.eventName} average PB.</strong> {story.improvement}% lower time. Fewer prior competition appearances than in {eventName(story.primaryEvent!)}.</> : story.kind === "debut" ? <><strong>First recorded competition.</strong> {story.eventName}: {formatTime(story.average)} average.</> : <><strong>{story.eventName} final: #{story.place}.</strong> {formatTime(story.average)} average.</>}</p>
      {(story.kind === "improvement" || story.kind === "new-strength") && <div className="insights-result-pair"><div><small>Previous PB</small><span>{formatTime(story.prior)}</span></div><span aria-hidden="true">→</span><div><small>New average PB</small><strong>{formatTime(story.average)}</strong></div></div>}
      <a className="insights-source-link" href={wcaCompetition(story.competition)} target="_blank" rel="noopener noreferrer">{story.competitionName} ↗</a>
    </div>
  </article>
}

function Methods({ children }: { children: ReactNode }) {
  return <details className="insights-methods"><summary>Calculation and selection rules</summary><div>{children}<p>PB comparisons use strictly earlier competition dates, including overseas results for Filipino competitors in this snapshot. Only 12 standard timed-average events are covered; blindfolded events, Fewest Moves and Multi-Blind are not included. Competition dates are start dates, not publication dates.</p><p>Missing results or an unlinked home region can affect coverage.</p></div></details>
}

export function HighlightsPage() {
  const [days, setDays] = useState(7)
  const [kind, setKind] = useState<string>("all")
  const period = preview.periods.find(period => period.days === days)!
  const spotlight = period.spotlight
  const discovery = period.stories.find(story => story.kind === "new-strength" && story.person !== spotlight.person)
  const stories = selectStories(period.stories, kind, 8)
  return <LabPage active="highlights" title="Competition Highlights" description="Average PB improvements, first competitions and final-round podiums.">
    <PeriodControl period={period} onChange={setDays} />
    <div className="insights-digest-grid">
      <section className="insights-spotlight">
        <div className="insights-spotlight-top"><span className="insights-feature-label">Largest average PB reduction (%)</span><span className="insights-feature-event"><EventIcon id={spotlight.event} />{spotlight.eventName}</span></div>
        <div className="insights-feature-person"><span className="insights-feature-initials" aria-hidden="true">{spotlight.name.split(" ").slice(0, 2).map(name => name[0]).join("")}</span><div><ProfileLink story={spotlight} /><span>{date(spotlight.date)} · {spotlight.city}</span></div></div>
        <h2>{((spotlight.prior - spotlight.average) / 100).toFixed(2)} seconds off<br />the average PB.</h2>
        <div className="insights-feature-times"><div><small>Previous average PB</small><span>{formatTime(spotlight.prior)}</span></div><span aria-hidden="true">→</span><div><small>New average PB</small><strong>{formatTime(spotlight.average)}</strong></div></div>
        <div className="insights-feature-bottom"><span>{spotlight.improvement}% lower time</span><ProfileLink story={spotlight}>View performance report</ProfileLink></div>
        <p className="insights-feature-source">At <a href={wcaCompetition(spotlight.competition)} target="_blank" rel="noopener noreferrer">{spotlight.competitionName} ↗</a></p>
      </section>
      <aside className="insights-discovery"><h2>PBs in less-entered events</h2>{discovery ? <StoryCard story={discovery} /> : <p>No qualifying PBs in this window.</p>}<Link to="/region-pulse">View regional results →</Link></aside>
    </div>
    <p className="insights-spotlight-method">Selected by percentage reduction in average PB. Requires at least three earlier competitions with a valid average in the event.</p>
    <section className="insights-stats insights-digest-stats" aria-label="Results window in numbers"><Stat label="Competitions" value={period.competitions} note="Held in the Philippines" /><Stat label="Competitors" value={period.participants} note="Unique Filipino participants" /><Stat label="First competitions" value={period.newcomers} note="First recorded in this snapshot" /><Stat label="Average PBs" value={period.averagePbs} note="Person–event pairs · 12 timed events" /></section>
    <section className="insights-feed-section"><div className="insights-section-title"><div><h2>Selected results</h2></div><span>Up to 8 per category</span></div><div className="insights-filters" aria-label="Highlight type">{KINDS.map(option => <button type="button" key={option.id} aria-pressed={kind === option.id} onClick={() => setKind(option.id)}>{option.label}</button>)}</div><div className="insights-story-grid" aria-live="polite">{stories.slice(0, 8).map(story => <StoryCard key={`${story.person}-${story.event}-${story.kind}`} story={story} />)}{stories.length === 0 && <p className="insights-empty">No highlights of this type in this preview window.</p>}</div><p className="insights-small-note">Selected results only. “Less-entered” compares prior competition appearances, not a competitor’s specialty.</p></section>
    <Methods><p>PB highlights require a lower average PB and at least three earlier competitions with a valid average. Less-entered event PBs also require a reduction of at least 10% and another event with more prior competition appearances. Debuts use the earliest recorded competition; podiums use final-round places. A person may appear in more than one category.</p></Methods>
  </LabPage>
}

function ProgressChart({ event }: { event: EventReport }) {
  const values = event.history.map(point => point.average)
  const min = Math.min(...values) * 0.9
  const max = Math.max(...values) * 1.1
  const y = (value: number) => 230 - (value - min) / (max - min || 1) * 185
  const x = (index: number) => values.length === 1 ? 430 : 85 + index / (values.length - 1) * 700
  return <section className="insights-panel insights-chart"><div className="insights-section-title"><div><h2>Competition average history</h2></div><span>Lower is faster</span></div><p>Best valid average at each of the last {event.history.length} recorded competitions for this event. Points are equally spaced by appearance, not elapsed time.</p><div className="insights-chart-scroll" role="region" aria-label="Competition average chart" tabIndex={0}><svg viewBox="0 0 870 280" role="img" aria-label={`${event.name}: ${event.history.map(point => `${date(point.date)}, ${formatTime(point.average)}`).join("; ")}`}>
    {[min, (min + max) / 2, max].map(value => <g key={value}><line x1="85" x2="785" y1={y(value)} y2={y(value)} stroke="#e3e7ec" /><text x="70" y={y(value) + 4} textAnchor="end">{formatTime(value)}</text></g>)}
    <polyline points={event.history.map((point, index) => `${x(index)},${y(point.average)}`).join(" ")} fill="none" stroke="#0a4c84" strokeWidth="3" />
    {event.history.map((point, index) => <g key={point.competition}><circle cx={x(index)} cy={y(point.average)} r="5" fill={index === values.length - 1 ? "#ffd329" : "#0a4c84"} stroke="#0a4c84"><title>{`${point.name}: ${formatTime(point.average)}`}</title></circle><text x={x(index)} y="259" textAnchor="middle">{index === 0 || index === values.length - 1 ? date(point.date) : ""}</text></g>)}
  </svg></div><details><summary>View the exact results</summary><div className="insights-table-scroll"><table><caption className="sr-only">Competition-best averages</caption><thead><tr><th>Date</th><th>Competition</th><th>Average</th></tr></thead><tbody>{event.history.map(point => <tr key={point.competition}><td>{date(point.date)}</td><td><a href={wcaCompetition(point.competition)} target="_blank" rel="noopener noreferrer">{point.name} ↗</a></td><td><strong>{formatTime(point.average)}</strong></td></tr>)}</tbody></table></div></details></section>
}

export function PerformancePage({ personId, eventId, onChange }: { personId?: string; eventId?: string; onChange: (person: string, event?: string) => void }) {
  const profile = preview.profiles.find(profile => profile.id === personId) ?? preview.profiles[0]
  const event = profile.events.find(event => event.id === eventId) ?? profile.events[0]
  const latest = event.latest
  const change = latest.prior && latest.average < latest.prior ? (latest.prior - latest.average) / latest.prior * 100 : null
  const baselineChange = latest.baseline ? (latest.baseline - latest.average) / latest.baseline * 100 : null
  return <LabPage active="performance" title="Performance Report" description="Competition averages, PB changes and recent round results by event.">
    <div className="insights-report-controls"><label>Preview competitor<select value={profile.id} onChange={e => onChange(e.target.value)}>{preview.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label><label>Event<select value={event.id} onChange={e => onChange(profile.id, e.target.value)}>{profile.events.map(event => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label><p>16 example competitors from the digest. No login required for this public preview.</p></div>
    <section className="insights-profile-heading"><div className="insights-avatar" aria-hidden="true">{profile.name.split(" ").map(name => name[0]).slice(0, 2).join("")}</div><div><span className="insights-eyebrow">PERFORMANCE REPORT</span><h2>{profile.name}</h2><p>{regionName(profile.homeRegion)} · {profile.competitionCount} recorded competitions <a href={wcaPerson(profile.id)} target="_blank" rel="noopener noreferrer">WCA profile ↗</a></p></div></section>
    <section className="insights-stats" aria-label="Event performance"><Stat label="Latest competition average" value={formatTime(latest.average)} note={`${event.name} · best round average`} /><Stat label="Previous average PB" value={formatTime(latest.prior)} note="Before this competition date" /><Stat label="Recent baseline" value={formatTime(latest.baseline)} note={`Median of up to 5 earlier competitions`} /><Stat label="Average PB change" value={change === null ? "No new PB" : `−${change.toFixed(1)}%`} note={change === null ? "Or no earlier valid average to compare" : "Lower time than the previous average PB"} /></section>
    <div className="insights-report-grid"><section className="insights-panel insights-reading"><h2>Latest average vs recent baseline</h2><p>{baselineChange !== null ? <>The latest competition-best average is <strong>{Math.abs(baselineChange).toFixed(1)}% {baselineChange >= 0 ? "lower" : "higher"}</strong> than the median of the previous {Math.min(5, latest.previousCompetitions)} competition-best averages.</> : <>No earlier valid competition average for this event. Baseline unavailable.</>}</p><a href={wcaCompetition(latest.competition)} target="_blank" rel="noopener noreferrer">{latest.competitionName} ↗</a><small>{date(latest.date)} · latest valid average for this event in the snapshot</small></section>
    <section className="insights-panel"><h2>Latest round averages and solves</h2><div className="insights-rounds">{latest.rounds.map((round, i) => <div key={`${round.name}-${i}`}><div><strong>{round.name}</strong><span>{formatTime(round.average)} average · place {round.place}</span></div><ol aria-label={`${round.name} solves`}>{round.solves.map((solve, index) => <li key={index}><small>#{index + 1}</small><strong>{formatTime(solve)}</strong></li>)}</ol></div>)}</div><p className="insights-small-note">Official round averages. All attempts are shown, including trimmed solves; only rounds with a valid average are included.</p></section></div>
    <ProgressChart event={event} />
    <section className="insights-panel insights-event-summary"><div className="insights-section-title"><div><h2>Average PBs by event</h2></div><span>Select an event</span></div><div className="insights-event-grid">{profile.events.map(item => <button type="button" aria-pressed={item.id === event.id} key={item.id} onClick={() => onChange(profile.id, item.id)}><EventIcon id={item.id} /><span>{item.name}<small>{item.appearances} competitions with a valid average</small></span><strong>{formatTime(item.bestAverage)}<small>average PB</small></strong></button>)}</div></section>
    <Methods><p>Each point is the best valid official round average at that competition, not an average of round averages. The baseline is the median of up to five competition-best averages on strictly earlier dates. A negative PB change means a lower, faster time. This report does not calculate a new ranking or an invented skill score.</p></Methods>
  </LabPage>
}

export function RegionPulsePage() {
  const [days, setDays] = useState(7)
  const [region, setRegion] = useState("all")
  const [basis, setBasis] = useState("host")
  const [kind, setKind] = useState<string>("all")
  const [followed, setFollowed] = useState<string[]>([])
  const [storageReady, setStorageReady] = useState(false)
  const [saveError, setSaveError] = useState(false)
  useEffect(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem("pca-insights-preview-regions") ?? "[]")
      if (Array.isArray(value)) setFollowed(value.filter((id): id is string => typeof id === "string" && REGIONS.some(region => region.id === id)))
    } catch { /* A blocked or invalid local store must not break the feed. */ }
    setStorageReady(true)
  }, [])
  const toggleFollow = () => {
    const next = followed.includes(region) ? followed.filter(id => id !== region) : [...followed, region]
    setFollowed(next)
    try { localStorage.setItem("pca-insights-preview-regions", JSON.stringify(next)); setSaveError(false) } catch { setSaveError(true) }
  }
  const period = preview.periods.find(period => period.days === days)!
  const regionalStories = period.stories.filter(story => region === "all" || (basis === "host" ? story.hostRegion : story.homeRegion) === region)
  const stories = selectStories(regionalStories, kind, 12).sort((a, b) => b.date.localeCompare(a.date))
  const competitions = preview.competitions.filter(comp => comp.date >= period.start && (region === "all" || comp.hostRegion === region))
  return <LabPage active="pulse" title="Region Pulse" description="PB improvements, first competitions and podiums by region.">
    <PeriodControl period={period} onChange={setDays} />
    <div className="insights-report-controls"><label>Region<select value={region} onChange={e => setRegion(e.target.value)}><option value="all">All regions</option>{REGIONS.map(region => <option key={region.id} value={region.id}>{region.codeName} · {region.fullName}</option>)}</select></label><label>Connect activity by<select value={basis} onChange={e => setBasis(e.target.value)}><option value="host">Competition location</option><option value="home">Approved home region</option></select></label>{region !== "all" && <button className="insights-follow" type="button" disabled={!storageReady} aria-pressed={followed.includes(region)} onClick={toggleFollow}>{followed.includes(region) ? "Following in this browser ✓" : "Follow this region"}</button>}</div>
    <p className="insights-small-note">{basis === "host" ? "Activity is grouped by the competition’s host region—not the competitors’ home regions." : `Home-region coverage is limited: ${period.matchedHomeRegions} of ${period.participants} competitors in this window have an unambiguous region in the local account data. Others cannot appear in a home-region filter.`} Following only saves a preference in this browser; there are no notifications or account subscriptions.{saveError ? " Your browser could not save this preference; it will last only for this visit." : ""}</p>
    {followed.length > 0 && <div className="insights-followed"><span>Following</span>{followed.map(id => <button key={id} type="button" aria-pressed={region === id} onClick={() => setRegion(id)}>{findRegion(id)?.shortName}</button>)}</div>}
    <div className="insights-pulse-grid"><section><div className="insights-section-title"><div><h2>{region === "all" ? "Nationwide results" : regionName(region)}</h2></div><span>{regionalStories.length} selected highlights</span></div><div className="insights-filters" aria-label="Activity type">{KINDS.map(option => <button type="button" key={option.id} aria-pressed={kind === option.id} onClick={() => setKind(option.id)}>{option.label}</button>)}</div><div className="insights-timeline" aria-live="polite">{stories.slice(0, 12).map(story => <StoryCard key={`${story.person}-${story.event}-${story.kind}`} story={story} />)}{stories.length === 0 && <div className="insights-empty"><h3>No matching highlights.</h3><p>Try four weeks, another region, or competition location. This preview contains selected results, not a complete activity history.</p><button type="button" onClick={() => { setRegion("all"); setKind("all"); setDays(28) }}>View all regions</button></div>}</div><p className="insights-small-note">Up to 12 selected results. A PB may appear in more than one category.</p></section>
    <aside><section className="insights-panel insights-pulse-about"><h2>Preview coverage</h2><p>Selected highlights from 12 timed-average events, not a complete activity history.</p><p>Home-region filters exclude competitors without an approved local region.</p></section><section className="insights-panel insights-weekend"><span className="insights-eyebrow">HOSTED IN THIS WINDOW</span><h2>{competitions.length} {competitions.length === 1 ? "competition" : "competitions"}</h2><ul>{competitions.map(comp => <li key={comp.id}><time dateTime={comp.date}>{date(comp.date)}</time><a href={wcaCompetition(comp.id)} target="_blank" rel="noopener noreferrer">{comp.name} ↗</a><span>{regionName(comp.hostRegion)}</span></li>)}</ul>{competitions.length === 0 && <p>No hosted competitions in this window. Residents may have competed elsewhere.</p>}</section></aside></div>
    <Methods><p>The feed uses the same limited, rule-selected digest as Competition Highlights. Competition-location filters use the host region. Home-region filters use only unambiguous region assignments in local accounts; this is not a complete registry of Filipino cubers. All 18 regions are available, including regions with no matching preview stories.</p></Methods>
  </LabPage>
}
