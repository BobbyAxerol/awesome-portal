/** Completion facts written with an immutable seal, never by a read handler. */
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { ResearchScope } from "./contracts";
import { ResearchCurrentSourceError } from "./current-source.error";

const UtcMs = z.number().int().nonnegative().max(8_640_000_000_000_000);
export const RetainedExecutionObservationSchema = z.object({
  schema_version: z.literal("research.execution-observation.v1"),
  basis: z.literal("PORTAL_ADAPTER_ENGINE_CALL_COMPLETED"),
  started_at_utc_ms: UtcMs,
  completed_at_utc_ms: UtcMs,
  range_start_utc_ms: UtcMs,
  range_end_exclusive_utc_ms: UtcMs,
  evaluation_role: z.enum(["SELECTION_INPUT", "OUTER_OOS", "FULL_SAMPLE_CALIBRATION"]),
}).strict().refine(value => value.completed_at_utc_ms >= value.started_at_utc_ms
  && value.range_end_exclusive_utc_ms > value.range_start_utc_ms, "Invalid execution observation bounds");

export interface RetainedExposureFence { workerAttemptId: string; leaseEpoch: number; }

/** Lock the live producer/job/attempt so cancel/reassignment cannot race the seal. */
export async function retainedExposureAuthority(client: PoolClient, scope: ResearchScope,
  runId: string, fence: RetainedExposureFence): Promise<{ snapshotDigest: string }> {
  const result = await client.query<{ snapshot_content_hash: string }>(
    `SELECT producer.snapshot_content_hash
       FROM research.run_producers producer
       JOIN research.jobs job ON job.workspace_id=producer.workspace_id AND job.job_id=producer.job_id
       JOIN research.worker_attempts worker ON worker.workspace_id=job.workspace_id
         AND worker.job_id=job.job_id AND worker.worker_attempt_id=job.current_worker_attempt_id
      WHERE producer.workspace_id=$1 AND producer.run_id=$2
        AND producer.worker_attempt_id=$3 AND producer.lease_epoch=$4
        AND job.current_worker_attempt_id=$3 AND job.current_lease_epoch=$4
        AND job.state='RUNNING' AND worker.state='RUNNING'
        AND worker.lease_epoch=$4 AND worker.expires_at > clock_timestamp()
      FOR UPDATE OF producer, job, worker`,
    [scope.workspaceId, runId, fence.workerAttemptId, fence.leaseEpoch]);
  const snapshotDigest = result.rows[0]?.snapshot_content_hash;
  if (result.rowCount !== 1 || !/^[0-9a-f]{64}$/.test(snapshotDigest ?? "")) {
    throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_CONFLICT", "Retention requires the current live execution lease.", 409);
  }
  return { snapshotDigest: snapshotDigest! };
}

/** Called only after inserting the seal, in the SAME database transaction. */
export async function appendRetainedExposure(client: PoolClient, scope: ResearchScope, input: {
  runId: string; artifactRevision: number; manifestDigest: string; snapshotDigest: string; observation: unknown;
}): Promise<void> {
  const fact = RetainedExecutionObservationSchema.parse(input.observation);
  if (fact.completed_at_utc_ms > Date.now() + 60_000) {
    throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_INVALID", "Execution observation has an invalid source clock.", 400);
  }
  const identity = createHash("sha256").update(JSON.stringify([
    "research.retained-exposure.v1", scope.workspaceId, input.runId,
    input.artifactRevision, input.manifestDigest, input.snapshotDigest,
  ])).digest("hex");
  const sourceFactRef = `p05:${input.manifestDigest}:PORTAL_ADAPTER_ENGINE_CALL_COMPLETED`;
  const result = await client.query(
    `INSERT INTO research.exposure_facts
       (workspace_id, exposure_id, run_id, actor_user_id, snapshot_digest,
        range_start_utc, range_end_utc, evaluation_role, source_fact_ref, source_as_of)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [scope.workspaceId, `rexp_${identity}`, input.runId, scope.actorUserId, input.snapshotDigest,
      new Date(fact.range_start_utc_ms), new Date(fact.range_end_exclusive_utc_ms), fact.evaluation_role,
      sourceFactRef, new Date(fact.completed_at_utc_ms)]);
  if (result.rowCount !== 1) throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_CONFLICT", "Exposure fact was not retained.", 409);
  await client.query(
    `INSERT INTO research.audit_log (workspace_id,audit_id,actor_user_id,action,subject_type,subject_id,metadata)
     VALUES ($1,$2,$3,'RESEARCH_EXPOSURE_FACT_RECORDED','exposure',$4,$5::jsonb)`,
    [scope.workspaceId, `raud_${identity}`, scope.actorUserId, `rexp_${identity}`, JSON.stringify({
      run_id: input.runId, snapshot_digest: input.snapshotDigest, manifest_digest: input.manifestDigest,
      clock_basis: fact.basis, evaluation_role: fact.evaluation_role,
    })]);
}
