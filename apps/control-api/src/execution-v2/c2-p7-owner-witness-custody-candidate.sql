-- SOURCE/TEST ONLY: independent storage is not proof of independent control,
-- source acceptance, owner authentication, or a restore/cutover authority.
CREATE SCHEMA elp210_c2_p7_witness_candidate;
REVOKE ALL ON SCHEMA elp210_c2_p7_witness_candidate FROM PUBLIC;
CREATE TABLE elp210_c2_p7_witness_candidate.witnesses (
  custody_id uuid NOT NULL,
  cycle_sha256 text NOT NULL CHECK(cycle_sha256 ~ '^[0-9a-f]{64}$'),
  intent_id uuid NOT NULL,
  signer_spki_sha256 text NOT NULL CHECK(signer_spki_sha256 ~ '^[0-9a-f]{64}$'),
  proof_sha256 text NOT NULL CHECK(proof_sha256 ~ '^[0-9a-f]{64}$'),
  expires_at_ms bigint NOT NULL CHECK(expires_at_ms>0),
  envelope jsonb NOT NULL CHECK(jsonb_typeof(envelope)='object' AND octet_length(envelope::text)<=40000),
  PRIMARY KEY(custody_id,cycle_sha256), UNIQUE(custody_id,intent_id)
);
-- A committed reservation means the attempt MAY have reached Core. It is
-- never deleted or reused merely because Core cannot locate the original.
CREATE TABLE elp210_c2_p7_witness_candidate.reservations (
  custody_id uuid NOT NULL,
  cycle_sha256 text NOT NULL CHECK(cycle_sha256 ~ '^[0-9a-f]{64}$'),
  intent_id uuid NOT NULL,
  request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[0-9a-f]{64}$'),
  signer_spki_sha256 text NOT NULL CHECK(signer_spki_sha256 ~ '^[0-9a-f]{64}$'),
  reservation_mac text NOT NULL CHECK(reservation_mac ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY(custody_id,cycle_sha256), UNIQUE(custody_id,intent_id)
);
CREATE FUNCTION elp210_c2_p7_witness_candidate.deny_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'C2_P7_WITNESS_IMMUTABLE'; END $$;
CREATE TRIGGER witness_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
  ON elp210_c2_p7_witness_candidate.witnesses FOR EACH STATEMENT
  EXECUTE FUNCTION elp210_c2_p7_witness_candidate.deny_mutation();
CREATE TRIGGER reservation_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
  ON elp210_c2_p7_witness_candidate.reservations FOR EACH STATEMENT
  EXECUTE FUNCTION elp210_c2_p7_witness_candidate.deny_mutation();
REVOKE ALL ON ALL TABLES IN SCHEMA elp210_c2_p7_witness_candidate FROM PUBLIC;
