import { describe, expect, it } from "vitest";
import type { components } from "../../../packages/contracts/generated/research-preflight";
import { ResearchRequestedSpecSchema } from "../src/research/preflight.contract";

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

describe("CG-P02-01 generated request wire", () => {
  it("parses a generated-type payload without a schema-only $defs field", () => {
    expect(Object.keys(request)).not.toContain("$defs");
    expect(ResearchRequestedSpecSchema.parse(request)).toEqual(request);
  });
});
