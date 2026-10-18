/** Complete source-dark local registry coordinator. Mounting this family does
 * not commission a provider, source activation or authority installation. */
import type { Pool } from "pg";
import { CurrentOperationalReads } from "../operations/current-operational-read";
import { AccessPolicyError, type AccessActor } from "./access.contract";
import { accessDigest, currentBoundaryProof, evaluateAccess, type AccessEvaluationContext } from "./access-policy";
import { ExecutionAccessService } from "./access.service";
import { commandMembershipCurrent } from "./command-current-authority";
import { nativeNoticeValidUntil } from "./read-scope";
import { InstanceRegistrationError, instanceRegistrationIntent, instanceRegistrationPreview, instanceRegistrationStatus,
  type InstanceRegistrationIntent, type InstanceRegistrationStatus } from "./instance-registration.contract";
import { InstanceRegistrationStore, registrationRecord, registrationTarget,
  type RegistrationRecord } from "./instance-registration.store";
import { instanceRegistrationAuthorization, assertRegistrationAuthorizationIdentity, assertRegistrationPreview,
  boundedRegistrationJson, mergeRegistrationSource, registrationIntentHash, registrationPreviewHash,
  unqualifiedInstanceRegistrationTrust, type InstanceRegistrationAuthorization,
  type InstanceRegistrationTrust, type VerifiedRegistrationFrame } from "./instance-registration.trust";

type Outcome<T> = { value: T; error?: never } | { value?: never; error: Error };
const unknown = (old: RegistrationRecord): InstanceRegistrationStatus => old.status.business.state === "APPLIED" ? old.status :
  instanceRegistrationStatus.parse({ ...old.status, delivery: "DELIVERY_UNKNOWN", next_action: "QUERY_SAME_INTENT" });
function fixed(error: unknown): Error {
  if (error instanceof InstanceRegistrationError || error instanceof AccessPolicyError) return error;
  return new InstanceRegistrationError("REGISTRATION_UNAVAILABLE", 503);
}
/** Per-grant eligibility, then the unchanged COMPLETE evaluator. Every DENY
 * and access.grant ancestor survives. No ADMIN/creator/workload/register codec
 * creates a grant. No global evaluator semantics are changed by this family. */
function registerGrantDecision(context: AccessEvaluationContext, intent: InstanceRegistrationIntent) {
  const now = Math.max(context.now_ms, Date.now());
  const effective = { ...context, now_ms: now, grants: context.grants.filter(grant =>
    grant.action !== "deployment.register" || grant.effect === "DENY" ||
    grant.requires_ts_acceptance === true && context.relationsFor(grant.subject_user_id).qualified === true) };
  const decision = evaluateAccess(effective, "deployment.register", intent.resource, intent.environment);
  if (!decision.allowed) throw new AccessPolicyError(decision.reason_code ?? "ACCESS_DENIED", 403);
  if (context.policy?.revision !== intent.expected_policy_revision)
    throw new InstanceRegistrationError("REGISTRATION_CONTEXT_INVALID", 409);
  return decision;
}
function registerDecision(context: AccessEvaluationContext, actor: AccessActor, intent: InstanceRegistrationIntent) {
  const now = Math.max(context.now_ms, Date.now());
  if (!Number.isSafeInteger(context.now_ms) || !Number.isSafeInteger(context.actor_lease_until_ms) ||
    !context.actor_current || !context.authority_fingerprint || context.principal_id !== actor.user_id ||
    context.workspace_id !== intent.workspace_id || now >= context.actor_lease_until_ms!)
    throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED", 403);
  return registerGrantDecision(context, intent);
}
function mutationFingerprint(context: AccessEvaluationContext, actor: AccessActor, intent: InstanceRegistrationIntent): string {
  const decision = registerDecision(context, actor, intent);
  return accessDigest({ domain: "portal.execution.instance-registration-mutation.v1", actor,
    workspace_id: intent.workspace_id, resource: intent.resource, environment: intent.environment,
    core: context.authority_fingerprint, source: currentBoundaryProof(context, intent.environment, [intent.resource]),
    policy_revision: decision.policy_revision, scope_revision: decision.scope_revision,
    field_policy_ref: decision.field_policy_ref });
}
export function validateRegistrationAuthorization(a: InstanceRegistrationAuthorization,
  actor: AccessActor, intent: InstanceRegistrationIntent, current: AccessEvaluationContext,
  allowTestOnly: boolean, now: number): void {
  if (a.qualification !== "OWNER_VERIFIED" && !(allowTestOnly && a.qualification === "TEST_ONLY"))
    throw new InstanceRegistrationError("REGISTRATION_NOT_QUALIFIED", 503);
  assertRegistrationAuthorizationIdentity(a, actor.user_id, intent, registrationIntentHash(actor, intent));
  if (a.policy_revision !== current.policy?.revision ||
    !commandMembershipCurrent(a, actor, intent, current, "deployment.register", now))
    throw new InstanceRegistrationError("REGISTRATION_CONTEXT_INVALID", 403);
  if (!Number.isSafeInteger(now) || a.issued_at_ms > now || a.expires_at_ms <= now)
    throw new InstanceRegistrationError("REGISTRATION_CONTEXT_EXPIRED", 403);
}

export class InstanceRegistrationService {
  private readonly store: InstanceRegistrationStore;
  private readonly reads: CurrentOperationalReads;
  private activeIo = 0;
  constructor(pool: Pool, private readonly access: ExecutionAccessService,
    private readonly trust: InstanceRegistrationTrust = unqualifiedInstanceRegistrationTrust,
    private readonly allowTestOnly = false) {
    this.store = new InstanceRegistrationStore(pool); this.reads = new CurrentOperationalReads(access);
  }
  /** Both typed success and held safe errors pass a fresh source read and the
   * LAST actual Core confirmation. No source await follows that final fence.
   * A genuine renewed idle lease is accepted; old Core/source identity changes
   * require retry, never stale body disclosure. No TS held-send claim is made
   * by this finite response fence; the selected PM adapter owns its custody. */
  private async finishMutation<T>(actor: AccessActor, intent: InstanceRegistrationIntent,
    captured: AccessEvaluationContext, original: string, outcome: Outcome<T>,
    check?: (current: AccessEvaluationContext, now: number) => number | void): Promise<T> {
    let pending = outcome, fresh = captured;
    const inspect = (context: AccessEvaluationContext) => {
      if (mutationFingerprint(context, actor, intent) !== original)
        throw new AccessPolicyError("ACCESS_RETRY_REQUIRED", 409);
    };
    try { fresh = await this.access.readContext(actor, intent.workspace_id); inspect(fresh); }
    catch (error) { pending = { error: fixed(error) }; }
    // Captured on fresh-source failure is an error-only expected Core witness,
    // NEVER a fallback authority for a successful body.
    const final = await this.access.confirmReadContext(actor, intent.workspace_id, fresh);
    let held: Error | undefined, until: number | undefined;
    try {
      until = nativeNoticeValidUntil(final, intent.environment, final.actor_lease_until_ms!);
      inspect(final);
      if (!pending.error) {
        const bound = check?.(final, Math.max(final.now_ms, Date.now()));
        if (typeof bound === "number") until = Math.min(until, bound);
      }
    } catch (error) { held = fixed(error); }
    // Constant-time terminal check AFTER full graph/hash/projection work.
    const now = Math.max(final.now_ms, Date.now());
    if (!Number.isSafeInteger(final.actor_lease_until_ms) || now >= final.actor_lease_until_ms!)
      throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED", 403);
    if (held) throw held;
    if (until !== undefined && now >= until) throw new AccessPolicyError("ACCESS_RETRY_REQUIRED", 409);
    if (pending.error) throw pending.error;
    return pending.value as T;
  }
  private async prepare(actor: AccessActor, intent: InstanceRegistrationIntent,
    originalFingerprint: string): Promise<InstanceRegistrationAuthorization> {
    let result: Awaited<ReturnType<InstanceRegistrationTrust["prepare"]>>;
    try { result = await this.bounded(signal => this.trust.prepare({ actor: structuredClone(actor),
      intent: structuredClone(intent), intent_hash: registrationIntentHash(actor, intent), signal })); }
    catch (error) {
      if (error instanceof InstanceRegistrationError &&
        ["REGISTRATION_CAPACITY_EXCEEDED", "REGISTRATION_UNAVAILABLE"].includes(error.code)) throw error;
      throw new InstanceRegistrationError("REGISTRATION_NOT_QUALIFIED", 503);
    }
    if (!result) throw new InstanceRegistrationError("REGISTRATION_NOT_QUALIFIED", 503);
    const parsed = instanceRegistrationAuthorization.safeParse(result.authorization);
    if (!parsed.success) throw new InstanceRegistrationError("REGISTRATION_CONTEXT_INVALID", 503);
    const a = parsed.data;
    // Existing selected human mapping, not browser actor/workload substitution.
    const mapping = await this.access.commandHumanMapping(actor, intent.workspace_id);
    if (!mapping || mapping.ts_user_id !== a.ts_user_id || mapping.revision !== a.mapping_revision)
      throw new InstanceRegistrationError("REGISTRATION_CONTEXT_INVALID", 403);
    const fresh = await this.access.readContext(actor, intent.workspace_id);
    if (mutationFingerprint(fresh, actor, intent) !== originalFingerprint)
      throw new AccessPolicyError("ACCESS_RETRY_REQUIRED", 409);
    validateRegistrationAuthorization(a, actor, intent, fresh, this.allowTestOnly, Math.max(fresh.now_ms, Date.now()));
    assertRegistrationPreview(a, intent, result.preview);
    return a;
  }
  async preview(actor: AccessActor, raw: InstanceRegistrationIntent) {
    const intent = instanceRegistrationIntent.parse(raw); boundedRegistrationJson(intent);
    const captured = await this.access.readContext(actor, intent.workspace_id);
    const fingerprint = mutationFingerprint(captured, actor, intent);
    let a: InstanceRegistrationAuthorization | undefined;
    let outcome: Outcome<ReturnType<typeof instanceRegistrationPreview.parse>>;
    try {
      a = await this.prepare(actor, intent, fingerprint);
      outcome = { value: instanceRegistrationPreview.parse({ schema_version: "portal.execution.instance-registration-preview.v1",
        operation: "REGISTER_INSTANCE", allowed: true, reason_code: null, preview_digest: registrationPreviewHash(a),
        expires_at_ms: a.expires_at_ms, profile_ref: a.profile_ref, business_applied: false, reserved: false }) };
    } catch (error) {
      outcome = error instanceof InstanceRegistrationError ? { value: instanceRegistrationPreview.parse({
        schema_version: "portal.execution.instance-registration-preview.v1", operation: "REGISTER_INSTANCE", allowed: false,
        reason_code: error.code, preview_digest: null, expires_at_ms: null, profile_ref: null, business_applied: false, reserved: false }) } :
        { error: fixed(error) };
    }
    return this.finishMutation(actor, intent, captured, fingerprint, outcome, (current, now) => {
      if (a) validateRegistrationAuthorization(a, actor, intent, current, this.allowTestOnly, now);
      return a?.expires_at_ms;
    });
  }
  async submit(actor: AccessActor, raw: InstanceRegistrationIntent, digest: string): Promise<InstanceRegistrationStatus> {
    const intent = instanceRegistrationIntent.parse(raw); boundedRegistrationJson(intent);
    const captured = await this.access.readContext(actor, intent.workspace_id);
    const fingerprint = mutationFingerprint(captured, actor, intent), hash = registrationIntentHash(actor, intent);
    let outcome: Outcome<InstanceRegistrationStatus>;
    try {
      // Duplicate intent status remains available under CURRENT register rights
      // even if new-send provider activation or the old send TTL has expired.
      // Actor/hash checks PRECEDE private decode of a colliding key's row.
      const prior = await this.access.commandBoundary(actor, intent.workspace_id, captured, "deployment.register",
        intent.resource, intent.environment, () => {}, db => this.store.keyed(db, intent.workspace_id, intent.business_payload.idempotency_key));
      if (prior) {
        if (prior.actor !== actor.user_id || prior.hash !== hash) throw new InstanceRegistrationError("REGISTRATION_IDEMPOTENCY_CONFLICT");
        const record = registrationRecord(prior, intent.workspace_id, prior.id, intent);
        outcome = { value: record.status };
      } else {
        const a = await this.prepare(actor, intent, fingerprint);
        if (digest !== registrationPreviewHash(a)) throw new InstanceRegistrationError("REGISTRATION_PREVIEW_CHANGED");
        let pendingClaim: { id: string; attempt: string } | undefined;
        let claimed: { record: RegistrationRecord; attempt: string | null };
        try {
          claimed = await this.access.commandBoundary(actor, intent.workspace_id, captured, "deployment.register",
            intent.resource, intent.environment, (now, current) => {
              // commandBoundary owns the locked current session/step-up/Core
              // fingerprint. Its transaction-scoped context deliberately has
              // no detached read-snapshot lease fields: recheck the SAME full
              // graph and accepted-grant eligibility, not a nonexistent lease.
              registerGrantDecision(current, intent);
              validateRegistrationAuthorization(a, actor, intent, current, this.allowTestOnly, now);
            }, async db => {
              // The first read preceded source PREVIEW. Another submission may
              // have committed meanwhile. Under the SAME workspace fence this
              // second exact-key check returns that obligation unchanged; it
              // never claims a prior PREPARED row or substitutes the new proof.
              const prior = await this.store.keyed(db, intent.workspace_id, intent.business_payload.idempotency_key);
              if (prior) {
                if (prior.actor !== actor.user_id || prior.hash !== hash)
                  throw new InstanceRegistrationError("REGISTRATION_IDEMPOTENCY_CONFLICT");
                return { record: registrationRecord(prior, intent.workspace_id, prior.id, intent), attempt: null };
              }
              const record = await this.store.insert(db, actor.user_id, intent, hash, a);
              const attempt = await this.store.claim(db, record);
              if (attempt) pendingClaim = { id: record.id, attempt };
              return { record, attempt };
            });
        } catch (error) {
          // A lost local COMMIT acknowledgement is NOT a safe-send signal.
          // Best-effort mark the exact possibly committed obligation UNKNOWN;
          // absent rolled-back rows or unavailable DB remain a fixed503. No
          // source send follows. Future explicit recovery uses the SAME key.
          if (pendingClaim) try { await this.store.update(intent.workspace_id, pendingClaim.id, pendingClaim.attempt,
            old => old.status.delivery === "SENDING" ? unknown(old) : old.status); } catch { /* preserve ambiguity */ }
          throw error;
        }
        if (!claimed.attempt) outcome = { value: claimed.record.status };
        else outcome = { value: await this.sendClaimed(actor, intent, fingerprint, a, claimed.record.id, claimed.attempt) };
      }
    } catch (error) { outcome = { error: fixed(error) }; }
    return this.finishMutation(actor, intent, captured, fingerprint, outcome);
  }
  private async sendClaimed(actor: AccessActor, intent: InstanceRegistrationIntent,
    originalFingerprint: string, a: InstanceRegistrationAuthorization, id: string, attempt: string) {
    try {
      // Final Portal admission before the separately authenticated source send.
      // No Core connection/lock spans source I/O. Source owns actual ENTER/COMMIT.
      const fresh = await this.access.readContext(actor, intent.workspace_id);
      const final = await this.access.confirmReadContext(actor, intent.workspace_id, fresh);
      const until = nativeNoticeValidUntil(final, intent.environment, final.actor_lease_until_ms!);
      if (mutationFingerprint(final, actor, intent) !== originalFingerprint)
        throw new AccessPolicyError("ACCESS_RETRY_REQUIRED", 409);
      validateRegistrationAuthorization(a, actor, intent, final, this.allowTestOnly, Math.max(final.now_ms, Date.now()));
      const now = Math.max(final.now_ms, Date.now());
      if (now >= final.actor_lease_until_ms!) throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED", 403);
      if (now >= a.expires_at_ms || now >= until) throw new InstanceRegistrationError("REGISTRATION_CONTEXT_EXPIRED", 403);
    } catch (error) {
      await this.store.update(intent.workspace_id, id, attempt, old => old.status.business.state === "APPLIED" ? old.status :
        instanceRegistrationStatus.parse({ ...old.status, delivery: "FAILED_BEFORE_SEND", next_action: "REVIEW_BLOCKER" }));
      throw error;
    }
    let result: VerifiedRegistrationFrame | null = null;
    try { result = await this.bounded(signal => this.trust.send({ authorization: structuredClone(a),
      intent: structuredClone(intent), signal })); }
    catch { /* Timeout/unknown ENTER/send/result/COMMIT: durable UNKNOWN, NEVER resend. */ }
    try {
      return (await this.store.update(intent.workspace_id, id, attempt, old => result ?
        mergeRegistrationSource(old, result, "APPLY") : unknown(old))).status;
    } catch (error) {
      // Bad/ambiguous source outcome is not FAILED_BEFORE_SEND. If a local
      // outcome COMMIT acknowledgement was lost, monotonic APPLIED survives.
      await this.store.update(intent.workspace_id, id, attempt, unknown);
      throw fixed(error);
    }
  }
  private async storedStatus(actor: AccessActor, workspace: string, id: string,
    heldError?: Error): Promise<InstanceRegistrationStatus> {
    const prepared = await this.reads.prepareExact<InstanceRegistrationStatus>(actor, workspace, async () => {
      const row = await this.store.candidate(workspace, id);
      if (!row) throw new InstanceRegistrationError("REGISTRATION_NOT_FOUND", 404);
      const target = registrationTarget(row);
      return { target, decode: () => {
        const old = registrationRecord(row, workspace, id, target);
        if (heldError) throw heldError;
        return old.status;
      } };
    }, fixed);
    // Genuine TS-accepted audit.read on exact Portfolio/env is independent of
    // original author, deployment.register, old human expiry and provider flag.
    return this.reads.finish(prepared);
  }
  async status(actor: AccessActor, workspace: string, id: string): Promise<InstanceRegistrationStatus> {
    return this.storedStatus(actor, workspace, id);
  }
  async reconcile(actor: AccessActor, workspace: string, id: string): Promise<InstanceRegistrationStatus> {
    await this.status(actor, workspace, id);
    let error: Error | undefined;
    try { await this.recover(workspace, id); } catch (failure) { error = fixed(failure); }
    // Current grant/session/source revalidation also fences recovery errors.
    return this.storedStatus(actor, workspace, id, error);
  }
  /** Service-only accepted obligation. Never mounted as an unauthenticated
   * endpoint, never send/new-key/activation, and no impersonated old human. */
  async recover(workspace: string, id: string): Promise<void> {
    const raw = await this.store.candidate(workspace, id);
    if (!raw) throw new InstanceRegistrationError("REGISTRATION_NOT_FOUND", 404);
    const old = registrationRecord(raw, workspace, id, registrationTarget(raw));
    if (old.status.delivery === "PREPARED" || old.status.delivery === "FAILED_BEFORE_SEND") return;
    let source: VerifiedRegistrationFrame | null = null;
    if (old.authorization.idempotency_retained_until_ms > Math.max(await this.store.recoveryClock(), Date.now())) {
      try { source = await this.bounded(signal => this.trust.lookup({ authorization: structuredClone(old.authorization),
        intent: structuredClone(old.intent), signal })); } catch { /* no resend or old-cookie fallback */ }
    }
    if (source) {
      try { await this.store.update(workspace, id, null, current => mergeRegistrationSource(current, source, "STATUS")); return; }
      catch (error) { await this.store.update(workspace, id, null, current => current.status.delivery === "SENDING" ? unknown(current) : current.status);
        throw fixed(error); }
    }
    // Missing/expired lookup is not proof of absence and never clears APPLIED.
    await this.store.update(workspace, id, null, current => current.status.delivery === "SENDING" ? unknown(current) : current.status);
  }
  private async bounded<T>(call: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.activeIo >= 4) throw new InstanceRegistrationError("REGISTRATION_CAPACITY_EXCEEDED", 503);
    this.activeIo++;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = Promise.resolve().then(() => call(controller.signal));
    // Abort-ignoring transport retains its concurrency slot UNTIL settlement.
    // Adapter must retain its real accepted-custody recovery obligation too.
    void pending.then(() => { this.activeIo--; }, () => { this.activeIo--; });
    try {
      return await Promise.race([pending, new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new InstanceRegistrationError("REGISTRATION_UNAVAILABLE", 503)); }, 10_000);
      })]);
    } finally { if (timer) clearTimeout(timer); controller.abort(); }
  }
}
