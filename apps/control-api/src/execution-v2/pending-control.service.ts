/** Isolated correctness implementation; runtime provider remains unqualified.
 * Complete named transport custody for an EXISTING recall remainder. PM owns
 * economics, current parent/recipient authorization and its atomic COMMIT.
 * Default provider is unqualified; this module activates no source/runtime. */
import type { Pool } from "pg";
import { CurrentOperationalReads } from "../operations/current-operational-read";
import { AccessPolicyError, type AccessAction, type AccessActor } from "./access.contract";
import { accessDigest, currentBoundaryProof, evaluateAccess, type AccessEvaluationContext } from "./access-policy";
import { ExecutionAccessService } from "./access.service";
import { commandMembershipCurrent } from "./command-current-authority";
import { currentAccessRelations } from "./access-current-relations";
import { nativeNoticeValidUntil } from "./read-scope";
import { PendingControlError, pendingControlIntent, pendingControlPreview, pendingControlStatus,
  type PendingControlIntent, type PendingControlStatus, type PendingPrediction } from "./pending-control.contract";
import { PendingControlStore, pendingRecord, pendingTarget, type PendingRecord } from "./pending-control.store";
import { pendingControlAuthorization, assertPendingAuthorizationIdentity, assertPendingPreview,
  boundedPendingJson, mergePendingSource, pendingIntentHash, pendingPreviewHash,
  unqualifiedPendingControlTrust, type PendingControlAuthorization,
  type PendingControlTrust, type VerifiedPendingFrame } from "./pending-control.trust";

type Outcome<T> = { value: T; error?: never } | { value?: never; error: Error };
export const pendingControlAction = (intent: PendingControlIntent): AccessAction =>
  intent.business_payload.operation === "APPLY_PENDING" ? "capital.apply_pending" : "capital.cancel_remaining";
const unknown = (old: PendingRecord): PendingControlStatus => old.status.business.state !== "UNKNOWN" ? old.status :
  pendingControlStatus.parse({ ...old.status, delivery: "DELIVERY_UNKNOWN", next_action: "QUERY_SAME_INTENT" });
function fixed(error: unknown): Error {
  if (error instanceof PendingControlError || error instanceof AccessPolicyError) return error;
  return new PendingControlError("PENDING_CONTROL_UNAVAILABLE", 503);
}
/** This new family never inherits the historical singleton-membership bridge.
 * Its action and independent audit leg require versioned exact correspondence;
 * the full evaluator below still retains DENY and delegation ancestors. */
function requirePendingCorrespondence(context: AccessEvaluationContext, disclosure = false): void {
  const relations = context.relationsFor(context.principal_id);
  const parsed = currentAccessRelations.safeParse(relations.current_authority);
  if (!relations.qualified || !parsed.success || parsed.data.subject_user_id !== context.principal_id ||
    parsed.data.workspace_id !== context.workspace_id)
    throw new AccessPolicyError(disclosure ? "ACCESS_RESOURCE_NOT_FOUND" : "ACCESS_DENIED", disclosure ? 404 : 403);
}
/** Preserve the complete evaluator graph, every DENY and grant ancestor.
 * Only genuine current TS-accepted ALLOWs qualify this economic app action;
 * an ADMIN, original creator or old recall receipt is not a new grant. */
function grantDecision(context: AccessEvaluationContext, intent: PendingControlIntent) {
  requirePendingCorrespondence(context);
  const action = pendingControlAction(intent), now = Math.max(context.now_ms, Date.now());
  const effective = { ...context, now_ms: now, grants: context.grants.filter(grant =>
    grant.action !== action || grant.effect === "DENY" ||
    grant.requires_ts_acceptance === true && context.relationsFor(grant.subject_user_id).qualified === true) };
  const decision = evaluateAccess(effective, action, intent.resource, intent.environment);
  if (!decision.allowed) throw new AccessPolicyError(decision.reason_code ?? "ACCESS_DENIED", 403);
  if (context.policy?.revision !== intent.expected_policy_revision)
    throw new PendingControlError("PENDING_CONTROL_CONTEXT_INVALID", 409);
  return decision;
}
function mutationFingerprint(context: AccessEvaluationContext, actor: AccessActor, intent: PendingControlIntent): string {
  const now = Math.max(context.now_ms, Date.now());
  if (!Number.isSafeInteger(context.now_ms) || !Number.isSafeInteger(context.actor_lease_until_ms) ||
    !context.actor_current || !context.authority_fingerprint || context.principal_id !== actor.user_id ||
    context.workspace_id !== intent.workspace_id || now >= context.actor_lease_until_ms!)
    throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED", 403);
  const decision = grantDecision(context, intent);
  return accessDigest({ domain: "portal.execution.pending-recall-mutation.v1", actor,
    workspace_id: intent.workspace_id, resource: intent.resource, environment: intent.environment,
    core: context.authority_fingerprint, source: currentBoundaryProof(context, intent.environment, [intent.resource]),
    policy_revision: decision.policy_revision, scope_revision: decision.scope_revision,
    field_policy_ref: decision.field_policy_ref });
}
export function validatePendingAuthorization(a: PendingControlAuthorization,
  actor: AccessActor, intent: PendingControlIntent, current: AccessEvaluationContext,
  allowTestOnly: boolean, now: number): void {
  requirePendingCorrespondence(current);
  if (a.qualification !== "OWNER_VERIFIED" && !(allowTestOnly && a.qualification === "TEST_ONLY"))
    throw new PendingControlError("PENDING_CONTROL_NOT_QUALIFIED", 503);
  assertPendingAuthorizationIdentity(a, actor.user_id, intent, pendingIntentHash(actor, intent));
  if (a.policy_revision !== current.policy?.revision ||
    !commandMembershipCurrent(a, actor, intent, current, pendingControlAction(intent), now))
    throw new PendingControlError("PENDING_CONTROL_CONTEXT_INVALID", 403);
  if (!Number.isSafeInteger(now) || a.issued_at_ms > now || a.expires_at_ms <= now)
    throw new PendingControlError("PENDING_CONTROL_CONTEXT_EXPIRED", 403);
}

export class PendingControlService {
  private readonly store: PendingControlStore;
  private readonly reads: CurrentOperationalReads;
  private activeIo = 0;
  constructor(pool: Pool, private readonly access: ExecutionAccessService,
    private readonly trust: PendingControlTrust = unqualifiedPendingControlTrust,
    private readonly allowTestOnly = false) {
    this.store = new PendingControlStore(pool); this.reads = new CurrentOperationalReads(access);
  }
  /** Hold success AND contextual errors to fresh source + LAST actual Core
   * confirmation. Genuine idle-lease renewal is allowed; no source await after
   * final clock. Finite response fencing is not held TS COMMIT custody. */
  private async finishMutation<T>(actor: AccessActor, intent: PendingControlIntent,
    captured: AccessEvaluationContext, original: string, outcome: Outcome<T>,
    check?: (context: AccessEvaluationContext, now: number) => number | void): Promise<T> {
    let pending = outcome, fresh = captured;
    const inspect = (context: AccessEvaluationContext) => {
      if (mutationFingerprint(context, actor, intent) !== original)
        throw new AccessPolicyError("ACCESS_RETRY_REQUIRED", 409);
    };
    try { fresh = await this.access.readContext(actor, intent.workspace_id); inspect(fresh); }
    catch (error) { pending = { error: fixed(error) }; }
    const final = await this.access.confirmReadContext(actor, intent.workspace_id, fresh);
    let held: Error | undefined, until: number | undefined;
    try {
      until = nativeNoticeValidUntil(final, intent.environment, final.actor_lease_until_ms!); inspect(final);
      if (!pending.error) {
        const bound = check?.(final, Math.max(final.now_ms, Date.now()));
        if (typeof bound === "number") until = Math.min(until, bound);
      }
    } catch (error) { held = fixed(error); }
    const now = Math.max(final.now_ms, Date.now());
    if (!Number.isSafeInteger(final.actor_lease_until_ms) || now >= final.actor_lease_until_ms!)
      throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED", 403);
    if (held) throw held;
    if (until !== undefined && now >= until) throw new AccessPolicyError("ACCESS_RETRY_REQUIRED", 409);
    if (pending.error) throw pending.error;
    return pending.value as T;
  }
  private async prepare(actor: AccessActor, intent: PendingControlIntent, fingerprint: string):
    Promise<{ authorization: PendingControlAuthorization; prediction: PendingPrediction }> {
    let result: Awaited<ReturnType<PendingControlTrust["prepare"]>>;
    try { result = await this.bounded(signal => this.trust.prepare({ actor: structuredClone(actor),
      intent: structuredClone(intent), intent_hash: pendingIntentHash(actor, intent), signal })); }
    catch (error) {
      if (error instanceof PendingControlError &&
        ["PENDING_CONTROL_CAPACITY_EXCEEDED", "PENDING_CONTROL_UNAVAILABLE"].includes(error.code)) throw error;
      throw new PendingControlError("PENDING_CONTROL_NOT_QUALIFIED", 503);
    }
    if (!result) throw new PendingControlError("PENDING_CONTROL_NOT_QUALIFIED", 503);
    const parsed = pendingControlAuthorization.safeParse(result.authorization);
    if (!parsed.success) throw new PendingControlError("PENDING_CONTROL_CONTEXT_INVALID", 503);
    const a = parsed.data, mapping = await this.access.commandHumanMapping(actor, intent.workspace_id);
    if (!mapping || mapping.ts_user_id !== a.ts_user_id || mapping.revision !== a.mapping_revision)
      throw new PendingControlError("PENDING_CONTROL_CONTEXT_INVALID", 403);
    const fresh = await this.access.readContext(actor, intent.workspace_id);
    if (mutationFingerprint(fresh, actor, intent) !== fingerprint)
      throw new AccessPolicyError("ACCESS_RETRY_REQUIRED", 409);
    validatePendingAuthorization(a, actor, intent, fresh, this.allowTestOnly, Math.max(fresh.now_ms, Date.now()));
    return { authorization: a, prediction: assertPendingPreview(a, intent, result.preview) };
  }
  async preview(actor: AccessActor, raw: PendingControlIntent) {
    const intent = pendingControlIntent.parse(raw); boundedPendingJson(intent);
    const captured = await this.access.readContext(actor, intent.workspace_id);
    const fingerprint = mutationFingerprint(captured, actor, intent);
    let a: PendingControlAuthorization | undefined;
    let outcome: Outcome<ReturnType<typeof pendingControlPreview.parse>>;
    const base = { schema_version: "portal.execution.pending-recall-preview.v1", operation: intent.business_payload.operation,
      original_recall_id: intent.business_payload.command_id, business_applied: false, reserved: false };
    try {
      const prepared = await this.prepare(actor, intent, fingerprint); a = prepared.authorization;
      outcome = { value: pendingControlPreview.parse({ ...base, allowed: true, reason_code: null,
        preview_digest: pendingPreviewHash(a), expires_at_ms: a.expires_at_ms,
        profile_ref: a.profile_ref, prediction: prepared.prediction }) };
    } catch (error) {
      outcome = error instanceof PendingControlError ? { value: pendingControlPreview.parse({ ...base,
        allowed: false, reason_code: error.code, preview_digest: null, expires_at_ms: null, profile_ref: null, prediction: null }) } :
        { error: fixed(error) };
    }
    return this.finishMutation(actor, intent, captured, fingerprint, outcome, (current, now) => {
      if (a) validatePendingAuthorization(a, actor, intent, current, this.allowTestOnly, now);
      return a?.expires_at_ms;
    });
  }
  async submit(actor: AccessActor, raw: PendingControlIntent, digest: string): Promise<PendingControlStatus> {
    const intent = pendingControlIntent.parse(raw); boundedPendingJson(intent);
    const captured = await this.access.readContext(actor, intent.workspace_id);
    const fingerprint = mutationFingerprint(captured, actor, intent), hash = pendingIntentHash(actor, intent);
    const action = pendingControlAction(intent);
    let outcome: Outcome<PendingControlStatus>;
    try {
      const prior = await this.access.commandBoundary(actor, intent.workspace_id, captured, action,
        intent.resource, intent.environment, () => {}, db => this.store.keyed(db, intent.workspace_id, intent.business_payload.idempotency_key));
      if (prior) {
        if (prior.actor !== actor.user_id || prior.hash !== hash)
          throw new PendingControlError("PENDING_CONTROL_IDEMPOTENCY_CONFLICT");
        outcome = { value: pendingRecord(prior, intent.workspace_id, prior.id, intent).status };
      } else {
        const { authorization: a } = await this.prepare(actor, intent, fingerprint);
        if (digest !== pendingPreviewHash(a)) throw new PendingControlError("PENDING_CONTROL_PREVIEW_CHANGED");
        let pendingClaim: { id: string; attempt: string } | undefined;
        let claimed: { record: PendingRecord; attempt: string | null };
        try {
          claimed = await this.access.commandBoundary(actor, intent.workspace_id, captured, action,
            intent.resource, intent.environment, (now, current) => {
              grantDecision(current, intent);
              validatePendingAuthorization(a, actor, intent, current, this.allowTestOnly, now);
            }, async db => {
              // Exact workspace fence: never reclaim somebody else's PREPARED
              // intent or replace its original preview/authority on retry.
              const prior = await this.store.keyed(db, intent.workspace_id, intent.business_payload.idempotency_key);
              if (prior) {
                if (prior.actor !== actor.user_id || prior.hash !== hash)
                  throw new PendingControlError("PENDING_CONTROL_IDEMPOTENCY_CONFLICT");
                return { record: pendingRecord(prior, intent.workspace_id, prior.id, intent), attempt: null };
              }
              const record = await this.store.insert(db, actor.user_id, intent, hash, a);
              const attempt = await this.store.claim(db, record);
              if (attempt) pendingClaim = { id: record.id, attempt };
              return { record, attempt };
            });
        } catch (error) {
          // COMMIT ACK loss is NEVER permission to send. Preserve exact key
          // and attempt; later recovery can only lookup the accepted original.
          if (pendingClaim) try {
            await this.store.update(intent.workspace_id, pendingClaim.id, pendingClaim.attempt,
              old => old.status.delivery === "SENDING" ? unknown(old) : old.status);
          } catch { /* retain durable ambiguity, no send */ }
          throw error;
        }
        outcome = { value: claimed.attempt ?
          await this.sendClaimed(actor, intent, fingerprint, a, claimed.record.id, claimed.attempt) : claimed.record.status };
      }
    } catch (error) { outcome = { error: fixed(error) }; }
    return this.finishMutation(actor, intent, captured, fingerprint, outcome);
  }
  private async sendClaimed(actor: AccessActor, intent: PendingControlIntent, fingerprint: string,
    a: PendingControlAuthorization, id: string, attempt: string): Promise<PendingControlStatus> {
    try {
      const fresh = await this.access.readContext(actor, intent.workspace_id);
      const final = await this.access.confirmReadContext(actor, intent.workspace_id, fresh);
      const until = nativeNoticeValidUntil(final, intent.environment, final.actor_lease_until_ms!);
      if (mutationFingerprint(final, actor, intent) !== fingerprint)
        throw new AccessPolicyError("ACCESS_RETRY_REQUIRED", 409);
      validatePendingAuthorization(a, actor, intent, final, this.allowTestOnly, Math.max(final.now_ms, Date.now()));
      const now = Math.max(final.now_ms, Date.now());
      if (now >= final.actor_lease_until_ms!) throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED", 403);
      if (now >= a.expires_at_ms || now >= until) throw new PendingControlError("PENDING_CONTROL_CONTEXT_EXPIRED", 403);
    } catch (error) {
      await this.store.update(intent.workspace_id, id, attempt, old => old.status.business.state !== "UNKNOWN" ? old.status :
        pendingControlStatus.parse({ ...old.status, delivery: "FAILED_BEFORE_SEND", next_action: "REVIEW_BLOCKER" }));
      throw error;
    }
    let source: VerifiedPendingFrame | null = null;
    try { source = await this.bounded(signal => this.trust.send({ authorization: structuredClone(a),
      intent: structuredClone(intent), signal })); }
    catch { /* accepted/timeout/COMMIT ambiguous, NEVER resend */ }
    try {
      return (await this.store.update(intent.workspace_id, id, attempt,
        old => source ? mergePendingSource(old, source, "APPLY") : unknown(old))).status;
    } catch (error) {
      await this.store.update(intent.workspace_id, id, attempt, unknown);
      throw fixed(error);
    }
  }
  private async storedStatus(actor: AccessActor, workspace: string, id: string, heldError?: Error): Promise<PendingControlStatus> {
    const prepared = await this.reads.prepareExact<PendingControlStatus>(actor, workspace, async () => {
      const row = await this.store.candidate(workspace, id);
      if (!row) throw new PendingControlError("PENDING_CONTROL_NOT_FOUND", 404);
      const target = pendingTarget(row);
      return { target, authorize: (current) => {
        requirePendingCorrespondence(current, true);
        return { proof: accessDigest({ domain: "portal.execution.pending-recall-audit.v1",
          source: currentBoundaryProof(current, target.environment, [target.resource]) }),
          valid_until_ms: current.actor_lease_until_ms! };
      }, decode: () => {
        const old = pendingRecord(row, workspace, id, target);
        if (heldError) throw heldError;
        return old.status;
      } };
    }, fixed);
    return this.reads.finish(prepared);
  }
  async status(actor: AccessActor, workspace: string, id: string): Promise<PendingControlStatus> {
    return this.storedStatus(actor, workspace, id);
  }
  async reconcile(actor: AccessActor, workspace: string, id: string): Promise<PendingControlStatus> {
    await this.status(actor, workspace, id);
    let error: Error | undefined;
    try { await this.recover(workspace, id); } catch (failure) { error = fixed(failure); }
    return this.storedStatus(actor, workspace, id, error);
  }
  /** Internal recovery has no old-human credential and cannot issue APPLY.
   * Preserve an active send attempt if lookup is absent/invalid: recovery does
   * not know that a concurrent sender has settled. Exact attempt CAS prevents
   * a stale lookup from overwriting the actual sender's newer owning receipt. */
  async recover(workspace: string, id: string): Promise<void> {
    const raw = await this.store.candidate(workspace, id);
    if (!raw) throw new PendingControlError("PENDING_CONTROL_NOT_FOUND", 404);
    const old = pendingRecord(raw, workspace, id, pendingTarget(raw));
    if (old.status.delivery === "PREPARED" || old.status.delivery === "FAILED_BEFORE_SEND") return;
    let source: VerifiedPendingFrame | null = null;
    if (old.authorization.idempotency_retained_until_ms > Math.max(await this.store.recoveryClock(), Date.now())) {
      try { source = await this.bounded(signal => this.trust.lookup({ authorization: structuredClone(old.authorization),
        intent: structuredClone(old.intent), signal })); }
      catch { /* no source send, fallback credential or local authority */ }
    }
    if (source) await this.store.update(workspace, id, old.attempt, current => {
      const next = mergePendingSource(current, source, "STATUS");
      // Even a genuinely authenticated missing receipt cannot prove that an
      // overlapping source APPLY has finished. Keep its exact custody until
      // the sender settles, or a known owning receipt positively resolves it.
      return current.status.delivery === "SENDING" && next.business.state === "UNKNOWN" ? current.status : next;
    });
  }
  private async bounded<T>(call: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.activeIo >= 4) throw new PendingControlError("PENDING_CONTROL_CAPACITY_EXCEEDED", 503);
    this.activeIo++;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = Promise.resolve().then(() => call(controller.signal));
    void pending.then(() => { this.activeIo--; }, () => { this.activeIo--; });
    try {
      return await Promise.race([pending, new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new PendingControlError("PENDING_CONTROL_UNAVAILABLE", 503)); }, 10_000);
      })]);
    } finally { if (timer) clearTimeout(timer); controller.abort(); }
  }
}
