# Local analytics implementation handoff

This is the earlier implementation-pass record. For the latest additions and
current readiness, use [the October 25 continuation](analytics-completion-2026-10-25.md),
[verification](analytics-verification.md) and [deployment](analytics-deployment.md).
Workspace 04 adds bounded descriptive release comparison; references to deferred
release work below describe the earlier pass, not the current code.

This pass implements the approved local sequence. No commit, push, deployment, Google permission grant, credential creation, production data collection or password change was performed. Existing local servers and account data were preserved.

## Open the work

- [Pages](http://127.0.0.1:3001/admin/analytics-workbench/pages)
- [Audience technology](http://127.0.0.1:3001/admin/analytics-workbench/pages?view=audience)
- [Event & region content](http://127.0.0.1:3001/admin/analytics-workbench/pages?view=content)
- [Acquisition reports](http://127.0.0.1:3001/admin/analytics-workbench/acquisition)
- [Campaign link builder](http://127.0.0.1:3001/admin/campaigns)
- [Lightweight feature signals](http://127.0.0.1:3001/admin/analytics-workbench/features)
- [Measurement setup](http://127.0.0.1:3001/admin/analytics-workbench/measurement)
- [Earlier feature-discovery concept](http://127.0.0.1:3001/admin/analytics-feature-concept)
- [All current and earlier previews](http://127.0.0.1:3001/admin/preview-library)

The Dev Analysis Log is included on the report pages. It is browser-local, with CSV export and save/undo—not shared storage or a new developer-only permission role.

## What is implemented locally

### Measurement foundation

The existing staff-only report endpoint now accepts two additional bounded report kinds. The server retains fixed main/www hosts, short caching, maximum 200 breakdown rows, separate totals, explicit reporting dates, timeouts, sanitized errors and upstream limitation flags. It does not accept arbitrary properties, hosts, dimensions, date ranges or external URLs. Report events and feature IDs use case-sensitive allowlists.

The client hides cached live results if the reporting setup check fails or is no longer configured. Missing configuration, failed requests, empty reports, thresholding, sampling and truncated rows remain distinct states. Sample numbers are never substituted into GA4 mode.

### Pages and audience

Pages, Audience technology and Event & region content have separate views. Distribution bars supplement exact tables instead of replacing them. Shares use whole-report totals, not the sum of a displayed top-N list. Audience technology keeps device category, operating system, browser and brand distinct.

Content reports count `content_view` events and distinct GA4 `totalUsers`. Supported breakdowns are cubing event, selected content region, event × region, result type, statistics view, initial/change and content page. A fixed Rankings/Statistics filter is retained in the totals, request, cache key and exported metadata. Region describes the content selection, not physical visitor location. Statistics does not send a selected region or result type; missing/inapplicable values stay visible.

The sample statistics fixture has no view IDs and deliberately shows Not set for that breakdown. No view history is fabricated. Existing page-view history cannot reconstruct past filter selections.

### Acquisition and campaign links

Session acquisition remains source/medium, channel, campaign or landing page. Rates use each row's own session counts. Unknown and direct traffic are retained and explained. There is no invented advertising cost, ROI, conversion or multi-touch attribution.

The separate campaign-builder view works without GA4. It has examples/presets, destination, source, medium, campaign, optional link variation, field-level errors, a selectable generated URL and CSV export. Invalid tags cannot generate/export a URL. The draft survives switching Acquisition views, not leaving/reloading the page. Reporting filters and the report log are hidden while using this independent tool. It never opens the generated link, publishes a campaign or buys advertising.

### Lightweight feature discovery

Only `rankings_filters`, `region_prompt` and `statistics_tabs` are included. The report groups `feature_exposed` and `feature_used` separately, using event count and total users. Repeated signals and distinct recognized browsers are separate measurements.

No eligible-session denominator or same-visit conversion rate is inferred. Those require extra collection/join validation. An interaction can trigger exposure before the one-second visibility timer, which is disclosed in the rule. Exposure is not comprehension; use is not task success. The richer earlier eligible → exposed → used layout remains an explicit sample concept.

### Dev Analysis Log and exports

Notes retain source, report section, timestamp, question, evidence and next action. Storage remains bounded to 30 notes for the current staff ID in this browser. Sample and GA4 notes remain separate. Exported notes/reports defuse formula-like spreadsheet cells. Exporting is a local download, not a shared record or upload.

## Account-dependent work left for the user's return

1. Confirm the intended main-site GA4 property—not the older Arena property—and provide its numeric property ID. The public G-code is not a reporting credential.
2. Enable the Google Analytics Data API and grant a service account Viewer access. Put its protected credential file outside the repository; never paste a private key into chat or client-side configuration.
3. Configure `GA4_PROPERTY_ID` and `GA4_SERVICE_ACCOUNT_FILE` on the appropriate server and restart the API with the new source. No credentials were supplied or created during this pass.
4. Register only needed event-scoped custom dimensions. Start with `event_id`, `region_id`, `content_page` and `feature_name`; add `result_type`, `view_id` and `content_entry` when using those breakdowns.
5. Verify Google dimension/metric compatibility, property access, attribution and actual event delivery. Local mock tests cannot certify these.
6. Before an authorized production release, review consent/privacy requirements and overlapping enhanced measurement. Beta and localhost remain excluded from production tracking. Cookie lifetimes and identity were not expanded.

These dependencies were deferred rather than using broader permissions. Shared Dev Analysis Log storage also needs a separate scope decision.

## Deferred by agreement

No new Overview guide, general query builder, advanced health automation, ordered journeys, navigation-path engine, live retention, feedback storage/moderation, release integration, A/B assignment or experiment launch was built. Existing previews remain available. No moderated or scheduled participant study is required for the approved tools.

## Maintenance contract

Collection uses typed event names and semantic handlers, not brittle selectors tied to button position or CSS classes. Layout-only changes should not alter the meaning of these reports. New pages/features require an explicit ID and measurement definition; renaming an event/parameter or changing eligibility rules requires coordinated reporting tests and a measurement-version review. Do not silently change denominators or reconstruct unavailable history.

Google references: [Data API schema](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema), [core report requests](https://developers.google.com/analytics/devguides/reporting/data/v1/basics). Custom-dimension queries require registration in the chosen property; no account changes were made here.

## Verification

The repeatable release check and the distinction between local simulation and
real Google verification are documented in [Analytics verification](analytics-verification.md).
Latest run on October 24: 47 JavaScript tests, 248 API → admin → CSV contract
cases, the full API race-test suite, both app type checks and the admin production
build passed. That pass also tightened response size/shape/timezone handling and
the dashboard's malformed-response and reporting-period validation. The earlier
implementation-pass results below are retained for history.

- 44 JavaScript tests passed, including all content page/device/period/breakdown combinations, independent user totals, two-dimension CSVs, campaign validation, sample/live provenance and existing collection/privacy tests.
- Admin TypeScript and production build passed. No runtime dependency was added.
- The complete API test suite passed with race detection. Added checks cover content/feature query allowlists, curated event filters, page-specific cache keys, report schemas, staff authentication and missing-configuration responses. Tests use temporary databases and local mock Google responses, not the user's account.
- Browser checks covered content and event × region counts, empty tablet scope, unconfigured GA4 with no sample fallback, campaign presets/invalid input/draft preservation/download action, direct view links and the preserved feature concept. The library exposes 34 current/earlier destinations.
- Narrow-screen checks covered the Content, campaign-builder and feature interfaces with no document-width overflow. A clipped feature-help popup was fixed and verified. Temporary viewport overrides were reset; the existing dark preference was preserved.
- Not verified: real GA4 property authorization, registered custom dimensions, live metric compatibility, production attribution/consent/event delivery, or a deployment. Those are intentionally left as account/release steps, not treated as completed by mock tests.
