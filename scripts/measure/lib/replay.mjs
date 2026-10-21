/**
 * Deterministic open-loop GET replay: the Portal-side load driver for M-5 (B1 / B2 stages) and M-7 (load holder).
 *
 * Inputs are fixed: a workload file (`portal.elp2-10.read-workload.v1`: named read sets and per-stage entries {set, tabs,
 * cadence_ms}), a seed, a duration. Each virtual tab fires its set on a fixed cadence from a seeded offset, whatever the server
 * answers (open loop: a slow server does not slow the offered load). GET only. Same-origin only. Credentials arrive as header
 * text from a file the caller read; they are never returned in a result.
 *
 * Stop conditions (checked every second over the trailing 30 s, any one ends the run early and is recorded as the stop reason):
 *   STOP_429             any HTTP 429
 *   STOP_5XX_RATE        5xx share > 2 % with at least 20 requests in the trailing window
 *   STOP_NETWORK_RATE    transport errors/timeouts > 5 % with at least 20 requests
 *   STOP_OVERLOAD        more than `maxInFlight` requests outstanding (the offered load is not being absorbed)
 *   STOP_SIGNAL          SIGINT / SIGTERM
 *   STOP_DEADLINE        the duration (or the window) ran out: the normal end
 * The offered peak (max requests in any one second) is computed BEFORE starting and refused above `maxRps`.
 */
import { createHash } from "node:crypto";

import { summarize } from "./receipt.mjs";

const FIXTURE_IDS = /(alpha_btc_trend|pf_TEST_ONLY_[A-Za-z_]+|acc_bnc_core|dep_(?:paper|sandbox|canary|live)_\d+|inc_fixture_\d+|AP-\d+|ws_TEST_[A-Za-z_]+)/;

export function validateWorkload(w) {
  if (w?.schema_version !== "portal.elp2-10.read-workload.v1") throw new Error("WORKLOAD_SCHEMA");
  for (const [name, list] of Object.entries(w.sets ?? {})) for (const line of list) if (!/^GET \/api\//.test(line)) throw new Error(`WORKLOAD_NOT_A_GET:${name}:${line}`);
  for (const [stage, entries] of Object.entries(w.stages ?? {})) for (const e of entries) {
    if (!w.sets[e.set]) throw new Error(`WORKLOAD_UNKNOWN_SET:${stage}:${e.set}`);
    if (!Number.isInteger(e.tabs) || e.tabs < 1 || !Number.isInteger(e.cadence_ms) || e.cadence_ms < 1000) throw new Error(`WORKLOAD_ENTRY_INVALID:${stage}`);
  }
  return w;
}

const hash32 = (text) => createHash("sha256").update(text).digest().readUInt32BE(0);

export function buildSchedule(workload, stage, durationMs, seed) {
  const events = [];
  (workload.stages[stage] ?? []).forEach((entry, entryIdx) => {
    for (let tab = 0; tab < entry.tabs; tab++) {
      const offset = hash32(`${seed}:${stage}:${entryIdx}:${tab}`) % entry.cadence_ms;
      for (let at = offset; at < durationMs; at += entry.cadence_ms) events.push({ at, set: entry.set, tab, entryIdx });
    }
  });
  return events.sort((a, b) => a.at - b.at || a.entryIdx - b.entryIdx || a.tab - b.tab);
}

export function offeredPeak(events, workload) {
  const perSecond = new Map();
  for (const e of events) { const s = Math.floor(e.at / 1000); perSecond.set(s, (perSecond.get(s) ?? 0) + workload.sets[e.set].length); }
  return Math.max(0, ...perSecond.values());
}

export function resolvePath(line, idMap, real) {
  let path = line.slice(4);
  for (const [from, to] of Object.entries(idMap ?? {})) path = path.split(from).join(to);
  if (real && FIXTURE_IDS.test(path)) return null;
  return path;
}

export async function runReplay({ origin, headers = {}, workload, stage, durationMs, seed, maxRps, maxInFlight = 64, idMap = {}, real = false, requestTimeoutMs = 15_000, onProgress = null }) {
  validateWorkload(workload);
  const events = buildSchedule(workload, stage, durationMs, seed);
  const peak = offeredPeak(events, workload);
  if (peak > maxRps) throw new Error(`OFFERED_PEAK_ABOVE_MAX_RPS:${peak}>${maxRps}`);
  const samples = []; // {t, key, status, ms, bytes, err}
  const skipped = new Map();
  let inFlight = 0, maxSeenInFlight = 0, stopReason = "STOP_DEADLINE", stopped = false, fired = 0;
  const onSignal = () => { if (!stopped) { stopped = true; stopReason = "STOP_SIGNAL"; } };
  process.once("SIGINT", onSignal); process.once("SIGTERM", onSignal);
  const t0 = performance.now(), wall0 = Date.now();

  async function one(line, tMs) {
    const path = resolvePath(line, idMap, real);
    if (path === null) { skipped.set(line, (skipped.get(line) ?? 0) + 1); return; }
    const key = line.replace(/\?.*$/, "").replace(FIXTURE_IDS, ":id").replace(/\/[A-Za-z0-9_-]{16,}(?=\/|$)/g, "/:id");
    inFlight++; maxSeenInFlight = Math.max(maxSeenInFlight, inFlight);
    const s = performance.now();
    try {
      const res = await fetch(origin + path, { method: "GET", headers, redirect: "manual", signal: AbortSignal.timeout(requestTimeoutMs) });
      const body = await res.arrayBuffer();
      samples.push({ t: tMs, key, status: res.status, ms: performance.now() - s, bytes: body.byteLength, err: null });
    } catch (e) {
      samples.push({ t: tMs, key, status: 0, ms: performance.now() - s, bytes: 0, err: e?.name ?? "ERR" });
    } finally { inFlight--; }
  }

  const checker = setInterval(() => {
    const now = performance.now() - t0, recent = samples.filter((s) => s.t >= now - 30_000);
    if (recent.some((s) => s.status === 429)) { stopped = true; stopReason = "STOP_429"; }
    else if (recent.length >= 20 && recent.filter((s) => s.status >= 500).length / recent.length > 0.02) { stopped = true; stopReason = "STOP_5XX_RATE"; }
    else if (recent.length >= 20 && recent.filter((s) => s.status === 0).length / recent.length > 0.05) { stopped = true; stopReason = "STOP_NETWORK_RATE"; }
    else if (inFlight > maxInFlight) { stopped = true; stopReason = "STOP_OVERLOAD"; }
    if (onProgress) onProgress({ elapsed_ms: Math.round(now), fired, in_flight: inFlight, samples: samples.length, stopReason: stopped ? stopReason : null });
  }, 1000);

  const pending = [];
  for (const e of events) {
    if (stopped) break;
    const wait = e.at - (performance.now() - t0);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (stopped) break;
    fired++;
    for (const line of workload.sets[e.set]) pending.push(one(line, e.at));
  }
  // Let the trailing window finish to its duration unless a stop reason ended it.
  if (!stopped) { const rest = durationMs - (performance.now() - t0); if (rest > 0) await new Promise((r) => setTimeout(r, rest)); }
  stopped = true;
  await Promise.allSettled(pending);
  clearInterval(checker);
  process.off("SIGINT", onSignal); process.off("SIGTERM", onSignal);
  const elapsed = performance.now() - t0;
  const byKey = {};
  for (const s of samples) (byKey[s.key] ??= []).push(s);
  const statusHistogram = {};
  for (const s of samples) statusHistogram[s.status || "transport_error"] = (statusHistogram[s.status || "transport_error"] ?? 0) + 1;
  const perSecond = new Map();
  for (const s of samples) { const k = Math.floor(s.t / 1000); perSecond.set(k, (perSecond.get(k) ?? 0) + 1); }
  return {
    stage, seed, planned_duration_ms: durationMs, actual_duration_ms: Math.round(elapsed), started_at_ms: wall0, ended_at_ms: wall0 + Math.round(elapsed), stop_reason: stopReason,
    ran_to_planned_end: stopReason === "STOP_DEADLINE", events_planned: events.length, events_fired: fired,
    offered_peak_requests_per_s: peak, offered_mean_requests_per_s: Math.round(events.reduce((a, e) => a + workload.sets[e.set].length, 0) / (durationMs / 1000) * 1000) / 1000,
    requests_completed: samples.length, achieved_requests_per_s: Math.round(samples.length / (elapsed / 1000) * 1000) / 1000, max_in_flight: maxSeenInFlight,
    status_histogram: statusHistogram, error_rate: samples.length ? Math.round(samples.filter((s) => s.status === 0 || s.status >= 400).length / samples.length * 10000) / 10000 : null,
    latency_ms: summarize(samples.map((s) => s.ms), 2), bytes_total: samples.reduce((a, s) => a + s.bytes, 0),
    per_endpoint: Object.fromEntries(Object.entries(byKey).sort().map(([k, v]) => [k, { n: v.length, ...(({ p50, p95, p99, max }) => ({ p50, p95, p99, max }))(summarize(v.map((s) => s.ms), 2)),
      non_2xx: v.filter((s) => s.status < 200 || s.status >= 300).length }])),
    peak_achieved_requests_in_one_second: Math.max(0, ...perSecond.values()),
    skipped_unmapped_fixture_paths: Object.fromEntries(skipped), workload_sha256: `sha256:${createHash("sha256").update(JSON.stringify(workload)).digest("hex")}`,
  };
}
