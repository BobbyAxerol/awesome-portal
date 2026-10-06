-- FULL-02 exact new identities. Never rewrite legacy descriptors, requests or seals.
ALTER TABLE research.run_producers
  DROP CONSTRAINT run_producers_execution_profile_id_check,
  DROP CONSTRAINT run_producers_execution_profile_digest_check,
  DROP CONSTRAINT run_producers_diagnostic_profile_pair_check;
ALTER TABLE research.run_producers
  ADD CONSTRAINT run_producers_execution_profile_id_check CHECK(execution_profile_id IN (
    'p04.fixed-qualification.v1','p10.delta-signal-notional-wfo.v1','p10.delta-signal-notional-wfo.v2',
    'p10.delta-signal-notional-causal-inner.v1','p10.vn-stock-daily-observed-fixed.v1',
    'p16.delta-whatif-grid.v1','p17.imported-signal-notional.v1','p23.delta-pinned-final-audit.v1','p10.delta-signal-notional-per-fold-decay.v1','p10.delta-signal-notional-three-window-optimized.v1')),
  ADD CONSTRAINT run_producers_execution_profile_digest_check CHECK(
    (execution_profile_id='p04.fixed-qualification.v1' AND execution_profile_digest IS NULL)
    OR (execution_profile_id='p10.delta-signal-notional-wfo.v1' AND execution_profile_digest='b86c66fa68c41e76c6106bd06a48b5ba1281bc4b168a915ec2fa7e34ec2a6cca' AND execution_profile_digest IS NOT NULL)
    OR (execution_profile_id='p10.delta-signal-notional-wfo.v2' AND execution_profile_digest='d65291f776dce1fef162da9eb6505ba63fc6e3ae0f55679fe12dece3858c7fa0' AND execution_profile_digest IS NOT NULL)
    OR (execution_profile_id='p10.delta-signal-notional-causal-inner.v1' AND execution_profile_digest='60a041b373808405f8896aee0a3421d41cc2199d516dadc9f40e1187e2fefdd1' AND execution_profile_digest IS NOT NULL)
    OR (execution_profile_id='p10.vn-stock-daily-observed-fixed.v1' AND execution_profile_digest='acb6566ebae23bcf77c77974136c9d083a95f0967260b1332530f600f5abe00e' AND execution_profile_digest IS NOT NULL)
    OR (execution_profile_id='p16.delta-whatif-grid.v1' AND execution_profile_digest='3c29160abf214a0ef1c20c630048442ef131aadc1d00849f69ae428d0ff513bc' AND execution_profile_digest IS NOT NULL)
    OR (execution_profile_id='p17.imported-signal-notional.v1' AND execution_profile_digest='f1ed5dbccdd90ca7dd35be2755f3b3b5f7e9a29b1641beb08bd0136783c0f298' AND execution_profile_digest IS NOT NULL)
    OR (execution_profile_id='p23.delta-pinned-final-audit.v1' AND execution_profile_digest='457267c54edd02fcea53eceb92a81cdec9fdaefc8b9231638540b51a85b92491' AND execution_profile_digest IS NOT NULL)
    OR (execution_profile_id='p10.delta-signal-notional-per-fold-decay.v1' AND execution_profile_digest='60ae004f65b0eba83ce12089b0224ab467b30a9acc4161ad0787108344cd134e' AND execution_profile_digest IS NOT NULL)
    OR (execution_profile_id='p10.delta-signal-notional-three-window-optimized.v1' AND execution_profile_digest='0e210afa7c891cfb93e78126a4ca86fb6c1a25d3bcb4d8d81a5534accb5ee3c9' AND execution_profile_digest IS NOT NULL)),
  ADD CONSTRAINT run_producers_diagnostic_profile_pair_check CHECK(
    (intent_kind='DIAGNOSTIC')=(execution_profile_id IN ('p16.delta-whatif-grid.v1','p23.delta-pinned-final-audit.v1')));

ALTER TABLE research.current_source_seals_v1 DROP CONSTRAINT current_source_seals_v1_source_profile_pair_check;
ALTER TABLE research.current_source_seals_v1 ADD CONSTRAINT current_source_seals_v1_source_profile_pair_check CHECK (
 (source_adapter_id='rs02.quantbt-advanced-wfo.v1' AND profile_id='rs02.delta-wfo-global.v1')
 OR (source_adapter_id='rs02.quantbt-signal-notional-wfo.v1' AND profile_id='rs02.delta-signal-notional-wfo.v1')
 OR (source_adapter_id='rs02.quantbt-signal-notional-causal-inner.v1' AND profile_id='rs02.delta-signal-notional-causal-inner.v1')
 OR (source_adapter_id='full02.quantbt-signal-notional-per-fold-decay.v1' AND profile_id='full02.delta-signal-notional-per-fold-decay.v1')
 OR (source_adapter_id='full02.quantbt-signal-notional-three-window.v1' AND profile_id='full02.delta-signal-notional-three-window.v1'));

ALTER TABLE research.execution_recipe_qualifications_v1
 DROP CONSTRAINT execution_recipe_qualifications_v1_kind_check,
 DROP CONSTRAINT execution_recipe_qualifications_v1_state_check,
 DROP CONSTRAINT execution_recipe_qualifications_v1_scope_check,
 ALTER COLUMN receipt_path DROP NOT NULL,
 ALTER COLUMN receipt_sha256 DROP NOT NULL;
ALTER TABLE research.execution_recipe_qualifications_v1
 ADD CONSTRAINT execution_recipe_qualifications_v1_kind_check CHECK(kind IN('LEGACY_COMPATIBILITY_REFERENCE','CANDIDATE_NOT_QUALIFIED')),
 ADD CONSTRAINT execution_recipe_qualifications_v1_state_check CHECK(state IN('QUALIFIED','CANDIDATE')),
 ADD CONSTRAINT execution_recipe_qualifications_v1_scope_check CHECK(scope IN('ORIGINAL_RECEIPT_SCOPE_ONLY','OWNER_CELL_ONLY_NOT_PRODUCT_AUTHORITY')),
 ADD CONSTRAINT execution_recipe_qualifications_v1_state_receipt_check CHECK(
   (kind='LEGACY_COMPATIBILITY_REFERENCE' AND state='QUALIFIED' AND receipt_path IS NOT NULL AND receipt_sha256 IS NOT NULL AND scope='ORIGINAL_RECEIPT_SCOPE_ONLY')
   OR (kind='CANDIDATE_NOT_QUALIFIED' AND state='CANDIDATE' AND receipt_path IS NULL AND receipt_sha256 IS NULL AND scope='OWNER_CELL_ONLY_NOT_PRODUCT_AUTHORITY'));

-- Qualification is a new immutable fact appended after product proof, not an
-- UPDATE to a candidate descriptor or a retroactive qualification of old runs.
CREATE TABLE research.execution_recipe_product_receipts_v1 (
 recipe_digest text PRIMARY KEY REFERENCES research.execution_recipe_descriptors_v1(recipe_digest),
 receipt_path text NOT NULL CHECK(receipt_path~'^upgrade/research_loop/evidence/' AND length(receipt_path)<=256),
 receipt_sha256 text NOT NULL CHECK(receipt_sha256~'^[a-f0-9]{64}$'),
 scope text NOT NULL CHECK(scope='EXACT_PROFILE_PRODUCT_RUN'),
 created_at timestamptz NOT NULL DEFAULT now());
CREATE TRIGGER execution_recipe_product_receipts_v1_immutable BEFORE UPDATE OR DELETE ON research.execution_recipe_product_receipts_v1
 FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();
REVOKE ALL ON research.execution_recipe_product_receipts_v1 FROM PUBLIC,portal_research_runtime;
GRANT SELECT ON research.execution_recipe_product_receipts_v1 TO portal_research_runtime;
INSERT INTO research.execution_recipe_descriptors_v1(profile_id,profile_digest,recipe_digest,descriptor,policy) VALUES('p10.delta-signal-notional-per-fold-decay.v1','60ae004f65b0eba83ce12089b0224ab467b30a9acc4161ad0787108344cd134e','7a208ce129e15bd1fdb6f4d411b2061ae8a1e54ab6a421a19b6e09e5e7e79716','{"schema_version":"research.p10.delta-per-fold-decay-profile.v1","profile_id":"p10.delta-signal-notional-per-fold-decay.v1","adapter_id":"p04.delta-rsi.v1","adapter_contract_digest":"9ade757b5c1cd87681a2efb49011c84a96211939710dcd32c9fd1c7777e95784","engine_release_id":"er_quantbt_111","requested_spec_version":"research.requested-spec.v2","execution_route":"signal_notional","protocol":"advanced","timeframe":"1h","frequencies":["weekly","monthly","quarterly"],"window_modes":["expanding","rolling"],"max_span_days":92,"fold_bounds":{"min":2,"max":16},"optimization_mode":"mode_1_decay","optimization_schedule":"per_fold_decay","random_seed":42,"max_guard_bars":10000,"inner_validation":"NOT_ADMITTED_GLOBAL_RETENTION_ONLY","trial_count":{"min":3,"max":3},"current_source":{"source_adapter_id":"full02.quantbt-signal-notional-per-fold-decay.v1","profile_id":"full02.delta-signal-notional-per-fold-decay.v1"},"child_limits":{"cpu_seconds":120,"wall_seconds":240},"trial_scope":"PER_OUTER_FOLD_STUDY","max_total_trials":48}'::jsonb,'{"profile_id":"p10.delta-signal-notional-per-fold-decay.v1","profile_digest":"60ae004f65b0eba83ce12089b0224ab467b30a9acc4161ad0787108344cd134e","adapter_kind":"DELTA_WFO","work_schema_version":"research.p10.delta-per-fold-decay-work.v1","resource_class":"p10-delta-wfo-v1","queue_class":"HEAVY","public_profile":{"profile_id":"p10.delta-signal-notional-per-fold-decay.v1","engine_release_id":"er_quantbt_111","execution_route":"signal_notional","protocol":"advanced","optimization_mode":"mode_1_decay","optimization_schedule":"per_fold_decay","timeframe":"1h","random_seed":42,"trial_count":{"min":3,"max":3},"max_span_days":92,"fold_bounds":{"min":2,"max":16},"frequency":null,"window_mode":null,"frequencies":["weekly","monthly","quarterly"],"window_modes":["expanding","rolling"],"requested_spec_versions":["research.requested-spec.v2"],"seed_policy":"LOCKED","trial_default":3,"early_stopping_policy":"FORBIDDEN","inner_validation":"NOT_ADMITTED_GLOBAL_RETENTION_ONLY","trial_scope":"PER_OUTER_FOLD_STUDY","max_total_trials":48},"feature_flags":["FEATURE_RESEARCH_RUN_PRODUCER","FEATURE_RESEARCH_WFO_PROFILE","FEATURE_RESEARCH_FULL02_PROFILE"],"source_requirement":"IMMUTABLE_DELTA_BINDING","budgets":{"memory_bytes":4294967296,"cpu_seconds":120,"wall_seconds":240,"scratch_bytes":134217728,"io_bytes":536870912,"file_bytes":16777216,"fd_limit":128,"planning_max_bars":100000,"max_warmup_bars":100000},"preview_override":null}'::jsonb);
INSERT INTO research.execution_recipe_qualifications_v1(recipe_digest,kind,state,receipt_path,receipt_sha256,scope) VALUES('7a208ce129e15bd1fdb6f4d411b2061ae8a1e54ab6a421a19b6e09e5e7e79716','CANDIDATE_NOT_QUALIFIED','CANDIDATE',NULL,NULL,'OWNER_CELL_ONLY_NOT_PRODUCT_AUTHORITY');
INSERT INTO research.execution_recipe_descriptors_v1(profile_id,profile_digest,recipe_digest,descriptor,policy) VALUES('p10.delta-signal-notional-three-window-optimized.v1','0e210afa7c891cfb93e78126a4ca86fb6c1a25d3bcb4d8d81a5534accb5ee3c9','b1c678862ac808ad159dfe552d4b4c7c200aeb0016efca03b33765042f93b993','{"schema_version":"research.p10.delta-three-window-optimized-profile.v1","profile_id":"p10.delta-signal-notional-three-window-optimized.v1","adapter_id":"p04.delta-rsi.v1","adapter_contract_digest":"9ade757b5c1cd87681a2efb49011c84a96211939710dcd32c9fd1c7777e95784","engine_release_id":"er_quantbt_111","requested_spec_version":"research.requested-spec.v1","execution_route":"signal_notional","protocol":"three_window_decay","timeframe":"1h","optimization_mode":"mode_1_decay","optimization_schedule":"global","random_seed":42,"max_span_days":92,"trial_count":{"min":3,"max":3},"trial_scope":"GLOBAL_STUDY","independent_holdout":true,"current_source":{"source_adapter_id":"full02.quantbt-signal-notional-three-window.v1","profile_id":"full02.delta-signal-notional-three-window.v1"},"child_limits":{"cpu_seconds":120,"wall_seconds":240}}'::jsonb,'{"profile_id":"p10.delta-signal-notional-three-window-optimized.v1","profile_digest":"0e210afa7c891cfb93e78126a4ca86fb6c1a25d3bcb4d8d81a5534accb5ee3c9","adapter_kind":"DELTA_THREE_WINDOW_OPTIMIZED","work_schema_version":"research.p10.delta-three-window-optimized-work.v1","resource_class":"p10-delta-wfo-v1","queue_class":"HEAVY","public_profile":{"profile_id":"p10.delta-signal-notional-three-window-optimized.v1","engine_release_id":"er_quantbt_111","execution_route":"signal_notional","protocol":"three_window_decay","optimization_mode":"mode_1_decay","optimization_schedule":"global","timeframe":"1h","trial_count":{"min":3,"max":3},"random_seed":42,"max_span_days":92,"fold_bounds":null,"frequency":null,"window_mode":null,"requested_spec_versions":["research.requested-spec.v1"],"seed_policy":"LOCKED","trial_default":3,"early_stopping_policy":"FORBIDDEN"},"feature_flags":["FEATURE_RESEARCH_RUN_PRODUCER","FEATURE_RESEARCH_WFO_PROFILE","FEATURE_RESEARCH_FULL02_PROFILE"],"source_requirement":"IMMUTABLE_DELTA_BINDING","budgets":{"memory_bytes":4294967296,"cpu_seconds":120,"wall_seconds":240,"scratch_bytes":134217728,"io_bytes":536870912,"file_bytes":16777216,"fd_limit":128,"planning_max_bars":100000,"max_warmup_bars":100000},"preview_override":null}'::jsonb);
INSERT INTO research.execution_recipe_qualifications_v1(recipe_digest,kind,state,receipt_path,receipt_sha256,scope) VALUES('b1c678862ac808ad159dfe552d4b4c7c200aeb0016efca03b33765042f93b993','CANDIDATE_NOT_QUALIFIED','CANDIDATE',NULL,NULL,'OWNER_CELL_ONLY_NOT_PRODUCT_AUTHORITY');
CREATE OR REPLACE FUNCTION research.run_library_display_kind(profile_id text)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,research AS $$
 SELECT CASE profile_id
 WHEN 'p04.fixed-qualification.v1' THEN 'P04'
 WHEN 'p10.vn-stock-daily-observed-fixed.v1' THEN 'VN'
 WHEN 'p10.delta-signal-notional-wfo.v1' THEN 'WFO'
 WHEN 'p10.delta-signal-notional-wfo.v2' THEN 'WFO'
 WHEN 'p10.delta-signal-notional-causal-inner.v1' THEN 'WFO'
 WHEN 'p10.delta-signal-notional-per-fold-decay.v1' THEN 'WFO'
 WHEN 'p10.delta-signal-notional-three-window-optimized.v1' THEN 'OPT'
 END; $$;
SELECT 1;
