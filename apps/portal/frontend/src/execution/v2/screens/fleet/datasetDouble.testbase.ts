/**
 * A BFF double for the Manager DATASET routes (`GET /api/v1/execution/manager/{fleet|fund-overview|...}`), tests only; lane
 * BFF_DOUBLE. It is a tiny SERVER: it holds a population of alphas per environment, applies the query it is sent (`filters`
 * with `IN`, `stage_filter`, `q`, `sort`, `group_by`, `limit`, an opaque cursor bound to the filter and the snapshot) and answers
 * with bodies built from the PUBLISHED canonical fixtures (`lifecycle.live`, `partitions`, `rows`), rewriting only what the
 * query decides: surface, environment, workspace, window, the rows, the groups and the page envelope. Every body is judged by
 * the real reader and the real answers-this-question guard, because the port is the real HTTP client over a stubbed `fetch`.
 * A fixture is never a source acceptance.
 *
 * The variants break one thing on purpose (a wrong environment, a wrong window, a filter the server ignored, another schema, a
 * malformed body, a refusal status) so a test can prove the fail-closed mapping end to end.
 */
import { clone, fixtureValue, moneyMetric, absentMetric, FIXTURE_LIFECYCLE_LIVE, FIXTURE_ALL, type Draft } from "../../readers/managerDataset.testbase";

export interface DoubleAlpha {
  id: string;
  name?: string | null;
  owner?: string | null;
  health?: string | null;
  /** Every stage the alpha is deployed in, in the selected environment. Empty: the stage field is not published. */
  stages: readonly string[];
  portfolio?: string;
  version?: string;
  lifecycle?: string | null;
  venue?: string | null;
  sourceState?: string | null;
  /** ALL reads only: the money this alpha holds in ITS environment, one partition (USDT in every environment: the trap a sum would fall into). */
  money?: { allocation?: string | null; netPnl?: string | null; currency?: string };
}

export type DatasetVariant =
  | "ok"
  | "garbage"
  | "other-schema"
  | "malformed"
  | `status:${number}`
  | "wrong:environment"
  | "wrong:surface"
  | "wrong:window"
  | "wrong:limit"
  | "wrong:group"
  | "wrong:filter"
  | "wrong:stage"
  | "wrong:sort"
  | "wrong:workspace";

export interface DatasetCall {
  path: string;
  query: URLSearchParams;
  /** Parsed JSON parameters (`null` when absent). */
  filters: unknown;
  sort: unknown;
  window: unknown;
}

export interface DatasetDoubleState {
  variant: DatasetVariant;
  population: Record<"paper" | "sandbox" | "live", DoubleAlpha[]>;
  snapshot: string;
  calls: DatasetCall[];
  /**
   * Decides the variant of ONE request, at the moment its answer is built (no await in between). Concurrent requests (the rows and the
   * Owner/Health choices ask together) cannot overwrite each other the way a `before` hook that assigns `variant` does.
   */
  variantFor?: (call: DatasetCall) => DatasetVariant;
  /** Awaited before the answer is built: a test holds a request here to prove a late answer is dropped. */
  before?: (call: DatasetCall) => Promise<void> | void;
  /** Edit the body (after the query was applied) to build one-off negative cases. */
  mutate?: (body: Draft, call: DatasetCall) => void;
  /** Overrides what the body states as `quality` / the total the page publishes (a snapshot that moves between pages). */
  total?: (honest: number) => number;
  /** FE-CAT-3: answer `environment=ALL` (the authorized rows of every environment, each labelled, with coverage). Off: ALL is refused (400). */
  offersAll?: boolean;
  /** ALL only: an environment that contributes nothing, with the closed reason of the contract. */
  unavailable?: Partial<Record<"paper" | "sandbox" | "live", string>>;
  /** ALL only: an included environment that is degraded (its own quality). */
  degraded?: Partial<Record<"paper" | "sandbox" | "live", { completeness: string; freshness: string; reasons: string[] }>>;
}

const SNAPSHOT = (digit: string) => `sha256:${digit.repeat(64)}`;
export const SNAPSHOT_A = SNAPSHOT("1");
export const SNAPSHOT_B = SNAPSHOT("2");

export const newDatasetDouble = (population: Partial<DatasetDoubleState["population"]> = {}, variant: DatasetVariant = "ok"): DatasetDoubleState => ({
  variant,
  population: { paper: [], sandbox: [], live: [], ...population },
  snapshot: SNAPSHOT_A,
  calls: [],
});

/** `count` alphas cycling through the given stage sets, with owners and healths that vary; ids are `a-000`... */
export function alphasOf(count: number, stageSets: readonly (readonly string[])[], options: { prefix?: string; healths?: readonly (string | null)[]; owners?: readonly (string | null)[] } = {}): DoubleAlpha[] {
  const prefix = options.prefix ?? "a";
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${String(index).padStart(3, "0")}`,
    name: `Alpha ${prefix}-${String(index).padStart(3, "0")}`,
    owner: options.owners ? options.owners[index % options.owners.length]! : "owner-1",
    health: options.healths ? options.healths[index % options.healths.length]! : null,
    stages: stageSets[index % stageSets.length]!,
    portfolio: "pf-1",
  }));
}

const lexical = (stages: readonly string[]) => [...stages].sort();

interface Computed { alpha: DoubleAlpha; visible: string[]; currentStage: string | null; environment?: "paper" | "sandbox" | "live" }
const ENVIRONMENT_ORDER = ["paper", "sandbox", "live"] as const;
const DOMAIN_OF = { paper: "PAPER", sandbox: "SANDBOX", live: "ACTUAL" } as const;

function textOf(c: Computed, field: string): string | null {
  const a = c.alpha;
  switch (field) {
    case "alpha_id": return a.id;
    case "alpha_version_id": return a.version ?? "av-1";
    case "name": return a.name === undefined ? `Alpha ${a.id}` : a.name;
    case "owner_user_id": return a.owner === undefined ? "owner-1" : a.owner;
    case "portfolio_id": return a.portfolio ?? "pf-1";
    case "lifecycle": return a.lifecycle === undefined ? "ACTIVE" : a.lifecycle;
    case "venue": return a.venue === undefined ? "venue-1" : a.venue;
    case "health": return a.health === undefined ? null : a.health;
    case "source_state": return a.sourceState === undefined ? "FRESH" : a.sourceState;
    case "current_stage": return c.currentStage;
    default: return null;
  }
}

function rowOf(template: Draft, c: Computed, environment: string): Draft {
  const a = c.alpha;
  const row = clone(template);
  const version = a.version ?? "av-1";
  const portfolio = a.portfolio ?? "pf-1";
  row.row_key = c.environment === undefined ? JSON.stringify([a.id, version, portfolio]) : JSON.stringify([c.environment, a.id, version, portfolio]);
  if (c.environment !== undefined) row.environment = c.environment;
  row.alpha_id = a.id;
  row.alpha_version_id = version;
  row.portfolio_id = portfolio;
  row.name = textOf(c, "name");
  row.owner_user_id = textOf(c, "owner_user_id");
  row.lifecycle = textOf(c, "lifecycle");
  row.venue = textOf(c, "venue");
  row.health = textOf(c, "health");
  row.source_state = textOf(c, "source_state");
  row.stage_presence = lexical(c.visible);
  row.current_stage = c.currentStage;
  row.entered_at_ms = null;
  row.days_in_stage = null;
  row.stage_lifecycle_reasons = {
    current_stage: c.currentStage === null ? (c.visible.length === 0 ? "STAGE_FIELD_NOT_PUBLISHED" : "MULTIPLE_ACTIVE_STAGES") : null,
    entered_at_ms: "STAGE_ENTRY_TIME_NOT_PUBLISHED",
    days_in_stage: "STAGE_ENTRY_TIME_NOT_PUBLISHED",
  };
  const child = template.children[0];
  row.children = lexical(c.visible).map((stage, index) => ({
    ...clone(child), alpha_id: a.id, alpha_version_id: version, portfolio_id: portfolio, deployment_id: `${a.id}-${environment}-d${index}`, account_id: `${a.id}-${environment}-acct${index}`, stage,
  }));
  if (c.environment !== undefined) {
    // An ALL row holds the money of its own environment: one partition of its own economic domain, USDT in every environment.
    const money = a.money ?? {};
    const partition = { economic_domain: DOMAIN_OF[c.environment], currency: money.currency ?? "USDT", basis: "TEST_ONLY:net-ledger",
      native_profile_ref: `TEST_ONLY:${c.environment}-ledger`, domain_proof_ref: "TEST_ONLY:not-economic-authority" };
    const figure = (value: string | null | undefined) => (value === undefined || value === null ? absentMetric() : moneyMetric({ value, currency: partition.currency }));
    const metrics: Draft = {};
    if (money.netPnl !== undefined && money.netPnl !== null) metrics.net_pnl = figure(money.netPnl);
    if (money.allocation !== undefined && money.allocation !== null) metrics.allocation = figure(money.allocation);
    row.economic_partitions = Object.keys(metrics).length === 0 ? [] : [{ partition, metrics }];
    for (const key of Object.keys(row.metrics)) row.metrics[key] = metrics[key] !== undefined ? clone(metrics[key]) : absentMetric();
  }
  return row;
}

const SURFACES: readonly [RegExp, string][] = [
  [/\/manager\/fleet$/, "FLEET"],
  [/\/manager\/fund-overview$/, "FUND"],
  [/\/manager\/portfolios\/[^/]+\/overview$/, "PORTFOLIO"],
  [/\/manager\/alphas\/[^/]+\/overview$/, "ALPHA"],
  [/\/manager\/accounts\/[^/]+\/overview$/, "ACCOUNT"],
  [/\/manager\/deployments\/[^/]+\/overview$/, "DEPLOYMENT"],
];
export const surfaceOfPath = (path: string): string | null => SURFACES.find(([re]) => re.test(path))?.[1] ?? null;

const encodeCursor = (offset: number, snapshot: string, bound: string) => Buffer.from(JSON.stringify({ o: offset, s: snapshot, b: bound })).toString("base64url");
function decodeCursor(cursor: string): { o: number; s: string; b: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { o: unknown; s: unknown; b: unknown };
    return typeof parsed.o === "number" && typeof parsed.s === "string" && typeof parsed.b === "string" ? { o: parsed.o, s: parsed.s, b: parsed.b } : null;
  } catch { return null; }
}

type Filter = { field: string; op: string; value?: string; values?: string[] };

/** The answer for one request. */
export function datasetAnswer(path: string, params: URLSearchParams, state: DatasetDoubleState): { status: number; body: unknown } {
  const call: DatasetCall = {
    path, query: params,
    filters: params.has("filters") ? JSON.parse(params.get("filters")!) : null,
    sort: params.has("sort") ? JSON.parse(params.get("sort")!) : null,
    window: params.has("window") ? JSON.parse(params.get("window")!) : null,
  };
  const problem = (status: number, code: string) => ({ status, body: { error: { code, message: code } } });
  if (state.variant.startsWith("status:")) return problem(Number(state.variant.slice(7)), "REFUSED");
  if (state.variant === "garbage") return { status: 200, body: "<html>nope</html>" };

  const surface = surfaceOfPath(path);
  const environment = params.get("environment") as "paper" | "sandbox" | "live" | "ALL" | null;
  const all = environment === "ALL";
  if (all && (!state.offersAll || surface !== "FLEET" || params.has("window"))) return problem(400, "MANAGER_QUERY_INVALID");
  if (surface === null || environment === null || (!all && !(environment in state.population))) return problem(400, "MANAGER_QUERY_INVALID");

  const filters = (call.filters ?? []) as Filter[];
  const stageFilter = params.get("stage_filter")?.split(",") ?? [];
  const q = params.get("q");
  const mode = params.get("q_mode");
  const sort = (call.sort ?? []) as { field: string; direction: "asc" | "desc" }[];
  const groupBy = params.get("group_by")?.split(",") ?? [];
  const limit = params.has("limit") ? Number(params.get("limit")) : 100;

  const computed: Computed[] = [];
  for (const scope of all ? ENVIRONMENT_ORDER : [environment]) {
    if (all && state.unavailable?.[scope] !== undefined) continue;
    for (const alpha of state.population[scope]) {
      const visible = stageFilter.length === 0 ? [...alpha.stages] : alpha.stages.filter((stage) => stageFilter.includes(stage));
      if (stageFilter.length > 0 && visible.length === 0) continue;
      computed.push({ alpha, visible, currentStage: alpha.stages.length === 1 ? alpha.stages[0]! : null, ...(all ? { environment: scope } : {}) });
    }
  }
  const matches = (c: Computed) => {
    if (q !== null) {
      const name = textOf(c, "name")?.toLowerCase() ?? null;
      const needle = q.toLowerCase();
      if (name === null || !(mode === "PREFIX" ? name.startsWith(needle) : name.includes(needle))) return false;
    }
    return filters.every((filter) => {
      if (state.variant === "wrong:filter") return true;
      const value = textOf(c, filter.field);
      if (filter.op === "EQ") return value === filter.value;
      if (filter.op === "IN") return value !== null && (filter.values ?? []).includes(value);
      if (filter.op === "IS_NULL") return value === null;
      return true;
    });
  };
  const filtered = computed.filter(matches);
  const sorted = [...filtered].sort((x, y) => {
    for (const key of sort) {
      const a = textOf(x, key.field);
      const b = textOf(y, key.field);
      if (a === b) continue;
      if (a === null) return 1;
      if (b === null) return -1;
      return (a < b ? -1 : 1) * (key.direction === "asc" ? 1 : -1);
    }
    if (x.alpha.id !== y.alpha.id) return x.alpha.id < y.alpha.id ? -1 : 1;
    return ENVIRONMENT_ORDER.indexOf(x.environment ?? "paper") - ENVIRONMENT_ORDER.indexOf(y.environment ?? "paper");
  });
  if (state.variant === "wrong:sort" && sort.length > 0) sorted.reverse();

  const bound = JSON.stringify([environment, [...params.entries()].filter(([name]) => !["after", "before", "limit"].includes(name))]);
  let offset = 0;
  if (params.has("after")) {
    const cursor = decodeCursor(params.get("after")!);
    if (cursor === null || cursor.b !== bound || cursor.s !== state.snapshot) return problem(409, "MANAGER_CURSOR_CHANGED");
    offset = cursor.o;
  }
  const page = sorted.slice(offset, offset + limit);

  const body: Draft = fixtureValue(FIXTURE_LIFECYCLE_LIVE);
  const template = clone(body.items[0]);
  body.surface = surface;
  body.environment = environment;
  body.workspace_id = params.get("workspace_id") ?? body.workspace_id;
  body.snapshot_id = state.snapshot;
  body.items = page.map((c) => rowOf(template, c, c.environment ?? environment));
  const honestTotal = sorted.length;
  const total = state.total ? state.total(honestTotal) : honestTotal;
  if (all) body.environment = "ALL";
  body.page = {
    limit,
    returned_count: page.length,
    authorized_filtered_count: total,
    next_cursor: offset + page.length < honestTotal ? encodeCursor(offset + page.length, state.snapshot, bound) : null,
    previous_cursor: offset > 0 ? encodeCursor(Math.max(0, offset - limit), state.snapshot, bound) : null,
  };
  if (all) {
    // The ALL envelope: one typed entry per environment, counts of rows only, a body that lost an environment is never COMPLETE.
    const statuses = ENVIRONMENT_ORDER.map((scope) => {
      const reason = state.unavailable?.[scope];
      if (reason !== undefined) return { environment: scope, availability: "UNAVAILABLE", reason_code: reason, snapshot_id: null, as_of_ms: null, recorded_through_ms: null, facts_through_ms: null, quality: null, authorized_filtered_count: null, returned_count: null };
      return {
        environment: scope, availability: "INCLUDED", reason_code: null, snapshot_id: SNAPSHOT(scope === "paper" ? "3" : scope === "sandbox" ? "4" : "5"),
        as_of_ms: body.as_of_ms, recorded_through_ms: body.recorded_through_ms, facts_through_ms: body.facts_through_ms,
        quality: state.degraded?.[scope] ?? { completeness: "COMPLETE", freshness: "FRESH", reasons: [] },
        authorized_filtered_count: sorted.filter((c) => c.environment === scope).length, returned_count: page.filter((c) => c.environment === scope).length,
      };
    });
    body.environment_coverage = statuses;
    const lost = statuses.filter((entry) => entry.availability === "UNAVAILABLE").length;
    const worst = Object.values(state.degraded ?? {}).some((q) => q?.completeness !== "COMPLETE");
    body.quality = { completeness: lost > 0 || worst ? "PARTIAL" : "COMPLETE", freshness: lost > 0 ? "UNKNOWN" : "FRESH", reasons: [] };
    body.capital_statements = [];
    body.selected_window = null;
  }
  // Groups total the whole filtered query, not the page.
  if (groupBy.length > 0) {
    const tally = new Map<string, { key: { field: string; value: string | null }[]; count: number }>();
    for (const c of sorted) {
      const key = groupBy.map((field) => ({ field, value: field === "stage_presence" ? lexical(c.visible).join(",") : textOf(c, field) }));
      const id = JSON.stringify(key);
      const seen = tally.get(id);
      if (seen) seen.count += 1;
      else tally.set(id, { key, count: 1 });
    }
    body.groups = [...tally.values()]
      .sort((x, y) => {
        for (let index = 0; index < x.key.length; index += 1) {
          const a = x.key[index]!.value;
          const b = y.key[index]!.value;
          if (a === b) continue;
          if (a === null) return 1;
          if (b === null) return -1;
          return a < b ? -1 : 1;
        }
        return 0;
      })
      .map((group) => ({ key: group.key, unique_row_count: group.count, totals_scope: "FULL_AUTHORIZED_FILTERED_QUERY", economic_partitions: [] }));
  } else body.groups = [];

  if (params.has("window")) {
    const window = call.window as string | { from_ms: number; to_ms: number };
    body.selected_window = window === "ALL"
      ? { requested: "ALL", resolved: null, selection_basis: "EXACT_PUBLISHED_METRIC_WINDOW_ONLY", reason_code: "ALL_HISTORY_WINDOW_NOT_PUBLISHED" }
      : { requested: window, resolved: typeof window === "string" ? { from_ms: 0, to_ms: body.as_of_ms } : window, selection_basis: "EXACT_PUBLISHED_METRIC_WINDOW_ONLY", reason_code: null };
    if (window === "ALL") body.scores = clone(fixtureValue(FIXTURE_ALL).scores);
  }

  switch (state.variant) {
    case "wrong:environment":
      // An empty body of the other environment: the reader accepts it (no row to contradict it) and only the guard can refuse it.
      body.items = [];
      body.groups = [];
      body.page = { limit, returned_count: 0, authorized_filtered_count: 0, next_cursor: null, previous_cursor: null };
      body.environment = environment === "live" ? "paper" : "live";
      break;
    case "wrong:surface": body.surface = surface === "FLEET" ? "FUND" : "FLEET"; break;
    case "wrong:window": body.selected_window = params.has("window") ? null : { requested: "7D", resolved: { from_ms: 0, to_ms: body.as_of_ms }, selection_basis: "EXACT_PUBLISHED_METRIC_WINDOW_ONLY", reason_code: null }; break;
    case "wrong:limit": body.page.limit = Math.min(200, limit + 1); break;
    case "wrong:group": body.groups = [{ key: [{ field: groupBy.length > 0 ? "venue" : "health", value: null }], unique_row_count: Math.min(1, total), totals_scope: "FULL_AUTHORIZED_FILTERED_QUERY", economic_partitions: [] }]; break;
    case "wrong:stage": if (stageFilter.length > 0) { const outside = environment === "live" ? (stageFilter.includes("LIVE") ? "CANARY" : "LIVE") : "PAPER"; body.items = [rowOf(template, { alpha: { id: "outside", stages: [outside] }, visible: [outside], currentStage: outside }, environment)]; body.page = { ...body.page, returned_count: 1, authorized_filtered_count: 1, next_cursor: null, previous_cursor: null }; } break;
    case "wrong:workspace": body.workspace_id = `${body.workspace_id}-other`; break;
    case "other-schema": body.schema_version = "portal.execution.manager-dataset.v0"; break;
    case "malformed": body.unexpected_key = true; break;
    default: break;
  }
  state.mutate?.(body, call);
  return { status: 200, body };
}

/** `fetch` for the dataset routes; every other URL goes to `inner` (or 501 when there is none). */
export function wrapDatasetFetch(inner: typeof fetch | null, state: DatasetDoubleState): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://portal.test");
    const path = url.pathname.replace(/^\/api\/v1\/execution/, "");
    if (surfaceOfPath(path) === null) return inner ? inner(input, init) : new Response(JSON.stringify({ error: { code: "NOT_IN_DOUBLE", path } }), { status: 501, headers: { "content-type": "application/json" } });
    const call: DatasetCall = {
      path, query: url.searchParams,
      filters: url.searchParams.has("filters") ? JSON.parse(url.searchParams.get("filters")!) : null,
      sort: url.searchParams.has("sort") ? JSON.parse(url.searchParams.get("sort")!) : null,
      window: url.searchParams.has("window") ? JSON.parse(url.searchParams.get("window")!) : null,
    };
    state.calls.push(call);
    await state.before?.(call);
    if (state.variantFor) state.variant = state.variantFor(call);
    const answer = datasetAnswer(path, url.searchParams, state);
    return new Response(typeof answer.body === "string" ? answer.body : JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}
