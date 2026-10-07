import { ACTIVE_EVENTS, findEvent, SINGLE_ONLY_EVENTS, type RankingFormat } from "@pca/shared"

import { RegionSelect } from "./RegionSelect"

interface RankingNavProps {
  event: string
  format: RankingFormat
  region?: string
  onEventChange: (event: string) => void
  onFormatChange: (format: RankingFormat) => void
  onRegionChange: (region: string | undefined) => void
}

export function RankingNav({ event, format, region, onEventChange, onFormatChange, onRegionChange }: RankingNavProps) {
  const selected = findEvent(event)
  const formatButton = (value: RankingFormat, label: string, rounded: string) => (
    <button
      type="button"
      className={`px-5 py-2 ${rounded} transition-colors duration-300 ${format === value ? "bg-blue-dark" : "bg-blue"} hover:bg-blue-dark text-sm text-white`}
      aria-pressed={format === value}
      onClick={() => onFormatChange(value)}
    >
      {label}
    </button>
  )

  return (
    <div className="rankings-nav mx-4 my-5 font-rubik">
      <div className="events-menu flex flex-row flex-wrap">
        {ACTIVE_EVENTS.map(item => (
          <button
            type="button"
            className={`event-icon mb-1 ${event === item.id ? "active" : ""}`}
            key={item.id}
            aria-label={`Select ${item.name}`}
            aria-pressed={event === item.id}
            onClick={() => onEventChange(item.id)}
          >
            <img src={`/images/${item.id}.svg`} alt="" aria-hidden="true" width={28} height={28} fetchPriority="low" />
            <span className="event-tooltip" role="tooltip">
              {item.name}
            </span>
          </button>
        ))}
      </div>
      {selected && (
        <div className="selected-event-name text-gray-600" aria-live="polite">
          <img src={`/images/${selected.id}.svg`} alt="" aria-hidden="true" fetchPriority="low" />
          <strong>{selected.name}</strong>
        </div>
      )}

      <RegionSelect
        className="mb-3"
        label="Region"
        includeNational
        value={region ?? "PH"}
        onChange={value => onRegionChange(value === "PH" ? undefined : value)}
      />

      {!SINGLE_ONLY_EVENTS.has(event) && (
        <div className="format-menu inline-flex font-rubik" role="group" aria-label="Result type">
          {formatButton("single", "Single", "rounded-l-md")}
          {formatButton("average", "Average", "rounded-r-md")}
        </div>
      )}
    </div>
  )
}
