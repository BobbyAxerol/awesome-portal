import { describe, expect, it, vi } from "vitest";

import { ResearchCurrentSourceController } from "../src/research/current-source.controller";
import { ResearchCurrentSourceError } from "../src/research/current-source.error";
import { HttpErrorFilter } from "../src/http-error.filter";

const request = {
  portalUser: { userId: "rs02-user" }, portalWorkspaceId: "rs02-workspace", headers: {}, raw: { once: vi.fn(), off: vi.fn() },
};

function reply() {
  return { header: vi.fn(), code: vi.fn().mockReturnThis(), send: vi.fn((body?: unknown) => body ?? { status: 304 }) };
}

describe("RS-02 named same-origin controller boundary", () => {
  it("passes session scope and a named read only; no table/artifact input reaches the service", async () => {
    const service = {
      evidence: vi.fn().mockResolvedValue({ etag: '"rs02_evidence_' + "a".repeat(64) + '"' }),
      evidenceSeries: vi.fn().mockResolvedValue({ etag: '"rs02_evidence-equity_' + "a".repeat(64) + '"' }),
      split: vi.fn(), search: vi.fn(), freeze: vi.fn(), replay: vi.fn(),
    };
    const controller = new ResearchCurrentSourceController(service as never, { isMember: vi.fn().mockResolvedValue(true) } as never);
    const response = reply();
    await controller.evidence(request as never, response as never, "run-rs02", {});
    await controller.evidenceSeries(request as never, reply() as never, "run-rs02", { kind: "EQUITY" });
    expect(service.evidence).toHaveBeenCalledWith(
      { workspaceId: "rs02-workspace", actorUserId: "rs02-user" }, "run-rs02", expect.any(AbortSignal),
    );
    expect(service.evidenceSeries).toHaveBeenCalledWith(
      { workspaceId: "rs02-workspace", actorUserId: "rs02-user" }, "run-rs02", "EQUITY", expect.any(AbortSignal),
    );
    expect(response.header).toHaveBeenCalledWith("etag", expect.stringMatching(/^"rs02_evidence_/));
  });

  it("rejects generic table selectors and hides foreign workspaces before any source reader", async () => {
    const service = { evidence: vi.fn(), evidenceSeries: vi.fn(), split: vi.fn(), search: vi.fn(), freeze: vi.fn(), replay: vi.fn() };
    const controller = new ResearchCurrentSourceController(service as never, { isMember: vi.fn().mockResolvedValue(false) } as never);
    await expect(controller.search(request as never, reply() as never, "run-rs02", { table: "OBSERVATION" }))
      .rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_INVALID", status: 400 });
    await expect(controller.replay(request as never, reply() as never, "run-rs02", { at_ordinal: 0 }))
      .rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_INVALID", status: 400 });
    await expect(controller.evidence(request as never, reply() as never, "run-rs02", { workspace_id: "other" }))
      .rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_NOT_FOUND", status: 404 });
    expect(service.evidence).not.toHaveBeenCalled();
  });

  it("marks only renewable cursor pages private/no-store", async () => {
    const service = {
      evidence: vi.fn(), evidenceSeries: vi.fn(), split: vi.fn(), freeze: vi.fn(),
      search: vi.fn().mockResolvedValue({ ok: "search" }),
      replay: vi.fn().mockResolvedValue({ ok: "replay" }),
    };
    const controller = new ResearchCurrentSourceController(service as never, { isMember: vi.fn().mockResolvedValue(true) } as never);
    const searchReply = reply();
    const replayReply = reply();
    await controller.search(request as never, searchReply as never, "run-rs02", {});
    await controller.replay(request as never, replayReply as never, "run-rs02", {});
    expect(searchReply.header).toHaveBeenCalledWith("cache-control", "private, no-store");
    expect(replayReply.header).toHaveBeenCalledWith("cache-control", "private, no-store");
  });

  it("preserves RS-02 typed errors through the shared HTTP filter", () => {
    const response = { status: vi.fn(), send: vi.fn() };
    response.status.mockReturnValue(response);
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ headers: { "x-request-id": "req-rs02" } }),
      }),
    };
    new HttpErrorFilter().catch(
      new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_CURSOR_EXPIRED", "Current-source cursor expired.", 409),
      host as never,
    );
    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.send).toHaveBeenCalledWith({
      error: { code: "RESEARCH_CURRENT_SOURCE_CURSOR_EXPIRED", message: "Current-source cursor expired." },
      request_id: "req-rs02",
    });
  });
});
