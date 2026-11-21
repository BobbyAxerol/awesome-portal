import { executionRecipe, executionRecipeResources } from "./execution-recipes";
/** Additional immutable profile; never broadens a historical global study. */
import { createHash } from "node:crypto";

export const DELTA_CAUSAL_INNER_PROFILE_ID = "p10.delta-signal-notional-causal-inner.v1" as const;
export const DELTA_CAUSAL_INNER_PROFILE = executionRecipe(DELTA_CAUSAL_INNER_PROFILE_ID).descriptor;
export const DELTA_CAUSAL_INNER_PROFILE_DIGEST = "60a041b373808405f8896aee0a3421d41cc2199d516dadc9f40e1187e2fefdd1" as const;
const normalize = (value: unknown): unknown => Array.isArray(value) ? value.map(normalize)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => [key, normalize(entry)])) : value;
if (createHash("sha256").update(JSON.stringify(normalize(DELTA_CAUSAL_INNER_PROFILE))).digest("hex") !== DELTA_CAUSAL_INNER_PROFILE_DIGEST) {
  throw new Error("Causal inner executor profile digest drifted");
}
export const DELTA_CAUSAL_INNER_WORK_SCHEMA_VERSION = "research.p10.delta-causal-inner-work.v1" as const;
