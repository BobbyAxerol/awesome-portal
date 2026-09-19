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

export type ResearchTrialExecutionStatus =
  | "COMPLETE"
  | "PRUNED"
  | "FAILED"
  | "RUNNING"
  | "WAITING";

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
