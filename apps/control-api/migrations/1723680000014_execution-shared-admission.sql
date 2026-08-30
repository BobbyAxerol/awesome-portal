-- Up Migration
-- N21 coordinates every source-consuming Control API replica through the
-- Portal-owned PostgreSQL cell.  Payload rows are deliberately short lived;
-- they are an anti-stampede cache, never execution truth.
CREATE TABLE execution_shared_admission_state (
    scope_kind          text NOT NULL CHECK (scope_kind IN ('SOURCE', 'PROFILE')),
    scope_key           text NOT NULL CHECK (scope_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$'),
    maximum_rps         integer NOT NULL CHECK (maximum_rps BETWEEN 1 AND 15),
    maximum_concurrency integer NOT NULL CHECK (maximum_concurrency BETWEEN 1 AND 512),
    next_permit_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (scope_kind, scope_key)
);

CREATE TABLE execution_shared_admission_leases (
    lease_id            uuid PRIMARY KEY,
    source_id           text NOT NULL CHECK (source_id ~ '^[a-z][a-z0-9.-]{1,127}$'),
    profile_id          text NOT NULL CHECK (profile_id ~ '^[A-Z][A-Z0-9_]{2,127}$'),
    owner_id            text NOT NULL CHECK (owner_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$'),
    acquired_at         timestamptz NOT NULL,
    expires_at          timestamptz NOT NULL,
    CHECK (expires_at > acquired_at)
);
CREATE INDEX execution_shared_admission_leases_scope_idx
  ON execution_shared_admission_leases (source_id, profile_id, expires_at);

CREATE TABLE execution_shared_read_flights (
    cache_key           text PRIMARY KEY CHECK (cache_key ~ '^sha256:[0-9a-f]{64}$'),
    source_id           text NOT NULL CHECK (source_id ~ '^[a-z][a-z0-9.-]{1,127}$'),
    profile_id          text NOT NULL CHECK (profile_id ~ '^[A-Z][A-Z0-9_]{2,127}$'),
    workspace_id        text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    principal_digest    text NOT NULL CHECK (principal_digest ~ '^sha256:[0-9a-f]{64}$'),
    adapter_revision    text NOT NULL CHECK (adapter_revision ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$'),
    request_digest      text NOT NULL CHECK (request_digest ~ '^sha256:[0-9a-f]{64}$'),
    leader_id           text NOT NULL CHECK (leader_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$'),
    started_at          timestamptz NOT NULL,
    expires_at          timestamptz NOT NULL,
    CHECK (expires_at > started_at)
);
CREATE INDEX execution_shared_read_flights_expiry_idx
  ON execution_shared_read_flights (expires_at);

CREATE TABLE execution_shared_read_cache (
    cache_key           text PRIMARY KEY CHECK (cache_key ~ '^sha256:[0-9a-f]{64}$'),
    source_id           text NOT NULL CHECK (source_id ~ '^[a-z][a-z0-9.-]{1,127}$'),
    profile_id          text NOT NULL CHECK (profile_id ~ '^[A-Z][A-Z0-9_]{2,127}$'),
    workspace_id        text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    principal_digest    text NOT NULL CHECK (principal_digest ~ '^sha256:[0-9a-f]{64}$'),
    adapter_revision    text NOT NULL CHECK (adapter_revision ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$'),
    request_digest      text NOT NULL CHECK (request_digest ~ '^sha256:[0-9a-f]{64}$'),
    etag                text NOT NULL CHECK (etag ~ '^"sha256-[0-9a-f]{64}"$'),
    authority           text NOT NULL CHECK (char_length(authority) BETWEEN 1 AND 128),
    freshness           text NOT NULL CHECK (freshness IN (
                          'FRESH','AGING','DEGRADED','STALE','PAUSED','UNAVAILABLE','UNKNOWN'
                        )),
    completeness        text NOT NULL CHECK (completeness IN (
                          'COMPLETE','PARTIAL','POLL_BOUNDED','EVENT_SOURCED','UNKNOWN'
                        )),
    as_of               timestamptz NOT NULL,
    response_body       jsonb NOT NULL CHECK (jsonb_typeof(response_body) = 'object'),
    response_bytes      integer NOT NULL CHECK (response_bytes BETWEEN 2 AND 4194304),
    stored_at           timestamptz NOT NULL,
    expires_at          timestamptz NOT NULL,
    CHECK (expires_at > stored_at)
);
CREATE INDEX execution_shared_read_cache_expiry_idx
  ON execution_shared_read_cache (expires_at);

COMMENT ON TABLE execution_shared_admission_state IS
  'N21 shared source/profile pacing authority for horizontally scaled Control API replicas';
COMMENT ON TABLE execution_shared_read_cache IS
  'N21 bounded anti-stampede cache; source authority and as_of remain embedded and immutable';

-- Down Migration
DROP TABLE execution_shared_read_cache;
DROP TABLE execution_shared_read_flights;
DROP TABLE execution_shared_admission_leases;
DROP TABLE execution_shared_admission_state;
