import { describe, expect, it, vi } from "vitest";

import { ResearchReleaseCandidateRepository, releaseCandidateSourceFingerprint,
  type ReleaseCandidateSource } from "../src/research/release-candidate.repository";

const scope = { workspaceId: "ws-p21", actorUserId: "actor-a" };
const peer = { ...scope, actorUserId: "actor-b" };
const runId = "run-p21";
const draftId = `rcd_${"1".repeat(26)}`;
const peerDraftId = `rcd_${"2".repeat(26)}`;
const rcId = `rc_${"3".repeat(26)}`;
const sha = "a".repeat(64);

function source(): ReleaseCandidateSource {
  return {
    runId, attemptId: "attempt-p21", runState: "READY", runKind: "AUDIT",
    relationshipKind: "AUDIT_OF_SELECTION", targetSelectionId: "selection-p21",
    requestSpecDigest: sha, effectiveSpecDigest: sha, datasetBindingDigest: sha,
    engineReleaseId: "er_quantbt_111", artifactRevision: 1,
    alpha: { alphaId: "alpha-p21", name: "Alpha", alphaVersionId: "av-p21", codeDigest: sha,
      entrypoint: "alpha:run", lifecycleState: "ACTIVE", declaredContract: {} },
    producer: { adapterContractDigest: sha, manifestDigest: sha, sourceTransformDigest: sha },
    selection: { selectionId: "selection-p21", selectedTrialId: "0", parameterBundleDigest: sha,
      sourceDigest: sha, targetKind: "TRIAL" },
    report: { reportRevision: "report-p21", frozenCoreDigest: sha, frozenCore: {}, sealedAtUtcMs: 1 },
    evidence: { revision: "evidence-p21", sourceEvidenceDigest: sha, projectionDigest: sha,
      readiness: "COMPLETE", projection: {} },
    methodology: { claimText: null, certificateState: null, certificateGrade: null, certificateIssuedAtUtcMs: null },
    split: { revision: "split-p21", sourceSplitDigest: sha, projectionDigest: sha, readiness: "COMPLETE", projection: {} },
    currentSource: { artifactRevision: 1, manifestDigest: sha, sourceTransformDigest: sha, retainedImportDigest: sha },
    artifacts: [], asOfUtcMs: 1, wfo: null,
  };
}

function subject() {
  const currentSource = source();
  const fingerprint = releaseCandidateSourceFingerprint(currentSource);
  const declarations = { known_limitations: "Original limitation", proposed_use_restrictions: "Research only" };
  const drafts = new Map([
    [scope.actorUserId, { draft_id: draftId, revision: 1, source_fingerprint: fingerprint,
      ...declarations, updated_at_utc_ms: 1 }],
    [peer.actorUserId, { draft_id: peerDraftId, revision: 1, source_fingerprint: fingerprint,
      ...declarations, updated_at_utc_ms: 1 }],
  ]);
  const packs = [{ workspace_id: scope.workspaceId, actor_user_id: scope.actorUserId,
    release_candidate_id: rcId, run_id: runId, draft_id: draftId, source_fingerprint: fingerprint,
    pack_digest: sha, frozen_core: { fields: [], pack: [], source_fingerprint: fingerprint, draft: declarations },
    sealed_at_utc_ms: 2, delivery_state: "NOT_DELIVERED", approval_state: "NOT_APPROVED" }];
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const members = new Set([scope.actorUserId, peer.actorUserId]);
  const result = (rows: unknown[]) => ({ rows, rowCount: rows.length });
  const client = {
    query: vi.fn(async (sql: string, values: unknown[] = []) => {
      queries.push({ sql, values });
      if (sql.includes("SELECT 1 FROM workspace_members")) {
        return result(values[0] === scope.workspaceId && members.has(String(values[1])) ? [{}] : []);
      }
      if (sql.includes("FROM research.release_candidate_drafts_v1 draft")) {
        const draft = values[0] === scope.workspaceId && values[1] === runId ? drafts.get(String(values[2])) : null;
        return result(draft ? [{ ...draft, sealed: packs.some((pack) => pack.workspace_id === values[0]
          && pack.draft_id === draft.draft_id) }] : []);
      }
      if (sql.includes("FROM research.release_candidate_packs_v1 pack")) {
        const found = packs.filter((pack) => pack.workspace_id === values[0] && pack.run_id === values[1]
          && (!sql.includes("sealed_draft.actor_user_id") || (pack.draft_id === values[2]
            && pack.actor_user_id === values[3] && pack.source_fingerprint === values[4])));
        return result(found.slice(0, 1));
      }
      if (sql.includes("UPDATE research.release_candidate_drafts_v1")) {
        const draft = values[0] === scope.workspaceId && values[1] === runId ? drafts.get(String(values[2])) : null;
        if (!draft || draft.revision !== values[3]) return result([]);
        draft.source_fingerprint = String(values[4]);
        draft.known_limitations = String(values[5]);
        draft.proposed_use_restrictions = String(values[6]);
        draft.revision += 1;
        return result([{ ...draft }]);
      }
      return result([]);
    }),
    release: vi.fn(),
  };
  const repository = new ResearchReleaseCandidateRepository({ connect: vi.fn().mockResolvedValue(client) } as never);
  // Only the unrelated large source projection is a stand-in. Repository
  // transactions, membership, actor-local reads, CAS and seal fences run here.
  const snapshot = vi.spyOn(repository as unknown as {
    snapshotFromClient: () => Promise<ReleaseCandidateSource>;
  }, "snapshotFromClient").mockResolvedValue(currentSource);
  const sealInput = { draftId, expectedDraftRevision: 1, expectedSourceFingerprint: fingerprint };
  return { repository, snapshot, queries, drafts, packs, members, fingerprint, sealInput, currentSource };
}

const sealedConflict = { code: "RESEARCH_RELEASE_CANDIDATE_CONFLICT", status: 409,
  details: { reason_code: "P21_ALREADY_SEALED" } };

describe("P21 actor-local immutable declaration and seal fences", () => {
  it("derives the seal lock from the caller's draft, not a peer's workspace-visible latest pack", async () => {
    const { repository, queries } = subject();
    expect(await repository.draft(scope, runId)).toMatchObject({ draftId, sealed: true });
    expect(await repository.draft(peer, runId)).toMatchObject({ draftId: peerDraftId, sealed: false });
    expect(await repository.latestPack(peer, runId)).toMatchObject({ releaseCandidateId: rcId });
    expect(queries.find((query) => query.sql.includes("AS sealed"))?.sql).toContain("pack.draft_id = draft.draft_id");
  });

  it("rejects PATCH of a sealed draft, including after source evolution, without issuing any write", async () => {
    const { repository, snapshot, queries, currentSource } = subject();
    const changed = { ...currentSource, effectiveSpecDigest: "b".repeat(64) };
    snapshot.mockResolvedValue(changed);
    await expect(repository.patchDraft(scope, runId, { expectedRevision: 1,
      expectedSourceFingerprint: releaseCandidateSourceFingerprint(changed), knownLimitations: "Changed",
      proposedUseRestrictions: "Changed" })).rejects.toMatchObject(sealedConflict);
    expect(snapshot).not.toHaveBeenCalled();
    expect(queries.some((query) => /INSERT INTO|UPDATE research/.test(query.sql))).toBe(false);
  });

  it("keeps another actor's draft editable when the run already has a peer's sealed pack", async () => {
    const { repository, drafts, fingerprint } = subject();
    const updated = await repository.patchDraft(peer, runId, { expectedRevision: 1,
      expectedSourceFingerprint: fingerprint, knownLimitations: "Peer limitation", proposedUseRestrictions: "Peer restriction" });
    expect(updated.draft).toMatchObject({ draftId: peerDraftId, revision: 2, sealed: false,
      knownLimitations: "Peer limitation", proposedUseRestrictions: "Peer restriction" });
    expect(drafts.get(scope.actorUserId)).toMatchObject({ revision: 1, known_limitations: "Original limitation" });
  });

  it("replays the original seal after source evolution without recomposing, writing or changing its pack", async () => {
    const { repository, snapshot, sealInput, packs, currentSource, queries } = subject();
    snapshot.mockResolvedValue({ ...currentSource, effectiveSpecDigest: "b".repeat(64) });
    const before = JSON.stringify(packs);
    const build = vi.fn();
    const first = await repository.seal(scope, runId, sealInput, build);
    const retry = await repository.seal(scope, runId, sealInput, build);
    expect(retry).toEqual(first);
    expect(first).toMatchObject({ releaseCandidateId: rcId, packDigest: sha,
      deliveryState: "NOT_DELIVERED", approvalState: "NOT_APPROVED" });
    expect(snapshot).not.toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();
    expect(JSON.stringify(packs)).toBe(before);
    expect(queries.some((query) => /INSERT INTO|UPDATE research/.test(query.sql))).toBe(false);
    expect(queries.find((query) => query.sql.includes("sealed_draft.actor_user_id"))?.values)
      .toEqual([scope.workspaceId, runId, draftId, scope.actorUserId, sealInput.expectedSourceFingerprint]);
  });

  it("does not return an old pack when an older writer changed sealed declarations", async () => {
    for (const field of ["known_limitations", "proposed_use_restrictions"] as const) {
      const { repository, sealInput, drafts } = subject();
      const draft = drafts.get(scope.actorUserId)!;
      draft[field] = "Changed after seal";
      draft.revision += 1;
      await expect(repository.seal(scope, runId, { ...sealInput, expectedDraftRevision: 2 }, vi.fn()))
        .rejects.toMatchObject(sealedConflict);
    }
  });

  it("refuses resealing a frozen draft against a new source fingerprint", async () => {
    const { repository, sealInput, drafts, queries } = subject();
    await expect(repository.seal(scope, runId, { ...sealInput, expectedSourceFingerprint: "b".repeat(64) }, vi.fn()))
      .rejects.toMatchObject(sealedConflict);
    // A legacy writer may already have rebased the sealed draft's source
    // fence. That cannot turn it into a new candidate under the same draft.
    drafts.get(scope.actorUserId)!.source_fingerprint = "b".repeat(64);
    await expect(repository.seal(scope, runId, { ...sealInput, expectedSourceFingerprint: "b".repeat(64) }, vi.fn()))
      .rejects.toMatchObject(sealedConflict);
    expect(queries.some((query) => /INSERT INTO|UPDATE research/.test(query.sql))).toBe(false);
  });

  it("preserves actor/workspace membership and revision fences before seal replay", async () => {
    const { repository, sealInput, members } = subject();
    await expect(repository.seal(peer, runId, sealInput, vi.fn()))
      .rejects.toMatchObject({ code: "RESEARCH_RELEASE_CANDIDATE_CONFLICT", status: 409 });
    await expect(repository.seal(scope, runId, { ...sealInput, expectedDraftRevision: 2 }, vi.fn()))
      .rejects.toMatchObject({ code: "RESEARCH_RELEASE_CANDIDATE_CONFLICT", status: 409 });
    await expect(repository.seal({ ...scope, workspaceId: "ws-other" }, runId, sealInput, vi.fn()))
      .rejects.toMatchObject({ code: "RESEARCH_RELEASE_CANDIDATE_FORBIDDEN", status: 403 });
    members.delete(scope.actorUserId);
    await expect(repository.seal(scope, runId, sealInput, vi.fn()))
      .rejects.toMatchObject({ code: "RESEARCH_RELEASE_CANDIDATE_FORBIDDEN", status: 403 });
  });
});
