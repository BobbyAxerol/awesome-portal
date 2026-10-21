/**
 * One Portal-side load stage for a window run (shared by m5 and m7): authorisation first (workload shape, tab census against the
 * window's max_tabs, origin, duration), then the replay, then a receipt that labels the lane exactly as the authorisation did.
 * Every refusal happens BEFORE any header file is read and before any network I/O. The stage never decides "pass the budget".
 */
import { readFileSync } from "node:fs";

import { buildReceipt, sha256File } from "./receipt.mjs";
import { runReplay, validateWorkload } from "./replay.mjs";
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

/**
 * Tab census of one stage: the TOTAL virtual-tab population the stage opens, compared with the window's `max_tabs`.
 *
 * Rule: total = the SUM of `tabs` over the stage's entries. Justification, all from the existing specs in this folder:
 *  - lib/replay.mjs buildSchedule creates `entry.tabs` independent virtual tabs per entry, each firing its own set on its own cadence
 *    (stream key `${seed}:${stage}:${entryIdx}:${tab}`); tab 0 of entry 0 and tab 0 of entry 1 are two different tabs, never one shared tab.
 *  - measurements/WINDOW_REQUESTS_2026-10-21.md section 1 defines the shape additively: "B1 = 8 tab Overview ... B2 = B1 + 10 man x 2 tab",
 *    i.e. B1 = 8 tabs and B2 = 8 + 10 x 2 = 28 tabs concurrently open (not max(8, 2) = 8).
 * The maximum entry count (the previous reading) under-counted B2 by 20 tabs. The census is computed on the APPROVED workload, before
 * any `onlyPrefix` line filter (that filter narrows the paths of a set, never the tab population), and nothing is shrunk to pass.
 */
export function stageTabCensus(workload, stage) {
  validateWorkload(workload);
  const entries = workload.stages?.[stage];
  if (!Array.isArray(entries) || entries.length === 0) throw new Error(`WORKLOAD_UNKNOWN_STAGE:${stage}`);
  const perEntry = entries.map((e) => ({ set: e.set, tabs: e.tabs }));
  return { stage, entries: perEntry, total_tabs: perEntry.reduce((a, e) => a + e.tabs, 0) };
}

export async function runStage({ window: w, measurement, stage, workload, headersPath, idMapPath, durationMs, seed, onlyPrefix = null, real, extraWorkloadPin = null, replayImpl = runReplay }) {
  // 1. Everything that can be decided from the inputs alone, before the header file is read and before any request.
  const census = stageTabCensus(workload, stage);
  if (!Number.isFinite(w.max_tabs) || w.max_tabs < 1) throw new Error(`WINDOW_MAX_TABS_INVALID:${w.max_tabs}`);
  if (census.total_tabs > w.max_tabs) throw new Error(`TABS_EXCEED_WINDOW:${census.total_tabs}>${w.max_tabs}`);
  assertSameOrigin(w, w.origin);
  const allowed = remainingMs(w);
  if (durationMs > allowed) throw new Error(`DURATION_EXCEEDS_WINDOW:${durationMs}>${allowed}`);
  // 2. Only now: headers, id map, replay (network).
  const wl = onlyPrefix ? { ...workload, sets: Object.fromEntries(Object.entries(workload.sets).map(([k, v]) => [k, v.filter((l) => l.slice(4).startsWith(onlyPrefix))])) } : workload;
  const idMap = idMapPath ? JSON.parse(readFileSync(idMapPath, "utf8")) : {};
  const replay = await replayImpl({ origin: w.origin, headers: readHeaders(headersPath), workload: wl, stage, durationMs, seed, maxRps: w.max_rps, idMap, real });
  return { replay, workload_pin: extraWorkloadPin, tab_census: census };
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
