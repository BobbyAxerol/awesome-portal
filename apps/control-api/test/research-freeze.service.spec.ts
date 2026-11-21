import { describe, expect, it, vi } from "vitest";

import {
  P04_DELTA_ADAPTER_CONTRACT_DIGEST,
  P04_DELTA_FIXED_PARAMETERS,
} from "../src/research/p04-delta.binding";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { ResearchFreezeService } from "../src/research/freeze.service";
import { p14SplitSourceFixture } from "./research-split.fixture";

const scope = { workspaceId: "p16-workspace", actorUserId: "p16-user" };

function currentP04Row(overrides: Record<string, unknown> = {}) {
  const original = p14SplitSourceFixture();
  const source = {
    ...original,
    protocol: {
      ...original.protocol,
      selection: {
        ...original.protocol.selection,
        parameter_bundle_digest: sha256ResearchJson(P04_DELTA_FIXED_PARAMETERS),
      },
    },
  };
  return {
    kind: "DURABLE" as const,
    runId: "run_p16",
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

describe("P16 current-source Freeze / retained integrity authority", () => {
  it("verifies the three retained bindings without claiming source artifact bytes, selection or what-if truth", async () => {
    const repository = { hub: vi.fn().mockResolvedValue(currentP04Row()) };
    const service = new ResearchFreezeService(repository as never, { FEATURE_RESEARCH_FREEZE: "true" } as never);

    const detail = await service.detail(scope, "run_p16", { fold: 2 });
    expect(detail).toMatchObject({
      schema_version: "research.freeze-detail.v1",
      availability: { state: "AVAILABLE", reason_code: null },
      readiness: "PARTIAL",
      engine_pin: {
        state: "AVAILABLE",
        engine_version: "1.1.1",
        execution_adapter_id: "p04.delta-rsi.v1",
        adapter_contract_digest: P04_DELTA_ADAPTER_CONTRACT_DIGEST,
        availability: { state: "AVAILABLE", reason_code: null },
      },
      freeze: {
        source_profile: { state: "FIXED_PROFILE_NO_SELECTION_ARTIFACT" },
        inspection: { requested_fold: 2, state: "NOT_APPLICABLE" },
        selection: { state: "FIXED_PARAMETER_PROFILE", selected_trial_ref: null, selection_artifact_ref: null },
        ordering: {
          state: "NOT_ASSERTED",
          data_time: { state: "AVAILABLE", chronology_kind: "THREE_WINDOW_CURRENT" },
        },
        integrity: {
          state: "PARTIAL",
          verification_scope: "PORTAL_RETAINED_DIGEST_BINDING_ONLY",
          source_artifact_bytes: { state: "NOT_ATTESTED" },
        },
        what_if: { state: "NOT_APPLICABLE", actions: { diagnostic_evaluate: { may_submit: false }, sibling_draft: { may_create: false } } },
      },
    });
    expect(detail.freeze.integrity.checks).toHaveLength(3);
    expect(detail.freeze.integrity.checks.map((check) => check.state)).toEqual(["MATCH", "MATCH", "MATCH"]);
    expect(detail.freeze.frozen_parameters).toHaveLength(8);
    expect(detail.freeze.frozen_parameters.find((parameter) => parameter.name === "rvol")).toMatchObject({
      minimum: "1", maximum: "2.5", step: "0.1", frozen_value: "1.6", position_percent: 40,
    });
    expect(detail.source_absences).toMatchObject({
      candidate_pool: { state: "NOT_APPLICABLE" },
      selection_artifact: { state: "NOT_APPLICABLE" },
      strict_ordering: { state: "NOT_ASSERTED" },
      source_artifact_bytes: { state: "NOT_ATTESTED" },
      what_if_grid: { state: "NOT_APPLICABLE" },
    });
    for (const privateNeedle of [
      "worker_attempt_id", "lease_epoch", "artifact_store_path", "source_path", "market_path", "raw_ohlcv",
      "selection_trace", "candidate_score", "diagnostic_job",
    ]) expect(JSON.stringify(detail)).not.toContain(privateNeedle);

    const verified = await service.verify(scope, "run_p16", { fold: 2 });
    expect(verified).toMatchObject({
      result: "PARTIAL_MATCH",
      freeze_revision: detail.revision,
      verification_scope: "PORTAL_RETAINED_DIGEST_BINDING_ONLY",
    });
    // A retained-digest match is deliberately not a source-artifact PASS.
    expect(JSON.stringify(verified)).not.toContain("PASS");
  });

  it("blocks the local frozen table on an immutable binding mismatch instead of remapping current P04 values", async () => {
    const repository = {
      hub: vi.fn()
        .mockResolvedValueOnce(currentP04Row({ adapterContractDigest: "0".repeat(64) }))
        .mockResolvedValueOnce(currentP04Row({ adapterContractDigest: "0".repeat(64) })),
    };
    const service = new ResearchFreezeService(repository as never, { FEATURE_RESEARCH_FREEZE: "true" } as never);

    const detail = await service.detail(scope, "run_p16_mismatch", {});
    expect(detail).toMatchObject({
      availability: { state: "AVAILABLE" },
      readiness: "NOT_READY",
      freeze: {
        integrity: { state: "BLOCKED" },
        selection: { parameter_bundle_digest: sha256ResearchJson(P04_DELTA_FIXED_PARAMETERS) },
      },
    });
    expect(detail.freeze.frozen_parameters).toEqual([]);
    expect(detail.freeze.integrity.checks[0]).toMatchObject({
      key: "P04_ADAPTER_CONTRACT", state: "MISMATCH",
      expected_digest: P04_DELTA_ADAPTER_CONTRACT_DIGEST, observed_digest: "0".repeat(64),
    });
    await expect(service.verify(scope, "run_p16_mismatch", {})).resolves.toMatchObject({
      result: "BLOCKED",
      verification_scope: "PORTAL_RETAINED_DIGEST_BINDING_ONLY",
    });
  });

  it("returns NONE on the verification response itself when no retained binding scope is published", async () => {
    const repository = { hub: vi.fn().mockResolvedValue(currentP04Row({ projection: null })) };
    const service = new ResearchFreezeService(repository as never, { FEATURE_RESEARCH_FREEZE: "true" } as never);

    await expect(service.verify(scope, "run_p16_not_published", {})).resolves.toMatchObject({
      result: "NOT_PUBLISHED",
      verification_scope: "NONE",
      integrity: { verification_scope: "NONE" },
    });
  });

  it("preserves pending and legacy availability inside all nested source absences", async () => {
    const legacy = currentP04Row({
      kind: "LEGACY" as const,
      adapterContractDigest: null,
      requestedSpecDigest: null,
      effectiveSpecDigest: null,
      datasetBindingDigest: null,
      manifestDigest: null,
      jobState: null,
      revision: null,
      projection: null,
      readiness: null,
      sourceSplitDigest: null,
      receivedAt: null,
    });
    const pending = currentP04Row({ projection: null, jobState: "RUNNING" });
    const repository = { hub: vi.fn().mockResolvedValueOnce(legacy).mockResolvedValueOnce(pending) };
    const service = new ResearchFreezeService(repository as never, { FEATURE_RESEARCH_FREEZE: "true" } as never);

    const legacyDetail = await service.detail(scope, "legacy_p16", {});
    expect(legacyDetail).toMatchObject({
      availability: { state: "LEGACY_METADATA_ONLY" },
      engine_pin: {
        state: "NOT_PUBLISHED",
        engine_version: null,
        execution_adapter_id: null,
      },
      freeze: { source_profile: { state: "LEGACY_METADATA_ONLY" }, integrity: { state: "NOT_PUBLISHED" } },
      source_absences: { source_artifact_bytes: { availability: { state: "LEGACY_METADATA_ONLY" } } },
    });
    const pendingDetail = await service.detail(scope, "pending_p16", {});
    expect(pendingDetail).toMatchObject({
      availability: { state: "PENDING_SOURCE_CALLBACK" },
      freeze: { source_profile: { state: "PENDING_SOURCE_CALLBACK" } },
      source_absences: { candidate_pool: { availability: { state: "PENDING_SOURCE_CALLBACK" } } },
    });
  });

  it("fails closed while the independently deployed P16 reader is dark", async () => {
    const service = new ResearchFreezeService({ hub: vi.fn() } as never, { FEATURE_RESEARCH_FREEZE: "false" } as never);
    await expect(service.detail(scope, "run_p16", {})).rejects.toMatchObject({
      code: "RESEARCH_FREEZE_UNAVAILABLE", status: 503,
    });
  });
});
