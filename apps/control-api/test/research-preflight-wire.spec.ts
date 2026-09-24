import { describe, expect, it } from "vitest";
import type { components } from "../../../packages/contracts/generated/research-preflight";
import { ResearchRequestedSpecSchema } from "../src/research/preflight.contract";
import { assertDeclaredOptimization } from "../src/research/preflight.service";

const request: components["schemas"]["RequestedSpec"] = {
  schema_version: "research.requested-spec.v1",
  alpha_binding: { alpha_id: "alpha_p02", alpha_version_id: "av_p02" },
  not_publishable: false,
  strategy_id: "alpha_p02",
  execution_route: "signal_notional",
  route_params: {},
  data: { dataset_id: "btc_usdt_1h", symbol: "BTCUSDT", timeframe: "1h" },
  protocol: "three_window_decay",
  windows: {
    is: { start: "2024-01-01T00:00:00Z", end_exclusive: "2024-02-01T00:00:00Z" },
    oos: { start: "2024-02-01T00:00:00Z", end_exclusive: "2024-03-01T00:00:00Z" },
    holdout: { start: "2024-03-01T00:00:00Z", end_exclusive: "2024-04-01T00:00:00Z" },
  },
  optimization_mode: "mode_1",
  optimization_schedule: "global",
  parameter_space_overrides: [],
  optuna_trials: 1,
  early_stopping: null,
  random_seed: 7,
  optimization_config: {},
  client: { engine_release_id: "er_quantbt_111", config_digest: "a".repeat(64) },
};

const alpha = {
  alphaId: "alpha_p02", alphaVersionId: "av_p02", entrypoint: "generate",
  declaredContract: {
    entrypoint: "generate", timeframes: ["1h"], required_columns: ["open", "close"], warmup_bars: 1,
    determinism: { seed_required: true },
    parameter_space: {
      threshold: { kind: "int_range", low: 1, high: 9, step: 2 },
      side: { kind: "categorical", values: ["long", "short"] },
    },
  },
};

describe("CG-P08-05 immutable AlphaVersion optimization validation", () => {
  it("rejects missing required seed before snapshot creation", () => {
    expect(() => assertDeclaredOptimization(alpha, { ...request, random_seed: null }))
      .toThrow("requires random_seed");
  });
  it("accepts declared pins and sweeps and rejects undeclared, stepped-out or reversed values", () => {
    expect(() => assertDeclaredOptimization(alpha, { ...request, parameter_space_overrides: [
      { name: "threshold", kind: "sweep", low: 1, high: 7 },
      { name: "side", kind: "pin", value: "long" },
    ] })).not.toThrow();
    for (const override of [
      { name: "other", kind: "pin", value: 1 },
      { name: "threshold", kind: "pin", value: 2 },
      { name: "threshold", kind: "sweep", low: 7, high: 1 },
      { name: "side", kind: "pin", value: "neutral" },
    ] as components["schemas"]["RequestedSpec"]["parameter_space_overrides"]) {
      expect(() => assertDeclaredOptimization(alpha, { ...request, parameter_space_overrides: [override] }))
        .toThrow("AlphaVersion");
    }
  });
  it("refuses a corrupt historical declaration rather than inventing a source space", () => {
    expect(() => assertDeclaredOptimization({ ...alpha, entrypoint: "different" }, request))
      .toThrow("declaration is unavailable");
  });
});
describe("CG-P02-01 generated request wire", () => {
  it("parses a generated-type payload without a schema-only $defs field", () => {
    expect(Object.keys(request)).not.toContain("$defs");
    expect(ResearchRequestedSpecSchema.parse(request)).toEqual(request);
  });
});
