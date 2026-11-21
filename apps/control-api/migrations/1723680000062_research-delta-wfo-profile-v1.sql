-- W1 (RF-03, Claude): run execution profile + signal-notional RS-02 pair.
--
-- Forward-only and additive. Every existing producer row is the P04 fixed
-- qualification, so the default keeps its identity and its NULL digest; no
-- legacy_request/work_digest byte changes. The only other admitted profile
-- is the locked Delta signal-notional WFO object (design §1.1), pinned by
-- its canonical digest. Both columns join the immutable producer identity.

ALTER TABLE research.run_producers
  ADD COLUMN execution_profile_id text NOT NULL DEFAULT 'p04.fixed-qualification.v1',
  ADD COLUMN execution_profile_digest text NULL;

ALTER TABLE research.run_producers
  ADD CONSTRAINT run_producers_execution_profile_id_check
    CHECK (execution_profile_id IN ('p04.fixed-qualification.v1', 'p10.delta-signal-notional-wfo.v1')),
  ADD CONSTRAINT run_producers_execution_profile_digest_check
    CHECK (
      (execution_profile_id = 'p04.fixed-qualification.v1' AND execution_profile_digest IS NULL)
      OR (execution_profile_id = 'p10.delta-signal-notional-wfo.v1'
          AND execution_profile_digest IS NOT NULL
          AND execution_profile_digest = 'b86c66fa68c41e76c6106bd06a48b5ba1281bc4b168a915ec2fa7e34ec2a6cca')
    );

CREATE OR REPLACE FUNCTION research.protect_run_producer_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.run_id IS DISTINCT FROM OLD.run_id
     OR NEW.attempt_id IS DISTINCT FROM OLD.attempt_id
     OR NEW.job_id IS DISTINCT FROM OLD.job_id
     OR NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id
     OR NEW.client_intent_id IS DISTINCT FROM OLD.client_intent_id
     OR NEW.intent_kind IS DISTINCT FROM OLD.intent_kind
     OR NEW.preflight_token IS DISTINCT FROM OLD.preflight_token
     OR NEW.alpha_id IS DISTINCT FROM OLD.alpha_id
     OR NEW.alpha_version_id IS DISTINCT FROM OLD.alpha_version_id
     OR NEW.execution_adapter_id IS DISTINCT FROM OLD.execution_adapter_id
     OR NEW.adapter_contract_digest IS DISTINCT FROM OLD.adapter_contract_digest
     OR NEW.execution_profile_id IS DISTINCT FROM OLD.execution_profile_id
     OR NEW.execution_profile_digest IS DISTINCT FROM OLD.execution_profile_digest
     OR NEW.requested_spec_digest IS DISTINCT FROM OLD.requested_spec_digest
     OR NEW.effective_spec_digest IS DISTINCT FROM OLD.effective_spec_digest
     OR NEW.dataset_binding_digest IS DISTINCT FROM OLD.dataset_binding_digest
     OR NEW.manifest_digest IS DISTINCT FROM OLD.manifest_digest
     OR NEW.snapshot_id IS DISTINCT FROM OLD.snapshot_id
     OR NEW.snapshot_content_hash IS DISTINCT FROM OLD.snapshot_content_hash
     OR NEW.work_digest IS DISTINCT FROM OLD.work_digest
     OR NEW.legacy_request IS DISTINCT FROM OLD.legacy_request THEN
    RAISE EXCEPTION 'research run producer identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION research.protect_run_producer_identity() FROM PUBLIC;

COMMENT ON COLUMN research.run_producers.execution_profile_id IS
  'W1 immutable run execution profile; p04.fixed-qualification.v1 keeps the historical P04 wire unchanged.';
COMMENT ON COLUMN research.run_producers.execution_profile_digest IS
  'Canonical digest of the locked WFO profile object; NULL exactly for the P04 fixed qualification.';

-- RS-02 now admits exactly two (source adapter, profile) pairs. The single-
-- value column checks from 051 are replaced by one paired check so a seal
-- can never mix the Advanced-WFO adapter with the signal-notional profile.
ALTER TABLE research.current_source_seals_v1
  DROP CONSTRAINT current_source_seals_v1_source_adapter_id_check,
  DROP CONSTRAINT current_source_seals_v1_profile_id_check;

ALTER TABLE research.current_source_seals_v1
  ADD CONSTRAINT current_source_seals_v1_source_profile_pair_check
    CHECK (
      (source_adapter_id = 'rs02.quantbt-advanced-wfo.v1' AND profile_id = 'rs02.delta-wfo-global.v1')
      OR (source_adapter_id = 'rs02.quantbt-signal-notional-wfo.v1' AND profile_id = 'rs02.delta-signal-notional-wfo.v1')
    );

COMMENT ON CONSTRAINT current_source_seals_v1_source_profile_pair_check
  ON research.current_source_seals_v1 IS
  'W1: Advanced-WFO pct_equity pair or the signal-notional WFO pair; never a mixed pair.';

SELECT 1;
