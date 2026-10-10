-- Up Migration
-- Core-only, preview read delegation. No domain identity or Research membership.
CREATE TABLE execution_retained_review_access (
  workspace_id text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE RESTRICT,
  user_id text NOT NULL REFERENCES portal_users(user_id) ON DELETE RESTRICT,
  issued_by text NOT NULL REFERENCES portal_users(user_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '30 days'),
  PRIMARY KEY(workspace_id,user_id)
);
COMMENT ON TABLE execution_retained_review_access IS
  'Core authority: local retained-review GET only; not membership, Governance decide, management, stream or source delegation.';
-- Down Migration
DROP TABLE execution_retained_review_access;
