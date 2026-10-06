/**
 * X2 · B3 — the Screen-06 trial surface and the declared parameter space of a
 * retained Delta WFO run (and the same declared rows for Screen 07).
 *
 * Every fact here is derived on the server from two sealed sources and
 * nothing else:
 *
 *  - the retained TRIAL rows (QuantBT's own trial ledger: parameters and the
 *    IS objective of every Optuna trial, ≤ 64 by the RS-02 admission bound);
 *  - the historical parameter binding the run was admitted under (A10b
 *    registry, looked up by the retained lane profile — never the constants
 *    this build happens to ship).
 *
 * The browser draws coordinates only (spec 06 pitfall 1): every placement,
 * every quantile colour step, every bin count and bin mean, the top-decile
 * share and the rank-correlation proxy is published here with the rule that
 * produced it. Arithmetic on decimals is exact (BigInt at a common scale);
 * the one float step — Spearman's ρ on ranks — is labelled a proxy and
 * rounded to four places, as the hi-fi prints it.
 */

import { z } from "zod";

import { BoundWarningSchema, positionPercent } from "./bound-warning";
import { CurrentSourceParameterMapSchema } from "./current-source.payload";
import {
  DEFAULT_PARAMETER_BINDING_REGISTRY,
  declaredParameterRows,
  exactDecimalText,
  type DeclaredRange,
  type HistoricalProfileBinding,
  type ResearchParameterBindingRegistry,
} from "./parameter-binding.registry";

export const DECLARED_SPACE_RULE = "research.current-source-declared-space.v1" as const;
export const SEARCH_SURFACE_RULE = "research.current-source-search-surface.v1" as const;
/** Spec 06 §7: the surface is downsampled server-side to at most 600 points. */
export const SURFACE_POINT_LIMIT = 600;
/** Spec 06 §3 A4: twelve regions per parameter. */
export const DISTRIBUTION_BIN_COUNT = 12;
/** S06: bounded two-dimensional mean-IS-objective heatmap. */
export const SURFACE_GRID_BINS = 6;
/** Spec 06 §15.3: five ramp steps. */
export const OBJECTIVE_RAMP_STEPS = 5;
/** A5 proxy: fewer complete trials than this give no rank correlation worth printing. */
export const IMPORTANCE_MINIMUM_TRIALS = 8;
/** B4 top-decile share: the pool is ⌈n × 10%⌉ complete trials by IS objective. */
export const TOP_DECILE_FRACTION_PERCENT = 10;

export const SURFACE_REASONS = {
  bindingNotRegistered: "P16_HISTORICAL_PARAMETER_BINDING_NOT_REGISTERED",
  selectionOutsideDeclaration: "P16_SELECTION_OUTSIDE_HISTORICAL_DECLARATION",
  noCompleteTrial: "QUANTBT_LEDGER_HAS_NO_COMPLETE_TRIAL_WITH_AN_OBJECTIVE",
  tooFewForImportance: "TOO_FEW_COMPLETE_TRIALS_FOR_A_RANK_CORRELATION",
  gridAxes: "TWO_DECLARED_NUMERIC_PARAMETERS_REQUIRED_FOR_SURFACE_GRID",
  gridObjective: "IS_OBJECTIVE_NOT_PUBLISHED_FOR_SURFACE_GRID",
  constantParameter: "PARAMETER_TOOK_ONE_VALUE_IN_EVERY_COMPLETE_TRIAL",
  constantObjective: "OBJECTIVE_TOOK_ONE_VALUE_IN_EVERY_COMPLETE_TRIAL",
  interactions: "QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_PARAMETER_INTERACTIONS",
  noRunGlobalSurface: "PER_FOLD_STUDIES_HAVE_NO_RUN_GLOBAL_SURFACE",
} as const;

const Reason = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/);
const Decimal = z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96);
const Name = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/);
const TrialId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/);
const Percent = z.number().finite().min(0).max(100);
const Bucket = z.number().int().min(0).max(OBJECTIVE_RAMP_STEPS - 1);

export const DeclaredSpaceParameterSchema = z.object({
  name: Name,
  kind: z.literal("NUMERIC"),
  minimum: Decimal,
  maximum: Decimal,
  step: Decimal,
  /** Grid points in the declaration: (maximum − minimum) / step + 1, exact. */
  levels: z.number().int().positive().max(1_000_000).nullable(),
  /** The sealed θ* value (QuantBT's selection), the run's own decimal text. */
  value: Decimal,
  position_percent: Percent,
  bound_warning: BoundWarningSchema,
  /** CG-P16-03: a declared/swept value is inside the θ (params) digest. */
  hash_scope: z.literal("PARAMS_DIGEST"),
}).strict();

export const DeclaredSpaceSchema = z.object({
  schema_version: z.literal(DECLARED_SPACE_RULE),
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
  reason_code: Reason.nullable(),
  binding: z.object({
    profile_id: z.string().min(1).max(160),
    profile_digest: z.string().regex(/^[0-9a-f]{64}$/),
    adapter_contract_digest: z.string().regex(/^[0-9a-f]{64}$/),
    installed_in_release: z.string().min(1).max(160),
  }).strict().nullable(),
  parameters: z.array(DeclaredSpaceParameterSchema).max(24),
  /** Points in the declared grid: the exact product of every parameter's levels (null when any is unknown). */
  grid_size: z.string().regex(/^[1-9][0-9]{0,39}$/).nullable(),
  /** New causal runs retain this singleton only as the last-fold deployment. */
  selection_scope: z.literal("LAST_FOLD_DEPLOYMENT").optional(),
  fold_id: TrialId.optional(),
  study_id: TrialId.optional(),
}).strict();

export type DeclaredSpace = z.infer<typeof DeclaredSpaceSchema>;

const SurfacePointSchema = z.object({
  trial_id: TrialId,
  source_ordinal: z.number().int().nonnegative().max(2_000_000),
  state: z.enum(["COMPLETE", "PRUNED", "FAIL", "RUNNING", "WAITING"]),
  objective: Decimal.nullable(),
  /** Ramp step: how many of the complete trials' quintile thresholds this objective lies above (0–4); null without one. */
  objective_bucket: Bucket.nullable(),
  /** The best objective seen in source order up to and including this trial (A3 gold line). */
  best_so_far: Decimal.nullable(),
  selected: z.boolean(),
  best_is: z.boolean(),
  /** Exact persisted trial map for this source ordinal; optional for old responses. */
  parameters: CurrentSourceParameterMapSchema.optional(),
  /** Placement of each declared parameter inside its declared range; null when not placeable. */
  positions: z.record(Name, Percent.nullable()),
}).strict();

const DistributionBinSchema = z.object({
  index: z.number().int().min(0).max(DISTRIBUTION_BIN_COUNT - 1),
  lower: Decimal,
  upper: Decimal,
  count: z.number().int().nonnegative().max(1_000_000),
  mean_objective: Decimal.nullable(),
  /** Ramp step of this bin's mean, scaled between the lowest and highest sampled bin mean of the parameter. */
  shade_bucket: Bucket.nullable(),
}).strict();

const DistributionSchema = z.object({
  name: Name,
  minimum: Decimal,
  maximum: Decimal,
  theta_value: Decimal,
  theta_position_percent: Percent,
  regions_sampled: z.number().int().nonnegative().max(DISTRIBUTION_BIN_COUNT),
  bins: z.array(DistributionBinSchema).length(DISTRIBUTION_BIN_COUNT),
}).strict();

const FrequencySchema = z.object({
  name: Name,
  theta_value: Decimal,
  matching: z.number().int().nonnegative().max(1_000_000),
  share_percent: Percent,
}).strict();

const ImportanceSchema = z.object({
  name: Name,
  state: z.enum(["AVAILABLE", "NOT_APPLICABLE"]),
  reason_code: Reason.nullable(),
  rho: z.string().regex(/^-?[01]\.[0-9]{4}$/).nullable(),
}).strict();

const SurfaceGridSchema = z.object({
  rule: z.literal("COMPLETE_TRIAL_MEAN_IS_OBJECTIVE_2D_6X6_V1"),
  state: z.enum(["AVAILABLE", "NOT_APPLICABLE", "NOT_PUBLISHED"]),
  reason_code: Reason.nullable(),
  x_param: Name.nullable(),
  y_param: Name.nullable(),
  bins_per_axis: z.literal(SURFACE_GRID_BINS),
  included_trial_count: z.number().int().nonnegative().max(1_000_000),
  cells: z.array(z.object({
    x: z.number().int().min(0).max(SURFACE_GRID_BINS - 1),
    y: z.number().int().min(0).max(SURFACE_GRID_BINS - 1),
    n: z.number().int().nonnegative().max(1_000_000),
    mean_is_objective: Decimal.nullable(),
  }).strict()).max(SURFACE_GRID_BINS * SURFACE_GRID_BINS),
}).strict();

export const SearchSurfaceSchema = z.object({
  schema_version: z.literal(SEARCH_SURFACE_RULE),
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"]),
  reason_code: Reason.nullable(),
  objective_kind: z.enum(["IS_MEAN_SHARPE", "NOT_PUBLISHED"]),
  source_trial_count: z.number().int().nonnegative().max(1_000_000),
  complete_trial_count: z.number().int().nonnegative().max(1_000_000),
  emitted_point_count: z.number().int().nonnegative().max(SURFACE_POINT_LIMIT),
  point_limit: z.literal(SURFACE_POINT_LIMIT),
  /** ALL_RETAINED_TRIALS: every retained trial is a point — nothing was sampled away. */
  sampling: z.enum(["ALL_RETAINED_TRIALS", "STRIDE_KEEPING_SELECTED_AND_BEST_V1"]),
  objective_ramp: z.object({
    rule: z.literal("QUINTILE_THRESHOLDS_OF_COMPLETE_TRIAL_OBJECTIVES_V1"),
    steps: z.literal(OBJECTIVE_RAMP_STEPS),
    minimum: Decimal.nullable(),
    maximum: Decimal.nullable(),
  }).strict(),
  selected_trial_id: TrialId.nullable(),
  best_is_trial_id: TrialId.nullable(),
  /** Declared numeric parameters a point is placed on (the axis picker's choices). */
  axes: z.array(Name).max(24),
  points: z.array(SurfacePointSchema).max(SURFACE_POINT_LIMIT),
  /** Additive S06 heatmap; older sealed search clients may omit it. */
  grid: SurfaceGridSchema.optional(),
  distributions: z.object({
    rule: z.literal("COMPLETE_TRIALS_BINNED_OVER_DECLARED_RANGE_V1"),
    bins: z.literal(DISTRIBUTION_BIN_COUNT),
    parameters: z.array(DistributionSchema).max(24),
  }).strict(),
  parameter_frequency: z.object({
    rule: z.literal("TOP_DECILE_IS_TRIALS_AT_THETA_VALUE_V1"),
    state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
    reason_code: Reason.nullable(),
    pool_count: z.number().int().nonnegative().max(1_000_000),
    parameters: z.array(FrequencySchema).max(24),
  }).strict(),
  importance: z.object({
    rule: z.literal("SPEARMAN_RANK_CORRELATION_PROXY_NOT_FANOVA_V1"),
    state: z.enum(["AVAILABLE", "NOT_APPLICABLE"]),
    reason_code: Reason.nullable(),
    minimum_trials: z.literal(IMPORTANCE_MINIMUM_TRIALS),
    parameters: z.array(ImportanceSchema).max(24),
  }).strict(),
  /** A6: no source publishes pairwise interactions; the Portal derives none from ≤ 64 trials. */
  interactions: z.object({ state: z.literal("NOT_PUBLISHED"), reason_code: Reason }).strict(),
}).strict();

export type SearchSurface = z.infer<typeof SearchSurfaceSchema>;

/** Exactly one retained outer study; never a run-global ranking or theta. */
export const SearchStudySurfaceSchema = z.object({
  scope: z.enum(["INNER_VALIDATION_OUTER_STUDY", "OUTER_FOLD_DECAY_STUDY", "IS_ONLY_OUTER_STUDY"]),
  fold_id: TrialId,
  study_id: TrialId,
  surface: SearchSurfaceSchema.extend({
    source_trial_count: z.literal(3),
    complete_trial_count: z.number().int().nonnegative().max(3),
    emitted_point_count: z.number().int().nonnegative().max(3),
    points: z.array(SurfacePointSchema).max(3),
  }),
}).strict();
export type SearchStudySurface = z.infer<typeof SearchStudySurfaceSchema>;

/* ------------------------------------------------------------ decimals */

interface Exact { units: bigint; scale: number }
const DECIMAL = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;

function exact(value: string): Exact | null {
  const match = DECIMAL.exec(value);
  if (!match) return null;
  const fraction = match[3] ?? "";
  if (fraction.length > 40) return null;
  const units = BigInt(`${match[2]}${fraction}`) * (match[1] === "-" ? -1n : 1n);
  return { units, scale: fraction.length };
}

function atScale(value: Exact, scale: number): bigint {
  return value.units * 10n ** BigInt(scale - value.scale);
}

function compareExact(left: Exact, right: Exact): number {
  const scale = Math.max(left.scale, right.scale);
  const a = atScale(left, scale);
  const b = atScale(right, scale);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Canonical decimal text (no trailing zeros, no "-0"). */
function text(units: bigint, scale: number): string {
  const negative = units < 0n;
  let digits = (negative ? -units : units).toString().padStart(scale + 1, "0");
  let whole = scale === 0 ? digits : digits.slice(0, digits.length - scale);
  let fraction = scale === 0 ? "" : digits.slice(digits.length - scale);
  fraction = fraction.replace(/0+$/, "");
  whole = whole.replace(/^0+(?=\d)/, "");
  digits = fraction.length > 0 ? `${whole}.${fraction}` : whole;
  return negative && digits !== "0" ? `-${digits}` : digits;
}

/** Arithmetic mean at 12 fraction digits, rounded half away from zero. */
function mean(values: readonly Exact[]): string | null {
  if (values.length === 0) return null;
  const scale = Math.max(...values.map((value) => value.scale));
  const sum = values.reduce((total, value) => total + atScale(value, scale), 0n);
  const target = 12;
  const numerator = sum * 10n ** BigInt(target);
  const denominator = BigInt(values.length) * 10n ** BigInt(scale);
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const rounded = (magnitude * 2n + denominator) / (denominator * 2n);
  return text(negative ? -rounded : rounded, target);
}

/** Levels of a declared numeric range: (max − min) / step + 1 when the step divides the span exactly. */
export function levelsOf(range: DeclaredRange): number | null {
  const minimum = exactDecimalText(range.minimum);
  const maximum = exactDecimalText(range.maximum);
  const step = exactDecimalText(range.step);
  if (minimum === null || maximum === null || step === null) return null;
  const [lo, hi, st] = [exact(minimum)!, exact(maximum)!, exact(step)!];
  const scale = Math.max(lo.scale, hi.scale, st.scale);
  const span = atScale(hi, scale) - atScale(lo, scale);
  const unit = atScale(st, scale);
  if (unit <= 0n || span < 0n || span % unit !== 0n) return null;
  const count = span / unit + 1n;
  return count <= 1_000_000n ? Number(count) : null;
}

/** Bin lower edge i of n over [lo, hi] as exact decimal text. */
function edge(lo: Exact, hi: Exact, index: number, bins: number): string {
  const scale = Math.max(lo.scale, hi.scale) + 6;
  const low = atScale(lo, scale);
  const span = atScale(hi, scale) - low;
  const value = low + (span * BigInt(index)) / BigInt(bins);
  return text(value, scale);
}

function binIndex(value: Exact, lo: Exact, hi: Exact, bins: number): number | null {
  const scale = Math.max(value.scale, lo.scale, hi.scale);
  const v = atScale(value, scale);
  const low = atScale(lo, scale);
  const span = atScale(hi, scale) - low;
  if (span <= 0n || v < low || v - low > span) return null;
  const index = Number(((v - low) * BigInt(bins)) / span);
  return Math.min(bins - 1, index);
}

/**
 * The hi-fi's ramp step (06 `bucket`): the number of quintile thresholds
 * (20/40/60/80 %, linear interpolation between order statistics) a value lies
 * strictly above. Exact: with pos = k·(n−1)/5, v > x[lo] + f·(x[hi] − x[lo])
 * is tested as 5·(v − x[lo]) > (k·(n−1) mod 5)·(x[hi] − x[lo]).
 */
function quintiles(values: ReadonlyArray<{ key: string; value: Exact }>): Map<string, number> {
  const sorted = [...values].sort((a, b) => compareExact(a.value, b.value));
  const n = sorted.length;
  const scale = Math.max(0, ...sorted.map((item) => item.value.scale));
  const x = sorted.map((item) => atScale(item.value, scale));
  const thresholds = [1, 2, 3, 4].map((k) => {
    const p = k * (n - 1);
    const lo = Math.floor(p / 5);
    const hi = Math.min(n - 1, lo + 1);
    return { lo: x[lo]!, span: x[hi]! - x[lo]!, remainder: BigInt(p % 5) };
  });
  const result = new Map<string, number>();
  for (const item of values) {
    const v = atScale(item.value, scale);
    result.set(item.key, thresholds.filter((q) => 5n * (v - q.lo) > q.remainder * q.span).length);
  }
  return result;
}

/** The hi-fi's bin shade (06 A4): ⌊(m − min)/(max − min) · 4.99⌋ over the sampled bins' means, exact. */
function shades(values: ReadonlyArray<{ key: string; value: Exact }>): Map<string, number> {
  const result = new Map<string, number>();
  if (values.length === 0) return result;
  const scale = Math.max(0, ...values.map((item) => item.value.scale));
  const scaled = values.map((item) => ({ key: item.key, value: atScale(item.value, scale) }));
  const lo = scaled.reduce((min, item) => (item.value < min ? item.value : min), scaled[0]!.value);
  const hi = scaled.reduce((max, item) => (item.value > max ? item.value : max), scaled[0]!.value);
  const span = hi - lo;
  for (const item of scaled) {
    const step = span === 0n ? 0 : Number(((item.value - lo) * 499n) / (span * 100n));
    result.set(item.key, Math.min(OBJECTIVE_RAMP_STEPS - 1, step));
  }
  return result;
}

/** Average ranks (1-based) with ties sharing their mean rank. */
function averageRanks(values: readonly Exact[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => compareExact(a.value, b.value));
  const ranks = new Array<number>(values.length).fill(0);
  let start = 0;
  while (start < order.length) {
    let end = start;
    while (end + 1 < order.length && compareExact(order[end + 1]!.value, order[start]!.value) === 0) end += 1;
    const shared = (start + end + 2) / 2;
    for (let position = start; position <= end; position += 1) ranks[order[position]!.index] = shared;
    start = end + 1;
  }
  return ranks;
}

function pearson(x: readonly number[], y: readonly number[]): number | null {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let index = 0; index < n; index += 1) {
    const dx = x[index]! - mx;
    const dy = y[index]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

function rhoText(value: number): string {
  const clamped = Math.max(-1, Math.min(1, value));
  const fixed = clamped.toFixed(4);
  return fixed === "-0.0000" ? "0.0000" : fixed;
}

/* ------------------------------------------------------ declared space */

/**
 * The declared space a retained run searched: the binding its retained lane
 * profile was sealed under (the ingest refuses any other P10 profile digest,
 * so the lane profile names the exact binding). An unregistered lane answers
 * a typed absence — never the current constants.
 */
export function declaredSpace(
  retainedProfileId: string,
  theta: Readonly<Record<string, string>>,
  registry: ResearchParameterBindingRegistry = DEFAULT_PARAMETER_BINDING_REGISTRY,
): DeclaredSpace {
  const binding: HistoricalProfileBinding | null = registry.byRetainedLaneProfile(retainedProfileId);
  if (!binding) {
    return {
      schema_version: DECLARED_SPACE_RULE,
      state: "NOT_PUBLISHED",
      reason_code: SURFACE_REASONS.bindingNotRegistered,
      binding: null,
      parameters: [],
      grid_size: null,
    };
  }
  const header = {
    profile_id: binding.profileId,
    profile_digest: binding.profileDigest,
    adapter_contract_digest: binding.adapterContractDigest,
    installed_in_release: binding.installedInRelease,
  };
  const rows = declaredParameterRows(binding.parameterSpace, theta);
  if (rows === null || rows.length === 0) {
    return { schema_version: DECLARED_SPACE_RULE, state: "NOT_PUBLISHED", reason_code: SURFACE_REASONS.selectionOutsideDeclaration, binding: header, parameters: [], grid_size: null };
  }
  const levels = rows.map((row) => levelsOf(binding.parameterSpace[row.name]!));
  const grid = levels.every((value): value is number => value !== null)
    ? levels.reduce((product, value) => product * BigInt(value), 1n).toString()
    : null;
  return {
    schema_version: DECLARED_SPACE_RULE,
    state: "AVAILABLE",
    reason_code: null,
    binding: header,
    parameters: rows.map((row) => ({
      name: row.name,
      kind: "NUMERIC" as const,
      minimum: row.minimum,
      maximum: row.maximum,
      step: row.step,
      levels: levelsOf(binding.parameterSpace[row.name]!),
      value: row.value,
      position_percent: row.position_percent,
      bound_warning: row.bound_warning,
      hash_scope: "PARAMS_DIGEST" as const,
    })),
    grid_size: grid,
  };
}

/* -------------------------------------------------------------- surface */

export interface SurfaceTrial {
  sourceOrdinal: number;
  trialId: string;
  state: "COMPLETE" | "PRUNED" | "FAIL" | "RUNNING" | "WAITING";
  objective: string | null;
  parameters: Readonly<Record<string, string>>;
}

function emptyGrid(state: "NOT_APPLICABLE" | "NOT_PUBLISHED", reason: string) {
  return {
    rule: "COMPLETE_TRIAL_MEAN_IS_OBJECTIVE_2D_6X6_V1" as const,
    state,
    reason_code: reason,
    x_param: null,
    y_param: null,
    bins_per_axis: SURFACE_GRID_BINS as typeof SURFACE_GRID_BINS,
    included_trial_count: 0,
    cells: [],
  };
}

function emptySurface(reason: string, sourceTrials: number): SearchSurface {
  return {
    schema_version: SEARCH_SURFACE_RULE,
    state: "NOT_PUBLISHED",
    reason_code: reason,
    objective_kind: "NOT_PUBLISHED",
    source_trial_count: sourceTrials,
    complete_trial_count: 0,
    emitted_point_count: 0,
    point_limit: SURFACE_POINT_LIMIT,
    sampling: "ALL_RETAINED_TRIALS",
    objective_ramp: { rule: "QUINTILE_THRESHOLDS_OF_COMPLETE_TRIAL_OBJECTIVES_V1", steps: OBJECTIVE_RAMP_STEPS, minimum: null, maximum: null },
    selected_trial_id: null,
    best_is_trial_id: null,
    axes: [],
    points: [],
    grid: emptyGrid("NOT_PUBLISHED", reason),
    distributions: { rule: "COMPLETE_TRIALS_BINNED_OVER_DECLARED_RANGE_V1", bins: DISTRIBUTION_BIN_COUNT, parameters: [] },
    parameter_frequency: { rule: "TOP_DECILE_IS_TRIALS_AT_THETA_VALUE_V1", state: "NOT_PUBLISHED", reason_code: reason, pool_count: 0, parameters: [] },
    importance: { rule: "SPEARMAN_RANK_CORRELATION_PROXY_NOT_FANOVA_V1", state: "NOT_APPLICABLE", reason_code: reason, minimum_trials: IMPORTANCE_MINIMUM_TRIALS, parameters: [] },
    interactions: { state: "NOT_PUBLISHED", reason_code: SURFACE_REASONS.interactions },
  };
}

/** The causal profile has no comparable run-global objective or parameter set. */
export function runGlobalCausalSurface(sourceTrials: number, completeTrials: number): SearchSurface {
  if (!Number.isSafeInteger(sourceTrials) || sourceTrials < 6 || sourceTrials > 48 || sourceTrials % 3 !== 0
    || !Number.isSafeInteger(completeTrials) || completeTrials < 0 || completeTrials > sourceTrials) {
    throw new RangeError("Causal trial population is outside the immutable profile bound.");
  }
  const result = emptySurface(SURFACE_REASONS.noRunGlobalSurface, sourceTrials);
  return { ...result, state: "NOT_APPLICABLE", complete_trial_count: completeTrials,
    grid: emptyGrid("NOT_APPLICABLE", SURFACE_REASONS.noRunGlobalSurface) };
}

export interface SearchStudySurfaceInput {
  foldId: string;
  studyId: string;
  selectedTrialId: string;
  selectedParameters: Readonly<Record<string, string>>;
  /** Caller joins these using original study_id AND exact outer fold_id. */
  trials: readonly SurfaceTrial[];
}

/**
 * The immutable causal profile owns 2..16 outer studies, three Stage-A trials
 * each. Compute every statistic independently inside that population; a local
 * best-IS is derived from its complete ledger, not from the final singleton.
 */
export function searchStudySurfaces(
  retainedProfileId: string,
  studies: readonly SearchStudySurfaceInput[],
  scope: "INNER_VALIDATION_OUTER_STUDY" | "OUTER_FOLD_DECAY_STUDY" | "IS_ONLY_OUTER_STUDY" = "INNER_VALIDATION_OUTER_STUDY",
): SearchStudySurface[] {
  if (studies.length < 2 || studies.length > 16) throw new RangeError("Causal study count is outside the immutable profile bound.");
  const foldIds = new Set<string>(), studyIds = new Set<string>(), trialIds = new Set<string>();
  return studies.map((study) => {
    if (!TrialId.safeParse(study.foldId).success || !TrialId.safeParse(study.studyId).success
      || foldIds.has(study.foldId) || studyIds.has(study.studyId) || study.trials.length !== 3) {
      throw new RangeError("Causal surface must have one exact bounded population per outer study.");
    }
    foldIds.add(study.foldId); studyIds.add(study.studyId);
    for (const trial of study.trials) {
      if (!TrialId.safeParse(trial.trialId).success || trialIds.has(trial.trialId)) {
        throw new RangeError("Causal surface trial identities must be unique retained identities.");
      }
      trialIds.add(trial.trialId);
    }
    const selected = study.trials.find(trial => trial.trialId === study.selectedTrialId);
    const names = Object.keys(study.selectedParameters);
    if (!selected || selected.state !== "COMPLETE" || selected.objective === null
      || names.length !== Object.keys(selected.parameters).length
      || names.some(name => selected.parameters[name] !== study.selectedParameters[name])) {
      throw new RangeError("Causal surface selection is not its own complete retained trial.");
    }
    const complete = [...study.trials].sort((a, b) => a.sourceOrdinal - b.sourceOrdinal)
      .filter(trial => trial.state === "COMPLETE" && trial.objective !== null && exact(trial.objective) !== null);
    let bestIs: SurfaceTrial | null = null;
    for (const trial of complete) {
      if (bestIs === null || compareExact(exact(trial.objective!)!, exact(bestIs.objective!)!) > 0) bestIs = trial;
    }
    return SearchStudySurfaceSchema.parse({
      scope, fold_id: study.foldId, study_id: study.studyId,
      surface: searchSurface({ trials: study.trials, space: declaredSpace(retainedProfileId, study.selectedParameters),
        selectedTrialId: study.selectedTrialId, bestIsTrialId: bestIs?.trialId ?? null, objectiveKind: "IS_MEAN_SHARPE" }),
    });
  });
}

/**
 * Stride sampling that always keeps the selected and the best-IS trial
 * (spec 06 pitfall 6). With the RS-02 bound (≤ 64 trials) it never samples;
 * the branch exists so the 600 bound is a rule, not an accident.
 */
function sample<T extends { trialId: string }>(rows: readonly T[], keep: ReadonlySet<string>): { rows: T[]; sampled: boolean } {
  if (rows.length <= SURFACE_POINT_LIMIT) return { rows: [...rows], sampled: false };
  const budget = SURFACE_POINT_LIMIT - keep.size;
  const stride = Math.ceil(rows.length / Math.max(1, budget));
  const chosen = rows.filter((row, index) => keep.has(row.trialId) || index % stride === 0).slice(0, SURFACE_POINT_LIMIT);
  return { rows: chosen, sampled: true };
}

export function searchSurface(input: {
  trials: readonly SurfaceTrial[];
  space: DeclaredSpace;
  selectedTrialId: string | null;
  bestIsTrialId: string | null;
  objectiveKind: import("./current-source.payload").CurrentSourceTrialFacts["objective_kind"];
}): SearchSurface {
  const { trials, space } = input;
  if (space.state !== "AVAILABLE") return emptySurface(space.reason_code ?? SURFACE_REASONS.bindingNotRegistered, trials.length);
  const ordered = [...trials].sort((a, b) => a.sourceOrdinal - b.sourceOrdinal);
  const complete = ordered
    .filter((trial) => trial.state === "COMPLETE" && trial.objective !== null && exact(trial.objective) !== null)
    .map((trial) => ({ trial, objective: exact(trial.objective!)! }));
  if (complete.length === 0) return emptySurface(SURFACE_REASONS.noCompleteTrial, trials.length);

  const axes = space.parameters.map((parameter) => parameter.name);
  const buckets = quintiles(complete.map(({ trial, objective }) => ({ key: trial.trialId, value: objective })));
  const byValue = [...complete].sort((a, b) => compareExact(a.objective, b.objective));
  const keep = new Set([input.selectedTrialId, input.bestIsTrialId].filter((id): id is string => id !== null));

  let best: Exact | null = null;
  let bestText: string | null = null;
  const points = ordered.map((trial) => {
    const objective = trial.objective !== null ? exact(trial.objective) : null;
    if (trial.state === "COMPLETE" && objective !== null && (best === null || compareExact(objective, best) > 0)) {
      best = objective;
      bestText = trial.objective;
    }
    const positions: Record<string, number | null> = {};
    for (const parameter of space.parameters) {
      const value = trial.parameters[parameter.name];
      positions[parameter.name] = value === undefined ? null : positionPercent(value, parameter.minimum, parameter.maximum);
    }
    return {
      trialId: trial.trialId,
      point: {
        trial_id: trial.trialId,
        source_ordinal: trial.sourceOrdinal,
        state: trial.state,
        objective: trial.objective,
        objective_bucket: buckets.get(trial.trialId) ?? null,
        best_so_far: bestText,
        selected: trial.trialId === input.selectedTrialId,
        best_is: trial.trialId === input.bestIsTrialId,
        // Carry the same raw map as the retained ledger, including binary64
        // decimal text. Display-step rounding would change its canonical hash.
        parameters: { ...trial.parameters },
        positions,
      },
    };
  });
  const sampled = sample(points, keep);

  const distributions = space.parameters.map((parameter) => {
    const lo = exact(parameter.minimum)!;
    const hi = exact(parameter.maximum)!;
    const members: Exact[][] = Array.from({ length: DISTRIBUTION_BIN_COUNT }, () => []);
    for (const { trial, objective } of complete) {
      const raw = trial.parameters[parameter.name];
      const value = raw === undefined ? null : exact(raw);
      const index = value === null ? null : binIndex(value, lo, hi, DISTRIBUTION_BIN_COUNT);
      if (index !== null) members[index]!.push(objective);
    }
    const means = members.map((values) => mean(values));
    const sampledMeans = means
      .map((value, index) => ({ key: String(index), value: value === null ? null : exact(value) }))
      .filter((item): item is { key: string; value: Exact } => item.value !== null);
    const binShades = shades(sampledMeans);
    return {
      name: parameter.name,
      minimum: parameter.minimum,
      maximum: parameter.maximum,
      theta_value: parameter.value,
      theta_position_percent: parameter.position_percent,
      regions_sampled: members.filter((values) => values.length > 0).length,
      bins: members.map((values, index) => ({
        index,
        lower: edge(lo, hi, index, DISTRIBUTION_BIN_COUNT),
        upper: edge(lo, hi, index + 1, DISTRIBUTION_BIN_COUNT),
        count: values.length,
        mean_objective: means[index] ?? null,
        shade_bucket: means[index] === null ? null : binShades.get(String(index)) ?? null,
      })),
    };
  });

  const grid = (() => {
    if (input.objectiveKind !== "IS_MEAN_SHARPE") return emptyGrid("NOT_PUBLISHED", SURFACE_REASONS.gridObjective);
    const x = space.parameters.find((parameter) => parameter.name === "window") ?? space.parameters[0];
    const y = space.parameters.find((parameter) => parameter.name === "rvol" && parameter.name !== x?.name)
      ?? space.parameters.find((parameter) => parameter.name !== x?.name);
    if (!x || !y) return emptyGrid("NOT_APPLICABLE", SURFACE_REASONS.gridAxes);
    const members: Exact[][] = Array.from({ length: SURFACE_GRID_BINS * SURFACE_GRID_BINS }, () => []);
    let included = 0;
    for (const { trial, objective } of complete) {
      const xValue = exact(trial.parameters[x.name] ?? "");
      const yValue = exact(trial.parameters[y.name] ?? "");
      const xi = xValue === null ? null : binIndex(xValue, exact(x.minimum)!, exact(x.maximum)!, SURFACE_GRID_BINS);
      const yi = yValue === null ? null : binIndex(yValue, exact(y.minimum)!, exact(y.maximum)!, SURFACE_GRID_BINS);
      if (xi === null || yi === null) continue;
      members[yi * SURFACE_GRID_BINS + xi]!.push(objective);
      included++;
    }
    return {
      rule: "COMPLETE_TRIAL_MEAN_IS_OBJECTIVE_2D_6X6_V1" as const,
      state: "AVAILABLE" as const,
      reason_code: null,
      x_param: x.name,
      y_param: y.name,
      bins_per_axis: SURFACE_GRID_BINS as typeof SURFACE_GRID_BINS,
      included_trial_count: included,
      cells: members.map((values, index) => ({
        x: index % SURFACE_GRID_BINS,
        y: Math.floor(index / SURFACE_GRID_BINS),
        n: values.length,
        mean_is_objective: mean(values),
      })),
    };
  })();

  // B4 · the share of the top-decile trials (by IS objective, ties kept
  // together at the cut) whose value of each parameter equals θ*'s.
  const poolSize = Math.ceil((complete.length * TOP_DECILE_FRACTION_PERCENT) / 100);
  const descending = [...byValue].reverse();
  const cut = descending[poolSize - 1]!.objective;
  const pool = descending.filter(({ objective }) => compareExact(objective, cut) >= 0);
  const frequency = space.parameters.map((parameter) => {
    const theta = exact(parameter.value)!;
    const matching = pool.filter(({ trial }) => {
      const raw = trial.parameters[parameter.name];
      const value = raw === undefined ? null : exact(raw);
      return value !== null && compareExact(value, theta) === 0;
    }).length;
    return {
      name: parameter.name,
      theta_value: parameter.value,
      matching,
      share_percent: Math.round((matching / pool.length) * 10_000) / 100,
    };
  });

  // A5 · Spearman |ρ| proxy between each parameter and the IS objective.
  const enough = complete.length >= IMPORTANCE_MINIMUM_TRIALS;
  const objectiveRanks = averageRanks(complete.map(({ objective }) => objective));
  const importance = space.parameters.map((parameter) => {
    if (!enough) return { name: parameter.name, state: "NOT_APPLICABLE" as const, reason_code: SURFACE_REASONS.tooFewForImportance, rho: null };
    const values = complete.map(({ trial }) => exact(trial.parameters[parameter.name] ?? ""));
    if (values.some((value) => value === null)) {
      return { name: parameter.name, state: "NOT_APPLICABLE" as const, reason_code: SURFACE_REASONS.constantParameter, rho: null };
    }
    const rho = pearson(averageRanks(values as Exact[]), objectiveRanks);
    if (rho === null) {
      const constantObjective = new Set(complete.map(({ trial }) => trial.objective)).size === 1;
      return {
        name: parameter.name,
        state: "NOT_APPLICABLE" as const,
        reason_code: constantObjective ? SURFACE_REASONS.constantObjective : SURFACE_REASONS.constantParameter,
        rho: null,
      };
    }
    return { name: parameter.name, state: "AVAILABLE" as const, reason_code: null, rho: rhoText(rho) };
  }).sort((a, b) => Math.abs(Number(b.rho ?? 0)) - Math.abs(Number(a.rho ?? 0)));

  return {
    schema_version: SEARCH_SURFACE_RULE,
    state: "AVAILABLE",
    reason_code: null,
    objective_kind: input.objectiveKind === "IS_MEAN_SHARPE" ? "IS_MEAN_SHARPE" : "NOT_PUBLISHED",
    source_trial_count: trials.length,
    complete_trial_count: complete.length,
    emitted_point_count: sampled.rows.length,
    point_limit: SURFACE_POINT_LIMIT,
    sampling: sampled.sampled ? "STRIDE_KEEPING_SELECTED_AND_BEST_V1" : "ALL_RETAINED_TRIALS",
    objective_ramp: {
      rule: "QUINTILE_THRESHOLDS_OF_COMPLETE_TRIAL_OBJECTIVES_V1",
      steps: OBJECTIVE_RAMP_STEPS,
      minimum: byValue[0]!.trial.objective,
      maximum: byValue.at(-1)!.trial.objective,
    },
    selected_trial_id: input.selectedTrialId,
    best_is_trial_id: input.bestIsTrialId,
    axes,
    points: sampled.rows.map((row) => row.point),
    grid,
    distributions: { rule: "COMPLETE_TRIALS_BINNED_OVER_DECLARED_RANGE_V1", bins: DISTRIBUTION_BIN_COUNT, parameters: distributions },
    parameter_frequency: {
      rule: "TOP_DECILE_IS_TRIALS_AT_THETA_VALUE_V1",
      state: "AVAILABLE",
      reason_code: null,
      pool_count: pool.length,
      parameters: frequency,
    },
    importance: {
      rule: "SPEARMAN_RANK_CORRELATION_PROXY_NOT_FANOVA_V1",
      state: enough ? "AVAILABLE" : "NOT_APPLICABLE",
      reason_code: enough ? null : SURFACE_REASONS.tooFewForImportance,
      minimum_trials: IMPORTANCE_MINIMUM_TRIALS,
      parameters: importance,
    },
    interactions: { state: "NOT_PUBLISHED", reason_code: SURFACE_REASONS.interactions },
  };
}
