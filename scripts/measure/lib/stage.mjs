/**
 * One Portal-side load stage for a window run (shared by m5 and m7): authorisation first, then the replay, then a receipt that
 * labels the lane exactly as the authorisation did. The stage never decides "pass the budget".
 */
import { readFileSync } from "node:fs";

import { buildReceipt, sha256File } from "./receipt.mjs";
import { runReplay } from "./replay.mjs";
import { assertSameOrigin, remainingMs } from "./window.mjs";

export function readHeaders(path) {
  if (!path) return {};
  const text = readFileSync(path, "utf8").trim();
  // Either `Name: value` lines or a bare Cookie value. The content is never returned or logged.
  if (/^[A-Za-z-]+:\s/m.test(text)) return Object.fromEntries(text.split("\n").filter(Boolean).map((l) => { const i = l.indexOf(":"); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  return { Cookie: text };
}

const METRIC_SOURCES = {
  latency_p50_ms: (r) => r.latency_ms.p50, latency_p95_ms: (r) => r.latency_ms.p95, latency_p99_ms: (r) => r.latency_ms.p99, latency_max_ms: (r) => r.latency_ms.max,
  error_rate: (r) => r.error_rate, achieved_requests_per_s: (r) => r.achieved_requests_per_s, requests_total: (r) => r.requests_completed,
  bytes_per_s: (r) => Math.round(r.bytes_total / (r.actual_duration_ms / 1000)),
};

export function mapMetrics(metricMapPath, replay) {
  if (!metricMapPath) return { measurements: [], note: "no --metric-map: only Portal-side counters are in the receipt; plan metrics come from the TS / DL / Edge collectors" };
  const map = JSON.parse(readFileSync(metricMapPath, "utf8"));
  return { measurements: map.map(({ key, unit, bound_kind, from }) => {
    if (!METRIC_SOURCES[from]) throw new Error(`METRIC_MAP_UNKNOWN_SOURCE:${from}`);
    return { key, unit, bound_kind, value: METRIC_SOURCES[from](replay) };
  }), note: null };
}

export async function runStage({ window: w, measurement, stage, workload, headersPath, idMapPath, durationMs, seed, onlyPrefix = null, real, extraWorkloadPin = null }) {
  assertSameOrigin(w, w.origin);
  const allowed = remainingMs(w);
  if (durationMs > allowed) throw new Error(`DURATION_EXCEEDS_WINDOW:${durationMs}>${allowed}`);
  const wl = onlyPrefix ? { ...workload, sets: Object.fromEntries(Object.entries(workload.sets).map(([k, v]) => [k, v.filter((l) => l.slice(4).startsWith(onlyPrefix))])) } : workload;
  const idMap = idMapPath ? JSON.parse(readFileSync(idMapPath, "utf8")) : {};
  const replay = await runReplay({ origin: w.origin, headers: readHeaders(headersPath), workload: wl, stage, durationMs, seed, maxRps: w.max_rps, idMap, real });
  const tabs = Math.max(...(wl.stages[stage] ?? []).map((e) => e.tabs), 0);
  if (tabs > w.max_tabs) throw new Error(`TABS_EXCEED_WINDOW:${tabs}>${w.max_tabs}`);
  return { replay, workload_pin: extraWorkloadPin };
}

export function stageReceipt({ measurement, window: w, stage, replay, title, limitations = [], extra = {}, selfTest = false }) {
  const lane = w.lane;
  const full = replay.ran_to_planned_end;
  return buildReceipt({
    measurement, sub: stage, title, lane, runKind: w.run_kind, status: lane.startsWith("REAL_READ") ? "RUN_WINDOW" : "RUN_FIXTURE", startedAtMs: replay.started_at_ms, endedAtMs: replay.ended_at_ms,
    windowId: selfTest ? null : w.window_id,
    workload: { stage, seed: replay.seed, planned_duration_ms: replay.planned_duration_ms, offered_peak_rps: replay.offered_peak_requests_per_s, offered_mean_rps: replay.offered_mean_requests_per_s, workload_sha256: replay.workload_sha256 },
    limits: { window_max_rps: w.max_rps, window_max_tabs: w.max_tabs, window_max_duration_ms: w.max_duration_ms, in_flight_cap: 64 },
    stopConditions: ["STOP_429", "STOP_5XX_RATE (>2% of >=20 in trailing 30 s)", "STOP_NETWORK_RATE (>5% of >=20)", "STOP_OVERLOAD (>64 in flight)", "STOP_SIGNAL", "window end minus 5 s", "offered peak above window max_rps refuses to start"],
    results: { replay, completed_planned_duration: full },
    cleanup: { requests_in_flight_at_end: 0, session_revocation: "NOT_PERFORMED_BY_THIS_SCRIPT: the grantor revokes temporary sessions with the official revoker and reads back zero custody (Core009 runbook G5)", credential_file_digest_not_recorded: true },
    limitations, extra: { authorisation: selfTest ? { self_issued_selftest: true } : { window_id: w.window_id, granted_by: w.granted_by, authorisation_sha256: w.authorisation_sha256, starts_at_ms: w.starts_at_ms, ends_at_ms: w.ends_at_ms, base_url: w.origin, stop_rollback: w.stop_rollback }, ...extra },
  });
}

export { sha256File };
