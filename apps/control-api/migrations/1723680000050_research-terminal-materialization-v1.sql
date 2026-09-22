-- RS-01: durable completion checkpoint.  The source journal remains the
-- authority; this additive row says its terminal sidecars and lifecycle have
-- both committed, so a duplicate callback can safely re-notify viewers.

CREATE TABLE research.run_terminal_materializations_v1 (
  workspace_id             text NOT NULL REFERENCES workspaces(workspace_id),
  run_id                   text NOT NULL,
  worker_attempt_id        text NOT NULL,
  source_sequence          bigint NOT NULL CHECK (source_sequence > 0),
  event_digest             text NOT NULL CHECK (event_digest ~ '^[0-9a-f]{64}$'),
  materialization_revision text NOT NULL CHECK (materialization_revision = 'research.terminal-materialization.v1'),
  materialized_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, run_id, worker_attempt_id, source_sequence),
  FOREIGN KEY (workspace_id, run_id, worker_attempt_id, source_sequence)
    REFERENCES research.run_progress_events(workspace_id, run_id, worker_attempt_id, source_sequence)
);

CREATE TRIGGER research_run_terminal_materializations_v1_immutable_guard
BEFORE UPDATE OR DELETE ON research.run_terminal_materializations_v1
FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();

REVOKE ALL ON research.run_terminal_materializations_v1 FROM PUBLIC;
GRANT SELECT, INSERT ON research.run_terminal_materializations_v1 TO portal_research_runtime;

COMMENT ON TABLE research.run_terminal_materializations_v1 IS
  'RS-01 durable terminal-sidecar/lifecycle checkpoint. It enables retry/fanout recovery without re-running QuantBT or rewriting journal facts.';

SELECT 1;
