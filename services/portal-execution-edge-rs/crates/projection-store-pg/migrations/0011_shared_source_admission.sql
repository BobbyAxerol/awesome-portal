CREATE TABLE portal_projection.source_admission_state (
    scope_kind TEXT NOT NULL CHECK (scope_kind IN ('SOURCE', 'PROFILE')),
    scope_key TEXT NOT NULL CHECK (scope_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$'),
    maximum_rps INTEGER NOT NULL CHECK (maximum_rps BETWEEN 1 AND 15),
    maximum_concurrency INTEGER NOT NULL CHECK (maximum_concurrency BETWEEN 1 AND 64),
    next_permit_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (scope_kind, scope_key)
);

CREATE TABLE portal_projection.source_admission_leases (
    lease_id UUID PRIMARY KEY,
    source_id TEXT NOT NULL CHECK (source_id ~ '^[a-z][a-z0-9.-]{1,127}$'),
    profile_id TEXT NOT NULL CHECK (profile_id ~ '^[A-Z][A-Z0-9_]{2,127}$'),
    owner_id TEXT NOT NULL CHECK (owner_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$'),
    acquired_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    CHECK (expires_at > acquired_at)
);

CREATE INDEX idx_source_admission_leases_scope_expiry
    ON portal_projection.source_admission_leases (source_id, profile_id, expires_at);

CREATE TABLE portal_projection.source_read_cache (
    source_id TEXT NOT NULL CHECK (source_id ~ '^[a-z][a-z0-9.-]{1,127}$'),
    profile_id TEXT NOT NULL CHECK (profile_id ~ '^[A-Z][A-Z0-9_]{2,127}$'),
    adapter_revision TEXT NOT NULL CHECK (adapter_revision ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$'),
    operation_id TEXT NOT NULL CHECK (operation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$'),
    etag TEXT NOT NULL CHECK (etag ~ '^"sha256-[0-9a-f]{64}"$'),
    authority TEXT NOT NULL CHECK (char_length(authority) BETWEEN 1 AND 128),
    freshness TEXT NOT NULL CHECK (freshness IN (
      'FRESH','DEGRADED','STALE','UNAVAILABLE','UNKNOWN'
    )),
    completeness TEXT NOT NULL CHECK (completeness IN ('COMPLETE','PARTIAL','UNKNOWN')),
    as_of TIMESTAMPTZ NOT NULL,
    response_body JSONB NOT NULL CHECK (jsonb_typeof(response_body) = 'object'),
    response_bytes INTEGER NOT NULL CHECK (response_bytes BETWEEN 2 AND 1048576),
    stored_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (source_id, profile_id, adapter_revision, operation_id),
    CHECK (expires_at > stored_at)
);

CREATE INDEX idx_source_read_cache_expiry
    ON portal_projection.source_read_cache (expires_at);

COMMENT ON TABLE portal_projection.source_admission_state IS
  'N21 cell-local PostgreSQL authority for Edge-global source/profile pacing';
COMMENT ON TABLE portal_projection.source_admission_leases IS
  'N21 expiring global concurrency permits; source calls are never retried by this layer';
COMMENT ON TABLE portal_projection.source_read_cache IS
  'N21 short source-aware cache; profile/revision/operation are part of the primary key';
