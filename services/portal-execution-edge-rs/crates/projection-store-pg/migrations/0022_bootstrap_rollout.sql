-- Additive control metadata only. AUTO retains the existing bootstrap contract.
-- Rollback selects a retained read generation, never rewinds facts or writers.
ALTER TABLE portal_projection.bootstrap_generations
    ADD COLUMN rollout_state text NOT NULL DEFAULT 'AUTO'
        CHECK (rollout_state IN ('AUTO','SHADOW','ACTIVE','ROLLED_BACK')),
    ADD COLUMN rollback_generation uuid REFERENCES portal_projection.bootstrap_generations(generation),
    ADD COLUMN history_revision bigint NOT NULL DEFAULT 0 CHECK (history_revision >= 0);
