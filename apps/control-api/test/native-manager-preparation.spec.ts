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
import { composeNativeCore,nativeCoreManagerReadConsumer,type NativeCoreSelection } from "../src/execution-v2/native-core-composition";
import { unqualifiedAccessTrust } from "../src/execution-v2/access-trust";
import { MaximumDataOperationController } from "../src/execution/maximum-data-operation.controller";
import type { WorkspacesRepository } from "../src/repos/workspaces";
import { Module,type FactoryProvider } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { ExecutionManagerRuntime,isManagerRuntimeTrustDelegate } from "../src/execution-v2/manager-runtime";
import { loadPublicationCommissioning } from "../src/execution-v2/publication-adapter";
import { EXECUTION_PUBLICATION_CATALOGUE } from "../src/execution-v2/publication-source.generated";
import { evaluateManagerDomainRead,evaluateManagerDomainStream } from "../src/execution-v2/current-human-snapshot";
import { MaximumDataOperationError, MaximumDataOperationService, type MaximumDataOperationPrincipal } from "../src/execution/maximum-data-operation.service";
import { MaximumDataContinuationRepository, type MaximumDataContinuationScope } from "../src/execution/maximum-data-continuation.repository";
import { sharedReadIdentity, type SharedReadScope } from "../src/execution/shared-read.repository";
import type { ExecutionCurrentSourceProxy } from "../src/execution/current-source.proxy";
import type { ControlApiConfig } from "../src/config";
import { ExecutionReadScopes } from "../src/execution-v2/read-scope";
import type { ExecutionAccessService } from "../src/execution-v2/access.service";
import { ExecutionProfileRealtimeService } from "../src/execution/profile-realtime.service";
import type { ExecutionProfileProjectionRepository,ProfileProjectionSnapshot } from "../src/execution/profile-projection.repository";
import { ScopedReplayHub } from "../src/execution-v2/realtime";
import { ScopedReplayCursorCodec,decodeScopedReplayContinuationWithBinding } from "../src/execution-v2/scoped-replay-cursor";
import { managerObservationBaseline,managerObservationQueryDigest,MANAGER_OBSERVATION_BASELINE_MODEL } from "../src/execution-v2/manager-observation-source";
import { decodeManagerObservationCoordinate } from "../src/execution-v2/manager-observation-coordinate";
import { accessDigest } from "../src/execution-v2/access-policy";
import { MAXIMUM_DATA_DEPLOYMENT_OPERATION } from "../src/execution/maximum-data-operation.registry";
vi.mock("../src/execution-v2/current-human-snapshot", async original => ({
  ...await original<typeof import("../src/execution-v2/current-human-snapshot")>(),
  evaluateManagerDomainRead:vi.fn(),evaluateManagerDomainStream:vi.fn(),
}));
const raw=(c:string)=>c.repeat(64),hash=(c:string)=>"sha256:"+raw(c);
let key:KeyLike;
beforeAll(async()=>{key=(await generateKeyPair("EdDSA",{crv:"Ed25519",extractable:true})).privateKey;});
afterEach(()=>vi.restoreAllMocks());
beforeEach(()=>{vi.mocked(evaluateManagerDomainRead).mockReset();vi.mocked(evaluateManagerDomainStream).mockReset();});
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

/** TEST_ONLY finite integration/provenance deltas. These are orchestration and
 * DynamicModule metadata tests, NOT genuine HTTP/DB/terminal ACK acceptance. */
describe("TEST_ONLY native finite factory and optional route mount",()=>{
  async function genuine(f:Awaited<ReturnType<typeof fixture>>){
    const p=f.p,e=f.e;
    return composeNativeCore(f.db.pool,unqualifiedAccessTrust,{
      expected_workload_id:selectedNativeBusinessReadSelection(e.config.selected_source).binding.workload_id,
      selections:[e],retained_recovery:[],
      owner_intakes:[{artifact_path:"/TEST_ONLY-never-read-owner-intake",approved_sha256:raw("a"),
        target:{database_name:"TEST_ONLY-db",database_system_identifier:"1234567890",role_name:"TEST_ONLY-role",
          protected_owner_user_id:"TEST_ONLY-owner",workspace_id:p.workspaceId,
          principal_workspace_pins:[{user_id:p.user.userId,workspace_id:p.workspaceId}]},
        intake_not_before_ms:Date.now()-1000,intake_not_after_ms:Date.now()+60000}],
      mutation_limits:{maximum_intents:16,maximum_recoveries_per_request:16}});
  }
  function controller(f:Awaited<ReturnType<typeof fixture>>,allowed=true){
    const workspaces={canReadExecution:vi.fn(async()=>allowed)};
    return {workspaces,controller:new MaximumDataOperationController(f.operations,
      workspaces as unknown as WorkspacesRepository,f.consumer)};
  }
  function request(f:Awaited<ReturnType<typeof fixture>>){
    return {portalUser:f.p.user,portalSession:f.p.session,portalWorkspaceId:f.p.workspaceId,
      portalViewerWorkspaceId:"TEST_ONLY-viewer"} as unknown as Parameters<MaximumDataOperationController["deployments"]>[0];
  }
  it("mounts only an original composition with the SAME effective authority, without DB or owner-policy intake",async()=>{
    const f=await fixture(),composition=await genuine(f);
    const native=nativeCoreManagerReadConsumer(composition,f.db.pool,f.operations,composition.dependencies);
    expect(native.uses(f.db.pool,f.operations)).toBe(true);
    expect(f.db.pool.connect).not.toHaveBeenCalled();expect(f.db.pool.query).not.toHaveBeenCalled();
    expect(f.source.relationForNamedOperation).not.toHaveBeenCalled();
    expect(f.source.relationForCataloguedOperation).not.toHaveBeenCalled();
  });
  it("refuses copied composition, other pool, effective trust wrapper or another recovery coordinator",async()=>{
    const f=await fixture(),composition=await genuine(f),d=composition.dependencies;
    const attempts=[
      ()=>nativeCoreManagerReadConsumer({...composition},f.db.pool,f.operations,d),
      ()=>nativeCoreManagerReadConsumer(composition,fakePool().pool,f.operations,d),
      ()=>nativeCoreManagerReadConsumer(composition,f.db.pool,f.operations,{...d,executionAccessTrust:{...d.executionAccessTrust}}),
      ()=>nativeCoreManagerReadConsumer(composition,f.db.pool,f.operations,{...d,currentHumanMutations:undefined}),
    ];
    for(const attempt of attempts)expect(attempt).toThrow(expect.objectContaining({
      code:"CURRENT_HUMAN_NATIVE_CONFIG_INVALID",message:"The current identity operation is not available.",
    }));
    expect(f.db.pool.connect).not.toHaveBeenCalled();expect(f.source.relationForNamedOperation).not.toHaveBeenCalled();
  });
  it("accepts only the internally minted frozen one-hop Manager delegate of the SAME original trust",async()=>{
    const f=await fixture(),composition=await genuine(f),d=composition.dependencies,now=Date.now();
    const scope={workspace_id:f.p.workspaceId,environment:"paper" as const,profile_id:f.e.selector.domain.profile_id};
    const artifact={schema_version:"portal.execution.publication-commissioning.v1",scope,
      catalogue_digest:EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest,adapter_id:"SYNTHETIC_NOT_SOURCE_AUTHORITY",
      family_ids:["alpha_fleet_overview"],purposes:["BUSINESS"],receipt_pins:{source_read:"TEST_ONLY:read",
        transport_trust:"TEST_ONLY:transport",privacy:"TEST_ONLY:privacy",field_policy:"TEST_ONLY:field"}};
    const bytes=JSON.stringify(artifact),commissioning=loadPublicationCommissioning(bytes,{artifact_sha256:"sha256:"+createHash("sha256").update(bytes).digest("hex"),
      adapter_id:artifact.adapter_id,approval_ref:"SYNTHETIC_NOT_OWNER_APPROVAL",approved_at_ms:now-1000,valid_until_ms:now+60000},now);
    const runtime=new ExecutionManagerRuntime(f.db.pool,{trust:d.executionAccessTrust,cadence_ms:1000,maximum_publication_reads:1,
      partitions:[{scope,commissioning,source:{} as never,publication:async()=>null,bounds:{maximum_documents_per_tick:1,
        maximum_document_bytes:1048576,maximum_document_rows:200,maximum_tick_ms:5000,source_timeout_ms:1000,
        transaction_timeout_ms:1000,lease_ttl_ms:2000}}]});
    const delegate=runtime.accessTrust(d.executionAccessTrust)!;
    expect(Object.isFrozen(delegate)).toBe(true);expect(isManagerRuntimeTrustDelegate(delegate,d.executionAccessTrust)).toBe(true);
    expect(isManagerRuntimeTrustDelegate({...delegate},d.executionAccessTrust)).toBe(false);
    expect(isManagerRuntimeTrustDelegate(delegate,unqualifiedAccessTrust)).toBe(false);
    expect(()=>runtime.accessTrust(unqualifiedAccessTrust)).toThrow("MANAGER_RUNTIME_TRUST_CONFLICT");
    expect(nativeCoreManagerReadConsumer(composition,f.db.pool,f.operations,{...d,executionAccessTrust:delegate})
      .uses(f.db.pool,f.operations)).toBe(true);
    expect(()=>nativeCoreManagerReadConsumer(composition,fakePool().pool,f.operations,{...d,executionAccessTrust:delegate}))
      .toThrow(expect.objectContaining({code:"CURRENT_HUMAN_NATIVE_CONFIG_INVALID",
        message:"The current identity operation is not available."}));
    expect(()=>nativeCoreManagerReadConsumer(composition,f.db.pool,f.operations,{executionAccessTrust:delegate}))
      .toThrow(expect.objectContaining({code:"CURRENT_HUMAN_NATIVE_CONFIG_INVALID",
        message:"The current identity operation is not available."}));
    expect(f.db.pool.connect).not.toHaveBeenCalled();expect(f.source.relationForNamedOperation).not.toHaveBeenCalled();
    await runtime.beforeApplicationShutdown();
  });
  it("captures finite selections before caller mutation; no installed grant or physical-delivery claim",async()=>{
    const f=await fixture(),original=structuredClone(f.e.selector),composition=await genuine(f);
    f.e.selector.workspace_id="TEST_ONLY-mutated";f.e.config.installation_scope.valid_until_ms=0;
    const candidate=composition.selectedCandidate(original);
    const acquire=vi.spyOn(candidate,"acquireNativeRead").mockResolvedValue(f.handle);
    const send=vi.spyOn(candidate,"sendNativeRead").mockResolvedValue({state:"RECONCILED",context:{} as never});
    const native=nativeCoreManagerReadConsumer(composition,f.db.pool,f.operations,composition.dependencies);
    expect(await native.serve(f.request,f.response)).toBe(true);
    expect(acquire).toHaveBeenCalledTimes(1);expect(send).toHaveBeenCalledTimes(1);
    expect(f.source.relationForNamedOperation).toHaveBeenCalledTimes(1);
  });
  it("selected person's wrong environment never falls through to legacy deployment read",async()=>{
    const f=await fixture(),c=controller(f),legacy=vi.spyOn(f.operations,"deploymentPage");
    await expect(c.controller.deployments(request(f),{environment:"live",limit:100},f.response))
      .rejects.toMatchObject({code:"NATIVE_MANAGER_READ_DENIED",status:403});
    expect(legacy).not.toHaveBeenCalled();expect(f.acquire).not.toHaveBeenCalled();
    expect(f.source.relationForNamedOperation).not.toHaveBeenCalled();
  });
  it("keeps the old finite path for nonselected people and forwards original viewer workspace",async()=>{
    const f=await fixture(),c=controller(f),r=request(f),legacy=vi.spyOn(f.operations,"deploymentPage");
    r.portalUser={...r.portalUser,userId:"TEST_ONLY-not-selected"};
    r.portalSession={...r.portalSession,userId:"TEST_ONLY-not-selected"};
    const value=await c.controller.deployments(r,{environment:"paper",limit:100},f.response);
    expect(value).toHaveProperty("logical_operation_id",MAXIMUM_DATA_DEPLOYMENT_OPERATION.logicalOperationId);
    expect(legacy).toHaveBeenCalledWith(expect.objectContaining({viewerWorkspaceId:"TEST_ONLY-viewer",
      user:expect.objectContaining({userId:"TEST_ONLY-not-selected"})}),{environment:"paper",limit:100});
    expect(f.acquire).not.toHaveBeenCalled();expect(f.response.hijack).not.toHaveBeenCalled();
  });
  it("checks the requested workspace before native preparation for both existing finite routes",async()=>{
    const f=await fixture(),c=controller(f,false),serve=vi.spyOn(f.consumer,"serve"),r=request(f);
    await expect(c.controller.deployments(r,{workspace_id:"TEST_ONLY-other",environment:"paper"},f.response))
      .rejects.toMatchObject({code:"WORKSPACE_NOT_FOUND",status:404});
    await expect(c.controller.currentRelation(r,"account-balances",
      {workspace_id:"TEST_ONLY-other",environment:"paper"},f.response))
      .rejects.toMatchObject({code:"WORKSPACE_NOT_FOUND",status:404});
    expect(serve).not.toHaveBeenCalled();expect(f.acquire).not.toHaveBeenCalled();
    expect(f.source.relationForNamedOperation).not.toHaveBeenCalled();
  });
  it("routes a selected finite request through the existing consumer, never the ordinary writer",async()=>{
    const f=await fixture(),c=controller(f),legacy=vi.spyOn(f.operations,"deploymentPage"),serve=vi.spyOn(f.consumer,"serve");
    expect(await c.controller.deployments(request(f),{environment:"paper",limit:100},f.response)).toBeUndefined();
    expect(serve).toHaveBeenCalledWith(expect.objectContaining({principal:expect.objectContaining({
      viewerWorkspaceId:"TEST_ONLY-viewer",user:expect.objectContaining({userId:f.p.user.userId})})}),f.response);
    expect(legacy).not.toHaveBeenCalled();expect(f.acquire).toHaveBeenCalledTimes(1);
    expect(f.send).toHaveBeenCalledTimes(1);expect(f.response.hijack).toHaveBeenCalledTimes(1);
  });
  it("the optional DI provider creates only the genuine consumer with effective app dependencies",async()=>{
    const f=await fixture(),composition=await genuine(f);
    const module=AppModule.register({NODE_ENV:"test"} as ControlApiConfig,f.db.pool,undefined,
      {...composition.dependencies,nativeManagerRead:composition});
    const provider=module.providers?.find((value):value is FactoryProvider=>typeof value==="object"&&value!==null&&
      "provide" in value&&value.provide===NativeManagerReadConsumer&&"useFactory" in value);
    expect(provider).toBeDefined();expect(provider!.useFactory(f.operations,undefined,undefined,{}).uses(f.db.pool,f.operations)).toBe(true);
    expect(f.db.pool.connect).not.toHaveBeenCalled();expect(f.source.relationForNamedOperation).not.toHaveBeenCalled();
  });
  it("default app registration creates no native consumer provider or source work",async()=>{
    const f=await fixture(),module=AppModule.register({NODE_ENV:"test"} as ControlApiConfig,f.db.pool);
    expect(module.providers?.some(provider=>typeof provider==="object"&&provider!==null&&
      "provide" in provider&&provider.provide===NativeManagerReadConsumer)).toBe(false);
    expect(f.db.pool.connect).not.toHaveBeenCalled();expect(f.source.relationForNamedOperation).not.toHaveBeenCalled();
  });
  it("refuses supplied realtime budgets without the genuine composition",async()=>{
    const f=await fixture(),limits={maximumClients:4,maximumEntriesPerClient:8,maximumFrameBytes:8192,
      maximumClientBytes:65536,maximumTotalBytes:262144,maximumNoticesPerRead:8,readTimeoutMs:100};
    expect(()=>AppModule.register({NODE_ENV:"test"} as ControlApiConfig,f.db.pool,undefined,
      {nativeManagerRealtimeLimits:limits})).toThrow("NATIVE_MANAGER_REALTIME_COMPOSITION_REQUIRED");
    expect(f.db.pool.connect).not.toHaveBeenCalled();
  });
});

/** Added source-only RT orchestration cases. Real current scope minting uses
 * mocked DB-only evaluators, never fixture permission as installed authority.
 * Hub subscribe/send spying below is NOT physical HTTP/ACK qualification. */
const realtimeLimits={maximumClients:4,maximumEntriesPerClient:8,maximumFrameBytes:8192,
  maximumClientBytes:65536,maximumTotalBytes:262144,maximumNoticesPerRead:8,readTimeoutMs:100};
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return{promise,resolve};}
async function realtimeFixture(maximumClients=realtimeLimits.maximumClients){
  const f=await fixture(),now=new Date(),profile="PAPER_BINANCE_USDM";
  const snapshot:ProfileProjectionSnapshot={document:{schema_version:"portal.execution.profile-projection.v1",
    workspace_id:f.p.workspaceId,environment:"paper",profile_id:profile,
    source_contract_revision:MAXIMUM_DATA_DEPLOYMENT_OPERATION.sourceContractRevision,
    source_catalogue_sha256:MAXIMUM_DATA_DEPLOYMENT_OPERATION.sourceCatalogueSha256,relations:{}},
    sourceEpoch:"TEST_ONLY-source-epoch",sourceCursor:"TEST_ONLY-private-source-cursor",sourceAsOf:null,
    receivedAt:now,lastSuccessfulRefreshAt:now,completeness:"PARTIAL",
    projectionEpoch:"12345678-1234-1234-1234-123456789abc",projectionSequence:10,
    payloadDigest:hash("a"),sourceCatalogueSha256:MAXIMUM_DATA_DEPLOYMENT_OPERATION.sourceCatalogueSha256};
  const repository={snapshot:vi.fn(async()=>snapshot),
    snapshotMetadata:vi.fn(async()=>({...snapshot,sourceContractRevision:snapshot.document.source_contract_revision})),
    journalMetadataAfter:vi.fn(async()=>[]),
    refreshHealth:vi.fn(async()=>({state:"HEALTHY" as const,consecutiveFailures:0,reasonCode:null,lastFailureAt:null,
      retryNotBefore:null,lastRecoveredAt:null}))};
  const scopes=new ExecutionReadScopes(f.db.pool,{} as ExecutionAccessService,{} as ControlApiConfig);
  const codec=new ScopedReplayCursorCodec("test",{test:"TEST_ONLY-manager-rt-key-minimum-32-bytes"},300000);
  const consumer=new NativeManagerReadConsumer(f.db.pool,f.operations,{selectedCandidate:f.select},[f.e],
    {scopes,repository:repository as unknown as ExecutionProfileProjectionRepository,codec,limits:{...realtimeLimits,maximumClients}});
  const local=new ExecutionProfileRealtimeService({FEATURE_EXECUTION_LOCAL_PROJECTION:"true",
    EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS:15000} as ControlApiConfig,
    repository as unknown as ExecutionProfileProjectionRepository,consumer);
  vi.mocked(evaluateManagerDomainStream).mockResolvedValue({...f.d,stream_scope_digest:hash("1"),
    stream_grant_id:"TEST_ONLY-stream-grant",stream_grant_revision:"1"});
  const selection={workspace_id:f.p.workspaceId,environment:"paper" as const,profile_id:profile,
    source_identity_digest:selectedNativeBusinessReadSelection(f.e.config.selected_source).source_identity_digest,
    source_contract_revision:snapshot.document.source_contract_revision,
    source_catalogue_sha256:MAXIMUM_DATA_DEPLOYMENT_OPERATION.sourceCatalogueSha256};
  const baseline=managerObservationBaseline(snapshot,selection);
  const binding={workspace_id:f.p.workspaceId,environment:"paper" as const,profile_id:profile,
    principal_scope_digest:accessDigest({schema_version:"portal.manager-observation.read-baseline-scope.v1",
      actor:f.d.actor,viewer_workspace_id:f.p.viewerWorkspaceId??null,read_scope_digest:f.d.scope_digest}),
    app_policy_revision:f.d.policy_revision,field_policy_revision:f.d.field_policy_ref,
    model_revision:MANAGER_OBSERVATION_BASELINE_MODEL,schema_revision:"portal.execution.scoped-realtime.v1",
    dataset:"execution_profile_observation" as const,query_digest:managerObservationQueryDigest(selection),window:null,
    snapshot_id:baseline.snapshot_id,source_set_digest:baseline.source_set_digest,
    projection_generation:baseline.projection_generation,source_continuity_epoch:baseline.source_continuity_epoch};
  const capture=()=>consumer.serveProfileSnapshot(f.p,"paper",profile,local,f.response);
  return {...f,consumer,local,repository,snapshot,profile,codec,binding,capture,
    token:()=>String(f.response.raw.getHeader("X-Portal-Realtime-Cursor")),
    close:async()=>{await local.onApplicationShutdown();}};
}
describe("TEST_ONLY SAME snapshot and independent current STREAM",()=>{
  it("checks same current READ before the real captured snapshot; no STREAM grant is inferred",async()=>{
    const f=await realtimeFixture(),order:string[]=[];
    vi.mocked(evaluateManagerDomainRead).mockImplementation(async()=>{order.push("current-read");return f.d;});
    f.repository.snapshot.mockImplementation(async()=>{order.push("captured-snapshot");return f.snapshot;});
    try{
      expect(await f.capture()).toBe(true);
      expect(order).toEqual(["current-read","captured-snapshot"]);
      expect(evaluateManagerDomainStream).not.toHaveBeenCalled();
      expect(f.repository.snapshot).toHaveBeenCalledOnce();
      expect(f.source.relationForNamedOperation).not.toHaveBeenCalled();
      const sent=JSON.parse(f.send.mock.calls[0]![2].toString());
      expect(sent).toMatchObject({event_type:"snapshot",projection_sequence:10,payload:{snapshot_mode:"CURSOR_ONLY"}});
      expect(sent).not.toHaveProperty("sourceCursor");
      const decoded=decodeScopedReplayContinuationWithBinding(f.codec,f.token(),()=>f.binding);
      expect(decodeManagerObservationCoordinate(decoded.source)).toMatchObject({baseline_sequence:10,after_sequence:10});
      expect(f.response.raw.getHeader("X-Portal-Realtime-State")).toBe("NATIVE_SCOPED_BASELINE_V1");
    }finally{await f.close();}
  });
  it("a READ token never authorizes a missing STREAM grant and never touches head/Hub",async()=>{
    const f=await realtimeFixture(),subscribe=vi.spyOn(ScopedReplayHub.prototype,"subscribeNative");
    try{
      await f.capture();vi.mocked(evaluateManagerDomainStream).mockRejectedValue(new AccessPolicyError("ACCESS_DENIED",403));
      await expect(f.consumer.serveProfileStream(f.p,"paper",f.profile,f.token(),reply()))
        .rejects.toMatchObject({code:"EXECUTION_READ_AUTHORITY_UNAVAILABLE"});
      expect(subscribe).not.toHaveBeenCalled();expect(f.repository.snapshotMetadata).not.toHaveBeenCalled();
    }finally{await f.close();}
  });
  it("head advancement preserves original seq10 baseline and authenticates resume in the SAME Hub",async()=>{
    const f=await realtimeFixture(),close=vi.fn(),subscribe=vi.spyOn(ScopedReplayHub.prototype,"subscribeNative")
      .mockResolvedValue({id:"TEST_ONLY-stream",close});
    try{
      await f.capture();
      f.repository.snapshotMetadata.mockResolvedValue({...f.snapshot,projectionSequence:11,
        sourceContractRevision:f.snapshot.document.source_contract_revision});
      const response=reply();
      expect(await f.consumer.serveProfileStream(f.p,"paper",f.profile,f.token(),response)).toBe(true);
      expect(evaluateManagerDomainStream).toHaveBeenCalledTimes(1);expect(subscribe).toHaveBeenCalledOnce();
      const input=subscribe.mock.calls[0]![0];
      expect(decodeManagerObservationCoordinate(input.baselineCursor)).toMatchObject({baseline_sequence:10,after_sequence:10});
      expect(input.binding.model_revision).toBe("portal.manager-observation.stream.v1");
      expect(input.binding.snapshot_id).toBe(f.binding.snapshot_id);
      expect(f.repository.snapshot).toHaveBeenCalledOnce();
      expect(response.hijack).toHaveBeenCalledOnce();response.raw.emit("close");expect(close).toHaveBeenCalledOnce();
    }finally{await f.close();}
  });
  it("source generation/catalogue changes cannot silently rebaseline an existing READ token",async()=>{
    const f=await realtimeFixture(),subscribe=vi.spyOn(ScopedReplayHub.prototype,"subscribeNative");
    try{
      await f.capture();f.repository.snapshotMetadata.mockResolvedValue({...f.snapshot,
        projectionEpoch:"22345678-1234-1234-1234-123456789abc",
        sourceContractRevision:f.snapshot.document.source_contract_revision});
      await expect(f.consumer.serveProfileStream(f.p,"paper",f.profile,f.token(),reply())).rejects.toThrow();
      expect(subscribe).not.toHaveBeenCalled();expect(f.repository.snapshot).toHaveBeenCalledOnce();
    }finally{await f.close();}
  });
  it("stopping during captured snapshot waits for the actual preparation and emits no body",async()=>{
    const f=await realtimeFixture(),held=deferred<ProfileProjectionSnapshot>(),entered=deferred<void>();
    f.repository.snapshot.mockImplementation(async()=>{entered.resolve();return held.promise;});
    const capture=f.capture(),refused=expect(capture).rejects.toThrow();await entered.promise;
    let stopped=false;const stop=f.local.onApplicationShutdown().then(()=>{stopped=true;});
    await Promise.resolve();expect(stopped).toBe(false);expect(f.acquire).not.toHaveBeenCalled();
    held.resolve(f.snapshot);await refused;await stop;
    expect(stopped).toBe(true);expect(f.send).not.toHaveBeenCalled();
    expect(f.repository.refreshHealth).not.toHaveBeenCalled();
  });
  it("repository timeout does not release shutdown ownership while the real read is pending",async()=>{
    vi.useFakeTimers();const f=await realtimeFixture(),held=deferred<ProfileProjectionSnapshot>(),entered=deferred<void>();
    f.repository.snapshot.mockImplementation(async()=>{entered.resolve();return held.promise;});
    const capture=f.capture(),refused=expect(capture).rejects.toMatchObject({code:"N31_LOCAL_READ_TIMEOUT"});
    try{
      await entered.promise;await vi.advanceTimersByTimeAsync(2001);await refused;
      let stopped=false;const stop=f.local.onApplicationShutdown().then(()=>{stopped=true;});
      await Promise.resolve();expect(stopped).toBe(false);
      held.resolve(f.snapshot);await stop;expect(stopped).toBe(true);expect(f.acquire).not.toHaveBeenCalled();
    }finally{held.resolve(f.snapshot);await f.close();vi.useRealTimers();}
  });
  it("selected people without RT cannot fall through, while unselected people are unchanged",async()=>{
    const f=await fixture();
    await expect(f.consumer.serveProfileStream(f.p,"paper","PAPER_BINANCE_USDM","TEST_ONLY-token",reply()))
      .rejects.toMatchObject({code:"NATIVE_MANAGER_READ_UNAVAILABLE"});
    const other={...f.p,user:{...f.p.user,userId:"TEST_ONLY-other"},session:{...f.p.session,userId:"TEST_ONLY-other"}};
    expect(await f.consumer.serveProfileStream(other,"paper","PAPER_BINANCE_USDM",undefined,reply())).toBe(false);
    expect(f.source.relationForNamedOperation).not.toHaveBeenCalled();
  });
});

/** Additional C7-RT-SAFETY definitions — NOT_RUN.
 * These use Nest's ACTUAL shutdown phases in a narrow in-memory context and
 * the real consumer/Hub/issuer. DB policy evaluation is TEST_ONLY mocked;
 * there is no source command, network listen, grant install or ACK claim. */
@Module({})
class NativeRealtimeShutdownTestModule {}
async function shutdownContext(local:ExecutionProfileRealtimeService,ownsExecutionPool:boolean){
  const pool={end:vi.fn(async()=>undefined)};
  const app=await NestFactory.createApplicationContext({
    module:NativeRealtimeShutdownTestModule,
    providers:[
      {provide:ExecutionProfileRealtimeService,useValue:local},
      // SAME lifecycle hook/ownership shape as AppModule. This narrow context
      // tests Nest ordering, not full AppModule bootstrap/production DB.
      {provide:"EXECUTION_POOL_LIFECYCLE",useValue:{
        onApplicationShutdown:async()=>{if(ownsExecutionPool)await pool.end();},
      }},
    ],
  },{logger:false,abortOnError:false});
  return{app,pool};
}
function observedShutdown(local:ExecutionProfileRealtimeService){
  const entered=deferred<void>(),original=local.beforeApplicationShutdown.bind(local);
  vi.spyOn(local,"beforeApplicationShutdown").mockImplementation(()=>{
    const barrier=original();entered.resolve();return barrier;
  });
  return entered.promise;
}
function testStreamDecision(f:Awaited<ReturnType<typeof realtimeFixture>>){
  return{...f.d,stream_scope_digest:hash("1"),stream_grant_id:"TEST_ONLY-stream-grant",stream_grant_revision:"1"};
}
function nativeStreamReply(){
  const socket=new Socket(),request=new IncomingMessage(socket);request.method="GET";
  const response=new ServerResponse(request);response.assignSocket(socket);
  return{raw:response,hijack:vi.fn()} as unknown as FastifyReply;
}
describe("TEST_ONLY actual Nest before-shutdown pool barrier",()=>{
  it.each([true,false])("joins original timed-out repository AND held native authority before pool hook (owned=%s)",async owns=>{
    const f=await realtimeFixture(),ctx=await shutdownContext(f.local,owns);
    const enteredShutdown=observedShutdown(f.local),nativeStop=vi.spyOn(f.consumer,"stopRealtime");
    const heldRead=deferred<ProfileProjectionSnapshot>(),enteredRead=deferred<void>();
    const heldAuthority=deferred<ReturnType<typeof testStreamDecision>>(),enteredAuthority=deferred<void>();
    f.repository.snapshot.mockImplementation(async()=>{enteredRead.resolve();return heldRead.promise;});
    vi.mocked(evaluateManagerDomainStream).mockImplementation(async()=>{enteredAuthority.resolve();return heldAuthority.promise;});
    vi.useFakeTimers();
    const capture=f.capture(),captureOutcome=capture.then(()=>null,error=>error);
    // The token is deliberately never decoded: real current authorization is
    // held and shutdown rejects before metadata/native ownership/physical send.
    const stream=f.consumer.serveProfileStream(f.p,"paper",f.profile,"TEST_ONLY-unreached-token",reply()),
      streamOutcome=stream.then(()=>null,error=>error);
    let closed=false;let closing:Promise<unknown>|undefined;
    try{
      await Promise.all([enteredRead.promise,enteredAuthority.promise]);
      await vi.advanceTimersByTimeAsync(2001);
      expect(await captureOutcome).toMatchObject({code:"N31_LOCAL_READ_TIMEOUT"});
      closing=ctx.app.close().then(()=>{closed=true;return null;},error=>error);
      await enteredShutdown;
      const barrier=f.local.beforeApplicationShutdown();
      expect(f.local.beforeApplicationShutdown()).toBe(barrier);
      expect(f.local.onApplicationShutdown()).toBe(barrier);
      expect(nativeStop).toHaveBeenCalledTimes(1);
      expect(closed).toBe(false);expect(ctx.pool.end).not.toHaveBeenCalled();
      heldRead.resolve(f.snapshot);await heldRead.promise;
      // ORIGINAL local read has settled; native current SQL is independently
      // held, so Nest still cannot enter the on-shutdown pool phase.
      expect(closed).toBe(false);expect(ctx.pool.end).not.toHaveBeenCalled();
      heldAuthority.resolve(testStreamDecision(f));
      expect(await streamOutcome).toMatchObject({code:"NATIVE_MANAGER_READ_UNAVAILABLE"});
      expect(await closing).toBeNull();
      expect(closed).toBe(true);expect(ctx.pool.end).toHaveBeenCalledTimes(owns?1:0);
      expect(f.acquire).not.toHaveBeenCalled();expect(f.send).not.toHaveBeenCalled();
      expect(f.repository.snapshotMetadata).not.toHaveBeenCalled();
      expect(nativeStop).toHaveBeenCalledTimes(1);
    }finally{
      try{
        heldRead.resolve(f.snapshot);heldAuthority.resolve(testStreamDecision(f));
        await Promise.allSettled([capture,stream]);
        if(closing)await closing;else await ctx.app.close();
      }finally{vi.useRealTimers();}
    }
  });
  it("does not dispose after failed Hub drain; still joins held original authority/read before rejecting",async()=>{
    const f=await realtimeFixture(),ctx=await shutdownContext(f.local,true),enteredShutdown=observedShutdown(f.local);
    const failure=new Error("TEST_ONLY-original-drain-failed");
    const drain=vi.spyOn(ScopedReplayHub.prototype,"drain").mockRejectedValue(failure);
    const heldRead=deferred<ProfileProjectionSnapshot>(),enteredRead=deferred<void>();
    const heldAuthority=deferred<ReturnType<typeof testStreamDecision>>(),enteredAuthority=deferred<void>();
    f.repository.snapshot.mockImplementation(async()=>{enteredRead.resolve();return heldRead.promise;});
    vi.mocked(evaluateManagerDomainStream).mockImplementation(async()=>{enteredAuthority.resolve();return heldAuthority.promise;});
    vi.useFakeTimers();
    const capture=f.capture(),captureOutcome=capture.then(()=>null,error=>error);
    const stream=f.consumer.serveProfileStream(f.p,"paper",f.profile,"TEST_ONLY-unreached-token",reply()),
      streamOutcome=stream.then(()=>null,error=>error);
    let settled=false;let closing:Promise<unknown>|undefined;
    try{
      await Promise.all([enteredRead.promise,enteredAuthority.promise]);
      await vi.advanceTimersByTimeAsync(2001);
      expect(await captureOutcome).toMatchObject({code:"N31_LOCAL_READ_TIMEOUT"});
      closing=ctx.app.close().then(()=>{settled=true;return null;},error=>{settled=true;return error;});
      await enteredShutdown;
      expect(settled).toBe(false);expect(ctx.pool.end).not.toHaveBeenCalled();
      heldRead.resolve(f.snapshot);await heldRead.promise;await Promise.resolve();
      expect(settled).toBe(false);expect(ctx.pool.end).not.toHaveBeenCalled();
      heldAuthority.resolve(testStreamDecision(f));
      expect(await streamOutcome).toMatchObject({code:"NATIVE_MANAGER_READ_UNAVAILABLE"});
      expect(await closing).toBe(failure);
      const barrier=f.local.beforeApplicationShutdown();
      expect(f.local.onApplicationShutdown()).toBe(barrier);
      await expect(barrier).rejects.toBe(failure);
      expect(drain).toHaveBeenCalledTimes(1);expect(ctx.pool.end).not.toHaveBeenCalled();
    }finally{
      try{
        heldRead.resolve(f.snapshot);heldAuthority.resolve(testStreamDecision(f));
        await Promise.allSettled([capture,stream]);
        if(closing)await closing;else await ctx.app.close().catch(()=>undefined);
      }finally{vi.useRealTimers();}
    }
  });
});
describe("TEST_ONLY pre-await STREAM capacity and original-promise ownership",()=>{
  it("caps actual authority preparation at configured 2, retains closed caller slot, and joins every pending original on stop",async()=>{
    const f=await realtimeFixture(2),held=[deferred<ReturnType<typeof testStreamDecision>>(),
      deferred<ReturnType<typeof testStreamDecision>>(),deferred<ReturnType<typeof testStreamDecision>>()],
      enteredTwo=deferred<void>(),enteredThree=deferred<void>();
    await f.capture();vi.clearAllMocks();
    const subscribe=vi.spyOn(ScopedReplayHub.prototype,"subscribeNative");
    let calls=0;
    vi.mocked(evaluateManagerDomainStream).mockImplementation(()=>{
      const index=calls++;if(calls===2)enteredTwo.resolve();if(calls===3)enteredThree.resolve();
      return held[index]!.promise;
    });
    const firstReply=reply(),first=f.consumer.serveProfileStream(f.p,"paper",f.profile,f.token(),firstReply),
      firstOutcome=first.then(()=>null,error=>error),
      second=f.consumer.serveProfileStream(f.p,"paper",f.profile,f.token(),reply()),
      secondOutcome=second.then(()=>null,error=>error);
    let replacement:Promise<boolean>|undefined,replacementOutcome:Promise<unknown>|undefined,stop:Promise<void>|undefined;
    try{
      await enteredTwo.promise;
      expect(f.db.pool.connect).toHaveBeenCalledTimes(2);
      const third=()=>f.consumer.serveProfileStream(f.p,"paper",f.profile,f.token(),reply());
      await expect(third()).rejects.toMatchObject({code:"RECONNECT_LIMIT"});
      // Actual caller close is not actual auth-I/O settlement and releases no slot.
      firstReply.raw.destroy();
      await expect(third()).rejects.toMatchObject({code:"RECONNECT_LIMIT"});
      expect(evaluateManagerDomainStream).toHaveBeenCalledTimes(2);
      expect(f.db.pool.connect).toHaveBeenCalledTimes(2);
      expect(f.repository.snapshotMetadata).not.toHaveBeenCalled();expect(subscribe).not.toHaveBeenCalled();
      expect(f.source.relationForNamedOperation).not.toHaveBeenCalled();
      expect(f.acquire).not.toHaveBeenCalled();expect(f.send).not.toHaveBeenCalled();

      held[0]!.resolve(testStreamDecision(f));
      expect(await firstOutcome).toMatchObject({code:"NATIVE_MANAGER_READ_UNAVAILABLE"});
      replacement=third();replacementOutcome=replacement.then(()=>null,error=>error);
      await enteredThree.promise;
      expect(evaluateManagerDomainStream).toHaveBeenCalledTimes(3);
      const headReads=f.repository.snapshotMetadata.mock.calls.length,connects=f.db.pool.connect.mock.calls.length;
      let stopped=false;stop=f.local.beforeApplicationShutdown().then(()=>{stopped=true;});
      await expect(third()).rejects.toMatchObject({code:"NATIVE_MANAGER_READ_UNAVAILABLE"});
      expect(evaluateManagerDomainStream).toHaveBeenCalledTimes(3);expect(f.db.pool.connect).toHaveBeenCalledTimes(connects);
      expect(stopped).toBe(false);
      held[1]!.resolve(testStreamDecision(f));
      expect(await secondOutcome).toMatchObject({code:"NATIVE_MANAGER_READ_UNAVAILABLE"});
      expect(stopped).toBe(false); // Replacement's ORIGINAL auth call still owns its slot/join.
      held[2]!.resolve(testStreamDecision(f));
      expect(await replacementOutcome).toMatchObject({code:"NATIVE_MANAGER_READ_UNAVAILABLE"});
      await stop;expect(stopped).toBe(true);
      expect(f.repository.snapshotMetadata).toHaveBeenCalledTimes(headReads);
      expect(subscribe).not.toHaveBeenCalled();expect(f.send).not.toHaveBeenCalled();
    }finally{
      held.forEach(value=>value.resolve(testStreamDecision(f)));
      await Promise.allSettled([first,second,...(replacement?[replacement]:[])]);
      if(stop)await stop;await f.close();
    }
  });
  it("a genuinely full native Hub rejects before extra authority/metadata but does not revoke independent READ snapshot",async()=>{
    const f=await realtimeFixture(2),streams=[nativeStreamReply(),nativeStreamReply()];
    try{
      await f.capture();
      for(const response of streams){
        expect(await f.consumer.serveProfileStream(f.p,"paper",f.profile,f.token(),response)).toBe(true);
        expect(response.hijack).toHaveBeenCalledTimes(1);
        expect(response.raw.headersSent).toBe(false); // Opening is not a sent frame/ACK.
      }
      expect(f.consumer.hasRealtimeClients()).toBe(true);
      const authorityCalls=vi.mocked(evaluateManagerDomainStream).mock.calls.length,
        connects=f.db.pool.connect.mock.calls.length,headReads=f.repository.snapshotMetadata.mock.calls.length;
      await expect(f.consumer.serveProfileStream(f.p,"paper",f.profile,f.token(),reply()))
        .rejects.toMatchObject({code:"RECONNECT_LIMIT"});
      expect(evaluateManagerDomainStream).toHaveBeenCalledTimes(authorityCalls);
      expect(f.db.pool.connect).toHaveBeenCalledTimes(connects);
      expect(f.repository.snapshotMetadata).toHaveBeenCalledTimes(headReads);
      // READ still uses its genuine independent path even with no STREAM slot.
      expect(await f.consumer.serveProfileSnapshot(f.p,"paper",f.profile,f.local,reply())).toBe(true);
      expect(evaluateManagerDomainStream).toHaveBeenCalledTimes(authorityCalls);
      expect(f.repository.snapshot).toHaveBeenCalledTimes(2);
      expect(f.consumer.hasRealtimeClients()).toBe(true);
      expect(f.source.relationForNamedOperation).not.toHaveBeenCalled();
    }finally{
      await f.close();for(const response of streams)response.raw.destroy();
    }
  });
});
