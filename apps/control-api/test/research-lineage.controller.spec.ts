import { describe, expect, it, vi } from "vitest";

import { ResearchLineageController } from "../src/research/lineage.controller";

const request = {
  portalUser: { userId: "usr-p19" },
  portalWorkspaceId: "ws-p19",
};

describe("P19 Attempt Lineage same-origin boundary", () => {
  it("normalizes only the named alpha/workspace/limit inputs before the service", async () => {
    const service = { read: vi.fn().mockResolvedValue({ schema_version: "research.attempt-lineage.v1" }) };
    const workspaces = { isMember: vi.fn().mockResolvedValue(true) };
    const controller = new ResearchLineageController(service as never, workspaces as never);

    await expect(controller.read(request as never, "alpha-p19", { limit: "24" })).resolves.toEqual({
      schema_version: "research.attempt-lineage.v1",
    });
    expect(workspaces.isMember).toHaveBeenCalledWith("ws-p19", "usr-p19");
    expect(service.read).toHaveBeenCalledWith(
      { workspaceId: "ws-p19", actorUserId: "usr-p19" },
      "alpha-p19",
      { workspace_id: "ws-p19", limit: 24 },
    );
  });

  it("rejects malformed alpha/query and hides an unobservable workspace before a lineage lookup", async () => {
    const service = { read: vi.fn() };
    const workspaces = { isMember: vi.fn().mockResolvedValue(false) };
    const controller = new ResearchLineageController(service as never, workspaces as never);
    await expect(controller.read(request as never, "A", {})).rejects.toMatchObject({
      code: "RESEARCH_LINEAGE_INVALID", status: 400,
    });
    await expect(controller.read(request as never, "alpha-p19", { workspace_id: "other" })).rejects.toMatchObject({
      code: "RESEARCH_LINEAGE_NOT_FOUND", status: 404,
    });
    expect(service.read).not.toHaveBeenCalled();
  });
});
