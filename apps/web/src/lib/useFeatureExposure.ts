import { useEffect, useRef } from "react"

import { analytics } from "./analytics"
import type { AnalyticsFeature } from "./analytics-core"

/** Exposure means >=50% visible for one continuous second in a foreground tab. */
export function useFeatureExposure(feature: AnalyticsFeature, enabled = true) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!enabled || !element || typeof IntersectionObserver === "undefined") return
    let visible = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const cancel = () => { clearTimeout(timer); timer = undefined }
    const schedule = () => {
      cancel()
      if (visible && document.visibilityState === "visible") {
        timer = setTimeout(() => {
          if (analytics.expose(feature)) observer.disconnect()
        }, 1000)
      }
    }
    const observer = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= .5)
      schedule()
    }, { threshold: [.5] })
    observer.observe(element)
    document.addEventListener("visibilitychange", schedule)
    return () => { cancel(); observer.disconnect(); document.removeEventListener("visibilitychange", schedule) }
  }, [feature, enabled])
  return ref
}
