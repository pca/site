# Analytics deployment checklist

Prepared locally. This document does not mean a deployment or live Google check
has happened. Use the project's existing Netlify and Dokploy deployments, not a
new hosting service.

## What can work without Google reporting

- The campaign builder, saved browser-local links and CSV downloads.
- Browser-local Dev Analysis Log notes and exports.
- Account-submitted feedback and staff reviews in the PCA database.
- Server-saved experiment plans and the manual results worksheet, without A/B delivery.
- Clearly labeled sample reports and earlier design previews.

Localhost data does not automatically migrate to the live hostname. Export local
notes and links if you want a backup. There is no shared log storage in this pass.

## Public website on Netlify

1. Confirm the intended main-site web stream. The public measurement ID is
   `G-EGQD2JBT77`; it is not a reporting credential or numeric property ID.
2. Review privacy/consent requirements and remove overlapping collection for the
   curated measurement plan. A consent gate must be connected first where needed.
3. Set `VITE_ANALYTICS_ENABLED=1` only after that review and rebuild. Leaving it
   unset/`0` keeps collection off even with the G-code. The reporting dashboard
   can still read already-collected history while public collection is off.
4. Deploy the public website through its normal authorised workflow. Production
   collection is restricted to HTTPS main/www and the two measured public paths;
   beta, localhost, admin and arbitrary routes stay excluded from production.
   [Beta has a separate opt-in and GA4 destination](google-analytics.md#optional-beta-only-collection).

## Admin and reporting API on Dokploy

The default compose deployment already builds the admin/API. It does not receive
the server credential merely because the public website has a G-code.

1. Enable the Google Analytics Data API and give the chosen service account
   Viewer access to the intended GA4 property. Do not paste private keys into
   chat or browser settings.
2. Store its JSON file outside the checkout in a protected server location. Make
   it readable by the container's non-root user without making it public. The
   bind mount below does not change file ownership or permissions for you.
3. Set server deployment variables `GA4_PROPERTY_ID` (numeric) and
   `GA4_SERVICE_ACCOUNT_HOST_FILE` (absolute path on the server).
4. Include the optional reporting override when deploying:

```sh
docker compose -f docker-compose.yml -f docker-compose.analytics.yml up -d --build
```

The override mounts exactly that file read-only at `/run/secrets/pca-ga4.json` and
sets `GA4_SERVICE_ACCOUNT_FILE` to its container path. Missing variables/files
fail instead of creating an empty directory. A deployment platform may provide
an equivalent protected file/secret mount rather than using this override.

For a default deployment without Google reporting, keep using only
`docker-compose.yml`; sample/tool pages remain available and live reports show
setup requirements. Neither compose file grants access in the Google account.

## Required custom dimensions

Register event-scoped definitions for the reports you intend to use:

- Content: `event_id`, `region_id`, `content_page`; optionally `result_type`,
  `view_id`, `content_entry` for those breakdowns.
- Feature signals: `feature_name`.

Basic pages/audience/acquisition and release comparison use standard dimensions.
Real property compatibility still needs testing. Historical page views cannot
reconstruct old within-page selections, and new definitions do not create old
tracking history.

## Verification and rollback

Before an authorised release, run `node scripts/verify-analytics.mjs` with Node
24, build/prerender the public website against the intended API, and review the
selected changes. This local environment has no Docker executable; an actual
container build, secret-file permissions and proxy configuration are not verified
by the local bundle/type/mock tests.

After deployment, check admin sign-in/protected API routes, run Measurement's
explicit report-access check, open each required live breakdown, and perform a
small authorised browser delivery check. Compare that known activity when its
complete reporting day is available. Verify page/content deduplication and
campaign attribution; do not treat an empty report as confirmed collection.

To pause the new collection, set the public build flag to `0` and rebuild/redeploy
the public site. To stop server reporting, remove the optional mount/config and
restart the API. Keep the previous deployable app image/version for the normal
rollback procedure. The October 25 continuation adds SQLite feedback, review,
experiment-plan and plan-history tables at API startup. Back up the database
before upgrading; do not delete these tables or overwrite a newer database just
to roll back app code. No visitor-identity store or cookie extension was added.

Journeys and retention now have bounded reporting code, but their Google API
compatibility and identity limitations must be checked before interpreting live
numbers. Feedback and experiment plans use the PCA database independently of GA4.
Before accepting real feedback, review privacy wording, retention/deletion policy,
staff access and moderation responsibilities. Account-only reporting reduces spam;
it does not remove that responsibility. Context fingerprints are not database archives.

There is still no experiment assignment/launch, session replay, automated release
detection or shared Dev Analysis Log. Choose and approve a specific live experiment
and its assignment/privacy/measurement rules before implementing delivery. See the
[continuation scope](analytics-completion-2026-10-25.md) for exact limits.
