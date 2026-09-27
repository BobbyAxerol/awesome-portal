#!/usr/bin/env node
// E17 real import -> admission -> confined child -> retention -> named reads.
// Run only on the disposable portal-research-e17 backend cell (:8098).
// No credentials/cookies/source paths are written into the return packet.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const directory = process.env.RESEARCH_E17_RECEIPT_DIR;
assert(directory && directory.startsWith("/home/bobby/.local/state/portal-research-e17/"), "Use the private E17 evidence directory");
const settings = Object.fromEntries(readFileSync(join(directory, "receipt.env"), "utf8").trim().split("\n")
  .map(line => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
assert.equal(settings.PORTAL_STACK_NAME, "portal-research-e17");
assert.equal(settings.PORTAL_PUBLIC_ORIGIN, "http://127.0.0.1:8098");
const base = settings.PORTAL_PUBLIC_ORIGIN;
const cookies = new Map();
const responses = {};
async function call(label, method, path, body) {
  const response = await fetch(base + path, { method, signal: AbortSignal.timeout(45_000), headers: {
    origin: base, "content-type": "application/json", "x-dev-access-email": "e17-owner@azdag.com",
    cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "),
    ...(method !== "GET" ? { "x-portal-csrf": cookies.get("__Host-portal_csrf") ?? "" } : {}),
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0], boundary = pair.indexOf("=");
    cookies.set(pair.slice(0, boundary), pair.slice(boundary + 1));
  }
  const json = await response.json();
  responses[label] = { status: response.status, body: json };
  assert(response.ok, `${label}: ${response.status} ${JSON.stringify(json.error ?? json)}`);
  return json;
}
const source = `ALPHA_CONTRACT = {
    "schema_version": "research.alpha-source.v1", "version": "0.3.0",
    "entrypoint": "generate_signals", "timeframes": ["1h"],
    "required_columns": ["open", "high", "low", "close", "volume"],
    "warmup_bars": 2, "determinism": {"seed_required": True},
    "parameter_space": {"scale": {"kind": "fixed", "value": 1000}},
}
def generate_signals(context):
    history = context["history"]["close"]
    direction = 1 if history[-1] >= history[-2] else -1
    return {
        "schema_version": "research.imported-signal-notional-output.v1",
        "signal_notional": direction * context["parameters"]["scale"],
    }
`;
const sourceDigest = createHash("sha256").update(source).digest("hex");
const seed = Number(process.env.RESEARCH_E17_SEED ?? "7");
assert(Number.isSafeInteger(seed) && seed >= 0 && seed <= 2_147_483_647);
const attempt = randomUUID();
let runId;
try {
  const auth = await call("auth", "GET", "/api/auth/context");
  assert.equal(auth.state, "AUTHENTICATED");
  const existingVersion = process.env.RESEARCH_E17_EXISTING_VERSION;
  let registration;
  if (existingVersion) {
    assert.match(existingVersion, /^av_[A-Za-z0-9_.-]+$/);
    const registry = await call("existing_registry", "GET", "/api/v1/research/alphas");
    registration = registry.entries.find(entry => entry.alpha_version_id === existingVersion);
    assert(registration, "Existing immutable AlphaVersion was not found");
    assert.equal(registration.source_digest, sourceDigest, "Do not substitute different source bytes");
  } else {
    const parsed = await call("parse", "POST", "/api/v1/research/alphas/import/parse", {
      original_filename: "e17-qualification.py", source_text: source, expected_source_digest: sourceDigest,
    });
    const gates = await call("gates", "POST", "/api/v1/research/alphas/import/gates", { source_file_ref: parsed.source_file_ref });
    assert.equal(gates.all_pass, true);
    registration = await call("register", "POST", "/api/v1/research/alphas/import/register", {
      source_file_ref: parsed.source_file_ref, gate_receipt_id: gates.gate_receipt_id,
      alpha_id: "e17-qualification-" + attempt.slice(0, 8),
    });
  }
  assert.equal(registration.lifecycle_state, "DRAFT");
  const atlas = await call("atlas", "GET", "/api/v1/research/quantbt/atlas");
  const release = atlas.atlas.current_release;
  const requested_spec = {
    schema_version: "research.requested-spec.v1",
    alpha_binding: { alpha_id: registration.alpha_id, alpha_version_id: registration.alpha_version_id },
    strategy_id: registration.alpha_id, not_publishable: false, execution_route: "signal_notional", route_params: {},
    data: { dataset_id: "crypto-binance-1m", symbol: "BTCUSDT", timeframe: "1h" },
    protocol: "three_window_decay", windows: {
      is: { start: "2026-06-01T00:00:00Z", end_exclusive: "2026-06-08T00:00:00Z" },
      oos: { start: "2026-06-08T00:00:00Z", end_exclusive: "2026-06-15T00:00:00Z" },
      holdout: { start: "2026-06-15T00:00:00Z", end_exclusive: "2026-06-17T00:00:00Z" },
    },
    optimization_mode: "mode_1_decay", optimization_schedule: "global", parameter_space_overrides: [],
    optuna_trials: 1, early_stopping: null, random_seed: seed, optimization_config: {},
    client: { engine_release_id: release.release_id, config_digest: release.config_digest },
  };
  const parentRun = process.env.RESEARCH_E17_PARENT_RUN;
  if (parentRun) assert.match(parentRun, /^rrun_[a-f0-9]{32}$/);
  const existingRun = process.env.RESEARCH_E17_EXISTING_RUN;
  if (existingRun) {
    assert(existingVersion, "Reread must name the immutable AlphaVersion");
    assert.match(existingRun, /^rrun_[a-f0-9]{32}$/);
    runId = existingRun;
  } else {
    const preflight = await call("preflight", "POST", "/api/v1/research/preflights", { requested_spec });
    assert.equal(preflight.may_create_run, true, JSON.stringify(preflight.run_admission));
    const created = await call("create", "POST", "/api/v1/research/runs", {
      schema_version: "research.run-create.v1", client_intent_id: "e17-real-" + attempt,
      preflight_token: preflight.preflight_token, requested_spec,
      ...(parentRun ? { intent_kind: "CLONE_FOR_EXPERIMENT", lineage: { relation: "CLONE_OF", parent_run_id: parentRun } } : {}),
    });
    runId = created.run_id;
  }
  assert.match(runId, /^rrun_/);
  console.log(existingRun ? "E17 retained DRAFT run reread" : "E17 DRAFT admitted", runId, "av", registration.alpha_version_id);
  const deadline = Date.now() + 360_000;
  let terminal = false;
  while (Date.now() < deadline) {
    const progress = await call("progress", "GET", `/api/v1/research/runs/${runId}/progress`);
    const status = progress.current.effective_status;
    console.log("E17 progress", status, "seq", progress.current.source_latest_sequence);
    if (["FAILED", "CANCELLED"].includes(status)) throw new Error("Imported child did not complete: " + status);
    if (status === "COMPLETED" && progress.current.terminal_materialization !== "PENDING") { terminal = true; break; }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  assert(terminal, "E17 child/retention did not reach terminal materialization before the deadline");
  for (const operation of ["evidence", "split", "search", "freeze", "replay"]) {
    const path = operation === "replay" ? "execute/replay" : operation;
    await call(operation, "GET", `/api/v1/quantbt/runs/${runId}/${path}`);
  }
  await call("report", "GET", `/api/v1/quantbt/runs/${runId}/report`);
  assert.equal(responses.evidence.body.core.source_adapter_id, "p17.imported-signal-notional.v1");
  assert.equal(responses.freeze.body.imported_alpha.source_digest, sourceDigest);
  assert.equal(responses.freeze.body.stage4_binding.state, "BOUND");
  assert.equal(responses.replay.body.route.replay_contract, "P17_IMPORTED_FIXED_EQUITY_SAMPLE_V1");
  const registry = await call("registry", "GET", "/api/v1/research/alphas");
  assert.equal(registry.entries.find(entry => entry.alpha_version_id === registration.alpha_version_id)?.lifecycle_state, "DRAFT");
  const lineage = await call("lineage", "GET", `/api/v1/research/alphas/${registration.alpha_id}/lineage`);
  const node = lineage.attempts.find(entry => entry.primary_run.run_id === runId);
  assert(node, "The completed run must have a persisted lineage attempt");
  if (parentRun) {
    const parent = lineage.attempts.find(entry => entry.primary_run.run_id === parentRun);
    assert(parent, "The explicit parent must be in this bounded graph");
    assert.equal(node.parent_attempt_id, parent.attempt_id);
    assert.equal(node.parent_state, "RETURNED");
    assert.equal(node.intent_kind, "CLONE_FOR_EXPERIMENT");
    if (seed !== 7) assert(node.semantic_diff.changes.some(change => change.path === "random_seed"),
      "The server must compare the changed seed with the persisted parent specification");
  } else assert.equal(node.parent_state, "ROOT");
  console.log("E17 REAL_BACKEND_RECEIPT_PASS", runId);
} finally {
  writeFileSync(join(directory, `e17-api-${attempt}.json`), JSON.stringify({
    schema_version: "research.e17.real-api-receipt.v1", recorded_at_utc: new Date().toISOString(),
    proof_kind: process.env.RESEARCH_E17_EXISTING_RUN ? "REAL_API_REREAD" : "REAL_CREATE_AND_EXECUTE",
    source_digest: sourceDigest, run_id: runId ?? null, responses,
  }, null, 2) + "\n", { mode: 0o600 });
}
