/**
 * Accounts and Account 360 reads for the e2e BFF double (UXM-07 package 3,
 * flag key `account`).
 *
 * `answerAccount(method, pathname, search)` serves a SPARSE-REALISTIC profile
 * for the reads the two screens make, and answers `null` for anything else so
 * the caller falls through. Wiring (the primary owns `answerExecutionBff`):
 * call it first, for GET requests, and fall through when it answers `null`:
 *
 *   const account = answerAccount(method, path, search);   // `/api/v1/execution` may be present or stripped
 *   if (account !== null) return account;
 *
 * Built from the canonical contract fixtures
 * (`execution-bindings-list`, `execution-binding-detail`,
 * `execution-analytics.binding-exposure`, `execution-account-broker-360.ready`)
 * plus synthetic rows. The physical broker reference is STRIPPED from every
 * account body, like `bffDouble.ts` does: the canonical fixture carries
 * `external_account_ref` and the screens must never show it.
 *
 * Bindings (one environment per read, as `execution.bindings-list.v1` types it):
 *   live     bnc_main@BINANCE  acc_bnc_core   SYNC_SYNCED  ok credential, shared by 3 sleeves
 *            bnc_sub@BINANCE   acc_bnc_sub    SYNC_STALE   stale sync
 *            okx_main@OKX      acc_okx_main   EXPIRED      bad credential
 *   paper    pap_sim@BINANCE   acc_pap_sim    SYNC_SYNCED
 *   sandbox  tn_bnc@BINANCE    acc_tn_bnc     NOT_PUBLISHED, state SUSPENDED
 * `limit` pages the list by keyset (`next_cursor`), so `limit=2` on live shows a
 * second page. A cursor from another filter is 409 `BINDINGS_READ_CHANGED`; a
 * bad `environment` is 400.
 *
 * Accounts (`/resources/accounts/{id}`):
 *   acc_bnc_core   SHARED account, 3 sleeves (acc_bnc_core, acc_bnc_sat,
 *                  acc_bnc_can) on bnc_main@BINANCE; two currencies (USDT, USDC);
 *                  margin PRESENT; differences ABSENT (not computed, shared);
 *                  state `stale`, freshness STALE, read 14 minutes after the
 *                  source; broker_sync history of 6 rows with a GAP (a row with
 *                  no time, and a six hour hole); 2 positions (one long, one short)
 *   acc_bnc_sub    differences PRESENT (delta 0.20, in_sync false); margin ABSENT
 *                  (capability UNAVAILABLE, MARGIN_SOURCE_GAP); credential stale
 *   acc_okx_main   state `partial`; broker sync UNAVAILABLE; credential EXPIRED;
 *                  exposure headroom BREACHED
 *   acc_pap_sim    paper, ready, sparse (no positions, no allocations)
 *   acc_tn_bnc     sandbox, `empty` resource
 *   acc_err        503 ACCOUNT_RESOURCE_UNAVAILABLE (the error case)
 * Orders and fills (`/resources/accounts/{id}/orders|fills`): three order rows
 * for acc_bnc_core, paged by `limit` and `after`; `acc_pap_sim` has none.
 * Equity chart (`/views/equity-chart?subject_kind=account`): a USDT series
 * with a gap for acc_bnc_core, an EMPTY panel for the rest.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { scopedResourceV2 } from "./bffDoubleScopedResource";
import { addDecimal, scaled, sumByCurrency } from "./bffScale";
import { isPositiveMode, positiveBookOf } from "./bffPositiveMode";
import { accountFact, ledgerSeries } from "./bffWorld";

export interface BffAnswerAccount {
  status: number;
  body: unknown;
  contentType?: string;
}

const CONTRACTS = join(dirname(fileURLToPath(import.meta.url)), "../../../../packages/contracts/fixtures");
const canonical = (name: string): Record<string, unknown> => JSON.parse(readFileSync(join(CONTRACTS, name), "utf8")) as Record<string, unknown>;
const BINDINGS_LIST = canonical("execution-bindings-list.valid.json");
const BINDING_DETAIL = canonical("execution-binding-detail.valid.json");
const BINDING_EXPOSURE = canonical("execution-analytics.binding-exposure.valid.json");
const ACCOUNT_READY = canonical("execution-account-broker-360.ready.valid.json");

/** The instant the source published; reads happen 14 minutes later. */
export const ACCOUNT_DOUBLE_AS_OF = "2026-10-17T09:00:00.000Z";
export const ACCOUNT_DOUBLE_READ_AT = "2026-10-17T09:14:00.000Z";
const AS_OF_MS = Date.parse(ACCOUNT_DOUBLE_AS_OF);
const READ_AT_MS = Date.parse(ACCOUNT_DOUBLE_READ_AT);
const iso = (ms: number): string => new Date(ms).toISOString();
const minutesBefore = (minutes: number): number => AS_OF_MS - minutes * 60_000;

type Environment = "paper" | "sandbox" | "live";
const ENVIRONMENTS: readonly Environment[] = ["paper", "sandbox", "live"];
const PROFILE: Readonly<Record<Environment, string>> = {
  paper: "PAPER_BINANCE_USDM",
  sandbox: "SANDBOX_BINANCE_USDM",
  live: "LIVE_BINANCE_USDM",
};

function problem(status: number, code: string, message: string): BffAnswerAccount {
  return { status, body: { error: { code, message } } };
}

/* ── bindings ───────────────────────────────────────────────────────────── */

interface BindingSpec {
  bindingId: string;
  accountId: string;
  venue: string;
  state: string;
  credentialState: string;
  updatedAt: string;
  environment: Environment;
}

const BINDINGS: readonly BindingSpec[] = [
  { bindingId: "bnc_main@BINANCE", accountId: "acc_bnc_core", venue: "BINANCE", state: "ACTIVE", credentialState: "SYNC_SYNCED", updatedAt: "2026-10-17T09:00:00.000Z", environment: "live" },
  { bindingId: "bnc_sub@BINANCE", accountId: "acc_bnc_sub", venue: "BINANCE", state: "ACTIVE", credentialState: "SYNC_STALE", updatedAt: "2026-10-17T06:10:00.000Z", environment: "live" },
  { bindingId: "okx_main@OKX", accountId: "acc_okx_main", venue: "OKX", state: "ACTIVE", credentialState: "EXPIRED", updatedAt: "2026-10-16T21:30:00.000Z", environment: "live" },
  { bindingId: "pap_sim@BINANCE", accountId: "acc_pap_sim", venue: "BINANCE", state: "ACTIVE", credentialState: "SYNC_SYNCED", updatedAt: "2026-10-17T08:57:00.000Z", environment: "paper" },
  { bindingId: "tn_bnc@BINANCE", accountId: "acc_tn_bnc", venue: "BINANCE", state: "SUSPENDED", credentialState: "NOT_PUBLISHED", updatedAt: "2026-10-15T12:00:00.000Z", environment: "sandbox" },
];

/** The five bindings the double holds, plus the generated ones (empty unless the standalone server runs at a larger scale). */
const allBindings = (): readonly BindingSpec[] => {
  if (isPositiveMode()) return [...BINDINGS, ...scaled().bindings].map((b) => ({ ...b, state: "ACTIVE", credentialState: "SYNC_SYNCED" })); // WP-P: no stale, expired or suspended binding in the positive world
  const extra = scaled().bindings;
  return extra.length === 0 ? BINDINGS : [...BINDINGS, ...extra];
};

const bindingItem = (b: BindingSpec) => ({
  binding_id: b.bindingId,
  account_id: b.accountId,
  venue: b.venue,
  state: b.state,
  credential_state: b.credentialState,
  updated_at: b.updatedAt,
});

function envelopeBase(environment: Environment): Record<string, unknown> {
  const base = { ...BINDINGS_LIST };
  delete base.page;
  return {
    ...base,
    delivery_profile: PROFILE[environment],
    environment,
    read_at: ACCOUNT_DOUBLE_READ_AT,
    source_as_of: ACCOUNT_DOUBLE_AS_OF,
    freshness: environment === "live" && !isPositiveMode() ? "AGING" : "FRESH",
  };
}

const cursorFor = (filter: string, index: number): string => `bnd1.${Buffer.from(`${filter}|${index}`, "utf8").toString("base64url")}`;
function readCursor(raw: string): { filter: string; index: number } | null {
  if (!raw.startsWith("bnd1.")) return null;
  try {
    const [filter, index] = Buffer.from(raw.slice(5), "base64url").toString("utf8").split("|");
    const n = Number(index);
    return filter !== undefined && Number.isSafeInteger(n) && n >= 0 ? { filter, index: n } : null;
  } catch {
    return null;
  }
}

function bindingsList(search: URLSearchParams): BffAnswerAccount {
  const environment = search.get("environment") ?? "live";
  if (!(ENVIRONMENTS as readonly string[]).includes(environment)) {
    return problem(400, "BINDINGS_READ_INPUT_INVALID", "environment must be paper, sandbox or live");
  }
  const limitRaw = search.get("limit");
  const limit = limitRaw === null ? 50 : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return problem(400, "BINDINGS_READ_INPUT_INVALID", "limit must be 1 to 50");
  const query = (search.get("search") ?? "").trim().toLowerCase();
  const venue = search.get("venue") ?? "";
  const state = search.get("state") ?? "";
  const filter = [environment, query, venue, state].join("&");

  const scoped = allBindings().filter((b) => b.environment === environment);
  const matching = scoped
    .filter((b) => (query === "" || `${b.bindingId} ${b.accountId}`.toLowerCase().includes(query)) && (venue === "" || b.venue === venue) && (state === "" || b.state === state))
    // The contract's order: updated_at desc, then binding_id desc.
    .sort((a, b) => (a.updatedAt === b.updatedAt ? b.bindingId.localeCompare(a.bindingId) : b.updatedAt.localeCompare(a.updatedAt)));

  let start = 0;
  const after = search.get("after");
  if (after !== null) {
    const cursor = readCursor(after);
    if (cursor === null) return problem(400, "BINDINGS_READ_CURSOR_INVALID", "the cursor cannot be read");
    if (cursor.filter !== filter) return problem(409, "BINDINGS_READ_CHANGED", "the filters changed since the cursor was issued");
    start = cursor.index;
  }
  const rows = matching.slice(start, start + limit);
  const more = start + rows.length < matching.length;
  return {
    status: 200,
    body: {
      ...envelopeBase(environment as Environment),
      completeness: "COMPLETE",
      page: {
        rows: rows.map(bindingItem),
        total_count: scoped.length,
        filtered_count: matching.length,
        next_cursor: more ? cursorFor(filter, start + rows.length) : null,
        prev_cursor: start > 0 ? cursorFor(filter, Math.max(0, start - limit)) : null,
        has_more: more,
        has_previous: start > 0,
        applied_filters: [],
        applied_sort: [{ field: "updated_at", direction: "desc" }, { field: "binding_id", direction: "desc" }],
      },
    },
  };
}

function bindingDetail(id: string, search: URLSearchParams): BffAnswerAccount {
  const spec = allBindings().find((b) => b.bindingId === id);
  if (!spec) return problem(404, "BINDING_NOT_FOUND", `no binding ${id}`);
  const asked = search.get("environment");
  if (asked !== null && asked !== spec.environment) return problem(404, "BINDING_NOT_FOUND", `${id} is not in the ${asked} environment`);
  return {
    status: 200,
    body: {
      ...BINDING_DETAIL,
      delivery_profile: PROFILE[spec.environment],
      environment: spec.environment,
      read_at: ACCOUNT_DOUBLE_READ_AT,
      source_as_of: ACCOUNT_DOUBLE_AS_OF,
      freshness: spec.credentialState === "SYNC_STALE" ? "STALE" : "FRESH",
      item: bindingItem(spec),
    },
  };
}

function bindingExposure(id: string): BffAnswerAccount {
  const spec = allBindings().find((b) => b.bindingId === id);
  if (!spec) return problem(404, "BINDING_NOT_FOUND", `no binding ${id}`);
  const analytics = BINDING_EXPOSURE.analytics as Record<string, unknown>;
  const data = analytics.data as Record<string, unknown>;
  const shared = spec.bindingId === "bnc_main@BINANCE";
  const breached = spec.bindingId === "okx_main@OKX" && !isPositiveMode(); // WP-P
  const bucket = (currency: string, used: string, reserved: string, available: string, headroom: string) => ({
    currency,
    account_count: shared ? 2 : 1,
    used,
    reserved,
    available,
    headroom,
    oldest_source_as_of: ACCOUNT_DOUBLE_AS_OF,
    newest_source_as_of: ACCOUNT_DOUBLE_AS_OF,
  });
  const buckets = shared
    ? [bucket("USDT", "197500.00", "2000.00", "213380.25", "13880.25"), bucket("USDC", "10000.00", "0.00", "12000.00", "2000.00")]
    : breached
      ? [bucket("USDT", "92400.00", "0.00", "85000.00", "-7400.00")]
      : [bucket("USDT", "10.00", "2.00", "88.00", "90.00")];
  return {
    status: 200,
    body: {
      ...BINDING_EXPOSURE,
      analytics: {
        ...analytics,
        data: {
          ...data,
          binding_id: spec.bindingId,
          // The shared binding publishes 2 of its 3 sleeves: a partial population.
          account_count: shared ? 2 : 1, // WP-P: the positive binding publishes the sleeves that hold a book (two)
          expected_account_count: shared ? (isPositiveMode() ? 2 : 3) : 1,
          population_completeness: shared && !isPositiveMode() ? "PARTIAL" : "COMPLETE",
          buckets,
        },
      },
    },
  };
}

/* ── accounts ───────────────────────────────────────────────────────────── */

type Row = Record<string, unknown>;

/** The physical reference never leaves the double, whatever the fixture carries. */
function withoutPhysicalBrokerRef<T extends Row>(row: T): T {
  const out: Row = { ...row };
  for (const key of Object.keys(out)) if (/external_account_ref|secret|credential_alias/i.test(key)) delete out[key];
  return out as T;
}

interface AccountSpec {
  id: string;
  environment: Environment;
  bindingId: string;
  label: string;
  state: "ready" | "stale" | "partial" | "empty";
  freshness: "FRESH" | "AGING" | "STALE";
  rows: Record<string, Row[]>;
  capabilities: { relation: string; state: "AVAILABLE" | "EMPTY" | "PARTIAL" | "UNAVAILABLE"; reason: string | null }[];
}

const cap = (relation: string, state: "AVAILABLE" | "EMPTY" | "PARTIAL" | "UNAVAILABLE" = "AVAILABLE", reason: string | null = null) => ({ relation, state, reason });

const balance = (accountId: string, currency: string, total: string, free: string, locked: string, at = AS_OF_MS): Row => ({
  account_id: accountId, currency, total, free, locked, updated_at: iso(at), updated_at_ms: at,
});
const margin = (accountId: string, currency: string, initial: string, maintenance: string): Row => ({
  account_id: accountId, currency, initial, maintenance, updated_at: ACCOUNT_DOUBLE_AS_OF, updated_at_ms: AS_OF_MS,
});

/** A sleeve's display label. The two named Binance sleeves keep the design's names; any other owner is named from its own id, never from a position (QA2 R4-03: a missing letter printed "undefined"). */
function sleeveLabel(owner: string, position: number): string {
  if (owner === "acc_bnc_core") return "Binance-02 sleeve";
  const letter = "bc"[position - 1];
  if (/^acc_bnc_/.test(owner) && letter !== undefined) return `Binance-02${letter} sleeve`;
  const words = owner.replace(/^acc_/, "").split("_").filter((w) => w !== "").map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return `${words.join(" ") || owner} sleeve`;
}

function sleeveRows(accountId: string, label: string, portfolio: string, deployment: string, bindingId: string): Record<string, Row[]> {
  return {
    accounts: [{ account_id: accountId, label, strategy_id: "btc_trend", mode: "live", venue: "BINANCE", base_currency: "USDT", account_type: "CROSS", state: "ACTIVE", external_account_ref: "external_1" }],
    deployments: [{ deployment_id: deployment, account_id: accountId, strategy_id: "btc_trend", portfolio_id: portfolio, mode: "live", venue: "BINANCE", state: "RUNNING" }],
    venue_accounts: [{ binding_id: bindingId, account_id: accountId, mode: "live", venue: "BINANCE", state: "ACTIVE" }],
  };
}

const CORE_SYNC: Row[] = [
  { sync_id: "bs_6", source: "BROKER", status: "SYNCED", currency: "USDT", buying_power: "301100.00", synced_at: iso(minutesBefore(0)), synced_at_ms: AS_OF_MS, external_account_ref: "external_1" },
  { sync_id: "bs_5", source: "BROKER", status: "PENDING", currency: "USDT", buying_power: "300980.40", synced_at: iso(minutesBefore(30)), synced_at_ms: minutesBefore(30) },
  { sync_id: "bs_4", source: "BROKER", status: "SYNCED", currency: "USDT", buying_power: "300112.10", synced_at: iso(minutesBefore(60)), synced_at_ms: minutesBefore(60) },
  // A six hour hole follows: the double publishes nothing between these rows.
  { sync_id: "bs_3", source: "BROKER", status: "STALE", currency: "USDT", buying_power: "298450.00", synced_at: iso(minutesBefore(420)), synced_at_ms: minutesBefore(420) },
  // A row whose time the source did not publish.
  { sync_id: "bs_2", source: "BROKER", status: "SYNCED", currency: "USDT", buying_power: null, synced_at: null },
  { sync_id: "bs_1", source: "BROKER", status: "FAILED", currency: "USDT", buying_power: null, synced_at: iso(minutesBefore(1500)), synced_at_ms: minutesBefore(1500) },
];

const ACCOUNTS: readonly AccountSpec[] = [
  {
    id: "acc_bnc_core",
    environment: "live",
    bindingId: "bnc_main@BINANCE",
    label: "Binance-02 sleeve",
    state: "stale",
    freshness: "STALE",
    rows: {
      ...sleeveRows("acc_bnc_core", "Binance-02 sleeve", "pf_core", "dep_btc_live", "bnc_main@BINANCE"),
      // The two sibling sleeves on the same binding: their identity and deployments are published too.
      accounts: [
        ...sleeveRows("acc_bnc_core", "Binance-02 sleeve", "pf_core", "dep_btc_live", "bnc_main@BINANCE").accounts!,
        { account_id: "acc_bnc_sat", label: "Binance-02b sleeve", strategy_id: "eth_carry", mode: "live", venue: "BINANCE", base_currency: "USDT", account_type: "CROSS", state: "ACTIVE" },
        { account_id: "acc_bnc_can", label: "Binance-02c sleeve", strategy_id: "eth_carry", mode: "live", venue: "BINANCE", base_currency: "USDT", account_type: "CROSS", state: "ACTIVE" },
      ],
      deployments: [
        { deployment_id: "dep_btc_live", account_id: "acc_bnc_core", strategy_id: "btc_trend", portfolio_id: "pf_core", mode: "live", venue: "BINANCE", state: "RUNNING" },
        { deployment_id: "dep_eth_sat", account_id: "acc_bnc_sat", strategy_id: "eth_carry", portfolio_id: "pf_satellite", mode: "live", venue: "BINANCE", state: "RUNNING" },
        { deployment_id: "dep_btc_can", account_id: "acc_bnc_can", strategy_id: "eth_carry", portfolio_id: "pf_canary", mode: "live", venue: "BINANCE", state: "RUNNING" },
      ],
      venue_accounts: [
        { binding_id: "bnc_main@BINANCE", account_id: "acc_bnc_core", mode: "live", venue: "BINANCE", state: "ACTIVE" },
        { binding_id: "bnc_main@BINANCE", account_id: "acc_bnc_sat", mode: "live", venue: "BINANCE", state: "ACTIVE" },
        { binding_id: "bnc_main@BINANCE", account_id: "acc_bnc_can", mode: "live", venue: "BINANCE", state: "ACTIVE" },
      ],
      account_balances: [
        balance("acc_bnc_core", "USDT", "88200.00", "80000.00", "8200.00"),
        balance("acc_bnc_core", "USDC", "5000.00", "5000.00", "0.00"),
        balance("acc_bnc_sat", "USDT", "61400.00", "60000.00", "1400.00"),
        balance("acc_bnc_can", "USDT", "47900.00", "47900.00", "0.00"),
      ],
      margin_balances: [margin("acc_bnc_core", "USDT", "4100.00", "2050.00")],
      broker_sync: CORE_SYNC,
      account_sync: [{ sync_id: "as_1", account_id: "acc_bnc_core", source: "EXECUTION", status: "SYNCED", synced_at: ACCOUNT_DOUBLE_AS_OF, synced_at_ms: AS_OF_MS }],
      exposure_headroom: [{ currency: "USDT", free: "80000.00", maintenance: "2050.00", headroom: "77950.00", verdict: "AVAILABLE" }],
      positions: [
        { position_id: "pos_btc", account_id: "acc_bnc_core", instrument_id: "BTCUSDT", side: "LONG", signed_qty: "0.90", quantity: "0.90", notional: "61300.00", unrealized_pnl: "700.00", currency: "USDT", updated_at: ACCOUNT_DOUBLE_AS_OF },
        { position_id: "pos_eth", account_id: "acc_bnc_core", instrument_id: "ETHUSDT", side: "SHORT", signed_qty: "-12.5", quantity: "12.5", notional: "35100.00", unrealized_pnl: "-120.50", currency: "USDT", updated_at: ACCOUNT_DOUBLE_AS_OF },
      ],
      portfolio_allocations: [{ portfolio_id: "pf_core", strategy_id: "btc_trend", deployment_id: "dep_btc_live", account_id: "acc_bnc_core", mode: "live", currency: "USDT", allocated_capital: "80000.00" }],
      account_equity: [{ account_id: "acc_bnc_core", currency: "USDT", unrealized_pnl: "579.50", fee_total: "388.20", funding_pnl: "224.20", ts: ACCOUNT_DOUBLE_AS_OF, ts_ms: AS_OF_MS }],
      // `differences` is absent on purpose: the binding is shared, so no matching-scope difference exists.
    },
    capabilities: [cap("accounts"), cap("account_balances"), cap("margin_balances"), cap("broker_account_sync_effective"), cap("positions"), cap("exposure_headroom")],
  },
  {
    id: "acc_bnc_sub",
    environment: "live",
    bindingId: "bnc_sub@BINANCE",
    label: "Binance sub account",
    state: "ready",
    freshness: "AGING",
    rows: {
      ...sleeveRows("acc_bnc_sub", "Binance sub account", "pf_satellite", "dep_eth_live", "bnc_sub@BINANCE"),
      account_balances: [balance("acc_bnc_sub", "USDT", "120000.00", "118000.00", "2000.00", minutesBefore(180))],
      broker_sync: [
        { sync_id: "bs_s2", source: "BROKER", status: "STALE", currency: "USDT", buying_power: "117800.00", synced_at: iso(minutesBefore(180)), synced_at_ms: minutesBefore(180) },
        { sync_id: "bs_s1", source: "BROKER", status: "SYNCED", currency: "USDT", buying_power: "118050.00", synced_at: iso(minutesBefore(240)), synced_at_ms: minutesBefore(240) },
      ],
      account_sync: [],
      differences: [{ currency: "USDT", portal_free: "118000.00", broker_buying_power: "117800.00", delta: "0.20", in_sync: false }],
      exposure_headroom: [{ currency: "USDT", free: "118000.00", maintenance: "9000.00", headroom: "109000.00", verdict: "AVAILABLE" }],
      positions: [],
      portfolio_allocations: [],
      // `margin_balances` is absent: the capability below says why.
    },
    capabilities: [cap("accounts"), cap("account_balances"), cap("margin_balances", "UNAVAILABLE", "MARGIN_SOURCE_GAP"), cap("broker_account_sync_effective", "AVAILABLE"), cap("exposure_headroom")],
  },
  {
    id: "acc_okx_main",
    environment: "live",
    bindingId: "okx_main@OKX",
    label: "OKX main",
    state: "partial",
    freshness: "STALE",
    rows: {
      accounts: [{ account_id: "acc_okx_main", label: "OKX main", strategy_id: "btc_trend", mode: "live", venue: "OKX", base_currency: "USDT", state: "ACTIVE", external_account_ref: "external_okx" }],
      deployments: [{ deployment_id: "dep_okx_live", account_id: "acc_okx_main", strategy_id: "btc_trend", portfolio_id: "pf_core", mode: "live", venue: "OKX", state: "RUNNING" }],
      venue_accounts: [{ binding_id: "okx_main@OKX", account_id: "acc_okx_main", mode: "live", venue: "OKX", state: "ACTIVE" }],
      account_balances: [balance("acc_okx_main", "USDT", "85000.00", "85000.00", "0.00", minutesBefore(900))],
      margin_balances: [margin("acc_okx_main", "USDT", "30000.00", "22000.00")],
      exposure_headroom: [{ currency: "USDT", free: "85000.00", maintenance: "92400.00", headroom: "-7400.00", verdict: "BREACHED" }],
      positions: [],
      portfolio_allocations: [],
      // `broker_sync` and `differences` are absent: the capability says broker sync is unavailable.
    },
    capabilities: [cap("accounts"), cap("account_balances"), cap("margin_balances"), cap("broker_account_sync_effective", "UNAVAILABLE", "BROKER_SYNC_UNAVAILABLE"), cap("exposure_headroom")],
  },
  {
    id: "acc_pap_sim",
    environment: "paper",
    bindingId: "pap_sim@BINANCE",
    label: "Paper simulator",
    state: "ready",
    freshness: "FRESH",
    rows: {
      accounts: [{ account_id: "acc_pap_sim", label: "Paper simulator", strategy_id: "btc_trend", mode: "paper", venue: "BINANCE", base_currency: "USDT", state: "ACTIVE" }],
      deployments: [{ deployment_id: "dep_btc_paper", account_id: "acc_pap_sim", strategy_id: "btc_trend", portfolio_id: "pf_core", mode: "paper", venue: "BINANCE", state: "RUNNING" }],
      venue_accounts: [{ binding_id: "pap_sim@BINANCE", account_id: "acc_pap_sim", mode: "paper", venue: "BINANCE", state: "ACTIVE" }],
      account_balances: [balance("acc_pap_sim", "USDT", "100000.00", "100000.00", "0.00")],
      positions: [],
      portfolio_allocations: [],
    },
    capabilities: [cap("accounts"), cap("account_balances"), cap("margin_balances", "EMPTY", "NO_MARGIN_ROWS"), cap("broker_account_sync_effective", "EMPTY", "SIMULATED_NO_VENUE")],
  },
  {
    id: "acc_tn_bnc",
    environment: "sandbox",
    bindingId: "tn_bnc@BINANCE",
    label: "Binance testnet",
    state: "empty",
    freshness: "FRESH",
    rows: {},
    capabilities: [],
  },
];

/**
 * An account the generated universe holds, shaped like the hand-written ones. Its facts come from the
 * deployments the fleet shows against it; what its credential state says is unpublished stays absent.
 */
function scaledAccount(id: string): AccountSpec | undefined {
  const binding = scaled().bindings.find((b) => b.accountId === id);
  if (!binding) return undefined;
  const { environment, venue, bindingId } = binding;
  const credentialState = isPositiveMode() ? "SYNC_SYNCED" : binding.credentialState; // WP-P
  const deployments = scaled().alphas.flatMap((a) => a.deployments.map((d) => ({ a, d }))).filter(({ d }) => d.accountId === id);
  const label = `${venue} ${id.slice(-3)}`;
  const mode = environment;
  if (credentialState === "NOT_PUBLISHED") {
    return { id, environment, bindingId, label, state: "empty", freshness: "FRESH", rows: {}, capabilities: [] };
  }
  const currency = deployments[0]?.d.currency ?? "USDT";
  const allocated = sumByCurrency(deployments.map(({ d }) => ({ currency: d.currency, value: d.allocation })));
  const total = allocated.find((x) => x.currency === currency)?.value ?? "0";
  const locked = deployments.reduce((acc, { d }) => (d.currency === currency ? addDecimal(acc, d.exposure) : acc), "0");
  const free = addDecimal(total, `-${locked}`);
  const expired = credentialState === "EXPIRED";
  const stale = credentialState === "SYNC_STALE";
  const at = expired ? minutesBefore(900) : stale ? minutesBefore(180) : AS_OF_MS;
  const rows: Record<string, Row[]> = {
    accounts: [{ account_id: id, label, strategy_id: deployments[0]?.a.id ?? null, mode, venue, base_currency: currency, account_type: "CROSS", state: "ACTIVE" }],
    deployments: deployments.map(({ a, d }) => ({ deployment_id: d.id, account_id: id, strategy_id: a.id, portfolio_id: d.portfolioId, mode, venue, state: d.state === "ACTIVE" ? "RUNNING" : "HALTED" })),
    venue_accounts: [{ binding_id: bindingId, account_id: id, mode, venue, state: binding.state }],
    account_balances: [balance(id, currency, total, free, locked, at)],
    positions: [],
    portfolio_allocations: deployments.map(({ a, d }) => ({ portfolio_id: d.portfolioId, strategy_id: a.id, deployment_id: d.id, account_id: id, mode, currency: d.currency, allocated_capital: d.allocation })),
  };
  if (isPositiveMode()) rows.margin_balances = [margin(id, currency, fromCents(toCents(total) / 10n), fromCents(toCents(total) / 20n))]; // WP-P
  if (!expired) {
    rows.broker_sync = [{ sync_id: `bs_${id.slice(-3)}`, source: "BROKER", status: stale ? "STALE" : "SYNCED", currency, buying_power: free, synced_at: iso(at), synced_at_ms: at }];
    rows.exposure_headroom = [{ currency, free, maintenance: locked, headroom: addDecimal(free, `-${locked}`), verdict: "AVAILABLE" }];
  }
  return {
    id, environment, bindingId, label,
    state: expired ? "partial" : "ready",
    freshness: expired ? "STALE" : stale ? "AGING" : "FRESH",
    rows,
    capabilities: [
      cap("accounts"), cap("account_balances"),
      isPositiveMode() ? cap("margin_balances") : cap("margin_balances", "UNAVAILABLE", "MARGIN_SOURCE_GAP"), // WP-P
      expired ? cap("broker_account_sync_effective", "UNAVAILABLE", "BROKER_SYNC_UNAVAILABLE") : cap("broker_account_sync_effective"),
      ...(expired ? [] : [cap("exposure_headroom")]),
    ],
  };
}

// ===== WP-P begin (positive world: a complete, reconciled account; only when the fixture BFF turned the positive mode on, specs never see it)
const toCents = (value: string): bigint => {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  const n = BigInt(whole + `${fraction}00`.slice(0, 2));
  return negative ? -n : n;
};
const fromCents = (value: bigint): string => `${value < 0n ? "-" : ""}${(value < 0n ? -value : value) / 100n}.${String((value < 0n ? -value : value) % 100n).padStart(2, "0")}`;
const SLEEVES = ["acc_bnc_core", "acc_bnc_sat", "acc_bnc_can"] as const;

/**
 * The positive account: state ready, FRESH, every capability AVAILABLE with the rows it names. Balances come from the deployment books the Manager
 * dataset serves (`positiveBookOf`): total = allocation + realized + unrealized of the deployments booked on the account, locked = 10% of the
 * allocation, free = total - locked; a margin row (initial = locked, maintenance = half), a SYNCED broker sync equal to free, a headroom that
 * is free - maintenance, positions whose unrealized PnL sums to the book's. A shared binding publishes all three sleeves, each counted once.
 */
function positiveAccount(spec: AccountSpec, id: string): AccountSpec {
  if (!isPositiveMode()) return spec;
  const rows: Record<string, Row[]> = { ...spec.rows };
  const primary = SLEEVES.includes(id as (typeof SLEEVES)[number]) ? id : spec.id;
  const shared = SLEEVES.includes(primary as (typeof SLEEVES)[number]);
  const owners = shared ? SLEEVES.filter((sleeve) => sleeve === primary || positiveBookOf(sleeve) !== null) : [primary]; // WP-P: the sleeves that hold a book; the table and the drawer count the same ones
  const books = owners.map((owner) => ({ owner, book: positiveBookOf(owner) }));
  const money = (owner: string): { currency: string; total: bigint; locked: bigint; unrealized: bigint; allocation: bigint } | null => {
    const book = books.find((entry) => entry.owner === owner)?.book;
    if (!book || book.deployments.length === 0) return null;
    const deployments = book.deployments;
    const sum = (pick: (d: (typeof deployments)[number]) => string): bigint => deployments.reduce((acc, d) => acc + toCents(pick(d)), 0n);
    const allocation = sum((d) => d.allocation);
    return { currency: book.deployments[0]!.currency, allocation, unrealized: sum((d) => d.unrealized), total: allocation + sum((d) => d.realized), locked: allocation / 10n };
  };
  const own = money(primary);
  const currency = own?.currency ?? (rows.account_balances?.[0]?.currency as string | undefined) ?? "USDT";
  if (shared || own) {
    rows.accounts = owners.map((owner, n) => ({ account_id: owner, label: accountFact(owner)?.name ?? sleeveLabel(owner, n), strategy_id: books.find((b) => b.owner === owner)?.book?.deployments[0]?.alpha_id ?? null,
      mode: spec.environment, venue: "BINANCE", base_currency: currency, account_type: "CROSS", state: "ACTIVE" }));
    rows.deployments = books.flatMap(({ owner, book }) => (book?.deployments ?? []).map((d) => ({ deployment_id: d.deployment_id, account_id: owner, strategy_id: d.alpha_id, portfolio_id: d.portfolio_id, mode: d.environment, stage: d.stage.toLowerCase(), venue: "BINANCE", state: "RUNNING" })));
    rows.venue_accounts = owners.map((owner) => ({ binding_id: spec.bindingId, account_id: owner, mode: spec.environment, venue: "BINANCE", state: "ACTIVE" }));
    rows.account_balances = books.flatMap(({ owner }) => {
      const m = money(owner);
      return m ? [balance(owner, m.currency, fromCents(m.total), fromCents(m.total - m.locked), fromCents(m.locked))] : [];
    });
  }
  if (own) {
    const book = books.find((entry) => entry.owner === primary)!.book!;
    rows.portfolio_allocations = book.deployments.map((d) => ({ portfolio_id: d.portfolio_id, strategy_id: d.alpha_id, deployment_id: d.deployment_id, account_id: primary, mode: d.environment, stage: d.stage.toLowerCase(), currency: d.currency, allocated_capital: d.allocation }));
    const free = own.total - own.locked;
    rows.margin_balances = [margin(primary, currency, fromCents(own.locked), fromCents(own.locked / 2n))];
    rows.exposure_headroom = [{ currency, free: fromCents(free), maintenance: fromCents(own.locked / 2n), headroom: fromCents(free - own.locked / 2n), verdict: "AVAILABLE" }];
    const long = own.unrealized * 7n / 10n;
    rows.positions = [
      { position_id: `pos_${primary}_btc`, account_id: primary, instrument_id: "BTCUSDT", side: "LONG", signed_qty: "0.90", quantity: "0.90", notional: fromCents(own.allocation * 55n / 100n), unrealized_pnl: fromCents(long), currency, updated_at: ACCOUNT_DOUBLE_AS_OF },
      { position_id: `pos_${primary}_eth`, account_id: primary, instrument_id: "ETHUSDT", side: "SHORT", signed_qty: "-12.5", quantity: "12.5", notional: fromCents(own.allocation * 30n / 100n), unrealized_pnl: fromCents(own.unrealized - long), currency, updated_at: ACCOUNT_DOUBLE_AS_OF },
    ];
    rows.account_equity = [{ account_id: primary, currency, unrealized_pnl: fromCents(own.unrealized), fee_total: fromCents(own.allocation * 5n / 10_000n), funding_pnl: fromCents(own.allocation * 2n / 10_000n), ts: ACCOUNT_DOUBLE_AS_OF, ts_ms: AS_OF_MS }];
    rows.broker_sync = [0, 30, 60, 90, 120].map((minutes, n) => ({ sync_id: `bs_${primary}_${n}`, source: "BROKER", status: "SYNCED", currency, buying_power: fromCents(free - BigInt(n) * 1250n), synced_at: iso(minutesBefore(minutes)), synced_at_ms: minutesBefore(minutes) }));
    if (!shared) rows.differences = [{ currency, portal_free: fromCents(free), broker_buying_power: fromCents(free), delta: "0.00", in_sync: true }];
    else delete rows.differences;
  } else {
    // An account no deployment is booked on (the idle sub account, the OKX main): healthy, with the rows its capabilities name.
    rows.deployments = []; // no deployment of the world is booked here, so none is named (a deployment id must have a lifecycle record)
    const have = rows.account_balances?.[0];
    const free = have ? toCents(String(have.free)) : 10_000_000n;
    rows.account_balances = (rows.account_balances ?? []).map((row) => ({ ...row, updated_at: ACCOUNT_DOUBLE_AS_OF, updated_at_ms: AS_OF_MS }));
    rows.margin_balances ??= [margin(primary, currency, fromCents(free / 10n), fromCents(free / 20n))];
    rows.exposure_headroom = [{ currency, free: fromCents(free), maintenance: fromCents(free / 10n), headroom: fromCents(free - free / 10n), verdict: "AVAILABLE" }];
    rows.broker_sync = [{ sync_id: `bs_${primary}_0`, source: "BROKER", status: "SYNCED", currency, buying_power: fromCents(free), synced_at: ACCOUNT_DOUBLE_AS_OF, synced_at_ms: AS_OF_MS }];
    rows.differences = [{ currency, portal_free: fromCents(free), broker_buying_power: fromCents(free), delta: "0.00", in_sync: true }];
  }
  const capabilities = Object.keys(rows).filter((relation) => ["accounts", "account_balances", "margin_balances", "broker_sync", "exposure_headroom", "positions"].includes(relation))
    .map((relation) => cap(relation === "broker_sync" ? "broker_account_sync_effective" : relation));
  return { ...spec, id: shared ? primary : spec.id, state: "ready", freshness: "FRESH", rows, capabilities };
}
// ===== WP-P end

const SYNTHETIC_PHYSICAL_KEYS = /external_account_ref/;

function accountResource(id: string, search: URLSearchParams): BffAnswerAccount {
  if (id === "acc_err") return problem(503, "ACCOUNT_RESOURCE_UNAVAILABLE", "the account resource could not be read");
  const spec = ACCOUNTS.find((entry) => entry.id === id) ?? scaledAccount(id);
  // A sibling sleeve answers as a thin account on the same binding.
  const sibling = SIBLINGS.has(id);
  if (!spec && !sibling) return problem(404, "ACCOUNT_NOT_FOUND", `no account ${id}`);
  const source = positiveAccount(spec ?? ACCOUNTS[0]!, id); // WP-P: identity outside the positive mode
  const asked = search.get("environment");
  if (asked !== null && asked !== source.environment) return problem(404, "ACCOUNT_NOT_FOUND", `${id} is not in the ${asked} environment`);

  const data: Record<string, unknown[]> = {};
  for (const [relation, rows] of Object.entries(source.rows)) {
    data[relation] = rows.map(withoutPhysicalBrokerRef);
  }
  if (sibling && !isPositiveMode()) {
    // Same binding, same rows (identity and deployments of all three sleeves are published); only this sleeve's own facts change.
    data.positions = [];
    data.portfolio_allocations = [];
    data.account_balances = (source.rows.account_balances ?? []).filter((row) => row.account_id === id).map(withoutPhysicalBrokerRef);
    data.account_equity = [];
  }
  if (Object.keys(data).length === 0) data.accounts = [];

  // The canonical broker-360 body supplies the envelope; the double fills the data.
  const base = { ...ACCOUNT_READY } as Record<string, unknown>;
  const state = sibling ? "ready" : source.state;
  const envelope = {
    ...base,
    resource: { kind: "ACCOUNT", id },
    selected_environment: source.environment,
    candidate_environments: [source.environment],
    delivery_profile: PROFILE[source.environment],
    requested_environment: asked ?? "auto",
    read_at: ACCOUNT_DOUBLE_READ_AT,
    read_at_ms: READ_AT_MS,
    as_of: ACCOUNT_DOUBLE_AS_OF,
    as_of_ms: AS_OF_MS,
    state,
    freshness: source.freshness,
    completeness: state === "partial" ? "PARTIAL" : "COMPLETE",
    capabilities: source.capabilities.map((c) => ({
      capability_id: `source.${c.relation}`,
      state: c.state,
      relations: [c.relation],
      reason_code: c.reason,
      retryable: false,
    })),
    data,
    unavailable_branches: source.capabilities
      .filter((c) => c.state === "UNAVAILABLE")
      .map((c) => ({ capability_id: `source.${c.relation}`, state: "UNAVAILABLE", reason_code: c.reason ?? "UNAVAILABLE", retryable: false })),
  };
  // Belt and braces: nothing the screens must not show may leave the double.
  if (SYNTHETIC_PHYSICAL_KEYS.test(JSON.stringify(envelope))) throw new Error("the account double leaked a physical broker reference");
  return { status: 200, body: envelope };
}

/* ── orders and fills ───────────────────────────────────────────────────── */

const ORDERS: readonly Row[] = [
  { order_id: "ord_3", account_id: "acc_bnc_core", instrument_id: "BTCUSDT", symbol: "BTCUSDT", side: "BUY", status: "FILLED", price: "68100.50", quantity: "0.20", submitted_at: iso(minutesBefore(5)) },
  { order_id: "ord_2", account_id: "acc_bnc_core", instrument_id: "ETHUSDT", symbol: "ETHUSDT", side: "SELL", status: "OPEN", price: "2810.00", quantity: "4.00", submitted_at: iso(minutesBefore(40)) },
  { order_id: "ord_1", account_id: "acc_bnc_core", instrument_id: "BTCUSDT", symbol: "BTCUSDT", side: "BUY", status: "REJECTED", price: "67000.00", quantity: "1.50", submitted_at: iso(minutesBefore(200)) },
];
const FILLS: readonly Row[] = [
  { fill_id: "fill_1", account_id: "acc_bnc_core", instrument_id: "BTCUSDT", symbol: "BTCUSDT", side: "BUY", price: "68100.50", quantity: "0.20", trade_time: iso(minutesBefore(5)) },
];

/** The two sibling sleeves of the shared binding answer as empty accounts of the same environment. */
const SIBLINGS: ReadonlySet<string> = new Set(["acc_bnc_sat", "acc_bnc_can"]);
const specOf = (id: string): AccountSpec | undefined => ACCOUNTS.find((entry) => entry.id === id) ?? (SIBLINGS.has(id) ? ACCOUNTS[0] : undefined) ?? scaledAccount(id);

function subjectRecords(accountId: string, relation: "orders" | "fills", search: URLSearchParams): BffAnswerAccount {
  const spec = specOf(accountId);
  if (!spec) return problem(404, "ACCOUNT_NOT_FOUND", `no account ${accountId}`);
  const environment = search.get("environment") ?? spec.environment;
  if (environment !== spec.environment) return problem(404, "ACCOUNT_NOT_FOUND", `${accountId} is not in the ${environment} environment`);
  const limitRaw = search.get("limit");
  const limit = limitRaw === null ? 200 : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) return problem(400, "SUBJECT_READ_INPUT_INVALID", "limit must be 1 to 500");
  const all = accountId === "acc_bnc_core" ? (relation === "orders" ? ORDERS : FILLS) : [];
  const after = search.get("after");
  let start = 0;
  if (after !== null) {
    const match = /^subj1\.(\d+)$/.exec(after);
    if (!match) return problem(400, "SUBJECT_READ_CURSOR_INVALID", "the cursor cannot be read");
    start = Number(match[1]);
  }
  const page = all.slice(start, start + limit);
  const more = start + page.length < all.length;
  const idKey = relation === "orders" ? "order_id" : "fill_id";
  return {
    status: 200,
    body: {
      schema_version: "portal.execution.subject-records.v1",
      logical_operation_id: `executionAccount${relation === "orders" ? "Orders" : "Fills"}V1`,
      authority: "PORTAL_SGP_RETAINED_CURRENT_WINDOW",
      source_authority: "TRADING_SYSTEM_CURRENT_SOURCE",
      history_semantics: "RETAINED_PORTAL_CURRENT_WINDOW_NOT_AUTHORITATIVE_REPLAY",
      environment,
      profile_id: PROFILE[environment as Environment],
      resource: { kind: "account", id: accountId, resolution: "EXACT_ACCOUNT_ID" },
      timeframe: { value: null, provenance: "UNAVAILABLE", source_field: null },
      source_health: { availability: all.length === 0 ? "EMPTY" : "AVAILABLE", freshness: "FRESH", completeness: "COMPLETE", as_of_ms: AS_OF_MS },
      coverage: {
        retained_row_count: all.length,
        oldest_observed_at_ms: all.length === 0 ? null : minutesBefore(200),
        newest_observed_at_ms: all.length === 0 ? null : minutesBefore(5),
        source_completeness: "COMPLETE",
        source_window: "CURRENT_SOURCE_CURSOR_TRAVERSAL",
      },
      state: all.length === 0 ? "EMPTY" : "AVAILABLE",
      page: { limit, maximum_page_rows: 500, returned_count: page.length, has_more: more, next_cursor: more ? `subj1.${start + page.length}` : null },
      records: page.map((row) => ({ record_id: String(row[idKey]), values: row })),
      projection: { epoch_id: `account-double-${environment}`, sequence: 1, source_as_of_ms: AS_OF_MS, last_successful_refresh_at_ms: READ_AT_MS, completeness: "COMPLETE" },
    },
  };
}

/* ── equity chart ───────────────────────────────────────────────────────── */

function equityChart(search: URLSearchParams): BffAnswerAccount | null {
  if (search.get("subject_kind") !== "account") return null;
  const subjectId = search.get("subject_id") ?? "";
  const spec = specOf(subjectId);
  if (!spec) return problem(404, "ACCOUNT_NOT_FOUND", `no account ${subjectId}`);
  const environment = spec.environment;
  const world = isPositiveMode() ? accountFact(subjectId) : null; // WORLD: the equity line ends on the ledger the account states
  const has = world !== null || subjectId === "acc_bnc_core";
  const step = world !== null ? 60 * 60_000 : 30 * 60_000;
  const t0 = AS_OF_MS - (world !== null ? 47 : 5) * step;
  const points: [number, string | null][] = world !== null ? ledgerSeries(subjectId, t0, AS_OF_MS, 48).map((p): [number, string | null] => [p.t, p.value]) : [
    [t0, "87500.00"], [t0 + step, "87620.40"], [t0 + 2 * step, null], [t0 + 3 * step, "88010.10"], [t0 + 4 * step, "88150.00"], [t0 + 5 * step, "88200.00"],
  ];
  return {
    status: 200,
    body: {
      schema_version: "execution.financial-chart.v1",
      logical_operation_id: "executionFinancialChartV1",
      record_authority: "PORTAL_CONTROL",
      source_authority: "DERIVED",
      workspace_id: search.get("workspace_id") ?? "ws_fixture",
      environment,
      profile_id: PROFILE[environment],
      subject: { kind: "account", id: subjectId },
      metric: "equity",
      panel: {
        state: has ? "READY" : "EMPTY",
        reason_code: has ? null : "NO_EQUITY_SERIES_PUBLISHED",
        retryable: false,
        clocks: { as_of_ms: AS_OF_MS, read_at_ms: READ_AT_MS, source_published_at_ms: AS_OF_MS },
        coverage: {
          from_ms: t0, to_ms: AS_OF_MS, source_total: null, filtered_total: has ? String(points.length) : "0", returned_count: has ? points.length : 0,
          truncated: false, downsampled: false, has_more: false,
          gaps: has && world === null ? [{ from_ms: t0 + step + 1, to_ms: t0 + 3 * step - 1, reason: "SOURCE_GAP" }] : [],
        },
        formula: { formula_id: "account-double.equity.v1", formula_version: "v1", input_digest: "sha256:" + "0".repeat(64), input_revision: `account-double-${environment}:1` },
        data: {
          comparison_mode: "SINGLE_SUBJECT",
          scale_mode: "LINEAR",
          currency_policy: "PARTITIONED_BY_SOURCE_CURRENCY_NO_FX_AGGREGATE",
          series: has ? [{ id: `account:${subjectId}:equity`, label: `${world?.name ?? subjectId} equity`, account_id: subjectId, currency: "USDT", points }] : [],
          sampling: {
            algorithm: "IDENTITY_CURRENT_OBSERVATION_V1", source_rows: String(points.length), numeric_rows: String(points.length - 1), rejected_rows: "0", returned_rows: points.length,
            target_points: 256, bucket_seconds: null, preserves_extrema: true, preserves_first_last: true, preserves_gaps: true, gap_semantics: "GAP_IS_NULL", marker_semantics: "NONE",
          },
          retention: { retention_floor_ms: null, retention_floor_state: "UNKNOWN", oldest_available_ms: t0, newest_available_ms: AS_OF_MS, history_semantics: "RETAINED_SNAPSHOT_RANGE_NOT_EVENT_REPLAY_OR_TOTAL_HISTORY" },
          benchmark: { requested: false, state: null, reason_code: null },
        },
      },
    },
  };
}

/* ── entry ──────────────────────────────────────────────────────────────── */

const PREFIX = "/api/v1/execution";

export function answerAccount(method: string, pathname: string, search: URLSearchParams | string = ""): BffAnswerAccount | null {
  if (method.toUpperCase() !== "GET") return null;
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const path = pathname.startsWith(PREFIX) ? pathname.slice(PREFIX.length) : pathname;
  const seg = path.split("/").filter((part) => part !== "").map((part) => decodeURIComponent(part));

  if (path === "/broker-bindings") return bindingsList(params);
  if (seg[0] === "broker-bindings" && seg.length === 2) return bindingDetail(seg[1]!, params);
  if (seg[0] === "broker-bindings" && seg.length === 3 && seg[2] === "exposure") return bindingExposure(seg[1]!);
  if (seg[0] === "resources" && seg[1] === "accounts" && seg.length === 3) {
    const scoped = scopedResourceV2("ACCOUNT", seg[2]!, params);
    return scoped ? { status: 200, body: scoped } : accountResource(seg[2]!, params);
  }
  if (seg[0] === "resources" && seg[1] === "accounts" && seg.length === 4 && (seg[3] === "orders" || seg[3] === "fills")) {
    return subjectRecords(seg[2]!, seg[3], params);
  }
  if (path === "/views/equity-chart") return equityChart(params);
  return null;
}
