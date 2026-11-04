-- Up Migration
-- Short-lived, bounded pre-issuance correlation. This is not a lease,
-- authority grant, source attempt, terminal receipt or Edge ACK. In
-- particular it must never store a bearer, source payload or signing key.
CREATE TABLE execution_command_status_preparations (
  command_id text PRIMARY KEY REFERENCES execution_command_status_original_fingerprints(command_id),
  context_digest text NOT NULL UNIQUE CHECK (context_digest ~ '^sha256:[0-9a-f]{64}$'),
  context_nonce text NOT NULL CHECK (context_nonce ~ '^[A-Za-z0-9_-]{43}$'),
  subject_id text NOT NULL,
  session_id text NOT NULL,
  session_revision bigint NOT NULL CHECK (session_revision >= 0),
  workspace_id text NOT NULL,
  workload_id text NOT NULL,
  receiver_id text NOT NULL,
  original_digest text NOT NULL CHECK (original_digest ~ '^sha256:[0-9a-f]{64}$'),
  call_digest text NOT NULL CHECK (call_digest ~ '^sha256:[0-9a-f]{64}$'),
  binding_digest text NOT NULL CHECK (binding_digest ~ '^sha256:[0-9a-f]{64}$'),
  authority_fingerprint text NOT NULL CHECK (authority_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  pm_request_digest text NOT NULL CHECK (pm_request_digest ~ '^sha256:[0-9a-f]{64}$'),
  status_request_digest text NOT NULL CHECK (status_request_digest ~ '^sha256:[0-9a-f]{64}$'),
  status_token_digest text NOT NULL CHECK (status_token_digest ~ '^sha256:[0-9a-f]{64}$'),
  status_issued_at_ms bigint NOT NULL CHECK (status_issued_at_ms >= 0),
  context_expires_at_ms bigint NOT NULL CHECK (context_expires_at_ms > status_issued_at_ms),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX execution_command_status_preparations_expiry
  ON execution_command_status_preparations(context_expires_at_ms);
COMMENT ON TABLE execution_command_status_preparations IS
  'Bounded ephemeral pre-issuance correlation only. Expiry never resolves Edge/source custody or deletes immutable lease, original or ACK evidence.';

-- Down Migration
DO $$ BEGIN
  RAISE EXCEPTION 'COMMAND_STATUS_PREPARATION_DOWN_REQUIRES_APPROVED_DRAIN';
END $$;
