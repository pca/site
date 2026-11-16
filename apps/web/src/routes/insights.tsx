import { createFileRoute } from "@tanstack/react-router"
import { HighlightsPage, insightsHead } from "../components/insights/Insights"

export const Route = createFileRoute("/insights")({
  head: () => insightsHead("Competition Highlights · Preview", "/insights"),
  component: HighlightsPage,
})
