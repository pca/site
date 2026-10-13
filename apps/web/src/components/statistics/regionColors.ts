export const REGION_COLORS: Record<string, string> = {
  NCR: "#E5A900",
  CAR: "#C47A00",
  "01": "#B7791F",
  "02": "#D97706",
  "03": "#F6C445",
  "4A": "#FF9800",
  "4B": "#CA8A04",
  "05": "#F59E0B",
  "06": "#5CCEFF",
  "07": "#168BFF",
  "08": "#2563EB",
  18: "#4F46E5",
  "09": "#F43F5E",
  10: "#C0263D",
  11: "#EF4444",
  12: "#FB7185",
  13: "#DC2626",
  BARMM: "#B91C1C",
}

export const ZONE_COLORS: Record<string, string> = {
  luzon: "#D9A300",
  visayas: "#14639B",
  mindanao: "#BC3A31",
  unknown: "#666666",
}

export const getRegionColor = (regionId?: string, zone = "unknown") =>
  REGION_COLORS[regionId || ""] || ZONE_COLORS[zone] || ZONE_COLORS.unknown
