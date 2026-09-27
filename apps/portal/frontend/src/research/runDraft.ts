/**
 * Screen 02 · the run draft, its validators, and the one serializer (P10).
 *
 * Spec 02's three founding rules are the shape of this file:
 *
 *  1. a declaration outside the space the alpha declared is **not submittable**;
 *  2. the claim forecast is shown **before** compute is spent;
 *  3. a field the reader did not touch is **not serialized** — the engine's own
 *     default applies, and writing it out would both inflate the payload and
 *     freeze a value that should follow the release.
 *
 * There is exactly one serializer. The review preview, the preflight request
 * and the create request all call `serializeRequestedSpec`, because the moment
 * preview and submit are built by different code they drift, and the reader
 * approves one thing while the server receives another.
 *
 * Validator messages are verbatim from spec 02 §6–9. They are not paraphrased
 * anywhere: the server reuses the same sentences at preflight, and two
 * wordings for one rule reads as two different rules.
 */

import type { DeclaredParameter } from "./alphaImportClient";
import type { RequestedSpec } from "./preflightClient";

/* ------------------------------------------------------------------ model */

export type ParameterDimension = "sweep" | "pin";

export interface ParameterEntry {
  name: string;
  /**
   * The declared space, from the alpha version. The browser never widens it.
   * `null` is a declarable value in the contract, so it is carried rather than
   * coerced — a declared `null` is not the same as an absent bound.
   */
  declaredLow: number | string | boolean | null;
  declaredHigh: number | string | boolean | null;
  /**
   * E4 (audit 02-14): the grid the declaration names, for the HiFi's STEP
   * column. Absent on a fixed or categorical parameter, which has no step.
   */
  declaredStep?: number | null;
  /** Present when the parameter is categorical rather than numeric. */
  levels?: readonly (string | number | boolean | null)[];
  dimension: ParameterDimension;
  /** Sweep low, or the pinned value. */
  low: string;
  /** Sweep high. Ignored while pinned. */
  high: string;
}

export interface WindowDraft {
  start: string;
  endExclusive: string;
}

export interface RunDraft {
  /* Step 1 — context */
  bound: boolean;
  alphaId: string;
  alphaVersionId: string;
  /* Step 2 — strategy */
  strategyId: string;
  protocol: "three_window_decay" | "advanced";
  /* Step 3 — route */
  executionRoute: RequestedSpec["execution_route"];
  routeParams: RequestedSpec["route_params"];
  /* Step 4 — data */
  datasetId: string;
  symbol: string;
  timeframe: string;
  /* Step 5 — walk-forward */
  windows: { is: WindowDraft; oos: WindowDraft; holdout: WindowDraft };
  walkForward: {
    start: string;
    endExclusive: string;
    splitMode: string;
    frequency: string;
    windowMode: string;
    /*
     * Requested-spec v2 (CG-P02-02 / CG-P08-02). Empty means "not declared":
     * an untouched field is never serialized, and a draft that sets none of
     * them stays a v1 document byte for byte.
     */
    trainWindow?: string;
    labelHorizonBars?: string;
    purgeBars?: string;
    embargoBars?: string;
    inner?: { splitFrequency: string; windowMode: string; trainWindow: string; minFolds: string };
  };
  optimizationMode: string;
  optimizationSchedule: string;
  /* Step 6 — parameters */
  parameters: readonly ParameterEntry[];
  /* Step 7 — optimization */
  optunaTrials: string;
  earlyStopping: string;
  randomSeed: string;
  /** Sparse. A key is present only because the reader changed it. */
  optimizationConfigOverrides: Readonly<Record<string, string | number | boolean>>;
  /* Client identity of the installed release the form was built from. */
  engineReleaseId: string;
  configDigest: string;
}

/**
 * What the alpha version and the release declare, for validation only.
 *
 * Every field is nullable for one reason: **a fact the server has not published
 * is not a fact the browser may supply.** `trialCeiling` used to fall back to
 * `Infinity`, which reads as "no limit" — a claim about the release that no
 * response supported. It is `null` now, and the ceiling check simply does not
 * run, with the step saying the ceiling could not be read. The server still
 * enforces its own at preflight, so nothing is loosened by declining to guess.
 */
export interface DraftConstraints {
  /** Timeframes the strategy declares, or null when none was published. */
  declaredTimeframes: readonly string[] | null;
  /** Whether the strategy declares `determinism.seed_required`, or null. */
  seedRequired: boolean | null;
  /** The release's published trial ceiling, or null when it was not read. */
  trialCeiling: number | null;
  /** The entrypoint the bound version pins, or null. */
  entrypoint: string | null;
  /**
   * E4 (audit 02-12): the columns the declaration requires and the warmup it
   * declares. The server still checks both at preflight — these are shown so
   * the reader can see what the run will need before spending a preflight,
   * not so the browser can check them.
   */
  requiredColumns: readonly string[] | null;
  warmupBars: number | null;
  /** Routes the installed release will not run, with the engine's reason. */
  blockedRoutes: Readonly<Record<string, string>>;
  /**
   * The release's published sweep ceiling (`preflight_limits`, CG-P08-05), or
   * null when the Atlas did not publish one — then the check does not run
   * here and the server's preflight still applies it.
   */
  sweepCeiling?: number | null;
}

/** Facts the browser could not read, named so a panel can say which. */
export function missingConstraints(limits: DraftConstraints): readonly string[] {
  const missing: string[] = [];
  if (limits.declaredTimeframes === null) missing.push("declared timeframes");
  if (limits.seedRequired === null) missing.push("determinism.seed_required");
  if (limits.entrypoint === null) missing.push("entrypoint");
  if (limits.trialCeiling === null) missing.push("trial ceiling");
  return missing;
}

/**
 * Spec 02 §8 — the ceiling counts swept dimensions, not entries. This is the
 * value spec 02 names; the rule itself reads `limits.sweepCeiling` from the
 * release (CG-P08-05) and only this label falls back to it.
 */
export const SWEEP_CEILING = 8;

/* ------------------------------------------------------------- validators */

export type StepId =
  | "context"
  | "strategy"
  | "route"
  | "data"
  | "windows"
  | "parameters"
  | "optimization"
  | "review";

export const STEPS: readonly { id: StepId; label: string; sub: string }[] = [
  { id: "context", label: "Context", sub: "alpha · av_ binding" },
  { id: "strategy", label: "Strategy", sub: "pinned by av_ / free when scratch" },
  { id: "route", label: "Route", sub: "14 routes · per-route params" },
  { id: "data", label: "Data", sub: "dataset · symbol · timeframe" },
  { id: "windows", label: "Walk-forward", sub: "three-window / advanced" },
  { id: "parameters", label: "Parameters", sub: `sweep / pin · ceiling ${SWEEP_CEILING}` },
  { id: "optimization", label: "Optimization", sub: "trials · config surface" },
  { id: "review", label: "Review & run", sub: "preflight · create" },
];

function utcMs(value: string): number | null {
  if (!value) return null;
  const parsed = Date.parse(value.endsWith("Z") ? value : `${value}:00Z`);
  return Number.isNaN(parsed) ? null : parsed;
}

export function validateRoute(draft: RunDraft, limits: DraftConstraints): string | null {
  const blocked = limits.blockedRoutes[draft.executionRoute];
  return blocked ?? null;
}

export function validateStrategy(draft: RunDraft, _limits: DraftConstraints): string | null {
  /* A bound run's strategy is pinned by construction: the Control API admits a
     create only when `strategy_id` equals the bound `alpha_id`
     (`run-admission.service.ts`), so the serializer sends exactly that and
     there is nothing to get wrong. The earlier rule demanded the entrypoint
     instead, which the server refused (RF-04, FE-S02-01; DQ-07). */
  if (draft.bound) return null;
  if (draft.strategyId.trim() === "") return "A strategy id is required while scratch.";
  return null;
}

/** The strategy a draft is sent with: the bound alpha, or the scratch choice. */
export function effectiveStrategyId(draft: RunDraft): string {
  return draft.bound ? draft.alphaId : draft.strategyId;
}

export function validateData(draft: RunDraft, limits: DraftConstraints): string | null {
  if (draft.symbol.trim().length === 0) return "A symbol is required.";
  /* No declaration read means no rule to enforce — not a rule that passes. */
  if (limits.declaredTimeframes === null) return null;
  if (
    limits.declaredTimeframes.length > 0 &&
    !limits.declaredTimeframes.includes(draft.timeframe)
  ) {
    return `The strategy declares only ${limits.declaredTimeframes.join(", ")}.`;
  }
  return null;
}

export function validateWindows(draft: RunDraft): string | null {
  if (draft.protocol !== "three_window_decay") return null;
  const { is, oos, holdout } = draft.windows;

  if (!holdout.endExclusive) return "A holdout end-exclusive is required for the historical query.";

  const bounds = [is, oos, holdout].map((w) => [utcMs(w.start), utcMs(w.endExclusive)] as const);
  if (bounds.some(([a, b]) => a === null || b === null)) {
    return "Every window must have a positive length.";
  }
  if (bounds.some(([a, b]) => (b as number) <= (a as number))) {
    return "Every window must have a positive length.";
  }
  /* Half-open windows meet exactly; a gap or an overlap is a different
     methodology, not a tolerance. */
  if (utcMs(oos.start) !== utcMs(is.endExclusive)) {
    return "OOS must begin exactly where IS ends.";
  }
  if (utcMs(holdout.start) !== utcMs(oos.endExclusive)) {
    return "Holdout must begin exactly where OOS ends.";
  }
  return null;
}

export interface ParameterStatus {
  name: string;
  /** Verbatim status text for the row. */
  text: string;
  tone: "declared" | "narrowed" | "refused";
}

function asNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parameterStatus(entry: ParameterEntry): ParameterStatus {
  if (entry.levels) {
    if (entry.dimension === "pin") {
      const chosen = entry.low;
      if (!entry.levels.map(String).includes(chosen)) {
        return { name: entry.name, text: "pin value outside declared space — refused", tone: "refused" };
      }
      return { name: entry.name, text: `pinned at ${chosen} — fixed, out of sweep dims`, tone: "narrowed" };
    }
    return { name: entry.name, text: "declared", tone: "declared" };
  }

  const low = asNumber(entry.low);
  const declaredLow = Number(entry.declaredLow);
  const declaredHigh = Number(entry.declaredHigh);

  if (entry.dimension === "pin") {
    if (low === null || low < declaredLow || low > declaredHigh) {
      return { name: entry.name, text: "pin value outside declared space — refused", tone: "refused" };
    }
    return { name: entry.name, text: `pinned at ${entry.low} — fixed, out of sweep dims`, tone: "narrowed" };
  }

  const high = asNumber(entry.high);
  if (low === null || high === null || low < declaredLow || high > declaredHigh || high <= low) {
    return { name: entry.name, text: "outside the declared space — refused", tone: "refused" };
  }
  if (low > declaredLow || high < declaredHigh) {
    return { name: entry.name, text: "narrowed — allowed", tone: "narrowed" };
  }
  return { name: entry.name, text: "declared", tone: "declared" };
}

export function sweptCount(draft: RunDraft): number {
  return draft.parameters.filter((entry) => entry.dimension === "sweep").length;
}

export function pinnedCount(draft: RunDraft): number {
  return draft.parameters.filter((entry) => entry.dimension === "pin").length;
}

export function validateParameters(draft: RunDraft, limits?: DraftConstraints): string | null {
  const refused = draft.parameters.map(parameterStatus).find((s) => s.tone === "refused");
  if (refused) return `${refused.name}: ${refused.text}`;
  const swept = sweptCount(draft);
  const ceiling = limits?.sweepCeiling === undefined ? SWEEP_CEILING : limits.sweepCeiling;
  if (ceiling !== null && swept > ceiling) {
    return `sweep dims ${swept} > ${ceiling} — pin params or drop entries.`;
  }
  return null;
}

const TRAIN_WINDOW = /^[1-9][0-9]{0,4}(D|h)$/;

/** True when the draft declares any requested-spec v2 field (CG-P02-02). */
export function usesSpecV2(draft: RunDraft): boolean {
  if (draft.protocol !== "advanced") return false;
  const wf = draft.walkForward;
  return (
    wf.windowMode === "rolling" ||
    Boolean(wf.trainWindow) ||
    [wf.labelHorizonBars, wf.purgeBars, wf.embargoBars].some((value) => value !== undefined && value.trim() !== "") ||
    (draft.optimizationMode === "mode_1_decay" && draft.optimizationSchedule === "per_fold_causal")
  );
}

/** Advanced walk-forward v2 rules, verbatim with the server's field names. */
export function validateWalkForwardV2(draft: RunDraft): string | null {
  if (draft.protocol !== "advanced") return null;
  const wf = draft.walkForward;
  if (wf.windowMode === "rolling" && !TRAIN_WINDOW.test(wf.trainWindow ?? "")) {
    return "Rolling walk-forward requires a train width such as 180D or 72h.";
  }
  if (wf.windowMode !== "rolling" && wf.trainWindow) {
    return "A train width applies only to rolling walk-forward.";
  }
  for (const [label, value] of [["label horizon", wf.labelHorizonBars], ["purge", wf.purgeBars], ["embargo", wf.embargoBars]] as const) {
    if (value === undefined || value.trim() === "") continue;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10_000) return `The ${label} must be a whole number of bars from 0 to 10000.`;
  }
  const causal = draft.optimizationMode === "mode_1_decay" && draft.optimizationSchedule === "per_fold_causal";
  if (causal) {
    const inner = wf.inner;
    if (!inner || !inner.splitFrequency || !inner.windowMode || !TRAIN_WINDOW.test(inner.trainWindow)) {
      return "mode_1_decay with per_fold_causal needs inner folds: a frequency, a window mode and a train width.";
    }
    const minFolds = Number(inner.minFolds || "2");
    if (!Number.isInteger(minFolds) || minFolds < 1 || minFolds > 64) return "Inner minimum folds must be a whole number from 1 to 64.";
  }
  return null;
}

export function validateOptimization(draft: RunDraft, limits: DraftConstraints): string | null {
  const trials = asNumber(draft.optunaTrials);
  /* An empty field used to be sent as `optuna_trials: 0`, which the server
     refuses with a generic 400. A count is required and is a whole number. */
  if (trials === null || !Number.isInteger(trials) || trials < 1) {
    return "Trials must be a whole number of at least 1.";
  }
  if (limits.trialCeiling !== null && trials !== null && trials > limits.trialCeiling) {
    return `The engine release publishes a ceiling of ${limits.trialCeiling} trials.`;
  }
  if (limits.seedRequired === true && draft.randomSeed.trim() === "") {
    return "The strategy declares determinism.seed_required — a fixed random seed is required.";
  }
  return null;
}

/**
 * Every blocking problem, in the spec's own order.
 *
 * Order is part of the contract: the reader is sent to the earliest step that
 * can be fixed, not to whichever validator happened to run first.
 */
export function blockingProblems(
  draft: RunDraft,
  limits: DraftConstraints,
): readonly { step: StepId; message: string }[] {
  const checks: [StepId, string | null][] = [
    ["route", validateRoute(draft, limits)],
    ["strategy", validateStrategy(draft, limits)],
    ["data", validateData(draft, limits)],
    ["windows", validateWindows(draft) ?? validateWalkForwardV2(draft)],
    ["parameters", validateParameters(draft, limits)],
    ["optimization", validateOptimization(draft, limits)],
  ];
  return checks
    .filter((entry): entry is [StepId, string] => entry[1] !== null)
    .map(([step, message]) => ({ step, message }));
}

/* ------------------------------------------------------------ serializer */

function interval(window: WindowDraft) {
  return { start: window.start, end_exclusive: window.endExclusive };
}

/**
 * Whether a row still says exactly what the declaration projected.
 *
 * Spec 02 §13-1: an untouched default is never serialized. Sending all eight
 * declared ranges as overrides read, to the server, as eight edits — and the
 * P10 profile admits none, so create was refused for a draft the reader never
 * changed (RF-04, FE-S02-01).
 */
export function isUntouched(entry: ParameterEntry): boolean {
  if (entry.dimension === "sweep") {
    return entry.low === String(entry.declaredLow) && entry.high === String(entry.declaredHigh);
  }
  return !entry.levels && entry.declaredLow === entry.declaredHigh && entry.low === String(entry.declaredLow);
}

function overrideValue(entry: ParameterEntry): RequestedSpec["parameter_space_overrides"][number] {
  if (entry.dimension === "pin") {
    const raw = entry.levels ? entry.low : (asNumber(entry.low) ?? entry.low);
    return { name: entry.name, kind: "pin", value: raw };
  }
  return {
    name: entry.name,
    kind: "sweep",
    low: asNumber(entry.low) ?? entry.low,
    high: asNumber(entry.high) ?? entry.high,
  };
}

/**
 * The canonical requested spec.
 *
 * **This is the only place a draft becomes a payload.** The review preview,
 * the preflight request and the create request all render or send exactly this
 * object, so what the reader approved and what the server receives cannot
 * diverge. Spec 02 §13-1 also forbids serializing an untouched default, which
 * is why `optimization_config` carries only the sparse override map.
 *
 * No digest is computed here. `client.config_digest` is the release identity
 * the form was built from, supplied by the manifest — not something derived
 * from this object.
 */
export function serializeRequestedSpec(draft: RunDraft): RequestedSpec {
  const spec: RequestedSpec = {
    schema_version: "research.requested-spec.v1",
    alpha_binding: draft.bound
      ? { alpha_id: draft.alphaId, alpha_version_id: draft.alphaVersionId }
      : null,
    not_publishable: !draft.bound,
    strategy_id: effectiveStrategyId(draft),
    execution_route: draft.executionRoute,
    route_params: draft.routeParams,
    data: {
      dataset_id: draft.datasetId,
      symbol: draft.symbol,
      timeframe: draft.timeframe,
    },
    protocol: draft.protocol,
    optimization_mode: draft.optimizationMode,
    optimization_schedule: draft.optimizationSchedule,
    parameter_space_overrides: draft.parameters.filter((entry) => !isUntouched(entry)).map(overrideValue),
    /* Validation blocks preflight until this is a whole number ≥ 1. */
    optuna_trials: asNumber(draft.optunaTrials) ?? 1,
    early_stopping: asNumber(draft.earlyStopping),
    random_seed: asNumber(draft.randomSeed),
    optimization_config: { ...draft.optimizationConfigOverrides },
    client: {
      engine_release_id: draft.engineReleaseId,
      config_digest: draft.configDigest,
    },
  };

  /* Only the protocol's own windows are sent. Carrying both would ask the
     server to decide which one the reader meant. */
  if (draft.protocol === "three_window_decay") {
    spec.windows = {
      is: interval(draft.windows.is),
      oos: interval(draft.windows.oos),
      holdout: interval(draft.windows.holdout),
    };
  } else {
    spec.walk_forward = {
      start: draft.walkForward.start,
      end_exclusive: draft.walkForward.endExclusive,
      split_mode: draft.walkForward.splitMode,
      frequency: draft.walkForward.frequency,
      window_mode: draft.walkForward.windowMode,
    };
    /* CG-P02-02: v2 only when a v2 field is declared; each field only when set. */
    if (usesSpecV2(draft)) {
      const wf = draft.walkForward;
      const bars = (value: string | undefined) => (value === undefined || value.trim() === "" ? undefined : Number(value));
      const extra: Record<string, unknown> = {};
      if (wf.windowMode === "rolling" && wf.trainWindow) extra.train_window = wf.trainWindow;
      for (const [key, value] of [["label_horizon_bars", wf.labelHorizonBars], ["purge_bars", wf.purgeBars], ["embargo_bars", wf.embargoBars]] as const) {
        const parsed = bars(value);
        if (parsed !== undefined) extra[key] = parsed;
      }
      if (draft.optimizationMode === "mode_1_decay" && draft.optimizationSchedule === "per_fold_causal" && wf.inner) {
        extra.inner = {
          split_frequency: wf.inner.splitFrequency,
          window_mode: wf.inner.windowMode,
          train_window: wf.inner.trainWindow,
          ...(wf.inner.minFolds.trim() !== "" ? { min_folds: Number(wf.inner.minFolds) } : {}),
        };
      }
      (spec as { schema_version: string }).schema_version = "research.requested-spec.v2";
      spec.walk_forward = { ...spec.walk_forward, ...extra } as typeof spec.walk_forward;
    }
  }
  return spec;
}

/* ----------------------------------------------------- field path → step */

/**
 * CG-P08-03: which wizard step owns a requested-spec field path the server
 * named in a refusal. Unknown paths point at Review, where the refusal is.
 */
export function stepForFieldPath(path: readonly string[] | null | undefined): StepId {
  const head = path?.[0];
  switch (head) {
    case "alpha_binding":
    case "not_publishable":
      return "context";
    case "strategy_id":
    case "protocol":
      return "strategy";
    case "execution_route":
    case "route_params":
      return "route";
    case "data":
      return "data";
    case "windows":
    case "walk_forward":
    case "optimization_mode":
    case "optimization_schedule":
      return "windows";
    case "parameter_space_overrides":
      return "parameters";
    case "optuna_trials":
    case "early_stopping":
    case "random_seed":
    case "optimization_config":
      return "optimization";
    default:
      return "review";
  }
}

/* ------------------------------------------------- clone (?from=<run>) */

/**
 * A new draft from a run's admitted requested spec (CG-P11-07, `?from=`).
 *
 * Every declared value is copied; nothing about the old run's preflight,
 * token or digest is. The parameter table is rebuilt from the bound version's
 * declaration by the route, then the copied overrides are re-applied on it.
 */
export function draftFromRequestedSpec(spec: RequestedSpec, base: RunDraft): RunDraft {
  const wf = spec.walk_forward as (RequestedSpec["walk_forward"] & Record<string, unknown>) | undefined;
  const text = (value: unknown) => (value === undefined || value === null ? "" : String(value));
  const inner = wf?.inner as { split_frequency: string; window_mode: string; train_window: string; min_folds?: number } | undefined;
  return {
    ...base,
    bound: spec.alpha_binding !== null,
    alphaId: spec.alpha_binding?.alpha_id ?? "",
    alphaVersionId: spec.alpha_binding?.alpha_version_id ?? "",
    strategyId: spec.strategy_id,
    protocol: spec.protocol,
    executionRoute: spec.execution_route,
    routeParams: spec.route_params,
    datasetId: spec.data.dataset_id,
    symbol: spec.data.symbol,
    timeframe: spec.data.timeframe,
    windows: spec.windows
      ? {
          is: { start: spec.windows.is.start, endExclusive: spec.windows.is.end_exclusive },
          oos: { start: spec.windows.oos.start, endExclusive: spec.windows.oos.end_exclusive },
          holdout: { start: spec.windows.holdout.start, endExclusive: spec.windows.holdout.end_exclusive },
        }
      : base.windows,
    walkForward: wf
      ? {
          start: wf.start,
          endExclusive: wf.end_exclusive,
          splitMode: wf.split_mode,
          frequency: wf.frequency,
          windowMode: wf.window_mode,
          trainWindow: text(wf.train_window) || undefined,
          labelHorizonBars: text(wf.label_horizon_bars) || undefined,
          purgeBars: text(wf.purge_bars) || undefined,
          embargoBars: text(wf.embargo_bars) || undefined,
          inner: inner
            ? { splitFrequency: inner.split_frequency, windowMode: inner.window_mode, trainWindow: inner.train_window, minFolds: text(inner.min_folds) }
            : undefined,
        }
      : base.walkForward,
    optimizationMode: spec.optimization_mode,
    optimizationSchedule: spec.optimization_schedule,
    optunaTrials: String(spec.optuna_trials),
    earlyStopping: text(spec.early_stopping),
    randomSeed: text(spec.random_seed),
    optimizationConfigOverrides: { ...spec.optimization_config },
  };
}

/** Re-applies copied overrides onto a freshly projected declaration table. */
export function applyOverrides(
  entries: readonly ParameterEntry[],
  overrides: RequestedSpec["parameter_space_overrides"],
): readonly ParameterEntry[] {
  return entries.map((entry) => {
    const override = overrides.find((candidate) => candidate.name === entry.name);
    if (!override) return entry;
    return override.kind === "pin"
      ? { ...entry, dimension: "pin" as const, low: String(override.value), high: "" }
      : { ...entry, dimension: "sweep" as const, low: String(override.low), high: String(override.high) };
  });
}

/* ------------------------------------------------- declaration projection */

/**
 * Builds the sweep/pin table from the version's declared parameter space.
 *
 * The browser never adds, removes or widens an entry: the declared space is
 * the maximal surface, and every row here exists because the server projected
 * it. A `fixed` declaration is rendered as a pin at its declared value with no
 * room to move — it is a parameter the alpha already decided.
 */
export function parameterEntriesFrom(
  space: Readonly<Record<string, DeclaredParameter>>,
): readonly ParameterEntry[] {
  return Object.entries(space)
    /* Stable order: the browser has no opinion about which parameter matters,
       and a map's insertion order is not a declaration. */
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, declared]) => {
      if (declared.kind === "categorical") {
        return {
          name,
          declaredLow: declared.values[0],
          declaredHigh: declared.values[declared.values.length - 1],
          levels: declared.values,
          dimension: "sweep" as const,
          low: String(declared.values[0]),
          high: String(declared.values[declared.values.length - 1]),
        };
      }
      if (declared.kind === "fixed") {
        return {
          name,
          declaredLow: declared.value,
          declaredHigh: declared.value,
          dimension: "pin" as const,
          low: String(declared.value),
          high: "",
        };
      }
      return {
        name,
        declaredLow: declared.low,
        declaredHigh: declared.high,
        declaredStep: declared.step ?? null,
        dimension: "sweep" as const,
        low: String(declared.low),
        high: String(declared.high),
      };
    });
}
