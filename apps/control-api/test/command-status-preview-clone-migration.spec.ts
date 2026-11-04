/** Explicitly opt-in rehearsal on a restored disposable preview clone only.
 * Never point this at preview, a shared database, or a live source. */
import { resolve } from "node:path";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { runControlApiMigrations } from "../src/cli/migrate";

type TestMigrationRunner = (options: { databaseUrl: string; dir: string; direction: "down";
  migrationsTable: string; count: number; noLock: boolean; log: (line: string) => void }) => Promise<unknown>;
const migrateDown = (require("node-pg-migrate") as { runner: TestMigrationRunner }).runner;
const url = process.env.TEST_DATABASE_URL;
const enabled = process.env.PORTAL_REHEARSAL_CLONE_0158 === "TEST_ONLY_RESTORED_CLONE" && !!url;
const tables = ["portal_users", "auth_sessions", "auth_audit_events", "portal_access_grants_v2",
  "execution_trusted_commands", "portal_native_root_obligations", "portal_native_current_read_obligations"] as const;

function assertRestoredCloneTarget(value: string): void {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error("TEST_ONLY_RESTORED_CLONE_REQUIRED"); }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || parsed.username !== "portal" ||
      !/^control-api-test-postgres-[a-f0-9]{8}$/u.test(parsed.hostname) ||
      (parsed.port !== "" && parsed.port !== "5432") || parsed.pathname !== "/portal_control_test" ||
      parsed.search || parsed.hash)
    throw new Error("TEST_ONLY_RESTORED_CLONE_REQUIRED");
}

describe("STATUS clone rehearsal target guard", () => {
  it("accepts only the named disposable clone without connection overrides", () => {
    expect(() => assertRestoredCloneTarget("postgres://portal:test@control-api-test-postgres-1234abcd:5432/portal_control_test")).not.toThrow();
    for (const value of ["postgres://portal:test@control-api-test-postgres-1234abcd:5432/portal_control_test?host=other",
      "postgres://portal:test@control-api-test-postgres-1234abcd:5432/portal_control_test?hostaddr=127.0.0.1",
      "postgres://other:test@control-api-test-postgres-1234abcd:5432/portal_control_test",
      "postgres://portal:test@control-api-test-postgres-1234abcd:5433/portal_control_test",
      "postgres://portal:test@127.0.0.1:5432/portal_control_test", "not-a-url"])
      expect(() => assertRestoredCloneTarget(value)).toThrow("TEST_ONLY_RESTORED_CLONE_REQUIRED");
  });
});

describe.skipIf(!enabled)("STATUS migration on a disposable restored preview clone", () => {
  it("applies the current CLI through 0158 without changing existing protected rows", async () => {
    assertRestoredCloneTarget(url!);
    const db = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 3_000 });
    try {
      const initial = await db.query("SELECT name FROM pgmigrations ORDER BY id DESC LIMIT 1");
      expect(initial.rows[0]?.name).toBe("1723680000154_execution-operation-health-publication");
      const fullAcl = process.env.PORTAL_REHEARSAL_FULL_ACL_0158 === "TEST_ONLY_OWNER_ACL_RESTORE";
      if (fullAcl) {
        const roles = await db.query(`SELECT current_user AS actor,
          pg_get_userbyid((SELECT datdba FROM pg_database WHERE datname=current_database())) AS database_owner,
          pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.portal_users'::regclass)) AS table_owner,
          (SELECT rolinherit FROM pg_roles WHERE rolname='portal_research_runtime') AS runtime_inherits`);
        expect(roles.rows[0]).toEqual({ actor: "portal", database_owner: "portal", table_owner: "portal", runtime_inherits: false });
        // Keep a non-internal trigger present even if this historical snapshot
        // happened to contain none. This is created ONLY on the restored clone.
        await db.query(`CREATE FUNCTION public.test_only_elp2_migration_trigger() RETURNS trigger
          LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$`);
        await db.query(`CREATE TRIGGER test_only_elp2_migration_trigger BEFORE UPDATE ON public.portal_users
          FOR EACH ROW EXECUTE FUNCTION public.test_only_elp2_migration_trigger()`);
      }
      const securityMetadata = async () => {
        const rows = await db.query(`
          SELECT 'schema:'||n.nspname AS key, jsonb_build_object('owner',pg_get_userbyid(n.nspowner),'acl',n.nspacl)::text AS value
            FROM pg_namespace n WHERE n.nspname IN ('public','research','elp210_candidate')
          UNION ALL SELECT 'relation:'||n.nspname||'.'||c.relname,
            jsonb_build_object('owner',pg_get_userbyid(c.relowner),'acl',c.relacl,'rls',c.relrowsecurity,
              'force_rls',c.relforcerowsecurity,'kind',c.relkind)::text
            FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname IN ('public','research','elp210_candidate')
          UNION ALL SELECT 'column:'||n.nspname||'.'||c.relname||'.'||a.attname, a.attacl::text
            FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname IN ('public','research','elp210_candidate') AND a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
          UNION ALL SELECT 'function:'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
            jsonb_build_object('owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'security_definer',p.prosecdef)::text
            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname IN ('public','research','elp210_candidate')
          UNION ALL SELECT 'default_acl:'||pg_get_userbyid(d.defaclrole)||':'||coalesce(n.nspname,'')||':'||d.defaclobjtype::text,
            d.defaclacl::text FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
          UNION ALL SELECT 'policy:'||schemaname||'.'||tablename||':'||policyname,
            jsonb_build_object('permissive',permissive,'roles',roles,'cmd',cmd,'qual',qual,'with_check',with_check)::text
            FROM pg_policies WHERE schemaname IN ('public','research','elp210_candidate')
          UNION ALL SELECT 'trigger:'||n.nspname||'.'||c.relname||':'||t.tgname,
            jsonb_build_object('definition',pg_get_triggerdef(t.oid,true),'enabled',t.tgenabled)::text
            FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname IN ('public','research','elp210_candidate') AND NOT t.tgisinternal
          UNION ALL SELECT 'role:'||rolname,
            jsonb_build_object('super',rolsuper,'inherit',rolinherit,'create_role',rolcreaterole,
              'create_db',rolcreatedb,'login',rolcanlogin,'replication',rolreplication,'bypass_rls',rolbypassrls)::text
            FROM pg_roles WHERE rolname IN ('portal','portal_research_runtime')
          UNION ALL SELECT 'membership:'||r.rolname||':'||m.rolname||':'||g.rolname,
            jsonb_build_object('admin',a.admin_option)::text FROM pg_auth_members a
            JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member JOIN pg_roles g ON g.oid=a.grantor
            WHERE r.rolname IN ('portal','portal_research_runtime') OR m.rolname IN ('portal','portal_research_runtime')
          ORDER BY key`);
        const result = new Map<string, string | null>();
        for (const row of rows.rows) {
          if (result.has(row.key)) throw new Error("TEST_ONLY_SECURITY_METADATA_KEY_COLLISION");
          result.set(row.key, row.value);
        }
        return result;
      };
      const fingerprint = async () => {
        const result: Record<string, { count: string; digest: string | null }> = {};
        for (const table of tables) {
          // Names are a closed local constant, never supplied by the test DB.
          const rows = await db.query(`SELECT count(*)::text AS count,
            md5(string_agg(row_to_json(t)::text, E'\\n' ORDER BY row_to_json(t)::text)) AS digest FROM ${table} t`);
          result[table] = rows.rows[0];
        }
        return result;
      };
      const before = await fingerprint(), securityBefore = fullAcl ? await securityMetadata() : undefined;
      if (securityBefore) expect(securityBefore.has("trigger:public.portal_users:test_only_elp2_migration_trigger")).toBe(true);
      await runControlApiMigrations(url!, resolve(__dirname, "../migrations"), () => undefined);
      expect(await fingerprint()).toEqual(before);
      if (securityBefore) {
        const securityAfter = await securityMetadata();
        for (const [key, value] of securityBefore) expect(securityAfter.get(key), key).toBe(value);
      }
      const ledger = await db.query("SELECT name FROM pgmigrations WHERE name LIKE '172368000015%' ORDER BY name");
      for (const name of ["1723680000155_execution-command-status-original-fingerprints",
        "1723680000156_execution-command-status-delivery-acks",
        "1723680000157_execution-command-status-context-links",
        "1723680000158_execution-command-status-preparations"])
        expect(ledger.rows.map(row => row.name)).toContain(name);
      const tablesPresent = await db.query("SELECT to_regclass('execution_command_status_preparations') IS NOT NULL AS present");
      expect(tablesPresent.rows[0]?.present).toBe(true);
      // The live migration explicitly forbids down without an approved drain.
      // Verify that safety behavior against this historical clone as well.
      await expect(migrateDown({ databaseUrl: url!, dir: resolve(__dirname, "../migrations"), direction: "down",
        migrationsTable: "pgmigrations", count: 1, noLock: true, log: () => undefined }))
        .rejects.toThrow("COMMAND_STATUS_PREPARATION_DOWN_REQUIRES_APPROVED_DRAIN");
      expect(await fingerprint()).toEqual(before);
      const afterDown = await db.query("SELECT name FROM pgmigrations WHERE name LIKE '172368000015%' ORDER BY name");
      expect(afterDown.rows).toEqual(ledger.rows);
      if (securityBefore) {
        const securityAfterDown = await securityMetadata();
        for (const [key, value] of securityBefore) expect(securityAfterDown.get(key), key).toBe(value);
      }
    } finally { await db.end(); }
  }, 120_000);
});
