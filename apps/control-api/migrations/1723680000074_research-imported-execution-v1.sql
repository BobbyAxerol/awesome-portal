-- E17 / OL-01: one server-installed execution adapter for DRAFT/ACTIVE P07 imports.
--
-- This migration only widens immutable allowlists. It does not install a
-- binding for a DRAFT, enable either runtime feature flag, read source bytes,
-- or alter any existing P04/WFO/what-if producer identity.

DO $$
DECLARE constraint_name text;
BEGIN
  SELECT c.conname INTO constraint_name
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
   WHERE c.conrelid = 'research.execution_adapter_bindings'::regclass
     AND c.contype = 'c'
     AND a.attname = 'adapter_id'
   LIMIT 1;
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE research.execution_adapter_bindings DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE research.execution_adapter_bindings
  ADD CONSTRAINT execution_adapter_bindings_adapter_id_check
    CHECK (adapter_id IN ('p04.delta-rsi.v1', 'p17.imported-signal-notional.v1'));

ALTER TABLE research.execution_adapter_bindings
  ADD CONSTRAINT execution_adapter_bindings_imported_digest_check
    CHECK (adapter_id <> 'p17.imported-signal-notional.v1'
      OR contract_digest = 'b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6');

DO $$
DECLARE constraint_name text;
BEGIN
  SELECT c.conname INTO constraint_name
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
   WHERE c.conrelid = 'research.run_producers'::regclass
     AND c.contype = 'c'
     AND a.attname = 'execution_adapter_id'
   LIMIT 1;
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE research.run_producers DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE research.run_producers
  DROP CONSTRAINT run_producers_execution_profile_id_check,
  DROP CONSTRAINT run_producers_execution_profile_digest_check;

ALTER TABLE research.run_producers
  ADD CONSTRAINT run_producers_execution_adapter_id_check
    CHECK (execution_adapter_id IN ('p04.delta-rsi.v1', 'p17.imported-signal-notional.v1')),
  ADD CONSTRAINT run_producers_execution_profile_id_check
    CHECK (execution_profile_id IN ('p04.fixed-qualification.v1',
                                    'p10.delta-signal-notional-wfo.v1',
                                    'p16.delta-whatif-grid.v1',
                                    'p17.imported-signal-notional.v1')),
  ADD CONSTRAINT run_producers_execution_profile_digest_check
    CHECK (
      (execution_profile_id = 'p04.fixed-qualification.v1' AND execution_profile_digest IS NULL)
      OR (execution_profile_id = 'p10.delta-signal-notional-wfo.v1'
          AND execution_profile_digest IS NOT NULL
          AND execution_profile_digest = 'b86c66fa68c41e76c6106bd06a48b5ba1281bc4b168a915ec2fa7e34ec2a6cca')
      OR (execution_profile_id = 'p16.delta-whatif-grid.v1'
          AND execution_profile_digest IS NOT NULL
          AND execution_profile_digest = '3c29160abf214a0ef1c20c630048442ef131aadc1d00849f69ae428d0ff513bc')
      OR (execution_profile_id = 'p17.imported-signal-notional.v1'
          AND execution_profile_digest IS NOT NULL
          AND execution_profile_digest = 'f1ed5dbccdd90ca7dd35be2755f3b3b5f7e9a29b1641beb08bd0136783c0f298')
    ),
  ADD CONSTRAINT run_producers_imported_adapter_digest_check
    CHECK (execution_adapter_id <> 'p17.imported-signal-notional.v1'
      OR adapter_contract_digest = 'b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6'),
  ADD CONSTRAINT run_producers_imported_adapter_profile_pair_check
    CHECK (
      (execution_adapter_id = 'p17.imported-signal-notional.v1')
      = (execution_profile_id = 'p17.imported-signal-notional.v1')
    );

COMMENT ON CONSTRAINT execution_adapter_bindings_adapter_id_check
  ON research.execution_adapter_bindings IS
  'Only the protected P04 adapter or E17 restricted imported-source adapter may be installed.';
COMMENT ON CONSTRAINT run_producers_imported_adapter_profile_pair_check
  ON research.run_producers IS
  'An imported source always runs through the exact matching restricted E17 profile.';

SELECT 1;
