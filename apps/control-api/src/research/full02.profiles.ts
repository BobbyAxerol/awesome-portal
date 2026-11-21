/** FULL-02: new immutable identities, never a widening of historical P04/W1. */
import { executionRecipe } from "./execution-recipes";

export const DELTA_PER_FOLD_DECAY_PROFILE_ID = "p10.delta-signal-notional-per-fold-decay.v1" as const;
export const DELTA_PER_FOLD_DECAY_PROFILE_DIGEST = "60ae004f65b0eba83ce12089b0224ab467b30a9acc4161ad0787108344cd134e" as const;
export const DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_ID = "p10.delta-signal-notional-three-window-optimized.v1" as const;
export const DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_DIGEST = "0e210afa7c891cfb93e78126a4ca86fb6c1a25d3bcb4d8d81a5534accb5ee3c9" as const;
export const DELTA_PER_FOLD_DECAY_PROFILE = executionRecipe(DELTA_PER_FOLD_DECAY_PROFILE_ID, DELTA_PER_FOLD_DECAY_PROFILE_DIGEST).descriptor;
export const DELTA_THREE_WINDOW_OPTIMIZED_PROFILE = executionRecipe(DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_ID, DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_DIGEST).descriptor;

export function full02QualificationAllowed(profileId: string, flags: Record<string, unknown>): boolean {
  return flags.RESEARCH_RECIPE_QUALIFICATION_PROFILE_ID === profileId
    && flags.PORTAL_ENV === "local" && flags.AUTH_MODE === "dev"
    && flags.FEATURE_RESEARCH_FULL02_PROFILE === "true";
}
