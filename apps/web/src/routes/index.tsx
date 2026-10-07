import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"

import { Layout } from "../components/Layout"
import { SITE_URL } from "../lib/config"
import { pageHead } from "../lib/seo"

export const Route = createFileRoute("/")({
  head: () => {
    const head = pageHead({ title: "Home" })
    return {
      meta: [...head.meta, { httpEquiv: "refresh", content: "0; url=/regional-rankings" }],
      links: SITE_URL ? [{ rel: "canonical", href: `${SITE_URL}/regional-rankings` }] : [],
    }
  },
  component: Home,
})

function Home() {
  const navigate = useNavigate()
  useEffect(() => {
    navigate({ to: "/regional-rankings", replace: true })
  }, [navigate])
  return (
    <Layout>
      <p className="max-w-1340 mx-auto px-4 py-10">
        Taking you to the <Link to="/regional-rankings">regional rankings</Link>…
      </p>
    </Layout>
  )
}
