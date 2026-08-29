/**
 * SMOKE DATA — Operations Queue v2 (hi-fi WF 4e). TEMPORARY. DELETE WHEN
 * BR-EX-47 SHIPS.
 *
 * The queue contract publishes rows (three states, never merged) and a page,
 * but not what the hi-fi needs to triage at a glance: computed priority,
 * plan→apply→verify phase, the detail line under a row, the next step link,
 * the KPI strip, the 24h throughput series, the escalation and plan-expiry
 * countdowns, sub-intent progress, and the Alerts rail (no alerts route is
 * published — §6.5). This module fills exactly those, labelled. Published
 * rows are never overwritten; they are appended after the smoke rows, dimmed.
 *
 * Removal contract (one commit): delete this file · drop `queueSmoke` /
 * `useQueueTick` in `screens/OperationsQueue.tsx` · re-record
 * `el-v2-07-operations-queue` · close the tracker row. Trigger: BR-EX-47 (+
 * BR-EX-43 alerts summary) delivered with canonical fixtures.
 */
import { useEffect, useState } from "react";
import { smokeMotionAllowed } from "./smokeMotion";
import type { QueueRow } from "./operations";

export const QUEUE_SMOKE = true;
export const QUEUE_SMOKE_MOTION = true;
export const QUEUE_SMOKE_WARNING =
  "SMOKE DATA — priority, phase, detail lines, next steps, KPI strip, throughput, countdowns and the alerts rail are synthetic; delete when BR-EX-47 ships";

export type Priority = "P1" | "P2" | "P3";
export type Phase = "plan" | "apply" | "verify";
export interface PhaseMark {
  phase: Phase;
  mark: "done" | "active" | "pending" | "failed";
}
export interface QueueSmokeRow {
  row: QueueRow;
  priority: Priority;
  /** hi-fi row tint: amber for attention, blue edge for running */
  edge: "warn" | "accent" | "none";
  phases: PhaseMark[];
  stateChip: { label: string; tone: "warn" | "accent" | "good" | "mute"; pulse?: boolean };
  /** seconds old at mount; ticks up */
  ageSeconds: number;
  ageTone: "warn" | "mute";
  next: { label: string; href: string | null; muted?: boolean };
  /** detail line under the row (mono 10) */
  detail: DetailPart[];
  /** sub-intent progress 0..100, loops as demo */
  progress?: { value: number; label: string };
  /** seconds until auto-escalation (PARTIAL >15m) */
  escalateIn?: number;
  /** plan expiry seconds (loops 60→0) */
  planExpiry?: boolean;
  done?: boolean;
}
export type DetailPart = { text: string; tone?: "warn" | "bad" | "link"; href?: string; live?: "escalate" | "planExpiry" };

export interface AlertCard {
  level: "CRITICAL" | "WARN" | "INFO";
  ageSeconds: number | string;
  title: string;
  meta: string;
  href: string;
  pulse?: boolean;
  live?: "escalate";
}
export interface QueueSmoke {
  warning: string;
  rows: QueueSmokeRow[];
  kpis: { key: string; label: string; value: string; tone: "warn" | "accent" | "good" | "ink"; sub: string; tint?: boolean; pulse?: boolean }[];
  throughput: number[];
  alerts: AlertCard[];
  criticalCount: number;
  attentionCount: number;
}

function row(id: string, commandKey: string, targetId: string, env: "PAPER" | "SANDBOX" | "LIVE", source: QueueRow["sourceStatus"], verify: QueueRow["verificationResult"], triage: QueueRow["triageState"]): QueueRow {
  return {
    operationId: id, commandKey, environment: env, target: { type: env === "LIVE" ? "ACCOUNT" : "DEPLOYMENT", id: targetId }, riskTier: null, severity: null, sourceAuthority: "EXECUTION",
    sourceStatus: source, verificationResult: verify, triageState: triage, workflowVersion: 1, acknowledgedAt: null, acknowledgedBy: null, resolvedAt: null, resolvedBy: null,
    resolutionReason: null, resolutionEvidenceHash: null, createdAt: "2026-08-22T10:38:00Z", updatedAt: "2026-08-22T10:44:00Z",
  };
}

export const QUEUE_SMOKE_DATA: QueueSmoke = {
  warning: QUEUE_SMOKE_WARNING,
  criticalCount: 1,
  attentionCount: 2,
  rows: [
    {
      row: row("op_1251", "emergency-close", "paper-binance-carry-v32", "PAPER", "PARTIAL" as never, "PARTIAL", "UNACKNOWLEDGED"),
      priority: "P1", edge: "warn",
      phases: [{ phase: "plan", mark: "done" }, { phase: "apply", mark: "failed" }, { phase: "verify", mark: "pending" }],
      stateChip: { label: "PARTIAL 1/2", tone: "warn", pulse: true }, ageSeconds: 360, ageTone: "warn",
      next: { label: "plan residue re-apply →", href: "/administration/actions?operation=op_1251" },
      detail: [{ text: "✓ close BTCUSDT filled" }, { text: "✗ close ETHUSDT — venue reject (post-only)", tone: "warn" }, { text: "same idempotency key on re-apply" }, { text: "escalates to CRITICAL alert in", tone: "bad", live: "escalate" }],
      escalateIn: 900,
    },
    {
      row: row("op_1253", "reconcile-positions", "acct-live-grid-v21", "LIVE", "ACCEPTED" as never, "NOT_STARTED" as never, "ACKNOWLEDGED"),
      priority: "P1", edge: "warn",
      phases: [{ phase: "plan", mark: "done" }, { phase: "apply", mark: "active" }, { phase: "verify", mark: "pending" }],
      stateChip: { label: "AWAITING_APPLY", tone: "warn" }, ageSeconds: 120, ageTone: "mute",
      next: { label: "review in incident inc_44 →", href: "/execution/operations/incidents/inc_44" },
      detail: [{ text: "1 finding rf_2101" }, { text: "blast radius: live account, orders fail-closed" }, { text: "plan", }, { text: "cmd_9f12", tone: "link", href: "/administration/actions?operation=op_1253" }, { text: "expires in", live: "planExpiry" }, { text: "— expired plans regenerate, never auto-apply" }],
      planExpiry: true,
    },
    {
      row: row("op_1255", "account.sync", "acct-sbx-carry-okx", "SANDBOX", "RUNNING" as never, "NOT_STARTED" as never, "ACKNOWLEDGED"),
      priority: "P2", edge: "accent",
      phases: [{ phase: "plan", mark: "done" }, { phase: "apply", mark: "done" }, { phase: "verify", mark: "active" }],
      stateChip: { label: "RUNNING · 2/3", tone: "accent" }, ageSeconds: 34, ageTone: "mute",
      next: { label: "watch — 202 ≠ success", href: null, muted: true },
      detail: [{ text: "balances ✓ · positions ✓ · open orders ◐ — sub-intents verify one by one, terminal state only when all land" }],
      progress: { value: 66, label: "2/3" },
    },
    { row: row("op_1252", "deployment.halt", "dep_88", "LIVE", "SUCCEEDED" as never, "SUCCEEDED", "RESOLVED"), priority: "P3", edge: "none", phases: [{ phase: "plan", mark: "done" }, { phase: "apply", mark: "done" }, { phase: "verify", mark: "done" }], stateChip: { label: "VERIFIED", tone: "good" }, ageSeconds: 240, ageTone: "mute", next: { label: "audit →", href: "/administration/actions?operation=op_1252", muted: true }, detail: [], done: true },
    { row: row("op_1250", "allocation.set", "acct-paper-grid-drb", "PAPER", "SUCCEEDED" as never, "SUCCEEDED", "RESOLVED"), priority: "P3", edge: "none", phases: [{ phase: "plan", mark: "done" }, { phase: "apply", mark: "done" }, { phase: "verify", mark: "done" }], stateChip: { label: "VERIFIED", tone: "good" }, ageSeconds: 3600, ageTone: "mute", next: { label: "audit →", href: "/administration/actions?operation=op_1250", muted: true }, detail: [], done: true },
    { row: row("op_1249", "account.sync", "acct-sbx-mm-okx", "SANDBOX", "SUCCEEDED" as never, "SUCCEEDED", "RESOLVED"), priority: "P3", edge: "none", phases: [{ phase: "plan", mark: "done" }, { phase: "apply", mark: "done" }, { phase: "verify", mark: "done" }], stateChip: { label: "VERIFIED", tone: "good" }, ageSeconds: 10800, ageTone: "mute", next: { label: "audit →", href: "/administration/actions?operation=op_1249", muted: true }, detail: [], done: true },
  ],
  kpis: [
    { key: "partial", label: "Partial", value: "1", tone: "warn", sub: "residue unresolved", tint: true, pulse: true },
    { key: "awaiting", label: "Awaiting apply", value: "1", tone: "ink", sub: "plan generated" },
    { key: "running", label: "Running", value: "1", tone: "ink", sub: "scheduler · sub-intents live" },
    { key: "verified", label: "Verified · 24h", value: "12", tone: "good", sub: "0 failed · 0 dead letters" },
  ],
  throughput: [22, 20, 21, 16, 18, 10, 14, 8, 12, 6, 10, 7, 9],
  alerts: [
    { level: "CRITICAL", ageSeconds: 120, title: "Position MISMATCH — acct-live-grid-v21 · BINANCE", meta: "finding rf_2101 · orders fail-closed · open incident inc_44 →", href: "/execution/operations/incidents/inc_44", pulse: true },
    { level: "WARN", ageSeconds: "4m", title: "Broker sync STALE — dep_91 · OKX", meta: "age 88s vs policy 60s · sandbox workbench →", href: "/deployments/sandbox/dep_77" },
    { level: "WARN", ageSeconds: 360, title: "op_1251 PARTIAL unresolved", meta: "emergency-close residue · this queue ↑ · escalates in", href: "/execution/operations", live: "escalate" },
    { level: "INFO", ageSeconds: "1d", title: "Condition expiring in 7d — capacity cap (Grid v2.1)", meta: "owner Lan · waivers & conditions →", href: "/governance/approvals" },
  ],
};

export function queueSmoke(): QueueSmoke | null {
  return QUEUE_SMOKE ? QUEUE_SMOKE_DATA : null;
}

/** 1s ticker (elapsed seconds) + looping sub-intent progress, as the hi-fi script does. */
export function useQueueTick(): { elapsed: number; sub: number } {
  const [s, set] = useState({ elapsed: 0, sub: 66 });
  useEffect(() => {
    if (!QUEUE_SMOKE || !QUEUE_SMOKE_MOTION) return;
    if (!smokeMotionAllowed()) return;
    const id = window.setInterval(() => set((p) => ({ elapsed: p.elapsed + 1, sub: p.sub >= 96 ? 66 : p.sub + 2 })), 1000);
    return () => window.clearInterval(id);
  }, []);
  return s;
}

export function fmtAge(t: number): string {
  if (t >= 3600) return `${Math.floor(t / 3600)}h`;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
export function sparkPolyline(values: number[], w = 220, h = 26): string {
  const max = Math.max(...values, 1);
  return values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(0)},${(h - 2 - (v / max) * (h - 6)).toFixed(0)}`).join(" ");
}

/** 24h throughput as data — real counts per hourly bucket ending 10:00Z. */
export function throughputSeries(values: readonly number[]): [string, number][] {
  return values.map((v, i) => [
    new Date(Date.UTC(2026, 7, 22, 10) - (values.length - 1 - i) * 3_600_000).toISOString(),
    v,
  ]);
}
