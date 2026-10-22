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

After this release, the user clarified the Growth-pill padding breakpoint as
around 370px. The local follow-up adds 3px on each side at 370px and below,
preserving the existing font sizes, pill heights, and single-line labels.
Current-year Growth rows still use current values and existing region order for zero-value ties;
the proposed three-year-baseline tiebreaker has not been approved. These are
not silently bundled into this release. The deferred Lab feature decisions
remain deferred.

## Rollout note

No schema migration is required. Existing deployed snapshots need a
`worker statistics` rebuild to apply contributor-tier placements and populate
formatted contributor results. This verification used a temporary copy of the
local database; no production database was changed. Merging code does not
establish that deployment or this rebuild has completed.

## Local follow-up — October 22, 2026

The sections above describe the earlier release at `0b800d2`. This follow-up
includes only the subsequent public-statistics comments from this chat:

- Compact, single-line year-range pills; shorter mobile region/event names
  (including the explicit “Multi BLD” exception); paired region chips retain
  their touch height. The 2021 explanation now sits with the omitted-region
  note above the regional charts.
- Popular-event tables have Participation, Competitors, and Both modes,
  narrower columns and headers, and a neutral reading key styled like the
  values themselves. Its second line reads “Exact count / exact count” in
  Both mode and “Exact count” in either single mode. The footnote has 24px
  clearance before the methodology blocks.
- Horizontal tables use synchronized native top and bottom scrollbars, not
  the rejected custom range control. iOS controls native indicator visibility;
  this follow-up does not claim to force persistent iOS scrollbars or to have
  been tested on a physical iPhone. No additional swipe cue was selected.
- Regional scoring rows expand when their non-interactive area is clicked;
  contributor numbers sit inline before smaller names. Compact place/region
  columns give more space to scoring details. Region-card descriptive names
  are 16px and event names 14px; the expander stays above its revealed content.
- Growth navigation is always visible in local development. In production it
  appears only on the Growth page itself, including query variants and its
  trailing-slash URL, then disappears on other pages. This supersedes the
  earlier blanket hidden-navigation check and is recorded in `AGENTS.md`.
  The chart's tighter right gutter also supersedes the earlier equal-gutter
  check; year labels remain intact.

### Follow-up verification

The exact eight-file staged snapshot was exported into a clean temporary copy,
without the unrelated local Lab routes or configuration. Installed dependencies
were reused; no install or dependency/lockfile change was needed.

- All 12 Growth display/comparison tests passed.
- Shared, public web, and admin TypeScript checks passed.
- Backend tests, race checks, and vet passed; no backend/admin source changes
  are included in this follow-up.
- Public client/server and admin production builds passed. The public build
  prerendered exactly the six intended pages. Both static sites packaged and
  precompressed successfully.
- Built-HTML assertions confirmed the Growth link on its own page and its
  absence on Rankings and Regional Statistics. Growth remains excluded from
  the sitemap/public page list and has `noindex, nofollow, noarchive`.
  All six Lab pages and their discovery entries are absent from the build,
  and no Lab bundle is emitted.
- The final reading key passed all three display modes at 760px, 390px, and
  320px. Its neutral styling, exact-count wording, 24px footnote clearance,
  and absence of page/key horizontal overflow were checked. A final 760px
  screenshot records the table presentation. The earlier 48-case production
  browser matrix is historical, not a newly repeated follow-up test.
- Git whitespace checks passed.

### Excluded work and local-only handoff

The uncommitted Insights Lab files and its route-tree/Vite configuration remain
untouched and excluded. Both analytics stashes are preserved:
`2343215beae1cc35cbd64549c95999ae9f556696` (GA4) and
`4cc17d621d59b3ec520336ab49f8efbbce427806` (UX analytics/research previews).
Legacy `web-frontend` and `web-backend` checkouts remain untouched; their old
pre-migration files are not new release inputs.

This handoff is a local commit and fast-forward of local `main` only. No push,
deployment, production-data change, or automatic future push is included.
