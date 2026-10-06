/** Exact custody identity for optimizer retention; protocol is not inferred from the lane. */
import { executionRecipe } from "./execution-recipes";

export function currentSourceExecutionPair(profileId: string | null | undefined, profileDigest: string | null | undefined) {
  if (!profileId || !profileDigest) return null;
  try {
    const recipe = executionRecipe(profileId,profileDigest);
    if (recipe.adapter_kind !== "DELTA_WFO" && recipe.adapter_kind !== "DELTA_THREE_WINDOW_OPTIMIZED") return null;
    const descriptor = recipe.descriptor as { current_source?: { source_adapter_id: string; profile_id: string } };
    return descriptor.current_source ?? null;
  } catch { return null; }
}
export function isCurrentSourceExecutionProfile(profileId: string | null | undefined, profileDigest: string | null | undefined): boolean {
  return currentSourceExecutionPair(profileId,profileDigest) !== null;
}
