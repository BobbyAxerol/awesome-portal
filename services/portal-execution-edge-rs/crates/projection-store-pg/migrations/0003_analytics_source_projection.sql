CREATE TABLE IF NOT EXISTS portal_projection.analytics_source_snapshots (
    snapshot_id UUID PRIMARY KEY,
    epoch_id UUID NOT NULL REFERENCES portal_projection.epochs(epoch_id) ON DELETE CASCADE,
    analytics_kind TEXT NOT NULL CHECK (analytics_kind IN (
        'CAPITAL_PREVIEW', 'ORDER_FUNNEL', 'INSIGHT_PREVIEW',
        'PORTFOLIO_CORRELATION', 'CAPITAL_LEDGER', 'BINDING_EXPOSURE'
    )),
    resource_id TEXT NOT NULL CHECK (resource_id <> '' AND resource_id = btrim(resource_id)),
    context_key TEXT NOT NULL DEFAULT '' CHECK (context_key = btrim(context_key)),
    source_profile TEXT NOT NULL CHECK (source_profile IN (
        'fixture', 'shadow', 'paper', 'sandbox', 'live_canary', 'live_full'
    )),
    population_completeness TEXT NOT NULL CHECK (population_completeness IN (
        'COMPLETE', 'PARTIAL', 'UNKNOWN'
    )),
    expected_fact_count BIGINT NOT NULL CHECK (expected_fact_count >= 0),
    expected_population_count BIGINT CHECK (expected_population_count IS NULL OR expected_population_count >= 0),
    source_read_at TIMESTAMPTZ NOT NULL,
    projected_at TIMESTAMPTZ NOT NULL,
    freshness_policy_version TEXT NOT NULL CHECK (freshness_policy_version <> ''),
    freshness_warning_after_ms BIGINT NOT NULL CHECK (freshness_warning_after_ms >= 0),
    freshness_stale_after_ms BIGINT NOT NULL CHECK (freshness_stale_after_ms > freshness_warning_after_ms),
    maximum_future_skew_ms BIGINT NOT NULL CHECK (maximum_future_skew_ms >= 0),
    projection_sequence BIGINT NOT NULL CHECK (projection_sequence > 0),
    adapter_version TEXT NOT NULL CHECK (adapter_version <> ''),
    capability_snapshot_id TEXT NOT NULL CHECK (capability_snapshot_id <> ''),
    payload_digest TEXT NOT NULL CHECK (payload_digest LIKE 'sha256:%'),
    UNIQUE (epoch_id, analytics_kind, resource_id, context_key)
);

CREATE INDEX IF NOT EXISTS idx_analytics_source_snapshot_lookup
    ON portal_projection.analytics_source_snapshots
    (epoch_id, analytics_kind, resource_id, context_key);

CREATE TABLE IF NOT EXISTS portal_projection.analytics_source_facts (
    snapshot_id UUID NOT NULL REFERENCES portal_projection.analytics_source_snapshots(snapshot_id) ON DELETE CASCADE,
    fact_id TEXT NOT NULL CHECK (fact_id <> '' AND fact_id = btrim(fact_id)),
    fact_kind TEXT NOT NULL CHECK (fact_kind IN (
        'CAPITAL_BUCKET', 'FUNNEL_EVENT', 'INSIGHT_OBSERVATION',
        'CORRELATION_LABEL', 'CORRELATION_PAIR', 'CORRELATION_CLUSTER',
        'CAPITAL_LEDGER_ENTRY', 'VIRTUAL_ACCOUNT_EXPOSURE'
    )),
    ordinal BIGINT NOT NULL CHECK (ordinal >= 0),
    source_authority TEXT NOT NULL CHECK (source_authority IN ('RESEARCH', 'EXECUTION', 'BROKER', 'DERIVED')),
    as_of TIMESTAMPTZ,
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    PRIMARY KEY (snapshot_id, fact_id),
    UNIQUE (snapshot_id, ordinal)
);

CREATE INDEX IF NOT EXISTS idx_analytics_source_facts_ordered
    ON portal_projection.analytics_source_facts (snapshot_id, ordinal);
