import { describe, expect, it, vi } from "vitest";

import { ResearchSearchController } from "../src/research/search.controller";

function reply() {
  const value = { header: vi.fn(), code: vi.fn(), send: vi.fn() };
  value.code.mockReturnValue(value);
  return value;
}

describe("P15 Search controller", () => {
  it("keeps the reader workspace-scoped, passes the bounded fold, and honors immutable ETag", async () => {
    const etag = "\"p15r1_" + "a".repeat(64) + "\"";
    const service = { detail: vi.fn().mockResolvedValue({ etag }) };
    const workspaces = { isMember: vi.fn().mockResolvedValue(true) };
    const controller = new ResearchSearchController(service as never, workspaces as never);
    const response = reply();

    await controller.detail({
      portalUser: { userId: "user" }, portalWorkspaceId: "workspace", headers: { "if-none-match": etag },
    } as never, response as never, "run_p15", { fold: "2" });

    expect(service.detail).toHaveBeenCalledWith(
      { workspaceId: "workspace", actorUserId: "user" }, "run_p15", { fold: 2 },
    );
    expect(response.header).toHaveBeenCalledWith("etag", etag);
    expect(response.code).toHaveBeenCalledWith(304);
  });

  it("does not disclose a cross-workspace run or accept an unbounded fold", async () => {
    const controller = new ResearchSearchController(
      { detail: vi.fn() } as never,
      { isMember: vi.fn().mockResolvedValue(false) } as never,
    );
    await expect(controller.detail({
      portalUser: { userId: "user" }, portalWorkspaceId: "workspace", headers: {},
    } as never, reply() as never, "run_p15", { workspace_id: "other" })).rejects.toMatchObject({
      code: "RESEARCH_SEARCH_NOT_FOUND", status: 404,
    });
    await expect(controller.detail({
      portalUser: { userId: "user" }, portalWorkspaceId: "workspace", headers: {},
    } as never, reply() as never, "run_p15", { fold: "257" })).rejects.toMatchObject({
      code: "RESEARCH_SEARCH_INVALID", status: 400,
    });
  });
});
