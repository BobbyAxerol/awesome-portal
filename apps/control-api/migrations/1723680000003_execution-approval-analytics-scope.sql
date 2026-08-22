-- Up Migration
ALTER TABLE governance_approval_requests
  ADD CONSTRAINT governance_approval_scope_target_unique
  UNIQUE (approval_id, workspace_id, gate);

CREATE TABLE governance_approval_analytics_scopes (
    approval_id  text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE RESTRICT,
    gate         text NOT NULL DEFAULT 'R2' CHECK (gate = 'R2'),
    portfolio_id text NOT NULL CHECK (
      octet_length(portfolio_id) BETWEEN 1 AND 128
      AND portfolio_id ~ '^[A-Za-z0-9._-]+$'
    ),
    currency     text NOT NULL CHECK (
      octet_length(currency) BETWEEN 2 AND 12
      AND currency ~ '^[A-Z0-9]+$'
    ),
    created_at   timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (approval_id, workspace_id, gate)
      REFERENCES governance_approval_requests(approval_id, workspace_id, gate)
      ON DELETE RESTRICT
);

CREATE INDEX governance_approval_analytics_scope_lookup_idx
  ON governance_approval_analytics_scopes (workspace_id, approval_id);

CREATE TRIGGER governance_approval_analytics_scope_immutable
BEFORE UPDATE OR DELETE ON governance_approval_analytics_scopes
FOR EACH ROW EXECUTE FUNCTION reject_governance_immutable_mutation();

-- Down Migration
DROP TRIGGER governance_approval_analytics_scope_immutable
  ON governance_approval_analytics_scopes;
DROP TABLE governance_approval_analytics_scopes;
ALTER TABLE governance_approval_requests
  DROP CONSTRAINT governance_approval_scope_target_unique;
