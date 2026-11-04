import type { Pool } from "pg";
import { z } from "zod";
import { withTransaction } from "../db/pool";

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const text = z.string().min(1).max(256).regex(/^[^\u0000-\u0020\u007f]+$/u);
const millis = z.number().int().nonnegative().safe();
const preparationSchema = z.object({
  context_digest: digest,
  context_nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
  subject_id: text, session_id: text, session_revision: millis,
  workspace_id: text, workload_id: text, receiver_id: text,
  original_digest: digest, call_digest: digest, binding_digest: digest,
  authority_fingerprint: digest, pm_request_digest: digest,
  status_request_digest: digest, status_token_digest: digest,
  status_issued_at_ms: millis, context_expires_at_ms: millis,
}).strict().refine(v => v.status_issued_at_ms < v.context_expires_at_ms);
const consumptionSchema=z.object({context_digest:digest,subject_id:text,session_id:text,session_revision:millis,
  workspace_id:text,workload_id:text,original_digest:digest}).strict();

export type CommandStatusPreparation = z.infer<typeof preparationSchema>;

export class CommandStatusPreparationError extends Error {
  constructor(readonly code: string) { super("The command STATUS preparation is not available."); }
}

/** A bounded, non-authoritative correlation preceding STATUS lease issuance.
 * The database stores neither bearer nor raw source bytes. Operations share the
 * native candidate authority lock with lease issuance. Expiry only removes this
 * local, unusable correlation; it never resolves or deletes source custody. */
export class PgCommandStatusPreparations {
  constructor(private readonly pool: Pool, private readonly maximum: number) {
    if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 128)
      throw new CommandStatusPreparationError("COMMAND_STATUS_PREPARATION_CONFIG_INVALID");
  }

  async find(contextDigest: string): Promise<Record<string, unknown> | undefined> {
    if (!digest.safeParse(contextDigest).success)
      throw new CommandStatusPreparationError("COMMAND_STATUS_PREPARATION_INVALID");
    const result = await this.pool.query(`SELECT p.*,f.pm_status_request_digest
      FROM execution_command_status_preparations p
      JOIN execution_command_status_original_fingerprints f ON f.command_id=p.command_id
        AND f.original_digest=p.original_digest AND f.pm_status_request_digest=p.pm_request_digest
      JOIN execution_trusted_commands t ON t.command_id=p.command_id AND t.workspace_id=p.workspace_id
      WHERE p.context_digest=$1 AND p.consumed_at IS NULL
        AND p.context_expires_at_ms > floor(extract(epoch FROM clock_timestamp())*1000)
      LIMIT 2`, [contextDigest]);
    if (result.rowCount === 0) return undefined;
    if (result.rowCount !== 1) throw new CommandStatusPreparationError("COMMAND_STATUS_PREPARATION_AMBIGUOUS");
    return result.rows[0];
  }

  async reserve(untrusted: CommandStatusPreparation, intentHash: string): Promise<CommandStatusPreparation> {
    const input = preparationSchema.parse(untrusted);
    if (!digest.safeParse(intentHash).success)
      throw new CommandStatusPreparationError("COMMAND_STATUS_PREPARATION_INVALID");
    return withTransaction(this.pool, async db => {
      await db.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'");
      const authority = await db.query("SELECT revision,drain_id FROM elp210_candidate.authority WHERE singleton FOR UPDATE");
      if (authority.rowCount !== 1 || authority.rows[0].drain_id)
        throw new CommandStatusPreparationError("COMMAND_STATUS_PREPARATION_DRAINING");
      const clock = await db.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS now_ms");
      const now = Number(clock.rows[0]?.now_ms);
      if (!Number.isSafeInteger(now) || input.context_expires_at_ms <= now)
        throw new CommandStatusPreparationError("COMMAND_STATUS_PREPARATION_EXPIRED");
      const command = await db.query(`SELECT f.command_id FROM execution_command_status_original_fingerprints f
        JOIN execution_trusted_commands t ON t.command_id=f.command_id
        WHERE t.workspace_id=$1 AND t.intent_hash=$2 AND f.original_digest=$3
          AND f.pm_status_request_digest=$4 LIMIT 2`,
      [input.workspace_id, intentHash, input.original_digest, input.pm_request_digest]);
      if (command.rowCount !== 1)
        throw new CommandStatusPreparationError("COMMAND_STATUS_PREPARATION_ORIGINAL_REQUIRED");
      // The earlier optimistic reader can race another process's ISSUE.
      // Repeat the original/request fence while holding the very same lock as
      // the candidate lease writer, before a new context can escape. A retry
      // must rejoin the immutable linked lease; never supersede it here.
      const outstanding = await db.query(`SELECT l.lease_id FROM elp210_candidate.leases l
        LEFT JOIN execution_command_status_context_links c ON c.lease_id=l.lease_id
        WHERE l.workspace_id=$1 AND l.environment='paper' AND l.workload_id=$2
          AND (c.original_digest=$3 OR l.request_digest=$4)
          AND NOT EXISTS (SELECT 1 FROM execution_command_status_delivery_acks a
            WHERE a.lease_id=l.lease_id AND a.subject_id=l.subject_id AND a.session_id=l.session_id
              AND a.session_revision=l.session_revision AND a.workspace_id=l.workspace_id
              AND a.environment=l.environment AND a.workload_id=l.workload_id
              AND a.request_digest=l.request_digest AND a.terminal_receipt_digest=l.terminal_receipt_digest
              AND l.phase IN ('COMMITTED','ROLLED_BACK')) LIMIT 1`,
      [input.workspace_id,input.workload_id,input.original_digest,input.pm_request_digest]);
      if (outstanding.rowCount)
        throw new CommandStatusPreparationError("COMMAND_STATUS_PREPARATION_LEASE_RECOVERY_REQUIRED");
      // Expired context is unusable by the candidate issuer too. Do not touch
      // the immutable original, lease/link/ACK, or Edge's attempt/custody.
      await db.query("DELETE FROM execution_command_status_preparations WHERE context_expires_at_ms <= $1", [now]);
      const existing = await db.query("SELECT * FROM execution_command_status_preparations WHERE command_id=$1", [command.rows[0].command_id]);
      if (existing.rowCount === 1) {
        const row = existing.rows[0];
        if (row.consumed_at !== null) {
          // The old, already-consumed local read may be replaced only under
          // the authority lock. Its original/lease/ACK records remain intact.
          await db.query("DELETE FROM execution_command_status_preparations WHERE command_id=$1 AND consumed_at IS NOT NULL", [command.rows[0].command_id]);
        } else {
        const same = ["subject_id", "session_id", "workspace_id", "workload_id", "receiver_id", "original_digest",
          "call_digest", "binding_digest", "authority_fingerprint", "pm_request_digest", "status_request_digest"] as const;
        if (same.some(key => row[key] !== input[key]) || Number(row.session_revision) !== input.session_revision)
          throw new CommandStatusPreparationError("COMMAND_STATUS_PREPARATION_MISMATCH");
        return preparationSchema.parse({
          ...Object.fromEntries(Object.keys(input).map(key => [key, row[key]])),
          session_revision: Number(row.session_revision), status_issued_at_ms: Number(row.status_issued_at_ms),
          context_expires_at_ms: Number(row.context_expires_at_ms),
        });
        }
      }
      const count = await db.query("SELECT count(*)::int AS total FROM execution_command_status_preparations");
      if (Number(count.rows[0]?.total) >= this.maximum)
        throw new CommandStatusPreparationError("COMMAND_STATUS_PREPARATION_CAPACITY_EXHAUSTED");
      const keys = Object.keys(input) as (keyof CommandStatusPreparation)[];
      await db.query(`INSERT INTO execution_command_status_preparations (command_id,${keys.join(",")})
        VALUES (${keys.map((_, index) => `$${index + 2}`).join(",").replace(/^/, "$1,")})`,
      [command.rows[0].command_id, ...keys.map(key => input[key])]);
      return input;
    });
  }

  /** Record only local receipt of an authenticated, retained Edge response.
   * This is not a source-terminal or delivery ACK. Serialize with ISSUE and
   * refuse while any linked lease still lacks its exact terminal/Edge ACK. */
  async consume(input: Pick<CommandStatusPreparation,"context_digest"|"subject_id"|"session_id"|"session_revision"|
    "workspace_id"|"workload_id"|"original_digest">): Promise<void> {
    const parsed=consumptionSchema.parse(input);
    await withTransaction(this.pool,async db=>{
      await db.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'");
      const authority=await db.query("SELECT revision,drain_id FROM elp210_candidate.authority WHERE singleton FOR UPDATE");
      if(authority.rowCount!==1 || authority.rows[0].drain_id)
        throw new CommandStatusPreparationError("COMMAND_STATUS_PREPARATION_DRAINING");
      const row=await db.query(`SELECT context_digest FROM execution_command_status_preparations
        WHERE context_digest=$1 AND subject_id=$2 AND session_id=$3 AND session_revision=$4
          AND workspace_id=$5 AND workload_id=$6 AND original_digest=$7
          AND context_expires_at_ms > floor(extract(epoch FROM clock_timestamp())*1000)`,
      [parsed.context_digest,parsed.subject_id,parsed.session_id,parsed.session_revision,parsed.workspace_id,
        parsed.workload_id,parsed.original_digest]);
      if(row.rowCount!==1)throw new CommandStatusPreparationError("COMMAND_STATUS_PREPARATION_MISMATCH");
      const outstanding=await db.query(`SELECT 1 FROM execution_command_status_context_links c
        JOIN elp210_candidate.leases l ON l.lease_id=c.lease_id
        WHERE c.context_digest=$1 AND NOT EXISTS (SELECT 1 FROM execution_command_status_delivery_acks a
          WHERE a.lease_id=l.lease_id AND a.subject_id=l.subject_id AND a.session_id=l.session_id
            AND a.session_revision=l.session_revision AND a.workspace_id=l.workspace_id
            AND a.environment=l.environment AND a.workload_id=l.workload_id
            AND a.request_digest=l.request_digest AND a.terminal_receipt_digest=l.terminal_receipt_digest
            AND l.phase IN ('COMMITTED','ROLLED_BACK')) LIMIT 1`,[parsed.context_digest]);
      if(outstanding.rowCount)throw new CommandStatusPreparationError("COMMAND_STATUS_PREPARATION_LEASE_RECOVERY_REQUIRED");
      await db.query("UPDATE execution_command_status_preparations SET consumed_at=COALESCE(consumed_at,clock_timestamp()) WHERE context_digest=$1",[parsed.context_digest]);
    });
  }
}
