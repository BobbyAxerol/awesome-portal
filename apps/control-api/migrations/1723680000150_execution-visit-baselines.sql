-- Portal-owned per-user/workspace UI baseline. Not a TS ledger or login timestamp.
-- Up Migration
CREATE TABLE execution_visit_baselines (
  user_id text NOT NULL REFERENCES portal_users(user_id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  seen_at timestamptz NOT NULL,
  snapshot_revision text NOT NULL CHECK (length(snapshot_revision) BETWEEN 1 AND 160),
  fingerprints jsonb NOT NULL CHECK (jsonb_typeof(fingerprints)='object' AND octet_length(fingerprints::text)<=98304),
  PRIMARY KEY (user_id,workspace_id),
  FOREIGN KEY (workspace_id,user_id) REFERENCES workspace_members(workspace_id,user_id) ON DELETE CASCADE
);

-- Down Migration
DROP TABLE execution_visit_baselines;
