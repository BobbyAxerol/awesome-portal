/**
 * EDS-11R1 named relation BFF — `GET /api/v1/execution/manager/current/:routeId`
 * (codex, FRONTEND_HANDOFF §8.54). One checked-in Portal operation alias per
 * screen-bound Manager relation (orders, fills, order-brackets, …); the
 * browser never names a relation, cursor or source. A page returns
 * `records[{resource_id, values}]` with the registry's field kinds — DECIMAL
 * and TEXT as strings, TIMESTAMP as UTC milliseconds, INTEGER as numbers —
 * plus a Portal continuation. This reader keeps that shape, converts nothing
 * except TIMESTAMP → ISO for the replay model, and reports coverage honestly:
 * a page set drained to its end is the relation's current page set, not
 * subject history (BR-EX-81 still owns that).
 */
export const RELATION_ROUTES = {
  orders: "orders", fills: "fills", strategies: "strategies", strategyDeployments: "strategy-deployments",
  orderBrackets: "order-brackets", orderBracketLegs: "order-bracket-legs",
  conditionalGroups: "conditional-order-groups", conditionalGroupLegs: "conditional-order-group-legs",
  capitalLedger: "portfolio-capital-ledger", portfolioEquitySnapshots: "portfolio-equity-snapshots",
  sizingDecisions: "sizing-decisions", executionSessions: "execution-sessions", commandJournal: "command-journal",
  brokerAccountSync: "broker-account-sync-current-state", reconciliationFindings: "reconciliation-findings",
} as const;
export type RelationRoute = (typeof RELATION_ROUTES)[keyof typeof RELATION_ROUTES];
export type RelationScalar = string | number | boolean | null;
export type RelationEnvironment = "paper" | "sandbox" | "live";

export interface RelationRecord { resourceId: string; values: Record<string, RelationScalar> }
export interface RelationPage {
  schemaVersion: string;
  operationId: string | null;
  environment: string | null;
  profileId: string | null;
  state: string;
  historySemantics: string | null;
  retentionSemantics: string | null;
  sourceHealth: { availability: string | null; freshness: string | null; completeness: string | null; asOfMs: number | null };
  page: { nextCursor: string | null; hasMore: boolean; totalUnknown: boolean; maximumPageRows: number | null; truncated: boolean };
  records: RelationRecord[];
}

const obj = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function readRelationPage(raw: unknown): RelationPage | null {
  const root = obj(raw);
  const schema = str(root.schema_version);
  if (!schema) return null;
  const health = obj(root.source_health);
  const page = obj(root.page);
  const records: RelationRecord[] = (Array.isArray(root.records) ? root.records : []).flatMap((row) => {
    const r = obj(row);
    const id = str(r.resource_id);
    if (!id) return [];
    const values: Record<string, RelationScalar> = {};
    for (const [k, v] of Object.entries(obj(r.values))) {
      if (v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) values[k] = v;
    }
    return [{ resourceId: id, values }];
  });
  return {
    schemaVersion: schema,
    operationId: str(root.logical_operation_id),
    environment: str(root.environment),
    profileId: str(root.profile_id),
    state: str(root.state) ?? "UNAVAILABLE",
    historySemantics: str(root.source_history_semantics),
    retentionSemantics: str(root.source_retention_semantics),
    sourceHealth: { availability: str(health.availability), freshness: str(health.freshness), completeness: str(health.completeness), asOfMs: int(health.as_of_ms) },
    page: { nextCursor: str(page.next_cursor), hasMore: page.has_more === true, totalUnknown: page.total_unknown !== false, maximumPageRows: int(page.maximum_page_rows), truncated: page.truncated === true },
    records,
  };
}

export interface RelationPageQuery { routeId: RelationRoute | string; environment: RelationEnvironment; limit?: number; cursor?: string | null }

export function relationPagePath(q: RelationPageQuery): string {
  const params = new URLSearchParams({ environment: q.environment, limit: String(Math.max(1, Math.min(200, Math.round(q.limit ?? 200)))) });
  if (q.cursor) params.set("cursor", q.cursor);
  return `/manager/current/${encodeURIComponent(q.routeId)}?${params.toString()}`;
}

/** TIMESTAMP fields arrive as UTC milliseconds; the replay model reads ISO strings. */
const TIMESTAMP_FIELDS = new Set(["submitted_at", "updated_at", "created_at", "trade_time", "filled_at", "cancelled_at", "completed_at", "settled_at", "closed_at", "opened_at", "started_at", "event_time", "triggered_at", "expires_at", "ts"]);
export function relationRow(record: RelationRecord): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record.values)) {
    out[k] = TIMESTAMP_FIELDS.has(k) && typeof v === "number" ? new Date(v).toISOString() : v;
  }
  return out;
}

export type RelationRead = (q: RelationPageQuery) => Promise<{ ok: true; value: RelationPage } | { ok: false; status: string; reason: string }>;

export interface Drained {
  rows: Record<string, unknown>[];
  pages: number;
  /** the walk reached the relation's end (has_more false) within the page cap */
  exhausted: boolean;
  state: string;
  completeness: string | null;
  freshness: string | null;
  asOfMs: number | null;
  reason: string | null;
}

/** Retry pauses for one page — the Manager connection is shared with the projection worker, so a page can fail for a second or two. */
export const RETRY_DELAYS_MS: readonly number[] = [400, 1500];
const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

/**
 * A refusal that waiting cannot change.
 *
 * These codes mean the source read the request and declined its shape — it
 * publishes `retryable: false` beside them. `portfolio-equity-snapshots`
 * serves its first page of 5 and then refuses the continuation cursor with
 * exactly this, so each drain spent three requests and two seconds learning
 * the same answer.
 */
const CONTRACT_REJECTIONS = [
  "N17B_SOURCE_REJECTED",
  "MANAGER_V2_SOURCE_CONTRACT_REJECTED",
  "EDS11R_SOURCE_CONTRACT_REJECTED",
  "EDS01_SOURCE_CONTRACT_REJECTED",
] as const;

function refusedOnContract(reason: string | null | undefined): boolean {
  return typeof reason === "string" && CONTRACT_REJECTIONS.some((code) => reason.includes(code));
}

/**
 * One page, retried after each pause in `RETRY_DELAYS_MS`.
 *
 * `retry: false` is for the probe reads that step the page size down: a source
 * refusing a page of 200 will refuse it again in 1.5 seconds, and waiting four
 * times over is how a walk that should take a second takes eight. A contract
 * rejection is the same argument at any page size, so it also returns at once.
 */
async function readPage(read: RelationRead, q: RelationPageQuery, retry = true): Promise<Awaited<ReturnType<RelationRead>>> {
  let result = await read(q);
  if (!retry || (!result.ok && refusedOnContract(result.reason))) return result;
  for (const delay of RETRY_DELAYS_MS) {
    if (result.ok) return result;
    await sleep(delay);
    result = await read(q);
    if (!result.ok && refusedOnContract(result.reason)) return result;
  }
  return result;
}

export const DRAIN_CANCELLED = "DRAIN_CANCELLED";
/** The source published a next cursor and then refused it; the rows we hold are all it will serve. */
export const CONTINUATION_REFUSED = "CONTINUATION_REFUSED_BY_SOURCE";

/**
 * Page sizes to try, largest first.
 *
 * Not every relation accepts the same page. `portfolio-equity-snapshots`
 * answers a page of 5 and refuses 8 with `N17B_SOURCE_REJECTED` (measured on
 * dev 2026-09-07), so a fixed 200 read it as "unavailable" when it was in fact
 * readable. The walk steps down rather than giving up, and reports the size it
 * settled on so the screen can say how the rows were fetched.
 */
export const PAGE_SIZES: readonly number[] = [200, 50, 20, 5];

/**
 * The page size a relation was last seen to accept, for this tab's lifetime.
 *
 * Without it the walk re-probes from 200 on every drain, and a relation that
 * refuses 200 produces one guaranteed 502 per refresh — on dev the Portfolio
 * 360 console filled with them while the panels beside it were showing real
 * rows the retry had fetched. Remembering the size makes that probe happen
 * once. It is a cache of the source's answer, never of the rows: a relation
 * that starts accepting 200 again is only ever read in smaller pages, which
 * costs pages, not truth.
 */
const acceptedPageSize = new Map<string, number>();

/**
 * `sessionStorage`, so the lesson survives a reload.
 *
 * A module Map alone is reset by every full page load, which is exactly when
 * an operator is most likely to be watching the console. Per tab, never
 * shared, and holding one small integer per relation: if it is unavailable or
 * throws — a private window, storage blocked — the walk simply probes as it
 * did before.
 */
const PAGE_SIZE_STORE = "exec.relation.page-size.v1";
const REFUSED_CURSOR_STORE = "exec.relation.refused-cursor.v1";

/**
 * Relations whose continuation the source refused, and when.
 *
 * `portfolio-equity-snapshots` holds five rows, reports `has_more: true` at the
 * end of them, and refuses the cursor it just handed out — at every page size,
 * down to one row (walked on dev 2026-09-08: 9 requests, 8 refusals, 5 rows).
 *
 * Keyed by the relation, not by the cursor: the Portal mints a fresh
 * continuation id on every page-one read, so a cursor key would never match
 * itself twice and the walk would re-ask on every drain — which is what it did
 * before this was measured.
 *
 * The timestamp is what keeps it honest. A refusal is respected for
 * `REFUSAL_TTL_MS` and then tried again, so a source that starts honouring its
 * continuations is picked up on its own without the operator opening a new
 * tab; and until then the drain is quiet instead of failing once a minute.
 */
const refusedContinuations = new Map<string, number>();
const REFUSAL_TTL_MS = 10 * 60_000;

function readStoredSizes(): void {
  try {
    const raw = window.sessionStorage?.getItem(PAGE_SIZE_STORE);
    if (raw) {
      for (const [key, size] of Object.entries(JSON.parse(raw) as Record<string, unknown>)) {
        if (typeof size === "number" && PAGE_SIZES.includes(size)) acceptedPageSize.set(key, size);
      }
    }
    const refused = window.sessionStorage?.getItem(REFUSED_CURSOR_STORE);
    if (refused) {
      for (const [key, at] of Object.entries(JSON.parse(refused) as Record<string, unknown>)) {
        if (typeof at === "number") refusedContinuations.set(key, at);
      }
    }
  } catch { /* a lesson we cannot read is a lesson we re-learn */ }
}

function rememberRefusedContinuation(key: string): void {
  refusedContinuations.set(key, Date.now());
  try {
    window.sessionStorage?.setItem(REFUSED_CURSOR_STORE, JSON.stringify(Object.fromEntries(refusedContinuations)));
  } catch { /* storage refused; the in-memory map still spares this tab */ }
}

/** True while a recent refusal still stands. An expired one is forgotten here. */
function continuationRefused(key: string): boolean {
  const at = refusedContinuations.get(key);
  if (at === undefined) return false;
  if (Date.now() - at < REFUSAL_TTL_MS) return true;
  refusedContinuations.delete(key);
  return false;
}

function rememberSize(key: string, size: number): void {
  if (acceptedPageSize.get(key) === size) return;
  acceptedPageSize.set(key, size);
  try {
    window.sessionStorage?.setItem(PAGE_SIZE_STORE, JSON.stringify(Object.fromEntries(acceptedPageSize)));
  } catch { /* storage refused; the in-memory map still spares this tab */ }
}

if (typeof window !== "undefined") readStoredSizes();

/** Forget the learned page sizes. Exported for tests, which must not leak state between cases. */
export function resetAcceptedPageSizes(): void {
  acceptedPageSize.clear();
  refusedContinuations.clear();
  try {
    window.sessionStorage?.removeItem(PAGE_SIZE_STORE);
    window.sessionStorage?.removeItem(REFUSED_CURSOR_STORE);
  } catch { /* nothing to forget */ }
}

/** Walk a relation's current page set with the Portal continuation, stepping the page size down when the source refuses one; a cancelled walk stops before its next page and says so. */
export async function drainRelation(read: RelationRead, routeId: RelationRoute | string, environment: RelationEnvironment, maxPages = 40, isCancelled: () => boolean = () => false): Promise<Drained> {
  const rows: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  let pages = 0;
  let last: RelationPage | null = null;
  const learned = acceptedPageSize.get(`${environment}:${routeId}`);
  let sizeIndex = learned === undefined ? 0 : Math.max(0, PAGE_SIZES.indexOf(learned));
  for (let i = 0; i < maxPages; i += 1) {
    if (isCancelled()) return { rows, pages, exhausted: false, state: last?.state ?? "PARTIAL", completeness: last?.sourceHealth.completeness ?? null, freshness: last?.sourceHealth.freshness ?? null, asOfMs: last?.sourceHealth.asOfMs ?? null, reason: DRAIN_CANCELLED };
    // A cursor this source already refused is not asked for again: the answer
    // cannot have changed while the cursor has not. The walk ends on the rows
    // it holds and reports the relation partial, which is what it is.
    if (cursor !== null && continuationRefused(`${environment}:${routeId}`)) {
      return { rows, pages, exhausted: false, state: "PARTIAL", completeness: last?.sourceHealth.completeness ?? null, freshness: last?.sourceHealth.freshness ?? null, asOfMs: last?.sourceHealth.asOfMs ?? null, reason: CONTINUATION_REFUSED };
    }
    const stepping = pages === 0 && sizeIndex < PAGE_SIZES.length - 1;
    const result = await readPage(read, { routeId, environment, limit: PAGE_SIZES[sizeIndex], cursor }, !stepping);
    if (!result.ok && pages === 0 && sizeIndex < PAGE_SIZES.length - 1) {
      // The source refused this page size and has given us nothing yet: try a
      // smaller one before calling the relation unavailable.
      sizeIndex += 1;
      i -= 1;
      continue;
    }
    if (!result.ok) {
      // A continuation refused on contract is a cursor that will keep being
      // refused; remember it so the next drain reads page one and stops there.
      if (cursor !== null && refusedOnContract(result.reason)) {
        rememberRefusedContinuation(`${environment}:${routeId}`);
      }
      return { rows, pages, exhausted: false, state: pages === 0 ? result.status.toUpperCase() : last?.state ?? "PARTIAL", completeness: last?.sourceHealth.completeness ?? null, freshness: last?.sourceHealth.freshness ?? null, asOfMs: last?.sourceHealth.asOfMs ?? null, reason: result.reason };
    }
    pages += 1;
    if (pages === 1) rememberSize(`${environment}:${routeId}`, PAGE_SIZES[sizeIndex]);
    last = result.value;
    rows.push(...result.value.records.map(relationRow));
    if (!result.value.page.hasMore || !result.value.page.nextCursor) {
      return { rows, pages, exhausted: true, state: result.value.state, completeness: result.value.sourceHealth.completeness, freshness: result.value.sourceHealth.freshness, asOfMs: result.value.sourceHealth.asOfMs, reason: null };
    }
    cursor = result.value.page.nextCursor;
  }
  return { rows, pages, exhausted: false, state: last?.state ?? "PARTIAL", completeness: last?.sourceHealth.completeness ?? null, freshness: last?.sourceHealth.freshness ?? null, asOfMs: last?.sourceHealth.asOfMs ?? null, reason: `page cap ${maxPages} reached` };
}

/** The relations the Trade Replay and the subject funnel read, keyed by the N25 fact name they replace. */
export const REPLAY_RELATIONS: Readonly<Record<string, RelationRoute>> = {
  orders: RELATION_ROUTES.orders,
  fills: RELATION_ROUTES.fills,
  order_brackets: RELATION_ROUTES.orderBrackets,
  order_bracket_legs: RELATION_ROUTES.orderBracketLegs,
  conditional_order_groups: RELATION_ROUTES.conditionalGroups,
  conditional_order_group_legs: RELATION_ROUTES.conditionalGroupLegs,
  portfolio_capital_ledger: RELATION_ROUTES.capitalLedger,
};

export interface RelationFacts {
  environment: RelationEnvironment;
  /**
   * The reader's evidence boundary.  The original EDS-11R1 implementation
   * walks a Manager current-page set from the browser.  BR-EX-81 replaces
   * that on product subject screens with a bounded Portal-retained window.
   * Keeping the distinction in the model prevents a rich replay from ever
   * describing retained current data as an upstream total history.
   */
  origin?: "MANAGER_CURRENT_PAGESET" | "PORTAL_RETAINED_CURRENT_WINDOW";
  /** BR-EX-80 timeframe from the named Portal subject BFF, never guessed by a component. */
  timeframe?: {
    value: "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | null;
    provenance: "PUBLISHED_SOURCE" | "DERIVED_STRATEGY_ID_SUFFIX" | "UNAVAILABLE";
    sourceField: string | null;
  } | null;
  /** rows per N25 fact key; a relation that could not be read is absent (never an empty array standing in for it) */
  facts: Readonly<Record<string, readonly Record<string, unknown>[]>>;
  coverage: Readonly<Record<string, Drained>>;
  /** page walk of the whole set: total pages read, and whether every relation reached its end */
  pages: number;
  exhausted: boolean;
  /** worst completeness across relations, in the source's own words */
  completeness: string | null;
  asOfMs: number | null;
  /** "POPULATED" when every relation answered; "PARTIAL" when some did; "UNAVAILABLE" when none */
  state: "POPULATED" | "PARTIAL" | "UNAVAILABLE";
  reasons: readonly string[];
}

const COMPLETENESS_RANK = ["COMPLETE", "PARTIAL", "UNKNOWN"];

/** How many relations walk at once — enough to overlap, few enough not to crowd the Manager. */
export const DRAIN_CONCURRENCY = 2;

/** Drain every replay relation of one environment, at most `DRAIN_CONCURRENCY` relations at a time, each bounded by `maxPages`. */
export async function drainRelations(read: RelationRead, environment: RelationEnvironment, routes: Readonly<Record<string, RelationRoute>> = REPLAY_RELATIONS, maxPages = 40, isCancelled: () => boolean = () => false): Promise<RelationFacts> {
  const entries = Object.entries(routes);
  const drained: Drained[] = new Array<Drained>(entries.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < entries.length) {
      const index = next;
      next += 1;
      drained[index] = await drainRelation(read, entries[index][1], environment, maxPages, isCancelled);
    }
  };
  await Promise.all(Array.from({ length: Math.min(DRAIN_CONCURRENCY, entries.length) }, () => worker()));
  const facts: Record<string, readonly Record<string, unknown>[]> = {};
  const coverage: Record<string, Drained> = {};
  const reasons: string[] = [];
  let pages = 0;
  let exhausted = true;
  let completeness: string | null = null;
  let asOfMs: number | null = null;
  let answered = 0;
  entries.forEach(([key], index) => {
    const d = drained[index];
    coverage[key] = d;
    pages += d.pages;
    if (d.pages > 0) {
      answered += 1;
      facts[key] = d.rows;
      if (!d.exhausted) exhausted = false;
      if (d.completeness) completeness = completeness === null || COMPLETENESS_RANK.indexOf(d.completeness) > COMPLETENESS_RANK.indexOf(completeness) ? d.completeness : completeness;
      if (d.asOfMs !== null) asOfMs = asOfMs === null ? d.asOfMs : Math.min(asOfMs, d.asOfMs);
    } else {
      exhausted = false;
    }
    if (d.reason) reasons.push(`${key}: ${d.reason}`);
  });
  return { environment, origin: "MANAGER_CURRENT_PAGESET", facts, coverage, pages, exhausted, completeness, asOfMs, state: answered === 0 ? "UNAVAILABLE" : answered === entries.length ? "POPULATED" : "PARTIAL", reasons };
}

const text = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : null);

/** Rows of one subject: an alpha's rows by strategy_id, an account's by account_id. Nothing else is inferred. */
export function subjectRows(rows: readonly Record<string, unknown>[], subject: { alphaId?: string | null; accountId?: string | null }): Record<string, unknown>[] {
  const alpha = subject.alphaId ?? null;
  const account = subject.accountId ?? null;
  if (alpha === null && account === null) return [...rows];
  return rows.filter((r) => (alpha !== null && text(r.strategy_id) === alpha) || (account !== null && text(r.account_id) === account));
}

export interface SubjectFunnel {
  /** distinct orders of the subject in the drained page set */
  totalOrders: number;
  statusCounts: Readonly<Record<string, number>>;
  /** what the whole page set holds, so the subject's share is never mistaken for the profile's */
  pageSet: { orders: number; strategies: number; pages: number; exhausted: boolean; completeness: string | null };
}

/** DR-22: the order funnel of one subject, counted from the drained relation page set instead of the profile-wide N25 page. */
export function subjectFunnel(relations: RelationFacts | null | undefined, subject: { alphaId?: string | null; accountId?: string | null }): SubjectFunnel | null {
  const orders = relations?.facts.orders;
  if (!relations || !orders) return null;
  const seen = new Set<string>();
  const statusCounts: Record<string, number> = {};
  for (const row of subjectRows(orders, subject)) {
    const id = text(row.order_id) ?? text(row.client_order_id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const status = text(row.status) ?? "UNKNOWN";
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  }
  const strategies = new Set(orders.map((r) => text(r.strategy_id)).filter((s): s is string => s !== null)).size;
  const cover = relations.coverage.orders;
  return { totalOrders: seen.size, statusCounts, pageSet: { orders: new Set(orders.map((r) => text(r.order_id) ?? text(r.client_order_id) ?? "")).size, strategies, pages: cover?.pages ?? 0, exhausted: cover?.exhausted ?? false, completeness: cover?.completeness ?? null } };
}
