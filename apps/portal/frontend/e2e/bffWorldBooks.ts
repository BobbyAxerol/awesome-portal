/**
 * THE WORLD'S BOOKS (WP-B2-C). Facts about accounts, positions, marks, per-alpha returns, drawdowns, environment labels and attention that
 * used to be restated as constants inside the doubles. Every export here is a QUERY over `bffWorld.ts` (deployments, MARKS, incidents,
 * stage history): nothing is stored, so a screen that reads it cannot disagree with another screen that reads it.
 *
 *   position  = quantity x the ONE mark of its symbol (MARKS); an account's position is the sum of its deployments' positions
 *   whole     = the sum of the sleeves booked on the binding (arithmetic over `bindingFact`), never a copy of one sleeve
 *   return    = net PnL / allocation of the alpha-window (the window's deployments), PnL = realized + unrealized
 *   drawdown  = value / running max - 1 of a cumulative series, <= 0 by construction
 *   label     = the environment of the entity's own economic partition (its deployments), not of the incident that mentions it
 *   attention = the open world incidents that target the entity (or one of its accounts / deployments)
 */
import {
  MARKS, WORLD_INCIDENTS, WORLD_NOW_MS, DAY_MS, LEVEL_NODES, accountFact, bindingFact, bookLevels, deploymentOf, fromCents, incidentState, netPnlOf, netPnlSeries, openUnrealizedOf, positionsOf, toCents,
  worldAlphas, type WorldIncident, type WorldPosition,
} from "./bffWorld";
import { scaled } from "./bffScale";
import { isRetired, standingOf } from "./bffWorldStage"; // B-S: a deployment whose stage its alpha has left holds nothing open

/* ── positions: quantity x the one mark ─────────────────────────────────── */

/** 1e-4 units from text ("12.5" -> 125000n). */
export const units4 = (value: string): bigint => {
  const negative = value.startsWith("-");
  const [w = "0", f = ""] = value.replace("-", "").split(".");
  const n = BigInt(w + `${f}0000`.slice(0, 4));
  return negative ? -n : n;
};
export const text4 = (v: bigint): string => {
  const abs = v < 0n ? -v : v;
  return `${v < 0n ? "-" : ""}${abs / 10_000n}.${String(abs % 10_000n).padStart(4, "0")}`.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
};
/** notional (cents) of a quantity at the world mark of the symbol. */
export const notionalCents = (symbol: string, quantityText: string): bigint => units4(quantityText) * units4(MARKS[symbol]!) / 10_000n / 100n;

export interface BookPosition { symbol: string; side: "long" | "short"; quantity: string; mark: string; notional: string; unrealised: string }

/** The positions of an account: its booked deployments' world positions, merged per symbol and side. Notional = merged quantity x the world mark. */
export function accountPositions(accountId: string, deploymentIds?: readonly string[]): BookPosition[] {
  const ids = deploymentIds ?? accountFact(accountId)?.deployments.map((d) => d.id) ?? [];
  const merged = new Map<string, { symbol: string; side: "long" | "short"; qty: bigint; pnl: bigint }>();
  for (const id of ids) {
    if (isRetired(id)) continue;
    for (const p of positionsOf(id) as WorldPosition[]) {
      const key = `${p.symbol}:${p.side}`;
      const have = merged.get(key) ?? { symbol: p.symbol, side: p.side, qty: 0n, pnl: 0n };
      have.qty += units4(p.quantity);
      have.pnl += toCents(p.unrealised);
      merged.set(key, have);
    }
  }
  return [...merged.values()].sort((a, b) => (a.symbol === b.symbol ? (a.side < b.side ? -1 : 1) : a.symbol < b.symbol ? -1 : 1)).map((m) => ({
    symbol: m.symbol, side: m.side, quantity: text4(m.qty), mark: MARKS[m.symbol]!, notional: fromCents(notionalCents(m.symbol, text4(m.qty))), unrealised: fromCents(m.pnl),
  }));
}

/* ── whole account = the sum of the sleeves ─────────────────────────────── */

export interface WholeAccount { sleeves: string[]; free: bigint; initialMargin: bigint; maintenanceMargin: bigint; headroom: bigint; wallet: bigint }
/** What the venue reports for the WHOLE binding of an account: one set per binding, the arithmetic sum of its sleeves (free = ledger - locked, margin = locked, maintenance = half). */
export function wholeAccountOf(accountId: string, only?: readonly string[]): WholeAccount | null {
  const meta = accountFact(accountId);
  if (meta === null) return null;
  const binding = bindingFact(meta.bindingId);
  if (binding === null) return null;
  const sleeves = binding.sleeves.filter((s) => only === undefined || only.includes(s.id));
  const free = sleeves.reduce((n, s) => n + s.free, 0n);
  const initialMargin = sleeves.reduce((n, s) => n + s.locked, 0n);
  const maintenanceMargin = sleeves.reduce((n, s) => n + s.locked / 2n, 0n);
  return { sleeves: sleeves.map((s) => s.id), free, initialMargin, maintenanceMargin, headroom: free - maintenanceMargin, wallet: sleeves.reduce((n, s) => n + s.total, 0n) };
}

/* ── one return / PnL per alpha-window ──────────────────────────────────── */

/** The deployments of an alpha that count in a window: `live` = its live and canary deployments (real-funded), else the deployments of that environment. */
export function alphaWindowDeployments(alphaId: string, environment: "live" | "paper" | "sandbox"): { id: string; allocation: bigint; net: bigint }[] {
  const a = worldAlphas().find((x) => x.id === alphaId);
  return (a?.deployments ?? []).filter((d) => d.environment === environment).map((d) => ({ id: d.id, allocation: toCents(d.allocation), net: netPnlOf(d) }));
}
/** PnL (cents) and return (6-place percent text) of the alpha in that environment: computed from allocation x return, the same on the alpha page and the portfolio contributors. */
export function alphaWindow(alphaId: string, environment: "live" | "paper" | "sandbox"): { allocation: bigint; net: bigint; returnPct: string | null } {
  const parts = alphaWindowDeployments(alphaId, environment);
  const allocation = parts.reduce((n, p) => n + p.allocation, 0n);
  const net = parts.reduce((n, p) => n + p.net, 0n);
  return { allocation, net, returnPct: allocation <= 0n ? null : pct6(net, allocation) };
}
export const pct6 = (numerator: bigint, denominator: bigint): string => {
  const scaled = numerator * 100n * 1_000_000n / denominator;
  const abs = scaled < 0n ? -scaled : scaled;
  return `${scaled < 0n ? "-" : ""}${abs / 1_000_000n}.${String(abs % 1_000_000n).padStart(6, "0")}`.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
};

/* ── drawdown = value / running max - 1 ─────────────────────────────────── */

/** Drawdown (percent text, <= 0) of a NAV-like level series: level / running max - 1, never negative-then-jump because the running max only rises. */
export function drawdownOfLevels(levels: readonly bigint[]): bigint[] {
  let peak = levels[0] ?? 0n;
  return levels.map((v) => {
    if (v > peak) peak = v;
    return peak <= 0n ? 0n : (v - peak) * 100n * 1_000_000n / peak; // percent x 1e6
  });
}
/** The drawdown series of an alpha window: NAV = allocation + cumulative net PnL (the deployments' own world series), drawdown of that NAV. */
export function alphaDrawdownSeries(alphaId: string, environment: "live" | "paper" | "sandbox", fromMs: number, toMs: number, points: number): { t: number; value: string; nav: string }[] {
  const parts = alphaWindowDeployments(alphaId, environment);
  if (parts.length === 0 || points < 2) return [];
  const walks = parts.map((p) => netPnlSeries(p.id, fromMs, toMs, points));
  const nav = Array.from({ length: points }, (_, i) => parts.reduce((n, p, k) => n + p.allocation + toCents(walks[k]![i]!.value), 0n));
  const dd = drawdownOfLevels(nav);
  return nav.map((v, i) => ({ t: walks[0]![i]!.t, nav: fromCents(v), value: `${dd[i]! < 0n ? "-" : ""}${(dd[i]! < 0n ? -dd[i]! : dd[i]!) / 1_000_000n}.${String((dd[i]! < 0n ? -dd[i]! : dd[i]!) % 1_000_000n).padStart(6, "0")}` }));
}

/* ── environment label and attention of an entity ───────────────────────── */

export type Partition = "Real-funded" | "Sandbox" | "Paper";
const partitionOfEnv = (e: string): Partition => (e === "live" ? "Real-funded" : e === "sandbox" ? "Sandbox" : "Paper");
const RANK: Record<Partition, number> = { "Real-funded": 3, Sandbox: 2, Paper: 1 };

/** The economic partition a portfolio / account / deployment belongs to: the highest-funded environment among its deployments. A portfolio with only sandbox deployments is Sandbox, whatever an incident says. */
export function partitionOfEntity(kind: string, id: string): Partition | null {
  const all = worldAlphas().flatMap((a) => a.deployments);
  let envs: string[];
  if (kind === "PORTFOLIO") envs = all.filter((d) => d.portfolioId === id).map((d) => d.environment);
  else if (kind === "ACCOUNT") envs = all.filter((d) => d.accountId === id).map((d) => d.environment);
  else if (kind === "DEPLOYMENT") { const d = deploymentOf(id); envs = d === null ? [] : [d.deployment.environment]; }
  else return null;
  if (envs.length === 0) return null;
  return envs.map(partitionOfEnv).sort((x, y) => RANK[y] - RANK[x])[0]!;
}
/** The label of an incident's environment: that of its target's own partition when the world knows the target, else the incident's declared environment. */
export function incidentEnvironmentLabel(incident: WorldIncident): Partition {
  return partitionOfEntity(incident.target[0], incident.target[1]) ?? partitionOfEnv(incident.env === "LIVE" ? "live" : incident.env.toLowerCase());
}

/** The OPEN incidents that concern a portfolio: those that target it, its accounts or its deployments. The "needs attention" sentence of a portfolio is a query over this. */
export function openIncidentsOfPortfolio(portfolioId: string): WorldIncident[] {
  const mine = worldAlphas().flatMap((a) => a.deployments).filter((d) => d.portfolioId === portfolioId);
  const accounts = new Set(mine.map((d) => d.accountId));
  const deployments = new Set(mine.map((d) => d.id));
  return WORLD_INCIDENTS.filter((i) => incidentState(i) !== "RESOLVED" && ((i.target[0] === "PORTFOLIO" && i.target[1] === portfolioId) || (i.target[0] === "ACCOUNT" && accounts.has(i.target[1])) || (i.target[0] === "DEPLOYMENT" && deployments.has(i.target[1]))));
}

/* ── a limit ratio is an alert only on a breach ─────────────────────────── */

/** consumed / limit: 'breach' only when consumed EXCEEDS the limit; exactly at the limit is 'at-limit' (full, not an alert). */
export function limitState(consumed: bigint, limit: bigint): "ok" | "near" | "at-limit" | "breach" {
  if (consumed > limit) return "breach";
  if (consumed === limit) return "at-limit";
  return consumed * 100n >= limit * 90n ? "near" : "ok";
}

/* ── an operation / incident environment must be a partition its target really has ── */

export type OpEnv = "PAPER" | "SANDBOX" | "LIVE";
const ENV_RANK: Record<OpEnv, number> = { LIVE: 3, SANDBOX: 2, PAPER: 1 };
const envOf = (e: string): OpEnv => (e === "live" ? "LIVE" : e === "sandbox" ? "SANDBOX" : "PAPER");
/** The environments the world books on an entity (empty when the world does not know it). */
// ===== WP-B2-A3 begin (R3-04, R1-02): an account has ONE environment, its binding's (Accounts list and Account 360 print it); the operation queue names three accounts `acc_TEST_ONLY_*` that the served bodies rename
export const OPERATION_ACCOUNT_ALIASES: Readonly<Record<string, string>> = Object.freeze({ acc_TEST_ONLY_operational: "acc_bnc_core", acc_TEST_ONLY_binance01: "acc_bnc_sub", acc_TEST_ONLY_binance02: "acc_okx_main" });
let accountEnvironment: ((accountId: string) => string | null) | null = null;
/** The Accounts double registers how it states an account's environment (a registry, so the books never import the doubles). */
export const setAccountEnvironmentProvider = (provider: ((accountId: string) => string | null) | null): void => { accountEnvironment = provider; };
// ===== WP-B2-A3 end
export function environmentsOfEntity(kind: string, id: string): OpEnv[] {
  // ===== WP-B2-A3 begin
  if (kind === "ACCOUNT") {
    const stated = accountEnvironment?.(OPERATION_ACCOUNT_ALIASES[id] ?? id) ?? null;
    if (stated !== null) return [envOf(stated)];
  }
  // ===== WP-B2-A3 end
  const all = worldAlphas().flatMap((a) => a.deployments);
  const mine = kind === "PORTFOLIO" ? all.filter((d) => d.portfolioId === id) : kind === "ACCOUNT" ? all.filter((d) => d.accountId === id) : kind === "DEPLOYMENT" ? all.filter((d) => d.id === id) : [];
  const listed = mine.length === 0 && kind === "PORTFOLIO" ? (scaled().portfolios.find((p) => p.id === id)?.environments ?? []).map((e) => envOf(e)) : [];
  return [...new Set([...mine.map((d) => envOf(d.environment)), ...listed])].sort((a, b) => ENV_RANK[b] - ENV_RANK[a]);
}
/** The environment an operation or incident on `target` states: the declared one when the target has that partition (or the world does not know the target), else the target's own highest partition. */
export function environmentFor(kind: string, id: string, declared: OpEnv): OpEnv {
  const have = environmentsOfEntity(kind, id);
  return have.length === 0 || have.includes(declared) ? declared : have[0]!;
}
/** The risk tier that goes with an environment the world corrected (live tiers are kept as declared). */
export const riskTierFor = (env: OpEnv, declared: string, declaredEnv: OpEnv): string =>
  env === declaredEnv ? declared : env === "SANDBOX" ? "R2_SANDBOX" : env === "PAPER" ? "R1_PAPER_MUTATION" : declared;

// ===== WP-B2-C3 begin: ONE definition of the money figures of a book (QA6 R2-03 R2-04 R2-06 R5-08 R5-10)
/**
 * The names of the figures of a deployment, each one number everywhere:
 *   Net PnL   = realized (the published `net_pnl`); a venue's Net PnL is the SUM of its deployments' Net PnL, and so is the deployment sum
 *   Unrealized = the open positions' PnL (none for a stage the alpha left)
 *   Balance   = allocation + realized          (the ledger / "account balance")
 *   Equity    = allocation + realized + unrealized (the venue's equity; the Live room's, the Alpha 360 "Equity" and the equity line end here)
 */
export const netPnlPublished = (d: { realized: string }): bigint => toCents(d.realized);
export const balanceOf = (d: { allocation: string; realized: string }): bigint => toCents(d.allocation) + toCents(d.realized);
export function equityOf(d: { id?: string; allocation: string; realized: string; unrealized: string; stage?: string; alphaId?: string }): bigint {
  const open = d.id !== undefined && isRetired(d.id) ? 0n : toCents(d.unrealized);
  return balanceOf(d) + open;
}
/** Net PnL by venue of an alpha in one environment: one row per venue and currency, each the sum of the published Net PnL of the deployments booked there. */
export function venueNetPnl(alphaId: string, environment: "live" | "paper" | "sandbox"): { venue: string; currency: string; net: bigint }[] {
  const rows = new Map<string, { venue: string; currency: string; net: bigint }>();
  for (const d of worldAlphas().find((a) => a.id === alphaId)?.deployments.filter((x) => x.environment === environment) ?? []) {
    const key = `${d.venue}|${d.currency}`;
    const have = rows.get(key) ?? { venue: d.venue, currency: d.currency, net: 0n };
    have.net += netPnlPublished(d);
    rows.set(key, have);
  }
  return [...rows.values()];
}

/** The day a book opened: the first stage start among the deployments given (the Live page's "running since"). null when the world does not know them. */
export function bookFirstDayMs(deploymentIds: readonly string[]): number | null {
  const starts = deploymentIds.flatMap((id) => { const s = standingOf(id); return s === null ? [] : [s.fromMs]; });
  return starts.length === 0 ? null : Math.min(...starts);
}
/** The deployments of an alpha booked on an account in one environment. */
export const alphaBookIds = (alphaId: string, environment: string, accountId?: string): string[] =>
  (worldAlphas().find((a) => a.id === alphaId)?.deployments ?? []).filter((d) => d.environment === environment && (accountId === undefined || d.accountId === accountId)).map((d) => d.id);

/**
 * The equity line of a book (cents): `points` daily-or-finer samples from the book's first day to the world clock, from its allocation to its equity,
 * on the same level path every other chart of those deployments draws. `[]` when the world does not know the deployments.
 */
export function bookEquityLine(deploymentIds: readonly string[], maxPoints: number): { t: number; cents: bigint }[] {
  const specs = deploymentIds.map((id) => deploymentOf(id)?.deployment).filter((d): d is NonNullable<typeof d> => d !== undefined);
  const first = bookFirstDayMs(deploymentIds);
  if (specs.length === 0 || first === null) return [];
  // the book's age sampled on the lattice of a 30-day window (the density of the DRAWDOWN pane under it), so the line and the pane step on the same instants
  const points = Math.max(2, Math.min(maxPoints, 1 + Math.round(((WORLD_NOW_MS - first) * (LEVEL_NODES - 1)) / (30 * DAY_MS))));
  const levels = bookLevels(deploymentIds, points, specs.reduce((n, d) => n + toCents(d.allocation), 0n), specs.reduce((n, d) => n + equityOf(d), 0n));
  return levels.map((value, i) => ({ t: Math.round(first + ((WORLD_NOW_MS - first) * i) / (points - 1)), cents: value }));
}

/** The fee model of the world: fees accrue at FEE_BP of a deployment's allocation over its whole run (funding and slippage likewise), pro rata by days. */
export const COST_BP = { fees: 10n, funding: 4n, slippage: 2n } as const;
export const costOverRun = (allocation: bigint, kind: keyof typeof COST_BP): bigint => allocation * COST_BP[kind] / 10_000n;
/** What a deployment has paid in `kind` of cost inside the `windowDays` before the world clock: its whole-run cost, pro rata to the part of its run inside the window. null when the world does not know it. */
export function costInWindow(deploymentId: string, kind: keyof typeof COST_BP, windowDays: number, allocationCents?: bigint): bigint | null {
  const found = deploymentOf(deploymentId);
  const standing = standingOf(deploymentId);
  if (found === null || standing === null) return null;
  const from = standing.fromMs;
  const end = Math.min(standing.exitMs ?? WORLD_NOW_MS, WORLD_NOW_MS);
  const span = Math.max(1, end - from);
  const overlap = Math.max(0, end - Math.max(from, WORLD_NOW_MS - windowDays * DAY_MS));
  return costOverRun(allocationCents ?? toCents(found.deployment.allocation), kind) * BigInt(overlap) / BigInt(span); // the caller names the allocation when the id it holds belongs to another universe (the suite's ids repeat the world's)
}

/** A stage the alpha has left has no daily PnL after its exit: the daily figure exists only for a deployment still running. */
export const hasDailyPnl = (deploymentId: string): boolean => !isRetired(deploymentId);
void openUnrealizedOf;
// ===== WP-B2-C3 end
