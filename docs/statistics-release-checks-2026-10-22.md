# Public statistics release checks — October 22, 2026

## Scope and separation

This release continues the public-site statistics migration on
`migration/frontend-9568dc9`, including its two existing migration commits.
It includes the public rankings/statistics presentation, region icons, Growth
controls and comparisons, regional scoring corrections, contributor results,
footer Instagram link, and production Growth discovery exclusions.

The separate **UX analytics dashboard** work is not included. It remains in
stash `4cc17d621d59b3ec520336ab49f8efbbce427806`, untouched. No admin source
changes are part of this release; the existing admin application was built as
a regression check.

**Insights Lab remains shelved and local.** Its six routes, components, styles,
datasets, generators, tests, notes, generated route-tree entries, and prototype
prerender entries are excluded. The local files remain available for review.
Only the independent Growth prerender entry was staged from the shared Vite
configuration. A clean copy of the staged tree was built and served to verify
the actual release, rather than the prototype-containing working directory.

## Recent comments completed

- Regional Growth history headers use the existing shortened names at 641–900px
  (for example W. Visayas, C. Luzon, Davao, and Cordillera), full names above
  900px, and the existing region codes at 640px and below. Full accessible names
  and tooltips are retained. All three regional Growth views share this rule.
- Regional Rankings now has the same “Select an event” legend style as Regional
  Statistics. Its 17 event buttons and selection behavior are preserved.
- Its Region selector has 4px more space above and below than before.
- Both Regional Statistics methodologies explain the official result types:
  averages for standard events and Fewest Moves; singles for blindfolded events
  and Multi-Blind. A backend regression test prevents omitting this explanation.
- All four Growth exact-values tables place the synchronized horizontal
  scrollbar below the heading and above the column headers.

## Verification

- Shared, public web, and admin TypeScript checks passed.
- Backend `go test ./...`, `go test -race ./...`, and `go vet ./...` passed.
- All 12 Growth display/comparison unit tests passed.
- Clean public client/server builds and all six intended prerendered pages
  passed. The unchanged admin build and combined static-site packaging passed.
  The temporary test copy reused installed dependencies; the frontend builders
  were invoked directly after the package runner rejected its linked dependency
  directory. No package or lockfile changes were needed for the release.
- Production HTTP checks passed: normal public pages and the exact Growth URL
  return 200; all six shelved Lab URLs return 404; no Lab bundles are emitted.
  Growth is absent from production navigation, sitemap, and public page list,
  while its HTML includes `noindex, nofollow, noarchive`. These directives are
  search-engine guidance, not access control or a secrecy guarantee.
- Built admin assets contain none of the stashed UX prototype routes.
- Live test API checks passed for 17 official event/result-type combinations,
  all 18 regions, 1,530 scoring slots, contributor-tier ordering and ties,
  score totals, regional event ordering, and the methodology text.
- All three regional Growth APIs passed 54 three-calendar-year comparisons.
  The source data retains the zero 2021 season for calendar calculations.
  Discontinued-event source data remains available for manual selection.
- Conditional ETag requests return 304; invalid event and format requests
  return the expected 404 and 400 responses.
- Production-browser Growth checks passed for all four views and year ranges
  at 390px, 520px, and 1024px: 48 combinations. Chart labels match history rows,
  2021 is omitted, plot side margins are equal, scrollbars follow their titles,
  and no page-level horizontal overflow appears.
- Tablet shortening passed in all three regional Growth views at 900px.
  Boundary checks at 901px, 640px, and desktop/mobile sizes preserve the
  respective full-name and code tiers.
- Deprecated events are off initially and after Reset; Select all still enables
  them. The 3×3 variants group precedes blindfolded events.
- Mobile ranking event, Region, and Average controls work. All 18 regional
  icons remain 58px squares at 341px, with place badges centered on the icons
  and contributor wording hidden at the compact breakpoint.
- Browser error logs and Git whitespace checks were clean.

## Deliberately unchanged decisions

The ambiguous request for extra Growth-pill padding at “250px” (accompanied by
a much wider screenshot) still needs a breakpoint decision. Current-year Growth
rows still use current values and existing region order for zero-value ties;
the proposed three-year-baseline tiebreaker has not been approved. These are
not silently bundled into this release. The deferred Lab feature decisions
remain deferred.

## Rollout note

No schema migration is required. Existing deployed snapshots need a
`worker statistics` rebuild to apply contributor-tier placements and populate
formatted contributor results. This verification used a temporary copy of the
local database; no production database was changed. Merging code does not
establish that deployment or this rebuild has completed.
