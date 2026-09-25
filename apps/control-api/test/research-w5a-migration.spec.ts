/**
 * W5a · migration 064 on real PostgreSQL (A10a receipts; A10c what-if lane).
 *
 * Runs only against a disposable database (TEST_DATABASE_URL), like the
 * other Research migration proofs.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

import { ResearchArtifactVerifyRepository } from "../src/research/artifact-verify.repository";
import { compareArtifactBytes } from "../src/research/artifact-verify.service";
import { migrateTestDatabase } from "./harness";

const baseUrl = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const databaseName = `portal_w5a_${randomUUID().replaceAll("-", "")}`;

function databaseUrlFor(name: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

const databaseUrl = databaseUrlFor(databaseName);
const scope = { workspaceId: "ws_w5a", actorUserId: "usr_w5a" };
const MANIFEST = "1".repeat(64);
const PART = "a".repeat(64);
const WRONG = "e".repeat(64);

describe("W5a migration 064 · A10a byte receipts on PostgreSQL", () => {
  let database: Pool;

  beforeAll(async () => {
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try { await admin.query(`CREATE DATABASE ${databaseName}`); } finally { await admin.end(); }
    await migrateTestDatabase(databaseUrl);
    database = new Pool({ connectionString: databaseUrl });
    await database.query(`INSERT INTO portal_users (user_id, username, display_name, role, status, must_change_password)
      VALUES ('usr_w5a', 'w5a-owner', 'W5a owner', 'ADMIN', 'ACTIVE', false)`);
    await database.query(`INSERT INTO workspaces (workspace_id, name, owner_user_id) VALUES ('ws_w5a', 'W5a', 'usr_w5a')`);
    await database.query(`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ('ws_w5a', 'usr_w5a', 'OWNER')
      ON CONFLICT DO NOTHING`);
    const client = await database.connect();
    try {
      await client.query("SET session_replication_role = replica");
      await client.query(`INSERT INTO research.runs
        (workspace_id, run_id, attempt_id, run_kind, relationship_kind, logical_run_key, request_spec_digest,
         effective_spec_digest, engine_release_id, dataset_binding_digest, state, submitted_by_user_id)
        VALUES ('ws_w5a', 'rrun_w5a', 'ratt_w5a', 'PRIMARY', 'PRIMARY', 'primary', $1, $1, 'er_quantbt_111', $1, 'READY', 'usr_w5a')`,
      [MANIFEST]);
      await client.query(`INSERT INTO research.artifacts
        (workspace_id, artifact_id, run_id, table_kind, schema_version, manifest_digest, state, retention_class,
         storage_locator, artifact_revision, worker_attempt_id, lease_epoch, manifest_schema_version, total_rows, total_bytes, sealed_at)
        VALUES ('ws_w5a', 'rart_w5a', 'rrun_w5a', 'research_bundle', 'research.artifact-manifest.v1', $1, 'SEALED',
                'RESEARCH_EVIDENCE', 'artifacts/rart_w5a', 1, 'rwa_w5a', 3, 'research.artifact-manifest.v1', 9, 900, now())`,
      [MANIFEST]);
      await client.query(`INSERT INTO research.artifact_parts
        (workspace_id, artifact_id, table_kind, part_ordinal, schema_version, relative_path, part_digest, row_count, byte_count)
        VALUES ('ws_w5a', 'rart_w5a', 'trials', 1, 'research.parquet-part.v1', 'tables/trials/part-00001.parquet', $1, 3, 300)`,
      [PART]);
      await client.query("SET session_replication_role = origin");
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await database?.end();
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try { await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`); } finally { await admin.end(); }
  });

  it("installs an append-only receipt table the runtime role can read and append, never update", async () => {
    const result = await database.query<Record<string, boolean>>(`SELECT
      to_regclass('research.artifact_byte_receipts_v1') IS NOT NULL AS receipts,
      has_table_privilege('portal_research_runtime', 'research.artifact_byte_receipts_v1', 'SELECT') AS runtime_select,
      has_table_privilege('portal_research_runtime', 'research.artifact_byte_receipts_v1', 'INSERT') AS runtime_insert,
      has_table_privilege('portal_research_runtime', 'research.artifact_byte_receipts_v1', 'UPDATE') AS runtime_update,
      has_table_privilege('portal_research_runtime', 'research.artifact_byte_receipts_v1', 'DELETE') AS runtime_delete`);
    expect(result.rows[0]).toEqual({ receipts: true, runtime_select: true, runtime_insert: true, runtime_update: false, runtime_delete: false });
  });

  it("P16-T03/T04 on PostgreSQL: corrupt bytes are a MISMATCH receipt; the sealed expectation never moves", async () => {
    const repository = new ResearchArtifactVerifyRepository(database);
    const expectation = await repository.expectation(scope, "rrun_w5a");
    expect(expectation).toMatchObject({ artifactId: "rart_w5a", artifactRevision: 1, expectedManifestDigest: MANIFEST });
    const observation = (partDigest: string) => ({
      schema_version: "research.artifact-byte-observation.v1" as const,
      artifact_id: "rart_w5a",
      manifest_state: "PRESENT" as const,
      manifest_digest: MANIFEST,
      manifest_artifact_revision: 1,
      parts: [{ relative_path: "tables/trials/part-00001.parquet", observed_digest: partDigest, observed_bytes: 300 }],
      documents: [],
    });
    const bad = compareArtifactBytes(expectation!, observation(WRONG));
    const first = await repository.record(scope, { runId: "rrun_w5a", artifactId: "rart_w5a", artifactRevision: 1, expectedManifestDigest: MANIFEST, ...bad });
    const again = await repository.record(scope, { runId: "rrun_w5a", artifactId: "rart_w5a", artifactRevision: 1, expectedManifestDigest: MANIFEST, ...bad });
    expect([first.state, again.state]).toEqual(["MISMATCH", "MISMATCH"]);
    // The seal record is untouched by either verify.
    const sealed = await database.query(`SELECT manifest_digest, state FROM research.artifacts WHERE artifact_id = 'rart_w5a'`);
    expect(sealed.rows[0]).toEqual({ manifest_digest: MANIFEST, state: "SEALED" });
    const part = await database.query(`SELECT part_digest FROM research.artifact_parts WHERE artifact_id = 'rart_w5a'`);
    expect(part.rows[0]).toEqual({ part_digest: PART });
    expect((await repository.latest(scope, "rrun_w5a"))?.receipt_id).toBe(again.receipt_id);
    // Restoring the original bytes is the only way back.
    const good = compareArtifactBytes(expectation!, observation(PART));
    const restored = await repository.record(scope, { runId: "rrun_w5a", artifactId: "rart_w5a", artifactRevision: 1, expectedManifestDigest: MANIFEST, ...good });
    expect(restored.state).toBe("MATCH");
    expect((await repository.latest(scope, "rrun_w5a"))?.state).toBe("MATCH");
  });

  it("refuses a receipt that names a different expectation, a MATCH without matching digests, and any mutation", async () => {
    const insert = (state: string, expected: string, observed: string | null, mismatched = 0) => database.query(
      `INSERT INTO research.artifact_byte_receipts_v1
        (workspace_id, receipt_id, run_id, artifact_id, artifact_revision, state, expected_manifest_digest,
         observed_manifest_digest, parts_checked, parts_mismatched, documents_checked, mismatches, requested_by_user_id)
       VALUES ('ws_w5a', $1, 'rrun_w5a', 'rart_w5a', 1, $2, $3, $4, 1, $5, 0, '[]'::jsonb, 'usr_w5a')`,
      [`rabv_${randomUUID().replaceAll("-", "")}`, state, expected, observed, mismatched],
    );
    await expect(insert("MISMATCH", WRONG, WRONG, 1)).rejects.toMatchObject({ code: "23514" });
    await expect(insert("MATCH", MANIFEST, WRONG)).rejects.toMatchObject({ code: "23514" });
    await expect(insert("MATCH", MANIFEST, MANIFEST, 1)).rejects.toMatchObject({ code: "23514" });
    await expect(database.query(`UPDATE research.artifact_byte_receipts_v1 SET state = 'MATCH' WHERE workspace_id = 'ws_w5a'`))
      .rejects.toMatchObject({ code: "55000" });
    await expect(database.query(`DELETE FROM research.artifact_byte_receipts_v1 WHERE workspace_id = 'ws_w5a'`))
      .rejects.toMatchObject({ code: "55000" });
  });
});
