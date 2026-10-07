# Philippine Cubers Association

Rankings and statistics for Philippine speedcubers, built from the official WCA
results export. One Go binary serves the API and every static frontend from a
single port; a worker process syncs WCA data and runs background jobs. New
frontends and backends plug in without changing the server or the Dockerfile
(see [Adding an app](#adding-an-app)).

| Path              | What it is |
|-------------------|------------|
| `apps/web`        | Public site. TanStack Start, prerendered to static HTML for SEO, then hydrated. |
| `apps/admin`      | Staff admin. TanStack Router SPA under `/admin`. |
| `apps/api`        | Go API and worker, SQLite. See [`apps/api/README.md`](apps/api/README.md). |
| `packages/shared` | Regions, events, API types and formatting shared by both frontends. |
| `archive/`        | Local reference material and the seed database in `archive/web-backend/data`. Ignored by git and Docker builds. |

The frontends are plain files, with no Node server at runtime. The Go server
routes requests like this:

| Path          | Served by |
|---------------|-----------|
| `/api/admin/*` | Admin JSON API (session cookie and CSRF header). |
| `/api/*`      | Public API. The same routes also answer without the `/api` prefix. |
| `/admin/*`    | Admin SPA, falling back to `index.html`. |
| `/*`          | Public site, falling back to `404.html` with status 404. |

Mounts are matched by longest prefix, so `/admin/*` wins over `/*`. Two mounts
at the same path, or a mount that collides with an API route, stop the server
at startup with an error naming both.

Static files are loaded into memory at startup with brotli and gzip variants
and ETags. Hashed `/assets` are cached for a year and HTML is revalidated.

## Run with Docker

```sh
cp .env.example .env    # set PUBLIC_URL, WCA_CLIENT_ID/SECRET, ADMIN_BOOTSTRAP_PASSWORD
docker compose up -d --build
```

- Site: <http://localhost:8000>
- Admin: <http://localhost:8000/admin>
- API docs: <http://localhost:8000/api/docs>

On the first start the one-shot `init-db` service copies
`archive/web-backend/data/rebuilt-october-2026.sqlite3` into the `pca-data` volume.
It then records the bundled WCA export and builds statistics. Later starts
leave the database alone. The seed files are mounted read-only and are never
modified.

`PUBLIC_URL`, `WCA_CLIENT_ID` and `GA_MEASUREMENT_ID` are baked into the
public site when the image is built, so rebuild after changing them. Register
`<PUBLIC_URL>/regional-rankings` as the redirect URI of the WCA OAuth
application.

## Deploying: site on Netlify, admin and API on Dokploy

The public site is a static build, so it can live on Netlify while
`docker-compose.yml` runs the API, worker and admin on Dokploy. Below,
`https://pinoycubers.org` is the site and `https://api.pinoycubers.org` the
compose app; substitute your domains.

**Seed data.** The seed files are not in git. Copy the database and its
manifest (about 82 MB; the WCA export zip is not needed) to the server once:

```sh
scp archive/web-backend/data/rebuilt-october-2026.sqlite3 \
    archive/web-backend/data/rebuilt-october-2026-manifest.json \
    server:/srv/pca-seed/
```

`init-db` copies them into the `pca-data` volume on the first deploy only.
After that the volume is the source of truth: take backups from the admin,
and the worker keeps the WCA data current.

**Dokploy** (Docker Compose app from this repository). Environment:

```sh
PUBLIC_URL=https://pinoycubers.org     # the Netlify site: WCA callback and CORS
SITES=admin                            # the image skips the public site
SEED_DIR=/srv/pca-seed
WCA_CLIENT_ID=...
WCA_CLIENT_SECRET=...
ADMIN_BOOTSTRAP_PASSWORD=...           # a real password
ADMIN_SECURE_COOKIES=1
FB_PAGE_ID=...
FB_PAGE_TOKEN=...
```

Point the domain at the `app` service, port 8000. The admin is then at
`https://api.pinoycubers.org/admin` and the API at `/api`.

**Netlify** (this repository; `netlify.toml` sets the build and publish
directory). Build environment:

```sh
VITE_API_URL=https://api.pinoycubers.org/api
PRERENDER_API_URL=https://api.pinoycubers.org/api   # pages ship with data
VITE_SITE_URL=https://pinoycubers.org
VITE_WCA_CLIENT_ID=...
VITE_GA_MEASUREMENT_ID=...
```

Data changes in the admin show in the browser immediately. Prerendered HTML
only refreshes when Netlify rebuilds, so trigger a build hook after the daily
sync if search engines should see the latest numbers.

Maintenance mode works on Netlify too. An edge function
(`apps/web/netlify/edge-functions/maintenance.ts`) checks `VITE_API_URL` at
most every 15 seconds and serves `maintenance.html` with a 503 while it is on.
If the API is unreachable, the site stays up.

## Develop

Docker is only needed for deployment. Locally everything runs natively on
Windows, macOS and Linux with Node 22+, pnpm 11 and Go 1.26:

```sh
pnpm install
pnpm dev
```

- Site: <http://localhost:3000> (Vite, hot reload)
- Admin: <http://localhost:3001/admin/> (Vite, hot reload), signed in as
  `admin` / `change-me-please`
- API: <http://localhost:8000/api/docs>

`pnpm dev` runs the API, the worker and both frontends in one terminal with
labelled output, and Ctrl+C stops them all. The frontends proxy `/api` to the
API. Go changes rebuild and restart the API and worker; if the build fails,
the previous version keeps running.

On the first run it creates `apps/api/data/pca.sqlite3` from the seed in
`archive/web-backend/data`, using the same `init-db` step as Docker, so the
seed is never modified. This local database is separate from Docker's volume.

| Command | What it does |
|---------|--------------|
| `pnpm dev` | Everything above. |
| `pnpm dev api worker` | Only the named services: `api`, `worker`, and each app by directory name (`web`, `admin`). |
| `pnpm start` | Builds everything and serves it from the Go server on :8000, as in production. |
| `pnpm serve` | Same, without rebuilding. |
| `pnpm db:reset` | Deletes the local database and recreates it from the seed. |

Settings come from the root `.env` if there is one (see `.env.example`),
then the shell environment. `PORT` moves the API, `DATA_DIR` and `DB_PATH`
move the database, and `SEED_DIR` points at the seed files.

`pnpm build` builds every app and collects the frontends into `dist/sites`
with a `sites.json` manifest. The Go server serves them when `SITES_DIR`
points there, which `pnpm start` and the Docker image do.

Set `PRERENDER_API_URL` (for example `http://127.0.0.1:8000`) while building
to prerender pages with ranking and statistics data already in the HTML.
Without it, pages are prerendered with their layout and load data in the
browser.

`pnpm typecheck` checks all TypeScript packages.

## Public site

The site has regional, national and zonal rankings for every event, regional
strength and growth statistics, WCA login and region update requests. View state lives in the URL (for example
`/regional-rankings?event=444&region=11&format=average`), so every view can be
linked. Pages have titles, descriptions, Open Graph tags and canonical links,
and a sitemap is generated when `PUBLIC_URL` is set.

## Admin

- **Dashboard:** pending requests, users per region, worker status, the
  imported WCA export and the active statistics snapshot.
- **Region requests:** filter by status, region or name; approve, deny or
  reopen one request or many at once, with an optional staff note.
- **Users:** search and filter by region; set a region directly, make someone
  staff, set their password, or add a person by WCA ID.
- **Jobs:** queue a WCA sync, a statistics rebuild or a region classification,
  then follow the live log. Change the sync schedule (daily at an hour, every
  6 or 12 hours, weekly, off, or any cron expression); the worker applies it
  within seconds, and "Use server default" returns to `SYNC_CRON`.
- **Backups:** create a snapshot of the live database and download it.
- **Maintenance mode:** a switch on the dashboard that replaces every page of
  the public site with a "We'll be back soon" page (HTTP 503, `noindex`). The
  admin and the API keep working, and a banner on every admin page shows while
  it is on. The setting is stored in the database, so it survives restarts.
  The page is `apps/web/src/routes/maintenance.tsx`, prerendered to
  `maintenance.html` and served without scripts. Any site that ships a
  `maintenance.html` is covered. Under `pnpm dev` the site redirects to
  `/maintenance` instead.

## Adding an app

Everything still ships as one image on one port. Pick a URL path for the UI
(say `/shop`) and one for its API (`/api/shop`).

### A frontend

1. Create `apps/shop` with a `package.json`. Any framework works as long as
   `build` writes static files. Declare where it is served:

   ```json
   "pcaSite": { "mount": "/shop", "dist": "dist", "spa": true }
   ```

   - `mount`: the URL path. Use `"/"` only for the site that owns every
     otherwise unmatched path (today that is `apps/web`).
   - `dist`: build output directory, relative to the app.
   - `spa`: `true` serves `index.html` for unknown paths (client-side
     routing); `false` serves `404.html` with status 404 (prerendered sites).

2. Build it for that path. With Vite, set `base` from the same field, as
   `apps/admin/vite.config.ts` does, and pass `import.meta.env.BASE_URL` to
   the router's `basepath`. Give its `dev` script a `--port` and proxy
   `/api` to `process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000"`;
   `pnpm dev` then starts it as a service named after its directory.
3. Share code through `packages/*` (`"@pca/shared": "workspace:*"`).

`pnpm install` picks up the new app and `pnpm build` mounts it. The
Dockerfile, the server and the compose file need no changes.

### A backend

**In Go, in this binary.** Use this when it needs the same database, users or
sessions. Add a package under `apps/api/internal/shop` that returns an
`http.Handler` for its prefix, and add one line to the mount list in
`apps/api/cmd/api/main.go`:

```go
{Prefix: "/api/shop", Handler: shop.New(cfg, d, log).Handler()},
```

Mounted handlers get no CORS headers and are not rewritten by the `/api`
alias, so they see `/api/shop/...` exactly as the browser sent it.
`apps/admin` and `internal/admin` are a complete example. A background
process goes in `apps/api/cmd/<name>` instead; the Dockerfile builds every
command in `cmd/` into `/usr/local/bin`, so add a compose service that sets
`entrypoint: ["/usr/local/bin/<name>"]`, like `worker`.

**As a separate service, in any language.** Give it its own directory and
Dockerfile, add it to `docker-compose.yml` (there is a commented template),
and route a prefix to it from the main server:

```sh
UPSTREAMS=/api/shop=http://shop:9000
```

Several routes are separated by commas. The path is passed through unchanged,
`X-Forwarded-For`, `X-Forwarded-Host` and `X-Forwarded-Proto` are set, and the
server answers 502 with a JSON error while the service is down.
