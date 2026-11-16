import { createFileRoute } from "@tanstack/react-router"

import { ThemeToggle } from "../../components/ThemeToggle"
import { PageHeader } from "../../components/ui"

export const Route = createFileRoute("/_authed/settings")({ component: SettingsPage })

function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" />
      <section className="card p-5" aria-labelledby="appearance-heading">
        <h2 id="appearance-heading" className="text-sm font-semibold">Appearance</h2>
        <p className="mt-1 mb-4 text-sm text-zinc-500">Applies to the admin dashboard. Saved in this browser.</p>
        <ThemeToggle />
      </section>
    </div>
  )
}
