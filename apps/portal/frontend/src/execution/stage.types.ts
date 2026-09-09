import type { ChartEnvelope } from "./contracts";

export type StageKey = "paper" | "sandbox" | "canary" | "live";

/**
 * Stage-visual TYPE vocabulary — no values, no business facts (N29-FE-01 §8).
 * The smoke module and the lab own the demo values; product components may
 * import these shapes to type their props.
 */
export interface StageLine {
  label: string;
  /** solid = this stage · dashed = paper · dotted = backtest (never colour alone) */
  style: "solid" | "dashed" | "dotted";
  points: { t: string; v: number | null }[];
}

export interface CapGaugeItem {
  label: string;
  used: number;
  cap: number;
  unit: string;
  /** breach ⇒ auto-halt: tone follows the fraction, not a mood. */
  warnAt?: number;
}

export interface Histogram {
  label: string;
  /**
   * A literal suffix printed after the figure — `ms`, `%`, `bps`.
   *
   * NOT a formatting class. Passing "money" here printed `0MONEY` on the Alpha
   * 360 histogram for every alpha: a caller meant "format these as money" and
   * the component appended the word. When the figures need formatting the
   * caller does it and passes `display`, because only the caller knows the
   * currency.
   */
  unit: string;
  buckets: { from: number; to: number; count: number }[];
  p50: number;
  p95: number;
  /** Already-formatted p50/p95, when the raw numbers are not what to show. */
  display?: { p50: string; p95: string };
}

export interface Spark {
  label: string;
  unit: string;
  points: { t: string; v: number }[];
  ceiling?: number | null;
}

export interface DailyBar {
  t: string;
  v: number;
}

export interface PositionRow {
  symbol: string;
  side: "LONG" | "SHORT";
  qty: string;
  entry: string;
  uPnl: string;
  leverage?: string;
  ackLatencyMs?: number;
}

export interface OrderTypeRow {
  type: string;
  state: "certified" | "pending" | "untested";
  note: string;
}

export interface StageVisuals {
  smoke: true;
  stage: StageKey;
  warning: string;
  envelope: ChartEnvelope;
  equity: { lines: StageLine[]; label: string };
  caps: CapGaugeItem[];
  latency: Histogram;
  sparks: Spark[];
  contribution?: DailyBar[];
  positions: PositionRow[];
  orderTypes?: OrderTypeRow[];
  /** Values for KPI slots the contract left null, keyed by KPI key. */
  kpis: Record<string, { value: string; unit?: string | null }>;
}
