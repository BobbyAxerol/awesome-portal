import { executionRecipe, executionRecipeResources } from "./execution-recipes";
/** A new immutable temporal executor. The original W1 profile is unchanged. */
import { createHash } from "node:crypto";
export const DELTA_WFO_V2_PROFILE_ID = "p10.delta-signal-notional-wfo.v2" as const;
export const DELTA_WFO_V2_PROFILE = executionRecipe(DELTA_WFO_V2_PROFILE_ID).descriptor;
export const DELTA_WFO_V2_PROFILE_DIGEST = "d65291f776dce1fef162da9eb6505ba63fc6e3ae0f55679fe12dece3858c7fa0" as const;
const normalize = (value: unknown): unknown => Array.isArray(value) ? value.map(normalize)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => [key, normalize(entry)])) : value;
if (createHash("sha256").update(JSON.stringify(normalize(DELTA_WFO_V2_PROFILE))).digest("hex") !== DELTA_WFO_V2_PROFILE_DIGEST) {
  throw new Error("Requested-spec v2 executor profile digest drifted");
}
export const DELTA_WFO_V2_WORK_SCHEMA_VERSION = "research.p10.delta-wfo-work.v2" as const;
