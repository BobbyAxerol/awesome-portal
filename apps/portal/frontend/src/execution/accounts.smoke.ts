/**
 * SMOKE DATA — Accounts & Bindings (list, entry screen WF 1g), Binding Detail
 * (binance_main_01) and the Account/Broker 360 extras. TEMPORARY. DELETE WHEN
 * BR-EX-52 (list) / BR-EX-53 (binding detail) SHIP.
 *
 * Domain: a binding = one credentialed external account at a venue
 * (`broker_bindings`, `external_account_ref`); virtual accounts (`accounts`)
 * are the portal's allocation ledger inside it; Σ virtual ≤ physical is
 * enforced at allocation time. Motion (hi-fi scripts): as_of clock 1s;
 * physical equity jitter j ∈ [−8, 8] every 1.4s (headroom breathes,
 * allocations do not); BINANCE ws age cycling 0.4–5.0s; OKX rest age 0–58s;
 * DERIBIT credential EXPIRING pulse; VN MARKET session by ICT calendar; sync
 * stream prepends an `OK · ws delta applied` snapshot every 5s (max 6).
 */
import { useEffect, useState } from "react";
import { smokeMotionAllowed } from "./smokeMotion";

export const ACCOUNTS_SMOKE = true;
export const ACCOUNTS_SMOKE_MOTION = true;
export const ACCOUNTS_SMOKE_WARNING =
  "SMOKE DATA — bindings, credentials, physical equity, Σ virtual/headroom, sync ages, findings, binding detail (capital invariant bar, credential, sync stream, audit) are synthetic; delete when BR-EX-52/53 ship";

export interface Chip { label: string; tone: "bad" | "warn" | "paper" | "mute"; strong?: boolean; shield?: boolean }
export interface VirtualRow { id: string; href: string; chip: Chip; who: string; whoLinks?: { label: string; href: string }[]; equity: string; alloc: string; sync: string; syncTone: "good" | "bad" | "warn" | "mute"; health: string; healthTone: "good" | "bad" | "warn" | "mute"; healthTail?: string }
export interface BindingRow {
  id: string; venue: string; href: string | null; sub: string; subLink?: { label: string; href: string }; env: Chip;
  cred: { alias: string; state: string; stateTone: "good" | "warn"; pulse?: boolean; sub?: string; subLink?: { label: string; href: string } };
  physical: "live" | string; physTone?: "mute"; virt: string; virtTone?: "mute"; virtCcy?: string; accounts: number;
  sync: "ws" | "okx" | "vnm" | string; syncTone: "good" | "mute"; health: string; healthTone: "bad" | "warn" | "good" | "mute"; healthPulse?: boolean; healthLink?: { label: string; href: string };
  note: string; noteLinks?: { label: string; href: string }[]; filters: ("live" | "testnet" | "paper" | "issues")[]; virtuals?: VirtualRow[];
}

export const ACCOUNTS_SMOKE_DATA = {
  warning: ACCOUNTS_SMOKE_WARNING,
  summary: "5 bindings · 4 venues · 8 virtual accounts", physBase: 43120, virt: 41000,
  kpis: { credentials: { valid: 3, expiring: "1 EXPIRING · 6d", otp: "1 OTP" }, findings: { n: 1, label: "MISMATCH", link: { label: "inc_44", href: "/execution/operations/incidents/inc_44" }, tail: "acct-live-grid-v21" }, sync: { ok: "4/5", sub: "per-venue policy · 1 N/A (calendar)" } },
  counts: { all: 5, live: 1, testnet: 2, paper: 2, issues: 2 },
  rows: [
    { id: "binance_main_01", venue: "BINANCE", href: "/deployments/accounts?binding=binance_main_01", sub: "broker_bindings · external_account_ref · ", subLink: { label: "binding detail →", href: "/deployments/accounts?binding=binance_main_01" }, env: { label: "MAINNET", tone: "bad", strong: true },
      cred: { alias: "BIN-01", state: "VALID", stateTone: "good", sub: "scopes: trade, read · no withdraw" }, physical: "live", virt: "41,000", accounts: 3, sync: "ws", syncTone: "good", health: "1 MISMATCH", healthTone: "bad", healthPulse: true, healthLink: { label: "inc_44", href: "/execution/operations/incidents/inc_44" },
      note: "3 virtual accounts share this physical account — allocation is a ledger entry, not a broker transfer · click to collapse", filters: ["live", "issues"],
      virtuals: [
        { id: "acct-live-grid-v21", href: "/deployments/accounts/acct-live-grid-v21", chip: { label: "LIVE_FULL", tone: "bad", strong: true }, who: "Grid v2.1 · dep_live · PF-CRYPTO", whoLinks: [{ label: "dep_live", href: "/deployments/live/dep_live" }], equity: "20,354", alloc: "18,400", sync: "recon HALTED", syncTone: "bad", health: "MISMATCH Δ 0.0200 BTC", healthTone: "bad" },
        { id: "acct-live-carry-v32", href: "/deployments/accounts/acct-live-carry-v32", chip: { label: "LIVE_FULL", tone: "bad", strong: true }, who: "Carry v3.2 · PF-CRYPTO", whoLinks: [{ label: "PF-CRYPTO", href: "/deployments/portfolios/PF-CRYPTO" }], equity: "15,102", alloc: "14,900", sync: "OK", syncTone: "good", health: "READY", healthTone: "good" },
        { id: "acct-canary-mm-v11", href: "/deployments/accounts/acct-canary-mm-v11", chip: { label: "⛨ CANARY", tone: "bad", strong: true, shield: true }, who: "MM v1.1 · dep_63 · PF-CRYPTO", whoLinks: [{ label: "dep_63", href: "/deployments/live/dep_63/canary" }, { label: "PF-CRYPTO", href: "/deployments/portfolios/PF-CRYPTO" }], equity: "7,719", alloc: "7,700", sync: "OK", syncTone: "good", health: "READY · d2/14", healthTone: "good" },
      ] },
    { id: "binance_testnet_main", venue: "BINANCE", href: null, sub: "sandbox certification only", env: { label: "TESTNET", tone: "warn" }, cred: { alias: "BIN-T1", state: "VALID", stateTone: "good" }, physical: "test funds", physTone: "mute", virt: "— · N/A", virtTone: "mute", accounts: 1, sync: "ws OK", syncTone: "good", health: "shared NET account", healthTone: "mute",
      note: "test-fund equity never enters portfolio NAV · certification evidence only → Sandbox Certification", noteLinks: [{ label: "Sandbox Certification", href: "/deployments/sandbox/dep_77" }], filters: ["testnet", "issues"] },
    { id: "okx_main_01", venue: "OKX", href: null, sub: "demo-trading flag", env: { label: "TESTNET", tone: "warn" }, cred: { alias: "OKX-01", state: "VALID", stateTone: "good" }, physical: "test funds", physTone: "mute", virt: "— · N/A", virtTone: "mute", accounts: 2, sync: "okx", syncTone: "good", health: "1 HALTED (dep_91)", healthTone: "warn",
      note: "acct-sbx-grid-okx (Grid, HALTED) · acct-sbx-carry-okx (Carry, cert 5/7 → target PF-MAIN via AP-352)", noteLinks: [{ label: "acct-sbx-grid-okx", href: "/deployments/accounts/acct-sbx-grid-okx" }, { label: "acct-sbx-carry-okx", href: "/deployments/accounts/acct-sbx-carry-okx" }, { label: "PF-MAIN", href: "/deployments/portfolios/PF-MAIN" }, { label: "AP-352", href: "/governance/approvals/AP-352/r2" }], filters: ["testnet", "issues"] },
    { id: "deribit_main_01", venue: "DERIBIT", href: null, sub: "market-data feed only — no live binding yet", env: { label: "PAPER FEED", tone: "paper" }, cred: { alias: "DRB-01", state: "EXPIRING 6d", stateTone: "warn", pulse: true, subLink: { label: "rotate credential ▸", href: "/administration/actions?action=rotate_credential&binding=deribit_main_01" } }, physical: "N/A — simulated", physTone: "mute", virt: "60,000", virtCcy: "USDC", accounts: 1, sync: "md feed OK", syncTone: "good", health: "paper — no recon", healthTone: "good",
      note: "acct-paper-grid-drb (Grid v2.1, 30/30 gate met → EX-771) · paper fills come from venue-sim on the real feed — no broker truth to reconcile", noteLinks: [{ label: "EX-771", href: "/governance/exit-reviews/EX-771" }], filters: ["paper"] },
    { id: "dnse_main_01", venue: "VN MARKET", href: null, sub: "DNSE · equities · VND", env: { label: "PAPER FEED", tone: "paper" }, cred: { alias: "DNSE-01", state: "OTP FLOW", stateTone: "warn", sub: "session token · manual re-auth" }, physical: "N/A — simulated", physTone: "mute", virt: "500M", virtCcy: "VND", accounts: 1, sync: "vnm", syncTone: "mute", health: "calendar 09:00–14:45 ICT", healthTone: "mute",
      note: "paper-dnse-vnmomo (VnMomo v0.9, 6/30 sessions, PF-MAIN) → VNM workbench · VND never FX-mixed", noteLinks: [{ label: "VNM workbench", href: "/deployments/paper/dep_101" }], filters: ["paper"] },
  ] as BindingRow[],
  binding: {
    id: "binance_main_01", title: "BINANCE · MAINNET · USDT", openFindings: 1,
    segments: [{ id: "acct-live-grid-v21", label: "grid-v21 · 18,400", value: 18400, tone: "bad", href: "/deployments/accounts/acct-live-grid-v21" }, { id: "acct-live-carry-v32", label: "carry-v32 · 14,900", value: 14900, tone: "accent", href: "/deployments/accounts/acct-live-carry-v32" }, { id: "acct-canary-mm-v11", label: "mm-v11 · 7,700", value: 7700, tone: "warn", href: "/deployments/accounts/acct-canary-mm-v11" }],
    credential: { alias: "BIN-01", state: "VALID", scopes: { a: "trade · read — ", b: "withdraw NOT granted", c: " (verified against venue 2m ago)" }, secret: "vaulted · never displayed · fingerprint 9c41…e2", ip: { a: "2 egress IPs pinned · last drift check 41s ago ", ok: "OK" }, rotation: { a: "created 2026-05-02 · rotated 2026-07-15 (", op: "op_1160", b: ") · next due 2026-10-15 · policy 90d" }, rateBase: 118, rateNote: " weight/min of 1,200 · order budget 8%", foot: "rotation = plan → apply → verify · zero-downtime dual-key window · step-up auth" },
    snaps: [
      { time: "10:44:31", state: "SNAPSHOT", tone: "mute", edge: false, digest: "9d1c…44", note: "fresh after halt — recon input" },
      { time: "10:41:52", state: "MISMATCH", tone: "bad", edge: true, digest: "4f2a…c1", note: "BTCUSDT Δ 0.0200 → rf_2101 · inc_44", noteLink: { label: "inc_44", href: "/execution/operations/incidents/inc_44" } },
      { time: "10:41:20", state: "OK", tone: "good", edge: false, digest: "2e9c…7b", note: "" },
      { time: "10:36:19", state: "OK", tone: "good", edge: false, digest: "b711…09", note: "5m snapshot" },
      { time: "10:31:18", state: "OK", tone: "good", edge: false, digest: "a04d…e8", note: "5m snapshot" },
    ],
    snapsFoot: "every snapshot is immutable evidence — recon diffs local ledgers against the latest digest · MISMATCH fails orders closed, protective stays open",
    virtuals: [
      { id: "acct-live-grid-v21", href: "/deployments/accounts/acct-live-grid-v21", chip: { label: "LIVE_FULL", tone: "bad", strong: true }, who: "Grid v2.1 · ", whoLinks: [{ label: "dep_live", href: "/deployments/live/dep_live" }, { label: "PF-CRYPTO", href: "/deployments/portfolios/PF-CRYPTO" }], alloc: "18,400", equity: "20,354", exposure: "12,220", recon: "MISMATCH Δ 0.0200 BTC", reconTone: "bad", reconPulse: true, reconLink: { label: "inc_44", href: "/execution/operations/incidents/inc_44" }, hot: true },
      { id: "acct-live-carry-v32", href: "/deployments/accounts/acct-live-carry-v32", chip: { label: "LIVE_FULL", tone: "bad", strong: true }, who: "Carry v3.2 · ", whoLinks: [{ label: "PF-CRYPTO", href: "/deployments/portfolios/PF-CRYPTO" }], alloc: "14,900", equity: "15,102", exposure: "8,940", recon: "clean · ", reconTone: "good", reconLink: { label: "rec_881", href: "/deployments/accounts/acct-canary-grid" } },
      { id: "acct-canary-mm-v11", href: "/deployments/accounts/acct-canary-mm-v11", chip: { label: "⛨ CANARY d2/14", tone: "bad", strong: true, shield: true }, who: "MM v1.1 · dep_63 · ", whoLinks: [{ label: "PF-CRYPTO", href: "/deployments/portfolios/PF-CRYPTO" }], alloc: "7,700", equity: "7,719", exposure: "4,940", recon: "clean · ", reconTone: "good", reconLink: { label: "rec_874", href: "/deployments/accounts/acct-canary-mm-v11" } },
    ],
    virtualsFoot: "an incident on one account never freezes its siblings — blast radius is the account, the binding only carries shared credential & sync risk",
    audit: [
      { t: "2026-08-13 09:12", text: "virtual account acct-canary-grid detached → promoted into dep_live scope · ", op: "op_1201", tail: " · AP-311" },
      { t: "2026-07-15 10:02", text: "credential rotated (dual-key window 18m, zero downtime) · ", op: "op_1160", tail: " · Stan (step-up)" },
      { t: "2026-06-08 14:40", text: "ip allowlist updated — egress IP added · ", op: "op_1093", tail: " · Stan (step-up)" },
      { t: "2026-05-02 08:15", text: "binding created · scopes trade+read · withdraw denied by policy · ", op: "op_0991", tail: " · Lan (dual)" },
    ],
  },
};

export function accountsSmoke() {
  return ACCOUNTS_SMOKE ? ACCOUNTS_SMOKE_DATA : null;
}

function noise(i: number, seed: number): number {
  const x = Math.sin(i * 12.9898 + seed) * 43758.5453;
  return (x - Math.floor(x)) - 0.5;
}

export interface Snap { time: string; state: string; tone: "good" | "bad" | "mute"; edge: boolean; digest: string; note: string; noteLink?: { label: string; href: string } }

/** Hi-fi scripts: clock 1s; j ∈ [−8, 8] every 1.4s; sync stream prepends every 5s (max 6). */
export function useAccountsTick(stream = false): { now: Date; j: number; snaps: Snap[] } {
  const [s, set] = useState<{ now: Date; j: number; n: number; snaps: Snap[] }>({ now: new Date(0), j: 0, n: 0, snaps: ACCOUNTS_SMOKE_DATA.binding.snaps as Snap[] });
  useEffect(() => {
    if (!ACCOUNTS_SMOKE || !ACCOUNTS_SMOKE_MOTION) return;
    if (!smokeMotionAllowed()) return;
    set((p) => ({ ...p, now: new Date() }));
    const a = window.setInterval(() => set((p) => ({ ...p, now: new Date() })), 1000);
    const b = window.setInterval(() => set((p) => ({ ...p, n: p.n + 1, j: Math.max(-8, Math.min(8, p.j + noise(p.n + 1, 5.5) * 2)) })), 1400);
    const c = stream ? window.setInterval(() => set((p) => {
      const d = new Date(), p2 = (n: number) => String(n).padStart(2, "0");
      const hex = (k: number) => Math.floor((noise(p.n * 7 + k, 9.1) + 0.5) * 65536).toString(16).padStart(4, "0");
      return { ...p, snaps: [{ time: `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`, state: "OK", tone: "good" as const, edge: false, digest: `${hex(1)}…${hex(2).slice(0, 2)}`, note: "ws delta applied" }, ...p.snaps].slice(0, 6) };
    }), 5000) : 0;
    return () => { window.clearInterval(a); window.clearInterval(b); if (c) window.clearInterval(c); };
  }, [stream]);
  return { now: s.now, j: s.j, snaps: s.snaps };
}

export const fmt0 = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
export const clockOf = (d: Date) => (d.getTime() === 0 ? "—" : `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}Z`);
export const inIctSession = (d: Date) => { const h = (d.getUTCHours() + 7) % 24; return h >= 9 && (h < 14 || (h === 14 && d.getUTCMinutes() <= 45)); };
