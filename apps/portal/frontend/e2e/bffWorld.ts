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
import { isPositiveMode } from "./bffPositiveMode";

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
  updatedAt: "2026-10-17T11:00:00Z", // WP-B2-O: never after the world clock (WORLD_NOW)
});
const alpha = (id: string, label: string, version: string, owner: string | null, health: AlphaSpec["health"], deployments: DeploymentSpec[]): AlphaSpec =>
  ({ id, label, version, owner, stages: [...new Set(deployments.map((entry) => entry.stage))], health, attention: [], deployments, updatedAt: "2026-10-17T11:00:00Z" }); // WP-B2-O: never after the world clock

/** The native alphas of the e2e suite (the ids the doubles and the audit open), booked into the TEST_ONLY portfolios. */
export const NATIVE_ALPHAS: AlphaSpec[] = [
  alpha("alpha_c", "Momentum C", "2.0", "Minh Pham", "ATTENTION", [deployment("dep_c1", "alpha_c", "CANARY", "live", SAT, "15000", "-125.4", "-18.2")]),
  alpha("alpha_d", "Grid D", "0.9", "Bobby Vu", "READY", [
    deployment("dep_d1", "alpha_d", "SANDBOX", "sandbox", CAN, "8000", "61.2", "3"),
    deployment("dep_d2", "alpha_d", "PAPER", "paper", SAT, "10000", "-30.75", "8.4"),
  ]),
  alpha("alpha_a", "Carry A", "1.0", "Bobby Vu", "READY", [
    deployment("dep_live_01", "alpha_a", "LIVE", "live", CORE, "40000.00", "980.40", "140.40"),
    deployment("dep_paper_01", "alpha_a", "PAPER", "paper", CORE, "20000.00", "-84.20", "6.40"),
    deployment("dep_sandbox_01", "alpha_a", "SANDBOX", "sandbox", CORE, "10000.00", "-41.6", "12.3"),
  ]),
  alpha("alpha_btc_trend", "BTC Trend", "3.0", "Lan Tran", "READY", [
    deployment("dep_btc_live", "alpha_btc_trend", "LIVE", "live", CORE, "80000", "1120.8", "55.4"),
    deployment("dep_btc_paper", "alpha_btc_trend", "PAPER", "paper", CORE, "50000.5", "-125.25", "40.1"),
    deployment("dep_btc_sandbox", "alpha_btc_trend", "SANDBOX", "sandbox", CAN, "12000", "61.2", "3"),
  ]),
  alpha("alpha_b", "Basis B", "1.4", "Lan Tran", "READY", [
    deployment("dep_b1", "alpha_b", "LIVE", "live", CORE, "120000", "2150.75", "310.2"),
    deployment("dep_b2", "alpha_b", "LIVE", "live", SAT, "60000", "-98.4", "21.05"),
    deployment("dep_canary_01", "alpha_b", "CANARY", "live", CORE, "30000", "410.1", "-5.5"),
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
  /** the furthest stage the alpha has reached (its spine's current stage) */
  reached: StageName;
}
/** The stage history of an alpha, anchored on WORLD_NOW: Live began `liveDays` ago, the Canary trial before it, and so on. Alpha 360's spine, Fleet's days in stage and the stage screens' start dates all read this. */
export function lifecycleOf(alphaId: string): Lifecycle {
  const seed = seedOf(alphaId, "wpc-life");
  const reached = furthestStage(alphaId);
  const rank = STAGE_RANK[reached];
  // The stage an alpha is IN has run for its current age (under its gate's minimum for Paper and Sandbox, so the gate is still open); every stage before it is a completed record of its own length; a stage after it has not begun.
  const completed = { paper: 25 + ((seed >>> 7) % 20), sandbox: 14 + ((seed >>> 5) % 11), canary: 3 + ((seed >>> 3) % 5), live: 4 + (seed % 17) };
  const current = { paper: 6 + ((seed >>> 11) % 7), sandbox: 5 + ((seed >>> 13) % 8), canary: 3 + ((seed >>> 3) % 5), live: 4 + (seed % 17) };
  const days = (stage: StageName): number => (STAGE_RANK[stage] > rank ? 0 : STAGE_RANK[stage] === rank ? current[stage] : completed[stage]);
  const [paperDays, sandboxDays, canaryDays, liveDays] = [days("paper"), days("sandbox"), days("canary"), days("live")];
  // chain back from the stage the alpha is in: it began `days` ago, each earlier stage ended where the next began
  const starts: Record<StageName, number> = { paper: WORLD_NOW_MS, sandbox: WORLD_NOW_MS, canary: WORLD_NOW_MS, live: WORLD_NOW_MS };
  starts[reached] = WORLD_NOW_MS - days(reached) * DAY_MS;
  for (let r = rank - 1; r >= 0; r -= 1) starts[STAGES_IN_ORDER[r]!] = starts[STAGES_IN_ORDER[r + 1]!] - days(STAGES_IN_ORDER[r]!) * DAY_MS;
  const paperFromMs = starts.paper;
  const r2Ms = paperFromMs - DAY_MS;
  const r1Ms = r2Ms - (8 + ((seed >>> 9) % 8)) * DAY_MS;
  return { paperDays, sandboxDays, canaryDays, liveDays, r1Ms, r2Ms, paperFromMs, sandboxFromMs: starts.sandbox, canaryFromMs: starts.canary, liveFromMs: starts.live, reached };
}
const STAGES_IN_ORDER: readonly StageName[] = ["paper", "sandbox", "canary", "live"];
const STAGE_RANK: Readonly<Record<StageName, number>> = { paper: 0, sandbox: 1, canary: 2, live: 3 };
/** The furthest stage any deployment of the alpha has reached (research and paper count as Paper). One answer for the spine, the Fleet days and every stage page. */
export function furthestStage(alphaId: string): StageName {
  const alpha = worldAlphas().find((a) => a.id === alphaId);
  let rank = 0;
  for (const d of alpha?.deployments ?? []) rank = Math.max(rank, d.stage === "LIVE" ? 3 : d.stage === "CANARY" ? 2 : d.stage === "SANDBOX" ? 1 : 0);
  return STAGES_IN_ORDER[rank]!;
}
/** The record of one stage of an alpha: `completed` (its gate passed, with dates and 7 of 7 criteria), `current` (in progress) or `none` (not begun). */
export function stageRecord(alphaId: string, stage: StageName): { status: "completed" | "current" | "none"; fromMs: number; toMs: number | null; days: number } {
  const life = lifecycleOf(alphaId);
  const rank = STAGE_RANK[life.reached];
  const mine = STAGE_RANK[stage];
  const fromMs = life[`${stage}FromMs` as "liveFromMs"];
  const days = life[`${stage}Days` as "liveDays"];
  if (mine > rank) return { status: "none", fromMs: WORLD_NOW_MS, toMs: null, days: 0 };
  if (mine === rank) return { status: "current", fromMs, toMs: null, days };
  return { status: "completed", fromMs, toMs: life[`${STAGES_IN_ORDER[mine + 1]!}FromMs` as "liveFromMs"], days };
}
export const stageDays = (alphaId: string, stage: StageName): number => lifecycleOf(alphaId)[`${stage}Days` as "liveDays"];
export const stageFromMs = (alphaId: string, stage: StageName): number => lifecycleOf(alphaId)[`${stage}FromMs` as "liveFromMs"];

/* ── a deployment: positions, orders, series ────────────────────────────── */

export interface WorldPosition { id: string; symbol: string; side: "long" | "short"; quantity: string; entry: string; mark: string; notional: string; unrealised: string }
export interface WorldOrder { id: string; symbol: string; side: "buy" | "sell"; type: string; quantity: string; price: string; status: string; sinceMs: number }
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
let openOrders: ((deploymentId: string) => WorldOrder[]) | null = null;
/** The blotter double registers its book of open orders here (a registry, not an import, so the two modules never form a cycle). */
export const setOpenOrderProvider = (provider: (deploymentId: string) => WorldOrder[]): void => { openOrders = provider; };
export function workingOrdersOf(deploymentId: string): WorldOrder[] {
  // ONE order book per deployment: in the positive world the open orders of a deployment are the open rows of the blotter's own book of it (same ids, quantities, prices, statuses)
  if (isPositiveMode() && openOrders !== null) return openOrders(deploymentId);
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
  const generated = scaled().bindings.find((b) => b.bindingId === bindingId);
  const ids = generated !== undefined ? [generated.accountId] : Object.entries(ACCOUNT_NAMES).filter(([, meta]) => meta.binding === bindingId).map(([id]) => id);
  const sleeves = ids.map((id) => accountFact(id)).filter((fact): fact is AccountFact => fact !== null);
  if (sleeves.length === 0) return null;
  const wallet = sleeves.reduce((n, f) => n + f.total, 0n);
  return { bindingId, sleeves, currency: sleeves[0]!.currency, wallet, equity: wallet + sleeves.reduce((n, f) => n + f.unrealized, 0n), used: sleeves.reduce((n, f) => n + f.allocation, 0n), locked: sleeves.reduce((n, f) => n + f.locked, 0n) };
}
export const bindingOfAccount = (accountId: string): BindingFact | null => {
  const meta = ACCOUNT_NAMES[accountId];
  return meta === undefined ? null : bindingFact(meta.binding);
};

// ===== WP-B begin: the operations world (one operation list, one record per incident). Accessors only; nothing above is touched.
/**
 * The named operations of the lane and the incidents they link to. ONE list: the Operations table's rows, the `incident_links` on each row,
 * the incident roots, the incident children (evidence, assignee, gate, timeline, child operations) and the open-exception count all read
 * these two tables, so an incident's own facts cannot disagree with each other or with the table.
 * Times are absolute instants against the operations read (OPS_READ_MS); a body that states that read time is shifted by the preview as a
 * whole, so every distance (acknowledged 20 minutes after it opened, linked 30 seconds after the operation) survives.
 */
export const OPS_READ_MS = Date.UTC(2026, 7, 22, 13, 0, 0);

export interface WorldOperation {
  id: string;
  at: string;
  command: string;
  target: [string, string];
  env: "PAPER" | "SANDBOX" | "LIVE";
  risk: string;
  severity: string;
  source: string;
  verify: string;
  triage: "UNACKNOWLEDGED" | "ACKNOWLEDGED" | "RESOLVED";
}

// Microsecond instants on purpose: the SQL keyset boundary is six digits wide.
export const WORLD_OPERATIONS: readonly WorldOperation[] = [
  { id: "op_TEST_ONLY_s01", at: "2026-08-22T11:58:00.123456Z", command: "portfolio/adjust-target-budget", target: ["PORTFOLIO", "pf_TEST_ONLY_canary"], env: "LIVE", risk: "R4_LIVE_RISK_INCREASING", severity: "CRITICAL", source: "UNCERTAIN", verify: "UNCERTAIN", triage: "UNACKNOWLEDGED" },
  { id: "op_TEST_ONLY_s02", at: "2026-08-22T11:40:00.500000Z", command: "portfolio/recall", target: ["PORTFOLIO", "pf_TEST_ONLY_satellite"], env: "LIVE", risk: "R3_LIVE_PROTECTIVE", severity: "WARNING", source: "SUCCEEDED", verify: "PARTIAL", triage: "UNACKNOWLEDGED" },
  { id: "op_TEST_ONLY_s03", at: "2026-08-22T11:20:00.000001Z", command: "account/sync", target: ["ACCOUNT", "acc_TEST_ONLY_binance02"], env: "PAPER", risk: "R1_PAPER_MUTATION", severity: "INFO", source: "SUCCEEDED", verify: "SUCCEEDED", triage: "RESOLVED" },
  { id: "op_TEST_ONLY_s04", at: "2026-08-22T10:55:00.250000Z", command: "deployment/archive", target: ["DEPLOYMENT", "dep_sandbox_01"], env: "SANDBOX", risk: "R2_SANDBOX", severity: "WARNING", source: "PENDING", verify: "PENDING", triage: "ACKNOWLEDGED" },
  { id: "op_TEST_ONLY_s05", at: "2026-08-22T10:30:00.000000Z", command: "portfolio/adjust-target-budget", target: ["PORTFOLIO", "pf_TEST_ONLY_core"], env: "LIVE", risk: "R4_LIVE_RISK_INCREASING", severity: "ERROR", source: "FAILED", verify: "FAILED", triage: "UNACKNOWLEDGED" },
  { id: "op_TEST_ONLY_s06", at: "2026-08-22T10:05:00.000000Z", command: "account/sync", target: ["ACCOUNT", "acc_TEST_ONLY_binance01"], env: "SANDBOX", risk: "R2_SANDBOX", severity: "INFO", source: "SUCCEEDED", verify: "NOT_STARTED", triage: "UNACKNOWLEDGED" },
  { id: "op_TEST_ONLY_s07", at: "2026-08-22T09:40:00.000000Z", command: "account/top-up", target: ["ACCOUNT", "acc_TEST_ONLY_binance02"], env: "PAPER", risk: "R1_PAPER_MUTATION", severity: "WARNING", source: "RUNNING", verify: "PENDING", triage: "UNACKNOWLEDGED" },
  { id: "op_TEST_ONLY_s08", at: "2026-08-22T09:10:00.000000Z", command: "portfolio/return-capital", target: ["PORTFOLIO", "pf_TEST_ONLY_core"], env: "LIVE", risk: "R3_LIVE_PROTECTIVE", severity: "ERROR", source: "EXPIRED", verify: "EXPIRED", triage: "ACKNOWLEDGED" },
  { id: "op_TEST_ONLY_s09", at: "2026-08-22T08:45:00.000000Z", command: "deployment/resume", target: ["DEPLOYMENT", "dep_btc_paper"], env: "PAPER", risk: "R1_PAPER_MUTATION", severity: "INFO", source: "BLOCKED", verify: "NOT_STARTED", triage: "UNACKNOWLEDGED" },
  { id: "op_TEST_ONLY_s10", at: "2026-08-22T08:15:00.000000Z", command: "account/sync", target: ["ACCOUNT", "acc_TEST_ONLY_binance01"], env: "PAPER", risk: "R1_PAPER_MUTATION", severity: "WARNING", source: "SUCCEEDED", verify: "DENIED", triage: "UNACKNOWLEDGED" },
  { id: "op_TEST_ONLY_s11", at: "2026-08-22T07:30:00.000000Z", command: "portfolio/recall", target: ["PORTFOLIO", "pf_TEST_ONLY_satellite"], env: "SANDBOX", risk: "R2_SANDBOX", severity: "INFO", source: "SUCCEEDED", verify: "SUCCEEDED", triage: "RESOLVED" },
];
const opById = (id: string): WorldOperation | undefined => WORLD_OPERATIONS.find((op) => op.id === id);

export type IncidentRelationship = "TRIGGERED_BY" | "MITIGATES" | "RELATED";
export type IncidentEvidenceSource = "FINDING" | "ALERT" | "DEAD_LETTER" | "ORDER_TRACE";
export interface WorldIncident {
  id: string;
  target: [string, string];
  env: "PAPER" | "SANDBOX" | "LIVE";
  severity: string;
  createdMs: number;
  /** Who did what, when: the single source of the root's timestamps, the gate and the timeline. */
  acknowledged: { actor: string; atMs: number } | null;
  assigned: { actor: string; atMs: number } | null;
  mitigated: { actor: string; atMs: number } | null;
  resolved: { actor: string; atMs: number } | null;
  openedBy: string;
  evidence: readonly { source: IncidentEvidenceSource; label: string; atMs: number }[];
  /** operation id, relationship, linked at (ms). The operation must be in WORLD_OPERATIONS. */
  links: readonly (readonly [string, IncidentRelationship, number])[];
}
const at = (h: number, m: number, s = 0): number => Date.UTC(2026, 7, 22, h, m, s);

export const WORLD_INCIDENTS: readonly WorldIncident[] = [
  { id: "inc_TEST_ONLY_fx_mismatch", target: ["PORTFOLIO", "pf_TEST_ONLY_canary"], env: "LIVE", severity: "CRITICAL", createdMs: at(11, 59), openedBy: "bobby",
    acknowledged: null, assigned: null, mitigated: null, resolved: null,
    evidence: [{ source: "FINDING", label: "Position mismatch finding", atMs: at(11, 59, 30) }, { source: "ORDER_TRACE", label: "Order trace for the budget change", atMs: at(11, 59, 40) }],
    links: [["op_TEST_ONLY_s01", "TRIGGERED_BY", at(11, 59, 5)], ["op_TEST_ONLY_s05", "RELATED", at(11, 59, 20)]] },
  { id: "inc_TEST_ONLY_fx_recall", target: ["PORTFOLIO", "pf_TEST_ONLY_satellite"], env: "LIVE", severity: "WARNING", createdMs: at(11, 42), openedBy: "lan",
    acknowledged: { actor: "lan", atMs: at(11, 50) }, assigned: { actor: "lan", atMs: at(11, 52) }, mitigated: null, resolved: null,
    evidence: [{ source: "ALERT", label: "Recall not confirmed alert", atMs: at(11, 43) }],
    links: [["op_TEST_ONLY_s02", "TRIGGERED_BY", at(11, 42, 30)]] },
  { id: "inc_TEST_ONLY_fx_sync", target: ["ACCOUNT", "acc_TEST_ONLY_binance02"], env: "PAPER", severity: "WARNING", createdMs: at(9, 45), openedBy: "bobby",
    acknowledged: { actor: "bobby", atMs: at(10, 0) }, assigned: { actor: "bobby", atMs: at(10, 5) }, mitigated: { actor: "bobby", atMs: at(11, 25) }, resolved: null,
    evidence: [],
    links: [["op_TEST_ONLY_s07", "TRIGGERED_BY", at(9, 41)], ["op_TEST_ONLY_s03", "MITIGATES", at(11, 21)]] },
  { id: "inc_TEST_ONLY_fx_budget", target: ["PORTFOLIO", "pf_TEST_ONLY_core"], env: "LIVE", severity: "ERROR", createdMs: at(10, 32), openedBy: "minh",
    acknowledged: { actor: "minh", atMs: at(10, 40) }, assigned: { actor: "minh", atMs: at(10, 41) }, mitigated: null, resolved: null,
    evidence: [{ source: "DEAD_LETTER", label: "Dead letter on the budget change", atMs: at(10, 34) }],
    links: [["op_TEST_ONLY_s05", "TRIGGERED_BY", at(10, 32, 30)], ["op_TEST_ONLY_s01", "RELATED", at(11, 58, 40)], ["op_TEST_ONLY_s08", "RELATED", at(10, 35)]] },
  { id: "inc_TEST_ONLY_fx_resume", target: ["DEPLOYMENT", "dep_btc_paper"], env: "PAPER", severity: "INFO", createdMs: at(8, 46), openedBy: "bobby",
    acknowledged: { actor: "bobby", atMs: at(8, 50) }, assigned: { actor: "bobby", atMs: at(8, 52) }, mitigated: { actor: "bobby", atMs: at(9, 0) }, resolved: { actor: "bobby", atMs: at(9, 20) },
    evidence: [],
    links: [["op_TEST_ONLY_s09", "TRIGGERED_BY", at(8, 46, 30)]] },
];
export const worldIncident = (id: string): WorldIncident | undefined => WORLD_INCIDENTS.find((incident) => incident.id === id);

export type IncidentState = "OPEN" | "MITIGATED" | "RESOLVED";
export interface IncidentEvent { id: string; action: string; actor: string; atMs: number }
/** The workflow events of one incident, in order; the root's version is how many there are, and every timestamp of the root is one of them. */
export function incidentEvents(incident: WorldIncident): IncidentEvent[] {
  const events: IncidentEvent[] = [{ id: "opened", action: "OPENED", actor: incident.openedBy, atMs: incident.createdMs }];
  if (incident.acknowledged) events.push({ id: "acknowledged", action: "ACKNOWLEDGED", ...incident.acknowledged });
  if (incident.assigned) events.push({ id: "assigned", action: "ASSIGNED", ...incident.assigned });
  if (incident.mitigated) events.push({ id: "mitigated", action: "MITIGATED", ...incident.mitigated });
  if (incident.resolved) events.push({ id: "resolved", action: "RESOLVED", ...incident.resolved });
  return events.sort((a, b) => a.atMs - b.atMs);
}
export const incidentState = (incident: WorldIncident): IncidentState => (incident.resolved ? "RESOLVED" : incident.mitigated ? "MITIGATED" : "OPEN");
export const incidentVersion = (incident: WorldIncident): number => incidentEvents(incident).length;
const iso = (ms: number): string => new Date(ms).toISOString().replace(/\.000Z$/, "Z");

/** The gate the server would state for this incident's own facts: every blocker is a fact this record holds. */
export function incidentGate(incident: WorldIncident): { eligible: boolean; blocker_codes: string[] } {
  const blockers = [
    ...(incident.acknowledged ? [] : ["INCIDENT_ACKNOWLEDGEMENT_REQUIRED"]),
    ...(incident.assigned ? [] : ["INCIDENT_ASSIGNEE_REQUIRED"]),
    ...(incident.mitigated ? [] : ["INCIDENT_NOT_MITIGATED"]),
    ...(incident.evidence.some((e) => e.source === "DEAD_LETTER") ? ["OPEN_DEAD_LETTER"] : []),
  ];
  return { eligible: blockers.length === 0, blocker_codes: blockers };
}

/** Root-body timestamps of the incident (ISO), the single place the double reads them from. */
export function incidentRootTimes(incident: WorldIncident): { created_at: string; updated_at: string; acknowledged_at: string | null; mitigated_at: string | null; resolved_at: string | null } {
  const events = incidentEvents(incident);
  return {
    created_at: iso(incident.createdMs), updated_at: iso(events[events.length - 1]!.atMs),
    acknowledged_at: incident.acknowledged ? iso(incident.acknowledged.atMs) : null,
    mitigated_at: incident.mitigated ? iso(incident.mitigated.atMs) : null,
    resolved_at: incident.resolved ? iso(incident.resolved.atMs) : null,
  };
}

/** Operations that name an incident: the same rows the Operations table holds. */
export const operationsOfIncident = (incident: WorldIncident): WorldOperation[] => incident.links.flatMap(([opId]) => { const op = opById(opId); return op ? [op] : []; });

const digestOf = (value: unknown): string => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;

/** `GET /operations/incidents/{id}/children` body (`portal.execution.incident-children.v1`) for a world incident; null for an id the world does not hold. */
export function incidentChildrenBody(incidentId: string, workspaceId: string): Record<string, unknown> | null {
  const incident = worldIncident(incidentId);
  if (incident === undefined) return null;
  const events = incidentEvents(incident);
  return {
    schema_version: "portal.execution.incident-children.v1", workspace_id: workspaceId, incident_id: incident.id, record_authority: "PORTAL_PROJECTION", read_at_ms: OPS_READ_MS,
    evidence: incident.evidence.map((e, n) => ({ source: e.source, digest: digestOf([incident.id, e.source, n]), label: e.label, added_at_ms: e.atMs })),
    assigned_to: incident.assigned ? { actor: incident.assigned.actor, assigned_at_ms: incident.assigned.atMs } : null,
    resolution_gate: incidentGate(incident),
    timeline: events.map((e, n) => ({ event_id: `FIXTURE_LAB:${incident.id}:${e.id}`, action: e.action, actor: e.actor, version_before: n === 0 ? null : n, version_after: n + 1, at_ms: e.atMs })),
    // The original target of a child is the operation's own target when it was linked; one child per incident the record cannot attest (null).
    linked_operations: operationsOfIncident(incident).map((op, n) => ({ operation_id: op.id, original_target: n === 2 ? null : { type: op.target[0], id: op.target[1] } })),
  };
}
// ===== WP-B end

/** WORLD: a native deployment's exposure IS the gross notional of its own positions (QA3 R2-01: a running 40,000 deployment with two positions never states exposure 0). */
for (const alphaSpec of NATIVE_ALPHAS) for (const spec of alphaSpec.deployments) spec.exposure = grossNotional(spec.id);
