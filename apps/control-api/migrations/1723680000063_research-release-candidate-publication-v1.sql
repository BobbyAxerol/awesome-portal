-- P22: durable Research publication intent and exact R1 receipt linkage.
-- Existing Governance tables/routes/contracts are unchanged. No downstream
-- credentials, service identity, Execution command, or approval decision is stored.

ALTER TABLE research.release_candidate_delivery_states_v1
  ADD COLUMN approval_id text NULL REFERENCES governance_approval_requests(approval_id) ON DELETE RESTRICT;

CREATE TABLE research.release_candidate_publication_intents_v1 (
  workspace_id            text NOT NULL,
  release_candidate_id    text NOT NULL,
  run_id                  text NOT NULL,
  alpha_id                text NOT NULL CHECK (length(trim(alpha_id)) BETWEEN 1 AND 191),
  alpha_version_id        text NOT NULL CHECK (length(trim(alpha_version_id)) BETWEEN 1 AND 191),
  actor_user_id           text NOT NULL REFERENCES portal_users(user_id) ON DELETE RESTRICT,
  request_key             text NOT NULL CHECK (request_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$'),
  payload_digest          text NOT NULL CHECK (payload_digest ~ '^[0-9a-f]{64}$'),
  request_payload         jsonb NOT NULL CHECK (jsonb_typeof(request_payload) = 'object' AND octet_length(request_payload::text) <= 8192),
  pack_digest             text NOT NULL CHECK (pack_digest ~ '^[0-9a-f]{64}$'),
  current_source_fingerprint text NOT NULL CHECK (current_source_fingerprint ~ '^[0-9a-f]{64}$'),
  legacy_artifact_sha256  text NOT NULL CHECK (legacy_artifact_sha256 ~ '^sha256:[0-9a-f]{64}$'),
  methodology_claim_id    text NOT NULL CHECK (length(trim(methodology_claim_id)) BETWEEN 1 AND 191),
  state                   text NOT NULL CHECK (state IN ('PENDING', 'DELIVERED', 'UNKNOWN', 'REFUSED')),
  approval_id             text NULL REFERENCES governance_approval_requests(approval_id) ON DELETE RESTRICT,
  evidence_set_hash       text NULL CHECK (evidence_set_hash IS NULL OR evidence_set_hash ~ '^sha256:[0-9a-f]{64}$'),
  downstream_receipt_digest text NULL CHECK (downstream_receipt_digest IS NULL OR downstream_receipt_digest ~ '^[0-9a-f]{64}$'),
  downstream_status       text NULL CHECK (downstream_status IS NULL OR downstream_status IN (
                            'PENDING', 'APPROVED', 'APPROVED_WITH_CONDITION', 'DENIED', 'CHANGES_REQUESTED', 'EXPIRED')),
  sla_due_at              timestamptz NULL,
  expires_at              timestamptz NULL,
  published_at            timestamptz NULL,
  last_error_code         text NULL CHECK (last_error_code IS NULL OR last_error_code ~ '^[A-Z][A-Z0-9_]{2,159}$'),
  receipt_json            jsonb NULL CHECK (receipt_json IS NULL OR (jsonb_typeof(receipt_json) = 'object' AND octet_length(receipt_json::text) <= 16384)),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, release_candidate_id),
  UNIQUE (workspace_id, actor_user_id, request_key),
  FOREIGN KEY (workspace_id, release_candidate_id)
    REFERENCES research.release_candidate_packs_v1(workspace_id, release_candidate_id),
  CHECK (
    (state = 'DELIVERED'
      AND approval_id IS NOT NULL AND evidence_set_hash IS NOT NULL
      AND downstream_receipt_digest IS NOT NULL AND downstream_status IS NOT NULL
      AND sla_due_at IS NOT NULL AND expires_at IS NOT NULL AND published_at IS NOT NULL
      AND receipt_json IS NOT NULL)
    OR state <> 'DELIVERED'
  )
);

CREATE INDEX research_release_candidate_publication_actor_idx
  ON research.release_candidate_publication_intents_v1 (workspace_id, actor_user_id, created_at DESC);

CREATE FUNCTION research.guard_release_candidate_publication_intent_v1()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'publication intents are retained for reconciliation' USING ERRCODE = '55000';
  END IF;
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.release_candidate_id IS DISTINCT FROM OLD.release_candidate_id
     OR NEW.run_id IS DISTINCT FROM OLD.run_id
     OR NEW.alpha_id IS DISTINCT FROM OLD.alpha_id
     OR NEW.alpha_version_id IS DISTINCT FROM OLD.alpha_version_id
     OR NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id
     OR NEW.request_key IS DISTINCT FROM OLD.request_key
     OR NEW.payload_digest IS DISTINCT FROM OLD.payload_digest
     OR NEW.request_payload IS DISTINCT FROM OLD.request_payload
     OR NEW.pack_digest IS DISTINCT FROM OLD.pack_digest
     OR NEW.current_source_fingerprint IS DISTINCT FROM OLD.current_source_fingerprint
     OR NEW.legacy_artifact_sha256 IS DISTINCT FROM OLD.legacy_artifact_sha256
     OR NEW.methodology_claim_id IS DISTINCT FROM OLD.methodology_claim_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'publication request identity and payload are immutable' USING ERRCODE = '23514';
  END IF;
  IF (OLD.state = 'DELIVERED' AND NEW.state IS DISTINCT FROM 'DELIVERED')
     OR (OLD.state = 'REFUSED' AND NEW.state IS DISTINCT FROM 'REFUSED')
     OR (OLD.state = 'PENDING' AND NEW.state NOT IN ('PENDING', 'DELIVERED', 'UNKNOWN', 'REFUSED'))
     OR (OLD.state = 'UNKNOWN' AND NEW.state NOT IN ('PENDING', 'DELIVERED', 'UNKNOWN', 'REFUSED')) THEN
    RAISE EXCEPTION 'publication outcome transition is invalid' USING ERRCODE = '23514';
  END IF;
  IF OLD.state = 'DELIVERED' AND (
       NEW.state IS DISTINCT FROM OLD.state
       OR NEW.approval_id IS DISTINCT FROM OLD.approval_id
       OR NEW.evidence_set_hash IS DISTINCT FROM OLD.evidence_set_hash
       OR NEW.downstream_receipt_digest IS DISTINCT FROM OLD.downstream_receipt_digest
       OR NEW.downstream_status IS DISTINCT FROM OLD.downstream_status
       OR NEW.sla_due_at IS DISTINCT FROM OLD.sla_due_at
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.published_at IS DISTINCT FROM OLD.published_at
       OR NEW.receipt_json IS DISTINCT FROM OLD.receipt_json) THEN
    RAISE EXCEPTION 'a delivered publication receipt is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER research_release_candidate_publication_intents_v1_guard
BEFORE UPDATE OR DELETE ON research.release_candidate_publication_intents_v1
FOR EACH ROW EXECUTE FUNCTION research.guard_release_candidate_publication_intent_v1();

REVOKE ALL ON FUNCTION research.guard_release_candidate_publication_intent_v1() FROM PUBLIC;
REVOKE ALL ON research.release_candidate_publication_intents_v1 FROM PUBLIC;
GRANT SELECT, INSERT ON research.release_candidate_publication_intents_v1 TO portal_research_runtime;
GRANT UPDATE (state, approval_id, evidence_set_hash, downstream_receipt_digest,
  downstream_status, sla_due_at, expires_at, published_at, last_error_code,
  receipt_json, updated_at)
  ON research.release_candidate_publication_intents_v1 TO portal_research_runtime;
GRANT UPDATE (delivery_state, approval_state, downstream_receipt_digest,
  downstream_updated_at, approval_id)
  ON research.release_candidate_delivery_states_v1 TO portal_research_runtime;

COMMENT ON TABLE research.release_candidate_publication_intents_v1 IS
  'P22 immutable actor/payload intent plus recoverable outcome for the unchanged strict R1 create operation; no auth tokens or approval decisions.';
COMMENT ON COLUMN research.release_candidate_publication_intents_v1.pack_digest IS
  'Research Release Candidate frozen-core digest; deliberately distinct from legacy artifact and Governance evidence-set hashes.';
COMMENT ON COLUMN research.release_candidate_publication_intents_v1.legacy_artifact_sha256 IS
  'Exact RunSync-selected_params artifact pin verified in the existing R1 create transaction.';

SELECT 1;
