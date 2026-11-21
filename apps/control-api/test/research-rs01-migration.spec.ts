import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { migrateTestDatabase } from "./harness";

// This is deliberately a one-off database rather than the shared test cell:
// RS-01 has additive immutable tables and altered CHECK constraints, so its
// migration proof must start from an empty ledger and leave no relation behind.
const baseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const databaseName = `portal_rs01_${randomUUID().replaceAll("-", "")}`;

function databaseUrlFor(name: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

const databaseUrl = databaseUrlFor(databaseName);

describe("RS-01 disposable PostgreSQL migration proof", () => {
  afterAll(async () => {
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  });

  it("installs corrected evidence constraints and the immutable terminal checkpoint", async () => {
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try {
      await admin.query(`CREATE DATABASE ${databaseName}`);
    } finally {
      await admin.end();
    }

    await migrateTestDatabase(databaseUrl);

    const database = new Pool({ connectionString: databaseUrl });
    try {
      const result = await database.query<{
        r2_sampling: boolean;
        zero_source_count: boolean;
        terminal_table: boolean;
        immutable_guard: boolean;
        runtime_can_insert: boolean;
        runtime_can_update: boolean;
      }>(`
        SELECT
          EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'run_evidence_series_v1_sampling_check'
              AND pg_get_constraintdef(oid) LIKE '%TAIL_WINDOW_V1%'
              AND pg_get_constraintdef(oid) LIKE '%FULL_RETURN_HISTOGRAM_V2%'
          ) AS r2_sampling,
          EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'run_evidence_series_v1_source_observation_count_check'
              AND pg_get_constraintdef(oid) LIKE '%>= 0%'
          ) AS zero_source_count,
          to_regclass('research.run_terminal_materializations_v1') IS NOT NULL AS terminal_table,
          EXISTS (
            SELECT 1 FROM pg_trigger
            WHERE tgname = 'research_run_terminal_materializations_v1_immutable_guard'
              AND NOT tgisinternal
          ) AS immutable_guard,
          has_table_privilege(
            'portal_research_runtime',
            'research.run_terminal_materializations_v1',
            'INSERT'
          ) AS runtime_can_insert,
          has_table_privilege(
            'portal_research_runtime',
            'research.run_terminal_materializations_v1',
            'UPDATE'
          ) AS runtime_can_update
      `);

      expect(result.rows[0]).toEqual({
        r2_sampling: true,
        zero_source_count: true,
        terminal_table: true,
        immutable_guard: true,
        runtime_can_insert: true,
        runtime_can_update: false,
      });
    } finally {
      await database.end();
    }
  });
});
