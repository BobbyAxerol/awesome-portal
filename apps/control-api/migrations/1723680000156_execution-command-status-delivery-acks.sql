-- An authenticated Edge delivery ACK is distinct from source terminal
-- custody. Never store tokens, source payloads or invent an ACK on restart.
-- Up Migration
CREATE TABLE execution_command_status_delivery_acks (
  lease_id text PRIMARY KEY,
  workspace_id text NOT NULL,
  subject_id text NOT NULL,
  session_id text NOT NULL,
  session_revision bigint NOT NULL CHECK (session_revision >= 0),
  environment text NOT NULL CHECK (environment = 'paper'),
  workload_id text NOT NULL,
  request_digest text NOT NULL CHECK (request_digest ~ '^sha256:[0-9a-f]{64}$'),
  response_digest text NOT NULL CHECK (response_digest ~ '^sha256:[0-9a-f]{64}$'),
  terminal_receipt_digest text NOT NULL CHECK (terminal_receipt_digest ~ '^sha256:[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION execution_command_status_delivery_ack_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'COMMAND_STATUS_DELIVERY_ACK_IMMUTABLE';
END $$;
CREATE TRIGGER command_status_delivery_ack_immutable BEFORE UPDATE OR DELETE
  ON execution_command_status_delivery_acks FOR EACH ROW
  EXECUTE FUNCTION execution_command_status_delivery_ack_immutable();
COMMENT ON TABLE execution_command_status_delivery_acks IS
  'Append-only exact Edge delivery acknowledgement after authenticated source terminal; no payloads or credentials.';

-- Down Migration
-- An empty down section would silently remove the migration ledger row while
-- leaving the table behind. Refuse instead: custody/ACK evidence cannot be
-- dropped without an explicit, separately approved archive/recovery plan.
DO $$ BEGIN
  RAISE EXCEPTION 'COMMAND_STATUS_CUSTODY_DOWN_REQUIRES_APPROVED_ARCHIVE';
END $$;
