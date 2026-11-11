-- SOURCE ONLY. Never run as a product migration without separate review.
-- An intent is not a grant, P7 acceptance, signing authority, or publication.
CREATE TABLE elp210_c2_p7_candidate.owner_intents (
  intent_id uuid PRIMARY KEY,
  proof_sha256 text NOT NULL UNIQUE CHECK (proof_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_sha256 text NOT NULL UNIQUE CHECK (idempotency_sha256 ~ '^[0-9a-f]{64}$'),
  action text NOT NULL CHECK (action IN ('REGISTER','REVOKE')),
  workspace_id text NOT NULL,
  owner_user_id text NOT NULL,
  session_id text NOT NULL,
  session_generation bigint NOT NULL CHECK (session_generation >= 0),
  registration_key text NOT NULL,
  registration_sha256 text NOT NULL CHECK (registration_sha256 ~ '^[0-9a-f]{64}$'),
  source_evidence_sha256 text NOT NULL CHECK (source_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  b1_sha256 text NOT NULL CHECK (b1_sha256 ~ '^[0-9a-f]{64}$'),
  decision_json jsonb NOT NULL CHECK (jsonb_typeof(decision_json) = 'object' AND octet_length(decision_json::text) <= 16384),
  authority_revision bigint NOT NULL CHECK (authority_revision >= 0),
  expires_at_ms bigint NOT NULL CHECK (expires_at_ms > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE elp210_c2_p7_candidate.owner_intent_revocations (
  intent_id uuid PRIMARY KEY REFERENCES elp210_c2_p7_candidate.owner_intents(intent_id),
  actor_user_id text NOT NULL,
  revoked_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- The link identifies the original review; it is not a grant or an authority
-- proof. The writer also checks its exact contents and current revocation
-- while holding the same authority and intent locks before writing a record.
ALTER TABLE elp210_c2_p7_candidate.records ADD CONSTRAINT p7_record_owner_intent_fk
  FOREIGN KEY (owner_intent_id) REFERENCES elp210_c2_p7_candidate.owner_intents(intent_id);
CREATE FUNCTION elp210_c2_p7_candidate.owner_intent_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'owner intent history is append-only' USING ERRCODE = '55000'; END $$;
CREATE TRIGGER owner_intents_immutable BEFORE UPDATE OR DELETE ON elp210_c2_p7_candidate.owner_intents
  FOR EACH ROW EXECUTE FUNCTION elp210_c2_p7_candidate.owner_intent_immutable();
CREATE TRIGGER owner_intent_revocations_immutable BEFORE UPDATE OR DELETE ON elp210_c2_p7_candidate.owner_intent_revocations
  FOR EACH ROW EXECUTE FUNCTION elp210_c2_p7_candidate.owner_intent_immutable();
CREATE TRIGGER owner_intents_no_truncate BEFORE TRUNCATE ON elp210_c2_p7_candidate.owner_intents
  FOR EACH STATEMENT EXECUTE FUNCTION elp210_c2_p7_candidate.owner_intent_immutable();
CREATE TRIGGER owner_intent_revocations_no_truncate BEFORE TRUNCATE ON elp210_c2_p7_candidate.owner_intent_revocations
  FOR EACH STATEMENT EXECUTE FUNCTION elp210_c2_p7_candidate.owner_intent_immutable();
REVOKE ALL ON elp210_c2_p7_candidate.owner_intents, elp210_c2_p7_candidate.owner_intent_revocations FROM PUBLIC;
