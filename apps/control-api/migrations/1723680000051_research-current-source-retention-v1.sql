-- RS-02: additive retained-current-source custody.
--
-- P04/P13--P17 v1 remain untouched. A private bounded importer appends
-- P05-verified current QuantBT rows, then writes one immutable seal. Browser
-- readers use only the local sealed rows through named BFF operations.

CREATE TABLE research.current_source_import_batches_v1 (
  workspace_id             text NOT NULL REFERENCES workspaces(workspace_id),
  run_id                   text NOT NULL,
  artifact_revision        integer NOT NULL CHECK (artifact_revision > 0),
  manifest_digest          text NOT NULL CHECK (manifest_digest ~ '^[0-9a-f]{64}$'),
  source_transform_digest  text NOT NULL CHECK (source_transform_digest ~ '^[0-9a-f]{64}$'),
  table_kind               text NOT NULL CHECK (table_kind IN ('OBSERVATION', 'FOLD', 'TRIAL', 'CANDIDATE', 'SELECTION')),
  batch_ordinal            integer NOT NULL CHECK (batch_ordinal >= 0),
  batch_digest             text NOT NULL CHECK (batch_digest ~ '^[0-9a-f]{64}$'),
  row_count                integer NOT NULL CHECK (row_count BETWEEN 1 AND 200),
  received_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, run_id, artifact_revision, table_kind, batch_ordinal)
);

CREATE TABLE research.current_source_rows_v1 (
  workspace_id             text NOT NULL REFERENCES workspaces(workspace_id),
  run_id                   text NOT NULL,
  artifact_revision        integer NOT NULL CHECK (artifact_revision > 0),
  table_kind               text NOT NULL CHECK (table_kind IN ('OBSERVATION', 'FOLD', 'TRIAL', 'CANDIDATE', 'SELECTION')),
  source_ordinal           bigint NOT NULL CHECK (source_ordinal >= 0),
  source_id                text NOT NULL CHECK (source_id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$'),
  occurred_at_utc_ms       bigint NULL CHECK (occurred_at_utc_ms IS NULL OR occurred_at_utc_ms >= 0),
  payload                  jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 65536),
  retained_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, run_id, artifact_revision, table_kind, source_ordinal),
  UNIQUE (workspace_id, run_id, artifact_revision, table_kind, source_id)
);

CREATE INDEX current_source_rows_v1_page_idx
  ON research.current_source_rows_v1 (workspace_id, run_id, artifact_revision, table_kind, source_ordinal);

CREATE TABLE research.current_source_seals_v1 (
  workspace_id             text NOT NULL REFERENCES workspaces(workspace_id),
  run_id                   text NOT NULL,
  artifact_revision        integer NOT NULL CHECK (artifact_revision > 0),
  source_adapter_id        text NOT NULL CHECK (source_adapter_id = 'rs02.quantbt-advanced-wfo.v1'),
  profile_id               text NOT NULL CHECK (profile_id = 'rs02.delta-wfo-global.v1'),
  manifest_digest          text NOT NULL CHECK (manifest_digest ~ '^[0-9a-f]{64}$'),
  source_transform_digest  text NOT NULL CHECK (source_transform_digest ~ '^[0-9a-f]{64}$'),
  requested_spec_digest    text NOT NULL CHECK (requested_spec_digest ~ '^[0-9a-f]{64}$'),
  effective_spec_digest    text NOT NULL CHECK (effective_spec_digest ~ '^[0-9a-f]{64}$'),
  dataset_binding_digest   text NOT NULL CHECK (dataset_binding_digest ~ '^[0-9a-f]{64}$'),
  retained_import_digest   text NOT NULL CHECK (retained_import_digest ~ '^[0-9a-f]{64}$'),
  table_rows               jsonb NOT NULL CHECK (jsonb_typeof(table_rows) = 'object' AND octet_length(table_rows::text) <= 4096),
  total_rows               bigint NOT NULL CHECK (total_rows > 0),
  summary                  jsonb NOT NULL CHECK (jsonb_typeof(summary) = 'object' AND octet_length(summary::text) <= 65536),
  retained_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, run_id, artifact_revision)
);

CREATE INDEX current_source_seals_v1_latest_idx
  ON research.current_source_seals_v1 (workspace_id, run_id, artifact_revision DESC);

CREATE OR REPLACE FUNCTION research.prevent_current_source_append_after_seal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM research.current_source_seals_v1 AS seal
     WHERE seal.workspace_id = NEW.workspace_id
       AND seal.run_id = NEW.run_id
       AND seal.artifact_revision = NEW.artifact_revision
  ) THEN
    RAISE EXCEPTION 'cannot append a sealed current-source artifact'
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER current_source_import_batches_v1_seal_guard
BEFORE INSERT ON research.current_source_import_batches_v1
FOR EACH ROW EXECUTE FUNCTION research.prevent_current_source_append_after_seal();

CREATE TRIGGER current_source_rows_v1_seal_guard
BEFORE INSERT ON research.current_source_rows_v1
FOR EACH ROW EXECUTE FUNCTION research.prevent_current_source_append_after_seal();

CREATE TRIGGER current_source_import_batches_v1_immutable_guard
BEFORE UPDATE OR DELETE ON research.current_source_import_batches_v1
FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();

CREATE TRIGGER current_source_rows_v1_immutable_guard
BEFORE UPDATE OR DELETE ON research.current_source_rows_v1
FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();

CREATE TRIGGER current_source_seals_v1_immutable_guard
BEFORE UPDATE OR DELETE ON research.current_source_seals_v1
FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();

REVOKE ALL ON research.current_source_import_batches_v1 FROM PUBLIC;
REVOKE ALL ON research.current_source_rows_v1 FROM PUBLIC;
REVOKE ALL ON research.current_source_seals_v1 FROM PUBLIC;
GRANT SELECT, INSERT ON research.current_source_import_batches_v1 TO portal_research_runtime;
GRANT SELECT, INSERT ON research.current_source_rows_v1 TO portal_research_runtime;
GRANT SELECT, INSERT ON research.current_source_seals_v1 TO portal_research_runtime;

COMMENT ON TABLE research.current_source_import_batches_v1 IS
  'RS-02 append-only P05-verified import batch receipts; no browser route or source path is stored here.';
COMMENT ON TABLE research.current_source_rows_v1 IS
  'RS-02 Portal-local full-resolution current QuantBT rows, readable only after an immutable seal through named BFFs.';
COMMENT ON TABLE research.current_source_seals_v1 IS
  'RS-02 immutable retained current-source manifest/count/summary authority; P04 fixed-run records are not migrated into this lane.';

SELECT 1;
