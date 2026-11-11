/** TEST_ONLY: verify the inventory refuses a real PostgreSQL RLS-filtered
 * role. This is not a recovery fence, source checkpoint, or cutover test.
 *
 * An opt-in flag and a uniquely named disposable DB on the bounded test
 * container are required; no production URL or shared test DB is accepted.
 * The database itself is provisioned/removed by the cell owner. This test
 * removes only the exact objects it creates, never a database or a schema
 * containing unknown objects. */
import { randomBytes } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { describe, expect, it } from "vitest";
import { captureV2RestoreInventory, compareV2RestoreInventories, RESTORE_V2_TABLES } from "../src/execution-v2/restore-inventory";

const optIn = process.env.PORTAL_TEST_RESTORE_RLS === "TEST_ONLY_DISPOSABLE_RLS";
const databaseUrl = process.env.TEST_DATABASE_URL;

function requireDisposableTarget(value: string): void {
  let target: URL;
  try { target = new URL(value); } catch { throw new Error("RESTORE_RLS_DISPOSABLE_DATABASE_REQUIRED"); }
  if (!["postgres:", "postgresql:"].includes(target.protocol) ||
      !/^control-api-test-postgres-[a-f0-9]{8}$/.test(target.hostname) ||
      !/^\/portal_restore_rls_[a-f0-9]{8}$/.test(target.pathname) ||
      target.username !== "portal" || (target.port !== "" && target.port !== "5432") ||
      target.search || target.hash)
    throw new Error("RESTORE_RLS_DISPOSABLE_DATABASE_REQUIRED");
}

describe("restore inventory RLS disposable target guard", () => {
  it("refuses ordinary, overridden and shared database targets before connecting", () => {
    expect(() => requireDisposableTarget("postgres://portal:test@control-api-test-postgres-1234abcd:5432/portal_restore_rls_a1b2c3d4"))
      .not.toThrow();
    for (const value of [
      "postgres://portal:test@control-api-test-postgres-1234abcd/portal_control_test",
      "postgres://portal:test@control-api-test-postgres-1234abcd/portal_restore_rls_a1b2c3d4?host=other",
      "postgres://other:test@control-api-test-postgres-1234abcd/portal_restore_rls_a1b2c3d4",
      "postgres://portal:test@localhost/portal_restore_rls_a1b2c3d4",
      "postgres://portal:test@control-api-test-postgres-1234abcd:5433/portal_restore_rls_a1b2c3d4",
      "not a URL",
    ]) expect(() => requireDisposableTarget(value)).toThrow("RESTORE_RLS_DISPOSABLE_DATABASE_REQUIRED");
  });
});

describe.skipIf(!optIn)("restore inventory with actual PostgreSQL RLS (TEST_ONLY)", () => {
  it("refuses the filtered principal rather than accepting a false empty inventory", async () => {
    if (!databaseUrl) throw new Error("RESTORE_RLS_DISPOSABLE_DATABASE_REQUIRED");
    requireDisposableTarget(databaseUrl);
    const pool = new Pool({ connectionString: databaseUrl, max: 2 });
    const admin = await pool.connect();
    const role = `restore_rls_${randomBytes(8).toString("hex")}`;
    const createdTables: string[] = [];
    let schemaCreated = false, roleCreated = false, publicUsageGranted = false;
    let restricted: PoolClient | undefined;
    try {
      const state = await admin.query<{ db: string; schema_exists: boolean; role_is_superuser: boolean; occupied: number }>(
        `SELECT current_database() AS db, to_regnamespace('elp210_candidate') IS NOT NULL AS schema_exists,
          (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS role_is_superuser,
          (SELECT count(*)::int FROM unnest($1::text[]) name WHERE to_regclass(name) IS NOT NULL) AS occupied`,
        [RESTORE_V2_TABLES]);
      const expectedDb = new URL(databaseUrl).pathname.slice(1);
      if (state.rows.length !== 1 || state.rows[0].db !== expectedDb || state.rows[0].schema_exists ||
          state.rows[0].role_is_superuser !== true || state.rows[0].occupied !== 0)
        throw new Error("RESTORE_RLS_CELL_NOT_EMPTY_OR_NOT_SUPERUSER");

      await admin.query("CREATE SCHEMA elp210_candidate");
      schemaCreated = true;
      for (const table of RESTORE_V2_TABLES) {
        // Names are the fixed, trusted inventory literals; never user input.
        await admin.query(`CREATE TABLE ${table} (value text NOT NULL)`);
        createdTables.push(table);
      }
      await admin.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
      roleCreated = true;
      await admin.query(`GRANT USAGE ON SCHEMA public, elp210_candidate TO ${role}`);
      publicUsageGranted = true;
      await admin.query(`GRANT SELECT ON ${RESTORE_V2_TABLES.join(",")} TO ${role}`);
      await admin.query("INSERT INTO public.auth_sessions(value) VALUES ('test-only-revoked-session')");
      await admin.query("ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY");
      await admin.query(`CREATE POLICY test_restore_rls_deny ON public.auth_sessions FOR SELECT TO ${role} USING (false)`);

      const full = await captureV2RestoreInventory(pool);
      expect(full.tables["public.auth_sessions"].count).toBe(1);
      expect(compareV2RestoreInventories(full, full).state).toBe("LOCAL_MATCH_NOT_A_CUTOVER_FENCE");

      // Real catalog checks, not only mocked query results. These objects are
      // created and removed only in the verified disposable database above.
      await admin.query("CREATE TABLE elp210_candidate.test_extra_authority (value text)");
      try {
        await expect(captureV2RestoreInventory(pool)).rejects.toThrow("V2_RESTORE_INVENTORY_UNSUPPORTED_AUTHORITY_SCOPE");
      } finally {
        await admin.query("DROP TABLE elp210_candidate.test_extra_authority");
      }
      await admin.query("CREATE SCHEMA elp210_c2_test_only");
      try {
        await expect(captureV2RestoreInventory(pool)).rejects.toThrow("V2_RESTORE_INVENTORY_UNSUPPORTED_AUTHORITY_SCOPE");
      } finally {
        await admin.query("DROP SCHEMA elp210_c2_test_only");
      }

      restricted = await pool.connect();
      await restricted.query(`SET ROLE ${role}`);
      const roleState = await restricted.query<{ active: boolean; count: number }>(
        "SELECT row_security_active('public.auth_sessions'::regclass) AS active, (SELECT count(*)::int FROM public.auth_sessions) AS count");
      expect(roleState.rows[0]).toEqual({ active: true, count: 0 });
      // The inventory creates its own transaction, while this bounded facade
      // keeps the same authenticated non-bypass connection until the check ends.
      const limitedPool = { connect: async () => ({ query: restricted!.query.bind(restricted), release: () => {} }) } as unknown as Pool;
      await expect(captureV2RestoreInventory(limitedPool)).rejects.toThrow("V2_RESTORE_INVENTORY_RLS_FILTER_ACTIVE");
    } finally {
      try {
        if (restricted) {
          try { await restricted.query("RESET ROLE"); } finally { restricted.release(); }
        }
      } finally {
        try {
          if (createdTables.length) await admin.query(`DROP TABLE ${createdTables.join(",")}`);
        } finally {
          try {
            if (publicUsageGranted) await admin.query(`REVOKE USAGE ON SCHEMA public, elp210_candidate FROM ${role}`);
          } finally {
            try { if (roleCreated) await admin.query(`DROP ROLE ${role}`); }
            finally {
              try { if (schemaCreated) await admin.query("DROP SCHEMA elp210_candidate"); }
              finally { admin.release(); await pool.end(); }
            }
          }
        }
      }
    }
  }, 30_000);
});
