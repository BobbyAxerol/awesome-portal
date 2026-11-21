import { describe, expect, it, vi } from "vitest";

import { HttpErrorFilter } from "../src/http-error.filter";
import { ResearchCompareController } from "../src/research/compare.controller";
import { ResearchCompareError } from "../src/research/compare.error";

function reply() {
  const value = { header: vi.fn(), code: vi.fn(), send: vi.fn((body?: unknown) => body ?? { status: 304 }) };
  value.code.mockReturnValue(value);
  return value;
}

const request = {
  portalUser: { userId: "usr-p20" },
  portalWorkspaceId: "ws-p20",
  headers: {},
};

describe("P20 Compare same-origin boundary", () => {
  it("normalizes only a named alpha/mode/pair and makes the browser response private", async () => {
    const service = { detail: vi.fn().mockResolvedValue({ etag: `\"p20r1_${"a".repeat(64)}\"` }) };
    const workspaces = { isMember: vi.fn().mockResolvedValue(true) };
    const controller = new ResearchCompareController(service as never, workspaces as never);
    const response = reply();

    await expect(controller.detail(request as never, response as never, "alpha-p20", {
      mode: "pair", runs: "run-left,run-right",
    })).resolves.toEqual({ etag: `\"p20r1_${"a".repeat(64)}\"` });

    expect(workspaces.isMember).toHaveBeenCalledWith("ws-p20", "usr-p20");
    expect(service.detail).toHaveBeenCalledWith(
      { workspaceId: "ws-p20", actorUserId: "usr-p20" },
      "alpha-p20",
      { workspace_id: "ws-p20", mode: "pair", run_ids: ["run-left", "run-right"] },
    );
    expect(response.header).toHaveBeenCalledWith("cache-control", "private, no-store");
  });

  it("rejects generic/cross-workspace or malformed pair input before a Compare read", async () => {
    const service = { detail: vi.fn() };
    const controller = new ResearchCompareController(
      service as never,
      { isMember: vi.fn().mockResolvedValue(false) } as never,
    );

    await expect(controller.detail(request as never, reply() as never, "alpha-p20", {
      mode: "attempts", runs: "run-left,run-right",
    })).rejects.toMatchObject({ code: "RESEARCH_COMPARE_INVALID", status: 400 });
    await expect(controller.detail(request as never, reply() as never, "alpha-p20", {
      workspace_id: "foreign-workspace",
    })).rejects.toMatchObject({ code: "RESEARCH_COMPARE_NOT_FOUND", status: 404 });
    expect(service.detail).not.toHaveBeenCalled();
  });

  it("preserves a typed Compare failure through the shared HTTP boundary", () => {
    const response = { status: vi.fn(), send: vi.fn() };
    response.status.mockReturnValue(response);
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ headers: { "x-request-id": "p20-request" } }),
      }),
    };
    new HttpErrorFilter().catch(
      new ResearchCompareError("RESEARCH_COMPARE_UNAVAILABLE", "Compare is unavailable.", 503),
      host as never,
    );
    expect(response.send).toHaveBeenCalledWith({
      error: { code: "RESEARCH_COMPARE_UNAVAILABLE", message: "Compare is unavailable." },
      request_id: "p20-request",
    });
  });
});
