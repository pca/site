import { createFileRoute } from "@tanstack/react-router"
import { CompetitionBreakdown } from "../components/insights/MoreConcepts"
import { insightsHead } from "../components/insights/Insights"

export const Route = createFileRoute("/competition-breakdown")({
  head: () => insightsHead("Competition Breakdown · Preview", "/competition-breakdown"),
  component: CompetitionBreakdown,
})
