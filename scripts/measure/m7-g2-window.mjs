#!/usr/bin/env node
/**
 * M-7 · performance G2 (T10-12), Portal side. ABSOLUTE_MEASUREMENT, exclusive window, EDGE owns the apparatus (P184).
 *
 * Portal does not run P184 and does not invent an SLO. Two things happen here, both inside an authorised M-7 window:
 *   --hold-load  hold the Portal's declared load at the B1 / B2 level while Edge runs its apparatus (the same GET-only open-loop
 *                replay as M-5, same stop conditions), so Edge's G2 population is measured under the declared Portal load.
 *   --ingest FILE --ingest-sha256 sha256:... --census FILE --census-sha256 sha256:...
 *                wrap Edge's per-feed population (`portal.elp2-10.g2-population-input.v1`, lib/g2.mjs) in a receipt and apply ONLY the
 *                ORIGINAL gate (per-feed p95 <= 500 ms; trade max < 1,500 ms; quote / mark max < 1,000 ms). Before any threshold is
 *                compared the input is bound to the Edge census (`portal.elp2-10.g2-edge-census.v1`: apparatus ref, gate revision, source
 *                pin, window id, expected feed / venue / kind population), to the repin's Edge SHA, to the authorised window (run start < end,
 *                inside the window) and to the population (none missing / duplicated / extra, integer samples, p95 <= max); any failure is a
 *                refusal (exit 3). Portal supplies no feed list. The receipt is separate from any B0 / B1 / B2 receipt and from the optional
 *                mainnet canary, and says so.
 * Same refusal rules as M-5 (authorisation record + sha256, window bounds, origin, explicit repin age). Exit: 0 completed / gate met,
 * 2 stopped early or gate not met, 3 refused.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { buildReceipt, parseArgs, repoRoot, sha256File, writeReceipt } from "./lib/receipt.mjs";
import { evaluateG2, G2Refused, parseEdgeCensus } from "./lib/g2.mjs";
import { runStage, stageReceipt } from "./lib/stage.mjs";
import { loadWindow, WindowRefused } from "./lib/window.mjs";

const args = parseArgs(process.argv.slice(2), {
  authorization: { default: "" }, "authorization-sha256": { default: "" }, repin: { default: "" }, "repin-max-age-ms": { number: true, default: 0 },
  "hold-load": { flag: true }, stage: { default: "B1" }, "header-file": { default: "" }, "id-map": { default: "" }, workload: { default: join(repoRoot, "scripts/measure/workloads/read-sets.v1.json") },
  "duration-ms": { number: true, default: 0 }, ingest: { default: "" }, "ingest-sha256": { default: "" }, census: { default: "" }, "census-sha256": { default: "" }, out: { default: "" },
});
try {
  if (!args["hold-load"] === !args.ingest) throw new Error("REFUSED:choose exactly one of --hold-load or --ingest");
  if (!args.authorization || !args["authorization-sha256"]) throw new Error("REFUSED:MISSING_AUTHORISATION");
  if (!(args["repin-max-age-ms"] > 0)) throw new Error("REFUSED:--repin-max-age-ms must be set explicitly (> 0)");
  const now = Date.now();
  const w = loadWindow(args.authorization, args["authorization-sha256"], { measurement: "M-7", allowLanes: ["REAL_READ_RETAINED", "REAL_READ_QUALIFIED"], nowMs: now });
  if (w.run_kind !== "ABSOLUTE_MEASUREMENT") throw new Error("REFUSED:M-7 is an ABSOLUTE_MEASUREMENT window");
  if (!args.repin) throw new Error("REFUSED:--repin is required");
  const repin = JSON.parse(readFileSync(args.repin, "utf8"));
  if (!Number.isFinite(repin.observed_at_ms) || now - repin.observed_at_ms > args["repin-max-age-ms"] || repin.observed_at_ms > now) throw new Error("REFUSED:REPIN_STALE_OR_FUTURE");
  if (repin.lease_root_user_checked !== true || !Array.isArray(repin.competing_jobs) || repin.competing_jobs.length !== 0) throw new Error("REFUSED:REPIN_LEASE_OR_JOBS_NOT_CLEAR");
  const out = (name) => args.out || join(homedir(), ".local/state/portal-execution-elp210", new Date().toISOString().slice(0, 10).replaceAll("-", ""), `${name}-${now}.json`);

  if (args["hold-load"]) {
    if (!args["header-file"] || !args["duration-ms"]) throw new Error("REFUSED:--header-file and --duration-ms are required for --hold-load");
    const workload = JSON.parse(readFileSync(args.workload, "utf8"));
    const { replay } = await runStage({ window: w, measurement: "M-7", stage: args.stage, workload, headersPath: args["header-file"], idMapPath: args["id-map"], durationMs: args["duration-ms"], seed: workload.seed, real: true });
    const receipt = stageReceipt({ measurement: "M-7", window: w, stage: `${args.stage}-load-holder`, replay, title: `Portal load held at ${args.stage} level during Edge's P184 G2 run`,
      limitations: ["This receipt records the load the Portal held; it contains NO G2 verdict. The G2 population comes from Edge's apparatus (--ingest).", "Not merged with any B0 / B1 / B2 receipt; the optional mainnet canary is a different decision and does not replace G2."],
      extra: { repin: { observed_at_ms: repin.observed_at_ms, edge_sha: repin.edge_sha, pm_sha: repin.pm_sha } } });
    writeReceipt(out("m7-load"), receipt);
    process.exit(replay.ran_to_planned_end ? 0 : 2);
  }
  // Bind first (Edge census + repin + window), only then read and judge the population.
  if (!args.census || !args["census-sha256"]) throw new Error("REFUSED:MISSING_EDGE_CENSUS (--census and --census-sha256: the expected feed / venue / kind population is Edge's, Portal does not invent it)");
  if (sha256File(args.census) !== args["census-sha256"]) throw new Error("REFUSED:CENSUS_DIGEST_MISMATCH");
  const census = parseEdgeCensus(JSON.parse(readFileSync(args.census, "utf8")), { windowId: w.window_id });
  if (typeof repin.edge_sha !== "string" || !repin.edge_sha || repin.edge_sha !== census.edge_sha) throw new G2Refused("SOURCE_PIN_MISMATCH", "repin.edge_sha must equal the census edge_sha");
  const bytes = readFileSync(args.ingest);
  if (sha256File(args.ingest) !== args["ingest-sha256"]) throw new Error("REFUSED:INGEST_DIGEST_MISMATCH");
  const input = JSON.parse(bytes.toString("utf8"));
  const verdict = evaluateG2(input, { ...census, window: { starts_at_ms: w.starts_at_ms, ends_at_ms: w.ends_at_ms }, now_ms: now });
  const receipt = buildReceipt({
    measurement: "M-7", sub: "g2-ingest", title: "Performance G2 (P184 original gate) applied to the per-feed population Edge supplied",
    lane: w.lane, runKind: w.run_kind, status: "RUN_WINDOW", startedAtMs: input.started_at_ms, endedAtMs: input.ended_at_ms, windowId: w.window_id,
    workload: { apparatus: input.apparatus_ref, gate_revision: input.gate_revision, edge_sha: input.edge_sha, population_size: verdict.population_size, census_sha256: args["census-sha256"] },
    stopConditions: ["Edge's apparatus owns its own stop conditions; this script only reads its output"],
    results: { ...verdict, ingest_sha256: args["ingest-sha256"], census_sha256: args["census-sha256"] },
    cleanup: { owner: "Edge", note: "apparatus teardown and session revocation are the grantor's steps" },
    limitations: ["Original P184 thresholds only, for the exact population Edge supplied; not a Portal API latency or a new SLO.", "Separate receipt: not merged with B0 / B1 / B2; the optional mainnet canary does not replace it.",
      "Receipt reuse across a dependency change requires the T10-14 dependency-impact table."],
    extra: { authorisation: { window_id: w.window_id, granted_by: w.granted_by, authorisation_sha256: w.authorisation_sha256 } } });
  writeReceipt(out("m7-g2"), receipt);
  console.log(JSON.stringify({ result: verdict.original_gate_result, failing: verdict.failing }));
  process.exit(verdict.failing.length === 0 ? 0 : 2);
} catch (e) {
  console.error(String(e.message ?? e));
  process.exit(e instanceof WindowRefused || String(e.message).startsWith("REFUSED") ? 3 : 1);
}
