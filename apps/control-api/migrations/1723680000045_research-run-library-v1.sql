-- Research Loop P12 · bounded Run Library reader.
--
-- This is a read-only composition over persisted Research/P10/P11 facts and
-- the existing Portal legacy run metadata.  It creates no worker, no artifact
-- scan, no source transport and no mutation route.  In particular, a missing
-- metric/claim/certificate remains a typed absence at the service boundary;
-- this view never manufactures it from a run status.

-- P12's keyset order is exactly `created_at DESC, run_id DESC`.  The P03
-- index already covers new durable runs; legacy history gets the matching
-- index so the historical 1.0.8 compatibility lane is not a table scan.
CREATE INDEX IF NOT EXISTS run_read_models_library_cursor_idx
  ON public.run_read_models (workspace_id, created_at DESC, run_id DESC);

-- P10 has one producer per durable run.  These narrow joins preserve an
-- indexable workspace/run and alpha filter path; no JSON/Parquet row is read
-- outside the at-most-51 selected Library rows.
CREATE INDEX IF NOT EXISTS research_run_producers_library_alpha_idx
  ON research.run_producers (workspace_id, alpha_id, run_id);

CREATE INDEX IF NOT EXISTS research_run_producers_library_job_idx
  ON research.run_producers (workspace_id, job_id);

CREATE INDEX IF NOT EXISTS research_jobs_library_run_idx
  ON research.jobs (workspace_id, run_id, created_at DESC, job_id DESC);

CREATE INDEX IF NOT EXISTS research_worker_attempts_library_job_idx
  ON research.worker_attempts (workspace_id, job_id, ordinal DESC);

-- `q` is a real historical-search filter, not a client-side scan of whichever
-- page happened to be rendered.  A normal view cannot carry an index, so keep
-- one small Portal-owned search projection keyed by the exact row identity.
-- It contains only the display-safe identifiers that the Screen-01 contract
-- already names; it deliberately excludes requested parameter values, source
-- paths, artifact refs, lease fields, metrics and raw market data.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE research.run_library_search_documents (
  workspace_id  text NOT NULL REFERENCES workspaces(workspace_id),
  source_kind   text NOT NULL CHECK (source_kind IN ('RESEARCH_DURABLE', 'LEGACY_1_0_8_METADATA')),
  run_id        text NOT NULL,
  search_document text NOT NULL CHECK (octet_length(search_document) <= 4096),
  refreshed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, source_kind, run_id)
);

CREATE INDEX research_run_library_search_documents_trgm_idx
  ON research.run_library_search_documents
  USING gin (search_document gin_trgm_ops);

-- The functions are not public APIs.  They are only trigger-maintained
-- projection machinery.  `SECURITY DEFINER` keeps the read-only runtime role
-- from gaining generic write access to the search table merely because P10
-- inserts a durable run and fires the trigger.  A pinned search_path avoids a
-- caller-controlled object lookup in this privileged, data-only function.
CREATE OR REPLACE FUNCTION research.refresh_run_library_durable_search_document(
  target_workspace_id text,
  target_run_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, research, public
AS $$
BEGIN
  INSERT INTO research.run_library_search_documents (
    workspace_id, source_kind, run_id, search_document, refreshed_at
  )
  SELECT
    durable.workspace_id,
    'RESEARCH_DURABLE',
    durable.run_id,
    concat_ws(' ',
      durable.run_id,
      COALESCE(producer.alpha_id, version.alpha_id, ''),
      COALESCE(alpha.name, ''),
      COALESCE('av_' || replace(version.declared_contract->>'version', '.', '_'), version.alpha_version_id, ''),
      COALESCE(preflight.requested_spec->'data'->>'symbol', ''),
      COALESCE(preflight.requested_spec->'data'->>'timeframe', ''),
      COALESCE(preflight.requested_spec->>'strategy_id', producer.legacy_request->>'strategy_id', ''),
      COALESCE(preflight.requested_spec->>'optimization_mode', producer.legacy_request->>'protocol', '')
    ),
    GREATEST(durable.updated_at, COALESCE(producer.updated_at, durable.updated_at))
  FROM research.runs durable
  JOIN research.attempts attempt
    ON attempt.workspace_id = durable.workspace_id AND attempt.attempt_id = durable.attempt_id
  LEFT JOIN research.run_producers producer
    ON producer.workspace_id = durable.workspace_id AND producer.run_id = durable.run_id
  LEFT JOIN research.preflight_manifests preflight
    ON preflight.workspace_id = producer.workspace_id
   AND preflight.preflight_token = producer.preflight_token
   AND preflight.actor_user_id = producer.actor_user_id
  LEFT JOIN research.alpha_versions version
    ON version.workspace_id = durable.workspace_id
   AND version.alpha_version_id = COALESCE(producer.alpha_version_id, attempt.alpha_version_id)
  LEFT JOIN research.alphas alpha
    ON alpha.workspace_id = version.workspace_id AND alpha.alpha_id = version.alpha_id
  WHERE durable.workspace_id = target_workspace_id
    AND durable.run_id = target_run_id
  ON CONFLICT (workspace_id, source_kind, run_id) DO UPDATE
    SET search_document = EXCLUDED.search_document,
        refreshed_at = EXCLUDED.refreshed_at;

  IF NOT FOUND THEN
    DELETE FROM research.run_library_search_documents
     WHERE workspace_id = target_workspace_id
       AND source_kind = 'RESEARCH_DURABLE'
       AND run_id = target_run_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION research.refresh_run_library_legacy_search_document(
  target_workspace_id text,
  target_run_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, research, public
AS $$
BEGIN
  INSERT INTO research.run_library_search_documents (
    workspace_id, source_kind, run_id, search_document, refreshed_at
  )
  SELECT
    legacy.workspace_id,
    'LEGACY_1_0_8_METADATA',
    legacy.run_id,
    concat_ws(' ', legacy.run_id, COALESCE(legacy.strategy_id, ''),
                    COALESCE(legacy.dataset_id, ''), COALESCE(legacy.protocol, '')),
    legacy.updated_at
  FROM public.run_read_models legacy
  WHERE legacy.workspace_id = target_workspace_id
    AND legacy.run_id = target_run_id
  ON CONFLICT (workspace_id, source_kind, run_id) DO UPDATE
    SET search_document = EXCLUDED.search_document,
        refreshed_at = EXCLUDED.refreshed_at;

  IF NOT FOUND THEN
    DELETE FROM research.run_library_search_documents
     WHERE workspace_id = target_workspace_id
       AND source_kind = 'LEGACY_1_0_8_METADATA'
       AND run_id = target_run_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION research.run_library_search_durable_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, research, public
AS $$
DECLARE
  resolved_workspace_id text;
  resolved_run_id text;
BEGIN
  -- PostgreSQL does not assign NEW in a DELETE trigger.  Branch before
  -- touching it; COALESCE(NEW.*, OLD.*) is not safe in that operation.
  IF TG_OP = 'DELETE' THEN
    PERFORM research.refresh_run_library_durable_search_document(OLD.workspace_id, OLD.run_id);
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE'
     AND (OLD.workspace_id IS DISTINCT FROM NEW.workspace_id OR OLD.run_id IS DISTINCT FROM NEW.run_id) THEN
    -- IDs are normally immutable, but remove an old identity if a controlled
    -- maintenance migration changes one.  A stale searchable row must never
    -- outlive its source row.
    PERFORM research.refresh_run_library_durable_search_document(OLD.workspace_id, OLD.run_id);
  END IF;
  resolved_workspace_id := NEW.workspace_id;
  resolved_run_id := NEW.run_id;
  PERFORM research.refresh_run_library_durable_search_document(resolved_workspace_id, resolved_run_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION research.run_library_search_alpha_version_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, research, public
AS $$
DECLARE
  affected record;
  old_workspace_id text;
  old_alpha_version_id text;
  new_workspace_id text;
  new_alpha_version_id text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    new_workspace_id := NEW.workspace_id;
    new_alpha_version_id := NEW.alpha_version_id;
  ELSIF TG_OP = 'DELETE' THEN
    old_workspace_id := OLD.workspace_id;
    old_alpha_version_id := OLD.alpha_version_id;
  ELSE
    old_workspace_id := OLD.workspace_id;
    old_alpha_version_id := OLD.alpha_version_id;
    new_workspace_id := NEW.workspace_id;
    new_alpha_version_id := NEW.alpha_version_id;
  END IF;
  FOR affected IN
    SELECT durable.workspace_id, durable.run_id
      FROM research.runs durable
      JOIN research.attempts attempt
        ON attempt.workspace_id = durable.workspace_id AND attempt.attempt_id = durable.attempt_id
      LEFT JOIN research.run_producers producer
        ON producer.workspace_id = durable.workspace_id AND producer.run_id = durable.run_id
     WHERE (
       old_workspace_id IS NOT NULL
       AND durable.workspace_id = old_workspace_id
       AND (attempt.alpha_version_id = old_alpha_version_id
            OR producer.alpha_version_id = old_alpha_version_id)
     ) OR (
       new_workspace_id IS NOT NULL
       AND durable.workspace_id = new_workspace_id
       AND (attempt.alpha_version_id = new_alpha_version_id
            OR producer.alpha_version_id = new_alpha_version_id)
     )
  LOOP
    PERFORM research.refresh_run_library_durable_search_document(affected.workspace_id, affected.run_id);
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION research.run_library_search_alpha_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, research, public
AS $$
DECLARE
  affected record;
  resolved_workspace_id text;
  resolved_alpha_id text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    resolved_workspace_id := OLD.workspace_id;
    resolved_alpha_id := OLD.alpha_id;
  ELSE
    resolved_workspace_id := NEW.workspace_id;
    resolved_alpha_id := NEW.alpha_id;
  END IF;
  FOR affected IN
    SELECT durable.workspace_id, durable.run_id
      FROM research.runs durable
      JOIN research.attempts attempt
        ON attempt.workspace_id = durable.workspace_id AND attempt.attempt_id = durable.attempt_id
      LEFT JOIN research.run_producers producer
        ON producer.workspace_id = durable.workspace_id AND producer.run_id = durable.run_id
      LEFT JOIN research.alpha_versions version
        ON version.workspace_id = durable.workspace_id
       AND version.alpha_version_id = COALESCE(producer.alpha_version_id, attempt.alpha_version_id)
     WHERE durable.workspace_id = resolved_workspace_id
       AND COALESCE(producer.alpha_id, version.alpha_id) = resolved_alpha_id
  LOOP
    PERFORM research.refresh_run_library_durable_search_document(affected.workspace_id, affected.run_id);
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION research.run_library_search_legacy_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, research, public
AS $$
DECLARE
  resolved_workspace_id text;
  resolved_run_id text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM research.refresh_run_library_legacy_search_document(OLD.workspace_id, OLD.run_id);
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE'
     AND (OLD.workspace_id IS DISTINCT FROM NEW.workspace_id OR OLD.run_id IS DISTINCT FROM NEW.run_id) THEN
    PERFORM research.refresh_run_library_legacy_search_document(OLD.workspace_id, OLD.run_id);
  END IF;
  resolved_workspace_id := NEW.workspace_id;
  resolved_run_id := NEW.run_id;
  PERFORM research.refresh_run_library_legacy_search_document(resolved_workspace_id, resolved_run_id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION research.refresh_run_library_durable_search_document(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION research.refresh_run_library_legacy_search_document(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION research.run_library_search_durable_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION research.run_library_search_alpha_version_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION research.run_library_search_alpha_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION research.run_library_search_legacy_trigger() FROM PUBLIC;

CREATE TRIGGER research_run_library_search_runs_trigger
AFTER INSERT OR UPDATE OR DELETE ON research.runs
FOR EACH ROW EXECUTE FUNCTION research.run_library_search_durable_trigger();

CREATE TRIGGER research_run_library_search_producers_trigger
AFTER INSERT OR UPDATE OR DELETE ON research.run_producers
FOR EACH ROW EXECUTE FUNCTION research.run_library_search_durable_trigger();

CREATE TRIGGER research_run_library_search_alpha_versions_trigger
AFTER INSERT OR UPDATE OR DELETE ON research.alpha_versions
FOR EACH ROW EXECUTE FUNCTION research.run_library_search_alpha_version_trigger();

CREATE TRIGGER research_run_library_search_alphas_trigger
AFTER INSERT OR UPDATE OF name ON research.alphas
FOR EACH ROW EXECUTE FUNCTION research.run_library_search_alpha_trigger();

CREATE TRIGGER research_run_library_search_legacy_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.run_read_models
FOR EACH ROW EXECUTE FUNCTION research.run_library_search_legacy_trigger();

-- One-time backfill is transactionally part of the migration.  New/changed
-- records thereafter pass through the five narrow triggers above.  This is
-- deliberately not a background job: a successful migration means every
-- historical row has a searchable document before the feature flag can open.
SELECT research.refresh_run_library_durable_search_document(workspace_id, run_id)
  FROM research.runs;
SELECT research.refresh_run_library_legacy_search_document(workspace_id, run_id)
  FROM public.run_read_models;

-- The runtime role is deliberately granted only the Portal-owned legacy
-- metadata reader, never the legacy source service or its artifact storage.
GRANT SELECT ON public.run_read_models TO portal_research_runtime;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON research.run_library_search_documents FROM portal_research_runtime;
GRANT SELECT ON research.run_library_search_documents TO portal_research_runtime;

CREATE OR REPLACE VIEW research.run_library_rows_v1 AS
SELECT
  durable.workspace_id,
  durable.run_id,
  durable.attempt_id,
  'RESEARCH_DURABLE'::text AS source_kind,
  durable.run_kind,
  durable.relationship_kind,
  durable.logical_run_key,
  durable.parent_run_id,
  durable.created_at,
  durable.updated_at,
  CASE
    WHEN COALESCE(job.state, durable.state) IN ('SUCCEEDED', 'READY') THEN 'COMPLETED'
    WHEN COALESCE(job.state, durable.state) = 'FAILED' THEN 'FAILED'
    WHEN COALESCE(job.state, durable.state) = 'CANCELLED' THEN 'CANCELLED'
    WHEN COALESCE(job.state, durable.state) IN ('RUNNING', 'CLAIMED', 'SEALING', 'CANCEL_REQUESTED') THEN 'RUNNING'
    WHEN COALESCE(job.state, durable.state) = 'DRAFT' THEN 'DRAFT'
    WHEN COALESCE(job.state, durable.state) = 'RECOVERY_REQUIRED' THEN 'RECOVERY_REQUIRED'
    ELSE 'QUEUED'
  END AS effective_status,
  COALESCE(producer.intent_kind, attempt.intent_kind)::text AS intent_kind,
  COALESCE(producer.alpha_id, version.alpha_id) AS alpha_id,
  alpha.name AS alpha_name,
  COALESCE('av_' || replace(version.declared_contract->>'version', '.', '_'), version.alpha_version_id) AS alpha_version_label,
  version.alpha_version_id,
  version.code_digest AS alpha_code_digest,
  producer.legacy_request,
  preflight.requested_spec,
  producer.portal_receipt,
  progress.snapshot AS progress_snapshot,
  progress.received_at AS progress_received_at,
  progress.source_latest_sequence,
  progress.retention_floor_sequence,
  job.state AS job_state,
  worker.ordinal AS current_worker_ordinal,
  CASE WHEN COALESCE(producer.alpha_id, version.alpha_id) IS NULL THEN 'scratch'
       ELSE COALESCE(producer.alpha_id, version.alpha_id) END AS alpha_filter_key,
  COALESCE(preflight.requested_spec->>'optimization_mode', producer.legacy_request->>'protocol') AS mode_key
FROM research.runs durable
JOIN research.attempts attempt
  ON attempt.workspace_id = durable.workspace_id AND attempt.attempt_id = durable.attempt_id
LEFT JOIN research.run_producers producer
  ON producer.workspace_id = durable.workspace_id AND producer.run_id = durable.run_id
LEFT JOIN research.preflight_manifests preflight
  ON preflight.workspace_id = producer.workspace_id
 AND preflight.preflight_token = producer.preflight_token
 AND preflight.actor_user_id = producer.actor_user_id
LEFT JOIN research.alpha_versions version
  ON version.workspace_id = durable.workspace_id
 AND version.alpha_version_id = COALESCE(producer.alpha_version_id, attempt.alpha_version_id)
LEFT JOIN research.alphas alpha
  ON alpha.workspace_id = version.workspace_id AND alpha.alpha_id = version.alpha_id
-- P10 has an exact producer job ID.  Older P03/P06 durable rows may not, so
-- choose the one current job by that exact ID when present and otherwise the
-- newest durable job for the run.  This is still one bounded lateral lookup
-- per selected row, backed by `research_jobs_library_run_idx`; it is not an
-- application-side N+1 fan-out.
LEFT JOIN LATERAL (
  SELECT candidate.job_id, candidate.state, candidate.current_worker_attempt_id
    FROM research.jobs candidate
   WHERE candidate.workspace_id = durable.workspace_id
     AND candidate.run_id = durable.run_id
   ORDER BY (candidate.job_id = producer.job_id) DESC,
            candidate.created_at DESC,
            candidate.job_id DESC
   LIMIT 1
) job ON TRUE
LEFT JOIN research.run_progress_snapshots progress
  ON progress.workspace_id = durable.workspace_id
 AND progress.run_id = durable.run_id
 AND progress.worker_attempt_id = COALESCE(producer.worker_attempt_id, job.current_worker_attempt_id)
LEFT JOIN LATERAL (
  SELECT candidate.ordinal
    FROM research.worker_attempts candidate
   WHERE candidate.workspace_id = durable.workspace_id
     AND candidate.job_id = job.job_id
   ORDER BY candidate.ordinal DESC
   LIMIT 1
) worker ON TRUE

UNION ALL

SELECT
  legacy.workspace_id,
  legacy.run_id,
  NULL::text AS attempt_id,
  'LEGACY_1_0_8_METADATA'::text AS source_kind,
  'LEGACY'::text AS run_kind,
  'LEGACY_UNKNOWN'::text AS relationship_kind,
  legacy.run_id AS logical_run_key,
  NULL::text AS parent_run_id,
  legacy.created_at,
  legacy.updated_at,
  CASE upper(legacy.status)
    WHEN 'COMPLETED' THEN 'COMPLETED'
    WHEN 'SUCCEEDED' THEN 'COMPLETED'
    WHEN 'COMPLETE' THEN 'COMPLETED'
    WHEN 'RUNNING' THEN 'RUNNING'
    WHEN 'FAILED' THEN 'FAILED'
    WHEN 'CANCELLED' THEN 'CANCELLED'
    WHEN 'DRAFT' THEN 'DRAFT'
    ELSE 'QUEUED'
  END AS effective_status,
  NULL::text AS intent_kind,
  NULL::text AS alpha_id,
  NULL::text AS alpha_name,
  NULL::text AS alpha_version_label,
  NULL::text AS alpha_version_id,
  NULL::text AS alpha_code_digest,
  jsonb_strip_nulls(jsonb_build_object(
    'protocol', legacy.protocol,
    'strategy_id', legacy.strategy_id,
    'dataset_id', legacy.dataset_id
  )) AS legacy_request,
  NULL::jsonb AS requested_spec,
  NULL::jsonb AS portal_receipt,
  NULL::jsonb AS progress_snapshot,
  NULL::timestamptz AS progress_received_at,
  NULL::bigint AS source_latest_sequence,
  NULL::bigint AS retention_floor_sequence,
  NULL::text AS job_state,
  NULL::integer AS current_worker_ordinal,
  'scratch'::text AS alpha_filter_key,
  legacy.protocol AS mode_key
FROM public.run_read_models legacy
WHERE NOT EXISTS (
  SELECT 1
    FROM research.runs durable
   WHERE durable.workspace_id = legacy.workspace_id
     AND durable.run_id = legacy.run_id
);

GRANT SELECT ON research.run_library_rows_v1 TO portal_research_runtime;

COMMENT ON VIEW research.run_library_rows_v1 IS
  'P12 read-only bounded Run Library join of durable Research and legacy 1.0.8 metadata. No artifact, Parquet, source transport or Execution relation is read.';

-- Reader rollback is flag/route-only.  Retain indexes and all persisted run
-- facts so old histories remain browsable when the reader is re-enabled.
SELECT 1;
