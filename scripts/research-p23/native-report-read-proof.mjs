#!/usr/bin/env node
/** §54 read-only candidate proof. No deployment, auth change, engine run or DB writes. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { savePrivate } from "./api-client.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const output = process.argv[2];
assert(output?.startsWith("/home/bobby/.local/state/portal-research-p23/"), "PRIVATE_RECEIPT_PATH_REQUIRED");
const project = "portal-research-preview";
const inspect = service => {
  const row = JSON.parse(execFileSync("sudo", ["-n", "docker", "inspect", `${project}-${service}-1`], { encoding: "utf8" }))[0];
  assert.equal(row.Config.Labels["com.docker.compose.project"], project);
  return row;
};
const control = inspect("control-api"), pg = inspect("portal-postgres");
const dbEnv = control.Config.Env.find(value => value.startsWith("DATABASE_URL="));
assert(dbEnv, "PREVIEW_DATABASE_REQUIRED");
const url = new URL(dbEnv.slice("DATABASE_URL=".length));
assert.equal(url.hostname, "portal-postgres"); assert.equal(url.pathname, "/portal_control");
const ips = Object.values(pg.NetworkSettings.Networks).map(row => row.IPAddress).filter(Boolean);
assert.equal(ips.length, 1); assert.match(ips[0], /^172\.[0-9.]+$/); url.hostname = ips[0];

// Compiled candidate modules are loaded locally; the deployed Control API stays unchanged.
const require = createRequire(join(root, "apps/control-api/package.json"));
require("reflect-metadata");
const { Pool } = require("pg");
const { ResearchReportRepository } = require("./dist/research/report.repository");
const { ResearchReportService } = require("./dist/research/report.service");
const { ResearchReportReadResponseSchema } = require("./dist/research/report.contract");
const pool = new Pool({ connectionString: url.toString(), max: 1 });
const workspaceId = "ws_06GCVTHWC9WVPGEPR85AB15K82";
const runId = "rrun_ee50cb82d6de9e495e10b32323b62f8c";
const failed = ["rrun_bd5906ac9bb4b310b05f462de97ada56", "rrun_4eab9bf92ba1a4aa00ad1bca4416b1d0"];
const rows = async (sql, params = []) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout='5s'");
    const result = await client.query(sql, params);
    await client.query("COMMIT"); return result.rows;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
};
const pins = () => rows(`SELECT r.run_id,r.state,r.state_version,r.updated_at,
    (SELECT count(*)::int FROM research.run_report_manifests_v1 m WHERE (m.workspace_id,m.run_id)=(r.workspace_id,r.run_id)) AS reports,
    (SELECT count(*)::int FROM research.run_report_export_jobs_v1 e WHERE (e.workspace_id,e.run_id)=(r.workspace_id,r.run_id)) AS exports,
    (SELECT count(*)::int FROM research.run_report_materialization_retries_v1 e WHERE (e.workspace_id,e.run_id)=(r.workspace_id,r.run_id)) AS repairs
  FROM research.runs r WHERE r.workspace_id=$1 AND r.run_id=ANY($2::text[]) ORDER BY r.run_id`, [workspaceId, [runId, ...failed]]);
let stage = "run-context";
try {
  const [run] = await rows("SELECT submitted_by_user_id AS actor FROM research.runs WHERE workspace_id=$1 AND run_id=$2", [workspaceId, runId]);
  assert(run, "REAL_NATIVE_RUN_REQUIRED");
  const scope = { workspaceId, actorUserId: run.actor };
  const before = await pins();
  const repository = new ResearchReportRepository(pool);
  // Disable only this process's WFO GET repair, so negative reads cannot claim a retry.
  // No runtime flag/env is changed. Native absence is read-neutral with repair on or off.
  const service = new ResearchReportService(repository, null, null, null, null, null, null,
    { FEATURE_RESEARCH_REPORTS: "true", FEATURE_RESEARCH_CURRENT_SOURCE: "false", RESEARCH_REPORT_EXPORT_MAXIMUM_BYTES: 512 * 1024 });
  stage = "native-read";
  const native = await service.read(scope, runId);
  assert(ResearchReportReadResponseSchema.safeParse(native).success);
  assert.equal(native.schema_version, "research.report-unavailable.v1");
  assert.equal(native.availability.reason_code, "NATIVE_REPORT_NOT_DELIVERED");
  assert.equal(native.may_export, false);
  assert.equal((await service.read(scope, runId)).etag, native.etag);
  await assert.rejects(service.requestExport(scope, runId, "REPORT_JSON"), error => error.code === "NATIVE_REPORT_NOT_DELIVERED" && error.status === 409);
  await assert.rejects(service.read(scope, "rrun_unknown_native_report_proof"), error => error.code === "RESEARCH_REPORT_NOT_FOUND" && error.status === 404);
  await assert.rejects(service.read({ ...scope, actorUserId: "usr_unknown_native_report_proof" }, runId), error => error.status === 403);
  stage = "wfo-regression-read";
  const wfo = await service.read(scope, "rrun_cf5ed033560082488b559baf29be4754");
  assert.equal(wfo.schema_version, "research.report-detail.v1");
  stage = "failed-forensic-inventory";
  const forensic = await rows(`SELECT r.run_id,r.state,
    (SELECT count(*)::int FROM research.current_source_rows_v1 x WHERE (x.workspace_id,x.run_id)=(r.workspace_id,r.run_id)) AS current_rows,
    (SELECT count(*)::int FROM research.current_source_seals_v1 x WHERE (x.workspace_id,x.run_id)=(r.workspace_id,r.run_id)) AS current_seals,
    (SELECT count(*)::int FROM research.window_execution_rows_v1 x WHERE (x.workspace_id,x.run_id)=(r.workspace_id,r.run_id)) AS window_rows,
    (SELECT count(*)::int FROM research.window_execution_batches_v1 x WHERE (x.workspace_id,x.run_id)=(r.workspace_id,r.run_id)) AS window_batches,
    (SELECT count(*)::int FROM research.window_execution_seals_v1 x WHERE (x.workspace_id,x.run_id)=(r.workspace_id,r.run_id)) AS window_seals,
    (SELECT count(*)::int FROM research.window_execution_batches_v1 x LEFT JOIN research.artifacts a
      ON (a.workspace_id,a.artifact_id)=(x.workspace_id,x.artifact_id)
      WHERE (x.workspace_id,x.run_id)=(r.workspace_id,r.run_id) AND a.artifact_id IS NULL) AS orphan_window_batches
    FROM research.runs r WHERE r.workspace_id=$1 AND r.run_id=ANY($2::text[]) ORDER BY r.run_id`, [workspaceId, failed]);
  assert.equal(forensic.length, 2);
  for (const row of forensic) { assert.equal(row.state, "FAILED"); assert.equal(row.orphan_window_batches, 0); }
  assert.deepEqual(await pins(), before, "REPORT_PROOF_MUST_NOT_REPAIR_RESEAL_EXPORT_OR_REWRITE_LIFECYCLE");
  const compiledHashes = Object.fromEntries(["report.service", "report.repository", "report.contract"].map(name =>
    [name, createHash("sha256").update(readFileSync(join(root, `apps/control-api/dist/research/${name}.js`))).digest("hex")]));
  const receipt = { measured_at_utc: new Date().toISOString(), authority: "CANDIDATE_MODULES_READ_ONLY_ON_PREVIEW_DB_NOT_DEPLOYED_HTTP",
    source_head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    compiledHashes, deployed_control_image: control.Image, deployed_postgres_image: pg.Image,
    native, wfo: { run_id: wfo.run_id, report_revision: wfo.report_revision, frozen_core_sha256:
      createHash("sha256").update(JSON.stringify(wfo.frozen_core)).digest("hex") }, failed_runs: forensic,
    immutable_pins_unchanged: true, deployment_performed: false, browser_acceptance: "PENDING_CLAUDE_TYPED_CONSUMER" };
  savePrivate(output, receipt);
  console.log(JSON.stringify({ status: "PASS", native_run: runId, reason: native.availability.reason_code,
    failed_runs: forensic, immutable_pins_unchanged: true, proof: receipt.authority }));
} catch (error) {
  console.error(`NATIVE_REPORT_READ_PROOF_FAILED:${stage}:${String(error.code ?? error.name)}:cause=${String(error.cause?.code ?? "none")}:${error.code?.startsWith("RESEARCH_REPORT_") ? error.message : ""}`); process.exitCode = 1;
} finally { await pool.end(); }
