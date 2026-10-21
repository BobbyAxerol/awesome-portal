#!/usr/bin/env node
/**
 * M-1 · cost of one tab at volume (FIXTURE_LAB / BFF_DOUBLE, capped correctness, host Playwright, no Docker, no lock).
 *
 *   stage uxm   UXM-10 coexistence spec (32 routes, idle visible / hidden, drawer + 3-pass SPA loop, keyboard/axe) in
 *               MEASURE mode on 1 worker and again on 2 workers: the counts must be identical (rule R-A falsifier), then once
 *               in GUARD mode (the spec's own ceilings, protocols B-1/B-2/B-4/B-7/B-9).
 *   stage a     32 routes x scales small/medium/large: counts, bytes, JS heap, DOM nodes, main-thread time, route-ready wall time,
 *               row-like DOM elements (e2e/_probe-measure-m1-browser-cost.spec.ts, phase a).
 *   stage b     the same build behind a gzip front that mirrors deploy/nginx/portal.conf: wire bytes cold and warm (phase b).
 *
 * Workers are capped at 2 (host rule). A loaded host invalidates timing but not counts: loadavg is sampled and written into
 * the receipt. Each stage's Playwright JSON report is parsed, so a failing test is a failure of the receipt, not a footnote.
 *
 *   node scripts/measure/m1-browser-cost.mjs [--stages uxm,a,b] [--scales small,medium,large] [--workers 2] [--out-dir DIR]
 *   node scripts/measure/m1-browser-cost.mjs --from DIR        re-derive the receipt from a finished run directory
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, loadavg } from "node:os";
import { join, resolve } from "node:path";

import { buildReceipt, parseArgs, readJsonl, repoRoot, sha256File, summarize, writeReceipt } from "./lib/receipt.mjs";

const args = parseArgs(process.argv.slice(2), {
  stages: { default: "uxm,a,b" }, scales: { default: "small,medium,large" }, workers: { number: true, default: 2 },
  "out-dir": { default: "" }, from: { default: "" }, "rerun-failed": { flag: true }, date: { default: "2026-10-21" }, "receipt-dir": { default: "" },
});
if (args.workers > 2) throw new Error("host rule: --workers is capped at 2");
const frontend = join(repoRoot, "apps/portal/frontend");
const receiptDir = args["receipt-dir"] || join(repoRoot, "upgrade/execution_loop/evidence/ELP2-10/measurements");
const work = args.from ? resolve(args.from) : (args["out-dir"] || join(homedir(), ".local/state/portal-execution-elp210", args.date.replaceAll("-", ""), `m1-${Date.now()}`));
mkdirSync(work, { recursive: true, mode: 0o700 });
const loadSamples = [];
const sampler = setInterval(() => loadSamples.push({ t: Date.now(), l1: Math.round(loadavg()[0] * 100) / 100 }), 15_000);

function run(label, extraArgs, env) {
  return new Promise((done) => {
    const log = join(work, `${label}.log`);
    const out = []; const t0 = Date.now();
    const child = spawn("npx", ["playwright", "test", "-c", "playwright.measure.config.ts", `--workers=${extraArgs.workers}`, ...extraArgs.cli], {
      cwd: frontend, env: { ...process.env, ...env, MEASURE_PW_JSON: join(work, `${label}.pw.json`), MEASURE_PW_OUT: join(work, `${label}.results`) }, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (b) => out.push(b)); child.stderr.on("data", (b) => out.push(b));
    child.on("close", (code) => { writeFileSync(log, Buffer.concat(out)); done({ label, code, started: t0, ended: Date.now() }); });
  });
}
const pwStats = (label) => {
  const p = join(work, `${label}.pw.json`);
  if (!existsSync(p)) return null;
  const j = JSON.parse(readFileSync(p, "utf8"));
  const failed = [];
  const walk = (suite) => { for (const s of suite.suites ?? []) walk(s); for (const spec of suite.specs ?? []) if (!spec.ok) failed.push(spec.title); };
  for (const s of j.suites) walk(s);
  return { expected: j.stats.expected, unexpected: j.stats.unexpected, skipped: j.stats.skipped, flaky: j.stats.flaky, duration_ms: Math.round(j.stats.duration), failed_titles: failed };
};

const stages = new Set(args.stages.split(","));
const runs = [];
if (!args.from) {
  const base = { MEASURE_SKIP_BUILD: "1" };
  const first = { MEASURE_SKIP_BUILD: existsSync(join(frontend, "dist-v2/index.html")) && process.env.MEASURE_FORCE_BUILD !== "1" ? "1" : "0" };
  let env1 = first;
  if (stages.has("uxm")) {
    for (const w of [1, args.workers]) {
      const jsonl = join(work, `uxm-measure-w${w}.jsonl`); rmSync(jsonl, { force: true });
      runs.push(await run(`uxm-measure-w${w}`, { workers: w, cli: ["--grep", "budget ·|idle ·|client-side navigation"] }, { ...env1, UXM10_MEASURE_OUT: jsonl }));
      env1 = base;
    }
    runs.push(await run("uxm-guard", { workers: args.workers, cli: ["--grep-invert", "coexistence ·"] }, env1));
  }
  if (stages.has("a") || stages.has("b")) {
    const jsonl = join(work, "m1.jsonl"); rmSync(jsonl, { force: true });
    runs.push(await run("m1", { workers: args.workers, cli: ["--grep", "m1a ·|m1b ·"] },
      { ...env1, MEASURE_OUT: jsonl, MEASURE_SCALES: args.scales, MEASURE_PHASES: [...stages].filter((s) => s === "a" || s === "b").join(",") }));
  }
}
/* A visibility timeout on a loaded shared host is a harness flake, not a measurement: re-run exactly the failed tests once, append
   their rows to the same JSONL, and keep BOTH the original failure and the re-run result in the receipt. */
const reruns = {};
for (const label of ["uxm-measure-w1", `uxm-measure-w${args.workers}`, "uxm-guard", "m1"]) {
  const st = pwStats(label), rr = pwStats(`${label}-rerun`);
  if (st && rr && st.failed_titles.length) reruns[label] = { original_failed_titles: st.failed_titles, rerun: rr, exit_code: rr.unexpected === 0 ? 0 : 1 };
}
if (args["rerun-failed"]) {
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
  const plan = [["uxm-measure-w1", ["--grep"], { UXM10_MEASURE_OUT: "uxm-measure-w1.jsonl" }, 1], [`uxm-measure-w${args.workers}`, ["--grep"], { UXM10_MEASURE_OUT: `uxm-measure-w${args.workers}.jsonl` }, args.workers],
    ["uxm-guard", ["--grep"], {}, args.workers], ["m1", ["--grep"], { MEASURE_OUT: "m1.jsonl", MEASURE_SCALES: args.scales, MEASURE_PHASES: "a,b" }, args.workers]];
  for (const [label, cli, envFiles, workers] of plan) {
    const st = pwStats(label);
    if (!st || !st.failed_titles.length) continue;
    const env = Object.fromEntries(Object.entries(envFiles).map(([k, v]) => [k, /\.jsonl$/.test(v) ? join(work, v) : v]));
    const r = await run(`${label}-rerun`, { workers, cli: [...cli, st.failed_titles.map(esc).join("|")] }, { MEASURE_SKIP_BUILD: "1", ...env });
    runs.push(r);
    reruns[label] = { original_failed_titles: st.failed_titles, rerun: pwStats(`${label}-rerun`), exit_code: r.code };
  }
}
clearInterval(sampler);

/* ── derive ─────────────────────────────────────────────────────────────────────────────────────────────────────── */
const read = (name) => (existsSync(join(work, name)) ? readJsonl(join(work, name)) : []);
const m1 = (() => { const rows = read("m1.jsonl"); return [...new Map(rows.map((r) => [`${r.kind}:${r.scale ?? ""}:${r.name}`, r])).values()]; })();
const rowsA = m1.filter((r) => r.kind === "m1a");
const rowsB = m1.filter((r) => r.kind === "m1b");
const byScale = {};
for (const scale of args.scales.split(",")) {
  const rows = rowsA.filter((r) => r.scale === scale);
  if (!rows.length) continue;
  const col = (f) => rows.map(f);
  byScale[scale] = {
    routes: rows.length,
    first_load_api_requests: summarize(col((r) => r.first.api)), first_load_api_bytes: summarize(col((r) => r.first.apiBytes)),
    first_load_assets: summarize(col((r) => r.first.assets)), first_load_asset_bytes: summarize(col((r) => r.first.assetBytes)),
    js_heap_used_bytes: summarize(col((r) => r.cost.jsHeapUsedBytes)), dom_nodes: summarize(col((r) => r.cost.domNodes)),
    main_thread_task_s: summarize(col((r) => r.cost.taskDurationS), 4), script_s: summarize(col((r) => r.cost.scriptDurationS), 4),
    layout_s: summarize(col((r) => r.cost.layoutDurationS), 4), style_recalc_s: summarize(col((r) => r.cost.recalcStyleDurationS), 4),
    route_ready_wall_ms: summarize(col((r) => r.ready_wall_ms), 1), rows_like_elements: summarize(col((r) => r.rows_like_elements)),
    tab_switch_api_requests: summarize(rows.filter((r) => r.tab).map((r) => r.tab.api)), tab_switch_api_bytes: summarize(rows.filter((r) => r.tab).map((r) => r.tab.apiBytes)),
    foreign_requests_total: rows.reduce((a, r) => a + r.foreign, 0), console_noise_total: rows.reduce((a, r) => a + r.console_noise, 0),
  };
}
const growth = {};
{
  const key = (r) => `${r.name}`;
  const small = new Map(rowsA.filter((r) => r.scale === "small").map((r) => [key(r), r]));
  for (const scale of ["medium", "large"]) {
    const rows = rowsA.filter((r) => r.scale === scale);
    growth[`${scale}_vs_small`] = rows.filter((r) => small.has(key(r))).map((r) => { const s = small.get(key(r)); return {
      route: r.name, api_bytes_x: Math.round(r.first.apiBytes / Math.max(1, s.first.apiBytes) * 100) / 100,
      dom_nodes_x: Math.round(r.cost.domNodes / Math.max(1, s.cost.domNodes) * 100) / 100,
      rows_small: s.rows_like_elements, rows_scale: r.rows_like_elements, api_requests_small: s.first.api, api_requests_scale: r.first.api }; })
      .sort((a, b) => b.dom_nodes_x - a.dom_nodes_x);
  }
}
const perRoute = rowsA.map((r) => ({ scale: r.scale, route: r.name, api: r.first.api, api_unique: r.first.apiUnique, api_bytes: r.first.apiBytes, assets: r.first.assets,
  asset_bytes: r.first.assetBytes, heap_bytes: Math.round(r.cost.jsHeapUsedBytes), dom_nodes: r.cost.domNodes, task_s: Math.round(r.cost.taskDurationS * 1e4) / 1e4,
  ready_ms: r.ready_wall_ms, rows_like: r.rows_like_elements, tab_api: r.tab?.api ?? null }));

// UXM determinism: the counts of the 1-worker and the 2-worker measure runs must agree row by row.
const idx = (rows) => new Map(rows.map((r) => [`${r.kind}:${r.name ?? ""}`, r]));
const dedupe = (rows) => [...new Map(rows.map((r) => [`${r.kind}:${r.name ?? ""}`, r])).values()];
const w1 = dedupe(read("uxm-measure-w1.jsonl")), w2 = dedupe(read(`uxm-measure-w${args.workers}.jsonl`));
const diffs = [];
if (w1.length && w2.length) {
  const a = idx(w1), b = idx(w2);
  for (const [k, ra] of a) {
    const rb = b.get(k);
    if (!rb) { diffs.push({ row: k, diff: "missing in 2-worker run" }); continue; }
    const strip = (r) => JSON.stringify(r, (key, v) => (key === "ready_wall_ms" || key === "idle_wall_ms" ? undefined : v));
    if (strip(ra) !== strip(rb)) diffs.push({ row: k, one_worker: ra, two_workers: rb });
  }
  for (const k of b.keys()) if (!a.has(k)) diffs.push({ row: k, diff: "missing in 1-worker run" });
}
const idleRows = w2.filter((r) => r.kind === "idle");
const budgetRows = w2.filter((r) => r.kind === "budget");
const uxm = {
  measure_w1: pwStats("uxm-measure-w1"), measure_w2: pwStats(`uxm-measure-w${args.workers}`), guard_mode: pwStats("uxm-guard"),
  count_rows_compared: w1.length, count_differences_between_worker_counts: diffs.length, differences: diffs.slice(0, 10),
  idle: { routes: idleRows.length, visible_idle_requests_10s_max: Math.max(0, ...idleRows.map((r) => r.short)), visible_idle_requests_60s: Object.fromEntries(idleRows.filter((r) => r.long > 0).map((r) => [r.name, r.long])),
    hidden_requests_60s_max: Math.max(0, ...idleRows.map((r) => r.hidden)), resumed_requests_max: Math.max(0, ...idleRows.map((r) => r.resumed)) },
  first_load_api_requests_max: Math.max(0, ...budgetRows.map((r) => r.first.api)), listeners: w2.find((r) => r.kind === "listeners") ?? null,
};

// M-1b
const ratio = (a, b) => (b > 0 ? Math.round(a / b * 1000) / 1000 : null);
const b = {
  routes: rowsB.length, front: rowsB[0]?.front ?? null,
  cold_assets_decoded_bytes: summarize(rowsB.map((r) => r.cold.assetDecodedBytes)), cold_assets_wire_bytes: summarize(rowsB.map((r) => r.cold.assetWireBytes)),
  cold_wire_over_decoded_assets: summarize(rowsB.map((r) => ratio(r.cold.assetWireBytes, r.cold.assetDecodedBytes)).filter((x) => x !== null), 3),
  cold_api_decoded_bytes: summarize(rowsB.map((r) => r.cold.apiDecodedBytes)), cold_api_gzip_estimate_bytes: summarize(rowsB.map((r) => r.cold.apiGzipEstimateBytes)),
  warm_cache: "NOT_MEASURED: Playwright page.route() (needed for the BFF doubles) disables the HTTP cache, so the second navigation re-downloaded everything (same file count, same wire bytes as cold). A warm-cache figure needs the API served by a real process (fixture BFF behind the front) instead of route stubs; not built here.",
  warm_second_navigation_api_requests: summarize(rowsB.map((r) => r.warm.apiRequests)),
  per_route: rowsB.map((r) => ({ route: r.name, cold_asset_files: r.cold.assets, cold_asset_decoded: r.cold.assetDecodedBytes, cold_asset_wire: r.cold.assetWireBytes,
    cold_api_decoded: r.cold.apiDecodedBytes, cold_api_gzip_est: r.cold.apiGzipEstimateBytes, warm_api_requests: r.warm.apiRequests })),
  brotli: "NOT_MEASURED: deploy/nginx/portal.conf enables gzip only (no brotli module configured); a brotli front is a deployment decision, not a measurement here.",
};

const logTimes = readdirSync(work).filter((n) => n.endsWith(".log")).map((n) => statSync(join(work, n)).mtimeMs);
const times = logTimes.length ? { s: Math.round(statSync(work).birthtimeMs), e: Math.round(Math.max(...logTimes)) } : { s: null, e: null };
const failedRuns = runs.filter((r) => r.code !== 0).map((r) => ({ label: r.label, exit_code: r.code }));
// A row can be present twice only if a first attempt recorded and then failed an assertion; keep the LAST row per key.
const status = rowsA.length || rowsB.length || w2.length ? "RUN_FIXTURE" : "BLOCKED";
const receipt = buildReceipt({
  measurement: "M-1", sub: "a+b", title: "Cost of one browser tab at fixture volume: counts, bytes, heap, DOM, main-thread time, gzip transfer",
  lane: "BFF_DOUBLE", runKind: "CAPPED_CORRECTNESS", status, startedAtMs: times.s, endedAtMs: times.e,
  workload: { routes: 32, scales: args.scales.split(","), per_route: "cold load (new context = empty cache), first tab switch where a tablist exists",
    uxm_spec: "apps/portal/frontend/e2e/execution-v2-coexistence.spec.ts (measure mode on 1 and 2 workers, then guard mode)",
    spec: "apps/portal/frontend/e2e/_probe-measure-m1-browser-cost.spec.ts", config: "apps/portal/frontend/playwright.measure.config.ts",
    browser: "Playwright chromium (headless), viewport 1440x900, cache cold per test, page clock fixed at the double's NOW",
    doubles: "in-process BFF doubles (apps/portal/frontend/e2e/bffDouble*.ts), FIXTURE_SCALE via bffScale.setFixtureScale",
    gzip_front: "emulates deploy/nginx/portal.conf (gzip level 5, >= 1024 B, json/js/css/text/svg, immutable /assets/)" },
  limits: { workers: args.workers, docker: "NONE", chromium_instances: "1 per worker", note: "host Playwright/node only" },
  stopConditions: ["any request leaving the app origin fails the test (foreign must be 0)", "a failing Playwright test is listed in failed_titles and marks the stage failed",
    "worker cap 2", "no Docker, no lock, no other container touched"],
  results: { guards_and_determinism: uxm, m1a_by_scale: byScale, m1a_growth_vs_small: growth, m1a_per_route: perRoute, m1b_gzip_front: b,
    playwright: { m1: pwStats("m1"), reruns_of_failed_tests: reruns, note: "an original failure is a visibility timeout under host load; the failing tests were re-run once, rows appended" }, failed_runs_original: failedRuns, failed_runs_after_rerun: Object.entries(reruns).filter(([, v]) => v.exit_code !== 0).map(([k]) => k) },
  resources: { host_loadavg_samples_15s: loadSamples, loadavg_1m_start: loadSamples[0]?.l1 ?? null, loadavg_1m_max: loadSamples.length ? Math.max(...loadSamples.map((x) => x.l1)) : null,
    note: "task/script/layout times and wall times are valid only with the loadavg shown; counts and bytes are load-independent" },
  cleanup: { webserver_port: 4376, note: "Playwright stops its own webServer; contexts are closed by the runner; dist-v2 is gitignored build output" },
  limitations: ["Doubles answer in-process with 5-50 rows per list (small) up to 1,500 orders / 400 operations (large): NOT 10^3-10^5 rows, so the virtualization break point is not located.",
    "Byte counts depend on the fixtures; they are regression guards, never production budgets (rule R-B).",
    "JS heap is after a forced GC at one instant; main-thread time is CDP TaskDuration (cumulative from page start) - no CPU throttling, no real device.",
    "route_ready_wall_ms is a TTI proxy (navigation to the V2 root being non-loading) on a loaded shared host, not Lighthouse TTI.",
    "Real source, real API latency, real network and brotli are not part of this run (M-1c needs Core009 + a window).",
    "FIXTURE numbers are not calibration evidence and approve nothing."],
  extra: { raw_dir_not_committed: work, dist_v2_index_html_sha256: existsSync(join(frontend, "dist-v2/index.html")) ? sha256File(join(frontend, "dist-v2/index.html")) : null, spec_json_digests: Object.fromEntries(["uxm-measure-w1", `uxm-measure-w${args.workers}`, "uxm-guard", "m1"].filter((n) => existsSync(join(work, `${n}.pw.json`))).map((n) => [n, sha256File(join(work, `${n}.pw.json`))])) },
});
writeReceipt(join(receiptDir, "M-1-2026-10-21.json"), receipt);
console.log(JSON.stringify({ work, status, uxm_diffs: diffs.length, rowsA: rowsA.length, rowsB: rowsB.length, failedRuns }));
