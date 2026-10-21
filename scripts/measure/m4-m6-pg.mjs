#!/usr/bin/env node
/**
 * M-4a (mixed query + ingest, capped, local PG) and M-6a (lease / takeover / restore-epoch invariants, capped, local PG).
 *
 * One disposable PG cell run (scripts/measure/pg-cell.sh, N repetitions on a FRESH PostgreSQL each) covers both: the
 * Manager store spec carries the "T10-04/05" measurement test and the "T10-07" lease tests. Lane FIXTURE_LAB,
 * run kind CAPPED_CORRECTNESS: the p50/p95/p99 below are mechanism diagnostics (20 -> 1 SELECT, digests equal), not
 * capacity, and are never compared with UDB 500/600 ms or P184 per-feed 500 ms (different interface/population/metric).
 *
 *   node scripts/measure/m4-m6-pg.mjs [--reps 2] [--lock-wait-s 3600]        run the cell under /tmp/portal-heavy.lock
 *   node scripts/measure/m4-m6-pg.mjs --from DIR                             re-derive the receipts from a finished run
 *
 * Stop conditions: cell exit code != 0 for a rep is recorded (not hidden) and the rep is excluded from the numbers;
 * --timeout-s kills a stuck node container; the PG container and network are removed by the cell's own trap.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { buildReceipt, parseArgs, repoRoot, sha256File, summarize, writeReceipt } from "./lib/receipt.mjs";

const args = parseArgs(process.argv.slice(2), {
  reps: { number: true, default: 2 }, "lock-wait-s": { number: true, default: 3600 }, from: { default: "" },
  "node-cpus": { default: "2" }, "node-mem": { default: "2g" }, "pg-cpus": { default: "1" }, "pg-mem": { default: "1g" },
  "timeout-s": { number: true, default: 900 }, date: { default: "2026-10-21" }, "receipt-dir": { default: "" },
});
const TESTS = ["test/elp210-performance.spec.ts", "test/elp206-manager-store.spec.ts", "test/elp206-manager-model.spec.ts",
  "test/elp206-manager-service.spec.ts", "test/elp2-read-projection.spec.ts"];
const receiptDir = args["receipt-dir"] || join(repoRoot, "upgrade/execution_loop/evidence/ELP2-10/measurements");

function runCell() {
  const stamp = args.date.replaceAll("-", "");
  const out = join(homedir(), ".local/state/portal-execution-elp210", stamp, `m4-m6-${Date.now()}`);
  mkdirSync(out, { recursive: true, mode: 0o700 });
  const cell = join(repoRoot, "scripts/measure/pg-cell.sh");
  const started = Date.now();
  const r = spawnSync("flock", ["-w", String(args["lock-wait-s"]), "/tmp/portal-heavy.lock", "bash", cell, "--out", out,
    "--reps", String(args.reps), "--node-cpus", args["node-cpus"], "--node-mem", args["node-mem"], "--pg-cpus", args["pg-cpus"],
    "--pg-mem", args["pg-mem"], "--timeout-s", String(args["timeout-s"]), "--", ...TESTS], { stdio: "inherit" });
  return { out, started, ended: Date.now(), status: r.status };
}

const unit = { B: 1, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, kB: 1000, MB: 1000 ** 2, GB: 1000 ** 3 };
const bytes = (text) => { const m = /^([\d.]+)\s*([A-Za-z]+)$/.exec(text.trim()); return m ? Number(m[1]) * (unit[m[2]] ?? NaN) : NaN; };

function sampleStats(path, fromMs, toMs) {
  if (!existsSync(path)) return null;
  const per = {};
  for (const line of readFileSync(path, "utf8").split("\n").filter(Boolean)) {
    const [ts, name, cpu, mem] = line.split(",");
    if (Number(ts) < fromMs || Number(ts) > toMs) continue;
    const role = name.includes("-pg-") ? "postgres" : "node";
    (per[role] ??= { cpu: [], mem: [] });
    per[role].cpu.push(Number.parseFloat(cpu)); per[role].mem.push(bytes(mem.split("/")[0]));
  }
  return Object.fromEntries(Object.entries(per).map(([role, v]) => [role, { samples: v.cpu.length,
    cpu_percent_mean: Math.round(v.cpu.reduce((a, b) => a + b, 0) / v.cpu.length * 10) / 10, cpu_percent_max: Math.max(...v.cpu),
    mem_bytes_max_sampled: Math.max(...v.mem), note: "docker stats samples at ~1 Hz; a peak between samples is not seen" }]));
}

function derive(dir, cell) {
  const reps = readdirSync(dir).filter((n) => /^rep-\d+$/.test(n)).sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)));
  const rows = [];
  for (const name of reps) {
    const repDir = join(dir, name);
    const meta = JSON.parse(readFileSync(join(repDir, "rep.json"), "utf8"));
    const jsonPath = join(repDir, "vitest.json"), logPath = join(repDir, "stdout.log");
    const tests = [];
    if (existsSync(jsonPath)) {
      const j = JSON.parse(readFileSync(jsonPath, "utf8"));
      for (const file of j.testResults) for (const t of file.assertionResults)
        tests.push({ file: file.name.split("/test/").pop(), name: t.fullName, status: t.status, duration_ms: Math.round((t.duration ?? 0) * 100) / 100 });
    }
    const log = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
    const measurement = log.split("\n").filter((l) => l.includes("ELP210_MEASUREMENT ")).map((l) => JSON.parse(l.slice(l.indexOf("ELP210_MEASUREMENT ") + 19)))[0] ?? null;
    const paired = log.split("\n").filter((l) => l.includes("ELP2_10_TEST_ONLY_PAIRED_TUPLE_DIAGNOSTIC")).map((l) => JSON.parse(l.slice(l.indexOf("{"))))[0] ?? null;
    rows.push({ rep: meta.rep, exit_code: meta.exit_code, started_ms: meta.rep_started_ms, pg_ready_ms: meta.pg_ready_ms, ended_ms: meta.rep_ended_ms,
      cell: meta, tests, measurement, paired,
      resources: sampleStats(join(dir, "stats.csv"), meta.pg_ready_ms, meta.rep_ended_ms),
      log_sha256: existsSync(logPath) ? sha256File(logPath) : null, vitest_json_sha256: existsSync(jsonPath) ? sha256File(jsonPath) : null });
  }
  const cleanup = existsSync(join(dir, "cleanup.json")) ? JSON.parse(readFileSync(join(dir, "cleanup.json"), "utf8")) : null;
  return { rows, cleanup };
}

const dir = args.from ? resolve(args.from) : (() => { const c = runCell(); if (c.status !== 0) console.error(`cell exited ${c.status}`); return c.out; })();
const { rows, cleanup } = derive(dir);
const good = rows.filter((r) => r.exit_code === 0 && r.measurement);
const startedAt = Math.min(...rows.map((r) => r.started_ms)), endedAt = Math.max(...rows.map((r) => r.ended_ms));
const limits = rows[0] ? { node_cpus: rows[0].cell.node_cpus, node_memory: rows[0].cell.node_mem, postgres_cpus: rows[0].cell.pg_cpus,
  postgres_memory: rows[0].cell.pg_mem, total_cpus: Number(rows[0].cell.node_cpus) + Number(rows[0].cell.pg_cpus),
  workers: 1, network: "DISPOSABLE_INTERNAL_ONLY", pg_pool_max_in_test: 2,
  deviation_from_manifest_cell: "manifest isolated_cell is node 3 CPU/3 GiB + PG 1 CPU/1 GiB (4/4); this cell is node 2/2 GiB + PG 1/1 GiB (3/3) per the 3 CPU / 3 GiB run cap, so absolute ms are NOT comparable with measurements.md run1" } : null;
const images = rows[0] ? { node: rows[0].cell.node_image, postgres: rows[0].cell.pg_image } : null;

// ---- M-4a ---------------------------------------------------------------------------------------------------------
const modeRounds = {};
for (const r of good) for (const round of r.measurement.rounds) (modeRounds[round.mode] ??= []).push({ rep: r.rep, ...round });
const byMode = Object.fromEntries(Object.entries(modeRounds).map(([mode, list]) => [mode, {
  document_selects_per_round: [...new Set(list.map((x) => x.document_selects))],
  max_pool_waiting_count: [...new Set(list.map((x) => x.maximum_pool_waiting))],
  wall_ms: summarize(list.map((x) => x.wall_ms)), p50_ms_of_rounds: summarize(list.map((x) => x.p50_ms)),
  p95_ms_of_rounds: summarize(list.map((x) => x.p95_ms)), p99_ms_of_rounds: summarize(list.map((x) => x.p99_ms)),
  process_cpu_user_us: summarize(list.map((x) => x.process_cpu_us.user)), process_cpu_system_us: summarize(list.map((x) => x.process_cpu_us.system)),
  rounds: list.length }]));
const spread = (values) => (values.length < 2 || !values.every(Number.isFinite) ? null : Math.round((Math.max(...values) - Math.min(...values)) / Math.min(...values) * 1000) / 10);
const p95Per = (mode) => (modeRounds[mode] ?? []).map((x) => x.p95_ms);
const perRep = good.map((r) => ({ rep: r.rep, payload_bytes: r.measurement.payload_bytes, members: r.measurement.members, facts: r.measurement.facts,
  order: r.measurement.order, plan_node: r.measurement.query_plan?.[0]?.Plan?.["Node Type"] ?? null, plan_index: r.measurement.query_plan?.[0]?.Plan?.["Index Name"] ?? null,
  plan_execution_ms: r.measurement.query_plan?.[0]?.["Execution Time"] ?? null, relation_bytes: Number(r.measurement.storage?.relation_bytes ?? NaN),
  pg_version: r.measurement.storage?.pg_version ?? null, rounds: r.measurement.rounds.map((x) => ({ mode: x.mode, selects: x.document_selects,
    wall_ms: x.wall_ms, p50_ms: x.p50_ms, p95_ms: x.p95_ms, p99_ms: x.p99_ms, pool_waiting: x.maximum_pool_waiting, rss_before: x.rss_before_bytes, rss_after: x.rss_after_bytes })),
  resources: r.resources }));
const hardNames = rows.flatMap((r) => r.tests.filter((t) => /T10-04\/05/.test(t.name)).map((t) => ({ rep: r.rep, status: t.status, duration_ms: t.duration_ms })));
const m4 = buildReceipt({ measurement: "M-4", sub: "a", title: "Mixed query + ingest on a local disposable PostgreSQL (capped correctness)",
  lane: "FIXTURE_LAB", runKind: "CAPPED_CORRECTNESS", status: good.length ? "RUN_FIXTURE" : "BLOCKED", startedAtMs: startedAt, endedAtMs: endedAt,
  workload: { fixture: "1 member, 1000 facts, serialized ~1,197,252 B (spec elp206-manager-store 'T10-04/05')", readers_per_round: 20,
    order: "ABBA_WARM: UNCOALESCED_REFERENCE, COALESCED, COALESCED, UNCOALESCED_REFERENCE", mixed: "1 committed successor + 20 reads of the immutable previous revision",
    repetitions_requested: args.reps, repetitions_valid: good.length, fresh_postgres_per_repetition: true, source_calls: "NONE_BY_CONSTRUCTION",
    specs: TESTS, images },
  limits, stopConditions: ["rep with exit code != 0 is reported and excluded from the numbers", "container timeout", "any other container touched = abort (the cell names only elp210m-*)"],
  results: { hard_assertions: { description: "same result digest, 20 vs 1 document SELECTs, finite admission, no stale commit/ACK, history preserved",
      test_status_per_rep: hardNames, all_passed: hardNames.length > 0 && hardNames.every((x) => x.status === "passed") },
    by_mode_across_reps: byMode,
    p95_spread_percent_between_reps: { coalesced: spread(p95Per("coalesced")), uncoalesced_reference: spread(p95Per("uncoalesced-reference")),
      rule: "R-C: variance between independent repetitions above 25% means more repetitions, not a wider margin" },
    select_reduction: byMode.coalesced && byMode["uncoalesced-reference"] ? { uncoalesced: byMode["uncoalesced-reference"].document_selects_per_round, coalesced: byMode.coalesced.document_selects_per_round } : null,
    per_rep: perRep, paired_tuple_diagnostic: good.map((r) => r.paired).filter(Boolean),
    full_suite_status_per_rep: rows.map((r) => ({ rep: r.rep, exit_code: r.exit_code, passed: r.tests.filter((t) => t.status === "passed").length,
      failed: r.tests.filter((t) => t.status === "failed").length, skipped: r.tests.filter((t) => t.status === "skipped" || t.status === "pending").length })) },
  resources: { per_rep: rows.map((r) => ({ rep: r.rep, ...r.resources })) },
  cleanup,
  limitations: ["Local disposable PG, in-process driver: NOT 20 authenticated HTTP users, NOT a source, NOT TS/DL/Research coexistence.",
    "Warm ABBA order; no OS/PG cache flush; no parent-binary execution. The uncoalesced reference is the same loader with one repository per reader.",
    "p50/p95/p99 are across 20 simultaneous readers in one process: a mechanism diagnostic, never comparable with UDB 500/600 ms or P184 per-feed 500 ms.",
    "RSS is sequential in-process sampling, not peak RSS or a memory saving. docker stats is ~1 Hz.",
    "Not measured here: host IO, WAL amplification, connection-wait milliseconds (the driver records waiting COUNT only, gap G-5), ingest/replay lag, browser latency.",
    "Export is N/A (no Execution Manager export route is mounted).",
    "The connected variant M-4b needs a mounted writer and an exclusive window (see WINDOW_REQUESTS)."],
  extra: { raw_dir_not_committed: dir, evidence_capture: "private 0700 directory; logs not committed, sha256 recorded per rep" } });
writeReceipt(join(receiptDir, "M-4-2026-10-21.json"), m4);

// ---- M-6a ---------------------------------------------------------------------------------------------------------
const leaseRows = rows.map((r) => ({ rep: r.rep, tests: r.tests.filter((t) => /T10-07/.test(t.name)).map((t) => ({ name: t.name.replace(/^.*ELP2-06 actual PostgreSQL Manager projection transactions \(TEST_ONLY\) /, ""), status: t.status, duration_ms: t.duration_ms })) }));
const leaseAll = leaseRows.flatMap((r) => r.tests);
const m6 = buildReceipt({ measurement: "M-6", sub: "a", title: "Lease race / takeover / autocommit / expiry-at-COMMIT / ABA / restore-epoch invariants on local disposable PG (capped correctness)",
  lane: "FIXTURE_LAB", runKind: "CAPPED_CORRECTNESS", status: leaseAll.length ? "RUN_FIXTURE" : "BLOCKED", startedAtMs: startedAt, endedAtMs: endedAt,
  workload: { source: "the same PG cell run as M-4a; tests named T10-07 in elp206-manager-store.spec.ts (tip has renew(..., notAfterMs))",
    repetitions_valid: good.length, fresh_postgres_per_repetition: true, specs: TESTS },
  limits, stopConditions: ["rep with exit code != 0 is reported", "no production database, no restore of production data"],
  results: { binary_invariants_per_rep: leaseRows, all_passed: leaseAll.length > 0 && leaseAll.every((t) => t.status === "passed"),
    covered: ["autocommit refused before any write", "two connections elect one holder; release/reclaim fences same-owner ABA", "expiry at COMMIT (deferred DB fence)",
      "resetAfterRestore CAS: wrong epoch refused, correct epoch bumps token + epoch, old holder cannot commit", "scope mismatch / captured lease"],
    takeover_or_RTO_time_ms: "NOT_MEASURED_HERE: these are invariants. The restore drill with RTO is receipt M-6 sub b (restore drill)." },
  resources: { per_rep: rows.map((r) => ({ rep: r.rep, ...r.resources })) }, cleanup,
  limitations: ["Invariants are binary pass/fail on a disposable PG; no RTO/RPO number is derived. RPO/RTO/retention horizon are decided only after M-6b/c (proposal D6).",
    "lease_ttl default stays null: NO BASIS until takeover timing is measured against a real source deadline."],
  extra: { raw_dir_not_committed: dir } });
writeReceipt(join(receiptDir, "M-6a-2026-10-21.json"), m6);
console.log(JSON.stringify({ dir, reps: rows.map((r) => ({ rep: r.rep, exit: r.exit_code, tests: r.tests.length })), m4: m4.status, m6a: m6.status }));
