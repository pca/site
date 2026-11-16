import { createFileRoute, notFound } from "@tanstack/react-router"
import { AnalyticsWorkspace } from "../../components/analytics/AnalyticsWorkspace"
import { workspaceSearch, workspaceSections, type WorkspaceSection } from "../../lib/analytics-workspace"

export const Route = createFileRoute("/_authed/analytics/$section")({
  validateSearch: workspaceSearch,
  beforeLoad: ({ params }) => {
    if (params.section !== "settings" && !workspaceSections.some(section => section.id === params.section)) throw notFound()
  },
  component: Page,
})

function Page() {
  const { section } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return <AnalyticsWorkspace section={section as WorkspaceSection} search={search} onSearch={next => { void navigate({ search: next, replace: true, resetScroll: false }) }} />
}
