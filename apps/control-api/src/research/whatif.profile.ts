/**
 * W5a · A10c — the one locked what-if diagnostic profile (Screen 07 §2.5).
 *
 * A 9×9 grid around a sealed Delta WFO run's frozen θ* over two declared
 * parameters. The HiFi names the axes `entry_z` and `atr_mult`; the Delta
 * declaration has neither, so they map to the two continuous declared
 * parameters with the same roles (decision recorded in the W5a evidence):
 *
 *   entry_z  → `rvol`       (relative-volume entry threshold, 1.0–2.5 step 0.1)
 *   atr_mult → `slpercent`  (hard stop distance,              0.7–2.5 step 0.1)
 *
 * Each axis runs θ* ± 4 declared steps and clamps at its declaration, so a
 * θ* near a bound yields fewer than 81 unique evaluations — clamped cells map
 * to the same canonical evaluation instead of being re-run or interpolated.
 *
 * One object, one pinned digest, twin in Python
 * (`research_whatif_profile.py`); a drift on either side fails at load.
 */

import { createHash } from "node:crypto";

import { DELTA_WFO_PROFILE_DIGEST, DELTA_WFO_PROFILE_ID } from "./delta-wfo.profile";

export const WHATIF_PROFILE_ID = "p16.delta-whatif-grid.v1" as const;

export const WHATIF_PROFILE = Object.freeze({
  schema_version: "research.p16.delta-whatif-grid-profile.v1",
  profile_id: WHATIF_PROFILE_ID,
  parent_profile_id: DELTA_WFO_PROFILE_ID,
  parent_profile_digest: DELTA_WFO_PROFILE_DIGEST,
  axes: Object.freeze([
    Object.freeze({ parameter: "rvol", hifi_name: "entry_z" }),
    Object.freeze({ parameter: "slpercent", hifi_name: "atr_mult" }),
  ]),
  radius_steps: 4,
  grid_size: 9,
  max_evaluations: 81,
  objective: "MODE_1_DECAY_J_GLOBAL_STUDY_IS",
  evaluation: "OPTUNA_ENQUEUED_TRIALS_THROUGH_QUANTBT_OBJECTIVE",
  child_limits: Object.freeze({ cpu_seconds: 120, wall_seconds: 240 }),
} as const);

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

export function whatIfProfileDigest(value: unknown = WHATIF_PROFILE): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

/** Pinned here and in `research_whatif_profile.py`; a drift fails at module load. */
export const WHATIF_PROFILE_DIGEST = "3c29160abf214a0ef1c20c630048442ef131aadc1d00849f69ae428d0ff513bc" as const;

const computed = whatIfProfileDigest();
if (computed !== WHATIF_PROFILE_DIGEST) {
  throw new Error(`What-if profile digest drifted: computed ${computed}, pinned ${WHATIF_PROFILE_DIGEST}`);
}

export const WHATIF_RESOURCE_PROFILE = Object.freeze({
  memoryBytes: 4 * 1024 * 1024 * 1024,
  cpuSeconds: WHATIF_PROFILE.child_limits.cpu_seconds,
  scratchBytes: 128 * 1024 * 1024,
  ioBytes: 512 * 1024 * 1024,
});
export const WHATIF_RESOURCE_CLASS = "p16-delta-whatif-v1" as const;
export const WHATIF_WORK_SCHEMA_VERSION = "research.p16.delta-whatif-work.v1" as const;
