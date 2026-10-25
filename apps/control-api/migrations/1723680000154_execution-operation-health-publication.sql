-- Up Migration
-- Additive source observations only. Never rewrite an operation's status,
-- verification result, triage or authority. No source is commissioned here.
CREATE TABLE execution_operation_health_heads (
  workspace_id text NOT NULL REFERENCES workspaces(workspace_id),
  source_ref text NOT NULL,
  source_epoch text NOT NULL,
  source_sequence numeric(19,0) CHECK (source_sequence > 0),
  source_revision text,
  source_as_of timestamptz,
  retired boolean NOT NULL DEFAULT false,
  PRIMARY KEY (workspace_id,source_ref),
  CHECK (retired OR (source_sequence IS NOT NULL AND source_revision IS NOT NULL AND source_as_of IS NOT NULL))
);
CREATE TABLE execution_operation_health_receipts (
  workspace_id text NOT NULL REFERENCES workspaces(workspace_id),
  source_ref text NOT NULL,
  source_revision text NOT NULL,
  source_epoch text NOT NULL,
  source_sequence numeric(19,0) NOT NULL CHECK (source_sequence > 0),
  payload_digest text NOT NULL CHECK (payload_digest ~ '^sha256:[a-f0-9]{64}$'),
  payload jsonb NOT NULL CHECK (octet_length(payload::text) <= 1048576),
  source_as_of timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > source_as_of),
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id,source_ref,source_revision),
  UNIQUE (workspace_id,source_ref,source_epoch,source_sequence)
);
CREATE FUNCTION protect_execution_operation_health_receipt() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'execution operation health receipt is immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER execution_operation_health_receipt_immutable
  BEFORE UPDATE OR DELETE ON execution_operation_health_receipts
  FOR EACH ROW EXECUTE FUNCTION protect_execution_operation_health_receipt();

CREATE TABLE execution_operation_health_observations (
  workspace_id text NOT NULL REFERENCES workspaces(workspace_id),
  operation_id text NOT NULL REFERENCES execution_operation_queue_items(operation_id),
  source_ref text NOT NULL,
  source_revision text NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('ACCOUNT','PORTFOLIO','DEPLOYMENT')),
  target_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('PAPER','SANDBOX','LIVE')),
  workflow_version integer NOT NULL CHECK (workflow_version > 0),
  delivery_state text CHECK (delivery_state IN ('NOT_APPLICABLE','AWAITING_RECEIPT','RECEIPT_CONFIRMED','RECEIPT_FAILED')),
  display_state text CHECK (display_state IN ('CURRENT','CATCHING_UP','STALE')),
  PRIMARY KEY (workspace_id,operation_id),
  FOREIGN KEY (workspace_id,source_ref,source_revision)
    REFERENCES execution_operation_health_receipts(workspace_id,source_ref,source_revision)
);
CREATE VIEW execution_operation_queue_health_v2 AS
SELECT q.*,
  COALESCE(o.delivery_state,'NOT_REPORTED') AS delivery_state,
  COALESCE(o.display_state,'NOT_REPORTED') AS display_state
FROM execution_operation_queue_v2 q
LEFT JOIN (
  SELECT o.* FROM execution_operation_health_observations o
  JOIN execution_operation_health_receipts r USING (workspace_id,source_ref,source_revision)
  JOIN execution_operation_health_heads h USING (workspace_id,source_ref)
  WHERE NOT h.retired AND h.source_epoch=r.source_epoch
    AND r.source_as_of <= CURRENT_TIMESTAMP AND r.expires_at > CURRENT_TIMESTAMP
) o ON o.workspace_id=q.workspace_id AND o.operation_id=q.operation_id
  AND o.target_type=q.target_type AND o.target_id=q.target_id
  AND o.environment=q.environment AND o.workflow_version=q.workflow_version;

-- Down Migration
-- Non-destructive rollback: old readers ignore this view. Preserve original
-- receipts/heads/observations, including retirements, for audit and recovery.
DROP VIEW IF EXISTS execution_operation_queue_health_v2;
