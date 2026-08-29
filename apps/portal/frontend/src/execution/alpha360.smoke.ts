import { useEffect, useState } from "react";
import { smokeMotionAllowed } from "./smokeMotion";
/**
 * SMOKE DATA — Alpha 360° insight tiles. TEMPORARY. DELETE WHEN BR-EX-34 SHIPS.
 *
 * Why this file exists (Bobby, 2026-08-25): nine of the twelve insight tiles are
 * `state: "ok"` but no contract publishes a series for them (BR-EX-34), so the
 * product route rendered nine text frames saying "series not published". That
 * hid every layout, spacing, tooltip and zoom defect in the tile grid. This file
 * gives each ok tile a deterministic series so the grid can be seen, measured
 * and baselined — nothing here is a published projection.
 *
 * How it stays honest:
 * - every series is `evidenceOnly: true`, so `EquityChart` prints
 *   "Evidence fixture — not a published projection." on the tile;
 * - every envelope carries the warning below, so the caption says SMOKE;
 * - the flag `ALPHA_INSIGHT_SMOKE` is the single switch; `alpha360.fixtures.ts`
 *   reads it and nothing else does.
 *
 * Removal contract — do all four, in one commit:
 * 1. delete this file;
 * 2. in `alpha360.fixtures.ts` drop the `withSmokeSeries` call and load the
 *    canonical `execution-analytics.equity-projection.v1` fixture instead;
 * 3. delete the "smoke" cases in `alpha360.test.tsx`;
 * 4. re-record `el-v2-08-alpha-tiles` baseline.
 * Trigger: BR-EX-34 delivered (per-tile series in `packages/contracts/fixtures`).
 */
import type { EquitySeries } from "./components/EquityChart";
import type { ChartEnvelope } from "./contracts";

/** Single switch. `false` restores the honest "not published" frames. */
export const ALPHA_INSIGHT_SMOKE = true;

export const SMOKE_WARNING =
  "SMOKE DATA — synthetic series for layout review only; delete when BR-EX-34 publishes equity_projection.v1";

const START = Date.UTC(2026, 6, 23, 11, 0, 0); // 2026-07-23T11:00Z, 720 hourly buckets → 2026-08-22T10:00Z
const BUCKETS = 720;

function iso(i: number): string {
  return new Date(START + i * 3_600_000).toISOString().replace(".000Z", "Z");
}
function fixed(v: number, dp = 2): string {
  return v.toFixed(dp);
}
/** deterministic pseudo-noise in [-1, 1]; `seed` separates the tiles */
function noise(i: number, seed: number): number {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/**
 * One series per tile index (1-based). Shapes differ per tile so a reviewer can
 * tell them apart on the grid; none of them is the tile's real analytic (a
 * histogram or a funnel is not a line — BR-EX-40 asks for the chart type).
 */
export function smokeSeriesFor(index: number, title: string): EquitySeries {
  const points = [];
  let level = 100 + index * 7;
  const gapFrom = 120 + index * 9;
  const gapTo = gapFrom + 4;
  for (let i = 0; i < BUCKETS; i += 1) {
    const n = noise(i, index);
    switch (index % 4) {
      case 0: level += n * 0.9 + 0.12; break;            // trend up
      case 1: level = 100 + index * 7 + Math.sin(i / 48) * 9 + n * 1.2; break; // oscillation
      case 2: level += n * 1.6 - 0.05; break;            // drift down, noisy
      default: level += i % 96 === 0 ? 6 : n * 0.4 - 0.05; // step
    }
    const inGap = i >= gapFrom && i < gapTo;
    points.push({ t: iso(i), equity: inGap ? null : fixed(level), drawdown: inGap ? null : fixed(Math.min(0, n * 3)) });
  }
  return {
    label: `${title.toLowerCase()} · smoke`,
    points,
    band: null,
    gaps: [{ from: iso(gapFrom), to: iso(gapTo), reason: "smoke gap — 4 buckets withheld to exercise gap rendering" }],
    evidenceOnly: true,
  };
}

/** Envelope for a smoke series: row counts tell the truth about the 720 points drawn. */
export function smokeEnvelope(base: ChartEnvelope): ChartEnvelope {
  return {
    ...base,
    interval: "1h",
    sourceRows: BUCKETS,
    returnedRows: BUCKETS,
    downsampleMethod: null,
    coverage: 1,
    warnings: [...(base.warnings ?? []), SMOKE_WARNING],
  };
}


/** Hi-fi masthead: `age 1.4s` ticking from `as_of`. Smoke-only; off → freshness word. */
export function useAlphaClock(asOf: string | null | undefined): string | null {
  const [t, set] = useState(0);
  useEffect(() => {
    if (!ALPHA_INSIGHT_SMOKE || !asOf) return;
    if (!smokeMotionAllowed()) return;
    const id = window.setInterval(() => set((n) => n + 1), 100);
    return () => window.clearInterval(id);
  }, [asOf]);
  if (!ALPHA_INSIGHT_SMOKE || !asOf) return null;
  return `${(1.4 + (t % 46) / 10).toFixed(1)}s`;
}

/**
 * SMOKE — Equity by stage for the Overview overlay (BR-EX-41 `stage-equity`).
 * Three normalized lines (1.0 at stage entry), 30 daily points to 2026-08-22:
 * paper runs the whole window, sandbox enters at day 8, canary at day 21 —
 * the staged reality the deployment map above already states. Reference
 * fixture for the shape BR-EX-41 publishes; delete with this file.
 */
export function alphaStageEquity(): { name: string; tone: "accent" | "warn" | "good"; points: [string, number][] }[] {
  const day = (i: number) => new Date(Date.UTC(2026, 6, 24 + i)).toISOString().slice(0, 10);
  const det = (i: number, seed: number) => {
    const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const walk = (from: number, seed: number, drift: number): [string, number][] => {
    let v = 1;
    const out: [string, number][] = [];
    for (let i = from; i < 30; i += 1) {
      out.push([day(i), Number(v.toFixed(4))]);
      v *= 1 + drift + (det(i, seed) - 0.5) * 0.006;
    }
    return out;
  };
  return [
    { name: "Paper", tone: "accent", points: walk(0, 3, 0.0011) },
    { name: "Sandbox", tone: "warn", points: walk(8, 7, 0.0008) },
    { name: "Canary", tone: "good", points: walk(21, 11, 0.0014) },
  ];
}

/**
 * SMOKE — declared data frames for insight tiles 8 and 10 (Bobby, 2026-08-29:
 * a tile must never draw undeclared data — when the real series lands it must
 * be unmistakable which pixels were synthetic). Reference shapes for the
 * BR-EX-40 typed tile series (`heatmap`, `line`); delete with this file when
 * BR-EX-40/34 ship.
 */
export const TILE_CHARTS = {
  /** 8 · Execution density day × hour — fills per UTC hour bucket, 7×24. */
  density: {
    days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    hours: Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0")),
    cells: (() => {
      const out: [number, number, number | null][] = [];
      for (let d = 0; d < 7; d += 1) {
        for (let h = 0; h < 24; h += 1) {
          // Venue quiet window 04–06 UTC is an explicit hole, not zero fills.
          if (h >= 4 && h < 6) { out.push([h, d, null]); continue; }
          const base = 6 + 10 * Math.exp(-((h - 14) ** 2) / 18) + (d >= 5 ? -3 : 0);
          out.push([h, d, Math.max(0, Math.round(base + noise(d * 24 + h, 5) * 3))]);
        }
      }
      return out;
    })(),
    foot: "fills per 1h bucket · UTC · 04–06 shown as a hole (no data), never zero",
  },
  /** 10 · Paper vs Live drift — same artifact digest, normalized at window start. */
  drift: {
    series: (() => {
      const day = (i: number) => new Date(Date.UTC(2026, 6, 24 + i)).toISOString().slice(0, 10);
      const walk = (seed: number, drift: number) => {
        let v = 1;
        const pts: [string, number][] = [];
        for (let i = 0; i < 30; i += 1) {
          pts.push([day(i), Number(v.toFixed(4))]);
          v *= 1 + drift + noise(i, seed) * 0.004;
        }
        return pts;
      };
      return [
        { name: "Paper", tone: "accent" as const, points: walk(13, 0.0012) },
        { name: "Live", tone: "warn" as const, points: walk(17, 0.0009) },
      ];
    })(),
    foot: "normalized 1.0 at window start · joined by artifact digest · gap paper−live is the drift",
  },
};
