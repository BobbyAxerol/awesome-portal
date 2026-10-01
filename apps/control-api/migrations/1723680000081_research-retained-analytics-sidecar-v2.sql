-- AN-29: additive analytics v2 for a verified old P05 seal. The source seal
-- and every P13/Report immutable document remain untouched.
CREATE TABLE research.current_source_analytics_sidecars_v2 (
  workspace_id text NOT NULL,
  run_id text NOT NULL,
  artifact_revision integer NOT NULL CHECK (artifact_revision > 0),
  retained_import_digest text NOT NULL CHECK (retained_import_digest ~ '^[0-9a-f]{64}$'),
  source_rows_digest text NOT NULL CHECK (source_rows_digest ~ '^[0-9a-f]{64}$'),
  analytics_digest text NOT NULL CHECK (analytics_digest ~ '^[0-9a-f]{64}$'),
  analytics jsonb NOT NULL CHECK (jsonb_typeof(analytics) = 'object' AND octet_length(analytics::text) <= 16384),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, run_id, artifact_revision),
  FOREIGN KEY (workspace_id, run_id, artifact_revision)
    REFERENCES research.current_source_seals_v1 (workspace_id, run_id, artifact_revision)
);

CREATE TRIGGER current_source_analytics_sidecars_v2_immutable_guard
BEFORE UPDATE OR DELETE ON research.current_source_analytics_sidecars_v2
FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();

REVOKE ALL ON research.current_source_analytics_sidecars_v2 FROM PUBLIC;
GRANT SELECT ON research.current_source_analytics_sidecars_v2 TO portal_research_runtime;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON research.current_source_analytics_sidecars_v2 FROM portal_research_runtime;

COMMENT ON TABLE research.current_source_analytics_sidecars_v2 IS
  'AN-29 append-only verified retained-row analytics companion; never alters the source seal or frozen report.';

SELECT 1;
