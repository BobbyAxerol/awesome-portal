import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";

const scope = z.object({ workspace_id: z.string().min(1).max(256),
  environment: z.enum(["paper", "sandbox", "live"]), profile_id: z.string().min(1).max(256) }).strict();
const lease = scope.extend({ holder_id: z.string().uuid(), fencing_token: z.string().regex(/^[1-9]\d{0,18}$/),
  lease_epoch: z.string().uuid() }).strict();
export type ManagerLeaseScope = z.infer<typeof scope>;
export type ManagerProjectionLease = Readonly<z.infer<typeof lease>>;
const keys = (s: ManagerLeaseScope) => [s.workspace_id, s.environment, s.profile_id];
const duration = (ms: number) => {
  if (!Number.isSafeInteger(ms) || ms < 1 || ms > 300_000) throw new Error("MANAGER_LEASE_DURATION_INVALID");
  return ms;
};
const returning = "workspace_id,environment,profile_id,holder_id::text,fencing_token::text,lease_epoch::text";
const detached = (row: unknown): ManagerProjectionLease => Object.freeze(lease.parse(row));

/** Private Manager coordination only. No timer, source calls, API route,
 * default production TTL, or modification of the legacy polling worker. */
export class ManagerProjectionLeases {
  constructor(private readonly pool: Pool) {}
  async acquire(input: ManagerLeaseScope, holder: string, ttlMs: number): Promise<ManagerProjectionLease | null> {
    const s = scope.parse(input); z.string().uuid().parse(holder); duration(ttlMs);
    const result = await this.pool.query(`INSERT INTO execution_manager_consumer_fences
      (workspace_id,environment,profile_id,holder_id,fencing_token,lease_epoch,expires_at,validation_id)
      VALUES($1,$2,$3,$4,1,$6,clock_timestamp()+($5::bigint*interval '1 millisecond'),$7)
      ON CONFLICT(workspace_id,environment,profile_id) DO UPDATE SET holder_id=EXCLUDED.holder_id,
        fencing_token=execution_manager_consumer_fences.fencing_token+1,lease_epoch=EXCLUDED.lease_epoch,
        expires_at=clock_timestamp()+($5::bigint*interval '1 millisecond')
      WHERE execution_manager_consumer_fences.expires_at<=clock_timestamp()
      RETURNING ${returning}`, [...keys(s), holder, ttlMs, randomUUID(), randomUUID()]);
    return result.rows[0] ? detached(result.rows[0]) : null;
  }
  async renew(input: ManagerProjectionLease, ttlMs: number, notAfterMs?: number): Promise<boolean> {
    const l = lease.parse(input); duration(ttlMs);
    if (notAfterMs !== undefined && (!Number.isSafeInteger(notAfterMs) || notAfterMs < 0))
      throw new Error("MANAGER_LEASE_EXPIRY_INVALID");
    return (await this.pool.query(`UPDATE execution_manager_consumer_fences
      SET expires_at=LEAST(clock_timestamp()+($7::bigint*interval '1 millisecond'),
        COALESCE(to_timestamp($8::double precision/1000),'infinity'::timestamptz))
      WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND holder_id=$4
        AND fencing_token=$5::bigint AND lease_epoch=$6 AND expires_at>clock_timestamp()
        AND ($8::double precision IS NULL OR to_timestamp($8::double precision/1000)>clock_timestamp())`,
    [...keys(l), l.holder_id, l.fencing_token, l.lease_epoch, ttlMs, notAfterMs ?? null])).rowCount === 1;
  }
  async release(input: ManagerProjectionLease): Promise<boolean> {
    const l = lease.parse(input);
    return (await this.pool.query(`UPDATE execution_manager_consumer_fences SET holder_id=NULL,expires_at=clock_timestamp()
      WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND holder_id=$4 AND fencing_token=$5::bigint AND lease_epoch=$6`,
    [...keys(l), l.holder_id, l.fencing_token, l.lease_epoch])).rowCount === 1;
  }
  /** Ops-only private port after all writers are quiesced during restore. A DB
   * restore cannot detect its own old epoch. Never expose this as browser input. */
  async resetAfterRestore(input: ManagerLeaseScope, expectedEpoch: string, receiptRef: string): Promise<boolean> {
    const s = scope.parse(input); z.string().uuid().parse(expectedEpoch);
    z.string().min(1).max(256).regex(/^[^\u0000-\u001f\u007f]+$/).parse(receiptRef);
    return (await this.pool.query(`UPDATE execution_manager_consumer_fences
      SET holder_id=NULL,fencing_token=fencing_token+1,lease_epoch=$5,expires_at=clock_timestamp(),restore_receipt_ref=$6
      WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND lease_epoch=$4`,
    [...keys(s), expectedEpoch, randomUUID(), receiptRef])).rowCount === 1;
  }
}

/** Caller owns BEGIN/COMMIT. This row update serializes takeover and installs
 * a deferred DB expiry fence at COMMIT; a check in JS alone is insufficient. */
export async function fenceManagerProjection(client: PoolClient, input: ManagerProjectionLease, expected: ManagerLeaseScope) {
  const l = lease.parse(input), s = scope.parse(expected);
  if (JSON.stringify(keys(l)) !== JSON.stringify(keys(s))) throw new Error("MANAGER_LEASE_SCOPE_MISMATCH");
  const result = await client.query(`UPDATE execution_manager_consumer_fences SET validation_id=$7
    WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND holder_id=$4
      AND fencing_token=$5::bigint AND lease_epoch=$6 AND expires_at>clock_timestamp()`,
  [...keys(l), l.holder_id, l.fencing_token, l.lease_epoch, randomUUID()]);
  if (result.rowCount !== 1) throw new Error("MANAGER_LEASE_LOST");
  // UPDATE assigns an XID in an explicit containing transaction. With an
  // autocommit caller the next statement has no XID: fail before fact writes,
  // rather than checking a fence whose lock already disappeared.
  const transaction = await client.query("SELECT pg_current_xact_id_if_assigned()::text AS txid");
  if (!transaction.rows[0]?.txid) throw new Error("MANAGER_TRANSACTION_REQUIRED");
}
