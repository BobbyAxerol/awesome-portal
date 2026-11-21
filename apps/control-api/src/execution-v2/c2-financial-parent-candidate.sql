-- SOURCE/TEST ONLY. No migration, permissions, independent checkpoint,
-- old-holder fencing, ACK or permission to recover a delivery is implied.
CREATE SCHEMA elp210_c2_financial_parent_candidate;
REVOKE ALL ON SCHEMA elp210_c2_financial_parent_candidate FROM PUBLIC;
CREATE TABLE elp210_c2_financial_parent_candidate.limits (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  maximum_retained integer NOT NULL CHECK(maximum_retained BETWEEN 1 AND 128)
);
CREATE TABLE elp210_c2_financial_parent_candidate.parents (
  parent_id uuid PRIMARY KEY,
  context_digest text NOT NULL UNIQUE CHECK(context_digest ~ '^sha256:[0-9a-f]{64}$'),
  identity_digest text NOT NULL CHECK(identity_digest ~ '^sha256:[0-9a-f]{64}$'),
  expires_at_ms bigint NOT NULL CHECK(expires_at_ms>0),
  key_id text NOT NULL,
  nonce text NOT NULL, ciphertext text NOT NULL, tag text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON ALL TABLES IN SCHEMA elp210_c2_financial_parent_candidate FROM PUBLIC;
CREATE FUNCTION elp210_c2_financial_parent_candidate.immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'C2_FINANCIAL_PARENT_IMMUTABLE'; END $$;
CREATE TRIGGER parents_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON elp210_c2_financial_parent_candidate.parents
  FOR EACH STATEMENT EXECUTE FUNCTION elp210_c2_financial_parent_candidate.immutable();
CREATE TRIGGER limits_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON elp210_c2_financial_parent_candidate.limits
  FOR EACH STATEMENT EXECUTE FUNCTION elp210_c2_financial_parent_candidate.immutable();
