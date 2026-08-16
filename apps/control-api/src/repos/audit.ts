import { Pool } from "pg";
import { randomId } from "../domain";

export type AuditResult = "SUCCESS" | "FAILURE" | "DENIED";

export class AuditRepository {
  constructor(private readonly pool: Pool) {}

  async record(input: {
    eventType: string;
    actorUserId?: string | null;
    targetUserId?: string | null;
    accessSubject?: string | null;
    requestId?: string | null;
    sourceIp?: string | null;
    userAgentHash?: string | null;
    result: AuditResult;
    reasonCode?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth_audit_events
         (event_id, event_type, actor_user_id, target_user_id, access_subject,
          request_id, source_ip, user_agent_hash, result, reason_code, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        randomId("evt"),
        input.eventType,
        input.actorUserId ?? null,
        input.targetUserId ?? null,
        input.accessSubject ?? null,
        input.requestId ?? null,
        input.sourceIp ?? null,
        input.userAgentHash ?? null,
        input.result,
        input.reasonCode ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ],
    );
  }
}
