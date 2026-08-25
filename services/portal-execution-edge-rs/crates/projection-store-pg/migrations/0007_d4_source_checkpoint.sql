CREATE TABLE portal_projection.d4_source_checkpoints (
    epoch_id UUID PRIMARY KEY
      REFERENCES portal_projection.epochs(epoch_id) ON DELETE CASCADE,
    contract_revision TEXT NOT NULL
      CHECK (contract_revision = 'd4.paper-read.v1'),
    scope_id TEXT NOT NULL
      CHECK (scope_id = 'PAPER_BINANCE_USDM'),
    phase TEXT NOT NULL
      CHECK (phase IN (
        'SNAPSHOT_LEASED', 'BASELINE_COMMITTED', 'STREAMING', 'REBUILD_REQUIRED'
      )),
    snapshot_token BYTEA,
    snapshot_digest TEXT NOT NULL
      CHECK (snapshot_digest ~ '^sha256:[0-9a-f]{64}$'),
    snapshot_created_at TIMESTAMPTZ NOT NULL,
    snapshot_expires_at TIMESTAMPTZ NOT NULL,
    snapshot_accepted_at TIMESTAMPTZ NOT NULL,
    expected_order_count BIGINT NOT NULL
      CHECK (expected_order_count BETWEEN 0 AND 100000),
    expected_fill_count BIGINT NOT NULL
      CHECK (expected_fill_count BETWEEN 0 AND 100000),
    expected_position_count BIGINT NOT NULL
      CHECK (expected_position_count BETWEEN 0 AND 100000),
    event_cursor BYTEA NOT NULL,
    baseline_digest TEXT
      CHECK (baseline_digest IS NULL OR baseline_digest ~ '^sha256:[0-9a-f]{64}$'),
    applied_order_count BIGINT
      CHECK (applied_order_count BETWEEN 0 AND 100000),
    applied_fill_count BIGINT
      CHECK (applied_fill_count BETWEEN 0 AND 100000),
    applied_position_count BIGINT
      CHECK (applied_position_count BETWEEN 0 AND 100000),
    baseline_source_read_at TIMESTAMPTZ,
    baseline_committed_at TIMESTAMPTZ,
    last_event_page_digest TEXT
      CHECK (last_event_page_digest IS NULL OR last_event_page_digest ~ '^sha256:[0-9a-f]{64}$'),
    last_source_sequence BIGINT CHECK (last_source_sequence > 0),
    source_head_sequence BIGINT CHECK (source_head_sequence >= 0),
    caught_up BOOLEAN NOT NULL DEFAULT FALSE,
    last_event_source_read_at TIMESTAMPTZ,
    last_event_committed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL,
    CHECK (snapshot_expires_at > snapshot_created_at),
    CHECK (snapshot_accepted_at >= snapshot_created_at),
    CHECK (
      expected_order_count + expected_fill_count + expected_position_count <= 100000
    ),
    CHECK (octet_length(event_cursor) BETWEEN 1 AND 4096),
    CHECK (snapshot_token IS NULL OR octet_length(snapshot_token) BETWEEN 1 AND 4096),
    CHECK (
      (phase = 'SNAPSHOT_LEASED'
        AND snapshot_token IS NOT NULL
        AND baseline_digest IS NULL
        AND baseline_committed_at IS NULL)
      OR
      (phase IN ('BASELINE_COMMITTED', 'STREAMING')
        AND snapshot_token IS NULL
        AND baseline_digest IS NOT NULL
        AND applied_order_count = expected_order_count
        AND applied_fill_count = expected_fill_count
        AND applied_position_count = expected_position_count
        AND baseline_source_read_at IS NOT NULL
        AND baseline_committed_at IS NOT NULL)
      OR phase = 'REBUILD_REQUIRED'
    )
);

CREATE INDEX idx_d4_source_checkpoint_phase
    ON portal_projection.d4_source_checkpoints (phase, updated_at);

CREATE TABLE portal_projection.d4_source_failures (
    failure_id UUID PRIMARY KEY,
    epoch_id UUID NOT NULL
      REFERENCES portal_projection.epochs(epoch_id) ON DELETE CASCADE,
    reason_code TEXT NOT NULL CHECK (reason_code IN (
      'GLOBAL_SEQUENCE_GAP', 'GLOBAL_SEQUENCE_REGRESSION', 'EVENT_PAGE_INTEGRITY'
    )),
    previous_source_sequence BIGINT,
    observed_source_sequence BIGINT,
    page_digest TEXT NOT NULL CHECK (page_digest ~ '^sha256:[0-9a-f]{64}$'),
    detected_at TIMESTAMPTZ NOT NULL
);

CREATE TRIGGER d4_source_failure_immutable
    BEFORE UPDATE OR DELETE ON portal_projection.d4_source_failures
    FOR EACH ROW EXECUTE FUNCTION portal_projection.reject_immutable_change();

COMMENT ON COLUMN portal_projection.d4_source_checkpoints.snapshot_token IS
  'Opaque D4 token: encrypted-volume only; never log or expose through Query API';
COMMENT ON COLUMN portal_projection.d4_source_checkpoints.event_cursor IS
  'Opaque D4 cursor: encrypted-volume only; never log or expose through Query API';
