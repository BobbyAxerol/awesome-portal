import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";

import { newUlid } from "../id";
import { CONTROL_API_POOL } from "../tokens";
import {
  RESEARCH_DB_BUDGET,
  RESEARCH_DB_RUNTIME_ROLE,
  RESEARCH_DURABLE_SCHEDULER_POLICY_V1,
  type ResearchArtifactIntegrityInput,
  type ResearchArtifactReferenceInput,
  type ResearchArtifactReservation,
  type ResearchArtifactReservationInput,
  type ResearchArtifactSealInput,
  type ResearchArtifactTrialBatchInput,
  type ResearchAlphaVersionInput,
  type ResearchAlphaActivation,
  type ResearchAlphaImportGateReceiptInput,
  type ResearchAlphaImportRegistration,
  type ResearchAlphaImportRegistrationInput,
  type ResearchAlphaImportSourceInput,
  type ResearchAlphaImportSourceRecord,
  type ResearchAlphaVersionDataContract,
  type ResearchAlphaRegistryRecord,
  type ResearchPreflightManifestInput,
  type ResearchPreflightManifestRecord,
  type ResearchJourneyRegistryRecord,
  type ResearchAttemptInput,
  type ResearchAttemptRecord,
  type ResearchDurableJobClaim,
  type ResearchDurableJobInput,
  type ResearchExecutionAdapterBinding,
  type ResearchP04DeltaBindingInput,
  type ResearchJobOutboxClaim,
  type ResearchJobOutboxMessage,
  type ResearchReadinessClass,
  type ResearchRunKind,
  type ResearchRunProducerInput,
  type ResearchRunProducerRecord,
  type ResearchRunRelationship,
  type ResearchScope,
  type ResearchTrialInput,
  type ResearchWorkerUsage,
  ResearchMetadataError,
} from "./contracts";
import {
  DELTA_WFO_PROFILE_DIGEST,
  DELTA_WFO_PROFILE_ID,
  P04_FIXED_QUALIFICATION_PROFILE_ID,
} from "./delta-wfo.profile";

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

interface AlphaImportSourceRow {
  source_file_ref: string;
  original_filename: string;
  source_bytes: Buffer;
  source_digest: string;
  analysis_digest: string;
  declared_contract: Record<string, unknown> | string;
  parsed_mirror: Array<Record<string, unknown>> | string;
  expires_at: Date;
}

interface AlphaImportAlphaRow {
  active_version_id: string | null;
  revision: string | number;
}

interface AlphaImportVersionRow {
  alpha_id: string;
  alpha_version_id: string;
  source_file_ref: string | null;
  code_digest: string;
  entrypoint: string;
  dependency_ref: string;
  lifecycle_state: "DRAFT" | "ACTIVE" | "SUPERSEDED" | "ABANDONED";
  matches_declared_contract: boolean;
  supersedes_alpha_version_id: string | null;
  supersedes_recorded: boolean;
}

interface AlphaImportRegistryRow {
  alpha_id: string;
  alpha_version_id: string;
  display_name: string;
  source_digest: string;
  version_label: string;
  lifecycle_state: "DRAFT" | "ACTIVE" | "SUPERSEDED" | "ABANDONED";
  entrypoint: string;
  declared_contract: Record<string, unknown> | string;
  source_digest_prefix: string;
  alpha_revision: string | number;
  supersedes_alpha_version_id: string | null;
  supersedes_recorded: boolean;
  registered_at: Date;
}

interface AlphaVersionDataContractRow {
  alpha_id: string;
  alpha_version_id: string;
  entrypoint: string;
  declared_contract: Record<string, unknown> | string;
}

interface PreflightManifestRow {
  preflight_token: string;
  requested_spec_digest: string;
  effective_spec_digest: string;
  dataset_binding_digest: string;
  manifest_digest: string;
  requested_spec: Record<string, unknown> | string;
  effective_spec: Record<string, unknown> | string;
  dataset_binding: Record<string, unknown> | string;
  topology: Record<string, unknown> | string;
  resource_estimate: Record<string, unknown> | string;
  snapshot: Record<string, unknown> | string;
  expires_at: Date;
  created_at: Date;
}

interface JourneyDescriptorRegistryRow {
  descriptor_id: string;
  schema_version: string;
  revision: string | number;
  content_sha256: string;
}

interface RunRow {
  run_id: string;
  attempt_id: string;
}

interface DurableJobRow {
  job_id: string;
  run_id: string;
  command_id: string;
  logical_work_key: string;
  work_digest: string | null;
  job_kind: ResearchDurableJobInput["jobKind"];
  readiness_class: ResearchReadinessClass;
  queue_class: ResearchDurableJobInput["queueClass"];
  resource_class: string;
  cost_estimate: ResearchJobCostRow | string;
  attempt_limit: string | number;
  cancel_version: string | number;
  requested_by_user_id: string;
  state: string;
}

interface ExecutionAdapterBindingRow {
  alpha_id: string;
  alpha_version_id: string;
  lifecycle_state: "DRAFT" | "ACTIVE" | "SUPERSEDED" | "ABANDONED";
  declared_contract: Record<string, unknown> | string;
  adapter_id: "p04.delta-rsi.v1" | null;
  contract_digest: string | null;
}

interface RunProducerRow {
  run_id: string;
  attempt_id: string;
  job_id: string;
  client_intent_id: string;
  alpha_id: string;
  alpha_version_id: string;
  execution_adapter_id: "p04.delta-rsi.v1";
  adapter_contract_digest: string;
  requested_spec_digest: string;
  effective_spec_digest: string;
  dataset_binding_digest: string;
  manifest_digest: string;
  snapshot_id: string;
  snapshot_content_hash: string;
  work_digest: string;
  legacy_request: Record<string, unknown> | string;
  dispatch_state: "PENDING" | "DISPATCHED";
  worker_attempt_id: string | null;
  lease_epoch: string | number | null;
  portal_receipt: Record<string, unknown> | string | null;
  execution_profile_id: "p04.fixed-qualification.v1" | "p10.delta-signal-notional-wfo.v1";
  execution_profile_digest: string | null;
}

interface ResearchJobCostRow {
  memory_bytes: number;
  cpu_seconds: number;
  scratch_bytes: number;
  io_bytes: number;
}

const RESEARCH_SCHEDULER_BUDGET = RESEARCH_DURABLE_SCHEDULER_POLICY_V1;

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

function isOpaqueId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/.test(value);
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

function requireOpaqueId(value: string, label: string): void {
  if (!isOpaqueId(value)) {
    throw new ResearchMetadataError(
      "RESEARCH_INVALID_INPUT",
      `${label} must be an opaque bounded identifier.`,
      400,
    );
  }
}

function requirePositiveSafeInteger(value: number, label: string, maximum = Number.MAX_SAFE_INTEGER): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", `${label} must be a positive safe integer.`, 400);
  }
}

function requireNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", `${label} must be a non-negative safe integer.`, 400);
  }
}

function requireArtifactRelativePath(value: string, label: string): void {
  if (
    value.length === 0 || value.length > 1_024 || value.startsWith("/") ||
    value.split("/").some((part) => part.length === 0 || part === "." || part === "..")
  ) {
    throw new ResearchMetadataError(
      "RESEARCH_INVALID_INPUT",
      `${label} must be a safe artifact-relative path.`,
      400,
    );
  }
}

function requireFiniteDate(value: Date, label: string): void {
  if (!Number.isFinite(value.getTime())) {
    throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", `${label} must be a valid UTC timestamp.`, 400);
  }
}

function requireArtifactRetentionClass(value: string): asserts value is "RESEARCH_EVIDENCE" | "EPHEMERAL_DIAGNOSTIC" {
  if (value !== "RESEARCH_EVIDENCE" && value !== "EPHEMERAL_DIAGNOSTIC") {
    throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "Artifact retention class is unsupported.", 400);
  }
}

function requireArtifactReferenceKind(value: string): asserts value is ResearchArtifactReferenceInput["referenceKind"] {
  if (![
    "ACTIVE_LEASE", "CHILD_RUN", "EXPOSURE", "RELEASE_CANDIDATE", "SELECTION", "VERIFICATION",
  ].includes(value)) {
    throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "Artifact reference kind is unsupported.", 400);
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

function requireAlphaImportFilename(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}[.]py$/.test(value)) {
    throw new ResearchMetadataError(
      "RESEARCH_INVALID_INPUT",
      "Alpha import requires one bounded .py filename.",
      400,
    );
  }
}

function requireAlphaId(value: string): void {
  if (!/^[a-z][a-z0-9-]{2,63}$/.test(value)) {
    throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "Alpha ID is invalid.", 400);
  }
}

function requireAlphaLifecycle(value: string): asserts value is AlphaImportVersionRow["lifecycle_state"] {
  if (!(["DRAFT", "ACTIVE", "SUPERSEDED", "ABANDONED"] as const).includes(value as AlphaImportVersionRow["lifecycle_state"])) {
    throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "Alpha lifecycle value is invalid.", 400);
  }
}

function decodeObject(value: Record<string, unknown> | string, label: string): Record<string, unknown> {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", `${label} has an invalid database shape.`, 409);
  }
  return parsed as Record<string, unknown>;
}

function decodeMirror(value: Array<Record<string, unknown>> | string): readonly Record<string, unknown>[] {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(parsed)) {
    throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "Alpha import mirror has an invalid database shape.", 409);
  }
  return parsed as readonly Record<string, unknown>[];
}

function digestJson(value: Record<string, unknown>): string {
  // Scheduler payloads intentionally have fixed, named fields.  Serialising
  // them in lexical key order makes the outbox digest stable across a retry
  // without admitting caller-supplied JSON or secret-bearing payloads.
  const encoded = JSON.stringify(
    Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))),
  );
  return createHash("sha256").update(encoded).digest("hex");
}

/** Stable deep JSON identity for persisted P10 compatibility envelopes. */
function canonicalResearchDocument(value: unknown): string {
  const normalize = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (entry && typeof entry === "object") {
      return Object.fromEntries(
        Object.entries(entry as Record<string, unknown>)
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
          .map(([key, nested]) => [key, normalize(nested)]),
      );
    }
    return entry;
  };
  return JSON.stringify(normalize(value));
}

function requireJobKind(value: string): asserts value is ResearchDurableJobInput["jobKind"] {
  if (!["PRIMARY", "AUDIT", "DIAGNOSTIC", "EXPORT", "VERIFY", "PROJECTION"].includes(value)) {
    throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "Research job kind is unsupported.", 400);
  }
}

function requireQueueClass(value: string): asserts value is ResearchDurableJobInput["queueClass"] {
  if (!["INTERACTIVE", "HEAVY", "BACKGROUND"].includes(value)) {
    throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "Research queue class is unsupported.", 400);
  }
}

function requireReadinessClass(value: string): asserts value is ResearchReadinessClass {
  if (value !== "MANDATORY" && value !== "OPTIONAL") {
    throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "Research readiness class is unsupported.", 400);
  }
}

function assertJobCost(cost: ResearchDurableJobInput["cost"]): void {
  const limits: Record<keyof ResearchDurableJobInput["cost"], number> = {
    memoryBytes: RESEARCH_SCHEDULER_BUDGET.maximumMemoryBytes,
    cpuSeconds: RESEARCH_SCHEDULER_BUDGET.maximumCpuSeconds,
    scratchBytes: RESEARCH_SCHEDULER_BUDGET.maximumScratchBytes,
    ioBytes: RESEARCH_SCHEDULER_BUDGET.maximumIoBytes,
  };
  for (const [key, maximum] of Object.entries(limits) as Array<[keyof typeof limits, number]>) {
    requirePositiveSafeInteger(cost[key], `cost.${key}`, maximum);
  }
}

function decodeJobCost(value: ResearchJobCostRow | string): ResearchDurableJobInput["cost"] {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  const cost = {
    memoryBytes: parsed.memory_bytes,
    cpuSeconds: parsed.cpu_seconds,
    scratchBytes: parsed.scratch_bytes,
    ioBytes: parsed.io_bytes,
  };
  assertJobCost(cost);
  return cost;
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

function rowToRunProducer(row: RunProducerRow): ResearchRunProducerRecord {
  return {
    runId: row.run_id,
    attemptId: row.attempt_id,
    jobId: row.job_id,
    clientIntentId: row.client_intent_id,
    alphaId: row.alpha_id,
    alphaVersionId: row.alpha_version_id,
    executionAdapterId: row.execution_adapter_id,
    adapterContractDigest: row.adapter_contract_digest,
    executionProfileId: row.execution_profile_id,
    executionProfileDigest: row.execution_profile_digest ?? null,
    requestedSpecDigest: row.requested_spec_digest,
    effectiveSpecDigest: row.effective_spec_digest,
    datasetBindingDigest: row.dataset_binding_digest,
    manifestDigest: row.manifest_digest,
    snapshotId: row.snapshot_id,
    snapshotContentHash: row.snapshot_content_hash,
    workDigest: row.work_digest,
    legacyRequest: decodeObject(row.legacy_request, "Research run producer legacy request"),
    dispatchState: row.dispatch_state,
    workerAttemptId: row.worker_attempt_id,
    leaseEpoch: row.lease_epoch == null ? null : asNumber(row.lease_epoch),
    portalReceipt: row.portal_receipt == null
      ? null
      : decodeObject(row.portal_receipt, "Research run producer Portal receipt"),
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

  /**
   * P09 reads the one immutable global descriptor only after the caller's
   * workspace scope has been established.  The scoped, read-only transaction
   * keeps this small registry from becoming an unreviewed public catalogue.
   */
  async loadJourneyDescriptor(scope: ResearchScope): Promise<ResearchJourneyRegistryRecord> {
    this.assertScope(scope);
    return this.withScopedRead(scope, async (client) => {
      const result = await client.query<JourneyDescriptorRegistryRow>(
        `SELECT descriptor_id, schema_version, revision, content_sha256
           FROM research.journey_descriptor_registry
          WHERE descriptor_id = 'quantbt_journey'
          ORDER BY revision DESC
          LIMIT 1`,
      );
      const row = result.rows[0];
      if (!row) {
        throw new ResearchMetadataError(
          "RESEARCH_ATTEMPT_NOT_FOUND",
          "Research Journey descriptor is not installed.",
          404,
        );
      }
      return {
        descriptorId: row.descriptor_id,
        schemaVersion: row.schema_version,
        revision: asNumber(row.revision),
        contentSha256: row.content_sha256,
      };
    });
  }

  /** P02 only requires a study qualifier when the exact run proves ambiguity. */
  async isTrialAmbiguous(scope: ResearchScope, runId: string, trialId: string): Promise<boolean> {
    this.assertScope(scope);
    requireOpaqueId(runId, "runId");
    requireOpaqueId(trialId, "trialId");
    return this.withScopedRead(scope, async (client) => {
      const result = await client.query<{ count: string | number }>(
        `SELECT count(DISTINCT study_id) AS count
           FROM research.trial_index
          WHERE workspace_id = $1 AND run_id = $2 AND trial_id = $3`,
        [scope.workspaceId, runId, trialId],
      );
      return asNumber(result.rows[0]?.count ?? 0) > 1;
    });
  }

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
   * Install (or verify) P10's one source-controlled P04 binding.
   *
   * Unlike P07 this does not accept an import source, source reference, code
   * text or dependency from a caller. The service supplies a fixed protected
   * Delta descriptor.  The DB records its identity once per workspace so a
   * P08 manifest can reference it and P10 can later prove the exact adapter
   * that was admitted. Existing user/import Alpha versions are never
   * overwritten or promoted by this helper.
   */
  async ensureP04DeltaBinding(
    scope: ResearchScope,
    input: ResearchP04DeltaBindingInput,
  ): Promise<{
    alphaId: string;
    alphaVersionId: string;
    adapterContractDigest: string;
    alphaRevision: number;
    replayed: boolean;
  }> {
    this.assertScope(scope);
    requireAlphaId(input.alphaId);
    requireOpaqueId(input.alphaVersionId, "alphaVersionId");
    requireText(input.alphaName, "P04 alpha name", 240);
    requireText(input.executionSubjectId, "P04 executionSubjectId", 240);
    requireDigest(input.adapterContractDigest, "P04 adapterContractDigest");
    requireDigest(input.codeDigest, "P04 codeDigest");
    requireText(input.entrypoint, "P04 entrypoint", 512);
    requireText(input.dependencyRef, "P04 dependencyRef", 512);
    if (input.adapterId !== "p04.delta-rsi.v1") {
      throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "Only the installed P04 Delta adapter may be bound.", 400);
    }
    requireBoundedObject(input.declaredContract, "P04 declared contract", RESEARCH_DB_BUDGET.maxConfigJsonBytes);

    return this.withScopedWrite(scope, async (client) => {
      // This lock has a constant server-owned discriminator; it cannot become
      // a user-selected lock namespace. It serializes first installation
      // without taking a broad workspace table lock.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1 || ':p04-delta-binding'))", [scope.workspaceId]);

      await client.query(
        `INSERT INTO research.alphas
           (workspace_id, alpha_id, name, owner_user_id, execution_subject_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (workspace_id, alpha_id) DO NOTHING`,
        [scope.workspaceId, input.alphaId, input.alphaName, scope.actorUserId, input.executionSubjectId],
      );
      const alpha = await client.query<{
        name: string;
        execution_subject_id: string;
        active_version_id: string | null;
        revision: string | number;
      }>(
        `SELECT name, execution_subject_id, active_version_id, revision
           FROM research.alphas
          WHERE workspace_id = $1 AND alpha_id = $2
          FOR UPDATE`,
        [scope.workspaceId, input.alphaId],
      );
      const alphaRow = alpha.rows[0];
      if (!alphaRow || alphaRow.name !== input.alphaName || alphaRow.execution_subject_id !== input.executionSubjectId) {
        throw new ResearchMetadataError(
          "RESEARCH_IMMUTABLE_ALPHA_VERSION_CONFLICT",
          "The P04 strategy identity is already bound to a different immutable Alpha record.",
          409,
        );
      }

      const insertedVersion = await client.query<{ alpha_version_id: string }>(
        `INSERT INTO research.alpha_versions
           (workspace_id, alpha_version_id, alpha_id, code_digest, entrypoint,
            dependency_ref, declared_contract, lifecycle_state, registered_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'ACTIVE', $8)
         ON CONFLICT (workspace_id, alpha_version_id) DO NOTHING
         RETURNING alpha_version_id`,
        [
          scope.workspaceId, input.alphaVersionId, input.alphaId,
          input.codeDigest, input.entrypoint, input.dependencyRef,
          JSON.stringify(input.declaredContract), scope.actorUserId,
        ],
      );
      let replayed = insertedVersion.rowCount === 0;
      if (replayed) {
        const existing = await client.query<AlphaImportVersionRow>(
          `SELECT alpha_id, alpha_version_id, source_file_ref, code_digest,
                  entrypoint, dependency_ref, lifecycle_state,
                  declared_contract = $3::jsonb AS matches_declared_contract
             FROM research.alpha_versions
            WHERE workspace_id = $1 AND alpha_version_id = $2`,
          [scope.workspaceId, input.alphaVersionId, JSON.stringify(input.declaredContract)],
        );
        const row = existing.rows[0];
        if (!row || row.alpha_id !== input.alphaId || row.source_file_ref !== null ||
            row.code_digest !== input.codeDigest || row.entrypoint !== input.entrypoint ||
            row.dependency_ref !== input.dependencyRef || row.lifecycle_state !== "ACTIVE" ||
            !row.matches_declared_contract) {
          throw new ResearchMetadataError(
            "RESEARCH_IMMUTABLE_ALPHA_VERSION_CONFLICT",
            "The installed P04 AlphaVersion cannot be rebound to different code or contract metadata.",
            409,
          );
        }
      }

      if (alphaRow.active_version_id === null) {
        const activated = await client.query<{ revision: string | number }>(
          `UPDATE research.alphas
              SET active_version_id = $3, revision = revision + 1, updated_at = now()
            WHERE workspace_id = $1 AND alpha_id = $2 AND active_version_id IS NULL
            RETURNING revision`,
          [scope.workspaceId, input.alphaId, input.alphaVersionId],
        );
        if (activated.rowCount !== 1 || !activated.rows[0]) {
          throw new ResearchMetadataError("RESEARCH_CONCURRENT_TRANSACTION", "The P04 Alpha activation changed during installation.", 409);
        }
        alphaRow.revision = activated.rows[0].revision;
      } else if (alphaRow.active_version_id !== input.alphaVersionId) {
        throw new ResearchMetadataError(
          "RESEARCH_IMMUTABLE_ALPHA_VERSION_CONFLICT",
          "The P04 Alpha already has a different active version and will not be replaced automatically.",
          409,
        );
      }

      const bound = await client.query(
        `INSERT INTO research.execution_adapter_bindings
           (workspace_id, alpha_version_id, adapter_id, contract_digest, installed_by_user_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (workspace_id, alpha_version_id) DO NOTHING
         RETURNING alpha_version_id`,
        [scope.workspaceId, input.alphaVersionId, input.adapterId, input.adapterContractDigest, scope.actorUserId],
      );
      if (bound.rowCount === 0) {
        const existing = await client.query<{ adapter_id: string; contract_digest: string }>(
          `SELECT adapter_id, contract_digest
             FROM research.execution_adapter_bindings
            WHERE workspace_id = $1 AND alpha_version_id = $2`,
          [scope.workspaceId, input.alphaVersionId],
        );
        const row = existing.rows[0];
        if (!row || row.adapter_id !== input.adapterId || row.contract_digest !== input.adapterContractDigest) {
          throw new ResearchMetadataError(
            "RESEARCH_IMMUTABLE_ALPHA_VERSION_CONFLICT",
            "The P04 AlphaVersion is already bound to a different execution adapter contract.",
            409,
          );
        }
        replayed = true;
      }

      await this.audit(client, scope, replayed ? "RESEARCH_P04_DELTA_BINDING_REPLAYED" : "RESEARCH_P04_DELTA_BINDING_INSTALLED", "alpha_version", input.alphaVersionId, {
        alpha_id: input.alphaId,
        adapter_id: input.adapterId,
        adapter_contract_digest: input.adapterContractDigest,
        protected_code_digest: input.codeDigest,
      });
      return {
        alphaId: input.alphaId,
        alphaVersionId: input.alphaVersionId,
        adapterContractDigest: input.adapterContractDigest,
        alphaRevision: asNumber(alphaRow.revision),
        replayed,
      };
    });
  }

  /**
   * P07: persist one browser-submitted source file behind an opaque, actor
   * scoped temporary reference.  The database receives exact bytes only after
   * the private Python adapter has returned a bounded AST mirror; no raw path
   * or source bytes ever become part of the browser DTO surface.
   */
  async storeAlphaImportSource(
    scope: ResearchScope,
    input: ResearchAlphaImportSourceInput,
  ): Promise<ResearchAlphaImportSourceRecord> {
    this.assertScope(scope);
    requireOpaqueId(input.sourceFileRef, "sourceFileRef");
    requireAlphaImportFilename(input.originalFilename);
    if (!Buffer.isBuffer(input.sourceBytes) || input.sourceBytes.byteLength < 1 ||
        input.sourceBytes.byteLength > RESEARCH_DB_BUDGET.maxAlphaImportSourceBytes) {
      throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "Alpha source bytes exceed the bounded import contract.", 400);
    }
    requireDigest(input.sourceDigest, "sourceDigest");
    requireDigest(input.analysisDigest, "analysisDigest");
    requireBoundedObject(input.declaredContract, "declared alpha contract", RESEARCH_DB_BUDGET.maxConfigJsonBytes);
    const mirror = [...input.parsedMirror];
    if (Buffer.byteLength(JSON.stringify(mirror), "utf8") > RESEARCH_DB_BUDGET.maxAlphaImportMirrorBytes) {
      throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "Alpha import mirror exceeds its bounded contract.", 400);
    }
    requireFiniteDate(input.expiresAt, "source expiry");
    if (input.expiresAt.getTime() <= Date.now()) {
      throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "Alpha source expiry must be in the future.", 400);
    }
    requirePositiveSafeInteger(
      input.maximumActiveSources,
      "maximumActiveSources",
      RESEARCH_DB_BUDGET.maxAlphaImportActiveSourcesPerActor,
    );

    return this.withScopedWrite(scope, async (client) => {
      const active = await client.query<{ count: string | number }>(
        `SELECT count(*) AS count
           FROM research.import_sources source
          WHERE source.workspace_id = $1
            AND source.actor_user_id = $2
            AND source.expires_at > now()
            AND NOT EXISTS (
              SELECT 1 FROM research.alpha_versions version
               WHERE version.workspace_id = source.workspace_id
                 AND version.source_file_ref = source.source_file_ref
            )`,
        [scope.workspaceId, scope.actorUserId],
      );
      if (asNumber(active.rows[0]?.count ?? 0) >= input.maximumActiveSources) {
        throw new ResearchMetadataError(
          "RESEARCH_ADMISSION_SATURATED",
          "Too many active unregistered Alpha import sources exist for this actor; wait for expiry or register one.",
          503,
        );
      }
      await client.query(
        `INSERT INTO research.import_sources
           (workspace_id, source_file_ref, actor_user_id, original_filename,
            source_bytes, source_digest, source_schema_version, analysis_digest,
            declared_contract, parsed_mirror, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'research.alpha-source.v1', $7,
                 $8::jsonb, $9::jsonb, $10)`,
        [
          scope.workspaceId,
          input.sourceFileRef,
          scope.actorUserId,
          input.originalFilename,
          input.sourceBytes,
          input.sourceDigest,
          input.analysisDigest,
          JSON.stringify(input.declaredContract),
          JSON.stringify(mirror),
          input.expiresAt,
        ],
      );
      await this.audit(client, scope, "ALPHA_IMPORT_SOURCE_PARSED", "alpha_import_source", input.sourceFileRef, {
        source_digest: input.sourceDigest,
        analysis_digest: input.analysisDigest,
        expires_at: input.expiresAt.toISOString(),
      });
      return {
        sourceFileRef: input.sourceFileRef,
        originalFilename: input.originalFilename,
        sourceBytes: Buffer.from(input.sourceBytes),
        sourceDigest: input.sourceDigest,
        analysisDigest: input.analysisDigest,
        declaredContract: input.declaredContract,
        parsedMirror: mirror,
        expiresAt: input.expiresAt,
      };
    });
  }

  /** Read exact P07 source bytes only for the actor that created the opaque ref. */
  async loadAlphaImportSource(scope: ResearchScope, sourceFileRef: string): Promise<ResearchAlphaImportSourceRecord> {
    this.assertScope(scope);
    requireOpaqueId(sourceFileRef, "sourceFileRef");
    return this.withScopedRead(scope, async (client) => {
      const result = await client.query<AlphaImportSourceRow>(
        `SELECT source_file_ref, original_filename, source_bytes, source_digest,
                analysis_digest, declared_contract, parsed_mirror, expires_at
           FROM research.import_sources
          WHERE workspace_id = $1
            AND source_file_ref = $2
            AND actor_user_id = $3`,
        [scope.workspaceId, sourceFileRef, scope.actorUserId],
      );
      const row = result.rows[0];
      if (!row) {
        // Do not reveal whether a different user in this workspace owns the
        // ref.  Cross-user and cross-workspace use both look identical.
        throw new ResearchMetadataError("RESEARCH_ALPHA_IMPORT_SOURCE_NOT_FOUND", "Alpha import source was not found.", 404);
      }
      if (row.expires_at.getTime() <= Date.now()) {
        throw new ResearchMetadataError("RESEARCH_ALPHA_IMPORT_SOURCE_EXPIRED", "Alpha import source has expired; parse the file again.", 409);
      }
      return {
        sourceFileRef: row.source_file_ref,
        originalFilename: row.original_filename,
        sourceBytes: Buffer.from(row.source_bytes),
        sourceDigest: row.source_digest,
        analysisDigest: row.analysis_digest,
        declaredContract: decodeObject(row.declared_contract, "Alpha source contract"),
        parsedMirror: decodeMirror(row.parsed_mirror),
        expiresAt: row.expires_at,
      };
    });
  }

  /** Persist one bounded seven-gate receipt tied to exact source+analysis bytes. */
  async recordAlphaImportGates(
    scope: ResearchScope,
    input: ResearchAlphaImportGateReceiptInput,
  ): Promise<void> {
    this.assertScope(scope);
    requireOpaqueId(input.importSessionId, "importSessionId");
    requireOpaqueId(input.sourceFileRef, "sourceFileRef");
    requireDigest(input.sourceDigest, "sourceDigest");
    requireDigest(input.sourceAnalysisDigest, "sourceAnalysisDigest");
    requireBoundedObject(input.gateResults, "alpha import gates", RESEARCH_DB_BUDGET.maxAlphaImportMirrorBytes);
    requireFiniteDate(input.expiresAt, "gate receipt expiry");

    await this.withScopedWrite(scope, async (client) => {
      const source = await this.assertLiveOwnedAlphaImportSource(client, scope, input.sourceFileRef);
      if (source.source_digest !== input.sourceDigest || source.analysis_digest !== input.sourceAnalysisDigest) {
        throw new ResearchMetadataError(
          "RESEARCH_ALPHA_IMPORT_GATES_REQUIRED",
          "The source or analysis changed; run the seven gates again.",
          409,
        );
      }
      if (input.expiresAt.getTime() > source.expires_at.getTime() || input.expiresAt.getTime() <= Date.now()) {
        throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "Gate receipt expiry must remain within the live source lease.", 400);
      }
      await client.query(
        `INSERT INTO research.import_sessions
           (workspace_id, import_session_id, actor_user_id, source_file_ref,
            source_digest, source_analysis_digest, validation_version,
            gate_results, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'research.alpha-import-gates.v1', $7::jsonb, $8)`,
        [
          scope.workspaceId,
          input.importSessionId,
          scope.actorUserId,
          input.sourceFileRef,
          input.sourceDigest,
          input.sourceAnalysisDigest,
          JSON.stringify(input.gateResults),
          input.expiresAt,
        ],
      );
      await this.audit(client, scope, "ALPHA_IMPORT_GATES_RECORDED", "alpha_import_session", input.importSessionId, {
        source_file_ref: input.sourceFileRef,
        source_digest: input.sourceDigest,
        all_pass: input.gateResults.all_pass === true,
      });
    });
  }

  /**
   * Atomic DRAFT registration: source custody, gate receipt, digest claim and
   * immutable AlphaVersion identity all commit together under a digest lock.
   */
  async registerImportedAlphaVersion(
    scope: ResearchScope,
    input: ResearchAlphaImportRegistrationInput,
  ): Promise<ResearchAlphaImportRegistration> {
    this.assertScope(scope);
    requireAlphaId(input.alphaId);
    requireText(input.name, "alpha name", 240);
    requireText(input.executionSubjectId, "executionSubjectId", 240);
    requireOpaqueId(input.alphaVersionId, "alphaVersionId");
    requireText(input.versionLabel, "versionLabel", 128);
    requireOpaqueId(input.sourceFileRef, "sourceFileRef");
    requireDigest(input.sourceDigest, "sourceDigest");
    requireDigest(input.analysisDigest, "analysisDigest");
    if (input.gateReceiptId) requireOpaqueId(input.gateReceiptId, "gateReceiptId");
    requireText(input.entrypoint, "entrypoint", 128);
    requireText(input.dependencyRef, "dependencyRef", 512);
    requireBoundedObject(input.declaredContract, "declared alpha contract", RESEARCH_DB_BUDGET.maxConfigJsonBytes);

    return this.withScopedWrite(scope, async (client) => {
      const source = await this.assertLiveOwnedAlphaImportSource(client, scope, input.sourceFileRef);
      if (source.source_digest !== input.sourceDigest || source.analysis_digest !== input.analysisDigest) {
        throw new ResearchMetadataError(
          "RESEARCH_ALPHA_IMPORT_GATES_REQUIRED",
          "The source or parser revision changed; parse and gate the exact bytes again.",
          409,
        );
      }
      const sourceContractMatches = await client.query<{ matches: boolean }>(
        `SELECT declared_contract = $3::jsonb AS matches
           FROM research.import_sources
          WHERE workspace_id = $1 AND source_file_ref = $2`,
        [scope.workspaceId, input.sourceFileRef, JSON.stringify(input.declaredContract)],
      );
      if (sourceContractMatches.rows[0]?.matches !== true) {
        throw new ResearchMetadataError(
          "RESEARCH_ALPHA_IMPORT_GATES_REQUIRED",
          "Client-provided Alpha contract does not match the server-parsed source.",
          409,
        );
      }
      await this.assertPassingGateReceipt(client, scope, input);
      // The digest is the cross-alpha uniqueness authority.  Advisory locking
      // avoids a check-then-insert race without widening the runtime role.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2))", [scope.workspaceId, input.sourceDigest]);

      const existingClaim = await client.query<{ alpha_id: string; alpha_version_id: string }>(
        `SELECT alpha_id, alpha_version_id
           FROM research.alpha_digest_claims
          WHERE workspace_id = $1 AND source_digest = $2`,
        [scope.workspaceId, input.sourceDigest],
      );
      if (existingClaim.rows[0] &&
          (existingClaim.rows[0].alpha_id !== input.alphaId || existingClaim.rows[0].alpha_version_id !== input.alphaVersionId)) {
        throw new ResearchMetadataError(
          "RESEARCH_ALPHA_IMPORT_DIGEST_ALREADY_REGISTERED",
          `Identical artifact already registered as ${existingClaim.rows[0].alpha_version_id}; re-registering is forbidden; bump the code, not the label.`,
          409,
        );
      }

      await client.query(
        `INSERT INTO research.alphas
           (workspace_id, alpha_id, name, owner_user_id, execution_subject_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (workspace_id, alpha_id) DO NOTHING`,
        [scope.workspaceId, input.alphaId, input.name, scope.actorUserId, input.executionSubjectId],
      );
      const alpha = await client.query<AlphaImportAlphaRow & {
        name: string; owner_user_id: string; execution_subject_id: string;
      }>(
        `SELECT active_version_id, revision, name, owner_user_id, execution_subject_id
           FROM research.alphas
          WHERE workspace_id = $1 AND alpha_id = $2 FOR UPDATE`,
        [scope.workspaceId, input.alphaId],
      );
      const alphaRow = alpha.rows[0];
      if (!alphaRow || alphaRow.name !== input.name || alphaRow.owner_user_id !== scope.actorUserId ||
          alphaRow.execution_subject_id !== input.executionSubjectId) {
        throw new ResearchMetadataError(
          "RESEARCH_IMMUTABLE_ALPHA_VERSION_CONFLICT",
          "That Alpha identity is already bound to different immutable metadata.",
          409,
        );
      }

      const inserted = await client.query<{ alpha_version_id: string }>(
        `INSERT INTO research.alpha_versions
           (workspace_id, alpha_version_id, alpha_id, code_digest, entrypoint,
            dependency_ref, declared_contract, source_file_ref, lifecycle_state,
            registered_by_user_id, supersedes_alpha_version_id, supersedes_recorded)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, 'DRAFT', $9, $10, true)
         ON CONFLICT (workspace_id, alpha_version_id) DO NOTHING
         RETURNING alpha_version_id`,
        [
          scope.workspaceId,
          input.alphaVersionId,
          input.alphaId,
          input.sourceDigest,
          input.entrypoint,
          input.dependencyRef,
          JSON.stringify(input.declaredContract),
          input.sourceFileRef,
          scope.actorUserId,
          alphaRow.active_version_id,
        ],
      );

      let replayed = false;
      let registrationPredecessor = alphaRow.active_version_id;
      if (inserted.rowCount === 0) {
        const existing = await client.query<AlphaImportVersionRow>(
          `SELECT alpha_id, alpha_version_id, source_file_ref, code_digest,
                  entrypoint, dependency_ref, lifecycle_state,
                  supersedes_alpha_version_id, supersedes_recorded,
                  declared_contract = $3::jsonb AS matches_declared_contract
             FROM research.alpha_versions
            WHERE workspace_id = $1 AND alpha_version_id = $2`,
          [scope.workspaceId, input.alphaVersionId, JSON.stringify(input.declaredContract)],
        );
        const row = existing.rows[0];
        if (!row || row.alpha_id !== input.alphaId || row.source_file_ref !== input.sourceFileRef ||
            row.code_digest !== input.sourceDigest || row.entrypoint !== input.entrypoint ||
            row.dependency_ref !== input.dependencyRef || !row.matches_declared_contract) {
          throw new ResearchMetadataError(
            "RESEARCH_IMMUTABLE_ALPHA_VERSION_CONFLICT",
            "An Alpha version ID cannot be rebound to different source bytes or contract metadata.",
            409,
          );
        }
        if (!row.supersedes_recorded) {
          throw new ResearchMetadataError("RESEARCH_IMMUTABLE_ALPHA_VERSION_CONFLICT", "Historical Alpha lineage was not recorded; replay cannot infer it.", 409);
        }
        registrationPredecessor = row.supersedes_alpha_version_id;
        replayed = true;
      }

      const claimed = await client.query<{ alpha_version_id: string }>(
        `INSERT INTO research.alpha_digest_claims
           (workspace_id, source_digest, alpha_id, alpha_version_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (workspace_id, source_digest) DO NOTHING
         RETURNING alpha_version_id`,
        [scope.workspaceId, input.sourceDigest, input.alphaId, input.alphaVersionId],
      );
      if (claimed.rowCount === 0 && !existingClaim.rows[0]) {
        // The advisory lock makes this branch exceptional (e.g. a manual DB
        // intervention). Re-read and fail closed rather than claiming success.
        const claim = await client.query<{ alpha_id: string; alpha_version_id: string }>(
          `SELECT alpha_id, alpha_version_id FROM research.alpha_digest_claims
            WHERE workspace_id = $1 AND source_digest = $2`,
          [scope.workspaceId, input.sourceDigest],
        );
        if (!claim.rows[0] || claim.rows[0].alpha_id !== input.alphaId || claim.rows[0].alpha_version_id !== input.alphaVersionId) {
          throw new ResearchMetadataError(
            "RESEARCH_ALPHA_IMPORT_DIGEST_ALREADY_REGISTERED",
            "The source digest is already claimed by another immutable AlphaVersion.",
            409,
          );
        }
      }
      if (!replayed) {
        await this.audit(client, scope, "ALPHA_VERSION_REGISTERED", "alpha_version", input.alphaVersionId, {
          alpha_id: input.alphaId,
          source_digest: input.sourceDigest,
          source_file_ref: input.sourceFileRef,
          version_label: input.versionLabel,
        });
      }
      return {
        alphaId: input.alphaId,
        alphaVersionId: input.alphaVersionId,
        sourceDigest: input.sourceDigest,
        supersedes: registrationPredecessor,
        alphaRevision: asNumber(alphaRow.revision),
        replayed,
      };
    });
  }

  /** DRAFT → ACTIVE metadata CAS; no run/attempt binding is ever rewritten. */
  async activateImportedAlphaVersion(
    scope: ResearchScope,
    input: { alphaVersionId: string; expectedAlphaRevision: number },
  ): Promise<ResearchAlphaActivation> {
    this.assertScope(scope);
    requireOpaqueId(input.alphaVersionId, "alphaVersionId");
    requirePositiveSafeInteger(input.expectedAlphaRevision, "expectedAlphaRevision");
    return this.withScopedWrite(scope, async (client) => {
      const target = await client.query<AlphaImportVersionRow>(
        `SELECT alpha_id, alpha_version_id, source_file_ref, code_digest,
                entrypoint, dependency_ref, lifecycle_state,
                true AS matches_declared_contract
           FROM research.alpha_versions
          WHERE workspace_id = $1 AND alpha_version_id = $2`,
        [scope.workspaceId, input.alphaVersionId],
      );
      const targetRow = target.rows[0];
      if (!targetRow || targetRow.source_file_ref == null) {
        throw new ResearchMetadataError("RESEARCH_ALPHA_IMPORT_SOURCE_NOT_FOUND", "Imported Alpha version was not found.", 404);
      }
      const alpha = await client.query<AlphaImportAlphaRow>(
        `SELECT active_version_id, revision
           FROM research.alphas
          WHERE workspace_id = $1 AND alpha_id = $2`,
        [scope.workspaceId, targetRow.alpha_id],
      );
      const alphaRow = alpha.rows[0];
      if (!alphaRow) {
        throw new ResearchMetadataError("RESEARCH_ALPHA_IMPORT_SOURCE_NOT_FOUND", "Imported Alpha version was not found.", 404);
      }
      if (alphaRow.active_version_id === input.alphaVersionId) {
        return {
          alphaId: targetRow.alpha_id,
          alphaVersionId: input.alphaVersionId,
          supersededAlphaVersionId: null,
          alphaRevision: asNumber(alphaRow.revision),
          replayed: true,
        };
      }
      if (targetRow.lifecycle_state !== "DRAFT") {
        throw new ResearchMetadataError(
          "RESEARCH_ALPHA_IMPORT_ACTIVATION_CONFLICT",
          "Only a DRAFT imported AlphaVersion may be activated.",
          409,
        );
      }
      const switched = await client.query<{ revision: string | number }>(
        `UPDATE research.alphas
            SET active_version_id = $3, revision = revision + 1, updated_at = now()
          WHERE workspace_id = $1 AND alpha_id = $2 AND revision = $4
          RETURNING revision`,
        [scope.workspaceId, targetRow.alpha_id, input.alphaVersionId, input.expectedAlphaRevision],
      );
      if (switched.rowCount !== 1) {
        throw new ResearchMetadataError(
          "RESEARCH_ALPHA_IMPORT_ACTIVATION_CONFLICT",
          "The Alpha registry changed in another request. Refresh before activating.",
          409,
        );
      }
      if (alphaRow.active_version_id) {
        await client.query(
          `UPDATE research.alpha_versions
              SET lifecycle_state = 'SUPERSEDED', metadata_revision = metadata_revision + 1
            WHERE workspace_id = $1 AND alpha_version_id = $2 AND lifecycle_state = 'ACTIVE'`,
          [scope.workspaceId, alphaRow.active_version_id],
        );
      }
      await client.query(
        `UPDATE research.alpha_versions
            SET lifecycle_state = 'ACTIVE', metadata_revision = metadata_revision + 1
          WHERE workspace_id = $1 AND alpha_version_id = $2 AND lifecycle_state = 'DRAFT'`,
        [scope.workspaceId, input.alphaVersionId],
      );
      await this.audit(client, scope, "ALPHA_VERSION_ACTIVATED", "alpha_version", input.alphaVersionId, {
        alpha_id: targetRow.alpha_id,
        superseded_alpha_version_id: alphaRow.active_version_id,
      });
      return {
        alphaId: targetRow.alpha_id,
        alphaVersionId: input.alphaVersionId,
        supersededAlphaVersionId: alphaRow.active_version_id,
        alphaRevision: asNumber(switched.rows[0].revision),
        replayed: false,
      };
    });
  }

  /** Safe registry strip: never return raw source bytes or opaque file refs. */
  async listImportedAlphaVersions(scope: ResearchScope, alphaId?: string): Promise<ResearchAlphaRegistryRecord[]> {
    this.assertScope(scope);
    if (alphaId !== undefined) requireAlphaId(alphaId);
    return this.withScopedRead(scope, async (client) => {
      const result = await client.query<AlphaImportRegistryRow>(
        `SELECT version.alpha_id, version.alpha_version_id,
                COALESCE('av_' || replace(version.declared_contract->>'version', '.', '_'), version.alpha_version_id) AS version_label,
                version.lifecycle_state,
                version.entrypoint,
                version.declared_contract,
                alpha.name AS display_name,
                COALESCE(source.source_digest, version.code_digest) AS source_digest,
                version.supersedes_alpha_version_id,
                version.supersedes_recorded,
                substring(COALESCE(source.source_digest, version.code_digest) FROM 1 FOR 12) AS source_digest_prefix,
                alpha.revision AS alpha_revision,
                version.registered_at
           FROM research.alpha_versions version
           JOIN research.alphas alpha
             ON alpha.workspace_id = version.workspace_id AND alpha.alpha_id = version.alpha_id
           LEFT JOIN research.import_sources source
             ON source.workspace_id = version.workspace_id AND source.source_file_ref = version.source_file_ref
          WHERE version.workspace_id = $1
            -- P07 imported versions retain a source receipt. P10's one
            -- installed P04 binding is also safe to disclose as a declaration
            -- only: it is explicitly bound, never exposes source/path/bytes,
            -- and lets Screen 02 choose its one admitted version by typed ID.
            AND (
              version.source_file_ref IS NOT NULL
              OR EXISTS (
                SELECT 1
                  FROM research.execution_adapter_bindings binding
                 WHERE binding.workspace_id = version.workspace_id
                   AND binding.alpha_version_id = version.alpha_version_id
              )
            )
            AND ($2::text IS NULL OR version.alpha_id = $2)
          ORDER BY version.registered_at DESC, version.alpha_version_id DESC
          LIMIT 200`,
        [scope.workspaceId, alphaId ?? null],
      );
      return result.rows.map((row) => ({
        alphaId: row.alpha_id,
        alphaVersionId: row.alpha_version_id,
        displayName: row.display_name,
        sourceDigest: row.source_digest,
        versionLabel: row.version_label,
        lifecycleState: row.lifecycle_state,
        supersedes: row.supersedes_alpha_version_id,
        supersedesRecorded: row.supersedes_recorded,
        entrypoint: row.entrypoint,
        declaredContract: decodeObject(row.declared_contract, "AlphaVersion declared contract"),
        sourceDigestPrefix: row.source_digest_prefix,
        alphaRevision: asNumber(row.alpha_revision),
        registeredAt: row.registered_at,
      }));
    });
  }

  /**
   * P08 reads only the server-parsed data requirements attached to the exact
   * imported AlphaVersion.  It deliberately never returns source bytes, paths
   * or parser mirrors, and it proves the alpha/version pair is workspace-local
   * before the private historical-data adapter is called.
   */
  async loadAlphaVersionDataContract(
    scope: ResearchScope,
    alphaId: string,
    alphaVersionId: string,
  ): Promise<ResearchAlphaVersionDataContract> {
    this.assertScope(scope);
    requireAlphaId(alphaId);
    requireOpaqueId(alphaVersionId, "alphaVersionId");
    return this.withScopedRead(scope, async (client) => {
      const result = await client.query<AlphaVersionDataContractRow>(
        `SELECT version.alpha_id, version.alpha_version_id, version.entrypoint, version.declared_contract
           FROM research.alpha_versions version
          WHERE version.workspace_id = $1
            AND version.alpha_id = $2
            AND version.alpha_version_id = $3
            -- P07 imported versions retain a source receipt. P10's one
            -- server-installed Delta version has no user source at all, but
            -- it is safe to use for P08 only when an immutable adapter
            -- binding explicitly names it.
            AND (
              version.source_file_ref IS NOT NULL
              OR EXISTS (
                SELECT 1
                  FROM research.execution_adapter_bindings binding
                 WHERE binding.workspace_id = version.workspace_id
                   AND binding.alpha_version_id = version.alpha_version_id
              )
            )`,
        [scope.workspaceId, alphaId, alphaVersionId],
      );
      const row = result.rows[0];
      if (!row) {
        throw new ResearchMetadataError("RESEARCH_PREFLIGHT_NOT_FOUND", "The bound AlphaVersion was not found.", 404);
      }
      return {
        alphaId: row.alpha_id,
        alphaVersionId: row.alpha_version_id,
        declaredContract: decodeObject(row.declared_contract, "AlphaVersion data contract"),
        entrypoint: row.entrypoint,
      };
    });
  }

  /**
   * P10's executor truth boundary.  An ACTIVE imported AlphaVersion alone is
   * not executable: only a server-installed binding can name an actual
   * allowlisted child adapter.  This read never returns source bytes or paths.
   */
  async loadRunAdapterEligibility(
    scope: ResearchScope,
    alphaId: string,
    alphaVersionId: string,
  ): Promise<{
    alphaId: string;
    alphaVersionId: string;
    lifecycleState: "DRAFT" | "ACTIVE" | "SUPERSEDED" | "ABANDONED";
    declaredContract: Record<string, unknown>;
    binding: ResearchExecutionAdapterBinding | null;
  } | null> {
    this.assertScope(scope);
    requireAlphaId(alphaId);
    requireOpaqueId(alphaVersionId, "alphaVersionId");
    return this.withScopedRead(scope, async (client) => {
      const result = await client.query<ExecutionAdapterBindingRow>(
        `SELECT version.alpha_id, version.alpha_version_id, version.lifecycle_state,
                version.declared_contract, binding.adapter_id, binding.contract_digest
           FROM research.alpha_versions version
           LEFT JOIN research.execution_adapter_bindings binding
             ON binding.workspace_id = version.workspace_id
            AND binding.alpha_version_id = version.alpha_version_id
          WHERE version.workspace_id = $1
            AND version.alpha_id = $2
            AND version.alpha_version_id = $3`,
        [scope.workspaceId, alphaId, alphaVersionId],
      );
      const row = result.rows[0];
      if (!row) return null;
      const declaredContract = decodeObject(row.declared_contract, "Research AlphaVersion execution contract");
      const binding = row.adapter_id === "p04.delta-rsi.v1" && typeof row.contract_digest === "string"
        ? {
            alphaId: row.alpha_id,
            alphaVersionId: row.alpha_version_id,
            adapterId: row.adapter_id,
            contractDigest: row.contract_digest,
          } satisfies ResearchExecutionAdapterBinding
        : null;
      return {
        alphaId: row.alpha_id,
        alphaVersionId: row.alpha_version_id,
        lifecycleState: row.lifecycle_state,
        declaredContract,
        binding,
      };
    });
  }

  /**
   * Persist the P10 bridge after the immutable attempt/job identities already
   * exist.  There is no acknowledgement before this record is present, and a
   * retry with the same client intent must either return this exact identity or
   * fail a typed payload-conflict check.
   */
  async createOrReplayRunProducer(
    scope: ResearchScope,
    input: ResearchRunProducerInput,
  ): Promise<{ producer: ResearchRunProducerRecord; replayed: boolean }> {
    this.assertScope(scope);
    this.assertRunProducerInput(input);
    return this.withScopedWrite(scope, async (client) => {
      const inserted = await client.query<RunProducerRow>(
        `INSERT INTO research.run_producers
           (workspace_id, run_id, attempt_id, job_id, actor_user_id, client_intent_id,
            intent_kind, preflight_token, alpha_id, alpha_version_id,
            execution_adapter_id, adapter_contract_digest,
            requested_spec_digest, effective_spec_digest, dataset_binding_digest,
            manifest_digest, snapshot_id, snapshot_content_hash, work_digest,
            legacy_request, execution_profile_id, execution_profile_digest)
         VALUES ($1, $2, $3, $4, $5, $6,
                 $7, $8, $9, $10, $11, $12,
                 $13, $14, $15, $16, $17, $18, $19, $20::jsonb, $21, $22)
         ON CONFLICT (workspace_id, client_intent_id) DO NOTHING
         RETURNING run_id, attempt_id, job_id, client_intent_id, alpha_id,
                   alpha_version_id, execution_adapter_id, adapter_contract_digest,
                   requested_spec_digest, effective_spec_digest,
                   dataset_binding_digest, manifest_digest, snapshot_id,
                   snapshot_content_hash, work_digest, legacy_request,
                   dispatch_state, worker_attempt_id, lease_epoch, portal_receipt,
                   execution_profile_id, execution_profile_digest`,
        [
          scope.workspaceId, input.runId, input.attemptId, input.jobId,
          scope.actorUserId, input.clientIntentId, input.intentKind,
          input.preflightToken, input.alphaId, input.alphaVersionId,
          input.executionAdapterId, input.adapterContractDigest,
          input.requestedSpecDigest, input.effectiveSpecDigest,
          input.datasetBindingDigest, input.manifestDigest, input.snapshotId,
          input.snapshotContentHash, input.workDigest, JSON.stringify(input.legacyRequest),
          input.executionProfileId ?? P04_FIXED_QUALIFICATION_PROFILE_ID, input.executionProfileDigest ?? null,
        ],
      );
      if (inserted.rowCount === 1 && inserted.rows[0]) {
        await this.audit(client, scope, "RESEARCH_RUN_PRODUCER_ACCEPTED", "run", input.runId, {
          client_intent_id: input.clientIntentId,
          job_id: input.jobId,
          preflight_token: input.preflightToken,
          execution_adapter_id: input.executionAdapterId,
          work_digest: input.workDigest,
        });
        return { producer: rowToRunProducer(inserted.rows[0]), replayed: false };
      }
      const existing = await client.query<RunProducerRow>(
        `SELECT run_id, attempt_id, job_id, client_intent_id, alpha_id,
                alpha_version_id, execution_adapter_id, adapter_contract_digest,
                requested_spec_digest, effective_spec_digest,
                dataset_binding_digest, manifest_digest, snapshot_id,
                snapshot_content_hash, work_digest, legacy_request,
                dispatch_state, worker_attempt_id, lease_epoch, portal_receipt,
                execution_profile_id, execution_profile_digest
           FROM research.run_producers
          WHERE workspace_id = $1 AND client_intent_id = $2`,
        [scope.workspaceId, input.clientIntentId],
      );
      const row = existing.rows[0];
      if (!row) {
        throw new ResearchMetadataError(
          "RESEARCH_CONCURRENT_TRANSACTION",
          "The Research producer could not be re-read after a concurrent write.",
          503,
        );
      }
      const producer = rowToRunProducer(row);
      if (!this.matchesRunProducer(producer, input)) {
        throw new ResearchMetadataError(
          "RESEARCH_IDEMPOTENCY_PAYLOAD_CONFLICT",
          "That client intent is already bound to a different Research run request.",
          409,
        );
      }
      await this.audit(client, scope, "RESEARCH_RUN_PRODUCER_REPLAYED", "run", producer.runId, {
        client_intent_id: input.clientIntentId,
        job_id: producer.jobId,
        dispatch_state: producer.dispatchState,
      });
      return { producer, replayed: true };
    });
  }

  /**
   * P10's all-or-nothing browser acceptance boundary.
   *
   * The attempt, logical run, durable job and producer bridge commit in one
   * scoped PostgreSQL transaction.  A process death therefore leaves either
   * no accepted browser intent or a complete retryable identity -- never an
   * orphan job that a later scheduler could accidentally execute.
   */
  async createOrReplayRunProducerIntent(
    scope: ResearchScope,
    input: ResearchRunProducerInput,
  ): Promise<{ producer: ResearchRunProducerRecord; replayed: boolean }> {
    this.assertScope(scope);
    this.assertRunProducerInput(input);
    return this.withScopedWrite(scope, async (client) => {
      const attempt = await client.query<ExistingAttemptRow>(
        `INSERT INTO research.attempts
           (workspace_id, attempt_id, alpha_version_id, parent_attempt_id,
            client_intent_id, request_payload_digest, intent_kind, reason,
            space_signature, state, created_by_user_id)
         VALUES ($1, $2, $3, NULL, $4, $5, $6, NULL, NULL, 'DRAFT', $7)
         ON CONFLICT (workspace_id, client_intent_id) DO NOTHING
         RETURNING workspace_id, attempt_id, client_intent_id, draft_revision,
                   state, alpha_version_id, request_payload_digest`,
        [
          scope.workspaceId, input.attemptId, input.alphaVersionId,
          input.clientIntentId, input.requestPayloadDigest, input.intentKind,
          scope.actorUserId,
        ],
      );

      if (attempt.rowCount === 1 && attempt.rows[0]) {
        await client.query(
          `INSERT INTO research.runs
             (workspace_id, run_id, attempt_id, run_kind, relationship_kind,
              logical_run_key, request_spec_digest, effective_spec_digest,
              engine_release_id, dataset_binding_digest, state, submitted_by_user_id)
           VALUES ($1, $2, $3, 'PRIMARY', 'PRIMARY', 'primary',
                   $4, $5, $6, $7, 'QUEUED', $8)`,
          [
            scope.workspaceId, input.runId, input.attemptId,
            input.requestedSpecDigest, input.effectiveSpecDigest,
            input.engineReleaseId, input.datasetBindingDigest, scope.actorUserId,
          ],
        );
        await client.query(
          `INSERT INTO research.jobs
             (workspace_id, job_id, run_id, command_id, logical_work_key, work_digest,
              job_kind, readiness_class, queue_class, cost_estimate, resource_class,
              attempt_limit, state, requested_by_user_id)
           VALUES ($1, $2, $3, $4, 'primary', $5,
                   'PRIMARY', 'MANDATORY', $6, $7::jsonb, $8, $9, 'QUEUED', $10)`,
          [
            scope.workspaceId, input.jobId, input.runId, input.commandId,
            input.workDigest, input.queueClass,
            JSON.stringify(this.jobCostDatabaseShape(input.cost)), input.resourceClass,
            input.attemptLimit, scope.actorUserId,
          ],
        );
        const producer = await client.query<RunProducerRow>(
          `INSERT INTO research.run_producers
             (workspace_id, run_id, attempt_id, job_id, actor_user_id, client_intent_id,
              intent_kind, preflight_token, alpha_id, alpha_version_id,
              execution_adapter_id, adapter_contract_digest,
              requested_spec_digest, effective_spec_digest, dataset_binding_digest,
              manifest_digest, snapshot_id, snapshot_content_hash, work_digest,
              legacy_request, execution_profile_id, execution_profile_digest)
           VALUES ($1, $2, $3, $4, $5, $6,
                   $7, $8, $9, $10, $11, $12,
                   $13, $14, $15, $16, $17, $18, $19, $20::jsonb, $21, $22)
           RETURNING run_id, attempt_id, job_id, client_intent_id, alpha_id,
                     alpha_version_id, execution_adapter_id, adapter_contract_digest,
                     requested_spec_digest, effective_spec_digest,
                     dataset_binding_digest, manifest_digest, snapshot_id,
                     snapshot_content_hash, work_digest, legacy_request,
                     dispatch_state, worker_attempt_id, lease_epoch, portal_receipt,
                   execution_profile_id, execution_profile_digest`,
          [
            scope.workspaceId, input.runId, input.attemptId, input.jobId,
            scope.actorUserId, input.clientIntentId, input.intentKind,
            input.preflightToken, input.alphaId, input.alphaVersionId,
            input.executionAdapterId, input.adapterContractDigest,
            input.requestedSpecDigest, input.effectiveSpecDigest,
            input.datasetBindingDigest, input.manifestDigest, input.snapshotId,
            input.snapshotContentHash, input.workDigest, JSON.stringify(input.legacyRequest),
            input.executionProfileId ?? P04_FIXED_QUALIFICATION_PROFILE_ID, input.executionProfileDigest ?? null,
          ],
        );
        const row = producer.rows[0];
        if (!row) throw new ResearchMetadataError("RESEARCH_CONCURRENT_TRANSACTION", "Research producer was not recorded.", 503);
        await client.query(
          `UPDATE research.attempts SET state = 'QUEUED', updated_at = now()
            WHERE workspace_id = $1 AND attempt_id = $2`,
          [scope.workspaceId, input.attemptId],
        );
        await this.enqueueOutboxEvent(client, scope, {
          jobId: input.jobId,
          eventType: "RESEARCH_JOB_QUEUED",
          deliveryGeneration: 1,
          payload: this.outboxPayload(input.jobId, input.runId, input.queueClass, "primary", input.workDigest),
        });
        await this.recordJobEvent(client, scope, input.jobId, null, "JOB_QUEUED", {
          queue_class: input.queueClass,
          logical_work_key: "primary",
          work_digest: input.workDigest,
          producer: "research.run-producer.v1",
        });
        await this.audit(client, scope, "RESEARCH_RUN_PRODUCER_ACCEPTED", "run", input.runId, {
          client_intent_id: input.clientIntentId,
          job_id: input.jobId,
          preflight_token: input.preflightToken,
          execution_adapter_id: input.executionAdapterId,
          work_digest: input.workDigest,
        });
        return { producer: rowToRunProducer(row), replayed: false };
      }

      const existingAttempt = await client.query<ExistingAttemptRow>(
        `SELECT workspace_id, attempt_id, client_intent_id, draft_revision, state,
                alpha_version_id, request_payload_digest
           FROM research.attempts
          WHERE workspace_id = $1 AND client_intent_id = $2
          FOR UPDATE`,
        [scope.workspaceId, input.clientIntentId],
      );
      const priorAttempt = existingAttempt.rows[0];
      if (!priorAttempt) {
        throw new ResearchMetadataError("RESEARCH_CONCURRENT_TRANSACTION", "Research producer retry could not reload its durable intent.", 503);
      }
      if (priorAttempt.request_payload_digest !== input.requestPayloadDigest ||
          priorAttempt.alpha_version_id !== input.alphaVersionId) {
        throw new ResearchMetadataError("RESEARCH_IDEMPOTENCY_PAYLOAD_CONFLICT", "That client intent is already bound to a different Research request.", 409);
      }
      const existingProducer = await client.query<RunProducerRow>(
        `SELECT run_id, attempt_id, job_id, client_intent_id, alpha_id,
                alpha_version_id, execution_adapter_id, adapter_contract_digest,
                requested_spec_digest, effective_spec_digest,
                dataset_binding_digest, manifest_digest, snapshot_id,
                snapshot_content_hash, work_digest, legacy_request,
                dispatch_state, worker_attempt_id, lease_epoch, portal_receipt,
                execution_profile_id, execution_profile_digest
           FROM research.run_producers
          WHERE workspace_id = $1 AND client_intent_id = $2
          FOR UPDATE`,
        [scope.workspaceId, input.clientIntentId],
      );
      const row = existingProducer.rows[0];
      if (!row) {
        throw new ResearchMetadataError("RESEARCH_CONCURRENT_TRANSACTION", "Research intent is incomplete; it was never acknowledged and must be retried with a new intent.", 503);
      }
      const producer = rowToRunProducer(row);
      if (!this.matchesRunProducer(producer, input)) {
        throw new ResearchMetadataError("RESEARCH_IDEMPOTENCY_PAYLOAD_CONFLICT", "That client intent is already bound to a different Research run request.", 409);
      }
      await this.audit(client, scope, "RESEARCH_RUN_PRODUCER_REPLAYED", "run", producer.runId, {
        client_intent_id: input.clientIntentId,
        job_id: producer.jobId,
        dispatch_state: producer.dispatchState,
      });
      return { producer, replayed: true };
    });
  }

  /** Persist the exact P06 claim used by the P10 Portal dispatch. */
  async recordRunProducerClaim(
    scope: ResearchScope,
    input: Pick<ResearchDurableJobClaim, "jobId" | "workerAttemptId" | "leaseEpoch"> & { runId: string },
  ): Promise<ResearchRunProducerRecord> {
    this.assertScope(scope);
    this.assertClaim(input);
    requireOpaqueId(input.runId, "runId");
    return this.withScopedWrite(scope, async (client) => {
      const updated = await client.query<RunProducerRow>(
        `UPDATE research.run_producers producer
            SET worker_attempt_id = $4, lease_epoch = $5, updated_at = now()
           FROM research.jobs job
          WHERE producer.workspace_id = $1 AND producer.run_id = $2 AND producer.job_id = $3
            AND producer.dispatch_state = 'PENDING'
            -- A P10 transport-unknown retry may legitimately get a fresh P06
            -- lease after recovery. Bind only to the *current* DB-fenced job
            -- lease; never require the old, expired producer lease to match.
            AND job.workspace_id = producer.workspace_id
            AND job.job_id = producer.job_id
            AND job.current_worker_attempt_id = $4
            AND job.current_lease_epoch = $5
          RETURNING producer.run_id, producer.attempt_id, producer.job_id, producer.client_intent_id, producer.alpha_id,
                    producer.alpha_version_id, producer.execution_adapter_id, producer.adapter_contract_digest,
                    producer.requested_spec_digest, producer.effective_spec_digest,
                    producer.dataset_binding_digest, producer.manifest_digest, producer.snapshot_id,
                    producer.snapshot_content_hash, producer.work_digest, producer.legacy_request,
                    producer.dispatch_state, producer.worker_attempt_id, producer.lease_epoch, producer.portal_receipt,
                    producer.execution_profile_id, producer.execution_profile_digest`,
        [scope.workspaceId, input.runId, input.jobId, input.workerAttemptId, input.leaseEpoch],
      );
      const row = updated.rows[0];
      if (!row) {
        const existing = await client.query<RunProducerRow>(
          `SELECT run_id, attempt_id, job_id, client_intent_id, alpha_id,
                  alpha_version_id, execution_adapter_id, adapter_contract_digest,
                  requested_spec_digest, effective_spec_digest,
                  dataset_binding_digest, manifest_digest, snapshot_id,
                  snapshot_content_hash, work_digest, legacy_request,
                  dispatch_state, worker_attempt_id, lease_epoch, portal_receipt,
                  execution_profile_id, execution_profile_digest
             FROM research.run_producers
            WHERE workspace_id = $1 AND run_id = $2 AND job_id = $3`,
          [scope.workspaceId, input.runId, input.jobId],
        );
        const replay = existing.rows[0];
        if (replay && replay.worker_attempt_id === input.workerAttemptId &&
            replay.lease_epoch != null && asNumber(replay.lease_epoch) === input.leaseEpoch) {
          return rowToRunProducer(replay);
        }
        throw new ResearchMetadataError(
          "RESEARCH_JOB_STATE_CONFLICT",
          "The Research producer cannot be bound to a different worker lease.",
          409,
        );
      }
      return rowToRunProducer(row);
    });
  }

  /** Store only Portal's bounded 202 receipt after the private route accepts it. */
  async recordRunProducerDispatched(
    scope: ResearchScope,
    input: Pick<ResearchDurableJobClaim, "jobId" | "workerAttemptId" | "leaseEpoch"> & {
      runId: string;
      receipt: Record<string, unknown>;
    },
  ): Promise<ResearchRunProducerRecord> {
    this.assertScope(scope);
    this.assertClaim(input);
    requireOpaqueId(input.runId, "runId");
    requireBoundedObject(input.receipt, "Research Portal dispatch receipt", RESEARCH_DB_BUDGET.maxSmallMetadataJsonBytes);
    return this.withScopedWrite(scope, async (client) => {
      const updated = await client.query<RunProducerRow>(
        `UPDATE research.run_producers
            SET dispatch_state = 'DISPATCHED', portal_receipt = $6::jsonb,
                updated_at = now()
          WHERE workspace_id = $1 AND run_id = $2 AND job_id = $3
            AND worker_attempt_id = $4 AND lease_epoch = $5
            AND dispatch_state = 'PENDING'
          RETURNING run_id, attempt_id, job_id, client_intent_id, alpha_id,
                    alpha_version_id, execution_adapter_id, adapter_contract_digest,
                    requested_spec_digest, effective_spec_digest,
                    dataset_binding_digest, manifest_digest, snapshot_id,
                    snapshot_content_hash, work_digest, legacy_request,
                    dispatch_state, worker_attempt_id, lease_epoch, portal_receipt,
                   execution_profile_id, execution_profile_digest`,
        [scope.workspaceId, input.runId, input.jobId, input.workerAttemptId, input.leaseEpoch, JSON.stringify(input.receipt)],
      );
      const row = updated.rows[0];
      if (row) return rowToRunProducer(row);
      const existing = await client.query<RunProducerRow>(
        `SELECT run_id, attempt_id, job_id, client_intent_id, alpha_id,
                alpha_version_id, execution_adapter_id, adapter_contract_digest,
                requested_spec_digest, effective_spec_digest,
                dataset_binding_digest, manifest_digest, snapshot_id,
                snapshot_content_hash, work_digest, legacy_request,
                dispatch_state, worker_attempt_id, lease_epoch, portal_receipt,
                execution_profile_id, execution_profile_digest
           FROM research.run_producers
          WHERE workspace_id = $1 AND run_id = $2 AND job_id = $3`,
        [scope.workspaceId, input.runId, input.jobId],
      );
      const replay = existing.rows[0];
      if (replay && replay.dispatch_state === "DISPATCHED" && replay.worker_attempt_id === input.workerAttemptId &&
          replay.lease_epoch != null && asNumber(replay.lease_epoch) === input.leaseEpoch) {
        return rowToRunProducer(replay);
      }
      throw new ResearchMetadataError(
        "RESEARCH_JOB_STATE_CONFLICT",
        "The Research producer dispatch receipt no longer matches its worker lease.",
        409,
      );
    });
  }

  /**
   * P08 persists an immutable, actor-scoped manifest reference.  PostgreSQL
   * holds only bounded metadata; the shared content-addressed data snapshot
   * remains in Portal API storage and no raw market frame reaches this table.
   */
  async storePreflightManifest(
    scope: ResearchScope,
    input: ResearchPreflightManifestInput,
    maximumActiveManifests: number,
  ): Promise<ResearchPreflightManifestRecord> {
    this.assertScope(scope);
    requireOpaqueId(input.preflightToken, "preflightToken");
    if (!input.preflightToken.startsWith("rpft_")) {
      throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "preflightToken has an invalid prefix.", 400);
    }
    for (const [label, digest] of Object.entries({
      requestedSpecDigest: input.requestedSpecDigest,
      effectiveSpecDigest: input.effectiveSpecDigest,
      datasetBindingDigest: input.datasetBindingDigest,
      manifestDigest: input.manifestDigest,
    })) requireDigest(digest, label);
    for (const [label, value] of Object.entries({
      requestedSpec: input.requestedSpec,
      effectiveSpec: input.effectiveSpec,
      datasetBinding: input.datasetBinding,
      topology: input.topology,
      resourceEstimate: input.resourceEstimate,
      snapshot: input.snapshot,
    })) requireBoundedObject(value, label, RESEARCH_DB_BUDGET.maxPreflightManifestBytes);
    requireFiniteDate(input.expiresAt, "preflight expiry");
    if (input.expiresAt.getTime() <= Date.now()) {
      throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "Preflight expiry must be in the future.", 400);
    }
    requirePositiveSafeInteger(
      maximumActiveManifests,
      "maximumActiveManifests",
      RESEARCH_DB_BUDGET.maxPreflightActiveManifestsPerActor,
    );
    return this.withScopedWrite(scope, async (client) => {
      const active = await client.query<{ count: string | number }>(
        `SELECT count(*) AS count
           FROM research.preflight_manifests
          WHERE workspace_id = $1 AND actor_user_id = $2 AND expires_at > now()`,
        [scope.workspaceId, scope.actorUserId],
      );
      if (asNumber(active.rows[0]?.count ?? 0) >= maximumActiveManifests) {
        throw new ResearchMetadataError(
          "RESEARCH_ADMISSION_SATURATED",
          "Too many live Research preflight manifests exist for this actor; let one expire before creating another.",
          503,
        );
      }
      const inserted = await client.query<PreflightManifestRow>(
        `INSERT INTO research.preflight_manifests
           (workspace_id, preflight_token, actor_user_id,
            requested_spec_digest, effective_spec_digest, dataset_binding_digest, manifest_digest,
            requested_spec, effective_spec, dataset_binding, topology,
            resource_estimate, snapshot, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb,
                 $11::jsonb, $12::jsonb, $13::jsonb, $14)
         RETURNING preflight_token, requested_spec_digest, effective_spec_digest,
                   dataset_binding_digest, manifest_digest, requested_spec, effective_spec,
                   dataset_binding, topology, resource_estimate, snapshot, expires_at, created_at`,
        [
          scope.workspaceId, input.preflightToken, scope.actorUserId,
          input.requestedSpecDigest, input.effectiveSpecDigest, input.datasetBindingDigest, input.manifestDigest,
          JSON.stringify(input.requestedSpec), JSON.stringify(input.effectiveSpec), JSON.stringify(input.datasetBinding),
          JSON.stringify(input.topology), JSON.stringify(input.resourceEstimate), JSON.stringify(input.snapshot), input.expiresAt,
        ],
      );
      const row = inserted.rows[0];
      if (!row) throw new ResearchMetadataError("RESEARCH_CONCURRENT_TRANSACTION", "Preflight manifest was not recorded; retry.", 409);
      await this.audit(client, scope, "RESEARCH_PREFLIGHT_CREATED", "preflight_manifest", input.preflightToken, {
        requested_spec_digest: input.requestedSpecDigest,
        effective_spec_digest: input.effectiveSpecDigest,
        dataset_binding_digest: input.datasetBindingDigest,
        manifest_digest: input.manifestDigest,
        snapshot_id: typeof input.snapshot.snapshot_id === "string" ? input.snapshot.snapshot_id : "unknown",
        expires_at: input.expiresAt.toISOString(),
      });
      return this.preflightRecord(row);
    });
  }

  /** Actor-local token lookup; cross-user tokens intentionally look absent. */
  async loadPreflightManifest(
    scope: ResearchScope,
    preflightToken: string,
  ): Promise<ResearchPreflightManifestRecord> {
    this.assertScope(scope);
    requireOpaqueId(preflightToken, "preflightToken");
    return this.withScopedRead(scope, async (client) => {
      const result = await client.query<PreflightManifestRow>(
        `SELECT preflight_token, requested_spec_digest, effective_spec_digest,
                dataset_binding_digest, manifest_digest, requested_spec, effective_spec,
                dataset_binding, topology, resource_estimate, snapshot, expires_at, created_at
           FROM research.preflight_manifests
          WHERE workspace_id = $1 AND actor_user_id = $2 AND preflight_token = $3`,
        [scope.workspaceId, scope.actorUserId, preflightToken],
      );
      const row = result.rows[0];
      if (!row) throw new ResearchMetadataError("RESEARCH_PREFLIGHT_NOT_FOUND", "Research preflight was not found.", 404);
      if (row.expires_at.getTime() <= Date.now()) {
        throw new ResearchMetadataError("RESEARCH_PREFLIGHT_EXPIRED", "Research preflight expired; run preflight again.", 409);
      }
      return this.preflightRecord(row);
    });
  }

  /** Material requested-spec changes invalidate a prior opaque preflight token. */
  async assertPreflightManifestFresh(
    scope: ResearchScope,
    preflightToken: string,
    expectedRequestedSpecDigest: string,
  ): Promise<ResearchPreflightManifestRecord> {
    requireDigest(expectedRequestedSpecDigest, "expectedRequestedSpecDigest");
    const record = await this.loadPreflightManifest(scope, preflightToken);
    if (record.requestedSpecDigest !== expectedRequestedSpecDigest) {
      throw new ResearchMetadataError(
        "RESEARCH_PREFLIGHT_STALE",
        "Research preflight does not match the current requested spec; run preflight again.",
        409,
      );
    }
    return record;
  }

  /** Bounded metadata-only expiry cleanup. It never deletes shared snapshots. */
  async cleanupExpiredPreflightManifests(
    scope: ResearchScope,
    maximumRows: number,
  ): Promise<number> {
    this.assertScope(scope);
    requirePositiveSafeInteger(maximumRows, "maximumRows", RESEARCH_DB_BUDGET.maxPreflightCleanupRows);
    return this.withScopedWrite(scope, async (client) => {
      const deleted = await client.query(
        `DELETE FROM research.preflight_manifests
          WHERE ctid IN (
            SELECT ctid FROM research.preflight_manifests
             WHERE workspace_id = $1 AND actor_user_id = $2 AND expires_at <= now()
               -- A P10 producer pins the immutable manifest used to accept
               -- its durable intent. Expiry removes abandoned preflights,
               -- never the evidence needed to replay/recover an accepted run.
               AND NOT EXISTS (
                 SELECT 1 FROM research.run_producers producer
                  WHERE producer.workspace_id = research.preflight_manifests.workspace_id
                    AND producer.preflight_token = research.preflight_manifests.preflight_token
                    AND producer.actor_user_id = research.preflight_manifests.actor_user_id
               )
             ORDER BY expires_at ASC, preflight_token ASC
             LIMIT $3
          )`,
        [scope.workspaceId, scope.actorUserId, maximumRows],
      );
      return deleted.rowCount ?? 0;
    });
  }

  /** Gate 3 read: workspace-local digest claim, never a cross-workspace probe. */
  async findImportedAlphaDigestClaim(scope: ResearchScope, sourceDigest: string): Promise<string | null> {
    this.assertScope(scope);
    requireDigest(sourceDigest, "sourceDigest");
    return this.withScopedRead(scope, async (client) => {
      const result = await client.query<{ alpha_version_id: string }>(
        `SELECT alpha_version_id
           FROM research.alpha_digest_claims
          WHERE workspace_id = $1 AND source_digest = $2`,
        [scope.workspaceId, sourceDigest],
      );
      return result.rows[0]?.alpha_version_id ?? null;
    });
  }

  /** Bounded cleanup of only this actor's expired, unbound temporary bytes. */
  async cleanupExpiredUnboundAlphaImportSources(
    scope: ResearchScope,
    maximumRows: number,
  ): Promise<{ deletedSources: number; deletedReceipts: number }> {
    this.assertScope(scope);
    requirePositiveSafeInteger(maximumRows, "maximumRows", RESEARCH_DB_BUDGET.maxAlphaImportCleanupRows);
    return this.withScopedWrite(scope, async (client) => {
      // The runtime role deliberately has no UPDATE privilege on immutable
      // source rows.  Do not use SELECT … FOR UPDATE merely to make a cleanup
      // convenient: DELETE is already atomic, owns the needed row lock, and
      // a concurrent sweeper receives an empty RETURNING set after the first
      // transaction commits.  This preserves least privilege without making
      // expiry cleanup race into a source-retention bypass.
      const sources = await client.query<{ source_file_ref: string }>(
        `DELETE FROM research.import_sources
          WHERE (workspace_id, source_file_ref) IN (
            SELECT candidate.workspace_id, candidate.source_file_ref
              FROM research.import_sources candidate
             WHERE candidate.workspace_id = $1
               AND candidate.actor_user_id = $2
               AND candidate.expires_at <= now()
               AND NOT EXISTS (
                 SELECT 1 FROM research.alpha_versions version
                  WHERE version.workspace_id = candidate.workspace_id
                    AND version.source_file_ref = candidate.source_file_ref
               )
             ORDER BY candidate.expires_at ASC, candidate.source_file_ref ASC
             LIMIT $3
          )
            AND workspace_id = $1 AND actor_user_id = $2
            AND NOT EXISTS (
              SELECT 1 FROM research.alpha_versions version
               WHERE version.workspace_id = research.import_sources.workspace_id
                 AND version.source_file_ref = research.import_sources.source_file_ref
            )
          RETURNING source_file_ref`,
        [scope.workspaceId, scope.actorUserId, maximumRows],
      );
      const refs = sources.rows.map((row) => row.source_file_ref);
      if (refs.length === 0) return { deletedSources: 0, deletedReceipts: 0 };
      const receipts = await client.query(
        `DELETE FROM research.import_sessions
          WHERE workspace_id = $1 AND actor_user_id = $2 AND source_file_ref = ANY($3::text[])`,
        [scope.workspaceId, scope.actorUserId, refs],
      );
      await this.audit(client, scope, "ALPHA_IMPORT_TEMPORARY_SOURCE_PURGED", "alpha_import_source", "bounded-expiry-cleanup", {
        deleted_sources: sources.rowCount,
        deleted_receipts: receipts.rowCount,
      });
      return { deletedSources: sources.rowCount ?? 0, deletedReceipts: receipts.rowCount ?? 0 };
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
            cost_estimate, resource_class, logical_work_key, state, requested_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $4, 'QUEUED', $9)
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

  /**
   * P06's only new scheduler admission path.  A job is identified by its
   * logical work key as well as its command ID: duplicate broker deliveries
   * therefore cannot create a second computation or a second outbox effect.
   *
   * P10, not P06, will route the legacy browser submit path here.  Keeping
   * that producer unchanged prevents two schedulers from dispatching the same
   * existing Research run during this infrastructure phase.
   */
  async enqueueDurableJob(
    scope: ResearchScope,
    input: ResearchDurableJobInput,
  ): Promise<{ jobId: string; replayed: boolean }> {
    this.assertScope(scope);
    this.assertDurableJobInput(input);
    return this.withScopedWrite(scope, async (client) => {
      const run = await client.query<{ attempt_id: string; attempt_state: string; run_state: string }>(
        `SELECT r.attempt_id, a.state AS attempt_state, r.state AS run_state
           FROM research.runs r
           JOIN research.attempts a
             ON a.workspace_id = r.workspace_id AND a.attempt_id = r.attempt_id
          WHERE r.workspace_id = $1 AND r.run_id = $2
          FOR UPDATE OF r, a`,
        [scope.workspaceId, input.runId],
      );
      const runRow = run.rows[0];
      if (!runRow) {
        throw new ResearchMetadataError("RESEARCH_RUN_NOT_FOUND", "The Research run was not found.", 404);
      }
      if (!["DRAFT", "PREFLIGHT_VALID", "QUEUED"].includes(runRow.attempt_state) ||
          !["DRAFT", "QUEUED"].includes(runRow.run_state)) {
        throw new ResearchMetadataError(
          "RESEARCH_JOB_STATE_CONFLICT",
          "Only a preflight-valid Research draft may enter the durable scheduler.",
          409,
        );
      }

      const costEstimate = this.jobCostDatabaseShape(input.cost);
      const inserted = await client.query<{ job_id: string }>(
        `INSERT INTO research.jobs
           (workspace_id, job_id, run_id, command_id, logical_work_key, work_digest,
            job_kind, readiness_class, queue_class, cost_estimate, resource_class, attempt_limit,
            state, requested_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, 'QUEUED', $13)
         ON CONFLICT DO NOTHING
         RETURNING job_id`,
        [
          scope.workspaceId,
          input.jobId,
          input.runId,
          input.commandId,
          input.logicalWorkKey,
          input.workDigest,
          input.jobKind,
          input.readinessClass,
          input.queueClass,
          JSON.stringify(costEstimate),
          input.resourceClass,
          input.attemptLimit ?? 3,
          scope.actorUserId,
        ],
      );
      if (inserted.rowCount === 0) {
        const existing = await client.query<DurableJobRow>(
          `SELECT job_id, run_id, command_id, logical_work_key, work_digest, job_kind, readiness_class,
                  queue_class, resource_class, cost_estimate, attempt_limit,
                  cancel_version, requested_by_user_id, state
             FROM research.jobs
            WHERE workspace_id = $1
              AND (command_id = $2 OR (run_id = $3 AND logical_work_key = $4))
            FOR UPDATE`,
          [scope.workspaceId, input.commandId, input.runId, input.logicalWorkKey],
        );
        const row = existing.rows[0];
        if (existing.rows.length !== 1 || !row || !this.matchesDurableJob(row, input)) {
          throw new ResearchMetadataError(
            "RESEARCH_IDEMPOTENCY_PAYLOAD_CONFLICT",
            "That command or logical Research work key is already bound to different durable work.",
            409,
          );
        }
        await this.audit(client, scope, "RESEARCH_DURABLE_JOB_REPLAYED", "job", row.job_id, {
          original_requester_user_id: row.requested_by_user_id,
          replay_command_id: input.commandId,
          logical_work_key: input.logicalWorkKey,
          work_digest: input.workDigest,
        });
        return { jobId: row.job_id, replayed: true };
      }

      await client.query(
        `UPDATE research.attempts
            SET state = 'QUEUED', updated_at = now()
          WHERE workspace_id = $1 AND attempt_id = $2`,
        [scope.workspaceId, runRow.attempt_id],
      );
      await client.query(
        `UPDATE research.runs
            SET state = 'QUEUED', state_version = state_version + 1, updated_at = now()
          WHERE workspace_id = $1 AND run_id = $2`,
        [scope.workspaceId, input.runId],
      );
      await this.enqueueOutboxEvent(client, scope, {
        jobId: input.jobId,
        eventType: "RESEARCH_JOB_QUEUED",
        deliveryGeneration: 1,
        payload: this.outboxPayload(input.jobId, input.runId, input.queueClass, input.logicalWorkKey, input.workDigest),
      });
      await this.recordJobEvent(client, scope, input.jobId, null, "JOB_QUEUED", {
        queue_class: input.queueClass,
        logical_work_key: input.logicalWorkKey,
        work_digest: input.workDigest,
      });
      await this.audit(client, scope, "RESEARCH_DURABLE_JOB_ENQUEUED", "job", input.jobId, {
        run_id: input.runId,
        command_id: input.commandId,
        logical_work_key: input.logicalWorkKey,
        queue_class: input.queueClass,
        readiness_class: input.readinessClass,
      });
      return { jobId: input.jobId, replayed: false };
    });
  }

  /**
   * Claims at most one job.  PostgreSQL is the lease/fencing authority; this
   * method does not launch Python and has no NATS or Execution credential.
   */
  async claimNextDurableJob(
    scope: ResearchScope,
    input: { workerId: string; leaseSeconds?: number; jobId?: string },
  ): Promise<ResearchDurableJobClaim | null> {
    this.assertScope(scope);
    requireOpaqueId(input.workerId, "workerId");
    if (input.jobId != null) requireOpaqueId(input.jobId, "jobId");
    const leaseSeconds = input.leaseSeconds ?? 60;
    requirePositiveSafeInteger(leaseSeconds, "leaseSeconds", RESEARCH_SCHEDULER_BUDGET.maximumLeaseSeconds);
    return this.withScopedWrite(scope, async (client) => {
      await this.recoverExpiredDurableJobsInTransaction(client, scope);
      const candidate = await client.query<DurableJobRow>(
        `SELECT j.job_id, j.run_id, j.command_id, j.logical_work_key, j.work_digest, j.job_kind, j.readiness_class,
                j.queue_class, j.resource_class, j.cost_estimate, j.attempt_limit,
                j.cancel_version, j.requested_by_user_id, j.state
           FROM research.jobs j
          WHERE j.workspace_id = $1
            AND ($2::text IS NULL OR j.job_id = $2)
            AND (j.state = 'QUEUED' OR (j.state = 'RETRY_WAIT' AND j.retry_not_before <= now()))
            AND j.work_digest IS NOT NULL
            AND (
              j.queue_class <> 'HEAVY'
              OR NOT EXISTS (
                SELECT 1 FROM research.jobs active_heavy
                 WHERE active_heavy.workspace_id = j.workspace_id
                   AND active_heavy.queue_class = 'HEAVY'
                   AND active_heavy.state IN ('CLAIMED', 'RUNNING', 'CANCEL_REQUESTED')
              )
            )
          ORDER BY
            CASE j.queue_class WHEN 'INTERACTIVE' THEN 0 WHEN 'HEAVY' THEN 1 ELSE 2 END,
            COALESCE((SELECT fairness.last_claimed_at
                        FROM research.scheduler_fairness fairness
                       WHERE fairness.workspace_id = j.workspace_id
                         AND fairness.requested_by_user_id = j.requested_by_user_id),
                     '-infinity'::timestamptz),
            j.created_at,
            j.job_id
          FOR UPDATE SKIP LOCKED
          LIMIT 1`,
        [scope.workspaceId, input.jobId ?? null],
      );
      const job = candidate.rows[0];
      if (!job) return null;
      const state = await client.query<{ attempt_id: string; attempt_state: string; run_state: string }>(
        `SELECT r.attempt_id, a.state AS attempt_state, r.state AS run_state
           FROM research.runs r
           JOIN research.attempts a ON a.workspace_id = r.workspace_id AND a.attempt_id = r.attempt_id
          WHERE r.workspace_id = $1 AND r.run_id = $2
          FOR UPDATE OF r, a`,
        [scope.workspaceId, job.run_id],
      );
      const stateRow = state.rows[0];
      if (!stateRow || !["QUEUED", "CLAIMED"].includes(stateRow.attempt_state) ||
          !["QUEUED", "RUNNING"].includes(stateRow.run_state)) {
        throw new ResearchMetadataError(
          "RESEARCH_JOB_STATE_CONFLICT",
          "A claimable job no longer has a claimable Research run state.",
          409,
        );
      }
      const counters = await client.query<{ ordinal: string | number; lease_epoch: string | number }>(
        `SELECT COALESCE(max(ordinal), 0) + 1 AS ordinal,
                COALESCE(max(lease_epoch), 0) + 1 AS lease_epoch
           FROM research.worker_attempts
          WHERE workspace_id = $1 AND job_id = $2`,
        [scope.workspaceId, job.job_id],
      );
      const workerAttemptId = newUlid("rwa");
      const ordinal = asNumber(counters.rows[0].ordinal);
      const leaseEpoch = asNumber(counters.rows[0].lease_epoch);
      const worker = await client.query<{ expires_at: Date }>(
        `INSERT INTO research.worker_attempts
           (workspace_id, worker_attempt_id, job_id, ordinal, worker_id,
            lease_epoch, expires_at, state)
         VALUES ($1, $2, $3, $4, $5, $6, now() + $7 * interval '1 second', 'CLAIMED')
         RETURNING expires_at`,
        [scope.workspaceId, workerAttemptId, job.job_id, ordinal, input.workerId, leaseEpoch, leaseSeconds],
      );
      const expiresAt = worker.rows[0]?.expires_at;
      if (!expiresAt) throw new Error("Research durable worker claim did not return an expiry.");
      await client.query(
        `UPDATE research.jobs
            SET state = 'CLAIMED', current_worker_attempt_id = $3,
                current_lease_epoch = $4, retry_not_before = NULL, updated_at = now()
          WHERE workspace_id = $1 AND job_id = $2`,
        [scope.workspaceId, job.job_id, workerAttemptId, leaseEpoch],
      );
      await client.query(
        `UPDATE research.attempts SET state = 'CLAIMED', updated_at = now()
          WHERE workspace_id = $1 AND attempt_id = $2`,
        [scope.workspaceId, stateRow.attempt_id],
      );
      await client.query(
        `UPDATE research.runs SET state = 'RUNNING', state_version = state_version + 1, updated_at = now()
          WHERE workspace_id = $1 AND run_id = $2`,
        [scope.workspaceId, job.run_id],
      );
      await client.query(
        `INSERT INTO research.scheduler_fairness
           (workspace_id, requested_by_user_id, last_claimed_at, claim_count)
         VALUES ($1, $2, now(), 1)
         ON CONFLICT (workspace_id, requested_by_user_id)
         DO UPDATE SET last_claimed_at = EXCLUDED.last_claimed_at,
                       claim_count = research.scheduler_fairness.claim_count + 1`,
        [scope.workspaceId, job.requested_by_user_id],
      );
      await this.recordJobEvent(client, scope, job.job_id, workerAttemptId, "JOB_CLAIMED", {
        worker_id: input.workerId,
        ordinal,
        lease_epoch: leaseEpoch,
      });
      await this.audit(client, scope, "RESEARCH_DURABLE_JOB_CLAIMED", "job", job.job_id, {
        worker_attempt_id: workerAttemptId,
        lease_epoch: leaseEpoch,
        ordinal,
      });
      return {
        jobId: job.job_id,
        runId: job.run_id,
        jobKind: job.job_kind,
        workDigest: this.requireWorkDigest(job),
        readinessClass: job.readiness_class,
        queueClass: job.queue_class,
        resourceClass: job.resource_class,
        cost: decodeJobCost(job.cost_estimate),
        workerAttemptId,
        leaseEpoch,
        leaseExpiresAt: expiresAt,
        ordinal,
        cancellationVersion: asNumber(job.cancel_version),
      };
    });
  }

  async markDurableJobRunning(
    scope: ResearchScope,
    claim: Pick<ResearchDurableJobClaim, "jobId" | "workerAttemptId" | "leaseEpoch">,
  ): Promise<void> {
    this.assertScope(scope);
    this.assertClaim(claim);
    await this.withScopedWrite(scope, async (client) => {
      const worker = await client.query(
        `UPDATE research.worker_attempts wa
            SET state = 'RUNNING', updated_at = now()
           FROM research.jobs j
          WHERE wa.workspace_id = $1
            AND wa.worker_attempt_id = $2
            AND wa.lease_epoch = $3
            AND wa.state = 'CLAIMED'
            AND wa.expires_at > now()
            AND j.workspace_id = wa.workspace_id
            AND j.job_id = wa.job_id
            AND j.job_id = $4
            AND j.current_worker_attempt_id = wa.worker_attempt_id
            AND j.current_lease_epoch = wa.lease_epoch
            AND j.state = 'CLAIMED'
          RETURNING wa.worker_attempt_id`,
        [scope.workspaceId, claim.workerAttemptId, claim.leaseEpoch, claim.jobId],
      );
      if (worker.rowCount !== 1) {
        // P11's source relay is at-least-once.  A callback can time out after
        // this exact transition committed, so accepting the same current
        // RUNNING lease is necessary for recovery; a different/reclaimed
        // lease still receives the normal fence rejection.
        const replay = await client.query(
          `SELECT 1
             FROM research.worker_attempts wa
             JOIN research.jobs j
               ON j.workspace_id = wa.workspace_id AND j.job_id = wa.job_id
            WHERE wa.workspace_id = $1 AND wa.worker_attempt_id = $2
              AND wa.lease_epoch = $3 AND wa.job_id = $4 AND wa.state = 'RUNNING'
              AND j.current_worker_attempt_id = wa.worker_attempt_id
              AND j.current_lease_epoch = wa.lease_epoch AND j.state = 'RUNNING'`,
          [scope.workspaceId, claim.workerAttemptId, claim.leaseEpoch, claim.jobId],
        );
        if (replay.rowCount === 1) return;
        this.throwLeaseRejected();
      }
      await client.query(
        `UPDATE research.jobs SET state = 'RUNNING', updated_at = now()
          WHERE workspace_id = $1 AND job_id = $2`,
        [scope.workspaceId, claim.jobId],
      );
      await client.query(
        `UPDATE research.attempts a SET state = 'RUNNING', updated_at = now()
          FROM research.runs r
         WHERE a.workspace_id = $1 AND r.workspace_id = a.workspace_id
           AND a.attempt_id = r.attempt_id
           AND r.attempt_id = a.attempt_id AND r.run_id = (
             SELECT run_id FROM research.jobs WHERE workspace_id = $1 AND job_id = $2
           )`,
        [scope.workspaceId, claim.jobId],
      );
      await this.recordJobEvent(client, scope, claim.jobId, claim.workerAttemptId, "JOB_RUNNING", {});
    });
  }

  async heartbeatDurableJob(
    scope: ResearchScope,
    claim: Pick<ResearchDurableJobClaim, "jobId" | "workerAttemptId" | "leaseEpoch">,
    leaseSeconds = 60,
  ): Promise<Date> {
    this.assertScope(scope);
    this.assertClaim(claim);
    requirePositiveSafeInteger(leaseSeconds, "leaseSeconds", RESEARCH_SCHEDULER_BUDGET.maximumLeaseSeconds);
    return this.withScopedWrite(scope, async (client) => {
      const result = await client.query<{ expires_at: Date }>(
        `UPDATE research.worker_attempts wa
            SET expires_at = now() + $5 * interval '1 second', updated_at = now()
           FROM research.jobs j
          WHERE wa.workspace_id = $1
            AND wa.worker_attempt_id = $2
            AND wa.lease_epoch = $3
            AND wa.state IN ('CLAIMED', 'RUNNING')
            AND wa.expires_at > now()
            AND j.workspace_id = wa.workspace_id
            AND j.job_id = wa.job_id
            AND j.job_id = $4
            AND j.current_worker_attempt_id = wa.worker_attempt_id
            AND j.current_lease_epoch = wa.lease_epoch
            AND j.state IN ('CLAIMED', 'RUNNING')
          RETURNING wa.expires_at`,
        [scope.workspaceId, claim.workerAttemptId, claim.leaseEpoch, claim.jobId, leaseSeconds],
      );
      if (result.rowCount !== 1 || !result.rows[0]) this.throwLeaseRejected();
      return result.rows[0].expires_at;
    });
  }

  /** Request cancellation by CAS. A queued job becomes terminal immediately;
   * an active child sees CANCEL_REQUESTED and must stop before finalisation. */
  async requestDurableJobCancellation(
    scope: ResearchScope,
    input: { jobId: string; reason: string },
  ): Promise<{ terminal: boolean; cancellationVersion: number }> {
    this.assertScope(scope);
    requireOpaqueId(input.jobId, "jobId");
    requireText(input.reason, "cancellation reason", 256);
    return this.withScopedWrite(scope, async (client) => {
      const selected = await client.query<DurableJobRow & { attempt_id: string }>(
        `SELECT j.job_id, j.run_id, j.command_id, j.logical_work_key, j.work_digest, j.job_kind, j.readiness_class,
                j.queue_class, j.resource_class, j.cost_estimate, j.attempt_limit,
                j.cancel_version, j.requested_by_user_id, j.state, r.attempt_id
           FROM research.jobs j
           JOIN research.runs r ON r.workspace_id = j.workspace_id AND r.run_id = j.run_id
          WHERE j.workspace_id = $1 AND j.job_id = $2
          FOR UPDATE OF j, r`,
        [scope.workspaceId, input.jobId],
      );
      const job = selected.rows[0];
      if (!job) throw new ResearchMetadataError("RESEARCH_JOB_NOT_FOUND", "The Research job was not found.", 404);
      if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job.state)) {
        return { terminal: job.state === "CANCELLED", cancellationVersion: asNumber(job.cancel_version) };
      }
      const terminal = ["QUEUED", "RETRY_WAIT"].includes(job.state);
      const updated = await client.query<{ cancel_version: string | number }>(
        `UPDATE research.jobs
            SET state = $3,
                retry_not_before = NULL,
                cancellation_requested_at = now(),
                terminal_reason = CASE WHEN $4 THEN 'CANCELLED_BEFORE_CLAIM' ELSE terminal_reason END,
                cancel_version = cancel_version + 1,
                updated_at = now()
          WHERE workspace_id = $1 AND job_id = $2
          RETURNING cancel_version`,
        [scope.workspaceId, input.jobId, terminal ? "CANCELLED" : "CANCEL_REQUESTED", terminal],
      );
      const cancellationVersion = asNumber(updated.rows[0].cancel_version);
      if (terminal) {
        await client.query(
          `UPDATE research.attempts SET state = 'CANCELLED', updated_at = now()
            WHERE workspace_id = $1 AND attempt_id = $2`,
          [scope.workspaceId, job.attempt_id],
        );
        await client.query(
          `UPDATE research.runs SET state = 'CANCELLED', state_version = state_version + 1, updated_at = now()
            WHERE workspace_id = $1 AND run_id = $2`,
          [scope.workspaceId, job.run_id],
        );
        await this.enqueueOutboxEvent(client, scope, {
          jobId: job.job_id,
          eventType: "RESEARCH_JOB_CANCELLED",
          deliveryGeneration: cancellationVersion,
          payload: this.outboxPayload(job.job_id, job.run_id, job.queue_class, job.logical_work_key, this.requireWorkDigest(job)),
        });
      }
      await this.recordJobEvent(client, scope, job.job_id, null, terminal ? "JOB_CANCELLED" : "JOB_CANCEL_REQUESTED", {
        reason: input.reason,
        cancellation_version: cancellationVersion,
      });
      await this.audit(client, scope, terminal ? "RESEARCH_DURABLE_JOB_CANCELLED" : "RESEARCH_DURABLE_JOB_CANCEL_REQUESTED", "job", job.job_id, {
        reason: input.reason,
        cancellation_version: cancellationVersion,
      });
      return { terminal, cancellationVersion };
    });
  }

  /**
   * Commits one terminal result only if this exact worker lease still owns the
   * job. Cancellation wins over a late successful child result.
   */
  async finishDurableJob(
    scope: ResearchScope,
    input: Pick<ResearchDurableJobClaim, "jobId" | "workerAttemptId" | "leaseEpoch"> & {
      outcome: "SUCCEEDED" | "FAILED" | "CANCELLED";
      reason?: string;
      usage: ResearchWorkerUsage;
    },
  ): Promise<{ outcome: "SUCCEEDED" | "FAILED" | "CANCELLED" }> {
    this.assertScope(scope);
    this.assertClaim(input);
    if (input.reason != null) requireText(input.reason, "terminal reason", 256);
    this.assertWorkerUsage(input.usage);
    return this.withScopedWrite(scope, async (client) => {
      const selected = await client.query<DurableJobRow & { attempt_id: string }>(
        `SELECT j.job_id, j.run_id, j.command_id, j.logical_work_key, j.work_digest, j.job_kind, j.readiness_class,
                j.queue_class, j.resource_class, j.cost_estimate, j.attempt_limit,
                j.cancel_version, j.requested_by_user_id, j.state, r.attempt_id
           FROM research.jobs j
           JOIN research.runs r ON r.workspace_id = j.workspace_id AND r.run_id = j.run_id
          WHERE j.workspace_id = $1 AND j.job_id = $2
          FOR UPDATE OF j, r`,
        [scope.workspaceId, input.jobId],
      );
      const job = selected.rows[0];
      if (!job) throw new ResearchMetadataError("RESEARCH_JOB_NOT_FOUND", "The Research job was not found.", 404);
      if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job.state)) {
        // Same terminal callback after a lost HTTP acknowledgement is a no-op;
        // a conflicting terminal event remains fenced rather than rewriting
        // already sealed Research evidence.
        if (job.state === input.outcome) return { outcome: input.outcome };
        throw new ResearchMetadataError(
          "RESEARCH_JOB_STATE_CONFLICT",
          "The Research job already reached a different terminal state.",
          409,
        );
      }
      const outcome = job.state === "CANCEL_REQUESTED" ? "CANCELLED" : input.outcome;
      const worker = await client.query(
        `UPDATE research.worker_attempts
            SET state = $5,
                exit_reason = $6,
                measured_usage = $7::jsonb,
                updated_at = now()
          WHERE workspace_id = $1
            AND worker_attempt_id = $2
            AND lease_epoch = $3
            AND job_id = $4
            AND state IN ('CLAIMED', 'RUNNING')
            AND expires_at > now()
          RETURNING worker_attempt_id`,
        [
          scope.workspaceId,
          input.workerAttemptId,
          input.leaseEpoch,
          input.jobId,
          outcome,
          outcome === "SUCCEEDED" ? null : (input.reason ?? outcome),
          JSON.stringify(this.workerUsageDatabaseShape(input.usage)),
        ],
      );
      if (worker.rowCount !== 1) this.throwLeaseRejected();
      if (outcome !== "SUCCEEDED") {
        await this.abortWritingArtifactsForFence(client, scope, input.workerAttemptId, input.leaseEpoch);
      }
      await client.query(
        `UPDATE research.jobs
            SET state = $3,
                terminal_reason = $4,
                updated_at = now()
          WHERE workspace_id = $1 AND job_id = $2
            AND current_worker_attempt_id = $5 AND current_lease_epoch = $6
            AND state IN ('CLAIMED', 'RUNNING', 'CANCEL_REQUESTED')`,
        [scope.workspaceId, job.job_id, outcome, outcome === "SUCCEEDED" ? null : (input.reason ?? outcome), input.workerAttemptId, input.leaseEpoch],
      );
      const attemptState = outcome === "SUCCEEDED" ? "READY" : outcome;
      await client.query(
        `UPDATE research.attempts SET state = $3, updated_at = now()
          WHERE workspace_id = $1 AND attempt_id = $2`,
        [scope.workspaceId, job.attempt_id, attemptState],
      );
      const runState = outcome === "SUCCEEDED" ? "READY" : outcome;
      await client.query(
        `UPDATE research.runs SET state = $3, state_version = state_version + 1, updated_at = now()
          WHERE workspace_id = $1 AND run_id = $2`,
        [scope.workspaceId, job.run_id, runState],
      );
      await this.recordJobEvent(client, scope, job.job_id, input.workerAttemptId, `JOB_${outcome}`, {
        lease_epoch: input.leaseEpoch,
        cancellation_version: asNumber(job.cancel_version),
      });
      await this.audit(client, scope, "RESEARCH_DURABLE_JOB_TERMINAL", "job", job.job_id, {
        outcome,
        worker_attempt_id: input.workerAttemptId,
        lease_epoch: input.leaseEpoch,
      });
      return { outcome };
    });
  }

  /** Technical retry does not mutate the attempt/run specification. */
  async retryDurableJob(
    scope: ResearchScope,
    input: Pick<ResearchDurableJobClaim, "jobId" | "workerAttemptId" | "leaseEpoch"> & {
      reason: string;
      retryDelaySeconds?: number;
    },
  ): Promise<{ scheduled: boolean; terminal: boolean }> {
    this.assertScope(scope);
    this.assertClaim(input);
    requireText(input.reason, "retry reason", 256);
    const retryDelaySeconds = input.retryDelaySeconds ?? 1;
    requirePositiveSafeInteger(retryDelaySeconds, "retryDelaySeconds", 3_600);
    return this.withScopedWrite(scope, async (client) => this.retryDurableJobInTransaction(
      client,
      scope,
      input,
      retryDelaySeconds,
      "WORKER_RETRY",
    ));
  }

  /** Explicit recovery entry point for restart/outage reconciliation. */
  async recoverExpiredDurableJobs(scope: ResearchScope): Promise<{ recovered: number; terminal: number }> {
    this.assertScope(scope);
    return this.withScopedWrite(scope, async (client) => this.recoverExpiredDurableJobsInTransaction(client, scope));
  }

  /**
   * Claim ID-only outbox records for a publisher. Publishing and acknowledgement
   * are intentionally two calls: a transport outage never advances the job
   * state and a duplicate delivery remains harmless at the consumer boundary.
   */
  async claimDurableJobOutbox(
    scope: ResearchScope,
    input: { publisherId: string; limit?: number; leaseSeconds?: number },
  ): Promise<ResearchJobOutboxClaim[]> {
    this.assertScope(scope);
    requireOpaqueId(input.publisherId, "publisherId");
    const limit = input.limit ?? 16;
    const leaseSeconds = input.leaseSeconds ?? 30;
    requirePositiveSafeInteger(limit, "outbox limit", 128);
    requirePositiveSafeInteger(leaseSeconds, "outbox leaseSeconds", RESEARCH_SCHEDULER_BUDGET.maximumOutboxClaimSeconds);
    return this.withScopedWrite(scope, async (client) => {
      await client.query(
        `UPDATE research.job_outbox
            SET state = 'PENDING', claim_token = NULL, claim_expires_at = NULL, updated_at = now()
          WHERE workspace_id = $1 AND state = 'CLAIMED' AND claim_expires_at <= now()`,
        [scope.workspaceId],
      );
      const rows = await client.query<{
        outbox_id: string; job_id: string; event_type: ResearchJobOutboxMessage["eventType"];
        payload_digest: string; payload: Record<string, string | number>; delivery_generation: string | number;
      }>(
        `SELECT outbox_id, job_id, event_type, payload_digest, payload, delivery_generation
           FROM research.job_outbox
          WHERE workspace_id = $1 AND state = 'PENDING' AND available_at <= now()
          ORDER BY available_at, created_at, outbox_id
          FOR UPDATE SKIP LOCKED
          LIMIT $2`,
        [scope.workspaceId, limit],
      );
      const claims: ResearchJobOutboxClaim[] = [];
      for (const row of rows.rows) {
        const claimToken = newUlid("rop");
        const claimed = await client.query<{ claim_expires_at: Date }>(
          `UPDATE research.job_outbox
              SET state = 'CLAIMED', claim_token = $3,
                  claim_expires_at = now() + $4 * interval '1 second',
                  delivery_attempts = delivery_attempts + 1, updated_at = now()
            WHERE workspace_id = $1 AND outbox_id = $2 AND state = 'PENDING'
            RETURNING claim_expires_at`,
          [scope.workspaceId, row.outbox_id, claimToken, leaseSeconds],
        );
        if (claimed.rowCount !== 1 || !claimed.rows[0]) continue;
        claims.push({
          outboxId: row.outbox_id,
          jobId: row.job_id,
          eventType: row.event_type,
          payloadDigest: row.payload_digest,
          payload: row.payload,
          deliveryGeneration: asNumber(row.delivery_generation),
          claimToken,
          claimExpiresAt: claimed.rows[0].claim_expires_at,
        });
      }
      return claims;
    });
  }

  async acknowledgeDurableJobOutbox(
    scope: ResearchScope,
    input: { outboxId: string; claimToken: string },
  ): Promise<void> {
    this.assertScope(scope);
    requireOpaqueId(input.outboxId, "outboxId");
    requireOpaqueId(input.claimToken, "outbox claimToken");
    await this.withScopedWrite(scope, async (client) => {
      const acknowledged = await client.query(
        `UPDATE research.job_outbox
            SET state = 'DELIVERED', delivered_at = now(),
                claim_token = NULL, claim_expires_at = NULL, updated_at = now()
          WHERE workspace_id = $1 AND outbox_id = $2
            AND state = 'CLAIMED' AND claim_token = $3 AND claim_expires_at > now()
          RETURNING outbox_id`,
        [scope.workspaceId, input.outboxId, input.claimToken],
      );
      if (acknowledged.rowCount !== 1) {
        throw new ResearchMetadataError(
          "RESEARCH_OUTBOX_NOT_FOUND",
          "The outbox publisher lease is absent or expired; the record was not acknowledged.",
          409,
        );
      }
    });
  }

  private async retryDurableJobInTransaction(
    client: ScopedClient,
    scope: ResearchScope,
    input: Pick<ResearchDurableJobClaim, "jobId" | "workerAttemptId" | "leaseEpoch"> & { reason: string },
    retryDelaySeconds: number,
    transition: "WORKER_RETRY" | "LEASE_EXPIRED",
  ): Promise<{ scheduled: boolean; terminal: boolean }> {
    const selected = await client.query<DurableJobRow & { attempt_id: string; ordinal: string | number }>(
      `SELECT j.job_id, j.run_id, j.command_id, j.logical_work_key, j.work_digest, j.job_kind, j.readiness_class,
              j.queue_class, j.resource_class, j.cost_estimate, j.attempt_limit,
              j.cancel_version, j.requested_by_user_id, j.state, r.attempt_id, wa.ordinal
         FROM research.jobs j
         JOIN research.runs r ON r.workspace_id = j.workspace_id AND r.run_id = j.run_id
         JOIN research.worker_attempts wa
           ON wa.workspace_id = j.workspace_id AND wa.job_id = j.job_id
        WHERE j.workspace_id = $1 AND j.job_id = $2
          AND wa.worker_attempt_id = $3 AND wa.lease_epoch = $4
        FOR UPDATE OF j, r, wa`,
      [scope.workspaceId, input.jobId, input.workerAttemptId, input.leaseEpoch],
    );
    const row = selected.rows[0];
    if (!row) this.throwLeaseRejected();
    const job = row!;
    const active = ["CLAIMED", "RUNNING", "CANCEL_REQUESTED"].includes(job.state);
    const allowedWorkerState = transition === "LEASE_EXPIRED"
      ? ["CLAIMED", "RUNNING"]
      : ["CLAIMED", "RUNNING"];
    const workerState = await client.query<{ state: string; expires_at: Date }>(
      `SELECT state, expires_at FROM research.worker_attempts
        WHERE workspace_id = $1 AND worker_attempt_id = $2`,
      [scope.workspaceId, input.workerAttemptId],
    );
    if (!active || !workerState.rows[0] || !allowedWorkerState.includes(workerState.rows[0].state) ||
        (transition === "WORKER_RETRY" && workerState.rows[0].expires_at <= new Date())) {
      this.throwLeaseRejected();
    }
    const ordinal = asNumber(job.ordinal);
    const attemptLimit = asNumber(job.attempt_limit);
    const cancelled = job.state === "CANCEL_REQUESTED";
    const scheduled = !cancelled && ordinal < attemptLimit;
    const terminalState = cancelled ? "CANCELLED" : "FAILED";
    await client.query(
      `UPDATE research.worker_attempts
          SET state = $4, exit_reason = $5, updated_at = now()
        WHERE workspace_id = $1 AND worker_attempt_id = $2 AND lease_epoch = $3`,
      [scope.workspaceId, input.workerAttemptId, input.leaseEpoch, transition === "LEASE_EXPIRED" ? "LOST_LEASE" : "FAILED", input.reason],
    );
    await this.abortWritingArtifactsForFence(client, scope, input.workerAttemptId, input.leaseEpoch);
    await client.query(
      `UPDATE research.jobs
          SET state = $3,
              retry_not_before = CASE WHEN $4 THEN now() + $5 * interval '1 second' ELSE NULL END,
              current_worker_attempt_id = NULL,
              current_lease_epoch = NULL,
              terminal_reason = CASE WHEN $4 THEN NULL ELSE $6 END,
              updated_at = now()
        WHERE workspace_id = $1 AND job_id = $2
          AND current_worker_attempt_id = $7 AND current_lease_epoch = $8`,
      [
        scope.workspaceId, job.job_id, scheduled ? "RETRY_WAIT" : terminalState,
        scheduled, retryDelaySeconds, input.reason, input.workerAttemptId, input.leaseEpoch,
      ],
    );
    await client.query(
      `UPDATE research.attempts SET state = $3, updated_at = now()
        WHERE workspace_id = $1 AND attempt_id = $2`,
      [scope.workspaceId, job.attempt_id, scheduled ? "QUEUED" : terminalState],
    );
    await client.query(
      `UPDATE research.runs SET state = $3, state_version = state_version + 1, updated_at = now()
        WHERE workspace_id = $1 AND run_id = $2`,
      [scope.workspaceId, job.run_id, scheduled ? "QUEUED" : terminalState],
    );
    if (scheduled) {
      await this.enqueueOutboxEvent(client, scope, {
        jobId: job.job_id,
        eventType: "RESEARCH_JOB_RETRY_READY",
        deliveryGeneration: ordinal + 1,
        payload: this.outboxPayload(job.job_id, job.run_id, job.queue_class, job.logical_work_key, this.requireWorkDigest(job)),
      });
    }
    await this.recordJobEvent(client, scope, job.job_id, input.workerAttemptId, transition, {
      reason: input.reason,
      scheduled,
      ordinal,
    });
    await this.audit(client, scope, "RESEARCH_DURABLE_JOB_RETRY_DECIDED", "job", job.job_id, {
      transition,
      scheduled,
      worker_attempt_id: input.workerAttemptId,
      lease_epoch: input.leaseEpoch,
    });

    return { scheduled, terminal: !scheduled };
  }
  /** Preserve a sealed candidate, but close unsealed metadata from a fenced attempt. */
  private async abortWritingArtifactsForFence(
    client: ScopedClient,
    scope: ResearchScope,
    workerAttemptId: string,
    leaseEpoch: number,
  ): Promise<void> {
    const aborted = await client.query<{ artifact_id: string }>(
      `UPDATE research.artifacts
          SET state = 'ABORTED', updated_at = now()
        WHERE workspace_id = $1 AND worker_attempt_id = $2
          AND lease_epoch = $3 AND state = 'WRITING'
        RETURNING artifact_id`,
      [scope.workspaceId, workerAttemptId, leaseEpoch],
    );
    for (const row of aborted.rows) {
      await this.audit(client, scope, "RESEARCH_ARTIFACT_ABORTED", "artifact", row.artifact_id, {
        worker_attempt_id: workerAttemptId,
        lease_epoch: leaseEpoch,
      });
    }
  }

  private async recoverExpiredDurableJobsInTransaction(
    client: ScopedClient,
    scope: ResearchScope,
  ): Promise<{ recovered: number; terminal: number }> {
    const expired = await client.query<{ job_id: string; worker_attempt_id: string; lease_epoch: string | number }>(
      `SELECT j.job_id, wa.worker_attempt_id, wa.lease_epoch
         FROM research.jobs j
         JOIN research.worker_attempts wa
           ON wa.workspace_id = j.workspace_id AND wa.job_id = j.job_id
        WHERE j.workspace_id = $1
          AND j.state IN ('CLAIMED', 'RUNNING', 'CANCEL_REQUESTED')
          AND j.current_worker_attempt_id = wa.worker_attempt_id
          AND j.current_lease_epoch = wa.lease_epoch
          AND wa.state IN ('CLAIMED', 'RUNNING')
          AND wa.expires_at <= now()
        FOR UPDATE OF j, wa SKIP LOCKED`,
      [scope.workspaceId],
    );
    let recovered = 0;
    let terminal = 0;
    for (const row of expired.rows) {
      const decision = await this.retryDurableJobInTransaction(
        client,
        scope,
        { jobId: row.job_id, workerAttemptId: row.worker_attempt_id, leaseEpoch: asNumber(row.lease_epoch), reason: "LEASE_EXPIRED" },
        1,
        "LEASE_EXPIRED",
      );
      recovered += 1;
      if (decision.terminal) terminal += 1;
    }
    return { recovered, terminal };
  }

  /**
   * P05 reservation is the only way a new durable artifact revision starts.
   * The Python writer receives this opaque identity/fence but has no database
   * credential; a stale or duplicate worker cannot manufacture a `SEALED` row.
   */
  async reserveArtifact(
    scope: ResearchScope,
    input: ResearchArtifactReservationInput,
  ): Promise<ResearchArtifactReservation> {
    this.assertScope(scope);
    requireOpaqueId(input.artifactId, "artifactId");
    requireOpaqueId(input.runId, "runId");
    requireOpaqueId(input.workerAttemptId, "workerAttemptId");
    requirePositiveSafeInteger(input.leaseEpoch, "leaseEpoch");
    requireArtifactRetentionClass(input.retentionClass);
    if (input.storageLocator !== `artifacts/${input.artifactId}`) {
      throw new ResearchMetadataError(
        "RESEARCH_INVALID_INPUT",
        "Artifact storage locator must be the opaque reserved artifact location.",
        400,
      );
    }
    if (input.retentionClass === "RESEARCH_EVIDENCE" && input.notBeforeGcAt != null) {
      throw new ResearchMetadataError(
        "RESEARCH_INVALID_INPUT",
        "Research evidence cannot carry a garbage-collection deadline.",
        400,
      );
    }
    if (input.retentionClass === "EPHEMERAL_DIAGNOSTIC" && !(input.notBeforeGcAt instanceof Date)) {
      throw new ResearchMetadataError(
        "RESEARCH_INVALID_INPUT",
        "Ephemeral diagnostic artifacts require an explicit GC deadline.",
        400,
      );
    }
    if (input.notBeforeGcAt instanceof Date) requireFiniteDate(input.notBeforeGcAt, "notBeforeGcAt");
    return this.withScopedWrite(scope, async (client) => {
      // The stable pair lock makes a redelivered reservation idempotent
      // without incrementing the run revision a second time.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
        scope.workspaceId,
        input.artifactId,
      ]);
      const prior = await client.query<{
        run_id: string;
        worker_attempt_id: string | null;
        lease_epoch: string | number | null;
        artifact_revision: string | number;
        storage_locator: string;
        retention_class: string;
        not_before_gc_at: Date | null;
        state: string;
      }>(
        `SELECT run_id, worker_attempt_id, lease_epoch, artifact_revision,
                storage_locator, retention_class, not_before_gc_at, state
           FROM research.artifacts
          WHERE workspace_id = $1 AND artifact_id = $2`,
        [scope.workspaceId, input.artifactId],
      );
      if (prior.rows[0]) {
        const row = prior.rows[0];
        if (
          row.run_id !== input.runId ||
          row.worker_attempt_id !== input.workerAttemptId ||
          asNumber(row.lease_epoch ?? 0) !== input.leaseEpoch ||
          row.storage_locator !== input.storageLocator ||
          row.retention_class !== input.retentionClass ||
          (row.not_before_gc_at?.toISOString() ?? null) !== (input.notBeforeGcAt?.toISOString() ?? null) ||
          (row.state !== "WRITING" && row.state !== "SEALED")
        ) {
          throw new ResearchMetadataError(
            "RESEARCH_IDEMPOTENCY_PAYLOAD_CONFLICT",
            "That artifact reservation is already bound to different durable work.",
            409,
          );
        }
        return {
          artifactId: input.artifactId,
          artifactRevision: asNumber(row.artifact_revision),
          storageLocator: row.storage_locator,
          state: row.state as "WRITING" | "SEALED",
          replayed: true,
        };
      }
      const incremented = await client.query<{ artifact_revision: string | number }>(
        `UPDATE research.runs r
            SET artifact_revision = r.artifact_revision + 1,
                updated_at = now()
           FROM research.worker_attempts wa
           JOIN research.jobs j
             ON j.workspace_id = wa.workspace_id AND j.job_id = wa.job_id
          WHERE r.workspace_id = $1
            AND r.run_id = $2
            AND wa.workspace_id = r.workspace_id
            AND wa.worker_attempt_id = $3
            AND wa.lease_epoch = $4
            AND wa.state IN ('CLAIMED', 'RUNNING')
            AND wa.expires_at > now()
            AND j.run_id = r.run_id
          RETURNING r.artifact_revision`,
        [scope.workspaceId, input.runId, input.workerAttemptId, input.leaseEpoch],
      );
      const revision = incremented.rows[0]?.artifact_revision;
      if (revision === undefined) {
        throw new ResearchMetadataError(
          "RESEARCH_ARTIFACT_FENCE_REJECTED",
          "The worker lease is no longer authorized to reserve an artifact revision.",
          409,
        );
      }
      await client.query(
        `INSERT INTO research.artifacts
           (workspace_id, artifact_id, run_id, table_kind, schema_version,
            manifest_digest, state, retention_class, storage_locator,
            artifact_revision, worker_attempt_id, lease_epoch, not_before_gc_at)
         VALUES ($1, $2, $3, 'research_bundle', 'research.artifact-manifest.v1',
                 NULL, 'WRITING', $4, $5, $6, $7, $8, $9)`,
        [
          scope.workspaceId,
          input.artifactId,
          input.runId,
          input.retentionClass,
          input.storageLocator,
          revision,
          input.workerAttemptId,
          input.leaseEpoch,
          input.notBeforeGcAt ?? null,
        ],
      );
      await this.audit(client, scope, "RESEARCH_ARTIFACT_RESERVED", "artifact", input.artifactId, {
        run_id: input.runId,
        artifact_revision: asNumber(revision),
        worker_attempt_id: input.workerAttemptId,
        lease_epoch: input.leaseEpoch,
      });
      return {
        artifactId: input.artifactId,
        artifactRevision: asNumber(revision),
        storageLocator: input.storageLocator,
        state: "WRITING",
        replayed: false,
      };
    });
  }

  /** Seal a candidate only when its exact lease still owns the reservation. */
  async sealArtifact(scope: ResearchScope, input: ResearchArtifactSealInput): Promise<{ replayed: boolean }> {
    this.assertScope(scope);
    requireOpaqueId(input.artifactId, "artifactId");
    requireOpaqueId(input.workerAttemptId, "workerAttemptId");
    requirePositiveSafeInteger(input.leaseEpoch, "leaseEpoch");
    requireDigest(input.manifestDigest, "manifestDigest");
    requireNonNegativeSafeInteger(input.totalRows, "totalRows");
    requireNonNegativeSafeInteger(input.totalBytes, "totalBytes");
    if (input.manifestSchemaVersion !== "research.artifact-manifest.v1") {
      throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "Artifact manifest schema version is unsupported.", 400);
    }
    this.assertArtifactParts(input.parts);
    const documents = input.documents ?? [];
    this.assertArtifactDocuments(documents);
    const expectedRows = input.parts.reduce((total, part) => total + part.rowCount, 0);
    const expectedBytes = input.parts.reduce((total, part) => total + part.byteCount, 0)
      + documents.reduce((total, document) => total + document.byteCount, 0);
    if (expectedRows !== input.totalRows || expectedBytes !== input.totalBytes) {
      throw new ResearchMetadataError(
        "RESEARCH_INVALID_INPUT",
        "Artifact totals must equal the immutable part statistics.",
        400,
      );
    }
    return this.withScopedWrite(scope, async (client) => {
      const prior = await client.query<{
        state: string;
        worker_attempt_id: string | null;
        lease_epoch: string | number | null;
        manifest_digest: string | null;
        manifest_schema_version: string | null;
        total_rows: string | number;
        total_bytes: string | number;
      }>(
        `SELECT state, worker_attempt_id, lease_epoch, manifest_digest,
                manifest_schema_version, total_rows, total_bytes
           FROM research.artifacts
          WHERE workspace_id = $1 AND artifact_id = $2
          FOR UPDATE`,
        [scope.workspaceId, input.artifactId],
      );
      const existing = prior.rows[0];
      if (!existing) {
        throw new ResearchMetadataError("RESEARCH_ARTIFACT_NOT_FOUND", "Artifact reservation was not found.", 404);
      }
      if (
        existing.worker_attempt_id !== input.workerAttemptId ||
        asNumber(existing.lease_epoch ?? 0) !== input.leaseEpoch
      ) {
        throw new ResearchMetadataError(
          "RESEARCH_ARTIFACT_FENCE_REJECTED",
          "The sealing worker does not own this artifact reservation.",
          409,
        );
      }
      if (existing.state === "SEALED") {
        if (
          existing.manifest_digest === input.manifestDigest &&
          existing.manifest_schema_version === input.manifestSchemaVersion &&
          asNumber(existing.total_rows) === input.totalRows &&
          asNumber(existing.total_bytes) === input.totalBytes
        ) return { replayed: true };
        throw new ResearchMetadataError(
          "RESEARCH_ARTIFACT_LIFECYCLE_CONFLICT",
          "A sealed artifact cannot be replaced by different bytes.",
          409,
        );
      }
      if (existing.state !== "WRITING") {
        throw new ResearchMetadataError(
          "RESEARCH_ARTIFACT_LIFECYCLE_CONFLICT",
          "Only a writing artifact may be sealed.",
          409,
        );
      }
      const sealed = await client.query(
        `UPDATE research.artifacts a
            SET state = 'SEALED',
                manifest_digest = $5,
                manifest_schema_version = $6,
                total_rows = $7,
                total_bytes = $8,
                sealed_at = now(),
                updated_at = now()
           FROM research.worker_attempts wa
           JOIN research.jobs j
             ON j.workspace_id = wa.workspace_id AND j.job_id = wa.job_id
          WHERE a.workspace_id = $1
            AND a.artifact_id = $2
            AND a.worker_attempt_id = $3
            AND a.lease_epoch = $4
            AND a.state = 'WRITING'
            AND wa.workspace_id = a.workspace_id
            AND wa.worker_attempt_id = a.worker_attempt_id
            AND wa.lease_epoch = a.lease_epoch
            AND wa.state IN ('CLAIMED', 'RUNNING')
            AND wa.expires_at > now()
            AND j.run_id = a.run_id
          RETURNING a.artifact_id`,
        [
          scope.workspaceId,
          input.artifactId,
          input.workerAttemptId,
          input.leaseEpoch,
          input.manifestDigest,
          input.manifestSchemaVersion,
          input.totalRows,
          input.totalBytes,
        ],
      );
      if (sealed.rowCount !== 1) {
        throw new ResearchMetadataError(
          "RESEARCH_ARTIFACT_FENCE_REJECTED",
          "The worker lease expired before the artifact could be sealed.",
          409,
        );
      }
      await client.query(
        `INSERT INTO research.artifact_parts
           (workspace_id, artifact_id, table_kind, part_ordinal, schema_version,
            relative_path, part_digest, row_count, byte_count, sequence_min, sequence_max)
         SELECT $1, $2, value->>'tableKind', (value->>'partOrdinal')::integer,
                value->>'schemaVersion', value->>'relativePath', value->>'partDigest',
                (value->>'rowCount')::bigint, (value->>'byteCount')::bigint,
                value->>'sequenceMin', value->>'sequenceMax'
           FROM jsonb_array_elements($3::jsonb) AS value`,
        [scope.workspaceId, input.artifactId, JSON.stringify(input.parts)],
      );
      await this.audit(client, scope, "RESEARCH_ARTIFACT_SEALED", "artifact", input.artifactId, {
        manifest_digest: input.manifestDigest,
        total_rows: input.totalRows,
        total_bytes: input.totalBytes,
        part_count: input.parts.length,
      });
      return { replayed: false };
    });
  }

  /**
   * Bounded idempotent trial ingestion.  The ledger insert and all trial rows
   * share one transaction, so a failed duplicate cannot leave a partial total.
   */
  async recordArtifactTrialBatch(
    scope: ResearchScope,
    input: ResearchArtifactTrialBatchInput,
  ): Promise<{ replayed: boolean }> {
    this.assertScope(scope);
    for (const [label, value] of Object.entries({
      artifactId: input.artifactId,
      studyId: input.studyId,
      runId: input.runId,
      workerAttemptId: input.workerAttemptId,
    })) requireOpaqueId(value, label);
    requirePositiveSafeInteger(input.leaseEpoch, "leaseEpoch");
    requirePositiveSafeInteger(input.sourceRevision, "sourceRevision");
    requireDigest(input.batchDigest, "batchDigest");
    if (input.rows.length === 0 || input.rows.length > RESEARCH_DB_BUDGET.maxTrialRowsPerArtifactBatch) {
      throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "Trial batch size is outside the bounded contract.", 400);
    }
    for (const row of input.rows) this.assertTrialInput(row);
    return this.withScopedWrite(scope, async (client) => {
      const artifact = await client.query<{
        run_id: string;
        artifact_revision: string | number;
        state: string;
        worker_attempt_id: string | null;
        lease_epoch: string | number | null;
      }>(
        `SELECT run_id, artifact_revision, state, worker_attempt_id, lease_epoch
           FROM research.artifacts
          WHERE workspace_id = $1 AND artifact_id = $2
          FOR UPDATE`,
        [scope.workspaceId, input.artifactId],
      );
      const row = artifact.rows[0];
      if (!row) throw new ResearchMetadataError("RESEARCH_ARTIFACT_NOT_FOUND", "Artifact reservation was not found.", 404);
      if (
        row.run_id !== input.runId || row.state !== "WRITING" ||
        row.worker_attempt_id !== input.workerAttemptId ||
        asNumber(row.lease_epoch ?? 0) !== input.leaseEpoch ||
        asNumber(row.artifact_revision) !== input.sourceRevision
      ) {
        throw new ResearchMetadataError(
          "RESEARCH_ARTIFACT_FENCE_REJECTED",
          "The trial batch is not owned by the current writing artifact lease.",
          409,
        );
      }
      const lease = await client.query(
        `SELECT 1
           FROM research.worker_attempts wa
           JOIN research.jobs j ON j.workspace_id = wa.workspace_id AND j.job_id = wa.job_id
          WHERE wa.workspace_id = $1
            AND wa.worker_attempt_id = $2
            AND wa.lease_epoch = $3
            AND wa.state IN ('CLAIMED', 'RUNNING')
            AND wa.expires_at > now()
            AND j.run_id = $4`,
        [scope.workspaceId, input.workerAttemptId, input.leaseEpoch, input.runId],
      );
      if (lease.rowCount !== 1) {
        throw new ResearchMetadataError("RESEARCH_ARTIFACT_FENCE_REJECTED", "The trial-ingest worker lease expired.", 409);
      }
      const ledger = await client.query(
        `INSERT INTO research.artifact_ingest_batches
           (workspace_id, artifact_id, study_id, run_id, table_kind,
            source_revision, batch_digest, row_count)
         VALUES ($1, $2, $3, $4, 'trial_index', $5, $6, $7)
         ON CONFLICT (workspace_id, artifact_id, table_kind, batch_digest) DO NOTHING
         RETURNING artifact_id`,
        [scope.workspaceId, input.artifactId, input.studyId, input.runId, input.sourceRevision, input.batchDigest, input.rows.length],
      );
      if (ledger.rowCount === 0) {
        const previous = await client.query<{
          study_id: string; run_id: string; source_revision: string | number; row_count: number;
        }>(
          `SELECT study_id, run_id, source_revision, row_count
             FROM research.artifact_ingest_batches
            WHERE workspace_id = $1 AND artifact_id = $2
              AND table_kind = 'trial_index' AND batch_digest = $3`,
          [scope.workspaceId, input.artifactId, input.batchDigest],
        );
        const prior = previous.rows[0];
        if (!prior || prior.study_id !== input.studyId || prior.run_id !== input.runId ||
            asNumber(prior.source_revision) !== input.sourceRevision || prior.row_count !== input.rows.length) {
          throw new ResearchMetadataError(
            "RESEARCH_ARTIFACT_INGEST_CONFLICT",
            "A trial batch digest is already bound to different Research rows.",
            409,
          );
        }
        return { replayed: true };
      }
      try {
        for (const trial of input.rows) {
          await client.query(
            `INSERT INTO research.trial_index
               (workspace_id, study_id, run_id, trial_id, trial_ordinal,
                execution_status, feasibility_state, params, objective_defined,
                objective_value, objective_definition_id, source_artifact_ref,
                source_revision)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13)`,
            [
              scope.workspaceId, input.studyId, input.runId, trial.trialId, trial.trialOrdinal,
              trial.executionStatus, trial.feasibilityState ?? "UNKNOWN", JSON.stringify(trial.params),
              trial.objectiveDefined, trial.objectiveValue ?? null, trial.objectiveDefinitionId ?? null,
              `artifact:${input.artifactId}`, input.sourceRevision,
            ],
          );
        }
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error &&
            String((error as { code?: unknown }).code) === "23505") {
          throw new ResearchMetadataError(
            "RESEARCH_ARTIFACT_INGEST_CONFLICT",
            "Trial identity or ordinal is already owned by another immutable batch.",
            409,
          );
        }
        throw error;
      }
      await this.audit(client, scope, "RESEARCH_TRIAL_BATCH_INGESTED", "artifact", input.artifactId, {
        study_id: input.studyId,
        batch_digest: input.batchDigest,
        row_count: input.rows.length,
        source_revision: input.sourceRevision,
      });
      return { replayed: false };
    });
  }

  async recordArtifactReference(
    scope: ResearchScope,
    input: ResearchArtifactReferenceInput,
  ): Promise<{ replayed: boolean }> {
    this.assertScope(scope);
    requireOpaqueId(input.artifactId, "artifactId");
    requireOpaqueId(input.referenceId, "referenceId");
    requireArtifactReferenceKind(input.referenceKind);
    if (input.referenceKind === "ACTIVE_LEASE" && !(input.pinnedUntil instanceof Date)) {
      throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "An active lease reference requires a pin expiry.", 400);
    }
    if (input.pinnedUntil instanceof Date) requireFiniteDate(input.pinnedUntil, "pinnedUntil");
    return this.withScopedWrite(scope, async (client) => {
      const artifact = await client.query<{
        run_id: string; state: string; worker_attempt_id: string | null;
      }>(
        `SELECT run_id, state, worker_attempt_id
           FROM research.artifacts
          WHERE workspace_id = $1 AND artifact_id = $2
          FOR UPDATE`,
        [scope.workspaceId, input.artifactId],
      );
      const row = artifact.rows[0];
      if (!row) throw new ResearchMetadataError("RESEARCH_ARTIFACT_NOT_FOUND", "Artifact was not found.", 404);
      if (input.referenceKind !== "ACTIVE_LEASE" && row.state !== "SEALED") {
        throw new ResearchMetadataError(
          "RESEARCH_ARTIFACT_LIFECYCLE_CONFLICT",
          "Durable evidence references require a sealed artifact.",
          409,
        );
      }
      await this.assertArtifactReferenceTarget(client, scope, row.run_id, row.worker_attempt_id, input);
      const inserted = await client.query(
        `INSERT INTO research.artifact_references
           (workspace_id, artifact_id, reference_kind, reference_id, pinned_until)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (workspace_id, artifact_id, reference_kind, reference_id) DO NOTHING
         RETURNING artifact_id`,
        [scope.workspaceId, input.artifactId, input.referenceKind, input.referenceId, input.pinnedUntil ?? null],
      );
      if (inserted.rowCount === 0) {
        const prior = await client.query<{ pinned_until: Date | null }>(
          `SELECT pinned_until FROM research.artifact_references
            WHERE workspace_id = $1 AND artifact_id = $2 AND reference_kind = $3 AND reference_id = $4`,
          [scope.workspaceId, input.artifactId, input.referenceKind, input.referenceId],
        );
        const priorPin = prior.rows[0]?.pinned_until?.toISOString() ?? null;
        const requestedPin = input.pinnedUntil?.toISOString() ?? null;
        if (priorPin !== requestedPin) {
          throw new ResearchMetadataError(
            "RESEARCH_ARTIFACT_REFERENCE_INVALID",
            "An immutable artifact reference cannot be changed after creation.",
            409,
          );
        }
        return { replayed: true };
      }
      await this.audit(client, scope, "RESEARCH_ARTIFACT_REFERENCE_RECORDED", "artifact", input.artifactId, {
        reference_kind: input.referenceKind,
        reference_id: input.referenceId,
      });
      return { replayed: false };
    });
  }

  async listGcEligibleArtifacts(scope: ResearchScope, now: Date, limit = 100): Promise<string[]> {
    this.assertScope(scope);
    if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "GC query inputs are invalid.", 400);
    }
    return this.withScopedRead(scope, async (client) => {
      const result = await client.query<{ artifact_id: string }>(
        `SELECT a.artifact_id
           FROM research.artifacts a
          WHERE a.workspace_id = $1
            AND a.state = 'SEALED'
            AND a.retention_class = 'EPHEMERAL_DIAGNOSTIC'
            AND a.not_before_gc_at <= $2
            AND NOT EXISTS (
              SELECT 1 FROM research.artifact_references r
               WHERE r.workspace_id = a.workspace_id
                 AND r.artifact_id = a.artifact_id
                 AND (r.reference_kind <> 'ACTIVE_LEASE' OR r.pinned_until > $2)
            )
          ORDER BY a.not_before_gc_at ASC, a.artifact_id ASC
          LIMIT $3`,
        [scope.workspaceId, now, limit],
      );
      return result.rows.map((row) => row.artifact_id);
    });
  }

  async markArtifactIntegrity(
    scope: ResearchScope,
    input: ResearchArtifactIntegrityInput,
  ): Promise<void> {
    this.assertScope(scope);
    requireOpaqueId(input.artifactId, "artifactId");
    if (input.state !== "CORRUPT" && input.state !== "MISSING") {
      throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "Artifact integrity state is unsupported.", 400);
    }
    await this.withScopedWrite(scope, async (client) => {
      const updated = await client.query(
        `UPDATE research.artifacts
            SET state = $3, updated_at = now()
          WHERE workspace_id = $1 AND artifact_id = $2 AND state = 'SEALED'
          RETURNING artifact_id`,
        [scope.workspaceId, input.artifactId, input.state],
      );
      if (updated.rowCount !== 1) {
        throw new ResearchMetadataError(
          "RESEARCH_ARTIFACT_LIFECYCLE_CONFLICT",
          "Only a sealed artifact may be marked missing or corrupt.",
          409,
        );
      }
      await this.audit(client, scope, "RESEARCH_ARTIFACT_INTEGRITY_CHANGED", "artifact", input.artifactId, {
        state: input.state,
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
    this.assertTrialInput(input);
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

  private async assertLiveOwnedAlphaImportSource(
    client: ScopedClient,
    scope: ResearchScope,
    sourceFileRef: string,
  ): Promise<Pick<AlphaImportSourceRow, "source_digest" | "analysis_digest" | "expires_at">> {
    const result = await client.query<Pick<AlphaImportSourceRow, "source_digest" | "analysis_digest" | "expires_at">>(
      `SELECT source_digest, analysis_digest, expires_at
         FROM research.import_sources
        WHERE workspace_id = $1 AND source_file_ref = $2 AND actor_user_id = $3`,
      [scope.workspaceId, sourceFileRef, scope.actorUserId],
    );
    const source = result.rows[0];
    if (!source) {
      throw new ResearchMetadataError("RESEARCH_ALPHA_IMPORT_SOURCE_NOT_FOUND", "Alpha import source was not found.", 404);
    }
    if (source.expires_at.getTime() <= Date.now()) {
      throw new ResearchMetadataError("RESEARCH_ALPHA_IMPORT_SOURCE_EXPIRED", "Alpha import source has expired; parse the file again.", 409);
    }
    return source;
  }

  private preflightRecord(row: PreflightManifestRow): ResearchPreflightManifestRecord {
    return {
      preflightToken: row.preflight_token,
      requestedSpecDigest: row.requested_spec_digest,
      effectiveSpecDigest: row.effective_spec_digest,
      datasetBindingDigest: row.dataset_binding_digest,
      manifestDigest: row.manifest_digest,
      requestedSpec: decodeObject(row.requested_spec, "Research preflight requested spec"),
      effectiveSpec: decodeObject(row.effective_spec, "Research preflight effective spec"),
      datasetBinding: decodeObject(row.dataset_binding, "Research preflight dataset binding"),
      topology: decodeObject(row.topology, "Research preflight topology"),
      resourceEstimate: decodeObject(row.resource_estimate, "Research preflight resource estimate"),
      snapshot: decodeObject(row.snapshot, "Research preflight snapshot"),
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }

  private async assertPassingGateReceipt(
    client: ScopedClient,
    scope: ResearchScope,
    input: ResearchAlphaImportRegistrationInput,
  ): Promise<void> {
    const parameters: unknown[] = [
      scope.workspaceId,
      scope.actorUserId,
      input.sourceFileRef,
      input.sourceDigest,
      input.analysisDigest,
    ];
    let query = `SELECT import_session_id, gate_results
                   FROM research.import_sessions
                  WHERE workspace_id = $1
                    AND actor_user_id = $2
                    AND source_file_ref = $3
                    AND source_digest = $4
                    AND source_analysis_digest = $5
                    AND validation_version = 'research.alpha-import-gates.v1'
                    AND expires_at > now()`;
    if (input.gateReceiptId) {
      parameters.push(input.gateReceiptId);
      query += " AND import_session_id = $6";
    }
    query += " ORDER BY created_at DESC, import_session_id DESC LIMIT 1";
    const receipt = await client.query<{ import_session_id: string; gate_results: Record<string, unknown> | string }>(query, parameters);
    const row = receipt.rows[0];
    if (!row) {
      throw new ResearchMetadataError(
        "RESEARCH_ALPHA_IMPORT_GATES_REQUIRED",
        "A live passing seven-gate receipt for the exact source is required before registration.",
        409,
      );
    }
    const gates = decodeObject(row.gate_results, "Alpha import gate receipt");
    if (gates.all_pass !== true) {
      throw new ResearchMetadataError(
        "RESEARCH_ALPHA_IMPORT_GATES_FAILED",
        "A failed Alpha import gate cannot be registered provisionally.",
        409,
      );
    }
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

  private assertRunProducerInput(input: ResearchRunProducerInput): void {
    this.assertAttemptInput({
      attemptId: input.attemptId,
      runId: input.runId,
      clientIntentId: input.clientIntentId,
      requestPayloadDigest: input.requestPayloadDigest,
      alphaVersionId: input.alphaVersionId,
      intentKind: input.intentKind,
      requestSpecDigest: input.requestedSpecDigest,
      effectiveSpecDigest: input.effectiveSpecDigest,
      engineReleaseId: input.engineReleaseId,
      datasetBindingDigest: input.datasetBindingDigest,
    });
    for (const [label, value] of Object.entries({
      jobId: input.jobId,
      commandId: input.commandId,
      alphaId: input.alphaId,
      alphaVersionId: input.alphaVersionId,
      preflightToken: input.preflightToken,
      snapshotId: input.snapshotId,
    })) requireOpaqueId(value, label);
    requireAlphaId(input.alphaId);
    if (!input.preflightToken.startsWith("rpft_")) {
      throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "preflightToken has an invalid prefix.", 400);
    }
    if (!/^dss_[0-9a-f]{32}$/.test(input.snapshotId)) {
      throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "snapshotId has an invalid P08 identity.", 400);
    }
    if (input.executionAdapterId !== "p04.delta-rsi.v1") {
      throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "Research execution adapter is unsupported.", 400);
    }
    const profileId = input.executionProfileId ?? P04_FIXED_QUALIFICATION_PROFILE_ID;
    const profileDigest = input.executionProfileDigest ?? null;
    if (!(profileId === P04_FIXED_QUALIFICATION_PROFILE_ID && profileDigest === null)
      && !(profileId === DELTA_WFO_PROFILE_ID && profileDigest === DELTA_WFO_PROFILE_DIGEST)) {
      throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "Research execution profile is unsupported.", 400);
    }
    for (const [label, value] of Object.entries({
      adapterContractDigest: input.adapterContractDigest,
      manifestDigest: input.manifestDigest,
      snapshotContentHash: input.snapshotContentHash,
      workDigest: input.workDigest,
    })) requireDigest(value, label);
    requireBoundedObject(input.legacyRequest, "Research run legacy request", RESEARCH_DB_BUDGET.maxPreflightManifestBytes);
    assertJobCost(input.cost);
    requireQueueClass(input.queueClass);
    requireText(input.resourceClass, "Research producer resourceClass", 128);
    requirePositiveSafeInteger(input.attemptLimit, "Research producer attemptLimit", RESEARCH_SCHEDULER_BUDGET.retryAttemptLimitMaximum);
  }

  private matchesRunProducer(
    record: ResearchRunProducerRecord,
    input: ResearchRunProducerInput,
  ): boolean {
    return (
      record.alphaId === input.alphaId &&
      record.alphaVersionId === input.alphaVersionId &&
      record.executionAdapterId === input.executionAdapterId &&
      record.adapterContractDigest === input.adapterContractDigest &&
      record.executionProfileId === (input.executionProfileId ?? P04_FIXED_QUALIFICATION_PROFILE_ID) &&
      record.executionProfileDigest === (input.executionProfileDigest ?? null) &&
      record.requestedSpecDigest === input.requestedSpecDigest &&
      record.effectiveSpecDigest === input.effectiveSpecDigest &&
      record.datasetBindingDigest === input.datasetBindingDigest &&
      record.manifestDigest === input.manifestDigest &&
      record.snapshotId === input.snapshotId &&
      record.snapshotContentHash === input.snapshotContentHash &&
      record.workDigest === input.workDigest &&
      canonicalResearchDocument(record.legacyRequest) === canonicalResearchDocument(input.legacyRequest)
    );
  }

  private assertDurableJobInput(input: ResearchDurableJobInput): void {
    for (const [label, value] of Object.entries({
      jobId: input.jobId,
      runId: input.runId,
      commandId: input.commandId,
      logicalWorkKey: input.logicalWorkKey,
      resourceClass: input.resourceClass,
    })) requireOpaqueId(value, label);
    requireDigest(input.workDigest, "workDigest");
    requireJobKind(input.jobKind);
    requireReadinessClass(input.readinessClass);
    requireQueueClass(input.queueClass);
    assertJobCost(input.cost);
    if (input.attemptLimit != null) {
      requirePositiveSafeInteger(input.attemptLimit, "attemptLimit", RESEARCH_SCHEDULER_BUDGET.retryAttemptLimitMaximum);
    }
  }

  private matchesDurableJob(
    row: DurableJobRow,
    input: ResearchDurableJobInput,
  ): boolean {
    const requestedLimit = input.attemptLimit ?? 3;
    const actual = decodeJobCost(row.cost_estimate);
    const sameCommand = row.command_id === input.commandId;
    const sameLogicalWork = row.run_id === input.runId && row.logical_work_key === input.logicalWorkKey;

    // A retry of one client command must preserve its exact logical work key.
    // A second authorised user may submit a different command ID for the same
    // deterministic logical work and receive the existing job instead.  The
    // latter is deduplication, not an authorization shortcut: `withScopedWrite`
    // has already checked workspace membership and we record the replay audit.
    if (!sameLogicalWork || (sameCommand && row.logical_work_key !== input.logicalWorkKey)) {
      return false;
    }
    return (
      row.job_kind === input.jobKind &&
      row.work_digest === input.workDigest &&
      row.readiness_class === input.readinessClass &&
      row.queue_class === input.queueClass &&
      row.resource_class === input.resourceClass &&
      asNumber(row.attempt_limit) === requestedLimit &&
      actual.memoryBytes === input.cost.memoryBytes &&
      actual.cpuSeconds === input.cost.cpuSeconds &&
      actual.scratchBytes === input.cost.scratchBytes &&
      actual.ioBytes === input.cost.ioBytes
    );
  }

  private jobCostDatabaseShape(cost: ResearchDurableJobInput["cost"]): ResearchJobCostRow {
    return {
      memory_bytes: cost.memoryBytes,
      cpu_seconds: cost.cpuSeconds,
      scratch_bytes: cost.scratchBytes,
      io_bytes: cost.ioBytes,
    };
  }

  private assertClaim(claim: Pick<ResearchDurableJobClaim, "jobId" | "workerAttemptId" | "leaseEpoch">): void {
    requireOpaqueId(claim.jobId, "jobId");
    requireOpaqueId(claim.workerAttemptId, "workerAttemptId");
    requirePositiveSafeInteger(claim.leaseEpoch, "leaseEpoch");
  }

  private assertWorkerUsage(usage: ResearchWorkerUsage): void {
    const limits: Record<keyof ResearchWorkerUsage, number> = {
      peakRssBytes: RESEARCH_SCHEDULER_BUDGET.maximumMemoryBytes,
      cpuSeconds: RESEARCH_SCHEDULER_BUDGET.maximumCpuSeconds,
      scratchBytes: RESEARCH_SCHEDULER_BUDGET.maximumScratchBytes,
      fdPeak: 65_536,
    };
    for (const [key, maximum] of Object.entries(limits) as Array<[keyof typeof limits, number]>) {
      const value = usage[key];
      // CG-P11-09: an unmeasured quantity stays null; it is not coerced to 0.
      if (value === null) continue;
      requireNonNegativeSafeInteger(value, `usage.${key}`);
      if (value > maximum) {
        throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", `usage.${key} exceeds the bounded worker contract.`, 400);
      }
    }
  }

  private workerUsageDatabaseShape(usage: ResearchWorkerUsage): Record<string, number | null> {
    return {
      peak_rss_bytes: usage.peakRssBytes,
      cpu_seconds: usage.cpuSeconds,
      scratch_bytes: usage.scratchBytes,
      fd_peak: usage.fdPeak,
    };
  }

  private outboxPayload(
    jobId: string,
    runId: string,
    queueClass: ResearchDurableJobInput["queueClass"],
    logicalWorkKey: string,
    workDigest: string,
  ): Record<string, string> {
    return {
      job_id: jobId,
      logical_work_key: logicalWorkKey,
      queue_class: queueClass,
      run_id: runId,
      work_digest: workDigest,
    };
  }

  private requireWorkDigest(job: DurableJobRow): string {
    if (job.work_digest == null || !isDigest(job.work_digest)) {
      throw new ResearchMetadataError(
        "RESEARCH_JOB_STATE_CONFLICT",
        "A pre-P06 job without canonical work identity cannot use the durable scheduler.",
        409,
      );
    }
    return job.work_digest;
  }

  private async enqueueOutboxEvent(
    client: ScopedClient,
    scope: ResearchScope,
    input: {
      jobId: string;
      eventType: ResearchJobOutboxMessage["eventType"];
      deliveryGeneration: number;
      payload: Record<string, string>;
    },
  ): Promise<void> {
    requirePositiveSafeInteger(input.deliveryGeneration, "outbox deliveryGeneration", 1_000_000);
    requireBoundedObject(input.payload, "scheduler outbox payload", RESEARCH_DB_BUDGET.maxSmallMetadataJsonBytes);
    const inserted = await client.query(
      `INSERT INTO research.job_outbox
         (workspace_id, outbox_id, job_id, delivery_generation, event_type,
          payload_digest, payload, state)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'PENDING')
       ON CONFLICT (workspace_id, job_id, event_type, delivery_generation) DO NOTHING
       RETURNING outbox_id`,
      [
        scope.workspaceId,
        newUlid("rout"),
        input.jobId,
        input.deliveryGeneration,
        input.eventType,
        digestJson(input.payload),
        JSON.stringify(input.payload),
      ],
    );
    if (inserted.rowCount === 0) {
      const prior = await client.query<{ payload_digest: string; payload: Record<string, string> }>(
        `SELECT payload_digest, payload FROM research.job_outbox
          WHERE workspace_id = $1 AND job_id = $2 AND event_type = $3 AND delivery_generation = $4`,
        [scope.workspaceId, input.jobId, input.eventType, input.deliveryGeneration],
      );
      if (!prior.rows[0] || prior.rows[0].payload_digest !== digestJson(input.payload) ||
          JSON.stringify(prior.rows[0].payload) !== JSON.stringify(input.payload)) {
        throw new ResearchMetadataError(
          "RESEARCH_IDEMPOTENCY_PAYLOAD_CONFLICT",
          "A scheduler outbox generation is already bound to different ID-only payload bytes.",
          409,
        );
      }
    }
  }

  private async recordJobEvent(
    client: ScopedClient,
    scope: ResearchScope,
    jobId: string,
    workerAttemptId: string | null,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    requireText(eventType, "scheduler event type", 160);
    requireBoundedObject(payload, "scheduler event payload", RESEARCH_DB_BUDGET.maxSmallMetadataJsonBytes);
    await client.query(
      `INSERT INTO research.job_events
         (workspace_id, job_event_id, job_id, worker_attempt_id, event_type, event_payload)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [scope.workspaceId, newUlid("rjev"), jobId, workerAttemptId, eventType, JSON.stringify(payload)],
    );
  }

  private throwLeaseRejected(): never {
    throw new ResearchMetadataError(
      "RESEARCH_JOB_LEASE_REJECTED",
      "The worker lease is absent, expired or fenced by a newer scheduler decision.",
      409,
    );
  }

  private assertTrialInput(input: ResearchTrialInput): void {
    for (const [label, value] of Object.entries({
      studyId: input.studyId,
      runId: input.runId,
      trialId: input.trialId,
    })) requireText(value, label, 256);
    if (
      !Number.isSafeInteger(input.trialOrdinal) || input.trialOrdinal < 0 ||
      (input.objectiveDefined && (!Number.isFinite(input.objectiveValue ?? NaN))) ||
      (!input.objectiveDefined && input.objectiveValue !== undefined && input.objectiveValue !== null)
    ) {
      throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "Trial objective shape is invalid.", 400);
    }
    requireBoundedObject(input.params, "trial params", RESEARCH_DB_BUDGET.maxConfigJsonBytes);
  }

  private assertArtifactDocuments(documents: NonNullable<ResearchArtifactSealInput["documents"]>): void {
    if (documents.length > 16) {
      throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "Artifact document count is outside the bounded contract.", 400);
    }
    const names = new Set<string>();
    for (const document of documents) {
      if (!isOpaqueId(document.name) || document.relativePath !== `documents/${document.name}.json` || names.has(document.name)) {
        throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "Artifact documents must be unique and remain under documents/.", 400);
      }
      requireDigest(document.documentDigest, "document.documentDigest");
      requirePositiveSafeInteger(document.byteCount, "document.byteCount", 1_048_576);
      names.add(document.name);
    }
  }

  private assertArtifactParts(parts: ResearchArtifactSealInput["parts"]): void {
    if (parts.length === 0 || parts.length > RESEARCH_DB_BUDGET.maxArtifactParts) {
      throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "Artifact part count is outside the bounded contract.", 400);
    }
    if (Buffer.byteLength(JSON.stringify(parts), "utf8") > RESEARCH_DB_BUDGET.maxArtifactManifestMetadataBytes) {
      throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "Artifact part metadata exceeds its bounded contract.", 400);
    }
    const paths = new Set<string>();
    const ordinals = new Set<string>();
    for (const part of parts) {
      requireText(part.tableKind, "part.tableKind", 128);
      if (!isOpaqueId(part.tableKind)) {
        throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "part.tableKind must be an opaque table identifier.", 400);
      }
      requireText(part.schemaVersion, "part.schemaVersion", 128);
      requirePositiveSafeInteger(part.partOrdinal, "part.partOrdinal", 1_000_000);
      requireArtifactRelativePath(part.relativePath, "part.relativePath");
      if (!part.relativePath.endsWith(".parquet")) {
        throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "Artifact part path must name a Parquet file.", 400);
      }
      if (!part.relativePath.startsWith(`tables/${part.tableKind}/`)) {
        throw new ResearchMetadataError(
          "RESEARCH_INVALID_INPUT",
          "Artifact part path must remain under its declared table directory.",
          400,
        );
      }
      requireDigest(part.partDigest, "part.partDigest");
      requireNonNegativeSafeInteger(part.rowCount, "part.rowCount");
      requireNonNegativeSafeInteger(part.byteCount, "part.byteCount");
      if (part.sequenceMin != null) requireText(part.sequenceMin, "part.sequenceMin", 1_024);
      if (part.sequenceMax != null) requireText(part.sequenceMax, "part.sequenceMax", 1_024);
      const ordinalKey = `${part.tableKind}\u0000${part.partOrdinal}`;
      if (paths.has(part.relativePath) || ordinals.has(ordinalKey)) {
        throw new ResearchMetadataError("RESEARCH_INVALID_INPUT", "Artifact parts must have unique paths and ordinals.", 400);
      }
      paths.add(part.relativePath);
      ordinals.add(ordinalKey);
    }
    for (const tableKind of new Set(parts.map((part) => part.tableKind))) {
      const ordinalsForTable = parts
        .filter((part) => part.tableKind === tableKind)
        .map((part) => part.partOrdinal)
        .sort((left, right) => left - right);
      if (!ordinalsForTable.every((ordinal, index) => ordinal === index + 1)) {
        throw new ResearchMetadataError(
          "RESEARCH_INVALID_INPUT",
          "Artifact part ordinals must be contiguous within each declared table.",
          400,
        );
      }
    }
  }

  private async assertArtifactReferenceTarget(
    client: ScopedClient,
    scope: ResearchScope,
    artifactRunId: string,
    workerAttemptId: string | null,
    input: ResearchArtifactReferenceInput,
  ): Promise<void> {
    let targetExists = false;
    switch (input.referenceKind) {
      case "ACTIVE_LEASE":
        targetExists = workerAttemptId === input.referenceId && input.pinnedUntil != null &&
          (await client.query(
            `SELECT 1
               FROM research.worker_attempts wa
               JOIN research.jobs j
                 ON j.workspace_id = wa.workspace_id AND j.job_id = wa.job_id
              WHERE wa.workspace_id = $1
                AND wa.worker_attempt_id = $2
                AND wa.state IN ('CLAIMED', 'RUNNING')
                AND wa.expires_at > now()
                AND j.run_id = $3
                AND $4::timestamptz > now()`,
            [scope.workspaceId, input.referenceId, artifactRunId, input.pinnedUntil],
          )).rowCount === 1;
        break;
      case "CHILD_RUN":
        targetExists = (await client.query(
          `SELECT 1 FROM research.runs
            WHERE workspace_id = $1 AND run_id = $2 AND parent_run_id = $3`,
          [scope.workspaceId, input.referenceId, artifactRunId],
        )).rowCount === 1;
        break;
      case "EXPOSURE":
        targetExists = (await client.query(
          `SELECT 1 FROM research.exposure_facts
            WHERE workspace_id = $1 AND exposure_id = $2 AND run_id = $3`,
          [scope.workspaceId, input.referenceId, artifactRunId],
        )).rowCount === 1;
        break;
      case "RELEASE_CANDIDATE":
        targetExists = (await client.query(
          `SELECT 1 FROM research.release_candidates
            WHERE workspace_id = $1 AND release_candidate_id = $2 AND run_id = $3`,
          [scope.workspaceId, input.referenceId, artifactRunId],
        )).rowCount === 1;
        break;
      case "SELECTION":
        targetExists = (await client.query(
          `SELECT 1 FROM research.selection_records
            WHERE workspace_id = $1 AND selection_id = $2 AND run_id = $3`,
          [scope.workspaceId, input.referenceId, artifactRunId],
        )).rowCount === 1;
        break;
      case "VERIFICATION":
        targetExists = (await client.query(
          `SELECT 1 FROM research.runs
            WHERE workspace_id = $1 AND run_id = $2 AND parent_run_id = $3 AND run_kind = 'VERIFY'`,
          [scope.workspaceId, input.referenceId, artifactRunId],
        )).rowCount === 1;
        break;
      default: {
        const exhaustive: never = input.referenceKind;
        throw new Error(`Unhandled artifact reference kind ${exhaustive}`);
      }
    }
    if (!targetExists) {
      throw new ResearchMetadataError(
        "RESEARCH_ARTIFACT_REFERENCE_INVALID",
        "Artifact reference target is not owned by the same Research run.",
        409,
      );
    }
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
