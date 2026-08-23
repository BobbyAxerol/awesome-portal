import { Inject, Injectable } from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import { GovernanceError } from "../governance/governance.service";
import { CONTROL_API_POOL } from "../tokens";

export interface OperationQueueRecord {
  operationId: string;
  workspaceId: string;
  operationKind: "EXECUTION_COMMAND";
  commandKey: string;
  environment: "PAPER" | "SANDBOX" | "LIVE";
  targetType: string;
  targetId: string;
  riskTier: string;
  severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  sourceAuthority: "PORTAL" | "EXECUTION" | "BROKER";
  sourceStatus: string;
  verificationResult: string;
  triageState: "UNACKNOWLEDGED" | "ACKNOWLEDGED" | "RESOLVED";
  workflowVersion: number;
  acknowledgedAt: Date | null;
  acknowledgedByUserId: string | null;
  resolvedAt: Date | null;
  resolvedByUserId: string | null;
  resolutionReason: string | null;
  resolutionEvidenceHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OperationQueueRow extends Record<string, unknown> {
  operation_id: string;
  workspace_id: string;
  operation_kind: "EXECUTION_COMMAND";
  command_key: string;
  environment: "PAPER" | "SANDBOX" | "LIVE";
  target_type: string;
  target_id: string;
  risk_tier: string;
  severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  source_authority: "PORTAL" | "EXECUTION" | "BROKER";
  source_status: string;
  verification_result: string;
  triage_state: "UNACKNOWLEDGED" | "ACKNOWLEDGED" | "RESOLVED";
  workflow_version: number;
  acknowledged_at: Date | null;
  acknowledged_by_user_id: string | null;
  resolved_at: Date | null;
  resolved_by_user_id: string | null;
  resolution_reason: string | null;
  resolution_evidence_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

export function operationQueueRecord(row: OperationQueueRow): OperationQueueRecord {
  return {
    operationId: row.operation_id,
    workspaceId: row.workspace_id,
    operationKind: row.operation_kind,
    commandKey: row.command_key,
    environment: row.environment,
    targetType: row.target_type,
    targetId: row.target_id,
    riskTier: row.risk_tier,
    severity: row.severity,
    sourceAuthority: row.source_authority,
    sourceStatus: row.source_status,
    verificationResult: row.verification_result,
    triageState: row.triage_state,
    workflowVersion: row.workflow_version,
    acknowledgedAt: row.acknowledged_at,
    acknowledgedByUserId: row.acknowledged_by_user_id,
    resolvedAt: row.resolved_at,
    resolvedByUserId: row.resolved_by_user_id,
    resolutionReason: row.resolution_reason,
    resolutionEvidenceHash: row.resolution_evidence_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface WorkflowInput {
  workspaceId: string;
  operationId: string;
  actorUserId: string;
  requestKey: string;
  expectedVersion: number;
  eventId: string;
  auditEventId: string;
  requestId: string;
}

@Injectable()
export class OperationsWorkflowRepository {
  constructor(@Inject(CONTROL_API_POOL) readonly pool: Pool) {}

  async find(workspaceId: string, operationId: string): Promise<OperationQueueRecord | null> {
    const result = await this.pool.query<OperationQueueRow>(
      `SELECT * FROM execution_operation_queue_items
       WHERE workspace_id = $1 AND operation_id = $2`,
      [workspaceId, operationId],
    );
    return result.rows[0] ? operationQueueRecord(result.rows[0]) : null;
  }

  async acknowledge(input: WorkflowInput): Promise<{ record: OperationQueueRecord; replayed: boolean }> {
    return this.mutate(input, "ACKNOWLEDGE", null, null);
  }

  async resolve(
    input: WorkflowInput & { reason: string; evidenceHash: string },
  ): Promise<{ record: OperationQueueRecord; replayed: boolean }> {
    return this.mutate(input, "RESOLVE", input.reason, input.evidenceHash);
  }

  private async mutate(
    input: WorkflowInput,
    action: "ACKNOWLEDGE" | "RESOLVE",
    reason: string | null,
    evidenceHash: string | null,
  ): Promise<{ record: OperationQueueRecord; replayed: boolean }> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.mutateAttempt(input, action, reason, evidenceHash);
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code ?? "")
          : "";
        if ((code === "40001" || code === "40P01") && attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 10));
          continue;
        }
        throw error;
      }
    }
    throw new Error("operation workflow transaction retry budget exhausted");
  }

  private async mutateAttempt(
    input: WorkflowInput,
    action: "ACKNOWLEDGE" | "RESOLVE",
    reason: string | null,
    evidenceHash: string | null,
  ): Promise<{ record: OperationQueueRecord; replayed: boolean }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const replay = await client.query<{
        operation_id: string;
        action: string;
      }>(
        `SELECT operation_id, action FROM execution_operation_workflow_events
         WHERE workspace_id = $1 AND actor_user_id = $2 AND request_key = $3`,
        [input.workspaceId, input.actorUserId, input.requestKey],
      );
      if (replay.rows[0]) {
        if (
          replay.rows[0].operation_id !== input.operationId ||
          replay.rows[0].action !== action
        ) {
          throw new GovernanceError(
            "REQUEST_KEY_WORKFLOW_CONFLICT",
            "Request key was already used for another operation workflow action.",
            409,
          );
        }
        const record = await this.lockedRecord(client, input.workspaceId, input.operationId);
        await client.query("COMMIT");
        return { record, replayed: true };
      }

      const current = await this.lockedRecord(client, input.workspaceId, input.operationId);
      if (current.workflowVersion !== input.expectedVersion) {
        throw new GovernanceError(
          "OPERATION_WORKFLOW_VERSION_CONFLICT",
          "Operation workflow version changed.",
          409,
          { current_workflow_version: current.workflowVersion },
        );
      }
      if (action === "ACKNOWLEDGE" && current.triageState !== "UNACKNOWLEDGED") {
        throw new GovernanceError("OPERATION_NOT_ACKNOWLEDGEABLE", "Operation cannot be acknowledged.", 409);
      }
      if (action === "RESOLVE" && current.triageState !== "ACKNOWLEDGED") {
        throw new GovernanceError(
          "OPERATION_REQUIRES_ACKNOWLEDGEMENT",
          "Operation must be acknowledged before resolution.",
          409,
        );
      }

      const versionAfter = current.workflowVersion + 1;
      const updated = action === "ACKNOWLEDGE"
        ? await client.query<OperationQueueRow>(
            `UPDATE execution_operation_queue_items SET
               triage_state = 'ACKNOWLEDGED', workflow_version = $3,
               acknowledged_at = now(), acknowledged_by_user_id = $4,
               updated_at = now()
             WHERE workspace_id = $1 AND operation_id = $2 RETURNING *`,
            [input.workspaceId, input.operationId, versionAfter, input.actorUserId],
          )
        : await client.query<OperationQueueRow>(
            `UPDATE execution_operation_queue_items SET
               triage_state = 'RESOLVED', workflow_version = $3,
               resolved_at = now(), resolved_by_user_id = $4,
               resolution_reason = $5, resolution_evidence_hash = $6,
               updated_at = now()
             WHERE workspace_id = $1 AND operation_id = $2 RETURNING *`,
            [
              input.workspaceId, input.operationId, versionAfter, input.actorUserId,
              reason, evidenceHash,
            ],
          );
      await client.query(
        `INSERT INTO execution_operation_workflow_events
           (event_id, operation_id, workspace_id, actor_user_id, request_key,
            action, workflow_version_before, workflow_version_after, reason, evidence_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          input.eventId, input.operationId, input.workspaceId, input.actorUserId,
          input.requestKey, action, current.workflowVersion, versionAfter, reason, evidenceHash,
        ],
      );
      await client.query(
        `INSERT INTO product_audit_events
           (event_id, event_type, actor_user_id, workspace_id, request_id,
            idempotency_key, aggregate_type, aggregate_id, aggregate_version,
            result, reason_code, metadata_json)
         VALUES ($1, $2, $3, $4, $5, $6, 'execution_operation_workflow', $7,
                 $8, 'SUCCESS', $9, $10)`,
        [
          input.auditEventId,
          action === "ACKNOWLEDGE" ? "execution.operation.acknowledged" : "execution.operation.resolved",
          input.actorUserId, input.workspaceId, input.requestId, input.requestKey,
          input.operationId, versionAfter, action,
          JSON.stringify({
            triage_state: action === "ACKNOWLEDGE" ? "ACKNOWLEDGED" : "RESOLVED",
            source_status_unchanged: true,
            source_side_effect_requested: false,
            evidence_hash: evidenceHash,
          }),
        ],
      );
      await client.query("COMMIT");
      return { record: operationQueueRecord(updated.rows[0]), replayed: false };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async lockedRecord(
    client: PoolClient,
    workspaceId: string,
    operationId: string,
  ): Promise<OperationQueueRecord> {
    const result = await client.query<OperationQueueRow>(
      `SELECT * FROM execution_operation_queue_items
       WHERE workspace_id = $1 AND operation_id = $2 FOR UPDATE`,
      [workspaceId, operationId],
    );
    if (!result.rows[0]) {
      throw new GovernanceError("OPERATION_NOT_FOUND", "Operation not found.", 404);
    }
    return operationQueueRecord(result.rows[0]);
  }
}
