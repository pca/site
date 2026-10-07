import { ACTIVE_EVENTS, findEvent, isActiveEventId, isRegionId, REGIONS, SINGLE_ONLY_EVENTS, type RankingFormat } from "@pca/shared"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useHydrated, useNavigate } from "@tanstack/react-router"

import { Methodology, SnapshotNote, StatisticsPage, StatisticsStatus } from "../components/statistics/StatisticsPage"
import { FormatToggle, StrengthCoverage, StrengthResults } from "../components/statistics/StrengthResults"
import { prefetchForPrerender, strengthQuery } from "../lib/queries"
import { pageHead } from "../lib/seo"

type TabId = "event" | "region"

const TABS = [
  { id: "event", label: "Best region per event" },
  { id: "region", label: "Best events per region" },
] as const

interface StatisticsSearch {
  tab?: TabId
  event?: string
  region?: string
  format?: RankingFormat
}

const DEFAULTS = { tab: "event" as TabId, event: "333", region: "NCR", format: "single" as RankingFormat }

export const Route = createFileRoute("/regional-statistics")({
  validateSearch: (search: Record<string, unknown>): StatisticsSearch => ({
    tab: search.tab === "region" ? "region" : undefined,
    event: isActiveEventId(search.event) && search.event !== DEFAULTS.event ? search.event : undefined,
    region: isRegionId(search.region) && search.region !== DEFAULTS.region ? search.region : undefined,
    format: search.format === "average" ? "average" : undefined,
  }),
  loader: ({ context }) =>
    prefetchForPrerender(() => context.queryClient.ensureQueryData(strengthQuery("event", DEFAULTS.event, DEFAULTS.format))),
  head: () =>
    pageHead({
      title: "Regional Statistics",
      description:
        "Compare the strongest regional results using the national rankings of each region’s five scoring competitors.",
      path: "/regional-statistics",
    }),
  component: RegionalStatistics,
})

function RegionalStatistics() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const hydrated = useHydrated()
  const activeTab = (hydrated && search.tab) || DEFAULTS.tab
  const selectedEvent = (hydrated && search.event) || DEFAULTS.event
  const selectedRegion = (hydrated && search.region) || DEFAULTS.region
  const averageDisabled = activeTab === "event" && SINGLE_ONLY_EVENTS.has(selectedEvent)
  const selectedFormat: RankingFormat = hydrated && search.format && !averageDisabled ? search.format : "single"

  const update = (next: Partial<StatisticsSearch>) =>
    navigate({
      search: prev => {
        const merged = { ...prev, ...next }
        return {
          tab: merged.tab === "region" ? "region" : undefined,
          event: merged.event === DEFAULTS.event ? undefined : merged.event,
          region: merged.region === DEFAULTS.region ? undefined : merged.region,
          format: merged.format === "average" ? "average" : undefined,
        }
      },
      replace: true,
      resetScroll: false,
    })

  const query = useQuery(strengthQuery(activeTab, activeTab === "event" ? selectedEvent : selectedRegion, selectedFormat))
  const data = query.data
  const selectedEventData = findEvent(selectedEvent)

  return (
    <StatisticsPage
      title="Regional Statistics"
      description="Compare the strongest regional results using the national rankings of each region’s five scoring competitors."
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={tab => update({ tab })}
    >
      <StatisticsStatus isLoading={query.isPending} error={query.error} onRetry={() => query.refetch()} />
      {data && !query.isError && (
        <section className="statistics-results-introduction" aria-live="polite">
          <Methodology>{data.methodology}</Methodology>
          {activeTab === "event" && "regions" in data && <StrengthCoverage coverage={data.coverage} />}
          <SnapshotNote snapshot={data.snapshot} showPreviewWarning />
        </section>
      )}

      <section className="statistics-controls" aria-label="Regional statistics filters">
        <label>
          <span>{activeTab === "event" ? "Event" : "Home region"}</span>
          {activeTab === "event" ? (
            <select value={selectedEvent} onChange={e => update({ event: e.target.value })}>
              {ACTIVE_EVENTS.map(event => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          ) : (
            <select value={selectedRegion} onChange={e => update({ region: e.target.value })}>
              {REGIONS.map(region => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </select>
          )}
        </label>
        <FormatToggle value={selectedFormat} onChange={format => update({ format })} averageDisabled={averageDisabled} />
      </section>

      {activeTab === "event" && selectedEventData && (
        <div className="statistics-selection-title">
          <img src={`/images/${selectedEventData.id}.svg`} alt="" aria-hidden="true" fetchPriority="low" />
          <div>
            <span>{selectedFormat === "single" ? "Single" : "Average"}</span>
            <h2>{selectedEventData.name}</h2>
          </div>
        </div>
      )}

      {data && !query.isError && (
        <section aria-live="polite">
          {"regions" in data ? (
            <StrengthResults rows={data.regions} kind="event" />
          ) : (
            <StrengthResults rows={data.events} kind="region" coverage={data.coverage} />
          )}
        </section>
      )}
    </StatisticsPage>
  )
}
