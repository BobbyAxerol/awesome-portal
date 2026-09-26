-- P22 bridge writer authority fix.
--
-- Runtime intentionally has no direct INSERT on the immutable bridge table.
-- This narrow SECURITY DEFINER function validates the exact sealed pack,
-- READY final-audit source, sealed artifact and workspace actor, then performs
-- the read-model materialization and receipt append in one transaction.
CREATE OR REPLACE FUNCTION research.p22_record_run_read_model_bridge(
  p_workspace_id text,
  p_release_candidate_id text,
  p_run_id text,
  p_status text,
  p_protocol text,
  p_strategy_id text,
  p_dataset_id text,
  p_source_cursor text,
  p_artifact_sha256 text,
  p_artifact_schema_version text,
  p_artifact_creator_user_id text,
  p_methodology_claim_ids text[],
  p_source_pack_digest text,
  p_source_fingerprint text,
  p_materialization_digest text,
  p_actor_user_id text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, research, public
AS $$
DECLARE
  existing research.p22_run_read_model_bridges_v1%ROWTYPE;
  materialized_ms bigint;
BEGIN
  IF p_source_pack_digest !~ '^[0-9a-f]{64}$'
     OR p_source_fingerprint !~ '^[0-9a-f]{64}$'
     OR p_materialization_digest !~ '^[0-9a-f]{64}$'
     OR p_artifact_sha256 !~ '^sha256:[0-9a-f]{64}$'
     OR cardinality(p_methodology_claim_ids) NOT BETWEEN 1 AND 64 THEN
    RAISE EXCEPTION 'P22 bridge receipt facts are malformed' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
     WHERE workspace_id = p_workspace_id AND user_id = p_actor_user_id
  ) THEN
    RAISE EXCEPTION 'P22 bridge actor is not a workspace member' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM research.release_candidate_packs_v1 pack
     WHERE pack.workspace_id = p_workspace_id
       AND pack.release_candidate_id = p_release_candidate_id
       AND pack.run_id = p_run_id
       AND pack.pack_digest = p_source_pack_digest
       AND pack.source_fingerprint = p_source_fingerprint
       AND research.p22_final_audit_source_eligible(
             p_workspace_id, p_release_candidate_id, p_run_id
           )
  ) THEN
    RAISE EXCEPTION 'P22 bridge is not bound to the exact sealed final-audit pack' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM research.artifacts artifact
     WHERE artifact.workspace_id = p_workspace_id
       AND artifact.run_id = p_run_id
       AND artifact.state = 'SEALED'
       AND artifact.manifest_digest = substring(p_artifact_sha256 FROM 8)
       AND artifact.schema_version = p_artifact_schema_version
  ) THEN
    RAISE EXCEPTION 'P22 bridge artifact identity is not sealed by the final-audit run' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO existing
    FROM research.p22_run_read_model_bridges_v1
   WHERE workspace_id = p_workspace_id
     AND release_candidate_id = p_release_candidate_id
   FOR UPDATE;
  IF FOUND THEN
    IF existing.final_audit_run_id IS DISTINCT FROM p_run_id
       OR existing.source_pack_digest IS DISTINCT FROM p_source_pack_digest
       OR existing.source_fingerprint IS DISTINCT FROM p_source_fingerprint
       OR existing.artifact_sha256 IS DISTINCT FROM p_artifact_sha256
       OR existing.methodology_claim_ids IS DISTINCT FROM p_methodology_claim_ids
       OR existing.materialization_digest IS DISTINCT FROM p_materialization_digest
       OR existing.materialized_by_user_id IS DISTINCT FROM p_actor_user_id THEN
      RAISE EXCEPTION 'P22 bridge receipt changed after first write' USING ERRCODE = '23514';
    END IF;
    RETURN (extract(epoch FROM existing.materialized_at) * 1000)::bigint;
  END IF;

  PERFORM research.p22_materialize_run_read_model(
    p_workspace_id, p_run_id, p_status, p_protocol, p_strategy_id, p_dataset_id,
    p_source_cursor, p_artifact_sha256, p_artifact_schema_version,
    p_artifact_creator_user_id, p_methodology_claim_ids
  );
  INSERT INTO research.p22_run_read_model_bridges_v1
    (workspace_id, final_audit_run_id, release_candidate_id, source_pack_digest,
     source_fingerprint, artifact_sha256, methodology_claim_ids,
     materialization_digest, materialized_by_user_id)
  VALUES
    (p_workspace_id, p_run_id, p_release_candidate_id, p_source_pack_digest,
     p_source_fingerprint, p_artifact_sha256, p_methodology_claim_ids,
     p_materialization_digest, p_actor_user_id)
  RETURNING (extract(epoch FROM materialized_at) * 1000)::bigint INTO materialized_ms;
  RETURN materialized_ms;
END;
$$;

REVOKE ALL ON FUNCTION research.p22_record_run_read_model_bridge(
  text,text,text,text,text,text,text,text,text,text,text,text[],text,text,text,text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION research.p22_record_run_read_model_bridge(
  text,text,text,text,text,text,text,text,text,text,text,text[],text,text,text,text
) TO portal_research_runtime;

COMMENT ON FUNCTION research.p22_record_run_read_model_bridge IS
  'Atomic P22 authority boundary: exact sealed retained final audit to legacy Governance read model plus immutable bridge receipt.';
