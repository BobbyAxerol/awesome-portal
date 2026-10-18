import { AccessAction, AccessPolicyError, AccessResource, AccessRefusal, GrantChange,
  ReviewedAccessPolicy, ResourceSelector, ScopedAccessGrant, tsBusinessAction,
  type ManagerDomainGrant, type ManagerDomainFieldSeal, type ManagerReadDomain } from "./access.contract";
import { currentAccessRelations, currentGrantProof, currentResources,
  type CurrentAccessRelations, type AccessEnvironment } from "./access-current-relations";
import { accessDigest, canonicalSelector } from "./access-digest";
export { accessDigest, canonicalSelector } from "./access-digest";

/** Trusted finite relations; no browser name, owner string or historical attribution. */
export interface AccessRelations {
  qualified: boolean;
  revision: string;
  own_alpha_ids: readonly string[];
  member_portfolio_ids: readonly string[];
  roots: Readonly<Record<string, readonly AccessResource[]>>;
  /** Current canonical TS revision/receipt, obtained by a qualified adapter. */
  membership: null | { revision: string; receipt_id: string; mapping_revision: string };
  /** Opt-in versioned source result. Present-but-invalid NEVER falls back to
   * the legacy single tuple. No authority is installed by adding this port. */
  current_authority?: CurrentAccessRelations | null;
}
export const unqualifiedAccessRelations = (): AccessRelations => ({ qualified: false, revision: "UNQUALIFIED",
  own_alpha_ids: [], member_portfolio_ids: [], roots: {}, membership: null });

/** Legacy flattened fields must not override a versioned environment cut. */
export function environmentRelations(relations: AccessRelations, env: AccessEnvironment): AccessRelations {
  if (!Object.hasOwn(relations,"current_authority")) return relations;
  const parsed=currentAccessRelations.safeParse(relations.current_authority);
  const cut=parsed.success?parsed.data.resources.find(item=>item.environment===env):null;
  if (!relations.qualified || !cut) return {...relations,qualified:false,own_alpha_ids:[],member_portfolio_ids:[],roots:{}};
  return {...relations,own_alpha_ids:cut.own_alpha_ids,member_portfolio_ids:cut.member_portfolio_ids,
    roots:Object.fromEntries(cut.roots.filter(root=>root.complete&&root.resources.length>0)
      .map(root=>[root.root_id,root.resources]))};
}

/** Source proof at a delivery boundary. Unrelated native legs and global
 * observation revisions cannot invalidate this visible resource's identity. */
export function currentBoundaryProof(context: AccessEvaluationContext, env: AccessEnvironment,
  resources: readonly AccessResource[]) {
  const selected=[...new Map(resources.map(resource=>[JSON.stringify([resource.kind,resource.id]),resource])).values()]
    .sort((a,b)=>JSON.stringify(a)<JSON.stringify(b)?-1:JSON.stringify(a)>JSON.stringify(b)?1:0);
  const principals=[...new Set(context.grants.flatMap(g=>[g.subject_user_id,g.issued_by]).concat(context.principal_id))].sort();
  return principals.map(id=>{
    const relations=context.relationsFor(id);
    if (!Object.hasOwn(relations,"current_authority")) return [id,relations];
    const parsed=currentAccessRelations.safeParse(relations.current_authority);
    if (!relations.qualified || !parsed.success) return [id,"UNQUALIFIED_CURRENT_SOURCE"];
    const source=parsed.data, cut=source.resources.find(item=>item.environment===env);
    return [id,source.mapping_revision,selected.map(resource=>[resource,
      cut?.own_alpha_ids.includes(resource.id)&&resource.kind==="ALPHA",
      cut?.member_portfolio_ids.includes(resource.id)&&resource.kind==="PORTFOLIO",
      context.grants.filter(g=>g.subject_user_id===id&&g.environments.includes(env)).map(g=>[
        g.grant_id,currentGrantProof(g,source,resource,env,context.now_ms),
        grantCurrent(g,context,new Set(),{resource,environment:env})])])];
  });
}

export const canonicalChange = (change: GrantChange): GrantChange => ({ ...change,
  selector: canonicalSelector(change.selector), environments: [...change.environments].sort(),
  delegable_actions: [...change.delegable_actions].sort() });

export function resolvedResources(selector: ResourceSelector, relations: AccessRelations,
  environment?: AccessEnvironment): AccessResource[] {
  // Explicit static IDs do not need a dynamic census (also permits proving
  // that an explicit DENY is disjoint while another census is unavailable).
  if (selector.kind === "EXPLICIT_RESOURCE_SET") return selector.ids.map(id => ({ kind: selector.resource_kind, id }));
  if (Object.hasOwn(relations,"current_authority")) {
    const source = currentAccessRelations.safeParse(relations.current_authority);
    if (!relations.qualified || !source.success || !environment)
      throw new AccessPolicyError("SOURCE_RELATION_NOT_QUALIFIED");
    const resources = currentResources(selector,source.data,environment);
    if (!resources) throw new AccessPolicyError("SOURCE_RELATION_NOT_QUALIFIED");
    return resources;
  }
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
function selectorSubset(child: ResourceSelector, childRelations: AccessRelations, parent: ResourceSelector,
  parentRelations: AccessRelations, environment?: AccessEnvironment) {
  const allowed = new Set(resolvedResources(parent,parentRelations,environment).map(resourceKey));
  const requested = resolvedResources(child,childRelations,environment);
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

/** Correlation is mandatory for ALL versioned relations, including technical
 * grants and a new delegation subject that has no business grant yet. */
function currentSourceMatchesPrincipal(context:AccessEvaluationContext,principalId:string):boolean {
  const relations=context.relationsFor(principalId);
  if(!Object.hasOwn(relations,"current_authority"))return true;
  const parsed=currentAccessRelations.safeParse(relations.current_authority);
  return relations.qualified&&parsed.success&&parsed.data.subject_user_id===principalId&&
    parsed.data.workspace_id===context.workspace_id;
}

/** Re-evaluate the complete current chain on every use; no insert-time entitlement cache. */
export function grantCurrent(grant: ScopedAccessGrant, context: AccessEvaluationContext, seen = new Set<string>(),
  scope?: { resource: AccessResource; environment: AccessEnvironment }): boolean {
  if (!policyReady(context) || seen.size >= 16 || seen.has(grant.grant_id) || grant.workspace_id !== context.workspace_id ||
    grant.policy_revision !== context.policy!.revision || grant.revoked_at_ms !== null || grant.valid_from_ms > context.now_ms ||
    grant.valid_until_ms !== null && grant.valid_until_ms <= context.now_ms ||
    !context.active_principals.has(grant.subject_user_id) || !context.active_principals.has(grant.issued_by) ||
    !currentSourceMatchesPrincipal(context,grant.subject_user_id)) return false;
  seen.add(grant.grant_id);
  // A reviewed Portal artifact cannot waive the independent TS authority gate.
  if (grant.requires_ts_acceptance || tsBusinessAction(grant.action)&&grant.effect==="ALLOW") {
    const relations=context.relationsFor(grant.subject_user_id);
    if (Object.hasOwn(relations,"current_authority")) {
      const source=currentAccessRelations.safeParse(relations.current_authority);
      if (!relations.qualified || !source.success || source.data.subject_user_id!==grant.subject_user_id ||
        source.data.workspace_id!==context.workspace_id) return false;
      if (!scope) {
        // Whole-grant queries/intake require EVERY declared resource/environment,
        // not merely one good leg. Normal reads pass their exact use boundary.
        try { return grant.environments.every(environment => {
          const resources=resolvedResources(grant.selector,relations,environment);
          return resources.length>0 && resources.every(resource=>grantCurrent(grant,context,new Set(),{resource,environment}));
        }); } catch { return false; }
      }
      if (!grant.environments.includes(scope.environment) ||
        !currentGrantProof(grant,source.data,scope.resource,scope.environment,context.now_ms)) return false;
      try {
        if (!resolvedResources(grant.selector,relations,scope.environment).some(resource=>resourceKey(resource)===resourceKey(scope.resource)))
          return false;
      } catch { return false; }
    } else {
      const receipt=grant.ts_receipt, current=relations.membership;
      if (!receipt || !current || receipt.receipt_id !== current.receipt_id || receipt.membership_revision !== current.revision ||
        receipt.mapping_revision !== current.mapping_revision || receipt.effective_at_ms > context.now_ms ||
        receipt.expires_at_ms !== null && receipt.expires_at_ms <= context.now_ms) return false;
    }
  }
  if (grant.parent_grant_id === null) return grant.issued_by === context.policy!.protected_owner_user_id;
  const parent=context.grants.find(item => item.grant_id === grant.parent_grant_id);
  if (!parent || parent.subject_user_id !== grant.issued_by || parent.effect !== "ALLOW" || parent.action !== "access.grant" ||
    !parent.delegable_actions.includes(grant.action) || !subset(grant.delegable_actions,parent.delegable_actions) ||
    !subset(grant.environments,parent.environments) || !intervalWithin(grant,parent) || !grantCurrent(parent,context,seen,scope)) return false;
  try {
    const child=context.relationsFor(grant.subject_user_id), issuer=context.relationsFor(parent.subject_user_id);
    if (scope && (Object.hasOwn(child,"current_authority") || Object.hasOwn(issuer,"current_authority")))
      return resolvedResources(grant.selector,child,scope.environment).some(r=>resourceKey(r)===resourceKey(scope.resource)) &&
        resolvedResources(parent.selector,issuer,scope.environment).some(r=>resourceKey(r)===resourceKey(scope.resource));
    return grant.environments.every(environment=>selectorSubset(grant.selector,child,parent.selector,issuer,environment));
  }
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
      deny.effect==="DENY" && deny.environments.includes(environment) && grantCurrent(deny,context,new Set(),{resource,environment}) && (()=>{
        try{return resolvedResources(deny.selector,context.relationsFor(deny.subject_user_id),environment).some(r=>resourceKey(r)===resourceKey(resource));}
        catch{return Object.hasOwn(context.relationsFor(deny.subject_user_id),"current_authority");}
      })())) return true;
    node=context.grants.find(item=>item.grant_id===node!.parent_grant_id);
  }
  return false;
}
function matchingGrants(context:AccessEvaluationContext,action:AccessAction,resource:AccessResource,
  environment:"paper"|"sandbox"|"live") {
  return context.grants.filter(grant=>grant.subject_user_id===context.principal_id&&grant.action===action&&
    grant.environments.includes(environment)&&grantCurrent(grant,context,new Set(),{resource,environment})&&
    !ancestorDelegationDenied(grant,context,resource,environment)).filter(grant=>{
      try{return resolvedResources(grant.selector,context.relationsFor(context.principal_id),environment).some(r=>resourceKey(r)===resourceKey(resource));}
      catch{return grant.effect==="DENY"&&Object.hasOwn(context.relationsFor(grant.subject_user_id),"current_authority");}
    });
}
export function evaluateAccess(context: AccessEvaluationContext, action: AccessAction, resource: AccessResource,
  environment: "paper"|"sandbox"|"live"): AccessDecision {
  const chainProof = (grant: ScopedAccessGrant) => {
    const proof: unknown[] = [], seen = new Set<string>();
    let node: ScopedAccessGrant | undefined = grant;
    while (node && !seen.has(node.grant_id) && seen.size < 16) {
      seen.add(node.grant_id);
      const relations=context.relationsFor(node.subject_user_id);
      if (Object.hasOwn(relations,"current_authority")) {
        const source=currentAccessRelations.safeParse(relations.current_authority);
        const selected=source.success?currentGrantProof(node,source.data,resource,environment,context.now_ms):null;
        const cut=source.success?source.data.resources.find(item=>item.environment===environment):null;
        const root=node.selector.kind==="ROOT_SCOPE"?cut?.roots.find(item=>item.root_id===(node!.selector as {root_id:string}).root_id):null;
        proof.push([node.grant_id,node.revision,node.revoked_at_ms,selected,
          node.selector.kind==="ROOT_SCOPE"?root:node.selector.kind==="EXPLICIT_RESOURCE_SET"?null:cut?.revision]);
      } else proof.push([node.grant_id,node.revision,node.revoked_at_ms,relations.revision]);
      node = node.parent_grant_id ? context.grants.find(item => item.grant_id === node!.parent_grant_id) : undefined;
    }
    return proof;
  };
  const decide = (allowed: boolean, reason: AccessRefusal|null, grants: readonly ScopedAccessGrant[] = []): AccessDecision => ({
    allowed, reason_code: reason, decision_id: accessDigest([context.principal_id,context.workspace_id,action,resource,environment,
      grants.map(grant => [grant.grant_id,grant.revision]),reason]), policy_revision: context.policy?.revision ?? null,
    scope_revision: accessDigest([context.principal_id,context.workspace_id,environment,
      Object.hasOwn(context.relationsFor(context.principal_id),"current_authority")?resource:context.relationsFor(context.principal_id).revision,
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

/** An internal receipt-selected ALLOW still needs the complete current graph.
 * Never discard other grants: a DENY needs its own ancestry to remain current,
 * and an unrelated ALLOW must not rescue this grant's denied delegation chain. */
export function currentGrantAllows(context:AccessEvaluationContext,action:AccessAction,resource:AccessResource,
  environment:"paper"|"sandbox"|"live",grantId:string):boolean {
  if(!evaluateAccess(context,action,resource,environment).allowed)return false;
  return matchingGrants(context,action,resource,environment)
    .some(grant=>grant.effect==="ALLOW"&&grant.grant_id===grantId);
}

/** Exact independent Alpha/Portfolio sharing, using the same canonical full
 * current graph as receipt-selected grants. Check all matching originals in
 * one selected-resource check (two canonical matching passes), not once per
 * candidate grant ID. No original grant or ancestor is removed from context.
 * Caller caches only within one mint and only for qualified publication IDs. */
export function currentExplicitReadAllows(context:AccessEvaluationContext,action:"alpha.read"|"portfolio.read",
  resource:AccessResource,environment:"paper"|"sandbox"|"live"):boolean {
  if(action!=="alpha.read"&&action!=="portfolio.read")return false;
  const kind=action==="alpha.read"?"ALPHA":"PORTFOLIO";
  if(resource.kind!==kind||!evaluateAccess(context,action,resource,environment).allowed)return false;
  return matchingGrants(context,action,resource,environment).some(grant=>grant.effect==="ALLOW"&&
    grant.selector.kind==="EXPLICIT_RESOURCE_SET"&&grant.selector.resource_kind===kind);
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
  if(!currentSourceMatchesPrincipal(context,change.subject_user_id))throw new AccessPolicyError("SOURCE_RELATION_NOT_QUALIFIED");
  const ceiling=context.grants.find(g => g.grant_id === change.ceiling_grant_id && g.subject_user_id === context.principal_id);
  if (!ceiling || ceiling.action !== "access.grant" || ceiling.effect !== "ALLOW" ||
    !ceiling.delegable_actions.includes(change.action) || !subset(change.delegable_actions,ceiling.delegable_actions) ||
    !subset(change.environments,ceiling.environments) || !intervalWithin(change,ceiling) ||
    !change.environments.every(environment=>selectorSubset(change.selector,context.relationsFor(change.subject_user_id),
      ceiling.selector,context.relationsFor(context.principal_id),environment)) ||
    !change.environments.every(environment=>resolvedResources(change.selector,context.relationsFor(change.subject_user_id),environment)
      .every(resource=>grantCurrent(ceiling,context,new Set(),{resource,environment}))))
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
  for (const environment of change.environments) for (const resource of
    resolvedResources(change.selector,context.relationsFor(change.subject_user_id),environment)) {
    const decision=evaluateAccess(context,"access.grant",resource,environment);
    if (!decision.allowed) throw new AccessPolicyError("DELEGATION_CEILING_EXCEEDED");
  }
  return ceiling;
}

/** PRIVATE app-layer whole-domain read. Native authority is deliberately NOT
 * fabricated from this selection; a genuine held native proof is still needed.
 * Roots only: no union of entity ceilings, delegated selectors or TS receipts. */
export function selectManagerDomainGrant(context:AccessEvaluationContext,domains:readonly ManagerDomainGrant[],
  environment:AccessEnvironment,domain:ManagerReadDomain) {
  if(!context.actor_current||!context.active_principals.has(context.principal_id))
    throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED");
  if(!policyReady(context)||context.policy!.qualification!=="OWNER_VERIFIED")
    throw new AccessPolicyError("POLICY_PENDING",503);
  const policy=context.policy!,same=(value:ManagerReadDomain)=>accessDigest(value)===accessDigest(domain);
  const current=(g:ManagerDomainGrant)=>g.workspace_id===context.workspace_id&&g.policy_revision===policy.revision&&
    g.subject_user_id===context.principal_id&&g.issued_by===policy.protected_owner_user_id&&g.parent_grant_id===null&&
    context.active_principals.has(g.issued_by)&&g.revoked_at_ms===null&&g.valid_from_ms<=context.now_ms&&g.valid_until_ms>context.now_ms&&
    g.environment===environment&&same(g.domain);
  const relevant=new Set<AccessAction>(["business.read_all","alpha.read","portfolio.read","portfolio.read_restricted",
    "portfolio.discover_linked","account.read","binding.read"]);
  // A resource DENY cannot be proved disjoint without the real entity source.
  // Never drop it or resolve an entity census while holding this Core TX.
  if(context.grants.some(g=>g.subject_user_id===context.principal_id&&g.workspace_id===context.workspace_id&&
    g.policy_revision===policy.revision&&g.effect==="DENY"&&relevant.has(g.action)&&g.environments.includes(environment)&&
    g.revoked_at_ms===null&&g.valid_from_ms<=context.now_ms&&(g.valid_until_ms===null||g.valid_until_ms>context.now_ms)&&
    context.active_principals.has(g.subject_user_id)&&context.active_principals.has(g.issued_by)))
    throw new AccessPolicyError("ACCESS_DENIED");
  const matches=domains.filter(current);
  if(matches.some(g=>g.effect==="DENY"))throw new AccessPolicyError("ACCESS_DENIED");
  const seals=policy.manager_read_domains??[];
  const allowed=matches.filter(g=>g.effect==="ALLOW").flatMap(grant=>{
    const seal=seals.find(s=>s.environment===environment&&same(s.domain)&&s.field_policy_ref===grant.field_policy_ref&&
      s.valid_from_ms<=context.now_ms&&s.valid_until_ms>context.now_ms&&grant.valid_from_ms>=s.valid_from_ms&&
      grant.valid_until_ms<=s.valid_until_ms);
    return seal?[{grant,seal}]:[];
  }).sort((a,b)=>a.grant.grant_id<b.grant.grant_id?-1:a.grant.grant_id>b.grant.grant_id?1:0);
  if(!allowed.length)throw new AccessPolicyError("ACCESS_DENIED");
  // One exact owner root supplies the permission; never union fragmented facts.
  return allowed[0]!;
}

/** PRIVATE temporal ceiling, not a permission evaluator. Only call after exact
 * root/seal selection with the complete schema-validated held Core snapshot.
 * Conservatively stop at ANY future fixed transition in that workspace: an
 * unrelated subject/action/environment may shorten availability, never grant
 * access. No source census/receipt verification or sliding now+TTL is inferred.
 * Non-null revocation still means revoked immediately in existing selection;
 * its timestamp here is only an additional conservative re-evaluation bound. */
export function managerDomainReadValidUntil(
  context:Pick<AccessEvaluationContext,"now_ms"|"workspace_id"|"policy"|"grants">,
  domains:readonly ManagerDomainGrant[],
  selected:{grant:ManagerDomainGrant;seal:ManagerDomainFieldSeal},sessionUntilMs:number):number {
  const now=context.now_ms,baseline=[sessionUntilMs,selected.grant.valid_until_ms,selected.seal.valid_until_ms];
  if(!Number.isSafeInteger(now)||now<0||baseline.some(value=>!Number.isSafeInteger(value)||value<=now))
    throw new AccessPolicyError("ACCESS_DENIED");
  let until=Math.min(...baseline);
  const transition=(value:number|null)=>{
    if(value!==null&&Number.isSafeInteger(value)&&value>now&&value<until)until=value;
  };
  // Do not filter by currentness, action, subject, environment or policy revision:
  // a currently inactive DENY/ancestor/receipt can change meaning with time.
  for(const grant of domains)if(grant.workspace_id===context.workspace_id) {
    transition(grant.valid_from_ms);transition(grant.valid_until_ms);transition(grant.revoked_at_ms);
  }
  for(const grant of context.grants)if(grant.workspace_id===context.workspace_id) {
    transition(grant.valid_from_ms);transition(grant.valid_until_ms);transition(grant.revoked_at_ms);
    if(grant.ts_receipt) {
      transition(grant.ts_receipt.effective_at_ms);transition(grant.ts_receipt.expires_at_ms);
    }
  }
  if(context.policy?.workspace_id===context.workspace_id)for(const seal of context.policy.manager_read_domains??[]) {
    transition(seal.valid_from_ms);transition(seal.valid_until_ms);
  }
  return until;
}
