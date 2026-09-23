import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runner as migrate } from "../../apps/control-api/node_modules/node-pg-migrate";
import { Pool } from "../../apps/control-api/node_modules/pg";
import {
  ResearchMetadataError,
  type ResearchAttemptInput,
  type ResearchScope,
} from "../../apps/control-api/src/research/contracts";
import { ResearchMetadataRepository } from "../../apps/control-api/src/research/repository";
import { migrateTestDatabase, truncateAll } from "../../apps/control-api/test/harness";

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const DIGEST = (character: string) => character.repeat(64);
const scope: ResearchScope = { workspaceId: "p05-workspace", actorUserId: "p05-user" };

function attemptInput(suffix: string): ResearchAttemptInput {
  return {
    attemptId: `p05-attempt-${suffix}`,
    runId: `p05-run-${suffix}`,
    clientIntentId: `p05-intent-${suffix}`,
    requestPayloadDigest: DIGEST("a"),
    intentKind: "NEW",
    requestSpecDigest: DIGEST("b"),
    effectiveSpecDigest: DIGEST("c"),
    engineReleaseId: "quantbt-1.1.1",
    datasetBindingDigest: DIGEST("d"),
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

describe("Research Loop P05 · disk-first artifact authority", () => {
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
    await pool?.end();
  });

  async function seedIdentity(): Promise<void> {
    await pool.query(
      `INSERT INTO portal_users (user_id, username, display_name, role, status, must_change_password)
       VALUES ($1, 'p05-user', 'P05 User', 'ADMIN', 'ACTIVE', false)`,
      [scope.actorUserId],
    );
    await pool.query(
      `INSERT INTO workspaces (workspace_id, name, owner_user_id)
       VALUES ($1, 'P05 Workspace', $2)`,
      [scope.workspaceId, scope.actorUserId],
    );
    await pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'OWNER')`,
      [scope.workspaceId, scope.actorUserId],
    );
  }

  async function reserveWriter(suffix: string, retentionClass: "RESEARCH_EVIDENCE" | "EPHEMERAL_DIAGNOSTIC" = "RESEARCH_EVIDENCE") {
    const attempt = attemptInput(suffix);
    await repository.createOrReplayAttempt(scope, attempt);
    await repository.createJob(scope, {
      jobId: `p05-job-${suffix}`,
      runId: attempt.runId,
      commandId: `p05-command-${suffix}`,
      jobKind: "PRIMARY",
      queueClass: "BACKGROUND",
      resourceClass: "research-small",
      costEstimate: { cpu_seconds: 1, memory_mib: 64 },
    });
    const workerAttemptId = `p05-worker-${suffix}`;
    await repository.recordWorkerAttempt(scope, {
      workerAttemptId,
      jobId: `p05-job-${suffix}`,
      ordinal: 1,
      workerId: "p05-test-worker",
      leaseEpoch: 1,
    });
    const artifactId = `p05-artifact-${suffix}`;
    const reservation = await repository.reserveArtifact(scope, {
      artifactId,
      runId: attempt.runId,
      workerAttemptId,
      leaseEpoch: 1,
      storageLocator: `artifacts/${artifactId}`,
      retentionClass,
      notBeforeGcAt: retentionClass === "EPHEMERAL_DIAGNOSTIC"
        ? new Date(Date.now() - 1_000)
        : null,
    });
    return { attempt, workerAttemptId, artifactId, reservation };
  }

  function partInput(suffix: string) {
    return [{
      tableKind: "trial_index",
      schemaVersion: "research.trial-index.v1",
      partOrdinal: 1,
      relativePath: `tables/trial_index/part-${suffix}.parquet`,
      partDigest: DIGEST("e"),
      rowCount: 3,
      byteCount: 321,
      sequenceMin: "1",
      sequenceMax: "15",
    }];
  }

  async function sealWriter(writer: Awaited<ReturnType<typeof reserveWriter>>, suffix: string) {
    return repository.sealArtifact(scope, {
      artifactId: writer.artifactId,
      workerAttemptId: writer.workerAttemptId,
      leaseEpoch: 1,
      manifestDigest: DIGEST("f"),
      manifestSchemaVersion: "research.artifact-manifest.v1",
      totalRows: 3,
      totalBytes: 321,
      parts: partInput(suffix),
    });
  }

  it("P05-T01: migrates fresh, upgrades P03 rows and repeats without changing legacy facts", async () => {
    await migrateTestDatabase(DATABASE_URL);
    await migrateTestDatabase(DATABASE_URL);

    const migrationSource = fileURLToPath(new URL("../../apps/control-api/migrations/", import.meta.url));
    const preP05Migrations = await mkdtemp(join(tmpdir(), "portal-research-p05-upgrade-"));
    const adminUrl = new URL(DATABASE_URL);
    adminUrl.pathname = "/postgres";
    const databaseName = `p05_upgrade_${process.pid}_${Date.now()}`;
    const upgradeUrl = new URL(DATABASE_URL);
    upgradeUrl.pathname = `/${databaseName}`;
    const admin = new Pool({ connectionString: adminUrl.toString() });
    let upgradePool: Pool | undefined;
    try {
      for (const filename of await readdir(migrationSource)) {
        if (filename.endsWith(".sql") && filename < "1723680000038_research-artifact-authority.sql") {
          await cp(join(migrationSource, filename), join(preP05Migrations, filename));
        }
      }
      await admin.query(`CREATE DATABASE ${databaseName}`);
      await migrate({
        databaseUrl: upgradeUrl.toString(), dir: preP05Migrations, direction: "up",
        migrationsTable: "pgmigrations", count: Infinity, noLock: true, log: () => {},
      });
      upgradePool = new Pool({ connectionString: upgradeUrl.toString() });
      await upgradePool.query(
        `INSERT INTO portal_users (user_id, username, display_name, role, status, must_change_password)
         VALUES ('p05-pre-user', 'p05-pre-user', 'P05 Pre User', 'ADMIN', 'ACTIVE', false)`
      );
      await upgradePool.query(
        `INSERT INTO workspaces (workspace_id, name, owner_user_id)
         VALUES ('p05-pre-workspace', 'P05 Pre', 'p05-pre-user')`
      );
      await upgradePool.query(
        `INSERT INTO research.attempts
           (workspace_id, attempt_id, client_intent_id, request_payload_digest, intent_kind, state, created_by_user_id)
         VALUES ('p05-pre-workspace', 'p05-pre-attempt', 'p05-pre-intent', $1, 'NEW', 'DRAFT', 'p05-pre-user')`,
        [DIGEST("1")],
      );
      await upgradePool.query(
        `INSERT INTO research.runs
           (workspace_id, run_id, attempt_id, run_kind, relationship_kind, logical_run_key,
            request_spec_digest, effective_spec_digest, engine_release_id, dataset_binding_digest, state, submitted_by_user_id)
         VALUES ('p05-pre-workspace', 'p05-pre-run', 'p05-pre-attempt', 'PRIMARY', 'PRIMARY', 'primary',
                 $1, $2, 'quantbt-1.1.1', $3, 'DRAFT', 'p05-pre-user')`,
        [DIGEST("2"), DIGEST("3"), DIGEST("4")],
      );
      // A P03 pending row has a legacy digest.  This exact shape caught the
      // migration regression where a P05 invariant was accidentally applied
      // retroactively to every P03 state.
      await upgradePool.query(
        `INSERT INTO research.artifacts
           (workspace_id, artifact_id, run_id, table_kind, schema_version,
            manifest_digest, state, retention_class, storage_locator)
         VALUES ('p05-pre-workspace', 'p05-pre-pending', 'p05-pre-run', 'legacy',
                 'research.artifact.v1', $1, 'PENDING', 'RESEARCH_EVIDENCE', 'legacy/pending')`,
        [DIGEST("5")],
      );
      await upgradePool.end();
      upgradePool = undefined;

      await migrateTestDatabase(upgradeUrl.toString());
      await migrateTestDatabase(upgradeUrl.toString());
      upgradePool = new Pool({ connectionString: upgradeUrl.toString() });
      const upgraded = await upgradePool.query<{
        state: string; artifact_revision: string | number; parts: string | null;
      }>(
        `SELECT a.state, a.artifact_revision, to_regclass('research.artifact_parts') AS parts
           FROM research.artifacts a
          WHERE a.workspace_id = 'p05-pre-workspace' AND a.artifact_id = 'p05-pre-pending'`,
      );
      expect(upgraded.rows[0]).toMatchObject({ state: "PENDING", artifact_revision: "0", parts: "research.artifact_parts" });
    } finally {
      await upgradePool?.end();
      await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`).catch(() => undefined);
      await admin.end();
      await rm(preP05Migrations, { recursive: true, force: true });
    }
  }, 90_000);

  it("P05-T03/T04/T06: reservation is idempotent, fenced and revisioned", async () => {
    await seedIdentity();
    const writer = await reserveWriter("fence");
    expect(writer.reservation).toMatchObject({ artifactRevision: 1, replayed: false, state: "WRITING" });
    expect(await repository.reserveArtifact(scope, {
      artifactId: writer.artifactId, runId: writer.attempt.runId, workerAttemptId: writer.workerAttemptId,
      leaseEpoch: 1, storageLocator: `artifacts/${writer.artifactId}`, retentionClass: "RESEARCH_EVIDENCE",
    })).toMatchObject({ artifactRevision: 1, replayed: true });

    await expectResearchError(repository.reserveArtifact(scope, {
      artifactId: writer.artifactId, runId: writer.attempt.runId, workerAttemptId: writer.workerAttemptId,
      leaseEpoch: 2, storageLocator: `artifacts/${writer.artifactId}`, retentionClass: "RESEARCH_EVIDENCE",
    }), "RESEARCH_IDEMPOTENCY_PAYLOAD_CONFLICT");
    await expectResearchError(repository.reserveArtifact(scope, {
      artifactId: writer.artifactId, runId: writer.attempt.runId, workerAttemptId: writer.workerAttemptId,
      leaseEpoch: 1, storageLocator: `artifacts/${writer.artifactId}`, retentionClass: "EPHEMERAL_DIAGNOSTIC",
      notBeforeGcAt: new Date(Date.now() + 60_000),
    }), "RESEARCH_IDEMPOTENCY_PAYLOAD_CONFLICT");

    await pool.query(
      `UPDATE research.worker_attempts SET expires_at = now() - interval '1 second'
        WHERE workspace_id = $1 AND worker_attempt_id = $2`,
      [scope.workspaceId, writer.workerAttemptId],
    );
    await expectResearchError(sealWriter(writer, "fence"), "RESEARCH_ARTIFACT_FENCE_REJECTED");
    expect((await pool.query(
      `SELECT state FROM research.artifacts WHERE workspace_id = $1 AND artifact_id = $2`,
      [scope.workspaceId, writer.artifactId],
    )).rows[0].state).toBe("WRITING");
  });

  it("P05-T09/T10/T11/T13: bounded trial ingestion, durable references and GC never duplicate or evict evidence", async () => {
    await seedIdentity();
    const writer = await reserveWriter("ingest");
    await repository.createStudy(scope, {
      studyId: "p05-study-ingest", runId: writer.attempt.runId, engineStudyKey: "study/ingest",
      purpose: "SEARCH", sourceStage: "in-sample", sourceSchedule: "fixed",
    });
    const batch = {
      artifactId: writer.artifactId,
      studyId: "p05-study-ingest",
      runId: writer.attempt.runId,
      workerAttemptId: writer.workerAttemptId,
      leaseEpoch: 1,
      sourceRevision: writer.reservation.artifactRevision,
      batchDigest: DIGEST("8"),
      rows: [0, 1, 2].map((ordinal) => ({
        studyId: "p05-study-ingest", runId: writer.attempt.runId, trialId: `p05-trial-${ordinal}`,
        trialOrdinal: ordinal, executionStatus: "COMPLETE" as const, feasibilityState: "FEASIBLE" as const,
        params: { window: ordinal + 1 }, objectiveDefined: true, objectiveValue: ordinal + 0.125,
        objectiveDefinitionId: "sharpe",
      })),
    };
    expect(await repository.recordArtifactTrialBatch(scope, batch)).toEqual({ replayed: false });
    expect(await repository.recordArtifactTrialBatch(scope, batch)).toEqual({ replayed: true });
    expect((await pool.query(
      `SELECT count(*)::integer AS count FROM research.trial_index WHERE workspace_id = $1`, [scope.workspaceId],
    )).rows[0].count).toBe(3);

    await sealWriter(writer, "ingest");
    await repository.createSelection(scope, {
      selectionId: "p05-selection-ingest", runId: writer.attempt.runId, studyId: "p05-study-ingest",
      targetKind: "SINGLE_PARAMETER_SET", selectedTrialId: "p05-trial-0",
      parameterBundleDigest: DIGEST("9"), sourceDigest: DIGEST("a"),
    });
    expect(await repository.recordArtifactReference(scope, {
      artifactId: writer.artifactId, referenceKind: "SELECTION", referenceId: "p05-selection-ingest",
    })).toEqual({ replayed: false });
    expect(await repository.recordArtifactReference(scope, {
      artifactId: writer.artifactId, referenceKind: "SELECTION", referenceId: "p05-selection-ingest",
    })).toEqual({ replayed: true });
    expect(await repository.listGcEligibleArtifacts(scope, new Date(), 100)).not.toContain(writer.artifactId);

    const ephemeral = await reserveWriter("gc", "EPHEMERAL_DIAGNOSTIC");
    await sealWriter(ephemeral, "gc");
    expect(await repository.listGcEligibleArtifacts(scope, new Date(), 100)).toContain(ephemeral.artifactId);
    await repository.recordArtifactReference(scope, {
      artifactId: ephemeral.artifactId, referenceKind: "ACTIVE_LEASE",
      referenceId: ephemeral.workerAttemptId, pinnedUntil: new Date(Date.now() + 60_000),
    });
    expect(await repository.listGcEligibleArtifacts(scope, new Date(), 100)).not.toContain(ephemeral.artifactId);
    await pool.query(
      `UPDATE research.worker_attempts SET expires_at = now() - interval '1 second'
        WHERE workspace_id = $1 AND worker_attempt_id = $2`,
      [scope.workspaceId, ephemeral.workerAttemptId],
    );
    await expectResearchError(repository.recordArtifactReference(scope, {
      artifactId: ephemeral.artifactId, referenceKind: "ACTIVE_LEASE",
      referenceId: ephemeral.workerAttemptId, pinnedUntil: new Date(Date.now() + 60_000),
    }), "RESEARCH_ARTIFACT_REFERENCE_INVALID");
  });

  it("P05-T05/T06: malformed parts, stale writes and integrity downgrade fail closed", async () => {
    await seedIdentity();
    const writer = await reserveWriter("integrity");
    await expectResearchError(repository.sealArtifact(scope, {
      artifactId: writer.artifactId, workerAttemptId: writer.workerAttemptId, leaseEpoch: 1,
      manifestDigest: DIGEST("f"), manifestSchemaVersion: "research.artifact-manifest.v1",
      totalRows: 4, totalBytes: 321, parts: partInput("integrity"),
    }), "RESEARCH_INVALID_INPUT");
    await expectResearchError(repository.sealArtifact(scope, {
      artifactId: writer.artifactId, workerAttemptId: writer.workerAttemptId, leaseEpoch: 1,
      manifestDigest: DIGEST("f"), manifestSchemaVersion: "research.artifact-manifest.v1",
      totalRows: 3, totalBytes: 321,
      parts: [{ ...partInput("integrity-gap")[0], partOrdinal: 2 }],
    }), "RESEARCH_INVALID_INPUT");
    await sealWriter(writer, "integrity");
    await repository.markArtifactIntegrity(scope, { artifactId: writer.artifactId, state: "CORRUPT" });
    await expectResearchError(repository.markArtifactIntegrity(scope, {
      artifactId: writer.artifactId, state: "MISSING",
    }), "RESEARCH_ARTIFACT_LIFECYCLE_CONFLICT");
    await expect(pool.query(
      `UPDATE research.artifact_parts SET row_count = 99
        WHERE workspace_id = $1 AND artifact_id = $2`,
      [scope.workspaceId, writer.artifactId],
    )).rejects.toMatchObject({ code: "55000" });
  });
  it("P05-T14: a failed or expired lease aborts only unsealed candidates", async () => {
    await seedIdentity();
    const failed = await reserveWriter("failed-lease");
    await pool.query(
      `UPDATE research.jobs SET state = 'CLAIMED', current_worker_attempt_id = $3,
              current_lease_epoch = 1 WHERE workspace_id = $1 AND job_id = $2`,
      [scope.workspaceId, "p05-job-failed-lease", failed.workerAttemptId],
    );
    await repository.finishDurableJob(scope, {
      jobId: "p05-job-failed-lease", workerAttemptId: failed.workerAttemptId,
      leaseEpoch: 1, outcome: "FAILED", reason: "source failed",
      usage: { peakRssBytes: 1, cpuSeconds: 1, scratchBytes: 1, fdPeak: 3 },
    });
    expect((await pool.query(
      `SELECT state FROM research.artifacts WHERE workspace_id = $1 AND artifact_id = $2`,
      [scope.workspaceId, failed.artifactId],
    )).rows[0].state).toBe("ABORTED");

    const expired = await reserveWriter("expired-lease");
    await pool.query(
      `UPDATE research.jobs SET state = 'CLAIMED', work_digest = $4, current_worker_attempt_id = $3,
              current_lease_epoch = 1 WHERE workspace_id = $1 AND job_id = $2`,
      [scope.workspaceId, "p05-job-expired-lease", expired.workerAttemptId, DIGEST("1")],
    );
    await pool.query(
      `UPDATE research.worker_attempts SET expires_at = now() - interval '1 second'
        WHERE workspace_id = $1 AND worker_attempt_id = $2`,
      [scope.workspaceId, expired.workerAttemptId],
    );
    await repository.recoverExpiredDurableJobs(scope);
    expect((await pool.query(
      `SELECT state FROM research.artifacts WHERE workspace_id = $1 AND artifact_id = $2`,
      [scope.workspaceId, expired.artifactId],
    )).rows[0].state).toBe("ABORTED");

    const sealed = await reserveWriter("sealed-lease");
    await pool.query(
      `UPDATE research.jobs SET state = 'CLAIMED', current_worker_attempt_id = $3,
              current_lease_epoch = 1 WHERE workspace_id = $1 AND job_id = $2`,
      [scope.workspaceId, "p05-job-sealed-lease", sealed.workerAttemptId],
    );
    await sealWriter(sealed, "sealed-lease");
    await repository.finishDurableJob(scope, {
      jobId: "p05-job-sealed-lease", workerAttemptId: sealed.workerAttemptId,
      leaseEpoch: 1, outcome: "FAILED", reason: "post-seal failure",
      usage: { peakRssBytes: 1, cpuSeconds: 1, scratchBytes: 1, fdPeak: 3 },
    });
    expect((await pool.query(
      `SELECT state FROM research.artifacts WHERE workspace_id = $1 AND artifact_id = $2`,
      [scope.workspaceId, sealed.artifactId],
    )).rows[0].state).toBe("SEALED");
  });
});
