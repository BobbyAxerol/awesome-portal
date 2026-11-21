/** Presentation only: never part of an execution descriptor, seal or grant. */
import type { RunSetupProfile } from "./run-setup.contract";
export const RECIPE_PRESENTATION_REVISION = "research.recipe-presentation.v1" as const;
export function recipePresentation(profile: {
  execution_route: string; protocol: string; optimization_mode: string; optimization_schedule: string;
  trial_count: { min: number; max: number };
}): NonNullable<RunSetupProfile["recipe"]> {
  const modes: Record<string, { label: string; rank: number }> = {
    mode_1_decay: { label: "Decay robustness", rank: 1 },
    mode_2_sbb: { label: "Stationary bootstrap robustness", rank: 2 },
    mode_3_flat_minima: { label: "Flat minima", rank: 3 },
    mode_4_is_only_robust: { label: "IS-only robust", rank: 4 },
    mode_5_full_robust: { label: "Full-sample robust", rank: 5 },
  };
  const schedules: Record<string, { label: string; rank: number }> = {
    global: { label: "global", rank: 0 }, per_fold_decay: { label: "per-fold decay", rank: 1 },
    per_fold_causal: { label: "per-fold causal", rank: 2 },
  };
  const native = ["intrabar_bracket", "reactive", "event_driven"].includes(profile.execution_route);
  const fixed = !native && profile.protocol === "three_window_decay" && profile.trial_count.max === 1;
  const family = native ? (profile.trial_count.max > 1 ? "NATIVE_OPTIMIZED" : "NATIVE_FIXED") : fixed ? "THREE_WINDOW_FIXED"
    : profile.optimization_mode === "mode_5_full_robust" ? "FULL_SAMPLE"
    : profile.protocol === "advanced" ? "ADVANCED_WFO" : "THREE_WINDOW_OPTIMIZED";
  const mode = modes[profile.optimization_mode], schedule = schedules[profile.optimization_schedule];
  const nativeLabels: Record<string, string> = { intrabar_bracket: "Intrabar bracket", reactive: "Reactive", event_driven: "Event driven" };
  return {
    key: `${family.toLowerCase()}.${profile.execution_route}.${profile.protocol}.${profile.optimization_mode}.${profile.optimization_schedule}`,
    family, label: native ? (profile.trial_count.max > 1 ? "Limit/OCO · native IS optimization" : nativeLabels[profile.execution_route]) : fixed ? "Fixed Three Window"
      : `${mode?.label ?? profile.optimization_mode} · ${schedule?.label ?? profile.optimization_schedule}`,
    recommended_rank: native ? 400 : fixed ? 0 : (profile.protocol === "advanced" ? 100 : 50)
      + (mode?.rank ?? 0) * 10 + (schedule?.rank ?? 0),
    scope: "DISPLAY_ORDER_NOT_OPTIMAL_SETUP_OR_AUTHORIZATION" as const,
  };
}
