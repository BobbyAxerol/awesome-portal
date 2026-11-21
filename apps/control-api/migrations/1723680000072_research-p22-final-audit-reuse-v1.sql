-- P22 - exact final-audit reuse compatibility.
--
-- The Research guide allows a retained run to be its own final audit when the
-- immutable P21 pack proves replay plus every frozen-selection OOS child. The
-- original P22 bridge accepted only a separate AUDIT_OF_SELECTION row, which
-- made the real Delta WFO lane impossible to publish without inventing a
-- duplicate child. This additive migration accepts either authority and
-- keeps the proof bound to the exact sealed release candidate.
CREATE OR REPLACE FUNCTION research.p22_final_audit_source_eligible(
  p_workspace_id text,
  p_release_candidate_id text,
  p_run_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, research, public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM research.release_candidate_packs_v1 pack
      JOIN research.runs root
        ON root.workspace_id = pack.workspace_id
       AND root.run_id = pack.run_id
      JOIN research.runs run
        ON run.workspace_id = root.workspace_id
       AND run.run_id = p_run_id
     WHERE pack.workspace_id = p_workspace_id
       AND pack.release_candidate_id = p_release_candidate_id
       AND run.run_id ~ '^rrun_'
       AND run.state = 'READY'
       AND (
         (
           run.relationship_kind = 'AUDIT_OF_SELECTION'
           AND (run.run_id = root.run_id OR run.parent_run_id = root.run_id)
         )
         OR (
           run.run_id = root.run_id
           AND EXISTS (
             SELECT 1
               FROM jsonb_array_elements(pack.frozen_core -> 'fields') field
              WHERE field ->> 'key' = 'final_audit_run_id'
                AND field ->> 'value' = run.run_id
                AND field #>> '{availability,state}' = 'AVAILABLE'
           )
           AND EXISTS (
             SELECT 1
               FROM jsonb_array_elements(pack.frozen_core -> 'pack') item
              WHERE item ->> 'key' = 'FINAL_AUDIT_REPLAY'
                AND item ->> 'status' = 'COMPLETE'
                AND item #>> '{availability,state}' = 'AVAILABLE'
           )
         )
       )
  );
$$;
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
     AND state = 'READY'
     AND research.p22_final_audit_source_eligible(
           p_workspace_id, p_release_candidate_id, p_run_id
         );
  IF NOT FOUND OR run_attempt_id IS DISTINCT FROM p_attempt_id THEN
    RAISE EXCEPTION 'P22 promotion pick run is not the READY final-audit source of its attempt' USING ERRCODE = '23514';
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
     AND run.state = 'READY'
     AND EXISTS (
       SELECT 1
         FROM research.release_candidate_packs_v1 pack
        WHERE pack.workspace_id = p_workspace_id
          AND research.p22_final_audit_source_eligible(
                p_workspace_id, pack.release_candidate_id, p_run_id
              )
     );
  IF source_workspace IS NULL THEN
    RAISE EXCEPTION 'P22 final-audit source is not a READY Research run' USING ERRCODE = '23514';
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


CREATE OR REPLACE FUNCTION research.p22_reconcile_approval(
  p_workspace_id text,
  p_approval_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, research, public
AS $$
DECLARE
  approval public.governance_approval_requests%ROWTYPE;
  receipt research.p22_promotion_pick_receipts_v1%ROWTYPE;
  existing research.p22_approval_settlements_v1%ROWTYPE;
  source_attempt_id text;
  delivery_approval_state text;
BEGIN
  SELECT * INTO approval
    FROM public.governance_approval_requests
   WHERE workspace_id = p_workspace_id AND approval_id = p_approval_id
     AND gate = 'R1';
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT * INTO receipt
    FROM research.p22_promotion_pick_receipts_v1
   WHERE workspace_id = p_workspace_id AND approval_id = p_approval_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF approval.evidence_set_hash IS DISTINCT FROM receipt.evidence_set_hash THEN
    RAISE EXCEPTION 'P22 settlement evidence changed after publication'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO research.p22_approval_settlements_v1
    (workspace_id, release_candidate_id, approval_id, approval_version,
     approval_status, quorum_met, quorum_required, evidence_set_hash,
     source_fact_digest, settled_at)
  VALUES
    (p_workspace_id, receipt.release_candidate_id, p_approval_id,
     approval.approval_version, approval.status, approval.quorum_met,
     approval.quorum_required, approval.evidence_set_hash,
     receipt.fact_digest, approval.updated_at)
  ON CONFLICT (workspace_id, release_candidate_id, approval_version) DO NOTHING;

  SELECT * INTO existing
    FROM research.p22_approval_settlements_v1
   WHERE workspace_id = p_workspace_id
     AND release_candidate_id = receipt.release_candidate_id
     AND approval_version = approval.approval_version;
  IF NOT FOUND
     OR existing.approval_id IS DISTINCT FROM p_approval_id
     OR existing.approval_status IS DISTINCT FROM approval.status
     OR existing.quorum_met IS DISTINCT FROM approval.quorum_met
     OR existing.quorum_required IS DISTINCT FROM approval.quorum_required
     OR existing.evidence_set_hash IS DISTINCT FROM approval.evidence_set_hash
     OR existing.source_fact_digest IS DISTINCT FROM receipt.fact_digest THEN
    RAISE EXCEPTION 'P22 approval version replay conflicts with immutable settlement'
      USING ERRCODE = '23514';
  END IF;

  delivery_approval_state := CASE
    WHEN approval.status IN ('APPROVED','APPROVED_WITH_CONDITION') THEN 'APPROVED'
    WHEN approval.status = 'PENDING' THEN 'PENDING'
    ELSE 'REJECTED'
  END;
  UPDATE research.release_candidate_delivery_states_v1
     SET approval_state = delivery_approval_state,
         downstream_updated_at = greatest(coalesce(downstream_updated_at, approval.updated_at), approval.updated_at)
   WHERE workspace_id = p_workspace_id
     AND release_candidate_id = receipt.release_candidate_id
     AND delivery_state = 'DELIVERED';

  IF approval.status IN ('APPROVED','APPROVED_WITH_CONDITION') THEN
    SELECT attempt_id INTO source_attempt_id
      FROM research.runs
     WHERE workspace_id = p_workspace_id AND run_id = receipt.run_id
       AND state = 'READY'
       AND research.p22_final_audit_source_eligible(
             p_workspace_id, receipt.release_candidate_id, receipt.run_id
           );
    IF NOT FOUND THEN
      RAISE EXCEPTION 'P22 approved pick no longer names a READY final-audit source'
        USING ERRCODE = '23514';
    END IF;
    PERFORM research.p22_record_promotion_pick(
      p_workspace_id, receipt.release_candidate_id, p_approval_id,
      receipt.alpha_version_id, source_attempt_id, receipt.run_id,
      receipt.selection_id, receipt.selected_trial_id,
      receipt.selection_sequence, receipt.artifact_id,
      receipt.artifact_manifest_digest, receipt.pack_digest,
      receipt.evidence_set_hash, approval.status, receipt.fact_digest,
      receipt.actor_user_id
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION research.p22_final_audit_source_eligible(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION research.p22_final_audit_source_eligible(text,text,text) TO portal_research_runtime;

COMMENT ON FUNCTION research.p22_final_audit_source_eligible IS
  'Exact P22 final-audit authority: a READY AUDIT_OF_SELECTION source or a READY retained same-run reuse proven by its immutable P21 pack.';

COMMENT ON FUNCTION research.p22_materialize_run_read_model IS
  'Narrow P22 bridge: only a READY rrun_ proven as the exact sealed-pack final-audit source may populate the legacy Governance read model.';

COMMENT ON FUNCTION research.p22_record_promotion_pick IS
  'Narrow P22 writer. Validates the exact R1 approval, sealed pack and final-audit source (linked child or retained reuse), records the RC receipt, and appends P19 only after approval.';

COMMENT ON FUNCTION research.p22_reconcile_approval IS
  'Server-owned idempotent P22 reconciliation for linked-child and retained-reuse final-audit sources.';

-- Rollback remains feature-dark. Reuse receipts, approvals and read-model
-- bridges are immutable evidence and are never deleted.
SELECT 1;
