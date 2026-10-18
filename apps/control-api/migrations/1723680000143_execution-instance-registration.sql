-- Migration143 reserved after the prior normal hook landed25218372.
-- Up Migration
-- Core transport/registry correlation only. No economic balance/command seed,
-- access grant, provider installation, runtime flag or source authority.
CREATE TABLE execution_instance_registration_commands (
  command_id text PRIMARY KEY CHECK (command_id ~ '^ecm_[a-f0-9]{32}$'),
  workspace_id text NOT NULL REFERENCES workspaces(workspace_id),
  actor_user_id text NOT NULL REFERENCES portal_users(user_id),
  key_hash text NOT NULL CHECK (key_hash ~ '^sha256:[a-f0-9]{64}$'),
  intent_hash text NOT NULL CHECK (intent_hash ~ '^sha256:[a-f0-9]{64}$'),
  intent jsonb NOT NULL CHECK (jsonb_typeof(intent)='object' AND octet_length(intent::text)<=32768),
  authorization_fact jsonb NOT NULL CHECK (jsonb_typeof(authorization_fact)='object' AND octet_length(authorization_fact::text)<=32768),
  status jsonb NOT NULL CHECK (jsonb_typeof(status)='object' AND octet_length(status::text)<=32768),
  attempt_id text CHECK (attempt_id ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'),
  created_at_ms bigint NOT NULL CHECK (created_at_ms BETWEEN 0 AND 9007199254740991),
  updated_at_ms bigint NOT NULL CHECK (updated_at_ms BETWEEN created_at_ms AND 9007199254740991),
  UNIQUE(workspace_id,key_hash),
  CHECK (char_length(workspace_id) BETWEEN 1 AND 256 AND char_length(actor_user_id) BETWEEN 1 AND 256),
  CHECK (intent->>'schema_version' IS NOT DISTINCT FROM 'portal.execution.instance-registration-intent.v1'),
  CHECK (intent->>'workspace_id' IS NOT DISTINCT FROM workspace_id),
  CHECK (intent->'resource'->>'kind' IS NOT DISTINCT FROM 'PORTFOLIO'),
  CHECK (intent->'business_payload'->>'operation' IS NOT DISTINCT FROM 'REGISTER_INSTANCE'),
  CHECK (intent->'business_payload'->>'expected_version' IS NOT DISTINCT FROM '0'),
  CHECK (status->>'schema_version' IS NOT DISTINCT FROM 'portal.execution.instance-registration-status.v1'),
  CHECK (status->>'family' IS NOT DISTINCT FROM 'INSTANCE_REGISTRATION'),
  CHECK (status->>'operation' IS NOT DISTINCT FROM 'REGISTER_INSTANCE'),
  CHECK (status->>'command_id' IS NOT DISTINCT FROM command_id),
  CHECK (status->'resource' IS NOT DISTINCT FROM intent->'resource'),
  CHECK (status->>'environment' IS NOT DISTINCT FROM intent->>'environment'),
  CHECK (status->>'environment' IS NOT NULL AND status->>'environment' IN ('paper','sandbox','live')),
  CHECK (status->>'delivery' IS NOT NULL AND status->>'delivery' IN ('PREPARED','SENDING','ACKNOWLEDGED','DELIVERY_UNKNOWN','FAILED_BEFORE_SEND')),
  CHECK ((status->>'delivery'='SENDING') = (attempt_id IS NOT NULL)),
  CHECK (status->>'authority' IS NOT DISTINCT FROM authorization_fact->>'qualification'),
  CHECK (status->>'authority' IS NOT NULL AND status->>'authority' IN ('OWNER_VERIFIED','TEST_ONLY')),
  CHECK (status->>'profile_ref' IS NOT NULL AND status->>'profile_ref' IS NOT DISTINCT FROM authorization_fact->>'profile_ref'),
  CHECK (status->'created_at_ms' IS NOT DISTINCT FROM to_jsonb(created_at_ms)),
  CHECK (status->'updated_at_ms' IS NOT DISTINCT FROM to_jsonb(updated_at_ms)),
  CHECK (status->'business'->>'state' IS NOT NULL AND status->'business'->>'state' IN ('UNKNOWN','APPLIED')),
  CHECK (status->>'venue' IS NOT DISTINCT FROM 'NOT_APPLICABLE'),
  CHECK (status->>'projection' IS NOT DISTINCT FROM 'UNKNOWN'),
  CHECK (status->'canonical_identity' IS NOT DISTINCT FROM
    '{"availability":"NOT_PUBLISHED","reason_code":"SOURCE_CANONICAL_ACCOUNT_DEPLOYMENT_PAIR_NOT_PUBLISHED","account_id":null,"deployment_id":null}'::jsonb),
  CHECK (CASE WHEN status->'business'->>'state'='UNKNOWN' THEN
      status->'business'->'business_applied' IS NOT DISTINCT FROM 'null'::jsonb AND
      status->'business'->'receipt' IS NOT DISTINCT FROM 'null'::jsonb AND
      status->'business'->'source_instance_ref' IS NOT DISTINCT FROM 'null'::jsonb
    ELSE status->>'delivery'='ACKNOWLEDGED' AND
      status->'business'->'business_applied' IS NOT DISTINCT FROM 'true'::jsonb AND
      status->'business'->'receipt'->>'kind' IS NOT DISTINCT FROM 'PM_REGISTRY_RECEIPT' AND
      jsonb_typeof(status->'business'->'receipt'->'key') IS NOT DISTINCT FROM 'string' AND
      status->'business'->'receipt'->>'version' IS NOT DISTINCT FROM '1' AND
      jsonb_typeof(status->'business'->'source_instance_ref') IS NOT DISTINCT FROM 'string'
    END)
);
CREATE INDEX execution_instance_registration_workspace ON execution_instance_registration_commands(workspace_id,created_at_ms);
CREATE TABLE execution_instance_registration_events (
  command_id text NOT NULL REFERENCES execution_instance_registration_commands(command_id),
  event_id text NOT NULL CHECK (event_id ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'),
  status jsonb NOT NULL CHECK (jsonb_typeof(status)='object' AND octet_length(status::text)<=32768),
  recorded_at_ms bigint NOT NULL CHECK (recorded_at_ms BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY(command_id,event_id),
  CHECK (status->>'command_id' IS NOT DISTINCT FROM command_id),
  CHECK (status->'updated_at_ms' IS NOT DISTINCT FROM to_jsonb(recorded_at_ms))
);
CREATE FUNCTION execution_instance_registration_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR TG_TABLE_NAME='execution_instance_registration_events' THEN
    RAISE EXCEPTION 'REGISTRATION_HISTORY_IMMUTABLE';
  END IF;
  IF (NEW.command_id,NEW.workspace_id,NEW.actor_user_id,NEW.key_hash,NEW.intent_hash,NEW.intent,NEW.authorization_fact,NEW.created_at_ms)
    IS DISTINCT FROM (OLD.command_id,OLD.workspace_id,OLD.actor_user_id,OLD.key_hash,OLD.intent_hash,OLD.intent,OLD.authorization_fact,OLD.created_at_ms) THEN
    RAISE EXCEPTION 'REGISTRATION_INTENT_IMMUTABLE';
  END IF;
  IF NEW.updated_at_ms<OLD.updated_at_ms THEN RAISE EXCEPTION 'REGISTRATION_CLOCK_REGRESSION'; END IF;
  IF NEW.status->>'delivery'='PREPARED' AND OLD.status->>'delivery'<>'PREPARED' OR
     NEW.status->>'delivery'='SENDING' AND OLD.status->>'delivery'<>'PREPARED' AND
       (OLD.status->>'delivery'<>'SENDING' OR NEW.attempt_id IS DISTINCT FROM OLD.attempt_id) THEN
    RAISE EXCEPTION 'REGISTRATION_ATTEMPT_NOT_REUSABLE';
  END IF;
  IF OLD.status->'business'->>'state'='APPLIED' AND
    (NEW.status->'business' IS DISTINCT FROM OLD.status->'business' OR NEW.status->>'delivery'<>'ACKNOWLEDGED') THEN
    RAISE EXCEPTION 'REGISTRATION_RECEIPT_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER execution_instance_registration_guard BEFORE UPDATE OR DELETE ON execution_instance_registration_commands
  FOR EACH ROW EXECUTE FUNCTION execution_instance_registration_immutable();
CREATE TRIGGER execution_instance_registration_event_guard BEFORE UPDATE OR DELETE ON execution_instance_registration_events
  FOR EACH ROW EXECUTE FUNCTION execution_instance_registration_immutable();
-- Accepted/UNKNOWN history is not a cache. Never TTL/cascade-delete it to
-- recycle keys or restore revoked rights. Explicit retention is a runtime gate.

-- Down Migration
-- Non-destructive: disable new sends and retain the original keys/receipts/audit.
