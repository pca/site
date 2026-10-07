import { isRegionId, REGIONS } from "@pca/shared"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useHydrated, useNavigate } from "@tanstack/react-router"

import { GrowthCoverage, PopularEventResults, RegionalGrowthResults } from "../components/statistics/GrowthResults"
import { Methodology, SnapshotNote, StatisticsPage, StatisticsStatus } from "../components/statistics/StatisticsPage"
import { growthQuery, prefetchForPrerender, type GrowthMetricId } from "../lib/queries"
import { pageHead } from "../lib/seo"

type MetricId = GrowthMetricId

const METRICS = [
  { id: "new-attendees", label: "Regions with most new attendees", resultLabel: "New attendees" },
  { id: "attendances", label: "Regions with most competition attendances", resultLabel: "Competition attendances" },
  { id: "active-competitors", label: "Regions with most active competitors per year", resultLabel: "Active competitors" },
  { id: "popular-events", label: "Most popular events", resultLabel: "Event participations" },
] as const satisfies readonly { id: MetricId; label: string; resultLabel: string }[]

const DEFAULT_METRIC: MetricId = "new-attendees"

interface GrowthSearch {
  metric?: MetricId
  region?: string
}

export const Route = createFileRoute("/growth-statistics")({
  validateSearch: (search: Record<string, unknown>): GrowthSearch => ({
    metric: METRICS.some(m => m.id === search.metric) && search.metric !== DEFAULT_METRIC ? (search.metric as MetricId) : undefined,
    region: isRegionId(search.region) ? search.region : undefined,
  }),
  loader: ({ context }) => prefetchForPrerender(() => context.queryClient.ensureQueryData(growthQuery("new-attendees"))),
  head: () =>
    pageHead({
      title: "Growth Statistics",
      description:
        "Follow how Philippine cubing participation has changed in every host region from the first local competition through the latest WCA export.",
      path: "/growth-statistics",
    }),
  component: GrowthStatistics,
})

function GrowthStatistics() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const hydrated = useHydrated()
  const activeMetric: MetricId = (hydrated && search.metric) || DEFAULT_METRIC
  const popularScope = (hydrated && search.region) || "national"
  const definition = METRICS.find(metric => metric.id === activeMetric)!

  const update = (next: Partial<GrowthSearch>) =>
    navigate({
      search: prev => {
        const merged = { ...prev, ...next }
        return {
          metric: merged.metric === DEFAULT_METRIC ? undefined : merged.metric,
          region: merged.region === "national" ? undefined : merged.region,
        }
      },
      replace: true,
      resetScroll: false,
    })

  const query = useQuery(growthQuery(activeMetric, popularScope))
  const data = query.data

  return (
    <StatisticsPage
      title="Growth Statistics"
      description="Follow how Philippine cubing participation has changed in every host region from the first local competition through the latest WCA export."
      tabs={METRICS}
      activeTab={activeMetric}
      onTabChange={metric => update({ metric })}
    >
      {activeMetric === "popular-events" && (
        <section className="statistics-controls compact" aria-label="Popular events filters">
          <label>
            <span>Competition host region</span>
            <select value={popularScope} onChange={e => update({ region: e.target.value })}>
              <option value="national">Nationwide</option>
              {REGIONS.map(region => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      <StatisticsStatus isLoading={query.isPending} error={query.error} onRetry={() => query.refetch()} />
      {data && !query.isError && (
        <section aria-live="polite">
          <Methodology>{data.methodology}</Methodology>
          <GrowthCoverage coverage={data.coverage} />
          <SnapshotNote snapshot={data.snapshot} />
          {"events" in data ? (
            <PopularEventResults data={data} />
          ) : (
            <RegionalGrowthResults data={data} metricLabel={definition.resultLabel} />
          )}
        </section>
      )}
    </StatisticsPage>
  )
}
