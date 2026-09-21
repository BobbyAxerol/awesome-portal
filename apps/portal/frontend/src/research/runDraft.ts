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
  /** Routes the installed release will not run, with the engine's reason. */
  blockedRoutes: Readonly<Record<string, string>>;
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

/** Spec 02 §8 — the ceiling counts swept dimensions, not entries. */
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

export function validateStrategy(draft: RunDraft, limits: DraftConstraints): string | null {
  if (!draft.bound) return null;
  if (limits.entrypoint === null) return null;
  /* Nothing is pinned until a version is actually bound. Without this the
     message read "pinned by  (entrypoint …)" — a claim about a version the
     reader has not chosen, with the gap where its id belongs. */
  if (draft.alphaVersionId.trim() === "") return null;
  /* A bound version pins its entrypoint; picking another strategy is only
     possible by switching to scratch, and the note says exactly that. */
  if (draft.strategyId !== limits.entrypoint) {
    return `Strategy is pinned by ${draft.alphaVersionId} (entrypoint ${limits.entrypoint}) — switch to scratch in Context to explore other strategies.`;
  }
  return null;
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

export function validateParameters(draft: RunDraft): string | null {
  const refused = draft.parameters.map(parameterStatus).find((s) => s.tone === "refused");
  if (refused) return `${refused.name}: ${refused.text}`;
  const swept = sweptCount(draft);
  if (swept > SWEEP_CEILING) {
    return `sweep dims ${swept} > ${SWEEP_CEILING} — pin params or drop entries.`;
  }
  return null;
}

export function validateOptimization(draft: RunDraft, limits: DraftConstraints): string | null {
  const trials = asNumber(draft.optunaTrials);
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
    ["windows", validateWindows(draft)],
    ["parameters", validateParameters(draft)],
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
    strategy_id: draft.strategyId,
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
    parameter_space_overrides: draft.parameters.map(overrideValue),
    optuna_trials: asNumber(draft.optunaTrials) ?? 0,
    early_stopping: asNumber(draft.earlyStopping),
    random_seed: asNumber(draft.randomSeed),
    optimization_config: { ...draft.optimizationConfigOverrides },
    client: {
      engine_release_id: draft.engineReleaseId,
      config_digest: draft.configDigest,
    },
    $defs: {} as RequestedSpec["$defs"],
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
  }
  return spec;
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
        dimension: "sweep" as const,
        low: String(declared.low),
        high: String(declared.high),
      };
    });
}
