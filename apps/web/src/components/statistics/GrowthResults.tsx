import {
  findRegion,
  formatNumber,
  shortRegionName,
  type GrowthCoverage as Coverage,
  type GrowthMetric,
  type GrowthSeries,
  type PopularEvents,
  type PopularEventSeries,
} from "@pca/shared"
import { useId } from "react"

import { RegionTag } from "./RegionTag"

const CHART_COLORS = ["#0A4C84", "#B24400", "#5A3B8C", "#147D64", "#B42345", "#6C5B00"]
const REGION_CHART_COLORS: Record<string, string> = { luzon: "#9A6500", visayas: "#0A4C84", mindanao: "#A62D24" }
const REGION_LINE_PATTERNS = ["", "10 5", "3 4", "12 4 2 4", "7 3", "2 3"]

type Point = { year: number } & Record<string, number | null>
type Series = { region_id?: string; region_name?: string; event_id?: string; event_name?: string; values: Point[] }

const seriesKey = (item: Series) => item.region_id || item.event_id || ""
const seriesName = (item: Series) => item.region_name || item.event_name || ""

function chartStyles(series: Series[]) {
  const zoneCounts: Record<string, number> = {}
  return series.map((item, index) => {
    const fallback = { color: CHART_COLORS[index % CHART_COLORS.length], dash: "" }
    if (!item.region_id || item.region_id === "national") return fallback
    const zone = findRegion(item.region_id)?.zone
    const color = zone && REGION_CHART_COLORS[zone]
    if (!zone || !color) return fallback
    const zoneIndex = zoneCounts[zone] || 0
    zoneCounts[zone] = zoneIndex + 1
    return { color, dash: REGION_LINE_PATTERNS[zoneIndex % REGION_LINE_PATTERNS.length] }
  })
}

const latestPoint = <T,>(series: { values: T[] }) => series.values?.[series.values.length - 1]

export const topRegionalSeries = (series?: GrowthSeries[]) =>
  [...(series || [])]
    .filter(item => item.region_id !== "national")
    .sort((a, b) => (latestPoint(b)?.value || 0) - (latestPoint(a)?.value || 0))
    .slice(0, 6)

export const topEventSeries = (events?: PopularEventSeries[]) =>
  (events || [])
    .map(event => ({ ...event, total: event.values.reduce((sum, point) => sum + point.participations, 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6)

const yearsOf = (series: Series[]) => [...new Set(series.flatMap(item => item.values.map(point => point.year)))].sort()

const valueFor = (series: Series, year: number, valueKey: string) => {
  const point = series.values.find(item => item.year === year)
  return point ? Number(point[valueKey] || 0) : 0
}

function SeriesLabel({ item, color }: { item: Series; color: string }) {
  if (item.region_id) return <RegionTag regionId={item.region_id} regionName={item.region_name} color={color} />
  return (
    <>
      <i style={{ backgroundColor: color }} aria-hidden="true" />
      {shortRegionName(item.event_name || "")}
    </>
  )
}

function LineChart({ series, valueKey = "value", title }: { series: Series[]; valueKey?: string; title: string }) {
  const width = 900
  const height = 360
  const margin = { top: 20, right: 24, bottom: 46, left: 62 }
  const ids = useId()
  const years = yearsOf(series)

  if (!series.length || !years.length) {
    return <p className="statistics-empty">There is no chart data for this selection.</p>
  }

  const maxValue = Math.max(1, ...series.flatMap(item => item.values.map(point => Number(point[valueKey] || 0))))
  const first = years[0]
  const last = years[years.length - 1]
  const x = (year: number) => margin.left + ((year - first) / Math.max(1, last - first)) * (width - margin.left - margin.right)
  const y = (value: number) => height - margin.bottom - (value / maxValue) * (height - margin.top - margin.bottom)
  const tickYears = years.filter((_, index) => index === 0 || index === years.length - 1 || index % 4 === 0)
  const gridValues = [...new Set([0, 0.25, 0.5, 0.75, 1].map(ratio => Math.round(maxValue * ratio)))]
  const styles = chartStyles(series)
  const titleId = `${ids}-title`
  const descId = `${ids}-desc`

  return (
    <figure className="statistics-chart">
      <figcaption>{title}</figcaption>
      <div className="chart-legend" aria-label="Chart legend">
        {series.map((item, index) => (
          <span key={seriesKey(item)}>
            <SeriesLabel item={item} color={styles[index].color} />
          </span>
        ))}
      </div>
      <div className="chart-scroll">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${titleId} ${descId}`}>
          <title id={titleId}>{title}</title>
          <desc id={descId}>
            A line chart from {first} through {last}. Exact values are available in the table below.
          </desc>
          {gridValues.map(value => (
            <g key={value}>
              <line className="chart-grid" x1={margin.left} x2={width - margin.right} y1={y(value)} y2={y(value)} />
              <text className="chart-axis-label" x={margin.left - 10} y={y(value) + 4} textAnchor="end">
                {formatNumber(value)}
              </text>
            </g>
          ))}
          {tickYears.map(year => (
            <text className="chart-axis-label" key={year} x={x(year)} y={height - 16} textAnchor="middle">
              {year}
            </text>
          ))}
          {series.map((item, index) => {
            const style = styles[index]
            const points = years.map(year => `${x(year)},${y(valueFor(item, year, valueKey))}`).join(" ")
            return (
              <g key={seriesKey(item)}>
                <polyline className="chart-line" points={points} stroke={style.color} strokeDasharray={style.dash || undefined} />
                {years.map(year => (
                  <circle key={year} cx={x(year)} cy={y(valueFor(item, year, valueKey))} r="2.5" fill={style.color}>
                    <title>{`${seriesName(item)}, ${year}: ${formatNumber(valueFor(item, year, valueKey))}`}</title>
                  </circle>
                ))}
              </g>
            )
          })}
        </svg>
      </div>
    </figure>
  )
}

function HistoryTable({ series, valueKey = "value", secondaryKey }: { series: Series[]; valueKey?: string; secondaryKey?: string }) {
  const years = yearsOf(series)
  const styles = chartStyles(series)
  return (
    <div className="statistics-table-wrap history-table-wrap">
      <table className="statistics-table history-table">
        <caption>Exact values shown in the chart</caption>
        <thead>
          <tr>
            <th scope="col">Year</th>
            {series.map((item, index) => (
              <th scope="col" key={seriesKey(item)}>
                {item.region_id ? (
                  <RegionTag regionId={item.region_id} regionName={item.region_name} color={styles[index].color} />
                ) : (
                  shortRegionName(item.event_name || "")
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
              {series.map(item => (
                <td key={seriesKey(item)}>
                  {formatNumber(valueFor(item, year, valueKey))}
                  {secondaryKey ? ` / ${formatNumber(valueFor(item, year, secondaryKey))}` : ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function GrowthCoverage({ coverage }: { coverage?: Coverage }) {
  if (!coverage || coverage.assigned_competitions === undefined) return null
  const assigned = Number(coverage.assigned_competitions || 0)
  const unclassified = Number(coverage.unclassified_competitions || 0)
  const total = assigned + unclassified
  const percent = total ? ((assigned / total) * 100).toFixed(1) : "0.0"
  return (
    <aside className="statistics-coverage growth-coverage">
      <strong>Competition-location coverage:</strong> {formatNumber(assigned)} of {formatNumber(total)} Philippine
      competitions ({percent}%) were automatically matched to a region.
      {unclassified > 0 ? ` ${formatNumber(unclassified)} remained unclassified and were excluded from regional totals.` : ""}
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

export function RegionalGrowthResults({ data, metricLabel }: { data: GrowthMetric; metricLabel: string }) {
  const chartSeries = topRegionalSeries(data.series) as unknown as Series[]
  const national = data.series?.find(item => item.region_id === "national")
  const nationalLatest = national ? latestPoint(national) : undefined
  return (
    <>
      {nationalLatest && (
        <div className="statistics-highlight">
          <span>Nationwide in {nationalLatest.year}</span>
          <strong>{formatNumber(nationalLatest.value)}</strong>
          <small>{metricLabel.toLowerCase()}</small>
        </div>
      )}
      <LineChart series={chartSeries} title={`Top regions by ${metricLabel.toLowerCase()}`} />
      <HistoryTable series={chartSeries} />
      <LatestRegionalTable series={data.series} metricLabel={metricLabel} />
    </>
  )
}

export function PopularEventResults({ data }: { data: PopularEvents }) {
  const chartSeries = topEventSeries(data.events) as unknown as Series[]
  return (
    <>
      <LineChart series={chartSeries} valueKey="participations" title={`Most popular events in ${data.scope.name}`} />
      <HistoryTable series={chartSeries} valueKey="participations" secondaryKey="unique_competitors" />
      <p className="statistics-footnote">
        Table cells show participations first and unique competitors second. One competitor may contribute more than one
        participation by attending multiple competitions.
      </p>
    </>
  )
}
