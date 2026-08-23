import { Inject, Injectable } from "@nestjs/common";
import { ControlApiConfig, querySigningKeys } from "../config";
import { PortalUser } from "../domain";
import { newUlid } from "../id";
import {
  ControlPlaneQueryService,
  KeysetCursorCodec,
  PostgresListResource,
  RawFilterInput,
  RawKeysetQuery,
} from "../query";
import { CONTROL_API_CONFIG } from "../tokens";
import {
  OperationAcknowledgeRequest,
  OperationQueueQuery,
  OperationResolveRequest,
} from "./contracts";
import {
  OperationQueueRecord,
  OperationQueueRow,
  operationQueueRecord,
  OperationsWorkflowRepository,
} from "./workflow.repository";
import { GovernanceError } from "../governance/governance.service";

const OPERATION_COLUMNS = [
  "operation_id", "workspace_id", "operation_kind", "command_key", "environment",
  "target_type", "target_id", "risk_tier", "severity", "source_authority",
  "source_status", "verification_result", "triage_state", "workflow_version",
  "acknowledged_at", "acknowledged_by_user_id", "resolved_at", "resolved_by_user_id",
  "resolution_reason", "resolution_evidence_hash", "created_at", "updated_at",
] as const;

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function publicOperation(record: OperationQueueRecord) {
  return {
    operation_id: record.operationId,
    operation_kind: record.operationKind,
    command_key: record.commandKey,
    environment: record.environment,
    target: { type: record.targetType, id: record.targetId },
    risk_tier: record.riskTier,
    severity: record.severity,
    source_authority: record.sourceAuthority,
    source_status: record.sourceStatus,
    verification_result: record.verificationResult,
    triage_state: record.triageState,
    workflow_version: record.workflowVersion,
    acknowledged_at: iso(record.acknowledgedAt),
    acknowledged_by_user_id: record.acknowledgedByUserId,
    resolved_at: iso(record.resolvedAt),
    resolved_by_user_id: record.resolvedByUserId,
    resolution_reason: record.resolutionReason,
    resolution_evidence_hash: record.resolutionEvidenceHash,
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
  };
}

const operationQueueResource: PostgresListResource<OperationQueueRow, ReturnType<typeof publicOperation>> = {
  resourceId: "execution.operations-queue",
  table: "execution_operation_queue_items",
  selectColumns: OPERATION_COLUMNS,
  workspaceColumn: "workspace_id",
  idSortField: "operation_id",
  filters: {
    triage_state: {
      column: "triage_state", kind: "enum", operators: ["eq"],
      enumValues: ["UNACKNOWLEDGED", "ACKNOWLEDGED", "RESOLVED"],
    },
    environment: {
      column: "environment", kind: "enum", operators: ["eq"],
      enumValues: ["PAPER", "SANDBOX", "LIVE"],
    },
    source_status: {
      column: "source_status", kind: "enum", operators: ["eq"],
      enumValues: ["BLOCKED", "PENDING", "RUNNING", "SUCCEEDED", "FAILED", "EXPIRED", "UNCERTAIN"],
    },
    verification_result: {
      column: "verification_result", kind: "enum", operators: ["eq"],
      enumValues: ["NOT_STARTED", "PENDING", "SUCCEEDED", "FAILED", "PARTIAL", "UNCERTAIN", "DENIED", "EXPIRED"],
    },
    severity: {
      column: "severity", kind: "enum", operators: ["eq"],
      enumValues: ["INFO", "WARNING", "ERROR", "CRITICAL"],
    },
    target_type: { column: "target_type", kind: "text", operators: ["eq"] },
    command_key: { column: "command_key", kind: "text", operators: ["eq"] },
  },
  sorts: {
    created_at: { column: "created_at", kind: "timestamp" },
    operation_id: { column: "operation_id", kind: "text" },
  },
  defaultSort: [{ field: "created_at", direction: "desc" }],
  allowedRoles: ["ADMIN"],
  statementTimeoutMs: 2_000,
  mapRow: (row) => publicOperation(operationQueueRecord(row)),
};

function listQuery(query: OperationQueueQuery): RawKeysetQuery {
  const filters: RawFilterInput[] = [];
  for (const field of [
    "triage_state", "environment", "source_status", "verification_result",
    "severity", "target_type", "command_key",
  ] as const) {
    const value = query[field];
    if (value !== undefined) filters.push({ field, op: "eq", value });
  }
  return {
    after: query.after,
    before: query.before,
    limit: query.limit,
    sort: query.sort,
    filters,
  };
}

@Injectable()
export class OperationsWorkflowService {
  private readonly query: ControlPlaneQueryService;

  constructor(
    @Inject(OperationsWorkflowRepository) private readonly repository: OperationsWorkflowRepository,
    @Inject(CONTROL_API_CONFIG) config: ControlApiConfig,
  ) {
    this.query = new ControlPlaneQueryService(
      repository.pool,
      new KeysetCursorCodec({
        activeKeyId: config.QUERY_CURSOR_ACTIVE_KEY_ID,
        keys: querySigningKeys(config),
        ttlSeconds: config.QUERY_CURSOR_TTL_SECONDS,
      }),
    );
  }

  async list(user: PortalUser, workspaceId: string, query: OperationQueueQuery) {
    const page = await this.query.list(
      operationQueueResource,
      { actorId: user.userId, workspaceId, role: user.role },
      listQuery(query),
    );
    return {
      schema_version: "execution.operations-queue.v1",
      record_authority: "PORTAL",
      delivery_profile: "fixture",
      source_integration_state: "UNAVAILABLE",
      read_at: new Date().toISOString(),
      actor: { user_id: user.userId, username: user.username, roles: [user.role] },
      page,
    };
  }

  async acknowledge(
    user: PortalUser,
    operationId: string,
    input: OperationAcknowledgeRequest,
    requestId: string,
  ) {
    this.assertAdmin(user);
    const result = await this.repository.acknowledge({
      workspaceId: input.workspace_id,
      operationId,
      actorUserId: user.userId,
      requestKey: input.request_key,
      expectedVersion: input.expected_workflow_version,
      eventId: newUlid("owf"),
      auditEventId: newUlid("aud"),
      requestId,
    });
    return this.mutationResponse(result.record, result.replayed);
  }

  async resolve(
    user: PortalUser,
    operationId: string,
    input: OperationResolveRequest,
    requestId: string,
  ) {
    this.assertAdmin(user);
    const result = await this.repository.resolve({
      workspaceId: input.workspace_id,
      operationId,
      actorUserId: user.userId,
      requestKey: input.request_key,
      expectedVersion: input.expected_workflow_version,
      reason: input.reason,
      evidenceHash: input.evidence_hash,
      eventId: newUlid("owf"),
      auditEventId: newUlid("aud"),
      requestId,
    });
    return this.mutationResponse(result.record, result.replayed);
  }

  private assertAdmin(user: PortalUser): void {
    if (user.role !== "ADMIN") {
      throw new GovernanceError("ADMIN_ROLE_REQUIRED", "Access denied.", 403);
    }
  }

  private mutationResponse(record: OperationQueueRecord, replayed: boolean) {
    return {
      schema_version: "execution.operation-workflow.v1",
      record_authority: "PORTAL",
      delivery_profile: "fixture",
      source_integration_state: "UNAVAILABLE",
      source_status_unchanged: true,
      source_side_effect_requested: false,
      replayed,
      operation: publicOperation(record),
    };
  }
}
