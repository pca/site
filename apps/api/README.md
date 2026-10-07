# PCA backend (Go)

The PCA API and worker. It serves the public API used by `apps/web`, stores
everything in one SQLite file, and has a JSON admin API for region requests,
user regions and jobs. Docker and local setup are in the
[root README](../../README.md).

Two binaries share the database:

| Binary   | Role |
|----------|------|
| `api`    | Public API, admin API (`/api/admin`), `/openapi.json`, `/docs`, the frontends listed in `SITES_DIR/sites.json`, and services proxied through `UPSTREAMS`. Holds rankings and statistics in memory and reloads when the worker publishes new data. |
| `worker` | Daily WCA export sync, competition region classification and statistics builds. Also runs jobs queued from the admin. |

Use `worker seed-state --archive` rather than `--manifest` for the bundled
archive. The `archive_sha256` in both rebuild manifests has two transposed
characters (`…baec2ea…`), while the zip itself hashes to `…bae2cea…`.

## Commands

```
api                               serve HTTP (default)
api createadmin USERNAME          create/update a staff account (ADMIN_PASSWORD or stdin)
api healthcheck                   probe /healthz (used by docker compose)

worker                            scheduler + job queue (default)
worker sync [--force]             fetch the WCA export if it changed, import, rebuild
worker import --archive FILE      import a local WCA export zip
worker statistics                 classify competitions, rebuild statistics
worker assign-regions             classify competitions only
worker seed-state --archive FILE  record which export an existing database came from
worker init-db --from FILE [--archive FILE]
                                  create DB_PATH from a seed database if missing
```

## Behaviour notes

- Paths work with or without the trailing slash.
- `RANKINGS_REQUIRE_WCA_ACCOUNT` (default `0`): when `1`, regional and zonal
  rankings count only users linked to a WCA account. The 2026 database has no
  linked accounts, so strict mode would leave those rankings empty until every
  user has logged in.
- Data jobs are deterministic: the WCA import keeps every WCA table with its
  row ids, and the competition region assignments and the regional strength
  and growth rows (including their stored JSON and content hashes) are the
  same for the same export.

## Performance

- Rankings are pre-sorted per event in memory, so a request is a filtered
  slice plus pre-encoded JSON fragments. Statistics responses are cached until
  the next data change. Responses carry ETags and pre-compressed gzip.
- SQLite runs in WAL mode with a read pool and a single writer. The worker
  publishes changes by bumping a generation counter that the API polls
  (`CACHE_POLL_INTERVAL`).
- A full WCA sync takes about 20 seconds: it streams the 380 MB export from
  the zip, keeps only Philippine data and writes it in one transaction.
  Statistics builds take about 0.6 seconds and only write rows that changed.
  Readers never see a partial import or build.

## Storage

The database stays at about 100 MB across syncs. After every job the worker:

- deletes superseded statistics snapshots, keeping the active one and the one
  before it. Each new WCA export creates a snapshot of about 10,000 rows
  (2 MB), which would otherwise add up to roughly 800 MB a year of daily syncs;
- keeps the newest 200 jobs and their logs;
- truncates the WAL file, which grows to the 64 MB `journal_size_limit`
  during an import;
- runs `VACUUM` when free pages exceed 32 MB and 25% of the file.

The downloaded export (about 380 MB) is deleted after the import, and a
partial download left by a crash is deleted when the worker starts. Docker
logs are rotated at 3 × 10 MB per container.

## Backups

Staff can create and download backups on the admin Backups page
(`/api/admin/backups`). A backup is a `VACUUM INTO` copy of the live database,
consistent even while the API and worker are writing, gzipped to about 20 MB
in `DATA_DIR/backups/pca-YYYYMMDD-HHMMSS.sqlite3.gz`. Creating one takes about
4 seconds. Only the newest `BACKUP_KEEP` (default 5) are kept. To restore,
stop the services, unzip a backup and put it at `DB_PATH`.
