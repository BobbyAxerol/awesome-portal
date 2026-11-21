/** Optional engine patience. Never rewrite immutable recipe descriptors. */
export const EARLY_STOPPING_GUIDANCE = Object.freeze({
  scope: "PER_STUDY" as const,
  minimum: 1,
  maximum_basis: "REQUESTED_TRIALS_PER_STUDY" as const,
  suggested_range_ratio: [0.5, 0.75] as [0.5, 0.75],
  suggested_ratio: 2 / 3,
  suggestion_is_default: false as const,
  semantics: "CONSECUTIVE_COMPLETED_TRIALS_WITHOUT_OBJECTIVE_IMPROVEMENT" as const,
});
export const earlyStoppingPolicy = (profile: {trial_count: {max: number}}) =>
  profile.trial_count.max > 1 ? "OPTIONAL" as const : "FORBIDDEN" as const;

export function earlyStoppingRefusal(spec: {early_stopping: number | null; optuna_trials: number},
  policy: "OPTIONAL" | "FORBIDDEN") {
  if (spec.early_stopping === null) return null;
  if (policy === "FORBIDDEN") return {reason_code: "PROFILE_EARLY_STOPPING_NOT_ADMITTED",
    field_path: ["early_stopping"], message: "Early stopping is not applicable to this fixed execution recipe."};
  if (!Number.isSafeInteger(spec.early_stopping) || spec.early_stopping < 1 || spec.early_stopping > spec.optuna_trials)
    return {reason_code: "EARLY_STOPPING_OUTSIDE_STUDY_BUDGET", field_path: ["early_stopping"],
      message: "Early stopping must be an integer from 1 to the declared trials per study."};
  return null;
}

/** Seal authority is the digest-pinned P08 request, never an exporter's flag. */
export function retainedStudyTrialCountAdmitted(actual: number, configured: number,
  requestedSpec?: Readonly<Record<string, unknown>>, studies = 1): boolean {
  const patience = requestedSpec?.early_stopping;
  if (patience == null) return actual === configured * studies;
  return typeof patience === "number" && Number.isSafeInteger(patience) && patience >= 1 && patience <= configured
    && requestedSpec?.optuna_trials === configured && Number.isSafeInteger(actual)
    && actual >= 2 * studies && actual <= configured * studies;
}
