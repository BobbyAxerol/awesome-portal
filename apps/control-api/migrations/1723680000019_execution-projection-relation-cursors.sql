-- P4-D follow-on (owner-approved 2026-09-03): resumable time-series drains.
--
-- The Manager read plane pages every relation by ascending keyset from the
-- very first row, and the projection worker restarted from the beginning on
-- every cycle — so an append-only time-series relation with hundreds of
-- thousands of rows could never surface its recent rows (the worker ate the
-- same oldest page window forever, and the 30-day ladder rightly discarded
-- it). This table persists the per-relation source cursor so each cycle
-- continues where the last one stopped; reaching the tail clears the cursor
-- and the next cycle starts a fresh full pass.
CREATE TABLE execution_profile_relation_cursors (
    workspace_id     text        NOT NULL,
    environment      text        NOT NULL CHECK (environment IN ('paper','sandbox','live')),
    profile_id       text        NOT NULL,
    relation_key     text        NOT NULL,
    source_cursor    text,
    pass_started_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (workspace_id, environment, profile_id, relation_key)
);
