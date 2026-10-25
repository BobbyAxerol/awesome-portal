import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { withTransaction } from "../db/pool";
import { accessDigest } from "./access-policy";
import { accessText } from "./access.contract";
import { CurrentHumanCandidate, CurrentHumanLeaseError, type CurrentHumanNativeReadRecoveryAttempt } from "./current-human-candidate";

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
// A reviewed artifact or authenticated source receipt is not a login. These
// private purposes have no fabricated user/session/generation. Their key and
// full normalized request digest bind the immutable authority evidence.
const verifiedBinding = z.discriminatedUnion("family", [
  // REVIEWED_POLICY = a root-owned, hash-pinned owner artifact. The durable table
  // stores only the family (no actor/session), so the two REMOVE-ONLY maintenance
  // operations below need no schema change: each has its own key digest and the
  // same drain/serialization as the install.
  z.object({ family: z.literal("REVIEWED_POLICY"),
    operation: z.enum(["INSTALL_POLICY", "REVOKE_MANAGER_GRANT", "REVOKE_ACCEPTANCE_SESSION"]),
    key_digest: hash, request_digest: hash, target_id: accessText }).strict(),
  z.object({ family: z.literal("QUALIFIED_ROOT_RECEIPT"), operation: z.literal("ROOT_RECEIPT"),
    key_digest: hash, request_digest: hash, target_id: accessText }).strict(),
  z.object({ family: z.literal("QUALIFIED_DELEGATED_RECEIPT"), operation: z.literal("ACCEPT_RECEIPT"),
    key_digest: hash, request_digest: hash, target_id: accessText }).strict(),
  // A newly verified login cannot present a prior Portal session. Only the
  // in-process auth service may use this purpose; never browser-supplied JSON.
  z.object({ family: z.literal("VERIFIED_AUTH_ISSUANCE"), operation: z.enum(["LOGIN", "PREVIEW", "RESEARCH_ACCEPTANCE"]),
    key_digest: hash, request_digest: hash, target_id: accessText,
    user_revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict(),
]);
export type CurrentHumanVerifiedMutationBinding = z.infer<typeof verifiedBinding>;
export type CurrentHumanRecoveryAttempt = Awaited<ReturnType<CurrentHumanCandidate["recoverableAttempts"]>>[number];
export interface CurrentHumanRecoveryPort {
  /** Must use the exact authenticated durable Core attempt, never browser JSON.
   * A response does not release a lease: signed source resolution must already
   * have committed in Core, which the coordinator rereads afterwards. */
  recover(attempt: CurrentHumanRecoveryAttempt): Promise<unknown>;
}
export interface CurrentHumanNativeReadRecoveryPort {
  /** Exact durable native metadata, NEVER a reverse-human proof/read permit.
   * Results are ignored. A later authenticated transport + local egress witness
   * must own settlement; NC-01 installs no successful settlement operation. */
  recover(attempt: CurrentHumanNativeReadRecoveryAttempt): Promise<unknown>;
}
/** Separate purpose-specific ordinary CURRENT READ participant. Durable state
 * is reread by the coordinator; a returned promise value is never an ACK. */
export interface CurrentHumanCurrentReadRecoveryPort {
  usesPool(pool:unknown):boolean;
  recover():Promise<unknown>;
}
/** Explicit startup-only reverse participants. The candidate is the SAME one
 * that issued these identities; registration is routing, never permission.
 * The installer supplies a real authenticated source recovery port. */
export interface CurrentHumanReverseRecoveryParticipant {
  readonly candidate: Pick<CurrentHumanCandidate, "usesPool" | "recoverableObligations">;
  readonly workload_id: string;
  readonly recovery: CurrentHumanRecoveryPort;
}
const reverseAttempt = z.object({ lease_id: text, attempt_id: text, workspace_id: text,
  environment: z.enum(["paper", "sandbox", "live"]), workload_id: text, request_digest: hash,
  human_issuer: text, subject: text, session_id: text, session_revision: z.number().int().nonnegative().safe(),
  authority_revision: z.number().int().nonnegative().safe(), expires_at: z.number().positive().finite().max(Number.MAX_SAFE_INTEGER),
}).strict();
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
export interface CurrentHumanMutationFence {
  /** Must be synchronous; the provider holds this proof through Core outcome. */
  assertCurrent(): void;
  release(): Promise<void>;
  /** Optional purpose-specific owning-transaction custody. External I/O is
   * forbidden; the same DB transaction owns application and terminal truth. */
  beforeApply?(db: PoolClient): Promise<void>;
  afterApply?(db: PoolClient, terminal: ReturnType<CurrentHumanMutationHooks<unknown>["terminal"]>): Promise<void>;
}
/** Persisted coordinator identity, never an adapter's replacement intent. */
export interface CurrentHumanMutationFenceContext {
  readonly mutation_id: string;
  readonly binding_digest: string;
  readonly key_digest: string;
  readonly request_digest: string;
  readonly family: string;
  readonly target_id: string | null;
}
export interface CurrentHumanVerifiedMutationHooks<T> extends CurrentHumanMutationHooks<T> {
  /** Resolve source I/O AFTER drain recovery, outside every Core transaction.
   * Never hold a provider fence while recovery needs that same provider. */
  acquire_fence?(context: Readonly<CurrentHumanMutationFenceContext>): Promise<CurrentHumanMutationFence>;
}

function assertFence(fence: CurrentHumanMutationFence | undefined): void {
  if (!fence) return;
  const result: unknown = fence.assertCurrent();
  if (result && (typeof result === "object" || typeof result === "function") &&
    typeof (result as { then?: unknown }).then === "function") {
    void Promise.resolve(result).catch(() => undefined);
    throw new CurrentHumanLeaseError("CURRENT_HUMAN_MUTATION_FENCE_INVALID");
  }
}

/** Small durable intent/drain coordinator, NOT a background identity writer.
 * It stores only a request binding and executes a caller's existing authorized
 * service in the current request. Restart recovery never reconstructs payloads,
 * callbacks or secrets. Retry requires the same authorized request/key; used
 * leases are released only by actual signed source terminal proofs. */
export class CurrentHumanMutations {
  private readonly reverseParticipants: readonly CurrentHumanReverseRecoveryParticipant[];
  // Scheduling only, never authority/custody. Advance even after a source
  // failure so UNKNOWN on one original attempt cannot starve other workloads.
  private lastRecoveryKey?: string;
  constructor(private readonly pool: Pool, private readonly candidate: CurrentHumanCandidate,
    private readonly recovery: CurrentHumanRecoveryPort,
    private readonly limits: { maximum_intents: number; maximum_recoveries_per_request: number },
    private readonly nativeRecovery?: CurrentHumanNativeReadRecoveryPort,
    reverseParticipants: readonly CurrentHumanReverseRecoveryParticipant[] = [],
    private readonly currentReadRecovery?:CurrentHumanCurrentReadRecoveryPort) {
    if (!candidate.usesPool(pool) || !Number.isSafeInteger(limits.maximum_intents) || limits.maximum_intents < 1 || limits.maximum_intents > 4096
      || !Number.isSafeInteger(limits.maximum_recoveries_per_request) || limits.maximum_recoveries_per_request < 1 || limits.maximum_recoveries_per_request > 16)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_MUTATION_CONFIG_INVALID");
    if (!Array.isArray(reverseParticipants) || reverseParticipants.length > 16)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_MUTATION_CONFIG_INVALID");
    if(currentReadRecovery&&(!currentReadRecovery.usesPool(pool)||typeof currentReadRecovery.recover!=="function"))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_MUTATION_CONFIG_INVALID");
    const workloads = new Set<string>(), candidates = new Set<unknown>([candidate]);
    this.reverseParticipants = Object.freeze(reverseParticipants.map(participant => {
      if (!participant || !text.safeParse(participant.workload_id).success || workloads.has(participant.workload_id) ||
        !participant.candidate || candidates.has(participant.candidate) ||
        typeof participant.candidate.usesPool !== "function" || !participant.candidate.usesPool(pool) ||
        typeof participant.candidate.recoverableObligations !== "function" || typeof participant.recovery?.recover !== "function")
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_MUTATION_CONFIG_INVALID");
      workloads.add(participant.workload_id); candidates.add(participant.candidate);
      return Object.freeze({ candidate: participant.candidate, workload_id: participant.workload_id, recovery: participant.recovery });
    }));
  }

  usesPool(pool: Pool): boolean { return this.pool === pool; }

  /** Application assembly checks object identity, not a matching class/name.
   * The read provider whose custody is admitted must be the one drained. */
  hasCurrentReadRecoveryParticipant(provider: CurrentHumanCurrentReadRecoveryPort): boolean {
    return !!provider && this.currentReadRecovery === provider;
  }

  /** Identity check for the application composition barrier. Similar workload
   * strings or another coordinator do not prove registration of THIS issuer. */
  hasReverseRecoveryParticipant(participant: CurrentHumanReverseRecoveryParticipant): boolean {
    return !!participant && this.reverseParticipants.some(registered => registered.candidate === participant.candidate &&
      registered.workload_id === participant.workload_id && registered.recovery === participant.recovery);
  }

  private async transaction<T>(operation: (db: PoolClient) => Promise<T>) {
    return withTransaction(this.pool, async db => {
      await db.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'");
      await db.query("SELECT singleton FROM elp210_candidate.authority WHERE singleton FOR UPDATE");
      return operation(db);
    });
  }

  async execute<T>(untrusted: CurrentHumanMutationBinding, hooks: CurrentHumanMutationHooks<T>): Promise<T> {
    return this.executeBinding(mutationBinding.parse(untrusted), hooks);
  }

  /** Private adapter API. Verification belongs to the existing artifact/source
   * boundary; never mount this method as JSON/browser authority. */
  async executeVerified<T>(untrusted: CurrentHumanVerifiedMutationBinding,
    hooks: CurrentHumanVerifiedMutationHooks<T>): Promise<T> {
    return this.executeBinding(verifiedBinding.parse(untrusted), hooks);
  }

  private async executeBinding<T>(binding: CurrentHumanMutationBinding | CurrentHumanVerifiedMutationBinding,
    hooks: CurrentHumanVerifiedMutationHooks<T>): Promise<T> {
    const bindingDigest = accessDigest(binding);
    // A FINISHED receipt belongs to actor/request, not an obsolete login. A
    // PENDING mutation remains bound to its exact original session/generation.
    const stable = { ...binding } as Record<string, unknown>;
    delete stable.session_id; delete stable.session_revision;
    const replayDigest = accessDigest(stable);
    const oneView = binding.family === "VERIFIED_AUTH_ISSUANCE";
    let intent: Intent;
    try { intent = await this.transaction(async db => {
      if (!oneView) await hooks.authorize(db);
      const prior = (await db.query<Intent>("SELECT * FROM elp210_candidate.mutations WHERE key_digest=$1", [binding.key_digest])).rows[0];
      if (prior) {
        if (prior.state === "FINISHED" ? prior.replay_digest !== replayDigest : prior.binding_digest !== bindingDigest)
          throw new CurrentHumanLeaseError("CURRENT_HUMAN_MUTATION_KEY_CONFLICT");
        if (prior.state === "REFUSED") throw new CurrentHumanLeaseError("CURRENT_HUMAN_MUTATION_PREVIOUSLY_REFUSED");
        if (oneView && prior.state === "FINISHED")
          throw new CurrentHumanLeaseError("CURRENT_HUMAN_ISSUANCE_ALREADY_COMMITTED");
        if (oneView) await hooks.authorize(db);
        return prior;
      }
      if (oneView) await hooks.authorize(db);
      const authority = (await db.query("SELECT drain_id FROM elp210_candidate.authority WHERE singleton")).rows[0];
      if (authority.drain_id) throw new CurrentHumanLeaseError("CURRENT_HUMAN_DRAIN_CONFLICT");
      const count = Number((await db.query("SELECT count(*) AS n FROM elp210_candidate.mutations")).rows[0].n);
      if (count >= this.limits.maximum_intents) throw new CurrentHumanLeaseError("CURRENT_HUMAN_MUTATION_CAPACITY_EXHAUSTED");
      const created = (await db.query<Intent>(`INSERT INTO elp210_candidate.mutations
        (mutation_id,key_digest,binding_digest,replay_digest,family,actor_id,session_id,session_revision)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [randomUUID(), binding.key_digest, bindingDigest,
        replayDigest, binding.family, "actor_id" in binding ? binding.actor_id : null,
        "session_id" in binding ? binding.session_id : null,
        "session_revision" in binding ? binding.session_revision : null])).rows[0];
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

    // No Core client/transaction survives the call into the real source.
    if (intent.state !== "FINISHED") await this.recoverSource();
    let fence: CurrentHumanMutationFence | undefined;
    try {
      if (hooks.acquire_fence && intent.state !== "FINISHED") await this.transaction(async db => {
        const row = (await db.query<Intent>("SELECT * FROM elp210_candidate.mutations WHERE mutation_id=$1", [intent.mutation_id])).rows[0];
        if (row.state === "FINISHED") return;
        if (row.state !== "PENDING") throw new CurrentHumanLeaseError("CURRENT_HUMAN_MUTATION_PREVIOUSLY_REFUSED");
        const pending = await this.pendingState(db);
        if (pending) throw new CurrentHumanMutationPending(intent.mutation_id, pending);
      });
      if (hooks.acquire_fence && intent.state !== "FINISHED" && intent.binding_digest !== bindingDigest)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_MUTATION_KEY_CONFLICT");
      fence = await hooks.acquire_fence?.(Object.freeze({ mutation_id: intent.mutation_id,
        binding_digest: intent.binding_digest, key_digest: binding.key_digest,
        request_digest: binding.request_digest, family: binding.family, target_id: binding.target_id }));
      if (hooks.acquire_fence && (!fence || typeof fence.assertCurrent !== "function" || typeof fence.release !== "function"))
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_MUTATION_FENCE_INVALID");
      assertFence(fence);
      const result = await this.transaction(async db => {
        const row = (await db.query<Intent>("SELECT * FROM elp210_candidate.mutations WHERE mutation_id=$1 FOR UPDATE", [intent.mutation_id])).rows[0];
        // Another exact retry may already have committed while source recovery
        // was in flight. Re-read its immutable receipt, never apply twice.
        if (row.state === "FINISHED") {
          // Recovery can establish COMMIT, not recover bearer/CSRF secrets.
          // Do not even call authorize/apply to reconstruct a login response.
          if (oneView) throw new CurrentHumanLeaseError("CURRENT_HUMAN_ISSUANCE_ALREADY_COMMITTED");
          await fence?.beforeApply?.(db);
          const replayed = await this.replay(db, row, hooks);
          await fence?.afterApply?.(db, hooks.terminal(replayed));
          assertFence(fence);
          return replayed;
        }
        if (row.state !== "PENDING") throw new CurrentHumanLeaseError("CURRENT_HUMAN_MUTATION_PREVIOUSLY_REFUSED");
        const authority = (await db.query("SELECT drain_id FROM elp210_candidate.authority WHERE singleton")).rows[0];
        if (authority.drain_id !== intent.mutation_id) throw new CurrentHumanLeaseError("CURRENT_HUMAN_DRAIN_CONFLICT");
        const pending = await this.pendingState(db);
        if (pending) throw new CurrentHumanMutationPending(intent.mutation_id, pending);
        await hooks.authorize(db);
        await db.query("SELECT set_config('elp210_candidate.mutation_id',$1,true)", [intent.mutation_id]);
        await fence?.beforeApply?.(db);
        const result = await hooks.apply(db);
        const terminalFact = hooks.terminal(result);
        await fence?.afterApply?.(db, terminalFact);
        const terminal = accessDigest(terminalFact);
        await db.query(`UPDATE elp210_candidate.mutations SET state='FINISHED',terminal_digest=$2,finished_at=clock_timestamp()
          WHERE mutation_id=$1`, [intent.mutation_id, terminal]);
        await db.query("UPDATE elp210_candidate.authority SET drain_id=NULL WHERE singleton");
        assertFence(fence);
        return result;
      });
      assertFence(fence);
      return result;
    } catch (error) {
      // Fresh serialized read follows a possible lost COMMIT ACK. A FINISHED
      // intent must never be recast as REFUSED or cause callback re-execution.
      try {
        await this.transaction(async db => {
          const row = (await db.query<Intent>("SELECT * FROM elp210_candidate.mutations WHERE mutation_id=$1 FOR UPDATE", [intent.mutation_id])).rows[0];
          if (row.state !== "PENDING") return;
          if (await this.pendingState(db)) return;
          if (hooks.retain_after_application_rollback) return;
          await db.query(`UPDATE elp210_candidate.mutations SET state='REFUSED',terminal_digest=$2,finished_at=clock_timestamp()
            WHERE mutation_id=$1`, [intent.mutation_id, accessDigest({ outcome: "REFUSED", reason_code: "APPLICATION_NOT_COMMITTED" })]);
          await db.query("UPDATE elp210_candidate.authority SET drain_id=NULL WHERE singleton AND drain_id=$1", [intent.mutation_id]);
        });
      } catch { /* An unavailable authoritative read leaves the intent pending. */ }
      throw error;
    } finally {
      // Core COMMIT/ROLLBACK and pool release have settled first. A failed
      // source release/guard is an uncertain ACK, not permission to reapply.
      if (fence && typeof fence.release === "function") await fence.release();
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
    // Actual adapter recovery is outside Core transactions and cannot clear
    // custody by returning a value. pendingState rereads durable source ACK.
    if(this.currentReadRecovery)try{await this.currentReadRecovery.recover();}catch{/* same original remains pending/UNKNOWN */}
    const attempts = await this.candidate.recoverableObligations(this.nativeRecovery ? "BOTH" : "REVERSE_ONLY");
    if (this.reverseParticipants.length) {
      // Capture and validate ALL registered enumeration before any source
      // request. Preserve original attempt objects; no reconstructed JWT/body.
      const selected = new Map<string, { family: "NATIVE_READ" | "REVERSE_HUMAN"; attempt: CurrentHumanNativeReadRecoveryAttempt | CurrentHumanRecoveryAttempt;
        recover: (attempt: CurrentHumanNativeReadRecoveryAttempt | CurrentHumanRecoveryAttempt) => Promise<unknown>; digest: string }>();
      if (!Array.isArray(attempts) || attempts.length > 128)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_MUTATION_RECOVERY_INVALID");
      const add = (family: "NATIVE_READ" | "REVERSE_HUMAN", attempt: CurrentHumanNativeReadRecoveryAttempt | CurrentHumanRecoveryAttempt,
        recover: (attempt: CurrentHumanNativeReadRecoveryAttempt | CurrentHumanRecoveryAttempt) => Promise<unknown>, replace: boolean) => {
        const key = `${family}:${attempt.lease_id}`, digest = accessDigest(attempt), prior = selected.get(key);
        if (prior && prior.digest !== digest) throw new CurrentHumanLeaseError("CURRENT_HUMAN_MUTATION_RECOVERY_INVALID");
        if (!prior || replace) selected.set(key, { family, attempt, recover, digest });
      };
      for (const item of attempts) {
        if (item.family === "NATIVE_READ") {
          if (this.nativeRecovery) add(item.family, item.attempt, attempt => this.nativeRecovery!.recover(attempt as CurrentHumanNativeReadRecoveryAttempt), false);
        } else if (item.family === "REVERSE_HUMAN" && reverseAttempt.safeParse(item.attempt).success)
          add(item.family, item.attempt, attempt => this.recovery.recover(attempt as CurrentHumanRecoveryAttempt), false);
        else throw new CurrentHumanLeaseError("CURRENT_HUMAN_MUTATION_RECOVERY_INVALID");
      }
      for (const participant of this.reverseParticipants) {
        const additional = await participant.candidate.recoverableObligations("REVERSE_ONLY");
        if (!Array.isArray(additional) || additional.length > 128)
          throw new CurrentHumanLeaseError("CURRENT_HUMAN_MUTATION_RECOVERY_INVALID");
        for (const item of additional) {
          if (item.family !== "REVERSE_HUMAN" || !reverseAttempt.safeParse(item.attempt).success ||
            item.attempt.workload_id !== participant.workload_id)
            throw new CurrentHumanLeaseError("CURRENT_HUMAN_MUTATION_RECOVERY_INVALID");
          add(item.family, item.attempt, attempt => participant.recovery.recover(attempt as CurrentHumanRecoveryAttempt), true);
        }
      }
      const keys = [...selected.keys()].sort();
      const after = this.lastRecoveryKey === undefined ? 0 : keys.findIndex(key => key > this.lastRecoveryKey!);
      const start = after < 0 ? 0 : after;
      for (let calls = 0; calls < Math.min(keys.length, this.limits.maximum_recoveries_per_request); calls++) {
        const key = keys[(start + calls) % keys.length]!, item = selected.get(key)!;
        this.lastRecoveryKey = key;
        try { await item.recover(item.attempt); }
        catch { /* Real durable global state below still owns terminal/UNKNOWN. */ }
      }
      return;
    }
    let calls = 0;
    for (const item of attempts) {
      if (item.family === "NATIVE_READ" && !this.nativeRecovery) continue;
      if (calls >= this.limits.maximum_recoveries_per_request) break;
      calls++;
      try {
        if (item.family === "NATIVE_READ") await this.nativeRecovery!.recover(item.attempt);
        else await this.recovery.recover(item.attempt);
      }
      catch { /* Inspect authenticated durable Core state, never trust an ACK. */ }
    }
  }

  private async pendingState(db: PoolClient): Promise<"DRAIN_PENDING" | "DRAIN_UNKNOWN" | null> {
    const row = (await db.query(`SELECT count(*)::int AS n,
      count(*) FILTER(WHERE phase='UNKNOWN' OR expires_at_ms<=floor(extract(epoch FROM clock_timestamp())*1000))::int AS unknown
      FROM elp210_candidate.obligations WHERE unresolved`)).rows[0];
    // Additive migration153 may be installed without commissioning a source.
    // Census the real custody table even if its adapter is absent: missing
    // recovery composition must NOT allow a revoke to skip an old obligation.
    const installed=(await db.query("SELECT to_regclass('public.portal_native_current_read_obligations') AS relation")).rows[0]?.relation;
    const ordinary=installed?(await db.query(`SELECT count(*)::int AS n,
      count(*) FILTER(WHERE phase='UNKNOWN' OR source_expires_at IS NOT NULL AND
        source_expires_at::timestamptz<=clock_timestamp())::int AS unknown
      FROM portal_native_current_read_obligations WHERE NOT source_settled`)).rows[0]:{n:0,unknown:0};
    return row.unknown > 0||ordinary.unknown>0 ? "DRAIN_UNKNOWN" : row.n > 0||ordinary.n>0 ? "DRAIN_PENDING" : null;
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
