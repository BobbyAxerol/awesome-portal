-- Research Loop P05 · immutable disk-first artifact metadata authority.
--
-- Additive only.  This migration extends the Research schema introduced by
-- P03; it neither grants nor references an Execution-owned write path.  Python
-- workers write sealed candidate bytes, while this Control API authority owns
-- reservation, lease fencing, publication state and durable references.

ALTER TABLE research.artifacts
  ALTER COLUMN manifest_digest DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS artifact_revision bigint NOT NULL DEFAULT 0 CHECK (artifact_revision >= 0),
  ADD COLUMN IF NOT EXISTS worker_attempt_id text,
  ADD COLUMN IF NOT EXISTS lease_epoch bigint CHECK (lease_epoch IS NULL OR lease_epoch > 0),
  ADD COLUMN IF NOT EXISTS manifest_schema_version text,
  ADD COLUMN IF NOT EXISTS total_rows bigint NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  ADD COLUMN IF NOT EXISTS total_bytes bigint NOT NULL DEFAULT 0 CHECK (total_bytes >= 0),
  ADD COLUMN IF NOT EXISTS not_before_gc_at timestamptz,
  ADD COLUMN IF NOT EXISTS sealed_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE research.artifacts
  ADD CONSTRAINT research_artifacts_p05_worker_fence_check
  CHECK (
    (worker_attempt_id IS NULL AND lease_epoch IS NULL AND artifact_revision = 0)
    OR
    (worker_attempt_id IS NOT NULL AND lease_epoch IS NOT NULL AND artifact_revision > 0)
  ),
  ADD CONSTRAINT research_artifacts_p05_sealed_manifest_check
  -- P03 rows carry their already-pinned legacy digest in every lifecycle
  -- state.  P05 must not reinterpret or invalidate those rows before P10
  -- moves their named consumers, so this invariant applies only to the
  -- revisioned artifact authority introduced here.
  CHECK (
    artifact_revision = 0
    OR (
      (state IN ('SEALED', 'CORRUPT', 'MISSING') AND manifest_digest IS NOT NULL)
      OR (state IN ('WRITING', 'ABORTED') AND manifest_digest IS NULL)
    )
  );

ALTER TABLE research.artifacts
  ADD CONSTRAINT research_artifacts_worker_attempt_fkey
  FOREIGN KEY (workspace_id, worker_attempt_id)
  REFERENCES research.worker_attempts(workspace_id, worker_attempt_id);

CREATE UNIQUE INDEX research_artifacts_run_revision_idx
  ON research.artifacts (workspace_id, run_id, artifact_revision)
  WHERE artifact_revision > 0;

CREATE INDEX research_artifacts_p05_gc_idx
  ON research.artifacts (workspace_id, retention_class, not_before_gc_at, artifact_id)
  WHERE state = 'SEALED';

CREATE TABLE research.artifact_parts (
  workspace_id       text NOT NULL,
  artifact_id        text NOT NULL,
  table_kind         text NOT NULL CHECK (length(trim(table_kind)) BETWEEN 1 AND 128),
  part_ordinal       integer NOT NULL CHECK (part_ordinal > 0),
  schema_version     text NOT NULL CHECK (length(trim(schema_version)) BETWEEN 1 AND 128),
  relative_path      text NOT NULL CHECK (relative_path !~ '^/' AND relative_path !~ '(^|/)\.\.(/|$)' AND length(trim(relative_path)) BETWEEN 1 AND 1024),
  part_digest        text NOT NULL CHECK (part_digest ~ '^[0-9a-f]{64}$'),
  row_count          bigint NOT NULL CHECK (row_count >= 0),
  byte_count         bigint NOT NULL CHECK (byte_count >= 0),
  sequence_min       text,
  sequence_max       text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, artifact_id, table_kind, part_ordinal),
  UNIQUE (workspace_id, artifact_id, relative_path),
  FOREIGN KEY (workspace_id, artifact_id)
    REFERENCES research.artifacts(workspace_id, artifact_id)
);

CREATE INDEX research_artifact_parts_seek_idx
  ON research.artifact_parts (workspace_id, artifact_id, table_kind, part_ordinal);

CREATE TABLE research.artifact_references (
  workspace_id       text NOT NULL,
  artifact_id        text NOT NULL,
  reference_kind     text NOT NULL CHECK (reference_kind IN (
                       'ACTIVE_LEASE', 'CHILD_RUN', 'EXPOSURE',
                       'RELEASE_CANDIDATE', 'SELECTION', 'VERIFICATION')),
  reference_id       text NOT NULL CHECK (length(trim(reference_id)) BETWEEN 1 AND 256),
  pinned_until       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, artifact_id, reference_kind, reference_id),
  FOREIGN KEY (workspace_id, artifact_id)
    REFERENCES research.artifacts(workspace_id, artifact_id),
  CHECK (reference_kind <> 'ACTIVE_LEASE' OR pinned_until IS NOT NULL)
);

CREATE INDEX research_artifact_references_gc_idx
  ON research.artifact_references (workspace_id, artifact_id, pinned_until);

CREATE TABLE research.artifact_ingest_batches (
  workspace_id       text NOT NULL,
  artifact_id        text NOT NULL,
  study_id           text NOT NULL,
  run_id             text NOT NULL,
  table_kind         text NOT NULL CHECK (table_kind = 'trial_index'),
  source_revision    bigint NOT NULL CHECK (source_revision > 0),
  batch_digest       text NOT NULL CHECK (batch_digest ~ '^[0-9a-f]{64}$'),
  row_count          integer NOT NULL CHECK (row_count > 0 AND row_count <= 256),
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, artifact_id, table_kind, batch_digest),
  FOREIGN KEY (workspace_id, artifact_id)
    REFERENCES research.artifacts(workspace_id, artifact_id),
  FOREIGN KEY (workspace_id, study_id, run_id)
    REFERENCES research.studies(workspace_id, study_id, run_id)
);

CREATE INDEX research_artifact_ingest_batches_study_idx
  ON research.artifact_ingest_batches (workspace_id, study_id, run_id, created_at);

-- P05 state changes must be narrow and one-way.  Legacy P03 artifact rows use
-- revision zero and remain untouched by this transition guard; they are a
-- compatibility surface until P10 migrates their named operations.
CREATE FUNCTION research.guard_p05_artifact_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.artifact_revision = 0 THEN
    RETURN NEW;
  END IF;
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.artifact_id IS DISTINCT FROM OLD.artifact_id
     OR NEW.run_id IS DISTINCT FROM OLD.run_id
     OR NEW.artifact_revision IS DISTINCT FROM OLD.artifact_revision
     OR NEW.worker_attempt_id IS DISTINCT FROM OLD.worker_attempt_id
     OR NEW.lease_epoch IS DISTINCT FROM OLD.lease_epoch
     OR NEW.table_kind IS DISTINCT FROM OLD.table_kind
     OR NEW.schema_version IS DISTINCT FROM OLD.schema_version
     OR NEW.storage_locator IS DISTINCT FROM OLD.storage_locator
     OR NEW.retention_class IS DISTINCT FROM OLD.retention_class
     OR NEW.not_before_gc_at IS DISTINCT FROM OLD.not_before_gc_at THEN
    RAISE EXCEPTION 'research artifact identity is immutable' USING ERRCODE = '55000';
  END IF;

  IF OLD.state = 'WRITING' THEN
    IF NEW.state = 'SEALED' THEN
      IF NEW.manifest_digest IS NULL OR NEW.manifest_schema_version IS NULL
         OR NEW.sealed_at IS NULL THEN
        RAISE EXCEPTION 'sealed research artifact requires manifest and seal timestamp' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END IF;
    IF NEW.state IN ('ABORTED', 'CORRUPT', 'MISSING') THEN
      IF NEW.manifest_digest IS NOT NULL OR NEW.sealed_at IS NOT NULL THEN
        RAISE EXCEPTION 'unsealed terminal artifact cannot carry a final manifest' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END IF;
  ELSIF OLD.state = 'SEALED' AND NEW.state IN ('CORRUPT', 'MISSING') THEN
    IF NEW.manifest_digest IS DISTINCT FROM OLD.manifest_digest
       OR NEW.manifest_schema_version IS DISTINCT FROM OLD.manifest_schema_version
       OR NEW.total_rows IS DISTINCT FROM OLD.total_rows
       OR NEW.total_bytes IS DISTINCT FROM OLD.total_bytes
       OR NEW.sealed_at IS DISTINCT FROM OLD.sealed_at THEN
      RAISE EXCEPTION 'integrity downgrade cannot alter sealed artifact facts' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'invalid research artifact lifecycle transition % -> %', OLD.state, NEW.state
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER research_artifacts_p05_transition_guard
BEFORE UPDATE ON research.artifacts
FOR EACH ROW EXECUTE FUNCTION research.guard_p05_artifact_transition();

CREATE TRIGGER research_artifact_parts_immutable_guard
BEFORE UPDATE OR DELETE ON research.artifact_parts
FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();

CREATE TRIGGER research_artifact_references_immutable_guard
BEFORE UPDATE OR DELETE ON research.artifact_references
FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();

CREATE TRIGGER research_artifact_ingest_batches_immutable_guard
BEFORE UPDATE OR DELETE ON research.artifact_ingest_batches
FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();

REVOKE ALL ON FUNCTION research.guard_p05_artifact_transition() FROM PUBLIC;

-- The runtime role still has no DELETE, DDL, broker, or Execution authority.
-- It may reserve a run revision and make only the reviewed one-way artifact
-- state transition; final byte data remains outside PostgreSQL.
GRANT SELECT, INSERT ON research.artifact_parts, research.artifact_references,
  research.artifact_ingest_batches TO portal_research_runtime;
GRANT UPDATE (artifact_revision, updated_at) ON research.runs TO portal_research_runtime;
GRANT UPDATE (
  state,
  manifest_digest,
  manifest_schema_version,
  total_rows,
  total_bytes,
  sealed_at,
  updated_at
) ON research.artifacts TO portal_research_runtime;

COMMENT ON TABLE research.artifact_parts IS
  'P05 immutable bounded Parquet part metadata; bytes stay in Research-only storage.';
COMMENT ON TABLE research.artifact_references IS
  'P05 durable retention pins. Cache eviction never deletes these references.';
COMMENT ON TABLE research.artifact_ingest_batches IS
  'P05 idempotency ledger for bounded trial-index ingestion batches.';
COMMENT ON FUNCTION research.guard_p05_artifact_transition() IS
  'P05 one-way fence-aware artifact lifecycle guard; no mutable sealed facts.';

-- Down Migration
-- Research evidence is intentionally retained.  Reader/image rollback keeps
-- P05 metadata and sealed bytes available, so this down migration is a no-op.
SELECT 1;
