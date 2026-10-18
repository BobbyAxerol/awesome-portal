import type { Pool } from "pg";
import { CurrentOperationalReads } from "../operations/current-operational-read";
import { KeysetCursorCodec,type CursorKeyring } from "../query/cursor";
import { QueryContractError } from "../query/contracts";
import { commandCollection,commandCollectionQuery,CommandCollectionError,
  type CommandCollection,type CommandCollectionQuery } from "./command-collection.contract";
import type { AccessActor,AccessAction } from "./access.contract";
import { AccessPolicyError } from "./access.contract";
import { accessDigest,evaluateAccess,type AccessEvaluationContext } from "./access-policy";
import { ExecutionAccessService } from "./access.service";
import { assertAmountPartition } from "./foundation.contract";
import { CommandError,commandIntent,commandPreview,commandStatus,type CommandIntent,type CommandStatus } from "./command.contract";
import { CommandStore,type CommandRecord } from "./command.store";
import { capitalWorkflow } from "./workflow";
import { workflowCommandRecord,workflowCommandTarget } from "./capital-workflow-record";
import { commandMembershipCurrent } from "./command-current-authority";
import { requireCurrentTsAuditRead } from "./current-audit-read";
import { commandAuthorization,sourceCommandResult,unqualifiedCommandTrust,type CommandAuthorization,type CommandTrust,type SourceCommandResult } from "./command-trust";

const action:Record<CommandIntent["business_payload"]["operation"],AccessAction>={FUND:"capital.fund",INITIAL_GRANT:"capital.initial_grant",
  TOP_UP:"capital.top_up",IMMEDIATE_DECREASE:"capital.immediate_decrease",RECALL_PARTIAL:"capital.recall_partial",RECALL_FULL:"capital.recall_full",
  ADJUST_TARGET_BUDGET:"capital.adjust_target_budget",SET_ROOT_LIMIT:"capital.set_root_limit"};
export const intentHash=(actor:AccessActor,intent:CommandIntent)=>accessDigest({actor_user_id:actor.user_id,intent});
export function previewHash(a:CommandAuthorization):string {
  // TTL/reissued reference changes are not new economic intent. All stable
  // decision dependencies are; no silent approval/version/authority rebind.
  const {issued_at_ms:_,expires_at_ms:__,reference:___,idempotency_retained_until_ms:____,...stable}=a;
  return accessDigest(stable);
}
const bound=(a:CommandAuthorization,i:CommandIntent)=>({authority_ref:a.authority_ref,profile_ref:a.profile_ref,
  workspace_id:i.workspace_id,environment:i.environment,operation:i.business_payload.operation,
  resource_kind:i.resource.kind,resource_id:i.resource.id,idempotency_key:i.business_payload.idempotency_key,source_intent_digest:a.source_intent_digest});
/** Internal verifier seam does cryptography/source current-authority work. This
 * boundary independently checks all correlation fields and conservative states. */
export function validateAuthorization(a:CommandAuthorization,actor:AccessActor,i:CommandIntent,c:AccessEvaluationContext,allowTestOnly:boolean,now:number) {
  if(a.qualification!=="OWNER_VERIFIED"&&!(allowTestOnly&&a.qualification==="TEST_ONLY"))throw new CommandError("COMMAND_RELAY_NOT_QUALIFIED",503);
  if(a.actor_id!==actor.user_id||a.actor_id===a.workload_ref||a.ts_user_id===a.workload_ref||
    a.workspace_id!==i.workspace_id||a.environment!==i.environment||a.operation!==i.business_payload.operation||
    a.resource_kind!==i.resource.kind||a.resource_id!==i.resource.id||a.policy_revision!==c.policy?.revision||
    a.policy_revision!==i.expected_policy_revision||a.intent_hash!==intentHash(actor,i)||
    accessDigest(a.expected_versions)!==accessDigest(i.business_payload.expected_versions)||
    !commandMembershipCurrent(a,actor,i,c,action[i.business_payload.operation],now))throw new CommandError("COMMAND_CONTEXT_INVALID",403);
  if(a.issued_at_ms>now||a.expires_at_ms<=now||a.expires_at_ms<=a.issued_at_ms||a.expires_at_ms-a.issued_at_ms>60000||a.idempotency_retained_until_ms<a.expires_at_ms)
    throw new CommandError("COMMAND_CONTEXT_EXPIRED",403);
  if(a.approval_required!==(a.required_approval_gate!==null)||a.approval_required&&(!a.approval||a.approval.gate!==a.required_approval_gate||a.approval.intent_hash!==a.intent_hash||a.approval.policy_revision!==a.policy_revision))
    throw new CommandError("COMMAND_APPROVAL_REQUIRED",403);
  if(a.approval&&(a.approval.expires_at_ms<=now||a.approval.intent_hash!==a.intent_hash||a.approval.policy_revision!==a.policy_revision))
    throw new CommandError("COMMAND_APPROVAL_REQUIRED",403);
  if(a.approval?.gate==="R2"&&!a.r2_basis)throw new CommandError("COMMAND_CONTEXT_INVALID",403);
  if(a.r2_basis&&a.r2_basis.currency!==i.business_payload.currency)throw new CommandError("COMMAND_CONTEXT_INVALID",403);
}
function decimal(value:string,scale:number):bigint {const [whole,fraction=""]=value.split(".");return BigInt(whole+fraction)*10n**BigInt(scale-fraction.length);}
function less(a:string,b:string):boolean {const scale=Math.max((a.split(".")[1]??"").length,(b.split(".")[1]??"").length);return decimal(a,scale)<decimal(b,scale);}
export function mergeSource(old:CommandRecord,raw:SourceCommandResult):CommandStatus {
  const result=sourceCommandResult.parse(raw),{delivery,business,projection,venue,...identity}=result;
  if(accessDigest(identity)!==accessDigest(bound(old.authorization,old.intent)))throw new CommandError("COMMAND_STATUS_UNVERIFIED",502);
  if(business.state!=="UNKNOWN"&&(!business.receipt_ref||!business.source_event_ref||business.revision===null||delivery!=="ACKNOWLEDGED"))
    throw new CommandError("COMMAND_STATUS_UNVERIFIED",502);
  if(business.state==="UNKNOWN"&&(business.receipt_ref!==null||business.source_event_ref!==null||business.revision!==null||business.amounts!==null))
    throw new CommandError("COMMAND_STATUS_UNVERIFIED",502);
  if(delivery==="FAILED_BEFORE_SEND"&&business.state!=="UNKNOWN")throw new CommandError("COMMAND_STATUS_UNVERIFIED",502);
  if(business.state!=="UNKNOWN"&&old.intent.business_payload.amount!==undefined&&!business.amounts)
    throw new CommandError("COMMAND_STATUS_UNVERIFIED",502);
  if(business.amounts){
    assertAmountPartition(business.amounts);
    const zero=(v:string)=>/^0(?:\.0+)?$/.test(v);
    const requested=old.intent.business_payload.amount;
    if(requested!==undefined&&(less(requested,business.amounts.requested)||less(business.amounts.requested,requested)))
      throw new CommandError("COMMAND_STATUS_UNVERIFIED",502);
    if(business.state==="APPLIED"&&![business.amounts.pending,business.amounts.cancelled,business.amounts.rejected].every(zero)||
      ["CANCELLED","PARTIALLY_APPLIED_CANCELLED","REJECTED"].includes(business.state)&&!zero(business.amounts.pending)||
      ["CANCELLED","REJECTED"].includes(business.state)&&!zero(business.amounts.applied)||
      business.state==="PARTIALLY_APPLIED"&&(zero(business.amounts.applied)||zero(business.amounts.pending))||
      business.state==="PARTIALLY_APPLIED_CANCELLED"&&(zero(business.amounts.applied)||zero(business.amounts.cancelled)))
      throw new CommandError("COMMAND_STATUS_UNVERIFIED",502);
  }
  const previous=old.status.business;
  if(previous.state!=="UNKNOWN") {
    // Missing or older lookup is never proof that a committed outcome vanished.
    if(business.revision===null||BigInt(business.revision)<BigInt(previous.revision!))return old.status;
    if(business.revision===previous.revision&&accessDigest(business)!==accessDigest(previous))
      throw new CommandError("COMMAND_STATUS_UNVERIFIED",502);
    if(["APPLIED","CANCELLED","PARTIALLY_APPLIED_CANCELLED","REJECTED"].includes(previous.state)&&business.state!==previous.state)
      throw new CommandError("COMMAND_STATUS_UNVERIFIED",502);
    if(previous.amounts&&(!business.amounts||less(previous.amounts.requested,business.amounts.requested)||less(business.amounts.requested,previous.amounts.requested)||
      less(business.amounts.applied,previous.amounts.applied)||less(business.amounts.cancelled,previous.amounts.cancelled)||
      less(business.amounts.rejected,previous.amounts.rejected)))throw new CommandError("COMMAND_STATUS_UNVERIFIED",502);
  }
  return commandStatus.parse({...old.status,delivery:old.status.delivery==="ACKNOWLEDGED"&&business.state==="UNKNOWN"?"ACKNOWLEDGED":delivery,business,projection,venue,next_action:
    ["UNKNOWN","PARTIALLY_APPLIED","WAITING_ENCUMBRANCE"].includes(business.state)?"QUERY_SAME_INTENT":"REVIEW_RECEIPT"});
}

export class ExecutionCommandService {
  private readonly store:CommandStore;
  private readonly reads:CurrentOperationalReads;
  private activeIo=0;
  private readonly collectionCursor:KeysetCursorCodec|null;
  constructor(pool:Pool,private readonly access:ExecutionAccessService,private readonly trust:CommandTrust=unqualifiedCommandTrust,
    private readonly allowTestOnly=false,cursor?:CursorKeyring){this.store=new CommandStore(pool);
    this.reads=new CurrentOperationalReads(access);
    this.collectionCursor=cursor?new KeysetCursorCodec(cursor):null;}
  private permit(c:AccessEvaluationContext,i:CommandIntent) {
    const result=evaluateAccess(c,action[i.business_payload.operation],i.resource,i.environment);
    if(!result.allowed)throw new AccessPolicyError(result.reason_code??"ACCESS_DENIED",403);
  }
  private async prepare(actor:AccessActor,i:CommandIntent,c:AccessEvaluationContext) {
    let raw:CommandAuthorization|null;
    try{raw=await this.bounded(signal=>this.trust.prepare({actor:structuredClone(actor),intent:structuredClone(i),intent_hash:intentHash(actor,i),signal}));}
    catch{throw new CommandError("COMMAND_RELAY_NOT_QUALIFIED",503);}
    if(!raw)throw new CommandError("COMMAND_RELAY_NOT_QUALIFIED",503);
    const parsed=commandAuthorization.safeParse(raw);
    if(!parsed.success)throw new CommandError("COMMAND_CONTEXT_INVALID",503);
    const mapping=await this.access.commandHumanMapping(actor,i.workspace_id);
    if(!mapping||mapping.ts_user_id!==parsed.data.ts_user_id||mapping.revision!==parsed.data.mapping_revision)
      throw new CommandError("COMMAND_CONTEXT_INVALID",403);
    const current=await this.access.confirmReadContext(actor,i.workspace_id,c);
    this.permit(current,i);validateAuthorization(parsed.data,actor,i,current,this.allowTestOnly,current.now_ms);
    return parsed.data;
  }
  async preview(actor:AccessActor,raw:CommandIntent) {
    const i=commandIntent.parse(raw),c=await this.access.readContext(actor,i.workspace_id);this.permit(c,i);
    try{const a=await this.prepare(actor,i,c);return commandPreview.parse({schema_version:"portal.execution.command-preview.v1",allowed:true,
      reason_code:null,preview_digest:previewHash(a),expires_at_ms:a.expires_at_ms,profile_ref:a.profile_ref,
      approval_required:a.approval_required,approval_gate:a.required_approval_gate,business_applied:false,reserved:false});}
    catch(e){if(!(e instanceof CommandError))throw e;return commandPreview.parse({schema_version:"portal.execution.command-preview.v1",allowed:false,
      reason_code:e.code,preview_digest:null,expires_at_ms:null,profile_ref:null,approval_required:null,approval_gate:null,business_applied:false,reserved:false});}
  }
  async submit(actor:AccessActor,raw:CommandIntent,digest:string):Promise<CommandStatus> {
    const i=commandIntent.parse(raw),hash=intentHash(actor,i),c=await this.access.readContext(actor,i.workspace_id);this.permit(c,i);
    // A known intent returns its durable status even after new-send activation
    // is withdrawn. Current exact mutation authority is still required here.
    const prior=await this.access.commandBoundary(actor,i.workspace_id,c,action[i.business_payload.operation],i.resource,i.environment,()=>{},
      db=>this.store.keyed(db,i.workspace_id,i.business_payload.idempotency_key));
    if(prior){if(prior.actor!==actor.user_id||prior.hash!==hash)throw new CommandError("COMMAND_IDEMPOTENCY_CONFLICT");return this.mutationStatus(actor,i,c,prior.id);}
    const a=await this.prepare(actor,i,c);
    if(digest!==previewHash(a))throw new CommandError("COMMAND_PREVIEW_CHANGED");
    const claimed=await this.access.commandBoundary(actor,i.workspace_id,c,action[i.business_payload.operation],i.resource,i.environment,
      (now,current)=>validateAuthorization(a,actor,i,current,this.allowTestOnly,now),async db=>{
        const record=await this.store.insert(db,actor.user_id,i,hash,a);
        return {record,attempt:await this.store.claim(db,record)};
      });
    if(!claimed.attempt)return this.mutationStatus(actor,i,c,claimed.record.id);
    let sent:SourceCommandResult|null=null;
    try {
      // Last current Portal check before entering the separately authenticated
      // TS commit boundary. No connection/transaction is held across send.
      const current=await this.access.confirmReadContext(actor,i.workspace_id,c);this.permit(current,i);
      validateAuthorization(a,actor,i,current,this.allowTestOnly,current.now_ms);
    }catch(e){await this.store.update(i.workspace_id,claimed.record.id,claimed.attempt,old=>({...old.status,delivery:"FAILED_BEFORE_SEND",next_action:"REVIEW_BLOCKER"}));throw e;}
    try{sent=await this.bounded(signal=>this.trust.send({authorization:structuredClone(a),intent:structuredClone(i),signal}));}
    catch {/* Durable unknown below; recheck current disclosure rights afterwards. */}
    let result:CommandRecord;
    try{result=await this.store.update(i.workspace_id,claimed.record.id,claimed.attempt,old=>sent?mergeSource(old,sent):
      {...old.status,delivery:"DELIVERY_UNKNOWN",next_action:"QUERY_SAME_INTENT"});}
    catch {result=await this.store.update(i.workspace_id,claimed.record.id,claimed.attempt,old=>({...old.status,delivery:"DELIVERY_UNKNOWN",next_action:"QUERY_SAME_INTENT"}));}
    const current=await this.access.confirmReadContext(actor,i.workspace_id,c);this.permit(current,i);
    return result.status;
  }
  private async mutationStatus(actor:AccessActor,i:CommandIntent,expected:AccessEvaluationContext,id:string) {
    const old=await this.store.get(i.workspace_id,id);
    const current=await this.access.confirmReadContext(actor,i.workspace_id,expected);this.permit(current,i);
    if(!old)throw new CommandError("COMMAND_RESOURCE_NOT_FOUND",404);
    return old.status;
  }
  private readError(error:unknown):Error {
    if(error instanceof CommandError||error instanceof AccessPolicyError||error instanceof CommandCollectionError)return error;
    // Existing commandHttpCall maps this fixed internal refusal to
    // COMMAND_UNAVAILABLE; never leak OperationalReadError/provider/SQL copy.
    return new Error("COMMAND_UNAVAILABLE");
  }
  private async storedReport<T>(actor:AccessActor,workspace:string,id:string,
    project:(record:ReturnType<typeof workflowCommandRecord>,current:AccessEvaluationContext,
      decision:ReturnType<typeof requireCurrentTsAuditRead>)=>T):Promise<T> {
    const prepared=await this.reads.prepareExact<T>(actor,workspace,async()=>{
      const row=await this.store.workflowCandidate(workspace,id);
      if(!row)throw new CommandError("COMMAND_RESOURCE_NOT_FOUND",404);
      const target=workflowCommandTarget(row); // bounded target ONLY, not private decode
      return {target,decode:(current,decision)=>project(workflowCommandRecord(row,workspace,id,target),current,decision)};
    },error=>this.readError(error));
    return this.reads.finish(prepared);
  }
  async status(actor:AccessActor,workspace:string,id:string) {
    return this.storedReport(actor,workspace,id,({status})=>status);
  }
  /** Current-authorized local presentation only. No command/provider dispatch,
   * recovery, status update, event or audit write. The original author may differ
   * from the current report reader; old new-send expiry is not current ACL. */
  async workflow(actor:AccessActor,workspace:string,id:string):Promise<ReturnType<typeof capitalWorkflow>> {
    return this.storedReport(actor,workspace,id,({intent,status},current,decision)=>{
      const target={resource:intent.resource,environment:intent.environment};
      if(decision.policy_revision===null)throw new CommandError("COMMAND_STATUS_UNVERIFIED",503);
      const context={workspace_id:workspace,environment:target.environment,resource:target.resource,
        policy_revision:decision.policy_revision,
        snapshot_ref:accessDigest({domain:"portal.execution.capital-workflow.v1",workspace_id:workspace,
          environment:target.environment,resource:target.resource,currency:intent.business_payload.currency,
          policy_revision:decision.policy_revision,status}),
        // Stored updated_at_ms is Portal state time, never PM source-cutoff proof.
        source_as_of_ms:null,observed_at_ms:Math.max(current.now_ms,Date.now())};
      return capitalWorkflow(context,intent.business_payload.currency,status);
    });
  }
  /** A local finite status read only. Never calls command trust/reconcile/recovery.
   * Mandatory exact resource prevents an empty list becoming global discovery.
   */
  async collection(actor:AccessActor,raw:CommandCollectionQuery):Promise<CommandCollection> {
    const q=commandCollectionQuery.parse(raw),resource={kind:q.resource_kind,id:q.resource_id};
    const target={resource,environment:q.environment};
    const prepared=await this.reads.prepareExact<CommandCollection>(actor,q.workspace_id,async()=>{
      const codec=this.collectionCursor;
      if(!codec)throw new CommandCollectionError("COMMAND_COLLECTION_NOT_CONFIGURED",503);
      const candidates=await this.store.statusCandidates(q.workspace_id,resource,q.environment);
      return {target,decode:(current,decision)=>{
        if(candidates.length>1024)throw new CommandCollectionError("COMMAND_COLLECTION_OVERFLOW",503);
        const rows=candidates.map(row=>{
          const rowTarget=commandStatus.shape.resource.parse(row.resource);
          const env=commandStatus.shape.environment.parse(row.environment);
          // Every immutable intent tuple must equal the exact scope authorized
          // before SQL and again before decode. No status can create scope.
          if(rowTarget.kind!==resource.kind||rowTarget.id!==resource.id||env!==q.environment)
            throw new CommandError("COMMAND_STATUS_UNVERIFIED",503);
          const status=commandStatus.parse(row.status);
          if(status.command_id!==row.id||status.resource.kind!==rowTarget.kind||
            status.resource.id!==rowTarget.id||status.environment!==env)
            throw new CommandError("COMMAND_STATUS_UNVERIFIED",503);
          return status;
        }).sort((a,b)=>b.created_at_ms-a.created_at_ms||
          (a.command_id<b.command_id?-1:a.command_id>b.command_id?1:0));
        const query={workspace_id:q.workspace_id,resource,environment:q.environment,limit:q.limit};
        // Status-only collection: no claim of private actor/hash/CAS validation.
        const fingerprint=accessDigest({domain:"portal.execution.command-collection.v1",actor,query,
          core_authority:current.authority_fingerprint,policy_revision:decision.policy_revision,
          scope_revision:decision.scope_revision,field_policy_ref:decision.field_policy_ref,
          visible_statuses:rows.map(row=>accessDigest(row))});
        let offset=0;
        if(q.after) {
          let boundary:readonly (string|number|boolean)[];
          try {boundary=codec.decode(q.after,{resourceId:"execution.trusted-capital-commands.v1",
            workspaceId:q.workspace_id,direction:"after",queryFingerprint:fingerprint,boundarySize:2});}
          catch(error) {
            if(error instanceof QueryContractError)throw new CommandCollectionError(
              error.code==="CURSOR_CONTEXT_MISMATCH"?"COMMAND_COLLECTION_CURSOR_CHANGED":"COMMAND_COLLECTION_CURSOR_INVALID",
              error.code==="CURSOR_CONTEXT_MISMATCH"?409:400);
            throw error;
          }
          const index=rows.findIndex(row=>row.created_at_ms===boundary[0]&&row.command_id===boundary[1]);
          if(index<0)throw new CommandCollectionError("COMMAND_COLLECTION_CURSOR_CHANGED",409);
          offset=index+1;
        }
        const items=rows.slice(offset,offset+q.limit),hasMore=offset+items.length<rows.length;
        const last=items[items.length-1];
        const next=hasMore?codec.encode({resource_id:"execution.trusted-capital-commands.v1",
          workspace_id:q.workspace_id,direction:"after",query_fingerprint:fingerprint,
          boundary:[last.created_at_ms,last.command_id]}):null;
        const result=commandCollection.parse({schema_version:"portal.execution.command-collection.v1",
          family:"TRUSTED_CAPITAL_COMMANDS_ONLY",coverage:"EXACT_AUTHORIZED_RESOURCE_ONLY",
          resource,environment:q.environment,items,
          page:{limit:q.limit,returned_count:items.length,has_more:hasMore,next_cursor:next}});
        if(Buffer.byteLength(JSON.stringify(result),"utf8")>1024*1024)
          throw new CommandCollectionError("COMMAND_COLLECTION_RESPONSE_BOUND",503);
        return result;
      }};
    },error=>this.readError(error),target);
    return this.reads.finish(prepared);
  }
  async reconcile(actor:AccessActor,workspace:string,id:string) {
    await this.status(actor,workspace,id);
    await this.recover(workspace,id);
    return this.status(actor,workspace,id);
  }
  /** Internal accepted-intent recovery. No human impersonation, no new send,
   * no new key, no credential/body endpoint; verified source status only. */
  async recover(workspace:string,id:string):Promise<void> {
    const old=await this.store.get(workspace,id);if(!old)throw new CommandError("COMMAND_RESOURCE_NOT_FOUND",404);
    if(old.status.delivery==="PREPARED"||old.status.delivery==="FAILED_BEFORE_SEND")return;
    // Expired retention cannot be interpreted as not-committed or safe resend.
    let result:SourceCommandResult|null=null;
    if(old.authorization.idempotency_retained_until_ms>Date.now()) {
      try{result=await this.bounded(signal=>this.trust.lookup({authorization:structuredClone(old.authorization),intent:structuredClone(old.intent),signal}));}catch{/* UNKNOWN, no resend */}
    }
    if(result){
      try{await this.store.update(workspace,id,null,current=>mergeSource(current,result!));return;}
      catch{await this.store.update(workspace,id,null,current=>current.status.delivery==="SENDING"?
        {...current.status,delivery:"DELIVERY_UNKNOWN",next_action:"QUERY_SAME_INTENT"}:current.status);
        throw new CommandError("COMMAND_STATUS_UNVERIFIED",502);}
    }
    await this.store.update(workspace,id,null,current=>current.status.delivery==="SENDING"?
      {...current.status,delivery:"DELIVERY_UNKNOWN",next_action:"QUERY_SAME_INTENT"}:current.status);
  }
  private async bounded<T>(call:(signal:AbortSignal)=>Promise<T>):Promise<T> {
    if(this.activeIo>=4)throw new CommandError("COMMAND_CAPACITY_EXCEEDED",503);
    this.activeIo++;
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    const pending=Promise.resolve().then(()=>call(controller.signal));
    // A misbehaving provider that ignores abort still owns its slot. Do not
    // let repeated timed-out callers start unbounded underlying requests.
    void pending.then(()=>{this.activeIo--;},()=>{this.activeIo--;});
    try{return await Promise.race([pending,new Promise<never>((_,reject)=>{
      timer=setTimeout(()=>{controller.abort();reject(new Error("COMMAND_IO_DEADLINE"));},10_000);
    })]);}finally{if(timer)clearTimeout(timer);controller.abort();}
  }
}
