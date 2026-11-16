import { useId, useState, type CSSProperties, type ReactNode } from "react"

import { designSpecs } from "../../lib/analytics-workbench"
import { featureExamples, previewRate, retentionPoints, returningGroups, returnWeeks } from "../../lib/behavior-preview"
import { AnalyticsSectionIcon } from "./AnalyticsSectionIcon"

type DesignSection = keyof typeof designSpecs
const guides: Record<DesignSection, { title: string; read: string; next: string; terms: readonly [string, string][] }> = {
  features: {
    title: "Did visitors see the feature before they used it?",
    read: "Read from left to right: visits that could encounter a feature → visits where it was seen → visits where it was used.",
    next: "Compare visibility first. Low use alone does not tell you whether the feature is hidden or unnecessary.",
    terms: [["Eligible sessions", "Visits where the feature could be available."], ["Exposed sessions", "Eligible visits that met the feature's defined visibility rule."], ["Used sessions", "Exposed visits with the matching action after exposure, counted once per visit."], ["Use / exposed", "Visits that used the feature divided by visits exposed to it. Not the share of all visitors."]],
  },
  journeys: {
    title: "Where do visits stop during region setup?",
    read: "Start with visits that saw the region prompt. Each following step includes only visits that reached the earlier steps in order.",
    next: "Choose a step to inspect its counts. Investigate a large drop before deciding what to change.",
    terms: [["Funnel", "An ordered task with a defined starting population. This preview uses visits that saw the region prompt."], ["Share of entry", "Visits at this step divided by all visits at the first step."], ["Continued from previous step", "Visits at this step divided by visits at the immediately preceding step."], ["Navigation paths", "The actual routes visitors take. This is a separate analysis, not another name for this task funnel."]],
  },
  retention: {
    title: "Do groups of first-time visitors come back?",
    read: "Each row is a group that first visited in the same week—a cohort. Read across to see how many returned in later weeks.",
    next: "Choose a percentage to see its original group size. Compare the same completed week across groups.",
    terms: [["Cohort", "A starting group. Here, browser identities grouped by their first-visit week."], ["Weekly retention", "A return in that particular later calendar week, not necessarily in every week before it. This is exact-week retention, not cumulative returns."], ["Browser identities", "Recognized browsers, not verified unique people."], ["Not observed", "The follow-up week has not finished by the sample cutoff. It is not a zero return rate."]],
  },
  feedback: {
    title: "What are visitors reporting, and what needs review?",
    read: "Open a report to read the visitor's message and the page context attached to it. The visitor's category is a starting point, not a verified diagnosis.",
    next: "Check the reported problem, correct its category if needed, and record the review outcome.",
    terms: [["Type", "Initially chosen by the visitor. A reviewer can correct it; no AI classification is assumed."], ["Context", "The page and relevant selections when the form was opened, not the visitor's physical location."], ["Status", "The report's review progress, not proof that the reported problem is confirmed."], ["Suggestions", "Requests for an improvement, kept separate from reports of broken or incorrect behavior."]],
  },
  releases: {
    title: "What changed around a website update?",
    read: "Compare the same metric before and after an update. Check changes in the traffic mix alongside changes in behavior.",
    next: "Record a possible change to investigate. A before/after difference alone cannot prove that the release caused it.",
    terms: [["Before / after", "Comparable reporting windows on either side of a release. Actual dates must be supplied when connected."], ["Percentage-point difference", "The arithmetic difference between two rates, distinct from a relative percentage increase."], ["Traffic mix", "The balance of devices, sources and visitors, which may change independently of the release."], ["Tracking needed", "The measurement is unavailable. Do not read a missing value as zero."]],
  },
  experiments: {
    title: "Is the proposed A/B test ready to run?",
    read: "Review the question, primary outcome and safeguards before any visitors are assigned to a design.",
    next: "Agree on a test plan first. This is a planning preview: no experiment is running and no winner is calculated.",
    terms: [["Hypothesis", "A specific change and the outcome you expect it to improve."], ["Primary outcome", "The main measurement used to evaluate the test, with a clear denominator."], ["Guardrail", "A measurement that should not worsen, such as login failures."], ["Decision rule", "The planned sample, duration and analysis approach, agreed before launch."]],
  },
}

function PreviewPanel({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return <section className="wb-panel"><div className="wb-panel-head"><div><h2>{title}</h2>{note && <p>{note}</p>}</div></div>{children}</section>
}

export function AnalyticsDesignPreview({ section }: { section: DesignSection }) {
  const spec = designSpecs[section], guide = guides[section]
  return <>
    <div className="wb-design-notice"><span className="wb-badge">Design preview</span><p>Invented examples. Preview selections only change this screen; nothing is collected, sent or saved.</p></div>
    {section === "features" || section === "retention" ? <details className="wb-visual-help"><summary><AnalyticsSectionIcon section={section}/><span>How to read this report</span></summary><p>{guide.read}</p></details> : <div className="wb-reading-guide"><AnalyticsSectionIcon section={section}/><div><strong>{guide.title}</strong><p>{guide.read}</p></div></div>}
    {section === "features" ? <FeaturePreview/> : section === "journeys" ? <FunnelPreview/> : section === "feedback" ? <FeedbackPreview/> : section === "retention" ? <RetentionPreview/> : <PreviewPanel title={spec.primary} note="Illustrative values · proposed report layout"><div className="wb-scroll" role="region" aria-label={`${spec.primary} example table`} tabIndex={0}><table><caption>Design example, not a live finding</caption><thead><tr>{spec.columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{spec.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => j === 0 ? <th scope="row" key={j}>{cell}</th> : <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div></PreviewPanel>}
    <div className="wb-report-reading"><div><strong>What to do with this</strong><p>{guide.next}</p></div><div><strong>Interpret carefully</strong><p>{spec.caution}</p></div></div>
    <PreviewPanel title="Definitions & implementation">
      <details><summary>Terms used in this report</summary><dl className="wb-preview-terms">{guide.terms.map(([term, meaning]) => <div key={term}><dt>{term}</dt><dd>{meaning}</dd></div>)}</dl></details>
      <details><summary>What is still needed before this can be live?</summary><p>{spec.needs}</p></details>
      <details><summary>What would the connected report add?</summary><p>{spec.detail}</p><p>Actual data, available filters and loading/error/empty states will need verification. Review any material layout change before implementation; this preview is not approval to launch.</p></details>
    </PreviewPanel>
  </>
}

function FunnelPreview() {
  const [selected, setSelected] = useState(1)
  const rows = designSpecs.journeys.rows
  const counts = rows.map(row => Number(row[1].replaceAll(",", "")))
  const count = counts[selected], previous = counts[selected - 1], entry = counts[0]
  const rate = (n: number, d: number) => `${(100 * n / d).toFixed(1)}%`
  return <PreviewPanel title="Region setup funnel" note="Illustrative example · ordered steps within one visit · fixed population of 733 visits">
    <div className="wb-preview-split"><ol className="wb-funnel-list">{rows.map((row, i) => <li key={row[0]}><button type="button" className={`wb-funnel-step ${selected === i ? "is-active" : ""}`} aria-pressed={selected === i} onClick={() => setSelected(i)}><span className="wb-funnel-heading"><span>{i + 1}. {row[0]}</span><strong>{counts[i].toLocaleString()}</strong></span><span className="wb-funnel-track" aria-hidden="true"><span style={{ width: `${100 * counts[i] / entry}%` }}/></span><span className="wb-funnel-caption">{rate(counts[i], entry)} of starting visits</span></button></li>)}</ol>
      <aside className="wb-preview-detail" aria-label="Selected funnel step"><span className="wb-badge">Example step {selected + 1}</span><h3>{rows[selected][0]}</h3><dl><dt>Reached this step</dt><dd>{count} / {entry} starting visits <strong>{rate(count, entry)}</strong></dd>{selected > 0 ? <><dt>Continued from previous step</dt><dd>{count} / {previous} visits <strong>{rate(count, previous)}</strong></dd><dt>Did not reach this step</dt><dd>{previous - count} visits from the previous step</dd></> : <><dt>Starting population</dt><dd>Visits where the region prompt was visible.</dd></>}</dl><p>These counts identify a step to investigate. They do not explain why someone stopped.</p></aside>
    </div>
    <details><summary>View the exact funnel table</summary><div className="wb-scroll"><table><caption>Same invented counts as the funnel above</caption><thead><tr>{designSpecs.journeys.columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row[0]}><th scope="row">{row[0]}</th><td>{row[1]}</td><td>{row[2]}</td></tr>)}</tbody></table></div></details>
  </PreviewPanel>
}

function MetricSummary({ label, value, detail, accent = false }: { label: string; value: string; detail: string; accent?: boolean }) {
  return <div className={`wb-behavior-metric ${accent ? "is-accent" : ""}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
}

function FeaturePreview() {
  const [selected, setSelected] = useState(0), feature = featureExamples[selected]
  const stages = [{ label: "Eligible", count: feature.eligible, meaning: "Could encounter it" }, { label: "Exposed", count: feature.exposed, meaning: "Met the visibility rule" }, { label: "Used", count: feature.used, meaning: "Acted after exposure" }]
  return <>
    <PreviewPanel title="From opportunity to interaction" note="Fixed sample · session-based · each visit counted once per stage">
      <div className="wb-feature-picker" role="group" aria-label="Select an example feature">{featureExamples.map((item, i) => <button key={item.name} type="button" aria-pressed={selected === i} onClick={() => setSelected(i)}><AnalyticsSectionIcon section={i === 0 ? "features" : "journeys"}/><span><strong>{item.name}</strong><small>{item.context}</small></span></button>)}</div>
      <div className="wb-behavior-metrics" aria-live="polite"><MetricSummary label="Visibility" value={previewRate(feature.exposed, feature.eligible)} detail={`${feature.exposed.toLocaleString()} / ${feature.eligible.toLocaleString()} eligible visits saw it`}/><MetricSummary label="Use after exposure" value={previewRate(feature.used, feature.exposed)} detail={`${feature.used.toLocaleString()} / ${feature.exposed.toLocaleString()} exposed visits used it`} accent/><MetricSummary label="Overall use" value={previewRate(feature.used, feature.eligible)} detail={`${feature.used.toLocaleString()} / ${feature.eligible.toLocaleString()} eligible visits used it`}/></div>
      <div className="wb-discovery-flow" aria-label={`${feature.name} exposure and use`}>{stages.map((stage, i) => <div key={stage.label} className={`wb-discovery-stage is-stage-${i}`}><div><span className="wb-stage-number">0{i + 1}</span><strong>{stage.label}</strong></div><b>{stage.count.toLocaleString()}</b><span className="wb-stage-track" aria-hidden="true"><span style={{ width: `${100 * stage.count / feature.eligible}%` }}/></span><p>{stage.meaning}</p><small>{previewRate(stage.count, feature.eligible)} of eligible visits</small></div>)}</div>
      <div className="wb-evidence-strip"><div><strong>{(feature.eligible - feature.exposed).toLocaleString()} not exposed</strong><span>Of {feature.eligible.toLocaleString()} eligible visits</span></div><div><strong>{(feature.exposed - feature.used).toLocaleString()} exposed, no recorded use</strong><span>Of {feature.exposed.toLocaleString()} exposed visits</span></div></div>
      <p className="wb-footnote">Bar lengths share the eligible-visit denominator. The two rate cards above deliberately answer different questions.</p>
    </PreviewPanel>
    <PreviewPanel title="Measurement rules" note={`Proposed definitions · ${feature.name}; not verified live`}>
      <dl className="wb-rule-grid"><div><dt><span>01</span> Eligible</dt><dd>{feature.availability}</dd></div><div><dt><span>02</span> Exposed</dt><dd>{feature.exposure}</dd></div><div><dt><span>03</span> Used</dt><dd>{feature.action}</dd></div></dl>
      <details><summary>Compare the exact feature counts</summary><div className="wb-scroll"><table><caption>Fixed invented examples · features have different eligible populations; do not add their totals</caption><thead><tr>{designSpecs.features.columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{featureExamples.map(item => <tr key={item.name}><th scope="row">{item.name}</th><td>{item.eligible.toLocaleString()}</td><td>{item.exposed.toLocaleString()}</td><td>{item.used.toLocaleString()}</td><td>{previewRate(item.used, item.exposed)}</td></tr>)}</tbody></table></div></details>
    </PreviewPanel>
  </>
}

function RetentionPreview() {
  const [selected, setSelected] = useState({ row: 1, week: 0 }), [showCounts, setShowCounts] = useState(false)
  const group = returningGroups[selected.row], returned = group.returned[selected.week], chartId = useId()
  const x = (week: number) => 44 + week * 135, y = (rate: number) => 222 - rate * 1.8
  const points = retentionPoints(group), selectedPoint = points.find(point => point.week === selected.week + 1)
  return <>
    <PreviewPanel title="Return behavior over time" note="Six invented starting groups · Aug 31–Oct 5, 2026 · complete weeks through Oct 18">
      <div className="wb-retention-definition"><div><span>Start</span><strong>First website visit</strong></div><span aria-hidden="true">→</span><div><span>Return</span><strong>Any website visit in a later week</strong></div><span className="wb-definition-tag">Exact-week retention</span></div>
      <div className="wb-chart-toolbar"><label>Highlight a starting group<select value={selected.row} onChange={event => setSelected({ row: Number(event.target.value), week: 0 })}>{returningGroups.map((row, i) => <option value={i} key={row.week}>{row.week}, 2026 · {row.size} browsers</option>)}</select></label><span>Calendar weeks · Monday start<br/>Asia/Manila</span></div>
      <div className="wb-behavior-metrics" aria-live="polite"><MetricSummary label={`${group.week} starting group`} value={String(group.size)} detail="Browser identities, not unique people"/><MetricSummary label="Week 1 return rate" value={previewRate(group.returned[0], group.size)} detail={`${group.returned[0]} / ${group.size} original browsers`} accent/><MetricSummary label="Week 4 return rate" value={previewRate(group.returned[3], group.size)} detail={group.returned[3] === null ? "This follow-up week is not complete" : `${group.returned[3]} / ${group.size} original browsers`}/></div>
      <div className="wb-retention-plot"><svg viewBox="0 0 620 267" role="img" aria-labelledby={`${chartId}-title ${chartId}-desc`}><title id={`${chartId}-title`}>Weekly retention curve for the {group.week} starting group</title><desc id={`${chartId}-desc`}>Week 0 is 100 percent. {group.returned.map((count, i) => `Week ${i + 1}: ${previewRate(count, group.size)}.`).join(" ")} Exact counts and all groups are in the table below. Gray lines are other starting groups, not a benchmark.</desc>{[0,25,50,75,100].map(tick => <g key={tick}><line x1="44" y1={y(tick)} x2="584" y2={y(tick)} className="wb-chart-grid"/><text x="33" y={y(tick) + 4} textAnchor="end">{tick}%</text></g>)}{[0,1,2,3,4].map(week => <text key={week} x={x(week)} y="247" textAnchor="middle">{week === 0 ? "Start" : `Week ${week}`}</text>)}{returningGroups.map((row, i) => i === selected.row ? null : <polyline key={row.week} className="wb-curve-other" points={retentionPoints(row).map(point => `${x(point.week)},${y(point.rate)}`).join(" ")}/>)}<path className="wb-curve-fill" d={`M${points.map(point => `${x(point.week)},${y(point.rate)}`).join(" L")} L${x(points[points.length - 1].week)},222 L44,222 Z`}/><polyline className="wb-curve-selected" points={points.map(point => `${x(point.week)},${y(point.rate)}`).join(" ")}/>{points.map(point => <circle key={point.week} cx={x(point.week)} cy={y(point.rate)} r="4" className="wb-curve-dot"/>)}{selectedPoint && <><line className="wb-curve-guide" x1={x(selectedPoint.week)} x2={x(selectedPoint.week)} y1={y(selectedPoint.rate)} y2="222"/><circle className="wb-curve-focus" cx={x(selectedPoint.week)} cy={y(selectedPoint.rate)} r="7"/></>}</svg></div>
      <div className="wb-chart-legend"><span><i className="is-selected"/>{group.week} starting group</span><span><i/>Other starting groups</span><span>Unfinished weeks are omitted</span></div>
    </PreviewPanel>
    <PreviewPanel title="Weekly retention by starting group" note="Cohort heatmap · choose a cell to highlight its curve and inspect the original denominator">
      <div className="wb-heatmap-toolbar"><div className="wb-heatmap-key"><span>Lower return</span><i aria-hidden="true"/><span>Higher return</span></div><label>Cell values<select value={showCounts ? "counts" : "rates"} onChange={event => setShowCounts(event.target.value === "counts")}><option value="rates">Percentages</option><option value="counts">Returning browsers</option></select></label></div>
      <div className="wb-scroll" role="region" aria-label="Returning groups example table" tabIndex={0}><table className="wb-cohort-table"><caption>Exact-week returns · same original group denominator for each row · rates can rise or fall</caption><thead><tr><th>First-visit week</th><th>Group size</th>{returnWeeks.map(week => <th key={week}>Week {week}</th>)}</tr></thead><tbody>{returningGroups.map((row, i) => <tr key={row.week} className={selected.row === i ? "is-highlighted" : ""}><th scope="row">{row.week}, 2026</th><td>{row.size}</td>{row.returned.map((count, j) => <td key={j}>{count === null ? <span className="wb-unobserved">Not observed</span> : <button type="button" className="wb-retention-cell wb-heat-cell" style={{ "--heat-strength": count / row.size } as CSSProperties} aria-pressed={selected.row === i && selected.week === j} aria-label={`${row.week}, week ${returnWeeks[j]}: ${count} of ${row.size} browsers returned, ${previewRate(count, row.size)}`} onClick={() => setSelected({ row: i, week: j })}>{showCounts ? count : previewRate(count, row.size)}</button>}</td>)}</tr>)}</tbody></table></div>
      <div className="wb-retention-inspection" role="status"><div><span>{group.week} group · Week {returnWeeks[selected.week]}</span><strong>{previewRate(returned, group.size)}</strong></div><p><b>{returned} of {group.size}</b> original browser identities returned in this particular week. Each browser counts once; a return in an earlier week is not required.</p></div>
      <p className="wb-footnote">Not observed means the follow-up week is not complete by Oct 18, 2026. These groups are too small to establish a reliable trend or a design effect.</p>
    </PreviewPanel>
  </>
}

const feedbackExamples = [
  { title: "Ranking looks incorrect", type: "Data issue", state: "New", context: "Rankings · 3×3 · NCR · average", message: "My average looks different from the result I expected. Could you check which results are included?", source: "Visitor-selected category · not yet verified", next: "Check the reported result against the data snapshot before confirming an error." },
  { title: "Cannot find event control", type: "UX feedback", state: "Reviewing", context: "Statistics · mobile", message: "I wanted to switch cubing events but could not find the event selector on my phone.", source: "Visitor-selected category · review in progress", next: "Inspect the control on mobile. One report is evidence of this visitor's experience, not every visitor's." },
] as const
function FeedbackPreview() {
  const [selected, setSelected] = useState(0), report = feedbackExamples[selected]
  return <PreviewPanel title="Feedback inbox" note="Two invented reports · selection preview only; no real submissions or status changes">
    <div className="wb-preview-split"><div className="wb-feedback-preview-list" role="group" aria-label="Example feedback reports">{feedbackExamples.map((item, i) => <button type="button" key={item.title} aria-pressed={i === selected} className={selected === i ? "is-active" : ""} onClick={() => setSelected(i)}><span className="wb-feedback-preview-meta"><span>{item.type}</span><span className="wb-badge">{item.state}</span></span><strong>{item.title}</strong><small>{item.context}</small></button>)}</div>
      <article className="wb-preview-detail" aria-label="Selected feedback report"><span className="wb-badge">Invented report</span><h3>{report.title}</h3><blockquote>{report.message}</blockquote><dl><dt>Attached page context</dt><dd>{report.context}</dd><dt>Category</dt><dd>{report.type}<small>{report.source}</small></dd><dt>Next review action</dt><dd>{report.next}</dd></dl></article>
    </div>
    <details><summary>Proposed visitor reporting flow</summary><ol className="wb-checklist"><li>Sign in, then choose Report a problem or Suggest an improvement.</li><li>Describe the task, what happened and what was expected. Suggestions describe the underlying need.</li><li>Review the message and attached page context before submitting.</li></ol><p>This flow is a proposal for review. No visitor form, submission endpoint, AI categorization or public tracking is activated.</p></details>
  </PreviewPanel>
}
