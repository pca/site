import { ACTIVE_EVENTS, findEvent, isActiveEventId, officialRankingFormat } from "@pca/shared"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useHydrated, useNavigate } from "@tanstack/react-router"

import { Methodology, SnapshotNote, StatisticsPage, StatisticsStatus } from "../components/statistics/StatisticsPage"
import { RegionCards, StrengthResults } from "../components/statistics/StrengthResults"
import { prefetchForPrerender, regionalStatisticsQuery } from "../lib/queries"
import { pageHead } from "../lib/seo"

type TabId = "event" | "region"

const TABS = [
  { id: "event", label: "Best region per event" },
  { id: "region", label: "Best events per region" },
] as const

interface StatisticsSearch {
  tab?: TabId
  event?: string
}

const DEFAULTS = { tab: "event" as TabId, event: "333" }

export const Route = createFileRoute("/regional-statistics")({
  validateSearch: (search: Record<string, unknown>): StatisticsSearch => ({
    tab: search.tab === "region" ? "region" : undefined,
    event: isActiveEventId(search.event) && search.event !== DEFAULTS.event ? search.event : undefined,
  }),
  loader: ({ context }) =>
    prefetchForPrerender(() => context.queryClient.ensureQueryData(regionalStatisticsQuery("event", DEFAULTS.event))),
  head: () =>
    pageHead({
      title: "Regional Statistics",
      description: "Compare the strongest regional results using the national rankings of each region’s five scoring competitors.",
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

  const update = (next: Partial<StatisticsSearch>) =>
    navigate({
      search: prev => {
        const merged = { ...prev, ...next }
        return {
          tab: merged.tab === "region" ? "region" : undefined,
          event: merged.event === DEFAULTS.event ? undefined : merged.event,
        }
      },
      replace: true,
      resetScroll: false,
    })

  const query = useQuery(regionalStatisticsQuery(activeTab, selectedEvent))
  const data = query.data
  const selectedEventData = findEvent(selectedEvent)

  return (
    <StatisticsPage title="Regional Statistics" tabs={TABS} activeTab={activeTab} onTabChange={tab => update({ tab })}>
      <StatisticsStatus isLoading={query.isPending} error={query.error} onRetry={() => query.refetch()} />
      {data && !query.isError && (
        <SnapshotNote snapshot={data.snapshot} showPreviewWarning showSource={false} />
      )}

      {activeTab === "event" && (
        <section className="statistics-controls statistics-controls-ranking-style" aria-label="Regional statistics event filter">
          <fieldset className="statistics-event-picker">
            <legend>Select an event</legend>
            <div className="events-menu flex flex-row flex-wrap">
              {ACTIVE_EVENTS.map(event => (
                <button type="button" className={`event-icon mb-1 cursor-pointer ${selectedEvent === event.id ? "active" : ""}`} key={event.id} aria-label={`Select ${event.name}`} aria-pressed={selectedEvent === event.id} onClick={() => update({ event: event.id })}>
                  <img src={`/images/${event.id}.svg`} alt="" aria-hidden="true" fetchPriority="low" />
                  <span className="event-tooltip" role="tooltip">{event.name}</span>
                </button>
              ))}
            </div>
          </fieldset>
        </section>
      )}

      {activeTab === "event" && selectedEventData && (
        <div className="statistics-selection-title">
          <img src={`/images/${selectedEventData.id}.svg`} alt="" aria-hidden="true" fetchPriority="low" />
          <div>
            <span>{officialRankingFormat(selectedEvent) === "single" ? "Single" : "Average"}</span>
            <h2>{selectedEventData.name}</h2>
          </div>
        </div>
      )}

      {data && !query.isError && (
        <section aria-live="polite">
          {"event" in data ? <StrengthResults rows={data.regions} kind="event" format={data.format} /> : <RegionCards regions={data.regions} />}
          <Methodology>{data.methodology}</Methodology>
          <SnapshotNote snapshot={data.snapshot} className="statistics-snapshot-after-results" />
        </section>
      )}
    </StatisticsPage>
  )
}
