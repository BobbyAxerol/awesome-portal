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

export type ResearchPreflightGateState = "PASS" | "NOT_APPLICABLE" | "NOT_RECORDED";

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
    add("topology", "PASS", ["windows"], "IS → OOS → holdout are contiguous half-open windows, each with closed bars.");
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
    `Snapshot integrity passed: ${group(snapshot.quality.gaps)} gaps, ${group(snapshot.quality.duplicates)} duplicates, ratio ${snapshot.quality.gap_ratio}.`,
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
  "Research run creation is not enabled in this environment.": [],
  "The current account is not eligible to create a Research run.": [],
  "The immutable preflight specification is no longer valid.": [],
  "Scratch specifications have no installed execution adapter.": ["alpha_binding"],
  "The preflight AlphaVersion is no longer available in this workspace.": ["alpha_binding"],
  "The bound AlphaVersion is not active.": ["alpha_binding"],
  "No installed durable executor is bound to this active AlphaVersion.": ["alpha_binding"],
  "No installed executor runs requested-spec v2 temporal guards, rolling width or inner folds yet; preflight validates them only.": ["schema_version"],
  "The effective preflight engine binding no longer matches the submitted request.": ["client", "engine_release_id"],
  "The Delta walk-forward profile is bound to engine release er_quantbt_111.": ["client", "engine_release_id"],
  "The Delta walk-forward profile accepts only the signal-notional route.": ["execution_route"],
  "The Delta walk-forward profile accepts only the advanced walk-forward protocol.": ["protocol"],
  "The Delta walk-forward profile executes only mode_1_decay with the global schedule.": ["optimization_schedule"],
  "The Delta walk-forward profile does not accept route-specific parameters.": ["route_params"],
  "The Delta walk-forward profile searches only the installed Delta parameter space and accepts no overrides.": ["parameter_space_overrides"],
  "The Delta walk-forward profile runs exactly 3 Optuna trials.": ["optuna_trials"],
  "The Delta walk-forward profile runs exactly random seed 42.": ["random_seed"],
  "The Delta walk-forward profile does not admit early stopping.": ["early_stopping"],
  "The Delta walk-forward profile accepts only the 1h timeframe.": ["data", "timeframe"],
  "The Delta walk-forward profile accepts only weekly expanding folds.": ["walk_forward", "frequency"],
  "The Delta walk-forward first out-of-sample boundary must lie strictly inside the walk-forward span.": ["walk_forward", "split_mode"],
  "The Delta walk-forward span exceeds the admitted 92 days.": ["walk_forward", "end_exclusive"],
  "The Delta walk-forward profile admits 2 to 16 weekly expanding folds in the preflight topology.": ["walk_forward"],
  "The run strategy identity must equal the explicitly bound AlphaVersion identity.": ["strategy_id"],
  "The installed Delta adapter currently accepts only the signal-notional three-window profile.": ["protocol"],
  "The installed fixed Delta adapter does not execute the requested optimization mode or schedule.": ["optimization_schedule"],
  "The installed Delta adapter does not accept route-specific parameters in this release.": ["route_params"],
  "The installed Delta adapter is a fixed-parameter qualification path and does not accept optimization overrides.": ["parameter_space_overrides"],
};

export function admissionFieldPath(message: string | null): readonly string[] {
  return message === null ? [] : ADMISSION_REASON_FIELD_PATHS[message] ?? [];
}
