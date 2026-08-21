CREATE TABLE IF NOT EXISTS portal_projection.series_points (
    epoch_id UUID NOT NULL REFERENCES portal_projection.epochs(epoch_id) ON DELETE CASCADE,
    series_key TEXT NOT NULL CHECK (series_key <> '' AND series_key = btrim(series_key)),
    metric TEXT NOT NULL CHECK (metric <> '' AND metric = btrim(metric)),
    interval_seconds INTEGER NOT NULL CHECK (interval_seconds IN (60, 300, 900, 3600, 14400, 86400)),
    bucket_at TIMESTAMPTZ NOT NULL,
    currency TEXT,
    value NUMERIC NOT NULL,
    minimum NUMERIC NOT NULL,
    maximum NUMERIC NOT NULL,
    sample_count BIGINT NOT NULL CHECK (sample_count > 0),
    source_authority TEXT NOT NULL CHECK (source_authority IN ('RESEARCH', 'EXECUTION', 'BROKER', 'DERIVED')),
    as_of TIMESTAMPTZ NOT NULL,
    projection_sequence BIGINT NOT NULL CHECK (projection_sequence > 0),
    adapter_version TEXT NOT NULL CHECK (adapter_version <> ''),
    capability_snapshot_id TEXT NOT NULL CHECK (capability_snapshot_id <> ''),
    PRIMARY KEY (epoch_id, series_key, metric, interval_seconds, bucket_at, currency),
    CHECK (minimum <= value AND value <= maximum)
);

CREATE INDEX IF NOT EXISTS idx_projection_series_hot_query
    ON portal_projection.series_points
    (epoch_id, series_key, metric, interval_seconds, bucket_at)
    INCLUDE (currency, value, minimum, maximum, sample_count, source_authority, as_of);

CREATE TABLE IF NOT EXISTS portal_projection.retention_policy_snapshots (
    retention_policy_id UUID PRIMARY KEY,
    workspace_id TEXT NOT NULL CHECK (workspace_id <> '' AND workspace_id = btrim(workspace_id)),
    environment TEXT NOT NULL CHECK (environment IN ('paper', 'sandbox', 'live')),
    series_key TEXT NOT NULL CHECK (series_key <> '' AND series_key = btrim(series_key)),
    metric TEXT NOT NULL CHECK (metric <> '' AND metric = btrim(metric)),
    policy_version TEXT NOT NULL CHECK (policy_version <> '' AND policy_version = btrim(policy_version)),
    hot_from TIMESTAMPTZ NOT NULL,
    cold_requestable_from TIMESTAMPTZ,
    purged_before TIMESTAMPTZ,
    access_request_path TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    UNIQUE (workspace_id, environment, series_key, metric, policy_version),
    CHECK (cold_requestable_from IS NULL OR cold_requestable_from <= hot_from),
    CHECK (purged_before IS NULL OR purged_before <= hot_from),
    CHECK (access_request_path IS NULL OR access_request_path LIKE '/%')
);

CREATE INDEX IF NOT EXISTS idx_projection_retention_latest
    ON portal_projection.retention_policy_snapshots
    (workspace_id, environment, series_key, metric, created_at DESC);

CREATE OR REPLACE FUNCTION portal_projection.reject_retention_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'retention policy snapshots are immutable';
END;
$$;

DROP TRIGGER IF EXISTS trg_retention_snapshot_immutable
    ON portal_projection.retention_policy_snapshots;
CREATE TRIGGER trg_retention_snapshot_immutable
    BEFORE UPDATE OR DELETE ON portal_projection.retention_policy_snapshots
    FOR EACH ROW EXECUTE FUNCTION portal_projection.reject_retention_snapshot_mutation();
