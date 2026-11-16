import { createFileRoute } from "@tanstack/react-router"
import { UxAnalytics } from "../../components/ux/UxAnalytics"
import type { UxTab } from "../../lib/ux-preview"

export const Route = createFileRoute("/_authed/ux-analytics")({
  validateSearch: (search: Record<string, unknown>): { tab: UxTab } => ({
    tab: ["overview", "journeys", "features", "setup"].includes(String(search.tab)) ? search.tab as UxTab : "overview",
  }),
  component: Page,
})

function Page() {
  const { tab } = Route.useSearch()
  return <UxAnalytics tab={tab} />
}
