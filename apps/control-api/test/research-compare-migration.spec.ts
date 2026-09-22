import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

import { ResearchCompareRepository } from "../src/research/compare.repository";
import { migrateTestDatabase } from "./harness";

const baseUrl = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const databaseName = `portal_p20_${randomUUID().replaceAll("-", "")}`;
const digest = "a".repeat(64);

function databaseUrlFor(name: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

async function seed(database: Pool) {
  const userId = "usr_p20";
  const workspaceId = "ws_p20";
  const alphaId = "alpha-p20";
  await database.query(`INSERT INTO portal_users
    (user_id, username, display_name, role, status, must_change_password)
    VALUES ($1, 'p20-owner', 'P20 owner', 'ADMIN', 'ACTIVE', false)`, [userId]);
  await database.query(`INSERT INTO workspaces (workspace_id, name, owner_user_id)
    VALUES ($1, 'P20 disposable workspace', $2)`, [workspaceId, userId]);
  await database.query(`INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES ($1, $2, 'OWNER')`, [workspaceId, userId]);
  await database.query(`INSERT INTO research.alphas
    (workspace_id, alpha_id, name, owner_user_id, execution_subject_id)
    VALUES ($1, $2, 'P20 Alpha', $3, 'research.p20')`, [workspaceId, alphaId, userId]);

  const inserts: Array<[string, number, string, string, string]> = [
    ["run-p20-left", 1_704_672_000_000, "0.01", "100", "left-0"],
    ["run-p20-left", 1_704_675_600_000, "0.02", "102", "left-1"],
    ["run-p20-left", 1_704_679_200_000, "0.03", "105", "left-2"],
    ["run-p20-right", 1_704_672_000_000, "0.02", "200", "right-0"],
    ["run-p20-right", 1_704_675_600_000, "0.04", "208", "right-1"],
    ["run-p20-right", 1_704_679_200_000, "0.06", "221", "right-2"],
    // These sealed rows are deliberately outside the P14 outer-OOS interval
    // passed to pairRaw below. A successful comparison must never absorb a
    // full-sample prefix/suffix merely because the run/revision match.
    ["run-p20-left", 1_704_665_600_000, "0.99", "99", "left-before-outer-oos"],
    ["run-p20-right", 1_704_686_400_000, "0.99", "222", "right-after-outer-oos"],
  ];
  for (const [runId, occurredAtUtcMs, returnFraction, equity, sourceId] of inserts) {
    await database.query(`INSERT INTO research.current_source_rows_v1
      (workspace_id, run_id, artifact_revision, table_kind, source_ordinal, source_id,
       occurred_at_utc_ms, payload)
      VALUES ($1, $2, 1, 'OBSERVATION', $3, $4, $5,
              jsonb_build_object('return_fraction', $6::text, 'equity', $7::text))`, [
      workspaceId, runId, inserts.findIndex((value) => value[4] === sourceId), sourceId,
      occurredAtUtcMs, returnFraction, equity,
    ]);
  }
  return { workspaceId, userId, alphaId };
}

describe("P20 disposable PostgreSQL cache and exact-correlation proof", () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try { await admin.query(`CREATE DATABASE ${databaseName}`); } finally { await admin.end(); }
    await migrateTestDatabase(databaseUrlFor(databaseName));
  });

  afterAll(async () => {
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try { await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`); } finally { await admin.end(); }
  });

  it("installs an expiring operational cache with bounded runtime authority", async () => {
    const database = new Pool({ connectionString: databaseUrlFor(databaseName) });
    try {
      const shape = await database.query<{
        table_exists: boolean; expiry_index: boolean; runtime_select: boolean;
        runtime_insert: boolean; runtime_delete: boolean; runtime_update: boolean;
      }>(`
        SELECT
          to_regclass('research.compare_projection_cache_v1') IS NOT NULL AS table_exists,
          EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'research' AND indexname = 'research_compare_projection_cache_expiry_idx') AS expiry_index,
          has_table_privilege('portal_research_runtime', 'research.compare_projection_cache_v1', 'SELECT') AS runtime_select,
          has_table_privilege('portal_research_runtime', 'research.compare_projection_cache_v1', 'INSERT') AS runtime_insert,
          has_table_privilege('portal_research_runtime', 'research.compare_projection_cache_v1', 'DELETE') AS runtime_delete,
          has_table_privilege('portal_research_runtime', 'research.compare_projection_cache_v1', 'UPDATE') AS runtime_update
      `);
      expect(shape.rows[0]).toEqual({
        table_exists: true, expiry_index: true, runtime_select: true,
        runtime_insert: true, runtime_delete: true, runtime_update: false,
      });
    } finally {
      await database.end();
    }
  });

  it("uses only exact timestamp-aligned retained rows and persists no evidence mutation", async () => {
    const database = new Pool({ connectionString: databaseUrlFor(databaseName) });
    try {
      const fixture = await seed(database);
      const scope = { workspaceId: fixture.workspaceId, actorUserId: fixture.userId };
      const repository = new ResearchCompareRepository(database);
      const raw = await repository.pairRaw(scope, {
        left: {
          runId: "run-p20-left", artifactRevision: 1,
          outerOosStartUtcMs: 1_704_672_000_000, outerOosEndExclusiveUtcMs: 1_704_682_800_000,
          expectedOuterOosBars: 3,
        },
        right: {
          runId: "run-p20-right", artifactRevision: 1,
          outerOosStartUtcMs: 1_704_672_000_000, outerOosEndExclusiveUtcMs: 1_704_682_800_000,
          expectedOuterOosBars: 3,
        },
      });
      expect(raw).toMatchObject({
        leftSourceCount: 3, rightSourceCount: 3, matchedCount: 3,
        correlation: "1.000000000000",
        leftCommonReturnFraction: "0.0500000000000000",
        rightCommonReturnFraction: "0.1050000000000000",
      });
      const overlay = await repository.pairOverlay(scope, {
        left: {
          runId: "run-p20-left", artifactRevision: 1,
          outerOosStartUtcMs: 1_704_672_000_000, outerOosEndExclusiveUtcMs: 1_704_682_800_000,
          expectedOuterOosBars: 3,
        },
        right: {
          runId: "run-p20-right", artifactRevision: 1,
          outerOosStartUtcMs: 1_704_672_000_000, outerOosEndExclusiveUtcMs: 1_704_682_800_000,
          expectedOuterOosBars: 3,
        },
      });
      expect(overlay).toHaveLength(3);

      await repository.persistCache(scope, {
        alphaId: fixture.alphaId,
        mode: "pair",
        requestDigest: digest,
        sourceBindingDigest: "b".repeat(64),
        projectionRevision: `p20r1_${"c".repeat(64)}`,
        projectionDigest: "c".repeat(64),
        projection: { schema_version: "research.compare.v1", cache_fixture: true },
      });
      await expect(repository.cached(scope, fixture.alphaId, "pair", digest, "b".repeat(64)))
        .resolves.toEqual({ schema_version: "research.compare.v1", cache_fixture: true });
      const sourceRows = await database.query(`SELECT count(*)::integer AS count FROM research.current_source_rows_v1`);
      expect(sourceRows.rows[0]?.count).toBe(8);
    } finally {
      await database.end();
    }
  });
});
