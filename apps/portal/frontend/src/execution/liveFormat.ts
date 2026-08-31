/** Pure live-overview formatters — no data, shared by screen and smoke. */
export const fmtPnl = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmt0 = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

export function sparkSeries(sp: readonly number[], scale: number, off: number): [string, number][] {
  const pts = sp.length > 1 ? sp : [0, 0];
  return pts.map((v, i) => [
    new Date(Date.UTC(2026, 7, 22, 10, 42, 1) + i * 1400).toISOString(),
    Number((v * scale - off).toFixed(2)),
  ]);
}
