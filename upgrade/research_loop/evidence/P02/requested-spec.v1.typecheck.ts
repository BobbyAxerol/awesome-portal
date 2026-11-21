/**
 * Compile-only guard for the generated-client declaration.  It intentionally
 * has no runtime import, source call, network access, or deployment effect.
 */
import type { RequestedSpecV1 } from "./requested-spec.v1";

const validIntrabar: RequestedSpecV1 = {
  schema_version: "research.requested-spec.v1",
  alpha_binding: { alpha_id: "alpha_p02", alpha_version_id: "alpha_p02_v1" },
  not_publishable: false,
  strategy_id: "alpha_p02",
  execution_route: "intrabar_bracket",
  route_params: {
    intrabar: {
      level_mode: "hlc_conservative",
      same_bar_policy: "stop_first",
      tick_size: "0.01",
    },
  },
  data: { dataset_id: "btc_usdt_1m", symbol: "BTC/USDT", timeframe: "1m" },
  protocol: "three_window_decay",
  windows: {
    is: { start: "2024-01-01T00:00", end_exclusive: "2024-02-01T00:00" },
    oos: { start: "2024-02-01T00:00", end_exclusive: "2024-03-01T00:00" },
    holdout: { start: "2024-03-01T00:00", end_exclusive: "2024-04-01T00:00" },
  },
  optimization_mode: "mode_1",
  optimization_schedule: "global",
  parameter_space_overrides: [{ name: "entry_z", kind: "sweep", low: 1, high: 2 }],
  optuna_trials: 24,
  early_stopping: null,
  random_seed: 7,
  optimization_config: { sampler_seed: 13 },
  client: { engine_release_id: "quantbt_1_1_1", config_digest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
};
void validIntrabar;

// The route discriminator is intentionally coupled to its nested parameters.
const invalidRoutePair: RequestedSpecV1 = {
  schema_version: "research.requested-spec.v1",
  alpha_binding: { alpha_id: "alpha_p02", alpha_version_id: "alpha_p02_v1" },
  not_publishable: false,
  strategy_id: "alpha_p02",
  execution_route: "portfolio",
  route_params: {
    // @ts-expect-error intrabar parameters are not valid for the portfolio route.
    intrabar: {
      level_mode: "hlc_conservative",
      same_bar_policy: "stop_first",
      tick_size: "0.01",
    },
  },
  data: { dataset_id: "btc_usdt_1m", symbol: "BTC/USDT", timeframe: "1m" },
  protocol: "three_window_decay",
  windows: {
    is: { start: "2024-01-01T00:00", end_exclusive: "2024-02-01T00:00" },
    oos: { start: "2024-02-01T00:00", end_exclusive: "2024-03-01T00:00" },
    holdout: { start: "2024-03-01T00:00", end_exclusive: "2024-04-01T00:00" },
  },
  optimization_mode: "mode_1",
  optimization_schedule: "global",
  parameter_space_overrides: [],
  optuna_trials: 24,
  early_stopping: null,
  random_seed: null,
  optimization_config: {},
  client: { engine_release_id: "quantbt_1_1_1", config_digest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
};
void invalidRoutePair;
