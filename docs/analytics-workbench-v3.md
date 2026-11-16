# Analytics workspace 03

Historical design/implementation record. The current version and saved before/after
links are documented in [workspace 04](analytics-workbench-v4.md). The current
Analytics entry opens Pages rather than this earlier Overview guide.

Local entry: [Overview](http://127.0.0.1:3001/admin/analytics-workbench/overview). The staff navigation now opens this workspace. Earlier layouts remain at `/admin/analytics/*`, `/admin/ux-analytics`, `/admin/ux-examples/*` and `/admin/experiments`; the [Preview library](http://127.0.0.1:3001/admin/preview-library) links all generations.

## Design decisions

The workspace supports a practical cycle: ask a decision question, check measurement, inspect evidence, and record an action. It is not a gallery of unrelated charts or a claim that every large company uses the same process.

- Report: Pages & audience, Acquisition.
- Investigate: Feature discovery, Journeys, Retention.
- Improve: Feedback & issues, Release impact, Experiments.
- Setup: Measurement. Overview is a guide and implementation map, not a coded analytics area.

The four locally coded areas (Pages & audience, Acquisition, Measurement and lightweight Feature discovery) are fewer than half of the nine planned areas. Coded core does not mean deployed or account-verified. Five other areas remain example-only designs. No live funnels/cohorts, feedback storage, releases or experiment delivery were activated. The richer eligible → exposed → used concept is preserved separately; the lightweight implementation does not invent those conversion rates.

Use the left section navigation on larger screens and a grouped native section picker on narrow screens. Routine copy is concise; definitions and longer guidance use help controls/disclosures. Source mode is explicit. Dates/device and the Audience/Content/Campaign views are URL-backed; design-only tables explicitly do not respond to reporting filters. The campaign builder hides irrelevant reporting filters and works without a GA4 connection.

## Coded core

### Measurement

- Staff-only `GET /api/admin/analytics/status` and `/api/admin/analytics/report`, using existing staff sessions; revoked staff cannot retain reporting access.
- Configuration is loaded on API startup from `GA4_PROPERTY_ID` (numeric) and `GA4_SERVICE_ACCOUNT_FILE` (protected file outside the checkout). No private key enters the browser or repository.
- Google OAuth library, service-account credentials only, official token endpoint only, `analytics.readonly` scope. No Google calls occur until a configured report is requested by authenticated staff. No account setup or access grants were performed.
- Fixed main/www hostname filter excludes beta. Device/date/report/breakdown are bounded allowlists; no arbitrary property, hostname, query or URL is accepted from the browser.
- No polling. Each uncached report uses a breakdown request and a separate no-dimension total. Five-minute server cache, bounded entries, serialized upstream calls, timeouts and sanitized errors.
- Complete days through yesterday in the property's timezone. Row cap 200, returned `rowCount`, thresholding/high-cardinality/sampling metadata remain visible. Active users and page sessions are not summed across overlapping rows.
- Configuration present is not connection verified. Missing configuration yields an explicit empty state in GA4 mode; sample numbers are never substituted.

Public collection now also implements `content_view` after hydrated, successfully loaded results. It records initial direct-linked and changed rankings event/region/format, and statistics view/event context. Strict-effect repeats are deduplicated; returning to a page starts a fresh initial content view. Failed/placeholder loads do not count as content impressions. Page views remain separate.

The first eligible external entry can preserve a complete, bounded `utm_source` / `utm_medium` / `utm_campaign` and optional `utm_content` as explicit `campaign_*` fields. Page URLs still omit arbitrary queries/fragments. Malformed, duplicate, incomplete or self-referring campaign sets are ignored. Tags are naming inputs, not automatic validation that their content is non-personal. Tracking version is `2`.

Production host/path restrictions, DNT/GPC/opt-out, session-only cookies and local-off defaults are retained. No consent system was added. Beta remains untracked. Review consent requirements and overlapping enhanced measurement before any deployment.

### Pages & audience

- Page-path table with session/engagement/user/view counts, row search, sorting, row denominator inspection and CSV export.
- Audience breakdowns by device category, operating system, browser or device branding. These are distinct dimensions: iOS is not comparable to Google as if both were devices.
- Headline totals are separate GA4 totals, not sums of table users. Search changes rows only. Each report shows its own scope and any upstream limitations.
- Pages, Audience technology and Event & region content are separate report views. Distribution bars use whole-report denominators; tables preserve exact counts, unknowns and search/sort/export.
- Bounded content reporting is locally coded for cubing event, selected content region, event × region, result type, statistics view, initial/change and content page. A fixed page filter separates Rankings from Statistics. Metrics are content-event count and independently deduplicated total users, not page views or fabricated conversions. Required custom dimensions and live Google compatibility remain unverified. Old page counts cannot reconstruct historical selections.

### Acquisition

- Session acquisition by source/medium, default channel group, campaign or landing page. First-user acquisition and multi-touch reporting are deferred.
- Volume and engaged-session share use the same row's counts. No fabricated region-conversion rate, advertising cost, CPA or ROAS.
- Working local external-link builder with destination, tagged source/medium/campaign, optional variation, presets, field-level validation, selectable URL and CSV download. The draft survives switching Acquisition views, not leaving/reloading the page. It does not visit links, publish campaigns or launch advertising. Naming validation does not create a randomized experiment.
- Pages, Acquisition reports and Feature discovery include the Dev Analysis Log with source provenance: question, evidence and next action. It saves at most 30 browser-local notes scoped to the signed-in staff ID, with a protected CSV export. Notes are not shared, server-backed or sent to Google. Save has an immediate undo; the cap does not replace old notes. Practice and GA4 notes remain separate. Shared storage is undecided.
- CSV exports contain source/date/device/timezone markers and defuse formula-like external labels. Exports contain only currently visible rows; headline totals remain independent.

### Lightweight feature signals

- Three fixed features: Ranking filters, Region prompt and Statistics views. A bounded two-dimension report keeps feature name and exposure/use event name separate, using event count and total users. Filters include only the two declared events and three feature IDs.
- Repeated signal counts and recognized browser populations are shown separately. These are not same-session joins; no conversion rate or eligible-visit denominator is estimated. Interaction can precede the viewport timer and generates an interaction-based exposure, as stated in the rule.
- Period/device filters, source isolation, report metadata, limitations and signal CSV exports use the shared reporting foundation. The `feature_name` custom dimension and production collection still require live verification.
- The earlier richer design remains at `/admin/analytics-feature-concept` and in the Preview library.

## Deferred designs

| Area | Design focus | Deliberately not implemented |
| --- | --- | --- |
| Advanced feature discovery | Earlier eligible → exposed → used concept | Eligible-session denominator, same-session joins and advanced feature diagnostics |
| Journeys | Ordered region-setup funnel; navigation paths kept distinct | Ordered backend, login continuity analysis, source cross-filtering |
| Retention | Original cohorts, completed weeks, unavailable cells | Durable identity changes and live cohort reporting |
| Feedback & issues | Optional asynchronous inbox, structured context, reviewed categories | Public collection, storage, moderation, LLM classification |
| Release impact | Release notes, comparable windows, traffic-mix context | Deployment integration, before/after calculation, causal lift |
| Experiments | Hypothesis, primary outcome, guardrail, decision rule | Assignment, exposure delivery, launch, significance/winner calculation |

The fixed example values across deferred pages are not a shared live dataset and must not be reconciled as one. No moderated or scheduled studies are required.

## Earlier preview readability pass

- All six deferred reports now explain the question and reading direction before the evidence, followed by a short next-action cue and interpretation limit. Definitions and implementation prerequisites are expandable rather than separate walls of text.
- Journeys has selectable funnel steps, proportional bars, original-entry and previous-step denominators, and the exact same counts in an expandable table. It is an ordered, same-visit example, not navigation-path analysis.
- Retention has selectable return-rate cells that reveal exact counts against the original starting group. Unavailable follow-up cells remain unavailable, not zero. No identity or cookie changes were made.
- Feedback has an invented report list and selected-message detail, with visitor-selected category and attached content context distinguished. A proposed structured visitor flow is described, not implemented or activated.
- Release comparison and experiment planning retain their detailed tables and standard terms. Pages & audience and Acquisition have short contextual reading guides; real reporting behavior is unchanged.
- Layouts remain proposals for review. Connecting real data will require loading, error, empty and access states; it must not be presented as approval to activate deferred features or as a hidden major redesign. Earlier workspace generations remain unchanged.

### Earlier behavioral visual pass (local preview only)

- The preserved feature concept has selectable invented features, three proportional stages, visibility/use-after-exposure/overall-use rates, and exact counts of unexposed/exposed-without-use sessions. This remains a concept, not the aggregate signal report. Different feature populations must not be added together.
- Retention now links a weekly curve, six starting-group rows, a rate/count switch and a selected-cell denominator detail. Week 0 is 100% on the curve; Week 1–4 are exact calendar-week returns, not cumulative returns or a requirement to return every intervening week. Weeks start Monday in Asia/Manila, with completed follow-up through October 18, 2026. Missing weeks stay unplotted/unavailable, never zero.
- Chart and table share one invented fixture in `behavior-preview.ts`; the older workspace previews are untouched. Colors supplement exact labels and keyboard-accessible selection, rather than replacing them. Gray curves represent the other sample groups, not a benchmark. These small invented groups do not establish a trend or causal design impact.
- Reading instructions are expandable on these two pages so the visual evidence appears earlier. Dark/light styles and narrow-screen layouts use the existing admin theme. No new chart library, tracking, durable identity, retention cookies, cohort-query backend or external account connection was added.
- Presentation references: [PostHog retention](https://posthog.com/docs/product-analytics/retention) (curve/table and start/return definitions), [Amplitude retention](https://www.amplitude.com/docs/analytics/charts/retention-analysis/retention-analysis-build) (linked comparisons and explicit event scope). Advanced segmentation, arbitrary event queries and live retention remain deferred.

## Verification and remaining account step

Local checks: admin/public TypeScript, admin production build, shared analytics model/collection tests, Go tests and reporting race checks. Backend tests use temporary databases and mock Google servers, never the user's account. Browser review covers scopes, source isolation, empty states, analysis save/undo, campaign validation, every deferred page, and mobile/desktop layouts.

An isolated public debug preview verified an initial 2×2 average content view, a later 3×3 change with only one page view, and statistics initial/view-change signals. It confirmed no Google script loaded. The temporary preview was stopped afterward. The normal local API was restarted on loopback with the existing database, without resetting passwords or changing live services.

Not verified: actual Google property authorization, live dimension/metric compatibility on that property, deployed attribution, consent configuration, or production event delivery. Connecting needs the user's chosen property and server-side Viewer credentials; this task creates none. No deployment, push, campaign or experiment launch was performed.

Final checks: 31 JavaScript tests passed; the complete Go suite passed with race detection; both applications passed TypeScript and production builds (public prerender: 12 pages). Responsive review covered 390px and 1280px, with no document-width overflow at 390px; temporary viewport settings were reset. The library visibly contains all 30 current/earlier pages. A sample CSV download was verified. The disposable QA analysis note was undone and did not remain saved. The existing local admin account's `updated_at` remains October 20; no password reset occurred.

Latest local implementation verification: 44 JavaScript tests, admin TypeScript/build, and the complete Go test suite with race detection passed. New content/feature reports use mock responses for API tests; real account compatibility remains unverified. The library now includes 34 destinations and the separately preserved feature concept. See [the implementation handoff](analytics-local-implementation.md) for the current scope and deferred account steps; the earlier verification notes above are historical.

References: [GA4 Data API](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport), [dimensions/metrics](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema), [campaign configuration](https://developers.google.com/analytics/devguides/collection/ga4/reference/config), [Google server-to-server authorization](https://developers.google.com/identity/protocols/oauth2/service-account).
