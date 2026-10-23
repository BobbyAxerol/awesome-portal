import { Inject, Injectable } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";
import { CONTROL_API_POOL } from "../tokens";
import type { DigestBaseline } from "./visit-digest";
import { CommandCenterError } from "./command-center.service";

export interface VisitDigestTransaction {
  read(): Promise<DigestBaseline | null>;
  write(value: DigestBaseline): Promise<void>;
}
@Injectable()
export class VisitDigestStore {
  private inflight = 0;
  constructor(@Inject(CONTROL_API_POOL) private readonly pool: Pool) {}
  private async load(db: Pick<PoolClient, "query">, userId: string, workspaceId: string) {
    const result = await db.query<{ version: number; seen_at: Date; snapshot_revision: string; fingerprints: Record<string,string> }>(
      `SELECT version,seen_at,snapshot_revision,fingerprints FROM execution_visit_baselines WHERE user_id=$1 AND workspace_id=$2`, [userId, workspaceId]);
    const row = result.rows[0];
    return row ? { ...row, seen_at: row.seen_at.toISOString() } : null;
  }
  read(userId: string, workspaceId: string): Promise<DigestBaseline | null> { return this.load(this.pool, userId, workspaceId); }
  /** Final read authorization/source fence must finish before this transaction commits. */
  async transaction<T>(userId: string, workspaceId: string, operation: (tx: VisitDigestTransaction) => Promise<T>): Promise<T> {
    // Keep at least one Core connection free for the nested current-authority
    // reads. A one-connection profile cannot support this operation safely.
    const capacity = Math.max(0, Math.min(2, (this.pool.options?.max ?? 10) - 1));
    if (this.inflight >= capacity) throw new CommandCenterError("VISIT_DIGEST_BUSY", "Try marking the digest seen again shortly.", 503);
    this.inflight++;
    let client: PoolClient | undefined;
    try {
      client = await this.pool.connect();
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout = '5s'");
      const locked = await client.query<{locked: boolean}>("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked", [JSON.stringify(["visit-digest", userId, workspaceId])]);
      if (!locked.rows[0]?.locked) throw new CommandCenterError("VISIT_DIGEST_BUSY", "Try marking the digest seen again shortly.", 503);
      const db = client;
      const result = await operation({ read: () => this.load(db, userId, workspaceId), write: async value => {
        if (Object.keys(value.fingerprints).length > 200 || Buffer.byteLength(JSON.stringify(value.fingerprints)) > 98304)
          throw new Error("VISIT_DIGEST_BASELINE_LIMIT");
        await db.query(`INSERT INTO execution_visit_baselines(user_id,workspace_id,version,seen_at,snapshot_revision,fingerprints)
          VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(user_id,workspace_id) DO UPDATE SET
          version=EXCLUDED.version,seen_at=EXCLUDED.seen_at,snapshot_revision=EXCLUDED.snapshot_revision,fingerprints=EXCLUDED.fingerprints`,
        [userId, workspaceId, value.version, value.seen_at, value.snapshot_revision, JSON.stringify(value.fingerprints)]);
      }});
      await client.query("COMMIT"); return result;
    } catch (error) { if (client) await client.query("ROLLBACK").catch(() => undefined); throw error; }
    finally { client?.release(); this.inflight--; }
  }
}
