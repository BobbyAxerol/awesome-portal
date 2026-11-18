-- Source-dark Research read side only. No Trading System/publication mutation.
-- Complete ordered membership is recorded with the existing atomic group COMMIT.
ALTER TABLE portal_projection.bootstrap_inputs
    ADD COLUMN event_refs_complete BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN event_refs JSONB NOT NULL DEFAULT '[]'::jsonb;
CREATE TABLE portal_projection.bootstrap_group_facts (
    generation UUID NOT NULL,
    group_id TEXT NOT NULL,
    ordinal BIGINT NOT NULL CHECK (ordinal >= 0),
    event_id TEXT NOT NULL,
    PRIMARY KEY (generation,group_id,ordinal),
    FOREIGN KEY (generation,event_id)
        REFERENCES portal_projection.bootstrap_facts(generation,event_id)
);
CREATE INDEX bootstrap_group_replay ON portal_projection.bootstrap_inputs
    (generation,receipt_revision) WHERE kind='GROUP';
CREATE INDEX bootstrap_fact_history ON portal_projection.bootstrap_facts
    (generation,dataset,((event->'event'->>'event_time_ms')::bigint),source_sequence);
CREATE INDEX bootstrap_fact_entity_history ON portal_projection.bootstrap_facts
    (generation,dataset,entity_id,((event->'event'->>'event_time_ms')::bigint),source_sequence);
-- A monotonic local ingestion cut protects immutable history paging even while
-- older backfill facts arrive. This is NOT a source ordering/coverage claim.
ALTER TABLE portal_projection.bootstrap_facts
    ADD COLUMN read_ingest_order BIGINT GENERATED ALWAYS AS IDENTITY;
CREATE UNIQUE INDEX bootstrap_fact_read_ingest_order ON portal_projection.bootstrap_facts
    (generation,read_ingest_order);
CREATE TABLE portal_projection.scoped_read_cursors (
    cursor_id UUID PRIMARY KEY,
    context_digest TEXT NOT NULL,
    scope_digest TEXT NOT NULL,
    generation UUID NOT NULL REFERENCES portal_projection.bootstrap_generations(generation),
    state JSONB NOT NULL CHECK (jsonb_typeof(state)='object'),
    expires_at_ms BIGINT NOT NULL,
    CHECK (octet_length(state::text) <= 8192)
);
CREATE INDEX scoped_read_cursor_expiry ON portal_projection.scoped_read_cursors(expires_at_ms);
CREATE INDEX scoped_read_cursor_scope ON portal_projection.scoped_read_cursors(scope_digest);
-- Cursor issuance only holds this row briefly, not during a history query.
CREATE TABLE portal_projection.scoped_read_cursor_budget (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton)
);
INSERT INTO portal_projection.scoped_read_cursor_budget(singleton) VALUES (TRUE);
