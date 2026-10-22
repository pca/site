type AnnualValue = { year: number; value: number }

/** Compare with the preceding three calendar years, never the current year. */
export function threeYearComparison(values: AnnualValue[], current?: AnnualValue) {
  if (!current || !Number.isFinite(current.value)) return null
  const previous = [1, 2, 3].map(offset => values.find(point => point.year === current.year - offset))
  if (previous.some(point => !point || !Number.isFinite(point.value))) return null
  const average = previous.reduce((sum, point) => sum + point!.value, 0) / 3
  const change = current.value - average
  return { average, change, percent: average === 0 ? null : change / average * 100 }
}

const changeFormat = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 1, signDisplay: "exceptZero" })

export const formatAverageChange = (value: number) => changeFormat.format(Math.round(value * 10) / 10)
