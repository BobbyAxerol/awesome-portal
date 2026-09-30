/**
 * W1 §1.1 locked run execution profiles.
 *
 * A P10 run carries exactly one execution profile. The P04 fixed
 * qualification keeps its historical wire byte-for-byte (it has no profile
 * fields at all); the Delta signal-notional walk-forward profile is one
 * immutable object whose canonical digest is pinned here and in the Python
 * twin (`research_delta_wfo_profile.py`). A drift on either side fails
 * closed at module load rather than admitting a different profile under the
 * old identity.
 */

import { createHash } from "node:crypto";

import { IMPORTED_ALPHA_PROFILE_ID } from "./imported-alpha.profile";

export const P04_FIXED_QUALIFICATION_PROFILE_ID = "p04.fixed-qualification.v1" as const;
export const DELTA_WFO_PROFILE_ID = "p10.delta-signal-notional-wfo.v1" as const;
export const RESEARCH_EXECUTION_PROFILE_IDS = [
  P04_FIXED_QUALIFICATION_PROFILE_ID,
  DELTA_WFO_PROFILE_ID,
  IMPORTED_ALPHA_PROFILE_ID,
] as const;
export type ResearchExecutionProfileId = typeof RESEARCH_EXECUTION_PROFILE_IDS[number];

export const DELTA_WFO_PROFILE_DIGEST = "b86c66fa68c41e76c6106bd06a48b5ba1281bc4b168a915ec2fa7e34ec2a6cca" as const;

/** RS-02 lane pairs a sealed current-source artifact may carry. */
export const RS02_ADVANCED_WFO_SOURCE_ADAPTER_ID = "rs02.quantbt-advanced-wfo.v1" as const;
export const RS02_DELTA_WFO_GLOBAL_PROFILE_ID = "rs02.delta-wfo-global.v1" as const;
export const RS02_SIGNAL_NOTIONAL_SOURCE_ADAPTER_ID = "rs02.quantbt-signal-notional-wfo.v1" as const;
export const RS02_SIGNAL_NOTIONAL_PROFILE_ID = "rs02.delta-signal-notional-wfo.v1" as const;

export const DELTA_WFO_PROFILE = Object.freeze({
  schema_version: "research.p10.delta-wfo-profile.v1",
  profile_id: DELTA_WFO_PROFILE_ID,
  adapter_id: "p04.delta-rsi.v1",
  adapter_contract_digest: "9ade757b5c1cd87681a2efb49011c84a96211939710dcd32c9fd1c7777e95784",
  engine_release_id: "er_quantbt_111",
  execution_route: "signal_notional",
  protocol: "advanced",
  frequency: "weekly",
  window_mode: "expanding",
  timeframe: "1h",
  max_span_days: 92,
  fold_bounds: Object.freeze({ min: 2, max: 16 }),
  optimization_mode: "mode_1_decay",
  optimization_schedule: "global",
  optuna_trials: 3,
  random_seed: 42,
  current_source: Object.freeze({
    source_adapter_id: RS02_SIGNAL_NOTIONAL_SOURCE_ADAPTER_ID,
    profile_id: RS02_SIGNAL_NOTIONAL_PROFILE_ID,
  }),
  child_limits: Object.freeze({ cpu_seconds: 120, wall_seconds: 240 }),
} as const);

// Local twin of `sha256ResearchJson` (P08 canonical form: code-point key
// order, compact separators). Kept local so repository/admission modules can
// import this file without a preflight-service import cycle; the unit test
// pins that both functions produce the same hex.
function canonicalJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
          .map(([key, nested]) => [key, normalize(nested)]),
      );
    }
    return input;
  };
  return JSON.stringify(normalize(value));
}

export function deltaWfoProfileDigest(value: unknown = DELTA_WFO_PROFILE): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

const computed = deltaWfoProfileDigest();
if (computed !== DELTA_WFO_PROFILE_DIGEST) {
  throw new Error(`Delta WFO profile digest drifted: computed ${computed}, pinned ${DELTA_WFO_PROFILE_DIGEST}`);
}

/** Durable worker cost declared for one WFO job (P06 scheduler admission). */
export const DELTA_WFO_RESOURCE_PROFILE = Object.freeze({
  memoryBytes: 4 * 1024 * 1024 * 1024,
  cpuSeconds: DELTA_WFO_PROFILE.child_limits.cpu_seconds,
  scratchBytes: 128 * 1024 * 1024,
  ioBytes: 512 * 1024 * 1024,
});

/**
 * Research preview only (FEATURE_RESEARCH_PREVIEW_LONG_WFO, AUTH_MODE=dev +
 * PORTAL_ENV=local). The locked profile above keeps its identity and digest;
 * a preview run records its real trial count in its requested spec. 2 is the
 * floor because the retained RS-02 lane seals at least two TRIAL rows.
 */
export const DELTA_WFO_PREVIEW_LONG_LIMITS = Object.freeze({
  min_trials: 2,
  max_trials: 400,
  cpu_seconds: 1_800,
  wall_seconds: 3_600,
} as const);

export const DELTA_WFO_PREVIEW_LONG_RESOURCE_PROFILE = Object.freeze({
  ...DELTA_WFO_RESOURCE_PROFILE,
  cpuSeconds: DELTA_WFO_PREVIEW_LONG_LIMITS.cpu_seconds,
});

export function deltaWfoPreviewLongEnabled(
  config: { FEATURE_RESEARCH_PREVIEW_LONG_WFO?: "true" | "false" } | null | undefined,
): boolean {
  return config?.FEATURE_RESEARCH_PREVIEW_LONG_WFO === "true";
}

export const DELTA_WFO_RESOURCE_CLASS = "p10-delta-wfo-v1" as const;
export const DELTA_WFO_WORK_SCHEMA_VERSION = "research.p10.delta-wfo-work.v1" as const;

export function isDeltaWfoProfile(profileId: string | null | undefined, profileDigest: string | null | undefined): boolean {
  return profileId === DELTA_WFO_PROFILE_ID && profileDigest === DELTA_WFO_PROFILE_DIGEST;
}
