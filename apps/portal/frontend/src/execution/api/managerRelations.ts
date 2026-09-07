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

/** One page, retried after each pause in `RETRY_DELAYS_MS`; the last failure is the one reported. */
async function readPage(read: RelationRead, q: RelationPageQuery): Promise<Awaited<ReturnType<RelationRead>>> {
  let result = await read(q);
  for (const delay of RETRY_DELAYS_MS) {
    if (result.ok) return result;
    await sleep(delay);
    result = await read(q);
  }
  return result;
}

export const DRAIN_CANCELLED = "DRAIN_CANCELLED";

/** Walk a relation's current page set with the Portal continuation, up to `maxPages` × 200 rows; a cancelled walk stops before its next page and says so. */
export async function drainRelation(read: RelationRead, routeId: RelationRoute | string, environment: RelationEnvironment, maxPages = 40, isCancelled: () => boolean = () => false): Promise<Drained> {
  const rows: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  let pages = 0;
  let last: RelationPage | null = null;
  for (let i = 0; i < maxPages; i += 1) {
    if (isCancelled()) return { rows, pages, exhausted: false, state: last?.state ?? "PARTIAL", completeness: last?.sourceHealth.completeness ?? null, freshness: last?.sourceHealth.freshness ?? null, asOfMs: last?.sourceHealth.asOfMs ?? null, reason: DRAIN_CANCELLED };
    const result = await readPage(read, { routeId, environment, limit: 200, cursor });
    if (!result.ok) return { rows, pages, exhausted: false, state: pages === 0 ? result.status.toUpperCase() : last?.state ?? "PARTIAL", completeness: last?.sourceHealth.completeness ?? null, freshness: last?.sourceHealth.freshness ?? null, asOfMs: last?.sourceHealth.asOfMs ?? null, reason: result.reason };
    pages += 1;
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
  return { environment, facts, coverage, pages, exhausted, completeness, asOfMs, state: answered === 0 ? "UNAVAILABLE" : answered === entries.length ? "POPULATED" : "PARTIAL", reasons };
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
