import { ApiError, fetchJson, type RequestOptions } from "@pca/shared"
import { queryOptions } from "@tanstack/react-query"

const API_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "")

// Types returned by /api/admin.

export interface SessionUser {
  id: number
  username: string
  name: string
  is_superuser: boolean
}

export interface Meta {
  regions: { id: string; name: string }[]
  job_kinds: { id: string; label: string }[]
  auto_rebuild_statistics: boolean
}

export interface Session {
  user: SessionUser
  csrf_token: string
  meta: Meta
}

export type RequestStatus = "p" | "a" | "d"

export const STATUS_LABELS: Record<RequestStatus, string> = { p: "Pending", a: "Approved", d: "Denied" }

export interface RegionRequest {
  id: number
  user_id: number
  region: string
  status: RequestStatus
  staff_notes: string
  created_at: string | null
  updated_at: string | null
}

export interface AdminRequest extends RegionRequest {
  user: { username: string; name: string; wca_id: string | null; region: string | null }
}

export interface AdminUser {
  id: number
  username: string
  name: string
  first_name: string
  last_name: string
  email: string
  wca_id: string | null
  region: string | null
  region_updated_at: string | null
  is_staff: boolean
  is_superuser: boolean
  is_active: boolean
  has_wca_account: boolean
  has_password: boolean
  request_count: number
  date_joined: string | null
  last_login: string | null
}

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "skipped"

export interface Job {
  id: number
  kind: string
  kind_label: string
  status: JobStatus
  source: string
  requested_by: string
  force: boolean
  error: string
  created_at: string | null
  started_at: string | null
  finished_at: string | null
  duration_ms: number
  log?: string
}

export interface Worker {
  alive: boolean
  heartbeat: { at: string; pid: number; hostname: string; cron: string; next_sync: string | null } | null
  import: {
    export_date: string
    export_format_version: string
    archive_bytes: number
    imported_at: string
    source: string
  } | null
}

export interface StatusCounts {
  pending: number
  approved: number
  denied: number
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  pages: number
  page_size: number
}

export interface Dashboard {
  request_counts: StatusCounts
  users_total: number
  regions: { id: string; name: string; count: number }[]
  pending: AdminRequest[]
  jobs: Job[]
  worker: Worker
  snapshot: { id: number; export_version: string; latest_year: number; activated_at: string | null } | null
}

export interface Message {
  message: string
}

// Client.

let csrfToken = ""

export const setCsrfToken = (token: string) => {
  csrfToken = token
}

/** api calls /api/admin/PATH with the session cookie and CSRF header. */
export function api<T>(path: string, { headers, method = "GET", ...init }: RequestOptions = {}) {
  const h = new Headers(headers)
  if (method !== "GET" && method !== "HEAD") h.set("X-CSRF-Token", csrfToken)
  return fetchJson<T>(`${API_URL}/admin/${path.replace(/^\//, "")}`, {
    ...init,
    method,
    headers: h,
    credentials: "same-origin",
  })
}

export const isUnauthorized = (error: unknown) => error instanceof ApiError && error.status === 401

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong. Please try again."

const query = (params: Record<string, string | number | undefined>) => {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") qs.set(key, String(value))
  }
  const s = qs.toString()
  return s ? `?${s}` : ""
}

export const sessionQuery = queryOptions({
  queryKey: ["session"],
  queryFn: async () => {
    try {
      const session = await api<Session>("session")
      setCsrfToken(session.csrf_token)
      return session
    } catch (error) {
      if (isUnauthorized(error)) return null
      throw error
    }
  },
  staleTime: Infinity,
})

export const dashboardQuery = queryOptions({
  queryKey: ["dashboard"],
  queryFn: () => api<Dashboard>("dashboard"),
  refetchInterval: 15_000,
})

export interface RequestFilters {
  status?: RequestStatus | "all"
  q?: string
  region?: string
  page?: number
}

export const requestsQuery = (f: RequestFilters) =>
  queryOptions({
    queryKey: ["requests", f],
    queryFn: () => api<Page<AdminRequest> & { counts: StatusCounts }>(`requests${query({ ...f })}`),
  })

export interface UserFilters {
  q?: string
  region?: string
  staff?: boolean
  page?: number
}

export const usersQuery = (f: UserFilters) =>
  queryOptions({
    queryKey: ["users", f],
    queryFn: () => api<Page<AdminUser>>(`users${query({ ...f, staff: f.staff ? 1 : undefined })}`),
  })

export const userQuery = (id: number) =>
  queryOptions({
    queryKey: ["user", id],
    queryFn: () => api<{ user: AdminUser; requests: RegionRequest[]; is_self: boolean }>(`users/${id}`),
  })

export const jobsQuery = (page: number) =>
  queryOptions({
    queryKey: ["jobs", page],
    queryFn: () => api<Page<Job> & { worker: Worker }>(`jobs${query({ page })}`),
    refetchInterval: q => (q.state.data?.items.some(j => j.status === "queued" || j.status === "running") ? 2000 : 10_000),
  })

export interface MaintenanceState {
  enabled: boolean
  updated_by: string
  updated_at: string | null
}

export const maintenanceQuery = queryOptions({
  queryKey: ["maintenance"],
  queryFn: () => api<MaintenanceState>("maintenance"),
  refetchInterval: 30_000,
})

export interface SyncSchedule {
  /** Cron expression in Asia/Manila time; "" means scheduled syncs are off. */
  cron: string
  default_cron: string
  custom: boolean
  updated_by: string | null
  updated_at: string | null
  next_runs: string[]
}

export const scheduleQuery = queryOptions({
  queryKey: ["schedule"],
  queryFn: () => api<SyncSchedule>("schedule"),
})

export interface Backup {
  name: string
  size_bytes: number
  created_at: string
}

export const backupsQuery = queryOptions({
  queryKey: ["backups"],
  queryFn: () => api<{ items: Backup[]; keep: number }>("backups"),
})

export const backupDownloadUrl = (name: string) => `${API_URL}/admin/backups/${encodeURIComponent(name)}`

export const jobQuery = (id: number) =>
  queryOptions({
    queryKey: ["job", id],
    queryFn: () => api<Job>(`jobs/${id}`),
    refetchInterval: q => (q.state.data && (q.state.data.status === "queued" || q.state.data.status === "running") ? 1500 : false),
  })
