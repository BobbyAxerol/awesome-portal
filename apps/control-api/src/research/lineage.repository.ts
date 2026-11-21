/**
 * P19 bounded, repeatable-read Attempt Lineage repository.
 *
 * This reader touches only Portal-owned Research metadata.  It does not open
 * an engine, worker, artifact/Parquet store, Trading System relation, or
 * Execution transport.  Every response uses one scoped snapshot and a fixed
 * query shape; child and exposure facts are fetched in batches rather than
 * one query per rendered node.
 */

import { Inject, Injectable } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";

import { CONTROL_API_POOL } from "../tokens";
import { RESEARCH_DB_BUDGET, RESEARCH_DB_RUNTIME_ROLE, type ResearchScope } from "./contracts";
import { ResearchLineageError } from "./lineage.error";
import { ResearchRunLibraryRepository, type RunLibraryRow } from "./run-library.repository";
import { DELTA_CAUSAL_INNER_PROFILE } from "./delta-causal-inner.profile";
import { readPinnedAuditProofs } from "./final-audit.read";
import type { VerifiedPinnedAudit } from "./final-audit.contract";

type JsonColumn = Record<string, unknown> | string | null;
const OUTER_DECIMAL_PATTERN = "^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$";

export interface LineageAlphaRow {
  alpha_id: string;
  name: string;
  active_version_id: string | null;
  active_version_state: string | null;
}

export interface LineageVersionRow {
  alpha_version_id: string;
  code_digest: string;
  entrypoint: string;
  declared_contract: JsonColumn;
  lifecycle_state: string;
  registered_at: Date;
  /** RF-03 (migration 057): recorded predecessor; `false` for versions registered before it. */
  supersedes_alpha_version_id?: string | null;
  supersedes_recorded?: boolean | null;
  /** The version's chronologically first attempt, over the whole history (CG-P19-03). */
  first_attempt_id?: string | null;
  promotion_attempt_id: string | null;
  promotion_run_id: string | null;
  promotion_source_contract_rev: string | null;
  promotion_source_digest: string | null;
  promotion_source_as_of: Date | null;
  promotion_receipt_count?: number | null;
  promotion_selected_trial_id?: string | null;
  promotion_selected_params_digest?: string | null;
  /** Null unless the receipt's RC/run and actual same-workspace R1 pin all match. */
  promotion_approval_id?: string | null;
}

export interface LineageAttemptRow {
  attempt_id: string;
  parent_attempt_id: string | null;
  parent_alpha_id: string | null;
  alpha_version_id: string;
  alpha_version_label: string;
  state: string;
  intent_kind: string;
  relation_kind?: string | null;
  reason: string | null;
  space_signature: string | null;
  created_at: Date;
  updated_at: Date;
  primary_run_id: string | null;
  primary_run_state: string | null;
  effective_spec_digest: string | null;
  engine_release_id: string | null;
  dataset_binding_digest: string | null;
  requested_spec: JsonColumn;
  effective_spec: JsonColumn;
  technical_retry_count: string | number | null;
  exposure_count: string | number | null;
  exposure_roles: string[] | null;
  latest_source_as_of: Date | null;
  /** W6b: run_producers.execution_profile_id of the primary run. */
  execution_profile_id?: string | null;
  /** Exact microsecond keyset text for the older-page cursor (CG-P19-09). */
  created_at_cursor?: string;
}

/** W6b CG-P19-05: the selected trial's retained metrics from the run's latest RS-02 seal. */
export interface LineageRetainedMetricsRow {
  run_id: string;
  artifact_revision: string | number;
  metrics: JsonColumn;
  validation_claim?: string | null;
  source_attested?: boolean;
  profile_id?: string | null;
}

export interface LineageClaimSplitRow {
  run_id: string;
  projection: JsonColumn;
}

/** W6b CG-P19-06: distinct declared (route, mode, schedule, overrides) per version. */
export interface LineageExercisedRow {
  alpha_version_id: string;
  execution_route: string | null;
  optimization_mode: string | null;
  optimization_schedule: string | null;
  parameter_space_overrides: unknown;
  attempts: string | number;
}

/** Older-page boundary decoded from a server-issued cursor. */
export interface LineageBoundary {
  createdAt: string;
  attemptId: string;
}

export interface LineageChildRunRow {
  verified_audit?: VerifiedPinnedAudit;
  attempt_id: string;
  run_id: string;
  run_kind: string;
  relationship_kind: string;
  parent_run_id: string | null;
  state: string;
  created_at: Date;
}

export interface LineageCountsRow {
  total_attempts: string | number;
  /** Full logical prefix before the signed keyset boundary, not this page's size. */
  attempts_before_boundary?: string | number;
  draft_attempts: string | number;
  submitted_attempts: string | number;
  failed_attempts: string | number;
  abandoned_attempts: string | number;
  child_runs: string | number;
  technical_retries: string | number;
}

export interface LineageSnapshot {
  alpha: LineageAlphaRow;
  versions: LineageVersionRow[];
  attempts: LineageAttemptRow[];
  childRuns: LineageChildRunRow[];
  counts: LineageCountsRow;
  hasMore: boolean;
  asOfUtcMs: number;
  /** W6b: Run Library rows (same snapshot) of the returned primary runs and every pick run. */
  libraryRows?: RunLibraryRow[];
  /** W6b: retained RS-02 selected-trial metrics of the returned primary runs. */
  retainedMetrics?: LineageRetainedMetricsRow[];
  /** Latest persisted P14 protocol projection for each visible primary run. */
  claimSplits?: LineageClaimSplitRow[];
  /** W6b: grouped declared specs of every attempt of each version, bounded. */
  exercised?: LineageExercisedRow[];
  /** True when `exercised` hit its bound and is not the whole declaration set. */
  exercisedBounded?: boolean;
  /** Which page this is: the newest window or an older page under a cursor. */
  window?: "NEWEST" | "OLDER_PAGE";
}

/** Distinct declaration groups read per Alpha before `exercised` says PARTIAL. */
export const LINEAGE_EXERCISED_GROUP_BOUND = 256;

interface TimestampRow { as_of_utc_ms: string | number; }

const MAXIMUM_CONCURRENT_LINEAGE_READS = 2;
const MAXIMUM_QUEUED_LINEAGE_READS = 8;

function integer(value: string | number | null | undefined, label: string): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new ResearchLineageError(
      "RESEARCH_LINEAGE_UNAVAILABLE",
      `Attempt Lineage ${label} is incompatible with persisted metadata.`,
      503,
    );
  }
  return numeric;
}

@Injectable()
export class ResearchLineageRepository {
  private activeReads = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(@Inject(CONTROL_API_POOL) private readonly pool: Pool) {}

  async read(
    scope: ResearchScope,
    alphaId: string,
    limit: number,
    boundary: LineageBoundary | null = null,
  ): Promise<LineageSnapshot | null> {
    this.assertScope(scope);
    return this.withScopedRead(scope, async (client) => {
      const timestamp = await client.query<TimestampRow>(
        "SELECT floor(extract(epoch FROM transaction_timestamp()) * 1000)::bigint AS as_of_utc_ms",
      );
      const asOfUtcMs = integer(timestamp.rows[0]?.as_of_utc_ms, "snapshot timestamp");
      const alphaResult = await client.query<LineageAlphaRow>(
        `SELECT alpha.alpha_id, alpha.name, alpha.active_version_id,
                active.lifecycle_state AS active_version_state
           FROM research.alphas alpha
           LEFT JOIN research.alpha_versions active
             ON active.workspace_id = alpha.workspace_id
            AND active.alpha_version_id = alpha.active_version_id
          WHERE alpha.workspace_id = $1 AND alpha.alpha_id = $2`,
        [scope.workspaceId, alphaId],
      );
      const alpha = alphaResult.rows[0];
      if (!alpha) return null;

      const versions = await client.query<LineageVersionRow>(
        `SELECT version.alpha_version_id, version.code_digest, version.entrypoint,
                version.declared_contract, version.lifecycle_state, version.registered_at,
                version.supersedes_alpha_version_id, version.supersedes_recorded,
                (SELECT first_attempt.attempt_id
                   FROM research.attempts first_attempt
                  WHERE first_attempt.workspace_id = version.workspace_id
                    AND first_attempt.alpha_version_id = version.alpha_version_id
                    AND first_attempt.intent_kind <> 'DIAGNOSTIC'
                  ORDER BY first_attempt.created_at ASC, first_attempt.attempt_id ASC
                  LIMIT 1) AS first_attempt_id,
                pick.attempt_id AS promotion_attempt_id, pick.run_id AS promotion_run_id,
                pick.source_contract_rev AS promotion_source_contract_rev,
                pick.source_digest AS promotion_source_digest,
                pick.source_as_of AS promotion_source_as_of,
                receipt.receipt_count AS promotion_receipt_count,
                receipt.selected_trial_id AS promotion_selected_trial_id,
                receipt.selected_params_digest AS promotion_selected_params_digest,
                receipt.approval_id AS promotion_approval_id
           FROM research.alpha_versions version
           LEFT JOIN research.attempt_promotion_pick_facts_v1 pick
             ON pick.workspace_id = version.workspace_id
            AND pick.alpha_version_id = version.alpha_version_id
           LEFT JOIN LATERAL (
             SELECT count(*)::integer AS receipt_count,
                    max(source_receipt.selected_trial_id) AS selected_trial_id,
                    max(selection.parameter_bundle_digest) AS selected_params_digest,
                    -- Only the existing P22 SECURITY DEFINER writer can
                    -- attest R1/workspace/Alpha identity. The Research runtime
                    -- cannot read Governance directly and gets no new grant.
                    max(CASE WHEN pack.release_candidate_id IS NOT NULL
                                   AND receipt_run.run_id IS NOT NULL
                                   AND (receipt_run.run_id = pack.run_id OR
                                        (receipt_run.relationship_kind = 'AUDIT_OF_SELECTION'
                                         AND receipt_run.parent_run_id = pack.run_id))
                             THEN source_receipt.approval_id END) AS approval_id
               FROM research.p22_promotion_pick_receipts_v1 source_receipt
               LEFT JOIN research.release_candidate_packs_v1 pack
                 ON pack.workspace_id = source_receipt.workspace_id
                AND pack.release_candidate_id = source_receipt.release_candidate_id
                AND pack.pack_digest = source_receipt.pack_digest
               LEFT JOIN research.runs receipt_run
                 ON receipt_run.workspace_id = source_receipt.workspace_id
                AND receipt_run.run_id = source_receipt.run_id
                AND receipt_run.attempt_id = pick.attempt_id
               LEFT JOIN research.selection_records selection
                 ON selection.workspace_id = source_receipt.workspace_id
                AND selection.selection_id = source_receipt.selection_id
                AND selection.selected_trial_id IS NOT DISTINCT FROM source_receipt.selected_trial_id
              WHERE source_receipt.workspace_id = version.workspace_id
                AND source_receipt.alpha_version_id = version.alpha_version_id
                AND source_receipt.run_id = pick.run_id
                AND source_receipt.fact_digest = pick.source_digest
           ) receipt ON pick.alpha_version_id IS NOT NULL
          WHERE version.workspace_id = $1 AND version.alpha_id = $2
          ORDER BY version.registered_at ASC, version.alpha_version_id ASC`,
        [scope.workspaceId, alphaId],
      );

      const attempts = await client.query<LineageAttemptRow>(
        `SELECT attempt.attempt_id, attempt.parent_attempt_id,
                parent_version.alpha_id AS parent_alpha_id,
                attempt.alpha_version_id,
                COALESCE('av_' || replace(version.declared_contract->>'version', '.', '_'), version.alpha_version_id)
                  AS alpha_version_label,
                attempt.state, attempt.intent_kind, attempt.reason, attempt.space_signature, attempt.relation_kind,
                attempt.created_at, attempt.updated_at,
                to_char(attempt.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at_cursor,
                producer.execution_profile_id,
                primary_run.run_id AS primary_run_id,
                primary_run.state AS primary_run_state,
                primary_run.effective_spec_digest, primary_run.engine_release_id,
                primary_run.dataset_binding_digest,
                preflight.requested_spec, preflight.effective_spec,
                COALESCE(retry.retry_count, 0) AS technical_retry_count,
                COALESCE(exposure.exposure_count, 0) AS exposure_count,
                exposure.exposure_roles,
                exposure.latest_source_as_of
           FROM research.attempts attempt
           JOIN research.alpha_versions version
             ON version.workspace_id = attempt.workspace_id
            AND version.alpha_version_id = attempt.alpha_version_id
           LEFT JOIN research.attempts parent_attempt
             ON parent_attempt.workspace_id = attempt.workspace_id
            AND parent_attempt.attempt_id = attempt.parent_attempt_id
           LEFT JOIN research.alpha_versions parent_version
             ON parent_version.workspace_id = parent_attempt.workspace_id
            AND parent_version.alpha_version_id = parent_attempt.alpha_version_id
           LEFT JOIN LATERAL (
             SELECT run_id, state, effective_spec_digest, engine_release_id, dataset_binding_digest
               FROM research.runs run
              WHERE run.workspace_id = attempt.workspace_id
                AND run.attempt_id = attempt.attempt_id
                AND run.relationship_kind = 'PRIMARY'
              ORDER BY run.created_at ASC, run.run_id ASC
              LIMIT 1
           ) primary_run ON TRUE
           LEFT JOIN research.run_producers producer
             ON producer.workspace_id = attempt.workspace_id
            AND producer.run_id = primary_run.run_id
           LEFT JOIN research.preflight_manifests preflight
             ON preflight.workspace_id = producer.workspace_id
            AND preflight.preflight_token = producer.preflight_token
            AND preflight.actor_user_id = producer.actor_user_id
           LEFT JOIN LATERAL (
             SELECT COALESCE(sum(GREATEST(worker_max.ordinal - 1, 0)), 0)::bigint AS retry_count
               FROM research.jobs job
               LEFT JOIN LATERAL (
                 SELECT COALESCE(max(worker.ordinal), 1) AS ordinal
                   FROM research.worker_attempts worker
                  WHERE worker.workspace_id = job.workspace_id
                    AND worker.job_id = job.job_id
               ) worker_max ON TRUE
              WHERE job.workspace_id = attempt.workspace_id
                AND job.run_id = primary_run.run_id
           ) retry ON TRUE
           LEFT JOIN LATERAL (
             SELECT count(*)::bigint AS exposure_count,
                    COALESCE(array_agg(DISTINCT fact.evaluation_role ORDER BY fact.evaluation_role), ARRAY[]::text[]) AS exposure_roles,
                    max(fact.source_as_of) AS latest_source_as_of
               FROM research.exposure_facts fact
               JOIN research.runs exposure_run
                 ON exposure_run.workspace_id = fact.workspace_id
                AND exposure_run.run_id = fact.run_id
              WHERE fact.workspace_id = attempt.workspace_id
                AND exposure_run.attempt_id = attempt.attempt_id
           ) exposure ON TRUE
          WHERE attempt.workspace_id = $1 AND version.alpha_id = $2
            -- W5a A10c: a what-if diagnostic is not an attempt of the Alpha;
            -- it is listed below as a DIAGNOSTIC_OF_RUN child of its parent.
            AND attempt.intent_kind <> 'DIAGNOSTIC'
            ${boundary ? "AND (attempt.created_at < $4::timestamptz OR (attempt.created_at = $4::timestamptz AND attempt.attempt_id < $5))" : ""}
          ORDER BY attempt.created_at DESC, attempt.attempt_id DESC
          LIMIT $3`,
        boundary
          ? [scope.workspaceId, alphaId, limit + 1, boundary.createdAt, boundary.attemptId]
          : [scope.workspaceId, alphaId, limit + 1],
      );
      // CG-P19-09: the page is the newest `limit` attempts before the boundary
      // (so the latest work is never cut off), returned oldest-first.
      const visibleAttempts = attempts.rows.slice(0, limit).reverse();
      const ids = visibleAttempts.map((row) => row.attempt_id);
      const childRuns = ids.length === 0
        ? []
        : (await client.query<LineageChildRunRow>(
          `WITH child_runs AS (
             -- A what-if diagnostic run lives in its own DIAGNOSTIC attempt;
             -- it is shown under the attempt of the run it diagnoses.
             SELECT CASE WHEN own.intent_kind = 'DIAGNOSTIC' THEN own.parent_attempt_id ELSE run.attempt_id END AS attempt_id,
                    run.run_id, run.run_kind, run.relationship_kind, run.parent_run_id, run.state, run.created_at
               FROM research.runs run
               JOIN research.attempts own
                 ON own.workspace_id = run.workspace_id AND own.attempt_id = run.attempt_id
              WHERE run.workspace_id = $1
                AND run.relationship_kind <> 'PRIMARY'
                AND (run.attempt_id = ANY($2::text[])
                     OR (own.intent_kind = 'DIAGNOSTIC' AND own.parent_attempt_id = ANY($2::text[])))
           ),
           ranked_child_runs AS (
             SELECT attempt_id, run_id, run_kind, relationship_kind, parent_run_id, state, created_at,
                    row_number() OVER (
                      PARTITION BY attempt_id
                      ORDER BY created_at ASC, run_id ASC
                    ) AS row_number
              FROM child_runs
           )
           SELECT attempt_id, run_id, run_kind, relationship_kind, parent_run_id, state, created_at
             FROM ranked_child_runs
            WHERE row_number <= 33
            ORDER BY attempt_id ASC, created_at ASC, run_id ASC`,
          [scope.workspaceId, ids],
        )).rows;

      const childPrefix = new Map<string, number>();
      const auditedIds = childRuns.filter(child => {
        const n = childPrefix.get(child.attempt_id) ?? 0;
        childPrefix.set(child.attempt_id,n+1);
        return n < 32 && child.relationship_kind === "AUDIT_OF_SELECTION" && child.state === "READY";
      }).map(child=>child.run_id);
      const verifiedAudits = await readPinnedAuditProofs(client,scope.workspaceId,auditedIds);
      for (const child of childRuns) {
        const proof = verifiedAudits.get(child.run_id);
        if (proof) child.verified_audit = proof;
      }
      const countResult = await client.query<LineageCountsRow>(
        `WITH selected_attempts AS (
           SELECT attempt.attempt_id, attempt.state, attempt.created_at
             FROM research.attempts attempt
             JOIN research.alpha_versions version
               ON version.workspace_id = attempt.workspace_id
              AND version.alpha_version_id = attempt.alpha_version_id
            WHERE attempt.workspace_id = $1 AND version.alpha_id = $2
              AND attempt.intent_kind <> 'DIAGNOSTIC'
         ),
         selected_runs AS (
           SELECT run.run_id, run.attempt_id, run.relationship_kind
             FROM research.runs run
             JOIN research.attempts own
               ON own.workspace_id = run.workspace_id AND own.attempt_id = run.attempt_id
            WHERE run.workspace_id = $1
              AND (run.attempt_id IN (SELECT attempt_id FROM selected_attempts)
                   OR (own.intent_kind = 'DIAGNOSTIC'
                       AND own.parent_attempt_id IN (SELECT attempt_id FROM selected_attempts)))
         ),
         job_retries AS (
           SELECT job.job_id, COALESCE(max(worker.ordinal), 1) AS max_ordinal
             FROM research.jobs job
             JOIN selected_runs run ON run.run_id = job.run_id
             LEFT JOIN research.worker_attempts worker
               ON worker.workspace_id = job.workspace_id AND worker.job_id = job.job_id
            WHERE job.workspace_id = $1
            GROUP BY job.job_id
         )
         SELECT
           (SELECT count(*) FROM selected_attempts)::bigint AS total_attempts,
           (SELECT count(*) FROM selected_attempts
             ${boundary ? "WHERE (created_at, attempt_id) < ($3::timestamptz, $4::text)" : ""}
           )::bigint AS attempts_before_boundary,
           (SELECT count(*) FROM selected_attempts WHERE state = 'DRAFT')::bigint AS draft_attempts,
           (SELECT count(*) FROM selected_attempts WHERE state <> 'DRAFT')::bigint AS submitted_attempts,
           (SELECT count(*) FROM selected_attempts WHERE state = 'FAILED')::bigint AS failed_attempts,
           (SELECT count(*) FROM selected_attempts WHERE state = 'ABANDONED')::bigint AS abandoned_attempts,
           (SELECT count(*) FROM selected_runs WHERE relationship_kind <> 'PRIMARY')::bigint AS child_runs,
           COALESCE((SELECT sum(GREATEST(max_ordinal - 1, 0)) FROM job_retries), 0)::bigint AS technical_retries`,
        boundary ? [scope.workspaceId, alphaId, boundary.createdAt, boundary.attemptId]
          : [scope.workspaceId, alphaId],
      );
      const counts = countResult.rows[0];
      if (!counts) {
        throw new ResearchLineageError("RESEARCH_LINEAGE_UNAVAILABLE", "Attempt Lineage counts were not readable.", 503);
      }

      // W6b CG-P19-04/05: the same Run Library rows Screen 01 maps (cert,
      // claim, OOS/decay cells, P21 rc relation), read inside this snapshot
      // for the returned primary runs and every published pick run (<= 192).
      const runIds = [...new Set([
        ...visibleAttempts.map((row) => row.primary_run_id).filter((id): id is string => id !== null),
        ...versions.rows.map((row) => row.promotion_run_id).filter((id): id is string => id !== null),
      ])];
      const libraryRows = runIds.length === 0
        ? []
        : (await client.query<RunLibraryRow>(
          `${ResearchRunLibraryRepository.selectColumns()}
             FROM research.run_library_rows_v1 library
             ${ResearchRunLibraryRepository.pageJoins()}
            WHERE library.workspace_id = $1 AND library.run_id = ANY($2::text[])`,
          [scope.workspaceId, runIds],
        )).rows;

      // W6b CG-P19-05: a Delta WFO run's retained RS-02 seal names its selected
      // trial; that trial's candidate row carries QuantBT's mean OOS Sharpe and
      // decay across folds.  Latest seal per run only; no artifact is opened.
      const primaryIds = visibleAttempts.map((row) => row.primary_run_id).filter((id): id is string => id !== null);
      const retainedMetrics = primaryIds.length === 0
        ? []
        : (await client.query<LineageRetainedMetricsRow>(
          `SELECT seal.run_id, seal.artifact_revision, seal.profile_id,
                  CASE WHEN seal.profile_id = '${DELTA_CAUSAL_INNER_PROFILE.current_source.profile_id}'
                    THEN jsonb_build_object('mean_oos_sharpe', outer_facts.mean_oos_sharpe,
                      'mean_decay', outer_facts.mean_decay, 'basis', 'OUTER_FOLD_SELECTED_OOS_MEAN')
                    ELSE candidate.payload->'trial_facts'->'metrics' END AS metrics,
                  seal.summary->'source_facts'->'claims'->>'validation_claim' AS validation_claim,
                  EXISTS (SELECT 1 FROM research.artifacts artifact
                           WHERE artifact.workspace_id = seal.workspace_id AND artifact.run_id = seal.run_id
                             AND artifact.artifact_revision = seal.artifact_revision
                             AND artifact.manifest_digest = seal.manifest_digest
                             AND artifact.state = 'SEALED') AS source_attested
             FROM unnest($2::text[]) AS wanted(run_id)
             JOIN LATERAL (
               SELECT source.workspace_id, source.run_id, source.artifact_revision, source.profile_id, source.manifest_digest, source.summary, source.table_rows
                 FROM research.current_source_seals_v1 source
                WHERE source.workspace_id = $1 AND source.run_id = wanted.run_id
                ORDER BY source.artifact_revision DESC
                LIMIT 1
             ) seal ON TRUE
             LEFT JOIN LATERAL (
               SELECT row.payload
                 FROM research.current_source_rows_v1 row
                WHERE row.workspace_id = seal.workspace_id
                  AND row.run_id = seal.run_id
                  AND row.artifact_revision = seal.artifact_revision
                  AND row.table_kind = 'CANDIDATE'
                  AND row.payload->'trial_facts'->>'source_trial_id' = seal.summary->'selection'->>'trial_id'
                  AND row.payload->>'objective' IS NOT DISTINCT FROM seal.summary->'selection'->>'objective'
                ORDER BY row.source_ordinal ASC
                LIMIT 1
             ) candidate ON TRUE
             LEFT JOIN LATERAL (
               SELECT CASE WHEN count(*) = (seal.table_rows->>'FOLD')::integer
                            AND count(*) BETWEEN 2 AND 16 AND bool_and(valid)
                      THEN avg(CASE WHEN valid THEN oos::numeric END)::text END AS mean_oos_sharpe,
                      CASE WHEN count(*) = (seal.table_rows->>'FOLD')::integer
                            AND count(*) BETWEEN 2 AND 16 AND bool_and(valid)
                      THEN avg(CASE WHEN valid THEN decay::numeric END)::text END AS mean_decay
                 FROM (
                   SELECT payload->'causal_selection'->>'candidate_oos_metric' AS oos,
                          payload->'causal_selection'->>'candidate_decay' AS decay,
                          COALESCE(payload->'causal_selection'->>'candidate_oos_metric' ~ '${OUTER_DECIMAL_PATTERN}'
                            AND length(payload->'causal_selection'->>'candidate_oos_metric') <= 96
                            AND payload->'causal_selection'->>'candidate_decay' ~ '${OUTER_DECIMAL_PATTERN}'
                            AND length(payload->'causal_selection'->>'candidate_decay') <= 96
                            AND payload->'causal_selection'->>'candidate_metrics_scope' = 'OUTER_FOLD_POST_SELECTION'
                            AND payload->'causal_selection'->>'outer_oos_used_for_selection' = 'false', false) AS valid
                     FROM research.current_source_rows_v1 rows
                    WHERE rows.workspace_id = seal.workspace_id AND rows.run_id = seal.run_id
                      AND rows.artifact_revision = seal.artifact_revision AND rows.table_kind = 'FOLD'
                    ORDER BY rows.source_ordinal LIMIT 17
                 ) bounded_outer
             ) outer_facts ON seal.profile_id = '${DELTA_CAUSAL_INNER_PROFILE.current_source.profile_id}'`,
          [scope.workspaceId, primaryIds],
        )).rows;

      const claimSplits = primaryIds.length === 0
        ? []
        : (await client.query<LineageClaimSplitRow>(
          `SELECT DISTINCT ON (split.run_id) split.run_id, split.projection
             FROM research.run_split_projections_v1 split
            WHERE split.workspace_id = $1 AND split.run_id = ANY($2::text[])
            ORDER BY split.run_id, split.received_at DESC, split.projection_revision DESC`,
          [scope.workspaceId, primaryIds],
        )).rows;

      // W6b CG-P19-06: what each version's attempts declared, grouped over
      // every attempt of the Alpha (not only this page) and bounded.
      const exercised = (await client.query<LineageExercisedRow>(
        `SELECT attempt.alpha_version_id,
                preflight.requested_spec->>'execution_route' AS execution_route,
                preflight.requested_spec->>'optimization_mode' AS optimization_mode,
                preflight.requested_spec->>'optimization_schedule' AS optimization_schedule,
                preflight.requested_spec->'parameter_space_overrides' AS parameter_space_overrides,
                count(*)::bigint AS attempts
           FROM research.attempts attempt
           JOIN research.alpha_versions version
             ON version.workspace_id = attempt.workspace_id
            AND version.alpha_version_id = attempt.alpha_version_id
           LEFT JOIN LATERAL (
             SELECT run_id
               FROM research.runs run
              WHERE run.workspace_id = attempt.workspace_id
                AND run.attempt_id = attempt.attempt_id
                AND run.relationship_kind = 'PRIMARY'
              ORDER BY run.created_at ASC, run.run_id ASC
              LIMIT 1
           ) primary_run ON TRUE
           LEFT JOIN research.run_producers producer
             ON producer.workspace_id = attempt.workspace_id
            AND producer.run_id = primary_run.run_id
           LEFT JOIN research.preflight_manifests preflight
             ON preflight.workspace_id = producer.workspace_id
            AND preflight.preflight_token = producer.preflight_token
            AND preflight.actor_user_id = producer.actor_user_id
          WHERE attempt.workspace_id = $1 AND version.alpha_id = $2
            AND attempt.intent_kind <> 'DIAGNOSTIC'
          GROUP BY 1, 2, 3, 4, 5
          ORDER BY 1, 2 NULLS LAST, 3 NULLS LAST, 4 NULLS LAST
          LIMIT $3`,
        [scope.workspaceId, alphaId, LINEAGE_EXERCISED_GROUP_BOUND + 1],
      )).rows;

      return {
        alpha,
        versions: versions.rows,
        attempts: visibleAttempts,
        childRuns,
        counts,
        hasMore: attempts.rows.length > limit,
        asOfUtcMs,
        libraryRows,
        retainedMetrics,
        claimSplits,
        exercised: exercised.slice(0, LINEAGE_EXERCISED_GROUP_BOUND),
        exercisedBounded: exercised.length > LINEAGE_EXERCISED_GROUP_BOUND,
        window: boundary ? "OLDER_PAGE" : "NEWEST",
      };
    });
  }

  private assertScope(scope: ResearchScope): void {
    if (!scope.workspaceId?.trim() || !scope.actorUserId?.trim()) {
      throw new ResearchLineageError("RESEARCH_LINEAGE_FORBIDDEN", "Authenticated Portal workspace scope is required.", 403);
    }
  }

  private async withScopedRead<T>(scope: ResearchScope, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const releaseAdmission = await this.acquireAdmission();
    let client: PoolClient | undefined;
    let began = false;
    try {
      client = await this.pool.connect();
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      began = true;
      try {
        await client.query(`SET LOCAL ROLE ${RESEARCH_DB_RUNTIME_ROLE}`);
      } catch {
        throw new ResearchLineageError("RESEARCH_LINEAGE_UNAVAILABLE", "Attempt Lineage authority is not configured.", 503);
      }
      await client.query("SELECT set_config('statement_timeout', $1, true)", [`${RESEARCH_DB_BUDGET.statementTimeoutMs}ms`]);
      await client.query("SELECT set_config('lock_timeout', $1, true)", [`${RESEARCH_DB_BUDGET.lockTimeoutMs}ms`]);
      await client.query("SELECT set_config('idle_in_transaction_session_timeout', $1, true)", [`${RESEARCH_DB_BUDGET.idleTransactionTimeoutMs}ms`]);
      await client.query("SELECT set_config('research.workspace_id', $1, true)", [scope.workspaceId]);
      await client.query("SELECT set_config('research.actor_user_id', $1, true)", [scope.actorUserId]);
      const membership = await client.query(
        "SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
        [scope.workspaceId, scope.actorUserId],
      );
      if (membership.rowCount !== 1) {
        throw new ResearchLineageError("RESEARCH_LINEAGE_FORBIDDEN", "Access denied.", 403);
      }
      const result = await work(client);
      await client.query("COMMIT");
      began = false;
      return result;
    } catch (error) {
      if (began && client) await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof ResearchLineageError) throw error;
      const code = typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
      if (code === "40001" || code === "40P01") {
        throw new ResearchLineageError(
          "RESEARCH_LINEAGE_UNAVAILABLE",
          "Attempt Lineage changed concurrently; retry from the current Alpha page.",
          503,
        );
      }
      const wrapped = new ResearchLineageError(
        "RESEARCH_LINEAGE_UNAVAILABLE",
        "Attempt Lineage is temporarily unavailable.",
        503,
      );
      (wrapped as Error & { cause?: unknown }).cause = error;
      throw wrapped;
    } finally {
      client?.release();
      releaseAdmission();
    }
  }

  private async acquireAdmission(): Promise<() => void> {
    if (this.activeReads < MAXIMUM_CONCURRENT_LINEAGE_READS) {
      this.activeReads += 1;
      return () => this.releaseAdmission();
    }
    if (this.waiters.length >= MAXIMUM_QUEUED_LINEAGE_READS) {
      throw new ResearchLineageError(
        "RESEARCH_LINEAGE_UNAVAILABLE",
        "Attempt Lineage admission is temporarily saturated; retry shortly.",
        503,
      );
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    return () => this.releaseAdmission();
  }

  private releaseAdmission(): void {
    const next = this.waiters.shift();
    if (next) {
      next();
      return;
    }
    this.activeReads -= 1;
  }
}
