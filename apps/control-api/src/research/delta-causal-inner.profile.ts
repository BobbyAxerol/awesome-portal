/** Additional immutable profile; never broadens a historical global study. */
import { createHash } from "node:crypto";

export const DELTA_CAUSAL_INNER_PROFILE_ID = "p10.delta-signal-notional-causal-inner.v1" as const;
export const DELTA_CAUSAL_INNER_PROFILE = Object.freeze({
  schema_version: "research.p10.delta-causal-inner-profile.v1",
  profile_id: DELTA_CAUSAL_INNER_PROFILE_ID,
  adapter_id: "p04.delta-rsi.v1",
  adapter_contract_digest: "9ade757b5c1cd87681a2efb49011c84a96211939710dcd32c9fd1c7777e95784",
  engine_release_id: "er_quantbt_111", requested_spec_version: "research.requested-spec.v2",
  execution_route: "signal_notional", protocol: "advanced", timeframe: "1h",
  frequencies: ["weekly", "monthly", "quarterly"], window_modes: ["expanding", "rolling"],
  max_span_days: 92, fold_bounds: { min: 2, max: 16 },
  optimization_mode: "mode_1_decay", optimization_schedule: "per_fold_causal",
  random_seed: 42, max_guard_bars: 10_000,
  inner_validation: "REQUIRED_ENGINE_NESTED_OUTER_IS_ONLY",
  inner_constraints: {
    fold_bounds: { min: 2, max: 16 }, frequencies: ["weekly", "monthly", "quarterly"],
    window_modes: ["expanding", "rolling"], train_window_pattern: "^[1-9][0-9]{0,4}(D|h)$",
  },
  trial_count: { min: 3, max: 3 }, trial_scope: "PER_OUTER_FOLD_STUDY", max_total_trials: 48,
  current_source: { source_adapter_id: "rs02.quantbt-signal-notional-causal-inner.v1", profile_id: "rs02.delta-signal-notional-causal-inner.v1" },
  child_limits: { cpu_seconds: 120, wall_seconds: 240 },
} as const);
export const DELTA_CAUSAL_INNER_PROFILE_DIGEST = "60a041b373808405f8896aee0a3421d41cc2199d516dadc9f40e1187e2fefdd1" as const;
const normalize = (value: unknown): unknown => Array.isArray(value) ? value.map(normalize)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => [key, normalize(entry)])) : value;
if (createHash("sha256").update(JSON.stringify(normalize(DELTA_CAUSAL_INNER_PROFILE))).digest("hex") !== DELTA_CAUSAL_INNER_PROFILE_DIGEST) {
  throw new Error("Causal inner executor profile digest drifted");
}
export const DELTA_CAUSAL_INNER_WORK_SCHEMA_VERSION = "research.p10.delta-causal-inner-work.v1" as const;
