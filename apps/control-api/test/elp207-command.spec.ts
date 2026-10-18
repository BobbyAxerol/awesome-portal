/** TEST_ONLY component facts, not signature/mTLS/runtime qualification. */
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe,expect,it,vi} from "vitest";
import {commandIntent,commandPreview,commandStatus} from "../src/execution-v2/command.contract";
import {commandAuthorization,type CommandAuthorization,type SourceCommandResult} from "../src/execution-v2/command-trust";
import {ExecutionCommandService,intentHash,mergeSource,previewHash,validateAuthorization} from "../src/execution-v2/command.service";
import {accessDigest,type AccessEvaluationContext} from "../src/execution-v2/access-policy";
import type {CommandRecord} from "../src/execution-v2/command.store";
import {capitalWorkflow} from "../src/execution-v2/workflow";
const root=process.env.PORTAL_CONTRACTS_DIR??resolve(__dirname,"../../../packages/contracts");
const fixture=JSON.parse(readFileSync(resolve(root,"fixtures/execution-trusted-commands.synthetic.valid.json"),"utf8"));
const now=1792100000000,actor={user_id:"TEST_ONLY:user",session_id:"TEST_ONLY:session",session_generation:1};
const intent=commandIntent.parse(fixture.intent);
export function authorization():CommandAuthorization {
  return commandAuthorization.parse({qualification:"TEST_ONLY",reference:"TEST_ONLY:authorization",authority_ref:"TEST_ONLY:pm-authority",
    profile_ref:"TEST_ONLY:paper",audience:"pma.management.v1",actor_id:actor.user_id,ts_user_id:"TEST_ONLY:ts-user",workload_ref:"TEST_ONLY:workload",
    delegation_ref:"TEST_ONLY:delegation",mapping_revision:"TEST_ONLY:mapping",membership_revision:"TEST_ONLY:membership",membership_receipt_ref:"TEST_ONLY:membership-receipt",
    workspace_id:intent.workspace_id,environment:intent.environment,operation:intent.business_payload.operation,resource_kind:intent.resource.kind,
    resource_id:intent.resource.id,policy_revision:intent.expected_policy_revision,intent_hash:intentHash(actor,intent),source_intent_digest:accessDigest("TEST_ONLY:resolved-source-digest").slice(7),
    expected_versions:intent.business_payload.expected_versions,issued_at_ms:now-100,expires_at_ms:now+10000,idempotency_retained_until_ms:now+60000,
    approval_required:false,required_approval_gate:null,approval:null,r2_basis:null,commit_checks:{human:true,workload:true,membership:true,scope:true,versions:true,capacity:true,approval:true}});
}
const context={principal_id:actor.user_id,workspace_id:intent.workspace_id,now_ms:now,policy:{revision:intent.expected_policy_revision},
  relationsFor:()=>({qualified:true,membership:{revision:"TEST_ONLY:membership",mapping_revision:"TEST_ONLY:mapping",receipt_id:"TEST_ONLY:membership-receipt"}})} as AccessEvaluationContext;
function record():CommandRecord{return {id:fixture.ack_only.command_id,actor:actor.user_id,hash:intentHash(actor,intent),intent,authorization:authorization(),
  status:commandStatus.parse(fixture.ack_only),attempt:"TEST_ONLY:attempt"};}
function source():SourceCommandResult {const a=authorization();return {authority_ref:a.authority_ref,profile_ref:a.profile_ref,workspace_id:intent.workspace_id,
  environment:intent.environment,operation:intent.business_payload.operation,resource_kind:intent.resource.kind,resource_id:intent.resource.id,
  idempotency_key:intent.business_payload.idempotency_key,source_intent_digest:a.source_intent_digest,delivery:"ACKNOWLEDGED",
  business:{state:"APPLIED",receipt_ref:"TEST_ONLY:receipt",source_event_ref:"TEST_ONLY:event",revision:"9007199254740993",
    amounts:{requested:"100.000000000000000001",applied:"100.000000000000000001",pending:"0",cancelled:"0",rejected:"0"}},projection:"CATCHING_UP",venue:"NOT_APPLICABLE"};}
describe("ELP2-07 strict command and status component",()=>{
  it("labels shared consumer fixtures TEST_ONLY and preserves exact counters/decimals",()=>{
    expect(fixture.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(commandIntent.parse(fixture.intent)).toEqual(fixture.intent);expect(commandPreview.parse(fixture.preview_blocked)).toEqual(fixture.preview_blocked);
    expect(intent.business_payload.expected_versions.budget).toBe("9007199254740993");
  });
  it.each(["actor","workload","jwt","audience","source_url","profile_ref","approval","sql","relation"])("T07-01 rejects browser %s authority",key=>{
    expect(commandIntent.safeParse({...intent,[key]:"spoof"}).success).toBe(false);
    expect(commandIntent.safeParse({...intent,business_payload:{...intent.business_payload,[key]:"spoof"}}).success).toBe(false);
  });
  it.each(["RETURN_CAPITAL","APPLY_PENDING","CANCEL_REMAINING","REALLOCATE_BUDGET","HALT","ARCHIVE"])("T07-09 does not infer %s adapter support",operation=>{
    expect(commandIntent.safeParse({...intent,business_payload:{...intent.business_payload,operation}}).success).toBe(false);
  });
  it("T07-01 binds outer resource kind and deployment pair, not just display target",()=>{
    expect(commandIntent.safeParse({...intent,resource:{kind:"DEPLOYMENT",id:"wrong"}}).success).toBe(false);
    expect(commandIntent.safeParse({...intent,business_payload:{...intent.business_payload,recipient_kind:"DEPLOYMENT_ACCOUNT",recipient_account_id:"account",recipient_deployment_id:"other"}}).success).toBe(false);
  });
  it("T07-04 stable Portal hash is order-independent, decimal-exact, NOT a PM source digest",()=>{
    const changed={...intent,business_payload:{...intent.business_payload,amount:"100"}};
    expect(intentHash(actor,intent)).not.toBe(intentHash(actor,changed));
    expect(intentHash(actor,intent)).toBe(accessDigest({intent,actor_user_id:actor.user_id}));
    expect(authorization().source_intent_digest).not.toBe(intentHash(actor,intent));
  });
  it.each(["actor_id","workspace_id","environment","operation","resource_id","policy_revision","intent_hash","membership_revision","mapping_revision","membership_receipt_ref"])("T07-08 rejects trusted evidence misbinding %s",field=>{
    const a={...authorization(),[field]:"wrong"};
    expect(()=>validateAuthorization(a as CommandAuthorization,actor,intent,context,true,now)).toThrow("COMMAND_CONTEXT_INVALID");
  });
  it("T07-02 rejects expiry and TEST_ONLY in production, requires exact approval and all R2 dimensions",()=>{
    expect(()=>validateAuthorization(authorization(),actor,intent,context,false,now)).toThrow("COMMAND_RELAY_NOT_QUALIFIED");
    expect(()=>validateAuthorization({...authorization(),expires_at_ms:now},actor,intent,context,true,now)).toThrow("COMMAND_CONTEXT_EXPIRED");
    expect(()=>validateAuthorization({...authorization(),expires_at_ms:now+60001,idempotency_retained_until_ms:now+120000},actor,intent,context,true,now)).toThrow("COMMAND_CONTEXT_EXPIRED");
    expect(()=>validateAuthorization({...authorization(),approval_required:true},actor,intent,context,true,now)).toThrow("COMMAND_APPROVAL_REQUIRED");
    const a={...authorization(),approval_required:true,required_approval_gate:"R2" as const,approval:{receipt_ref:"TEST_ONLY:r2",intent_hash:intentHash(actor,intent),policy_revision:intent.expected_policy_revision,expires_at_ms:now+1000,gate:"R2" as const}};
    expect(()=>validateAuthorization(a,actor,intent,context,true,now)).toThrow("COMMAND_CONTEXT_INVALID");
    const r2_basis={economic_backing:"200.01",margin_risk_budget:"30.02",exposure_cap:"500.03",currency:"USDT",source_receipt_ref:"TEST_ONLY:capacity"};
    expect(()=>validateAuthorization({...a,r2_basis},actor,intent,context,true,now)).not.toThrow();
    expect(()=>validateAuthorization({...a,r2_basis:{...r2_basis,currency:"OTHER"}},actor,intent,context,true,now)).toThrow("COMMAND_CONTEXT_INVALID");
    expect(commandAuthorization.parse({...a,r2_basis}).r2_basis).toEqual(r2_basis);
  });
  it("preview TTL reissue does not change intent; CAS/approval/profile changes do",()=>{
    const a=authorization();expect(previewHash({...a,reference:"next",expires_at_ms:now+20000})).toBe(previewHash(a));
    for(const patch of [{profile_ref:"other"},{source_intent_digest:accessDigest("changed").slice(7)},{expected_versions:{...a.expected_versions,budget:"4"}}])
      expect(previewHash({...a,...patch})).not.toBe(previewHash(a));
  });
  it("T07-05 ACK and projection CURRENT never imply APPLIED or FILLED",()=>{
    const r=source();r.business={state:"UNKNOWN",receipt_ref:null,source_event_ref:null,revision:null,amounts:null};r.projection="CURRENT";r.venue="UNKNOWN";
    expect(mergeSource(record(),r)).toMatchObject({delivery:"ACKNOWLEDGED",business:{state:"UNKNOWN"},venue:"UNKNOWN",next_action:"QUERY_SAME_INTENT"});
  });
  it.each(["authority_ref","profile_ref","workspace_id","environment","operation","resource_id","idempotency_key","source_intent_digest"])("T07-08 rejects source receipt scope mismatch %s",field=>{
    expect(()=>mergeSource(record(),{...source(),[field]:"wrong"} as SourceCommandResult)).toThrow();
  });
  it("T07-10 exact partition and monotone amount/revision checks preserve applied outcomes",()=>{
    const first=source(),old=record();old.status=mergeSource(old,first);
    expect(mergeSource(old,{...first,business:{...first.business,revision:"2"}})).toEqual(old.status);
    expect(()=>mergeSource(old,{...first,business:{...first.business,amounts:{...first.business.amounts!,applied:"100"}}})).toThrow();
    expect(()=>mergeSource(old,{...first,business:{...first.business,state:"CANCELLED",revision:"9007199254740994"}})).toThrow();
    expect(()=>mergeSource(record(),{...first,business:{...first.business,receipt_ref:null}})).toThrow();
    const wrong=source();wrong.business.amounts={requested:"1",applied:"1",pending:"0",cancelled:"0",rejected:"0"};
    expect(()=>mergeSource(record(),wrong)).toThrow("COMMAND_STATUS_UNVERIFIED");
    expect(()=>mergeSource(record(),{...first,business:{...first.business,amounts:null}})).toThrow("COMMAND_STATUS_UNVERIFIED");
  });
  it.each(["ADJUST_TARGET_BUDGET","SET_ROOT_LIMIT"] as const)(
    "a validated %s target wire merges and projects a real-shaped null-amount receipt",operation=>{
      const {amount:_amount,expected_versions:_versions,...base}=intent.business_payload;
      const kind=operation==="SET_ROOT_LIMIT"?"ROOT":"PORTFOLIO";
      const resource={kind,id:"TEST_ONLY:"+kind.toLowerCase()} as const;
      const nextIntent=commandIntent.parse({...intent,resource,business_payload:{...base,operation,recipient_kind:kind,
        expected_versions:operation==="SET_ROOT_LIMIT"?{budget:"9007199254740993",source:"2"}:
          {budget:"9007199254740993",source:"2",parent:"3",book:"4"},
        [operation==="SET_ROOT_LIMIT"?"target_root_limit":"target_budget"]:"200.000000000000000001"}});
      expect(nextIntent.business_payload.amount).toBeUndefined();
      expect(commandIntent.safeParse({...nextIntent,business_payload:{...nextIntent.business_payload,amount:"0"}}).success).toBe(false);
      const a={...authorization(),operation,resource_kind:kind,resource_id:resource.id,
        expected_versions:nextIntent.business_payload.expected_versions,intent_hash:intentHash(actor,nextIntent),
        source_intent_digest:accessDigest("TEST_ONLY:non-amount-source:"+operation).slice(7)};
      const old:CommandRecord={...record(),hash:intentHash(actor,nextIntent),intent:nextIntent,authorization:a,
        status:commandStatus.parse({...fixture.ack_only,operation,resource})};
      for(const state of ["APPLIED","REJECTED"] as const){
        const raw:SourceCommandResult={...source(),operation,resource_kind:kind,resource_id:resource.id,
          source_intent_digest:a.source_intent_digest,business:{...source().business,state,amounts:null}};
        const merged=mergeSource(old,raw);
        const projected=capitalWorkflow({workspace_id:nextIntent.workspace_id,environment:nextIntent.environment,resource,
          policy_revision:nextIntent.expected_policy_revision,snapshot_ref:"TEST_ONLY:snapshot",source_as_of_ms:now-1,observed_at_ms:now},
          nextIntent.business_payload.currency,merged);
        expect(projected.status).toEqual(merged);
        expect(projected.status.business.amounts).toBeNull();
        expect(projected.public_copy_key).toBe(state==="REJECTED"?"SOURCE_REJECTED":"REVIEW_RECEIPT");
        expect(()=>mergeSource(old,{...raw,business:{...raw.business,receipt_ref:null}})).toThrow("COMMAND_STATUS_UNVERIFIED");
      }
    });
  it("bounded I/O keeps slots occupied after timeout until provider actually settles",async()=>{
    vi.useFakeTimers();
    try{
      const service=new ExecutionCommandService(null as never,null as never) as unknown as {bounded:(f:(signal:AbortSignal)=>Promise<unknown>)=>Promise<unknown>};
      const releases:Array<()=>void>=[],signals:AbortSignal[]=[];
      const pending=Array.from({length:4},()=>service.bounded(signal=>new Promise(resolve=>{signals.push(signal);releases.push(()=>resolve("late"));})).catch(e=>e.message));
      await vi.advanceTimersByTimeAsync(10001);
      expect(await Promise.all(pending)).toEqual(Array(4).fill("COMMAND_IO_DEADLINE"));expect(signals.every(s=>s.aborted)).toBe(true);
      await expect(service.bounded(async()=>"forbidden fifth underlying call")).rejects.toMatchObject({code:"COMMAND_CAPACITY_EXCEEDED"});
      releases.forEach(release=>release());await Promise.resolve();await Promise.resolve();
      expect(await service.bounded(async()=>"released")).toBe("released");
    }finally{vi.useRealTimers();}
  });
});
