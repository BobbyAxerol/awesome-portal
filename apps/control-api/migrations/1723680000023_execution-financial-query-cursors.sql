-- EDS-07: browser-visible financial/risk pagination is a random Portal
-- handle.  The signed durable-mirror keyset remains server-side because its
-- payload names the internal relation and range boundary.
CREATE TABLE execution_financial_query_cursors (
  cursor_id uuid PRIMARY KEY,
  operation_id text NOT NULL,
  workspace_id text NOT NULL,
  principal_digest text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('paper','sandbox','live')),
  profile_id text NOT NULL,
  query_fingerprint text NOT NULL,
  durable_cursor text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  CHECK (operation_id ~ '^[A-Za-z][A-Za-z0-9]{2,127}$'),
  CHECK (profile_id ~ '^(PAPER|SANDBOX|LIVE)_[A-Z0-9_]{2,120}$'),
  CHECK (query_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  CHECK (octet_length(durable_cursor) BETWEEN 1 AND 4096),
  CHECK (expires_at > issued_at)
);

CREATE INDEX execution_financial_query_cursors_scope_expiry_idx
  ON execution_financial_query_cursors
  (operation_id, workspace_id, principal_digest, environment, profile_id, query_fingerprint, expires_at);

CREATE INDEX execution_financial_query_cursors_expiry_idx
  ON execution_financial_query_cursors (expires_at);
