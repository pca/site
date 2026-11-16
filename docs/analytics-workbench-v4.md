# Analytics workspace 04

The [October 25 continuation](analytics-completion-2026-10-25.md) extends this
redesign with fixed journeys, returning-group reports, account-only feedback and
saved experiment planning. The five-area implementation boundary below records
the initial redesign pass, not the latest code.

## Review and compare

Open [the current Pages report](http://127.0.0.1:3001/admin/analytics-workbench/pages?mode=sample&days=28&device=all)
or [the Preview library](http://127.0.0.1:3001/admin/preview-library).
The library keeps current report views and earlier generations separate.

The pre-redesign build is frozen under the Git-ignored
`archive/analytics-before-2026-10-24/viewer`. The development server serves it at
`/admin/analytics-before/`; the production build does not include it. The snapshot
uses the same normal admin sign-in. It freezes code and visuals, not the API or
browser-local data. Use Sample mode for an equivalent comparison.

| Area | Current | Saved before version |
| --- | --- | --- |
| Pages & audience | [Open](http://127.0.0.1:3001/admin/analytics-workbench/pages?mode=sample) | [Before](http://127.0.0.1:3001/admin/analytics-before/analytics-workbench/pages?mode=sample) |
| Acquisition | [Open](http://127.0.0.1:3001/admin/analytics-workbench/acquisition?mode=sample) | [Before](http://127.0.0.1:3001/admin/analytics-before/analytics-workbench/acquisition?mode=sample) |
| Campaign builder | [Open](http://127.0.0.1:3001/admin/campaigns) | [Before](http://127.0.0.1:3001/admin/analytics-before/analytics-workbench/acquisition?view=campaign) |
| Feature signals | [Open](http://127.0.0.1:3001/admin/analytics-workbench/features?mode=sample) | [Before](http://127.0.0.1:3001/admin/analytics-before/analytics-workbench/features?mode=sample) |
| Release impact | [Open](http://127.0.0.1:3001/admin/analytics-workbench/releases?mode=sample) | [Before](http://127.0.0.1:3001/admin/analytics-before/analytics-workbench/releases?mode=sample) |
| Measurement | [Open](http://127.0.0.1:3001/admin/analytics-workbench/measurement) | [Before](http://127.0.0.1:3001/admin/analytics-before/analytics-workbench/measurement) |

A separate sanitized source/build snapshot was saved outside the checkout before
the redesign, with a hash inventory. It contains selected analytics/admin source
and the compiled admin UI, not a full database or whole-system backup. The helper
`scripts/snapshot-analytics.mjs NEW_DIRECTORY` refuses to overwrite a snapshot.
The optional `preview-analytics-snapshot.mjs SNAPSHOT_DIRECTORY` provides a
loopback-only, synthetic-session, sample-only viewer without any real API access.
Do not deploy that viewer or treat its synthetic session as real authentication.

## Design system and navigation

- One desktop admin navigation rail, with grouped analytics sections. The
  duplicate inner rail was removed. Mobile uses the existing native section
  picker and scrollable admin navigation; sign-out stays in the compact header.
- Analytics opens Pages & audience rather than adding a mandatory guide screen.
- Consistent source, period and device controls; explicit sample/live/error
  states. The campaign tool and measurement setup do not display irrelevant
  reporting filters.
- Visual hierarchy: metric totals, visual evidence, exact tables, then analysis.
  Help and definitions remain available without a large tutorial above the data.
- A restrained purple/teal report palette, clearer cards/tables, shared light/dark
  styles and native keyboard-accessible controls. Color does not replace labels,
  counts, denominator definitions or uncertainty.
- Earlier generations keep their original routes and styles. Deferred pages use
  the updated current-workspace presentation but remain explicitly previews.

Patterns were evaluated from official product documentation and published UI:
[PostHog web analytics](https://posthog.com/docs/web-analytics/dashboard) for
traffic trends and breakdowns; [Amplitude dashboards](https://www.amplitude.com/docs/analytics/dashboard-create)
for chart/table/KPI organisation; [Mixpanel Insights](https://docs.mixpanel.com/docs/reports/insights)
for explicit metrics, breakdowns and detail; [Microsoft Clarity](https://learn.microsoft.com/en-us/clarity/insights/dashboard-features)
for filtering and contextual dashboard cards. These are design references, not
integrations. No branding, proprietary asset, autocapture SDK or session replay
was copied into this project.

## Functional additions

### Daily traffic

Pages now supports a bounded `breakdown=date` report. The daily chart has sessions,
page views and engaged sessions, exact values, date inspection and CSV. It uses
the same complete period/device scope as the surrounding report, not a selected
page row or acquisition source. Missing withheld/sampled/truncated dates remain
gaps; daily users are never summed to manufacture period users. No unsupported
previous-period uplift is displayed. The extra daily query costs two cached
Google requests on a cache miss, only when that view is used.

### Event × selected region

The combined content breakdown can switch between a bounded heatmap and ranked
bars. Cells share the exact returned rows with the table and CSV. It limits the
map to 10 leading events and 8 regions, discloses truncation, and never fills an
absent combination with a claimed zero. Regions describe content selections,
not physical visitor locations.

### Saved campaign links

Validated UTM links can be saved, reused, undone and exported. Storage is bounded
to 50 entries per staff ID on that browser/origin, with no silent replacement.
Stored drafts are revalidated and URLs are regenerated from allowlisted fields.
No arbitrary stored URL is trusted. Links are not shared/server-backed, and a
saved link is not a published campaign or a measurement result. Unsaved drafts
are still lost after leaving/reloading; the UI states this explicitly.

### Report-access check

Measurement separates server configuration, an explicitly requested Google report
check, and browser-delivery QA. The second step reads a bounded 7-day report;
it does not create credentials, grant access or certify collection. A returned
empty report is successful access with no evidence of browser delivery. Missing
configuration disables that test rather than generating a fake success.

### Descriptive release comparison

The new staff-only `GET /api/admin/analytics/release` accepts only a release date,
7/28 days, a fixed device category and one of trend/device/source breakdowns.
Both windows must be complete and within the last 180 days. The mixed release
day is excluded. Before and after use distinct cache keys and independent totals;
no partial comparison is returned after an error. Charts use the same vertical
scale. Rate changes use percentage points; a zero baseline never yields invented
percentage growth. Traffic-mix tables retain unavailable rows as unavailable.

The interface includes exact dates, counts, CSV, scope warnings and the existing
Dev Analysis Log. It does not detect or launch deployments, store release records,
claim causal impact or declare a winner. Each uncached comparison view uses four
Google requests; the server caches them for five minutes. Views are requested
when used, not all fetched together or continuously polled.

The sample fixture has only 56 days. Two 28-day windows plus an excluded release
day require 57 days, so that sample selection deliberately reports insufficient
history. October 10, 2026 with 7-day windows is the working sample example.

## Release safeguards

Public collection now requires explicit build-time enablement in addition to a
valid G-code: `VITE_ANALYTICS_ENABLED=1` on Netlify, or `ANALYTICS_ENABLED=1` for a
Docker public build. Default is off. Keep it off until privacy/consent requirements
and overlapping tags have been reviewed. No consent-management system was added;
the existing DNT/GPC/opt-out and session-only cookie rules are retained.

`docker-compose.analytics.yml` is an optional override that mounts a protected
server credential file read-only, with no automatic host-directory creation.
The default compose deployment does not require it. Private instructions,
environment files and local archives are explicitly excluded from Docker context;
the admin bundle audit checks for private/development markers.

See [the deployment checklist](analytics-deployment.md) and
[verification coverage](analytics-verification.md). No credentials, account
grants, commits, pushes, production collection or deployment were performed.

## Deliberate limits

Five of nine analytics areas have implementation code: Pages/content/audience,
Acquisition/campaigns, bounded feature signals, Measurement and Release impact.
Journeys, live retention, feedback and experiments remain preview-only. The
feature report still avoids unvalidated eligible-session joins/conversion rates.
Dev Analysis Log and saved links remain browser-local, not shared team records.
Those are scope/privacy/storage decisions, not work that connecting Google alone
will automatically finish.

## Local handoff · October 25, 2026

Final local checks passed: 57 JavaScript tests, the API race-test suite, 256 report
contracts, 24 release-comparison contracts, both app type checks and the admin
production build. Public prerender generated 12 pages with collection disabled.
The assembled admin/public output passed local routing and anonymous-access checks.
Nine sections were checked at 390px/520px; the campaign download was verified
through the normal browser approval flow. Before-version hashes remain unchanged.
See the verification and deployment documents above for the external release gates.
