/** Omit the inactive 2021 season from display, without changing source history. */
export const omitGrowthDisplayYears = <T extends { values: { year: number }[] }>(series: T[]): T[] =>
  series.map(item => ({
    ...item,
    values: item.values.filter(point => point.year !== 2021),
  }))

/** Preserve every year label; use vertical text when horizontal labels would overlap. */
export function growthYearLabelLayout(yearCount: number, plotWidth: number) {
  const gap = plotWidth / Math.max(1, yearCount - 1)
  const vertical = yearCount > 1 && gap < 34
  return { vertical, bottomMargin: vertical ? 54 : 42, fontSize: vertical && gap < 12 ? 10 : 11 }
}

/** Balance the plot gutters while reserving only the space its value labels need. */
export function growthPlotMargins(valueLabelWidth: number) {
  const side = Math.max(24, Math.ceil(valueLabelWidth) + 12)
  return { left: side, right: side }
}
