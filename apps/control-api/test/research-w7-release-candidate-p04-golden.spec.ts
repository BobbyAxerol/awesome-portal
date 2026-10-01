/**
 * W7 · P21 lane split — the P04 fixed-profile lane is frozen byte-for-byte.
 *
 * The golden file was written by the composer as it stood at `c66836bf`,
 * BEFORE the retained (Delta WFO) lane was added (`W7_WRITE_GOLDEN=1`). Every
 * P04 composition, source fingerprint, local-seal frozen core, pack digest and
 * retention pin must stay identical: a P04 run composes exactly as it did.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { canonicalResearchJson } from "../src/research/preflight.service";
import { ResearchReleaseCandidateService } from "../src/research/release-candidate.service";
import {
  releaseCandidateSourceFingerprint,
  type ReleaseCandidateDraft,
  type ReleaseCandidateSource,
} from "../src/research/release-candidate.repository";

const GOLDEN = join(__dirname, "research-w7-release-candidate-p04.golden.json.gz");
const scope = { workspaceId: "ws-p21", actorUserId: "usr-p21" };
const digest = (label: string) => createHash("sha256").update(label, "utf8").digest("hex");
const coreDigest = (value: unknown) => createHash("sha256").update(canonicalResearchJson(value), "utf8").digest("hex");
const draftId = `rcd_${"0".repeat(26)}`;
const releaseCandidateId = `rc_${"1".repeat(26)}`;

function reportCore(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: "research.report-frozen-core.v1",
    source_digests: {
      source_transform_digest: digest("a"), dataset_binding_digest: digest("b"), manifest_digest: digest("c"),
      requested_spec_digest: digest("d"), effective_spec_digest: digest("e"),
    },
    ...overrides,
  };
}

/** A P04 source: `wfo: null` is how the repository says "not the retained lane". */
function source(overrides: Partial<ReleaseCandidateSource> = {}): ReleaseCandidateSource {
  const value = {
    runId: "run-p21-audit", attemptId: "att-p21-audit", runState: "READY", runKind: "AUDIT",
    relationshipKind: "AUDIT_OF_SELECTION", targetSelectionId: "sel-p21",
    requestSpecDigest: digest("d"), effectiveSpecDigest: digest("e"), datasetBindingDigest: digest("b"),
    engineReleaseId: "quantbt-1.1.1", artifactRevision: 7,
    alpha: {
      alphaId: "alpha-p21", name: "P21 Alpha", alphaVersionId: "av-p21", codeDigest: digest("i"),
      entrypoint: "strategies.p21:Alpha", lifecycleState: "ACTIVE",
      declaredContract: { execution: { execution_route: "signal_notional" } },
    },
    producer: { adapterContractDigest: digest("j"), manifestDigest: digest("c"), sourceTransformDigest: null },
    selection: { selectionId: "sel-p21", selectedTrialId: null, parameterBundleDigest: digest("k"), sourceDigest: digest("l"), targetKind: "CENTROID" },
    report: { reportRevision: "p18r1_fixture", frozenCoreDigest: digest("f"), frozenCore: reportCore(), sealedAtUtcMs: 1_790_000_000_000 },
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
    artifacts: [{ artifactId: "art-p21", manifestDigest: digest("t"), state: "SEALED" as const, artifactRevision: 7 }],
    asOfUtcMs: 1_790_000_002_000,
    wfo: null,
  } as unknown as ReleaseCandidateSource;
  const output = { ...value, ...overrides };
  output.report = { ...output.report, frozenCoreDigest: output.report.frozenCore === null ? null : coreDigest(output.report.frozenCore) };
  return output;
}

/** The preview's real P04 run shape: a PRIMARY fixed-profile run with no selection record and no methodology certificate. */
function realShapeP04(): ReleaseCandidateSource {
  return source({
    runKind: "PRIMARY", relationshipKind: "ROOT", targetSelectionId: null,
    selection: { selectionId: null, selectedTrialId: null, parameterBundleDigest: null, sourceDigest: null, targetKind: null },
    methodology: { claimText: "The fixed profile sealed its artifacts but did not issue a release claim.", certificateState: "NOT_PUBLISHED", certificateGrade: null, certificateIssuedAtUtcMs: null },
    currentSource: { artifactRevision: null, manifestDigest: null, sourceTransformDigest: null, retainedImportDigest: null },
  });
}

const VARIANTS: Record<string, () => ReleaseCandidateSource> = {
  ready_audit: () => source(),
  real_shape_p04_primary: realShapeP04,
  scratch: () => source({ alpha: { ...source().alpha, alphaId: null, alphaVersionId: null, codeDigest: null, entrypoint: null, lifecycleState: null } }),
  superseded: () => source({ alpha: { ...source().alpha, lifecycleState: "SUPERSEDED" } }),
  corrupt_artifact: () => source({ artifacts: [{ artifactId: "art-corrupt", manifestDigest: digest("t"), state: "CORRUPT", artifactRevision: 7 }] }),
  no_methodology: () => source({ methodology: { claimText: null, certificateState: "NOT_PUBLISHED", certificateGrade: null, certificateIssuedAtUtcMs: null } }),
  malformed_adapter: () => source({ producer: { ...source().producer, adapterContractDigest: "not-a-digest" } }),
  retained_manifest_differs: () => source({ currentSource: { ...source().currentSource, manifestDigest: digest("retained-artifact-manifest") } }),
  report_manifest_mismatch: () => source({ report: { ...source().report, frozenCore: reportCore({ source_digests: { ...reportCore().source_digests, manifest_digest: digest("other") } }) } }),
  malformed_retained_manifest: () => source({ currentSource: { ...source().currentSource, manifestDigest: "not-a-digest" } }),
  no_report: () => source({ report: { reportRevision: null, frozenCoreDigest: null, frozenCore: null, sealedAtUtcMs: null } }),
  evidence_partial: () => source({ evidence: { ...source().evidence, readiness: "PARTIAL" } }),
};

function draftFor(value: ReleaseCandidateSource, declared: boolean): ReleaseCandidateDraft {
  return {
    draftId, revision: 1, sourceFingerprint: releaseCandidateSourceFingerprint(value),
    knownLimitations: declared ? "Known bounded limitation." : null,
    proposedUseRestrictions: declared ? "Paper-only research use." : null,
    updatedAtUtcMs: 1_790_000_003_000,
  };
}

function service(value: ReleaseCandidateSource, draft: ReleaseCandidateDraft | null) {
  const repository = {
    snapshot: vi.fn().mockResolvedValue(value),
    draft: vi.fn().mockResolvedValue(draft),
    latestPack: vi.fn().mockResolvedValue(null),
    publicationContext: vi.fn().mockResolvedValue({ current: null, predecessor: null }),
    readPack: vi.fn(),
    patchDraft: vi.fn(),
    seal: vi.fn(),
  };
  return {
    repository,
    subject: new ResearchReleaseCandidateService(repository as never, { FEATURE_RESEARCH_RELEASE_CANDIDATES: "true" } as never),
  };
}

async function observe(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [name, build] of Object.entries(VARIANTS)) {
    const value = build();
    const virtual = await service(value, null).subject.detail(scope, value.runId);
    const declared = await service(value, draftFor(value, true)).subject.detail(scope, value.runId);
    let seal: unknown = { refused: null };
    if (declared.actions.may_seal) {
      const { subject, repository } = service(value, draftFor(value, true));
      repository.seal.mockImplementation(async (_scope, _run, _input, build: (s: unknown, d: unknown, id: string) => unknown) => {
        seal = build(value, draftFor(value, true), releaseCandidateId);
        return {
          releaseCandidateId, runId: value.runId, packDigest: (seal as { packDigest: string }).packDigest,
          sourceFingerprint: releaseCandidateSourceFingerprint(value), frozenCore: {}, sealedAtUtcMs: 1_790_000_004_000,
          deliveryState: "NOT_DELIVERED", approvalState: "NOT_APPROVED",
        };
      });
      await subject.seal(scope, value.runId, { draft_id: draftId, expected_draft_revision: 1, expected_source_fingerprint: releaseCandidateSourceFingerprint(value) });
    }
    out[name] = { fingerprint: releaseCandidateSourceFingerprint(value), virtual, declared, seal };
  }
  return out;
}

describe("W7 · P21 P04 lane golden (byte-for-byte)", () => {
  it("composes, fingerprints and seals every P04 variant exactly as before the retained lane existed", async () => {
    const observed = JSON.parse(JSON.stringify(await observe()));
    // The deep-link label is an additive read-only response field, not part of
    // the pre-retained P04 fingerprint, frozen core or sealed pack golden.
    for (const result of Object.values(observed) as Array<{ virtual: { display_label?: string | null }; declared: { display_label?: string | null } }>) {
      expect(result.virtual.display_label).toBeNull();
      expect(result.declared.display_label).toBeNull();
      delete result.virtual.display_label;
      delete (result.virtual as { selected_params?: unknown }).selected_params;
      delete result.declared.display_label;
      delete (result.declared as { selected_params?: unknown }).selected_params;
    }
    if (process.env.W7_WRITE_GOLDEN === "1") writeFileSync(GOLDEN, gzipSync(`${JSON.stringify(observed, null, 1)}\n`, { level: 9 }));
    const golden = JSON.parse(gunzipSync(readFileSync(GOLDEN)).toString("utf8"));
    expect(Object.keys(observed)).toEqual(Object.keys(golden));
    for (const name of Object.keys(golden)) expect(observed[name], name).toEqual(golden[name]);
    // Byte-for-byte, not just deep-equal: key order is part of the wire.
    expect(JSON.stringify(observed)).toBe(JSON.stringify(golden));
  });
});
