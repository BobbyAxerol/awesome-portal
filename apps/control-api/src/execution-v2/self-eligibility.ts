/** Current own application permission/menu projection, advisory only.
 * Never a source, step-up, family-preview or command permit. Genuine current
 * Core/source capture and held-error fencing stay in ExecutionAccessService.
 */
import { z } from "zod";
import { AccessPolicyError, accessText, resourceKind, tsBusinessAction,
  type AccessAction, type AccessResource, type ScopedAccessGrant,
  type ManagerDomainGrant } from "./access.contract";
import { businessReadDenied, currentGrantAllows, evaluateAccess, evaluateBusinessRead, grantCurrent, policyReady,
  resolvedResources, selectManagerDomainGrant,
  type AccessEvaluationContext } from "./access-policy";
import { currentAccessRelations, currentGrantProof,
  type AccessEnvironment } from "./access-current-relations";
import { requireCurrentTsAuditRead } from "./current-audit-read";

/** Internal captured facts only. Main adds this same optional field to the
 * genuine context; it is never parsed from a browser or returned as grants. */
export type SelfEligibilityContext = AccessEvaluationContext & {
  manager_domain_grants?: readonly ManagerDomainGrant[];
  /** Same-workspace Core routing fact, NOT a permission/source-readiness fact.
   * Pure callers that did not capture it must remain NOT_ESTABLISHED. */
  current_read_mode?: "LEGACY_COMPATIBILITY" | "SCOPED_V2";
  /** Internal source dependency closure, not the complete Core grant graph.
   * Absent preserves the original standalone pure-vector semantics. */
  source_principal_ids?: ReadonlySet<string>;
};
/** NEW caller selectors only; no global access grammar rewrite or normalization.
 * Reject terminal LF, every ASCII control, malformed UTF-16 and over-256 UTF8
 * bytes. Existing opaque own grant IDs keep canonical accessText codepoints. */
export const scopedText = z.string().min(1).refine(value =>
  !/[\u0000-\u001f\u007f]/u.test(value) && Buffer.byteLength(value, "utf8") <= 256 &&
  Buffer.from(value, "utf8").toString("utf8") === value, "INVALID_SCOPED_TEXT");
const scopedResource = z.object({ kind: resourceKind, id: scopedText }).strict();

// No new PORTAL_CAPABILITIES. These action names already exist in ACCESS_ACTIONS.
export const ROW_ACTIONS = ["alpha.read", "portfolio.read", "portfolio.read_restricted",
  "portfolio.discover_linked", "account.read", "binding.read", "audit.read",
  "governance.r1.read", "governance.r2.read", "governance.canary.read", "governance.live.read",
  "governance.r1.decide", "governance.r2.decide", "governance.canary.decide", "governance.live.decide",
  "maintenance.read", "development.read", "capital.fund", "capital.initial_grant", "capital.top_up",
  "capital.immediate_decrease", "capital.recall_partial", "capital.recall_full",
  "capital.adjust_target_budget", "capital.set_root_limit", "capital.apply_pending",
  "capital.cancel_remaining", "deployment.register"] as const satisfies readonly AccessAction[];
export type RowAction = typeof ROW_ACTIONS[number];
const environment = z.enum(["paper", "sandbox", "live"]);
export const eligibilityInput = z.object({ workspace_id: scopedText, environment,
  resource: scopedResource, actions: z.array(z.enum(ROW_ACTIONS)).min(1).max(16)
    .refine(values => new Set(values).size === values.length, "DUPLICATE_ACTION"),
}).strict();
export const navigationInput = z.object({ workspace_id: scopedText, environment }).strict();
// GET form/explode=false: one comma-separated value, never JSON/repeated keys.
export const eligibilityQuery = z.object({ workspace_id: scopedText, environment,
  resource_kind: resourceKind, resource_id: scopedText,
  actions: z.string().min(1).max(1024).transform(value => value.split(",")),
}).strict().transform(value => ({ workspace_id: value.workspace_id, environment: value.environment,
  resource: { kind: value.resource_kind, id: value.resource_id }, actions: value.actions })).pipe(eligibilityInput);
type Kind = AccessResource["kind"];
const businessReads = ["alpha.read", "portfolio.read", "portfolio.read_restricted",
  "portfolio.discover_linked", "account.read", "binding.read"] as const;
type BusinessRead = typeof businessReads[number];
const isBusinessRead = (action: RowAction): action is BusinessRead =>
  (businessReads as readonly string[]).includes(action);
export const NAVIGATION_ACTIONS = ["alpha.read", "portfolio.read", "portfolio.read_restricted",
  "portfolio.discover_linked", "account.read", "binding.read", "audit.read"] as const satisfies readonly RowAction[];
/** NEW advisory endpoint capacity only, NOT a grant/native wire limit. No
 * partial source fetch or truncated authority is allowed above this bound. */
export const MAX_SELF_SOURCE_PRINCIPALS = 64;
/** Complete conservative dependency closure of the EXISTING evaluator:
 * both effects, every exact parent, and each issuer's access.grant DENYs.
 * The returned IDs select adapter reads only; NEVER filter context.grants.
 * Explicit selectors are deliberately not used to prune source dependencies.
 */
export function selfProjectionPrincipalIds(context: AccessEvaluationContext,
  env: AccessEnvironment, actions: readonly RowAction[]): readonly string[] {
  // Same stored-graph envelope as AccessRepository.storedGrants, not a new
  // scope-specific grant ceiling. Check before any adapter await.
  if (context.grants.length > 10000)
    throw new AccessPolicyError("ACCESS_SCOPE_LIMIT_EXCEEDED", 503);
  if (!policyReady(context)) return [];
  const relevant = new Set<AccessAction>(actions);
  if (actions.some(isBusinessRead)) relevant.add("business.read_all");
  const byId = new Map<string, ScopedAccessGrant>();
  const delegationDenies = new Map<string, ScopedAccessGrant[]>();
  // Include NOT-YET-started nodes: they may start during another source await
  // without changing Core fingerprint. An expired interval cannot revive at
  // or after this captured clock; service clamps its final clock to it.
  const corePossible = (g: ScopedAccessGrant) => g.workspace_id === context.workspace_id &&
    g.policy_revision === context.policy!.revision && g.revoked_at_ms === null &&
    (g.valid_until_ms === null || g.valid_until_ms > context.now_ms) &&
    context.active_principals.has(g.subject_user_id) && context.active_principals.has(g.issued_by);
  for (const g of context.grants) {
    // Canonical parent lookup is Array.find: preserve FIRST, not last, if an
    // invalid synthetic vector repeats a fact ID. DB keys remain authoritative.
    if (!byId.has(g.grant_id)) byId.set(g.grant_id, g);
    if (g.action === "access.grant" && g.effect === "DENY" && g.environments.includes(env) && corePossible(g)) {
      const list = delegationDenies.get(g.subject_user_id) ?? [];
      list.push(g); delegationDenies.set(g.subject_user_id, list);
    }
  }
  const principals = new Set<string>(), checkedIssuers = new Set<string>();
  const checkedDenyStarts = new Set<ScopedAccessGrant>();
  const add = (id: string) => {
    principals.add(id);
    if (principals.size > MAX_SELF_SOURCE_PRINCIPALS)
      throw new AccessPolicyError("ACCESS_SCOPE_LIMIT_EXCEEDED", 503);
  };
  const path = (start: ScopedAccessGrant, includeDelegationDenies: boolean) => {
    let node: ScopedAccessGrant | undefined = start;
    const seen = new Set<string>();
    // grantCurrent/chainProof have the same 16-node limit. Longer/cyclic
    // chains cannot be current. This collector never makes them current.
    while (node && seen.size < 16 && !seen.has(node.grant_id) && corePossible(node)) {
      seen.add(node.grant_id); add(node.subject_user_id);
      if (!node.parent_grant_id) break;
      if (includeDelegationDenies && !checkedIssuers.has(node.issued_by)) {
        checkedIssuers.add(node.issued_by);
        for (const deny of delegationDenies.get(node.issued_by) ?? []) {
          if (checkedDenyStarts.has(deny)) continue;
          checkedDenyStarts.add(deny);
          // ancestorDelegationDenied calls grantCurrent on this DENY, not
          // ancestorDelegationDenied again; its exact parent chain is enough.
          path(deny, false);
        }
      }
      node = byId.get(node.parent_grant_id);
    }
  };
  for (const g of context.grants)
    if (g.subject_user_id === context.principal_id && relevant.has(g.action) &&
      g.environments.includes(env) && corePossible(g)) path(g, true);
  return [...principals].sort();
}
type Family = "BUSINESS_READ_SCOPE" | "CURRENT_AUDIT_READ" | "GOVERNANCE_READER" |
  "GOVERNANCE_PLAN" | "TECHNICAL_READ_SCOPE" | "CAPITAL_PREVIEW" |
  "PENDING_CONTROL_PREVIEW" | "INSTANCE_REGISTRATION_PREVIEW";
type Rule = { kinds: readonly Kind[]; family: Family; stepUp: boolean | null };
const capital: Rule = { kinds: ["ROOT", "PORTFOLIO", "DEPLOYMENT"], family: "CAPITAL_PREVIEW", stepUp: true };
const governanceRead: Rule = { kinds: ["PORTFOLIO", "DEPLOYMENT"], family: "GOVERNANCE_READER", stepUp: false };
const governancePlan: Rule = { kinds: ["PORTFOLIO", "DEPLOYMENT"], family: "GOVERNANCE_PLAN", stepUp: null };
const technical: Rule = { kinds: ["ROOT", "PORTFOLIO", "DEPLOYMENT", "ACCOUNT", "ALPHA", "ALPHA_VERSION", "BINDING"],
  family: "TECHNICAL_READ_SCOPE", stepUp: false };
// Request vocabulary, NOT row existence/lineage or family commissioning.
export const RULES: Readonly<Record<RowAction, Rule>> = {
  "alpha.read": { kinds: ["ALPHA", "ALPHA_VERSION", "DEPLOYMENT"], family: "BUSINESS_READ_SCOPE", stepUp: false },
  "portfolio.read": { kinds: ["PORTFOLIO"], family: "BUSINESS_READ_SCOPE", stepUp: false },
  "portfolio.read_restricted": { kinds: ["PORTFOLIO"], family: "BUSINESS_READ_SCOPE", stepUp: false },
  "portfolio.discover_linked": { kinds: ["PORTFOLIO"], family: "BUSINESS_READ_SCOPE", stepUp: false },
  "account.read": { kinds: ["ACCOUNT"], family: "BUSINESS_READ_SCOPE", stepUp: false },
  "binding.read": { kinds: ["BINDING"], family: "BUSINESS_READ_SCOPE", stepUp: false },
  "audit.read": { kinds: ["ROOT", "PORTFOLIO", "DEPLOYMENT", "ACCOUNT"], family: "CURRENT_AUDIT_READ", stepUp: false },
  "governance.r1.read": governanceRead, "governance.r2.read": governanceRead,
  "governance.canary.read": governanceRead, "governance.live.read": governanceRead,
  "governance.r1.decide": governancePlan, "governance.r2.decide": governancePlan,
  "governance.canary.decide": governancePlan, "governance.live.decide": governancePlan,
  "maintenance.read": technical, "development.read": technical,
  "capital.fund": capital, "capital.initial_grant": capital, "capital.top_up": capital,
  "capital.immediate_decrease": capital, "capital.recall_partial": capital, "capital.recall_full": capital,
  "capital.adjust_target_budget": capital, "capital.set_root_limit": capital,
  "capital.apply_pending": { kinds: ["PORTFOLIO", "DEPLOYMENT"], family: "PENDING_CONTROL_PREVIEW", stepUp: true },
  "capital.cancel_remaining": { kinds: ["PORTFOLIO", "DEPLOYMENT"], family: "PENDING_CONTROL_PREVIEW", stepUp: true },
  "deployment.register": { kinds: ["PORTFOLIO"], family: "INSTANCE_REGISTRATION_PREVIEW", stepUp: true },
};
const reason = z.enum(["FAMILY_CHECK_REQUIRED", "NO_CURRENT_PERMISSION", "POLICY_PENDING",
  "FIELD_POLICY_PENDING", "ACTION_TARGET_UNSUPPORTED"]);
const rowSchema = z.object({ action: z.enum(ROW_ACTIONS), permission: z.enum(["ALLOWED", "UNAVAILABLE"]),
  // Opaque existing own ID: canonical <=256 Unicode codepoints, NOT selector bytes.
  reason_class: reason, public_copy_key: reason, grant_ref: accessText.nullable(),
  authority_mode: z.enum(["VERSIONED_CURRENT", "LEGACY_COMPATIBILITY", "APP_ONLY", "NOT_ESTABLISHED"]),
  step_up_required: z.boolean().nullable(), step_up_freshness: z.literal("NOT_CHECKED"),
  challenge_availability: z.literal("NOT_CHECKED"), command_readiness: z.literal("NOT_CHECKED"),
  family_check: z.enum(["BUSINESS_READ_SCOPE", "CURRENT_AUDIT_READ", "GOVERNANCE_READER", "GOVERNANCE_PLAN",
    "TECHNICAL_READ_SCOPE", "CAPITAL_PREVIEW", "PENDING_CONTROL_PREVIEW", "INSTANCE_REGISTRATION_PREVIEW"]),
}).strict().superRefine((value, ctx) => {
  if (value.public_copy_key !== value.reason_class ||
    value.family_check !== RULES[value.action].family || value.step_up_required !== RULES[value.action].stepUp ||
    (value.permission === "ALLOWED") !== (value.reason_class === "FAMILY_CHECK_REQUIRED") ||
    value.permission === "UNAVAILABLE" && (value.grant_ref !== null || value.authority_mode !== "NOT_ESTABLISHED") ||
    value.permission === "ALLOWED" && (value.grant_ref === null || value.authority_mode === "NOT_ESTABLISHED"))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ELIGIBILITY_ROW_INCONSISTENT" });
});
const projectionTimes = {
  observed_at_ms: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
    .describe("Portal evaluation time in UTC epoch milliseconds, not a source observation timestamp."),
  valid_until_ms: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
    .describe("End-exclusive ceiling of this actor's current session only, not the validity of permissions or source facts. Grants/native facts may expire or be revoked earlier. Not a cache TTL, permission lease or readiness guarantee; each family API rechecks current authority."),
};
export const eligibilityResult = z.object({ schema_version: z.literal("portal.self-eligibility.v1"),
  workspace_id: scopedText, environment, resource: scopedResource,
  current_only: z.literal(true), advisory_only: z.literal(true),
  ...projectionTimes,
  actions: z.array(rowSchema).min(1).max(16)
    .refine(rows => new Set(rows.map(row => row.action)).size === rows.length, "DUPLICATE_ACTION"),
}).strict().superRefine((value, ctx) => {
  if (value.valid_until_ms <= value.observed_at_ms)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["valid_until_ms"], message: "PROJECTION_INTERVAL_INVALID" });
  for (const [index, row] of value.actions.entries()) {
    const supported = RULES[row.action].kinds.includes(value.resource.kind);
    // projectRow gives policy readiness precedence over target mismatch.
    // Neither branch turns this advisory response into a family permit.
    if (supported ? row.reason_class === "ACTION_TARGET_UNSUPPORTED" :
      row.permission !== "UNAVAILABLE" ||
      !["ACTION_TARGET_UNSUPPORTED", "POLICY_PENDING"].includes(row.reason_class))
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["actions", index],
        message: "ELIGIBILITY_TARGET_INCONSISTENT" });
  }
});

function assertOwnMember(context: AccessEvaluationContext, workspace: string) {
  // No protected-owner membership exception for this NEW self projection.
  if (context.workspace_id !== workspace || !context.actor_current || context.actor_member !== true ||
    !context.active_principals.has(context.principal_id))
    throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND", 404);
  const captured = Object.hasOwn(context, "authority_fingerprint") || Object.hasOwn(context, "actor_lease_until_ms");
  if (!Number.isSafeInteger(context.now_ms) || context.now_ms < 0 || captured &&
    (!Number.isSafeInteger(context.actor_lease_until_ms) || context.actor_lease_until_ms! <= 0 ||
      context.now_ms >= context.actor_lease_until_ms!))
    throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED", 403);
}
function currentContext(context: SelfEligibilityContext, workspace: string): SelfEligibilityContext {
  assertOwnMember(context, workspace);
  const effective = { ...context, now_ms: Math.max(context.now_ms, Date.now()) };
  assertOwnMember(effective, workspace);
  return effective;
}
/** Temporal ceiling only. Complete future DENY/ancestor/receipt/native target
 * and app-domain/seal intervals count. Invalid source cannot authorize in the
 * existing evaluator; it is not repaired by a legacy fallback here. */
function projectionDeadline(context: SelfEligibilityContext, env: AccessEnvironment): number {
  let until = context.actor_lease_until_ms ?? Number.MAX_SAFE_INTEGER;
  const transition = (value: number | null | undefined) => {
    if (typeof value === "number" && Number.isSafeInteger(value) && value > context.now_ms)
      until = Math.min(until, value);
  };
  const principals = context.source_principal_ids ? new Set(context.source_principal_ids) :
    new Set([context.principal_id]);
  for (const grant of context.grants) {
    if (grant.workspace_id !== context.workspace_id) continue;
    if (!context.source_principal_ids) {
      principals.add(grant.subject_user_id); principals.add(grant.issued_by);
    }
    transition(grant.valid_from_ms); transition(grant.valid_until_ms); transition(grant.revoked_at_ms);
    transition(grant.ts_receipt?.effective_at_ms); transition(grant.ts_receipt?.expires_at_ms);
  }
  for (const id of principals) {
    const relations = context.relationsFor(id);
    if (!Object.hasOwn(relations, "current_authority")) continue;
    const source = currentAccessRelations.safeParse(relations.current_authority);
    if (!source.success) continue;
    for (const grant of source.data.grants) {
      transition(grant.accepted.effective_at_ms); transition(grant.accepted.expires_at_ms);
      for (const target of grant.targets) if (target.environment === env) {
        transition(target.valid_from_ms); transition(target.valid_until_ms);
      }
    }
  }
  for (const grant of context.manager_domain_grants ?? []) {
    if (grant.workspace_id !== context.workspace_id) continue;
    transition(grant.valid_from_ms); transition(grant.valid_until_ms); transition(grant.revoked_at_ms);
  }
  if (context.policy?.workspace_id === context.workspace_id)
    for (const seal of context.policy.manager_read_domains ?? []) {
      transition(seal.valid_from_ms); transition(seal.valid_until_ms);
    }
  return until;
}
type ProjectionOutcome<T> = { ok: true; value: T } | { ok: false; error: unknown };
function finishProjection<T>(outcome: ProjectionOutcome<T>, context: SelfEligibilityContext, until: number): T {
  const now = Math.max(context.now_ms, Date.now());
  const captured = Object.hasOwn(context, "authority_fingerprint") || Object.hasOwn(context, "actor_lease_until_ms");
  // Actor expiry wins over graph retry and any held public projection error.
  if (!Number.isSafeInteger(now) || captured &&
    (!Number.isSafeInteger(context.actor_lease_until_ms) || context.actor_lease_until_ms! <= 0 ||
      now >= context.actor_lease_until_ms!))
    throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED", 403);
  if (now >= until) throw new AccessPolicyError("ACCESS_RETRY_REQUIRED", 409);
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}
function projected<T>(context: SelfEligibilityContext, env: AccessEnvironment, build: (until: number) => T): T {
  const until = projectionDeadline(context, env);
  let outcome: ProjectionOutcome<T>;
  try {
    // The full workspace graph deliberately shortens the INTERNAL final-egress
    // fence. Its deadline must never become public: it can encode a peer's or
    // another environment's grant/seal transition. Publish only this actor's
    // captured session ceiling, with no invented now+TTL or MAX_SAFE fallback.
    const publicUntil = context.actor_lease_until_ms;
    if (!Number.isSafeInteger(publicUntil) || publicUntil! <= context.now_ms ||
      publicUntil! > Number.MAX_SAFE_INTEGER)
      throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED", 403);
    outcome = { ok: true, value: build(publicUntil!) };
  }
  catch (error) { outcome = { ok: false, error }; }
  return finishProjection(outcome, context, until);
}
function ownWitness(context: AccessEvaluationContext, action: RowAction, resource: AccessResource,
  env: AccessEnvironment): ScopedAccessGrant | null {
  const candidates = context.grants.filter(g => g.subject_user_id === context.principal_id && g.effect === "ALLOW" &&
    (g.action === action || isBusinessRead(action) && g.action === "business.read_all") &&
    (action !== "audit.read" || g.requires_ts_acceptance === true && context.relationsFor(g.subject_user_id).qualified === true))
    .sort((a, b) => a.grant_id < b.grant_id ? -1 : a.grant_id > b.grant_id ? 1 : 0);
  return candidates.find(g => currentGrantAllows(context, g.action, resource, env, g.grant_id)) ?? null;
}
function projectRow(context: AccessEvaluationContext, action: RowAction, resource: AccessResource, env: AccessEnvironment) {
  const rule = RULES[action];
  let code: z.infer<typeof reason> = "NO_CURRENT_PERMISSION";
  let allowed = false;
  if (!rule.kinds.includes(resource.kind)) code = "ACTION_TARGET_UNSUPPORTED";
  else if (action === "audit.read") {
    try { requireCurrentTsAuditRead(context, resource, env); allowed = true; }
    catch (error) {
      if (!(error instanceof AccessPolicyError) || error.code !== "ACCESS_RESOURCE_NOT_FOUND") throw error;
    }
  } else {
    const decision = isBusinessRead(action) ? evaluateBusinessRead(context, action, resource, env) :
      evaluateAccess(context, action, resource, env);
    allowed = decision.allowed;
    if (decision.reason_code === "POLICY_PENDING") code = "POLICY_PENDING";
    else if (decision.reason_code === "RESEARCHER_FIELD_POLICY_PENDING") code = "FIELD_POLICY_PENDING";
    // A missing read_all fallback must not hide a genuine restricted-grant
    // field-policy omission. This classifies absence only: canonical business
    // permission remains unchanged and the complete current DENY graph wins.
    else if (!allowed && action === "portfolio.read_restricted" &&
      !businessReadDenied(context, resource, env) &&
      evaluateAccess(context, action, resource, env).reason_code === "RESEARCHER_FIELD_POLICY_PENDING")
      code = "FIELD_POLICY_PENDING";
  }
  if (!policyReady(context)) code = "POLICY_PENDING";
  const witness = allowed ? ownWitness(context, action, resource, env) : null;
  allowed = allowed && witness !== null;
  let mode: "VERSIONED_CURRENT" | "LEGACY_COMPATIBILITY" | "APP_ONLY" | "NOT_ESTABLISHED" = "NOT_ESTABLISHED";
  if (allowed && witness) {
    if (witness.requires_ts_acceptance || tsBusinessAction(witness.action)) {
      const relations = context.relationsFor(witness.subject_user_id);
      if (Object.hasOwn(relations, "current_authority")) {
        const source = currentAccessRelations.safeParse(relations.current_authority);
        if (!relations.qualified || !source.success || !currentGrantProof(witness, source.data, resource, env, context.now_ms))
          throw new AccessPolicyError("ACCESS_RETRY_REQUIRED", 409);
        mode = "VERSIONED_CURRENT";
      } else mode = "LEGACY_COMPATIBILITY";
    } else mode = "APP_ONLY";
  }
  return rowSchema.parse({ action, permission: allowed ? "ALLOWED" : "UNAVAILABLE",
    reason_class: allowed ? "FAMILY_CHECK_REQUIRED" : code, public_copy_key: allowed ? "FAMILY_CHECK_REQUIRED" : code,
    grant_ref: allowed ? witness!.grant_id : null, authority_mode: mode,
    step_up_required: rule.stepUp, step_up_freshness: "NOT_CHECKED", challenge_availability: "NOT_CHECKED",
    command_readiness: "NOT_CHECKED", family_check: rule.family });
}
export function projectEligibility(context: SelfEligibilityContext, raw: unknown) {
  const input = eligibilityInput.parse(raw);
  const current = currentContext(context, input.workspace_id);
  return projected(current, input.environment, until => eligibilityResult.parse({
    schema_version: "portal.self-eligibility.v1", workspace_id: input.workspace_id,
    environment: input.environment, resource: input.resource, current_only: true, advisory_only: true,
    observed_at_ms: current.now_ms, valid_until_ms: until,
    actions: input.actions.map(action => projectRow(current, action, input.resource, input.environment)),
  }));
}

export const FEATURES = ["EXECUTION_PORTFOLIOS", "EXECUTION_ACCOUNTS_BINDINGS", "EXECUTION_OPERATIONS",
  "EXECUTION_BLOTTER"] as const;
const navSchema = z.object({ feature: z.enum(FEATURES), state: z.enum(["ENTERABLE", "HIDDEN"]),
  authority_mode: z.enum(["SCOPED_CURRENT", "APP_ONLY", "NOT_ESTABLISHED"]),
  family_check: z.literal("NOT_CHECKED"), source_readiness: z.literal("NOT_CHECKED"),
  field_readiness: z.literal("NOT_CHECKED"), command_readiness: z.literal("NOT_CHECKED"),
}).strict().superRefine((value, ctx) => {
  if ((value.state === "HIDDEN") !== (value.authority_mode === "NOT_ESTABLISHED") ||
    value.feature === "EXECUTION_OPERATIONS" && value.authority_mode === "APP_ONLY")
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "NAVIGATION_ROW_INCONSISTENT" });
});
export const navigationResult = z.object({ schema_version: z.literal("portal.self-navigation.v1"),
  workspace_id: scopedText, environment, current_only: z.literal(true), advisory_only: z.literal(true),
  ...projectionTimes,
  current_read_mode: z.enum(["LEGACY_COMPATIBILITY", "SCOPED_V2", "NOT_ESTABLISHED"])
    .describe("Current Core-workspace reader routing metadata only; not a grant, source readiness or command permit."),
  features: z.array(navSchema).length(FEATURES.length).superRefine((values, ctx) => {
    if (values.some((value, index) => value.feature !== FEATURES[index]))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "NAVIGATION_FEATURE_ORDER_INVALID" });
  }),
  self_entry: z.object({ feature: z.literal("PROFILE_ACCESS"), mode: z.literal("SELF_ONLY"),
    permission: z.literal("ALLOWED"), route: z.null(),
    consumer_state: z.literal("AWAITING_CONSUMER_ROUTER") }).strict(),
}).strict().superRefine((value, ctx) => {
  if (value.valid_until_ms <= value.observed_at_ms)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["valid_until_ms"], message: "PROJECTION_INTERVAL_INVALID" });
});

/** Exact app-domain selection only. serverProfileId is SERVER configuration,
 * absent from navigationInput; field/catalogue hashes never enter/leave public
 * JSON. No source call, entity witness or command permit is created. */
function domainMenuAllowed(context: SelfEligibilityContext, env: AccessEnvironment, serverProfileId?: string): boolean {
  if (serverProfileId === undefined) return false;
  if (!scopedText.safeParse(serverProfileId).success)
    throw new AccessPolicyError("POLICY_PENDING", 503);
  for (const seal of context.policy?.manager_read_domains ?? []) {
    if (seal.environment !== env || seal.domain.profile_id !== serverProfileId) continue;
    try {
      selectManagerDomainGrant(context, context.manager_domain_grants ?? [], env, seal.domain);
      return true;
    } catch (error) {
      if (!(error instanceof AccessPolicyError) || !["ACCESS_DENIED", "POLICY_PENDING"].includes(error.code)) throw error;
    }
  }
  return false;
}
export function projectNavigation(context: SelfEligibilityContext, raw: unknown, serverProfileId?: string) {
  const input = navigationInput.parse(raw);
  const current = currentContext(context, input.workspace_id);
  return projected(current, input.environment, until => {
    const candidates = new Map<string, AccessResource>();
    const navActions: readonly AccessAction[] = ["business.read_all", ...NAVIGATION_ACTIONS];
    let attempts = 0;
    for (const grant of current.grants) {
      if (grant.subject_user_id !== current.principal_id || grant.workspace_id !== current.workspace_id ||
        grant.effect !== "ALLOW" || grant.policy_revision !== current.policy?.revision || grant.revoked_at_ms !== null ||
        grant.valid_from_ms > current.now_ms || grant.valid_until_ms !== null && grant.valid_until_ms <= current.now_ms ||
        !current.active_principals.has(grant.subject_user_id) || !current.active_principals.has(grant.issued_by) ||
        !grant.environments.includes(input.environment) || !navActions.includes(grant.action)) continue;
      let resources: AccessResource[];
      try { resources = resolvedResources(grant.selector, current.relationsFor(current.principal_id), input.environment); }
      catch (error) {
        if (error instanceof AccessPolicyError && error.code === "SOURCE_RELATION_NOT_QUALIFIED") continue;
        throw error;
      }
      for (const resource of resources) {
        if (++attempts > 20000) throw new AccessPolicyError("ACCESS_SCOPE_LIMIT_EXCEEDED", 503);
        if (!["PORTFOLIO", "ACCOUNT", "BINDING", "ALPHA", "ALPHA_VERSION", "DEPLOYMENT"].includes(resource.kind)) continue;
        candidates.set(JSON.stringify([resource.kind, resource.id]), resource);
        if (candidates.size > 2000) throw new AccessPolicyError("ACCESS_SCOPE_LIMIT_EXCEEDED", 503);
      }
    }
    const selected = [...candidates.values()];
    const has = (kinds: readonly Kind[], actions: readonly RowAction[]) => selected.some(resource =>
      kinds.includes(resource.kind) && actions.some(action =>
        projectRow(current, action, resource, input.environment).permission === "ALLOWED"));
    const flags = [has(["PORTFOLIO"], ["portfolio.read", "portfolio.read_restricted", "portfolio.discover_linked"]),
      has(["ACCOUNT"], ["account.read"]) || has(["BINDING"], ["binding.read"]),
      has(["ACCOUNT", "PORTFOLIO", "DEPLOYMENT"], ["audit.read"]),
      has(["ALPHA", "ALPHA_VERSION", "DEPLOYMENT"], ["alpha.read"])];
    const appDomain = domainMenuAllowed(current, input.environment, serverProfileId);
    return navigationResult.parse({ schema_version: "portal.self-navigation.v1", workspace_id: input.workspace_id,
      environment: input.environment, current_only: true, advisory_only: true,
      observed_at_ms: current.now_ms, valid_until_ms: until,
      current_read_mode: current.current_read_mode ?? "NOT_ESTABLISHED",
      features: FEATURES.map((feature, index) => {
        const mode = flags[index] ? "SCOPED_CURRENT" : appDomain && feature !== "EXECUTION_OPERATIONS" ? "APP_ONLY" : "NOT_ESTABLISHED";
        return { feature, state: mode === "NOT_ESTABLISHED" ? "HIDDEN" : "ENTERABLE", authority_mode: mode,
          family_check: "NOT_CHECKED", source_readiness: "NOT_CHECKED", field_readiness: "NOT_CHECKED", command_readiness: "NOT_CHECKED" };
      }),
      self_entry: { feature: "PROFILE_ACCESS", mode: "SELF_ONLY", permission: "ALLOWED", route: null,
        consumer_state: "AWAITING_CONSUMER_ROUTER" },
    });
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
 * FE-068 · bounded multi-resource eligibility with a typed step-up state.
 * Additive sibling of the single-resource projection above, which is untouched
 * (same rows, same evaluator, same fences). It only reports what the server
 * already knows: the rule's `step_up_required` and whether THIS session holds an
 * unexpired step-up grant (the same fact the mutations recheck). It adds no
 * authentication mechanism, no permit and no lease: `ACTIVE` never makes an
 * action eligible and `REQUIRED` is a statement about the rule, not a refusal.
 * ───────────────────────────────────────────────────────────────────────────── */
export const MAX_BATCH_RESOURCES = 8;
const unique = <T>(values: readonly T[], key: (value: T) => string) => new Set(values.map(key)).size === values.length;
export const eligibilityBatchInput = z.object({ workspace_id: scopedText, environment,
  resources: z.array(scopedResource).min(1).max(MAX_BATCH_RESOURCES)
    .refine(values => unique(values, value => JSON.stringify([value.kind, value.id])), "DUPLICATE_RESOURCE"),
  actions: z.array(z.enum(ROW_ACTIONS)).min(1).max(16).refine(values => unique(values, value => value), "DUPLICATE_ACTION"),
}).strict();
// GET form/explode=false. `resources` = one comma-separated value of KIND:<encodeURIComponent(id)> tokens; the id is
// percent-encoded a second time so a comma inside an id can never split a token, and only the canonical encoding
// is accepted (no alternative spelling of the same id).
const resourceToken = /^([A-Z_]{1,16}):((?:[A-Za-z0-9\-_.!~*'()]|%[0-9A-F]{2}){1,768})$/;
export const eligibilityBatchQuery = z.object({ workspace_id: scopedText, environment,
  resources: z.string().min(1).max(8192), actions: z.string().min(1).max(1024),
}).strict().transform((value, ctx) => {
  const resources: Array<{ kind: string; id: string }> = [];
  for (const token of value.resources.split(",")) {
    const match = resourceToken.exec(token);
    let id: string | null = null;
    try { id = match ? decodeURIComponent(match[2]) : null; } catch { id = null; }
    if (!match || id === null || encodeURIComponent(id) !== match[2]) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "INVALID_RESOURCE_TOKEN" }); return z.NEVER;
    }
    resources.push({ kind: match[1], id });
  }
  return { workspace_id: value.workspace_id, environment: value.environment, resources, actions: value.actions.split(",") };
}).pipe(eligibilityBatchInput);

/** Rule says `step_up_required`; this says what that means for THIS session right now. */
export const STEP_UP_STATES = ["NOT_REQUIRED", "PLAN_DEPENDENT", "REQUIRED", "ACTIVE"] as const;
const stepUpStateOf = (required: boolean | null, active: boolean): typeof STEP_UP_STATES[number] =>
  required === false ? "NOT_REQUIRED" : required === null ? "PLAN_DEPENDENT" : active ? "ACTIVE" : "REQUIRED";
const batchRow = rowSchema.innerType().extend({ step_up_state: z.enum(STEP_UP_STATES) }).superRefine((value, ctx) => {
  const { step_up_state: state, ...stored } = value;
  const base = rowSchema.safeParse(stored);
  if (!base.success) for (const issue of base.error.issues) ctx.addIssue(issue);
  if (state !== stepUpStateOf(value.step_up_required, state === "ACTIVE") || state === "REQUIRED" && value.step_up_required !== true)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["step_up_state"], message: "STEP_UP_STATE_INCONSISTENT" });
});
const sessionStepUp = z.object({
  state: z.enum(["ACTIVE", "NOT_ACTIVE"]),
  valid_until_ms: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable()
    .describe("When THIS session's step-up ends, never later than this projection's session ceiling; null when not active."),
  /** The mechanism the build exposes to obtain a step-up, and whether its route precondition holds for the caller.
   * Not a promise that the password will be accepted and not a permission for any action. */
  challenge: z.object({ mechanism: z.literal("PASSWORD_REAUTH"), route: z.literal("/api/admin/profile-access/v2/step-up"),
    precondition: z.literal("CURRENT_OWN_ACCESS_GRANT_OR_REVOKE_ALLOW"), precondition_met: z.boolean() }).strict(),
}).strict();
export const eligibilityBatchResult = z.object({ schema_version: z.literal("portal.self-eligibility-batch.v1"),
  workspace_id: scopedText, environment, current_only: z.literal(true), advisory_only: z.literal(true),
  ...projectionTimes, session_step_up: sessionStepUp,
  results: z.array(z.object({ resource: scopedResource, actions: z.array(batchRow).min(1).max(16) }).strict())
    .min(1).max(MAX_BATCH_RESOURCES),
}).strict().superRefine((value, ctx) => {
  const bad = (message: string, path: (string | number)[]) => ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });
  if (value.valid_until_ms <= value.observed_at_ms) bad("PROJECTION_INTERVAL_INVALID", ["valid_until_ms"]);
  const step = value.session_step_up, active = step.state === "ACTIVE";
  if (active !== (step.valid_until_ms !== null) || step.valid_until_ms !== null &&
    (step.valid_until_ms <= value.observed_at_ms || step.valid_until_ms > value.valid_until_ms))
    bad("SESSION_STEP_UP_INVALID", ["session_step_up"]);
  if (!unique(value.results, item => JSON.stringify([item.resource.kind, item.resource.id]))) bad("DUPLICATE_RESOURCE", ["results"]);
  value.results.forEach((item, index) => {
    // Reuse the single-resource target/reason rules for every resource of the batch.
    const single = eligibilityResult.safeParse({ schema_version: "portal.self-eligibility.v1", workspace_id: value.workspace_id,
      environment: value.environment, resource: item.resource, current_only: true, advisory_only: true,
      observed_at_ms: value.observed_at_ms, valid_until_ms: value.valid_until_ms,
      actions: item.actions.map(({ step_up_state: _state, ...rest }) => rest) });
    if (!single.success) bad("ELIGIBILITY_BATCH_RESOURCE_INCONSISTENT", ["results", index]);
    item.actions.forEach((row, rowIndex) => {
      if (row.step_up_state === "ACTIVE" && !active || row.step_up_state === "REQUIRED" && active)
        bad("STEP_UP_STATE_INCONSISTENT", ["results", index, "actions", rowIndex, "step_up_state"]);
    });
  });
  const first = value.results[0]?.actions.map(row => row.action).join(",");
  if (value.results.some(item => item.actions.map(row => row.action).join(",") !== first)) bad("ELIGIBILITY_BATCH_ACTIONS_DIFFER", ["results"]);
});

/** Server fact: does THIS session hold an unexpired step-up? Gathered by the service after the actor fence. */
export interface SessionStepUpFact { active_until_ms: number | null }
/** Exactly the precondition of POST /step-up (ExecutionAccessService.stepUp): policy ready and a CURRENT own
 * ALLOW access.grant/access.revoke grant. It is reported, never enforced or widened here. */
function stepUpRouteAvailable(context: AccessEvaluationContext): boolean {
  return policyReady(context) && context.grants.some(grant => grant.subject_user_id === context.principal_id &&
    grant.effect === "ALLOW" && (grant.action === "access.grant" || grant.action === "access.revoke") && grantCurrent(grant, context));
}
export function projectEligibilityBatch(context: SelfEligibilityContext, raw: unknown, stepUp: SessionStepUpFact) {
  const input = eligibilityBatchInput.parse(raw);
  const current = currentContext(context, input.workspace_id);
  return projected(current, input.environment, until => {
    const observed = current.now_ms;
    const stepUpUntil = stepUp.active_until_ms !== null && Number.isSafeInteger(stepUp.active_until_ms) ?
      Math.min(stepUp.active_until_ms, until) : null;
    const active = stepUpUntil !== null && stepUpUntil > observed;
    return eligibilityBatchResult.parse({ schema_version: "portal.self-eligibility-batch.v1", workspace_id: input.workspace_id,
      environment: input.environment, current_only: true, advisory_only: true, observed_at_ms: observed, valid_until_ms: until,
      session_step_up: { state: active ? "ACTIVE" : "NOT_ACTIVE", valid_until_ms: active ? stepUpUntil : null,
        challenge: { mechanism: "PASSWORD_REAUTH", route: "/api/admin/profile-access/v2/step-up",
          precondition: "CURRENT_OWN_ACCESS_GRANT_OR_REVOKE_ALLOW", precondition_met: stepUpRouteAvailable(current) } },
      results: input.resources.map(resource => ({ resource,
        actions: input.actions.map(action => {
          const row = projectRow(current, action, resource, input.environment);
          return { ...row, step_up_state: stepUpStateOf(row.step_up_required, active) };
        }) })),
    });
  });
}
