import assert from "node:assert/strict"
import test from "node:test"
import { growthPlotMargins, growthYearLabelLayout, omitGrowthDisplayYears } from "../apps/web/src/components/statistics/growthDisplay.ts"
import { threeYearComparison } from "../apps/web/src/components/statistics/growthComparison.ts"

test("omits 2021 from regional and event display series, retaining other zero years", () => {
  for (const key of ["value", "participations"]) {
    const series = [{ id: key, values: [2020, 2021, 2022].map(year => ({ year, [key]: 0 })) }]
    const displayed = omitGrowthDisplayYears(series)
    assert.deepEqual(displayed[0].values.map(point => point.year), [2020, 2022])
    assert.equal(displayed[0].id, key)
    assert.deepEqual(series[0].values.map(point => point.year), [2020, 2021, 2022])
  }
})

test("display omission leaves calendar-year comparisons intact", () => {
  const values = [{ year: 2020, value: 12 }, { year: 2021, value: 0 }, { year: 2022, value: 18 }, { year: 2023, value: 20 }]
  omitGrowthDisplayYears([{ values }])
  assert.deepEqual(threeYearComparison(values, values.at(-1)), { average: 10, change: 10, percent: 100 })
})

test("handles empty series and a history containing only the omitted season", () => {
  assert.deepEqual(omitGrowthDisplayYears([]), [])
  assert.deepEqual(omitGrowthDisplayYears([{ values: [{ year: 2021, value: 0 }] }]), [{ values: [] }])
})

test("ten-year mobile charts keep horizontal labels instead of thinning the years", () => {
  const layout = growthYearLabelLayout(9, 380)
  assert.equal(layout.vertical, false)
  assert.equal(layout.bottomMargin, 42)
})

test("crowded full-history charts rotate labels with enough bottom space", () => {
  for (const width of [194, 260, 380]) {
    const layout = growthYearLabelLayout(19, width)
    assert.equal(layout.vertical, true)
    assert.ok(layout.bottomMargin >= 50)
  }
  assert.equal(growthYearLabelLayout(19, 1100).vertical, false)
})

test("empty and single-year charts have a stable horizontal axis", () => {
  for (const count of [0, 1]) assert.equal(growthYearLabelLayout(count, 260).vertical, false)
})

test("plot margins are equal and adapt to the actual value-label width", () => {
  for (const labelWidth of [0, 7, 22.4, 32, 56.2]) {
    const margins = growthPlotMargins(labelWidth)
    assert.equal(margins.left, margins.right)
    assert.ok(margins.left >= 24)
    assert.ok(margins.left >= labelWidth + 12)
  }
  assert.deepEqual(growthPlotMargins(22), { left: 34, right: 34 })
})
