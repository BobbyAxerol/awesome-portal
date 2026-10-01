import { createHash, randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runner as migrate } from "node-pg-migrate";
import { Pool } from "pg";
import { runControlApiMigrations } from "../src/cli/migrate";

// Actual shared-preview ledger readback on 2026-09-27 ends at 067; the
// contributor packet's 068/069 are source filenames, not applied ledger rows.
// Prove that exact upgrade boundary with data/auth sentinels. This is a
// disposable database, never the shared preview or a Production target.
const baseUrl = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const databaseName = "research_upgrade_" + randomUUID().replaceAll("-", "");
const oldDir = mkdtempSync(join(tmpdir(), "research-preview-067-"));
const allDir = join(__dirname, "..", "migrations");
const urlFor = (name: string) => {
  const url = new URL(baseUrl); url.pathname = "/" + name; return url.toString();
};
const migrationNames = readdirSync(allDir).filter(name => name.endsWith(".sql")).sort();
const oldNames = migrationNames.filter(name => name < "1723680000070");
let database: Pool;
let oldLedger: string;
let sentinels: string;

async function ledger(names?: string[]): Promise<string> {
  const result = await database.query<{ snapshot: string }>(
    `SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.run_on,m.id),'[]'::jsonb)::text AS snapshot
       FROM pgmigrations m WHERE $1::text[] IS NULL OR name = ANY($1::text[])`, [names ?? null],
  );
  return result.rows[0]!.snapshot;
}
async function sentinelDigest(): Promise<string> {
  const result = await database.query<{ snapshot: string }>(
    `SELECT jsonb_build_object(
      'user',(SELECT to_jsonb(u) FROM portal_users u WHERE user_id = 'upgrade-owner'),
      'credential',(SELECT to_jsonb(p) FROM password_credentials p WHERE user_id = 'upgrade-owner'),
      'session',(SELECT to_jsonb(s) FROM auth_sessions s WHERE user_id = 'upgrade-owner'),
      'workspace',(SELECT to_jsonb(w) FROM workspaces w WHERE workspace_id = 'upgrade-workspace'),
      'run',(SELECT to_jsonb(r) FROM run_read_models r WHERE run_id = 'upgrade-historical-run')
    )::text AS snapshot`,
  );
  return createHash("sha256").update(result.rows[0]!.snapshot).digest("hex");
}

describe("P23 Research preview forward upgrade without ledger/data/auth rewrite", () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: urlFor("postgres") });
    try { await admin.query("CREATE DATABASE " + databaseName); } finally { await admin.end(); }
    for (const name of oldNames) cpSync(join(allDir, name), join(oldDir, name));
    await migrate({ databaseUrl: urlFor(databaseName), dir: oldDir, direction: "up",
      migrationsTable: "pgmigrations", count: Infinity, log: () => {} });
    database = new Pool({ connectionString: urlFor(databaseName) });
    await database.query(`
      INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version)
        VALUES ('upgrade-owner','upgrade-owner','Upgrade fixture','ADMIN','ACTIVE',false,7);
      INSERT INTO password_credentials(credential_id,user_id,password_hash,algorithm,parameters_json)
        VALUES ('upgrade-credential','upgrade-owner','test-only-opaque-existing-hash','argon2id','{"memoryCost":65536}');
      INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,session_version,idle_expires_at,absolute_expires_at)
        VALUES ('upgrade-session',repeat('a',64),'upgrade-owner','ACTIVE',repeat('b',64),7,now()+interval '1 day',now()+interval '2 days');
      INSERT INTO workspaces(workspace_id,name,owner_user_id)
        VALUES ('upgrade-workspace','Upgrade fixture workspace','upgrade-owner');
      INSERT INTO workspace_members(workspace_id,user_id,role)
        VALUES ('upgrade-workspace','upgrade-owner','OWNER');
      INSERT INTO run_read_models(run_id,workspace_id,owner_user_id,status,protocol,strategy_id,dataset_id)
        VALUES ('upgrade-historical-run','upgrade-workspace','upgrade-owner','COMPLETED','mode_1','fixture-alpha','BTCUSDT_1h');
    `);
    oldLedger = await ledger(); sentinels = await sentinelDigest();
  }, 120_000);

  afterAll(async () => {
    await database?.end();
    const admin = new Pool({ connectionString: urlFor("postgres") });
    try { await admin.query("DROP DATABASE IF EXISTS " + databaseName + " WITH (FORCE)"); }
    finally { await admin.end(); rmSync(oldDir, { recursive: true, force: true }); }
  });

  it("upgrades actual preview 067 through the current migration chain, preserving every historical ledger row and data/auth byte", async () => {
    expect(oldNames.at(-1)).toBe("1723680000067_research-journey-descriptor-v3.sql");
    await runControlApiMigrations(urlFor(databaseName), allDir, () => {});
    expect(await ledger(oldNames.map(name => name.slice(0,-4)))).toBe(oldLedger);
    expect(await sentinelDigest()).toBe(sentinels);
    const applied = await database.query<{ name: string }>(`SELECT name FROM pgmigrations ORDER BY name`);
    expect(applied.rows.map(row => row.name)).toEqual(migrationNames.map(name => name.slice(0, -4)));
    const journey = await database.query(`SELECT revision, content_sha256 FROM research.journey_descriptor_registry ORDER BY revision`);
    expect(journey.rows.map((row) => Number(row.revision))).toEqual([1, 2, 3, 4]);
    expect(journey.rows[3].content_sha256).toBe(
      "376acce59fa25435aebcf3ce225117d169415b6a1164617e5da11e68a82d5ab8",
    );
    const shape = await database.query(`SELECT
      EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='research.run_evidence_projections_v1'::regclass
        AND conname='run_evidence_projections_v1_candle_overview_bound_check') AS overview,
      to_regclass('research.research_jobs_convergence_sweep_v1_idx') IS NOT NULL AS convergence,
      to_regclass('research.research_alpha_versions_registry_keyset_idx') IS NOT NULL AS registry_keyset,
      to_regclass('research.utility_verify_slots_v1') IS NOT NULL AS utility_slots,
      has_table_privilege('portal_research_runtime','research.utility_verify_slots_v1','SELECT') AS utility_select,
      has_table_privilege('portal_research_runtime','research.utility_verify_slots_v1','INSERT') AS utility_insert,
      has_table_privilege('portal_research_runtime','research.utility_verify_slots_v1','DELETE') AS utility_delete,
      has_table_privilege('portal_research_runtime','research.utility_verify_slots_v1','UPDATE') AS utility_update`);
    expect(shape.rows[0]).toEqual({ overview:true, convergence:true, registry_keyset:true, utility_slots:true,
      utility_select:true, utility_insert:true, utility_delete:true, utility_update:false });
  }, 120_000);

  it("restarts the already-current migrator without another ledger row or data/auth change", async () => {
    const before = await ledger();
    await runControlApiMigrations(urlFor(databaseName), allDir, () => {});
    expect(await ledger()).toBe(before);
    expect(await sentinelDigest()).toBe(sentinels);
  }, 120_000);
});
