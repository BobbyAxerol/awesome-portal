/**
 * P20 bounded Compare repository.
 *
 * Compare reads Portal-persisted Research metadata, P13/P14 receipts and an
 * already-sealed RS-02 retained observation relation. It never opens a
 * QuantBT process, a source artifact/Parquet path, a Trading-System relation,
 * a worker lease, or an Execution transport. Pair math is pushed into one
 * bounded PostgreSQL aggregate over two exact sealed revisions so a browser
 * cannot cause a full raw-series transfer or perform financial math itself.
 */

import { Inject, Injectable } from "@nestjs/common";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";

import { CONTROL_API_POOL } from "../tokens";
import { acquireResearchPoolClient, BoundedResearchReadAdmission } from "./bounded-read";
import { RESEARCH_DB_BUDGET, RESEARCH_DB_RUNTIME_ROLE, type ResearchScope } from "./contracts";
import { ResearchCompareError } from "./compare.error";
import { runDisplayOrdinalSql } from "./run-display-label";
import { enrichedJoin, readEnriched } from "./enriched-analysis.read";
import type { ResearchEnrichedAnalysis } from "./enriched-analysis.contract";
import { DELTA_CAUSAL_INNER_PROFILE } from "./delta-causal-inner.profile";

/** PostgreSQL json/jsonb columns may be an object, an array or a serialized value. */
type JsonColumn = Record<string, unknown> | unknown[] | string | null;

export interface CompareAlphaRow {
  alpha_id: string;
  name: string;
}

export interface CompareRunRow {
  attempt_id: string;
  alpha_version_id: string;
  alpha_version_label: string;
  attempt_state: string;
  intent_kind: string;
  attempt_created_at: Date;
  run_id: string | null;
  run_state: string | null;
  run_created_at: Date | null;
  display_profile_id: string | null;
  display_ordinal: string | number | null;
  requested_spec_digest: string | null;
  effective_spec_digest: string | null;
  dataset_binding_digest: string | null;
  manifest_digest: string | null;
  requested_spec: JsonColumn;
  progress_snapshot: JsonColumn;
  evidence_revision: string | null;
  evidence_projection: JsonColumn;
  /** Source-bound supplement selected inside this same bounded snapshot. */
  enriched_analysis?: JsonColumn;
  enriched_digest?: string | null;
  split_revision: string | null;
  split_projection: JsonColumn;
  current_artifact_revision: string | number | null;
  current_manifest_digest: string | null;
  /** CG-P20-12: the retained seal names the SEALED P05 artifact at its own revision. */
  current_artifact_sealed: boolean | null;
  current_requested_spec_digest: string | null;
  current_effective_spec_digest: string | null;
  current_dataset_binding_digest: string | null;
  current_retained_import_digest: string | null;
  current_source_transform_digest: string | null;
  evidence_equity_sampling: string | null;
  evidence_equity_source_observation_count: string | number | null;
  evidence_equity_values: JsonColumn;
  /** CG-P20-08: the alpha version's registered lifecycle. */
  alpha_version_lifecycle: string | null;
  /** W6a: the retained Delta WFO lane — seal summary, fold rows (at most 33) and the selected candidate's metrics. */
  current_profile_id: string | null;
  current_source_summary: JsonColumn;
  current_source_table_rows: JsonColumn;
  current_source_folds: JsonColumn;
  current_selected_mean_oos_sharpe: string | null;
  current_selected_mean_decay: string | null;
  /** Complete realized outer-fold facts, never inner candidate means. */
  current_outer_mean_oos_sharpe?: string | null;
  current_outer_mean_decay?: string | null;
}

export interface CompareRetainedEquityPoint {
  runId: string;
  atUtcMs: number;
  equity: string;
  sourceCount: number;
}

export interface CompareSnapshot {
  alpha: CompareAlphaRow;
  runs: CompareRunRow[];
  totalAttempts: number;
  hasMore: boolean;
  asOfUtcMs: number;
}

export interface ComparePairRawInput {
  left: {
    runId: string;
    artifactRevision: number;
    outerOosStartUtcMs: number;
    outerOosEndExclusiveUtcMs: number;
    expectedOuterOosBars: number;
  };
  right: {
    runId: string;
    artifactRevision: number;
    outerOosStartUtcMs: number;
    outerOosEndExclusiveUtcMs: number;
    expectedOuterOosBars: number;
  };
}

export interface ComparePairRawStats {
  leftSourceCount: number;
  rightSourceCount: number;
  leftDistinctTimestampCount: number;
  rightDistinctTimestampCount: number;
  leftValidReturnCount: number;
  rightValidReturnCount: number;
  leftValidEquityCount: number;
  rightValidEquityCount: number;
  matchedCount: number;
  startUtcMs: number | null;
  endUtcMs: number | null;
  correlation: string | null;
  leftCommonReturnFraction: string | null;
  rightCommonReturnFraction: string | null;
  leftCommonMaxDrawdownFraction: string | null;
  rightCommonMaxDrawdownFraction: string | null;
  commonDailyReturnCount: number;
  leftCommonDailySharpe: string | null;
  rightCommonDailySharpe: string | null;
}

export interface ComparePairOverlayPoint {
  atUtcMs: number;
  leftEquity: string;
  rightEquity: string;
}

interface TimestampRow { as_of_utc_ms: string | number; }
interface CountRow { count: string | number; }
interface RunQueryRow extends CompareRunRow {}
interface PairStatsQueryRow {
  left_source_count: string | number;
  right_source_count: string | number;
  left_distinct_timestamp_count: string | number;
  right_distinct_timestamp_count: string | number;
  left_valid_return_count: string | number;
  right_valid_return_count: string | number;
  left_valid_equity_count: string | number;
  right_valid_equity_count: string | number;
  matched_count: string | number;
  start_utc_ms: string | number | null;
  end_utc_ms: string | number | null;
  correlation: string | null;
  left_common_return_fraction: string | null;
  right_common_return_fraction: string | null;
  left_common_max_drawdown_fraction: string | null;
  right_common_max_drawdown_fraction: string | null;
  common_daily_return_count: string | number;
  left_common_daily_sharpe: string | null;
  right_common_daily_sharpe: string | null;
}
interface OverlayQueryRow { at_utc_ms: string | number; left_equity: string; right_equity: string; }
interface CacheRow { projection: JsonColumn; }

const MAXIMUM_CONCURRENT_COMPARE_READS = 2;
const MAXIMUM_QUEUED_COMPARE_READS = 8;
const COMPARE_CACHE_TTL_SECONDS = 15 * 60;
const CACHE_SWEEP_LIMIT = 64;
const DECIMAL_PATTERN = "^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$";

function safeInteger(value: string | number | null | undefined, label: string): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new ResearchCompareError("RESEARCH_COMPARE_UNAVAILABLE", `Compare ${label} is incompatible.`, 503);
  }
  return numeric;
}

function parseRecord(value: JsonColumn, label: string): Record<string, unknown> | null {
  if (value === null) return null;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not a record");
    return parsed as Record<string, unknown>;
  } catch {
    throw new ResearchCompareError("RESEARCH_COMPARE_UNAVAILABLE", `Compare ${label} is incompatible.`, 503);
  }
}

export function compareCanonicalJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === "object") {
      return Object.fromEntries(Object.entries(item as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalize(nested)]));
    }
    return item;
  };
  return JSON.stringify(normalize(value));
}

export function compareDigest(value: unknown): string {
  return createHash("sha256").update(compareCanonicalJson(value), "utf8").digest("hex");
}

/**
 * The raw input query deliberately uses exact timestamps and no fill logic.
 * `valid_*` counts let the service reject an entire pair if a sealed source
 * relation carries an incompatible decimal/duplicate timestamp, rather than
 * quietly omitting the offending observations from a reported correlation.
 */
const PAIR_STATS_SQL = `
  WITH left_rows AS (
    SELECT occurred_at_utc_ms, payload->>'return_fraction' AS return_fraction, payload->>'equity' AS equity
      FROM research.current_source_rows_v1
     WHERE workspace_id = $1 AND run_id = $2 AND artifact_revision = $3
       AND table_kind = 'OBSERVATION'
       AND occurred_at_utc_ms >= $4 AND occurred_at_utc_ms < $5
  ),
  right_rows AS (
    SELECT occurred_at_utc_ms, payload->>'return_fraction' AS return_fraction, payload->>'equity' AS equity
      FROM research.current_source_rows_v1
     WHERE workspace_id = $1 AND run_id = $6 AND artifact_revision = $7
       AND table_kind = 'OBSERVATION'
       AND occurred_at_utc_ms >= $8 AND occurred_at_utc_ms < $9
  ),
  left_stats AS (
    SELECT count(*)::bigint AS source_count,
           count(DISTINCT occurred_at_utc_ms)::bigint AS distinct_timestamp_count,
           count(*) FILTER (WHERE return_fraction ~ '${DECIMAL_PATTERN}')::bigint AS valid_return_count,
           count(*) FILTER (WHERE CASE WHEN equity ~ '${DECIMAL_PATTERN}' THEN equity::numeric > 0 ELSE false END)::bigint AS valid_equity_count
      FROM left_rows
  ),
  right_stats AS (
    SELECT count(*)::bigint AS source_count,
           count(DISTINCT occurred_at_utc_ms)::bigint AS distinct_timestamp_count,
           count(*) FILTER (WHERE return_fraction ~ '${DECIMAL_PATTERN}')::bigint AS valid_return_count,
           count(*) FILTER (WHERE CASE WHEN equity ~ '${DECIMAL_PATTERN}' THEN equity::numeric > 0 ELSE false END)::bigint AS valid_equity_count
      FROM right_rows
  ),
  aligned AS (
    -- A materialized CTE join can become an O(n²) nested loop when restored
    -- statistics estimate one row. Group two bounded tapes by exact timestamp
    -- instead: same inner-intersection semantics, without an all-pairs scan.
    -- Duplicate timestamps are still rejected by the independent source counts.
    SELECT occurred_at_utc_ms,
           max(left_return_fraction) AS left_return_fraction,
           max(right_return_fraction) AS right_return_fraction,
           max(left_equity) AS left_equity,
           max(right_equity) AS right_equity
      FROM (
        SELECT occurred_at_utc_ms, return_fraction::numeric AS left_return_fraction,
               NULL::numeric AS right_return_fraction, equity::numeric AS left_equity,
               NULL::numeric AS right_equity
          FROM left_rows
         WHERE return_fraction ~ '${DECIMAL_PATTERN}'
           AND CASE WHEN equity ~ '${DECIMAL_PATTERN}' THEN equity::numeric > 0 ELSE false END
        UNION ALL
        SELECT occurred_at_utc_ms, NULL::numeric, return_fraction::numeric,
               NULL::numeric, equity::numeric
          FROM right_rows
         WHERE return_fraction ~ '${DECIMAL_PATTERN}'
           AND CASE WHEN equity ~ '${DECIMAL_PATTERN}' THEN equity::numeric > 0 ELSE false END
      ) qualified
     GROUP BY occurred_at_utc_ms
    HAVING count(left_return_fraction) = 1 AND count(right_return_fraction) = 1
  ),
  ordered AS (
    SELECT *,
      first_value(left_equity) OVER (ORDER BY occurred_at_utc_ms ASC) AS left_initial_equity,
      last_value(left_equity) OVER (ORDER BY occurred_at_utc_ms ASC ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS left_final_equity,
      first_value(right_equity) OVER (ORDER BY occurred_at_utc_ms ASC) AS right_initial_equity,
      last_value(right_equity) OVER (ORDER BY occurred_at_utc_ms ASC ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS right_final_equity,
      max(left_equity) OVER (ORDER BY occurred_at_utc_ms ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS left_running_peak,
      max(right_equity) OVER (ORDER BY occurred_at_utc_ms ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS right_running_peak
    FROM aligned
  ),
  daily_close AS (
    SELECT DISTINCT ON (floor(occurred_at_utc_ms::numeric / 86400000))
           floor(occurred_at_utc_ms::numeric / 86400000) AS utc_day,
           left_equity, right_equity
      FROM aligned
     ORDER BY floor(occurred_at_utc_ms::numeric / 86400000), occurred_at_utc_ms DESC
  ),
  daily_returns AS (
    SELECT left_equity / NULLIF(lag(left_equity) OVER (ORDER BY utc_day), 0) - 1 AS left_daily_return,
           right_equity / NULLIF(lag(right_equity) OVER (ORDER BY utc_day), 0) - 1 AS right_daily_return
      FROM daily_close
  ),
  daily_stats AS (
    SELECT count(*) FILTER (WHERE left_daily_return IS NOT NULL AND right_daily_return IS NOT NULL)::bigint AS return_count,
           avg(left_daily_return) AS left_mean,
           avg(right_daily_return) AS right_mean,
           stddev_samp(left_daily_return) AS left_std,
           stddev_samp(right_daily_return) AS right_std
      FROM daily_returns
  ),
  aggregate AS (
    SELECT count(*)::bigint AS matched_count,
      min(occurred_at_utc_ms)::bigint AS start_utc_ms,
      max(occurred_at_utc_ms)::bigint AS end_utc_ms,
      sum(left_return_fraction) AS sum_left,
      sum(right_return_fraction) AS sum_right,
      sum(left_return_fraction * left_return_fraction) AS sum_left_squared,
      sum(right_return_fraction * right_return_fraction) AS sum_right_squared,
      sum(left_return_fraction * right_return_fraction) AS sum_product,
      max(left_initial_equity) AS left_initial_equity,
      max(left_final_equity) AS left_final_equity,
      max(right_initial_equity) AS right_initial_equity,
      max(right_final_equity) AS right_final_equity,
      min((left_equity / NULLIF(left_running_peak, 0)) - 1) AS left_common_max_drawdown_fraction,
      min((right_equity / NULLIF(right_running_peak, 0)) - 1) AS right_common_max_drawdown_fraction
    FROM ordered
  )
  SELECT left_stats.source_count AS left_source_count,
         right_stats.source_count AS right_source_count,
         left_stats.distinct_timestamp_count AS left_distinct_timestamp_count,
         right_stats.distinct_timestamp_count AS right_distinct_timestamp_count,
         left_stats.valid_return_count AS left_valid_return_count,
         right_stats.valid_return_count AS right_valid_return_count,
         left_stats.valid_equity_count AS left_valid_equity_count,
         right_stats.valid_equity_count AS right_valid_equity_count,
         aggregate.matched_count,
         aggregate.start_utc_ms,
         aggregate.end_utc_ms,
         daily_stats.return_count AS common_daily_return_count,
         CASE WHEN daily_stats.return_count >= 2 AND daily_stats.left_std > 0
           THEN round(daily_stats.left_mean / daily_stats.left_std * sqrt(365::numeric), 12)::text
           ELSE NULL END AS left_common_daily_sharpe,
         CASE WHEN daily_stats.return_count >= 2 AND daily_stats.right_std > 0
           THEN round(daily_stats.right_mean / daily_stats.right_std * sqrt(365::numeric), 12)::text
           ELSE NULL END AS right_common_daily_sharpe,
         CASE
           WHEN aggregate.matched_count >= 3
            AND (aggregate.matched_count * aggregate.sum_left_squared - aggregate.sum_left * aggregate.sum_left) > 0
            AND (aggregate.matched_count * aggregate.sum_right_squared - aggregate.sum_right * aggregate.sum_right) > 0
           THEN round(
             (aggregate.matched_count * aggregate.sum_product - aggregate.sum_left * aggregate.sum_right)
             / sqrt(
               (aggregate.matched_count * aggregate.sum_left_squared - aggregate.sum_left * aggregate.sum_left)
               * (aggregate.matched_count * aggregate.sum_right_squared - aggregate.sum_right * aggregate.sum_right)
             ),
             12
           )::text
           ELSE NULL
         END AS correlation,
         CASE WHEN aggregate.matched_count > 0
           THEN ((aggregate.left_final_equity / NULLIF(aggregate.left_initial_equity, 0)) - 1)::text
           ELSE NULL END AS left_common_return_fraction,
         CASE WHEN aggregate.matched_count > 0
           THEN ((aggregate.right_final_equity / NULLIF(aggregate.right_initial_equity, 0)) - 1)::text
           ELSE NULL END AS right_common_return_fraction,
         aggregate.left_common_max_drawdown_fraction::text AS left_common_max_drawdown_fraction,
         aggregate.right_common_max_drawdown_fraction::text AS right_common_max_drawdown_fraction
    FROM left_stats CROSS JOIN right_stats CROSS JOIN aggregate CROSS JOIN daily_stats
`;

const PAIR_OVERLAY_SQL = `
  WITH left_rows AS (
    SELECT occurred_at_utc_ms, payload->>'equity' AS equity
      FROM research.current_source_rows_v1
     WHERE workspace_id = $1 AND run_id = $2 AND artifact_revision = $3
       AND table_kind = 'OBSERVATION'
       AND occurred_at_utc_ms >= $4 AND occurred_at_utc_ms < $5
  ),
  right_rows AS (
    SELECT occurred_at_utc_ms, payload->>'equity' AS equity
      FROM research.current_source_rows_v1
     WHERE workspace_id = $1 AND run_id = $6 AND artifact_revision = $7
       AND table_kind = 'OBSERVATION'
       AND occurred_at_utc_ms >= $8 AND occurred_at_utc_ms < $9
  ),
  aligned AS (
    SELECT occurred_at_utc_ms, max(left_equity) AS left_equity, max(right_equity) AS right_equity
      FROM (
        SELECT occurred_at_utc_ms, equity::numeric AS left_equity, NULL::numeric AS right_equity
          FROM left_rows
         WHERE CASE WHEN equity ~ '${DECIMAL_PATTERN}' THEN equity::numeric > 0 ELSE false END
        UNION ALL
        SELECT occurred_at_utc_ms, NULL::numeric, equity::numeric
          FROM right_rows
         WHERE CASE WHEN equity ~ '${DECIMAL_PATTERN}' THEN equity::numeric > 0 ELSE false END
      ) qualified
     GROUP BY occurred_at_utc_ms
    HAVING count(left_equity) = 1 AND count(right_equity) = 1
  ),
  numbered AS (
    SELECT *, row_number() OVER (ORDER BY occurred_at_utc_ms ASC) AS row_number,
           count(*) OVER () AS total_count
      FROM aligned
  )
  SELECT occurred_at_utc_ms AS at_utc_ms, left_equity::text AS left_equity, right_equity::text AS right_equity
    FROM numbered
   WHERE row_number = 1 OR row_number = total_count
      OR mod(row_number - 1, greatest(ceil((total_count - 1)::numeric / 191)::integer, 1)) = 0
   ORDER BY occurred_at_utc_ms ASC
   LIMIT 192
`;

@Injectable()
export class ResearchCompareRepository {
  private readonly admission = new BoundedResearchReadAdmission<ResearchCompareError>({
    maximumActive: MAXIMUM_CONCURRENT_COMPARE_READS,
    maximumQueued: MAXIMUM_QUEUED_COMPARE_READS,
    waitTimeoutMs: RESEARCH_DB_BUDGET.boundedReadQueueWaitMs,
    unavailable: () => new ResearchCompareError("RESEARCH_COMPARE_UNAVAILABLE", "Compare read admission is temporarily saturated.", 503),
  });

  constructor(@Inject(CONTROL_API_POOL) private readonly pool: Pool) {}

  /** A pair loads full chart companions only for its two exact opaque run IDs. */
  async pairEnriched(scope: ResearchScope, runIds: readonly string[]): Promise<Map<string, ResearchEnrichedAnalysis>> {
    if (runIds.length !== 2 || new Set(runIds).size !== 2) {
      throw new ResearchCompareError("RESEARCH_COMPARE_INVALID", "A chart pair requires two run identities.", 400);
    }
    return this.withRead(scope, async (client) => {
      const result = new Map<string, ResearchEnrichedAnalysis>();
      for (const runId of runIds) {
        const enriched = await readEnriched(client, scope.workspaceId, runId,
          () => new ResearchCompareError("RESEARCH_COMPARE_UNAVAILABLE", "Compare enrichment binding is incompatible.", 503));
        if (enriched) result.set(runId, enriched);
      }
      return result;
    });
  }

  async snapshot(
    scope: ResearchScope,
    alphaId: string,
    selectedRunIds: readonly string[] = [],
    maximumRows = 128,
  ): Promise<CompareSnapshot | null> {
    if (!Number.isSafeInteger(maximumRows) || maximumRows < 1 || maximumRows > 128) {
      throw new ResearchCompareError("RESEARCH_COMPARE_UNAVAILABLE", "Compare page budget is incompatible.", 503);
    }
    return this.withRead(scope, async (client) => {
      const timestamp = await client.query<TimestampRow>(
        "SELECT floor(extract(epoch FROM transaction_timestamp()) * 1000)::bigint AS as_of_utc_ms",
      );
      const asOfUtcMs = safeInteger(timestamp.rows[0]?.as_of_utc_ms, "snapshot timestamp");
      const alphaResult = await client.query<CompareAlphaRow>(
        `SELECT alpha_id, name FROM research.alphas WHERE workspace_id = $1 AND alpha_id = $2`,
        [scope.workspaceId, alphaId],
      );
      const alpha = alphaResult.rows[0];
      if (!alpha) return null;
      const rows = await client.query<RunQueryRow>(
        // Limit the authorized run page before joining any companion JSON.
        `SELECT bounded_runs.*, enrichment.enriched AS enriched_analysis, enrichment.enriched_digest
           FROM (
         SELECT attempt.attempt_id, attempt.alpha_version_id,
                COALESCE('av_' || replace(version.declared_contract->>'version', '.', '_'), version.alpha_version_id) AS alpha_version_label,
                attempt.state AS attempt_state, attempt.intent_kind, attempt.created_at AS attempt_created_at,
                primary_run.run_id, primary_run.state AS run_state, primary_run.created_at AS run_created_at,
                producer.execution_profile_id AS display_profile_id,
                ${runDisplayOrdinalSql("primary_run", "producer")} AS display_ordinal,
                producer.requested_spec_digest, producer.effective_spec_digest, producer.dataset_binding_digest,
                producer.manifest_digest, preflight.requested_spec,
                snapshot.snapshot AS progress_snapshot,
                evidence.projection_revision AS evidence_revision, evidence.projection AS evidence_projection,
                split.projection_revision AS split_revision, split.projection AS split_projection,
                current_source.artifact_revision AS current_artifact_revision,
                current_source.manifest_digest AS current_manifest_digest,
                -- CG-P20-12: the retained seal's manifest is the sealed P05
                -- artifact's own identity, never the preflight manifest.
                CASE WHEN current_source.artifact_revision IS NULL THEN NULL ELSE EXISTS (
                  SELECT 1 FROM research.artifacts sealed_artifact
                   WHERE sealed_artifact.workspace_id = attempt.workspace_id
                     AND sealed_artifact.run_id = primary_run.run_id
                     AND sealed_artifact.artifact_revision = current_source.artifact_revision
                     AND sealed_artifact.manifest_digest = current_source.manifest_digest
                     AND sealed_artifact.state = 'SEALED'
                ) END AS current_artifact_sealed,
                current_source.requested_spec_digest AS current_requested_spec_digest,
                current_source.effective_spec_digest AS current_effective_spec_digest,
                current_source.dataset_binding_digest AS current_dataset_binding_digest,
                current_source.retained_import_digest AS current_retained_import_digest,
                current_source.source_transform_digest AS current_source_transform_digest,
                evidence_equity.sampling AS evidence_equity_sampling,
                evidence_equity.source_observation_count AS evidence_equity_source_observation_count,
                evidence_equity.series_payload AS evidence_equity_values,
                version.lifecycle_state AS alpha_version_lifecycle,
                current_source.profile_id AS current_profile_id,
                current_source.summary AS current_source_summary,
                current_source.table_rows AS current_source_table_rows,
                current_folds.folds AS current_source_folds,
                current_candidate.mean_oos_sharpe AS current_selected_mean_oos_sharpe,
                current_candidate.mean_decay AS current_selected_mean_decay,
                current_outer.mean_oos_sharpe AS current_outer_mean_oos_sharpe,
                current_outer.mean_decay AS current_outer_mean_decay
           FROM research.attempts attempt
           JOIN research.alpha_versions version
             ON version.workspace_id = attempt.workspace_id AND version.alpha_version_id = attempt.alpha_version_id
           LEFT JOIN LATERAL (
             SELECT workspace_id, run_id, state, created_at, relationship_kind
               FROM research.runs run
              WHERE run.workspace_id = attempt.workspace_id AND run.attempt_id = attempt.attempt_id
                AND run.relationship_kind = 'PRIMARY'
              ORDER BY run.created_at ASC, run.run_id ASC
              LIMIT 1
           ) primary_run ON TRUE
           LEFT JOIN research.run_producers producer
             ON producer.workspace_id = attempt.workspace_id AND producer.run_id = primary_run.run_id
           LEFT JOIN research.preflight_manifests preflight
             ON preflight.workspace_id = producer.workspace_id
            AND preflight.preflight_token = producer.preflight_token
            AND preflight.actor_user_id = producer.actor_user_id
           LEFT JOIN LATERAL (
             SELECT snapshot
               FROM research.run_progress_snapshots progress
              WHERE progress.workspace_id = attempt.workspace_id AND progress.run_id = primary_run.run_id
              ORDER BY progress.received_at DESC
              LIMIT 1
           ) snapshot ON TRUE
           LEFT JOIN LATERAL (
             SELECT projection_revision, projection
               FROM research.run_evidence_projections_v1 evidence
              WHERE evidence.workspace_id = attempt.workspace_id AND evidence.run_id = primary_run.run_id
              ORDER BY evidence.received_at DESC, evidence.projection_revision DESC
              LIMIT 1
           ) evidence ON TRUE
           LEFT JOIN LATERAL (
             SELECT sampling, source_observation_count, series_payload
               FROM research.run_evidence_series_v1 evidence_series
              WHERE evidence_series.workspace_id = attempt.workspace_id
                AND evidence_series.run_id = primary_run.run_id
                AND evidence_series.projection_revision = evidence.projection_revision
                AND evidence_series.series_kind = 'EQUITY_OOS'
              ORDER BY evidence_series.received_at DESC
              LIMIT 1
           ) evidence_equity ON TRUE
           LEFT JOIN LATERAL (
             SELECT projection_revision, projection
               FROM research.run_split_projections_v1 split
              WHERE split.workspace_id = attempt.workspace_id AND split.run_id = primary_run.run_id
              ORDER BY split.received_at DESC, split.projection_revision DESC
              LIMIT 1
           ) split ON TRUE
           LEFT JOIN LATERAL (
             SELECT artifact_revision, manifest_digest, requested_spec_digest, effective_spec_digest,
                    dataset_binding_digest, retained_import_digest, source_transform_digest,
                    profile_id, summary, table_rows
               FROM research.current_source_seals_v1 source_seal
              WHERE source_seal.workspace_id = attempt.workspace_id AND source_seal.run_id = primary_run.run_id
              ORDER BY source_seal.artifact_revision DESC
              LIMIT 1
           ) current_source ON TRUE
           -- W6a (CG-P20-04): at most 33 retained fold rows per attempt, so
           -- 32 are shown and a 33rd proves truncation; no raw series moves.
           LEFT JOIN LATERAL (
             SELECT json_agg(json_build_object(
                      'source_ordinal', fold.source_ordinal,
                      'fold_id', fold.payload->>'fold_id',
                      'test_start_utc_ms', fold.payload->'test_start_utc_ms',
                      'test_end_utc_ms', fold.payload->'test_end_utc_ms',
                      'test_bars', fold.payload->'fold_facts'->'test_bars',
                      'oos_sharpe', fold.payload->'fold_facts'->'oos_score'->>'oos_sharpe',
                      'oos_trade_count', fold.payload->'fold_facts'->'oos_score'->>'oos_trade_count'
                    ) ORDER BY fold.source_ordinal) AS folds
               FROM (
                 SELECT source_ordinal, payload
                   FROM research.current_source_rows_v1 rows
                  WHERE rows.workspace_id = attempt.workspace_id AND rows.run_id = primary_run.run_id
                    AND rows.artifact_revision = current_source.artifact_revision AND rows.table_kind = 'FOLD'
                  ORDER BY rows.source_ordinal ASC
                  LIMIT 33
               ) fold
           ) current_folds ON current_source.artifact_revision IS NOT NULL
           -- The selected candidate carries QuantBT's own mean OOS Sharpe / decay
           -- (the same row Screen 04's fold verdict header reads).
           LEFT JOIN LATERAL (
             SELECT candidate.payload->'trial_facts'->'metrics'->>'mean_oos_sharpe' AS mean_oos_sharpe,
                    candidate.payload->'trial_facts'->'metrics'->>'mean_decay' AS mean_decay
               FROM research.current_source_rows_v1 candidate
              WHERE candidate.workspace_id = attempt.workspace_id AND candidate.run_id = primary_run.run_id
                AND candidate.artifact_revision = current_source.artifact_revision AND candidate.table_kind = 'CANDIDATE'
                AND candidate.payload->'trial_facts'->>'source_trial_id' = current_source.summary->'selection'->>'trial_id'
                AND candidate.payload->>'objective' IS NOT DISTINCT FROM current_source.summary->'selection'->>'objective'
              ORDER BY candidate.source_ordinal ASC
              LIMIT 1
           ) current_candidate ON current_source.artifact_revision IS NOT NULL
           LEFT JOIN LATERAL (
             SELECT CASE WHEN count(*) = (current_source.table_rows->>'FOLD')::integer
                          AND count(*) BETWEEN 2 AND 16 AND bool_and(valid)
                    THEN avg(CASE WHEN valid THEN oos::numeric END)::text END AS mean_oos_sharpe,
                    CASE WHEN count(*) = (current_source.table_rows->>'FOLD')::integer
                          AND count(*) BETWEEN 2 AND 16 AND bool_and(valid)
                    THEN avg(CASE WHEN valid THEN decay::numeric END)::text END AS mean_decay
               FROM (
                 SELECT payload->'causal_selection'->>'candidate_oos_metric' AS oos,
                        payload->'causal_selection'->>'candidate_decay' AS decay,
                        COALESCE(payload->'causal_selection'->>'candidate_oos_metric' ~ '${DECIMAL_PATTERN}'
                          AND length(payload->'causal_selection'->>'candidate_oos_metric') <= 96
                          AND payload->'causal_selection'->>'candidate_decay' ~ '${DECIMAL_PATTERN}'
                          AND length(payload->'causal_selection'->>'candidate_decay') <= 96
                          AND payload->'causal_selection'->>'candidate_metrics_scope' = 'OUTER_FOLD_POST_SELECTION'
                          AND payload->'causal_selection'->>'outer_oos_used_for_selection' = 'false', false) AS valid
                   FROM research.current_source_rows_v1 rows
                  WHERE rows.workspace_id = attempt.workspace_id AND rows.run_id = primary_run.run_id
                    AND rows.artifact_revision = current_source.artifact_revision AND rows.table_kind = 'FOLD'
                  ORDER BY rows.source_ordinal LIMIT 17
               ) bounded_outer
           ) current_outer ON current_source.profile_id = '${DELTA_CAUSAL_INNER_PROFILE.current_source.profile_id}'
          WHERE attempt.workspace_id = $1 AND version.alpha_id = $2
          -- A pair deep link may reference a historical run outside the
          -- normal 128-attempt ladder. Prioritize its two exact opaque IDs
          -- inside the same Alpha-scoped query, never by a browser table or
          -- cursor. The rest of the page remains bounded and deterministic.
          ORDER BY (primary_run.run_id = ANY($3::text[])) DESC NULLS LAST,
                   attempt.created_at ASC, attempt.attempt_id ASC
          LIMIT $4
           ) bounded_runs
           CROSS JOIN (SELECT $1::text AS workspace_id) companion_scope
           ${enrichedJoin("companion_scope.workspace_id", "bounded_runs.run_id")}
          ORDER BY (bounded_runs.run_id = ANY($3::text[])) DESC NULLS LAST,
                   bounded_runs.attempt_created_at ASC, bounded_runs.attempt_id ASC`,
        [scope.workspaceId, alphaId, selectedRunIds, maximumRows + 1],
      );
      const countResult = await client.query<CountRow>(
        `SELECT count(*)::bigint AS count
           FROM research.attempts attempt
           JOIN research.alpha_versions version
             ON version.workspace_id = attempt.workspace_id AND version.alpha_version_id = attempt.alpha_version_id
          WHERE attempt.workspace_id = $1 AND version.alpha_id = $2`,
        [scope.workspaceId, alphaId],
      );
      return {
        alpha,
        runs: rows.rows.slice(0, maximumRows),
        totalAttempts: safeInteger(countResult.rows[0]?.count, "attempt count"),
        hasMore: rows.rows.length > maximumRows,
        asOfUtcMs,
      };
    });
  }

  /**
   * W6a · markets small multiples for retained WFO runs: per run, 95 equal
   * ordinal buckets keep their first, last, minimum and maximum equity, so
   * the global extrema always survive (EXTREMA_BUCKET_V1, never a stride).
   */
  async retainedEquity(
    scope: ResearchScope,
    runs: ReadonlyArray<{ runId: string; artifactRevision: number }>,
  ): Promise<CompareRetainedEquityPoint[]> {
    if (runs.length === 0) return [];
    if (runs.length > 24) throw new ResearchCompareError("RESEARCH_COMPARE_UNAVAILABLE", "Compare markets budget is incompatible.", 503);
    return this.withRead(scope, async (client) => {
      const result = await client.query<{ run_id: string; at_utc_ms: string | number; equity: string; source_count: string | number }>(
        `WITH wanted AS (
           SELECT * FROM unnest($2::text[], $3::bigint[]) AS wanted(run_id, artifact_revision)
         ), observations AS (
           SELECT row.run_id, row.occurred_at_utc_ms, row.payload->>'equity' AS equity,
                  row_number() OVER (PARTITION BY row.run_id ORDER BY row.source_ordinal) AS position,
                  count(*) OVER (PARTITION BY row.run_id) AS source_count
             FROM research.current_source_rows_v1 row
             JOIN wanted ON wanted.run_id = row.run_id AND wanted.artifact_revision = row.artifact_revision
            WHERE row.workspace_id = $1 AND row.table_kind = 'OBSERVATION'
              AND row.payload->>'equity' ~ '${DECIMAL_PATTERN}'
         ), bucketed AS (
           SELECT *, ((position - 1) * 95) / source_count AS bucket FROM observations
         ), picks AS (
           (SELECT DISTINCT ON (run_id, bucket) run_id, position FROM bucketed ORDER BY run_id, bucket, position ASC)
           UNION (SELECT DISTINCT ON (run_id, bucket) run_id, position FROM bucketed ORDER BY run_id, bucket, position DESC)
           UNION (SELECT DISTINCT ON (run_id, bucket) run_id, position FROM bucketed ORDER BY run_id, bucket, equity::numeric ASC, position ASC)
           UNION (SELECT DISTINCT ON (run_id, bucket) run_id, position FROM bucketed ORDER BY run_id, bucket, equity::numeric DESC, position ASC)
         )
         SELECT bucketed.run_id, bucketed.occurred_at_utc_ms AS at_utc_ms, bucketed.equity, bucketed.source_count
           FROM bucketed JOIN picks USING (run_id, position)
          ORDER BY bucketed.run_id, bucketed.position
          LIMIT ${24 * 400}`,
        [scope.workspaceId, runs.map((run) => run.runId), runs.map((run) => run.artifactRevision)],
      );
      return result.rows.map((row) => ({
        runId: row.run_id,
        atUtcMs: safeInteger(row.at_utc_ms, "retained equity timestamp"),
        equity: row.equity,
        sourceCount: safeInteger(row.source_count, "retained equity count"),
      }));
    });
  }

  async pairRaw(scope: ResearchScope, input: ComparePairRawInput): Promise<ComparePairRawStats> {
    return this.withRead(scope, async (client) => {
      const result = await client.query<PairStatsQueryRow>(PAIR_STATS_SQL, [
        scope.workspaceId,
        input.left.runId, input.left.artifactRevision, input.left.outerOosStartUtcMs, input.left.outerOosEndExclusiveUtcMs,
        input.right.runId, input.right.artifactRevision, input.right.outerOosStartUtcMs, input.right.outerOosEndExclusiveUtcMs,
      ]);
      const row = result.rows[0];
      if (!row) throw new ResearchCompareError("RESEARCH_COMPARE_UNAVAILABLE", "Compare raw projection is unavailable.", 503);
      return {
        leftSourceCount: safeInteger(row.left_source_count, "left source count"),
        rightSourceCount: safeInteger(row.right_source_count, "right source count"),
        leftDistinctTimestampCount: safeInteger(row.left_distinct_timestamp_count, "left timestamp count"),
        rightDistinctTimestampCount: safeInteger(row.right_distinct_timestamp_count, "right timestamp count"),
        leftValidReturnCount: safeInteger(row.left_valid_return_count, "left return count"),
        rightValidReturnCount: safeInteger(row.right_valid_return_count, "right return count"),
        leftValidEquityCount: safeInteger(row.left_valid_equity_count, "left equity count"),
        rightValidEquityCount: safeInteger(row.right_valid_equity_count, "right equity count"),
        matchedCount: safeInteger(row.matched_count, "matched count"),
        startUtcMs: row.start_utc_ms === null ? null : safeInteger(row.start_utc_ms, "common start"),
        endUtcMs: row.end_utc_ms === null ? null : safeInteger(row.end_utc_ms, "common end"),
        correlation: row.correlation,
        leftCommonReturnFraction: row.left_common_return_fraction,
        rightCommonReturnFraction: row.right_common_return_fraction,
        leftCommonMaxDrawdownFraction: row.left_common_max_drawdown_fraction,
        rightCommonMaxDrawdownFraction: row.right_common_max_drawdown_fraction,
        commonDailyReturnCount: safeInteger(row.common_daily_return_count, "common daily return count"),
        leftCommonDailySharpe: row.left_common_daily_sharpe,
        rightCommonDailySharpe: row.right_common_daily_sharpe,
      };
    });
  }

  async pairOverlay(scope: ResearchScope, input: ComparePairRawInput): Promise<ComparePairOverlayPoint[]> {
    return this.withRead(scope, async (client) => {
      const result = await client.query<OverlayQueryRow>(PAIR_OVERLAY_SQL, [
        scope.workspaceId,
        input.left.runId, input.left.artifactRevision, input.left.outerOosStartUtcMs, input.left.outerOosEndExclusiveUtcMs,
        input.right.runId, input.right.artifactRevision, input.right.outerOosStartUtcMs, input.right.outerOosEndExclusiveUtcMs,
      ]);
      return result.rows.map((row) => ({
        atUtcMs: safeInteger(row.at_utc_ms, "overlay timestamp"),
        leftEquity: row.left_equity,
        rightEquity: row.right_equity,
      }));
    });
  }

  async cached(
    scope: ResearchScope,
    alphaId: string,
    mode: "attempts" | "markets" | "pair",
    requestDigest: string,
    sourceBindingDigest: string,
  ): Promise<Record<string, unknown> | null> {
    return this.withRead(scope, async (client) => {
      const result = await client.query<CacheRow>(
        `SELECT projection
           FROM research.compare_projection_cache_v1
          WHERE workspace_id = $1 AND alpha_id = $2 AND mode = $3
            AND request_digest = $4 AND source_binding_digest = $5
            AND expires_at > transaction_timestamp()
          LIMIT 1`,
        [scope.workspaceId, alphaId, mode, requestDigest, sourceBindingDigest],
      );
      return result.rowCount === 1 ? parseRecord(result.rows[0]!.projection, "cached projection") : null;
    });
  }

  /**
   * This is an operational, expiring cache—not evidence. It is keyed by the
   * complete immutable source binding and does not change a run, selection,
   * approval, or source receipt. Expired rows are compacted opportunistically
   * in this bounded write; a missed cleanup therefore cannot affect truth.
   */
  async persistCache(
    scope: ResearchScope,
    input: {
      alphaId: string;
      mode: "attempts" | "markets" | "pair";
      requestDigest: string;
      sourceBindingDigest: string;
      projectionRevision: string;
      projectionDigest: string;
      projection: Record<string, unknown>;
    },
  ): Promise<void> {
    const encoded = compareCanonicalJson(input.projection);
    if (Buffer.byteLength(encoded, "utf8") > 512 * 1024) {
      throw new ResearchCompareError("RESEARCH_COMPARE_UNAVAILABLE", "Compare projection exceeds its bounded cache budget.", 503);
    }
    await this.withWrite(scope, async (client) => {
      await client.query(
        `DELETE FROM research.compare_projection_cache_v1
          WHERE workspace_id = $1 AND alpha_id = $2 AND mode = $3
            AND request_digest = $4 AND source_binding_digest = $5
            AND expires_at <= transaction_timestamp()`,
        [scope.workspaceId, input.alphaId, input.mode, input.requestDigest, input.sourceBindingDigest],
      );
      await client.query(
        `DELETE FROM research.compare_projection_cache_v1
          WHERE ctid IN (
            SELECT ctid FROM research.compare_projection_cache_v1
             WHERE workspace_id = $1 AND expires_at <= transaction_timestamp()
             ORDER BY expires_at ASC
             LIMIT ${CACHE_SWEEP_LIMIT}
          )`,
        [scope.workspaceId],
      );
      await client.query(
        `INSERT INTO research.compare_projection_cache_v1
           (workspace_id, alpha_id, mode, request_digest, source_binding_digest,
            projection_revision, projection_digest, projection, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb,
                 transaction_timestamp() + make_interval(secs => $9::integer))
         ON CONFLICT (workspace_id, alpha_id, mode, request_digest, source_binding_digest)
         DO NOTHING`,
        [scope.workspaceId, input.alphaId, input.mode, input.requestDigest, input.sourceBindingDigest,
          input.projectionRevision, input.projectionDigest, encoded, COMPARE_CACHE_TTL_SECONDS],
      );
    });
  }

  private async withRead<T>(scope: ResearchScope, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const release = await this.admission.acquire();
    try {
      return await this.withTransaction(scope, true, work);
    } finally {
      release();
    }
  }

  private async withWrite<T>(scope: ResearchScope, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const release = await this.admission.acquire();
    try {
      return await this.withTransaction(scope, false, work);
    } finally {
      release();
    }
  }

  private async withTransaction<T>(
    scope: ResearchScope,
    readOnly: boolean,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (!scope.workspaceId?.trim() || !scope.actorUserId?.trim()) {
      throw new ResearchCompareError("RESEARCH_COMPARE_FORBIDDEN", "Authenticated Portal workspace scope is required.", 403);
    }
    let client: PoolClient | undefined;
    let began = false;
    try {
      client = readOnly
        ? await acquireResearchPoolClient(
          this.pool.connect(),
          RESEARCH_DB_BUDGET.boundedReadAcquireTimeoutMs,
          () => new ResearchCompareError("RESEARCH_COMPARE_UNAVAILABLE", "Compare database acquisition timed out.", 503),
        )
        : await this.pool.connect();
      await client.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
      began = true;
      try {
        await client.query(`SET LOCAL ROLE ${RESEARCH_DB_RUNTIME_ROLE}`);
      } catch {
        throw new ResearchCompareError("RESEARCH_COMPARE_UNAVAILABLE", "Compare authority is not configured.", 503);
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
        throw new ResearchCompareError("RESEARCH_COMPARE_FORBIDDEN", "Access denied.", 403);
      }
      const value = await work(client);
      await client.query("COMMIT");
      began = false;
      return value;
    } catch (error) {
      if (began && client) await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof ResearchCompareError) throw error;
      const code = typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code) : "";
      if (code === "40001" || code === "40P01") {
        throw new ResearchCompareError("RESEARCH_COMPARE_UNAVAILABLE", "Compare changed concurrently; reload it.", 503);
      }
      const wrapped = new ResearchCompareError("RESEARCH_COMPARE_UNAVAILABLE", "Compare is temporarily unavailable.", 503);
      (wrapped as Error & { cause?: unknown }).cause = error;
      throw wrapped;
    } finally {
      client?.release();
    }
  }
}
