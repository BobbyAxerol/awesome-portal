import { Pool, PoolClient } from "pg";
import type {ServerResponse} from "node:http";
import { AuthService } from "../auth/auth.service";
import { hintUserAuthorityChanged } from "../auth/stream-revocation-hints";
import { withTransaction } from "../db/pool";
import { randomId } from "../domain";
import { UsersRepository } from "../repos/users";
import { SessionsRepository } from "../repos/sessions";
import { ACCESS_STEP_UP_PROOFS, AccountLifecycleRepository, COMMAND_STEP_UP_PROOFS } from "../repos/account-lifecycle";
import { CredentialsRepository } from "../repos/credentials";
import { AuditRepository } from "../repos/audit";
import { AccessAction, AccessResource, AccessActor, AccessPolicyError, AccessRefusal, GrantChange, ReviewedAccessPolicy, ScopedAccessGrant,
  TsMembershipAcceptance, tsBusinessAction, reviewedAccessPolicy, scopedAccessGrant, tsMembershipAcceptance, managerDomainGrant } from "./access.contract";
import { AccessEvaluationContext, AccessRelations, accessDigest, canonicalChange, canonicalSelector,
  evaluateAccess, grantCurrent, policyReady, resolvedResources, validateDelegation } from "./access-policy";
import { AccessEvent, AccessReceipt, AccessRepository } from "./access.repository";
import { AccessTrustProvider, type ReviewedPolicyArtifact, unqualifiedAccessTrust } from "./access-trust";
import { KeysetCursorCodec } from "../query/cursor";
import { querySigningKeys } from "../config";
import type { ExecutionReadPublicationRequest } from "./read-publication";
import { acceptRootMembershipReceipt } from "./access-root-receipt";
import { coordinateDelegatedMembershipReceipt, type DelegatedReceiptSource } from "./access-delegated-receipt";
import { captureCurrentHumanSnapshot } from "./current-human-snapshot";
import { CurrentHumanLeaseError } from "./current-human-candidate";
import { CurrentHumanMutations, type CurrentHumanMutationBinding, type CurrentHumanMutationHooks } from "./current-human-mutations";
import { currentAcceptanceMatches, currentAccessRelations } from "./access-current-relations";
import { reviewedParentAuditRoot } from "./parent-read-fields";
import { eligibilityBatchInput, projectEligibilityBatch, eligibilityInput, navigationInput, projectEligibility, projectNavigation,
  selfProjectionPrincipalIds, stepUpPreconditionMet, NAVIGATION_ACTIONS, type RowAction, type SelfEligibilityContext } from "./self-eligibility";
import { CAPITAL_STEP_UP_ACTIONS, stepUpProofsFor, type StepUpFamily } from "./step-up-family";
import { projectSelfContext } from "./self-context";
import { captureSelfContextFacts } from "./self-context.store";
import { ManagerRevokeError, MANAGER_REVOKE_EVENT_SOURCE, MANAGER_REVOKE_RECEIPT_SCHEMA, managerRevokeIntentKey,
  managerRevokeItemKey, managerRevokeRequestDigest, planManagerRevoke, verifiedManagerRevoke,
  type ManagerRevokeDocument, type ManagerRevokeReceipt } from "./manager-domain-revoke";
import { MANAGER_SUCCESSOR_SCHEMA, ManagerSuccessorError, verifiedManagerSuccessor,
  managerSuccessorKey, managerSuccessorDigest, planManagerSuccessor, assertSuccessorWindow,
  type ManagerSuccessorDocument, type ManagerSuccessorPin } from "./manager-domain-successor";
import type {NativeCurrentRelationsPurpose} from "./native-current-relations-port";

type Tx={db:PoolClient;repo:AccessRepository;context:AccessEvaluationContext;recheck:(check:()=>void)=>void};
type OperationResult={receipt:AccessReceipt;replayed:boolean};
type AuthorityMutation<T>={binding:CurrentHumanMutationBinding;authorize:(tx:Tx)=>Promise<void>;
  terminal:CurrentHumanMutationHooks<T>["terminal"]};

// A prototype can be forged with Object.create and TypeScript-private pool
// properties are mutable at runtime. Keep the constructor-selected pool in a
// module-private brand so private compositions can reject either substitution.
const accessServicePools=new WeakMap<ExecutionAccessService,Pool>();

/** One application-policy boundary. Default trust is unqualified and seeds no production rights. */
export class ExecutionAccessService {
  constructor(private readonly pool:Pool,private readonly auth:AuthService,
    private readonly trust:AccessTrustProvider=unqualifiedAccessTrust,
    private readonly allowTestOnly=false,private readonly authorityMutations?:CurrentHumanMutations) {
    if(authorityMutations&&!authorityMutations.usesPool(pool)||trust.currentRelations&&!trust.currentRelations.usesPool(pool))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_MUTATION_CONFIG_INVALID");
    accessServicePools.set(this,pool);
  }

  usesPool(pool:Pool):boolean{return accessServicePools.has(this)&&accessServicePools.get(this)===pool&&this.pool===pool;}
  hasNativeCurrentRelations():boolean{return this.trust.currentRelations!==undefined;}

  /** Purpose-specific finite boundary. The caller is the actual scoped read
   * issuer, not request JSON. Ordinary DTO return/ROOT/STREAM/command paths
   * cannot borrow this physical READ terminal. */
  async deliverNativeCurrent(actor:AccessActor,workspace:string,action:AccessAction,resources:readonly AccessResource[],
    response:ServerResponse,build:(context:AccessEvaluationContext)=>Promise<Buffer>,assertAllowed:(context:AccessEvaluationContext)=>void,
    validation?:{afterEnter?:()=>Promise<void>;beforeDispatch?:()=>void}):Promise<void>{
    if(!this.trust.currentRelations)throw new AccessPolicyError("SOURCE_RELATION_NOT_QUALIFIED",503);
    // The application boundary owns this private constructor flag, just as it
    // does for readContext. Never inherit it from a source/provider context or
    // request. Production always forces false; disposable TEST_ONLY callers
    // must not change policy semantics between authorize and physical send.
    const applicationContext=(context:AccessEvaluationContext):AccessEvaluationContext=>
      ({...context,allow_test_only:this.allowTestOnly});
    return this.trust.currentRelations.sendFinite({actor,workspace_id:workspace,action,resources,response,
      build:context=>build(applicationContext(context)),assertAllowed:context=>assertAllowed(applicationContext(context)),
      ...(validation?.afterEnter?{afterEnter:validation.afterEnter}:{}),...(validation?.beforeDispatch?{beforeDispatch:validation.beforeDispatch}:{})});
  }

  /** All purposes retain their own source cut through one physical send. The
   * optional private port is not emulated by several independent responses. */
  async deliverNativeCurrentComposition(actor:AccessActor,workspace:string,purposes:readonly NativeCurrentRelationsPurpose[],
    scopeDigest:string,response:ServerResponse,build:(contexts:readonly AccessEvaluationContext[])=>Promise<Buffer>,
    assertAllowed:(contexts:readonly AccessEvaluationContext[])=>void,
    validation?:{afterEnter?:()=>Promise<void>;beforeDispatch?:()=>void}):Promise<void>{
    const provider=this.trust.currentRelations;
    if(!provider?.sendFiniteComposition)throw new AccessPolicyError("SOURCE_RELATION_NOT_QUALIFIED",503);
    const applicationContexts=(contexts:readonly AccessEvaluationContext[])=>
      contexts.map(context=>({...context,allow_test_only:this.allowTestOnly}));
    return provider.sendFiniteComposition({actor,workspace_id:workspace,purposes,scope_digest:scopeDigest,response,
      build:contexts=>build(applicationContexts(contexts)),assertAllowed:contexts=>assertAllowed(applicationContexts(contexts)),
      ...(validation?.afterEnter?{afterEnter:validation.afterEnter}:{}),...(validation?.beforeDispatch?{beforeDispatch:validation.beforeDispatch}:{})});
  }

  /** Short consistent capture; no adapter I/O or mutation locks. */
  private async captureReadContext(actor:AccessActor,workspace:string) {
    return withTransaction(this.pool,async db=>{
      await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      await db.query("SET LOCAL statement_timeout='5000ms'");
      return captureCurrentHumanSnapshot(db,actor,workspace);
    });
  }

  /** Self-projection routing metadata only. Keep this auxiliary identity OUT
   * of the shared/historical authority fingerprint and generic read methods.
   * The sticky workspace mode matches ExecutionReadScopes.coreSelectionMode.
   * Both queries use one short RR snapshot; no connection crosses source I/O. */
  private async captureSelfProjectionContext(actor:AccessActor,workspace:string) {
    return withTransaction(this.pool,async db=>{
      await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      await db.query("SET LOCAL statement_timeout='5000ms'");
      const captured=await captureCurrentHumanSnapshot(db,actor,workspace);
      const history=await db.query(`SELECT
        (EXISTS(SELECT 1 FROM portal_access_policy_events e WHERE e.workspace_id=$1)
         OR EXISTS(SELECT 1 FROM portal_access_grants_v2 g WHERE g.workspace_id=$1)) AS policy_seen`,[workspace]);
      if(history.rowCount!==1||typeof history.rows[0]?.policy_seen!=="boolean")
        throw new AccessPolicyError("ACCESS_RETRY_REQUIRED",409);
      const current_read_mode:"LEGACY_COMPATIBILITY"|"SCOPED_V2"=
        captured.policy!==null||history.rows[0].policy_seen?"SCOPED_V2":"LEGACY_COMPATIBILITY";
      return {...captured,current_read_mode,self_projection_fingerprint:accessDigest({
        schema_version:"portal.self-projection-fingerprint.v1",
        authority_fingerprint:captured.authority_fingerprint,current_read_mode})};
    });
  }

  /** Current context, freshly fenced AFTER adapter I/O. Never cache it as an
   * entitlement; delivery re-evaluates it after its own last source/cache await. */
  async readContext(actor:AccessActor,workspace:string):Promise<AccessEvaluationContext> {
    return this.readContextWithPrincipals(actor,workspace,[]);
  }

  /** A new grant's subject is not necessarily in the existing grant graph.
   * Resolve that subject through the same private adapter, before Core locks. */
  private async readContextWithPrincipals(actor:AccessActor,workspace:string,extraPrincipals:string[]):Promise<AccessEvaluationContext> {
    const captured=await this.captureReadContext(actor,workspace);
    // Qualified relations may come from an adapter. All DB locks/connections
    // above have been released before awaiting it.
    const relationMap=new Map<string,AccessRelations>();
    const ids=[...new Set([...captured.ids,...extraPrincipals])];
    if(this.trust.currentRelations){
      const observed=await this.trust.currentRelations.observe({actor,workspace_id:workspace,principal_ids:ids,
        action:"access.read",resource_digest:accessDigest({kind:"CURRENT_POLICY_CONTEXT"})});
      for(const id of ids){const fact=observed.get(id);if(!fact)throw new AccessPolicyError("SOURCE_RELATION_NOT_QUALIFIED",503);
        relationMap.set(id,structuredClone(fact));}
    }else for(const id of ids)relationMap.set(id,structuredClone(await this.trust.relations(id,workspace)));
    const current=await this.captureReadContext(actor,workspace);
    if(current.authority_fingerprint!==captured.authority_fingerprint)
      throw new AccessPolicyError("ACCESS_RETRY_REQUIRED",409);
    return {principal_id:actor.user_id,workspace_id:workspace,now_ms:current.now,actor_current:true,
      authority_fingerprint:current.authority_fingerprint,actor_lease_until_ms:current.lease_until_ms,actor_role:current.actor_role,
      actor_member:current.actor_member,
      policy:current.policy,grants:current.grants,manager_domain_grants:current.manager_domain_grants,active_principals:new Set(current.active),
      allow_test_only:this.allowTestOnly,relationsFor:id=>relationMap.get(id)??{
        qualified:false,revision:"UNQUALIFIED",own_alpha_ids:[],member_portfolio_ids:[],roots:{},membership:null}};
  }

  /** Final DB-only fence after the caller's LAST trusted-adapter await. This
   * intentionally does not resolve relations again and open another I/O gap.
   * No transaction/row lock is held across publication or relation adapters. */
  async confirmReadContext(actor:AccessActor,workspace:string,expected:AccessEvaluationContext):Promise<AccessEvaluationContext> {
    if(expected.principal_id!==actor.user_id||expected.workspace_id!==workspace||!expected.authority_fingerprint)
      throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED");
    const current=await this.captureReadContext(actor,workspace);
    if(current.authority_fingerprint!==expected.authority_fingerprint)
      throw new AccessPolicyError("ACCESS_RETRY_REQUIRED",409);
    return {...expected,now_ms:current.now,actor_lease_until_ms:current.lease_until_ms,actor_role:current.actor_role,
      actor_member:current.actor_member,manager_domain_grants:current.manager_domain_grants,actor_current:true};
  }

  /** Full Core graph; only dependency-closed source reads. Count is bounded,
   * but provider MUST settle/transport deadline is a separate C7 qualification.
   * No timer race, detached provider promise or DB connection across source I/O. */
  private async selfProjectionContext(actor:AccessActor,workspace:string,
    environment:"paper"|"sandbox"|"live",actions:readonly RowAction[]):Promise<SelfEligibilityContext> {
    const captured=await this.captureSelfProjectionContext(actor,workspace);
    if(!captured.actor_member)throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND",404);
    const relations=new Map<string,AccessRelations>();
    const absent:AccessRelations={qualified:false,revision:"UNQUALIFIED",own_alpha_ids:[],
      member_portfolio_ids:[],roots:{},membership:null};
    const contextFor=(fact:typeof captured):SelfEligibilityContext=>({
      principal_id:actor.user_id,workspace_id:workspace,now_ms:Math.max(captured.now,fact.now),actor_current:true,
      authority_fingerprint:fact.authority_fingerprint,actor_lease_until_ms:fact.lease_until_ms,
      current_read_mode:fact.current_read_mode,
      actor_role:fact.actor_role,actor_member:fact.actor_member,policy:fact.policy,grants:fact.grants,
      manager_domain_grants:fact.manager_domain_grants,active_principals:new Set(fact.active),
      allow_test_only:this.allowTestOnly,relationsFor:id=>relations.get(id)??absent});
    let ids:readonly string[]=[];
    let failure:{error:unknown}|null=null;
    try {
      // Complete the count/closure check BEFORE calling any provider. Overflow
      // produces a held typed refusal, never a partial/first-64 authority graph.
      ids=selfProjectionPrincipalIds(contextFor(captured),environment,actions);
      if(this.trust.currentRelations){
        const observed=await this.trust.currentRelations.observe({actor,workspace_id:workspace,principal_ids:ids,
          action:"access.read",resource_digest:accessDigest({kind:"SELF_ELIGIBILITY",environment,actions})});
        for(const id of ids){const fact=observed.get(id);if(!fact)throw new AccessPolicyError("SOURCE_RELATION_NOT_QUALIFIED",503);
          relations.set(id,structuredClone(fact));}
      }else for(const id of ids)relations.set(id,structuredClone(await this.trust.relations(id,workspace)));
    } catch(error) { failure={error}; }
    const current=await this.captureSelfProjectionContext(actor,workspace);
    // Same O(1) terminal actor check for a held SOURCE error as for a body.
    // Use the renewed genuine Core lease, never the original lease clock.
    const now=Math.max(current.now,Date.now());
    if(!Number.isSafeInteger(now)||!Number.isSafeInteger(current.lease_until_ms)||
      current.lease_until_ms<=0||now>=current.lease_until_ms)
      throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED",403);
    if(!current.actor_member)throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND",404);
    if(current.authority_fingerprint!==captured.authority_fingerprint||
      current.self_projection_fingerprint!==captured.self_projection_fingerprint)
      throw new AccessPolicyError("ACCESS_RETRY_REQUIRED",409);
    if(failure)throw failure.error instanceof AccessPolicyError?failure.error:
      new AccessPolicyError("SOURCE_RELATION_NOT_QUALIFIED",503);
    return {...contextFor(current),source_principal_ids:new Set(ids)};
  }

  async eligibility(actor:AccessActor,input:ReturnType<typeof eligibilityInput.parse>) {
    const context=await this.selfProjectionContext(actor,input.workspace_id,input.environment,input.actions);
    return projectEligibility(context,input);
  }

  /** FE-068: several resources and a typed step-up state in one bounded request. Same context capture,
   * evaluator and fences as eligibility(); the only extra read is THIS session's own step-up expiry, taken
   * after the exact actor/member fence and before the pure projection's final lease fence. */
  async eligibilityBatch(actor:AccessActor,input:ReturnType<typeof eligibilityBatchInput.parse>) {
    // The step-up challenge precondition searches every step-up-requiring action, not only the requested ones, so
    // the source-relation closure must cover them too: otherwise the batch could report a precondition the route
    // (which loads the whole grant graph) would not, or the reverse.
    const closure=[...new Set<RowAction>([...input.actions,...(CAPITAL_STEP_UP_ACTIONS as readonly RowAction[])])];
    const context=await this.selfProjectionContext(actor,input.workspace_id,input.environment,closure);
    const expiry=await new AccountLifecycleRepository(this.pool).activeStepUpExpiry(actor.session_id,COMMAND_STEP_UP_PROOFS);
    return projectEligibilityBatch(context,input,{active_until_ms:expiry?expiry.getTime():null});
  }

  /** FE-057/058/038: the caller's own default workspace (never a guess), self-only entry route and the typed
   * "no operation" branch for account management. One short read-only snapshot after the exact current-actor fence;
   * the final clock check against the session lease happens in the pure projection. */
  async selfContext(actor:AccessActor) {
    const facts=await withTransaction(this.pool,async db=>{
      await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      await db.query("SET LOCAL statement_timeout='5000ms'");
      return captureSelfContextFacts(db,actor);
    });
    return projectSelfContext(facts);
  }

  async selfNavigation(actor:AccessActor,input:ReturnType<typeof navigationInput.parse>) {
    const context=await this.selfProjectionContext(actor,input.workspace_id,input.environment,NAVIGATION_ACTIONS);
    const profile={paper:this.auth.config.EXECUTION_EDGE_PAPER_PROFILE_ID,
      sandbox:this.auth.config.EXECUTION_EDGE_SANDBOX_PROFILE_ID,live:this.auth.config.EXECUTION_EDGE_LIVE_PROFILE_ID}[input.environment];
    return projectNavigation(context,input,profile);
  }

  /** Internal producer port; no HTTP endpoint or fallback authority. */
  async readPublication(request:ExecutionReadPublicationRequest) {
    return await this.trust.readPublication?.(request)??null;
  }

  /** ELP2-09: one synchronous downstream write, linearized against app revoke
   * and session/lifecycle changes. Resolve all source/publication I/O BEFORE
   * this boundary. Never hold these locks while awaiting sockets or adapters.
   * Bytes already accepted by a socket cannot be recalled after revocation. */
  async realtimeDeliveryBoundary<T>(actor:AccessActor,workspace:string,expected:AccessEvaluationContext,
    resource:AccessResource,environment:"paper"|"sandbox"|"live",write:()=>T):Promise<T> {
    if(expected.principal_id!==actor.user_id||expected.workspace_id!==workspace||!expected.authority_fingerprint)
      throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED");
    return this.transaction(workspace,actor,false,async tx=>{
      tx.recheck(()=>{
        if(accessDigest([tx.context.policy,tx.context.grants,[...tx.context.active_principals].sort(),tx.context.actor_role])!==
          accessDigest([expected.policy,expected.grants,[...expected.active_principals].sort(),expected.actor_role]))
          throw new AccessPolicyError("ACCESS_RETRY_REQUIRED",409);
        tx.context.now_ms=Math.max(tx.context.now_ms,Date.now());
        if(!evaluateAccess(tx.context,"stream.subscribe",resource,environment).allowed)
          throw new AccessPolicyError("ACCESS_DENIED");
      });
      const result=write();
      if(result&&typeof (result as {then?:unknown}).then==="function")
        throw new Error("REALTIME_WRITE_MUST_BE_SYNCHRONOUS");
      return result;
    },[],expected);
  }

  /** Internal only. Human mapping is source-verified, never supplied by UI. */
  async commandHumanMapping(actor:AccessActor,workspace:string) {
    return this.trust.verifiedHumanMapping(actor.user_id,workspace);
  }

  /** Command writes reuse current identity, step-up, policy and grant locks. The
   * caller resolves source trust BEFORE entering this DB-only boundary. Never
   * perform relay I/O inside fn; TS still checks its own authority at commit. */
  async commandBoundary<T>(actor:AccessActor,workspace:string,expected:AccessEvaluationContext,
    action:AccessAction,resource:AccessResource,environment:"paper"|"sandbox"|"live",
    check:(now:number,current:AccessEvaluationContext)=>void,fn:(db:PoolClient)=>Promise<T>):Promise<T> {
    if(expected.principal_id!==actor.user_id||expected.workspace_id!==workspace||!expected.authority_fingerprint)
      throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED");
    // The step-up proof is family-bound: a capital command accepts a capital or an access-admin proof, any other
    // action only the access-admin one (stepUpProofsFor fails closed).
    return this.transaction(workspace,actor,stepUpProofsFor(action),async tx=>{
      tx.recheck(()=>{
        if(accessDigest([tx.context.policy,tx.context.grants])!==accessDigest([expected.policy,expected.grants]))
          throw new AccessPolicyError("ACCESS_RETRY_REQUIRED",409);
        const decision=evaluateAccess(tx.context,action,resource,environment);
        if(!decision.allowed)throw new AccessPolicyError(decision.reason_code??"ACCESS_DENIED");
        check(tx.context.now_ms,tx.context);
      });
      return fn(tx.db);
    },[],expected);
  }

  /** `stepUp`: false = none; true = the access-admin proof (historical); or the exact proof families accepted. */
  private async transaction<T>(workspace:string,actor:AccessActor,stepUp:boolean|readonly StepUpFamily[],fn:(tx:Tx)=>Promise<T>,extraPrincipals:string[]=[],
    captured?:AccessEvaluationContext,mutation?:AuthorityMutation<T>):Promise<T> {
    // Ordinary CURRENT READ observation is not a native MUTATION fence. A
    // separately qualified mutation adapter must be composed for this path.
    if(this.trust.currentRelations)throw new AccessPolicyError("SOURCE_RELATION_NOT_QUALIFIED",503);
    const proofs:readonly StepUpFamily[]|null=stepUp===false?null:stepUp===true?ACCESS_STEP_UP_PROOFS:stepUp;
    try {
      const prepared=captured??await this.readContextWithPrincipals(actor,workspace,extraPrincipals);
      if(prepared.principal_id!==actor.user_id||prepared.workspace_id!==workspace||!prepared.authority_fingerprint)
        throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED");
      // Source relations are fully detached before either the coordinator's
      // short authorization TX or its final application TX. Both execute this
      // DB-only boundary on the caller's supplied client: no nested pool lease
      // and no adapter/network await while Core mutation locks are held.
      const run=async <Result>(db:PoolClient,operation:(tx:Tx)=>Promise<Result>):Promise<Result>=>{
        await db.query("SET LOCAL lock_timeout='1500ms'");
        await db.query("SET LOCAL statement_timeout='5000ms'");
        const lock=await db.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired",[`portal-access-v2:${workspace}`]);
        if(!lock.rows[0].acquired) throw new AccessPolicyError("ACCESS_RETRY_REQUIRED",409);
        const users=new UsersRepository(db),sessions=new SessionsRepository(db),lifecycle=new AccountLifecycleRepository(db);
        const user=await users.lockById(actor.user_id);
        if(!user || user.status!=="ACTIVE" || user.archivedAt || user.mustChangePassword ||
          user.sessionVersion!==actor.session_generation || !await sessions.lockActiveLease(actor.session_id,user.userId,user.sessionVersion))
          throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED");
        const anchor=(await db.query("SELECT user_id FROM portal_owner_anchor WHERE anchor_id='PORTAL_OWNER' FOR SHARE")).rows[0]?.user_id;
        const member=await db.query("SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 FOR SHARE NOWAIT",[workspace,user.userId]);
        if(!member.rowCount && anchor!==user.userId) throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND",404);
        if(!await db.query("SELECT 1 FROM workspaces WHERE workspace_id=$1 FOR SHARE NOWAIT",[workspace]).then(r=>r.rowCount))
          throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND",404);
        if(proofs && !await lifecycle.lockActiveStepUpExpiry(actor.session_id,user.userId,proofs)) throw new AccessPolicyError("STEP_UP_REQUIRED");
        const repo=new AccessRepository(db),policy=await repo.policy(workspace,true),grants=await repo.grants(workspace);
        if(policy&&policy.protected_owner_user_id!==anchor)throw new AccessPolicyError("POLICY_PENDING",503);
        if(grants.length>10000) throw new AccessPolicyError("ACCESS_SCOPE_LIMIT_EXCEEDED",503);
        // NOWAIT prevents a cross-user lifecycle/delegation deadlock. A retry never widens authority.
        const principals=[...new Set([actor.user_id,anchor,...extraPrincipals,...grants.flatMap(g=>[g.subject_user_id,g.issued_by])].filter(Boolean))];
        const current=await db.query(`SELECT user_id,status,must_change_password,archived_at FROM portal_users
          WHERE user_id=ANY($1::text[]) FOR SHARE NOWAIT`,[principals]);
        const members=await db.query("SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND user_id=ANY($2::text[]) FOR SHARE NOWAIT",[workspace,principals]);
        const memberIds=new Set<string>(members.rows.map(r=>r.user_id));
        if(anchor) memberIds.add(anchor);
        const active=new Set<string>(current.rows.filter(r=>r.status==="ACTIVE"&&!r.must_change_password&&!r.archived_at&&memberIds.has(r.user_id)).map(r=>r.user_id));
        // Adapter awaits happened before acquiring a Core connection. Re-read
        // the same current facts under the existing mutation locks, not merely
        // the caller's cached policy/grant revisions. New targets are checked
        // from the locked lifecycle/membership rows above and again by fn.
        const boundary=await captureCurrentHumanSnapshot(db,actor,workspace);
        const existingPrincipals=new Set([actor.user_id,anchor,...grants.flatMap(g=>[g.subject_user_id,g.issued_by])]);
        const existingActive=[...active].filter(id=>existingPrincipals.has(id)).sort();
        if(boundary.authority_fingerprint!==prepared.authority_fingerprint||
          accessDigest([policy,grants,existingActive,user.role])!==
          accessDigest([prepared.policy,prepared.grants,[...prepared.active_principals].sort(),prepared.actor_role]))
          throw new AccessPolicyError("ACCESS_RETRY_REQUIRED",409);
        const relationMap=new Map<string,AccessRelations>();
        for(const id of principals) relationMap.set(id!,structuredClone(prepared.relationsFor(id!)));
        const now=await this.now(db);
        const context:AccessEvaluationContext={principal_id:actor.user_id,workspace_id:workspace,now_ms:now,
          actor_current:true,actor_role:user.role,policy,grants,active_principals:active,allow_test_only:this.allowTestOnly,
          relationsFor:id=>relationMap.get(id)??{qualified:false,revision:"UNQUALIFIED",own_alpha_ids:[],member_portfolio_ids:[],roots:{},membership:null}};
        const checks:Array<()=>void>=[];
        const result=await operation({db,repo,context,recheck:check=>{check();checks.push(check);}});
        // Row locks prevent revoke/generation races, not wall-clock expiry while awaiting work.
        if(!await sessions.lockActiveLease(actor.session_id,user.userId,user.sessionVersion))
          throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED");
        if(proofs && !await lifecycle.lockActiveStepUpExpiry(actor.session_id,user.userId,proofs)) throw new AccessPolicyError("STEP_UP_REQUIRED");
        context.now_ms=await this.now(db);
        for(const check of checks)check();
        return result;
      };
      if(mutation&&this.authorityMutations)return await this.authorityMutations.execute(mutation.binding,{
        authorize:db=>run(db,mutation.authorize),apply:db=>run(db,fn),terminal:mutation.terminal,
      });
      return await withTransaction(this.pool,db=>run(db,fn));
    } catch(caught) {
      const error=caught instanceof CurrentHumanLeaseError?this.mutationRefusal(caught):caught;
      if(proofs && error instanceof AccessPolicyError) {
        // The transaction is already rolled back. Log only a current stable
        // actor and a typed refusal; no target/key/password or authority seed.
        await this.recordRefusal(actor,error);
      }
      if(error && typeof error==="object" && "code" in error && ["55P03","40P01","57014"].includes(String(error.code)))
        throw new AccessPolicyError("ACCESS_RETRY_REQUIRED",409);
      throw error;
    }
  }
  private mutationRefusal(error:CurrentHumanLeaseError):AccessPolicyError {
    const mapped=error.code==="CURRENT_HUMAN_MUTATION_KEY_CONFLICT"
      ?new AccessPolicyError("IDEMPOTENCY_KEY_PAYLOAD_CONFLICT",409)
      :error.code==="CURRENT_HUMAN_MUTATION_PREVIOUSLY_REFUSED"
        ?new AccessPolicyError("ACCESS_DENIED",409)
        :error.code==="CURRENT_HUMAN_MUTATION_CAPACITY_EXHAUSTED"
          ?new AccessPolicyError("ACCESS_SCOPE_LIMIT_EXCEEDED",503)
          :new AccessPolicyError("ACCESS_RETRY_REQUIRED",503);
    // Preserve the typed internal diagnostic without putting request bodies,
    // raw keys or provider details into the public contract or refusal audit.
    Object.defineProperty(mapped,"cause",{value:error});
    return mapped;
  }
  private async recordRefusal(actor:AccessActor,error:AccessPolicyError):Promise<void> {
    const current=await new UsersRepository(this.pool).findById(actor.user_id);
    await new AuditRepository(this.pool).record({eventType:"portal_scoped_access_refused",
      actorUserId:current?.userId??null,result:"DENIED",reasonCode:error.code,
      metadata:{schema_version:"portal.access-refusal.v1",http_status:error.status}});
  }
  private async now(db:PoolClient):Promise<number> {
    return Number((await db.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0].ms);
  }
  private receipt(context:AccessEvaluationContext,input:Partial<AccessReceipt>):AccessReceipt {
    return {schema_version:"portal.access-operation.v1",operation_id:randomId("ace"),proposal_id:null,grant_id:null,
      outcome:"DENIED",http_status:403,reason_code:null,policy_revision:context.policy?.revision??null,
      grant_revision:null,decided_at_ms:context.now_ms,ts_authority:"NOT_REQUIRED",...input};
  }
  private async event(tx:Tx,actor:AccessActor,operation:string,digest:string,receipt:AccessReceipt,
    input:Partial<AccessEvent>={}):Promise<void> {
    await tx.repo.event({event_id:receipt.operation_id,workspace_id:tx.context.workspace_id,actor_user_id:actor.user_id,
      subject_user_id:null,operation,key_digest:null,request_digest:digest,policy_revision:tx.context.policy?.revision??null,
      grant_id:receipt.grant_id,proposal_id:receipt.proposal_id,source:null,source_receipt_id:null,
      before_fact:null,after_fact:null,receipt,...input});
  }
  private changeDigest(actor:AccessActor,workspace:string,change:GrantChange) {
    return accessDigest({actor_user_id:actor.user_id,workspace_id:workspace,change:canonicalChange(change)});
  }
  private previewResult(context:AccessEvaluationContext,actor:AccessActor,change:GrantChange) {
    let reason:AccessRefusal|null=null;
    try{validateDelegation(context,change);}catch(error){if(!(error instanceof AccessPolicyError))throw error;reason=error.code;}
    if(reason===null&&!context.active_principals.has(change.subject_user_id))reason="ACCESS_RESOURCE_NOT_FOUND";
    if(reason===null&&change.action==="portfolio.read_restricted"&&context.policy?.researcher_fields.state!=="QUALIFIED")
      reason="RESEARCHER_FIELD_POLICY_PENDING";
    const current=context.relationsFor(change.subject_user_id).membership;
    if(reason===null && tsBusinessAction(change.action)&&change.effect==="ALLOW"&&
      change.expected_ts_membership_revision!==(current?.revision??null)) reason="TS_MEMBERSHIP_REVISION_CONFLICT";
    return {schema_version:"portal.access-preview.v1" as const,allowed:reason===null,reason_code:reason,
      preview_digest:this.changeDigest(actor,context.workspace_id,change),policy_revision:context.policy?.revision??null,
      app_outcome:reason?"DENIED":"ELIGIBLE",ts_authority:tsBusinessAction(change.action)&&change.effect==="ALLOW"?"PENDING":"NOT_REQUIRED",
      effective_business_right:false,change:canonicalChange(change),
      effect_preview:{before:{coverage:"EXACT_SELECTOR_GRANTS_ONLY",grants:reason?[]:context.grants.filter(g=>
        g.subject_user_id===change.subject_user_id&&g.action===change.action&&
        accessDigest(canonicalSelector(g.selector))===accessDigest(canonicalSelector(change.selector))&&grantCurrent(g,context))
        .map(g=>({grant_id:g.grant_id,revision:g.revision,effect:g.effect}))},
      after:{application:reason?"DENIED":"ELIGIBLE_ON_COMMIT",business:tsBusinessAction(change.action)&&change.effect==="ALLOW"?"PENDING":"NOT_REQUIRED",
        rights_effective_now:false}}};
  }
  async effective(actor:AccessActor,workspace:string) {
    return this.transaction(workspace,actor,false,async({context,repo})=>{
      const states=await repo.proposalStates(workspace,actor.user_id);
      return {schema_version:"portal.access-effective.v1",
      workspace_id:workspace,user_id:actor.user_id,policy_revision:context.policy?.revision??null,
      availability:policyReady(context)?"AVAILABLE":"POLICY_PENDING",reason_code:policyReady(context)?null:"POLICY_PENDING",
      grants:context.grants.filter(g=>g.subject_user_id===actor.user_id).map(g=>({grant_id:g.grant_id,action:g.action,effect:g.effect,
        selector:g.selector,environments:g.environments,valid_from_ms:g.valid_from_ms,valid_until_ms:g.valid_until_ms,
        revision:g.revision,current:grantCurrent(g,context) && (g.effect==="DENY" || (()=>{
          try {return g.environments.every(env=>{
            const resources=resolvedResources(g.selector,context.relationsFor(g.subject_user_id),env);
            return resources.length>0&&resources.every(r=>evaluateAccess(context,g.action,r,env).allowed);
          });
          }catch{return false;}
        })()),ts_authority:!g.requires_ts_acceptance?"NOT_REQUIRED":g.ts_receipt?"ACCEPTED":
          states.get(g.grant_id)==="TS_REJECTED"?"REJECTED":states.get(g.grant_id)==="TS_UNKNOWN"?"UNKNOWN":"PENDING"})),
      researcher_field_policy:{state:context.policy?.researcher_fields.state??"PENDING",policy_ref:context.policy?.researcher_fields.policy_ref??null},
      owner_recovery:{enabled:false,reason_code:"OWNER_RECOVERY_NOT_APPROVED"}};
    });
  }
  async preview(actor:AccessActor,workspace:string,change:GrantChange) {
    return this.transaction(workspace,actor,false,async tx=>this.previewResult(tx.context,actor,change),[change.subject_user_id]);
  }
  private assertProposeCeiling(tx:Tx,change:GrantChange):void {
    // Even an immutable receipt remains private to an actor whose delegation
    // ceiling is current. Historical replay never reactivates its output.
    const currentCeiling=tx.context.grants.find(g=>g.grant_id===change.ceiling_grant_id);
    tx.recheck(()=>validateDelegation(tx.context,{...change,expected_policy_revision:tx.context.policy?.revision??change.expected_policy_revision,
      expected_ceiling_revision:currentCeiling?.revision??change.expected_ceiling_revision}));
  }
  private async assertProposeReady(tx:Tx,actor:AccessActor,workspace:string,change:GrantChange,previewDigest:string,digest:string):Promise<void> {
    validateDelegation(tx.context,change);
    const preview=this.previewResult(tx.context,actor,change);
    if(previewDigest!==digest)throw new AccessPolicyError("POLICY_REVISION_CONFLICT",409);
    if(!preview.allowed)throw new AccessPolicyError(preview.reason_code!,preview.reason_code==="ACCESS_RESOURCE_NOT_FOUND"?404:
      preview.reason_code==="TS_MEMBERSHIP_REVISION_CONFLICT"?409:403);
    const target=(await tx.db.query(`SELECT user_id FROM portal_users WHERE user_id=$1 AND status='ACTIVE'
      AND NOT must_change_password AND archived_at IS NULL FOR SHARE NOWAIT`,[change.subject_user_id])).rows[0];
    const targetMembership=await tx.db.query("SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 FOR SHARE NOWAIT",[workspace,change.subject_user_id]);
    if(!target||!targetMembership.rowCount)throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND",404);
  }
  async propose(actor:AccessActor,workspace:string,change:GrantChange,previewDigest:string,key:string):Promise<OperationResult> {
    actor={...actor};change=structuredClone(change);
    const digest=this.changeDigest(actor,workspace,change),keyDigest=accessDigest(["PROPOSE",key]);
    const result=await this.transaction(workspace,actor,true,async tx=>{
      // Validate current authority before even exposing an immutable earlier receipt.
      this.assertProposeCeiling(tx,change);
      const prior=await tx.repo.keyedEvent(workspace,keyDigest);
      if(prior) return this.replay(prior,actor,digest);
      // All business refusals precede writes. Store the original outcome instead
      // of allowing the same key to become a later, different successful intent.
      try{
        await this.assertProposeReady(tx,actor,workspace,change,previewDigest,digest);
      }catch(error){
        if(!(error instanceof AccessPolicyError))throw error;
        const receipt=this.receipt(tx.context,{outcome:"DENIED",http_status:error.status,reason_code:error.code});
        await this.event(tx,actor,"DENIED",digest,receipt,{key_digest:keyDigest});
        return {receipt,replayed:false};
      }
      const tsRequired=tsBusinessAction(change.action)&&change.effect==="ALLOW";
      const grant:ScopedAccessGrant={grant_id:randomId("acg"),subject_user_id:change.subject_user_id,workspace_id:workspace,
        action:change.action,effect:change.effect,selector:canonicalSelector(change.selector),environments:[...change.environments].sort(),
        valid_from_ms:change.valid_from_ms,valid_until_ms:change.valid_until_ms,delegable_actions:[...change.delegable_actions].sort(),
        issued_by:actor.user_id,parent_grant_id:change.ceiling_grant_id,revision:randomId("acr"),policy_revision:tx.context.policy!.revision,
        revoked_at_ms:null,requires_ts_acceptance:tsRequired,ts_receipt:null,
        field_policy_ref:change.action==="portfolio.read_restricted"?tx.context.policy!.researcher_fields.policy_ref:null};
      const receipt=this.receipt(tx.context,{proposal_id:randomId("acp"),grant_id:grant.grant_id,
        outcome:tsRequired?"TS_PENDING":"APP_APPLIED",http_status:201,grant_revision:grant.revision,
        ts_authority:tsRequired?"PENDING":"NOT_REQUIRED"});
      await tx.repo.saveGrant(grant,true);
      await tx.repo.addProposal({proposal_id:receipt.proposal_id!,workspace_id:workspace,actor_user_id:actor.user_id,
        subject_user_id:change.subject_user_id,grant_id:grant.grant_id,request_digest:digest,change:canonicalChange(change),
        state:tsRequired?"TS_PENDING":"APP_APPLIED",submission_receipt:receipt},keyDigest);
      await this.event(tx,actor,"PROPOSE",digest,receipt,{key_digest:keyDigest,subject_user_id:change.subject_user_id,after_fact:grant});
      return {receipt,replayed:false};
    },[change.subject_user_id],undefined,{
      binding:{family:"EXECUTION_ACCESS",operation:"PROPOSE_GRANT",actor_id:actor.user_id,session_id:actor.session_id,
        session_revision:actor.session_generation,key_digest:accessDigest(["execution-access","PROPOSE_GRANT",workspace,key]),
        request_digest:accessDigest({request_digest:digest,preview_digest:previewDigest}),target_id:change.subject_user_id},
      authorize:async tx=>{
        this.assertProposeCeiling(tx,change);
        const prior=await tx.repo.keyedEvent(workspace,keyDigest);
        if(prior){this.replay(prior,actor,digest);return;}
        // The global drain is admission, not a way for an otherwise current
        // user to stall every workspace with an ineligible grant request.
        await this.assertProposeReady(tx,actor,workspace,change,previewDigest,digest);
      },terminal:result=>this.mutationTerminal(result),
    });
    if(result.receipt.outcome==="DENIED")throw new AccessPolicyError(result.receipt.reason_code as "ACCESS_DENIED",result.receipt.http_status);
    return result;
  }
  private replay(prior:AccessEvent,actor:AccessActor,digest:string):OperationResult {
    if(prior.actor_user_id!==actor.user_id||prior.request_digest!==digest) throw new AccessPolicyError("IDEMPOTENCY_KEY_PAYLOAD_CONFLICT",409);
    if(prior.receipt.outcome==="DENIED") throw new AccessPolicyError(prior.receipt.reason_code as "ACCESS_DENIED",prior.receipt.http_status);
    return {receipt:prior.receipt,replayed:true};
  }
  private mutationTerminal(result:OperationResult) {
    return {outcome:result.receipt.outcome==="DENIED"?"REFUSED" as const:"APPLIED" as const,
      receipt_ref:result.receipt.operation_id,reason_code:result.receipt.reason_code};
  }
  async proposal(actor:AccessActor,workspace:string,id:string) {
    return this.transaction(workspace,actor,false,async tx=>{
      const row=await tx.repo.proposal(workspace,id);
      if(!row) throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND",404);
      tx.recheck(()=>{
        const decision=evaluateAccess(tx.context,"access.read",{kind:"USER",id:row.subject_user_id},"paper");
        let currentIssuer=false;
        if(row.actor_user_id===actor.user_id){
          const ceiling=tx.context.grants.find(g=>g.grant_id===row.change.ceiling_grant_id);
          try{validateDelegation(tx.context,{...row.change,expected_policy_revision:tx.context.policy?.revision??row.change.expected_policy_revision,
            expected_ceiling_revision:ceiling?.revision??row.change.expected_ceiling_revision});currentIssuer=true;}catch{}
        }
        if(!currentIssuer&&row.subject_user_id!==actor.user_id&&!decision.allowed)
          throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND",404);
        if(!policyReady(tx.context)) throw new AccessPolicyError("POLICY_PENDING");
      });
      return {schema_version:"portal.access-proposal.v1",proposal_id:id,state:row.state,change:row.change,
        submission_receipt:row.submission_receipt,updated_at_ms:row.updated_at.getTime()};
    });
  }
  private assertRevokeAuthority(tx:Tx,actor:AccessActor,id:string):ScopedAccessGrant {
      const grant=tx.context.grants.find(g=>g.grant_id===id);
      if(!grant) throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND",404);
      if(grant.subject_user_id===actor.user_id) throw new AccessPolicyError("SELF_PRIVILEGE_CHANGE_DENIED");
      if(grant.subject_user_id===tx.context.policy?.protected_owner_user_id) throw new AccessPolicyError("PROTECTED_OWNER_CHANGE_DENIED");
      if(!policyReady(tx.context)) throw new AccessPolicyError("POLICY_PENDING");
      this.assertConstraintRemoval(tx.context,actor,grant);
      tx.recheck(()=>{
        for(const environment of grant.environments) {
          const resources=resolvedResources(grant.selector,tx.context.relationsFor(grant.subject_user_id),environment);
          if(!resources.length || !resources.every(resource=>evaluateAccess(tx.context,"access.revoke",resource,environment).allowed))
            throw new AccessPolicyError("ACCESS_DENIED");
        }
      });
      return grant;
  }
  private assertRevokeRevisions(tx:Tx,grant:ScopedAccessGrant,policyRevision:string,grantRevision:string):void {
    if(tx.context.policy!.revision!==policyRevision)throw new AccessPolicyError("POLICY_REVISION_CONFLICT",409);
    if(grant.revision!==grantRevision||grant.revoked_at_ms!==null)throw new AccessPolicyError("GRANT_REVISION_CONFLICT",409);
  }
  async revoke(actor:AccessActor,workspace:string,id:string,policyRevision:string,grantRevision:string,key:string,reason="Access revoked."):Promise<OperationResult> {
    actor={...actor};
    const digest=accessDigest([actor.user_id,workspace,id,policyRevision,grantRevision,reason]),keyDigest=accessDigest(["REVOKE",key]);
    let revokedSubject:string|null=null;
    const result=await this.transaction(workspace,actor,true,async tx=>{
      const grant=this.assertRevokeAuthority(tx,actor,id);
      const prior=await tx.repo.keyedEvent(workspace,keyDigest);
      if(prior) return this.replay(prior,actor,digest);
      this.assertRevokeRevisions(tx,grant,policyRevision,grantRevision);
      const updated={...grant,revision:randomId("acr"),revoked_at_ms:tx.context.now_ms};
      const receipt=this.receipt(tx.context,{grant_id:id,outcome:"REVOKED",http_status:200,grant_revision:updated.revision,
        ts_authority:grant.requires_ts_acceptance?"UNKNOWN":"NOT_REQUIRED"});
      await tx.repo.saveGrant(updated);await tx.repo.revokeProposals(id);
      await this.event(tx,actor,"REVOKE",digest,receipt,{key_digest:keyDigest,subject_user_id:grant.subject_user_id,before_fact:grant,after_fact:{grant:updated,reason}});
      revokedSubject=grant.subject_user_id;
      return {receipt,replayed:false};
    },[],undefined,{
      binding:{family:"EXECUTION_ACCESS",operation:"REVOKE_GRANT",actor_id:actor.user_id,session_id:actor.session_id,
        session_revision:actor.session_generation,key_digest:accessDigest(["execution-access","REVOKE_GRANT",workspace,key]),
        request_digest:digest,target_id:id},
      authorize:async tx=>{
        const grant=this.assertRevokeAuthority(tx,actor,id);
        const prior=await tx.repo.keyedEvent(workspace,keyDigest);
        if(prior){this.replay(prior,actor,digest);return;}
        this.assertRevokeRevisions(tx,grant,policyRevision,grantRevision);
      },terminal:result=>this.mutationTerminal(result),
    });
    // Committed. A stream hint for the grantee only (BE-P18); the streams' own per-poll/per-write recheck stays the authority.
    // Delegated children of the grant, if any, are not named here and are ended by that recheck.
    if(revokedSubject!==null)hintUserAuthorityChanged(this.auth,revokedSubject);
    return result;
  }

  /** Advisory revoke diff; hidden and unknown grants share the same public404. */
  async previewRevoke(actor:AccessActor,workspace:string,id:string,policyRevision:string,grantRevision:string,reason:string) {
    return this.transaction(workspace,actor,false,async tx=>{
      const grant=tx.context.grants.find(g=>g.grant_id===id);
      if(!grant||!policyReady(tx.context))throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND",404);
      tx.recheck(()=>{
        if(!grant.environments.every(env=>{
          const resources=resolvedResources(grant.selector,tx.context.relationsFor(grant.subject_user_id),env);
          return resources.length>0&&resources.every(r=>evaluateAccess(tx.context,"access.revoke",r,env).allowed);
        }))
          throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND",404);
      });
      if(grant.subject_user_id===actor.user_id)throw new AccessPolicyError("SELF_PRIVILEGE_CHANGE_DENIED");
      if(grant.subject_user_id===tx.context.policy!.protected_owner_user_id)throw new AccessPolicyError("PROTECTED_OWNER_CHANGE_DENIED");
      this.assertConstraintRemoval(tx.context,actor,grant);
      if(tx.context.policy!.revision!==policyRevision)throw new AccessPolicyError("POLICY_REVISION_CONFLICT",409);
      if(grant.revision!==grantRevision||grant.revoked_at_ms!==null)throw new AccessPolicyError("GRANT_REVISION_CONFLICT",409);
      return {schema_version:"portal.access-revoke-preview.v1",preview_digest:accessDigest([actor.user_id,workspace,id,policyRevision,grantRevision,reason]),
        policy_revision:policyRevision,before:{grant_id:id,grant_revision:grant.revision,action:grant.action,effect:grant.effect,
          selector:grant.selector,environments:grant.environments,revoked_at_ms:grant.revoked_at_ms},
        after:{grant_state:"REVOKED_ON_COMMIT",effective_access:"CURRENT_POLICY_REEVALUATED",ts_revocation:grant.requires_ts_acceptance?"NOT_CONFIRMED":"NOT_REQUIRED",
          descendants:"CURRENT_CHAIN_RECHECKED",committed_obligations:"CONTINUE"},step_up_required:true,advisory_only:true};
    });
  }

  private assertConstraintRemoval(context:AccessEvaluationContext,actor:AccessActor,grant:ScopedAccessGrant):void {
    // Removing DENY is privilege-increasing, not an ordinary withdraw. Until a
    // separately reviewed deny-removal ceiling exists, only the current locked
    // owner may do it, still subject to exact access.revoke and target guards.
    if(grant.effect==="DENY"&&actor.user_id!==context.policy?.protected_owner_user_id)
      throw new AccessPolicyError("DELEGATION_CEILING_EXCEEDED");
  }

  /** Re-authenticate THIS session with the actor's OWN current password. It grants no capability and never makes
   * anyone an access administrator: it records that the password was just proven, for a stated proof family.
   *   ACCESS_ADMIN     (default, historical) needs a current own access.grant / access.revoke ALLOW.
   *   CAPITAL_COMMAND  needs a current own ALLOW of a step-up-requiring capital / pending-control / registration
   *                    action, judged by the full current graph (stepUpPreconditionMet, shared with the batch read).
   * Everything else is unchanged: the proof belongs to this session only, expires with OWNER_STEP_UP_TTL_SECONDS,
   * dies with the session (password change, logout, revoke), and every command re-checks its own authority. */
  async stepUp(actor:AccessActor,workspace:string,password:string,family:StepUpFamily="ACCESS_ADMIN") {
    try {
    if(family!=="ACCESS_ADMIN"&&family!=="CAPITAL_COMMAND")throw new AccessPolicyError("ACCESS_DENIED");
    const credential=await this.auth.credentials.findPassword(actor.user_id);
    const valid=credential?await this.auth.argon2.verify(credential.passwordHash,password):false;
    if(!credential) await this.auth.argon2.verifyAgainstDecoy();
    if(!valid) throw new AccessPolicyError("STEP_UP_REJECTED");
    return await this.transaction(workspace,actor,false,async tx=>{
      // The precondition is judged on the transaction's locked, current context AFTER the password proof, and
      // fails closed (a thrown search limit or any unreadable fact is a refusal, never a grant).
      if(!stepUpPreconditionMet(tx.context,family)) throw new AccessPolicyError("ACCESS_DENIED");
      const current=await new CredentialsRepository(tx.db).findPassword(actor.user_id);
      if(!current||current.passwordHash!==credential!.passwordHash) throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED");
      const stepUpId=randomId(family==="CAPITAL_COMMAND"?"stpcap":"stp");
      const expiry=await new AccountLifecycleRepository(tx.db).grantStepUp({stepUpId,sessionId:actor.session_id,
        userId:actor.user_id,ttlSeconds:this.auth.config.OWNER_STEP_UP_TTL_SECONDS,family});
      const receipt=this.receipt(tx.context,{outcome:"APP_APPLIED",http_status:200});
      // ACCESS_ADMIN keeps its historical digest bytes; the capital proof is a distinct, family-named event.
      await this.event(tx,actor,"STEP_UP",accessDigest(family==="ACCESS_ADMIN"?[actor.user_id,workspace,"PASSWORD_VERIFIED"]:
        [actor.user_id,workspace,"PASSWORD_VERIFIED",family]),receipt,{subject_user_id:actor.user_id});
      return {schema_version:"portal.access-step-up.v1",state:"ACTIVE",family,expires_at_ms:expiry.getTime()};
    });
    } catch(error) {
      if(error instanceof AccessPolicyError)await this.recordRefusal(actor,error);
      throw error;
    }
  }

  /** PRIVATE fresh native Manager intake. No route, role inference or legacy
   * fallback. Same trust, coordinator, immutable event and SQL repository.
   * Domain READ is NOT stream.subscribe or membership/financial authority. */
  async installReviewedManagerDomainPolicy(input:unknown):Promise<void>{
    const verified=await this.trust.verifyPolicy(input);
    if(!verified||verified.policy.state!=="REVIEWED"||verified.policy.qualification!=="OWNER_VERIFIED"||
      !verified.policy.approval_ref||!verified.provenance_ref||!this.authorityMutations)
      throw new AccessPolicyError("RECEIPT_NOT_QUALIFIED",503);
    const artifact=structuredClone(verified);
    if(!reviewedAccessPolicy.safeParse(artifact.policy).success||artifact.root_grants.length!==0||
      !Array.isArray(artifact.manager_domain_grants)||artifact.manager_domain_grants.length===0||
      artifact.manager_domain_grants.length>64||!artifact.manager_commissioning_target)
      throw new AccessPolicyError("RECEIPT_BINDING_MISMATCH",409);
    const t=artifact.manager_commissioning_target;
    if(t.workspace_id!==artifact.policy.workspace_id||t.protected_owner_user_id!==artifact.policy.protected_owner_user_id||
      !/^[0-9]{1,20}$/.test(t.database_system_identifier)||!t.database_name||!t.role_name||
      !Array.isArray(t.principal_workspace_pins)||t.principal_workspace_pins.length===0||
      t.principal_workspace_pins.length>65||new Set(t.principal_workspace_pins.map(p=>p.user_id)).size!==t.principal_workspace_pins.length)
      throw new AccessPolicyError("RECEIPT_BINDING_MISMATCH",409);
    const ids=new Set<string>();
    for(const value of artifact.manager_domain_grants){
      const parsed=managerDomainGrant.safeParse(value);
      if(!parsed.success)throw new AccessPolicyError("RECEIPT_BINDING_MISMATCH",409);
      const g=parsed.data;
      if(ids.has(g.grant_id)||g.workspace_id!==t.workspace_id||g.issued_by!==t.protected_owner_user_id||
        g.policy_revision!==artifact.policy.revision||g.revoked_at_ms!==null||
        !t.principal_workspace_pins.some(p=>p.user_id===g.subject_user_id&&p.workspace_id===t.workspace_id)||
        !artifact.policy.manager_read_domains?.some(s=>s.environment===g.environment&&
          accessDigest(s.domain)===accessDigest(g.domain)&&s.field_policy_ref===g.field_policy_ref&&
          s.valid_from_ms<=g.valid_from_ms&&s.valid_until_ms>=g.valid_until_ms))
        throw new AccessPolicyError("RECEIPT_BINDING_MISMATCH",409);
      ids.add(g.grant_id);
    }
    const original=await withTransaction(this.pool,async db=>{
      await db.query("SET TRANSACTION READ ONLY");
      await this.assertManagerCommissioningTarget(db,artifact);
      return new AccessRepository(db).policyInstall(t.workspace_id,artifact.policy.revision);
    });
    if(original){
      if(original.request_digest!==accessDigest(artifact))throw new AccessPolicyError("POLICY_REVISION_CONFLICT",409);
      return; // immutable historical ACK, not a grant repair/restore
    }
    try{
      await this.authorityMutations.executeVerified({family:"REVIEWED_POLICY",operation:"INSTALL_POLICY",
        key_digest:accessDigest(["REVIEWED_POLICY",t.workspace_id,artifact.policy.revision]),
        request_digest:accessDigest(artifact),target_id:t.workspace_id},{
        retain_after_application_rollback:true,
        authorize:async db=>{await this.installReviewedManagerDomainOn(db,artifact,false);},
        apply:db=>this.installReviewedManagerDomainOn(db,artifact,true),
        terminal:receipt=>({outcome:"APPLIED",receipt_ref:receipt!.operation_id,reason_code:null}),
      });
    }catch(error){
      if(error instanceof CurrentHumanLeaseError)throw new AccessPolicyError(
        error.code==="CURRENT_HUMAN_MUTATION_KEY_CONFLICT"?"POLICY_REVISION_CONFLICT":"ACCESS_RETRY_REQUIRED",
        error.code==="CURRENT_HUMAN_MUTATION_KEY_CONFLICT"?409:503);
      throw error;
    }
  }

  private async installReviewedManagerDomainOn(db:PoolClient,artifact:ReviewedPolicyArtifact,write:boolean):Promise<AccessReceipt|null>{
    const t=artifact.manager_commissioning_target!;
    await db.query("SET LOCAL lock_timeout='1500ms'");
    await db.query("SET LOCAL statement_timeout='5000ms'");
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`portal-access-v2:${t.workspace_id}`]);
    await this.assertManagerCommissioningTarget(db,artifact);
    const repo=new AccessRepository(db),original=await repo.policyInstall(t.workspace_id,artifact.policy.revision);
    if(original){
      if(original.request_digest!==accessDigest(artifact))throw new AccessPolicyError("POLICY_REVISION_CONFLICT",409);
      return original.receipt;
    }
    const anchor=(await db.query("SELECT user_id FROM portal_owner_anchor WHERE anchor_id='PORTAL_OWNER' FOR SHARE NOWAIT")).rows[0]?.user_id;
    if(anchor!==t.protected_owner_user_id)throw new AccessPolicyError("RECEIPT_BINDING_MISMATCH",409);
    const old=await repo.policy(t.workspace_id,true);
    if(old!==null||(await repo.storedGrants(t.workspace_id)).length!==0)
      throw new AccessPolicyError("POLICY_REVISION_CONFLICT",409);
    // Exact real IDs/workspaces, not username or application-role inference.
    const principalIds=[...new Set([anchor,...t.principal_workspace_pins.map(p=>p.user_id)])].sort();
    const users=await db.query(`SELECT user_id,status,must_change_password,archived_at FROM portal_users
      WHERE user_id=ANY($1::text[]) ORDER BY user_id FOR SHARE NOWAIT`,[principalIds]);
    if(users.rows.length!==principalIds.length||users.rows.some(u=>u.status!=="ACTIVE"||u.must_change_password||u.archived_at))
      throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED");
    for(const pin of t.principal_workspace_pins){
      const workspace=await db.query("SELECT workspace_id FROM workspaces WHERE workspace_id=$1 FOR SHARE NOWAIT",[pin.workspace_id]);
      const member=await db.query("SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 FOR SHARE NOWAIT",[pin.workspace_id,pin.user_id]);
      if(workspace.rowCount!==1||member.rowCount!==1)throw new AccessPolicyError("RECEIPT_BINDING_MISMATCH",409);
    }
    if(!write)return null;
    await repo.putPolicy(artifact.policy);
    for(const g of artifact.manager_domain_grants!)await repo.saveManagerDomainGrant(g,true);
    const receipt:AccessReceipt={schema_version:"portal.access-operation.v1",operation_id:randomId("ace"),proposal_id:null,grant_id:null,
      outcome:"APP_APPLIED",http_status:200,reason_code:null,policy_revision:artifact.policy.revision,grant_revision:null,
      decided_at_ms:await this.now(db),ts_authority:"NOT_REQUIRED"};
    await repo.event({event_id:receipt.operation_id,workspace_id:t.workspace_id,actor_user_id:anchor,subject_user_id:null,
      operation:"POLICY_INSTALL",key_digest:null,request_digest:accessDigest(artifact),policy_revision:artifact.policy.revision,
      grant_id:null,proposal_id:null,source:null,source_receipt_id:null,before_fact:null,
      after_fact:{policy:artifact.policy,provenance_ref:artifact.provenance_ref,
        manager_grant_digests:artifact.manager_domain_grants!.map(g=>({grant_id:g.grant_id,grant_digest:accessDigest(g)}))},receipt});
    return receipt;
  }

  /** PRIVATE append-only finite successor. Existing first-install/replay behavior
   * stays unchanged. A verified root-owned artifact is not an application login. */
  async installReviewedManagerDomainSuccessor(input:unknown):Promise<AccessReceipt>{
    const token=verifiedManagerSuccessor(input);
    if(!token||!this.authorityMutations)throw new ManagerSuccessorError("MANAGER_SUCCESSOR_ARTIFACT_REFUSED",503);
    const {document:doc,pin}=token,digest=managerSuccessorDigest(doc,pin.approved_sha256);
    try{
      const prior=await withTransaction(this.pool,async db=>{
        await db.query("SET TRANSACTION READ ONLY");
        await this.assertManagerTarget(db,doc.target);
        return this.priorManagerSuccessor(new AccessRepository(db),doc,digest);
      });
      if(prior)return prior; // historical receipt ONLY: no grant/session repair
      return await this.authorityMutations.executeVerified({family:"REVIEWED_POLICY",operation:"INSTALL_POLICY",
        key_digest:managerSuccessorKey(doc.target.workspace_id,doc.successor_id),request_digest:digest,target_id:doc.target.workspace_id},{
        retain_after_application_rollback:true,
        // A synchronous local expiry fence is rechecked by the existing
        // coordinator after its LAST metadata await, immediately before COMMIT.
        // It does not pretend to be a source/current-human authority provider.
        acquire_fence:async()=>({assertCurrent:()=>assertSuccessorWindow(pin,Date.now()),release:async()=>undefined}),
        authorize:async db=>{await this.installManagerSuccessorOn(db,doc,pin,digest,false);},
        apply:async db=>(await this.installManagerSuccessorOn(db,doc,pin,digest,true))!,
        terminal:receipt=>({outcome:"APPLIED",receipt_ref:receipt.operation_id,reason_code:null}),
      });
    }catch(error){
      if(error instanceof ManagerSuccessorError)throw error;
      if(error instanceof CurrentHumanLeaseError)throw new ManagerSuccessorError(
        error.code==="CURRENT_HUMAN_MUTATION_KEY_CONFLICT"?"MANAGER_SUCCESSOR_KEY_CONFLICT":"MANAGER_SUCCESSOR_RETRY_REQUIRED",
        error.code==="CURRENT_HUMAN_MUTATION_KEY_CONFLICT"?409:503);
      if(error instanceof AccessPolicyError)throw new ManagerSuccessorError("MANAGER_SUCCESSOR_TARGET_MISMATCH",409);
      throw new ManagerSuccessorError("MANAGER_SUCCESSOR_RETRY_REQUIRED",503);
    }
  }

  private async priorManagerSuccessor(repo:AccessRepository,doc:ManagerSuccessorDocument,digest:string):Promise<AccessReceipt|null>{
    const event=await repo.keyedEvent(doc.target.workspace_id,managerSuccessorKey(doc.target.workspace_id,doc.successor_id));
    if(!event)return null;
    if(event.source!==MANAGER_SUCCESSOR_SCHEMA||event.request_digest!==digest||event.operation!=="POLICY_INSTALL")
      throw new ManagerSuccessorError("MANAGER_SUCCESSOR_KEY_CONFLICT");
    return event.receipt;
  }

  private async installManagerSuccessorOn(db:PoolClient,doc:ManagerSuccessorDocument,pin:ManagerSuccessorPin,
    digest:string,write:boolean):Promise<AccessReceipt|null>{
    const t=doc.target;
    await db.query("SET LOCAL lock_timeout='1500ms'; SET LOCAL statement_timeout='5000ms'");
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`portal-access-v2:${t.workspace_id}`]);
    await this.assertManagerTarget(db,t);
    const repo=new AccessRepository(db),prior=await this.priorManagerSuccessor(repo,doc,digest);
    if(prior)return prior;
    const anchor=(await db.query("SELECT user_id FROM portal_owner_anchor WHERE anchor_id='PORTAL_OWNER' FOR SHARE NOWAIT")).rows[0]?.user_id;
    if(anchor!==t.protected_owner_user_id)throw new ManagerSuccessorError("MANAGER_SUCCESSOR_TARGET_MISMATCH");
    const current=await repo.policy(t.workspace_id,true),stored=await repo.storedGrants(t.workspace_id),now=await this.now(db);
    const plan=planManagerSuccessor(doc,current,stored.map(r=>r.fact),now,pin);
    if(plan.policyChanged&&await repo.policyInstall(t.workspace_id,doc.policy.revision))
      throw new ManagerSuccessorError("MANAGER_SUCCESSOR_REVISION_CONFLICT");
    const ids=[...new Set([anchor,...t.principal_workspace_pins.map(p=>p.user_id)])].sort();
    const users=await db.query(`SELECT user_id,status,must_change_password,archived_at FROM portal_users
      WHERE user_id=ANY($1::text[]) ORDER BY user_id FOR SHARE NOWAIT`,[ids]);
    if(users.rows.length!==ids.length||users.rows.some(u=>u.status!=="ACTIVE"||u.must_change_password||u.archived_at))
      throw new ManagerSuccessorError("MANAGER_SUCCESSOR_TARGET_MISMATCH");
    for(const p of t.principal_workspace_pins){
      const ws=await db.query("SELECT workspace_id FROM workspaces WHERE workspace_id=$1 FOR SHARE NOWAIT",[p.workspace_id]);
      const member=await db.query("SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 FOR SHARE NOWAIT",[p.workspace_id,p.user_id]);
      if(ws.rowCount!==1||member.rowCount!==1)throw new ManagerSuccessorError("MANAGER_SUCCESSOR_TARGET_MISMATCH");
    }
    if(!write)return null;
    if(plan.policyChanged)await repo.putPolicy(doc.policy);
    for(const g of plan.grants)await repo.saveManagerDomainGrant(g,true);
    const receipt:AccessReceipt={schema_version:"portal.access-operation.v1",operation_id:randomId("ace"),proposal_id:null,grant_id:null,
      outcome:"APP_APPLIED",http_status:200,reason_code:null,policy_revision:doc.policy.revision,grant_revision:null,
      decided_at_ms:now,ts_authority:"NOT_REQUIRED"};
    await repo.event({event_id:receipt.operation_id,workspace_id:t.workspace_id,actor_user_id:anchor,subject_user_id:null,
      operation:"POLICY_INSTALL",key_digest:managerSuccessorKey(t.workspace_id,doc.successor_id),request_digest:digest,
      policy_revision:doc.policy.revision,grant_id:null,proposal_id:null,source:MANAGER_SUCCESSOR_SCHEMA,source_receipt_id:doc.successor_id,
      before_fact:{policy:current,predecessors:doc.grants.map(e=>({grant_id:e.predecessor_grant_id,revision:e.expected_revision,digest:e.expected_digest}))},
      after_fact:{policy:doc.policy,approval_ref:doc.approval_ref,provenance_ref:doc.provenance_ref,artifact_sha256:pin.approved_sha256,
        successor_grants:plan.grants.map(g=>({grant_id:g.grant_id,revision:g.revision,digest:accessDigest(g)}))},receipt});
    // Authorize and apply do not reuse an earlier snapshot clock across locks
    // or inserts. If the operator window expires here, all writes roll back.
    assertSuccessorWindow(pin,await this.now(db));
    return receipt;
  }

  /** PRIVATE remove-only revoke of NATIVE manager-domain grants (READ `business.read_all`
   * and STREAM `stream.subscribe` are revocable separately, by exact grant identity).
   * Same trust, coordinator, immutable audit table and advisory/authority locks as the
   * installer; no route, session, SQL or legacy-grant path. The ONLY accepted input is a
   * token minted by readPinnedManagerRevoke. Applies atomically: either every item is
   * revoked/narrowed or no-op'd with its receipt, or nothing changes. Exact replay of the
   * same revocation_id returns the original receipts without writing. */
  async revokeReviewedManagerDomainGrants(input:unknown):Promise<readonly ManagerRevokeReceipt[]>{
    const token=verifiedManagerRevoke(input);
    if(!token||!this.authorityMutations)throw new ManagerRevokeError("MANAGER_REVOKE_ARTIFACT_REFUSED",503);
    const doc=token.document,t=doc.target,requestDigest=managerRevokeRequestDigest(doc);
    try{
      const prior=await withTransaction(this.pool,async db=>{
        await db.query("SET TRANSACTION READ ONLY");
        await this.assertManagerRevokeTarget(db,t);
        return this.priorManagerRevoke(new AccessRepository(db),doc,requestDigest);
      });
      if(prior)return prior; // immutable historical receipts, never a repair/re-apply
      const subjects=new Set<string>();
      const receipts=await this.authorityMutations.executeVerified({family:"REVIEWED_POLICY",operation:"REVOKE_MANAGER_GRANT",
        key_digest:managerRevokeIntentKey(t.workspace_id,doc.revocation_id),request_digest:requestDigest,target_id:t.workspace_id},{
        retain_after_application_rollback:true,
        authorize:async db=>{await this.revokeManagerDomainOn(db,doc,requestDigest,false);},
        apply:db=>this.revokeManagerDomainOn(db,doc,requestDigest,true,subjects),
        terminal:receipts=>({outcome:"APPLIED",receipt_ref:accessDigest(receipts.map(r=>r.receipt_id)),reason_code:null}),
      });
      // Committed. In-process stream hint for each grantee whose grant was revoked or narrowed. The official CLI runs in its own
      // process with no stream listener, so there this is a no-op and a running server relies on its per-poll recheck (BE-P18).
      for(const subject of subjects)hintUserAuthorityChanged(this.auth,subject);
      return receipts;
    }catch(error){throw this.managerRevokeFailure(error);}
  }

  private managerRevokeFailure(error:unknown):unknown{
    if(error instanceof ManagerRevokeError)return error;
    if(error instanceof AccessPolicyError)return new ManagerRevokeError(
      error.code==="RECEIPT_BINDING_MISMATCH"?"MANAGER_REVOKE_TARGET_MISMATCH":"MANAGER_REVOKE_ARTIFACT_REFUSED",error.status);
    if(error instanceof CurrentHumanLeaseError){
      if(error.code==="CURRENT_HUMAN_MUTATION_KEY_CONFLICT"||error.code==="CURRENT_HUMAN_MUTATION_PREVIOUSLY_REFUSED")
        return new ManagerRevokeError("MANAGER_REVOKE_KEY_CONFLICT",409);
      // Open drain, unresolved/UNKNOWN native custody or an uncertain earlier outcome:
      // the SAME artifact is retried after the custody settles. Nothing is forced.
      return new ManagerRevokeError("MANAGER_REVOKE_DRAIN_PENDING",503);
    }
    const pgCode=(error as {code?:unknown}|null)?.code;
    if(typeof pgCode==="string"&&["55P03","57014","40001","40P01"].includes(pgCode))
      return new ManagerRevokeError("MANAGER_REVOKE_RETRY_REQUIRED",503);
    return error;
  }

  private async assertManagerRevokeTarget(db:PoolClient,t:ManagerRevokeDocument["target"]):Promise<void>{
    try{await this.assertManagerTarget(db,t);}
    catch{throw new ManagerRevokeError("MANAGER_REVOKE_TARGET_MISMATCH",409);}
  }

  /** The audit rows already written for EXACTLY this artifact, or null if none. */
  private async priorManagerRevoke(repo:AccessRepository,doc:ManagerRevokeDocument,requestDigest:string):Promise<ManagerRevokeReceipt[]|null>{
    const found:AccessEvent[]=[];
    for(const entry of doc.items){
      const event=await repo.keyedEvent(doc.target.workspace_id,managerRevokeItemKey(doc.target.workspace_id,doc.revocation_id,entry.grant_id));
      if(event)found.push(event);
    }
    if(found.length===0)return null;
    if(found.length!==doc.items.length||found.some(event=>event.operation!=="REVOKE"||event.source!==MANAGER_REVOKE_EVENT_SOURCE||
      event.request_digest!==requestDigest))throw new ManagerRevokeError("MANAGER_REVOKE_KEY_CONFLICT",409);
    return found.map(event=>({...(event.after_fact as {receipt:ManagerRevokeReceipt}).receipt,replayed:true}));
  }

  private async revokeManagerDomainOn(db:PoolClient,doc:ManagerRevokeDocument,requestDigest:string,write:boolean,subjects?:Set<string>):Promise<ManagerRevokeReceipt[]>{
    const t=doc.target;
    await db.query("SET LOCAL lock_timeout='1500ms'");
    await db.query("SET LOCAL statement_timeout='5000ms'");
    // SAME key the current-human readers try-lock: a concurrent read either
    // finished before this revoke or fails closed (409 retry) while it holds.
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`portal-access-v2:${t.workspace_id}`]);
    await this.assertManagerRevokeTarget(db,t);
    const repo=new AccessRepository(db),prior=await this.priorManagerRevoke(repo,doc,requestDigest);
    if(prior)return prior;
    const anchor=(await db.query("SELECT user_id FROM portal_owner_anchor WHERE anchor_id='PORTAL_OWNER' FOR SHARE NOWAIT")).rows[0]?.user_id;
    if(anchor!==t.protected_owner_user_id)throw new ManagerRevokeError("MANAGER_REVOKE_TARGET_MISMATCH",409);
    const policy=await repo.policy(t.workspace_id,true);
    if(!policy||policy.state!=="REVIEWED"||policy.qualification!=="OWNER_VERIFIED"||policy.protected_owner_user_id!==anchor||
      policy.workspace_id!==t.workspace_id)throw new ManagerRevokeError("MANAGER_REVOKE_NOT_COMMISSIONED",409);
    const now=await this.now(db);
    const plan=planManagerRevoke(await repo.storedGrants(t.workspace_id),doc,{workspace_id:t.workspace_id,
      protected_owner_user_id:anchor,now_ms:now,newRevision:()=>randomId("acr")});
    const receipts:ManagerRevokeReceipt[]=[];
    for(const step of plan){
      const effective=step.after??step.before,receiptId=randomId("ace");
      const receipt:ManagerRevokeReceipt={schema_version:MANAGER_REVOKE_RECEIPT_SCHEMA,revocation_id:doc.revocation_id,receipt_id:receiptId,
        grant_id:step.before.grant_id,action:step.before.action,mode:step.item.mode,outcome:step.outcome,
        grant_revision_before:step.before.revision,grant_revision_after:effective.revision,
        valid_until_ms_before:step.before.valid_until_ms,valid_until_ms_after:effective.valid_until_ms,
        revoked_at_ms:effective.revoked_at_ms,policy_revision:policy.revision,decided_at_ms:now,replayed:false};
      receipts.push(receipt);
      if(!write)continue;
      if(step.after){await repo.saveManagerDomainGrant(step.after,false);subjects?.add(step.before.subject_user_id);}
      const access:AccessReceipt={schema_version:"portal.access-operation.v1",operation_id:receiptId,proposal_id:null,
        grant_id:step.before.grant_id,outcome:step.after?"REVOKED":"DENIED",http_status:200,reason_code:step.outcome,
        policy_revision:policy.revision,grant_revision:effective.revision,decided_at_ms:now,ts_authority:"NOT_REQUIRED"};
      // Immutable audit row (the table forbids UPDATE/DELETE). Reviewed public
      // facts only: grant identity, domain hashes, windows; never a secret.
      await repo.event({event_id:receiptId,workspace_id:t.workspace_id,actor_user_id:anchor,subject_user_id:step.before.subject_user_id,
        operation:"REVOKE",key_digest:managerRevokeItemKey(t.workspace_id,doc.revocation_id,step.before.grant_id),
        request_digest:requestDigest,policy_revision:policy.revision,grant_id:step.before.grant_id,proposal_id:null,
        source:MANAGER_REVOKE_EVENT_SOURCE,source_receipt_id:`${doc.revocation_id}:${step.before.grant_id}`,
        before_fact:step.before,after_fact:{grant:effective,outcome:step.outcome,mode:step.item.mode,reason:doc.reason,
          approval_ref:doc.approval_ref,provenance_ref:doc.provenance_ref,receipt},receipt:access});
    }
    return receipts;
  }

  /** A historical ACK must still originate from the exact reviewed database/login. */
  private async assertManagerCommissioningTarget(db:PoolClient,artifact:ReviewedPolicyArtifact):Promise<void>{
    return this.assertManagerTarget(db,artifact.manager_commissioning_target!);
  }
  private async assertManagerTarget(db:PoolClient,t:{database_name:string;database_system_identifier:string;role_name:string}):Promise<void>{
    const target=(await db.query(`SELECT current_database() AS db,session_user AS login,current_user AS role,
      (pg_control_system()).system_identifier::text AS system_identifier`)).rows[0];
    if(!target||target.db!==t.database_name||target.login!==t.role_name||target.role!==t.role_name||
      target.system_identifier!==t.database_system_identifier)throw new AccessPolicyError("RECEIPT_BINDING_MISMATCH",409);
  }

  /** No public writer. Install only a verified owner-reviewed artifact, never a migration default. */
  async installReviewedPolicy(input:unknown):Promise<void> {
    const verified=await this.trust.verifyPolicy(input);
    if(!verified||verified.policy.state!=="REVIEWED"||!(verified.policy.qualification==="OWNER_VERIFIED"||
      this.allowTestOnly&&verified.policy.qualification==="TEST_ONLY")||!verified.policy.approval_ref||!verified.provenance_ref)
      throw new AccessPolicyError("RECEIPT_NOT_QUALIFIED",503);
    // Detach the verified artifact before any Core await; verifier-owned JS
    // objects are not mutable authority inside an installation transaction.
    const artifact=structuredClone(verified);
    if(Object.hasOwn(artifact,"manager_domain_grants")||Object.hasOwn(artifact,"manager_commissioning_target"))
      throw new AccessPolicyError("RECEIPT_BINDING_MISMATCH",409);
    if(!reviewedAccessPolicy.safeParse(artifact.policy).success||artifact.root_grants.length>10000||
      artifact.root_grants.some(g=>!scopedAccessGrant.safeParse(g).success))throw new AccessPolicyError("RECEIPT_BINDING_MISMATCH",409);
    if(this.authorityMutations){
      // Install events predate coordinator adoption too. A verified immutable
      // historical ACK must not create a drain/retire leases just to read it.
      const original=await withTransaction(this.pool,async db=>{
        await db.query("SET TRANSACTION READ ONLY");
        return new AccessRepository(db).policyInstall(artifact.policy.workspace_id,artifact.policy.revision);
      });
      if(original){
        if(original.request_digest!==accessDigest(artifact))throw new AccessPolicyError("POLICY_REVISION_CONFLICT",409);
        return;
      }
      try {
        await this.authorityMutations.executeVerified({family:"REVIEWED_POLICY",operation:"INSTALL_POLICY",
          key_digest:accessDigest(["REVIEWED_POLICY",artifact.policy.workspace_id,artifact.policy.revision]),
          request_digest:accessDigest(artifact),target_id:artifact.policy.workspace_id},{
          retain_after_application_rollback:true,
          authorize:async db=>{await this.installReviewedPolicyInTransaction(db,artifact,false);},
          apply:db=>this.installReviewedPolicyInTransaction(db,artifact,true),
          terminal:receipt=>({outcome:"APPLIED",receipt_ref:receipt!.operation_id,reason_code:null}),
        });
      }catch(error){
        if(error instanceof CurrentHumanLeaseError)throw new AccessPolicyError(
          error.code==="CURRENT_HUMAN_MUTATION_KEY_CONFLICT"?"POLICY_REVISION_CONFLICT":"ACCESS_RETRY_REQUIRED",
          error.code==="CURRENT_HUMAN_MUTATION_KEY_CONFLICT"?409:503);
        throw error;
      }
    }else await withTransaction(this.pool,db=>this.installReviewedPolicyInTransaction(db,artifact,true));
  }

  private async installReviewedPolicyInTransaction(db:PoolClient,artifact:ReviewedPolicyArtifact,
    write:boolean):Promise<AccessReceipt|null> {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`portal-access-v2:${artifact.policy.workspace_id}`]);
      const repo=new AccessRepository(db),original=await repo.policyInstall(artifact.policy.workspace_id,artifact.policy.revision);
      // The immutable original event, not the current revision, owns replay.
      // Historical acknowledgement must not restore a superseded policy/root.
      if(original){
        if(original.request_digest!==accessDigest(artifact))throw new AccessPolicyError("POLICY_REVISION_CONFLICT",409);
        return original.receipt;
      }
      const anchor=(await db.query("SELECT user_id FROM portal_owner_anchor WHERE anchor_id='PORTAL_OWNER' FOR SHARE")).rows[0]?.user_id;
      if(anchor!==artifact.policy.protected_owner_user_id) throw new AccessPolicyError("RECEIPT_BINDING_MISMATCH");
      const old=await repo.policy(artifact.policy.workspace_id,true);
      if(old?.revision===artifact.policy.revision)throw new AccessPolicyError("POLICY_REVISION_CONFLICT",409);
      for(const grant of artifact.root_grants){
        if(grant.parent_grant_id!==null||grant.issued_by!==anchor||grant.workspace_id!==artifact.policy.workspace_id||
          grant.policy_revision!==artifact.policy.revision||grant.revoked_at_ms!==null||grant.action==="owner.recovery"||
          tsBusinessAction(grant.action)&&grant.effect==="ALLOW"&&!grant.requires_ts_acceptance||
          grant.requires_ts_acceptance&&(grant.ts_receipt!==null||grant.ts_acceptance_digest!==undefined)||
          grant.action==="audit.read"&&grant.effect==="ALLOW"&&
            (grant.requires_ts_acceptance||(artifact.policy.parent_read_fields??[]).some(seal=>seal.field_policy_ref===grant.field_policy_ref))&&
            !reviewedParentAuditRoot(grant,artifact.policy))
          throw new AccessPolicyError("RECEIPT_BINDING_MISMATCH");
      }
      if(!write)return null;
      // A reviewed revision carries explicit new roots; old-revision grants remain inert history.
      await repo.putPolicy(artifact.policy);
      for(const grant of artifact.root_grants)await repo.saveGrant(grant,true);
      const receipt:AccessReceipt={schema_version:"portal.access-operation.v1",operation_id:randomId("ace"),proposal_id:null,grant_id:null,
        outcome:"APP_APPLIED",http_status:200,reason_code:null,policy_revision:artifact.policy.revision,grant_revision:null,
        decided_at_ms:await this.now(db),ts_authority:"NOT_REQUIRED"};
      await repo.event({event_id:receipt.operation_id,workspace_id:artifact.policy.workspace_id,actor_user_id:anchor,subject_user_id:null,
        operation:"POLICY_INSTALL",key_digest:null,request_digest:accessDigest(artifact),policy_revision:artifact.policy.revision,
        grant_id:null,proposal_id:null,source:null,source_receipt_id:null,before_fact:old,
        after_fact:{policy:artifact.policy,provenance_ref:artifact.provenance_ref,
          root_grant_digests:artifact.root_grants.map(grant=>({grant_id:grant.grant_id,grant_digest:accessDigest(grant)}))},receipt});
      return receipt;
  }

  /** Independently verified reviewed roots have no delegation proposal. This
   * private path does not waive TS acceptance, owner policy or current grants. */
  async acceptRootTsReceipt(input:unknown):Promise<OperationResult> {
    return acceptRootMembershipReceipt(this.pool,this.trust.verifyRootReceipt?.bind(this.trust),input,this.allowTestOnly,this.authorityMutations);
  }

  /** Capture the delegated receipt's exact Core binding separately from source
   * I/O. The locked form is the final DB-only fence, never an adapter callback. */
  private async receiptCoreSnapshot(db:PoolClient,fact:TsMembershipAcceptance,lock=false) {
    const repo=new AccessRepository(db),row=await repo.proposal(fact.workspace_id,fact.proposal_id);
    const policy=await repo.policy(fact.workspace_id,lock),grants=await repo.grants(fact.workspace_id);
    const grant=grants.find(g=>g.grant_id===row?.grant_id);
    if(!row||!grant||!policy||policy.revision!==grant.policy_revision||grant.revoked_at_ms!==null||
      row.state!=="TS_PENDING"&&row.state!=="TS_UNKNOWN"||grants.length>10000||!grant.requires_ts_acceptance)
      throw new AccessPolicyError("RECEIPT_REVISION_CONFLICT",409);
    const principalIds=[...new Set([row.actor_user_id,grant.subject_user_id,
      ...grants.flatMap(g=>[g.issued_by,g.subject_user_id])])].sort();
    const users=await db.query(`SELECT user_id,status,must_change_password,archived_at FROM portal_users
      WHERE user_id=ANY($1::text[]) ORDER BY user_id${lock?" FOR SHARE NOWAIT":""}`,[principalIds]);
    const members=await db.query(`SELECT user_id FROM workspace_members WHERE workspace_id=$1
      AND user_id=ANY($2::text[]) ORDER BY user_id${lock?" FOR SHARE NOWAIT":""}`,[fact.workspace_id,principalIds]);
    const anchor=(await db.query("SELECT user_id FROM portal_owner_anchor WHERE anchor_id='PORTAL_OWNER'"+
      (lock?" FOR SHARE NOWAIT":""))).rows[0]?.user_id;
    const memberIds=new Set<string>(members.rows.map(r=>r.user_id));
    if(anchor===policy.protected_owner_user_id)memberIds.add(anchor);
    const active=new Set<string>(users.rows.filter(u=>u.status==="ACTIVE"&&!u.must_change_password&&
      !u.archived_at&&memberIds.has(u.user_id)).map(u=>u.user_id));
    const authority_fingerprint=accessDigest({policy,grants,principalIds,active:[...active].sort(),anchor,
      proposal:{proposal_id:row.proposal_id,actor_user_id:row.actor_user_id,subject_user_id:row.subject_user_id,
        grant_id:row.grant_id,request_digest:row.request_digest,change:row.change,state:row.state}});
    return {repo,row,policy,grants,grant,principalIds,active,authority_fingerprint};
  }

  /** Qualified internal TS adapter only; pending/rejected/unknown cannot create accepted authority. */
  async acceptTsReceipt(input:unknown):Promise<OperationResult> {
    const verified=await this.trust.verifyReceipt(input);
    if(!verified) throw new AccessPolicyError("RECEIPT_NOT_QUALIFIED",503);
    const parsed=tsMembershipAcceptance.safeParse(verified);
    if(!parsed.success)throw new AccessPolicyError("RECEIPT_BINDING_MISMATCH",409);
    const fact=parsed.data,digest=accessDigest(fact);
    const historical=(prior:AccessEvent|null):OperationResult|null=>{
      if(!prior)return null;
      if(prior.operation!=="TS_RECEIPT"||prior.request_digest!==digest||prior.workspace_id!==fact.workspace_id||
        prior.proposal_id!==fact.proposal_id||prior.subject_user_id!==fact.portal_user_id)
        throw new AccessPolicyError("RECEIPT_PAYLOAD_CONFLICT",409);
      return {receipt:prior.receipt,replayed:true};
    };
    const captured=await withTransaction(this.pool,async db=>{
      await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      await db.query("SET LOCAL statement_timeout='5000ms'");
      const prior=historical(await new AccessRepository(db).sourceEvent(fact.source,fact.receipt_id));
      return prior?{prior,snapshot:null}:{prior:null,snapshot:await this.receiptCoreSnapshot(db,fact)};
    });
    // Immutable source facts can predate the coordinator. Authentication above
    // still applies, but old ACK must not drain unrelated work or regrant.
    if(captured.prior)return captured.prior;
    const prepared=captured.snapshot!;
    const relations=new Map<string,AccessRelations>();
    for(const id of prepared.principalIds)
      relations.set(id,structuredClone(await this.trust.relations(id,fact.workspace_id)));
    const mapping=structuredClone(await this.trust.verifiedHumanMapping(prepared.grant.subject_user_id,fact.workspace_id));
    // These detached reads preserve pre-drain delegation authorization only.
    // They are never claimed as held current-source proof through COMMIT.
    relations.set(prepared.grant.subject_user_id,
      structuredClone(await this.trust.relations(prepared.grant.subject_user_id,fact.workspace_id)));
    const initial:DelegatedReceiptSource={fact,mapping,relations:[...relations].map(([principal_id,relations])=>({principal_id,relations}))};
    // New correspondence observations are not a held through-COMMIT fence.
    // Historical ACKs returned above remain immutable reads; genuinely absent
    // extensions retain legacy compatibility, not a TEST_ONLY bypass.
    if(!this.authorityMutations&&initial.relations.some(entry=>Object.hasOwn(entry.relations,"current_authority")))
      throw new AccessPolicyError("RECEIPT_NOT_QUALIFIED",503);
    const process=async(db:PoolClient,write:boolean,source:DelegatedReceiptSource,guard?:()=>void):Promise<OperationResult|null>=>{
      await db.query("SET LOCAL lock_timeout='1500ms'");
      await db.query("SET LOCAL statement_timeout='5000ms'");
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`portal-access-v2:${fact.workspace_id}`]);
      const repo=new AccessRepository(db),prior=historical(await repo.sourceEvent(fact.source,fact.receipt_id));
      if(prior){guard?.();return prior;}
      const current=await this.receiptCoreSnapshot(db,fact,true);
      if(current.authority_fingerprint!==prepared.authority_fingerprint)
        throw new AccessPolicyError("RECEIPT_REVISION_CONFLICT",409);
      const {row,policy,grants,grant,active}=current;
      const relationMap=new Map(source.relations.map(entry=>[entry.principal_id,entry.relations]));
      const context:AccessEvaluationContext={principal_id:row.actor_user_id,workspace_id:fact.workspace_id,now_ms:await this.now(db),
        actor_current:active.has(row.actor_user_id),policy,grants,active_principals:active,allow_test_only:this.allowTestOnly,
        relationsFor:id=>relationMap.get(id)??{qualified:false,revision:"UNQUALIFIED",own_alpha_ids:[],member_portfolio_ids:[],roots:{},membership:null}};
      const assertCurrent=()=>{
        if(!active.has(grant.subject_user_id)||grant.valid_until_ms!==null&&grant.valid_until_ms<=context.now_ms)
          throw new AccessPolicyError("RECEIPT_REVISION_CONFLICT",409);
        const ceiling=grants.find(g=>g.grant_id===row.change.ceiling_grant_id);
        validateDelegation(context,{...row.change,expected_policy_revision:policy.revision,
          expected_ceiling_revision:ceiling?.revision??row.change.expected_ceiling_revision});
        this.validateTsBinding(fact,row,grant,policy,source.mapping,relationMap.get(grant.subject_user_id),context.now_ms);
        guard?.();
      };
      assertCurrent();
      if(!write)return null;
      const outcome=fact.outcome==="ACCEPTED"?"TS_APPLIED":fact.outcome==="REJECTED"?"TS_REJECTED":"TS_UNKNOWN";
      const updated=fact.outcome==="ACCEPTED"?{...grant,revision:randomId("acr"),ts_acceptance_digest:digest,ts_receipt:{receipt_id:fact.receipt_id,
        membership_revision:fact.membership_revision,mapping_revision:fact.mapping_revision,effective_at_ms:fact.effective_at_ms,
        expires_at_ms:fact.expires_at_ms}}:grant;
      if(fact.outcome==="ACCEPTED")await repo.saveGrant(updated);
      await repo.state(row.proposal_id,outcome);
      const receipt:AccessReceipt={schema_version:"portal.access-operation.v1",operation_id:randomId("ace"),proposal_id:row.proposal_id,
        grant_id:grant.grant_id,outcome,http_status:200,reason_code:null,policy_revision:policy.revision,grant_revision:updated.revision,
        decided_at_ms:await this.now(db),ts_authority:fact.outcome};
      await repo.event({event_id:receipt.operation_id,workspace_id:fact.workspace_id,actor_user_id:null,subject_user_id:grant.subject_user_id,
        operation:"TS_RECEIPT",key_digest:null,request_digest:digest,policy_revision:policy.revision,grant_id:grant.grant_id,
        proposal_id:row.proposal_id,source:fact.source,source_receipt_id:fact.receipt_id,before_fact:grant,
        after_fact:{grant:updated,source_contract:fact.source_contract,trust_profile:fact.trust_profile,
          payload_digest:fact.payload_digest,provenance_ref:fact.provenance_ref},receipt});
      context.now_ms=await this.now(db);assertCurrent();
      return {receipt,replayed:false};
    };
    if(this.authorityMutations)return coordinateDelegatedMembershipReceipt(this.pool,this.authorityMutations,
      this.trust.qualifyDelegatedReceipt?.bind(this.trust),input,
      {workspace_id:fact.workspace_id,subject_user_id:prepared.grant.subject_user_id,principal_ids:prepared.principalIds},initial,process);
    const result=await withTransaction(this.pool,db=>process(db,true,initial));
    if(!result)throw new AccessPolicyError("RECEIPT_NOT_QUALIFIED",503);
    return result;
  }
  private validateTsBinding(fact:TsMembershipAcceptance,row:{actor_user_id:string;request_digest:string;change:GrantChange},
    grant:ScopedAccessGrant,policy:ReviewedAccessPolicy,
    mapping:Awaited<ReturnType<AccessTrustProvider["verifiedHumanMapping"]>>,relations:AccessRelations|undefined,now:number) {
    if(!mapping||!fact.source||!fact.source_contract||!fact.trust_profile||!fact.provenance_ref||!fact.payload_digest||
      fact.proposal_digest!==row.request_digest||fact.portal_user_id!==grant.subject_user_id||fact.ts_user_id!==mapping.ts_user_id||
      fact.mapping_revision!==mapping.revision||fact.human_requester_user_id!==row.actor_user_id||fact.action!==grant.action||
      fact.selector_digest!==accessDigest(canonicalSelector(grant.selector))||
      accessDigest([...fact.environments].sort())!==accessDigest([...grant.environments].sort())||
      fact.previous_membership_revision!==row.change.expected_ts_membership_revision||
      !fact.membership_revision||fact.membership_revision===fact.previous_membership_revision||
      fact.effective_at_ms<grant.valid_from_ms||fact.expires_at_ms!==null&&fact.expires_at_ms<=fact.effective_at_ms||
      grant.valid_until_ms!==null&&(fact.expires_at_ms===null||fact.expires_at_ms>grant.valid_until_ms)||policy.state!=="REVIEWED")
      throw new AccessPolicyError("RECEIPT_BINDING_MISMATCH",409);
    // Never compare opaque revisions lexically; exact current source revision is authoritative.
    if(fact.outcome==="ACCEPTED") {
      // New attachment must be effective at both initial and final DB clocks.
      // The authenticated historical ACK path returns before this check.
      if(fact.effective_at_ms>now||fact.expires_at_ms!==null&&fact.expires_at_ms<=now)
        throw new AccessPolicyError("RECEIPT_BINDING_MISMATCH",409);
      if(relations && Object.hasOwn(relations,"current_authority")) {
        const parsed=currentAccessRelations.safeParse(relations.current_authority);
        if(!relations.qualified || !parsed.success || !currentAcceptanceMatches(fact,grant,parsed.data,now))
          throw new AccessPolicyError("TS_MEMBERSHIP_REVISION_CONFLICT",409);
      } else {
        const current=relations?.membership;
        if(relations?.qualified!==true||!current||current.revision!==fact.membership_revision||current.receipt_id!==fact.receipt_id||
          current.mapping_revision!==fact.mapping_revision) throw new AccessPolicyError("TS_MEMBERSHIP_REVISION_CONFLICT",409);
      }
    }
  }

  async audit(actor:AccessActor,workspace:string,subject:string,limit:number,after?:string) {
    return this.transaction(workspace,actor,false,async tx=>{
      const decision=evaluateAccess(tx.context,"audit.read",{kind:"USER",id:subject},"paper");
      tx.recheck(()=>{
        if(!evaluateAccess(tx.context,"audit.read",{kind:"USER",id:subject},"paper").allowed)
          throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND",404);
      });
      const scope=accessDigest([actor.user_id,actor.session_generation,workspace,subject,decision.policy_revision,decision.scope_revision,limit]);
      const codec=new KeysetCursorCodec({activeKeyId:this.auth.config.QUERY_CURSOR_ACTIVE_KEY_ID,
        keys:querySigningKeys(this.auth.config),ttlSeconds:300,now:()=>Math.floor(tx.context.now_ms/1000)});
      let position:null|{time:string;id:string}=null;
      if(after){
        try{
          const [time,id]=codec.decode(after,{resourceId:"portal-access-audit-v1",workspaceId:workspace,
            direction:"after",queryFingerprint:scope,boundarySize:2});
          if(typeof time!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(time)||typeof id!=="string")throw new Error();
          position={time,id};
        }catch{throw new AccessPolicyError("ACCESS_CURSOR_INVALID",400);}
      }
      const rows=await tx.repo.events(workspace,subject,limit+1,position),page=rows.slice(0,limit);
      const last=page.at(-1);let next:string|null=null;
      if(rows.length>limit&&last){
        next=codec.encode({resource_id:"portal-access-audit-v1",workspace_id:workspace,direction:"after",query_fingerprint:scope,
          boundary:[last.cursor_time!,last.event_id]});
      }
      return {schema_version:"portal.access-audit.v1",workspace_id:workspace,subject_user_id:subject,
        items:page.map(row=>({operation:row.operation,receipt:row.receipt,occurred_at_ms:row.occurred_at.getTime()})),
        next_cursor:next,max_items:100};
    });
  }
}
