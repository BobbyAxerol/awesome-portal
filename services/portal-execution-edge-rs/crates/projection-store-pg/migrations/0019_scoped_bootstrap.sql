-- Additive source-dark projection protocol; no TS schema or source admission.
-- Legacy EDS09 dense-stream tables and APIs are intentionally unchanged.
CREATE TABLE portal_projection.bootstrap_streams (
    slot_key TEXT PRIMARY KEY,
    binding_digest TEXT NOT NULL,
    writer_generation UUID NOT NULL,
    active_generation UUID,
    updated_at_ms BIGINT NOT NULL
);
CREATE TABLE portal_projection.bootstrap_generations (
    generation UUID PRIMARY KEY,
    slot_key TEXT NOT NULL REFERENCES portal_projection.bootstrap_streams(slot_key),
    manifest_digest TEXT NOT NULL,
    limits_digest TEXT NOT NULL,
    manifest JSONB NOT NULL,
    state TEXT NOT NULL CHECK (state IN
        ('INITIALIZING','CATCHING_UP','READY','RETAINED','RESYNC_REQUIRED')),
    checkpoint_cursor TEXT NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
    rollback_until_ms BIGINT NOT NULL,
    updated_at_ms BIGINT NOT NULL
);
CREATE TABLE portal_projection.bootstrap_datasets (
    generation UUID NOT NULL REFERENCES portal_projection.bootstrap_generations(generation),
    dataset TEXT NOT NULL,
    completed_pages BIGINT NOT NULL DEFAULT 0 CHECK (completed_pages >= 0),
    page_chain TEXT NOT NULL,
    checkpoint_cursor TEXT NOT NULL,
    PRIMARY KEY (generation,dataset)
);
CREATE TABLE portal_projection.bootstrap_rows (
    generation UUID NOT NULL,
    dataset TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    revision_order BIGINT NOT NULL CHECK (revision_order > 0),
    source_revision TEXT NOT NULL,
    payload_digest TEXT NOT NULL,
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload)='object'),
    tombstoned BOOLEAN NOT NULL DEFAULT FALSE,
    last_operation TEXT NOT NULL CHECK (last_operation IN ('UPSERT','CORRECTION','TOMBSTONE')),
    PRIMARY KEY (generation,dataset,entity_id),
    FOREIGN KEY (generation,dataset)
        REFERENCES portal_projection.bootstrap_datasets(generation,dataset)
);
CREATE TABLE portal_projection.bootstrap_facts (
    generation UUID NOT NULL,
    event_id TEXT NOT NULL,
    dataset TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    event_digest TEXT NOT NULL,
    source_sequence BIGINT NOT NULL CHECK (source_sequence > 0),
    event JSONB NOT NULL,
    PRIMARY KEY (generation,event_id),
    UNIQUE (generation,source_sequence),
    FOREIGN KEY (generation,dataset)
        REFERENCES portal_projection.bootstrap_datasets(generation,dataset)
);
-- Page/entity-revision receipts, pending chunks and post-commit group receipts.
-- REVISION retains a digest guard, not another financial/history ledger.
-- CHUNK payloads are removed only after their immutable facts are committed.
CREATE TABLE portal_projection.bootstrap_inputs (
    generation UUID NOT NULL REFERENCES portal_projection.bootstrap_generations(generation),
    kind TEXT NOT NULL CHECK (kind IN ('PAGE','REVISION','CHUNK','GROUP')),
    input_key TEXT NOT NULL,
    group_id TEXT,
    ordinal BIGINT,
    input_digest TEXT NOT NULL,
    content JSONB NOT NULL,
    receipt_revision BIGINT,
    PRIMARY KEY (generation,kind,input_key),
    CHECK ((kind IN ('PAGE','REVISION') AND group_id IS NULL) OR
           (kind IN ('CHUNK','GROUP') AND group_id IS NOT NULL))
);
CREATE INDEX bootstrap_pending_group ON portal_projection.bootstrap_inputs
    (generation,group_id,ordinal) WHERE kind='CHUNK';
CREATE INDEX bootstrap_visible_rows ON portal_projection.bootstrap_rows
    (generation,dataset,entity_id) WHERE NOT tombstoned;
