-- Service tables (jobs, metadata). WCA, user and statistics tables live in core_schema.sql.
CREATE TABLE IF NOT EXISTS pca_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pca_job (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    source TEXT NOT NULL,
    requested_by TEXT NOT NULL DEFAULT '',
    options TEXT NOT NULL DEFAULT '{}',
    log TEXT NOT NULL DEFAULT '',
    error TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    started_at TEXT NULL,
    finished_at TEXT NULL
);
CREATE INDEX IF NOT EXISTS pca_job_status_idx ON pca_job (status, id);

CREATE TABLE IF NOT EXISTS pca_admin_session (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES api_user (id) ON DELETE CASCADE,
    csrf_token TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS pca_admin_session_user_idx ON pca_admin_session (user_id);

CREATE INDEX IF NOT EXISTS pca_rur_status_created_idx ON api_regionupdaterequest (status, created_at);
CREATE INDEX IF NOT EXISTS pca_user_region_idx ON api_user (region);
