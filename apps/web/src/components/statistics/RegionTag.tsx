import { findRegion, ZONE_COLORS } from "@pca/shared"

interface RegionTagProps {
  regionId?: string
  regionName?: string
  variant?: "compact" | "detailed"
  color?: string
}

export function RegionTag({ regionId, regionName, variant = "compact", color }: RegionTagProps) {
  const region = findRegion(regionId, regionName)
  const zone = region?.zone ?? "unknown"

  if (variant === "detailed") {
    return (
      <span className="statistics-region-detail" title={region?.name || regionName}>
        <span className={`statistics-region-tag zone-${zone}`}>{region?.codeName || regionName || "?"}</span>
        <small>{region?.fullName || "Unknown region"}</small>
      </span>
    )
  }

  return (
    <span className="statistics-region-series-label" title={region?.name || regionName || "Unknown region"}>
      <i aria-hidden="true" style={{ backgroundColor: color || ZONE_COLORS[zone] }} />
      {region?.shortName || regionName || "?"}
    </span>
  )
}
