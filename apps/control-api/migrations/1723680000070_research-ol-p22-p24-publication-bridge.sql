-- OL-03..OL-11 · P22 publication bridge and immutable promotion facts.
--
-- This migration is additive and intentionally starts at 070.  It does not
-- grant the Research runtime direct DML on the legacy run_read_models table.
-- A SECURITY DEFINER function owned by the migration owner is the only narrow
-- bridge used to materialise a final-audit rrun_ row for the existing R1
-- Governance reader.  P22 never writes an approval decision or an Execution
-- row.

ALTER TABLE research.release_candidate_publications_v1
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0 AND attempt_count <= 32),
  ADD COLUMN conflicting_approval_id text NULL REFERENCES governance_approval_requests(approval_id) ON DELETE RESTRICT,
  ADD COLUMN downstream_code text NULL CHECK (downstream_code IS NULL OR downstream_code ~ '^[A-Z][A-Z0-9_]{2,159}$');

CREATE TABLE research.p22_run_read_model_bridges_v1 (
  workspace_id          text NOT NULL REFERENCES workspaces(workspace_id),
  final_audit_run_id    text NOT NULL,
  release_candidate_id  text NOT NULL,
  source_pack_digest    text NOT NULL CHECK (source_pack_digest ~ '^[0-9a-f]{64}$'),
  source_fingerprint    text NOT NULL CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'),
  artifact_sha256       text NOT NULL CHECK (artifact_sha256 ~ '^sha256:[0-9a-f]{64}$'),
  methodology_claim_ids text[] NOT NULL CHECK (cardinality(methodology_claim_ids) BETWEEN 1 AND 64),
  materialization_digest text NOT NULL CHECK (materialization_digest ~ '^[0-9a-f]{64}$'),
  materialized_by_user_id text NOT NULL REFERENCES portal_users(user_id),
  materialized_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, final_audit_run_id),
  UNIQUE (workspace_id, release_candidate_id),
  FOREIGN KEY (workspace_id, release_candidate_id)
    REFERENCES research.release_candidate_packs_v1(workspace_id, release_candidate_id)
    ON DELETE RESTRICT
);

-- The P19 table is intentionally kept in its original schema. It is the
-- source-of-truth reader for lineage and has no release-candidate columns.
-- P22 stores its richer RC-bound receipt beside it and uses a SECURITY
-- DEFINER writer to append the P19 fact only after an R1 approval.
CREATE TABLE research.p22_promotion_pick_receipts_v1 (
  workspace_id             text NOT NULL REFERENCES workspaces(workspace_id),
  release_candidate_id     text NOT NULL,
  approval_id              text NOT NULL REFERENCES governance_approval_requests(approval_id) ON DELETE RESTRICT,
  run_id                   text NOT NULL,
  alpha_version_id         text NOT NULL,
  selection_id             text NULL,
  selected_trial_id        text NULL,
  selection_sequence       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(selection_sequence) = 'array' AND octet_length(selection_sequence::text) <= 32768),
  artifact_id              text NULL,
  artifact_manifest_digest text NULL CHECK (artifact_manifest_digest IS NULL OR artifact_manifest_digest ~ '^[0-9a-f]{64}$'),
  pack_digest              text NOT NULL CHECK (pack_digest ~ '^[0-9a-f]{64}$'),
  evidence_set_hash        text NOT NULL CHECK (evidence_set_hash ~ '^sha256:[0-9a-f]{64}$'),
  approval_status          text NOT NULL CHECK (approval_status IN ('PENDING','APPROVED','APPROVED_WITH_CONDITION','DENIED','CHANGES_REQUESTED','EXPIRED')),
  fact_digest              text NOT NULL CHECK (fact_digest ~ '^[0-9a-f]{64}$'),
  actor_user_id            text NOT NULL REFERENCES portal_users(user_id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, release_candidate_id),
  FOREIGN KEY (workspace_id, release_candidate_id)
    REFERENCES research.release_candidate_packs_v1(workspace_id, release_candidate_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES research.runs(workspace_id, run_id),
  FOREIGN KEY (workspace_id, alpha_version_id)
    REFERENCES research.alpha_versions(workspace_id, alpha_version_id)
);

CREATE TRIGGER research_p22_run_read_model_bridges_v1_immutable_guard
BEFORE UPDATE OR DELETE ON research.p22_run_read_model_bridges_v1
FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();

CREATE TRIGGER research_p22_promotion_pick_receipts_v1_immutable_guard
BEFORE UPDATE OR DELETE ON research.p22_promotion_pick_receipts_v1
FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();

CREATE OR REPLACE FUNCTION research.p22_record_promotion_pick(
  p_workspace_id text,
  p_release_candidate_id text,
  p_approval_id text,
  p_alpha_version_id text,
  p_attempt_id text,
  p_run_id text,
  p_selection_id text,
  p_selected_trial_id text,
  p_selection_sequence jsonb,
  p_artifact_id text,
  p_artifact_manifest_digest text,
  p_pack_digest text,
  p_evidence_set_hash text,
  p_approval_status text,
  p_fact_digest text,
  p_actor_user_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, research, public
AS $$
DECLARE
  approval_status text;
  approval_subject_id text;
  run_attempt_id text;
  version_alpha_id text;
  existing research.p22_promotion_pick_receipts_v1%ROWTYPE;
  existing_p19 research.attempt_promotion_pick_facts_v1%ROWTYPE;
  source_ref text;
BEGIN
  IF p_release_candidate_id IS NULL OR p_approval_id IS NULL
     OR p_alpha_version_id IS NULL OR p_attempt_id IS NULL OR p_run_id IS NULL
     OR p_actor_user_id IS NULL
     OR p_pack_digest !~ '^[0-9a-f]{64}$'
     OR p_evidence_set_hash !~ '^sha256:[0-9a-f]{64}$'
     OR p_fact_digest !~ '^[0-9a-f]{64}$'
     OR p_selection_sequence IS NULL OR jsonb_typeof(p_selection_sequence) <> 'array'
     OR octet_length(p_selection_sequence::text) > 32768
     OR (p_artifact_manifest_digest IS NOT NULL AND p_artifact_manifest_digest !~ '^[0-9a-f]{64}$')
     OR p_approval_status NOT IN ('PENDING','APPROVED','APPROVED_WITH_CONDITION','DENIED','CHANGES_REQUESTED','EXPIRED') THEN
    RAISE EXCEPTION 'P22 promotion pick facts are malformed' USING ERRCODE = '23514';
  END IF;

  SELECT status, subject_id INTO approval_status, approval_subject_id
    FROM public.governance_approval_requests
   WHERE workspace_id = p_workspace_id AND approval_id = p_approval_id
     AND gate = 'R1';
  IF NOT FOUND OR approval_status IS DISTINCT FROM p_approval_status THEN
    RAISE EXCEPTION 'P22 promotion pick approval is not the exact R1 decision' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
     WHERE workspace_id = p_workspace_id AND user_id = p_actor_user_id
  ) THEN
    RAISE EXCEPTION 'P22 promotion pick actor is not a workspace member' USING ERRCODE = '23514';
  END IF;
  SELECT alpha_id INTO version_alpha_id
    FROM research.alpha_versions
   WHERE workspace_id = p_workspace_id AND alpha_version_id = p_alpha_version_id;
  IF NOT FOUND OR approval_subject_id IS DISTINCT FROM version_alpha_id THEN
    RAISE EXCEPTION 'P22 promotion pick approval is not bound to the Alpha version' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM research.release_candidate_packs_v1
     WHERE workspace_id = p_workspace_id AND release_candidate_id = p_release_candidate_id
       AND pack_digest = p_pack_digest
  ) THEN
    RAISE EXCEPTION 'P22 promotion pick is not bound to the sealed release candidate' USING ERRCODE = '23514';
  END IF;

  SELECT attempt_id INTO run_attempt_id
    FROM research.runs
   WHERE workspace_id = p_workspace_id AND run_id = p_run_id
     AND relationship_kind = 'AUDIT_OF_SELECTION' AND state = 'READY';
  IF NOT FOUND OR run_attempt_id IS DISTINCT FROM p_attempt_id THEN
    RAISE EXCEPTION 'P22 promotion pick run is not the READY audit child of its attempt' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM research.attempts
     WHERE workspace_id = p_workspace_id AND attempt_id = p_attempt_id
       AND alpha_version_id = p_alpha_version_id
  ) THEN
    RAISE EXCEPTION 'P22 promotion pick attempt is not bound to the Alpha version' USING ERRCODE = '23514';
  END IF;

  source_ref := 'approval:' || p_approval_id || ':release_candidate:' || p_release_candidate_id;

  SELECT * INTO existing
    FROM research.p22_promotion_pick_receipts_v1
   WHERE workspace_id = p_workspace_id AND release_candidate_id = p_release_candidate_id
   FOR UPDATE;
  IF FOUND THEN
    IF existing.approval_id IS DISTINCT FROM p_approval_id
       OR existing.run_id IS DISTINCT FROM p_run_id
       OR existing.alpha_version_id IS DISTINCT FROM p_alpha_version_id
       OR existing.fact_digest IS DISTINCT FROM p_fact_digest
       OR existing.pack_digest IS DISTINCT FROM p_pack_digest
       OR existing.evidence_set_hash IS DISTINCT FROM p_evidence_set_hash THEN
      RAISE EXCEPTION 'P22 promotion pick receipt changed after first write' USING ERRCODE = '23514';
    END IF;
  ELSE
    INSERT INTO research.p22_promotion_pick_receipts_v1
      (workspace_id, release_candidate_id, approval_id, run_id, alpha_version_id,
       selection_id, selected_trial_id, selection_sequence, artifact_id,
       artifact_manifest_digest, pack_digest, evidence_set_hash, approval_status,
       fact_digest, actor_user_id)
    VALUES
      (p_workspace_id, p_release_candidate_id, p_approval_id, p_run_id, p_alpha_version_id,
       p_selection_id, p_selected_trial_id, p_selection_sequence, p_artifact_id,
       p_artifact_manifest_digest, p_pack_digest, p_evidence_set_hash, p_approval_status,
       p_fact_digest, p_actor_user_id);
  END IF;

  -- Only an approved R1 decision may become the immutable P19 source fact.
  -- Pending/denied outcomes remain visible in the P22 receipt but cannot claim
  -- that a promotion was picked.
  IF p_approval_status IN ('APPROVED','APPROVED_WITH_CONDITION') THEN
    SELECT * INTO existing_p19
      FROM research.attempt_promotion_pick_facts_v1
     WHERE workspace_id = p_workspace_id AND alpha_version_id = p_alpha_version_id
     FOR UPDATE;
    IF FOUND THEN
      IF existing_p19.attempt_id IS DISTINCT FROM p_attempt_id
         OR existing_p19.run_id IS DISTINCT FROM p_run_id
         OR existing_p19.source_digest IS DISTINCT FROM p_fact_digest THEN
        RAISE EXCEPTION 'P19 promotion fact already binds this Alpha version to a different approved pick' USING ERRCODE = '23514';
      END IF;
    ELSE
      INSERT INTO research.attempt_promotion_pick_facts_v1
        (workspace_id, alpha_version_id, attempt_id, run_id, source_fact_ref,
         source_contract_rev, source_digest, source_as_of)
      VALUES
        (p_workspace_id, p_alpha_version_id, p_attempt_id, p_run_id, source_ref,
         'research.p22-promotion-pick.v1', p_fact_digest, now());
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION research.p22_materialize_run_read_model(
  p_workspace_id text,
  p_run_id text,
  p_status text,
  p_protocol text,
  p_strategy_id text,
  p_dataset_id text,
  p_source_cursor text,
  p_artifact_sha256 text,
  p_artifact_schema_version text,
  p_artifact_creator_user_id text,
  p_methodology_claim_ids text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, research
AS $$
DECLARE
  source_workspace text;
BEGIN
  IF p_run_id !~ '^rrun_[A-Za-z0-9._-]{1,127}$' THEN
    RAISE EXCEPTION 'P22 final-audit identity is not an rrun_ source' USING ERRCODE = '23514';
  END IF;
  IF p_status !~ '^[A-Z][A-Z0-9_]{0,63}$'
     OR p_protocol !~ '^[A-Za-z0-9._:-]{1,128}$'
     OR p_strategy_id IS NULL OR length(trim(p_strategy_id)) = 0
     OR p_dataset_id IS NULL OR length(trim(p_dataset_id)) = 0
     OR p_artifact_sha256 !~ '^sha256:[0-9a-f]{64}$'
     OR p_artifact_schema_version IS NULL OR length(trim(p_artifact_schema_version)) = 0
     OR p_artifact_creator_user_id IS NULL OR cardinality(p_methodology_claim_ids) NOT BETWEEN 1 AND 64 THEN
    RAISE EXCEPTION 'P22 run read-model facts are incomplete' USING ERRCODE = '23514';
  END IF;
  SELECT run.workspace_id INTO source_workspace
    FROM research.runs run
   WHERE run.workspace_id = p_workspace_id AND run.run_id = p_run_id
     AND run.relationship_kind = 'AUDIT_OF_SELECTION'
     AND run.state = 'READY';
  IF source_workspace IS NULL THEN
    RAISE EXCEPTION 'P22 final-audit child is not a READY Research run' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.run_read_models
    (run_id, workspace_id, owner_user_id, status, protocol, strategy_id, dataset_id,
     source_cursor, artifact_sha256, artifact_schema_version, artifact_creator_user_id,
     methodology_claim_ids, created_at, updated_at)
  SELECT p_run_id, p_workspace_id, run.submitted_by_user_id, p_status, p_protocol,
         p_strategy_id, p_dataset_id, p_source_cursor, p_artifact_sha256,
         p_artifact_schema_version, p_artifact_creator_user_id, p_methodology_claim_ids,
         run.created_at, run.updated_at
    FROM research.runs run
   WHERE run.workspace_id = p_workspace_id AND run.run_id = p_run_id
  ON CONFLICT (run_id) DO UPDATE
    SET workspace_id = EXCLUDED.workspace_id,
        owner_user_id = EXCLUDED.owner_user_id,
        status = EXCLUDED.status,
        protocol = EXCLUDED.protocol,
        strategy_id = EXCLUDED.strategy_id,
        dataset_id = EXCLUDED.dataset_id,
        source_cursor = EXCLUDED.source_cursor,
        artifact_sha256 = EXCLUDED.artifact_sha256,
        artifact_schema_version = EXCLUDED.artifact_schema_version,
        artifact_creator_user_id = EXCLUDED.artifact_creator_user_id,
        methodology_claim_ids = EXCLUDED.methodology_claim_ids,
        updated_at = EXCLUDED.updated_at
   WHERE run_read_models.workspace_id = EXCLUDED.workspace_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'P22 run read-model materialisation conflicted with another workspace' USING ERRCODE = '23514';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION research.p22_materialize_run_read_model(text,text,text,text,text,text,text,text,text,text,text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION research.p22_materialize_run_read_model(text,text,text,text,text,text,text,text,text,text,text[]) TO portal_research_runtime;
REVOKE ALL ON FUNCTION research.p22_record_promotion_pick(text,text,text,text,text,text,text,text,jsonb,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION research.p22_record_promotion_pick(text,text,text,text,text,text,text,text,jsonb,text,text,text,text,text,text,text) TO portal_research_runtime;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON research.p22_run_read_model_bridges_v1, research.p22_promotion_pick_receipts_v1 FROM portal_research_runtime;
GRANT SELECT ON research.p22_run_read_model_bridges_v1, research.p22_promotion_pick_receipts_v1 TO portal_research_runtime;
GRANT UPDATE (attempt_count, conflicting_approval_id, downstream_code, updated_at)
  ON research.release_candidate_publications_v1 TO portal_research_runtime;

COMMENT ON FUNCTION research.p22_materialize_run_read_model IS
  'Narrow P22 bridge: only a READY AUDIT_OF_SELECTION rrun_ may populate the legacy Governance read model.';
COMMENT ON TABLE research.p22_run_read_model_bridges_v1 IS
  'Immutable provenance for each P22 final-audit materialisation into public.run_read_models.';
COMMENT ON TABLE research.p22_promotion_pick_receipts_v1 IS
  'Immutable P22 release-candidate promotion receipt; pending decisions are visible here, while only approved decisions append the P19 source fact.';
COMMENT ON FUNCTION research.p22_record_promotion_pick IS
  'Narrow P22 writer. Validates the exact R1 approval and sealed pack, records the RC receipt, and appends the existing P19 fact only for an approved decision.';

-- Down migration is intentionally non-destructive. P22 history and the
-- legacy read-model bridge are retained; rollback is feature/config only.
SELECT 1;
