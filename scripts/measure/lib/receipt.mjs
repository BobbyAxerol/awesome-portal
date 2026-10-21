/**
 * ELP2-10 measurement receipts (M-1 ... M-7): one schema, one honest lane label.
 *
 * A receipt says WHAT was run, on WHAT, under WHICH limits, with WHICH numbers. It never says "pass the budget":
 * no budget is approved (proposal section 8). `calibration_evidence` is true ONLY for a REAL_READ_* lane run inside
 * an exclusive window; every FIXTURE_LAB / BFF_DOUBLE / PG-cell number is regression or mechanism evidence and the
 * writer refuses to emit it as anything else.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, hostname, loadavg, platform, release, totalmem } from "node:os";
import { dirname, resolve } from "node:path";

export const SCHEMA = "portal.elp2-10.measurement-receipt.v1";
export const LANES = Object.freeze(["FIXTURE_LAB", "BFF_DOUBLE", "REAL_READ_RETAINED", "REAL_READ_QUALIFIED"]);
export const RUN_KINDS = Object.freeze(["CAPPED_CORRECTNESS", "ABSOLUTE_MEASUREMENT"]);
export const STATUSES = Object.freeze(["RUN_FIXTURE", "RUN_WINDOW", "READY_NEEDS_WINDOW", "BLOCKED"]);
const REAL = new Set(["REAL_READ_RETAINED", "REAL_READ_QUALIFIED"]);

export const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), "..", "..", "..");

/** Nearest-rank percentile, the same definition the repo's own diagnostic uses (ceil(n*p) - 1 on the sorted sample). */
export function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
}

export function summarize(values, digits = 3) {
  if (!Array.isArray(values) || values.length === 0) return { n: 0, p50: null, p95: null, p99: null, max: null, mean: null };
  const round = (x) => Math.round(x * 10 ** digits) / 10 ** digits;
  const sum = values.reduce((a, b) => a + b, 0);
  return { n: values.length, p50: round(percentile(values, 0.5)), p95: round(percentile(values, 0.95)), p99: round(percentile(values, 0.99)),
    max: round(Math.max(...values)), mean: round(sum / values.length) };
}

const vcs = (args, cwd = repoRoot) => {
  try { return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; }
};

export function gitInfo(cwd = repoRoot) {
  const status = vcs(["status", "--porcelain=v1", "--untracked-files=no"], cwd);
  return { sha: vcs(["rev-parse", "HEAD"], cwd), branch: vcs(["rev-parse", "--abbrev-ref", "HEAD"], cwd),
    tracked_dirty: status === null ? null : status.length > 0,
    tracked_dirty_digest: status ? `sha256:${createHash("sha256").update(status).digest("hex")}` : null };
}

export function machineInfo() {
  const load = loadavg();
  return { hostname: hostname(), os: `${platform()} ${release()}`, cpus: cpus().length, cpu_model: cpus()[0]?.model ?? null,
    mem_total_bytes: totalmem(), node: process.version, loadavg_1m_at_capture: Math.round(load[0] * 100) / 100,
    loadavg_5m_at_capture: Math.round(load[1] * 100) / 100 };
}

export const sha256File = (path) => `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
export const sha256Text = (text) => `sha256:${createHash("sha256").update(text).digest("hex")}`;

/** Stable JSON (sorted keys) so the receipt digest does not depend on insertion order. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}

/**
 * Builds a receipt. `lane` must be one of LANES. calibration_evidence is derived, never passed: it is true only for a
 * REAL_READ_* lane AND an ABSOLUTE_MEASUREMENT run kind AND an explicit window id. approved_budget is always false.
 */
export function buildReceipt({ measurement, sub = null, title, lane, runKind, status, startedAtMs, endedAtMs, windowId = null,
  workload, limits = null, stopConditions = [], results, resources = null, cleanup = null, limitations = [], notes = [], extra = {} }) {
  // A receipt for something that has NOT been run (READY_NEEDS_WINDOW / BLOCKED) carries lane NOT_RUN and names the lane it will use.
  const notRun = lane === "NOT_RUN" && (status === "READY_NEEDS_WINDOW" || status === "BLOCKED");
  if (!notRun && !LANES.includes(lane)) throw new Error(`lane must be one of ${LANES.join(",")}`);
  if (!RUN_KINDS.includes(runKind)) throw new Error(`run_kind must be one of ${RUN_KINDS.join(",")}`);
  if (!STATUSES.includes(status)) throw new Error(`status must be one of ${STATUSES.join(",")}`);
  const real = REAL.has(lane);
  if (real && !windowId && (status === "RUN_FIXTURE" || status === "RUN_WINDOW")) throw new Error("a REAL_READ lane receipt needs a window id");
  if (!real && status === "RUN_WINDOW") throw new Error("RUN_WINDOW is only for a REAL_READ lane");
  const calibration = Boolean(real && runKind === "ABSOLUTE_MEASUREMENT" && windowId);
  const body = {
    schema_version: SCHEMA, measurement, sub, title, status, lane, run_kind: runKind,
    evidence_class: calibration ? "RUNTIME_MEASURED_IN_WINDOW" : "TEST_ONLY_FIXTURE_NOT_CALIBRATION_EVIDENCE",
    calibration_evidence: calibration, approved_budget: false, window_id: windowId,
    git: gitInfo(), machine: machineInfo(),
    started_at: startedAtMs ? new Date(startedAtMs).toISOString() : null, ended_at: endedAtMs ? new Date(endedAtMs).toISOString() : null,
    started_at_ms: startedAtMs ?? null, ended_at_ms: endedAtMs ?? null, duration_ms: startedAtMs && endedAtMs ? endedAtMs - startedAtMs : null,
    workload, resource_limits: limits, stop_conditions: stopConditions, results, resources, cleanup, limitations, notes, ...extra,
  };
  return { ...body, receipt_digest_excludes: ["receipt_digest"], receipt_digest: sha256Text(canonical(body)) };
}

export function writeReceipt(path, receipt) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`);
  return path;
}

export function readJsonl(path) {
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

export function parseArgs(argv, spec) {
  const out = {};
  for (const [name, def] of Object.entries(spec)) out[name] = def.default;
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (!raw.startsWith("--")) throw new Error(`unexpected argument ${raw}`);
    const name = raw.slice(2);
    const def = spec[name];
    if (!def) throw new Error(`unknown option --${name}`);
    if (def.flag) { out[name] = true; continue; }
    const value = argv[++i];
    if (value === undefined) throw new Error(`--${name} needs a value`);
    out[name] = def.number ? Number(value) : value;
    if (def.number && !Number.isFinite(out[name])) throw new Error(`--${name} must be a number`);
  }
  return out;
}
