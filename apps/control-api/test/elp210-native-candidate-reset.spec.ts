/** PROPOSAL R2n: reset of a STUCK candidate schema, real disposable PostgreSQL, TEST_ONLY identities, no native source. */
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { installResearchCurrentHumanSchema, assertRegisteredResearchCurrentHumanSchema, type NativeCoreSchemaTarget } from "../src/execution-v2/current-human-schema";
import { resetResearchCurrentHumanSchema } from "../src/execution-v2/native-candidate-reset";
import { migrateTestDatabase } from "./harness";

const sourcePath = join(__dirname, "../src/execution-v2/current-human-candidate.sql");
const configured = process.env.TEST_DATABASE_URL;
describe.skipIf(!configured)("R2n stuck-schema reset (proposal), disposable PostgreSQL", () => {
  const databaseName = `elp210_reset_${randomUUID().replaceAll("-", "")}`;
  const ownerId = `TEST_ONLY-reset-owner-${randomUUID()}`, workspaceId = `TEST_ONLY-reset-workspace-${randomUUID()}`;
  let pool: Pool, target: NativeCoreSchemaTarget, created = false, directory = "", archivePath = "", archiveSha = "";
  const url = (database: string) => { const value = new URL(configured!); value.pathname = `/${database}`; return value.toString(); };
  const reset = (over: Partial<Parameters<typeof resetResearchCurrentHumanSchema>[1]> = {}) => resetResearchCurrentHumanSchema(pool, {
    target, archive_path: archivePath, archive_sha256: archiveSha, confirm: `RESET_${archiveSha.slice(0, 8)}`, schema_sql_path: sourcePath, ...over });
  const guards = async () => Number((await pool.query(`SELECT count(*)::int AS n FROM pg_trigger WHERE NOT tgisinternal AND tgname IN('elp210_authority_guard','elp210_no_truncate')`)).rows[0].n);
  const identities = async () => (await pool.query("SELECT count(*)::int AS n FROM portal_users")).rows[0].n;
  async function makeStuck() {
    const lease = randomUUID(), attempt = randomUUID(), now = Date.now(), hex = (c: string) => c.repeat(64), deadline = new Date(now + 30000).toISOString();
    const baseBody = JSON.stringify({ binding: { lease_id: lease, attempt_id: attempt, subject: "s", workspace_id: workspaceId, environment: "paper",
      workload_id: "w", request_digest: hex("b") }, manager_intent: { schema_version: "pma.manager-read-intent.v1", action: "catalogue", digest: hex("b") }, deadline });
    const stable = createHash("sha256").update(baseBody).digest("hex");
    // Fixture only (disposable database, superuser): the admission trigger refuses hand-made rows, so user triggers are
    // switched off for this one connection while the stuck state of stage 2f is written directly.
    const c = await pool.connect();
    try {
      await c.query("SET session_replication_role = replica");
      await c.query(`INSERT INTO elp210_candidate.native_read_obligations(lease_id,attempt_id,authority_revision,subject_id,session_id,session_revision,
        workspace_id,environment,workload_id,request_digest,authority_fingerprint,source_identity_digest,base_body,stable_core_digest,binding_digest,
        deadline,issued_at_ms,expires_at_ms,lifecycle_kind,phase) VALUES($1,$2,0,'s','sess',1,$3,'paper','w',$4,$5,$5,$6,$7,$4,$8,$9,$10,'CUSTODY_ONLY','UNKNOWN')`,
        [lease, attempt, workspaceId, hex("b"), "sha256:" + hex("c"), baseBody, stable, deadline, now, now + 30000]);
      await c.query("UPDATE elp210_candidate.authority SET drain_id=$1 WHERE singleton", [randomUUID()]);
    } finally { await c.query("RESET session_replication_role").catch(() => undefined); c.release(); }
  }

  beforeAll(async () => {
    const admin = new Pool({ connectionString: url("postgres"), max: 1, connectionTimeoutMillis: 2000 });
    try { await admin.query(`CREATE DATABASE ${databaseName}`); created = true; } finally { await admin.end(); }
    await migrateTestDatabase(url(databaseName));
    pool = new Pool({ connectionString: url(databaseName), max: 3, connectionTimeoutMillis: 2000, query_timeout: 30000 });
    await pool.query(`INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version)
      VALUES($1,$1,'TEST_ONLY owner','USER','ACTIVE',false,7)`, [ownerId]);
    await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY ws',$2)", [workspaceId, ownerId]);
    await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER')", [workspaceId, ownerId]);
    await pool.query("INSERT INTO portal_owner_anchor(anchor_id,user_id,claimed_by) VALUES('PORTAL_OWNER',$1,'TEST_ONLY reset fixture')", [ownerId]);
    const observed = (await pool.query(`SELECT current_database() AS database_name,current_user AS role_name,(pg_control_system()).system_identifier::text AS database_system_identifier`)).rows[0];
    target = { database_name: observed.database_name, database_system_identifier: observed.database_system_identifier, role_name: observed.role_name,
      protected_owner_user_id: ownerId, workspace_id: workspaceId, principal_workspace_pins: [{ user_id: ownerId, workspace_id: workspaceId }] };
    await installResearchCurrentHumanSchema(pool, target, sourcePath);
    directory = await mkdtemp(join(tmpdir(), "elp210-reset-"));
    archivePath = join(directory, "archive.dump");
    const body = Buffer.alloc(2048, 7); await writeFile(archivePath, body, { mode: 0o600 });
    archiveSha = createHash("sha256").update(body).digest("hex");
  }, 120000);
  afterAll(async () => {
    await pool?.end();
    if (created) { const admin = new Pool({ connectionString: url("postgres"), max: 1 }); try { await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`); } finally { await admin.end(); } }
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("refuses a wrong confirmation, a wrong archive hash and a missing archive before touching anything", async () => {
    const guardsBefore = await guards();
    await expect(reset({ confirm: "RESET_00000000" })).rejects.toMatchObject({ code: "CONFIRMATION_INVALID" });
    await expect(reset({ archive_sha256: "a".repeat(64), confirm: "RESET_aaaaaaaa" })).rejects.toMatchObject({ code: "ARCHIVE_MISMATCH" });
    await expect(reset({ archive_path: join(directory, "nope.dump") })).rejects.toMatchObject({ code: "ARCHIVE_MISSING" });
    expect(await guards()).toBe(guardsBefore);
    await expect(assertRegisteredResearchCurrentHumanSchema(pool, target, sourcePath)).resolves.toMatchObject({ installed: false });
  });
  it("refuses a healthy schema (no open drain / no UNKNOWN obligation): NOT_STUCK, schema untouched", async () => {
    await expect(reset()).rejects.toMatchObject({ code: "NOT_STUCK" });
    await expect(assertRegisteredResearchCurrentHumanSchema(pool, target, sourcePath)).resolves.toMatchObject({ installed: false });
    expect(await guards()).toBeGreaterThan(0);
  });
  it("resets a stuck schema: registry and schema removed, registered installer from empty, identities untouched", async () => {
    await makeStuck();
    const users = await identities(), guardsBefore = await guards();
    const result = await reset();
    expect(result).toMatchObject({ drain_open: true, unknown_obligations: 1, installed: true, schema_version: "research-current-human.v1" });
    expect(result.before.native_read_obligations).toBe(1);
    expect(Object.values(result.after).every(n => n === 0 || n === 1)).toBe(true); // authority keeps its single singleton row
    expect(result.after.native_read_obligations).toBe(0);
    expect(await guards()).toBe(guardsBefore);
    expect(await identities()).toBe(users);
    expect((await pool.query("SELECT drain_id FROM elp210_candidate.authority WHERE singleton")).rows[0].drain_id).toBeNull();
    await expect(assertRegisteredResearchCurrentHumanSchema(pool, target, sourcePath)).resolves.toMatchObject({ installed: false });
    // a second reset is refused: the fresh schema is healthy again
    await expect(reset()).rejects.toMatchObject({ code: "NOT_STUCK" });
  });
});
