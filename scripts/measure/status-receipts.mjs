#!/usr/bin/env node
/**
 * Writes the receipts for the measurements that were NOT run (READY_NEEDS_WINDOW or BLOCKED): M-1c, M-2c, M-3c, M-4b, M-5, M-6c, M-7.
 * Each says what is ready (script + digest + selftest receipt), what is missing, and which window request carries it. Lane is NOT_RUN:
 * nothing here is a measurement and none of it can be cited as one.
 *
 *   node scripts/measure/status-receipts.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { buildReceipt, repoRoot, sha256File, writeReceipt } from "./lib/receipt.mjs";

const out = join(repoRoot, "upgrade/execution_loop/evidence/ELP2-10/measurements");
const digest = (rel) => (existsSync(join(repoRoot, rel)) ? { path: rel, sha256: sha256File(join(repoRoot, rel)) } : { path: rel, sha256: null });
const selftest = join(out, "M-5-driver-selftest-2026-10-21.json");
const selftestRef = existsSync(selftest) ? { path: "upgrade/execution_loop/evidence/ELP2-10/measurements/M-5-driver-selftest-2026-10-21.json", sha256: sha256File(selftest), lane: JSON.parse(readFileSync(selftest, "utf8")).lane } : null;
const WINDOWS = "upgrade/execution_loop/evidence/ELP2-10/measurements/WINDOW_REQUESTS_2026-10-21.md";
const CORE009 = "upgrade/execution_loop/evidence/ELP2-10/CORE009_INTEGRATION_RETURN_2026-10-21.md section 2: integration prepared; hook, image build and runtime readback PENDING; installed image sha256:7b2c7f34... is NOT Core009";

const common = { lane: "NOT_RUN", limits: null, stopConditions: [], cleanup: null, startedAtMs: null, endedAtMs: null };
function emit(name, spec) {
  const r = buildReceipt({ ...common, ...spec });
  writeReceipt(join(out, `${name}-2026-10-21.json`), r);
  console.log(name, r.status);
}

const guards = ["scripts/measure/lib/window.mjs", "scripts/measure/lib/replay.mjs", "scripts/measure/lib/stage.mjs", "scripts/measure/workloads/read-sets.v1.json"].map(digest);

emit("M-1c", { measurement: "M-1", sub: "c connected browser cost", title: "Same specs on a stack with the real BFF after Core009", status: "BLOCKED", runKind: "CAPPED_CORRECTNESS",
  workload: { target_lane: "REAL_READ_QUALIFIED only when the Source Truth Board row is EXISTS_MOUNTED with a real-source receipt; otherwise BFF_DOUBLE" }, results: { reason: "No stack with a real BFF composed (Core009 not installed).", unmet: [CORE009], ready: ["apps/portal/frontend/e2e/_probe-measure-m1-browser-cost.spec.ts runs unchanged against a real origin once a --real variant of the lane is given a storage state; not wired because no origin exists"] },
  limitations: ["HTTP 200 / TLS / parser pass is not enough to label a lane REAL_READ_* (handoff :114)."] });

emit("M-2c", { measurement: "M-2", sub: "c tiers 3-4 on a real origin", title: "Tab sweep 1/2/4/8/16 against the real BFF with Edge's source-call counter", status: "READY_NEEDS_WINDOW", runKind: "CAPPED_CORRECTNESS",
  workload: { target_lane: "REAL_READ_QUALIFIED", command: "node scripts/measure/m2-tab-amplification.mjs --window --authorization A.json --authorization-sha256 sha256:... --storage-state ~/secret/state.json [--route-map map.json] --tabs 1,2,4,8,16", real_time_cells: "idle visible 10 min, 19-screen walk, hidden 5 min, reload; about 16 min per cell, 80 min for the sweep",
    two_user_cells: "users 2 same scope / different scope: need two real sessions; run the same command twice with two storage states and merge by the grantor's counter windows (phase_windows_ms in the receipt)" },
  results: { ready: [digest("scripts/measure/m2-tab-amplification.mjs"), digest("apps/portal/frontend/e2e/_probe-measure-m2-tab-sweep.spec.ts"), digest("apps/portal/frontend/playwright.measure-real.config.ts"), ...guards],
    fixture_run_receipt: "upgrade/execution_loop/evidence/ELP2-10/measurements/M-2-2026-10-21.json", missing: ["window + authorisation record", "Core009 composed with READ and STREAM split (BE-P10)", "Edge export of source calls per window (gap G-2) over the phase windows", "a real session (storage state, 0600, outside the repository)"],
    unmet: [CORE009], window_request: WINDOWS + " section 3 (M-2c)" }, limitations: ["Counts are capped-correctness; p95 at any tier only inside the exclusive window of M-5/M-7."] });

emit("M-3c", { measurement: "M-3", sub: "c realtime on a real stream", title: "Transport drop, slow consumer, gap, resync storm, epoch rebuild, READ-only / STREAM-only / both revoke, consumer restart, hidden tab 1 h", status: "BLOCKED", runKind: "CAPPED_CORRECTNESS",
  workload: { target_lane: "REAL_READ_QUALIFIED" }, results: { reason: "BLOCKED on three things that do not exist yet.", unmet: ["no published stream operation for alpha_fleet_overview in OpenAPI (UXM08-A, REQUESTS_FOR_SOURCE_OWNERS SRC-A)", CORE009,
    "stream is dark until a stream.subscribe grant on the single ROOT whole-fleet viewer (BOBBY_DECISIONS 2026-10-21 item 2)"], ready_for_the_day: "component invariants (M-3 receipt) and the revoker from BE-P10; a stream driver is not written because writing it against an unpublished contract would invent the contract",
    window_request: WINDOWS + " section 4 (M-3c, request only after the three items close)" }, limitations: ["Revocation-to-stream-close latency is record-only: no threshold exists (NO BASIS, needs Edge/Bobby)."] });

emit("M-4b", { measurement: "M-4", sub: "b connected mixed load", title: "Mounted writer with lease + read load from M-2, at least two repetitions", status: "BLOCKED", runKind: "ABSOLUTE_MEASUREMENT",
  workload: { target_lane: "REAL_READ_QUALIFIED" }, results: { reason: "No writer is mounted (T10-11 worker NOT_MOUNTED) and no connected source ingest exists.", unmet: ["writer/worker mount + lease (T10-11, ELP2-REQ-06-002)", CORE009],
    ready: ["read half: scripts/measure/m5-coexistence-window.mjs / lib/replay.mjs can hold the declared read load; the write half has no driver because there is no writer to drive"], window_request: WINDOWS + " section 5 (M-4b, request after the writer mounts)" } });

emit("M-5", { measurement: "M-5", sub: "coexistence B0/B1/B2 (Portal side B1, B2)", title: "TS / DL / Research coexistence, Portal-side stages", status: "READY_NEEDS_WINDOW", runKind: "ABSOLUTE_MEASUREMENT",
  workload: { target_lane: "REAL_READ_QUALIFIED", owner_of_plan: "Edge / TS / DL (EPG10-01 measurement-plan.json); Claude supplies the plan skeleton, the Portal stages and the readiness check",
    command: "node scripts/measure/m5-coexistence-window.mjs --authorization A.json --authorization-sha256 sha256:... --repin R.json --repin-max-age-ms N --plan P.json --plan-sha256 sha256:... --repetition-id repN --stage B1|B2 --header-file ~/secret/session.hdr [--id-map ids.json] [--metric-map map.json]",
    stop_conditions: "STOP_429 / STOP_5XX_RATE / STOP_NETWORK_RATE / STOP_OVERLOAD / STOP_SIGNAL / window end - 5 s; offered peak above window max_rps refuses to start" },
  results: { ready: [digest("scripts/measure/m5-coexistence-window.mjs"), ...guards, digest("scripts/execution-v2/qualification-readiness.mjs")], driver_selftest: selftestRef,
    refusals_proven_by_tests: "scripts/measure/measure.test.mjs (node --test): missing/mismatched/expired/wrong-measurement/wrong-lane/local-origin authorisation, offered peak above max_rps, non-GET workload",
    missing: ["window + authorisation record from the grantor and its sha256", "14 budget groups decomposed to scalar bounds with approval_ref (Edge/TS/DL)", "the pinned coexistence plan (workload/config/hardware, counterbalanced stage orders, minimum_duration_ms)", "M-0 read-only repin inside --repin-max-age-ms (lease root + user, competing jobs empty)", "Core009 composed", "a real temporary session and an id-map for the fixture ids"],
    unmet: [CORE009], window_request: WINDOWS + " section 1 (M-5)" } });

emit("M-6c", { measurement: "M-6", sub: "c production-size DR timing / cap fill", title: "Fill to 1,024 revisions or 8 MiB to observe stop-without-delete; restore timing on real data", status: "BLOCKED", runKind: "ABSOLUTE_MEASUREMENT",
  workload: { target_lane: "REAL_READ_RETAINED" }, results: { reason: "Needs real data and a decision by Bobby on RPO/RTO/retention (D6) after M-6b; never run against a production database. The cap behaviour itself (stop, no ACK, no delete) is covered by the unit/PG invariants.",
    unmet: ["RPO/RTO/retention horizon named by Bobby after M-6b", "a disposable clone of real data produced by Core ops"], window_request: "not requested now (WINDOW_REQUESTS section 6 explains why)" } });

emit("M-7", { measurement: "M-7", sub: "performance G2 (P184)", title: "Performance G2 per-feed population; Edge owns the apparatus", status: "READY_NEEDS_WINDOW", runKind: "ABSOLUTE_MEASUREMENT",
  workload: { target_lane: "REAL_READ_QUALIFIED", portal_part: "--hold-load (declared Portal load while Edge runs P184) and --ingest (apply the ORIGINAL gate to the population Edge supplies)", original_gate: "per-feed p95 <= 500 ms; trade max < 1,500 ms; quote/mark max < 1,000 ms (ELP2-10 source-alignment.md:82-84)" },
  results: { ready: [digest("scripts/measure/m7-g2-window.mjs"), digest("scripts/measure/lib/g2.mjs"), ...guards], input_contract_proposed: "portal.elp2-10.g2-population-input.v1 (Edge confirms or supplies an adapter)",
    missing: ["window + authorisation record", "Edge's P184 apparatus run and population file", "M-0 repin", "Core009 composed if the Portal load is to be held"], unmet: [CORE009], window_request: WINDOWS + " section 2 (M-7)" },
  limitations: ["A separate receipt from B0/B1/B2; the optional mainnet canary does not replace G2."] });
