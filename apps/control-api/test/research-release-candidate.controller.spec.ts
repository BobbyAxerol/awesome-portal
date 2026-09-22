import { describe, expect, it, vi } from "vitest";

import { HttpErrorFilter } from "../src/http-error.filter";
import { ResearchReleaseCandidateController } from "../src/research/release-candidate.controller";
import { ResearchReleaseCandidateError } from "../src/research/release-candidate.error";

const request = {
  portalUser: { userId: "usr-p21" }, portalWorkspaceId: "ws-p21",
  portalSession: { csrfSecretHash: "unused" }, headers: {},
};
const runId = "run-p21";
const rcId = `rc_${"0".repeat(26)}`;

function reply() {
  const value = { header: vi.fn(), send: vi.fn((body: unknown) => body) };
  return value;
}

describe("P21 same-origin controller boundary", () => {
  it("reads only a named run/RC under the active workspace and returns private no-store responses", async () => {
    const service = { detail: vi.fn().mockResolvedValue({ source_fingerprint: "a".repeat(64) }), pack: vi.fn().mockResolvedValue({ pack_digest: "b".repeat(64) }) };
    const controller = new ResearchReleaseCandidateController(service as never, { isMember: vi.fn().mockResolvedValue(true) } as never, {} as never);
    const response = reply();

    await expect(controller.detail(request as never, response as never, runId, {})).resolves.toEqual({ source_fingerprint: "a".repeat(64) });
    await expect(controller.pack(request as never, response as never, rcId, {})).resolves.toEqual({ pack_digest: "b".repeat(64) });
    expect(service.detail).toHaveBeenCalledWith({ workspaceId: "ws-p21", actorUserId: "usr-p21" }, runId);
    expect(response.header).toHaveBeenCalledWith("cache-control", "private, no-store");
  });

  it("rejects malformed/cross-workspace IDs before any P21 source read", async () => {
    const service = { detail: vi.fn(), pack: vi.fn() };
    const controller = new ResearchReleaseCandidateController(service as never, { isMember: vi.fn().mockResolvedValue(false) } as never, {} as never);
    await expect(controller.detail(request as never, reply() as never, "bad/slash", {})).rejects.toMatchObject({ code: "RESEARCH_RELEASE_CANDIDATE_INVALID", status: 400 });
    await expect(controller.pack(request as never, reply() as never, rcId, { workspace_id: "foreign" })).rejects.toMatchObject({ code: "RESEARCH_RELEASE_CANDIDATE_NOT_FOUND", status: 404 });
    expect(service.detail).not.toHaveBeenCalled();
    expect(service.pack).not.toHaveBeenCalled();
  });

  it("preserves typed P21 errors at the shared HTTP boundary", () => {
    const response = { status: vi.fn(), send: vi.fn() };
    response.status.mockReturnValue(response);
    const host = { switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({ headers: { "x-request-id": "p21-request" } }) }) };
    new HttpErrorFilter().catch(new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE", "Release Candidate is unavailable.", 503), host as never);
    expect(response.send).toHaveBeenCalledWith({ error: { code: "RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE", message: "Release Candidate is unavailable." }, request_id: "p21-request" });
  });
});
