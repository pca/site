import { findRegion, formatNumber, shortRegionName, type GrowthCoverage as Coverage, type GrowthMetric, type GrowthSeries, type PopularEvents, type PopularEventSeries } from "@pca/shared"
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"

import { getRegionColor } from "./regionColors"
import { RegionTag } from "./RegionTag"
import { formatAverageChange, threeYearComparison } from "./growthComparison"
import { growthPlotMargins, growthYearLabelLayout, omitGrowthDisplayYears } from "./growthDisplay"

type Point = { year: number; value?: number; participations?: number; unique_competitors?: number }
type Series = { region_id?: string; region_name?: string; event_id?: string; event_name?: string; values: Point[] }
type ValueKey = "value" | "participations" | "unique_competitors"
type ChartStyle = { color: string; dash: string; groupId?: string }
export type YearRange = "5" | "10" | "15" | "all"
type RangeProps = { yearRange: YearRange; onYearRangeChange: (range: YearRange) => void }

const CHART_COLORS = [
  "#168BFF",
  "#FF8A00",
  "#8B5CF6",
  "#10B981",
  "#F43F5E",
  "#EAB308",
]

const DEFAULT_HIDDEN_EVENTS = new Set(["magic", "mmagic", "333mbo", "333ft"])

const EVENT_GROUPS = [
  {
    id: "cube",
    label: "Cube events",
    eventIds: ["333", "222", "444", "555", "666", "777"],
    colors: ["#168BFF", "#4DA3FF", "#0070D9", "#005EB8", "#004B93", "#003A73"],
  },
  {
    id: "variants",
    label: "3×3 variants",
    eventIds: ["333oh", "333fm", "333ft"],
    colors: ["#2DD4BF", "#14B8A6", "#0F766E"],
  },
  {
    id: "blindfolded",
    label: "Blindfolded",
    eventIds: ["333bf", "444bf", "555bf", "333mbf", "333mbo"],
    colors: ["#C4B5FD", "#A78BFA", "#8B5CF6", "#7C3AED", "#5B21B6"],
  },
  {
    id: "other",
    label: "Other puzzles",
    eventIds: [
      "clock",
      "minx",
      "pyram",
      "skewb",
      "sq1",
      "magic",
      "mmagic",
      "fto",
    ],
    colors: [
      "#FDE047",
      "#FACC15",
      "#FBBF24",
      "#F59E0B",
      "#F97316",
      "#EA580C",
      "#DC2626",
      "#BE123C",
    ],
  },
]

const EVENT_LINE_PATTERNS = [
  "",
  "10 4",
  "3 3",
  "12 4 2 4",
  "6 3",
  "2 3",
  "14 3 3 3",
  "1 3",
]

const EVENT_STYLES = EVENT_GROUPS.reduce<Record<string, ChartStyle>>((styles, group) => {
  group.eventIds.forEach((eventId, index) => {
    styles[eventId] = {
      color: group.colors[index],
      dash: EVENT_LINE_PATTERNS[index % EVENT_LINE_PATTERNS.length],
      groupId: group.id,
    }
  })
  return styles
}, {})

const REGION_LINE_PATTERNS = ["", "10 5", "3 4", "12 4 2 4", "7 3", "2 3"]
const YEAR_RANGE_OPTIONS: { value: YearRange; label: string }[] = [
  { value: "5", label: "5 years" },
  { value: "10", label: "10 years" },
  { value: "15", label: "15 years" },
  { value: "all", label: "All years" },
]

const rangeSize = (value: YearRange) =>
  value === "all" ? Number.POSITIVE_INFINITY : Number(value)

const chartStyles = (series: Series[]): ChartStyle[] => {
  const zoneCounts: Record<string, number> = {}
  return series.map((item, index) => {
    if (!item.region_id || item.region_id === "national") {
      return (
        EVENT_STYLES[item.event_id || ""] || {
          color: CHART_COLORS[index % CHART_COLORS.length],
          dash: EVENT_LINE_PATTERNS[index % EVENT_LINE_PATTERNS.length],
          groupId: "other",
        }
      )
    }
    const region = findRegion(item.region_id)
    const zone = region?.zone || "unknown"
    const zoneIndex = zoneCounts[zone] || 0
    zoneCounts[zone] = zoneIndex + 1
    return {
      color: getRegionColor(item.region_id, zone),
      dash: REGION_LINE_PATTERNS[zoneIndex % REGION_LINE_PATTERNS.length],
    }
  })
}

const latestPoint = <T,>(series: { values: T[] }) => series.values?.[series.values.length - 1]

export const topRegionalSeries = (series?: GrowthSeries[]) =>
  [...(series || [])]
    .filter(item => item.region_id !== "national")
    .sort(
      (left, right) =>
        (latestPoint(right)?.value || 0) - (latestPoint(left)?.value || 0),
    )
    .slice(0, 6)

export const topEventSeries = (events?: PopularEventSeries[]) =>
  (events || [])
    .map(event => ({
      ...event,
      total: event.values.reduce((sum, point) => sum + point.participations, 0),
    }))
    .sort((left, right) => right.total - left.total)

const ChartLineSwatch = ({ style }: { style: ChartStyle }) => (
  <svg className="chart-line-swatch" viewBox="0 0 22 6" aria-hidden="true">
    <line
      x1="1"
      x2="21"
      y1="3"
      y2="3"
      stroke={style.color}
      strokeDasharray={style.dash || undefined}
    />
  </svg>
)

const EventChartLegend = ({ series, styles, selectedIds, onToggle, onSelectAll, onClearAll, onReset }: {
  series: Series[]
  styles: ChartStyle[]
  selectedIds: string[]
  onToggle: (ids: string[]) => void
  onSelectAll: () => void
  onClearAll: () => void
  onReset: () => void
}) => {
  const groups = EVENT_GROUPS.map(group => ({
    ...group,
    items: series
      .map((item, index) => ({ item, style: styles[index] }))
      .filter(({ style }) => style.groupId === group.id)
      .sort(
        (left, right) =>
          group.eventIds.indexOf(left.item.event_id || "") -
          group.eventIds.indexOf(right.item.event_id || ""),
      ),
  })).filter(group => group.items.length)

  return (
    <div className="chart-region-controls">
      <div className="chart-region-toolbar">
        <p>Events shown <strong>{selectedIds.length}</strong><span> · Select to show or hide</span></p>
        <div>
          <button type="button" disabled={selectedIds.length === series.length} onClick={onSelectAll}>Select all</button>
          <button type="button" disabled={!selectedIds.length} onClick={onClearAll}>Clear all</button>
          <button type="button" onClick={onReset}>Reset</button>
        </div>
      </div>
      <div className="chart-region-legend chart-event-chip-legend" aria-label="Events grouped by event family">
        {groups.map(group => {
          const ids = group.items.map(({ item }) => item.event_id!)
          const selectedCount = ids.filter(id => selectedIds.includes(id)).length
          const allSelected = selectedCount === ids.length
          return (
            <div className="chart-legend-group" role="group" aria-label={group.label} key={group.id}>
              <button
                type="button"
                className="chart-zone-toggle"
                aria-pressed={allSelected ? true : selectedCount ? "mixed" : false}
                aria-label={`${allSelected ? "Clear" : "Select"} all ${group.label.toLowerCase()}`}
                onClick={() => onToggle(ids)}
              >
                <span>{group.label}</span>
                <small aria-hidden="true">{selectedCount}/{ids.length}</small>
              </button>
              <div>
                {group.items.map(({ item, style }) => (
                  <button
                    type="button"
                    className="chart-region-chip"
                    key={item.event_id}
                    aria-pressed={selectedIds.includes(item.event_id!)}
                    style={{ "--region-color": style.color } as CSSProperties}
                    onClick={() => onToggle([item.event_id!])}
                  >
                    <i aria-hidden="true" />
                    {item.event_name}
                    <ChartLineSwatch style={style} />
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const REGION_ZONES = [
  { id: "luzon", label: "Luzon" },
  { id: "visayas", label: "Visayas" },
  { id: "mindanao", label: "Mindanao" },
] as const

function RegionChartLegend({ series, selectedIds, totalRegions, omittedRegionCount, onToggle, onToggleGroup, onSelectAll, onClearAll, onReset }: {
  series: GrowthSeries[]
  selectedIds: string[]
  totalRegions: number
  omittedRegionCount: number
  onToggle: (id: string) => void
  onToggleGroup: (ids: string[]) => void
  onSelectAll: () => void
  onClearAll: () => void
  onReset: () => void
}) {
  return (
    <div className="chart-region-controls">
      <div className="chart-region-toolbar">
        <p>Regions shown <strong>{selectedIds.length}</strong><span> · Select to show or hide</span></p>
        <div>
          <button type="button" disabled={selectedIds.length === totalRegions} onClick={onSelectAll}>Select all</button>
          <button type="button" disabled={!selectedIds.length} onClick={onClearAll}>Clear all</button>
          <button type="button" onClick={onReset}>Reset</button>
        </div>
      </div>
      <div className="chart-region-legend" aria-label="Regions grouped by zone">
        {REGION_ZONES.map(zone => {
          const items = series.filter(item => findRegion(item.region_id)?.zone === zone.id)
          if (!items.length) return null
          const ids = items.map(item => item.region_id)
          const selectedCount = ids.filter(id => selectedIds.includes(id)).length
          const allSelected = selectedCount === ids.length
          const action = allSelected ? "Clear" : "Select"
          return (
            <div className="chart-legend-group" role="group" aria-label={zone.label} key={zone.id}>
              <button
                type="button"
                className="chart-zone-toggle"
                aria-pressed={allSelected ? true : selectedCount ? "mixed" : false}
                aria-label={`${action} all shown ${zone.label} regions`}
                title={`${action} the ${ids.length} visible ${zone.label} regions`}
                onClick={() => onToggleGroup(ids)}
              >
                <span>{zone.label}</span>
                <small aria-hidden="true">{selectedCount}/{ids.length}</small>
              </button>
              <div>
                {items.map(item => {
                  const region = findRegion(item.region_id)
                  return (
                    <button
                      type="button"
                      className="chart-region-chip"
                      key={item.region_id}
                      aria-pressed={selectedIds.includes(item.region_id)}
                      aria-label={region ? `${region.tag} · ${region.fullName}` : item.region_name}
                      style={{ "--region-color": getRegionColor(item.region_id, zone.id) } as CSSProperties}
                      onClick={() => onToggle(item.region_id)}
                    >
                      <i aria-hidden="true" />
                      {region ? `${region.tag} · ${region.fullName}` : item.region_name}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      {omittedRegionCount > 0 && (
        <p className="chart-region-note">
          {omittedRegionCount === 5 ? "Five" : omittedRegionCount} {omittedRegionCount === 1 ? "region omitted" : "regions omitted"} due to zero activity for the entire history.
        </p>
      )}
    </div>
  )
}

const valueFor = (series: Series, year: number, valueKey: ValueKey) => {
  const point = series.values.find(item => item.year === year)
  return point ? Number(point[valueKey] || 0) : 0
}

const sharePercentage = (value: number | null, total: number) =>
  total ? (Number(value) / total) * 100 : 0

const formatShare = (value: number | null, total: number) =>
  `${sharePercentage(value, total).toFixed(1)}%`

const filterSeriesByYearRange = <T extends Series,>(series: T[], yearRange: YearRange): T[] => {
  if (yearRange === "all") return series
  const availableYears = series.flatMap(item =>
    item.values.map(point => Number(point.year)),
  )
  if (!availableYears.length) return series
  const latestYear = Math.max(...availableYears)
  const firstYear = latestYear - Number(yearRange) + 1
  return series.map(item => ({
    ...item,
    values: item.values.filter(point => Number(point.year) >= firstYear),
  }))
}

const omitInactiveYears = <T extends Series,>(series: T[], valueKey: ValueKey): T[] => {
  const activeYears = new Set<number>()
  series.forEach(item => {
    item.values.forEach(point => {
      if (Number(point[valueKey] || 0) > 0) {
        activeYears.add(point.year)
      }
    })
  })
  return series.map(item => ({
    ...item,
    values: item.values.filter(point => activeYears.has(point.year)),
  }))
}

const YearRangeControl = ({ value, onChange }: { value: YearRange; onChange: (range: YearRange) => void }) => (
  <fieldset className="chart-range-control">
    <legend>Years shown</legend>
    <div>
      {YEAR_RANGE_OPTIONS.map(option => (
        <button
          type="button"
          className={value === option.value ? "active" : ""}
          aria-pressed={value === option.value}
          key={option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  </fieldset>
)

const LineChart = ({
  series,
  valueKey = "value",
  title,
  yearRange,
  onYearRangeChange,
  height = 290,
  className = "",
  evenYearSpacing = false,
  legend,
  seriesStyles,
}: { series: Series[]; valueKey?: ValueKey; title: string; height?: number; className?: string; evenYearSpacing?: boolean; legend?: ReactNode; seriesStyles?: ChartStyle[] } & RangeProps) => {
  const chartId = useId()
  const previousYearRange = useRef(yearRange)
  const chartContainer = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(900)
  const [valueLabelWidth, setValueLabelWidth] = useState(32)
  const years = useMemo(
    () =>
      [
        ...new Set(
          series.flatMap(item => item.values.map(point => point.year)),
        ),
      ].sort(),
    [series],
  )
  const sideMargins = growthPlotMargins(valueLabelWidth)
  const yearLabels = growthYearLabelLayout(years.length, width - sideMargins.left - sideMargins.right)
  const margin = { top: 16, ...sideMargins, bottom: yearLabels.bottomMargin }
  const maxValue = Math.max(
    1,
    ...series.flatMap(item =>
      item.values.map(point => Number(point[valueKey] || 0)),
    ),
  )
  const x = (year: number) =>
    margin.left +
    (evenYearSpacing
      ? years.indexOf(year) / Math.max(1, years.length - 1)
      : (year - years[0]) / Math.max(1, years[years.length - 1] - years[0])) *
      (width - margin.left - margin.right)
  const y = (value: number) =>
    height -
    margin.bottom -
    (value / maxValue) * (height - margin.top - margin.bottom)
  const gridValues = [
    ...new Set(
      [0, 0.25, 0.5, 0.75, 1].map(ratio => Math.round(maxValue * ratio)),
    ),
  ]
  const styles = seriesStyles || chartStyles(series)
  const rangeAnimation =
    previousYearRange.current === yearRange
      ? ""
      : rangeSize(yearRange) < rangeSize(previousYearRange.current)
        ? "chart-range-zoom-in"
        : "chart-range-zoom-out"

  useEffect(() => {
    previousYearRange.current = yearRange
  }, [yearRange])

  const hasChartData = series.length > 0 && years.length > 0
  useEffect(() => {
    const container = chartContainer.current
    if (!container) return
    let disposed = false
    const measureValueLabels = () => {
      if (disposed) return
      const labels = container.querySelectorAll<SVGTextElement>(".chart-value-label")
      setValueLabelWidth(Math.ceil(Math.max(0, ...Array.from(labels, label => label.getComputedTextLength()))))
    }
    measureValueLabels()
    void document.fonts.ready.then(measureValueLabels)
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) {
        setWidth(Math.round(entry.contentRect.width))
      }
    })
    observer.observe(container)
    return () => {
      disposed = true
      observer.disconnect()
    }
  }, [hasChartData, maxValue])

  if (!hasChartData && !legend) {
    return (
      <p className="statistics-empty">
        There is no chart data for this selection.
      </p>
    )
  }

  return (
    <figure className={`statistics-chart ${className}`.trim()}>
      <div className="statistics-chart-heading">
        <figcaption>{title}</figcaption>
        <YearRangeControl value={yearRange} onChange={onYearRangeChange} />
      </div>
      {legend || (
        <div className="chart-legend" aria-label="Chart legend">
          {series.map((item, index) => (
            <span key={item.region_id || item.event_id}>
              {item.event_id ? <><ChartLineSwatch style={styles[index]} />{item.event_name}</> : <RegionTag
                regionId={item.region_id}
                regionName={item.region_name}
                color={styles[index].color}
              />}
            </span>
          ))}
        </div>
      )}
      {hasChartData ? <div className="chart-scroll" ref={chartContainer}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-labelledby={`${chartId}-title ${chartId}-desc`}
        >
          <title id={`${chartId}-title`}>{title}</title>
          <desc id={`${chartId}-desc`}>
            A line chart from {years[0]} through {years[years.length - 1]}.
            Exact values are available in the table below.
          </desc>
          <defs>
            <clipPath id={`${chartId}-clip`}>
              <rect
                x={margin.left - 4}
                y={margin.top - 4}
                width={width - margin.left - margin.right + 8}
                height={height - margin.top - margin.bottom + 8}
              />
            </clipPath>
          </defs>
          <g
            className={rangeAnimation ? "chart-range-axis-transition" : ""}
            key={`axis-${yearRange}`}
          >
            {gridValues.map(value => (
              <g key={value}>
                <line
                  className="chart-grid"
                  x1={margin.left}
                  x2={width - margin.right}
                  y1={y(value)}
                  y2={y(value)}
                />
                <text
                  className="chart-axis-label chart-value-label"
                  x={margin.left - 6}
                  y={y(value) + 4}
                  textAnchor="end"
                >
                  {formatNumber(value)}
                </text>
              </g>
            ))}
            {years.map(year => (
              <text
                className="chart-axis-label chart-year-label"
                key={year}
                x={x(year)}
                y={yearLabels.vertical ? height - margin.bottom + 12 : height - 16}
                textAnchor={yearLabels.vertical ? "end" : "middle"}
                transform={yearLabels.vertical ? `rotate(-90 ${x(year)} ${height - margin.bottom + 12})` : undefined}
                style={yearLabels.vertical ? { fontSize: yearLabels.fontSize } : undefined}
              >
                {year}
              </text>
            ))}
          </g>
          <g
            className={rangeAnimation}
            clipPath={`url(#${chartId}-clip)`}
            key={`series-${yearRange}`}
          >
            {series.map((item, index) => {
              const style = styles[index]
              const visualOffset = item.event_id ? -index * 0.55 : 0
              const points = years
                .map(year => `${x(year)},${y(valueFor(item, year, valueKey))}`)
                .join(" ")
              return (
                <g
                  key={item.region_id || item.event_id}
                  transform={
                    visualOffset ? `translate(0 ${visualOffset})` : undefined
                  }
                >
                  <polyline
                    className="chart-line"
                    points={points}
                    stroke={style.color}
                    strokeDasharray={style.dash || undefined}
                    strokeDashoffset={index * 2}
                  />
                  {years.map(year => (
                    <circle
                      key={year}
                      cx={x(year)}
                      cy={y(valueFor(item, year, valueKey))}
                      className="chart-point"
                      r="2.5"
                      fill={style.color}
                    >
                      <title>{`${item.region_name || item.event_name}, ${year}: ${formatNumber(valueFor(item, year, valueKey))}`}</title>
                    </circle>
                  ))}
                </g>
              )
            })}
          </g>
        </svg>
      </div> : <p className="statistics-empty" role="status">Select {valueKey === "participations" ? "an event" : "a region"} above to show its trend and exact values.</p>}
    </figure>
  )
}

function HistoryTableScroll({ children, titleId, isRegional }: { children: ReactNode; titleId: string; isRegional: boolean }) {
  const scrollArea = useRef<HTMLDivElement>(null)
  const topScroll = useRef<HTMLDivElement>(null)
  const scrollWidth = useRef<HTMLDivElement>(null)
  const [hasOverflow, setHasOverflow] = useState(false)

  useEffect(() => {
    const area = scrollArea.current
    const top = topScroll.current
    const spacer = scrollWidth.current
    const table = area?.querySelector("table")
    if (!area || !top || !spacer || !table) return
    const measure = () => {
      spacer.style.width = `${area.scrollWidth}px`
      setHasOverflow(area.scrollWidth > area.clientWidth + 1)
      top.scrollLeft = area.scrollLeft
    }
    const fromTop = () => { if (area.scrollLeft !== top.scrollLeft) area.scrollLeft = top.scrollLeft }
    const fromTable = () => { if (top.scrollLeft !== area.scrollLeft) top.scrollLeft = area.scrollLeft }
    const observer = new ResizeObserver(measure)
    observer.observe(area)
    observer.observe(table)
    top.addEventListener("scroll", fromTop, { passive: true })
    area.addEventListener("scroll", fromTable, { passive: true })
    measure()
    return () => {
      observer.disconnect()
      top.removeEventListener("scroll", fromTop)
      area.removeEventListener("scroll", fromTable)
    }
  }, [])

  return (
    <div className="statistics-table-wrap history-table-wrap history-table-wrap--top-scroll">
      <h2 id={titleId} className="history-table-title">Exact values shown in the chart</h2>
      <div ref={topScroll} className="history-table-top-scroll" hidden={!hasOverflow} tabIndex={0} role="region" aria-label={`Scroll ${isRegional ? "regional" : "event"} table horizontally`}>
        <div ref={scrollWidth} />
      </div>
      <div ref={scrollArea} className="history-table-scroll" tabIndex={0} role="region" aria-label={isRegional ? "Regional history values" : "Event history values"}>
        {children}
      </div>
    </div>
  )
}

const HistoryTable = ({ series, valueKey = "value", secondaryKey, seriesStyles, shareSeries = series }: { series: Series[]; valueKey?: ValueKey; secondaryKey?: ValueKey; seriesStyles?: ChartStyle[]; shareSeries?: Series[] }) => {
  const titleId = useId()
  const years = [
    ...new Set(series.flatMap(item => item.values.map(point => point.year))),
  ].sort()
  const styles = seriesStyles || chartStyles(series)
  const totalsByYear = secondaryKey
    ? Object.fromEntries(
        years.map(year => [
          year,
          {
            primary: shareSeries.reduce(
              (sum, item) => sum + valueFor(item, year, valueKey),
              0,
            ),
            secondary: shareSeries.reduce(
              (sum, item) => sum + valueFor(item, year, secondaryKey),
              0,
            ),
          },
        ]),
      )
    : {}
  const shareRanges = secondaryKey
    ? series.map(item => {
        const columnShares = years.map(year => {
          const primaryShare = sharePercentage(
            valueFor(item, year, valueKey),
            totalsByYear[year].primary,
          )
          const secondaryShare = sharePercentage(
            valueFor(item, year, secondaryKey),
            totalsByYear[year].secondary,
          )
          return (primaryShare + secondaryShare) / 2
        })
        return {
          minimum: Math.min(...columnShares),
          maximum: Math.max(...columnShares),
        }
      })
    : []
  const minimumWidth = series[0]?.event_id
    ? Math.max(912, 90 + series.length * 125)
    : 840
  const isRegional = Boolean(series[0]?.region_id)
  return (
    <HistoryTableScroll titleId={titleId} isRegional={isRegional}>
      <table
        className={`statistics-table history-table${isRegional ? " history-table--regions" : ""}`}
        aria-labelledby={titleId}
        style={{
          "--history-min-width": `${minimumWidth}px`,
          "--history-mobile-min-width": `${48 + series.length * 48}px`,
        } as CSSProperties}
      >
        {isRegional && (
          <colgroup>
            <col className="history-col-year" />
            {series.map(item => <col className="history-col-region" key={item.region_id} />)}
            <col className="history-col-spacer" />
          </colgroup>
        )}
        <thead>
          <tr>
            <th scope="col">Year</th>
            {series.map((item, index) => (
              <th scope="col" key={item.region_id || item.event_id}>
                {item.region_id ? (
                  <RegionTag
                    regionId={item.region_id}
                    regionName={item.region_name}
                    variant="table"
                    color={styles[index].color}
                  />
                ) : (
                  <span className="statistics-event-series-label">
                    <ChartLineSwatch style={styles[index]} />
                    {shortRegionName(item.event_name || "")}
                  </span>
                )}
                {secondaryKey && <small>Participation / competitors</small>}
              </th>
            ))}
            {isRegional && <th className="history-table-spacer" scope="col" aria-hidden="true" />}
          </tr>
        </thead>
        <tbody>
          {years.map(year => (
            <tr key={year}>
              <th scope="row">{year}</th>
              {series.map((item, index) => {
                const primary = valueFor(item, year, valueKey)
                const secondary = secondaryKey
                  ? valueFor(item, year, secondaryKey)
                  : null
                const primaryShare = secondaryKey
                  ? sharePercentage(primary, totalsByYear[year].primary)
                  : 0
                const secondaryShare = secondaryKey
                  ? sharePercentage(secondary, totalsByYear[year].secondary)
                  : 0
                const averageShare = (primaryShare + secondaryShare) / 2
                const shareRange = secondaryKey ? shareRanges[index] : undefined
                const relativeShare = !shareRange
                  ? 0
                  : shareRange.maximum === shareRange.minimum
                    ? 0.5
                    : (averageShare - shareRange.minimum) /
                      (shareRange.maximum - shareRange.minimum)
                const shareTint = 8 + relativeShare * 36
                return (
                  <td key={item.region_id || item.event_id}>
                    {secondaryKey ? (
                      <span
                        className="history-value-pair"
                        style={{
                          "--series-color": styles[index].color,
                          "--share-tint": `${shareTint.toFixed(1)}%`,
                        } as CSSProperties}
                      >
                        <strong className="history-share-value">
                          {formatShare(primary, totalsByYear[year].primary)} /{" "}
                          {formatShare(secondary, totalsByYear[year].secondary)}
                        </strong>
                        <small className="history-count-value">
                          {formatNumber(primary)} / {formatNumber(secondary)}
                        </small>
                      </span>
                    ) : (
                      formatNumber(primary)
                    )}
                  </td>
                )
              })}
              {isRegional && <td className="history-table-spacer" aria-hidden="true" />}
            </tr>
          ))}
        </tbody>
      </table>
    </HistoryTableScroll>
  )
}

export const GrowthCoverage = ({ coverage }: { coverage?: Coverage }) => {
  if (!coverage || coverage.assigned_competitions === undefined) return null
  const assigned = Number(coverage.assigned_competitions || 0)
  const unclassified = Number(coverage.unclassified_competitions || 0)
  const total = assigned + unclassified
  const percent = total ? ((assigned / total) * 100).toFixed(1) : "0.0"
  return (
    <aside className="statistics-methodology growth-coverage" aria-label="Competition-location coverage">
      <strong>Competition-location coverage</strong>
      <p>
        {formatNumber(assigned)} of {formatNumber(total)} Philippine competitions ({percent}%) were
        automatically matched to a region.
        {unclassified > 0
          ? unclassified === 1
            ? " The one unclassified competition was a multi-city event that could not be assigned to a single host region, so it was excluded from regional totals."
            : ` ${formatNumber(unclassified)} remained unclassified and were excluded from regional totals.`
          : ""}
      </p>
    </aside>
  )
}

function LatestRegionalTable({ series, metricLabel }: { series?: GrowthSeries[]; metricLabel: string }) {
  const rows = (series || [])
    .filter(item => item.region_id !== "national")
    .map(item => ({ ...item, latest: latestPoint(item) }))
    .sort((a, b) => (b.latest?.value || 0) - (a.latest?.value || 0))
  const year = rows.find(item => item.latest)?.latest?.year
  return (
    <>
    <div className="statistics-table-wrap latest-table-wrap">
      <table className="statistics-table latest-table">
        <caption>Current year by region</caption>
        <colgroup>
          <col className="latest-col-place" />
          <col className="latest-col-region" />
          <col className="latest-col-value" />
          <col className="latest-col-change" />
          <col className="latest-col-average-change" />
          <col className="latest-col-spacer" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" aria-label="Place" title="Place">#</th>
            <th scope="col">Region</th>
            <th scope="col">{metricLabel}</th>
            <th scope="col">Change</th>
            <th scope="col" title="Change compared with the average of the previous three calendar years">Vs 3-year avg</th>
            <th className="latest-table-spacer" scope="col" aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {rows.map((item, index) => {
            const change = item.latest?.change
            const percent = item.latest?.percent_change
            const comparison = threeYearComparison(item.values, item.latest)
            return (
              <tr key={item.region_id}>
                <td className="place-cell">
                  <span className={`statistics-rank-tag medal-${index < 3 ? index + 1 : "other"}`}>{index + 1}</span>
                </td>
                <th scope="row">
                  <RegionTag regionId={item.region_id} regionName={item.region_name} variant="table" />
                </th>
                <td className="score-cell">{formatNumber(item.latest?.value)}</td>
                <td className="latest-change-cell">
                  <span>{change == null ? "—" : `${change > 0 ? "+" : ""}${formatNumber(change)}`}</span>
                  {percent != null && <small>({percent > 0 ? "+" : ""}{percent.toFixed(1)}%)</small>}
                </td>
                <td className="latest-change-cell" title={comparison
                  ? `Previous 3-year average: ${formatNumber(comparison.average)}${comparison.percent === null ? "; percentage unavailable because the average is zero" : ""}`
                  : "Requires data for all three preceding calendar years"}>
                  <span>{comparison ? formatAverageChange(comparison.change) : "—"}</span>
                  {comparison?.percent != null && <small>({formatAverageChange(comparison.percent)}%)</small>}
                </td>
                <td className="latest-table-spacer" aria-hidden="true" />
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
    <p className="latest-table-note">3-year average: {year ? `${year - 3}–${year - 1}` : "previous three calendar years"}. Current year may be incomplete.</p>
    </>
  )
}

export const RegionalGrowthResults = ({
  data,
  metricLabel,
  yearRange,
  onYearRangeChange,
}: { data: GrowthMetric; metricLabel: string } & RangeProps) => {
  const regionalSeries = (data.series || []).filter(item => item.region_id !== "national")
  const allSeries = regionalSeries
    .filter(item => item.values.some(point => point.value > 0))
    .sort((left, right) => (latestPoint(right)?.value || 0) - (latestPoint(left)?.value || 0))
  const defaultIds = allSeries.map(item => item.region_id)
  const [selection, setSelection] = useState<string[] | null>(null)
  const selectedIds = selection ?? defaultIds
  const chartSeries = filterSeriesByYearRange(omitGrowthDisplayYears(allSeries), yearRange).filter(item => selectedIds.includes(item.region_id))
  // Keep line patterns stable when another region is hidden or restored.
  const allStyles = chartStyles(allSeries)
  const selectedStyles = allStyles.filter((_, index) => selectedIds.includes(allSeries[index].region_id))
  const legendSeries = allSeries
  const toggleRegion = (id: string) => {
    setSelection(current => {
      const selected = current ?? defaultIds
      return selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id]
    })
  }
  const toggleRegionGroup = (ids: string[]) => {
    setSelection(current => {
      const selected = current ?? defaultIds
      return ids.every(id => selected.includes(id))
        ? selected.filter(id => !ids.includes(id))
        : [...new Set([...selected, ...ids])]
    })
  }
  const national = data.series?.find(item => item.region_id === "national")
  const nationalLatest = national ? latestPoint(national) : null
  const nationalPrevious = nationalLatest
    ? national?.values.find(point => point.year === nationalLatest.year - 1)
    : null
  return (
    <>
      {nationalLatest && (
        <div className="statistics-highlights">
          {nationalPrevious && (
            <div className="statistics-highlight statistics-highlight-previous">
              <span>Nationwide in {nationalPrevious.year}</span>
              <strong>{formatNumber(nationalPrevious.value)}</strong>
              <small>{metricLabel.toLowerCase()}</small>
            </div>
          )}
          <div className="statistics-highlight">
            <span>Nationwide in {nationalLatest.year}</span>
            <strong>{formatNumber(nationalLatest.value)}</strong>
            <small>{metricLabel.toLowerCase()}</small>
          </div>
        </div>
      )}
      <LineChart
        series={chartSeries}
        title={`Regions by ${metricLabel.toLowerCase()}`}
        evenYearSpacing
        yearRange={yearRange}
        onYearRangeChange={onYearRangeChange}
        seriesStyles={selectedStyles}
        legend={<RegionChartLegend
          series={legendSeries}
          selectedIds={selectedIds}
          totalRegions={allSeries.length}
          omittedRegionCount={regionalSeries.length - allSeries.length}
          onToggle={toggleRegion}
          onToggleGroup={toggleRegionGroup}
          onSelectAll={() => setSelection(allSeries.map(item => item.region_id))}
          onClearAll={() => setSelection([])}
          onReset={() => setSelection(null)}
        />}
      />
      <p className="statistics-chart-note">2021 is omitted: no recorded competition activity.</p>
      {chartSeries.length > 0 && <HistoryTable series={chartSeries} seriesStyles={selectedStyles} />}
      <LatestRegionalTable series={data.series} metricLabel={metricLabel} />
    </>
  )
}

export const PopularEventResults = ({ data, yearRange, onYearRangeChange }: { data: PopularEvents } & RangeProps) => {
  const allSeries = topEventSeries(omitInactiveYears(omitGrowthDisplayYears(data.events || []), "participations"))
  const allIds = allSeries.map(item => item.event_id)
  const defaultIds = allIds.filter(id => !DEFAULT_HIDDEN_EVENTS.has(id))
  const [selection, setSelection] = useState<string[] | null>(null)
  const selectedIds = allIds.filter(id => (selection ?? defaultIds).includes(id))
  const rangedSeries = filterSeriesByYearRange(allSeries, yearRange)
  const chartSeries = rangedSeries.filter(item => selectedIds.includes(item.event_id))
  const allStyles = chartStyles(allSeries)
  const selectedStyles = allStyles.filter((_, index) => selectedIds.includes(allSeries[index].event_id))
  const toggleEvents = (ids: string[]) => setSelection(current => {
    const selected = current ?? defaultIds
    return ids.every(id => selected.includes(id))
      ? selected.filter(id => !ids.includes(id))
      : [...new Set([...selected, ...ids])]
  })
  return (
    <>
      <LineChart
        series={chartSeries}
        valueKey="participations"
        title={`Most popular events in ${data.scope.name}`}
        yearRange={yearRange}
        onYearRangeChange={onYearRangeChange}
        height={500}
        className="statistics-chart-popular-events"
        evenYearSpacing
        seriesStyles={selectedStyles}
        legend={<EventChartLegend
          series={allSeries}
          styles={allStyles}
          selectedIds={selectedIds}
          onToggle={toggleEvents}
          onSelectAll={() => setSelection(allIds)}
          onClearAll={() => setSelection([])}
          onReset={() => setSelection(null)}
        />}
      />
      <p className="statistics-chart-note">
        The inactive 2021 season is omitted because it has no recorded
        competition activity. Event lines use small visual offsets to reveal
        equal and overlapping values; exact values are listed below.
      </p>
      {chartSeries.length > 0 && <HistoryTable
        series={chartSeries}
        valueKey="participations"
        secondaryKey="unique_competitors"
        seriesStyles={selectedStyles}
        shareSeries={rangedSeries}
      />}
      {chartSeries.length > 0 && <p className="statistics-footnote">
        Table cells show each event&apos;s participation and competitor
        percentage shares, followed by the exact counts. Darker backgrounds
        indicate a higher share relative to the other years in the same event
        column. One competitor can appear in more than one event and may
        contribute multiple participations by attending multiple competitions.
      </p>}
    </>
  )
}
