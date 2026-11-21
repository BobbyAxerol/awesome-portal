import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { HttpErrorFilter } from "../src/http-error.filter";
import { AuthError } from "../src/auth/auth.service";
import { ResearchReleaseCandidateError } from "../src/research/release-candidate.error";
import {
  ResearchReleaseCandidateComposeResponseSchema,
  ResearchReleaseCandidatePackResponseSchema,
  ResearchReleaseCandidateSealResponseSchema,
} from "../src/research/release-candidate.contract";
import { openApiValidator } from "./research-rf05-openapi";
import { canonicalResearchJson } from "../src/research/preflight.service";
import { ResearchReleaseCandidateService } from "../src/research/release-candidate.service";
import { ResearchReleaseCandidatePublicationService } from "../src/research/release-candidate-publication.service";
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
    wfo: null,
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
    readComposition: vi.fn(),
    snapshot: vi.fn().mockResolvedValue(sourceValue),
    draft: vi.fn().mockResolvedValue(draftValue),
    latestPack: vi.fn().mockResolvedValue(null),
    publicationContext: vi.fn().mockResolvedValue({ current: null, predecessor: null }),
    readPack: vi.fn(),
    patchDraft: vi.fn(),
    seal: vi.fn(async (_scope, _runId, _input, build) => {
      const built = build(sourceValue, draftValue, releaseCandidateId);
      return storedPack({ packDigest: built.packDigest, frozenCore: built.frozenCore, sourceFingerprint: releaseCandidateSourceFingerprint(sourceValue) });
    }),
  };
  repository.readComposition.mockImplementation(async (actor, id) => {
    const current = await repository.snapshot(actor, id);
    if (!current) return null;
    const draft = await repository.draft(actor, id);
    const pack = await repository.latestPack(actor, id);
    const context = await repository.publicationContext(actor, {
      alphaId: current.alpha.alphaId, releaseCandidateId: pack?.releaseCandidateId ?? null,
    });
    return { source: current, draft, latestPack: pack, publicationContext: context };
  });
  const config = { FEATURE_RESEARCH_RELEASE_CANDIDATES: "true" };
  return { service: new ResearchReleaseCandidateService(repository as never, config as never), repository };
}

/** CG-P21-01: canonical service/filter outputs, consumed without FE-authored bodies. */
describe("P21 canonical consumer fixture pack", () => {
  it("uses only the coherent repository composition for a detail GET", async () => {
    const current = source();
    const { service, repository } = subject(current);
    repository.readComposition.mockResolvedValue({ source: current, draft: null, latestPack: null,
      publicationContext: { current: null, predecessor: null } });
    repository.snapshot.mockRejectedValue(new Error("separate snapshot is forbidden"));
    repository.draft.mockRejectedValue(new Error("separate draft is forbidden"));
    repository.latestPack.mockRejectedValue(new Error("separate pack is forbidden"));
    repository.publicationContext.mockRejectedValue(new Error("separate context is forbidden"));
    const result = await service.detail(scope, current.runId);
    expect(result.run_id).toBe(current.runId);
    expect(repository.readComposition).toHaveBeenCalledExactlyOnceWith(scope, current.runId);
    for (const read of [repository.snapshot, repository.draft, repository.latestPack, repository.publicationContext])
      expect(read).not.toHaveBeenCalled();
  });
  const path = resolve(process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts"),
    "fixtures/research-release-candidate.consumer.fixtures.json");

  it("generates and validates compose states, immutable pack, seal/replay and typed refusals", async () => {
    if (process.env.P21_WRITE_FIXTURES === "1") {
      const value = source({ displayLabel: "R-P04-123" });
      const draft = persistedDraft({ sourceFingerprint: releaseCandidateSourceFingerprint(value) });
      const { service, repository } = subject(value, draft);
      const sealInput = { draft_id: draftId, expected_draft_revision: 1,
        expected_source_fingerprint: releaseCandidateSourceFingerprint(value) };
      const seal = await service.seal(scope, value.runId, sealInput);
      const replay = await service.seal(scope, value.runId, sealInput);
      const built = repository.seal.mock.calls[0]![3](value, draft, releaseCandidateId);
      const stored = storedPack({ packDigest: built.packDigest, frozenCore: built.frozenCore,
        sourceFingerprint: releaseCandidateSourceFingerprint(value), displayLabel: value.displayLabel });
      repository.readPack.mockResolvedValue(stored);
      repository.latestPack.mockResolvedValue(stored);
      repository.draft.mockResolvedValue({ ...draft, sealed: true });
      const unbound = source({ alpha: { ...value.alpha, alphaId: null, alphaVersionId: null,
        lifecycleState: null, codeDigest: null, entrypoint: null } });
      const missing = source({ runKind: "PRIMARY", relationshipKind: "ROOT" });
      const partial = source({ currentSource: { ...value.currentSource, manifestDigest: "invalid" } });
      const problems: Array<ResearchReleaseCandidateError | AuthError> = [
        new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_INVALID", "Invalid Release Candidate request.", 400),
        new AuthError("SESSION_REQUIRED", "Invalid session.", 401),
        new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_FORBIDDEN", "Access denied.", 403),
        new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_NOT_FOUND", "Research run was not found.", 404),
        new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_CONFLICT", "Evidence changed since composing; review the pack.", 409),
        new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE", "Release Candidate service is temporarily unavailable.", 503),
      ];
      try {
        await subject(partial, draft).service.seal(scope, partial.runId, sealInput);
        throw new Error("partial evidence unexpectedly sealed");
      } catch (error) {
        if (!(error instanceof ResearchReleaseCandidateError)) throw error;
        problems.push(error);
      }
      const problemBodies = problems.map((error) => {
        let body: unknown;
        const reply = { status: vi.fn().mockReturnThis(), send: vi.fn((value: unknown) => { body = value; }) };
        new HttpErrorFilter().catch(error, { switchToHttp: () => ({ getResponse: () => reply,
          getRequest: () => ({ headers: { "x-request-id": "req_p21_fixture" } }) }) } as never);
        return { status: error.status, body };
      });
      writeFileSync(path, JSON.stringify({
        fixture_authority: "SERVICE_GENERATED_CONTRACT_FIXTURE_NOT_PRODUCT_EVIDENCE",
        compose: {
          degraded_sealable: await subject(value, draft).service.detail(scope, value.runId),
          sealed: await service.detail(scope, value.runId),
          unbound: await subject(unbound, null).service.detail(scope, unbound.runId),
          missing: await subject(missing, null).service.detail(scope, missing.runId),
          partial: await subject(partial, draft).service.detail(scope, partial.runId),
        }, seal, seal_replay: replay, pack: await service.pack(scope, releaseCandidateId), problems: problemBodies,
      }) + "\n");
    }
    const fixture = JSON.parse(readFileSync(path, "utf8"));
    for (const body of Object.values(fixture.compose)) {
      ResearchReleaseCandidateComposeResponseSchema.parse(body);
      openApiValidator("research-release-candidate.openapi.json", "ComposeResponseP21").assert(body);
    }
    for (const body of [fixture.seal, fixture.seal_replay]) {
      ResearchReleaseCandidateSealResponseSchema.parse(body);
      openApiValidator("research-release-candidate.openapi.json", "SealResponse").assert(body);
    }
    ResearchReleaseCandidatePackResponseSchema.parse(fixture.pack);
    openApiValidator("research-release-candidate.openapi.json", "PackResponse").assert(fixture.pack);
    for (const problem of fixture.problems) openApiValidator("research-release-candidate.openapi.json", "Problem").assert(problem.body);
    expect(fixture.seal_replay).toEqual(fixture.seal);
    expect(fixture.compose.unbound.actions.seal_blocked_reason).toBe("P21_SCRATCH_RUN_UNBOUND");
    expect(fixture.compose.missing.pack_counts.missing).toBeGreaterThan(0);
    expect(fixture.compose.partial.actions.may_seal).toBe(false);
    expect(fixture.problems.map((problem: { status: number }) => problem.status)).toContain(422);
  });
});

describe("§31 stale seal: one reason across the two real reader implementations", () => {
  it.each(["R-WFO-022", "R-WFO-023"])("%s retains the seal and recommends a new run, never resealing its draft", async (label) => {
    const original = source({ displayLabel: label });
    const fingerprint = releaseCandidateSourceFingerprint(original);
    const draft = persistedDraft({ sourceFingerprint: fingerprint });
    const x = subject(original, draft);
    const seal = await x.service.seal(scope, original.runId, {
      draft_id: draftId, expected_draft_revision: draft.revision, expected_source_fingerprint: fingerprint,
    });
    const frozen = x.repository.seal.mock.calls[0]![3](original, draft, releaseCandidateId).frozenCore;
    const pack = storedPack({ frozenCore: frozen, packDigest: seal.pack_digest, sourceFingerprint: fingerprint });
    const before = canonicalResearchJson(pack);
    x.repository.latestPack.mockResolvedValue(pack);
    x.repository.readPack.mockResolvedValue(pack);
    x.repository.draft.mockResolvedValue({ ...draft, sealed: true });
    // Fixture reproduction of source/contract drift, not a live preview receipt.
    x.repository.snapshot.mockResolvedValue(source({ ...original, engineReleaseId: "quantbt-next-qualified" }));
    const composer = new ResearchReleaseCandidateService(x.repository as never,
      { FEATURE_RESEARCH_RELEASE_CANDIDATES: "true", FEATURE_RESEARCH_RELEASE_CANDIDATE_PUBLICATION: "true" } as never);
    const intents = { read: vi.fn().mockResolvedValue(null), begin: vi.fn() };
    const governance = { publicationEvidence: vi.fn(), createApproval: vi.fn(), detail: vi.fn() };
    const publisher = new ResearchReleaseCandidatePublicationService(intents as never, x.repository as never,
      composer, governance as never, { FEATURE_RESEARCH_RELEASE_CANDIDATE_PUBLICATION: "true" });
    const composed = await composer.detail(scope, original.runId);
    const published = await publisher.publication(scope, { userId: scope.actorUserId } as never, releaseCandidateId);
    expect(composed.local_seal).toMatchObject({ state: "SEALED_LOCAL", release_candidate_id: releaseCandidateId,
      availability: { state: "PARTIAL", reason_code: "P21_LOCAL_SEAL_REFERENCES_PRIOR_SOURCE_FINGERPRINT" } });
    expect(composed.actions).toMatchObject({ may_edit_draft: false, may_seal: false,
      seal_blocked_reason: "P21_ALREADY_SEALED", publish: { enabled: false,
        blocked_reason: "P22_CURRENT_SOURCE_CHANGED", blocked_action: "CREATE_NEW_RUN_AND_SEAL" } });
    expect(published).toMatchObject({ may_publish: false, blocked_reason: composed.actions.publish.blocked_reason,
      blocked_action: composed.actions.publish.blocked_action, source: { availability: "NOT_CHECKED" } });
    expect(canonicalResearchJson(pack)).toBe(before);
    expect(intents.begin).not.toHaveBeenCalled();
    expect(governance.publicationEvidence).not.toHaveBeenCalled();
    expect(governance.createApproval).not.toHaveBeenCalled();
    openApiValidator("research-release-candidate.openapi.json", "ComposeResponseP21").assert(composed);
    openApiValidator("research-release-candidate-publication.openapi.json", "PublicationResponse").assert(published);
    if (process.env.P31_WRITE_FIXTURES === "1" && label === "R-WFO-022") {
      writeFileSync(resolve(process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts"),
        "fixtures/research-release-candidate.stale-seal.valid.json"),
      JSON.stringify({ schema_version: "research.stale-seal.fixtures.v1", lane: "FIXTURE_ONLY", composed, published }, null, 2) + "\n");
    }
  });
});

describe("P21 Release Candidate composer and local immutable pack", () => {
  it("P21-T01/T03/T11/T12 emits exactly 17 source-built fields and 12 items, accepts a persisted centroid with no trial, and does no compute", async () => {
    const sourceValue = source();
    const draft = persistedDraft({ sourceFingerprint: releaseCandidateSourceFingerprint(sourceValue) });
    const { service, repository } = subject(sourceValue, draft);

    const result = await service.detail(scope, sourceValue.runId);

    expect(result.fields).toHaveLength(17);
    expect(result).toHaveProperty("final_audit_applicable");
    expect(result.yaml).toEqual(result.fields);
    expect(result.pack).toHaveLength(12);
    expect(result.pack.map((item) => item.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(result.pack.find((item) => item.key === "SELECTED_PARAMS_LINEAGE")).toMatchObject({ status: "COMPLETE", note: expect.stringContaining("centroid") });
    expect(result.pack.find((item) => item.key === "ROBUSTNESS_PARAM_STABILITY_REGIME")).toMatchObject({ status: "DEGRADED" });
    expect(result.actions).toMatchObject({ may_seal: true, publish: { enabled: false, blocked_reason: "P22_LOCAL_SEAL_REQUIRED" } });
    expect(result.published_comparison).toEqual({
      last_release_candidate_id: null,
      availability: { state: "NOT_PUBLISHED", reason_code: "P22_NO_PUBLISHED_PREDECESSOR" },
    });
    expect(result.source_absences.approval_mirror).toEqual({ state: "NOT_PUBLISHED", reason_code: "P22_LOCAL_SEAL_REQUIRED" });
    expect(result.selected_params).toEqual({
      param_set_id: null, param_set_id_availability: { state: "NOT_PUBLISHED", reason_code: "P21_PARAM_SET_ID_NOT_PUBLISHED" },
      selected_trial_number: null, selected_trial_number_availability: { state: "NOT_APPLICABLE", reason_code: "P21_TRIAL_ORDINAL_NOT_APPLICABLE" },
      selected_trial_number_scope: null, selected_trial_source_id: null, selected_trial_study_id: null,
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
    expect(Object.fromEntries(built.frozenCore.pack.filter((item: { n: number }) => [1, 10, 12].includes(item.n))
      .map((item: { n: number; source: { href: string | null } }) => [item.n, item.source.href]))).toEqual({
      1: "/research/quantbt/alphas/alpha-p21/lineage?av=av-p21",
      10: "/research/quantbt/runs/run-p21-audit/release-candidate",
      12: "/research/quantbt/runs/run-p21-audit/release-candidate",
    });
    expect(repository).not.toHaveProperty("publish");
    expect(repository).not.toHaveProperty("optimizer");
  });

  it("B8 R-6 freezes only the caller's sealed draft, including when its source fingerprint changes", async () => {
    const original = source();
    const fingerprint = releaseCandidateSourceFingerprint(original);
    const frozenDraft = persistedDraft({ sourceFingerprint: fingerprint, sealed: true });
    const immutablePack = storedPack({ sourceFingerprint: fingerprint });
    const { service, repository } = subject(original, frozenDraft);
    repository.latestPack.mockResolvedValue(immutablePack);

    for (const current of [original, source({ effectiveSpecDigest: digest("changed source") })]) {
      repository.snapshot.mockResolvedValue(current);
      const result = await service.detail(scope, current.runId);
      expect(result.actions).toMatchObject({
        may_edit_draft: false, may_seal: false, seal_blocked_reason: "P21_ALREADY_SEALED",
      });
      expect(result.local_seal).toMatchObject({ state: "SEALED_LOCAL", release_candidate_id: releaseCandidateId });
      expect(result.local_seal.availability.state).toBe(current === original ? "AVAILABLE" : "PARTIAL");
      expect(result.gate_verdict.title).toBe("local evidence pack already sealed");
      expect(result.gate_verdict.body).toContain(current === original ? "immutable local pack is retained" : "original source fingerprint");
      expect(result.gate_verdict.body).not.toContain("local seal blocked");
      expect(result.draft).toMatchObject({ known_limitations: frozenDraft.knownLimitations,
        proposed_use_restrictions: frozenDraft.proposedUseRestrictions });
    }

    // The newest pack is workspace-visible, not a lock on a peer's local draft.
    repository.snapshot.mockResolvedValue(original);
    repository.draft.mockResolvedValue(persistedDraft({ draftId: `rcd_${"2".repeat(26)}`,
      sourceFingerprint: fingerprint, sealed: false }));
    const peer = await service.detail({ ...scope, actorUserId: "usr-p21-peer" }, original.runId);
    expect(peer.local_seal.release_candidate_id).toBe(releaseCandidateId);
    expect(peer.actions).toMatchObject({ may_edit_draft: true, may_seal: true, seal_blocked_reason: null });
    expect(repository.seal).not.toHaveBeenCalled();
    expect(repository.patchDraft).not.toHaveBeenCalled();
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
      ALPHA_VERSION_PASSPORT: "/research/quantbt/alphas/alpha-p21/lineage?av=av-p21",
      ENGINE_CAPABILITY_BACKEND: "/research/quantbt/atlas",
      DATASET_UNIVERSE_SNAPSHOTS: `${run}/split`,
      METHODOLOGY_CLAIM: `${run}/evidence`,
      SELECTED_PARAMS_LINEAGE: `${run}/search`,
      FINAL_AUDIT_REPLAY: `${run}/execute`,
      METRICS_SEMANTICS: `${run}/report`,
      EXECUTION_ASSUMPTIONS: `${run}/split`,
      ROBUSTNESS_PARAM_STABILITY_REGIME: "/research/quantbt/alphas/alpha-p21/compare",
      KNOWN_LIMITATIONS_WAIVERS: `${run}/release-candidate`,
      REPRODUCIBILITY_PARITY_CHECKSUMS: `${run}/freeze`,
      PROPOSED_USE_RESTRICTIONS: `${run}/release-candidate`,
    });
  });

  it("adds RC source links without rewriting any previously stored frozen pack or digest", async () => {
    const value = source();
    const draft = persistedDraft({ sourceFingerprint: releaseCandidateSourceFingerprint(value) });
    const { service, repository } = subject(value, draft);
    const composition = await service.detail(scope, value.runId);
    const historicalCore = { fields: composition.fields,
      pack: composition.pack.map(item => [1, 10, 12].includes(item.n)
        ? { ...item, source: { ...item.source, href: null, ...(item.n === 1 ? { label: "Alpha 360°" } : {}) } } : item),
      source_fingerprint: releaseCandidateSourceFingerprint(value),
      draft: { known_limitations: draft.knownLimitations, proposed_use_restrictions: draft.proposedUseRestrictions } };
    const historical = storedPack({ frozenCore: historicalCore, packDigest: reportDigest(historicalCore),
      sourceFingerprint: releaseCandidateSourceFingerprint(value) });
    const bytes = JSON.stringify(historical.frozenCore);
    repository.readPack.mockResolvedValue(historical);
    repository.latestPack.mockResolvedValue(historical);
    const freshComposition = await service.detail(scope, value.runId);
    expect(freshComposition.pack[0]!.source.href).toBe("/research/quantbt/alphas/alpha-p21/lineage?av=av-p21");
    const frozen = await service.pack(scope, releaseCandidateId);
    expect(JSON.stringify(frozen.frozen_core)).toBe(bytes);
    expect(frozen.pack_digest).toBe(historical.packDigest);
    expect(JSON.stringify(historical.frozenCore)).toBe(bytes);
    expect(repository.seal).not.toHaveBeenCalled();
    expect(repository.patchDraft).not.toHaveBeenCalled();
    const unbound = source({ alpha: { ...value.alpha, alphaVersionId: null } });
    expect((await subject(unbound).service.detail(scope, unbound.runId)).pack[0]!.source.href).toBeNull();
  });

  it("B2 prints what P22 recorded: publish affordance, approval-mirror absence and intake flag", async () => {
    const sourceValue = source();
    const fingerprint = releaseCandidateSourceFingerprint(sourceValue);
    const draft = persistedDraft({ sourceFingerprint: fingerprint });
    const sealedPack = storedPack({ sourceFingerprint: fingerprint });
    const cases: Array<[string, Record<string, unknown>, ReturnType<typeof storedPack> | null, { current: unknown; predecessor: null }, unknown, unknown]> = [
      ["unsealed", {}, null, { current: null, predecessor: null },
        { enabled: false, blocked_reason: "P22_LOCAL_SEAL_REQUIRED" }, { state: "NOT_PUBLISHED", reason_code: "P22_LOCAL_SEAL_REQUIRED" }],
      ["sealed, intake dark", {}, sealedPack, { current: null, predecessor: null },
        { enabled: false, blocked_reason: "P22_PUBLICATION_INTAKE_DISABLED" }, { state: "NOT_PUBLISHED", reason_code: "P22_NOT_PUBLISHED" }],
      ["sealed, intake open", { FEATURE_RESEARCH_RELEASE_CANDIDATE_PUBLICATION: "true" }, sealedPack, { current: null, predecessor: null },
        { enabled: true, blocked_reason: null }, { state: "NOT_PUBLISHED", reason_code: "P22_NOT_PUBLISHED" }],
      ["unknown outcome reconciles with intake dark", {}, sealedPack, { current: { releaseCandidateId, state: "UNKNOWN" }, predecessor: null },
        { enabled: true, blocked_reason: null }, { state: "NOT_PUBLISHED", reason_code: "P22_PUBLICATION_OUTCOME_UNKNOWN" }],
      ["pending", {}, sealedPack, { current: { releaseCandidateId, state: "PENDING" }, predecessor: null },
        { enabled: true, blocked_reason: null }, { state: "NOT_PUBLISHED", reason_code: "P22_PUBLICATION_PENDING" }],
      ["refused", { FEATURE_RESEARCH_RELEASE_CANDIDATE_PUBLICATION: "true" }, sealedPack, { current: { releaseCandidateId, state: "REFUSED" }, predecessor: null },
        { enabled: false, blocked_reason: "P22_PUBLICATION_REFUSED" }, { state: "NOT_PUBLISHED", reason_code: "P22_PUBLICATION_REFUSED" }],
      ["delivered", { FEATURE_RESEARCH_RELEASE_CANDIDATE_PUBLICATION: "true" }, storedPack({ sourceFingerprint: fingerprint, deliveryState: "DELIVERED", approvalState: "PENDING" }),
        { current: { releaseCandidateId, state: "DELIVERED" }, predecessor: null },
        { enabled: false, blocked_reason: "P22_ALREADY_DELIVERED" }, { state: "NOT_APPLICABLE", reason_code: "P22_MIRROR_READ_ON_PUBLICATION_ROUTE" }],
      ["another rc's intent is not this candidate's", {}, sealedPack, { current: { releaseCandidateId: `rc_${"9".repeat(26)}`, state: "DELIVERED" }, predecessor: null },
        { enabled: false, blocked_reason: "P22_PUBLICATION_INTAKE_DISABLED" }, { state: "NOT_PUBLISHED", reason_code: "P22_NOT_PUBLISHED" }],
    ];
    for (const [label, flags, pack, context, publish, mirror] of cases) {
      const { repository } = subject(sourceValue, draft);
      repository.latestPack.mockResolvedValue(pack);
      repository.publicationContext.mockResolvedValue(context);
      const service = new ResearchReleaseCandidateService(repository as never, { FEATURE_RESEARCH_RELEASE_CANDIDATES: "true", ...flags } as never);
      const result = await service.detail(scope, sourceValue.runId);
      const expectedAction = ({ P22_LOCAL_SEAL_REQUIRED: "SEAL_CANDIDATE",
        P22_PUBLICATION_INTAKE_DISABLED: "WAIT" } as Record<string, string>)[
          (publish as { blocked_reason: string | null }).blocked_reason ?? ""] ?? "NONE";
      expect(result.actions.publish, label).toEqual({ ...(publish as object), blocked_action: expectedAction });
      expect(result.source_absences.approval_mirror, label).toEqual(mirror);
      expect(repository.publicationContext, label).toHaveBeenCalledWith(scope, {
        alphaId: "alpha-p21", releaseCandidateId: pack?.releaseCandidateId ?? null,
      });
    }
  });

  it("B2 compares by digest with the last published candidate of the same Alpha", async () => {
    const sourceValue = source();
    const draft = persistedDraft({ sourceFingerprint: releaseCandidateSourceFingerprint(sourceValue) });
    const baseline = await subject(sourceValue, draft).service.detail(scope, sourceValue.runId);
    const value = (key: string) => baseline.fields.find((field) => field.key === key)!.value;
    const previous = `rc_${"2".repeat(26)}`;
    const same = {
      alpha_code_digest: value("alpha_code_digest"), alpha_entrypoint: value("alpha_entrypoint"),
      parameter_bundle_digest: value("parameter_bundle_digest"), dataset_binding_digest: value("dataset_binding_digest"),
    };
    const run = async (fields: Record<string, string | null>) => {
      const { service, repository } = subject(sourceValue, draft);
      repository.publicationContext.mockResolvedValue({
        current: null, predecessor: { releaseCandidateId: previous, alphaVersionId: "av-p20", publishedAtUtcMs: 1_789_000_000_000, fields },
      });
      return service.detail(scope, sourceValue.runId);
    };

    const unchanged = await run(same);
    expect(unchanged.published_comparison).toEqual({ last_release_candidate_id: previous, availability: { state: "AVAILABLE", reason_code: null } });
    expect(unchanged.taxonomy.map((row) => row.state)).toEqual(["UNCHANGED", "UNCHANGED", "UNCHANGED", "UNSET"]);
    expect(unchanged.gate_verdict).toEqual(baseline.gate_verdict);

    const changed = await run({ ...same, parameter_bundle_digest: "f".repeat(64) });
    expect(changed.taxonomy.map((row) => row.state)).toEqual(["UNCHANGED", "CHANGED", "UNCHANGED", "UNSET"]);
    expect(changed.taxonomy[1]!.consequence).toBe("R1 + R2 re-run — numerical artifact changed");
    expect(changed.gate_verdict.title).toBe("R1 + R2 must run — selected params changed");
    expect(changed.gate_verdict.body).toContain(previous);

    const unpinned = await run({ ...same, dataset_binding_digest: null });
    expect(unpinned.taxonomy[2]).toMatchObject({ state: "UNSET" });
    expect(unpinned.gate_verdict).toEqual(baseline.gate_verdict);
  });

  it("publishes a read-only run label without changing the source fingerprint", async () => {
    const sourceValue = source({ displayLabel: "R-WFO-118" });
    const response = await subject(sourceValue).service.detail(scope, sourceValue.runId);
    expect(response.display_label).toBe("R-WFO-118");
  });

  it("fails closed while the separately admitted P21 feature is dark", async () => {
    const sourceValue = source();
    const { repository } = subject(sourceValue, persistedDraft({ sourceFingerprint: releaseCandidateSourceFingerprint(sourceValue) }));
    const service = new ResearchReleaseCandidateService(repository as never, { FEATURE_RESEARCH_RELEASE_CANDIDATES: "false" } as never);
    await expect(service.detail(scope, sourceValue.runId)).rejects.toMatchObject({ code: "RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE", status: 503 });
    expect(repository.snapshot).not.toHaveBeenCalled();
  });
});
