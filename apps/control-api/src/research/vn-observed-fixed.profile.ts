/** One source-qualified research profile; no VN venue/calendar authority. */
import { createHash } from "node:crypto";

export const VN_OBSERVED_FIXED_PROFILE_ID = "p10.vn-stock-daily-observed-fixed.v1" as const;
export const VN_OBSERVED_FIXED_PROFILE_DIGEST = "acb6566ebae23bcf77c77974136c9d083a95f0967260b1332530f600f5abe00e" as const;
export const VN_OBSERVED_FIXED_PROFILE = Object.freeze({
  schema_version: "research.p10.vn-daily-observed-fixed-profile.v1",
  profile_id: VN_OBSERVED_FIXED_PROFILE_ID,
  adapter_id: "p04.delta-rsi.v1",
  adapter_contract_digest: "9ade757b5c1cd87681a2efb49011c84a96211939710dcd32c9fd1c7777e95784",
  engine_release_id: "er_quantbt_111",
  execution_route: "signal_notional",
  protocol: "three_window_decay",
  dataset_id: "vn-stock-daily", symbol: "FPT", timeframe: "1d",
  source_timezone: "Asia/Ho_Chi_Minh", clock_basis: "OBSERVED_SOURCE_LOCAL_DATE_V1",
  warmup_bars: 300, warmup_semantics: "LAST_N_OBSERVED_PREDECESSORS_V1",
  max_span_days: 732, optuna_trials: 1, parameter_policy: "P04_FIXED_PARAMETERS_V1",
  account_model: "GENERIC_SIGNAL_NOTIONAL_RESEARCH_NOT_VN_VENUE",
  calendar_authority: "NOT_PUBLISHED",
  child_limits: Object.freeze({ cpu_seconds: 45, wall_seconds: 90 }),
} as const);

const normalize = (value: unknown): unknown => Array.isArray(value) ? value.map(normalize)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => [key, normalize(entry)])) : value;
export function vnObservedFixedProfileDigest(value: unknown = VN_OBSERVED_FIXED_PROFILE): string {
  return createHash("sha256").update(JSON.stringify(normalize(value)), "utf8").digest("hex");
}
if (vnObservedFixedProfileDigest() !== VN_OBSERVED_FIXED_PROFILE_DIGEST) {
  throw new Error("VN observed fixed profile digest drifted");
}
export function isVnObservedFixedProfile(id: string | null | undefined, digest: string | null | undefined): boolean {
  return id === VN_OBSERVED_FIXED_PROFILE_ID && digest === VN_OBSERVED_FIXED_PROFILE_DIGEST;
}
/** Source daily labels are local midnights, including when written as explicit UTC instants. */
export function vnObservedSourceDateMs(value: unknown): number | null {
  if (typeof value !== "string" || value.length > 64 ||
    !/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.0{1,9})?)?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value)) return null;
  const normalized = value.replace(" ", "T"), date = normalized.slice(0, 10);
  const [year, month, day] = date.split("-").map(Number);
  const check = new Date(0); check.setUTCFullYear(year!, month! - 1, day!); check.setUTCHours(0, 0, 0, 0);
  if (check.toISOString().slice(0, 10) !== date) return null;
  const withTime = normalized.length === 10 ? `${normalized}T00:00:00` : normalized;
  const instant = Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(withTime) ? withTime : `${withTime}+07:00`);
  return Number.isSafeInteger(instant) && instant >= 0 && (instant + 7 * 3_600_000) % 86_400_000 === 0 ? instant : null;
}
export const VN_OBSERVED_FIXED_WORK_SCHEMA_VERSION = "research.p10.vn-observed-fixed-work.v1" as const;
export const VN_OBSERVED_FIXED_RESOURCE_CLASS = "p10-vn-observed-fixed-v1" as const;
export const VN_OBSERVED_FIXED_RESOURCE_PROFILE = Object.freeze({
  memoryBytes: 4 * 1024 * 1024 * 1024, cpuSeconds: 45,
  scratchBytes: 64 * 1024 * 1024, ioBytes: 512 * 1024 * 1024,
});
