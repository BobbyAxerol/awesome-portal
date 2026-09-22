/** P13 immutable source-evidence persistence and bounded reader. */

import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";

import { CONTROL_API_POOL } from "../tokens";
import { acquireResearchPoolClient, BoundedResearchReadAdmission } from "./bounded-read";
import { RESEARCH_DB_BUDGET, RESEARCH_DB_RUNTIME_ROLE, type ResearchScope } from "./contracts";
import { ResearchEvidenceError } from "./evidence.error";
import type { ProgressIngressScope } from "./progress.repository";

type JsonValue = Record<string, unknown> | unknown[] | string | null;

export interface EvidenceProjectionWrite {
  runId: string;
  sourceEvidenceDigest: string;
  /** Already validated at the P13 ingress boundary before persistence. */
  sourcePayload: unknown;
  sourceEventSequence: number;
  projectionRevision: string;
  projectionDigest: string;
  readiness: "COMPLETE" | "PARTIAL";
  /** A private, canonical JSON projection; browser reads receive the DTO. */
  projection: unknown;
  series: Array<{
    kind: "EQUITY_OOS" | "MONTHLY_RETURNS" | "ROLLING_RETURNS_20" | "RETURN_DISTRIBUTION";
    availabilityState: "AVAILABLE" | "NOT_PUBLISHED" | "NOT_APPLICABLE";
    reasonCode: string | null;
    sourceObservationCount: number | null;
    emittedPointCount: number;
    sampling: "FULL" | "EXTREMA_BUCKET_V1" | "TAIL_WINDOW_V1" | "FULL_RETURN_HISTOGRAM_V2" | null;
    values: unknown[];
    digest: string;
  }>;
}

export interface EvidenceHubRow {
  kind: "DURABLE" | "LEGACY";
  runId: string;
  requestedSpec: JsonValue;
  requestedSpecDigest: string | null;
  effectiveSpecDigest: string | null;
  datasetBindingDigest: string | null;
  manifestDigest: string | null;
  progressSnapshot: JsonValue;
  jobState: string | null;
  revision: string | null;
  projection: JsonValue;
  readiness: "COMPLETE" | "PARTIAL" | null;
  sourceEvidenceDigest: string | null;
  receivedAt: Date | null;
  asOfUtcMs: number;
}

export interface EvidenceSeriesRow {
  revision: string;
  kind: "EQUITY_OOS" | "MONTHLY_RETURNS" | "ROLLING_RETURNS_20" | "RETURN_DISTRIBUTION";
  availabilityState: "AVAILABLE" | "NOT_PUBLISHED" | "NOT_APPLICABLE";
  reasonCode: string | null;
  sourceObservationCount: number | null;
  emittedPointCount: number;
  sampling: "FULL" | "EXTREMA_BUCKET_V1" | "TAIL_WINDOW_V1" | "FULL_RETURN_HISTOGRAM_V2" | null;
  /** Canonical digest of `values`, verified before a reader receives it. */
  digest: string;
  values: JsonValue;
}

export interface EvidenceReadBundle {
  hub: EvidenceHubRow | null;
  /** Each row is pinned to `hub.revision` inside one repeatable-read txn. */
  series: Map<EvidenceSeriesRow["kind"], EvidenceSeriesRow>;
}

interface HubQueryRow {
  run_id: string;
  requested_spec: JsonValue;
  requested_spec_digest: string | null;
  effective_spec_digest: string | null;
  dataset_binding_digest: string | null;
  manifest_digest: string | null;
  progress_snapshot: JsonValue;
  job_state: string | null;
  projection_revision: string | null;
  projection: JsonValue;
  readiness: "COMPLETE" | "PARTIAL" | null;
  source_evidence_digest: string | null;
  received_at: Date | null;
}

interface LegacyRunRow { run_id: string; }
interface TimestampRow { as_of_utc_ms: string | number; }
interface SeriesQueryRow {
  projection_revision: string;
  series_kind: EvidenceSeriesRow["kind"];
  availability_state: EvidenceSeriesRow["availabilityState"];
  reason_code: string | null;
  source_observation_count: string | number | null;
  emitted_point_count: string | number;
  sampling: EvidenceSeriesRow["sampling"];
  series_payload: JsonValue;
  series_digest: string;
}

const MAXIMUM_CONCURRENT_EVIDENCE_READS = 2;
const MAXIMUM_QUEUED_EVIDENCE_READS = 8;

function asSafeNonNegative(value: string | number | null, label: string): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE", `Evidence ${label} is incompatible.`, 503);
  }
  return numeric;
}

function asArray(value: JsonValue): unknown[] | null {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Match the source/projection canonical JSON identity exactly. */
function canonicalJson(value: unknown): string {
  const normalize = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (entry && typeof entry === "object") {
      return Object.fromEntries(
        Object.entries(entry as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nested]) => [key, normalize(nested)]),
      );
    }
    return entry;
  };
  return JSON.stringify(normalize(value));
}

function sha256Json(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

/**
 * P13 does not use generic tables or `SELECT *`: every path is an exact
 * workspace/run/revision key, takes a finite DB role/timeout, and never
 * opens the historical artifact store or a worker filesystem.
 */
@Injectable()
export class ResearchEvidenceRepository {
  private readonly readAdmission = new BoundedResearchReadAdmission<ResearchEvidenceError>({
    maximumActive: MAXIMUM_CONCURRENT_EVIDENCE_READS,
    maximumQueued: MAXIMUM_QUEUED_EVIDENCE_READS,
    waitTimeoutMs: RESEARCH_DB_BUDGET.boundedReadQueueWaitMs,
    unavailable: () => new ResearchEvidenceError(
      "RESEARCH_EVIDENCE_UNAVAILABLE", "Evidence read admission is temporarily saturated.", 503,
    ),
  });

  constructor(@Inject(CONTROL_API_POOL) private readonly pool: Pool) {}

  async persist(scope: ProgressIngressScope, write: EvidenceProjectionWrite): Promise<void> {
    await this.withTransaction(scope.workspaceId, scope.actorUserId, false, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${scope.workspaceId}:${write.runId}:${scope.workerAttemptId}:research-evidence-v1`,
      ]);
      const existing = await client.query<{
        source_evidence_digest: string;
        source_payload: JsonValue;
      }>(
        `SELECT source_evidence_digest, source_payload
           FROM research.run_evidence_sources_v1
          WHERE workspace_id = $1 AND run_id = $2 AND worker_attempt_id = $3 AND source_event_sequence = $4`,
        [scope.workspaceId, write.runId, scope.workerAttemptId, write.sourceEventSequence],
      );
      if (existing.rowCount === 1) {
        if (existing.rows[0]!.source_evidence_digest !== write.sourceEvidenceDigest) {
          throw new ResearchEvidenceError("RESEARCH_EVIDENCE_CONFLICT", "Evidence source conflicts with its terminal event.", 409);
        }
      } else {
        await client.query(
          `INSERT INTO research.run_evidence_sources_v1
             (workspace_id, run_id, worker_attempt_id, source_event_sequence, source_evidence_digest, source_payload)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
          [
            scope.workspaceId, write.runId, scope.workerAttemptId,
            write.sourceEventSequence, write.sourceEvidenceDigest, JSON.stringify(write.sourcePayload),
          ],
        );
      }
      const projectionExisting = await client.query<{ projection_digest: string; source_evidence_digest: string }>(
        `SELECT projection_digest, source_evidence_digest
           FROM research.run_evidence_projections_v1
          WHERE workspace_id = $1 AND run_id = $2 AND worker_attempt_id = $3 AND projection_revision = $4`,
        [scope.workspaceId, write.runId, scope.workerAttemptId, write.projectionRevision],
      );
      if (projectionExisting.rowCount === 1) {
        if (
          projectionExisting.rows[0]!.projection_digest !== write.projectionDigest
          || projectionExisting.rows[0]!.source_evidence_digest !== write.sourceEvidenceDigest
        ) {
          throw new ResearchEvidenceError("RESEARCH_EVIDENCE_CONFLICT", "Evidence projection revision conflicts with immutable source facts.", 409);
        }
        const existingSeries = await client.query<{
          series_kind: EvidenceProjectionWrite["series"][number]["kind"];
          series_digest: string;
          emitted_point_count: string | number;
          source_observation_count: string | number | null;
          sampling: EvidenceProjectionWrite["series"][number]["sampling"];
        }>(
          `SELECT series_kind, series_digest, emitted_point_count, source_observation_count, sampling
             FROM research.run_evidence_series_v1
            WHERE workspace_id = $1 AND run_id = $2 AND worker_attempt_id = $3 AND projection_revision = $4`,
          [scope.workspaceId, write.runId, scope.workerAttemptId, write.projectionRevision],
        );
        if (existingSeries.rowCount !== write.series.length) {
          throw new ResearchEvidenceError("RESEARCH_EVIDENCE_CONFLICT", "Evidence projection is missing an immutable series binding.", 409);
        }
        const expected = new Map(write.series.map((item) => [item.kind, item]));
        for (const item of existingSeries.rows) {
          const expectedItem = expected.get(item.series_kind);
          if (
            !expectedItem
            || item.series_digest !== expectedItem.digest
            || Number(item.emitted_point_count) !== expectedItem.emittedPointCount
            || (item.source_observation_count === null ? null : Number(item.source_observation_count))
              !== expectedItem.sourceObservationCount
            || item.sampling !== expectedItem.sampling
          ) {
            throw new ResearchEvidenceError("RESEARCH_EVIDENCE_CONFLICT", "Evidence series conflicts with immutable projection identity.", 409);
          }
        }
        return;
      }
      await client.query(
        `INSERT INTO research.run_evidence_projections_v1
           (workspace_id, run_id, worker_attempt_id, projection_revision, source_event_sequence,
            source_evidence_digest, projection_version, projection_digest, readiness, projection)
         VALUES ($1, $2, $3, $4, $5, $6, 'research.evidence-projection.v1', $7, $8, $9::jsonb)`,
        [
          scope.workspaceId, write.runId, scope.workerAttemptId, write.projectionRevision,
          write.sourceEventSequence, write.sourceEvidenceDigest, write.projectionDigest,
          write.readiness, JSON.stringify(write.projection),
        ],
      );
      for (const series of write.series) {
        await client.query(
          `INSERT INTO research.run_evidence_series_v1
             (workspace_id, run_id, worker_attempt_id, projection_revision, series_kind, availability_state,
              reason_code, source_observation_count, emitted_point_count, sampling, series_payload, series_digest)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)`,
          [
            scope.workspaceId, write.runId, scope.workerAttemptId, write.projectionRevision,
            series.kind, series.availabilityState, series.reasonCode, series.sourceObservationCount,
            series.emittedPointCount, series.sampling, JSON.stringify(series.values), series.digest,
          ],
        );
      }
    });
  }

  async hub(scope: ResearchScope, runId: string, signal?: AbortSignal): Promise<EvidenceHubRow | null> {
    return this.withScopedRead(scope, (client) => this.readHub(client, scope, runId), signal);
  }

  /** Read Hub and selected series from one repeatable-read revision fence. */
  async bundle(
    scope: ResearchScope,
    runId: string,
    kinds: readonly EvidenceSeriesRow["kind"][],
    signal?: AbortSignal,
  ): Promise<EvidenceReadBundle> {
    return this.withScopedRead(scope, async (client) => {
      const hub = await this.readHub(client, scope, runId);
      if (!hub?.revision || kinds.length === 0) return { hub, series: new Map() };
      const requested = [...new Set(kinds)];
      const result = await client.query<SeriesQueryRow>(
        `SELECT projection_revision, series_kind, availability_state, reason_code,
                source_observation_count, emitted_point_count, sampling, series_payload, series_digest
           FROM research.run_evidence_series_v1
          WHERE workspace_id = $1 AND run_id = $2 AND projection_revision = $3
            AND series_kind = ANY($4::text[])
          ORDER BY series_kind ASC`,
        [scope.workspaceId, runId, hub.revision, requested],
      );
      const series = new Map<EvidenceSeriesRow["kind"], EvidenceSeriesRow>();
      for (const row of result.rows) {
        const parsed = this.mapSeries(row);
        if (parsed.revision !== hub.revision) {
          throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE", "Evidence bundle revision is incompatible.", 503);
        }
        series.set(parsed.kind, parsed);
      }
      return { hub, series };
    }, signal);
  }

  private async readHub(client: PoolClient, scope: ResearchScope, runId: string): Promise<EvidenceHubRow | null> {
      const timestamp = await client.query<TimestampRow>(
        "SELECT floor(extract(epoch FROM transaction_timestamp()) * 1000)::bigint AS as_of_utc_ms",
      );
      const asOfUtcMs = asSafeNonNegative(timestamp.rows[0]?.as_of_utc_ms ?? null, "snapshot timestamp");
      const durable = await client.query<HubQueryRow>(
        `SELECT producer.run_id,
                preflight.requested_spec,
                producer.requested_spec_digest,
                producer.effective_spec_digest,
                producer.dataset_binding_digest,
                producer.manifest_digest,
                snapshot.snapshot AS progress_snapshot,
                job.state AS job_state,
                projection.projection_revision,
                projection.projection,
                projection.readiness,
                projection.source_evidence_digest,
                projection.received_at
           FROM research.run_producers producer
           JOIN research.jobs job
             ON job.workspace_id = producer.workspace_id AND job.job_id = producer.job_id
           LEFT JOIN research.preflight_manifests preflight
             ON preflight.workspace_id = producer.workspace_id
            AND preflight.preflight_token = producer.preflight_token
            AND preflight.actor_user_id = producer.actor_user_id
           LEFT JOIN research.run_progress_snapshots snapshot
             ON snapshot.workspace_id = producer.workspace_id
            AND snapshot.run_id = producer.run_id
            AND snapshot.worker_attempt_id = producer.worker_attempt_id
           LEFT JOIN LATERAL (
             SELECT projection_revision, projection, readiness, source_evidence_digest, received_at
               FROM research.run_evidence_projections_v1
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
          kind: "DURABLE" as const,
          runId: row.run_id,
          requestedSpec: row.requested_spec,
          requestedSpecDigest: row.requested_spec_digest,
          effectiveSpecDigest: row.effective_spec_digest,
          datasetBindingDigest: row.dataset_binding_digest,
          manifestDigest: row.manifest_digest,
          progressSnapshot: row.progress_snapshot,
          jobState: row.job_state,
          revision: row.projection_revision,
          projection: row.projection,
          readiness: row.readiness,
          sourceEvidenceDigest: row.source_evidence_digest,
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
        kind: "LEGACY" as const, runId, requestedSpec: null,
        requestedSpecDigest: null, effectiveSpecDigest: null, datasetBindingDigest: null, manifestDigest: null,
        progressSnapshot: null, jobState: null, revision: null, projection: null, readiness: null,
        sourceEvidenceDigest: null, receivedAt: null, asOfUtcMs,
      };
  }

  async series(
    scope: ResearchScope,
    runId: string,
    kind: EvidenceSeriesRow["kind"],
  ): Promise<EvidenceSeriesRow | null> {
    return this.withScopedRead(scope, async (client) => {
      const result = await client.query<SeriesQueryRow>(
        `SELECT series.projection_revision, series.series_kind, series.availability_state, series.reason_code,
                series.source_observation_count, series.emitted_point_count, series.sampling, series.series_payload,
                series.series_digest
           FROM research.run_producers producer
           JOIN research.run_evidence_projections_v1 projection
             ON projection.workspace_id = producer.workspace_id AND projection.run_id = producer.run_id
            AND projection.worker_attempt_id = producer.worker_attempt_id
           JOIN research.run_evidence_series_v1 series
             ON series.workspace_id = projection.workspace_id AND series.run_id = projection.run_id
            AND series.worker_attempt_id = projection.worker_attempt_id
            AND series.projection_revision = projection.projection_revision
          WHERE producer.workspace_id = $1 AND producer.run_id = $2 AND series.series_kind = $3
          ORDER BY projection.received_at DESC, projection.projection_revision DESC
          LIMIT 1`,
        [scope.workspaceId, runId, kind],
      );
      const row = result.rows[0];
      return row ? this.mapSeries(row) : null;
    });
  }

  private mapSeries(row: SeriesQueryRow): EvidenceSeriesRow {
    const values = asArray(row.series_payload);
    if (!values || values.length > 192) {
      throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE", "Evidence series is incompatible.", 503);
    }
    const emittedPointCount = asSafeNonNegative(row.emitted_point_count, "series point count");
    if (emittedPointCount !== values.length) {
      throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE", "Evidence series count is incompatible.", 503);
    }
    if (sha256Json(values) !== row.series_digest) {
      throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE", "Evidence series integrity is incompatible.", 503);
    }
    return {
      revision: row.projection_revision,
      kind: row.series_kind,
      availabilityState: row.availability_state,
      reasonCode: row.reason_code,
      sourceObservationCount: row.source_observation_count === null
        ? null : asSafeNonNegative(row.source_observation_count, "series source count"),
      emittedPointCount,
      sampling: row.sampling,
      digest: row.series_digest,
      values,
    };
  }

  private async withScopedRead<T>(
    scope: ResearchScope,
    work: (client: PoolClient) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const release = await this.readAdmission.acquire(signal);
    try {
      return await this.withTransaction(scope.workspaceId, scope.actorUserId, true, async (client) => {
        const membership = await client.query(
          "SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
          [scope.workspaceId, scope.actorUserId],
        );
        if (membership.rowCount !== 1) {
          throw new ResearchEvidenceError("RESEARCH_EVIDENCE_FORBIDDEN", "Access denied.", 403);
        }
        return work(client);
      }, signal);
    } finally {
      release();
    }
  }

  private async withTransaction<T>(
    workspaceId: string,
    actorUserId: string,
    readOnly: boolean,
    work: (client: PoolClient) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    let client: PoolClient | undefined;
    let began = false;
    try {
      // RS-01 bounds viewer reads only. Terminal-sidecar writes retain their
      // existing recovery semantics: a transient write failure is retried from
      // the sealed source callback, not silently converted into read shedding.
      client = readOnly
        ? await acquireResearchPoolClient(
          this.pool.connect(),
          RESEARCH_DB_BUDGET.boundedReadAcquireTimeoutMs,
          () => new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE", "Evidence database acquisition timed out.", 503),
          signal,
        )
        : await this.pool.connect();
      await client.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
      began = true;
      try {
        await client.query(`SET LOCAL ROLE ${RESEARCH_DB_RUNTIME_ROLE}`);
      } catch {
        throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE", "Evidence authority is not configured.", 503);
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
      if (error instanceof ResearchEvidenceError) throw error;
      const code = typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code) : "";
      if (code === "40001" || code === "40P01") {
        throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE", "Evidence changed concurrently; reload it.", 503);
      }
      const wrapped = new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE", "Evidence is temporarily unavailable.", 503);
      (wrapped as Error & { cause?: unknown }).cause = error;
      throw wrapped;
    } finally {
      client?.release();
    }
  }

}
