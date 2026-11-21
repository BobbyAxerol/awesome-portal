-- Research Loop P18 · immutable report manifest and bounded reproducible export.
--
-- A report is a Portal presentation of already sealed P13--P17 facts.  It is
-- intentionally not an artifact mirror, a PDF renderer queue, or a path into
-- the QuantBT worker/source filesystem.  Export bytes are kept deliberately
-- small and durable so a process restart or a slow browser cannot require a
-- recomputation or leave scratch files behind.

CREATE TABLE research.run_report_manifests_v1 (
  workspace_id             text NOT NULL REFERENCES workspaces(workspace_id),
  run_id                   text NOT NULL,
  report_revision          text NOT NULL CHECK (report_revision ~ '^p18r1_[0-9a-f]{64}$'),
  frozen_core_digest       text NOT NULL CHECK (frozen_core_digest ~ '^[0-9a-f]{64}$'),
  frozen_core              jsonb NOT NULL CHECK (jsonb_typeof(frozen_core) = 'object' AND octet_length(frozen_core::text) <= 262144),
  sealed_at                timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, run_id, report_revision),
  UNIQUE (workspace_id, run_id, frozen_core_digest),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES research.runs(workspace_id, run_id)
);

CREATE INDEX research_run_report_manifests_v1_read_idx
  ON research.run_report_manifests_v1 (workspace_id, run_id, sealed_at DESC, report_revision DESC);

-- Approval state deliberately has a separate mutable source. It cannot alter
-- the frozen report core or its revision/digest.
CREATE TABLE research.run_report_annotations_v1 (
  workspace_id             text NOT NULL,
  run_id                   text NOT NULL,
  report_revision          text NOT NULL,
  annotation_state         text NOT NULL CHECK (annotation_state IN ('NOT_PUBLISHED', 'AVAILABLE')),
  annotation_text          text NULL CHECK (annotation_text IS NULL OR octet_length(annotation_text) <= 2048),
  source_updated_at        timestamptz NULL,
  PRIMARY KEY (workspace_id, run_id, report_revision),
  FOREIGN KEY (workspace_id, run_id, report_revision)
    REFERENCES research.run_report_manifests_v1(workspace_id, run_id, report_revision)
);

CREATE TABLE research.run_report_export_jobs_v1 (
  workspace_id             text NOT NULL,
  run_id                   text NOT NULL,
  report_revision          text NOT NULL,
  job_id                   text NOT NULL CHECK (job_id ~ '^rpex_[0-9A-HJKMNP-TV-Z]{26}$'),
  format                   text NOT NULL CHECK (format IN ('REPORT_JSON', 'REPORT_CSV')),
  requested_by_user_id     text NOT NULL,
  state                    text NOT NULL CHECK (state IN ('QUEUED', 'RUNNING', 'READY', 'FAILED')),
  requested_at             timestamptz NOT NULL DEFAULT now(),
  lease_token              text NULL CHECK (lease_token IS NULL OR lease_token ~ '^[0-9a-f]{64}$'),
  lease_expires_at         timestamptz NULL,
  attempt_count            integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 8),
  completed_at             timestamptz NULL,
  output_bytes             bytea NULL CHECK (output_bytes IS NULL OR octet_length(output_bytes) <= 524288),
  output_sha256            text NULL CHECK (output_sha256 IS NULL OR output_sha256 ~ '^[0-9a-f]{64}$'),
  content_type             text NULL CHECK (content_type IN ('application/json', 'text/csv')),
  filename                 text NULL CHECK (filename IS NULL OR filename ~ '^quantbt-[A-Za-z0-9._-]+-p18r1_[0-9a-f]{64}\.(json|csv)$'),
  failure_code             text NULL CHECK (failure_code IS NULL OR failure_code ~ '^[A-Z][A-Z0-9_]{2,159}$'),
  PRIMARY KEY (workspace_id, job_id),
  FOREIGN KEY (workspace_id, run_id, report_revision)
    REFERENCES research.run_report_manifests_v1(workspace_id, run_id, report_revision),
  CHECK (
    (state = 'READY' AND completed_at IS NOT NULL AND output_bytes IS NOT NULL AND output_sha256 IS NOT NULL
      AND content_type IS NOT NULL AND filename IS NOT NULL AND failure_code IS NULL)
    OR (state = 'FAILED' AND completed_at IS NOT NULL AND output_bytes IS NULL AND output_sha256 IS NULL
      AND content_type IS NULL AND filename IS NULL AND failure_code IS NOT NULL)
    OR (state IN ('QUEUED', 'RUNNING') AND completed_at IS NULL AND output_bytes IS NULL
      AND output_sha256 IS NULL AND content_type IS NULL AND filename IS NULL AND failure_code IS NULL)
  )
);

-- A duplicate click returns the same durable completed/in-flight job rather
-- than allocating arbitrarily many report copies for one actor/revision.
CREATE UNIQUE INDEX research_run_report_export_jobs_v1_dedupe_idx
  ON research.run_report_export_jobs_v1 (workspace_id, run_id, report_revision, requested_by_user_id, format)
  WHERE state IN ('QUEUED', 'RUNNING', 'READY');

CREATE INDEX research_run_report_export_jobs_v1_claim_idx
  ON research.run_report_export_jobs_v1 (state, lease_expires_at, requested_at)
  WHERE state IN ('QUEUED', 'RUNNING');

CREATE OR REPLACE FUNCTION research.guard_report_export_job_v1()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'report export job is retained for audit' USING ERRCODE = '55000';
  END IF;
  IF NEW.workspace_id <> OLD.workspace_id OR NEW.run_id <> OLD.run_id
    OR NEW.report_revision <> OLD.report_revision OR NEW.job_id <> OLD.job_id
    OR NEW.format <> OLD.format OR NEW.requested_by_user_id <> OLD.requested_by_user_id
    OR NEW.requested_at <> OLD.requested_at THEN
    RAISE EXCEPTION 'report export job identity is immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.state IN ('READY', 'FAILED') THEN
    RAISE EXCEPTION 'completed report export job is immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW.state NOT IN ('QUEUED', 'RUNNING', 'READY', 'FAILED') THEN
    RAISE EXCEPTION 'invalid report export job state' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER research_run_report_manifests_v1_immutable_guard
BEFORE UPDATE OR DELETE ON research.run_report_manifests_v1
FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();

CREATE TRIGGER research_run_report_export_jobs_v1_guard
BEFORE UPDATE OR DELETE ON research.run_report_export_jobs_v1
FOR EACH ROW EXECUTE FUNCTION research.guard_report_export_job_v1();

REVOKE ALL ON research.run_report_manifests_v1, research.run_report_annotations_v1,
  research.run_report_export_jobs_v1 FROM PUBLIC;
GRANT SELECT, INSERT ON research.run_report_manifests_v1 TO portal_research_runtime;
GRANT SELECT, INSERT, UPDATE ON research.run_report_annotations_v1 TO portal_research_runtime;
GRANT SELECT, INSERT, UPDATE ON research.run_report_export_jobs_v1 TO portal_research_runtime;

COMMENT ON TABLE research.run_report_manifests_v1 IS
  'P18 immutable Portal-sealed report core built only from P13--P17 persisted projections; never engine output or a worker path.';
COMMENT ON TABLE research.run_report_annotations_v1 IS
  'P18 separately mutable approval annotation source; it never rewrites frozen evidence.';
COMMENT ON TABLE research.run_report_export_jobs_v1 IS
  'P18 bounded durable JSON/CSV transform jobs. Bytes are capped at 512 KiB and never use a scratch filesystem.';

-- Rollback disables FEATURE_RESEARCH_REPORTS and its transformer. Historical
-- report cores and exported bytes intentionally remain readable to recovery.
SELECT 1;
