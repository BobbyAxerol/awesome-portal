import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

import { CURRENT_SOURCE_RUN_STATE_SQL } from "../src/research/current-source.repository";
import { RESEARCH_DB_RUNTIME_ROLE } from "../src/research/contracts";
import { migrateTestDatabase } from "./harness";

const baseUrl = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const databaseName = `portal_rs02_${randomUUID().replaceAll("-", "")}`;

function databaseUrlFor(name: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

const databaseUrl = databaseUrlFor(databaseName);

describe("RS-02 disposable PostgreSQL retained-current-source proof", () => {
  afterAll(async () => {
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try { await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`); } finally { await admin.end(); }
  });

  it("installs append-only current-source custody, immutable seal guards and restricted runtime grants", async () => {
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try { await admin.query(`CREATE DATABASE ${databaseName}`); } finally { await admin.end(); }
    await migrateTestDatabase(databaseUrl);
    const database = new Pool({ connectionString: databaseUrl });
    try {
      const result = await database.query<{
        batches: boolean; rows: boolean; seals: boolean; retained_import_digest: boolean; append_guard: boolean; immutable_guard: boolean;
        runtime_select: boolean; runtime_insert: boolean; runtime_update: boolean;
      }>(`
        SELECT
          to_regclass('research.current_source_import_batches_v1') IS NOT NULL AS batches,
          to_regclass('research.current_source_rows_v1') IS NOT NULL AS rows,
          to_regclass('research.current_source_seals_v1') IS NOT NULL AS seals,
          EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'research' AND table_name = 'current_source_seals_v1'
               AND column_name = 'retained_import_digest' AND is_nullable = 'NO'
          ) AS retained_import_digest,
          EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'current_source_rows_v1_seal_guard' AND NOT tgisinternal) AS append_guard,
          EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'current_source_seals_v1_immutable_guard' AND NOT tgisinternal) AS immutable_guard,
          has_table_privilege('portal_research_runtime', 'research.current_source_rows_v1', 'SELECT') AS runtime_select,
          has_table_privilege('portal_research_runtime', 'research.current_source_rows_v1', 'INSERT') AS runtime_insert,
          has_table_privilege('portal_research_runtime', 'research.current_source_rows_v1', 'UPDATE') AS runtime_update
      `);
      expect(result.rows[0]).toEqual({
        batches: true, rows: true, seals: true, retained_import_digest: true, append_guard: true, immutable_guard: true,
        runtime_select: true, runtime_insert: true, runtime_update: false,
      });
    } finally {
      await database.end();
    }
  });

  it("rejects a mutation of retained rows and every append after a seal", async () => {
    const database = new Pool({ connectionString: databaseUrl });
    const digest = "a".repeat(64);
    try {
      await database.query(`INSERT INTO portal_users
        (user_id, username, display_name, role, status, must_change_password)
        VALUES ('usr_rs02', 'rs02-owner', 'RS-02 owner', 'ADMIN', 'ACTIVE', false)`);
      await database.query(`INSERT INTO workspaces (workspace_id, name, owner_user_id)
        VALUES ('ws_rs02', 'RS-02 disposable workspace', 'usr_rs02')`);
      await database.query(`INSERT INTO research.current_source_import_batches_v1
        (workspace_id, run_id, artifact_revision, manifest_digest, source_transform_digest,
         table_kind, batch_ordinal, batch_digest, row_count)
        VALUES ('ws_rs02', 'run_rs02', 1, $1, $1, 'OBSERVATION', 0, $1, 1)`, [digest]);
      await database.query(`INSERT INTO research.current_source_rows_v1
        (workspace_id, run_id, artifact_revision, table_kind, source_ordinal, source_id, occurred_at_utc_ms, payload)
        VALUES ('ws_rs02', 'run_rs02', 1, 'OBSERVATION', 0, 'observation-0', 1704067200000, '{"equity":"100"}'::jsonb)`);

      await expect(database.query(`UPDATE research.current_source_rows_v1
        SET source_id = 'mutated-observation'
        WHERE workspace_id = 'ws_rs02' AND run_id = 'run_rs02' AND artifact_revision = 1`))
        .rejects.toMatchObject({ code: "55000" });

      await database.query(`INSERT INTO research.current_source_seals_v1
        (workspace_id, run_id, artifact_revision, source_adapter_id, profile_id, manifest_digest,
         source_transform_digest, requested_spec_digest, effective_spec_digest, dataset_binding_digest,
         retained_import_digest, table_rows, total_rows, summary)
        VALUES ('ws_rs02', 'run_rs02', 1, 'rs02.quantbt-advanced-wfo.v1', 'rs02.delta-wfo-global.v1',
                $1, $1, $1, $1, $1, $1, '{"OBSERVATION":1,"FOLD":2,"TRIAL":2,"CANDIDATE":1,"SELECTION":1}'::jsonb, 7, '{}'::jsonb)`, [digest]);
      await expect(database.query(`INSERT INTO research.current_source_import_batches_v1
        (workspace_id, run_id, artifact_revision, manifest_digest, source_transform_digest,
         table_kind, batch_ordinal, batch_digest, row_count)
        VALUES ('ws_rs02', 'run_rs02', 1, $1, $1, 'FOLD', 0, $1, 1)`, [digest]))
        .rejects.toMatchObject({ code: "23505" });
    } finally {
      await database.end();
    }
  });

  it("runs the no-seal run-state join as the runtime role (library view + P10 binding)", async () => {
    const database = new Pool({ connectionString: databaseUrl });
    const client = await database.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query(`SET LOCAL ROLE ${RESEARCH_DB_RUNTIME_ROLE}`);
      await client.query("SELECT set_config('research.workspace_id', $1, true)", [randomUUID()]);
      const result = await client.query(CURRENT_SOURCE_RUN_STATE_SQL, [randomUUID(), "rrun_absent"]);
      expect(result.rowCount).toBe(0);
      expect(result.fields.map((field) => field.name)).toEqual(["source_kind", "effective_status", "adapter_contract_digest"]);
      await client.query("ROLLBACK");
    } finally {
      client.release();
      await database.end();
    }
  });
});
