-- Up Migration
-- Private rebuildable calculation custody, not identity/economic authority.
-- Preserve original financial revisions; policy-only work cannot advance their
-- source checkpoint, source clocks or source ACK. Explicit bounds stop writes.
CREATE TABLE execution_manager_calculation_revisions (
  workspace_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('paper','sandbox','live')),
  profile_id text NOT NULL,
  source_revision text NOT NULL,
  calculation_key text NOT NULL CHECK (calculation_key ~ '^sha256:[a-f0-9]{64}$'),
  payload_digest text NOT NULL CHECK (payload_digest ~ '^sha256:[a-f0-9]{64}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,environment,profile_id,source_revision,calculation_key),
  FOREIGN KEY (workspace_id,environment,profile_id,source_revision)
    REFERENCES execution_manager_model_revisions(workspace_id,environment,profile_id,revision),
  CHECK (octet_length(payload::text) <= 16777216)
);
CREATE TABLE execution_manager_calculation_heads (
  workspace_id text NOT NULL,
  environment text NOT NULL,
  profile_id text NOT NULL,
  source_revision text NOT NULL,
  calculation_key text NOT NULL,
  PRIMARY KEY (workspace_id,environment,profile_id,source_revision),
  FOREIGN KEY (workspace_id,environment,profile_id,source_revision,calculation_key)
    REFERENCES execution_manager_calculation_revisions(workspace_id,environment,profile_id,source_revision,calculation_key)
);
COMMENT ON TABLE execution_manager_calculation_revisions IS
  'Immutable original PATH inputs and derived Score results, exact source FK, no scalar-to-PATH invention; explicit runtime byte/revision caps; retain on rollback';
COMMENT ON TABLE execution_manager_calculation_heads IS
  'Lease/source-head-fenced current derived calculation per immutable source; separate from source checkpoint; no new ACK or authority';

-- Down Migration
-- Uninstall compatible consumers/readers; retain original/derived evidence.
-- No automatic destructive rollback or rewriting source revision bytes.
