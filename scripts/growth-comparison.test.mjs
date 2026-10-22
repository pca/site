import assert from "node:assert/strict"
import test from "node:test"
import { threeYearComparison, formatAverageChange } from "../apps/web/src/components/statistics/growthComparison.ts"

const points = entries => entries.map(([year, value]) => ({ year, value }))

test("uses the previous three calendar years, excluding current and older values", () => {
  const values = points([[2022, 9999], [2023, 90], [2024, 215], [2025, 211], [2026, 224]])
  const result = threeYearComparison(values, values.at(-1))
  assert.equal(result.average, 172)
  assert.equal(result.change, 52)
  assert.equal(result.percent.toFixed(1), "30.2")
})

test("includes zero years and works with unsorted history", () => {
  const result = threeYearComparison(points([[2023, 0], [2022, 12], [2021, 0]]), { year: 2024, value: 10 })
  assert.deepEqual(result, { average: 4, change: 6, percent: 150 })
})

test("does not substitute older years or zeros for missing history", () => {
  assert.equal(threeYearComparison(points([[2022, 9], [2024, 12], [2025, 15]]), { year: 2026, value: 18 }), null)
  assert.equal(threeYearComparison([], undefined), null)
  assert.equal(threeYearComparison(points([[2023, NaN], [2024, 1], [2025, 2]]), { year: 2026, value: 3 }), null)
})

test("a zero baseline has a count difference but no percentage", () => {
  for (const value of [0, 12]) {
    assert.deepEqual(threeYearComparison(points([[2023, 0], [2024, 0], [2025, 0]]), { year: 2026, value }),
      { average: 0, change: value, percent: null })
  }
})

test("fractional count changes are signed and rounded to one decimal, without negative zero", () => {
  assert.equal(formatAverageChange(1 / 3), "+0.3")
  assert.equal(formatAverageChange(-2 / 3), "-0.7")
  assert.equal(formatAverageChange(-0.01), "0")
  assert.equal(formatAverageChange(52), "+52")
})
