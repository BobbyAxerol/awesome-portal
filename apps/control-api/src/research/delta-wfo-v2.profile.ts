/** A new immutable temporal executor. The original W1 profile is unchanged. */
import { createHash } from "node:crypto";
export const DELTA_WFO_V2_PROFILE_ID = "p10.delta-signal-notional-wfo.v2" as const;
export const DELTA_WFO_V2_PROFILE = Object.freeze({
  schema_version: "research.p10.delta-wfo-profile.v2",
  profile_id: DELTA_WFO_V2_PROFILE_ID,
  adapter_id: "p04.delta-rsi.v1",
  adapter_contract_digest: "9ade757b5c1cd87681a2efb49011c84a96211939710dcd32c9fd1c7777e95784",
  engine_release_id: "er_quantbt_111",
  requested_spec_version: "research.requested-spec.v2",
  execution_route: "signal_notional", protocol: "advanced", timeframe: "1h",
  frequencies: ["weekly", "monthly", "quarterly"] as const,
  window_modes: ["expanding", "rolling"] as const,
  max_span_days: 92, fold_bounds: { min: 2, max: 16 },
  optimization_mode: "mode_1_decay", optimization_schedule: "global",
  random_seed: 42, max_guard_bars: 10_000,
  inner_validation: "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
  trial_count: { min: 3, max: 3 },
  current_source: { source_adapter_id: "rs02.quantbt-signal-notional-wfo.v1", profile_id: "rs02.delta-signal-notional-wfo.v1" },
  child_limits: { cpu_seconds: 120, wall_seconds: 240 },
});
export const DELTA_WFO_V2_PROFILE_DIGEST = "d65291f776dce1fef162da9eb6505ba63fc6e3ae0f55679fe12dece3858c7fa0" as const;
const normalize = (value: unknown): unknown => Array.isArray(value) ? value.map(normalize)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => [key, normalize(entry)])) : value;
if (createHash("sha256").update(JSON.stringify(normalize(DELTA_WFO_V2_PROFILE))).digest("hex") !== DELTA_WFO_V2_PROFILE_DIGEST) {
  throw new Error("Requested-spec v2 executor profile digest drifted");
}
export const DELTA_WFO_V2_WORK_SCHEMA_VERSION = "research.p10.delta-wfo-work.v2" as const;
