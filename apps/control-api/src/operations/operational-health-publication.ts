import type { Pool } from "pg";
import { z } from "zod";
import { accessDigest } from "../execution-v2/access-digest";
import { operationalDeliveryStates, operationalDisplayStates, operationalTargets } from "./operational-read.contract";

const text = z.string().min(1).max(191).regex(/^[^\u0000-\u001f\u007f]+$(?![\s\S])/u);
const time = z.string().datetime().refine(value => Date.parse(value) >= 0);
const sequence = z.string().regex(/^[1-9][0-9]{0,18}$(?![\s\S])/u);
/** Private owning-source input, NOT a public request or a grant. Delivery is
 * not execution success; display is not a heartbeat or source_status alias. */
export const operationalHealthPublication = z.object({
  schema_version: z.literal("portal.internal.operation-health-publication.v1"),
  workspace_id: text, source_ref: text, source_epoch: text, source_revision: text,
  source_sequence: sequence, previous_revision: text.nullable(),
  source_as_of: time, expires_at: time,
  rows: z.array(z.object({ operation_id: text,
    target_type: z.enum(operationalTargets), target_id: text,
    environment: z.enum(["PAPER", "SANDBOX", "LIVE"]),
    workflow_version: z.number().int().positive().max(2_147_483_647),
    delivery_state: z.enum(operationalDeliveryStates).nullable(),
    display_state: z.enum(operationalDisplayStates).nullable(),
  }).strict()).max(2000),
}).strict().superRefine((value, ctx) => {
  if (Date.parse(value.expires_at) <= Date.parse(value.source_as_of) ||
    new Set(value.rows.map(row => row.operation_id)).size !== value.rows.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "OPERATIONAL_HEALTH_PUBLICATION_INVALID" });
});
export type OperationalHealthPublication = z.infer<typeof operationalHealthPublication>;

export class OperationalHealthPublicationError extends Error {
  constructor(readonly code: "OPERATIONAL_HEALTH_PUBLICATION_INVALID" | "OPERATIONAL_HEALTH_SOURCE_CHANGED" |
    "OPERATIONAL_HEALTH_CURSOR_MISMATCH" | "OPERATIONAL_HEALTH_RECEIPT_CONFLICT" |
    "OPERATIONAL_HEALTH_CAPACITY" | "OPERATIONAL_HEALTH_TARGET_CHANGED") { super(code); }
}
const fail = (code: OperationalHealthPublicationError["code"]): never => { throw new OperationalHealthPublicationError(code); };

/** Explicit server installation only. The owner verifies its authenticated
 * envelope and holds source custody THROUGH commit. This port has no default
 * that trusts a JSON qualification string or test constants. It grants no
 * browser/current/history/STREAM/command authority. */
export interface OperationalHealthPublicationBinding {
  workspaceId: string; sourceRef: string; sourceEpoch: string;
  maximumReceipts: number;
  withVerifiedSource<T>(publication: Readonly<OperationalHealthPublication>, write: () => Promise<T>): Promise<T>;
}

/** One finite source batch, atomic receipt + cursor + projection. No network,
 * background poller, automatic provider, source ACK or public mutation route.
 * Receipts never expire/delete automatically; bounded capacity refuses new
 * publication until its owner explicitly handles retention. */
export class OperationalHealthPublicationRepository {
  private readonly binding: OperationalHealthPublicationBinding;
  constructor(private readonly pool: Pool, binding: OperationalHealthPublicationBinding,
    private readonly now: () => number = Date.now) {
    if (![binding.workspaceId, binding.sourceRef, binding.sourceEpoch].every(value => text.safeParse(value).success) ||
      !Number.isSafeInteger(binding.maximumReceipts) || binding.maximumReceipts < 1 || binding.maximumReceipts > 10_000 ||
      typeof binding.withVerifiedSource !== "function") throw new Error("OPERATIONAL_HEALTH_BINDING_INVALID");
    this.binding = Object.freeze({ ...binding });
  }

  async publish(input: unknown): Promise<{ state: "COMMITTED" | "REPLAY"; receipt_digest: string }> {
    let publication: OperationalHealthPublication;
    try {
      const raw = JSON.stringify(input);
      if (typeof raw !== "string" || Buffer.byteLength(raw) > 524_288) return fail("OPERATIONAL_HEALTH_PUBLICATION_INVALID");
      publication = operationalHealthPublication.parse(input);
    } catch { return fail("OPERATIONAL_HEALTH_PUBLICATION_INVALID"); }
    const p = publication, b = this.binding;
    if (p.workspace_id !== b.workspaceId || p.source_ref !== b.sourceRef || p.source_epoch !== b.sourceEpoch)
      return fail("OPERATIONAL_HEALTH_SOURCE_CHANGED");
    const validTime = () => {
      const now = this.now();
      if (!Number.isSafeInteger(now) || Date.parse(p.source_as_of) > now || Date.parse(p.expires_at) <= now)
        return fail("OPERATIONAL_HEALTH_SOURCE_CHANGED");
    };
    validTime();
    const receipt = accessDigest(p);
    // Pass a detached object to the source verifier. Its mutation cannot
    // change the captured data/digest ultimately written to PostgreSQL.
    return b.withVerifiedSource(structuredClone(p), async () => {
      const db = await this.pool.connect();
      try {
        await db.query("BEGIN");
        await db.query("SET LOCAL statement_timeout='2000ms'");
        await db.query("SET LOCAL lock_timeout='1000ms'");
        await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [JSON.stringify([p.workspace_id, p.source_ref])]);
        validTime();
        const head = (await db.query<{ source_epoch: string; source_sequence: string; source_revision: string; source_as_of_ms: string; retired: boolean }>(
          `SELECT source_epoch,source_sequence::text,source_revision,
            (extract(epoch FROM source_as_of)*1000)::bigint::text AS source_as_of_ms,retired
           FROM execution_operation_health_heads WHERE workspace_id=$1 AND source_ref=$2 FOR UPDATE`,
          [p.workspace_id, p.source_ref])).rows[0];
        if (head && (head.retired || head.source_epoch !== p.source_epoch)) return fail("OPERATIONAL_HEALTH_SOURCE_CHANGED");
        const existing = (await db.query<{ payload_digest: string }>(
          `SELECT payload_digest FROM execution_operation_health_receipts
           WHERE workspace_id=$1 AND source_ref=$2 AND source_revision=$3`,
          [p.workspace_id, p.source_ref, p.source_revision])).rows[0];
        if (existing) {
          if (existing.payload_digest !== receipt) return fail("OPERATIONAL_HEALTH_RECEIPT_CONFLICT");
          validTime(); await db.query("COMMIT");
          return { state: "REPLAY" as const, receipt_digest: receipt };
        }
        if (head ? p.previous_revision !== head.source_revision || BigInt(p.source_sequence) !== BigInt(head.source_sequence) + 1n ||
          Date.parse(p.source_as_of) < Number(head.source_as_of_ms) : p.previous_revision !== null || p.source_sequence !== "1")
          return fail("OPERATIONAL_HEALTH_CURSOR_MISMATCH");
        const retained = (await db.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM execution_operation_health_receipts WHERE workspace_id=$1 AND source_ref=$2",
          [p.workspace_id, p.source_ref])).rows[0]!;
        if (BigInt(retained.count) >= BigInt(b.maximumReceipts)) return fail("OPERATIONAL_HEALTH_CAPACITY");
        if (p.rows.length) {
          const targets = (await db.query<{ operation_id: string; workspace_id: string; target_type: string; target_id: string; environment: string; workflow_version: number }>(
            `SELECT operation_id,workspace_id,target_type,target_id,environment,workflow_version
             FROM execution_operation_queue_items WHERE workspace_id=$1 AND operation_id=ANY($2::text[])
             ORDER BY operation_id COLLATE "C" FOR UPDATE`, [p.workspace_id, p.rows.map(row => row.operation_id)])).rows;
          const byId = new Map(targets.map(row => [row.operation_id, row]));
          if (targets.length !== p.rows.length || p.rows.some(row => {
            const target = byId.get(row.operation_id);
            return !target || target.target_type !== row.target_type || target.target_id !== row.target_id ||
              target.environment !== row.environment || target.workflow_version !== row.workflow_version;
          })) return fail("OPERATIONAL_HEALTH_TARGET_CHANGED");
          const foreign = await db.query(`SELECT 1 FROM execution_operation_health_observations
            WHERE workspace_id=$1 AND operation_id=ANY($2::text[]) AND source_ref<>$3 LIMIT 1`,
          [p.workspace_id, p.rows.map(row => row.operation_id), p.source_ref]);
          if (foreign.rowCount) return fail("OPERATIONAL_HEALTH_SOURCE_CHANGED");
        }
        await db.query(`INSERT INTO execution_operation_health_receipts
          (workspace_id,source_ref,source_revision,source_epoch,source_sequence,payload_digest,payload,source_as_of,expires_at)
          VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
        [p.workspace_id, p.source_ref, p.source_revision, p.source_epoch, p.source_sequence, receipt, JSON.stringify(p), p.source_as_of, p.expires_at]);
        if (p.rows.length) {
          const written = await db.query(`INSERT INTO execution_operation_health_observations
          (workspace_id,operation_id,source_ref,source_revision,target_type,target_id,environment,workflow_version,delivery_state,display_state)
          SELECT $1,r.operation_id,$2,$3,r.target_type,r.target_id,r.environment,r.workflow_version,r.delivery_state,r.display_state
          FROM jsonb_to_recordset($4::jsonb) r(operation_id text,target_type text,target_id text,environment text,
            workflow_version integer,delivery_state text,display_state text)
          ON CONFLICT(workspace_id,operation_id) DO UPDATE SET source_revision=EXCLUDED.source_revision,
            workflow_version=EXCLUDED.workflow_version,delivery_state=EXCLUDED.delivery_state,display_state=EXCLUDED.display_state
          WHERE execution_operation_health_observations.source_ref=EXCLUDED.source_ref`,
          [p.workspace_id, p.source_ref, p.source_revision, JSON.stringify(p.rows)]);
          if (written.rowCount !== p.rows.length) return fail("OPERATIONAL_HEALTH_SOURCE_CHANGED");
        }
        await db.query(`INSERT INTO execution_operation_health_heads
          (workspace_id,source_ref,source_epoch,source_sequence,source_revision,source_as_of)
          VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(workspace_id,source_ref) DO UPDATE SET
          source_sequence=EXCLUDED.source_sequence,source_revision=EXCLUDED.source_revision,source_as_of=EXCLUDED.source_as_of`,
        [p.workspace_id, p.source_ref, p.source_epoch, p.source_sequence, p.source_revision, p.source_as_of]);
        validTime(); await db.query("COMMIT");
        return { state: "COMMITTED" as const, receipt_digest: receipt };
      } catch (error) { await db.query("ROLLBACK"); throw error; }
      finally { db.release(); }
    });
  }

  /** Owning-source retirement, not a user/grant revocation. Existing queue
   * visibility still has its independent current-authority/final-send fence. */
  async retire(): Promise<void> {
    const b = this.binding, db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL statement_timeout='2000ms'");
      await db.query("SET LOCAL lock_timeout='1000ms'");
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [JSON.stringify([b.workspaceId, b.sourceRef])]);
      const retired = await db.query(`INSERT INTO execution_operation_health_heads(workspace_id,source_ref,source_epoch,retired)
        VALUES($1,$2,$3,true) ON CONFLICT(workspace_id,source_ref) DO UPDATE SET retired=true
        WHERE execution_operation_health_heads.source_epoch=EXCLUDED.source_epoch`, [b.workspaceId, b.sourceRef, b.sourceEpoch]);
      if (retired.rowCount !== 1) return fail("OPERATIONAL_HEALTH_SOURCE_CHANGED");
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; }
    finally { db.release(); }
  }
}
