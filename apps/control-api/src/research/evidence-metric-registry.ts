/**
 * P13 metric/warning registry.
 *
 * Definitions are versioned product facts, not labels copied into a screen.
 * R1 remains readable for immutable historical receipts. R2 corrects the
 * old ambiguous `IS_PLUS_OOS` labels: endpoint values are OOS-series facts,
 * while counters truthfully cover the full confined child tape (including
 * optional warmup). A reader must never silently relabel an R1 run.
 */

export const RESEARCH_METRIC_REGISTRY_VERSION = "research.metric-registry.v2" as const;
export type ResearchMetricRegistryVersion = "research.metric-registry.v1" | typeof RESEARCH_METRIC_REGISTRY_VERSION;

export interface ResearchMetricDefinition {
  key: "INITIAL_EQUITY" | "FINAL_EQUITY" | "NET_RETURN_FRACTION" | "MAX_DRAWDOWN_FRACTION"
    | "TRADE_COUNT" | "BARS_PROCESSED" | "BENCHMARK_RETURN_FRACTION" | "FUNDING_TOTAL";
  label: string;
  unit: "CURRENCY" | "FRACTION" | "COUNT";
  scope: "OOS" | "IS_PLUS_OOS" | "CHILD_TAPE" | "NOT_PUBLISHED";
  frequency: "RUN_FINAL" | "PER_OBSERVATION" | "CALENDAR_MONTH";
  origin: "ENGINE_DIRECT" | "SOURCE_DERIVED" | "NOT_PUBLISHED";
  definitionId: `research.metric.v1.${string}`;
  nullRule: string;
  inputs: readonly string[];
}

const sharedTail: readonly ResearchMetricDefinition[] = Object.freeze([
  {
    key: "NET_RETURN_FRACTION", label: "OOS net return", unit: "FRACTION", scope: "OOS", frequency: "RUN_FINAL",
    origin: "SOURCE_DERIVED", definitionId: "research.metric.v1.oos_net_return_fraction",
    nullRule: "Absent unless initial and final OOS equity are finite and initial equity is positive.", inputs: ["full-oos-equity"],
  },
  {
    key: "MAX_DRAWDOWN_FRACTION", label: "OOS max drawdown", unit: "FRACTION", scope: "OOS", frequency: "RUN_FINAL",
    origin: "SOURCE_DERIVED", definitionId: "research.metric.v1.oos_max_drawdown_fraction",
    nullRule: "Absent unless full chronological OOS equity exists.", inputs: ["full-oos-equity"],
  },
  {
    key: "BENCHMARK_RETURN_FRACTION", label: "Benchmark return", unit: "FRACTION", scope: "NOT_PUBLISHED", frequency: "RUN_FINAL",
    origin: "NOT_PUBLISHED", definitionId: "research.metric.v1.benchmark_return_fraction",
    nullRule: "Never substitute a market close or zero; P04 does not publish a benchmark identity/series.", inputs: [],
  },
  {
    key: "FUNDING_TOTAL", label: "Funding total", unit: "CURRENCY", scope: "NOT_PUBLISHED", frequency: "RUN_FINAL",
    origin: "NOT_PUBLISHED", definitionId: "research.metric.v1.funding_total",
    nullRule: "Never substitute zero; P04 explicitly runs without a funding series.", inputs: [],
  },
]);

/** Historical declaration, retained verbatim for R1 immutable receipts. */
export const RESEARCH_METRIC_DEFINITIONS_V1: readonly ResearchMetricDefinition[] = Object.freeze([
  {
    key: "INITIAL_EQUITY", label: "OOS initial equity", unit: "CURRENCY", scope: "OOS", frequency: "RUN_FINAL",
    origin: "SOURCE_DERIVED", definitionId: "research.metric.v1.oos_initial_equity",
    nullRule: "Absent unless the source emitted at least one OOS equity observation.", inputs: ["equity_points/full-oos"],
  },
  {
    key: "FINAL_EQUITY", label: "Final equity", unit: "CURRENCY", scope: "IS_PLUS_OOS", frequency: "RUN_FINAL",
    origin: "ENGINE_DIRECT", definitionId: "research.metric.v1.final_equity",
    nullRule: "Absent unless QuantBT emitted a finite final_equity fact.", inputs: ["QuantBT.full_report.final_equity"],
  },
  ...sharedTail.slice(0, 2),
  {
    key: "TRADE_COUNT", label: "Trade count", unit: "COUNT", scope: "IS_PLUS_OOS", frequency: "RUN_FINAL",
    origin: "ENGINE_DIRECT", definitionId: "research.metric.v1.trade_count",
    nullRule: "Absent unless QuantBT emitted an integer num_trades fact.", inputs: ["QuantBT.full_report.num_trades"],
  },
  {
    key: "BARS_PROCESSED", label: "Bars processed", unit: "COUNT", scope: "IS_PLUS_OOS", frequency: "RUN_FINAL",
    origin: "ENGINE_DIRECT", definitionId: "research.metric.v1.bars_processed",
    nullRule: "Absent unless the confined child emitted a bounded processed bar count.", inputs: ["P06.child.bars"],
  },
  ...sharedTail.slice(2),
]);

/** Corrected declaration for P13_SOURCE_R2 receipts. */
export const RESEARCH_METRIC_DEFINITIONS: readonly ResearchMetricDefinition[] = Object.freeze([
  {
    key: "INITIAL_EQUITY", label: "OOS opening equity", unit: "CURRENCY", scope: "OOS", frequency: "RUN_FINAL",
    origin: "SOURCE_DERIVED", definitionId: "research.metric.v1.oos_initial_equity",
    nullRule: "Absent unless the source emitted at least one OOS equity observation.", inputs: ["full-oos-equity"],
  },
  {
    key: "FINAL_EQUITY", label: "OOS ending equity", unit: "CURRENCY", scope: "OOS", frequency: "RUN_FINAL",
    origin: "ENGINE_DIRECT", definitionId: "research.metric.v1.final_equity",
    nullRule: "Absent unless QuantBT emitted a finite ending-equity fact that reconciles to the final OOS observation.", inputs: ["QuantBT.full_report.final_equity", "full-oos-equity"],
  },
  ...sharedTail.slice(0, 2),
  {
    key: "TRADE_COUNT", label: "Trade count (child tape)", unit: "COUNT", scope: "CHILD_TAPE", frequency: "RUN_FINAL",
    origin: "ENGINE_DIRECT", definitionId: "research.metric.v1.trade_count",
    nullRule: "Absent unless QuantBT emitted an integer num_trades fact; it covers the full confined child tape, not OOS only.", inputs: ["QuantBT.full_report.num_trades"],
  },
  {
    key: "BARS_PROCESSED", label: "Bars processed (child tape)", unit: "COUNT", scope: "CHILD_TAPE", frequency: "RUN_FINAL",
    origin: "ENGINE_DIRECT", definitionId: "research.metric.v1.bars_processed",
    nullRule: "Absent unless the confined child emitted a bounded processed bar count; it covers optional warmup plus IS/OOS input.", inputs: ["P06.child.bars"],
  },
  ...sharedTail.slice(2),
]);

export function researchMetricDefinitions(version: ResearchMetricRegistryVersion): readonly ResearchMetricDefinition[] {
  return version === "research.metric-registry.v1"
    ? RESEARCH_METRIC_DEFINITIONS_V1
    : RESEARCH_METRIC_DEFINITIONS;
}

export const RESEARCH_WARNING_DEFINITIONS = Object.freeze({
  sampledSeries: {
    definitionId: "research.warning.v1.sampled_equity_series",
    copy: "The chart is an extrema-preserving sample. Official metrics use the full confined QuantBT result.",
  },
  benchmark: {
    definitionId: "research.warning.v1.benchmark_not_published",
    copy: "No benchmark identity or return series was published by this adapter.",
  },
  funding: {
    definitionId: "research.warning.v1.funding_not_published",
    copy: "No funding series was published by this adapter; zero is not implied.",
  },
  zeroVarianceDistribution: {
    definitionId: "research.warning.v1.return_distribution_zero_variance",
    copy: "The source observed zero return variance, so no synthetic distribution bins were created.",
  },
});

/**
 * RF-05 CG-P13-03 · registry v3: OOS performance facts QuantBT computes.
 *
 * v3 does not relabel the eight v1/v2 facts: the Hub keeps publishing them in
 * `metrics[]` under their original registry (P18 reports freeze that array).
 * v3 adds a separate `oos_performance` block.  Each ENGINE_DIRECT value is
 * QuantBT 1.1.1's own `full_report` field over the OOS scope that QuantBT's
 * own `scoped_result(scope="oos")` cuts at the P08 boundary; `sourceLocator`
 * names that field exactly and the reader refuses a receipt that names a
 * different one.  Engine sentinels (0.0 for zero variance, inf without
 * losses, 0.0 without exposure) arrive as typed absences, never as values.
 */
export const RESEARCH_PERFORMANCE_METRIC_REGISTRY_VERSION = "research.metric-registry.v3" as const;

export type ResearchPerformanceMetricKey =
  | "OOS_SHARPE" | "OOS_SORTINO" | "OOS_CAGR_FRACTION" | "OOS_PROFIT_FACTOR"
  | "OOS_LONG_HIT_RATE_FRACTION" | "OOS_SHORT_HIT_RATE_FRACTION" | "OOS_SHARPE_DECAY";

export type ResearchOosAnalyticsMetricField =
  | "sharpe" | "sortino" | "cagr_fraction" | "profit_factor"
  | "long_hit_rate_fraction" | "short_hit_rate_fraction" | "sharpe_decay";

export interface ResearchPerformanceMetricDefinition {
  key: ResearchPerformanceMetricKey;
  /** Field name inside the child's `oos_analytics.metrics` receipt block. */
  sourceField: ResearchOosAnalyticsMetricField;
  label: string;
  unit: "RATIO" | "FRACTION";
  scope: "OOS";
  frequency: "RUN_FINAL";
  origin: "ENGINE_DIRECT" | "NOT_PUBLISHED";
  definitionId: `research.metric.v3.${string}`;
  /** Exact receipt locator an ENGINE_DIRECT value must carry; null otherwise. */
  sourceLocator: string | null;
  nullRule: string;
}

export const RESEARCH_PERFORMANCE_METRIC_DEFINITIONS: readonly ResearchPerformanceMetricDefinition[] = Object.freeze([
  {
    key: "OOS_SHARPE", sourceField: "sharpe", label: "OOS Sharpe", unit: "RATIO", scope: "OOS", frequency: "RUN_FINAL",
    origin: "ENGINE_DIRECT", definitionId: "research.metric.v3.oos_sharpe", sourceLocator: "full_report.sharpe",
    nullRule: "Absent when QuantBT's OOS return sample has fewer than two observations or zero variance (QuantBT reports 0.0 there).",
  },
  {
    key: "OOS_SORTINO", sourceField: "sortino", label: "OOS Sortino", unit: "RATIO", scope: "OOS", frequency: "RUN_FINAL",
    origin: "ENGINE_DIRECT", definitionId: "research.metric.v3.oos_sortino", sourceLocator: "full_report.sortino",
    nullRule: "Absent when the OOS sample has no downside return (QuantBT reports inf or 0.0 there).",
  },
  {
    key: "OOS_CAGR_FRACTION", sourceField: "cagr_fraction", label: "OOS CAGR", unit: "FRACTION", scope: "OOS", frequency: "RUN_FINAL",
    origin: "ENGINE_DIRECT", definitionId: "research.metric.v3.oos_cagr_fraction", sourceLocator: "full_report.cagr_pct/100",
    nullRule: "Absent for an OOS span under one day (QuantBT substitutes total return) or a clamped growth rate. Annualised from the OOS span; a short OOS window yields a large magnitude.",
  },
  {
    key: "OOS_PROFIT_FACTOR", sourceField: "profit_factor", label: "OOS profit factor", unit: "RATIO", scope: "OOS", frequency: "RUN_FINAL",
    origin: "ENGINE_DIRECT", definitionId: "research.metric.v3.oos_profit_factor", sourceLocator: "full_report.profit_factor",
    nullRule: "Absent when the OOS return sample has no losing observation (QuantBT reports inf). Computed on QuantBT's return sample, not per trade.",
  },
  {
    key: "OOS_LONG_HIT_RATE_FRACTION", sourceField: "long_hit_rate_fraction", label: "OOS long-bar hit rate", unit: "FRACTION", scope: "OOS", frequency: "RUN_FINAL",
    origin: "ENGINE_DIRECT", definitionId: "research.metric.v3.oos_long_hit_rate_fraction", sourceLocator: "full_report.long_hitrate_pct/100",
    nullRule: "Absent when no OOS bar held long exposure. Share of long-exposure bars with a positive portfolio return; not a per-trade win rate.",
  },
  {
    key: "OOS_SHORT_HIT_RATE_FRACTION", sourceField: "short_hit_rate_fraction", label: "OOS short-bar hit rate", unit: "FRACTION", scope: "OOS", frequency: "RUN_FINAL",
    origin: "ENGINE_DIRECT", definitionId: "research.metric.v3.oos_short_hit_rate_fraction", sourceLocator: "full_report.short_hitrate_pct/100",
    nullRule: "Absent when no OOS bar held short exposure. Share of short-exposure bars with a positive portfolio return (QuantBT's definition).",
  },
  {
    key: "OOS_SHARPE_DECAY", sourceField: "sharpe_decay", label: "Sharpe decay (IS → OOS)", unit: "RATIO", scope: "OOS", frequency: "RUN_FINAL",
    origin: "NOT_PUBLISHED", definitionId: "research.metric.v3.oos_sharpe_decay", sourceLocator: null,
    nullRule: "Never inferred: the P06 child receipt carries the OOS boundary only, so IS cannot be separated from optional warmup.",
  },
]);
