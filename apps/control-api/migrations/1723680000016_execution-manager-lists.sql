-- BR-EX-72: workspace/profile-scoped, non-secret manager list projections.
-- These are Portal read models. Trading System remains source authority and
-- browser clients never receive relation records or credentials directly.

CREATE TABLE execution_manager_projection_snapshots (
  workspace_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('paper', 'sandbox', 'live')),
  projection_kind text NOT NULL CHECK (projection_kind IN ('ALPHA_FLEET', 'BINDINGS')),
  source_as_of timestamptz,
  source_completeness text NOT NULL CHECK (source_completeness IN ('COMPLETE', 'PARTIAL', 'UNKNOWN')),
  row_count integer NOT NULL CHECK (row_count >= 0),
  refreshed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, environment, projection_kind)
);

CREATE TABLE execution_alpha_fleet_projection (
  scope_id text NOT NULL,
  workspace_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('paper', 'sandbox', 'live')),
  alpha_id text NOT NULL,
  alpha_label text NOT NULL,
  version text NOT NULL,
  stage text NOT NULL,
  deployments jsonb NOT NULL,
  updated_at timestamptz NOT NULL,
  source_as_of timestamptz,
  projection_refreshed_at timestamptz NOT NULL,
  PRIMARY KEY (scope_id, alpha_id),
  CHECK (scope_id = workspace_id || ':' || environment),
  CHECK (jsonb_typeof(deployments) = 'array')
);

CREATE INDEX execution_alpha_fleet_projection_list_idx
  ON execution_alpha_fleet_projection (scope_id, updated_at DESC, alpha_id DESC);
CREATE INDEX execution_alpha_fleet_projection_filter_idx
  ON execution_alpha_fleet_projection (scope_id, stage, updated_at DESC, alpha_id DESC);

CREATE TABLE execution_binding_projection (
  scope_id text NOT NULL,
  workspace_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('paper', 'sandbox', 'live')),
  binding_id text NOT NULL,
  account_id text NOT NULL,
  venue text NOT NULL,
  state text NOT NULL,
  credential_state text NOT NULL,
  updated_at timestamptz NOT NULL,
  source_as_of timestamptz,
  projection_refreshed_at timestamptz NOT NULL,
  PRIMARY KEY (scope_id, binding_id),
  CHECK (scope_id = workspace_id || ':' || environment)
);

CREATE INDEX execution_binding_projection_list_idx
  ON execution_binding_projection (scope_id, updated_at DESC, binding_id DESC);
CREATE INDEX execution_binding_projection_filter_idx
  ON execution_binding_projection (scope_id, venue, state, updated_at DESC, binding_id DESC);
