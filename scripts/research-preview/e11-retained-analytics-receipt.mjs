#!/usr/bin/env node
// Named Portal API proof in the owned :8098 cell; never a direct engine test.
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const directory = process.env.RESEARCH_E17_RECEIPT_DIR;
assert(directory?.startsWith("/home/bobby/.local/state/portal-research-e17/"));
const settings = Object.fromEntries(readFileSync(join(directory, "receipt.env"), "utf8").trim().split("\n")
  .map(line => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
assert.equal(settings.PORTAL_STACK_NAME, "portal-research-e17");
assert.equal(settings.PORTAL_PUBLIC_ORIGIN, "http://127.0.0.1:8098");
const base = settings.PORTAL_PUBLIC_ORIGIN;
const wfo = process.env.RESEARCH_E11_PROFILE === "WFO";
const jar = new Map(), responses = {}, receiptId = randomUUID();
let runId;
async function call(label, method, path, body) {
  const response = await fetch(base + path, { method, signal: AbortSignal.timeout(45_000), headers: {
    origin: base, "content-type": "application/json", "x-dev-access-email": "e17-owner@azdag.com",
    cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "),
    ...(method !== "GET" ? { "x-portal-csrf": jar.get("__Host-portal_csrf") ?? "" } : {}),
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0], boundary = pair.indexOf("="); jar.set(pair.slice(0, boundary), pair.slice(boundary + 1));
  }
  const value = await response.json(); responses[label] = { status: response.status, body: value };
  assert(response.ok, `${label}: ${response.status} ${JSON.stringify(value.error ?? value)}`);
  return value;
}
try {
  const auth = await call("auth", "GET", "/api/auth/context"); assert.equal(auth.state, "AUTHENTICATED");
  const binding = await call("binding", "POST", "/api/v1/research/run-producer/p04-delta/install", {});
  const atlas = await call("atlas", "GET", "/api/v1/research/quantbt/atlas");
  const release = atlas.atlas.current_release;
  const requested_spec = {
    schema_version: "research.requested-spec.v1", alpha_binding: { alpha_id: binding.alpha_id, alpha_version_id: binding.alpha_version_id },
    not_publishable: false, strategy_id: binding.alpha_id, execution_route: "signal_notional", route_params: {},
    data: { dataset_id: "crypto-binance-1m", symbol: "BTCUSDT", timeframe: "1h" },
    ...(wfo ? { protocol: "advanced", walk_forward: { start: "2026-06-01T00:00:00Z", end_exclusive: "2026-09-01T00:00:00Z",
      split_mode: "2026-06-15T00:00:00Z", frequency: "weekly", window_mode: "expanding" } }
    : { protocol: "three_window_decay", windows: {
      is: { start: "2026-06-01T00:00:00Z", end_exclusive: "2026-06-08T00:00:00Z" },
      oos: { start: "2026-06-08T00:00:00Z", end_exclusive: "2026-06-15T00:00:00Z" },
      holdout: { start: "2026-06-15T00:00:00Z", end_exclusive: "2026-06-17T00:00:00Z" } } }),
    optimization_mode: "mode_1_decay", optimization_schedule: "global", parameter_space_overrides: [],
    optuna_trials: wfo ? 3 : 1, early_stopping: null, random_seed: wfo ? 42 : null, optimization_config: {},
    client: { engine_release_id: release.release_id, config_digest: release.config_digest },
  };
  const existing = process.env.RESEARCH_E11_EXISTING_RUN;
  if (existing) { assert.match(existing, /^rrun_[a-f0-9]{32}$/); runId = existing; }
  else {
    const preflight = await call("preflight", "POST", "/api/v1/research/preflights", { requested_spec });
    assert.equal(preflight.may_create_run, true, JSON.stringify(preflight.run_admission));
    const created = await call("create", "POST", "/api/v1/research/runs", { schema_version: "research.run-create.v1",
      client_intent_id: `e11-${receiptId}`, preflight_token: preflight.preflight_token, requested_spec });
    runId = created.run_id; assert.match(runId, /^rrun_[a-f0-9]{32}$/);
  }
  console.log("E11 admitted", wfo ? "WFO" : "FIXED", runId);
  let terminal = false, last = "";
  const deadline = Date.now() + 360_000;
  while (Date.now() < deadline) {
    const progress = await call("progress", "GET", `/api/v1/research/runs/${runId}/progress`);
    const state = progress.current.effective_status;
    if (state !== last) { console.log("E11 progress", state, "seq", progress.current.source_latest_sequence); last = state; }
    assert(!["FAILED", "CANCELLED"].includes(state), `Child failed: ${JSON.stringify(progress.current.failure ?? progress.current)}`);
    if (state === "COMPLETED" && progress.current.terminal_materialization !== "PENDING") { terminal = true; break; }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  assert(terminal, "Bounded child did not finish before deadline");
  const path = wfo ? "current-source/evidence" : "evidence";
  const evidence = await call("evidence", "GET", `/api/v1/quantbt/runs/${runId}/${path}`);
  const facts = evidence.summary_analytics; assert(facts, "The source-time analytics were not retained/exposed");
  assert(wfo ? evidence.provenance?.profile_id === "rs02.delta-signal-notional-wfo.v1"
    : evidence.core?.source_adapter_id === "p04.delta-rsi.v1", "Do not substitute another execution profile");
  assert.equal(facts.schema_version, "research.retained-analytics.v1");
  assert.equal(facts.net_oos_return.state, "AVAILABLE"); assert.equal(facts.net_oos_return.scope, "OOS");
  assert.equal(facts.total_trade_count.scope, "CHILD_TAPE");
  assert.equal(Object.keys(facts.behaviour).length, 6);
  assert(facts.in_sample_equity.points.length <= 24 && facts.rolling_sharpe_63.points.length <= 12);
  assert.equal(facts.in_sample_equity.state, wfo ? "NOT_PUBLISHED" : "AVAILABLE");
  if (wfo) {
    assert.equal(facts.rolling_sharpe_63.state, "AVAILABLE", "A long real run must qualify the engine rolling lane");
    assert(facts.rolling_sharpe_63.daily_return_count >= 63);
    assert.equal(evidence.source_absences.rolling_sharpe, undefined);
  }
  for (const metric of Object.values(facts.behaviour)) {
    assert.equal(metric.state === "AVAILABLE", metric.value !== null);
    assert.equal(metric.state === "AVAILABLE", metric.reason_code === null);
  }
  const library = await call("library", "GET", `/api/v1/quantbt/runs?ids=${runId}`);
  const card = library.items.find(item => item.run_id === runId);
  assert(card, "The named Library read must contain this exact retained run");
  assert.equal(card.status, "COMPLETED");
  if (wfo) {
    for (const role of ["OOS_SHARPE", "DECAY", "TRADE_COUNT"]) {
      const metric = card.stats.find(item => item.role === role);
      assert.equal(metric?.availability.state, "AVAILABLE", `${role} was not hydrated from the real retained seal`);
      assert.notEqual(metric.value, null);
      assert(metric.definition_id?.startsWith("research.current-source.v1."));
    }
  }
  const sparkline = await call("sparkline", "GET", `/api/v1/quantbt/runs/${runId}/sparkline`);
  assert.equal(sparkline.availability.state, "AVAILABLE");
  assert(sparkline.values.length > 0 && sparkline.values.length <= 24);
  assert.equal(sparkline.source.lane, wfo ? "PORTAL_RETAINED_CURRENT_SOURCE" : "PORTAL_PERSISTED_RESEARCH");
  const split = await call("split", "GET", `/api/v1/quantbt/runs/${runId}/${wfo ? "current-source/" : ""}split`);
  const search = await call("search", "GET", `/api/v1/quantbt/runs/${runId}/${wfo ? "current-source/" : ""}search${wfo ? "?limit=5" : ""}`);
  if (wfo) {
    assert.equal(split.stitch.state, "AVAILABLE");
    assert.match(split.stitch.digest, /^[a-f0-9]{64}$/);
    assert.equal(split.stitch.basis, "PORTAL_DIGEST_OF_RETAINED_FOLD_SEGMENTS_V1");
    assert.equal(split.stitch.boundary_check, "MATCH");
    assert.equal(split.gap_scan.state, "AVAILABLE");
    assert.equal(split.gap_scan.basis, "QUANTBT_ACCOUNT_EXECUTION_PLAN_BOUNDARY_EVENTS_V1");
    assert(search.candidates.rows.length > 0);
    assert.equal(search.pool.feasible.state, "NOT_APPLICABLE");
    assert.equal(search.pool.feasible.value, null);
    assert.equal(search.pool.feasible.reason_code, "QUANTBT_WALK_FORWARD_STUDY_DECLARES_NO_CONSTRAINTS");
    for (const candidate of search.candidates.rows) {
      const dd = candidate.max_drawdown;
      assert.equal(dd.state === "AVAILABLE", dd.value !== null);
      assert.equal(dd.state === "AVAILABLE", dd.reason_code === null);
    }
  } else {
    assert.equal(search.requested_optimizer.state, "DECLARED_NOT_EXECUTED");
  }
  const report = await call("report", "GET", `/api/v1/quantbt/runs/${runId}/report`);
  const core = report.frozen_core ?? report.report?.frozen_core ?? report.core;
  assert(core, "The report did not publish its frozen core");
  assert.equal(core.headline[0].value, facts.net_oos_return.value);
  assert.equal(core.headline[0].scope, "OOS");
  const reread = await call("evidence_reread", "GET", `/api/v1/quantbt/runs/${runId}/${path}`);
  assert.deepEqual(reread.summary_analytics, facts);
  const baselineName = process.env.RESEARCH_E11_BASELINE_RECEIPT;
  if (baselineName) {
    assert.match(baselineName, /^e11-e14-api-[a-f0-9-]+\.json$/);
    const baseline = JSON.parse(readFileSync(join(directory, baselineName), "utf8"));
    assert.equal(baseline.run_id, runId);
    assert.deepEqual(facts, baseline.responses.evidence.body.summary_analytics);
    assert.deepEqual(core, baseline.responses.report.body.frozen_core);
    assert.deepEqual(sparkline.values, baseline.responses.sparkline.body.values);
    assert.deepEqual(card.stats, baseline.responses.library.body.items.find(item => item.run_id === runId).stats);
    console.log("E11_RESTART_PARITY_PASS", runId);
  }
  console.log("E11_E14_REAL_BACKEND_RECEIPT_PASS", runId, "IS", facts.in_sample_equity.state, "rolling", facts.rolling_sharpe_63.state);
} finally {
  const document = JSON.stringify({ schema_version: "research.e11.e14.real-api-receipt.v1", profile: wfo ? "WFO" : "FIXED",
    recorded_at_utc: new Date().toISOString(), run_id: runId ?? null, responses }, null, 2) + "\n";
  writeFileSync(join(directory, `e11-e14-api-${receiptId}.json`), document, { mode: 0o600 });
  console.log("E11 private receipt sha256", createHash("sha256").update(document).digest("hex"));
}
