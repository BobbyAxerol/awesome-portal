-- BR-F6: independent immutable companion; never overwrite an AN-29 or source seal.
CREATE TABLE research.current_source_distributions_v1 (
  workspace_id text NOT NULL,
  run_id text NOT NULL,
  artifact_revision integer NOT NULL CHECK (artifact_revision > 0),
  retained_import_digest text NOT NULL CHECK (retained_import_digest ~ '^[0-9a-f]{64}$'),
  source_rows_digest text NOT NULL CHECK (source_rows_digest ~ '^[0-9a-f]{64}$'),
  distributions_digest text NOT NULL CHECK (distributions_digest ~ '^[0-9a-f]{64}$'),
  distributions jsonb NOT NULL CHECK (jsonb_typeof(distributions) = 'object' AND octet_length(distributions::text) <= 16384),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, run_id, artifact_revision),
  FOREIGN KEY (workspace_id, run_id, artifact_revision)
    REFERENCES research.current_source_seals_v1 (workspace_id, run_id, artifact_revision)
);
CREATE TRIGGER current_source_distributions_v1_immutable_guard
BEFORE UPDATE OR DELETE ON research.current_source_distributions_v1
FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();
REVOKE ALL ON research.current_source_distributions_v1 FROM PUBLIC;
GRANT SELECT ON research.current_source_distributions_v1 TO portal_research_runtime;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON research.current_source_distributions_v1 FROM portal_research_runtime;
COMMENT ON TABLE research.current_source_distributions_v1 IS
  'All-time OOS calendar/daily distributions derived once from verified retained rows; source seals and reports unchanged.';
SELECT 1;
