import { describe, expect, it, vi } from "vitest";
import { ExecutionRealtimeController } from "../src/execution/realtime.controller";
import { ExecutionReadScopeError } from "../src/execution-v2/read-scope";

describe("ELP2-04 uncommissioned scoped streams", () => {
  function fixture(retained = false) {
    const proxy = { open: vi.fn(), snapshot: vi.fn() };
    const local = { subscribe: vi.fn(), snapshot: vi.fn() };
    const scopes = { assertLegacyStream: vi.fn().mockRejectedValue(new ExecutionReadScopeError("EXECUTION_SCOPED_STREAM_NOT_COMMISSIONED", 503)) };
    const authority = { authorize: vi.fn().mockResolvedValue({workspaceId:"ws"}) };
    const config = { EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID:"ws", EXECUTION_EDGE_PAPER_PROFILE_ID:"TEST_ONLY-paper",
      EXECUTION_READ_PROFILE: retained ? "retained_review_v1" : "live" };
    const request = { portalWorkspaceId:"ws", portalUser:{userId:"TEST_ONLY-u"}, portalSession:{sessionId:"TEST_ONLY-s"}, headers:{} };
    const reply = { raw:{headersSent:false,writeHead:vi.fn(),end:vi.fn()},hijack:vi.fn(),
      status:vi.fn(),send:vi.fn(),code:vi.fn(),header:vi.fn() };
    reply.status.mockReturnValue(reply); reply.code.mockReturnValue(reply); reply.header.mockReturnValue(reply);
    const controller = new ExecutionRealtimeController(proxy as never, {} as never, local as never, {} as never,
      {} as never, config as never, authority as never, scopes as never);
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
});
