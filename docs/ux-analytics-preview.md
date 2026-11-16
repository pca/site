# Staff UX analytics preview

## Restoring from this chat's stash

The pre-existing Growth Statistics instructions in the untracked root `AGENTS.md` were left in the checkout. This chat's appended instructions were saved separately as `docs/ux-analytics-agents.patch` in the same stash as the admin work, so unrelated instructions were not removed. After applying the stash, check and apply that patch (or merge its additions manually if the shared instructions have changed), then remove the helper patch. Preserve any later edits to `AGENTS.md`.

The existing staff admin now has two additional authenticated routes:

- `/admin/ux-analytics?tab=overview`: sessions, engagement, returning-visitor sessions, acquisition, and a region-onboarding summary.
- `/admin/ux-analytics?tab=journeys`: two ordered session funnels, completion, and step losses.
- `/admin/ux-analytics?tab=features`: feature reach, action-session counts, and sortable interaction rates.
- `/admin/ux-analytics?tab=setup`: GA4 connection requirements and a proposed event catalogue.
- `/admin/experiments`: three selectable experiment concepts, illustrative results, hypotheses, guardrails, and usability tasks.

## Additional product analytics and research examples

`/admin/ux-examples` is a gallery linked from the staff sidebar. It links to five additional authenticated example pages:

- `/admin/ux-examples/audience`: device and first-acquisition mix, experience-segment filtering, and sessions per sample identity.
- `/admin/ux-examples/retention`: clickable weekly cohorts with percentages/counts, segment filtering, exact-week retention, and explicit unobserved weeks.
- `/admin/ux-examples/usability`: three selectable tasks with eight invented attempts each, independent completion, median time among independent completions, post-task ease, and inspectable observations.
- `/admin/ux-examples/feedback`: searchable and theme-filtered invented responses, usefulness ratings, and temporary in-memory triage status. No survey is deployed and review state resets on leaving the page.
- `/admin/ux-examples/quality`: mobile/desktop performance examples and inspectable manual accessibility scenarios. No actual audit or performance scan was run.

The additional fixtures are in `apps/admin/src/lib/ux-examples.ts`. Audience and retention share the same invented identities, grouped into eight Monday-start cohorts (August 24–October 12, 2026). Activity is observed only in complete calendar weeks through October 18, 2026. Aggregate week-N retention sums active counts and original cohort sizes only for eligible cohorts; unobserved weeks are not zeros. Retention means activity in that particular week, not activity on or after the week.

The usability, feedback, and quality examples are separate illustrative datasets. They do not describe the current application or real participants. Ease is a 1–7 post-task mean, not SUS; usefulness is a 1–5 mean, not NPS. Research segmentation is invented, not inferred from competition results. Performance cards show the maximum of the page-level percentiles, never a combined percentile. Feedback text and research observations would require a separate collection/store; they should not be sent to GA4 as event properties.

These are interactive design previews, not a live analytics integration. Every view labels the sample data. Nothing starts an experiment, changes public visitor assignment, sends analytics events, or reads a Google account. Existing staff authentication remains required.

## Sample model

`apps/admin/src/lib/ux-preview.ts` generates deterministic synthetic sessions for September 23–October 20, 2026. The 7-day and 28-day periods and mobile/desktop filters select subsets of the same sessions. Navigation between analytics tabs preserves the selected filters in component state; a reload restores defaults. Session totals, chart values, funnel counts, and feature counts derive from those subsets. Funnel steps are nested and ordered in the synthetic model. Each sample session has one primary feature; this simplifies the preview's session-share denominator and must not be assumed for live usage. Downloaded CSV files identify themselves as samples.

Returning-visitor session share is not cohort retention. Interaction rates use sessions with a defined action / sessions viewing that feature. Experiment concepts use a separate set of explicitly synthetic visitor-level exposure and conversion counts. Relative uplift and percentage-point differences are calculated, but no significance, confidence interval, or winner is claimed.

## Live Google Analytics work still required

1. Confirm the numeric GA4 property ID and property timezone. The public `VITE_GA_MEASUREMENT_ID` is a collection identifier, not reporting authorization.
2. Enable the Google Analytics Data API and authorize a server-side identity for read access. Do not add service-account credentials or OAuth secrets to Vite environment variables or the browser bundle.
3. Add a protected admin reporting API with bounded date ranges, caching, clear errors, and explicit empty/missing-data states. Map reporting dimensions and metrics deliberately; aggregate event counts are not an ordered session funnel. Session-sequence analysis may require a separate supported funnel reporting method or export workflow.
4. Instrument the proposed public events, sanitize URLs (especially WCA OAuth callback query parameters), exclude development traffic, and verify using GA4 DebugView. Do not send names, emails, tokens, or authorization codes as properties.
5. Register needed custom dimensions and agree on key events. Product events in the preview catalogue are proposals and are not currently collected by this change.
6. For experiments, separately implement stable visitor assignment, visible exposure capture, a kill switch, and a predetermined analysis plan. GA4 collects the events; it does not deliver website variants. Google Optimize is retired.

Official references:

- [Google Analytics Data API](https://developers.google.com/analytics/devguides/reporting/data/v1)
- [API quickstart and authorization](https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart)
- [Google Optimize retirement](https://support.google.com/analytics/answer/12979939)

## Review locally

Run the normal local API and admin development services, then sign in through the staff login and follow UX Analytics in the sidebar. The existing admin Dashboard also links to the preview. The layout reuses the staff shell and adds blue, muted gold, and neutral report cards without new dependencies.

Validation: admin production build, admin TypeScript check, and browser review of analytics tabs, filters, experiment selection, briefs, and mobile/desktop layouts. These checks validate the preview; they do not validate a live Google Analytics connection.
