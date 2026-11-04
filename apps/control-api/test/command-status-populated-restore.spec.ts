/** TEST_ONLY: compare a pg_dump/pg_restore of the writer-created STATUS
 * custody and exercise the actual down migration on the restored copy.
 * The parent runner destroys both databases with its disposable PG cell. */
import { resolve } from "node:path";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";

type Runner = (options: { databaseUrl: string; dir: string; direction: "down";
  migrationsTable: string; count: number; noLock: boolean; log: (line: string) => void }) => Promise<unknown>;
const migrate = (require("node-pg-migrate") as { runner: Runner }).runner;
const sourceUrl = process.env.PORTAL_TEST_STATUS_SOURCE_URL;
const restoreUrl = process.env.TEST_DATABASE_URL;
const enabled = process.env.PORTAL_TEST_STATUS_RESTORE === "TEST_ONLY_DISPOSABLE_RESTORE" && !!sourceUrl && !!restoreUrl;
const tables = ["execution_command_status_original_fingerprints", "execution_command_status_delivery_acks",
  "execution_command_status_context_links", "execution_command_status_preparations", "elp210_candidate.leases"] as const;

describe.skipIf(!enabled)("populated STATUS custody restore and rollback guard", () => {
  it("preserves original, lease, context and ACK bytes and refuses unapproved down", async () => {
    const source = new URL(sourceUrl!), restored = new URL(restoreUrl!);
    const match = /^control-api-test-postgres-([a-f0-9]{8})$/u.exec(source.hostname);
    if (!match || source.protocol !== "postgres:" || restored.protocol !== "postgres:" ||
        source.host !== restored.host || source.username !== "portal" || restored.username !== "portal" ||
        source.pathname !== "/portal_control_test" || restored.pathname !== `/portal_custody_restore_${match[1]}` ||
        source.search || restored.search || source.hash || restored.hash)
      throw new Error("COMMAND_STATUS_RESTORE_DISPOSABLE_CELL_REQUIRED");
    const original = new Pool({ connectionString: sourceUrl, max: 1 });
    const copy = new Pool({ connectionString: restoreUrl, max: 1 });
    try {
      for (const [pool, expected] of [[original, "portal_control_test"], [copy, `portal_custody_restore_${match[1]}`]] as const) {
        const result = await pool.query("SELECT current_database() AS name, current_user AS actor");
        expect(result.rows[0]).toEqual({ name: expected, actor: "portal" });
      }
      const snapshot = async (pool: Pool) => {
        const records: Record<string, unknown> = {};
        for (const table of tables) {
          // Table names are a closed constant, never sourced from a request.
          const result = await pool.query(`SELECT count(*)::int AS n,
            md5(coalesce(string_agg(row_to_json(t)::text, E'\\n' ORDER BY row_to_json(t)::text), '')) AS digest FROM ${table} t`);
          expect(result.rows[0].n, table).toBeGreaterThan(0);
          records[table] = result.rows[0];
        }
        const metadata = await pool.query(`SELECT n.nspname, c.relname, pg_get_userbyid(c.relowner) AS owner,
          coalesce(c.relacl,acldefault('r',c.relowner))::text AS effective_acl, c.relrowsecurity, c.relforcerowsecurity,
          coalesce((SELECT json_agg(json_build_array(t.tgname, t.tgenabled) ORDER BY t.tgname)
            FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal), '[]'::json) AS triggers
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE c.oid = ANY($1::regclass[]) ORDER BY n.nspname,c.relname`, [tables]);
        const ledger = await pool.query("SELECT name FROM pgmigrations ORDER BY id");
        return { records, metadata: metadata.rows, ledger: ledger.rows };
      };
      const before = await snapshot(original);
      expect(before.ledger.at(-1)).toEqual({ name: "1723680000158_execution-command-status-preparations" });
      // pg_restore may canonicalize an explicit owner-default ACL to NULL.
      // Compare effective ACL above, and disclose raw representations without
      // logging row content, credentials, contexts or lease values.
      const rawAcl = async (pool: Pool) => (await pool.query(`SELECT n.nspname,c.relname,c.relacl::text AS acl
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE c.oid=ANY($1::regclass[]) ORDER BY n.nspname,c.relname`, [tables])).rows;
      const sourceAcl = await rawAcl(original), restoredAcl = await rawAcl(copy);
      const changedAcl = sourceAcl.filter((row, i) => JSON.stringify(row) !== JSON.stringify(restoredAcl[i]));
      console.log(`TEST_ONLY_RAW_ACL_REPRESENTATION_CHANGES=${changedAcl.length}`);
      expect(await snapshot(copy)).toEqual(before);
      await expect(migrate({ databaseUrl: restoreUrl!, dir: resolve(__dirname, "../migrations"), direction: "down",
        migrationsTable: "pgmigrations", count: 1, noLock: true, log: () => undefined }))
        .rejects.toThrow("COMMAND_STATUS_PREPARATION_DOWN_REQUIRES_APPROVED_DRAIN");
      expect(await snapshot(copy)).toEqual(before);
      expect(await snapshot(original)).toEqual(before);
    } finally {
      await Promise.all([original.end(), copy.end()]);
    }
  }, 60_000);
});
