import { Inject, Injectable } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";

import { newUlid } from "../id";
import { CONTROL_API_POOL } from "../tokens";
import {
  RESEARCH_DB_BUDGET,
  RESEARCH_DB_RUNTIME_ROLE,
  type ResearchAlphaVersionInput,
  type ResearchAttemptInput,
  type ResearchAttemptRecord,
  type ResearchRunKind,
  type ResearchRunRelationship,
  type ResearchScope,
  type ResearchTrialInput,
  ResearchMetadataError,
} from "./contracts";

type ScopedClient = PoolClient;

interface AttemptRow {
  workspace_id: string;
  attempt_id: string;
  client_intent_id: string;
  draft_revision: string | number;
  state: string;
  alpha_version_id: string | null;
}

interface ExistingAttemptRow extends AttemptRow {
  request_payload_digest: string;
}

interface ExistingAlphaVersionRow {
  alpha_id: string;
  code_digest: string;
  entrypoint: string;
  dependency_ref: string;
  matches_declared_contract: boolean;
}

interface RunRow {
  run_id: string;
  attempt_id: string;
}

function asNumber(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error("Research database returned an unsafe integer revision.");
  }
  return parsed;
}

function isDigest(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

function requireText(value: string, label: string, max = 512): void {
  if (value.trim().length === 0 || value.length > max) {
    throw new ResearchMetadataError(
      "RESEARCH_INVALID_INPUT",
      `${label} must be a non-empty bounded string.`,
      400,
    );
  }
}

function requireDigest(value: string, label: string): void {
  if (!isDigest(value)) {
    throw new ResearchMetadataError(
      "RESEARCH_INVALID_INPUT",
      `${label} must be a lowercase SHA-256 digest.`,
      400,
    );
  }
}

function requireBoundedObject(value: Record<string, unknown>, label: string, maximumBytes: number): void {
  const encoded = JSON.stringify(value);
  if (encoded === undefined || Buffer.byteLength(encoded, "utf8") > maximumBytes) {
    throw new ResearchMetadataError(
      "RESEARCH_INVALID_INPUT",
      `${label} exceeds its bounded metadata contract.`,
      400,
    );
  }
}

function rowToAttempt(row: AttemptRow, runId: string): ResearchAttemptRecord {
  return {
    workspaceId: row.workspace_id,
    attemptId: row.attempt_id,
    clientIntentId: row.client_intent_id,
    draftRevision: asNumber(row.draft_revision),
    state: row.state,
    alphaVersionId: row.alpha_version_id,
    runId,
  };
}

/**
 * P03 durable metadata boundary.
 *
 * Every public method receives an existing Portal actor + workspace context.
 * It starts a transaction, drops to the bounded Research DB role and verifies
 * membership before touching any Research row.  There is no client-selected
 * fallback workspace and no separate Research login/session. Read checks use
 * ordinary SELECTs rather than row locks: unique/FK/immutable constraints are
 * the race authority, so the narrow role never needs broad UPDATE privilege
 * merely to acquire a lock.
 */
@Injectable()
export class ResearchMetadataRepository {
  private activeMetadataOperations = 0;
  private readonly metadataAdmissionWaiters: Array<() => void> = [];

  constructor(@Inject(CONTROL_API_POOL) private readonly pool: Pool) {}

  async registerAlphaVersion(
    scope: ResearchScope,
    input: ResearchAlphaVersionInput,
  ): Promise<{ alphaId: string; alphaVersionId: string; replayed: boolean }> {
    this.assertScope(scope);
    requireText(input.alphaId, "alphaId", 256);
    requireText(input.name, "name", 240);
    requireText(input.executionSubjectId, "executionSubjectId", 240);
    requireText(input.alphaVersionId, "alphaVersionId", 256);
    requireDigest(input.codeDigest, "codeDigest");
    requireText(input.entrypoint, "entrypoint");
    requireText(input.dependencyRef, "dependencyRef");
    requireBoundedObject(input.declaredContract, "declaredContract", RESEARCH_DB_BUDGET.maxConfigJsonBytes);

    return this.withScopedWrite(scope, async (client) => {
      await client.query(
        `INSERT INTO research.alphas
           (workspace_id, alpha_id, name, owner_user_id, execution_subject_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (workspace_id, alpha_id) DO NOTHING`,
        [scope.workspaceId, input.alphaId, input.name, scope.actorUserId, input.executionSubjectId],
      );
      const alpha = await client.query<{
        name: string;
        owner_user_id: string;
        execution_subject_id: string;
      }>(
        `SELECT name, owner_user_id, execution_subject_id
           FROM research.alphas
          WHERE workspace_id = $1 AND alpha_id = $2`,
        [scope.workspaceId, input.alphaId],
      );
      const alphaRow = alpha.rows[0];
      if (!alphaRow ||
          alphaRow.name !== input.name ||
          alphaRow.owner_user_id !== scope.actorUserId ||
          alphaRow.execution_subject_id !== input.executionSubjectId) {
        throw new ResearchMetadataError(
          "RESEARCH_IMMUTABLE_ALPHA_VERSION_CONFLICT",
          "That alpha identity is already bound to different immutable metadata.",
          409,
        );
      }

      const inserted = await client.query(
        `INSERT INTO research.alpha_versions
           (workspace_id, alpha_version_id, alpha_id, code_digest, entrypoint,
            dependency_ref, declared_contract, lifecycle_state, registered_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
         ON CONFLICT (workspace_id, alpha_version_id) DO NOTHING
         RETURNING alpha_version_id`,
        [
          scope.workspaceId,
          input.alphaVersionId,
          input.alphaId,
          input.codeDigest,
          input.entrypoint,
          input.dependencyRef,
          JSON.stringify(input.declaredContract),
          input.lifecycleState ?? "DRAFT",
          scope.actorUserId,
        ],
      );
      if (inserted.rowCount === 0) {
        const existing = await client.query<ExistingAlphaVersionRow>(
          `SELECT alpha_id, code_digest, entrypoint, dependency_ref,
                  declared_contract = $3::jsonb AS matches_declared_contract
             FROM research.alpha_versions
            WHERE workspace_id = $1 AND alpha_version_id = $2`,
          [scope.workspaceId, input.alphaVersionId, JSON.stringify(input.declaredContract)],
        );
        const row = existing.rows[0];
        if (!row ||
            row.alpha_id !== input.alphaId ||
            row.code_digest !== input.codeDigest ||
            row.entrypoint !== input.entrypoint ||
            row.dependency_ref !== input.dependencyRef ||
            !row.matches_declared_contract) {
          throw new ResearchMetadataError(
            "RESEARCH_IMMUTABLE_ALPHA_VERSION_CONFLICT",
            "An alpha version ID cannot be rebound to different bytes or contract metadata.",
            409,
          );
        }
        return { alphaId: input.alphaId, alphaVersionId: input.alphaVersionId, replayed: true };
      }
      await this.audit(client, scope, "ALPHA_VERSION_REGISTERED", "alpha_version", input.alphaVersionId, {
        alpha_id: input.alphaId,
        code_digest: input.codeDigest,
      });
      return { alphaId: input.alphaId, alphaVersionId: input.alphaVersionId, replayed: false };
    });
  }

  /**
   * Creates exactly one durable ResearchAttempt + one logical primary Run per
   * client intent.  A retry with the identical digest returns the original
   * identity; a changed payload under the same key is a typed conflict.
   */
  async createOrReplayAttempt(
    scope: ResearchScope,
    input: ResearchAttemptInput,
  ): Promise<{ attempt: ResearchAttemptRecord; replayed: boolean }> {
    this.assertScope(scope);
    this.assertAttemptInput(input);
    return this.withScopedWrite(scope, async (client) => {
      const inserted = await client.query<AttemptRow>(
        `INSERT INTO research.attempts
           (workspace_id, attempt_id, alpha_version_id, parent_attempt_id,
            client_intent_id, request_payload_digest, intent_kind, reason,
            space_signature, state, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'DRAFT', $10)
         ON CONFLICT (workspace_id, client_intent_id) DO NOTHING
         RETURNING workspace_id, attempt_id, client_intent_id, draft_revision, state, alpha_version_id`,
        [
          scope.workspaceId,
          input.attemptId,
          input.alphaVersionId ?? null,
          input.parentAttemptId ?? null,
          input.clientIntentId,
          input.requestPayloadDigest,
          input.intentKind,
          input.reason ?? null,
          input.spaceSignature ?? null,
          scope.actorUserId,
        ],
      );
      if (inserted.rowCount === 1) {
        await client.query(
          `INSERT INTO research.runs
             (workspace_id, run_id, attempt_id, run_kind, relationship_kind,
              logical_run_key, request_spec_digest, effective_spec_digest,
              engine_release_id, dataset_binding_digest, state, submitted_by_user_id)
           VALUES ($1, $2, $3, 'PRIMARY', 'PRIMARY', 'primary', $4, $5, $6, $7, 'DRAFT', $8)`,
          [
            scope.workspaceId,
            input.runId,
            input.attemptId,
            input.requestSpecDigest,
            input.effectiveSpecDigest,
            input.engineReleaseId,
            input.datasetBindingDigest,
            scope.actorUserId,
          ],
        );
        await this.audit(client, scope, "RESEARCH_ATTEMPT_CREATED", "attempt", input.attemptId, {
          client_intent_id: input.clientIntentId,
          run_id: input.runId,
          alpha_version_id: input.alphaVersionId ?? null,
        });
        return { attempt: rowToAttempt(inserted.rows[0], input.runId), replayed: false };
      }

      const existing = await client.query<ExistingAttemptRow>(
        `SELECT workspace_id, attempt_id, client_intent_id, draft_revision, state,
                alpha_version_id, request_payload_digest
           FROM research.attempts
          WHERE workspace_id = $1 AND client_intent_id = $2`,
        [scope.workspaceId, input.clientIntentId],
      );
      const attempt = existing.rows[0];
      if (!attempt) {
        throw new ResearchMetadataError(
          "RESEARCH_CONCURRENT_TRANSACTION",
          "The durable intent could not be re-read after a concurrent transaction.",
          503,
        );
      }
      if (attempt.request_payload_digest !== input.requestPayloadDigest ||
          attempt.alpha_version_id !== (input.alphaVersionId ?? null)) {
        throw new ResearchMetadataError(
          "RESEARCH_IDEMPOTENCY_PAYLOAD_CONFLICT",
          "That client intent is already bound to a different durable request.",
          409,
        );
      }
      const run = await client.query<RunRow>(
        `SELECT run_id, attempt_id
           FROM research.runs
          WHERE workspace_id = $1 AND attempt_id = $2 AND logical_run_key = 'primary'`,
        [scope.workspaceId, attempt.attempt_id],
      );
      if (!run.rows[0]) {
        throw new ResearchMetadataError(
          "RESEARCH_CONCURRENT_TRANSACTION",
          "The durable attempt exists without its required logical primary run.",
          503,
        );
      }
      return { attempt: rowToAttempt(attempt, run.rows[0].run_id), replayed: true };
    });
  }

  async autosaveDraft(
    scope: ResearchScope,
    input: { attemptId: string; expectedRevision: number; draftPatchDigest: string },
  ): Promise<ResearchAttemptRecord> {
    this.assertScope(scope);
    requireText(input.attemptId, "attemptId", 256);
    requireDigest(input.draftPatchDigest, "draftPatchDigest");
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) {
      throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "expectedRevision must be a positive integer.", 400);
    }
    return this.withScopedWrite(scope, async (client) => {
      const updated = await client.query<AttemptRow>(
        `UPDATE research.attempts
            SET draft_revision = draft_revision + 1, updated_at = now()
          WHERE workspace_id = $1
            AND attempt_id = $2
            AND state = 'DRAFT'
            AND draft_revision = $3
          RETURNING workspace_id, attempt_id, client_intent_id, draft_revision, state, alpha_version_id`,
        [scope.workspaceId, input.attemptId, input.expectedRevision],
      );
      const run = await client.query<RunRow>(
        `SELECT run_id, attempt_id FROM research.runs
          WHERE workspace_id = $1 AND attempt_id = $2 AND logical_run_key = 'primary'`,
        [scope.workspaceId, input.attemptId],
      );
      if (updated.rowCount === 1 && run.rows[0]) {
        await this.audit(client, scope, "RESEARCH_DRAFT_AUTOSAVED", "attempt", input.attemptId, {
          draft_patch_digest: input.draftPatchDigest,
          resulting_revision: asNumber(updated.rows[0].draft_revision),
        });
        return rowToAttempt(updated.rows[0], run.rows[0].run_id);
      }
      const existing = await client.query<AttemptRow>(
        `SELECT workspace_id, attempt_id, client_intent_id, draft_revision, state, alpha_version_id
           FROM research.attempts
          WHERE workspace_id = $1 AND attempt_id = $2`,
        [scope.workspaceId, input.attemptId],
      );
      const row = existing.rows[0];
      if (!row) {
        throw new ResearchMetadataError("RESEARCH_ATTEMPT_NOT_FOUND", "The Research attempt was not found.", 404);
      }
      if (row.state !== "DRAFT") {
        throw new ResearchMetadataError("RESEARCH_DRAFT_NOT_MUTABLE", "That attempt is no longer a draft.", 409);
      }
      throw new ResearchMetadataError(
        "RESEARCH_DRAFT_REVISION_CONFLICT",
        "The draft changed in another request. Refresh before saving again.",
        409,
      );
    });
  }

  async createJob(scope: ResearchScope, input: {
    jobId: string;
    runId: string;
    commandId: string;
    jobKind: "PRIMARY" | "AUDIT" | "DIAGNOSTIC" | "EXPORT" | "VERIFY" | "PROJECTION";
    queueClass: "INTERACTIVE" | "HEAVY" | "BACKGROUND";
    resourceClass: string;
    costEstimate: Record<string, unknown>;
  }): Promise<void> {
    this.assertScope(scope);
    requireText(input.jobId, "jobId", 256);
    requireText(input.runId, "runId", 256);
    requireText(input.commandId, "commandId", 256);
    requireText(input.resourceClass, "resourceClass", 128);
    requireBoundedObject(input.costEstimate, "costEstimate", RESEARCH_DB_BUDGET.maxSmallMetadataJsonBytes);
    await this.withScopedWrite(scope, async (client) => {
      const inserted = await client.query(
        `INSERT INTO research.jobs
           (workspace_id, job_id, run_id, command_id, job_kind, queue_class,
            cost_estimate, resource_class, state, requested_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, 'QUEUED', $9)
         ON CONFLICT (workspace_id, command_id) DO NOTHING
         RETURNING job_id`,
        [
          scope.workspaceId, input.jobId, input.runId, input.commandId, input.jobKind,
          input.queueClass, JSON.stringify(input.costEstimate), input.resourceClass, scope.actorUserId,
        ],
      );
      if (inserted.rowCount === 0) {
        const prior = await client.query<{ job_id: string; run_id: string; job_kind: string }>(
          `SELECT job_id, run_id, job_kind FROM research.jobs
            WHERE workspace_id = $1 AND command_id = $2`,
          [scope.workspaceId, input.commandId],
        );
        if (!prior.rows[0] || prior.rows[0].run_id !== input.runId || prior.rows[0].job_kind !== input.jobKind) {
          throw new ResearchMetadataError(
            "RESEARCH_IDEMPOTENCY_PAYLOAD_CONFLICT",
            "That Research job command is already bound to a different request.",
            409,
          );
        }
        return;
      }
      await this.audit(client, scope, "RESEARCH_JOB_ENQUEUED", "job", input.jobId, {
        run_id: input.runId,
        command_id: input.commandId,
      });
    });
  }

  async recordWorkerAttempt(scope: ResearchScope, input: {
    workerAttemptId: string;
    jobId: string;
    ordinal: number;
    workerId: string;
    leaseEpoch: number;
  }): Promise<void> {
    this.assertScope(scope);
    requireText(input.workerAttemptId, "workerAttemptId", 256);
    requireText(input.jobId, "jobId", 256);
    requireText(input.workerId, "workerId", 256);
    if (!Number.isSafeInteger(input.ordinal) || input.ordinal < 1 ||
        !Number.isSafeInteger(input.leaseEpoch) || input.leaseEpoch < 1) {
      throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "Worker ordinal and lease epoch must be positive integers.", 400);
    }
    await this.withScopedWrite(scope, async (client) => {
      const inserted = await client.query(
        `INSERT INTO research.worker_attempts
           (workspace_id, worker_attempt_id, job_id, ordinal, worker_id,
            lease_epoch, expires_at, state)
         VALUES ($1, $2, $3, $4, $5, $6, now() + interval '30 seconds', 'CLAIMED')
         ON CONFLICT (workspace_id, job_id, ordinal) DO NOTHING
         RETURNING worker_attempt_id`,
        [scope.workspaceId, input.workerAttemptId, input.jobId, input.ordinal, input.workerId, input.leaseEpoch],
      );
      if (inserted.rowCount === 0) {
        const prior = await client.query<{ worker_attempt_id: string; worker_id: string; lease_epoch: string | number }>(
          `SELECT worker_attempt_id, worker_id, lease_epoch
             FROM research.worker_attempts
            WHERE workspace_id = $1 AND job_id = $2 AND ordinal = $3`,
          [scope.workspaceId, input.jobId, input.ordinal],
        );
        const row = prior.rows[0];
        if (!row || row.worker_attempt_id !== input.workerAttemptId || row.worker_id !== input.workerId ||
            asNumber(row.lease_epoch) !== input.leaseEpoch) {
          throw new ResearchMetadataError(
            "RESEARCH_IDEMPOTENCY_PAYLOAD_CONFLICT",
            "A worker retry ordinal is already bound to different lease metadata.",
            409,
          );
        }
        return;
      }
      await this.audit(client, scope, "RESEARCH_WORKER_ATTEMPT_RECORDED", "worker_attempt", input.workerAttemptId, {
        job_id: input.jobId,
        ordinal: input.ordinal,
        lease_epoch: input.leaseEpoch,
      });
    });
  }

  async createStudy(scope: ResearchScope, input: {
    studyId: string;
    runId: string;
    engineStudyKey: string;
    purpose: "SEARCH" | "SELECTION" | "AUDIT" | "DIAGNOSTIC";
    sourceStage: string;
    sourceSchedule: string;
  }): Promise<void> {
    this.assertScope(scope);
    for (const [label, value] of Object.entries({
      studyId: input.studyId, runId: input.runId, engineStudyKey: input.engineStudyKey,
      sourceStage: input.sourceStage, sourceSchedule: input.sourceSchedule,
    })) requireText(value, label, 256);
    await this.withScopedWrite(scope, async (client) => {
      await client.query(
        `INSERT INTO research.studies
           (workspace_id, study_id, run_id, engine_study_key, purpose, source_stage, source_schedule)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [scope.workspaceId, input.studyId, input.runId, input.engineStudyKey, input.purpose, input.sourceStage, input.sourceSchedule],
      );
      await this.audit(client, scope, "RESEARCH_STUDY_CREATED", "study", input.studyId, { run_id: input.runId });
    });
  }

  async createTrial(scope: ResearchScope, input: ResearchTrialInput): Promise<void> {
    this.assertScope(scope);
    for (const [label, value] of Object.entries({ studyId: input.studyId, runId: input.runId, trialId: input.trialId })) {
      requireText(value, label, 256);
    }
    if (!Number.isSafeInteger(input.trialOrdinal) || input.trialOrdinal < 0 ||
        (input.objectiveDefined && (!Number.isFinite(input.objectiveValue ?? NaN))) ||
        (!input.objectiveDefined && input.objectiveValue !== undefined && input.objectiveValue !== null)) {
      throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "Trial objective shape is invalid.", 400);
    }
    requireBoundedObject(input.params, "trial params", RESEARCH_DB_BUDGET.maxConfigJsonBytes);
    await this.withScopedWrite(scope, async (client) => {
      await client.query(
        `INSERT INTO research.trial_index
           (workspace_id, study_id, run_id, trial_id, trial_ordinal,
            execution_status, feasibility_state, params, objective_defined,
            objective_value, objective_definition_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)`,
        [
          scope.workspaceId, input.studyId, input.runId, input.trialId, input.trialOrdinal,
          input.executionStatus, input.feasibilityState ?? "UNKNOWN", JSON.stringify(input.params),
          input.objectiveDefined, input.objectiveValue ?? null, input.objectiveDefinitionId ?? null,
        ],
      );
    });
  }

  /**
   * Records an evaluation as metadata only.  P03 does not compute a score or
   * imply that an evaluation is authoritative; it merely preserves the exact
   * run/study/trial relationship for later worker and screen phases.
   */
  async createEvaluation(scope: ResearchScope, input: {
    evaluationId: string;
    runId: string;
    studyId?: string | null;
    trialId?: string | null;
    dataRole: "TRAIN" | "INNER_VALIDATION" | "SELECTION_INPUT" | "OUTER_OOS" | "HOLDOUT" | "RETROSPECTIVE" | "FULL_SAMPLE";
    state: "PENDING" | "COMPLETE" | "FAILED" | "NOT_APPLICABLE";
  }): Promise<void> {
    this.assertScope(scope);
    requireText(input.evaluationId, "evaluationId", 256);
    requireText(input.runId, "runId", 256);
    if ((input.trialId && !input.studyId) || (input.studyId && !input.trialId)) {
      throw new ResearchMetadataError(
        "RESEARCH_EVALUATION_SCOPE_INVALID",
        "An evaluation must reference both study and trial, or neither.",
        400,
      );
    }
    await this.withScopedWrite(scope, async (client) => {
      if (input.studyId && input.trialId) {
        const trial = await client.query<{ run_id: string }>(
          `SELECT run_id FROM research.trial_index
            WHERE workspace_id = $1 AND study_id = $2 AND trial_id = $3`,
          [scope.workspaceId, input.studyId, input.trialId],
        );
        if (!trial.rows[0] || trial.rows[0].run_id !== input.runId) {
          throw new ResearchMetadataError(
            "RESEARCH_EVALUATION_SCOPE_INVALID",
            "An evaluation may reference only a trial owned by its run.",
            409,
          );
        }
      }
      await client.query(
        `INSERT INTO research.evaluations
           (workspace_id, evaluation_id, run_id, study_id, trial_id, data_role, state)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          scope.workspaceId,
          input.evaluationId,
          input.runId,
          input.studyId ?? null,
          input.trialId ?? null,
          input.dataRole,
          input.state,
        ],
      );
      await this.audit(client, scope, "RESEARCH_EVALUATION_RECORDED", "evaluation", input.evaluationId, {
        run_id: input.runId,
        study_id: input.studyId ?? null,
        trial_id: input.trialId ?? null,
        state: input.state,
      });
    });
  }

  /**
   * Stores an append-only fact about source exposure.  The fact is separate
   * from selection and release-candidate metadata so an inspection or export
   * cannot silently change what a candidate means.
   */
  async recordExposureFact(scope: ResearchScope, input: {
    exposureId: string;
    runId: string;
    evaluationId?: string | null;
    snapshotDigest: string;
    evaluationRole: "QUALITY_SCAN" | "TRAIN" | "SELECTION_INPUT" | "OUTER_OOS" | "HOLDOUT" | "RETROSPECTIVE" | "UNKNOWN";
    sourceFactRef: string;
    sourceAsOf: Date;
    rangeStartUtc?: Date | null;
    rangeEndUtc?: Date | null;
  }): Promise<void> {
    this.assertScope(scope);
    requireText(input.exposureId, "exposureId", 256);
    requireText(input.runId, "runId", 256);
    requireText(input.sourceFactRef, "sourceFactRef", 1024);
    requireDigest(input.snapshotDigest, "snapshotDigest");
    if (input.sourceFactRef.startsWith("/") ||
        !Number.isFinite(input.sourceAsOf.getTime()) ||
        ((input.rangeStartUtc || input.rangeEndUtc) && (!input.rangeStartUtc || !input.rangeEndUtc ||
          input.rangeEndUtc.getTime() <= input.rangeStartUtc.getTime()))) {
      throw new ResearchMetadataError(
        "RESEARCH_INVALID_INPUT",
        "Exposure facts require opaque references and a valid UTC range when a range is present.",
        400,
      );
    }
    await this.withScopedWrite(scope, async (client) => {
      if (input.evaluationId) {
        const evaluation = await client.query<{ run_id: string }>(
          `SELECT run_id FROM research.evaluations
            WHERE workspace_id = $1 AND evaluation_id = $2`,
          [scope.workspaceId, input.evaluationId],
        );
        if (!evaluation.rows[0] || evaluation.rows[0].run_id !== input.runId) {
          throw new ResearchMetadataError(
            "RESEARCH_EVALUATION_SCOPE_INVALID",
            "An exposure fact may reference only an evaluation owned by its run.",
            409,
          );
        }
      }
      await client.query(
        `INSERT INTO research.exposure_facts
           (workspace_id, exposure_id, run_id, evaluation_id, actor_user_id,
            snapshot_digest, range_start_utc, range_end_utc, evaluation_role,
            source_fact_ref, source_as_of)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          scope.workspaceId,
          input.exposureId,
          input.runId,
          input.evaluationId ?? null,
          scope.actorUserId,
          input.snapshotDigest,
          input.rangeStartUtc ?? null,
          input.rangeEndUtc ?? null,
          input.evaluationRole,
          input.sourceFactRef,
          input.sourceAsOf,
        ],
      );
      await this.audit(client, scope, "RESEARCH_EXPOSURE_FACT_RECORDED", "exposure", input.exposureId, {
        run_id: input.runId,
        evaluation_id: input.evaluationId ?? null,
        snapshot_digest: input.snapshotDigest,
      });
    });
  }

  async createSelection(scope: ResearchScope, input: {
    selectionId: string;
    runId: string;
    studyId: string;
    targetKind: "SINGLE_PARAMETER_SET" | "PER_FOLD_SELECTION_SEQUENCE" | "COMPOSITE_POLICY" | "CENTROID";
    selectedTrialId?: string | null;
    parameterBundleDigest: string;
    sourceDigest: string;
  }): Promise<void> {
    this.assertScope(scope);
    for (const [label, value] of Object.entries({ selectionId: input.selectionId, runId: input.runId, studyId: input.studyId })) {
      requireText(value, label, 256);
    }
    requireDigest(input.parameterBundleDigest, "parameterBundleDigest");
    requireDigest(input.sourceDigest, "sourceDigest");
    if (!input.selectedTrialId && !["CENTROID", "COMPOSITE_POLICY"].includes(input.targetKind)) {
      throw new ResearchMetadataError(
        "RESEARCH_SELECTION_SCOPE_INVALID",
        "Only centroid or composite selections may omit a selected trial reference.",
        400,
      );
    }
    await this.withScopedWrite(scope, async (client) => {
      await client.query(
        `INSERT INTO research.selection_records
           (workspace_id, selection_id, run_id, study_id, target_kind,
            selected_trial_id, parameter_bundle_digest, source_digest)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          scope.workspaceId, input.selectionId, input.runId, input.studyId, input.targetKind,
          input.selectedTrialId ?? null, input.parameterBundleDigest, input.sourceDigest,
        ],
      );
      await this.audit(client, scope, "RESEARCH_SELECTION_RECORDED", "selection", input.selectionId, {
        run_id: input.runId,
        study_id: input.studyId,
        selected_trial_id: input.selectedTrialId ?? null,
        target_kind: input.targetKind,
      });
    });
  }

  async createChildRun(scope: ResearchScope, input: {
    runId: string;
    parentRunId: string;
    relationshipKind: Exclude<ResearchRunRelationship, "PRIMARY">;
    runKind: Exclude<ResearchRunKind, "PRIMARY">;
    logicalRunKey: string;
    targetSelectionId?: string | null;
    requestSpecDigest: string;
    effectiveSpecDigest: string;
    engineReleaseId: string;
    datasetBindingDigest: string;
  }): Promise<void> {
    this.assertScope(scope);
    for (const [label, value] of Object.entries({
      runId: input.runId, parentRunId: input.parentRunId, logicalRunKey: input.logicalRunKey,
      engineReleaseId: input.engineReleaseId,
    })) requireText(value, label, 256);
    requireDigest(input.requestSpecDigest, "requestSpecDigest");
    requireDigest(input.effectiveSpecDigest, "effectiveSpecDigest");
    requireDigest(input.datasetBindingDigest, "datasetBindingDigest");
    await this.withScopedWrite(scope, async (client) => {
      const parent = await client.query<RunRow>(
        `SELECT run_id, attempt_id FROM research.runs
          WHERE workspace_id = $1 AND run_id = $2`,
        [scope.workspaceId, input.parentRunId],
      );
      if (!parent.rows[0]) {
        throw new ResearchMetadataError("RESEARCH_RUN_NOT_FOUND", "The parent Research run was not found.", 404);
      }
      if (input.targetSelectionId) {
        const selection = await client.query<{ run_id: string }>(
          `SELECT run_id FROM research.selection_records
            WHERE workspace_id = $1 AND selection_id = $2`,
          [scope.workspaceId, input.targetSelectionId],
        );
        if (!selection.rows[0] || selection.rows[0].run_id !== input.parentRunId) {
          throw new ResearchMetadataError(
            "RESEARCH_CHILD_RELATION_INVALID",
            "A child run may target only a selection owned by its parent run.",
            409,
          );
        }
      }
      await client.query(
        `INSERT INTO research.runs
           (workspace_id, run_id, attempt_id, run_kind, relationship_kind,
            logical_run_key, parent_run_id, target_selection_id,
            request_spec_digest, effective_spec_digest, engine_release_id,
            dataset_binding_digest, state, submitted_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'DRAFT', $13)`,
        [
          scope.workspaceId, input.runId, parent.rows[0].attempt_id, input.runKind,
          input.relationshipKind, input.logicalRunKey, input.parentRunId,
          input.targetSelectionId ?? null, input.requestSpecDigest, input.effectiveSpecDigest,
          input.engineReleaseId, input.datasetBindingDigest, scope.actorUserId,
        ],
      );
      await this.audit(client, scope, "RESEARCH_CHILD_RUN_CREATED", "run", input.runId, {
        parent_run_id: input.parentRunId,
        relationship_kind: input.relationshipKind,
      });
    });
  }

  async createArtifact(scope: ResearchScope, input: {
    artifactId: string;
    runId: string;
    selectionId?: string | null;
    tableKind: string;
    schemaVersion: string;
    manifestDigest: string;
    storageLocator: string;
  }): Promise<void> {
    this.assertScope(scope);
    for (const [label, value] of Object.entries({
      artifactId: input.artifactId, runId: input.runId, tableKind: input.tableKind,
      schemaVersion: input.schemaVersion, storageLocator: input.storageLocator,
    })) requireText(value, label, 1024);
    if (input.storageLocator.startsWith("/")) {
      throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "Artifact locators must remain opaque relative references.", 400);
    }
    requireDigest(input.manifestDigest, "manifestDigest");
    await this.withScopedWrite(scope, async (client) => {
      if (input.selectionId) {
        const selection = await client.query<{ run_id: string }>(
          `SELECT run_id FROM research.selection_records
            WHERE workspace_id = $1 AND selection_id = $2`,
          [scope.workspaceId, input.selectionId],
        );
        if (!selection.rows[0] || selection.rows[0].run_id !== input.runId) {
          throw new ResearchMetadataError(
            "RESEARCH_SELECTION_SCOPE_INVALID",
            "Evidence may reference only a selection belonging to its own run.",
            409,
          );
        }
      }
      await client.query(
        `INSERT INTO research.artifacts
           (workspace_id, artifact_id, run_id, selection_id, table_kind,
            schema_version, manifest_digest, state, retention_class, storage_locator)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'SEALED', 'RESEARCH_EVIDENCE', $8)`,
        [
          scope.workspaceId, input.artifactId, input.runId, input.selectionId ?? null,
          input.tableKind, input.schemaVersion, input.manifestDigest, input.storageLocator,
        ],
      );
      await this.audit(client, scope, "RESEARCH_ARTIFACT_REGISTERED", "artifact", input.artifactId, {
        run_id: input.runId,
        manifest_digest: input.manifestDigest,
      });
    });
  }

  async createReleaseCandidate(scope: ResearchScope, input: {
    releaseCandidateId: string;
    runId: string;
    selectionId?: string | null;
    manifestDigest: string;
    schemaVersion: string;
  }): Promise<void> {
    this.assertScope(scope);
    for (const [label, value] of Object.entries({
      releaseCandidateId: input.releaseCandidateId, runId: input.runId, schemaVersion: input.schemaVersion,
    })) requireText(value, label, 256);
    requireDigest(input.manifestDigest, "manifestDigest");
    await this.withScopedWrite(scope, async (client) => {
      if (input.selectionId) {
        const selection = await client.query<{ run_id: string }>(
          `SELECT run_id FROM research.selection_records
            WHERE workspace_id = $1 AND selection_id = $2`,
          [scope.workspaceId, input.selectionId],
        );
        if (!selection.rows[0] || selection.rows[0].run_id !== input.runId) {
          throw new ResearchMetadataError("RESEARCH_SELECTION_SCOPE_INVALID", "Release selection does not belong to its run.", 409);
        }
      }
      await client.query(
        `INSERT INTO research.release_candidates
           (workspace_id, release_candidate_id, run_id, selection_id,
            manifest_digest, schema_version, lifecycle_state)
         VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT')`,
        [scope.workspaceId, input.releaseCandidateId, input.runId, input.selectionId ?? null, input.manifestDigest, input.schemaVersion],
      );
      await this.audit(client, scope, "RESEARCH_RELEASE_CANDIDATE_DRAFTED", "release_candidate", input.releaseCandidateId, {
        run_id: input.runId,
        manifest_digest: input.manifestDigest,
      });
    });
  }

  /**
   * An inspection pick is actor-local presentation state.  It is deliberately
   * stored outside selection/artifact/RC rows and has its own CAS revision.
   */
  async updateInspectionState(scope: ResearchScope, input: {
    runId: string;
    studyId?: string | null;
    trialId?: string | null;
    cursor?: string | null;
    expectedRevision: number;
  }): Promise<number> {
    this.assertScope(scope);
    requireText(input.runId, "runId", 256);
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
      throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "expectedRevision must be a non-negative integer.", 400);
    }
    if ((input.trialId && !input.studyId) || (input.cursor && input.cursor.length > 2048)) {
      throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "Inspection reference shape is invalid.", 400);
    }
    return this.withScopedWrite(scope, async (client) => {
      if (input.studyId && input.trialId) {
        const trial = await client.query<{ run_id: string }>(
          `SELECT run_id FROM research.trial_index
            WHERE workspace_id = $1 AND study_id = $2 AND trial_id = $3`,
          [scope.workspaceId, input.studyId, input.trialId],
        );
        if (!trial.rows[0] || trial.rows[0].run_id !== input.runId) {
          throw new ResearchMetadataError(
            "RESEARCH_INSPECTION_SCOPE_INVALID",
            "The requested inspection reference is outside this run scope.",
            409,
          );
        }
      }
      if (input.expectedRevision === 0) {
        const inserted = await client.query<{ inspection_revision: string | number }>(
          `INSERT INTO research.inspection_states
             (workspace_id, actor_user_id, run_id, inspection_study_id,
              inspection_trial_id, inspection_cursor)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (workspace_id, actor_user_id, run_id) DO NOTHING
           RETURNING inspection_revision`,
          [scope.workspaceId, scope.actorUserId, input.runId, input.studyId ?? null, input.trialId ?? null, input.cursor ?? null],
        );
        if (inserted.rowCount === 1) return asNumber(inserted.rows[0].inspection_revision);
      } else {
        const updated = await client.query<{ inspection_revision: string | number }>(
          `UPDATE research.inspection_states
              SET inspection_study_id = $4,
                  inspection_trial_id = $5,
                  inspection_cursor = $6,
                  inspection_revision = inspection_revision + 1,
                  updated_at = now()
            WHERE workspace_id = $1
              AND actor_user_id = $2
              AND run_id = $3
              AND inspection_revision = $7
          RETURNING inspection_revision`,
          [scope.workspaceId, scope.actorUserId, input.runId, input.studyId ?? null, input.trialId ?? null, input.cursor ?? null, input.expectedRevision],
        );
        if (updated.rowCount === 1) return asNumber(updated.rows[0].inspection_revision);
      }
      throw new ResearchMetadataError(
        "RESEARCH_DRAFT_REVISION_CONFLICT",
        "The inspection state changed in another request. Refresh before updating it.",
        409,
      );
    });
  }

  async listAttempts(scope: ResearchScope): Promise<ResearchAttemptRecord[]> {
    this.assertScope(scope);
    return this.withScopedRead(scope, async (client) => {
      const result = await client.query<AttemptRow & { run_id: string }>(
        `SELECT a.workspace_id, a.attempt_id, a.client_intent_id, a.draft_revision,
                a.state, a.alpha_version_id, r.run_id
           FROM research.attempts a
           JOIN research.runs r
             ON r.workspace_id = a.workspace_id
            AND r.attempt_id = a.attempt_id
            AND r.logical_run_key = 'primary'
          WHERE a.workspace_id = $1
          ORDER BY a.created_at DESC, a.attempt_id DESC
          LIMIT 200`,
        [scope.workspaceId],
      );
      return result.rows.map((row) => rowToAttempt(row, row.run_id));
    });
  }

  private assertScope(scope: ResearchScope): void {
    if (!scope.workspaceId?.trim() || !scope.actorUserId?.trim()) {
      throw new ResearchMetadataError(
        "RESEARCH_SCOPE_REQUIRED",
        "Authenticated Portal workspace scope is required.",
        403,
      );
    }
  }

  private assertAttemptInput(input: ResearchAttemptInput): void {
    for (const [label, value] of Object.entries({
      attemptId: input.attemptId,
      runId: input.runId,
      clientIntentId: input.clientIntentId,
      engineReleaseId: input.engineReleaseId,
    })) requireText(value, label, 256);
    for (const [label, value] of Object.entries({
      requestPayloadDigest: input.requestPayloadDigest,
      requestSpecDigest: input.requestSpecDigest,
      effectiveSpecDigest: input.effectiveSpecDigest,
      datasetBindingDigest: input.datasetBindingDigest,
    })) requireDigest(value, label);
    if (input.spaceSignature) requireDigest(input.spaceSignature, "spaceSignature");
  }

  private async withScopedRead<T>(scope: ResearchScope, work: (client: ScopedClient) => Promise<T>): Promise<T> {
    return this.withScopedTransaction(scope, true, work);
  }

  private async withScopedWrite<T>(scope: ResearchScope, work: (client: ScopedClient) => Promise<T>): Promise<T> {
    return this.withScopedTransaction(scope, false, work);
  }

  private async withScopedTransaction<T>(
    scope: ResearchScope,
    readOnly: boolean,
    work: (client: ScopedClient) => Promise<T>,
  ): Promise<T> {
    const releaseAdmission = await this.acquireAdmission();
    let client: ScopedClient | undefined;
    let began = false;
    try {
      client = await this.pool.connect();
      await client.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
      began = true;
      try {
        await client.query(`SET LOCAL ROLE ${RESEARCH_DB_RUNTIME_ROLE}`);
      } catch {
        throw new ResearchMetadataError(
          "RESEARCH_DB_ROLE_UNAVAILABLE",
          "Research database authority is not configured; the request was not applied.",
          503,
        );
      }
      await client.query("SELECT set_config('statement_timeout', $1, true)", [
        `${RESEARCH_DB_BUDGET.statementTimeoutMs}ms`,
      ]);
      await client.query("SELECT set_config('lock_timeout', $1, true)", [
        `${RESEARCH_DB_BUDGET.lockTimeoutMs}ms`,
      ]);
      await client.query("SELECT set_config('idle_in_transaction_session_timeout', $1, true)", [
        `${RESEARCH_DB_BUDGET.idleTransactionTimeoutMs}ms`,
      ]);
      await client.query("SELECT set_config('research.workspace_id', $1, true)", [scope.workspaceId]);
      await client.query("SELECT set_config('research.actor_user_id', $1, true)", [scope.actorUserId]);
      const membership = await client.query(
        `SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
        [scope.workspaceId, scope.actorUserId],
      );
      if (membership.rowCount !== 1) {
        throw new ResearchMetadataError(
          "RESEARCH_WORKSPACE_FORBIDDEN",
          "Access denied.",
          403,
        );
      }
      const result = await work(client);
      await client.query("COMMIT");
      began = false;
      return result;
    } catch (error) {
      if (began && client) await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof ResearchMetadataError) throw error;
      const code = typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
      if (code === "40001" || code === "40P01") {
        throw new ResearchMetadataError(
          "RESEARCH_CONCURRENT_TRANSACTION",
          "A concurrent Research transaction won; retry from the current revision.",
          409,
        );
      }
      throw error;
    } finally {
      client?.release();
      releaseAdmission();
    }
  }

  /**
   * Keep Research metadata from consuming the whole shared Control API pool.
   * The queue is deliberately finite: callers receive a typed retryable error
   * rather than creating an unbounded promise/memory queue during a burst.
   */
  private async acquireAdmission(): Promise<() => void> {
    if (this.activeMetadataOperations < RESEARCH_DB_BUDGET.maximumConcurrentMetadataOperations) {
      this.activeMetadataOperations += 1;
      return () => this.releaseAdmission();
    }
    if (this.metadataAdmissionWaiters.length >= RESEARCH_DB_BUDGET.maximumQueuedMetadataOperations) {
      throw new ResearchMetadataError(
        "RESEARCH_ADMISSION_SATURATED",
        "Research metadata admission is temporarily saturated; retry shortly.",
        503,
      );
    }
    await new Promise<void>((resolve) => this.metadataAdmissionWaiters.push(resolve));
    return () => this.releaseAdmission();
  }

  private releaseAdmission(): void {
    const next = this.metadataAdmissionWaiters.shift();
    if (next) {
      next();
      return;
    }
    this.activeMetadataOperations -= 1;
  }

  private async audit(
    client: ScopedClient,
    scope: ResearchScope,
    action: string,
    subjectType: string,
    subjectId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    requireBoundedObject(metadata, "research audit metadata", RESEARCH_DB_BUDGET.maxSmallMetadataJsonBytes);
    await client.query(
      `INSERT INTO research.audit_log
         (workspace_id, audit_id, actor_user_id, action, subject_type, subject_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [scope.workspaceId, newUlid("raud"), scope.actorUserId, action, subjectType, subjectId, JSON.stringify(metadata)],
    );
  }
}
