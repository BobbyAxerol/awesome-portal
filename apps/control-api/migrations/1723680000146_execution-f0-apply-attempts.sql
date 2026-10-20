-- BE-P13 (Execution Loop V2, UXM-09 request "an idempotency key on F0 apply").
-- Additive: one new table, no existing column, constraint, writer, view or index changes.
--
-- F0 apply can only ever be DENIED (COMMAND_RELAY_DISABLED, nothing sent): the plan table
-- is immutable and CHECK-constrained to status BLOCKED / relay DISABLED. This table makes
-- that answer REPLAYABLE and RECOVERABLE: it records, per (workspace, actor, request_key),
-- which operation the key was first used for and the (constant) decision that was returned,
-- so (a) the same key + same operation returns the stored typed answer again,
-- (b) the same key + a different operation is a typed REQUEST_KEY_PAYLOAD_CONFLICT, and
-- (c) a client that lost the response can read the stored answer by key.
-- It is NOT a dispatch ledger: nothing here is ever sent, no outbox row is written, and the
-- CHECKs below make "sent" or "retryable" unrepresentable.
--
-- Append-only. Keys are never recycled or evicted (a recycled key would let a replay
-- become a different answer). Retention follows the plans it references (no automatic delete).
-- Up Migration
CREATE TABLE execution_f0_apply_attempts (
    workspace_id        text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    actor_user_id       text NOT NULL REFERENCES portal_users(user_id) ON DELETE RESTRICT,
    request_key         text NOT NULL CHECK (request_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$'),
    operation_id        text NOT NULL REFERENCES execution_command_plans_f0(operation_id) ON DELETE RESTRICT,
    intent_hash         text NOT NULL CHECK (intent_hash ~ '^sha256:[0-9a-f]{64}$'),
    decision            text NOT NULL DEFAULT 'DENIED' CHECK (decision = 'DENIED'),
    reason_code         text NOT NULL DEFAULT 'COMMAND_RELAY_DISABLED' CHECK (reason_code = 'COMMAND_RELAY_DISABLED'),
    retry_allowed       boolean NOT NULL DEFAULT false CHECK (NOT retry_allowed),
    source_request_sent boolean NOT NULL DEFAULT false CHECK (NOT source_request_sent),
    created_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, actor_user_id, request_key)
);

CREATE FUNCTION reject_execution_f0_apply_attempt_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'execution F0 apply attempts are append-only'
    USING ERRCODE = '55000';
  RETURN OLD;
END;
$$;

CREATE TRIGGER execution_f0_apply_attempts_immutable
BEFORE UPDATE OR DELETE ON execution_f0_apply_attempts
FOR EACH ROW EXECUTE FUNCTION reject_execution_f0_apply_attempt_mutation();

-- Down Migration
DROP TRIGGER execution_f0_apply_attempts_immutable ON execution_f0_apply_attempts;
DROP FUNCTION reject_execution_f0_apply_attempt_mutation();
DROP TABLE execution_f0_apply_attempts;
