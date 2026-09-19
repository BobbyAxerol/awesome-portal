import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { runner as migrate } from "../../apps/control-api/node_modules/node-pg-migrate";
import { Pool } from "../../apps/control-api/node_modules/pg";
import {
  ResearchMetadataError,
  type ResearchAttemptInput,
  type ResearchDurableJobInput,
  type ResearchScope,
} from "../../apps/control-api/src/research/contracts";
import { ResearchMetadataRepository } from "../../apps/control-api/src/research/repository";
import { ResearchSchedulerOutboxService } from "../../apps/control-api/src/research/scheduler-outbox.service";
import { migrateTestDatabase, truncateAll } from "../../apps/control-api/test/harness";

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const DIGEST = (character: string) => character.repeat(64);
const workDigest = (value: string) => createHash("sha256").update(`research-p06-work:${value}`).digest("hex");
const execFile = promisify(execFileCallback);
const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const P06_CHILD_HARNESS = join(REPOSITORY_ROOT, "scripts", "research-loop-v11", "p06-durable-child-harness.py");
const P06_PYTHON = process.env.PORTAL_RESEARCH_PYTHON ?? join(REPOSITORY_ROOT, "apps", "portal", ".venv", "bin", "python");
const P04_MARKET_PATH = join(REPOSITORY_ROOT, "apps", "portal", "backend", "tests", "fixtures", "golden_market.parquet");
const scopeA: ResearchScope = { workspaceId: "p06-workspace", actorUserId: "p06-user-a" };
const scopeB: ResearchScope = { workspaceId: "p06-workspace", actorUserId: "p06-user-b" };

function attemptInput(suffix: string): ResearchAttemptInput {
  return {
    attemptId: `p06-attempt-${suffix}`,
    runId: `p06-run-${suffix}`,
    clientIntentId: `p06-intent-${suffix}`,
    requestPayloadDigest: DIGEST("a"),
    intentKind: "NEW",
    requestSpecDigest: DIGEST("b"),
    effectiveSpecDigest: DIGEST("c"),
    engineReleaseId: "quantbt-1.1.1",
    datasetBindingDigest: DIGEST("d"),
  };
}

function jobInput(
  suffix: string,
  runId: string,
  queueClass: ResearchDurableJobInput["queueClass"] = "BACKGROUND",
  overrides: Partial<ResearchDurableJobInput> = {},
): ResearchDurableJobInput {
  return {
    jobId: `p06-job-${suffix}`,
    runId,
    commandId: `p06-command-${suffix}`,
    logicalWorkKey: `p06-work-${suffix}`,
    workDigest: workDigest(suffix),
    jobKind: "PRIMARY",
    readinessClass: "MANDATORY",
    queueClass,
    resourceClass: queueClass === "HEAVY" ? "quantbt-heavy" : "quantbt-small",
    cost: {
      memoryBytes: 64 * 1024 * 1024,
      cpuSeconds: 60,
      scratchBytes: 16 * 1024 * 1024,
      ioBytes: 32 * 1024 * 1024,
    },
    attemptLimit: 2,
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

describe("Research Loop P06 · durable scheduler and lease authority", () => {
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
       VALUES ($1, 'p06-user-a', 'P06 User A', 'ADMIN', 'ACTIVE', false),
              ($2, 'p06-user-b', 'P06 User B', 'USER', 'ACTIVE', false)`,
      [scopeA.actorUserId, scopeB.actorUserId],
    );
    await pool.query(
      `INSERT INTO workspaces (workspace_id, name, owner_user_id)
       VALUES ($1, 'P06 Workspace', $2)`,
      [scopeA.workspaceId, scopeA.actorUserId],
    );
    await pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'OWNER'), ($1, $3, 'MEMBER')`,
      [scopeA.workspaceId, scopeA.actorUserId, scopeB.actorUserId],
    );
  }

  async function enqueue(scope: ResearchScope, suffix: string, queueClass: ResearchDurableJobInput["queueClass"] = "BACKGROUND") {
    const attempt = attemptInput(suffix);
    await repository.createOrReplayAttempt(scope, attempt);
    const job = jobInput(suffix, attempt.runId, queueClass);
    await repository.enqueueDurableJob(scope, job);
    return { attempt, job };
  }

  async function executeClaimedDeltaChild(claim: NonNullable<Awaited<ReturnType<typeof repository.claimNextDurableJob>>>) {
    const work = await mkdtemp(join(tmpdir(), "portal-research-p06-durable-child-"));
    const inputPath = join(work, "launch.json");
    try {
      await writeFile(inputPath, JSON.stringify({
        job_id: claim.jobId,
        run_id: claim.runId,
        worker_attempt_id: claim.workerAttemptId,
        lease_epoch: claim.leaseEpoch,
        market_path: P04_MARKET_PATH,
        scratch_root: join(work, "scratch"),
        artifact_root: join(work, "p05-artifact-root"),
      }), { encoding: "utf8", mode: 0o600 });
      const { stdout } = await execFile(
        P06_PYTHON,
        ["-I", P06_CHILD_HARNESS, "--input", inputPath],
        {
          cwd: REPOSITORY_ROOT,
          env: {
            HOME: work,
            LANG: "C.UTF-8",
            LC_ALL: "C.UTF-8",
            PATH: process.env.PATH ?? "/usr/bin:/bin",
            TZ: "UTC",
          },
          maxBuffer: 64 * 1024,
          timeout: 120_000,
        },
      );
      return JSON.parse(stdout) as {
        job_id: string; run_id: string; worker_attempt_id: string; lease_epoch: number;
        outcome: "SUCCEEDED"; engine_version: string; bars: number; num_trades: number;
        final_equity: number; network_namespace: string;
        usage: { peak_rss_bytes: number; cpu_seconds: number; scratch_bytes: number; fd_peak: number };
      };
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }

  it("P06-T01/T07: admits a bounded fair queue without creating source work", async () => {
    await seedIdentity();
    for (let index = 0; index < 20; index += 1) {
      await enqueue(index % 2 === 0 ? scopeA : scopeB, `queue-${index}`, "BACKGROUND");
    }
    const claims = await Promise.all([
      repository.claimNextDurableJob(scopeA, { workerId: "p06-worker-a" }),
      repository.claimNextDurableJob(scopeA, { workerId: "p06-worker-b" }),
    ]);
    expect(claims.filter((claim) => claim !== null)).toHaveLength(2);
    expect(new Set(claims.flatMap((claim) => claim ? [claim.jobId] : [])).size).toBe(2);
    expect((await pool.query(
      `SELECT count(*)::integer AS count FROM research.input_bindings WHERE workspace_id = $1`, [scopeA.workspaceId],
    )).rows[0].count).toBe(0);
    const fairness = await pool.query(
      `SELECT requested_by_user_id FROM research.scheduler_fairness
        WHERE workspace_id = $1 ORDER BY requested_by_user_id`, [scopeA.workspaceId],
    );
    expect(fairness.rows.map((row) => row.requested_by_user_id)).toEqual([scopeA.actorUserId, scopeB.actorUserId]);
  });

  it("P06-T02/T09: duplicate command/outbox delivery never creates duplicate logical work", async () => {
    await seedIdentity();
    const { attempt, job } = await enqueue(scopeA, "dedupe");
    expect((await repository.enqueueDurableJob(scopeA, job)).replayed).toBe(true);
    expect((await pool.query(
      `SELECT count(*)::integer AS count FROM research.jobs WHERE workspace_id = $1 AND run_id = $2`,
      [scopeA.workspaceId, attempt.runId],
    )).rows[0].count).toBe(1);

    const first = await repository.claimDurableJobOutbox(scopeA, { publisherId: "p06-publisher" });
    expect(first).toHaveLength(1);
    await pool.query(
      `UPDATE research.job_outbox
          SET available_at = now() - interval '2 seconds',
              claim_expires_at = now() - interval '1 second'
        WHERE workspace_id = $1 AND outbox_id = $2`,
      [scopeA.workspaceId, first[0].outboxId],
    );
    const replay = await repository.claimDurableJobOutbox(scopeA, { publisherId: "p06-publisher-retry" });
    expect(replay).toHaveLength(1);
    expect(replay[0]).toMatchObject({ jobId: job.jobId, eventType: "RESEARCH_JOB_QUEUED" });
    await repository.acknowledgeDurableJobOutbox(scopeA, replay[0]);
    expect(await repository.claimDurableJobOutbox(scopeA, { publisherId: "p06-publisher-final" })).toHaveLength(0);
  });

  it("P06-T11: cross-user deterministic work reuses its logical job; changed work never merges", async () => {
    await seedIdentity();
    const { attempt, job } = await enqueue(scopeA, "cross-user");
    const reused = await repository.enqueueDurableJob(scopeB, {
      ...job,
      jobId: "p06-job-cross-user-second-request",
      commandId: "p06-command-cross-user-second-request",
    });
    expect(reused).toEqual({ jobId: job.jobId, replayed: true });
    await expectResearchError(repository.enqueueDurableJob(scopeB, {
      ...job,
      jobId: "p06-job-cross-user-digest-conflict",
      commandId: "p06-command-cross-user-digest-conflict",
      workDigest: workDigest("cross-user-digest-conflict"),
    }), "RESEARCH_IDEMPOTENCY_PAYLOAD_CONFLICT");

    const distinct = await repository.enqueueDurableJob(scopeB, {
      ...job,
      jobId: "p06-job-cross-user-distinct",
      commandId: "p06-command-cross-user-distinct",
      logicalWorkKey: "p06-work-cross-user-distinct-seed",
      workDigest: workDigest("cross-user-distinct-seed"),
      jobKind: "DIAGNOSTIC",
      readinessClass: "OPTIONAL",
    });
    expect(distinct.replayed).toBe(false);
    expect((await pool.query(
      `SELECT count(*)::integer AS count FROM research.jobs WHERE workspace_id = $1 AND run_id = $2`,
      [scopeA.workspaceId, attempt.runId],
    )).rows[0].count).toBe(2);
    await expectResearchError(repository.enqueueDurableJob(scopeB, {
      ...job,
      commandId: job.commandId,
      logicalWorkKey: "p06-work-cross-user-conflicting-command",
      workDigest: workDigest("cross-user-conflicting-command"),
    }), "RESEARCH_IDEMPOTENCY_PAYLOAD_CONFLICT");
  });

  it("P06-T01: pre-P06 compatibility rows are retained but cannot be claimed by the new scheduler", async () => {
    await seedIdentity();
    const { job } = await enqueue(scopeA, "legacy-compatibility-row");
    await pool.query(
      `UPDATE research.jobs SET work_digest = NULL WHERE workspace_id = $1 AND job_id = $2`,
      [scopeA.workspaceId, job.jobId],
    );
    expect(await repository.claimNextDurableJob(scopeA, { workerId: "p06-legacy-skip" })).toBeNull();
  });

  it("P06-T09: a NATS-shaped transport is acked only after publish succeeds", async () => {
    await seedIdentity();
    await enqueue(scopeA, "transport");
    const service = new ResearchSchedulerOutboxService(repository);
    const delivered: Array<Record<string, string | number>> = [];
    expect(await service.flush(scopeA, {
      publish: async (_subject, payload) => { delivered.push({ ...payload }); },
    }, "p06-nats-publisher")).toEqual({ published: 1, deferred: 0 });
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({ event_type: "RESEARCH_JOB_QUEUED" });

    await enqueue(scopeA, "transport-failure");
    expect(await service.flush(scopeA, {
      publish: async () => { throw new Error("broker unavailable"); },
    }, "p06-nats-failure")).toEqual({ published: 0, deferred: 1 });
    expect((await pool.query(
      `SELECT count(*)::integer AS count FROM research.job_outbox
        WHERE workspace_id = $1 AND state = 'CLAIMED'`, [scopeA.workspaceId],
    )).rows[0].count).toBe(1);
  });

  it("P06-T03/T04/T12: lease fencing and cancellation deterministically beat stale success", async () => {
    await seedIdentity();
    const { job } = await enqueue(scopeA, "lease");
    const claim = await repository.claimNextDurableJob(scopeA, { workerId: "p06-worker" });
    expect(claim).not.toBeNull();
    const owned = claim!;
    await repository.markDurableJobRunning(scopeA, owned);
    await repository.requestDurableJobCancellation(scopeA, { jobId: job.jobId, reason: "owner_cancel" });
    expect((await repository.finishDurableJob(scopeA, {
      ...owned,
      outcome: "SUCCEEDED",
      usage: { peakRssBytes: 1, cpuSeconds: 1, scratchBytes: 1, fdPeak: 3 },
    })).outcome).toBe("CANCELLED");

    const second = await enqueue(scopeA, "lost-lease");
    const stale = await repository.claimNextDurableJob(scopeA, { workerId: "p06-worker-stale" });
    expect(stale?.jobId).toBe(second.job.jobId);
    await repository.markDurableJobRunning(scopeA, stale!);
    await pool.query(
      `UPDATE research.worker_attempts SET expires_at = now() - interval '1 second'
        WHERE workspace_id = $1 AND worker_attempt_id = $2`,
      [scopeA.workspaceId, stale!.workerAttemptId],
    );
    expect(await repository.recoverExpiredDurableJobs(scopeA)).toEqual({ recovered: 1, terminal: 0 });
    await expectResearchError(repository.finishDurableJob(scopeA, {
      ...stale!, outcome: "SUCCEEDED", usage: { peakRssBytes: 1, cpuSeconds: 1, scratchBytes: 1, fdPeak: 3 },
    }), "RESEARCH_JOB_LEASE_REJECTED");
    await pool.query(
      `UPDATE research.jobs SET retry_not_before = now() - interval '1 second'
        WHERE workspace_id = $1 AND job_id = $2`, [scopeA.workspaceId, second.job.jobId],
    );
    const retry = await repository.claimNextDurableJob(scopeA, { workerId: "p06-worker-fenced" });
    expect(retry).toMatchObject({ jobId: second.job.jobId, ordinal: 2, leaseEpoch: 2 });
  });

  it("P06-T06/T13: heavy admission is single-slot and cancellation releases the slot", async () => {
    await seedIdentity();
    const first = await enqueue(scopeA, "heavy-a", "HEAVY");
    await enqueue(scopeB, "heavy-b", "HEAVY");
    const active = await repository.claimNextDurableJob(scopeA, { workerId: "p06-heavy-a" });
    expect(active?.jobId).toBe(first.job.jobId);
    expect(await repository.claimNextDurableJob(scopeA, { workerId: "p06-heavy-b" })).toBeNull();
    await repository.requestDurableJobCancellation(scopeA, { jobId: first.job.jobId, reason: "release heavy slot" });
    await repository.finishDurableJob(scopeA, {
      ...active!, outcome: "CANCELLED", usage: { peakRssBytes: 1, cpuSeconds: 1, scratchBytes: 1, fdPeak: 3 },
    });
    expect((await repository.claimNextDurableJob(scopeA, { workerId: "p06-heavy-b" }))?.queueClass).toBe("HEAVY");
  });

  it("P06-T13: optional failure does not overwrite primary state; mandatory status remains explicit", async () => {
    await seedIdentity();
    const primary = await enqueue(scopeA, "primary-readiness");
    const primaryClaim = await repository.claimNextDurableJob(scopeA, { workerId: "p06-primary-ready" });
    await repository.markDurableJobRunning(scopeA, primaryClaim!);
    await repository.finishDurableJob(scopeA, {
      ...primaryClaim!, outcome: "SUCCEEDED", usage: { peakRssBytes: 1, cpuSeconds: 1, scratchBytes: 1, fdPeak: 3 },
    });

    const optionalAttempt = attemptInput("optional-readiness");
    await repository.createOrReplayAttempt(scopeB, optionalAttempt);
    const optional = jobInput("optional-readiness", optionalAttempt.runId, "BACKGROUND", {
      jobKind: "DIAGNOSTIC", readinessClass: "OPTIONAL",
    });
    await repository.enqueueDurableJob(scopeB, optional);
    const optionalClaim = await repository.claimNextDurableJob(scopeA, { workerId: "p06-optional-ready" });
    await repository.markDurableJobRunning(scopeA, optionalClaim!);
    await repository.finishDurableJob(scopeA, {
      ...optionalClaim!, outcome: "FAILED", reason: "optional diagnostic failure",
      usage: { peakRssBytes: 1, cpuSeconds: 1, scratchBytes: 1, fdPeak: 3 },
    });
    const states = await pool.query<{ job_id: string; state: string; readiness_class: string }>(
      `SELECT job_id, state, readiness_class FROM research.jobs
        WHERE workspace_id = $1 AND job_id = ANY($2::text[]) ORDER BY job_id`,
      [scopeA.workspaceId, [primary.job.jobId, optional.jobId]],
    );
    expect(states.rows).toEqual(expect.arrayContaining([
      { job_id: primary.job.jobId, state: "SUCCEEDED", readiness_class: "MANDATORY" },
      { job_id: optional.jobId, state: "FAILED", readiness_class: "OPTIONAL" },
    ]));
  });

  it("V11-P06-DR: a claimed lease reaches a real isolated Delta child then one terminal commit", async () => {
    await seedIdentity();
    const { job } = await enqueue(scopeA, "actual-durable-delta");
    const claim = await repository.claimNextDurableJob(scopeA, { workerId: "p06-durable-child-worker", leaseSeconds: 120 });
    expect(claim).not.toBeNull();
    expect(claim!.workDigest).toBe(job.workDigest);
    await repository.markDurableJobRunning(scopeA, claim!);
    const result = await executeClaimedDeltaChild(claim!);
    expect(result).toMatchObject({
      job_id: job.jobId,
      worker_attempt_id: claim!.workerAttemptId,
      lease_epoch: claim!.leaseEpoch,
      outcome: "SUCCEEDED",
      engine_version: "1.1.1",
      bars: 500,
      num_trades: 8,
    });
    expect(result.network_namespace).toMatch(/^net:\[/);
    expect((await repository.finishDurableJob(scopeA, {
      ...claim!,
      outcome: result.outcome,
      usage: {
        peakRssBytes: result.usage.peak_rss_bytes,
        cpuSeconds: result.usage.cpu_seconds,
        scratchBytes: result.usage.scratch_bytes,
        fdPeak: result.usage.fd_peak,
      },
    })).outcome).toBe("SUCCEEDED");
    const committed = await pool.query<{ state: string; attempts: number }>(
      `SELECT j.state, count(wa.worker_attempt_id)::integer AS attempts
         FROM research.jobs j
         LEFT JOIN research.worker_attempts wa ON wa.workspace_id = j.workspace_id AND wa.job_id = j.job_id
        WHERE j.workspace_id = $1 AND j.job_id = $2
        GROUP BY j.state`,
      [scopeA.workspaceId, job.jobId],
    );
    expect(committed.rows).toEqual([{ state: "SUCCEEDED", attempts: 1 }]);
  }, 130_000);

  it("P06-T01 migration: upgrades P05 rows and repeats without rewriting durable evidence", async () => {
    await migrateTestDatabase(DATABASE_URL);
    await migrateTestDatabase(DATABASE_URL);
    const migrationSource = fileURLToPath(new URL("../../apps/control-api/migrations/", import.meta.url));
    const preP06Migrations = await mkdtemp(join(tmpdir(), "portal-research-p06-upgrade-"));
    const adminUrl = new URL(DATABASE_URL);
    adminUrl.pathname = "/postgres";
    const databaseName = `p06_upgrade_${process.pid}_${Date.now()}`;
    const upgradeUrl = new URL(DATABASE_URL);
    upgradeUrl.pathname = `/${databaseName}`;
    const admin = new Pool({ connectionString: adminUrl.toString() });
    let upgradePool: Pool | undefined;
    try {
      for (const filename of await readdir(migrationSource)) {
        if (filename.endsWith(".sql") && filename < "1723680000039_research-durable-scheduler.sql") {
          await cp(join(migrationSource, filename), join(preP06Migrations, filename));
        }
      }
      await admin.query(`CREATE DATABASE ${databaseName}`);
      await migrate({ databaseUrl: upgradeUrl.toString(), dir: preP06Migrations, direction: "up", migrationsTable: "pgmigrations", count: Infinity, noLock: true, log: () => {} });
      upgradePool = new Pool({ connectionString: upgradeUrl.toString() });
      await upgradePool.query(
        `INSERT INTO portal_users (user_id, username, display_name, role, status, must_change_password)
         VALUES ('p06-pre-user', 'p06-pre-user', 'P06 Pre User', 'ADMIN', 'ACTIVE', false)`,
      );
      await upgradePool.query(`INSERT INTO workspaces (workspace_id, name, owner_user_id) VALUES ('p06-pre-ws', 'P06 Pre', 'p06-pre-user')`);
      await upgradePool.query(`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ('p06-pre-ws', 'p06-pre-user', 'OWNER')`);
      await upgradePool.query(
        `INSERT INTO research.attempts
           (workspace_id, attempt_id, client_intent_id, request_payload_digest, intent_kind, state, created_by_user_id)
         VALUES ('p06-pre-ws', 'p06-pre-attempt', 'p06-pre-intent', $1, 'NEW', 'DRAFT', 'p06-pre-user')`, [DIGEST("1")],
      );
      await upgradePool.query(
        `INSERT INTO research.runs
           (workspace_id, run_id, attempt_id, run_kind, relationship_kind, logical_run_key,
            request_spec_digest, effective_spec_digest, engine_release_id, dataset_binding_digest, state, submitted_by_user_id)
         VALUES ('p06-pre-ws', 'p06-pre-run', 'p06-pre-attempt', 'PRIMARY', 'PRIMARY', 'primary', $1, $2, 'quantbt-1.1.1', $3, 'DRAFT', 'p06-pre-user')`,
        [DIGEST("2"), DIGEST("3"), DIGEST("4")],
      );
      await upgradePool.query(
        `INSERT INTO research.jobs
           (workspace_id, job_id, run_id, command_id, job_kind, queue_class, cost_estimate, resource_class, state, requested_by_user_id)
         VALUES ('p06-pre-ws', 'p06-pre-job', 'p06-pre-run', 'p06-pre-command', 'PRIMARY', 'BACKGROUND', '{}'::jsonb, 'legacy', 'QUEUED', 'p06-pre-user')`,
      );
      await upgradePool.end();
      upgradePool = undefined;
      await migrateTestDatabase(upgradeUrl.toString());
      await migrateTestDatabase(upgradeUrl.toString());
      upgradePool = new Pool({ connectionString: upgradeUrl.toString() });
      const row = await upgradePool.query<{ logical_work_key: string; work_digest: string | null; readiness_class: string; outbox: string | null }>(
        `SELECT logical_work_key, work_digest, readiness_class, to_regclass('research.job_outbox') AS outbox
           FROM research.jobs WHERE workspace_id = 'p06-pre-ws' AND job_id = 'p06-pre-job'`,
      );
      expect(row.rows[0]).toEqual({
        logical_work_key: "p06-pre-command",
        work_digest: null,
        readiness_class: "MANDATORY",
        outbox: "research.job_outbox",
      });
    } finally {
      await upgradePool?.end();
      await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`).catch(() => undefined);
      await admin.end();
      await rm(preP06Migrations, { recursive: true, force: true });
    }
  }, 90_000);
});
