-- Source-attempt custody only. Existing mutations/events remain the sole Core
-- application/authority outcome. No users, sessions, grants or source facts seeded.
-- Up Migration
CREATE TABLE portal_native_root_obligations (
  lease_id uuid PRIMARY KEY,
  attempt_id uuid NOT NULL UNIQUE,
  mutation_id uuid,
  purpose text NOT NULL CHECK (purpose IN ('QUALIFY','COMMIT')),
  source_config_digest text NOT NULL CHECK (source_config_digest ~ '^sha256:[0-9a-f]{64}$'),
  base_digest text NOT NULL CHECK (base_digest ~ '^sha256:[0-9a-f]{64}$'),
  base_body text NOT NULL CHECK (octet_length(base_body) BETWEEN 1 AND 32768),
  phase text NOT NULL CHECK (phase IN ('PREPARED','ISSUE_REQUESTED','ISSUED','ENTERING','ENTERED','UNKNOWN','COMMITTED','ROLLED_BACK','CANCELLED')),
  source_digest text CHECK (source_digest ~ '^[0-9a-f]{64}$'),
  source_fingerprint text CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'),
  source_expires_at text,
  root_operation_id text REFERENCES portal_access_policy_events(event_id),
  terminal_receipt_id uuid,
  terminal_receipt_digest text CHECK (terminal_receipt_digest ~ '^sha256:[0-9a-f]{64}$'),
  terminal_fact jsonb,
  source_settled boolean NOT NULL DEFAULT false,
  source_ack_digest text CHECK (source_ack_digest ~ '^sha256:[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((purpose='QUALIFY') = (mutation_id IS NULL)),
  CHECK ((terminal_receipt_id IS NULL) = (terminal_receipt_digest IS NULL)),
  CHECK ((terminal_fact IS NULL) = (terminal_receipt_id IS NULL)),
  CHECK ((phase IN ('COMMITTED','ROLLED_BACK')) = (terminal_receipt_id IS NOT NULL)),
  CHECK ((phase='COMMITTED') = (root_operation_id IS NOT NULL)),
  CHECK (terminal_fact IS NULL OR (jsonb_typeof(terminal_fact)='object' AND octet_length(terminal_fact::text)<=4096)),
  CHECK (phase NOT IN ('ISSUED','ENTERING','ENTERED','UNKNOWN','COMMITTED','ROLLED_BACK') OR
    (source_digest IS NOT NULL AND source_fingerprint IS NOT NULL AND source_expires_at IS NOT NULL)),
  CHECK (source_settled = (source_ack_digest IS NOT NULL))
);
CREATE INDEX native_root_unresolved ON portal_native_root_obligations(created_at,lease_id) WHERE NOT source_settled;
CREATE UNIQUE INDEX native_root_one_unresolved_mutation ON portal_native_root_obligations(mutation_id) WHERE NOT source_settled AND mutation_id IS NOT NULL;
CREATE FUNCTION portal_guard_native_root_original() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'NATIVE_ROOT_CUSTODY_DELETE_FORBIDDEN'; END IF;
  IF ROW(NEW.lease_id,NEW.attempt_id,NEW.mutation_id,NEW.purpose,NEW.source_config_digest,NEW.base_digest,NEW.base_body,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.lease_id,OLD.attempt_id,OLD.mutation_id,OLD.purpose,OLD.source_config_digest,OLD.base_digest,OLD.base_body,OLD.created_at)
    OR OLD.source_digest IS NOT NULL AND ROW(NEW.source_digest,NEW.source_fingerprint,NEW.source_expires_at)
      IS DISTINCT FROM ROW(OLD.source_digest,OLD.source_fingerprint,OLD.source_expires_at)
    OR OLD.terminal_receipt_id IS NOT NULL AND ROW(NEW.terminal_receipt_id,NEW.terminal_receipt_digest,NEW.terminal_fact,NEW.root_operation_id,NEW.phase)
      IS DISTINCT FROM ROW(OLD.terminal_receipt_id,OLD.terminal_receipt_digest,OLD.terminal_fact,OLD.root_operation_id,OLD.phase)
    OR OLD.source_settled AND (NOT NEW.source_settled OR NEW.source_ack_digest IS DISTINCT FROM OLD.source_ack_digest)
    OR OLD.phase='CANCELLED' AND NEW.phase<>'CANCELLED'
    OR NEW.phase<>OLD.phase AND NOT (
      OLD.phase='PREPARED' AND NEW.phase IN ('ISSUE_REQUESTED','CANCELLED') OR
      OLD.phase='ISSUE_REQUESTED' AND NEW.phase IN ('ISSUED','CANCELLED') OR
      OLD.phase='ISSUED' AND NEW.phase IN ('ENTERING','CANCELLED') OR
      OLD.phase='ENTERING' AND NEW.phase IN ('ENTERED','UNKNOWN','ROLLED_BACK') OR
      OLD.phase='ENTERED' AND NEW.phase IN ('UNKNOWN','COMMITTED','ROLLED_BACK') OR
      OLD.phase='UNKNOWN' AND NEW.phase IN ('COMMITTED','ROLLED_BACK'))
  THEN RAISE EXCEPTION 'NATIVE_ROOT_ORIGINAL_OR_TERMINAL_CHANGED'; END IF;
  NEW.updated_at=clock_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER guard_native_root_original BEFORE UPDATE OR DELETE ON portal_native_root_obligations
  FOR EACH ROW EXECUTE FUNCTION portal_guard_native_root_original();

-- Down Migration
DROP TABLE portal_native_root_obligations;
DROP FUNCTION portal_guard_native_root_original();
