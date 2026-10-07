# syntax=docker/dockerfile:1

# Every frontend in apps/* with a "pcaSite" field, collected into dist/sites.
FROM node:24-alpine AS web
WORKDIR /src
RUN corepack enable
# Dependencies are fetched from the lockfile alone, so this layer survives
# source changes and new apps do not need to be listed here.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm fetch --store-dir /pnpm/store
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --store-dir /pnpm/store
# Baked into the static bundles at build time.
ARG VITE_SITE_URL=""
ARG VITE_WCA_CLIENT_ID=""
ARG VITE_GA_MEASUREMENT_ID=""
# Comma-separated app directories to include, e.g. "admin" when the public
# site is hosted elsewhere. Empty builds every app.
ARG SITES=""
ENV VITE_SITE_URL=$VITE_SITE_URL \
    VITE_WCA_CLIENT_ID=$VITE_WCA_CLIENT_ID \
    VITE_GA_MEASUREMENT_ID=$VITE_GA_MEASUREMENT_ID \
    SITES=$SITES
RUN if [ -n "$SITES" ]; then \
      pnpm $(for s in $(echo "$SITES" | tr ',' ' '); do printf -- '--filter ./apps/%s ' "$s"; done) build && \
      node scripts/build-sites.mjs; \
    else pnpm build; fi

# Every Go command in apps/api/cmd/* (api, worker, and any added later).
FROM golang:1.26-alpine AS api
WORKDIR /src
COPY apps/api/go.mod apps/api/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY apps/api ./
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    mkdir -p /out/bin /out/data && \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/bin/ ./cmd/...

# distroless/static ships CA certificates for the WCA and Facebook APIs.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=api /out/bin/ /usr/local/bin/
COPY --from=api --chown=nonroot:nonroot /out/data /data
COPY --from=web /src/dist/sites /app/sites
ENV DB_PATH=/data/pca.sqlite3 \
    DATA_DIR=/data \
    ADDR=:8000 \
    SITES_DIR=/app/sites
VOLUME /data
EXPOSE 8000
ENTRYPOINT ["/usr/local/bin/api"]
