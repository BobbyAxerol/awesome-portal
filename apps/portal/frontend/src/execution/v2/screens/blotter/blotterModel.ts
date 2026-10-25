/**
 * Blotter, pure model (UXM-07 S2, flag key `blotter`).
 *
 * One read, `GET /screens/blotter` (`execution.full-blotter.v1`, through
 * `getBlotterProfile`), carries the page of orders and, beside it, the fills,
 * the conditional groups and legs and the counts. This file turns that
 * `ProfileEnvelope` into rows and refuses to improve on it:
 *
 * - every decimal is the server's string and is printed as given (digits kept,
 *   thousands grouped); nothing is rounded, shortened or recomputed. A number
 *   that is not a string, or does not follow the decimal grammar, is
 *   "unreadable", which is a different claim from "the source published none";
 * - nothing is summed. A filled quantity, an average price, a slippage or a fee
 *   total is shown only if the order row publishes it; the expanded fills list
 *   each fill's own quantity, price and fee, in the fee's own currency;
 * - the server filters by status bucket, venue, symbol and side. Deployment,
 *   account, alpha, order and fill scopes are not in `BlotterQuery`, so they
 *   narrow the LOADED rows only and the screen says so;
 * - counts come from the server's own `exact_total`, `filtered_total` and
 *   `aggregates.status`. A bucket count is shown only when the aggregate covers
 *   the whole population; otherwise the bucket count is not available, never 0.
 */
import { BLOTTER_BUCKET, type BlotterFilter } from "../../../contracts";
import type { BlotterQuery } from "../../../api/ports";
import type { ProfileEnvelope } from "../../../api/profileRead";
import type { FlagKind } from "../../flagKinds";

/** One page is 50 rows (hi-fi, BR-EX-17); the DOM never holds more than this. */
export const PAGE_LIMIT = 50;
/** At phone width one page is a short scroll, not fifty stacked cards (UXM-07 audit B #22); Newer and Older reach the rest. */
export const NARROW_PAGE_LIMIT = 10;
export const ROW_CAP = 200;
/** Groups listed before "Showing N of M". */
export const GROUP_CAP = 6;

/* ── exact fields ──────────────────────────────────────────────────────── */

export type Exact =
  | { kind: "value"; text: string }
  | { kind: "absent" }
  | { kind: "unreadable" };

/** No quantity, price or fee is longer than this; a longer string is refused, not printed. */
const MAX_DECIMAL_CHARS = 64;
const DECIMAL = /^-?(0|[1-9]\d*)(\.\d+)?$/;

/** A decimal STRING in the contract's grammar, or the reason it is not one. A JS number is refused. */
export function readExact(value: unknown): Exact {
  if (value === null || value === undefined || value === "") return { kind: "absent" };
  if (typeof value !== "string" || value.length > MAX_DECIMAL_CHARS || !DECIMAL.test(value) || /^-0+(\.0+)?$/.test(value)) return { kind: "unreadable" };
  return { kind: "value", text: value };
}

/** Thousands grouped, every published digit kept: `60890.00` -> `60,890.00`, `0.0400` -> `0.0400`. */
export function groupExact(text: string): string {
  const negative = text.startsWith("-");
  const [integer, fraction] = (negative ? text.slice(1) : text).split(".");
  const grouped = integer!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}${fraction === undefined ? "" : `.${fraction}`}`;
}

/* ── rows ──────────────────────────────────────────────────────────────── */

function text(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  // The source prints some ids as numbers; an id that is a number is still an id.
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export interface BlotterOrder {
  orderId: string;
  clientOrderId: string | null;
  venueOrderId: string | null;
  /** `strategy_id`: the alpha the order belongs to. */
  alphaId: string | null;
  accountId: string | null;
  /** Not in the orders relation today; read if a later revision adds it. */
  deploymentId: string | null;
  sessionId: string | null;
  venue: string | null;
  symbol: string | null;
  side: "BUY" | "SELL" | null;
  orderType: string | null;
  timeInForce: string | null;
  quantity: Exact;
  /** Absent for a market order: there is no limit price to state. */
  price: Exact;
  triggerPrice: Exact;
  /** Published by the row only; never summed from fills. */
  filledQuantity: Exact;
  status: string | null;
  /** The order row's own `average_fill_price` when the read publishes one; never computed from fills. */
  averageFillPrice: Exact;
  /** The order row's own `fee`, in `feeCurrency`; never summed from fills. */
  fee: Exact;
  feeCurrency: string | null;
  submittedAt: string | null;
  updatedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  riskGrantId: string | null;
}

export interface BlotterFill {
  fillId: string;
  tradeId: string | null;
  clientOrderId: string | null;
  venueOrderId: string | null;
  symbol: string | null;
  side: string | null;
  price: Exact;
  quantity: Exact;
  commission: Exact;
  commissionCurrency: string | null;
  liquiditySide: string | null;
  tradeTime: string | null;
}

export interface BlotterLeg {
  groupId: string;
  legId: string;
  role: string | null;
  sequence: string | null;
  clientOrderId: string | null;
  venueOrderId: string | null;
  side: string | null;
  orderType: string | null;
  quantity: Exact;
  filledQuantity: Exact;
  price: Exact;
  triggerPrice: Exact;
  triggerReference: string | null;
  state: string | null;
  averageFillPrice: Exact;
}

export interface BlotterGroup {
  groupId: string;
  contingencyType: string | null;
  activationPolicy: string | null;
  state: string | null;
  symbol: string | null;
  accountId: string | null;
  strategyId: string | null;
  targetQuantity: Exact;
  filledQuantity: Exact;
  openQuantity: Exact;
  createdAt: string | null;
  updatedAt: string | null;
}

function orderOf(row: Record<string, unknown>): BlotterOrder | null {
  const orderId = text(row.order_id);
  if (orderId === null) return null;
  const side = text(row.side)?.toUpperCase();
  return {
    orderId,
    clientOrderId: text(row.client_order_id),
    venueOrderId: text(row.venue_order_id),
    alphaId: text(row.strategy_id),
    accountId: text(row.account_id),
    deploymentId: text(row.deployment_id),
    sessionId: text(row.execution_session_id),
    venue: text(row.venue),
    symbol: text(row.symbol),
    side: side === "BUY" || side === "SELL" ? side : null,
    orderType: text(row.order_type),
    timeInForce: text(row.time_in_force),
    quantity: readExact(row.quantity),
    price: readExact(row.price),
    triggerPrice: readExact(row.trigger_price),
    filledQuantity: readExact(row.filled_quantity),
    status: text(row.status),
    averageFillPrice: readExact(row.average_fill_price),
    fee: readExact(row.fee),
    feeCurrency: text(row.fee_currency),
    submittedAt: text(row.submitted_at),
    updatedAt: text(row.updated_at),
    errorCode: text(row.error_code),
    errorMessage: text(row.error_message),
    riskGrantId: text(row.risk_grant_id),
  };
}

function fillOf(row: Record<string, unknown>): BlotterFill | null {
  const fillId = text(row.fill_id) ?? text(row.trade_id) ?? text(row.event_id);
  if (fillId === null) return null;
  return {
    fillId,
    tradeId: text(row.trade_id),
    clientOrderId: text(row.client_order_id),
    venueOrderId: text(row.venue_order_id),
    symbol: text(row.symbol),
    side: text(row.side),
    price: readExact(row.price),
    quantity: readExact(row.quantity),
    commission: readExact(row.commission),
    commissionCurrency: text(row.commission_currency),
    liquiditySide: text(row.liquidity_side),
    tradeTime: text(row.trade_time),
  };
}

function legOf(row: Record<string, unknown>): BlotterLeg | null {
  const groupId = text(row.group_id);
  const legId = text(row.leg_id);
  if (groupId === null || legId === null) return null;
  return {
    groupId,
    legId,
    role: text(row.role),
    sequence: text(row.sequence),
    clientOrderId: text(row.client_order_id),
    venueOrderId: text(row.venue_order_id),
    side: text(row.side),
    orderType: text(row.order_type),
    quantity: readExact(row.quantity),
    filledQuantity: readExact(row.filled_quantity),
    price: readExact(row.price),
    triggerPrice: readExact(row.trigger_price),
    triggerReference: text(row.trigger_reference),
    state: text(row.state),
    averageFillPrice: readExact(row.average_fill_price),
  };
}

function groupOf(row: Record<string, unknown>): BlotterGroup | null {
  const groupId = text(row.group_id);
  if (groupId === null) return null;
  return {
    groupId,
    contingencyType: text(row.contingency_type),
    activationPolicy: text(row.activation_policy),
    state: text(row.state),
    symbol: text(row.symbol),
    accountId: text(row.account_id),
    strategyId: text(row.strategy_id),
    targetQuantity: readExact(row.target_quantity),
    filledQuantity: readExact(row.filled_quantity),
    openQuantity: readExact(row.open_quantity),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function count(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d{1,15}$/.test(value)) return Number(value);
  return null;
}

export interface BlotterRead {
  orders: readonly BlotterOrder[];
  /** Rows the server sent that this reader could not place (no id). Counted, never dropped silently. */
  skippedOrders: number;
  fills: readonly BlotterFill[];
  legs: readonly BlotterLeg[];
  groups: readonly BlotterGroup[];
  nextCursor: string | null;
  prevCursor: string | null;
  exactTotal: number | null;
  filteredTotal: number | null;
  /** Server counts per order status, or null when the read carried none. */
  statusCounts: Readonly<Record<string, number>> | null;
  venueCounts: Readonly<Record<string, number>> | null;
  countScope: string | null;
  /** The orders relation's own verdict on its coverage (`exact_query`). */
  exactQueryState: string | null;
  relationCompleteness: string | null;
  state: string;
  freshness: string | null;
  completeness: string | null;
  asOf: string | null;
  readAt: string | null;
  unavailableBranches: readonly string[];
}

function countMap(raw: unknown): Record<string, number> | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = count(value);
    if (n !== null) out[key] = n;
  }
  return out;
}

export function readBlotter(profile: ProfileEnvelope): BlotterRead {
  const take = <T>(rows: readonly Record<string, unknown>[] | undefined, read: (row: Record<string, unknown>) => T | null) =>
    (rows ?? []).flatMap((row) => {
      const parsed = read(row);
      return parsed === null ? [] : [parsed];
    });
  const rawOrders = profile.data.orders ?? [];
  const parsedOrders = take(rawOrders, orderOf);
  const orders = parsedOrders.slice(0, ROW_CAP);
  const page = profile.objects.page ?? {};
  const exactQuery = profile.objects.exact_query ?? {};
  const coverage = typeof exactQuery.coverage === "object" && exactQuery.coverage !== null ? (exactQuery.coverage as Record<string, unknown>) : {};
  const query = profile.objects.query ?? {};
  const aggregates = profile.objects.aggregates ?? {};
  return {
    orders,
    skippedOrders: rawOrders.length - parsedOrders.length,
    fills: take(profile.data.fills, fillOf),
    legs: take(profile.data.conditional_legs, legOf),
    groups: take(profile.data.conditional_groups, groupOf),
    nextCursor: text(page.next_cursor),
    prevCursor: text(page.previous_cursor),
    exactTotal: count(profile.scalars.exact_total),
    filteredTotal: count(profile.scalars.filtered_total),
    statusCounts: countMap(aggregates.status),
    venueCounts: countMap(aggregates.venue),
    countScope: text(query.count_scope),
    exactQueryState: text(exactQuery.state),
    relationCompleteness: text(coverage.relation_completeness),
    state: profile.state,
    freshness: profile.freshness,
    completeness: profile.completeness,
    asOf: profile.asOf,
    readAt: profile.readAt,
    unavailableBranches: profile.unavailableBranches,
  };
}

/* ── status ────────────────────────────────────────────────────────────── */

export interface StatusView {
  kind: FlagKind;
  label: string;
  /** The server bucket this status falls in; CANCELED and EXPIRED sit in none. */
  bucket: Exclude<BlotterFilter, "ALL"> | null;
}

const WORKING = new Set(BLOTTER_BUCKET.OPEN as readonly string[]);

export function humanize(code: string): string {
  const words = code.replace(/[_-]+/g, " ").trim().toLowerCase();
  return words === "" ? code : words.charAt(0).toUpperCase() + words.slice(1);
}

/** The word on the chip is the server's status word; the kind is chosen from the enum. An unknown word is "unknown", never a success. */
export function statusView(status: string | null): StatusView {
  if (status === null) return { kind: "unknown", label: "Status not stated", bucket: null };
  if (status === "FILLED") return { kind: "ok", label: "Filled", bucket: "FILLED" };
  if (status === "PARTIALLY_FILLED") return { kind: "partial", label: "Partially filled", bucket: "PARTIAL" };
  if (status === "REJECTED" || status === "DENIED") return { kind: "rejected", label: humanize(status), bucket: "REJECTED" };
  if (status === "CANCELED" || status === "EXPIRED") return { kind: "paused", label: humanize(status), bucket: null };
  if (WORKING.has(status)) return { kind: "pending", label: humanize(status), bucket: "OPEN" };
  return { kind: "unknown", label: humanize(status), bucket: null };
}

export const CHIPS: readonly { id: BlotterFilter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "OPEN", label: "Open" },
  { id: "PARTIAL", label: "Partial" },
  { id: "FILLED", label: "Filled" },
  { id: "REJECTED", label: "Rejected" },
];

export function isBucket(value: string | null): value is Exclude<BlotterFilter, "ALL"> {
  return value === "FILLED" || value === "PARTIAL" || value === "REJECTED" || value === "OPEN";
}

export interface ChipCount {
  /** `null` = the read does not say; never printed as 0. */
  count: number | null;
  /** True when the number covers the whole population (the aggregate sums to `exact_total`). */
  exact: boolean;
}

/**
 * Per-chip counts from the server's aggregates. A bucket the aggregate does not
 * mention has an unknown count unless the aggregate covers the whole
 * population, in which case it is a true zero.
 */
export function chipCounts(read: BlotterRead): Readonly<Record<BlotterFilter, ChipCount>> {
  const none: ChipCount = { count: null, exact: false };
  const out: Record<BlotterFilter, ChipCount> = { ALL: { count: read.exactTotal, exact: read.exactTotal !== null }, FILLED: none, PARTIAL: none, REJECTED: none, OPEN: none };
  const counts = read.statusCounts;
  if (counts === null) return out;
  const summed = Object.values(counts).reduce((a, b) => a + b, 0);
  const covers = read.exactTotal !== null && summed === read.exactTotal;
  for (const bucket of ["FILLED", "PARTIAL", "REJECTED", "OPEN"] as const) {
    const statuses = BLOTTER_BUCKET[bucket] as readonly string[];
    const present = statuses.filter((s) => s in counts);
    if (present.length === 0 && !covers) continue;
    out[bucket] = { count: present.reduce((a, s) => a + (counts[s] ?? 0), 0), exact: covers };
  }
  return out;
}

/**
 * Statuses the server counted that no chip claims (Canceled, Expired, any word this build does not
 * know). They have no chip because the server has no bucket for them, so the page lists them beside
 * the chips and the chip counts plus these add back up to the population the aggregate covers.
 */
export function unchippedStatusCounts(read: BlotterRead): { status: string; label: string; count: number }[] {
  if (read.statusCounts === null) return [];
  return Object.entries(read.statusCounts)
    .filter(([status]) => statusView(status).bucket === null)
    .map(([status, count]) => ({ status, label: statusView(status).label, count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/* ── joins ─────────────────────────────────────────────────────────────── */

export function fillsFor(order: BlotterOrder, fills: readonly BlotterFill[]): BlotterFill[] {
  return fills.filter(
    (fill) =>
      (order.clientOrderId !== null && fill.clientOrderId === order.clientOrderId) ||
      (order.venueOrderId !== null && fill.venueOrderId === order.venueOrderId),
  );
}

/** All legs of every group this order is a leg of, in the server's `sequence` order. */
export function legsFor(order: BlotterOrder, legs: readonly BlotterLeg[]): BlotterLeg[] {
  if (order.clientOrderId === null && order.venueOrderId === null) return [];
  const groupIds = new Set(
    legs
      .filter((leg) => (order.clientOrderId !== null && leg.clientOrderId === order.clientOrderId) || (order.venueOrderId !== null && leg.venueOrderId === order.venueOrderId))
      .map((leg) => leg.groupId),
  );
  return legs
    .filter((leg) => groupIds.has(leg.groupId))
    .sort((a, b) => (a.sequence ?? "").localeCompare(b.sequence ?? "") || a.legId.localeCompare(b.legId));
}

/* ── scope: client-side, loaded rows only ──────────────────────────────── */

export interface Scope {
  deployment: string | null;
  account: string | null;
  alpha: string | null;
  order: string | null;
  fill: string | null;
}

export const NO_SCOPE: Scope = { deployment: null, account: null, alpha: null, order: null, fill: null };

export interface ScopeResult {
  rows: readonly BlotterOrder[];
  /** A deployment scope was asked for but no loaded row carries a deployment id, so it could not be applied. */
  deploymentNotApplied: boolean;
  /** The order a fill or order link named is not on the loaded pages. */
  focusMissing: boolean;
  /** The order that holds the focused fill, when it is on a loaded page. */
  focusOrderId: string | null;
}

export function applyScope(orders: readonly BlotterOrder[], fills: readonly BlotterFill[], scope: Scope): ScopeResult {
  let rows = orders;
  const deploymentNotApplied = scope.deployment !== null && !orders.some((o) => o.deploymentId !== null);
  if (scope.deployment !== null && !deploymentNotApplied) rows = rows.filter((o) => o.deploymentId === scope.deployment);
  if (scope.account !== null) rows = rows.filter((o) => o.accountId === scope.account);
  if (scope.alpha !== null) rows = rows.filter((o) => o.alphaId === scope.alpha);
  let focusOrderId: string | null = null;
  let focusMissing = false;
  if (scope.fill !== null) {
    const fill = fills.find((f) => f.fillId === scope.fill || f.tradeId === scope.fill);
    const owner = fill ? orders.find((o) => fillsFor(o, [fill]).length > 0) : undefined;
    focusOrderId = owner?.orderId ?? null;
    focusMissing = owner === undefined;
  } else if (scope.order !== null) {
    const owner = orders.find((o) => o.orderId === scope.order);
    focusOrderId = owner?.orderId ?? null;
    focusMissing = owner === undefined;
  }
  return { rows, deploymentNotApplied, focusMissing, focusOrderId };
}

export function scopeActive(scope: Scope): boolean {
  return scope.deployment !== null || scope.account !== null || scope.alpha !== null;
}

/* ── query ─────────────────────────────────────────────────────────────── */

export interface ServerFilters {
  bucket: BlotterFilter;
  symbol: string;
  venue: string;
  side: "BUY" | "SELL" | "";
}

export const NO_FILTERS: ServerFilters = { bucket: "ALL", symbol: "", venue: "", side: "" };

export function blotterQuery(filters: ServerFilters, cursor: { dir: "after" | "before"; value: string } | null, limit: number = PAGE_LIMIT): BlotterQuery {
  return {
    limit,
    ...(filters.bucket === "ALL" ? {} : { status_bucket: filters.bucket }),
    ...(filters.symbol.trim() === "" ? {} : { symbol: filters.symbol.trim() }),
    ...(filters.venue === "" ? {} : { venue: filters.venue }),
    ...(filters.side === "" ? {} : { side: filters.side }),
    ...(cursor === null ? {} : cursor.dir === "after" ? { after: cursor.value } : { before: cursor.value }),
  };
}

export function filtersKey(filters: ServerFilters): string {
  return `${filters.bucket}|${filters.symbol.trim()}|${filters.venue}|${filters.side}`;
}

/* ── columns ───────────────────────────────────────────────────────────── */

export type ColumnId =
  | "time" | "order" | "alpha" | "account" | "deployment" | "venue" | "symbol" | "side" | "tif" | "price" | "trigger" | "fillqty" | "qty" | "filled"
  | "avg" | "fee" | "client" | "venueOrder" | "session" | "risk" | "updated" | "status";

export interface ColumnSpec {
  id: ColumnId;
  label: string;
  numeric?: boolean;
  /** On by default. */
  dflt: boolean;
  /** Never removable. */
  fixed?: boolean;
}

export const COLUMNS: readonly ColumnSpec[] = [
  { id: "time", label: "Time (UTC)", dflt: true },
  { id: "order", label: "Order", dflt: true, fixed: true },
  { id: "alpha", label: "Alpha", dflt: false },
  { id: "account", label: "Account", dflt: false },
  // The hi-fi keeps Deployment, Avg price and Fee as default columns. The orders read carries none of the three, so each cell says Not available.
  { id: "deployment", label: "Deployment", dflt: true },
  { id: "venue", label: "Venue", dflt: false },
  { id: "symbol", label: "Symbol", dflt: true },
  { id: "side", label: "Side and type", dflt: true },
  { id: "tif", label: "TIF", dflt: false },
  { id: "price", label: "Price", numeric: true, dflt: true },
  { id: "trigger", label: "Trigger", numeric: true, dflt: false },
  // One default column, as the design has (FILLED / QTY): the two figures it joins stay separate, optional columns (QA1 R4 I7).
  { id: "fillqty", label: "Filled / Qty", numeric: true, dflt: true },
  { id: "qty", label: "Quantity", numeric: true, dflt: false },
  { id: "filled", label: "Filled", numeric: true, dflt: false },
  { id: "avg", label: "Avg price", numeric: true, dflt: true },
  { id: "fee", label: "Fee", numeric: true, dflt: true },
  { id: "client", label: "Client ID", dflt: false },
  { id: "venueOrder", label: "Venue order", dflt: false },
  { id: "session", label: "Session", dflt: false },
  { id: "risk", label: "Risk grant", dflt: false },
  { id: "updated", label: "Updated (UTC)", dflt: false },
  { id: "status", label: "Status", dflt: true, fixed: true },
];

export const DEFAULT_COLUMNS: ReadonlySet<ColumnId> = new Set(COLUMNS.filter((c) => c.dflt).map((c) => c.id));

/** Facts the orders read does not carry, listed so the table does not look like it forgot them. */
export const NOT_IN_READ: readonly string[] = ["Average price", "Slippage", "Fee per order", "Totals by currency"];

/** The request that would add them to the read (FE-052); the screen cites it, never "no request id yet". */
export const NOT_IN_READ_REQUEST = "FE-052" as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/**
 * `17 Oct 09:58:00Z`, the house short UTC form with seconds (hi-fi blotter).
 * An instant that does not parse, or is not stated as UTC, is returned as the server wrote it, never
 * blanked; a missing one is the caller's "Not available".
 */
export function shortUtc(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]00:?00)$/.exec(iso.trim());
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  if (!m || month === undefined) return iso;
  return `${m[3]} ${month} ${m[4]}:${m[5]}:${m[6] ?? "00"}Z`;
}

/* ── export ────────────────────────────────────────────────────────────── */

/** The exact decimal as published (no thousands grouping, which would split a CSV cell); an unreadable one says so. */
function exactCsv(value: Exact): string {
  return value.kind === "value" ? value.text : value.kind === "unreadable" ? "unreadable" : "";
}

/** A cell the way the table prints it, as plain text; a fact the row does not carry is an empty cell, never a stand-in. */
export function csvCell(order: BlotterOrder, id: ColumnId): string {
  switch (id) {
    case "time": return order.submittedAt ? shortUtc(order.submittedAt) : "";
    case "order": return order.orderId;
    case "alpha": return order.alphaId ?? "";
    case "account": return order.accountId ?? "";
    // Deployment is the order row's own `deployment_id` when a revision publishes it; average price and fee are the row's own `average_fill_price` / `fee` when published, else an empty CSV cell, never a stand-in.
    case "deployment": return order.deploymentId ?? "";
    case "avg": return exactCsv(order.averageFillPrice);
    case "fee": return order.fee.kind === "value" ? `${order.fee.text}${order.feeCurrency ? ` ${order.feeCurrency}` : ""}` : exactCsv(order.fee);
    case "venue": return order.venue ?? "";
    case "symbol": return order.symbol ?? "";
    case "side": return [order.side ? humanize(order.side) : "", order.orderType ? humanize(order.orderType) : ""].filter((w) => w !== "").join(" ");
    case "tif": return order.timeInForce ?? "";
    case "price": return exactCsv(order.price);
    case "trigger": return exactCsv(order.triggerPrice);
    case "fillqty": return `${exactCsv(order.filledQuantity)} / ${exactCsv(order.quantity)}`;
    case "qty": return exactCsv(order.quantity);
    case "filled": return exactCsv(order.filledQuantity);
    case "client": return order.clientOrderId ?? "";
    case "venueOrder": return order.venueOrderId ?? "";
    case "session": return order.sessionId ?? "";
    case "risk": return order.riskGrantId ?? "";
    case "updated": return order.updatedAt ? shortUtc(order.updatedAt) : "";
    case "status": return statusView(order.status).label;
  }
}

/** RFC 4180 quoting; a text cell that a spreadsheet would read as a formula gets a leading apostrophe. */
function csvField(text: string, numeric: boolean): string {
  const safe = !numeric && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The rows as the table shows them: one header row with the visible column labels, then one line per row. */
export function blotterCsv(rows: readonly BlotterOrder[], columns: readonly ColumnSpec[]): string {
  const lines = [columns.map((c) => csvField(c.label, true))];
  for (const order of rows) lines.push(columns.map((c) => csvField(csvCell(order, c.id), c.numeric === true)));
  return `${lines.map((line) => line.join(",")).join("\r\n")}\r\n`;
}

/** `blotter-paper-20261021T104201Z.csv`: the environment, then the read's as-of (digits and letters only). */
export function blotterCsvName(environment: string, asOf: string | null): string {
  const stamp = asOf ? asOf.replace(/[^0-9A-Za-z]/g, "") : "";
  return `blotter-${environment.toLowerCase()}-${stamp === "" ? "asof-not-published" : stamp}.csv`;
}


/* ── funnel over the loaded page ───────────────────────────────────────── */

export interface FunnelStep {
  id: "submitted" | "risk" | "venue" | "filled";
  label: string;
  count: number;
  /** Percent of the submitted orders to one place, by integer arithmetic (rounded half up); null when nothing was submitted. */
  percent: string | null;
}

const isZero = (value: Exact): boolean => value.kind === "value" && /^0(\.0+)?$/.test(value.text);

/**
 * The order path counted over the orders the page loaded: submitted (all), risk grant (the row names a grant), venue acknowledged
 * (the row names a venue order id) and filled (the row states a non-zero filled quantity). Every count is a published row fact; the
 * server publishes no scope-level funnel, so the caption says these are the loaded rows only.
 */
export function pageFunnel(orders: readonly BlotterOrder[]): readonly FunnelStep[] {
  const total = orders.length;
  const counts = {
    submitted: total,
    risk: orders.filter((o) => o.riskGrantId !== null).length,
    venue: orders.filter((o) => o.venueOrderId !== null).length,
    filled: orders.filter((o) => o.filledQuantity.kind === "value" && !isZero(o.filledQuantity)).length,
  };
  const percent = (n: number): string | null => {
    if (total === 0) return null;
    const tenths = Math.floor((n * 1000 * 2 + total) / (total * 2));
    return `${Math.floor(tenths / 10)}.${tenths % 10}`;
  };
  return [
    { id: "submitted", label: "Submitted", count: counts.submitted, percent: percent(counts.submitted) },
    { id: "risk", label: "Risk grant", count: counts.risk, percent: percent(counts.risk) },
    { id: "venue", label: "Venue acknowledged", count: counts.venue, percent: percent(counts.venue) },
    { id: "filled", label: "Filled", count: counts.filled, percent: percent(counts.filled) },
  ];
}
