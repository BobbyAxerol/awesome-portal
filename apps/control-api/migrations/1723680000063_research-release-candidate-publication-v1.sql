-- P22. Durable publication intent and receipt for the unchanged strict R1 create path.
-- No credential, token, CLI authority, approval decision or Execution mutation.
ALTER TABLE research.release_candidate_delivery_states_v1
  ADD COLUMN approval_id text NULL REFERENCES governance_approval_requests(approval_id) ON DELETE RESTRICT;

CREATE TABLE research.release_candidate_publications_v1 (
  workspace_id text NOT NULL,
  release_candidate_id text NOT NULL,
  run_id text NOT NULL,
  alpha_id text NOT NULL,
  alpha_version_id text NOT NULL,
  actor_user_id text NOT NULL REFERENCES portal_users(user_id) ON DELETE RESTRICT,
  actor_username text NOT NULL,
  request_key text NOT NULL CHECK (request_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$'),
  payload_digest text NOT NULL CHECK (payload_digest ~ '^[0-9a-f]{64}$'),
  request_payload jsonb NOT NULL CHECK (jsonb_typeof(request_payload) = 'object' AND octet_length(request_payload::text) <= 8192),
  pack_digest text NOT NULL CHECK (pack_digest ~ '^[0-9a-f]{64}$'),
  source_fingerprint text NOT NULL CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'),
  legacy_artifact_sha256 text NOT NULL CHECK (legacy_artifact_sha256 ~ '^sha256:[0-9a-f]{64}$'),
  artifact_schema_version text NOT NULL,
  methodology_claim_id text NOT NULL,
  state text NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','UNKNOWN','DELIVERED','REFUSED')),
  approval_id text NULL REFERENCES governance_approval_requests(approval_id) ON DELETE RESTRICT,
  evidence_set_hash text NULL CHECK (evidence_set_hash IS NULL OR evidence_set_hash ~ '^sha256:[0-9a-f]{64}$'),
  receipt_digest text NULL CHECK (receipt_digest IS NULL OR receipt_digest ~ '^[0-9a-f]{64}$'),
  receipt_json jsonb NULL CHECK (receipt_json IS NULL OR (jsonb_typeof(receipt_json) = 'object' AND octet_length(receipt_json::text) <= 16384)),
  published_at timestamptz NULL,
  last_error_code text NULL CHECK (last_error_code IS NULL OR last_error_code ~ '^[A-Z][A-Z0-9_]{2,159}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, release_candidate_id),
  UNIQUE (workspace_id, actor_user_id, request_key),
  FOREIGN KEY (workspace_id, release_candidate_id)
    REFERENCES research.release_candidate_packs_v1(workspace_id, release_candidate_id) ON DELETE RESTRICT,
  CHECK (
    (state = 'DELIVERED') =
    (approval_id IS NOT NULL AND evidence_set_hash IS NOT NULL AND receipt_digest IS NOT NULL
     AND receipt_json IS NOT NULL AND published_at IS NOT NULL)
  )
);

CREATE FUNCTION research.guard_release_candidate_publication_v1()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'publication intents are retained for reconciliation' USING ERRCODE = '55000';
  END IF;
  IF (NEW.workspace_id, NEW.release_candidate_id, NEW.run_id, NEW.alpha_id,
      NEW.alpha_version_id, NEW.actor_user_id, NEW.actor_username, NEW.request_key,
      NEW.payload_digest, NEW.request_payload, NEW.pack_digest, NEW.source_fingerprint,
      NEW.legacy_artifact_sha256, NEW.artifact_schema_version, NEW.methodology_claim_id,
      NEW.created_at)
     IS DISTINCT FROM
     (OLD.workspace_id, OLD.release_candidate_id, OLD.run_id, OLD.alpha_id,
      OLD.alpha_version_id, OLD.actor_user_id, OLD.actor_username, OLD.request_key,
      OLD.payload_digest, OLD.request_payload, OLD.pack_digest, OLD.source_fingerprint,
      OLD.legacy_artifact_sha256, OLD.artifact_schema_version, OLD.methodology_claim_id,
      OLD.created_at) THEN
    RAISE EXCEPTION 'publication request identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.state IN ('DELIVERED','REFUSED') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'terminal publication outcome is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.state NOT IN ('PENDING','UNKNOWN') AND NEW.state IS DISTINCT FROM OLD.state THEN
    RAISE EXCEPTION 'publication state transition is invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER research_release_candidate_publications_v1_guard
BEFORE UPDATE OR DELETE ON research.release_candidate_publications_v1
FOR EACH ROW EXECUTE FUNCTION research.guard_release_candidate_publication_v1();

REVOKE ALL ON FUNCTION research.guard_release_candidate_publication_v1() FROM PUBLIC;
REVOKE ALL ON research.release_candidate_publications_v1 FROM PUBLIC;
GRANT SELECT, INSERT ON research.release_candidate_publications_v1 TO portal_research_runtime;
GRANT UPDATE (state, approval_id, evidence_set_hash, receipt_digest, receipt_json,
  published_at, last_error_code, updated_at)
  ON research.release_candidate_publications_v1 TO portal_research_runtime;
GRANT UPDATE (delivery_state, approval_state, downstream_receipt_digest,
  downstream_updated_at, approval_id)
  ON research.release_candidate_delivery_states_v1 TO portal_research_runtime;

COMMENT ON TABLE research.release_candidate_publications_v1 IS
  'P22 actor-bound immutable request, recoverable unknown outcome, and verified existing R1 receipt.';
COMMENT ON COLUMN research.release_candidate_publications_v1.pack_digest IS
  'Research RC frozen-core digest, distinct from the legacy RunSync artifact SHA and Governance evidence-set hash.';
