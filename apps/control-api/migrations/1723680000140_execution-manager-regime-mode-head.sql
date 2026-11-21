-- Up Migration
-- Extend only the finite scoped head vocabulary. Immutable payloads remain in
-- 138 under ONE shared row/actual-JSONB-byte quota; original/Score pointers,
-- PK/FK, source lease and original-head immutability are not changed.
-- No source/worker/command/runtime or approved policy is installed here.
ALTER TABLE execution_manager_score_mode_heads
  DROP CONSTRAINT execution_manager_score_mode_heads_head_kind_check;
ALTER TABLE execution_manager_score_mode_heads
  ADD CONSTRAINT execution_manager_score_mode_heads_head_kind_check
  CHECK (head_kind IN ('ORIGINAL_INPUTS','RESTATED_CURRENT_POLICY','REGIME_RESTATED_CURRENT_POLICY'));
COMMENT ON TABLE execution_manager_score_mode_heads IS
  'Scoped immutable ORIGINAL pointer and independent historical Score/Composition and Regime heads; shared138 quotas, no source checkpoint/ACK/authority';

-- Down Migration
-- Forward-only compatibility extension. Disable compatible consumers first;
-- preserve every immutable payload/pointer and do not rewrite existing rows.
