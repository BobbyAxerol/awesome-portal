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
/**
 * The release ledger sentinel that arrived with the N09 rename, and the
 * migration it has to precede.
 *
 * A database that applied N09 under its original name and then applied the
 * staged-activation migration has both recorded and has never seen the
 * sentinel. The sentinel's filename sorts between them, so node-pg-migrate
 * refuses the entire run — "Not run migration … is preceding already run
 * migration …" — and the service cannot start. That is every long-lived
 * pre-rename database, dev included.
 */
export const N09_LEDGER_SENTINEL_MIGRATION =
  "1723680000012_z_n09-governance-workflow-legacy-compatibility";
export const STAGED_ACTIVATION_MIGRATION =
  "1723680000013_execution-staged-activation";

export type LegacyN09State = "ABSENT" | "COMPLETE" | "PARTIAL";

function defaultMigrationsDir(): string {
  return join(__dirname, "..", "..", "migrations");
}

/** The Up half of a migration file, by its own Down delimiter. */
function upSqlOf(migrationsDir: string, migration: string): string {
  const source = readFileSync(join(migrationsDir, `${migration}.sql`), "utf8");
  const marker = "\n-- Down Migration";
  const end = source.indexOf(marker);
  if (end < 0) {
    throw new Error(`${migration} source has no Down Migration delimiter`);
  }
  return source.slice(0, end);
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

/**
 * The ledger in the order node-pg-migrate reads it. It sorts by `run_on` first
 * and only breaks ties with `id`, then walks that sequence against the sorted
 * filenames position by position — so a row's timestamp decides its place and
 * its id is merely the tiebreak. Asking Postgres for the order rather than
 * re-deriving it in JavaScript keeps microsecond timestamps exact.
 */
async function ledgerOrder(client: PoolClient): Promise<string[]> {
  const result = await client.query<{ name: string }>(
    `SELECT name FROM pgmigrations ORDER BY run_on, id`,
  );
  return result.rows.map((row) => row.name);
}

/**
 * Whether the sentinel already sits where its filename says it belongs: after
 * everything sharing its prefix, and before the staged-activation migration.
 *
 * Visible for the legacy-ledger test, which needs to assert the state both
 * before and after a repair without reproducing the ordering rule.
 */
export function sentinelIsPlaced(order: readonly string[], predecessors: readonly string[]): boolean {
  const at = order.indexOf(N09_LEDGER_SENTINEL_MIGRATION);
  const staged = order.indexOf(STAGED_ACTIVATION_MIGRATION);
  if (at < 0 || staged < 0) return false;
  if (at > staged) return false;
  return predecessors.every((name) => {
    const predecessor = order.indexOf(name);
    return predecessor >= 0 && predecessor < at;
  });
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

/**
 * Record the release ledger sentinel on a database that already carries N09.
 *
 * `recoverLegacyN09BeforeMigrate` above answers the case where N09 itself never
 * ran. This answers the neighbouring one: N09 ran under its pre-rename name,
 * the staged-activation migration ran after it, and the sentinel that now sits
 * between them by filename has never been recorded.
 *
 * The sentinel's Up is a non-mutating assertion — it exists to prove the N09
 * schema is present — so the honest repair is to run that assertion and, only
 * if it passes, record it in the position it would have occupied. Appending is
 * not enough: node-pg-migrate validates the ledger *id* order as well as the
 * names, so a row added at the end reproduces the same refusal. The id shift is
 * the one the recovery above already uses.
 *
 * Fails closed. If the assertion raises, nothing is written and the migrator
 * stops with the migration's own message rather than marking it applied on a
 * database that cannot satisfy it.
 */
export async function recordN09LedgerSentinel(
  databaseUrl: string,
  migrationsDir = defaultMigrationsDir(),
  log: (line: string) => void = (line) => console.log(line),
): Promise<"NOT_NEEDED" | "RECORDED"> {
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

    const sentinel = await migrationLedgerEntry(client, N09_LEDGER_SENTINEL_MIGRATION);
    const staged = await migrationLedgerEntry(client, STAGED_ACTIVATION_MIGRATION);
    const n09 = await migrationLedgerEntry(client, N09_GOVERNANCE_MIGRATION);
    const session = await migrationLedgerEntry(client, SESSION_ACTIVATION_MIGRATION);
    // Only the exact state described above. Anything else is left to the normal
    // runner rather than guessed at.
    if (!staged || !n09) {
      await client.query("COMMIT");
      return "NOT_NEEDED";
    }

    // The sentinel's place is decided by `(run_on, id)`, not by the id alone.
    // Recorded at the right id but an earlier timestamp, it reproduces the same
    // refusal with the two names swapped — which is exactly what a first attempt
    // at this repair did on dev.
    const predecessors = session ? [N09_GOVERNANCE_MIGRATION, SESSION_ACTIVATION_MIGRATION] : [N09_GOVERNANCE_MIGRATION];
    if (sentinelIsPlaced(await ledgerOrder(client), predecessors)) {
      await client.query("COMMIT");
      return "NOT_NEEDED";
    }

    // The sentinel's own words, run as the migration would run them. A row that
    // is already present means the assertion has passed once already and only
    // its position is wrong, so take the row out instead of asserting twice.
    if (sentinel) {
      await client.query(`DELETE FROM pgmigrations WHERE name = $1`, [N09_LEDGER_SENTINEL_MIGRATION]);
    } else {
      await client.query(upSqlOf(migrationsDir, N09_LEDGER_SENTINEL_MIGRATION));
    }

    // All four rows share one timestamp on the ledgers this repairs, so the
    // sentinel takes that same timestamp and needs an id strictly between its
    // predecessors and the staged entry. Reuse a slot the delete above may have
    // opened; otherwise open one by shifting the tail of the ledger up by an id.
    const predecessorId = session ? Math.max(n09.id, session.id) : n09.id;
    const freeResult = await client.query<{ free_id: number | null }>(
      `SELECT slot.id::integer AS free_id
         FROM generate_series($1::integer + 1, $2::integer - 1) AS slot(id)
        WHERE NOT EXISTS (SELECT 1 FROM pgmigrations m WHERE m.id = slot.id)
        ORDER BY slot.id DESC
        LIMIT 1`,
      [predecessorId, staged.id],
    );
    let sentinelId = freeResult.rows[0]?.free_id ?? null;
    if (sentinelId === null) {
      const maxResult = await client.query<{ max_id: number }>(
        `SELECT max(id)::integer AS max_id FROM pgmigrations`,
      );
      const maxId = maxResult.rows[0]?.max_id;
      if (!Number.isSafeInteger(maxId) || maxId < staged.id) {
        throw new Error("N09 ledger sentinel refused: pgmigrations ledger id shape is invalid");
      }
      // Two statements because id is the primary key: park the tail above every
      // id in use, then bring it back down one higher than it started.
      const offset = maxId + 1;
      await client.query(`UPDATE pgmigrations SET id = id + $1 WHERE id >= $2`, [offset, staged.id]);
      await client.query(`UPDATE pgmigrations SET id = id - $1 WHERE id >= $2`, [maxId, staged.id + offset]);
      sentinelId = staged.id;
    }
    // The timestamp is copied inside Postgres rather than carried through the
    // driver: `run_on` is microsecond-precision here and a JavaScript Date only
    // keeps milliseconds, so a round-trip silently rounds the sentinel down
    // below the siblings it has to follow.
    await client.query(
      `INSERT INTO pgmigrations (id, name, run_on)
       SELECT $1, $2, run_on FROM pgmigrations WHERE name = $3`,
      [sentinelId, N09_LEDGER_SENTINEL_MIGRATION, STAGED_ACTIVATION_MIGRATION],
    );
    await client.query(
      `SELECT setval(pg_get_serial_sequence('pgmigrations', 'id'),
                     (SELECT max(id) FROM pgmigrations), true)`,
    );

    // Prove the placement against the order Postgres actually reports, inside
    // the transaction, before any of it is durable. A repair that cannot show
    // it worked leaves the ledger untouched instead of half-written.
    if (!sentinelIsPlaced(await ledgerOrder(client), predecessors)) {
      throw new Error(
        "N09 ledger sentinel refused: the recorded row did not land between its neighbours",
      );
    }
    await client.query("COMMIT");
    log("Recorded the N09 release ledger sentinel in its filename position.");
    return "RECORDED";
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
  await recordN09LedgerSentinel(databaseUrl, migrationsDir, log);
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
