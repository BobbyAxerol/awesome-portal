import { Pool, PoolClient } from "pg";
import { AuthService } from "../auth/auth.service";
import { withTransaction } from "../db/pool";
import { randomId } from "../domain";
import { UsersRepository } from "../repos/users";
import { SessionsRepository } from "../repos/sessions";
import { AccountLifecycleRepository } from "../repos/account-lifecycle";
import { CredentialsRepository } from "../repos/credentials";
import { AuditRepository } from "../repos/audit";
import { AccessAction, AccessResource, AccessActor, AccessPolicyError, AccessRefusal, GrantChange, ReviewedAccessPolicy, ScopedAccessGrant,
  TsMembershipAcceptance, tsBusinessAction, reviewedAccessPolicy, scopedAccessGrant, tsMembershipAcceptance } from "./access.contract";
import { AccessEvaluationContext, AccessRelations, accessDigest, canonicalChange, canonicalSelector,
  evaluateAccess, grantCurrent, policyReady, resolvedResources, validateDelegation } from "./access-policy";
import { AccessEvent, AccessReceipt, AccessRepository } from "./access.repository";
import { AccessTrustProvider, unqualifiedAccessTrust } from "./access-trust";
import { KeysetCursorCodec } from "../query/cursor";
import { querySigningKeys } from "../config";
import type { ExecutionReadPublicationRequest } from "./read-publication";

type Tx={db:PoolClient;repo:AccessRepository;context:AccessEvaluationContext;recheck:(check:()=>void)=>void};
type OperationResult={receipt:AccessReceipt;replayed:boolean};

/** One application-policy boundary. Default trust is unqualified and seeds no production rights. */
export class ExecutionAccessService {
  constructor(private readonly pool:Pool,private readonly auth:AuthService,
    private readonly trust:AccessTrustProvider=unqualifiedAccessTrust,
    private readonly allowTestOnly=false) {}

  /** Short consistent capture; no adapter I/O or mutation locks. */
  private async captureReadContext(actor:AccessActor,workspace:string) {
    return withTransaction(this.pool,async db=>{
      await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      await db.query("SET LOCAL statement_timeout='5000ms'");
      const current=await db.query(`SELECT u.user_id,u.session_version,u.role,
        floor(extract(epoch FROM least(s.idle_expires_at,s.absolute_expires_at))*1000)::bigint AS lease_until_ms,
        floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS now_ms
        FROM portal_users u JOIN auth_sessions s ON s.user_id=u.user_id
        WHERE u.user_id=$1 AND u.status='ACTIVE' AND NOT u.must_change_password
          AND u.archived_at IS NULL AND u.session_version=$2 AND s.session_id=$3
          AND s.session_version=u.session_version AND s.state='ACTIVE'
          AND s.idle_expires_at>clock_timestamp() AND s.absolute_expires_at>clock_timestamp()`,
        [actor.user_id,actor.session_generation,actor.session_id]);
      if(current.rowCount!==1)throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED");
      const anchor=(await db.query("SELECT user_id FROM portal_owner_anchor WHERE anchor_id='PORTAL_OWNER'")).rows[0]?.user_id;
      const member=await db.query("SELECT 1 FROM workspace_members WHERE workspace_id=$1 AND user_id=$2",[workspace,actor.user_id]);
      if(!member.rowCount&&anchor!==actor.user_id)throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND",404);
      if(!(await db.query("SELECT 1 FROM workspaces WHERE workspace_id=$1",[workspace])).rowCount)
        throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND",404);
      const repo=new AccessRepository(db),rawPolicy=await repo.policy(workspace),rawGrants=await repo.grants(workspace);
      if(rawGrants.length>10000)throw new AccessPolicyError("ACCESS_SCOPE_LIMIT_EXCEEDED",503);
      const policy=rawPolicy===null?null:reviewedAccessPolicy.parse(rawPolicy);
      const grants=rawGrants.map(g=>scopedAccessGrant.parse(g));
      if(policy&&policy.protected_owner_user_id!==anchor)throw new AccessPolicyError("POLICY_PENDING",503);
      const ids=[...new Set([actor.user_id,anchor,...grants.flatMap(g=>[g.subject_user_id,g.issued_by])].filter((id):id is string=>Boolean(id)))];
      const activeRows=await db.query(`SELECT u.user_id FROM portal_users u
        WHERE u.user_id=ANY($1::text[]) AND u.status='ACTIVE' AND NOT u.must_change_password
          AND u.archived_at IS NULL AND (u.user_id=$3 OR EXISTS(SELECT 1 FROM workspace_members m
            WHERE m.workspace_id=$2 AND m.user_id=u.user_id))`,[ids,workspace,anchor??null]);
      const active=activeRows.rows.map(r=>String(r.user_id)).sort();
      const fact={policy,grants,ids:ids.sort(),active,anchor,actor_role:current.rows[0].role as "ADMIN"|"USER",
        actor_member:Boolean(member.rowCount)};
      const now=Number((await db.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0].ms);
      if(now>=Number(current.rows[0].lease_until_ms))throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED");
      return {...fact,now,authority_fingerprint:accessDigest(fact)};
    });
  }

  /** Current context, freshly fenced AFTER adapter I/O. Never cache it as an
   * entitlement; delivery re-evaluates it after its own last source/cache await. */
  async readContext(actor:AccessActor,workspace:string):Promise<AccessEvaluationContext> {
    const captured=await this.captureReadContext(actor,workspace);
    // Qualified relations may come from an adapter. All DB locks/connections
    // above have been released before awaiting it.
    const relationMap=new Map<string,AccessRelations>();
    for(const id of captured.ids)relationMap.set(id,structuredClone(await this.trust.relations(id,workspace)));
    const current=await this.captureReadContext(actor,workspace);
    if(current.authority_fingerprint!==captured.authority_fingerprint)
      throw new AccessPolicyError("ACCESS_RETRY_REQUIRED",409);
    return {principal_id:actor.user_id,workspace_id:workspace,now_ms:current.now,actor_current:true,
      authority_fingerprint:current.authority_fingerprint,actor_role:current.actor_role,
      policy:current.policy,grants:current.grants,active_principals:new Set(current.active),
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
    return {...expected,now_ms:current.now,actor_role:current.actor_role,actor_current:true};
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
    check:(now:number)=>void,fn:(db:PoolClient)=>Promise<T>):Promise<T> {
    if(expected.principal_id!==actor.user_id||expected.workspace_id!==workspace||!expected.authority_fingerprint)
      throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED");
    return this.transaction(workspace,actor,true,async tx=>{
      tx.recheck(()=>{
        if(accessDigest([tx.context.policy,tx.context.grants])!==accessDigest([expected.policy,expected.grants]))
          throw new AccessPolicyError("ACCESS_RETRY_REQUIRED",409);
        const decision=evaluateAccess(tx.context,action,resource,environment);
        if(!decision.allowed)throw new AccessPolicyError(decision.reason_code??"ACCESS_DENIED");
        check(tx.context.now_ms);
      });
      return fn(tx.db);
    },[],expected);
  }

  private async transaction<T>(workspace:string,actor:AccessActor,stepUp:boolean,fn:(tx:Tx)=>Promise<T>,extraPrincipals:string[]=[],captured?:AccessEvaluationContext):Promise<T> {
    try {
      return await withTransaction(this.pool,async db=>{
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
        if(!await db.query("SELECT 1 FROM workspaces WHERE workspace_id=$1",[workspace]).then(r=>r.rowCount))
          throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND",404);
        if(stepUp && !await lifecycle.lockActiveStepUpExpiry(actor.session_id,user.userId)) throw new AccessPolicyError("STEP_UP_REQUIRED");
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
        const relationMap=new Map<string,AccessRelations>();
        for(const id of principals) relationMap.set(id,captured?captured.relationsFor(id!):await this.trust.relations(id!,workspace));
        const now=await this.now(db);
        const context:AccessEvaluationContext={principal_id:actor.user_id,workspace_id:workspace,now_ms:now,
          actor_current:true,actor_role:user.role,policy,grants,active_principals:active,allow_test_only:this.allowTestOnly,
          relationsFor:id=>relationMap.get(id)??{qualified:false,revision:"UNQUALIFIED",own_alpha_ids:[],member_portfolio_ids:[],roots:{},membership:null}};
        const checks:Array<()=>void>=[];
        const result=await fn({db,repo,context,recheck:check=>{check();checks.push(check);}});
        // Row locks prevent revoke/generation races, not wall-clock expiry while awaiting work.
        if(!await sessions.lockActiveLease(actor.session_id,user.userId,user.sessionVersion))
          throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED");
        if(stepUp && !await lifecycle.lockActiveStepUpExpiry(actor.session_id,user.userId)) throw new AccessPolicyError("STEP_UP_REQUIRED");
        context.now_ms=await this.now(db);
        for(const check of checks)check();
        return result;
      });
    } catch(error) {
      if(stepUp && error instanceof AccessPolicyError) {
        // The transaction is already rolled back. Log only a current stable
        // actor and a typed refusal; no target/key/password or authority seed.
        await this.recordRefusal(actor,error);
      }
      if(error && typeof error==="object" && "code" in error && ["55P03","40P01","57014"].includes(String(error.code)))
        throw new AccessPolicyError("ACCESS_RETRY_REQUIRED",409);
      throw error;
    }
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
          try {const resources=resolvedResources(g.selector,context.relationsFor(g.subject_user_id));
            return resources.length>0&&resources.every(r=>g.environments.every(env=>evaluateAccess(context,g.action,r,env).allowed));
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
  async propose(actor:AccessActor,workspace:string,change:GrantChange,previewDigest:string,key:string):Promise<OperationResult> {
    const result=await this.transaction(workspace,actor,true,async tx=>{
      const digest=this.changeDigest(actor,workspace,change),keyDigest=accessDigest(["PROPOSE",key]);
      // Validate current authority before even exposing an immutable earlier receipt.
      const currentCeiling=tx.context.grants.find(g=>g.grant_id===change.ceiling_grant_id);
      tx.recheck(()=>validateDelegation(tx.context,{...change,expected_policy_revision:tx.context.policy?.revision??change.expected_policy_revision,
        expected_ceiling_revision:currentCeiling?.revision??change.expected_ceiling_revision}));
      const prior=await tx.repo.keyedEvent(workspace,keyDigest);
      if(prior) return this.replay(prior,actor,digest);
      // All business refusals precede writes. Store the original outcome instead
      // of allowing the same key to become a later, different successful intent.
      try{
        validateDelegation(tx.context,change);
        const preview=this.previewResult(tx.context,actor,change);
        if(previewDigest!==digest) throw new AccessPolicyError("POLICY_REVISION_CONFLICT",409);
        if(!preview.allowed) throw new AccessPolicyError(preview.reason_code!,preview.reason_code==="ACCESS_RESOURCE_NOT_FOUND"?404:
          preview.reason_code==="TS_MEMBERSHIP_REVISION_CONFLICT"?409:403);
        const target=(await tx.db.query(`SELECT user_id FROM portal_users WHERE user_id=$1 AND status='ACTIVE'
          AND NOT must_change_password AND archived_at IS NULL FOR SHARE NOWAIT`,[change.subject_user_id])).rows[0];
        const targetMembership=await tx.db.query("SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 FOR SHARE NOWAIT",[workspace,change.subject_user_id]);
        if(!target || !targetMembership.rowCount) throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND",404);
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
    },[change.subject_user_id]);
    if(result.receipt.outcome==="DENIED")throw new AccessPolicyError(result.receipt.reason_code as "ACCESS_DENIED",result.receipt.http_status);
    return result;
  }
  private replay(prior:AccessEvent,actor:AccessActor,digest:string):OperationResult {
    if(prior.actor_user_id!==actor.user_id||prior.request_digest!==digest) throw new AccessPolicyError("IDEMPOTENCY_KEY_PAYLOAD_CONFLICT",409);
    if(prior.receipt.outcome==="DENIED") throw new AccessPolicyError(prior.receipt.reason_code as "ACCESS_DENIED",prior.receipt.http_status);
    return {receipt:prior.receipt,replayed:true};
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
  async revoke(actor:AccessActor,workspace:string,id:string,policyRevision:string,grantRevision:string,key:string,reason="Access revoked."):Promise<OperationResult> {
    return this.transaction(workspace,actor,true,async tx=>{
      const grant=tx.context.grants.find(g=>g.grant_id===id);
      if(!grant) throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND",404);
      if(grant.subject_user_id===actor.user_id) throw new AccessPolicyError("SELF_PRIVILEGE_CHANGE_DENIED");
      if(grant.subject_user_id===tx.context.policy?.protected_owner_user_id) throw new AccessPolicyError("PROTECTED_OWNER_CHANGE_DENIED");
      if(!policyReady(tx.context)) throw new AccessPolicyError("POLICY_PENDING");
      this.assertConstraintRemoval(tx.context,actor,grant);
      tx.recheck(()=>{
        const resources=resolvedResources(grant.selector,tx.context.relationsFor(grant.subject_user_id));
        if(!resources.length)throw new AccessPolicyError("ACCESS_DENIED");
        for(const resource of resources) for(const environment of grant.environments)
          if(!evaluateAccess(tx.context,"access.revoke",resource,environment).allowed)throw new AccessPolicyError("ACCESS_DENIED");
      });
      const digest=accessDigest([actor.user_id,workspace,id,policyRevision,grantRevision,reason]),keyDigest=accessDigest(["REVOKE",key]);
      const prior=await tx.repo.keyedEvent(workspace,keyDigest);
      if(prior) return this.replay(prior,actor,digest);
      if(tx.context.policy!.revision!==policyRevision) throw new AccessPolicyError("POLICY_REVISION_CONFLICT",409);
      if(grant.revision!==grantRevision||grant.revoked_at_ms!==null) throw new AccessPolicyError("GRANT_REVISION_CONFLICT",409);
      const updated={...grant,revision:randomId("acr"),revoked_at_ms:tx.context.now_ms};
      const receipt=this.receipt(tx.context,{grant_id:id,outcome:"REVOKED",http_status:200,grant_revision:updated.revision,
        ts_authority:grant.requires_ts_acceptance?"UNKNOWN":"NOT_REQUIRED"});
      await tx.repo.saveGrant(updated);await tx.repo.revokeProposals(id);
      await this.event(tx,actor,"REVOKE",digest,receipt,{key_digest:keyDigest,subject_user_id:grant.subject_user_id,before_fact:grant,after_fact:{grant:updated,reason}});
      return {receipt,replayed:false};
    });
  }

  /** Advisory revoke diff; hidden and unknown grants share the same public404. */
  async previewRevoke(actor:AccessActor,workspace:string,id:string,policyRevision:string,grantRevision:string,reason:string) {
    return this.transaction(workspace,actor,false,async tx=>{
      const grant=tx.context.grants.find(g=>g.grant_id===id);
      if(!grant||!policyReady(tx.context))throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND",404);
      tx.recheck(()=>{
        const resources=resolvedResources(grant.selector,tx.context.relationsFor(grant.subject_user_id));
        if(!resources.length||!resources.every(r=>grant.environments.every(env=>evaluateAccess(tx.context,"access.revoke",r,env).allowed)))
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

  /** Delegated users prove their own current password, not owner authority. It grants no capability. */
  async stepUp(actor:AccessActor,workspace:string,password:string) {
    try {
    const credential=await this.auth.credentials.findPassword(actor.user_id);
    const valid=credential?await this.auth.argon2.verify(credential.passwordHash,password):false;
    if(!credential) await this.auth.argon2.verifyAgainstDecoy();
    if(!valid) throw new AccessPolicyError("STEP_UP_REJECTED");
    return await this.transaction(workspace,actor,false,async tx=>{
      if(!policyReady(tx.context)||!tx.context.grants.some(g=>g.subject_user_id===actor.user_id&&
        g.effect==="ALLOW"&&(g.action==="access.grant"||g.action==="access.revoke")&&grantCurrent(g,tx.context))) throw new AccessPolicyError("ACCESS_DENIED");
      const current=await new CredentialsRepository(tx.db).findPassword(actor.user_id);
      if(!current||current.passwordHash!==credential!.passwordHash) throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED");
      const expiry=await new AccountLifecycleRepository(tx.db).grantStepUp({stepUpId:randomId("stp"),sessionId:actor.session_id,
        userId:actor.user_id,ttlSeconds:this.auth.config.OWNER_STEP_UP_TTL_SECONDS});
      const receipt=this.receipt(tx.context,{outcome:"APP_APPLIED",http_status:200});
      await this.event(tx,actor,"STEP_UP",accessDigest([actor.user_id,workspace,"PASSWORD_VERIFIED"]),receipt,{subject_user_id:actor.user_id});
      return {schema_version:"portal.access-step-up.v1",state:"ACTIVE",expires_at_ms:expiry.getTime()};
    });
    } catch(error) {
      if(error instanceof AccessPolicyError)await this.recordRefusal(actor,error);
      throw error;
    }
  }

  /** No public writer. Install only a verified owner-reviewed artifact, never a migration default. */
  async installReviewedPolicy(input:unknown):Promise<void> {
    const artifact=await this.trust.verifyPolicy(input);
    if(!artifact||artifact.policy.state!=="REVIEWED"||!(artifact.policy.qualification==="OWNER_VERIFIED"||
      this.allowTestOnly&&artifact.policy.qualification==="TEST_ONLY")||!artifact.policy.approval_ref||!artifact.provenance_ref)
      throw new AccessPolicyError("RECEIPT_NOT_QUALIFIED",503);
    if(!reviewedAccessPolicy.safeParse(artifact.policy).success||artifact.root_grants.length>10000||
      artifact.root_grants.some(g=>!scopedAccessGrant.safeParse(g).success))throw new AccessPolicyError("RECEIPT_BINDING_MISMATCH",409);
    await withTransaction(this.pool,async db=>{
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`portal-access-v2:${artifact.policy.workspace_id}`]);
      const anchor=(await db.query("SELECT user_id FROM portal_owner_anchor WHERE anchor_id='PORTAL_OWNER' FOR SHARE")).rows[0]?.user_id;
      if(anchor!==artifact.policy.protected_owner_user_id) throw new AccessPolicyError("RECEIPT_BINDING_MISMATCH");
      const repo=new AccessRepository(db),old=await repo.policy(artifact.policy.workspace_id,true);
      if(old?.revision===artifact.policy.revision){
        const original=await repo.policyInstall(artifact.policy.workspace_id,artifact.policy.revision);
        if(accessDigest(old)!==accessDigest(artifact.policy)||original?.request_digest!==accessDigest(artifact))
          throw new AccessPolicyError("POLICY_REVISION_CONFLICT",409);
        return;
      }
      // A reviewed revision carries explicit new roots; old-revision grants remain inert history.
      await repo.putPolicy(artifact.policy);
      for(const grant of artifact.root_grants){
        if(grant.parent_grant_id!==null||grant.issued_by!==anchor||grant.workspace_id!==artifact.policy.workspace_id||
          grant.policy_revision!==artifact.policy.revision||grant.revoked_at_ms!==null||grant.action==="owner.recovery"||
          tsBusinessAction(grant.action)&&grant.effect==="ALLOW"&&(!grant.requires_ts_acceptance||grant.ts_receipt!==null))
          throw new AccessPolicyError("RECEIPT_BINDING_MISMATCH");
        await repo.saveGrant(grant,true);
      }
      const receipt:AccessReceipt={schema_version:"portal.access-operation.v1",operation_id:randomId("ace"),proposal_id:null,grant_id:null,
        outcome:"APP_APPLIED",http_status:200,reason_code:null,policy_revision:artifact.policy.revision,grant_revision:null,
        decided_at_ms:await this.now(db),ts_authority:"NOT_REQUIRED"};
      await repo.event({event_id:receipt.operation_id,workspace_id:artifact.policy.workspace_id,actor_user_id:anchor,subject_user_id:null,
        operation:"POLICY_INSTALL",key_digest:null,request_digest:accessDigest(artifact),policy_revision:artifact.policy.revision,
        grant_id:null,proposal_id:null,source:null,source_receipt_id:null,before_fact:old,after_fact:{policy:artifact.policy,provenance_ref:artifact.provenance_ref},receipt});
    });
  }

  /** Qualified internal TS adapter only; pending/rejected/unknown cannot create accepted authority. */
  async acceptTsReceipt(input:unknown):Promise<OperationResult> {
    const fact=await this.trust.verifyReceipt(input);
    if(!fact) throw new AccessPolicyError("RECEIPT_NOT_QUALIFIED",503);
    if(!tsMembershipAcceptance.safeParse(fact).success)throw new AccessPolicyError("RECEIPT_BINDING_MISMATCH",409);
    return withTransaction(this.pool,async db=>{
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`portal-access-v2:${fact.workspace_id}`]);
      const repo=new AccessRepository(db),prior=await repo.sourceEvent(fact.source,fact.receipt_id);
      const digest=accessDigest(fact);
      if(prior){if(prior.request_digest!==digest)throw new AccessPolicyError("RECEIPT_PAYLOAD_CONFLICT",409);return {receipt:prior.receipt,replayed:true};}
      const row=await repo.proposal(fact.workspace_id,fact.proposal_id),policy=await repo.policy(fact.workspace_id,true);
      const grants=await repo.grants(fact.workspace_id),grant=grants.find(g=>g.grant_id===row?.grant_id);
      if(!row||!grant||!policy||policy.revision!==grant.policy_revision||grant.revoked_at_ms!==null||row.state!=="TS_PENDING"&&row.state!=="TS_UNKNOWN")
        throw new AccessPolicyError("RECEIPT_REVISION_CONFLICT",409);
      if(grants.length>10000||!grant.requires_ts_acceptance)throw new AccessPolicyError("RECEIPT_REVISION_CONFLICT",409);
      const principalIds=[...new Set([row.actor_user_id,grant.subject_user_id,...grants.flatMap(g=>[g.issued_by,g.subject_user_id])])];
      const users=await db.query("SELECT user_id,status,must_change_password,archived_at FROM portal_users WHERE user_id=ANY($1::text[]) FOR SHARE NOWAIT",[principalIds]);
      const members=await db.query("SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND user_id=ANY($2::text[]) FOR SHARE NOWAIT",[fact.workspace_id,principalIds]);
      const anchor=(await db.query("SELECT user_id FROM portal_owner_anchor WHERE anchor_id='PORTAL_OWNER' FOR SHARE")).rows[0]?.user_id;
      const memberIds=new Set(members.rows.map(r=>r.user_id));if(anchor===policy.protected_owner_user_id)memberIds.add(anchor);
      const active=new Set<string>(users.rows.filter(u=>u.status==="ACTIVE"&&!u.must_change_password&&!u.archived_at&&memberIds.has(u.user_id)).map(u=>u.user_id));
      const relations=new Map<string,AccessRelations>();
      for(const id of principalIds)relations.set(id,await this.trust.relations(id,fact.workspace_id));
      const context:AccessEvaluationContext={principal_id:row.actor_user_id,workspace_id:fact.workspace_id,now_ms:await this.now(db),
        actor_current:active.has(row.actor_user_id),policy,grants,active_principals:active,allow_test_only:this.allowTestOnly,
        relationsFor:id=>relations.get(id)??{qualified:false,revision:"UNQUALIFIED",own_alpha_ids:[],member_portfolio_ids:[],roots:{},membership:null}};
      const assertCurrent=()=>{
        if(!active.has(grant.subject_user_id)||grant.valid_until_ms!==null&&grant.valid_until_ms<=context.now_ms)
          throw new AccessPolicyError("RECEIPT_REVISION_CONFLICT",409);
        const ceiling=grants.find(g=>g.grant_id===row.change.ceiling_grant_id);
        validateDelegation(context,{...row.change,expected_policy_revision:policy.revision,
          expected_ceiling_revision:ceiling?.revision??row.change.expected_ceiling_revision});
      };
      assertCurrent();
      await this.validateTsBinding(fact,row,grant,policy);
      const outcome=fact.outcome==="ACCEPTED"?"TS_APPLIED":fact.outcome==="REJECTED"?"TS_REJECTED":"TS_UNKNOWN";
      const updated=fact.outcome==="ACCEPTED"?{...grant,revision:randomId("acr"),ts_receipt:{receipt_id:fact.receipt_id,
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
    });
  }
  private async validateTsBinding(fact:TsMembershipAcceptance,row:{actor_user_id:string;request_digest:string;change:GrantChange},
    grant:ScopedAccessGrant,policy:ReviewedAccessPolicy) {
    const mapping=await this.trust.verifiedHumanMapping(grant.subject_user_id,grant.workspace_id);
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
    const current=(await this.trust.relations(grant.subject_user_id,grant.workspace_id)).membership;
    if(fact.outcome==="ACCEPTED"&&(!current||current.revision!==fact.membership_revision||current.receipt_id!==fact.receipt_id||
      current.mapping_revision!==fact.mapping_revision)) throw new AccessPolicyError("TS_MEMBERSHIP_REVISION_CONFLICT",409);
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
