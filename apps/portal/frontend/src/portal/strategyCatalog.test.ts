/**
 * Strategy catalog tests.
 *
 * Driven by the shipped registry sources (`alphas.v1.json`,
 * `engine-capabilities.v1.json`) rather than invented objects, so a change to
 * the real manifests shows up here instead of passing silently.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { StrategyResponse } from "./contracts";
import {
  buildCatalog,
  certifiedProtocols,
  parseAlphas,
  parseCapabilities,
  protocolLimits,
} from "./strategyCatalog";

const REGISTRY = join(process.cwd(), "../registry");

/** The registry SOURCE files; the API projections are derived from these. */
const alphaSource = JSON.parse(readFileSync(join(REGISTRY, "alphas.v1.json"), "utf8"));
const capabilitySource = JSON.parse(
  readFileSync(join(REGISTRY, "engine-capabilities.v1.json"), "utf8"),
);

/** Mirrors the backend's public projection of an alpha manifest. */
function alphaProjection() {
  return {
    schema_version: "alpha-manifest/v1",
    alphas: alphaSource.alphas.map((alpha: Record<string, any>) => ({
      alpha_id: alpha.alpha_id,
      version: alpha.version,
      name: alpha.name,
      owner: { team: alpha.owner.team },
      entrypoint: alpha.entrypoint,
      artifact_digest: alpha.artifact.digest,
      strategy: {
        family: alpha.strategy.family,
        input_kind: alpha.strategy.input_kind,
        supported_endpoint_ids: alpha.strategy.supported_endpoint_ids,
        execution_contracts: alpha.strategy.execution_contracts,
      },
      data_requirements: {
        asset_classes: alpha.data_requirements.asset_classes,
        columns: alpha.data_requirements.columns,
        timeframes: alpha.data_requirements.timeframes,
        warmup_bars: alpha.data_requirements.warmup_bars,
      },
      parameters: { manager_exposed: alpha.parameters.manager_exposed },
      lifecycle: {
        stage: alpha.lifecycle.stage,
        quarantined: alpha.lifecycle.quarantined,
        certification: alpha.lifecycle.certification,
      },
    })),
  };
}

const builtin: StrategyResponse = {
  strategy_id: "delta-rsi-polynomial-alpha",
  display_name: "Delta-RSI Polynomial Alpha",
  version: "1.0.0",
  default_timeframe: "1h",
  required_columns: ["open", "high", "low", "close", "volume"],
  structural_contract: {},
  parameter_space: { window: { low: 20, high: 60, step: 2 } },
};

describe("capability parsing", () => {
  it("reads the certified protocols from the shipped manifest", () => {
    const doc = parseCapabilities(capabilitySource);
    expect(certifiedProtocols(doc)).toEqual(["advanced_walk_forward", "three_window_decay"]);
  });

  it("carries the declared resource ceiling per protocol", () => {
    const doc = parseCapabilities(capabilitySource);
    expect(protocolLimits(doc, "three_window_decay")).toEqual({
      maxTrials: 4000,
      maxParameterSpaceEntries: 128,
    });
  });

  it("reports no ceiling for a protocol the manifest does not declare", () => {
    const doc = parseCapabilities(capabilitySource);
    expect(protocolLimits(doc, "not_a_protocol")).toEqual({
      maxTrials: null,
      maxParameterSpaceEntries: null,
    });
  });

  it("never invents capabilities from a malformed document", () => {
    for (const raw of [null, undefined, 42, "x", {}, { capabilities: "nope" }]) {
      const doc = parseCapabilities(raw);
      expect(doc.capabilities).toEqual([]);
      expect(certifiedProtocols(doc)).toEqual([]);
    }
  });

  it("treats an uncertified capability as not certified", () => {
    const doc = parseCapabilities({
      capabilities: [{ capability_id: "X", protocol: "p", endpoint_id: "e", certified: false }],
    });
    expect(certifiedProtocols(doc)).toEqual([]);
  });
});

describe("alpha parsing", () => {
  it("reads the shipped alpha manifest projection", () => {
    const alphas = parseAlphas(alphaProjection());
    expect(alphas).toHaveLength(1);
    expect(alphas[0].alphaId).toBe("delta-rsi-polynomial");
    expect(alphas[0].timeframes).toEqual(["1h", "4h", "1d"]);
    expect(alphas[0].warmupBars).toBe(300);
    expect(alphas[0].supportedEndpointIds).toEqual(["walk_forward"]);
  });

  it("returns an empty list rather than guessing from a malformed body", () => {
    for (const raw of [null, {}, { alphas: null }, [1, 2]]) {
      expect(parseAlphas(raw)).toEqual([]);
    }
  });
});

describe("catalog", () => {
  const capabilities = parseCapabilities(capabilitySource);
  const alphas = parseAlphas(alphaProjection());

  it("does not hard-code any strategy id", () => {
    expect(buildCatalog([], [], capabilities)).toEqual([]);
  });

  it("merges the imported manifest onto its runtime registration", () => {
    const catalog = buildCatalog([builtin], alphas, capabilities);
    expect(catalog).toHaveLength(1);
    const entry = catalog[0];
    // Runtime id wins: that is what a run request must carry.
    expect(entry.strategyId).toBe("delta-rsi-polynomial-alpha");
    expect(entry.origin).toBe("imported");
    expect(entry.runtime).not.toBeNull();
    expect(entry.manifest).not.toBeNull();
    expect(entry.blockedReason).toBeNull();
  });

  it("blocks an imported alpha that has no runtime registration", () => {
    const catalog = buildCatalog([], alphas, capabilities);
    expect(catalog[0].blockedReason).toContain("not yet registered in the runtime registry");
  });

  it("blocks a quarantined alpha even when it is registered", () => {
    const quarantined = alphas.map((alpha) => ({ ...alpha, quarantined: true }));
    const catalog = buildCatalog([builtin], quarantined, capabilities);
    expect(catalog[0].blockedReason).toContain("quarantine");
  });

  it("blocks an alpha whose endpoint the installed release has not certified", () => {
    const exotic = alphas.map((alpha) => ({ ...alpha, supportedEndpointIds: ["portfolio_rebalance"] }));
    const catalog = buildCatalog([builtin], exotic, capabilities);
    expect(catalog[0].blockedReason).toContain("does not certify the");
  });

  it("lists a built-in that no manifest claims", () => {
    const other: StrategyResponse = { ...builtin, strategy_id: "other-strategy", display_name: "Other" };
    const catalog = buildCatalog([builtin, other], alphas, capabilities);
    const ids = catalog.map((entry) => entry.strategyId);
    expect(ids).toContain("other-strategy");
    expect(catalog.find((e) => e.strategyId === "other-strategy")?.origin).toBe("builtin");
  });

  it("keeps blocked entries in the list so the catalog is not silently smaller", () => {
    const catalog = buildCatalog([], alphas, capabilities);
    expect(catalog).toHaveLength(1);
    expect(catalog[0].blockedReason).not.toBeNull();
  });
});
