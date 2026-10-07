// Response shapes of the public PCA API.

export type RankingFormat = "single" | "average"

export interface RankingRow {
  wca_id: string
  person_name: string
  region: string | null
  value: string
  solves: Partial<Record<"value1" | "value2" | "value3" | "value4" | "value5", string | null>> | null
  competition: { id: string; name: string }
  event: { id: string; name: string }
}

export interface RegionChoice {
  id: string
  name: string
}

export interface PublicUser {
  first_name: string
  last_name: string
  wca_id: string | null
  region: string | null
  region_updated_at: string | null
  created_at: string | null
}

export interface RegionUpdateRequest {
  region: string
  status: "Pending" | "Approved" | "Denied" | string
  created_at: string | null
}

export interface Snapshot {
  id: number
  export_version: string
  latest_year: number | null
  activated_at: string | null
}

export interface StrengthCoverage {
  ranked_competitors?: number
  matched_home_region?: number
  missing_home_region?: number
  ambiguous_home_region?: number
}

export interface StrengthSlot {
  wca_id: string | null
  name: string | null
  national_rank: number | null
  is_penalty: boolean
}

export interface StrengthRow {
  placement: number
  score: number
  contributor_count: number
  slots: StrengthSlot[]
}

export interface StrengthByEvent {
  snapshot: Snapshot
  event: { id: string; name: string }
  format: RankingFormat
  methodology: string
  coverage: StrengthCoverage
  regions: Array<StrengthRow & { region_id: string; region_name: string }>
}

export interface StrengthByRegion {
  snapshot: Snapshot
  region: { id: string; name: string }
  format: RankingFormat
  methodology: string
  coverage: Record<string, StrengthCoverage>
  events: Array<StrengthRow & { event_id: string; event_name: string }>
}

export interface GrowthCoverage {
  assigned_competitions?: number
  unclassified_competitions?: number
}

export interface GrowthPoint {
  year: number
  value: number
  change: number | null
  percent_change: number | null
}

export interface GrowthSeries {
  region_id: string
  region_name: string
  values: GrowthPoint[]
}

export interface GrowthMetric {
  snapshot: Snapshot
  metric: string
  methodology: string
  coverage: GrowthCoverage
  series: GrowthSeries[]
}

export interface PopularEventPoint {
  year: number
  participations: number
  unique_competitors: number
}

export interface PopularEventSeries {
  event_id: string
  event_name: string
  values: PopularEventPoint[]
}

export interface PopularEvents {
  snapshot: Snapshot
  scope: { id: string; name: string }
  metric: string
  methodology: string
  coverage: GrowthCoverage
  events: PopularEventSeries[]
}

// HTTP.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string | undefined,
    readonly body: unknown,
  ) {
    super(detail || `Request failed with status ${status}`)
    this.name = "ApiError"
  }
}

export class NetworkError extends Error {
  constructor(cause: unknown) {
    super("The server could not be reached.", { cause })
    this.name = "NetworkError"
  }
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  json?: unknown
}

/** fetchJson calls the API and throws ApiError/NetworkError on failure. */
export async function fetchJson<T>(url: string, { json, headers, ...init }: RequestOptions = {}): Promise<T> {
  const h = new Headers(headers)
  h.set("Accept", "application/json")
  if (json !== undefined) h.set("Content-Type", "application/json")
  let response: Response
  try {
    response = await fetch(url, { ...init, headers: h, body: json === undefined ? undefined : JSON.stringify(json) })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error
    throw new NetworkError(error)
  }
  const text = await response.text()
  let body: unknown = undefined
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }
  if (!response.ok) {
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
    const detail = typeof record.detail === "string" ? record.detail : typeof record.error === "string" ? record.error : undefined
    throw new ApiError(response.status, detail, body)
  }
  return body as T
}
