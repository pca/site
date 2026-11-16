import { createFileRoute } from "@tanstack/react-router"
import { ExamplePage } from "../../components/ux/UxExamples"

export const Route = createFileRoute("/_authed/ux-examples/$view")({ component: Page })

function Page() {
  const { view } = Route.useParams()
  return <ExamplePage key={view} view={view} />
}
