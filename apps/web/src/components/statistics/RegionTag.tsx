import { findRegion } from "@pca/shared"
import { getRegionColor, ZONE_COLORS } from "./regionColors"

interface RegionTagProps {
  regionId?: string
  regionName?: string
  variant?: "compact" | "detailed" | "table"
  color?: string
  abbreviateName?: boolean
  responsiveName?: boolean
}

export function RegionTag({ regionId, regionName, variant = "compact", color, abbreviateName = false, responsiveName = false }: RegionTagProps) {
  const region = findRegion(regionId, regionName)
  const zone = region?.zone ?? "unknown"

  const regionColor = color || (variant === "detailed" ? ZONE_COLORS[zone] : getRegionColor(region?.id || regionId, zone))

  if (variant === "detailed") {
    const fullName = region?.fullName || "Unknown region"
    const abbreviatedName = fullName.replace("Administrative", "Admin.").replace("Autonomous", "Auton.")
    const displayName = abbreviateName ? abbreviatedName : fullName
    const compactName = region?.shortName.split(" · ").slice(1).join(" · ") || abbreviatedName
    return (
      <span className="statistics-region-detail" title={region?.name || regionName}>
        <span className={`statistics-region-tag zone-${zone}`} style={{ backgroundColor: regionColor }}>{region?.codeName || regionName || "?"}</span>
        <small title={abbreviateName || responsiveName ? fullName : undefined}>
          {responsiveName ? (
            <>
              <span className="sr-only">{fullName}</span>
              <span aria-hidden="true">
                <span className="region-name-full">{displayName}</span>
                <span className="region-name-abbreviated">{abbreviatedName}</span>
                <span className="region-name-compact">{compactName}</span>
              </span>
            </>
          ) : displayName}
        </small>
      </span>
    )
  }

  return (
    <span
      className={`statistics-region-series-label${variant === "table" ? " statistics-region-table-label" : ""}`}
      title={region?.name || regionName || "Unknown region"}
      aria-label={variant === "table" ? region?.name || regionName || "Unknown region" : undefined}
    >
      <i aria-hidden="true" style={{ backgroundColor: regionColor }} />
      {variant === "table" ? (
        <>
          <span className="region-table-name" aria-hidden="true">
            <span className="region-table-full-name">{region ? `${region.tag} · ${region.fullName}` : regionName || "?"}</span>
            <span className="region-table-short-name">{region?.shortName || regionName || "?"}</span>
          </span>
          <span className="region-table-code" aria-hidden="true">{region?.tag || regionId || "?"}</span>
        </>
      ) : region?.shortName || regionName || "?"}
    </span>
  )
}
