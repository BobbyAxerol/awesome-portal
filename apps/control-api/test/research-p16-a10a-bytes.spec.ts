/**
 * W5a · A10a expected-artifact-byte verification with a durable receipt.
 *
 * P16-T03 corrupt bytes → integrity failure; P16-T04 re-verify never
 * rebaselines the expected digest from wrong bytes; P16-T10 (backend half)
 * a corrupt artifact keeps its original expected digest.
 */

import { describe, expect, it, vi } from "vitest";

import { ArtifactByteVerificationSchema, type ArtifactByteObservation } from "../src/research/artifact-verify.contract";
import { ArtifactObserverUnavailable } from "../src/research/artifact-verify.client";
import type { SealedArtifactExpectation } from "../src/research/artifact-verify.repository";
import { compareArtifactBytes, ResearchArtifactVerifyService } from "../src/research/artifact-verify.service";
import { P04_DELTA_ADAPTER_CONTRACT_DIGEST, P04_DELTA_FIXED_PARAMETERS } from "../src/research/p04-delta.binding";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { ResearchFreezeService } from "../src/research/freeze.service";
import { ResearchFreezeVerificationResponseSchema } from "../src/research/freeze.contract";
import { p14SplitSourceFixture } from "./research-split.fixture";

const scope = { workspaceId: "w5a-ws", actorUserId: "w5a-user" };
const EXPECTED_MANIFEST = "1".repeat(64);
const PART_A = "a".repeat(64);
const PART_B = "b".repeat(64);
const WRONG = "e".repeat(64);

const expectation: SealedArtifactExpectation = {
  artifactId: "rart_w5a",
  artifactRevision: 1,
  state: "SEALED",
  expectedManifestDigest: EXPECTED_MANIFEST,
  parts: [
    { tableKind: "observations", partOrdinal: 1, relativePath: "tables/observations/part-00001.parquet", partDigest: PART_A },
    { tableKind: "trials", partOrdinal: 1, relativePath: "tables/trials/part-00001.parquet", partDigest: PART_B },
  ],
};

function observation(overrides: Partial<ArtifactByteObservation> = {}, partDigests: (string | null)[] = [PART_A, PART_B]): ArtifactByteObservation {
  return {
    schema_version: "research.artifact-byte-observation.v1",
    artifact_id: "rart_w5a",
    manifest_state: "PRESENT",
    manifest_digest: EXPECTED_MANIFEST,
    manifest_artifact_revision: 1,
    parts: expectation.parts.map((part, index) => ({
      relative_path: part.relativePath,
      observed_digest: partDigests[index] ?? null,
      observed_bytes: 10,
    })),
    documents: [{ relative_path: "documents/summary.json", observed_digest: "c".repeat(64), observed_bytes: 5, recorded_digest: "c".repeat(64) }],
    ...overrides,
  };
}

/** An in-memory stand-in for the append-only receipt table. */
function memoryRepository(target: SealedArtifactExpectation | null = expectation) {
  const receipts: Record<string, unknown>[] = [];
  return {
    receipts,
    expectation: vi.fn().mockResolvedValue(target),
    record: vi.fn(async (_scope: unknown, input: Record<string, unknown>) => {
      const receipt = ArtifactByteVerificationSchema.parse({
        schema_version: "research.artifact-byte-verification.v1",
        state: input.state,
        reason_code: input.state === "MATCH" ? null : input.state === "MISMATCH"
          ? "P16_ARTIFACT_BYTES_DIFFER_FROM_SEALED_DIGEST" : "P16_ARTIFACT_BYTES_MISSING_FROM_RETAINED_STORE",
        verification_scope: "P05_SEALED_MANIFEST_PARTS_AND_DOCUMENTS",
        receipt_id: `rabv_${String(receipts.length + 1).padStart(32, "0")}`,
        verified_at_utc_ms: 1_758_000_000_000 + receipts.length,
        artifact_revision: input.artifactRevision,
        expected_manifest_digest: input.expectedManifestDigest,
        observed_manifest_digest: input.observedManifestDigest,
        parts_checked: input.partsChecked,
        parts_mismatched: input.partsMismatched,
        documents_checked: input.documentsChecked,
        mismatches: input.mismatches,
      });
      receipts.push(receipt);
      return receipt;
    }),
    latest: vi.fn(async () => receipts.at(-1) ?? null),
  };
}

const enabled = { FEATURE_RESEARCH_ARTIFACT_BYTE_VERIFY: "true", FEATURE_RESEARCH_FREEZE: "true" } as never;

describe("A10a · compareArtifactBytes", () => {
  it("MATCH only when the manifest, every part and every document equal the sealed expectation", () => {
    expect(compareArtifactBytes(expectation, observation())).toMatchObject({ state: "MATCH", partsMismatched: 0, mismatches: [] });
  });

  it("P16-T03: one flipped byte in one part is MISMATCH, naming that part with both digests", () => {
    const compared = compareArtifactBytes(expectation, observation({}, [PART_A, WRONG]));
    expect(compared.state).toBe("MISMATCH");
    expect(compared.partsMismatched).toBe(1);
    expect(compared.mismatches).toEqual([
      { kind: "PART", table_kind: "trials", ordinal: 1, expected_digest: PART_B, observed_digest: WRONG },
    ]);
  });

  it("a rewritten manifest is MISMATCH even when every part still hashes the same", () => {
    expect(compareArtifactBytes(expectation, observation({ manifest_digest: WRONG })).state).toBe("MISMATCH");
  });

  it("a missing part or manifest is MISSING, never MATCH and never silently skipped", () => {
    expect(compareArtifactBytes(expectation, observation({}, [PART_A, null])).state).toBe("MISSING");
    expect(compareArtifactBytes(expectation, observation({ manifest_digest: null, manifest_state: "MISSING" })).state).toBe("MISSING");
  });

  it("an observer that answers a different path order is not a match", () => {
    const shuffled = observation();
    shuffled.parts = [...shuffled.parts].reverse();
    expect(compareArtifactBytes(expectation, shuffled).state).not.toBe("MATCH");
  });
});

describe("A10a · ResearchArtifactVerifyService", () => {
  it("P16-T04: re-verifying against wrong bytes appends another MISMATCH against the SAME original expectation", async () => {
    const repository = memoryRepository();
    const client = { observe: vi.fn().mockResolvedValue(observation({}, [PART_A, WRONG])) };
    const service = new ResearchArtifactVerifyService(repository as never, client as never, enabled);
    const first = await service.verify(scope, "run_w5a");
    const second = await service.verify(scope, "run_w5a");
    expect([first.state, second.state]).toEqual(["MISMATCH", "MISMATCH"]);
    expect(second.receipt_id).not.toBe(first.receipt_id);
    // The expectation is read from the seal every time; the observed digest never becomes it.
    for (const receipt of [first, second]) {
      expect(receipt.expected_manifest_digest).toBe(EXPECTED_MANIFEST);
      expect(receipt.mismatches[0]).toMatchObject({ expected_digest: PART_B, observed_digest: WRONG });
    }
    expect(repository.record).toHaveBeenCalledTimes(2);
    expect(repository.record.mock.calls.every(([, input]) => (input as { expectedManifestDigest: string }).expectedManifestDigest === EXPECTED_MANIFEST)).toBe(true);
  });

  it("restoring the original bytes is the only way back to MATCH (no rebaseline path exists)", async () => {
    const repository = memoryRepository();
    const client = { observe: vi.fn().mockResolvedValueOnce(observation({}, [PART_A, WRONG])).mockResolvedValueOnce(observation()) };
    const service = new ResearchArtifactVerifyService(repository as never, client as never, enabled);
    expect((await service.verify(scope, "run_w5a")).state).toBe("MISMATCH");
    expect((await service.verify(scope, "run_w5a")).state).toBe("MATCH");
    expect(repository.receipts).toHaveLength(2);
  });

  it("an unreachable observer records nothing and claims nothing", async () => {
    const repository = memoryRepository();
    const client = { observe: vi.fn().mockRejectedValue(new ArtifactObserverUnavailable("down")) };
    const service = new ResearchArtifactVerifyService(repository as never, client as never, enabled);
    const answer = await service.verify(scope, "run_w5a");
    expect(answer).toMatchObject({ state: "UNAVAILABLE", receipt_id: null, reason_code: "P16_ARTIFACT_OBSERVER_UNAVAILABLE" });
    expect(repository.record).not.toHaveBeenCalled();
  });

  it("a run without a sealed P05 artifact is NOT_RETAINED; a dark flag is NOT_ENABLED and calls nothing", async () => {
    const repository = memoryRepository(null);
    const client = { observe: vi.fn() };
    expect((await new ResearchArtifactVerifyService(repository as never, client as never, enabled).verify(scope, "r")).state)
      .toBe("NOT_RETAINED");
    const dark = new ResearchArtifactVerifyService(repository as never, client as never, {} as never);
    expect((await dark.verify(scope, "r")).state).toBe("NOT_ENABLED");
    expect((await dark.latest(scope, "r")).state).toBe("NOT_ENABLED");
    expect(client.observe).not.toHaveBeenCalled();
  });

  it("a GET only reads the newest receipt; before any verify it answers NOT_VERIFIED", async () => {
    const repository = memoryRepository();
    const client = { observe: vi.fn() };
    const service = new ResearchArtifactVerifyService(repository as never, client as never, enabled);
    expect((await service.latest(scope, "run_w5a")).state).toBe("NOT_VERIFIED");
    expect(client.observe).not.toHaveBeenCalled();
  });
});

function p04Row(overrides: Record<string, unknown> = {}) {
  const original = p14SplitSourceFixture();
  const source = {
    ...original,
    protocol: { ...original.protocol, selection: { ...original.protocol.selection, parameter_bundle_digest: sha256ResearchJson(P04_DELTA_FIXED_PARAMETERS) } },
  };
  return {
    kind: "DURABLE" as const,
    runId: "run_w5a",
    adapterContractDigest: P04_DELTA_ADAPTER_CONTRACT_DIGEST,
    requestedSpecDigest: "1".repeat(64),
    effectiveSpecDigest: "2".repeat(64),
    datasetBindingDigest: "3".repeat(64),
    manifestDigest: "b".repeat(64),
    legacyRequest: null,
    progressSnapshot: null,
    jobState: "SUCCEEDED",
    revision: "p14r1_" + "f".repeat(64),
    projection: { schema_version: "research.split-projection.v1", source },
    readiness: "PARTIAL" as const,
    sourceSplitDigest: sha256ResearchJson(source),
    receivedAt: new Date("2026-09-22T00:00:00.000Z"),
    asOfUtcMs: 1_727_000_000_000,
    ...overrides,
  };
}

describe("A10a · P16 Freeze reads and verify with a byte receipt", () => {
  function freezeWith(observed: ArtifactByteObservation, row = p04Row()) {
    const repository = memoryRepository();
    const client = { observe: vi.fn().mockResolvedValue(observed) };
    const bytes = new ResearchArtifactVerifyService(repository as never, client as never, enabled);
    const hub = { hub: vi.fn().mockResolvedValue(row) };
    return { service: new ResearchFreezeService(hub as never, enabled, undefined, bytes), repository, client };
  }

  it("a GET never observes bytes; it reports NOT_VERIFIED until an explicit verify", async () => {
    const { service, client } = freezeWith(observation());
    const detail = await service.detail(scope, "run_w5a", {});
    expect(detail.artifact_bytes.state).toBe("NOT_VERIFIED");
    expect(detail.freeze.integrity.state).toBe("PARTIAL");
    expect(client.observe).not.toHaveBeenCalled();
  });

  it("verify with intact bytes widens the scope to binding + bytes, still PARTIAL_MATCH (never 'chain intact')", async () => {
    const { service } = freezeWith(observation());
    const verification = ResearchFreezeVerificationResponseSchema.parse(await service.verify(scope, "run_w5a", {}));
    expect(verification).toMatchObject({
      result: "PARTIAL_MATCH",
      verification_scope: "PORTAL_RETAINED_DIGEST_BINDING_AND_P05_ARTIFACT_BYTES",
      artifact_bytes: { state: "MATCH", expected_manifest_digest: EXPECTED_MANIFEST },
    });
  });

  it("P16-T03: corrupt bytes BLOCK the freeze — verify, and every later GET, until the bytes are restored", async () => {
    const { service } = freezeWith(observation({}, [WRONG, PART_B]));
    const verification = await service.verify(scope, "run_w5a", {});
    expect(verification.result).toBe("BLOCKED");
    expect(verification.artifact_bytes).toMatchObject({ state: "MISMATCH", parts_mismatched: 1 });
    const detail = await service.detail(scope, "run_w5a", {});
    expect(detail.freeze.integrity.state).toBe("BLOCKED");
    expect(detail.readiness).toBe("NOT_READY");
    // No local parameter map is projected over a corrupt artifact.
    expect(detail.freeze.frozen_parameters).toEqual([]);
    // The ETag moved with the receipt, so a 304 cannot hide the block.
    const before = await freezeWith(observation()).service.detail(scope, "run_w5a", {});
    expect(detail.etag).not.toBe(before.etag);
  });

  it("a WFO run (hub NOT_APPLICABLE) verifies bytes only and says so", async () => {
    const { service } = freezeWith(observation(), p04Row({ executionProfileId: "p10.delta-signal-notional-wfo.v1" }));
    const verification = await service.verify(scope, "run_w5a", {});
    expect(verification).toMatchObject({ result: "PARTIAL_MATCH", verification_scope: "P05_ARTIFACT_BYTES_ONLY" });
  });

  it("without the byte service the verify keeps its pre-A10a meaning", async () => {
    const hub = { hub: vi.fn().mockResolvedValue(p04Row()) };
    const verification = await new ResearchFreezeService(hub as never, enabled).verify(scope, "run_w5a", {});
    expect(verification).toMatchObject({
      result: "PARTIAL_MATCH",
      verification_scope: "PORTAL_RETAINED_DIGEST_BINDING_ONLY",
      artifact_bytes: { state: "NOT_ENABLED" },
    });
  });
});
