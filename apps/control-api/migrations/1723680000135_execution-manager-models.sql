-- Up Migration
-- Rebuildable read projections only, not a second economic ledger. Installation
-- is forward-only; no runtime writer is enabled by this DDL.
CREATE TABLE execution_manager_model_revisions (
  workspace_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('paper','sandbox','live')),
  profile_id text NOT NULL,
  revision text NOT NULL,
  source_epoch text NOT NULL,
  source_sequence numeric(19,0) NOT NULL CHECK (source_sequence >= 0),
  projection_generation text NOT NULL,
  payload_digest text NOT NULL CHECK (payload_digest ~ '^sha256:[a-f0-9]{64}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
  rebuild_receipt_ref text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,environment,profile_id,revision),
  UNIQUE (workspace_id,environment,profile_id,source_epoch,projection_generation,source_sequence),
  CHECK (octet_length(payload::text) <= 16777216)
);
CREATE TABLE execution_manager_model_heads (
  workspace_id text NOT NULL,
  environment text NOT NULL,
  profile_id text NOT NULL,
  revision text NOT NULL,
  source_epoch text NOT NULL,
  source_sequence numeric(19,0) NOT NULL,
  projection_generation text NOT NULL,
  payload_digest text NOT NULL,
  catalogue_digest text NOT NULL,
  PRIMARY KEY (workspace_id,environment,profile_id),
  FOREIGN KEY (workspace_id,environment,profile_id,revision)
    REFERENCES execution_manager_model_revisions(workspace_id,environment,profile_id,revision)
);
COMMENT ON TABLE execution_manager_model_revisions IS
  'Rebuildable TS-derived Manager projection revisions; no credentials/identity/capital authority; bounded writer ceiling, no implicit historical retention promise';
COMMENT ON TABLE execution_manager_model_heads IS
  'Atomic current projection plus source checkpoint; ACK/notification only after containing transaction COMMIT';

-- Down Migration
-- Destructive rollback deliberately unavailable: switch compatible readers off,
-- preserve immutable source/revision/checkpoint receipts.
