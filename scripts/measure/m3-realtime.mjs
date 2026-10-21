#!/usr/bin/env node
/**
 * M-3 · realtime failure / slow / reconnect / revocation invariants (FIXTURE_LAB, capped correctness, component level).
 *
 * Runs the existing component suites on the host (vitest, no Docker, no lock, max 2 workers):
 *   FE      src/execution/v2/budgets.test.ts + the scoped-stream machine / controller / scale tests + the shared SSE and
 *           profile-realtime tests (injected failing / slow ports, fake timers)
 *   server  apps/control-api/test/elp209-realtime.spec.ts + elp209-native-frame-coordinator.spec.ts (mocked adapter, no PG)
 * and maps the named tests onto the protocol's binary criteria. Revocation latency over a real stream and the source-driven
 * phases (transport drop, slow consumer, epoch rebuild, READ-only / STREAM-only revoke on Core009) are NOT run here: they need
 * a finite Edge window (WINDOW_REQUESTS, section M-3c). Stream-propagation latency is record-only in any case (NO BASIS).
 *
 *   node scripts/measure/m3-realtime.mjs [--reps 3]
 * Each repetition is a full run; a test that passes in one repetition and fails in another is reported as unstable.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { buildReceipt, parseArgs, repoRoot, summarize, writeReceipt } from "./lib/receipt.mjs";

const args = parseArgs(process.argv.slice(2), { reps: { number: true, default: 3 }, date: { default: "2026-10-21" }, "receipt-dir": { default: "" }, "out-dir": { default: "" } });
const receiptDir = args["receipt-dir"] || join(repoRoot, "upgrade/execution_loop/evidence/ELP2-10/measurements");
const work = args["out-dir"] || join(homedir(), ".local/state/portal-execution-elp210", args.date.replaceAll("-", ""), `m3-${Date.now()}`);
mkdirSync(work, { recursive: true, mode: 0o700 });

const FE = ["src/execution/v2/budgets.test.ts", "src/execution/v2/realtime/scopedStreamMachine.test.ts", "src/execution/v2/realtime/scopedStreamController.test.ts",
  "src/execution/v2/realtime/scopedStream.scale.test.ts", "src/execution/sse.test.ts", "src/execution/realtimeRecovery.test.ts", "src/execution/streamHardening.test.tsx",
  "src/execution/v2/readers/scopedRealtime.test.ts", "src/execution/v2/readers/scopedRealtime.conformance.test.ts"];
const SERVER = ["test/elp209-realtime.spec.ts", "test/elp209-native-frame-coordinator.spec.ts"];

const run = (cwd, files, jsonPath) => new Promise((done) => {
  const t0 = Date.now(); const out = [];
  const child = spawn("npx", ["vitest", "run", "--maxWorkers=2", "--reporter=json", `--outputFile=${jsonPath}`, ...files], { cwd, stdio: ["ignore", "pipe", "pipe"], env: process.env });
  child.stdout.on("data", (b) => out.push(b)); child.stderr.on("data", (b) => out.push(b));
  child.on("close", (code) => done({ code, started: t0, ended: Date.now(), tail: Buffer.concat(out).toString().split("\n").slice(-6).join("\n") }));
});

const reps = [];
for (let rep = 1; rep <= args.reps; rep++) {
  const fePath = join(work, `fe-${rep}.json`), svPath = join(work, `server-${rep}.json`);
  const fe = await run(join(repoRoot, "apps/portal/frontend"), FE, fePath);
  const sv = await run(join(repoRoot, "apps/control-api"), SERVER, svPath);
  const tests = [];
  for (const [side, path] of [["fe", fePath], ["server", svPath]]) {
    if (!existsSync(path)) continue;
    const j = JSON.parse(readFileSync(path, "utf8"));
    for (const f of j.testResults) for (const t of f.assertionResults) tests.push({ side, file: f.name.split(/\/(?:src|test)\//).pop(), name: t.fullName, status: t.status, duration_ms: Math.round((t.duration ?? 0) * 100) / 100 });
  }
  reps.push({ rep, fe: { code: fe.code, tail: fe.tail }, server: { code: sv.code, tail: sv.tail }, started: fe.started, ended: sv.ended, tests });
}

const CRITERIA = [
  ["reads_per_second_per_screen_bounded", "<= 1 read/s/screen: a delta storm or a steady 100/s stream folds into bounded re-reads", /delta storm|steady 100\/s|bounded number of notifications|coalesc/i],
  ["auto_resync_budget_then_unavailable", "<= 3 auto-resync per 60 s then unavailable; a gap earns one resnapshot, a second gap closes the channel", /resync|resnapshot|sequence gap|\bgap\b/i],
  ["no_unbounded_reconnect", "no infinite reconnect: a dying transport / failing bootstrap is final, no retry loop", /final|not reopen|no retry|one connection|ten quiet minutes|reconnect admission|caps concurrent reconnect|RECONNECT_LIMIT/i],
  ["hidden_tab_asks_nothing", "a hidden tab triggers no re-read (one on becoming visible)", /hidden/i],
  ["revocation_no_protected_frame_after_commit", "0 restricted frame after a revocation: purge queued frames, deny before read, ignore late completion", /revok|purges all remaining|denies a changed policy|late (?:completion|protected)/i],
  ["stale_or_foreign_cursor_rejected", "stale / replayed / other-filter cursor is rejected before any read", /cursor|Last-Event-ID|tamper/i],
  ["bounded_resources", "queues, clients and in-flight reads are bounded; stop drains without a leak", /bound|caps|drops a nonaccepting|drain|stop/i],
];
const flat = reps.flatMap((r) => r.tests.map((t) => ({ rep: r.rep, ...t })));
const matrix = CRITERIA.map(([id, text, re]) => {
  const names = [...new Set(flat.filter((t) => re.test(t.name)).map((t) => `${t.side}:${t.name}`))];
  const statusFor = (name) => flat.filter((t) => `${t.side}:${t.name}` === name).map((t) => t.status);
  const failing = names.filter((n) => statusFor(n).some((s) => s !== "passed"));
  return { id, criterion: text, matching_tests: names.length, failing, passed_all_reps: names.length > 0 && failing.length === 0 };
});
const unstable = [...new Set(flat.map((t) => `${t.side}:${t.name}`))].filter((n) => new Set(flat.filter((t) => `${t.side}:${t.name}` === n).map((t) => t.status)).size > 1);
const durations = reps.map((r) => r.ended - r.started);
const totals = reps.map((r) => ({ rep: r.rep, fe_exit: r.fe.code, server_exit: r.server.code, passed: r.tests.filter((t) => t.status === "passed").length,
  failed: r.tests.filter((t) => t.status === "failed").length, skipped: r.tests.filter((t) => t.status !== "passed" && t.status !== "failed").length, wall_ms: r.ended - r.started }));
const ok = totals.every((t) => t.fe_exit === 0 && t.server_exit === 0);
const receipt = buildReceipt({
  measurement: "M-3", sub: "a", title: "Realtime failure / slow / reconnect / revocation invariants at component level",
  lane: "FIXTURE_LAB", runKind: "CAPPED_CORRECTNESS", status: flat.length ? "RUN_FIXTURE" : "BLOCKED", startedAtMs: reps[0]?.started, endedAtMs: reps.at(-1)?.ended,
  workload: { repetitions: args.reps, fe_files: FE, server_files: SERVER, ports: "injected failing / slow ports, fake timers (FE); mocked trusted adapter, no PG (server)" },
  limits: { workers: 2, docker: "NONE", lock: "none (light job)" }, stopConditions: ["a vitest run with a non-zero exit is reported per repetition", "an unstable test (pass/fail across repetitions) is listed"],
  results: { all_suites_green: ok, per_repetition: totals, wall_ms: summarize(durations, 0), binary_criteria: matrix, unstable_tests: unstable,
    slowest_tests_ms: flat.filter((t) => t.rep === 1).sort((a, b) => b.duration_ms - a.duration_ms).slice(0, 8).map((t) => ({ name: t.name, ms: t.duration_ms })),
    record_only: { revocation_to_stream_close_latency: "NOT_MEASURED: needs a real stream; no threshold exists (NO BASIS, needs Edge/Bobby)" } },
  resources: null, cleanup: { containers: "none created", note: "vitest workers exit with the run" },
  limitations: ["Component level: injected ports and fake timers, no real EventSource, no source, no Core009.",
    "Transport drop, slow consumer, epoch rebuild, READ-only / STREAM-only revoke on a real stream, 1-hour hidden tab are not run (window M-3c).",
    "Criteria matching is by test-name pattern: a criterion with zero matching tests would show matching_tests=0 and passed_all_reps=false.",
    "Durations are host-load dependent; the invariants are not."],
  extra: { raw_dir_not_committed: work } });
writeReceipt(join(receiptDir, "M-3-2026-10-21.json"), receipt);
console.log(JSON.stringify({ work, ok, totals, matrix: matrix.map((m) => [m.id, m.matching_tests, m.passed_all_reps]), unstable }));
