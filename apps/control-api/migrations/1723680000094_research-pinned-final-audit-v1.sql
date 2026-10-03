-- Additive pinned final audit; preserve every old producer/profile/byte seal.
ALTER TABLE research.run_producers
  DROP CONSTRAINT run_producers_execution_profile_id_check,
  DROP CONSTRAINT run_producers_execution_profile_digest_check,
  DROP CONSTRAINT run_producers_diagnostic_profile_pair_check;
ALTER TABLE research.run_producers
  ADD CONSTRAINT run_producers_execution_profile_id_check CHECK(execution_profile_id IN (
    'p04.fixed-qualification.v1','p10.delta-signal-notional-wfo.v1','p10.delta-signal-notional-wfo.v2',
    'p10.delta-signal-notional-causal-inner.v1','p10.vn-stock-daily-observed-fixed.v1',
    'p16.delta-whatif-grid.v1','p17.imported-signal-notional.v1','p23.delta-pinned-final-audit.v1')),
  ADD CONSTRAINT run_producers_execution_profile_digest_check CHECK(
    (execution_profile_id='p04.fixed-qualification.v1' AND execution_profile_digest IS NULL)
    OR (execution_profile_id='p10.delta-signal-notional-wfo.v1' AND execution_profile_digest='b86c66fa68c41e76c6106bd06a48b5ba1281bc4b168a915ec2fa7e34ec2a6cca' AND execution_profile_digest IS NOT NULL)
    OR (execution_profile_id='p10.delta-signal-notional-wfo.v2' AND execution_profile_digest='d65291f776dce1fef162da9eb6505ba63fc6e3ae0f55679fe12dece3858c7fa0' AND execution_profile_digest IS NOT NULL)
    OR (execution_profile_id='p10.delta-signal-notional-causal-inner.v1' AND execution_profile_digest='60a041b373808405f8896aee0a3421d41cc2199d516dadc9f40e1187e2fefdd1' AND execution_profile_digest IS NOT NULL)
    OR (execution_profile_id='p10.vn-stock-daily-observed-fixed.v1' AND execution_profile_digest='acb6566ebae23bcf77c77974136c9d083a95f0967260b1332530f600f5abe00e' AND execution_profile_digest IS NOT NULL)
    OR (execution_profile_id='p16.delta-whatif-grid.v1' AND execution_profile_digest='3c29160abf214a0ef1c20c630048442ef131aadc1d00849f69ae428d0ff513bc' AND execution_profile_digest IS NOT NULL)
    OR (execution_profile_id='p17.imported-signal-notional.v1' AND execution_profile_digest='f1ed5dbccdd90ca7dd35be2755f3b3b5f7e9a29b1641beb08bd0136783c0f298' AND execution_profile_digest IS NOT NULL)
    OR (execution_profile_id='p23.delta-pinned-final-audit.v1' AND execution_profile_digest='457267c54edd02fcea53eceb92a81cdec9fdaefc8b9231638540b51a85b92491' AND execution_profile_digest IS NOT NULL)),
  ADD CONSTRAINT run_producers_diagnostic_profile_pair_check CHECK(
    (intent_kind='DIAGNOSTIC')=(execution_profile_id IN ('p16.delta-whatif-grid.v1','p23.delta-pinned-final-audit.v1')));

CREATE TABLE research.pinned_audit_targets_v1(
  workspace_id text NOT NULL REFERENCES workspaces(workspace_id),run_id text NOT NULL,parent_run_id text NOT NULL,
  parent_artifact_id text NOT NULL,parent_manifest_digest text NOT NULL CHECK(parent_manifest_digest~'^[0-9a-f]{64}$'),
  target_digest text NOT NULL CHECK(target_digest~'^[0-9a-f]{64}$'),
  target_pins jsonb NOT NULL CHECK(jsonb_typeof(target_pins)='object' AND octet_length(target_pins::text)<=16384
    AND NOT(target_pins ? 'source_config_raw') AND NOT(target_pins ? 'source_selection_raw')
    AND COALESCE(target_pins->>'parameters_digest' ~ '^[0-9a-f]{64}$',false)),
  requested_by_user_id text NOT NULL REFERENCES portal_users(user_id),created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace_id,run_id),FOREIGN KEY(workspace_id,run_id) REFERENCES research.runs(workspace_id,run_id),
  FOREIGN KEY(workspace_id,parent_run_id) REFERENCES research.runs(workspace_id,run_id),
  FOREIGN KEY(workspace_id,parent_artifact_id) REFERENCES research.artifacts(workspace_id,artifact_id),
  CHECK(run_id<>parent_run_id));
CREATE INDEX pinned_audit_targets_parent_idx ON research.pinned_audit_targets_v1(workspace_id,parent_run_id,created_at DESC);
CREATE TABLE research.pinned_audit_receipts_v1(
  workspace_id text NOT NULL,run_id text NOT NULL,artifact_id text NOT NULL,artifact_revision bigint NOT NULL CHECK(artifact_revision>0),
  manifest_digest text NOT NULL CHECK(manifest_digest~'^[0-9a-f]{64}$'),target_digest text NOT NULL CHECK(target_digest~'^[0-9a-f]{64}$'),
  result jsonb NOT NULL CHECK(jsonb_typeof(result)='object' AND octet_length(result::text)<=8192
    AND COALESCE(result->>'schema_version'='research.pinned-selection-audit-result.v1'
      AND result->'optimizer_reinvoked'='false'::jsonb AND result->'optimizer_trials'='0'::jsonb,false)
    AND result ?& ARRAY['run_id','parent_run_id','target_digest','parameters_digest','engine_release_id','engine_version',
      'snapshot_id','snapshot_content_hash','source_selection_digest','source_selection_kind','source_selection_part_digest',
      'source_config_digest','audit_target_kind','n_folds','bars']
    AND result->>'audit_target_kind'='SINGLE_PARAMETER_SET'
    AND result->>'engine_release_id'='er_quantbt_111' AND result->>'engine_version'='1.1.1'
    AND jsonb_typeof(result->'n_folds')='number' AND result->'n_folds'>='2'::jsonb AND result->'n_folds'<='16'::jsonb
    AND jsonb_typeof(result->'bars')='number' AND result->'bars'>='1'::jsonb AND result->'bars'<='10000'::jsonb),
  result_digest text NOT NULL CHECK(result_digest~'^[0-9a-f]{64}$'),verified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace_id,run_id),FOREIGN KEY(workspace_id,run_id) REFERENCES research.pinned_audit_targets_v1(workspace_id,run_id),
  FOREIGN KEY(workspace_id,artifact_id) REFERENCES research.artifacts(workspace_id,artifact_id));

CREATE OR REPLACE FUNCTION research.validate_pinned_audit_identity() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,research AS $$ BEGIN
  IF TG_TABLE_NAME='pinned_audit_targets_v1' THEN
    IF NOT EXISTS(SELECT 1 FROM research.runs r JOIN research.artifacts a ON a.workspace_id=r.workspace_id
      AND a.artifact_id=NEW.parent_artifact_id AND a.run_id=NEW.parent_run_id AND a.state='SEALED'
      AND a.manifest_digest=NEW.parent_manifest_digest WHERE r.workspace_id=NEW.workspace_id AND r.run_id=NEW.run_id
      AND r.run_kind='AUDIT' AND r.relationship_kind='AUDIT_OF_SELECTION' AND r.parent_run_id=NEW.parent_run_id) THEN
      RAISE EXCEPTION 'audit must pin its own parent original seal' USING ERRCODE='23514'; END IF;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM research.pinned_audit_targets_v1 t JOIN research.artifacts a USING(workspace_id)
      WHERE t.workspace_id=NEW.workspace_id AND t.run_id=NEW.run_id AND t.target_digest=NEW.target_digest
      AND a.artifact_id=NEW.artifact_id AND a.run_id=NEW.run_id AND a.state='SEALED'
      AND a.artifact_revision=NEW.artifact_revision AND a.manifest_digest=NEW.manifest_digest
      AND NEW.result->>'run_id'=NEW.run_id AND NEW.result->>'parent_run_id'=t.parent_run_id
      AND NEW.result->>'target_digest'=t.target_digest
      AND NEW.result->>'parameters_digest'=t.target_pins->>'parameters_digest'
      AND NEW.result->>'snapshot_id'=t.target_pins->>'snapshot_id'
      AND NEW.result->>'snapshot_content_hash'=t.target_pins->>'snapshot_content_hash'
      AND NEW.result->>'source_config_digest'=t.target_pins->>'source_config_digest'
      AND NEW.result->>'source_selection_digest'=t.target_pins->>'source_selection_digest'
      AND NEW.result->>'source_selection_part_digest'=t.target_pins->>'source_selection_part_digest') THEN
      RAISE EXCEPTION 'audit receipt must bind its own sealed custody and admitted target' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION research.validate_pinned_audit_identity() FROM PUBLIC;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['pinned_audit_targets_v1','pinned_audit_receipts_v1'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON research.%I FOR EACH ROW EXECUTE FUNCTION research.validate_pinned_audit_identity()',t||'_identity',t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON research.%I FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation()',t||'_immutable',t);
    EXECUTE format('ALTER TABLE research.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE research.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY %I ON research.%I FOR ALL TO portal_research_runtime USING(workspace_id=current_setting(''research.workspace_id'',true) AND EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=%I.workspace_id AND m.user_id=current_setting(''research.actor_user_id'',true))) WITH CHECK(workspace_id=current_setting(''research.workspace_id'',true) AND EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=%I.workspace_id AND m.user_id=current_setting(''research.actor_user_id'',true)))',t||'_tenant',t,t,t);
    EXECUTE format('REVOKE ALL ON research.%I FROM PUBLIC',t);
    EXECUTE format('GRANT SELECT,INSERT ON research.%I TO portal_research_runtime',t);
  END LOOP;
END $$;
CREATE INDEX research_audit_utility_active_idx ON research.jobs(workspace_id,requested_by_user_id)
  WHERE job_kind='AUDIT' AND state IN('QUEUED','CLAIMED','RUNNING');

-- Same-run replay reuse remains valid. A separate child is authority only
-- when its byte-verified immutable receipt is frozen in this exact pack.
-- Publish/promotion still name the parent selection, not the zero-trial child.
CREATE OR REPLACE FUNCTION research.p22_final_audit_source_eligible(
  p_workspace_id text,p_release_candidate_id text,p_run_id text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,research,public AS $$
  SELECT EXISTS(
    SELECT 1 FROM research.release_candidate_packs_v1 pack
    JOIN research.runs root ON root.workspace_id=pack.workspace_id AND root.run_id=pack.run_id
    WHERE pack.workspace_id=p_workspace_id AND pack.release_candidate_id=p_release_candidate_id
      AND root.run_id=p_run_id AND root.run_id~'^rrun_' AND root.state='READY'
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(pack.frozen_core->'pack') item
        WHERE item->>'key'='FINAL_AUDIT_REPLAY' AND item->>'status'='COMPLETE'
          AND item#>>'{availability,state}'='AVAILABLE')
      AND (
        (NOT(pack.frozen_core ? 'linked_final_audit') AND EXISTS(
          SELECT 1 FROM jsonb_array_elements(pack.frozen_core->'fields') field
          WHERE field->>'key'='final_audit_run_id' AND field->>'value'=root.run_id
            AND field#>>'{availability,state}'='AVAILABLE'))
        OR EXISTS(
          SELECT 1 FROM research.pinned_audit_receipts_v1 proof
          JOIN research.pinned_audit_targets_v1 target ON target.workspace_id=proof.workspace_id
            AND target.run_id=proof.run_id AND target.target_digest=proof.target_digest
          JOIN research.runs child ON child.workspace_id=proof.workspace_id AND child.run_id=proof.run_id
            AND child.run_kind='AUDIT' AND child.relationship_kind='AUDIT_OF_SELECTION'
            AND child.state='READY' AND child.parent_run_id=root.run_id
          JOIN research.run_producers producer ON producer.workspace_id=child.workspace_id AND producer.run_id=child.run_id
            AND producer.execution_profile_id='p23.delta-pinned-final-audit.v1'
            AND producer.execution_profile_digest='457267c54edd02fcea53eceb92a81cdec9fdaefc8b9231638540b51a85b92491'
          JOIN research.artifacts own ON own.workspace_id=proof.workspace_id AND own.artifact_id=proof.artifact_id
            AND own.run_id=proof.run_id AND own.state='SEALED' AND own.artifact_revision=proof.artifact_revision
            AND own.manifest_digest=proof.manifest_digest
          JOIN research.artifacts original ON original.workspace_id=target.workspace_id
            AND original.artifact_id=target.parent_artifact_id AND original.run_id=root.run_id
            AND original.state='SEALED' AND original.manifest_digest=target.parent_manifest_digest
            AND to_jsonb(original.artifact_revision)=target.target_pins->'parent_artifact_revision'
          WHERE proof.workspace_id=pack.workspace_id AND target.parent_run_id=root.run_id
            AND proof.result->>'parameters_digest'=target.target_pins->>'parameters_digest'
            AND pack.frozen_core#>>'{linked_final_audit,child_run_id}'=proof.run_id
            AND pack.frozen_core#>>'{linked_final_audit,child_attempt_id}'=child.attempt_id
            AND pack.frozen_core#>>'{linked_final_audit,artifact_id}'=proof.artifact_id
            AND pack.frozen_core#>'{linked_final_audit,artifact_revision}'=to_jsonb(proof.artifact_revision)
            AND pack.frozen_core#>>'{linked_final_audit,manifest_digest}'=proof.manifest_digest
            AND pack.frozen_core#>>'{linked_final_audit,result_digest}'=proof.result_digest
            AND pack.frozen_core#>'{linked_final_audit,result}'=proof.result
            AND pack.frozen_core#>'{linked_final_audit,verified_at_utc_ms}'=
              to_jsonb(floor(extract(epoch FROM proof.verified_at)*1000)::bigint)
            AND EXISTS(SELECT 1 FROM jsonb_array_elements(pack.frozen_core->'fields') field
              WHERE field->>'key'='final_audit_run_id' AND field->>'value'=proof.run_id
                AND field#>>'{availability,state}'='AVAILABLE')
        )
      )
  );
$$;
REVOKE ALL ON FUNCTION research.p22_final_audit_source_eligible(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION research.p22_final_audit_source_eligible(text,text,text) TO portal_research_runtime;
COMMENT ON FUNCTION research.p22_final_audit_source_eligible IS
  'Exact parent selection authority: sealed same-run replay reuse or a frozen immutable byte-verified pinned child; never a relationship label alone.';
-- No reverse deletion: disable the lane and retain pinned parent/child bytes.
SELECT 1;
