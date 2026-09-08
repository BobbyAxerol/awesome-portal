import "reflect-metadata";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool, PoolClient } from "pg";

// node-pg-migrate publishes its declarations through conditional exports that
// TypeScript's legacy CommonJS resolver cannot consume, while its supported
// runtime CommonJS entrypoint is deterministic. Keep the narrow local shape
// rather than changing the whole Control API resolver mode for one CLI.
type NodePgMigrateRunner = (options: {
  databaseUrl: string;
  dir: string;
  direction: "up";
  migrationsTable: string;
  count: number;
  log: (line: string) => void;
}) => Promise<unknown>;

const migrate = (require("node-pg-migrate") as {
  runner: NodePgMigrateRunner;
}).runner;

/**
 * The stable v1.0.1 ledger predates N09 but already contains the same-prefix
 * session migration.  node-pg-migrate correctly refuses to skip backwards in
 * that situation, so this narrowly-scoped preflight installs the unchanged
 * N09 schema and records exactly that historical migration before the normal
 * append-only runner is called.  It is deliberately not a generic migration
 * repair facility.
 */
export const N09_GOVERNANCE_MIGRATION =
  "1723680000012_execution-n09-governance-workflow";
export const SESSION_ACTIVATION_MIGRATION =
  "1723680000012_session-activation-proof";

export type LegacyN09State = "ABSENT" | "COMPLETE" | "PARTIAL";

function defaultMigrationsDir(): string {
  return join(__dirname, "..", "..", "migrations");
}

function n09UpSql(migrationsDir: string): string {
  const source = readFileSync(
    join(migrationsDir, `${N09_GOVERNANCE_MIGRATION}.sql`),
    "utf8",
  );
  const marker = "\n-- Down Migration";
  const end = source.indexOf(marker);
  if (end < 0) {
    throw new Error("N09 migration source has no Down Migration delimiter");
  }
  return source.slice(0, end);
}

interface MigrationLedgerEntry {
  id: number;
  run_on: Date;
}

async function migrationLedgerEntry(
  client: PoolClient,
  name: string,
): Promise<MigrationLedgerEntry | null> {
  const result = await client.query<MigrationLedgerEntry>(
    `SELECT id, run_on FROM pgmigrations WHERE name = $1 FOR UPDATE`,
    [name],
  );
  return result.rows[0] ?? null;
}

/** Visible for the legacy-ledger integration test; never based on data rows. */
export async function inspectLegacyN09State(client: PoolClient): Promise<LegacyN09State> {
  const result = await client.query<Record<string, boolean>>(`
    SELECT
      to_regclass('public.governance_approval_known_limitations') IS NOT NULL AS limitations,
      to_regclass('public.governance_r2_lineage') IS NOT NULL AS lineage,
      to_regclass('public.governance_approval_history') IS NOT NULL AS approval_history,
      to_regclass('public.execution_operation_queue_read') IS NOT NULL AS queue_read,
      to_regclass('public.governance_sandbox_smoke_plans') IS NOT NULL AS smoke_plans,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'governance_approval_requests'
          AND column_name = 'supersedes_approval_id'
      ) AS supersedes_column,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'execution_operation_queue_items'
          AND column_name = 'assigned_to_user_id'
      ) AS assignee_column,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'execution_operation_queue_items'
          AND column_name = 'assigned_at'
      ) AS assigned_at_column,
      EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'governance_approval_requests_terminal_shape'
      ) AS approval_shape_constraint,
      EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'execution_operation_queue_assignment_shape'
      ) AS queue_shape_constraint,
      EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'protect_governance_sandbox_smoke_plan'
      ) AS smoke_guard_function,
      (SELECT count(*) = 2
        FROM pg_trigger trigger
        JOIN pg_class relation ON relation.oid = trigger.tgrelid
        JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname = 'governance_sandbox_smoke_plans'
          AND NOT trigger.tgisinternal
      ) AS smoke_triggers
  `);
  const markers = Object.values(result.rows[0] ?? {});
  if (markers.length === 0 || markers.every((marker) => marker === false)) {
    return "ABSENT";
  }
  return markers.every((marker) => marker === true) ? "COMPLETE" : "PARTIAL";
}

/**
 * Repair only the proven legacy ledger state, then run the normal migration
 * chain.  Any unknown or partially-manual state fails closed rather than
 * guessing at schema/data history.
 */
export async function recoverLegacyN09BeforeMigrate(
  databaseUrl: string,
  migrationsDir = defaultMigrationsDir(),
  log: (line: string) => void = (line) => console.log(line),
): Promise<"NOT_NEEDED" | "RECOVERED"> {
  const pool = new Pool({ connectionString: databaseUrl });
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    const tableResult = await client.query<{ table_name: string | null }>(
      `SELECT to_regclass('public.pgmigrations') AS table_name`,
    );
    if (!tableResult.rows[0]?.table_name) return "NOT_NEEDED";

    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('portal-control-api-n09-legacy-recovery-v1'))");
    await client.query("LOCK TABLE pgmigrations IN SHARE ROW EXCLUSIVE MODE");

    const sessionEntry = await migrationLedgerEntry(client, SESSION_ACTIVATION_MIGRATION);
    const n09Entry = await migrationLedgerEntry(client, N09_GOVERNANCE_MIGRATION);
    if (!sessionEntry || n09Entry) {
      await client.query("COMMIT");
      return "NOT_NEEDED";
    }

    const state = await inspectLegacyN09State(client);
    if (state === "PARTIAL") {
      throw new Error(
        "legacy N09 recovery refused: schema is partially present while its migration ledger entry is absent",
      );
    }
    if (state === "ABSENT") {
      await client.query(n09UpSql(migrationsDir));
    }
    // node-pg-migrate validates the applied *ledger id* order as well as the
    // migration name.  Append-only insertion would leave N09 after session
    // and reproduce the original refusal.  Shift only the suffix beginning
    // with the known session entry, then insert N09 immediately before it;
    // business tables and every existing migration name remain untouched.
    const maxResult = await client.query<{ max_id: number }>(
      `SELECT max(id)::integer AS max_id FROM pgmigrations`,
    );
    const maxId = maxResult.rows[0]?.max_id;
    if (!Number.isSafeInteger(maxId) || maxId < sessionEntry.id) {
      throw new Error("legacy N09 recovery refused: pgmigrations ledger id shape is invalid");
    }
    const offset = maxId + 1;
    await client.query(`UPDATE pgmigrations SET id = id + $1 WHERE id >= $2`, [
      offset,
      sessionEntry.id,
    ]);
    await client.query(`UPDATE pgmigrations SET id = id - $1 WHERE id >= $2`, [
      maxId,
      sessionEntry.id + offset,
    ]);
    await client.query(
      `INSERT INTO pgmigrations (id, name, run_on)
       VALUES ($1, $2, $3::timestamp - interval '1 microsecond')`,
      [sessionEntry.id, N09_GOVERNANCE_MIGRATION, sessionEntry.run_on],
    );
    await client.query(
      `SELECT setval(pg_get_serial_sequence('pgmigrations', 'id'),
                     (SELECT max(id) FROM pgmigrations), true)`,
    );
    await client.query("COMMIT");
    log("Applied controlled legacy N09 governance recovery before normal migration run.");
    return "RECOVERED";
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK").catch(() => undefined);
    }
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}

export async function runControlApiMigrations(
  databaseUrl: string,
  migrationsDir = defaultMigrationsDir(),
  log: (line: string) => void = (line) => console.log(line),
): Promise<void> {
  await recoverLegacyN09BeforeMigrate(databaseUrl, migrationsDir, log);
  await migrate({
    databaseUrl,
    dir: migrationsDir,
    direction: "up",
    migrationsTable: "pgmigrations",
    count: Infinity,
    log,
  });
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for Control API migration");
  }
  await runControlApiMigrations(databaseUrl);
}

if (require.main === module) {
  void main();
}
