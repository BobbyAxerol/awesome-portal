-- EDS-11R5 Portal-side durable acknowledgement store.  This is deliberately
-- separate from execution_profile_projection_*: those tables retain bounded
-- current observations, while this schema can only retain an accepted,
-- source-owned exact event stream after a future explicit cutover.
--
-- The migration adds no worker, source transport, listener or route.  It is
-- safe to apply before source publication because every stream starts absent.

CREATE TABLE IF NOT EXISTS execution_authoritative_event_streams (
  workspace_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('paper', 'sandbox', 'live')),
  profile_id text NOT NULL,
  venue text NOT NULL,
  contract_revision text NOT NULL,
  source_epoch text NOT NULL CHECK (source_epoch ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  snapshot_semantics text NOT NULL CHECK (snapshot_semantics = 'EVENT_LOG_ANCHOR'),
  anchor_sequence numeric(20, 0) NOT NULL CHECK (anchor_sequence >= 0),
  acknowledged_sequence numeric(20, 0) NOT NULL CHECK (acknowledged_sequence >= 0),
  retention_floor_sequence numeric(20, 0) NOT NULL CHECK (retention_floor_sequence >= 0),
  state text NOT NULL CHECK (state IN ('ACTIVE', 'RESNAPSHOT_REQUIRED')),
  resnapshot_reason text,
  last_anchor_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_ack_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, environment, profile_id, venue),
  CHECK (retention_floor_sequence <= anchor_sequence),
  CHECK (acknowledged_sequence >= anchor_sequence)
);

CREATE TABLE IF NOT EXISTS execution_authoritative_event_entries (
  workspace_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('paper', 'sandbox', 'live')),
  profile_id text NOT NULL,
  venue text NOT NULL,
  source_epoch text NOT NULL CHECK (source_epoch ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  source_sequence numeric(20, 0) NOT NULL CHECK (source_sequence > 0),
  event_id text NOT NULL,
  entity text NOT NULL CHECK (entity = 'domain_event'),
  entity_id text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('UPSERT', 'DELETE')),
  entity_version numeric(20, 0) NOT NULL CHECK (entity_version >= 0),
  supersedes_event_id text,
  safe_record jsonb,
  event_digest text NOT NULL CHECK (event_digest ~ '^sha256:[0-9a-f]{64}$'),
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, environment, profile_id, venue, source_epoch, source_sequence),
  UNIQUE (workspace_id, environment, profile_id, venue, source_epoch, event_id),
  CHECK (
    (operation = 'UPSERT' AND safe_record IS NOT NULL)
    OR (operation = 'DELETE' AND safe_record IS NULL)
  ),
  CHECK (safe_record IS NULL OR jsonb_typeof(safe_record) = 'object'),
  -- The producer contract forbids raw business payloads and credentials.  The
  -- Portal validator applies the same rule recursively before this table is
  -- reached; the database catches the direct top-level escape hatch too.
  CHECK (
    safe_record IS NULL
    OR NOT (safe_record ?| ARRAY['payload', 'raw', 'raw_request', 'raw_response', 'credential', 'secret', 'password', 'authorization', 'access_token', 'refresh_token', 'api_key', 'private_key', 'dsn', 'connection_string'])
  )
);

CREATE INDEX IF NOT EXISTS execution_authoritative_event_entries_tail_idx
  ON execution_authoritative_event_entries
     (workspace_id, environment, profile_id, venue, source_epoch, source_sequence ASC);

CREATE TABLE IF NOT EXISTS execution_authoritative_event_entities (
  workspace_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('paper', 'sandbox', 'live')),
  profile_id text NOT NULL,
  venue text NOT NULL,
  source_epoch text NOT NULL CHECK (source_epoch ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  entity text NOT NULL CHECK (entity = 'domain_event'),
  entity_id text NOT NULL,
  latest_event_id text NOT NULL,
  latest_source_sequence numeric(20, 0) NOT NULL CHECK (latest_source_sequence > 0),
  entity_version numeric(20, 0) NOT NULL CHECK (entity_version >= 0),
  deleted boolean NOT NULL,
  safe_record jsonb,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, environment, profile_id, venue, source_epoch, entity, entity_id),
  CHECK ((deleted = false AND safe_record IS NOT NULL) OR (deleted = true AND safe_record IS NULL)),
  CHECK (safe_record IS NULL OR jsonb_typeof(safe_record) = 'object'),
  CHECK (
    safe_record IS NULL
    OR NOT (safe_record ?| ARRAY['payload', 'raw', 'raw_request', 'raw_response', 'credential', 'secret', 'password', 'authorization', 'access_token', 'refresh_token', 'api_key', 'private_key', 'dsn', 'connection_string'])
  )
);

CREATE INDEX IF NOT EXISTS execution_authoritative_event_entities_live_idx
  ON execution_authoritative_event_entities
     (workspace_id, environment, profile_id, venue, source_epoch, entity, latest_source_sequence DESC)
  WHERE deleted = false;
