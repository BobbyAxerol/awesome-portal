-- Add a new immutable temporal profile; never rewrite the W1 profile or rows.
ALTER TABLE research.run_producers
  DROP CONSTRAINT run_producers_execution_profile_id_check,
  DROP CONSTRAINT run_producers_execution_profile_digest_check;
ALTER TABLE research.run_producers
  ADD CONSTRAINT run_producers_execution_profile_id_check CHECK (execution_profile_id IN (
    'p04.fixed-qualification.v1', 'p10.delta-signal-notional-wfo.v1',
    'p10.delta-signal-notional-wfo.v2', 'p16.delta-whatif-grid.v1', 'p17.imported-signal-notional.v1')),
  ADD CONSTRAINT run_producers_execution_profile_digest_check CHECK (
    (execution_profile_id = 'p04.fixed-qualification.v1' AND execution_profile_digest IS NULL)
    OR (execution_profile_id = 'p10.delta-signal-notional-wfo.v1' AND execution_profile_digest IS NOT NULL AND execution_profile_digest = 'b86c66fa68c41e76c6106bd06a48b5ba1281bc4b168a915ec2fa7e34ec2a6cca')
    OR (execution_profile_id = 'p10.delta-signal-notional-wfo.v2' AND execution_profile_digest IS NOT NULL AND execution_profile_digest = 'd65291f776dce1fef162da9eb6505ba63fc6e3ae0f55679fe12dece3858c7fa0')
    OR (execution_profile_id = 'p16.delta-whatif-grid.v1' AND execution_profile_digest IS NOT NULL AND execution_profile_digest = '3c29160abf214a0ef1c20c630048442ef131aadc1d00849f69ae428d0ff513bc')
    OR (execution_profile_id = 'p17.imported-signal-notional.v1' AND execution_profile_digest IS NOT NULL AND execution_profile_digest = 'f1ed5dbccdd90ca7dd35be2755f3b3b5f7e9a29b1641beb08bd0136783c0f298'));
