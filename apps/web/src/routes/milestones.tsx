import { createFileRoute } from "@tanstack/react-router"
import { MilestonesPage } from "../components/insights/MoreConcepts"
import { insightsHead } from "../components/insights/Insights"

export const Route = createFileRoute("/milestones")({
  head: () => insightsHead("Event Milestones · Preview", "/milestones"),
  component: MilestonesPage,
})
