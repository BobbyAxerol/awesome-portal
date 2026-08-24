/**
 * Evidence-only equity series for `/execution/_fixtures`.
 *
 * No contract publishes an equity series yet (BR-EX-34). This series exists to
 * prove the chart machinery — axes, tooltip, approved band, gaps, zoom, table
 * view — and is labelled as such on the page. It never reaches a product route.
 * Deterministic: same input, same points, so baselines are stable.
 */
import type { EquitySeries } from "./components/EquityChart";

const START = Date.UTC(2026, 6, 23, 11, 0, 0); // 2026-07-23T11:00Z → 720 hourly buckets end 2026-08-22T10:00Z
const GAP_FROM = "2026-08-15T03:00:00Z";
const GAP_TO = "2026-08-15T07:00:00Z";

function iso(i: number): string {
  return new Date(START + i * 3_600_000).toISOString().replace(".000Z", "Z");
}
function fixed(v: number): string {
  return v.toFixed(2);
}
/** small deterministic pseudo-noise in [-1, 1] */
function noise(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

export function evidenceEquitySeries(): EquitySeries {
  const points = [];
  const band = [];
  let equity = 250_000;
  for (let i = 0; i < 720; i += 1) {
    const t = iso(i);
    const drift = 0.35 * i; // slow upward drift, well inside the band
    equity += noise(i) * 180 + 2.1;
    const inGap = t >= GAP_FROM && t < GAP_TO;
    points.push({
      t,
      equity: inGap ? null : fixed(equity),
      drawdown: inGap ? null : fixed(Math.min(0, (noise(i + 7) - 0.6) * 900)),
    });
    band.push({ t, lower: fixed(248_000 + drift - 2_600), upper: fixed(248_000 + drift + 3_400) });
  }
  return {
    label: "paper equity (USDT)",
    points,
    band,
    bandLabel: "approved band · run_5512",
    gaps: [{ from: GAP_FROM, to: GAP_TO, reason: "projection gap — 4 buckets not published" }],
    evidenceOnly: true,
  };
}
