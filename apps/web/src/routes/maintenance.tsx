import { createFileRoute } from "@tanstack/react-router"

import { Layout } from "../components/Layout"
import { PCA_FACEBOOK_URL } from "../lib/config"
import { pageHead } from "../lib/seo"

// Prerendered to maintenance.html, which the server shows on every page while
// staff have maintenance mode switched on in the admin.
export const Route = createFileRoute("/maintenance")({
  head: () => {
    const head = pageHead({ title: "Under Maintenance" })
    return { ...head, meta: [...head.meta, { name: "robots", content: "noindex" }] }
  },
  component: MaintenancePage,
})

function MaintenancePage() {
  return (
    <Layout>
      <section className="mx-auto flex max-w-1140 flex-col items-center px-5 py-24 text-center">
        <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-yellow text-dark">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-12 w-12" aria-hidden="true">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z" />
          </svg>
        </div>
        <h1 className="mb-4 font-effraMd text-3xl text-dark md:text-4xl">We&apos;ll be back soon</h1>
        <p className="mb-8 max-w-xl font-effra text-lg text-gray-dark">
          The website is currently in maintenance mode while we make some upgrades. Thank you for your patience. Please check back shortly.
        </p>
        <a href={PCA_FACEBOOK_URL} rel="noopener" className="rounded bg-blue px-6 py-3 font-effraMd text-light transition-colors hover:bg-blue-dark">
          Follow us on Facebook for updates
        </a>
      </section>
    </Layout>
  )
}
