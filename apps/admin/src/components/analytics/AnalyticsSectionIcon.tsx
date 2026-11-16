import type { ReactNode } from "react"
import type { WorkbenchSection } from "../../lib/analytics-workbench"

const icons: Record<WorkbenchSection, ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  pages: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01M7 13h5m-5 3h3"/><circle cx="17" cy="13" r="1.5"/><path d="M14 18c0-3 6-3 6 0"/></>,
  acquisition: <><circle cx="15" cy="12" r="7"/><path d="M2 12h14m-4-4 4 4-4 4"/></>,
  features: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
  journeys: <><rect x="3" y="3" width="5" height="5" rx="1"/><rect x="16" y="16" width="5" height="5" rx="1"/><path d="M8 5.5h7.5a3 3 0 0 1 0 6h-7a3 3 0 0 0 0 6H16m-3-3 3 3-3 3"/></>,
  retention: <><path d="M3 10a9 9 0 1 1 1 7M3 4v6h6"/><path d="M12 7v5l3 2"/></>,
  feedback: <><path d="M21 14a3 3 0 0 1-3 3H9l-6 4V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3Z"/><path d="M7 8h10M7 12h7"/></>,
  releases: <><path d="M14 5c2-2 4-2 7-2 0 3 0 5-2 7l-7 7-5-5 7-7ZM8 11H4l-2 5 5-1m6 1v4l-5 2 1-5M4 20l-2 2"/><circle cx="16" cy="8" r="1.5"/></>,
  experiments: <><path d="M12 4v5m-6 7v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3"/><circle cx="12" cy="3" r="2"/><rect x="3" y="16" width="6" height="6" rx="1"/><rect x="15" y="16" width="6" height="6" rx="1"/></>,
  measurement: <><path d="M4 3v7m0 4v7M12 3v3m0 4v11M20 3v11m0 4v3"/><rect x="1" y="10" width="6" height="4" rx="1"/><rect x="9" y="6" width="6" height="4" rx="1"/><rect x="17" y="14" width="6" height="4" rx="1"/></>,
}

export function AnalyticsSectionIcon({ section }: { section: WorkbenchSection }) {
  return <svg className="wb-section-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{icons[section]}</svg>
}
