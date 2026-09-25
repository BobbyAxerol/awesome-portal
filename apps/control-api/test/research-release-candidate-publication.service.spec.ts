import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GovernanceError } from "../src/governance/governance.service";
import { canonicalResearchJson } from "../src/research/preflight.service";
import { ResearchReleaseCandidatePublicationService } from "../src/research/release-candidate-publication.service";
import type { PublicationIntent } from "../src/research/release-candidate-publication.repository";

const scope = { workspaceId: "ws_p22", actorUserId: "usr_p22" };
const user = { userId: "usr_p22", username: "researcher" };
const rcId = "rc_" + "1".repeat(26);
const sourceFingerprint = "a".repeat(64);
const legacySha = "sha256:" + "b".repeat(64);
const evidenceHash = "sha256:" + "c".repeat(64);
const claimId = "claim:oos";
const frozen = {
  fields: [
    { key: "alpha_id", value: "alpha_p22", availability: { state: "AVAILABLE" } },
    { key: "alpha_version_id", value: "av_p22", availability: { state: "AVAILABLE" } },
    { key: "final_audit_run_id", value: "run_p22", availability: { state: "AVAILABLE" } },
  ],
  pack: [], source_fingerprint: sourceFingerprint,
  draft: { known_limitations: "Known limitation.", proposed_use_restrictions: "Research only." },
};
const digest = (value: unknown) => createHash("sha256").update(canonicalResearchJson(value), "utf8").digest("hex");
const packDigest = digest(frozen);
const input = {
  schema_version: "research.release-candidate-publish-request.v1" as const,
  expected_pack_digest: packDigest, request_key: "p22:request:1",
  methodology_claim_id: claimId,
  summary: "Publish the final audit through the existing R1 request.",
};
const source = {
  run_id: "run_p22", alpha_id: "alpha_p22", status: "COMPLETED",
  artifact_sha256: legacySha, artifact_schema_version: "quantbt.selected-params.v1",
  methodology_claim_ids: [claimId], captured_at: "2026-09-25T10:00:00.000Z",
};
const approval = {
  approval_id: "apr_p22", gate: "R1", status: "PENDING",
  subject_id: "alpha_p22", requester: { user_id: "usr_p22", username: "researcher" },
  evidence_set_hash: evidenceHash,
  sla_due_at: "2026-09-26T10:00:00.000Z",
  expires_at: "2026-09-28T10:00:00.000Z",
  created_at: "2026-09-25T10:00:00.000Z",
};
function subject() {
  let state: PublicationIntent | null = null;
  const repository = {
    read: vi.fn(async () => state),
    begin: vi.fn(async (_scope: unknown, value: Record<string, unknown>) => {
      state = {
        releaseCandidateId: rcId, runId: "run_p22", alphaId: "alpha_p22",
        alphaVersionId: "av_p22", actorUserId: user.userId, actorUsername: user.username,
        requestKey: input.request_key, payloadDigest: String(value.payloadDigest),
        requestPayload: value.requestPayload as Record<string, unknown>,
        packDigest, sourceFingerprint, legacyArtifactSha256: legacySha,
        artifactSchemaVersion: "quantbt.selected-params.v1", methodologyClaimId: claimId,
        state: "PENDING", approvalId: null, evidenceSetHash: null,
        receiptDigest: null, receipt: null, publishedAtUtcMs: null, lastErrorCode: null,
      };
      return { intent: state, replayed: false };
    }),
    pending: vi.fn(async () => { state = { ...state!, state: "PENDING", lastErrorCode: null }; return state; }),
    unknown: vi.fn(async (_scope: unknown, _id: string, code: string) => {
      state = { ...state!, state: "UNKNOWN", lastErrorCode: code }; return state;
    }),
    refused: vi.fn(async (_scope: unknown, _id: string, code: string) => {
      state = { ...state!, state: "REFUSED", lastErrorCode: code }; return state;
    }),
    finish: vi.fn(async (_scope: unknown, _id: string, receipt: Record<string, unknown>) => {
      state = {
        ...state!, state: "DELIVERED", approvalId: String(receipt.approvalId),
        evidenceSetHash: String(receipt.evidenceSetHash), receiptDigest: String(receipt.receiptDigest),
        receipt: receipt.receipt as Record<string, unknown>, publishedAtUtcMs: Number(receipt.publishedAtUtcMs),
      };
      return state;
    }),
  };
  const pack = { releaseCandidateId: rcId, runId: "run_p22", packDigest,
    sourceFingerprint, frozenCore: frozen, sealedAtUtcMs: 1790330400000,
    deliveryState: "NOT_DELIVERED", approvalState: "NOT_APPROVED" };
  const packs = { readPack: vi.fn().mockResolvedValue(pack), latestPack: vi.fn().mockResolvedValue(pack) };
  const candidate = {
    pack: vi.fn().mockResolvedValue({}),
    detail: vi.fn().mockResolvedValue({
      source_fingerprint: sourceFingerprint,
      local_seal: { release_candidate_id: rcId, state: "SEALED_LOCAL", availability: { state: "AVAILABLE" } },
      run: { binding: { alpha_id: "alpha_p22", alpha_version_id: "av_p22", lifecycle_state: "ACTIVE" } },
    }),
  };
  const governance = {
    publicationEvidence: vi.fn().mockResolvedValue(source),
    createApproval: vi.fn().mockResolvedValue({ schema_version: "governance.approval-create.v1", replayed: false, approval }),
    verifyPublicationPin: vi.fn().mockResolvedValue(true),
    detail: vi.fn().mockResolvedValue({
      schema_version: "governance.r1-review.v1", read_at: "2026-09-25T10:00:01.000Z",
      data: {
        approval, known_limitations: [],
        evidence_manifest: { manifest_hash: evidenceHash, entries: [{
          artifact_id: "run_p22", sha256: legacySha,
          schema_version: "quantbt.selected-params.v1", source_reference: "run_p22",
          verification: "SERVER_PINNED", source_authority: "RESEARCH",
        }] },
      },
    }),
  };
  const service = new ResearchReleaseCandidatePublicationService(
    repository as never, packs as never, candidate as never, governance as never,
  );
  return { service, repository, packs, candidate, governance, state: () => state };
}

describe("P22 actor-bound publication over existing R1", () => {
  it("P22-T01/T03/T12 sends only the strict R1 request, verifies exact artifact pin and mirrors raw source status", async () => {
    const x = subject();
    const result = await x.service.publish(scope, user as never, rcId, input, "req_p22");
    expect(result).toMatchObject({
      state: "DELIVERED", candidate_relation: "CURRENT", may_publish: false,
      published: { approval_id: "apr_p22" },
      approval_read: "AVAILABLE", approval: { status: "PENDING", evidence_set_hash: evidenceHash },
    });
    expect(x.governance.createApproval).toHaveBeenCalledWith(user, {
      workspaceId: "ws_p22", requestKey: input.request_key, alphaId: "alpha_p22",
      evidenceRunId: "run_p22", methodologyClaimId: claimId, summary: input.summary,
      expectedArtifactSha256: legacySha,
    }, "req_p22");
    const persistedRequest = x.state()!.requestPayload.downstream_request;
    expect(persistedRequest).toEqual({
      schema_version: "governance.approval-create-request.v1", workspace_id: "ws_p22",
      request_key: input.request_key, gate: "R1", alpha_id: "alpha_p22",
      evidence_run_id: "run_p22", methodology_claim_id: claimId, summary: input.summary,
    });
    expect(x.governance.verifyPublicationPin).toHaveBeenCalledWith(user, "ws_p22", "apr_p22", {
      alphaId: "alpha_p22", runId: "run_p22", sha256: legacySha,
      schemaVersion: "quantbt.selected-params.v1", evidenceSetHash: evidenceHash,
    });
    expect(result.pack_digest).not.toBe(legacySha.slice(7));
    expect(result.pack_digest).not.toBe(evidenceHash.slice(7));
  });

  it("P22-T05/T14 preserves actor, request key and frozen payload across unknown timeout and retry", async () => {
    const x = subject();
    x.governance.createApproval.mockRejectedValueOnce(new Error("response lost after commit"));
    const first = await x.service.publish(scope, user as never, rcId, input, "req_first");
    expect(first.state).toBe("UNKNOWN");
    expect(first.may_publish).toBe(true);
    const frozenPayload = x.state()!.requestPayload;
    x.governance.createApproval.mockResolvedValueOnce({
      schema_version: "governance.approval-create.v1", replayed: true, approval,
    });
    const second = await x.service.publish(scope, user as never, rcId, input, "req_retry");
    expect(second.state).toBe("DELIVERED");
    expect(second.replayed).toBe(true);
    expect(x.state()!.requestPayload).toBe(frozenPayload);
    expect(x.repository.begin).toHaveBeenCalledTimes(1);
    expect(x.governance.createApproval).toHaveBeenCalledTimes(2);
  });

  it("P22-T06/T12 leaves an unverified replay UNKNOWN and never attaches a different source pin", async () => {
    const x = subject();
    x.governance.verifyPublicationPin.mockResolvedValue(false);
    const result = await x.service.publish(scope, user as never, rcId, input, "req_p22");
    expect(result.state).toBe("UNKNOWN");
    expect(result.approval).toBeNull();
    expect(x.repository.finish).not.toHaveBeenCalled();
  });
  it("P22-T05 preserves the original intent after transient R1 serialization or rate limiting", async () => {
    const x = subject();
    x.governance.createApproval.mockRejectedValueOnce(
      new GovernanceError("APPROVAL_CREATE_SERIALIZATION_CONFLICT", "Retry.", 409),
    );
    const first = await x.service.publish(scope, user as never, rcId, input, "req_p22");
    expect(first.state).toBe("UNKNOWN");
    expect(first.may_publish).toBe(true);
    expect(x.repository.refused).not.toHaveBeenCalled();
    x.governance.createApproval.mockRejectedValueOnce(new GovernanceError("RATE_LIMITED", "Retry.", 429));
    const second = await x.service.publish(scope, user as never, rcId, input, "req_retry");
    expect(second.state).toBe("UNKNOWN");
    expect(x.repository.begin).toHaveBeenCalledTimes(1);
    expect(x.repository.refused).not.toHaveBeenCalled();
    x.governance.createApproval.mockRejectedValueOnce(new GovernanceError("WORKSPACE_ACCESS_DENIED", "Denied.", 403));
    const third = await x.service.publish(scope, user as never, rcId, input, "req_reauth");
    expect(third.state).toBe("UNKNOWN");
    expect(x.repository.begin).toHaveBeenCalledTimes(1);
    expect(x.repository.refused).not.toHaveBeenCalled();
  });

  it("P22-T03/T04 rejects a different actor or payload for the same durable intent", async () => {
    const x = subject();
    await x.service.publish(scope, user as never, rcId, input, "req_p22");
    await expect(x.service.publish(scope, user as never, rcId, { ...input, summary: "A different payload for the same key." }, "req_other"))
      .rejects.toMatchObject({ code: "RESEARCH_RELEASE_CANDIDATE_CONFLICT", status: 409 });
    await expect(x.service.publish({ ...scope, actorUserId: "usr_other" }, { ...user, userId: "usr_other" } as never, rcId, input, "req_other"))
      .rejects.toMatchObject({ code: "RESEARCH_RELEASE_CANDIDATE_CONFLICT", status: 409 });
    expect(x.repository.begin).toHaveBeenCalledTimes(1);
  });
  it("P22-T03 refuses source alpha drift without creating a Governance request", async () => {
    const x = subject();
    x.governance.publicationEvidence.mockResolvedValueOnce({ ...source, alpha_id: "alpha_other" });
    const result = await x.service.publish(scope, user as never, rcId, input, "req_p22");
    expect(result.state).toBe("NOT_PUBLISHED");
    expect(result.blocked_reason).toBe("P22_ALPHA_MAPPING_MISMATCH");
    expect(x.repository.begin).not.toHaveBeenCalled();
    expect(x.governance.createApproval).not.toHaveBeenCalled();
  });

  it("P22-T08/T13 prevents a superseded local pack from publishing", async () => {
    const x = subject();
    x.packs.latestPack.mockResolvedValueOnce({ releaseCandidateId: `rc_${"2".repeat(26)}` });
    const result = await x.service.publish(scope, user as never, rcId, input, "req_p22");
    expect(result.candidate_relation).toBe("SUPERSEDED");
    expect(result.blocked_reason).toBe("P22_RELEASE_CANDIDATE_SUPERSEDED");
    expect(x.repository.begin).not.toHaveBeenCalled();
    expect(x.governance.createApproval).not.toHaveBeenCalled();
  });

  it("P22-T08 keeps the delivery receipt when the R1 mirror is unavailable", async () => {
    const x = subject();
    x.governance.detail.mockRejectedValueOnce(new Error("R1 read unavailable"));
    const result = await x.service.publish(scope, user as never, rcId, input, "req_p22");
    expect(result.state).toBe("DELIVERED");
    expect(result.published?.approval_id).toBe("apr_p22");
    expect(result.approval_read).toBe("UNAVAILABLE");
    expect(result.approval).toBeNull();
  });

  it("P22-T05/T14 keeps an ambiguous downstream failure UNKNOWN, not approved", async () => {
    const x = subject();
    x.governance.createApproval.mockRejectedValueOnce(new Error("network timeout"));
    const result = await x.service.publish(scope, user as never, rcId, input, "req_p22");
    expect(result.state).toBe("UNKNOWN");
    expect(result.published).toBeNull();
    expect(result.approval_read).toBe("NOT_PUBLISHED");
    expect(x.repository.finish).not.toHaveBeenCalled();
  });
  it("P22-T11 refreshes the final-audit RunSync read model before showing publish eligibility", async () => {
    const x = subject();
    const result = await x.service.publication(scope, user as never, rcId);
    expect(result.state).toBe("NOT_PUBLISHED");
    expect(result.may_publish).toBe(true);
    expect(x.governance.publicationEvidence).toHaveBeenCalledWith(user, "ws_p22", "run_p22", true);
    expect(x.governance.createApproval).not.toHaveBeenCalled();
  });
});
