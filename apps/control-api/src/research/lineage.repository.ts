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

type JsonColumn = Record<string, unknown> | string | null;

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
  promotion_attempt_id: string | null;
  promotion_run_id: string | null;
  promotion_source_contract_rev: string | null;
  promotion_source_digest: string | null;
  promotion_source_as_of: Date | null;
}

export interface LineageAttemptRow {
  attempt_id: string;
  parent_attempt_id: string | null;
  parent_alpha_id: string | null;
  alpha_version_id: string;
  alpha_version_label: string;
  state: string;
  intent_kind: string;
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
}

export interface LineageChildRunRow {
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
}

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

  async read(scope: ResearchScope, alphaId: string, limit: number): Promise<LineageSnapshot | null> {
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
                pick.attempt_id AS promotion_attempt_id, pick.run_id AS promotion_run_id,
                pick.source_contract_rev AS promotion_source_contract_rev,
                pick.source_digest AS promotion_source_digest,
                pick.source_as_of AS promotion_source_as_of
           FROM research.alpha_versions version
           LEFT JOIN research.attempt_promotion_pick_facts_v1 pick
             ON pick.workspace_id = version.workspace_id
            AND pick.alpha_version_id = version.alpha_version_id
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
                attempt.state, attempt.intent_kind, attempt.reason, attempt.space_signature,
                attempt.created_at, attempt.updated_at,
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
          ORDER BY attempt.created_at ASC, attempt.attempt_id ASC
          LIMIT $3`,
        [scope.workspaceId, alphaId, limit + 1],
      );
      const visibleAttempts = attempts.rows.slice(0, limit);
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

      const countResult = await client.query<LineageCountsRow>(
        `WITH selected_attempts AS (
           SELECT attempt.attempt_id, attempt.state
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
           (SELECT count(*) FROM selected_attempts WHERE state = 'DRAFT')::bigint AS draft_attempts,
           (SELECT count(*) FROM selected_attempts WHERE state <> 'DRAFT')::bigint AS submitted_attempts,
           (SELECT count(*) FROM selected_attempts WHERE state = 'FAILED')::bigint AS failed_attempts,
           (SELECT count(*) FROM selected_attempts WHERE state = 'ABANDONED')::bigint AS abandoned_attempts,
           (SELECT count(*) FROM selected_runs WHERE relationship_kind <> 'PRIMARY')::bigint AS child_runs,
           COALESCE((SELECT sum(GREATEST(max_ordinal - 1, 0)) FROM job_retries), 0)::bigint AS technical_retries`,
        [scope.workspaceId, alphaId],
      );
      const counts = countResult.rows[0];
      if (!counts) {
        throw new ResearchLineageError("RESEARCH_LINEAGE_UNAVAILABLE", "Attempt Lineage counts were not readable.", 503);
      }
      return {
        alpha,
        versions: versions.rows,
        attempts: visibleAttempts,
        childRuns,
        counts,
        hasMore: attempts.rows.length > limit,
        asOfUtcMs,
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
