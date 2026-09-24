/** P11 PostgreSQL materialisation of the source-owned progress journal. */

import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";

import { CONTROL_API_POOL } from "../tokens";
import { RESEARCH_DB_BUDGET, RESEARCH_DB_RUNTIME_ROLE, type ResearchScope } from "./contracts";
import {
  ResearchProgressEventSchema,
  ResearchProgressSnapshotSchema,
  type ResearchProgressEvent,
  type ResearchProgressIngress,
  type ResearchProgressSnapshot,
} from "./progress.contract";
import { ResearchProgressError } from "./progress.error";

const TERMINAL_JOB_STATES = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);

interface IngressRow {
  workspace_id: string;
  actor_user_id: string;
  job_id: string;
  worker_attempt_id: string;
  lease_epoch: string | number;
  dispatch_state: "PENDING" | "DISPATCHED";
  job_state: string;
  execution_profile_id: string;
}

interface ReadRunRow {
  run_id: string;
  attempt_id: string;
  job_id: string;
  worker_attempt_id: string | null;
  lease_epoch: string | number | null;
  job_state: string;
  queue_class: "INTERACTIVE" | "HEAVY" | "BACKGROUND";
  job_created_at: Date;
  retry_not_before: Date | null;
  created_at: Date;
  snapshot: Record<string, unknown> | string | null;
  source_latest_sequence: string | number | null;
  retention_floor_sequence: string | number | null;
  received_at: Date | null;
  terminal_materialized: boolean;
  source_terminal_event: boolean;
  alpha_id?: string | null;
  alpha_name?: string | null;
  alpha_version_id?: string | null;
  execution_profile_id?: string | null;
  requested_spec_digest?: string | null;
  spec_protocol?: string | null;
  spec_mode?: string | null;
  spec_schedule?: string | null;
  spec_symbol?: string | null;
  spec_timeframe?: string | null;
  spec_route?: string | null;
  spec_engine_release?: string | null;
  spec_config_digest?: string | null;
  declared_fold_count?: string | number | null;
  sealed_holdout?: Record<string, unknown> | string | null;
  requested_spec_retained?: boolean | null;
}

interface RequestedSpecRow {
  run_id: string;
  alpha_id: string;
  alpha_version_id: string;
  execution_profile_id: string;
  requested_spec_digest: string;
  created_at: Date;
  requested_spec: Record<string, unknown> | string | null;
}

interface ProgressEventRow {
  source_sequence: string | number;
  event_type: string;
  occurred_at_utc_ms: string | number;
  event_payload: Record<string, unknown> | string;
}

function asSafeNumber(value: string | number, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new ResearchProgressError("RESEARCH_PROGRESS_CONFLICT", `Research progress ${label} is invalid.`, 409);
  }
  return parsed;
}

function parseObject(value: Record<string, unknown> | string, label: string): Record<string, unknown> {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object expected");
    return parsed as Record<string, unknown>;
  } catch {
    throw new ResearchProgressError("RESEARCH_PROGRESS_CONFLICT", `Research progress ${label} is incompatible.`, 409);
  }
}

function canonical(value: unknown): string {
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

function sha256(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export interface ProgressIngressScope {
  workspaceId: string;
  actorUserId: string;
  jobId: string;
  workerAttemptId: string;
  leaseEpoch: number;
  /** W1 immutable run execution profile; absent is read as the P04 fixed qualification. */
  executionProfileId?: string;
}

/**
 * One retained P05 table for this run, as the artifact authority records it
 * (RF01-B3). This is the six-state `research.artifacts` lifecycle — the one
 * place `CORRUPT` and `MISSING` exist — and deliberately carries no storage
 * locator, worker attempt, lease epoch or manifest digest.
 */
export interface ProgressRetainedArtifact {
  tableKind: string;
  state: "PENDING" | "WRITING" | "SEALED" | "ABORTED" | "CORRUPT" | "MISSING";
  totalRows: string;
  totalBytes: string;
  sealedAt: Date | null;
}

/** The bound on retained rows a progress read may carry. */
export const PROGRESS_RETAINED_ARTIFACT_LIMIT = 128;

export interface ProgressWorkerAttempt {
  ordinal: number;
  state: "CLAIMED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "LOST_LEASE" | "CANCELLED";
  claimedAt: Date;
  startedAt: Date | null;
  /**
   * For LOST_LEASE this is when the scheduler *recorded* the loss (its sweep
   * of expired leases), which can be long after the lease actually lapsed.
   */
  endedAt: Date | null;
  /** The last lease expiry the attempt held (CG-P11-06). */
  leaseExpiresAt: Date | null;
}

/**
 * CG-P11-03: immutable run identity from the P10 producer row and its P08
 * manifest. Every field is a stored fact; nothing is derived from progress.
 */
export interface ProgressRunIdentity {
  alphaId: string;
  alphaName: string | null;
  alphaVersionId: string;
  executionProfileId: string;
  protocol: string | null;
  mode: string | null;
  schedule: string | null;
  symbol: string | null;
  timeframe: string | null;
  executionRoute: string | null;
  /** The P02 client's engine release id and config digest, as requested. */
  engineReleaseId: string | null;
  configDigest: string | null;
  requestedSpecDigest: string;
  createdAt: Date;
  /** Length of the P08 topology's fold list; null when the topology declares none. */
  declaredFoldCount: number | null;
  /** The P08-declared sealed holdout window, never its values. */
  sealedHoldout: { startUtcMs: number; endExclusiveUtcMs: number; bars: number | null } | null;
  requestedSpecRetained: boolean;
}

/** CG-P11-07: the immutable requested spec a clone starts from. */
export interface ProgressRequestedSpec {
  runId: string;
  requestedSpec: Record<string, unknown>;
  requestedSpecDigest: string;
  alphaId: string;
  alphaVersionId: string;
  executionProfileId: string;
  createdAt: Date;
}

export interface ProgressRunRead {
  runId: string;
  jobState: string;
  queueClass: "INTERACTIVE" | "HEAVY" | "BACKGROUND";
  queuedAt: Date;
  retryNotBefore: Date | null;
  attempts: ProgressWorkerAttempt[];
  progress: ResearchProgressSnapshot | null;
  sourceLatestSequence: number;
  retentionFloorSequence: number;
  receivedAt: Date | null;
  hasCurrentAttempt: boolean;
  terminalMaterialization: "NOT_REQUIRED" | "PENDING" | "READY";
  retainedArtifacts: ProgressRetainedArtifact[];
  /** Null only if the producer row's identity could not be read. */
  identity: ProgressRunIdentity | null;
}

/** Server-only P06 lease facts used solely by the P11 cancel marker hop. */
export interface ProgressCurrentLease {
  jobId: string;
  workerAttemptId: string | null;
  leaseEpoch: number | null;
  jobState: string;
}

/**
 * A narrow repository instead of reuse of a legacy console/status table.
 *
 * Internal ingress is authorised by an exact P10 producer + P06 lease tuple,
 * not by a browser user id. Browser reads still receive an already checked
 * workspace scope from their controller.  This keeps an account removal from
 * stranding a running worker while preventing a stale/reclaimed worker from
 * replacing current state.
 */
@Injectable()
export class ResearchProgressRepository {
  constructor(@Inject(CONTROL_API_POOL) private readonly pool: Pool) {}

  async resolveIngress(input: Pick<ResearchProgressIngress, "workspace_id" | "run_id" | "job_id" | "worker_attempt_id" | "lease_epoch">): Promise<ProgressIngressScope> {
    return this.withTransaction(input.workspace_id, "research-progress-worker", true, async (client) => {
      const result = await client.query<IngressRow>(
        `SELECT producer.workspace_id, producer.actor_user_id, producer.job_id,
                producer.worker_attempt_id, producer.lease_epoch, producer.dispatch_state,
                job.state AS job_state, producer.execution_profile_id
           FROM research.run_producers producer
           JOIN research.jobs job
             ON job.workspace_id = producer.workspace_id AND job.job_id = producer.job_id
          WHERE producer.workspace_id = $1
            AND producer.run_id = $2
            AND producer.job_id = $3
            AND producer.worker_attempt_id = $4
            AND producer.lease_epoch = $5
            AND job.current_worker_attempt_id = producer.worker_attempt_id
            AND job.current_lease_epoch = producer.lease_epoch`,
        [input.workspace_id, input.run_id, input.job_id, input.worker_attempt_id, input.lease_epoch],
      );
      const row = result.rows[0];
      if (!row || row.dispatch_state !== "DISPATCHED") {
        throw new ResearchProgressError("RESEARCH_PROGRESS_STALE_LEASE", "Research progress source lease is no longer current.", 409);
      }
      return {
        workspaceId: row.workspace_id,
        actorUserId: row.actor_user_id,
        jobId: row.job_id,
        workerAttemptId: row.worker_attempt_id,
        leaseEpoch: asSafeNumber(row.lease_epoch, "lease epoch"),
        executionProfileId: row.execution_profile_id,
      };
    });
  }

  async persistIngress(
    scope: ProgressIngressScope,
    input: ResearchProgressIngress,
  ): Promise<{ inserted: boolean; event: ResearchProgressEvent; snapshot: ResearchProgressSnapshot | null }> {
    return this.withTransaction(scope.workspaceId, scope.actorUserId, false, async (client) => {
      const jobState = await this.assertCurrentIngress(client, scope, input);
      // Serialise a single source attempt so two retrying callbacks cannot
      // turn an out-of-order delivery into a silently incomplete snapshot.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${scope.workspaceId}:${input.run_id}:${scope.workerAttemptId}:research-progress-v1`,
      ]);
      const eventDigest = sha256(input.event);
      const previous = await client.query<{ latest: string | number | null }>(
        `SELECT max(source_sequence) AS latest
           FROM research.run_progress_events
          WHERE workspace_id = $1 AND run_id = $2 AND worker_attempt_id = $3`,
        [scope.workspaceId, input.run_id, scope.workerAttemptId],
      );
      const prior = previous.rows[0]?.latest;
      const priorSequence = prior === null || prior === undefined ? 0 : asSafeNumber(prior, "previous sequence");
      const expected = Math.max(priorSequence + 1, input.snapshot.retention_floor_sequence + 1);
      if (input.event.sequence > expected) {
        throw new ResearchProgressError(
          "RESEARCH_PROGRESS_CONFLICT",
          "Research progress source sequence has a non-authoritative gap.",
          409,
        );
      }
      // Check an exact duplicate under the same advisory lock before making
      // any terminal-state decision.  At-least-once redelivery after an HTTP
      // acknowledgement loss remains valid even after P06 has closed the
      // job; a new event after terminal state never gets that exception.
      const existing = await client.query<{ event_digest: string }>(
        `SELECT event_digest FROM research.run_progress_events
          WHERE workspace_id = $1 AND run_id = $2 AND worker_attempt_id = $3
            AND source_sequence = $4`,
        [scope.workspaceId, input.run_id, scope.workerAttemptId, input.event.sequence],
      );
      const insertedNow = existing.rowCount === 0;
      if (!insertedNow) {
        if (existing.rows[0]?.event_digest !== eventDigest) {
          throw new ResearchProgressError("RESEARCH_PROGRESS_CONFLICT", "Research progress sequence conflicts with its immutable event.", 409);
        }
        // A sequence below the expected next position is a valid at-least-once
        // duplicate only when the immutable event above proves it.  There is
        // no late/out-of-order insertion path.
      } else {
        // A missing old sequence must fail before insert so an invalid source
        // callback cannot leave an immutable orphan in the journal merely
        // because a later lifecycle transition rejects it.
        if (input.event.sequence < expected) {
          throw new ResearchProgressError(
            "RESEARCH_PROGRESS_CONFLICT",
            "Research progress source sequence arrived outside its authoritative retention window.",
            409,
          );
        }
        this.assertNewEventFitsJobState(jobState, input);
        await client.query(
          `INSERT INTO research.run_progress_events
             (workspace_id, run_id, worker_attempt_id, source_sequence, lease_epoch,
              event_type, occurred_at_utc_ms, event_payload, event_digest)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
          [
            scope.workspaceId, input.run_id, scope.workerAttemptId, input.event.sequence,
            scope.leaseEpoch, input.event.event_type, input.event.occurred_at_utc_ms,
            JSON.stringify(input.event.payload), eventDigest,
          ],
        );
      }
      const mayAdvanceSnapshot = input.event.sequence === input.snapshot.latest_sequence;
      if (!mayAdvanceSnapshot) {
        return { inserted: insertedNow, event: input.event, snapshot: null };
      }
      const snapshotDigest = sha256(input.snapshot);
      const snapshotWrite = await client.query<{ source_latest_sequence: string | number }>(
        `INSERT INTO research.run_progress_snapshots
           (workspace_id, run_id, worker_attempt_id, lease_epoch, source_latest_sequence,
            retention_floor_sequence, snapshot, snapshot_digest)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
         ON CONFLICT (workspace_id, run_id, worker_attempt_id)
         DO UPDATE SET source_latest_sequence = EXCLUDED.source_latest_sequence,
                       retention_floor_sequence = EXCLUDED.retention_floor_sequence,
                       snapshot = EXCLUDED.snapshot,
                       snapshot_digest = EXCLUDED.snapshot_digest,
                       received_at = now()
           WHERE research.run_progress_snapshots.source_latest_sequence < EXCLUDED.source_latest_sequence`,
        [
          scope.workspaceId, input.run_id, scope.workerAttemptId, scope.leaseEpoch,
          input.snapshot.latest_sequence, input.snapshot.retention_floor_sequence,
          JSON.stringify(input.snapshot), snapshotDigest,
        ],
      );
      if (snapshotWrite.rowCount === 0) {
        const current = await client.query<{
          source_latest_sequence: string | number;
          snapshot_digest: string;
        }>(
          `SELECT source_latest_sequence, snapshot_digest
             FROM research.run_progress_snapshots
            WHERE workspace_id = $1 AND run_id = $2 AND worker_attempt_id = $3`,
          [scope.workspaceId, input.run_id, scope.workerAttemptId],
        );
        const row = current.rows[0];
        if (row && asSafeNumber(row.source_latest_sequence, "existing snapshot sequence") === input.snapshot.latest_sequence
          && row.snapshot_digest !== snapshotDigest) {
          throw new ResearchProgressError(
            "RESEARCH_PROGRESS_CONFLICT",
            "Research progress snapshot conflicts with its immutable source sequence.",
            409,
          );
        }
      }
      return { inserted: insertedNow, event: input.event, snapshot: input.snapshot };
    });
  }

  /**
   * Commit only after terminal evidence/split/lifecycle have all succeeded.
   * It is immutable and idempotent, so an acknowledgement-loss retry never
   * re-computes QuantBT yet can republish the already durable terminal fact.
   */
  async markTerminalMaterialized(scope: ProgressIngressScope, input: ResearchProgressIngress): Promise<void> {
    if (input.event.event_type !== "run_completed" && input.event.event_type !== "run_failed") return;
    const digest = sha256(input.event);
    await this.withTransaction(scope.workspaceId, scope.actorUserId, false, async (client) => {
      const inserted = await client.query(
        `INSERT INTO research.run_terminal_materializations_v1
           (workspace_id, run_id, worker_attempt_id, source_sequence, event_digest, materialization_revision)
         VALUES ($1, $2, $3, $4, $5, 'research.terminal-materialization.v1')
         ON CONFLICT (workspace_id, run_id, worker_attempt_id, source_sequence) DO NOTHING`,
        [scope.workspaceId, input.run_id, scope.workerAttemptId, input.event.sequence, digest],
      );
      if (inserted.rowCount !== 0) return;
      const existing = await client.query<{ event_digest: string }>(
        `SELECT event_digest FROM research.run_terminal_materializations_v1
          WHERE workspace_id = $1 AND run_id = $2 AND worker_attempt_id = $3 AND source_sequence = $4`,
        [scope.workspaceId, input.run_id, scope.workerAttemptId, input.event.sequence],
      );
      if (existing.rowCount !== 1 || existing.rows[0]!.event_digest !== digest) {
        throw new ResearchProgressError("RESEARCH_PROGRESS_CONFLICT", "Research terminal materialization conflicts with its immutable event.", 409);
      }
    });
  }

  async readRun(scope: ResearchScope, runId: string): Promise<ProgressRunRead> {
    return this.withTransaction(scope.workspaceId, scope.actorUserId, true, async (client) => {
      const result = await client.query<ReadRunRow>(
        `SELECT producer.run_id, producer.attempt_id, producer.job_id,
                producer.worker_attempt_id, producer.lease_epoch, job.state AS job_state,
                job.queue_class, job.created_at AS job_created_at, job.retry_not_before,
                producer.created_at, snapshot.snapshot, snapshot.source_latest_sequence,
                snapshot.retention_floor_sequence, snapshot.received_at,
                (terminal.source_sequence IS NOT NULL) AS terminal_materialized,
                COALESCE(latest_event.event_type IN ('run_completed', 'run_failed'), false) AS source_terminal_event,
                producer.alpha_id, alpha.name AS alpha_name, producer.alpha_version_id,
                producer.execution_profile_id, producer.requested_spec_digest,
                preflight.requested_spec->>'protocol' AS spec_protocol,
                preflight.requested_spec->>'optimization_mode' AS spec_mode,
                preflight.requested_spec->>'optimization_schedule' AS spec_schedule,
                preflight.requested_spec->'data'->>'symbol' AS spec_symbol,
                preflight.requested_spec->'data'->>'timeframe' AS spec_timeframe,
                preflight.requested_spec->>'execution_route' AS spec_route,
                preflight.requested_spec->'client'->>'engine_release_id' AS spec_engine_release,
                preflight.requested_spec->'client'->>'config_digest' AS spec_config_digest,
                CASE WHEN jsonb_typeof(preflight.topology->'folds') = 'array'
                     THEN jsonb_array_length(preflight.topology->'folds') END AS declared_fold_count,
                CASE WHEN jsonb_typeof(preflight.topology->'sealed_holdout') = 'object'
                     THEN preflight.topology->'sealed_holdout' END AS sealed_holdout,
                (preflight.requested_spec IS NOT NULL) AS requested_spec_retained
           FROM research.run_producers producer
           JOIN research.jobs job
             ON job.workspace_id = producer.workspace_id AND job.job_id = producer.job_id
          LEFT JOIN research.alphas alpha
             ON alpha.workspace_id = producer.workspace_id AND alpha.alpha_id = producer.alpha_id
          LEFT JOIN research.preflight_manifests preflight
             ON preflight.workspace_id = producer.workspace_id
            AND preflight.preflight_token = producer.preflight_token
            AND preflight.actor_user_id = producer.actor_user_id
          LEFT JOIN research.run_progress_snapshots snapshot
             ON snapshot.workspace_id = producer.workspace_id
            AND snapshot.run_id = producer.run_id
            AND snapshot.worker_attempt_id = producer.worker_attempt_id
          LEFT JOIN research.run_terminal_materializations_v1 terminal
             ON terminal.workspace_id = snapshot.workspace_id
            AND terminal.run_id = snapshot.run_id
            AND terminal.worker_attempt_id = snapshot.worker_attempt_id
            AND terminal.source_sequence = snapshot.source_latest_sequence
          LEFT JOIN research.run_progress_events latest_event
            ON latest_event.workspace_id = snapshot.workspace_id
            AND latest_event.run_id = snapshot.run_id
            AND latest_event.worker_attempt_id = snapshot.worker_attempt_id
            AND latest_event.source_sequence = snapshot.source_latest_sequence
          WHERE producer.workspace_id = $1 AND producer.run_id = $2
          ORDER BY producer.created_at DESC
          LIMIT 1`,
        [scope.workspaceId, runId],
      );
      const row = result.rows[0];
      if (!row) {
        throw new ResearchProgressError("RESEARCH_PROGRESS_NOT_FOUND", "Research run was not found.", 404);
      }
      const workerAttempts = await client.query<{
        ordinal: number;
        state: ProgressWorkerAttempt["state"];
        claimed_at: Date;
        started_at: Date | null;
        ended_at: Date | null;
        lease_expires_at: Date | null;
      }>(
        `SELECT wa.ordinal, wa.state, wa.created_at AS claimed_at, wa.expires_at AS lease_expires_at,
                (SELECT min(e.occurred_at) FROM research.job_events e
                  WHERE e.workspace_id = wa.workspace_id AND e.worker_attempt_id = wa.worker_attempt_id
                    AND e.event_type = 'JOB_RUNNING') AS started_at,
                (SELECT min(e.occurred_at) FROM research.job_events e
                  WHERE e.workspace_id = wa.workspace_id AND e.worker_attempt_id = wa.worker_attempt_id
                    AND e.event_type IN ('JOB_SUCCEEDED', 'JOB_FAILED', 'JOB_CANCELLED', 'LEASE_EXPIRED', 'WORKER_RETRY')) AS ended_at
           FROM research.worker_attempts wa
          WHERE wa.workspace_id = $1 AND wa.job_id = $2
          ORDER BY wa.ordinal ASC LIMIT 9`,
        [scope.workspaceId, row.job_id],
      );
      if (workerAttempts.rows.length > 8) {
        throw new ResearchProgressError("RESEARCH_PROGRESS_CONFLICT", "Research attempt history exceeds its published bound.", 409);
      }
      /* The same transaction reads the authority's own rows, so the list is
         consistent with the snapshot beside it. Bounded, ordered, locator-free. */
      const retained = await client.query<{
        table_kind: string;
        state: ProgressRetainedArtifact["state"];
        total_rows: string | number;
        total_bytes: string | number;
        sealed_at: Date | null;
      }>(
        `SELECT table_kind, state, total_rows, total_bytes, sealed_at
           FROM research.artifacts
          WHERE workspace_id = $1 AND run_id = $2
          ORDER BY table_kind ASC, artifact_id ASC
          LIMIT $3`,
        [scope.workspaceId, runId, PROGRESS_RETAINED_ARTIFACT_LIMIT],
      );
      const retainedArtifacts: ProgressRetainedArtifact[] = retained.rows.map((artifact) => ({
        tableKind: artifact.table_kind,
        state: artifact.state,
        totalRows: String(artifact.total_rows),
        totalBytes: String(artifact.total_bytes),
        sealedAt: artifact.sealed_at,
      }));
      let progress: ResearchProgressSnapshot | null = null;
      if (row.snapshot !== null) {
        const parsed = ResearchProgressSnapshotSchema.safeParse(parseObject(row.snapshot, "snapshot"));
        if (!parsed.success) {
          throw new ResearchProgressError("RESEARCH_PROGRESS_CONFLICT", "Research progress snapshot is incompatible.", 409);
        }
        progress = parsed.data;
      }
      return {
        runId: row.run_id,
        jobState: row.job_state,
        queueClass: row.queue_class,
        queuedAt: row.job_created_at,
        retryNotBefore: row.retry_not_before,
        attempts: workerAttempts.rows.map((attempt) => ({
          ordinal: attempt.ordinal,
          state: attempt.state,
          claimedAt: attempt.claimed_at,
          startedAt: attempt.started_at,
          endedAt: attempt.ended_at,
          leaseExpiresAt: attempt.lease_expires_at ?? null,
        })),
        progress,
        sourceLatestSequence: row.source_latest_sequence === null ? 0 : asSafeNumber(row.source_latest_sequence, "latest sequence"),
        retentionFloorSequence: row.retention_floor_sequence === null ? 0 : asSafeNumber(row.retention_floor_sequence, "retention floor"),
        receivedAt: row.received_at,
        hasCurrentAttempt: row.worker_attempt_id !== null && row.lease_epoch !== null,
        // Sidecar materialisation is required only after a source-owned
        // terminal event. A Control-side cancel/failure before any terminal
        // source event has nothing to materialise and must not remain PENDING
        // forever. Conversely, a terminal source event stays PENDING even in
        // the small window before P06 applies its terminal job transition.
        terminalMaterialization: row.source_terminal_event
          ? (row.terminal_materialized ? "READY" : "PENDING")
          // A durable SUCCEEDED job without its required source terminal event
          // is inconsistent; keep it fail-closed instead of reporting success.
          : row.job_state === "SUCCEEDED" ? "PENDING" : "NOT_REQUIRED",
        retainedArtifacts,
        identity: this.identity(row),
      };
    });
  }

  /**
   * CG-P11-07: the exact requested spec a run was admitted with, so a new run
   * can start from it. Read-only and immutable (P08 manifests reject UPDATE);
   * it carries no preflight token, snapshot locator, lease or worker handle.
   */
  async requestedSpec(scope: ResearchScope, runId: string): Promise<ProgressRequestedSpec> {
    return this.withTransaction(scope.workspaceId, scope.actorUserId, true, async (client) => {
      const result = await client.query<RequestedSpecRow>(
        `SELECT producer.run_id, producer.alpha_id, producer.alpha_version_id,
                producer.execution_profile_id, producer.requested_spec_digest, producer.created_at,
                preflight.requested_spec
           FROM research.run_producers producer
          LEFT JOIN research.preflight_manifests preflight
             ON preflight.workspace_id = producer.workspace_id
            AND preflight.preflight_token = producer.preflight_token
            AND preflight.actor_user_id = producer.actor_user_id
          WHERE producer.workspace_id = $1 AND producer.run_id = $2
          ORDER BY producer.created_at DESC
          LIMIT 1`,
        [scope.workspaceId, runId],
      );
      const row = result.rows[0];
      if (!row) {
        throw new ResearchProgressError("RESEARCH_PROGRESS_NOT_FOUND", "Research run was not found.", 404);
      }
      if (row.requested_spec === null) {
        throw new ResearchProgressError(
          "RESEARCH_RUN_REQUESTED_SPEC_NOT_RETAINED",
          "This run's requested specification is not retained, so it cannot seed a new run.",
          409,
        );
      }
      return {
        runId: row.run_id,
        requestedSpec: parseObject(row.requested_spec, "requested spec"),
        requestedSpecDigest: row.requested_spec_digest,
        alphaId: row.alpha_id,
        alphaVersionId: row.alpha_version_id,
        executionProfileId: row.execution_profile_id,
        createdAt: row.created_at,
      };
    });
  }

  private identity(row: ReadRunRow): ProgressRunIdentity | null {
    if (typeof row.alpha_id !== "string" || typeof row.alpha_version_id !== "string"
      || typeof row.requested_spec_digest !== "string") {
      return null;
    }
    const text = (value: string | null | undefined): string | null =>
      typeof value === "string" && value.length > 0 && value.length <= 191 ? value : null;
    const declared = row.declared_fold_count === null || row.declared_fold_count === undefined
      ? null : asSafeNumber(row.declared_fold_count, "declared fold count");
    let sealedHoldout: ProgressRunIdentity["sealedHoldout"] = null;
    if (row.sealed_holdout !== null && row.sealed_holdout !== undefined) {
      const holdout = parseObject(row.sealed_holdout, "sealed holdout");
      const start = holdout.start_utc_ms;
      const end = holdout.end_exclusive_utc_ms;
      const bars = holdout.bars;
      if (typeof start === "number" && typeof end === "number" && Number.isSafeInteger(start)
        && Number.isSafeInteger(end) && start >= 0 && end > start) {
        sealedHoldout = {
          startUtcMs: start,
          endExclusiveUtcMs: end,
          bars: typeof bars === "number" && Number.isSafeInteger(bars) && bars >= 0 ? bars : null,
        };
      }
    }
    return {
      alphaId: row.alpha_id,
      alphaName: text(row.alpha_name),
      alphaVersionId: row.alpha_version_id,
      // Rows written before migration 062 have no profile column value; they
      // are all the P04 fixed qualification by construction.
      executionProfileId: text(row.execution_profile_id) ?? "p04.fixed-qualification.v1",
      protocol: text(row.spec_protocol),
      mode: text(row.spec_mode),
      schedule: text(row.spec_schedule),
      symbol: text(row.spec_symbol),
      timeframe: text(row.spec_timeframe),
      executionRoute: text(row.spec_route),
      engineReleaseId: text(row.spec_engine_release),
      configDigest: typeof row.spec_config_digest === "string" && /^[0-9a-f]{64}$/.test(row.spec_config_digest)
        ? row.spec_config_digest : null,
      requestedSpecDigest: row.requested_spec_digest,
      createdAt: row.created_at,
      declaredFoldCount: declared !== null && declared > 0 ? declared : null,
      sealedHoldout,
      requestedSpecRetained: row.requested_spec_retained === true,
    };
  }

  /**
   * Resolve the currently fenced source attempt for a user-initiated cancel.
   * It deliberately returns no source path, token, payload or worker handle;
   * the caller passes only this exact identity to the private Portal marker.
   */
  async currentLease(scope: ResearchScope, runId: string): Promise<ProgressCurrentLease> {
    return this.withTransaction(scope.workspaceId, scope.actorUserId, true, async (client) => {
      const result = await client.query<{
        job_id: string;
        worker_attempt_id: string | null;
        lease_epoch: string | number | null;
        job_state: string;
      }>(
        `SELECT producer.job_id, producer.worker_attempt_id, producer.lease_epoch,
                job.state AS job_state
           FROM research.run_producers producer
           JOIN research.jobs job
             ON job.workspace_id = producer.workspace_id AND job.job_id = producer.job_id
          WHERE producer.workspace_id = $1 AND producer.run_id = $2
          ORDER BY producer.created_at DESC
          LIMIT 1`,
        [scope.workspaceId, runId],
      );
      const row = result.rows[0];
      if (!row) {
        throw new ResearchProgressError("RESEARCH_PROGRESS_NOT_FOUND", "Research run was not found.", 404);
      }
      return {
        jobId: row.job_id,
        workerAttemptId: row.worker_attempt_id,
        leaseEpoch: row.lease_epoch === null ? null : asSafeNumber(row.lease_epoch, "lease epoch"),
        jobState: row.job_state,
      };
    });
  }

  async events(
    scope: ResearchScope,
    runId: string,
    afterSequence: number,
    limit: number,
  ): Promise<{ events: ResearchProgressEvent[]; sourceLatestSequence: number; retentionFloorSequence: number }> {
    const current = await this.readRun(scope, runId);
    if (!current.progress) {
      return { events: [], sourceLatestSequence: 0, retentionFloorSequence: 0 };
    }
    const progress = current.progress;
    if (afterSequence < current.retentionFloorSequence) {
      throw new ResearchProgressError("RESEARCH_PROGRESS_CONFLICT", "Requested Research progress cursor has expired; reload the snapshot.", 409);
    }
    return this.withTransaction(scope.workspaceId, scope.actorUserId, true, async (client) => {
      const result = await client.query<ProgressEventRow>(
        `SELECT source_sequence, event_type, occurred_at_utc_ms, event_payload
           FROM research.run_progress_events
          WHERE workspace_id = $1 AND run_id = $2
            AND worker_attempt_id = $3 AND source_sequence > $4
          ORDER BY source_sequence ASC
          LIMIT $5`,
        [scope.workspaceId, runId, progress.attempt_id, afterSequence, limit],
      );
      const events = result.rows.map((row) => {
        const event = {
          schema_version: "research.progress-event.v1" as const,
          run_id: runId,
          attempt_id: progress.attempt_id,
          lease_epoch: progress.lease_epoch,
          sequence: asSafeNumber(row.source_sequence, "event sequence"),
          event_type: row.event_type,
          occurred_at_utc_ms: asSafeNumber(row.occurred_at_utc_ms, "event timestamp"),
          payload: parseObject(row.event_payload, "event payload"),
        };
        const parsed = ResearchProgressEventSchema.safeParse(event);
        if (!parsed.success) {
          throw new ResearchProgressError("RESEARCH_PROGRESS_CONFLICT", "Research progress event is incompatible.", 409);
        }
        return parsed.data;
      });
      return {
        events,
        sourceLatestSequence: current.sourceLatestSequence,
        retentionFloorSequence: current.retentionFloorSequence,
      };
    });
  }

  private async assertCurrentIngress(
    client: PoolClient,
    scope: ProgressIngressScope,
    input: ResearchProgressIngress,
  ): Promise<string> {
    const result = await client.query<{ job_state: string }>(
      `SELECT job.state AS job_state
         FROM research.run_producers producer
         JOIN research.jobs job
           ON job.workspace_id = producer.workspace_id AND job.job_id = producer.job_id
        WHERE producer.workspace_id = $1 AND producer.run_id = $2 AND producer.job_id = $3
          AND producer.worker_attempt_id = $4 AND producer.lease_epoch = $5
          AND producer.dispatch_state = 'DISPATCHED'
          AND job.current_worker_attempt_id = producer.worker_attempt_id
          AND job.current_lease_epoch = producer.lease_epoch`,
      [scope.workspaceId, input.run_id, scope.jobId, scope.workerAttemptId, scope.leaseEpoch],
    );
    const row = result.rows[0];
    if (!row) {
      throw new ResearchProgressError("RESEARCH_PROGRESS_STALE_LEASE", "Research progress source lease is no longer current.", 409);
    }
    return row.job_state;
  }

  /**
   * P11 stores the immutable event before applying its P06 lifecycle fact.
   * Therefore a source event that is not an exact duplicate must be ruled out
   * while its transaction is still open if a terminal job already exists.
   * The one permitted mismatch is a cancellation race: Control's durable CAS
   * can close `CANCELLED` before the worker has relayed its already-sealed
   * `run_completed` fact. That fact remains useful evidence but never turns
   * the Portal's terminal resolution into success.
   */
  private assertNewEventFitsJobState(jobState: string, input: ResearchProgressIngress): void {
    if (!TERMINAL_JOB_STATES.has(jobState)) return;
    const cancellationRace = jobState === "CANCELLED"
      && (input.event.event_type === "run_completed"
        || (input.event.event_type === "run_failed" && input.event.payload.code === "USER_CANCELLED"));
    if (cancellationRace) return;
    throw new ResearchProgressError(
      "RESEARCH_PROGRESS_CONFLICT",
      "Research progress cannot append a new event after the durable job reached a terminal state.",
      409,
    );
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
        throw new ResearchProgressError("RESEARCH_PROGRESS_UNAVAILABLE", "Research progress authority is not configured.", 503);
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
      if (error instanceof ResearchProgressError) throw error;
      const code = typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code) : "";
      if (code === "40001" || code === "40P01") {
        throw new ResearchProgressError("RESEARCH_PROGRESS_CONFLICT", "Research progress changed concurrently; reload the snapshot.", 409);
      }
      throw new ResearchProgressError("RESEARCH_PROGRESS_UNAVAILABLE", "Research progress is temporarily unavailable.", 503);
    } finally {
      client?.release();
    }
  }
}
