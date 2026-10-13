import { findRegion, formatNumber, type StrengthRegionGroup, type RankingFormat, type StrengthCoverage as Coverage, type StrengthSlot } from "@pca/shared"
import { Fragment, type CSSProperties } from "react"
import { ZONE_COLORS } from "./regionColors"

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

const CompactEventScore = ({ event }: { event: StrengthRegionGroup["events"][number] }) => {
  const slots = event.slots || []

  return (
    <div className="region-card-event">
      <div className="region-card-event-main">
        <img src={`/images/${event.event_id}.svg`} alt="" aria-hidden="true" fetchPriority="low" />
        <span className="region-card-event-name" title={event.event_name}>
          {event.event_name}
        </span>
        <strong
          className="region-card-event-score"
          aria-label={`Total score ${formatNumber(event.score)}`}
        >
          {formatNumber(event.score)}
        </strong>
      </div>
      <div
        className="region-card-event-ranks"
        aria-label={`Scoring ranks: ${slots.map(rankLabel).join(", ")}`}
      >
        {slots.map((slot, index) => (
          <Fragment key={`${event.event_id}-${index}`}>
            <span
              className={slot.is_penalty ? "penalty" : ""}
              title={slot.is_penalty ? "Empty-slot penalty rank" : undefined}
            >
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
    </div>
  )
}

const AVAILABLE_REGION_MAPS = new Set([
  "NCR",
  "CAR",
  "01",
  "02",
  "03",
  "4A",
  "4B",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
  "13",
  "18",
  "BARMM",
])

const RegionMapPlaceholder = ({
  regionId,
  regionName,
  zone = "unknown",
  compact = false,
}: {
  regionId: string
  regionName: string
  zone?: string
  compact?: boolean
}) => {
  const hasMap = AVAILABLE_REGION_MAPS.has(regionId)
  return (
    <div
      className={`region-card-map-placeholder ${hasMap ? "has-map" : ""}${compact ? " compact" : ""}`}
      aria-hidden={compact || undefined}
      title={
        compact
          ? undefined
          : hasMap
            ? `${regionName} map`
            : `${regionName} map icon placeholder`
      }
      style={
        hasMap
          ? {
              color: ZONE_COLORS[zone] || ZONE_COLORS.unknown,
              "--region-map-url": `url("/images/regions/${regionId}.svg")`,
            } as CSSProperties
          : undefined
      }
    >
      {hasMap ? (
        <span className="region-card-map-silhouette" aria-hidden="true" />
      ) : (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M28 6 40 10 38 20 47 25 41 34 44 43 33 57 24 48 15 51 18 39 10 32 18 24 16 13Z" />
        </svg>
      )}
    </div>
  )
}

export const RegionCards = ({ regions }: { regions: StrengthRegionGroup[] }) => (
  <div className="region-card-grid" aria-label="Best events by region">
    {(regions || [])
      .filter(group => group?.region && Array.isArray(group.events))
      .map(group => {
        const region = findRegion(group.region.id)
        const visibleEvents = group.events.slice(0, 3)
        const remainingEvents = group.events.slice(3)
        return (
          <article className="region-card" key={group.region.id}>
            <header className="region-card-header">
              <RegionMapPlaceholder
                regionId={group.region.id}
                regionName={region?.fullName || group.region.name}
                zone={region?.zone}
              />
              <RegionTag
                regionId={group.region.id}
                regionName={group.region.name}
                variant="detailed"
              />
            </header>
            <div className="region-card-events">
              {visibleEvents.length ? (
                visibleEvents.map(event => (
                  <CompactEventScore event={event} key={event.event_id} />
                ))
              ) : (
                <p className="region-card-empty">No event scores available.</p>
              )}
            </div>
            {remainingEvents.length > 0 && (
              <details className="region-card-details">
                <summary>More details</summary>
                <div className="region-card-events region-card-events-expanded">
                  {remainingEvents.map(event => (
                    <CompactEventScore event={event} key={event.event_id} />
                  ))}
                </div>
              </details>
            )}
          </article>
        )
      })}
  </div>
)


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
    <div className="statistics-table-wrap strength-table-wrap">
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
            const region = !byRegion && row.region_id ? findRegion(row.region_id) : undefined
            const eventCoverage = byRegion && row.event_id ? coverage?.[row.event_id] : undefined
            return (
              <tr key={id}>
                <td className="place-cell">
                  <span>{row.placement}</span>
                </td>
                <th scope="row" className={byRegion ? undefined : "strength-region-cell"}>
                  <span className="strength-name">
                    {byRegion && <img src={`/images/${row.event_id}.svg`} alt="" aria-hidden="true" fetchPriority="low" />}
                    {byRegion ? row.event_name : (
                      <>
                        <RegionMapPlaceholder
                          regionId={row.region_id || ""}
                          regionName={region?.fullName || row.region_name || "Region"}
                          zone={region?.zone}
                          compact
                        />
                        <RegionTag regionId={row.region_id} regionName={row.region_name} variant="detailed" />
                      </>
                    )}
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
