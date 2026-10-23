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

import { credentialView, stateView } from "../src/execution/v2/screens/account/model";
import { scaled } from "./bffScale";

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
  return out;
}

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
  const points = series.points as [number, string | null][];
  if (points.length >= 5 && points[4]![1] !== null) points[4] = [points[4]![0], "87400.00"];
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

/** The order row carries its deployment, average fill price and fee (with the fee's own currency). */
function overlayBlotter(body: Obj): Obj {
  const out = clone(body);
  const data = out.data;
  if (!isObj(data) || !Array.isArray(data.orders)) return out;
  for (const order of data.orders) {
    if (!isObj(order) || order.status !== "FILLED") continue;
    order.deployment_id = "dep_btc_live";
    order.average_fill_price = "61250.40";
    order.fee = "12.35";
    order.fee_currency = "USDT";
  }
  return out;
}

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
  }
  out.counts = listCounts(at);
  return out;
}

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
  if (seg[0] === "resources" && seg[1] === "accounts" && seg.length === 3) return { ...answer, body: overlayAccountResource(answer.body, seg[2]!) };
  if (path === "/views/equity-chart" && search.get("subject_kind") === "account" && search.get("subject_id") === "acc_bnc_core") {
    return { ...answer, body: overlayChart(answer.body, search.get("metric") ?? "equity") };
  }
  if (seg[0] === "broker-bindings" && seg[1] === "bnc_main@BINANCE" && seg[2] === "exposure" && seg.length === 3) return { ...answer, body: overlayExposure(answer.body) };
  if (path === "/screens/blotter") return { ...answer, body: overlayBlotter(answer.body) };
  if (path === "/broker-bindings") return { ...answer, body: overlayBindingsList(answer.body) };
  return answer;
}
