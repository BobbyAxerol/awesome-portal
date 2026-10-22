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
      newest.native_equity = "414010.40";
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
 * The shared binding's USDT headroom is its physical equity (the wallet balance simulated on the account) less the virtual sum
 * (`used`), by integer arithmetic in one currency: 412880.25 - 197500.00 = 215380.25. Other bindings keep the double's own figures.
 */
function overlayExposure(body: Obj): Obj {
  const out = clone(body);
  const analytics = out.analytics;
  if (!isObj(analytics) || !isObj(analytics.data) || !Array.isArray(analytics.data.buckets)) return out;
  for (const bucket of analytics.data.buckets) {
    if (isObj(bucket) && bucket.currency === "USDT" && typeof bucket.used === "string") {
      const cents = (text: string) => BigInt(text.replace(".", ""));
      const left = cents(WALLET_BALANCE_CORE) - cents(bucket.used);
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
  return answer;
}
