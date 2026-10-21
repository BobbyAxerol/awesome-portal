-- BE-P16 CR-02 (Execution Loop V2, ELP2-05/06): revision-scoped repair retry budget.
-- Additive: one new column on the existing writer checkpoint, with a default. No existing column, constraint, writer, view or index changes;
-- migrations 145-147 are untouched.
--
-- Why: the bounded repair of a revision whose series write was refused counted its attempts in last_error_code / last_error_revision. Those two
-- columns are a single mutable diagnostic: a later live failure for ANOTHER revision overwrote them and reset the budget of the revision still being
-- repaired, so interleaved failures could starve every hole behind them. The budget now lives here, keyed by revision, independent of the diagnostic.
--
-- Shape: a JSON array of {"revision": text, "attempts": 1..2} - the repair refusals ALREADY spent on a revision that is still being repaired. An
-- entry exists only between the first refused repair and the repair succeeding, the live write succeeding, or the revision becoming a stated gap
-- (the third refusal); every one of those exits removes it. The array is hard-capped at 16 entries (the application evicts the oldest, which can
-- only restart that revision's budget). Mutable by design (it is writer state, like the cursor), and written only inside the lease-fenced Manager
-- transaction. The observation and revision tables stay append-only.
-- Up Migration
ALTER TABLE execution_manager_series_checkpoints
  ADD COLUMN repair_attempts jsonb NOT NULL DEFAULT '[]'::jsonb
  CONSTRAINT execution_manager_series_repair_attempts_bounded CHECK (jsonb_typeof(repair_attempts)='array' AND jsonb_array_length(repair_attempts) <= 16);

COMMENT ON COLUMN execution_manager_series_checkpoints.repair_attempts IS
  'Revision-scoped retry budget of the bounded series repair ([{revision,attempts}], max 16); cleared per revision on repair, live write or stated gap; not a diagnostic';

-- Down Migration
-- Keep the column: it is writer state of a retained checkpoint. No automatic destructive rollback; ignoring it restores the old single-diagnostic behaviour.
