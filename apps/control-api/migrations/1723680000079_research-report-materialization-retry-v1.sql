-- LW-02: durable, bounded repair status for terminal Research reports.
-- The immutable report manifest remains authoritative; this row only records
-- repair attempts and never contains source artifacts or report bytes.
CREATE TABLE research.run_report_materialization_retries_v1 (
  workspace_id text NOT NULL,
  run_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('RETRY', 'FAILED', 'SEALED')),
  failure_code text NULL CHECK (failure_code IS NULL OR failure_code ~ '^[A-Z][A-Z0-9_]{2,159}$'),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 1000000),
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  next_attempt_at timestamptz NULL,
  PRIMARY KEY (workspace_id, run_id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES research.runs(workspace_id, run_id),
  CHECK ((state = 'SEALED' AND failure_code IS NULL AND next_attempt_at IS NULL)
      OR (state = 'RETRY' AND failure_code IS NULL AND next_attempt_at IS NOT NULL)
      OR (state = 'FAILED' AND failure_code IS NOT NULL AND next_attempt_at IS NOT NULL))
);

CREATE INDEX research_report_materialization_retry_due_idx
  ON research.run_report_materialization_retries_v1 (workspace_id, next_attempt_at, run_id)
  WHERE state IN ('RETRY', 'FAILED');

REVOKE ALL ON research.run_report_materialization_retries_v1 FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON research.run_report_materialization_retries_v1 TO portal_research_runtime;

COMMENT ON TABLE research.run_report_materialization_retries_v1 IS
  'LW-02: bounded idempotent terminal-report repair state. A failed sidecar cannot disappear behind a 404.';
