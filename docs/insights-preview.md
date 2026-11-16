# Insights Lab: three reviewable concepts

Local entry: `/insights`. The other pages are `/performance` and `/region-pulse`.

## Paused after user review — October 21, 2026

Do not implement these during the pause. Revisit the deferred breakdown lifecycle if the user proceeds with these concepts.

**All Insights Lab work is now set aside from the upcoming push/merge scope.** Preserve the six prototype routes locally so the user's existing tabs remain usable; do not close those tabs. The main navigation no longer links to the Lab. No push, merge, staging, or deployment is authorized by this request.

When preparing the later release, keep the prototype components, styles, datasets, six route files, preview generators/tests, and this notes document out of that release unless the user explicitly includes them. Shared-file edits must be separated carefully: the Lab entries in the generated route tree and the six preview entries in `apps/web/vite.config.ts` are prototype-only; preserve the independent Growth Statistics visibility/search-exclusion work. Do not treat unlisted/noindex as removal from a production build. The prototypes still exist in this local checkout for review.

- **Shelved: Competition Breakdown publication and retention.** Consider preparing/publishing breakdowns once a week instead of exposing every historical Philippine competition. Normally retain the current month's breakdowns, but keep each published breakdown visible for at least a full seven days, including across a month boundary. The weekly publication day, handling of delayed results, and exact month-boundary rule are still undecided. No scheduler, expiry logic, or recurring automation has been implemented.
- **Pending and paused: difficulty-aware news/milestone selection.** The current percentage-first and simple sub-X rules favor beginners too much. User examples for 3×3: roughly 40 seconds or slower to sub-20; 30 seconds to sub-14; and 10.00 to 8.90 as a significant improvement at an already fast level. Ordinary sub-30 crossings should not qualify as news on their own. Smaller absolute improvements near 10–7 seconds deserve more weight than comparable beginner improvements. Event-specific criteria for other events still need to be proposed and previewed; do not present them as established standards.
- **Scope distinction for resuming:** news selection should be selective; personal recaps can still show ordinary PBs. No difficulty-aware rule changes have been made yet. All six existing prototype pages remain available.
- **Earlier deferred ideas:** Head-to-Head and Rank Climber remain unimplemented. The Head-to-Head cost discussion is recorded below; no capacity benchmark has been run.

## Additional lightweight concepts

The first three concepts remain intact. “More page ideas” links to three simpler alternatives:

- `/competition-breakdown`: choose one of seven recent competitions and a timed-average final; compare the top eight, the first-to-second average gap, and the winner's attempts. Competitor counts cover the whole competition; finalist counts cover valid averages in the selected event. Rebuild the read-only public fixture with `node scripts/build-competition-preview.mjs`.
- `/milestones`: selected first sub-X average PBs, filtered by event and target. Uses the original 28-day digest, not a complete national list. Targets are illustrative personal milestones, not official WCA categories. A previous PB must be at or above the target and the new average strictly below it.
- `/competition-recap`: select one of the 16 public example competitors and see their latest represented competition across the sampled timed-average events, including new PBs and first valid averages. This is a prototype of an eventual signed-in recap; no authentication or subscription work was added.

These alternatives use the same dated snapshot, have noindex metadata, and are excluded from production navigation and discovery listings. No live collection, comparison engine, notifications, or deployment was added.

These are intentionally modest, interactive, static prototypes. They do not add live ingestion, scheduled publishing, AI-written news, account subscriptions, or new API endpoints. Rank Climber and Head-to-Head are not implemented.

## What each page explores

- Competition Highlights: a 7-day / 28-day digest, an average-PB breakthrough spotlight, first competitions, podiums, and improvement in a less frequently entered event.
- Performance Report: 16 public example competitors, selectable events, previous PB, a recent median baseline, official round attempts, competition-best-average history, and exact source values. A signed-in user's report is a future integration, not simulated here.
- Region Pulse: the same selected digest filtered by competition host region or linked home region, all 18 regions, category filters, and browser-local followed-region preferences. No account writes, notifications or emails.

## Data and caveats

`scripts/build-insights-preview.mjs` reads `apps/api/data/pca.sqlite3` with SQLite's read-only flag. It writes only `apps/web/src/data/insights-preview.json`. Run it from the repository root with `node scripts/build-insights-preview.mjs` after intentionally updating the local data. This does not synchronize with production or call WCA.

The preview is anchored to the latest Philippine competition **start date** in the local results, not today's date or publication time. Its initial snapshot ends September 26, 2026. Every page labels this explicitly.

Only 12 standard timed-average events are analyzed. Official positive round averages are grouped into each person's best average per competition. Prior PBs include Filipino competitors' overseas appearances in the snapshot. Only strictly earlier competition dates count toward a prior PB or baseline. Baselines use the median of up to five previous competition-best averages. The chart shows up to ten appearances, equally spaced, not a continuous time axis. DNF/DNS attempts remain visible in rounds with valid averages.

Improvement stories require at least three earlier valid-average competitions. The spotlight is the largest percentage PB reduction in that window under that rule. “New strengths” also requires at least a 10% improvement and another event with more prior valid-average competition appearances; it does not infer practice habits, specialization, or future performance. Debuts use the earliest recorded competition in the snapshot. Podiums use actual final-round places and final-round averages. Stories are deliberately limited (12 improvement candidates, 4 debut candidates, 6 podium candidates plus qualifying new-strength stories) and are not a complete achievement feed. The headline PB count is unique person–event pairs, not every PB round.

Home regions come from unambiguous nonempty local account region assignments, consistent with existing rankings; not from competition locations. Mapping coverage is stated when this filter is used. No private account fields are exported. Empty feeds must not be interpreted as a region having no cubers or historical competitions.

Verify against the local source database with `node --test scripts/insights-preview.test.mjs`.

## Visibility

Insights Lab appears in the development navigation only. Each preview route is directly accessible but has `noindex, nofollow, noarchive`; each is explicitly prerendered with link crawling disabled and excluded from sitemap/public-page listings. This is not authentication or a secrecy guarantee. Nothing has been deployed as part of the prototype work.

## Head-to-Head: deferred implementation

The existing cached `/api/persons/{wca_id}` response already contains public PBs, rankings, medal/record totals and career counts. A lightweight comparison can load two of these summaries and compare them in the browser. Fifty different opponents would need at most 51 distinct profile loads including the visitor's own profile, before cache reuse. Repeating opponents can reuse already-loaded data. No WCA login or fresh WCA request is necessary per comparison.

This is an architectural expectation, not a measured capacity guarantee. Concurrent traffic, cold-cache queries and response sizes matter. Heavy historical ranking recomputation or generated narrative analysis should not run on every comparison; those summaries should be precomputed during imports. A future implementation should be measured under representative concurrent load, and have bounded input, caching and request limits.
