import { describe, expect, it, vi } from "vitest";

import { ResearchReplayController } from "../src/research/replay.controller";

function reply() {
  const value = { header: vi.fn(), code: vi.fn(), send: vi.fn() };
  value.code.mockReturnValue(value);
  return value;
}

describe("P17 Replay controller", () => {
  it("keeps replay same-origin/session-scoped, forwards only bounded typed navigation and never HTTP-caches cursors", async () => {
    const etag = `"p17r1_${"a".repeat(64)}"`;
    const service = { detail: vi.fn().mockResolvedValue({ etag }) };
    const workspaces = { isMember: vi.fn().mockResolvedValue(true) };
    const controller = new ResearchReplayController(service as never, workspaces as never);
    const response = reply();
    await controller.detail({
      portalUser: { userId: "user" }, portalWorkspaceId: "workspace", headers: { "if-none-match": etag },
      raw: { once: vi.fn(), off: vi.fn() },
    } as never, response as never, "run_p17", { limit: "20" });
    expect(service.detail).toHaveBeenCalledWith(
      { workspaceId: "workspace", actorUserId: "user" }, "run_p17", { limit: 20 }, expect.any(AbortSignal),
    );
    expect(response.header).toHaveBeenCalledWith("cache-control", "private, no-store");
    expect(response.code).not.toHaveBeenCalled();
  });

  it("does not disclose cross-workspace runs or accept browser-selected route/source authority", async () => {
    const controller = new ResearchReplayController(
      { detail: vi.fn() } as never,
      { isMember: vi.fn().mockResolvedValue(false) } as never,
    );
    await expect(controller.detail({
      portalUser: { userId: "user" }, portalWorkspaceId: "workspace", headers: {}, raw: { once: vi.fn(), off: vi.fn() },
    } as never, reply() as never, "run_p17", { workspace_id: "other" })).rejects.toMatchObject({
      code: "RESEARCH_REPLAY_NOT_FOUND", status: 404,
    });
    await expect(controller.detail({
      portalUser: { userId: "user" }, portalWorkspaceId: "workspace", headers: {}, raw: { once: vi.fn(), off: vi.fn() },
    } as never, reply() as never, "run_p17", { route: "reactive" })).rejects.toMatchObject({
      code: "RESEARCH_REPLAY_INVALID", status: 400,
    });
  });
});
