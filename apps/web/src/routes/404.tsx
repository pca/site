import { createFileRoute } from "@tanstack/react-router"

import { NotFound } from "../components/NotFound"
import { pageHead } from "../lib/seo"

export const Route = createFileRoute("/404")({
  head: () => {
    const head = pageHead({ title: "404: Not found" })
    return { ...head, meta: [...head.meta, { name: "robots", content: "noindex" }] }
  },
  component: NotFound,
})
