#!/usr/bin/env node
// RF02-B3 · seed one real Research run on the preview stack, through the
// published same-origin routes only: sign in as claude-preview, install the
// server-owned P04 Delta binding (idempotent admin setup), preflight a real
// three-window spec over approved historical data, create the run, and follow
// its progress read to a terminal state.
//
// Prints identifiers and states only. Credentials come from the 0600 files the
// preview script and activation wrote; nothing secret is echoed.
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const home = `${process.env.HOME}/.config/portal-research-preview`;
const env = Object.fromEntries(
  readFileSync(`${home}/preview.env`, "utf8")
    .split("\n")
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
const base = env.PORTAL_PUBLIC_ORIGIN;
// SEED_USER=bobby seeds into Bobby's own workspace (his activated preview account).
const seedUser = process.env.SEED_USER ?? "claude-preview";
const password = readFileSync(`${home}/${seedUser}.password`, "utf8").trim();
const email = seedUser === "bobby" ? "dev@azdag.com" : "claude-preview@azdag.com";
const jar = new Map();

const cookieHeader = () => [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
function keep(response) {
  for (const cookie of response.headers.getSetCookie?.() ?? []) {
    const pair = cookie.split(";")[0];
    jar.set(pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1));
  }
}
async function call(method, path, body) {
  const csrf = jar.get("__Host-portal_csrf");
  const response = await fetch(base + path, {
    method,
    headers: {
      origin: base,
      "content-type": "application/json",
      "x-dev-access-email": email,
      cookie: cookieHeader(),
      ...(method !== "GET" && csrf ? { "x-portal-csrf": csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  keep(response);
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: response.status, json };
}
function need(result, label) {
  if (result.status >= 300) {
    console.error(label, result.status, JSON.stringify(result.json?.error ?? result.json).slice(0, 500));
    process.exit(1);
  }
  return result.json;
}

need(await call("POST", "/api/auth/login", { username: seedUser, credential: password }), "login");
const binding = need(await call("POST", "/api/v1/research/run-producer/p04-delta/install", {}), "install binding");
console.log("binding", binding.alpha_version_id, binding.replayed ? "replayed" : "installed");

const atlas = need(await call("GET", "/api/v1/research/quantbt/atlas"), "atlas");
const release = atlas.atlas.current_release;

// SEED_PROFILE=wfo seeds the W1 Delta signal-notional walk-forward profile
// (locked shape: weekly/expanding, Mode 1 global, 3 trials, seed 42); the
// default seeds the P04 fixed three-window qualification as before.
const wfo = process.env.SEED_PROFILE === "wfo";
const requested_spec = {
  schema_version: "research.requested-spec.v1",
  alpha_binding: { alpha_id: binding.alpha_id, alpha_version_id: binding.alpha_version_id },
  not_publishable: false,
  strategy_id: binding.alpha_id,
  execution_route: "signal_notional",
  route_params: {},
  data: { dataset_id: process.env.SEED_DATASET ?? "crypto-binance-1m", symbol: process.env.SEED_SYMBOL ?? "BTCUSDT", timeframe: "1h" },
  ...(wfo
    ? {
        protocol: "advanced",
        walk_forward: {
          // SEED_WFO_START/END/SPLIT widen the span (profile max 92 days, 2–16 weekly folds).
          start: process.env.SEED_WFO_START ?? "2026-06-01T00:00:00Z",
          end_exclusive: process.env.SEED_WFO_END ?? "2026-07-15T00:00:00Z",
          split_mode: process.env.SEED_WFO_SPLIT ?? "2026-07-01T00:00:00Z",
          frequency: "weekly",
          window_mode: "expanding",
        },
      }
    : {
        protocol: "three_window_decay",
        windows: {
          is: { start: "2026-05-01T00:00", end_exclusive: "2026-07-01T00:00" },
          oos: { start: "2026-07-01T00:00", end_exclusive: "2026-08-01T00:00" },
          holdout: { start: "2026-08-01T00:00", end_exclusive: "2026-08-15T00:00" },
        },
      }),
  optimization_mode: "mode_1_decay",
  optimization_schedule: "global",
  parameter_space_overrides: [],
  // SEED_TRIALS > 3 needs the preview-only long-WFO flag (P10 PREVIEW_LONG_WFO).
  optuna_trials: wfo ? Number(process.env.SEED_TRIALS ?? 3) : 1,
  early_stopping: null,
  random_seed: wfo ? 42 : null,
  optimization_config: {},
  client: { engine_release_id: release.release_id, config_digest: release.config_digest },
};

const preflight = need(await call("POST", "/api/v1/research/preflights", { requested_spec }), "preflight");
console.log("preflight", preflight.preflight_token ? "token issued" : "no token", "may_create_run", preflight.may_create_run);
if (!preflight.may_create_run) process.exit(1);

const created = need(
  await call("POST", "/api/v1/research/runs", {
    schema_version: "research.run-create.v1",
    client_intent_id: `rf02-seed-${randomUUID()}`,
    preflight_token: preflight.preflight_token,
    requested_spec,
  }),
  "create run",
);
const runId = created.run_id ?? created.run?.run_id;
console.log("run", runId);

const deadline = Date.now() + Number(process.env.SEED_TIMEOUT_MS ?? 20 * 60_000); // long runs: SEED_TIMEOUT_MS=5400000
let last = "";
while (Date.now() < deadline) {
  const read = await call("GET", `/api/v1/research/runs/${encodeURIComponent(runId)}/progress`);
  const status = read.json?.current?.effective_status ?? `http ${read.status}`;
  const materialized = read.json?.current?.terminal_materialization ?? "";
  if (`${status}/${materialized}` !== last) {
    last = `${status}/${materialized}`;
    console.log("progress", new Date().toISOString(), last, "seq", read.json?.current?.source_latest_sequence ?? "");
  }
  if (["COMPLETED", "FAILED", "CANCELLED"].includes(status) && materialized !== "PENDING") break;
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
writeFileSync(`${home}/${process.env.SEED_OUT ?? (wfo ? "seeded-wfo-run.json" : "seeded-run.json")}`, JSON.stringify({ run_id: runId, profile: wfo ? "wfo" : "p04", final: last, at: new Date().toISOString() }, null, 2), { mode: 0o600 });
console.log("done", runId, last);
