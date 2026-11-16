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

-- Deliberate account-submitted feedback, separate from Google Analytics.
CREATE TABLE IF NOT EXISTS pca_feedback (
 id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, submission_key TEXT NOT NULL, payload_hash TEXT NOT NULL,
 original_type TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new',
 title TEXT NOT NULL, task TEXT NOT NULL, observed TEXT NOT NULL, expected TEXT NOT NULL,
 context TEXT NOT NULL, staff_note TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(user_id, submission_key)
);
CREATE INDEX IF NOT EXISTS pca_feedback_created_idx ON pca_feedback(created_at DESC,id);
CREATE INDEX IF NOT EXISTS pca_feedback_user_created_idx ON pca_feedback(user_id,created_at);
CREATE TABLE IF NOT EXISTS pca_feedback_review (
 id INTEGER PRIMARY KEY AUTOINCREMENT, feedback_id TEXT NOT NULL, reviewer_id INTEGER NOT NULL,
 type TEXT NOT NULL, status TEXT NOT NULL, note TEXT NOT NULL, revision INTEGER NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(feedback_id,revision)
);

-- Staff-authored experiment plans only. No variant delivery or visitor assignment.
CREATE TABLE IF NOT EXISTS pca_experiment_plan (
 id TEXT PRIMARY KEY, definition TEXT NOT NULL, revision INTEGER NOT NULL,
 author_id INTEGER NOT NULL, updated_by INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pca_experiment_plan_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT, plan_id TEXT NOT NULL, definition TEXT NOT NULL,
 revision INTEGER NOT NULL, reviewer_id INTEGER NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(plan_id,revision)
);
