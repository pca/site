# Analytics verification and release gate

The approved first-release tools are locally implemented and tested. That is not
the same as a verified Google connection or a deployed release. Fixed journeys,
weekly retention, account-only feedback and server-saved experiment planning now
have local implementations. Experiment assignment/delivery is not implemented.
Descriptive release-impact comparison is not causal attribution.
See [current scope and limits](analytics-completion-2026-10-25.md).

## Repeatable local checks

Use Node 24 (or Node 22.18+) and the existing installed workspace dependencies.
No new testing dependency is required.

```sh
node scripts/verify-analytics.mjs --unit
node scripts/verify-analytics.mjs
```

The package-script equivalents are `pnpm test:analytics` and
`pnpm verify:analytics`. The direct Node commands avoid any package-manager
dependency auto-install. The verifier itself never installs packages.

The quick command checks tracking rules, report mathematics/validation,
campaign links, notes/CSV, sample consistency and measurement-status wording.
The full command also runs all API tests with race detection, passes 256 API
report results, 24 release comparisons and 20 behavior reports into the admin validator/exporter, checks admin/public-site types,
and builds the admin production bundle. It needs permission to use temporary
loopback test servers and the normal Go compiler cache. Missing dependencies or
permissions are failures, not silently skipped checks. Steps have time limits.

It clears Google reporting configuration for its child processes. API tests use
temporary databases and a fake Google service; they do not use the running local
server, reset an account, contact Google, launch campaigns or deploy. Temporary
contract output contains invented data and is deleted when the verifier exits.
Normal compiler caches and ignored admin build output are generated as usual.

## What the checks prove

| Layer | Automated evidence | Limit |
| --- | --- | --- |
| Public collection rules | Main/www paths only; beta/local exclusions; opt-out and callback suppression; sanitized URLs; page/content deduplication; exposure before interaction | Injected runtime, not a browser/network receipt check |
| Campaign builder → collector | Every preset produces tags accepted by the actual collection rules, preserves first-entry attribution, and strips unrelated query values | Does not prove Google's final attribution classification |
| API → admin → CSV | 256 report/breakdown/page/device/period combinations, 24 release comparisons and 20 behavior reports use matching schemas and scopes; totals stay independent | Fake Google service mirrors requested schemas; real dimension/metric compatibility must still be checked |
| Reliability | Concurrent same-scope requests share a cached result; failed totals are not cached; oversized/multiple JSON bodies and inconsistent rows/timezones are rejected | Not a load test or guarantee against all upstream failures |
| Dashboard validation | Malformed fields fail without throwing; mismatched periods/hosts are rejected; empty/sampled/thresholded/top-N results keep their meaning | No complete automated DOM, accessibility or visual-regression suite |
| Staff protection | Anonymous/revoked staff cannot read reports; responses are not browser-cacheable; upstream errors are sanitized | Production proxy/session settings still need deployment verification |
| Feedback and planning | Account/CSRF guards, bounded payloads, transactional submission limits, idempotent retries, revision conflicts and review history | Does not establish production moderation, privacy notices or deletion procedures |
| Build | Public/admin types and admin production bundle | Public prerender/build and deployed static routing are separate release checks |

## Checks still required before calling the release verified

These are deliberate release checks, not a request to wait for organic traffic.

1. Confirm the intended main-site web stream and property. Deploy both the public
   collection code and the admin/API code. Provide the protected credential file
   to the API container and configure its numeric property ID. Keep credentials
   out of this repository, the browser and chat.
2. Register the custom dimensions used by the selected content/feature reports.
   Confirm the Data API is enabled and the service account has read-only access.
3. Review the site's consent requirements and existing tags/enhanced measurement
   before enabling collection. The current opt-out/DNT/GPC rules are not a full
   consent-management system. Keep collection disabled if required consent is
   not yet in place.
4. With authorization, make a small controlled browser visit on the main host:
   enter from a tagged campaign link, view Rankings, change one event/region,
   interact with a measured control and navigate to Statistics. Inspect outgoing
   requests and confirm receipt in Google. Check that filter changes do not add
   page views, callbacks/personal data are absent and tags are not duplicated.
   Check opted-out and beta/local cases separately: no production collection.
5. When those dates are available to the reporting API, compare known activity
   with the live dashboard. It intentionally reports complete days through
   yesterday in the property timezone, not today's realtime activity. Verify
   custom dimensions, unknown values, totals, device scopes and CSV. A newly
   received event is not proof that every report is compatible.
6. Verify the deployed public build/prerender, admin login/protected routes,
   reporting error states, mobile layouts and a recovery/rollback path. Record
   any blocked requests caused by browser privacy tools; missing collection is
   not necessarily missing visits. Do not label preview-only features live.

No simulated test can establish steps 1–6 by itself. Conversely, there is no
need to build a giant test platform or recruit participants to verify these
approved measurement tools.

## Current continuation verification recorded on 2026-10-25

- Final `node scripts/verify-analytics.mjs` passed: 65 JavaScript tests, the
  complete API race suite, 256 report contracts, 24 release comparisons and 20
  journey/retention contracts; both app type checks and the admin build/private
  marker audit passed. The optional interactive browser fixture is intentionally
  skipped by the normal suite, not miscounted as automated browser coverage.
- Public production build/prerender passed with collection explicitly disabled:
  12 pages generated. The built public/admin sites were packaged locally.
- Browser checks verified journey selection/stage inspection, linked retention
  cells/counts/curve, and missing-connection gates with no invented fallback.
  The four new staff areas fit 390px and 520px viewports with no document-width
  overflow; the visitor feedback form also fits both widths. Overrides were reset.
- The opt-in disposable fixture passed after graceful shutdown. A reviewed
  synthetic visitor report reached the staff inbox with its displayed-data
  fingerprint. Staff review saved a revision/audit record. A second tab's stale
  update was rejected without losing its draft; reload recovered the saved
  revision. Saved inbox source survived reload. Earlier browser checks in this
  continuation also saved/reloaded an experiment draft, checked readiness guards
  and inspected the aggregate results worksheet.
- The normal local API was updated only after a private online database backup
  passed SQLite integrity checking. All four additive tables exist, with no QA
  reports/plans inserted into the normal database. A before/after digest of user
  IDs, password hashes and active/staff flags is unchanged. The existing browser
  staff session still reads the empty saved inbox and plan library.
- Public/admin documents and health returned 200 on the packaged local server;
  all three new protected API areas returned 401/no-store anonymously. The
  external before snapshot still matches all 111 inventory hashes. Tracked
  instructions and the dependency lockfile were not changed; private project
  instructions remain locally ignored.

No live Google access, production delivery, consent compliance, Docker image,
deployed proxy/secret mount or live A/B assignment has been verified by these
checks. Nothing was committed, pushed or deployed. The before version is still
available for comparison. See [current scope](analytics-completion-2026-10-25.md).

## Earlier workspace-04 verification recorded on 2026-10-25

- 57 JavaScript tests passed.
- Full API suite passed with race detection.
- 256 report contracts and 24 release-comparison contracts passed.
- Both app TypeScript checks, admin production build and private-marker bundle audit passed.
- Browser checks verified event/region cell selection against exact counts,
  release traffic/device/source views and insufficient-history messaging,
  a disabled access probe without configuration, and GA4 mode without sample fallback.
- The campaign CSV downloaded successfully through the normal browser approval
  flow. Disposable saved-link QA records were undone; existing records were not removed.
- All nine report/preview sections fit 390px and 520px viewports without
  document-width overflow. Temporary viewport overrides were reset.
- The updated local API and packaged public/admin routes passed a loopback smoke
  check: public/admin documents returned 200 and anonymous analytics requests
  returned 401. Existing staff authentication and the account database were retained.
- The preserved external snapshot's 111 file hashes match its original inventory.

The public production build/prerender was also checked separately with collection
disabled: 12 public pages generated. Docker image construction, credential-file
permissions inside the real container and deployed proxy routing remain unverified;
Docker is unavailable in this local environment. These checks do not require real
tracking to be switched on. See [the current scope](analytics-workbench-v4.md).

## Earlier local verification recorded on 2026-10-24

- 47 JavaScript tests passed.
- Full API suite passed with `-race -count=1`.
- All 248 API → admin → CSV contracts passed.
- Admin and public website TypeScript checks passed.
- Admin production build passed.
- Added regression checks caught and fixed malformed-report crashes, wrong-period
  acceptance, oversize/trailing JSON acceptance, inconsistent row counts and
  mismatched report timezones.
- No production collection, Google account verification, deployment, password
  change, shared log storage or activation of deferred features occurred.

Re-run the command after code changes. A previously passing run is not a promise
that later changes, account settings or deployment environments will work.
