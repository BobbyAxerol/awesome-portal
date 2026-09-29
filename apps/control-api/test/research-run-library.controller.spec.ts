import { HEADERS_METADATA } from "@nestjs/common/constants";
import { describe, expect, it, vi } from "vitest";

import { ResearchRunLibraryController } from "../src/research/run-library.controller";

const request = {
  portalUser: { userId: "p12-user" },
  portalWorkspaceId: "p12-workspace",
};

describe("P12 Run Library same-origin boundary", () => {
  it("marks both personalized reads private and non-cacheable", () => {
    for (const method of [ResearchRunLibraryController.prototype.list, ResearchRunLibraryController.prototype.sparkline]) {
      expect(Reflect.getMetadata(HEADERS_METADATA, method)).toContainEqual({
        name: "Cache-Control", value: "private, no-store",
      });
    }
  });

  it("resolves the session workspace once and passes only normalized named input to the service", async () => {
    const service = {
      list: vi.fn().mockResolvedValue({ schema_version: "research.run-library.v1" }),
      sparkline: vi.fn(),
    };
    const workspaces = { isMember: vi.fn().mockResolvedValue(true) };
    const controller = new ResearchRunLibraryController(service as never, workspaces as never);

    await expect(controller.list(request as never, {
      q: "delta", "status[]": ["RUNNING", "FAILED"], limit: "2",
    })).resolves.toEqual({ schema_version: "research.run-library.v1" });

    expect(workspaces.isMember).toHaveBeenCalledWith("p12-workspace", "p12-user");
    expect(service.list).toHaveBeenCalledWith(
      { workspaceId: "p12-workspace", actorUserId: "p12-user" },
      expect.objectContaining({
        workspace_id: "p12-workspace", q: "delta", status: ["FAILED", "RUNNING"], limit: 2,
      }),
    );
    expect(service.list.mock.calls[0][1]).not.toHaveProperty("status[]");
  });

  it("fails before the reader for malformed polling/filter combinations or an unobservable workspace", async () => {
    const service = { list: vi.fn(), sparkline: vi.fn() };
    const workspaces = { isMember: vi.fn().mockResolvedValue(false) };
    const controller = new ResearchRunLibraryController(service as never, workspaces as never);

    await expect(controller.list(request as never, { ids: "run_p12", q: "delta" })).rejects.toMatchObject({
      code: "RESEARCH_RUN_LIBRARY_INVALID", status: 400,
    });
    await expect(controller.list(request as never, { workspace_id: "other-workspace" })).rejects.toMatchObject({
      code: "RESEARCH_RUN_LIBRARY_NOT_FOUND", status: 404,
    });
    expect(service.list).not.toHaveBeenCalled();
  });
});
