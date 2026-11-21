#!/usr/bin/env node
// Real, named Portal API proof in the owned :8098 cell, never direct SQL/engine.
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
const baselineName = process.env.RESEARCH_E13_BASELINE_RECEIPT;
if (baselineName) assert.match(baselineName, /^e13-api-[a-f0-9-]+\.json$/);
const baseline = baselineName ? JSON.parse(readFileSync(join(directory, baselineName), "utf8")) : null;
const receiptId = randomUUID(), responses = {}, jar = new Map();
const rootId = baseline?.run_ids?.root ?? "rrun_71d45ff4b86492bb5f526e272fcb5112";
let cloneId = baseline?.run_ids?.clone, reproductionId = baseline?.run_ids?.reproduction, verdict = "FAILED";
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
async function ready(label, runId) {
  const deadline = Date.now() + 360_000; let previous;
  while (Date.now() < deadline) {
    const progress = await call(label, "GET", `/api/v1/research/runs/${runId}/progress`);
    const state = progress.current.effective_status;
    if (state !== previous) { console.log("E13", label, runId, state); previous = state; }
    assert(!["FAILED", "CANCELLED"].includes(state), JSON.stringify(progress.current.failure ?? progress.current));
    if (state === "COMPLETED" && progress.current.terminal_materialization !== "PENDING") return;
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  assert.fail("Bounded child did not finish before deadline");
}
try {
  assert.equal((await call("auth", "GET", "/api/auth/context")).state, "AUTHENTICATED");
  const binding = await call("binding", "POST", "/api/v1/research/run-producer/p04-delta/install", {});
  const release = (await call("atlas", "GET", "/api/v1/research/quantbt/atlas")).atlas.current_release;
  const spec = {
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
  const lineagePath = `/api/v1/research/alphas/${binding.alpha_id}/lineage?limit=128`;
  const before = await call("lineage_before", "GET", lineagePath);
  const originalReport = await call("original_report", "GET", `/api/v1/quantbt/runs/${rootId}/report`);
  if (!cloneId) {
    const preflight = await call("clone_preflight", "POST", "/api/v1/research/preflights", { requested_spec: spec }, 201);
    assert.equal(preflight.may_create_run, true);
    const request = { schema_version: "research.run-create.v1", client_intent_id: `e13-clone-${receiptId}`,
      preflight_token: preflight.preflight_token, requested_spec: spec, intent_kind: "CLONE_FOR_EXPERIMENT",
      lineage: { relation: "CLONE_OF", parent_run_id: rootId } };
    cloneId = (await call("clone_create", "POST", "/api/v1/research/runs", request, 202)).run_id;
    const retry = await call("clone_retry", "POST", "/api/v1/research/runs", request, 202);
    assert.equal(retry.run_id, cloneId); assert.equal(retry.replayed, true);
  }
  await ready("clone_progress", cloneId);
  if (!reproductionId) {
    const preflight = await call("reproduction_preflight", "POST", "/api/v1/research/preflights", { requested_spec: spec }, 201);
    assert.equal(preflight.may_create_run, true);
    const request = { schema_version: "research.run-create.v1", client_intent_id: `e13-reproduce-${receiptId}`,
      preflight_token: preflight.preflight_token, requested_spec: spec, intent_kind: "REPRODUCE_EXISTING",
      lineage: { relation: "REPRODUCTION_OF", parent_run_id: cloneId } };
    const created = await call("reproduction_create", "POST", "/api/v1/research/runs", request, 202);
    reproductionId = created.run_id;
    assert.equal(created.reproduction.parent_run_id, cloneId);
    assert.equal(created.reproduction.pin_scope, "IMMUTABLE_INPUT_PINS");
    assert.equal(created.reproduction.environment_equivalence.state, "NOT_PUBLISHED");
    const retry = await call("reproduction_retry", "POST", "/api/v1/research/runs", request, 202);
    assert.equal(retry.run_id, reproductionId); assert.equal(retry.replayed, true);
  }
  await ready("reproduction_progress", reproductionId);
  const after = await call("lineage_after", "GET", lineagePath);
  const nodes = [rootId, cloneId, reproductionId].map(id => after.attempts.find(node => node.primary_run.run_id === id));
  assert(nodes.every(Boolean), "All three actual runs must be returned in one persisted graph");
  assert.equal(nodes[1].parent_attempt_id, nodes[0].attempt_id);
  assert.equal(nodes[2].parent_attempt_id, nodes[1].attempt_id);
  assert.equal(nodes[1].intent_kind, "CLONE_FOR_EXPERIMENT");
  assert.equal(nodes[2].intent_kind, "REPRODUCE_EXISTING");
  assert.equal(nodes[2].semantic_diff.state, "AVAILABLE");
  assert.deepEqual(nodes[2].semantic_diff.changes, []);
  for (const pin of ["effective_spec_digest", "engine_release_id", "dataset_binding_digest", "execution_profile_id"]) {
    assert.equal(nodes[2].primary_run[pin], nodes[1].primary_run[pin], pin);
  }
  if (!baseline?.run_ids?.reproduction) assert.equal(after.counts.total_attempts, before.counts.total_attempts + (baseline?.run_ids?.clone ? 1 : 2));
  const changed = structuredClone(spec); changed.windows.is.start = "2026-06-02T00:00:00Z";
  const negativePreflight = await call("negative_preflight", "POST", "/api/v1/research/preflights", { requested_spec: changed }, 201);
  assert.equal(negativePreflight.may_create_run, true);
  const refusal = await call("changed_pins", "POST", "/api/v1/research/runs", {
    schema_version: "research.run-create.v1", client_intent_id: `e13-refuse-${receiptId}`,
    preflight_token: negativePreflight.preflight_token, requested_spec: changed, intent_kind: "REPRODUCE_EXISTING",
    lineage: { relation: "REPRODUCTION_OF", parent_run_id: cloneId },
  }, 409);
  assert.equal(refusal.error.code, "RESEARCH_RUN_REPRODUCTION_CONFLICT");
  const missing = await call("missing_parent", "POST", "/api/v1/research/runs", {
    schema_version: "research.run-create.v1", client_intent_id: `e13-missing-${receiptId}`,
    preflight_token: negativePreflight.preflight_token, requested_spec: changed, intent_kind: "REPRODUCE_EXISTING",
    lineage: { relation: "REPRODUCTION_OF", parent_run_id: "rrun_not_in_this_workspace" },
  }, 404);
  assert.equal(missing.error.code, "RESEARCH_RUN_NOT_FOUND");
  const final = await call("lineage_final", "GET", lineagePath);
  assert.equal(final.counts.total_attempts, after.counts.total_attempts);
  assert.deepEqual((await call("original_report_reread", "GET", `/api/v1/quantbt/runs/${rootId}/report`)).frozen_core, originalReport.frozen_core);
  if (baseline?.verdict === "PASS") {
    for (const id of [rootId, cloneId, reproductionId]) {
      const old = baseline.responses.lineage_final.body.attempts.find(node => node.primary_run.run_id === id);
      const current = final.attempts.find(node => node.primary_run.run_id === id);
      assert.deepEqual(current, old, "Persisted graph changed across a read-only restart proof");
    }
    assert.deepEqual(final.counts, baseline.responses.lineage_final.body.counts);
    console.log("E13_RESTART_PARITY_PASS");
  }
  verdict = "PASS";
  console.log("E13_REAL_LINEAGE_PASS", rootId, cloneId, reproductionId);
} finally {
  const document = JSON.stringify({ schema_version: "research.e13.real-api-receipt.v1", recorded_at_utc: new Date().toISOString(),
    verdict, run_ids: { root: rootId, clone: cloneId ?? null, reproduction: reproductionId ?? null },
    qualification_images: { control_api: process.env.RESEARCH_E13_CONTROL_IMAGE ?? null, worker: process.env.RESEARCH_E13_WORKER_IMAGE ?? null },
    responses }, null, 2) + "\n";
  const name = `e13-api-${receiptId}.json`;
  writeFileSync(join(directory, name), document, { mode: 0o600 });
  console.log("E13 receipt", name, "sha256", createHash("sha256").update(document).digest("hex"), verdict);
}
