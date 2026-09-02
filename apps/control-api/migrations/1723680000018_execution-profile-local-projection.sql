-- Phase 1 / N30-N31: SGP-local, profile-isolated execution read model.
-- Trading System remains source authority. Browser requests read only these
-- committed documents and can never turn a cache miss into an AWS-HK call.

CREATE TABLE execution_profile_projection_leases (
  workspace_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('paper', 'sandbox', 'live')),
  profile_id text NOT NULL,
  owner_id text NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, environment, profile_id),
  CHECK (profile_id LIKE upper(environment) || '\_%' ESCAPE '\')
);

CREATE TABLE execution_profile_projection_snapshots (
  workspace_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('paper', 'sandbox', 'live')),
  profile_id text NOT NULL,
  source_contract_revision text NOT NULL,
  source_epoch text NOT NULL,
  source_cursor text NOT NULL,
  source_as_of timestamptz,
  received_at timestamptz NOT NULL,
  last_successful_refresh_at timestamptz NOT NULL,
  completeness text NOT NULL CHECK (completeness IN ('COMPLETE', 'PARTIAL', 'UNKNOWN')),
  projection_epoch uuid NOT NULL,
  projection_sequence bigint NOT NULL CHECK (projection_sequence >= 1),
  payload_digest text NOT NULL CHECK (payload_digest ~ '^sha256:[0-9a-f]{64}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, environment, profile_id),
  CHECK (profile_id LIKE upper(environment) || '\_%' ESCAPE '\')
);

CREATE INDEX execution_profile_projection_freshness_idx
  ON execution_profile_projection_snapshots
  (workspace_id, environment, last_successful_refresh_at DESC);

CREATE TABLE execution_profile_projection_journal (
  workspace_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('paper', 'sandbox', 'live')),
  profile_id text NOT NULL,
  projection_epoch uuid NOT NULL,
  projection_sequence bigint NOT NULL CHECK (projection_sequence >= 1),
  event_kind text NOT NULL CHECK (event_kind IN ('delta')),
  source_as_of timestamptz,
  received_at timestamptz NOT NULL,
  completeness text NOT NULL CHECK (completeness IN ('COMPLETE', 'PARTIAL', 'UNKNOWN')),
  payload_digest text NOT NULL CHECK (payload_digest ~ '^sha256:[0-9a-f]{64}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, environment, profile_id, projection_epoch, projection_sequence),
  CHECK (profile_id LIKE upper(environment) || '\_%' ESCAPE '\')
);

CREATE INDEX execution_profile_projection_journal_replay_idx
  ON execution_profile_projection_journal
  (workspace_id, environment, profile_id, projection_epoch, projection_sequence);

CREATE INDEX execution_profile_projection_journal_retention_idx
  ON execution_profile_projection_journal (created_at);
