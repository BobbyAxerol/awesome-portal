/**
 * Metric presentation catalog.
 *
 * QuantBT computes every value; this file only says how to READ one —
 * definition, unit, precision and which direction is good (v0.6 §6.2, strategy
 * import contract §3: the QuantBT endpoint computes every metric — the Portal
 * never recomputes one, and shows it with its definition, unit, segment, source
 * and as-of.
 *
 * Nothing here derives, rescales or combines numbers.
 */

export type MetricUnit = "percent" | "ratio" | "count" | "currency";

export interface MetricDefinition {
  key: string;
  label: string;
  /** One sentence a reader can act on, in Vietnamese. */
  definition: string;
  unit: MetricUnit;
  /** Which direction is favourable; `none` means it is descriptive only. */
  direction: "higher" | "lower" | "none";
  /**
   * What the sign of this metric means, for colour only.
   *
   * Separate from `direction` because "higher is better" does not imply "a high
   * value is good news" — Sharpe higher is better, but 13.20 is still a level the
   * engine reported, not a verdict it issued. Omitted = never coloured.
   */
  toneBasis?: "sign" | "adverse-below-zero" | "adverse-below-one";
  /** Whether the annualization calendar affects it — audit-relevant. */
  annualized?: boolean;
}

const DEFINITIONS: MetricDefinition[] = [
  {
    key: "final_equity",
    label: "Final equity",
    definition: "Account value at the segment's last bar, after fees and funding.",
    unit: "currency",
    direction: "higher",
  },
  {
    key: "initial_capital",
    label: "Initial capital",
    definition: "Capital the account starts the segment with. Each three-window segment opens a fresh account.",
    unit: "currency",
    direction: "none",
  },
  {
    key: "total_return_pct",
    label: "Total return",
    definition: "Change in equity across the segment, as a percentage of initial capital.",
    unit: "percent",
    direction: "higher",
    toneBasis: "sign",
  },
  {
    key: "cagr_pct",
    label: "CAGR",
    definition: "Compound annual growth rate, annualized on the calendar recorded in the run config.",
    unit: "percent",
    direction: "higher",
    annualized: true,
    toneBasis: "sign",
  },
  {
    key: "sharpe",
    label: "Sharpe",
    definition: "Excess return per unit of standard deviation, annualized on the same calendar.",
    unit: "ratio",
    direction: "higher",
    annualized: true,
    toneBasis: "adverse-below-zero",
  },
  {
    key: "sortino",
    label: "Sortino",
    definition: "Sharpe, but penalising only downside deviation — upside volatility is ignored.",
    unit: "ratio",
    direction: "higher",
    annualized: true,
    toneBasis: "adverse-below-zero",
  },
  {
    key: "calmar",
    label: "Calmar",
    definition: "CAGR divided by max drawdown — return per unit of deepest decline.",
    unit: "ratio",
    direction: "higher",
    annualized: true,
    toneBasis: "adverse-below-zero",
  },
  {
    key: "max_drawdown_pct",
    label: "Max drawdown",
    definition: "Deepest fall from a prior equity peak within the segment.",
    unit: "percent",
    direction: "lower",
  },
  {
    key: "profit_factor",
    label: "Profit factor",
    definition: "Gross profit divided by gross loss. Below 1 means a net loss.",
    unit: "ratio",
    direction: "higher",
    toneBasis: "adverse-below-one",
  },
  {
    key: "num_trades",
    label: "Trades",
    definition: "Trades closed within the segment. A small sample makes every ratio unreliable.",
    unit: "count",
    direction: "none",
  },
  {
    key: "win_rate_pct",
    label: "Win rate",
    definition: "Share of closed trades that were profitable. Says nothing about the size of wins or losses.",
    unit: "percent",
    direction: "none",
  },
];

const BY_KEY = new Map(DEFINITIONS.map((definition) => [definition.key, definition]));

/**
 * Looks up a metric definition.
 *
 * Returns a descriptive fallback for an unknown key rather than hiding the
 * number: a metric the engine emits must still be visible, just without a
 * curated explanation.
 */
export function metricDefinition(key: string): MetricDefinition {
  return (
    BY_KEY.get(key) ?? {
      key,
      label: key.replace(/_/g, " "),
      definition: "The Portal carries no curated definition for this metric yet.",
      unit: key.endsWith("_pct") ? "percent" : key.startsWith("num_") ? "count" : "ratio",
      direction: "none",
    }
  );
}

/** The metrics shown in the headline strip, in reading order. */
export const HEADLINE_METRICS = [
  "final_equity",
  "total_return_pct",
  "sharpe",
  "max_drawdown_pct",
  "num_trades",
] as const;

/** The metrics shown in the comparison matrix, in reading order. */
export const MATRIX_METRICS = [
  "total_return_pct",
  "cagr_pct",
  "sharpe",
  "sortino",
  "calmar",
  "max_drawdown_pct",
  "profit_factor",
  "num_trades",
] as const;

/**
 * Semantic tone for a value.
 *
 * The rule is narrow on purpose. The old rule coloured every `direction:
 * "higher"` metric green at or above zero, which produced two lies:
 *
 *  - **Sharpe 13.20 in green.** The engine reported a level, not a verdict.
 *    Portal painting it "good" is a judgement nobody computed — the same class of
 *    inference §3.5 forbids for numbers, expressed in colour instead.
 *  - **Equity always green.** Equity cannot be negative, so the colour never
 *    varied; a colour that never varies carries no information, and it drains the
 *    one colour that should mean something.
 *
 * So tone now comes from `toneBasis`, which says what — if anything — the sign of
 * this particular metric means:
 *
 *  - `sign`: crossing zero is a real change of outcome (made money / lost money).
 *  - `adverse-below-zero`, `adverse-below-one`: the adverse side is defined, the
 *    favourable side is not a verdict. Adverse gets red; everything else stays
 *    neutral rather than being praised.
 *  - `none`: descriptive. Never coloured. A drawdown lives here: every run has
 *    one, and calling any non-zero drawdown "bad" needs a threshold the engine
 *    never published.
 */
export function metricTone(
  definition: MetricDefinition,
  value: number | null,
): "good" | "bad" | "neutral" {
  if (value === null || Number.isNaN(value)) return "neutral";
  switch (definition.toneBasis ?? "none") {
    case "sign":
      if (value > 0) return "good";
      return value < 0 ? "bad" : "neutral";
    case "adverse-below-zero":
      return value < 0 ? "bad" : "neutral";
    case "adverse-below-one":
      return value < 1 ? "bad" : "neutral";
    default:
      return "neutral";
  }
}
