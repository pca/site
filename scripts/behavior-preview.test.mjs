import assert from "node:assert/strict"
import { test } from "node:test"
import { featureExamples, previewRate, retentionPoints, returningGroups, returnWeeks } from "../apps/admin/src/lib/behavior-preview.ts"

test("discovery counts preserve nested populations and distinct denominators", () => {
  for (const feature of featureExamples) {
    assert.ok(feature.eligible >= feature.exposed && feature.exposed >= feature.used)
    assert.equal((feature.eligible - feature.exposed) + (feature.exposed - feature.used) + feature.used, feature.eligible)
    assert.notEqual(previewRate(feature.used, feature.exposed), previewRate(feature.used, feature.eligible))
  }
  assert.equal(previewRate(featureExamples[0].used, featureExamples[0].exposed), "45.2%")
})

test("retention curve and heatmap share original counts, including the added week 3", () => {
  for (const group of returningGroups) {
    assert.equal(group.returned.length, returnWeeks.length)
    const points = retentionPoints(group)
    assert.deepEqual(points[0], { week: 0, count: group.size, rate: 100 })
    for (const point of points) {
      assert.ok(point.count >= 0 && point.count <= group.size)
      assert.ok(Math.abs(point.rate - point.count / group.size * 100) < 1e-10)
      if (point.week > 0) assert.equal(point.count, group.returned[point.week - 1])
    }
    const firstMissing = group.returned.indexOf(null)
    if (firstMissing >= 0) assert.ok(group.returned.slice(firstMissing).every(value => value === null))
  }
  assert.equal(previewRate(returningGroups[2].returned[3], returningGroups[2].size), "30.9%")
})

test("unfinished weeks stay absent rather than plotted or displayed as zero", () => {
  const newest = returningGroups.at(-1)
  assert.deepEqual(retentionPoints(newest).map(point => point.week), [0, 1])
  assert.equal(previewRate(null, 102), "Not observed")
  assert.equal(previewRate(0, 102), "0.0%")
  assert.equal(previewRate(0, 0), "Not observed")
})

test("available follow-up cells match the declared Monday-week cutoff", () => {
  const firstMonday = Date.parse("2026-08-31T00:00:00+08:00")
  const cutoffExclusive = Date.parse("2026-10-19T00:00:00+08:00")
  const week = 7 * 24 * 60 * 60 * 1000
  returningGroups.forEach((group, row) => group.returned.forEach((count, column) => {
    const followUpEnd = firstMonday + (row + column + 2) * week
    assert.equal(count !== null, followUpEnd <= cutoffExclusive)
  }))
})
