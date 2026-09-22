import { describe, expect, it, vi } from "vitest";

import {
  P04_DELTA_ADAPTER_CONTRACT_DIGEST,
  P04_DELTA_FIXED_PARAMETERS,
} from "../src/research/p04-delta.binding";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { ResearchSearchService } from "../src/research/search.service";
import { p14SplitSourceFixture } from "./research-split.fixture";

const scope = { workspaceId: "p15-workspace", actorUserId: "p15-user" };

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
    runId: "run_p15",
    adapterContractDigest: P04_DELTA_ADAPTER_CONTRACT_DIGEST,
    requestedSpecDigest: "1".repeat(64),
    effectiveSpecDigest: "2".repeat(64),
    datasetBindingDigest: "3".repeat(64),
    manifestDigest: "b".repeat(64),
    legacyRequest: {
      research: {
        requested_spec: {
          optimization_mode: "mode_1_decay",
          optimization_schedule: "global",
        },
      },
    },
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

describe("P15 current-source Search / ledger / diagnostics authority", () => {
  it("projects the exact fixed profile and refuses to invent an optimizer ledger or diagnostics", async () => {
    const repository = { hub: vi.fn().mockResolvedValue(currentP04Row()) };
    const service = new ResearchSearchService(repository as never, { FEATURE_RESEARCH_SEARCH: "true" } as never);

    const detail = await service.detail(scope, "run_p15", { fold: 2 });

    expect(detail).toMatchObject({
      schema_version: "research.search-detail.v1",
      availability: { state: "AVAILABLE", reason_code: null },
      source_profile: { state: "FIXED_PROFILE_NO_SEARCH" },
      requested_optimizer: {
        mode: "mode_1_decay",
        schedule: "global",
        state: "DECLARED_NOT_EXECUTED",
      },
      fixed_profile: {
        state: "FIXED_PROFILE_NO_SEARCH",
        adapter_contract_digest: P04_DELTA_ADAPTER_CONTRACT_DIGEST,
        parameter_bundle_digest: sha256ResearchJson(P04_DELTA_FIXED_PARAMETERS),
      },
      selection: { state: "FIXED_PARAMETER_PROFILE", selected_trial_ref: null },
      inspection: { requested_fold: 2, state: "NOT_APPLICABLE" },
      ledger: {
        state: "NOT_APPLICABLE",
        reason_code: "P04_FIXED_PROFILE_DOES_NOT_CREATE_OPTIMIZER_STUDY",
        total_rows: null,
        sampled_rows: null,
        page: null,
      },
      diagnostics: { state: "NOT_APPLICABLE" },
    });
    expect(detail.fixed_profile.state).toBe("FIXED_PROFILE_NO_SEARCH");
    if (detail.fixed_profile.state !== "FIXED_PROFILE_NO_SEARCH") throw new Error("expected fixed P04 profile");
    expect(detail.fixed_profile.parameters).toHaveLength(8);
    expect(detail.fixed_profile.parameters.find((parameter) => parameter.name === "rvol")).toMatchObject({
      minimum: "1",
      maximum: "2.5",
      step: "0.1",
      effective_value: "1.6",
      position_percent: 40,
    });
    expect(detail.source_absences.trial_ledger).toMatchObject({ state: "NOT_APPLICABLE" });
    // The named typed absences are intentional; assert that no fabricated
    // sampled row, selected trial identity, candidate score, or progress
    // notification is smuggled into the response as a historical ledger.
    expect(JSON.stringify(detail)).not.toMatch(/\"trial_id\"|\"candidate_score\"|\"objective_score\"|trial 1\/1/i);
    for (const privateNeedle of [
      "worker_attempt_id", "lease_epoch", "artifact_store_path", "source_path", "market_path", "raw_ohlcv",
    ]) expect(JSON.stringify(detail)).not.toContain(privateNeedle);
  });

  it("does not reinterpret a retained P14 receipt when its P04 contract or parameter binding differs", async () => {
    const repository = {
      hub: vi.fn()
        .mockResolvedValueOnce(currentP04Row({ adapterContractDigest: "0".repeat(64) }))
        .mockResolvedValueOnce(currentP04Row({
          projection: {
            schema_version: "research.split-projection.v1",
            source: p14SplitSourceFixture(),
          },
        })),
    };
    const service = new ResearchSearchService(repository as never, { FEATURE_RESEARCH_SEARCH: "true" } as never);

    for (const runId of ["run_p15_contract", "run_p15_bundle"]) {
      const detail = await service.detail(scope, runId, {});
      expect(detail).toMatchObject({
        availability: { state: "NOT_PUBLISHED", reason_code: "P15_CURRENT_P04_PROFILE_CONTRACT_MISMATCH" },
        readiness: "NOT_READY",
        fixed_profile: { state: "NOT_PUBLISHED", parameters: [] },
        selection: { state: "NOT_PUBLISHED", selected_trial_ref: null },
        ledger: { state: "NOT_PUBLISHED", total_rows: null },
      });
      expect(detail.revision).toBeNull();
    }
  });

  it("preserves pending and legacy source state inside every typed absence", async () => {
    const legacy = currentP04Row({
      kind: "LEGACY" as const,
      adapterContractDigest: null,
      requestedSpecDigest: null,
      effectiveSpecDigest: null,
      datasetBindingDigest: null,
      manifestDigest: null,
      legacyRequest: null,
      jobState: null,
      revision: null,
      projection: null,
      readiness: null,
      sourceSplitDigest: null,
      receivedAt: null,
    });
    const pending = currentP04Row({ projection: null, jobState: "RUNNING" });
    const repository = { hub: vi.fn().mockResolvedValueOnce(legacy).mockResolvedValueOnce(pending) };
    const service = new ResearchSearchService(repository as never, { FEATURE_RESEARCH_SEARCH: "true" } as never);

    const legacyDetail = await service.detail(scope, "legacy_p15", {});
    expect(legacyDetail).toMatchObject({
      availability: { state: "LEGACY_METADATA_ONLY" },
      source_profile: { state: "LEGACY_METADATA_ONLY" },
      source_absences: { trial_ledger: { availability: { state: "LEGACY_METADATA_ONLY" } } },
    });
    const pendingDetail = await service.detail(scope, "pending_p15", {});
    expect(pendingDetail).toMatchObject({
      availability: { state: "PENDING_SOURCE_CALLBACK" },
      source_profile: { state: "PENDING_SOURCE_CALLBACK" },
      source_absences: { trial_ledger: { availability: { state: "PENDING_SOURCE_CALLBACK" } } },
    });
  });

  it("fails closed while the independently deployed P15 reader is dark", async () => {
    const service = new ResearchSearchService({ hub: vi.fn() } as never, { FEATURE_RESEARCH_SEARCH: "false" } as never);
    await expect(service.detail(scope, "run_p15", {})).rejects.toMatchObject({
      code: "RESEARCH_SEARCH_UNAVAILABLE",
      status: 503,
    });
  });
});
