/**
 * Opt-in, SYNTHETIC review data only. Never imported by product code, never source acceptance.
 * The original sparse L0 doubles are not changed. The caller selects the shared medium/large
 * bffScale universe; this answerer never changes process-global scale or clock state.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { answerManagerFleet, answerManagerSeries } from "../frontend/e2e/bffDoubleManager";
import { addDecimal, fixtureNowMs, scaled, type AlphaSpec, type DeploymentSpec } from "../frontend/e2e/bffScale";

// Mutable copies of published JSON templates, confined to this server-only fixture module.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Draft = any;
export type ReviewManagerProfile = "populated" | "layout-stress";
export interface ReviewManagerResponse { status: number; body: unknown }
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
// The standalone build has one explicit supported relocation: fixture-bff/dist/server.mjs.
// Do not search arbitrary parent directories or substitute another fixture source.
const CONTRACTS = join(MODULE_DIR, basename(MODULE_DIR) === "dist" ? "../../../../packages/contracts/fixtures" : "../../../packages/contracts/fixtures");
const fixture = (name: string): Draft => JSON.parse(readFileSync(join(CONTRACTS, name), "utf8")).value;
const copy = <T,>(value: T): T => structuredClone(value);
const digest = (value: unknown): string => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const problem = (status: number, code: string, message: string): ReviewManagerResponse => ({ status, body: { error: { code, message } } });
const unavailable = (subject: Draft, reason: string): Draft => {
  const entry = fixture("execution-manager-series.unavailable.synthetic.valid.json").series[1];
  return { ...entry, subject, reason_code: reason, quality: { ...entry.quality, reasons: [reason, "FIXTURE_LAB_SYNTHETIC"] } };
};
const STAGES: Record<string, readonly string[]> = { paper: ["PAPER"], sandbox: ["SANDBOX"], live: ["CANARY", "LIVE"] };
const domain = (environment: string): string => environment === "live" ? "ACTUAL" : environment.toUpperCase();

function comparison(series: Draft[]): Draft {
  const neutral = { transform: "NONE_NO_REBASE_NO_CROSS_CURRENCY_SUM", axis_ms: null };
  const described = series.filter((entry) => entry.state !== "UNAVAILABLE");
  const common = (entry: Draft): Draft => ({ economic_domain: entry.partition.economic_domain, native_profile_ref: entry.partition.native_profile_ref,
    currency: entry.currency, basis: entry.basis, unit: entry.unit, ratio_scale: entry.ratio_scale, methodology_ref: entry.methodology_ref, window: entry.window });
  if (series.length === 1) return { ...neutral, state: "SINGLE_SUBJECT", reason_code: null, common: described.length ? common(described[0]) : null };
  const first = described[0];
  if (first) {
    const mismatches: [string, (entry: Draft) => boolean][] = [
      ["CURRENCY_MIXED", (entry) => entry.currency !== first.currency],
      ["ECONOMIC_PARTITION_MIXED", (entry) => entry.partition.economic_domain !== first.partition.economic_domain || entry.partition.native_profile_ref !== first.partition.native_profile_ref],
      ["BASIS_MIXED", (entry) => entry.basis !== first.basis], ["UNIT_MIXED", (entry) => entry.unit !== first.unit],
      ["RATIO_SCALE_MIXED", (entry) => entry.ratio_scale !== first.ratio_scale], ["METHODOLOGY_MIXED", (entry) => entry.methodology_ref !== first.methodology_ref],
      ["WINDOW_MISMATCH", (entry) => JSON.stringify(entry.window) !== JSON.stringify(first.window)],
    ];
    for (const [reason, differs] of mismatches) if (described.some(differs)) return { ...neutral, state: "INCOMPARABLE", reason_code: reason, common: null };
  }
  if (series.some((entry) => entry.state !== "AVAILABLE")) return { ...neutral, state: "UNAVAILABLE", reason_code: "SUBJECT_SERIES_UNAVAILABLE", common: null };
  return { ...neutral, state: "ALIGNED", reason_code: null, common: common(first), axis_ms: [...new Set<number>(series.flatMap((entry) => entry.points.map((point: Draft) => point.ts_ms)))].sort((a, b) => a - b) };
}

/** Exact decimal synthesis uses integer arithmetic, not floats, and keeps true zero distinct. */
function sampleValue(metric: string, index: number, subjectIndex: number): string {
  if (metric === "RETURN") return index === 0 ? "0" : decimal(BigInt((index % 79) - 24) * 137n + BigInt(subjectIndex), 6);
  if (metric === "NET_PNL") return index === 0 ? "0" : decimal(BigInt((index % 97) - 39) * 1_000_000_000_000_000_003n + BigInt(subjectIndex), 18);
  return decimal(100_000_000_000_000_000_000_001n + BigInt(subjectIndex) * 5_000_000_000_000_000_000_000n + BigInt(index) * 170_000_000_000_000_003n, 18);
}
function decimal(value: bigint, places: number): string {
  const sign = value < 0n ? "-" : "";
  const raw = (value < 0n ? -value : value).toString().padStart(places + 1, "0");
  return `${sign}${raw.slice(0, -places)}.${raw.slice(-places)}`;
}

function seriesAnswer(method: string, path: string, search: URLSearchParams, profile: ReviewManagerProfile): ReviewManagerResponse | null {
  const checked = answerManagerSeries(method, path, search);
  if (checked === null || checked.status !== 200) return checked;
  const original = checked.body as Draft;
  // Existing explicit state cases remain usable in the rich lane too; no absence becomes zero.
  if (search.get("workspace_id")?.startsWith("ws_TEST_SERIES_") || original.selected_window.requested === "ALL") return checked;
  const metric = search.get("metric")!;
  const subjects = JSON.parse(search.get("subjects")!) as Draft[];
  const requested = JSON.parse(search.get("window")!) as string | { from_ms: number; to_ms: number };
  const now = fixtureNowMs();
  const target = profile === "layout-stress" ? 1440 : 240;
  const days = requested === "7D" ? 7 : requested === "90D" ? 90 : 30;
  const window = typeof requested === "string" ? { from_ms: now - days * 86_400_000, to_ms: now } : requested;
  if (window.from_ms < 0 || window.to_ms > now || window.to_ms - window.from_ms < target + 1) {
    return problem(400, "MANAGER_REVIEW_WINDOW_NOT_SUPPORTED", "Synthetic review windows must end by FIXTURE_NOW and contain enough distinct timestamps for this profile.");
  }
  const body = fixture(metric === "RETURN" ? "execution-manager-series.return.synthetic.valid.json" : "execution-manager-series.populated.synthetic.valid.json");
  body.metric = metric;
  body.environment = original.environment;
  body.workspace_id = original.workspace_id;
  body.as_of_ms = now;
  body.recorded_through_ms = now;
  body.quality = { completeness: "PARTIAL", freshness: "FRESH", reasons: ["FIXTURE_LAB_SYNTHETIC", "SOURCE_GAP"] };
  body.selected_window = { requested, resolved: window, selection_basis: "EXACT_PUBLISHED_METRIC_WINDOW_ONLY", reason_code: null };
  const pinned = search.has("economic_partition") ? JSON.parse(search.get("economic_partition")!) : null;
  const knownPortfolios = new Map(scaled().portfolios.map((portfolio) => [portfolio.id, portfolio]));
  body.series = subjects.map((subject, subjectIndex) => {
    const identity = { subject_type: subject.subject_type, subject_id: subject.subject_type === "FUND" ? body.workspace_id : subject.subject_id };
    const portfolio = knownPortfolios.get(identity.subject_id);
    // Keep the canonical small-lane subjects valid; unknown scaled IDs are not fabricated.
    if (subject.subject_type === "PORTFOLIO" && !portfolio && !["TEST_ONLY:portfolio-a", "TEST_ONLY:portfolio-b", "pf_a", "pf_b"].includes(identity.subject_id)) return unavailable(identity, "SUBJECT_HAS_NO_ACTIVE_MEMBERS");
    const entry = copy(body.series[0]);
    entry.subject = identity;
    entry.partition = { economic_domain: domain(body.environment), currency: portfolio?.base ?? "USDT", basis: `FIXTURE_LAB:${metric}:synthetic-book`,
      native_profile_ref: `FIXTURE_LAB:${body.environment}:synthetic`, domain_proof_ref: "FIXTURE_LAB:NOT_PRODUCT_AUTHORITY" };
    if (pinned && Object.keys(entry.partition).some((key) => pinned[key] !== entry.partition[key])) return unavailable(identity, "ECONOMIC_PARTITION_REQUIRED");
    entry.unit = metric === "RETURN" ? "RATIO" : "MONEY";
    entry.currency = metric === "RETURN" ? null : entry.partition.currency;
    entry.ratio_scale = metric === "RETURN" ? "FRACTION" : null;
    entry.basis = entry.partition.basis;
    entry.methodology_ref = `FIXTURE_LAB:${metric}:synthetic-sequence-v1`;
    entry.window = copy(window);
    const missing = Math.floor(target / 2);
    const at = (index: number): number => window.from_ms + Math.floor(index * (window.to_ms - window.from_ms - 1) / target);
    entry.points = Array.from({ length: target + 1 }, (_, index) => index).filter((index) => index !== missing)
      .map((index) => ({ ts_ms: at(index), value: sampleValue(metric, index, subjectIndex) }));
    entry.gaps = [{ from_ms: at(missing), to_ms: at(missing), reason: "SOURCE_GAP" }];
    entry.quality = copy(body.quality);
    entry.source_confidence = "PROVISIONAL";
    entry.provenance_refs = [digest(["FIXTURE_LAB_SYNTHETIC", profile, body.environment, identity, metric, window])];
    entry.calculation_revision = "FIXTURE_LAB:review-manager.v1";
    entry.policy_revision = "FIXTURE_LAB:NOT_PRODUCT_POLICY";
    return entry;
  });
  body.comparison = comparison(body.series);
  body.lineage.source_set_ref = digest(["FIXTURE_LAB_SYNTHETIC", profile, now]);
  body.lineage.revision = digest([body.workspace_id, body.environment, body.metric, body.selected_window, body.series]);
  return { status: 200, body };
}

function metric(template: Draft, value: string | null, currency: string): Draft {
  const out = copy(template);
  out.value = value;
  out.currency = currency;
  out.unit = "MONEY";
  out.basis = "FIXTURE_LAB:synthetic-book";
  out.methodology_ref = value === null ? null : "FIXTURE_LAB:synthetic-sequence-v1";
  out.availability = value === null ? "UNAVAILABLE" : "AVAILABLE";
  out.reason_code = value === null ? "SOURCE_FACTS_NOT_PUBLISHED" : null;
  out.quality = { completeness: value === null ? "UNRESOLVED" : "COMPLETE", freshness: "FRESH", reasons: ["FIXTURE_LAB_SYNTHETIC"] };
  out.source_confidence = "PROVISIONAL";
  out.provenance_refs = ["FIXTURE_LAB:SYNTHETIC_NOT_SOURCE_ACCEPTANCE"];
  out.policy_revision = "FIXTURE_LAB:NOT_PRODUCT_POLICY";
  return out;
}
const sum = (values: string[]): string => values.reduce(addDecimal, "0");
function aggregate(rows: Draft[]): Draft[] {
  const byPartition = new Map<string, Draft>();
  for (const row of rows) for (const item of row.economic_partitions) {
    const key = JSON.stringify(item.partition);
    const found = byPartition.get(key);
    if (!found) { byPartition.set(key, copy(item)); continue; }
    for (const name of Object.keys(item.metrics)) {
      const a = found.metrics[name];
      const b = item.metrics[name];
      found.metrics[name] = metric(a, a.value === null || b.value === null ? null : addDecimal(a.value, b.value), item.partition.currency);
    }
  }
  return [...byPartition.values()];
}

function rowsFor(environment: string, template: Draft): Draft[] {
  const universe = scaled();
  if (universe.alphas.length === 0) return copy(template.items);
  const rows: Draft[] = [];
  const make = (alpha: AlphaSpec, deployments: DeploymentSpec[]): void => {
    const first = deployments[0]!;
    const row = copy(template.items[0]);
    row.alpha_id = alpha.id;
    row.alpha_version_id = alpha.version;
    row.portfolio_id = first.portfolioId;
    row.row_key = JSON.stringify([row.alpha_id, row.alpha_version_id, row.portfolio_id]);
    row.name = `${alpha.label} · synthetic review`;
    row.owner_user_id = alpha.owner;
    row.lifecycle = deployments.some((entry) => entry.active) ? "ACTIVE" : "HALTED";
    row.venue = first.venue;
    row.health = alpha.health;
    row.source_state = "FRESH";
    row.stage_presence = [...new Set(deployments.map((entry) => entry.stage))].sort();
    row.children = deployments.map((entry) => ({ alpha_id: alpha.id, alpha_version_id: alpha.version, portfolio_id: entry.portfolioId,
      deployment_id: entry.id, account_id: entry.accountId, stage: entry.stage, binding_ref: universe.bindings.find((binding) => binding.accountId === entry.accountId)?.bindingId ?? null }));
    row.current_stage = row.stage_presence.length === 1 ? row.stage_presence[0] : null;
    row.entered_at_ms = null;
    row.days_in_stage = null;
    row.stage_lifecycle_reasons = { current_stage: row.current_stage === null ? "MULTIPLE_ACTIVE_STAGES" : null,
      entered_at_ms: "STAGE_ENTRY_TIME_NOT_PUBLISHED", days_in_stage: "STAGE_ENTRY_TIME_NOT_PUBLISHED" };
    const sourceMetric = template.items[0].metrics.net_pnl;
    // Real zero, signed exact decimals, and a declared missing figure are all present.
    row.metrics = { allocation: metric(sourceMetric, sum(deployments.map((entry) => entry.allocation)), first.currency),
      net_pnl: metric(sourceMetric, rows.length % 11 === 0 ? "0" : sum(deployments.map((entry) => entry.realized)), first.currency),
      unrealized_pnl: metric(sourceMetric, rows.length % 7 === 0 ? null : sum(deployments.map((entry) => entry.unrealized)), first.currency) };
    row.economic_partitions = [{ partition: { economic_domain: domain(environment), currency: first.currency, basis: "FIXTURE_LAB:synthetic-book",
      native_profile_ref: `FIXTURE_LAB:${environment}:synthetic`, domain_proof_ref: "FIXTURE_LAB:NOT_PRODUCT_AUTHORITY" }, metrics: copy(row.metrics) }];
    rows.push(row);
  };
  for (const alpha of universe.alphas) {
    const books = new Map<string, DeploymentSpec[]>();
    for (const deployment of alpha.deployments.filter((entry) => entry.environment === environment)) {
      const key = deployment.portfolioId;
      books.set(key, [...(books.get(key) ?? []), deployment]);
    }
    for (const deployments of books.values()) make(alpha, deployments);
  }
  return rows;
}

function datasetAnswer(method: string, path: string, search: URLSearchParams, profile: ReviewManagerProfile): ReviewManagerResponse | null {
  const match = /^\/manager\/(fund-overview|fleet|(?:portfolios|alphas|accounts|deployments)\/([^/]+)\/overview)$/.exec(path);
  if (method !== "GET" || !match) return null;
  const checkedQuery = new URLSearchParams(search);
  checkedQuery.delete("after");
  checkedQuery.delete("before");
  checkedQuery.delete("lifecycle_filter");
  const checked = answerManagerFleet("GET", "/manager/fleet", checkedQuery)!;
  if (checked.status !== 200) return checked;
  const filters = JSON.parse(search.get("filters") ?? "[]") as Draft[];
  const sort = JSON.parse(search.get("sort") ?? "[]") as Draft[];
  if (filters.some((filter) => Object.keys(filter).sort().join(",") !== (filter.op === "IN" ? "field,op,values" : filter.op === "IS_NULL" ? "field,op" : "field,op,value"))
    || sort.some((key) => Object.keys(key).sort().join(",") !== "direction,field")
    || new Set(sort.map((key) => key.field)).size !== sort.length) return problem(400, "EXECUTION_READ_QUERY_INVALID", "Filter/sort objects contain only the published fields; a sort field occurs once.");
  // Do not let the validation copy conceal a duplicate or unsupported cursor/lifecycle shape.
  if ([...search.keys()].some((key) => search.getAll(key).length !== 1) || (search.has("after") && search.has("before"))) return problem(400, "EXECUTION_READ_QUERY_INVALID", "A parameter is repeated, or both cursor directions were supplied.");
  const lifecycle = search.get("lifecycle_filter");
  if (lifecycle !== null && (lifecycle.length < 1 || lifecycle.length > 256 || /[\u0000-\u001f\u007f]/.test(lifecycle))) return problem(400, "EXECUTION_READ_QUERY_INVALID", "lifecycle_filter is printable text.");
  const body = copy(checked.body) as Draft;
  const template = fixture("execution-manager-dataset.partitions.synthetic.valid.json");
  const environment = search.get("environment")!;
  const surface = match[1] === "fleet" ? "FLEET" : match[1] === "fund-overview" ? "FUND" : ({ portfolios: "PORTFOLIO", alphas: "ALPHA", accounts: "ACCOUNT", deployments: "DEPLOYMENT" } as Record<string, string>)[match[1]!.split("/")[0]!]!;
  let id: string | undefined;
  try { id = match[2] === undefined ? undefined : decodeURIComponent(match[2]); } catch { return problem(400, "EXECUTION_READ_QUERY_INVALID", "The resource id is not URI text."); }
  let rows = rowsFor(environment, template);
  const universe = scaled();
  if (id !== undefined) {
    const known = surface === "PORTFOLIO" ? universe.portfolios.some((entry) => entry.id === id) : surface === "ALPHA" ? universe.alphas.some((entry) => entry.id === id)
      : surface === "ACCOUNT" ? universe.bindings.some((entry) => entry.accountId === id && entry.environment === environment) : universe.alphas.some((alpha) => alpha.deployments.some((entry) => entry.id === id && entry.environment === environment));
    const canonicalKnown = rows.some((row) => surface === "PORTFOLIO" ? row.portfolio_id === id : surface === "ALPHA" ? row.alpha_id === id : row.children.some((child: Draft) => child[surface === "ACCOUNT" ? "account_id" : "deployment_id"] === id));
    if (!known && !canonicalKnown) return problem(404, "EXECUTION_READ_NOT_AVAILABLE", "This synthetic review resource is not in the selected universe/environment.");
    rows = rows.filter((row) => surface === "PORTFOLIO" ? row.portfolio_id === id : surface === "ALPHA" ? row.alpha_id === id : row.children.some((child: Draft) => child[surface === "ACCOUNT" ? "account_id" : "deployment_id"] === id));
    if (surface === "ACCOUNT" || surface === "DEPLOYMENT") {
      // The book metric cannot be relabelled as one child's contribution.
      for (const row of rows) {
        const children = row.children.filter((child: Draft) => child[surface === "ACCOUNT" ? "account_id" : "deployment_id"] === id);
        if (children.length !== row.children.length) {
          for (const key of Object.keys(row.metrics)) row.metrics[key] = metric(row.metrics[key], null, row.economic_partitions[0].partition.currency);
          row.economic_partitions[0].metrics = copy(row.metrics);
        }
        row.children = children;
      }
    }
  }
  const stages = search.has("stage_filter") ? search.get("stage_filter")!.split(",") : STAGES[environment]!;
  rows = rows.flatMap((row) => {
    const children = row.children.filter((child: Draft) => stages.includes(child.stage));
    if (!children.length) return [];
    if (children.length !== row.children.length) {
      for (const key of Object.keys(row.metrics)) row.metrics[key] = metric(row.metrics[key], null, row.economic_partitions[0].partition.currency);
      row.economic_partitions[0].metrics = copy(row.metrics);
    }
    row.children = children;
    row.stage_presence = [...new Set(children.map((child: Draft) => child.stage))].sort();
    row.current_stage = row.stage_presence.length === 1 ? row.stage_presence[0] : null;
    row.stage_lifecycle_reasons.current_stage = row.current_stage === null ? "MULTIPLE_ACTIVE_STAGES" : null;
    return [row];
  });
  body.surface = surface;
  body.as_of_ms = fixtureNowMs();
  body.recorded_through_ms = fixtureNowMs();
  body.facts_through_ms = fixtureNowMs();
  body.quality = { completeness: "PARTIAL", freshness: "FRESH", reasons: ["FIXTURE_LAB_SYNTHETIC", "RUNTIME_SCORE_POLICY_AND_SOURCE_NOT_QUALIFIED"] };
  body.capital_statements = aggregate(rows); // Selected resource/stages BEFORE table filters.
  const textOf = (row: Draft, field: string): string | null => field === "stage_presence" ? row.stage_presence.join(",") : typeof row[field] === "string" ? row[field] : null;
  const q = search.get("q")?.toLowerCase();
  rows = rows.filter((row) => (lifecycle === null || row.lifecycle === lifecycle)
    && (q === undefined || (search.get("q_mode") === "CONTAINS" ? row.name.toLowerCase().includes(q) : row.name.toLowerCase().startsWith(q)))
    && filters.every((filter) => filter.op === "EQ" ? textOf(row, filter.field) === filter.value : filter.op === "IN" ? filter.values.includes(textOf(row, filter.field)) : textOf(row, filter.field) === null));
  rows.sort((a, b) => {
    for (const key of sort) {
      const x = textOf(a, key.field); const y = textOf(b, key.field);
      if (x === y) continue;
      if (x === null) return 1;
      if (y === null) return -1;
      return (x < y ? -1 : 1) * (key.direction === "asc" ? 1 : -1);
    }
    return a.row_key < b.row_key ? -1 : a.row_key > b.row_key ? 1 : 0;
  });
  const groups = search.has("group_by") ? search.get("group_by")!.split(",") : [];
  const grouped = new Map<string, { key: Draft[]; rows: Draft[] }>();
  for (const row of rows) if (groups.length) {
    const key = groups.map((field) => ({ field, value: textOf(row, field) }));
    const encoded = JSON.stringify(key);
    const group = grouped.get(encoded) ?? { key, rows: [] };
    group.rows.push(row);
    grouped.set(encoded, group);
  }
  body.groups = [...grouped.values()].map((group) => ({ key: group.key, unique_row_count: group.rows.length, totals_scope: "FULL_AUTHORIZED_FILTERED_QUERY", economic_partitions: aggregate(group.rows) }));
  const bound = digest([profile, path, [...search.entries()].filter(([key]) => !["after", "before", "limit"].includes(key)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)]);
  const snapshot = digest(["FIXTURE_LAB_SYNTHETIC", profile, environment, body.workspace_id, fixtureNowMs(), rows]);
  const limit = Number(search.get("limit") ?? 100);
  let offset = 0;
  const cursorText = search.get("after") ?? search.get("before");
  if (cursorText !== null) {
    let cursor: Draft;
    try { cursor = JSON.parse(Buffer.from(cursorText, "base64url").toString("utf8")); } catch { return problem(400, "EXECUTION_READ_QUERY_INVALID", "The cursor was not issued by this review profile."); }
    if (!cursor || typeof cursor !== "object" || Object.keys(cursor).sort().join(",") !== "b,o,s" || !Number.isSafeInteger(cursor.o) || cursor.o < 0) return problem(400, "EXECUTION_READ_QUERY_INVALID", "The cursor shape is invalid.");
    if (cursor.b !== bound || cursor.s !== snapshot) return problem(409, "MANAGER_CURSOR_CHANGED", "The cursor belongs to another query, profile or snapshot.");
    offset = cursor.o;
    if (offset >= rows.length) return problem(400, "EXECUTION_READ_QUERY_INVALID", "The cursor is outside this result.");
  }
  const encode = (at: number): string => Buffer.from(JSON.stringify({ o: at, b: bound, s: snapshot })).toString("base64url");
  body.items = rows.slice(offset, offset + limit);
  body.page = { limit, returned_count: body.items.length, authorized_filtered_count: rows.length,
    next_cursor: offset + limit < rows.length ? encode(offset + limit) : null, previous_cursor: offset > 0 ? encode(Math.max(0, offset - limit)) : null };
  body.snapshot_id = snapshot;
  body.lineage.source_set_ref = digest(["FIXTURE_LAB_SYNTHETIC", profile, fixtureNowMs()]);
  body.lineage.revision = snapshot;
  // Keep the published descriptor; numeric requests receive the original explicit 400 above,
  // never a body that silently ignores them. This review module is not the production query engine.
  body.query_options = copy(template.query_options);
  if (Buffer.byteLength(JSON.stringify(body)) > body.query_policy.maximum_response_bytes) return problem(400, "MANAGER_REVIEW_RESPONSE_TOO_LARGE", "Reduce limit/grouping for this bounded review response.");
  return { status: 200, body };
}

export function answerReviewManager(method: string, path: string, search: URLSearchParams, profile: ReviewManagerProfile): ReviewManagerResponse | null {
  const normalized = path.replace(/^\/api\/v1\/execution(?=\/)/, "");
  return seriesAnswer(method, normalized, search, profile) ?? datasetAnswer(method, normalized, search, profile);
}
