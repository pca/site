import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { useState, type FormEvent } from "react"

import { api, errorMessage, sessionQuery, setCsrfToken, type Session } from "../lib/api"

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" && search.redirect.startsWith("/") ? search.redirect : undefined,
  }),
  beforeLoad: async ({ context, search }) => {
    if (await context.queryClient.ensureQueryData(sessionQuery)) {
      throw redirect({ href: search.redirect ?? "/" })
    }
  },
  component: Login,
})

function Login() {
  const { redirect: next } = Route.useSearch()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")

  const login = useMutation({
    mutationFn: () => api<Session>("session", { method: "POST", json: { username, password } }),
    onSuccess: async session => {
      setCsrfToken(session.csrf_token)
      queryClient.setQueryData(sessionQuery.queryKey, session)
      await router.navigate({ href: next ?? "/" })
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    login.mutate()
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-6">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-brand text-sm font-bold">PCA</span>
          <div>
            <h1 className="font-semibold">Staff admin</h1>
            <p className="text-xs text-zinc-500">Philippine Cubers Association</p>
          </div>
        </div>
        <label className="label" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          className="input mb-4"
          autoComplete="username"
          autoFocus
          required
          value={username}
          onChange={e => setUsername(e.target.value)}
        />
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          className="input mb-5"
          autoComplete="current-password"
          required
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        {login.isError && (
          <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage(login.error)}
          </p>
        )}
        <button type="submit" className="btn btn-primary w-full" disabled={login.isPending}>
          {login.isPending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  )
}
