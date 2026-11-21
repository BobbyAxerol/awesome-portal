/** Descriptive metadata conditions only; the existing P08/P10 enforce auth/admission. */
import type { z } from "zod";
import type { DeclarationConditionSchema, DeclarationMetadataSchema } from "./dataset-index.contract";
import type { ResearchRequestedSpec } from "./preflight.contract";
import type { ResearchPortalAdmission } from "./foundation.contract";
import type { SetupRefusal } from "./run-setup.contract";
import { earlyStoppingPolicy, earlyStoppingRefusal } from "./early-stopping";
type CheckProfile = Pick<ResearchPortalAdmission["profiles"][number],
  "profile_id" | "state" | "protocol" | "execution_route" | "optimization_mode" | "optimization_schedule"
  | "engine_release_id" | "timeframe" | "trial_count" | "random_seed" | "max_span_days" | "fold_bounds"> & {
  dataset_id?: string; symbol?: string; requested_spec_versions?: string[];
  reason_code?: string | null; allowed_pin_names?: string[];
  frequency?: string | null; window_mode?: string | null; frequencies?: string[]; window_modes?: string[];
  seed_policy?: "LOCKED" | "FORBIDDEN" | "REQUIRED" | "OPTIONAL";
  inner_validation?: "NOT_APPLICABLE" | "NOT_ADMITTED_GLOBAL_RETENTION_ONLY" | "REQUIRED_ENGINE_NESTED_OUTER_IS_ONLY";
  inner_constraints?: ResearchPortalAdmission["profiles"][number]["inner_constraints"] | null;
  trial_scope?: "GLOBAL_STUDY" | "PER_OUTER_FOLD_STUDY";
  parameter_policy?: "FIXED_NO_OVERRIDES" | "DECLARED_PINS_ONLY" | "DELTA_SEARCH_WITH_QUALIFIED_PINS" | "DECLARED_SEARCH_WITH_PINS";
  refusals?: SetupRefusal[];
};

export function declarationConditions(spec: ResearchRequestedSpec, metadata: z.infer<typeof DeclarationMetadataSchema>,
  profiles: CheckProfile[], declaredTimeframes: readonly string[]) {
  const rows: z.infer<typeof DeclarationConditionSchema>[] = [];
  const paths: Record<string, string[]> = {
    declared_timeframe: ["data", "timeframe"], engine_release: ["client", "engine_release_id"], profile_timeframe: ["data", "timeframe"],
    trials: ["optuna_trials"], seed: ["random_seed"], optimization_mode: ["optimization_mode"], optimization_schedule: ["optimization_schedule"],
    early_stopping: ["early_stopping"], route_params: ["route_params"], optimizer_overrides: ["optimization_config"], parameter_overrides: ["parameter_space_overrides"],
    fold_frequency: ["walk_forward", "frequency"], window_mode: ["walk_forward", "window_mode"], inner_validation: ["walk_forward", "inner"],
    span: ["walk_forward"], profile_folds: ["walk_forward"], fold_plan: spec.protocol === "advanced" ? ["walk_forward"] : ["windows"],
    warmup: ["walk_forward", "start"],
  };
  const add = (key: string, pass: boolean | null, reason: string, observed: unknown, required: string, field_path = paths[key]) => rows.push({
    key, state: pass === null ? "NOT_PUBLISHED" : pass ? "PASS" : "FAIL", reason_code: pass ? null : reason,
    observed: observed === null || observed === undefined ? null : String(observed).slice(0, 200), required,
    ...(field_path ? {field_path} : {}) });
  const sourceQualified = profiles.some(row => row.dataset_id === spec.data.dataset_id);
  let matching = profiles.filter(row => sourceQualified ? row.dataset_id === spec.data.dataset_id : row.dataset_id === undefined);
  let mismatch: SetupRefusal | null = null;
  const narrow = (predicate: (row: CheckProfile) => boolean, reason_code: string, field_path: string[]) => {
    if (mismatch) return;
    const next = matching.filter(predicate);
    if (next.length) matching = next;
    else mismatch = {reason_code, field_path};
  };
  if (sourceQualified) {
    narrow(row => row.symbol === spec.data.symbol, "PROFILE_SYMBOL_NOT_ADMITTED", ["data", "symbol"]);
    narrow(row => row.timeframe === spec.data.timeframe, "PROFILE_TIMEFRAME_NOT_ADMITTED", ["data", "timeframe"]);
  }
  narrow(row => row.protocol === spec.protocol, "PROFILE_PROTOCOL_NOT_ADMITTED", ["protocol"]);
  narrow(row => row.execution_route === spec.execution_route, "PROFILE_ROUTE_NOT_ADMITTED", ["execution_route"]);
  narrow(row => row.optimization_mode === spec.optimization_mode, "PROFILE_MODE_NOT_ADMITTED", ["optimization_mode"]);
  narrow(row => row.optimization_schedule === spec.optimization_schedule, "PROFILE_SCHEDULE_NOT_ADMITTED", ["optimization_schedule"]);
  narrow(row => (row.requested_spec_versions ?? ["research.requested-spec.v1"]).includes(spec.schema_version),
    "REQUESTED_SPEC_EXECUTOR_NOT_INSTALLED", ["schema_version"]);
  // Fixed and optimized Three Window share mode/schedule, not the optimizer
  // policy. Prefer its exact trial/seed recipe before consulting activation;
  // otherwise S02 would silently validate a 3-trial request against P04.
  const optimizerMatches = matching.filter(row => spec.optuna_trials >= row.trial_count.min
    && spec.optuna_trials <= row.trial_count.max && (row.seed_policy === "OPTIONAL"
      || (row.seed_policy === "REQUIRED" ? spec.random_seed !== null : spec.random_seed === row.random_seed)));
  if (!mismatch && optimizerMatches.length > 0) matching = optimizerMatches;
  const profile = matching.find(row => row.state === "ENABLED") ?? matching[0];
  const primary = mismatch ?? profile?.refusals?.[0] ?? {reason_code: profile?.reason_code ?? "PORTAL_EXECUTION_PROFILE_NOT_ENABLED", field_path: ["profile_id"]};
  add("profile", !mismatch && profile?.state === "ENABLED", primary.reason_code, mismatch ? null : profile?.profile_id, "Enabled execution profile", primary.field_path);
  add("declared_timeframe", declaredTimeframes.includes(spec.data.timeframe), "ALPHA_TIMEFRAME_NOT_DECLARED", spec.data.timeframe, declaredTimeframes.join(", "));
  add("executor_version", !mismatch && profile !== undefined, primary.reason_code, spec.schema_version, "Installed executor for this setup", primary.field_path);
  if (profile) {
    add("engine_release", spec.client.engine_release_id === profile.engine_release_id, "ENGINE_RELEASE_MISMATCH", spec.client.engine_release_id, profile.engine_release_id);
    add("profile_timeframe", spec.data.timeframe === profile.timeframe, "PROFILE_TIMEFRAME_NOT_ADMITTED", spec.data.timeframe, profile.timeframe);
    add("trials", spec.optuna_trials >= profile.trial_count.min && spec.optuna_trials <= profile.trial_count.max,
      "PROFILE_TRIAL_COUNT_NOT_ADMITTED", spec.optuna_trials, `${profile.trial_count.min}…${profile.trial_count.max}`);
    const seedOk = profile.seed_policy === "OPTIONAL" ? true : profile.seed_policy === "REQUIRED"
      ? spec.random_seed !== null : spec.random_seed === profile.random_seed;
    add("seed", seedOk, "PROFILE_RANDOM_SEED_NOT_ADMITTED", spec.random_seed, profile.seed_policy === "REQUIRED" ? "Explicit seed" : profile.seed_policy === "OPTIONAL" ? "Optional seed" : String(profile.random_seed));
    const modeOk = spec.optimization_mode === profile.optimization_mode, scheduleOk = spec.optimization_schedule === profile.optimization_schedule;
    add("optimization_mode", modeOk, "PROFILE_MODE_NOT_ADMITTED", spec.optimization_mode, profile.optimization_mode);
    add("optimization_schedule", scheduleOk, "PROFILE_SCHEDULE_NOT_ADMITTED", spec.optimization_schedule, profile.optimization_schedule);
    add("optimizer", modeOk && scheduleOk, modeOk ? "PROFILE_SCHEDULE_NOT_ADMITTED" : "PROFILE_MODE_NOT_ADMITTED",
      `${spec.optimization_mode}/${spec.optimization_schedule}`, `${profile.optimization_mode}/${profile.optimization_schedule}`,
      [modeOk ? "optimization_schedule" : "optimization_mode"]);
    const stopping = earlyStoppingRefusal(spec, earlyStoppingPolicy(profile));
    add("early_stopping", stopping === null, stopping?.reason_code ?? "PROFILE_EARLY_STOPPING_NOT_ADMITTED",
      spec.early_stopping, earlyStoppingPolicy(profile) === "OPTIONAL" ? `null or 1…${spec.optuna_trials} per study` : "null");
    add("route_params", Object.keys(spec.route_params).length === 0, "PROFILE_ROUTE_PARAMS_NOT_ADMITTED", Object.keys(spec.route_params).length, "0 overrides");
    add("optimizer_overrides", Object.keys(spec.optimization_config).length === 0,
      "PROFILE_OPTIMIZER_OVERRIDES_NOT_ADMITTED", Object.keys(spec.optimization_config).length, "0 overrides");
    if (profile.protocol === "three_window_decay" && profile.parameter_policy !== "DECLARED_PINS_ONLY"
        && profile.parameter_policy !== "DELTA_SEARCH_WITH_QUALIFIED_PINS" && profile.parameter_policy !== "DECLARED_SEARCH_WITH_PINS") add("parameter_overrides", spec.parameter_space_overrides.length === 0,
      "FIXED_PROFILE_PARAMETER_OVERRIDES_NOT_ADMITTED", spec.parameter_space_overrides.length, "0 overrides");
    if (profile.parameter_policy === "DELTA_SEARCH_WITH_QUALIFIED_PINS" && profile.allowed_pin_names) add("parameter_overrides",
      spec.parameter_space_overrides.every(row => row.kind === "pin" && profile.allowed_pin_names!.includes(row.name)),
      "DELTA_PROFILE_PARAMETER_OVERRIDES_NOT_ADMITTED", spec.parameter_space_overrides.length, "Only qualified declared what-if axis pins");
    if (profile.frequency && spec.walk_forward) {
      add("fold_frequency", spec.walk_forward.frequency === profile.frequency, "PROFILE_FREQUENCY_NOT_ADMITTED", spec.walk_forward.frequency, profile.frequency);
      add("window_mode", spec.walk_forward.window_mode === profile.window_mode, "PROFILE_WINDOW_MODE_NOT_ADMITTED", spec.walk_forward.window_mode, String(profile.window_mode));
    }
    if (profile.frequencies && spec.walk_forward) {
      add("fold_frequency", profile.frequencies.includes(spec.walk_forward.frequency), "PROFILE_FREQUENCY_NOT_ADMITTED", spec.walk_forward.frequency, profile.frequencies.join(", "));
      add("window_mode", profile.window_modes?.includes(spec.walk_forward.window_mode) ?? false, "PROFILE_WINDOW_MODE_NOT_ADMITTED", spec.walk_forward.window_mode, profile.window_modes?.join(", ") ?? "not published");
      const inner = spec.walk_forward.inner, bounds = profile.inner_constraints;
      const causal = profile.inner_validation === "REQUIRED_ENGINE_NESTED_OUTER_IS_ONLY";
      const allowed = causal ? !!inner && !!bounds && bounds.frequencies.includes(inner.split_frequency) &&
        bounds.window_modes.includes(inner.window_mode) && new RegExp(bounds.train_window_pattern).test(inner.train_window) &&
        (inner.min_folds ?? 2) >= bounds.fold_bounds.min && (inner.min_folds ?? 2) <= bounds.fold_bounds.max : inner === undefined;
      add("inner_validation", allowed, causal ? "CAUSAL_INNER_CONFIGURATION_REQUIRED" : "PER_FOLD_SELECTION_RETENTION_PROFILE_NOT_INSTALLED",
        inner === undefined ? "absent" : "requested", causal ? "Required engine nested validation inside outer IS" : "No nested inner validation for this recipe");
    }
    if (profile.max_span_days && spec.walk_forward) {
      const span = metadata.windows.find(row => row.window === "SPAN");
      const days = span ? (span.end_exclusive_utc_ms - span.start_utc_ms) / 86_400_000 : NaN;
      add("span", days > 0 && days <= profile.max_span_days, "PROFILE_RANGE_EXCEEDS_LIMIT", days, `≤ ${profile.max_span_days} UTC days`);
    }
    if (profile.fold_bounds) add("profile_folds", metadata.planned_folds.count === null ? null
      : metadata.planned_folds.count >= profile.fold_bounds.min && metadata.planned_folds.count <= profile.fold_bounds.max,
      "PROFILE_FOLD_COUNT_NOT_ADMITTED", metadata.planned_folds.count, `${profile.fold_bounds.min}…${profile.fold_bounds.max}`);
  }
  add("fold_plan", metadata.planned_folds.availability === "AVAILABLE" ? true : null,
    metadata.planned_folds.reason_code ?? "DECLARATION_FOLD_PLAN_NOT_PUBLISHED", metadata.planned_folds.count, "P08-compatible indexed fold plan");
  for (const window of metadata.windows) {
    add(`bars.${window.window.toLowerCase()}`, window.bars === null ? null : window.bars > 0,
      window.reason_code ?? "WINDOW_HAS_NO_BARS", window.bars, sourceQualified ? "> 0 observed bars in indexed range" : "> 0 closed bars in indexed range",
      window.window === "SPAN" ? ["walk_forward"] : ["windows", window.window.toLowerCase()]);
    if (window.warmup_bars_required) add("warmup", window.warmup_bars_available_before_start === null ? null
      : window.warmup_bars_available_before_start >= window.warmup_bars_required,
      window.reason_code ?? "INSUFFICIENT_INDEXED_WARMUP", window.warmup_bars_available_before_start, String(window.warmup_bars_required),
      window.window === "SPAN" ? ["walk_forward", "start"] : ["windows", window.window.toLowerCase(), "start"]);
  }
  return { schema_version: "research.declaration-estimate.v1" as const, metadata, profile_id: mismatch ? null : profile?.profile_id ?? null,
    conditions: rows, ready_for_preflight: rows.every(row => row.state === "PASS") };
}
