import { executionRecipe, executionRecipeResources } from "./execution-recipes";
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
import { DELTA_WFO_V2_PROFILE_ID, DELTA_WFO_V2_PROFILE_DIGEST } from "./delta-wfo-v2.profile";
import { DELTA_CAUSAL_INNER_PROFILE, DELTA_CAUSAL_INNER_PROFILE_ID, DELTA_CAUSAL_INNER_PROFILE_DIGEST } from "./delta-causal-inner.profile";
import { VN_OBSERVED_FIXED_PROFILE_ID } from "./vn-observed-fixed.profile";
import { DELTA_PER_FOLD_DECAY_PROFILE_ID, DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_ID } from "./full02.profiles";

export const P04_FIXED_QUALIFICATION_PROFILE_ID = "p04.fixed-qualification.v1" as const;
export const DELTA_WFO_PROFILE_ID = "p10.delta-signal-notional-wfo.v1" as const;
export const RESEARCH_EXECUTION_PROFILE_IDS = [
  P04_FIXED_QUALIFICATION_PROFILE_ID,
  DELTA_WFO_PROFILE_ID,
  DELTA_WFO_V2_PROFILE_ID,
  DELTA_CAUSAL_INNER_PROFILE_ID,
  IMPORTED_ALPHA_PROFILE_ID,
  VN_OBSERVED_FIXED_PROFILE_ID,
  DELTA_PER_FOLD_DECAY_PROFILE_ID,
  DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_ID,
] as const;
export type ResearchExecutionProfileId = typeof RESEARCH_EXECUTION_PROFILE_IDS[number];

export const DELTA_WFO_PROFILE_DIGEST = "b86c66fa68c41e76c6106bd06a48b5ba1281bc4b168a915ec2fa7e34ec2a6cca" as const;

/** RS-02 lane pairs a sealed current-source artifact may carry. */
export const RS02_ADVANCED_WFO_SOURCE_ADAPTER_ID = "rs02.quantbt-advanced-wfo.v1" as const;
export const RS02_DELTA_WFO_GLOBAL_PROFILE_ID = "rs02.delta-wfo-global.v1" as const;
export const RS02_SIGNAL_NOTIONAL_SOURCE_ADAPTER_ID = "rs02.quantbt-signal-notional-wfo.v1" as const;
export const RS02_SIGNAL_NOTIONAL_PROFILE_ID = "rs02.delta-signal-notional-wfo.v1" as const;

export const DELTA_WFO_PROFILE = executionRecipe(DELTA_WFO_PROFILE_ID).descriptor;

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
export const DELTA_WFO_RESOURCE_PROFILE = Object.freeze(executionRecipeResources(executionRecipe(DELTA_WFO_PROFILE_ID), {}));

/**
 * Research preview only (FEATURE_RESEARCH_PREVIEW_LONG_WFO, AUTH_MODE=dev +
 * PORTAL_ENV=local). The locked profile above keeps its identity and digest;
 * a preview run records its real trial count in its requested spec. 2 is the
 * floor because the retained RS-02 lane seals at least two TRIAL rows.
 */
export const DELTA_WFO_PREVIEW_LONG_LIMITS = Object.freeze({
  min_trials: executionRecipe(DELTA_WFO_PROFILE_ID).preview_override.min_trials,
  max_trials: executionRecipe(DELTA_WFO_PROFILE_ID).preview_override.max_trials,
  cpu_seconds: executionRecipe(DELTA_WFO_PROFILE_ID).preview_override.cpu_seconds,
  wall_seconds: executionRecipe(DELTA_WFO_PROFILE_ID).preview_override.wall_seconds,
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
  if (!profileId) return false;
  try { return executionRecipe(profileId, profileDigest ?? null).adapter_kind === "DELTA_WFO"; }
  catch { return false; }
}

/** Profile-bound custody pair; global and causal seals may never be mixed. */
export function deltaWfoCurrentSourcePair(profileId: string | null | undefined, profileDigest: string | null | undefined) {
  if (!isDeltaWfoProfile(profileId, profileDigest)) return null;
  const row = executionRecipe(profileId!);
  return "current_source" in row.descriptor ? row.descriptor.current_source : null;
}
