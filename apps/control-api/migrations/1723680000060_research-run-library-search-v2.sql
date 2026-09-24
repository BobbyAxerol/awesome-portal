-- RF-05 / CG-P12-10 · Run Library search document v2.
--
-- Screen 01 defines `q` as "run_id | alpha | av | rc_id | instrument | mode".
-- The v1 document carried `strategy_id` (and, for legacy rows, dataset_id)
-- but not the optimization schedule or the durable protocol.  On real data
-- that made `three_window` find only the legacy row, and made an unbound
-- legacy row match an alpha *name* because its 1.0.8 strategy_id happened to
-- equal the alpha id.  v2 composes only the fields the screen names:
--
--   durable: run_id, alpha id + name, av label, symbol, timeframe,
--            optimization mode, optimization schedule, protocol, rc ids
--   legacy : run_id, recorded protocol (its only mode metadata)
--
-- The table, index, grants, row triggers and view are unchanged; this is a
-- function replacement plus one additive trigger on the immutable P21 pack
-- relation (packs are INSERT-only, so INSERT is the only event).  Rollback
-- is feature/route-only; a later migration may restore v1 composition.

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
    left(concat_ws(' ',
      durable.run_id,
      COALESCE(producer.alpha_id, version.alpha_id, ''),
      COALESCE(alpha.name, ''),
      COALESCE('av_' || replace(version.declared_contract->>'version', '.', '_'), version.alpha_version_id, ''),
      COALESCE(preflight.requested_spec->'data'->>'symbol', ''),
      COALESCE(preflight.requested_spec->'data'->>'timeframe', ''),
      COALESCE(preflight.requested_spec->>'optimization_mode', ''),
      COALESCE(preflight.requested_spec->>'optimization_schedule', ''),
      COALESCE(preflight.requested_spec->>'protocol', producer.legacy_request->>'protocol', ''),
      COALESCE((
        SELECT string_agg(recent.release_candidate_id, ' ' ORDER BY recent.sealed_at DESC)
          FROM (
            SELECT pack.release_candidate_id, pack.sealed_at
              FROM research.release_candidate_packs_v1 pack
             WHERE pack.workspace_id = durable.workspace_id
               AND pack.run_id = durable.run_id
             ORDER BY pack.sealed_at DESC, pack.release_candidate_id DESC
             LIMIT 8
          ) recent
      ), '')
    ), 4096),
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
  -- A 1.0.8 row declares no alpha binding and no symbol/timeframe.  Its
  -- strategy_id and dataset_id stay out of the document so that an alpha
  -- name or instrument query cannot select an unbound historical row.
  INSERT INTO research.run_library_search_documents (
    workspace_id, source_kind, run_id, search_document, refreshed_at
  )
  SELECT
    legacy.workspace_id,
    'LEGACY_1_0_8_METADATA',
    legacy.run_id,
    concat_ws(' ', legacy.run_id, COALESCE(legacy.protocol, '')),
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

CREATE OR REPLACE FUNCTION research.run_library_search_release_candidate_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, research, public
AS $$
BEGIN
  PERFORM research.refresh_run_library_durable_search_document(NEW.workspace_id, NEW.run_id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION research.refresh_run_library_durable_search_document(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION research.refresh_run_library_legacy_search_document(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION research.run_library_search_release_candidate_trigger() FROM PUBLIC;

CREATE TRIGGER research_run_library_search_release_candidate_trigger
AFTER INSERT ON research.release_candidate_packs_v1
FOR EACH ROW EXECUTE FUNCTION research.run_library_search_release_candidate_trigger();

-- Transactional backfill, as in v1: the migration succeeds only when every
-- historical row carries the v2 document.
SELECT research.refresh_run_library_durable_search_document(workspace_id, run_id)
  FROM research.runs;
SELECT research.refresh_run_library_legacy_search_document(workspace_id, run_id)
  FROM public.run_read_models;

SELECT 1;
