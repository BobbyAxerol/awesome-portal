/**
 * Research Loop P03 · server-side metadata contracts.
 *
 * These are intentionally internal contracts.  P10 owns the browser-facing
 * producer/read DTOs; P03 makes their durable identity and authorization
 * boundary explicit without exposing a second authentication system.
 */

export interface ResearchScope {
  workspaceId: string;
  actorUserId: string;
}

export const RESEARCH_DB_RUNTIME_ROLE = "portal_research_runtime" as const;

/**
 * A small, explicit share of the existing Control API pool.
 *
 * P03 does not create another pool.  Each metadata operation uses one scoped
 * transaction and cannot fan out into unbounded per-row queries.  The global
 * pool remains capped at ten connections in `db/pool.ts`; four is the maximum
 * concurrent Research metadata operations the future scheduler/BFF may admit
 * before it must queue work rather than compete with Portal identity or
 * Execution reads.
 */
export const RESEARCH_DB_BUDGET = Object.freeze({
  globalPoolMaximum: 10,
  maximumConcurrentMetadataOperations: 4,
  maximumQueuedMetadataOperations: 12,
  statementTimeoutMs: 1_500,
  lockTimeoutMs: 500,
  idleTransactionTimeoutMs: 2_000,
  maxConfigJsonBytes: 65_536,
  maxSmallMetadataJsonBytes: 16_384,
  maxArtifactManifestMetadataBytes: 262_144,
  maxArtifactParts: 512,
  maxTrialRowsPerArtifactBatch: 256,
  maxAlphaImportSourceBytes: 256 * 1024,
  maxAlphaImportMirrorBytes: 32_768,
  maxAlphaImportActiveSourcesPerActor: 32,
  maxAlphaImportCleanupRows: 128,
});

export type ResearchIntentKind =
  | "NEW"
  | "CLONE_FOR_EXPERIMENT"
  | "REPRODUCE_EXISTING"
  | "UPGRADE_ENGINE_EXPERIMENT";

export type ResearchRunKind =
  | "PRIMARY"
  | "AUDIT"
  | "DIAGNOSTIC"
  | "REPRODUCTION"
  | "EXPORT"
  | "VERIFY"
  | "PROJECTION";

export type ResearchRunRelationship =
  | "PRIMARY"
  | "AUDIT_OF_SELECTION"
  | "DIAGNOSTIC_OF_RUN"
  | "REPRODUCTION_OF_RUN"
  | "EXPORT_OF_RUN"
  | "VERIFY_OF_RUN"
  | "PROJECTION_OF_RUN";

/** P06 scheduler states are deliberately separate from the browser run model. */
export type ResearchJobKind =
  | "PRIMARY"
  | "AUDIT"
  | "DIAGNOSTIC"
  | "EXPORT"
  | "VERIFY"
  | "PROJECTION";

export type ResearchQueueClass = "INTERACTIVE" | "HEAVY" | "BACKGROUND";

/**
 * Whether one unit of durable work is required for the readiness it belongs
 * to. Job kind cannot safely imply this: an audit may be mandatory evidence
 * or an optional diagnostic. P11 will consume this fact for the readiness
 * aggregate; P06 preserves it without inventing a release decision.
 */
export type ResearchReadinessClass = "MANDATORY" | "OPTIONAL";

/**
 * Stable internal P06 scheduler policy. It contains neither a browser API nor
 * a deployment/broker setting, so future consumers cannot guess priority or
 * turn a technical retry into a new Research attempt.
 */
export const RESEARCH_DURABLE_SCHEDULER_POLICY_V1 = Object.freeze({
  schemaVersion: "research.durable-scheduler-policy.v1",
  maximumLeaseSeconds: 300,
  maximumOutboxClaimSeconds: 60,
  maximumHeavyWorkersPerWorkspace: 1,
  maximumMemoryBytes: 8 * 1024 * 1024 * 1024,
  maximumCpuSeconds: 86_400,
  maximumScratchBytes: 512 * 1024 * 1024 * 1024,
  maximumIoBytes: 1024 * 1024 * 1024 * 1024,
  retryAttemptLimitMaximum: 8,
});

export type ResearchJobState =
  | "QUEUED"
  | "CLAIMED"
  | "RUNNING"
  | "RETRY_WAIT"
  | "CANCEL_REQUESTED"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

export type ResearchTrialExecutionStatus =
  | "COMPLETE"
  | "PRUNED"
  | "FAILED"
  | "RUNNING"
  | "WAITING";

export type ResearchArtifactReferenceKind =
  | "ACTIVE_LEASE"
  | "CHILD_RUN"
  | "EXPOSURE"
  | "RELEASE_CANDIDATE"
  | "SELECTION"
  | "VERIFICATION";

export type ResearchArtifactState =
  | "WRITING"
  | "SEALED"
  | "ABORTED"
  | "CORRUPT"
  | "MISSING";

export class ResearchMetadataError extends Error {
  constructor(
    readonly code:
      | "RESEARCH_SCOPE_REQUIRED"
      | "RESEARCH_WORKSPACE_FORBIDDEN"
      | "RESEARCH_DB_ROLE_UNAVAILABLE"
      | "RESEARCH_ADMISSION_SATURATED"
      | "RESEARCH_IDEMPOTENCY_PAYLOAD_CONFLICT"
      | "RESEARCH_DRAFT_REVISION_CONFLICT"
      | "RESEARCH_DRAFT_NOT_MUTABLE"
      | "RESEARCH_ATTEMPT_NOT_FOUND"
      | "RESEARCH_RUN_NOT_FOUND"
      | "RESEARCH_CHILD_RELATION_INVALID"
      | "RESEARCH_SELECTION_SCOPE_INVALID"
      | "RESEARCH_EVALUATION_SCOPE_INVALID"
      | "RESEARCH_INSPECTION_SCOPE_INVALID"
      | "RESEARCH_IMMUTABLE_ALPHA_VERSION_CONFLICT"
      | "RESEARCH_ALPHA_IMPORT_SOURCE_NOT_FOUND"
      | "RESEARCH_ALPHA_IMPORT_SOURCE_EXPIRED"
      | "RESEARCH_ALPHA_IMPORT_GATES_REQUIRED"
      | "RESEARCH_ALPHA_IMPORT_GATES_FAILED"
      | "RESEARCH_ALPHA_IMPORT_DIGEST_ALREADY_REGISTERED"
      | "RESEARCH_ALPHA_IMPORT_ACTIVATION_CONFLICT"
      | "RESEARCH_ARTIFACT_NOT_FOUND"
      | "RESEARCH_ARTIFACT_FENCE_REJECTED"
      | "RESEARCH_ARTIFACT_LIFECYCLE_CONFLICT"
      | "RESEARCH_ARTIFACT_INGEST_CONFLICT"
      | "RESEARCH_ARTIFACT_REFERENCE_INVALID"
      | "RESEARCH_JOB_NOT_FOUND"
      | "RESEARCH_JOB_LEASE_REJECTED"
      | "RESEARCH_JOB_STATE_CONFLICT"
      | "RESEARCH_JOB_ADMISSION_REJECTED"
      | "RESEARCH_OUTBOX_NOT_FOUND"
      | "RESEARCH_INVALID_INPUT"
      | "RESEARCH_CONCURRENT_TRANSACTION",
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 503,
  ) {
    super(message);
    this.name = "ResearchMetadataError";
  }
}

export interface ResearchAlphaVersionInput {
  alphaId: string;
  name: string;
  executionSubjectId: string;
  alphaVersionId: string;
  codeDigest: string;
  entrypoint: string;
  dependencyRef: string;
  declaredContract: Record<string, unknown>;
  lifecycleState?: "DRAFT" | "ACTIVE" | "SUPERSEDED" | "ABANDONED";
}

/** P07 server-only source custody input; raw bytes never enter a browser DTO. */
export interface ResearchAlphaImportSourceInput {
  sourceFileRef: string;
  originalFilename: string;
  sourceBytes: Buffer;
  sourceDigest: string;
  analysisDigest: string;
  declaredContract: Record<string, unknown>;
  parsedMirror: readonly Record<string, unknown>[];
  expiresAt: Date;
  /** Service-configured admission ceiling; requests can never choose it. */
  maximumActiveSources: number;
}

export interface ResearchAlphaImportSourceRecord {
  sourceFileRef: string;
  originalFilename: string;
  sourceBytes: Buffer;
  sourceDigest: string;
  analysisDigest: string;
  declaredContract: Record<string, unknown>;
  parsedMirror: readonly Record<string, unknown>[];
  expiresAt: Date;
}

export interface ResearchAlphaImportGateReceiptInput {
  importSessionId: string;
  sourceFileRef: string;
  sourceDigest: string;
  sourceAnalysisDigest: string;
  gateResults: Record<string, unknown>;
  expiresAt: Date;
}

export interface ResearchAlphaImportRegistrationInput {
  alphaId: string;
  name: string;
  executionSubjectId: string;
  alphaVersionId: string;
  versionLabel: string;
  sourceFileRef: string;
  sourceDigest: string;
  analysisDigest: string;
  gateReceiptId?: string;
  entrypoint: string;
  dependencyRef: string;
  declaredContract: Record<string, unknown>;
}

export interface ResearchAlphaImportRegistration {
  alphaId: string;
  alphaVersionId: string;
  sourceDigest: string;
  supersedes: string | null;
  alphaRevision: number;
  replayed: boolean;
}

export interface ResearchAlphaActivation {
  alphaId: string;
  alphaVersionId: string;
  supersededAlphaVersionId: string | null;
  alphaRevision: number;
  replayed: boolean;
}

export interface ResearchAlphaRegistryRecord {
  alphaId: string;
  alphaVersionId: string;
  versionLabel: string;
  lifecycleState: "DRAFT" | "ACTIVE" | "SUPERSEDED" | "ABANDONED";
  entrypoint: string;
  sourceDigestPrefix: string;
  alphaRevision: number;
  registeredAt: Date;
}

export interface ResearchAttemptInput {
  attemptId: string;
  runId: string;
  clientIntentId: string;
  requestPayloadDigest: string;
  alphaVersionId?: string | null;
  parentAttemptId?: string | null;
  intentKind: ResearchIntentKind;
  reason?: string | null;
  spaceSignature?: string | null;
  requestSpecDigest: string;
  effectiveSpecDigest: string;
  engineReleaseId: string;
  datasetBindingDigest: string;
}

export interface ResearchAttemptRecord {
  workspaceId: string;
  attemptId: string;
  clientIntentId: string;
  draftRevision: number;
  state: string;
  alphaVersionId: string | null;
  runId: string;
}

export interface ResearchTrialInput {
  studyId: string;
  runId: string;
  trialId: string;
  trialOrdinal: number;
  executionStatus: ResearchTrialExecutionStatus;
  feasibilityState?: "FEASIBLE" | "INFEASIBLE" | "UNKNOWN";
  params: Record<string, unknown>;
  objectiveDefined: boolean;
  objectiveValue?: number | null;
  objectiveDefinitionId?: string | null;
}

/**
 * P05 internal storage boundary.  The browser never receives this input;
 * Python receives a reservation/fence from the durable Control API service.
 */
export interface ResearchArtifactReservationInput {
  artifactId: string;
  runId: string;
  workerAttemptId: string;
  leaseEpoch: number;
  storageLocator: string;
  retentionClass: "RESEARCH_EVIDENCE" | "EPHEMERAL_DIAGNOSTIC";
  notBeforeGcAt?: Date | null;
}

export interface ResearchArtifactReservation {
  artifactId: string;
  artifactRevision: number;
  storageLocator: string;
  state: "WRITING" | "SEALED";
  replayed: boolean;
}

export interface ResearchArtifactPartInput {
  tableKind: string;
  schemaVersion: string;
  partOrdinal: number;
  relativePath: string;
  partDigest: string;
  rowCount: number;
  byteCount: number;
  sequenceMin?: string | null;
  sequenceMax?: string | null;
}

export interface ResearchArtifactSealInput {
  artifactId: string;
  workerAttemptId: string;
  leaseEpoch: number;
  manifestDigest: string;
  manifestSchemaVersion: "research.artifact-manifest.v1";
  totalRows: number;
  totalBytes: number;
  parts: readonly ResearchArtifactPartInput[];
}

export interface ResearchArtifactReferenceInput {
  artifactId: string;
  referenceKind: ResearchArtifactReferenceKind;
  referenceId: string;
  pinnedUntil?: Date | null;
}

export interface ResearchArtifactTrialBatchInput {
  artifactId: string;
  studyId: string;
  runId: string;
  workerAttemptId: string;
  leaseEpoch: number;
  sourceRevision: number;
  batchDigest: string;
  rows: readonly ResearchTrialInput[];
}

export interface ResearchArtifactIntegrityInput {
  artifactId: string;
  state: "CORRUPT" | "MISSING";
}

/**
 * P06 accepts an explicit, bounded resource declaration. Values are estimates
 * at admission time and are reconciled with measured child usage on terminal
 * transition. Neither a browser nor a child can turn an omitted value into an
 * unlimited reservation.
 */
export interface ResearchJobCost {
  memoryBytes: number;
  cpuSeconds: number;
  scratchBytes: number;
  ioBytes: number;
}

export interface ResearchDurableJobInput {
  jobId: string;
  runId: string;
  commandId: string;
  logicalWorkKey: string;
  /** SHA-256 of P10's canonical target/config/objective/data-role/seed/runtime identity. */
  workDigest: string;
  jobKind: ResearchJobKind;
  readinessClass: ResearchReadinessClass;
  queueClass: ResearchQueueClass;
  resourceClass: string;
  cost: ResearchJobCost;
  attemptLimit?: number;
}

export interface ResearchDurableJobClaim {
  jobId: string;
  runId: string;
  jobKind: ResearchJobKind;
  /** Canonical identity bound by the producer; never inferred by a worker. */
  workDigest: string;
  readinessClass: ResearchReadinessClass;
  queueClass: ResearchQueueClass;
  resourceClass: string;
  cost: ResearchJobCost;
  workerAttemptId: string;
  leaseEpoch: number;
  leaseExpiresAt: Date;
  ordinal: number;
  cancellationVersion: number;
}

export interface ResearchWorkerUsage {
  peakRssBytes: number;
  cpuSeconds: number;
  scratchBytes: number;
  fdPeak: number;
}

export interface ResearchJobOutboxMessage {
  outboxId: string;
  jobId: string;
  eventType: "RESEARCH_JOB_QUEUED" | "RESEARCH_JOB_RETRY_READY" | "RESEARCH_JOB_CANCELLED";
  payloadDigest: string;
  payload: Readonly<Record<string, string | number>>;
  deliveryGeneration: number;
}

/**
 * A publisher lease is deliberately separate from a job lease.  A broker
 * publisher may crash after reading an ID-only outbox row; the short token
 * lets another publisher retry without claiming or re-running compute.
 */
export interface ResearchJobOutboxClaim extends ResearchJobOutboxMessage {
  claimToken: string;
  claimExpiresAt: Date;
}
