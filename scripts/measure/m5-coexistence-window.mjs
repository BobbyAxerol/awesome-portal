#!/usr/bin/env node
/**
 * M-5 · Portal side of the TS / DL / Research coexistence stages B1 and B2 (T10-06). ABSOLUTE_MEASUREMENT, exclusive window.
 *
 * Edge / TS / DL run B0 and the source-side stages and own the plan (`portal.elp2-10.coexistence-plan.v1`: workload / config /
 * hardware pins, counterbalanced stage order per repetition, minimum_duration_ms, required metrics). This script is what Claude
 * runs INSIDE the window for the Portal's own stage: it replays the declared read workload against the real BFF, records latency
 * and counters, and emits a stage-receipt fragment (`portal.elp2-10.coexistence-stage.v1` shape) for the plan owner to merge with
 * the TS / DL collectors. It never computes a capacity PASS: `scripts/execution-v2/qualification-readiness.mjs` checks structure
 * and the approved bounds (R-C) are applied afterwards.
 *
 * It refuses to start unless ALL of these hold (exit 3):
 *   - an authorisation record from the window grantor, with the sha256 the grantor communicated, naming M-5 and a REAL_READ lane,
 *     inside its time bounds, for this origin (lib/window.mjs)
 *   - a read-only repin (M-0) file observed within --repin-max-age-ms (explicit, no default): Edge / PM SHAs, Core image digest,
 *     root + user lease checked, competing jobs empty
 *   - the plan, pinned by --plan-sha256, with this repetition and stage in its order and the duration >= minimum_duration_ms
 *   - the whole planned duration fitting inside the window (it never shortens a run silently)
 *
 *   node scripts/measure/m5-coexistence-window.mjs --authorization A.json --authorization-sha256 sha256:... \
 *        --repin R.json --repin-max-age-ms 900000 --plan P.json --plan-sha256 sha256:... --repetition-id rep1 --stage B1 \
 *        --header-file ~/secret/session.hdr [--id-map ids.json] [--metric-map map.json] [--out receipt.json]
 *   node scripts/measure/m5-coexistence-window.mjs --selftest      # fixture BFF on 127.0.0.1, FIXTURE_LAB, proves the driver
 *
 * Stop / rollback: STOP_* conditions in lib/replay.mjs end the load at once (the load is GET-only, so there is nothing to roll
 * back on the Portal; session revocation is the grantor's step). Exit codes: 0 completed, 2 stopped early by a safety condition, 3 refused.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { canonical, parseArgs, repoRoot, sha256File, sha256Text, writeReceipt } from "./lib/receipt.mjs";
import { mapMetrics, runStage, stageReceipt } from "./lib/stage.mjs";
import { loadWindow, WindowRefused, WINDOW_SCHEMA } from "./lib/window.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2), {
  authorization: { default: "" }, "authorization-sha256": { default: "" }, repin: { default: "" }, "repin-max-age-ms": { number: true, default: 0 },
  plan: { default: "" }, "plan-sha256": { default: "" }, "repetition-id": { default: "" }, stage: { default: "" }, "header-file": { default: "" },
  "id-map": { default: "" }, "metric-map": { default: "" }, workload: { default: join(here, "workloads/read-sets.v1.json") }, out: { default: "" },
  selftest: { flag: true }, "duration-ms": { number: true, default: 0 }, "receipt-dir": { default: "" },
});
const refuse = (e) => { console.error(String(e.message ?? e)); process.exit(e instanceof WindowRefused || String(e.message).startsWith("REFUSED") ? 3 : 1); };
const receiptDir = args["receipt-dir"] || join(repoRoot, "upgrade/execution_loop/evidence/ELP2-10/measurements");

/* ── selftest: the driver against the fixture BFF, labelled FIXTURE_LAB ────────────────────────────────────────────── */
async function freePort() { return new Promise((ok, no) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); s.on("error", no); }); }
async function selftest() {
  const fixtureDir = join(repoRoot, "apps/portal/fixture-bff");
  const bundle = join(fixtureDir, "dist/server.mjs");
  if (!existsSync(bundle)) {
    await new Promise((ok, no) => spawn("node", ["build.mjs"], { cwd: fixtureDir, stdio: "inherit" }).on("close", (c) => (c === 0 ? ok() : no(new Error("fixture-bff build failed")))));
  }
  const port = await freePort();
  const server = spawn("node", [bundle], { cwd: fixtureDir, env: { ...process.env, PORT: String(port), FIXTURE_HOST: "127.0.0.1", FIXTURE_SCALE: "small" }, stdio: ["ignore", "pipe", "pipe"] });
  try {
    for (let i = 0; i < 50; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/api/v1/execution/runtime-manifest`); if (r.status < 500) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 200)); }
    const now = Date.now();
    const auth = { schema_version: WINDOW_SCHEMA, window_id: "SELFTEST-LOCAL-FIXTURE", granted_by: "self-issued selftest (no grantor)", granted_at_ms: now - 1000, starts_at_ms: now - 1000, ends_at_ms: now + 600_000,
      measurements: ["M-5", "M-7"], lane: "FIXTURE_LAB", run_kind: "CAPPED_CORRECTNESS", base_url: `http://127.0.0.1:${port}`, max_rps: 200, max_tabs: 64, max_duration_ms: 120_000,
      stop_rollback: "kill the fixture BFF child process; GET-only load, nothing to roll back", notes: "driver selftest; not a window" };
    const dir = join(homedir(), ".local/state/portal-execution-elp210", "selftest"); mkdirSync(dir, { recursive: true, mode: 0o700 });
    const authPath = join(dir, `auth-${now}.json`); writeFileSync(authPath, JSON.stringify(auth));
    const w = loadWindow(authPath, sha256File(authPath), { measurement: "M-5", selfTest: true });
    const workload = JSON.parse(readFileSync(args.workload, "utf8"));
    const duration = args["duration-ms"] || 30_000;
    const out = {};
    for (const stage of ["B1", "B2"]) {
      const { replay } = await runStage({ window: w, measurement: "M-5", stage, workload, headersPath: "", idMapPath: "", durationMs: duration, seed: workload.seed, onlyPrefix: "/api/v1/execution/", real: false });
      out[stage] = replay;
    }
    const receipt = stageReceipt({ measurement: "M-5", window: w, stage: "driver-selftest", replay: out.B2, selfTest: true,
      title: "Window load driver selftest against the fixture BFF (B1 then B2) - proves the driver, measures nothing about Portal capacity",
      limitations: ["Fixture BFF on 127.0.0.1: latency is the doubles' in-process answer time. NOT M-5: no TS, DL, Edge, Core009, plan or window.",
        "Only /api/v1/execution/* read paths of the read-set workload are replayed (the fixture BFF does not model /api/admin or /api/auth).",
        "Authorisation is self-issued for the selftest; a real run requires the grantor's record and sha256."],
      extra: { b1: out.B1, b2: out.B2 } });
    receipt.measurement = "M-5"; receipt.sub = "driver-selftest";
    writeReceipt(args.out || join(receiptDir, "M-5-driver-selftest-2026-10-21.json"), receipt);
    console.log(JSON.stringify({ b1: [out.B1.stop_reason, out.B1.requests_completed, out.B1.latency_ms.p95, out.B1.status_histogram], b2: [out.B2.stop_reason, out.B2.requests_completed, out.B2.latency_ms.p95, out.B2.status_histogram] }));
  } finally {
    server.kill("SIGTERM");
    await new Promise((r) => { server.once("close", r); setTimeout(r, 3000); });
  }
}

/* ── window run ──────────────────────────────────────────────────────────────────────────────────────────────────── */
async function windowRun() {
  const need = ["authorization", "authorization-sha256", "repin", "plan", "plan-sha256", "repetition-id", "stage", "header-file"];
  for (const k of need) if (!args[k]) throw new Error(`REFUSED:MISSING_ARGUMENT:--${k}`);
  if (!(args["repin-max-age-ms"] > 0)) throw new Error("REFUSED:--repin-max-age-ms must be set explicitly (> 0): no default age is blessed");
  if (!["B1", "B2"].includes(args.stage)) throw new Error("REFUSED:--stage must be B1 or B2 (B0 belongs to the TS / DL owners)");
  const now = Date.now();
  const w = loadWindow(args.authorization, args["authorization-sha256"], { measurement: "M-5", allowLanes: ["REAL_READ_RETAINED", "REAL_READ_QUALIFIED"], nowMs: now });
  if (w.run_kind !== "ABSOLUTE_MEASUREMENT") throw new Error("REFUSED:M-5 is an ABSOLUTE_MEASUREMENT window");
  const repin = JSON.parse(readFileSync(args.repin, "utf8"));
  if (!Number.isFinite(repin.observed_at_ms) || now - repin.observed_at_ms > args["repin-max-age-ms"] || repin.observed_at_ms > now) throw new Error("REFUSED:REPIN_STALE_OR_FUTURE");
  for (const k of ["edge_sha", "pm_sha", "core_image_digest"]) if (typeof repin[k] !== "string" || !repin[k]) throw new Error(`REFUSED:REPIN_FIELD:${k}`);
  if (repin.lease_root_user_checked !== true || !Array.isArray(repin.competing_jobs) || repin.competing_jobs.length !== 0) throw new Error("REFUSED:REPIN_LEASE_OR_JOBS_NOT_CLEAR");
  if (sha256File(args.plan) !== args["plan-sha256"]) throw new Error("REFUSED:PLAN_DIGEST_MISMATCH");
  const plan = JSON.parse(readFileSync(args.plan, "utf8"));
  if (plan.schema_version !== "portal.elp2-10.coexistence-plan.v1") throw new Error("REFUSED:PLAN_SCHEMA");
  const order = plan.stage_orders?.[args["repetition-id"]];
  if (!Array.isArray(order) || !order.includes(args.stage)) throw new Error("REFUSED:STAGE_NOT_IN_PLAN_ORDER_FOR_REPETITION");
  const duration = args["duration-ms"] || plan.minimum_duration_ms;
  if (!(duration >= plan.minimum_duration_ms)) throw new Error("REFUSED:DURATION_BELOW_PLAN_MINIMUM");
  const workload = JSON.parse(readFileSync(args.workload, "utf8"));
  if (plan.portal_workload_sha256 && plan.portal_workload_sha256 !== workload.digest_input) throw new Error("REFUSED:PORTAL_WORKLOAD_DIGEST_NOT_THE_ONE_PINNED_BY_THE_PLAN");
  const { replay } = await runStage({ window: w, measurement: "M-5", stage: args.stage, workload, headersPath: args["header-file"], idMapPath: args["id-map"], durationMs: duration, seed: workload.seed, real: true });
  const metrics = mapMetrics(args["metric-map"], replay);
  const complete = replay.ran_to_planned_end;
  const fragment = {
    schema_version: "portal.elp2-10.coexistence-stage.v1", status: complete ? "PASS" : "ABORTED_BY_SAFETY_CONDITION", evidence_class: complete ? "RUNTIME_VERIFIED" : "TEST_ONLY_ABORTED",
    selection_sha256: plan.selection_sha256, plan_sha256: args["plan-sha256"], repetition_id: args["repetition-id"], stage: args.stage,
    workload_sha256: plan.workload_sha256, common_config_sha256: plan.common_config_sha256, hardware_sha256: plan.hardware_sha256, configuration_sha256: plan.stage_config_sha256?.[args.stage],
    started_at_ms: replay.started_at_ms, ended_at_ms: replay.ended_at_ms, measurements: metrics.measurements,
  };
  const receipt = stageReceipt({ measurement: "M-5", window: w, stage: args.stage, replay,
    title: `Portal-side stage ${args.stage} of the coexistence plan, repetition ${args["repetition-id"]}`,
    limitations: ["Portal-side load and latency only: TS / DL / Edge / DB / IO collectors belong to their owners and are merged by the plan owner.",
      "PASS in the fragment means the stage ran its full planned duration without a safety stop; it is not a capacity verdict (readiness tool + approved R-C bounds decide).",
      ...(replay.skipped_unmapped_fixture_paths && Object.keys(replay.skipped_unmapped_fixture_paths).length ? ["Paths carrying fixture ids with no --id-map entry were skipped (see results.replay.skipped_unmapped_fixture_paths): the offered load is smaller than the workload file declares."] : [])],
    extra: { repin: { observed_at_ms: repin.observed_at_ms, edge_sha: repin.edge_sha, pm_sha: repin.pm_sha, core_image_digest: repin.core_image_digest }, plan: { sha256: args["plan-sha256"], repetition_id: args["repetition-id"], stage_order: order },
      stage_receipt_fragment: fragment, stage_receipt_fragment_sha256: sha256Text(canonical(fragment)), metric_map_note: metrics.note } });
  const out = args.out || join(homedir(), ".local/state/portal-execution-elp210", new Date().toISOString().slice(0, 10).replaceAll("-", ""), `m5-${args["repetition-id"]}-${args.stage}-${now}.json`);
  writeReceipt(out, receipt);
  console.log(JSON.stringify({ out, stop_reason: replay.stop_reason, requests: replay.requests_completed, p95_ms: replay.latency_ms.p95, error_rate: replay.error_rate, fragment_status: fragment.status }));
  process.exit(complete ? 0 : 2);
}

try { await (args.selftest ? selftest() : windowRun()); } catch (e) { refuse(e); }
