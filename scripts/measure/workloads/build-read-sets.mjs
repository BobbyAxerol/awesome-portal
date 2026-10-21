#!/usr/bin/env node
/**
 * Builds scripts/measure/workloads/read-sets.v1.json from an M-1 run (the `apiPaths` each route's first load issued against the
 * doubles). Deterministic: same input JSONL, same output bytes. The stage shapes (tabs, cadence) are PROPOSED_NOT_APPROVED
 * defaults; the Edge coexistence plan (EPG10-01 measurement-plan.json) pins the real ones and the workload digest goes into
 * the plan. Paths that carry fixture-only ids are replaced by the real ids through an id-map at run time, or skipped and counted.
 *
 *   node scripts/measure/workloads/build-read-sets.mjs --from <m1.jsonl> [--out scripts/measure/workloads/read-sets.v1.json]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs, canonical, sha256Text } from "../lib/receipt.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2), { from: { default: "" }, out: { default: join(here, "read-sets.v1.json") } });
if (!args.from) throw new Error("--from <m1.jsonl> is required");
const rows = readFileSync(args.from, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.kind === "m1a" && r.scale === "small");
const byName = new Map(rows.map((r) => [r.name, r.first.apiPaths]));
if (byName.size < 30) throw new Error(`expected 32 routes at scale small, found ${byName.size}`);
const common = [...byName.get("overview")].filter((p) => [...byName.values()].every((list) => list.includes(p)));
const without = (name) => byName.get(name).filter((p) => !common.includes(p));
const pollNeedles = ["/api/v1/execution/compositions/command-center", "/api/v1/execution/operations?triage_state=UNACKNOWLEDGED&limit=1"];
const poll = byName.get("overview").filter((p) => pollNeedles.some((n) => p.includes(n)));
if (poll.length !== 2) throw new Error(`Overview poll set must be 2 reads, found ${poll.length}`);
const VISITS = ["fleet", "portfolios", "portfolio-360", "alpha-360", "account-360", "blotter", "operations", "workbench-fills", "admin", "accounts"];
const sets = { "shell-common": common, "overview-poll": poll };
for (const v of VISITS) sets[`visit:${v}`] = without(v);
const workload = {
  schema_version: "portal.elp2-10.read-workload.v1", revision: "r1", status: "PROPOSED_NOT_APPROVED",
  generated_from: "ELP2-10 M-1 first-load read sets at FIXTURE_SCALE small (BFF double), 2026-10-21",
  note: "Stage shapes are proposals for the Edge coexistence plan to pin. B1 = steady Overview polling by open tabs; B2 = B1 plus dashboard / history / analytics screen visits. GET only.",
  seed: 20261021, sets,
  stages: {
    B1: [{ set: "overview-poll", tabs: 8, cadence_ms: 15000 }],
    B2: [{ set: "overview-poll", tabs: 8, cadence_ms: 15000 }, ...VISITS.map((v) => ({ set: `visit:${v}`, tabs: 2, cadence_ms: 30000 }))],
  },
};
workload.digest_input = sha256Text(canonical({ sets: workload.sets, stages: workload.stages, seed: workload.seed }));
writeFileSync(args.out, `${JSON.stringify(workload, null, 2)}\n`);
console.log(JSON.stringify({ out: args.out, sets: Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, v.length])), digest: workload.digest_input }));
