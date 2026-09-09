import { afterAll, describe, expect, it } from "vitest";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { runner as migrate } from "node-pg-migrate";
import { Pool } from "pg";
import {
  N09_GOVERNANCE_MIGRATION,
  SESSION_ACTIVATION_MIGRATION,
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
    } finally {
      await admin.end();
      rmSync(legacyDir, { recursive: true, force: true });
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
});
