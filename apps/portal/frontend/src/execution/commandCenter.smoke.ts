/**
 * SMOKE DATA — Command Center hi-fi 5a extras. TEMPORARY. DELETE WHEN
 * BR-EX-42/44/45 SHIP.
 *
 * The hi-fi Command Center carries three things `command-center.v1` does not
 * publish yet: the Promotion Pipeline (funnel + alpha × stage matrix), a stage
 * chip / figure / status on each pinned row, and a sub-note on fleet cells.
 * Bobby (2026-08-25) wants the screen judged whole, so this module fills only
 * those gaps, deterministically and labelled. Values the contract DOES publish
 * are never overwritten.
 *
 * Removal contract (one commit): delete this file · drop `ccSmoke` in
 * `screens/CommandCenter.tsx` · re-record `el-v2-07-command-center` · close
 * the smoke row in PHASE_TRACKER. Trigger: BR-EX-42 (pinned), BR-EX-44
 * (fleet sub), BR-EX-45 (pipeline) delivered with canonical fixtures.
 */
export const CC_SMOKE = true;
/**
 * SMOKE MOTION — the screen "breathes" on a 1s ticker so the owner can judge
 * how live values will read: the as_of clock runs, triage ages grow, broker
 * sync age jitters, a pinned figure nudges. Real data replaces all of it
 * (BR-EX-43 stream / SSE); delete with this file. Off under reduced motion.
 */
export const CC_SMOKE_MOTION = true;
export const CC_SMOKE_WARNING = "SMOKE DATA — pipeline, pinned stage/status and fleet sub-notes are synthetic; delete when BR-EX-42/44/45 ship";

export type StageKey = "PAPER" | "SANDBOX" | "CANARY" | "LIVE";
export interface FunnelStage {
  key: StageKey;
  label: string;
  entered: number;
  /** entered at this stage / entered at the previous one */
  conversion: { num: number; den: number } | null;
  note: string;
}
export interface MatrixCell {
  kind: "done" | "current" | "none";
  /** "PX-22" for done (links the exit decision) · "30/30 gate met" for current */
  label?: string;
  venue?: string;
  ref?: string;
  /** paused glyph beside the venue (hi-fi: OKX ⏸) */
  paused?: boolean;
}
export interface MatrixRow {
  alpha: string;
  /** Where the alpha name goes: its 360° when the fixture has one, else the fleet list. */
  href: string;
  cells: Record<StageKey, MatrixCell>;
}
export interface Pipeline {
  window: string;
  authority: string;
  stages: FunnelStage[];
  rows: MatrixRow[];
}
export interface PinExtra {
  stage: StageKey;
  figure: string;
  figureTone: "good" | "warn" | "bad" | "mute";
  status: "READY" | "HALTED" | "BLOCKED" | "DEGRADED";
  venue: string;
  deploymentId: string;
}
export interface FleetExtra {
  sub?: string;
  subTone?: "good" | "warn" | "bad" | "mute";
  tone?: "good" | "warn" | "bad" | "mute";
}

export const CC_PIPELINE: Pipeline = {
  window: "90d",
  authority: "EXECUTION",
  stages: [
    { key: "PAPER", label: "Paper entered", entered: 8, conversion: null, note: "in stage now 3" },
    { key: "SANDBOX", label: "Sandbox", entered: 5, conversion: { num: 5, den: 8 }, note: "in stage now 2 · 1 HALTED" },
    { key: "CANARY", label: "Canary", entered: 3, conversion: { num: 3, den: 5 }, note: "in stage now 2 · d9/14 · d2/14" },
    { key: "LIVE", label: "Live", entered: 2, conversion: { num: 2, den: 3 }, note: "in stage now 2" },
  ],
  rows: [
    { alpha: "Grid v2.1", href: "/deployments/alphas/av_2041", cells: { PAPER: { kind: "done", label: "PX-22", ref: "30/30 gate met", venue: "DERIBIT · EX-771" }, SANDBOX: { kind: "done", label: "SX-14", venue: "OKX", paused: true }, CANARY: { kind: "current", label: "d9/14", venue: "BINANCE" }, LIVE: { kind: "done", label: "08-01", venue: "CX-08" } } },
    { alpha: "Carry v3.2", href: "/deployments/alphas", cells: { PAPER: { kind: "current", label: "12/30", venue: "BINANCE" }, SANDBOX: { kind: "current", label: "cert 5/7", venue: "OKX-T" }, CANARY: { kind: "none" }, LIVE: { kind: "none" } } },
    { alpha: "MM v1.1", href: "/deployments/alphas", cells: { PAPER: { kind: "done", label: "PX-31" }, SANDBOX: { kind: "done", label: "07-22" }, CANARY: { kind: "current", label: "d2/14", venue: "BINANCE" }, LIVE: { kind: "none" } } },
    { alpha: "VnMomo v0.9", href: "/deployments/alphas", cells: { PAPER: { kind: "current", label: "6/30", venue: "VN MARKET" }, SANDBOX: { kind: "none" }, CANARY: { kind: "none" }, LIVE: { kind: "none" } } },
  ],
};

/** Keyed by the pinned row's label as the fixture publishes it. */
export const CC_PIN_EXTRA: Record<string, PinExtra> = {
  "Carry v3.2": { stage: "PAPER", figure: "12/30d", figureTone: "mute", status: "READY", venue: "BINANCE", deploymentId: "dep_74" },
  "Basis v2.1": { stage: "CANARY", figure: "+112", figureTone: "good", status: "READY", venue: "BINANCE", deploymentId: "dep_88" },
};

/** Keyed by fleet cell label. */
export const CC_FLEET_EXTRA: Record<string, FleetExtra> = {
  Live: { tone: "bad" },
  Canary: { sub: "d9 · d2", subTone: "mute" },
  Sandbox: { sub: "1 HALTED", subTone: "warn" },
  "Broker sync": { tone: "warn" },
  Findings: { tone: "bad" },
};

export function ccSmoke() {
  return CC_SMOKE ? { warning: CC_SMOKE_WARNING, pipeline: CC_PIPELINE, pins: CC_PIN_EXTRA, fleet: CC_FLEET_EXTRA } : null;
}

import { useEffect, useState } from "react";

/** Seconds elapsed since mount, ticking every `everyMs`; 0 forever when motion is off. */
export function useSmokeTick(everyMs = 1000): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!CC_SMOKE || !CC_SMOKE_MOTION) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setTick((t) => t + everyMs / 1000), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return tick;
}

/** ISO as_of advanced by `seconds`, printed without milliseconds. */
export function advanceAsOf(asOf: string | null, seconds: number): string | null {
  if (!asOf) return null;
  const t = Date.parse(asOf);
  if (!Number.isFinite(t)) return asOf;
  return new Date(t + seconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** deterministic jitter in [-1, 1] from the tick */
export function jitter(tick: number, seed = 1): number {
  const x = Math.sin(tick * 12.9898 + seed * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}
