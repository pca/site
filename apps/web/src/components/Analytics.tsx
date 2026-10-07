import { useRouter } from "@tanstack/react-router"
import { useEffect } from "react"

import { GA_MEASUREMENT_ID } from "../lib/config"

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    dataLayer?: unknown[]
  }
}

/** Head scripts that load Google Analytics unless Do Not Track is on. */
export function analyticsScripts() {
  if (!GA_MEASUREMENT_ID) return []
  const id = JSON.stringify(GA_MEASUREMENT_ID)
  return [
    {
      children: `(function(){if(navigator.doNotTrack==="1"||window.doNotTrack==="1")return;var s=document.createElement("script");s.async=true;s.src="https://www.googletagmanager.com/gtag/js?id="+encodeURIComponent(${id});document.head.appendChild(s);window.dataLayer=window.dataLayer||[];window.gtag=function(){window.dataLayer.push(arguments)};window.gtag("js",new Date());window.gtag("config",${id},{anonymize_ip:true,cookie_expires:0,send_page_view:false});})();`,
    },
  ]
}

const sendPageView = () =>
  window.gtag?.("event", "page_view", {
    page_title: document.title,
    page_location: window.location.href,
    page_path: window.location.pathname,
  })

/** Analytics reports a page view for the first page and every navigation. */
export function Analytics() {
  const router = useRouter()
  useEffect(() => {
    if (!GA_MEASUREMENT_ID) return
    sendPageView()
    return router.subscribe("onResolved", event => {
      if (event.pathChanged) sendPageView()
    })
  }, [router])
  return null
}
