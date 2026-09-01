-- N24/N25 freshness is liveness state, not immutable business evidence.
-- Keep one bounded heartbeat per epoch so an unchanged full snapshot does not
-- create another journal row for every source record merely to prove polling
-- is alive.
CREATE TABLE portal_projection.manager_projection_heartbeats (
    epoch_id UUID PRIMARY KEY REFERENCES portal_projection.epochs(epoch_id) ON DELETE CASCADE,
    profile_id TEXT NOT NULL CHECK (profile_id IN (
      'PAPER_BINANCE_USDM', 'SANDBOX_BINANCE_USDM', 'LIVE_BINANCE_USDM'
    )),
    catalogue_digest TEXT NOT NULL CHECK (catalogue_digest ~ '^sha256:[0-9a-f]{64}$'),
    state_digest TEXT NOT NULL CHECK (state_digest ~ '^sha256:[0-9a-f]{64}$'),
    record_count BIGINT NOT NULL CHECK (record_count >= 0 AND record_count <= 80000),
    poll_interval_ms BIGINT NOT NULL CHECK (poll_interval_ms BETWEEN 250 AND 60000),
    source_read_at TIMESTAMPTZ NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    CHECK (observed_at >= source_read_at)
);

COMMENT ON TABLE portal_projection.manager_projection_heartbeats IS
  'Mutable bounded N24 poll liveness; never used as business or command authority';
