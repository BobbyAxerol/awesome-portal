/**
 * W7 · P21 retained (Delta WFO) lane, built from the real retained rows.
 *
 * The source below is the preview's sealed Delta signal-notional WFO run
 * (rrun_e1fa9e5c…): every identity is what the preview served read-only
 * (research-w7-real-wfo-preview.fixture.json.gz), and the seal's summary and
 * FOLD rows are the W5b real-HMD export — with this run's seal digests they
 * reproduce its served rs02 revision byte-for-byte (asserted first), so they
 * are this run's retained rows. Before W7 the composer answered 7 MISSING rows
 * and P21_REFERENCED_SOURCE_INTEGRITY_FAILED for it (compose_before).
 *
 * Two facts the preview does not serve are stand-ins and say so: the P05
 * artifact id (the run has exactly one SEALED research_bundle, per its
 * progress read) and the run's kind (the WFO lane does not read it).
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

import { DELTA_WFO_PROFILE_DIGEST, DELTA_WFO_PROFILE_ID } from "../src/research/delta-wfo.profile";
import { DELTA_WFO_V2_PROFILE_DIGEST, DELTA_WFO_V2_PROFILE_ID } from "../src/research/delta-wfo-v2.profile";
import { canonicalResearchJson } from "../src/research/preflight.service";
import { ResearchReleaseCandidateComposeResponseSchema } from "../src/research/release-candidate.contract";
import {
  releaseCandidateSourceFingerprint,
  type ReleaseCandidateDraft,
  type ReleaseCandidateRetainedLane,
  type ReleaseCandidateSource,
} from "../src/research/release-candidate.repository";
import { retainedLaneFacts } from "../src/research/release-candidate.retained-lane";
import { ResearchReleaseCandidateService } from "../src/research/release-candidate.service";
import { openApiValidator } from "./research-rf05-openapi";

type Json = Record<string, any>;
const gz = (name: string) => JSON.parse(gunzipSync(readFileSync(join(__dirname, name))).toString("utf8")) as Json;
const preview = gz("research-w7-real-wfo-preview.fixture.json.gz");
const w5b = gz("research-w5b-real-replay.fixture.json.gz");
const sha = (value: unknown) => createHash("sha256").update(canonicalResearchJson(value), "utf8").digest("hex");
const scope = { workspaceId: "ws-w7", actorUserId: "usr-w7" };
const draftId = "rcd_" + "0".repeat(26);
const releaseCandidateId = "rc_" + "2".repeat(26);
const before = preview.compose_before;
const field = (key: string) => (before.fields as Json[]).find((item) => item.key === key)!.value as string;
const provenance = preview.evidence.provenance;
// The report serves the digests of the single-part tables; the six observation parts are pinned by the manifest only.
const partDigests = (preview.report.frozen_core.artifacts as Json[]).filter((item) => item.state === "SEALED" && item.filename !== null).map((item) => item.digest as string);

function lane(overrides: Partial<ReleaseCandidateRetainedLane> = {}): ReleaseCandidateRetainedLane {
  return {
    executionProfileId: DELTA_WFO_PROFILE_ID,
    executionProfileDigest: DELTA_WFO_PROFILE_DIGEST,
    producerDatasetBindingDigest: preview.p16_provenance.dataset_binding_digest,
    seal: {
      artifactRevision: 1,
      sourceAdapterId: provenance.source_adapter_id,
      profileId: provenance.profile_id,
      manifestDigest: provenance.source_manifest_digest,
      sourceTransformDigest: provenance.source_transform_digest,
      retainedImportDigest: provenance.retained_import_digest,
      requestedSpecDigest: provenance.requested_spec_digest,
      effectiveSpecDigest: provenance.effective_spec_digest,
      datasetBindingDigest: provenance.dataset_binding_digest,
      tableRows: w5b.table_rows,
      totalRows: Object.values(w5b.table_rows as Record<string, number>).reduce((sum, count) => sum + count, 0),
      summary: w5b.summary,
    },
    sealedArtifactId: "rart_w7_preview_research_bundle",
    partDigests,
    observedImportDigest: preview.freeze.integrity.observed_retained_import_digest,
    folds: (w5b.rows.FOLD as Json[]).map((row) => ({ sourceOrdinal: row.sourceOrdinal, sourceId: row.sourceId, payload: row.payload })),
    claimState: preview.progress.claim.state,
    handoffParamsDigest: preview.progress.claim.handoff_cursor.params_digest,
    ...overrides,
  };
}

function source(overrides: Partial<ReleaseCandidateSource> = {}, laneOverrides: Partial<ReleaseCandidateRetainedLane> = {}): ReleaseCandidateSource {
  const value: ReleaseCandidateSource = {
    runId: preview.run_id,
    attemptId: before.run.attempt,
    runState: "READY",
    runKind: "PRIMARY",
    relationshipKind: "ROOT",
    targetSelectionId: null,
    requestSpecDigest: field("requested_spec_digest"),
    effectiveSpecDigest: field("effective_spec_digest"),
    datasetBindingDigest: field("dataset_binding_digest"),
    engineReleaseId: field("engine_release_id"),
    artifactRevision: 1,
    alpha: {
      alphaId: field("alpha_id"), name: before.rail[0].detail, alphaVersionId: field("alpha_version_id"),
      codeDigest: field("alpha_code_digest"), entrypoint: field("alpha_entrypoint"), lifecycleState: "ACTIVE",
      declaredContract: { execution: { execution_route: "signal_notional" } },
    },
    // The preflight manifest (P16 provenance) is a different identity from the retained manifest.
    producer: { adapterContractDigest: field("adapter_contract_digest"), manifestDigest: preview.p16_provenance.manifest_digest, sourceTransformDigest: null },
    selection: { selectionId: null, selectedTrialId: null, parameterBundleDigest: null, sourceDigest: null, targetKind: null },
    report: {
      reportRevision: preview.report.report_revision, frozenCoreDigest: sha(preview.report.frozen_core),
      frozenCore: preview.report.frozen_core, sealedAtUtcMs: 1_790_370_627_112,
    },
    evidence: { revision: null, sourceEvidenceDigest: null, projectionDigest: null, readiness: null, projection: null },
    methodology: { claimText: preview.progress.claim.text, certificateState: preview.progress.claim.methodology_certificate.state, certificateGrade: null, certificateIssuedAtUtcMs: null },
    split: { revision: null, sourceSplitDigest: null, projectionDigest: null, readiness: null, projection: null },
    currentSource: {
      artifactRevision: 1, manifestDigest: provenance.source_manifest_digest,
      sourceTransformDigest: provenance.source_transform_digest, retainedImportDigest: provenance.retained_import_digest,
    },
    artifacts: [{ artifactId: "rart_w7_preview_research_bundle", manifestDigest: provenance.source_manifest_digest, state: "SEALED", artifactRevision: 1 }],
    asOfUtcMs: 1_790_371_782_762,
    wfo: lane(laneOverrides),
  };
  const output = { ...value, ...overrides };
  output.report = { ...output.report, frozenCoreDigest: output.report.frozenCore === null ? null : sha(output.report.frozenCore) };
  return output;
}

function draft(value: ReleaseCandidateSource, declared = true): ReleaseCandidateDraft {
  return {
    draftId, revision: 1, sourceFingerprint: releaseCandidateSourceFingerprint(value),
    knownLimitations: declared ? "Selection saw the outer test windows (QuantBT oos_used_for_selection); no untouched holdout." : null,
    proposedUseRestrictions: declared ? "Research and Paper evaluation only; no capital." : null,
    updatedAtUtcMs: 1_790_371_800_000,
  };
}

function subject(value: ReleaseCandidateSource, draftValue: ReleaseCandidateDraft | null) {
  const repository = {
    snapshot: vi.fn().mockResolvedValue(value),
    draft: vi.fn().mockResolvedValue(draftValue),
    latestPack: vi.fn().mockResolvedValue(null),
    publicationContext: vi.fn().mockResolvedValue({ current: null, predecessor: null }),
    readPack: vi.fn(), patchDraft: vi.fn(), seal: vi.fn(),
  };
  return { repository, service: new ResearchReleaseCandidateService(repository as never, { FEATURE_RESEARCH_RELEASE_CANDIDATES: "true" } as never) };
}

const rows = (compose: Json) => Object.fromEntries((compose.pack as Json[]).map((item) => [item.key, [item.status, item.availability.reason_code]]));
const composeValidator = openApiValidator("research-release-candidate.openapi.json", "ComposeResponseP21");

describe("W7 · P21 retained lane on the real Delta WFO run", () => {
  it("resolves v2 by its own immutable digest and preserves the retained audit target", async () => {
    const value = source({}, {executionProfileId: DELTA_WFO_V2_PROFILE_ID, executionProfileDigest: DELTA_WFO_V2_PROFILE_DIGEST});
    const facts = retainedLaneFacts(value.wfo!);
    expect(facts.laneConsistent).toBe(true);
    expect(facts.ordering!.frozen_candidate).toEqual(preview.freeze.fold_ordering.frozen_candidate);
    const composed = await subject(value, draft(value)).service.detail(scope, value.runId);
    expect(composed.availability.state).toBe("AVAILABLE");
    expect(composed.pack.find(item => item.key === "FINAL_AUDIT_REPLAY")?.status).toBe("COMPLETE");
  });
  it("the W5b seal rows with this run's digests reproduce the revisions the preview served", () => {
    const facts = retainedLaneFacts(lane());
    expect(facts.evidenceRevision).toBe(preview.evidence.revision);
    expect(facts.splitRevision).toBe(preview.split.revision);
    expect(facts.searchRevision).toBe(preview.search.revision);
    expect(preview.report.frozen_core.source_revisions.evidence_revision).toBe(preview.evidence.revision);
    // The child audit read here is the one Screen 07 served: 2/2 folds MATCH the frozen θ*.
    expect(facts.ordering!.frozen_candidate).toEqual(preview.freeze.fold_ordering.frozen_candidate);
    expect(facts.ordering!.folds.map((fold) => fold.oos_generation_child)).toEqual(preview.freeze.fold_ordering.folds.map((fold: Json) => fold.oos_generation_child));
    // The retained selection's P14-rule digest is the run's hand-off cursor digest.
    expect(facts.parameterDigest).toBe(preview.progress.claim.handoff_cursor.params_digest);
    expect(facts.selection!.parameters).toEqual(preview.search.selection.parameters);
    // A historical profile that cannot be resolved must not borrow current kinds.
    const unknown = retainedLaneFacts(lane({ executionProfileDigest: "0".repeat(64) }));
    expect(unknown.ordering!.frozen_candidate.candidate_id).toBeNull();
    expect(unknown.laneConsistent).toBe(false);
  });

  it("binds all seven formerly MISSING rows to retained facts; only the uncertified claim and robustness stay DEGRADED", async () => {
    expect(before.pack_counts).toEqual({ complete: 3, degraded: 0, input: 2, missing: 7 });
    expect(before.actions.seal_blocked_reason).toBe("P21_REFERENCED_SOURCE_INTEGRITY_FAILED");
    const value = source();
    const composed = await subject(value, null).service.detail(scope, value.runId);
    composeValidator.assert(composed);
    expect(composed.availability).toEqual({ state: "AVAILABLE", reason_code: null });
    expect(rows(composed)).toEqual({
      ALPHA_VERSION_PASSPORT: ["COMPLETE", null],
      ENGINE_CAPABILITY_BACKEND: ["COMPLETE", null],
      DATASET_UNIVERSE_SNAPSHOTS: ["COMPLETE", null],
      METHODOLOGY_CLAIM: ["DEGRADED", "P21_METHODOLOGY_CERTIFICATE_NOT_ISSUED"],
      SELECTED_PARAMS_LINEAGE: ["COMPLETE", null],
      FINAL_AUDIT_REPLAY: ["COMPLETE", null],
      METRICS_SEMANTICS: ["COMPLETE", null],
      EXECUTION_ASSUMPTIONS: ["COMPLETE", null],
      ROBUSTNESS_PARAM_STABILITY_REGIME: ["DEGRADED", "P21_SOURCE_DEGRADED_EVIDENCE"],
      KNOWN_LIMITATIONS_WAIVERS: ["INPUT", "P21_RESEARCHER_DECLARATION_REQUIRED"],
      REPRODUCIBILITY_PARITY_CHECKSUMS: ["COMPLETE", null],
      PROPOSED_USE_RESTRICTIONS: ["INPUT", "P21_RESEARCHER_DECLARATION_REQUIRED"],
    });
    expect(composed.pack_counts).toEqual({ complete: 8, degraded: 2, input: 2, missing: 0 });
    const digests = Object.fromEntries(composed.pack.map((item) => [item.key, item.digest]));
    expect(digests.DATASET_UNIVERSE_SNAPSHOTS).toBe(provenance.dataset_binding_digest);
    expect(digests.SELECTED_PARAMS_LINEAGE).toBe(preview.progress.claim.handoff_cursor.params_digest);
    expect(digests.METRICS_SEMANTICS).toBe(preview.report.report_revision.slice("p18r1_".length));
    expect(digests.REPRODUCIBILITY_PARITY_CHECKSUMS).toBe(provenance.retained_import_digest);
    expect(digests.ROBUSTNESS_PARAM_STABILITY_REGIME).toBe(preview.evidence.revision.slice("rs02_evidence_".length));
    const fields = Object.fromEntries(composed.fields.map((item) => [item.key, item.value]));
    expect(fields).toMatchObject({
      final_audit_run_id: preview.run_id,
      final_audit_attempt_id: before.run.attempt,
      dataset_binding_digest: provenance.dataset_binding_digest,
      manifest_digest: provenance.source_manifest_digest,
      source_transform_digest: provenance.source_transform_digest,
      parameter_bundle_digest: preview.progress.claim.handoff_cursor.params_digest,
      evidence_revision: preview.evidence.revision,
      report_revision: preview.report.report_revision,
    });
    expect(fields.manifest_digest).not.toBe(preview.p16_provenance.manifest_digest);
    expect(composed.fields.filter((item) => item.value === null).map((item) => item.key)).toEqual(["release_candidate_id"]);
    // Truthful: no methodology certificate is claimed; the claim ceiling is quoted.
    expect(composed.certification_axes.methodology_claim).toEqual({ value: null, availability: { state: "NOT_PUBLISHED", reason_code: "P21_METHODOLOGY_CERTIFICATION_NOT_PUBLISHED" } });
    expect(composed.pack[3]!.note).toMatch(/walk_forward_oos.*NOT_ISSUED/);
    expect(composed.rail[3]).toMatchObject({ value: preview.progress.claim.handoff_cursor.params_digest, detail: "retained trial 0 · global", tone: "ink" });
    expect(composed.selected_params).toEqual({
      param_set_id: null, param_set_id_availability: { state: "NOT_PUBLISHED", reason_code: "P21_PARAM_SET_ID_NOT_PUBLISHED" },
      selected_trial_number: 1, selected_trial_number_availability: { state: "AVAILABLE", reason_code: null },
    });
    expect(composed.actions).toMatchObject({ may_seal: false, seal_blocked_reason: "P21_RESEARCHER_DECLARATIONS_REQUIRED", publish: { enabled: false, blocked_reason: "P22_LOCAL_SEAL_REQUIRED" } });
    expect(composed.gate_verdict.title).toBe("local seal blocked — review evidence");
  });

  it("is locally sealable once both declarations are saved: SEALED_LOCAL · NOT_DELIVERED · NOT_APPROVED, pinned to retained revisions", async () => {
    const value = source();
    const declared = draft(value);
    const { service, repository } = subject(value, declared);
    const composed = await service.detail(scope, value.runId);
    expect(composed.actions).toMatchObject({ may_seal: true, seal_blocked_reason: null });
    expect(composed.gate_verdict.title).toBe("local seal ready — downstream publish remains P22");
    let built: Json = {};
    repository.seal.mockImplementation(async (_scope: unknown, _run: unknown, _input: unknown, build: (s: unknown, d: unknown, id: string) => Json) => {
      built = build(value, declared, releaseCandidateId);
      return {
        releaseCandidateId, runId: value.runId, packDigest: built.packDigest, sourceFingerprint: releaseCandidateSourceFingerprint(value),
        frozenCore: built.frozenCore, sealedAtUtcMs: 1_790_371_900_000, deliveryState: "NOT_DELIVERED", approvalState: "NOT_APPROVED",
      };
    });
    const sealed = await service.seal(scope, value.runId, { draft_id: draftId, expected_draft_revision: 1, expected_source_fingerprint: releaseCandidateSourceFingerprint(value) });
    expect(sealed).toMatchObject({ release_candidate_id: releaseCandidateId, delivery_state: "NOT_DELIVERED", approval_state: "NOT_APPROVED" });
    expect(built.frozenCore.fields.every((item: Json) => item.value !== null)).toBe(true);
    expect(built.frozenCore.pack.filter((item: Json) => item.status === "MISSING")).toEqual([]);
    const sealDigest = preview.evidence.revision.slice("rs02_evidence_".length);
    expect(built.pins.map((pin: Json) => [pin.pinKind, pin.sourceRef, pin.sourceDigest])).toEqual([
      ["RUN", value.runId, value.effectiveSpecDigest],
      ["ALPHA_VERSION", value.alpha.alphaVersionId, value.alpha.codeDigest],
      ["REPORT", preview.report.report_revision, value.report.frozenCoreDigest],
      ["EVIDENCE", preview.evidence.revision, sealDigest],
      ["SPLIT", preview.split.revision, sealDigest],
      ["SELECTION", preview.search.revision, preview.progress.claim.handoff_cursor.params_digest],
      ["CURRENT_SOURCE", "artifact-revision-1", provenance.retained_import_digest],
      ["ARTIFACT", "rart_w7_preview_research_bundle", provenance.source_manifest_digest],
    ]);
    for (const pin of built.pins as Json[]) expect(pin.sourceRef.length).toBeLessThanOrEqual(256);
  });

  it("keeps every lane-specific absence truthful and every disagreement an integrity failure", async () => {
    const compose = async (value: ReleaseCandidateSource) => subject(value, draft(value)).service.detail(scope, value.runId);

    // Pending retention: MISSING with the retained-lane reason, never the P04 hub reasons.
    const pending = await compose(source({}, { seal: null, sealedArtifactId: null, partDigests: [], observedImportDigest: null, folds: [] }));
    expect(pending.availability.state).toBe("AVAILABLE");
    expect(pending.pack.filter((item) => item.status === "MISSING").map((item) => [item.n, item.availability.reason_code])).toEqual(
      [3, 4, 5, 6, 7, 9, 11].map((n) => [n, "P21_RETAINED_CURRENT_SOURCE_NOT_SEALED"]),
    );
    expect(pending.actions.seal_blocked_reason).toBe("P21_REQUIRED_EVIDENCE_MISSING");

    // An issued certificate makes the claim row COMPLETE (the source says so, not P21).
    const issued = await compose(source({ methodology: { claimText: "issued", certificateState: "ISSUED", certificateGrade: "B", certificateIssuedAtUtcMs: 1_790_371_000_000 } }));
    expect(rows(issued).METHODOLOGY_CLAIM).toEqual(["COMPLETE", null]);

    // A fold whose OOS generation child is not the frozen θ* is no audit of the selection.
    const drifted = lane().folds.map((fold, index) => (index === 0
      ? { ...fold, payload: JSON.parse(JSON.stringify(fold.payload).replaceAll("2671e27b827ab2701d52e6ce", "0123456789abcdef01234567")) }
      : fold));
    const mismatch = await compose(source({}, { folds: drifted }));
    expect(rows(mismatch).FINAL_AUDIT_REPLAY).toEqual(["MISSING", "P21_RETAINED_CHILD_AUDIT_MISMATCH"]);
    expect(mismatch.fields.find((item) => item.key === "final_audit_run_id")!.value).toBeNull();

    // A seal predating the W5b child audit: typed absence, not a guess.
    const noAudit = lane().folds.map((fold) => {
      const payload = { ...(fold.payload as Json) };
      delete payload.child_audit;
      return { ...fold, payload };
    });
    expect(rows(await compose(source({}, { folds: noAudit }))).FINAL_AUDIT_REPLAY).toEqual(["MISSING", "P21_FINAL_AUDIT_RUN_NOT_PUBLISHED"]);

    // A report sealed from another retained revision is not this lane's metrics.
    const staleCore = JSON.parse(JSON.stringify(preview.report.frozen_core));
    staleCore.source_revisions.evidence_revision = "rs02_evidence_" + "0".repeat(64);
    expect(rows(await compose(source({ report: { ...source().report, frozenCore: staleCore } }))).METRICS_SEMANTICS).toEqual(["MISSING", "P21_RETAINED_REPORT_NOT_SEALED"]);

    const sealOf = lane().seal!;
    const failures: Array<[string, ReleaseCandidateSource]> = [
      ["seal dataset binding differs from the P10 producer", source({}, { seal: { ...sealOf, datasetBindingDigest: "d".repeat(64) } })],
      ["recomputed import receipt differs", source({}, { observedImportDigest: "e".repeat(64) })],
      ["hand-off cursor names another θ*", source({}, { handoffParamsDigest: "f".repeat(64) })],
      ["seal manifest names no sealed P05 artifact", source({}, { sealedArtifactId: null })],
      ["profile digest drifted", source({}, { executionProfileDigest: "a".repeat(64) })],
      ["seal lane pair is the advanced-WFO lane", source({}, { seal: { ...sealOf, sourceAdapterId: "rs02.quantbt-advanced-wfo.v1", profileId: "rs02.delta-wfo-global.v1" } })],
      ["seal requested spec differs from the run", source({}, { seal: { ...sealOf, requestedSpecDigest: "b".repeat(64) } })],
      ["malformed P05 part digest", source({}, { partDigests: ["not-a-digest"] })],
      ["report core names another manifest", source({ report: { ...source().report, frozenCore: { ...preview.report.frozen_core, source_digests: { ...preview.report.frozen_core.source_digests, manifest_digest: "c".repeat(64) } } } })],
      ["corrupt artifact", source({ artifacts: [{ artifactId: "rart_w7_preview_research_bundle", manifestDigest: provenance.source_manifest_digest, state: "CORRUPT", artifactRevision: 1 }] })],
    ];
    for (const [label, value] of failures) {
      const result = await compose(value);
      expect(result.actions.seal_blocked_reason, label).toBe("P21_REFERENCED_SOURCE_INTEGRITY_FAILED");
      expect(result.availability, label).toEqual({ state: "PARTIAL", reason_code: "P21_REFERENCED_SOURCE_INTEGRITY_FAILED" });
    }
    // The preflight manifest is a different identity: its value never matters here.
    const otherPreflight = await compose(source({ producer: { ...source().producer, manifestDigest: "9".repeat(64) } }));
    expect(otherPreflight.actions).toMatchObject({ may_seal: true });
  });

  it("fingerprints the retained lane: any retained fact change fences a stale draft", () => {
    const base = releaseCandidateSourceFingerprint(source());
    expect(releaseCandidateSourceFingerprint(source({}, { observedImportDigest: "e".repeat(64) }))).not.toBe(base);
    expect(releaseCandidateSourceFingerprint(source({}, { partDigests: [] }))).not.toBe(base);
  });

  /** W7 · canonical Screen 11 fixtures: the real run composed by this lane (virtual draft, and declared). */
  it("writes (opt-in) and validates the published WFO compose fixtures", async () => {
    const root = resolve(process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts"), "fixtures");
    const files = { virtual: "research-release-candidate.wfo-retained.valid.json", declared: "research-release-candidate.wfo-retained-declared.valid.json" };
    if (process.env.W7_WRITE_FIXTURES === "1") {
      const value = source();
      writeFileSync(join(root, files.virtual), JSON.stringify(await subject(value, null).service.detail(scope, value.runId), null, 2) + "\n");
      writeFileSync(join(root, files.declared), JSON.stringify(await subject(value, draft(value)).service.detail(scope, value.runId), null, 2) + "\n");
    }
    for (const file of Object.values(files)) {
      const body = JSON.parse(readFileSync(join(root, file), "utf8"));
      expect(ResearchReleaseCandidateComposeResponseSchema.safeParse(body).success, file).toBe(true);
      composeValidator.assert(body);
      expect(body.run_id).toBe(preview.run_id);
    }
  });
});
