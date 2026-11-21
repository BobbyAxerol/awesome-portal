import { describe, expect, it, vi } from "vitest";

import { ResearchEvidenceController } from "../src/research/evidence.controller";

const request = {
  portalUser: { userId: "p13-user" },
  portalWorkspaceId: "p13-workspace",
  headers: {},
  raw: { once: vi.fn(), off: vi.fn() },
};

function reply() {
  const value = {
    header: vi.fn(),
    code: vi.fn().mockReturnThis(),
    send: vi.fn((body?: unknown) => body ?? { status: 304 }),
  };
  return value;
}

describe("P13 Evidence Flow same-origin boundary", () => {
  it("passes only the session-resolved scope and named series kind to the reader", async () => {
    const service = {
      hub: vi.fn().mockResolvedValue({ etag: `W/"p13h1_${"a".repeat(64)}"` }),
      series: vi.fn().mockResolvedValue({ etag: null }),
    };
    const workspaces = { isMember: vi.fn().mockResolvedValue(true) };
    const controller = new ResearchEvidenceController(service as never, workspaces as never);
    const hubReply = reply();
    await controller.hub(request as never, hubReply as never, "run_p13", {});
    expect(service.hub).toHaveBeenCalledWith(
      { workspaceId: "p13-workspace", actorUserId: "p13-user" }, "run_p13", expect.any(AbortSignal), request.portalUser,
    );
    expect(hubReply.header).toHaveBeenCalledWith("etag", `W/"p13h1_${"a".repeat(64)}"`);

    await controller.series(request as never, reply() as never, "run_p13", { kind: "EQUITY_OOS" });
    expect(service.series).toHaveBeenCalledWith(
      { workspaceId: "p13-workspace", actorUserId: "p13-user" }, "run_p13", "EQUITY_OOS", expect.any(AbortSignal),
    );
  });

  it("rejects malformed named reads and hides unobservable workspaces before the service", async () => {
    const service = { hub: vi.fn(), series: vi.fn() };
    const workspaces = { isMember: vi.fn().mockResolvedValue(false) };
    const controller = new ResearchEvidenceController(service as never, workspaces as never);
    await expect(controller.series(request as never, reply() as never, "run_p13", {})).rejects.toMatchObject({
      code: "RESEARCH_EVIDENCE_INVALID", status: 400,
    });
    await expect(controller.hub(request as never, reply() as never, "run_p13", { workspace_id: "other-workspace" })).rejects.toMatchObject({
      code: "RESEARCH_EVIDENCE_NOT_FOUND", status: 404,
    });
    expect(service.hub).not.toHaveBeenCalled();
  });
});
