/**
 * THE CANONICAL FIXTURE WORLD (WP-P, FIXTURE_LAB). The only source of the facts the positive review lane states about a deployment, an account, a
 * price, a start date and a stage history. Every double reads from here in the positive-like scenarios; none keeps its own copy of these facts.
 *
 *   alpha -> deployment (stage, environment, portfolio, ONE account, allocation, realized, unrealized, start, positions, orders)
 *   account -> exactly the deployments booked on it; ledger = allocation + realized; locked = a tenth of the allocation; free + locked = total
 *   price -> ONE mark per symbol (MARKS); every position, order and notional on every screen uses it
 *   clock -> WORLD_NOW (an anchor, never the wall clock); stage dates are WORLD_NOW minus whole days of the alpha's stage history
 *
 * Money is exact decimal text; every sum is BigInt cents. Nothing here is a source fact or a permission; nothing reaches the product bundle
 * (src/execution/productBoundary.test.ts keeps e2e/ out of it).
 */
import { createHash } from "node:crypto";

import { scaled, type AlphaSpec, type DeploymentSpec } from "./bffScale";

/* ── clock ──────────────────────────────────────────────────────────────── */

/** The instant every positive body states as "now" before the preview shifts the WHOLE world by whole days. */
export const WORLD_NOW_MS = Date.UTC(2026, 9, 17, 12, 4, 0);
export const WORLD_NOW_ISO = new Date(WORLD_NOW_MS).toISOString();
export const DAY_MS = 86_400_000;

/* ── people: ONE roster ─────────────────────────────────────────────────── */

export interface WorldPerson { id: string; username: string; name: string; role: "ADMIN" | "USER" }
/** The people of the world. The Users roster, the Access grants, approval requesters and deciders, audit actors, incident assignees and the owners of alphas and portfolios are these people. */
export const PEOPLE: readonly WorldPerson[] = Object.freeze([
  { id: "usr_0001", username: "bobby", name: "Bobby Vu", role: "ADMIN" },
  { id: "usr_0002", username: "lan", name: "Lan Tran", role: "ADMIN" },
  { id: "usr_0003", username: "minh", name: "Minh Pham", role: "ADMIN" },
  { id: "usr_0004", username: "stan", name: "Stan Le", role: "USER" },
  { id: "usr_0005", username: "hoa", name: "Hoa Nguyen", role: "USER" },
  { id: "usr_0006", username: "tuan", name: "Tuan Do", role: "USER" },
]);
/** The three people who act in the audit feed, the lifecycle events and the incident timelines. */
export const WORLD_ACTORS: readonly string[] = ["bobby", "lan", "minh"];
export const personByUsername = (username: string): WorldPerson | undefined => PEOPLE.find((p) => p.username === username);

/* ── prices: one mark per symbol ────────────────────────────────────────── */

export const MARKS: Readonly<Record<string, string>> = Object.freeze({
  BTCUSDT: "66470.50", ETHUSDT: "3514.80", SOLUSDT: "170.54", BNBUSDT: "591.70",
});
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"] as const;

/* ── exact cents ────────────────────────────────────────────────────────── */

export const toCents = (value: string): bigint => {
  const negative = value.startsWith("-");
  const [whole = "0", fraction = ""] = value.replace("-", "").split(".");
  const n = BigInt(whole + `${fraction}00`.slice(0, 2));
  return negative ? -n : n;
};
export const fromCents = (value: bigint): string => {
  const abs = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
};
const seedOf = (...parts: unknown[]): number => parseInt(createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 8), 16);

/* ── the native books ───────────────────────────────────────────────────── */

const CORE: [string, string] = ["pf_TEST_ONLY_core", "Core"];
const SAT: [string, string] = ["pf_TEST_ONLY_satellite", "Satellite"];
const CAN: [string, string] = ["pf_TEST_ONLY_canary", "Canary"];
type Env = DeploymentSpec["environment"];
/** Live deployments sit on the sleeve of their portfolio (the shared binding bnc_main@BINANCE); Paper on the paper simulator; Sandbox on the testnet account. */
const SLEEVE_OF_PORTFOLIO: Readonly<Record<string, string>> = { pf_TEST_ONLY_core: "acc_bnc_core", pf_TEST_ONLY_satellite: "acc_bnc_sat", pf_TEST_ONLY_canary: "acc_bnc_can" };
const deployment = (id: string, alphaId: string, stage: DeploymentSpec["stage"], environment: Env, portfolio: [string, string], allocation: string, realized: string, unrealized: string, state: "ACTIVE" | "HALTED" = "ACTIVE"): DeploymentSpec => ({
  id, alphaId, stage, environment, venue: "BINANCE",
  accountId: environment === "paper" ? "acc_pap_sim" : environment === "sandbox" ? "acc_tn_bnc" : SLEEVE_OF_PORTFOLIO[portfolio[0]] ?? `acct_${id}`,
  portfolioId: portfolio[0], portfolioName: portfolio[1], currency: "USDT", allocation, exposure: "0", realized, unrealized, health: "READY", state, active: state === "ACTIVE",
  updatedAt: "2026-10-22T11:00:00Z",
});
const alpha = (id: string, label: string, version: string, owner: string | null, health: AlphaSpec["health"], deployments: DeploymentSpec[]): AlphaSpec =>
  ({ id, label, version, owner, stages: [...new Set(deployments.map((entry) => entry.stage))], health, attention: [], deployments, updatedAt: "2026-10-22T11:00:00Z" });

/** The native alphas of the e2e suite (the ids the doubles and the audit open), booked into the TEST_ONLY portfolios. */
export const NATIVE_ALPHAS: AlphaSpec[] = [
  alpha("alpha_c", "Momentum C", "2.0", "Minh Pham", "ATTENTION", [deployment("dep_c1", "alpha_c", "CANARY", "live", SAT, "15000", "-125.4", "-18.2", "HALTED")]),
  alpha("alpha_d", "Grid D", "0.9", "Bobby Vu", "READY", [
    deployment("dep_d1", "alpha_d", "SANDBOX", "sandbox", CAN, "8000", "61.2", "3"),
    deployment("dep_d2", "alpha_d", "PAPER", "paper", SAT, "10000", "-30.75", "8.4"),
  ]),
  alpha("alpha_a", "Carry A", "1.0", "Bobby Vu", "READY", [
    deployment("dep_live_01", "alpha_a", "LIVE", "live", CORE, "40000.00", "980.40", "140.40"),
    deployment("dep_paper_01", "alpha_a", "PAPER", "paper", CORE, "20000.00", "-84.20", "6.40"),
    deployment("dep_sandbox_01", "alpha_a", "SANDBOX", "sandbox", CORE, "10000.00", "-41.6", "12.3", "HALTED"),
  ]),
  alpha("alpha_btc_trend", "BTC Trend", "3.0", "Lan Tran", "READY", [
    deployment("dep_btc_live", "alpha_btc_trend", "LIVE", "live", CORE, "80000", "1120.8", "55.4"),
    deployment("dep_btc_paper", "alpha_btc_trend", "PAPER", "paper", CORE, "50000.5", "-125.25", "40.1"),
    deployment("dep_btc_sandbox", "alpha_btc_trend", "SANDBOX", "sandbox", CAN, "12000", "61.2", "3"),
  ]),
  alpha("alpha_b", "Basis B", "1.4", "Lan Tran", "READY", [
    deployment("dep_b1", "alpha_b", "LIVE", "live", CORE, "120000", "2150.75", "310.2"),
    deployment("dep_b2", "alpha_b", "LIVE", "live", SAT, "60000", "-98.4", "21.05"),
    deployment("dep_b3", "alpha_b", "CANARY", "live", CORE, "30000", "410.1", "-5.5"),
  ]),
];

/** Every alpha of the world: the native books and the generated universe (empty at small scale, where the suite's own alphas stay). */
export const worldAlphas = (): AlphaSpec[] => [...NATIVE_ALPHAS, ...scaled().alphas];
const ownerOf = new Map<string, { alpha: AlphaSpec; deployment: DeploymentSpec }>();
export function deploymentOf(deploymentId: string): { alpha: AlphaSpec; deployment: DeploymentSpec } | null {
  const native = NATIVE_ALPHAS.flatMap((a) => a.deployments.map((d) => ({ alpha: a, deployment: d }))).find((entry) => entry.deployment.id === deploymentId);
  if (native !== undefined) return native;
  if (ownerOf.size === 0) for (const a of scaled().alphas) for (const d of a.deployments) ownerOf.set(d.id, { alpha: a, deployment: d });
  return ownerOf.get(deploymentId) ?? null;
}

/* ── stage history: one set of dates per alpha ──────────────────────────── */

export type StageName = "paper" | "sandbox" | "canary" | "live";
export interface Lifecycle {
  paperDays: number; sandboxDays: number; canaryDays: number; liveDays: number;
  r1Ms: number; r2Ms: number; paperFromMs: number; sandboxFromMs: number; canaryFromMs: number; liveFromMs: number;
}
/** The stage history of an alpha, anchored on WORLD_NOW: Live began `liveDays` ago, the Canary trial before it, and so on. Alpha 360's spine, Fleet's days in stage and the stage screens' start dates all read this. */
export function lifecycleOf(alphaId: string): Lifecycle {
  const seed = seedOf(alphaId, "wpc-life");
  const liveDays = 4 + (seed % 17);
  const canaryDays = 3 + ((seed >>> 3) % 5);
  const sandboxDays = 14 + ((seed >>> 5) % 11);
  const paperDays = 25 + ((seed >>> 7) % 20);
  const liveFromMs = WORLD_NOW_MS - liveDays * DAY_MS;
  const canaryFromMs = liveFromMs - canaryDays * DAY_MS;
  const sandboxFromMs = canaryFromMs - sandboxDays * DAY_MS;
  const paperFromMs = sandboxFromMs - paperDays * DAY_MS;
  const r2Ms = paperFromMs - DAY_MS;
  const r1Ms = r2Ms - (8 + ((seed >>> 9) % 8)) * DAY_MS;
  return { paperDays, sandboxDays, canaryDays, liveDays, r1Ms, r2Ms, paperFromMs, sandboxFromMs, canaryFromMs, liveFromMs };
}
export const stageDays = (alphaId: string, stage: StageName): number => lifecycleOf(alphaId)[`${stage}Days` as "liveDays"];
export const stageFromMs = (alphaId: string, stage: StageName): number => lifecycleOf(alphaId)[`${stage}FromMs` as "liveFromMs"];

/* ── a deployment: positions, orders, series ────────────────────────────── */

export interface WorldPosition { id: string; symbol: string; side: "long" | "short"; quantity: string; entry: string; mark: string; notional: string; unrealised: string }
export interface WorldOrder { id: string; symbol: string; side: "buy" | "sell"; type: "LIMIT"; quantity: string; price: string; status: "ACCEPTED"; sinceMs: number }
const QTYS = [8n, 4n, 2n, 1n]; // in units of 0.25 (so entry prices keep four places)
const units4 = (value: string): bigint => { const [w = "0", f = ""] = value.split("."); return BigInt(w + `${f}0000`.slice(0, 4)); };
const text4 = (v: bigint): string => { const abs = v < 0n ? -v : v; return `${v < 0n ? "-" : ""}${abs / 10_000n}.${String(abs % 10_000n).padStart(4, "0")}`.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); };

/** The deployment's open positions: the unrealized PnL splits 70/30 over a long and a short in two symbols at the ONE mark of each; entry = mark -/+ pnl / quantity. */
export function positionsOf(deploymentId: string): WorldPosition[] {
  const found = deploymentOf(deploymentId);
  if (found === null) return [];
  const d = found.deployment;
  const first = SYMBOLS[seedOf(deploymentId, "sym") % SYMBOLS.length]!;
  const second = SYMBOLS[(SYMBOLS.indexOf(first) + 1) % SYMBOLS.length]!;
  const allocation = toCents(d.allocation);
  const unrealized = toCents(d.unrealized);
  const long = unrealized * 7n / 10n;
  const make = (symbol: string, side: "long" | "short", share: bigint, pnl: bigint, index: number): WorldPosition => {
    const mark = units4(MARKS[symbol]!);
    // quantity in quarter units: the largest of 2, 1, 0.5, 0.25 whose notional stays within the share of the allocation
    const budget = allocation * share / 100n * 100n; // cents -> 1e-4 units
    const qUnits = QTYS.find((q) => (q * 2_500n) * mark / 10_000n <= budget) ?? 1n;
    const quantity = qUnits * 2_500n; // 1e-4 units
    const shift = (pnl * 100n * 10_000n) / quantity; // pnl (1e-4 units) per unit of quantity
    const entry = side === "long" ? mark - shift : mark + shift;
    return { id: `pos_${deploymentId}_${index}`, symbol, side, quantity: text4(quantity), entry: text4(entry), mark: MARKS[symbol]!, notional: fromCents(quantity * mark / 10_000n / 100n), unrealised: fromCents(pnl) };
  };
  return [make(first, "long", 55n, long, 1), make(second, "short", 30n, unrealized - long, 2)];
}
export const grossNotional = (deploymentId: string): string => fromCents(positionsOf(deploymentId).reduce((sum, p) => sum + toCents(p.notional), 0n));

/** Two working limit orders around the mark of the first position's symbol. */
export function workingOrdersOf(deploymentId: string): WorldOrder[] {
  const pos = positionsOf(deploymentId);
  if (pos.length === 0) return [];
  const symbol = pos[0]!.symbol;
  const mark = toCents(MARKS[symbol]!);
  return [
    { id: `ord_${deploymentId}_1`, symbol, side: "sell", type: "LIMIT", quantity: "0.25", price: fromCents(mark * 1011n / 1000n), status: "ACCEPTED", sinceMs: WORLD_NOW_MS - 52 * 60_000 },
    { id: `ord_${deploymentId}_2`, symbol, side: "buy", type: "LIMIT", quantity: "0.25", price: fromCents(mark * 989n / 1000n), status: "ACCEPTED", sinceMs: WORLD_NOW_MS - 18 * 60_000 },
  ];
}

export const netPnlOf = (d: DeploymentSpec): bigint => toCents(d.realized) + toCents(d.unrealized);

/** Cumulative net PnL of a deployment from `fromMs` to `toMs`, `points` samples, ending exactly on its realized + unrealized. A bounded deterministic walk (zero at both ends of the noise). */
export function netPnlSeries(deploymentId: string, fromMs: number, toMs: number, points: number, target?: bigint): { t: number; value: string }[] {
  const found = deploymentOf(deploymentId);
  if (found === null || points < 2) return [];
  const net = target ?? netPnlOf(found.deployment);
  const amp = (net < 0n ? -net : net) / 6n + toCents(found.deployment.allocation) / 400n + 100n;
  let state = BigInt((seedOf(deploymentId, "series") % 2_147_483_646) + 1);
  const walk: bigint[] = [0n];
  for (let i = 1; i < points; i += 1) { state = (state * 48_271n) % 2_147_483_647n; walk.push(walk[i - 1]! + ((state % 2001n) - 1000n) * amp / 4000n); }
  const n = BigInt(points - 1);
  return walk.map((w, i) => ({ t: Math.round(fromMs + ((toMs - fromMs) * i) / (points - 1)), value: fromCents(net * BigInt(i) / n + (w - (walk[points - 1]! * BigInt(i)) / n)) }));
}

/* ── an account: exactly the deployments booked on it ───────────────────── */

export interface AccountFact {
  id: string;
  name: string;
  venue: string;
  environment: Env;
  bindingId: string;
  currency: string;
  deployments: DeploymentSpec[];
  allocation: bigint; realized: bigint; unrealized: bigint;
  /** ledger = allocation + realized */
  total: bigint; locked: bigint; free: bigint;
}
const ACCOUNT_NAMES: Readonly<Record<string, { name: string; binding: string }>> = {
  acc_bnc_core: { name: "Core sleeve · Binance main", binding: "bnc_main@BINANCE" },
  acc_bnc_sat: { name: "Satellite sleeve · Binance main", binding: "bnc_main@BINANCE" },
  acc_bnc_can: { name: "Canary sleeve · Binance main", binding: "bnc_main@BINANCE" },
  acc_pap_sim: { name: "Paper simulator", binding: "pap_sim@BINANCE" },
  acc_tn_bnc: { name: "Binance testnet", binding: "tn_bnc@BINANCE" },
};
export const SLEEVES: readonly string[] = ["acc_bnc_core", "acc_bnc_sat", "acc_bnc_can"];
export const nativeAccountIds = (): string[] => Object.keys(ACCOUNT_NAMES);
export function accountFact(accountId: string): AccountFact | null {
  const native = ACCOUNT_NAMES[accountId];
  const binding = native === undefined ? scaled().bindings.find((b) => b.accountId === accountId) : undefined;
  const meta = native ?? (binding === undefined ? undefined : { name: `${binding.venue} ${accountId.slice(-3)}`, binding: binding.bindingId });
  const booked = worldAlphas().flatMap((a) => a.deployments).filter((d) => d.accountId === accountId);
  if (meta === undefined || booked.length === 0) return null;
  const allocation = booked.reduce((n, d) => n + toCents(d.allocation), 0n);
  const realized = booked.reduce((n, d) => n + toCents(d.realized), 0n);
  const unrealized = booked.reduce((n, d) => n + toCents(d.unrealized), 0n);
  const total = allocation + realized;
  const locked = allocation / 10n;
  return { id: accountId, name: meta.name, venue: binding?.venue ?? "BINANCE", environment: booked[0]!.environment, bindingId: meta.binding, currency: booked[0]!.currency, deployments: booked, allocation, realized, unrealized, total, locked, free: total - locked };
}

/** The ledger of an account over time: for each booked deployment its allocation plus a cumulative realized PnL that ends on its realized, summed. The last point IS `AccountFact.total`. */
export function ledgerSeries(accountId: string, fromMs: number, toMs: number, points: number): { t: number; value: string }[] {
  const fact = accountFact(accountId);
  if (fact === null || points < 2) return [];
  const parts = fact.deployments.map((d) => ({ alloc: toCents(d.allocation), walk: netPnlSeries(d.id, fromMs, toMs, points, toCents(d.realized)) }));
  return Array.from({ length: points }, (_, i) => ({ t: parts[0]!.walk[i]!.t, value: fromCents(parts.reduce((n, p) => n + p.alloc + toCents(p.walk[i]!.value), 0n)) }));
}

/** A physical binding: the sleeves booked on it (each a logical account of the world) and what the venue holds for all of them. */
export interface BindingFact {
  bindingId: string;
  sleeves: AccountFact[];
  currency: string;
  /** wallet = the sum of the sleeve ledgers; native equity = wallet + unrealized; used = the sum of the allocations (the virtual sum) */
  wallet: bigint; equity: bigint; used: bigint; locked: bigint;
}
export function bindingFact(bindingId: string): BindingFact | null {
  const ids = Object.entries(ACCOUNT_NAMES).filter(([, meta]) => meta.binding === bindingId).map(([id]) => id);
  const sleeves = ids.map((id) => accountFact(id)).filter((fact): fact is AccountFact => fact !== null);
  if (sleeves.length === 0) return null;
  const wallet = sleeves.reduce((n, f) => n + f.total, 0n);
  return { bindingId, sleeves, currency: sleeves[0]!.currency, wallet, equity: wallet + sleeves.reduce((n, f) => n + f.unrealized, 0n), used: sleeves.reduce((n, f) => n + f.allocation, 0n), locked: sleeves.reduce((n, f) => n + f.locked, 0n) };
}
export const bindingOfAccount = (accountId: string): BindingFact | null => {
  const meta = ACCOUNT_NAMES[accountId];
  return meta === undefined ? null : bindingFact(meta.binding);
};
