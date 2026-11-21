-- Research Loop P11 · durable structured progress projection.
--
-- The worker journal is the source-side recovery authority.  These tables are
-- Control API's bounded, queryable materialisation of that journal; they do
-- not store raw stdout, source rows, filesystem paths, broker credentials or
-- a user-selectable worker payload.

CREATE TABLE research.run_progress_events (
  workspace_id           text NOT NULL REFERENCES workspaces(workspace_id),
  run_id                 text NOT NULL,
  worker_attempt_id      text NOT NULL,
  source_sequence        bigint NOT NULL CHECK (source_sequence > 0),
  lease_epoch            bigint NOT NULL CHECK (lease_epoch > 0),
  event_type             text NOT NULL CHECK (event_type IN (
                         'run_started', 'stage_started', 'stage_completed',
                         'trial_completed', 'fold_completed',
                         'fold_segment_observed',
                         'artifact_writing', 'artifact_sealed', 'budget_tick',
                         'heartbeat', 'seal_started', 'run_completed', 'run_failed'
                       )),
  occurred_at_utc_ms     bigint NOT NULL CHECK (occurred_at_utc_ms >= 0),
  event_payload          jsonb NOT NULL CHECK (jsonb_typeof(event_payload) = 'object'),
  event_digest           text NOT NULL CHECK (event_digest ~ '^[0-9a-f]{64}$'),
  received_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, run_id, worker_attempt_id, source_sequence),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES research.runs(workspace_id, run_id),
  FOREIGN KEY (workspace_id, worker_attempt_id)
    REFERENCES research.worker_attempts(workspace_id, worker_attempt_id),
  CHECK (octet_length(event_payload::text) <= 4096)
);

CREATE INDEX research_run_progress_events_page_idx
  ON research.run_progress_events (workspace_id, run_id, worker_attempt_id, source_sequence);

CREATE TABLE research.run_progress_snapshots (
  workspace_id               text NOT NULL REFERENCES workspaces(workspace_id),
  run_id                     text NOT NULL,
  worker_attempt_id          text NOT NULL,
  lease_epoch                bigint NOT NULL CHECK (lease_epoch > 0),
  source_latest_sequence     bigint NOT NULL CHECK (source_latest_sequence >= 0),
  retention_floor_sequence   bigint NOT NULL CHECK (
                              retention_floor_sequence >= 0
                              AND retention_floor_sequence <= source_latest_sequence
                            ),
  snapshot                   jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  snapshot_digest            text NOT NULL CHECK (snapshot_digest ~ '^[0-9a-f]{64}$'),
  received_at                timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, run_id, worker_attempt_id),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES research.runs(workspace_id, run_id),
  FOREIGN KEY (workspace_id, worker_attempt_id)
    REFERENCES research.worker_attempts(workspace_id, worker_attempt_id),
  -- P11 is a compact projection, not an artifact or log archive.  256 KiB
  -- accommodates the declared 256-fold/128-artifact bounded projection while
  -- keeping a live snapshot far below an unbounded transport/read surface.
  CHECK (octet_length(snapshot::text) <= 262144)
);

CREATE INDEX research_run_progress_snapshots_current_idx
  ON research.run_progress_snapshots (workspace_id, run_id, received_at DESC);

CREATE TRIGGER research_run_progress_events_immutable_guard
BEFORE UPDATE OR DELETE ON research.run_progress_events
FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();

REVOKE ALL ON FUNCTION research.prevent_immutable_log_mutation() FROM PUBLIC;
GRANT SELECT, INSERT ON research.run_progress_events TO portal_research_runtime;
GRANT SELECT, INSERT, UPDATE (source_latest_sequence, retention_floor_sequence,
  snapshot, snapshot_digest, received_at) ON research.run_progress_snapshots
  TO portal_research_runtime;

COMMENT ON TABLE research.run_progress_events IS
  'P11 immutable structured worker lifecycle journal. Console lines, if supplied, are explicit event payloads and never parsed from stdout.';
COMMENT ON TABLE research.run_progress_snapshots IS
  'P11 compact current projection keyed by the exact P06 worker attempt and lease epoch; stale attempts cannot overwrite the current run.';

-- Down migration intentionally retains operational/audit evidence. Rollback
-- disables FEATURE_RESEARCH_PROGRESS; it never deletes completed run facts.
SELECT 1;
