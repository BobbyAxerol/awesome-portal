/**
 * W5a · A10c — what-if reads and the private WHATIF_GRID seal.
 *
 * Reads join only immutable facts (the parent's producer row, its diagnostic
 * job rows and their sealed grids). The seal is the worker's lease-fenced
 * write of one immutable relation; it never touches the parent run.
 */

import { Inject, Injectable } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";

import { newUlid } from "../id";
import { CONTROL_API_POOL } from "../tokens";
import { RESEARCH_DB_BUDGET, RESEARCH_DB_RUNTIME_ROLE, type ResearchScope } from "./contracts";
import { DELTA_WFO_PROFILE_ID } from "./delta-wfo.profile";
import { WHATIF_PROFILE_ID } from "./whatif.profile";
import { ResearchWhatIfError } from "./whatif.error";
import type { ResearchWhatIfGridSealIngress } from "./whatif.contract";

export interface WhatIfParentFacts {
  runId: string;
  attemptId: string;
  actorUserId: string;
  preflightToken: string;
  alphaId: string;
  alphaVersionId: string;
  executionAdapterId: "p04.delta-rsi.v1";
  adapterContractDigest: string;
  requestedSpecDigest: string;
  effectiveSpecDigest: string;
  datasetBindingDigest: string;
  manifestDigest: string;
  snapshotId: string;
  snapshotContentHash: string;
  executionProfileDigest: string | null;
  engineReleaseId: string;
  runState: string;
  requestedSpec: Record<string, unknown>;
  randomSeed: number;
  legacyStrategyId: string;
  legacyDatasetId: string;
  legacyProtocol: string;
}

export interface WhatIfJobRow {
  runId: string;
  gridKey: string;
  evaluationKeys: string[];
  state: "DRAFT" | "QUEUED" | "RUNNING" | "SEALING" | "READY" | "FAILED" | "CANCELLED" | "RECOVERY_REQUIRED";
  requestedAtUtcMs: number;
  sealed: boolean;
}

export interface WhatIfSealedResult {
  runId: string;
  trialId: string;
  state: string;
  objective: string | null;
}

function record(value: unknown): Record<string, unknown> {
  const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("expected a JSON object");
  return parsed as Record<string, unknown>;
}

function list(value: unknown): unknown[] {
  const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
  if (!Array.isArray(parsed)) throw new Error("expected a JSON array");
  return parsed;
}

@Injectable()
export class ResearchWhatIfRepository {
  constructor(@Inject(CONTROL_API_POOL) private readonly pool: Pool) {}

  /** The sealed WFO parent's immutable producer facts, or null for any other run. */
  async parentFacts(scope: ResearchScope, runId: string): Promise<WhatIfParentFacts | null> {
    return this.withTransaction(scope, true, true, async (client) => {
      const result = await client.query<Record<string, unknown>>(
        `SELECT producer.run_id, producer.attempt_id, producer.actor_user_id, producer.preflight_token,
                producer.alpha_id, producer.alpha_version_id, producer.execution_adapter_id,
                producer.adapter_contract_digest, producer.requested_spec_digest, producer.effective_spec_digest,
                producer.dataset_binding_digest, producer.manifest_digest, producer.snapshot_id,
                producer.snapshot_content_hash, producer.execution_profile_digest, producer.legacy_request,
                run.engine_release_id, run.state AS run_state
           FROM research.run_producers producer
           JOIN research.runs run ON run.workspace_id = producer.workspace_id AND run.run_id = producer.run_id
          WHERE producer.workspace_id = $1 AND producer.run_id = $2
            AND producer.execution_profile_id = $3`,
        [scope.workspaceId, runId, DELTA_WFO_PROFILE_ID],
      );
      const row = result.rows[0];
      if (!row) return null;
      const legacy = record(row.legacy_request);
      const research = record(legacy.research);
      const requestedSpec = record(research.requested_spec);
      const seed = requestedSpec.random_seed;
      return {
        runId: String(row.run_id),
        attemptId: String(row.attempt_id),
        actorUserId: String(row.actor_user_id),
        preflightToken: String(row.preflight_token),
        alphaId: String(row.alpha_id),
        alphaVersionId: String(row.alpha_version_id),
        executionAdapterId: "p04.delta-rsi.v1",
        adapterContractDigest: String(row.adapter_contract_digest),
        requestedSpecDigest: String(row.requested_spec_digest),
        effectiveSpecDigest: String(row.effective_spec_digest),
        datasetBindingDigest: String(row.dataset_binding_digest),
        manifestDigest: String(row.manifest_digest),
        snapshotId: String(row.snapshot_id),
        snapshotContentHash: String(row.snapshot_content_hash),
        executionProfileDigest: row.execution_profile_digest === null ? null : String(row.execution_profile_digest),
        engineReleaseId: String(row.engine_release_id),
        runState: String(row.run_state),
        requestedSpec,
        randomSeed: typeof seed === "number" && Number.isSafeInteger(seed) ? seed : 42,
        legacyStrategyId: String(legacy.strategy_id),
        legacyDatasetId: String(legacy.dataset_id),
        legacyProtocol: String(legacy.protocol),
      };
    });
  }

  /** The parent's diagnostic jobs, newest first (bounded). */
  async jobs(scope: ResearchScope, parentRunId: string): Promise<WhatIfJobRow[]> {
    return this.withTransaction(scope, true, true, async (client) => {
      const result = await client.query<Record<string, unknown>>(
        `SELECT job.diagnostic_run_id, job.grid_key, job.evaluations,
                floor(extract(epoch FROM job.created_at) * 1000)::bigint AS requested_at_utc_ms,
                run.state, (grid.diagnostic_run_id IS NOT NULL) AS sealed
           FROM research.whatif_jobs_v1 job
           JOIN research.runs run ON run.workspace_id = job.workspace_id AND run.run_id = job.diagnostic_run_id
           LEFT JOIN research.whatif_grids_v1 grid
             ON grid.workspace_id = job.workspace_id AND grid.diagnostic_run_id = job.diagnostic_run_id
          WHERE job.workspace_id = $1 AND job.parent_run_id = $2
          ORDER BY job.created_at DESC, job.diagnostic_run_id DESC
          LIMIT 32`,
        [scope.workspaceId, parentRunId],
      );
      return result.rows.map((row) => ({
        runId: String(row.diagnostic_run_id),
        gridKey: String(row.grid_key),
        evaluationKeys: list(row.evaluations).map((entry) => String(record(entry).evaluation_key)),
        state: String(row.state) as WhatIfJobRow["state"],
        requestedAtUtcMs: Number(row.requested_at_utc_ms),
        sealed: row.sealed === true,
      }));
    });
  }

  /** Every sealed WHATIF_GRID result for the parent, newest seal first, by evaluation key. */
  async sealedResults(scope: ResearchScope, parentRunId: string): Promise<Map<string, WhatIfSealedResult>> {
    return this.withTransaction(scope, true, true, async (client) => {
      const result = await client.query<Record<string, unknown>>(
        `SELECT diagnostic_run_id, results
           FROM research.whatif_grids_v1
          WHERE workspace_id = $1 AND parent_run_id = $2
          ORDER BY sealed_at DESC, diagnostic_run_id DESC
          LIMIT 32`,
        [scope.workspaceId, parentRunId],
      );
      const out = new Map<string, WhatIfSealedResult>();
      for (const row of result.rows) {
        for (const entry of list(row.results)) {
          const value = record(entry);
          const key = String(value.evaluation_key);
          if (out.has(key)) continue;
          out.set(key, {
            runId: String(row.diagnostic_run_id),
            trialId: String(value.trial_id),
            state: String(value.state),
            objective: value.objective === null ? null : String(value.objective),
          });
        }
      }
      return out;
    });
  }

  /**
   * Private worker seal of one immutable WHATIF_GRID relation. The lease was
   * resolved by the caller (P11 ingress); the scope is the producer actor.
   */
  async sealGrid(scope: ResearchScope, input: ResearchWhatIfGridSealIngress): Promise<{ replayed: boolean }> {
    return this.withTransaction(scope, false, false, async (client) => {
      const producer = await client.query<{ execution_profile_id: string }>(
        `SELECT execution_profile_id FROM research.run_producers WHERE workspace_id = $1 AND run_id = $2`,
        [scope.workspaceId, input.run_id],
      );
      if (producer.rows[0]?.execution_profile_id !== WHATIF_PROFILE_ID) {
        throw new ResearchWhatIfError("RESEARCH_WHATIF_CONFLICT", "Only a what-if diagnostic run may seal a what-if grid.", 409);
      }
      const job = await client.query<{ parent_run_id: string; grid_key: string; evaluations: unknown }>(
        `SELECT parent_run_id, grid_key, evaluations FROM research.whatif_jobs_v1
          WHERE workspace_id = $1 AND diagnostic_run_id = $2`,
        [scope.workspaceId, input.run_id],
      );
      const jobRow = job.rows[0];
      if (!jobRow || jobRow.grid_key !== input.grid_key) {
        throw new ResearchWhatIfError("RESEARCH_WHATIF_CONFLICT", "The what-if grid does not match its admitted job.", 409);
      }
      const requested = list(jobRow.evaluations).map((entry) => String(record(entry).evaluation_key)).sort();
      const answered = input.results.map((entry) => entry.evaluation_key).sort();
      if (requested.length !== answered.length || requested.some((key, index) => key !== answered[index])) {
        throw new ResearchWhatIfError("RESEARCH_WHATIF_CONFLICT", "The sealed results must answer exactly the admitted evaluations.", 409);
      }
      const artifact = await client.query<{ run_id: string; artifact_revision: string | number; state: string; manifest_digest: string | null }>(
        `SELECT run_id, artifact_revision, state, manifest_digest FROM research.artifacts
          WHERE workspace_id = $1 AND artifact_id = $2`,
        [scope.workspaceId, input.artifact_id],
      );
      const art = artifact.rows[0];
      if (!art || art.run_id !== input.run_id || Number(art.artifact_revision) !== input.artifact_revision
        || art.state !== "SEALED" || art.manifest_digest !== input.manifest_digest) {
        throw new ResearchWhatIfError("RESEARCH_WHATIF_CONFLICT", "The what-if grid must name its own sealed P05 artifact.", 409);
      }
      const canonicalResults = [...input.results].sort((a, b) => a.evaluation_key.localeCompare(b.evaluation_key));
      const existing = await client.query<{ results: unknown; manifest_digest: string }>(
        `SELECT results, manifest_digest FROM research.whatif_grids_v1 WHERE workspace_id = $1 AND diagnostic_run_id = $2`,
        [scope.workspaceId, input.run_id],
      );
      if (existing.rows[0]) {
        // jsonb reorders object keys; compare a canonical rendering, not bytes.
        const canonical = (rows: unknown[]) => JSON.stringify(rows.map((entry) => {
          const value = record(entry);
          return [value.evaluation_key, value.trial_id, value.state, value.objective ?? null];
        }));
        const same = existing.rows[0].manifest_digest === input.manifest_digest
          && canonical(list(existing.rows[0].results)) === canonical(canonicalResults);
        if (!same) throw new ResearchWhatIfError("RESEARCH_WHATIF_CONFLICT", "A sealed what-if grid cannot be replaced.", 409);
        return { replayed: true };
      }
      await client.query(
        `INSERT INTO research.whatif_grids_v1
           (workspace_id, diagnostic_run_id, parent_run_id, grid_key, artifact_id, artifact_revision,
            manifest_digest, results, result_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
        [scope.workspaceId, input.run_id, jobRow.parent_run_id, input.grid_key, input.artifact_id,
          input.artifact_revision, input.manifest_digest, JSON.stringify(canonicalResults), canonicalResults.length],
      );
      await client.query(
        `INSERT INTO research.audit_log
           (workspace_id, audit_id, actor_user_id, action, subject_type, subject_id, metadata)
         VALUES ($1, $2, $3, 'RESEARCH_WHATIF_GRID_SEALED', 'run', $4, $5::jsonb)`,
        [scope.workspaceId, newUlid("raud"), scope.actorUserId, input.run_id, JSON.stringify({
          parent_run_id: jobRow.parent_run_id, grid_key: input.grid_key, results: canonicalResults.length,
          manifest_digest: input.manifest_digest,
        })],
      );
      return { replayed: false };
    });
  }

  private async withTransaction<T>(
    scope: ResearchScope,
    readOnly: boolean,
    requireMembership: boolean,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    let client: PoolClient | undefined;
    let began = false;
    try {
      client = await this.pool.connect();
      await client.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
      began = true;
      await client.query(`SET LOCAL ROLE ${RESEARCH_DB_RUNTIME_ROLE}`);
      await client.query("SELECT set_config('statement_timeout', $1, true)", [`${RESEARCH_DB_BUDGET.statementTimeoutMs}ms`]);
      await client.query("SELECT set_config('lock_timeout', $1, true)", [`${RESEARCH_DB_BUDGET.lockTimeoutMs}ms`]);
      await client.query("SELECT set_config('research.workspace_id', $1, true)", [scope.workspaceId]);
      await client.query("SELECT set_config('research.actor_user_id', $1, true)", [scope.actorUserId]);
      if (requireMembership) {
        const membership = await client.query(
          "SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
          [scope.workspaceId, scope.actorUserId],
        );
        if (membership.rowCount !== 1) throw new ResearchWhatIfError("RESEARCH_WHATIF_FORBIDDEN", "Access denied.", 403);
      }
      const result = await work(client);
      await client.query("COMMIT");
      began = false;
      return result;
    } catch (error) {
      if (began && client) await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof ResearchWhatIfError) throw error;
      const wrapped = new ResearchWhatIfError("RESEARCH_WHATIF_UNAVAILABLE", "What-if data is temporarily unavailable.", 503);
      (wrapped as Error & { cause?: unknown }).cause = error;
      throw wrapped;
    } finally {
      client?.release();
    }
  }
}
