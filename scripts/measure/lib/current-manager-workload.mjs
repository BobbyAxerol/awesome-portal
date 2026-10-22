/** CORE-07 preparation ONLY. No requests, credentials, files, grants or timers.
 * Compile explicit current reads from pinned published OpenAPI bytes; never
 * rewrite the fixture-derived read-sets.v1.json or treat a GET stream as a poll.
 * The output is not an execution authorization. M5/M7 still require their
 * existing owner-window/repin guards and separately accepted target/budget.
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { buildSchedule, offeredPeak } from "./replay.mjs";

// Reuse the repository's pinned schema toolchain, not a new dependency or a
// partial handwritten approximation of JSON Schema (if/then, contains, etc.).
const require = createRequire(new URL("../../../packages/contracts/package.json", import.meta.url));
const Ajv = require("ajv/dist/2020.js").default;
const addFormats = require("ajv-formats");
const ajv = new Ajv({ strict: false, allErrors: false, validateFormats: true });
addFormats(ajv);

export const CURRENT_MANAGER_WORKLOAD_SCHEMA = "portal.elp2-10.current-manager-workload-preparation.v1";
export const CURRENT_MANAGER_GROUPS = Object.freeze([
  "overview", "fleet", "portfolios", "portfolio-360", "alpha-360", "account-360",
  "blotter", "operations", "workbench-fills", "admin", "accounts",
]);
const ALLOWED_CONTRACTS = new Set([
  "execution-access", "execution-manager-models", "execution-manager-series", "execution-manager-lists",
  "execution-financial-chart", "execution-history", "execution-operations", "execution-paper-read",
  "execution-resource-scoped", "execution-scoped-records", "execution-alpha-fleet-realtime",
  "execution-publication-catalogue",
].map(n => `packages/contracts/openapi/${n}.openapi.json`));
const FIXTURE = /test[_-]?only|fixture|e2e[-_:]|alpha_btc_trend|acc_bnc_core|acc_okx_main|acc_pap_sim|dep_(?:paper|sandbox|canary|live)_\d+|workspace_execution_manager/i;
const HASH = /^sha256:[a-f0-9]{64}$/;
const internals = new WeakMap();
const fail = code => { throw Object.assign(new Error(`CURRENT_MANAGER_WORKLOAD_REFUSED:${code}`), { code }); };
const object = v => v !== null && typeof v === "object" && !Array.isArray(v);
const digest = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const canonical = v => Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : object(v)
  ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}` : JSON.stringify(v);
const text = v => typeof v === "string" && v.length > 0 && v.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(v);
const positive = v => Number.isSafeInteger(v) && v > 0;
const pin = v => object(v) && text(v.ref) && HASH.test(v.sha256);
const keys = (o, allowed, code) => {
  if (!object(o) || Object.keys(o).some(k => !allowed.includes(k))) fail(code);
};
function resolve(doc, value) {
  if (!value?.$ref) return value;
  if (!value.$ref.startsWith("#/")) fail("EXTERNAL_PARAMETER_REF_UNSUPPORTED");
  const resolved = value.$ref.slice(2).split("/").reduce((p, k) => p?.[k.replaceAll("~1", "/").replaceAll("~0", "~")], doc);
  if (!resolved || resolved.$ref) fail("PARAMETER_REF_UNRESOLVED");
  return resolved;
}

/** @param {Array<{file:string,bytes:Uint8Array,sha256:string}>} sources
 * Every supplied file is hash checked from the SAME bytes that are parsed.
 * Returned inventory retains request schemas and response schema locators;
 * it proves source structure, not mounted routes or financial source readiness.
 */
export function createCurrentManagerInventory(sources) {
  if (!Array.isArray(sources) || !sources.length || sources.length > ALLOWED_CONTRACTS.size) fail("CONTRACTS_REQUIRED");
  const files = new Set(), ids = new Set(), operations = [], contracts = [], validators = new Map();
  for (const source of sources) {
    if (!ALLOWED_CONTRACTS.has(source.file) || files.has(source.file)) fail("CONTRACT_FILE_INVALID_OR_DUPLICATE");
    files.add(source.file);
    if (!(source.bytes instanceof Uint8Array) || source.bytes.length < 1 || source.bytes.length > 4 * 1048576 ||
      digest(source.bytes) !== source.sha256) fail("CONTRACT_BYTES_PIN_MISMATCH");
    let doc;
    try { doc = JSON.parse(Buffer.from(source.bytes).toString("utf8")); } catch { fail("CONTRACT_JSON_INVALID"); }
    if (!String(doc.openapi).startsWith("3.") || !object(doc.paths)) fail("OPENAPI_REQUIRED");
    contracts.push({ file: source.file, sha256: source.sha256 });
    for (const [path, pathItem] of Object.entries(doc.paths)) {
      const op = pathItem.get;
      if (!op) continue;
      if (!path.startsWith("/api/") || !text(op.operationId) || ids.has(op.operationId)) fail("ROUTE_OR_OPERATION_INVALID");
      ids.add(op.operationId);
      const content = op.responses?.["200"]?.content ?? {};
      const finite = !/\/stream(?:\/|$)/.test(path) && !content["text/event-stream"] && !!content["application/json"];
      const params = new Map();
      for (const raw of [...(pathItem.parameters ?? []), ...(op.parameters ?? [])]) {
        const p = resolve(doc, raw);
        if (!finite) continue; // SSE remains inventoried, never parameterized.
        if (!["path", "query"].includes(p.in)) fail("HEADER_OR_COOKIE_PARAMETER_NOT_SUPPORTED");
        const json = p.content?.["application/json"]?.schema;
        const schema = json ?? p.schema;
        if (!schema || !text(p.name)) fail("PARAMETER_SCHEMA_MISSING");
        let validator;
        try { validator = ajv.compile({ ...schema, components: doc.components ?? {} }); }
        catch { fail("PARAMETER_SCHEMA_UNSUPPORTED"); }
        validators.set(`${op.operationId}:${p.in}:${p.name}`, validator);
        params.set(`${p.in}:${p.name}`, { name: p.name, in: p.in, required: p.required === true,
          encoding: json ? "JSON" : "FORM", style: p.style ?? (p.in === "query" ? "form" : "simple"),
          explode: p.explode ?? (p.in === "query"), schema });
      }
      operations.push({ operation_id: op.operationId, method: "GET", route_template: path,
        contract_file: source.file, contract_sha256: source.sha256,
        finite, refusal: finite ? null : "NOT_A_FINITE_JSON_READ", parameters: [...params.values()],
        response_schema: content["application/json"]?.schema ?? null });
    }
  }
  const inventory = { schema_version: "portal.elp2-10.current-manager-read-inventory.v1", contracts,
    operations: operations.sort((a, b) => a.operation_id.localeCompare(b.operation_id)) };
  internals.set(inventory, { validators, fingerprint: digest(canonical(inventory)) });
  return inventory;
}

function assertInventory(inventory) {
  const internal = internals.get(inventory);
  if (!internal || internal.fingerprint !== digest(canonical(inventory))) fail("INVENTORY_CHANGED_OR_NOT_COMPILED");
  return internal;
}
function assertContext(context) {
  keys(context, ["workspace_id", "environment", "profile_id", "resource_ids", "window"], "CONTEXT_SHAPE");
  if (!text(context.workspace_id) || !text(context.profile_id) || !["paper", "sandbox", "live"].includes(context.environment) ||
    FIXTURE.test(context.workspace_id) || FIXTURE.test(context.profile_id)) fail("EXPLICIT_NON_FIXTURE_CONTEXT_REQUIRED");
  const prefix = { paper: "PAPER_", sandbox: "SANDBOX_", live: "LIVE_" }[context.environment];
  if (!context.profile_id.startsWith(prefix)) fail("PROFILE_ENVIRONMENT_MISMATCH");
  if (!Array.isArray(context.resource_ids) || context.resource_ids.some(v => !text(v) || FIXTURE.test(v)) ||
    new Set(context.resource_ids).size !== context.resource_ids.length) fail("RESOURCE_IDS_REQUIRED_OR_DUPLICATE");
  keys(context.window, ["from_ms", "to_ms"], "EXPLICIT_WINDOW_REQUIRED");
  if (!Number.isSafeInteger(context.window.from_ms) || context.window.from_ms < 0 ||
    !Number.isSafeInteger(context.window.to_ms) || context.window.to_ms <= context.window.from_ms) fail("WINDOW_INVALID");
}
function resourceValues(value, name, context) {
  if (Array.isArray(value)) { for (const v of value) resourceValues(v, name, context); return; }
  if (object(value)) { for (const [k, v] of Object.entries(value)) resourceValues(v, k, context); return; }
  if (typeof value === "string" && FIXTURE.test(value)) fail("FIXTURE_VALUE_FORBIDDEN");
  if ((name === "id" || name === "resource_id" || name === "subject_id" || /^(?:portfolio|alpha|account|deployment|binding|strategy|subject_user)_?id$/i.test(name)) &&
    !context.resource_ids.includes(value)) fail("RESOURCE_ID_NOT_IN_EXPLICIT_POPULATION");
}
function requestLine(inventory, context, request) {
  keys(request, ["operation_id", "path", "query"], "REQUEST_SHAPE");
  const op = inventory.operations.find(o => o.operation_id === request.operation_id);
  if (!op || !op.finite) fail("OPERATION_NOT_A_CURRENT_FINITE_GET");
  const internal = assertInventory(inventory), pathValues = { ...(request.path ?? {}) }, query = { ...(request.query ?? {}) };
  for (const [where, values] of [["path", pathValues], ["query", query]]) {
    for (const k of Object.keys(values)) if (!op.parameters.some(p => p.in === where && p.name === k)) fail("UNKNOWN_REQUEST_PARAMETER");
  }
  for (const p of op.parameters) {
    const values = p.in === "path" ? pathValues : query;
    const environmentValue = p.schema.enum?.includes(context.environment.toUpperCase()) &&
      !p.schema.enum.includes(context.environment) ? context.environment.toUpperCase() : context.environment;
    const expected = p.name === "workspace_id" ? context.workspace_id : p.name === "environment" ? environmentValue :
      p.name === "profile_id" ? context.profile_id : p.name === "window" ? context.window : undefined;
    if (expected !== undefined) {
      if (values[p.name] !== undefined && canonical(values[p.name]) !== canonical(expected)) fail("REQUEST_CONTEXT_MISMATCH");
      values[p.name] = expected;
    }
    const v = values[p.name];
    if (v === undefined) { if (p.required) fail("REQUIRED_PARAMETER_MISSING"); continue; }
    if (!internal.validators.get(`${op.operation_id}:${p.in}:${p.name}`)(v)) fail("REQUEST_PARAMETER_SCHEMA_INVALID");
    resourceValues(v, p.name, context);
  }
  if (query.economic_partition !== undefined && query.economic_partition.economic_domain !==
    { paper: "PAPER", sandbox: "SANDBOX", live: "ACTUAL" }[context.environment]) fail("ECONOMIC_PARTITION_ENVIRONMENT_MISMATCH");
  // Explicit absolute bounds for the source history/chart contracts, not stale
  // fixture timestamps or server-relative window defaults.
  for (const [from, to, milliseconds] of [["from_ms", "to_ms", true], ["from", "to", false]]) {
    if (op.parameters.some(p => p.in === "query" && p.name === from)) {
      const a = milliseconds ? context.window.from_ms : new Date(context.window.from_ms).toISOString();
      const b = milliseconds ? context.window.to_ms : new Date(context.window.to_ms).toISOString();
      if (query[from] !== a || query[to] !== b) fail("EXPLICIT_BOUND_WINDOW_MISMATCH");
    }
  }
  let path = op.route_template;
  for (const p of op.parameters.filter(p => p.in === "path")) {
    const v = pathValues[p.name];
    if (typeof v !== "string" || !text(v) || v === "." || v === ".." || /[\/\\?#]/.test(v)) fail("PATH_PARAMETER_UNSAFE");
    path = path.replaceAll(`{${p.name}}`, encodeURIComponent(v));
  }
  if (/[{}]/.test(path)) fail("PATH_PARAMETER_MISSING");
  const qs = new URLSearchParams();
  for (const p of op.parameters.filter(p => p.in === "query")) {
    const v = query[p.name];
    if (v === undefined) continue;
    if (p.encoding === "JSON") qs.append(p.name, JSON.stringify(v));
    else if (Array.isArray(v)) {
      if (p.style !== "form" || v.some(object)) fail("QUERY_SERIALIZATION_UNSUPPORTED");
      if (p.explode) for (const item of v) qs.append(p.name, String(item));
      else qs.append(p.name, v.map(String).join(","));
    } else if (object(v)) fail("QUERY_OBJECT_REQUIRES_PUBLISHED_JSON_ENCODING");
    else qs.append(p.name, String(v));
  }
  return { line: `GET ${path}${qs.size ? `?${qs}` : ""}`, operation: op };
}

/** All groups must be supplied, none silently removed to meet a budget.
 * Cadences and seed are explicit proposals, never approved production defaults.
 */
export function buildCurrentManagerWorkload({ inventory, context, groups, cadence_ms, seed }) {
  assertInventory(inventory); assertContext(context);
  keys(groups, CURRENT_MANAGER_GROUPS, "GROUPS_INVALID");
  keys(cadence_ms, ["overview", "visits"], "CADENCE_REQUIRED");
  if (!positive(seed) || !positive(cadence_ms.overview) || !positive(cadence_ms.visits) ||
    cadence_ms.overview < 1000 || cadence_ms.visits < 1000) fail("EXPLICIT_SEED_AND_CADENCE_REQUIRED");
  const sets = {}, requests = [];
  for (const name of CURRENT_MANAGER_GROUPS) {
    if (!Array.isArray(groups[name]) || !groups[name].length) fail("READ_GROUP_MISSING_OR_EMPTY");
    sets[name] = groups[name].map(request => {
      const compiled = requestLine(inventory, context, request);
      requests.push({ group: name, operation_id: compiled.operation.operation_id,
        contract_file: compiled.operation.contract_file, contract_sha256: compiled.operation.contract_sha256,
        route_template: compiled.operation.route_template, response_schema: compiled.operation.response_schema,
        line_sha256: digest(compiled.line) });
      return compiled.line;
    });
  }
  const workload = { schema_version: "portal.elp2-10.read-workload.v1", revision: "current-manager-preparation-v1",
    status: "PREPARED_NOT_APPROVED", preparation_schema: CURRENT_MANAGER_WORKLOAD_SCHEMA,
    execution_authorized: false, calibration_evidence: false,
    note: "Explicit periodic GET measurement proposal, not a claim that current UI polls; no SSE replay or source qualification.",
    seed, sets, stages: { B1: [{ set: "overview", tabs: 8, cadence_ms: cadence_ms.overview }],
      B2: [{ set: "overview", tabs: 8, cadence_ms: cadence_ms.overview },
        ...CURRENT_MANAGER_GROUPS.slice(1).map(set => ({ set, tabs: 2, cadence_ms: cadence_ms.visits }))] },
    context: structuredClone(context), contract_pins: structuredClone(inventory.contracts), requests };
  workload.digest_input = digest(canonical(workload));
  return workload;
}

/** PURE preflight, not an execution or approval verifier. Target/budget pins
 * must be supplied by the owner; this function cannot grant authority merely
 * because a caller marks its object approved. Existing loadWindow/repin guards
 * remain required at the executor. No headers/token/file paths are accepted.
 */
export function preflightCurrentManagerWorkload({ workload, inventory, target, budget, window, measurement, stage, duration_ms, now_ms }) {
  assertInventory(inventory);
  const { digest_input, ...body } = workload ?? {};
  if (digest_input !== digest(canonical(body)) || workload.execution_authorized !== false ||
    workload.preparation_schema !== CURRENT_MANAGER_WORKLOAD_SCHEMA) fail("WORKLOAD_CHANGED_OR_WRONG_SCHEMA");
  assertContext(workload.context);
  if (canonical(workload.contract_pins) !== canonical(inventory.contracts)) fail("CONTRACT_INVENTORY_MISMATCH");
  if (!pin(target) || target.status !== "OWNER_APPROVED" || !/^[a-f0-9]{40}$/.test(target.source_sha) ||
    !HASH.test(target.image_digest) || !HASH.test(target.config_sha256) || !HASH.test(target.schema_sha256)) fail("APPROVED_TARGET_PINS_REQUIRED");
  if (!pin(budget) || budget.status !== "OWNER_APPROVED" || !Array.isArray(budget.numeric_group_pins) ||
    budget.numeric_group_pins.length !== 14 || budget.numeric_group_pins.some(p => !pin(p) || !text(p.group)) ||
    new Set(budget.numeric_group_pins.map(p => p.group)).size !== 14) fail("APPROVED_14_GROUP_BUDGET_PINS_REQUIRED");
  if (target.workload_sha256 !== digest_input || budget.workload_sha256 !== digest_input ||
    canonical(target.context) !== canonical(workload.context)) fail("APPROVAL_WORKLOAD_OR_POPULATION_MISMATCH");
  let origin;
  try { origin = new URL(target.origin); } catch { fail("TARGET_ORIGIN_INVALID"); }
  if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password) fail("TARGET_ORIGIN_INVALID");
  if (!window || !HASH.test(window.authorisation_sha256) || window.origin !== origin.origin ||
    !["REAL_READ_RETAINED", "REAL_READ_QUALIFIED"].includes(window.lane) || window.run_kind !== "ABSOLUTE_MEASUREMENT" ||
    !["M-5", "M-7"].includes(measurement) || !window.measurements?.includes(measurement) || !text(window.window_id) ||
    !text(window.granted_by) || !text(window.stop_rollback)) fail("MATCHED_OWNER_WINDOW_REQUIRED");
  if (!["B1", "B2"].includes(stage) || !positive(duration_ms) || !Number.isSafeInteger(now_ms)) fail("PREFLIGHT_STAGE_OR_CLOCK_INVALID");
  if (!positive(window.granted_at_ms) || window.granted_at_ms > now_ms || !positive(window.starts_at_ms) ||
    !positive(window.ends_at_ms) || now_ms < window.starts_at_ms ||
    now_ms + duration_ms > window.ends_at_ms - 5000 || !positive(window.max_duration_ms) || duration_ms > window.max_duration_ms) fail("WINDOW_TIME_OR_DURATION_INVALID");
  const tabs = workload.stages[stage].reduce((n, e) => n + e.tabs, 0);
  if (tabs !== (stage === "B1" ? 8 : 28) || !positive(window.max_tabs) || tabs > window.max_tabs) fail("TAB_POPULATION_EXCEEDS_WINDOW");
  // Avoid constructing an unbounded schedule from an approved-but-malformed
  // duration: the existing executor must not be used as an allocation oracle.
  const events = workload.stages[stage].reduce((n, e) => n + e.tabs * Math.ceil(duration_ms / e.cadence_ms), 0);
  if (events > 100000) fail("PREFLIGHT_SCHEDULE_TOO_LARGE");
  const peak = offeredPeak(buildSchedule(workload, stage, duration_ms, workload.seed), workload);
  if (!Number.isFinite(window.max_rps) || window.max_rps <= 0 || peak > window.max_rps) fail("OFFERED_PEAK_EXCEEDS_WINDOW");
  return { status: "PREFLIGHT_VALIDATED_NOT_EXECUTED", measurement, stage, total_tabs: tabs, offered_peak_rps: peak,
    workload_sha256: digest_input, target_sha256: target.sha256, budget_sha256: budget.sha256,
    window_id: window.window_id, authority_verified: false, execution_authorized: false, calibration_evidence: false,
    remaining_executor_gates: ["EXISTING_WINDOW_AND_REPIN_VALIDATION", "OWNER_TARGET_AND_NUMERIC_ARTIFACT_ACCEPTANCE",
      "CURRENT_ROUTE_SOURCE_AND_RESOURCE_QUALIFICATION", "QUIET_SLOT_AND_STOP_RESTORE_CHECK"] };
}
