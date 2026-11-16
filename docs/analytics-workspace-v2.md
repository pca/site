# Analytics workspace — version 2

## Information architecture

This is a local, staff-authenticated design prototype, not a live integration. The earlier previews remain unchanged at their original URLs and in the existing Git stash backups. `/admin/preview-library` is the directory of both generations.

The main navigation has one Analytics entry, replacing three competing analytics/research entries. Within Analytics:

1. Summary: what's happening and which question to investigate next.
2. Pages & audience: which real pages/content people view, on what devices, and from which acquisition channels. Page visits and event/region content views are separate.
3. Acquisition: source/medium, channels, campaigns and landing pages alongside explicit outcome rates. Separate visit scope from first-observed-browser acquisition. Includes a local UTM exercise and temporary analysis note; neither publishes nor stores anything.
4. Features: did eligible sessions expose the control, and did those same sessions use it? Discovery and use belong together, not in separate dashboards.
5. Journeys: where an ordered, session-scoped sequence loses visitors. Navigation paths are a distinct view from task completion.
6. Retention: did a cohort return in a later completed week? Not returning-session share and not an arbitrary activity score.
7. Feedback & issues: one inbox for usefulness feedback, suggestions, and contextual data/UX reports. Category, page, event/region, snapshot, status, and suggested theme appear together. Structured context can be attached by code; interpreting free text requires a person or a reviewed classifier. No LLM is required for this preview.
8. Experiments: planned hypothesis, eligibility, stable assignment/exposure, outcome, guardrails and uncertainty. Results do not automatically imply a winner. A feedback item can link to a relevant experiment.

Settings is secondary: sources, definitions, measurement health, exclusions and release notes. It supports trust but is not presented as visitor behavior. Preview library is also secondary. Moderated studies and manual accessibility examples remain available only in the earlier preview library; they are not required for this online-first workflow.

## Interaction and scope contracts

- URL-backed device/date filters apply consistently to Summary, Pages, Acquisition, Features and Journeys. All derive from one deterministic sample session model.
- Acquisition search filters table rows, not headline totals or share denominators. First acquisition looks up the earliest session across the complete fixture history, not just the selected slice. Its outcomes cover the selected period/device only, with unequal follow-up time; its engaged-identity share is not GA4 session engagement rate. Cross-links to Features/Journeys retain date/device, not the selected source. Source labels are invented, not a GA4 attribution implementation.
- Retention uses the same sample browser identities across eight completed weeks, with a separate cohort scope. Device selection is retained; the traffic date range is explicitly not applied.
- Feedback uses a separate small invented inbox; experiment results use a separate invented assignment dataset. Both display their own scope and do not pretend to respond to traffic filters.
- Cross-links retain applicable traffic filters. Detail selection is local and visibly selected. Each page starts with a plain title, a short question and clear source/scope; extended definitions are behind help controls.
- The sample notice is persistent. No tracking, survey, experiment, Google account connection, issue submission or public visitor changes are activated.
- Feedback triage and concept selection are temporary browser state and reset on reload. The report-form preview explicitly captures nothing.
- Empty filters show an empty state, not silently reset selection. Tables have captions/headers; scroll is contained on narrow screens. Keyboard focus is visible and disclosure controls are labeled.

## Measurement cautions

Raw URLs do not prove valid site pages. Missing-page attempts belong in diagnostics, not the main content ranking. Exposure means visible, not understood. Use means a recorded action, not task success. Funnel steps must occur in order under a declared identity/session/window. Retention uses eligible original-cohort denominators and treats unfinished weeks as unavailable, not zero. Feedback is self-selected and not representative of all visitors. An experiment requires a predefined decision rule; illustrative uplift is not proof of causality.

## Implementation boundaries

No backend or collection changes are needed for this design pass. The existing GA4 collection work remains separate. Connecting live reports later requires reporting authorization and a protected server-side reporting API; feedback requires a separate protected store; experiments require assignment and exposure delivery. Do not deploy or publish this prototype as part of this task.

## Review and verification

The complete [page directory](analytics-preview-links.md) includes every new page and the eleven earlier previews. The old content files remain unchanged; their stash backups are retained.

Run `node --test scripts/acquisition-preview.test.mjs scripts/analytics-workspace.test.mjs scripts/analytics.test.mjs` with Node 22+ to check the shared session model, date/device slices, initial content views, nested feature counts, ordered funnels, retention eligibility, contextual links, acquisition partitions, first-source history, UTM validation, CSV scopes and directory completeness. The admin TypeScript check and production build validate route integration.

For the learning workflow and the boundary between practice data and genuine results, see [Acquisition practice](acquisition-practice.md). The current public collector strips URL queries; approved campaign-field handling must be implemented and verified before claiming that tagged links are correctly attributed. No ad spend is connected, so cost per acquisition and ROAS are unavailable.

Acquisition review: all 22 model/collection tests pass, as do the admin TypeScript check and production build. Browser checks covered source row drilldown, first-acquisition denominators, campaign and landing-page breakdowns, empty search with disabled export, and UTM validation/restoration. Responsive checks covered the form and page-width containment at 390px and the report at 1280px; the viewport override was reset. No campaign was published and no live connection was made.

Browser review covered shared date/device filtering across pages, feature detail selection, the funnel/path toggle, cohort cell inspection and help text, feedback search/empty state, the disabled visitor form, and contextual navigation to a matching experiment. Narrow-screen cohort/help layouts were checked at 390px; the integrated staff shell was checked at 1280px. The new Summary, Settings and Preview library were checked after a normal local staff sign-in. An isolated synthetic-fixture preview was used for early visual checks while the staff tab was signed out; it never exposed the admin API or bypassed its guard. No password was reset. The temporary preview server is stopped after verification; the normal local services remain available.
