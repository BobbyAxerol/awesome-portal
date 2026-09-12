-- Up Migration
-- BE-R2-8: Portal-only immutable review capture journal. No execution authority.
CREATE TABLE governance_review_captures (
  capture_id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE RESTRICT,
  actor_user_id text NOT NULL REFERENCES portal_users(user_id) ON DELETE RESTRICT,
  request_key text NOT NULL CHECK (length(request_key) BETWEEN 1 AND 192),
  action text NOT NULL CHECK (action IN ('R2_CREATE', 'PAPER_EXIT_CREATE', 'SANDBOX_NOTE')),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^sha256:[0-9a-f]{64}$'),
  aggregate_id text NOT NULL,
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, actor_user_id, request_key)
);
CREATE TRIGGER governance_review_captures_immutable
BEFORE UPDATE OR DELETE ON governance_review_captures
FOR EACH ROW EXECUTE FUNCTION reject_governance_immutable_mutation();

-- A human review note must never impersonate a broker/source finding.
ALTER TABLE governance_sandbox_findings
  DROP CONSTRAINT governance_sandbox_findings_source_authority_check,
  ADD CONSTRAINT governance_sandbox_findings_source_authority_check
    CHECK (source_authority IN ('PORTAL', 'EXECUTION', 'BROKER', 'DERIVED'));

-- Down Migration
-- Retain captured reviews; rollback application code, not audit/business rows.
DO $$ BEGIN RAISE EXCEPTION 'Review capture migration is forward-only'; END $$;
