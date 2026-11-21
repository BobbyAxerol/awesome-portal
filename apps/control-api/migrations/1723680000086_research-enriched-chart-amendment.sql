-- B9 is a new immutable companion, never an UPDATE of B6 or a frozen seal.
CREATE TABLE research.enriched_chart_amendments_v1 (
  workspace_id text NOT NULL,
  run_id text NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('WFO_RETAINED', 'P04_SOURCE')),
  source_revision text NOT NULL CHECK (length(source_revision) BETWEEN 1 AND 160),
  source_digest text NOT NULL CHECK (source_digest ~ '^[0-9a-f]{64}$'),
  source_rows_digest text NOT NULL CHECK (source_rows_digest ~ '^[0-9a-f]{64}$'),
  enriched_digest text NOT NULL CHECK (enriched_digest ~ '^[0-9a-f]{64}$'),
  enriched jsonb NOT NULL CHECK (jsonb_typeof(enriched) = 'object'
    AND octet_length(enriched::text) <= 73728
    AND (enriched->'return_distribution'->'statistics_policy'->>'quantile_method') IS NOT DISTINCT FROM 'LINEAR_TYPE_7'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, run_id, source_kind, source_revision),
  FOREIGN KEY (workspace_id, run_id) REFERENCES research.runs (workspace_id, run_id)
);
CREATE TRIGGER enriched_chart_amendments_v1_immutable_guard
BEFORE UPDATE OR DELETE ON research.enriched_chart_amendments_v1
FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();
REVOKE ALL ON research.enriched_chart_amendments_v1 FROM PUBLIC;
GRANT SELECT ON research.enriched_chart_amendments_v1 TO portal_research_runtime;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON research.enriched_chart_amendments_v1 FROM portal_research_runtime;
COMMENT ON TABLE research.enriched_chart_amendments_v1 IS
  'B9 operator-only append: source-bound complete or explicitly sampled all-time charts; preserves original B6 and frozen Report.';
