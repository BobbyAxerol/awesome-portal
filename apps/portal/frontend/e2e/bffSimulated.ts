/**
 * SIMULATED answers (FIXTURE_LAB, opt-in: `reviewManager` or `simulated`).
 *
 * Bobby approved simulated fixture data on 2026-10-22: a screen should not stay "Not available" when a plausible, rule-bound
 * simulation can fill it. These are overlays on the sparse doubles' own bodies, served through the SAME routes and read by the
 * SAME readers as the real Edge. Every key is an optional scalar on an open row (`ManagerRecord`), so the published schema still
 * validates. Rules: exact decimal strings, bigint arithmetic only, no float, one currency per figure, no cross-domain sums.
 * Nothing here is wired to a component; switch the option off and the screens fall back to their typed absences.
 *
 * The register of what is simulated, with the expected real source of each key, is in `apps/portal/fixture-bff/README.md`
 * (SIMULATED table) and `upgrade/execution_loop/evidence/UXM-07/SIMULATED_DATA_REGISTER_2026-10-22.md`.
 *
 * NOT simulated, because the published shape forbids it (see the README): queue `health.*`, queue-row Intent/Display (the row
 * schema is closed), and the incident children (the same GET path answers one shape: the strict V2 root).
 */

import { createHash } from "node:crypto";

import { credentialView, stateView } from "../src/execution/v2/screens/account/model";
import { fixtureNowMs, scaled } from "./bffScale";
// ===== WP-F3 begin: lit stage bodies (register 2f3) =====
import { simulateStage } from "./bffSimulatedStage";
// ===== WP-F3 end =====

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj => typeof value === "object" && value !== null && !Array.isArray(value);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** `a + b` of two non-negative decimal strings with two places, by integer arithmetic (one currency, one partition). */
function addCents(a: string, b: string): string {
  const cents = (text: string) => BigInt(text.replace(".", ""));
  const total = cents(a) + cents(b);
  const whole = total / 100n;
  const frac = (total % 100n).toString().padStart(2, "0");
  return `${whole}.${frac}`;
}

/** Truncated six-place ratio `(value - peak) / peak` as an exact decimal string, both as two-place decimals. */
function ratio6(value: string, peak: string): string {
  const cents = (text: string) => BigInt(text.replace(".", ""));
  const v = cents(value);
  const p = cents(peak);
  const scaled = ((v - p) * 1_000_000n) / p; // bigint division truncates toward zero
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const whole = abs / 1_000_000n;
  const frac = (abs % 1_000_000n).toString().padStart(6, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

/* ── account resource (`/resources/accounts/{id}`) ──────────────────────── */

const WALLET_BALANCE_CORE = "412880.25";
const NATIVE_EQUITY_CORE = "414010.40";
const NAMES = { portfolio: { pf_core: "Core" }, strategy: { btc_trend: "BTC Trend" }, deployment: { dep_btc_live: "BTC Trend live" } } as const;

function overlayAccountResource(body: Obj, accountId: string): Obj {
  const out = clone(body);
  const data = out.data;
  if (!isObj(data)) return out;
  const rows = (key: string): Obj[] => (Array.isArray(data[key]) ? (data[key] as unknown[]).filter(isObj) : []);

  // Display names: carried by the rows that already name the ids (never invented in a component).
  for (const row of rows("deployments")) {
    const pf = typeof row.portfolio_id === "string" ? row.portfolio_id : "";
    if (pf in NAMES.portfolio) row.portfolio_name = NAMES.portfolio[pf as keyof typeof NAMES.portfolio];
    const dep = typeof row.deployment_id === "string" ? row.deployment_id : "";
    if (dep in NAMES.deployment) row.deployment_name = NAMES.deployment[dep as keyof typeof NAMES.deployment];
  }

  // Native custody: the newest broker report carries the venue's wallet balance; native equity is a typed absence on the sub
  // account (the venue did not report it) and a value on the main one.
  const sync = rows("broker_sync").filter((row) => typeof row.synced_at_ms === "number");
  const newest = sync.sort((a, b) => (b.synced_at_ms as number) - (a.synced_at_ms as number))[0];
  if (newest) {
    if (accountId === "acc_bnc_core") {
      newest.wallet_balance = WALLET_BALANCE_CORE;
      newest.native_equity = NATIVE_EQUITY_CORE;
    } else if (accountId === "acc_bnc_sub") {
      newest.wallet_balance = "118050.00";
    }
  }

  // PM capital: one published allocation row carries its budget and exposure. Gross = long + short, one currency.
  for (const row of rows("portfolio_allocations")) {
    const dep = typeof row.deployment_id === "string" ? row.deployment_id : "";
    if (dep === "dep_btc_live" && row.currency === "USDT") {
      row.portfolio_name = NAMES.portfolio.pf_core;
      row.strategy_name = NAMES.strategy.btc_trend;
      row.deployment_name = NAMES.deployment.dep_btc_live;
      row.budget_used = row.allocated_capital;
      row.budget_approved = "100000.00";
      row.exposure_long = "61300.00";
      row.exposure_short = "35100.00";
      row.exposure_gross = addCents("61300.00", "35100.00");
    }
  }
  overlayAccountF2(data, accountId); // WP-F2 (one call line)
  return out;
}

// ===== WP-F2 begin: Account 360 identity, margin ratio and sleeve portfolio names (FIXTURE_LAB; register 2f2) =====
const PORTFOLIO_NAMES_F2: Readonly<Record<string, string>> = { pf_satellite: "Satellite", pf_canary: "Canary" };

/**
 * The account row states its `product`, `network` and the instant that network was proven (two minutes before the newest venue report);
 * the account-level margin row states a `margin_ratio` in percent (maintenance over equity as the venue reports it: 5.10 on the core
 * account, a fixed value, never computed by a component); sleeve deployments name their portfolio. Open keys on open rows only.
 */
function overlayAccountF2(data: Obj, accountId: string): void {
  const rows = (key: string): Obj[] => (Array.isArray(data[key]) ? (data[key] as unknown[]).filter(isObj) : []);
  const newest = rows("broker_sync").filter((row) => typeof row.synced_at_ms === "number").sort((a, b) => (b.synced_at_ms as number) - (a.synced_at_ms as number))[0];
  for (const account of rows("accounts")) {
    if (account.venue === "BINANCE") account.product = "USDT-M futures · hedge";
    else if (typeof account.venue === "string") account.product = "Perpetual swap · net";
    account.network = "MAINNET";
    if (newest) account.network_proof_at_ms = (newest.synced_at_ms as number) - 120_000;
  }
  // The sync history states which check each sync was and how long it took (open keys on the broker sync rows).
  const checks = ["BALANCE", "POSITIONS", "OPEN_ORDERS"] as const;
  const durations = [1200, 800, 600, 1100, 840_000, 2400, 900];
  rows("broker_sync").forEach((row, index) => {
    row.check = checks[index % checks.length];
    row.duration_ms = durations[index % durations.length];
  });
  for (const margin of rows("margin_balances")) {
    if (margin.account_id === accountId && margin.currency === "USDT" && margin.instrument_id === undefined) margin.margin_ratio = "5.10";
  }
  for (const row of rows("deployments")) {
    const pf = typeof row.portfolio_id === "string" ? row.portfolio_id : "";
    if (pf in PORTFOLIO_NAMES_F2) row.portfolio_name = PORTFOLIO_NAMES_F2[pf];
  }
}

/**
 * Account equity for the core sleeve: 90 daily observations ending on `lastT` at exactly 88200.00 (the account balance). A deterministic
 * walk in whole cents (integer LCG, no float) between about 87,000 and 88,600 with one dip, one published gap (null) at day 41, and the
 * series' own high and low inside the window; the drawdown series is derived from it by the existing overlay.
 */
function accountEquityPoints(lastT: number): [number, string | null][] {
  const days = 90;
  const out: [number, string | null][] = [];
  let seed = 20261023n;
  let walk = 0n;
  for (let k = 0; k < days; k += 1) {
    seed = (seed * 6364136223846793005n + 1442695040888963407n) % (1n << 63n);
    const noise = ((seed >> 33n) % 8001n) - 4000n; // +-40.00
    walk = (walk * 7n) / 10n + noise;
    let cents = 8_743_000n + (BigInt(k) * 77_000n) / 89n + walk; // a trend from about 87,430 to 88,200
    if (k >= 20 && k <= 26) cents -= BigInt(7 - Math.abs(k - 23) * 2) * 8_000n; // a dip of about 560.00 around day 23
    const t = lastT - (days - 1 - k) * 86_400_000;
    out.push([t, k === 41 ? null : decimalOf(cents, 2)]);
  }
  // Land on the account balance exactly at the last point.
  out[days - 1] = [lastT, "88200.00"];
  return out;
}
// ===== WP-F2 end =====

/* ── binding exposure (`/broker-bindings/{id}/exposure`) ─────────────────── */

/**
 * The shared binding's USDT headroom is its physical equity (the venue's native equity simulated on the account, never the wallet balance)
 * less the virtual sum (`used`), by integer arithmetic in one currency: 414010.40 - 197500.00 = 216510.40. Other bindings keep the double's own figures.
 */
function overlayExposure(body: Obj): Obj {
  const out = clone(body);
  const analytics = out.analytics;
  if (!isObj(analytics) || !isObj(analytics.data) || !Array.isArray(analytics.data.buckets)) return out;
  for (const bucket of analytics.data.buckets) {
    if (isObj(bucket) && bucket.currency === "USDT" && typeof bucket.used === "string") {
      const cents = (text: string) => BigInt(text.replace(".", ""));
      const left = cents(NATIVE_EQUITY_CORE) - cents(bucket.used);
      const negative = left < 0n;
      const abs = negative ? -left : left;
      bucket.headroom = `${negative ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
    }
  }
  return out;
}

/* ── equity chart: the drawdown series ──────────────────────────────────── */

/**
 * Derives the `drawdown` series from the published equity points of the same body: a ratio of each point to the running peak,
 * six places truncated, currency null (a ratio). A null point stays a null point (a gap). The equity series itself gets one dip so
 * the drawdown is not flat; the final point stays the account's balance.
 */
function overlayChart(body: Obj, metric: string): Obj {
  const out = clone(body);
  const panel = out.panel;
  if (!isObj(panel) || !isObj(panel.data) || !Array.isArray(panel.data.series) || panel.data.series.length === 0) return out;
  const series = panel.data.series[0];
  if (!isObj(series) || !Array.isArray(series.points)) return out;
  let points = series.points as [number, string | null][];
  if (points.length >= 5) {
    points = accountEquityPoints(points[points.length - 1]![0]); // WP-F2: a 90-day daily series ending on the double's own last instant
    series.points = points;
  }
  if (metric !== "drawdown") return out;
  let peak: string | null = null;
  const drawdown = points.map(([t, v]): [number, string | null] => {
    if (v === null) return [t, null];
    if (peak === null || BigInt(v.replace(".", "")) > BigInt(peak.replace(".", ""))) peak = v;
    return [t, ratio6(v, peak)];
  });
  out.metric = "drawdown";
  series.points = drawdown;
  series.currency = null;
  series.id = String(series.id).replace(/equity$/, "drawdown");
  series.label = String(series.label).replace(/equity$/, "drawdown");
  return out;
}

/* ── blotter (`/screens/blotter`) ───────────────────────────────────────── */

// ===== WP-F2 begin: blotter order rows (FIXTURE_LAB; register 2f2) =====
/**
 * Every order row carries what the design's table shows. Rules (integer arithmetic on the page's own published fills, one currency):
 *  - `deployment_id`: by alpha (btc adaptive -> dep_btc_paper, carry -> dep_carry_paper, grid -> dep_grid_paper: the read is the paper environment, so are its deployments); the venue is the row's own.
 *  - `filled_quantity`: the exact sum of the order's fills on the page; "0" (a true zero) for an order that traded nothing; a canceled order
 *    in five leaves it out (the typed absence stays testable).
 *  - `average_fill_price`: the quantity-weighted fill price truncated to the fills' price places (toward zero); absent without fills.
 *  - `fee` + `fee_currency`: the sum of the fills' commissions (one currency per order: the first fill's). A fill without a
 *    commission leaves the order without a fee: absent, never defaulted to 0 and never converted.
 */
const DEPLOYMENT_OF_ALPHA: Readonly<Record<string, string>> = {
  adaptive_hma_cpp_00115m: "dep_btc_paper",
  carry_basis_v3: "dep_carry_paper",
  grid_mean_v1: "dep_grid_paper",
};

const placesOf = (text: string): number => (text.split(".")[1] ?? "").length;
const unitsOf = (text: string, places: number): bigint => {
  const [whole = "0", frac = ""] = text.split(".");
  return BigInt(`${whole}${frac.padEnd(places, "0")}`);
};

/** The legacy double returns at most this many fills beside a page of orders, whatever the page holds. */
const BLOTTER_FILLS_CAP = 100;

let mixedFeeCurrencies = typeof process !== "undefined" && process.env?.FIXTURE_BLOTTER_MIXED_FEES === "1"; // opt-in: FIXTURE_BLOTTER_MIXED_FEES=1
/**
 * Opt-in FIXTURE_LAB variant (default off): fills keep the commission currency the double gave them, so an order whose fills settle in
 * two currencies (USDT and BNB) is served, and it has NO fee (typed absent, never converted, never summed across currencies).
 */
export function setSimulatedMixedFeeCurrencies(on: boolean): void {
  mixedFeeCurrencies = on;
}

function overlayBlotter(body: Obj): Obj {
  const out = clone(body);
  const data = out.data;
  if (!isObj(data) || !Array.isArray(data.orders)) return out;
  const fills = (Array.isArray(data.fills) ? data.fills : []).filter(isObj);
  // The fills of one order settle their fee in one currency (the first fill's), so the order's fee is one exact sum. A fill whose
  // commission the source did not publish stays null and still leaves the order without a fee.
  const feeCurrencyOf = new Map<unknown, unknown>();
  for (const fill of mixedFeeCurrencies ? [] : fills) {
    if (!feeCurrencyOf.has(fill.client_order_id)) feeCurrencyOf.set(fill.client_order_id, fill.commission_currency);
    fill.commission_currency = feeCurrencyOf.get(fill.client_order_id);
  }
  // A page that holds as many fills as the cap may have lost some: the order that owns the last fill, and every traded order after it,
  // cannot be summed from this page. They get no filled quantity, average price or fee (typed absence), never a total from a partial
  // fill population and never a false zero.
  const orders = data.orders as unknown[];
  const traded = (order: Obj) => order.status === "FILLED" || order.status === "PARTIALLY_FILLED";
  let unsafeFrom = Infinity;
  if (fills.length >= BLOTTER_FILLS_CAP) {
    orders.forEach((order, index) => {
      if (isObj(order) && fills.some((fill) => fill.client_order_id === order.client_order_id)) unsafeFrom = index;
    });
  }
  for (const [index, order] of orders.entries()) {
    if (!isObj(order)) continue;
    if (index >= unsafeFrom && traded(order)) {
      const alphaOf = typeof order.strategy_id === "string" ? order.strategy_id : "";
      if (alphaOf in DEPLOYMENT_OF_ALPHA) order.deployment_id = DEPLOYMENT_OF_ALPHA[alphaOf];
      continue;
    }
    const alpha = typeof order.strategy_id === "string" ? order.strategy_id : "";
    if (alpha in DEPLOYMENT_OF_ALPHA) order.deployment_id = DEPLOYMENT_OF_ALPHA[alpha];
    const mine = fills.filter((fill) => typeof fill.client_order_id === "string" && fill.client_order_id === order.client_order_id);
    const orderId = typeof order.order_id === "string" ? order.order_id : "";
    // A traded order always states what was filled; a typed absence stays on a canceled order in five (what filled before the cancel is unknown).
    if (!(order.status === "CANCELED" && hashOf(orderId) % 5 === 0)) {
      if (mine.length === 0) order.filled_quantity = "0";
      else {
        const qPlaces = Math.max(...mine.map((fill) => placesOf(String(fill.quantity))));
        order.filled_quantity = decimalOf(mine.reduce((sum, fill) => sum + unitsOf(String(fill.quantity), qPlaces), 0n), qPlaces);
      }
    }
    if (mine.length === 0) continue;
    const qPlaces = Math.max(...mine.map((fill) => placesOf(String(fill.quantity))));
    const pPlaces = Math.max(...mine.map((fill) => placesOf(String(fill.price))));
    let notional = 0n;
    let quantity = 0n;
    for (const fill of mine) {
      const q = unitsOf(String(fill.quantity), qPlaces);
      notional += unitsOf(String(fill.price), pPlaces) * q;
      quantity += q;
    }
    if (quantity > 0n) order.average_fill_price = decimalOf(notional / quantity, pPlaces);
    const currencies = new Set(mine.map((fill) => fill.commission_currency));
    if (mine.every((fill) => typeof fill.commission === "string") && currencies.size === 1 && typeof [...currencies][0] === "string") {
      const cPlaces = Math.max(...mine.map((fill) => placesOf(String(fill.commission))));
      order.fee = decimalOf(mine.reduce((sum, fill) => sum + unitsOf(String(fill.commission), cPlaces), 0n), cPlaces);
      order.fee_currency = [...currencies][0];
    }
  }
  return out;
}
// ===== WP-F2 end =====

/* ── bindings list (`/broker-bindings`): list figures and counts (FE-CAT-4) ── */

/**
 * The bindings list publishes the per-row figures and the per-environment counts the Accounts list would otherwise read per row.
 * Rows without an entry here are served without `figures` (the producer has no owning source for them), so the list keeps its
 * capped two-read fallback for them: `okx_main@OKX` and every generated or non-live binding stay on it on purpose.
 * Every figure is one currency; nothing is summed or converted.
 *  - bnc_main: native equity 414010.40 USDT, a different figure from the 412880.25 wallet balance on the account resource.
 *    Virtual is mixed-currency (USDC and USDT, the exposure double's own buckets); 3 sleeves, only 2 of them in the population.
 *  - bnc_sub: the venue reported no native equity (typed null) although it reports a wallet balance; a USDT virtual sum.
 * Observation times are the list's own `source_as_of`.
 */
const LIST_FIGURES: Readonly<Record<string, (at: string) => Obj>> = {
  "bnc_main@BINANCE": (at) => ({
    native_equity: [{ currency: "USDT", value: "414010.40", observed_at: at, coverage: "COMPLETE" }],
    virtual_used: [
      { currency: "USDC", value: "10000.00", observed_at: at, coverage: "COMPLETE" },
      { currency: "USDT", value: "197500.00", observed_at: at, coverage: "COMPLETE" },
    ],
    virtual_headroom: [
      { currency: "USDC", value: "2000.00", observed_at: at, coverage: "COMPLETE" },
      { currency: "USDT", value: "216510.40", observed_at: at, coverage: "COMPLETE" },
    ],
    sleeve_count: { count: 3, observed_at: at, coverage: "PARTIAL" },
  }),
  "bnc_sub@BINANCE": (at) => ({
    native_equity: null,
    virtual_used: [{ currency: "USDT", value: "10.00", observed_at: at, coverage: "COMPLETE" }],
    virtual_headroom: [{ currency: "USDT", value: "90.00", observed_at: at, coverage: "COMPLETE" }],
    sleeve_count: { count: 1, observed_at: at, coverage: "COMPLETE" },
  }),
};

// ===== WP-F2 begin: generated bindings' list figures (FE-CAT-4 lane, FIXTURE_LAB; register 2f2) =====
/** FNV-1a of the binding id: the case and the figures are stable per binding, the same on every read. */
function hashOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/** Exact decimal text of an integer count of 10^-places units (bigint only, no float). */
function decimalOf(units: bigint, places: number): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const base = 10n ** BigInt(places);
  const frac = (abs % base).toString().padStart(places, "0");
  return `${negative ? "-" : ""}${abs / base}${places > 0 ? `.${frac}` : ""}`;
}

type Coverage = "COMPLETE" | "PARTIAL";
const amount = (currency: string, value: string, at: string, coverage: Coverage = "COMPLETE"): Obj => ({ currency, value, observed_at: at, coverage });

/**
 * Figures of one generated binding. Cases by hash (stable per id): 1 in 16 publishes none (the capped two-read fallback, a dedicated
 * case), 1 in 16 reports no native equity (typed null), 2 in 16 are mixed-currency (a second USDC line), 1 in 16 is over its physical
 * equity (negative headroom, Check EXCEEDED), 1 in 16 is PARTIAL coverage, 1 in 16 uses nothing (a true "0.00"), the rest are within.
 * Headroom = native equity less used in the equity currency (integer arithmetic; the source's number in the real lane).
 * DERIBIT books BTC at four places, every other venue USDT at two. Nothing is summed across currencies.
 */
function generatedFigures(bindingId: string, at: string): Obj | null {
  const h = hashOf(bindingId);
  const kind = h % 16;
  if (kind === 0) return null;
  const venue = bindingId.split("@")[1] ?? "";
  const [currency, places] = venue === "DERIBIT" ? (["BTC", 4] as const) : (["USDT", 2] as const);
  const scale = 10n ** BigInt(places);
  const equity = BigInt(40_000 + ((h >>> 4) % 900_000)) * scale; // 40,000 to 939,999 whole units
  const pct = BigInt(18 + ((h >>> 11) % 62)); // 18..79 percent used
  let used = (equity * pct) / 100n;
  if (kind === 4) used = equity + (equity * BigInt(3 + ((h >>> 7) % 20))) / 100n; // over physical
  if (kind === 5) used = 0n;
  const coverage: Coverage = kind === 6 ? "PARTIAL" : "COMPLETE";
  const out: Obj = {
    native_equity: kind === 1 ? null : [amount(currency, decimalOf(equity, places), at, coverage)],
    virtual_used: [amount(currency, decimalOf(used, places), at, coverage)],
    virtual_headroom: [amount(currency, decimalOf(equity - used, places), at, coverage)],
    sleeve_count: { count: 1 + ((h >>> 3) % 4), observed_at: at, coverage },
  };
  if (kind === 2 || kind === 3) {
    const usdc = BigInt(2_000 + ((h >>> 9) % 20_000)) * 100n;
    (out.virtual_used as Obj[]).unshift(amount("USDC", decimalOf(usdc, 2), at));
    (out.virtual_headroom as Obj[]).unshift(amount("USDC", decimalOf(usdc / 5n, 2), at));
  }
  return out;
}
// ===== WP-F2 end =====

/** The double's five native bindings: environment, state, credential state. Generated bindings (scale lane) are added at serve time. */
const NATIVE_BINDINGS: readonly (readonly [string, string, string])[] = [
  ["live", "ACTIVE", "SYNC_SYNCED"], ["live", "ACTIVE", "SYNC_STALE"], ["live", "ACTIVE", "EXPIRED"],
  ["paper", "ACTIVE", "SYNC_SYNCED"], ["sandbox", "SUSPENDED", "NOT_PUBLISHED"],
];

/**
 * Per-environment counts over every binding the double holds (all of them are visible to the fixture principal, so authorization
 * removes none). `issues` uses the Accounts list's own rule: a state or credential word the source calls wrong.
 */
function listCounts(at: string): Obj {
  const all = [...NATIVE_BINDINGS, ...scaled().bindings.map((b) => [b.environment, b.state, b.credentialState] as const)];
  const byEnvironment = { paper: 0, sandbox: 0, live: 0 } as Record<string, number>;
  let issues = 0;
  for (const [environment, state, credential] of all) {
    byEnvironment[environment]! += 1;
    if (stateView(state).issue || credentialView(credential).issue) issues += 1;
  }
  return { basis: "AUTHORIZED_SNAPSHOT", observed_at: at, coverage: "COMPLETE", all: all.length, issues, by_environment: byEnvironment };
}

function overlayBindingsList(body: Obj): Obj {
  const out = clone(body);
  const page = out.page;
  if (!isObj(page) || !Array.isArray(page.rows)) return out;
  const at = typeof out.source_as_of === "string" ? out.source_as_of : null;
  if (at === null) return out; // no observation instant to state: publish nothing rather than invent one
  for (const row of page.rows) {
    const figures = isObj(row) && typeof row.binding_id === "string" ? LIST_FIGURES[row.binding_id] : undefined;
    if (isObj(row) && figures) row.figures = figures(at);
    // WP-F2: every generated binding publishes figures except its dedicated fallback-only case.
    else if (isObj(row) && typeof row.binding_id === "string" && row.binding_id.startsWith("bnd_")) {
      const generated = generatedFigures(row.binding_id, at);
      if (generated !== null) row.figures = generated;
    }
  }
  out.counts = listCounts(at);
  return out;
}

// ===== WP-E begin: Admin Actions, local reads connected (SIMULATED, FIXTURE_LAB; register 2d)
/**
 * The design's Read group has six reads that run here, one that is not offered. The published task catalogue classifies five of
 * them SEMANTICALLY_INCOMPATIBLE and `health` SUPPORTED_BUT_INACTIVE, so on the simulated lanes only, those six READ_INSPECT tasks
 * (never `redis-inspect`, whose Redis access is forbidden) are served CONNECTED, as local projection reads. The relay stays off and
 * every other task keeps its published state. Switch off: the lane is not simulated.
 */
export const SIMULATED_CONNECTED_READS = ["health", "inspect", "capital", "performance", "sizing", "broker-read"] as const;

export function overlayAdminTasks(body: Obj): Obj {
  const out = clone(body);
  if (!Array.isArray(out.tasks)) return out;
  const counts = isObj(out.classification_counts) ? { ...out.classification_counts } as Record<string, number> : null;
  for (const task of out.tasks) {
    if (!isObj(task) || typeof task.task_id !== "string" || !(SIMULATED_CONNECTED_READS as readonly string[]).includes(task.task_id) || task.state === "CONNECTED") continue;
    if (counts !== null && typeof task.state === "string") {
      counts[task.state] = Math.max(0, (counts[task.state] ?? 0) - 1);
      counts.CONNECTED = (counts.CONNECTED ?? 0) + 1;
    }
    task.state = "CONNECTED";
    task.reason_code = null;
    task.unlisted_reason = null;
  }
  if (counts !== null) out.classification_counts = counts;
  return out;
}

/**
 * Approvals, "Decided today" (SIMULATED, FIXTURE_LAB; register 2d): two decisions made 25 and 70 minutes before the fixture clock, ahead of the
 * canonical history row, so the cockpit's disclosure has something to count. Same route, same `governance.approval-history.v1` row shape;
 * the instants follow the fixture clock (and the preview's time rebase), so they are "today" whenever the page is read at the fixture's time.
 */
export const SIMULATED_DECISIONS_TODAY: readonly { id: string; approval: string; gate: string; subject: string; outcome: string; by: string; minutesAgo: number }[] = [
  { id: "dec_fx_today_1", approval: "AP-198", gate: "R1", subject: "RSI v0.9", outcome: "APPROVED", by: "minh", minutesAgo: 25 },
  { id: "dec_fx_today_2", approval: "AP-197", gate: "R1", subject: "Carry v3.1", outcome: "CHANGES_REQUESTED", by: "lan", minutesAgo: 70 },
];

export function overlayApprovalHistory(body: Obj, nowMs: number): Obj {
  const out = clone(body);
  const page = out.page;
  if (!isObj(page) || !Array.isArray(page.rows)) return out;
  const mine = SIMULATED_DECISIONS_TODAY.map((d) => ({
    id: d.id,
    approval_id: d.approval,
    gate: d.gate,
    subject_id: `subject_${d.approval.toLowerCase()}`,
    subject: d.subject,
    outcome: d.outcome,
    decided_by: { user_id: `usr_${d.by}`, username: d.by },
    decided_at: new Date(nowMs - d.minutesAgo * 60_000).toISOString(),
    policy_version: "approval.v3",
    evidence_digest: `sha256:${"b".repeat(64)}`,
    approval_version: 2,
  }));
  const have = new Set(page.rows.map((row) => (isObj(row) ? row.id : null)));
  const fresh = mine.filter((row) => !have.has(row.id));
  page.rows = [...fresh, ...page.rows];
  if (typeof page.total_count === "number") page.total_count += fresh.length;
  if (typeof page.filtered_count === "number") page.filtered_count += fresh.length;
  return out;
}

const RUN_RESULTS: Readonly<Record<string, Obj>> = {
  health: { services: [{ name: "projection", state: "OK" }, { name: "query", state: "OK" }, { name: "live updates", state: "STALE" }] },
  inspect: { subject: "alpha_btc_trend", mode: "paper", state: "ACTIVE", positions: 2, working_orders: 1 },
  capital: { portfolio: "pf_TEST_ONLY_core", rows: [{ at: "2026-10-12T09:30:00Z", movement: "TOP_UP", amount: "5000.00", currency: "USDT" }, { at: "2026-09-28T08:00:00Z", movement: "INITIAL_GRANT", amount: "50000.00", currency: "USDT" }] },
  performance: { subject: "pf_TEST_ONLY_core", basis: "USDT", nav: "412880.25", return_30d_pct: "3.2100" },
  sizing: { alpha: "alpha_btc_trend", symbol: "BTCUSDT", rows: [{ at: "2026-10-17T11:58:00Z", requested: "0.0400", sized: "0.0300", reason: "BUDGET_HEADROOM" }] },
  "broker-read": { account: "acc_bnc_core", venue: "BINANCE", bindings: 1, exposure_used: "197500.00", currency: "USDT" },
};

/** The `execution.command-run-result.v1` a simulated connected read answers (no source request; a digest of the fixture's own words). */
export function simulatedRunResult(taskId: string): Obj | null {
  const result = RUN_RESULTS[taskId];
  if (result === undefined) return null;
  const digest = createHash("sha256").update(`FIXTURE_LAB:${taskId}:${JSON.stringify(result)}`).digest("hex");
  return {
    schema_version: "execution.command-run-result.v1",
    task_id: taskId,
    classification: "CONNECTED",
    transport: "SGP_LOCAL_PROJECTION",
    source_request_sent: false,
    response_digest: `sha256:${digest}`,
    result: { ...result, provenance: "FIXTURE_LAB: synthetic local read, not source data" },
  };
}
// ===== WP-E end

/* ── entry ──────────────────────────────────────────────────────────────── */

export interface SimulatedAnswer {
  status: number;
  body: unknown;
  contentType?: string;
}

/** `path` is the request path with `/api/v1/execution` removed. Answers the same body, enriched, or the answer untouched. */
export function simulate<T extends SimulatedAnswer>(method: string, path: string, search: URLSearchParams, answer: T): T {
  if (method.toUpperCase() !== "GET" || answer.status !== 200 || !isObj(answer.body)) return answer;
  const seg = path.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  // ===== WP-F3 begin: Paper, Sandbox, Canary and Live answer a lit body (bffSimulatedStage.ts) =====
  const stage = simulateStage(path, answer.body);
  if (stage !== null) return { ...answer, body: stage };
  // ===== WP-F3 end =====
  if (seg[0] === "resources" && seg[1] === "accounts" && seg.length === 3) return { ...answer, body: overlayAccountResource(answer.body, seg[2]!) };
  if (path === "/views/equity-chart" && search.get("subject_kind") === "account" && search.get("subject_id") === "acc_bnc_core") {
    return { ...answer, body: overlayChart(answer.body, search.get("metric") ?? "equity") };
  }
  if (seg[0] === "broker-bindings" && seg[1] === "bnc_main@BINANCE" && seg[2] === "exposure" && seg.length === 3) return { ...answer, body: overlayExposure(answer.body) };
  if (path === "/screens/blotter") return { ...answer, body: overlayBlotter(answer.body) };
  if (path === "/broker-bindings") return { ...answer, body: overlayBindingsList(answer.body) };
  if (path === "/commands/tasks") return { ...answer, body: overlayAdminTasks(answer.body) }; // WP-E
  if (path === "/governance/approvals/history") return { ...answer, body: overlayApprovalHistory(answer.body, fixtureNowMs()) }; // WP-E
  return answer;
}
