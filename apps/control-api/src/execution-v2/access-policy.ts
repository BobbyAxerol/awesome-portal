import { createHash } from "node:crypto";
import { AccessAction, AccessPolicyError, AccessResource, AccessRefusal, GrantChange,
  ReviewedAccessPolicy, ResourceSelector, ScopedAccessGrant, tsBusinessAction } from "./access.contract";

/** Trusted finite relations; no browser name, owner string or historical attribution. */
export interface AccessRelations {
  qualified: boolean;
  revision: string;
  own_alpha_ids: readonly string[];
  member_portfolio_ids: readonly string[];
  roots: Readonly<Record<string, readonly AccessResource[]>>;
  /** Current canonical TS revision/receipt, obtained by a qualified adapter. */
  membership: null | { revision: string; receipt_id: string; mapping_revision: string };
}
export const unqualifiedAccessRelations = (): AccessRelations => ({ qualified: false, revision: "UNQUALIFIED",
  own_alpha_ids: [], member_portfolio_ids: [], roots: {}, membership: null });

/** Canonical object keys; arrays preserve order unless explicitly declared sets. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([key,item]) => [key,canonical(item)]));
  return value;
}
export const accessDigest = (value: unknown): string => `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
export function canonicalSelector(selector: ResourceSelector): ResourceSelector {
  if (selector.kind === "EXPLICIT_RESOURCE_SET") return { ...selector, ids: [...selector.ids].sort() };
  if (selector.kind === "PORTFOLIO_MEMBERSHIP") return { ...selector, portfolio_ids: [...selector.portfolio_ids].sort() };
  return selector;
}
export const canonicalChange = (change: GrantChange): GrantChange => ({ ...change,
  selector: canonicalSelector(change.selector), environments: [...change.environments].sort(),
  delegable_actions: [...change.delegable_actions].sort() });

export function resolvedResources(selector: ResourceSelector, relations: AccessRelations): AccessResource[] {
  if (selector.kind === "EXPLICIT_RESOURCE_SET") return selector.ids.map(id => ({ kind: selector.resource_kind, id }));
  if (!relations.qualified) throw new AccessPolicyError("SOURCE_RELATION_NOT_QUALIFIED");
  if (selector.kind === "OWN_ALPHA") return relations.own_alpha_ids.map(id => ({ kind: "ALPHA", id }));
  if (selector.kind === "PORTFOLIO_MEMBERSHIP") return selector.portfolio_ids
    .filter(id => relations.member_portfolio_ids.includes(id)).map(id => ({ kind: "PORTFOLIO", id }));
  const resources = relations.roots[selector.root_id];
  if (!resources) throw new AccessPolicyError("SOURCE_RELATION_NOT_QUALIFIED");
  return [{ kind: "ROOT", id: selector.root_id }, ...resources];
}
const resourceKey = (r: AccessResource) => JSON.stringify([r.kind,r.id]);
const subset = <T>(child: readonly T[], parent: readonly T[]) => child.every(value => parent.includes(value));
function selectorSubset(child: ResourceSelector, childRelations: AccessRelations, parent: ResourceSelector, parentRelations: AccessRelations) {
  const allowed = new Set(resolvedResources(parent,parentRelations).map(resourceKey));
  const requested = resolvedResources(child,childRelations);
  // A currently empty dynamic selector must not acquire future unbounded rights.
  return requested.length > 0 && requested.every(resource => allowed.has(resourceKey(resource)));
}
const intervalWithin = (child: {valid_from_ms:number;valid_until_ms:number|null}, parent: {valid_from_ms:number;valid_until_ms:number|null}) =>
  child.valid_from_ms >= parent.valid_from_ms && (parent.valid_until_ms === null ||
    child.valid_until_ms !== null && child.valid_until_ms <= parent.valid_until_ms);

export interface AccessEvaluationContext {
  principal_id: string;
  workspace_id: string;
  now_ms: number;
  actor_current: boolean;
  policy: ReviewedAccessPolicy | null;
  grants: readonly ScopedAccessGrant[];
  /** Current lifecycle AND membership, including grant issuers. */
  active_principals: ReadonlySet<string>;
  relationsFor: (userId: string) => AccessRelations;
  allow_test_only?: boolean;
  /** Internal read-snapshot proof, never a browser-supplied entitlement. */
  authority_fingerprint?: string;
  actor_role?: "ADMIN"|"USER";
}
export function policyReady(context: AccessEvaluationContext): boolean {
  const policy = context.policy;
  return Boolean(policy && policy.workspace_id === context.workspace_id && policy.state === "REVIEWED" &&
    (policy.qualification === "OWNER_VERIFIED" || context.allow_test_only === true && policy.qualification === "TEST_ONLY"));
}

/** Re-evaluate the complete current chain on every use; no insert-time entitlement cache. */
export function grantCurrent(grant: ScopedAccessGrant, context: AccessEvaluationContext, seen = new Set<string>()): boolean {
  if (!policyReady(context) || seen.size >= 16 || seen.has(grant.grant_id) || grant.workspace_id !== context.workspace_id ||
    grant.policy_revision !== context.policy!.revision || grant.revoked_at_ms !== null || grant.valid_from_ms > context.now_ms ||
    grant.valid_until_ms !== null && grant.valid_until_ms <= context.now_ms ||
    !context.active_principals.has(grant.subject_user_id) || !context.active_principals.has(grant.issued_by)) return false;
  seen.add(grant.grant_id);
  // A reviewed Portal artifact cannot waive the independent TS authority gate.
  if (grant.requires_ts_acceptance || tsBusinessAction(grant.action)&&grant.effect==="ALLOW") {
    const receipt=grant.ts_receipt, current=context.relationsFor(grant.subject_user_id).membership;
    if (!receipt || !current || receipt.receipt_id !== current.receipt_id || receipt.membership_revision !== current.revision ||
      receipt.mapping_revision !== current.mapping_revision || receipt.effective_at_ms > context.now_ms ||
      receipt.expires_at_ms !== null && receipt.expires_at_ms <= context.now_ms) return false;
  }
  if (grant.parent_grant_id === null) return grant.issued_by === context.policy!.protected_owner_user_id;
  const parent=context.grants.find(item => item.grant_id === grant.parent_grant_id);
  if (!parent || parent.subject_user_id !== grant.issued_by || parent.effect !== "ALLOW" || parent.action !== "access.grant" ||
    !parent.delegable_actions.includes(grant.action) || !subset(grant.delegable_actions,parent.delegable_actions) ||
    !subset(grant.environments,parent.environments) || !intervalWithin(grant,parent) || !grantCurrent(parent,context,seen)) return false;
  try { return selectorSubset(grant.selector,context.relationsFor(grant.subject_user_id), parent.selector,context.relationsFor(parent.subject_user_id)); }
  catch { return false; }
}

export type AccessDecision = { allowed: boolean; reason_code: AccessRefusal | null; decision_id: string;
  policy_revision: string | null; scope_revision: string; field_policy_ref: string | null };

/** Explicit current denial of an issuer's delegation also withdraws descendant use. */
function ancestorDelegationDenied(grant: ScopedAccessGrant, context: AccessEvaluationContext,
  resource: AccessResource, environment: "paper"|"sandbox"|"live"): boolean {
  const seen=new Set<string>(); let node:ScopedAccessGrant|undefined=grant;
  while(node?.parent_grant_id && !seen.has(node.grant_id)) {
    seen.add(node.grant_id);
    if(context.grants.some(deny=>deny.subject_user_id===node!.issued_by && deny.action==="access.grant" &&
      deny.effect==="DENY" && deny.environments.includes(environment) && grantCurrent(deny,context) && (()=>{
        try{return resolvedResources(deny.selector,context.relationsFor(deny.subject_user_id)).some(r=>resourceKey(r)===resourceKey(resource));}
        catch{return false;}
      })())) return true;
    node=context.grants.find(item=>item.grant_id===node!.parent_grant_id);
  }
  return false;
}
function matchingGrants(context:AccessEvaluationContext,action:AccessAction,resource:AccessResource,
  environment:"paper"|"sandbox"|"live") {
  return context.grants.filter(grant=>grant.subject_user_id===context.principal_id&&grant.action===action&&
    grant.environments.includes(environment)&&grantCurrent(grant,context)&&
    !ancestorDelegationDenied(grant,context,resource,environment)).filter(grant=>{
      try{return resolvedResources(grant.selector,context.relationsFor(context.principal_id)).some(r=>resourceKey(r)===resourceKey(resource));}
      catch{return false;}
    });
}
export function evaluateAccess(context: AccessEvaluationContext, action: AccessAction, resource: AccessResource,
  environment: "paper"|"sandbox"|"live"): AccessDecision {
  const chainProof = (grant: ScopedAccessGrant) => {
    const proof: unknown[] = [], seen = new Set<string>();
    let node: ScopedAccessGrant | undefined = grant;
    while (node && !seen.has(node.grant_id) && seen.size < 16) {
      seen.add(node.grant_id);
      proof.push([node.grant_id,node.revision,node.revoked_at_ms,context.relationsFor(node.subject_user_id).revision]);
      node = node.parent_grant_id ? context.grants.find(item => item.grant_id === node!.parent_grant_id) : undefined;
    }
    return proof;
  };
  const decide = (allowed: boolean, reason: AccessRefusal|null, grants: readonly ScopedAccessGrant[] = []): AccessDecision => ({
    allowed, reason_code: reason, decision_id: accessDigest([context.principal_id,context.workspace_id,action,resource,environment,
      grants.map(grant => [grant.grant_id,grant.revision]),reason]), policy_revision: context.policy?.revision ?? null,
    scope_revision: accessDigest([context.principal_id,context.workspace_id,environment,context.relationsFor(context.principal_id).revision,
      [...grants].sort((a,b)=>a.grant_id < b.grant_id ? -1 : 1).map(chainProof)]),
    field_policy_ref: allowed ? grants.find(g => g.effect === "ALLOW")?.field_policy_ref ?? null : null });
  if (!context.actor_current || !context.active_principals.has(context.principal_id)) return decide(false,"CURRENT_ACTOR_AUTHORITY_REQUIRED");
  if (action === "owner.recovery") return decide(false,"OWNER_RECOVERY_NOT_APPROVED");
  if (!policyReady(context)) return decide(false,"POLICY_PENDING");
  const matches = matchingGrants(context,action,resource,environment);
  if (matches.some(grant => grant.effect === "DENY")) return decide(false,"ACCESS_DENIED",matches);
  if (!matches.some(grant => grant.effect === "ALLOW")) return decide(false,"ACCESS_DENIED");
  if (action === "portfolio.read_restricted" && context.policy!.researcher_fields.state !== "QUALIFIED")
    return decide(false,"RESEARCHER_FIELD_POLICY_PENDING",matches);
  return decide(true,null,matches);
}

/** Full business read implies a business read, never technical, export or
 * mutation. A narrower current DENY still wins; no cross-action bypass. */
export function evaluateBusinessRead(context:AccessEvaluationContext,
  action:"business.read_all"|"alpha.read"|"portfolio.read"|"portfolio.read_restricted"|"portfolio.discover_linked"|"account.read"|"binding.read",
  resource:AccessResource,environment:"paper"|"sandbox"|"live"):AccessDecision {
  const direct=evaluateAccess(context,action,resource,environment);
  if(!policyReady(context)||!context.actor_current||!context.active_principals.has(context.principal_id))return direct;
  const relevant:AccessAction[]=["business.read_all",action];
  if(action==="business.read_all") relevant.push(...({
    ROOT:[],ALPHA:["alpha.read"],ALPHA_VERSION:["alpha.read"],DEPLOYMENT:["alpha.read"],
    PORTFOLIO:["portfolio.read","portfolio.read_restricted","portfolio.discover_linked"],
    ACCOUNT:["account.read"],BINDING:["binding.read"],USER:[],
  } satisfies Record<AccessResource["kind"],AccessAction[]>)[resource.kind]);
  for(const candidate of new Set(relevant))if(matchingGrants(context,candidate,resource,environment).some(g=>g.effect==="DENY"))
    return {...evaluateAccess(context,candidate,resource,environment),allowed:false,reason_code:"ACCESS_DENIED",field_policy_ref:null};
  return direct.allowed?direct:evaluateAccess(context,"business.read_all",resource,environment);
}

/** A correlated row must not retain a denied lineage component merely because
 * the parent Alpha/Portfolio is readable. This is a DENY check, not a grant of
 * child finance or technical access. */
export function businessReadDenied(context:AccessEvaluationContext,resource:AccessResource,
  environment:"paper"|"sandbox"|"live"):boolean {
  const actions:AccessAction[]=["business.read_all","alpha.read","portfolio.read","portfolio.read_restricted",
    "portfolio.discover_linked","account.read","binding.read"];
  return actions.some(action=>matchingGrants(context,action,resource,environment).some(g=>g.effect==="DENY"));
}

/** One ceiling supplies action+scope+onward rights; never union fragmented grants. */
export function validateDelegation(context: AccessEvaluationContext, change: GrantChange): ScopedAccessGrant {
  if (!context.actor_current || !context.active_principals.has(context.principal_id)) throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED");
  if (!policyReady(context)) throw new AccessPolicyError("POLICY_PENDING");
  if (change.subject_user_id === context.principal_id) throw new AccessPolicyError("SELF_PRIVILEGE_CHANGE_DENIED");
  if (change.subject_user_id === context.policy!.protected_owner_user_id) throw new AccessPolicyError("PROTECTED_OWNER_CHANGE_DENIED");
  if (change.action === "owner.recovery") throw new AccessPolicyError("OWNER_RECOVERY_NOT_APPROVED");
  if (change.expected_policy_revision !== context.policy!.revision) throw new AccessPolicyError("POLICY_REVISION_CONFLICT",409);
  const ceiling=context.grants.find(g => g.grant_id === change.ceiling_grant_id && g.subject_user_id === context.principal_id);
  if (!ceiling || ceiling.action !== "access.grant" || ceiling.effect !== "ALLOW" || !grantCurrent(ceiling,context) ||
    !ceiling.delegable_actions.includes(change.action) || !subset(change.delegable_actions,ceiling.delegable_actions) ||
    !subset(change.environments,ceiling.environments) || !intervalWithin(change,ceiling) ||
    !selectorSubset(change.selector,context.relationsFor(change.subject_user_id),ceiling.selector,context.relationsFor(context.principal_id)))
    throw new AccessPolicyError("DELEGATION_CEILING_EXCEEDED");
  if (ceiling.revision !== change.expected_ceiling_revision) throw new AccessPolicyError("GRANT_REVISION_CONFLICT",409);
  const ancestors = new Set<string>([change.subject_user_id]);
  let node: ScopedAccessGrant | undefined = ceiling;
  while (node) {
    if (ancestors.has(node.issued_by)) throw new AccessPolicyError("SELF_PRIVILEGE_CHANGE_DENIED");
    ancestors.add(node.subject_user_id);
    node = node.parent_grant_id ? context.grants.find(g => g.grant_id === node!.parent_grant_id) : undefined;
  }
  // Explicit current DENY of access.grant cannot be bypassed by naming an ALLOW ceiling.
  const resources=resolvedResources(change.selector,context.relationsFor(change.subject_user_id));
  for (const resource of resources) for (const environment of change.environments) {
    const decision=evaluateAccess(context,"access.grant",resource,environment);
    if (!decision.allowed) throw new AccessPolicyError("DELEGATION_CEILING_EXCEEDED");
  }
  return ceiling;
}
