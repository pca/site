# Frontend migration: comparison before transfer

## Compared revisions

- Old repository: pca/web-frontend, branch `2026-updates`.
- Old baseline before the unpushed commit: `0f36d03`.
- Commit being transferred: `9568dc9` — Build regional and growth statistics experiences.
- Site baseline before any migration edits: `0060b59` on `main`.

## Finding: the untouched code is not identical

The new Site repository is a rewrite with a different source layout and runtime:
Gatsby/JavaScript in web-frontend became TanStack Start, Vite and TypeScript in
`apps/web`; the combined repository also contains a Go API, an admin frontend,
shared types, and a pnpm workspace. A direct cherry-pick of Gatsby files would not
integrate with this application.

All 24 assets that can be directly matched between the old baseline's event
icons/fonts and Site have identical Git blob hashes. This establishes exact
asset equality, not source-code or full behavioral equality.

The baseline statistics views implement the same broad ranking/history concepts,
but Site has different routing, query caching/cancellation, prerendering, shared
types, API URLs (the /api prefix), and CSS variables. Site was missing several
user-interface changes present in the unpushed commit.

## Transfer scope

This branch ports only the committed changes in `9568dc9`:

- Growth chart year ranges and transitions; all available events, family legends,
  shades/dashes, visual offsets, omission of inactive 2021, and percentage-first
  event history cells with exact counts below.
- Per-region colors and shorter region names for history-table headers.
- Regional statistics official WCA result types, event-icon selector, region
  cards, expandable additional events, five existing region map silhouettes,
  and the SVG generation helper.
- Rubik for small text/controls/data, Effra for headings; tab overflow fades,
  table/chart/card presentation, and result/source-note placement.
- Header/footer wording, Arena link, development-only Growth Statistics navigation,
  and the thicker active navigation underline.

Site's routing, query cancellation, prerendering and existing API configuration
are retained. The Go API already supports the all-regions `format=official`
endpoint, so no backend migration is required for these frontend changes.
Site's unique SVG accessibility IDs are retained rather than importing the old
hard-coded IDs.

The old RankingList diff is formatting and equivalent string/numeric object-key
notation; it needs no functional port. The old constants.js environment switch is
represented by Site's existing Vite /api and local proxy configuration rather
than copying Gatsby environment variables.

## Separate later work left in the old checkout

The old checkout also contains uncommitted changes in GrowthResults.js,
StrengthResults.js and statistics.scss, plus 13 untracked region SVGs. These are
not included in the ahead commit and have not been transferred or discarded.
This includes later chart sizing/spacing/heatmap adjustments and the remaining
region icons. They require a separate transfer.

## Validation

- Shared-package and public-frontend TypeScript checks passed.
- Public frontend production build passed, including all six prerendered pages.
- All five transferred region SVGs match the source commit's Git blob hashes.
- The patch passes `git diff --check`.

The build's temporary prerendering server stopped when the build finished.
No persistent development server or production deployment is part of this migration.
