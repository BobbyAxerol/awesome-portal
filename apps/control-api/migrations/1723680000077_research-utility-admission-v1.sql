-- P23-T12: cross-replica, bounded slots for explicit byte verification.
-- Export and what-if remain in their existing durable job tables; admission
-- counts those jobs together with these short-lived observer slots.
CREATE TABLE research.utility_verify_slots_v1 (
  workspace_id text NOT NULL REFERENCES workspaces(workspace_id),
  slot_id text NOT NULL CHECK (slot_id ~ '^[0-9a-f]{32}$'),
  actor_user_id text NOT NULL REFERENCES portal_users(user_id),
  run_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, slot_id),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '30 seconds')
);

CREATE INDEX utility_verify_slots_v1_active_idx
  ON research.utility_verify_slots_v1(workspace_id, expires_at, actor_user_id);

REVOKE ALL ON research.utility_verify_slots_v1 FROM PUBLIC;
GRANT SELECT, INSERT, DELETE ON research.utility_verify_slots_v1 TO portal_research_runtime;

CREATE INDEX research_report_export_utility_active_idx
  ON research.run_report_export_jobs_v1(workspace_id, requested_by_user_id)
  WHERE state IN ('QUEUED', 'RUNNING');
CREATE INDEX research_diagnostic_utility_active_idx
  ON research.jobs(workspace_id, requested_by_user_id)
  WHERE job_kind = 'DIAGNOSTIC' AND state IN ('QUEUED', 'CLAIMED', 'RUNNING');

COMMENT ON TABLE research.utility_verify_slots_v1 IS
  'P23 transient cross-replica observer admission; no artifact bytes or Research results. Slots expire after at most 30 seconds and are deleted on exact-request exit.';
