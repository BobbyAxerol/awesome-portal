import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runner as migrate } from "../../apps/control-api/node_modules/node-pg-migrate";
import { Pool } from "../../apps/control-api/node_modules/pg";
import {
  RESEARCH_DB_BUDGET,
  ResearchMetadataError,
  type ResearchAttemptInput,
  type ResearchScope,
} from "../../apps/control-api/src/research/contracts";
import { ResearchMetadataRepository } from "../../apps/control-api/src/research/repository";
import { migrateTestDatabase, truncateAll } from "../../apps/control-api/test/harness";

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const DIGEST = (character: string) => character.repeat(64);

const scopeA: ResearchScope = { workspaceId: "p03-workspace-a", actorUserId: "p03-user-a" };
const scopeB: ResearchScope = { workspaceId: "p03-workspace-b", actorUserId: "p03-user-b" };

function attemptInput(suffix: string, overrides: Partial<ResearchAttemptInput> = {}): ResearchAttemptInput {
  return {
    attemptId: `p03-attempt-${suffix}`,
    runId: `p03-run-${suffix}`,
    clientIntentId: `p03-intent-${suffix}`,
    requestPayloadDigest: DIGEST("a"),
    intentKind: "NEW",
    requestSpecDigest: DIGEST("b"),
    effectiveSpecDigest: DIGEST("c"),
    engineReleaseId: "quantbt-1.1.1",
    datasetBindingDigest: DIGEST("d"),
    ...overrides,
  };
}

async function expectResearchError<T>(promise: Promise<T>, code: ResearchMetadataError["code"]): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ResearchMetadataError);
    expect((error as ResearchMetadataError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ResearchMetadataError ${code}.`);
}

describe("Research Loop P03 · schema, identity and authorization", () => {
  let pool: Pool;
  let repository: ResearchMetadataRepository;

  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL);
    pool = new Pool({ connectionString: DATABASE_URL });
    repository = new ResearchMetadataRepository(pool);
  }, 60_000);

  afterEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function seedIdentity(): Promise<void> {
    await pool.query(
      `INSERT INTO portal_users (user_id, username, display_name, role, status, must_change_password)
       VALUES
         ($1, 'p03-user-a', 'P03 User A', 'ADMIN', 'ACTIVE', false),
         ($2, 'p03-user-b', 'P03 User B', 'USER', 'ACTIVE', false)`,
      [scopeA.actorUserId, scopeB.actorUserId],
    );
    await pool.query(
      `INSERT INTO workspaces (workspace_id, name, owner_user_id)
       VALUES ($1, 'P03 Workspace A', $2), ($3, 'P03 Workspace B', $4)`,
      [scopeA.workspaceId, scopeA.actorUserId, scopeB.workspaceId, scopeB.actorUserId],
    );
    await pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'OWNER'), ($3, $4, 'OWNER')`,
      [scopeA.workspaceId, scopeA.actorUserId, scopeB.workspaceId, scopeB.actorUserId],
    );
  }

  async function createBase(scope: ResearchScope, suffix: string): Promise<ResearchAttemptInput> {
    const input = attemptInput(suffix);
    const result = await repository.createOrReplayAttempt(scope, input);
    expect(result.replayed).toBe(false);
    return input;
  }

  it("P03-T01: migrates fresh, upgrades an existing database and repeats without schema drift", async () => {
    // The ordinary disposable database is the fresh+repeat case.
    await migrateTestDatabase(DATABASE_URL);
    await migrateTestDatabase(DATABASE_URL);

    const migrationSource = fileURLToPath(new URL("../../apps/control-api/migrations/", import.meta.url));
    const preP03Migrations = await mkdtemp(join(tmpdir(), "portal-research-p03-upgrade-"));
    const adminUrl = new URL(DATABASE_URL);
    adminUrl.pathname = "/postgres";
    const databaseName = `p03_upgrade_${process.pid}_${Date.now()}`;
    const upgradeUrl = new URL(DATABASE_URL);
    upgradeUrl.pathname = `/${databaseName}`;
    const admin = new Pool({ connectionString: adminUrl.toString() });
    let upgradePool: Pool | undefined;
    try {
      for (const filename of await readdir(migrationSource)) {
        // P03's historical-upgrade proof must remain a genuinely pre-P03
        // database as later additive Research migrations land.  Comparing the
        // sortable migration prefix avoids accidentally treating P05+ tables
        // as part of P03's baseline.
        if (filename.endsWith(".sql") && filename < "1723680000037_research-schema-foundation.sql") {
          await cp(join(migrationSource, filename), join(preP03Migrations, filename));
        }
      }
      await admin.query(`CREATE DATABASE ${databaseName}`);
      await migrate({
        databaseUrl: upgradeUrl.toString(),
        dir: preP03Migrations,
        direction: "up",
        migrationsTable: "pgmigrations",
        count: Infinity,
        noLock: true,
        log: () => {},
      });
      upgradePool = new Pool({ connectionString: upgradeUrl.toString() });
      expect((await upgradePool.query("SELECT to_regclass('research.attempts') AS relation")).rows[0].relation).toBeNull();
      await upgradePool.end();
      upgradePool = undefined;

      // Applying the canonical directory is the real upgrade.  Repeating it
      // proves no second schema/role mutation occurs on an already-upgraded DB.
      await migrateTestDatabase(upgradeUrl.toString());
      await migrateTestDatabase(upgradeUrl.toString());
      upgradePool = new Pool({ connectionString: upgradeUrl.toString() });
      const upgraded = await upgradePool.query<{
        relation: string | null;
        runtime_role: boolean;
        migration_count: string;
      }>(
        `SELECT to_regclass('research.attempts') AS relation,
                EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_research_runtime') AS runtime_role,
                (SELECT count(*) FROM pgmigrations)::text AS migration_count`,
      );
      expect(upgraded.rows[0]).toMatchObject({ relation: "research.attempts", runtime_role: true });
      expect(Number(upgraded.rows[0].migration_count)).toBeGreaterThanOrEqual(38);
    } finally {
      await upgradePool?.end();
      await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`).catch(() => undefined);
      await admin.end();
      await rm(preP03Migrations, { recursive: true, force: true });
    }
  }, 60_000);

  it("P03-T02: blocks cross-workspace relations and repository IDOR before any Research read", async () => {
    await seedIdentity();
    await repository.registerAlphaVersion(scopeA, {
      alphaId: "p03-alpha-a",
      name: "P03 Alpha A",
      executionSubjectId: "execution-alpha-a",
      alphaVersionId: "p03-alpha-version-a",
      codeDigest: DIGEST("1"),
      entrypoint: "alpha:run",
      dependencyRef: "requirements.lock#sha256",
      declaredContract: { version: 1 },
    });
    await expectResearchError(repository.listAttempts({ workspaceId: scopeA.workspaceId, actorUserId: scopeB.actorUserId }), "RESEARCH_WORKSPACE_FORBIDDEN");
    await expect(
      pool.query(
        `INSERT INTO research.attempts
           (workspace_id, attempt_id, alpha_version_id, client_intent_id,
            request_payload_digest, intent_kind, state, created_by_user_id)
         VALUES ($1, 'p03-cross-workspace', $2, 'p03-cross-intent', $3, 'NEW', 'DRAFT', $4)`,
        [scopeB.workspaceId, "p03-alpha-version-a", DIGEST("2"), scopeB.actorUserId],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("P03-T03: replays identical immutable version/intent bytes and rejects changed payloads", async () => {
    await seedIdentity();
    const version = {
      alphaId: "p03-alpha-idempotency",
      name: "P03 Idempotency Alpha",
      executionSubjectId: "execution-alpha-idempotency",
      alphaVersionId: "p03-alpha-version-idempotency",
      codeDigest: DIGEST("3"),
      entrypoint: "alpha:run",
      dependencyRef: "deps.lock#p03",
      declaredContract: { b: 2, a: 1 },
    } as const;
    expect((await repository.registerAlphaVersion(scopeA, version)).replayed).toBe(false);
    expect((await repository.registerAlphaVersion(scopeA, { ...version, declaredContract: { a: 1, b: 2 } })).replayed).toBe(true);
    const input = attemptInput("idempotency", { alphaVersionId: version.alphaVersionId });
    expect((await repository.createOrReplayAttempt(scopeA, input)).replayed).toBe(false);
    expect((await repository.createOrReplayAttempt(scopeA, input)).replayed).toBe(true);
    await expectResearchError(
      repository.createOrReplayAttempt(scopeA, { ...input, requestPayloadDigest: DIGEST("4") }),
      "RESEARCH_IDEMPOTENCY_PAYLOAD_CONFLICT",
    );
  });

  it("P03-T04: uses CAS so concurrent draft autosaves never silently last-write-win", async () => {
    await seedIdentity();
    const input = await createBase(scopeA, "cas");
    const attempts = await Promise.allSettled([
      repository.autosaveDraft(scopeA, { attemptId: input.attemptId, expectedRevision: 1, draftPatchDigest: DIGEST("5") }),
      repository.autosaveDraft(scopeA, { attemptId: input.attemptId, expectedRevision: 1, draftPatchDigest: DIGEST("6") }),
    ]);
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.find((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(rejected?.reason).toMatchObject({ code: "RESEARCH_DRAFT_REVISION_CONFLICT" });
    expect((await repository.listAttempts(scopeA))[0].draftRevision).toBe(2);
  });

  it("P03-T05: the least-privilege Research role cannot mutate or alter Execution tables", async () => {
    await seedIdentity();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE portal_research_runtime");
      await expect(client.query("UPDATE run_read_models SET status = status")).rejects.toMatchObject({ code: "42501" });
      await client.query("ROLLBACK");
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE portal_research_runtime");
      await expect(client.query("ALTER TABLE run_read_models ADD COLUMN p03_forbidden boolean")).rejects.toMatchObject({ code: "42501" });
      await client.query("ROLLBACK");
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE portal_research_runtime");
      await expect(client.query("UPDATE research.alphas SET name = name")).rejects.toMatchObject({ code: "42501" });
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("P03-T06: a draft deletion cannot cascade through a pinned evidence artifact", async () => {
    await seedIdentity();
    const input = await createBase(scopeA, "pinned");
    await repository.createArtifact(scopeA, {
      artifactId: "p03-artifact-pinned",
      runId: input.runId,
      tableKind: "trial-summary",
      schemaVersion: "research.artifact.v1",
      manifestDigest: DIGEST("7"),
      storageLocator: "research/p03/pinned.manifest.json",
    });
    await expect(
      pool.query("DELETE FROM research.attempts WHERE workspace_id = $1 AND attempt_id = $2", [scopeA.workspaceId, input.attemptId]),
    ).rejects.toMatchObject({ code: "23503" });
    expect((await pool.query("SELECT artifact_id FROM research.artifacts WHERE workspace_id = $1", [scopeA.workspaceId])).rows).toHaveLength(1);
  });

  it("P03-T07: keeps metadata pool and cursor reads bounded with an indexed page plan", async () => {
    await seedIdentity();
    expect(pool.options.max).toBe(RESEARCH_DB_BUDGET.globalPoolMaximum);
    expect(RESEARCH_DB_BUDGET.maximumConcurrentMetadataOperations).toBeLessThan(pool.options.max!);
    for (let ordinal = 0; ordinal < 24; ordinal += 1) {
      await createBase(scopeA, `page-${String(ordinal).padStart(2, "0")}`);
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      // This isolated proof asks PostgreSQL to demonstrate the intended index
      // path. It does not change a production planner setting or runtime plan.
      await client.query("SET LOCAL enable_seqscan = off");
      const plan = await client.query(
        `EXPLAIN (FORMAT JSON, COSTS OFF)
         SELECT run_id FROM research.runs
          WHERE workspace_id = $1
          ORDER BY created_at DESC, run_id DESC
          LIMIT 20`,
        [scopeA.workspaceId],
      );
      expect(JSON.stringify(plan.rows[0])).toContain("research_runs_library_cursor_idx");
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("P03-T08: ten autosaves and duplicate submit yield one intent/logical run while workers retry their own rows", async () => {
    await seedIdentity();
    const input = attemptInput("duplicate");
    const submissions = await Promise.all([
      repository.createOrReplayAttempt(scopeA, input),
      repository.createOrReplayAttempt(scopeA, input),
    ]);
    expect(submissions.filter((item) => !item.replayed)).toHaveLength(1);
    let revision = 1;
    for (let ordinal = 0; ordinal < 10; ordinal += 1) {
      const saved = await repository.autosaveDraft(scopeA, {
        attemptId: input.attemptId,
        expectedRevision: revision,
        draftPatchDigest: DIGEST("0123456789"[ordinal]),
      });
      revision = saved.draftRevision;
    }
    expect(revision).toBe(11);
    await repository.createJob(scopeA, {
      jobId: "p03-job-duplicate",
      runId: input.runId,
      commandId: "p03-command-duplicate",
      jobKind: "PRIMARY",
      queueClass: "INTERACTIVE",
      resourceClass: "small",
      costEstimate: { cpu_seconds: 1 },
    });
    await repository.recordWorkerAttempt(scopeA, { workerAttemptId: "p03-worker-1", jobId: "p03-job-duplicate", ordinal: 1, workerId: "worker-a", leaseEpoch: 1 });
    await repository.recordWorkerAttempt(scopeA, { workerAttemptId: "p03-worker-1", jobId: "p03-job-duplicate", ordinal: 1, workerId: "worker-a", leaseEpoch: 1 });
    await repository.recordWorkerAttempt(scopeA, { workerAttemptId: "p03-worker-2", jobId: "p03-job-duplicate", ordinal: 2, workerId: "worker-b", leaseEpoch: 2 });
    const counts = await pool.query<{ attempts: string; primary_runs: string; worker_attempts: string }>(
      `SELECT
         (SELECT count(*) FROM research.attempts WHERE workspace_id = $1)::text AS attempts,
         (SELECT count(*) FROM research.runs WHERE workspace_id = $1 AND logical_run_key = 'primary')::text AS primary_runs,
         (SELECT count(*) FROM research.worker_attempts WHERE workspace_id = $1)::text AS worker_attempts`,
      [scopeA.workspaceId],
    );
    expect(counts.rows[0]).toMatchObject({ attempts: "1", primary_runs: "1", worker_attempts: "2" });
    // A fresh database connection is the persistence/restart boundary for this
    // schema phase: durable identity and revision cannot live in repository
    // memory or disappear when the original request pool is replaced.
    const restartedPool = new Pool({ connectionString: DATABASE_URL });
    try {
      const persisted = await restartedPool.query<{ draft_revision: string }>(
        "SELECT draft_revision::text FROM research.attempts WHERE workspace_id = $1 AND attempt_id = $2",
        [scopeA.workspaceId, input.attemptId],
      );
      expect(persisted.rows[0]?.draft_revision).toBe("11");
    } finally {
      await restartedPool.end();
    }
  });

  it("P03-T09: centroid selection preserves a nullable selected-trial reference without fabricating zero", async () => {
    await seedIdentity();
    const input = await createBase(scopeA, "centroid");
    await repository.createStudy(scopeA, {
      studyId: "p03-study-centroid",
      runId: input.runId,
      engineStudyKey: "engine-centroid",
      purpose: "SELECTION",
      sourceStage: "paper",
      sourceSchedule: "global",
    });
    await repository.createSelection(scopeA, {
      selectionId: "p03-selection-centroid",
      runId: input.runId,
      studyId: "p03-study-centroid",
      targetKind: "CENTROID",
      selectedTrialId: null,
      parameterBundleDigest: DIGEST("a"),
      sourceDigest: DIGEST("b"),
    });
    const selection = await pool.query<{ selected_trial_id: string | null }>(
      "SELECT selected_trial_id FROM research.selection_records WHERE workspace_id = $1 AND selection_id = 'p03-selection-centroid'",
      [scopeA.workspaceId],
    );
    expect(selection.rows[0].selected_trial_id).toBeNull();
  });

  it("P03-T10: audit/export/diagnostic child relations and exposure facts do not create primary attempts or cross workspace", async () => {
    await seedIdentity();
    const input = await createBase(scopeA, "children-a");
    await repository.createStudy(scopeA, {
      studyId: "p03-study-children", runId: input.runId, engineStudyKey: "engine-children",
      purpose: "SEARCH", sourceStage: "paper", sourceSchedule: "global",
    });
    await repository.createTrial(scopeA, {
      studyId: "p03-study-children", runId: input.runId, trialId: "p03-trial-children", trialOrdinal: 0,
      executionStatus: "COMPLETE", feasibilityState: "FEASIBLE", params: { z: "1.25" },
      objectiveDefined: true, objectiveValue: 1.25,
    });
    await repository.createSelection(scopeA, {
      selectionId: "p03-selection-children", runId: input.runId, studyId: "p03-study-children",
      targetKind: "SINGLE_PARAMETER_SET", selectedTrialId: "p03-trial-children",
      parameterBundleDigest: DIGEST("c"), sourceDigest: DIGEST("d"),
    });
    await repository.createChildRun(scopeA, {
      runId: "p03-run-audit", parentRunId: input.runId, runKind: "AUDIT", relationshipKind: "AUDIT_OF_SELECTION",
      logicalRunKey: "audit:selection", targetSelectionId: "p03-selection-children",
      requestSpecDigest: DIGEST("e"), effectiveSpecDigest: DIGEST("f"), engineReleaseId: "quantbt-1.1.1", datasetBindingDigest: DIGEST("0"),
    });
    await repository.createChildRun(scopeA, {
      runId: "p03-run-export", parentRunId: input.runId, runKind: "EXPORT", relationshipKind: "EXPORT_OF_RUN",
      logicalRunKey: "export:report", requestSpecDigest: DIGEST("1"), effectiveSpecDigest: DIGEST("2"), engineReleaseId: "quantbt-1.1.1", datasetBindingDigest: DIGEST("3"),
    });
    await repository.createEvaluation(scopeA, {
      evaluationId: "p03-evaluation-children", runId: input.runId, studyId: "p03-study-children", trialId: "p03-trial-children",
      dataRole: "OUTER_OOS", state: "COMPLETE",
    });
    await repository.recordExposureFact(scopeA, {
      exposureId: "p03-exposure-children", runId: input.runId, evaluationId: "p03-evaluation-children",
      snapshotDigest: DIGEST("4"), evaluationRole: "OUTER_OOS", sourceFactRef: "facts/p03/source.json",
      sourceAsOf: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect((await pool.query("SELECT count(*)::integer AS count FROM research.attempts WHERE workspace_id = $1", [scopeA.workspaceId])).rows[0].count).toBe(1);

    const inputB = await createBase(scopeB, "children-b");
    await expectResearchError(repository.createChildRun(scopeB, {
      runId: "p03-run-cross", parentRunId: inputB.runId, runKind: "AUDIT", relationshipKind: "AUDIT_OF_SELECTION",
      logicalRunKey: "audit:cross", targetSelectionId: "p03-selection-children",
      requestSpecDigest: DIGEST("5"), effectiveSpecDigest: DIGEST("6"), engineReleaseId: "quantbt-1.1.1", datasetBindingDigest: DIGEST("7"),
    }), "RESEARCH_CHILD_RELATION_INVALID");
  });

  it("P03-T11: inspection updates preserve selection, artifact, release-candidate digests and complete-trial count", async () => {
    await seedIdentity();
    const input = await createBase(scopeA, "inspection");
    await repository.createStudy(scopeA, {
      studyId: "p03-study-inspection", runId: input.runId, engineStudyKey: "engine-inspection",
      purpose: "SEARCH", sourceStage: "paper", sourceSchedule: "global",
    });
    await repository.createTrial(scopeA, {
      studyId: "p03-study-inspection", runId: input.runId, trialId: "p03-trial-complete", trialOrdinal: 0,
      executionStatus: "COMPLETE", feasibilityState: "FEASIBLE", params: { x: "1" }, objectiveDefined: true, objectiveValue: 2,
    });
    await repository.createTrial(scopeA, {
      studyId: "p03-study-inspection", runId: input.runId, trialId: "p03-trial-pruned", trialOrdinal: 1,
      executionStatus: "PRUNED", feasibilityState: "UNKNOWN", params: { x: "2" }, objectiveDefined: false,
    });
    await repository.createSelection(scopeA, {
      selectionId: "p03-selection-inspection", runId: input.runId, studyId: "p03-study-inspection",
      targetKind: "SINGLE_PARAMETER_SET", selectedTrialId: "p03-trial-complete",
      parameterBundleDigest: DIGEST("8"), sourceDigest: DIGEST("9"),
    });
    await repository.createArtifact(scopeA, {
      artifactId: "p03-artifact-inspection", runId: input.runId, selectionId: "p03-selection-inspection",
      tableKind: "trial-summary", schemaVersion: "research.artifact.v1", manifestDigest: DIGEST("a"),
      storageLocator: "research/p03/inspection.manifest.json",
    });
    await repository.createReleaseCandidate(scopeA, {
      releaseCandidateId: "p03-rc-inspection", runId: input.runId, selectionId: "p03-selection-inspection",
      manifestDigest: DIGEST("b"), schemaVersion: "research.rc.v1",
    });
    const before = await pool.query(
      `SELECT
         (SELECT parameter_bundle_digest FROM research.selection_records WHERE workspace_id = $1 AND selection_id = 'p03-selection-inspection') AS selection_digest,
         (SELECT manifest_digest FROM research.artifacts WHERE workspace_id = $1 AND artifact_id = 'p03-artifact-inspection') AS artifact_digest,
         (SELECT manifest_digest FROM research.release_candidates WHERE workspace_id = $1 AND release_candidate_id = 'p03-rc-inspection') AS rc_digest,
         (SELECT count(*) FROM research.trial_index WHERE workspace_id = $1 AND execution_status = 'COMPLETE')::text AS complete_count`,
      [scopeA.workspaceId],
    );
    expect(await repository.updateInspectionState(scopeA, {
      runId: input.runId, studyId: "p03-study-inspection", trialId: "p03-trial-pruned", cursor: "opaque:p03", expectedRevision: 0,
    })).toBe(1);
    const after = await pool.query(
      `SELECT
         (SELECT parameter_bundle_digest FROM research.selection_records WHERE workspace_id = $1 AND selection_id = 'p03-selection-inspection') AS selection_digest,
         (SELECT manifest_digest FROM research.artifacts WHERE workspace_id = $1 AND artifact_id = 'p03-artifact-inspection') AS artifact_digest,
         (SELECT manifest_digest FROM research.release_candidates WHERE workspace_id = $1 AND release_candidate_id = 'p03-rc-inspection') AS rc_digest,
         (SELECT count(*) FROM research.trial_index WHERE workspace_id = $1 AND execution_status = 'COMPLETE')::text AS complete_count`,
      [scopeA.workspaceId],
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
  });
});
