import { describe, expect, it, vi } from "vitest";

import { ResearchSplitController } from "../src/research/split.controller";

function reply() {
  const value = { header: vi.fn(), code: vi.fn(), send: vi.fn() };
  value.code.mockReturnValue(value);
  return value;
}

describe("P14 Split controller", () => {
  it("keeps the route workspace-scoped and honors immutable ETag", async () => {
    const service = { detail: vi.fn().mockResolvedValue({ etag: "\"p14r1_" + "a".repeat(64) + "\"" }) };
    const workspaces = { isMember: vi.fn().mockResolvedValue(true) };
    const controller = new ResearchSplitController(service as never, workspaces as never);
    const response = reply();
    await controller.detail({ portalUser: { userId: "user" }, portalWorkspaceId: "workspace", headers: { "if-none-match": "\"p14r1_" + "a".repeat(64) + "\"" }, raw: { once: vi.fn(), off: vi.fn() } } as never, response as never, "run_p14", {});
    expect(service.detail).toHaveBeenCalledWith({ workspaceId: "workspace", actorUserId: "user" }, "run_p14", expect.any(AbortSignal));
    expect(response.code).toHaveBeenCalledWith(304);
  });

  it("does not disclose a cross-workspace run", async () => {
    const controller = new ResearchSplitController({ detail: vi.fn() } as never, { isMember: vi.fn().mockResolvedValue(false) } as never);
    await expect(controller.detail({ portalUser: { userId: "user" }, portalWorkspaceId: "workspace", headers: {}, raw: { once: vi.fn(), off: vi.fn() } } as never, reply() as never, "run_p14", { workspace_id: "other" })).rejects.toMatchObject({ code: "RESEARCH_SPLIT_NOT_FOUND", status: 404 });
  });
});
