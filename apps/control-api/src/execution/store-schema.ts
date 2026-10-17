import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {Pool} from "pg";

// Independent domain ledger. Reuse frozen SQL, never copy identity/Governance.
// Future DDL adds a new version here; changing a historical input fails closed.
const inputs = [
  ["1723680000014_execution-shared-admission.sql","b5c9e5b24091e0e6ab2263b84cd09d239fb8bfcf9e60eccfedf1bc7f6b839406"],
  ["1723680000016_execution-manager-lists.sql","387de443953be329d38b84c9244677bd8b696b0a5e71caf40aaab688b31d9ff5"],
  ["1723680000017_execution-alpha-fleet-v2.sql","8ee4b42bf85fffdad6f6becce4432a71fe04c555a4f47322044c1c16d09f4cbd"],
  ["1723680000018_execution-profile-local-projection.sql","f41543994c34d54dff9ba51891504407df01bc5054fa5fc544d06713b4dbc06e"],
  ["1723680000019_execution-projection-relation-cursors.sql","4532e49a3b68e8e2b32d6dc7f3adc5b4253445471a884f72c07df16e1bec34a0"],
  ["1723680000020_execution-timeseries-history.sql","cf912d8a9eb59953bce7144c4c58534b175ab8c6b9066277a70fd0e26d10b731"],
  ["1723680000021_execution-manager-operation-continuations.sql","e34ec73ddb9e892003545ec36578e11d60463ac89f5ae2af748e75ed93f0bc06"],
  ["1723680000022_execution-durable-current-range-mirror.sql","49e92b94f8c59eeb1af2610bd04acfc065bdeb3c5cc9773dd68f2c6761a06023"],
  ["1723680000023_execution-financial-query-cursors.sql","1d0c4cd7633cbb99ebb17d0df0880e7a3c62450fdd1dbb5ff12d53151142c658"],
  ["1723680000024_execution-portal-observation-journal.sql","e53b0f615666d87517dca28c37c70be3d572f477f8a0770deb9f23a116a76d6c"],
  ["1723680000025_execution-profile-projection-catalogue-provenance.sql","63167166d9ce0212d52cd8a69986b40e3066fa54e0a22c4522ffb73192cf0027"],
  ["1723680000026_execution-durable-mirror-catalogue-provenance.sql","a4ce32d2f4344cc6696e15d8465462cf911ea8e5faa45c4fbf2c18692b87e635"],
  ["1723680000030_execution-portfolio-projection.sql","2d4c5c636c9f12348879c6fb91aa2359d3af0fd9e5a5b23b904f1a9ccc38fb6c"],
  ["1723680000031_execution-profile-projection-refresh-health.sql","43d80fa6bac1f59338e9e7468af9dbbc44d2e89af3a03837ebdddf9b090b5e68"],
  ["1723680000033_execution-profile-wide-shared-admission.sql","e093bbcfd5b096381e270c2224d4bf04ed8170131d343c2aeca62c5d47f5a2f0"],
  ["1723680000130_udb-cache-storage-forward-repair.sql","85200fcc4b7509118941ed136c5f2bac8746ec685cb5b8929689ec38345ed84d"],
] as const;

export const EXECUTION_STORE_VERSION = "131.execution-store.v1";
const managerForwards = [
  ["135.execution-manager-models.v1", "1723680000135_execution-manager-models.sql",
    "1e4c6822e675955b7608c5bc0cd11fde145c1a8a6303a17bb6770b35ab0b1939"],
  ["137.execution-manager-consumer-fence.v1", "1723680000137_execution-manager-consumer-fence.sql",
    "366e1345dc1929bb9c1b19f1babff5ee913fc9b9753c46ae761aa41fc46cd7b2"],
  ["138.execution-manager-calculation-revisions.v1", "1723680000138_execution-manager-calculation-revisions.sql",
    "34bf8652a0b139d63db339736995da357b5c0b396928e0c2a5102440a24a48df"],
  ["139.execution-manager-score-mode-heads.v1", "1723680000139_execution-manager-score-mode-heads.sql",
    "520d4afe852862c31428ca38f3f2ca3091cf1f6664b97d4506d79a8976d7df76"],
] as const;
export function executionStoreSql(dir = join(__dirname,"../../migrations")): string {
  let sql = `CREATE TABLE execution_workspace_references (
    workspace_id text PRIMARY KEY, core_reference_receipt text NOT NULL,
    registered_at timestamptz NOT NULL DEFAULT clock_timestamp());
    COMMENT ON TABLE execution_workspace_references IS
    'Core-validated reference receipts, NOT identity or membership authority';
    CREATE TABLE execution_retained_imports (
      import_run_id text PRIMARY KEY, manifest_digest text NOT NULL UNIQUE,
      workspace_id text NOT NULL REFERENCES execution_workspace_references(workspace_id),
      manifest jsonb NOT NULL, imported_at timestamptz NOT NULL DEFAULT clock_timestamp());\n`;
  for (const [file,sha] of inputs) {
    const source = readFileSync(join(dir,file),"utf8");
    if (createHash("sha256").update(source).digest("hex") !== sha) throw new Error("EXECUTION_SCHEMA_INPUT_CHANGED");
    sql += source.split("-- Down Migration")[0].replaceAll(
      "REFERENCES workspaces(workspace_id)","REFERENCES execution_workspace_references(workspace_id)") + "\n";
  }
  return sql;
}

export async function migrateExecutionStore(pool: Pool): Promise<string> {
  const sql = executionStoreSql(), sha = createHash("sha256").update(sql).digest("hex");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='30s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('portal-execution-store-migrations'))");
    const existing = await client.query("SELECT to_regclass('execution_store_migrations') AS name");
    if (existing.rows[0].name) {
      const recorded = await client.query("SELECT digest FROM execution_store_migrations WHERE version=$1",[EXECUTION_STORE_VERSION]);
      if (recorded.rows[0]?.digest !== sha) throw new Error("EXECUTION_SCHEMA_LEDGER_DRIFT");
    } else {
      // Refuse an accidental Core target before creating any ledger/schema.
      const core = await client.query("SELECT to_regclass('portal_users') AS name");
      if (core.rows[0].name) throw new Error("EXECUTION_SCHEMA_CORE_TARGET_REFUSED");
      await client.query(sql);
      await client.query("CREATE TABLE execution_store_migrations (version text PRIMARY KEY,digest text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
      await client.query("INSERT INTO execution_store_migrations(version,digest) VALUES($1,$2)",[EXECUTION_STORE_VERSION,sha]);
    }
    // Append a separately pinned version: never rewrite the frozen v131 digest
    // that an already-hydrated isolated store has recorded.
    for (const forward of managerForwards) {
      const forwardSql = readFileSync(join(__dirname,"../../migrations",forward[1]),"utf8");
      if (createHash("sha256").update(forwardSql).digest("hex") !== forward[2]) throw new Error("EXECUTION_SCHEMA_INPUT_CHANGED");
      const recordedForward = await client.query("SELECT digest FROM execution_store_migrations WHERE version=$1",[forward[0]]);
      if (recordedForward.rowCount && recordedForward.rows[0].digest !== forward[2]) throw new Error("EXECUTION_SCHEMA_LEDGER_DRIFT");
      if (!recordedForward.rowCount) {
        await client.query(forwardSql.split("-- Down Migration")[0]);
        await client.query("INSERT INTO execution_store_migrations(version,digest) VALUES($1,$2)",[forward[0],forward[2]]);
      }
    }
    // Runtime can page retained facts and write only ephemeral coordination.
    // No schema/role privileges or modification of retained projection/history.
    if ((await client.query("SELECT 1 FROM pg_roles WHERE rolname='exec_runtime'")).rowCount) {
      await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO exec_runtime;
        GRANT INSERT,UPDATE,DELETE ON execution_shared_admission_state,execution_shared_admission_leases,
        execution_shared_read_flights,execution_shared_read_cache,execution_manager_operation_continuations,
        execution_financial_query_cursors TO exec_runtime`);
    }
    await client.query("COMMIT");
    return sha;
  } catch (error) { await client.query("ROLLBACK").catch(()=>undefined); throw error; }
  finally { client.release(); }
}
