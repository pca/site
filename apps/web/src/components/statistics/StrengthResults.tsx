import { formatNumber, type RankingFormat, type StrengthCoverage as Coverage, type StrengthSlot } from "@pca/shared"
import { Fragment } from "react"

import { RegionTag } from "./RegionTag"

export function FormatToggle({
  value,
  onChange,
  averageDisabled = false,
}: {
  value: RankingFormat
  onChange: (format: RankingFormat) => void
  averageDisabled?: boolean
}) {
  return (
    <fieldset className="statistics-format">
      <legend>Result type</legend>
      <div>
        <button type="button" className={value === "single" ? "active" : ""} aria-pressed={value === "single"} onClick={() => onChange("single")}>
          Single
        </button>
        <button
          type="button"
          className={value === "average" ? "active" : ""}
          aria-pressed={value === "average"}
          disabled={averageDisabled}
          title={averageDisabled ? "This event has no current average ranking." : undefined}
          onClick={() => onChange("average")}
        >
          Average
        </button>
      </div>
    </fieldset>
  )
}

const rankLabel = (slot: StrengthSlot) => (slot.national_rank == null ? "Not available" : formatNumber(slot.national_rank))

function ScoreDetails({ slots }: { slots: StrengthSlot[] }) {
  return (
    <div className="score-breakdown">
      <div className="score-ranks" aria-label={`Five scoring ranks: ${slots.map(rankLabel).join(", ")}`}>
        {slots.map((slot, index) => (
          <Fragment key={`${slot.wca_id || "penalty"}-rank-${index}`}>
            <span className={slot.is_penalty ? "penalty" : ""} title={slot.is_penalty ? "Empty-slot penalty rank" : undefined}>
              {rankLabel(slot)}
            </span>
            {index < slots.length - 1 && (
              <span className="score-rank-separator" aria-hidden="true">
                ·
              </span>
            )}
          </Fragment>
        ))}
      </div>
      <details className="score-details">
        <summary>More details</summary>
        <ol>
          {slots.map((slot, index) => (
            <li className={slot.is_penalty ? "penalty" : ""} key={`${slot.wca_id || "penalty"}-${index}`}>
              <span className="slot-number">{index + 1}</span>
              <span className="slot-person">
                {slot.is_penalty ? (
                  <strong>Empty-slot penalty</strong>
                ) : (
                  <>
                    <strong>{slot.name}</strong>
                    <a href={`https://www.worldcubeassociation.org/persons/${slot.wca_id}`} target="_blank" rel="noreferrer">
                      {slot.wca_id}
                    </a>
                  </>
                )}
              </span>
              <span className="slot-rank">
                National rank <strong>{formatNumber(slot.national_rank)}</strong>
              </span>
            </li>
          ))}
        </ol>
      </details>
    </div>
  )
}

export interface StrengthTableRow {
  placement: number
  score: number
  contributor_count: number
  slots: StrengthSlot[]
  region_id?: string
  region_name?: string
  event_id?: string
  event_name?: string
}

/** kind "event" lists regions for one event; "region" lists events for one region. */
export function StrengthResults({
  rows,
  kind,
  coverage,
}: {
  rows?: StrengthTableRow[]
  kind: "event" | "region"
  coverage?: Record<string, Coverage>
}) {
  if (!rows?.length) {
    return <p className="statistics-empty">No results are available for this selection.</p>
  }
  const byRegion = kind === "region"
  return (
    <div className="statistics-table-wrap">
      <table className={`statistics-table strength-table strength-table--${byRegion ? "events" : "regions"}`}>
        <caption className="sr-only">{byRegion ? "Regional strength by event" : "Regional strength by region"}</caption>
        <colgroup>
          <col className="strength-col-place" />
          <col className="strength-col-subject" />
          <col className="strength-col-contributors" />
          <col className="strength-col-score" />
          {byRegion && <col className="strength-col-coverage" />}
          <col className="strength-col-ranks" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Place</th>
            <th scope="col">{byRegion ? "Event" : "Region"}</th>
            <th scope="col">Contributors</th>
            <th scope="col">Score</th>
            {byRegion && <th scope="col">Home-region coverage</th>}
            <th scope="col">Scoring ranks</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const id = byRegion ? row.event_id : row.region_id
            const eventCoverage = byRegion && row.event_id ? coverage?.[row.event_id] : undefined
            return (
              <tr key={id}>
                <td className="place-cell">
                  <span>{row.placement}</span>
                </td>
                <th scope="row">
                  <span className="strength-name">
                    {byRegion && <img src={`/images/${row.event_id}.svg`} alt="" aria-hidden="true" fetchPriority="low" />}
                    {byRegion ? row.event_name : <RegionTag regionId={row.region_id} regionName={row.region_name} variant="detailed" />}
                  </span>
                </th>
                <td>{row.contributor_count} of 5</td>
                <td className="score-cell">{formatNumber(row.score)}</td>
                {byRegion && (
                  <td>
                    {eventCoverage?.matched_home_region !== undefined && eventCoverage?.ranked_competitors !== undefined
                      ? `${formatNumber(eventCoverage.matched_home_region)} of ${formatNumber(eventCoverage.ranked_competitors)}`
                      : "Not available"}
                  </td>
                )}
                <td>
                  <ScoreDetails slots={row.slots || []} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function StrengthCoverage({ coverage }: { coverage?: Coverage }) {
  if (!coverage || Object.keys(coverage).length === 0) return null
  const ranked = coverage.ranked_competitors
  const matched = coverage.matched_home_region
  if (ranked === undefined || matched === undefined) return null
  const missing = Math.max(0, ranked - matched)
  return (
    <p className="statistics-coverage">
      <strong>Coverage:</strong> {formatNumber(matched)} of {formatNumber(ranked)} ranked Filipino competitors were
      matched to a selected home region.
      {missing > 0 ? ` ${formatNumber(missing)} could not be included in a regional score.` : ""}
    </p>
  )
}
