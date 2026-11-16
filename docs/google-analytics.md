# Google Analytics collection

Public-site collection is configured for `G-EGQD2JBT77` but is **disabled by default**, even with that ID. The local reporting foundation is implemented separately in [workspace 04](analytics-workbench-v4.md), but no reporting credentials or account authorization have been supplied. Earlier dashboard stashes have been restored and their backups retained. No Analytics property was created and nothing was deployed.

## Before deploying

1. In Google Analytics, confirm that `G-EGQD2JBT77` is the **main website's** web stream. The earlier screenshot showed an Arena property; do not send main-site traffic there unintentionally. If this is not the intended stream, override the measurement ID with the correct one before deployment.
2. In **Admin → Data streams → the main-site web stream**, turn **Enhanced measurement off** for this first collection pass. The app explicitly sends route page views and selected product events. In particular, Google's browser-history page views can duplicate manual page views even with `send_page_view: false`. Automatic form, click, and search capture is not part of this curated event plan.
3. The production context in `netlify.toml` supplies `VITE_GA_MEASUREMENT_ID=G-EGQD2JBT77`. Check for an existing Netlify UI variable that overrides it. Only after privacy/consent and duplicate-tag review, explicitly set `VITE_ANALYTICS_ENABLED=1` and rebuild to enable collection. Other hostnames cannot use the production collector.
4. For Docker, set `GA_MEASUREMENT_ID=G-EGQD2JBT77` and, only after the same review, `ANALYTICS_ENABLED=1` in the deployment environment and rebuild the public-site image. No backend API credentials or database changes are needed for browser collection; dashboard reporting separately requires the protected Google credential setup in [the deployment checklist](analytics-deployment.md).
5. Deploy through the normal site release workflow. Check the deployed ID and test the main site in GA4 Realtime / DebugView. This has not been verified against the account from local tests.

The implementation respects Do Not Track, Global Privacy Control, and a local `pca-analytics-opt-out=1` preference. It does not install a consent-management platform or change existing consent settings. If a deployment requires consent before collection, keep analytics disabled until that consent gate is connected; these signals alone are not a consent solution.

The existing session-only cookie setting (`cookie_expires: 0`) is preserved. Returning-visitor and retention analysis across browser sessions is therefore limited; this pass does not silently expand cookie persistence.

## Optional beta-only collection

1. In the existing Google Analytics account, create or reuse a **separate beta property** (for example, **PinoyCubers Beta**), with a web stream for `https://beta.pinoycubers.org`. A separate stream inside the production property is not enough to keep property-wide reports separate. Leave Enhanced measurement off for the beta stream so Google does not duplicate the app's curated events. Don't connect the beta Google tag to the production destination.
2. Copy the beta stream's public **Measurement ID** (`G-…`). No private key, Google Cloud service account, or numeric Property ID is required to send events to GA4. Do not reuse the production ID.
3. After privacy/consent and duplicate-tag review, set `VITE_BETA_GA_MEASUREMENT_ID` to the beta ID and `VITE_BETA_ANALYTICS_ENABLED=1` on the **public beta Netlify deploy context**, then rebuild. If the public beta site is served by Docker instead, use `BETA_GA_MEASUREMENT_ID` and `BETA_ANALYTICS_ENABLED=1` in the compose deployment environment and rebuild the public image. An admin-only Docker build does not build the public tracker. Leave the production analytics settings unchanged.
4. On the deployed beta HTTPS host, open Rankings, change a filter, and open Statistics. Check the **beta property** in GA4 Realtime or DebugView: navigation should produce page views; a filter change should produce a content change, not a second page view. Verify the outgoing tag destination is the beta ID, and that opted-out, localhost and unrelated preview hosts send no beta events.

Beta stays off by default. Only the exact HTTPS beta hostname and the two curated public routes are eligible; cookies are host-only, beta-prefixed and session-scoped. The staff dashboard remains production-only. To turn off beta, unset its enable flag or set it to `0` and rebuild the beta site.

## Collected events

| Event | Trigger / fields |
|---|---|
| `page_view` | First eligible page and each actual path change; sanitized page location, title, and referrer. Filter-only URL changes are not page views. |
| `content_view` | Hydrated, successfully rendered rankings event/region/format or statistics view/event; `content_page`, optional allowlisted context fields, and `content_entry=initial|change`. Repeated identical state is deduplicated. |
| `feature_exposed` | At least 50% of the feature visible for one continuous second in a foreground tab, or an earlier actual interaction. `feature_name`, `exposure_method`. Once per route view. |
| `feature_used` | A changed ranking filter, changed statistics tab, or WCA login click. `feature_name`, `action`. Repeated use is allowed. |
| `rankings_filter_changed` | An actual event/region/result-type change. `filter_name`, `event_id`, `region_id`, `result_type`. Clicking an already selected option does not count. |
| `statistics_view_changed` | An actual regional-statistics tab change. `view_id`. |
| `statistics_event_changed` | An actual regional-statistics event change. `event_id`. |
| `region_prompt_viewed` | The unauthenticated login prompt meets the exposure rule, or its login action is used. |
| `wca_login_started` | The visitor clicks Login with WCA. |
| `wca_login_completed` / `wca_login_failed` | The app's OAuth exchange succeeds/fails. The fixed outcome is held in memory until the code is removed from the URL. |
| `region_request_submitted` / `region_request_failed` | The region-submission API operation succeeds/fails. Success is submission, not staff approval. |

Feature names: `rankings_filters`, `statistics_tabs`, `region_prompt`. Every event now carries `tracking_version=2` and is explicitly routed to the configured stream. No user ID, name, email, WCA ID, authorization code, token, raw search text, or feedback text is included by this implementation. Unknown event parameters are dropped, and explicit page URLs omit queries and fragments. The tag is not initialized while a recognized sensitive callback parameter remains in the URL.

Complete, bounded external-entry `utm_source`, `utm_medium`, `utm_campaign` and optional `utm_content` values are preserved as explicit `campaign_*` fields. Naming uses lowercase letters/numbers/hyphens/underscores up to 64 characters. Duplicate, incomplete, malformed and self-referring sets are ignored. Never put personal data in tag values. This code is not a claim that deployed GA4 attribution has been verified.

Only `https://pinoycubers.org` and `https://www.pinoycubers.org`, on `/regional-rankings` and `/regional-statistics`, can send production events. The independent beta collector is limited to those same paths on `https://beta.pinoycubers.org`. Root redirect, Growth Statistics, concept previews, admin, maintenance, and arbitrary paths are excluded. Local development is off by default. GA4's own automatic session/engagement collection still applies when enabled.

## Reading the numbers

- Define an exposed visitor as a distinct GA4 identity with `feature_exposed` for the feature. Define users of that feature as distinct identities with `feature_used` for it in the same chosen period. Do not divide raw use-event counts by exposure-event counts: one visitor may use a feature repeatedly.
- For per-visit analysis, align the numerator and denominator to the same session/feature scope. A viewport exposure is evidence of visibility, not proof the visitor read or understood it.
- Page views establish navigation history. Keep filter interactions separate to avoid turning each filter click into a new page in path reports.
- WCA login goes to an external site and can be interrupted or blocked. Define and validate the funnel's identity, session and time-window rules in GA4 before interpreting drop-off. These events alone do not prove an ordered, same-session funnel.
- Protected reporting includes pages, technology, session acquisition, bounded content/feature signals, descriptive release comparison, two fixed user funnels and weekly first-session retention. Session-only recognition limits funnel joins and returning-user recognition; no longer-lived identity was added. Real property access, report compatibility and collection remain unverified. Automated health alerts and experiment delivery are not implemented. Release comparison does not establish causation. See [current scope](analytics-completion-2026-10-25.md).

## GA4 reporting configuration

Under **Admin → Custom definitions**, create event-scoped dimensions for the fields you need to explore: `feature_name`, `exposure_method`, `action`, `filter_name`, `event_id`, `region_id`, `result_type`, `view_id`, `content_page`, `content_entry`, and optionally `tracking_version`. Register only needed fields. Definitions generally apply prospectively; verify availability before assuming historical event details can be reported.

If desired, mark `region_request_submitted` as a key event. Keep failed submissions and login failures as diagnostic events, not successes.

## Local verification without sending test traffic

Run the public dev server with `VITE_GA_MEASUREMENT_ID=G-EGQD2JBT77` and `VITE_ANALYTICS_DEBUG=1`. In this mode no Google script is loaded: the last 200 tracking commands are available in `window.pcaAnalyticsDebug` for inspection, and commands are printed in the browser console with a `[PCA analytics]` prefix. Debug mode only works on localhost in development and is not a live GA4 DebugView connection.

Run `node --test scripts/analytics.test.mjs` with the project's Node 22+ runtime. The checks exercise allowed hosts/paths, callback suppression, URL sanitization, page-view deduplication, referrer progression, exposure/use ordering, outcome deferral, payload allowlists, and collection opt-outs. Also run `pnpm --filter @pca/web typecheck` and the production build.

Verified locally on 2026-10-22: eight automated tests, the web TypeScript check, and the production build/prerender pass. Browser QA in local-only debug mode recorded viewport exposures, changed ranking format/region, navigation from Rankings to Statistics, and a statistics-tab change. That sequence produced two page views, not a page view per filter/tab change. No real OAuth login or region submission was performed, and receipt in the live GA4 account remains a deployment check.

References: [Manual page views and history-based duplication](https://developers.google.com/analytics/devguides/collection/ga4/views), [custom event setup](https://developers.google.com/analytics/devguides/collection/ga4/events).
