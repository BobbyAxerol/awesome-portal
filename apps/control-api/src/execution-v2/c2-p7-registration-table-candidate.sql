-- ISOLATED TEST CANDIDATE ONLY. NOT A MIGRATION, AUTHORITY OR RUNTIME GRANT.
-- Prerequisite: c2-p7-acceptance.sql was applied in a disposable database.
-- A future trusted registration/revocation writer, with qualified ACL and
-- authority-first lock ordering, is required before this can be commissioned.
CREATE TABLE elp210_c2_p7_candidate.registrations (
  registration_key text PRIMARY KEY CHECK (length(registration_key) BETWEEN 1 AND 128),
  registration_sha256 text NOT NULL CHECK (registration_sha256 ~ '^[0-9a-f]{64}$'),
  workspace_id text NOT NULL,
  owner_user_id text NOT NULL,
  application_revision text NOT NULL,
  authority_revision bigint NOT NULL CHECK (authority_revision >= 0),
  state text NOT NULL CHECK (state IN ('ACTIVE','REVOKED')),
  expires_at_ms bigint NOT NULL CHECK (expires_at_ms >= 0)
);
REVOKE ALL ON elp210_c2_p7_candidate.registrations FROM PUBLIC;
-- Monotonicity protects this candidate from ordinary row changes, not a
-- privileged owner disabling triggers or an unqualified writer fabricating a
-- new registration. Runtime ownership/ACL and writer qualification are open.
CREATE FUNCTION elp210_c2_p7_candidate.registration_monotonic() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN RAISE EXCEPTION 'C2_P7_REGISTRATION_IMMUTABLE'; END IF;
  IF OLD.state <> 'ACTIVE' OR NEW.state <> 'REVOKED' OR
    (OLD.registration_key,OLD.registration_sha256,OLD.workspace_id,OLD.owner_user_id,
     OLD.application_revision,OLD.authority_revision,OLD.expires_at_ms) IS DISTINCT FROM
    (NEW.registration_key,NEW.registration_sha256,NEW.workspace_id,NEW.owner_user_id,
     NEW.application_revision,NEW.authority_revision,NEW.expires_at_ms)
  THEN RAISE EXCEPTION 'C2_P7_REGISTRATION_IMMUTABLE'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER p7_registration_update_delete BEFORE UPDATE OR DELETE
  ON elp210_c2_p7_candidate.registrations FOR EACH ROW
  EXECUTE FUNCTION elp210_c2_p7_candidate.registration_monotonic();
CREATE TRIGGER p7_registration_truncate BEFORE TRUNCATE
  ON elp210_c2_p7_candidate.registrations FOR EACH STATEMENT
  EXECUTE FUNCTION elp210_c2_p7_candidate.registration_monotonic();
