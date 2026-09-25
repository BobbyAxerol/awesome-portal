-- W5a (Claude) · P16 Freeze completion: A10a byte-verification receipts and
-- the A10c what-if diagnostic lane.
--
-- Forward-only and additive. No existing row, digest, constraint semantics
-- for a P04/W1 run, or Execution relation changes. Expected artifact digests
-- keep living only in research.artifacts / research.artifact_parts (already
-- immutable once SEALED); nothing here can rewrite them.

-- --------------------------------------------------------------- A10a
-- One immutable, bounded receipt per explicit POST verify. The receipt holds
-- the expectation it was compared against (copied from the seal record) and
-- what the private observer saw; a later verify appends, never replaces.
CREATE TABLE research.artifact_byte_receipts_v1 (
  workspace_id              text NOT NULL REFERENCES workspaces(workspace_id),
  receipt_id                text NOT NULL CHECK (receipt_id ~ '^rabv_[0-9a-f]{32}$'),
  run_id                    text NOT NULL,
  artifact_id               text NOT NULL,
  artifact_revision         bigint NOT NULL CHECK (artifact_revision > 0),
  state                     text NOT NULL CHECK (state IN ('MATCH', 'MISMATCH', 'MISSING')),
  expected_manifest_digest  text NOT NULL CHECK (expected_manifest_digest ~ '^[0-9a-f]{64}$'),
  observed_manifest_digest  text NULL CHECK (observed_manifest_digest IS NULL OR observed_manifest_digest ~ '^[0-9a-f]{64}$'),
  parts_checked             integer NOT NULL CHECK (parts_checked BETWEEN 1 AND 256),
  parts_mismatched          integer NOT NULL CHECK (parts_mismatched >= 0 AND parts_mismatched <= parts_checked),
  documents_checked         integer NOT NULL CHECK (documents_checked BETWEEN 0 AND 16),
  mismatches                jsonb NOT NULL CHECK (
                              jsonb_typeof(mismatches) = 'array'
                              AND jsonb_array_length(mismatches) <= 32
                              AND octet_length(mismatches::text) <= 16384),
  requested_by_user_id      text NOT NULL REFERENCES portal_users(user_id),
  verified_at               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, receipt_id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES research.runs(workspace_id, run_id),
  FOREIGN KEY (workspace_id, artifact_id) REFERENCES research.artifacts(workspace_id, artifact_id),
  -- A MATCH is only ever recorded with a matching manifest and no bad part.
  CHECK (state <> 'MATCH' OR (parts_mismatched = 0
                              AND observed_manifest_digest = expected_manifest_digest
                              AND jsonb_array_length(mismatches) = 0))
);

CREATE INDEX artifact_byte_receipts_v1_latest_idx
  ON research.artifact_byte_receipts_v1 (workspace_id, run_id, verified_at DESC, receipt_id DESC);

-- The receipt must describe the exact sealed expectation it names.
CREATE OR REPLACE FUNCTION research.validate_artifact_byte_receipt_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, research
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM research.artifacts artifact
     WHERE artifact.workspace_id = NEW.workspace_id
       AND artifact.artifact_id = NEW.artifact_id
       AND artifact.run_id = NEW.run_id
       AND artifact.artifact_revision = NEW.artifact_revision
       AND artifact.manifest_digest = NEW.expected_manifest_digest
  ) THEN
    RAISE EXCEPTION 'byte receipt must compare against the sealed manifest digest of its own artifact'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER artifact_byte_receipts_v1_validate
BEFORE INSERT ON research.artifact_byte_receipts_v1
FOR EACH ROW EXECUTE FUNCTION research.validate_artifact_byte_receipt_v1();

CREATE TRIGGER artifact_byte_receipts_v1_immutable_guard
BEFORE UPDATE OR DELETE ON research.artifact_byte_receipts_v1
FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();

REVOKE ALL ON FUNCTION research.validate_artifact_byte_receipt_v1() FROM PUBLIC;
REVOKE ALL ON research.artifact_byte_receipts_v1 FROM PUBLIC;
GRANT SELECT, INSERT ON research.artifact_byte_receipts_v1 TO portal_research_runtime;

COMMENT ON TABLE research.artifact_byte_receipts_v1 IS
  'W5a A10a: append-only P16 byte-verification receipts; expected digests come from the P05 seal and are never rewritten.';

-- --------------------------------------------------------------- A10c
-- A what-if diagnostic is its own DIAGNOSTIC attempt (child of the frozen
-- run's attempt) with one DIAGNOSTIC_OF_RUN run and one DIAGNOSTIC job, so the
-- P06 claim/finish transitions never touch the frozen run. Its producer row
-- carries the locked what-if profile and nothing else may.
DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'research.attempts'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%intent_kind%'
  LOOP
    EXECUTE format('ALTER TABLE research.attempts DROP CONSTRAINT %I', constraint_name);
  END LOOP;
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'research.run_producers'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%intent_kind%'
  LOOP
    EXECUTE format('ALTER TABLE research.run_producers DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END;
$$;

ALTER TABLE research.attempts
  ADD CONSTRAINT attempts_intent_kind_check
    CHECK (intent_kind IN ('NEW', 'CLONE_FOR_EXPERIMENT', 'REPRODUCE_EXISTING',
                           'UPGRADE_ENGINE_EXPERIMENT', 'DIAGNOSTIC'));

ALTER TABLE research.run_producers
  DROP CONSTRAINT run_producers_execution_profile_id_check,
  DROP CONSTRAINT run_producers_execution_profile_digest_check;

ALTER TABLE research.run_producers
  ADD CONSTRAINT run_producers_intent_kind_check
    CHECK (intent_kind IN ('NEW', 'CLONE_FOR_EXPERIMENT', 'REPRODUCE_EXISTING',
                           'UPGRADE_ENGINE_EXPERIMENT', 'DIAGNOSTIC')),
  ADD CONSTRAINT run_producers_execution_profile_id_check
    CHECK (execution_profile_id IN ('p04.fixed-qualification.v1', 'p10.delta-signal-notional-wfo.v1',
                                    'p16.delta-whatif-grid.v1')),
  ADD CONSTRAINT run_producers_execution_profile_digest_check
    CHECK (
      (execution_profile_id = 'p04.fixed-qualification.v1' AND execution_profile_digest IS NULL)
      OR (execution_profile_id = 'p10.delta-signal-notional-wfo.v1'
          AND execution_profile_digest IS NOT NULL
          AND execution_profile_digest = 'b86c66fa68c41e76c6106bd06a48b5ba1281bc4b168a915ec2fa7e34ec2a6cca')
      OR (execution_profile_id = 'p16.delta-whatif-grid.v1'
          AND execution_profile_digest IS NOT NULL
          AND execution_profile_digest = '3c29160abf214a0ef1c20c630048442ef131aadc1d00849f69ae428d0ff513bc')
    ),
  -- A DIAGNOSTIC intent exists only as the what-if profile, and vice versa.
  ADD CONSTRAINT run_producers_diagnostic_profile_pair_check
    CHECK ((intent_kind = 'DIAGNOSTIC') = (execution_profile_id = 'p16.delta-whatif-grid.v1'));

-- One admitted diagnostic job per row: which parent, which grid, which
-- evaluations (≤81 unique keys). Immutable once written.
CREATE TABLE research.whatif_jobs_v1 (
  workspace_id          text NOT NULL REFERENCES workspaces(workspace_id),
  diagnostic_run_id     text NOT NULL,
  parent_run_id         text NOT NULL,
  grid_key              text NOT NULL CHECK (grid_key ~ '^[0-9a-f]{64}$'),
  profile_digest        text NOT NULL CHECK (profile_digest = '3c29160abf214a0ef1c20c630048442ef131aadc1d00849f69ae428d0ff513bc'),
  evaluations           jsonb NOT NULL CHECK (
                          jsonb_typeof(evaluations) = 'array'
                          AND jsonb_array_length(evaluations) BETWEEN 1 AND 81
                          AND octet_length(evaluations::text) <= 65536),
  evaluation_count      integer NOT NULL CHECK (evaluation_count BETWEEN 1 AND 81),
  requested_by_user_id  text NOT NULL REFERENCES portal_users(user_id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, diagnostic_run_id),
  FOREIGN KEY (workspace_id, diagnostic_run_id) REFERENCES research.runs(workspace_id, run_id),
  FOREIGN KEY (workspace_id, parent_run_id) REFERENCES research.runs(workspace_id, run_id),
  CHECK (diagnostic_run_id <> parent_run_id),
  CHECK (jsonb_array_length(evaluations) = evaluation_count)
);

CREATE INDEX whatif_jobs_v1_parent_idx
  ON research.whatif_jobs_v1 (workspace_id, parent_run_id, created_at DESC, diagnostic_run_id DESC);

-- The sealed WHATIF_GRID relation: the exact results of one diagnostic job,
-- bound to its own sealed P05 artifact. Written once by the lease-fenced
-- worker ingest; read by the Screen-07 what-if lane.
CREATE TABLE research.whatif_grids_v1 (
  workspace_id          text NOT NULL REFERENCES workspaces(workspace_id),
  diagnostic_run_id     text NOT NULL,
  parent_run_id         text NOT NULL,
  grid_key              text NOT NULL CHECK (grid_key ~ '^[0-9a-f]{64}$'),
  artifact_id           text NOT NULL,
  artifact_revision     bigint NOT NULL CHECK (artifact_revision > 0),
  manifest_digest       text NOT NULL CHECK (manifest_digest ~ '^[0-9a-f]{64}$'),
  results               jsonb NOT NULL CHECK (
                          jsonb_typeof(results) = 'array'
                          AND jsonb_array_length(results) BETWEEN 1 AND 81
                          AND octet_length(results::text) <= 65536),
  result_count          integer NOT NULL CHECK (result_count BETWEEN 1 AND 81),
  sealed_at             timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, diagnostic_run_id),
  FOREIGN KEY (workspace_id, diagnostic_run_id) REFERENCES research.whatif_jobs_v1(workspace_id, diagnostic_run_id),
  FOREIGN KEY (workspace_id, artifact_id) REFERENCES research.artifacts(workspace_id, artifact_id),
  CHECK (jsonb_array_length(results) = result_count)
);

CREATE INDEX whatif_grids_v1_parent_idx
  ON research.whatif_grids_v1 (workspace_id, parent_run_id, sealed_at DESC, diagnostic_run_id DESC);

-- The grid must answer its own job, for its own parent, from its own sealed artifact.
CREATE OR REPLACE FUNCTION research.validate_whatif_grid_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, research
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM research.whatif_jobs_v1 job
      JOIN research.artifacts artifact
        ON artifact.workspace_id = job.workspace_id
       AND artifact.artifact_id = NEW.artifact_id
     WHERE job.workspace_id = NEW.workspace_id
       AND job.diagnostic_run_id = NEW.diagnostic_run_id
       AND job.parent_run_id = NEW.parent_run_id
       AND job.grid_key = NEW.grid_key
       AND job.evaluation_count = NEW.result_count
       AND artifact.run_id = NEW.diagnostic_run_id
       AND artifact.artifact_revision = NEW.artifact_revision
       AND artifact.state = 'SEALED'
       AND artifact.manifest_digest = NEW.manifest_digest
  ) THEN
    RAISE EXCEPTION 'a what-if grid must answer its own admitted job from its own sealed artifact'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER whatif_grids_v1_validate
BEFORE INSERT ON research.whatif_grids_v1
FOR EACH ROW EXECUTE FUNCTION research.validate_whatif_grid_v1();

CREATE TRIGGER whatif_jobs_v1_immutable_guard
BEFORE UPDATE OR DELETE ON research.whatif_jobs_v1
FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();

CREATE TRIGGER whatif_grids_v1_immutable_guard
BEFORE UPDATE OR DELETE ON research.whatif_grids_v1
FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();

REVOKE ALL ON FUNCTION research.validate_whatif_grid_v1() FROM PUBLIC;
REVOKE ALL ON research.whatif_jobs_v1 FROM PUBLIC;
REVOKE ALL ON research.whatif_grids_v1 FROM PUBLIC;
GRANT SELECT, INSERT ON research.whatif_jobs_v1 TO portal_research_runtime;
GRANT SELECT, INSERT ON research.whatif_grids_v1 TO portal_research_runtime;

COMMENT ON TABLE research.whatif_jobs_v1 IS
  'W5a A10c: one explicit Screen-07 what-if diagnostic job (≤81 unique evaluation keys) for a frozen WFO run.';
COMMENT ON TABLE research.whatif_grids_v1 IS
  'W5a A10c: immutable sealed WHATIF_GRID relation; exact QuantBT results of one diagnostic job, never interpolated.';

SELECT 1;
