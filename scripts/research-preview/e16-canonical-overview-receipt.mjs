#!/usr/bin/env node
// Real named API proof in the owned :8098 cell. Never direct DB/engine.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const directory = process.env.RESEARCH_E17_RECEIPT_DIR;
assert(directory?.startsWith("/home/bobby/.local/state/portal-research-e17/"));
const settings = Object.fromEntries(readFileSync(join(directory, "receipt.env"), "utf8").trim().split("\n")
  .map(line => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
assert.equal(settings.PORTAL_STACK_NAME, "portal-research-e17");
const base = settings.PORTAL_PUBLIC_ORIGIN;
assert.equal(base, "http://127.0.0.1:8098");
const baselineName = process.env.RESEARCH_E16_BASELINE_RECEIPT;
if (baselineName) assert.match(baselineName, /^e16-api-[a-f0-9-]+\.json$/);
const baseline = baselineName ? JSON.parse(readFileSync(join(directory, baselineName), "utf8")) : null;
const receiptId = randomUUID(), responses = {}, jar = new Map();
let runId = baseline?.run_id, verdict = "FAILED";
const legacyRun = "rrun_71d45ff4b86492bb5f526e272fcb5112";
async function call(label, method, path, body, status = 200) {
  const response = await fetch(base + path, { method, signal: AbortSignal.timeout(45_000), headers: {
    origin: base, "content-type": "application/json", "x-dev-access-email": "e17-owner@azdag.com",
    cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "),
    ...(method !== "GET" ? { "x-portal-csrf": jar.get("__Host-portal_csrf") ?? "" } : {}),
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0], boundary = pair.indexOf("="); jar.set(pair.slice(0, boundary), pair.slice(boundary + 1));
  }
  const value = await response.json(); responses[label] = { status: response.status, body: value };
  assert.equal(response.status, status, `${label}: ${JSON.stringify(value.error ?? { schema_version: value.schema_version })}`);
  return value;
}
try {
  assert.equal((await call("auth", "GET", "/api/auth/context")).state, "AUTHENTICATED");
  const binding = await call("binding", "POST", "/api/v1/research/run-producer/p04-delta/install", {});
  const release = (await call("atlas", "GET", "/api/v1/research/quantbt/atlas")).atlas.current_release;
  const requestedSpec = {
    schema_version: "research.requested-spec.v1", alpha_binding: { alpha_id: binding.alpha_id, alpha_version_id: binding.alpha_version_id },
    not_publishable: false, strategy_id: binding.alpha_id, execution_route: "signal_notional", route_params: {},
    data: { dataset_id: "crypto-binance-1m", symbol: "BTCUSDT", timeframe: "1h" },
    protocol: "three_window_decay", windows: {
      is: { start: "2026-06-01T00:00:00Z", end_exclusive: "2026-06-08T00:00:00Z" },
      oos: { start: "2026-06-08T00:00:00Z", end_exclusive: "2026-06-15T00:00:00Z" },
      holdout: { start: "2026-06-15T00:00:00Z", end_exclusive: "2026-06-17T00:00:00Z" },
    }, optimization_mode: "mode_1_decay", optimization_schedule: "global", parameter_space_overrides: [],
    optuna_trials: 1, early_stopping: null, random_seed: null, optimization_config: {},
    client: { engine_release_id: release.release_id, config_digest: release.config_digest },
  };
  if (!runId) {
    const preflight = await call("preflight", "POST", "/api/v1/research/preflights", { requested_spec: requestedSpec }, 201);
    assert.equal(preflight.may_create_run, true);
    runId = (await call("create", "POST", "/api/v1/research/runs", {
      schema_version: "research.run-create.v1", client_intent_id: `e16-${receiptId}`,
      preflight_token: preflight.preflight_token, requested_spec: requestedSpec,
    }, 202)).run_id;
  }
  assert.match(runId, /^rrun_[a-f0-9]{32}$/);
  const deadline = Date.now() + 360_000;
  while (true) {
    const progress = await call("progress", "GET", `/api/v1/research/runs/${runId}/progress`);
    assert(!["FAILED", "CANCELLED"].includes(progress.current.effective_status), JSON.stringify(progress.current.terminal_reason ?? progress.current));
    if (progress.current.effective_status === "COMPLETED" && progress.current.terminal_materialization !== "PENDING") break;
    assert(Date.now() < deadline, "P04 child exceeded bounded deadline");
    console.log("E16", runId, progress.current.effective_status);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  const replayPath = `/api/v1/quantbt/runs/${runId}/execute/replay`;
  const first = await call("replay", "GET", replayPath + "?limit=2");
  const overview = first.candle_overview;
  assert.equal(first.route.replay_contract, "P17_CURRENT_P04_EQUITY_SAMPLE_V1");
  assert.equal(overview.state, "AVAILABLE"); assert.equal(overview.reason_code, null);
  assert.equal(overview.scope, "OOS_EQUITY_WINDOW"); assert(overview.values.length > 0 && overview.values.length <= 48);
  assert.equal(overview.source_bar_count, 168);
  assert.equal(overview.source_bar_count, first.equity_replay.source_observation_count);
  assert.equal(overview.emitted_bucket_count, overview.values.length);
  assert(overview.values.every(bucket => bucket.transitions === null));
  assert.equal(overview.values[0].first_ordinal, 0);
  assert.equal(overview.values.at(-1).last_ordinal, 167);
  assert.equal(Number(overview.envelope.max_high), Math.max(...overview.values.map(bucket => Number(bucket.high))));
  assert.equal(Number(overview.envelope.min_low), Math.min(...overview.values.map(bucket => Number(bucket.low))));
  for (const marker of ["orders", "fills", "trades", "candle_windows"]) assert.equal(first.route_capabilities[marker].state, "NOT_PUBLISHED");
  assert(Buffer.byteLength(JSON.stringify(first)) <= 64 * 1024);
  const next = await call("next", "GET", replayPath + `?limit=2&cursor=${encodeURIComponent(first.equity_replay.page.next_cursor)}`);
  const item = next.equity_replay.items[0]; assert.equal(item.playback_ordinal, 2);
  const seek = await call("seek", "GET", replayPath + `?limit=2&at=${encodeURIComponent(item.playback_cursor)}`);
  assert.equal(seek.equity_replay.state_at_cursor.playback_ordinal, item.playback_ordinal);
  assert.equal(seek.equity_replay.state_at_cursor.at_utc_ms, item.at_utc_ms);
  await call("cross_run_cursor", "GET", `/api/v1/quantbt/runs/${legacyRun}/execute/replay?at=${encodeURIComponent(item.playback_cursor)}`, undefined, 400);
  const hub = await call("hub", "GET", `/api/v1/quantbt/runs/${runId}/evidence`);
  assert.equal(hub.core.source_adapter_id, "p04.delta-rsi.v1");
  assert.equal(hub.summary_analytics.in_sample_equity.state, "AVAILABLE");
  assert.equal(hub.summary_analytics.net_oos_return.state, "AVAILABLE");
  const freeze = await call("freeze", "GET", `/api/v1/quantbt/runs/${runId}/freeze`);
  assert.equal(freeze.engine_pin.state, "AVAILABLE");
  assert.equal(freeze.engine_pin.engine_version, "1.1.1");
  assert.equal(freeze.engine_pin.execution_adapter_id, "p04.delta-rsi.v1");
  assert.match(freeze.engine_pin.adapter_contract_digest, /^[a-f0-9]{64}$/);
  assert.equal(freeze.engine_pin.adapter_contract_digest, freeze.provenance.adapter_contract_digest);
  const legacy = await call("legacy", "GET", `/api/v1/quantbt/runs/${legacyRun}/execute/replay?limit=2`);
  assert.equal(legacy.candle_overview.state, "AVAILABLE", "Do not discard OHLC already retained in the legacy shape");
  assert.equal(legacy.candle_overview.emitted_bucket_count, 12);
  assert(legacy.candle_overview.values.every(bucket => bucket.transitions === null));
  const reread = await call("reread", "GET", replayPath + "?limit=2");
  assert.deepEqual(reread.candle_overview, overview);
  assert.equal(reread.provenance.evidence_revision, first.provenance.evidence_revision);
  if (baseline) {
    assert.equal(baseline.verdict, "PASS"); assert.equal(baseline.run_id, runId);
    assert.deepEqual(overview, baseline.responses.replay.body.candle_overview);
    assert.deepEqual(hub.summary_analytics, baseline.responses.hub.body.summary_analytics);
    assert.deepEqual(freeze.engine_pin, baseline.responses.freeze.body.engine_pin);
    assert.deepEqual(legacy.candle_overview, baseline.responses.legacy.body.candle_overview);
    console.log("E16_RESTART_PARITY_PASS", runId);
  }
  verdict = "PASS";
  console.log("E16_CANONICAL_REAL_API_PASS", runId, overview.emitted_bucket_count, "buckets");
} finally {
  const document = JSON.stringify({ schema_version: "research.e16.real-api-receipt.v1", recorded_at_utc: new Date().toISOString(),
    verdict, run_id: runId ?? null, source_sha: process.env.RESEARCH_E16_SOURCE_SHA ?? null,
    images: { control_api: process.env.RESEARCH_E16_CONTROL_IMAGE ?? null, worker: process.env.RESEARCH_E16_WORKER_IMAGE ?? null }, responses }, null, 2) + "\n";
  const name = `e16-api-${receiptId}.json`;
  writeFileSync(join(directory, name), document, { mode: 0o600 });
  console.log("E16 receipt", name, "sha256", createHash("sha256").update(document).digest("hex"), verdict);
}
