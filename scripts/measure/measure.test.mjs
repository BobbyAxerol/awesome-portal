/** Unit tests for the ELP2-10 measurement harness libraries (node --test scripts/measure/measure.test.mjs). No network, no Docker. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { MEASUREMENT_QUIET_TIMEOUT, MeasurementQuietTimeout, waitForQuiet } from "../../apps/portal/frontend/e2e/quietGate.mjs";
import { evaluateG2, G2_CENSUS_SCHEMA, G2_INPUT_SCHEMA, G2Refused, parseEdgeCensus } from "./lib/g2.mjs";
import { buildReceipt, canonical, percentile, sha256File, summarize } from "./lib/receipt.mjs";
import { buildSchedule, offeredPeak, resolvePath, runReplay, validateWorkload } from "./lib/replay.mjs";
import { runStage, stageTabCensus } from "./lib/stage.mjs";
import { loadWindow, WINDOW_SCHEMA, WindowRefused } from "./lib/window.mjs";

const base = { measurement: "M-9", title: "t", runKind: "CAPPED_CORRECTNESS", startedAtMs: 1, endedAtMs: 2, workload: {}, results: {} };

test("percentile is nearest-rank, like the repo diagnostic", () => {
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5), 5);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95), 10);
  assert.equal(percentile([], 0.5), null);
  assert.deepEqual(summarize([]), { n: 0, p50: null, p95: null, p99: null, max: null, mean: null });
});

test("a fixture or double lane is never calibration evidence and never an approved budget", () => {
  for (const lane of ["FIXTURE_LAB", "BFF_DOUBLE"]) {
    const r = buildReceipt({ ...base, lane, status: "RUN_FIXTURE" });
    assert.equal(r.calibration_evidence, false);
    assert.equal(r.approved_budget, false);
    assert.match(r.evidence_class, /^TEST_ONLY_FIXTURE/);
  }
  assert.throws(() => buildReceipt({ ...base, lane: "FIXTURE_LAB", status: "RUN_WINDOW" }), /RUN_WINDOW/);
});

test("a real lane needs a window id, and only a real ABSOLUTE window run is calibration evidence", () => {
  assert.throws(() => buildReceipt({ ...base, lane: "REAL_READ_QUALIFIED", status: "RUN_WINDOW" }), /window id/);
  const capped = buildReceipt({ ...base, lane: "REAL_READ_QUALIFIED", status: "RUN_WINDOW", windowId: "W1" });
  assert.equal(capped.calibration_evidence, false);
  const absolute = buildReceipt({ ...base, runKind: "ABSOLUTE_MEASUREMENT", lane: "REAL_READ_QUALIFIED", status: "RUN_WINDOW", windowId: "W1" });
  assert.equal(absolute.calibration_evidence, true);
  assert.equal(absolute.approved_budget, false);
  assert.throws(() => buildReceipt({ ...base, lane: "SOMETHING", status: "RUN_FIXTURE" }), /lane/);
});

test("the receipt digest does not depend on key order", () => {
  assert.equal(canonical({ b: 1, a: [2, { d: 1, c: 2 }] }), canonical({ a: [2, { c: 2, d: 1 }], b: 1 }));
});

function windowFile(patch = {}) {
  const now = Date.now();
  const record = { schema_version: WINDOW_SCHEMA, window_id: "W-TEST", granted_by: "Edge", granted_at_ms: now - 5000, starts_at_ms: now - 1000, ends_at_ms: now + 600_000,
    measurements: ["M-5"], lane: "REAL_READ_QUALIFIED", run_kind: "ABSOLUTE_MEASUREMENT", base_url: "https://portal.example.test", max_rps: 20, max_tabs: 8,
    max_duration_ms: 300_000, stop_rollback: "stop the script", ...patch };
  const path = join(mkdtempSync(join(tmpdir(), "m-win-")), "w.json");
  writeFileSync(path, JSON.stringify(record));
  return { path, sha: sha256File(path) };
}

test("the window guard refuses what it must refuse", () => {
  const ok = windowFile();
  assert.equal(loadWindow(ok.path, ok.sha, { measurement: "M-5" }).origin, "https://portal.example.test");
  const refusal = (fn, code) => assert.throws(fn, (e) => e instanceof WindowRefused && e.code === code, code);
  refusal(() => loadWindow(ok.path, "sha256:" + "0".repeat(64), { measurement: "M-5" }), "AUTHORISATION_DIGEST_MISMATCH");
  refusal(() => loadWindow(ok.path, ok.sha, { measurement: "M-7" }), "MEASUREMENT_NOT_AUTHORISED");
  refusal(() => loadWindow(ok.path, ok.sha, { measurement: "M-5", nowMs: Date.now() + 3_600_000 }), "WINDOW_CLOSED");
  refusal(() => loadWindow(ok.path, ok.sha, { measurement: "M-5", nowMs: Date.now() - 3_600_000 }), "GRANTED_IN_THE_FUTURE");
  const fixtureOnly = windowFile({ lane: "FIXTURE_LAB" });
  refusal(() => loadWindow(fixtureOnly.path, fixtureOnly.sha, { measurement: "M-5", allowLanes: ["REAL_READ_QUALIFIED"] }), "LANE_NOT_ALLOWED");
  const local = windowFile({ base_url: "http://127.0.0.1:4100" });
  refusal(() => loadWindow(local.path, local.sha, { measurement: "M-5" }), "LOCAL_ORIGIN_IS_NOT_A_REAL_WINDOW");
  assert.equal(loadWindow(local.path, local.sha, { measurement: "M-5", selfTest: true }).origin, "http://127.0.0.1:4100");
  const path = windowFile({ base_url: "https://portal.example.test/api" });
  refusal(() => loadWindow(path.path, path.sha, { measurement: "M-5" }), "BASE_URL_MUST_BE_AN_ORIGIN");
  refusal(() => loadWindow("", "", { measurement: "M-5" }), "AUTHORISATION_AND_SHA256_REQUIRED");
});

const workload = { schema_version: "portal.elp2-10.read-workload.v1", seed: 7, sets: { poll: ["GET /api/v1/execution/a", "GET /api/v1/execution/b?x=1"], visit: ["GET /api/v1/execution/alphas/alpha_btc_trend"] },
  stages: { B1: [{ set: "poll", tabs: 4, cadence_ms: 15000 }], B2: [{ set: "poll", tabs: 4, cadence_ms: 15000 }, { set: "visit", tabs: 2, cadence_ms: 30000 }] } };

test("the replay schedule is deterministic and its offered peak is computed before any request", () => {
  validateWorkload(workload);
  const a = buildSchedule(workload, "B2", 60_000, 7), b = buildSchedule(workload, "B2", 60_000, 7), c = buildSchedule(workload, "B2", 60_000, 8);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.equal(a.filter((e) => e.set === "poll").length, 4 * 4);
  assert.ok(offeredPeak(a, workload) >= 2);
  assert.throws(() => validateWorkload({ ...workload, sets: { poll: ["POST /api/v1/execution/a"] } }), /NOT_A_GET/);
  assert.throws(() => validateWorkload({ ...workload, stages: { B1: [{ set: "nope", tabs: 1, cadence_ms: 5000 }] } }), /UNKNOWN_SET/);
});

test("fixture ids are skipped on a real origin unless the id map names them", () => {
  assert.equal(resolvePath("GET /api/v1/execution/alphas/alpha_btc_trend", {}, true), null);
  assert.equal(resolvePath("GET /api/v1/execution/alphas/alpha_btc_trend", { alpha_btc_trend: "alpha_real_1" }, true), "/api/v1/execution/alphas/alpha_real_1");
  assert.equal(resolvePath("GET /api/v1/execution/alphas/alpha_btc_trend", {}, false), "/api/v1/execution/alphas/alpha_btc_trend");
});

test("the replay refuses an offered peak above the window max_rps before sending anything", async () => {
  await assert.rejects(runReplay({ origin: "http://127.0.0.1:1", workload, stage: "B1", durationMs: 15_000, seed: 7, maxRps: 1 }), /OFFERED_PEAK_ABOVE_MAX_RPS/);
});

/* ── MEASURE-1: tab census and bound are decided before any header read or request ───────────────────────────────── */

const realWorkload = JSON.parse(readFileSync(new URL("./workloads/read-sets.v1.json", import.meta.url), "utf8"));
const stageWindow = (patch = {}) => ({ origin: "https://portal.example.test", max_rps: 200, max_tabs: 8, max_duration_ms: 300_000, ends_at_ms: Date.now() + 600_000, ...patch });
async function withFetchSpy(fn) {
  const real = globalThis.fetch, calls = [];
  globalThis.fetch = async (...a) => { calls.push(a); throw new Error("fetch must not run in this test"); };
  try { return await fn(calls); } finally { globalThis.fetch = real; }
}

test("MEASURE-1 · the tab census of a stage is the SUM of its entries, not the largest entry", () => {
  assert.equal(stageTabCensus(workload, "B1").total_tabs, 4);
  assert.equal(stageTabCensus(workload, "B2").total_tabs, 4 + 2);
  assert.deepEqual(stageTabCensus(workload, "B2").entries, [{ set: "poll", tabs: 4 }, { set: "visit", tabs: 2 }]);
  // The approved workload as shipped: B1 = 8 Overview tabs, B2 = B1 + 10 screens x 2 tabs = 28 (WINDOW_REQUESTS section 1).
  assert.equal(stageTabCensus(realWorkload, "B1").total_tabs, 8);
  assert.equal(stageTabCensus(realWorkload, "B2").total_tabs, 28);
  assert.throws(() => stageTabCensus(workload, "B9"), /WORKLOAD_UNKNOWN_STAGE:B9/);
  assert.throws(() => stageTabCensus({ ...workload, sets: { poll: ["POST /api/x"] } }, "B1"), /NOT_A_GET/);
});

test("MEASURE-1 · an over-bound stage refuses with ZERO fetch calls and before the header file is read", async () => {
  await withFetchSpy(async (calls) => {
    let replayed = 0;
    const base = { measurement: "M-5", workload, headersPath: "/nonexistent/headers-must-not-be-read", idMapPath: "/nonexistent/id-map-must-not-be-read", durationMs: 15_000, seed: 7, real: true, replayImpl: async () => { replayed++; return {}; } };
    // B2 of the toy workload is 6 tabs: max_tabs 5 is over the bound. The ENOENT of the header file would win if it were read first.
    await assert.rejects(runStage({ ...base, window: stageWindow({ max_tabs: 5 }), stage: "B2" }), /^Error: TABS_EXCEED_WINDOW:6>5$/);
    // The largest single entry (4) would have passed the old check; the SUM is what is authorised.
    await assert.rejects(runStage({ ...base, window: stageWindow({ max_tabs: 4 }), stage: "B2" }), /TABS_EXCEED_WINDOW:6>4/);
    // The shipped B2 (28 tabs) against a window that only grants the B1 population (8).
    await assert.rejects(runStage({ ...base, workload: realWorkload, window: stageWindow({ max_tabs: 8 }), stage: "B2" }), /TABS_EXCEED_WINDOW:28>8/);
    await assert.rejects(runStage({ ...base, window: stageWindow({ max_tabs: 4 }), stage: "B9" }), /WORKLOAD_UNKNOWN_STAGE/);
    await assert.rejects(runStage({ ...base, window: stageWindow({ max_tabs: Number.NaN }), stage: "B1" }), /WINDOW_MAX_TABS_INVALID/);
    assert.equal(replayed, 0, "the replay was never entered");
    assert.equal(calls.length, 0, "no request was sent");
  });
});

test("MEASURE-1 · the real runReplay is never reached for an over-bound stage: the fetch spy stays at zero", async () => {
  await withFetchSpy(async (calls) => {
    await assert.rejects(runStage({ measurement: "M-5", window: stageWindow({ max_tabs: 27 }), stage: "B2", workload: realWorkload, headersPath: "", idMapPath: "", durationMs: 15_000, seed: 7, real: true }), /TABS_EXCEED_WINDOW:28>27/);
    assert.equal(calls.length, 0);
  });
});

test("MEASURE-1 · the exact boundary passes, the approved workload reaches the replay unshrunk", async () => {
  const seen = [];
  const replayImpl = async (o) => { seen.push(o); return { ran_to_planned_end: true }; };
  const run = (w, wl, extra = {}) => runStage({ measurement: "M-5", window: stageWindow(w), stage: "B2", workload: wl, headersPath: "", idMapPath: "", durationMs: 15_000, seed: 7, real: true, replayImpl, ...extra });
  const ok = await run({ max_tabs: 6 }, workload);
  assert.equal(ok.tab_census.total_tabs, 6);
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].workload.stages.B2, workload.stages.B2, "no entry or tab count was reduced to fit");
  await run({ max_tabs: 28 }, realWorkload);
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[1].workload.stages.B2, realWorkload.stages.B2);
  // The line filter narrows paths, never the tab population that was authorised.
  await run({ max_tabs: 28 }, realWorkload, { onlyPrefix: "/api/v1/execution/" });
  assert.deepEqual(seen[2].workload.stages.B2, realWorkload.stages.B2);
});

test("MEASURE-1 · a multi-entry stage is counted by its total (3 entries, 2 + 3 + 5 = 10)", async () => {
  const multi = { ...workload, stages: { M: [{ set: "poll", tabs: 2, cadence_ms: 15000 }, { set: "visit", tabs: 3, cadence_ms: 30000 }, { set: "poll", tabs: 5, cadence_ms: 20000 }] } };
  assert.equal(stageTabCensus(multi, "M").total_tabs, 10);
  await withFetchSpy(async (calls) => {
    await assert.rejects(runStage({ measurement: "M-7", window: stageWindow({ max_tabs: 9 }), stage: "M", workload: multi, headersPath: "", idMapPath: "", durationMs: 15_000, seed: 7, real: true }), /TABS_EXCEED_WINDOW:10>9/);
    assert.equal(calls.length, 0);
  });
  const r = await runStage({ measurement: "M-7", window: stageWindow({ max_tabs: 10 }), stage: "M", workload: multi, headersPath: "", idMapPath: "", durationMs: 15_000, seed: 7, real: true, replayImpl: async () => ({}) });
  assert.equal(r.tab_census.total_tabs, 10);
});

/* ── MEASURE-2: G2 is bound to the run, the window and Edge's census before any threshold is compared ───────────── */

const WINDOW = { starts_at_ms: 1_000_000, ends_at_ms: 2_000_000 };
const NOW = 2_500_000;
const CENSUS_POP = [{ feed_id: "f-trade", venue: "v1", kind: "trade" }, { feed_id: "f-quote", venue: "v1", kind: "quote" }, { feed_id: "f-mark", venue: "v2", kind: "mark" }];
const PINS = { apparatus_ref: "p184-apparatus-TEST_ONLY", gate_revision: "gate-rev-TEST_ONLY", edge_sha: "edge-sha-TEST_ONLY" };
const binding = (over = {}) => ({ ...PINS, window: WINDOW, expected_population: CENSUS_POP, now_ms: NOW, ...over });
const g2row = (id, over = {}) => ({ ...id, samples: 10, p95_ms: 100, max_ms: 200, ...over });
const g2input = (over = {}) => ({ schema_version: G2_INPUT_SCHEMA, ...PINS, started_at_ms: 1_100_000, ended_at_ms: 1_900_000, population: CENSUS_POP.map((id) => g2row(id)), ...over });
const refuses = (fn, code) => assert.throws(fn, (e) => e instanceof G2Refused && e.code === code && e.message.startsWith("REFUSED:"), code);

test("G2 · the original thresholds are applied per feed, trade max differs from quote / mark max (inputs bound)", () => {
  const pop = [{ feed_id: "a", venue: "v", kind: "trade" }, { feed_id: "b", venue: "v", kind: "quote" }, { feed_id: "c", venue: "v", kind: "mark" }];
  const run = (rows) => evaluateG2(g2input({ population: rows }), binding({ expected_population: pop }));
  const met = run([g2row(pop[0], { p95_ms: 500, max_ms: 1499 }), g2row(pop[1], { p95_ms: 100, max_ms: 999 }), g2row(pop[2], { p95_ms: 1, max_ms: 1 })]);
  assert.equal(met.original_gate_result, "ORIGINAL_GATE_MET_FOR_SUPPLIED_POPULATION");
  assert.deepEqual(met.binding.run, { started_at_ms: 1_100_000, ended_at_ms: 1_900_000 });
  assert.equal(met.binding.expected_population_size, 3);
  // trade p95 501 (> 500), quote max exactly 1000 (not < 1000), mark max exactly 1000 (not < 1000): each fails on its own original comparison.
  const bad = run([g2row(pop[0], { p95_ms: 501, max_ms: 501 }), g2row(pop[1], { p95_ms: 100, max_ms: 1000 }), g2row(pop[2], { p95_ms: 10, max_ms: 1000 })]);
  assert.equal(bad.original_gate_result, "ORIGINAL_GATE_NOT_MET");
  assert.deepEqual(bad.failing, ["v/a/trade", "v/b/quote", "v/c/mark"]);
  // trade max exactly 1500 is not < 1500
  assert.deepEqual(run([g2row(pop[0], { p95_ms: 500, max_ms: 1500 }), g2row(pop[1]), g2row(pop[2])]).failing, ["v/a/trade"]);
  assert.deepEqual(met.gate, { per_feed_p95_ms_max: 500, trade_max_ms_below: 1500, quote_mark_max_ms_below: 1000 });
});

test("G2 · Codex repro: one synthetic row {samples:1.25,p95_ms:10,max_ms:1} with no apparatus / source / window / census is REFUSED", () => {
  const bare = { schema_version: G2_INPUT_SCHEMA, population: [{ feed_id: "f", venue: "v", kind: "trade", samples: 1.25, p95_ms: 10, max_ms: 1 }] };
  assert.throws(() => evaluateG2(bare), (e) => e instanceof G2Refused && e.code === "G2_BINDING_REQUIRED");
  assert.throws(() => evaluateG2(bare, binding({ expected_population: bare.population })), (e) => e instanceof G2Refused && e.code === "G2_INPUT_PIN_MISSING");
  // metadata-free input that is otherwise well-formed (the old "met" example) is refused too
  refuses(() => evaluateG2({ schema_version: G2_INPUT_SCHEMA, population: CENSUS_POP.map((id) => g2row(id)) }, binding()), "G2_INPUT_PIN_MISSING");
  // with every binding in place the row itself is still refused: fractional samples, then p95 above max
  const pop = [{ feed_id: "f", venue: "v", kind: "trade" }];
  const b = binding({ expected_population: pop });
  refuses(() => evaluateG2(g2input({ population: [{ ...pop[0], samples: 1.25, p95_ms: 10, max_ms: 1 }] }), b), "G2_ROW_SAMPLES");
  refuses(() => evaluateG2(g2input({ population: [{ ...pop[0], samples: 1, p95_ms: 10, max_ms: 1 }] }), b), "G2_ROW_P95_ABOVE_MAX");
});

test("G2 · pins: each of apparatus ref, gate revision and source pin must be present and equal the Edge census'", () => {
  for (const k of Object.keys(PINS)) {
    const missing = g2input(); delete missing[k];
    refuses(() => evaluateG2(missing, binding()), "G2_INPUT_PIN_MISSING");
    refuses(() => evaluateG2(g2input({ [k]: "someone-else" }), binding()), "G2_PIN_MISMATCH");
    refuses(() => evaluateG2(g2input({ [k]: "" }), binding()), "G2_INPUT_PIN_MISSING");
    refuses(() => evaluateG2(g2input(), binding({ [k]: "" })), "G2_BINDING_PIN_MISSING");
  }
  refuses(() => evaluateG2({ ...g2input(), schema_version: "x" }, binding()), "G2_INPUT_SCHEMA");
});

test("G2 · run times: integers, start < end, inside the authorised window, already ended", () => {
  refuses(() => evaluateG2(g2input({ started_at_ms: undefined }), binding()), "G2_RUN_TIME_INVALID");
  refuses(() => evaluateG2(g2input({ ended_at_ms: "1900000" }), binding()), "G2_RUN_TIME_INVALID");
  refuses(() => evaluateG2(g2input({ started_at_ms: 1_100_000.5 }), binding()), "G2_RUN_TIME_INVALID");
  refuses(() => evaluateG2(g2input({ started_at_ms: 1_900_000, ended_at_ms: 1_900_000 }), binding()), "G2_RUN_TIME_ORDER");
  refuses(() => evaluateG2(g2input({ started_at_ms: 1_900_000, ended_at_ms: 1_100_000 }), binding()), "G2_RUN_TIME_ORDER");
  refuses(() => evaluateG2(g2input({ started_at_ms: WINDOW.starts_at_ms - 1 }), binding()), "G2_RUN_OUTSIDE_WINDOW");
  refuses(() => evaluateG2(g2input({ ended_at_ms: WINDOW.ends_at_ms + 1 }), binding()), "G2_RUN_OUTSIDE_WINDOW");
  refuses(() => evaluateG2(g2input({ ended_at_ms: 1_900_000 }), binding({ now_ms: 1_899_999 })), "G2_RUN_ENDS_IN_THE_FUTURE");
  // the window edges themselves are inside
  assert.equal(evaluateG2(g2input({ started_at_ms: WINDOW.starts_at_ms, ended_at_ms: WINDOW.ends_at_ms }), binding()).failing.length, 0);
  refuses(() => evaluateG2(g2input(), binding({ window: { starts_at_ms: 5, ends_at_ms: 5 } })), "G2_BINDING_WINDOW");
  refuses(() => evaluateG2(g2input(), binding({ window: undefined })), "G2_BINDING_WINDOW");
});

test("G2 · population: exactly the Edge census, none missing, none extra, none duplicated, no empty or malformed identity", () => {
  const rows = CENSUS_POP.map((id) => g2row(id));
  refuses(() => evaluateG2(g2input({ population: rows.slice(1) }), binding()), "G2_POPULATION_MISSING");
  refuses(() => evaluateG2(g2input({ population: [...rows, g2row({ feed_id: "f-extra", venue: "v1", kind: "trade" })] }), binding()), "G2_POPULATION_UNEXPECTED");
  refuses(() => evaluateG2(g2input({ population: [...rows, rows[0]] }), binding()), "G2_POPULATION_DUPLICATE");
  // same feed id on another venue is a different identity (so the census one is missing, it is not a duplicate)
  refuses(() => evaluateG2(g2input({ population: [rows[0], rows[1], g2row({ feed_id: "f-mark", venue: "v1", kind: "mark" })] }), binding()), "G2_POPULATION_MISSING");
  refuses(() => evaluateG2(g2input({ population: [] }), binding()), "G2_POPULATION_EMPTY");
  refuses(() => evaluateG2(g2input({ population: [{ ...rows[0], kind: "tick" }, rows[1], rows[2]] }), binding()), "G2_POPULATION_ROW_KIND");
  refuses(() => evaluateG2(g2input({ population: [{ ...rows[0], feed_id: "" }, rows[1], rows[2]] }), binding()), "G2_POPULATION_ROW_FIELD");
  refuses(() => evaluateG2(g2input(), binding({ expected_population: [] })), "EXPECTED_POPULATION_EMPTY");
  refuses(() => evaluateG2(g2input(), binding({ expected_population: [...CENSUS_POP, CENSUS_POP[0]] })), "EXPECTED_POPULATION_DUPLICATE");
  // the order of the input does not matter
  assert.equal(evaluateG2(g2input({ population: [...rows].reverse() }), binding()).population_size, 3);
});

test("G2 · rows: integer positive samples, finite numbers, p95 <= max (equal is allowed), nothing coerced", () => {
  const one = (over) => evaluateG2(g2input({ population: CENSUS_POP.map((id, i) => g2row(id, i === 0 ? over : {})) }), binding());
  for (const samples of [0, -1, 1.25, Number.NaN, Infinity, "10", null, undefined]) refuses(() => one({ samples }), "G2_ROW_SAMPLES");
  for (const bad of [Number.NaN, Infinity, -Infinity, -1, "5", null, undefined]) {
    refuses(() => one({ p95_ms: bad }), "G2_ROW_NUMBER");
    refuses(() => one({ max_ms: bad }), "G2_ROW_NUMBER");
  }
  refuses(() => one({ p95_ms: 301, max_ms: 300 }), "G2_ROW_P95_ABOVE_MAX");
  assert.equal(one({ p95_ms: 300, max_ms: 300 }).failing.length, 0);
  // the former negative example (p95 501 with max 10) is an impossible pair: a refusal, no longer a "failing feed"
  refuses(() => one({ p95_ms: 501, max_ms: 10 }), "G2_ROW_P95_ABOVE_MAX");
});

test("G2 · the Edge census itself is validated and must name the selected window; Portal invents no feed list", () => {
  const census = { schema_version: G2_CENSUS_SCHEMA, window_id: "W-1", ...PINS, population: CENSUS_POP };
  const parsed = parseEdgeCensus(census, { windowId: "W-1" });
  assert.deepEqual(parsed.expected_population, CENSUS_POP);
  assert.equal(parsed.edge_sha, PINS.edge_sha);
  refuses(() => parseEdgeCensus({ ...census, schema_version: "x" }, { windowId: "W-1" }), "CENSUS_SCHEMA");
  refuses(() => parseEdgeCensus(census, { windowId: "W-2" }), "CENSUS_WINDOW_MISMATCH");
  refuses(() => parseEdgeCensus(census, { windowId: "" }), "CENSUS_WINDOW_MISMATCH");
  for (const k of ["window_id", "apparatus_ref", "gate_revision", "edge_sha"]) refuses(() => parseEdgeCensus({ ...census, [k]: "" }, { windowId: "W-1" }), "CENSUS_PIN_MISSING");
  refuses(() => parseEdgeCensus({ ...census, population: [] }, { windowId: "W-1" }), "CENSUS_EMPTY");
  refuses(() => parseEdgeCensus({ ...census, population: [CENSUS_POP[0], CENSUS_POP[0]] }, { windowId: "W-1" }), "CENSUS_DUPLICATE");
  refuses(() => parseEdgeCensus({ ...census, population: [{ feed_id: "f", venue: "v" }] }, { windowId: "W-1" }), "CENSUS_ROW_FIELD");
  assert.throws(() => parseEdgeCensus(undefined, { windowId: "W-1" }), G2Refused);
});

/* The driver end to end, no network and no apparatus: authorisation record + repin + census + ingest files in a temp dir. */
function g2Cli({ census, ingest, repinOver = {}, omitCensus = false }) {
  const dir = mkdtempSync(join(tmpdir(), "m7-g2-"));
  const now = Date.now();
  const win = { schema_version: WINDOW_SCHEMA, window_id: "W-G2", granted_by: "Edge", granted_at_ms: now - 600_000, starts_at_ms: now - 500_000, ends_at_ms: now + 600_000, measurements: ["M-7"],
    lane: "REAL_READ_QUALIFIED", run_kind: "ABSOLUTE_MEASUREMENT", base_url: "https://portal.example.test", max_rps: 20, max_tabs: 8, max_duration_ms: 300_000, stop_rollback: "stop" };
  const f = (name, value) => { const path = join(dir, name); writeFileSync(path, JSON.stringify(value)); return path; };
  const winPath = f("w.json", win), repinPath = f("r.json", { observed_at_ms: now - 1000, lease_root_user_checked: true, competing_jobs: [], edge_sha: PINS.edge_sha, pm_sha: "pm", ...repinOver });
  const censusPath = f("c.json", census), ingestPath = f("i.json", ingest), out = join(dir, "receipt.json");
  const argv = [new URL("./m7-g2-window.mjs", import.meta.url).pathname, "--authorization", winPath, "--authorization-sha256", sha256File(winPath), "--repin", repinPath, "--repin-max-age-ms", "60000",
    "--ingest", ingestPath, "--ingest-sha256", sha256File(ingestPath), "--out", out, ...(omitCensus ? [] : ["--census", censusPath, "--census-sha256", sha256File(censusPath)])];
  const r = spawnSync(process.execPath, argv, { encoding: "utf8" });
  return { status: r.status, stderr: r.stderr, out };
}

test("G2 · the m7 driver: refuses (exit 3, no receipt) without a census or with the Codex repro; accepts a fully bound run", () => {
  const goodCensus = { schema_version: G2_CENSUS_SCHEMA, window_id: "W-G2", ...PINS, population: CENSUS_POP };
  const t = Date.now();
  const goodInput = g2input({ started_at_ms: t - 400_000, ended_at_ms: t - 100_000 });
  const exists = (p) => { try { readFileSync(p); return true; } catch { return false; } };

  const noCensus = g2Cli({ census: goodCensus, ingest: goodInput, omitCensus: true });
  assert.equal(noCensus.status, 3); assert.match(noCensus.stderr, /REFUSED:MISSING_EDGE_CENSUS/); assert.equal(exists(noCensus.out), false);

  const repro = g2Cli({ census: goodCensus, ingest: { schema_version: G2_INPUT_SCHEMA, population: [{ feed_id: "f", venue: "v", kind: "trade", samples: 1.25, p95_ms: 10, max_ms: 1 }] } });
  assert.equal(repro.status, 3); assert.match(repro.stderr, /REFUSED:G2_/); assert.equal(exists(repro.out), false);

  const wrongWindow = g2Cli({ census: { ...goodCensus, window_id: "W-OTHER" }, ingest: goodInput });
  assert.equal(wrongWindow.status, 3); assert.match(wrongWindow.stderr, /CENSUS_WINDOW_MISMATCH/);

  const wrongRepin = g2Cli({ census: goodCensus, ingest: goodInput, repinOver: { edge_sha: "another-edge-sha" } });
  assert.equal(wrongRepin.status, 3); assert.match(wrongRepin.stderr, /SOURCE_PIN_MISMATCH/);

  const missingFeed = g2Cli({ census: goodCensus, ingest: { ...goodInput, population: goodInput.population.slice(1) } });
  assert.equal(missingFeed.status, 3); assert.match(missingFeed.stderr, /G2_POPULATION_MISSING/);

  const ok = g2Cli({ census: goodCensus, ingest: goodInput });
  assert.equal(ok.status, 0, ok.stderr);
  const receipt = JSON.parse(readFileSync(ok.out, "utf8"));
  assert.equal(receipt.results.original_gate_result, "ORIGINAL_GATE_MET_FOR_SUPPLIED_POPULATION");
  assert.equal(receipt.results.binding.apparatus_ref, PINS.apparatus_ref);
  assert.match(receipt.results.census_sha256, /^sha256:[0-9a-f]{64}$/);

  const notMet = g2Cli({ census: goodCensus, ingest: { ...goodInput, population: goodInput.population.map((r, i) => (i === 0 ? { ...r, p95_ms: 501, max_ms: 600 } : r)) } });
  assert.equal(notMet.status, 2, notMet.stderr);
});

/* ── quiet gate (apps/portal/frontend/e2e/quietGate.mjs): controlled time, no 15 s waits ─────────────────────────── */

function fakeClock(onTick = () => {}) {
  const c = { t: 1_000_000, sleeps: 0, inFlight: 0, lastActivity: 1_000_000 };
  c.now = () => c.t;
  c.sleep = async (ms) => { c.sleeps += 1; c.t += ms; onTick(c); };
  c.state = () => ({ inFlight: c.inFlight, lastActivity: c.lastActivity });
  return c;
}
const gate = (c, over = {}) => waitForQuiet({ quietMs: 400, capMs: 15_000, now: c.now, sleep: c.sleep, state: c.state, ...over });

test("quiet gate: genuine quiet resolves after the quiet interval, counted from the call", async () => {
  const c = fakeClock();
  c.lastActivity = c.t - 10_000; // old activity does not extend the window
  const r = await gate(c);
  assert.ok(r.waitedMs >= 400 && r.waitedMs < 500, `waited ${r.waitedMs}`);
});

test("quiet gate: a request that finishes inside the cap and then a quiet interval is a pass", async () => {
  const c = fakeClock((k) => { if (k.inFlight && k.t >= 1_000_000 + 2_000) { k.inFlight = 0; k.lastActivity = k.t; } });
  c.inFlight = 1;
  const r = await gate(c);
  assert.ok(r.waitedMs >= 2_400 && r.waitedMs < 2_600, `waited ${r.waitedMs}`);
});

test("quiet gate: a permanently pending request is MEASUREMENT_QUIET_TIMEOUT at the cap, never a normal return", async () => {
  const c = fakeClock();
  c.inFlight = 1;
  await assert.rejects(gate(c), (e) => {
    assert.ok(e instanceof MeasurementQuietTimeout);
    assert.equal(e.code, MEASUREMENT_QUIET_TIMEOUT);
    assert.equal(e.invalidMeasurement, true);
    assert.equal(e.detail.inFlight, 1);
    assert.equal(e.detail.capMs, 15_000);
    assert.ok(e.detail.waitedMs >= 15_000 && e.detail.waitedMs < 15_100, "the deadline is not extended");
    assert.match(e.message, /^MEASUREMENT_QUIET_TIMEOUT: INVALID_MEASUREMENT/);
    return true;
  });
});

test("quiet gate: recurring activity (nothing in flight, but never 400 ms still) is MEASUREMENT_QUIET_TIMEOUT", async () => {
  const c = fakeClock((k) => { if ((k.t - 1_000_000) % 300 === 0) k.lastActivity = k.t; });
  await assert.rejects(gate(c), (e) => e instanceof MeasurementQuietTimeout && e.detail.inFlight === 0 && e.detail.msSinceActivity < 400 && e.detail.waitedMs < 15_100);
});

test("quiet gate: the cap is the caller's, an injected short cap fails at that cap and no silent increase happens", async () => {
  const c = fakeClock();
  c.inFlight = 2;
  await assert.rejects(gate(c, { capMs: 1_500 }), (e) => e.detail.capMs === 1_500 && e.detail.waitedMs < 1_600);
  assert.ok(c.sleeps <= 31, `slept ${c.sleeps} steps`);
});

/* Deadline semantics: the cap is a deadline for ACHIEVING quiet (last activity + quiet <= call + cap), judged on the injected clock, not on the late wake-up. */
const T0 = 1_000_000;
/** Clock whose sleep jumps to the scripted wake times (a stalled event loop / a late page.waitForTimeout); activity timeline is a function of elapsed time. */
function scriptedClock({ wakes, activityAt, inFlightAt = () => 0 }) {
  const c = { t: T0, sleeps: 0, wakes: [...wakes] };
  c.now = () => c.t;
  c.sleep = async (ms) => { c.sleeps += 1; c.t = c.wakes.length ? T0 + c.wakes.shift() : c.t + ms; };
  c.state = () => { const a = activityAt(c.t - T0); return { inFlight: inFlightAt(c.t - T0), lastActivity: a === null ? T0 - 10_000 : T0 + a }; };
  return c;
}

test("quiet gate: DELAYED WAKE after the deadline cannot turn late activity into a pass (call 0, cap 15000, quiet 400, activity 14900, wake 15500)", async () => {
  const c = scriptedClock({ wakes: [15_500], activityAt: (t) => (t >= 14_900 ? 14_900 : null) });
  await assert.rejects(gate(c), (e) => {
    assert.ok(e instanceof MeasurementQuietTimeout);
    assert.equal(e.code, MEASUREMENT_QUIET_TIMEOUT);
    assert.equal(e.invalidMeasurement, true);
    assert.equal(e.detail.inFlight, 0, "nothing was in flight at the late wake; the rule is the quiet deadline, not in-flight");
    assert.equal(e.detail.waitedMs, 15_500);
    assert.equal(e.detail.msSinceActivity, 600, "600 ms since activity is >= 400 at the wake, which is what the old check accepted");
    assert.equal(e.detail.quietAchievableAtMs, 15_300, "quiet could only have held from 15300, which is after the 15000 cap");
    return true;
  });
  assert.equal(c.sleeps, 1);
});

test("quiet gate: exact-cap semantics are inclusive: activity at cap - quiet passes, one ms later is MEASUREMENT_QUIET_TIMEOUT (1 ms steps)", async () => {
  // Requests every 100 ms until `ms` (never quiet for 400 ms before it), the last one exactly at `ms`.
  const at = (ms) => scriptedClock({ wakes: [], activityAt: (t) => (t >= ms ? ms : Math.floor(t / 100) * 100) });
  const r = await gate(at(14_600), { stepMs: 1 });
  assert.equal(r.quietAchievedAtMs, 15_000, "quiet achieved exactly at the deadline");
  assert.equal(r.waitedMs, 15_000);
  await assert.rejects(gate(at(14_601), { stepMs: 1 }), (e) => e instanceof MeasurementQuietTimeout && e.code === MEASUREMENT_QUIET_TIMEOUT && e.detail.waitedMs === 15_000 && e.detail.msSinceActivity === 399 && e.detail.quietAchievableAtMs === 15_001);
});

test("quiet gate: the exact-cap boundary holds on a late wake too (activity at cap - quiet passes at wake 15500; one ms later fails)", async () => {
  const ok = scriptedClock({ wakes: [15_500], activityAt: (t) => (t >= 14_600 ? 14_600 : null) });
  const r = await gate(ok);
  assert.equal(r.quietAchievedAtMs, 15_000, "judged on the activity timestamp, not on the wake time");
  assert.equal(r.waitedMs, 15_500);
  const bad = scriptedClock({ wakes: [15_500], activityAt: (t) => (t >= 14_601 ? 14_601 : null) });
  await assert.rejects(gate(bad), (e) => e instanceof MeasurementQuietTimeout && e.detail.quietAchievableAtMs === 15_001);
});

test("quiet gate: pending work at a late wake is a timeout, and early quiet is not penalised by a late first wake", async () => {
  const pending = scriptedClock({ wakes: [15_500], activityAt: () => null, inFlightAt: (t) => (t >= 15_000 ? 1 : 0) });
  await assert.rejects(gate(pending), (e) => e instanceof MeasurementQuietTimeout && e.detail.inFlight === 1);
  const quiet = scriptedClock({ wakes: [20_000], activityAt: () => null });
  const r = await gate(quiet);
  assert.equal(r.quietAchievedAtMs, 400, "quiet counted from the call: achieved at call + quiet, well inside the cap");
});

test("quiet gate: a quiet interval longer than the cap can never pass", async () => {
  const c = fakeClock();
  await assert.rejects(gate(c, { quietMs: 2_000, capMs: 1_000 }), (e) => e instanceof MeasurementQuietTimeout && e.detail.quietAchievableAtMs === 2_000);
});
