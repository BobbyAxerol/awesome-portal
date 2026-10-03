import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GovernanceError } from "../src/governance/governance.service";
import { canonicalResearchJson } from "../src/research/preflight.service";
import { ResearchReleaseCandidatePublicationService } from "../src/research/release-candidate-publication.service";
import type { PublicationIntent } from "../src/research/release-candidate-publication.repository";
import { auditProof } from "./research-final-audit.fixture";

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
  pack: [{ key: "methodology_claim_id", value: claimId }], source_fingerprint: sourceFingerprint,
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
function subject(intake: "true" | "false" = "true", bridgeEnabled = false) {
  let state: PublicationIntent | null = null;
  const repository = {
    read: vi.fn(async () => state),
    latestDeliveredByAlphaVersion: vi.fn(async () => state?.state === "DELIVERED" ? rcId : null),
    begin: vi.fn(async (_scope: unknown, value: Record<string, unknown>) => {
      state = {
        releaseCandidateId: rcId, runId: "run_p22", alphaId: "alpha_p22",
        alphaVersionId: "av_p22", actorUserId: user.userId, actorUsername: user.username,
        requestKey: String(value.requestKey), payloadDigest: String(value.payloadDigest),
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
        approval: { ...approval, subject_label: "Alpha P22", quorum_required: 2, quorum_met: 1, approval_version: 3, blocker_count: 0 },
        decisions: [{ actor: { user_id: "usr_reviewer", username: "reviewer" }, outcome: "APPROVED_WITH_CONDITION", conditions: [{ text: "Research only" }] }],
        known_limitations: [],
        evidence_manifest: { manifest_hash: evidenceHash, entries: [{
          artifact_id: "run_p22", sha256: legacySha,
          schema_version: "quantbt.selected-params.v1", source_reference: "run_p22",
          verification: "SERVER_PINNED", source_authority: "RESEARCH",
        }] },
      },
    }),
  };
  const bridge = {
    materialize: vi.fn().mockResolvedValue({
      runId: "run_p22", parentRunId: null, attemptId: "attempt_p22",
      alphaId: "alpha_p22", alphaVersionId: "av_p22", strategyId: "alpha_p22",
      datasetId: "dataset_p22", sourceCursor: null, status: "READY",
      artifactSha256: legacySha, artifactSchemaVersion: "quantbt.selected-params.v1",
      artifactId: "artifact_p22", artifactManifestDigest: legacySha.slice(7),
      ownerUserId: user.userId, selectionId: "selection_p22", selectedTrialId: "trial_p22",
      selectionSequence: ["trial_p22"], materializationDigest: "d".repeat(64),
      materializedAtUtcMs: 1790330400000, replayed: false,
    }),
  };
  const service = new ResearchReleaseCandidatePublicationService(
    repository as never, packs as never, candidate as never, governance as never,
    { FEATURE_RESEARCH_RELEASE_CANDIDATE_PUBLICATION: intake },
    bridgeEnabled ? bridge as never : undefined,
  );
  return { service, repository, packs, candidate, governance, bridge, state: () => state };
}

describe("P22 actor-bound publication over existing R1", () => {
  it("accepts only a frozen verified linked child and keeps Governance evidence on the parent selection",async()=>{
    const x=subject("true",true);
    const result={...auditProof.result,parent_run_id:"run_p22"};
    const proof={...auditProof,result,result_digest:digest(result)};
    const core={...frozen,linked_final_audit:proof,fields:frozen.fields.map(field=>field.key==="final_audit_run_id"
      ? {...field,value:proof.child_run_id}:field)};
    const pack={releaseCandidateId:rcId,runId:"run_p22",packDigest:digest(core),sourceFingerprint,frozenCore:core,
      deliveryState:"NOT_DELIVERED",approvalState:"NOT_APPROVED",sealedAtUtcMs:1790330400000};
    x.packs.readPack.mockResolvedValue(pack as never);x.packs.latestPack.mockResolvedValue(pack as never);
    expect(await x.service.publication(scope,user as never,rcId)).toMatchObject({may_publish:true,blocked_reason:null});
    expect(x.bridge.materialize).toHaveBeenCalled();
    expect(x.governance.publicationEvidence.mock.calls[0]![2]).toBe("run_p22");
    for(const invalid of [{...proof,result_digest:"0".repeat(64)}, {...proof,result:{...result,parent_run_id:"other"}}, null]){
      const bad={...core,linked_final_audit:invalid};
      x.packs.readPack.mockResolvedValue({...pack,packDigest:digest(bad),frozenCore:bad} as never);
      x.packs.latestPack.mockResolvedValue({...pack,packDigest:digest(bad),frozenCore:bad} as never);
      expect(await x.service.publication(scope,user as never,rcId)).toMatchObject({may_publish:false,blocked_reason:"P22_FINAL_AUDIT_NOT_LINKED"});
    }
  });
  it("P22-T01/T03/T12 sends only the strict R1 request, verifies exact artifact pin and mirrors raw source status", async () => {
    const x = subject();
    const result = await x.service.publish(scope, user as never, rcId, input, "req_p22");
    expect(result).toMatchObject({
      state: "DELIVERED", candidate_relation: "CURRENT", may_publish: false,
      published: { approval_id: "apr_p22" },
      approval_read: "AVAILABLE", approval: {
        status: "PENDING", effective_status: "PENDING", evidence_set_hash: evidenceHash,
        subject_label: "Alpha P22", quorum: { required: 2, met: 1 }, approval_version: 3,
        blocker_count: 0, condition_count: 1, rc_superseded: false,
        assignee_pool_availability: { state: "NOT_PUBLISHED", reason_code: "P22_GOVERNANCE_ASSIGNEE_POOL_NOT_PUBLISHED" },
        decision_outcomes: [{ actor_user_id: "usr_reviewer", outcome: "APPROVED_WITH_CONDITION" }],
      },
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

  it.each(["DELIVERED", "REFUSED"] as const)("P22-T05/T14 marks %s POST replays without rewriting the intent or calling R1 again", async (terminalState) => {
    const x = subject();
    if (terminalState === "REFUSED") {
      x.governance.createApproval.mockRejectedValueOnce(new GovernanceError("APPROVAL_CREATE_INVALID", "Refused.", 400));
    }
    const first = await x.service.publish(scope, user as never, rcId, input, "req_first");
    expect(first).toMatchObject({ state: terminalState, replayed: false });
    const recorded = x.state();
    const retry = await x.service.publish(scope, user as never, rcId, input, "req_terminal_retry");
    expect(retry).toMatchObject({ state: terminalState, replayed: true, published: first.published });
    expect(x.state()).toBe(recorded);
    // A GET reads existing state, not an idempotent POST replay.
    expect((await x.service.publication(scope, user as never, rcId)).replayed).toBe(false);
    await expect(x.service.publish(scope, user as never, rcId, { ...input, summary: "Changed terminal payload." }, "req_changed"))
      .rejects.toMatchObject({ code: "RESEARCH_RELEASE_CANDIDATE_CONFLICT", status: 409 });
    await expect(x.service.publish({ ...scope, actorUserId: "usr_other" }, { ...user, userId: "usr_other" } as never, rcId, input, "req_other"))
      .rejects.toMatchObject({ code: "RESEARCH_RELEASE_CANDIDATE_CONFLICT", status: 409 });
    expect(x.repository.begin).toHaveBeenCalledTimes(1);
    expect(x.repository.pending).not.toHaveBeenCalled();
    expect(x.repository.finish).toHaveBeenCalledTimes(terminalState === "DELIVERED" ? 1 : 0);
    expect(x.repository.refused).toHaveBeenCalledTimes(terminalState === "REFUSED" ? 1 : 0);
    expect(x.governance.createApproval).toHaveBeenCalledTimes(1);
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

  it("§31 publisher without R1 read rights retains the immutable delivery, not an invented approval status", async () => {
    const x = subject();
    x.governance.detail.mockRejectedValue(new GovernanceError("GOVERNANCE_READ_DENIED", "Access denied.", 403));
    const result = await x.service.publish(scope, user as never, rcId, input, "req_p31");
    expect(result).toMatchObject({ state: "DELIVERED", may_publish: false, blocked_action: "NONE",
      published: { approval_id: "apr_p22", by_user_id: user.userId }, approval_read: "DENIED", approval: null });
    const receipt = result.published;
    expect((await x.service.publication(scope, user as never, rcId)).published).toEqual(receipt);
    expect(x.governance.createApproval).toHaveBeenCalledTimes(1);
    expect(x.governance.verifyPublicationPin).toHaveBeenCalledWith(user, scope.workspaceId, "apr_p22", expect.any(Object));
  });

  it("§31 an UNKNOWN intent preserves CURRENT_SOURCE_CHANGED instead of replacing it with a pin-change alias", async () => {
    const x = subject();
    x.governance.createApproval.mockRejectedValueOnce(new Error("uncertain outcome"));
    await x.service.publish(scope, user as never, rcId, input, "req_first");
    x.candidate.detail.mockResolvedValue({ source_fingerprint: "f".repeat(64),
      local_seal: { release_candidate_id: rcId, state: "SEALED_LOCAL", availability: { state: "PARTIAL" } },
      run: { binding: { alpha_id: "alpha_p22", alpha_version_id: "av_p22", lifecycle_state: "ACTIVE" } } });
    expect(await x.service.publication(scope, user as never, rcId)).toMatchObject({ state: "UNKNOWN", may_publish: false,
      blocked_reason: "P22_CURRENT_SOURCE_CHANGED", blocked_action: "CREATE_NEW_RUN_AND_SEAL" });
    expect(x.governance.createApproval).toHaveBeenCalledTimes(1);
    expect(x.repository.refused).not.toHaveBeenCalled();
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
  it("X1 derives the request key and R1 summary from the sealed pack when the browser names neither", async () => {
    const x = subject();
    const bare = { schema_version: input.schema_version, expected_pack_digest: packDigest, methodology_claim_id: claimId };
    x.governance.createApproval.mockRejectedValueOnce(new Error("response lost after commit"));
    const first = await x.service.publish(scope, user as never, rcId, bare, "req_first");
    expect(first.state).toBe("UNKNOWN");
    const expected = { requestKey: `rcpub:${rcId}`, summary: `Release candidate ${rcId} · pack sha256:${packDigest} · evidence run run_p22` };
    expect(x.governance.createApproval).toHaveBeenCalledWith(user, expect.objectContaining(expected), "req_first");
    expect(x.state()!.requestKey).toBe(expected.requestKey);
    // The replay derives the same bytes: no conflict, no second intent.
    const second = await x.service.publish(scope, user as never, rcId, bare, "req_retry");
    expect(second.state).toBe("DELIVERED");
    expect(x.repository.begin).toHaveBeenCalledTimes(1);
    expect(x.governance.createApproval).toHaveBeenLastCalledWith(user, expect.objectContaining(expected), "req_retry");
    const terminalReplay = await x.service.publish(scope, user as never, rcId, bare, "req_terminal_retry");
    expect(terminalReplay).toMatchObject({ state: "DELIVERED", replayed: true, published: second.published });
    expect(x.repository.begin).toHaveBeenCalledTimes(1);
    expect(x.governance.createApproval).toHaveBeenCalledTimes(2);
  });

  it("X1 intake dark: no new intent, no RunSync refresh, no Governance call; the read says why", async () => {
    const x = subject("false");
    const read = await x.service.publication(scope, user as never, rcId);
    expect(read).toMatchObject({ state: "NOT_PUBLISHED", may_publish: false, blocked_reason: "P22_PUBLICATION_INTAKE_DISABLED" });
    expect(read.source.availability).toBe("NOT_CHECKED");
    const post = await x.service.publish(scope, user as never, rcId, input, "req_p22");
    expect(post).toMatchObject({ state: "NOT_PUBLISHED", may_publish: false, blocked_reason: "P22_PUBLICATION_INTAKE_DISABLED" });
    expect(x.governance.publicationEvidence).not.toHaveBeenCalled();
    expect(x.repository.begin).not.toHaveBeenCalled();
    expect(x.governance.createApproval).not.toHaveBeenCalled();
  });

  it("X1 intake dark still reconciles an intent recorded while it was open", async () => {
    const open = subject("true");
    open.governance.createApproval.mockRejectedValueOnce(new Error("response lost after commit"));
    expect((await open.service.publish(scope, user as never, rcId, input, "req_first")).state).toBe("UNKNOWN");
    const recorded = open.state()!;
    const dark = subject("false");
    dark.repository.read.mockResolvedValue(recorded);
    dark.repository.pending.mockResolvedValue({ ...recorded, state: "PENDING" });
    const pending = await dark.service.publication(scope, user as never, rcId);
    expect(pending).toMatchObject({ state: "UNKNOWN", may_publish: true, blocked_reason: null });
    dark.repository.finish.mockImplementation(async () => {
      const done = { ...recorded, state: "DELIVERED" as const, approvalId: "apr_p22", evidenceSetHash: evidenceHash, receiptDigest: "d".repeat(64), publishedAtUtcMs: 1790330400000 };
      dark.repository.read.mockResolvedValue(done);
      return done;
    });
    const retried = await dark.service.publish(scope, user as never, rcId, input, "req_retry");
    expect(retried.state).toBe("DELIVERED");
    expect(dark.governance.createApproval).toHaveBeenCalledTimes(1);
    expect(dark.repository.begin).not.toHaveBeenCalled();
  });

  it("P22-T11 refreshes the final-audit RunSync read model before showing publish eligibility", async () => {
    const x = subject();
    const result = await x.service.publication(scope, user as never, rcId);
    expect(result.state).toBe("NOT_PUBLISHED");
    expect(result.may_publish).toBe(true);
    expect(x.governance.publicationEvidence).toHaveBeenCalledWith(user, "ws_p22", "run_p22", true);
    expect(x.governance.createApproval).not.toHaveBeenCalled();
  });
  it("OL-05 materializes a sealed retained source before reading Governance evidence", async () => {
    const x = subject("true", true);
    const result = await x.service.publication(scope, user as never, rcId);
    expect(result).toMatchObject({ state: "NOT_PUBLISHED", may_publish: true, blocked_reason: null });
    expect(x.bridge.materialize).toHaveBeenCalledWith(scope, {
      releaseCandidateId: rcId, packDigest, sourceFingerprint, methodologyClaimIds: [claimId],
    });
    expect(x.governance.publicationEvidence).toHaveBeenCalledWith(user, "ws_p22", "run_p22", false);
    expect(x.bridge.materialize.mock.invocationCallOrder[0]).toBeLessThan(
      x.governance.publicationEvidence.mock.invocationCallOrder[0]!,
    );
    expect(x.governance.createApproval).not.toHaveBeenCalled();
  });
  it("OL-13 returns typed absence and the exact delivered publication for one Alpha version", async () => {
    const x = subject();
    const absent = await x.service.alphaVersionPublication(scope, user as never, "av_p22");
    expect(absent).toMatchObject({
      alpha_version_id: "av_p22", availability: "NOT_PUBLISHED",
      reason_code: "P22_ALPHA_VERSION_PUBLICATION_NOT_PUBLISHED", publication: null,
    });
    await x.service.publish(scope, user as never, rcId, input, "req_p22");
    const available = await x.service.alphaVersionPublication(scope, user as never, "av_p22");
    expect(available).toMatchObject({
      alpha_version_id: "av_p22", availability: "AVAILABLE", reason_code: null,
      publication: { release_candidate_id: rcId, alpha_version_id: "av_p22", state: "DELIVERED" },
    });
    expect(x.repository.latestDeliveredByAlphaVersion).toHaveBeenLastCalledWith(scope, "av_p22");
  });

});
