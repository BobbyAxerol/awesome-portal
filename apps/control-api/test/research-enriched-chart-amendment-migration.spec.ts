import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runner as migrate } from "node-pg-migrate";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ResearchEnrichedAnalysisSchema, type ResearchEnrichedAnalysis } from "../src/research/enriched-analysis.contract";
import { enrichedJoin, readEnriched } from "../src/research/enriched-analysis.read";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { migrateTestDatabase } from "./harness";

const baseUrl = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const databaseName = "portal_b9_" + randomUUID().replaceAll("-", "");
const urlFor = (name: string) => {
  const url = new URL(baseUrl);
  url.pathname = "/" + name;
  return url.toString();
};
const migrationsDir = join(__dirname, "../migrations");
const amendmentMigration = "1723680000086_research-enriched-chart-amendment.sql";
const workspaceA = "ws_b9_a", workspaceB = "ws_b9_b";
const retainedRun = "rrun_" + "a".repeat(32);
const driftRun = "rrun_" + "c".repeat(32);
const fixedRun = "rrun_" + "d".repeat(32);
const digestA = "a".repeat(64), digestB = "b".repeat(64);
type CompanionTable = "enriched_analysis_v1" | "enriched_chart_amendments_v1";

function originalBlock(runId: string, lane: "WFO" | "FIXED" = "WFO"): ResearchEnrichedAnalysis {
  const contracts = process.env.PORTAL_CONTRACTS_DIR ?? join(__dirname, "../../../packages/contracts");
  const block = JSON.parse(readFileSync(join(contracts, "fixtures/research-enriched-analysis.healthy.valid.json"), "utf8"));
  block.run_id = runId;
  block.lane = lane;
  return ResearchEnrichedAnalysisSchema.parse(block);
}

function amendedBlock(runId: string, mean: string, lane: "WFO" | "FIXED" = "WFO"): ResearchEnrichedAnalysis {
  const block = originalBlock(runId, lane);
  const fact = (value: string) => ({ ...block.facts.metrics.sharpe, value,
    origin: "PORTAL_DERIVED" as const, state: "AVAILABLE" as const, reason_code: null,
    source_locator: "scoped.daily_returns:ALL_TIME_UTC_DAY" });
  Object.assign(block.return_distribution, {
    statistics_policy: { quantile_method: "LINEAR_TYPE_7", probability: "0.95",
      risk_variable: "LOSS_FRACTION_NEGATIVE_RETURN", risk_sign: "SIGNED_LOSS_FRACTION",
      tail: "LOSS_GTE_VAR_INCLUSIVE", minimum_observations: 2 },
    mean: fact(mean), median: fact("0"), var_95: fact("0.1"), cvar_95: fact("0.2"),
  });
  return ResearchEnrichedAnalysisSchema.parse(block);
}

async function seedRun(client: PoolClient, workspace: string, runId: string) {
  // Storage-only fixture: omit unrelated attempt/job parents. All CHECKs still
  // apply, and every immutable guard is restored before the behaviour proof.
  await client.query("SET session_replication_role=replica");
  try {
    await client.query(`INSERT INTO research.runs
      (workspace_id,run_id,attempt_id,run_kind,relationship_kind,logical_run_key,
       request_spec_digest,effective_spec_digest,engine_release_id,dataset_binding_digest,state,submitted_by_user_id)
      VALUES ($1,$2,$2,'PRIMARY','PRIMARY',$2,$3,$3,'er_quantbt_111',$3,'READY','usr_b9')`,
    [workspace, runId, digestA]);
  } finally { await client.query("SET session_replication_role=origin"); }
}

async function seal(client: PoolClient, workspace: string, runId: string, revision: number,
  sourceDigest: string, block?: ResearchEnrichedAnalysis) {
  await client.query(`INSERT INTO research.current_source_seals_v1
    (workspace_id,run_id,artifact_revision,source_adapter_id,profile_id,manifest_digest,
     source_transform_digest,requested_spec_digest,effective_spec_digest,dataset_binding_digest,
     retained_import_digest,table_rows,total_rows,summary)
    VALUES ($1,$2,$3,'rs02.quantbt-advanced-wfo.v1','rs02.delta-wfo-global.v1',
      $4,$4,$4,$4,$4,$4,'{"OBSERVATION":60,"FOLD":1}',61,$5::jsonb)`,
  [workspace, runId, revision, sourceDigest, JSON.stringify(block ? { enriched_analysis: block } : {})]);
}

async function companion(client: PoolClient, table: CompanionTable, workspace: string, runId: string,
  kind: "WFO_RETAINED" | "P04_SOURCE", revision: string, sourceDigest: string,
  block: unknown, createdAt = "2026-10-02T00:00:00Z") {
  // Table names are closed local constants, not query/request input.
  return client.query(`INSERT INTO research.${table}
    (workspace_id,run_id,source_kind,source_revision,source_digest,source_rows_digest,enriched_digest,enriched,created_at)
    VALUES ($1,$2,$3,$4,$5,$5,$6,$7::jsonb,$8)`,
  [workspace, runId, kind, revision, sourceDigest, sha256ResearchJson(block), JSON.stringify(block), createdAt]);
}

const read = (client: PoolClient, workspace: string, runId: string) =>
  readEnriched(client, workspace, runId, () => new Error("Unavailable source-bound enrichment"));
const retainedBytes = (client: PoolClient) => client.query(`SELECT
  (SELECT row_to_json(original)::text FROM research.enriched_analysis_v1 original
    WHERE workspace_id=$1 AND run_id=$2 AND source_revision='1') AS original_bytes,
  (SELECT row_to_json(source)::text FROM research.current_source_seals_v1 source
    WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=1) AS seal_bytes`, [workspaceA, retainedRun]);

async function fixedSource(client: PoolClient, workspace: string, worker: string,
  sequence: number, revision: string, block: ResearchEnrichedAnalysis, receivedAt: string) {
  const payload = { enriched_analysis: block }, sourceDigest = sha256ResearchJson(payload);
  await client.query("SET session_replication_role=replica");
  try {
    await client.query(`INSERT INTO research.run_evidence_sources_v1
      (workspace_id,run_id,worker_attempt_id,source_event_sequence,source_evidence_digest,source_payload)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb)`, [workspace, fixedRun, worker, sequence, sourceDigest, JSON.stringify(payload)]);
    await client.query(`INSERT INTO research.run_evidence_projections_v1
      (workspace_id,run_id,worker_attempt_id,projection_revision,source_event_sequence,source_evidence_digest,
       projection_version,projection_digest,readiness,projection,received_at)
      VALUES ($1,$2,$3,$4,$5,$6,'research.evidence-projection.v1',$6,'COMPLETE','{}',$7)`,
    [workspace, fixedRun, worker, revision, sequence, sourceDigest, receivedAt]);
  } finally { await client.query("SET session_replication_role=origin"); }
  return sourceDigest;
}

async function fixedProducer(client: PoolClient, workspace: string, worker: string) {
  await client.query("SET session_replication_role=replica");
  try {
    await client.query(`INSERT INTO research.run_producers
      (workspace_id,run_id,attempt_id,job_id,actor_user_id,client_intent_id,intent_kind,preflight_token,
       alpha_id,alpha_version_id,execution_adapter_id,adapter_contract_digest,requested_spec_digest,
       effective_spec_digest,dataset_binding_digest,manifest_digest,snapshot_id,snapshot_content_hash,
       work_digest,legacy_request,worker_attempt_id,lease_epoch)
      VALUES ($1,$2,'att_b9_fixed','job_b9_fixed','usr_b9','intent_b9_fixed','NEW','rpft_b9',
       'alpha_b9','av_b9','p04.delta-rsi.v1',$3,$3,$3,$3,$3,$4,$3,$3,'{}',$5,1)`,
    [workspace, fixedRun, digestA, "dss_" + "a".repeat(32), worker]);
  } finally { await client.query("SET session_replication_role=origin"); }
}

describe("B9 chart amendment on an isolated disposable PostgreSQL database", () => {
  let beforeAmendment: unknown;
  beforeAll(async () => {
    const admin = new Pool({ connectionString: urlFor("postgres") });
    try { await admin.query("CREATE DATABASE " + databaseName); } finally { await admin.end(); }
    // Install historical B6 first, retain actual bytes, then exercise the
    // forward migration through the normal harness (not a mocked schema).
    await migrate({ databaseUrl: urlFor(databaseName), dir: migrationsDir, direction: "up",
      count: readdirSync(migrationsDir).filter(name => name.endsWith(".sql") && name < amendmentMigration).length,
      migrationsTable: "pgmigrations", noLock: true, log: () => {} });
    const database = new Pool({ connectionString: urlFor(databaseName) }), client = await database.connect();
    try {
      await client.query(`INSERT INTO portal_users
        (user_id,username,display_name,role,status,must_change_password)
        VALUES ('usr_b9','b9-disposable','B9 disposable','ADMIN','ACTIVE',false)`);
      await client.query(`INSERT INTO workspaces (workspace_id,name,owner_user_id)
        VALUES ($1,'B9 A','usr_b9'),($2,'B9 B','usr_b9')`, [workspaceA, workspaceB]);
      for (const workspace of [workspaceA, workspaceB]) await seedRun(client, workspace, retainedRun);
      const original = originalBlock(retainedRun);
      await seal(client, workspaceA, retainedRun, 1, digestA, original);
      await seal(client, workspaceB, retainedRun, 1, digestB);
      await companion(client, "enriched_analysis_v1", workspaceA, retainedRun, "WFO_RETAINED", "1", digestA,
        original, "2028-01-01T00:00:00Z");
      beforeAmendment = (await retainedBytes(client)).rows;
    } finally { client.release(); await database.end(); }
    await migrateTestDatabase(urlFor(databaseName));
  });
  afterAll(async () => {
    const admin = new Pool({ connectionString: urlFor("postgres") });
    try { await admin.query("DROP DATABASE IF EXISTS " + databaseName + " WITH (FORCE)"); } finally { await admin.end(); }
  });

  it("preserves original B6/seal bytes across migration and B9, with immutable guards and SELECT-only runtime access", async () => {
    const database = new Pool({ connectionString: urlFor(databaseName) }), client = await database.connect();
    try {
      expect((await retainedBytes(client)).rows).toEqual(beforeAmendment);
      expect(await read(client, workspaceA, retainedRun)).toEqual(originalBlock(retainedRun));
      const foreign = amendedBlock(retainedRun, "9"), amended = amendedBlock(retainedRun, "0");
      await companion(client, "enriched_chart_amendments_v1", workspaceB, retainedRun, "WFO_RETAINED", "1", digestB,
        foreign, "2030-01-01T00:00:00Z");
      expect(await read(client, workspaceA, retainedRun)).toEqual(originalBlock(retainedRun));
      await companion(client, "enriched_chart_amendments_v1", workspaceA, retainedRun, "WFO_RETAINED", "1", digestA,
        amended, "2020-01-01T00:00:00Z");
      // Derivation priority is independent of a later original/foreign timestamp.
      expect(await read(client, workspaceA, retainedRun)).toEqual(amended);
      expect(await read(client, workspaceB, retainedRun)).toEqual(foreign);
      expect((await retainedBytes(client)).rows).toEqual(beforeAmendment);
      for (const table of ["enriched_analysis_v1", "enriched_chart_amendments_v1"] as const) {
        for (const statement of [`UPDATE research.${table} SET enriched='{}'`, `DELETE FROM research.${table}`]) {
          await expect(client.query(statement + " WHERE workspace_id=$1 AND run_id=$2", [workspaceA, retainedRun]))
            .rejects.toMatchObject({ code: "55000" });
        }
        const privilege = await client.query(`SELECT
          has_table_privilege('portal_research_runtime',$1,'SELECT') AS can_read,
          has_table_privilege('portal_research_runtime',$1,'INSERT') AS can_insert,
          has_table_privilege('portal_research_runtime',$1,'UPDATE') AS can_update,
          has_table_privilege('portal_research_runtime',$1,'DELETE') AS can_delete,
          has_table_privilege('portal_research_runtime',$1,'TRUNCATE') AS can_truncate`, ["research." + table]);
        expect(privilege.rows[0]).toEqual({ can_read: true, can_insert: false, can_update: false, can_delete: false, can_truncate: false });
      }
      const sql = enrichedJoin("wanted.workspace_id", "wanted.run_id");
      expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|CALL)\b/i);
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL ROLE portal_research_runtime");
      await client.query("SELECT set_config('research.workspace_id',$1,true)", [workspaceA]);
      expect(await read(client, workspaceA, retainedRun)).toEqual(amended);
      expect((await retainedBytes(client)).rows).toEqual(beforeAmendment);
      await client.query("ROLLBACK");
      await client.query("SET ROLE portal_research_runtime");
      await client.query("SELECT set_config('research.workspace_id',$1,false)", [workspaceA]);
      for (const table of ["enriched_analysis_v1", "enriched_chart_amendments_v1"]) {
        await expect(client.query(`INSERT INTO research.${table} DEFAULT VALUES`)).rejects.toMatchObject({ code: "42501" });
      }
      const append = (workspace: string, revision: string, block: ResearchEnrichedAnalysis) => client.query(
        "SELECT research.append_source_enrichment_v1($1,$2,'WFO_RETAINED',$3,$4,$4,$5,$6::jsonb)",
        [workspace, retainedRun, revision, digestA, sha256ResearchJson(block), JSON.stringify(block)]);
      await expect(append(workspaceB, "1", originalBlock(retainedRun))).rejects.toMatchObject({ code: "23514" });
      await expect(append(workspaceA, "99", originalBlock(retainedRun))).rejects.toMatchObject({ code: "23514" });
      await expect(append(workspaceA, "1", amended)).rejects.toMatchObject({ code: "23514" });
      await append(workspaceA, "1", originalBlock(retainedRun)); // exact immutable source retry only
      await client.query("BEGIN READ ONLY");
      await expect(append(workspaceA, "1", originalBlock(retainedRun))).rejects.toMatchObject({ code: "25006" });
      await client.query("ROLLBACK");
      await client.query("RESET ROLE");
      expect((await retainedBytes(client)).rows).toEqual(beforeAmendment);
    } finally { await client.query("ROLLBACK"); await client.query("RESET ROLE"); client.release(); await database.end(); }
  });

  it("rejects absent or incorrect B9 policy and ignores missing, stale or digest-drifted retained sources", async () => {
    const database = new Pool({ connectionString: urlFor(databaseName) }), client = await database.connect();
    try {
      for (const workspace of [workspaceA, workspaceB]) await seedRun(client, workspace, driftRun);
      const original = originalBlock(driftRun), amended = amendedBlock(driftRun, "0");
      await seal(client, workspaceA, driftRun, 1, digestA);
      for (const block of [original, { ...amended, return_distribution: { ...amended.return_distribution, statistics_policy: null } },
        { ...amended, return_distribution: { ...amended.return_distribution,
          statistics_policy: { ...amended.return_distribution.statistics_policy, quantile_method: "NEAREST" } } }]) {
        await expect(companion(client, "enriched_chart_amendments_v1", workspaceA, driftRun, "WFO_RETAINED", "1", digestA, block))
          .rejects.toMatchObject({ code: "23514" });
      }
      await companion(client, "enriched_analysis_v1", workspaceA, driftRun, "WFO_RETAINED", "1", digestA, original);
      await companion(client, "enriched_chart_amendments_v1", workspaceA, driftRun, "WFO_RETAINED", "1", digestA, amended);
      expect(await read(client, workspaceA, driftRun)).toEqual(amended);
      await seal(client, workspaceA, driftRun, 2, digestB);
      expect(await read(client, workspaceA, driftRun)).toBeUndefined();
      await companion(client, "enriched_analysis_v1", workspaceA, driftRun, "WFO_RETAINED", "2", digestB, original);
      await companion(client, "enriched_chart_amendments_v1", workspaceA, driftRun, "WFO_RETAINED", "2", digestA, amended);
      await companion(client, "enriched_chart_amendments_v1", workspaceA, driftRun, "WFO_RETAINED", "99", digestB, amended);
      await seal(client, workspaceB, driftRun, 2, digestA);
      await companion(client, "enriched_chart_amendments_v1", workspaceB, driftRun, "WFO_RETAINED", "2", digestA,
        amendedBlock(driftRun, "9"), "2030-01-01T00:00:00Z");
      expect(await read(client, workspaceA, driftRun)).toEqual(original);
      expect(await read(client, "ws_b9_missing", driftRun)).toBeUndefined();
    } finally { client.release(); await database.end(); }
  });

  it("binds fixed-source amendments to the active worker, latest projection, exact digest and workspace", async () => {
    const database = new Pool({ connectionString: urlFor(databaseName) }), client = await database.connect();
    try {
      for (const workspace of [workspaceA, workspaceB]) {
        await seedRun(client, workspace, fixedRun);
        await fixedProducer(client, workspace, "wa_b9_current");
      }
      const original = originalBlock(fixedRun, "FIXED"), amended = amendedBlock(fixedRun, "0", "FIXED");
      const revision1 = "p13r1_" + "1".repeat(64), revision2 = "p13r1_" + "2".repeat(64);
      const inactiveRevision = "p13r1_" + "3".repeat(64);
      const sourceDigest = await fixedSource(client, workspaceA, "wa_b9_current", 1, revision1, original, "2026-01-01T00:00:00Z");
      await companion(client, "enriched_analysis_v1", workspaceA, fixedRun, "P04_SOURCE", revision1, sourceDigest, original);
      await companion(client, "enriched_chart_amendments_v1", workspaceA, fixedRun, "P04_SOURCE", revision1, sourceDigest, amended);
      expect(await read(client, workspaceA, fixedRun)).toEqual(amended);
      const inactiveDigest = await fixedSource(client, workspaceA, "wa_b9_inactive", 1, inactiveRevision,
        original, "2030-01-01T00:00:00Z");
      await companion(client, "enriched_chart_amendments_v1", workspaceA, fixedRun, "P04_SOURCE", inactiveRevision,
        inactiveDigest, amendedBlock(fixedRun, "8", "FIXED"), "2030-01-01T00:00:00Z");
      const foreignDigest = await fixedSource(client, workspaceB, "wa_b9_current", 1, revision1,
        original, "2030-01-01T00:00:00Z");
      await companion(client, "enriched_chart_amendments_v1", workspaceB, fixedRun, "P04_SOURCE", revision1,
        foreignDigest, amendedBlock(fixedRun, "9", "FIXED"), "2030-01-01T00:00:00Z");
      expect(await read(client, workspaceA, fixedRun)).toEqual(amended);
      // Equal timestamps still advance deterministically by projection revision.
      const newOriginal = originalBlock(fixedRun, "FIXED");
      newOriginal.library_summary.return_fraction = "0.123";
      const newDigest = await fixedSource(client, workspaceA, "wa_b9_current", 2, revision2,
        newOriginal, "2026-01-01T00:00:00Z");
      expect(await read(client, workspaceA, fixedRun)).toBeUndefined();
      await companion(client, "enriched_analysis_v1", workspaceA, fixedRun, "P04_SOURCE", revision2, newDigest, newOriginal);
      await companion(client, "enriched_chart_amendments_v1", workspaceA, fixedRun, "P04_SOURCE", revision2,
        sourceDigest, amended, "2031-01-01T00:00:00Z");
      expect(await read(client, workspaceA, fixedRun)).toEqual(newOriginal);
      expect((await client.query(`SELECT enriched::text AS original_bytes FROM research.enriched_analysis_v1
        WHERE workspace_id=$1 AND run_id=$2 AND source_revision=$3`, [workspaceA, fixedRun, revision1])).rows)
        .toEqual((await client.query("SELECT $1::jsonb::text AS original_bytes", [JSON.stringify(original)])).rows);
    } finally { client.release(); await database.end(); }
  });
});
