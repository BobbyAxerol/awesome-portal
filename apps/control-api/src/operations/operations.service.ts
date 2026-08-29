import { createHash } from "crypto";
import { Inject, Injectable } from "@nestjs/common";
import { PortalUser } from "../domain";
import { GovernanceError } from "../governance/governance.service";
import { newUlid } from "../id";
import { ProductAuditRepository } from "../repos/outbox";
import { EXECUTION_COMMAND_CATALOG } from "./catalog.generated";
import {
  ExecutionCommandCatalogueQuery,
  ExecutionCommandPlanRequest,
} from "./contracts";
import {
  ExecutionCommandPlanRecord,
  ExecutionOperationsRepository,
} from "./operations.repository";
import {
  classifyN16bProtectivePlan,
  n16bCatalogueEntry,
} from "./current-protective.acceptance";

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
    const entries = selectedEntries.map((entry) => n16bCatalogueEntry(entry));
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
        capability_state: "DISABLED" as const,
        freshness_state: "UNAVAILABLE" as const,
        policy_revision: "execution.command-catalogue.f0.v2" as const,
      },
      total_entries: EXECUTION_COMMAND_CATALOG.entries.length,
      returned_entries: entries.length,
      entries,
    };
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
}
