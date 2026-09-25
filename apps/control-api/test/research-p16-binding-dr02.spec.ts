/**
 * W5a · A10b historical parameter binding + DR-02 shared bound warning.
 */

import { describe, expect, it, vi } from "vitest";

import {
  BOUND_WARNING_DEFINITION_ID,
  boundWarning,
  positionPercent,
} from "../src/research/bound-warning";
import {
  bundleDigest,
  declaredParameterRows,
  ResearchParameterBindingRegistry,
  type HistoricalParameterBinding,
} from "../src/research/parameter-binding.registry";
import {
  P04_DELTA_ADAPTER_CONTRACT_DIGEST,
  P04_DELTA_DECLARED_CONTRACT,
  P04_DELTA_FIXED_PARAMETERS,
} from "../src/research/p04-delta.binding";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { ResearchFreezeService } from "../src/research/freeze.service";
import { ResearchSearchService } from "../src/research/search.service";
import { p14SplitSourceFixture } from "./research-split.fixture";

const scope = { workspaceId: "w5a-workspace", actorUserId: "w5a-user" };

function p04Row(bundle: Record<string, number>, adapterDigest: string) {
  const original = p14SplitSourceFixture();
  const source = {
    ...original,
    protocol: {
      ...original.protocol,
      selection: { ...original.protocol.selection, parameter_bundle_digest: sha256ResearchJson(bundle) },
    },
  };
  return {
    kind: "DURABLE" as const,
    runId: "run_w5a",
    adapterContractDigest: adapterDigest,
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
    sourceAsOfUtcMs: 1_727_000_000_000,
    sourceAsOfBasis: "P14_PROJECTION_RECEIVED_AT" as const,
  };
}

describe("DR-02 · research.bound-warning.v1", () => {
  it("uses the Search thresholds, inclusive, on the declared range, with exact decimals", () => {
    // [1, 2.5] → 6 % is 1.09, 18 % is 1.27, 82 % is 2.23, 94 % is 2.41.
    const at = (value: string) => boundWarning({ kind: "NUMERIC", value, minimum: "1", maximum: "2.5" });
    expect(at("1")).toMatchObject({ state: "AT_BOUND", side: "LOWER", definition_id: BOUND_WARNING_DEFINITION_ID });
    expect(at("1.09")).toMatchObject({ state: "AT_BOUND", side: "LOWER" });
    expect(at("1.0900001")).toMatchObject({ state: "NEAR_BOUND", side: "LOWER" });
    expect(at("1.27")).toMatchObject({ state: "NEAR_BOUND", side: "LOWER" });
    expect(at("1.2700001")).toMatchObject({ state: "INTERIOR", side: null });
    expect(at("2.23")).toMatchObject({ state: "NEAR_BOUND", side: "UPPER" });
    expect(at("2.41")).toMatchObject({ state: "AT_BOUND", side: "UPPER" });
    expect(at("2.5")).toMatchObject({ state: "AT_BOUND", side: "UPPER" });
    expect(at("1.6")).toMatchObject({ state: "INTERIOR", reference_space: "DECLARED_RANGE" });
  });

  it("answers NOT_APPLICABLE with a typed reason instead of inventing a position", () => {
    expect(boundWarning({ kind: "NUMERIC", value: "3", minimum: "3", maximum: "3" }))
      .toMatchObject({ state: "NOT_APPLICABLE", reason_code: "BOUND_WARNING_ZERO_WIDTH_RANGE" });
    expect(boundWarning({ kind: "CATEGORICAL", value: "fast", minimum: null, maximum: null }))
      .toMatchObject({ state: "NOT_APPLICABLE", reason_code: "BOUND_WARNING_CATEGORICAL_PARAMETER" });
    expect(boundWarning({ kind: "NUMERIC", value: "9", minimum: "1", maximum: "2" }))
      .toMatchObject({ state: "NOT_APPLICABLE", reason_code: "BOUND_WARNING_VALUE_OUTSIDE_DECLARED_RANGE" });
    expect(boundWarning({ kind: "NUMERIC", value: "1e3", minimum: "1", maximum: "2" }))
      .toMatchObject({ state: "NOT_APPLICABLE", reason_code: "BOUND_WARNING_VALUE_NOT_EXACT_DECIMAL" });
  });

  it("places a value exactly (no binary-float drift at a boundary)", () => {
    expect(positionPercent("1.6", "1", "2.5")).toBe(40);
    expect(positionPercent("1.3", "0.7", "2.5")).toBe(33.33);
    expect(positionPercent("0.7", "0.7", "2.5")).toBe(0);
    expect(positionPercent("2.6", "0.7", "2.5")).toBeNull();
  });

  it("serves the same definition on Search S06 and Freeze S07 for the same run", async () => {
    const row = p04Row({ ...P04_DELTA_FIXED_PARAMETERS }, P04_DELTA_ADAPTER_CONTRACT_DIGEST);
    const repository = { hub: vi.fn().mockResolvedValue(row) };
    const freeze = await new ResearchFreezeService(repository as never, { FEATURE_RESEARCH_FREEZE: "true" } as never)
      .detail(scope, "run_w5a", {});
    const search = await new ResearchSearchService(repository as never, { FEATURE_RESEARCH_SEARCH: "true" } as never)
      .detail(scope, "run_w5a", {});
    const frozen = Object.fromEntries(freeze.freeze.frozen_parameters.map((p) => [p.name, p.bound_warning]));
    const declared = Object.fromEntries(search.fixed_profile!.parameters.map((p) => [p.name, p.bound_warning]));
    expect(Object.keys(frozen)).toHaveLength(8);
    expect(frozen).toEqual(declared);
    for (const warning of Object.values(frozen)) expect(warning.definition_id).toBe(BOUND_WARNING_DEFINITION_ID);
  });
});

describe("A10b · historical parameter binding by the run's exact adapter digest", () => {
  const oldBundle = { ...P04_DELTA_FIXED_PARAMETERS, rvol: 1.2, slpercent: 0.9 };
  const oldDigest = "a".repeat(64);
  const oldBinding: HistoricalParameterBinding = {
    adapterContractDigest: oldDigest,
    parameterSpace: P04_DELTA_DECLARED_CONTRACT.parameter_space,
    fixedParameters: oldBundle,
    fixedBundleDigest: bundleDigest(oldBundle),
    installedInRelease: "old",
  };
  const currentBinding: HistoricalParameterBinding = {
    adapterContractDigest: P04_DELTA_ADAPTER_CONTRACT_DIGEST,
    parameterSpace: P04_DELTA_DECLARED_CONTRACT.parameter_space,
    fixedParameters: P04_DELTA_FIXED_PARAMETERS,
    fixedBundleDigest: bundleDigest(P04_DELTA_FIXED_PARAMETERS),
    installedInRelease: "new",
  };

  it("bundleDigest is the same canonical digest P14 retains", () => {
    expect(bundleDigest(P04_DELTA_FIXED_PARAMETERS)).toBe(sha256ResearchJson(P04_DELTA_FIXED_PARAMETERS));
  });

  it("keeps a historical run verified with ITS parameters after a release installs a new binding", async () => {
    const registry = new ResearchParameterBindingRegistry([oldBinding, currentBinding], []);
    const repository = { hub: vi.fn().mockResolvedValue(p04Row(oldBundle, oldDigest)) };
    const service = new ResearchFreezeService(repository as never, { FEATURE_RESEARCH_FREEZE: "true" } as never, registry);
    const detail = await service.detail(scope, "run_w5a", {});
    expect(detail.freeze.integrity.state).toBe("PARTIAL");
    expect(detail.freeze.integrity.checks.map((check) => check.state)).toEqual(["MATCH", "MATCH", "MATCH"]);
    const values = Object.fromEntries(detail.freeze.frozen_parameters.map((p) => [p.name, p.frozen_value]));
    // The run's own bundle, never the compiled current constants.
    expect(values.rvol).toBe("1.2");
    expect(values.slpercent).toBe("0.9");
    expect(values.rvol).not.toBe(String(P04_DELTA_FIXED_PARAMETERS.rvol));

    const search = await new ResearchSearchService(repository as never, { FEATURE_RESEARCH_SEARCH: "true" } as never, registry)
      .detail(scope, "run_w5a", {});
    expect(search.fixed_profile!.parameters.find((p) => p.name === "rvol")?.effective_value).toBe("1.2");
  });

  it("the compiled-constants path would have blocked that run — the registry is what keeps it verified", async () => {
    const onlyCurrent = new ResearchParameterBindingRegistry([currentBinding], []);
    const repository = { hub: vi.fn().mockResolvedValue(p04Row(oldBundle, oldDigest)) };
    const detail = await new ResearchFreezeService(repository as never, { FEATURE_RESEARCH_FREEZE: "true" } as never, onlyCurrent)
      .detail(scope, "run_w5a", {});
    expect(detail.freeze.integrity.state).toBe("BLOCKED");
    expect(detail.freeze.frozen_parameters).toEqual([]);
    expect(detail.freeze.integrity.checks[2]).toMatchObject({
      key: "P04_FIXED_PARAMETER_BUNDLE",
      state: "NOT_PUBLISHED",
      availability: { reason_code: "P16_HISTORICAL_PARAMETER_BINDING_NOT_REGISTERED" },
    });
  });

  it("refuses a parameter map that falls outside its historical declaration", () => {
    expect(declaredParameterRows({ rvol: { minimum: 1, maximum: 2.5, step: 0.1 } }, { rvol: 3 })).toBeNull();
    expect(declaredParameterRows({ rvol: { minimum: 1, maximum: 2.5, step: 0.1 } }, { other: 1 })).toBeNull();
  });
});
