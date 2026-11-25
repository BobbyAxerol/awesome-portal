/**
 * V2 Alpha resource reader: `GET /resources/alphas/{id}` when the workspace is
 * SCOPED_V2 (`execution.alpha-resource.v2`, `execution-resource-scoped.v2#/$defs/AlphaScopedResourceWireResponse`).
 *
 * The body is AUTHORIZED RETAINED RAW FACTS, and it says so: `visibility: SCOPED`,
 * `coverage: AUTHORIZED_ONLY`, `totals_scope: VISIBLE_ROWS_ONLY`, `is_full_portfolio: false`,
 * `completeness: PARTIAL`, `financial_summary: UNAVAILABLE`. This reader keeps all of that as typed
 * constants and never turns a missing member into a zero, a label or a health word:
 *
 * - it carries no `alpha_label`, `version`, `owner`, `stage`, `health`, no money totals: the screen shows each
 *   as a typed absence, never from a neighbouring member;
 * - a row member the source did not state is absent from `cells`; one it stated as `null` is `{ kind: "absent" }`;
 *   neither is ever `0`;
 * - decimals are exact strings (never a JS number), counters are exact strings, instants are safe integers;
 * - the BOUNDED variant (`EDS04_RESOURCE_RESPONSE_BYTE_BOUND`) carries no relation rows at all and says so.
 *
 * Closed, like `liveSourceOperations.ts`: an unknown key at any depth, a member of the wrong type, an unknown word
 * where the contract has an enum, a `null` where the contract has none: the WHOLE body is refused (one malformed
 * panel would otherwise read as "nothing there"). The published schema is the oracle for the conformance suite
 * (`alphaResourceScoped.conformance.test.ts`), which also checks that the field tables below equal the schema's.
 */
import { readUtcEpochMs, type UtcEpochMs } from "../../screenDataContract";

export const ALPHA_RESOURCE_V2_SCHEMA = "execution.alpha-resource.v2";

export const SCOPED_ENVIRONMENTS = ["paper", "sandbox", "live"] as const;
export type ScopedEnvironment = (typeof SCOPED_ENVIRONMENTS)[number];

/** The eighteen relation panels an Alpha body carries, in the order the schema lists them. */
export const ALPHA_SCOPED_RELATIONS = [
  "deployments", "accounts", "account_balances", "margin_balances", "account_sync", "broker_sync", "venue_accounts",
  "portfolios", "portfolio_allocations", "positions", "sessions", "orders", "fills", "performance", "account_equity",
  "reconciliation", "strategies", "journal",
] as const;
export type ScopedRelation = (typeof ALPHA_SCOPED_RELATIONS)[number];

/**
 * Member kinds of a row. `T` text, `D` exact decimal, `M` book word, `S` a stamp that is text OR an integer, `I` an
 * epoch-ms integer (never null), `C` a count (integer OR exact counter string), `L` a liquidity word (MAKER, TAKER or UNKNOWN),
 * `B` a boolean (including a stated `false`, never coerced from text or a number).
 * Every kind but `I` also admits `null`.
 */
type Kind = "T" | "D" | "M" | "S" | "I" | "C" | "L" | "N" | "B";
const LIQUIDITY_SIDES = ["MAKER", "TAKER", "UNKNOWN"] as const;
/** Package 6: why a scoped row has no `portfolio_name` (a display label joined from the same authorized snapshot; never an access grant). */
const PORTFOLIO_NAME_REASONS = ["PORTFOLIO_NAME_NOT_READ", "PORTFOLIO_NAME_NOT_PUBLISHED", "PORTFOLIO_NAME_NOT_AUTHORIZED", "PORTFOLIO_NAME_AMBIGUOUS"] as const;

const stamps = (prefix: string, withMs = true): Record<string, Kind> => ({ [prefix]: "S", ...(withMs ? { [`${prefix}_ms`]: "I" } : {}) });

/** The members each relation's row may carry (all optional, all nullable except `I`). `profile_environment` is required on every row. */
export const SCOPED_ROW_FIELDS: Readonly<Record<ScopedRelation, Readonly<Record<string, Kind>>>> = {
  strategies: { strategy_id: "T", alpha_id: "T", name: "T", description: "T", version: "T", state: "T", stage: "T", ...stamps("created_at"), ...stamps("updated_at"), deployment_id: "T" },
  deployments: { deployment_id: "T", strategy_id: "T", account_id: "T", mode: "M", venue: "T", currency: "T", account_policy_id: "T", risk_profile_id: "T", portfolio_id: "T", portfolio_name: "T", portfolio_name_reason_code: "N", state: "T", ...stamps("created_at"), ...stamps("updated_at") },
  accounts: { account_id: "T", strategy_id: "T", mode: "M", venue: "T", base_currency: "T", state: "T", ...stamps("created_at"), ...stamps("updated_at"), account_type: "T", deployment_id: "T" },
  account_balances: { account_id: "T", currency: "T", total: "D", locked: "D", free: "D", ...stamps("updated_at"), deployment_id: "T" },
  margin_balances: { account_id: "T", instrument_id: "T", currency: "T", initial: "D", maintenance: "D", ...stamps("updated_at"), deployment_id: "T" },
  account_sync: { account_id: "T", mode: "M", venue: "T", status: "T", currency: "T", ...stamps("created_at"), deployment_id: "T" },
  broker_sync: {},
  venue_accounts: { binding_id: "T", account_id: "T", mode: "M", venue: "T", state: "T", status: "T", ...stamps("created_at"), ...stamps("updated_at"), deployment_id: "T" },
  portfolios: { portfolio_id: "T", name: "T", owner: "T", base_currency: "T", state: "T", ...stamps("created_at"), ...stamps("updated_at"), deployment_id: "T" },
  portfolio_allocations: { portfolio_id: "T", portfolio_name: "T", portfolio_name_reason_code: "N", strategy_id: "T", deployment_id: "T", account_id: "T", mode: "M", venue: "T", currency: "T", allocated_capital: "D", state: "T", ...stamps("created_at"), ...stamps("updated_at") },
  positions: {
    position_id: "T", strategy_id: "T", account_id: "T", mode: "M", venue: "T", instrument_id: "T", side: "T", signed_qty: "D", quantity: "D", avg_px_open: "D",
    avg_px_close: "D", realized_pnl: "D", unrealized_pnl: "D", mark_price: "D", notional: "D", ...stamps("updated_at"), deployment_id: "T",
  },
  sessions: {
    strategy_id: "T", account_id: "T", mode: "M", venue: "T", state: "T", submitted_count: "C", risk_rejected_count: "C", filled_count: "C", broker_rejected_count: "C",
    ...stamps("updated_at"), execution_session_id: "T", ...stamps("started_at"), ...stamps("completed_at"), deployment_id: "T",
  },
  orders: {
    order_id: "T", strategy_id: "T", account_id: "T", mode: "M", venue: "T", instrument_id: "T", symbol: "T", side: "T", quantity: "D", price: "D", status: "T",
    ...stamps("submitted_at"), ...stamps("updated_at"), risk_grant_id: "T", intent: "T", client_order_id: "T", order_type: "T", execution_session_id: "T",
    position_side: "T", time_in_force: "T", reduce_only: "B", post_only: "B", trigger_price: "D", filled_quantity: "D", average_fill_price: "D", deployment_id: "T",
  },
  fills: {
    fill_id: "T", ...stamps("trade_time"), strategy_id: "T", account_id: "T", mode: "M", venue: "T", instrument_id: "T", side: "T", price: "D", quantity: "D",
    realized_pnl: "D", client_order_id: "T", commission: "D", commission_currency: "T", liquidity_side: "L", execution_session_id: "T", deployment_id: "T",
  },
  performance: {
    ...stamps("ts"), deployment_id: "T", strategy_id: "T", account_id: "T", mode: "M", venue: "T", instrument_id: "T", symbol: "T", currency: "T", position_qty: "D",
    signed_qty: "D", avg_px_open: "D", mark_price: "D", notional: "D", exposure_long: "D", exposure_short: "D", realized_pnl: "D", unrealized_pnl: "D", fee_total: "D",
    funding_pnl: "D", gross_pnl: "D", net_pnl: "D", equity: "D", ...stamps("created_at"),
  },
  account_equity: {
    ...stamps("ts"), deployment_id: "T", strategy_id: "T", account_id: "T", mode: "M", venue: "T", currency: "T", margin_initial: "D", margin_maintenance: "D",
    realized_pnl: "D", unrealized_pnl: "D", fee_total: "D", funding_pnl: "D", gross_pnl: "D", net_pnl: "D", equity: "D", drawdown: "D", ...stamps("created_at"),
  },
  reconciliation: {
    account_id: "T", strategy_id: "T", execution_session_id: "T", mode: "M", venue: "T", status: "T", ...stamps("created_at"), finding_id: "T", finding_type: "T", ...stamps("resolved_at"), deployment_id: "T",
  },
  journal: { mode: "M", venue: "T", alpha_id: "T", account_id: "T", state: "T", ...stamps("updated_at"), deployment_id: "T" },
};

/** Panels whose history is a retained range; every other panel is `CURRENT_STATE_ONLY`. */
const RANGE_PANELS: ReadonlySet<ScopedRelation> = new Set(["performance", "account_equity"]);

const PANEL_STATES = ["READY", "EMPTY", "PARTIAL", "STALE", "UNAVAILABLE", "DENIED", "ERROR"] as const;
export type ScopedPanelState = (typeof PANEL_STATES)[number];
const RESOURCE_STATES = ["ready", "empty", "partial", "stale", "unavailable"] as const;
export type ScopedResourceState = (typeof RESOURCE_STATES)[number];
const FRESHNESS = ["FRESH", "AGING", "STALE", "UNKNOWN"] as const;
export type ScopedFreshness = (typeof FRESHNESS)[number];
const AVAILABILITY = ["AVAILABLE", "EMPTY", "PARTIAL", "UNAVAILABLE"] as const;
const COVERAGE_STATES = ["FOUND", "EMPTY", "PARTIAL", "UNAVAILABLE"] as const;

export const BOUNDED_REASON = "EDS04_RESOURCE_RESPONSE_BYTE_BOUND";
export const NO_TOTALS_REASON = "SCOPED_RAW_FACTS_ONLY_NO_IMPLIED_TOTALS";

/** One published row member. `absent` is a stated `null`; a member the source did not state is simply not in `cells`. */
export type ScopedCell =
  | { kind: "absent" }
  | { kind: "text"; text: string }
  /** The exact decimal string; display unit and precision belong to the screen that knows the field. */
  | { kind: "decimal"; exact: string }
  | { kind: "book"; book: ScopedEnvironment }
  /** An actual wire boolean: false is a value, distinct from null and an omitted member. */
  | { kind: "boolean"; value: boolean }
  /** A stamp the source wrote as text (not parsed here). */
  | { kind: "stamp-text"; text: string }
  /** A non-negative integer: a stamp the source wrote as a number, or an epoch-ms member. */
  | { kind: "integer"; value: number }
  /** A count the source wrote as an exact string (an int64 above 2^53 stays whole). */
  | { kind: "counter"; exact: string };

export interface ScopedRow {
  /** The book (profile environment) the row was read from. */
  book: ScopedEnvironment;
  cells: Readonly<Record<string, ScopedCell>>;
}

export interface ScopedPanel {
  name: ScopedRelation;
  state: ScopedPanelState;
  reasonCode: string | null;
  retryable: boolean;
  /** Exact population strings; `null` when the source did not state one. Never read as zero. */
  sourceTotal: string | null;
  filteredTotal: string | null;
  /** The panel's own rows (null `data` reads as no rows). The screens print `data[relation]`, which is the same population. */
  panelRowCount: number;
  returnedCount: number;
  truncated: boolean;
  hasMore: boolean;
  historySemantics: "CURRENT_STATE_ONLY" | "RETAINED_RANGE_OR_CURRENT_WINDOW";
  readAtMs: UtcEpochMs;
}

export interface ScopedAlphaSummary {
  id: string;
  /** Stated text members of the summary; `null` when absent or stated `null`. */
  alphaId: string | null;
  name: string | null;
  displayName: string | null;
  version: string | null;
  state: string | null;
  /** BE-P15: identity members the body does not state, each with a typed reason. Empty when the body carries none. */
  identityAbsences: readonly { member: (typeof IDENTITY_ABSENCE_MEMBERS)[number]; reasonCode: (typeof IDENTITY_ABSENCE_REASONS)[number] }[];
  /** BE-P15: one published snapshot row per visible deployment, or a typed absence. Empty when the body carries none. */
  deploymentFinancials: readonly ScopedDeploymentFinancial[];
  deployments: readonly ScopedRow[];
  portfolios: readonly { portfolioId: string | null; name: string | null; displayName: string | null }[];
  metrics: Readonly<Record<"account_balance" | "current_position_pnl" | "equity_series", { state: (typeof AVAILABILITY)[number]; reasonCode: string | null }>>;
  /** Always `UNAVAILABLE` with `SCOPED_RAW_FACTS_ONLY_NO_IMPLIED_TOTALS`: the body states no total. */
  financialSummary: { state: "UNAVAILABLE"; reasonCode: typeof NO_TOTALS_REASON };
}

export interface ScopedCapability {
  capabilityId: string;
  state: (typeof AVAILABILITY)[number];
  reasonCode: string | null;
  retryable: boolean;
}

export interface ScopedUnavailableBranch {
  capabilityId: string;
  /** Only the `resource.identity` branch names a book. */
  environment: ScopedEnvironment | null;
  state: "EMPTY" | "PARTIAL" | "UNAVAILABLE";
  reasonCode: string | null;
  retryable: boolean;
}

export interface ScopedProfileCoverage {
  book: ScopedEnvironment;
  profileId: string | null;
  state: (typeof COVERAGE_STATES)[number];
  reasonCode: string | null;
}

export interface AlphaResourceScoped {
  schemaVersion: typeof ALPHA_RESOURCE_V2_SCHEMA;
  /** `empty`: `data` is `{}`. `bounded`: the Portal cut the response at its byte bound and sent no relation rows. */
  shape: "full" | "empty" | "bounded";
  workspaceId: string;
  deliveryProfile: string;
  requestedEnvironment: "all" | ScopedEnvironment;
  selectedEnvironment: ScopedEnvironment | null;
  resource: { id: string; label: string | null };
  readAtMs: UtcEpochMs;
  state: ScopedResourceState;
  freshness: ScopedFreshness;
  completeness: "PARTIAL";
  /** The authority the body states about itself: authorized rows only, visible-row totals, never a full portfolio. */
  authority: {
    visibility: "SCOPED";
    coverage: "AUTHORIZED_ONLY";
    totalsScope: "VISIBLE_ROWS_ONLY";
    isFullPortfolio: false;
    readScope: readonly { book: ScopedEnvironment; policyRevision: string | null }[];
  };
  actor: { userId: string; username: string; role: "ADMIN" | "USER" };
  projection: readonly { book: ScopedEnvironment; payloadDigest: string }[];
  capabilities: readonly ScopedCapability[];
  unavailableBranches: readonly ScopedUnavailableBranch[];
  panels: Readonly<Record<ScopedRelation, ScopedPanel>>;
  /** `null` for an `empty` body (`data: {}`) and for the bounded shape; otherwise the rows the body carries. */
  rows: Readonly<Record<ScopedRelation, readonly ScopedRow[]>> | null;
  summary: ScopedAlphaSummary | null;
  /** The bounded shape's own statement. */
  bounded: { alphaId: string; reasonCode: typeof BOUNDED_REASON } | null;
  profileCoverage: readonly ScopedProfileCoverage[];
}

/* ── primitives ───────────────────────────────────────────────────────────── */

type Rec = Record<string, unknown>;
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

function rec(value: unknown): Rec | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Rec : null;
}
const has = (r: Rec, key: string): boolean => Object.prototype.hasOwnProperty.call(r, key);

/** Exactly these keys (all required). */
function closed(value: unknown, keys: readonly string[]): Rec | null {
  const r = rec(value);
  if (r === null) return null;
  const own = Object.keys(r);
  return own.length === keys.length && keys.every((key) => has(r, key)) ? r : null;
}
/** Only these keys; `required` of them must be present. */
function subset(value: unknown, allowed: readonly string[], required: readonly string[]): Rec | null {
  const r = rec(value);
  if (r === null) return null;
  return Object.keys(r).every((key) => allowed.includes(key)) && required.every((key) => has(r, key)) ? r : null;
}

const CONTROL = /[\u0000-\u001f\u007f]/;
/** The contract's text: 1 to 512 characters, no control character. */
function text(value: unknown, max = 512): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= max && !CONTROL.test(value) ? value : null;
}
/** `undefined` = refused; `null` = a stated null. */
function nullableText(value: unknown): string | null | undefined {
  return value === null ? null : text(value) ?? undefined;
}
const DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const NEGATIVE_ZERO = /^-0+(\.0+)?$/;
function decimal(value: unknown): string | null {
  return typeof value === "string" && value.length <= 128 && DECIMAL.test(value) && !NEGATIVE_ZERO.test(value) ? value : null;
}
const COUNTER = /^(?:0|[1-9][0-9]*)$/;
function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_SAFE ? value : null;
}
function instant(value: unknown): UtcEpochMs | null {
  const at = readUtcEpochMs(value);
  return at !== null && at >= 0 ? at : null;
}
function oneOf<T extends string>(value: unknown, words: readonly T[]): T | null {
  return typeof value === "string" && (words as readonly string[]).includes(value) ? value as T : null;
}
function book(value: unknown): ScopedEnvironment | null {
  return oneOf(value, SCOPED_ENVIRONMENTS);
}
/** Total-count string: the contract's `^(?:0|[1-9][0-9]*)$`. `undefined` = refused. */
function totalString(value: unknown): string | null | undefined {
  return value === null ? null : typeof value === "string" && COUNTER.test(value) && value.length <= 20 ? value : undefined;
}

/* ── rows ─────────────────────────────────────────────────────────────────── */

function readCell(kind: Kind, value: unknown): ScopedCell | null {
  if (value === null) return kind === "I" ? null : { kind: "absent" };
  switch (kind) {
    case "T": { const t = text(value); return t === null ? null : { kind: "text", text: t }; }
    case "D": { const d = decimal(value); return d === null ? null : { kind: "decimal", exact: d }; }
    case "M": { const b = book(value); return b === null ? null : { kind: "book", book: b }; }
    case "B": return typeof value === "boolean" ? { kind: "boolean", value } : null;
    case "I": { const n = integer(value); return n === null ? null : { kind: "integer", value: n }; }
    case "S": {
      if (typeof value === "string") { const t = text(value); return t === null ? null : { kind: "stamp-text", text: t }; }
      const n = integer(value);
      return n === null ? null : { kind: "integer", value: n };
    }
    case "L": return oneOf(value, LIQUIDITY_SIDES) === null ? null : { kind: "text", text: value as string };
    case "N": return oneOf(value, PORTFOLIO_NAME_REASONS) === null ? null : { kind: "text", text: value as string };
    case "C": {
      if (typeof value === "string") return value.length <= 20 && COUNTER.test(value) ? { kind: "counter", exact: value } : null;
      const n = integer(value);
      return n === null ? null : { kind: "integer", value: n };
    }
  }
}

function readRow(relation: ScopedRelation, value: unknown): ScopedRow | null {
  const fields = SCOPED_ROW_FIELDS[relation];
  const r = subset(value, ["profile_environment", ...Object.keys(fields)], ["profile_environment"]);
  const rowBook = book(r?.profile_environment);
  if (r === null || rowBook === null) return null;
  const cells: Record<string, ScopedCell> = {};
  for (const [key, raw] of Object.entries(r)) {
    if (key === "profile_environment") continue;
    const cell = readCell(fields[key], raw);
    if (cell === null) return null;
    cells[key] = cell;
  }
  // Package 6: a stated portfolio name carries no reason, and a name that is stated absent says why (a legacy row states neither key).
  const name = cells.portfolio_name, reason = cells.portfolio_name_reason_code;
  if (name !== undefined && reason !== undefined && (name.kind === "text") === (reason.kind === "text")) return null;
  return { book: rowBook, cells };
}

function readRows(relation: ScopedRelation, value: unknown): ScopedRow[] | null {
  if (!Array.isArray(value) || value.length > 200) return null;
  const rows: ScopedRow[] = [];
  for (const entry of value) {
    const row = readRow(relation, entry);
    if (row === null) return null;
    rows.push(row);
  }
  return rows;
}

/* ── panels ───────────────────────────────────────────────────────────────── */

const NULL_CLOCKS = ["event_time_ms", "source_published_at_ms", "received_at_ms", "ingested_at_ms", "processed_at_ms", "as_of_ms"] as const;

function readPanel(name: ScopedRelation, value: unknown): ScopedPanel | null {
  const p = closed(value, ["state", "data", "clocks", "coverage", "source_history_semantics", "formula", "reason_code", "retryable"]);
  const clocks = closed(p?.clocks, [...NULL_CLOCKS, "read_at_ms"]);
  const coverage = closed(p?.coverage, [
    "from_ms", "to_ms", "source_total", "filtered_total", "returned_count", "truncated", "downsampled", "has_more", "next_cursor", "gaps",
  ]);
  if (p === null || clocks === null || coverage === null) return null;
  const state = oneOf(p.state, PANEL_STATES);
  const reasonCode = nullableText(p.reason_code);
  const readAt = instant(clocks.read_at_ms);
  const sourceTotal = totalString(coverage.source_total);
  const filteredTotal = totalString(coverage.filtered_total);
  const returned = integer(coverage.returned_count);
  const semantics = RANGE_PANELS.has(name) ? "RETAINED_RANGE_OR_CURRENT_WINDOW" : "CURRENT_STATE_ONLY";
  if (
    state === null || reasonCode === undefined || readAt === null || sourceTotal === undefined || filteredTotal === undefined || returned === null || returned > 200
    || p.source_history_semantics !== semantics || p.formula !== null || typeof p.retryable !== "boolean"
    || NULL_CLOCKS.some((key) => clocks[key] !== null)
    || coverage.from_ms !== null || coverage.to_ms !== null || typeof coverage.truncated !== "boolean" || coverage.downsampled !== false
    || typeof coverage.has_more !== "boolean" || coverage.next_cursor !== null || !Array.isArray(coverage.gaps) || coverage.gaps.length !== 0
  ) return null;
  let panelRowCount = 0;
  if (p.data !== null) {
    const data = closed(p.data, ["rows"]);
    const rows = data === null ? null : readRows(name, data.rows);
    if (rows === null) return null;
    panelRowCount = rows.length;
  }
  return {
    name, state, reasonCode, retryable: p.retryable, sourceTotal, filteredTotal, panelRowCount, returnedCount: returned,
    truncated: coverage.truncated, hasMore: coverage.has_more, historySemantics: semantics, readAtMs: readAt,
  };
}

/* ── summary and the small members ────────────────────────────────────────── */

const SUMMARY_OPTIONAL_TEXT = ["alpha_id", "portfolio_id", "account_id", "binding_id", "name", "display_name", "version", "state", "base_currency"] as const;

/** BE-P15: which identity members of an Alpha the body does not state, and why. Typed absence, never a placeholder name. */
export const IDENTITY_ABSENCE_MEMBERS = ["name", "version", "owner", "stage"] as const;
export const IDENTITY_ABSENCE_REASONS = [
  "ALPHA_NAME_NOT_IN_SOURCE", "ALPHA_NAME_NOT_IN_POLICY", "ALPHA_VERSION_NOT_IN_SOURCE", "ALPHA_VERSION_NOT_IN_POLICY",
  "ALPHA_OWNER_NOT_MAPPED_TO_PORTAL_USER", "ALPHA_STAGE_NOT_PUBLISHED_BY_SOURCE",
] as const;
export const DEPLOYMENT_FINANCIAL_REASONS = [
  "DEPLOYMENT_FINANCIALS_RELATION_NOT_BOUND_FOR_PROFILE", "DEPLOYMENT_FINANCIALS_RELATION_UNAVAILABLE", "DEPLOYMENT_FINANCIAL_SNAPSHOT_NOT_PUBLISHED",
  "DEPLOYMENT_FINANCIAL_SNAPSHOT_AMBIGUOUS", "DEPLOYMENT_FINANCIAL_WINDOW_TRUNCATED",
] as const;
export const DEPLOYMENT_FINANCIAL_BASIS = "LATEST_VISIBLE_ACCOUNT_EQUITY_SNAPSHOT_ROW";

export interface ScopedDeploymentFinancial {
  book: ScopedEnvironment;
  deploymentId: string;
  /** PARTIAL: the Portal cut the window, a later row may exist. UNAVAILABLE: no figure, `reasonCode` says why (never zero). */
  state: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
  reasonCode: (typeof DEPLOYMENT_FINANCIAL_REASONS)[number] | null;
  /** The published snapshot row's instant, UTC epoch ms. */
  snapshotAtMs: number | null;
  currency: string | null;
  /** Exact decimals of ONE published row. The source does not say whether the row is the deployment's or its shared account's; nothing is summed. */
  netPnl: string | null;
  equity: string | null;
}

function readDeploymentFinancial(value: unknown): ScopedDeploymentFinancial | null {
  const f = closed(value, ["profile_environment", "deployment_id", "state", "reason_code", "basis", "snapshot_at_ms", "currency", "net_pnl", "equity"]);
  const rowBook = book(f?.profile_environment);
  const deploymentId = text(f?.deployment_id);
  const state = oneOf(f?.state, ["AVAILABLE", "PARTIAL", "UNAVAILABLE"] as const);
  const reasonCode = f?.reason_code === null ? null : oneOf(f?.reason_code, DEPLOYMENT_FINANCIAL_REASONS);
  const at = f?.snapshot_at_ms === null ? null : integer(f?.snapshot_at_ms);
  const currency = nullableText(f?.currency);
  const netPnl = f?.net_pnl === null ? null : decimal(f?.net_pnl);
  const equity = f?.equity === null ? null : decimal(f?.equity);
  if (
    f === null || rowBook === null || deploymentId === null || state === null || (f.reason_code !== null && reasonCode === null) || f.basis !== DEPLOYMENT_FINANCIAL_BASIS
    || (f.snapshot_at_ms !== null && at === null) || currency === undefined || (f.net_pnl !== null && netPnl === null) || (f.equity !== null && equity === null)
  ) return null;
  return { book: rowBook, deploymentId, state, reasonCode, snapshotAtMs: at, currency, netPnl, equity };
}

function readMetric(value: unknown): { state: (typeof AVAILABILITY)[number]; reasonCode: string | null } | null {
  const m = closed(value, ["state", "reason_code"]);
  const state = oneOf(m?.state, AVAILABILITY);
  const reasonCode = nullableText(m?.reason_code);
  return m === null || state === null || reasonCode === undefined ? null : { state, reasonCode };
}

function readSummary(value: unknown): ScopedAlphaSummary | null {
  const s = subset(value, [
    "kind", "id", "visibility", "coverage", "financial_summary", "deployments", "portfolios", "metrics_availability", ...SUMMARY_OPTIONAL_TEXT,
    "identity_absences", "deployment_financials",
  ], ["kind", "id", "visibility", "coverage", "financial_summary", "deployments", "portfolios", "metrics_availability"]);
  const id = text(s?.id);
  const financial = closed(s?.financial_summary, ["state", "reason_code"]);
  const metrics = closed(s?.metrics_availability, ["account_balance", "current_position_pnl", "equity_series"]);
  if (
    s === null || id === null || s.kind !== "ALPHA" || s.visibility !== "SCOPED" || s.coverage !== "AUTHORIZED_ONLY"
    || financial === null || financial.state !== "UNAVAILABLE" || financial.reason_code !== NO_TOTALS_REASON || metrics === null
  ) return null;
  const optional: Record<string, string | null> = {};
  for (const key of SUMMARY_OPTIONAL_TEXT) {
    if (!has(s, key)) { optional[key] = null; continue; }
    const read = nullableText(s[key]);
    if (read === undefined) return null;
    optional[key] = read;
  }
  const deployments = readRows("deployments", s.deployments);
  if (deployments === null || !Array.isArray(s.portfolios) || s.portfolios.length > 200) return null;
  const portfolios: ScopedAlphaSummary["portfolios"][number][] = [];
  for (const entry of s.portfolios) {
    const p = subset(entry, ["portfolio_id", "name", "display_name"], []);
    if (p === null) return null;
    const read = { portfolio_id: null as string | null, name: null as string | null, display_name: null as string | null };
    for (const key of ["portfolio_id", "name", "display_name"] as const) {
      if (!has(p, key)) continue;
      const t = nullableText(p[key]);
      if (t === undefined) return null;
      read[key] = t;
    }
    portfolios.push({ portfolioId: read.portfolio_id, name: read.name, displayName: read.display_name });
  }
  const identityAbsences: ScopedAlphaSummary["identityAbsences"][number][] = [];
  if (has(s, "identity_absences")) {
    if (!Array.isArray(s.identity_absences) || s.identity_absences.length > 4) return null;
    for (const entry of s.identity_absences) {
      const a = closed(entry, ["member", "reason_code"]);
      const member = oneOf(a?.member, IDENTITY_ABSENCE_MEMBERS);
      const reason = oneOf(a?.reason_code, IDENTITY_ABSENCE_REASONS);
      if (member === null || reason === null) return null;
      identityAbsences.push({ member, reasonCode: reason });
    }
  }
  const deploymentFinancials: ScopedDeploymentFinancial[] = [];
  if (has(s, "deployment_financials")) {
    if (!Array.isArray(s.deployment_financials) || s.deployment_financials.length > 200) return null;
    for (const entry of s.deployment_financials) {
      const read = readDeploymentFinancial(entry);
      if (read === null) return null;
      deploymentFinancials.push(read);
    }
  }
  const balance = readMetric(metrics.account_balance);
  const pnl = readMetric(metrics.current_position_pnl);
  const equity = readMetric(metrics.equity_series);
  if (balance === null || pnl === null || equity === null) return null;
  return {
    id, alphaId: optional.alpha_id, name: optional.name, displayName: optional.display_name, version: optional.version, state: optional.state,
    identityAbsences, deploymentFinancials, deployments, portfolios,
    metrics: { account_balance: balance, current_position_pnl: pnl, equity_series: equity },
    financialSummary: { state: "UNAVAILABLE", reasonCode: NO_TOTALS_REASON },
  };
}

function readCapability(value: unknown): ScopedCapability | null {
  const c = closed(value, ["capability_id", "state", "relations", "reason_code", "retryable"]);
  const capabilityId = text(c?.capability_id);
  const state = oneOf(c?.state, AVAILABILITY);
  const reasonCode = nullableText(c?.reason_code);
  if (
    c === null || capabilityId === null || state === null || reasonCode === undefined || !Array.isArray(c.relations) || c.relations.length !== 0
    || typeof c.retryable !== "boolean"
  ) return null;
  return { capabilityId, state, reasonCode, retryable: c.retryable };
}

function readBranch(value: unknown): ScopedUnavailableBranch | null {
  const r = rec(value);
  if (r === null) return null;
  const withBook = has(r, "environment");
  const b = closed(value, withBook ? ["capability_id", "environment", "state", "reason_code", "retryable"] : ["capability_id", "state", "reason_code", "retryable"]);
  const capabilityId = text(b?.capability_id);
  const state = oneOf(b?.state, ["EMPTY", "PARTIAL", "UNAVAILABLE"] as const);
  const reasonCode = nullableText(b?.reason_code);
  const environment = withBook ? book(b?.environment) : null;
  if (
    b === null || capabilityId === null || state === null || reasonCode === undefined || typeof b.retryable !== "boolean"
    || (withBook && (environment === null || capabilityId !== "resource.identity"))
  ) return null;
  return { capabilityId, environment, state, reasonCode, retryable: b.retryable };
}

function readList<T>(value: unknown, max: number, read: (entry: unknown) => T | null, min = 0): T[] | null {
  if (!Array.isArray(value) || value.length > max || value.length < min) return null;
  const out: T[] = [];
  for (const entry of value) {
    const item = read(entry);
    if (item === null) return null;
    out.push(item);
  }
  return out;
}

function readProfileCoverage(value: unknown): ScopedProfileCoverage[] | null {
  const c = subset(value, [...SCOPED_ENVIRONMENTS], []);
  if (c === null) return null;
  const out: ScopedProfileCoverage[] = [];
  for (const key of SCOPED_ENVIRONMENTS) {
    if (!has(c, key)) continue;
    const e = closed(c[key], ["profile_id", "state", "reason_code", "projection_epoch", "projection_sequence", "source_as_of"]);
    const profileId = nullableText(e?.profile_id);
    const state = oneOf(e?.state, COVERAGE_STATES);
    const reasonCode = nullableText(e?.reason_code);
    if (e === null || profileId === undefined || state === null || reasonCode === undefined || e.projection_epoch !== null || e.projection_sequence !== null || e.source_as_of !== null) return null;
    out.push({ book: key, profileId, state, reasonCode });
  }
  return out;
}

const DIGEST = /^sha256:[a-f0-9]{64}$/;

/* ── the body ─────────────────────────────────────────────────────────────── */

const TOP_KEYS = [
  "schema_version", "record_authority", "source_authority", "delivery_profile", "workspace_id", "requested_environment", "selected_environment", "resource",
  "read_at_ms", "as_of_ms", "read_at", "as_of", "state", "freshness", "completeness", "projection", "capabilities", "panels", "unavailable_branches", "actor",
  "visibility", "coverage", "totals_scope", "is_full_portfolio", "read_scope", "data",
] as const;

const DATA_FULL_KEYS = [...ALPHA_SCOPED_RELATIONS, "alpha", "profile_coverage"] as const;

export function readAlphaResourceScoped(raw: unknown): AlphaResourceScoped | null {
  const r = closed(raw, TOP_KEYS);
  if (
    r === null || r.schema_version !== ALPHA_RESOURCE_V2_SCHEMA || r.record_authority !== "PORTAL_CONTROL" || r.source_authority !== "TRADING_SYSTEM"
    || r.visibility !== "SCOPED" || r.coverage !== "AUTHORIZED_ONLY" || r.totals_scope !== "VISIBLE_ROWS_ONLY" || r.is_full_portfolio !== false
    || r.completeness !== "PARTIAL" || r.as_of_ms !== null || r.as_of !== null
  ) return null;
  const deliveryProfile = text(r.delivery_profile);
  const workspaceId = text(r.workspace_id);
  const requestedEnvironment = oneOf(r.requested_environment, ["all", ...SCOPED_ENVIRONMENTS] as const);
  const selectedEnvironment = r.selected_environment === null ? null : book(r.selected_environment);
  const resource = subset(r.resource, ["kind", "id", "label"], ["kind", "id"]);
  const resourceId = text(resource?.id);
  const label = resource !== null && has(resource, "label") ? text(resource.label) : null;
  const readAtMs = integer(r.read_at_ms) === null ? null : instant(r.read_at_ms);
  const state = oneOf(r.state, RESOURCE_STATES);
  const freshness = oneOf(r.freshness, FRESHNESS);
  const actor = closed(r.actor, ["user_id", "username", "roles"]);
  const role = Array.isArray(actor?.roles) && actor.roles.length === 1 ? oneOf(actor.roles[0], ["ADMIN", "USER"] as const) : null;
  const userId = text(actor?.user_id);
  const username = text(actor?.username);
  if (
    deliveryProfile === null || workspaceId === null || requestedEnvironment === null
    || (r.selected_environment !== null && selectedEnvironment === null) || resource === null || resource.kind !== "ALPHA" || resourceId === null
    || (has(resource, "label") && label === null) || readAtMs === null || text(r.read_at) === null || state === null || freshness === null
    || actor === null || role === null || userId === null || username === null
  ) return null;

  const projection = readList(r.projection, 3, (entry) => {
    const p = closed(entry, ["environment", "epoch", "sequence", "payload_digest", "last_successful_refresh_at"]);
    const b = book(p?.environment);
    return p !== null && b !== null && p.epoch === null && p.sequence === null && p.last_successful_refresh_at === null
      && typeof p.payload_digest === "string" && DIGEST.test(p.payload_digest) ? { book: b, payloadDigest: p.payload_digest } : null;
  });
  const capabilities = readList(r.capabilities, 19, readCapability);
  const unavailableBranches = readList(r.unavailable_branches, 21, readBranch);
  const readScope = readList(r.read_scope, 3, (entry) => {
    const s = closed(entry, ["environment", "policy_revision"]);
    const b = book(s?.environment);
    const revision = nullableText(s?.policy_revision);
    return s !== null && b !== null && revision !== undefined ? { book: b, policyRevision: revision } : null;
  }, 1);
  const panelRoot = closed(r.panels, ALPHA_SCOPED_RELATIONS);
  if (projection === null || capabilities === null || unavailableBranches === null || readScope === null || panelRoot === null) return null;
  const panels = {} as Record<ScopedRelation, ScopedPanel>;
  for (const name of ALPHA_SCOPED_RELATIONS) {
    const panel = readPanel(name, panelRoot[name]);
    if (panel === null) return null;
    panels[name] = panel;
  }

  const common = {
    schemaVersion: ALPHA_RESOURCE_V2_SCHEMA as typeof ALPHA_RESOURCE_V2_SCHEMA, workspaceId, deliveryProfile, requestedEnvironment, selectedEnvironment,
    resource: { id: resourceId, label }, readAtMs, state, freshness, completeness: "PARTIAL" as const,
    authority: { visibility: "SCOPED" as const, coverage: "AUTHORIZED_ONLY" as const, totalsScope: "VISIBLE_ROWS_ONLY" as const, isFullPortfolio: false as const, readScope },
    actor: { userId, username, role }, projection, capabilities, unavailableBranches, panels,
  };

  // `data: {}` is the empty body; the bounded body names its own cut; the full body carries all twenty members.
  const data = rec(r.data);
  if (data === null) return null;
  if (Object.keys(data).length === 0) {
    return { ...common, shape: "empty", rows: null, summary: null, bounded: null, profileCoverage: [] };
  }
  if (!has(data, "deployments")) {
    // Bounded: `state` is `partial` and `data` is exactly `{ alpha: { id, state, reason_code }, profile_coverage }`.
    const d = closed(data, ["alpha", "profile_coverage"]);
    const alpha = closed(d?.alpha, ["id", "state", "reason_code"]);
    const alphaId = text(alpha?.id);
    const coverage = readProfileCoverage(d?.profile_coverage);
    if (d === null || alpha === null || alphaId === null || alpha.state !== "PARTIAL" || alpha.reason_code !== BOUNDED_REASON || coverage === null || state !== "partial") return null;
    return { ...common, shape: "bounded", rows: null, summary: null, bounded: { alphaId, reasonCode: BOUNDED_REASON }, profileCoverage: coverage };
  }
  const full = closed(data, DATA_FULL_KEYS);
  if (full === null) return null;
  const rows = {} as Record<ScopedRelation, readonly ScopedRow[]>;
  for (const name of ALPHA_SCOPED_RELATIONS) {
    const read = readRows(name, full[name]);
    if (read === null) return null;
    rows[name] = read;
  }
  const summary = readSummary(full.alpha);
  const coverage = readProfileCoverage(full.profile_coverage);
  if (summary === null || coverage === null) return null;
  return { ...common, shape: "full", rows, summary, bounded: null, profileCoverage: coverage };
}

/* ── cell accessors the model uses (a member the body did not state, or stated null, is `null`) ── */

export function cellText(row: ScopedRow, key: string): string | null {
  const cell = row.cells[key];
  return cell !== undefined && cell.kind === "text" ? cell.text : null;
}
export function cellDecimal(row: ScopedRow, key: string): string | null {
  const cell = row.cells[key];
  return cell !== undefined && cell.kind === "decimal" ? cell.exact : null;
}
export function cellBook(row: ScopedRow, key: string): ScopedEnvironment | null {
  const cell = row.cells[key];
  return cell !== undefined && cell.kind === "book" ? cell.book : null;
}
/** An epoch-ms member (`created_at_ms`, `updated_at_ms`, ...). Only the `_ms` members are instants. */
export function cellInstant(row: ScopedRow, key: string): UtcEpochMs | null {
  const cell = row.cells[key];
  return cell !== undefined && cell.kind === "integer" ? instant(cell.value) : null;
}
/** A stamp written as text, as stated; not parsed. */
export function cellStampText(row: ScopedRow, key: string): string | null {
  const cell = row.cells[key];
  return cell !== undefined && cell.kind === "stamp-text" ? cell.text : null;
}
