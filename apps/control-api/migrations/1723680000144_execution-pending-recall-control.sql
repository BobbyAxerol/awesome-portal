-- Additive Core transport metadata, reserved144 after registration143 landed
-- ff83f176. Runtime provider remains unqualified; no shared DB is migrated here.
-- Up Migration
-- Core transport metadata only: no economic source, balance, grant, provider,
-- runtime flag or recall seed. PM alone advances original recall economics.
CREATE TABLE execution_pending_recall_commands (
  command_id text PRIMARY KEY CHECK (command_id ~ '^ecm_[a-f0-9]{32}$'),
  workspace_id text NOT NULL REFERENCES workspaces(workspace_id),
  actor_user_id text NOT NULL REFERENCES portal_users(user_id),
  key_hash text NOT NULL CHECK (key_hash ~ '^sha256:[a-f0-9]{64}$'),
  intent_hash text NOT NULL CHECK (intent_hash ~ '^sha256:[a-f0-9]{64}$'),
  intent jsonb NOT NULL CHECK (jsonb_typeof(intent)='object' AND octet_length(intent::text)<=32768),
  authorization_fact jsonb NOT NULL CHECK (jsonb_typeof(authorization_fact)='object' AND octet_length(authorization_fact::text)<=32768),
  status jsonb NOT NULL CHECK (jsonb_typeof(status)='object' AND octet_length(status::text)<=32768),
  attempt_id uuid,
  created_at_ms bigint NOT NULL CHECK (created_at_ms BETWEEN 0 AND 9007199254740991),
  updated_at_ms bigint NOT NULL CHECK (updated_at_ms BETWEEN created_at_ms AND 9007199254740991),
  UNIQUE(workspace_id,key_hash),
  CHECK (char_length(workspace_id) BETWEEN 1 AND 256 AND char_length(actor_user_id) BETWEEN 1 AND 256),
  CHECK (intent->>'schema_version' IS NOT DISTINCT FROM 'portal.execution.pending-recall-intent.v1'),
  CHECK (intent->>'workspace_id' IS NOT DISTINCT FROM workspace_id),
  CHECK (intent->'resource'->>'kind' IS NOT NULL AND intent->'resource'->>'kind' IN ('PORTFOLIO','DEPLOYMENT')),
  CHECK (intent->'business_payload'->>'schema_version' IS NOT DISTINCT FROM 'pma.operator-control.v1'),
  CHECK (intent->'business_payload'->>'operation' IS NOT NULL AND intent->'business_payload'->>'operation' IN ('APPLY_PENDING','CANCEL_REMAINING')),
  CHECK (status->>'schema_version' IS NOT DISTINCT FROM 'portal.execution.pending-recall-status.v1'),
  CHECK (status->>'family' IS NOT DISTINCT FROM 'PENDING_RECALL_CONTROL'),
  CHECK (status->>'command_id' IS NOT DISTINCT FROM command_id),
  CHECK (status->>'operation' IS NOT DISTINCT FROM intent->'business_payload'->>'operation'),
  CHECK (status->>'original_recall_id' IS NOT NULL AND status->>'original_recall_id' IS NOT DISTINCT FROM intent->'business_payload'->>'command_id'),
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
  CHECK (status->>'venue' IS NOT DISTINCT FROM 'NOT_APPLICABLE'),
  CHECK (status->>'projection' IS NOT DISTINCT FROM 'UNKNOWN'),
  CHECK (status->'economic_cash_changed' IS NOT DISTINCT FROM 'false'::jsonb),
  CHECK (status->'physical_transfer_performed' IS NOT DISTINCT FROM 'false'::jsonb),
  CHECK (status->'business'->>'state' IS NOT NULL AND status->'business'->>'state' IN
    ('UNKNOWN','WAITING_ENCUMBRANCE','PARTIALLY_APPLIED_CANCELLED','CANCELLED','REJECTED','APPLIED')),
  CHECK (status->>'next_action' IS NOT DISTINCT FROM CASE
    WHEN status->'business'->>'state'='WAITING_ENCUMBRANCE' THEN 'QUERY_SAME_INTENT'
    WHEN status->'business'->>'state'<>'UNKNOWN' THEN 'REVIEW_RECEIPT'
    WHEN status->>'delivery'='FAILED_BEFORE_SEND' THEN 'REVIEW_BLOCKER'
    ELSE 'QUERY_SAME_INTENT' END),
  CHECK (CASE WHEN status->'business'->>'state'='UNKNOWN' THEN
    status->>'delivery'<>'ACKNOWLEDGED' AND
    status->'business'->'business_applied' IS NOT DISTINCT FROM 'null'::jsonb AND
    status->'business'->'amounts' IS NOT DISTINCT FROM 'null'::jsonb AND
    status->'business'->'receipt' IS NOT DISTINCT FROM 'null'::jsonb AND
    status->'business'->'blockers' IS NOT DISTINCT FROM '[]'::jsonb
    ELSE status->>'delivery'='ACKNOWLEDGED' AND
    status->'business'->'business_applied' IS NOT DISTINCT FROM to_jsonb(status->'business'->>'state'='APPLIED') AND
    jsonb_typeof(status->'business'->'amounts') IS NOT DISTINCT FROM 'object' AND
    jsonb_typeof(status->'business'->'receipt') IS NOT DISTINCT FROM 'object' AND
    status->'business'->'receipt'->>'original_payload_sha256' IS NOT DISTINCT FROM authorization_fact->>'original_payload_sha256'
    END)
);
CREATE INDEX execution_pending_recall_workspace ON execution_pending_recall_commands(workspace_id,created_at_ms);
CREATE TABLE execution_pending_recall_events (
  command_id text NOT NULL REFERENCES execution_pending_recall_commands(command_id),
  event_id uuid NOT NULL,
  attempt_id uuid,
  status jsonb NOT NULL CHECK (jsonb_typeof(status)='object' AND octet_length(status::text)<=32768),
  recorded_at_ms bigint NOT NULL CHECK (recorded_at_ms BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY(command_id,event_id),
  CHECK (status->>'command_id' IS NOT DISTINCT FROM command_id),
  CHECK (status->'updated_at_ms' IS NOT DISTINCT FROM to_jsonb(recorded_at_ms)),
  CHECK (status->>'delivery' IS NOT NULL AND (status->>'delivery'='SENDING') = (attempt_id IS NOT NULL))
);
CREATE FUNCTION execution_pending_recall_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE component text; before_business jsonb; after_business jsonb; value text;
BEGIN
  IF TG_OP='DELETE' OR TG_TABLE_NAME='execution_pending_recall_events' THEN
    RAISE EXCEPTION 'PENDING_CONTROL_HISTORY_IMMUTABLE';
  END IF;
  after_business=NEW.status->'business';
  -- Required JSON string types are checked BEFORE numeric monotonicity casts.
  -- Missing keys may not turn a FALSE comparison into SQL UNKNOWN and pass.
  IF after_business->>'state'<>'UNKNOWN' THEN
    FOREACH component IN ARRAY ARRAY['requested','applied','pending','cancelled','rejected'] LOOP
      value=after_business->'amounts'->>component;
      IF jsonb_typeof(after_business->'amounts'->component) IS DISTINCT FROM 'string' OR
         value IS NULL OR octet_length(value)>128 OR value !~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$' THEN
        RAISE EXCEPTION 'PENDING_CONTROL_AMOUNT_REQUIRED';
      END IF;
    END LOOP;
    IF (after_business->'amounts'->>'requested')::numeric IS DISTINCT FROM
      (after_business->'amounts'->>'applied')::numeric + (after_business->'amounts'->>'pending')::numeric +
      (after_business->'amounts'->>'cancelled')::numeric + (after_business->'amounts'->>'rejected')::numeric THEN
      RAISE EXCEPTION 'PENDING_CONTROL_PARTITION_INVALID';
    END IF;
    -- Repeat the owning state/partition invariant at the DB boundary. Exact
    -- numeric arithmetic only; do not make a known receipt out of a label.
    -- Parenthesize SQL CASE as one PL/pgSQL IF expression; the CASE branch
    -- THEN tokens must not terminate IF's expression parser prematurely.
    IF (CASE after_business->>'state'
      WHEN 'APPLIED' THEN
        (after_business->'amounts'->>'pending')::numeric<>0 OR
        (after_business->'amounts'->>'cancelled')::numeric<>0 OR
        (after_business->'amounts'->>'rejected')::numeric<>0
      WHEN 'REJECTED' THEN
        (after_business->'amounts'->>'applied')::numeric<>0 OR
        (after_business->'amounts'->>'pending')::numeric<>0 OR
        (after_business->'amounts'->>'cancelled')::numeric<>0
      WHEN 'CANCELLED' THEN
        (after_business->'amounts'->>'applied')::numeric<>0 OR
        (after_business->'amounts'->>'pending')::numeric<>0 OR
        (after_business->'amounts'->>'rejected')::numeric<>0
      WHEN 'PARTIALLY_APPLIED_CANCELLED' THEN
        (after_business->'amounts'->>'applied')::numeric<=0 OR
        (after_business->'amounts'->>'cancelled')::numeric<=0 OR
        (after_business->'amounts'->>'pending')::numeric<>0 OR
        (after_business->'amounts'->>'rejected')::numeric<>0
      WHEN 'WAITING_ENCUMBRANCE' THEN
        (after_business->'amounts'->>'pending')::numeric<=0 OR
        (after_business->'amounts'->>'cancelled')::numeric<>0 OR
        (after_business->'amounts'->>'rejected')::numeric<>0
      ELSE false END) THEN
      RAISE EXCEPTION 'PENDING_CONTROL_STATE_PARTITION_INVALID';
    END IF;
    FOREACH component IN ARRAY ARRAY['budget','source','parent','book','command'] LOOP
      value=after_business->'receipt'->'versions'->>component;
      IF jsonb_typeof(after_business->'receipt'->'versions'->component) IS DISTINCT FROM 'string' OR
         value IS NULL OR value !~ '^(0|[1-9][0-9]{0,18})$' THEN
        RAISE EXCEPTION 'PENDING_CONTROL_VERSION_REQUIRED';
      END IF;
      IF value::numeric>9223372036854775807 THEN RAISE EXCEPTION 'PENDING_CONTROL_VERSION_OVERFLOW'; END IF;
    END LOOP;
    FOREACH component IN ARRAY ARRAY['control_receipt_id','latest_receipt_id','source_event_id'] LOOP
      value=after_business->'receipt'->>component;
      IF jsonb_typeof(after_business->'receipt'->component) IS DISTINCT FROM 'string' OR
         value IS NULL OR octet_length(value) NOT BETWEEN 1 AND 512 THEN
        RAISE EXCEPTION 'PENDING_CONTROL_RECEIPT_REQUIRED';
      END IF;
    END LOOP;
  END IF;
  IF TG_OP='INSERT' THEN RETURN NEW; END IF;
  IF (NEW.command_id,NEW.workspace_id,NEW.actor_user_id,NEW.key_hash,NEW.intent_hash,NEW.intent,NEW.authorization_fact,NEW.created_at_ms)
    IS DISTINCT FROM (OLD.command_id,OLD.workspace_id,OLD.actor_user_id,OLD.key_hash,OLD.intent_hash,OLD.intent,OLD.authorization_fact,OLD.created_at_ms) THEN
    RAISE EXCEPTION 'PENDING_CONTROL_INTENT_IMMUTABLE';
  END IF;
  IF NEW.updated_at_ms<OLD.updated_at_ms THEN RAISE EXCEPTION 'PENDING_CONTROL_CLOCK_REGRESSION'; END IF;
  IF NEW.status->>'delivery'='PREPARED' AND OLD.status->>'delivery'<>'PREPARED' OR
     NEW.status->>'delivery'='SENDING' AND OLD.status->>'delivery'<>'PREPARED' AND
       (OLD.status->>'delivery'<>'SENDING' OR NEW.attempt_id IS DISTINCT FROM OLD.attempt_id) THEN
    RAISE EXCEPTION 'PENDING_CONTROL_ATTEMPT_NOT_REUSABLE';
  END IF;
  before_business=OLD.status->'business';
  IF before_business->>'state'<>'UNKNOWN' THEN
    IF after_business->>'state'='UNKNOWN' OR NEW.status->>'delivery'<>'ACKNOWLEDGED' OR
       after_business->'receipt'->>'control_receipt_id' IS DISTINCT FROM before_business->'receipt'->>'control_receipt_id' OR
       after_business->'receipt'->>'original_payload_sha256' IS DISTINCT FROM before_business->'receipt'->>'original_payload_sha256' OR
       (after_business->'amounts'->>'requested')::numeric IS DISTINCT FROM (before_business->'amounts'->>'requested')::numeric THEN
      RAISE EXCEPTION 'PENDING_CONTROL_RECEIPT_REGRESSION';
    END IF;
    IF before_business->>'state'<>'WAITING_ENCUMBRANCE' AND after_business IS DISTINCT FROM before_business THEN
      RAISE EXCEPTION 'PENDING_CONTROL_TERMINAL_IMMUTABLE';
    END IF;
    FOREACH component IN ARRAY ARRAY['budget','source','parent','book','command'] LOOP
      IF (after_business->'receipt'->'versions'->>component)::numeric < (before_business->'receipt'->'versions'->>component)::numeric THEN
        RAISE EXCEPTION 'PENDING_CONTROL_VERSION_REGRESSION';
      END IF;
    END LOOP;
    IF after_business->'receipt'->'versions'->>'command'=before_business->'receipt'->'versions'->>'command' AND
       after_business IS DISTINCT FROM before_business THEN RAISE EXCEPTION 'PENDING_CONTROL_SAME_REVISION_CHANGED'; END IF;
    IF after_business->'receipt'->'versions'->>'command'<>before_business->'receipt'->'versions'->>'command' AND
       (after_business->'receipt'->>'latest_receipt_id' IS NOT DISTINCT FROM before_business->'receipt'->>'latest_receipt_id' OR
        after_business->'receipt'->>'source_event_id' IS NOT DISTINCT FROM before_business->'receipt'->>'source_event_id') THEN
      RAISE EXCEPTION 'PENDING_CONTROL_NEW_REVISION_RECEIPT_REQUIRED';
    END IF;
    FOREACH component IN ARRAY ARRAY['applied','cancelled','rejected'] LOOP
      IF (after_business->'amounts'->>component)::numeric < (before_business->'amounts'->>component)::numeric THEN
        RAISE EXCEPTION 'PENDING_CONTROL_AMOUNT_REGRESSION';
      END IF;
    END LOOP;
    IF (after_business->'amounts'->>'pending')::numeric > (before_business->'amounts'->>'pending')::numeric THEN
      RAISE EXCEPTION 'PENDING_CONTROL_REMAINDER_REGRESSION';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER execution_pending_recall_guard BEFORE INSERT OR UPDATE OR DELETE ON execution_pending_recall_commands
  FOR EACH ROW EXECUTE FUNCTION execution_pending_recall_immutable();
CREATE TRIGGER execution_pending_recall_event_guard BEFORE UPDATE OR DELETE ON execution_pending_recall_events
  FOR EACH ROW EXECUTE FUNCTION execution_pending_recall_immutable();

-- Down Migration
-- Non-destructive rollback: disable new controls, retain original intent keys,
-- custody attempt events and receipts. No accepted/UNKNOWN metadata TTL/eviction.
