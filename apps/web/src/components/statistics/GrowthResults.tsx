import { findRegion, formatNumber, shortRegionName, type GrowthCoverage as Coverage, type GrowthMetric, type GrowthSeries, type PopularEvents, type PopularEventSeries } from "@pca/shared"
import { useEffect, useId, useMemo, useRef, type CSSProperties } from "react"

import { getRegionColor } from "./regionColors"
import { RegionTag } from "./RegionTag"

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

const EVENT_GROUPS = [
  {
    id: "cube",
    label: "Cube events",
    eventIds: ["333", "222", "444", "555", "666", "777"],
    colors: ["#168BFF", "#4DA3FF", "#0070D9", "#005EB8", "#004B93", "#003A73"],
  },
  {
    id: "blindfolded",
    label: "Blindfolded",
    eventIds: ["333bf", "444bf", "555bf", "333mbf", "333mbo"],
    colors: ["#C4B5FD", "#A78BFA", "#8B5CF6", "#7C3AED", "#5B21B6"],
  },
  {
    id: "variants",
    label: "3×3 variants",
    eventIds: ["333oh", "333fm", "333ft"],
    colors: ["#2DD4BF", "#14B8A6", "#0F766E"],
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

const PANDEMIC_YEARS = new Set([2021])

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

const EventChartLegend = ({ series, styles }: { series: Series[]; styles: ChartStyle[] }) => {
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
    <div
      className="chart-legend chart-event-legend"
      aria-label="Chart legend grouped by event family"
    >
      {groups.map(group => (
        <div className="chart-legend-group" key={group.id}>
          <strong>{group.label}</strong>
          <div>
            {group.items.map(({ item, style }) => (
              <span key={item.event_id}>
                <ChartLineSwatch style={style} />
                {shortRegionName(item.event_name || "")}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

const valueFor = (series: Series, year: number, valueKey: ValueKey) => {
  const point = series.values.find(item => item.year === year)
  return point ? Number(point[valueKey] || 0) : 0
}

const formatShare = (value: number | null, total: number) =>
  total ? `${((Number(value) / total) * 100).toFixed(1)}%` : "0.0%"

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
      if (
        !PANDEMIC_YEARS.has(Number(point.year)) &&
        Number(point[valueKey] || 0) > 0
      ) {
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
}: { series: Series[]; valueKey?: ValueKey; title: string; height?: number } & RangeProps) => {
  const chartId = useId()
  const previousYearRange = useRef(yearRange)
  const width = 900
  const margin = { top: 16, right: 24, bottom: 42, left: 62 }
  const years = useMemo(
    () =>
      [
        ...new Set(
          series.flatMap(item => item.values.map(point => point.year)),
        ),
      ].sort(),
    [series],
  )
  const maxValue = Math.max(
    1,
    ...series.flatMap(item =>
      item.values.map(point => Number(point[valueKey] || 0)),
    ),
  )
  const x = (year: number) =>
    margin.left +
    ((year - years[0]) / Math.max(1, years[years.length - 1] - years[0])) *
      (width - margin.left - margin.right)
  const y = (value: number) =>
    height -
    margin.bottom -
    (value / maxValue) * (height - margin.top - margin.bottom)
  const tickYears = years.filter((year, index) => {
    if (index === 0 || index === years.length - 1) return true
    if (years.length <= 10) return true
    return Number(year) % 2 === 0
  })
  const gridValues = [
    ...new Set(
      [0, 0.25, 0.5, 0.75, 1].map(ratio => Math.round(maxValue * ratio)),
    ),
  ]
  const styles = chartStyles(series)
  const rangeAnimation =
    previousYearRange.current === yearRange
      ? ""
      : rangeSize(yearRange) < rangeSize(previousYearRange.current)
        ? "chart-range-zoom-in"
        : "chart-range-zoom-out"

  useEffect(() => {
    previousYearRange.current = yearRange
  }, [yearRange])

  if (!series.length || !years.length) {
    return (
      <p className="statistics-empty">
        There is no chart data for this selection.
      </p>
    )
  }

  return (
    <figure className="statistics-chart">
      <div className="statistics-chart-heading">
        <figcaption>{title}</figcaption>
        <YearRangeControl value={yearRange} onChange={onYearRangeChange} />
      </div>
      {series[0]?.event_id ? (
        <EventChartLegend series={series} styles={styles} />
      ) : (
        <div className="chart-legend" aria-label="Chart legend">
          {series.map((item, index) => (
            <span key={item.region_id || item.event_id}>
              <RegionTag
                regionId={item.region_id}
                regionName={item.region_name}
                color={styles[index].color}
              />
            </span>
          ))}
        </div>
      )}
      <div className="chart-scroll">
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
                  className="chart-axis-label"
                  x={margin.left - 10}
                  y={y(value) + 4}
                  textAnchor="end"
                >
                  {formatNumber(value)}
                </text>
              </g>
            ))}
            {tickYears.map(year => (
              <text
                className="chart-axis-label"
                key={year}
                x={x(year)}
                y={height - 16}
                textAnchor="middle"
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
      </div>
    </figure>
  )
}

const HistoryTable = ({ series, valueKey = "value", secondaryKey }: { series: Series[]; valueKey?: ValueKey; secondaryKey?: ValueKey }) => {
  const years = [
    ...new Set(series.flatMap(item => item.values.map(point => point.year))),
  ].sort()
  const styles = chartStyles(series)
  const totalsByYear = secondaryKey
    ? Object.fromEntries(
        years.map(year => [
          year,
          {
            primary: series.reduce(
              (sum, item) => sum + valueFor(item, year, valueKey),
              0,
            ),
            secondary: series.reduce(
              (sum, item) => sum + valueFor(item, year, secondaryKey),
              0,
            ),
          },
        ]),
      )
    : {}
  const minimumWidth = series[0]?.event_id
    ? Math.max(912, 90 + series.length * 125)
    : 912
  return (
    <div className="statistics-table-wrap history-table-wrap">
      <table
        className="statistics-table history-table"
        style={{ minWidth: `${minimumWidth}px` }}
      >
        <caption>Exact values shown in the chart</caption>
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
                return (
                  <td key={item.region_id || item.event_id}>
                    {secondaryKey ? (
                      <span
                        className="history-value-pair"
                        style={{ "--series-color": styles[index].color } as CSSProperties}
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export const GrowthCoverage = ({ coverage }: { coverage?: Coverage }) => {
  if (!coverage || coverage.assigned_competitions === undefined) return null
  const assigned = Number(coverage.assigned_competitions || 0)
  const unclassified = Number(coverage.unclassified_competitions || 0)
  const total = assigned + unclassified
  const percent = total ? ((assigned / total) * 100).toFixed(1) : "0.0"
  return (
    <aside className="statistics-coverage growth-coverage">
      <strong>Competition-location coverage:</strong> {formatNumber(assigned)}{" "}
      of {formatNumber(total)} Philippine competitions ({percent}%) were
      automatically matched to a region.
      {unclassified > 0
        ? ` ${formatNumber(unclassified)} remained unclassified and were excluded from regional totals.`
        : ""}
    </aside>
  )
}

function LatestRegionalTable({ series, metricLabel }: { series?: GrowthSeries[]; metricLabel: string }) {
  const rows = (series || [])
    .filter(item => item.region_id !== "national")
    .map(item => ({ ...item, latest: latestPoint(item) }))
    .sort((a, b) => (b.latest?.value || 0) - (a.latest?.value || 0))
  return (
    <div className="statistics-table-wrap latest-table-wrap">
      <table className="statistics-table latest-table">
        <caption>Latest year by region</caption>
        <thead>
          <tr>
            <th scope="col">Place</th>
            <th scope="col">Region</th>
            <th scope="col">{metricLabel}</th>
            <th scope="col">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item, index) => {
            const change = item.latest?.change
            const percent = item.latest?.percent_change
            return (
              <tr key={item.region_id}>
                <td className="place-cell">
                  <span>{index + 1}</span>
                </td>
                <th scope="row">
                  <RegionTag regionId={item.region_id} regionName={item.region_name} />
                </th>
                <td className="score-cell">{formatNumber(item.latest?.value)}</td>
                <td>
                  {change == null ? "—" : `${change > 0 ? "+" : ""}${formatNumber(change)}`}
                  {percent != null ? ` (${percent > 0 ? "+" : ""}${percent.toFixed(1)}%)` : ""}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export const RegionalGrowthResults = ({
  data,
  metricLabel,
  yearRange,
  onYearRangeChange,
}: { data: GrowthMetric; metricLabel: string } & RangeProps) => {
  const chartSeries = filterSeriesByYearRange(
    topRegionalSeries(data.series),
    yearRange,
  )
  const national = data.series?.find(item => item.region_id === "national")
  const nationalLatest = national ? latestPoint(national) : null
  return (
    <>
      {nationalLatest && (
        <div className="statistics-highlight">
          <span>Nationwide in {nationalLatest.year}</span>
          <strong>{formatNumber(nationalLatest.value)}</strong>
          <small>{metricLabel.toLowerCase()}</small>
        </div>
      )}
      <LineChart
        series={chartSeries}
        title={`Top regions by ${metricLabel.toLowerCase()}`}
        yearRange={yearRange}
        onYearRangeChange={onYearRangeChange}
      />
      <HistoryTable series={chartSeries} />
      <LatestRegionalTable series={data.series} metricLabel={metricLabel} />
    </>
  )
}

export const PopularEventResults = ({ data, yearRange, onYearRangeChange }: { data: PopularEvents } & RangeProps) => {
  const chartSeries = filterSeriesByYearRange(
    topEventSeries(omitInactiveYears(data.events || [], "participations")),
    yearRange,
  )
  return (
    <>
      <LineChart
        series={chartSeries}
        valueKey="participations"
        title={`Most popular events in ${data.scope.name}`}
        yearRange={yearRange}
        onYearRangeChange={onYearRangeChange}
        height={320}
      />
      <p className="statistics-chart-note">
        The inactive 2021 season is omitted because it has no recorded
        competition activity. Event lines use small visual offsets to reveal
        equal and overlapping values; exact values are listed below.
      </p>
      <HistoryTable
        series={chartSeries}
        valueKey="participations"
        secondaryKey="unique_competitors"
      />
      <p className="statistics-footnote">
        Table cells show participations and unique competitors, followed by each
        event&apos;s percentage share of the year&apos;s summed event totals.
        One competitor can appear in more than one event and may contribute
        multiple participations by attending multiple competitions.
      </p>
    </>
  )
}
