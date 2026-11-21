-- Up Migration
-- Portal transport correlation, NOT an economic ledger or a TS authority seed.
CREATE TABLE execution_trusted_commands (
  command_id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(workspace_id),
  actor_user_id text NOT NULL REFERENCES portal_users(user_id),
  key_hash text NOT NULL,
  intent_hash text NOT NULL,
  intent jsonb NOT NULL CHECK (octet_length(intent::text)<=32768),
  authorization_fact jsonb NOT NULL CHECK (octet_length(authorization_fact::text)<=32768),
  status jsonb NOT NULL CHECK (octet_length(status::text)<=32768),
  attempt_id text,
  created_at_ms bigint NOT NULL,
  updated_at_ms bigint NOT NULL,
  UNIQUE(workspace_id,key_hash),
  CHECK (command_id ~ '^ecm_[a-f0-9]{32}$'),
  CHECK (intent_hash ~ '^sha256:[a-f0-9]{64}$'),
  CHECK (key_hash ~ '^sha256:[a-f0-9]{64}$'),
  CHECK (status->>'delivery' IN ('PREPARED','SENDING','ACKNOWLEDGED','DELIVERY_UNKNOWN','FAILED_BEFORE_SEND'))
);
CREATE INDEX execution_trusted_commands_workspace ON execution_trusted_commands(workspace_id,created_at_ms);
CREATE TABLE execution_trusted_command_events (
  command_id text NOT NULL REFERENCES execution_trusted_commands(command_id),
  event_id text NOT NULL,
  status jsonb NOT NULL CHECK (octet_length(status::text)<=32768),
  recorded_at_ms bigint NOT NULL,
  PRIMARY KEY(command_id,event_id)
);
CREATE FUNCTION execution_trusted_command_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR TG_TABLE_NAME='execution_trusted_command_events' THEN
    RAISE EXCEPTION 'COMMAND_HISTORY_IMMUTABLE';
  END IF;
  IF (NEW.command_id,NEW.workspace_id,NEW.actor_user_id,NEW.key_hash,NEW.intent_hash,NEW.intent,NEW.authorization_fact,NEW.created_at_ms)
    IS DISTINCT FROM (OLD.command_id,OLD.workspace_id,OLD.actor_user_id,OLD.key_hash,OLD.intent_hash,OLD.intent,OLD.authorization_fact,OLD.created_at_ms) THEN
    RAISE EXCEPTION 'COMMAND_INTENT_IMMUTABLE';
  END IF;
  IF OLD.status->>'delivery'<>'PREPARED' AND NEW.status->>'delivery'='PREPARED' THEN
    RAISE EXCEPTION 'COMMAND_ATTEMPT_NOT_REUSABLE';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER execution_trusted_command_guard BEFORE UPDATE OR DELETE ON execution_trusted_commands
  FOR EACH ROW EXECUTE FUNCTION execution_trusted_command_immutable();
CREATE TRIGGER execution_trusted_command_event_guard BEFORE UPDATE OR DELETE ON execution_trusted_command_events
  FOR EACH ROW EXECUTE FUNCTION execution_trusted_command_immutable();
-- No TTL/cascade delete: accepted and ambiguous intents must survive rollback,
-- actor revocation and restart. Explicit future retention must preserve source
-- idempotency windows and recovery references; never recycle keys by expiry.

-- Down Migration
-- Deliberately non-destructive. Disable new sends; retain recovery/audit rows.
