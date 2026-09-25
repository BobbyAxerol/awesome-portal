import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { canonicalResearchJson } from "../src/research/preflight.service";
import { ResearchReleaseCandidateService } from "../src/research/release-candidate.service";
import type {
  ReleaseCandidateDraft,
  ReleaseCandidateSource,
  ReleaseCandidateStoredPack,
} from "../src/research/release-candidate.repository";
import { releaseCandidateSourceFingerprint } from "../src/research/release-candidate.repository";

const scope = { workspaceId: "ws-p21", actorUserId: "usr-p21" };
// Fixtures need independent, syntactically valid SHA-256 identities; do not
// use mnemonic letters outside the hexadecimal alphabet.
const digest = (label: string) => createHash("sha256").update(label, "utf8").digest("hex");
const reportDigest = (value: unknown) => createHash("sha256").update(canonicalResearchJson(value), "utf8").digest("hex");
const draftId = `rcd_${"0".repeat(26)}`;
const releaseCandidateId = `rc_${"1".repeat(26)}`;

function reportCore(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: "research.report-frozen-core.v1",
    source_digests: {
      source_transform_digest: digest("a"),
      dataset_binding_digest: digest("b"),
      manifest_digest: digest("c"),
      requested_spec_digest: digest("d"),
      effective_spec_digest: digest("e"),
    },
    ...overrides,
  };
}

function source(overrides: Partial<ReleaseCandidateSource> = {}): ReleaseCandidateSource {
  const frozen = reportCore();
  const value: ReleaseCandidateSource = {
    runId: "run-p21-audit",
    attemptId: "att-p21-audit",
    runState: "READY",
    runKind: "AUDIT",
    relationshipKind: "AUDIT_OF_SELECTION",
    targetSelectionId: "sel-p21",
    requestSpecDigest: digest("d"),
    effectiveSpecDigest: digest("e"),
    datasetBindingDigest: digest("b"),
    engineReleaseId: "quantbt-1.1.1",
    artifactRevision: 7,
    alpha: {
      alphaId: "alpha-p21", name: "P21 Alpha", alphaVersionId: "av-p21",
      codeDigest: digest("i"), entrypoint: "strategies.p21:Alpha", lifecycleState: "ACTIVE",
      declaredContract: { execution: { execution_route: "signal_notional" } },
    },
    producer: { adapterContractDigest: digest("j"), manifestDigest: digest("c"), sourceTransformDigest: null },
    selection: { selectionId: "sel-p21", selectedTrialId: null, parameterBundleDigest: digest("k"), sourceDigest: digest("l"), targetKind: "CENTROID" },
    report: { reportRevision: "p18r1_fixture", frozenCoreDigest: digest("f"), frozenCore: frozen, sealedAtUtcMs: 1_790_000_000_000 },
    evidence: {
      revision: `p13r1_${digest("m")}`, sourceEvidenceDigest: digest("n"), projectionDigest: digest("o"), readiness: "COMPLETE",
      projection: { source: { source_transform_digest: digest("a") } },
    },
    methodology: { claimText: "Strict outer-OOS methodology claim.", certificateState: "ISSUED", certificateGrade: "A", certificateIssuedAtUtcMs: 1_790_000_001_000 },
    split: {
      revision: `p14r1_${digest("p")}`, sourceSplitDigest: digest("q"), projectionDigest: digest("r"), readiness: "COMPLETE",
      projection: { source: { protocol: { selection: { parameter_bundle_digest: digest("k") } } } },
    },
    currentSource: { artifactRevision: 7, manifestDigest: digest("c"), sourceTransformDigest: digest("a"), retainedImportDigest: digest("s") },
    artifacts: [{ artifactId: "art-p21", manifestDigest: digest("t"), state: "SEALED", artifactRevision: 7 }],
    asOfUtcMs: 1_790_000_002_000,
  };
  const output = { ...value, ...overrides };
  // The report digest is itself a source fact and must match the exact core.
  // Generate it only after shallow test overrides have been applied.
  output.report = {
    ...output.report,
    frozenCoreDigest: reportDigest(output.report.frozenCore),
  };
  return output;
}

function persistedDraft(overrides: Partial<ReleaseCandidateDraft> = {}): ReleaseCandidateDraft {
  return {
    draftId, revision: 1, sourceFingerprint: "0".repeat(64),
    knownLimitations: "Known bounded limitation.", proposedUseRestrictions: "Paper-only research use.",
    updatedAtUtcMs: 1_790_000_003_000, ...overrides,
  };
}

function storedPack(overrides: Partial<ReleaseCandidateStoredPack> = {}): ReleaseCandidateStoredPack {
  return {
    releaseCandidateId, runId: "run-p21-audit", packDigest: digest("u"), sourceFingerprint: digest("v"),
    frozenCore: { fields: [], pack: [], source_fingerprint: digest("v"), draft: { known_limitations: "x", proposed_use_restrictions: "y" } },
    sealedAtUtcMs: 1_790_000_004_000, deliveryState: "NOT_DELIVERED", approvalState: "NOT_APPROVED", ...overrides,
  };
}

function subject(sourceValue = source(), draftValue: ReleaseCandidateDraft | null = persistedDraft()) {
  const repository = {
    snapshot: vi.fn().mockResolvedValue(sourceValue),
    draft: vi.fn().mockResolvedValue(draftValue),
    latestPack: vi.fn().mockResolvedValue(null),
    readPack: vi.fn(),
    patchDraft: vi.fn(),
    seal: vi.fn(async (_scope, _runId, _input, build) => {
      const built = build(sourceValue, draftValue, releaseCandidateId);
      return storedPack({ packDigest: built.packDigest, frozenCore: built.frozenCore, sourceFingerprint: releaseCandidateSourceFingerprint(sourceValue) });
    }),
  };
  const config = { FEATURE_RESEARCH_RELEASE_CANDIDATES: "true" };
  return { service: new ResearchReleaseCandidateService(repository as never, config as never), repository };
}

describe("P21 Release Candidate composer and local immutable pack", () => {
  it("P21-T01/T03/T11/T12 emits exactly 17 source-built fields and 12 items, accepts a persisted centroid with no trial, and does no compute", async () => {
    const sourceValue = source();
    const draft = persistedDraft({ sourceFingerprint: releaseCandidateSourceFingerprint(sourceValue) });
    const { service, repository } = subject(sourceValue, draft);

    const result = await service.detail(scope, sourceValue.runId);

    expect(result.fields).toHaveLength(17);
    expect(result.yaml).toEqual(result.fields);
    expect(result.pack).toHaveLength(12);
    expect(result.pack.map((item) => item.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(result.pack.find((item) => item.key === "SELECTED_PARAMS_LINEAGE")).toMatchObject({ status: "COMPLETE", note: expect.stringContaining("centroid") });
    expect(result.pack.find((item) => item.key === "ROBUSTNESS_PARAM_STABILITY_REGIME")).toMatchObject({ status: "DEGRADED" });
    expect(result.actions).toMatchObject({ may_seal: true, publish: { enabled: false, blocked_reason: "P22_LOCAL_SEAL_REQUIRED" } });
    expect(result.published_comparison).toEqual({
      last_release_candidate_id: null,
      availability: { state: "NOT_PUBLISHED", reason_code: "P22_PUBLISHED_COMPARISON_NOT_COMMISSIONED" },
    });
    expect(result.certification_axes).toEqual({
      methodology_claim: { value: "A", availability: { state: "AVAILABLE", reason_code: null } },
      engine_execution_contract: {
        value: null,
        availability: { state: "NOT_PUBLISHED", reason_code: "P21_ENGINE_EXECUTION_CERTIFICATION_NOT_PUBLISHED" },
      },
    });
    expect(result.taxonomy.every((row) => row.state === "UNSET")).toBe(true);
    expect(repository.patchDraft).not.toHaveBeenCalled();
    expect(repository.seal).not.toHaveBeenCalled();
  });

  it("P21-T02/T04/T06 fails closed for scratch, non-active, corrupt and unavailable proof without inventing a waiver", async () => {
    const scratch = source({ alpha: { ...source().alpha, alphaId: null, alphaVersionId: null, codeDigest: null, entrypoint: null, lifecycleState: null } });
    const scratchDraft = persistedDraft({ sourceFingerprint: releaseCandidateSourceFingerprint(scratch) });
    const scratchResult = await subject(scratch, scratchDraft).service.detail(scope, scratch.runId);
    expect(scratchResult.actions).toMatchObject({ may_seal: false, seal_blocked_reason: "P21_SCRATCH_RUN_UNBOUND" });

    const corrupt = source({ artifacts: [{ artifactId: "art-corrupt", manifestDigest: digest("t"), state: "CORRUPT", artifactRevision: 7 }] });
    const corruptResult = await subject(corrupt, persistedDraft({ sourceFingerprint: releaseCandidateSourceFingerprint(corrupt) })).service.detail(scope, corrupt.runId);
    expect(corruptResult.actions).toMatchObject({ may_seal: false, seal_blocked_reason: "P21_REFERENCED_SOURCE_INTEGRITY_FAILED" });

    const noMethodology = source({ methodology: { claimText: null, certificateState: "NOT_PUBLISHED", certificateGrade: null, certificateIssuedAtUtcMs: null } });
    const noMethodologyResult = await subject(noMethodology, persistedDraft({ sourceFingerprint: releaseCandidateSourceFingerprint(noMethodology) })).service.detail(scope, noMethodology.runId);
    expect(noMethodologyResult.pack.find((item) => item.key === "METHODOLOGY_CLAIM")).toMatchObject({ status: "MISSING", availability: { reason_code: "P21_METHODOLOGY_CLAIM_NOT_PUBLISHED" } });
    expect(noMethodologyResult.actions).toMatchObject({ may_seal: false, seal_blocked_reason: "P21_REQUIRED_EVIDENCE_MISSING" });

    const malformedAdapter = source({ producer: { ...source().producer, adapterContractDigest: "not-a-digest" } });
    const malformedAdapterResult = await subject(malformedAdapter, persistedDraft({ sourceFingerprint: releaseCandidateSourceFingerprint(malformedAdapter) })).service.detail(scope, malformedAdapter.runId);
    expect(malformedAdapterResult.pack.find((item) => item.key === "ENGINE_CAPABILITY_BACKEND")).toMatchObject({ status: "MISSING" });
    expect(malformedAdapterResult.actions).toMatchObject({ may_seal: false, seal_blocked_reason: "P21_REQUIRED_EVIDENCE_MISSING" });
  });

  it("P21-T05 preserves draft/source CAS boundaries and returns the recomposed server view", async () => {
    const sourceValue = source();
    const fresh = persistedDraft({ sourceFingerprint: releaseCandidateSourceFingerprint(sourceValue), revision: 2, knownLimitations: "Updated limitation." });
    const { service, repository } = subject(sourceValue, persistedDraft({ sourceFingerprint: releaseCandidateSourceFingerprint(sourceValue) }));
    repository.patchDraft.mockResolvedValue({ source: sourceValue, draft: fresh });

    const result = await service.patchDraft(scope, sourceValue.runId, {
      expected_revision: 1, expected_source_fingerprint: releaseCandidateSourceFingerprint(sourceValue), known_limitations: "Updated limitation.", proposed_use_restrictions: "Paper-only research use.",
    });

    expect(repository.patchDraft).toHaveBeenCalledWith(scope, sourceValue.runId, expect.objectContaining({ expectedRevision: 1, expectedSourceFingerprint: releaseCandidateSourceFingerprint(sourceValue) }));
    expect(result.draft).toMatchObject({ revision: 2, known_limitations: "Updated limitation." });
  });

  it("P21-T08/T13/T14 creates a pack with the actual local rc identity and keeps downstream delivery/approval untouched", async () => {
    const sourceValue = source();
    const draft = persistedDraft({ sourceFingerprint: releaseCandidateSourceFingerprint(sourceValue) });
    const { service, repository } = subject(sourceValue, draft);

    const sealed = await service.seal(scope, sourceValue.runId, {
      draft_id: draftId, expected_draft_revision: 1, expected_source_fingerprint: releaseCandidateSourceFingerprint(sourceValue),
    });

    expect(sealed).toMatchObject({ release_candidate_id: releaseCandidateId, delivery_state: "NOT_DELIVERED", approval_state: "NOT_APPROVED" });
    const built = repository.seal.mock.calls[0]![3](sourceValue, draft, releaseCandidateId);
    expect(built.frozenCore.fields).toEqual(expect.arrayContaining([expect.objectContaining({ key: "release_candidate_id", value: releaseCandidateId })]));
    expect(built.frozenCore.fields.every((item: { value: string | null }) => item.value !== null)).toBe(true);
    expect(built.frozenCore).not.toHaveProperty("delivery_state");
    expect(built.frozenCore).not.toHaveProperty("approval_state");
    expect(repository).not.toHaveProperty("publish");
    expect(repository).not.toHaveProperty("optimizer");
  });

  it("P21-T10 blocks a primary/child-like run instead of relabelling it as a final audit", async () => {
    const primary = source({ runKind: "PRIMARY", relationshipKind: "ROOT" });
    const result = await subject(primary, persistedDraft({ sourceFingerprint: releaseCandidateSourceFingerprint(primary) })).service.detail(scope, primary.runId);
    expect(result.pack.find((item) => item.key === "FINAL_AUDIT_REPLAY")).toMatchObject({ status: "MISSING", availability: { reason_code: "P21_FINAL_AUDIT_RUN_NOT_PUBLISHED" } });
    expect(result.actions.may_seal).toBe(false);

    const mismatchedTarget = source({ targetSelectionId: "sel-other" });
    const mismatched = await subject(mismatchedTarget, persistedDraft({ sourceFingerprint: releaseCandidateSourceFingerprint(mismatchedTarget) })).service.detail(scope, mismatchedTarget.runId);
    expect(mismatched.pack.find((item) => item.key === "FINAL_AUDIT_REPLAY")).toMatchObject({ status: "MISSING", availability: { reason_code: "P21_FINAL_AUDIT_RUN_NOT_PUBLISHED" } });
    expect(mismatched.actions.may_seal).toBe(false);
  });

  /*
   * W5c · found on the preview's real WFO run. `run_producers.manifest_digest`
   * is the preflight (dataset/spec) manifest; `current_source_seals_v1.
   * manifest_digest` is the sealed P05 artifact's own manifest. They are two
   * identities, so their inequality is not an integrity failure. The retained
   * artifact stays pinned through its CURRENT_SOURCE import digest.
   */
  it("W5c keeps the retained artifact manifest apart from the preflight manifest", async () => {
    const wfo = source({ currentSource: { ...source().currentSource, manifestDigest: digest("retained-artifact-manifest") } });
    const draft = persistedDraft({ sourceFingerprint: releaseCandidateSourceFingerprint(wfo) });
    const result = await subject(wfo, draft).service.detail(scope, wfo.runId);
    expect(result.availability).toEqual({ state: "AVAILABLE", reason_code: null });
    expect(result.fields.find((item) => item.key === "manifest_digest")).toMatchObject({ value: digest("c"), availability: { state: "AVAILABLE" } });
    expect(result.actions).toMatchObject({ may_seal: true, seal_blocked_reason: null });

    /* A report that disagrees with the preflight manifest is still a mismatch. */
    const mismatched = source({ report: { ...source().report, frozenCore: reportCore({ source_digests: { ...reportCore().source_digests, manifest_digest: digest("other") } }) } });
    const mismatchedResult = await subject(mismatched, persistedDraft({ sourceFingerprint: releaseCandidateSourceFingerprint(mismatched) })).service.detail(scope, mismatched.runId);
    expect(mismatchedResult.availability).toEqual({ state: "PARTIAL", reason_code: "P21_REFERENCED_SOURCE_INTEGRITY_FAILED" });

    /* A malformed retained manifest is an integrity failure, never an absence. */
    const malformed = source({ currentSource: { ...source().currentSource, manifestDigest: "not-a-digest" } });
    const malformedResult = await subject(malformed, persistedDraft({ sourceFingerprint: releaseCandidateSourceFingerprint(malformed) })).service.detail(scope, malformed.runId);
    expect(malformedResult.actions).toMatchObject({ may_seal: false, seal_blocked_reason: "P21_REFERENCED_SOURCE_INTEGRITY_FAILED" });
  });

  /* W5c · each evidence row names a screen this build serves (no `/replay`, no `/research/alphas/…`). */
  it("W5c links every evidence row to a served Research screen", async () => {
    const sourceValue = source();
    const result = await subject(sourceValue, persistedDraft({ sourceFingerprint: releaseCandidateSourceFingerprint(sourceValue) })).service.detail(scope, sourceValue.runId);
    const run = "/research/quantbt/runs/run-p21-audit";
    expect(Object.fromEntries(result.pack.map((item) => [item.key, item.source.href]))).toEqual({
      ALPHA_VERSION_PASSPORT: null,
      ENGINE_CAPABILITY_BACKEND: "/research/quantbt/atlas",
      DATASET_UNIVERSE_SNAPSHOTS: `${run}/split`,
      METHODOLOGY_CLAIM: `${run}/evidence`,
      SELECTED_PARAMS_LINEAGE: `${run}/search`,
      FINAL_AUDIT_REPLAY: `${run}/execute`,
      METRICS_SEMANTICS: `${run}/report`,
      EXECUTION_ASSUMPTIONS: `${run}/split`,
      ROBUSTNESS_PARAM_STABILITY_REGIME: "/research/quantbt/alphas/alpha-p21/compare",
      KNOWN_LIMITATIONS_WAIVERS: null,
      REPRODUCIBILITY_PARITY_CHECKSUMS: `${run}/freeze`,
      PROPOSED_USE_RESTRICTIONS: null,
    });
  });

  it("fails closed while the separately admitted P21 feature is dark", async () => {
    const sourceValue = source();
    const { repository } = subject(sourceValue, persistedDraft({ sourceFingerprint: releaseCandidateSourceFingerprint(sourceValue) }));
    const service = new ResearchReleaseCandidateService(repository as never, { FEATURE_RESEARCH_RELEASE_CANDIDATES: "false" } as never);
    await expect(service.detail(scope, sourceValue.runId)).rejects.toMatchObject({ code: "RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE", status: 503 });
    expect(repository.snapshot).not.toHaveBeenCalled();
  });
});
