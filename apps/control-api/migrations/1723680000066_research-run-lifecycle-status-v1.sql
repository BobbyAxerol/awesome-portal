-- E10 (Unified §13.4.1) · one run lifecycle status for every Research read.
--
-- Before this migration the Run Library (P12, this view) and Run Progress
-- (P11, `progress.service.ts`) each derived a run's status on their own: the
-- library from the P06 job state only, progress from the job state, the
-- source journal and the RS-01 terminal checkpoint. The same run could read
-- QUEUED in the library and FINISHING on Screen 03 (`rrun_0df059…`: job in
-- RETRY_WAIT after its lease expired, source `run_completed` journaled, no
-- terminal checkpoint). Both reads now call this one function over the same
-- facts. It is pure: it reads no table and has no side effect.
--
-- Vocabulary is Run Progress's, plus the two library-only states a producer
-- row can never have (DRAFT, RECOVERY_REQUIRED). The library keeps its
-- coarser published vocabulary, in which a FINISHING run is still RUNNING
-- (HiFi S01 draws COMPLETED / RUNNING / FAILED only); `lifecycle_status`
-- carries the exact value beside it.

CREATE OR REPLACE FUNCTION research.run_lifecycle_status_v1(
  job_state text,
  run_state text,
  has_producer boolean,
  snapshot_status text,
  source_terminal boolean,
  terminal_materialized boolean
) RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN COALESCE(job_state, run_state) = 'CANCELLED' THEN 'CANCELLED'
    -- RS-01: a journaled source terminal is not final until its checkpoint.
    WHEN COALESCE(source_terminal, false) AND NOT COALESCE(terminal_materialized, false) THEN 'FINISHING'
    WHEN COALESCE(job_state, run_state) IN ('SUCCEEDED', 'READY') THEN
      -- A P10 run that succeeded with no source terminal fact is inconsistent;
      -- stay fail-closed rather than report success.
      CASE WHEN COALESCE(has_producer, false) AND NOT COALESCE(source_terminal, false)
           THEN 'FINISHING' ELSE 'COMPLETED' END
    WHEN COALESCE(job_state, run_state) = 'FAILED' THEN 'FAILED'
    WHEN COALESCE(job_state, run_state) IN ('RUNNING', 'CLAIMED', 'SEALING', 'CANCEL_REQUESTED') THEN
      CASE WHEN snapshot_status = 'FINISHING' THEN 'FINISHING' ELSE 'RUNNING' END
    WHEN COALESCE(job_state, run_state) = 'DRAFT' THEN 'DRAFT'
    WHEN COALESCE(job_state, run_state) = 'RECOVERY_REQUIRED' THEN 'RECOVERY_REQUIRED'
    -- QUEUED and RETRY_WAIT: waiting for a worker. A previous attempt's
    -- snapshot is history, not the current state.
    ELSE 'QUEUED'
  END
$$;

REVOKE ALL ON FUNCTION research.run_lifecycle_status_v1(text, text, boolean, text, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION research.run_lifecycle_status_v1(text, text, boolean, text, boolean, boolean)
  TO portal_research_runtime;

COMMENT ON FUNCTION research.run_lifecycle_status_v1(text, text, boolean, text, boolean, boolean) IS
  'E10: the one Research run lifecycle status. Run Library (run_library_rows_v1) and Run Progress (progress.repository readRun) both call it.';

-- Same columns in the same order as migration 045, plus three appended
-- columns: `lifecycle_status` (the exact status), `job_terminal_reason` (why
-- the P06 job closed, so a control-side failure can say so) and
-- `source_terminal` (whether the run's head journal event is terminal).
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
  CASE lifecycle.status WHEN 'FINISHING' THEN 'RUNNING' ELSE lifecycle.status END AS effective_status,
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
  COALESCE(preflight.requested_spec->>'optimization_mode', producer.legacy_request->>'protocol') AS mode_key,
  lifecycle.status AS lifecycle_status,
  job.terminal_reason AS job_terminal_reason,
  COALESCE(head_event.event_type IN ('run_completed', 'run_failed'), false) AS source_terminal
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
LEFT JOIN LATERAL (
  SELECT candidate.job_id, candidate.state, candidate.current_worker_attempt_id, candidate.terminal_reason
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
LEFT JOIN research.run_progress_events head_event
  ON head_event.workspace_id = progress.workspace_id
 AND head_event.run_id = progress.run_id
 AND head_event.worker_attempt_id = progress.worker_attempt_id
 AND head_event.source_sequence = progress.source_latest_sequence
LEFT JOIN research.run_terminal_materializations_v1 checkpoint
  ON checkpoint.workspace_id = progress.workspace_id
 AND checkpoint.run_id = progress.run_id
 AND checkpoint.worker_attempt_id = progress.worker_attempt_id
 AND checkpoint.source_sequence = progress.source_latest_sequence
LEFT JOIN LATERAL (
  SELECT candidate.ordinal
    FROM research.worker_attempts candidate
   WHERE candidate.workspace_id = durable.workspace_id
     AND candidate.job_id = job.job_id
   ORDER BY candidate.ordinal DESC
   LIMIT 1
) worker ON TRUE
CROSS JOIN LATERAL (
  SELECT research.run_lifecycle_status_v1(
    job.state,
    durable.state,
    producer.run_id IS NOT NULL,
    progress.snapshot->>'status',
    COALESCE(head_event.event_type IN ('run_completed', 'run_failed'), false),
    checkpoint.source_sequence IS NOT NULL
  ) AS status
) lifecycle

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
  legacy.protocol AS mode_key,
  -- A legacy 1.0.8 row is a recorded value, not a monitored lifecycle.
  CASE upper(legacy.status)
    WHEN 'COMPLETED' THEN 'COMPLETED'
    WHEN 'SUCCEEDED' THEN 'COMPLETED'
    WHEN 'COMPLETE' THEN 'COMPLETED'
    WHEN 'RUNNING' THEN 'RUNNING'
    WHEN 'FAILED' THEN 'FAILED'
    WHEN 'CANCELLED' THEN 'CANCELLED'
    WHEN 'DRAFT' THEN 'DRAFT'
    ELSE 'QUEUED'
  END AS lifecycle_status,
  NULL::text AS job_terminal_reason,
  false AS source_terminal
FROM public.run_read_models legacy
WHERE NOT EXISTS (
  SELECT 1
    FROM research.runs durable
   WHERE durable.workspace_id = legacy.workspace_id
     AND durable.run_id = legacy.run_id
);

GRANT SELECT ON research.run_library_rows_v1 TO portal_research_runtime;

COMMENT ON VIEW research.run_library_rows_v1 IS
  'P12 read-only bounded Run Library join of durable Research and legacy 1.0.8 metadata. E10: effective_status is research.run_lifecycle_status_v1 (FINISHING folded into RUNNING); lifecycle_status is the exact value. No artifact, Parquet, source transport or Execution relation is read.';

SELECT 1;
