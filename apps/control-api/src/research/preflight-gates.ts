/**
 * CG-P08-03 · the per-gate preflight list and the field path of every refusal.
 *
 * A preflight manifest exists only because every server check passed, so the
 * gate list is a deterministic projection of the stored immutable documents:
 * the same token read twice returns the same rows, and a row can never claim
 * a check the manifest does not record. Gates a pre-W4 manifest never
 * recorded say NOT_RECORDED rather than PASS.
 *
 * Field paths are requested-spec keys only; Screen 02 maps them to the step
 * that can fix them.
 */

import type { ResearchPreflightPrivateResponse, ResearchRequestedSpec } from "./preflight.contract";

export type ResearchPreflightGateState = "PASS" | "FAIL" | "NOT_APPLICABLE" | "NOT_RECORDED";

export interface ResearchPreflightGateRow {
  gate: string;
  state: ResearchPreflightGateState;
  field_path: readonly string[];
  message: string;
}

const group = (value: number): string => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export function preflightGates(
  source: ResearchPreflightPrivateResponse,
  requested: ResearchRequestedSpec,
): ResearchPreflightGateRow[] {
  const rows: ResearchPreflightGateRow[] = [];
  const add = (gate: string, state: ResearchPreflightGateState, fieldPath: readonly string[], message: string) =>
    rows.push({ gate, state, field_path: fieldPath, message });
  const topology = source.topology;
  const snapshot = source.snapshot;
  const estimate = source.resource_estimate;
  const ceilings = estimate.ceilings;

  add("requested_spec", "PASS", ["schema_version"], `The request satisfies ${requested.schema_version}.`);
  add(
    "alpha_declaration",
    requested.alpha_binding ? "PASS" : "NOT_APPLICABLE",
    ["alpha_binding"],
    requested.alpha_binding
      ? `${requested.alpha_binding.alpha_version_id} declares the seed rule, parameter space and timeframe this request uses.`
      : "Scratch request: no AlphaVersion declaration binds it.",
  );
  add("release_current", "PASS", ["client", "engine_release_id"], `${source.capability.engine_release_id} is the current admitted preflight release.`);
  add(
    "route_admitted",
    "PASS",
    ["execution_route"],
    `${source.capability.execution_route} is admitted for preflight (${source.capability.route_axes.admission}).`,
  );
  add(
    "mode_schedule_admitted",
    "PASS",
    ["optimization_schedule"],
    `${source.capability.optimization_mode} × ${source.capability.optimization_schedule} is a valid pair in this release.`,
  );
  add("dataset_available", "PASS", ["data"], `${source.dataset_binding.dataset_id} · ${source.dataset_binding.symbol} · ${source.dataset_binding.timeframe} is available.`);
  add("required_inputs", "PASS", ["data"], `The source supplies every declared column: ${snapshot.columns.join(", ")}.`);
  add(
    "warmup_available",
    "PASS",
    requested.protocol === "three_window_decay" ? ["windows", "is", "start"] : ["walk_forward", "start"],
    `${group(snapshot.warmup.bars ?? 0)} of ${group(snapshot.warmup.requested_bars)} declared warmup bars precede the first window.`,
  );
  if (topology.protocol === "three_window_decay") {
    add("topology", "PASS", ["windows"], snapshot.quality.state === "OBSERVED_TAPE_INTEGRITY_ONLY"
      ? "IS → OOS → holdout are contiguous half-open windows, each with observed source daily bars."
      : "IS → OOS → holdout are contiguous half-open windows, each with closed bars.");
  } else {
    const engineBuilt = topology.plan_source !== undefined;
    add(
      "topology",
      "PASS",
      ["walk_forward"],
      `${topology.folds.length} outer folds, ${topology.frequency} · ${topology.window_mode}` +
        (engineBuilt ? " — built by the engine's own fold planner." : "."),
    );
    if (engineBuilt) {
      const guards = topology.temporal_guards;
      add(
        "temporal_guards",
        "PASS",
        ["walk_forward"],
        guards
          ? `label horizon ${guards.label_horizon_bars} · purge ${guards.purge_bars} · embargo ${guards.embargo_bars} bars applied to every fold.`
          : "No temporal guards were requested.",
      );
      if (topology.window_mode === "rolling") {
        add("rolling_train_width", "PASS", ["walk_forward", "train_window"], `Each fold trains on the ${topology.train_window} before its OOS.`);
      }
      if (topology.inner_validation) {
        const counts = topology.folds.map((fold) => fold.inner_fold_count ?? 0);
        add(
          "inner_folds",
          "PASS",
          ["walk_forward", "inner"],
          `Every outer fold has at least ${topology.inner_validation.min_folds} inner folds (${Math.min(...counts)}–${Math.max(...counts)}).`,
        );
      }
    }
  }
  if (ceilings) {
    add("trial_ceiling", "PASS", ["optuna_trials"], `${group(estimate.trial_count)} trials ≤ ceiling ${group(ceilings.trial_ceiling)}.`);
    add(
      "sweep_ceiling",
      "PASS",
      ["parameter_space_overrides"],
      `${ceilings.swept_dimensions} swept dimensions ≤ ceiling ${ceilings.sweep_dimension_ceiling}.`,
    );
    add(
      "outer_fold_ceiling",
      "PASS",
      requested.protocol === "three_window_decay" ? ["windows"] : ["walk_forward"],
      `${estimate.outer_fold_count} outer folds ≤ ceiling ${ceilings.outer_fold_ceiling}.`,
    );
    add(
      "resource_ceiling",
      "PASS",
      ["optuna_trials"],
      `~${group(estimate.estimated_cpu_seconds)} estimated CPU-s for ${group(estimate.evaluation_count)} evaluations ≤ ceiling ${group(ceilings.estimated_cpu_seconds_ceiling)}.`,
    );
  } else {
    for (const [gate, path] of [
      ["trial_ceiling", ["optuna_trials"]],
      ["sweep_ceiling", ["parameter_space_overrides"]],
      ["resource_ceiling", ["optuna_trials"]],
    ] as const) {
      add(gate, "NOT_RECORDED", path, "This manifest was issued before the ceiling was recorded.");
    }
  }
  const scan = snapshot.gap_scan;
  add(
    "snapshot_quality",
    "PASS",
    ["data"],
    snapshot.quality.state === "OBSERVED_TAPE_INTEGRITY_ONLY"
      ? "Observed tape integrity passed; expected sessions and calendar gaps are not published."
      : `Snapshot integrity passed: ${group(snapshot.quality.gaps)} gaps, ${group(snapshot.quality.duplicates)} duplicates, ratio ${snapshot.quality.gap_ratio}.`,
  );
  if (!scan) {
    add("gap_scan", "NOT_RECORDED", ["data"], "This manifest was issued before the per-window gap scan was recorded.");
  } else if (scan.state === "NOT_PUBLISHED") {
    add("gap_scan", "NOT_APPLICABLE", ["data"], scan.reason ?? "No session calendar is published for this source.");
  } else {
    const scanned = scan.windows.filter((window) => window.state === "SCANNED");
    const watch = scanned.filter((window) => window.verdict === "WATCH").length;
    const critical = scanned.filter((window) => window.verdict === "CRITICAL").length;
    add("gap_scan", "PASS", ["data"], `${scanned.length} windows scanned · ${critical} critical · ${watch} watch.`);
  }
  return rows;
}

/**
 * Field path for a P10 admission refusal, keyed on the predicate's own exact
 * sentence (run-admission.service.ts). A test reads that file and fails when a
 * sentence is added without a path, so the two cannot drift silently.
 */
export const ADMISSION_REASON_FIELD_PATHS: Readonly<Record<string, readonly string[]>> = {
  "The imported search recipe is not installed.": ["profile_id"],
  "No exact imported search recipe matches this request.": ["protocol"],
  "The imported request must match its exact bounded recipe axes and trial budget.": ["optuna_trials"],
  "The imported search requires its verified fixed-UTC closed-bar metadata binding.": ["data"],
  "The imported preflight must retain exactly its declared predecessor warmup.": ["alpha_binding"],
  "The imported temporal controls do not match the recipe.": ["walk_forward"],
  "The imported engine-planned folds exceed the exact study budget.": ["walk_forward"],
  "The imported inner plan does not match the exact recipe.": ["walk_forward", "inner"],
  "The imported span exceeds the recipe bound.": ["walk_forward", "end_exclusive"],
  "The imported Three Window must retain bounded independent windows.": ["windows"],
  "The indexed recipe requires its exact dataset and immutable AlphaVersion binding.": ["data","dataset_id"],
  "The indexed recipe requires a verified fixed-UTC closed-bar metadata binding.": ["data"],
  "No exact indexed execution recipe matches the requested AlphaVersion and timeframe.": ["data","timeframe"],
  "The requested timeframe must match the exact indexed execution recipe.": ["data","timeframe"],
  "The requested span exceeds the target-bar-bounded indexed recipe.": ["walk_forward"],
  "The VN observed daily fixed profile is not enabled.": [],
  "The VN observed daily fixed profile admits requested-spec v1 only.": ["schema_version"],
  "The VN observed daily fixed profile admits only source-qualified FPT 1d three-window research.": ["data"],
  "The preflight does not carry a verified VN observed-date index and predecessor warmup binding.": ["data"],
  "The VN source-local windows and observed predecessor warmup must match the immutable bounded preflight.": ["windows"],
  "The VN observed fixed profile requires exactly 300 indexed predecessor bars bound by the preflight.": ["windows", "is", "start"],
  "Research run creation is not enabled in this environment.": [],
  "The current account is not eligible to create a Research run.": [],
  "The immutable preflight specification is no longer valid.": [],
  "Scratch specifications have no installed execution adapter.": ["alpha_binding"],
  "The preflight AlphaVersion is no longer available in this workspace.": ["alpha_binding"],
  "The bound AlphaVersion is not active.": ["alpha_binding"],
  "No installed durable executor is bound to this active AlphaVersion.": ["alpha_binding"],
  "The imported AlphaVersion has no installed execution adapter binding.": ["alpha_binding"],
  "The bound imported AlphaVersion is neither DRAFT nor active.": ["alpha_binding"],
  "Imported Alpha execution is not enabled in this environment.": ["alpha_binding"],
  "The imported AlphaVersion is not bound to the installed restricted adapter contract.": ["alpha_binding"],
  "The installed imported Alpha adapter accepts requested-spec v1 only.": ["schema_version"],
  "The imported Alpha source declaration no longer matches its immutable entrypoint.": ["alpha_binding"],
  "The imported Alpha adapter accepts only the QuantBT 1.1.1 three-window signal-notional profile.": ["protocol"],
  "The imported Alpha fixed profile accepts no route configuration, optimizer study or early stopping.": ["route_params"],
  "The requested timeframe is outside the imported Alpha declaration.": ["data", "timeframe"],
  "The imported Alpha warmup exceeds the restricted execution profile ceiling of 4096 bars.": ["alpha_binding"],
  "The imported Alpha determinism declaration requires an explicit random seed.": ["random_seed"],
  "The imported Alpha parameter declaration is unavailable.": ["alpha_binding"],
  "The imported Alpha fixed profile accepts parameter pins only; sweeps require a separately versioned adapter.": ["parameter_space_overrides"],
  "No installed executor runs requested-spec v2 temporal guards, rolling width or inner folds yet; preflight validates them only.": ["schema_version"],
  "Inner causal selection requires a retained per-fold selection profile; the installed v2 executor is global only.": ["walk_forward", "inner"],
  "The causal inner profile requires a matching engine-built inner plan with 2 to 16 folds inside every outer IS window.": ["walk_forward", "inner"],
  "The temporal executor admits weekly/monthly/quarterly expanding or rolling folds only.": ["walk_forward", "frequency"],
  "The effective preflight engine binding no longer matches the submitted request.": ["client", "engine_release_id"],
  "The installed Delta adapter is bound to engine release er_quantbt_111.": ["client", "engine_release_id"],
  "The Delta walk-forward profile is bound to engine release er_quantbt_111.": ["client", "engine_release_id"],
  "The Delta walk-forward profile accepts only the signal-notional route.": ["execution_route"],
  "The Delta walk-forward profile accepts only the advanced walk-forward protocol.": ["protocol"],
  "The Delta walk-forward profile executes only mode_1_decay with the global schedule.": ["optimization_schedule"],
  "The optimization mode and schedule must match the exact execution recipe.": ["optimization_schedule"],
  "Full-sample calibration requires exactly one engine-planned full-span fold.": ["walk_forward"],
  "Mode 4 IS-only uses outer-fold studies without nested inner selection.": ["walk_forward", "inner"],
  "The Delta walk-forward profile does not accept route-specific parameters.": ["route_params"],
  "The Delta walk-forward profile searches only the installed Delta parameter space and accepts no overrides.": ["parameter_space_overrides"],
  "The Delta walk-forward profile searches only the installed Delta parameter space and accepts no overrides except what-if pins on rvol and slpercent.": ["parameter_space_overrides"],
  "The qualified per-fold-decay recipe searches the installed Delta space without parameter overrides.": ["parameter_space_overrides"],
  "A what-if pin must be an exact decimal.": ["parameter_space_overrides"],
  "The what-if pin rvol must lie on its declared step inside 1–2.5.": ["parameter_space_overrides"],
  "The what-if pin slpercent must lie on its declared step inside 0.7–2.5.": ["parameter_space_overrides"],
  "The Delta walk-forward profile runs exactly 3 Optuna trials.": ["optuna_trials"],
  "The preview long walk-forward profile admits 2 to 400 Optuna trials.": ["optuna_trials"],
  "The Delta walk-forward profile runs exactly random seed 42.": ["random_seed"],
  "The Delta walk-forward profile does not admit early stopping.": ["early_stopping"],
  "Early stopping is not applicable to this fixed execution recipe.": ["early_stopping"],
  "Early stopping must be an integer from 1 to the declared trials per study.": ["early_stopping"],
  "The declared trial count is outside the selected recipe's per-study limits.": ["optuna_trials"],
  "The optimized Three Window recipe requires random seed 42.": ["random_seed"],
  "The Delta walk-forward profile accepts only the 1h timeframe.": ["data", "timeframe"],
  "The Delta walk-forward profile accepts only weekly expanding folds.": ["walk_forward", "frequency"],
  "The Delta walk-forward first out-of-sample boundary must lie strictly inside the walk-forward span.": ["walk_forward", "split_mode"],
  "The Delta walk-forward span exceeds the admitted 92 days.": ["walk_forward", "end_exclusive"],
  "The Delta walk-forward profile admits 2 to 16 weekly expanding folds in the preflight topology.": ["walk_forward"],
  "The selected temporal walk-forward profile requires 2 to 16 engine-planned outer folds in the preflight topology.": ["walk_forward"],
  "The effective preflight engine binding does not match the optimized Three Window recipe.": ["client", "engine_release_id"],
  "Optimized Three Window requires requested-spec v1, 1h signal_notional and Mode 1/global.": ["protocol"],
  "Optimized Three Window requires exactly 3 trials, seed 42 and no early stopping.": ["optuna_trials"],
  "Optimized Three Window accepts no route or optimizer override.": ["route_params"],
  "Optimized Three Window requires IS, OOS and an independent holdout.": ["windows"],
  "Optimized Three Window requires contiguous UTC end-exclusive IS/OOS/holdout boundaries.": ["windows"],
  "Optimized Three Window exceeds its admitted 92-day span.": ["windows", "holdout", "end_exclusive"],
  "The strategy must match its immutable Delta AlphaVersion binding.": ["alpha_binding"],
  "The run strategy identity must equal the explicitly bound AlphaVersion identity.": ["strategy_id"],
  "The installed Delta adapter currently accepts only the signal-notional three-window profile.": ["protocol"],
  "The installed fixed Delta adapter does not execute the requested optimization mode or schedule.": ["optimization_schedule"],
  "The installed Delta adapter does not accept route-specific parameters in this release.": ["route_params"],
  "The installed Delta adapter is a fixed-parameter qualification path and does not accept optimization overrides.": ["parameter_space_overrides"],
};

export function admissionFieldPath(message: string | null): readonly string[] {
  if (message === null) return [];
  const exact = ADMISSION_REASON_FIELD_PATHS[message];
  if (exact) return exact;
  if (/^The exact walk-forward recipe runs [1-9][0-9]* Optuna trials per study\.$/.test(message)) {
    return ["optuna_trials"];
  }
  // Declaration/pin refusals have a validated public parameter name in the
  // sentence, not a fixed literal. Publish the form field, never that value.
  if (/^The imported Alpha (?:fixed )?parameter [A-Za-z][A-Za-z0-9_]{0,63} /.test(message)
    || message.startsWith("The imported Alpha request pins undeclared parameters: ")) {
    return ["parameter_space_overrides"];
  }
  return [];
}
