import { accessDigest, AccessEvaluationContext, businessReadDenied, evaluateAccess, evaluateBusinessRead, grantCurrent, policyReady,
  environmentRelations, currentBoundaryProof } from "./access-policy";
import { AccessAction, AccessPolicyError, AccessResource, accessResource } from "./access.contract";
import { ExecutionReadPublication, ExecutionReadPublicationRequest, ReadDatasetBinding, readDatasetBinding, readPublication } from "./read-publication";
import { AUDIT_READ_FIELDS, BUSINESS_READ_FIELDS, TECHNICAL_READ_FIELDS, isBusinessReadField } from "./read-fields";
import type { ExecutionAccessService } from "./access.service";
import type { ControlApiConfig } from "../config";
import type { AuthSession, PortalUser } from "../domain";
import type { Pool } from "pg";
import { retainedReview } from "../execution/retained-read-profile";

export type ReadEnvironment="paper"|"sandbox"|"live";
export interface ReadScopePrincipal {user:PortalUser;session:AuthSession;workspaceId:string;viewerWorkspaceId?:string;}
export interface ReadScopeBinding {environment:ReadEnvironment;profileId:string;}
export interface ReadScopeRequirement {
  action:"business.read_all"|"alpha.read"|"portfolio.read"|"portfolio.read_restricted"|"portfolio.discover_linked"|"account.read"|"binding.read"|
    "maintenance.read"|"development.read"|"audit.read"|"report.export"|"stream.subscribe";
  resource?:AccessResource;
  dataset?:ReadDatasetBinding;
  requireWholePopulation?:boolean;
}
export type ReadScopeErrorCode="EXECUTION_READ_SCOPE_REQUIRED"|"EXECUTION_READ_ACCESS_CHANGED"|
  "EXECUTION_SCOPED_STREAM_NOT_COMMISSIONED"|
  "EXECUTION_READ_NOT_AVAILABLE"|"EXECUTION_READ_POLICY_PENDING"|"EXECUTION_READ_PUBLICATION_NOT_QUALIFIED"|
  "EXECUTION_READ_FIELD_POLICY_PENDING"|"EXECUTION_READ_SCOPE_LIMIT"|"EXECUTION_READ_AUTHORITY_UNAVAILABLE";
export class ExecutionReadScopeError extends Error {
  constructor(readonly code:ReadScopeErrorCode,readonly status=403){super("The requested Execution read is not available.");}
}
declare const scopeBrand:unique symbol;
/** In-process, server-minted capability. JSON/casts/cursors cannot reconstruct it. */
export interface AuthorizedExecutionReadScope {
  readonly [scopeBrand]:true;
  readonly mode:"LEGACY_COMPATIBILITY"|"SCOPED_V2";
  readonly fingerprint:string;
  readonly workspaceId:string;
  readonly viewerWorkspaceId:string;
  readonly environment:ReadEnvironment;
  readonly profileId:string;
  readonly policyRevision:string|null;
  readonly fieldPolicyRef:string|null;
  readonly wholePopulation:boolean;
}
type ScopeState={issuer:ExecutionReadScopes;principal:ReadScopePrincipal;binding:ReadScopeBinding;
  requirement:ReadScopeRequirement;tuples:ExecutionReadPublication["tuples"];resources:AccessResource[];
  population:ExecutionReadPublication["tuples"];fields:readonly string[];context:AccessEvaluationContext|null;
  strategyPairs:readonly {strategy_id:string;alpha_id:string}[];
  bindingPairs:readonly {binding_id:string;account_id:string}[];};
const minted=new WeakMap<object,ScopeState>();
const businessReads=new Set<AccessAction>(["business.read_all","alpha.read","portfolio.read","portfolio.read_restricted",
  "portfolio.discover_linked","account.read","binding.read"]);
const exactKey=(r:AccessResource)=>JSON.stringify([r.kind,r.id]);
/** One private retained technical input, not a public alias/grant/purpose
 * registry. Other technical datasets still need their own reviewed branch. */
const heartbeatTechnicalDataset=(dataset:ReadDatasetBinding):boolean=>
  dataset.dataset_id==="relation:manager.current.service-heartbeats:service_heartbeats"&&
  dataset.window===null&&typeof dataset.projection_generation==="string"&&
  dataset.catalogue_revision!==undefined;
const resourceAction=(r:AccessResource):ReadScopeRequirement["action"]=>({ROOT:"business.read_all",ALPHA:"alpha.read",
  ALPHA_VERSION:"alpha.read",DEPLOYMENT:"alpha.read",PORTFOLIO:"portfolio.read",ACCOUNT:"account.read",BINDING:"binding.read",USER:"business.read_all"} as const)[r.kind];
function fail(code:ReadScopeErrorCode,status=403):never {throw new ExecutionReadScopeError(code,status);}
/** One safe boundary for native Core/provider failures, including root lookup
 * before the main scope issuer. Never disclose adapter/SQL exception prose. */
function rethrowReadScopeError(error:unknown):never {
  if(error instanceof ExecutionReadScopeError)throw error;
  if(error instanceof AccessPolicyError){
    if(error.code==="ACCESS_RETRY_REQUIRED")fail("EXECUTION_READ_ACCESS_CHANGED",409);
    if(error.code==="CURRENT_ACTOR_AUTHORITY_REQUIRED"||error.code==="ACCESS_RESOURCE_NOT_FOUND")fail("EXECUTION_READ_NOT_AVAILABLE",404);
    if(error.code==="POLICY_PENDING")fail("EXECUTION_READ_POLICY_PENDING");
    if(error.code==="ACCESS_SCOPE_LIMIT_EXCEEDED")fail("EXECUTION_READ_SCOPE_LIMIT",503);
  }
  throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE",503);
}

export function assertExecutionReadScope(scope:AuthorizedExecutionReadScope):void {
  if(!scope||!minted.has(scope))fail("EXECUTION_READ_SCOPE_REQUIRED");
}
export function scopeResources(scope:AuthorizedExecutionReadScope):readonly AccessResource[] {
  assertExecutionReadScope(scope);return minted.get(scope)!.resources.map(r=>({...r}));
}
/** Server-only relation adapter input. Detached copies cannot alter authority. */
export function scopeReadPopulation(scope:AuthorizedExecutionReadScope) {
  assertExecutionReadScope(scope);
  const state=minted.get(scope)!;
  return {allowedTuples:structuredClone(state.tuples),populationTuples:structuredClone(state.population),
    binding:state.requirement.dataset?structuredClone(state.requirement.dataset):null,
    strategyPairs:structuredClone(state.strategyPairs),bindingPairs:structuredClone(state.bindingPairs)};
}
/** Correlated predicates for SQL adapters, not independent ID allowlists. */
export function scopeTuples(scope:AuthorizedExecutionReadScope) {
  assertExecutionReadScope(scope);
  if(scope.mode==="LEGACY_COMPATIBILITY")return null;
  const state=minted.get(scope)!;
  if(!state.requirement.dataset)fail("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",503);
  return {columns:["alpha_id","alpha_version_id","portfolio_id","deployment_id","account_id"] as const,
    allowedTuples:state.tuples.map(t=>[t.alpha_id,t.alpha_version_id,t.portfolio_id,t.deployment_id,t.account_id]),fingerprint:scope.fingerprint};
}
export function scopeAllowsField(scope:AuthorizedExecutionReadScope,field:string):boolean {
  assertExecutionReadScope(scope);
  return minted.get(scope)!.fields.includes(field);
}
/** Hidden values must not become a filter, sort, group or ranking oracle. */
export const scopeAllowsQueryField = scopeAllowsField;

/** Full economic accounting is independent of a researcher field whitelist.
 * Evaluate the unfiltered source census; seeing every currently visible row is
 * not proof that hidden peer allocations do not exist. Delivery still rechecks
 * the minted current authority after all asynchronous work. */
export function scopeAllowsFullAccountingPopulation(scope:AuthorizedExecutionReadScope,portfolioId?:string):boolean {
  assertExecutionReadScope(scope);const state=minted.get(scope)!;
  if(scope.mode!=="SCOPED_V2"||!state.context||!state.requirement.dataset||!businessReads.has(state.requirement.action))return false;
  const full=(resource:AccessResource)=>!businessReadDenied(state.context!,resource,scope.environment)&&
    evaluateBusinessRead(state.context!,"business.read_all",resource,scope.environment).allowed;
  const population=state.population.filter(t=>portfolioId===undefined||t.portfolio_id===portfolioId);
  if(!population.length)return portfolioId===undefined?scope.wholePopulation:
    state.resources.some(r=>r.kind==="PORTFOLIO"&&r.id===portfolioId)&&full({kind:"PORTFOLIO",id:portfolioId});
  const visible=new Set(state.tuples.map(t=>JSON.stringify(t)));
  return population.every(t=>visible.has(JSON.stringify(t))&&tupleLineage(t).every(full));
}

/** Stable *authorization* identity for a named replay query. Unlike the page
 * fingerprint it excludes a document's changing source revision. It retains
 * current visible tuples, fields, actor/session, policy, lineage and generation;
 * hidden source offsets/population counts are never returned to the browser. */
export function scopeRealtimeIdentity(scope:AuthorizedExecutionReadScope):string {
  assertExecutionReadScope(scope);const s=minted.get(scope)!;
  const dataset=s.requirement.dataset;
  return accessDigest({mode:scope.mode,actor:s.principal.user.userId,session:s.principal.session.sessionId,
    session_generation:s.principal.session.sessionVersion,workspace:scope.workspaceId,viewer:scope.viewerWorkspaceId,
    binding:s.binding,action:s.requirement.action,resource:s.requirement.resource??null,
    dataset:dataset&&{...dataset,source_revision:undefined},authority:s.context&&{
      db:s.context.authority_fingerprint,role:s.context.actor_role,policy:s.context.policy,
      grants:s.context.grants.map(g=>[g,Object.hasOwn(s.context!.relationsFor(g.subject_user_id),"current_authority")?
        s.resources.some(resource=>grantCurrent(g,s.context!,new Set(),{resource,environment:scope.environment})):grantCurrent(g,s.context!)]),active:[...s.context.active_principals].sort(),
      // Population is bound BELOW, after authorization. A hidden-only change
      // in a provider's root directory must not change this visible identity.
      relations:[...new Set(s.context.grants.flatMap(g=>[g.subject_user_id,g.issued_by]).concat(s.context.principal_id))].sort()
        .map(id=>{const r=s.context!.relationsFor(id);return Object.hasOwn(r,"current_authority")?
          [id,currentBoundaryProof(s.context!,scope.environment,[...s.resources,...(s.requirement.resource?[s.requirement.resource]:[])])]:
          [id,r.qualified,r.revision,r.membership];})},
    tuples:s.tuples,resources:s.resources,fields:s.fields,field_policy:scope.fieldPolicyRef,
    strategy:s.strategyPairs,bindings:s.bindingPairs});
}

const contextProof=(context:AccessEvaluationContext,environment?:ReadEnvironment,resources:readonly AccessResource[]=[])=>({
  db:context.authority_fingerprint??null,role:context.actor_role??null,policy:context.policy,
  grants:context.grants.map(g=>[g,environment&&Object.hasOwn(context.relationsFor(g.subject_user_id),"current_authority")?
    resources.some(resource=>grantCurrent(g,context,new Set(),{resource,environment})):grantCurrent(g,context)]),active:[...context.active_principals].sort(),
  relations:environment?currentBoundaryProof(context,environment,resources):[...new Set(context.grants.flatMap(g=>[g.subject_user_id,g.issued_by]).concat(context.principal_id))].sort()
    .map(id=>[id,context.relationsFor(id)]),
});
const tupleLineage=(t:ExecutionReadPublication["tuples"][number]):AccessResource[]=>[
  {kind:"ALPHA",id:t.alpha_id},{kind:"ALPHA_VERSION",id:t.alpha_version_id},{kind:"PORTFOLIO",id:t.portfolio_id},
  {kind:"DEPLOYMENT",id:t.deployment_id},{kind:"ACCOUNT",id:t.account_id},
];
const requestProofResources=(requirement:ReadScopeRequirement,publication:ExecutionReadPublication):AccessResource[]=>{
  const resource=requirement.resource;
  if(!resource||resource.kind==="ROOT")return publication.resources;
  const accounts=resource.kind==="BINDING"?new Set(publication.binding_lineage?.bindings
    .filter(pair=>pair.binding_id===resource.id).map(pair=>pair.account_id)):null;
  return [resource,...publication.tuples.filter(tuple=>accounts?accounts.has(tuple.account_id):
    tupleLineage(tuple).some(item=>exactKey(item)===exactKey(resource))).flatMap(tupleLineage)];
};

/** Sticky per-workspace policy selection. V2 denial/error never falls back to
 * legacy. This service alone can mint scopes; every delivery is freshly fenced. */
export class ExecutionReadScopes {
  constructor(private readonly pool:Pool,private readonly access:ExecutionAccessService,
    private readonly config:ControlApiConfig) {}

  /** Policy routing only, NOT a data capability. Callers must authorize a
   * concrete action/dataset before accessing V2 records. Sticky activation
   * prevents a deleted policy from silently selecting legacy compatibility. */
  async selectionMode(principal:ReadScopePrincipal):Promise<AuthorizedExecutionReadScope["mode"]> {
    const identity=await this.identity(principal);
    if(identity.role!==principal.user.role)fail("EXECUTION_READ_ACCESS_CHANGED",409);
    if(identity.policy!==null||identity.policy_seen)return "SCOPED_V2";
    const retained=retainedReview(this.config);
    if(retained?(principal.workspaceId!==this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID||
      !(identity.owner||identity.member||identity.retained.length>0)):!identity.member)fail("EXECUTION_READ_NOT_AVAILABLE",404);
    return "LEGACY_COMPATIBILITY";
  }

  /** Portal-owned governance/technical records live in their Core workspace,
   * not necessarily the retained source workspace. This is only a policy
   * router: it grants no resource, field, gate, command or source access. */
  async coreSelectionMode(principal:ReadScopePrincipal):Promise<AuthorizedExecutionReadScope["mode"]> {
    const identity=await this.identity(principal);
    if(identity.role!==principal.user.role)fail("EXECUTION_READ_ACCESS_CHANGED",409);
    if(!identity.member)fail("EXECUTION_READ_NOT_AVAILABLE",404);
    return identity.policy!==null||identity.policy_seen?"SCOPED_V2":"LEGACY_COMPATIBILITY";
  }

  /** Explicit technical authority, never derived from business.read_all. A
   * profile-wide diagnostic requires one unambiguous published authority root;
   * absence/ambiguity cannot be filled using a workspace or guessed root ID. */
  async authorizeTechnicalProfile(principal:ReadScopePrincipal,binding:ReadScopeBinding,
    action:"maintenance.read"|"development.read"="maintenance.read",
    dataset?:ReadDatasetBinding):Promise<AuthorizedExecutionReadScope> {
    try {
    // Snapshot before root-provider I/O; caller mutation cannot retarget the
    // internal publication capability or replace its Core actor/workspace.
    const p={user:{...principal.user},session:{...principal.session},workspaceId:principal.workspaceId,
      viewerWorkspaceId:principal.viewerWorkspaceId??principal.workspaceId};
    const b=structuredClone(binding),d=dataset===undefined?undefined:structuredClone(dataset);
    if(d!==undefined&&(action!=="maintenance.read"||!readDatasetBinding.safeParse(d).success||!heartbeatTechnicalDataset(d)))
      fail("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",503);
    const context=await this.access.readContext({user_id:p.user.userId,
      session_id:p.session.sessionId,session_generation:p.session.sessionVersion},p.workspaceId);
    const roots=Object.keys(environmentRelations(context.relationsFor(p.user.userId),b.environment).roots);
    if(roots.length!==1)fail("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",503);
    const scope=await this.authorize(p,b,{action,resource:{kind:"ROOT",id:roots[0]},...(d?{dataset:d}:{})});
    const currentContext=minted.get(scope)!.context;
    const current=currentContext?Object.keys(environmentRelations(currentContext.relationsFor(p.user.userId),b.environment).roots):[];
    if(scope.mode!=="SCOPED_V2"||current.length!==1||current[0]!==roots[0])fail("EXECUTION_READ_ACCESS_CHANGED",409);
    return scope;
    }catch(error){return rethrowReadScopeError(error);}
  }

  /** Existing unscoped transports are compatibility-only. A policy activation
   * during a legacy stream terminates it; a V2 grant cannot commission a raw
   * profile/global event feed. No publication or upstream I/O is needed. */
  async assertLegacyStream(principal:ReadScopePrincipal):Promise<void> {
    const identity=await this.identity(principal);
    if(identity.role!==principal.user.role)fail("EXECUTION_READ_ACCESS_CHANGED",409);
    if(identity.policy!==null||identity.policy_seen)fail("EXECUTION_SCOPED_STREAM_NOT_COMMISSIONED",503);
    if(!identity.member)fail("EXECUTION_READ_NOT_AVAILABLE",404);
  }

  async authorize(principal:ReadScopePrincipal,binding:ReadScopeBinding,requirement:ReadScopeRequirement):Promise<AuthorizedExecutionReadScope> {
    // Snapshot trusted arguments before any await; request mutation cannot widen a flight.
    const p={user:{...principal.user},session:{...principal.session},workspaceId:principal.workspaceId,
      viewerWorkspaceId:principal.viewerWorkspaceId??principal.workspaceId};
    const b=structuredClone(binding),r=structuredClone(requirement);
    if(!p.workspaceId||!p.viewerWorkspaceId||!p.user.userId||!p.session.sessionId||
      p.session.userId!==p.user.userId||p.session.sessionVersion!==p.user.sessionVersion||
      !["paper","sandbox","live"].includes(b.environment)||!b.profileId)fail("EXECUTION_READ_SCOPE_REQUIRED");
    if(!businessReads.has(r.action)&&!["maintenance.read","development.read","audit.read","report.export","stream.subscribe"].includes(r.action))
      fail("EXECUTION_READ_SCOPE_REQUIRED");
    if(r.resource&&!accessResource.safeParse(r.resource).success||r.dataset&&!readDatasetBinding.safeParse(r.dataset).success)
      fail("EXECUTION_READ_SCOPE_REQUIRED");
    if(!businessReads.has(r.action)&&!r.resource)fail("EXECUTION_READ_NOT_AVAILABLE",404);
    // Do not let a generic technical dataset enter the business/researcher
    // fallback below. The finite private heartbeat branch is maintenance-only.
    if(r.dataset&&(r.action==="maintenance.read"||r.action==="development.read")&&
      (r.action!=="maintenance.read"||r.resource?.kind!=="ROOT"||!heartbeatTechnicalDataset(r.dataset)))
      fail("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",503);
    // A resource check alone cannot prove a complete dataset population.
    if(r.requireWholePopulation&&!r.dataset)fail("EXECUTION_READ_NOT_AVAILABLE",404);
    try{return await this.mint(p,b,r);}catch(error){return rethrowReadScopeError(error);}
  }

  private async identity(principal:ReadScopePrincipal) {
    const result=await this.pool.query(`SELECT u.role,u.session_version,
      p.policy,p.revision AS policy_revision,
      (EXISTS(SELECT 1 FROM portal_access_policy_events e WHERE e.workspace_id=$4)
        OR EXISTS(SELECT 1 FROM portal_access_grants_v2 g WHERE g.workspace_id=$4)) AS policy_seen,
      EXISTS(SELECT 1 FROM workspaces w WHERE w.workspace_id=$4) AS workspace_exists,
      EXISTS(SELECT 1 FROM workspace_members m WHERE m.workspace_id=$4 AND m.user_id=u.user_id) AS member,
      EXISTS(SELECT 1 FROM portal_owner_anchor a WHERE a.anchor_id='PORTAL_OWNER' AND a.user_id=u.user_id) AS owner,
      COALESCE((SELECT jsonb_agg(jsonb_build_array(g.user_id,g.expires_at) ORDER BY g.expires_at)
        FROM execution_retained_review_access g WHERE g.workspace_id=$4 AND g.user_id=u.user_id
          AND g.revoked_at IS NULL AND g.expires_at>clock_timestamp()),'[]'::jsonb) AS retained
      FROM portal_users u JOIN auth_sessions s ON s.user_id=u.user_id
      LEFT JOIN portal_access_policy_state p ON p.workspace_id=$4
      WHERE u.user_id=$1 AND u.status='ACTIVE' AND NOT u.must_change_password AND u.archived_at IS NULL
        AND u.session_version=$2 AND s.session_id=$3 AND s.session_version=u.session_version
        AND s.state='ACTIVE' AND s.idle_expires_at>clock_timestamp() AND s.absolute_expires_at>clock_timestamp()`,
      [principal.user.userId,principal.session.sessionVersion,principal.session.sessionId,principal.workspaceId]);
    const row=result.rows[0];
    if(!row||!row.workspace_exists)fail("EXECUTION_READ_NOT_AVAILABLE",404);
    return row as {role:string;session_version:number;policy:unknown|null;policy_revision:string|null;policy_seen:boolean;
      workspace_exists:boolean;member:boolean;owner:boolean;retained:unknown[]};
  }

  private async mint(p:ReadScopePrincipal,b:ReadScopeBinding,r:ReadScopeRequirement):Promise<AuthorizedExecutionReadScope> {
    const identity=await this.identity(p);
    if(identity.role!==p.user.role)fail("EXECUTION_READ_ACCESS_CHANGED",409);
    let context:AccessEvaluationContext|null=null,publication:ExecutionReadPublication|null=null;
    let bindingPairs:{binding_id:string;account_id:string}[]=[];
    let resources:AccessResource[]=[],tuples:ExecutionReadPublication["tuples"]=[],fields:readonly string[]=[...BUSINESS_READ_FIELDS],whole=true;
    let mode:AuthorizedExecutionReadScope["mode"]="LEGACY_COMPATIBILITY",policyRevision:string|null=null,fieldPolicyRef:string|null=null;
    if(identity.policy!==null||identity.policy_seen){
      mode="SCOPED_V2";
      context=await this.access.readContext({user_id:p.user.userId,session_id:p.session.sessionId,
        session_generation:p.session.sessionVersion},p.workspaceId);
      if(!policyReady(context))fail("EXECUTION_READ_POLICY_PENDING");
      if(context.actor_role!==p.user.role)fail("EXECUTION_READ_ACCESS_CHANGED",409);
      policyRevision=context.policy!.revision;
      const decisionCache=new Map<string,boolean>();
      const allowed=(action:ReadScopeRequirement["action"],resource:AccessResource)=>{
        const key=JSON.stringify([action,resource.kind,resource.id]);
        const cached=decisionCache.get(key);if(cached!==undefined)return cached;
        const result=businessReads.has(action)?
          evaluateBusinessRead(context!,action as Parameters<typeof evaluateBusinessRead>[1],resource,b.environment).allowed:
          evaluateAccess(context!,action,resource,b.environment).allowed;
        decisionCache.set(key,result);return result;
      };
      if(r.resource&&!allowed(r.action,r.resource))fail("EXECUTION_READ_NOT_AVAILABLE",404);
      if(r.resource&&businessReads.has(r.action)&&businessReadDenied(context,r.resource,b.environment))
        fail("EXECUTION_READ_NOT_AVAILABLE",404);
      if(r.dataset){
        const request:ExecutionReadPublicationRequest={workspace_id:p.workspaceId,environment:b.environment,profile_id:b.profileId,binding:r.dataset};
        const parsed=readPublication.safeParse(await this.access.readPublication(request));
        if(!parsed.success)fail("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",503);
        publication=parsed.data;
        // The publication await is itself part of the flight, including the
        // FINAL delivery fence. A context captured before it is insufficient.
        const actor={user_id:p.user.userId,session_id:p.session.sessionId,session_generation:p.session.sessionVersion};
        const fresh=await this.access.readContext({user_id:p.user.userId,session_id:p.session.sessionId,
          session_generation:p.session.sessionVersion},p.workspaceId);
        const proofResources=requestProofResources(r,publication);
        if(accessDigest(contextProof(fresh,b.environment,proofResources))!==accessDigest(contextProof(context,b.environment,proofResources)))
          fail("EXECUTION_READ_ACCESS_CHANGED",409);
        // A linkage-only change during fresh.readContext's final relations
        // await does not change the DB policy fingerprint. Confirm publication
        // AFTER those awaits, then DB-only authority after the last adapter I/O.
        const confirmedPublication=readPublication.safeParse(await this.access.readPublication(request));
        if(!confirmedPublication.success||accessDigest(confirmedPublication.data)!==accessDigest(publication))
          fail("EXECUTION_READ_ACCESS_CHANGED",409);
        context=await this.access.confirmReadContext(actor,p.workspaceId,fresh);
        if(accessDigest(contextProof(context,b.environment,proofResources))!==accessDigest(contextProof(fresh,b.environment,proofResources)))
          fail("EXECUTION_READ_ACCESS_CHANGED",409);
        if(publication.qualification!=="SOURCE_VERIFIED"&&!(context.allow_test_only&&publication.qualification==="TEST_ONLY")||
          publication.workspace_id!==p.workspaceId||publication.environment!==b.environment||publication.profile_id!==b.profileId||
          accessDigest(publication.binding)!==accessDigest(r.dataset)||publication.population_coverage!=="COMPLETE_FOR_DATASET_WINDOW")
          fail("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",503);
        const keys=new Set(publication.resources.map(exactKey));
        if(keys.size!==publication.resources.length)fail("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",503);
        const tupleKeys=new Set<string>();
        for(const t of publication.tuples){
          const tupleKey=accessDigest(t);
          const lineage=tupleLineage(t);
          if(tupleKeys.has(tupleKey)||lineage.some(x=>!keys.has(exactKey(x))))fail("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",503);
          tupleKeys.add(tupleKey);
        }
        if(r.action==="maintenance.read"&&r.resource?.kind==="ROOT"&&heartbeatTechnicalDataset(r.dataset)){
          // Reuse the common exact publication/current-context/double-read
          // fences above, not business ALL or researcher discovery below.
          // ROOT is the technical collection; it supplies no economic census.
          if(publication.resources.length!==1||exactKey(publication.resources[0])!==exactKey(r.resource)||
            publication.tuples.length!==0||publication.current_linkage!==null||
            publication.binding_lineage!=null||publication.strategy_lineage!=null)
            fail("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",503);
          if(r.requireWholePopulation)fail("EXECUTION_READ_NOT_AVAILABLE",404);
          resources=[{...r.resource}];tuples=[];whole=false;
        }else{
        if(publication.strategy_lineage?.pairs.some(pair=>
          !keys.has(exactKey({kind:"ALPHA",id:pair.alpha_id}))||!publication!.tuples.some(t=>t.alpha_id===pair.alpha_id)))
          fail("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",503);
        const bindingLineage=publication.binding_lineage;
        const bindingQualified=Boolean(bindingLineage&&(bindingLineage.qualification==="SOURCE_VERIFIED"||
          context.allow_test_only&&bindingLineage.qualification==="TEST_ONLY"));
        if(bindingLineage){
          for(const pair of bindingLineage.bindings){
            if(!keys.has(exactKey({kind:"BINDING",id:pair.binding_id}))||
              !keys.has(exactKey({kind:"ACCOUNT",id:pair.account_id})))
              fail("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",503);
          }
          if((bindingLineage.empty_binding_ids??[]).some(id=>!keys.has(exactKey({kind:"BINDING",id}))))
            fail("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",503);
        }
        const permittedBindings=bindingQualified?publication.resources.filter(x=>x.kind==="BINDING"&&
          (!r.resource||r.resource.kind==="BINDING"&&r.resource.id===x.id)&&
          allowed("binding.read",x)&&!businessReadDenied(context!,x,b.environment)):[];
        const permittedBindingIds=new Set(permittedBindings.map(x=>x.id));
        bindingPairs=bindingQualified?bindingLineage!.bindings.filter(pair=>permittedBindingIds.has(pair.binding_id)):[];
        const bindingAccounts=new Set(bindingPairs.map(pair=>pair.account_id));
        if(r.action==="binding.read"&&(r.resource&&r.resource.kind!=="BINDING"||!bindingQualified))
          fail("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",503);
        if(r.action==="binding.read"&&permittedBindings.some(x=>
          !bindingPairs.some(pair=>pair.binding_id===x.id)&&!bindingLineage!.empty_binding_ids?.includes(x.id)))
          fail("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",503);
        // Non-vacuous complete-population proof is distinct from an authorized empty page.
        const explicitCollection=Boolean(r.resource&&allowed(r.action,r.resource))||
          r.action==="binding.read"&&permittedBindings.length>0;
        if(publication.resources.length===0&&!explicitCollection)fail("EXECUTION_READ_NOT_AVAILABLE",404);
        const denialCache=new Map<string,boolean>();
        const notDenied=(resource:AccessResource)=>{
          const key=exactKey(resource),cached=denialCache.get(key);if(cached!==undefined)return cached;
          const result=!businessReadDenied(context!,resource,b.environment);denialCache.set(key,result);return result;
        };
        whole=publication.resources.length>0?publication.resources.every(x=>notDenied(x)&&allowed("business.read_all",x)):
          Boolean(r.resource&&notDenied(r.resource)&&allowed("business.read_all",r.resource));
        if(r.requireWholePopulation&&!whole)fail("EXECUTION_READ_NOT_AVAILABLE",404);
        resources=publication.resources.filter(x=>allowed(resourceAction(x),x));
        const purposeAllows=(t:ExecutionReadPublication["tuples"][number])=>{
          if(tupleLineage(t).some(x=>!notDenied(x)))return false;
          if(r.action==="binding.read")return bindingAccounts.has(t.account_id);
          if(r.resource&&r.resource.kind!=="ROOT"&&!(r.resource.kind==="BINDING"?
            bindingQualified&&bindingAccounts.has(t.account_id):tupleLineage(t).some(x=>exactKey(x)===exactKey(r.resource!))))return false;
          const resource=r.action==="alpha.read"?{kind:"ALPHA" as const,id:t.alpha_id}:
            r.action.startsWith("portfolio.")?{kind:"PORTFOLIO" as const,id:t.portfolio_id}:
            r.action==="account.read"?{kind:"ACCOUNT" as const,id:t.account_id}:r.resource;
          return r.action==="business.read_all"?tupleLineage(t).every(x=>allowed("business.read_all",x)):
            Boolean(resource&&allowed(r.action,resource));
        };
        if(whole)tuples=publication.tuples.filter(purposeAllows);
        else{
          const policy=context.policy!.researcher_fields;
          // A narrower DENY must not suppress other genuinely full-business
          // tuples, nor force a manager into a fictional researcher ownership.
          const fullTuples=publication.tuples.filter(t=>tupleLineage(t).every(x=>notDenied(x)&&allowed("business.read_all",x))&&purposeAllows(t));
          // An explicit binding grant is its own authority. Resolve it through
          // qualified exact account lineage, not researcher ownership or ID sets.
          const bindingTuples=r.action==="binding.read"?
            publication.tuples.filter(purposeAllows):[];
          // Exact account authority is independent of researcher ownership or
          // Portfolio membership. purposeAllows still requires current accepted
          // account.read and honors DENY on every correlated lineage component.
          // An unbound/account-only population is NOT invented here.
          const accountTuples=r.action==="account.read"?
            publication.tuples.filter(purposeAllows):[];
          const currentRelations=environmentRelations(context.relationsFor(p.user.userId),b.environment);
          const own=new Set(currentRelations.own_alpha_ids);
          const linked=new Set(currentRelations.member_portfolio_ids);
          const linkage=publication.current_linkage;
          const linkQualified=linkage&&(linkage.qualification==="SOURCE_VERIFIED"||context.allow_test_only&&linkage.qualification==="TEST_ONLY");
          if(!linkQualified&&!fullTuples.length&&!bindingTuples.length&&!accountTuples.length)fail("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",503);
          const currentPairs=new Set(linkQualified?linkage.pairs.map(pair=>JSON.stringify([pair.alpha_id,pair.portfolio_id])):[]);
          const linkedTuples=publication.tuples.filter(t=>context!.relationsFor(p.user.userId).qualified&&own.has(t.alpha_id)&&linked.has(t.portfolio_id)&&
            currentPairs.has(JSON.stringify([t.alpha_id,t.portfolio_id]))&&purposeAllows(t)&&
            allowed("alpha.read",{kind:"ALPHA",id:t.alpha_id})&&
            (allowed("portfolio.read_restricted",{kind:"PORTFOLIO",id:t.portfolio_id})||allowed("portfolio.read",{kind:"PORTFOLIO",id:t.portfolio_id})));
          if(!fullTuples.length||[...linkedTuples,...bindingTuples,...accountTuples].some(t=>!fullTuples.includes(t))){
            if(policy.state!=="QUALIFIED"||!policy.policy_ref)fail("EXECUTION_READ_FIELD_POLICY_PENDING",503);
            fields=policy.fields.filter(isBusinessReadField);fieldPolicyRef=policy.policy_ref;
            if(!fields.length)fail("EXECUTION_READ_FIELD_POLICY_PENDING",503);
          }
          tuples=[...new Set([...fullTuples,...linkedTuples,...bindingTuples,...accountTuples])];
          // No matching row does not itself prove an authorized collection.
          if(!tuples.length&&!explicitCollection)fail("EXECUTION_READ_NOT_AVAILABLE",404);
          const visibleKeys=new Set(tuples.flatMap(tupleLineage).map(exactKey));
          // Restricted/discovery authority permits the proven portfolio shell,
          // not portfolio.read or access to any hidden peer resource.
          resources=publication.resources.filter(x=>notDenied(x)&&visibleKeys.has(exactKey(x))&&
            (allowed(resourceAction(x),x)||x.kind==="PORTFOLIO"&&
              (allowed("portfolio.read_restricted",x)||allowed("portfolio.discover_linked",x))));
          if(r.action==="binding.read")resources.push(...permittedBindings);
        }
        if(r.action==="binding.read"&&!tuples.length&&!explicitCollection)fail("EXECUTION_READ_NOT_AVAILABLE",404);
        if(r.action==="binding.read"){
          const visibleKeys=new Set(tuples.flatMap(tupleLineage).map(exactKey));
          resources=resources.filter(x=>x.kind==="BINDING"?permittedBindingIds.has(x.id):visibleKeys.has(exactKey(x)));
          bindingPairs=bindingPairs.filter(pair=>tuples.some(t=>t.account_id===pair.account_id));
        }
        if(r.resource&&r.resource.kind!=="ROOT"){
          const visibleKeys=new Set(tuples.flatMap(tupleLineage).map(exactKey));
          // A manager's broad authority does not turn a detail-purpose scope
          // into a catalogue of peer resources. Include only its exact shell.
          resources=resources.filter(x=>visibleKeys.has(exactKey(x))||exactKey(x)===exactKey(r.resource!));
        }
        if(r.resource&&(r.action==="portfolio.discover_linked"||r.action==="portfolio.read_restricted")&&
          !tuples.some(t=>t.portfolio_id===r.resource!.id))fail("EXECUTION_READ_NOT_AVAILABLE",404);
        }
      }else{
        if(!r.resource)fail("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",503);
        resources=[r.resource];whole=false;
        if(r.action==="portfolio.discover_linked"||r.action==="portfolio.read_restricted"){
          // Flat current ID lists do not prove a correlated own-alpha link to
          // this portfolio. Detail uses the same qualified dataset proof.
          fail("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",503);
        }
        if(businessReads.has(r.action)&&!allowed("business.read_all",r.resource)){
          const policy=context.policy!.researcher_fields;
          if(policy.state!=="QUALIFIED"||!policy.policy_ref)fail("EXECUTION_READ_FIELD_POLICY_PENDING",503);
          fields=policy.fields.filter(isBusinessReadField);fieldPolicyRef=policy.policy_ref;
          if(!fields.length)fail("EXECUTION_READ_FIELD_POLICY_PENDING",503);
        }
      }
      if(!businessReads.has(r.action))fields=r.action==="maintenance.read"||r.action==="development.read"?
        [...TECHNICAL_READ_FIELDS]:r.action==="audit.read"?[...AUDIT_READ_FIELDS]:fields;
    }else{
      // Legacy membership preserves the named business-read contract only.
      // It is never a new export/stream/technical entitlement.
      if(!businessReads.has(r.action))fail("EXECUTION_READ_NOT_AVAILABLE",404);
      const retained=retainedReview(this.config);
      if(retained?(p.workspaceId!==this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID||
        !(identity.owner||identity.member||identity.retained.length>0)):!identity.member)fail("EXECUTION_READ_NOT_AVAILABLE",404);
    }
    const authority=context?contextProof(context,b.environment,[...resources,...(r.resource?[r.resource]:[])]):identity;
    const fingerprint=accessDigest({mode,actor:p.user.userId,session:p.session.sessionId,generation:p.session.sessionVersion,
      workspace:p.workspaceId,viewer:p.viewerWorkspaceId,binding:b,requirement:r,authority,
      publication:publication&&{revision:publication.publication_revision,binding:publication.binding,resources:publication.resources,
        tuples:publication.tuples,current_linkage:publication.current_linkage,binding_lineage:publication.binding_lineage??null,
        strategy_lineage:publication.strategy_lineage??null},
      fields,resources,tuples});
    const scope=Object.freeze({mode,fingerprint,workspaceId:p.workspaceId,viewerWorkspaceId:p.viewerWorkspaceId!,
      environment:b.environment,profileId:b.profileId,policyRevision,fieldPolicyRef,wholePopulation:whole}) as AuthorizedExecutionReadScope;
    minted.set(scope,{issuer:this,principal:p,binding:b,requirement:r,resources,tuples,
      population:publication?.tuples??[],fields,context,bindingPairs,
      strategyPairs:publication?.strategy_lineage&&(publication.strategy_lineage.qualification==="SOURCE_VERIFIED"||
        context?.allow_test_only&&publication.strategy_lineage.qualification==="TEST_ONLY")?publication.strategy_lineage.pairs:[]});
    return scope;
  }

  async revalidate(scope:AuthorizedExecutionReadScope):Promise<void> {
    assertExecutionReadScope(scope);
    const state=minted.get(scope)!;
    if(state.issuer!==this)fail("EXECUTION_READ_SCOPE_REQUIRED");
    const current=await this.authorize(state.principal,state.binding,state.requirement);
    if(current.fingerprint!==scope.fingerprint)fail("EXECUTION_READ_ACCESS_CHANGED",409);
  }

  async deliver<T>(scope:AuthorizedExecutionReadScope,read:()=>Promise<T>):Promise<T> {
    assertExecutionReadScope(scope);
    if(minted.get(scope)!.issuer!==this)fail("EXECUTION_READ_SCOPE_REQUIRED");
    // Fences cover cache HIT, follower and miss equally; no cached entitlement.
    await this.revalidate(scope);
    const result=await read();
    await this.revalidate(scope);
    return result;
  }

  /** Notice-only V2 bridge; no route/adapter is commissioned by calling this.
   * Requires BOTH the minted business read scope and exact stream capability. */
  async deliverRealtime<T>(scope:AuthorizedExecutionReadScope,resource:AccessResource,write:()=>T):Promise<T> {
    assertExecutionReadScope(scope);const state=minted.get(scope)!;
    if(state.issuer!==this||scope.mode!=="SCOPED_V2"||!businessReads.has(state.requirement.action)||!state.requirement.dataset)
      fail("EXECUTION_SCOPED_STREAM_NOT_COMMISSIONED",503);
    if(!state.resources.some(r=>exactKey(r)===exactKey(resource))&&
      (!state.requirement.resource||exactKey(state.requirement.resource)!==exactKey(resource)))
      fail("EXECUTION_READ_NOT_AVAILABLE",404);
    const current=await this.authorize(state.principal,state.binding,state.requirement);
    if(current.fingerprint!==scope.fingerprint)fail("EXECUTION_READ_ACCESS_CHANGED",409);
    const fresh=minted.get(current)!;
    if(!fresh.context)fail("EXECUTION_SCOPED_STREAM_NOT_COMMISSIONED",503);
    return this.access.realtimeDeliveryBoundary({user_id:state.principal.user.userId,
      session_id:state.principal.session.sessionId,session_generation:state.principal.session.sessionVersion},
      scope.workspaceId,fresh.context,resource,scope.environment,write);
  }
}
