-- Research Loop P13 · immutable Evidence Flow source and projection lane.
--
-- P13 stores a compact receipt emitted by the confined QuantBT child, then a
-- Portal-owned compact projection plus four separately lazy chart series.
-- It is intentionally not an artifact index, a worker filesystem mirror, or
-- a raw OHLCV/ledger store.  Later projection versions append a new immutable
-- revision; they never edit a historical evidence decision in place.

CREATE TABLE research.run_evidence_sources_v1 (
  workspace_id             text NOT NULL REFERENCES workspaces(workspace_id),
  run_id                   text NOT NULL,
  worker_attempt_id        text NOT NULL,
  source_event_sequence    bigint NOT NULL CHECK (source_event_sequence > 0),
  source_evidence_digest   text NOT NULL CHECK (source_evidence_digest ~ '^[0-9a-f]{64}$'),
  source_payload           jsonb NOT NULL CHECK (jsonb_typeof(source_payload) = 'object'),
  received_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, run_id, worker_attempt_id, source_event_sequence),
  UNIQUE (workspace_id, run_id, worker_attempt_id, source_evidence_digest),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES research.runs(workspace_id, run_id),
  FOREIGN KEY (workspace_id, worker_attempt_id)
    REFERENCES research.worker_attempts(workspace_id, worker_attempt_id),
  CHECK (octet_length(source_payload::text) <= 32768)
);

CREATE TABLE research.run_evidence_projections_v1 (
  workspace_id             text NOT NULL REFERENCES workspaces(workspace_id),
  run_id                   text NOT NULL,
  worker_attempt_id        text NOT NULL,
  projection_revision      text NOT NULL CHECK (projection_revision ~ '^p13r1_[0-9a-f]{64}$'),
  source_event_sequence    bigint NOT NULL CHECK (source_event_sequence > 0),
  source_evidence_digest   text NOT NULL CHECK (source_evidence_digest ~ '^[0-9a-f]{64}$'),
  projection_version       text NOT NULL CHECK (projection_version = 'research.evidence-projection.v1'),
  projection_digest        text NOT NULL CHECK (projection_digest ~ '^[0-9a-f]{64}$'),
  readiness                text NOT NULL CHECK (readiness IN ('COMPLETE', 'PARTIAL')),
  projection               jsonb NOT NULL CHECK (jsonb_typeof(projection) = 'object'),
  received_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, run_id, worker_attempt_id, projection_revision),
  FOREIGN KEY (workspace_id, run_id, worker_attempt_id, source_event_sequence)
    REFERENCES research.run_evidence_sources_v1(workspace_id, run_id, worker_attempt_id, source_event_sequence),
  CHECK (octet_length(projection::text) <= 32768)
);

CREATE INDEX research_run_evidence_projections_current_idx
  ON research.run_evidence_projections_v1 (workspace_id, run_id, received_at DESC, projection_revision DESC);

CREATE TABLE research.run_evidence_series_v1 (
  workspace_id             text NOT NULL REFERENCES workspaces(workspace_id),
  run_id                   text NOT NULL,
  worker_attempt_id        text NOT NULL,
  projection_revision      text NOT NULL,
  series_kind              text NOT NULL CHECK (series_kind IN (
                            'EQUITY_OOS', 'MONTHLY_RETURNS',
                            'ROLLING_RETURNS_20', 'RETURN_DISTRIBUTION'
                          )),
  availability_state       text NOT NULL CHECK (availability_state IN ('AVAILABLE', 'NOT_PUBLISHED', 'NOT_APPLICABLE')),
  reason_code              text NULL CHECK (reason_code IS NULL OR reason_code ~ '^[A-Z][A-Z0-9_]{2,159}$'),
  source_observation_count integer NULL CHECK (source_observation_count > 0),
  emitted_point_count      integer NOT NULL CHECK (emitted_point_count >= 0 AND emitted_point_count <= 192),
  sampling                 text NULL CHECK (sampling IN ('FULL', 'EXTREMA_BUCKET_V1')),
  series_payload           jsonb NOT NULL CHECK (jsonb_typeof(series_payload) = 'array'),
  series_digest            text NOT NULL CHECK (series_digest ~ '^[0-9a-f]{64}$'),
  received_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, run_id, worker_attempt_id, projection_revision, series_kind),
  FOREIGN KEY (workspace_id, run_id, worker_attempt_id, projection_revision)
    REFERENCES research.run_evidence_projections_v1(workspace_id, run_id, worker_attempt_id, projection_revision),
  CHECK (octet_length(series_payload::text) <= 32768)
);

CREATE INDEX research_run_evidence_series_read_idx
  ON research.run_evidence_series_v1 (workspace_id, run_id, projection_revision, series_kind);

CREATE TRIGGER research_run_evidence_sources_v1_immutable_guard
BEFORE UPDATE OR DELETE ON research.run_evidence_sources_v1
FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();

CREATE TRIGGER research_run_evidence_projections_v1_immutable_guard
BEFORE UPDATE OR DELETE ON research.run_evidence_projections_v1
FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();

CREATE TRIGGER research_run_evidence_series_v1_immutable_guard
BEFORE UPDATE OR DELETE ON research.run_evidence_series_v1
FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();

REVOKE ALL ON research.run_evidence_sources_v1, research.run_evidence_projections_v1,
  research.run_evidence_series_v1 FROM PUBLIC;
GRANT SELECT, INSERT ON research.run_evidence_sources_v1 TO portal_research_runtime;
GRANT SELECT, INSERT ON research.run_evidence_projections_v1 TO portal_research_runtime;
GRANT SELECT, INSERT ON research.run_evidence_series_v1 TO portal_research_runtime;

COMMENT ON TABLE research.run_evidence_sources_v1 IS
  'P13 immutable bounded source receipt from the confined QuantBT child; no raw market rows, source paths, credentials or worker controls.';
COMMENT ON TABLE research.run_evidence_projections_v1 IS
  'P13 immutable Portal evidence projection revision; rollback changes the read namespace, never stored source evidence.';
COMMENT ON TABLE research.run_evidence_series_v1 IS
  'P13 bounded lazy chart data keyed by the same immutable projection revision as the Hub summary.';

-- Down migration intentionally retains evidence. A rollback disables
-- FEATURE_RESEARCH_EVIDENCE; it must never delete historical Research facts.
SELECT 1;
