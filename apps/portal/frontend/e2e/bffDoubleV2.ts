/**
 * Operations V2 reads for the e2e BFF double (UXM-07 S1c, S1d).
 *
 * Serves `GET /operations` as `portal.execution.operational-queue.v2` and
 * `GET /operations/incidents/{id}` as `portal.execution.incident-current-root.v2`,
 * built from the canonical contract fixture
 * (`packages/contracts/fixtures/execution-operational-current.synthetic.valid.json`)
 * plus a few synthetic rows so keyset paging has a second page to fetch.
 *
 * Wiring (the primary owns `answerExecutionBff`): call this first, for GET
 * requests, when the V2 operations stub is on, and fall through when it
 * answers `null`:
 *
 *   const v2 = answerOperationsV2(method, path, search);   // path has /api/v1/execution stripped
 *   if (v2 !== null) return v2;
 *
 * The browser clock matters: the screen's default window is 24H, so a run
 * should fix the page clock near `OPERATIONS_V2_DOUBLE_NOW_ISO`
 * (`page.clock.setFixedTime(new Date(OPERATIONS_V2_DOUBLE_NOW_ISO))`), or the
 * fixed rows read as older than the window.
 *
 * The refusals are the server's (`current-operational-read.ts`): `assigned_to`
 * is 400 `OPERATIONAL_READ_FILTER_NOT_SUPPORTED`, a bad filter value 400
 * `OPERATIONAL_READ_INPUT_INVALID`, a cursor the double cannot read 400
 * `OPERATIONAL_READ_CURSOR_INVALID`, a cursor from a different filter 409
 * `OPERATIONAL_READ_CHANGED`, an unknown incident 404
 * `OPERATIONAL_READ_NOT_FOUND`. Incident ids with a fixed meaning:
 * `inc_TEST_ONLY_mitigated`, `inc_TEST_ONLY_resolved`, `inc_LEGACY_SHAPE` (a
 * legacy body, to prove the screen refuses to mis-read it) and `inc_NOT_FOUND`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { scaled } from "./bffScale";
import { environmentFor, riskTierFor } from "./bffWorldBooks"; // WP-B2-C
import { incidentRootTimes, incidentState, incidentVersion, WORLD_INCIDENTS, WORLD_OPERATIONS } from "./bffWorld";

export interface BffAnswerV2 {
  status: number;
  body: unknown;
  contentType?: string;
}

/** The instant to fix the page clock at: an hour after the newest fixed row. */
export const OPERATIONS_V2_DOUBLE_NOW_ISO = "2026-08-22T13:00:00Z";

const CONTRACTS = join(dirname(fileURLToPath(import.meta.url)), "../../../../packages/contracts/fixtures");
const FIXTURE = JSON.parse(
  readFileSync(join(CONTRACTS, "execution-operational-current.synthetic.valid.json"), "utf8"),
) as { queue: Record<string, unknown>; incident: Record<string, unknown> };

type Row = Record<string, unknown> & { operation_id: string; created_at: string };
const FIXTURE_PAGE = FIXTURE.queue.page as { rows: Row[] };
const FIXTURE_ROW = FIXTURE_PAGE.rows[0];

function dataset(): Row[] {
  // The generated rows are empty unless the standalone server runs at a larger scale (bffScale.ts).
  const synthetic: Row[] = [...WORLD_OPERATIONS, ...scaled().operations].map((s) => ({
    ...FIXTURE_ROW,
    operation_id: s.id,
    command_key: s.command,
    target: { type: s.target[0], id: s.target[1] },
    environment: environmentFor(s.target[0], s.target[1], s.env), // WP-B2-C: a partition the target really has
    risk_tier: riskTierFor(environmentFor(s.target[0], s.target[1], s.env), s.risk, s.env),
    severity: s.severity,
    source_status: s.source,
    verification_result: s.verify,
    triage_state: s.triage,
    workflow_version: s.triage === "UNACKNOWLEDGED" ? 1 : 2,
    acknowledged_at: s.triage === "UNACKNOWLEDGED" ? null : s.at,
    resolved_at: s.triage === "RESOLVED" ? s.at : null,
    created_at: s.at,
    updated_at: s.at,
  }));
  // ===== WP-B2-A3: the canonical first row names an account; its environment is the account's (R3-04)
  const target = (FIXTURE_ROW as { target?: { type: string; id: string } }).target;
  const first = target !== undefined ? { ...FIXTURE_ROW, environment: environmentFor(target.type, target.id, String(FIXTURE_ROW.environment) as "PAPER" | "SANDBOX" | "LIVE") } : FIXTURE_ROW;
  // ===== WP-B2-A3 end
  return [first, ...synthetic];
}

let memo: { source: unknown; rows: Row[] } | null = null;
let memoSim: { source: unknown; rows: Row[] } | null = null;
/** Built once per scale: the generated list is a different array for each scale, so identity is the key. */
function allRows(simulate = false): Row[] {
  const source = scaled().operations;
  if (memo === null || memo.source !== source) memo = { source, rows: dataset() };
  if (!simulate) return memo.rows;
  if (memoSim === null || memoSim.source !== source) memoSim = { source, rows: memo.rows.map(settleHealthy) };
  return memoSim.rows;
}

/**
 * SIMULATED (FIXTURE_LAB, opt-in): a row whose source succeeded, whose verification succeeded and whose display is current needs nobody, so
 * the lane has it already settled in the Portal (acknowledged and resolved when it was recorded). The default "Needs attention" lens is the
 * published `triage_state=UNACKNOWLEDGED`, so without this it listed healthy rows beside the ones that need a person.
 */
function settleHealthy(row: Row): Row {
  if (row.triage_state !== "UNACKNOWLEDGED" || row.source_status !== "SUCCEEDED" || row.verification_result !== "SUCCEEDED") return row;
  if (simulatedAxes(row).display_state !== "CURRENT") return row;
  return { ...row, triage_state: "RESOLVED", workflow_version: 2, acknowledged_at: row.created_at, resolved_at: row.created_at };
}

function problem(status: number, code: string, message: string): BffAnswerV2 {
  return { status, body: { error: { code, message }, request_id: "req_double_operations_v2" } };
}

const TRIAGE = ["UNACKNOWLEDGED", "ACKNOWLEDGED", "RESOLVED"];
const ENVIRONMENT = ["PAPER", "SANDBOX", "LIVE"];
const SOURCE = ["BLOCKED", "PENDING", "RUNNING", "SUCCEEDED", "FAILED", "EXPIRED", "UNCERTAIN"];
const VERIFY = ["NOT_STARTED", "PENDING", "SUCCEEDED", "FAILED", "PARTIAL", "UNCERTAIN", "DENIED", "EXPIRED"];
const SEVERITY = ["INFO", "WARNING", "ERROR", "CRITICAL"];
const TARGET_TYPE = ["ACCOUNT", "BROKER_BINDING", "DEPLOYMENT", "ORDER", "PORTFOLIO", "SYSTEM"];

interface FilterSpec {
  param: string;
  field: (row: Row) => unknown;
  allowed?: readonly string[];
}
const FILTERS: readonly FilterSpec[] = [
  { param: "triage_state", field: (r) => r.triage_state, allowed: TRIAGE },
  { param: "environment", field: (r) => r.environment, allowed: ENVIRONMENT },
  { param: "source_status", field: (r) => r.source_status, allowed: SOURCE },
  { param: "verification_result", field: (r) => r.verification_result, allowed: VERIFY },
  { param: "severity", field: (r) => r.severity, allowed: SEVERITY },
  { param: "target_type", field: (r) => (r.target as { type: string }).type, allowed: TARGET_TYPE },
  { param: "command_key", field: (r) => r.command_key },
  { param: "target_id", field: (r) => (r.target as { id: string }).id },
];
const KNOWN = new Set(["workspace_id", "after", "before", "limit", "sort", ...FILTERS.map((f) => f.param)]);

/** `...:00Z` and `...:00.000000Z` are the same instant and must sort as one. */
function instantKey(iso: string): string {
  const [whole, fraction = ""] = iso.replace(/Z$/, "").split(".");
  return `${whole}.${fraction.padEnd(6, "0")}`;
}
const sortKey = (row: Row) => `${instantKey(row.created_at)}|${row.operation_id}`;

/** Opaque, and bound to the filters and direction it was issued under. */
function encodeCursor(row: Row, signature: string): string {
  return Buffer.from(JSON.stringify({ k: sortKey(row), s: signature }), "utf8").toString("base64url");
}
function decodeCursor(raw: string): { k: string; s: string } | null {
  try {
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { k?: unknown; s?: unknown };
    return typeof value.k === "string" && typeof value.s === "string" ? { k: value.k, s: value.s } : null;
  } catch {
    return null;
  }
}

/**
 * SIMULATED (FIXTURE_LAB, opt-in): the server-side counts FE-043 publishes, counted by integer tallies over the same rows the
 * page was cut from. Each dimension ignores its own filter; every bucket of the closed domain is present (a true zero stays 0).
 */
function simulatedStatusCounts(all: readonly Row[], applied: readonly { field: string; value: string }[]): Record<string, unknown> {
  const dimension = (param: string, domain: readonly string[]) => {
    const others = applied.filter((a) => a.field !== param);
    const rows = all.filter((row) => others.every((a) => FILTERS.find((f) => f.param === a.field)!.field(row) === a.value));
    const counts: Record<string, number> = Object.fromEntries(domain.map((key) => [key, 0]));
    for (const row of rows) {
      const key = String(row[param]);
      if (key in counts) counts[key] += 1;
    }
    return { own_filter_applied: applied.some((a) => a.field === param), total: rows.length, counts };
  };
  return {
    basis: "SAME_SNAPSHOT_AUTHORIZED_SCOPE_AND_FILTERS_EXCLUDING_OWN_DIMENSION",
    succeeded_means: "PORTAL_QUEUE_RECORD_STATE_ONLY",
    dimensions: {
      triage_state: dimension("triage_state", TRIAGE),
      verification_result: dimension("verification_result", VERIFY),
      source_status: dimension("source_status", SOURCE),
      severity: dimension("severity", SEVERITY),
    },
  };
}

/**
 * SIMULATED (FIXTURE_LAB, opt-in, WP-B): the incidents the queue rows link to (FE-042) and the incident roots those links open.
 * The ids, targets, severities and states are the SAME in the link summary on a row and in the root the route answers, so the
 * two reads agree. Open exceptions are counted from these records (OPEN only), never from the loaded page.
 * Real source: the Portal incident records (`execution-operations.v1` OperationalIncidentCurrentV2 and OperationalIncidentLinksV2).
 */
/** The incidents and their links are the world's (e2e/bffWorld.ts, WP-B block): one record each, read by the root, the row links and the children. */
const SIM_INCIDENT_BY_ID = new Map(WORLD_INCIDENTS.map((incident) => [incident.id, incident]));
const WORLD_LINKS = new Map<string, { id: string; relationship: string; atMs: number }[]>();
for (const incident of WORLD_INCIDENTS) {
  for (const [opId, relationship, atMs] of incident.links) WORLD_LINKS.set(opId, [...(WORLD_LINKS.get(opId) ?? []), { id: incident.id, relationship, atMs }]);
}

const LINK_BOUND = 3;
const NOT_ATTESTED_HISTORY = { availability: "NOT_PUBLISHED", reason_code: "ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED" };

function simulatedIncidentLinks(row: Row): Record<string, unknown> {
  const linked = (WORLD_LINKS.get(row.operation_id) ?? []).flatMap(({ id, relationship, atMs }) => {
    const incident = SIM_INCIDENT_BY_ID.get(id);
    return incident === undefined ? [] : [{
      state: "LINKED", incident_id: id, relationship, linked_at: new Date(atMs).toISOString().replace(".000Z", ".000000Z"),
      incident: { target: { type: incident.target[0], id: incident.target[1] }, environment: environmentFor(incident.target[0], incident.target[1], incident.env), severity: incident.severity, workflow_state: incidentState(incident) },
      link_history: NOT_ATTESTED_HISTORY,
    }];
  });
  // Newest first, bounded (FE-042): the schema's own order and bound.
  const items = [...linked].sort((a, b) => (instantKey(a.linked_at) < instantKey(b.linked_at) ? 1 : -1)).slice(0, LINK_BOUND);
  return { basis: "CURRENT_LINK_ROWS_AUTHORIZED_INCIDENTS_ONLY", bound: LINK_BOUND, authorized_link_count: linked.length, truncated: linked.length > items.length, items };
}

/** The distinct OPEN incidents a set of rows links to: the simulated owning source's open-exception count. */
function openIncidentIds(rows: readonly Row[]): readonly string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    for (const { id } of WORLD_LINKS.get(row.operation_id) ?? []) { const incident = SIM_INCIDENT_BY_ID.get(id); if (incident !== undefined && incidentState(incident) === "OPEN") ids.add(id); }
  }
  return [...ids];
}

/**
 * SIMULATED (FIXTURE_LAB, opt-in, FE-CAT-2): the delivery and display axes of a row. The eleven named rows carry a fixed pair so every
 * badge of the design shows (awaiting a receipt, receipt failed, display catching up, stale, current, no display reported); a generated
 * row restates its own source status, with every fifth applied row still catching up (a rule of the row id's last two digits, not a clock).
 * A null display is "the source did not report it".
 */
const SIM_AXES: Readonly<Record<string, readonly [string, string | null]>> = {
  op_TEST_ONLY_s01: ["AWAITING_RECEIPT", "CATCHING_UP"],
  op_TEST_ONLY_s02: ["AWAITING_RECEIPT", "CATCHING_UP"],
  op_TEST_ONLY_s03: ["RECEIPT_CONFIRMED", "CURRENT"],
  op_TEST_ONLY_s04: ["AWAITING_RECEIPT", "CURRENT"],
  op_TEST_ONLY_s05: ["RECEIPT_FAILED", "STALE"],
  op_TEST_ONLY_s06: ["RECEIPT_CONFIRMED", "CATCHING_UP"],
  op_TEST_ONLY_s07: ["AWAITING_RECEIPT", null],
  op_TEST_ONLY_s08: ["RECEIPT_FAILED", "CURRENT"],
  op_TEST_ONLY_s09: ["NOT_APPLICABLE", null],
  op_TEST_ONLY_s10: ["RECEIPT_FAILED", "CURRENT"],
  op_TEST_ONLY_s11: ["RECEIPT_CONFIRMED", "CURRENT"],
};

function simulatedAxes(row: Row): { delivery_state: string; display_state: string | null } {
  const named = SIM_AXES[row.operation_id];
  if (named !== undefined) return { delivery_state: named[0], display_state: named[1] };
  const status = String(row.source_status);
  const delivery = status === "BLOCKED" ? "NOT_APPLICABLE"
    : status === "SUCCEEDED" ? "RECEIPT_CONFIRMED"
    : status === "FAILED" || status === "EXPIRED" ? "RECEIPT_FAILED"
    : "AWAITING_RECEIPT"; // PENDING, RUNNING, UNCERTAIN: no receipt yet
  if (status === "BLOCKED") return { delivery_state: delivery, display_state: null };
  const lastTwo = Number(row.operation_id.replace(/\D/g, "").slice(-2));
  return { delivery_state: delivery, display_state: status === "SUCCEEDED" && Number.isFinite(lastTwo) && lastTwo % 5 === 0 ? "CATCHING_UP" : "CURRENT" };
}

function simulatedRow(row: Row): Row {
  return { ...row, ...simulatedAxes(row), incident_links: simulatedIncidentLinks(row) };
}

function simulatedHealth(filtered: readonly Row[]): Record<string, unknown> {
  const at = OPERATIONS_V2_DOUBLE_NOW_ISO;
  const axes = filtered.map(simulatedAxes);
  return {
    basis: "SAME_SNAPSHOT_AUTHORIZED_SCOPE_AND_FILTERS",
    pending_receipt_count: { count: axes.filter((a) => a.delivery_state === "AWAITING_RECEIPT").length, observed_at: at, coverage: "COMPLETE" },
    // A counted ZERO that is a floor while any filtered row did not report its display (PARTIAL), exact once none is missing.
    display_lag_count: {
      count: axes.filter((a) => a.display_state === "CATCHING_UP").length, observed_at: at,
      coverage: axes.some((a) => a.display_state === null) ? "PARTIAL" : "COMPLETE",
    },
    // WP-B: the exception source is simulated from the OPEN incidents the filtered rows link to (a true zero stays 0).
    open_exception_count: { count: openIncidentIds(filtered).length, observed_at: at, coverage: "COMPLETE" },
  };
}

function queue(search: URLSearchParams, simulate = false): BffAnswerV2 {
  if (search.has("assigned_to")) {
    return problem(400, "OPERATIONAL_READ_FILTER_NOT_SUPPORTED", "assigned_to is not supported by the current operational queue.");
  }
  for (const key of search.keys()) {
    if (!KNOWN.has(key)) return problem(400, "OPERATIONAL_READ_INPUT_INVALID", `Unknown query parameter ${key}.`);
  }
  const applied: { field: string; op: "eq"; value: string }[] = [];
  const all = allRows(simulate);
  let rows = all;
  for (const spec of FILTERS) {
    const value = search.get(spec.param);
    if (value === null) continue;
    if (spec.allowed && !spec.allowed.includes(value)) return problem(400, "OPERATIONAL_READ_INPUT_INVALID", `${spec.param} is not a valid value.`);
    applied.push({ field: spec.param, op: "eq", value });
    rows = rows.filter((row) => spec.field(row) === value);
  }
  const sort = search.get("sort") ?? "created_at:desc";
  if (sort !== "created_at:desc" && sort !== "created_at:asc") return problem(400, "OPERATIONAL_READ_INPUT_INVALID", "sort is not a valid value.");
  const direction = sort === "created_at:asc" ? "asc" : "desc";
  const limitText = search.get("limit");
  const limit = limitText === null ? 50 : Number(limitText);
  if (!Number.isInteger(limit) || limit < 1 || limit > 250) return problem(400, "OPERATIONAL_READ_INPUT_INVALID", "limit must be 1 to 250.");
  if (search.has("after") && search.has("before")) return problem(400, "OPERATIONAL_READ_INPUT_INVALID", "after and before are exclusive.");

  const ordered = [...rows].sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1) * (direction === "asc" ? 1 : -1));
  const signature = JSON.stringify([applied, direction]);

  let start = 0;
  let end = Math.min(limit, ordered.length);
  const cursorText = search.get("after") ?? search.get("before");
  if (cursorText !== null) {
    const cursor = decodeCursor(cursorText);
    if (cursor === null) return problem(400, "OPERATIONAL_READ_CURSOR_INVALID", "The cursor could not be read.");
    if (cursor.s !== signature) return problem(409, "OPERATIONAL_READ_CHANGED", "The read changed; start from the first page.");
    // Position strictly after (or before) the cursor row in the requested order.
    const beyond = (row: Row) => (direction === "desc" ? sortKey(row) < cursor.k : sortKey(row) > cursor.k);
    if (search.has("after")) {
      start = Math.max(0, ordered.findIndex(beyond));
      if (!ordered.some(beyond)) start = ordered.length;
      end = Math.min(ordered.length, start + limit);
    } else {
      const before = ordered.filter((row) => !beyond(row) && sortKey(row) !== cursor.k);
      end = before.length;
      start = Math.max(0, end - limit);
    }
  }
  const page = ordered.slice(start, end);
  const body = {
    ...FIXTURE.queue,
    observed_at_ms: Date.parse(OPERATIONS_V2_DOUBLE_NOW_ISO),
    read_truth: { state: ordered.length === 0 ? "EMPTY" : "AVAILABLE", reason_code: null, scope: "REQUEST" },
    page: {
      rows: simulate ? page.map(simulatedRow) : page,
      total_count: all.length,
      filtered_count: ordered.length,
      next_cursor: end < ordered.length && page.length > 0 ? encodeCursor(page[page.length - 1], signature) : null,
      prev_cursor: start > 0 && page.length > 0 ? encodeCursor(page[0], signature) : null,
      has_more: end < ordered.length && page.length > 0,
      has_previous: start > 0 && page.length > 0,
      applied_filters: applied,
      applied_sort: [
        { field: "created_at", direction },
        { field: "operation_id", direction },
      ],
      ...(simulate ? { status_counts: simulatedStatusCounts(all, applied), health: simulatedHealth(ordered) } : {}),
    },
  };
  return { status: 200, body };
}

/** The ids besides the simulated five that the lane's roots exist for: the canonical fixture's and the two lifecycle ids the specs use. */
const KNOWN_INCIDENT_IDS: ReadonlySet<string> = new Set([String(FIXTURE.incident.incident_id), "inc_TEST_ONLY_mitigated", "inc_TEST_ONLY_resolved"]);

function incident(id: string, simulate = false): BffAnswerV2 {
  if (id === "inc_NOT_FOUND") return problem(404, "OPERATIONAL_READ_NOT_FOUND", "The incident was not found.");
  if (id === "inc_LEGACY_SHAPE") {
    return { status: 200, body: { schema_version: "execution.incident-detail.v1", incident: { incident_id: id, state: "OPEN" } } };
  }
  const root = { ...FIXTURE.incident, incident_id: id, observed_at_ms: Date.parse(OPERATIONS_V2_DOUBLE_NOW_ISO) } as Record<string, unknown>;
  const sim = simulate ? SIM_INCIDENT_BY_ID.get(id) : undefined;
  // The lane knows the incidents it serves: any other id is "not found", as the server answers (a lane that rendered an incident for any
  // id read as if every typed id existed, and the command bar offered it). Off keeps the one body every id got, for the specs written on it.
  if (simulate && sim === undefined && !KNOWN_INCIDENT_IDS.has(id)) return problem(404, "OPERATIONAL_READ_NOT_FOUND", "The incident was not found.");
  if (sim !== undefined) {
    return { status: 200, body: {
      ...root, target: { type: sim.target[0], id: sim.target[1] }, environment: environmentFor(sim.target[0], sim.target[1], sim.env), severity: sim.severity, workflow_state: incidentState(sim),
      workflow_version: incidentVersion(sim), ...incidentRootTimes(sim),
    } };
  }
  if (id === "inc_TEST_ONLY_mitigated") {
    return { status: 200, body: { ...root, workflow_state: "MITIGATED", workflow_version: 3, acknowledged_at: "2026-08-22T12:10:00Z", mitigated_at: "2026-08-22T12:30:00.654321Z", updated_at: "2026-08-22T12:30:00.654321Z" } };
  }
  if (id === "inc_TEST_ONLY_resolved") {
    return { status: 200, body: { ...root, workflow_state: "RESOLVED", workflow_version: 4, acknowledged_at: "2026-08-22T12:10:00Z", mitigated_at: "2026-08-22T12:30:00Z", resolved_at: "2026-08-22T12:45:00Z", updated_at: "2026-08-22T12:45:00Z" } };
  }
  return { status: 200, body: root };
}

/**
 * `path` is the request path with `/api/v1/execution` removed. Answers `null`
 * for anything that is not a V2 operations read, so the caller falls through.
 */
export function answerOperationsV2(method: string, path: string, search: URLSearchParams, simulate = false): BffAnswerV2 | null {
  if (method !== "GET") return null;
  if (path === "/operations") return queue(search, simulate);
  const seg = path.split("/").filter(Boolean);
  if (seg[0] === "operations" && seg[1] === "incidents" && seg.length === 3) return incident(decodeURIComponent(seg[2]), simulate);
  // One operation by its id (`GET /operations/{id}`, the command operation record): the lane answers for every operation of its own list, so a
  // deep link to an operation that is not on the loaded queue page opens it; an `op_` id the list does not hold is "not found", not a made-up record.
  if (simulate && seg[0] === "operations" && seg.length === 2 && /^op_/.test(seg[1]!) && seg[1] !== "audit") {
    const id = decodeURIComponent(seg[1]!);
    const row = allRows(true).find((r) => r.operation_id === id);
    if (row === undefined) return problem(404, "OPERATIONAL_READ_NOT_FOUND", "The operation was not found.");
    const status = String(row.source_status);
    const raw = JSON.parse(readFileSync(join(CONTRACTS, "execution-command-operation.valid.json"), "utf8")) as Record<string, unknown>;
    return { status: 200, body: { ...raw, operation_id: id, command_key: row.command_key, status: status === "SUCCEEDED" || status === "EXPIRED" || status === "BLOCKED" ? status : status === "FAILED" ? "FAILED" : "PENDING",
      verification_result: row.verification_result, blockers: status === "BLOCKED" ? ["COMMAND_RELAY_DISABLED"] : [], created_at: row.created_at, updated_at: row.updated_at } };
  }
  return null;
}
