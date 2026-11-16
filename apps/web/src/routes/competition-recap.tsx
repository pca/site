import { createFileRoute } from "@tanstack/react-router"
import { CompetitionRecap } from "../components/insights/MoreConcepts"
import { insightsHead } from "../components/insights/Insights"

export const Route = createFileRoute("/competition-recap")({
  head: () => insightsHead("Competition Recap · Preview", "/competition-recap"),
  component: CompetitionRecap,
})
