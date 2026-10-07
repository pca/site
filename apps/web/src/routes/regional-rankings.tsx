import { isActiveEventId, isRegionId, SINGLE_ONLY_EVENTS, type RankingFormat } from "@pca/shared"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useHydrated, useNavigate } from "@tanstack/react-router"
import { useCallback, useState } from "react"

import { Layout } from "../components/Layout"
import { LoginPrompt } from "../components/rankings/LoginPrompt"
import { RankingList } from "../components/rankings/RankingList"
import { RankingNav } from "../components/rankings/RankingNav"
import { prefetchForPrerender, rankingsQuery } from "../lib/queries"
import { pageHead } from "../lib/seo"

interface RankingsSearch {
  event?: string
  format?: RankingFormat
  region?: string
  /** WCA OAuth authorization code; WCA redirects back here with it. */
  code?: string
}

const DEFAULT_EVENT = "333"

export const Route = createFileRoute("/regional-rankings")({
  validateSearch: (search: Record<string, unknown>): RankingsSearch => ({
    event: isActiveEventId(search.event) && search.event !== DEFAULT_EVENT ? search.event : undefined,
    format: search.format === "average" ? "average" : undefined,
    region: isRegionId(search.region) ? search.region : undefined,
    code: typeof search.code === "string" && search.code ? search.code : undefined,
  }),
  loader: ({ context }) =>
    prefetchForPrerender(() => context.queryClient.ensureQueryData(rankingsQuery(DEFAULT_EVENT, "single"))),
  head: () =>
    pageHead({
      title: "Regional Rankings",
      description:
        "Philippine speedcubing rankings for every WCA event, nationwide and by region, from official WCA results.",
      path: "/regional-rankings",
    }),
  component: RegionalRankings,
})

function RegionalRankings() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  // The static HTML is rendered for the defaults, so hydrate with them and
  // apply the URL's selection right after.
  const hydrated = useHydrated()
  const event = (hydrated && search.event) || DEFAULT_EVENT
  const format: RankingFormat = hydrated && search.format && !SINGLE_ONLY_EVENTS.has(event) ? search.format : "single"
  const region = hydrated ? search.region : undefined

  const [hideLoginPrompt, setHideLoginPrompt] = useState(false)
  const rankings = useQuery(rankingsQuery(event, format, region))

  const select = useCallback(
    (next: Partial<Pick<RankingsSearch, "event" | "format" | "region">>) => {
      setHideLoginPrompt(true)
      navigate({
        search: prev => {
          const merged = { ...prev, ...next }
          return {
            ...merged,
            event: merged.event === DEFAULT_EVENT ? undefined : merged.event,
            format: merged.format === "average" && !SINGLE_ONLY_EVENTS.has(merged.event ?? DEFAULT_EVENT) ? "average" : undefined,
          }
        },
        replace: true,
        resetScroll: false,
      })
    },
    [navigate],
  )

  return (
    <Layout>
      <div className="max-w-1340 mx-auto min-h-[80vh]">
        <LoginPrompt hidden={hideLoginPrompt} setHidden={setHideLoginPrompt} code={hydrated ? search.code : undefined} />
        <RankingNav
          event={event}
          format={format}
          region={region}
          onEventChange={id => select({ event: id })}
          onFormatChange={f => select({ format: f })}
          onRegionChange={id => select({ region: id })}
        />
        <div className="min-h-[500px] overflow-y-auto">
          <RankingList
            isLoading={rankings.isPending}
            rankings={rankings.data}
            hasAttemptedLoad={!rankings.isPending}
            showSolves={format === "average"}
          />
        </div>
      </div>
    </Layout>
  )
}
