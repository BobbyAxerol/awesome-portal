/**
 * SMOKE DATA — Incident Detail v2 (hi-fi WF 4d). TEMPORARY. DELETE WHEN
 * BR-EX-46 SHIPS.
 *
 * The incident contract publishes state, gate codes, evidence hashes,
 * operations and a timeline — but not the things the hi-fi shows an operator
 * while live capital is frozen: the market band (last price, sparkline, the
 * unreconciled Δ re-priced every tick), the finding text, the sync snapshot
 * pair, blast radius, probable cause, the resolve budget, and the gate rows
 * in words. This module fills exactly those gaps, labelled, so the screen can
 * be judged whole. Published values always win (see `mergeIncident`).
 *
 * Removal contract (one commit): delete this file · drop `incidentSmoke` /
 * `useIncidentLive` in `screens/IncidentDetail.tsx` · re-record
 * `el-v2-07-incident-*` · close the tracker row. Trigger: BR-EX-46 delivered
 * with canonical fixtures (+ the market stream via BR-EX-43/SSE).
 */
import { useEffect, useState } from "react";

export const INCIDENT_SMOKE = true;
export const INCIDENT_SMOKE_WARNING =
  "SMOKE DATA — market band, finding text, snapshots, blast radius, resolve budget and gate wording are synthetic; delete when BR-EX-46 ships";

export interface GateRow {
  state: "done" | "open" | "waiting";
  text: string;
  link?: { label: string; href: string };
}
export interface OpRow {
  at: string;
  id: string;
  command: string;
  status: "VERIFIED" | "AWAITING_APPLY";
  note?: string;
}
export interface IncidentSmoke {
  warning: string;
  subject: string; // "position MISMATCH · acct-live-grid-v21 · BINANCE"
  openedAt: string; // "10:41:52Z"
  owner: string;
  origin: string; // "from alert"
  slaAck: string; // "SLA ack 5m ✓"
  openedSecondsAtMount: number; // 154
  resolveBudgetSeconds: number; // 14400
  symbol: string;
  basePrice: number;
  deltaQty: string; // "0.0200"
  deltaUnit: string; // "BTC"
  evidence: { label: string; value: string; link?: { label: string; href: string }; emphasis?: "bad" }[];
  evidenceFooter: string;
  ops: OpRow[];
  applyPlan: { label: string; href: string };
  opsFooter: string;
  gates: GateRow[];
  gatesFooter: string;
  timeline: { at: string; text: string }[];
  waitingLine: string;
  footerNote: string;
  resolved: {
    ops: OpRow[];
    gates: GateRow[];
    timelineTail: string;
    footerNote: string;
    resolvedIn: string; // "21m 20s"
    resolvedAt: string; // "11:03"
  };
}

export const INCIDENT_SMOKE_DATA: IncidentSmoke = {
  warning: INCIDENT_SMOKE_WARNING,
  subject: "position MISMATCH · acct-live-grid-v21 · BINANCE",
  openedAt: "10:41:52Z",
  owner: "Stan",
  origin: "from alert",
  slaAck: "SLA ack 5m ✓",
  openedSecondsAtMount: 154,
  resolveBudgetSeconds: 14400,
  symbol: "BTCUSDT",
  basePrice: 61455,
  deltaQty: "0.0200",
  deltaUnit: "BTC",
  evidence: [
    { label: "finding", value: "— BTCUSDT local 0.4000 vs broker 0.3800 · Δ 0.0200", link: { label: "rf_2101", href: "/deployments/blotter" } },
    { label: "sync snapshots", value: "10:41:52 MISMATCH (4f2a…) · 10:41:20 OK (2e9c…)", emphasis: "bad" },
    { label: "blast radius", value: "fail-closed · binding binance_main_01 — 2 sibling accounts unaffected", link: { label: "dep_88", href: "/deployments/live/dep_live" } },
    { label: "probable cause", value: "listener gap during ws reconnect 10:41:47–:51 (4.2s)" },
  ],
  evidenceFooter: "broker is truth — resolution converges local state TO the broker, never the reverse",
  ops: [
    { at: "10:42:10", id: "op_1252", command: "deployment.halt dep_88", status: "VERIFIED" },
    { at: "10:44:31", id: "op_1253", command: "reconcile-positions --sync-first", status: "AWAITING_APPLY" },
  ],
  applyPlan: { label: "Open apply plan — reconcile from broker ▸", href: "/administration/actions?operation=op_1253" },
  opsFooter: "all mutations run plan → apply → verify in the Action Drawer · this panel only links them",
  gates: [
    { state: "done", text: "deployment halted — no new exposure", link: { label: "op_1252", href: "/administration/actions?operation=op_1252" } },
    { state: "done", text: "fresh sync snapshot — 10:44:31 (9d1c…)" },
    { state: "open", text: "dry-run clean — 1 finding open ·", link: { label: "apply plan ▸", href: "/administration/actions?operation=op_1253" } },
    { state: "waiting", text: "residue apply VERIFIED — waits on dry-run" },
    { state: "open", text: "resolution reason recorded — required, min 20 chars" },
  ],
  gatesFooter: "Mark RESOLVED unlocks only at 5/5 — gates are server-enforced, this list is their mirror",
  timeline: [
    { at: "10:41:52", text: "alert raised — sync snapshot flagged MISMATCH · risk fail-closed for dep_88" },
    { at: "10:41:58", text: "Stan acknowledged from alert rail (ack ≠ resolve)" },
    { at: "10:42:10", text: "state → MITIGATED — deployment halted, no new exposure possible" },
    { at: "10:44:31", text: "dry-run reconciliation produced 1 finding · apply plan generated" },
  ],
  waitingLine: "▍ waiting on apply — every minute here is a minute of frozen live capital",
  footerNote: "resolving never auto-resumes dep_88 — resume is its own plan/apply/verify with fresh sync",
  resolved: {
    ops: [
      { at: "10:42:10", id: "op_1252", command: "deployment.halt dep_88", status: "VERIFIED" },
      { at: "10:44:31", id: "op_1253", command: "reconcile-positions --sync-first", status: "VERIFIED" },
      { at: "10:58:44", id: "op_1254", command: "reconcile-positions --apply", status: "VERIFIED", note: "positions_v2 → broker · sync → OK" },
    ],
    gates: [
      { state: "done", text: "deployment halted — no new exposure", link: { label: "op_1252", href: "/administration/actions?operation=op_1252" } },
      { state: "done", text: "fresh sync snapshot — 10:44:31 (9d1c…)" },
      { state: "done", text: "dry-run clean — 10:57:02" },
      { state: "done", text: "apply VERIFIED —", link: { label: "op_1254", href: "/administration/actions?operation=op_1254" } },
      { state: "done", text: 'reason — "listener gap, broker state applied"' },
    ],
    timelineTail: '10:58:44 apply VERIFIED · sync OK · 11:03:12 state → RESOLVED with reason "listener gap, broker state applied"',
    footerNote: "dep_88 still HALTED — resume deliberately left to the operator (fresh sync required)",
    resolvedIn: "21m 20s",
    resolvedAt: "11:03",
  },
};

export function incidentSmoke(): IncidentSmoke | null {
  return INCIDENT_SMOKE ? INCIDENT_SMOKE_DATA : null;
}

/** deterministic pseudo-noise in [-1, 1] */
function noise(i: number, seed: number): number {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

export interface IncidentLive {
  /** seconds the incident has been open (base + elapsed) */
  openSeconds: number;
  price: number;
  prev: number;
  spark: number[];
}

/**
 * The hi-fi's two timers: a 1s clock and a 1.4s price tick (±22, clamped to
 * 60,800–62,200, last 48 points kept for the sparkline). Deterministic per
 * tick so the same second renders the same frame; frozen under reduced
 * motion and under the e2e clock.
 */
export function useIncidentLive(base: IncidentSmoke | null, resolved: boolean): IncidentLive {
  const [state, setState] = useState<IncidentLive>(() => ({
    openSeconds: base?.openedSecondsAtMount ?? 0,
    price: base?.basePrice ?? 0,
    prev: base?.basePrice ?? 0,
    spark: base ? [base.basePrice, base.basePrice] : [],
  }));
  useEffect(() => {
    if (!base || resolved) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let n = 0;
    const clock = window.setInterval(() => setState((s) => ({ ...s, openSeconds: s.openSeconds + 1 })), 1000);
    const price = window.setInterval(() => {
      n += 1;
      setState((s) => {
        const next = Math.max(60_800, Math.min(62_200, s.price + (noise(n, 7) - 0.04) * 22));
        return { ...s, prev: s.price, price: next, spark: [...s.spark, next].slice(-48) };
      });
    }, 1400);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(price);
    };
  }, [base, resolved]);
  return state;
}

export function mmss(seconds: number): string {
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}
export function hhmm(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  return `${h}h ${m}m`;
}
export function sparkPoints(values: number[], w = 260, h = 36): string {
  const sp = values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0];
  const min = Math.min(...sp);
  const max = Math.max(...sp);
  const rng = max - min || 1;
  return sp.map((v, i) => `${((i / (sp.length - 1)) * w).toFixed(1)},${(h - 4 - ((v - min) / rng) * (h - 8) + 2).toFixed(1)}`).join(" ");
}
