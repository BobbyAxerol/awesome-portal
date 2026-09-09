import { afterAll, describe, expect, it } from "vitest";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { runner as migrate } from "node-pg-migrate";
import { Pool } from "pg";
import {
  N09_GOVERNANCE_MIGRATION,
  N09_LEDGER_SENTINEL_MIGRATION,
  SESSION_ACTIVATION_MIGRATION,
  STAGED_ACTIVATION_MIGRATION,
  runControlApiMigrations,
} from "../src/cli/migrate";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const allMigrations = join(__dirname, "..", "migrations");
const legacyDatabase = `portal_legacy_n09_${randomUUID().replaceAll("-", "")}`;
const legacyDir = mkdtempSync(join(tmpdir(), "portal-n09-legacy-"));

function databaseUrlFor(name: string): string {
  const url = new URL(DATABASE_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

const prerenameDatabase = `portal_prerename_n09_${randomUUID().replaceAll("-", "")}`;
const prerenameDir = mkdtempSync(join(tmpdir(), "portal-n09-prerename-"));

/**
 * Everything a pre-rename ledger had already applied: through the staged
 * activation migration, without the sentinel that the rename brought with it.
 * This is dev's shape, and every long-lived database's.
 */
function copyPreRenameMigrationSlice(): void {
  for (const filename of readdirSync(allMigrations)) {
    if (filename === `${N09_LEDGER_SENTINEL_MIGRATION}.sql`) continue;
    if (filename <= `${STAGED_ACTIVATION_MIGRATION}.sql`) {
      cpSync(join(allMigrations, filename), join(prerenameDir, filename));
    }
  }
}

/** The migration names in the order node-pg-migrate loads them off disk. */
function migrationNamesInFileOrder(): string[] {
  return readdirSync(allMigrations)
    .filter((filename) => filename.endsWith(".sql"))
    .map((filename) => filename.slice(0, -".sql".length))
    .sort();
}

function copyLegacyMigrationSlice(): void {
  for (const filename of readdirSync(allMigrations)) {
    const include =
      filename < `${N09_GOVERNANCE_MIGRATION}.sql` ||
      filename === `${SESSION_ACTIVATION_MIGRATION}.sql`;
    if (include) {
      cpSync(join(allMigrations, filename), join(legacyDir, filename));
    }
  }
}

describe("stable N09 migration-ledger recovery", () => {
  afterAll(async () => {
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${legacyDatabase} WITH (FORCE)`);
      await admin.query(`DROP DATABASE IF EXISTS ${prerenameDatabase} WITH (FORCE)`);
    } finally {
      await admin.end();
      rmSync(legacyDir, { recursive: true, force: true });
      rmSync(prerenameDir, { recursive: true, force: true });
    }
  });

  it("recovers only the proven legacy ledger, then reaches the complete append-only chain", async () => {
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try {
      await admin.query(`CREATE DATABASE ${legacyDatabase}`);
    } finally {
      await admin.end();
    }

    copyLegacyMigrationSlice();
    const legacyUrl = databaseUrlFor(legacyDatabase);
    await migrate({
      databaseUrl: legacyUrl,
      dir: legacyDir,
      direction: "up",
      migrationsTable: "pgmigrations",
      count: Infinity,
      noLock: true,
      log: () => {},
    });

    const before = new Pool({ connectionString: legacyUrl });
    try {
      const ledger = await before.query<{ name: string }>(
        `SELECT name FROM pgmigrations ORDER BY run_on, name`,
      );
      expect(ledger.rows.map((row) => row.name)).toContain(SESSION_ACTIVATION_MIGRATION);
      expect(ledger.rows.map((row) => row.name)).not.toContain(N09_GOVERNANCE_MIGRATION);
    } finally {
      await before.end();
    }

    await expect(runControlApiMigrations(legacyUrl, allMigrations, () => {})).resolves.toBeUndefined();

    const after = new Pool({ connectionString: legacyUrl });
    try {
      const result = await after.query<{
        n09_ledger: boolean;
        limitations: boolean;
        lineage: boolean;
        history: boolean;
        queue_read: boolean;
        smoke_plans: boolean;
        conditions_register: boolean;
      }>(`
        SELECT
          EXISTS (SELECT 1 FROM pgmigrations WHERE name = $1) AS n09_ledger,
          to_regclass('public.governance_approval_known_limitations') IS NOT NULL AS limitations,
          to_regclass('public.governance_r2_lineage') IS NOT NULL AS lineage,
          to_regclass('public.governance_approval_history') IS NOT NULL AS history,
          to_regclass('public.execution_operation_queue_read') IS NOT NULL AS queue_read,
          to_regclass('public.governance_sandbox_smoke_plans') IS NOT NULL AS smoke_plans,
          to_regclass('public.governance_conditions_register') IS NOT NULL AS conditions_register
      `, [N09_GOVERNANCE_MIGRATION]);
      expect(result.rows[0]).toEqual({
        n09_ledger: true,
        limitations: true,
        lineage: true,
        history: true,
        queue_read: true,
        smoke_plans: true,
        conditions_register: true,
      });
      const ledgerOrder = await after.query<{ n09_id: number; session_id: number }>(
        `SELECT
           (SELECT id FROM pgmigrations WHERE name = $1) AS n09_id,
           (SELECT id FROM pgmigrations WHERE name = $2) AS session_id`,
        [N09_GOVERNANCE_MIGRATION, SESSION_ACTIVATION_MIGRATION],
      );
      expect(ledgerOrder.rows[0]?.n09_id).toBeLessThan(ledgerOrder.rows[0]?.session_id ?? 0);
    } finally {
      await after.end();
    }
  });

  it("places the release sentinel where the read order puts it, and repairs a half-placed one", async () => {
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try {
      await admin.query(`CREATE DATABASE ${prerenameDatabase}`);
    } finally {
      await admin.end();
    }

    copyPreRenameMigrationSlice();
    const prerenameUrl = databaseUrlFor(prerenameDatabase);
    await migrate({
      databaseUrl: prerenameUrl,
      dir: prerenameDir,
      direction: "up",
      migrationsTable: "pgmigrations",
      count: Infinity,
      noLock: true,
      log: () => {},
    });

    // node-pg-migrate reads the ledger with `ORDER BY run_on, id` and walks it
    // against the sorted filenames, so this is the sequence that has to match.
    const readOrder = async (pool: Pool): Promise<string[]> => {
      const result = await pool.query<{ name: string }>(
        `SELECT name FROM pgmigrations ORDER BY run_on, id`,
      );
      return result.rows.map((row) => row.name);
    };

    const db = new Pool({ connectionString: prerenameUrl });
    try {
      // A long-lived ledger applied this slice in one transaction, so every row
      // in it carries the same timestamp and the read order is decided by id
      // alone. That is the hard case and the one dev is in; a fresh migrate()
      // happens to stamp each row off its own clock read, which would let a
      // wrongly-placed sentinel pass by accident.
      await db.query(`UPDATE pgmigrations SET run_on = (SELECT min(run_on) FROM pgmigrations)`);

      const before = await readOrder(db);
      expect(before).toContain(STAGED_ACTIVATION_MIGRATION);
      expect(before).not.toContain(N09_LEDGER_SENTINEL_MIGRATION);

      await expect(runControlApiMigrations(prerenameUrl, allMigrations, () => {})).resolves.toBeUndefined();
      expect(await readOrder(db)).toEqual(migrationNamesInFileOrder());

      // The half-placement that took dev down: the row is present and its id is
      // right, but it carries an earlier timestamp, so it sorts ahead of the
      // same-prefix siblings it has to follow and the refusal comes back with
      // the two names swapped. A microsecond is all it takes, which is why the
      // repair must never round-trip the timestamp through a JavaScript Date.
      await db.query(
        `UPDATE pgmigrations SET run_on = run_on - interval '1 microsecond' WHERE name = $1`,
        [N09_LEDGER_SENTINEL_MIGRATION],
      );
      expect(await readOrder(db)).not.toEqual(migrationNamesInFileOrder());

      await expect(runControlApiMigrations(prerenameUrl, allMigrations, () => {})).resolves.toBeUndefined();
      expect(await readOrder(db)).toEqual(migrationNamesInFileOrder());
    } finally {
      await db.end();
    }
  });
});
