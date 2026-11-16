import { createFileRoute } from "@tanstack/react-router"
import { PreviewLibrary } from "../../components/analytics/AnalyticsWorkspace"

export const Route = createFileRoute("/_authed/preview-library")({ component: PreviewLibrary })
