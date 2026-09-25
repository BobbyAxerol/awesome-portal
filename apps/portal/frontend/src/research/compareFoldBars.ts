/**
 * Screen 13's "OOS Sharpe per fold, per attempt" figure as a pure function
 * (CG-P20-04, W6a).
 *
 * The server publishes, per attempt, each retained fold's OOS Sharpe as an
 * exact decimal string. This turns them into grouped bars and nothing else:
 * a value is parsed only to place a bar, every printed label is a string the
 * server sent (the highest and lowest published value), and no statistic is
 * derived. Folds group by their source ordinal, attempts keep the server's
 * order inside each group.
 */

export interface FoldBarInput {
  runId: string;
  folds: ReadonlyArray<{ fold_id: string; source_ordinal: number; oos_sharpe: string | null }>;
}

export interface FoldBar {
  runId: string;
  foldId: string;
  /** The server's exact string. */
  value: string;
  x: number;
  width: number;
  y: number;
  height: number;
  sign: "pos" | "neg" | "zero";
}

export interface FoldBarGeometry {
  width: number;
  height: number;
  bars: FoldBar[];
  /** One label per fold ordinal, centred on its group (percent of the box). */
  groups: { ordinal: number; label: string; pct: number }[];
  /** Height of the zero line (percent from the top). */
  zeroPct: number;
  /** The highest and lowest published values, verbatim, at their height. */
  yLabels: { text: string; pct: number }[];
  /** Folds with no published value, per attempt, so the caption can say so. */
  missing: number;
}

const BOX = 1000;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function foldBars(series: readonly FoldBarInput[]): FoldBarGeometry | null {
  const parsed = series.flatMap((item, seriesIndex) =>
    item.folds.map((fold) => ({
      seriesIndex,
      runId: item.runId,
      fold,
      v: fold.oos_sharpe === null ? Number.NaN : Number(fold.oos_sharpe),
    })),
  );
  const drawable = parsed.filter((item) => Number.isFinite(item.v));
  if (drawable.length === 0) return null;
  const ordinals = [...new Set(parsed.map((item) => item.fold.source_ordinal))].sort((left, right) => left - right);
  const high = drawable.reduce((best, item) => (item.v > best.v ? item : best));
  const low = drawable.reduce((best, item) => (item.v < best.v ? item : best));
  const top = Math.max(high.v, 0);
  const bottom = Math.min(low.v, 0);
  const span = top - bottom || 1;
  const y = (value: number) => ((top - value) / span) * BOX;
  const zero = y(0);
  const groupWidth = BOX / ordinals.length;
  const inner = groupWidth * 0.8;
  const barWidth = inner / Math.max(series.length, 1);
  const bars: FoldBar[] = drawable.map((item) => {
    const group = ordinals.indexOf(item.fold.source_ordinal);
    const x = group * groupWidth + (groupWidth - inner) / 2 + item.seriesIndex * barWidth;
    const top2 = Math.min(y(item.v), zero);
    return {
      runId: item.runId,
      foldId: item.fold.fold_id,
      value: item.fold.oos_sharpe!,
      x: round2(x),
      width: round2(Math.max(barWidth - 2, 1)),
      y: round2(top2),
      height: round2(Math.max(Math.abs(y(item.v) - zero), 1)),
      sign: item.v > 0 ? "pos" : item.v < 0 ? "neg" : "zero",
    };
  });
  const labelOf = (ordinal: number) => parsed.find((item) => item.fold.source_ordinal === ordinal)!.fold.fold_id;
  const yLabels = [{ text: high.fold.oos_sharpe!, pct: round2((y(high.v) / BOX) * 100) }];
  if (low !== high && low.fold.oos_sharpe !== high.fold.oos_sharpe) yLabels.push({ text: low.fold.oos_sharpe!, pct: round2((y(low.v) / BOX) * 100) });
  return {
    width: BOX,
    height: BOX,
    bars,
    groups: ordinals.map((ordinal, index) => ({ ordinal, label: labelOf(ordinal), pct: round2(((index + 0.5) * groupWidth / BOX) * 100) })),
    zeroPct: round2((zero / BOX) * 100),
    yLabels,
    missing: parsed.length - drawable.length,
  };
}
