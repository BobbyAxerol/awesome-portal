-- ISOLATED P7 CANDIDATE ONLY; not a migration, runtime grant or proof of source.
-- Production requires separately reviewed ownership/ACL and independent DR fence.
BEGIN;
CREATE SCHEMA elp210_c2_p7_candidate;
REVOKE ALL ON SCHEMA elp210_c2_p7_candidate FROM PUBLIC;
CREATE TABLE elp210_c2_p7_candidate.records (
  cycle_sha256 text PRIMARY KEY CHECK (cycle_sha256 ~ '^[0-9a-f]{64}$'),
  binding_sha256 text NOT NULL CHECK (binding_sha256 ~ '^[0-9a-f]{64}$'),
  b1_sha256 text NOT NULL CHECK (b1_sha256 ~ '^[0-9a-f]{64}$'),
  acceptance_id uuid NOT NULL UNIQUE, delegation_id uuid NOT NULL UNIQUE,
  acceptance_json text NOT NULL CHECK (octet_length(acceptance_json) BETWEEN 2 AND 65536),
  acceptance_sha256 text NOT NULL CHECK (acceptance_sha256 ~ '^[0-9a-f]{64}$'),
  delegation_json text NOT NULL CHECK (octet_length(delegation_json) BETWEEN 2 AND 65536),
  delegation_sha256 text NOT NULL CHECK (delegation_sha256 ~ '^[0-9a-f]{64}$'),
  -- NULL is an older/direct diagnostic, never evidence of owner approval.
  owner_intent_id uuid UNIQUE,
  confirmation_sha256 text CHECK (confirmation_sha256 ~ '^[0-9a-f]{64}$'),
  CHECK ((owner_intent_id IS NULL) = (confirmation_sha256 IS NULL)),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION elp210_c2_p7_candidate.immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'C2_P7_RECORD_IMMUTABLE'; END $$;
CREATE TRIGGER p7_immutable_rows BEFORE UPDATE OR DELETE ON elp210_c2_p7_candidate.records
  FOR EACH ROW EXECUTE FUNCTION elp210_c2_p7_candidate.immutable();
CREATE TRIGGER p7_immutable_truncate BEFORE TRUNCATE ON elp210_c2_p7_candidate.records
  FOR EACH STATEMENT EXECUTE FUNCTION elp210_c2_p7_candidate.immutable();
COMMIT;
