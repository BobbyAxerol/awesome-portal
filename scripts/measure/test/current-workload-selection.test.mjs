/** TEST_ONLY owner artifacts/population. No load, listener, session, source or
 * approved numeric budget exists here; subprocess tests use --dry-run only.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildCurrentManagerWorkload, createCurrentManagerInventory } from "../lib/current-manager-workload.mjs";
import { CURRENT_COLLECTORS_SCHEMA, CURRENT_SELECTION_SCHEMA, assertCurrentWorkloadDrain, assertCurrentWorkloadFlags,
  prepareCurrentManagerDryRun, selectCurrentManagerWorkload } from "../lib/current-workload-selection.mjs";
import { repoRoot } from "../lib/receipt.mjs";
import { WINDOW_SCHEMA } from "../lib/window.mjs";

const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const H = c => `sha256:${c.repeat(64)}`;
const NOW = Date.UTC(2026, 9, 22, 13, 0);
const base = join(tmpdir(), "core07-TEST_ONLY-selection");
const files = ["execution-manager-models", "execution-manager-lists", "execution-paper-read", "execution-operations", "execution-access"];
const sources = files.map(n => { const file = `packages/contracts/openapi/${n}.openapi.json`, bytes = readFileSync(join(repoRoot, file));
  return { file, bytes, sha256: hash(bytes) }; });
const context = { workspace_id: "ws_measurement", environment: "paper", profile_id: "PAPER_BINANCE_USDM",
  resource_ids: ["pf_measurement", "alpha_measurement", "acc_measurement", "dep_measurement"],
  window: { from_ms: Date.UTC(2026, 9, 1), to_ms: Date.UTC(2026, 9, 20) } };
const req = (operation_id, path = {}, query = {}) => ({ operation_id, path, query });
const groups = {
  overview: [req("executionManagerFundOverviewGetV1")],
  fleet: [req("executionManagerFleetGetV1", {}, { limit: 50 })],
  portfolios: [req("listPortfolios", {}, { limit: 50 })],
  "portfolio-360": [req("executionManagerPortfolio360GetV1", { id: "pf_measurement" })],
  "alpha-360": [req("executionManagerAlpha360GetV1", { id: "alpha_measurement" })],
  "account-360": [req("executionManagerAccount360GetV1", { id: "acc_measurement" })],
  blotter: [req("executionFullBlotterV1", {}, { limit: 50, stage: "PAPER" })],
  operations: [req("listExecutionOperationsQueue", {}, { limit: 50 })],
  "workbench-fills": [req("executionPaperWorkbenchV1", { deployment_id: "dep_measurement" })],
  admin: [req("portalScopedAccessSelfNavigationGetV1")], accounts: [req("listBrokerBindings", {}, { limit: 50 })],
};
const proposal = { schema_version: CURRENT_SELECTION_SCHEMA, contracts: sources.map(({ file, sha256 }) => ({ file, sha256 })),
  context, groups, cadence_ms: { overview: 15000, visits: 30000 }, seed: 20261022 };
const workload = buildCurrentManagerWorkload({ inventory: createCurrentManagerInventory(sources), ...proposal });

function fixture(full = true, mutate = () => {}) {
  const manifest = structuredClone(proposal), store = new Map(), opened = [];
  const put = (name, body) => { const bytes = Buffer.from(JSON.stringify(body)), file = join(base, name); store.set(file, bytes); return { file, sha256: hash(bytes) }; };
  const target = { ref: "TEST_ONLY_TARGET_OWNER_RETURN", status: "OWNER_APPROVED", source_sha: "a".repeat(40),
    image_digest: H("a"), config_sha256: H("b"), schema_sha256: H("c"), origin: "https://measurement.invalid",
    workload_sha256: workload.digest_input, context };
  const budget = { ref: "TEST_ONLY_NUMERIC_OWNER_RETURN", status: "OWNER_APPROVED", workload_sha256: workload.digest_input,
    numeric_group_pins: Array.from({ length: 14 }, (_, i) => ({ group: `TEST_ONLY_B${i}`, ref: `TEST_ONLY_bound_${i}`, sha256: H("d") })) };
  const window = { authorisation_sha256: H("e"), origin: target.origin, measurements: ["M-5", "M-7"], window_id: "TEST_ONLY_WINDOW",
    granted_by: "TEST_ONLY_OWNER", stop_rollback: "TEST_ONLY_OFFICIAL_STOP_RESTORE", lane: "REAL_READ_RETAINED", run_kind: "ABSOLUTE_MEASUREMENT",
    granted_at_ms: NOW - 1000, starts_at_ms: NOW - 1000, ends_at_ms: NOW + 120000, max_duration_ms: 90000, max_tabs: 28, max_rps: 100 };
  const repin = { edge_sha: "b".repeat(40), pm_sha: "c".repeat(40), core_source_sha: target.source_sha,
    core_image_digest: target.image_digest, core_config_sha256: target.config_sha256, core_schema_sha256: target.schema_sha256,
    observed_at_ms: NOW - 100, lease_root_user_checked: true, competing_jobs: [] };
  const collectors = { schema_version: CURRENT_COLLECTORS_SCHEMA, status: "OWNER_APPROVED", window_id: window.window_id,
    workload_sha256: workload.digest_input, clock: { ref: "TEST_ONLY_CLOCK", sha256: H("f") },
    collectors: budget.numeric_group_pins.map(p => ({ ...p, owner: "TEST_ONLY_COLLECTOR_OWNER" })),
    stop_restore: { ref: "TEST_ONLY_STOP_RESTORE", sha256: H("f") }, teardown: { ref: "TEST_ONLY_TEARDOWN", sha256: H("f") } };
  mutate({ manifest, target, budget, collectors, window, repin });
  if (full) {
    manifest.target = put("target.json", target); manifest.budget = put("budget.json", budget);
    manifest.collectors = put("collectors.json", { ...collectors, target_sha256: manifest.target.sha256, budget_sha256: manifest.budget.sha256 });
  }
  const m = put("manifest.json", manifest);
  window.current_workload_manifest_sha256 = m.sha256;
  const read = file => { opened.push(String(file)); return store.has(String(file)) ? store.get(String(file)) : readFileSync(file); };
  return { manifest, store, opened, read, target, budget, collectors, window, repin,
    options: { manifestPath: m.file, manifestSha256: m.sha256, root: repoRoot, measurement: "M-5", stage: "B2", durationMs: 30000,
      window: full ? window : null, repin: full ? repin : null, repinMaxAgeMs: 1000, nowMs: NOW, read } };
}
const refuses = (fn, code) => assert.throws(fn, e => String(e.message).includes(code), code);

test("opt-in current selection binds actual OpenAPI, target, all14 collectors and B2=28 without issuing authority", () => {
  const f = fixture(), old = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("TEST_ONLY_NETWORK_FORBIDDEN"); };
  try {
    const result = selectCurrentManagerWorkload(f.options);
    assert.equal(result.preparation.status, "PREFLIGHT_VALIDATED_NOT_EXECUTED");
    assert.equal(result.preparation.total_tabs, 28); assert.equal(result.preparation.collector_preparation.group_count, 14);
    assert.equal(result.preparation.authority_verified, false); assert.equal(result.preparation.calibration_evidence, false);
    assert.equal(result.preparation.stop_cleanup.credentials_opened, false); assert.equal(result.preparation.stop_cleanup.requests_started, 0);
    assert.equal(result.workload.digest_input, workload.digest_input);
    assert.equal(result.workload.stages.B1.reduce((n, x) => n + x.tabs, 0), 8);
    assert.equal(f.opened.some(p => /cookie|session|\.hdr/.test(p)), false);
  } finally { globalThis.fetch = old; }
});

test("missing owner inputs are explicit only in dry-run; real selection fails rather than using legacy fixture IDs", () => {
  const f = fixture(false);
  const result = selectCurrentManagerWorkload({ ...f.options, dryRun: true });
  assert.equal(result.preparation.status, "BLOCKED_MISSING_OWNER_INPUTS");
  assert.deepEqual(result.preparation.missing_inputs, ["OWNER_TARGET_ARTIFACT", "OWNER_BUDGET_ARTIFACT", "OWNER_COLLECTORS_ARTIFACT",
    "MATCHED_MEASUREMENT_WINDOW", "FRESH_TARGET_REPIN"]);
  refuses(() => selectCurrentManagerWorkload(f.options), "OWNER_INPUTS_REQUIRED");
});

test("manifest/owner byte pins, contract traversal and fixture context are refused", () => {
  let f = fixture(); refuses(() => selectCurrentManagerWorkload({ ...f.options, manifestSha256: H("0") }), "MANIFEST_DIGEST_MISMATCH");
  f = fixture(); f.store.set(f.manifest.target.file, Buffer.from("{}"));
  refuses(() => selectCurrentManagerWorkload(f.options), "TARGET_DIGEST_MISMATCH");
  f = fixture(false, x => { x.manifest.contracts[0].file = "../unaccepted.json"; });
  refuses(() => selectCurrentManagerWorkload({ ...f.options, dryRun: true }), "CONTRACT_OUTSIDE_PUBLISHED_ROOT");
  f = fixture(false, x => { x.manifest.context.workspace_id = "ws_TEST_ONLY_fixture"; });
  refuses(() => selectCurrentManagerWorkload({ ...f.options, dryRun: true }), "EXPLICIT_NON_FIXTURE_CONTEXT_REQUIRED");
});

test("fresh exact source/image/config/schema repin, owner population and future fixed window remain required", () => {
  for (const mutate of [x => { x.repin.core_image_digest = H("0"); }, x => { x.repin.core_source_sha = "d".repeat(40); },
    x => { x.repin.core_config_sha256 = H("0"); }, x => { x.repin.core_schema_sha256 = H("0"); },
    x => { x.repin.observed_at_ms = NOW - 2000; }, x => { x.repin.competing_jobs = ["TEST_ONLY_BUSY"]; }]) {
    const f = fixture(true, mutate); refuses(() => selectCurrentManagerWorkload(f.options), "REPIN_TARGET_MISMATCH");
  }
  let f = fixture(true, x => { x.target.context = { ...context, workspace_id: "ws_other" }; });
  refuses(() => selectCurrentManagerWorkload(f.options), "APPROVAL_WORKLOAD_OR_POPULATION_MISMATCH");
  f = fixture(true, x => { x.window.starts_at_ms = NOW + 1; });
  refuses(() => selectCurrentManagerWorkload(f.options), "WINDOW_TIME_OR_DURATION_INVALID");
});

test("collector/clock/stop/teardown pins and exact14 numeric groups cannot be silently omitted or substituted", () => {
  for (const [mutate, code] of [[x => { delete x.collectors.clock; }, "COLLECTORS_BINDING"],
    [x => { delete x.collectors.stop_restore; }, "COLLECTORS_BINDING"], [x => { delete x.collectors.teardown; }, "COLLECTORS_BINDING"],
    [x => { x.collectors.window_id = "TEST_ONLY_OTHER_WINDOW"; }, "COLLECTORS_BINDING"],
    [x => { x.collectors.collectors.pop(); }, "COLLECTOR_POPULATION"],
    [x => { x.collectors.collectors[0].group = "TEST_ONLY_EXTRA"; }, "COLLECTOR_BUDGET_GROUP_MISMATCH"],
    [x => { x.budget.numeric_group_pins.pop(); }, "APPROVED_14_GROUP_BUDGET_PINS_REQUIRED"]]) {
    const f = fixture(true, mutate); refuses(() => selectCurrentManagerWorkload(f.options), code);
  }
});

test("bounded15s request drain plus5s guard must fit; tabs/RPS are never reduced to fit", () => {
  let f = fixture(true, x => { x.window.ends_at_ms = NOW + 49000; });
  refuses(() => selectCurrentManagerWorkload(f.options), "WINDOW_DRAIN_RESERVE");
  f = fixture(true, x => { x.window.max_duration_ms = 44000; });
  refuses(() => selectCurrentManagerWorkload(f.options), "WINDOW_DRAIN_RESERVE");
  f = fixture(true, x => { x.window.max_tabs = 27; });
  refuses(() => selectCurrentManagerWorkload(f.options), "TAB_POPULATION_EXCEEDS_WINDOW");
  f = fixture(true, x => { x.window.max_rps = 0.01; });
  refuses(() => selectCurrentManagerWorkload(f.options), "OFFERED_PEAK_EXCEEDS_WINDOW");
  f = fixture(); f.window.current_workload_manifest_sha256 = H("0");
  refuses(() => selectCurrentManagerWorkload(f.options), "WINDOW_MANIFEST_BINDING");
  refuses(() => assertCurrentWorkloadDrain({ ...f.window, ends_at_ms: NOW + 50001 }, 30000, NOW + 2), "WINDOW_DRAIN_RESERVE");
});

test("new selection cannot rewrite IDs/use a legacy workload/selftest/G2 ingest; default is unchanged", () => {
  const legacy = join(repoRoot, "scripts/measure/workloads/read-sets.v1.json");
  assert.equal(assertCurrentWorkloadFlags({ workload: legacy }, legacy), false);
  const args = { workload: legacy, "current-workload-manifest": "/TEST_ONLY/manifest.json", "current-workload-manifest-sha256": H("0") };
  assert.equal(assertCurrentWorkloadFlags(args, legacy), true);
  for (const patch of [{ "id-map": "/TEST_ONLY/ids.json" }, { selftest: true }, { ingest: "/TEST_ONLY/g2.json" }, { workload: "/TEST_ONLY/legacy.json" }])
    refuses(() => assertCurrentWorkloadFlags({ ...args, ...patch }, legacy), "INCOMPATIBLE_LEGACY_OR_INGEST_FLAGS");
  refuses(() => assertCurrentWorkloadFlags({ workload: legacy, "dry-run": true }, legacy), "DRY_RUN_REQUIRES_CURRENT_MANIFEST");
});

test("complete TEST_ONLY dry preparation also enforces actual owner window, M5 plan/repetition/minimum and workload pin", () => {
  const dir = mkdtempSync(join(tmpdir(), "core07-plan-test-"));
  try {
    const f = fixture();
    for (const name of ["target", "budget", "collectors"]) {
      const ref = f.manifest[name], bytes = f.store.get(ref.file);
      ref.file = `${name}.json`; writeFileSync(join(dir, ref.file), bytes);
    }
    const put = (name, body) => { const file = join(dir, name), bytes = Buffer.from(JSON.stringify(body)); writeFileSync(file, bytes); return { file, sha256: hash(bytes) }; };
    const manifest = put("manifest.json", f.manifest);
    const authorization = put("window.json", { ...f.window, schema_version: WINDOW_SCHEMA, base_url: f.window.origin,
      current_workload_manifest_sha256: manifest.sha256 });
    const repin = put("repin.json", f.repin);
    const planBody = { schema_version: "portal.elp2-10.coexistence-plan.v1", minimum_duration_ms: 30000,
      stage_orders: { TEST_ONLY_REP: ["B0", "B1", "B2"] }, portal_workload_sha256: workload.digest_input };
    const plan = put("plan.json", planBody);
    const args = { "current-workload-manifest": manifest.file, "current-workload-manifest-sha256": manifest.sha256,
      authorization: authorization.file, "authorization-sha256": authorization.sha256, repin: repin.file, "repin-max-age-ms": 1000,
      plan: plan.file, "plan-sha256": plan.sha256, "repetition-id": "TEST_ONLY_REP", stage: "B2", "duration-ms": 30000 };
    const report = prepareCurrentManagerDryRun({ args, root: repoRoot, measurement: "M-5", nowMs: NOW });
    assert.equal(report.status, "PREFLIGHT_VALIDATED_NOT_EXECUTED"); assert.deepEqual(report.missing_inputs, []);
    assert.equal(report.authority_verified, false); assert.equal(report.stop_cleanup.credentials_opened, false);
    const prepare = patch => prepareCurrentManagerDryRun({ args: { ...args, ...patch }, root: repoRoot, measurement: "M-5", nowMs: NOW });
    refuses(() => prepare({ "repetition-id": "TEST_ONLY_OTHER_REP" }), "PLAN_STAGE_OR_REPETITION");
    refuses(() => prepare({ "duration-ms": 29999 }), "PLAN_MINIMUM_DURATION");
    const other = put("wrong-plan.json", { ...planBody, portal_workload_sha256: H("0") });
    refuses(() => prepare({ plan: other.file, "plan-sha256": other.sha256 }), "PLAN_WORKLOAD_MISMATCH");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("both actual M5/M7 CLIs produce honest blocked dry-run output with no header/out/network access", () => {
  const dir = mkdtempSync(join(tmpdir(), "core07-selection-test-"));
  try {
    const file = join(dir, "TEST_ONLY-proposal.json"), bytes = Buffer.from(JSON.stringify(proposal)); writeFileSync(file, bytes);
    for (const [driver, measurement] of [["m5-coexistence-window.mjs", "M-5"], ["m7-g2-window.mjs", "M-7"]]) {
      const out = join(dir, `${measurement}-must-not-write.json`), header = join(dir, "DO_NOT_OPEN_SESSION.hdr");
      const result = spawnSync(process.execPath, [join(repoRoot, "scripts/measure", driver), "--dry-run", "--stage", "B2", "--duration-ms", "30000",
        "--current-workload-manifest", file, "--current-workload-manifest-sha256", hash(bytes), "--header-file", header, "--out", out],
      { cwd: repoRoot, encoding: "utf8", timeout: 15000, maxBuffer: 262144 });
      assert.equal(result.status, 0, result.stderr); const report = JSON.parse(result.stdout);
      assert.equal(report.status, "BLOCKED_MISSING_OWNER_INPUTS"); assert.equal(report.measurement, measurement); assert.equal(report.total_tabs, 28);
      assert.equal(report.calibration_evidence, false); assert.equal(report.execution_authorized, false);
      assert.equal(report.stop_cleanup.requests_started, 0); assert.equal(report.stop_cleanup.collectors_started, false);
      assert.equal(report.missing_inputs.includes("MATCHED_COEXISTENCE_PLAN_AND_REPETITION"), measurement === "M-5");
      assert.equal(result.stdout.includes(header), false); assert.equal(existsSync(out), false); assert.equal(existsSync(header), false);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("default CLIs keep original pre-I/O refusal and current manifests cannot be used for G2 ingest", () => {
  for (const [driver, expected] of [["m5-coexistence-window.mjs", "MISSING_ARGUMENT:--authorization"], ["m7-g2-window.mjs", "choose exactly one"]]) {
    const r = spawnSync(process.execPath, [join(repoRoot, "scripts/measure", driver)], { encoding: "utf8", timeout: 5000 });
    assert.equal(r.status, 3); assert.match(r.stderr, new RegExp(expected));
  }
  const r = spawnSync(process.execPath, [join(repoRoot, "scripts/measure/m7-g2-window.mjs"), "--current-workload-manifest", "/TEST_ONLY/not-read.json",
    "--current-workload-manifest-sha256", H("0"), "--ingest", "/TEST_ONLY/not-read.json"], { encoding: "utf8", timeout: 5000 });
  assert.equal(r.status, 3); assert.match(r.stderr, /INCOMPATIBLE_LEGACY_OR_INGEST_FLAGS/);
});
