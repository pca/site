import {
  fetchJson,
  type GrowthMetric,
  type PopularEvents,
  type RankingFormat,
  type RankingRow,
  type StrengthByEvent,
  type StrengthByRegion,
} from "@pca/shared"
import { queryOptions } from "@tanstack/react-query"

import { apiUrl } from "./config"

export const rankingsQuery = (event: string, format: RankingFormat, region?: string) =>
  queryOptions({
    queryKey: ["rankings", region ?? "national", format, event],
    queryFn: ({ signal }) =>
      fetchJson<RankingRow[]>(
        apiUrl(region ? `rankings/regional-${format}/${region}/${event}/` : `rankings/national-${format}/${event}/`),
        { signal },
      ),
    staleTime: 20 * 60 * 1000,
  })

/** strengthQuery is the Regional Statistics view: by event or by home region. */
export const strengthQuery = (tab: "event" | "region", id: string, format: RankingFormat) =>
  queryOptions({
    queryKey: ["strength", tab, id, format],
    queryFn: ({ signal }) =>
      fetchJson<StrengthByEvent | StrengthByRegion>(
        apiUrl(`statistics/regional/strength/${tab === "event" ? "events" : "regions"}/${id}/?format=${format}`),
        { signal },
      ),
  })

export type GrowthMetricId = "new-attendees" | "attendances" | "active-competitors" | "popular-events"

/** growthQuery is one Growth Statistics tab; region only applies to popular events. */
export const growthQuery = (metric: GrowthMetricId, region = "national") =>
  queryOptions({
    queryKey: metric === "popular-events" ? ["growth", metric, region] : ["growth", metric],
    queryFn: ({ signal }) =>
      fetchJson<GrowthMetric | PopularEvents>(
        apiUrl(
          metric === "popular-events"
            ? `statistics/growth/popular-events/?region=${encodeURIComponent(region)}`
            : `statistics/growth/${metric}/`,
        ),
        { signal },
      ),
  })

/** prefetchForPrerender loads data into the HTML only when building with an API. */
export async function prefetchForPrerender(run: () => Promise<unknown>) {
  if (!import.meta.env.SSR || !process.env.PRERENDER_API_URL) return
  try {
    await run()
  } catch (error) {
    console.warn("prerender: data fetch failed, page ships without data:", error)
  }
}
