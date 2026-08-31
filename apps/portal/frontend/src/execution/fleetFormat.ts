/** Pure fleet formatters/series shapers — shared by screen and smoke. */
export const fmt2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function fleetSparkSeries(pts: readonly number[]): [string, number][] {
  return pts.map((y, i) => [
    new Date(Date.UTC(2026, 7, 22) - (pts.length - 1 - i) * 3 * 86_400_000).toISOString().slice(0, 10),
    24 - y,
  ]);
}
