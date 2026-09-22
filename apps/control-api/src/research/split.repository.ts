/** P14 immutable split-source persistence and bounded same-origin reader. */

import { Inject, Injectable } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";

import { CONTROL_API_POOL } from "../tokens";
import { RESEARCH_DB_BUDGET, RESEARCH_DB_RUNTIME_ROLE, type ResearchScope } from "./contracts";
import { ResearchSplitError } from "./split.error";
import type { ProgressIngressScope } from "./progress.repository";

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

export interface SplitProjectionWrite {
  runId: string;
  sourceSplitDigest: string;
  sourceManifestDigest: string;
  sourcePayload: unknown;
  sourceEventSequence: number;
  projectionRevision: string;
  projectionDigest: string;
  readiness: "COMPLETE" | "PARTIAL";
  projection: unknown;
}

export interface SplitHubRow {
  kind: "DURABLE" | "LEGACY";
  runId: string;
  /**
   * P15 consumes only this immutable P10 binding identifier; it never reads
   * the private producer envelope or an artifact path. Keeping it beside the
   * P14 hub lets later source-as-is readers reject a static declaration that
   * does not match the historical producer contract.
   */
  adapterContractDigest: string | null;
  requestedSpecDigest: string | null;
  effectiveSpecDigest: string | null;
  datasetBindingDigest: string | null;
  manifestDigest: string | null;
  /** Internal bounded P10 request; readers extract only validated public facts. */
  legacyRequest: JsonValue;
  progressSnapshot: JsonValue;
  jobState: string | null;
  revision: string | null;
  projection: JsonValue;
  readiness: "COMPLETE" | "PARTIAL" | null;
  sourceSplitDigest: string | null;
  receivedAt: Date | null;
  asOfUtcMs: number;
}

interface HubQueryRow {
  run_id: string;
  adapter_contract_digest: string | null;
  requested_spec_digest: string | null;
  effective_spec_digest: string | null;
  dataset_binding_digest: string | null;
  manifest_digest: string | null;
  legacy_request: JsonValue;
  progress_snapshot: JsonValue;
  job_state: string | null;
  projection_revision: string | null;
  projection: JsonValue;
  readiness: "COMPLETE" | "PARTIAL" | null;
  source_split_digest: string | null;
  received_at: Date | null;
}
interface LegacyRunRow { run_id: string; }
interface TimestampRow { as_of_utc_ms: string | number; }

const MAXIMUM_CONCURRENT_SPLIT_READS = 2;
const MAXIMUM_QUEUED_SPLIT_READS = 8;

function asSafeNonNegative(value: string | number | null, label: string): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new ResearchSplitError("RESEARCH_SPLIT_UNAVAILABLE", `Split ${label} is incompatible.`, 503);
  }
  return numeric;
}

/**
 * P14 reads one exact workspace/run/revision and persists only immutable
 * source/projection facts. It never joins raw snapshot storage, P10 scratch,
 * artifacts, external data, execution relations or a generic history table.
 */
@Injectable()
export class ResearchSplitRepository {
  private activeReads = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(@Inject(CONTROL_API_POOL) private readonly pool: Pool) {}

  async persist(scope: ProgressIngressScope, write: SplitProjectionWrite): Promise<void> {
    await this.withTransaction(scope.workspaceId, scope.actorUserId, false, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${scope.workspaceId}:${write.runId}:${scope.workerAttemptId}:research-split-v1`,
      ]);
      const producer = await client.query<{ manifest_digest: string }>(
        `SELECT manifest_digest
           FROM research.run_producers
          WHERE workspace_id = $1 AND run_id = $2 AND worker_attempt_id = $3
          LIMIT 1`,
        [scope.workspaceId, write.runId, scope.workerAttemptId],
      );
      // A receipt belongs to the immutable producer binding, not merely to a
      // syntactically valid run ID. This blocks a terminal sidecar from being
      // replayed under another manifest after a lease/retry boundary.
      if (producer.rowCount !== 1 || producer.rows[0]!.manifest_digest !== write.sourceManifestDigest) {
        throw new ResearchSplitError("RESEARCH_SPLIT_CONFLICT", "Split source does not match the immutable producer manifest.", 409);
      }
      const source = await client.query<{ source_split_digest: string }>(
        `SELECT source_split_digest
           FROM research.run_split_sources_v1
          WHERE workspace_id = $1 AND run_id = $2 AND worker_attempt_id = $3 AND source_event_sequence = $4`,
        [scope.workspaceId, write.runId, scope.workerAttemptId, write.sourceEventSequence],
      );
      if (source.rowCount === 1) {
        if (source.rows[0]!.source_split_digest !== write.sourceSplitDigest) {
          throw new ResearchSplitError("RESEARCH_SPLIT_CONFLICT", "Split source conflicts with its terminal event.", 409);
        }
      } else {
        await client.query(
          `INSERT INTO research.run_split_sources_v1
             (workspace_id, run_id, worker_attempt_id, source_event_sequence, source_split_digest, source_payload)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
          [
            scope.workspaceId, write.runId, scope.workerAttemptId,
            write.sourceEventSequence, write.sourceSplitDigest, JSON.stringify(write.sourcePayload),
          ],
        );
      }
      const existing = await client.query<{ projection_digest: string }>(
        `SELECT projection_digest
           FROM research.run_split_projections_v1
          WHERE workspace_id = $1 AND run_id = $2 AND worker_attempt_id = $3 AND projection_revision = $4`,
        [scope.workspaceId, write.runId, scope.workerAttemptId, write.projectionRevision],
      );
      if (existing.rowCount === 1) {
        if (existing.rows[0]!.projection_digest !== write.projectionDigest) {
          throw new ResearchSplitError("RESEARCH_SPLIT_CONFLICT", "Split projection revision conflicts with immutable source facts.", 409);
        }
        return;
      }
      await client.query(
        `INSERT INTO research.run_split_projections_v1
           (workspace_id, run_id, worker_attempt_id, projection_revision, source_event_sequence,
            source_split_digest, projection_version, projection_digest, readiness, projection)
         VALUES ($1, $2, $3, $4, $5, $6, 'research.split-projection.v1', $7, $8, $9::jsonb)`,
        [
          scope.workspaceId, write.runId, scope.workerAttemptId, write.projectionRevision,
          write.sourceEventSequence, write.sourceSplitDigest, write.projectionDigest,
          write.readiness, JSON.stringify(write.projection),
        ],
      );
    });
  }

  async hub(scope: ResearchScope, runId: string): Promise<SplitHubRow | null> {
    return this.withScopedRead(scope, async (client) => {
      const timestamp = await client.query<TimestampRow>(
        "SELECT floor(extract(epoch FROM transaction_timestamp()) * 1000)::bigint AS as_of_utc_ms",
      );
      const asOfUtcMs = asSafeNonNegative(timestamp.rows[0]?.as_of_utc_ms ?? null, "snapshot timestamp");
      const durable = await client.query<HubQueryRow>(
        `SELECT producer.run_id,
                producer.adapter_contract_digest,
                producer.requested_spec_digest,
                producer.effective_spec_digest,
                producer.dataset_binding_digest,
                producer.manifest_digest,
                producer.legacy_request,
                snapshot.snapshot AS progress_snapshot,
                job.state AS job_state,
                projection.projection_revision,
                projection.projection,
                projection.readiness,
                projection.source_split_digest,
                projection.received_at
           FROM research.run_producers producer
           JOIN research.jobs job
             ON job.workspace_id = producer.workspace_id AND job.job_id = producer.job_id
           LEFT JOIN research.run_progress_snapshots snapshot
             ON snapshot.workspace_id = producer.workspace_id
            AND snapshot.run_id = producer.run_id
            AND snapshot.worker_attempt_id = producer.worker_attempt_id
           LEFT JOIN LATERAL (
             SELECT projection_revision, projection, readiness, source_split_digest, received_at
               FROM research.run_split_projections_v1
              WHERE workspace_id = producer.workspace_id AND run_id = producer.run_id
                AND worker_attempt_id = producer.worker_attempt_id
              ORDER BY received_at DESC, projection_revision DESC
              LIMIT 1
           ) projection ON true
          WHERE producer.workspace_id = $1 AND producer.run_id = $2
          ORDER BY producer.created_at DESC
          LIMIT 1`,
        [scope.workspaceId, runId],
      );
      const row = durable.rows[0];
      if (row) {
        return {
          kind: "DURABLE" as const, runId: row.run_id,
          adapterContractDigest: row.adapter_contract_digest,
          requestedSpecDigest: row.requested_spec_digest,
          effectiveSpecDigest: row.effective_spec_digest,
          datasetBindingDigest: row.dataset_binding_digest,
          manifestDigest: row.manifest_digest,
          legacyRequest: row.legacy_request,
          progressSnapshot: row.progress_snapshot,
          jobState: row.job_state,
          revision: row.projection_revision,
          projection: row.projection,
          readiness: row.readiness,
          sourceSplitDigest: row.source_split_digest,
          receivedAt: row.received_at,
          asOfUtcMs,
        };
      }
      const legacy = await client.query<LegacyRunRow>(
        "SELECT run_id FROM public.run_read_models WHERE workspace_id = $1 AND run_id = $2 LIMIT 1",
        [scope.workspaceId, runId],
      );
      if (legacy.rowCount !== 1) return null;
      return {
        kind: "LEGACY" as const, runId,
        adapterContractDigest: null,
        requestedSpecDigest: null, effectiveSpecDigest: null, datasetBindingDigest: null, manifestDigest: null,
        legacyRequest: null,
        progressSnapshot: null, jobState: null, revision: null, projection: null, readiness: null,
        sourceSplitDigest: null, receivedAt: null, asOfUtcMs,
      };
    });
  }

  private async withScopedRead<T>(scope: ResearchScope, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const release = await this.acquireReadAdmission();
    try {
      return await this.withTransaction(scope.workspaceId, scope.actorUserId, true, async (client) => {
        const membership = await client.query(
          "SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
          [scope.workspaceId, scope.actorUserId],
        );
        if (membership.rowCount !== 1) {
          throw new ResearchSplitError("RESEARCH_SPLIT_FORBIDDEN", "Access denied.", 403);
        }
        return work(client);
      });
    } finally {
      release();
    }
  }

  private async withTransaction<T>(
    workspaceId: string,
    actorUserId: string,
    readOnly: boolean,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    let client: PoolClient | undefined;
    let began = false;
    try {
      client = await this.pool.connect();
      await client.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
      began = true;
      try {
        await client.query(`SET LOCAL ROLE ${RESEARCH_DB_RUNTIME_ROLE}`);
      } catch {
        throw new ResearchSplitError("RESEARCH_SPLIT_UNAVAILABLE", "Split authority is not configured.", 503);
      }
      await client.query("SELECT set_config('statement_timeout', $1, true)", [`${RESEARCH_DB_BUDGET.statementTimeoutMs}ms`]);
      await client.query("SELECT set_config('lock_timeout', $1, true)", [`${RESEARCH_DB_BUDGET.lockTimeoutMs}ms`]);
      await client.query("SELECT set_config('idle_in_transaction_session_timeout', $1, true)", [`${RESEARCH_DB_BUDGET.idleTransactionTimeoutMs}ms`]);
      await client.query("SELECT set_config('research.workspace_id', $1, true)", [workspaceId]);
      await client.query("SELECT set_config('research.actor_user_id', $1, true)", [actorUserId]);
      const result = await work(client);
      await client.query("COMMIT");
      began = false;
      return result;
    } catch (error) {
      if (began && client) await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof ResearchSplitError) throw error;
      const code = typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code) : "";
      if (code === "40001" || code === "40P01") {
        throw new ResearchSplitError("RESEARCH_SPLIT_UNAVAILABLE", "Split changed concurrently; reload it.", 503);
      }
      const wrapped = new ResearchSplitError("RESEARCH_SPLIT_UNAVAILABLE", "Split is temporarily unavailable.", 503);
      (wrapped as Error & { cause?: unknown }).cause = error;
      throw wrapped;
    } finally {
      client?.release();
    }
  }

  private async acquireReadAdmission(): Promise<() => void> {
    if (this.activeReads < MAXIMUM_CONCURRENT_SPLIT_READS) {
      this.activeReads += 1;
      return () => this.releaseReadAdmission();
    }
    if (this.waiters.length >= MAXIMUM_QUEUED_SPLIT_READS) {
      throw new ResearchSplitError("RESEARCH_SPLIT_UNAVAILABLE", "Split read admission is temporarily saturated.", 503);
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    return () => this.releaseReadAdmission();
  }

  private releaseReadAdmission(): void {
    const next = this.waiters.shift();
    if (next) {
      next();
      return;
    }
    this.activeReads -= 1;
  }
}
