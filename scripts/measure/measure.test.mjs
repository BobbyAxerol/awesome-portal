/** Unit tests for the ELP2-10 measurement harness libraries (node --test scripts/measure/measure.test.mjs). No network, no Docker. */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { evaluateG2, G2_INPUT_SCHEMA } from "./lib/g2.mjs";
import { buildReceipt, canonical, percentile, sha256File, summarize } from "./lib/receipt.mjs";
import { buildSchedule, offeredPeak, resolvePath, runReplay, validateWorkload } from "./lib/replay.mjs";
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

test("the original G2 gate is applied per feed, with a different max for trade and quote / mark", () => {
  const row = (kind, p95, max) => ({ feed_id: `f-${kind}`, venue: "v", kind, samples: 10, p95_ms: p95, max_ms: max });
  const met = evaluateG2({ schema_version: G2_INPUT_SCHEMA, population: [row("trade", 500, 1499), row("quote", 100, 999), row("mark", 1, 1)] });
  assert.equal(met.original_gate_result, "ORIGINAL_GATE_MET_FOR_SUPPLIED_POPULATION");
  const bad = evaluateG2({ schema_version: G2_INPUT_SCHEMA, population: [row("trade", 501, 10), row("quote", 100, 1000), row("trade", 10, 1500)] });
  assert.equal(bad.failing.length, 3);
  assert.throws(() => evaluateG2({ schema_version: "x", population: [] }), /G2_INPUT_SCHEMA/);
  assert.throws(() => evaluateG2({ schema_version: G2_INPUT_SCHEMA, population: [] }), /G2_POPULATION_EMPTY/);
});
