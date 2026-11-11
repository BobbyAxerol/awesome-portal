import { randomUUID } from "node:crypto";
import { decodeJwt } from "jose";
import type { Pool } from "pg";
import { CurrentHumanCandidate } from "./current-human-candidate";
import { C2CustodiedTerminalCandidate } from "./c2-custodied-terminal-candidate";

/** UNMOUNTED recovery preparation only. This is a Core-local drain, not an
 * independent authority checkpoint, source fence, ACK reconciliation, old
 * process fence, or permission to start a restored instance. The legacy V2
 * DR refusal remains in force. Call only from an authorized private operator. */
const DRAIN = /^restore_v2:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ID = /^[^\u0000-\u001f\u007f]{1,128}$/;
const validId = (value: unknown): value is string => typeof value === "string" && ID.test(value) && value === value.trim();

/** Persist this ID in independent operator custody BEFORE sending a drain.
 * A lost response must retry with the same ID; never invent a replacement. */
export function newRestoreDrainId(): string { return `restore_v2:${randomUUID()}`; }

/** This checks routing only, NEVER source authenticity. resolve() performs the
 * real signature, issuer/audience, purpose, freshness and binding checks. */
export function routeRestoreTerminalUntrusted(proof: string, leaseId: string, attemptId: string): void {
  if (!validId(leaseId) || !validId(attemptId) || typeof proof !== "string" || Buffer.byteLength(proof) > 8192)
    throw new Error("V2_RESTORE_TERMINAL_ROUTING_INVALID");
  try {
    const payload = decodeJwt(proof);
    if (payload.lease_id !== leaseId || payload.attempt_id !== attemptId ||
        !["COMMITTED", "ROLLED_BACK", "UNKNOWN"].includes(String(payload.phase))) throw new Error();
  } catch { throw new Error("V2_RESTORE_TERMINAL_ROUTING_INVALID"); }
}

/** Correlation only; this does not authenticate an ENTER proof. */
export function routeRestoreEnteredUntrusted(proof: string, leaseId: string, attemptId: string): void {
  if (!validId(leaseId) || !validId(attemptId) || typeof proof !== "string" || Buffer.byteLength(proof) > 8192)
    throw new Error("V2_RESTORE_ENTER_ROUTING_INVALID");
  try {
    const payload = decodeJwt(proof);
    if (payload.lease_id !== leaseId || payload.attempt_id !== attemptId || payload.phase !== "ENTER") throw new Error();
  } catch { throw new Error("V2_RESTORE_ENTER_ROUTING_INVALID"); }
}

type LocalDrain = { status: "DRAIN_UNKNOWN" | "DRAIN_PENDING" | "DRAIN_READY"; pending: number };
export type RestoreCoreProgress = Readonly<{ state: "CORE_ONLY_NO_CUTOVER";
  local_drain: LocalDrain["status"]; unresolved_count: number;
  independent_checkpoint: "NOT_VERIFIED"; old_holder_fence: "NOT_VERIFIED";
  post_snapshot_ack_coverage: "NOT_VERIFIED" }>;
function progress(state: { status: string; pending: number }): RestoreCoreProgress {
  if ((state.status !== "DRAIN_UNKNOWN" && state.status !== "DRAIN_PENDING" && state.status !== "DRAIN_READY") ||
      !Number.isSafeInteger(state.pending) || state.pending < 0 ||
      (state.status === "DRAIN_READY" ? state.pending !== 0 : state.pending === 0))
    throw new Error("V2_RESTORE_DRAIN_STATE_INVALID");
  return Object.freeze({ state: "CORE_ONLY_NO_CUTOVER", local_drain: state.status,
    unresolved_count: state.pending, independent_checkpoint: "NOT_VERIFIED", old_holder_fence: "NOT_VERIFIED",
    post_snapshot_ack_coverage: "NOT_VERIFIED" });
}

/** Capture original class methods: provider callbacks/booleans are not source
 * proofs, and per-instance method substitution cannot mint a drain/terminal. */
const usesPool = CurrentHumanCandidate.prototype.usesPool;
const beginDrain = CurrentHumanCandidate.prototype.beginDrain;
const drainStatus = CurrentHumanCandidate.prototype.drainStatus;
const resolveLegacy = CurrentHumanCandidate.prototype.resolveLegacyForRestore;
const c2UsesCandidate = C2CustodiedTerminalCandidate.prototype.usesCandidate;
const c2Resolve = C2CustodiedTerminalCandidate.prototype.resolve;
const c2RetainEntered = C2CustodiedTerminalCandidate.prototype.retainEnteredProof;
const recoverableExact = CurrentHumanCandidate.prototype.recoverableExactAttempt;

export class CoreRestoreQuiescence {
  readonly #pool: Pool;
  readonly #candidate: CurrentHumanCandidate;
  readonly #c2Terminal?: C2CustodiedTerminalCandidate;
  constructor(pool: Pool, candidate: CurrentHumanCandidate, c2Terminal?: C2CustodiedTerminalCandidate) {
    if (!candidate || Object.getPrototypeOf(candidate) !== CurrentHumanCandidate.prototype || !usesPool.call(candidate, pool))
      throw new Error("V2_RESTORE_CANDIDATE_POOL_MISMATCH");
    if (c2Terminal && (Object.getPrototypeOf(c2Terminal) !== C2CustodiedTerminalCandidate.prototype ||
      !c2UsesCandidate.call(c2Terminal, candidate))) throw new Error("V2_RESTORE_C2_TERMINAL_MISMATCH");
    this.#pool = pool; this.#candidate = candidate;
    this.#c2Terminal = c2Terminal;
  }

  /** Leaves the committed drain in place on every outcome. In particular this
   * module has no endDrain, ACK writer, source transaction, or cutover method. */
  async open(drainId: string): Promise<RestoreCoreProgress> {
    if (typeof drainId !== "string" || !DRAIN.test(drainId)) throw new Error("V2_RESTORE_DRAIN_ID_INVALID");
    return progress(await beginDrain.call(this.#candidate, drainId));
  }

  async status(drainId: string): Promise<RestoreCoreProgress> {
    if (typeof drainId !== "string" || !DRAIN.test(drainId)) throw new Error("V2_RESTORE_DRAIN_ID_INVALID");
    return progress(await drainStatus.call(this.#candidate, drainId));
  }

  /** Only retains the pinned source's proof for one already-entered original;
   * it is neither an entry ACK nor evidence that the old holder is fenced.
   * Drain can change while custody is written: in that case the final status
   * check fails and the exact same original must be reconciled again. */
  async retainEnteredOriginal(drainId: string, leaseId: string, attemptId: string, sourceProof: string): Promise<{
    retention: "RETAINED_NOT_ENTRY_ACK"; progress: RestoreCoreProgress }> {
    routeRestoreEnteredUntrusted(sourceProof, leaseId, attemptId);
    if (!this.#c2Terminal) throw new Error("V2_RESTORE_C2_CUSTODY_REQUIRED");
    await checkedStatus.call(this,drainId);
    const original = await recoverableExact.call(this.#candidate, leaseId, attemptId);
    if (!original) throw new Error("V2_RESTORE_ORIGINAL_NOT_AVAILABLE");
    await c2RetainEntered.call(this.#c2Terminal, sourceProof);
    return {retention:"RETAINED_NOT_ENTRY_ACK",progress:await checkedStatus.call(this,drainId)};
  }

  /** Reconcile the SAME original only with an authenticated source proof.
   * UNKNOWN can also originate before ENTER, including a retired unused lease:
   * it must be quarantined, not silently dismissed as already drained. For a
   * lease whose attempt is not yet recorded, resolve() binds the signed source
   * identity to the original lease; it alone decides admissible transitions.
   * In particular an unentered UNKNOWN cannot become COMMITTED. Replay of the
   * exact terminal remains possible after a lost response.
   * Nothing here claims complete source readback or synthesizes an ACK. */
  async reconcileOriginal(drainId: string, leaseId: string, attemptId: string, sourceProof: string): Promise<{
    terminal: "CORE_RECORDED" | "CORE_REPLAYED" | "UNKNOWN"; progress: RestoreCoreProgress }> {
    routeRestoreTerminalUntrusted(sourceProof, leaseId, attemptId);
    await checkedStatus.call(this,drainId);
    const found = await this.#pool.query<{ attempt_id: string | null; phase: string; human_assertion_digest: string | null }>(
      "SELECT attempt_id,phase,human_assertion_digest FROM elp210_candidate.leases WHERE lease_id=$1", [leaseId]);
    const row = found.rows[0];
    if (found.rows.length !== 1 || !row ||
        (row.attempt_id !== attemptId && !(row.attempt_id === null && ["ISSUED", "RETIRED"].includes(row.phase))) ||
        !["ISSUED", "RETIRED", "ENTERED", "UNKNOWN", "COMMITTED", "ROLLED_BACK"].includes(row.phase))
      throw new Error("V2_RESTORE_ORIGINAL_NOT_AVAILABLE");
    // C2 originals must never reach the legacy resolver without the journal:
    // retain the authenticated source proof independently before recording a
    // terminal. A missing custody composition is a hard failure, not fallback.
    // Fail closed on malformed or absent selected data as well.
    if (row.human_assertion_digest !== null &&
      (typeof row.human_assertion_digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(row.human_assertion_digest)))
      throw new Error("V2_RESTORE_ORIGINAL_BINDING_INVALID");
    if (row.human_assertion_digest !== null && !this.#c2Terminal) throw new Error("V2_RESTORE_C2_CUSTODY_REQUIRED");
    const result = row.human_assertion_digest === null ? await resolveLegacy.call(this.#candidate, sourceProof) :
      await c2Resolve.call(this.#c2Terminal!, sourceProof);
    if (!["COMMITTED", "ROLLED_BACK", "UNKNOWN"].includes(result.phase))
      throw new Error("V2_RESTORE_TERMINAL_RESULT_INVALID");
    const final = await checkedStatus.call(this,drainId);
    return { terminal: result.phase === "UNKNOWN" ? "UNKNOWN" : result.replayed ? "CORE_REPLAYED" : "CORE_RECORDED", progress: final };
  }
}

// Pin drain checks so an instance property cannot substitute a fabricated
// drain result for entry-proof retention or terminal reconciliation.
const checkedStatus = CoreRestoreQuiescence.prototype.status;
