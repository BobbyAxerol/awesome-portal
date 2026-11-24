/** Narrow real-PG claim/fence regressions; no Python, broker or preview mutation. */
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ResearchMetadataRepository } from "../src/research/repository";
import { ResearchP04DeltaBindingService } from "../src/research/p04-delta-binding.service";
import { ResearchRunAdmissionService } from "../src/research/run-admission.service";
import { ResearchRunCreateService } from "../src/research/run-create.service";
import type { ResearchScope } from "../src/research/contracts";
import { migrateTestDatabase } from "./harness";
import { flagConfig, manifestFor, p04Requested, w1Admin } from "./research-w1-wfo.fixture";

const databaseName = `portal_claim_${randomUUID().replaceAll("-", "")}`;
function databaseUrl(name: string) {
  const url = new URL(process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test");
  url.pathname = `/${name}`;
  return url.toString();
}
const a = { workspaceId: "claim-ws-a", actorUserId: "claim-user-a" };
const b = { workspaceId: "claim-ws-b", actorUserId: "claim-user-b" };

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("workspace HEAVY serialization and exact late-ack fence", () => {
  let pool: Pool;
  let repository: ResearchMetadataRepository;
  beforeAll(async () => {
    const admin = new Pool({ connectionString: databaseUrl("postgres") });
    try { await admin.query(`CREATE DATABASE ${databaseName}`); } finally { await admin.end(); }
    await migrateTestDatabase(databaseUrl(databaseName));
    pool = new Pool({ connectionString: databaseUrl(databaseName) });
    repository = new ResearchMetadataRepository(pool);
    for (const scope of [a, b]) {
      await pool.query(`INSERT INTO portal_users (user_id, username, display_name, role, status, must_change_password)
        VALUES ($1, $1, 'Claim regression', 'ADMIN', 'ACTIVE', false)`, [scope.actorUserId]);
      await pool.query(`INSERT INTO workspaces (workspace_id, name, owner_user_id) VALUES ($1, 'Claim test', $2)`,
        [scope.workspaceId, scope.actorUserId]);
      await pool.query(`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'OWNER')`,
        [scope.workspaceId, scope.actorUserId]);
    }
  });
  afterAll(async () => {
    await pool?.end();
    const admin = new Pool({ connectionString: databaseUrl("postgres") });
    try { await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`); } finally { await admin.end(); }
  });

  async function enqueue(scope: ResearchScope, suffix: string) {
    const runId = `rrun_claim_${suffix}`, jobId = `rjob_claim_${suffix}`;
    await repository.createOrReplayAttempt(scope, { attemptId: `ratt_claim_${suffix}`, runId,
      clientIntentId: `rci_claim_${suffix}`, requestPayloadDigest: "a".repeat(64), intentKind: "NEW",
      requestSpecDigest: "b".repeat(64), effectiveSpecDigest: "c".repeat(64),
      engineReleaseId: "er_quantbt_111", datasetBindingDigest: "d".repeat(64) });
    await repository.enqueueDurableJob(scope, { jobId, runId, commandId: `rcmd_claim_${suffix}`,
      logicalWorkKey: `work-${suffix}`, workDigest: "e".repeat(64), jobKind: "PRIMARY",
      readinessClass: "MANDATORY", queueClass: "HEAVY", resourceClass: "quantbt-heavy",
      cost: { memoryBytes: 64 * 1024 * 1024, cpuSeconds: 60, scratchBytes: 16 * 1024 * 1024, ioBytes: 32 * 1024 * 1024 },
      attemptLimit: 2 });
    return { runId, jobId };
  }

  it("two independent connections cannot claim two different HEAVY jobs in one workspace", async () => {
    const first = await enqueue(a, "same-a"), second = await enqueue(a, "same-b");
    const selected = deferred(), releaseFirst = deferred();
    const paused = new ResearchMetadataRepository({ connect: async () => {
      const client = await pool.connect();
      return { release: () => client.release(), query: async (sql: string, values?: unknown[]) => {
        const result = await client.query(sql, values);
        if (sql.includes("FROM research.jobs j") && sql.includes("FOR UPDATE SKIP LOCKED")) {
          selected.resolve(); await releaseFirst.promise;
        }
        return result;
      } };
    } } as Pool);
    const firstClaim = paused.claimNextDurableJob(a, { workerId: "first-worker", jobId: first.jobId });
    await selected.promise;
    const secondClaim = repository.claimNextDurableJob(a, { workerId: "second-worker", jobId: second.jobId });
    let waiting = false;
    try {
      // Poll metadata, not a timing-only assertion: the second real connection
      // must wait on our exact workspace advisory lock while the first holds it.
      for (let i = 0; i < 100 && !waiting; i += 1) {
        const result = await pool.query(`SELECT EXISTS (SELECT 1 FROM pg_locks
          WHERE locktype = 'advisory' AND NOT granted AND database = (SELECT oid FROM pg_database WHERE datname = current_database())) AS waiting`);
        waiting = result.rows[0].waiting;
        if (!waiting) await new Promise((done) => setTimeout(done, 5));
      }
    } finally { releaseFirst.resolve(); }
    expect(waiting).toBe(true);
    const results = await Promise.all([firstClaim, secondClaim]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const active = await pool.query(`SELECT count(*)::int AS n FROM research.jobs
      WHERE workspace_id = $1 AND queue_class = 'HEAVY' AND state IN ('CLAIMED','RUNNING','CANCEL_REQUESTED')`, [a.workspaceId]);
    expect(active.rows[0].n).toBe(1);
    await repository.finishDurableJob(a, { ...results.find(Boolean)!, outcome: "SUCCEEDED",
      usage: { peakRssBytes: null, cpuSeconds: null, scratchBytes: null, fdPeak: null } });
  });

  it("a held workspace lock does not block another workspace and rolls back cleanly", async () => {
    const job = await enqueue(b, "independent");
    const holder = await pool.connect();
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`research.scheduler:${a.workspaceId}`]);
      const claim = await repository.claimNextDurableJob(b, { workerId: "other-workspace", jobId: job.jobId });
      expect(claim?.jobId).toBe(job.jobId);
      await holder.query("ROLLBACK");
      const released = await holder.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired", [`research.scheduler:${a.workspaceId}`]);
      expect(released.rows[0].acquired).toBe(true);
    } finally { await holder.query("ROLLBACK"); holder.release(); }
  });

  it("a late old202 cannot acknowledge a superseding current lease; the new exact fence can", async () => {
    const owner = { ...w1Admin, userId: a.actorUserId };
    await new ResearchP04DeltaBindingService(repository).install(owner, a);
    const spec = p04Requested();
    const manifest = manifestFor(spec, { token: "rpft_claim_ack" });
    await repository.storePreflightManifest(a, { ...manifest, expiresAt: new Date(Date.now() + 60_000) }, 4);
    const config = flagConfig(true);
    const service = new ResearchRunCreateService(repository, new ResearchRunAdmissionService(repository, config as never),
      { handleWrite: vi.fn(async () => { throw new Error("test lost response"); }) } as never, config as never);
    await expect(service.create(owner, a, { schema_version: "research.run-create.v1", client_intent_id: "rci_claim_ack",
      preflight_token: manifest.preflightToken, requested_spec: spec, intent_kind: "NEW" }, "req_claim_ack")).rejects.toMatchObject({ code: "RESEARCH_RUN_TRANSPORT_UNKNOWN" });
    const saved = (await pool.query(`SELECT run_id, job_id, worker_attempt_id, lease_epoch FROM research.run_producers
      WHERE workspace_id = $1 AND client_intent_id = 'rci_claim_ack'`, [a.workspaceId])).rows[0];
    await pool.query("UPDATE research.worker_attempts SET expires_at = now() - interval '1 second' WHERE worker_attempt_id = $1", [saved.worker_attempt_id]);
    await repository.recoverExpiredDurableJobs(a);
    await pool.query("UPDATE research.jobs SET retry_not_before = now() - interval '1 second' WHERE job_id = $1", [saved.job_id]);
    const next = await repository.claimNextDurableJob(a, { workerId: "next-fence", jobId: saved.job_id });
    expect(next?.leaseEpoch).toBe(2);
    await expect(repository.recordRunProducerDispatched(a, { runId: saved.run_id, jobId: saved.job_id,
      workerAttemptId: saved.worker_attempt_id, leaseEpoch: Number(saved.lease_epoch), receipt: { run_id: saved.run_id } })).rejects.toMatchObject({ code: "RESEARCH_JOB_STATE_CONFLICT" });
    const pending = await pool.query("SELECT dispatch_state FROM research.run_producers WHERE run_id = $1", [saved.run_id]);
    expect(pending.rows[0].dispatch_state).toBe("PENDING");
    await repository.recordRunProducerClaim(a, { ...next!, runId: saved.run_id });
    await repository.finishDurableJob(a, { ...next!, outcome: "SUCCEEDED",
      usage: { peakRssBytes: null, cpuSeconds: null, scratchBytes: null, fdPeak: null } });
    const acknowledged = await repository.recordRunProducerDispatched(a, { ...next!, runId: saved.run_id, receipt: { run_id: saved.run_id } });
    expect(acknowledged.dispatchState).toBe("DISPATCHED");
  });

  async function dispatchFixture(suffix: string, definite: boolean) {
    const owner = { ...w1Admin, userId: a.actorUserId };
    await new ResearchP04DeltaBindingService(repository).install(owner, a);
    const spec = p04Requested(), manifest = manifestFor(spec, { token: `rpft_refusal_${suffix}` });
    await repository.storePreflightManifest(a, { ...manifest, expiresAt: new Date(Date.now() + 60_000) }, 16);
    let refusal: Record<string, unknown> = {};
    const proxy = { handleWrite: vi.fn(async (input: { body: string }) => {
      const request = JSON.parse(input.body);
      refusal = { schema_version: "research.run-dispatch-refusal.v1", outcome: "NOT_DISPATCHED",
        reason_code: "PRODUCER_DISABLED", workspace_id: a.workspaceId, run_id: request.run_id,
        job_id: request.job_id, worker_attempt_id: request.worker_attempt_id, lease_epoch: request.lease_epoch };
      if (!definite) throw new Error("possibly committed publish with lost response");
      return { status: 503, body: { detail: refusal }, idempotencyKey: `research-run:${suffix}`, replayed: false };
    }) };
    const config = flagConfig(false);
    const service = new ResearchRunCreateService(repository, new ResearchRunAdmissionService(repository, config as never),
      proxy as never, config as never);
    const create = () => service.create(owner, a, { schema_version: "research.run-create.v1",
      client_intent_id: `rci_refusal_${suffix}`, preflight_token: manifest.preflightToken,
      requested_spec: spec, intent_kind: "NEW" }, `req_refusal_${suffix}`);
    return { create, proxy, refusal: () => refusal };
  }

  async function refusalState(runId: unknown) {
    return (await pool.query(`SELECT producer.portal_receipt, producer.dispatch_state, run.state AS run_state,
      attempt.state AS attempt_state, job.state AS job_state, job.terminal_reason,
      worker.state AS worker_state, worker.measured_usage
      FROM research.run_producers producer
      JOIN research.runs run ON run.workspace_id=producer.workspace_id AND run.run_id=producer.run_id
      JOIN research.attempts attempt ON attempt.workspace_id=run.workspace_id AND attempt.attempt_id=run.attempt_id
      JOIN research.jobs job ON job.workspace_id=producer.workspace_id AND job.job_id=producer.job_id
      JOIN research.worker_attempts worker ON worker.workspace_id=producer.workspace_id
        AND worker.worker_attempt_id=producer.worker_attempt_id
      WHERE producer.workspace_id=$1 AND producer.run_id=$2`, [a.workspaceId, runId])).rows[0];
  }

  it("definite pre-publish refusal closes the exact run/job/attempt atomically and replays without dispatch", async () => {
    const x = await dispatchFixture("terminal", true);
    for (let i = 0; i < 2; i++) await expect(x.create()).rejects.toMatchObject({ code: "RESEARCH_RUN_PRODUCER_UNAVAILABLE" });
    const receipt = x.refusal();
    expect(await refusalState(receipt.run_id)).toMatchObject({ portal_receipt: receipt, dispatch_state: "PENDING",
      run_state: "FAILED", attempt_state: "FAILED", job_state: "FAILED", worker_state: "FAILED",
      measured_usage: {}, terminal_reason: "P10_DISPATCH_NOT_ATTEMPTED: PRODUCER_DISABLED" });
    expect(x.proxy.handleWrite).toHaveBeenCalledTimes(1);
    const count = await pool.query(`SELECT count(*)::int AS n FROM research.worker_attempts
      WHERE workspace_id=$1 AND job_id=$2`, [a.workspaceId, receipt.job_id]);
    expect(count.rows[0].n).toBe(1);
    const claim = { runId: receipt.run_id as string, jobId: receipt.job_id as string,
      workerAttemptId: receipt.worker_attempt_id as string, leaseEpoch: receipt.lease_epoch as number };
    await expect(repository.recordRunProducerDispatched(a, { ...claim, receipt: { run_id: receipt.run_id } }))
      .rejects.toMatchObject({ code: "RESEARCH_JOB_STATE_CONFLICT" });
    await expect(repository.recordRunProducerClaim(a, claim)).rejects.toMatchObject({ code: "RESEARCH_JOB_STATE_CONFLICT" });
    expect((await refusalState(receipt.run_id)).portal_receipt).toEqual(receipt);
  });

  it("a failed refusal audit rolls back every lifecycle write and its receipt", async () => {
    const x = await dispatchFixture("rollback", false);
    await expect(x.create()).rejects.toMatchObject({ code: "RESEARCH_RUN_TRANSPORT_UNKNOWN" });
    const receipt = x.refusal(), before = await refusalState(receipt.run_id);
    const failing = new ResearchMetadataRepository({ connect: async () => {
      const client = await pool.connect();
      return { release: () => client.release(), query: async (sql: string, values?: unknown[]) => {
        if (sql.includes("INSERT INTO research.job_events")) throw new Error("synthetic failed event write");
        return client.query(sql, values);
      } };
    } } as Pool);
    const input = { runId: receipt.run_id as string, jobId: receipt.job_id as string,
      workerAttemptId: receipt.worker_attempt_id as string, leaseEpoch: receipt.lease_epoch as number, receipt };
    await expect(failing.recordRunProducerNotDispatched(a, input)).rejects.toThrow("synthetic failed event write");
    expect(await refusalState(receipt.run_id)).toEqual(before);
    expect(before).toMatchObject({ portal_receipt: null, job_state: "CLAIMED", worker_state: "CLAIMED" });
    await repository.recordRunProducerNotDispatched(a, input);
    expect((await refusalState(receipt.run_id)).job_state).toBe("FAILED");
  });

  it("a cancellation that wins the lock is not overwritten by a late refusal", async () => {
    const x = await dispatchFixture("cancel", false);
    await expect(x.create()).rejects.toMatchObject({ code: "RESEARCH_RUN_TRANSPORT_UNKNOWN" });
    const receipt = x.refusal();
    await repository.requestDurableJobCancellation(a, { jobId: receipt.job_id as string, reason: "owner requested stop" });
    const before = await refusalState(receipt.run_id);
    await expect(repository.recordRunProducerNotDispatched(a, { runId: receipt.run_id as string,
      jobId: receipt.job_id as string, workerAttemptId: receipt.worker_attempt_id as string,
      leaseEpoch: receipt.lease_epoch as number, receipt })).rejects.toMatchObject({ code: "RESEARCH_JOB_LEASE_REJECTED" });
    expect(await refusalState(receipt.run_id)).toEqual(before);
    expect(before).toMatchObject({ job_state: "CANCEL_REQUESTED", portal_receipt: null });
    await repository.finishDurableJob(a, { jobId: receipt.job_id as string,
      workerAttemptId: receipt.worker_attempt_id as string, leaseEpoch: receipt.lease_epoch as number,
      outcome: "CANCELLED", usage: { peakRssBytes: null, cpuSeconds: null, scratchBytes: null, fdPeak: null } });
  });

  it("an old refusal cannot fail a superseding lease or a worker that already started", async () => {
    const x = await dispatchFixture("old", false);
    await expect(x.create()).rejects.toMatchObject({ code: "RESEARCH_RUN_TRANSPORT_UNKNOWN" });
    const receipt = x.refusal();
    await pool.query(`UPDATE research.worker_attempts SET expires_at=now()-interval '1 second'
      WHERE workspace_id=$1 AND worker_attempt_id=$2`, [a.workspaceId, receipt.worker_attempt_id]);
    await repository.recoverExpiredDurableJobs(a);
    await pool.query(`UPDATE research.jobs SET retry_not_before=now()-interval '1 second'
      WHERE workspace_id=$1 AND job_id=$2`, [a.workspaceId, receipt.job_id]);
    const next = await repository.claimNextDurableJob(a, { workerId: "new-refusal-fence", jobId: receipt.job_id as string });
    expect(next?.leaseEpoch).toBe(2);
    await repository.recordRunProducerClaim(a, { ...next!, runId: receipt.run_id as string });
    const before = await refusalState(receipt.run_id);
    await expect(repository.recordRunProducerNotDispatched(a, { runId: receipt.run_id as string,
      jobId: receipt.job_id as string, workerAttemptId: receipt.worker_attempt_id as string,
      leaseEpoch: receipt.lease_epoch as number, receipt })).rejects.toMatchObject({ code: "RESEARCH_JOB_LEASE_REJECTED" });
    expect(await refusalState(receipt.run_id)).toEqual(before);
    await repository.markDurableJobRunning(a, next!);
    const running = await refusalState(receipt.run_id);
    const changedReceipt = { ...receipt, worker_attempt_id: next!.workerAttemptId, lease_epoch: next!.leaseEpoch };
    await expect(repository.recordRunProducerNotDispatched(a, { ...next!, runId: receipt.run_id as string,
      receipt: changedReceipt })).rejects.toMatchObject({ code: "RESEARCH_JOB_LEASE_REJECTED" });
    expect(await refusalState(receipt.run_id)).toEqual(running);
  });
});
