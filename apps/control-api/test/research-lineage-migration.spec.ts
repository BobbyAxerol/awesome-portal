import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

import { ResearchLineageRepository } from "../src/research/lineage.repository";
import { ResearchRunLibraryQuerySchema } from "../src/research/run-library.contract";
import { ResearchRunLibraryRepository } from "../src/research/run-library.repository";
import { migrateTestDatabase } from "./harness";

const baseUrl = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const databaseName = `portal_p19_${randomUUID().replaceAll("-", "")}`;
const digest = "a".repeat(64);

function databaseUrlFor(name: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

async function seed(database: Pool, suffix = ""): Promise<{ workspaceId: string; userId: string; alphaId: string; versionId: string; attemptId: string; runId: string }> {
  const userId = `usr_p19${suffix}`;
  const workspaceId = `ws_p19${suffix}`;
  const alphaId = `alpha-p19${suffix}`;
  const versionId = `av-p19${suffix}`;
  const attemptId = `att-p19${suffix}`;
  const runId = `run-p19${suffix}`;
  await database.query(`INSERT INTO portal_users
    (user_id, username, display_name, role, status, must_change_password)
    VALUES ($1, $2, 'P19 owner', 'ADMIN', 'ACTIVE', false)`, [userId, `p19-owner${suffix}`]);
  await database.query(`INSERT INTO workspaces (workspace_id, name, owner_user_id)
    VALUES ($1, 'P19 workspace', $2)`, [workspaceId, userId]);
  await database.query(`INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES ($1, $2, 'OWNER')`, [workspaceId, userId]);
  await database.query(`INSERT INTO research.alphas
    (workspace_id, alpha_id, name, owner_user_id, execution_subject_id)
    VALUES ($1, $2, 'P19 Alpha', $3, $4)`, [workspaceId, alphaId, userId, `subject-p19${suffix}`]);
  await database.query(`INSERT INTO research.alpha_versions
    (workspace_id, alpha_version_id, alpha_id, code_digest, entrypoint, dependency_ref,
     declared_contract, lifecycle_state, registered_by_user_id)
    VALUES ($1, $2, $3, $4, 'strategy:main', 'quantbt@1.1.1',
            '{"version":"0.9.1"}'::jsonb, 'ACTIVE', $5)`, [workspaceId, versionId, alphaId, digest, userId]);
  await database.query(`UPDATE research.alphas SET active_version_id = $3
    WHERE workspace_id = $1 AND alpha_id = $2`, [workspaceId, alphaId, versionId]);
  await database.query(`INSERT INTO research.attempts
    (workspace_id, attempt_id, alpha_version_id, client_intent_id, request_payload_digest,
     intent_kind, state, created_by_user_id)
    VALUES ($1, $2, $3, $4, $5, 'NEW', 'FAILED', $6)`, [workspaceId, attemptId, versionId, `intent-p19${suffix}`, digest, userId]);
  await database.query(`INSERT INTO research.runs
    (workspace_id, run_id, attempt_id, run_kind, relationship_kind, logical_run_key,
     request_spec_digest, effective_spec_digest, engine_release_id, dataset_binding_digest,
     state, submitted_by_user_id)
    VALUES ($1, $2, $3, 'PRIMARY', 'PRIMARY', 'primary', $4, $4, 'quantbt-1.1.1', $4,
            'FAILED', $5)`, [workspaceId, runId, attemptId, digest, userId]);
  return { workspaceId, userId, alphaId, versionId, attemptId, runId };
}

describe("P19 disposable PostgreSQL migration and retained-lineage proof", () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try { await admin.query(`CREATE DATABASE ${databaseName}`); } finally { await admin.end(); }
    await migrateTestDatabase(databaseUrlFor(databaseName));
  });

  afterAll(async () => {
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try { await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`); } finally { await admin.end(); }
  });

  it("P19-T04/T05/T07/T11 installs immutable, same-version source picks with read-only runtime authority", async () => {
    const database = new Pool({ connectionString: databaseUrlFor(databaseName) });
    try {
      const row = await seed(database);
      const shape = await database.query<{
        table_exists: boolean; immutable_trigger: boolean; runtime_select: boolean; runtime_insert: boolean;
      }>(`
        SELECT
          to_regclass('research.attempt_promotion_pick_facts_v1') IS NOT NULL AS table_exists,
          EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'research_attempt_promotion_pick_facts_v1_immutable_guard' AND NOT tgisinternal) AS immutable_trigger,
          has_table_privilege('portal_research_runtime', 'research.attempt_promotion_pick_facts_v1', 'SELECT') AS runtime_select,
          has_table_privilege('portal_research_runtime', 'research.attempt_promotion_pick_facts_v1', 'INSERT') AS runtime_insert
      `);
      expect(shape.rows[0]).toEqual({ table_exists: true, immutable_trigger: true, runtime_select: true, runtime_insert: false });

      await database.query(`INSERT INTO research.attempt_promotion_pick_facts_v1
        (workspace_id, alpha_version_id, attempt_id, run_id, source_fact_ref,
         source_contract_rev, source_digest, source_as_of)
        VALUES ($1, $2, $3, $4, 'owner://p19/source/1', 'dr03.v1', $5, now())`,
      [row.workspaceId, row.versionId, row.attemptId, row.runId, digest]);
      await expect(database.query(`UPDATE research.attempt_promotion_pick_facts_v1
        SET source_fact_ref = 'owner://mutated'
        WHERE workspace_id = $1 AND alpha_version_id = $2`, [row.workspaceId, row.versionId]))
        .rejects.toMatchObject({ code: "55000" });

      const other = await seed(database, "_other");
      await expect(database.query(`INSERT INTO research.attempt_promotion_pick_facts_v1
        (workspace_id, alpha_version_id, attempt_id, run_id, source_fact_ref,
         source_contract_rev, source_digest, source_as_of)
        VALUES ($1, $2, $3, $4, 'owner://bad', 'dr03.v1', $5, now())`,
      [row.workspaceId, row.versionId, other.attemptId, other.runId, digest]))
        .rejects.toMatchObject({ code: "23514" });
    } finally {
      await database.end();
    }
  });

  it("P19-T01/T05/T09 reads a failed retained attempt once while retry count stays separate from nodes", async () => {
    const database = new Pool({ connectionString: databaseUrlFor(databaseName) });
    try {
      const row = await seed(database, "_read");
      await database.query(`INSERT INTO research.jobs
        (workspace_id, job_id, run_id, command_id, logical_work_key, work_digest,
         job_kind, readiness_class, queue_class, cost_estimate, resource_class, attempt_limit,
         state, requested_by_user_id)
        VALUES ($1, 'job-p19-read', $2, 'command-p19-read', 'primary', $3,
                'PRIMARY', 'MANDATORY', 'INTERACTIVE', '{"cpu_seconds":1,"memory_bytes":1,"scratch_bytes":1,"io_bytes":1}'::jsonb,
                'p19', 3, 'FAILED', $4)`, [row.workspaceId, row.runId, digest, row.userId]);
      await database.query(`INSERT INTO research.worker_attempts
        (workspace_id, worker_attempt_id, job_id, ordinal, worker_id, lease_epoch, expires_at, state)
        VALUES ($1, 'worker-p19-read-1', 'job-p19-read', 1, 'worker', 1, now(), 'FAILED'),
               ($1, 'worker-p19-read-2', 'job-p19-read', 2, 'worker', 2, now(), 'FAILED')`, [row.workspaceId]);
      // Query P19's actual per-attempt child-run SQL bound.  The primary run
      // is intentionally excluded before ranking, so the sentinel 33rd row
      // is an unambiguous truncation detector rather than an off-by-one.
      await database.query(`INSERT INTO research.runs
        (workspace_id, run_id, attempt_id, run_kind, relationship_kind, logical_run_key,
         parent_run_id, request_spec_digest, effective_spec_digest, engine_release_id,
         dataset_binding_digest, state, submitted_by_user_id)
        SELECT $1, 'run-p19-read-audit-' || series::text, $2, 'AUDIT', 'AUDIT_OF_SELECTION',
               'audit-' || series::text, $3, $4, $4, 'quantbt-1.1.1', $4, 'READY', $5
          FROM generate_series(1, 33) AS series`,
      [row.workspaceId, row.attemptId, row.runId, digest, row.userId]);
      const repository = new ResearchLineageRepository(database);
      const result = await repository.read({ workspaceId: row.workspaceId, actorUserId: row.userId }, row.alphaId, 128);
      expect(result?.attempts).toHaveLength(1);
      // pg deliberately returns bigint as a decimal string at the repository
      // boundary. The P19 service normalizes it to an exact safe integer for
      // the generated browser DTO (covered in the service contract suite).
      expect(result?.attempts[0]).toMatchObject({ attempt_id: row.attemptId, state: "FAILED" });
      expect(Number(result?.attempts[0]?.technical_retry_count)).toBe(1);
      expect({
        total_attempts: Number(result?.counts.total_attempts),
        failed_attempts: Number(result?.counts.failed_attempts),
        technical_retries: Number(result?.counts.technical_retries),
      }).toEqual({ total_attempts: 1, failed_attempts: 1, technical_retries: 1 });
      expect(result?.childRuns).toHaveLength(33);
      expect(result?.childRuns.every((value) => value.relationship_kind !== "PRIMARY")).toBe(true);
    } finally {
      await database.end();
    }
  });

  it("W6b CG-P19-09/13/05 pages newest-first windows and reconciles counts with the Run Library", async () => {
    const database = new Pool({ connectionString: databaseUrlFor(databaseName) });
    try {
      const row = await seed(database, "-w6b");
      // Four more attempts, one minute apart after the seeded FAILED one: two
      // READY with PRIMARY runs, one DRAFT (no run), one ABANDONED with a run.
      const extra: Array<[string, string, string | null]> = [
        ["att-w6b-2", "READY", "run-w6b-2"],
        ["att-w6b-3", "DRAFT", null],
        ["att-w6b-4", "ABANDONED", "run-w6b-4"],
        ["att-w6b-5", "READY", "run-w6b-5"],
      ];
      await database.query("UPDATE research.attempts SET created_at = '2026-09-22T00:00:00.000001Z' WHERE workspace_id = $1 AND attempt_id = $2", [row.workspaceId, row.attemptId]);
      for (const [index, [attemptId, state, runId]] of extra.entries()) {
        await database.query(`INSERT INTO research.attempts
          (workspace_id, attempt_id, alpha_version_id, client_intent_id, request_payload_digest,
           intent_kind, state, created_by_user_id, created_at)
          VALUES ($1, $2, $3, $4, $5, 'NEW', $6, $7, $8)`,
        [row.workspaceId, attemptId, row.versionId, `intent-${attemptId}`, digest, state, row.userId, `2026-09-22T00:0${index + 1}:00.000001Z`]);
        if (runId) {
          await database.query(`INSERT INTO research.runs
            (workspace_id, run_id, attempt_id, run_kind, relationship_kind, logical_run_key,
             request_spec_digest, effective_spec_digest, engine_release_id, dataset_binding_digest,
             state, submitted_by_user_id)
            VALUES ($1, $2, $3, 'PRIMARY', 'PRIMARY', 'primary', $4, $4, 'quantbt-1.1.1', $4, $5, $6)`,
          [row.workspaceId, runId, attemptId, digest, state === "READY" ? "READY" : "CANCELLED", row.userId]);
        }
      }
      const scope = { workspaceId: row.workspaceId, actorUserId: row.userId };
      const repository = new ResearchLineageRepository(database);
      const newest = await repository.read(scope, row.alphaId, 2);
      expect(newest?.attempts.map((attempt) => attempt.attempt_id)).toEqual(["att-w6b-4", "att-w6b-5"]);
      expect(newest?.hasMore).toBe(true);
      expect(newest?.window).toBe("NEWEST");
      expect(newest?.attempts[0]?.created_at_cursor).toBe("2026-09-22T00:03:00.000001Z");
      expect(newest?.libraryRows?.map((library) => library.run_id).sort()).toEqual(["run-w6b-4", "run-w6b-5"]);
      // No persisted preflight manifest: every attempt is one "without manifest" group.
      expect(newest?.exercised).toEqual([expect.objectContaining({ alpha_version_id: row.versionId, execution_route: null })]);
      expect(Number(newest?.exercised?.[0]?.attempts)).toBe(5);
      expect(newest?.versions[0]?.first_attempt_id).toBe(row.attemptId);

      const second = await repository.read(scope, row.alphaId, 2, { createdAt: newest!.attempts[0]!.created_at_cursor!, attemptId: "att-w6b-4" });
      expect(second?.attempts.map((attempt) => attempt.attempt_id)).toEqual(["att-w6b-2", "att-w6b-3"]);
      expect(second?.hasMore).toBe(true);
      expect(second?.window).toBe("OLDER_PAGE");
      const last = await repository.read(scope, row.alphaId, 2, { createdAt: second!.attempts[0]!.created_at_cursor!, attemptId: "att-w6b-2" });
      expect(last?.attempts.map((attempt) => attempt.attempt_id)).toEqual([row.attemptId]);
      expect(last?.hasMore).toBe(false);

      // CG-P19-13: the definitions the response carries, checked against the
      // Run Library's own counters for the same Alpha and snapshot data.
      const library = await new ResearchRunLibraryRepository(database).list(
        scope, ResearchRunLibraryQuerySchema.parse({ alpha: row.alphaId, limit: "50" }), null,
      );
      const counts = newest!.counts;
      expect(Number(counts.total_attempts)).toBe(5);
      expect(Number(counts.draft_attempts)).toBe(1);
      expect(Number(counts.submitted_attempts)).toBe(library.counters.logicalRuns);
      expect(Number(counts.total_attempts)).toBe(library.counters.logicalRuns + Number(counts.draft_attempts));
      expect(Number(counts.failed_attempts)).toBe(library.claimLedger.failed);
      expect(Number(counts.child_runs)).toBe(library.counters.workerChildren);
      expect(Number(counts.technical_retries)).toBe(library.counters.technicalRetries);
    } finally {
      await database.end();
    }
  });
});
