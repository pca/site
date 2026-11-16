import { createFileRoute, notFound, redirect } from "@tanstack/react-router"
import { AnalyticsWorkbench } from "../../components/analytics/AnalyticsWorkbench"
import { workbenchSearch, workbenchSections, type WorkbenchSection } from "../../lib/analytics-workbench"

export const Route=createFileRoute("/_authed/analytics-workbench/$section")({
  validateSearch:workbenchSearch,
  beforeLoad: ({ params, search }) => {
    if (params.section === "acquisition" && search.view === "campaign") {
      throw redirect({ to: "/campaigns", search: { ...search, view: undefined }, replace: true })
    }
    if (!workbenchSections.some(section => section.id === params.section)) throw notFound()
  },
  component:Page,
})
function Page(){
  const {section}=Route.useParams(),search=Route.useSearch(),navigate=Route.useNavigate(),{session}=Route.useRouteContext()
  return <AnalyticsWorkbench section={section as WorkbenchSection} search={search} userId={session.user.id} onSearch={next=>{void navigate({search:next,replace:true,resetScroll:false})}}/>
}
