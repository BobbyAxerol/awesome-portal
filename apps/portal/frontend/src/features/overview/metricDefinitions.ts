/**
 * Metric presentation catalog.
 *
 * QuantBT computes every value; this file only says how to READ one —
 * definition, unit, precision and which direction is good (v0.6 §6.2, strategy
 * import contract §3: "Metric do QuantBT endpoint tính — Portal không tính
 * lại; UI hiển thị kèm definition/unit/segment/source/as_of").
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
    label: "Equity cuối kỳ",
    definition: "Giá trị tài khoản tại bar cuối cùng của segment, sau phí và funding.",
    unit: "currency",
    direction: "higher",
  },
  {
    key: "initial_capital",
    label: "Vốn ban đầu",
    definition: "Vốn cấp cho tài khoản khi segment bắt đầu. Mỗi segment ba-cửa-sổ dùng tài khoản mới.",
    unit: "currency",
    direction: "none",
  },
  {
    key: "total_return_pct",
    label: "Tổng lợi nhuận",
    definition: "Thay đổi equity từ đầu đến cuối segment, tính theo phần trăm vốn ban đầu.",
    unit: "percent",
    direction: "higher",
    toneBasis: "sign",
  },
  {
    key: "cagr_pct",
    label: "CAGR",
    definition: "Tốc độ tăng trưởng kép hằng năm, quy đổi theo lịch annualization đã ghi trong config.",
    unit: "percent",
    direction: "higher",
    annualized: true,
    toneBasis: "sign",
  },
  {
    key: "sharpe",
    label: "Sharpe",
    definition: "Lợi nhuận vượt trội trên một đơn vị độ lệch chuẩn, annualized theo cùng lịch.",
    unit: "ratio",
    direction: "higher",
    annualized: true,
    toneBasis: "adverse-below-zero",
  },
  {
    key: "sortino",
    label: "Sortino",
    definition: "Như Sharpe nhưng chỉ phạt biến động giảm, nên bỏ qua biến động tăng.",
    unit: "ratio",
    direction: "higher",
    annualized: true,
    toneBasis: "adverse-below-zero",
  },
  {
    key: "calmar",
    label: "Calmar",
    definition: "CAGR chia cho max drawdown — lợi nhuận trên mỗi đơn vị sụt giảm sâu nhất.",
    unit: "ratio",
    direction: "higher",
    annualized: true,
    toneBasis: "adverse-below-zero",
  },
  {
    key: "max_drawdown_pct",
    label: "Max drawdown",
    definition: "Mức sụt giảm sâu nhất từ đỉnh equity trước đó trong segment.",
    unit: "percent",
    direction: "lower",
  },
  {
    key: "profit_factor",
    label: "Profit factor",
    definition: "Tổng lãi gộp chia tổng lỗ gộp. Dưới 1 nghĩa là lỗ ròng.",
    unit: "ratio",
    direction: "higher",
    toneBasis: "adverse-below-one",
  },
  {
    key: "num_trades",
    label: "Số lệnh",
    definition: "Số lệnh đã đóng trong segment. Mẫu quá nhỏ làm mọi tỉ số kém tin cậy.",
    unit: "count",
    direction: "none",
  },
  {
    key: "win_rate_pct",
    label: "Tỉ lệ thắng",
    definition: "Phần trăm lệnh đóng có lãi. Không phản ánh độ lớn lãi/lỗ.",
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
      definition: "Chưa có định nghĩa curated cho metric này trong Portal.",
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
