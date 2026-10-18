/** TEST_ONLY focused stable-native consumer orchestration and epoch isolation.
 * No DB, TLS or physical ACK evidence is claimed here: actual native ledger/
 * TLS/COMMIT/send evidence stays in the NC03/frame integration profile.
 * This file uses real safe DTO, registry, selected-source opaque construction,
 * actual Candidate construction and existing continuation/cache serializers.
 * Intended test/elp210-native-manager-consumer.spec.ts. NOT_RUN.
 */
import { createHash } from "node:crypto";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { generateKeyPair, type KeyLike } from "jose";
import type { Pool } from "pg";
import type { FastifyReply } from "fastify";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession, PortalUser } from "../src/domain";
import { AccessPolicyError, type AccessActor, type ManagerDomainReadDecision } from "../src/execution-v2/access.contract";
import { NativeManagerReadConsumer, nativeManagerDataEpoch, type NativeManagerRequest } from "../src/execution-v2/native-manager-consumer";
import { CurrentHumanCandidate, type PreparedCurrentHumanNativeHTTP } from "../src/execution-v2/current-human-candidate";
import { SelectedNativeBusinessReadSource, selectedNativeBusinessReadSelection } from "../src/execution-v2/native-business-read-selected-source";
import type { NativeCoreSelection } from "../src/execution-v2/native-core-composition";
import { evaluateManagerDomainRead } from "../src/execution-v2/current-human-snapshot";
import { MaximumDataOperationError, MaximumDataOperationService, type MaximumDataOperationPrincipal } from "../src/execution/maximum-data-operation.service";
import { MaximumDataContinuationRepository, type MaximumDataContinuationScope } from "../src/execution/maximum-data-continuation.repository";
import { sharedReadIdentity, type SharedReadScope } from "../src/execution/shared-read.repository";
import type { ExecutionCurrentSourceProxy } from "../src/execution/current-source.proxy";
import type { ControlApiConfig } from "../src/config";
import type { ExecutionReadScopes } from "../src/execution-v2/read-scope";
import { MAXIMUM_DATA_DEPLOYMENT_OPERATION } from "../src/execution/maximum-data-operation.registry";
vi.mock("../src/execution-v2/current-human-snapshot", async original => ({
  ...await original<typeof import("../src/execution-v2/current-human-snapshot")>(),
  evaluateManagerDomainRead:vi.fn(),
}));
const raw=(c:string)=>c.repeat(64),hash=(c:string)=>"sha256:"+raw(c);
let key:KeyLike;
beforeAll(async()=>{key=(await generateKeyPair("EdDSA",{crv:"Ed25519",extractable:true})).privateKey;});
afterEach(()=>vi.restoreAllMocks());
beforeEach(()=>{vi.mocked(evaluateManagerDomainRead).mockReset();});
function principal():MaximumDataOperationPrincipal{
  const now=new Date(),user:PortalUser={userId:"TEST_ONLY-stan",username:"TEST_ONLY-stan",displayName:"TEST_ONLY Stan",role:"USER",
    status:"ACTIVE",mustChangePassword:false,failedLoginCount:0,lockedUntil:null,sessionVersion:7,
    createdAt:now,updatedAt:now,disabledAt:null,accountRevision:1,archivedAt:null};
  const session:AuthSession={sessionId:"TEST_ONLY-session",userId:user.userId,state:"ACTIVE",sessionVersion:7,
    authenticationTime:now,idleExpiresAt:new Date(now.getTime()+60000),absoluteExpiresAt:new Date(now.getTime()+120000)};
  return {user,session,workspaceId:"TEST_ONLY-workspace"};
}
function selection():NativeCoreSelection{
  const now=Date.now(),until=now+60000,p=principal();
  const domain={profile_id:"PAPER_BINANCE_USDM",
    catalogue_sha256:MAXIMUM_DATA_DEPLOYMENT_OPERATION.sourceCatalogueSha256.slice(7),
    profile_sha256:raw("b"),field_policy_sha256:raw("c")};
  const selected_source=new SelectedNativeBusinessReadSource({
    transport:{origin:"https://10.70.0.2:9443",tls:{ca:"TEST_ONLY-no-socket-ca",cert:"TEST_ONLY-no-socket-cert",key:"TEST_ONLY-no-socket-key"},
      pm_leaf_sha256:hash("f"),workload_id:"TEST_ONLY-pm",deadline_ms:1000,request_bytes:32768,response_bytes:32768,max_inflight:2},
    pins:{binding:{human_issuer:"TEST_ONLY-human",subject:p.user.userId,workspace_id:p.workspaceId,environment:"paper",workload_id:"TEST_ONLY-pm"},domain,
      human:{issuer:"TEST_ONLY-human",subject:p.user.userId,portal_user_id:p.user.userId,
        ts_user_id:"33333333-3333-3333-3333-333333333333",mapping_revision:"ts-user:33333333-3333-3333-3333-333333333333:1"},
      native:{revision:"1",receipt_id:"44444444-4444-4444-4444-444444444444",receipt_digest:hash("1"),document_digest:hash("2"),policy_revision:"1",
        owner_mapping_revision:"ts-user:33333333-3333-3333-3333-333333333333:1",semantic_revision:hash("3"),
        effective_from:new Date(now-60000).toISOString(),expires_at:new Date(until).toISOString()},source_fingerprint:raw("e")},
    installation_expires_at_utc_ms:until});
  return {selector:{portal_user_id:p.user.userId,human_issuer:"TEST_ONLY-human",subject:p.user.userId,workspace_id:p.workspaceId,
    environment:"paper",domain:{...domain}},
    config:{issuer:"TEST_ONLY-human",audience:"TEST_ONLY-pm",key_id:"TEST_ONLY-kid",private_key:key,selected_source,
      limits:{ttl_ms:10000,maximum_unresolved:16,maximum_retained:128},
      installation_scope:{workspace_id:p.workspaceId,environment:"paper",valid_until_ms:until},
      terminal:{issuer:"TEST_ONLY-terminal",audience:"TEST_ONLY-pm",key_id:"TEST_ONLY-kid",private_key:key,ttl_seconds:30},
      egress:{maximum_response_bytes:1048576,maximum_inflight:4,send_timeout_ms:1000,quiesce_timeout_ms:1000}}};
}
function decision(p=principal()):ManagerDomainReadDecision{
  return {authority_fingerprint:hash("d"),scope_digest:hash("e"),field_policy_sha256:raw("c"),field_policy_ref:"TEST_ONLY-field-policy",
    valid_until_ms:Date.now()+30000,now_ms:Date.now(),policy_revision:"1",grant_id:"TEST_ONLY-grant",grant_revision:"1",
    actor:{user_id:p.user.userId,session_id:p.session.sessionId,session_generation:p.session.sessionVersion}};
}
function envelope(next:string|null=null){return{
  schema_version:"portal.execution.current-source-bff.v2",authority:"PORTAL_CONTROL_API",requested_environment:"paper",source_environment:"paper",
  profile_id:"PAPER_BINANCE_USDM",source:{contract_version:MAXIMUM_DATA_DEPLOYMENT_OPERATION.sourceContractRevision,authority:"EXECUTION_CELL",
    profile_id:"PAPER_BINANCE_USDM",catalogue_sha256:MAXIMUM_DATA_DEPLOYMENT_OPERATION.sourceCatalogueSha256,
    availability:"AVAILABLE",freshness:"FRESH",completeness:"COMPLETE",as_of:new Date().toISOString(),
    data:{relation:{schema:"public",relation:"strategy_deployments"},items:[],next_cursor:next}}};}
function fakePool(){
  const client={query:vi.fn(async()=>({rows:[]})),release:vi.fn()};
  return {pool:{options:{connectionTimeoutMillis:2000,query_timeout:6000},connect:vi.fn(async()=>client),query:vi.fn()} as unknown as Pool,client};
}
function reply(){
  const rawResponse=new ServerResponse(new IncomingMessage(new Socket()));
  return {raw:rawResponse,hijack:vi.fn()} as unknown as FastifyReply;
}
async function fixture(withEntityScope=false){
  const p=principal(),e=selection(),db=fakePool(),response=reply();
  const source={relationForNamedOperation:vi.fn(async()=>envelope()),relationForCataloguedOperation:vi.fn(async()=>envelope())};
  const continuation={resolve:vi.fn(async()=>"TEST_ONLY-source-cursor"),issue:vi.fn(async()=>"mdc1.11111111-1111-1111-1111-111111111111")};
  const entityAuthorize=vi.fn(async()=>{throw Error("TEST_ONLY-ENTITY-REQUIRED");});
  const operations=new MaximumDataOperationService(source as unknown as ExecutionCurrentSourceProxy,
    continuation as unknown as MaximumDataContinuationRepository,
    withEntityScope?{FEATURE_EXECUTION_LOCAL_PROJECTION:"false"} as ControlApiConfig:undefined,
    undefined,withEntityScope?{authorize:entityAuthorize} as unknown as ExecutionReadScopes:undefined,db.pool);
  const candidate=await CurrentHumanCandidate.createNativeRead(db.pool,e.config);
  const handle=Object.freeze({}) as PreparedCurrentHumanNativeHTTP;
  const acquire=vi.spyOn(candidate,"acquireNativeRead").mockResolvedValue(handle);
  const send=vi.spyOn(candidate,"sendNativeRead").mockResolvedValue({state:"RECONCILED",context:{} as never});
  const recover=vi.spyOn(candidate,"reconcileNativeRead").mockResolvedValue({state:"UNKNOWN",context:{} as never});
  const select=vi.fn(()=>candidate);
  const consumer=new NativeManagerReadConsumer(db.pool,operations,{selectedCandidate:select},[e]);
  const d=decision(p);vi.mocked(evaluateManagerDomainRead).mockResolvedValue(d);
  const request:NativeManagerRequest={principal:p,operation:{kind:"DEPLOYMENTS"},query:{environment:"paper",limit:100}};
  return {p,e,db,response,source,continuation,operations,candidate,handle,acquire,send,recover,select,consumer,d,request,entityAuthorize};
}
describe("TEST_ONLY native stable consumer, no final writer bypass",()=>{
  it("native current domain READ uses shared preparation, not ENTITY rights",async()=>{
    const f=await fixture(true);expect(await f.consumer.serve(f.request,f.response)).toBe(true);
    expect(f.entityAuthorize).not.toHaveBeenCalled();expect(evaluateManagerDomainRead).toHaveBeenCalledTimes(1);
    expect(f.source.relationForNamedOperation).toHaveBeenCalledTimes(1);expect(f.send).toHaveBeenCalledTimes(1);
  });
  it("ordinary read still requires its original ENTITY scope, even with forged epoch",async()=>{
    const f=await fixture(true);
    await expect(f.operations.deploymentPage({...f.p,nativeEpochDigest:hash("a")},f.request.query))
      .rejects.toThrow("TEST_ONLY-ENTITY-REQUIRED");
    expect(f.entityAuthorize).toHaveBeenCalledTimes(1);expect(evaluateManagerDomainRead).not.toHaveBeenCalled();
    expect(f.source.relationForNamedOperation).not.toHaveBeenCalled();
  });
  it("leaves nonselected actual people on the unchanged legacy route",async()=>{
    const f=await fixture();f.request.principal.user.userId="TEST_ONLY-other";
    expect(await f.consumer.serve(f.request,f.response)).toBe(false);
    expect(f.select).not.toHaveBeenCalled();expect(f.source.relationForNamedOperation).not.toHaveBeenCalled();
  });
  it.each(["environment","workspace"] as const)("selected person's wrong %s denies without legacy fallback",async axis=>{
    const f=await fixture();if(axis==="environment")f.request.query.environment="live";else f.request.principal.workspaceId="TEST_ONLY-other";
    await expect(f.consumer.serve(f.request,f.response)).rejects.toMatchObject({code:"NATIVE_MANAGER_READ_DENIED"});
    expect(f.source.relationForNamedOperation).not.toHaveBeenCalled();expect(f.acquire).not.toHaveBeenCalled();
  });
  it("requires actual current READ before cache/source preparation",async()=>{
    const f=await fixture();vi.mocked(evaluateManagerDomainRead).mockRejectedValue(new Error("TEST_ONLY-revoked"));
    await expect(f.consumer.serve(f.request,f.response)).rejects.toThrow("TEST_ONLY-revoked");
    expect(f.source.relationForNamedOperation).not.toHaveBeenCalled();expect(f.acquire).not.toHaveBeenCalled();
    expect(f.response.hijack).not.toHaveBeenCalled();expect(f.response.raw.headersSent).toBe(false);
  });
  it.each([
    ["ACCESS_DENIED",403], ["ACCESS_RESOURCE_NOT_FOUND",404],
    ["ACCESS_RETRY_REQUIRED",409], ["POLICY_PENDING",503],
  ] as const)("preserves genuine policy %s as a sanitized HTTP boundary error",async(code,status)=>{
    const f=await fixture();
    vi.mocked(evaluateManagerDomainRead).mockRejectedValue(new AccessPolicyError(code,status));
    await expect(f.consumer.serve(f.request,f.response)).rejects.toBeInstanceOf(MaximumDataOperationError);
    await expect(f.consumer.serve(f.request,f.response)).rejects.toMatchObject({code,status,message:code});
    expect(f.source.relationForNamedOperation).not.toHaveBeenCalled();expect(f.acquire).not.toHaveBeenCalled();
    expect(f.response.hijack).not.toHaveBeenCalled();expect(f.response.raw.headersSent).toBe(false);
  });
  it("source/DTO failure creates no entered native obligation or hijacked response",async()=>{
    const f=await fixture();f.source.relationForNamedOperation.mockRejectedValue(new Error("TEST_ONLY-data-failure"));
    await expect(f.consumer.serve(f.request,f.response)).rejects.toThrow("TEST_ONLY-data-failure");
    expect(f.acquire).not.toHaveBeenCalled();expect(f.response.hijack).not.toHaveBeenCalled();
  });
  it("preserves Stan's real USER identity and passes epoch only as private correlation",async()=>{
    const f=await fixture();expect(await f.consumer.serve(f.request,f.response)).toBe(true);
    const actual=f.source.relationForNamedOperation.mock.calls[0] as unknown as unknown[];
    expect(actual[0]).toMatchObject({user:{userId:f.p.user.userId,role:"USER"},session:{sessionId:f.p.session.sessionId,sessionVersion:7}});
    expect(actual[0]).toHaveProperty("nativeEpochDigest",expect.stringMatching(/^sha256:[a-f0-9]{64}$/));
    const [actor,base]=f.acquire.mock.calls[0]!;
    expect(actor).toEqual(f.d.actor);expect(f.acquire.mock.calls[0]![2]).toBe(f.d.scope_digest);expect(base).toMatchObject({binding:{subject:f.p.user.userId,operation:"READ"},
      manager_intent:{schema_version:"pma.manager-read-intent.v1",action:"relation_page"}});
    const payload=f.send.mock.calls[0]![2];expect(JSON.parse(payload.toString())).toHaveProperty("logical_operation_id","maximumDataDeploymentPageV1");
    expect(payload.toString()).not.toContain("nativeEpochDigest");expect(f.p.user.role).toBe("USER");
  });
  it("prepares exact safe JSON privately before native acquisition",async()=>{
    const f=await fixture(),events:string[]=[];
    f.source.relationForNamedOperation.mockImplementation(async()=>{events.push("private-fetch");return envelope();});
    f.acquire.mockImplementation(async()=>{events.push("native-acquire");expect(f.response.raw.headersSent).toBe(false);return f.handle;});
    f.send.mockImplementation(async()=>{events.push("sole-final-send");return {state:"RECONCILED",context:{} as never};});
    await f.consumer.serve(f.request,f.response);expect(events).toEqual(["private-fetch","native-acquire","sole-final-send"]);
  });
  it("does not invoke final send until native acquisition ACK (orchestration only)",async()=>{
    const f=await fixture();let release!:()=>void,entered!:()=>void;
    const held=new Promise<void>(r=>{release=r;}),seen=new Promise<void>(r=>{entered=r;});
    f.acquire.mockImplementation(async()=>{entered();await held;return f.handle;});
    const pending=f.consumer.serve(f.request,f.response);await seen;
    expect(f.send).not.toHaveBeenCalled();expect(f.response.raw.headersSent).toBe(false);release();await pending;
    expect(f.send).toHaveBeenCalledTimes(1);
  });
  it.each(["acquire","send"] as const)("uncertain %s destroys only owning response and reconciles same durable key",async which=>{
    const f=await fixture();f[which].mockRejectedValue(new Error("TEST_ONLY-lost-ACK"));
    expect(await f.consumer.serve(f.request,f.response)).toBe(true);expect(f.response.raw.destroyed).toBe(true);
    const base=f.acquire.mock.calls[0]![1] as {binding:{lease_id:string}};
    expect(f.recover).toHaveBeenCalledWith(base.binding.lease_id);
    expect(f.source.relationForNamedOperation).toHaveBeenCalledTimes(1);expect(f.response.raw.headersSent).toBe(false);
  });
  it("does not accept a decision for another field seal",async()=>{
    const f=await fixture();vi.mocked(evaluateManagerDomainRead).mockResolvedValue({...f.d,field_policy_sha256:raw("f")});
    await expect(f.consumer.serve(f.request,f.response)).rejects.toMatchObject({code:"NATIVE_MANAGER_READ_DENIED"});
    expect(f.acquire).not.toHaveBeenCalled();expect(f.source.relationForNamedOperation).not.toHaveBeenCalled();
  });
  it.each(["session","generation","user","status","activation"] as const)("actual %s mismatch denies before source",async kind=>{
    const f=await fixture();if(kind==="session")f.request.principal.session.userId="TEST_ONLY-other";
    if(kind==="generation")f.request.principal.session.sessionVersion++;
    if(kind==="user")f.request.principal.user.status="DISABLED";
    if(kind==="status")f.request.principal.session.state="REVOKED";
    if(kind==="activation")f.request.principal.user.mustChangePassword=true;
    await expect(f.consumer.serve(f.request,f.response)).rejects.toMatchObject({code:"NATIVE_MANAGER_READ_DENIED"});
    expect(f.source.relationForNamedOperation).not.toHaveBeenCalled();
  });
  it("binds exact pool and stable safe DTO service instances",async()=>{
    const f=await fixture();expect(f.consumer.uses(f.db.pool,f.operations)).toBe(true);
    expect(f.consumer.uses(fakePool().pool,f.operations)).toBe(false);
    expect(f.consumer.uses(f.db.pool,{} as MaximumDataOperationService)).toBe(false);
  });
});
