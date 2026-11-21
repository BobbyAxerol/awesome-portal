/** TEST_ONLY: real Core audit evaluator and Ed25519/HTTP byte binding with
 * synthetic repository/identity ports. No PostgreSQL/native/PM qualification. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Pool } from "pg";
import { decodeJwt, generateKeyPair, jwtVerify, SignJWT } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessEvaluationContext } from "../src/execution-v2/access-policy";
import type { AccessActor } from "../src/execution-v2/access.contract";
import { accessDigest } from "../src/execution-v2/access-digest";
import type { ExecutionAccessService } from "../src/execution-v2/access.service";
import { commandAuthorization } from "../src/execution-v2/command-trust";
import { CurrentHumanLeaseError } from "../src/execution-v2/current-human-candidate";
import { C2CustodyPendingError } from "../src/execution-v2/c2-custody-pending-error";
import { commandIntent, commandStatus } from "../src/execution-v2/command.contract";
import { CommandSourceAssertionAuthority, COMMAND_STATUS_PM_PATH, COMMAND_STATUS_EDGE_PATH,
  type CommandStatusInput, type CommandSourceAssertionResponse } from "../src/execution-v2/command-source-assertion";
import { pmHttpRequestDigest } from "../src/execution-v2/pm-http-request-binding";

const contractsDir=process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname,"../../../packages/contracts");
const fixture=JSON.parse(readFileSync(resolve(contractsDir,"fixtures/execution-trusted-commands.synthetic.valid.json"),"utf8"));
const NOW=1_792_100_000_000,owner="TEST_ONLY:owner";
const actor={user_id:"TEST_ONLY:reviewer",session_id:"TEST_ONLY:session",session_generation:3};
const hex=(v:string)=>accessDigest(v).slice(7);
let key:Awaited<ReturnType<typeof generateKeyPair>>;
beforeAll(async()=>{key=await generateKeyPair("EdDSA",{crv:"Ed25519",extractable:true});});
beforeEach(()=>{vi.spyOn(Date,"now").mockReturnValue(NOW);});
afterEach(()=>{vi.restoreAllMocks();});
function setup(){
  const intent=commandIntent.parse(fixture.intent),workspace=intent.workspace_id;
  const membership={revision:"TEST_ONLY:member",mapping_revision:"TEST_ONLY:mapping",receipt_id:"TEST_ONLY:receipt"};
  const grant={grant_id:"TEST_ONLY:grant",workspace_id:workspace,subject_user_id:actor.user_id,action:"audit.read" as const,effect:"ALLOW" as const,
    selector:{kind:"EXPLICIT_RESOURCE_SET" as const,resource_kind:intent.resource.kind,ids:[intent.resource.id]},environments:[intent.environment],
    valid_from_ms:NOW-1000,valid_until_ms:NOW+120000,delegable_actions:[],issued_by:owner,parent_grant_id:null,revision:"TEST_ONLY:grant-r1",
    policy_revision:intent.expected_policy_revision,revoked_at_ms:null as number|null,requires_ts_acceptance:true,field_policy_ref:null,
    ts_receipt:{receipt_id:membership.receipt_id,membership_revision:membership.revision,mapping_revision:membership.mapping_revision,
      effective_at_ms:NOW-1000,expires_at_ms:NOW+120000}};
  const state={current:true,fingerprint:accessDigest("TEST_ONLY:authority"),lease:NOW+120000};
  const context=():AccessEvaluationContext=>({principal_id:actor.user_id,workspace_id:workspace,now_ms:Date.now(),actor_current:state.current,
    actor_role:"USER",actor_lease_until_ms:state.lease,authority_fingerprint:state.fingerprint,allow_test_only:true,
    active_principals:new Set([owner,actor.user_id]),grants:[grant],policy:{workspace_id:workspace,revision:intent.expected_policy_revision,
      artifact_digest:accessDigest("TEST_ONLY:policy"),approval_ref:"TEST_ONLY:approval",state:"REVIEWED",qualification:"TEST_ONLY",
      protected_owner_user_id:owner,researcher_fields:{state:"PENDING",policy_ref:null,fields:[]}},
    relationsFor:()=>({qualified:true,revision:"TEST_ONLY:relations",own_alpha_ids:[],member_portfolio_ids:[],roots:{},membership})});
  const authorization=commandAuthorization.parse({qualification:"OWNER_VERIFIED",reference:"TEST_ONLY:authorization",
    authority_ref:"TEST_ONLY:authority",profile_ref:"TEST_ONLY:paper",audience:"pma.management.v1",actor_id:"TEST_ONLY:old-author",
    ts_user_id:"TEST_ONLY:old-ts-user",workload_ref:"TEST_ONLY:old-workload",delegation_ref:"TEST_ONLY:delegation",
    mapping_revision:membership.mapping_revision,membership_revision:membership.revision,membership_receipt_ref:membership.receipt_id,
    workspace_id:workspace,environment:intent.environment,operation:intent.business_payload.operation,resource_kind:intent.resource.kind,
    resource_id:intent.resource.id,policy_revision:intent.expected_policy_revision,
    intent_hash:accessDigest({actor_user_id:"TEST_ONLY:old-author",intent}),source_intent_digest:hex("TEST_ONLY:source"),
    expected_versions:intent.business_payload.expected_versions,issued_at_ms:NOW-20000,expires_at_ms:NOW-10000,
    idempotency_retained_until_ms:NOW+120000,approval_required:false,required_approval_gate:null,approval:null,r2_basis:null,
    commit_checks:{human:true,workload:true,membership:true,scope:true,versions:true,capacity:true,approval:true}});
  const original={gateway_ref:"TEST_ONLY:gateway",reference:"TEST_ONLY:edge-original",authorization_digest:accessDigest(authorization),
    intent_hash:authorization.intent_hash,request_digest:accessDigest("TEST_ONLY:edge-request"),transport_payload_digest:accessDigest("TEST_ONLY:payload"),
    source_intent_digest:authorization.source_intent_digest,source_key:["TEST_ONLY:scope","TOP_UP","TEST_ONLY:key"] as [string,string,string],target_ref:"TEST_ONLY:target"};
  const status=commandStatus.parse({...fixture.stored_ack_only,profile_ref:authorization.profile_ref,authority:"OWNER_VERIFIED",delivery:"SENDING"});
  const row={command_id:status.command_id,workspace_id:workspace,actor_user_id:authorization.actor_id,intent_hash:authorization.intent_hash,
    intent,authorization_fact:authorization,status};
  const preparations=new Map<string,Record<string,unknown>>();
  const db={query:vi.fn(async(sql:string,values:unknown[]=[])=>{
    if(sql.includes("SELECT revision,drain_id FROM elp210_candidate.authority"))return {rows:[{revision:"7",drain_id:null}],rowCount:1};
    if(sql.startsWith("SELECT floor(extract(epoch FROM clock_timestamp())"))return {rows:[{now_ms:Date.now()}],rowCount:1};
    if(sql.includes("SELECT f.command_id FROM execution_command_status_original_fingerprints"))return {rows:[{command_id:status.command_id}],rowCount:1};
    if(sql.includes("LEFT JOIN execution_command_status_context_links"))return {rows:[],rowCount:0};
    if(sql.startsWith("DELETE FROM execution_command_status_preparations WHERE command_id")) {
      const old=preparations.get(String(values[0]));if(old?.consumed_at)preparations.delete(String(values[0]));
      return {rows:[],rowCount:1};
    }
    if(sql.startsWith("DELETE FROM execution_command_status_preparations")) {
      for(const [id,p] of preparations)if(Number(p.context_expires_at_ms)<=Number(values[0]))preparations.delete(id);
      return {rows:[],rowCount:0};
    }
    if(sql.startsWith("SELECT * FROM execution_command_status_preparations")) {
      const p=preparations.get(String(values[0]));return {rows:p?[p]:[],rowCount:p?1:0};
    }
    if(sql.startsWith("SELECT count(*)::int AS total FROM execution_command_status_preparations"))
      return {rows:[{total:preparations.size}],rowCount:1};
    if(sql.startsWith("SELECT context_digest FROM execution_command_status_preparations")) {
      const p=[...preparations.values()].find(value=>value.context_digest===values[0]);
      return {rows:p?[p]:[],rowCount:p?1:0};
    }
    if(sql.startsWith("SELECT context_digest,call_digest,binding_digest FROM execution_command_status_preparations")) {
      const p=[...preparations.values()].find(value=>value.context_digest===values[0]);
      return {rows:p?[p]:[],rowCount:p?1:0};
    }
    if(sql.startsWith("WITH ordered AS"))return {rows:[{total:0,unresolved:0}],rowCount:1};
    if(sql.startsWith("SELECT 1 FROM execution_command_status_context_links c"))return {rows:[],rowCount:0};
    if(sql.includes("FROM execution_command_status_context_links c") && sql.includes("JOIN elp210_candidate.leases"))
      return {rows:[],rowCount:0};
    if(sql.startsWith("UPDATE execution_command_status_preparations SET consumed_at")) {
      const p=[...preparations.values()].find(value=>value.context_digest===values[0]);if(p)p.consumed_at="TEST_ONLY:consumed";
      return {rows:[],rowCount:p?1:0};
    }
    if(sql.startsWith("INSERT INTO execution_command_status_preparations")) {
      const columns=sql.slice(sql.indexOf("(")+1,sql.indexOf(")")).split(",");
      preparations.set(String(values[0]),{consumed_at:null,...Object.fromEntries(columns.map((column,index)=>[column,values[index]]))});
      return {rows:[],rowCount:1};
    }
    return {rows:sql.startsWith("SELECT command_id,workspace_id")?[structuredClone(row)]:[],rowCount:1};
  }),release:vi.fn()};
  const pool={connect:vi.fn(async()=>db),query:vi.fn(async(sql:string,...args:unknown[]):Promise<{rows:Record<string,unknown>[];rowCount:number}>=>{
    if(sql.includes("LEFT JOIN execution_command_status_context_links") || sql.includes("FROM execution_command_status_context_links c"))
      return {rows:[],rowCount:0};
    if(sql.includes("FROM execution_command_status_preparations p")) {
      const p=[...preparations.values()].find(v=>v.context_digest===(args[0] as unknown[])[0] && v.consumed_at===null);
      return {rows:p?[{...p,pm_status_request_digest:p.pm_request_digest}]:[],rowCount:p?1:0};
    }
    return {rows:sql.includes("elp210_candidate.authority")?[{revision:"7",drain_id:null}]:[{command_id:status.command_id}],rowCount:1};
  })};
  const access={usesPool:(p:unknown)=>p===pool,readContext:vi.fn(async()=>context()),confirmReadContext:vi.fn(async()=>context())};
  let count=0;
  const issueLease=vi.fn(async(a,b)=>{
    const lease=`TEST_ONLY:lease-${++count}`,iat=Math.floor(Date.now()/1000),exp=iat+30;
    return {token:await new SignJWT({...b,purpose:"pma.identity.v1",sub:a.user_id,sid:a.session_id,
      session_revision:a.session_generation,authority_revision:2,jti:lease,iat,exp}).setProtectedHeader({alg:"EdDSA"}).sign(key.privateKey),
      lease_id:lease,expires_at_ms:exp*1000,authority_revision:2};
  });
  const outstanding=new Map<string,string>(),acknowledged=new Map<string,string>();
  const canReplaceResolvedIssue=vi.fn(async(_a,_b,_issued)=>false);
  const candidate={issue:issueLease,revalidateIssue:vi.fn(async()=>undefined),canReplaceResolvedIssue,
    resumeCommandStatusIssue:vi.fn(async(_actor:AccessActor,_binding:unknown,_leaseId:string):Promise<{token:string;lease_id:string;expires_at_ms:number;authority_revision:number}>=>{throw new Error("TEST_ONLY:not configured");}),
    issueCommandStatus:vi.fn(async(a,b,_link?:unknown)=>{
      const k=accessDigest({actor:a,binding:b});
      if(outstanding.has(k))throw new CurrentHumanLeaseError("CURRENT_HUMAN_COMMAND_STATUS_RECOVERY_REQUIRED");
      // Hold even an ambiguous issue error: it might have committed.
      outstanding.set(k,"TEST_ONLY:ISSUE_UNKNOWN");
      const result=await issueLease(a,b);outstanding.set(k,result.lease_id);return result;
    }),
    acknowledgeCommandStatusIssue:vi.fn(async(a,b,issued,responseDigest)=>{
      if(!await canReplaceResolvedIssue(a,b,issued))return false;
      if(acknowledged.has(issued.lease_id))return acknowledged.get(issued.lease_id)===responseDigest;
      const k=accessDigest({actor:a,binding:b});if(outstanding.get(k)!==issued.lease_id)return false;
      outstanding.delete(k);acknowledged.set(issued.lease_id,responseDigest);return true;
    })};
  const config={issuer:"TEST_ONLY:core",audience:original.gateway_ref,key_id:"TEST_ONLY:key",key:key.privateKey,
    workload_id:"TEST_ONLY:edge-status",ttl_ms:30000,maximum_contexts:4,maximum_requests_per_context:4};
  const authority=new CommandSourceAssertionAuthority(pool as unknown as Pool,access as unknown as ExecutionAccessService,candidate,config);
  const input:CommandStatusInput={authorization,intent,actor,original,action:"STATUS",
    call_digest:accessDigest({action:"STATUS",authority:"CURRENT_REQUESTER",requester_digest:accessDigest(actor),original,
      authorization_digest:accessDigest(authorization),intent_hash:authorization.intent_hash}),
    contract:{reference:"TEST_ONLY:contract",sha256:"a".repeat(64),edge_source_revision:"TEST_ONLY:source"},signal:new AbortController().signal};
  const pmBody=JSON.stringify({schema_version:"pma.edge-command-transport.v1",reference:"TEST_ONLY:distinct-PM-reference",
    payload:{TEST_ONLY:"source mapped payload"},transport_payload_digest:original.transport_payload_digest});
  const pmDigest=pmHttpRequestDigest({method:"POST",raw_path:Buffer.from(COMMAND_STATUS_PM_PATH),query_string:Buffer.alloc(0),body:Buffer.from(pmBody)},
    {request_bytes:1048576});
  const body=JSON.stringify({schema_version:"execution.core-command-status-request.v1",original,call_digest:input.call_digest,
    pm_status_request_digest:pmDigest,core_request:{schema_version:"execution.core-pm-original.v1",action:"STATUS",key:"TEST_ONLY:key",
      operation:"TOP_UP",payload:{TEST_ONLY:"independent mapping"},payload_digest:original.transport_payload_digest,request_digest:original.request_digest}});
  const issue={schema_version:"portal.execution.command-source-assertion-request.v1",binding_digest:accessDigest({original,call:input.call_digest}),
    receiver_id:original.gateway_ref,workload_id:config.workload_id,method:"POST",path:COMMAND_STATUS_PM_PATH,body_utf8:pmBody,request_digest:pmDigest,
    delivery_sequence:0,previous_lease_id:null};
  const completion=(r:CommandSourceAssertionResponse)=>({schema_version:"portal.execution.command-source-assertion-completion-request.v1",
    binding_digest:issue.binding_digest,receiver_id:issue.receiver_id,workload_id:issue.workload_id,delivery_sequence:r.delivery_sequence,
    lease_id:r.lease_id,request_digest:r.request_digest,response_digest:accessDigest("TEST_ONLY:PM response bytes")});
  return {authority,input,body,issue,completion,candidate,access,pool,row,state,grant,config};
}
describe("purpose-specific current-requester command STATUS authority",()=>{
  it("cannot bind recovery while a STATUS preparation is in flight",async()=>{
    const f=setup(),target=f.authority as any,authorize=target.authorize.bind(f.authority);
    let release!:()=>void,entered!:()=>void;
    const held=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
    vi.spyOn(target,"authorize").mockImplementation(async input=>{entered();await held;return authorize(input);});
    const preparation=f.authority.prepare(f.input,f.body);
    await started;
    try {
      expect(()=>f.authority.bindRecoverySource({original:async()=>structuredClone(f.input.original)},f.input.contract)).toThrow();
    } finally {release();}
    await expect(preparation).resolves.toHaveProperty("original_context");
  });
  it("refuses a noncanonical recoverable call before reserving or issuing",async()=>{
    const f=setup();f.authority.bindRecoverySource({original:async()=>structuredClone(f.input.original)},f.input.contract);
    const call_digest=accessDigest("TEST_ONLY:noncanonical-call"),input={...f.input,call_digest};
    const body=JSON.stringify({...JSON.parse(f.body),call_digest});
    await expect(f.authority.prepare(input,body)).rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_BINDING_MISMATCH",status:403});
    expect(f.authority.snapshot()).toMatchObject({contexts:0,pending:0});
    expect(f.candidate.issueCommandStatus).not.toHaveBeenCalled();
  });
  it("passes the exact PM request and original context link to the issuance and revalidation seams",async()=>{
    const f=setup(),prepared=await f.authority.prepare(f.input,f.body);
    await f.authority.issue(prepared.original_context,f.issue);
    const issueArgs=f.candidate.issueCommandStatus.mock.calls[0] as unknown as unknown[];
    const link=issueArgs[2] as Record<string,unknown>;
    expect(link).toMatchObject({context_digest:accessDigest(prepared.original_context),
      original_digest:accessDigest(f.input.original),call_digest:f.input.call_digest,
      binding_digest:f.issue.binding_digest,receiver_id:f.issue.receiver_id,delivery_sequence:0,previous_lease_id:null});
    expect(issueArgs[3]).toEqual({method:"POST",raw_path:Buffer.from(COMMAND_STATUS_PM_PATH),
      query_string:Buffer.alloc(0),body:Buffer.from(f.issue.body_utf8)});
    const revalidateArgs=f.candidate.revalidateIssue.mock.calls[0] as unknown as unknown[];
    expect(revalidateArgs[3]).toEqual(link);
  });
  it("refuses a reused STATUS context when the authority deadline shrinks without a fingerprint change",async()=>{
    const f=setup(), prepared=await f.authority.prepare(f.input,f.body);
    f.state.lease=NOW+5000;
    await expect(f.authority.check(prepared.original_context,f.input))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_AUTHORITY_CHANGED",status:409});
    await expect(f.authority.prepare(f.input,f.body))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_AUTHORITY_CHANGED",status:409});
    await expect(f.authority.issue(prepared.original_context,f.issue))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_AUTHORITY_CHANGED",status:409});
    expect(f.candidate.issueCommandStatus).not.toHaveBeenCalled();
  });
  it("rechecks current authority for an already-acknowledged completion retry",async()=>{
    const f=setup(), prepared=await f.authority.prepare(f.input,f.body);
    const issued=await f.authority.issue(prepared.original_context,f.issue),request=f.completion(issued);
    f.candidate.canReplaceResolvedIssue.mockResolvedValue(true);
    await f.authority.complete(prepared.original_context,request);
    f.state.lease=NOW+5000;
    await expect(f.authority.complete(prepared.original_context,request))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_AUTHORITY_CHANGED",status:409});
    expect(f.candidate.acknowledgeCommandStatusIssue).toHaveBeenCalledOnce();
  });
  it("preserves an ACK but refuses disclosure if authority changes while ACK commits",async()=>{
    const f=setup(), prepared=await f.authority.prepare(f.input,f.body);
    const issued=await f.authority.issue(prepared.original_context,f.issue),request=f.completion(issued);
    f.candidate.canReplaceResolvedIssue.mockResolvedValue(true);
    const ack=f.candidate.acknowledgeCommandStatusIssue.getMockImplementation()!;
    f.candidate.acknowledgeCommandStatusIssue.mockImplementation(async(...args)=>{
      const value=await ack(...args); f.state.lease=NOW+5000; return value;
    });
    await expect(f.authority.complete(prepared.original_context,request))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_AUTHORITY_CHANGED",status:409});
    expect(f.candidate.acknowledgeCommandStatusIssue).toHaveBeenCalledOnce();
    await expect(f.authority.complete(prepared.original_context,request)).rejects.toThrow();
    expect(f.candidate.acknowledgeCommandStatusIssue).toHaveBeenCalledOnce();
  });
  it("refuses a sub-second remaining STATUS lifetime before a context or lease can escape",async()=>{
    const f=setup();f.state.lease=NOW+500;
    f.authority.bindRecoverySource({original:async()=>structuredClone(f.input.original)},f.input.contract);
    await expect(f.authority.prepare(f.input,f.body))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_EXPIRED",status:403});
    expect(f.authority.snapshot().contexts).toBe(0);
    expect(f.candidate.issueCommandStatus).not.toHaveBeenCalled();
    const db=await f.pool.connect();
    expect(db.query.mock.calls.some(([sql])=>sql.startsWith("INSERT INTO execution_command_status_preparations"))).toBe(false);
  });
  it("replaces only a locally consumed STATUS preparation after exact terminal ACK",async()=>{
    const f=setup();f.authority.bindRecoverySource({original:async()=>structuredClone(f.input.original)},f.input.contract);
    const first=await f.authority.prepare(f.input,f.body),issued=await f.authority.issue(first.original_context,f.issue);
    f.candidate.canReplaceResolvedIssue.mockResolvedValue(true);
    await f.authority.complete(first.original_context,f.completion(issued));
    await f.authority.acknowledgeRetainedRead(first.original_context,f.input);
    const second=await f.authority.prepare(f.input,f.body);
    expect(second.original_context).not.toBe(first.original_context);
    expect(f.candidate.issueCommandStatus).toHaveBeenCalledOnce();
    expect(f.candidate.acknowledgeCommandStatusIssue).toHaveBeenCalledOnce();
  });
  it("enforces the bounded preparation capacity before a STATUS context can escape",async()=>{
    const f=setup();f.authority.bindRecoverySource({original:async()=>structuredClone(f.input.original)},f.input.contract);
    const db=await f.pool.connect(),query=db.query.getMockImplementation()!;
    db.query.mockImplementation(async(sql:string,values:unknown[]=[])=>
      sql.startsWith("SELECT count(*)::int AS total FROM execution_command_status_preparations")
        ? {rows:[{total:f.config.maximum_contexts}],rowCount:1}:query(sql,values));
    await expect(f.authority.prepare(f.input,f.body))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_CAPACITY_EXHAUSTED",status:429});
    expect(f.authority.snapshot().contexts).toBe(0);
    expect(f.candidate.issueCommandStatus).not.toHaveBeenCalled();
  });
  it("does not replace a persisted preparation with different outbound bytes",async()=>{
    const f=setup(),original={original:async()=>structuredClone(f.input.original)};
    f.authority.bindRecoverySource(original,f.input.contract);
    await f.authority.prepare(f.input,f.body);
    const second=new CommandSourceAssertionAuthority(f.pool as unknown as Pool,
      f.access as unknown as ExecutionAccessService,f.candidate,f.config);
    second.bindRecoverySource(original,f.input.contract);
    await expect(second.prepare(f.input,f.body+" "))
      .rejects.toMatchObject({code:"COMMAND_STATUS_PREPARATION_MISMATCH"});
    expect(f.candidate.issueCommandStatus).not.toHaveBeenCalled();
  });
  it("does not publish a preparation when the locked lease fence finds a concurrent winner",async()=>{
    const f=setup();f.authority.bindRecoverySource({original:async()=>structuredClone(f.input.original)},f.input.contract);
    const db=await f.pool.connect(),query=db.query.getMockImplementation()!;
    db.query.mockImplementation(async(sql:string,values:unknown[]=[])=>
      sql.includes("LEFT JOIN execution_command_status_context_links")
        ? {rows:[{lease_id:"TEST_ONLY:concurrent-winner"}],rowCount:1}:query(sql,values));
    await expect(f.authority.prepare(f.input,f.body))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_CUSTODY_RECOVERY_REQUIRED",status:409});
    expect(f.candidate.issueCommandStatus).not.toHaveBeenCalled();
    expect(f.authority.snapshot().contexts).toBe(0);
  });
  it("restores the same persisted pre-lease context after restart without fabricating an ACK",async()=>{
    const f=setup();
    const call_digest=accessDigest({action:"STATUS",authority:"CURRENT_REQUESTER",requester_digest:accessDigest(f.input.actor),
      original:f.input.original,authorization_digest:accessDigest(f.input.authorization),intent_hash:f.input.authorization.intent_hash});
    const input={...f.input,call_digest};
    const body=JSON.stringify({...JSON.parse(f.body),call_digest});
    const issue={...f.issue,binding_digest:accessDigest({original:input.original,call:call_digest})};
    const original=vi.fn(async()=>structuredClone(input.original));
    f.authority.bindRecoverySource({original},input.contract);
    const prepared=await f.authority.prepare(input,body);
    f.authority.shutdown();
    const resumed=new CommandSourceAssertionAuthority(f.pool as unknown as Pool,
      f.access as unknown as ExecutionAccessService,f.candidate,f.config);
    resumed.bindRecoverySource({original},input.contract);
    f.state.current=false;
    await expect(resumed.issue(prepared.original_context,issue)).rejects.toThrow();
    expect(f.candidate.issueCommandStatus).not.toHaveBeenCalled();
    f.state.current=true;
    const result=await resumed.issue(prepared.original_context,issue);
    expect(result.lease_id).toBe("TEST_ONLY:lease-1");
    expect(f.candidate.issueCommandStatus).toHaveBeenCalledOnce();
    expect(f.candidate.resumeCommandStatusIssue).not.toHaveBeenCalled();
    expect(f.candidate.acknowledgeCommandStatusIssue).not.toHaveBeenCalled();
    expect(original).toHaveBeenCalled();
  });
  it("fails closed after restart when preparation escaped but no lease or durable link was issued",async()=>{
    const f=setup(),prepared=await f.authority.prepare(f.input,f.body);
    f.authority.shutdown();
    expect(f.authority.snapshot().contexts).toBe(0);
    const previous=f.pool.query.getMockImplementation()!;
    f.pool.query.mockImplementation(async(sql:string,...args:unknown[])=>
      sql.includes("FROM execution_command_status_context_links c") ||
      sql.includes("LEFT JOIN execution_command_status_context_links") ? {rows:[],rowCount:0} : previous(sql,...args));
    const resumed=new CommandSourceAssertionAuthority(f.pool as unknown as Pool,
      f.access as unknown as ExecutionAccessService,f.candidate,f.config);
    const original=vi.fn(async()=>structuredClone(f.input.original));
    resumed.bindRecoverySource({original},f.input.contract);
    await expect(resumed.issue(prepared.original_context,f.issue))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_CONTEXT_REQUIRED"});
    // No durable pre-issue reservation exists: preparing again is NOT a
    // recovery of the exact context Edge may already hold in ACQUIRING.
    const replacement=await resumed.prepare(f.input,f.body);
    expect(replacement.original_context).not.toBe(prepared.original_context);
    expect(original).not.toHaveBeenCalled();
    expect(f.candidate.issueCommandStatus).not.toHaveBeenCalled();
    expect(f.candidate.resumeCommandStatusIssue).not.toHaveBeenCalled();
    expect(f.candidate.acknowledgeCommandStatusIssue).not.toHaveBeenCalled();
  });
  it("rejoins the committed lease after a same-process C2 custody timeout without a second ISSUE or ACK",async()=>{
    const f=setup();
    const call_digest=accessDigest({action:"STATUS",authority:"CURRENT_REQUESTER",requester_digest:accessDigest(f.input.actor),
      original:f.input.original,authorization_digest:accessDigest(f.input.authorization),intent_hash:f.input.authorization.intent_hash});
    const input={...f.input,call_digest},body=JSON.stringify({...JSON.parse(f.body),call_digest});
    const issue={...f.issue,binding_digest:accessDigest({original:input.original,call:call_digest})};
    const original=vi.fn(async()=>structuredClone(input.original));
    f.authority.bindRecoverySource({original},input.contract);
    const prepared=await f.authority.prepare(input,body),issueOnce=f.candidate.issueCommandStatus.getMockImplementation()!;
    let persisted:Record<string,unknown>|undefined;
    f.candidate.issueCommandStatus.mockImplementation(async(a,b,link)=>{
      const issued=await issueOnce(a,b,link);
      persisted={...(link as Record<string,unknown>),lease_id:issued.lease_id,subject_id:a.user_id,
        session_id:a.session_id,session_revision:a.session_generation,workspace_id:input.intent.workspace_id,
        environment:"paper",workload_id:issue.workload_id,request_digest:issue.request_digest,command_id:f.row.command_id,
        pm_status_request_digest:issue.request_digest};
      f.candidate.resumeCommandStatusIssue.mockResolvedValue(issued);
      throw new C2CustodyPendingError(issued.lease_id);
    });
    const query=f.pool.query.getMockImplementation()!;let hideLink=false;
    f.pool.query.mockImplementation(async(sql:string,...args:unknown[])=>
      sql.includes("FROM execution_command_status_context_links c")&&sql.includes("JOIN elp210_candidate.leases")
        ? persisted&&!hideLink ? {rows:[persisted],rowCount:1} : {rows:[],rowCount:0} : query(sql,...args));
    await expect(f.authority.issue(prepared.original_context,issue))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_CUSTODY_RECOVERY_REQUIRED"});
    await expect(f.authority.issue(prepared.original_context,{...issue,receiver_id:"TEST_ONLY:wrong"}))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_BINDING_MISMATCH"});
    hideLink=true;
    await expect(f.authority.issue(prepared.original_context,issue))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_CUSTODY_RECOVERY_REQUIRED"});
    expect(f.candidate.issueCommandStatus).toHaveBeenCalledOnce();
    hideLink=false;
    const recovered=await f.authority.issue(prepared.original_context,issue);
    expect(recovered.lease_id).toBe("TEST_ONLY:lease-1");
    expect(f.candidate.issueCommandStatus).toHaveBeenCalledOnce();
    expect(f.candidate.resumeCommandStatusIssue).toHaveBeenCalledOnce();
    expect(f.candidate.acknowledgeCommandStatusIssue).not.toHaveBeenCalled();
    expect(original).toHaveBeenCalledOnce();
  });
  async function restartedCompletion() {
    const f=setup();
    const call_digest=accessDigest({action:"STATUS",authority:"CURRENT_REQUESTER",requester_digest:accessDigest(f.input.actor),
      original:f.input.original,authorization_digest:accessDigest(f.input.authorization),intent_hash:f.input.authorization.intent_hash});
    const input={...f.input,call_digest};
    const body=JSON.stringify({...JSON.parse(f.body),call_digest});
    const issue={...f.issue,binding_digest:accessDigest({original:input.original,call:call_digest})};
    const prepared=await f.authority.prepare(input,body), lease=await f.authority.issue(prepared.original_context,issue);
    const {signal:_signal,...captured}=input;
    const fingerprint=(await (f.authority as any).authorize(captured)).fingerprint;
    const completion={...f.completion(lease),binding_digest:issue.binding_digest};
    const persisted=f.candidate.issueCommandStatus.mock.calls[0][2] as {context_nonce:string};
    const link={lease_id:lease.lease_id,context_nonce:persisted.context_nonce,context_digest:accessDigest(prepared.original_context),previous_lease_id:issue.previous_lease_id,original_digest:accessDigest(input.original),call_digest,binding_digest:issue.binding_digest,
      authority_fingerprint:fingerprint,request_digest:issue.request_digest,receiver_id:issue.receiver_id,
      status_token_digest:accessDigest(prepared.token),status_request_digest:prepared.prepared.delivered_request_digest,
      status_issued_at_ms:prepared.prepared.issued_at_ms,
      context_expires_at_ms:prepared.prepared.expires_at_ms,subject_id:input.actor.user_id,session_id:input.actor.session_id,
      session_revision:input.actor.session_generation,workspace_id:input.intent.workspace_id,environment:"paper",
      workload_id:issue.workload_id,expires_at_ms:lease.expires_at_ms,authority_revision:lease.authority_revision,
      command_id:f.row.command_id,pm_status_request_digest:issue.request_digest};
    const query=f.pool.query.getMockImplementation()!;
    f.pool.query.mockImplementation(async(sql:string,...args:unknown[])=>{
      if(sql.includes("FROM elp210_candidate.leases l") && sql.includes("LEFT JOIN execution_command_status_context_links"))
        return {rows:[structuredClone(link)],rowCount:1};
      if(sql.includes("FROM execution_command_status_context_links c")) {
        const values=args[0] as unknown[];
        const matched=values[0]===accessDigest(prepared.original_context)&&values[1]===completion.delivery_sequence&&
          (values.length===2 || values[2]===lease.lease_id);
        return {rows:matched?[structuredClone(link)]:[],rowCount:matched?1:0};
      }
      return query(sql,...args);
    });
    const resumed=new CommandSourceAssertionAuthority(f.pool as unknown as Pool,f.access as unknown as ExecutionAccessService,f.candidate,f.config);
    const original=vi.fn(async()=>structuredClone(input.original));
    resumed.bindRecoverySource({original},input.contract);
    f.candidate.canReplaceResolvedIssue.mockResolvedValue(true);
    f.candidate.resumeCommandStatusIssue.mockResolvedValue({token:lease.assertion,lease_id:lease.lease_id,
      expires_at_ms:lease.expires_at_ms,authority_revision:lease.authority_revision});
    return {f,input,issue,prepared,lease,fingerprint,completion,link,resumed,original};
  }
  it("replays only the exact ISSUED assertion after authority restart, without issuing a new lease",async()=>{
    const r=await restartedCompletion();
    expect(await r.resumed.issue(r.prepared.original_context,r.issue)).toEqual(r.lease);
    expect(r.f.candidate.resumeCommandStatusIssue).toHaveBeenCalledOnce();
    const args=r.f.candidate.resumeCommandStatusIssue.mock.calls[0] as unknown as unknown[];
    expect(args[3]).toEqual({method:"POST",raw_path:Buffer.from(COMMAND_STATUS_PM_PATH),
      query_string:Buffer.alloc(0),body:Buffer.from(r.issue.body_utf8)});
    expect(args[4]).toMatchObject({context_digest:accessDigest(r.prepared.original_context),
      original_digest:accessDigest(r.input.original),call_digest:r.input.call_digest,
      binding_digest:r.issue.binding_digest,delivery_sequence:0,previous_lease_id:null});
    expect(r.f.candidate.issueCommandStatus).toHaveBeenCalledOnce();
    expect(r.f.candidate.acknowledgeCommandStatusIssue).not.toHaveBeenCalled();
  });
  it("restores the exact outbound context and token before the original pinned callback",async()=>{
    const r=await restartedCompletion();
    const body=JSON.stringify({...JSON.parse(r.f.body),call_digest:r.input.call_digest});
    const resumed=await r.resumed.prepare(r.input,body);
    expect(resumed).toEqual(r.prepared);
    await r.resumed.issue(r.prepared.original_context,r.issue);
    await expect(r.resumed.prepare(r.input,body+" ")).rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_DELIVERY_REQUEST_MISMATCH"});
    expect(r.f.candidate.issueCommandStatus).toHaveBeenCalledOnce();
  });
  it("refuses changed public nonce without creating a replacement lease",async()=>{
    const r=await restartedCompletion();r.link.context_nonce="a".repeat(43);
    const body=JSON.stringify({...JSON.parse(r.f.body),call_digest:r.input.call_digest});
    await expect(r.resumed.prepare(r.input,body)).rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_CUSTODY_RECOVERY_REQUIRED"});
    expect(r.f.candidate.issueCommandStatus).toHaveBeenCalledOnce();
  });
  it("does not recover an old context with a rotated signing key",async()=>{
    const r=await restartedCompletion(),replacement=await generateKeyPair("EdDSA",{crv:"Ed25519"});
    const rotated=new CommandSourceAssertionAuthority(r.f.pool as unknown as Pool,r.f.access as unknown as ExecutionAccessService,
      r.f.candidate,{...r.f.config,key:replacement.privateKey});
    rotated.bindRecoverySource({original:r.original},r.input.contract);
    const body=JSON.stringify({...JSON.parse(r.f.body),call_digest:r.input.call_digest});
    await expect(rotated.prepare(r.input,body)).rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_CUSTODY_RECOVERY_REQUIRED"});
    expect(r.f.candidate.issueCommandStatus).toHaveBeenCalledOnce();
  });
  it("does not recover a link from a different session or request body",async()=>{
    const r=await restartedCompletion(),body=JSON.stringify({...JSON.parse(r.f.body),call_digest:r.input.call_digest});
    r.link.session_id="TEST_ONLY:other-session";
    await expect(r.resumed.prepare(r.input,body)).rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_CUSTODY_RECOVERY_REQUIRED"});
    r.link.session_id=r.input.actor.session_id;
    await expect(r.resumed.prepare(r.input,body+" ")).rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_CUSTODY_RECOVERY_REQUIRED"});
    expect(r.f.candidate.issueCommandStatus).toHaveBeenCalledOnce();
  });
  it("rejoins the winning durable context after a competing pre-INSERT issue is fenced",async()=>{
    const r=await restartedCompletion(),query=r.f.pool.query.getMockImplementation()!;
    let hideWinner=true;
    r.f.pool.query.mockImplementation(async(sql:string,...args:unknown[])=>
      hideWinner && sql.includes("LEFT JOIN execution_command_status_context_links")
        ? {rows:[],rowCount:0} : query(sql,...args));
    const contender=new CommandSourceAssertionAuthority(r.f.pool as unknown as Pool,
      r.f.access as unknown as ExecutionAccessService,r.f.candidate,r.f.config);
    contender.bindRecoverySource({original:r.original},r.input.contract);
    const body=JSON.stringify({...JSON.parse(r.f.body),call_digest:r.input.call_digest});
    const rival=await contender.prepare(r.input,body);
    expect(rival.original_context).not.toBe(r.prepared.original_context);
    hideWinner=false;
    await expect(contender.issue(rival.original_context,r.issue))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_CUSTODY_RECOVERY_REQUIRED"});
    expect(await contender.prepare(r.input,body)).toEqual(r.prepared);
    expect(r.f.candidate.issue).toHaveBeenCalledOnce();
    await expect(contender.issue(rival.original_context,r.issue))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_CONTEXT_REQUIRED"});
  });
  it("refuses an altered persisted status-token pin during restart",async()=>{
    const r=await restartedCompletion();r.link.status_token_digest=accessDigest("TEST_ONLY:changed-status-token");
    await expect(r.resumed.issue(r.prepared.original_context,r.issue)).rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_CONTEXT_CHANGED"});
    expect(r.f.candidate.issueCommandStatus).toHaveBeenCalledOnce();
  });
  it("does not release a restored outbound read until its linked terminal and Edge ACK are retained",async()=>{
    const r=await restartedCompletion();await r.resumed.issue(r.prepared.original_context,r.issue);
    const originalQuery=r.f.pool.query.getMockImplementation()!;let unresolved=1,lockedUnresolved=1;
    const db=await r.f.pool.connect(), originalDbQuery=db.query.getMockImplementation()!;
    db.query.mockImplementation(async(sql:string,values:unknown[]=[])=>
      sql.startsWith("WITH ordered AS") ? {rows:[{total:2,unresolved:lockedUnresolved}],rowCount:1} :
      sql.startsWith("SELECT context_digest,call_digest,binding_digest FROM execution_command_status_preparations")
        ? {rows:[{context_digest:accessDigest(r.prepared.original_context),call_digest:r.input.call_digest,
          binding_digest:r.issue.binding_digest}],rowCount:1} :
      sql.startsWith("UPDATE execution_command_status_preparations SET consumed_at=")
        ? {rows:[],rowCount:1} : originalDbQuery(sql,values));
    r.f.pool.query.mockImplementation(async(sql:string,...args:unknown[])=>
      sql.includes("count(*)::int AS total") ? {rows:[{total:2,unresolved}],rowCount:1} : originalQuery(sql,...args));
    await expect(r.resumed.acknowledgeRetainedRead(r.prepared.original_context,r.input))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_DELIVERY_NOT_COMPLETED"});
    const censusCall=r.f.pool.query.mock.calls.find(([sql])=>sql.includes("count(*)::int AS total"));
    expect(censusCall?.[1]).toEqual([accessDigest(r.prepared.original_context),accessDigest(r.input.original),
      r.input.call_digest,accessDigest({original:r.input.original,call:r.input.call_digest}),r.input.actor.user_id,
      r.input.actor.session_id,r.input.actor.session_generation,r.input.intent.workspace_id,r.f.config.workload_id]);
    unresolved=0;
    await expect(r.resumed.acknowledgeRetainedRead(r.prepared.original_context,r.input))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_DELIVERY_NOT_COMPLETED"});
    lockedUnresolved=0;
    await expect(r.resumed.acknowledgeRetainedRead(r.prepared.original_context,r.input)).resolves.toBeUndefined();
  });
  it("rejects changed request bytes, previous lease or revoked authority before recovery",async()=>{
    const r=await restartedCompletion();
    await expect(r.resumed.issue(r.prepared.original_context,{...r.issue,body_utf8:r.issue.body_utf8+" "})).rejects.toThrow();
    await expect(r.resumed.issue(r.prepared.original_context,{...r.issue,previous_lease_id:"TEST_ONLY:different"})).rejects.toThrow();
    r.f.state.current=false;
    await expect(r.resumed.issue(r.prepared.original_context,r.issue)).rejects.toThrow();
    expect(r.original).not.toHaveBeenCalled();expect(r.f.candidate.resumeCommandStatusIssue).not.toHaveBeenCalled();
  });
  it("rejects changed source original or authority during an issue recovery before re-signing",async()=>{
    const changed=await restartedCompletion();
    changed.original.mockResolvedValueOnce({...changed.input.original,reference:"TEST_ONLY:substituted"});
    await expect(changed.resumed.issue(changed.prepared.original_context,changed.issue))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_ORIGINAL_MISMATCH"});
    expect(changed.f.candidate.resumeCommandStatusIssue).not.toHaveBeenCalled();
    const revoked=await restartedCompletion();
    revoked.original.mockImplementationOnce(async()=>{revoked.f.state.fingerprint=accessDigest("TEST_ONLY:changed-during-read");
      return structuredClone(revoked.input.original);});
    await expect(revoked.resumed.issue(revoked.prepared.original_context,revoked.issue))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_AUTHORITY_CHANGED"});
    expect(revoked.f.candidate.resumeCommandStatusIssue).not.toHaveBeenCalled();
  });
  it("will not return a replayed assertion that expires during the final check",async()=>{
    const r=await restartedCompletion(),expires=NOW+10_000;
    r.f.candidate.resumeCommandStatusIssue.mockResolvedValueOnce({token:r.lease.assertion,lease_id:r.lease.lease_id,
      expires_at_ms:expires,authority_revision:r.lease.authority_revision});
    r.f.candidate.revalidateIssue.mockImplementationOnce(async()=>{vi.mocked(Date.now).mockReturnValue(expires);});
    await expect(r.resumed.issue(r.prepared.original_context,r.issue)).rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_EXPIRED"});
  });
  it("recovers an authenticated Edge ACK for the exact old context and terminal lease after authority restart",async()=>{
    const r=await restartedCompletion();
    const ack=await r.resumed.complete(r.prepared.original_context,r.completion);
    expect(ack).toMatchObject({completed:true,lease_id:r.lease.lease_id,response_digest:r.completion.response_digest});
    expect(await r.resumed.complete(r.prepared.original_context,r.completion)).toEqual(ack);
    const retryBody=JSON.stringify({...JSON.parse(r.f.body),call_digest:r.input.call_digest});
    expect(await r.resumed.prepare(r.input,retryBody)).toEqual(r.prepared);
    expect(r.original).toHaveBeenCalledTimes(2);
    expect(r.f.candidate.issueCommandStatus).toHaveBeenCalledOnce();
    expect(r.f.candidate.acknowledgeCommandStatusIssue).toHaveBeenCalledTimes(2);
    expect(r.f.candidate.acknowledgeCommandStatusIssue.mock.calls[0]![2]).toEqual({
      lease_id:r.lease.lease_id,expires_at_ms:r.lease.expires_at_ms,authority_revision:r.lease.authority_revision});
  });
  it("refuses restart recovery before any source read if the old actor was revoked",async()=>{
    const r=await restartedCompletion();r.f.state.current=false;
    await expect(r.resumed.complete(r.prepared.original_context,r.completion)).rejects.toThrow();
    expect(r.original).not.toHaveBeenCalled();expect(r.f.candidate.acknowledgeCommandStatusIssue).not.toHaveBeenCalled();
  });
  it("refuses restart recovery before reading the original if the authority deadline shrank",async()=>{
    const r=await restartedCompletion();r.f.state.lease=NOW+5000;
    await expect(r.resumed.complete(r.prepared.original_context,r.completion))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_AUTHORITY_CHANGED",status:409});
    expect(r.original).not.toHaveBeenCalled();
    expect(r.f.candidate.acknowledgeCommandStatusIssue).not.toHaveBeenCalled();
  });
  it("rejects a changed authority fingerprint before reading the original",async()=>{
    const r=await restartedCompletion();r.f.state.fingerprint=accessDigest("TEST_ONLY:changed-authority");
    await expect(r.resumed.complete(r.prepared.original_context,r.completion)).rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_AUTHORITY_CHANGED"});
    expect(r.original).not.toHaveBeenCalled();expect(r.f.candidate.acknowledgeCommandStatusIssue).not.toHaveBeenCalled();
  });
  it("rejects authority changes during original recovery before acknowledging delivery",async()=>{
    const r=await restartedCompletion();
    r.original.mockImplementationOnce(async()=>{r.f.state.fingerprint=accessDigest("TEST_ONLY:changed-during-source");return structuredClone(r.input.original);});
    await expect(r.resumed.complete(r.prepared.original_context,r.completion)).rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_AUTHORITY_CHANGED"});
    expect(r.f.candidate.acknowledgeCommandStatusIssue).not.toHaveBeenCalled();
  });
  it("refuses restart recovery for a substituted source original or unknown context",async()=>{
    const r=await restartedCompletion();
    r.original.mockResolvedValueOnce({...r.input.original,reference:"TEST_ONLY:substituted"});
    await expect(r.resumed.complete(r.prepared.original_context,r.completion)).rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_ORIGINAL_MISMATCH"});
    await expect(r.resumed.complete("X".repeat(43),r.completion)).rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_CONTEXT_REQUIRED"});
    expect(r.f.candidate.acknowledgeCommandStatusIssue).not.toHaveBeenCalled();
  });
  it("never completes an UNKNOWN/unterminated lease or creates a replacement on recovery",async()=>{
    const r=await restartedCompletion();r.f.candidate.canReplaceResolvedIssue.mockResolvedValue(false);
    await expect(r.resumed.complete(r.prepared.original_context,r.completion)).rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_TERMINAL_NOT_CONFIRMED"});
    expect(r.f.candidate.acknowledgeCommandStatusIssue).not.toHaveBeenCalled();
    expect(r.f.candidate.issueCommandStatus).toHaveBeenCalledOnce();
  });
  it("refuses expired recovery or changed binding before a source read",async()=>{
    const r=await restartedCompletion();
    await expect(r.resumed.complete(r.prepared.original_context,{...r.completion,binding_digest:accessDigest("TEST_ONLY:changed-binding")}))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_COMPLETION_MISMATCH"});
    vi.mocked(Date.now).mockReturnValue(r.prepared.prepared.expires_at_ms);
    await expect(r.resumed.complete(r.prepared.original_context,r.completion)).rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_CONTEXT_REQUIRED"});
    expect(r.original).not.toHaveBeenCalled();expect(r.f.candidate.acknowledgeCommandStatusIssue).not.toHaveBeenCalled();
  });
  it("will not replace an existing ACK with different response bytes after restart",async()=>{
    const r=await restartedCompletion();
    await r.resumed.complete(r.prepared.original_context,r.completion);
    await expect(r.resumed.complete(r.prepared.original_context,{...r.completion,response_digest:accessDigest("TEST_ONLY:changed-ack")}))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_TERMINAL_NOT_CONFIRMED"});
    expect(r.f.candidate.issueCommandStatus).toHaveBeenCalledOnce();
  });
  it("already-retained local STATUS completes no fabricated PM delivery and renews current proof",async()=>{
    const f=setup(),first=await f.authority.prepare(f.input,f.body);
    await f.authority.acknowledgeRetainedRead(first.original_context,f.input);
    const second=await f.authority.prepare(f.input,f.body);
    expect(second.original_context).not.toBe(first.original_context);
    expect(f.candidate.issue).not.toHaveBeenCalled();expect(f.candidate.canReplaceResolvedIssue).not.toHaveBeenCalled();
  });
  it("refuses issuance on a context after its retained STATUS response is consumed",async()=>{
    const f=setup(),prepared=await f.authority.prepare(f.input,f.body);
    await f.authority.acknowledgeRetainedRead(prepared.original_context,f.input);
    await expect(f.authority.issue(prepared.original_context,f.issue))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_CONTEXT_REQUIRED",status:403});
    expect(f.candidate.issueCommandStatus).not.toHaveBeenCalled();
    const next=await f.authority.prepare(f.input,f.body);
    expect(next.original_context).not.toBe(prepared.original_context);
  });
  it("does not issue while retained STATUS consumption is in flight",async()=>{
    const f=setup();f.authority.bindRecoverySource({original:async()=>structuredClone(f.input.original)},f.input.contract);
    const prepared=await f.authority.prepare(f.input,f.body),db=await f.pool.connect(),query=db.query.getMockImplementation()!;
    let unblock!:()=>void,started!:()=>void;
    const gate=new Promise<void>(resolve=>{unblock=resolve;}),entered=new Promise<void>(resolve=>{started=resolve;});
    db.query.mockImplementation(async(sql:string,values:unknown[]=[])=>{
      if(sql.startsWith("SELECT context_digest,call_digest,binding_digest FROM execution_command_status_preparations")) {
        started();await gate;
      }
      return query(sql,values);
    });
    const consumed=f.authority.acknowledgeRetainedRead(prepared.original_context,f.input);
    try {
      await entered;
      await expect(f.authority.issue(prepared.original_context,f.issue))
        .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_CONTEXT_REQUIRED",status:403});
      expect(f.candidate.issueCommandStatus).not.toHaveBeenCalled();
    } finally {unblock();await consumed;}
  });
  it("releases the local close fence if retained STATUS consumption fails",async()=>{
    const f=setup();f.authority.bindRecoverySource({original:async()=>structuredClone(f.input.original)},f.input.contract);
    const prepared=await f.authority.prepare(f.input,f.body),db=await f.pool.connect(),query=db.query.getMockImplementation()!;
    db.query.mockImplementation(async(sql:string,values:unknown[]=[])=>{
      if(sql.startsWith("SELECT context_digest,call_digest,binding_digest FROM execution_command_status_preparations"))
        throw new Error("TEST_ONLY:failed consume");
      return query(sql,values);
    });
    await expect(f.authority.acknowledgeRetainedRead(prepared.original_context,f.input)).rejects.toThrow("TEST_ONLY:failed consume");
    db.query.mockImplementation(query);
    const issued=await f.authority.issue(prepared.original_context,f.issue);
    expect(issued.delivery_sequence).toBe(0);
    expect(f.candidate.issueCommandStatus).toHaveBeenCalledOnce();
  });
  it("local retained-read completion cannot overwrite unresolved actual PM identity custody",async()=>{
    const f=setup(),p=await f.authority.prepare(f.input,f.body);
    await f.authority.issue(p.original_context,f.issue);
    await expect(f.authority.acknowledgeRetainedRead(p.original_context,f.input)).rejects.toThrow();
    expect((await f.authority.prepare(f.input,f.body)).original_context).toBe(p.original_context);
    expect(f.candidate.issue).toHaveBeenCalledOnce();
  });
  it("signs actual reviewer/session and immutable original, not original author or READ purpose",async()=>{
    const f=setup(),p=await f.authority.prepare(f.input,f.body),verified=await jwtVerify(p.token,key.publicKey,
      {issuer:f.config.issuer,audience:f.config.audience,currentDate:new Date(NOW)});
    expect(verified.payload).toMatchObject({purpose:"execution.command-status-authority.v1",action:"STATUS",sub:actor.user_id,current_actor:actor.user_id,
      sid:actor.session_id,session_generation:3,authorization_id:f.input.authorization.reference,intent_id:f.input.authorization.intent_hash,
      original_sha256:accessDigest(f.input.original),original_context:p.original_context,
      authority_revision:"7",scope_revision:expect.any(String),policy_revision:f.input.intent.expected_policy_revision,
      field_policy_ref:null});
    expect(p.prepared.delivered_request_digest).toBe(pmHttpRequestDigest({method:"POST",raw_path:Buffer.from(COMMAND_STATUS_EDGE_PATH),
      query_string:Buffer.alloc(0),body:Buffer.from(f.body)},{request_bytes:131072}));
    expect(p.prepared.delivered_request_digest).not.toBe(f.issue.request_digest);expect(f.candidate.issue).not.toHaveBeenCalled();
    expect(f.access.confirmReadContext).toHaveBeenCalled();expect(f.pool.query.mock.calls.find(call=>call[0].includes("key_hash=$2"))).toEqual([expect.stringContaining("key_hash=$2"),
      [f.input.intent.workspace_id,accessDigest(f.input.intent.business_payload.idempotency_key)]]);
  });
  it("fresh concurrent prepares and exact delivery retries coalesce",async()=>{
    const f=setup(),ps=await Promise.all(Array.from({length:5},()=>f.authority.prepare(f.input,f.body)));
    expect(new Set(ps.map(p=>p.original_context)).size).toBe(1);
    const responses=await Promise.all(Array.from({length:5},()=>f.authority.issue(ps[0].original_context,f.issue)));
    expect(f.candidate.issue).toHaveBeenCalledOnce();expect(new Set(responses.map(r=>r.lease_id)).size).toBe(1);
    expect(decodeJwt(responses[0].assertion)).toMatchObject({purpose:"pma.identity.v1",request_digest:f.issue.request_digest,sub:actor.user_id});
  });
  it("rejects a conflicting body for the same concurrent STATUS original and call",async()=>{
    const f=setup(),conflicting=JSON.stringify({...JSON.parse(f.body),
      pm_status_request_digest:accessDigest("TEST_ONLY:conflicting-PM-request")});
    const [first,second]=await Promise.allSettled([
      f.authority.prepare(f.input,f.body),f.authority.prepare(f.input,conflicting),
    ]);
    expect(first.status).toBe("fulfilled");
    expect(second).toMatchObject({status:"rejected",reason:{code:"COMMAND_STATUS_ASSERTION_DELIVERY_REQUEST_MISMATCH",status:409}});
    if(first.status!=="fulfilled")throw first.reason;
    expect((await f.authority.prepare(f.input,f.body)).original_context).toBe(first.value.original_context);
    await expect(f.authority.prepare(f.input,conflicting)).rejects.toMatchObject({
      code:"COMMAND_STATUS_ASSERTION_DELIVERY_REQUEST_MISMATCH",status:409});
    expect(f.candidate.issue).not.toHaveBeenCalled();
  });
  it("rejects different contract input for the same pending STATUS call",async()=>{
    const f=setup(),changed={...f.input,contract:{...f.input.contract,reference:"TEST_ONLY:other-contract"}};
    const [first,second]=await Promise.allSettled([
      f.authority.prepare(f.input,f.body),f.authority.prepare(changed,f.body),
    ]);
    expect(first.status).toBe("fulfilled");
    expect(second).toMatchObject({status:"rejected",reason:{code:"COMMAND_STATUS_ASSERTION_DELIVERY_REQUEST_MISMATCH",status:409}});
    await expect(f.authority.prepare(changed,f.body)).rejects.toMatchObject({
      code:"COMMAND_STATUS_ASSERTION_DELIVERY_REQUEST_MISMATCH",status:409});
    expect(f.candidate.issue).not.toHaveBeenCalled();
  });
  it("releases the logical-call reservation after a failed preparation",async()=>{
    const f=setup(),target=f.authority as any;
    vi.spyOn(target,"authorize").mockRejectedValueOnce(new Error("TEST_ONLY:authority-unavailable"));
    await expect(f.authority.prepare(f.input,f.body)).rejects.toThrow("TEST_ONLY:authority-unavailable");
    const conflicting=JSON.stringify({...JSON.parse(f.body),pm_status_request_digest:accessDigest("TEST_ONLY:replacement")});
    await expect(f.authority.prepare(f.input,conflicting)).resolves.toHaveProperty("original_context");
    expect(f.candidate.issue).not.toHaveBeenCalled();
  });
  it("bounds distinct pending STATUS preparations before the authority I/O finishes",async()=>{
    const f=setup(),target=f.authority as any,original=target.authorize.bind(f.authority);
    let release!:()=>void,entered!:()=>void,count=0;
    const held=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
    vi.spyOn(target,"authorize").mockImplementation(async input=>{
      if(++count===f.config.maximum_contexts)entered();
      await held;return original(input);
    });
    const call=(index:number)=>{
      const call_digest=accessDigest(`TEST_ONLY:pending-${index}`);
      return f.authority.prepare({...f.input,call_digest},JSON.stringify({...JSON.parse(f.body),call_digest}));
    };
    const pending=Array.from({length:f.config.maximum_contexts},(_,index)=>call(index));
    await started;
    const during=f.authority.snapshot();
    // An exact retry joins an existing preparation even at the unique limit.
    const joined=call(0);
    const excess=call(f.config.maximum_contexts).then(()=>"UNEXPECTED_SUCCESS",error=>error.code);
    let disposition:string;
    try {
      disposition=await Promise.race([excess,new Promise<string>(resolve=>setTimeout(()=>resolve("WAITING"),50))]);
    } finally { release(); }
    const settled=await Promise.allSettled([...pending,joined,excess]);
    expect(disposition).toBe("COMMAND_STATUS_ASSERTION_CAPACITY_EXHAUSTED");
    expect(during).toMatchObject({preparing:f.config.maximum_contexts});
    expect(settled.slice(0,f.config.maximum_contexts+1).every(value=>value.status==="fulfilled")).toBe(true);
    const first=settled[0],duplicate=settled[f.config.maximum_contexts];
    if(first.status!=="fulfilled"||duplicate.status!=="fulfilled")throw new Error("expected prepared results");
    expect(duplicate.value.original_context).toBe(first.value.original_context);
    expect(f.authority.snapshot()).toMatchObject({preparing:0});
    expect(f.candidate.issue).not.toHaveBeenCalled();
  });
  it("bounds coalesced waiters and releases their slots on cancellation",async()=>{
    const f=setup(),target=f.authority as any,original=target.authorize.bind(f.authority);
    let release!:()=>void,entered!:()=>void,first=true;
    const held=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
    vi.spyOn(target,"authorize").mockImplementation(async input=>{
      if(first){first=false;entered();await held;}
      return original(input);
    });
    const limit=f.config.maximum_contexts*f.config.maximum_requests_per_context;
    const controllers=Array.from({length:limit},()=>new AbortController());
    const waiters=controllers.map(controller=>f.authority.prepare({...f.input,signal:controller.signal},f.body));
    // Observe the canceled promise before dispatching abort.
    const canceled=waiters[0].then(()=>"UNEXPECTED_SUCCESS",error=>error.code);
    await started;
    const before=f.authority.snapshot();
    const excess=f.authority.prepare(f.input,f.body).then(()=>"UNEXPECTED_SUCCESS",error=>error.code);
    const outcome=await Promise.race([excess,new Promise<string>(resolve=>setTimeout(()=>resolve("WAITING"),50))]);
    controllers[0].abort();const canceledCode=await canceled;
    const replacement=f.authority.prepare(f.input,f.body);
    release();
    const results=await Promise.allSettled([...waiters.slice(1),replacement,excess]);
    expect(before).toMatchObject({preparing:1,preparation_waiters:limit});
    expect(outcome).toBe("COMMAND_STATUS_ASSERTION_CAPACITY_EXHAUSTED");
    expect(canceledCode).toBe("COMMAND_STATUS_ASSERTION_ABORTED");
    expect(results.slice(0,-1).every(result=>result.status==="fulfilled")).toBe(true);
    expect(f.authority.snapshot()).toMatchObject({preparing:0,preparation_waiters:0});
    expect(f.candidate.issue).not.toHaveBeenCalled();
  });
  it("detaches repeatedly canceled waiters from a held shared preparation",async()=>{
    const f=setup(),target=f.authority as any,original=target.authorize.bind(f.authority);
    let release!:()=>void,entered!:()=>void,first=true;
    const held=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
    vi.spyOn(target,"authorize").mockImplementation(async input=>{
      if(first){first=false;entered();await held;}return original(input);
    });
    const initial=new AbortController(),firstWait=f.authority.prepare({...f.input,signal:initial.signal},f.body);
    await started;
    const shared=[...target.preparing.values()][0] as {promise:Promise<unknown>;waiters:Set<unknown>};
    try {
      initial.abort();await expect(firstWait).rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_ABORTED"});
      for(let index=0;index<128;index++){
        const controller=new AbortController(),waiter=f.authority.prepare({...f.input,signal:controller.signal},f.body);
        controller.abort();await expect(waiter).rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_ABORTED"});
        expect(shared.waiters.size).toBe(0);
      }
      expect(f.authority.snapshot()).toMatchObject({preparing:1,preparation_waiters:0});
    } finally { release(); }
    await expect(shared.promise).resolves.toMatchObject({original_context:expect.any(String)});
    expect(f.candidate.issue).not.toHaveBeenCalled();
  });
  it("reclaims a new STATUS context that was never delivered to any canceled waiter",async()=>{
    const f=setup(),target=f.authority as any,original=target.authorize.bind(f.authority);
    let release!:()=>void,entered!:()=>void,first=true;
    const held=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
    vi.spyOn(target,"authorize").mockImplementation(async input=>{
      if(first){first=false;entered();await held;}return original(input);
    });
    const controller=new AbortController(),cancelled=f.authority.prepare({...f.input,signal:controller.signal},f.body);
    await started;
    const shared=([...target.preparing.values()][0] as {promise:Promise<unknown>}).promise;
    try {
      controller.abort();await expect(cancelled).rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_ABORTED"});
    } finally { release(); }
    await shared;
    expect(f.authority.snapshot()).toMatchObject({contexts:0,preparing:0,preparation_waiters:0});
    expect(target.calls.size).toBe(0);
    expect(f.candidate.issue).not.toHaveBeenCalled();
    const retry=await f.authority.prepare(f.input,f.body);
    expect(Object.keys(retry).sort()).toEqual(["original_context","prepared","token"]);
    expect(retry.prepared.call_digest).toBe(f.input.call_digest);
    expect(f.candidate.issue).not.toHaveBeenCalled();
  });
  it("does not reclaim a previously delivered context or outstanding lease when a retry is canceled",async()=>{
    const f=setup(),ready=await f.authority.prepare(f.input,f.body);
    const issued=await f.authority.issue(ready.original_context,f.issue);
    const target=f.authority as any,original=target.authorize.bind(f.authority);
    let release!:()=>void,entered!:()=>void,first=true;
    const held=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
    vi.spyOn(target,"authorize").mockImplementation(async input=>{
      if(first){first=false;entered();await held;}return original(input);
    });
    const controller=new AbortController(),cancelled=f.authority.prepare({...f.input,signal:controller.signal},f.body);
    await started;
    const shared=([...target.preparing.values()][0] as {promise:Promise<unknown>}).promise;
    try {
      controller.abort();await expect(cancelled).rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_ABORTED"});
    } finally { release(); }
    await shared;
    expect(f.authority.snapshot()).toMatchObject({contexts:1,preparing:0,preparation_waiters:0});
    expect((await f.authority.prepare(f.input,f.body)).original_context).toBe(ready.original_context);
    expect((await f.authority.issue(ready.original_context,f.issue)).lease_id).toBe(issued.lease_id);
    expect(f.candidate.issue).toHaveBeenCalledOnce();
  });
  it("isolates caller cancellation when concurrent STATUS prepares share the same original",async()=>{
    const f=setup(), first=new AbortController(), second=new AbortController();
    const cancelled=f.authority.prepare({...f.input,signal:first.signal},f.body);
    // Abort before the shared prepare microtask starts; the live caller must
    // still receive the same original without creating a native identity.
    first.abort();
    const live=f.authority.prepare({...f.input,signal:second.signal},f.body);
    await expect(cancelled).rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_ABORTED",status:499});
    const ready=await live;
    expect(ready.original_context).toBeTruthy();
    expect(f.candidate.issue).not.toHaveBeenCalled();
    expect((await f.authority.prepare({...f.input,signal:second.signal},f.body)).original_context).toBe(ready.original_context);
  });
  it("never returns a coalesced STATUS preparation to an already aborted caller",async()=>{
    const f=setup(),aborted=new AbortController();aborted.abort();
    const live=f.authority.prepare(f.input,f.body);
    await expect(f.authority.prepare({...f.input,signal:aborted.signal},f.body))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_ABORTED",status:499});
    expect((await live).original_context).toBeTruthy();
    expect(f.candidate.issue).not.toHaveBeenCalled();
  });
  it("refuses a new STATUS preparation before authority I/O after shutdown",async()=>{
    const f=setup();f.authority.shutdown();
    await expect(f.authority.prepare(f.input,f.body)).rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_STOPPED"});
    expect(f.access.readContext).not.toHaveBeenCalled();expect(f.candidate.issue).not.toHaveBeenCalled();
  });
  it("releases an aborted waiter promptly without interrupting a held shared authority read",async()=>{
    const f=setup(),target=f.authority as any,original=target.authorize.bind(f.authority);
    let release!:()=>void,entered!:()=>void;
    const held=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
    let firstCheck=true;
    vi.spyOn(target,"authorize").mockImplementation(async input=>{
      if(firstCheck){firstCheck=false;entered();await held;}
      return original(input);
    });
    const first=new AbortController(),second=new AbortController();
    const cancelled=f.authority.prepare({...f.input,signal:first.signal},f.body);
    const live=f.authority.prepare({...f.input,signal:second.signal},f.body);
    await started;first.abort();
    await expect(cancelled).rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_ABORTED",status:499});
    release();
    expect((await live).original_context).toBeTruthy();
    expect(f.candidate.issue).not.toHaveBeenCalled();
  });
  it("tracks a canceled caller's held preparation through shutdown without issuing custody",async()=>{
    const f=setup(),target=f.authority as any,original=target.authorize.bind(f.authority);
    let release!:()=>void,entered!:()=>void;
    const held=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
    vi.spyOn(target,"authorize").mockImplementation(async input=>{entered();await held;return original(input);});
    const controller=new AbortController(),cancelled=f.authority.prepare({...f.input,signal:controller.signal},f.body);
    await started;
    const shared=([...target.preparing.values()][0] as {promise:Promise<unknown>}).promise;
    try {
      controller.abort();await expect(cancelled).rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_ABORTED",status:499});
      f.authority.shutdown();expect(f.authority.snapshot()).toMatchObject({preparing:1,stopped:true});
    } finally { release(); }
    await expect(shared).rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_STOPPED"});
    expect(f.authority.snapshot()).toMatchObject({preparing:0,contexts:0});
    expect(f.candidate.issue).not.toHaveBeenCalled();
  });
  it("captures the original before the asynchronous shared preparation starts",async()=>{
    const f=setup(),gateway=f.input.original.gateway_ref;
    const pending=f.authority.prepare(f.input,f.body);
    f.input.original.gateway_ref="TEST_ONLY:changed-after-prepare";
    expect((await pending).prepared.gateway_ref).toBe(gateway);
    expect(f.candidate.issue).not.toHaveBeenCalled();
  });
  it("refuses an aborted caller at the STATUS delivery fence",async()=>{
    const f=setup(),ready=await f.authority.prepare(f.input,f.body),signal=new AbortController();
    signal.abort();
    const before=f.access.readContext.mock.calls.length;
    await expect(f.authority.check(ready.original_context,{...f.input,signal:signal.signal}))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_ABORTED",status:499});
    expect(f.access.readContext.mock.calls.length).toBe(before);
  });
  it("does not complete an original's retained-read custody for an aborted caller",async()=>{
    const f=setup(),ready=await f.authority.prepare(f.input,f.body),controller=new AbortController();
    controller.abort();
    await expect(f.authority.acknowledgeRetainedRead(ready.original_context,{...f.input,signal:controller.signal}))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_ABORTED",status:499});
    expect((await f.authority.prepare(f.input,f.body)).original_context).toBe(ready.original_context);
    expect(f.candidate.issue).not.toHaveBeenCalled();
  });
  it("refuses STATUS delivery if cancellation arrives during the final authority read",async()=>{
    const f=setup(),ready=await f.authority.prepare(f.input,f.body),target=f.authority as any;
    const original=target.authorize.bind(f.authority);
    let release!:()=>void,entered!:()=>void;
    const held=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
    vi.spyOn(target,"authorize").mockImplementation(async input=>{entered();await held;return original(input);});
    const controller=new AbortController();
    const check=f.authority.check(ready.original_context,{...f.input,signal:controller.signal});
    await started;controller.abort();release();
    await expect(check).rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_ABORTED",status:499});
    expect(f.candidate.issue).not.toHaveBeenCalled();
  });
  it("refuses a reused STATUS preparation if authority changes between its two fresh checks",async()=>{
    const f=setup(),first=await f.authority.prepare(f.input,f.body);
    const target=f.authority as any, original=target.authorize.bind(f.authority);let checks=0;
    vi.spyOn(target,"authorize").mockImplementation(async input=>{
      const result=await original(input);
      if(++checks===1)f.state.fingerprint=accessDigest("TEST_ONLY:changed-between-checks");
      return result;
    });
    await expect(f.authority.prepare(f.input,f.body)).rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_AUTHORITY_CHANGED",status:409});
    expect(checks).toBe(2);expect(f.authority.snapshot().contexts).toBe(1);
    expect(f.candidate.issue).not.toHaveBeenCalled();
    await expect(f.authority.check(first.original_context,f.input)).rejects.toThrow();
  });
  it("cleans only an unissued STATUS reservation when the final prepare check fails",async()=>{
    const f=setup(),target=f.authority as any,original=target.authorize.bind(f.authority);let checks=0;
    const spy=vi.spyOn(target,"authorize").mockImplementation(async input=>{
      const count=++checks,result=await original(input);
      if(count%2===1)f.state.current=false;
      return result;
    });
    for(let attempt=0;attempt<6;attempt++) {
      f.state.current=true;
      await expect(f.authority.prepare(f.input,f.body)).rejects.toThrow();
      expect(f.authority.snapshot().contexts).toBe(0);
    }
    expect(f.candidate.issue).not.toHaveBeenCalled();
    spy.mockRestore();f.state.current=true;
    const prepared=await f.authority.prepare(f.input,f.body);
    expect(prepared.original_context).toBeTruthy();expect(f.authority.snapshot().contexts).toBe(1);
    expect(f.candidate.issue).not.toHaveBeenCalled();
  });
  it.each(["financial","READ","SUBMIT"])("refuses %s callback purpose/path before any identity ISSUE",async mode=>{
    const f=setup(),p=await f.authority.prepare(f.input,f.body);
    await expect(f.authority.issue(p.original_context,{...f.issue,...(mode==="financial"?{schema_version:"portal.execution.financial-source-assertion-request.v1"}:
      {path:mode==="SUBMIT"?"/internal/elp210/pm-command/submit":"/native/read"})})).rejects.toThrow();
    expect(f.candidate.issue).not.toHaveBeenCalled();
  });
  it.each(["revoke","session","source-unqualified","original-changed"])("freshly fences %s before callback issuance",async mode=>{
    const f=setup(),p=await f.authority.prepare(f.input,f.body);
    if(mode==="revoke")f.grant.revoked_at_ms=NOW;if(mode==="session")f.state.current=false;
    if(mode==="source-unqualified")f.access.readContext.mockRejectedValue(new Error("TEST_ONLY source unavailable"));
    if(mode==="original-changed")f.row.authorization_fact.reference="TEST_ONLY:replaced-original";
    await expect(f.authority.issue(p.original_context,f.issue)).rejects.toThrow();expect(f.candidate.issue).not.toHaveBeenCalled();
  });
  it("does not replace an ambiguous original ISSUE after retry",async()=>{
    const f=setup(),p=await f.authority.prepare(f.input,f.body);f.candidate.issue.mockRejectedValueOnce(new Error("TEST_ONLY unknown COMMIT"));
    for(let n=0;n<2;n++)await expect(f.authority.issue(p.original_context,f.issue)).rejects.toThrow("unknown COMMIT");
    expect(f.candidate.issue).toHaveBeenCalledOnce();
  });
  it("passes only digest correlation, exact sequence and expiry to the durable lease writer",async()=>{
    const f=setup(),p=await f.authority.prepare(f.input,f.body);
    await f.authority.issue(p.original_context,f.issue);
    const call=f.candidate.issueCommandStatus.mock.calls[0] as unknown as [unknown,unknown,unknown];
    expect(call[2]).toMatchObject({context_digest:accessDigest(p.original_context),
      original_digest:accessDigest(f.input.original),call_digest:f.input.call_digest,
      binding_digest:f.issue.binding_digest,receiver_id:f.issue.receiver_id,delivery_sequence:0,previous_lease_id:null,
      context_expires_at_ms:p.prepared.expires_at_ms});
    expect(JSON.stringify(call[2])).not.toContain(p.original_context);
    expect(JSON.stringify(call[2])).not.toContain("body_utf8");
  });
  it("keeps an unacknowledged original fenced after authority reconstruction",async()=>{
    const f=setup(),first=await f.authority.prepare(f.input,f.body);
    const issued=await f.authority.issue(first.original_context,f.issue);
    const restarted=new CommandSourceAssertionAuthority(f.pool as unknown as Pool,
      f.access as unknown as ExecutionAccessService,f.candidate,f.config);
    const fresh=await restarted.prepare(f.input,f.body);
    await expect(restarted.issue(fresh.original_context,f.issue))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_CUSTODY_RECOVERY_REQUIRED",status:409});
    expect(f.candidate.issue).toHaveBeenCalledOnce();
    f.candidate.canReplaceResolvedIssue.mockResolvedValue(true);
    await f.authority.complete(first.original_context,f.completion(issued));
    const recovered=await restarted.issue(fresh.original_context,f.issue);
    expect(recovered.lease_id).not.toBe(issued.lease_id);
    expect(f.candidate.issue).toHaveBeenCalledTimes(2);
  });
  it("does not spend the delivery quota on definite pre-issue custody refusals",async()=>{
    const f=setup(),first=await f.authority.prepare(f.input,f.body);
    const issued=await f.authority.issue(first.original_context,f.issue);
    const restarted=new CommandSourceAssertionAuthority(f.pool as unknown as Pool,
      f.access as unknown as ExecutionAccessService,f.candidate,f.config);
    const fresh=await restarted.prepare(f.input,f.body);
    // Every attempt is refused by the writer before it can INSERT a lease.
    // Exceed the context's lifetime ISSUE quota to distinguish an actual
    // issuance from a no-op refusal; the original is still fenced throughout.
    for(let attempt=0;attempt<f.config.maximum_requests_per_context+2;attempt++) {
      await expect(restarted.issue(fresh.original_context,f.issue))
        .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_CUSTODY_RECOVERY_REQUIRED",status:409});
    }
    expect(f.candidate.issue).toHaveBeenCalledOnce();
    f.candidate.canReplaceResolvedIssue.mockResolvedValue(true);
    await f.authority.complete(first.original_context,f.completion(issued));
    const recovered=await restarted.issue(fresh.original_context,f.issue);
    expect(recovered.lease_id).not.toBe(issued.lease_id);
    expect(f.candidate.issue).toHaveBeenCalledTimes(2);
  });
  it.each(["CURRENT_HUMAN_CAPACITY_EXHAUSTED","CURRENT_HUMAN_DRAINING"])(
    "permits same-context retry after definite pre-INSERT %s",async code=>{
      const f=setup(),p=await f.authority.prepare(f.input,f.body);
      for(let attempt=0;attempt<f.config.maximum_requests_per_context+2;attempt++) {
        f.candidate.issueCommandStatus.mockRejectedValueOnce(new CurrentHumanLeaseError(code));
        await expect(f.authority.issue(p.original_context,f.issue)).rejects.toMatchObject({code});
      }
      expect(f.candidate.issue).not.toHaveBeenCalled();
      const issued=await f.authority.issue(p.original_context,f.issue);
      expect(issued.lease_id).toBeTruthy();expect(f.candidate.issue).toHaveBeenCalledOnce();
    });
  it("refunds one reservation for coalesced pre-INSERT refusals, never one per waiter",async()=>{
    const f=setup(),p=await f.authority.prepare(f.input,f.body);
    let entered!:()=>void,release!:()=>void;
    const started=new Promise<void>(resolve=>{entered=resolve;}),held=new Promise<void>(resolve=>{release=resolve;});
    f.candidate.issueCommandStatus.mockImplementationOnce(async()=>{
      entered();await held;throw new CurrentHumanLeaseError("CURRENT_HUMAN_CAPACITY_EXHAUSTED");
    });
    const attempts=Array.from({length:16},()=>f.authority.issue(p.original_context,f.issue).catch(error=>error));
    await started;
    // Let all exact concurrent callers reach the held shared promise before
    // its pre-INSERT rejection settles.
    await new Promise<void>(resolve=>setTimeout(resolve,0));release();
    for(const error of await Promise.all(attempts))expect(error).toMatchObject({code:"CURRENT_HUMAN_CAPACITY_EXHAUSTED"});
    expect(f.candidate.issueCommandStatus).toHaveBeenCalledOnce();
    expect(f.candidate.issue).not.toHaveBeenCalled();
    f.candidate.canReplaceResolvedIssue.mockResolvedValue(true);
    let previous:string|null=null;
    for(let sequence=0;sequence<f.config.maximum_requests_per_context;sequence++) {
      const issued=await f.authority.issue(p.original_context,{...f.issue,delivery_sequence:sequence,previous_lease_id:previous});
      await f.authority.complete(p.original_context,f.completion(issued));
      previous=issued.lease_id;
    }
    await expect(f.authority.issue(p.original_context,{...f.issue,
      delivery_sequence:f.config.maximum_requests_per_context,previous_lease_id:previous}))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_CAPACITY_EXHAUSTED",status:429});
    expect(f.candidate.issue).toHaveBeenCalledTimes(f.config.maximum_requests_per_context);
  });
  it("still applies the delivery quota to actual acknowledged issues",async()=>{
    const f=setup(),p=await f.authority.prepare(f.input,f.body);
    f.candidate.canReplaceResolvedIssue.mockResolvedValue(true);
    let previous:string|null=null;
    for(let sequence=0;sequence<f.config.maximum_requests_per_context;sequence++) {
      const issued=await f.authority.issue(p.original_context,{...f.issue,delivery_sequence:sequence,previous_lease_id:previous});
      await f.authority.complete(p.original_context,f.completion(issued));
      previous=issued.lease_id;
    }
    await expect(f.authority.issue(p.original_context,{...f.issue,
      delivery_sequence:f.config.maximum_requests_per_context,previous_lease_id:previous}))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_CAPACITY_EXHAUSTED",status:429});
    expect(f.candidate.issue).toHaveBeenCalledTimes(f.config.maximum_requests_per_context);
  });
  it("does not return a superseded STATUS assertion after delayed revalidation",async()=>{
    const f=setup(),p=await f.authority.prepare(f.input,f.body),first=await f.authority.issue(p.original_context,f.issue);
    let release!:()=>void,entered!:()=>void;
    const held=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
    f.candidate.revalidateIssue.mockImplementationOnce(async()=>{entered();await held;});
    const retry=f.authority.issue(p.original_context,f.issue).catch(error=>error);
    await started;
    f.candidate.canReplaceResolvedIssue.mockResolvedValue(true);
    await f.authority.complete(p.original_context,f.completion(first));
    const successor=await f.authority.issue(p.original_context,{...f.issue,delivery_sequence:1,previous_lease_id:first.lease_id});
    expect(successor.lease_id).not.toBe(first.lease_id);
    release();
    expect(await retry).toMatchObject({code:"COMMAND_STATUS_ASSERTION_DELIVERY_REQUEST_MISMATCH"});
  });
  it("counts and bounds held STATUS revalidations during shutdown",async()=>{
    const f=setup(),p=await f.authority.prepare(f.input,f.body);
    await f.authority.issue(p.original_context,f.issue);
    let release!:()=>void;const held=new Promise<undefined>(resolve=>{release=()=>resolve(undefined);});
    f.candidate.revalidateIssue.mockImplementation(()=>held);
    const retries=Array.from({length:16},()=>f.authority.issue(p.original_context,f.issue).catch(error=>error));
    await vi.waitFor(()=>expect(f.candidate.revalidateIssue).toHaveBeenCalledTimes(17));
    expect(f.authority.snapshot()).toMatchObject({pending:16,contexts:1});
    await expect(f.authority.issue(p.original_context,f.issue)).rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_CAPACITY_EXHAUSTED"});
    f.authority.shutdown();
    expect(f.authority.snapshot()).toMatchObject({pending:16,contexts:1,stopped:true});
    release();const results=await Promise.all(retries);
    expect(results.every(result=>result.code==="COMMAND_STATUS_ASSERTION_CONTEXT_REQUIRED")).toBe(true);
    expect(f.authority.snapshot().pending).toBe(0);
    expect(f.candidate.issueCommandStatus).toHaveBeenCalledOnce();
  });
  it("retries a lost ACK response against the same delivered lease without another ISSUE",async()=>{
    const f=setup(),p=await f.authority.prepare(f.input,f.body),issued=await f.authority.issue(p.original_context,f.issue);
    f.candidate.canReplaceResolvedIssue.mockResolvedValue(true);
    const acknowledge=f.candidate.acknowledgeCommandStatusIssue.getMockImplementation()!;
    f.candidate.acknowledgeCommandStatusIssue.mockImplementationOnce(async(...args)=>{
      await acknowledge(...args);throw new Error("TEST_ONLY:lost response after ACK commit");
    });
    const request=f.completion(issued);
    await expect(f.authority.complete(p.original_context,request)).rejects.toThrow("lost response after ACK commit");
    expect(await f.authority.complete(p.original_context,request)).toMatchObject({
      completed:true,lease_id:issued.lease_id,response_digest:request.response_digest});
    expect(f.candidate.issue).toHaveBeenCalledOnce();
  });
  it("requires exact source PM bytes instead of guessing Core/PM reference equality",async()=>{
    const f=setup(),p=await f.authority.prepare(f.input,f.body);
    expect(f.issue.body_utf8).not.toContain(f.input.original.reference);
    await expect(f.authority.issue(p.original_context,{...f.issue,request_digest:accessDigest("other")})).rejects.toThrow();
    expect(f.candidate.issue).not.toHaveBeenCalled();expect((await f.authority.issue(p.original_context,f.issue)).request_digest).toBe(f.issue.request_digest);
  });
  it("fresh STATUS needs delivery ACK and persisted terminal, expiry alone cannot rotate",async()=>{
    const f=setup(),p=await f.authority.prepare(f.input,f.body),issued=await f.authority.issue(p.original_context,f.issue);
    expect((await f.authority.prepare(f.input,f.body)).original_context).toBe(p.original_context);
    await expect(f.authority.complete(p.original_context,f.completion(issued))).rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_TERMINAL_NOT_CONFIRMED"});
    f.candidate.canReplaceResolvedIssue.mockResolvedValue(true);await f.authority.complete(p.original_context,f.completion(issued));
    // Callback ACK is not delivery of Edge's retained response to Core. A
    // concurrent retry in this gap must rejoin, not create a new context.
    expect((await f.authority.prepare(f.input,f.body)).original_context).toBe(p.original_context);
    expect(f.candidate.issue).toHaveBeenCalledOnce();
    await f.authority.acknowledgeRetainedRead(p.original_context,f.input);
    const next=await f.authority.prepare(f.input,f.body);expect(next.original_context).not.toBe(p.original_context);
    const nextIssued=await f.authority.issue(next.original_context,f.issue);expect(nextIssued.lease_id).not.toBe(issued.lease_id);
    expect(f.candidate.issue).toHaveBeenCalledTimes(2);
  });
  it.each(["core-fingerprint","actor","original","prepared-never-sent"])("refuses %s without new authority",async mode=>{
    const f=setup(),p=await f.authority.prepare(f.input,f.body);
    if(mode==="core-fingerprint")f.state.fingerprint=accessDigest("new");
    if(mode==="actor")f.input.actor={...actor,user_id:"TEST_ONLY:other"};
    if(mode==="original")f.input.original={...f.input.original,reference:"TEST_ONLY:changed"};
    if(mode==="prepared-never-sent")f.row.status.delivery="PREPARED";
    await expect(f.authority.check(p.original_context,f.input)).rejects.toThrow();expect(f.candidate.issue).not.toHaveBeenCalled();
  });
  it("expired unfinished delivery remains fenced, process restart cannot fabricate context",async()=>{
    const f=setup(),p=await f.authority.prepare(f.input,f.body);await f.authority.issue(p.original_context,f.issue);
    vi.mocked(Date.now).mockReturnValue(NOW+30000);await expect(f.authority.prepare(f.input,f.body)).rejects.toThrow();
    const fresh=setup();await expect(fresh.authority.issue(p.original_context,f.issue)).rejects.toThrow();expect(fresh.candidate.issue).not.toHaveBeenCalled();
  });
});
