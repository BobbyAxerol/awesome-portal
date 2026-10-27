/**
 * Portfolios, Portfolio 360 and Compare reads for the e2e BFF double
 * (UXM-07 S2, flag keys `portfolios` and `compare`).
 *
 * A SPARSE-REALISTIC profile: the Manager financial publication is dark, so the
 * double answers what the Trading System really publishes and leaves the rest
 * out. Built from the canonical fixtures
 * (`execution-portfolio-list.valid.json`, `execution-analytics.capital-ledger.valid.json`)
 * plus small synthetic additions that keep the same wire shapes.
 *
 * Wiring (the primary owns `answerExecutionBff`): call this first for GET
 * requests and fall through when it answers `null`:
 *
 *   const pf = answerPortfolios(method, pathname, search);
 *   if (pf !== null) return pf;
 *
 * `pathname` may be the full `/api/v1/execution/...` path or the stripped one.
 * `search` is a `URLSearchParams` or a query string.
 *
 * ## Portfolios (`GET /portfolios`)
 * Six items, two base currencies (USDT, JPY), `truncated: true` with
 * `total_portfolios: 9` (the read has no cursor, so there is no second page):
 *   pf_TEST_ONLY_core       Core, M. Tran, USDT, live + paper (a MIXED book: one
 *                           allocated_by_currency across Real-funded and Simulated)
 *   pf_TEST_ONLY_satellite  Satellite, L. Nguyen, USDT, live
 *   pf_TEST_ONLY_canary     Canary, L. Nguyen, USDT, sandbox
 *   pf_TEST_ONLY_yen        Yen-Carry, M. Tran, JPY, paper
 *   pf_TEST_ONLY_empty      Pilot, owner null, USDT, paper, NO allocation published
 *   pf_unallocated          the bucket no portfolio holds
 * Branches: paper PARTIAL, sandbox AVAILABLE, live AVAILABLE; completeness PARTIAL.
 *
 * ## Portfolio resource (`GET /resources/portfolios/{id}`)
 *   pf_TEST_ONLY_core       2 environments (live, paper), 4 alphas, 5 deployments,
 *                           a shared account (Binance-02 serves two deployments)
 *   pf_TEST_ONLY_satellite  live only, 2 deployments, 2 accounts
 *   pf_TEST_ONLY_yen        paper only, JPY, 1 deployment
 *   pf_TEST_ONLY_empty      identity only: no deployment, no allocation
 *   pf_TEST_ONLY_error      503 PORTFOLIO_RESOURCE_UNAVAILABLE
 *   pf_TEST_ONLY_missing    404 PORTFOLIO_NOT_FOUND
 *   any other id            a bare identity (no relations), state `partial`
 *
 * ## Capital derivation (`GET /derivations/portfolios/{id}/capital?environment=`)
 * Per environment: core live READY, core paper PARTIAL (one input unpublished),
 * core sandbox EMPTY; yen paper READY (JPY); anything else EMPTY.
 *
 * ## Capital ledger (`GET /portfolios/{id}/capital-ledger?environment=`)
 * core live: 5 entries over one currency (bounded: 5 of 12); core paper: an EMPTY
 * ledger; yen paper: 2 entries; `pf_TEST_ONLY_error` 503; others empty.
 *
 * ## Correlation (`GET /portfolios/{id}/correlation`)
 * 503 `ANALYTICS_UPSTREAM_ROUTE_ABSENT`: no data source, the usual answer today.
 * `pf_TEST_ONLY_satellite` answers the canonical ranked/packed fixture instead.
 *
 * ## Equity chart (`GET /views/equity-chart`, subject_kind=portfolio)
 * core: one USDT series of 48 hourly points with a published GAP (8 hours),
 * state PARTIAL; yen: one JPY series, 24 points, READY; satellite: UNAVAILABLE
 * with a reason; others: UNAVAILABLE. Compare can therefore be asked for two
 * portfolios in different currencies, and must not combine them.
 *
 * ## Operations (`GET /operations?target_type=PORTFOLIO`)
 * Delegated to `answerOperationsV2`, whose rows target `pf_TEST_ONLY_core`,
 * `pf_TEST_ONLY_satellite` and `pf_TEST_ONLY_canary`, so the People tab has real
 * rows. Any other `/operations` read returns `null`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { scopedResourceV2 } from "./bffDoubleScopedResource";
import { answerOperationsV2 } from "./bffDoubleV2";
import { addDecimal as addExact, scaleCounts, scaled, sumByCurrency, type PortfolioSpec } from "./bffScale";
import { isPositiveMode, positivePortfolioBookOf } from "./bffPositiveMode";
import { accountFact, deploymentOf, fromCents, grossNotional } from "./bffWorld";

export interface BffAnswerPortfolios {
  status: number;
  body: unknown;
  contentType?: string;
}

const CONTRACTS = join(dirname(fileURLToPath(import.meta.url)), "../../../../packages/contracts/fixtures");
const canonical = (name: string): Record<string, unknown> => JSON.parse(readFileSync(join(CONTRACTS, name), "utf8")) as Record<string, unknown>;
const LIST = canonical("execution-portfolio-list.valid.json");
const LEDGER = canonical("execution-analytics.capital-ledger.valid.json");
const CORRELATION = canonical("execution-analytics.correlation.valid.json");

/** The instant the double calls "now": the browser clock can be fixed here. */
export const PORTFOLIOS_DOUBLE_NOW_ISO = "2026-10-17T12:04:00Z";
const AS_OF = "2026-10-17T12:04:00.000Z";
const AS_OF_MS = Date.parse(AS_OF);
const READ_AT = "2026-10-17T12:04:01.000Z";
const READ_AT_MS = Date.parse(READ_AT);
const HOUR = 3_600_000;

export const PF = {
  core: "pf_TEST_ONLY_core",
  satellite: "pf_TEST_ONLY_satellite",
  canary: "pf_TEST_ONLY_canary",
  yen: "pf_TEST_ONLY_yen",
  empty: "pf_TEST_ONLY_empty",
  error: "pf_TEST_ONLY_error",
  missing: "pf_TEST_ONLY_missing",
  unallocated: "pf_unallocated",
} as const;

type Env = "paper" | "sandbox" | "live";
const ENVS: readonly Env[] = ["paper", "sandbox", "live"];
const isEnv = (value: string | null): value is Env => value !== null && (ENVS as readonly string[]).includes(value);

const ok = (body: unknown): BffAnswerPortfolios => ({ status: 200, body });
const problem = (status: number, code: string, message: string): BffAnswerPortfolios => ({ status, body: { error: { code, message }, request_id: "req_double_portfolios" } });

/* ── GET /portfolios ───────────────────────────────────────────────────── */

const ITEM = (over: Record<string, unknown>) => ({
  state: "ACTIVE",
  base_currency: "USDT",
  updated_at: "2026-10-17T11:58:00Z",
  ...over,
});

const LIST_ITEMS = [
  ITEM({ portfolio_id: PF.core, name: "Core", owner: "M. Tran", environments: ["paper", "live"], allocation_count: 5, deployment_count: 5, allocated_by_currency: [{ currency: "USDT", value: "540000.00" }] }),
  ITEM({ portfolio_id: PF.satellite, name: "Satellite", owner: "L. Nguyen", environments: ["live"], allocation_count: 2, deployment_count: 2, allocated_by_currency: [{ currency: "USDT", value: "350000.00" }], updated_at: "2026-10-17T11:40:00Z" }),
  ITEM({ portfolio_id: PF.canary, name: "Canary", owner: "L. Nguyen", environments: ["sandbox"], allocation_count: 1, deployment_count: 1, allocated_by_currency: [{ currency: "USDT", value: "240000.00" }], updated_at: "2026-10-16T09:00:00Z" }),
  ITEM({ portfolio_id: PF.yen, name: "Yen-Carry", owner: "M. Tran", base_currency: "JPY", environments: ["paper"], allocation_count: 1, deployment_count: 1, allocated_by_currency: [{ currency: "JPY", value: "48000000" }], updated_at: "2026-10-17T10:15:00Z" }),
  ITEM({ portfolio_id: PF.empty, name: "Pilot", owner: null, environments: ["paper"], allocation_count: 0, deployment_count: 0, allocated_by_currency: [], updated_at: "2026-10-12T08:00:00Z" }),
  ITEM({ portfolio_id: PF.unallocated, name: "pf_unallocated", owner: null, state: "UNKNOWN", base_currency: "UNKNOWN", environments: ["paper"], allocation_count: 0, deployment_count: 0, allocated_by_currency: [], updated_at: "2026-10-01T00:00:00Z" }),
];

/** Generated portfolios (empty unless the standalone server runs at a larger scale, e2e/bffScale.ts). */
const scaledPortfolio = (id: string): PortfolioSpec | undefined => scaled().portfolios.find((p) => p.id === id);

const scaledItem = (p: PortfolioSpec) => ITEM({
  portfolio_id: p.id, name: p.name, owner: p.owner, state: p.state, base_currency: p.base, environments: p.environments,
  allocation_count: p.deploymentIds.length, deployment_count: p.deploymentIds.length, allocated_by_currency: p.allocatedByCurrency, updated_at: p.updatedAt,
});

/** WP-P: in the positive world a native portfolio's environments, counts and allocation are the deployments booked in it (the rows the dataset, the statements and the series are built from). */
function positiveListItem<T extends Record<string, unknown>>(item: T): T {
  const book = positivePortfolioBookOf(String(item.portfolio_id ?? ""));
  if (book === null || book.deployments.length === 0) return item;
  const currency = book.deployments[0]!.currency;
  const total = book.deployments.reduce((sum, d) => addExact(sum, d.allocation), "0");
  const order = ["paper", "sandbox", "live"];
  return { ...item, environments: order.filter((env) => book.deployments.some((d) => d.environment === env)), allocation_count: book.deployments.length,
    deployment_count: book.deployments.length, allocated_by_currency: [{ currency, value: total }] };
}

function portfolioList(): BffAnswerPortfolios {
  const extra = scaled();
  const shown = extra.portfolios.slice(0, Math.max(0, scaleCounts().portfoliosShown - LIST_ITEMS.length));
  return ok({
    ...LIST,
    read_at: READ_AT,
    source_as_of: AS_OF,
    freshness: "FRESH",
    completeness: isPositiveMode() ? "COMPLETE" : "PARTIAL", // WP-P
    environments: {
      paper: isPositiveMode() ? { state: "AVAILABLE", reason_code: null } : { state: "PARTIAL", reason_code: "N31_PROJECTION_LAGGING" },
      sandbox: { state: "AVAILABLE", reason_code: null },
      live: { state: "AVAILABLE", reason_code: null },
    },
    total_portfolios: extra.portfolios.length > 0 ? extra.portfoliosTotal : isPositiveMode() ? 8 : 9,
    truncated: extra.portfolios.length > 0 ? extra.portfoliosTruncated : !isPositiveMode(),
    items: (shown.length > 0 ? [...LIST_ITEMS, ...shown.map(scaledItem)] : LIST_ITEMS).filter((item) => !isPositiveMode() || (item as { portfolio_id?: string }).portfolio_id !== PF.unallocated).map(positiveListItem), // WP-P: no UNKNOWN row in the positive world, and a native portfolio prints its own book
  });
}

/* ── GET /resources/portfolios/{id} ────────────────────────────────────── */

type Row = Record<string, unknown>;

interface Dep { id: string; strategy: string; mode: "live" | "paper" | "sandbox"; venue: string; account: string; ccy: string; allocation: string; pnl: string; exposure: string; health: "READY" | "ATTENTION" | "FINDING" }

const STRATEGIES: Record<string, Row> = {
  strat_btc: { strategy_id: "strat_btc", alpha_id: "strat_btc", label: "BTC-Trend", version: "v3", trader_id: "asmith" },
  strat_eth: { strategy_id: "strat_eth", alpha_id: "strat_eth", label: "ETH-Mean", version: "v2", trader_id: "bjones" },
  strat_sol: { strategy_id: "strat_sol", alpha_id: "strat_sol", label: "SOL-Breakout", version: "v1", trader_id: "asmith" },
  strat_car: { strategy_id: "strat_car", alpha_id: "strat_car", label: "Funding-Carry", version: "v4", trader_id: "bjones" },
  strat_jpy: { strategy_id: "strat_jpy", alpha_id: "strat_jpy", label: "Yen-Basis", version: "v1", trader_id: "mtran" },
};

const CORE_DEPS: readonly Dep[] = [
  { id: "live-0192", strategy: "strat_btc", mode: "live", venue: "BINANCE", account: "Binance-02", ccy: "USDT", allocation: "120000.00", pnl: "3300.00", exposure: "114100.00", health: "READY" },
  { id: "live-0193", strategy: "strat_btc", mode: "live", venue: "OKX", account: "OKX-01", ccy: "USDT", allocation: "80000.00", pnl: "2120.10", exposure: "73500.00", health: "ATTENTION" },
  { id: "live-0210", strategy: "strat_eth", mode: "live", venue: "BINANCE", account: "Binance-02", ccy: "USDT", allocation: "160000.00", pnl: "3890.12", exposure: "132200.00", health: "FINDING" },
  { id: "live-0215", strategy: "strat_sol", mode: "live", venue: "BYBIT", account: "Bybit-01", ccy: "USDT", allocation: "100000.00", pnl: "410.00", exposure: "61000.00", health: "READY" },
  { id: "pap-0301", strategy: "strat_car", mode: "paper", venue: "BINANCE", account: "Paper-Binance", ccy: "USDT", allocation: "80000.00", pnl: "-410.00", exposure: "78400.00", health: "READY" },
];
const SATELLITE_DEPS: readonly Dep[] = [
  { id: "live-0301", strategy: "strat_eth", mode: "live", venue: "BINANCE", account: "Binance-03", ccy: "USDT", allocation: "200000.00", pnl: "12000.50", exposure: "180000.00", health: "READY" },
  { id: "live-0302", strategy: "strat_sol", mode: "live", venue: "OKX", account: "OKX-02", ccy: "USDT", allocation: "150000.00", pnl: "-2300.75", exposure: "98000.00", health: "READY" },
];
const YEN_DEPS: readonly Dep[] = [
  { id: "pap-0401", strategy: "strat_jpy", mode: "paper", venue: "BITFLYER", account: "Paper-Yen", ccy: "JPY", allocation: "48000000", pnl: "310000", exposure: "30000000", health: "READY" },
];

const BALANCES: Record<string, { ccy: string; total: string; free: string; locked: string }> = {
  "Binance-02": { ccy: "USDT", total: "412880.00", free: "300450.00", locked: "112430.00" },
  "OKX-01": { ccy: "USDT", total: "188300.00", free: "163800.00", locked: "24500.00" },
  "Bybit-01": { ccy: "USDT", total: "96520.00", free: "80660.00", locked: "15860.00" },
  "Paper-Binance": { ccy: "USDT", total: "252310.00", free: "52310.00", locked: "0.00" },
  "Binance-03": { ccy: "USDT", total: "510000.00", free: "300000.00", locked: "210000.00" },
  "OKX-02": { ccy: "USDT", total: "160000.00", free: "120000.00", locked: "40000.00" },
  "Paper-Yen": { ccy: "JPY", total: "52000000", free: "20000000", locked: "32000000" },
};
const MARGINS: Record<string, { initial: string; maintenance: string }> = {
  "Binance-02": { initial: "100430.00", maintenance: "50215.00" },
  "OKX-01": { initial: "24500.00", maintenance: "12250.00" },
  "Bybit-01": { initial: "15860.00", maintenance: "7930.00" },
};

function resourceFor(id: string, deps: readonly Dep[], over: { name: string; owner: string | null; base: string; environments: readonly Env[]; completeness?: string }): Row {
  const strategyIds = [...new Set(deps.map((d) => d.strategy))];
  const accounts = [...new Set(deps.map((d) => d.account))];
  const deployments = deps.map((d) => ({
    deployment_id: d.id, strategy_id: d.strategy, stage: d.mode.toUpperCase(), venue: d.venue, account_id: d.account, portfolio_id: id, portfolio_name: over.name,
    currency: d.ccy, allocation: d.allocation, balance_total: BALANCES[d.account]?.total ?? null, balance_free: BALANCES[d.account]?.free ?? null, balance_locked: BALANCES[d.account]?.locked ?? null,
    position_fact_count: 2, realized_pnl: null, unrealized_pnl: null, net_pnl: d.pnl, exposure: d.exposure,
    state: "ACTIVE", active: true, health: d.health, updated_at: "2026-10-17T11:58:00Z",
  }));
  // The server's own per-currency sum, which the double stands in for. The screens never add.
  const allocationByCurrency = [...new Set(deps.map((d) => d.ccy))].sort().map((ccy) => ({
    currency: ccy,
    value: deps.filter((d) => d.ccy === ccy).map((d) => d.allocation).reduce((a, b) => addDecimal(a, b)),
  }));
  return {
    schema_version: "execution.portfolio-resource.v1",
    record_authority: "PORTAL_CONTROL",
    source_authority: "TRADING_SYSTEM",
    workspace_id: "workspace_execution_manager",
    selected_environment: over.environments.includes("live") ? "live" : over.environments[0] ?? "paper",
    read_at: READ_AT, as_of: AS_OF, read_at_ms: READ_AT_MS, as_of_ms: AS_OF_MS,
    state: deps.length === 0 ? "partial" : "ready",
    freshness: "FRESH",
    completeness: over.completeness ?? "COMPLETE",
    capabilities: [],
    panels: {},
    unavailable_branches: [],
    data: {
      strategies: strategyIds.map((s) => STRATEGIES[s]),
      deployments,
      accounts: accounts.map((a) => ({ account_id: a, venue: deps.find((d) => d.account === a)?.venue, mode: deps.find((d) => d.account === a)?.mode, base_currency: BALANCES[a]?.ccy ?? over.base, account_type: "USDT-M futures", updated_at: AS_OF })),
      account_balances: accounts.flatMap((a) => (BALANCES[a] ? [{ account_id: a, currency: BALANCES[a].ccy, total: BALANCES[a].total, free: BALANCES[a].free, locked: BALANCES[a].locked, updated_at: AS_OF }] : [])),
      margin_balances: accounts.flatMap((a) => (MARGINS[a] ? [{ account_id: a, currency: "USDT", initial: MARGINS[a].initial, maintenance: MARGINS[a].maintenance, updated_at: AS_OF }] : [])),
      account_sync: accounts.map((a) => ({ sync_id: `sync_${a}`, account_id: a, status: a === "Binance-02" ? "STALE" : "SYNCED", synced_at: a === "Binance-02" ? "2026-10-17T11:50:00Z" : "2026-10-17T12:03:40Z" })),
      reconciliation: accounts.includes("Binance-02") ? [{ finding_id: "rec_1", account_id: "Binance-02", status: "OPEN" }] : [],
      portfolio_allocations: deps.map((d) => ({ portfolio_id: id, deployment_id: d.id, strategy_id: d.strategy, currency: d.ccy, allocated_capital: d.allocation })),
      profile_coverage: Object.fromEntries(over.environments.map((env) => [env, { state: "FOUND" }])),
      portfolio: {
        portfolio_id: id, name: over.name, owner: over.owner, base_currency: over.base, state: "ACTIVE",
        deployments, allocations: [], allocation_by_currency: allocationByCurrency, holdings_count: deps.length, account_ids: accounts,
      },
    },
  };
}

/** Exact decimal addition on strings, for the double's own server-summed field only. */
function addDecimal(a: string, b: string): string {
  const scale = Math.max((a.split(".")[1] ?? "").length, (b.split(".")[1] ?? "").length);
  const toInt = (v: string) => BigInt(v.replace(".", "") + "0".repeat(scale - (v.split(".")[1] ?? "").length));
  const sum = (toInt(a) + toInt(b)).toString().padStart(scale + 1, "0");
  return scale === 0 ? sum : `${sum.slice(0, -scale)}.${sum.slice(-scale)}`;
}

/**
 * WORLD: in the positive world a native portfolio is exactly the deployments the world books into it: the world's deployment ids, accounts, venues, allocations and
 * net PnL, the balance each account states (allocation + realized), the sync SYNCED. Nothing here is typed by hand, so the register, the 360, the Capital panel and
 * Compare read the same deployments (QA3 R1-01..06).
 */
function worldDeps(id: string): Dep[] | null {
  const book = positivePortfolioBookOf(id);
  if (book === null || book.deployments.length === 0) return null;
  return book.deployments.map((entry) => {
    const found = deploymentOf(entry.deployment_id);
    const account = found?.deployment.accountId ?? `acct_${entry.deployment_id}`;
    const fact = accountFact(account);
    STRATEGIES[entry.alpha_id] ??= { strategy_id: entry.alpha_id, alpha_id: entry.alpha_id, label: entry.alpha_label, version: `v${found?.alpha.version ?? "1"}`, trader_id: found?.alpha.owner ?? null };
    if (fact !== null) BALANCES[account] = { ccy: fact.currency, total: fromCents(fact.total), free: fromCents(fact.free), locked: fromCents(fact.locked) };
    const pnl = addExact(entry.realized, entry.unrealized);
    return { id: entry.deployment_id, strategy: entry.alpha_id, mode: entry.environment, venue: found?.deployment.venue ?? "BINANCE", account, ccy: entry.currency, allocation: entry.allocation, pnl, exposure: grossNotional(entry.deployment_id), health: "READY" as const };
  });
}
const worldResource = (id: string, name: string, owner: string | null, base: string): BffAnswerPortfolios | null => {
  const deps = worldDeps(id);
  if (deps === null) return null;
  const order: Env[] = ["live", "paper", "sandbox"];
  return ok(resourceFor(id, deps, { name, owner, base, environments: order.filter((env) => deps.some((d) => d.mode === env)) }));
};

function portfolioResource(id: string): BffAnswerPortfolios {
  if (isPositiveMode()) {
    const item = LIST_ITEMS.find((entry) => (entry as { portfolio_id?: string }).portfolio_id === id) as { name?: string; owner?: string | null; base_currency?: string } | undefined;
    const positive = item === undefined ? null : worldResource(id, item.name ?? id, item.owner ?? null, item.base_currency ?? "USDT");
    if (positive !== null) return positive;
  }
  switch (id) {
    case PF.core: return ok(resourceFor(PF.core, CORE_DEPS, { name: "Core", owner: "M. Tran", base: "USDT", environments: ["live", "paper"] }));
    case PF.satellite: return ok(resourceFor(PF.satellite, SATELLITE_DEPS, { name: "Satellite", owner: "L. Nguyen", base: "USDT", environments: ["live"] }));
    case PF.yen: return ok(resourceFor(PF.yen, YEN_DEPS, { name: "Yen-Carry", owner: "M. Tran", base: "JPY", environments: ["paper"] }));
    case PF.empty: return ok(resourceFor(PF.empty, [], { name: "Pilot", owner: null, base: "USDT", environments: ["paper"], completeness: "PARTIAL" }));
    case PF.error: return problem(503, "PORTFOLIO_RESOURCE_UNAVAILABLE", "The portfolio resource could not be read.");
    case PF.missing: return problem(404, "PORTFOLIO_NOT_FOUND", "No such portfolio.");
    default: {
      const generated = scaledPortfolio(id);
      if (generated) return ok(scaledResource(generated));
      return ok({ ...resourceFor(id, [], { name: id, owner: null, base: "UNKNOWN", environments: [] }), state: "partial", data: {} });
    }
  }
}

/** A generated portfolio's book, from the deployments the fleet shows for it. Strategies and balances are registered once. */
function scaledDeps(p: PortfolioSpec): Dep[] {
  const mine = scaled().alphas.flatMap((a) => a.deployments.map((d) => ({ a, d }))).filter(({ d }) => d.portfolioId === p.id);
  return mine.map(({ a, d }) => {
    STRATEGIES[a.id] ??= { strategy_id: a.id, alpha_id: a.id, label: a.label, version: `v${a.version}`, trader_id: a.owner };
    // A balance is published for an account that syncs; the others stay unpublished (null), never zero.
    const binding = scaled().bindings.find((b) => b.accountId === d.accountId);
    const world = isPositiveMode() ? accountFact(d.accountId) : null;
    if (world !== null) BALANCES[d.accountId] = { ccy: world.currency, total: fromCents(world.total), free: fromCents(world.free), locked: fromCents(world.locked) };
    else if (binding && binding.credentialState !== "NOT_PUBLISHED" && binding.credentialState !== "EXPIRED") {
      BALANCES[d.accountId] ??= { ccy: d.currency, total: addExact(d.allocation, d.allocation), free: d.allocation, locked: d.allocation };
    }
    return { id: d.id, strategy: a.id, mode: d.environment, venue: d.venue, account: d.accountId, ccy: d.currency, allocation: d.allocation, pnl: addExact(d.realized, d.unrealized), exposure: d.exposure, health: d.health };
  });
}

function scaledResource(p: PortfolioSpec): Row {
  return resourceFor(p.id, scaledDeps(p), { name: p.name, owner: p.owner, base: p.base, environments: p.environments });
}

/* ── GET /derivations/portfolios/{id}/capital ──────────────────────────── */

function derivation(id: string, environment: Env, data: Row, stateAsked: "READY" | "PARTIAL" | "EMPTY", reasonAsked: string | null): Row {
  const positive = isPositiveMode() && stateAsked === "PARTIAL"; // WP-P: a partial input is complete in the positive world
  const state = positive ? "READY" : stateAsked;
  const reason = positive ? null : reasonAsked;
  return {
    schema_version: "execution.derivation.v1",
    logical_operation_id: "executionPortfolioCapitalV1",
    record_authority: "PORTAL_CONTROL",
    source_authority: "TRADING_SYSTEM",
    workspace_id: "workspace_execution_manager",
    environment,
    profile_id: `profile_${environment}`,
    read_at: READ_AT, as_of: AS_OF, read_at_ms: READ_AT_MS, as_of_ms: AS_OF_MS,
    state, reason_code: reason, freshness: "FRESH", completeness: state === "READY" ? "COMPLETE" : "PARTIAL",
    formula: { id: "executionPortfolioCapitalV1.fixture", version: "v1", currency_policy: "PARTITIONED_BY_SOURCE_CURRENCY_NO_FX_AGGREGATE", temporal_policy: "UTC_EPOCH_MS" },
    input_population: [{ relation: "portal.e2e.current-observation", state: "AVAILABLE", reason_code: null, population: "1", freshness: "FRESH", completeness: "COMPLETE", as_of_ms: AS_OF_MS }],
    input_digest: `sha256:${"e".repeat(64)}`,
    data: { portfolio_id: id, currency_policy: "PARTITIONED_BY_SOURCE_CURRENCY_NO_FX_AGGREGATE", current_observation_only: true, ...data },
  };
}

function portfolioCapital(id: string, environment: Env): BffAnswerPortfolios {
  const portfolio = (name: string, base: string) => ({ name, base_currency: base, state: "ACTIVE", created_at: "2026-07-02T08:00:00Z", updated_at: AS_OF });
  if (id === PF.core && environment === "live") {
    return ok(derivation(id, environment, {
      portfolio: portfolio("Core", "USDT"),
      allocation_by_currency: [{ currency: "USDT", population: "4", allocated_capital: "460000.00", max_capital: "700000.00" }],
      account_balance_by_currency: [{ currency: "USDT", population: "3", total: "697700.00", free: "544910.00", locked: "152790.00" }],
      unpublished_inputs: [],
    }, "READY", null));
  }
  if (id === PF.core && environment === "paper") {
    return ok(derivation(id, environment, {
      portfolio: portfolio("Core", "USDT"),
      allocation_by_currency: [{ currency: "USDT", population: "1", allocated_capital: "80000.00", max_capital: "250000.00" }],
      account_balance_by_currency: [{ currency: "USDT", population: "1", total: "252310.00", free: "52310.00", locked: "0.00" }],
      unpublished_inputs: ["margin_balances"],
    }, "PARTIAL", "MARGIN_BALANCES_NOT_PUBLISHED"));
  }
  if (id === PF.satellite && environment === "live") {
    return ok(derivation(id, environment, {
      portfolio: portfolio("Satellite", "USDT"),
      allocation_by_currency: [{ currency: "USDT", population: "2", allocated_capital: "350000.00", max_capital: "500000.00" }],
      account_balance_by_currency: [{ currency: "USDT", population: "2", total: "670000.00", free: "420000.00", locked: "250000.00" }],
      unpublished_inputs: [],
    }, "READY", null));
  }
  if (id === PF.yen && environment === "paper") {
    return ok(derivation(id, environment, {
      portfolio: portfolio("Yen-Carry", "JPY"),
      allocation_by_currency: [{ currency: "JPY", population: "1", allocated_capital: "48000000", max_capital: "60000000" }],
      account_balance_by_currency: [{ currency: "JPY", population: "1", total: "52000000", free: "20000000", locked: "32000000" }],
      unpublished_inputs: [],
    }, "READY", null));
  }
  const generated = scaledPortfolio(id);
  const deps = generated ? scaledDeps(generated).filter((d) => d.mode === environment) : [];
  if (generated && deps.length > 0) {
    const allocated = sumByCurrency(deps.map((d) => ({ currency: d.ccy, value: d.allocation })));
    const accounts = [...new Set(deps.map((d) => d.account))];
    const published = accounts.filter((a) => BALANCES[a] !== undefined);
    const balances = sumByCurrency(published.map((a) => ({ currency: BALANCES[a]!.ccy, value: BALANCES[a]!.total })));
    const complete = published.length === accounts.length;
    return ok(derivation(id, environment, {
      portfolio: portfolio(generated.name, generated.base),
      allocation_by_currency: allocated.map(({ currency, value }) => ({ currency, population: String(deps.filter((d) => d.ccy === currency).length), allocated_capital: value, max_capital: addExact(value, value) })),
      account_balance_by_currency: balances.map(({ currency, value }) => {
        const mine = published.filter((a) => BALANCES[a]!.ccy === currency);
        const sum = (field: "free" | "locked") => mine.reduce((acc, a) => addExact(acc, BALANCES[a]![field]), "0");
        return { currency, population: String(mine.length), total: value, free: sum("free"), locked: sum("locked") };
      }),
      unpublished_inputs: complete ? [] : ["account_balances"],
    }, complete ? "READY" : "PARTIAL", complete ? null : "ACCOUNT_BALANCES_NOT_PUBLISHED"));
  }
  return ok(derivation(id, environment, { portfolio: null, allocation_by_currency: [], account_balance_by_currency: [], unpublished_inputs: [] }, "EMPTY", "NO_BOOK_IN_ENVIRONMENT"));
}

/* ── GET /portfolios/{id}/capital-ledger ───────────────────────────────── */

function ledgerEntry(i: number, movement: string, direction: string, amount: string, before: string, after: string, at: string, account: string): Row {
  return { ledger_id: `ledger-${i}`, allocation_id: `allocation-${i}`, account_id: account, movement_type: movement, direction, amount, before_allocated: before, after_allocated: after, occurred_at: at };
}

function capitalLedger(id: string, environment: Env): BffAnswerPortfolios {
  if (id === PF.error) return problem(503, "ANALYTICS_ARITHMETIC_UNAVAILABLE", "The engine could not complete this computation.");
  const base = LEDGER as { analytics: Row } & Row;
  const analytics = base.analytics as Row;
  const data = analytics.data as Row;
  const wrap = (buckets: Row[], total: number, returned: number, hasMore: boolean): BffAnswerPortfolios => ok({
    ...base,
    read_at: READ_AT,
    analytics: { ...analytics, data: { ...data, portfolio_id: id, entry_count: total, returned_entry_count: returned, has_more: hasMore, buckets } },
  });
  if (id === PF.core && environment === "live") {
    return wrap([{
      currency: "USDT",
      gross_increase: "480000.00",
      gross_decrease: "20000.00",
      entry_count: 12,
      entries: [
        ledgerEntry(12, "WITHDRAW", "DECREASE", "20000.00", "140000.00", "120000.00", "2026-10-17T09:14:00Z", "Binance-02"),
        ledgerEntry(11, "ALLOCATE", "INCREASE", "50000.00", "90000.00", "140000.00", "2026-10-17T08:40:00Z", "Binance-02"),
        ledgerEntry(10, "REBALANCE", "UNCHANGED", "0", "160000.00", "160000.00", "2026-10-17T08:30:00Z", "Binance-02"),
        ledgerEntry(9, "ALLOCATE", "INCREASE", "100000.00", "60000.00", "160000.00", "2026-08-11T09:12:00Z", "OKX-01"),
        ledgerEntry(8, "INITIAL_ALLOCATE", "INCREASE", "60000.00", "0", "60000.00", "2026-07-02T08:00:00Z", "Bybit-01"),
      ],
    }], 12, 5, true);
  }
  if (id === PF.yen && environment === "paper") {
    return wrap([{
      currency: "JPY",
      gross_increase: "48000000",
      gross_decrease: "0",
      entry_count: 2,
      entries: [
        ledgerEntry(2, "ALLOCATE", "INCREASE", "18000000", "30000000", "48000000", "2026-09-02T08:00:00Z", "Paper-Yen"),
        ledgerEntry(1, "INITIAL_ALLOCATE", "INCREASE", "30000000", "0", "30000000", "2026-08-11T09:20:00Z", "Paper-Yen"),
      ],
    }], 2, 2, false);
  }
  // An empty ledger is a fact: a bucket-less book.
  return wrap([], 0, 0, false);
}

/* ── GET /portfolios/{id}/correlation ──────────────────────────────────── */

function portfolioCorrelation(id: string): BffAnswerPortfolios {
  if (id === PF.satellite) {
    const analytics = (CORRELATION as { analytics: Row }).analytics;
    const data = analytics.data as Row;
    return ok({ ...CORRELATION, analytics: { ...analytics, data: { ...data, portfolio_id: id } } });
  }
  return problem(503, "ANALYTICS_UPSTREAM_ROUTE_ABSENT", "The source serves no correlation route for this portfolio.");
}

/* ── GET /views/equity-chart ───────────────────────────────────────────── */

/** Integer minor units to a two-place decimal string: no float ever prints. */
function cents(value: number): string {
  const negative = value < 0;
  const abs = Math.abs(value);
  return `${negative ? "-" : ""}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

function equityPayload(search: URLSearchParams): BffAnswerPortfolios {
  const id = search.get("subject_id") ?? "";
  const kind = search.get("subject_kind") ?? "portfolio";
  const environment = isEnv(search.get("environment")) ? (search.get("environment") as Env) : "live";
  const metric = search.get("metric") ?? "equity";
  const base = {
    schema_version: "execution.financial-chart.v1",
    logical_operation_id: "executionFinancialChartV1",
    record_authority: "PORTAL_CONTROL",
    source_authority: "DERIVED",
    workspace_id: "workspace_execution_manager",
    environment,
    profile_id: `profile_${environment}`,
    subject: { kind, id },
    metric,
  };
  const clocks = { as_of_ms: AS_OF_MS, read_at_ms: READ_AT_MS, source_published_at_ms: AS_OF_MS };
  const formula = { formula_id: "double.retained-equity.v1", formula_version: "v1", input_digest: `sha256:${"e".repeat(64)}`, input_revision: `double-${environment}:1` };
  const unavailable = (reason: string): BffAnswerPortfolios => ok({
    ...base,
    panel: { state: "UNAVAILABLE", reason_code: reason, retryable: false, clocks, coverage: { from_ms: null, to_ms: null, source_total: null, filtered_total: "0", returned_count: 0, truncated: false, downsampled: false, has_more: false, gaps: [] }, formula,
      data: { comparison_mode: "SINGLE_SUBJECT", scale_mode: "LINEAR", currency_policy: "PARTITIONED_BY_SOURCE_CURRENCY_NO_FX_AGGREGATE", series: [], sampling: null, retention: null, benchmark: { requested: false, state: "UNAVAILABLE", reason_code: "EDS11R4_MARKET_CONTEXT_NOT_ACTIVATED" } } },
  });
  const build = (currency: string, label: string, start: number, count: number, startCents: number, stepCents: number, gapAsked: readonly [number, number] | null, stateAsked: "READY" | "PARTIAL", endCents?: number): BffAnswerPortfolios => {
    const gap = isPositiveMode() ? null : gapAsked; // WP-P: no retained-snapshot gap in the positive world
    const state = isPositiveMode() ? "READY" : stateAsked;
    const from = Number(search.get("from_ms") ?? AS_OF_MS - (count - 1) * HOUR);
    const first = Number.isSafeInteger(from) ? Math.max(from, start) : start;
    const points: [number, string][] = [];
    for (let i = 0; i < count; i += 1) {
      const t = start + i * HOUR;
      if (t < first) continue;
      if (gap !== null && i >= gap[0] && i < gap[1]) continue;
      // A small deterministic zig-zag over a drift, in minor units.
      points.push([t, cents(startCents + i * stepCents + (i % 5 === 0 ? -stepCents * 3 : (i % 3) * stepCents))]);
    }
    if (endCents !== undefined && points.length > 0) points[points.length - 1] = [points[points.length - 1]![0], cents(endCents)]; // WP-P: the line ends on the NAV the Portfolio 360 statement states
    const gaps = gap === null ? [] : [{ from_ms: start + (gap[0] - 1) * HOUR, to_ms: start + gap[1] * HOUR, reason: "SOURCE_SNAPSHOT_GAP" }];
    return ok({
      ...base,
      panel: {
        state, reason_code: state === "PARTIAL" ? "RETAINED_SNAPSHOT_GAP" : null, retryable: false, clocks,
        coverage: { from_ms: points[0]?.[0] ?? null, to_ms: points[points.length - 1]?.[0] ?? null, source_total: "4592", filtered_total: String(points.length), returned_count: points.length, truncated: false, downsampled: false, has_more: false, gaps },
        formula,
        data: {
          comparison_mode: "SINGLE_SUBJECT", scale_mode: "LINEAR", currency_policy: "PARTITIONED_BY_SOURCE_CURRENCY_NO_FX_AGGREGATE",
          series: [{ id: `${kind}:${id}:${metric}:${currency}`, label, account_id: null, currency, points }],
          sampling: { algorithm: "MIN_MAX_LAST_BUCKET_V1", source_rows: "4592", numeric_rows: "4592", rejected_rows: "0", returned_rows: points.length, target_points: 256, bucket_seconds: 3600, preserves_extrema: true, preserves_first_last: true, preserves_gaps: true, gap_semantics: "GAPS_ARE_LISTED_NOT_FILLED", marker_semantics: "NONE" },
          retention: { retention_floor_ms: null, retention_floor_state: "UNKNOWN", oldest_available_ms: points[0]?.[0] ?? null, newest_available_ms: points[points.length - 1]?.[0] ?? null, history_semantics: "RETAINED_SNAPSHOT_RANGE_NOT_EVENT_REPLAY_OR_TOTAL_HISTORY" },
          benchmark: { requested: false, state: "UNAVAILABLE", reason_code: "EDS11R4_MARKET_CONTEXT_NOT_ACTIVATED" },
        },
      },
    });
  };
  if (kind !== "portfolio") return unavailable("SUBJECT_KIND_NOT_SERVED_BY_THIS_DOUBLE");
  // WP-P: a native portfolio's equity line starts at its opening allocation and ends on the NAV its capital statement states (allocation + realized PnL of the
  // deployments booked in this environment), so the chart, the NAV tile and the Compare table read one number.
  const book = positivePortfolioBookOf(id);
  const booked = book?.deployments.filter((d) => d.environment === environment) ?? [];
  if (booked.length > 0) {
    const minor = (value: string): number => { const negative = value.startsWith("-"); const [w, f = ""] = value.replace("-", "").split("."); const n = Number(w) * 100 + Number(`${f}00`.slice(0, 2)); return negative ? -n : n; };
    const opening = booked.reduce((n, d) => n + minor(d.allocation), 0);
    const nav = opening + booked.reduce((n, d) => n + minor(d.realized), 0);
    return build(booked[0]!.currency, `${booked[0]!.portfolio_name} equity`, AS_OF_MS - 47 * HOUR, 48, opening, Math.trunc((nav - opening) / 49), null, "READY", nav);
  }
  if (id === PF.core) return build("USDT", "Core equity", AS_OF_MS - 47 * HOUR, 48, 61_000_000, 12_500, [20, 28], "PARTIAL");
  if (id === PF.yen) return build("JPY", "Yen-Carry equity", AS_OF_MS - 23 * HOUR, 24, 5_200_000_000, 150_000, null, "READY");
  const generated = scaledPortfolio(id);
  if (generated && generated.deploymentIds.length > 0) {
    // Three in four generated books publish a series; one in three of those has a published gap.
    const key = Number(generated.id.slice(-3));
    if (isPositiveMode() || key % 4 !== 0) { // WP-P: every generated book publishes a series in the positive world
      const start = Math.round(Number(generated.allocatedByCurrency[0]?.value ?? "0") * 100);
      return build(generated.base, `${generated.name} equity`, AS_OF_MS - 47 * HOUR, 48, start, Math.max(1, Math.round(start / 2500)), key % 3 === 0 ? [20, 28] : null, key % 3 === 0 ? "PARTIAL" : "READY");
    }
  }
  return unavailable("NO_EQUITY_SNAPSHOTS_FOR_SUBJECT");
}

/* ── routing ───────────────────────────────────────────────────────────── */

const toParams = (search: URLSearchParams | string): URLSearchParams => (typeof search === "string" ? new URLSearchParams(search) : search);

/**
 * `pathname` is the request path, with or without `/api/v1/execution`. Answers
 * `null` for anything that is not a portfolios read, so the caller falls through.
 */
export function answerPortfolios(method: string, pathname: string, search: URLSearchParams | string = ""): BffAnswerPortfolios | null {
  if (method !== "GET") return null;
  const path = pathname.replace(/^\/api\/v1\/execution/, "") || "/";
  const query = toParams(search);
  const seg = path.split("/").filter(Boolean).map((part) => decodeURIComponent(part));

  if (path === "/portfolios") return portfolioList();
  if (seg[0] === "resources" && seg[1] === "portfolios" && seg.length === 3) {
    const scoped = scopedResourceV2("PORTFOLIO", seg[2], query);
    return scoped ? { status: 200, body: scoped } : portfolioResource(seg[2]);
  }
  if (seg[0] === "derivations" && seg[1] === "portfolios" && seg[3] === "capital" && seg.length === 4) {
    const environment = query.get("environment");
    return isEnv(environment) ? portfolioCapital(seg[2], environment) : problem(400, "invalid_environment", "A profile environment is required.");
  }
  if (seg[0] === "portfolios" && seg[2] === "capital-ledger" && seg.length === 3) {
    const environment = query.get("environment");
    return capitalLedger(seg[1], isEnv(environment) ? environment : "live");
  }
  if (seg[0] === "portfolios" && seg[2] === "correlation" && seg.length === 3) return portfolioCorrelation(seg[1]);
  if (path === "/views/equity-chart" && query.get("subject_kind") === "portfolio") return equityPayload(query);
  if (path === "/operations" && query.get("target_type") === "PORTFOLIO") return answerOperationsV2(method, path, query);
  return null;
}
