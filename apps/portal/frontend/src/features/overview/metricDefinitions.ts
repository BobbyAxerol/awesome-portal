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
  },
  {
    key: "cagr_pct",
    label: "CAGR",
    definition: "Tốc độ tăng trưởng kép hằng năm, quy đổi theo lịch annualization đã ghi trong config.",
    unit: "percent",
    direction: "higher",
    annualized: true,
  },
  {
    key: "sharpe",
    label: "Sharpe",
    definition: "Lợi nhuận vượt trội trên một đơn vị độ lệch chuẩn, annualized theo cùng lịch.",
    unit: "ratio",
    direction: "higher",
    annualized: true,
  },
  {
    key: "sortino",
    label: "Sortino",
    definition: "Như Sharpe nhưng chỉ phạt biến động giảm, nên bỏ qua biến động tăng.",
    unit: "ratio",
    direction: "higher",
    annualized: true,
  },
  {
    key: "calmar",
    label: "Calmar",
    definition: "CAGR chia cho max drawdown — lợi nhuận trên mỗi đơn vị sụt giảm sâu nhất.",
    unit: "ratio",
    direction: "higher",
    annualized: true,
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
 * Only applied when the metric has a direction; a descriptive metric such as
 * trade count is never coloured good or bad.
 */
export function metricTone(
  definition: MetricDefinition,
  value: number | null,
): "good" | "bad" | "neutral" {
  if (value === null || definition.direction === "none") return "neutral";
  if (definition.direction === "higher") return value >= 0 ? "good" : "bad";
  // A drawdown is reported as a magnitude; any non-zero value is adverse.
  return value === 0 ? "neutral" : "bad";
}
