import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"

import { CampaignLinkBuilder } from "../../components/analytics/CampaignLinkBuilder"
import { workbenchSearch } from "../../lib/analytics-navigation"
import { defaultCampaignDraft } from "../../lib/campaign-link"
import "../../analytics-workbench.css"
import "../../analytics-design-preview.css"
import "../../analytics-reports.css"
import "../../analytics-v4.css"

export const Route = createFileRoute("/_authed/campaigns")({
  validateSearch: workbenchSearch,
  component: CampaignsPage,
})

function CampaignsPage() {
  const { session } = Route.useRouteContext()
  const search = Route.useSearch()
  const [draft, setDraft] = useState({ ...defaultCampaignDraft })

  return (
    <div className="wb-workspace wb-v4">
      <header className="wb-page-head flex flex-wrap items-start justify-between gap-3">
        <h1>Campaigns</h1>
        <Link className="btn" to="/analytics-workbench/$section" params={{ section: "acquisition" }}
          search={{ ...search, view: undefined }}>
          View acquisition report
        </Link>
      </header>
      <div className="wb-content">
        <CampaignLinkBuilder draft={draft} onChange={setDraft} userId={session.user.id} />
      </div>
    </div>
  )
}
