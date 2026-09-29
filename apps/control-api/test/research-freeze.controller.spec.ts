import { describe, expect, it, vi } from "vitest";

import { sha256 } from "../src/auth/argon";
import { CSRF_COOKIE, CSRF_HEADER } from "../src/auth/cookies";
import { ResearchFreezeController } from "../src/research/freeze.controller";

function reply() {
  const value = { header: vi.fn(), code: vi.fn(), send: vi.fn() };
  value.code.mockReturnValue(value);
  return value;
}

describe("P16 Freeze controller", () => {
  it("keeps the reader workspace-scoped, carries the bounded fold, and honors immutable ETag", async () => {
    const etag = "\"p16r1_" + "a".repeat(64) + "\"";
    const service = { detail: vi.fn().mockResolvedValue({ etag }), verify: vi.fn() };
    const workspaces = { isMember: vi.fn().mockResolvedValue(true) };
    const controller = new ResearchFreezeController(service as never, workspaces as never, {} as never);
    const response = reply();

    await controller.detail({
      portalUser: { userId: "user" }, portalWorkspaceId: "workspace", headers: { "if-none-match": `W/${etag}` },
    } as never, response as never, "run_p16", { fold: "2" });

    expect(service.detail).toHaveBeenCalledWith(
      { workspaceId: "workspace", actorUserId: "user" }, "run_p16", { fold: 2 },
    );
    expect(response.header).toHaveBeenCalledWith("etag", etag);
    expect(response.header).toHaveBeenCalledWith("cache-control", "private, no-cache");
    expect(response.code).toHaveBeenCalledWith(304);
    expect(response.send).toHaveBeenCalledWith();

    const fresh = reply();
    await controller.detail({
      portalUser: { userId: "user" }, portalWorkspaceId: "workspace", headers: {},
    } as never, fresh as never, "run_p16", { fold: "2" });
    expect(fresh.header).toHaveBeenCalledWith("cache-control", "private, no-cache");
    expect(fresh.send).toHaveBeenCalledWith({ etag });
  });

  it("keeps explicit re-verification same-origin/CSRF protected although it writes no receipt", async () => {
    const csrf = "p16-csrf";
    const verification = { schema_version: "research.freeze-verification.v1", result: "PARTIAL_MATCH" };
    const service = { detail: vi.fn(), verify: vi.fn().mockResolvedValue(verification) };
    const workspaces = { isMember: vi.fn().mockResolvedValue(true) };
    const controller = new ResearchFreezeController(service as never, workspaces as never, {
      PORTAL_PUBLIC_ORIGIN: "https://portal.example.test",
    } as never);
    const request = {
      portalUser: { userId: "user" },
      portalWorkspaceId: "workspace",
      portalSession: { csrfSecretHash: sha256(csrf) },
      cookies: { [CSRF_COOKIE]: csrf },
      headers: { origin: "https://portal.example.test", [CSRF_HEADER]: csrf },
    };

    await expect(controller.verify(request as never, "run_p16", { workspace_id: "workspace" })).resolves.toEqual(verification);
    expect(service.verify).toHaveBeenCalledWith(
      { workspaceId: "workspace", actorUserId: "user" }, "run_p16", {},
    );

    await expect(controller.verify({
      ...request,
      headers: { origin: "https://attacker.example.test", [CSRF_HEADER]: csrf },
    } as never, "run_p16", {})).rejects.toMatchObject({ code: "RESEARCH_FREEZE_FORBIDDEN", status: 403 });
    expect(service.verify).toHaveBeenCalledTimes(1);
  });

  it("does not disclose a cross-workspace run or accept unbounded query input", async () => {
    const controller = new ResearchFreezeController(
      { detail: vi.fn(), verify: vi.fn() } as never,
      { isMember: vi.fn().mockResolvedValue(false) } as never,
      {} as never,
    );
    await expect(controller.detail({
      portalUser: { userId: "user" }, portalWorkspaceId: "workspace", headers: {},
    } as never, reply() as never, "run_p16", { workspace_id: "other" })).rejects.toMatchObject({
      code: "RESEARCH_FREEZE_NOT_FOUND", status: 404,
    });
    await expect(controller.detail({
      portalUser: { userId: "user" }, portalWorkspaceId: "workspace", headers: {},
    } as never, reply() as never, "run_p16", { fold: "257" })).rejects.toMatchObject({
      code: "RESEARCH_FREEZE_INVALID", status: 400,
    });
  });
});
