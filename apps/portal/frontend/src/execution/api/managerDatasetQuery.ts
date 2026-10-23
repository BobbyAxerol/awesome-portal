/**
 * The REQUEST side of `ExecutionApi.getManagerDataset` (BE-P1 / BE-P4 / FE-033): the query a screen asks, how it is encoded for
 * the six `GET /api/v1/execution/manager/...` routes of `execution-manager-models.openapi.json`, and the check that the body
 * that came back answers THAT question.
 *
 * Encoding is exactly the OpenAPI's, parameter by parameter (it is the published contract, not a convention of ours):
 * - plain: `environment` (`ALL` only for the Fleet surface without a window: FE-CAT-3, navigation across separately authorized environments,
 *   never consolidated money), `workspace_id`, `q`, `q_mode`, `lifecycle_filter`, `limit`, `after`, `before`;
 * - `content: application/json` (JSON text in the query value): `window` (`"30D"` with its quotes, or `{from_ms,to_ms}`),
 *   `filters`, `sort`, `economic_partition`;
 * - `style: form, explode: false` (one comma-separated value): `stage_filter`, `group_by`.
 *
 * A query the server would refuse (`400`) is refused here with `null`, so the port makes NO request: an unknown field or
 * operator, a missing or doubled operand, an `IN` list over 32 or with a repeat, a numeric field compared with a non-decimal,
 * more than 16 filters / 3 sort keys / 2 group fields, a stage the environment does not hold, a backwards window, `after`
 * with `before`, a limit outside 1..200, a `q_mode` without `q`.
 *
 * `datasetQueryMismatch` is the counterpart of `seriesAnswersQuery`: a well-formed dataset of ANOTHER question (another
 * surface, environment, scope, window, page size, grouping, filter or stage) is never drawn as this one. It only checks what the
 * body states about itself or what a row states plainly; it never re-sorts, re-filters or re-counts anything.
 */
import {
  MANAGER_ALL,
  MANAGER_ENVIRONMENTS,
  MANAGER_GROUP_FIELDS,
  MANAGER_SORT_FIELDS,
  MANAGER_STAGES,
  MANAGER_WINDOW_PRESETS,
  type ManagerDataset,
  type ManagerEnvironmentScope,
  type ManagerGroupField,
  type ManagerRow,
  type ManagerSortField,
  type ManagerStage,
} from "../v2/readers/managerDataset";
import { MANAGER_ECONOMIC_DOMAINS, clockMs, managerText, oneOf, type ManagerEconomicDomain } from "../v2/readers/managerMetric";

/** The six routes. `FUND` and `FLEET` have no id; the other four name their resource. */
export type ManagerDatasetScope =
  | { surface: "FUND" }
  | { surface: "FLEET" }
  | { surface: "PORTFOLIO" | "ALPHA" | "ACCOUNT" | "DEPLOYMENT"; id: string };

export type ManagerDatasetWindowQuery = "7D" | "30D" | "90D" | "ALL" | { fromMs: number; toMs: number };

/** `filters[].field` and `sort[].field` are the same 18-word enum (`query_options.sort_fields` is the subset a dataset offers). */
export type ManagerDatasetField = ManagerSortField;

/** One filter, exactly one of the three operand shapes the schema's `oneOf` allows. */
export type ManagerDatasetFilter =
  | { field: ManagerDatasetField; op: "EQ" | "GTE" | "LTE"; value: string }
  | { field: ManagerDatasetField; op: "IN"; values: readonly string[] }
  | { field: ManagerDatasetField; op: "IS_NULL" };

export interface ManagerDatasetSort { field: ManagerDatasetField; direction: "asc" | "desc" }

export interface ManagerDatasetPartitionQuery {
  economicDomain: ManagerEconomicDomain;
  currency: string;
  basis: string;
  nativeProfileRef: string;
  domainProofRef: string;
}

export interface ManagerDatasetQueryBase {
  /** One environment, or `ALL` (Fleet only, no window): the server answers with the authorized rows of every environment, each labelled. */
  environment: ManagerEnvironmentScope;
  workspaceId?: string;
  /** Search over `name`; `qMode` needs `q`. */
  q?: string;
  qMode?: "PREFIX" | "CONTAINS";
  window?: ManagerDatasetWindowQuery;
  /** Stages of the environment (paper: PAPER; sandbox: SANDBOX; live: CANARY, LIVE). */
  stageFilter?: readonly ManagerStage[];
  lifecycleFilter?: string;
  filters?: readonly ManagerDatasetFilter[];
  sort?: readonly ManagerDatasetSort[];
  groupBy?: readonly ManagerGroupField[];
  /** Pins one economic partition (all five fields). */
  economicPartition?: ManagerDatasetPartitionQuery;
  limit?: number;
  after?: string;
  before?: string;
}

export type ManagerDatasetQuery = ManagerDatasetQueryBase & ManagerDatasetScope;

export const MAX_DATASET_FILTERS = 16;
export const MAX_DATASET_IN_VALUES = 32;
export const MAX_DATASET_SORT_KEYS = 3;
export const MAX_DATASET_GROUP_FIELDS = 2;
export const MAX_DATASET_LIMIT = 200;
/** `filters[].field` values whose operand is an exact decimal (the schema's `allOf` on the money, ratio and score fields). */
export const NUMERIC_DATASET_FIELDS: readonly ManagerDatasetField[] = [
  "allocation", "net_pnl", "unrealized_pnl", "balance_total", "equity_30d_end_value", "return_30d_pct", "score",
];
const DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const STAGES_OF: Readonly<Record<ManagerEnvironmentScope, readonly ManagerStage[]>> = {
  paper: ["PAPER"], sandbox: ["SANDBOX"], live: ["CANARY", "LIVE"], ALL: ["PAPER", "SANDBOX", "CANARY", "LIVE"],
};

const ROUTES: Readonly<Record<ManagerDatasetScope["surface"], (id: string) => string>> = {
  FUND: () => "/manager/fund-overview",
  FLEET: () => "/manager/fleet",
  PORTFOLIO: (id) => `/manager/portfolios/${encodeURIComponent(id)}/overview`,
  ALPHA: (id) => `/manager/alphas/${encodeURIComponent(id)}/overview`,
  ACCOUNT: (id) => `/manager/accounts/${encodeURIComponent(id)}/overview`,
  DEPLOYMENT: (id) => `/manager/deployments/${encodeURIComponent(id)}/overview`,
};

/** The operand text of a filter: bounded printable text, and an exact decimal for the numeric fields. */
function operand(field: ManagerDatasetField, value: unknown): string | null {
  const text = managerText(value, 256);
  if (text === null) return null;
  if (NUMERIC_DATASET_FIELDS.includes(field) && (text.length > 128 || !DECIMAL.test(text))) return null;
  return text;
}

function encodeFilter(raw: ManagerDatasetFilter): Record<string, unknown> | null {
  const field = oneOf(raw.field, MANAGER_SORT_FIELDS);
  const op = oneOf(raw.op, ["EQ", "GTE", "LTE", "IS_NULL", "IN"] as const);
  if (field === null || op === null) return null;
  const carrier = raw as { value?: unknown; values?: unknown };
  if (op === "IS_NULL") return carrier.value === undefined && carrier.values === undefined ? { field, op } : null;
  if (op === "IN") {
    if (carrier.value !== undefined || !Array.isArray(carrier.values) || carrier.values.length < 1 || carrier.values.length > MAX_DATASET_IN_VALUES) return null;
    const values: string[] = [];
    for (const entry of carrier.values) {
      const text = operand(field, entry);
      if (text === null || values.includes(text)) return null;
      values.push(text);
    }
    return { field, op, values };
  }
  if (carrier.values !== undefined) return null;
  const value = operand(field, carrier.value);
  return value === null ? null : { field, op, value };
}

export interface ManagerDatasetRequest {
  /** Path under `/api/v1/execution`, without the query string. */
  path: string;
  /** Every query parameter, already encoded as text (the caller URL-encodes it once). */
  wire: Readonly<Record<string, string>>;
}

/** The request for a query, or `null` when the server would refuse it. */
export function encodeManagerDatasetQuery(query: ManagerDatasetQuery): ManagerDatasetRequest | null {
  const environment = oneOf(query.environment, [...MANAGER_ENVIRONMENTS, MANAGER_ALL] as const);
  if (environment === null || oneOf(query.surface, Object.keys(ROUTES) as ManagerDatasetScope["surface"][]) === null) return null;
  // ALL is the Fleet's fan-out and carries no window (a window resolves against one environment's cutoff): the server refuses both, so no request.
  if (environment === MANAGER_ALL && (query.surface !== "FLEET" || query.window !== undefined)) return null;
  let id = "";
  if (query.surface !== "FUND" && query.surface !== "FLEET") {
    const text = managerText(query.id, 256);
    if (text === null) return null;
    id = text;
  }
  const wire: Record<string, string> = { environment };

  if (query.workspaceId !== undefined) {
    const workspace = managerText(query.workspaceId, 256);
    if (workspace === null) return null;
    wire.workspace_id = workspace;
  }
  if (query.q !== undefined) {
    const q = managerText(query.q, 160);
    if (q === null) return null;
    wire.q = q;
  }
  if (query.qMode !== undefined) {
    if (query.q === undefined || oneOf(query.qMode, ["PREFIX", "CONTAINS"] as const) === null) return null;
    wire.q_mode = query.qMode;
  }
  if (query.window !== undefined) {
    if (typeof query.window === "string") {
      if (oneOf(query.window, [...MANAGER_WINDOW_PRESETS, "ALL"] as const) === null) return null;
      wire.window = JSON.stringify(query.window);
    } else {
      const fromMs = clockMs(query.window.fromMs);
      const toMs = clockMs(query.window.toMs);
      if (fromMs === null || toMs === null || fromMs > toMs) return null;
      wire.window = JSON.stringify({ from_ms: fromMs, to_ms: toMs });
    }
  }
  if (query.stageFilter !== undefined) {
    if (query.stageFilter.length > MANAGER_STAGES.length) return null;
    if (query.stageFilter.some((stage) => !STAGES_OF[environment].includes(stage))) return null;
    if (query.stageFilter.length > 0) wire.stage_filter = query.stageFilter.join(",");
  }
  if (query.lifecycleFilter !== undefined) {
    const lifecycle = managerText(query.lifecycleFilter, 256);
    if (lifecycle === null) return null;
    wire.lifecycle_filter = lifecycle;
  }
  if (query.filters !== undefined && query.filters.length > 0) {
    if (query.filters.length > MAX_DATASET_FILTERS) return null;
    const filters: Record<string, unknown>[] = [];
    for (const filter of query.filters) {
      const encoded = encodeFilter(filter);
      if (encoded === null) return null;
      filters.push(encoded);
    }
    wire.filters = JSON.stringify(filters);
  }
  if (query.sort !== undefined && query.sort.length > 0) {
    if (query.sort.length > MAX_DATASET_SORT_KEYS) return null;
    const keys: { field: ManagerDatasetField; direction: "asc" | "desc" }[] = [];
    for (const key of query.sort) {
      const field = oneOf(key.field, MANAGER_SORT_FIELDS);
      const direction = oneOf(key.direction, ["asc", "desc"] as const);
      if (field === null || direction === null || keys.some((seen) => seen.field === field)) return null;
      keys.push({ field, direction });
    }
    wire.sort = JSON.stringify(keys);
  }
  if (query.groupBy !== undefined && query.groupBy.length > 0) {
    if (query.groupBy.length > MAX_DATASET_GROUP_FIELDS) return null;
    const fields: ManagerGroupField[] = [];
    for (const raw of query.groupBy) {
      const field = oneOf(raw, MANAGER_GROUP_FIELDS);
      if (field === null || fields.includes(field)) return null;
      fields.push(field);
    }
    wire.group_by = fields.join(",");
  }
  if (query.economicPartition !== undefined) {
    const p = query.economicPartition;
    const domain = oneOf(p.economicDomain, MANAGER_ECONOMIC_DOMAINS);
    const currency = managerText(p.currency, 256);
    const basis = managerText(p.basis, 256);
    const nativeProfileRef = managerText(p.nativeProfileRef, 256);
    const domainProofRef = managerText(p.domainProofRef, 256);
    if (domain === null || currency === null || basis === null || nativeProfileRef === null || domainProofRef === null) return null;
    wire.economic_partition = JSON.stringify({
      economic_domain: domain, currency, basis, native_profile_ref: nativeProfileRef, domain_proof_ref: domainProofRef,
    });
  }
  if (query.limit !== undefined) {
    if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > MAX_DATASET_LIMIT) return null;
    wire.limit = String(query.limit);
  }
  if (query.after !== undefined && query.before !== undefined) return null;
  for (const [name, cursor] of [["after", query.after], ["before", query.before]] as const) {
    if (cursor === undefined) continue;
    if (typeof cursor !== "string" || cursor.length < 1 || cursor.length > 4096) return null;
    wire[name] = cursor;
  }
  return { path: ROUTES[query.surface](id), wire };
}

/** `/manager/...?...` ready for `GET` (the query is URL-encoded once, here). */
export const managerDatasetPath = (request: ManagerDatasetRequest): string =>
  Object.keys(request.wire).length === 0 ? request.path : `${request.path}?${new URLSearchParams(request.wire).toString()}`;

/* ───────────────────────── does the body answer this question? ───────────────────────── */

type TextRowField = "alpha_id" | "alpha_version_id" | "owner_user_id" | "portfolio_id" | "lifecycle" | "venue" | "health" | "source_state";
const ROW_TEXT: Readonly<Record<TextRowField, (row: ManagerRow) => string | null>> = {
  alpha_id: (row) => row.alphaId,
  alpha_version_id: (row) => row.alphaVersionId,
  owner_user_id: (row) => row.ownerUserId,
  portfolio_id: (row) => row.portfolioId,
  lifecycle: (row) => row.lifecycle,
  venue: (row) => row.venue,
  health: (row) => row.health,
  source_state: (row) => row.sourceState,
};

/** Whether a row satisfies a filter the body can be judged by (exact text equality, a set, a null). Other filters are the server's. */
function rowFailsFilter(row: ManagerRow, filter: ManagerDatasetFilter): boolean {
  const read = (ROW_TEXT as Partial<Record<string, (row: ManagerRow) => string | null>>)[filter.field];
  if (read === undefined) return false;
  const value = read(row);
  switch (filter.op) {
    case "EQ": return value !== filter.value;
    case "IN": return value === null || !filter.values.includes(value);
    case "IS_NULL": return value !== null;
    default: return false;
  }
}

/**
 * The first way a dataset does not answer the question asked, as a short code, or `null` when it does. It checks:
 * the surface, environment and workspace; the window the server states it selected (none asked means none selected); the page
 * size; the group fields (none asked means no groups); the scope id (a portfolio or alpha row names it, an account or
 * deployment row holds a child that does); the stage filter (no row shows a stage outside it); `q` when `q_mode` says how; the
 * plain-text equality, set and null filters; and, for a `current_stage` first sort key, the order of the page (nulls last).
 */
export function datasetQueryMismatch(dataset: ManagerDataset, query: ManagerDatasetQuery): string | null {
  if (dataset.surface !== query.surface) return "surface";
  if (dataset.environment !== query.environment) return "environment";
  // FE-CAT-3: a read asked for ALL is accepted only as an ALL-shaped body (coverage, rows that name their environment), and a read of one
  // environment is never accepted as ALL, nor as a body that carries ALL keys.
  if (query.environment === MANAGER_ALL ? dataset.environmentCoverage === undefined || dataset.items.some((row) => row.environment === undefined)
    : dataset.environmentCoverage !== undefined || dataset.items.some((row) => row.environment !== undefined)) return "environment";
  if (query.workspaceId !== undefined && dataset.workspaceId !== query.workspaceId) return "workspace";

  const selected = dataset.selectedWindow;
  if (query.window === undefined) {
    if (selected !== null) return "window";
  } else if (selected === null) {
    return "window";
  } else if (typeof query.window === "string") {
    if (selected.requested !== query.window) return "window";
  } else if (selected.kind !== "window" || typeof selected.requested === "string" || selected.requested.fromMs !== query.window.fromMs || selected.requested.toMs !== query.window.toMs) {
    return "window";
  }

  if (query.limit !== undefined && dataset.page.limit !== query.limit) return "limit";

  const asked = query.groupBy ?? [];
  if (asked.length === 0 ? dataset.groups.length > 0 : dataset.groups.some((group) => group.key.length !== asked.length || group.key.some((part, index) => part.field !== asked[index]))) return "group_by";

  if (query.surface === "PORTFOLIO" && dataset.items.some((row) => row.portfolioId !== query.id)) return "scope";
  if (query.surface === "ALPHA" && dataset.items.some((row) => row.alphaId !== query.id)) return "scope";
  if (query.surface === "ACCOUNT" && dataset.items.some((row) => !row.children.some((child) => child.accountId === query.id))) return "scope";
  if (query.surface === "DEPLOYMENT" && dataset.items.some((row) => !row.children.some((child) => child.deploymentId === query.id))) return "scope";

  const stages = query.stageFilter ?? [];
  if (stages.length > 0 && dataset.items.some((row) => row.stagePresence.some((stage) => !stages.includes(stage)) || (row.currentStage !== null && !stages.includes(row.currentStage)))) return "stage_filter";

  if (query.q !== undefined && query.qMode !== undefined) {
    const needle = query.q.toLowerCase();
    const hit = (name: string | null) => name !== null && (query.qMode === "PREFIX" ? name.toLowerCase().startsWith(needle) : name.toLowerCase().includes(needle));
    if (dataset.items.some((row) => !hit(row.name))) return "q";
  }
  for (const filter of query.filters ?? []) if (dataset.items.some((row) => rowFailsFilter(row, filter))) return "filters";

  const first = query.sort?.[0];
  if (first !== undefined && first.field === "current_stage") {
    const stages = dataset.items.map((row) => row.currentStage);
    // Nulls are last in both directions (`query_policy.null_order`); the stage words compare as plain text (the set is closed, ASCII).
    let seenNull = false;
    for (let index = 0; index < stages.length; index += 1) {
      const stage = stages[index]!;
      if (stage === null) { seenNull = true; continue; }
      if (seenNull) return "sort";
      const before = index > 0 ? stages[index - 1] : null;
      if (before !== null && before !== undefined && (first.direction === "asc" ? before > stage : before < stage)) return "sort";
    }
  }
  return null;
}

export const datasetAnswersQuery = (dataset: ManagerDataset, query: ManagerDatasetQuery): boolean => datasetQueryMismatch(dataset, query) === null;
