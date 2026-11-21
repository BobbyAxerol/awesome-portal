import { randomBytes } from "node:crypto";

import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";

import { CONTROL_API_POOL } from "../tokens";
import { RESEARCH_DB_BUDGET, RESEARCH_DB_RUNTIME_ROLE, type ResearchScope } from "./contracts";
import { ResearchUtilitySaturated, assertUtilityCapacity } from "./utility-admission";

/** The private observer has a <=15-second deadline. A 30-second DB slot also
 * survives process loss without permanently consuming utility capacity. */
@Injectable()
export class ResearchUtilityVerifyAdmissionService {
  private readonly logger = new Logger(ResearchUtilityVerifyAdmissionService.name);

  constructor(@Inject(CONTROL_API_POOL) private readonly pool: Pool) {}

  async withSlot<T>(scope: ResearchScope, runId: string, work: () => Promise<T>): Promise<T> {
    const slotId = randomBytes(16).toString("hex");
    await this.transaction(async (client) => {
      const member = await client.query("SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2", [scope.workspaceId, scope.actorUserId]);
      if (member.rowCount !== 1) throw new ResearchUtilitySaturated();
      await assertUtilityCapacity(client, scope.workspaceId, scope.actorUserId);
      await client.query(
        `DELETE FROM research.utility_verify_slots_v1 WHERE (workspace_id, slot_id) IN (
           SELECT workspace_id, slot_id FROM research.utility_verify_slots_v1
            WHERE workspace_id = $1 AND expires_at <= now() ORDER BY expires_at LIMIT 128
         )`,
        [scope.workspaceId],
      );
      await client.query(
        `INSERT INTO research.utility_verify_slots_v1
           (workspace_id, slot_id, actor_user_id, run_id, expires_at)
         VALUES ($1, $2, $3, $4, now() + interval '30 seconds')`,
        [scope.workspaceId, slotId, scope.actorUserId, runId],
      );
    });
    try {
      return await work();
    } finally {
      try {
        await this.transaction(async (client) => {
          await client.query(
            "DELETE FROM research.utility_verify_slots_v1 WHERE workspace_id = $1 AND slot_id = $2 AND actor_user_id = $3",
            [scope.workspaceId, slotId, scope.actorUserId],
          );
        });
      } catch {
        // The slot self-expires. Do not replace a completed byte-verification
        // receipt with a cleanup error; the next admission reaps this slot.
        this.logger.error("Research verification slot release failed; expiry remains bounded to 30 seconds.");
      }
    }
  }

  private async transaction(work: (client: PoolClient) => Promise<void>): Promise<void> {
    const client = await this.pool.connect();
    let began = false;
    try {
      await client.query("BEGIN");
      began = true;
      await client.query(`SET LOCAL ROLE ${RESEARCH_DB_RUNTIME_ROLE}`);
      await client.query("SELECT set_config('statement_timeout', $1, true)", [`${RESEARCH_DB_BUDGET.statementTimeoutMs}ms`]);
      await client.query("SELECT set_config('lock_timeout', $1, true)", [`${RESEARCH_DB_BUDGET.lockTimeoutMs}ms`]);
      await work(client);
      await client.query("COMMIT");
      began = false;
    } catch (error) {
      if (began) await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
