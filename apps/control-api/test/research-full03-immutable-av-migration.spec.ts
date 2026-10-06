/** Real PostgreSQL upgrade/uniqueness proof; synthetic metadata, not HMD qualification. */
import { randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runner as migrate } from "node-pg-migrate";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runControlApiMigrations } from "../src/cli/migrate";
import { FULL03_DELTA_BINDING } from "../src/research/full03-delta.binding";
import { FULL06_DELTA_BINDING } from "../src/research/full06-delta.binding";
import { P04_DELTA_BINDING } from "../src/research/p04-delta.binding";
import { ResearchMetadataRepository } from "../src/research/repository";
import { executionRecipes, executionRecipeQualification } from "../src/research/execution-recipes";

const baseUrl = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const databaseName = `research_full03_av_${randomUUID().replaceAll("-", "")}`;
const oldDirectory = mkdtempSync(join(tmpdir(), "research-full03-av-098-"));
const migrationsDirectory = join(__dirname, "..", "migrations");
const previousMigrations = readdirSync(migrationsDirectory)
  .filter((name) => name.endsWith(".sql") && name < "1723680000099").sort();
const scope = { workspaceId: "ws_full03_av", actorUserId: "usr_full03_av" };
const urlFor = (name: string): string => {
  const url = new URL(baseUrl); url.pathname = `/${name}`; return url.toString();
};
let database: Pool;
let repository: ResearchMetadataRepository;
let historicalSnapshot: string;
let historicalLedger: string;

async function historicalBytes(): Promise<string> {
  const result = await database.query<{ snapshot: string }>(`
    SELECT jsonb_build_object(
      'version',(SELECT to_jsonb(v) FROM research.alpha_versions v WHERE workspace_id=$1 AND alpha_version_id=$2),
      'binding',(SELECT to_jsonb(b) FROM research.execution_adapter_bindings b WHERE workspace_id=$1 AND alpha_version_id=$2),
      'alpha',(SELECT to_jsonb(a) FROM research.alphas a WHERE workspace_id=$1 AND alpha_id=$3)
    )::text AS snapshot`, [scope.workspaceId, P04_DELTA_BINDING.alphaVersionId, P04_DELTA_BINDING.alphaId]);
  return result.rows[0]!.snapshot;
}

async function ledger(names?: string[]): Promise<string> {
  const result = await database.query<{ snapshot: string }>(`
    SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.run_on,m.id),'[]'::jsonb)::text AS snapshot
      FROM pgmigrations m WHERE $1::text[] IS NULL OR name=ANY($1::text[])`, [names ?? null]);
  return result.rows[0]!.snapshot;
}

async function seedWorkspace(workspaceId: string): Promise<void> {
  await database.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'FULL03 disposable AV fixture',$2)",
    [workspaceId, scope.actorUserId]);
  await database.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER')",
    [workspaceId, scope.actorUserId]);
}

async function insertVersion(workspaceId: string, versionId: string, overrides: {
  alphaId?: string; codeDigest?: string; entrypoint?: string; declaredContract?: unknown;
} = {}): Promise<unknown> {
  return database.query(`INSERT INTO research.alpha_versions
    (workspace_id,alpha_version_id,alpha_id,code_digest,entrypoint,dependency_ref,
     declared_contract,lifecycle_state,registered_by_user_id)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,'ACTIVE',$8)`, [workspaceId, versionId,
    overrides.alphaId ?? FULL03_DELTA_BINDING.alphaId,
    overrides.codeDigest ?? FULL03_DELTA_BINDING.codeDigest,
    overrides.entrypoint ?? FULL03_DELTA_BINDING.entrypoint,
    FULL03_DELTA_BINDING.dependencyRef,
    JSON.stringify(overrides.declaredContract ?? FULL03_DELTA_BINDING.declaredContract), scope.actorUserId]);
}

describe("FULL03 exact immutable AV migration on disposable PostgreSQL", () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: urlFor("postgres") });
    try { await admin.query(`CREATE DATABASE ${databaseName}`); } finally { await admin.end(); }
    for (const name of previousMigrations) cpSync(join(migrationsDirectory, name), join(oldDirectory, name));
    await migrate({ databaseUrl: urlFor(databaseName), dir: oldDirectory, direction: "up",
      migrationsTable: "pgmigrations", count: Infinity, log: () => {} });
    database = new Pool({ connectionString: urlFor(databaseName) });
    repository = new ResearchMetadataRepository(database);
    await database.query(`INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password)
      VALUES($1,'full03-av-owner','FULL03 disposable AV owner','ADMIN','ACTIVE',false)`, [scope.actorUserId]);
    await seedWorkspace(scope.workspaceId);
    await repository.ensureP04DeltaBinding(scope, P04_DELTA_BINDING);
    historicalSnapshot = await historicalBytes(); historicalLedger = await ledger();
    await runControlApiMigrations(urlFor(databaseName), migrationsDirectory, () => {});
  }, 120_000);

  afterAll(async () => {
    await database?.end();
    const admin = new Pool({ connectionString: urlFor("postgres") });
    try { await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`); }
    finally { await admin.end(); rmSync(oldDirectory, { recursive: true, force: true }); }
  });

  it("upgrades 098 to 099 without changing the old P04 AV, adapter, active pointer or migration ledger", async () => {
    expect(previousMigrations.at(-1)).toBe("1723680000098_research-full03-indexed-recipes.sql");
    expect(await historicalBytes()).toBe(historicalSnapshot);
    expect(await ledger(previousMigrations.map((name) => name.slice(0, -4)))).toBe(historicalLedger);
    const applied = await database.query("SELECT count(*)::int AS count FROM pgmigrations WHERE name=$1",
      ["1723680000099_research-full03-immutable-av"]);
    expect(applied.rows[0].count).toBe(1);
  });

  it("installs the new exact AV beside P04 and replays both installations without rewriting either identity", async () => {
    expect((await repository.ensureP04DeltaBinding(scope, FULL03_DELTA_BINDING)).replayed).toBe(false);
    const installed = await database.query<{ snapshot: string }>(`SELECT to_jsonb(v)::text AS snapshot
      FROM research.alpha_versions v WHERE workspace_id=$1 AND alpha_version_id=$2`,
    [scope.workspaceId, FULL03_DELTA_BINDING.alphaVersionId]);
    expect((await repository.ensureP04DeltaBinding(scope, FULL03_DELTA_BINDING)).replayed).toBe(true);
    expect((await repository.ensureP04DeltaBinding(scope, P04_DELTA_BINDING)).replayed).toBe(true);
    expect(await historicalBytes()).toBe(historicalSnapshot);
    const after = await database.query<{ snapshot: string }>(`SELECT to_jsonb(v)::text AS snapshot
      FROM research.alpha_versions v WHERE workspace_id=$1 AND alpha_version_id=$2`,
    [scope.workspaceId, FULL03_DELTA_BINDING.alphaVersionId]);
    expect(after.rows[0]!.snapshot).toBe(installed.rows[0]!.snapshot);
    const versions = await database.query("SELECT alpha_version_id,code_digest,entrypoint FROM research.alpha_versions WHERE workspace_id=$1 ORDER BY alpha_version_id", [scope.workspaceId]);
    expect(versions.rows).toEqual([P04_DELTA_BINDING, FULL03_DELTA_BINDING].map((binding) => ({
      alpha_version_id: binding.alphaVersionId, code_digest: binding.codeDigest, entrypoint: binding.entrypoint,
    })));
  });

  it.each([P04_DELTA_BINDING.alphaVersionId, FULL03_DELTA_BINDING.alphaVersionId])(
    "keeps the existing immutable identity guard on %s", async (alphaVersionId) => {
      await expect(database.query("UPDATE research.alpha_versions SET code_digest=$3 WHERE workspace_id=$1 AND alpha_version_id=$2",
        [scope.workspaceId, alphaVersionId, "b".repeat(64)])).rejects.toMatchObject({ code: "23514" });
    });

  it("preserves uniqueness for every generic imported version, including a duplicate of the protected P04 code", async () => {
    await expect(insertVersion(scope.workspaceId, "av_generic_protected_duplicate", {
      declaredContract: P04_DELTA_BINDING.declaredContract,
    })).rejects.toMatchObject({ code: "23505" });
    const importedAlpha = "full03-imported-alpha";
    await database.query(`INSERT INTO research.alphas(workspace_id,alpha_id,name,owner_user_id,execution_subject_id)
      VALUES($1,$2,'Imported fixture',$3,'full03.imported.fixture')`, [scope.workspaceId, importedAlpha, scope.actorUserId]);
    const input = { alphaId: importedAlpha, codeDigest: "c".repeat(64), entrypoint: "imported:generate_signals", declaredContract: {} };
    await insertVersion(scope.workspaceId, "av_generic_imported_original", input);
    await expect(insertVersion(scope.workspaceId, "av_generic_imported_duplicate", input))
      .rejects.toMatchObject({ code: "23505" });
  });

  it.each([
    ["contract", { declaredContract: { ...FULL03_DELTA_BINDING.declaredContract, warmup_bars: 299 } }],
    ["code", { codeDigest: "d".repeat(64) }],
    ["entrypoint", { entrypoint: "unqualified:generate_signals" }],
    ["alpha", { alphaId: "full03-tampered-alpha" }],
  ] as const)("rejects a new FULL03 AV with tampered %s rather than widening imported-code authority", async (kind, overrides) => {
    const workspaceId = `ws_full03_av_tamper_${kind}`;
    await seedWorkspace(workspaceId);
    await database.query(`INSERT INTO research.alphas(workspace_id,alpha_id,name,owner_user_id,execution_subject_id)
      VALUES($1,$2,'FULL03 tamper fixture',$3,$4)`, [workspaceId,
      "alphaId" in overrides ? overrides.alphaId : FULL03_DELTA_BINDING.alphaId,
      scope.actorUserId, `full03.tamper.${kind}`]);
    await expect(insertVersion(workspaceId, FULL03_DELTA_BINDING.alphaVersionId, overrides))
      .rejects.toMatchObject({ code: "23514" });
    expect((await database.query("SELECT count(*)::int AS count FROM research.alpha_versions WHERE workspace_id=$1", [workspaceId])).rows[0].count).toBe(0);
  });

  it("restarts the current migrator without another ledger row or historical identity changes", async () => {
    const before = await ledger();
    await runControlApiMigrations(urlFor(databaseName), migrationsDirectory, () => {});
    expect(await ledger()).toBe(before);
    expect(await historicalBytes()).toBe(historicalSnapshot);
  }, 120_000);

  it("appends 28 exact product receipts without rewriting the candidate qualification history", async () => {
    const receipts = await database.query(`SELECT d.profile_id,p.receipt_path,p.receipt_sha256
      FROM research.execution_recipe_product_receipts_v1 p
      JOIN research.execution_recipe_descriptors_v1 d ON d.recipe_digest=p.recipe_digest
      WHERE d.descriptor->>'schema_version'='research.full03-delta-profile.v1' ORDER BY d.profile_id`);
    expect(receipts.rows).toHaveLength(28);
    expect(new Set(receipts.rows.map(row=>row.receipt_sha256)).size).toBe(1);
    expect(receipts.rows.every(row=>row.receipt_path===
      "upgrade/research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md")).toBe(true);
    const candidates = await database.query(`SELECT q.kind,q.state,q.receipt_path
      FROM research.execution_recipe_qualifications_v1 q
      JOIN research.execution_recipe_descriptors_v1 d ON d.recipe_digest=q.recipe_digest
      WHERE d.descriptor->>'schema_version'='research.full03-delta-profile.v1'`);
    expect(candidates.rows).toHaveLength(28);
    expect(candidates.rows.every(row=>row.kind==='CANDIDATE_NOT_QUALIFIED'&&row.state==='CANDIDATE'&&row.receipt_path===null)).toBe(true);
    await expect(database.query("UPDATE research.execution_recipe_product_receipts_v1 SET receipt_sha256=$1 WHERE recipe_digest IN (SELECT recipe_digest FROM research.execution_recipe_descriptors_v1 WHERE descriptor->>'schema_version'='research.full03-delta-profile.v1')",
      ["0".repeat(64)])).rejects.toMatchObject({code:"55000"});
    expect(await historicalBytes()).toBe(historicalSnapshot);
  });

  it("adds 35 exact FULL04 descriptors beside unchanged FULL03 history", async () => {
    const expected = executionRecipes.filter(row => row.descriptor.schema_version === "research.full04-delta-profile.v1");
    const rows = (await database.query(`SELECT d.profile_id,d.profile_digest,d.recipe_digest,d.descriptor,q.kind,q.state
      FROM research.execution_recipe_descriptors_v1 d JOIN research.execution_recipe_qualifications_v1 q USING(recipe_digest)
      WHERE d.descriptor->>'schema_version'='research.full04-delta-profile.v1' ORDER BY d.profile_id`)).rows;
    expect(rows).toHaveLength(35);
    for (const row of rows) {
      const recipe = expected.find(value => value.profile_id === row.profile_id)!;
      expect(row).toMatchObject({ profile_digest: recipe.profile_digest, descriptor: recipe.descriptor,
        recipe_digest: executionRecipeQualification(row.profile_id).recipe_digest,
        kind: "CANDIDATE_NOT_QUALIFIED", state: "CANDIDATE" });
    }
    expect(await historicalBytes()).toBe(historicalSnapshot);
  });

  it("admits explicit full-sample exposure scope without weakening immutable facts", async () => {
    const constraints = (await database.query(`SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conrelid='research.exposure_facts'::regclass
        AND conname='exposure_facts_evaluation_role_check'`)).rows;
    expect(constraints).toHaveLength(1);
    for (const role of ["QUALITY_SCAN", "TRAIN", "SELECTION_INPUT", "OUTER_OOS", "HOLDOUT", "RETROSPECTIVE", "UNKNOWN", "FULL_SAMPLE_CALIBRATION"])
      expect(constraints[0].definition).toContain(role);
    const rights = (await database.query(`SELECT has_table_privilege('portal_research_runtime','research.exposure_facts','UPDATE') AS may_update`)).rows[0];
    expect(rights.may_update).toBe(false);
    expect(await historicalBytes()).toBe(historicalSnapshot);
  });
  it("appends35 FULL04 product proofs without rewriting their candidate history",async()=>{
    const rows=(await database.query(`SELECT d.profile_id,p.receipt_path,p.receipt_sha256,q.kind,q.state
      FROM research.execution_recipe_product_receipts_v1 p
      JOIN research.execution_recipe_descriptors_v1 d ON d.recipe_digest=p.recipe_digest
      JOIN research.execution_recipe_qualifications_v1 q ON q.recipe_digest=p.recipe_digest
      WHERE d.descriptor->>'schema_version'='research.full04-delta-profile.v1'`)).rows;
    expect(rows).toHaveLength(35);
    for(const row of rows){const ref=executionRecipeQualification(row.profile_id);
      expect(row).toMatchObject({receipt_path:ref.receipt_path,receipt_sha256:ref.receipt_sha256,
        kind:"CANDIDATE_NOT_QUALIFIED",state:"CANDIDATE"});}
    await expect(database.query(`UPDATE research.execution_recipe_product_receipts_v1 SET receipt_sha256=$1
      WHERE recipe_digest IN(SELECT recipe_digest FROM research.execution_recipe_descriptors_v1
        WHERE descriptor->>'schema_version'='research.full04-delta-profile.v1')`,["0".repeat(64)])).rejects.toMatchObject({code:"55000"});
    expect(await historicalBytes()).toBe(historicalSnapshot);
  });
  it("adds the exact percent-equity AV and63 candidates without rewriting notional custody", async () => {
    const before = (await database.query(`SELECT to_jsonb(v)::text AS snapshot FROM research.alpha_versions v
      WHERE workspace_id=$1 AND alpha_version_id=$2`, [scope.workspaceId, FULL03_DELTA_BINDING.alphaVersionId])).rows[0].snapshot;
    expect((await repository.ensureP04DeltaBinding(scope, FULL06_DELTA_BINDING)).replayed).toBe(false);
    expect((await repository.ensureP04DeltaBinding(scope, FULL06_DELTA_BINDING)).replayed).toBe(true);
    expect(await historicalBytes()).toBe(historicalSnapshot);
    expect((await database.query(`SELECT to_jsonb(v)::text AS snapshot FROM research.alpha_versions v
      WHERE workspace_id=$1 AND alpha_version_id=$2`, [scope.workspaceId, FULL03_DELTA_BINDING.alphaVersionId])).rows[0].snapshot).toBe(before);
    const rows = (await database.query(`SELECT d.profile_id,d.profile_digest,d.recipe_digest,d.descriptor,q.kind,q.state
      FROM research.execution_recipe_descriptors_v1 d JOIN research.execution_recipe_qualifications_v1 q USING(recipe_digest)
      WHERE d.descriptor->>'schema_version'='research.full06-delta-profile.v1'`)).rows;
    expect(rows).toHaveLength(63);
    for (const row of rows) {
      const recipe = executionRecipes.find(value => value.profile_id === row.profile_id)!;
      expect(row).toMatchObject({descriptor: recipe.descriptor, profile_digest: recipe.profile_digest,
        recipe_digest: executionRecipeQualification(row.profile_id).recipe_digest,kind:"CANDIDATE_NOT_QUALIFIED",state:"CANDIDATE"});
    }
    await expect(database.query(`UPDATE research.alpha_versions SET declared_contract=$3::jsonb
      WHERE workspace_id=$1 AND alpha_version_id=$2`, [scope.workspaceId, FULL06_DELTA_BINDING.alphaVersionId,
      JSON.stringify({...FULL06_DELTA_BINDING.declaredContract, warmup_bars:299})])).rejects.toMatchObject({code:"23514"});
    await expect(insertVersion(scope.workspaceId, "av_generic_percent_code_duplicate", {
      declaredContract:FULL06_DELTA_BINDING.declaredContract,
    })).rejects.toMatchObject({code:"23505"});
  });
  it("appends63 percent-equity product proofs without rewriting the candidate history or notional AV",async()=>{
    const rows=(await database.query(`SELECT d.profile_id,p.receipt_path,p.receipt_sha256,q.kind,q.state
      FROM research.execution_recipe_product_receipts_v1 p
      JOIN research.execution_recipe_descriptors_v1 d ON d.recipe_digest=p.recipe_digest
      JOIN research.execution_recipe_qualifications_v1 q ON q.recipe_digest=p.recipe_digest
      WHERE d.descriptor->>'schema_version'='research.full06-delta-profile.v1'`)).rows;
    expect(rows).toHaveLength(63);
    for(const row of rows){const ref=executionRecipeQualification(row.profile_id);
      expect(ref.kind).toBe("PRODUCT_RUN_QUALIFIED");
      expect(row).toMatchObject({receipt_path:ref.receipt_path,receipt_sha256:ref.receipt_sha256,
        kind:"CANDIDATE_NOT_QUALIFIED",state:"CANDIDATE"});}
    await expect(database.query(`UPDATE research.execution_recipe_product_receipts_v1 SET receipt_sha256=$1
      WHERE recipe_digest IN(SELECT recipe_digest FROM research.execution_recipe_descriptors_v1
        WHERE descriptor->>'schema_version'='research.full06-delta-profile.v1')`,["0".repeat(64)])).rejects.toMatchObject({code:"55000"});
    expect(await historicalBytes()).toBe(historicalSnapshot);
  });
});
