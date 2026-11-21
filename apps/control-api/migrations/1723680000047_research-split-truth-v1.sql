-- Research Loop P14 · immutable split / chronology source and projection lane.
--
-- The installed P04 adapter emits one fixed-profile three-window receipt.
-- This stores the bounded source fact and a Portal projection only; it is not
-- a snapshot/Parquet mirror, a raw holdout result, an evaluation editor or a
-- holdout-unlock authority. Future WFO/holdout revisions append new tables or
-- revisions rather than rewriting this historical current-source truth.

CREATE TABLE research.run_split_sources_v1 (
  workspace_id             text NOT NULL REFERENCES workspaces(workspace_id),
  run_id                   text NOT NULL,
  worker_attempt_id        text NOT NULL,
  source_event_sequence    bigint NOT NULL CHECK (source_event_sequence > 0),
  source_split_digest      text NOT NULL CHECK (source_split_digest ~ '^[0-9a-f]{64}$'),
  source_payload           jsonb NOT NULL CHECK (jsonb_typeof(source_payload) = 'object'),
  received_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, run_id, worker_attempt_id, source_event_sequence),
  UNIQUE (workspace_id, run_id, worker_attempt_id, source_split_digest),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES research.runs(workspace_id, run_id),
  FOREIGN KEY (workspace_id, worker_attempt_id)
    REFERENCES research.worker_attempts(workspace_id, worker_attempt_id),
  CHECK (octet_length(source_payload::text) <= 16384)
);

CREATE TABLE research.run_split_projections_v1 (
  workspace_id             text NOT NULL REFERENCES workspaces(workspace_id),
  run_id                   text NOT NULL,
  worker_attempt_id        text NOT NULL,
  projection_revision      text NOT NULL CHECK (projection_revision ~ '^p14r1_[0-9a-f]{64}$'),
  source_event_sequence    bigint NOT NULL CHECK (source_event_sequence > 0),
  source_split_digest      text NOT NULL CHECK (source_split_digest ~ '^[0-9a-f]{64}$'),
  projection_version       text NOT NULL CHECK (projection_version = 'research.split-projection.v1'),
  projection_digest        text NOT NULL CHECK (projection_digest ~ '^[0-9a-f]{64}$'),
  readiness                text NOT NULL CHECK (readiness IN ('COMPLETE', 'PARTIAL')),
  projection               jsonb NOT NULL CHECK (jsonb_typeof(projection) = 'object'),
  received_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, run_id, worker_attempt_id, projection_revision),
  FOREIGN KEY (workspace_id, run_id, worker_attempt_id, source_event_sequence)
    REFERENCES research.run_split_sources_v1(workspace_id, run_id, worker_attempt_id, source_event_sequence),
  CHECK (octet_length(projection::text) <= 16384)
);

CREATE INDEX research_run_split_projections_current_idx
  ON research.run_split_projections_v1 (workspace_id, run_id, received_at DESC, projection_revision DESC);

CREATE TRIGGER research_run_split_sources_v1_immutable_guard
BEFORE UPDATE OR DELETE ON research.run_split_sources_v1
FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();

CREATE TRIGGER research_run_split_projections_v1_immutable_guard
BEFORE UPDATE OR DELETE ON research.run_split_projections_v1
FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();

REVOKE ALL ON research.run_split_sources_v1, research.run_split_projections_v1 FROM PUBLIC;
GRANT SELECT, INSERT ON research.run_split_sources_v1 TO portal_research_runtime;
GRANT SELECT, INSERT ON research.run_split_projections_v1 TO portal_research_runtime;

COMMENT ON TABLE research.run_split_sources_v1 IS
  'P14 immutable bounded P04 three-window chronology receipt. No raw market rows, holdout values, source paths, worker custody or unlock authority.';
COMMENT ON TABLE research.run_split_projections_v1 IS
  'P14 immutable Portal read projection. Disabling FEATURE_RESEARCH_SPLIT hides the route but does not delete source chronology facts.';

-- Down migration intentionally retains split truth. Rollback is feature-dark,
-- never destructive of audited source facts.
SELECT 1;
