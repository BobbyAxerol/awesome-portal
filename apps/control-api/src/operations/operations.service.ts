import { createHash } from "crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ControlApiConfig } from "../config";
import { PortalUser } from "../domain";
import {
  ExecutionProfileReadAdapterService,
  ProjectionAdapterError,
} from "../execution/profile-read-adapter.service";
import { ProjectionEnvironment } from "../execution/profile-projection.repository";
import { GovernanceError } from "../governance/governance.service";
import { newUlid } from "../id";
import { ProductAuditRepository } from "../repos/outbox";
import { EXECUTION_COMMAND_CATALOG } from "./catalog.generated";
import { CONTROL_API_CONFIG } from "../tokens";
import {
  ExecutionCommandCatalogueQuery,
  ExecutionCommandPlanRequest,
  OperatorTaskPlanRequest,
  OperatorTaskRunRequest,
} from "./contracts";
import {
  ExecutionCommandPlanRecord,
  ExecutionOperationsRepository,
} from "./operations.repository";
import {
  classifyN16bProtectivePlan,
  n16bCatalogueEntry,
} from "./current-protective.acceptance";
import {
  operatorTask,
  operatorTaskCatalogue,
  catalogueEntryClassification,
  localR0Adapter,
  taskClassification,
} from "./operator-tasks";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonical(value), "utf8").digest("hex")}`;
}

function response(plan: ExecutionCommandPlanRecord, replayed: boolean) {
  const currentPrimitive = plan.commandKey === "ops/emergency-close"
    ? {
        id: "live.emergency-close",
        source_environment: "LIVE_FULL",
        target_types: ["ACCOUNT"],
        runtime_active: false,
        source_side_effect_requested: false,
      }
    : null;
  return {
    schema_version: "execution.command-plan.v1",
    operation_id: plan.operationId,
    command_type: "EXECUTION_COMMAND",
    command_version: 1,
    command_key: plan.commandKey,
    risk_tier: plan.riskTier,
    payload_hash: plan.payloadHash,
    plan_digest: plan.planDigest,
    status: "BLOCKED",
    blockers: plan.blockerCodes,
    warnings: plan.warningCodes,
    apply_token: null,
    expires_at: plan.expiresAt.toISOString(),
    relay_capability: "DISABLED",
    source_side_effect_requested: false,
    payload_storage_policy: "HASH_ONLY_NO_RAW",
    current_primitive: currentPrimitive,
    replayed,
  };
}

@Injectable()
export class ExecutionOperationsService {
  constructor(
    @Inject(ExecutionOperationsRepository) private readonly repository: ExecutionOperationsRepository,
    @Inject(ProductAuditRepository) private readonly audit: ProductAuditRepository,
    @Inject(ExecutionProfileReadAdapterService) private readonly localReads: ExecutionProfileReadAdapterService,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  catalogue(
    user: PortalUser,
    scope: ExecutionCommandCatalogueQuery & { workspace_id: string },
  ) {
    if (user.role !== "ADMIN") {
      throw new GovernanceError("ADMIN_ROLE_REQUIRED", "Access denied.", 403);
    }
    const selectedEntries = scope.risk_tier === undefined
      ? [...EXECUTION_COMMAND_CATALOG.entries]
      : EXECUTION_COMMAND_CATALOG.entries.filter((entry) => entry.risk_tier === scope.risk_tier);
    const entries = selectedEntries.map((entry) => {
      const accepted = n16bCatalogueEntry(entry);
      return { ...accepted, classification: catalogueEntryClassification(accepted) };
    });
    return {
      ...EXECUTION_COMMAND_CATALOG,
      scope: {
        workspace_id: scope.workspace_id,
        actor_user_id: user.userId,
        actor_role: "ADMIN" as const,
        environment: scope.environment,
        entity: scope.target_type === undefined
          ? null
          : { type: scope.target_type, id: scope.target_id! },
        requested_risk_tier: scope.risk_tier ?? null,
        capability_state: entries.some((entry) => entry.classification.state === "CONNECTED")
          ? ("PARTIAL" as const)
          : ("DISABLED" as const),
        freshness_state: "UNAVAILABLE" as const,
        policy_revision: "execution.command-catalogue.f0.v2" as const,
      },
      total_entries: EXECUTION_COMMAND_CATALOG.entries.length,
      returned_entries: entries.length,
      entries,
    };
  }

  taskCatalogue(user: PortalUser, workspaceId: string) {
    if (user.role !== "ADMIN") {
      throw new GovernanceError("ADMIN_ROLE_REQUIRED", "Access denied.", 403);
    }
    return {
      ...operatorTaskCatalogue(this.config.FEATURE_EXECUTION_LOCAL_R0_TASKS === "true"),
      scope: {
        workspace_id: workspaceId,
        actor_user_id: user.userId,
        actor_role: user.role,
      },
    };
  }

  async runTask(
    user: PortalUser,
    taskId: string,
    input: OperatorTaskRunRequest,
    requestId: string,
  ) {
    if (user.role !== "ADMIN") {
      throw new GovernanceError("ADMIN_ROLE_REQUIRED", "Access denied.", 403);
    }
    const task = this.validatedTask(taskId, input.params);
    if (task.mode !== "READ") {
      throw new GovernanceError("COMMAND_RUN_READ_ONLY", "Run is available only for R0 tasks.", 409);
    }
    const classification = taskClassification(task, this.config.FEATURE_EXECUTION_LOCAL_R0_TASKS === "true");
    const adapter = localR0Adapter(task.taskId);
    if (classification.state === "CONNECTED" && adapter !== null) {
      const environment = localTaskEnvironment(task.taskId, input.params);
      try {
        const result = await this.localReads.read(input.workspace_id, environment, adapter, input.params);
        const resultDigest = digest(result);
        await this.audit.record({
          eventId: newUlid("audit"),
          eventType: "execution.command.local_read_completed",
          actorUserId: user.userId,
          workspaceId: input.workspace_id,
          requestId,
          idempotencyKey: input.request_key,
          aggregateType: "execution_command_task",
          aggregateId: task.taskId,
          aggregateVersion: 1,
          result: "SUCCESS",
          reasonCode: "PHASE2_LOCAL_PROJECTION_TASK_ACTIVE",
          metadata: {
            classification: classification.state,
            transport: "SGP_LOCAL_PROJECTION",
            source_request_sent: false,
            params_digest: digest(input.params),
            response_digest: resultDigest,
          },
        });
        return {
          schema_version: "execution.command-run-result.v1",
          task_id: task.taskId,
          classification: "CONNECTED",
          transport: "SGP_LOCAL_PROJECTION",
          source_request_sent: false,
          response_digest: resultDigest,
          result,
        };
      } catch (error) {
        const code = error instanceof ProjectionAdapterError ? error.code : "PHASE2_LOCAL_TASK_FAILED";
        const status = error instanceof ProjectionAdapterError ? error.status : 503;
        await this.audit.record({
          eventId: newUlid("audit"), eventType: "execution.command.local_read_failed",
          actorUserId: user.userId, workspaceId: input.workspace_id, requestId,
          idempotencyKey: input.request_key, aggregateType: "execution_command_task",
          aggregateId: task.taskId, aggregateVersion: 1, result: "FAILURE", reasonCode: code,
          metadata: { classification: classification.state, source_request_sent: false, params_digest: digest(input.params) },
        });
        throw new GovernanceError(code, "The local projection task is unavailable.", status, {
          task_id: task.taskId, source_request_sent: false,
        });
      }
    }
    await this.audit.record({
      eventId: newUlid("audit"),
      eventType: "execution.command.run_rejected",
      actorUserId: user.userId,
      workspaceId: input.workspace_id,
      requestId,
      idempotencyKey: input.request_key,
      aggregateType: "execution_command_task",
      aggregateId: task.taskId,
      aggregateVersion: 1,
      result: "DENIED",
      reasonCode: classification.reason_code,
      metadata: {
        classification: classification.state,
        source_request_sent: false,
        transcript_lines: 0,
        params_digest: digest(input.params),
      },
    });
    throw new GovernanceError(
      classification.reason_code,
      "The published read operation is not active through the Portal command transport.",
      classification.state === "SEMANTICALLY_INCOMPATIBLE" ? 422 : 409,
      { task_id: task.taskId, classification: classification.state, source_request_sent: false },
    );
  }

  async planTask(
    user: PortalUser,
    taskId: string,
    input: OperatorTaskPlanRequest,
    requestId: string,
  ) {
    if (user.role !== "ADMIN") {
      throw new GovernanceError("ADMIN_ROLE_REQUIRED", "Access denied.", 403);
    }
    const task = this.validatedTask(taskId, input.params);
    if (task.mode === "READ" || task.mode === "BLOCKED" || task.catalogKey === null) {
      const classification = taskClassification(task, this.config.FEATURE_EXECUTION_LOCAL_R0_TASKS === "true");
      throw new GovernanceError(
        classification.reason_code,
        "This task has no governed mutation plan path.",
        422,
        { task_id: task.taskId, classification: classification.state },
      );
    }
    if (typeof input.params.reason !== "string" || input.params.reason.trim().length < 8) {
      throw new GovernanceError("COMMAND_REASON_REQUIRED", "A bounded operator reason is required.", 400);
    }
    return this.plan(user, {
      schema_version: "execution.command-plan-request.v1",
      workspace_id: input.workspace_id,
      request_key: input.request_key,
      command_type: "EXECUTION_COMMAND",
      command_version: 1,
      command_key: task.catalogKey,
      environment: input.environment,
      target: input.target,
      expected_target_version: input.expected_target_version,
      payload: input.params,
      conditions: input.conditions,
    }, requestId);
  }

  async plan(user: PortalUser, input: ExecutionCommandPlanRequest, requestId: string) {
    if (user.role !== "ADMIN") {
      await this.audit.record({
        eventId: newUlid("audit"),
        eventType: "execution.command.plan_rejected",
        actorUserId: user.userId,
        workspaceId: input.workspace_id,
        requestId,
        idempotencyKey: input.request_key,
        aggregateType: "execution_command",
        aggregateId: null,
        aggregateVersion: 1,
        result: "DENIED",
        reasonCode: "ADMIN_ROLE_REQUIRED",
      });
      throw new GovernanceError("ADMIN_ROLE_REQUIRED", "Access denied.", 403);
    }
    const entry = EXECUTION_COMMAND_CATALOG.entries.find(
      (candidate) => candidate.key === input.command_key,
    );
    if (!entry) {
      await this.audit.record({
        eventId: newUlid("audit"),
        eventType: "execution.command.plan_rejected",
        actorUserId: user.userId,
        workspaceId: input.workspace_id,
        requestId,
        idempotencyKey: input.request_key,
        aggregateType: "execution_command",
        aggregateId: null,
        aggregateVersion: 1,
        result: "DENIED",
        reasonCode: "UNKNOWN_EXECUTION_COMMAND",
      });
      throw new GovernanceError("UNKNOWN_EXECUTION_COMMAND", "Unknown execution command.", 400);
    }
    const payloadHash = digest({
      command_type: input.command_type,
      command_version: input.command_version,
      command_key: input.command_key,
      environment: input.environment,
      target: input.target,
      expected_target_version: input.expected_target_version,
      payload: input.payload,
      conditions: input.conditions,
    });
    const n16b = classifyN16bProtectivePlan(input);
    const entryBlockedReason = n16b.state === "NOT_N16B_CAPABILITY"
      ? entry.blocked_reason
      : n16b.blocker!;
    const blockers = [...new Set([
      "COMMAND_RELAY_DISABLED",
      entryBlockedReason,
      ...(entry.owner_review_required ? ["OWNER_REVIEW_REQUIRED"] : []),
    ])].sort();
    const planDigest = digest({
      payload_hash: payloadHash,
      catalog_revision: EXECUTION_COMMAND_CATALOG.catalogue_revision,
      catalog_source: EXECUTION_COMMAND_CATALOG.source,
      risk_tier: entry.risk_tier,
      blockers,
      relay_capability: "DISABLED",
    });
    const created = await this.repository.create({
      operationId: newUlid("op"),
      workspaceId: input.workspace_id,
      actorUserId: user.userId,
      requestKey: input.request_key,
      commandKey: input.command_key,
      environment: input.environment,
      targetType: input.target.type,
      targetId: input.target.id,
      expectedTargetVersion: input.expected_target_version,
      payloadHash,
      planDigest,
      conditions: input.conditions,
      riskTier: entry.risk_tier,
      blockerCodes: blockers,
      warningCodes: [],
      expiresAt: new Date(Date.now() + 5 * 60_000),
      requestId,
      auditEventId: newUlid("audit"),
    });
    if (!created.created && created.record.payloadHash !== payloadHash) {
      await this.audit.record({
        eventId: newUlid("audit"),
        eventType: "execution.command.plan_rejected",
        actorUserId: user.userId,
        workspaceId: input.workspace_id,
        requestId,
        idempotencyKey: input.request_key,
        aggregateType: "execution_command",
        aggregateId: created.record.operationId,
        aggregateVersion: 1,
        result: "CONFLICT",
        reasonCode: "REQUEST_KEY_PAYLOAD_CONFLICT",
        metadata: { source_side_effect_requested: false },
      });
      throw new GovernanceError(
        "REQUEST_KEY_PAYLOAD_CONFLICT",
        "Request key was already used for another intent.",
        409,
      );
    }
    return response(created.record, !created.created);
  }

  async apply(
    user: PortalUser,
    workspaceId: string,
    operationId: string,
    requestId: string,
  ): Promise<never> {
    const plan = await this.repository.find(workspaceId, user.userId, operationId);
    if (!plan) throw new GovernanceError("OPERATION_NOT_FOUND", "Operation not found.", 404);
    await this.audit.record({
      eventId: newUlid("audit"),
      eventType: "execution.command.apply_rejected",
      actorUserId: user.userId,
      workspaceId,
      requestId,
      idempotencyKey: `apply:${operationId}`,
      aggregateType: "execution_command",
      aggregateId: operationId,
      aggregateVersion: 1,
      result: "DENIED",
      reasonCode: "COMMAND_RELAY_DISABLED",
      metadata: { source_request_sent: false, retry_allowed: false },
    });
    throw new GovernanceError(
      "COMMAND_RELAY_DISABLED",
      "Execution command relay is disabled in EX-BE-05b/F0.",
      409,
      { operation_id: operationId, source_request_sent: false, retry_allowed: false },
    );
  }

  async operationOrNull(user: PortalUser, workspaceId: string, operationId: string) {
    const plan = await this.repository.find(workspaceId, user.userId, operationId);
    if (!plan) return null;
    return {
      schema_version: "execution.command-operation.v1",
      operation_id: plan.operationId,
      command_type: "EXECUTION_COMMAND",
      command_key: plan.commandKey,
      status: "BLOCKED",
      verification_result: "NOT_STARTED",
      blockers: plan.blockerCodes,
      warnings: plan.warningCodes,
      relay_receipt: null,
      source_side_effect_requested: false,
      created_at: plan.createdAt.toISOString(),
      updated_at: plan.updatedAt.toISOString(),
    };
  }

  private validatedTask(taskId: string, params: Record<string, unknown>) {
    const task = operatorTask(taskId);
    if (!task) throw new GovernanceError("UNKNOWN_OPERATOR_TASK", "Unknown operator task.", 404);
    const supplied = Object.keys(params);
    if (supplied.some((key) => !task.parameterKeys.includes(key))) {
      throw new GovernanceError(
        "COMMAND_PARAM_NOT_DECLARED",
        "A parameter is outside the task's typed allowlist.",
        400,
      );
    }
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string" && /(?:bearer\s|password|secret|token|api[_-]?key)\s*[:=]/i.test(value)) {
        throw new GovernanceError("COMMAND_SENSITIVE_VALUE_REJECTED", "Credential-like input is forbidden.", 400);
      }
      if (task.mode === "READ" && key === "limit") {
        if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 200) {
          throw new GovernanceError("COMMAND_PARAM_INVALID", "Task limit must be an integer from 1 to 200.", 400);
        }
      } else if (task.mode === "READ" && value !== null && typeof value !== "boolean" &&
          (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(value))) {
        throw new GovernanceError("COMMAND_PARAM_INVALID", "Task input is outside the typed identifier allowlist.", 400);
      }
    }
    return task;
  }
}

function localTaskEnvironment(taskId: string, params: Record<string, unknown>): ProjectionEnvironment {
  if (taskId === "capital" || taskId === "performance") return "paper";
  const raw = typeof params.mode === "string" ? params.mode.toLowerCase() : null;
  if (raw === "paper" || raw === "sandbox" || raw === "live") {
    if (taskId === "broker-read" && raw === "paper") {
      throw new GovernanceError("PHASE2_BROKER_READ_PROFILE_INVALID", "Broker read accepts Sandbox or Live.", 400);
    }
    return raw;
  }
  if (raw !== null && raw !== "all") {
    throw new GovernanceError("PHASE2_LOCAL_TASK_MODE_INVALID", "Task mode is outside the accepted profile set.", 400);
  }
  return taskId === "broker-read" ? "sandbox" : "paper";
}
