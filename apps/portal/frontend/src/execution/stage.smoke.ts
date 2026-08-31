import type { DailyBar, Histogram, OrderTypeRow, PositionRow, Spark, StageKey, StageVisuals } from "./stage.types";
export type { CapGaugeItem, DailyBar, Histogram, OrderTypeRow, PositionRow, Spark, StageLine, StageVisuals } from "./stage.types";
/**
 * SMOKE DATA — stage workbenches (Paper · Sandbox · Canary · Live). TEMPORARY.
 * DELETE WHEN BR-EX-41 SHIPS.
 *
 * Why (Bobby, 2026-08-25): in the fixture profile every stage screen rendered
 * as text — "not published", "unavailable" — so the layout, the charts and the
 * envelope gauges the hi-fi calls for (1d/1e/1f) could not be seen, let alone
 * reviewed. This module gives each stage a deterministic, clearly labelled set
 * of visuals so the product can be judged before the contracts exist.
 *
 * How it stays honest:
 * - one switch, `STAGE_SMOKE`; off = the screens fall back to their honest states;
 * - every visual carries `smoke: true` and the components print the warning;
 * - nothing here reaches a KPI that the contract DID publish — smoke fills
 *   only what is null.
 *
 * Removal contract (one commit): delete this file · drop `stageVisuals()` in
 * `screens/containers.tsx` and `previewControllers.tsx` · delete
 * `stageSmoke.test.tsx` · re-record `el-v2-06-*` baselines. Trigger: BR-EX-41
 * (stage telemetry: equity by stage, envelope consumption, execution quality,
 * positions snapshot, daily contribution) delivered with canonical fixtures.
 */
import type { EquitySeries } from "./components/EquityChart";
import type { ChartEnvelope } from "./contracts";

export const STAGE_SMOKE = true;
export const STAGE_SMOKE_WARNING =
  "SMOKE DATA — synthetic stage telemetry for layout review; delete when BR-EX-41 ships";

export type { StageKey } from "./stage.types";



const START = Date.UTC(2026, 6, 23, 11, 0, 0);
const HOURS = 720;
function iso(i: number, stepMs = 3_600_000): string {
  return new Date(START + i * stepMs).toISOString().replace(".000Z", "Z");
}
function noise(i: number, seed: number): number {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}
function series(seed: number, drift: number, vol: number, n = HOURS, gapAt = -1): { t: string; v: number | null }[] {
  const out = [];
  let level = 100;
  for (let i = 0; i < n; i += 1) {
    level += noise(i, seed) * vol + drift;
    out.push({ t: iso(i), v: gapAt >= 0 && i >= gapAt && i < gapAt + 4 ? null : Number(level.toFixed(2)) });
  }
  return out;
}

const ENVELOPE: ChartEnvelope = {
  window: "30d",
  interval: "1h",
  currency: "USDT",
  asOf: "2026-08-22T10:42:01Z",
  authority: "DERIVED",
  formulaVersion: "equity_projection.v1",
  sourceRows: HOURS,
  returnedRows: HOURS,
  coverage: 1,
  downsampleMethod: null,
  warnings: [STAGE_SMOKE_WARNING],
};

function latency(seed: number, p50: number, p95: number): Histogram {
  const edges = [0, 100, 150, 200, 250, 300, 400, 500, 750, 1000];
  const buckets = [];
  for (let i = 0; i < edges.length - 1; i += 1) {
    const mid = (edges[i] + edges[i + 1]) / 2;
    const d = Math.exp(-((mid - p50) ** 2) / (2 * (p50 * 0.55) ** 2));
    buckets.push({ from: edges[i], to: edges[i + 1], count: Math.max(0, Math.round(d * 140 + noise(i, seed) * 6)) });
  }
  return { label: "ACK latency", unit: "ms", buckets, p50, p95 };
}
function spark(seed: number, label: string, unit: string, base: number, vol: number, ceiling: number | null, n = 30): Spark {
  const points = [];
  for (let i = 0; i < n; i += 1) points.push({ t: iso(i, 86_400_000), v: Number(Math.max(0, base + noise(i, seed) * vol).toFixed(3)) });
  return { label, unit, points, ceiling };
}
function contribution(seed: number): DailyBar[] {
  const out = [];
  for (let i = 0; i < 30; i += 1) out.push({ t: iso(i, 86_400_000).slice(0, 10), v: Number((noise(i, seed) * 180 + 40).toFixed(2)) });
  return out;
}

const POSITIONS: PositionRow[] = [
  { symbol: "BTCUSDT", side: "LONG", qty: "0.4000", entry: "61,120.00", uPnl: "+2,140.20", leverage: "1.3x", ackLatencyMs: 240 },
  { symbol: "ETHUSDT", side: "SHORT", qty: "2.1000", entry: "3,412.50", uPnl: "−214.85", leverage: "1.1x", ackLatencyMs: 212 },
  { symbol: "SOLUSDT", side: "LONG", qty: "18.0000", entry: "148.20", uPnl: "+402.11", leverage: "1.2x", ackLatencyMs: 268 },
  { symbol: "BNBUSDT", side: "LONG", qty: "3.5000", entry: "566.40", uPnl: "+88.60", leverage: "1.0x", ackLatencyMs: 231 },
];

/** Hi-fi 1d: order-type certification matrix for an OKX perp integration. */
const ORDER_TYPES: OrderTypeRow[] = [
  { type: "MARKET", state: "certified", note: "4/4 smoke fills" },
  { type: "LIMIT", state: "certified", note: "place · amend · cancel" },
  { type: "STOP", state: "pending", note: "venue trigger semantics unverified" },
  { type: "TAKE-PROFIT", state: "untested", note: "not used by this strategy" },
  { type: "TIF", state: "certified", note: "GTC · IOC" },
];

export function stageVisuals(stage: StageKey): StageVisuals {
  const base = { smoke: true as const, stage, warning: STAGE_SMOKE_WARNING, envelope: ENVELOPE, positions: POSITIONS };
  switch (stage) {
    case "paper":
      return {
        ...base,
        equity: { label: "Equity vs approved research evidence", lines: [{ label: "paper", style: "solid", points: series(1, 0.05, 0.9, HOURS, 500) }, { label: "backtest", style: "dotted", points: series(2, 0.06, 0.4) }] },
        caps: [
          { label: "observation days", used: 30, cap: 30, unit: "days", warnAt: 2 },
          { label: "trades", used: 312, cap: 300, unit: "", warnAt: 2 },
          { label: "max drawdown", used: 2.14, cap: 6, unit: "%" },
          { label: "reject rate", used: 0.2, cap: 0.5, unit: "%", warnAt: 0.7 },
        ],
        latency: latency(3, 190, 410),
        sparks: [spark(4, "slippage", "bp", 1.8, 0.9, 5), spark(5, "reject rate", "%", 0.2, 0.12, 0.5)],
        kpis: {},
      };
    case "sandbox":
      return {
        ...base,
        equity: { label: "Sandbox equity · testnet", lines: [{ label: "sandbox", style: "solid", points: series(6, 0.01, 0.5, 240) }] },
        caps: [
          { label: "steps passed", used: 5, cap: 7, unit: "" },
          { label: "smoke fills", used: 4, cap: 4, unit: "", warnAt: 2 },
          { label: "timebox", used: 38, cap: 60, unit: "min" },
          { label: "reject rate", used: 0.0, cap: 0.5, unit: "%" },
        ],
        latency: latency(7, 210, 480),
        sparks: [spark(8, "fill latency p50", "ms", 340, 40, null), spark(9, "slippage", "bp", 2.4, 1.1, 5)],
        positions: [{ symbol: "BTC-USDT-SWAP", side: "LONG", qty: "0.0300", entry: "61,080.00", uPnl: "+1.84", ackLatencyMs: 210 }],
        orderTypes: ORDER_TYPES,
        kpis: { steps_passed: { value: "5/7" }, findings: { value: "2" } },
      };
    case "canary":
      return {
        ...base,
        equity: { label: "Live vs Paper vs Backtest — same artifact digest", lines: [{ label: "live (6d)", style: "solid", points: series(10, 0.03, 0.8, 144) }, { label: "paper", style: "dashed", points: series(11, 0.04, 0.7, 144) }, { label: "backtest", style: "dotted", points: series(12, 0.05, 0.3, 144) }] },
        caps: [
          { label: "capital allocated", used: 5000, cap: 5000, unit: "USDT", warnAt: 2 },
          { label: "max drawdown", used: 0.8, cap: 2.0, unit: "%" },
          { label: "orders today", used: 12, cap: 40, unit: "" },
          { label: "observation", used: 6, cap: 14, unit: "days" },
          { label: "risk envelope used", used: 34, cap: 100, unit: "%" },
        ],
        latency: latency(13, 240, 520),
        sparks: [spark(14, "slippage", "bp", 2.1, 1.0, 5, 6), spark(15, "broker freshness", "s", 0.9, 0.4, 5, 6)],
        positions: [POSITIONS[0]],
        kpis: {
          capital_consumed: { value: "5,000.00", unit: "USDT" },
          gross_notional: { value: "6,120.40", unit: "USDT" },
          daily_pnl: { value: "+112.40", unit: "USDT" },
          open_orders: { value: "1", unit: "" },
          broker_equity: { value: "5,112.40", unit: "USDT" },
        },
      };
    default:
      return {
        ...base,
        equity: { label: "Contribution & edge evidence · 30d vs PF-CRYPTO", lines: [{ label: "live", style: "solid", points: series(16, 0.04, 1.0) }, { label: "portfolio", style: "dashed", points: series(17, 0.03, 0.5) }] },
        caps: [
          { label: "capital", used: 60000, cap: 60000, unit: "USDT", warnAt: 2 },
          { label: "gross exposure", used: 41080, cap: 90000, unit: "USDT" },
          { label: "daily loss", used: 0.4, cap: 2.0, unit: "%" },
          { label: "risk envelope used", used: 58, cap: 100, unit: "%" },
          { label: "open orders", used: 2, cap: 20, unit: "" },
        ],
        latency: latency(18, 230, 500),
        sparks: [spark(19, "broker freshness", "s", 1.1, 0.5, 5), spark(20, "slippage", "bp", 1.6, 0.8, 5)],
        contribution: contribution(21),
        kpis: {
          capital: { value: "60,000.00", unit: "USDT" },
          gross_notional: { value: "41,080.00", unit: "USDT" },
          daily_pnl: { value: "−240.00", unit: "USDT" },
          open_orders: { value: "2", unit: "" },
          broker_equity: { value: "62,140.20", unit: "USDT" },
        },
      };
  }
}

/** The stage's own line as an `EquitySeries`, for screens that already draw one. */
export function primaryEquity(v: StageVisuals): EquitySeries {
  const line = v.equity.lines[0];
  return {
    label: `${line.label} · smoke`,
    points: line.points.map((p) => ({ t: p.t, equity: p.v === null ? null : p.v.toFixed(2) })),
    band: null,
    gaps: null,
    evidenceOnly: true,
  };
}
