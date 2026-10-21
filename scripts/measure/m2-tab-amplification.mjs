#!/usr/bin/env node
/**
 * M-2 · browser -> Portal amplification, tab sweep 1 / 2 / 4 / 8 / 16 (tiers 1-2, FIXTURE_LAB / BFF_DOUBLE).
 *
 * Orchestrates e2e/_probe-measure-m2-tab-sweep.spec.ts (host Playwright, 1 worker because one cell opens N pages, no Docker, no
 * lock) and derives, per tab count: browser requests per phase, per-tab cost, a linear fit of idle-visible requests against
 * the tab count, and the hidden / resumed invariants. Tier 3 (Core -> Edge / source calls) and tier 4 (TS / PM calls attributed
 * to the Portal) cannot exist in the fixture lane; the 2-user cells (same scope / different scope) are meaningless without
 * real scopes and sessions. Those are the window cells: `scripts/measure/m2-window-sweep.mjs`, request in WINDOW_REQUESTS.
 *
 *   node scripts/measure/m2-tab-amplification.mjs [--tabs 1,2,4,8,16] [--idle-ms 600000] [--hidden-ms 300000]
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, loadavg } from "node:os";
import { join, resolve } from "node:path";

import { buildReceipt, parseArgs, readJsonl, repoRoot, sha256File, writeReceipt } from "./lib/receipt.mjs";
import { loadWindow, remainingMs } from "./lib/window.mjs";

const args = parseArgs(process.argv.slice(2), { tabs: { default: "1,2,4,8,16" }, "idle-ms": { number: true, default: 600_000 }, "hidden-ms": { number: true, default: 300_000 },
  from: { default: "" }, date: { default: "2026-10-21" }, "receipt-dir": { default: "" }, "skip-build": { flag: true },
  // Window mode (real Portal origin, real session, real time). Refuses without the grantor's authorisation record.
  window: { flag: true }, authorization: { default: "" }, "authorization-sha256": { default: "" }, "storage-state": { default: "" }, "route-map": { default: "" }, out: { default: "" } });
const frontend = join(repoRoot, "apps/portal/frontend");
let windowRecord = null;
if (args.window) {
  try {
    windowRecord = loadWindow(args.authorization, args["authorization-sha256"], { measurement: "M-2", allowLanes: ["REAL_READ_RETAINED", "REAL_READ_QUALIFIED"] });
    const tabsList = args.tabs.split(",").map(Number);
    if (Math.max(...tabsList) > windowRecord.max_tabs) throw new Error("REFUSED:TABS_EXCEED_WINDOW_MAX_TABS");
    if (!args["storage-state"] || !existsSync(args["storage-state"])) throw new Error("REFUSED:--storage-state (Playwright storageState file, 0600, outside the repository) is required");
    if ((statSync(args["storage-state"]).mode & 0o077) !== 0) throw new Error("REFUSED:storage-state file must be mode 0600");
    const perCellMs = args["idle-ms"] + args["hidden-ms"] + 4 * 60_000;
    if (tabsList.length * perCellMs > remainingMs(windowRecord)) throw new Error(`REFUSED:PLANNED_${tabsList.length * perCellMs}_MS_EXCEEDS_WINDOW_${remainingMs(windowRecord)}_MS`);
    if (args["idle-ms"] < 600_000 || args["hidden-ms"] < 300_000) throw new Error("REFUSED:window cells use the protocol durations (idle >= 600000 ms, hidden >= 300000 ms)");
  } catch (e) {
    console.error(String(e.message ?? e));
    process.exit(3);
  }
}
const receiptDir = args["receipt-dir"] || join(repoRoot, "upgrade/execution_loop/evidence/ELP2-10/measurements");
const work = args.from ? resolve(args.from) : join(homedir(), ".local/state/portal-execution-elp210", args.date.replaceAll("-", ""), `m2-${Date.now()}`);
mkdirSync(work, { recursive: true, mode: 0o700 });
const jsonl = join(work, "m2.jsonl");
const loads = [];
const sampler = setInterval(() => loads.push({ t: Date.now(), l1: Math.round(loadavg()[0] * 100) / 100 }), 15_000);

let started = null, ended = null, exit = null;
if (!args.from) {
  rmSync(jsonl, { force: true });
  started = Date.now();
  exit = await new Promise((done) => {
    const out = [];
    const realEnv = windowRecord ? { MEASURE_REAL: "1", MEASURE_REAL_BASE_URL: windowRecord.origin, MEASURE_STORAGE_STATE: args["storage-state"], MEASURE_ROUTE_MAP: args["route-map"], MEASURE_LANE: windowRecord.lane } : {};
    const child = spawn("npx", ["playwright", "test", "-c", windowRecord ? "playwright.measure-real.config.ts" : "playwright.measure.config.ts", "--workers=1", "--grep", "m2 ·"], { cwd: frontend, stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...realEnv, MEASURE_OUT: jsonl, MEASURE_TABS: args.tabs, MEASURE_IDLE_MS: String(args["idle-ms"]), MEASURE_HIDDEN_MS: String(args["hidden-ms"]),
        MEASURE_SKIP_BUILD: args["skip-build"] || existsSync(join(frontend, "dist-v2/index.html")) ? "1" : "0", MEASURE_PW_JSON: join(work, "m2.pw.json"), MEASURE_PW_OUT: join(work, "results") } });
    child.stdout.on("data", (b) => out.push(b)); child.stderr.on("data", (b) => out.push(b));
    child.on("close", (code) => { writeFileSync(join(work, "m2.log"), Buffer.concat(out)); done(code); });
  });
  ended = Date.now();
}
clearInterval(sampler);

const rows = existsSync(jsonl) ? readJsonl(jsonl).filter((r) => r.kind === "m2") : [];
const ran = rows.filter((r) => r.status === "RUN");
const phaseOf = (r, label) => r.phases.find((p) => p.label === label);
const table = ran.map((r) => {
  const idle = phaseOf(r, "idle_visible"), walk = phaseOf(r, "walk_19_screens_x1"), hid = phaseOf(r, "hidden"), back = phaseOf(r, "show_again"), rel = phaseOf(r, "reload"), open = phaseOf(r, "open_overview");
  const idleSeconds = r.idle_virtual_ms / 1000;
  return { tabs: r.tabs, users: r.users,
    open_overview: { tier1_total: open.tier1_browser_requests_total, per_tab: open.tier1_per_tab, bytes_total: open.tier1_bytes_total },
    idle_visible: { virtual_s: idleSeconds, tier1_total: idle.tier1_browser_requests_total, tier2_total: idle.tier2_bff_double_hits_total, per_tab: idle.tier1_per_tab,
      per_tab_per_60s: Math.round(idle.tier1_browser_requests_total / r.tabs / (idleSeconds / 60) * 100) / 100,
      bff_req_per_s_total: Math.round(idle.tier1_browser_requests_total / idleSeconds * 1000) / 1000, bytes_total: idle.tier1_bytes_total, wall_ms: idle.wall_ms },
    walk_19_screens: { tier1_total: walk.tier1_browser_requests_total, per_tab_mean: Math.round(walk.tier1_browser_requests_total / r.tabs * 10) / 10, tier2_total: walk.tier2_bff_double_hits_total, bytes_total: walk.tier1_bytes_total, wall_ms: walk.wall_ms },
    hidden: { virtual_s: r.hidden_virtual_ms / 1000, tier1_total: hid.tier1_browser_requests_total + (phaseOf(r, "hide_transition")?.tier1_browser_requests_total ?? 0), tier2_total: hid.tier2_bff_double_hits_total, includes: "hide_transition (the visibilitychange itself) + the hidden window" },
    show_again: { tier1_total: back.tier1_browser_requests_total }, reload: { tier1_total: rel.tier1_browser_requests_total, per_tab_mean: Math.round(rel.tier1_browser_requests_total / r.tabs * 10) / 10 },
    tier2_equals_tier1: ["idle_visible", "walk_19_screens_x1", "hidden"].every((l) => phaseOf(r, l).tier1_browser_requests_total === phaseOf(r, l).tier2_bff_double_hits_total),
    phase_windows_ms: Object.fromEntries(r.phases.map((p) => [p.label, [p.started_at_ms ?? null, p.ended_at_ms ?? null]])), lane: r.lane ?? null,
    foreign_total: r.phases.reduce((a, p) => a + p.foreign_total, 0), memory_available_mib_min: Math.min(...r.phases.map((p) => p.memory_available_mib)), wall_ms: r.wall_ms,
    bff_double_paths: r.bff_double_paths };
});
// Least-squares fit total = a + b * tabs on the idle-visible window (and on the 19-screen walk).
function fit(points) {
  const n = points.length; if (n < 2) return null;
  const sx = points.reduce((a, p) => a + p[0], 0), sy = points.reduce((a, p) => a + p[1], 0);
  const sxx = points.reduce((a, p) => a + p[0] * p[0], 0), sxy = points.reduce((a, p) => a + p[0] * p[1], 0);
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n;
  const mean = sy / n, ssTot = points.reduce((s, p) => s + (p[1] - mean) ** 2, 0), ssRes = points.reduce((s, p) => s + (p[1] - (a + b * p[0])) ** 2, 0);
  return { intercept: Math.round(a * 1000) / 1000, slope_requests_per_tab: Math.round(b * 1000) / 1000, r_squared: ssTot === 0 ? 1 : Math.round((1 - ssRes / ssTot) * 10000) / 10000, points: n };
}
const fits = { idle_visible_total_vs_tabs: fit(table.map((t) => [t.tabs, t.idle_visible.tier1_total])), walk_total_vs_tabs: fit(table.map((t) => [t.tabs, t.walk_19_screens.tier1_total])) };
const aborted = rows.filter((r) => r.status === "ABORTED").map((r) => ({ tabs: r.tabs, reason: r.aborted, opened: r.opened }));
const perTabIdle = table.map((t) => t.idle_visible.per_tab_per_60s);
const linear = fits.idle_visible_total_vs_tabs && fits.idle_visible_total_vs_tabs.r_squared > 0.999;

const status = ran.length ? (windowRecord ? "RUN_WINDOW" : "RUN_FIXTURE") : "BLOCKED";
const receipt = buildReceipt({
  measurement: "M-2", sub: windowRecord ? "tiers 1 (+3-4 from the grantor counters)" : "tiers 1-2",
  title: windowRecord ? "Browser -> Portal amplification by tab count on a real origin (window run, tier 1 here; tiers 2-4 are read from the grantor's counters over the per-phase windows)" : "Browser -> Portal amplification by tab count (tiers 1-2, fixture)",
  lane: windowRecord ? windowRecord.lane : "BFF_DOUBLE", runKind: windowRecord ? windowRecord.run_kind : "CAPPED_CORRECTNESS", windowId: windowRecord?.window_id ?? null, status, startedAtMs: started, endedAtMs: ended,
  workload: { tab_sweep: args.tabs.split(",").map(Number), users: "1 fixture user (ACCESS_DOUBLE_DEFAULT_USER)", scope_classes: "single fixture scope",
    per_tab: `open Overview; idle visible ${args["idle-ms"] / 1000} s virtual; 19 screens x 1 round (client-side navigation); back to Overview; hidden ${args["hidden-ms"] / 1000} s virtual; show; reload`,
    spec: "apps/portal/frontend/e2e/_probe-measure-m2-tab-sweep.spec.ts", clock: "Playwright fake clock per page (pauseAt / runFor in 1 s steps, 15 ms real wait per step)",
    measurement_layers: { tier1: "browser request events to the Portal origin", tier2: "requests answered by the BFF double (counting route)", tier3: "NOT_MEASURABLE_IN_FIXTURE (Core -> Edge / source calls; gap G-2)", tier4: "NOT_MEASURABLE_IN_FIXTURE (TS / PM calls attributed to Portal)" },
    cells_not_run: [{ users: 2, scope: "same scope", reason: "needs real sessions + real scope; the double has one scope" }, { users: 2, scope: "different scope", reason: "same" }] },
  limits: { workers: 1, chromium_pages_max: Math.max(...args.tabs.split(",").map(Number)), docker: "NONE", memory_floor_stop: "MemAvailable < 1.5 GiB before opening a tab aborts the cell" },
  stopConditions: ["MemAvailable < 1.5 GiB before opening a tab: cell recorded as ABORTED, not shortened", "any foreign request fails the cell", "hidden tabs must issue 0 requests (asserted per cell)"],
  results: { per_cell: table, fits, aborted_cells: aborted, playwright_exit_code: exit,
    reading: { per_tab_idle_requests_per_60s: perTabIdle, idle_total_is_linear_in_tabs: linear,
      meaning: "In the fixture lane every tab polls independently (no shared state), so browser reads grow linearly with tabs: slope = the cost ONE visible Overview tab adds. Whether the BFF/Core/Edge absorb that without growing source calls is tier 3, which this lane cannot show." },
    pass_rules_status: { hidden_tab_zero_requests: table.length ? table.every((t) => t.hidden.tier1_total === 0) : null,
      browser_requests_within_guard_x_N: "NOT_EVALUATED: guard B-1..B-8 x N is applied by the window script against the same counters; fixture sweep records the numbers",
      source_calls_slope_zero_R_A: "NOT_EVALUABLE_IN_FIXTURE (tier 3 absent)" } },
  resources: { host_loadavg_samples_15s: loads, loadavg_1m_max: loads.length ? Math.max(...loads.map((x) => x.l1)) : null },
  cleanup: { pages: "all pages closed in finally; Playwright stops its own webServer (port 4376)" },
  limitations: ["Fixture BFF has no store, no pool, no source, no cross-tab state: tiers 2-4 are not measurable; tier 2 equals tier 1 by construction.",
    windowRecord ? "Window run: real time, real session; tab count x cadence is the offered load. Tier 2-4 values are NOT in this receipt: merge the grantor's per-phase counters using phase_windows_ms." : "Virtual clock: 10 min idle / 5 min hidden are virtual (poll cadence is counted, wall time is not the window).",
    "Only the Overview tab polls in the fixture; real per-tab cost with a live stream adds delta-driven re-reads (not present here).",
    "Not a capacity claim: 0.133 req/s/tab at 15 s x 2 reads is the multiplier a real BFF must absorb; the multiplication to N users is illustrative until D5 names a target."],
  extra: { raw_dir_not_committed: work, playwright_json_sha256: existsSync(join(work, "m2.pw.json")) ? sha256File(join(work, "m2.pw.json")) : null } });
writeReceipt(args.out || (windowRecord ? join(work, "M-2-window-receipt.json") : join(receiptDir, "M-2-2026-10-21.json")), receipt);
console.log(JSON.stringify({ work, status, exit, cells: table.map((t) => [t.tabs, t.idle_visible.tier1_total, t.hidden.tier1_total]), fits, aborted }));
