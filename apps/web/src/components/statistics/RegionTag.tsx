import { findRegion } from "@pca/shared"
import { getRegionColor, ZONE_COLORS } from "./regionColors"

interface RegionTagProps {
  regionId?: string
  regionName?: string
  variant?: "compact" | "detailed" | "table"
  color?: string
}

export function RegionTag({ regionId, regionName, variant = "compact", color }: RegionTagProps) {
  const region = findRegion(regionId, regionName)
  const zone = region?.zone ?? "unknown"

  const regionColor = color || (variant === "detailed" ? ZONE_COLORS[zone] : getRegionColor(region?.id || regionId, zone))

  if (variant === "detailed") {
    return (
      <span className="statistics-region-detail" title={region?.name || regionName}>
        <span className={`statistics-region-tag zone-${zone}`} style={{ backgroundColor: regionColor }}>{region?.codeName || regionName || "?"}</span>
        <small>{region?.fullName || "Unknown region"}</small>
      </span>
    )
  }

  return (
    <span className="statistics-region-series-label" title={region?.name || regionName || "Unknown region"}>
      <i aria-hidden="true" style={{ backgroundColor: regionColor }} />
      {(variant === "table" ? region?.tableName : region?.shortName) || region?.shortName || regionName || "?"}
    </span>
  )
}
