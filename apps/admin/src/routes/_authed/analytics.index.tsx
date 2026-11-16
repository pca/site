import { createFileRoute, redirect } from "@tanstack/react-router"
import { workspaceSearch } from "../../lib/analytics-workspace"

export const Route = createFileRoute("/_authed/analytics/")({
  validateSearch: workspaceSearch,
  beforeLoad: ({ search }) => { throw redirect({ to: "/analytics/$section", params: { section: "summary" }, search }) },
})
