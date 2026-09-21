/**
 * P13 metric/warning registry.
 *
 * Definitions are code-reviewed, versioned product facts rather than labels
 * copied into individual Screen 04 panels.  `origin` documents whether the
 * number is emitted directly by QuantBT, calculated by the confined source
 * adapter over its full result, or not published at all.
 */

export const RESEARCH_METRIC_REGISTRY_VERSION = "research.metric-registry.v1" as const;

export interface ResearchMetricDefinition {
  key: "INITIAL_EQUITY" | "FINAL_EQUITY" | "NET_RETURN_FRACTION" | "MAX_DRAWDOWN_FRACTION"
    | "TRADE_COUNT" | "BARS_PROCESSED" | "BENCHMARK_RETURN_FRACTION" | "FUNDING_TOTAL";
  label: string;
  unit: "CURRENCY" | "FRACTION" | "COUNT";
  scope: "OOS" | "IS_PLUS_OOS" | "NOT_PUBLISHED";
  frequency: "RUN_FINAL" | "PER_OBSERVATION" | "CALENDAR_MONTH";
  origin: "ENGINE_DIRECT" | "SOURCE_DERIVED" | "NOT_PUBLISHED";
  definitionId: `research.metric.v1.${string}`;
  nullRule: string;
  inputs: readonly string[];
}

export const RESEARCH_METRIC_DEFINITIONS: readonly ResearchMetricDefinition[] = Object.freeze([
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
    key: "TRADE_COUNT", label: "Trade count", unit: "COUNT", scope: "IS_PLUS_OOS", frequency: "RUN_FINAL",
    origin: "ENGINE_DIRECT", definitionId: "research.metric.v1.trade_count",
    nullRule: "Absent unless QuantBT emitted an integer num_trades fact.", inputs: ["QuantBT.full_report.num_trades"],
  },
  {
    key: "BARS_PROCESSED", label: "Bars processed", unit: "COUNT", scope: "IS_PLUS_OOS", frequency: "RUN_FINAL",
    origin: "ENGINE_DIRECT", definitionId: "research.metric.v1.bars_processed",
    nullRule: "Absent unless the confined child emitted a bounded processed bar count.", inputs: ["P06.child.bars"],
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
