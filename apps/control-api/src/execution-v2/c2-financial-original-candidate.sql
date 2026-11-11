-- SOURCE/TEST ONLY. Not a migration, grant, runtime authority or Edge receipt.
-- One immutable exact request owns an unguessable context digest. The only
-- permitted mutation binds its lease exactly once in the ISSUE transaction.
CREATE SCHEMA elp210_c2_financial_candidate;
-- Candidate-only opt-in marker: a generic resume cannot drop the financial
-- context. This is not a production upgrade or permission to alter live DB.
ALTER TABLE elp210_candidate.leases ADD COLUMN c2_financial_context_digest text
  CHECK (c2_financial_context_digest IS NULL OR c2_financial_context_digest ~ '^sha256:[0-9a-f]{64}$');
CREATE FUNCTION elp210_c2_financial_candidate.guard_lease_context() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.c2_financial_context_digest IS DISTINCT FROM OLD.c2_financial_context_digest THEN
    RAISE EXCEPTION 'C2_FINANCIAL_LEASE_CONTEXT_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER financial_lease_context_guard BEFORE UPDATE OF c2_financial_context_digest ON elp210_candidate.leases
  FOR EACH ROW EXECUTE FUNCTION elp210_c2_financial_candidate.guard_lease_context();
CREATE TABLE elp210_c2_financial_candidate.originals (
  context_digest text PRIMARY KEY CHECK (context_digest ~ '^sha256:[0-9a-f]{64}$'),
  subject_id text NOT NULL, session_id text NOT NULL, session_revision bigint NOT NULL CHECK (session_revision >= 0),
  workspace_id text NOT NULL, workload_id text NOT NULL, receiver_id text NOT NULL,
  binding_digest text NOT NULL CHECK (binding_digest ~ '^sha256:[0-9a-f]{64}$'),
  request_digest text NOT NULL CHECK (request_digest ~ '^sha256:[0-9a-f]{64}$'),
  expires_at_ms bigint NOT NULL CHECK (expires_at_ms > 0),
  lease_id text UNIQUE REFERENCES elp210_candidate.leases(lease_id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION elp210_c2_financial_candidate.guard_original() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- An expired reservation with no lease never became an ISSUE. Cleanup
  -- shares the authority lock with issuance, so it cannot erase a committed
  -- or concurrently binding original. Linked records remain immutable.
  IF TG_OP = 'DELETE' AND OLD.lease_id IS NULL AND
      OLD.expires_at_ms<=floor(extract(epoch FROM clock_timestamp())*1000) THEN
    RETURN OLD;
  END IF;
  IF TG_OP <> 'UPDATE' OR OLD.lease_id IS NOT NULL OR NEW.lease_id IS NULL OR
    (to_jsonb(NEW) - 'lease_id') IS DISTINCT FROM (to_jsonb(OLD) - 'lease_id') THEN
    RAISE EXCEPTION 'C2_FINANCIAL_ORIGINAL_IMMUTABLE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM elp210_candidate.leases l WHERE l.lease_id=NEW.lease_id
      AND l.subject_id=NEW.subject_id AND l.session_id=NEW.session_id AND l.session_revision=NEW.session_revision
      AND l.workspace_id=NEW.workspace_id AND l.workload_id=NEW.workload_id AND l.environment='paper'
      AND l.request_digest=NEW.request_digest AND l.expires_at_ms<=NEW.expires_at_ms
      AND l.c2_financial_context_digest=NEW.context_digest
      AND l.human_assertion_digest IS NOT NULL AND l.c2_custody_binding_digest IS NOT NULL
      AND l.c2_p7_binding_digest IS NOT NULL AND l.c2_p7_owner_intent_id IS NOT NULL) THEN
    RAISE EXCEPTION 'C2_FINANCIAL_ORIGINAL_LEASE_MISMATCH';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER original_guard BEFORE UPDATE OR DELETE ON elp210_c2_financial_candidate.originals
  FOR EACH ROW EXECUTE FUNCTION elp210_c2_financial_candidate.guard_original();
CREATE TRIGGER original_no_truncate BEFORE TRUNCATE ON elp210_c2_financial_candidate.originals
  FOR EACH STATEMENT EXECUTE FUNCTION elp210_c2_financial_candidate.guard_original();
