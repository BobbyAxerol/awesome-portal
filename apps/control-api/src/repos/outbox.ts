import { Inject, Injectable } from "@nestjs/common";
import { Pool } from "pg";
import { CONTROL_API_POOL } from "../tokens";

export interface OutboxMessage {
  messageId: string;
  idempotencyKey: string;
  aggregateType: string;
  aggregateId: string | null;
  eventType: string;
  actorUserId: string;
  workspaceId: string;
  requestId: string | null;
  payloadJson: Record<string, unknown>;
  responseJson: Record<string, unknown> | null;
  responseStatus: number | null;
  state: "PENDING" | "PUBLISHED" | "REPLAYED";
  createdAt: Date;
}

interface OutboxRow {
  message_id: string;
  idempotency_key: string;
  aggregate_type: string;
  aggregate_id: string | null;
  event_type: string;
  actor_user_id: string;
  workspace_id: string;
  request_id: string | null;
  payload_json: Record<string, unknown>;
  response_json: Record<string, unknown> | null;
  response_status: number | null;
  state: "PENDING" | "PUBLISHED" | "REPLAYED";
  created_at: Date;
}

function toMessage(row: OutboxRow): OutboxMessage {
  return {
    messageId: row.message_id,
    idempotencyKey: row.idempotency_key,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    eventType: row.event_type,
    actorUserId: row.actor_user_id,
    workspaceId: row.workspace_id,
    requestId: row.request_id,
    payloadJson: row.payload_json,
    responseJson: row.response_json,
    responseStatus: row.response_status,
    state: row.state,
    createdAt: row.created_at,
  };
}

@Injectable()
export class OutboxRepository {
  constructor(@Inject(CONTROL_API_POOL) private readonly pool: Pool) {}

  async findByKey(idempotencyKey: string): Promise<OutboxMessage | null> {
    const result = await this.pool.query<OutboxRow>(
      `SELECT * FROM outbox_messages WHERE idempotency_key = $1`,
      [idempotencyKey],
    );
    return result.rows[0] ? toMessage(result.rows[0]) : null;
  }

  async create(input: {
    messageId: string;
    idempotencyKey: string;
    aggregateType: string;
    aggregateId: string | null;
    eventType: string;
    actorUserId: string;
    workspaceId: string;
    requestId: string | null;
    payloadJson: Record<string, unknown>;
  }): Promise<OutboxMessage> {
    const result = await this.pool.query<OutboxRow>(
      `INSERT INTO outbox_messages
         (message_id, idempotency_key, aggregate_type, aggregate_id, event_type,
          actor_user_id, workspace_id, request_id, payload_json, state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING')
       RETURNING *`,
      [
        input.messageId,
        input.idempotencyKey,
        input.aggregateType,
        input.aggregateId,
        input.eventType,
        input.actorUserId,
        input.workspaceId,
        input.requestId,
        JSON.stringify(input.payloadJson),
      ],
    );
    return toMessage(result.rows[0]);
  }

  async storeResponse(input: {
    idempotencyKey: string;
    responseJson: Record<string, unknown> | null;
    responseStatus: number;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE outbox_messages SET response_json = $2, response_status = $3 WHERE idempotency_key = $1`,
      [input.idempotencyKey, input.responseJson, input.responseStatus],
    );
  }

  async markPublished(idempotencyKey: string): Promise<void> {
    await this.pool.query(
      `UPDATE outbox_messages SET state = 'PUBLISHED', published_at = now() WHERE idempotency_key = $1`,
      [idempotencyKey],
    );
  }
}

@Injectable()
export class ProductAuditRepository {
  constructor(@Inject(CONTROL_API_POOL) private readonly pool: Pool) {}

  async record(input: {
    eventId: string;
    eventType: string;
    actorUserId: string | null;
    workspaceId: string | null;
    requestId: string | null;
    idempotencyKey: string | null;
    aggregateType: string | null;
    aggregateId: string | null;
    aggregateVersion: number | null;
    result: "SUCCESS" | "FAILURE" | "DENIED" | "CONFLICT";
    reasonCode: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO product_audit_events
         (event_id, event_type, actor_user_id, workspace_id, request_id,
          idempotency_key, aggregate_type, aggregate_id, aggregate_version,
          result, reason_code, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        input.eventId,
        input.eventType,
        input.actorUserId,
        input.workspaceId,
        input.requestId,
        input.idempotencyKey,
        input.aggregateType,
        input.aggregateId,
        input.aggregateVersion,
        input.result,
        input.reasonCode,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ],
    );
  }
}
