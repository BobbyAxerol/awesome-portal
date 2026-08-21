CREATE SCHEMA IF NOT EXISTS portal_projection;

CREATE TABLE IF NOT EXISTS portal_projection.epochs (
    epoch_id UUID PRIMARY KEY,
    workspace_id TEXT NOT NULL CHECK (workspace_id <> '' AND workspace_id = btrim(workspace_id)),
    environment TEXT NOT NULL CHECK (environment IN ('paper', 'sandbox', 'live')),
    status TEXT NOT NULL CHECK (status IN ('BUILDING', 'ACTIVE', 'RETAINED', 'RETIRED', 'FAILED')),
    adapter_version TEXT NOT NULL CHECK (adapter_version <> ''),
    source_gateway_digest TEXT NOT NULL CHECK (source_gateway_digest LIKE 'sha256:%'),
    capability_snapshot_id TEXT NOT NULL CHECK (capability_snapshot_id <> ''),
    created_at TIMESTAMPTZ NOT NULL,
    activated_at TIMESTAMPTZ,
    overlap_until TIMESTAMPTZ,
    retired_at TIMESTAMPTZ,
    next_projection_sequence BIGINT NOT NULL DEFAULT 0 CHECK (next_projection_sequence >= 0),
    expected_state_digest TEXT,
    actual_state_digest TEXT,
    CHECK (status <> 'ACTIVE' OR activated_at IS NOT NULL),
    CHECK (status <> 'BUILDING' OR activated_at IS NULL),
    CHECK (overlap_until IS NULL OR status = 'RETAINED')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_projection_one_active_epoch
    ON portal_projection.epochs (workspace_id, environment)
    WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_projection_epoch_scope_status
    ON portal_projection.epochs (workspace_id, environment, status, created_at DESC);

CREATE TABLE IF NOT EXISTS portal_projection.entities (
    epoch_id UUID NOT NULL REFERENCES portal_projection.epochs(epoch_id) ON DELETE CASCADE,
    entity_kind TEXT NOT NULL CHECK (entity_kind IN (
        'ORDER', 'FILL', 'POSITION', 'RUNTIME', 'ACCOUNT', 'BROKER_BINDING',
        'RECONCILIATION', 'PERFORMANCE', 'OPERATION'
    )),
    entity_id TEXT NOT NULL CHECK (entity_id <> '' AND entity_id = btrim(entity_id)),
    projection_sequence BIGINT NOT NULL CHECK (projection_sequence > 0),
    source_authority TEXT NOT NULL CHECK (source_authority IN ('RESEARCH', 'EXECUTION', 'BROKER', 'DERIVED')),
    as_of TIMESTAMPTZ,
    source_read_at TIMESTAMPTZ NOT NULL,
    projected_at TIMESTAMPTZ NOT NULL,
    source_event_ts TIMESTAMPTZ,
    source_created_at TIMESTAMPTZ,
    source_event_id TEXT,
    source_sequence BIGINT CHECK (source_sequence IS NULL OR source_sequence >= 0),
    source_completeness TEXT NOT NULL CHECK (source_completeness IN ('EVENT_SOURCED', 'POLL_BOUNDED', 'UNKNOWN')),
    poll_interval_ms BIGINT CHECK (poll_interval_ms IS NULL OR poll_interval_ms > 0),
    adapter_version TEXT NOT NULL CHECK (adapter_version <> ''),
    capability_snapshot_id TEXT NOT NULL CHECK (capability_snapshot_id <> ''),
    payload_digest TEXT NOT NULL CHECK (payload_digest LIKE 'sha256:%'),
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    PRIMARY KEY (epoch_id, entity_kind, entity_id),
    CHECK (
        (source_completeness = 'POLL_BOUNDED' AND poll_interval_ms IS NOT NULL)
        OR (source_completeness <> 'POLL_BOUNDED' AND poll_interval_ms IS NULL)
    ),
    CHECK (
        (source_event_ts IS NULL AND source_created_at IS NULL AND source_event_id IS NULL)
        OR (source_event_ts IS NOT NULL AND source_created_at IS NOT NULL AND source_event_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_projection_entities_epoch_sequence
    ON portal_projection.entities (epoch_id, projection_sequence);
CREATE INDEX IF NOT EXISTS idx_projection_entities_kind_as_of
    ON portal_projection.entities (epoch_id, entity_kind, as_of DESC, entity_id);

CREATE TABLE IF NOT EXISTS portal_projection.ingestion_keys (
    epoch_id UUID NOT NULL REFERENCES portal_projection.epochs(epoch_id) ON DELETE CASCADE,
    ingestion_id TEXT NOT NULL CHECK (ingestion_id <> '' AND ingestion_id = btrim(ingestion_id)),
    input_digest TEXT NOT NULL CHECK (input_digest LIKE 'sha256:%'),
    outcome TEXT NOT NULL CHECK (outcome IN ('APPLIED', 'REFRESHED', 'GAP_APPLIED', 'OUT_OF_ORDER', 'DEAD_LETTERED')),
    projection_sequence BIGINT CHECK (projection_sequence IS NULL OR projection_sequence > 0),
    first_seen_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (epoch_id, ingestion_id)
);

CREATE TABLE IF NOT EXISTS portal_projection.event_journal (
    event_id UUID NOT NULL,
    journal_ordinal BIGINT GENERATED ALWAYS AS IDENTITY CHECK (journal_ordinal > 0),
    projected_at TIMESTAMPTZ NOT NULL,
    epoch_id UUID NOT NULL REFERENCES portal_projection.epochs(epoch_id) ON DELETE CASCADE,
    ingestion_id TEXT NOT NULL,
    projection_sequence BIGINT,
    entity_kind TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    outcome TEXT NOT NULL,
    source_event_ts TIMESTAMPTZ,
    source_created_at TIMESTAMPTZ,
    source_event_id TEXT,
    source_sequence BIGINT,
    source_read_at TIMESTAMPTZ NOT NULL,
    as_of TIMESTAMPTZ,
    input_digest TEXT NOT NULL CHECK (input_digest LIKE 'sha256:%'),
    observation JSONB NOT NULL CHECK (jsonb_typeof(observation) = 'object'),
    PRIMARY KEY (projected_at, event_id)
) PARTITION BY RANGE (projected_at);

CREATE TABLE IF NOT EXISTS portal_projection.event_journal_default
    PARTITION OF portal_projection.event_journal DEFAULT;
CREATE INDEX IF NOT EXISTS idx_projection_journal_epoch_sequence
    ON portal_projection.event_journal (epoch_id, projection_sequence)
    WHERE projection_sequence IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projection_journal_epoch_ordinal
    ON portal_projection.event_journal (epoch_id, journal_ordinal);
CREATE INDEX IF NOT EXISTS idx_projection_journal_source_cursor
    ON portal_projection.event_journal (
        epoch_id, entity_kind, source_event_ts, source_created_at, source_event_id
    )
    WHERE source_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS portal_projection.checkpoints (
    epoch_id UUID NOT NULL REFERENCES portal_projection.epochs(epoch_id) ON DELETE CASCADE,
    stream_key TEXT NOT NULL CHECK (stream_key <> ''),
    source_event_ts TIMESTAMPTZ,
    source_created_at TIMESTAMPTZ,
    source_event_id TEXT,
    source_sequence BIGINT,
    last_projection_sequence BIGINT NOT NULL CHECK (last_projection_sequence >= 0),
    updated_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (epoch_id, stream_key),
    CHECK (
        (source_event_ts IS NULL AND source_created_at IS NULL AND source_event_id IS NULL)
        OR (source_event_ts IS NOT NULL AND source_created_at IS NOT NULL AND source_event_id IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS portal_projection.snapshots (
    epoch_id UUID NOT NULL REFERENCES portal_projection.epochs(epoch_id) ON DELETE CASCADE,
    snapshot_id TEXT NOT NULL CHECK (snapshot_id <> ''),
    entity_kind TEXT NOT NULL,
    completeness TEXT NOT NULL CHECK (completeness IN ('COMPLETE', 'PARTIAL')),
    expected_count BIGINT NOT NULL CHECK (expected_count >= 0),
    applied_count BIGINT NOT NULL CHECK (applied_count >= 0),
    removed_count BIGINT NOT NULL CHECK (removed_count >= 0),
    source_read_at TIMESTAMPTZ NOT NULL,
    committed_at TIMESTAMPTZ NOT NULL,
    state_digest TEXT NOT NULL CHECK (state_digest LIKE 'sha256:%'),
    PRIMARY KEY (epoch_id, snapshot_id)
);

CREATE TABLE IF NOT EXISTS portal_projection.gaps (
    gap_id UUID PRIMARY KEY,
    epoch_id UUID NOT NULL REFERENCES portal_projection.epochs(epoch_id) ON DELETE CASCADE,
    entity_kind TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    reason_code TEXT NOT NULL CHECK (reason_code IN ('SOURCE_SEQUENCE_GAP', 'SOURCE_SEQUENCE_REGRESSION', 'SOURCE_CURSOR_COLLISION', 'PROJECTION_HISTORY_EVICTED')),
    previous_source_sequence BIGINT,
    observed_source_sequence BIGINT,
    projection_sequence BIGINT NOT NULL CHECK (projection_sequence > 0),
    detected_at TIMESTAMPTZ NOT NULL,
    resolved_at TIMESTAMPTZ,
    resolution_evidence_digest TEXT,
    CHECK ((resolved_at IS NULL) = (resolution_evidence_digest IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_projection_unresolved_gaps
    ON portal_projection.gaps (epoch_id, detected_at)
    WHERE resolved_at IS NULL;

CREATE TABLE IF NOT EXISTS portal_projection.dead_letters (
    dead_letter_id UUID PRIMARY KEY,
    epoch_id UUID NOT NULL REFERENCES portal_projection.epochs(epoch_id) ON DELETE CASCADE,
    ingestion_id TEXT NOT NULL,
    reason_code TEXT NOT NULL,
    input_digest TEXT NOT NULL CHECK (input_digest LIKE 'sha256:%'),
    redacted_observation JSONB NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    status TEXT NOT NULL CHECK (status IN ('OPEN', 'REPLAYING', 'RESOLVED', 'DISCARDED')),
    first_seen_at TIMESTAMPTZ NOT NULL,
    last_attempt_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    UNIQUE (epoch_id, ingestion_id, input_digest)
);

CREATE TABLE IF NOT EXISTS portal_projection.replay_runs (
    replay_id UUID PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    environment TEXT NOT NULL CHECK (environment IN ('paper', 'sandbox', 'live')),
    source_epoch_id UUID REFERENCES portal_projection.epochs(epoch_id),
    target_epoch_id UUID NOT NULL REFERENCES portal_projection.epochs(epoch_id),
    status TEXT NOT NULL CHECK (status IN ('RUNNING', 'PARITY_MATCHED', 'DIVERGED', 'FAILED', 'ACTIVATED')),
    input_count BIGINT NOT NULL DEFAULT 0 CHECK (input_count >= 0),
    applied_count BIGINT NOT NULL DEFAULT 0 CHECK (applied_count >= 0),
    dead_letter_count BIGINT NOT NULL DEFAULT 0 CHECK (dead_letter_count >= 0),
    expected_state_digest TEXT,
    actual_state_digest TEXT,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    activated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS portal_projection.freshness_policy_snapshots (
    policy_version TEXT PRIMARY KEY CHECK (policy_version <> ''),
    policy_digest TEXT NOT NULL UNIQUE CHECK (policy_digest LIKE 'sha256:%'),
    policy JSONB NOT NULL CHECK (jsonb_typeof(policy) = 'object'),
    registered_at TIMESTAMPTZ NOT NULL
);

CREATE OR REPLACE FUNCTION portal_projection.reject_immutable_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'immutable projection evidence cannot be changed';
END;
$$;

DROP TRIGGER IF EXISTS event_journal_immutable ON portal_projection.event_journal;
CREATE TRIGGER event_journal_immutable
    BEFORE UPDATE OR DELETE ON portal_projection.event_journal
    FOR EACH ROW EXECUTE FUNCTION portal_projection.reject_immutable_change();

DROP TRIGGER IF EXISTS snapshot_evidence_immutable ON portal_projection.snapshots;
CREATE TRIGGER snapshot_evidence_immutable
    BEFORE UPDATE OR DELETE ON portal_projection.snapshots
    FOR EACH ROW EXECUTE FUNCTION portal_projection.reject_immutable_change();

DROP TRIGGER IF EXISTS freshness_policy_immutable ON portal_projection.freshness_policy_snapshots;
CREATE TRIGGER freshness_policy_immutable
    BEFORE UPDATE OR DELETE ON portal_projection.freshness_policy_snapshots
    FOR EACH ROW EXECUTE FUNCTION portal_projection.reject_immutable_change();
