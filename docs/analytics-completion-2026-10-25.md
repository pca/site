# Analytics continuation · October 25, 2026

This extends [workspace 04](analytics-workbench-v4.md). Local implementation is
not a deployment, Google account authorization, consent solution or experiment
launch. The saved before version remains unchanged.

## Current tools

| Area | Usable local implementation | Boundary |
| --- | --- | --- |
| Journeys | Two fixed closed user funnels, step inspection, 7/28-day and device scopes, CSV, Dev Analysis Log, protected Google funnel-report request | Users, not a guaranteed same-session journey. At most 30 minutes between adjacent steps. No arbitrary navigation-path explorer or exit-reason inference. Google alpha API compatibility still requires the intended property. |
| Retention | Six complete first-session starting weeks, weeks 0–4, linked table/curve, counts/rates, device scope and CSV | Google Sunday–Saturday weeks, unlike earlier Monday-week examples. Session-only cookies limit recognition. No longer-lived identity or cookie was introduced. |
| Feedback & issues | Account-only public form, context review, three reports per rolling 24 hours, idempotent retries, staff inbox/filter/search/pagination, category/status corrections and review history | Free text is deliberately submitted to the PCA database, not Google. No AI sorting, attachments, automatic replies or public feedback feed. A report is not a confirmed defect. |
| Experiments | Server-saved staff plans, readiness checks, sample-size/traffic estimates, Markdown export and a manual aggregate-results worksheet | Planning tool, not A/B assignment/delivery. No launch, winner, experiment cookie or automatically joined outcome data. A specific test and assignment/privacy design are still required. |

Open the [complete page directory](http://127.0.0.1:3001/admin/preview-library).
Current direct links: [Journeys](http://127.0.0.1:3001/admin/analytics-workbench/journeys?mode=sample),
[Retention](http://127.0.0.1:3001/admin/analytics-workbench/retention?mode=sample),
[Feedback](http://127.0.0.1:3001/admin/analytics-workbench/feedback),
[Experiments](http://127.0.0.1:3001/admin/analytics-workbench/experiments).

## Trustworthy behavior reports

The API only accepts allowlisted report kind, fixed funnel, 7/28 days and device
category. The numeric property and main/www hosts stay server-controlled. It
never returns raw identities or event histories. An existing bounded report
supplies complete dates and the property timezone; the behavior request uses the
same property. Cached results expire after five minutes. Missing rows remain
unavailable. Sample mode and Google mode never substitute for one another.

Retention uses `firstSessionDate`, `cohortNthWeek`, `cohortActiveUsers` and
`cohortTotalUsers`. Group size must be consistent and active counts cannot exceed
it. Follow-up weeks not complete by yesterday are omitted even if Google returns
partial activity. Missing/withheld cells break curves instead of becoming zeroes.
First session is first in the GA4 property, not necessarily the first main-site
visit if a property contains other traffic. The host/device filter applies to
queried activity. Week 1 and week 4 weighted totals can use different eligible
groups; inspect their denominators.

The funnel report is closed: a recognized user starts at step 1 and progresses
in order, with intervening events allowed. The external WCA flow and session-only
recognition can prevent reliable joins. A region submission is not staff approval.

References: [Google funnel API](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1alpha/properties/runFunnelReport),
[Google weekly cohorts](https://developers.google.com/analytics/devguides/reporting/data/v1/advanced),
[Cohort specification](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/CohortSpec).

## Feedback and planning storage

New additive SQLite tables store deliberate feedback, review audit records,
experiment plans and plan revision history. Existing accounts/passwords and
analytics cookie policy are unchanged. Normal startup creates missing tables;
back up the database before the first authorized production upgrade. There is no
destructive migration or automatic purge. Define production retention/deletion
procedures and update privacy guidance before opening the form to real visitors.

The visitor chooses an initial category. Staff can correct it while preserving
the original selection. Context is browser-attached, not independently verified.
Statistics can attach its displayed snapshot ID. Rankings captures a SHA-256
fingerprint of the displayed public rows and selected content when the form
opens, where Web Crypto is available; it does not upload those rows or archive
the database. A fingerprint can detect a changed view but cannot reconstruct it
without matching source data. No raw URL/query, token, email, location
or screenshot is automatically attached. Visitor free text still needs privacy
care and human moderation. Exports contain private report text.

Review/plan writes require the existing staff session and CSRF header. Revision
checks reject conflicting edits instead of overwriting another reviewer. Feedback
submission limits and idempotency are enforced transactionally, not just in the
browser. Plan libraries are capped at 100 and archive rather than delete.
The Dev Analysis Log remains browser-local; this does not convert it into a
shared server log.

Experiment estimates assume independent binary outcomes, equal random
allocation, two-sided 5% significance and 80% power, without continuity correction.
The worksheet's approximate fixed-horizon difference interval is withheld when
any outcome/non-outcome cell is below 10. Manual data does not verify valid
randomization or justify repeated peeking, early stopping or a causal claim.
The methodology distinction is consistent with [NIST's two-proportion guidance](https://www.itl.nist.gov/div898/handbook/prc/section3/prc33.htm).

## Checks and remaining release gates

Run `node scripts/verify-analytics.mjs` with Node 24. It covers 65 JavaScript
tests, API race/concurrency/authentication/CSRF/storage tests, 256 report contracts,
24 release comparisons, and 20 behavior API → admin → CSV contracts, plus both
app type checks and the admin build/private-marker audit. Mock Google tests do
not establish live dimension/metric compatibility or browser delivery.

The opt-in `TestBrowserWorkflowFixture` serves built public/admin pages on
loopback with a temporary database and mock WCA service. It is a `_test.go` file,
not part of the deployed API binary. Use `localhost` for its browser session,
separate from the normal `127.0.0.1` admin cookie. Stop the fixture after testing;
never deploy it or treat its synthetic accounts as real authentication evidence.

External gates remain the [deployment checklist](analytics-deployment.md): Google
property/access/custom dimensions and real delivery verification, any required
consent gate, production container/proxy/credential checks, and explicit release
authorization. A specific live experiment additionally needs approved variants,
an assignment/identity policy, exposure/outcome validation and a stop mechanism.

## Local completion audit

| Requirement | Current evidence | Result / remaining boundary |
| --- | --- | --- |
| Usable journeys | `BehaviorReports.tsx`, fixed API requests/parser, 20 cross-layer behavior contracts, browser journey/stage selection | Complete locally; intended Google property compatibility and actual joins remain external gates. Not arbitrary paths. |
| Usable retention | Six completed starting groups; linked heatmap, curve, counts/rates and CSV; denominator/partial-week tests and browser selection | Complete locally with explicit session-only recognition limits. No identity expansion. |
| Feedback and contextual issues | Public reviewed form → temporary account-authenticated API → staff inbox; fingerprint, filters, saved-source reload, review audit and two-tab conflict recovery | Complete local workflow. Production moderation, privacy notice and retention/deletion policy still need owner review. |
| Experiment tools | Saved draft/reload and readiness guards; sample/traffic estimate, Markdown export and manual results worksheet; storage/revision tests | Planning and results tools complete locally. A live test cannot be implemented safely without the specific variants and assignment/privacy decision; no delivery is claimed. |
| Preserve comparison | All 111 external baseline hashes match; dev-only frozen viewer and preview directory preserved | Complete. Frozen viewer intentionally excluded from production. |
| Validate reporting/security | 65 JS tests, full API race suite, 256 report + 24 release + 20 behavior contracts, staff/CSRF/bounded-body/idempotency/concurrency checks | Passed with fake Google and temporary databases; not a real-property or production load test. |
| Validate UI and builds | Both app types/admin build audit, 12-page public prerender, 390/520px new-page and public-form checks, browser workflow checks | Passed locally. No complete automated accessibility/visual-regression suite. |
| Prepare deployment without deploying | Packaged public/admin builds, rebuilt local API, additive schema backup/integrity and unchanged account digest, protected-route smoke tests; deployment checklist | Local preparation complete. Docker unavailable; real proxy, credential mount and Google delivery remain unverified. |
| Preserve safety boundaries | Collection explicitly off in verification build; no credentials, live experiments, identity lifetime changes, commit/push/deployment; private instructions ignored | Preserved. Dev Analysis Log remains browser-local. |

Detailed command and browser evidence: [verification record](analytics-verification.md).
