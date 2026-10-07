# Philippine Cubers Association

Rankings and statistics for Philippine speedcubers, built from the official WCA
results export. One Go binary serves the API and the static frontends; a worker
syncs WCA data and runs background jobs.

| Path              | What it is |
|-------------------|------------|
| `apps/web`        | Public site. TanStack Start, prerendered to static HTML, then hydrated. |
| `apps/admin`      | Staff admin. TanStack Router SPA under `/admin`. |
| `apps/api`        | Go API and worker, SQLite. See [`apps/api/README.md`](apps/api/README.md). |
| `packages/shared` | Regions, events, API types and formatting shared by the frontends. |
| `seed/`           | `pca.sqlite3.gz`: small development seed (in git). `full/`: complete seed (ignored). |

## Develop

Needs Node 22+, pnpm 11 and Go 1.26. No Docker.

```sh
pnpm install
pnpm dev
```

- Site: <http://localhost:3000>
- Admin: <http://localhost:3001/admin/> (`admin` / `admin`)
- API docs: <http://localhost:8000/api/docs>

The first run creates `apps/api/data/pca.sqlite3` from `seed/pca.sqlite3.gz`.
The development seed has every competition, result and ranking, but no
scrambles, names or emails. To use the full seed, set `SEED_DIR=seed/full` and
run `pnpm db:reset`.

| Command | What it does |
|---------|--------------|
| `pnpm dev [api worker web admin]` | Run everything, or only the named services, with hot reload. |
| `pnpm start` / `pnpm serve` | Build (or not) and serve everything from the Go server on :8000. |
| `pnpm db:reset` | Recreate the local database from the seed. |
| `pnpm typecheck` | Check all TypeScript packages. |

Settings come from `.env` (see `.env.example`), then the shell environment.

Rebuild the development seed from a full database:

```sh
cd apps/api
go run ./cmd/worker dev-seed --from=FULL.sqlite3 --out=../../seed/pca.sqlite3.gz
```

## Deploy

The site is on Netlify; the API, worker and admin run from `docker-compose.yml`
on Dokploy. On first start, `init-db` copies the seed into the `pca-data` volume.
After that the volume is the source of truth.

**Seed** (once):

```sh
scp seed/full/pca.sqlite3.gz seed/full/manifest.json server:/srv/pca-seed/
```

**Dokploy:** compose app, domain `api.pinoycubers.org` on service `app`, port
8000, HTTPS. Redeploy after changing domains.

```sh
PUBLIC_URL=https://beta.pinoycubers.org
CORS_ALLOWED_ORIGINS=https://beta.pinoycubers.org,https://pinoycubers.org
WCA_ALLOWED_CALLBACK_URLS=https://beta.pinoycubers.org/regional-rankings,https://pinoycubers.org/regional-rankings
SITES=admin
SEED_DIR=/srv/pca-seed
PORT=18000                             # host port, bound to 127.0.0.1
WCA_CLIENT_ID=...
WCA_CLIENT_SECRET=...
ADMIN_BOOTSTRAP_USERNAME=admin
ADMIN_BOOTSTRAP_PASSWORD='...'         # single quotes keep $ and # literal
ADMIN_SECURE_COOKIES=1
BACKUP_KEEP=5
```

**Netlify:** `netlify.toml` sets the build. Environment:

```sh
VITE_API_URL=https://api.pinoycubers.org/api
PRERENDER_API_URL=https://api.pinoycubers.org/api
VITE_SITE_URL=https://pinoycubers.org
VITE_WCA_CLIENT_ID=...
VITE_GA_MEASUREMENT_ID=...
```

Register `<PUBLIC_URL>/regional-rankings` as the WCA OAuth redirect URI (scope
`public`). Prerendered HTML refreshes only on a Netlify rebuild. Maintenance
mode, switched on in the admin, is served by an edge function that returns 503.

To run the whole stack in Docker instead: `cp .env.example .env`, then
`docker compose up -d --build`, and open <http://localhost:8000>.

## Adding an app

**Frontend:** create `apps/<name>` whose `build` writes static files, and
declare its mount in `package.json`:

```json
"pcaSite": { "mount": "/shop", "dist": "dist", "spa": true }
```

`pnpm build` and the Docker image pick it up; see `apps/admin` for the Vite
`base` and dev-proxy setup.

**Backend in Go:** add `apps/api/internal/<name>` returning an `http.Handler`,
and mount it in `apps/api/cmd/api/main.go`:

```go
{Prefix: "/api/shop", Handler: shop.New(cfg, d, log).Handler()},
```

**Separate service:** add it to `docker-compose.yml` and route to it with
`UPSTREAMS=/api/shop=http://shop:9000`.
