#!/usr/bin/env node
/**
 * M-6b · restore drill on a disposable PostgreSQL (capped correctness; lane FIXTURE_LAB; never touches a production database).
 *
 * Per repetition (a fresh cell, scripts/measure/m6-drill-cell.sh, under /tmp/portal-heavy.lock): seed a live tenure with two
 * committed revisions -> pg_dump -> pg_restore into a NEW database -> ops reset (resetAfterRestore with the recorded epoch) -> prove the
 * old holder cannot renew / commit / release, a new tenure commits, history is byte-identical -> RTO = restore start to the first valid
 * revision committed. RTO / RPO / retention horizon stay record-only: Bobby fixes them after M-6 (proposal D6), and a drill on a few
 * kilobytes of TEST_ONLY rows says nothing about production restore time.
 *
 *   node scripts/measure/m6-restore-drill.mjs [--reps 2] [--lock-wait-s 7200]    |    --from DIR [DIR ...]   re-derive from finished runs
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { buildReceipt, parseArgs, repoRoot, sha256File, summarize, writeReceipt } from "./lib/receipt.mjs";

const args = parseArgs(process.argv.slice(2), { reps: { number: true, default: 2 }, "lock-wait-s": { number: true, default: 7200 }, from: { default: "" },
  "node-cpus": { default: "2" }, "node-mem": { default: "2g" }, "pg-cpus": { default: "1" }, "pg-mem": { default: "1g" }, "timeout-s": { number: true, default: 600 },
  date: { default: "2026-10-21" }, "receipt-dir": { default: "" } });
const receiptDir = args["receipt-dir"] || join(repoRoot, "upgrade/execution_loop/evidence/ELP2-10/measurements");
const dirs = [];
if (args.from) dirs.push(...args.from.split(",").map((d) => resolve(d)));
else {
  const base = join(homedir(), ".local/state/portal-execution-elp210", args.date.replaceAll("-", ""), `m6b-${Date.now()}`);
  for (let rep = 1; rep <= args.reps; rep++) {
    const out = join(base, `rep-${rep}`); mkdirSync(out, { recursive: true, mode: 0o700 });
    const r = spawnSync("flock", ["-w", String(args["lock-wait-s"]), "/tmp/portal-heavy.lock", "bash", join(repoRoot, "scripts/measure/m6-drill-cell.sh"), "--out", out,
      "--node-cpus", args["node-cpus"], "--node-mem", args["node-mem"], "--pg-cpus", args["pg-cpus"], "--pg-mem", args["pg-mem"], "--timeout-s", String(args["timeout-s"])], { stdio: "inherit" });
    if (r.status !== 0) console.error(`drill rep ${rep} exited ${r.status}`);
    dirs.push(out);
  }
}
const read = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);
const reps = dirs.map((dir, i) => {
  const phases = read(join(dir, "phases.json")), seed = read(join(dir, "seed.json")), verify = read(join(dir, "verify.json")), cleanup = read(join(dir, "cleanup.json"));
  return { rep: i + 1, dir, phases, seed, verify, cleanup, verify_log_sha256: existsSync(join(dir, "verify.log")) ? sha256File(join(dir, "verify.log")) : null };
});
const ok = (r) => r.phases?.verify_exit === 0 && r.verify && Object.values(r.verify.checks).every(Boolean) && r.phases.signatures_equal === true;
const good = reps.filter(ok);
const started = Math.min(...reps.map((r) => r.phases?.dump_start_ms ?? Infinity).filter(Number.isFinite)), ended = Math.max(...reps.map((r) => r.verify?.steps?.at(-1)?.at_ms ?? 0));
const receipt = buildReceipt({
  measurement: "M-6", sub: "b restore drill", title: "Backup -> restore -> reset-after-restore -> old holder fenced -> new tenure commits (disposable PostgreSQL)",
  lane: "FIXTURE_LAB", runKind: "CAPPED_CORRECTNESS", status: reps.length ? "RUN_FIXTURE" : "BLOCKED", startedAtMs: Number.isFinite(started) ? started : null, endedAtMs: ended || null,
  workload: { runner: "scripts/measure/m6-drill-cell.sh + apps/control-api/test/elp210-measure-m6-restore-drill.spec.ts (skipped unless M6_PHASE is set)", repetitions: reps.length,
    sequence: ["seed: lease acquired (300 s TTL, left LIVE), 2 immutable revisions committed", "pg_dump (custom) of the source DB", "createdb + pg_restore --exit-on-error into a new DB",
      "hazard check: the old holder can still renew on the restored DB", "resetAfterRestore with a WRONG epoch (refused) then the recorded epoch (accepted)",
      "old holder: renew false, release false, commit rejected MANAGER_LEASE_LOST", "new tenure acquires (token and epoch advance) and commits the next revision", "history and old revisions byte-identical; table signatures equal"],
    data: "TEST_ONLY synthetic Manager documents (a few KB); NOT a production dataset" },
  limits: { node_cpus: reps[0]?.phases?.node_cpus, node_memory: reps[0]?.phases?.node_mem, postgres_cpus: reps[0]?.phases?.pg_cpus, postgres_memory: reps[0]?.phases?.pg_mem, network: "DISPOSABLE_INTERNAL_ONLY" },
  stopConditions: ["any failed phase stops the cell; the receipt keeps the failing repetition", "pg_restore --exit-on-error", "timeout per node phase"],
  results: { all_repetitions_passed: reps.length > 0 && good.length === reps.length,
    binary_checks_per_rep: reps.map((r) => ({ rep: r.rep, checks: r.verify?.checks ?? null, signatures_equal: r.phases?.signatures_equal ?? null, verify_exit: r.phases?.verify_exit ?? null })),
    timings_ms: { dump: summarize(good.map((r) => r.phases.dump_end_ms - r.phases.dump_start_ms), 0), restore: summarize(good.map((r) => r.verify.restore_ms), 0),
      rto_restore_start_to_first_valid_revision: summarize(good.map((r) => r.verify.rto_ms), 0), reset_to_first_commit: summarize(good.map((r) => r.verify.reset_to_first_commit_ms), 0) },
    rto_definition: "from the start of createdb + pg_restore to the first valid revision committed by the NEW tenure (protocol M-6)", dump_bytes: good.map((r) => r.phases.dump_bytes),
    tokens: good.map((r) => ({ old: r.verify.token_old, new: r.verify.token_new })), steps_rep1: reps[0]?.verify?.steps ?? null,
    not_covered: ["grant restoration (no grants in this scope; Core009 not mounted)", "source epoch / generation / floor comparison and resnapshot (needs a source)", "quiescing replicas (single PG, single writer)", "pg_restore of a production-size database"] },
  resources: null, cleanup: reps.map((r) => ({ rep: r.rep, ...r.cleanup })),
  limitations: ["RTO here is the cost of the mechanism on kilobytes of TEST_ONLY rows; it is NOT an RTO for production data and must not become one. RPO / RTO / retention are set by Bobby after M-6 (D6).",
    "M-6c (fill 1,024 revisions / 8 MiB to see the stop-without-delete behaviour on production-like data) is not run: it needs the exclusive window and is never run against a production database.",
    "The measured RTO (3-5 s) is dominated by starting the verify container (docker run + vitest start) between pg_restore and the first commit; pg_dump ~0.2 s and pg_restore ~0.3 s on ~12 KB. It is a mechanism check, never an RTO.",
    "The hazard step proves why the ops reset exists: after a plain restore the old holder is still valid until reset."],
  extra: { raw_dirs_not_committed: dirs } });
writeReceipt(join(receiptDir, "M-6b-2026-10-21.json"), receipt);
console.log(JSON.stringify({ reps: reps.map((r) => [r.rep, ok(r), r.verify?.rto_ms ?? null]), status: receipt.status }));
