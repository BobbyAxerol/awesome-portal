-- Independent append-only supplement: original seal/Report bytes never change.
-- Preserve the original passport's 32-KiB SQL bound, with a separately bounded
-- additive enrichment (JSONB whitespace overhead differs from compact JSON).
DO $$
DECLARE old_name text;
BEGIN
  SELECT conname INTO STRICT old_name FROM pg_constraint
    WHERE conrelid='research.run_evidence_sources_v1'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) LIKE '%octet_length%'
      AND pg_get_constraintdef(oid) LIKE '%source_payload%32768%';
  EXECUTE format('ALTER TABLE research.run_evidence_sources_v1 DROP CONSTRAINT %I', old_name);
END $$;
ALTER TABLE research.run_evidence_sources_v1 ADD CONSTRAINT run_evidence_sources_v1_enrichment_payload_bound
  CHECK (octet_length((source_payload - 'enriched_analysis')::text) <= 32768
    AND (NOT (source_payload ? 'enriched_analysis') OR
      (jsonb_typeof(source_payload->'enriched_analysis')='object'
       AND octet_length((source_payload->'enriched_analysis')::text) <= 73728)));
CREATE TABLE research.enriched_analysis_v1 (
  workspace_id text NOT NULL,
  run_id text NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('WFO_RETAINED', 'P04_SOURCE')),
  source_revision text NOT NULL CHECK (length(source_revision) BETWEEN 1 AND 160),
  source_digest text NOT NULL CHECK (source_digest ~ '^[0-9a-f]{64}$'),
  source_rows_digest text NOT NULL CHECK (source_rows_digest ~ '^[0-9a-f]{64}$'),
  enriched_digest text NOT NULL CHECK (enriched_digest ~ '^[0-9a-f]{64}$'),
  enriched jsonb NOT NULL CHECK (jsonb_typeof(enriched) = 'object' AND octet_length(enriched::text) <= 73728),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, run_id, source_kind, source_revision),
  FOREIGN KEY (workspace_id, run_id) REFERENCES research.runs (workspace_id, run_id)
);
CREATE TRIGGER enriched_analysis_v1_immutable_guard
BEFORE UPDATE OR DELETE ON research.enriched_analysis_v1
FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();
REVOKE ALL ON research.enriched_analysis_v1 FROM PUBLIC;
GRANT SELECT ON research.enriched_analysis_v1 TO portal_research_runtime;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON research.enriched_analysis_v1 FROM portal_research_runtime;
COMMENT ON TABLE research.enriched_analysis_v1 IS 'B6 OOS all-time supplement, full or explicitly sampled, derived once; no read-time calculation.';

-- The runtime role cannot INSERT into the companion table. Only this narrow
-- source-time writer is executable; it must match an already immutable source
-- in the caller's workspace. Viewer transactions are READ ONLY and cannot use
-- the writer. The separate operator uses the migration owner's explicit grant.
CREATE FUNCTION research.append_source_enrichment_v1(
  wanted_workspace text,wanted_run text,wanted_kind text,wanted_revision text,
  wanted_source_digest text,wanted_rows_digest text,wanted_digest text,wanted jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,research AS $$
DECLARE bound_source boolean; existing_digest text;
BEGIN
  IF current_setting('research.workspace_id',true) IS DISTINCT FROM wanted_workspace
    OR wanted->>'run_id' IS DISTINCT FROM wanted_run
    OR wanted->>'schema_version' IS DISTINCT FROM 'research.enriched-analysis.v1'
    OR jsonb_typeof(wanted) IS DISTINCT FROM 'object' OR octet_length(wanted::text)>73728
  THEN RAISE EXCEPTION 'Invalid source enrichment binding' USING ERRCODE='23514'; END IF;
  IF wanted_kind='WFO_RETAINED' THEN
    SELECT EXISTS(SELECT 1 FROM research.current_source_seals_v1 source
      WHERE source.workspace_id=wanted_workspace AND source.run_id=wanted_run
        AND source.artifact_revision::text=wanted_revision AND source.retained_import_digest=wanted_source_digest
        AND source.summary->'enriched_analysis'=wanted) INTO bound_source;
  ELSIF wanted_kind='P04_SOURCE' THEN
    SELECT EXISTS(SELECT 1 FROM research.run_evidence_projections_v1 projection
      JOIN research.run_evidence_sources_v1 source ON source.workspace_id=projection.workspace_id
        AND source.run_id=projection.run_id AND source.worker_attempt_id=projection.worker_attempt_id
        AND source.source_event_sequence=projection.source_event_sequence
        AND source.source_evidence_digest=projection.source_evidence_digest
      WHERE projection.workspace_id=wanted_workspace AND projection.run_id=wanted_run
        AND projection.projection_revision=wanted_revision AND projection.source_evidence_digest=wanted_source_digest
        AND source.source_payload->'enriched_analysis'=wanted) INTO bound_source;
  ELSE bound_source:=false; END IF;
  IF NOT bound_source THEN RAISE EXCEPTION 'Enrichment requires its immutable source' USING ERRCODE='23514'; END IF;
  INSERT INTO research.enriched_analysis_v1
    (workspace_id,run_id,source_kind,source_revision,source_digest,source_rows_digest,enriched_digest,enriched)
    VALUES(wanted_workspace,wanted_run,wanted_kind,wanted_revision,wanted_source_digest,wanted_rows_digest,wanted_digest,wanted)
    ON CONFLICT DO NOTHING;
  SELECT enriched_digest INTO existing_digest FROM research.enriched_analysis_v1
    WHERE workspace_id=wanted_workspace AND run_id=wanted_run AND source_kind=wanted_kind AND source_revision=wanted_revision;
  IF existing_digest IS DISTINCT FROM wanted_digest THEN RAISE EXCEPTION 'Immutable enrichment conflict' USING ERRCODE='23514'; END IF;
END $$;
REVOKE ALL ON FUNCTION research.append_source_enrichment_v1(text,text,text,text,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION research.append_source_enrichment_v1(text,text,text,text,text,text,text,jsonb) TO portal_research_runtime;
SELECT 1;
