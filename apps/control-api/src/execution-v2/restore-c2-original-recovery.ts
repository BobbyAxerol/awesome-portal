import type { Pool } from "pg";
import { CurrentHumanCandidate } from "./current-human-candidate";
import { CurrentHumanRecoveryClient } from "./current-human-recovery-client";
import { CoreRestoreQuiescence, type RestoreCoreProgress } from "./restore-core-quiescence";
import { RestoreIndependentCustodyCandidate } from "./restore-independent-custody-candidate";
import { currentHumanDrainCounts } from "./current-human-drain-counts";

/** UNMOUNTED. One *known* original only; not source census, ACK history,
 * independent checkpoint, an old-holder fence, or permission to cut over. The
 * TS journal deletes an original after its ACK; this cannot recover identities
 * missing from both the restored Core database and an external authority.
 * The source ACK carries no receipt ID/digest: neither exact receipt identity
 * nor durable ACK history is established by matching its phase and binding. */
const recoverableExact = CurrentHumanCandidate.prototype.recoverableExactAttempt;
const usesPool = CurrentHumanCandidate.prototype.usesPool;
const matchesTrust = CurrentHumanCandidate.prototype.matchesReverseTrust;
const requiresDelivery = CurrentHumanCandidate.prototype.requiresC2DeliverySchema;
const recover = CurrentHumanRecoveryClient.prototype.recover;
const status = CoreRestoreQuiescence.prototype.status;
const custodyUsesPool=RestoreIndependentCustodyCandidate.prototype.usesSourcePool;
const custodyHasVault=RestoreIndependentCustodyCandidate.prototype.hasSourceProofVault;
const custodyBinding=RestoreIndependentCustodyCandidate.prototype.bindingDigest;
const custodyInventory=RestoreIndependentCustodyCandidate.prototype.inventory;
const custodyVerify=RestoreIndependentCustodyCandidate.prototype.verifyRetainedSourceProof;
type Attempt = Awaited<ReturnType<CurrentHumanCandidate["recoverableAttempts"]>>[number];
type Ack = Awaited<ReturnType<CurrentHumanRecoveryClient["recover"]>>;
type CustodyEvent=Awaited<ReturnType<RestoreIndependentCustodyCandidate["inventory"]>>["events"][number];
type VerifiedProof=Awaited<ReturnType<RestoreIndependentCustodyCandidate["verifyRetainedSourceProof"]>>;
type Row = { attempt_id: string | null; human_issuer: string | null; source_trust_digest: string | null; c2_custody_binding_digest?:string|null;
  human_assertion_digest?:string|null; workspace_id: string; environment: string; workload_id: string;
  request_digest: string; subject_id: string; session_id: string; session_revision: string;
  authority_revision: string; expires_at_ms: string; phase: string; terminal_receipt_digest: string | null };
export type C2ReconciliationDisposition = "PHASE_AND_BINDING_MATCH_RECEIPT_DIGEST_NOT_VERIFIED" | "SOURCE_UNKNOWN" |
  "SOURCE_ACK_NOT_CONFIRMED" | "CORE_TERMINAL_NOT_MATCHED" | "INDEPENDENT_TERMINAL_PROOF_NOT_RECORDED" |
  "INDEPENDENT_TERMINAL_PROOF_MISMATCH" | "TERMINAL_PROOF_MATCH_ACK_CENSUS_NOT_VERIFIED";

/** Compares observations only. Calling this function does not authenticate
 * them; the unmounted orchestrator below obtains its own pinned client result
 * and Core row instead of accepting them from the caller. */
export function compareC2OriginalObservations(attempt: Attempt, ack: Ack, row: Row | undefined): C2ReconciliationDisposition {
  if (ack.lease_id !== attempt.lease_id || ack.attempt_id !== attempt.attempt_id || ack.phase === "UNKNOWN") return "SOURCE_UNKNOWN";
  if (!ack.portal_acknowledged) return "SOURCE_ACK_NOT_CONFIRMED";
  if (!row || row.attempt_id !== attempt.attempt_id || row.human_issuer !== attempt.human_issuer ||
      typeof row.source_trust_digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(row.source_trust_digest) || row.workspace_id !== attempt.workspace_id ||
      row.environment !== attempt.environment || row.workload_id !== attempt.workload_id || row.request_digest !== attempt.request_digest ||
      row.subject_id !== attempt.subject || row.session_id !== attempt.session_id ||
      row.session_revision !== String(attempt.session_revision) || row.authority_revision !== String(attempt.authority_revision) ||
      row.expires_at_ms !== String(Math.round(attempt.expires_at * 1000)) || row.phase !== ack.phase ||
      typeof row.terminal_receipt_digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(row.terminal_receipt_digest))
    return "CORE_TERMINAL_NOT_MATCHED";
  return "PHASE_AND_BINDING_MATCH_RECEIPT_DIGEST_NOT_VERIFIED";
}

/** These observations are authenticated by the orchestrator; this comparator
 * alone cannot authenticate a source, a journal, or delivery to a recipient. */
export function compareC2RetainedTerminal(attempt:Attempt,ack:Ack,row:Row,initial:CustodyEvent,terminal:CustodyEvent,
  proof:VerifiedProof):C2ReconciliationDisposition {
  const i=initial.body,t=terminal.body;
  const binding=initial.kind==="ISSUED_HUMAN_ASSERTION"&&terminal.kind==="SIGNED_SOURCE_TERMINAL"&&
    initial.lease_id===attempt.lease_id&&terminal.lease_id===attempt.lease_id&&
    i.jti===attempt.lease_id&&i.iss===attempt.human_issuer&&i.sub===attempt.subject&&
    i.sid===attempt.session_id&&i.workspace_id===attempt.workspace_id&&i.environment===attempt.environment&&
    i.workload_id===attempt.workload_id&&i.request_digest===attempt.request_digest&&
    i.session_revision===attempt.session_revision&&i.authority_revision===attempt.authority_revision&&
    i.exp===attempt.expires_at&&t.workspace_id===attempt.workspace_id&&t.environment===attempt.environment&&
    t.workload_id===attempt.workload_id&&t.request_digest===attempt.request_digest;
  return compareC2OriginalObservations(attempt,ack,row)==="PHASE_AND_BINDING_MATCH_RECEIPT_DIGEST_NOT_VERIFIED"&&
    binding&&typeof row.human_assertion_digest==="string"&&/^sha256:[a-f0-9]{64}$/.test(row.human_assertion_digest)&&
    i.human_assertion_digest===row.human_assertion_digest&&proof.state==="VERIFIED_NOT_CUTOVER"&&proof.generation===terminal.generation&&
    proof.event_hash===terminal.event_hash&&proof.lease_id===attempt.lease_id&&proof.attempt_id===attempt.attempt_id&&
    proof.phase===ack.phase&&proof.terminal_receipt_digest===row.terminal_receipt_digest&&
    proof.source_trust_digest===row.source_trust_digest
    ?"TERMINAL_PROOF_MATCH_ACK_CENSUS_NOT_VERIFIED":"INDEPENDENT_TERMINAL_PROOF_MISMATCH";
}

export class RestoreC2OriginalRecovery {
  readonly #pool: Pool;
  readonly #candidate: CurrentHumanCandidate;
  readonly #recovery: CurrentHumanRecoveryClient;
  readonly #drain: CoreRestoreQuiescence;
  readonly #custody?:RestoreIndependentCustodyCandidate;
  constructor(pool: Pool, candidate: CurrentHumanCandidate, recovery: CurrentHumanRecoveryClient,
    custody?:RestoreIndependentCustodyCandidate) {
    if (!pool || !pool.options || [pool.options.connectionTimeoutMillis, pool.options.query_timeout]
        .some(value => !Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 10_000) ||
        !candidate || Object.getPrototypeOf(candidate) !== CurrentHumanCandidate.prototype || !usesPool.call(candidate, pool) ||
        !recovery || Object.getPrototypeOf(recovery) !== CurrentHumanRecoveryClient.prototype ||
        (custody!==undefined&&(Object.getPrototypeOf(custody)!==RestoreIndependentCustodyCandidate.prototype||
          !custodyUsesPool.call(custody,pool)||!custodyHasVault.call(custody))))
      throw new Error("V2_RESTORE_RECOVERY_COMPOSITION_INVALID");
    this.#pool = pool; this.#candidate = candidate; this.#recovery = recovery;
    this.#custody=custody;
    this.#drain = new CoreRestoreQuiescence(pool, candidate);
  }
  /** Calls only the configured TLS-pinned source for the exact persisted
   * original, without creating an attempt, token, receipt or ACK. This is not
   * an enumeration: absence NEVER proves completeness. */
  async reconcile(drainId: string, leaseId: string, attemptId: string): Promise<{
    state: C2ReconciliationDisposition; progress: RestoreCoreProgress }> {
    await status.call(this.#drain, drainId);
    const original = await recoverableExact.call(this.#candidate, leaseId, attemptId);
    if (!original) throw new Error("V2_RESTORE_RECOVERY_ORIGINAL_NOT_AVAILABLE");
    const ack = await recover.call(this.#recovery, original);
    const db = await this.#pool.connect();
    let discard = false;
    try {
      // The exact terminal, active drain and pending census are observed from
      // ONE PG snapshot, not three separate reads that can straddle changes.
      // This still cannot fence another process after COMMIT and is not cutover.
      await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await db.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'; SET LOCAL row_security=off");
      const authority = await db.query<{ drain_id: string | null }>(
        "SELECT drain_id FROM elp210_candidate.authority WHERE singleton");
      if (authority.rows.length !== 1 || authority.rows[0]?.drain_id !== drainId)
        throw new Error("V2_RESTORE_RECOVERY_DRAIN_CHANGED");
      const rows = await db.query<Row>(`SELECT attempt_id,human_issuer,source_trust_digest,c2_custody_binding_digest,human_assertion_digest,workspace_id,environment,workload_id,request_digest,
        subject_id,session_id,session_revision::text,authority_revision::text,expires_at_ms::text,phase,terminal_receipt_digest
        FROM elp210_candidate.leases WHERE lease_id=$1`, [original.lease_id]);
      if (rows.rows.length > 1) throw new Error("V2_RESTORE_RECOVERY_ORIGINAL_AMBIGUOUS");
      let observed = rows.rows[0];
      if (observed && !matchesTrust.call(this.#candidate, observed.source_trust_digest))
        throw new Error("V2_RESTORE_RECOVERY_SOURCE_TRUST_CHANGED");
      if (observed && ["RETIRED", "COMMITTED", "ROLLED_BACK"].includes(observed.phase)) {
        // Recheck in this final snapshot: the local history could have changed
        // while the source request was in flight. This is consistency only,
        // not proof of insert provenance, source ACK, or cutover authority.
        const events = await db.query<{ phase: string; attempt_id: string | null; terminal_receipt_digest: string | null }>(
          `SELECT phase,attempt_id,terminal_receipt_digest FROM elp210_candidate.events
           WHERE lease_id=$1 AND phase IN ('COMMITTED','ROLLED_BACK','SOURCE_ROLLED_BACK_UNENTERED')
           ORDER BY event_id LIMIT 2`, [original.lease_id]);
        const event = events.rows[0], expectedPhase = observed.phase === "RETIRED" ? "SOURCE_ROLLED_BACK_UNENTERED" : observed.phase;
        if (events.rows.length !== 1 || event.phase !== expectedPhase || event.attempt_id !== original.attempt_id ||
            typeof event.terminal_receipt_digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(event.terminal_receipt_digest) ||
            (observed.phase !== "RETIRED" && event.terminal_receipt_digest !== observed.terminal_receipt_digest) ||
            (observed.phase === "RETIRED" && observed.attempt_id !== null))
          throw new Error("V2_RESTORE_RECOVERY_ORIGINAL_AMBIGUOUS");
        if (observed.phase === "RETIRED") observed = { ...observed, attempt_id: event.attempt_id,
          phase: "ROLLED_BACK", terminal_receipt_digest: event.terminal_receipt_digest };
      }
      const counts = await currentHumanDrainCounts(db,requiresDelivery.call(this.#candidate));
      const progress: RestoreCoreProgress = { state: "CORE_ONLY_NO_CUTOVER",
        local_drain: counts.unknown ? "DRAIN_UNKNOWN" : counts.pending ? "DRAIN_PENDING" : "DRAIN_READY",
        unresolved_count: counts.pending, independent_checkpoint: "NOT_VERIFIED", old_holder_fence: "NOT_VERIFIED",
        post_snapshot_ack_coverage: "NOT_VERIFIED" };
      let state=compareC2OriginalObservations(original, ack, observed);
      if(state==="PHASE_AND_BINDING_MATCH_RECEIPT_DIGEST_NOT_VERIFIED"&&this.#custody&&observed) {
        // A different store containing a matching signed terminal is not the
        // original's selected custody. Never infer the binding for legacy NULL.
        if(observed.c2_custody_binding_digest!==custodyBinding.call(this.#custody))
          throw new Error("V2_RESTORE_RECOVERY_CUSTODY_BINDING_CHANGED");
        // The source's ACK doesn't include a receipt digest. Compare against
        // the separately retained signed source terminal, but never elevate
        // this to source census, recipient delivery, fence, or cutover proof.
        const snapshot=await custodyInventory.call(this.#custody);
        const initial=snapshot.events.filter(e=>e.lease_id===original.lease_id&&e.kind==="ISSUED_HUMAN_ASSERTION");
        const terminal=snapshot.events.filter(e=>e.lease_id===original.lease_id&&e.kind==="SIGNED_SOURCE_TERMINAL");
        if(initial.length!==1||terminal.length!==1) state="INDEPENDENT_TERMINAL_PROOF_NOT_RECORDED";
        else {
          const proof=await custodyVerify.call(this.#custody,terminal[0].operation_id);
          state=compareC2RetainedTerminal(original,ack,observed,initial[0],terminal[0],proof);
        }
      }
      const result = { state, progress };
      await db.query("COMMIT");
      return result;
    } catch (error) {
      try { await db.query("ROLLBACK"); } catch { discard = true; }
      throw error;
    } finally { db.release(discard); }
  }
}
