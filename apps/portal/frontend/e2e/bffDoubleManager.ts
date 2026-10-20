/**
 * Manager reads for the e2e BFF double and the fixture BFF (FIXTURE_LAB / BFF_DOUBLE lane, NOT acceptance evidence).
 *
 *   GET /api/v1/execution/manager/series   portal.execution.manager-series.v1
 *   GET /api/v1/execution/manager/fleet    portal.execution.manager-dataset.v1 (surface FLEET)
 *
 * Every body is built from the PUBLISHED canonical fixtures in `packages/contracts/fixtures`, never from a hand-written object.
 * What is rewritten is only what the REQUEST decides (the ids, the metric, the environment, the workspace, the window, the page
 * envelope, the groups, the rows that survive a filter), because the ports refuse a well-formed body that answers another
 * question (`seriesAnswersQuery`, `datasetQueryMismatch`). The unit suites build the same bodies from the same fixtures
 * (`v2/screens/series/seriesDouble.testbase.ts`, `v2/screens/fleet/datasetDouble.testbase.ts`); `bffDoubleManager.test.ts`
 * holds the two to each other.
 *
 * Opt-in: the callers (`answerExecutionBff`) ask this module only with `screensV2`, so the V1 stubs keep their 501.
 *
 * ── series: which fixture answers, chosen by the `workspace_id` of the read (the convention `bffDoubleAccess.ts` uses) ─────
 *
 *   metric NAV      (none, anything else)                    populated            2 PORTFOLIO series, ALIGNED
 *                   ws_TEST_SERIES_EMPTY                     empty               EMPTY entries
 *                   ws_TEST_SERIES_UNAVAILABLE               unavailable         typed UNAVAILABLE, series_source NOT_PUBLISHED
 *                   ws_TEST_SERIES_CURRENCY_MIXED            currency-mixed      INCOMPARABLE / CURRENCY_MIXED
 *   metric RETURN   (none, anything else)                    return              ratio FRACTION on both subjects
 *                   ws_TEST_SERIES_RETURN_SCALE_MIXED        return-scale-mixed  INCOMPARABLE / RATIO_SCALE_MIXED
 *                   ws_TEST_SERIES_RETURN_SCALE_NOT_PUBLISHED return-scale-not-published  UNAVAILABLE / RATIO_SCALE_NOT_PUBLISHED
 *   metric NET_PNL  no canonical fixture exists: every subject is the typed UNAVAILABLE entry (SERIES_SOURCE_NOT_PUBLISHED),
 *                   built from the `unavailable` fixture. A populated NAV body is never relabelled as a PnL.
 *   window ALL      a typed gap whatever the source holds (ALL_HISTORY_WINDOW_NOT_PUBLISHED).
 *   The fixtures publish one window (30D); 7D, 30D, 90D and an explicit window are echoed as `requested` and resolve to it.
 *   A pinned `economic_partition` that is not the fixture's partition makes that entry the typed UNAVAILABLE entry.
 *
 * ── fleet: the environment picks the population ─────────────────────────────────────────────────────────────────────────
 *
 *   paper    execution-manager-dataset.partitions    2 rows, 2 currencies
 *   live     execution-manager-dataset.lifecycle.live  2 rows (one LIVE, one CANARY and LIVE)
 *   sandbox  execution-manager-dataset.synthetic     an empty page
 *   Applied for real: `workspace_id`, `q` + `q_mode`, `stage_filter`, `filters` (EQ, IN, IS_NULL on the text fields), `sort` (text
 *   fields, nulls last), `group_by` (text fields), `limit`, `after`. Answered 400 MANAGER_QUERY_NOT_SUPPORTED_BY_DOUBLE, never with
 *   a body that ignores them: `window`, `economic_partition`, `lifecycle_filter`, `before`, a numeric `filters`/`sort` field. The other
 *   five dataset routes (fund, portfolio, alpha, account, deployment overview) are not served (`null`).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface BffAnswerManager {
  status: number;
  body: unknown;
  contentType?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Draft = any;

const CONTRACTS = join(dirname(fileURLToPath(import.meta.url)), "../../../../packages/contracts/fixtures");
const fixtureValue = (name: string): Draft => (JSON.parse(readFileSync(join(CONTRACTS, name), "utf8")) as { value: Draft }).value;
const clone = <T,>(value: T): T => structuredClone(value);

const problem = (status: number, code: string, message: string): BffAnswerManager => ({ status, body: { error: { code, message } } });

const ENVIRONMENTS = ["paper", "sandbox", "live"] as const;
const WORKSPACE = /^[^\u0000-\u001f\u007f]{1,256}$/;

/* ═══════════════════════════════ series ═══════════════════════════════ */

export const MANAGER_SERIES_ROUTE = "/manager/series";

export const SERIES_DOUBLE_WORKSPACES = {
  empty: "ws_TEST_SERIES_EMPTY",
  unavailable: "ws_TEST_SERIES_UNAVAILABLE",
  currencyMixed: "ws_TEST_SERIES_CURRENCY_MIXED",
  returnScaleMixed: "ws_TEST_SERIES_RETURN_SCALE_MIXED",
  returnScaleNotPublished: "ws_TEST_SERIES_RETURN_SCALE_NOT_PUBLISHED",
} as const;

const SERIES_FILES = {
  populated: "execution-manager-series.populated.synthetic.valid.json",
  empty: "execution-manager-series.empty.synthetic.valid.json",
  unavailable: "execution-manager-series.unavailable.synthetic.valid.json",
  currencyMixed: "execution-manager-series.currency-mixed.synthetic.valid.json",
  return: "execution-manager-series.return.synthetic.valid.json",
  returnScaleMixed: "execution-manager-series.return-scale-mixed.synthetic.valid.json",
  returnScaleNotPublished: "execution-manager-series.return-scale-not-published.synthetic.valid.json",
} as const;
export type SeriesFixtureName = keyof typeof SERIES_FILES;

/** The fixture a read selects, or `unavailable` for a metric that has none. */
export function seriesFixtureFor(metric: string, workspaceId: string | null): SeriesFixtureName {
  if (metric === "NET_PNL") return "unavailable";
  const ws = workspaceId ?? "";
  if (metric === "RETURN") {
    if (ws === SERIES_DOUBLE_WORKSPACES.returnScaleMixed) return "returnScaleMixed";
    if (ws === SERIES_DOUBLE_WORKSPACES.returnScaleNotPublished) return "returnScaleNotPublished";
    return "return";
  }
  if (ws === SERIES_DOUBLE_WORKSPACES.empty) return "empty";
  if (ws === SERIES_DOUBLE_WORKSPACES.unavailable) return "unavailable";
  if (ws === SERIES_DOUBLE_WORKSPACES.currencyMixed) return "currencyMixed";
  return "populated";
}

/** The contract's own comparison rules, written from the schema text (the same oracle the unit suites use). */
function comparisonOf(series: Draft[]): Draft {
  const none = { transform: "NONE_NO_REBASE_NO_CROSS_CURRENCY_SUM", axis_ms: null };
  const described = series.filter((e) => e.state !== "UNAVAILABLE");
  const commonOf = (e: Draft) => ({
    economic_domain: e.partition.economic_domain, native_profile_ref: e.partition.native_profile_ref, currency: e.currency, basis: e.basis, unit: e.unit,
    ratio_scale: e.ratio_scale, methodology_ref: e.methodology_ref, window: e.window,
  });
  if (series.length === 1) return { state: "SINGLE_SUBJECT", reason_code: null, ...none, common: described[0] ? commonOf(described[0]) : null };
  const first = described[0];
  if (first) {
    const checks: [string, (e: Draft) => boolean][] = [
      ["CURRENCY_MIXED", (e) => e.currency !== first.currency],
      ["ECONOMIC_PARTITION_MIXED", (e) => e.partition.economic_domain !== first.partition.economic_domain || e.partition.native_profile_ref !== first.partition.native_profile_ref],
      ["BASIS_MIXED", (e) => e.basis !== first.basis],
      ["UNIT_MIXED", (e) => e.unit !== first.unit],
      ["RATIO_SCALE_MIXED", (e) => e.ratio_scale !== first.ratio_scale],
      ["METHODOLOGY_MIXED", (e) => e.methodology_ref !== first.methodology_ref],
      ["WINDOW_MISMATCH", (e) => e.window.from_ms !== first.window.from_ms || e.window.to_ms !== first.window.to_ms],
    ];
    for (const [reason, differs] of checks) if (described.some(differs)) return { state: "INCOMPARABLE", reason_code: reason, ...none, common: null };
  }
  if (series.some((e) => e.state !== "AVAILABLE")) return { state: "UNAVAILABLE", reason_code: "SUBJECT_SERIES_UNAVAILABLE", ...none, common: null };
  const axis = [...new Set(series.flatMap((e) => e.points.map((p: Draft) => p.ts_ms as number)))].sort((a, b) => a - b);
  return { state: "ALIGNED", reason_code: null, transform: none.transform, common: commonOf(first), axis_ms: axis };
}

/** The typed UNAVAILABLE entry of the published `unavailable` fixture, for another subject and reason. */
function unavailableEntry(subject: Draft, reason = "SERIES_SOURCE_NOT_PUBLISHED"): Draft {
  const template = clone(fixtureValue(SERIES_FILES.unavailable).series[1]);
  return { ...template, subject: clone(subject), reason_code: reason, quality: { ...template.quality, reasons: [reason] } };
}

const PARTITION_KEYS = ["economic_domain", "currency", "basis", "native_profile_ref", "domain_proof_ref"] as const;

function parseJson(text: string | null): { ok: true; value: unknown } | { ok: false } {
  if (text === null) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

const SERIES_KEYS = ["environment", "workspace_id", "metric", "subjects", "window", "economic_partition"];

/** `GET /manager/series`, or `null` when the request is not this route. `path` has the execution prefix stripped. */
export function answerManagerSeries(method: string, path: string, search: URLSearchParams): BffAnswerManager | null {
  if (path !== MANAGER_SERIES_ROUTE || method !== "GET") return null;
  const invalid = (message: string) => problem(400, "EXECUTION_READ_NOT_AVAILABLE", message);
  const keys = [...search.keys()];
  if (new Set(keys).size !== keys.length || keys.some((key) => !SERIES_KEYS.includes(key))) return invalid("Only environment, workspace_id, metric, subjects, window and economic_partition are read.");

  const environment = search.get("environment");
  const metric = search.get("metric");
  if (environment === null || !(ENVIRONMENTS as readonly string[]).includes(environment)) return invalid("environment is paper, sandbox or live.");
  if (metric !== "NAV" && metric !== "NET_PNL" && metric !== "RETURN") return invalid("metric is NAV, NET_PNL or RETURN.");
  const workspaceId = search.get("workspace_id");
  if (workspaceId !== null && !WORKSPACE.test(workspaceId)) return invalid("workspace_id is 1 to 256 printable characters.");

  const subjectsRaw = parseJson(search.get("subjects"));
  if (!subjectsRaw.ok || !Array.isArray(subjectsRaw.value) || subjectsRaw.value.length < 1 || subjectsRaw.value.length > 4) return invalid("subjects is a JSON array of 1 to 4 subjects.");
  const subjects: { subject_type: "FUND" | "PORTFOLIO"; subject_id?: string }[] = [];
  const seen = new Set<string>();
  for (const raw of subjectsRaw.value as Draft[]) {
    const type = raw?.subject_type;
    const keysOf = raw && typeof raw === "object" ? Object.keys(raw) : [];
    if (type === "FUND" && keysOf.length === 1) {
      if (seen.has("FUND:")) return invalid("A subject is asked once.");
      seen.add("FUND:");
      subjects.push({ subject_type: "FUND" });
    } else if (type === "PORTFOLIO" && keysOf.length === 2 && typeof raw.subject_id === "string" && WORKSPACE.test(raw.subject_id)) {
      if (seen.has(`PORTFOLIO:${raw.subject_id}`)) return invalid("A subject is asked once.");
      seen.add(`PORTFOLIO:${raw.subject_id}`);
      subjects.push({ subject_type: "PORTFOLIO", subject_id: raw.subject_id });
    } else return invalid("A subject is {subject_type: FUND} or {subject_type: PORTFOLIO, subject_id}.");
  }

  const windowRaw = parseJson(search.get("window"));
  let window: string | { from_ms: number; to_ms: number };
  if (!windowRaw.ok) return invalid("window is a JSON value: a preset or {from_ms, to_ms}.");
  const w = windowRaw.value as Draft;
  if (w === "7D" || w === "30D" || w === "90D" || w === "ALL") window = w;
  else if (w && typeof w === "object" && Object.keys(w).length === 2 && Number.isSafeInteger(w.from_ms) && Number.isSafeInteger(w.to_ms) && w.from_ms >= 0 && w.to_ms >= w.from_ms) window = { from_ms: w.from_ms, to_ms: w.to_ms };
  else return invalid("window is 7D, 30D, 90D, ALL or {from_ms, to_ms}.");

  let partition: Record<string, string> | null = null;
  if (search.has("economic_partition")) {
    const raw = parseJson(search.get("economic_partition"));
    const p = raw.ok ? (raw.value as Draft) : null;
    if (p === null || typeof p !== "object" || Object.keys(p).length !== PARTITION_KEYS.length || PARTITION_KEYS.some((key) => typeof p[key] !== "string" || p[key] === "")) return invalid("economic_partition names all five partition fields.");
    partition = p;
  }

  const name = seriesFixtureFor(metric, workspaceId);
  const body = fixtureValue(SERIES_FILES[name]);
  body.environment = environment;
  if (workspaceId !== null) body.workspace_id = workspaceId;
  body.metric = metric;
  body.selected_window = { ...body.selected_window, requested: window };

  const published = body.series as Draft[];
  const gapAll = window === "ALL";
  if (gapAll) body.selected_window = { requested: "ALL", resolved: null, selection_basis: "EXACT_PUBLISHED_METRIC_WINDOW_ONLY", reason_code: "ALL_HISTORY_WINDOW_NOT_PUBLISHED" };
  body.series = subjects.map((subject, index) => {
    const id = { subject_type: subject.subject_type, subject_id: subject.subject_type === "FUND" ? body.workspace_id : (subject.subject_id as string) };
    if (gapAll) return unavailableEntry(id, "ALL_HISTORY_WINDOW_NOT_PUBLISHED");
    if (name === "unavailable") return unavailableEntry(id);
    const entry = clone(published[index % published.length]!);
    entry.subject = id;
    if (partition !== null && entry.state !== "UNAVAILABLE" && PARTITION_KEYS.some((key) => entry.partition?.[key] !== partition![key])) return unavailableEntry(id);
    return entry;
  });
  body.comparison = comparisonOf(body.series);
  return { status: 200, body };
}

/* ═══════════════════════════════ fleet dataset ═══════════════════════════════ */

export const MANAGER_FLEET_ROUTE = "/manager/fleet";

const DATASET_FILES = {
  paper: "execution-manager-dataset.partitions.synthetic.valid.json",
  live: "execution-manager-dataset.lifecycle.live.synthetic.valid.json",
  sandbox: "execution-manager-dataset.synthetic.valid.json",
} as const;

const FLEET_KEYS = ["environment", "workspace_id", "q", "q_mode", "lifecycle_filter", "limit", "after", "before", "window", "filters", "sort", "economic_partition", "stage_filter", "group_by"];
/** Row fields a filter, sort or group can read from the row itself. */
const TEXT_FIELDS = ["alpha_id", "alpha_version_id", "name", "owner_user_id", "portfolio_id", "lifecycle", "venue", "health", "source_state", "current_stage"] as const;
const GROUP_FIELDS = [...TEXT_FIELDS.filter((f) => f !== "name" && f !== "alpha_version_id"), "stage_presence"];
const STAGES = ["PAPER", "SANDBOX", "CANARY", "LIVE"];
const STAGES_OF = { paper: ["PAPER"], sandbox: ["SANDBOX"], live: ["CANARY", "LIVE"] } as const;

const unsupported = (what: string) => problem(400, "MANAGER_QUERY_NOT_SUPPORTED_BY_DOUBLE", `The fixture double does not apply ${what}; it answers 400 rather than a body that ignores it.`);

const encodeCursor = (offset: number, snapshot: string, bound: string): string => Buffer.from(JSON.stringify({ o: offset, s: snapshot, b: bound })).toString("base64url");
function decodeCursor(cursor: string): { o: number; s: string; b: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { o: unknown; s: unknown; b: unknown };
    return Number.isSafeInteger(parsed.o) && (parsed.o as number) >= 0 && typeof parsed.s === "string" && typeof parsed.b === "string" ? { o: parsed.o as number, s: parsed.s, b: parsed.b } : null;
  } catch {
    return null;
  }
}

type FleetFilter = { field: string; op: string; value?: string; values?: string[] };

/** `GET /manager/fleet`, or `null` when the request is not this route. `path` has the execution prefix stripped. */
export function answerManagerFleet(method: string, path: string, search: URLSearchParams): BffAnswerManager | null {
  if (path !== MANAGER_FLEET_ROUTE || method !== "GET") return null;
  const invalid = (message: string) => problem(400, "EXECUTION_READ_QUERY_INVALID", message);
  const keys = [...search.keys()];
  if (new Set(keys).size !== keys.length || keys.some((key) => !FLEET_KEYS.includes(key))) return invalid("A parameter is unknown or repeated.");
  const environment = search.get("environment");
  if (environment === null || !(ENVIRONMENTS as readonly string[]).includes(environment)) return invalid("environment is paper, sandbox or live.");
  const env = environment as (typeof ENVIRONMENTS)[number];
  const workspaceId = search.get("workspace_id");
  if (workspaceId !== null && !WORKSPACE.test(workspaceId)) return invalid("workspace_id is 1 to 256 printable characters.");

  const q = search.get("q");
  const mode = search.get("q_mode");
  if ((q !== null && (q.length < 1 || q.length > 160)) || (mode !== null && q === null) || (mode !== null && mode !== "PREFIX" && mode !== "CONTAINS")) return invalid("q is 1 to 160 characters; q_mode (PREFIX or CONTAINS) needs q.");
  let limit = 100;
  if (search.has("limit")) {
    limit = Number(search.get("limit"));
    if (!Number.isInteger(limit) || limit < 1 || limit > 200 || !/^\d+$/.test(search.get("limit")!)) return invalid("limit is 1 to 200.");
  }
  if (search.has("after") && search.has("before")) return invalid("after and before are never sent together.");
  if (search.has("window")) return unsupported("a window");
  if (search.has("economic_partition")) return unsupported("a pinned economic partition");
  if (search.has("lifecycle_filter")) return unsupported("lifecycle_filter");
  if (search.has("before")) return unsupported("a backwards cursor");

  const stageFilter = search.has("stage_filter") ? search.get("stage_filter")!.split(",") : [];
  if (stageFilter.some((stage) => !STAGES.includes(stage)) || new Set(stageFilter).size !== stageFilter.length) return invalid("stage_filter is a comma list of stages.");
  if (stageFilter.some((stage) => !(STAGES_OF[env] as readonly string[]).includes(stage))) return invalid("A stage that the environment does not hold.");

  const filtersRaw = search.has("filters") ? parseJson(search.get("filters")) : { ok: true as const, value: [] };
  if (!filtersRaw.ok || !Array.isArray(filtersRaw.value) || filtersRaw.value.length > 16) return invalid("filters is a JSON array of at most 16 filters.");
  const filters = filtersRaw.value as FleetFilter[];
  for (const filter of filters) {
    if (filter === null || typeof filter !== "object" || typeof filter.field !== "string") return invalid("A filter is {field, op, value|values}.");
    if (!(TEXT_FIELDS as readonly string[]).includes(filter.field)) return unsupported(`a filter on ${filter.field}`);
    if (filter.op === "EQ") { if (typeof filter.value !== "string" || filter.values !== undefined) return invalid("EQ takes one value."); }
    else if (filter.op === "IN") { if (!Array.isArray(filter.values) || filter.values.length < 1 || filter.values.length > 32 || filter.values.some((v) => typeof v !== "string") || new Set(filter.values).size !== filter.values.length || filter.value !== undefined) return invalid("IN takes 1 to 32 distinct values."); }
    else if (filter.op === "IS_NULL") { if (filter.value !== undefined || filter.values !== undefined) return invalid("IS_NULL takes no operand."); }
    else return unsupported(`the operator ${String(filter.op)}`);
  }

  const sortRaw = search.has("sort") ? parseJson(search.get("sort")) : { ok: true as const, value: [] };
  if (!sortRaw.ok || !Array.isArray(sortRaw.value) || sortRaw.value.length > 3) return invalid("sort is a JSON array of at most 3 keys.");
  const sort = sortRaw.value as { field: string; direction: "asc" | "desc" }[];
  for (const key of sort) {
    if (key === null || typeof key !== "object" || typeof key.field !== "string" || (key.direction !== "asc" && key.direction !== "desc")) return invalid("A sort key is {field, direction}.");
    if (!(TEXT_FIELDS as readonly string[]).includes(key.field)) return unsupported(`a sort on ${key.field}`);
  }

  const groupBy = search.has("group_by") ? search.get("group_by")!.split(",") : [];
  if (groupBy.length > 2 || groupBy.some((field) => !GROUP_FIELDS.includes(field)) || new Set(groupBy).size !== groupBy.length) return invalid("group_by is one or two group fields.");

  const body = fixtureValue(DATASET_FILES[env]);
  const snapshot = body.snapshot_id as string;
  body.environment = env;
  if (workspaceId !== null) body.workspace_id = workspaceId;

  interface Candidate { row: Draft; visible: string[] }
  const textOf = (c: Candidate, field: string): string | null => {
    if (field === "stage_presence") return [...c.visible].sort().join(",");
    const value = c.row[field];
    return typeof value === "string" ? value : null;
  };
  const candidates: Candidate[] = [];
  for (const row of body.items as Draft[]) {
    const visible = stageFilter.length === 0 ? [...row.stage_presence] : (row.stage_presence as string[]).filter((stage) => stageFilter.includes(stage));
    if (stageFilter.length > 0 && visible.length === 0) continue;
    candidates.push({ row, visible });
  }
  const needle = q?.toLowerCase() ?? null;
  const matching = candidates.filter((c) => {
    if (needle !== null) {
      const name = typeof c.row.name === "string" ? c.row.name.toLowerCase() : null;
      if (name === null || !(mode === "CONTAINS" ? name.includes(needle) : name.startsWith(needle))) return false;
    }
    return filters.every((filter) => {
      const value = textOf(c, filter.field);
      if (filter.op === "EQ") return value === filter.value;
      if (filter.op === "IN") return value !== null && (filter.values ?? []).includes(value);
      return value === null;
    });
  });
  const sorted = [...matching].sort((x, y) => {
    for (const key of sort) {
      const a = textOf(x, key.field);
      const b = textOf(y, key.field);
      if (a === b) continue;
      if (a === null) return 1;
      if (b === null) return -1;
      return (a < b ? -1 : 1) * (key.direction === "asc" ? 1 : -1);
    }
    return x.row.alpha_id < y.row.alpha_id ? -1 : x.row.alpha_id > y.row.alpha_id ? 1 : 0;
  });

  const bound = JSON.stringify([env, [...search.entries()].filter(([name]) => name !== "after" && name !== "limit")]);
  let offset = 0;
  if (search.has("after")) {
    const cursor = decodeCursor(search.get("after")!);
    if (cursor === null) return invalid("after is a cursor this server issued.");
    if (cursor.b !== bound || cursor.s !== snapshot) return problem(409, "MANAGER_CURSOR_CHANGED", "The cursor belongs to another query or snapshot.");
    offset = cursor.o;
  }
  const page = sorted.slice(offset, offset + limit);
  body.items = page.map((c) => {
    const row = clone(c.row);
    row.stage_presence = [...c.visible];
    row.children = (row.children as Draft[]).filter((child) => c.visible.includes(child.stage));
    return row;
  });
  body.page = {
    limit,
    returned_count: page.length,
    authorized_filtered_count: sorted.length,
    next_cursor: offset + page.length < sorted.length ? encodeCursor(offset + page.length, snapshot, bound) : null,
    previous_cursor: offset > 0 ? encodeCursor(Math.max(0, offset - limit), snapshot, bound) : null,
  };

  // Groups total the whole filtered query, not the page; none were asked means none are published.
  if (groupBy.length === 0) body.groups = [];
  else {
    const tally = new Map<string, { key: { field: string; value: string | null }[]; count: number }>();
    for (const c of sorted) {
      const key = groupBy.map((field) => ({ field, value: textOf(c, field) }));
      const id = JSON.stringify(key);
      const entry = tally.get(id);
      if (entry) entry.count += 1;
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
  }
  return { status: 200, body };
}

/** Both manager reads, in the order the answerer asks. `path` has the execution prefix stripped. */
export function answerManager(method: string, path: string, search: URLSearchParams): BffAnswerManager | null {
  return answerManagerSeries(method, path, search) ?? answerManagerFleet(method, path, search);
}
