import { createFileRoute } from "@tanstack/react-router"
import { RegionPulsePage, insightsHead } from "../components/insights/Insights"

export const Route = createFileRoute("/region-pulse")({
  head: () => insightsHead("Region Pulse · Preview", "/region-pulse"),
  component: RegionPulsePage,
})
