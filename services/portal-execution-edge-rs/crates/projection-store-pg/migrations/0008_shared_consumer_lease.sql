CREATE TABLE portal_projection.shared_consumer_leases (
    workspace_id TEXT NOT NULL,
    environment TEXT NOT NULL CHECK (environment = 'paper'),
    source_scope_id TEXT NOT NULL CHECK (source_scope_id = 'PAPER_BINANCE_USDM'),
    epoch_id UUID NOT NULL
      REFERENCES portal_projection.epochs(epoch_id) ON DELETE CASCADE,
    lease_id UUID NOT NULL UNIQUE,
    owner_digest TEXT NOT NULL
      CHECK (owner_digest ~ '^sha256:[0-9a-f]{64}$'),
    fencing_token BIGINT NOT NULL CHECK (fencing_token > 0),
    acquired_at TIMESTAMPTZ NOT NULL,
    renewed_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (workspace_id, environment, source_scope_id),
    CHECK (expires_at > acquired_at),
    CHECK (renewed_at >= acquired_at),
    CHECK (updated_at >= acquired_at)
);

CREATE INDEX idx_shared_consumer_lease_expiry
    ON portal_projection.shared_consumer_leases (expires_at);

COMMENT ON TABLE portal_projection.shared_consumer_leases IS
  'Portal-owned singleton ingestion lease; stale fencing tokens can never advance projection state';
COMMENT ON COLUMN portal_projection.shared_consumer_leases.owner_digest IS
  'Non-secret SHA-256 worker identity; source credentials and tokens are forbidden';
