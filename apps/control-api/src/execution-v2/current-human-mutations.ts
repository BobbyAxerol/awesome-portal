import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { withTransaction } from "../db/pool";
import { accessDigest } from "./access-policy";
import { CurrentHumanCandidate, CurrentHumanLeaseError } from "./current-human-candidate";

const text = z.string().min(1).max(128).regex(/^[^\u0000-\u001f\u007f]+$/);
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const mutationBinding = z.object({
  family: z.enum(["ACCOUNT_LIFECYCLE", "GOVERNANCE_GRANT", "EXECUTION_ACCESS", "AUTH_SESSION", "WORKSPACE_PROVISIONING"]),
  operation: text, actor_id: text, session_id: text, session_revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  key_digest: hash, request_digest: hash, target_id: text.nullable(),
}).strict().refine(value => ({
  ACCOUNT_LIFECYCLE: ["CREATE_INVITED", "UPDATE_PROFILE", "ISSUE_ACTIVATION", "REVOKE_SESSIONS", "DISABLE", "ENABLE", "ARCHIVE"],
  GOVERNANCE_GRANT: ["GRANT", "REVOKE"],
  EXECUTION_ACCESS: ["INSTALL_POLICY", "PROPOSE_GRANT", "ACCEPT_RECEIPT", "REVOKE_GRANT", "ROOT_RECEIPT"],
  AUTH_SESSION: ["CHANGE_PASSWORD", "LOGOUT", "REVOKE_SESSION"],
  WORKSPACE_PROVISIONING: ["ENSURE_PERSONAL"],
})[value.family].includes(value.operation), "CURRENT_HUMAN_MUTATION_OPERATION_INVALID");
export type CurrentHumanMutationBinding = z.infer<typeof mutationBinding>;
export type CurrentHumanRecoveryAttempt = Awaited<ReturnType<CurrentHumanCandidate["recoverableAttempts"]>>[number];
export interface CurrentHumanRecoveryPort {
  /** Must use the exact authenticated durable Core attempt, never browser JSON.
   * A response does not release a lease: signed source resolution must already
   * have committed in Core, which the coordinator rereads afterwards. */
  recover(attempt: CurrentHumanRecoveryAttempt): Promise<unknown>;
}
export class CurrentHumanMutationPending extends CurrentHumanLeaseError {
  constructor(readonly mutation_id: string, readonly state: "DRAIN_PENDING" | "DRAIN_UNKNOWN") {
    super(state === "DRAIN_UNKNOWN" ? "CURRENT_HUMAN_MUTATION_OUTCOME_UNCERTAIN" : "CURRENT_HUMAN_MUTATION_PENDING");
  }
}
type Intent = { mutation_id: string; binding_digest: string; replay_digest: string;
  state: "PENDING" | "FINISHED" | "REFUSED"; terminal_digest: string | null };
export interface CurrentHumanMutationHooks<T> {
  /** Opt-in for a purpose-specific operation with no caller-supplied key
   * (logout). A fresh serialized PENDING read proves application/receipt did
   * not commit; keep that SAME intent for retry, never invent a replacement
   * key or release an uncertain source lease. All other writers default to
   * the existing permanent-refusal disposition. */
  retain_after_application_rollback?: true;
  /** DB-only, called before opening a drain. Invalid actors cannot globally
   * stop issuance. Final existing service checks run AGAIN in apply. */
  authorize(db: PoolClient): Promise<void>;
  /** Existing authorized service mutation + original immutable receipt.
   * No source await, no network or password/token persistence in this callback. */
  apply(db: PoolClient): Promise<T>;
  /** Digest of existing receipt identity/refusal, never the result (which may
   * contain a one-view activation secret). APPLIED/REPLAYED normalize equally. */
  terminal(result: T): { outcome: "APPLIED" | "REFUSED"; receipt_ref: string | null; reason_code: string | null };
}

/** Small durable intent/drain coordinator, NOT a background identity writer.
 * It stores only a request binding and executes a caller's existing authorized
 * service in the current request. Restart recovery never reconstructs payloads,
 * callbacks or secrets. Retry requires the same authorized request/key; used
 * leases are released only by actual signed source terminal proofs. */
export class CurrentHumanMutations {
  constructor(private readonly pool: Pool, private readonly candidate: CurrentHumanCandidate,
    private readonly recovery: CurrentHumanRecoveryPort,
    private readonly limits: { maximum_intents: number; maximum_recoveries_per_request: number }) {
    if (!candidate.usesPool(pool) || !Number.isSafeInteger(limits.maximum_intents) || limits.maximum_intents < 1 || limits.maximum_intents > 4096
      || !Number.isSafeInteger(limits.maximum_recoveries_per_request) || limits.maximum_recoveries_per_request < 1 || limits.maximum_recoveries_per_request > 16)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_MUTATION_CONFIG_INVALID");
  }

  usesPool(pool: Pool): boolean { return this.pool === pool; }

  private async transaction<T>(operation: (db: PoolClient) => Promise<T>) {
    return withTransaction(this.pool, async db => {
      await db.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'");
      await db.query("SELECT singleton FROM elp210_candidate.authority WHERE singleton FOR UPDATE");
      return operation(db);
    });
  }

  async execute<T>(untrusted: CurrentHumanMutationBinding, hooks: CurrentHumanMutationHooks<T>): Promise<T> {
    const binding = mutationBinding.parse(untrusted), bindingDigest = accessDigest(binding);
    // A FINISHED receipt belongs to actor/request, not an obsolete login. A
    // PENDING mutation remains bound to its exact original session/generation.
    const { session_id: _session, session_revision: _generation, ...stable } = binding;
    const replayDigest = accessDigest(stable);
    let intent: Intent;
    try { intent = await this.transaction(async db => {
      await hooks.authorize(db);
      const prior = (await db.query<Intent>("SELECT * FROM elp210_candidate.mutations WHERE key_digest=$1", [binding.key_digest])).rows[0];
      if (prior) {
        if (prior.state === "FINISHED" ? prior.replay_digest !== replayDigest : prior.binding_digest !== bindingDigest)
          throw new CurrentHumanLeaseError("CURRENT_HUMAN_MUTATION_KEY_CONFLICT");
        if (prior.state === "REFUSED") throw new CurrentHumanLeaseError("CURRENT_HUMAN_MUTATION_PREVIOUSLY_REFUSED");
        return prior;
      }
      const authority = (await db.query("SELECT drain_id FROM elp210_candidate.authority WHERE singleton")).rows[0];
      if (authority.drain_id) throw new CurrentHumanLeaseError("CURRENT_HUMAN_DRAIN_CONFLICT");
      const count = Number((await db.query("SELECT count(*) AS n FROM elp210_candidate.mutations")).rows[0].n);
      if (count >= this.limits.maximum_intents) throw new CurrentHumanLeaseError("CURRENT_HUMAN_MUTATION_CAPACITY_EXHAUSTED");
      const created = (await db.query<Intent>(`INSERT INTO elp210_candidate.mutations
        (mutation_id,key_digest,binding_digest,replay_digest,family,actor_id,session_id,session_revision)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [randomUUID(), binding.key_digest, bindingDigest,
        replayDigest, binding.family, binding.actor_id, binding.session_id, binding.session_revision])).rows[0];
      await db.query("UPDATE elp210_candidate.authority SET drain_id=$1 WHERE singleton", [created.mutation_id]);
      await db.query("UPDATE elp210_candidate.leases SET phase='RETIRED' WHERE phase='ISSUED'");
      return created;
    }); } catch (error) {
      // An expired/revoked actor must not strand a global drain. This is only
      // exact-bound ABORT recovery: no callback, receipt, regrant or mutation.
      try {
        const prior = await this.transaction(async db => (await db.query<Intent>(
          "SELECT * FROM elp210_candidate.mutations WHERE key_digest=$1", [binding.key_digest])).rows[0]);
        if (prior?.state === "PENDING" && prior.binding_digest === bindingDigest) await this.recoverAbandoned(prior.mutation_id);
      } catch { /* Source/DB uncertainty keeps the durable drain closed. */ }
      throw error;
    }

    if (intent.state === "FINISHED") {
      return this.transaction(db => this.replay(db, intent, hooks));
    }

    // No Core client/transaction survives the call into the real source.
    await this.recoverSource();
    try {
      return await this.transaction(async db => {
        const row = (await db.query<Intent>("SELECT * FROM elp210_candidate.mutations WHERE mutation_id=$1 FOR UPDATE", [intent.mutation_id])).rows[0];
        // Another exact retry may already have committed while source recovery
        // was in flight. Re-read its immutable receipt, never apply twice.
        if (row.state === "FINISHED") return this.replay(db, row, hooks);
        if (row.state !== "PENDING") throw new CurrentHumanLeaseError("CURRENT_HUMAN_MUTATION_PREVIOUSLY_REFUSED");
        const authority = (await db.query("SELECT drain_id FROM elp210_candidate.authority WHERE singleton")).rows[0];
        if (authority.drain_id !== intent.mutation_id) throw new CurrentHumanLeaseError("CURRENT_HUMAN_DRAIN_CONFLICT");
        const pending = await this.pendingState(db);
        if (pending) throw new CurrentHumanMutationPending(intent.mutation_id, pending);
        await hooks.authorize(db);
        await db.query("SELECT set_config('elp210_candidate.mutation_id',$1,true)", [intent.mutation_id]);
        const result = await hooks.apply(db);
        const terminal = accessDigest(hooks.terminal(result));
        await db.query(`UPDATE elp210_candidate.mutations SET state='FINISHED',terminal_digest=$2,finished_at=clock_timestamp()
          WHERE mutation_id=$1`, [intent.mutation_id, terminal]);
        await db.query("UPDATE elp210_candidate.authority SET drain_id=NULL WHERE singleton");
        return result;
      });
    } catch (error) {
      // Fresh serialized read follows a possible lost COMMIT ACK. A FINISHED
      // intent must never be recast as REFUSED or cause callback re-execution.
      try {
        await this.transaction(async db => {
          const row = (await db.query<Intent>("SELECT * FROM elp210_candidate.mutations WHERE mutation_id=$1 FOR UPDATE", [intent.mutation_id])).rows[0];
          if (row.state !== "PENDING") return;
          if ((await db.query("SELECT 1 FROM elp210_candidate.leases WHERE phase IN ('ISSUED','ENTERED','UNKNOWN') LIMIT 1")).rowCount) return;
          if (hooks.retain_after_application_rollback) return;
          await db.query(`UPDATE elp210_candidate.mutations SET state='REFUSED',terminal_digest=$2,finished_at=clock_timestamp()
            WHERE mutation_id=$1`, [intent.mutation_id, accessDigest({ outcome: "REFUSED", reason_code: "APPLICATION_NOT_COMMITTED" })]);
          await db.query("UPDATE elp210_candidate.authority SET drain_id=NULL WHERE singleton AND drain_id=$1", [intent.mutation_id]);
        });
      } catch { /* An unavailable authoritative read leaves the intent pending. */ }
      throw error;
    }
  }

  private async replay<T>(db: PoolClient, intent: Intent, hooks: CurrentHumanMutationHooks<T>): Promise<T> {
    await db.query("SELECT set_config('elp210_candidate.replay_only','on',true)");
    await hooks.authorize(db);
    const result = await hooks.apply(db);
    if (accessDigest(hooks.terminal(result)) !== intent.terminal_digest)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_MUTATION_RECEIPT_MISMATCH");
    return result;
  }

  private async recoverSource() {
    const attempts = await this.candidate.recoverableAttempts();
    for (const attempt of attempts.slice(0, this.limits.maximum_recoveries_per_request)) {
      try { await this.recovery.recover(attempt); }
      catch { /* Inspect authenticated durable Core state, never trust an ACK. */ }
    }
  }

  private async pendingState(db: PoolClient): Promise<"DRAIN_PENDING" | "DRAIN_UNKNOWN" | null> {
    const row = (await db.query(`SELECT count(*)::int AS n,
      count(*) FILTER(WHERE phase='UNKNOWN' OR expires_at_ms<=floor(extract(epoch FROM clock_timestamp())*1000))::int AS unknown
      FROM elp210_candidate.leases WHERE phase IN ('ISSUED','ENTERED','UNKNOWN')`)).rows[0];
    return row.unknown > 0 ? "DRAIN_UNKNOWN" : row.n > 0 ? "DRAIN_PENDING" : null;
  }

  /** Private, abort-only recovery capability for an abandoned/revoked caller.
   * Not mounted as a browser/CLI route. Cannot authorize/apply/replay a request.
   * Signed terminal readback must reach Core before any drain is released. */
  async recoverAbandoned(mutationId: string): Promise<{ state: "ABORTED" | "ALREADY_TERMINAL" | "NOT_FOUND" | "DRAIN_PENDING" | "DRAIN_UNKNOWN" }> {
    text.parse(mutationId);
    const prior = await this.transaction(async db => (await db.query<Intent>(
      "SELECT * FROM elp210_candidate.mutations WHERE mutation_id=$1", [mutationId])).rows[0]);
    if (!prior) return { state: "NOT_FOUND" };
    if (prior.state !== "PENDING") return { state: "ALREADY_TERMINAL" };
    await this.recoverSource();
    return this.transaction(async db => {
      const row = (await db.query<Intent>("SELECT * FROM elp210_candidate.mutations WHERE mutation_id=$1 FOR UPDATE", [mutationId])).rows[0];
      if (row.state !== "PENDING") return { state: "ALREADY_TERMINAL" as const };
      const pending = await this.pendingState(db);
      if (pending) return { state: pending };
      const authority = (await db.query("SELECT drain_id FROM elp210_candidate.authority WHERE singleton")).rows[0];
      if (authority.drain_id !== mutationId) throw new CurrentHumanLeaseError("CURRENT_HUMAN_DRAIN_CONFLICT");
      await db.query(`UPDATE elp210_candidate.mutations SET state='REFUSED',terminal_digest=$2,finished_at=clock_timestamp()
        WHERE mutation_id=$1`, [mutationId, accessDigest({ outcome: "REFUSED", reason_code: "ABANDONED_REQUEST_NOT_APPLIED" })]);
      await db.query("UPDATE elp210_candidate.authority SET drain_id=NULL WHERE singleton AND drain_id=$1", [mutationId]);
      return { state: "ABORTED" as const };
    });
  }
}
