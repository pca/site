import { createFileRoute, useHydrated } from "@tanstack/react-router"
import { PerformancePage, insightsHead, previewProfiles } from "../components/insights/Insights"

interface ReportSearch { person?: string; event?: string }
export const Route = createFileRoute("/performance")({
  validateSearch: (search: Record<string, unknown>): ReportSearch => {
    const profile = previewProfiles.find(profile => profile.id === search.person)
    return { person: profile?.id, event: profile?.events.some(event => event.id === search.event) ? String(search.event) : undefined }
  },
  head: () => insightsHead("Performance Report · Preview", "/performance"),
  component: Report,
})

function Report() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const hydrated = useHydrated()
  return <PerformancePage personId={hydrated ? search.person : undefined} eventId={hydrated ? search.event : undefined} onChange={(person, event) => navigate({ search: { person, event }, replace: true, resetScroll: false })} />
}
