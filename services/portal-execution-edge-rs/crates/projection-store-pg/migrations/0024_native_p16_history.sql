-- Native P16 retained observations only. This is NOT a current-state projection,
-- a source permit, an admission grant or a replacement for bootstrap authority.
CREATE TABLE portal_projection.native_p16_streams (
    slot_key TEXT PRIMARY KEY,
    binding_digest TEXT NOT NULL,
    selection_digest TEXT NOT NULL,
    observed_from_sequence BIGINT NOT NULL CHECK (observed_from_sequence >= 0),
    checkpoint_sequence BIGINT NOT NULL CHECK (checkpoint_sequence >= observed_from_sequence),
    retention_floor BIGINT NOT NULL CHECK (retention_floor > 0),
    published_head BIGINT NOT NULL CHECK (published_head >= checkpoint_sequence),
    last_commit_lsn PG_LSN,
    last_commit_group_index BIGINT,
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
    recorded_at_ms BIGINT NOT NULL,
    CHECK ((last_commit_lsn IS NULL) = (last_commit_group_index IS NULL))
);
CREATE TABLE portal_projection.native_p16_facts (
    slot_key TEXT NOT NULL REFERENCES portal_projection.native_p16_streams(slot_key),
    source_sequence BIGINT NOT NULL CHECK (source_sequence > 0),
    source_event_id UUID NOT NULL,
    business_event_id UUID NOT NULL,
    event_revision BIGINT NOT NULL CHECK (event_revision > 0),
    dataset TEXT NOT NULL,
    event_digest TEXT NOT NULL,
    -- Exact typed native bytes, avoiding JSONB numeric normalization. No
    -- nullable timestamp, SEMANTIC_FACT or monetary decimal is rewritten.
    event_bytes BYTEA NOT NULL CHECK (octet_length(event_bytes) <= 8388608),
    PRIMARY KEY (slot_key,source_sequence),
    UNIQUE (slot_key,source_event_id),
    UNIQUE (slot_key,business_event_id,event_revision)
);
CREATE INDEX native_p16_dataset_history ON portal_projection.native_p16_facts
    (slot_key,dataset,source_sequence);
CREATE TABLE portal_projection.native_p16_scans (
    slot_key TEXT NOT NULL REFERENCES portal_projection.native_p16_streams(slot_key),
    after_sequence BIGINT NOT NULL CHECK (after_sequence >= 0),
    through_sequence BIGINT NOT NULL CHECK (through_sequence >= after_sequence),
    input_digest TEXT NOT NULL,
    receipt_revision BIGINT NOT NULL CHECK (receipt_revision > 0),
    recorded_at_ms BIGINT NOT NULL,
    PRIMARY KEY (slot_key,after_sequence,through_sequence)
);
