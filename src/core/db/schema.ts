/**
 * Schema definition.
 *
 * Conventions, applied to every entity so that sync stays possible later
 * without a migration that rewrites the world:
 *   - `id` is a UUIDv7 TEXT primary key — globally unique, time-sortable.
 *   - `created_at` / `updated_at` are epoch milliseconds (INTEGER).
 *   - `deleted_at` is a soft-delete tombstone; rows are never hard-deleted,
 *     because a hard delete cannot be replicated to another device.
 *   - AI-derived fields carry their own provenance columns, so a model upgrade
 *     can identify what is now stale.
 */

export const SCHEMA_V1 = `
CREATE TABLE app_meta (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE journal_entries (
  id          TEXT PRIMARY KEY NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER,

  audio_uri         TEXT,
  audio_duration_ms INTEGER NOT NULL DEFAULT 0,
  audio_sample_rate INTEGER NOT NULL DEFAULT 0,
  audio_channels    INTEGER NOT NULL DEFAULT 0,
  audio_byte_length INTEGER NOT NULL DEFAULT 0,

  transcript_text          TEXT,
  transcript_language      TEXT,
  transcript_model_id      TEXT,
  transcript_model_version TEXT,
  transcript_generated_at  INTEGER,

  title                     TEXT,
  summary                   TEXT,
  reflection_model_id       TEXT,
  reflection_model_version  TEXT,
  reflection_prompt_version TEXT,
  reflection_generated_at   INTEGER,

  mood               TEXT,
  mood_confidence    REAL,
  mood_model_id      TEXT,
  mood_model_version TEXT,
  mood_generated_at  INTEGER,

  processing_state TEXT NOT NULL,
  processing_error TEXT,

  is_favourite INTEGER NOT NULL DEFAULT 0,

  version   INTEGER NOT NULL DEFAULT 1,
  device_id TEXT NOT NULL
);

-- The Home list: newest live entries first.
CREATE INDEX idx_entries_live_created
  ON journal_entries (deleted_at, created_at DESC);

-- Finding work to resume after a restart.
CREATE INDEX idx_entries_state
  ON journal_entries (processing_state)
  WHERE deleted_at IS NULL;

CREATE TABLE entry_topics (
  entry_id   TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  confidence REAL NOT NULL,
  PRIMARY KEY (entry_id, name)
);

CREATE INDEX idx_entry_topics_name ON entry_topics (name);

CREATE TABLE entry_entities (
  entry_id   TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  name       TEXT NOT NULL,
  confidence REAL NOT NULL,
  PRIMARY KEY (entry_id, kind, name)
);

CREATE TABLE processing_jobs (
  id         TEXT PRIMARY KEY NOT NULL,
  entry_id   TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  status     TEXT NOT NULL,
  priority   INTEGER NOT NULL DEFAULT 0,

  attempts     INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error   TEXT,

  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  -- Exponential backoff: a retry is invisible to the claim query until now >= not_before.
  not_before   INTEGER NOT NULL DEFAULT 0,
  started_at   INTEGER,
  completed_at INTEGER,
  -- A 'running' job with a stale heartbeat was killed with the app; it is reclaimed.
  heartbeat_at INTEGER
);

-- The claim query: next runnable job, highest priority, oldest first.
CREATE INDEX idx_jobs_claim
  ON processing_jobs (status, not_before, priority DESC, created_at);

-- Idempotency: one live job of a given type per entry. Makes double-queueing
-- a constraint violation rather than duplicated work.
CREATE UNIQUE INDEX idx_jobs_one_live_per_entry_type
  ON processing_jobs (entry_id, type)
  WHERE status IN ('pending', 'running');
`;

/**
 * Connection-scoped pragmas. `foreign_keys` is OFF by default in SQLite and
 * resets per connection, so it must be set on every open — without it the
 * ON DELETE CASCADE rules above are silently inert.
 */
export const CONNECTION_PRAGMAS = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
`;
