/** TEST_ONLY coordinator/dispatch units. Stub consumer is NOT native authority;
 * actual SessionGuard/PM/PG/physical-frame qualification remains separate. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { HttpException } from "@nestjs/common";
import type { ControlApiConfig } from "../src/config";
import { AppModule } from "../src/app.module";
import { ExecutionProfileRealtimeService, NATIVE_MANAGER_REALTIME_COORDINATOR } from "../src/execution/profile-realtime.service";
import { ExecutionRealtimeController } from "../src/execution/realtime.controller";
import { MaximumDataOperationError } from "../src/execution/maximum-data-operation.service";
import { ScopedReplayError } from "../src/execution-v2/scoped-replay-cursor";
import type { NativeManagerReadConsumer } from "../src/execution-v2/native-manager-consumer";
import type { ExecutionProfileProjectionRepository, ProfileProjectionSnapshot } from "../src/execution/profile-projection.repository";

const workspace="TEST_ONLY-workspace",profile="PAPER_BINANCE_USDM";
const config={FEATURE_EXECUTION_LOCAL_PROJECTION:"true",FEATURE_EXECUTION_CURRENT_SOURCE_PAPER:"true",
  FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX:"true",FEATURE_EXECUTION_CURRENT_SOURCE_LIVE:"true",EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS:1000,
  EXECUTION_EDGE_PAPER_PROFILE_ID:profile,EXECUTION_EDGE_SANDBOX_PROFILE_ID:"SANDBOX_BINANCE_USDM",
  EXECUTION_EDGE_LIVE_PROFILE_ID:"LIVE_BINANCE_USDM",EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID:workspace} as ControlApiConfig;
const snapshot:ProfileProjectionSnapshot={document:{schema_version:"portal.execution.profile-projection.v1",
  workspace_id:workspace,environment:"paper",profile_id:profile,source_contract_revision:"TEST_ONLY-r1",
  source_catalogue_sha256:"sha256:"+"a".repeat(64),relations:{}},sourceEpoch:"TEST_ONLY-source-epoch",
  sourceCursor:"TEST_ONLY-private-source",sourceAsOf:null,receivedAt:new Date(1000),lastSuccessfulRefreshAt:new Date(1000),
  completeness:"UNKNOWN",projectionEpoch:"12345678-1234-1234-1234-123456789abc",projectionSequence:10,
  payloadDigest:"sha256:"+"b".repeat(64),sourceCatalogueSha256:"sha256:"+"a".repeat(64)};
const health={state:"HEALTHY",reasonCode:null,retryNotBefore:null} as const;
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
function coordinator(){
  let clients=true;
  const native={hasRealtimeClients:vi.fn(()=>clients),pollRealtime:vi.fn(async():Promise<void>=>undefined),
    stopRealtime:vi.fn(async():Promise<void>=>{clients=false;})};
  const repository={snapshot:vi.fn(async()=>snapshot),refreshHealth:vi.fn(async()=>health)};
  const service=new ExecutionProfileRealtimeService(config,repository as unknown as ExecutionProfileProjectionRepository,
    native as unknown as NativeManagerReadConsumer);
  return {service,native,repository,setClients:(value:boolean)=>{clients=value;}};
}
function controller(){
  const local={startNativePolling:vi.fn(),snapshot:vi.fn(async()=>({TEST_ONLY:"legacy"})),subscribe:vi.fn(),
    prepareSnapshot:vi.fn(),heartbeat:vi.fn(),authExpired:vi.fn()};
  const native={serveProfileSnapshot:vi.fn(async(..._args:unknown[])=>true),serveProfileStream:vi.fn(async(..._args:unknown[])=>true)};
  const authority={authorize:vi.fn(async()=>undefined)},scopes={assertLegacyStream:vi.fn()};
  const raw=Object.assign(new EventEmitter(),{headersSent:false,destroyed:false,writableEnded:false,
    writeHead:vi.fn(),write:vi.fn(),end:vi.fn(),destroy:vi.fn()});
  const response={raw,hijack:vi.fn(),status:vi.fn().mockReturnThis(),send:vi.fn()};
  const request={portalUser:{userId:"TEST_ONLY-user"},portalSession:{sessionId:"TEST_ONLY-session"},
    portalWorkspaceId:"TEST_ONLY-viewer",headers:{"last-event-id":"TEST_ONLY-last-event"}};
  const instance=new ExecutionRealtimeController({} as never,{} as never,local as never,{} as never,{} as never,
    config,authority as never,scopes as never,native as never);
  return {instance,local,native,authority,scopes,request,response,raw,config};
}
afterEach(()=>vi.useRealTimers());
describe("Native observation uses the existing shared coordinator",()=>{
  it("captures one original row for both baseline and unchanged finite envelope",async()=>{
    const f=coordinator();try{
      const prepared=await f.service.prepareSnapshot(workspace,"paper",profile);
      expect(prepared.snapshot).toBe(snapshot);expect(prepared.envelope.projection_sequence).toBe(10);
      expect(prepared.envelope.cursor).toBe(snapshot.projectionEpoch+":10");
      expect(prepared.envelope.payload).toEqual({snapshot_mode:"CURSOR_ONLY",relation_count:0,
        source_contract_revision:snapshot.document.source_contract_revision,source_catalogue_sha256:snapshot.sourceCatalogueSha256});
      expect(f.repository.snapshot).toHaveBeenCalledTimes(1);
      expect(f.repository.refreshHealth).toHaveBeenCalledTimes(1);
    }finally{await f.service.onApplicationShutdown();}
  });
  it("keeps the old snapshot JSON without an extra projection read",async()=>{
    const f=coordinator();try{
      expect((await f.service.snapshot(workspace,"paper",profile)).schema_version).toBe("portal.execution.profile-realtime.v1");
      expect(f.repository.snapshot).toHaveBeenCalledTimes(1);
    }finally{await f.service.onApplicationShutdown();}
  });
  it("shares one timer and only one in-flight native poll",async()=>{
    vi.useFakeTimers();const f=coordinator(),wait=deferred<void>();f.native.pollRealtime.mockReturnValue(wait.promise);
    try{
      f.service.startNativePolling();f.service.startNativePolling();expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(1000);expect(f.native.pollRealtime).toHaveBeenCalledTimes(1);
      f.setClients(false);wait.resolve();await Promise.resolve();await Promise.resolve();
      expect(vi.getTimerCount()).toBe(0);expect(f.repository.snapshot).not.toHaveBeenCalled();
    }finally{wait.resolve();await f.service.onApplicationShutdown();}
  });
  it("does not create a timer or source poll without native clients",async()=>{
    vi.useFakeTimers();const f=coordinator();f.setClients(false);
    try{f.service.startNativePolling();await vi.advanceTimersByTimeAsync(1000);
      expect(vi.getTimerCount()).toBe(0);expect(f.native.pollRealtime).not.toHaveBeenCalled();
    }finally{await f.service.onApplicationShutdown();}
  });
  it("marks stopped, aborts and joins the actual in-flight poll before shutdown finishes",async()=>{
    vi.useFakeTimers();const f=coordinator(),wait=deferred<void>();f.native.pollRealtime.mockReturnValue(wait.promise);
    f.service.startNativePolling();await vi.advanceTimersByTimeAsync(250);
    let ended=false;const stop=f.service.onApplicationShutdown().then(()=>{ended=true;});
    expect(f.native.stopRealtime).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
    await Promise.resolve();expect(ended).toBe(false);
    expect(()=>f.service.startNativePolling()).toThrow("N31_SERVICE_STOPPED");
    wait.resolve();await stop;expect(ended).toBe(true);
  });
  it("joins native drain even after the public poll promise has already settled",async()=>{
    const f=coordinator(),wait=deferred<void>();f.native.stopRealtime.mockReturnValue(wait.promise);
    let ended=false;const stop=f.service.onApplicationShutdown().then(()=>{ended=true;});
    await Promise.resolve();expect(ended).toBe(false);wait.resolve();await stop;expect(ended).toBe(true);
  });
  it("denies a snapshot finishing after shutdown rather than handing it to a writer",async()=>{
    const f=coordinator(),wait=deferred<typeof health>(),entered=deferred<void>();
    f.repository.refreshHealth.mockImplementation(async()=>{entered.resolve();return wait.promise;});
    const pending=f.service.prepareSnapshot(workspace,"paper",profile);
    const rejected=expect(pending).rejects.toMatchObject({code:"N31_SERVICE_STOPPED"});
    await entered.promise;let ended=false;const stop=f.service.onApplicationShutdown().then(()=>{ended=true;});
    await Promise.resolve();expect(ended).toBe(false);wait.resolve(health);await rejected;await stop;expect(ended).toBe(true);
  });
  it("queued snapshot cannot begin repository work after stop",async()=>{
    const f=coordinator(),wait=deferred<ProfileProjectionSnapshot>(),entered=deferred<void>();
    f.repository.snapshot.mockImplementation(async()=>{entered.resolve();return wait.promise;});
    const first=f.service.prepareSnapshot(workspace,"paper",profile),queued=f.service.prepareSnapshot(workspace,"paper",profile);
    const rejected=Promise.all([expect(first).rejects.toMatchObject({code:"N31_SERVICE_STOPPED"}),
      expect(queued).rejects.toMatchObject({code:"N31_SERVICE_STOPPED"})]);
    await entered.promise;let ended=false;const stop=f.service.onApplicationShutdown().then(()=>{ended=true;});
    await Promise.resolve();expect(ended).toBe(false);wait.resolve(snapshot);await rejected;await stop;
    expect(f.repository.snapshot).toHaveBeenCalledOnce();expect(f.repository.refreshHealth).not.toHaveBeenCalled();
    await expect(f.service.prepareSnapshot(workspace,"paper",profile)).rejects.toMatchObject({code:"N31_SERVICE_STOPPED"});
    expect(f.repository.snapshot).toHaveBeenCalledOnce();
  });
  it.each(["resolve","reject"] as const)("shutdown joins actual repository %s after its response timed out",async outcome=>{
    vi.useFakeTimers();const f=coordinator(),entered=deferred<void>();
    let resolve!:(value:ProfileProjectionSnapshot)=>void,reject!:(error:Error)=>void;
    const actual=new Promise<ProfileProjectionSnapshot>((done,fail)=>{resolve=done;reject=fail;});
    f.repository.snapshot.mockImplementation(async()=>{entered.resolve();return actual;});
    const pending=f.service.prepareSnapshot(workspace,"paper",profile);
    const timedOut=expect(pending).rejects.toMatchObject({code:"N31_LOCAL_READ_TIMEOUT"});
    await entered.promise;await vi.advanceTimersByTimeAsync(2001);await timedOut;
    let ended=false;const stop=f.service.onApplicationShutdown().then(()=>{ended=true;});
    await Promise.resolve();expect(ended).toBe(false);expect(f.repository.refreshHealth).not.toHaveBeenCalled();
    if(outcome==="resolve")resolve(snapshot);else reject(new Error("TEST_ONLY-late-PG-rejection"));
    await stop;expect(ended).toBe(true);expect(vi.getTimerCount()).toBe(0);
  });
});
describe("Existing profile BFF opts into sole native writer, no legacy fallback",()=>{
  it.each(["paper","sandbox","live"] as const)("disabled %s profile denies native snapshot and stream before work",async environment=>{
    const f=controller(),flag=environment==="paper"?"FEATURE_EXECUTION_CURRENT_SOURCE_PAPER":
      environment==="sandbox"?"FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX":"FEATURE_EXECUTION_CURRENT_SOURCE_LIVE";
    const before=f.config[flag];f.config[flag]="false";
    try{
      await expect(f.instance.profileSnapshot(f.request as never,environment,f.response as never)).rejects.toMatchObject({status:404});
      await f.instance.profileStream(f.request as never,f.response as never,environment);
      expect(f.response.status).toHaveBeenCalledWith(404);expect(f.native.serveProfileSnapshot).not.toHaveBeenCalled();
      expect(f.native.serveProfileStream).not.toHaveBeenCalled();expect(f.local.startNativePolling).not.toHaveBeenCalled();
      expect(f.raw.writeHead).not.toHaveBeenCalled();expect(f.response.hijack).not.toHaveBeenCalled();
    }finally{f.config[flag]=before;}
  });
  it("disabled local projection denies both native routes before authority or transport",async()=>{
    const f=controller(),before=f.config.FEATURE_EXECUTION_LOCAL_PROJECTION;f.config.FEATURE_EXECUTION_LOCAL_PROJECTION="false";
    try{
      await expect(f.instance.profileSnapshot(f.request as never,"paper",f.response as never)).rejects.toMatchObject({status:404});
      await f.instance.profileStream(f.request as never,f.response as never,"paper");
      expect(f.response.status).toHaveBeenCalledWith(404);expect(f.native.serveProfileSnapshot).not.toHaveBeenCalled();
      expect(f.native.serveProfileStream).not.toHaveBeenCalled();expect(f.authority.authorize).not.toHaveBeenCalled();
      expect(f.local.startNativePolling).not.toHaveBeenCalled();expect(f.raw.writeHead).not.toHaveBeenCalled();
    }finally{f.config.FEATURE_EXECUTION_LOCAL_PROJECTION=before;}
  });
  it("mounts native finite delivery before legacy ADMIN/STREAM gates",async()=>{
    const f=controller();await f.instance.profileSnapshot(f.request as never,"paper",f.response as never);
    expect(f.native.serveProfileSnapshot).toHaveBeenCalledWith(expect.objectContaining({workspaceId:workspace,
      viewerWorkspaceId:f.request.portalWorkspaceId}),"paper",profile,f.local,f.response);
    expect(f.authority.authorize).not.toHaveBeenCalled();expect(f.scopes.assertLegacyStream).not.toHaveBeenCalled();
    expect(f.local.snapshot).not.toHaveBeenCalled();expect(f.response.send).not.toHaveBeenCalled();
  });
  it("starts the SAME coordinator after the selected stream owns transport",async()=>{
    const f=controller();await f.instance.profileStream(f.request as never,f.response as never,"paper","TEST_ONLY-query-cursor");
    expect(f.native.serveProfileStream.mock.calls[0]?.[3]).toBe("TEST_ONLY-last-event");
    expect(f.local.startNativePolling).toHaveBeenCalledOnce();expect(f.authority.authorize).not.toHaveBeenCalled();
    expect(f.raw.writeHead).not.toHaveBeenCalled();expect(f.raw.write).not.toHaveBeenCalled();
    expect(f.local.subscribe).not.toHaveBeenCalled();expect(f.response.hijack).not.toHaveBeenCalled();
  });
  it("has no legacy timer, heartbeat, lease monitor or subscription on native path",async()=>{
    vi.useFakeTimers();const f=controller();await f.instance.profileStream(f.request as never,f.response as never,"paper");
    await vi.advanceTimersByTimeAsync(30_000);expect(vi.getTimerCount()).toBe(0);
    expect(f.local.heartbeat).not.toHaveBeenCalled();expect(f.scopes.assertLegacyStream).not.toHaveBeenCalled();
  });
  it("selected native finite denial never falls back or emits an error body itself",async()=>{
    const f=controller();f.native.serveProfileSnapshot.mockRejectedValue(new MaximumDataOperationError("NATIVE_MANAGER_READ_DENIED",403));
    await expect(f.instance.profileSnapshot(f.request as never,"paper",f.response as never)).rejects.toMatchObject({status:403});
    expect(f.authority.authorize).not.toHaveBeenCalled();expect(f.local.snapshot).not.toHaveBeenCalled();
    expect(f.response.send).not.toHaveBeenCalled();expect(f.raw.write).not.toHaveBeenCalled();
  });
  it.each(["CURSOR_INVALID_OR_EXPIRED","SNAPSHOT_REQUIRED","SCOPE_CHANGED"] as const)("returns safe409 for %s without fallback",async code=>{
    const f=controller();f.native.serveProfileStream.mockRejectedValue(new ScopedReplayError(code));
    await f.instance.profileStream(f.request as never,f.response as never,"paper");
    expect(f.response.status).toHaveBeenCalledWith(409);expect(f.response.send).toHaveBeenCalledWith(
      {error:{code,message:"Local execution realtime is unavailable."}});
    expect(f.local.startNativePolling).not.toHaveBeenCalled();expect(f.authority.authorize).not.toHaveBeenCalled();
    expect(f.raw.writeHead).not.toHaveBeenCalled();
  });
  it("does not send a second body when native transport is already destroyed",async()=>{
    const f=controller();f.raw.destroyed=true;
    f.native.serveProfileStream.mockRejectedValue(new ScopedReplayError("SOURCE_UNAVAILABLE"));
    await f.instance.profileStream(f.request as never,f.response as never,"paper");
    expect(f.response.send).not.toHaveBeenCalled();expect(f.response.status).not.toHaveBeenCalled();
  });
  it("unselected finite user retains the legacy behavior",async()=>{
    const f=controller();f.native.serveProfileSnapshot.mockResolvedValue(false);
    expect(await f.instance.profileSnapshot(f.request as never,"paper",f.response as never)).toEqual({TEST_ONLY:"legacy"});
    expect(f.authority.authorize).toHaveBeenCalledOnce();expect(f.scopes.assertLegacyStream).toHaveBeenCalledOnce();
  });
  it("rejects orphan private realtime budgets without constructing a source",()=>{
    expect(()=>AppModule.register(config,{} as never,undefined,{nativeManagerRealtimeLimits:{maximumClients:1,
      maximumEntriesPerClient:1,maximumFrameBytes:1024,maximumClientBytes:1024,maximumTotalBytes:1024,
      maximumNoticesPerRead:1,readTimeoutMs:1000}})).toThrow("NATIVE_MANAGER_REALTIME_COMPOSITION_REQUIRED");
  });
  it("does not register a dangling coordinator alias when private native composition is absent",()=>{
    const providers=AppModule.register(config,{} as never).providers??[];
    expect(providers.some(provider=>typeof provider==="object"&&provider!==null&&
      "provide" in provider&&provider.provide===NATIVE_MANAGER_REALTIME_COORDINATOR)).toBe(false);
  });
  it("does not translate a native snapshot cursor refusal into an untyped500",async()=>{
    const f=controller();f.native.serveProfileSnapshot.mockRejectedValue(new ScopedReplayError("SOURCE_COVERAGE_UNPROVED"));
    await expect(f.instance.profileSnapshot(f.request as never,"paper",f.response as never)).rejects.toBeInstanceOf(HttpException);
    try{await f.instance.profileSnapshot(f.request as never,"paper",f.response as never);}
    catch(error){expect((error as HttpException).getStatus()).toBe(409);}
  });
});
