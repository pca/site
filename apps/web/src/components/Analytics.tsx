import { useRouter } from "@tanstack/react-router"
import { useEffect } from "react"

import { analytics } from "../lib/analytics"

/** One page view per public route; filter and OAuth URL changes are not page views. */
export function Analytics() {
  const router = useRouter()
  useEffect(() => {
    analytics.syncPage()
    // Query-only navigation can remove an OAuth code and allow initialization.
    return router.subscribe("onResolved", () => { analytics.syncPage() })
  }, [router])
  return null
}
