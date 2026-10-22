/** SOURCE_ONLY/TEST_ONLY vectors. No mounted route, budget approval or load run. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CURRENT_MANAGER_GROUPS, buildCurrentManagerWorkload, createCurrentManagerInventory,
  preflightCurrentManagerWorkload } from "../lib/current-manager-workload.mjs";

const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const H = c => `sha256:${c.repeat(64)}`;
const files = ["execution-manager-models", "execution-manager-series", "execution-manager-lists", "execution-financial-chart",
  "execution-history", "execution-access", "execution-paper-read", "execution-operations", "execution-alpha-fleet-realtime"];
const sources = files.map(name => {
  const file = `packages/contracts/openapi/${name}.openapi.json`;
  const bytes = readFileSync(new URL(`../../../${file}`, import.meta.url));
  return { file, bytes, sha256: hash(bytes) };
});
const inventory = createCurrentManagerInventory(sources);
const context = { workspace_id: "ws_measurement", environment: "paper", profile_id: "PAPER_BINANCE_USDM",
  resource_ids: ["pf_measurement", "alpha_measurement", "acc_measurement", "dep_measurement"],
  window: { from_ms: Date.UTC(2026, 9, 1), to_ms: Date.UTC(2026, 9, 20) } };
const request = (operation_id, path = {}, query = {}) => ({ operation_id, path, query });
const defaultGroups = () => ({
  overview: [request("executionManagerFundOverviewGetV1")],
  fleet: [request("executionManagerFleetGetV1", {}, { limit: 50, stage_filter: ["PAPER"], group_by: ["portfolio_id"] })],
  portfolios: [request("listPortfolios", {}, { limit: 50 })],
  "portfolio-360": [request("executionManagerPortfolio360GetV1", { id: "pf_measurement" })],
  "alpha-360": [request("executionManagerAlpha360GetV1", { id: "alpha_measurement" })],
  "account-360": [request("executionManagerAccount360GetV1", { id: "acc_measurement" })],
  blotter: [request("executionFullBlotterV1", {}, { limit: 50, stage: "PAPER" })],
  operations: [request("listExecutionOperationsQueue", {}, { limit: 50 })],
  "workbench-fills": [request("executionPaperWorkbenchV1", { deployment_id: "dep_measurement" })],
  admin: [request("portalScopedAccessSelfNavigationGetV1")],
  accounts: [request("listBrokerBindings", {}, { limit: 50 })],
});
const build = (patch = {}) => buildCurrentManagerWorkload({ inventory, context, groups: defaultGroups(),
  cadence_ms: { overview: 15000, visits: 30000 }, seed: 20261022, ...patch });
const refuses = (fn, code) => assert.throws(fn, e => e.code === code, code);

test("actual pinned published GET inventory retains schema/response locators and refuses SSE", () => {
  assert.ok(inventory.operations.length >= 30);
  const entry = inventory.operations.find(x => x.operation_id === "executionManagerFundOverviewGetV1");
  assert.equal(entry.route_template, "/api/v1/execution/manager/fund-overview");
  assert.equal(entry.response_schema.$ref, "#/components/schemas/ManagerDataset");
  assert.ok(entry.parameters.some(p => p.name === "window" && p.encoding === "JSON"));
  const stream = inventory.operations.find(x => x.operation_id === "executionAlphaFleetRealtimeStreamGetV1");
  assert.equal(stream.finite, false); assert.equal(stream.refusal, "NOT_A_FINITE_JSON_READ");
  refuses(() => build({ groups: { ...defaultGroups(), fleet: [request(stream.operation_id)] } }), "OPERATION_NOT_A_CURRENT_FINITE_GET");
});

test("same bytes are pinned/parsed; unknown file or modified digest cannot compile", () => {
  refuses(() => createCurrentManagerInventory([{ ...sources[0], bytes: Buffer.from("{}") }]), "CONTRACT_BYTES_PIN_MISMATCH");
  refuses(() => createCurrentManagerInventory([{ ...sources[0], file: "https://example.org/api" }]), "CONTRACT_FILE_INVALID_OR_DUPLICATE");
  refuses(() => createCurrentManagerInventory([sources[0], sources[0]]), "CONTRACT_FILE_INVALID_OR_DUPLICATE");
});

test("current finite reads carry explicit context/window and preserve B1=8/B2=28 without network", () => {
  const old = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("TEST_ONLY_NETWORK_FORBIDDEN"); };
  try {
    const w = build();
    assert.equal(w.execution_authorized, false); assert.equal(w.calibration_evidence, false);
    assert.equal(w.status, "PREPARED_NOT_APPROVED");
    assert.equal(w.stages.B1.reduce((n, e) => n + e.tabs, 0), 8);
    assert.equal(w.stages.B2.reduce((n, e) => n + e.tabs, 0), 28);
    assert.equal(Object.keys(w.sets).length, CURRENT_MANAGER_GROUPS.length);
    const overview = new URL(w.sets.overview[0].slice(4), "https://measurement.invalid");
    assert.equal(overview.searchParams.get("workspace_id"), context.workspace_id);
    assert.equal(overview.searchParams.get("environment"), "paper");
    assert.deepEqual(JSON.parse(overview.searchParams.get("window")), context.window);
    const queue = new URL(w.sets.operations[0].slice(4), "https://measurement.invalid");
    assert.equal(queue.searchParams.get("environment"), "PAPER"); // published operation enum, not global lowercasing
    assert.ok(Object.values(w.sets).flat().every(line => line.startsWith("GET /api/") && !line.includes("/stream")));
    assert.equal(w.digest_input, build().digest_input);
    assert.deepEqual(context.resource_ids, ["pf_measurement", "alpha_measurement", "acc_measurement", "dep_measurement"]);
  } finally { globalThis.fetch = old; }
});

test("missing group cannot shrink tab population; cadences and profile are explicit", () => {
  const groups = defaultGroups(); delete groups.accounts;
  refuses(() => build({ groups }), "READ_GROUP_MISSING_OR_EMPTY");
  refuses(() => build({ cadence_ms: {} }), "EXPLICIT_SEED_AND_CADENCE_REQUIRED");
  refuses(() => build({ context: { ...context, profile_id: "LIVE_BINANCE_USDM" } }), "PROFILE_ENVIRONMENT_MISMATCH");
  refuses(() => build({ context: { ...context, window: undefined } }), "EXPLICIT_WINDOW_REQUIRED");
});

test("fixture IDs, unknown operation/parameters, wrong workspace, unaccepted resources fail closed", () => {
  refuses(() => build({ context: { ...context, workspace_id: "ws_TEST_ONLY_shared" } }), "EXPLICIT_NON_FIXTURE_CONTEXT_REQUIRED");
  refuses(() => build({ groups: { ...defaultGroups(), overview: [request("notPublished")] } }), "OPERATION_NOT_A_CURRENT_FINITE_GET");
  refuses(() => build({ groups: { ...defaultGroups(), fleet: [request("executionManagerFleetGetV1", {}, { private_token: "never-printed" })] } }), "UNKNOWN_REQUEST_PARAMETER");
  refuses(() => build({ groups: { ...defaultGroups(), fleet: [request("executionManagerFleetGetV1", {}, { workspace_id: "ws_other" })] } }), "REQUEST_CONTEXT_MISMATCH");
  refuses(() => build({ groups: { ...defaultGroups(), "alpha-360": [request("executionManagerAlpha360GetV1", { id: "alpha_other" })] } }), "RESOURCE_ID_NOT_IN_EXPLICIT_POPULATION");
  refuses(() => build({ groups: { ...defaultGroups(), fleet: [request("executionManagerFleetGetV1", {}, { q: "alpha_btc_trend" })] } }), "FIXTURE_VALUE_FORBIDDEN");
});

test("published schemas validate enums/number bounds; array form encoding is not guessed", () => {
  refuses(() => build({ groups: { ...defaultGroups(), fleet: [request("executionManagerFleetGetV1", {}, { limit: 201 })] } }), "REQUEST_PARAMETER_SCHEMA_INVALID");
  refuses(() => build({ groups: { ...defaultGroups(), fleet: [request("executionManagerFleetGetV1", {}, { stage_filter: ["NO_STAGE"] })] } }), "REQUEST_PARAMETER_SCHEMA_INVALID");
  const url = new URL(build().sets.fleet[0].slice(4), "https://measurement.invalid");
  assert.deepEqual(url.searchParams.getAll("stage_filter"), ["PAPER"]);
  assert.equal(url.searchParams.get("group_by"), "portfolio_id");
});

test("history/chart require exact absolute approved-population window; no stale fixture timestamps", () => {
  const history = request("executionRetainedHistoryGet", { environment: "paper", relationKey: "manager.performance:account_equity_snapshots" },
    { from: new Date(context.window.from_ms).toISOString(), to: new Date(context.window.to_ms).toISOString(), limit: 100 });
  const w = build({ groups: { ...defaultGroups(), "workbench-fills": [history] } });
  assert.match(w.sets["workbench-fills"][0], /history\/paper\/manager.performance%3Aaccount_equity_snapshots/);
  history.query.from = "2020-01-01T00:00:00.000Z";
  refuses(() => build({ groups: { ...defaultGroups(), "workbench-fills": [history] } }), "EXPLICIT_BOUND_WINDOW_MISMATCH");
  const chart = request("executionFinancialChartV1", {}, { subject_kind: "portfolio", subject_id: "pf_measurement",
    from_ms: context.window.from_ms, to_ms: context.window.to_ms, viewport_px: 1280 });
  assert.match(build({ groups: { ...defaultGroups(), "portfolio-360": [chart] } }).sets["portfolio-360"][0], /subject_id=pf_measurement/);
  delete chart.query.to_ms;
  refuses(() => build({ groups: { ...defaultGroups(), "portfolio-360": [chart] } }), "EXPLICIT_BOUND_WINDOW_MISMATCH");
});

test("JSON subject schema enforces FUND identity absence; PORTFOLIO stays in explicit population", () => {
  const economic_partition = { economic_domain: "PAPER", currency: "USDT", basis: "INTERNAL_ACCOUNT_BALANCE",
    native_profile_ref: "paper-profile-ref", domain_proof_ref: "paper-proof-ref" };
  const series = request("executionManagerSeriesGetV1", {}, { metric: "NAV", subjects: [{ subject_type: "PORTFOLIO", subject_id: "pf_measurement" }], economic_partition });
  assert.match(build({ groups: { ...defaultGroups(), "portfolio-360": [series] } }).sets["portfolio-360"][0], /subjects=/);
  series.query.economic_partition = { ...economic_partition, economic_domain: "ACTUAL" };
  refuses(() => build({ groups: { ...defaultGroups(), "portfolio-360": [series] } }), "ECONOMIC_PARTITION_ENVIRONMENT_MISMATCH");
  series.query.economic_partition = economic_partition;
  series.query.subjects = [{ subject_type: "FUND", subject_id: "pf_measurement" }];
  refuses(() => build({ groups: { ...defaultGroups(), "portfolio-360": [series] } }), "REQUEST_PARAMETER_SCHEMA_INVALID");
});

function prep(patch = {}) {
  const workload = build(), now_ms = Date.UTC(2026, 9, 22, 12);
  // TEST_ONLY owners/artifact pins, never a real approval or runtime reference.
  const target = { status: "OWNER_APPROVED", ref: "TEST_ONLY-target", sha256: H("a"), source_sha: "a".repeat(40),
    image_digest: H("b"), config_sha256: H("c"), schema_sha256: H("d"), origin: "https://measurement.invalid",
    workload_sha256: workload.digest_input, context: structuredClone(context) };
  const budget = { status: "OWNER_APPROVED", ref: "TEST_ONLY-budget", sha256: H("e"), workload_sha256: workload.digest_input,
    numeric_group_pins: Array.from({ length: 14 }, (_, i) => ({ group: `TEST_ONLY-group-${i}`, ref: `TEST_ONLY-ref-${i}`, sha256: H("f") })) };
  const window = { window_id: "TEST_ONLY-window", authorisation_sha256: H("1"), origin: target.origin, granted_by: "TEST_ONLY-owner",
    granted_at_ms: now_ms - 1000, starts_at_ms: now_ms - 1000, ends_at_ms: now_ms + 120000,
    lane: "REAL_READ_QUALIFIED", run_kind: "ABSOLUTE_MEASUREMENT", measurements: ["M-5"],
    max_tabs: 28, max_rps: 100, max_duration_ms: 60000, stop_rollback: "TEST_ONLY stop and drain" };
  return { workload, inventory, target, budget, window, measurement: "M-5", stage: "B2", duration_ms: 60000, now_ms, ...patch };
}

test("pure preflight needs exact target AND all fourteen budget pins, never authorizes execution", () => {
  const p = prep(), r = preflightCurrentManagerWorkload(p);
  assert.equal(r.status, "PREFLIGHT_VALIDATED_NOT_EXECUTED"); assert.equal(r.total_tabs, 28);
  assert.equal(r.authority_verified, false); assert.equal(r.execution_authorized, false); assert.equal(r.calibration_evidence, false);
  refuses(() => preflightCurrentManagerWorkload({ ...p, target: null }), "APPROVED_TARGET_PINS_REQUIRED");
  refuses(() => preflightCurrentManagerWorkload({ ...p, budget: null }), "APPROVED_14_GROUP_BUDGET_PINS_REQUIRED");
  const budget = structuredClone(p.budget); budget.numeric_group_pins.pop();
  refuses(() => preflightCurrentManagerWorkload({ ...p, budget }), "APPROVED_14_GROUP_BUDGET_PINS_REQUIRED");
  refuses(() => preflightCurrentManagerWorkload({ ...p, target: { ...p.target, workload_sha256: H("0") } }), "APPROVAL_WORKLOAD_OR_POPULATION_MISMATCH");
});

test("preflight preserves B2 denominator and checks origin/time/peak before any executor", () => {
  const p = prep();
  refuses(() => preflightCurrentManagerWorkload({ ...p, window: { ...p.window, max_tabs: 8 } }), "TAB_POPULATION_EXCEEDS_WINDOW");
  refuses(() => preflightCurrentManagerWorkload({ ...p, window: { ...p.window, origin: "https://other.invalid" } }), "MATCHED_OWNER_WINDOW_REQUIRED");
  refuses(() => preflightCurrentManagerWorkload({ ...p, measurement: "M-7" }), "MATCHED_OWNER_WINDOW_REQUIRED");
  refuses(() => preflightCurrentManagerWorkload({ ...p, window: { ...p.window, max_rps: 0.001 } }), "OFFERED_PEAK_EXCEEDS_WINDOW");
  refuses(() => preflightCurrentManagerWorkload({ ...p, now_ms: p.window.ends_at_ms }), "WINDOW_TIME_OR_DURATION_INVALID");
  refuses(() => preflightCurrentManagerWorkload({ ...p, window: { ...p.window, granted_at_ms: p.now_ms + 1 } }), "WINDOW_TIME_OR_DURATION_INVALID");
  const workload = structuredClone(p.workload); workload.stages.B2.pop();
  refuses(() => preflightCurrentManagerWorkload({ ...p, workload }), "WORKLOAD_CHANGED_OR_WRONG_SCHEMA");
});
