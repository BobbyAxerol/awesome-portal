-- EDS-06: Portal-owned durable current/range mirror.
--
-- These rows are observations accepted by the SGP projection worker.  They
-- are not Trading System lifecycle events and do not contain an Edge cursor,
-- credential, broker reference, or raw source request.

CREATE TABLE execution_durable_mirror_batches (
  batch_id uuid PRIMARY KEY,
  workspace_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('paper', 'sandbox', 'live')),
  profile_id text NOT NULL,
  source_contract_revision text NOT NULL,
  source_epoch text NOT NULL,
  source_cursor_digest text NOT NULL CHECK (source_cursor_digest ~ '^sha256:[0-9a-f]{64}$'),
  source_as_of timestamptz,
  received_at timestamptz NOT NULL,
  completeness text NOT NULL CHECK (completeness IN ('COMPLETE', 'PARTIAL', 'UNKNOWN')),
  projection_epoch uuid NOT NULL,
  projection_sequence bigint NOT NULL CHECK (projection_sequence >= 1),
  payload_digest text NOT NULL CHECK (payload_digest ~ '^sha256:[0-9a-f]{64}$'),
  read_model_revision uuid NOT NULL UNIQUE,
  relation_count integer NOT NULL CHECK (relation_count >= 0),
  state text NOT NULL CHECK (state IN ('PENDING', 'COMMITTED', 'QUARANTINED')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  committed_at timestamptz,
  CHECK (profile_id LIKE upper(environment) || E'\\_%' ESCAPE E'\\')
);

CREATE INDEX execution_durable_mirror_batches_profile_created_idx
  ON execution_durable_mirror_batches
  (workspace_id, environment, profile_id, created_at DESC, batch_id DESC);

CREATE TABLE execution_durable_mirror_revisions (
  read_model_revision uuid PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES execution_durable_mirror_batches(batch_id) ON DELETE RESTRICT,
  workspace_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('paper', 'sandbox', 'live')),
  profile_id text NOT NULL,
  projection_epoch uuid NOT NULL,
  projection_sequence bigint NOT NULL CHECK (projection_sequence >= 1),
  payload_digest text NOT NULL CHECK (payload_digest ~ '^sha256:[0-9a-f]{64}$'),
  state text NOT NULL CHECK (state IN ('COMMITTED', 'QUARANTINED')),
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- A committed revision is inserted before the previous revision is demoted,
  -- inside one transaction.  Only a quarantined revision is forbidden from
  -- ever becoming current.
  CHECK (state <> 'QUARANTINED' OR NOT is_current),
  CHECK (profile_id LIKE upper(environment) || E'\\_%' ESCAPE E'\\')
);

CREATE UNIQUE INDEX execution_durable_mirror_one_current_revision_idx
  ON execution_durable_mirror_revisions (workspace_id, environment, profile_id)
  WHERE is_current;

CREATE INDEX execution_durable_mirror_revisions_profile_sequence_idx
  ON execution_durable_mirror_revisions
  (workspace_id, environment, profile_id, projection_epoch, projection_sequence DESC);

CREATE TABLE execution_durable_mirror_observations (
  batch_id uuid NOT NULL REFERENCES execution_durable_mirror_batches(batch_id) ON DELETE CASCADE,
  workspace_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('paper', 'sandbox', 'live')),
  profile_id text NOT NULL,
  relation_key text NOT NULL,
  source_id text NOT NULL,
  relation_name text NOT NULL,
  availability text NOT NULL CHECK (availability IN ('AVAILABLE', 'UNAVAILABLE')),
  reason_code text,
  as_of timestamptz,
  freshness text NOT NULL CHECK (freshness IN ('FRESH', 'AGING', 'STALE', 'UNKNOWN')),
  completeness text NOT NULL CHECK (completeness IN ('COMPLETE', 'PARTIAL', 'UNKNOWN')),
  item_count integer NOT NULL CHECK (item_count >= 0),
  source_relation_digest text NOT NULL CHECK (source_relation_digest ~ '^sha256:[0-9a-f]{64}$'),
  observed_at timestamptz NOT NULL,
  PRIMARY KEY (batch_id, relation_key),
  CHECK (profile_id LIKE upper(environment) || E'\\_%' ESCAPE E'\\')
);

CREATE INDEX execution_durable_mirror_observations_relation_idx
  ON execution_durable_mirror_observations
  (workspace_id, environment, profile_id, relation_key, observed_at DESC);

CREATE TABLE execution_durable_mirror_current_entities (
  workspace_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('paper', 'sandbox', 'live')),
  profile_id text NOT NULL,
  relation_key text NOT NULL,
  entity_key text NOT NULL,
  strategy_id text,
  deployment_id text,
  account_id text,
  portfolio_id text,
  binding_id text,
  source_row_digest text NOT NULL CHECK (source_row_digest ~ '^sha256:[0-9a-f]{64}$'),
  fields jsonb NOT NULL CHECK (jsonb_typeof(fields) = 'object'),
  first_observed_batch_id uuid NOT NULL REFERENCES execution_durable_mirror_batches(batch_id) ON DELETE RESTRICT,
  last_observed_batch_id uuid NOT NULL REFERENCES execution_durable_mirror_batches(batch_id) ON DELETE RESTRICT,
  last_read_model_revision uuid NOT NULL REFERENCES execution_durable_mirror_revisions(read_model_revision) ON DELETE RESTRICT,
  first_observed_at timestamptz NOT NULL,
  last_observed_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, environment, profile_id, relation_key, entity_key),
  CHECK (profile_id LIKE upper(environment) || E'\\_%' ESCAPE E'\\')
);

CREATE INDEX execution_durable_mirror_current_entities_page_idx
  ON execution_durable_mirror_current_entities
  (workspace_id, environment, profile_id, relation_key, entity_key);

CREATE INDEX execution_durable_mirror_current_entities_strategy_idx
  ON execution_durable_mirror_current_entities
  (workspace_id, environment, profile_id, relation_key, strategy_id, entity_key)
  WHERE strategy_id IS NOT NULL;

CREATE INDEX execution_durable_mirror_current_entities_deployment_idx
  ON execution_durable_mirror_current_entities
  (workspace_id, environment, profile_id, relation_key, deployment_id, entity_key)
  WHERE deployment_id IS NOT NULL;

CREATE INDEX execution_durable_mirror_current_entities_account_idx
  ON execution_durable_mirror_current_entities
  (workspace_id, environment, profile_id, relation_key, account_id, entity_key)
  WHERE account_id IS NOT NULL;

CREATE INDEX execution_durable_mirror_current_entities_portfolio_idx
  ON execution_durable_mirror_current_entities
  (workspace_id, environment, profile_id, relation_key, portfolio_id, entity_key)
  WHERE portfolio_id IS NOT NULL;

CREATE INDEX execution_durable_mirror_current_entities_binding_idx
  ON execution_durable_mirror_current_entities
  (workspace_id, environment, profile_id, relation_key, binding_id, entity_key)
  WHERE binding_id IS NOT NULL;

CREATE TABLE execution_durable_mirror_range_rows (
  workspace_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('paper', 'sandbox', 'live')),
  profile_id text NOT NULL,
  relation_key text NOT NULL,
  row_id text NOT NULL,
  ts timestamptz NOT NULL,
  strategy_id text,
  deployment_id text,
  account_id text,
  portfolio_id text,
  binding_id text,
  source_row_digest text NOT NULL CHECK (source_row_digest ~ '^sha256:[0-9a-f]{64}$'),
  fields jsonb NOT NULL CHECK (jsonb_typeof(fields) = 'object'),
  first_observed_batch_id uuid NOT NULL REFERENCES execution_durable_mirror_batches(batch_id) ON DELETE RESTRICT,
  first_observed_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, environment, profile_id, relation_key, row_id),
  CHECK (profile_id LIKE upper(environment) || E'\\_%' ESCAPE E'\\')
);

CREATE INDEX execution_durable_mirror_range_rows_time_idx
  ON execution_durable_mirror_range_rows
  (workspace_id, environment, profile_id, relation_key, ts, row_id);

CREATE INDEX execution_durable_mirror_range_rows_strategy_time_idx
  ON execution_durable_mirror_range_rows
  (workspace_id, environment, profile_id, relation_key, strategy_id, ts, row_id)
  WHERE strategy_id IS NOT NULL;

CREATE INDEX execution_durable_mirror_range_rows_deployment_time_idx
  ON execution_durable_mirror_range_rows
  (workspace_id, environment, profile_id, relation_key, deployment_id, ts, row_id)
  WHERE deployment_id IS NOT NULL;

CREATE INDEX execution_durable_mirror_range_rows_account_time_idx
  ON execution_durable_mirror_range_rows
  (workspace_id, environment, profile_id, relation_key, account_id, ts, row_id)
  WHERE account_id IS NOT NULL;

CREATE INDEX execution_durable_mirror_range_rows_portfolio_time_idx
  ON execution_durable_mirror_range_rows
  (workspace_id, environment, profile_id, relation_key, portfolio_id, ts, row_id)
  WHERE portfolio_id IS NOT NULL;

CREATE INDEX execution_durable_mirror_range_rows_binding_time_idx
  ON execution_durable_mirror_range_rows
  (workspace_id, environment, profile_id, relation_key, binding_id, ts, row_id)
  WHERE binding_id IS NOT NULL;

CREATE TABLE execution_durable_mirror_continuations (
  workspace_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('paper', 'sandbox', 'live')),
  profile_id text NOT NULL,
  relation_key text NOT NULL,
  continuation_authority text NOT NULL CHECK (continuation_authority = 'SERVER_ONLY_LEGACY_COORDINATOR'),
  continuation_digest text NOT NULL CHECK (continuation_digest ~ '^sha256:[0-9a-f]{64}$'),
  last_batch_id uuid NOT NULL REFERENCES execution_durable_mirror_batches(batch_id) ON DELETE RESTRICT,
  last_read_model_revision uuid NOT NULL REFERENCES execution_durable_mirror_revisions(read_model_revision) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, environment, profile_id, relation_key),
  CHECK (profile_id LIKE upper(environment) || E'\\_%' ESCAPE E'\\')
);

CREATE TABLE execution_durable_mirror_gaps (
  gap_id uuid PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES execution_durable_mirror_batches(batch_id) ON DELETE CASCADE,
  workspace_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('paper', 'sandbox', 'live')),
  profile_id text NOT NULL,
  relation_key text NOT NULL,
  entity_key text,
  reason_code text NOT NULL CHECK (reason_code ~ '^[A-Z][A-Z0-9_]{1,95}$'),
  detected_at timestamptz NOT NULL,
  CHECK (profile_id LIKE upper(environment) || E'\\_%' ESCAPE E'\\')
);

CREATE INDEX execution_durable_mirror_gaps_profile_relation_idx
  ON execution_durable_mirror_gaps
  (workspace_id, environment, profile_id, relation_key, detected_at DESC);

CREATE TABLE execution_durable_mirror_conflicts (
  conflict_id uuid PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES execution_durable_mirror_batches(batch_id) ON DELETE CASCADE,
  workspace_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('paper', 'sandbox', 'live')),
  profile_id text NOT NULL,
  relation_key text NOT NULL,
  row_id text NOT NULL,
  existing_digest text NOT NULL CHECK (existing_digest ~ '^sha256:[0-9a-f]{64}$'),
  incoming_digest text NOT NULL CHECK (incoming_digest ~ '^sha256:[0-9a-f]{64}$'),
  reason_code text NOT NULL CHECK (reason_code = 'EDS06_EXACT_RANGE_DIGEST_CONFLICT'),
  detected_at timestamptz NOT NULL,
  CHECK (profile_id LIKE upper(environment) || E'\\_%' ESCAPE E'\\')
);

CREATE INDEX execution_durable_mirror_conflicts_profile_relation_idx
  ON execution_durable_mirror_conflicts
  (workspace_id, environment, profile_id, relation_key, detected_at DESC);
