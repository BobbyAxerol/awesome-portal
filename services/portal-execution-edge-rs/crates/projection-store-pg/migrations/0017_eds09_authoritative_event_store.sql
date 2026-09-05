-- EDS-09: provider-neutral authoritative snapshot+tail append store.
--
-- This is a Portal-owned, source-dark storage foundation.  It has no source
-- endpoint, credential, listener or activation flag.  A writer can use it only
-- after authoritative-event-core has admitted a separately accepted source
-- contract and has staged one non-forgeable PendingAppend.

CREATE TABLE portal_projection.authoritative_event_streams (
    stream_binding_digest TEXT PRIMARY KEY
      CHECK (stream_binding_digest ~ '^sha256:[0-9a-f]{64}$'),
    stream_id TEXT NOT NULL CHECK (stream_id ~ '^[A-Za-z0-9._:-]{1,160}$'),
    contract_revision TEXT NOT NULL CHECK (contract_revision ~ '^[A-Za-z0-9._:-]{1,160}$'),
    workspace_id TEXT NOT NULL CHECK (workspace_id ~ '^[A-Za-z0-9._:-]{1,160}$'),
    environment TEXT NOT NULL CHECK (environment IN ('paper', 'sandbox', 'live')),
    profile_id TEXT NOT NULL CHECK (profile_id ~ '^[A-Za-z0-9._:-]{1,160}$'),
    venue_id TEXT NOT NULL CHECK (venue_id ~ '^[A-Za-z0-9._:-]{1,160}$'),
    resource_kind TEXT NOT NULL CHECK (resource_kind ~ '^[A-Za-z0-9._:-]{1,160}$'),
    resource_id TEXT NOT NULL CHECK (resource_id ~ '^[A-Za-z0-9._:-]{1,160}$'),
    filter_digest TEXT NOT NULL CHECK (filter_digest ~ '^sha256:[0-9a-f]{64}$'),
    contract_digest TEXT NOT NULL CHECK (contract_digest ~ '^sha256:[0-9a-f]{64}$'),
    owner_return_digest TEXT NOT NULL CHECK (owner_return_digest ~ '^sha256:[0-9a-f]{64}$'),
    runtime_evidence_digest TEXT NOT NULL CHECK (runtime_evidence_digest ~ '^sha256:[0-9a-f]{64}$'),
    transport_contract_digest TEXT NOT NULL CHECK (transport_contract_digest ~ '^sha256:[0-9a-f]{64}$'),
    local_storage_policy_digest TEXT NOT NULL CHECK (local_storage_policy_digest ~ '^sha256:[0-9a-f]{64}$'),
    current_generation_id UUID,
    active_generation_id UUID,
    state TEXT NOT NULL CHECK (state IN ('SNAPSHOT_BACKFILL', 'TAIL_READY', 'RESNAPSHOT_REQUIRED')),
    created_at_ms BIGINT NOT NULL,
    updated_at_ms BIGINT NOT NULL,
    CHECK (updated_at_ms >= created_at_ms)
);

CREATE INDEX idx_authoritative_event_streams_scope
  ON portal_projection.authoritative_event_streams
  (workspace_id, environment, profile_id, stream_id);

CREATE TABLE portal_projection.authoritative_event_generations (
    generation_id UUID PRIMARY KEY,
    stream_binding_digest TEXT NOT NULL
      REFERENCES portal_projection.authoritative_event_streams(stream_binding_digest)
      ON DELETE RESTRICT,
    source_epoch TEXT NOT NULL CHECK (source_epoch ~ '^[A-Za-z0-9._:-]{1,160}$'),
    snapshot_id TEXT NOT NULL CHECK (snapshot_id ~ '^[A-Za-z0-9._:-]{1,160}$'),
    snapshot_as_of_ms BIGINT NOT NULL,
    high_watermark_sequence TEXT NOT NULL
      CHECK (high_watermark_sequence ~ '^(0|[1-9][0-9]{0,19})$'),
    retention_floor_sequence TEXT NOT NULL
      CHECK (retention_floor_sequence ~ '^(0|[1-9][0-9]{0,19})$'),
    committed_source_sequence TEXT
      CHECK (committed_source_sequence IS NULL OR committed_source_sequence ~ '^[1-9][0-9]{0,19}$'),
    committed_revision BIGINT NOT NULL DEFAULT 0 CHECK (committed_revision >= 0),
    state TEXT NOT NULL CHECK (state IN ('SNAPSHOT_BACKFILL', 'TAIL_READY', 'RESNAPSHOT_REQUIRED')),
    resnapshot_reason_code TEXT,
    created_at_ms BIGINT NOT NULL,
    updated_at_ms BIGINT NOT NULL,
    CHECK (high_watermark_sequence::numeric >= retention_floor_sequence::numeric),
    CHECK (updated_at_ms >= created_at_ms),
    CHECK (
      (state = 'RESNAPSHOT_REQUIRED' AND resnapshot_reason_code IS NOT NULL)
      OR (state <> 'RESNAPSHOT_REQUIRED' AND resnapshot_reason_code IS NULL)
    ),
    UNIQUE (stream_binding_digest, source_epoch, snapshot_id)
);

CREATE INDEX idx_authoritative_event_generations_latest
  ON portal_projection.authoritative_event_generations
  (stream_binding_digest, updated_at_ms DESC, generation_id);

CREATE TABLE portal_projection.authoritative_event_batches (
    generation_id UUID NOT NULL
      REFERENCES portal_projection.authoritative_event_generations(generation_id)
      ON DELETE RESTRICT,
    batch_digest TEXT NOT NULL CHECK (batch_digest ~ '^sha256:[0-9a-f]{64}$'),
    lane TEXT NOT NULL CHECK (lane IN ('HISTORY_BACKFILL', 'CURRENT', 'LIVE_TAIL')),
    first_source_sequence TEXT NOT NULL
      CHECK (first_source_sequence ~ '^[1-9][0-9]{0,19}$'),
    final_source_sequence TEXT NOT NULL
      CHECK (final_source_sequence ~ '^[1-9][0-9]{0,19}$'),
    record_count INTEGER NOT NULL CHECK (record_count > 0 AND record_count <= 200),
    committed_revision BIGINT NOT NULL CHECK (committed_revision > 0),
    source_read_at_ms BIGINT NOT NULL,
    committed_at_ms BIGINT NOT NULL,
    PRIMARY KEY (generation_id, batch_digest),
    UNIQUE (generation_id, committed_revision),
    CHECK (final_source_sequence::numeric >= first_source_sequence::numeric)
);

CREATE INDEX idx_authoritative_event_batches_commit
  ON portal_projection.authoritative_event_batches
  (generation_id, committed_revision);

CREATE TABLE portal_projection.authoritative_event_facts (
    generation_id UUID NOT NULL
      REFERENCES portal_projection.authoritative_event_generations(generation_id)
      ON DELETE RESTRICT,
    source_epoch TEXT NOT NULL CHECK (source_epoch ~ '^[A-Za-z0-9._:-]{1,160}$'),
    source_sequence TEXT NOT NULL CHECK (source_sequence ~ '^[1-9][0-9]{0,19}$'),
    event_id TEXT NOT NULL CHECK (event_id ~ '^[A-Za-z0-9._:-]{1,160}$'),
    entity_kind TEXT NOT NULL CHECK (entity_kind ~ '^[A-Za-z0-9._:-]{1,160}$'),
    entity_id TEXT NOT NULL CHECK (entity_id ~ '^[A-Za-z0-9._:-]{1,160}$'),
    entity_version TEXT NOT NULL CHECK (entity_version ~ '^[A-Za-z0-9._:-]{1,160}$'),
    payload_schema_revision TEXT NOT NULL CHECK (payload_schema_revision ~ '^[A-Za-z0-9._:-]{1,160}$'),
    operation TEXT NOT NULL CHECK (operation IN ('UPSERT', 'TOMBSTONE', 'CORRECTION')),
    event_time_ms BIGINT NOT NULL,
    source_published_at_ms BIGINT NOT NULL,
    correction_of_event_id TEXT,
    tombstone_of_event_id TEXT,
    causation_id TEXT,
    correlation_id TEXT,
    payload_digest TEXT NOT NULL CHECK (payload_digest ~ '^sha256:[0-9a-f]{64}$'),
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    batch_digest TEXT NOT NULL CHECK (batch_digest ~ '^sha256:[0-9a-f]{64}$'),
    committed_revision BIGINT NOT NULL CHECK (committed_revision > 0),
    committed_at_ms BIGINT NOT NULL,
    PRIMARY KEY (generation_id, source_epoch, source_sequence),
    UNIQUE (generation_id, event_id),
    FOREIGN KEY (generation_id, batch_digest)
      REFERENCES portal_projection.authoritative_event_batches(generation_id, batch_digest)
      DEFERRABLE INITIALLY DEFERRED,
    CHECK (source_published_at_ms >= event_time_ms),
    CHECK (
      (operation = 'UPSERT'
       AND correction_of_event_id IS NULL AND tombstone_of_event_id IS NULL)
      OR (operation = 'CORRECTION'
          AND correction_of_event_id IS NOT NULL AND tombstone_of_event_id IS NULL)
      OR (operation = 'TOMBSTONE'
          AND correction_of_event_id IS NULL AND tombstone_of_event_id IS NOT NULL)
    )
);

CREATE INDEX idx_authoritative_event_facts_entity
  ON portal_projection.authoritative_event_facts
  (generation_id, entity_kind, entity_id, ((source_sequence)::numeric));
CREATE INDEX idx_authoritative_event_facts_event_time
  ON portal_projection.authoritative_event_facts
  (generation_id, event_time_ms, ((source_sequence)::numeric));

CREATE TABLE portal_projection.authoritative_event_current (
    generation_id UUID NOT NULL
      REFERENCES portal_projection.authoritative_event_generations(generation_id)
      ON DELETE RESTRICT,
    entity_kind TEXT NOT NULL CHECK (entity_kind ~ '^[A-Za-z0-9._:-]{1,160}$'),
    entity_id TEXT NOT NULL CHECK (entity_id ~ '^[A-Za-z0-9._:-]{1,160}$'),
    last_event_id TEXT NOT NULL CHECK (last_event_id ~ '^[A-Za-z0-9._:-]{1,160}$'),
    source_epoch TEXT NOT NULL CHECK (source_epoch ~ '^[A-Za-z0-9._:-]{1,160}$'),
    source_sequence TEXT NOT NULL CHECK (source_sequence ~ '^[1-9][0-9]{0,19}$'),
    entity_version TEXT NOT NULL CHECK (entity_version ~ '^[A-Za-z0-9._:-]{1,160}$'),
    last_operation TEXT NOT NULL CHECK (last_operation IN ('UPSERT', 'TOMBSTONE', 'CORRECTION')),
    event_time_ms BIGINT NOT NULL,
    source_published_at_ms BIGINT NOT NULL,
    payload_digest TEXT NOT NULL CHECK (payload_digest ~ '^sha256:[0-9a-f]{64}$'),
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    tombstoned BOOLEAN NOT NULL,
    committed_revision BIGINT NOT NULL CHECK (committed_revision > 0),
    updated_at_ms BIGINT NOT NULL,
    PRIMARY KEY (generation_id, entity_kind, entity_id),
    CHECK (source_published_at_ms >= event_time_ms),
    CHECK ((last_operation = 'TOMBSTONE') = tombstoned)
);

CREATE INDEX idx_authoritative_event_current_visible
  ON portal_projection.authoritative_event_current
  (generation_id, entity_kind, entity_id)
  WHERE NOT tombstoned;

CREATE TABLE portal_projection.authoritative_event_local_journal (
    generation_id UUID NOT NULL
      REFERENCES portal_projection.authoritative_event_generations(generation_id)
      ON DELETE RESTRICT,
    committed_revision BIGINT NOT NULL CHECK (committed_revision > 0),
    batch_digest TEXT NOT NULL CHECK (batch_digest ~ '^sha256:[0-9a-f]{64}$'),
    final_source_sequence TEXT NOT NULL CHECK (final_source_sequence ~ '^[1-9][0-9]{0,19}$'),
    record_count INTEGER NOT NULL CHECK (record_count > 0 AND record_count <= 200),
    committed_at_ms BIGINT NOT NULL,
    PRIMARY KEY (generation_id, committed_revision),
    UNIQUE (generation_id, batch_digest)
);

CREATE TABLE portal_projection.authoritative_event_quarantines (
    quarantine_id UUID PRIMARY KEY,
    stream_binding_digest TEXT NOT NULL
      REFERENCES portal_projection.authoritative_event_streams(stream_binding_digest)
      ON DELETE RESTRICT,
    generation_id UUID
      REFERENCES portal_projection.authoritative_event_generations(generation_id)
      ON DELETE RESTRICT,
    batch_digest TEXT CHECK (batch_digest IS NULL OR batch_digest ~ '^sha256:[0-9a-f]{64}$'),
    reason_code TEXT NOT NULL CHECK (reason_code ~ '^[A-Z][A-Z0-9_]{1,95}$'),
    expected_source_sequence TEXT,
    observed_source_sequence TEXT,
    detected_at_ms BIGINT NOT NULL,
    resolved_at_ms BIGINT,
    resolution_evidence_digest TEXT
      CHECK (resolution_evidence_digest IS NULL OR resolution_evidence_digest ~ '^sha256:[0-9a-f]{64}$'),
    CHECK ((resolved_at_ms IS NULL) = (resolution_evidence_digest IS NULL))
);

CREATE INDEX idx_authoritative_event_quarantines_open
  ON portal_projection.authoritative_event_quarantines
  (stream_binding_digest, detected_at_ms DESC)
  WHERE resolved_at_ms IS NULL;

CREATE OR REPLACE FUNCTION portal_projection.reject_authoritative_immutable_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'authoritative event evidence cannot be changed or deleted';
END;
$$;

CREATE TRIGGER authoritative_event_batches_immutable
  BEFORE UPDATE OR DELETE ON portal_projection.authoritative_event_batches
  FOR EACH ROW EXECUTE FUNCTION portal_projection.reject_authoritative_immutable_change();
CREATE TRIGGER authoritative_event_facts_immutable
  BEFORE UPDATE OR DELETE ON portal_projection.authoritative_event_facts
  FOR EACH ROW EXECUTE FUNCTION portal_projection.reject_authoritative_immutable_change();
CREATE TRIGGER authoritative_event_local_journal_immutable
  BEFORE UPDATE OR DELETE ON portal_projection.authoritative_event_local_journal
  FOR EACH ROW EXECUTE FUNCTION portal_projection.reject_authoritative_immutable_change();

COMMENT ON TABLE portal_projection.authoritative_event_streams IS
  'EDS-09 source-bound roots; source-dark until independently accepted runtime evidence exists';
COMMENT ON TABLE portal_projection.authoritative_event_generations IS
  'One explicit snapshot/resnapshot generation; only TAIL_READY can become stream authority';
COMMENT ON TABLE portal_projection.authoritative_event_facts IS
  'Immutable accepted-source event facts; decimal source sequences remain exact text';
COMMENT ON TABLE portal_projection.authoritative_event_local_journal IS
  'Local downstream journal emitted in the same commit as facts/current/checkpoint, never before durable commit';
