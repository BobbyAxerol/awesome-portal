-- C2 PREPARATION ONLY. This isolated schema is deliberately not a migration or
-- installed runtime. No signer, acceptance, grant, issuer or command is mounted.
-- A proper deployment must separately review owner/ACL, restore/fencing and
-- authenticate the authority and signer-receipt providers before integration.
BEGIN;
CREATE SCHEMA elp210_c2_preparation;
CREATE TABLE elp210_c2_preparation.b2_attempts (
  cycle_sha256 text PRIMARY KEY CHECK (cycle_sha256 ~ '^[0-9a-f]{64}$'),
  binding_sha256 text NOT NULL CHECK (binding_sha256 ~ '^[0-9a-f]{64}$'),
  b1_sha256 text NOT NULL CHECK (b1_sha256 ~ '^[0-9a-f]{64}$'),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  signer_spki_sha256 text NOT NULL CHECK (signer_spki_sha256 ~ '^[0-9a-f]{64}$'),
  signer_owner_ref_sha256 text NOT NULL CHECK (signer_owner_ref_sha256 ~ '^[0-9a-f]{64}$'),
  state text NOT NULL CHECK (state IN ('PREPARED','RESERVED','UNKNOWN','COMPLETED')),
  attempt_id uuid,
  acceptance_sha256 text CHECK (acceptance_sha256 IS NULL OR acceptance_sha256 ~ '^[0-9a-f]{64}$'),
  seal_sha256 text CHECK (seal_sha256 IS NULL OR seal_sha256 ~ '^[0-9a-f]{64}$'),
  receipt_sha256 text CHECK (receipt_sha256 IS NULL OR receipt_sha256 ~ '^[0-9a-f]{64}$'),
  UNIQUE (b1_sha256, signer_spki_sha256, signer_owner_ref_sha256),
  CHECK ((state = 'PREPARED' AND attempt_id IS NULL AND acceptance_sha256 IS NULL AND seal_sha256 IS NULL AND receipt_sha256 IS NULL)
    OR (state IN ('RESERVED','UNKNOWN') AND attempt_id IS NOT NULL AND acceptance_sha256 IS NOT NULL AND seal_sha256 IS NOT NULL AND receipt_sha256 IS NULL)
    OR (state = 'COMPLETED' AND attempt_id IS NOT NULL AND acceptance_sha256 IS NOT NULL AND seal_sha256 IS NOT NULL AND receipt_sha256 IS NOT NULL))
);
-- Several unsigned plans may be explored, but changing signer, owner or cycle
-- must never authorize a second attempt for the same immutable B1. A RESERVED
-- attempt is already treated as MAY_HAVE_SIGNED after an ambiguous crash.
CREATE UNIQUE INDEX b2_one_attempt_per_b1 ON elp210_c2_preparation.b2_attempts (b1_sha256)
  WHERE state IN ('RESERVED','UNKNOWN','COMPLETED');
CREATE FUNCTION elp210_c2_preparation.b2_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN RAISE EXCEPTION 'C2_B2_CUSTODY_IMMUTABLE'; END IF;
  IF ROW(OLD.cycle_sha256,OLD.binding_sha256,OLD.b1_sha256,OLD.payload_sha256,OLD.signer_spki_sha256,OLD.signer_owner_ref_sha256)
    IS DISTINCT FROM ROW(NEW.cycle_sha256,NEW.binding_sha256,NEW.b1_sha256,NEW.payload_sha256,NEW.signer_spki_sha256,NEW.signer_owner_ref_sha256)
    THEN RAISE EXCEPTION 'C2_B2_BINDING_IMMUTABLE'; END IF;
  IF NOT ((OLD.state='PREPARED' AND NEW.state='RESERVED') OR
    (OLD.state='RESERVED' AND NEW.state IN ('UNKNOWN','COMPLETED')) OR
    (OLD.state='UNKNOWN' AND NEW.state='COMPLETED')) THEN RAISE EXCEPTION 'C2_B2_TRANSITION_DENIED'; END IF;
  IF OLD.state <> 'PREPARED' AND ROW(OLD.attempt_id,OLD.acceptance_sha256,OLD.seal_sha256)
    IS DISTINCT FROM ROW(NEW.attempt_id,NEW.acceptance_sha256,NEW.seal_sha256)
    THEN RAISE EXCEPTION 'C2_B2_ATTEMPT_IMMUTABLE'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER b2_guard_rows BEFORE UPDATE OR DELETE ON elp210_c2_preparation.b2_attempts
  FOR EACH ROW EXECUTE FUNCTION elp210_c2_preparation.b2_guard();
CREATE TRIGGER b2_guard_truncate BEFORE TRUNCATE ON elp210_c2_preparation.b2_attempts
  FOR EACH STATEMENT EXECUTE FUNCTION elp210_c2_preparation.b2_guard();
COMMIT;
