import { createFileRoute, Link } from "@tanstack/react-router"
import { AnalyticsDesignPreview } from "../../components/analytics/AnalyticsDesignPreview"
import "../../analytics-workbench.css"
import "../../analytics-design-preview.css"

export const Route = createFileRoute("/_authed/analytics-feature-concept")({ component: FeatureConcept })
function FeatureConcept() {
  return <div className="wb-workspace"><header className="wb-top"><h1>Earlier feature-discovery concept</h1><Link to="/analytics-workbench/$section" params={{section:"features"}} search={{mode:"sample",days:28,device:"all"}}>Current lightweight report →</Link></header><main className="wb-content"><AnalyticsDesignPreview section="features"/></main></div>
}
