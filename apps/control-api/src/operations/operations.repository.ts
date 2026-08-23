import { Inject, Injectable } from "@nestjs/common";
import { Pool } from "pg";
import { CONTROL_API_POOL } from "../tokens";
import { TypedCondition } from "./contracts";

export interface ExecutionCommandPlanRecord {
  operationId: string;
  workspaceId: string;
  actorUserId: string;
  requestKey: string;
  commandKey: string;
  environment: "PAPER" | "SANDBOX" | "LIVE";
  targetType: string;
  targetId: string;
  expectedTargetVersion: number;
  payloadHash: string;
  planDigest: string;
  conditions: TypedCondition[];
  riskTier: string;
  blockerCodes: string[];
  warningCodes: string[];
  status: "BLOCKED";
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface PlanRow {
  operation_id: string;
  workspace_id: string;
  actor_user_id: string;
  request_key: string;
  command_key: string;
  environment: "PAPER" | "SANDBOX" | "LIVE";
  target_type: string;
  target_id: string;
  expected_target_version: number;
  payload_hash: string;
  plan_digest: string;
  conditions: TypedCondition[];
  risk_tier: string;
  blocker_codes: string[];
  warning_codes: string[];
  status: "BLOCKED";
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

function plan(row: PlanRow): ExecutionCommandPlanRecord {
  return {
    operationId: row.operation_id,
    workspaceId: row.workspace_id,
    actorUserId: row.actor_user_id,
    requestKey: row.request_key,
    commandKey: row.command_key,
    environment: row.environment,
    targetType: row.target_type,
    targetId: row.target_id,
    expectedTargetVersion: row.expected_target_version,
    payloadHash: row.payload_hash,
    planDigest: row.plan_digest,
    conditions: row.conditions,
    riskTier: row.risk_tier,
    blockerCodes: row.blocker_codes,
    warningCodes: row.warning_codes,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

@Injectable()
export class ExecutionOperationsRepository {
  constructor(@Inject(CONTROL_API_POOL) readonly pool: Pool) {}

  async findByRequestKey(
    workspaceId: string,
    actorUserId: string,
    requestKey: string,
  ): Promise<ExecutionCommandPlanRecord | null> {
    const result = await this.pool.query<PlanRow>(
      `SELECT * FROM execution_command_plans_f0
       WHERE workspace_id = $1 AND actor_user_id = $2 AND request_key = $3`,
      [workspaceId, actorUserId, requestKey],
    );
    return result.rows[0] ? plan(result.rows[0]) : null;
  }

  async find(
    workspaceId: string,
    actorUserId: string,
    operationId: string,
  ): Promise<ExecutionCommandPlanRecord | null> {
    const result = await this.pool.query<PlanRow>(
      `SELECT * FROM execution_command_plans_f0
       WHERE workspace_id = $1 AND actor_user_id = $2 AND operation_id = $3`,
      [workspaceId, actorUserId, operationId],
    );
    return result.rows[0] ? plan(result.rows[0]) : null;
  }

  async create(input: {
    operationId: string;
    workspaceId: string;
    actorUserId: string;
    requestKey: string;
    commandKey: string;
    environment: "PAPER" | "SANDBOX" | "LIVE";
    targetType: string;
    targetId: string;
    expectedTargetVersion: number;
    payloadHash: string;
    planDigest: string;
    conditions: TypedCondition[];
    riskTier: string;
    blockerCodes: string[];
    warningCodes: string[];
    expiresAt: Date;
    requestId: string;
    auditEventId: string;
  }): Promise<{ record: ExecutionCommandPlanRecord; created: boolean }> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        const inserted = await client.query<PlanRow>(
          `INSERT INTO execution_command_plans_f0
             (operation_id, workspace_id, actor_user_id, request_key, command_key,
              environment, target_type, target_id, expected_target_version,
              payload_hash, plan_digest, payload_json, conditions, risk_tier,
              blocker_codes, warning_codes, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, '{}'::jsonb, $12,
                   $13, $14, $15, $16)
           ON CONFLICT (workspace_id, actor_user_id, request_key) DO NOTHING
           RETURNING *`,
          [
            input.operationId, input.workspaceId, input.actorUserId, input.requestKey,
            input.commandKey, input.environment, input.targetType, input.targetId,
            input.expectedTargetVersion, input.payloadHash, input.planDigest,
            JSON.stringify(input.conditions), input.riskTier,
            input.blockerCodes, input.warningCodes, input.expiresAt,
          ],
        );
        if (inserted.rows[0]) {
          await client.query(
            `INSERT INTO product_audit_events
               (event_id, event_type, actor_user_id, workspace_id, request_id,
                idempotency_key, aggregate_type, aggregate_id, aggregate_version,
                result, reason_code, metadata_json)
             VALUES ($1, 'execution.command.plan_blocked', $2, $3, $4, $5,
                     'execution_command', $6, 1, 'DENIED', 'COMMAND_RELAY_DISABLED', $7)`,
            [
              input.auditEventId, input.actorUserId, input.workspaceId, input.requestId,
              input.requestKey, input.operationId,
              JSON.stringify({
                command_key: input.commandKey,
                payload_hash: input.payloadHash,
                plan_digest: input.planDigest,
                blocker_codes: input.blockerCodes,
                payload_storage_policy: "HASH_ONLY_NO_RAW",
                source_side_effect_requested: false,
              }),
            ],
          );
          await client.query("COMMIT");
          return { record: plan(inserted.rows[0]), created: true };
        }
        const existing = await client.query<PlanRow>(
          `SELECT * FROM execution_command_plans_f0
           WHERE workspace_id = $1 AND actor_user_id = $2 AND request_key = $3`,
          [input.workspaceId, input.actorUserId, input.requestKey],
        );
        await client.query("COMMIT");
        return { record: plan(existing.rows[0]), created: false };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        const code = typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code ?? "")
          : "";
        if ((code === "40001" || code === "40P01") && attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 10));
          continue;
        }
        throw error;
      } finally {
        client.release();
      }
    }
    throw new Error("execution plan transaction retry budget exhausted");
  }
}
