/** TEST_ONLY: real Core audit evaluator and Ed25519/HTTP byte binding with
 * synthetic repository/identity ports. No PostgreSQL/native/PM qualification. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Pool } from "pg";
import { decodeJwt, generateKeyPair, jwtVerify, SignJWT } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessEvaluationContext } from "../src/execution-v2/access-policy";
import { accessDigest } from "../src/execution-v2/access-digest";
import type { ExecutionAccessService } from "../src/execution-v2/access.service";
import { commandAuthorization } from "../src/execution-v2/command-trust";
import { commandIntent, commandStatus } from "../src/execution-v2/command.contract";
import { CommandSourceAssertionAuthority, COMMAND_STATUS_PM_PATH, COMMAND_STATUS_EDGE_PATH,
  type CommandStatusInput, type CommandSourceAssertionResponse } from "../src/execution-v2/command-source-assertion";
import { pmHttpRequestDigest } from "../src/execution-v2/pm-http-request-binding";

const fixture=JSON.parse(readFileSync(resolve(__dirname,"../../../packages/contracts/fixtures/execution-trusted-commands.synthetic.valid.json"),"utf8"));
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
  const db={query:vi.fn(async(sql:string)=>({rows:sql.startsWith("SELECT command_id,workspace_id")?[structuredClone(row)]:[],rowCount:1})),release:vi.fn()};
  const pool={connect:vi.fn(async()=>db),query:vi.fn(async(sql:string,..._args:unknown[])=>({
    rows:sql.includes("elp210_candidate.authority")?[{revision:"7",drain_id:null}]:[{command_id:status.command_id}],rowCount:1}))};
  const access={usesPool:(p:unknown)=>p===pool,readContext:vi.fn(async()=>context()),confirmReadContext:vi.fn(async()=>context())};
  let count=0;
  const candidate={issue:vi.fn(async(a,b)=>{
    const lease=`TEST_ONLY:lease-${++count}`,iat=Math.floor(Date.now()/1000),exp=iat+30;
    return {token:await new SignJWT({...b,purpose:"pma.identity.v1",sub:a.user_id,sid:a.session_id,
      session_revision:a.session_generation,authority_revision:2,jti:lease,iat,exp}).setProtectedHeader({alg:"EdDSA"}).sign(key.privateKey),
      lease_id:lease,expires_at_ms:exp*1000,authority_revision:2};
  }),revalidateIssue:vi.fn(async()=>undefined),canReplaceResolvedIssue:vi.fn(async()=>false)};
  const config={issuer:"TEST_ONLY:core",audience:original.gateway_ref,key_id:"TEST_ONLY:key",key:key.privateKey,
    workload_id:"TEST_ONLY:edge-status",ttl_ms:30000,maximum_contexts:4,maximum_requests_per_context:4};
  const authority=new CommandSourceAssertionAuthority(pool as unknown as Pool,access as unknown as ExecutionAccessService,candidate,config);
  const input:CommandStatusInput={authorization,intent,actor,original,action:"STATUS",call_digest:accessDigest("TEST_ONLY:logical-call"),
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
  it("already-retained local STATUS completes no fabricated PM delivery and renews current proof",async()=>{
    const f=setup(),first=await f.authority.prepare(f.input,f.body);
    await f.authority.acknowledgeRetainedRead(first.original_context,f.input);
    const second=await f.authority.prepare(f.input,f.body);
    expect(second.original_context).not.toBe(first.original_context);
    expect(f.candidate.issue).not.toHaveBeenCalled();expect(f.candidate.canReplaceResolvedIssue).not.toHaveBeenCalled();
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
