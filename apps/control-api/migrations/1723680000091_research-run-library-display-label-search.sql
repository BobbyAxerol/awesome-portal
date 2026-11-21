-- G-25 · searchable canonical Research display labels.
-- This changes only the small Portal-owned safe search projection. It neither
-- rewrites business/source data nor makes labels object identities. GET stays
-- read-only, indexed and bounded. Historical labels are ranked once during
-- migration; ordinary future writes use the existing projection triggers.

CREATE OR REPLACE FUNCTION research.run_library_display_kind(profile_id text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT
SET search_path = pg_catalog, research, public
AS $$
  SELECT CASE profile_id
    WHEN 'p04.fixed-qualification.v1' THEN 'P04'
    WHEN 'p10.vn-stock-daily-observed-fixed.v1' THEN 'VN'
    WHEN 'p10.delta-signal-notional-wfo.v1' THEN 'WFO'
    WHEN 'p10.delta-signal-notional-wfo.v2' THEN 'WFO'
    WHEN 'p10.delta-signal-notional-causal-inner.v1' THEN 'WFO'
  END;
$$;

CREATE OR REPLACE FUNCTION research.run_library_display_label(
  target_workspace_id text, target_run_id text
)
RETURNS text LANGUAGE sql STABLE
SET search_path = pg_catalog, research, public
AS $$
  SELECT 'R-' || research.run_library_display_kind(producer.execution_profile_id)
      || '-' || lpad(position.ordinal::text, greatest(3, length(position.ordinal::text)), '0')
    FROM research.runs durable
    JOIN research.run_producers producer
      ON producer.workspace_id = durable.workspace_id AND producer.run_id = durable.run_id
    CROSS JOIN LATERAL (
      SELECT count(*) AS ordinal
        FROM research.runs peer_run
        JOIN research.run_producers peer_producer
          ON peer_producer.workspace_id = peer_run.workspace_id
         AND peer_producer.run_id = peer_run.run_id
       WHERE peer_run.workspace_id = durable.workspace_id
         AND peer_run.relationship_kind = 'PRIMARY'
         AND research.run_library_display_kind(peer_producer.execution_profile_id)
             = research.run_library_display_kind(producer.execution_profile_id)
         AND (peer_run.created_at, peer_run.run_id) <= (durable.created_at, durable.run_id)
    ) position
   WHERE durable.workspace_id = target_workspace_id AND durable.run_id = target_run_id
     AND durable.relationship_kind = 'PRIMARY'
     AND research.run_library_display_kind(producer.execution_profile_id) IS NOT NULL;
$$;

-- The table's bound is bytes, not characters. Preserve a UTF-8 boundary using
-- at most four conversion attempts, so prefixing a label cannot overflow the
-- existing 4096-byte CHECK or corrupt multibyte display-safe alpha names.
CREATE OR REPLACE FUNCTION research.run_library_bound_search_document(document text)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = pg_catalog, research, public
AS $$
DECLARE
  raw bytea;
  trim_bytes integer;
BEGIN
  IF octet_length(document) <= 4096 THEN RETURN document; END IF;
  raw := substring(convert_to(document, 'UTF8') FROM 1 FOR 4096);
  FOR trim_bytes IN 0..3 LOOP
    BEGIN
      RETURN convert_from(substring(raw FROM 1 FOR 4096 - trim_bytes), 'UTF8');
    EXCEPTION WHEN character_not_in_repertoire THEN
      CONTINUE;
    END;
  END LOOP;
  RAISE EXCEPTION 'run library UTF8 search document cannot be bounded';
END;
$$;

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
    research.run_library_bound_search_document(concat_ws(' ',
      research.run_library_display_label(durable.workspace_id, durable.run_id),
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
    )),
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

REVOKE ALL ON FUNCTION research.run_library_display_kind(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION research.run_library_display_label(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION research.run_library_bound_search_document(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION research.refresh_run_library_durable_search_document(text, text) FROM PUBLIC;

-- One ordered scan for old PRIMARY rows. WFO v1/v2/causal share their family;
-- P04 and VN are separate. Unknown profiles, children and legacy rows get no
-- manufactured label. Scope and created_at/run_id tie-break match every reader.
WITH ranked AS (
  SELECT durable.workspace_id, durable.run_id,
         research.run_library_display_kind(producer.execution_profile_id) AS kind,
         row_number() OVER (
           PARTITION BY durable.workspace_id,
                        research.run_library_display_kind(producer.execution_profile_id)
           ORDER BY durable.created_at, durable.run_id
         ) AS ordinal
    FROM research.runs durable
    JOIN research.run_producers producer
      ON producer.workspace_id = durable.workspace_id AND producer.run_id = durable.run_id
   WHERE durable.relationship_kind = 'PRIMARY'
     AND research.run_library_display_kind(producer.execution_profile_id) IS NOT NULL
)
UPDATE research.run_library_search_documents document
   SET search_document = research.run_library_bound_search_document(concat_ws(' ',
         'R-' || ranked.kind || '-' || lpad(ranked.ordinal::text,
                                          greatest(3, length(ranked.ordinal::text)), '0'),
         document.search_document)),
       refreshed_at = transaction_timestamp()
  FROM ranked
 WHERE document.workspace_id = ranked.workspace_id AND document.run_id = ranked.run_id
   AND document.source_kind = 'RESEARCH_DURABLE';

SELECT 1;
