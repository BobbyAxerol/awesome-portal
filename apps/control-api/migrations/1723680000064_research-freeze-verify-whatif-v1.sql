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

SELECT 1;
