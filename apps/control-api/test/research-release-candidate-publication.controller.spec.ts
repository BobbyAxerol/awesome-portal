import { describe, expect, it, vi } from "vitest";
import { ResearchAlphaVersionPublicationController } from "../src/research/alpha-version-publication.controller";
import { ResearchReleaseCandidatePublicationController } from "../src/research/release-candidate-publication.controller";

const rcId = `rc_${"0".repeat(26)}`;
const user = { userId: "usr_p22", username: "researcher" };
const request = {
  portalUser: user, portalWorkspaceId: "ws_p22", portalSession: { csrfSecretHash: "unused" },
  headers: {}, id: "req_p22",
};
const input = {
  schema_version: "research.release-candidate-publish-request.v1",
  expected_pack_digest: "a".repeat(64), request_key: "p22:1",
  methodology_claim_id: "claim:oos", summary: "A reviewed publication request.",
};
const reply = () => ({ header: vi.fn(), send: vi.fn((body: unknown) => body) });

describe("P22 same-origin publication controller", () => {
  it("P22-T07 scopes mirror read to a workspace member and disables caching", async () => {
    const service = { publication: vi.fn().mockResolvedValue({ state: "NOT_PUBLISHED" }), publish: vi.fn() };
    const workspaces = { isMember: vi.fn().mockResolvedValue(true) };
    const controller = new ResearchReleaseCandidatePublicationController(service as never, workspaces as never, {} as never);
    const response = reply();
    await expect(controller.publication(request as never, response as never, rcId, {})).resolves.toEqual({ state: "NOT_PUBLISHED" });
    expect(response.header).toHaveBeenCalledWith("cache-control", "private, no-store");
    expect(service.publication).toHaveBeenCalledWith({ workspaceId: "ws_p22", actorUserId: user.userId }, user, rcId);
  });

  it("P22-T02/T07 refuses extra payload and an expired/absent CSRF token before publication", async () => {
    const service = { publication: vi.fn(), publish: vi.fn() };
    const controller = new ResearchReleaseCandidatePublicationController(service as never, { isMember: vi.fn().mockResolvedValue(true) } as never, { PORTAL_PUBLIC_ORIGIN: "https://research.example" } as never);
    await expect(controller.publish(request as never, rcId, {}, input)).rejects.toMatchObject({ status: 403 });
    await expect(controller.publish(request as never, rcId, {}, { ...input, approval_decision: "APPROVED" })).rejects.toMatchObject({ status: 403 });
    expect(service.publish).not.toHaveBeenCalled();
  });

  it("P22-T03 rejects malformed IDs and cross-workspace mirror reads", async () => {
    const service = { publication: vi.fn(), publish: vi.fn() };
    const controller = new ResearchReleaseCandidatePublicationController(service as never, { isMember: vi.fn().mockResolvedValue(false) } as never, {} as never);
    await expect(controller.publication(request as never, reply() as never, "wrong/id", {})).rejects.toMatchObject({ status: 400 });
    await expect(controller.publication(request as never, reply() as never, rcId, { workspace_id: "foreign" })).rejects.toMatchObject({ status: 404 });
    expect(service.publication).not.toHaveBeenCalled();
  });

  it("OL-13 publishes one member-scoped alpha-version lookup and typed absence", async () => {
    const service = { alphaVersionPublication: vi.fn().mockResolvedValue({ availability: "NOT_PUBLISHED" }) };
    const workspaces = { isMember: vi.fn().mockResolvedValue(true) };
    const controller = new ResearchAlphaVersionPublicationController(service as never, workspaces as never);
    const response = reply();
    await expect(controller.publication(request as never, response as never, "av_p22", {}))
      .resolves.toEqual({ availability: "NOT_PUBLISHED" });
    expect(response.header).toHaveBeenCalledWith("cache-control", "private, no-store");
    expect(service.alphaVersionPublication).toHaveBeenCalledWith(
      { workspaceId: "ws_p22", actorUserId: user.userId }, user, "av_p22",
    );
    await expect(controller.publication(request as never, reply() as never, "bad/id", {}))
      .rejects.toMatchObject({ status: 400 });
  });
});
