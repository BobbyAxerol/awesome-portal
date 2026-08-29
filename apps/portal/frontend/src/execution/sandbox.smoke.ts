/**
 * SMOKE DATA — Sandbox Overview (entry for WF 1d) and the Sandbox
 * Certification workbench extras (hi-fi WF 1d). TEMPORARY. DELETE WHEN
 * BR-EX-60 (`sandbox-overview.v1`) AND BR-EX-61 (`sandbox-certification.v1.1`)
 * SHIP.
 *
 * Nothing in this file is read from a source. It exists so the hi-fi shape can
 * be reviewed before the contract lands, and every screen that reads it prints
 * `SANDBOX_SMOKE_WARNING` on the page. When the two rows above ship, delete
 * this module and the `sandboxSmoke()` / `certSmoke()` call sites; the
 * contract-driven parts of both screens already stand on their own.
 *
 * Motion (from the hi-fi scripts, both files):
 *  - overview: as_of + broker-sync age tick 1s (age cycles 0..57s); every
 *    2.2s the testnet order journal advances (≈35% of ticks add one filled
 *    order) and the ACK / FILL latency measures wander inside their bands —
 *    ack 28–60ms, fill 90–180ms — with p95 derived (×3.1 / ×2.6) and the
 *    bars following the same numbers;
 *  - certification: as_of + REST snapshot age tick 1s against the 60s policy.
 * Both use a deterministic `noise()`, never `Math.random`, so a screenshot
 * baseline of a frozen clock is reproducible.
 */
import { useEffect, useState } from "react";
import { smokeMotionAllowed } from "./smokeMotion";

export const SANDBOX_SMOKE = true;
export const SANDBOX_SMOKE_MOTION = true;
export const SANDBOX_SMOKE_WARNING =
  "SMOKE DATA — sandbox overview rows, certification progress bars, testnet order-journal counts, venue connectivity measures, recently-certified history, and the certification workbench's lineage, seven steps, reconciliation triptych, findings, order-type matrix, execution quality, smoke plan and cleanup checklist are synthetic; delete when BR-EX-60 / BR-EX-61 ship";

export type SbTone = "good" | "warn" | "bad" | "mute";
export interface SbLink { label: string; href: string }
/** One of the seven certification segments in the overview's progress bar. */
export type SbSeg = "ok" | "warn" | "bad" | "todo";

export interface SbRow {
  alpha: string; dep: string; href: string;
  venue: string; account: string; accountHref: string;
  portfolio: string; portfolioHref: string;
  target: string | null; targetNote: string | null; targetNoteHref?: string | null;
  segments: SbSeg[]; progress: string;
  status: { label: string; tone: "warn" | "bad" };
  inStage: string; stalled?: boolean;
  next: SbLink;
  note: string; noteLinks: SbLink[]; noteWarn: string | null;
  filters: ("halted" | "findings")[];
}

export const SANDBOX_SMOKE_DATA = {
  warning: SANDBOX_SMOKE_WARNING,
  summary: "2 in certification · 2 venues · test funds only",
  kpis: {
    inCert: { value: "2", sub: "certification = 7-step gate to canary" },
    halted: { value: "2", sub: "1 by finding · 1 by operator" },
    findings: { value: "1", sub: "dep_91 recon dry-run · CRITICAL", link: { label: "dep_91", href: "/deployments/sandbox/dep_91" } },
    equity: { value: "20,000", ccy: "USDT", sub: "never enters portfolio NAV" },
    sync: { sub: "OKX rest · policy 60s · BIN-T1 ws OK" },
  },
  counts: { all: 2, halted: 2, findings: 1 },
  rows: [
    {
      alpha: "Carry v3.2", dep: "dep_77", href: "/deployments/sandbox/dep_77",
      venue: "OKX TESTNET", account: "acct-sbx-carry-okx", accountHref: "/deployments/accounts/acct-sbx-carry-okx",
      portfolio: "PF-CRYPTO", portfolioHref: "/deployments/portfolios/PF-CRYPTO",
      target: "PF-MAIN", targetNote: "AP-352 pending", targetNoteHref: "/governance/approvals/AP-352/r2",
      segments: ["ok", "ok", "ok", "ok", "warn", "todo", "todo"], progress: "5/7 · smoke",
      status: { label: "⛔ HALTED · operator", tone: "warn" },
      inStage: "9d",
      next: { label: "run smoke activation →", href: "/deployments/sandbox/dep_77" },
      note: "R1 AP-101 · R2 AP-207 · paper exit PX-29 · smoke plan approved, awaiting apply · cleanup + exit review remain",
      noteLinks: [
        { label: "AP-101", href: "/governance/approvals/AP-101/r1" },
        { label: "AP-207", href: "/governance/approvals/AP-207/r2" },
        { label: "PX-29", href: "/governance/exit-reviews/PX-29" },
      ],
      noteWarn: null,
      filters: ["halted"],
    },
    {
      alpha: "Grid v2.1", dep: "dep_91", href: "/deployments/sandbox/dep_91",
      venue: "OKX TESTNET", account: "acct-sbx-grid-okx", accountHref: "/deployments/accounts/acct-sbx-grid-okx",
      portfolio: "PF-CRYPTO", portfolioHref: "/deployments/portfolios/PF-CRYPTO",
      target: null, targetNote: null,
      segments: ["ok", "ok", "ok", "bad", "todo", "todo", "todo"], progress: "3/7 · recon dry-run",
      status: { label: "⛔ HALTED · finding", tone: "bad" },
      inStage: "36d", stalled: true,
      next: { label: "resolve finding → re-run dry-run", href: "/deployments/sandbox/dep_91" },
      note: "CRITICAL: position mismatch BTC-USDT-SWAP local 0.0000 vs broker 0.0300 · certification fail-closed at step 4 · ",
      noteLinks: [],
      noteWarn: "in stage 36d — stalled certifications surface here, they never expire silently",
      filters: ["halted", "findings"],
    },
  ] as SbRow[],
  tableFoot: {
    left: "row → certification workbench (WF 1d) · steps: account → binding → sync → recon dry-run → smoke → cleanup → exit review",
    right: "rows derive from the deployment registry — a new sandbox deployment appears with zero code",
  },
  journal: {
    // dep_77 counts advance with the tick; dep_91 is halted, so its journal is still.
    base: { orders: 149, filled: 140 },
    grid: { orders: 96, filled: 81, rejected: 14, expired: 1, success: "84.4%" },
    carryRejected: 6, carryExpired: 3,
    types: [
      { label: "LIMIT 148 ✓", tone: "good" as SbTone },
      { label: "MARKET 42 ✓", tone: "good" as SbTone },
      { label: "STOP_MARKET 21 ✓", tone: "good" as SbTone },
      { label: "POST_ONLY 30 ✓", tone: "good" as SbTone },
      { label: "OCO 4 — min 10", tone: "warn" as SbTone },
      { label: "REDUCE_ONLY 0 — required", tone: "mute" as SbTone },
    ],
    typesNote: "order types exercised — certification requires every type the alpha uses in production:",
    rejects: "reject reasons: post-only cross 11 · min-notional 5 · rate-limit 4 — each links its orders in the ",
    rejectsLink: { label: "blotter", href: "/deployments/blotter" },
    head: "from order journal · exact counts",
  },
  connectivity: {
    head: "p50 / p95 · 24h window",
    ack: { base: 38, k: 3.1, barK: 0.9, tone: "good" as SbTone },
    fill: { base: 112, k: 2.6, barK: 2.2, tone: "accent" },
    still: [
      { k: "ws reconnects", v: "3 / 24h", pct: 18, tone: "warn" as SbTone },
      { k: "rate-limit hits", v: "4 / 24h", pct: 9, tone: "bad" as SbTone },
    ],
    note: "latency measured order→ACK and order→first-fill at the gateway · testnet numbers set the ",
    noteB: "baseline expectation",
    noteTail: ", not the production SLO — canary re-measures on mainnet · sustained p95 > 2× baseline raises a finding",
  },
  recent: {
    head: "certification evidence is permanent — it travels with the artifact",
    rows: [
      { at: "2026-07-30", subject: "Grid v2.1 · BINANCE", subjectHref: "/deployments/alphas/av_2041", verdict: "certified 7/7", review: { label: "SX-14", href: "/governance/exit-reviews/SX-14" }, tail: " → promoted to canary (", dep: { label: "dep_88", href: "/deployments/live/dep_88/canary" }, close: ")" },
      { at: "2026-07-18", subject: "MM v1.1 · BINANCE", subjectHref: "/deployments/alphas/av_1907", verdict: "certified 7/7", review: { label: "SX-11", href: "/governance/exit-reviews/SX-11" }, tail: " → canary (", dep: { label: "dep_63", href: "/deployments/live/dep_63/canary" }, close: ", d2/14)" },
    ],
  },
};

export function sandboxSmoke() {
  return SANDBOX_SMOKE ? SANDBOX_SMOKE_DATA : null;
}

/* ---------------------------------------------------------------------------
 * Certification workbench (hi-fi 1d) — one entry per deployment in
 * certification. The hi-fi's `reconFinding` demo state is not a toggle here:
 * it is the difference between the two real deployments — dep_77 is clean and
 * READY, dep_91 carries the CRITICAL finding and is BLOCKED — so both hi-fi
 * states are reachable by switching deployment, and neither is invented.
 * ------------------------------------------------------------------------ */

export interface CertStep { n: number; label: string; state: string; tone: SbTone; pending?: boolean }
export interface CertKV { k: string; v: string; tone?: SbTone; href?: string }
export interface CertFinding {
  status: string; statusTone: "bad" | "warn" | "good";
  severity: string; severityTone: SbTone;
  identity: string; local: string; broker: string;
  action: string; actionHref: string | null; actionTone?: SbTone;
}
export interface CertSmoke {
  dep: string; alpha: string; venue: string; account: string;
  critical: boolean; progress: string; steps: CertStep[];
  /** The stage word only — runtime and readiness are the contract's to state. */
  chips: { validation: string };
  meta: { k: string; v: string; href?: string; tone?: SbTone; tail?: string }[];
  criticalBanner: { title: string; body: string } | null;
  lifecycle: { k: string; v: string; href: string }[]; lifecycleNow: string; lifecycleRest: string[];
  triptych: { internal: CertKV[]; broker: CertKV[]; difference: CertKV[]; brokerHead: string; diffHead: string };
  findings: CertFinding[]; findingsHead: string;
  orderTypes: CertKV[]; orderTypesFoot: string;
  quality: CertKV[]; qualityFoot: string;
  plan: { id: string; rows: CertKV[] };
  cleanup: { rows: { ok: boolean; t: string }[]; foot: string };
  actions: { sync: string; dryRun: string; smoke: { label: string; blocked: string | null }; exit: { label: string; blocked: string | null } };
  actionsFoot: string;
  switcher: { dep: string; label: string; href: string; halted: string | null }[];
}

const SWITCHER = [
  { dep: "dep_77", label: "Carry v3.2 · dep_77 · OKX TESTNET — cert 5/7", href: "/deployments/sandbox/dep_77", halted: null },
  // The switcher names the certification's own state (a finding is open),
  // never a runtime word: `runtime_state` is the contract's to publish.
  { dep: "dep_91", label: "Grid v2.1 · dep_91 · OKX TESTNET —", href: "/deployments/sandbox/dep_91", halted: "⛔ finding open · cert 3/7" },
];

export const CERT_SMOKE_DATA: Record<string, CertSmoke> = {
  dep_77: {
    dep: "dep_77", alpha: "Carry v3.2", venue: "OKX TESTNET", account: "acct-sbx-carry-okx",
    critical: false, progress: "5/7",
    steps: [
      { n: 1, label: "account", state: "✓ created", tone: "good" },
      { n: 2, label: "binding", state: "✓ verified", tone: "good" },
      { n: 3, label: "broker sync", state: "✓ fresh", tone: "good" },
      { n: 4, label: "recon dry-run", state: "✓ clean 12:01Z", tone: "good" },
      { n: 5, label: "smoke", state: "● plan approved", tone: "warn", pending: true },
      { n: 6, label: "cleanup", state: "● final sync pending", tone: "warn" },
      { n: 7, label: "exit review", state: "— not requested", tone: "mute" },
    ],
    chips: { validation: "SANDBOX_VALIDATION" },
    meta: [
      { k: "artifact", v: "sha256:7c2e91…b8", href: "/deployments/alphas/av_2103?tab=Audit" },
      { k: "R1", v: "AP-101", href: "/governance/approvals/AP-101/r1" },
      { k: "R2", v: "AP-207", href: "/governance/approvals/AP-207/r2" },
      { k: "paper exit", v: "PX-29", href: "/governance/exit-reviews/PX-29" },
      { k: "portfolio", v: "PF-CRYPTO", href: "/deployments/portfolios/PF-CRYPTO", tail: " → target PF-MAIN" },
      { k: "gate", v: "R2 AP-352 pending", href: "/governance/approvals/AP-352/r2" },
      { k: "deployment", v: "dep_77", href: "/deployments/sandbox/dep_77" },
      { k: "account", v: "acct-sbx-carry-okx", href: "/deployments/accounts/acct-sbx-carry-okx", tail: " ↔ external_account_ref okx_main_01" },
      { k: "credential", v: "OKX-01 VALID", tone: "good" },
    ],
    criticalBanner: null,
    lifecycle: [
      { k: "R1", v: "AP-101", href: "/governance/approvals/AP-101/r1" },
      { k: "R2", v: "AP-207", href: "/governance/approvals/AP-207/r2" },
      { k: "PAPER", v: "PX-29", href: "/governance/exit-reviews/PX-29" },
    ],
    lifecycleNow: "SANDBOX ● certification 5/7", lifecycleRest: ["CANARY —", "LIVE —"],
    triptych: {
      brokerHead: "BROKER · digest 8c1a…", diffHead: "DERIVED · diff.v1",
      internal: [{ k: "positions", v: "0" }, { k: "open orders", v: "0" }, { k: "equity", v: "10,000.00 USDT" }, { k: "reservations", v: "0" }],
      broker: [{ k: "positions", v: "0" }, { k: "open orders", v: "0" }, { k: "balance", v: "10,000.84 USDT" }, { k: "source", v: "REST snapshot · 10:41:20Z" }],
      difference: [{ k: "positions", v: "MATCH", tone: "good" }, { k: "open orders", v: "MATCH", tone: "good" }, { k: "balance", v: "Δ 0.84 — testnet faucet interest, INFO", tone: "warn" }],
    },
    findingsHead: "last dry-run 12:01Z · history →",
    findings: [
      { status: "OPEN", statusTone: "warn", severity: "INFO", severityTone: "warn", identity: "balance USDT", local: "10,000.00", broker: "10,000.84", action: "accept — testnet faucet interest", actionHref: null },
      { status: "MATCH", statusTone: "good", severity: "—", severityTone: "mute", identity: "all other positions / open orders", local: "0", broker: "0", action: "none", actionHref: null, actionTone: "mute" },
    ],
    orderTypes: [
      { k: "MARKET", v: "✓ certified — 4/4 smoke fills", tone: "good" },
      { k: "LIMIT", v: "✓ certified — place/amend/cancel", tone: "good" },
      { k: "STOP", v: "! pending — venue trigger semantics unverified", tone: "warn" },
      { k: "TAKE-PROFIT", v: "× untested", tone: "mute" },
      { k: "TIF", v: "✓ GTC · IOC", tone: "good" },
    ],
    orderTypesFoot: "strategy uses MARKET + LIMIT only — STOP/TP certification not blocking for this deployment",
    quality: [
      { k: "ACK latency", v: "p50 210ms · p95 480ms (9 orders)" },
      { k: "fill latency", v: "p50 340ms (4 fills)" },
      { k: "slippage", v: "INSUFFICIENT_DATA — needs ≥ 30 fills", tone: "warn" },
      { k: "reject rate", v: "0 / 9" },
    ],
    qualityFoot: "execution_quality.v1 · decision→ACK→fill timestamps from command journal",
    plan: {
      id: "sp_07",
      rows: [
        { k: "quantity", v: "0.0010 BTC-USDT-SWAP" },
        { k: "capital cap", v: "50.00 USDT" },
        { k: "timebox", v: "30 min · auto-halt on expiry" },
        { k: "operator", v: "Stan" },
        { k: "approval", v: "AP-207 · sandbox scope", href: "/governance/approvals/AP-207/r2" },
      ],
    },
    cleanup: {
      rows: [
        { ok: true, t: "no open order on broker" },
        { ok: true, t: "no residual position" },
        { ok: true, t: "reservations released" },
        { ok: false, t: "final sync + clean reconciliation pending" },
      ],
      foot: "exit requires: clean exposure → final sync → clean dry-run → return HALTED",
    },
    actions: {
      sync: "Sync broker", dryRun: "Dry-run reconcile",
      smoke: { label: "Open smoke window ⌄", blocked: null },
      exit: { label: "Request Sandbox Exit Review", blocked: "blocked: cleanup pending" },
    },
    actionsFoot: "fail-closed: ACTIVE impossible while sync STALE / finding CRITICAL / cleanup pending · all actions plan → apply → verify",
    switcher: SWITCHER,
  },
  dep_91: {
    dep: "dep_91", alpha: "Grid v2.1", venue: "OKX TESTNET", account: "acct-sbx-grid-okx",
    critical: true, progress: "3/7",
    steps: [
      { n: 1, label: "account", state: "✓ created", tone: "good" },
      { n: 2, label: "binding", state: "✓ verified", tone: "good" },
      { n: 3, label: "broker sync", state: "✓ fresh", tone: "good" },
      { n: 4, label: "recon dry-run", state: "✕ 1 critical", tone: "bad", pending: true },
      { n: 5, label: "smoke", state: "— blocked", tone: "mute" },
      { n: 6, label: "cleanup", state: "— not started", tone: "mute" },
      { n: 7, label: "exit review", state: "— not requested", tone: "mute" },
    ],
    chips: { validation: "SANDBOX_VALIDATION" },
    meta: [
      { k: "artifact", v: "sha256:41bb7d…c4", href: "/deployments/alphas/av_2041?tab=Audit" },
      { k: "R1", v: "AP-118", href: "/governance/approvals/AP-118/r1" },
      { k: "R2", v: "AP-152", href: "/governance/approvals/AP-152/r2" },
      { k: "paper exit", v: "PX-22", href: "/governance/exit-reviews/PX-22" },
      { k: "portfolio", v: "PF-CRYPTO", href: "/deployments/portfolios/PF-CRYPTO", tail: " → target not requested" },
      { k: "deployment", v: "dep_91", href: "/deployments/sandbox/dep_91" },
      { k: "account", v: "acct-sbx-grid-okx", href: "/deployments/accounts/acct-sbx-grid-okx", tail: " ↔ external_account_ref okx_main_01" },
      { k: "credential", v: "OKX-01 VALID", tone: "good" },
    ],
    criticalBanner: {
      title: "Critical reconciliation finding open — activation fail-closed",
      body: "Position mismatch BTC-USDT-SWAP: local 0.0000 vs broker 0.0300. Smoke activation and Exit Review are blocked until the finding is resolved and a clean dry-run passes.",
    },
    lifecycle: [
      { k: "R1", v: "AP-118", href: "/governance/approvals/AP-118/r1" },
      { k: "R2", v: "AP-152", href: "/governance/approvals/AP-152/r2" },
      { k: "PAPER", v: "PX-22", href: "/governance/exit-reviews/PX-22" },
    ],
    lifecycleNow: "SANDBOX ✕ certification 3/7", lifecycleRest: ["CANARY —", "LIVE —"],
    triptych: {
      brokerHead: "BROKER · digest 3d90…", diffHead: "DERIVED · diff.v1",
      internal: [{ k: "positions", v: "0" }, { k: "open orders", v: "0" }, { k: "equity", v: "10,000.00 USDT" }, { k: "reservations", v: "0" }],
      broker: [{ k: "positions", v: "1 — BTC-USDT-SWAP 0.0300", tone: "bad" }, { k: "open orders", v: "0" }, { k: "balance", v: "10,000.00 USDT" }, { k: "source", v: "REST snapshot · 10:41:20Z" }],
      difference: [{ k: "positions", v: "MISMATCH Δ 0.0300", tone: "bad" }, { k: "open orders", v: "MATCH", tone: "good" }, { k: "balance", v: "MATCH", tone: "good" }],
    },
    findingsHead: "last dry-run 2026-07-23 09:14Z · 36d ago · history →",
    findings: [
      { status: "OPEN", statusTone: "bad", severity: "CRITICAL", severityTone: "bad", identity: "position BTC-USDT-SWAP", local: "0.0000", broker: "0.0300", action: "resolve → apply-from-broker plan", actionHref: "/execution/operations?operation=op_1187" },
      { status: "MATCH", statusTone: "good", severity: "—", severityTone: "mute", identity: "all other positions / open orders", local: "0", broker: "0", action: "none", actionHref: null, actionTone: "mute" },
    ],
    orderTypes: [
      { k: "MARKET", v: "✓ certified — 6/6 smoke fills", tone: "good" },
      { k: "LIMIT", v: "✓ certified — place/amend/cancel", tone: "good" },
      { k: "POST_ONLY", v: "! pending — 11 post-only cross rejects", tone: "warn" },
      { k: "REDUCE_ONLY", v: "× untested — required by the grid exit path", tone: "bad" },
      { k: "TIF", v: "✓ GTC · IOC · POST_ONLY", tone: "good" },
    ],
    orderTypesFoot: "grid uses REDUCE_ONLY on every exit leg — certification cannot complete until it is exercised",
    quality: [
      { k: "ACK latency", v: "p50 260ms · p95 910ms (96 orders)", tone: "warn" },
      { k: "fill latency", v: "p50 410ms (81 fills)" },
      { k: "slippage", v: "p50 6.1bp · p95 21.4bp (81 fills)" },
      { k: "reject rate", v: "14 / 96 — 14.6%", tone: "bad" },
    ],
    qualityFoot: "execution_quality.v1 · decision→ACK→fill timestamps from command journal",
    plan: {
      id: "sp_04",
      rows: [
        { k: "quantity", v: "0.0010 BTC-USDT-SWAP" },
        { k: "capital cap", v: "50.00 USDT" },
        { k: "timebox", v: "30 min · auto-halt on expiry" },
        { k: "operator", v: "— plan not approved while a CRITICAL finding is open", tone: "bad" },
      ],
    },
    cleanup: {
      rows: [
        { ok: false, t: "no open order on broker — not verified since the finding opened" },
        { ok: false, t: "no residual position — broker reports 0.0300 BTC-USDT-SWAP" },
        { ok: true, t: "reservations released" },
        { ok: false, t: "final sync + clean reconciliation pending" },
      ],
      foot: "exit requires: clean exposure → final sync → clean dry-run → return HALTED",
    },
    actions: {
      sync: "Sync broker", dryRun: "Dry-run reconcile",
      smoke: { label: "Open smoke window", blocked: "blocked: critical finding" },
      exit: { label: "Request Sandbox Exit Review", blocked: "blocked: critical finding" },
    },
    actionsFoot: "fail-closed: ACTIVE impossible while sync STALE / finding CRITICAL / cleanup pending · all actions plan → apply → verify",
    switcher: SWITCHER,
  },
};

/** The workbench's smoke for a deployment, or null when the flag is off. */
export function certSmoke(deploymentId: string | null | undefined): CertSmoke | null {
  if (!SANDBOX_SMOKE) return null;
  return CERT_SMOKE_DATA[deploymentId ?? ""] ?? CERT_SMOKE_DATA.dep_77;
}

function noise(i: number, seed: number): number {
  const x = Math.sin(i * 12.9898 + seed) * 43758.5453;
  return (x - Math.floor(x)) - 0.5;
}

/** Overview motion: 1s clock, 2.2s order-journal + latency wander. */
export function useSandboxTick(): { now: Date; orders: number; filled: number; ack: number; fill: number } {
  // Seeded from the browser's clock rather than the epoch: an `as_of —` reads
  // as a broken feed. Under Playwright the clock is frozen, so a baseline of
  // this screen is still reproducible.
  const [s, set] = useState({
    now: new Date(), n: 0,
    orders: SANDBOX_SMOKE_DATA.journal.base.orders,
    filled: SANDBOX_SMOKE_DATA.journal.base.filled,
    ack: SANDBOX_SMOKE_DATA.connectivity.ack.base,
    fill: 112,
  });
  useEffect(() => {
    if (!SANDBOX_SMOKE || !SANDBOX_SMOKE_MOTION) return;
    if (!smokeMotionAllowed()) return;
    set((p) => ({ ...p, now: new Date() }));
    const a = window.setInterval(() => set((p) => ({ ...p, now: new Date() })), 1000);
    const b = window.setInterval(() => set((p) => {
      const n = p.n + 1;
      // ≈35% of ticks fill one more order — the hi-fi's `Math.random() < 0.35`,
      // made deterministic so a frozen-clock baseline is reproducible.
      const add = noise(n, 1.7) > 0.15 ? 1 : 0;
      return {
        ...p, n, orders: p.orders + add, filled: p.filled + add,
        ack: Math.max(28, Math.min(60, p.ack + noise(n, 5.1) * 6)),
        fill: Math.max(90, Math.min(180, p.fill + noise(n, 9.3) * 14)),
      };
    }), 2200);
    return () => { window.clearInterval(a); window.clearInterval(b); };
  }, []);
  return { now: s.now, orders: s.orders, filled: s.filled, ack: s.ack, fill: s.fill };
}

/** Certification motion: the clock, and the REST snapshot age against policy. */
export function useCertTick(): Date {
  const [now, set] = useState(new Date());
  useEffect(() => {
    if (!SANDBOX_SMOKE || !SANDBOX_SMOKE_MOTION) return;
    if (!smokeMotionAllowed()) return;
    set(new Date());
    const t = window.setInterval(() => set(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

export const sbClock = (d: Date, z = true) =>
  d.getTime() === 0
    ? "—"
    : `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}${z ? "Z" : ""}`;
/** REST snapshot age against the venue policy — the hi-fi's `now % 58`. */
export const sbAgeSeconds = (d: Date) => (d.getTime() === 0 ? 0 : Math.floor((d.getTime() / 1000) % 58));
export const sbAge = (d: Date) => (d.getTime() === 0 ? "—" : `${sbAgeSeconds(d)}s`);
export const sbPct = (n: number) => `${n.toFixed(1)}%`;
