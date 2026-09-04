-- EDS-01: the private Manager-v2 relation cursor is source-owned and must
-- never become a browser token.  This table binds a short-lived Portal handle
-- to exactly one named operation, authenticated principal, workspace and
-- profile.  It is Portal Control API state only; it is not a source mirror.
CREATE TABLE execution_manager_operation_continuations (
  continuation_id text PRIMARY KEY,
  operation_id text NOT NULL,
  workspace_id text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  principal_digest text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('paper','sandbox','live')),
  profile_id text NOT NULL,
  source_contract_revision text NOT NULL,
  source_catalogue_sha256 text NOT NULL,
  source_cursor text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  CHECK (continuation_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  CHECK (operation_id ~ '^[A-Za-z][A-Za-z0-9]{2,127}$'),
  CHECK (profile_id ~ '^(PAPER|SANDBOX|LIVE)_[A-Z0-9_]{2,120}$'),
  CHECK (source_catalogue_sha256 ~ '^sha256:[0-9a-f]{64}$'),
  CHECK (octet_length(source_cursor) BETWEEN 1 AND 4096),
  CHECK (expires_at > issued_at)
);

CREATE INDEX execution_manager_operation_continuations_scope_expiry_idx
  ON execution_manager_operation_continuations
  (operation_id, workspace_id, principal_digest, environment, profile_id, expires_at);

CREATE INDEX execution_manager_operation_continuations_expiry_idx
  ON execution_manager_operation_continuations (expires_at);
