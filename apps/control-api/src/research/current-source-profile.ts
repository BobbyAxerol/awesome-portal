/** Exact custody identity for optimizer retention; protocol is not inferred from the lane. */
import { executionRecipe, executionRecipes, type ExecutionRecipe } from "./execution-recipes";

export type CurrentSourcePair = { source_adapter_id: string; profile_id: string };
export type CurrentSourceMethod = "GLOBAL_WFO" | "CAUSAL_INNER" | "PER_FOLD_DECAY" | "THREE_WINDOW";
const intervals: Readonly<Record<string, number>> = {
  "1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000,
  "30min": 1_800_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000,
};
const descriptorPair = (recipe: ExecutionRecipe): CurrentSourcePair | null => {
  if (recipe.adapter_kind !== "DELTA_WFO" && recipe.adapter_kind !== "DELTA_THREE_WINDOW_OPTIMIZED") return null;
  return (recipe.descriptor as { current_source?: CurrentSourcePair }).current_source ?? null;
};
export const currentSourceExecutionRecipes = (): readonly ExecutionRecipe[] => executionRecipes.filter(row => descriptorPair(row) !== null);

/** The recipe owns semantics; textual lane/profile naming never determines protocol. */
export function currentSourceRetainedRecipe(profileId: string | null | undefined, sourceAdapterId?: string): ExecutionRecipe | null {
  if (!profileId) return null;
  const matches = currentSourceExecutionRecipes().filter(recipe => {
    const pair = descriptorPair(recipe)!;
    return pair.profile_id === profileId && (sourceAdapterId === undefined || pair.source_adapter_id === sourceAdapterId);
  });
  // Historical v1/v2 global recipes deliberately share a retained pair. Both must
  // describe the same semantic protocol and source interval before choosing one.
  const first = matches[0];
  if (!first) return null;
  if (matches.some(row => row.public_profile.protocol !== first.public_profile.protocol
      || row.public_profile.optimization_schedule !== first.public_profile.optimization_schedule
      || row.public_profile.timeframe !== first.public_profile.timeframe)) throw new Error("Ambiguous retained source semantics");
  return first;
}
export function currentSourceRetainedMethod(profileId: string | null | undefined, sourceAdapterId?: string): CurrentSourceMethod | null {
  const row = currentSourceRetainedRecipe(profileId, sourceAdapterId);
  if (row?.public_profile.protocol === "three_window_decay") return "THREE_WINDOW";
  if (row?.public_profile.optimization_schedule === "per_fold_causal") return "CAUSAL_INNER";
  if (row?.public_profile.optimization_schedule === "per_fold_decay") return "PER_FOLD_DECAY";
  if (row?.public_profile.protocol === "advanced") return "GLOBAL_WFO";
  // RS-02 pct-stop historical seals predate the shared execution recipe table.
  if (profileId === "rs02.delta-wfo-global.v1" && (sourceAdapterId === undefined || sourceAdapterId === "rs02.quantbt-advanced-wfo.v1")) return "GLOBAL_WFO";
  return null;
}
export function currentSourceRetainedIntervalMs(profileId: string, sourceAdapterId?: string): number | null {
  const row = currentSourceRetainedRecipe(profileId,sourceAdapterId);
  if (row) {
    const expected = intervals[row.public_profile.timeframe] ?? null;
    const clock = (row.descriptor as { source_clock?: { bar_interval_ms: number; clock_basis: string; source_timezone: string } }).source_clock;
    return clock ? clock.bar_interval_ms === expected && clock.clock_basis === "FIXED_UTC_INTERVAL_V1"
      && clock.source_timezone === "UTC" ? clock.bar_interval_ms : null : expected;
  }
  return currentSourceRetainedMethod(profileId,sourceAdapterId) === "GLOBAL_WFO" ? intervals["1h"]! : null;
}
export function isCurrentSourceRetainedPair(sourceAdapterId: string, profileId: string): boolean {
  return currentSourceRetainedMethod(profileId,sourceAdapterId) !== null;
}

export function currentSourceExecutionPair(profileId: string | null | undefined, profileDigest: string | null | undefined) {
  if (!profileId || !profileDigest) return null;
  try {
    const recipe = executionRecipe(profileId,profileDigest);
    return descriptorPair(recipe);
  } catch { return null; }
}
export function isCurrentSourceExecutionProfile(profileId: string | null | undefined, profileDigest: string | null | undefined): boolean {
  return currentSourceExecutionPair(profileId,profileDigest) !== null;
}
