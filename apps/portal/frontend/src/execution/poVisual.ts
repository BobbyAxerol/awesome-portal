/**
 * Pure presentation transforms for the Paper Overview board — shape logic
 * only, no data. Shared by the screen and the smoke module.
 */
import type { PoBoardRow, PoDay } from "./paper.smoke";

export function poCells(days: PoBoardRow["days"]): PoDay[] {
  const out: PoDay[] = days.results.map((r) => ({ kind: r > 0 ? "up" : "down" }));
  if (out.length < days.total) out.push({ kind: days.liveToday ? "today" : "next" });
  while (out.length < days.total) out.push({ kind: "ahead" });
  return out;
}

export function poSparkSeries(amp: number, drop: number): [string, number][] {
  const n = 26;
  return Array.from({ length: n }, (_, i) => [
    new Date(Date.UTC(2026, 7, 22) - (n - 1 - i) * 3_600_000).toISOString(),
    Number((amp * Math.sin(i / 6) - (i / n) * drop).toFixed(2)),
  ]);
}
