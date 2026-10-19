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
import { accessDigest } from "../src/execution-v2/access-policy";
import { AccessPolicyError, type AccessActor, type ManagerDomainReadDecision } from "../src/execution-v2/access.contract";
import { NativeManagerReadConsumer, nativeManagerDataEpoch, type NativeManagerRequest } from "../src/execution-v2/native-manager-consumer";
import { CurrentHumanCandidate, type PreparedCurrentHumanNativeHTTP } from "../src/execution-v2/current-human-candidate";
import { SelectedNativeBusinessReadSource, selectedNativeBusinessReadSelection } from "../src/execution-v2/native-business-read-selected-source";
import { composeNativeCore,nativeCoreManagerReadConsumer,type NativeCoreSelection } from "../src/execution-v2/native-core-composition";
import type { AccessTrustProvider } from "../src/execution-v2/access-trust";
import { MaximumDataOperationController } from "../src/execution/maximum-data-operation.controller";
import type { WorkspacesRepository } from "../src/repos/workspaces";
import { evaluateManagerDomainRead } from "../src/execution-v2/current-human-snapshot";
import { MaximumDataOperationError, MaximumDataOperationService, type MaximumDataOperationPrincipal } from "../src/execution/maximum-data-operation.service";
import { MaximumDataContinuationRepository, type MaximumDataContinuationScope } from "../src/execution/maximum-data-continuation.repository";
import { sharedReadIdentity, type SharedReadScope } from "../src/execution/shared-read.repository";
import type { ExecutionCurrentSourceProxy } from "../src/execution/current-source.proxy";
import type { ControlApiConfig } from "../src/config";
import type { ExecutionReadScopes } from "../src/execution-v2/read-scope";
import { MAXIMUM_DATA_DEPLOYMENT_OPERATION } from "../src/execution/maximum-data-operation.registry";
import { ExecutionProfileRealtimeService } from "../src/execution/profile-realtime.service";
import type { ExecutionProfileProjectionRepository,ProfileProjectionSnapshot } from "../src/execution/profile-projection.repository";
import { ScopedReplayCursorCodec,decodeScopedReplayContinuation } from "../src/execution-v2/scoped-replay-cursor";
import { managerObservationBaseline,managerObservationQueryDigest,MANAGER_OBSERVATION_BASELINE_MODEL,
  MANAGER_OBSERVATION_STREAM_MODEL } from "../src/execution-v2/manager-observation-source";
import type { ScopedReplayBinding } from "../src/execution-v2/realtime.contract";
vi.mock("../src/execution-v2/current-human-snapshot", async original => ({
  ...await original<typeof import("../src/execution-v2/current-human-snapshot")>(),
  evaluateManagerDomainRead:vi.fn(),
}));
const raw=(c:string)=>c.repeat(64),hash=(c:string)=>"sha256:"+raw(c);
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
const nextTurn=()=>new Promise<void>(done=>setImmediate(done));
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
async function composedFixture(){
  const f=await fixture();
  const unused=async():Promise<never>=>{throw Error("TEST_ONLY_NO_AUTHORITY_IO_DURING_CONSTRUCTION");};
  const base:AccessTrustProvider={verifyPolicy:unused,verifyReceipt:unused,relations:unused,verifiedHumanMapping:unused};
  const composition=await composeNativeCore(f.db.pool,base,{
    expected_workload_id:"TEST_ONLY-pm",selections:[f.e],retained_recovery:[],
    owner_intakes:[{artifact_path:"/TEST_ONLY-unopened-owner-intake",approved_sha256:raw("a"),
      target:{database_name:"TEST_ONLY_control",database_system_identifier:"1234567890",role_name:"TEST_ONLY_core",
        protected_owner_user_id:"TEST_ONLY-owner",workspace_id:f.p.workspaceId,
        principal_workspace_pins:[{user_id:f.p.user.userId,workspace_id:f.p.workspaceId}]},
      intake_not_before_ms:Date.now()-1000,intake_not_after_ms:Date.now()+60000}],
    mutation_limits:{maximum_intents:16,maximum_recoveries_per_request:16}});
  return {...f,composition};
}
async function observationFixture(withRealtime=true){
  const f=await fixture(),selected=selectedNativeBusinessReadSelection(f.e.config.selected_source);
  const observation={workspace_id:f.p.workspaceId,environment:"paper" as const,profile_id:f.e.selector.domain.profile_id,
    source_identity_digest:selected.source_identity_digest,source_contract_revision:MAXIMUM_DATA_DEPLOYMENT_OPERATION.sourceContractRevision,
    source_catalogue_sha256:MAXIMUM_DATA_DEPLOYMENT_OPERATION.sourceCatalogueSha256};
  const snapshot:ProfileProjectionSnapshot={document:{schema_version:"portal.execution.profile-projection.v1",
    workspace_id:f.p.workspaceId,environment:"paper",profile_id:observation.profile_id,relations:{},
    source_contract_revision:observation.source_contract_revision,source_catalogue_sha256:observation.source_catalogue_sha256},
    sourceEpoch:"TEST_ONLY-original-source",sourceCursor:"TEST_ONLY-private-source",sourceAsOf:null,receivedAt:new Date(),
    lastSuccessfulRefreshAt:new Date(),completeness:"UNKNOWN",projectionEpoch:"12345678-1234-1234-1234-123456789abc",
    projectionSequence:10,payloadDigest:hash("a"),sourceCatalogueSha256:observation.source_catalogue_sha256};
  const repository={snapshot:vi.fn(async()=>snapshot),refreshHealth:vi.fn(async()=>({state:"HEALTHY",reasonCode:null,retryNotBefore:null})),
    snapshotMetadata:vi.fn(async()=>({...snapshot,sourceContractRevision:observation.source_contract_revision})),journalAfter:vi.fn(async()=>[])};
  const stream=vi.fn(async()=>{throw Error("TEST_ONLY_NO_STREAM_AUTHORITY");});
  const codec=new ScopedReplayCursorCodec("test",{test:"TEST_ONLY-cursor-key-at-least-32-bytes"},300_000);
  const local=new ExecutionProfileRealtimeService({FEATURE_EXECUTION_LOCAL_PROJECTION:"true",
    EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS:1000} as ControlApiConfig,repository as unknown as ExecutionProfileProjectionRepository);
  const consumer=new NativeManagerReadConsumer(f.db.pool,f.operations,{selectedCandidate:f.select},[f.e],withRealtime?{
    scopes:{authorizeManagerNativeStream:stream} as unknown as ExecutionReadScopes,
    repository:repository as unknown as ExecutionProfileProjectionRepository,codec,
    limits:{maximumClients:2,maximumEntriesPerClient:2,maximumFrameBytes:8192,maximumClientBytes:16384,
      maximumTotalBytes:32768,maximumNoticesPerRead:2,readTimeoutMs:1000}}:undefined);
  const baseline=managerObservationBaseline(snapshot,observation),binding:ScopedReplayBinding={workspace_id:f.p.workspaceId,
    environment:"paper",profile_id:observation.profile_id,principal_scope_digest:accessDigest({
      schema_version:"portal.manager-observation.read-baseline-scope.v1",actor:{user_id:f.p.user.userId,
        session_id:f.p.session.sessionId,session_generation:f.p.session.sessionVersion},viewer_workspace_id:null,read_scope_digest:f.d.scope_digest}),
    app_policy_revision:f.d.policy_revision,field_policy_revision:f.d.field_policy_ref,model_revision:MANAGER_OBSERVATION_BASELINE_MODEL,
    schema_revision:"portal.execution.scoped-realtime.v1",dataset:"execution_profile_observation",query_digest:managerObservationQueryDigest(observation),
    window:null,snapshot_id:baseline.snapshot_id,source_set_digest:baseline.source_set_digest,
    source_continuity_epoch:baseline.source_continuity_epoch,projection_generation:baseline.projection_generation};
  return {...f,consumer,local,repository,codec,baseline,binding,stream};
}
describe("TEST_ONLY original observation baseline preparation, no commissioned STREAM",()=>{
  it("shutdown joins pending READ authority and starts no projection or Candidate afterward",async()=>{
    const f=await observationFixture(),wait=deferred<Awaited<ReturnType<typeof f.operations.currentNativeManagerRead>>>();
    const current=vi.spyOn(f.operations,"currentNativeManagerRead").mockReturnValue(wait.promise);
    const pending=f.consumer.serveProfileSnapshot(f.p,"paper",f.e.selector.domain.profile_id,f.local,f.response);
    const refused=expect(pending).rejects.toMatchObject({code:"NATIVE_MANAGER_READ_UNAVAILABLE"});
    let ended=false;const stop=f.consumer.stopRealtime().then(()=>{ended=true;});
    try{
      await nextTurn();expect(ended).toBe(false);expect(current).toHaveBeenCalledOnce();
      wait.resolve({decision:f.d,nativeEpochDigest:hash("a")});await refused;await stop;
      expect(f.repository.snapshot).not.toHaveBeenCalled();expect(f.acquire).not.toHaveBeenCalled();expect(f.send).not.toHaveBeenCalled();
    }finally{wait.resolve({decision:f.d,nativeEpochDigest:hash("a")});await stop;await f.local.onApplicationShutdown();}
  });
  it("shutdown joins STREAM authorization and starts no metadata lookup afterward",async()=>{
    const f=await observationFixture(),wait=deferred<never>();f.stream.mockReturnValue(wait.promise);
    const pending=f.consumer.serveProfileStream(f.p,"paper",f.e.selector.domain.profile_id,"TEST_ONLY-not-an-authority",reply());
    const refused=expect(pending).rejects.toMatchObject({code:"NATIVE_MANAGER_READ_UNAVAILABLE"});
    let ended=false;const stop=f.consumer.stopRealtime().then(()=>{ended=true;});
    try{
      await nextTurn();expect(ended).toBe(false);expect(f.stream).toHaveBeenCalledOnce();
      // No scope is minted: shutdown must refuse BEFORE interpreting a result.
      wait.resolve(undefined as never);await refused;await stop;
      expect(f.repository.snapshotMetadata).not.toHaveBeenCalled();expect(f.acquire).not.toHaveBeenCalled();
    }finally{wait.resolve(undefined as never);await stop;await f.local.onApplicationShutdown();}
  });
  it("shutdown joins captured snapshot preparation before refusing new admission",async()=>{
    const f=await observationFixture(),wait=deferred<Awaited<ReturnType<typeof f.local.prepareSnapshot>>>(),entered=deferred<void>();
    vi.spyOn(f.local,"prepareSnapshot").mockImplementation(async()=>{entered.resolve();return wait.promise;});
    const pending=f.consumer.serveProfileSnapshot(f.p,"paper",f.e.selector.domain.profile_id,f.local,f.response);
    const refused=expect(pending).rejects.toMatchObject({code:"NATIVE_MANAGER_READ_UNAVAILABLE"});
    await entered.promise;let ended=false;const stop=f.consumer.stopRealtime().then(()=>{ended=true;});
    try{
      await nextTurn();expect(ended).toBe(false);wait.resolve(undefined as never);await refused;await stop;
      expect(f.acquire).not.toHaveBeenCalled();expect(f.send).not.toHaveBeenCalled();
      expect(f.response.raw.headersSent).toBe(false);
    }finally{wait.resolve(undefined as never);await stop;await f.local.onApplicationShutdown();}
  });
  it("already admitted final delivery settles through its SAME Candidate before shutdown resolves",async()=>{
    const f=await observationFixture(),wait=deferred<Awaited<ReturnType<typeof f.candidate.sendNativeRead>>>(),entered=deferred<void>();
    f.send.mockImplementation(async()=>{entered.resolve();return wait.promise;});
    const pending=f.consumer.serveProfileSnapshot(f.p,"paper",f.e.selector.domain.profile_id,f.local,f.response);
    await entered.promise;let ended=false;const stop=f.consumer.stopRealtime().then(()=>{ended=true;});
    try{
      await nextTurn();expect(ended).toBe(false);expect(f.acquire).toHaveBeenCalledOnce();
      wait.resolve({state:"RECONCILED",context:{} as never});expect(await pending).toBe(true);await stop;
      await expect(f.consumer.serveProfileSnapshot(f.p,"paper",f.e.selector.domain.profile_id,f.local,reply()))
        .rejects.toMatchObject({code:"NATIVE_MANAGER_READ_UNAVAILABLE"});
      expect(f.acquire).toHaveBeenCalledOnce();expect(f.send).toHaveBeenCalledOnce();
    }finally{wait.resolve({state:"RECONCILED",context:{} as never});await pending;await stop;await f.local.onApplicationShutdown();}
  });
  it("uses actual current READ and the SAME captured snapshot without STREAM or upstream fetch",async()=>{
    const f=await observationFixture();try{
      expect(await f.consumer.serveProfileSnapshot(f.p,"paper",f.e.selector.domain.profile_id,f.local,f.response)).toBe(true);
      const token=f.response.raw.getHeader("X-Portal-Realtime-Cursor") as string;
      expect(f.response.raw.getHeader("X-Portal-Realtime-State")).toBe("NATIVE_SCOPED_BASELINE_V1");
      expect(decodeScopedReplayContinuation(f.codec,token,f.binding)).toBe(f.baseline.source_cursor);
      expect(f.repository.snapshot).toHaveBeenCalledOnce();expect(f.stream).not.toHaveBeenCalled();
      expect(f.source.relationForNamedOperation).not.toHaveBeenCalled();expect(f.source.relationForCataloguedOperation).not.toHaveBeenCalled();
      expect(f.acquire).toHaveBeenCalledOnce();expect(f.send).toHaveBeenCalledOnce();
      const body=JSON.parse((f.send.mock.calls[0]![2] as Buffer).toString("utf8"));
      expect(body.projection_sequence).toBe(10);expect(body.payload.snapshot_mode).toBe("CURSOR_ONLY");
      expect(body.cursor).toBe(f.binding.projection_generation+":10");
      expect(()=>decodeScopedReplayContinuation(f.codec,token,{...f.binding,model_revision:MANAGER_OBSERVATION_STREAM_MODEL})).toThrow();
    }finally{f.consumer.stopRealtime();await f.local.onApplicationShutdown();}
  });
  it("cannot open STREAM from that READ baseline when current STREAM refuses",async()=>{
    const f=await observationFixture();try{
      await f.consumer.serveProfileSnapshot(f.p,"paper",f.e.selector.domain.profile_id,f.local,f.response);
      const token=f.response.raw.getHeader("X-Portal-Realtime-Cursor") as string,streamReply=reply();
      await expect(f.consumer.serveProfileStream(f.p,"paper",f.e.selector.domain.profile_id,token,streamReply))
        .rejects.toThrow("TEST_ONLY_NO_STREAM_AUTHORITY");
      expect(streamReply.raw.headersSent).toBe(false);expect(f.consumer.hasRealtimeClients()).toBe(false);
      expect(f.repository.snapshotMetadata).not.toHaveBeenCalled();expect(f.acquire).toHaveBeenCalledTimes(1);
    }finally{f.consumer.stopRealtime();await f.local.onApplicationShutdown();}
  });
  it("requires an explicit baseline without requesting source metadata",async()=>{
    const f=await observationFixture();try{
      await expect(f.consumer.serveProfileStream(f.p,"paper",f.e.selector.domain.profile_id,undefined,f.response))
        .rejects.toMatchObject({code:"SNAPSHOT_REQUIRED"});
      expect(f.stream).not.toHaveBeenCalled();expect(f.repository.snapshotMetadata).not.toHaveBeenCalled();
    }finally{f.consumer.stopRealtime();await f.local.onApplicationShutdown();}
  });
  it("keeps finite READ usable without replay budgets, while STREAM is unavailable",async()=>{
    const f=await observationFixture(false);try{
      expect(await f.consumer.serveProfileSnapshot(f.p,"paper",f.e.selector.domain.profile_id,f.local,f.response)).toBe(true);
      expect(f.response.raw.getHeader("X-Portal-Realtime-State")).toBe("NATIVE_SCOPED_STREAM_UNAVAILABLE");
      expect(f.response.raw.getHeader("X-Portal-Realtime-Cursor")).toBeUndefined();
      expect(f.repository.snapshot).toHaveBeenCalledOnce();expect(f.acquire).toHaveBeenCalledOnce();expect(f.send).toHaveBeenCalledOnce();
      const body=JSON.parse((f.send.mock.calls[0]![2] as Buffer).toString("utf8"));
      expect(body.projection_sequence).toBe(10);expect(body.cursor).toBe(f.binding.projection_generation+":10");
      await expect(f.consumer.serveProfileStream(f.p,"paper",f.e.selector.domain.profile_id,"TEST_ONLY-baseline",reply()))
        .rejects.toMatchObject({code:"NATIVE_MANAGER_READ_UNAVAILABLE",status:503});
      expect(f.stream).not.toHaveBeenCalled();expect(f.repository.snapshotMetadata).not.toHaveBeenCalled();
    }finally{await f.consumer.stopRealtime();await f.local.onApplicationShutdown();}
  });
  it("denies field seal drift before native delivery, never entity/ROOT fallback",async()=>{
    const f=await observationFixture();try{
      vi.mocked(evaluateManagerDomainRead).mockResolvedValue({...f.d,field_policy_sha256:raw("f")});
      await expect(f.consumer.serveProfileSnapshot(f.p,"paper",f.e.selector.domain.profile_id,f.local,f.response))
        .rejects.toMatchObject({code:"NATIVE_MANAGER_READ_DENIED"});
      expect(f.acquire).not.toHaveBeenCalled();expect(f.response.raw.headersSent).toBe(false);
      expect(f.entityAuthorize).not.toHaveBeenCalled();
    }finally{f.consumer.stopRealtime();await f.local.onApplicationShutdown();}
  });
  it.each(["profile","workspace","session"] as const)("denies changed %s before projection/native work",async axis=>{
    const f=await observationFixture();try{
      if(axis==="workspace")f.p.workspaceId="TEST_ONLY-wrong-workspace";
      if(axis==="session")f.p.session.sessionVersion++;
      await expect(f.consumer.serveProfileSnapshot(f.p,"paper",axis==="profile"?"TEST_ONLY-wrong-profile":f.e.selector.domain.profile_id,f.local,f.response))
        .rejects.toMatchObject({code:"NATIVE_MANAGER_READ_DENIED"});
      expect(f.repository.snapshot).not.toHaveBeenCalled();expect(f.acquire).not.toHaveBeenCalled();
    }finally{f.consumer.stopRealtime();await f.local.onApplicationShutdown();}
  });
  it("stopped composition refuses even with an original READ baseline",async()=>{
    const f=await observationFixture();try{f.consumer.stopRealtime();
      await expect(f.consumer.serveProfileSnapshot(f.p,"paper",f.e.selector.domain.profile_id,f.local,f.response))
        .rejects.toMatchObject({code:"NATIVE_MANAGER_READ_UNAVAILABLE"});
      expect(f.acquire).not.toHaveBeenCalled();
    }finally{await f.local.onApplicationShutdown();}
  });
});
describe("TEST_ONLY private composition and existing BFF mounting, no runtime authority",()=>{
  it("genuine same-pool/trust/coordinator DI constructs inertly",async()=>{
    const f=await composedFixture(),consumer=nativeCoreManagerReadConsumer(
      f.composition,f.db.pool,f.operations,f.composition.dependencies);
    expect(consumer.uses(f.db.pool,f.operations)).toBe(true);
    expect(f.db.pool.connect).not.toHaveBeenCalled();expect(f.source.relationForNamedOperation).not.toHaveBeenCalled();
  });
  it.each(["clone","fake","pool","trust","coordinator"] as const)("refuses %s binding before any source or DB I/O",async mode=>{
    const f=await composedFixture();
    const composition=mode==="clone"?{...f.composition}:mode==="fake"?{selectedCandidate:()=>f.candidate}:f.composition;
    const pool=mode==="pool"?fakePool().pool:f.db.pool;
    const dependencies={...f.composition.dependencies,...(mode==="trust"?{executionAccessTrust:{} as AccessTrustProvider}:{}),
      ...(mode==="coordinator"?{currentHumanMutations:undefined}:{})};
    expect(()=>nativeCoreManagerReadConsumer(composition as typeof f.composition,pool,f.operations,dependencies)).toThrow();
    expect(f.db.pool.connect).not.toHaveBeenCalled();expect(f.source.relationForNamedOperation).not.toHaveBeenCalled();
  });
  for(const route of ["deployments","relation"] as const){
    const invoke=(controller:MaximumDataOperationController,f:Awaited<ReturnType<typeof fixture>>,query:unknown)=>{
      const request={portalUser:f.p.user,portalSession:f.p.session,portalWorkspaceId:f.p.workspaceId,
        portalViewerWorkspaceId:"TEST_ONLY-viewer"};
      return route==="deployments"?controller.deployments(request as never,query,f.response):
        controller.currentRelation(request as never,"account-balances",query,f.response);
    };
    it(`${route} passes trusted principal/query/reply to the sole native writer`,async()=>{
      const f=await fixture(),serve=vi.fn(async()=>true),legacy=vi.fn();
      const operations={deploymentPage:legacy,relationPage:legacy} as unknown as MaximumDataOperationService;
      const check=vi.fn(async()=>true),workspaces={canReadExecution:check} as unknown as WorkspacesRepository;
      const controller=new MaximumDataOperationController(operations,workspaces,{serve} as unknown as NativeManagerReadConsumer);
      expect(await invoke(controller,f,{environment:"paper",limit:17,cursor:"TEST_ONLY-cursor"})).toBeUndefined();
      expect(check).toHaveBeenCalledWith(f.p.workspaceId,f.p.user.userId,"paper");expect(legacy).not.toHaveBeenCalled();
      expect(serve).toHaveBeenCalledExactlyOnceWith({principal:{...f.p,viewerWorkspaceId:"TEST_ONLY-viewer"},
        operation:route==="deployments"?{kind:"DEPLOYMENTS"}:{kind:"RELATION",route_id:"account-balances"},
        query:{environment:"paper",limit:17,cursor:"TEST_ONLY-cursor"}},f.response);
    });
    it(`${route} never falls back after a selected native refusal`,async()=>{
      const f=await fixture(),serve=vi.fn(async()=>{throw Error("TEST_ONLY_NATIVE_DENIED");}),legacy=vi.fn();
      const controller=new MaximumDataOperationController({deploymentPage:legacy,relationPage:legacy} as unknown as MaximumDataOperationService,
        {canReadExecution:async()=>true} as unknown as WorkspacesRepository,{serve} as unknown as NativeManagerReadConsumer);
      await expect(invoke(controller,f,{})).rejects.toThrow("TEST_ONLY_NATIVE_DENIED");expect(legacy).not.toHaveBeenCalled();
    });
    it(`${route} preserves the legacy path only for an unselected user`,async()=>{
      const f=await fixture(),serve=vi.fn(async()=>false),legacy=vi.fn(async()=>({TEST_ONLY:"legacy"}));
      const controller=new MaximumDataOperationController({deploymentPage:legacy,relationPage:legacy} as unknown as MaximumDataOperationService,
        {canReadExecution:async()=>true} as unknown as WorkspacesRepository,{serve} as unknown as NativeManagerReadConsumer);
      expect(await invoke(controller,f,{})).toEqual({TEST_ONLY:"legacy"});expect(legacy).toHaveBeenCalledTimes(1);
    });
    it(`${route} rejects hidden workspace and invalid query before native dispatch`,async()=>{
      const f=await fixture(),serve=vi.fn(),legacy=vi.fn();
      const controller=new MaximumDataOperationController({deploymentPage:legacy,relationPage:legacy} as unknown as MaximumDataOperationService,
        {canReadExecution:async()=>false} as unknown as WorkspacesRepository,{serve} as unknown as NativeManagerReadConsumer);
      await expect(invoke(controller,f,{})).rejects.toMatchObject({code:"WORKSPACE_NOT_FOUND"});
      await expect(invoke(controller,f,{limit:201})).rejects.toMatchObject({status:400});
      expect(serve).not.toHaveBeenCalled();expect(legacy).not.toHaveBeenCalled();
    });
  }
});
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
