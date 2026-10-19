import { describe, expect, it, vi } from "vitest";
import { ExecutionRealtimeController } from "../src/execution/realtime.controller";
import type { NativeManagerReadConsumer } from "../src/execution-v2/native-manager-consumer";
import { MaximumDataOperationError } from "../src/execution/maximum-data-operation.service";
import { ExecutionReadScopeError } from "../src/execution-v2/read-scope";
import { ScopedReplayError } from "../src/execution-v2/scoped-replay-cursor";

describe("ELP2-04 uncommissioned scoped streams", () => {
  function fixture(retained = false, native?: NativeManagerReadConsumer) {
    const proxy = { open: vi.fn(), snapshot: vi.fn() };
    const local = { subscribe: vi.fn(), snapshot: vi.fn(), startNativePolling:vi.fn() };
    const scopes = { assertLegacyStream: vi.fn().mockRejectedValue(new ExecutionReadScopeError("EXECUTION_SCOPED_STREAM_NOT_COMMISSIONED", 503)) };
    const authority = { authorize: vi.fn().mockResolvedValue({workspaceId:"ws"}) };
    const config = { EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID:"ws", EXECUTION_EDGE_PAPER_PROFILE_ID:"TEST_ONLY-paper",
      EXECUTION_READ_PROFILE: retained ? "retained_review_v1" : "live",
      FEATURE_EXECUTION_LOCAL_PROJECTION:"true",FEATURE_EXECUTION_CURRENT_SOURCE_PAPER:"true" };
    const request = { portalWorkspaceId:"ws", portalUser:{userId:"TEST_ONLY-u"}, portalSession:{sessionId:"TEST_ONLY-s"}, headers:{} };
    const reply = { raw:{headersSent:false,writeHead:vi.fn(),end:vi.fn()},hijack:vi.fn(),
      status:vi.fn(),send:vi.fn(),code:vi.fn(),header:vi.fn() };
    reply.status.mockReturnValue(reply); reply.code.mockReturnValue(reply); reply.header.mockReturnValue(reply);
    const controller = new ExecutionRealtimeController(proxy as never, {} as never, local as never, {} as never,
      {} as never, config as never, authority as never, scopes as never,native);
    return {controller,proxy,local,scopes,request,reply};
  }
  it.each(["profile", "command"])("refuses %s stream before headers or source subscription", async lane => {
    const f=fixture();
    if(lane==="profile") await f.controller.profileStream(f.request as never,f.reply as never,"paper");
    else await f.controller.commandCenter(f.request as never,f.reply as never);
    expect(f.reply.status).toHaveBeenCalledWith(503);
    expect(f.reply.send).toHaveBeenCalledWith(expect.objectContaining({error:expect.objectContaining({code:"EXECUTION_SCOPED_STREAM_NOT_COMMISSIONED"})}));
    expect(f.reply.hijack).not.toHaveBeenCalled(); expect(f.proxy.open).not.toHaveBeenCalled(); expect(f.local.subscribe).not.toHaveBeenCalled();
  });
  it.each(["profile", "command"])("refuses %s raw bootstrap without calling unscoped reader", async lane => {
    const f=fixture();
    const read=lane==="profile" ? f.controller.profileSnapshot(f.request as never,"paper",f.reply as never)
      : f.controller.commandCenterSnapshot(f.request as never,f.reply as never);
    await expect(read).rejects.toThrow();
    expect(f.proxy.snapshot).not.toHaveBeenCalled(); expect(f.local.snapshot).not.toHaveBeenCalled();
  });
  it("retained bootstrap stays deliberate 204 without activating scope transport", async () => {
    const f=fixture(true);
    await f.controller.profileSnapshot(f.request as never,"paper",f.reply as never);
    expect(f.reply.code).toHaveBeenCalledWith(204);
    expect(f.scopes.assertLegacyStream).not.toHaveBeenCalled(); expect(f.local.snapshot).not.toHaveBeenCalled();
  });
  // TEST_ONLY routing mocks below do not qualify actual source/Core/transport.
  function nativeFixture(retained=false){
    const native={serveProfileSnapshot:vi.fn().mockResolvedValue(true),serveProfileStream:vi.fn().mockResolvedValue(true)};
    const f=fixture(retained,native as unknown as NativeManagerReadConsumer);return{...f,native};
  }
  it("native finite bootstrap preserves the actual viewer/workspace and never probes legacy",async()=>{
    const f=nativeFixture();
    await f.controller.profileSnapshot(f.request as never,"paper",f.reply as never);
    expect(f.native.serveProfileSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId:"ws",viewerWorkspaceId:"ws",user:f.request.portalUser,session:f.request.portalSession}),
      "paper","TEST_ONLY-paper",f.local,f.reply);
    expect(f.scopes.assertLegacyStream).not.toHaveBeenCalled();expect(f.local.snapshot).not.toHaveBeenCalled();
  });
  it("native SSE honors delivered Last-Event-ID and starts only the SAME coordinator cadence",async()=>{
    const f=nativeFixture();f.request.headers={"last-event-id":"TEST_ONLY-delivered"} as never;
    await f.controller.profileStream(f.request as never,f.reply as never,"paper","TEST_ONLY-old-url");
    expect(f.native.serveProfileStream).toHaveBeenCalledWith(expect.anything(),"paper","TEST_ONLY-paper",
      "TEST_ONLY-delivered",f.reply);
    expect(f.local.startNativePolling).toHaveBeenCalledOnce();expect(f.local.subscribe).not.toHaveBeenCalled();
    expect(f.scopes.assertLegacyStream).not.toHaveBeenCalled();expect(f.reply.hijack).not.toHaveBeenCalled();
  });
  it("selected native refusal cannot cause an ordinary snapshot or stream writer",async()=>{
    const f=nativeFixture(),denied=new MaximumDataOperationError("NATIVE_MANAGER_READ_DENIED",403);
    f.native.serveProfileSnapshot.mockRejectedValue(denied);f.native.serveProfileStream.mockRejectedValue(denied);
    await expect(f.controller.profileSnapshot(f.request as never,"paper",f.reply as never)).rejects.toBe(denied);
    await f.controller.profileStream(f.request as never,f.reply as never,"paper","TEST_ONLY-token");
    expect(f.reply.status).toHaveBeenCalledWith(403);
    expect(f.reply.send).toHaveBeenCalledWith({error:{code:"NATIVE_MANAGER_READ_DENIED",message:"Local execution realtime is unavailable."}});
    expect(f.scopes.assertLegacyStream).not.toHaveBeenCalled();expect(f.local.snapshot).not.toHaveBeenCalled();
    expect(f.local.subscribe).not.toHaveBeenCalled();expect(f.local.startNativePolling).not.toHaveBeenCalled();
  });
  it("retained review stays204 without invoking even a configured native consumer",async()=>{
    const f=nativeFixture(true);await f.controller.profileSnapshot(f.request as never,"paper",f.reply as never);
    expect(f.reply.code).toHaveBeenCalledWith(204);expect(f.native.serveProfileSnapshot).not.toHaveBeenCalled();
    expect(f.local.startNativePolling).not.toHaveBeenCalled();
  });
  it("only actual nonselected return false keeps the original scoped-stream refusal",async()=>{
    const f=nativeFixture();f.native.serveProfileStream.mockResolvedValue(false);
    await f.controller.profileStream(f.request as never,f.reply as never,"paper","TEST_ONLY-token");
    expect(f.scopes.assertLegacyStream).toHaveBeenCalledOnce();
    expect(f.reply.status).toHaveBeenCalledWith(503);expect(f.local.subscribe).not.toHaveBeenCalled();
    expect(f.local.startNativePolling).not.toHaveBeenCalled();
  });

  it("bounded native preparation returns existing typed429 without legacy writer or polling",async()=>{
    const f=nativeFixture();
    f.native.serveProfileStream.mockRejectedValue(new ScopedReplayError("RECONNECT_LIMIT"));
    await f.controller.profileStream(f.request as never,f.reply as never,"paper","TEST_ONLY-token");
    expect(f.reply.status).toHaveBeenCalledWith(429);
    expect(f.reply.send).toHaveBeenCalledWith({error:{
      code:"RECONNECT_LIMIT",message:"Local execution realtime is unavailable."}});
    expect(f.proxy.open).not.toHaveBeenCalled();expect(f.local.subscribe).not.toHaveBeenCalled();
    expect(f.scopes.assertLegacyStream).not.toHaveBeenCalled();
    expect(f.local.startNativePolling).not.toHaveBeenCalled();expect(f.reply.hijack).not.toHaveBeenCalled();
  });

});
