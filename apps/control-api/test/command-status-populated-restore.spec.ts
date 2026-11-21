/** TEST_ONLY: compare a pg_dump/pg_restore of the writer-created STATUS
 * custody and exercise the actual down migration on the restored copy.
 * The parent runner destroys both databases with its disposable PG cell. */
import { resolve } from "node:path";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { accessDigest } from "../src/execution-v2/access-digest";
import { PgCommandStatusOriginalFingerprints } from "../src/execution-v2/command-status-original-fingerprints";

type Runner = (options: { databaseUrl: string; dir: string; direction: "down";
  migrationsTable: string; count: number; noLock: boolean; log: (line: string) => void }) => Promise<unknown>;
const migrate = (require("node-pg-migrate") as { runner: Runner }).runner;
const sourceUrl = process.env.PORTAL_TEST_STATUS_SOURCE_URL;
const restoreUrl = process.env.TEST_DATABASE_URL;
const enabled = process.env.PORTAL_TEST_STATUS_RESTORE === "TEST_ONLY_DISPOSABLE_RESTORE" && !!sourceUrl && !!restoreUrl;
const tables = ["execution_command_status_original_fingerprints", "execution_command_status_delivery_acks",
  "execution_command_status_context_links", "execution_command_status_preparations", "elp210_candidate.leases"] as const;
// Additional V2 authority/custody surfaces that must not disappear behind a
// matching STATUS-only snapshot. This test is not a production cutover gate.
const v2Tables = ["elp210_candidate.authority", "elp210_candidate.events", "elp210_candidate.mutations",
  "elp210_candidate.mutation_events", "elp210_candidate.native_read_obligations", "elp210_candidate.native_read_events",
  "portal_users", "auth_sessions", "portal_owner_anchor", "workspaces", "workspace_members",
  "portal_access_policy_state", "portal_access_grants_v2", "portal_access_proposals", "portal_access_policy_events",
  "portal_native_root_obligations", "portal_native_current_read_obligations", "execution_manager_consumer_fences",
  "execution_trusted_commands", "execution_trusted_command_events"] as const;

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
          WHERE c.oid = ANY($1::regclass[]) ORDER BY n.nspname,c.relname`, [[...tables, ...v2Tables]]);
        const ledger = await pool.query("SELECT name FROM pgmigrations ORDER BY id");
        return { records, metadata: metadata.rows, ledger: ledger.rows };
      };
      const before = await snapshot(original);
      expect(before.ledger.at(-1)).toEqual({ name: "1723680000158_execution-command-status-preparations" });
      const v2Snapshot = async (pool: Pool) => {
        const result: Record<string, { n: number; digest: string }> = {};
        for (const table of v2Tables) {
          // SQL identifiers are the closed TEST_ONLY list above; no row data
          // or request/authority material is returned or printed.
          const query = await pool.query(`SELECT count(*)::int AS n,
            encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY to_jsonb(t)::text), ''),'UTF8')),'hex') AS digest FROM ${table} t`);
          result[table] = query.rows[0];
        }
        return result;
      };
      const v2Before = await v2Snapshot(original);
      expect(await v2Snapshot(copy)).toEqual(v2Before);
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
      // Exercise the actual repository on restored writer-created records,
      // not only a byte comparison. Re-pinning the same original is a no-op;
      // changed originals and workspace substitution must fail without adding
      // another fingerprint, lease, context or ACK. Nothing is synthesized
      // into the restored DB and no original/credential is printed.
      const joined = await copy.query(`SELECT f.binding_digest,f.original_digest,f.status_bytes_digest,
        f.pm_status_request_digest,c.workspace_id,c.key_hash,c.intent_hash,c.intent,c.authorization_fact,c.actor_user_id
        FROM execution_command_status_original_fingerprints f
        JOIN execution_trusted_commands c ON c.command_id=f.command_id ORDER BY f.command_id LIMIT 1`);
      expect(joined.rowCount).toBe(1);
      const row = joined.rows[0], pin = { binding_digest:row.binding_digest, original_digest:row.original_digest,
        status_bytes_digest:row.status_bytes_digest, pm_status_request_digest:row.pm_status_request_digest,
        workspace_id:row.workspace_id, key_hash:row.key_hash, intent_hash:row.intent_hash,
        intent_digest:accessDigest(row.intent), authorization_digest:accessDigest(row.authorization_fact), actor_id:row.actor_user_id };
      const repository = new PgCommandStatusOriginalFingerprints(copy);
      await repository.pin(pin);
      await repository.pin(pin);
      const replacement = accessDigest(["TEST_ONLY-changed-original",pin.original_digest]);
      expect(replacement).not.toBe(pin.original_digest);
      await expect(repository.pin({...pin,original_digest:replacement})).rejects.toMatchObject({code:"COMMAND_STATUS_ORIGINAL_CHANGED"});
      await expect(repository.pin({...pin,workspace_id:"TEST_ONLY-wrong-workspace"})).rejects.toMatchObject({code:"COMMAND_STATUS_ORIGINAL_REQUIRED"});
      expect(await snapshot(copy)).toEqual(before);
      await expect(migrate({ databaseUrl: restoreUrl!, dir: resolve(__dirname, "../migrations"), direction: "down",
        migrationsTable: "pgmigrations", count: 1, noLock: true, log: () => undefined }))
        .rejects.toThrow("COMMAND_STATUS_PREPARATION_DOWN_REQUIRES_APPROVED_DRAIN");
      expect(await snapshot(copy)).toEqual(before);
      expect(await snapshot(original)).toEqual(before);
      // Simulate two independent post-backup facts on the disposable source:
      // an authority revision advance and a new durable policy mutation.
      // They intentionally do not impersonate a real revoke or source ACK.
      // STATUS-only equality still holds; the V2 comparison exposes the
      // unsafe stale restore. Roll back both synthetic writes before cleanup.
      await original.query("BEGIN");
      try {
        expect((await original.query("UPDATE elp210_candidate.authority SET revision=revision+1 WHERE singleton")).rowCount).toBe(1);
        await original.query(`INSERT INTO elp210_candidate.mutations
          (mutation_id,key_digest,binding_digest,replay_digest,family)
          VALUES ('TEST_ONLY-post-snapshot', 'sha256:'||repeat('a',64),
            'sha256:'||repeat('b',64), 'sha256:'||repeat('c',64), 'REVIEWED_POLICY')`);
        expect(await snapshot(original)).toEqual(before);
        const after = await v2Snapshot(original), stale = await v2Snapshot(copy);
        expect(stale).toEqual(v2Before);
        for (const table of ["elp210_candidate.authority", "elp210_candidate.mutations", "elp210_candidate.mutation_events"] as const)
          expect(after[table]).not.toEqual(stale[table]);
      } finally { await original.query("ROLLBACK"); }
      expect(await v2Snapshot(original)).toEqual(v2Before);
    } finally {
      await Promise.all([original.end(), copy.end()]);
    }
  }, 60_000);
});
