import { AccessPolicyError, accessResource, type AccessActor, type AccessResource } from "../execution-v2/access.contract";
import { executionEnvironment } from "../execution-v2/foundation.contract";
import { accessDigest, currentBoundaryProof, resolvedResources, type AccessEvaluationContext } from "../execution-v2/access-policy";
import { requireCurrentTsAuditRead } from "../execution-v2/current-audit-read";
import { ExecutionAccessService } from "../execution-v2/access.service";
import type { ReadScopePrincipal } from "../execution-v2/read-scope";
import { nativeNoticeValidUntil } from "../execution-v2/read-scope";
import type { PostgresRowScope } from "../query/contracts";
import { QueryContractError } from "../query/contracts";
import { CommandHttpError } from "../execution-v2/command.error";
import { IdentifierSchema } from "./contracts";
import { operationalTargets } from "./operational-read.contract";

export class OperationalReadError extends CommandHttpError {
  constructor(code: string, status = 503) { super(code, "The operational read is not available. Review its scope or refresh the page.", status); }
}
export type OperationalAuditCohort = Readonly<{ context: AccessEvaluationContext; scope: PostgresRowScope; fingerprint: string }>;
declare const flightBrand: unique symbol;
export interface PreparedOperationalRead<T> { readonly [flightBrand]: T; }
export type ExactAuditTarget = Readonly<{ resource: AccessResource; environment: "paper" | "sandbox" | "live" }>;
/** Held internal obligations, not a reusable public authorization permit. */
export type ExactReadQualification = Readonly<{ proof: string; valid_until_ms: number }>;
export type ExactReadAuthorizer = (context: AccessEvaluationContext,
  audit: ReturnType<typeof requireCurrentTsAuditRead>) => ExactReadQualification;
type ReadFence = { actor: AccessActor; workspace: string; captured: AccessEvaluationContext;
  check: (context: AccessEvaluationContext) => void; until: (context: AccessEvaluationContext) => number;
  changed: () => Error };
type Flight<T> = { issuer: CurrentOperationalReads; fence: ReadFence; onError: (error: unknown) => Error;
  result?: T; error?: Error; beforeFinal?: () => Promise<void> };
const flights = new WeakMap<object, Flight<unknown>>();
const environments = ["paper", "sandbox", "live"] as const;
const actorFor = (p: ReadScopePrincipal): AccessActor => ({ user_id: p.user.userId,
  session_id: p.session.sessionId, session_generation: p.session.sessionVersion });

/** Enumeration proposes candidates; the unchanged FULL graph decides each one.
 * No queue row, author/assignee, ADMIN or business.read_all creates a target. */
export function operationalAuditCohort(context: AccessEvaluationContext, actor: AccessActor): OperationalAuditCohort {
  if (context.principal_id !== actor.user_id || !context.authority_fingerprint || !context.actor_current ||
    !Number.isSafeInteger(context.now_ms) || !Number.isSafeInteger(context.actor_lease_until_ms) ||
    Math.max(context.now_ms, Date.now()) >= context.actor_lease_until_ms!)
    throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED");
  const candidates = new Map<string, { kind: typeof operationalTargets[number]; id: string; environment: typeof environments[number] }>();
  let attempts = 0;
  for (const grant of context.grants) {
    if (grant.subject_user_id !== actor.user_id || grant.workspace_id !== context.workspace_id ||
      grant.action !== "audit.read" || grant.effect !== "ALLOW" || grant.requires_ts_acceptance !== true ||
      grant.revoked_at_ms !== null || grant.policy_revision !== context.policy?.revision ||
      grant.valid_from_ms > context.now_ms || grant.valid_until_ms !== null && grant.valid_until_ms <= context.now_ms) continue;
    for (const environment of environments) {
      if (!grant.environments.includes(environment)) continue;
      const relation = context.relationsFor(grant.subject_user_id);
      if (!relation.qualified) throw new OperationalReadError("OPERATIONAL_READ_AUTHORITY_UNAVAILABLE");
      const resources = resolvedResources(grant.selector, relation, environment);
      for (const resource of resources) {
        if (++attempts > 20_000) throw new OperationalReadError("OPERATIONAL_READ_SCOPE_LIMIT");
        if (!operationalTargets.includes(resource.kind as typeof operationalTargets[number])) continue;
        if (!IdentifierSchema.safeParse(resource.id).success) throw new OperationalReadError("OPERATIONAL_READ_SCOPE_LIMIT");
        const item = { kind: resource.kind as typeof operationalTargets[number], id: resource.id, environment };
        candidates.set(JSON.stringify(item), item);
        if (candidates.size > 2000) throw new OperationalReadError("OPERATIONAL_READ_SCOPE_LIMIT");
      }
    }
  }
  const decisions: unknown[] = [], tuples: string[][] = [];
  const selected: Record<string, { kind: typeof operationalTargets[number]; id: string }[]> = { paper: [], sandbox: [], live: [] };
  for (const [, item] of [...candidates].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    const resource = { kind: item.kind, id: item.id };
    try {
      const decision = requireCurrentTsAuditRead(context, resource, item.environment);
      tuples.push([item.kind, item.id, item.environment.toUpperCase()]); selected[item.environment].push(resource);
      decisions.push([item, decision.policy_revision, decision.scope_revision, decision.field_policy_ref]);
    } catch (error) {
      if (!(error instanceof AccessPolicyError) || error.code !== "ACCESS_RESOURCE_NOT_FOUND") throw error;
    }
  }
  if (!tuples.length) throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND", 404);
  const fingerprint = accessDigest({ domain: "portal.execution.operational-audit.v2", actor,
    workspace: context.workspace_id, core: context.authority_fingerprint, decisions,
    source: environments.map(env => currentBoundaryProof(context, env, selected[env])) });
  const scope = Object.freeze({ columns: ["target_type", "target_id", "environment"], allowedTuples: tuples, fingerprint });
  if (Buffer.byteLength(JSON.stringify(scope), "utf8") > 1_048_576) throw new OperationalReadError("OPERATIONAL_READ_SCOPE_LIMIT");
  return Object.freeze({ context, scope, fingerprint });
}

function safeError(error: unknown): Error {
  if (error instanceof OperationalReadError || error instanceof AccessPolicyError) return error;
  if (error instanceof QueryContractError) return new OperationalReadError(
    error.code === "CURSOR_CONTEXT_MISMATCH" ? "OPERATIONAL_READ_CHANGED" :
      error.code.includes("CURSOR") ? "OPERATIONAL_READ_CURSOR_INVALID" :
        error.status === 400 ? "OPERATIONAL_READ_INPUT_INVALID" : "OPERATIONAL_READ_UNAVAILABLE",
    error.code === "CURSOR_CONTEXT_MISMATCH" ? 409 : error.status === 400 ? 400 : 503);
  return new OperationalReadError("OPERATIONAL_READ_UNAVAILABLE");
}

/** Fixed public envelope; never pass a provider, driver or validation message.
 * Unlike commandHttpCall this preserves the operational reader's own errors. */
export async function operationalHttpCall<T>(run: () => Promise<T>): Promise<T> {
  try { return await run(); }
  catch (error) {
    if (error instanceof OperationalReadError) throw error;
    if (error instanceof AccessPolicyError) throw new OperationalReadError(
      error.status === 404 ? "OPERATIONAL_READ_NOT_FOUND" : error.status === 409 ?
        "OPERATIONAL_READ_CHANGED" : error.status === 503 ? "OPERATIONAL_READ_AUTHORITY_UNAVAILABLE" :
          "OPERATIONAL_READ_AUTHORITY_REQUIRED", error.status);
    throw new OperationalReadError("OPERATIONAL_READ_UNAVAILABLE");
  }
}

/** Issuer-bound in-process flight. No source lease/atomic-send claim and no
 * authority reconstructed from JSON. DB connections are released before any
 * trusted relation await. A genuinely renewed session is allowed. */
export class CurrentOperationalReads {
  constructor(private readonly access: ExecutionAccessService) {}
  async prepare<T>(principal: ReadScopePrincipal, build: (cohort: OperationalAuditCohort,
    beforeFinal: (check: () => Promise<void>) => void) => Promise<{
    result: T; beforeFinal?: () => Promise<void> }>): Promise<PreparedOperationalRead<T>> {
    const p = structuredClone(principal), actor = actorFor(p);
    const context = await this.access.readContext(actor, p.workspaceId);
    if (context.actor_role !== p.user.role) throw new OperationalReadError("OPERATIONAL_READ_CHANGED", 409);
    const cohort = operationalAuditCohort(context, actor);
    const changed = () => new OperationalReadError("OPERATIONAL_READ_CHANGED", 409);
    const state: Flight<T> = { issuer: this, onError: safeError, fence: { actor, workspace: p.workspaceId,
      captured: context, changed, check: next => {
        const renewed = operationalAuditCohort(next, actor);
        if (next.actor_role !== p.user.role || renewed.fingerprint !== cohort.fingerprint) throw changed();
      }, until: next => Math.min(...environments.map(environment =>
        nativeNoticeValidUntil(next, environment, next.actor_lease_until_ms!))) } };
    try { Object.assign(state, await build(cohort, check => { state.beforeFinal = check; })); }
    catch (error) { state.error = safeError(error); }
    const handle = Object.freeze({}) as PreparedOperationalRead<T>;
    flights.set(handle, state); return handle;
  }
  /** One exact current audit target, not a PortalUser/role wrapper or a census
   * of unrelated grants. load may extract bounded immutable target metadata;
   * decode is protected by a fresh full-graph audit decision. All contextual
   * errors (including absent/unusable targets) remain inside the same flight. */
  async prepareExact<T>(actor: AccessActor, workspace: string, load: (captured: AccessEvaluationContext) => Promise<{
    target: ExactAuditTarget;
    authorize?: ExactReadAuthorizer;
    beforeFinal?: () => Promise<void>;
    decode: (context: AccessEvaluationContext, decision: ReturnType<typeof requireCurrentTsAuditRead>) => T | Promise<T>;
  }>, onError: (error: unknown) => Error, beforeLoadTarget?: ExactAuditTarget): Promise<PreparedOperationalRead<T>> {
    const a = structuredClone(actor), captured = await this.access.readContext(a, workspace);
    const changed = () => new AccessPolicyError("ACCESS_RETRY_REQUIRED", 409);
    const captureTarget = (value: ExactAuditTarget): ExactAuditTarget => Object.freeze({
      resource: Object.freeze(accessResource.parse(value.resource)),
      environment: executionEnvironment.parse(value.environment) });
    let target: ExactAuditTarget | undefined, fingerprint: string | undefined;
    let authorize: ExactReadAuthorizer | undefined, qualificationFingerprint: string | undefined;
    const qualification = (context: AccessEvaluationContext,
      decision: ReturnType<typeof requireCurrentTsAuditRead>) => {
      if (!authorize) return undefined;
      const effective = { ...context, now_ms: Math.max(context.now_ms, Date.now()) };
      const value = authorize(effective, decision);
      if (!value || typeof value !== "object" || "then" in value ||
        typeof value.proof !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value.proof) ||
        !Number.isSafeInteger(value.valid_until_ms) ||
        value.valid_until_ms <= Math.max(effective.now_ms, Date.now()))
        throw new OperationalReadError("OPERATIONAL_READ_AUTHORITY_UNAVAILABLE");
      if (qualificationFingerprint !== undefined && qualificationFingerprint !== value.proof) throw changed();
      // Genuine Core lease renewal is not an immutable authority change.
      qualificationFingerprint ??= value.proof;
      return value;
    };
    const audit = (context: AccessEvaluationContext) => {
      if (context.principal_id !== a.user_id || context.workspace_id !== workspace || !context.actor_current ||
        !context.authority_fingerprint || !Number.isSafeInteger(context.now_ms) ||
        !Number.isSafeInteger(context.actor_lease_until_ms) ||
        Math.max(context.now_ms, Date.now()) >= context.actor_lease_until_ms!)
        throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED", 403);
      // Core changes retain the established retry response, before attempting
      // a new target decision. A renewed genuine lease is NOT in this digest.
      if (context.authority_fingerprint !== captured.authority_fingerprint) throw changed();
      if (!target) return undefined;
      const decision = requireCurrentTsAuditRead(context, target.resource, target.environment);
      const proof = accessDigest({ domain: "portal.execution.exact-audit.v1", actor: a, workspace,
        core: context.authority_fingerprint, target,
        decision: [decision.policy_revision, decision.scope_revision, decision.field_policy_ref],
        source: currentBoundaryProof(context, target.environment, [target.resource]) });
      if (fingerprint !== undefined && fingerprint !== proof) throw changed();
      const qualified = qualification(context, decision);
      return { decision, proof, qualified };
    };
    const state: Flight<T> = { issuer: this, onError, fence: { actor: a, workspace, captured, changed,
      check: context => { audit(context); },
      until: context => {
        const primary = target ? nativeNoticeValidUntil(context, target.environment, context.actor_lease_until_ms!) :
          context.actor_lease_until_ms!;
        const qualified = target ? audit(context)?.qualified : undefined;
        return qualified ? Math.min(primary, qualified.valid_until_ms) : primary;
      } } };
    try {
      if (beforeLoadTarget) {
        target = captureTarget(beforeLoadTarget);
        fingerprint = audit(captured)!.proof; // Collection authority BEFORE any private row/count SQL.
      }
      const loaded = await load(captured), selected = captureTarget(loaded.target);
      if (target && (target.resource.kind !== selected.resource.kind || target.resource.id !== selected.resource.id ||
        target.environment !== selected.environment)) throw new Error("EXACT_READ_TARGET_CHANGED");
      target = selected;
      authorize = loaded.authorize;
      state.beforeFinal = loaded.beforeFinal;
      // The raw store transaction is already released. Refresh current source
      // relations as well as Core before any private record/status decoder.
      const fresh = await this.access.readContext(a, workspace), authorized = audit(fresh)!;
      fingerprint ??= authorized.proof;
      // Additional parent/member/field obligations are synchronous above,
      // BEFORE bounded protected SQL/hash decoding. Its local transaction
      // releases before finish refreshes native source and LAST Core.
      state.result = await loaded.decode(fresh, authorized.decision);
    } catch (error) { state.error = onError(error); }
    const handle = Object.freeze({}) as PreparedOperationalRead<T>;
    flights.set(handle, state); return handle;
  }
  async finish<T, R = T>(handle: PreparedOperationalRead<T>, project?: (body: T) => R): Promise<R> {
    const state = flights.get(handle) as Flight<T> | undefined;
    if (!state || state.issuer !== this) throw new OperationalReadError("OPERATIONAL_READ_SCOPE_REQUIRED");
    flights.delete(handle);
    const { fence } = state;
    try { await state.beforeFinal?.(); } catch (error) { state.error = state.onError(error); }
    let result: R | undefined;
    if (!state.error && state.result !== undefined) {
      try {
        result = project ? project(state.result) : state.result as unknown as R;
        if (result && typeof result === "object" && "then" in result)
          throw new OperationalReadError("OPERATIONAL_READ_UNAVAILABLE");
        if (Buffer.byteLength(JSON.stringify(result), "utf8") > 1_048_576)
          throw new OperationalReadError("OPERATIONAL_READ_RESPONSE_BOUND");
      } catch (error) { state.error = state.onError(error); }
    }
    let fresh = fence.captured;
    try {
      fresh = await this.access.readContext(fence.actor, fence.workspace);
      fence.check(fresh);
    } catch (error) {
      // A failed fresh relation read NEVER authorizes the body via captured
      // relations. Keep only its fixed safe error, then still check current
      // Core/session. captured is an error-only expected Core fingerprint.
      state.error = state.onError(error);
    }
    // LAST await for body AND contextual errors. No adapter/socket I/O after it.
    let confirmed: AccessEvaluationContext;
    try { confirmed = await this.access.confirmReadContext(fence.actor, fence.workspace, fresh); }
    catch (error) { throw state.onError(error); }
    let until: number | undefined, boundaryError: Error | undefined;
    try { until = fence.until(confirmed); } catch (error) { boundaryError = state.onError(error); }
    try { fence.check({ ...confirmed, now_ms: Math.max(confirmed.now_ms, Date.now()) }); }
    catch (error) { boundaryError = state.onError(error); }
    // O(1) terminal clock check AFTER potentially large synchronous proof/hash
    // construction. A future DENY/native transition cannot slip past an earlier
    // per-target check; genuine session renewal above remains supported.
    const now = Math.max(confirmed.now_ms, Date.now());
    if (!Number.isSafeInteger(confirmed.actor_lease_until_ms) || now >= confirmed.actor_lease_until_ms!)
      throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED", 403);
    // A current exact DENY/expiry keeps its uniform 404. If the wall clock
    // crosses only AFTER the final proof, conservatively require a retry.
    if (boundaryError) throw boundaryError;
    if (until !== undefined && now >= until) throw fence.changed();
    if (state.error) throw state.error;
    if (result === undefined) throw state.onError(new OperationalReadError("OPERATIONAL_READ_UNAVAILABLE"));
    return result;
  }
}
