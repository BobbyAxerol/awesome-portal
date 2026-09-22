import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "../../apps/control-api/node_modules/pg";

import type { ControlApiConfig } from "../../apps/control-api/src/config";
import type { PortalUser } from "../../apps/control-api/src/domain";
import type { ResearchScope } from "../../apps/control-api/src/research/contracts";
import { P04_DELTA_BINDING, P04_DELTA_FIXED_PARAMETERS } from "../../apps/control-api/src/research/p04-delta.binding";
import { ResearchP04DeltaBindingService } from "../../apps/control-api/src/research/p04-delta-binding.service";
import {
  ResearchProgressIngressSchema,
  type ResearchProgressIngress,
  type ResearchProgressSnapshot,
} from "../../apps/control-api/src/research/progress.contract";
import { ResearchProgressError } from "../../apps/control-api/src/research/progress.error";
import { ResearchProgressFanout } from "../../apps/control-api/src/research/progress.fanout";
import { ResearchProgressRepository } from "../../apps/control-api/src/research/progress.repository";
import { ResearchProgressService } from "../../apps/control-api/src/research/progress.service";
import { sha256ResearchJson } from "../../apps/control-api/src/research/preflight.service";
import type { ResearchRequestedSpec } from "../../apps/control-api/src/research/preflight.contract";
import { ResearchMetadataRepository } from "../../apps/control-api/src/research/repository";
import { ResearchRunAdmissionService } from "../../apps/control-api/src/research/run-admission.service";
import { ResearchRunCreateService } from "../../apps/control-api/src/research/run-create.service";
import { ResearchEvidenceRepository } from "../../apps/control-api/src/research/evidence.repository";
import { ResearchEvidenceService } from "../../apps/control-api/src/research/evidence.service";
import { ResearchSplitRepository } from "../../apps/control-api/src/research/split.repository";
import { ResearchSplitService } from "../../apps/control-api/src/research/split.service";
import { ResearchSearchService } from "../../apps/control-api/src/research/search.service";
import { ResearchFreezeService } from "../../apps/control-api/src/research/freeze.service";
import { ResearchReplayService } from "../../apps/control-api/src/research/replay.service";
import { migrateTestDatabase, truncateAll } from "../../apps/control-api/test/harness";
import { p13EvidenceSourceFixture } from "../../apps/control-api/test/research-evidence.fixture";
import { p14SplitSourceFixture } from "../../apps/control-api/test/research-split.fixture";

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const scope: ResearchScope = { workspaceId: "p11-workspace", actorUserId: "p11-admin" };
const admin: PortalUser = {
  userId: scope.actorUserId,
  username: "p11-admin",
  displayName: "P11 Admin",
  role: "ADMIN",
  status: "ACTIVE",
  mustChangePassword: false,
  failedLoginCount: 0,
  lockedUntil: null,
  sessionVersion: 1,
  createdAt: new Date("2026-09-21T00:00:00.000Z"),
  updatedAt: new Date("2026-09-21T00:00:00.000Z"),
  disabledAt: null,
  accountRevision: 1,
  archivedAt: null,
};

const config = {
  FEATURE_RESEARCH_RUN_PRODUCER: "true",
  FEATURE_RESEARCH_PROGRESS: "true",
  RESEARCH_RUN_PRODUCER_LEASE_SECONDS: 15,
  RESEARCH_PROGRESS_PRIVATE_TIMEOUT_MS: 1_500,
} as ControlApiConfig;

const USAGE = {
  peak_rss_bytes: 1_024,
  cpu_seconds: 1,
  scratch_bytes: 0,
  fd_peak: 4,
};

function requested(): ResearchRequestedSpec {
  return {
    schema_version: "research.requested-spec.v1",
    alpha_binding: { alpha_id: P04_DELTA_BINDING.alphaId, alpha_version_id: P04_DELTA_BINDING.alphaVersionId },
    not_publishable: false,
    strategy_id: P04_DELTA_BINDING.alphaId,
    execution_route: "signal_notional",
    route_params: {},
    data: { dataset_id: "crypto-binance-1m", symbol: "BTCUSDT", timeframe: "1h" },
    protocol: "three_window_decay",
    windows: {
      is: { start: "2025-01-01T00:00:00Z", end_exclusive: "2025-01-04T00:00:00Z" },
      oos: { start: "2025-01-04T00:00:00Z", end_exclusive: "2025-01-06T00:00:00Z" },
      holdout: { start: "2025-01-06T00:00:00Z", end_exclusive: "2025-01-08T00:00:00Z" },
    },
    optimization_mode: "mode_1_decay",
    optimization_schedule: "global",
    parameter_space_overrides: [],
    optuna_trials: 1,
    early_stopping: null,
    random_seed: null,
    optimization_config: {},
    client: { engine_release_id: "er_quantbt_111", config_digest: "a".repeat(64) },
  } as ResearchRequestedSpec;
}

async function seedIdentity(pool: Pool): Promise<void> {
  await pool.query(
    `INSERT INTO portal_users (user_id, username, display_name, role, status, must_change_password)
     VALUES ($1, 'p11-admin', 'P11 Admin', 'ADMIN', 'ACTIVE', false)`,
    [scope.actorUserId],
  );
  await pool.query(
    `INSERT INTO workspaces (workspace_id, name, owner_user_id) VALUES ($1, 'P11 Workspace', $2)`,
    [scope.workspaceId, scope.actorUserId],
  );
  await pool.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'OWNER')`,
    [scope.workspaceId, scope.actorUserId],
  );
}

async function seedManifest(repository: ResearchMetadataRepository, spec: ResearchRequestedSpec): Promise<void> {
  const requestedDigest = sha256ResearchJson(spec);
  const effectiveSpec = {
    schema_version: "research.effective-spec.v1",
    requested_spec_digest: requestedDigest,
    engine: { engine_release_id: "er_quantbt_111", execution_route: "signal_notional" },
  };
  const datasetBinding = {
    schema_version: "research.dataset-binding.v1",
    snapshot_id: "dss_0123456789abcdef0123456789abcdef",
    snapshot_content_hash: "b".repeat(64),
    source_manifest_digest: "d".repeat(64),
  };
  const topology = { schema_version: "research.topology.v1", topology_digest: "c".repeat(64) };
  const resourceEstimate = { schema_version: "research.resource-estimate.v1", trial_count: 1 };
  const snapshot = {
    snapshot_id: "dss_0123456789abcdef0123456789abcdef",
    snapshot_content_hash: "b".repeat(64),
    source_manifest_digest: "d".repeat(64),
  };
  await repository.storePreflightManifest(scope, {
    preflightToken: "rpft_p11_manifest",
    requestedSpecDigest: requestedDigest,
    effectiveSpecDigest: sha256ResearchJson(effectiveSpec),
    datasetBindingDigest: sha256ResearchJson(datasetBinding),
    manifestDigest: sha256ResearchJson({ requestedDigest, effectiveSpec, datasetBinding, topology, snapshot }),
    requestedSpec: spec as unknown as Record<string, unknown>,
    effectiveSpec,
    datasetBinding,
    topology,
    resourceEstimate,
    snapshot,
    expiresAt: new Date(Date.now() + 60_000),
  }, 4);
}

class FakePrivatePortalProxy {
  async handleWrite(input: Record<string, unknown>) {
    const body = JSON.parse(String(input.body)) as { run_id: string };
    return { status: 202, body: { run_id: body.run_id }, idempotencyKey: String(input.idempotencyKey), replayed: false };
  }
}

class FakeProgressPortalClient {
  async requestCancellation(): Promise<"REQUESTED"> { return "REQUESTED"; }
}

/** P13 is a terminal sidecar; P11's own regression corpus has no receipt. */
class FakeEvidenceService {
  async ingest(): Promise<void> { /* source receipt absent by design */ }
}

/** P14 is likewise terminal-only; legacy P11 corpus intentionally omits it. */
class FakeSplitService {
  async ingest(): Promise<void> { /* source receipt absent by design */ }
}

/** P18 is a terminal sidecar too; this P11/P13 harness only asserts its call shape. */
class FakeReportService {
  async materializeTerminal(): Promise<void> { /* report assembly is covered by its own P18 corpus */ }
}

function snapshot(
  runId: string,
  workerAttemptId: string,
  leaseEpoch: number,
  sequence: number,
  overrides: Partial<ResearchProgressSnapshot> = {},
): ResearchProgressSnapshot {
  return {
    schema_version: "research.progress-snapshot.v1",
    run_id: runId,
    attempt_id: workerAttemptId,
    lease_epoch: leaseEpoch,
    status: "RUNNING",
    created_at_utc_ms: 1_725_000_000_000,
    updated_at_utc_ms: 1_725_000_000_000 + sequence,
    latest_sequence: sequence,
    retention_floor_sequence: 0,
    stages: ["S1", "S2", "S3", "S4", "S5"].map((key) => ({
      key: key as "S1" | "S2" | "S3" | "S4" | "S5",
      state: key === "S1" ? "RUNNING" : "PENDING",
      started_at_utc_ms: key === "S1" ? 1_725_000_000_000 : null,
      completed_at_utc_ms: null,
    })),
    overall: { pct: 0, elapsed_s: sequence, eta_s: null, trials_done: 0, trials_declared: 1, tqdm_line: "running" },
    budget: { used: "0", cap: null, unit: "core-min", pct: 0 },
    folds: [],
    artifacts: [],
    claim: {
      state: "NOT_ISSUED",
      text: "P11 has no release claim.",
      cursor: null,
      // The fixture models the current P04 source: it has not published a
      // methodology certificate fact. Do not make a certificate out of this
      // claim's prose merely to satisfy the new display contract.
      methodology_certificate: {
        state: "NOT_PUBLISHED",
        grade: null,
        issued_at_utc_ms: null,
        reason_code: "SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE",
      },
    },
    readiness: { mandatory: "PENDING", optional: "NOT_APPLICABLE" },
    failure: null,
    source: { kind: "DURABLE_P10", coverage: "ACTUAL_HOOKS", partial: false },
    ...overrides,
  };
}

function ingress(input: {
  runId: string;
  jobId: string;
  workerAttemptId: string;
  leaseEpoch: number;
  sequence: number;
  eventType: "run_started" | "heartbeat" | "run_completed" | "run_failed";
  progress?: ResearchProgressSnapshot;
  evidence?: ReturnType<typeof p13EvidenceSourceFixture>;
  split?: ReturnType<typeof p14SplitSourceFixture>;
}): ResearchProgressIngress {
  const payload = input.eventType === "run_completed" ? {
    usage: USAGE,
    ...(input.evidence ? { evidence_digest: sha256ResearchJson(input.evidence) } : {}),
    ...(input.split ? { split_digest: sha256ResearchJson(input.split) } : {}),
  }
    : input.eventType === "run_failed" ? { code: "ENGINE_ERROR", message: "source contradiction", usage: USAGE }
      : {};
  return ResearchProgressIngressSchema.parse({
    schema_version: "research.progress-ingress.v1",
    workspace_id: scope.workspaceId,
    run_id: input.runId,
    job_id: input.jobId,
    worker_attempt_id: input.workerAttemptId,
    lease_epoch: input.leaseEpoch,
    event: {
      schema_version: "research.progress-event.v1",
      run_id: input.runId,
      attempt_id: input.workerAttemptId,
      lease_epoch: input.leaseEpoch,
      sequence: input.sequence,
      event_type: input.eventType,
      occurred_at_utc_ms: 1_725_000_000_000 + input.sequence,
      payload,
    },
    snapshot: input.progress ?? snapshot(input.runId, input.workerAttemptId, input.leaseEpoch, input.sequence),
    ...(input.evidence ? { evidence: input.evidence } : {}),
    ...(input.split ? { split: input.split } : {}),
  });
}

async function expectProgressError(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ResearchProgressError);
    expect((error as ResearchProgressError).code).toBe(code);
    return;
  }
  throw new Error(`Expected P11 ${code}.`);
}

describe("Research Loop P11 · durable progress journal materialisation", () => {
  let pool: Pool;
  let metadata: ResearchMetadataRepository;
  let progress: ResearchProgressRepository;
  let service: ResearchProgressService;

  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL);
    pool = new Pool({ connectionString: DATABASE_URL });
    metadata = new ResearchMetadataRepository(pool);
    progress = new ResearchProgressRepository(pool);
    service = new ResearchProgressService(
      progress,
      metadata,
      new ResearchProgressFanout(),
      new FakeProgressPortalClient() as never,
      new FakeEvidenceService() as never,
      new FakeSplitService() as never,
      new FakeReportService() as never,
      config,
    );
  }, 60_000);

  afterEach(async () => { await truncateAll(pool); });
  afterAll(async () => { await pool?.end(); });

  async function createDispatchedRun() {
    await seedIdentity(pool);
    await new ResearchP04DeltaBindingService(metadata).install(admin, scope);
    const spec = requested();
    await seedManifest(metadata, spec);
    const producer = new ResearchRunCreateService(
      metadata,
      new ResearchRunAdmissionService(metadata, config),
      new FakePrivatePortalProxy() as never,
      config,
    );
    const created = await producer.create(admin, scope, {
      schema_version: "research.run-create.v1",
      client_intent_id: "p11-current-intent",
      preflight_token: "rpft_p11_manifest",
      requested_spec: spec,
      intent_kind: "NEW",
    }, "p11-request");
    const row = await pool.query<{ job_id: string; worker_attempt_id: string; lease_epoch: string | number }>(
      `SELECT job_id, worker_attempt_id, lease_epoch
         FROM research.run_producers
        WHERE workspace_id = $1 AND run_id = $2`,
      [scope.workspaceId, created.run_id],
    );
    const current = row.rows[0];
    if (!current?.worker_attempt_id || current.lease_epoch === null) throw new Error("P10 fixture did not create a fenced lease.");
    return {
      runId: created.run_id,
      jobId: current.job_id,
      workerAttemptId: current.worker_attempt_id,
      leaseEpoch: Number(current.lease_epoch),
    };
  }

  it("P11-T01/T02/T07/T11: persists exact progress once, survives service restart, and rejects gaps or stale leases", async () => {
    const run = await createDispatchedRun();
    const first = ingress({ ...run, sequence: 1, eventType: "run_started" });
    expect(await service.ingest(first)).toEqual({ accepted: true, latest_sequence: 1 });
    // At-least-once source delivery is exact: one immutable sequence and one
    // idempotent P06 RUNNING transition, not a second state mutation.
    expect(await service.ingest(first)).toEqual({ accepted: true, latest_sequence: 1 });
    const events = await pool.query(
      `SELECT source_sequence FROM research.run_progress_events WHERE workspace_id = $1 AND run_id = $2`,
      [scope.workspaceId, run.runId],
    );
    expect(events.rows).toEqual([{ source_sequence: "1" }]);

    const rehydrated = new ResearchProgressService(
      new ResearchProgressRepository(pool), metadata, new ResearchProgressFanout(),
      new FakeProgressPortalClient() as never, new FakeEvidenceService() as never, new FakeSplitService() as never,
      new FakeReportService() as never, config,
    );
    const read = await rehydrated.read(admin, scope, run.runId);
    expect(read).toMatchObject({
      availability: "AVAILABLE",
      current: { effective_status: "RUNNING", source_latest_sequence: 1 },
      progress: { latest_sequence: 1, status: "RUNNING" },
    });
    expect(JSON.stringify(read)).not.toContain("attempt_id");
    expect(JSON.stringify(read)).not.toContain("lease_epoch");

    const gap = ingress({ ...run, sequence: 3, eventType: "heartbeat" });
    await expectProgressError(service.ingest(gap), "RESEARCH_PROGRESS_CONFLICT");
    const expiredLate = ingress({
      ...run,
      sequence: 3,
      eventType: "heartbeat",
      progress: snapshot(run.runId, run.workerAttemptId, run.leaseEpoch, 3, {
        // A source that says its floor is 3 cannot later invent/resend a
        // previously unseen sequence 3. Only a proven immutable duplicate is
        // legal below the exact next cursor.
        retention_floor_sequence: 3,
      }),
    });
    await expectProgressError(service.ingest(expiredLate), "RESEARCH_PROGRESS_CONFLICT");
    const stale = ingress({ ...run, leaseEpoch: run.leaseEpoch + 1, sequence: 2, eventType: "heartbeat" });
    await expectProgressError(service.ingest(stale), "RESEARCH_PROGRESS_STALE_LEASE");

    const second = ingress({ ...run, sequence: 2, eventType: "heartbeat" });
    await service.ingest(second);
    const publicPage = await service.events(scope, run.runId, 0, 500);
    expect(publicPage.events.map((item) => item.sequence)).toEqual([1, 2]);
    expect(JSON.stringify(publicPage)).not.toContain("worker_attempt_id");
    expect(JSON.stringify(publicPage)).not.toContain("lease_epoch");
  });

  it("P11-T04/T05/T06/T12: cancellation wins a source completion race without turning an unsealed run into success", async () => {
    const run = await createDispatchedRun();
    await service.ingest(ingress({ ...run, sequence: 1, eventType: "run_started" }));
    await metadata.requestDurableJobCancellation(scope, { jobId: run.jobId, reason: "operator requested stop" });

    const completed = snapshot(run.runId, run.workerAttemptId, run.leaseEpoch, 2, {
      status: "COMPLETED",
      readiness: { mandatory: "SEALED", optional: "NOT_APPLICABLE" },
      overall: { pct: 100, elapsed_s: 2, eta_s: null, trials_done: 1, trials_declared: 1, tqdm_line: "sealed" },
      mandatory_bundle: { digest: "c".repeat(64), size: "42" },
    });
    await service.ingest(ingress({ ...run, sequence: 2, eventType: "run_completed", progress: completed }));
    const read = await service.read(admin, scope, run.runId);
    expect(read.current).toMatchObject({
      job_state: "CANCELLED",
      effective_status: "CANCELLED",
      terminal_resolution: "CONTROL_CANCELLATION",
    });
    // Source completion remains visible as a source fact, but never becomes a
    // false portal success after cancellation CAS won the race.
    expect(read.progress).toMatchObject({ status: "COMPLETED", readiness: { mandatory: "SEALED" } });
    expect(read.progress).not.toHaveProperty("attempt_id");
    expect(read.progress).not.toHaveProperty("lease_epoch");

    // A current worker identity alone is not permission to append a new,
    // contradictory terminal source fact after Control cancellation closed
    // the job. The cancellation-race completion above is the sole exception;
    // rejection happens before the immutable event insert.
    await expectProgressError(service.ingest(ingress({
      ...run,
      sequence: 3,
      eventType: "run_failed",
      progress: snapshot(run.runId, run.workerAttemptId, run.leaseEpoch, 3, {
        status: "FAILED",
        failure: { code: "ENGINE_ERROR", message: "source contradiction" },
      }),
    })), "RESEARCH_PROGRESS_CONFLICT");
    const immutable = await pool.query<{ source_sequence: string }>(
      `SELECT source_sequence FROM research.run_progress_events
        WHERE workspace_id = $1 AND run_id = $2 ORDER BY source_sequence`,
      [scope.workspaceId, run.runId],
    );
    expect(immutable.rows).toEqual([{ source_sequence: "1" }, { source_sequence: "2" }]);
  });

  it("P11-T06: rejects an unsealed completion at the contract boundary before it can touch P06", async () => {
    const run = await createDispatchedRun();
    const invalid = {
      ...ingress({ ...run, sequence: 1, eventType: "run_completed" }),
      snapshot: snapshot(run.runId, run.workerAttemptId, run.leaseEpoch, 1, {
        status: "COMPLETED",
        readiness: { mandatory: "PENDING", optional: "NOT_APPLICABLE" },
      }),
    };
    expect(ResearchProgressIngressSchema.safeParse(invalid).success).toBe(false);
    const rows = await pool.query(`SELECT 1 FROM research.run_progress_events WHERE workspace_id = $1`, [scope.workspaceId]);
    expect(rows.rowCount).toBe(0);
  });

  it("P13-T01/T03/T05/T09/T13: binds one terminal source receipt, preserves a single revision, and rejects immutable mutation", async () => {
    const run = await createDispatchedRun();
    const evidenceRepository = new ResearchEvidenceRepository(pool);
    const evidenceService = new ResearchEvidenceService(evidenceRepository, {
      ...config,
      FEATURE_RESEARCH_EVIDENCE: "true",
    } as ControlApiConfig);
    const p13Service = new ResearchProgressService(
      progress,
      metadata,
      new ResearchProgressFanout(),
      new FakeProgressPortalClient() as never,
      evidenceService,
      new FakeSplitService() as never,
      new FakeReportService() as never,
      config,
    );
    const source = p13EvidenceSourceFixture();
    const completed = snapshot(run.runId, run.workerAttemptId, run.leaseEpoch, 1, {
      status: "COMPLETED",
      readiness: { mandatory: "SEALED", optional: "NOT_APPLICABLE" },
      overall: { pct: 100, elapsed_s: 2, eta_s: null, trials_done: 1, trials_declared: 1, tqdm_line: "sealed" },
      mandatory_bundle: { digest: "c".repeat(64), size: "42" },
    });
    const terminal = ingress({
      ...run,
      sequence: 1,
      eventType: "run_completed",
      progress: completed,
      evidence: source,
    });

    await p13Service.ingest(terminal);
    // At-least-once terminal delivery must retain the exact receipt/revision,
    // rather than append a second chart or recompute a metric on a read.
    await p13Service.ingest(terminal);

    const hub = await evidenceService.hub(scope, run.runId);
    expect(hub).toMatchObject({
      availability: { state: "AVAILABLE", reason_code: null },
      readiness: "PARTIAL",
      revision: expect.stringMatching(/^p13r1_[0-9a-f]{64}$/),
      etag: expect.stringMatching(/^W\/"p13h1_[0-9a-f]{64}"$/),
    });
    expect(hub.core.run_identity).toMatchObject({
      status: { value: "READY", availability: { state: "AVAILABLE", reason_code: null } },
      binding: {
        alpha_id: P04_DELTA_BINDING.alphaId,
        alpha_name: expect.any(String),
        alpha_version_id: P04_DELTA_BINDING.alphaVersionId,
        availability: { state: "AVAILABLE", reason_code: null },
      },
      created_at_utc_ms: { value: expect.any(Number), availability: { state: "AVAILABLE", reason_code: null } },
      mode: { value: "mode_1_decay", availability: { state: "AVAILABLE", reason_code: null } },
      schedule: { value: "global", availability: { state: "AVAILABLE", reason_code: null } },
      route: {
        id: { value: "signal_notional", availability: { state: "AVAILABLE", reason_code: null } },
        contract: { value: null, availability: { state: "NOT_PUBLISHED", reason_code: "P13_ROUTE_CONTRACT_NOT_PUBLISHED" } },
      },
      config_digest: { value: "a".repeat(64), availability: { state: "AVAILABLE", reason_code: null } },
      seed: { value: null, availability: { state: "NOT_APPLICABLE", reason_code: "P02_RANDOM_SEED_NOT_SELECTED" } },
    });
    expect(hub.core.fold_navigation).toEqual({
      observed_folds: [], published_fold_count: null,
      availability: { state: "NOT_PUBLISHED", reason_code: "P13_PROGRESS_FOLD_SET_NOT_PUBLISHED" },
    });
    expect(hub.metrics.find((metric) => metric.key === "FINAL_EQUITY")).toMatchObject({ value: "110" });
    expect(hub.source_absences.benchmark).toEqual({
      state: "NOT_PUBLISHED",
      reason_code: "P04_SOURCE_DID_NOT_PUBLISH_BENCHMARK",
    });
    const equity = await evidenceService.series(scope, run.runId, "EQUITY_OOS");
    expect(equity).toMatchObject({
      revision: hub.revision,
      source_sample: { source_observation_count: 3, emitted_point_count: 3, sampling: "FULL" },
    });

    const persisted = await pool.query<{ sources: string; projections: string; series: string }>(
      `SELECT
         (SELECT count(*) FROM research.run_evidence_sources_v1 WHERE workspace_id = $1 AND run_id = $2)::text AS sources,
         (SELECT count(*) FROM research.run_evidence_projections_v1 WHERE workspace_id = $1 AND run_id = $2)::text AS projections,
         (SELECT count(*) FROM research.run_evidence_series_v1 WHERE workspace_id = $1 AND run_id = $2)::text AS series`,
      [scope.workspaceId, run.runId],
    );
    expect(persisted.rows[0]).toEqual({ sources: "1", projections: "1", series: "4" });
    await expect(pool.query(
      `UPDATE research.run_evidence_projections_v1
          SET readiness = 'COMPLETE'
        WHERE workspace_id = $1 AND run_id = $2`,
      [scope.workspaceId, run.runId],
    )).rejects.toThrow(/immutable/i);
  });

  it("P14-T01/T04/T06/T10/T13: persists exact current-source chronology and never manufactures holdout authority", async () => {
    const run = await createDispatchedRun();
    const manifest = await pool.query<{ manifest_digest: string }>(
      `SELECT manifest_digest FROM research.run_producers
        WHERE workspace_id = $1 AND run_id = $2 AND worker_attempt_id = $3`,
      [scope.workspaceId, run.runId, run.workerAttemptId],
    );
    const manifestDigest = manifest.rows[0]?.manifest_digest;
    if (!manifestDigest) throw new Error("P14 fixture did not retain immutable producer manifest");
    const splitRepository = new ResearchSplitRepository(pool);
    const splitService = new ResearchSplitService(splitRepository, {
      ...config,
      FEATURE_RESEARCH_SPLIT: "true",
    } as ControlApiConfig);
    const p14Service = new ResearchProgressService(
      progress,
      metadata,
      new ResearchProgressFanout(),
      new FakeProgressPortalClient() as never,
      new FakeEvidenceService() as never,
      splitService,
      new FakeReportService() as never,
      config,
    );
    const source = p14SplitSourceFixture({ manifestDigest });
    const completed = snapshot(run.runId, run.workerAttemptId, run.leaseEpoch, 1, {
      status: "COMPLETED",
      readiness: { mandatory: "SEALED", optional: "NOT_APPLICABLE" },
      overall: { pct: 100, elapsed_s: 2, eta_s: null, trials_done: 1, trials_declared: 1, tqdm_line: "sealed" },
      mandatory_bundle: { digest: "c".repeat(64), size: "42" },
    });
    const terminal = ingress({
      ...run, sequence: 1, eventType: "run_completed", progress: completed, split: source,
    });
    await p14Service.ingest(terminal);
    await p14Service.ingest(terminal); // terminal delivery is at-least-once.

    const detail = await splitService.detail(scope, run.runId);
    expect(detail).toMatchObject({
      availability: { state: "AVAILABLE", reason_code: null },
      readiness: "PARTIAL",
      revision: expect.stringMatching(/^p14r1_[0-9a-f]{64}$/),
      protocol: { kind: "THREE_WINDOW_CURRENT", selection: { state: "FIXED_PROFILE_NO_SEARCH" } },
      actions: { holdout_unlock: { state: "NOT_PUBLISHED", href: null } },
      windows: {
        holdout: {
          child_input_state: "NOT_EXPOSED_TO_CHILD_TAPE",
          evaluation_state: "NOT_EVALUATED",
          result_exposure_state: "NOT_EXPOSED",
        },
      },
    });
    expect(JSON.stringify(detail)).not.toContain("worker_attempt_id");
    expect(JSON.stringify(detail)).not.toContain("lease_epoch");
    expect(JSON.stringify(detail)).not.toContain("source_payload");

    const persisted = await pool.query<{ sources: string; projections: string }>(
      `SELECT
         (SELECT count(*) FROM research.run_split_sources_v1 WHERE workspace_id = $1 AND run_id = $2)::text AS sources,
         (SELECT count(*) FROM research.run_split_projections_v1 WHERE workspace_id = $1 AND run_id = $2)::text AS projections`,
      [scope.workspaceId, run.runId],
    );
    expect(persisted.rows[0]).toEqual({ sources: "1", projections: "1" });
    await expect(pool.query(
      `UPDATE research.run_split_projections_v1
          SET readiness = 'COMPLETE'
        WHERE workspace_id = $1 AND run_id = $2`,
      [scope.workspaceId, run.runId],
    )).rejects.toThrow(/immutable/i);
  });

  it("P15-T01/T03/T06/T08/T11/T13/T14: exposes the exact fixed P04 profile without inventing a study, trial ledger or diagnostics", async () => {
    const run = await createDispatchedRun();
    const manifest = await pool.query<{ manifest_digest: string }>(
      `SELECT manifest_digest FROM research.run_producers
        WHERE workspace_id = $1 AND run_id = $2 AND worker_attempt_id = $3`,
      [scope.workspaceId, run.runId, run.workerAttemptId],
    );
    const manifestDigest = manifest.rows[0]?.manifest_digest;
    if (!manifestDigest) throw new Error("P15 fixture did not retain immutable producer manifest");
    const splitRepository = new ResearchSplitRepository(pool);
    const splitService = new ResearchSplitService(splitRepository, {
      ...config,
      FEATURE_RESEARCH_SPLIT: "true",
    } as ControlApiConfig);
    const p14Service = new ResearchProgressService(
      progress,
      metadata,
      new ResearchProgressFanout(),
      new FakeProgressPortalClient() as never,
      new FakeEvidenceService() as never,
      splitService,
      new FakeReportService() as never,
      config,
    );
    const fixture = p14SplitSourceFixture({ manifestDigest });
    const source = {
      ...fixture,
      protocol: {
        ...fixture.protocol,
        selection: {
          ...fixture.protocol.selection,
          parameter_bundle_digest: sha256ResearchJson(P04_DELTA_FIXED_PARAMETERS),
        },
      },
    };
    const completed = snapshot(run.runId, run.workerAttemptId, run.leaseEpoch, 1, {
      status: "COMPLETED",
      readiness: { mandatory: "SEALED", optional: "NOT_APPLICABLE" },
      overall: { pct: 100, elapsed_s: 2, eta_s: null, trials_done: 1, trials_declared: 1, tqdm_line: "sealed" },
      mandatory_bundle: { digest: "c".repeat(64), size: "42" },
    });
    await p14Service.ingest(ingress({
      ...run, sequence: 1, eventType: "run_completed", progress: completed, split: source,
    }));

    const search = new ResearchSearchService(splitRepository, {
      ...config,
      FEATURE_RESEARCH_SEARCH: "true",
    } as ControlApiConfig);
    const detail = await search.detail(scope, run.runId, { fold: 1 });
    expect(detail).toMatchObject({
      availability: { state: "AVAILABLE", reason_code: null },
      source_profile: { state: "FIXED_PROFILE_NO_SEARCH" },
      requested_optimizer: { state: "DECLARED_NOT_EXECUTED", mode: "mode_1_decay", schedule: "global" },
      fixed_profile: { state: "FIXED_PROFILE_NO_SEARCH", parameters: expect.any(Array) },
      selection: { state: "FIXED_PARAMETER_PROFILE", selected_trial_ref: null },
      inspection: { requested_fold: 1, state: "NOT_APPLICABLE" },
      ledger: {
        state: "NOT_APPLICABLE",
        reason_code: "P04_FIXED_PROFILE_DOES_NOT_CREATE_OPTIMIZER_STUDY",
        total_rows: null,
        sampled_rows: null,
        page: null,
      },
      diagnostics: { state: "NOT_APPLICABLE" },
    });
    expect(detail.fixed_profile.state).toBe("FIXED_PROFILE_NO_SEARCH");
    if (detail.fixed_profile.state !== "FIXED_PROFILE_NO_SEARCH") throw new Error("P15 fixed profile was not published");
    expect(detail.fixed_profile.parameters).toHaveLength(Object.keys(P04_DELTA_FIXED_PARAMETERS).length);
    expect(detail.fixed_profile.parameters.find((parameter) => parameter.name === "slpercent")).toMatchObject({
      minimum: "0.7", maximum: "2.5", step: "0.1", effective_value: "1.3",
    });
    for (const privateNeedle of [
      "worker_attempt_id", "lease_epoch", "source_payload", "artifact_store_path", "market_path", "raw_ohlcv",
    ]) expect(JSON.stringify(detail)).not.toContain(privateNeedle);
    const persisted = await pool.query<{ sources: string; projections: string }>(
      `SELECT
         (SELECT count(*) FROM research.run_split_sources_v1 WHERE workspace_id = $1 AND run_id = $2)::text AS sources,
         (SELECT count(*) FROM research.run_split_projections_v1 WHERE workspace_id = $1 AND run_id = $2)::text AS projections`,
      [scope.workspaceId, run.runId],
    );
    // P15 adds no second source receipt/table and no new worker sidecar: it
    // reads the exact immutable P14 projection already persisted for the run.
    expect(persisted.rows[0]).toEqual({ sources: "1", projections: "1" });
  });

  it("P17-T01/T04/T05/T07/T10/T11/T12/T14: reads bounded sealed OOS samples with revision-bound direct seek and never creates an execution ledger, job or replay state", async () => {
    const run = await createDispatchedRun();
    const evidenceRepository = new ResearchEvidenceRepository(pool);
    const evidenceService = new ResearchEvidenceService(evidenceRepository, {
      ...config,
      FEATURE_RESEARCH_EVIDENCE: "true",
    } as ControlApiConfig);
    const p13Service = new ResearchProgressService(
      progress,
      metadata,
      new ResearchProgressFanout(),
      new FakeProgressPortalClient() as never,
      evidenceService,
      new FakeSplitService() as never,
      new FakeReportService() as never,
      config,
    );
    const completed = snapshot(run.runId, run.workerAttemptId, run.leaseEpoch, 1, {
      status: "COMPLETED",
      readiness: { mandatory: "SEALED", optional: "NOT_APPLICABLE" },
      overall: { pct: 100, elapsed_s: 2, eta_s: null, trials_done: 1, trials_declared: 1, tqdm_line: "sealed" },
      mandatory_bundle: { digest: "c".repeat(64), size: "42" },
    });
    await p13Service.ingest(ingress({
      ...run,
      sequence: 1,
      eventType: "run_completed",
      progress: completed,
      evidence: p13EvidenceSourceFixture(),
    }));

    const replay = new ResearchReplayService(evidenceService, {
      ...config,
      FEATURE_RESEARCH_EVIDENCE: "true",
      FEATURE_RESEARCH_REPLAY: "true",
      QUERY_CURSOR_ACTIVE_KEY_ID: "p17-test",
      QUERY_CURSOR_KEYS_JSON: '{"p17-test":"p17-test-cursor-secret-at-least-thirty-two-bytes"}',
      QUERY_CURSOR_TTL_SECONDS: 600,
    } as ControlApiConfig);
    const first = await replay.detail(scope, run.runId, { limit: 2 });
    expect(first).toMatchObject({
      availability: { state: "AVAILABLE", reason_code: null },
      readiness: "PARTIAL",
      route: {
        id: "signal_notional",
        state: "RETROSPECTIVE_EQUITY_ONLY",
        replay_contract: "P17_CURRENT_P04_EQUITY_SAMPLE_V1",
      },
      equity_replay: {
        state: "AVAILABLE",
        source_observation_count: 3,
        emitted_point_count: 3,
        sampling: "FULL",
        page: { has_more: true, has_previous: false, order: "SOURCE_CHRONOLOGICAL_SAMPLE_ORDINAL_ASC" },
        state_at_cursor: { state: "NOT_SELECTED", semantics: "NO_SELECTED_PLAYHEAD" },
      },
    });
    expect(first.equity_replay.items.map((item) => item.playback_ordinal)).toEqual([0, 1]);
    expect(first.route_capabilities.orders).toMatchObject({
      state: "NOT_PUBLISHED",
      reason_code: "P04_SOURCE_DID_NOT_PUBLISH_EXECUTION_ORDER_LEDGER",
    });
    expect(first.route_capabilities.fills).toMatchObject({
      state: "NOT_PUBLISHED",
      reason_code: "P04_SOURCE_DID_NOT_PUBLISH_AUDITED_FILLS",
    });
    expect(JSON.stringify(first)).not.toMatch(/"(order|fill|trade|position|event)_id"/);

    const selectedCursor = first.equity_replay.items[1]?.playback_cursor;
    if (!selectedCursor) throw new Error("P17 fixture did not issue a direct-seek cursor");
    const direct = await replay.detail(scope, run.runId, { at: selectedCursor, limit: 2 });
    expect(direct.equity_replay.state_at_cursor).toMatchObject({
      state: "AVAILABLE_RETROSPECTIVE_EQUITY_SAMPLE",
      semantics: "RETROSPECTIVE_EQUITY_NOT_EXECUTION_STATE",
      playback_ordinal: 1,
      equity: "98",
      execution_state: {
        state: "NOT_PUBLISHED",
        reason_code: "P04_SOURCE_DID_NOT_PUBLISH_EXECUTION_STATE_SNAPSHOTS",
      },
    });
    expect(direct.equity_replay.items.map((item) => item.playback_ordinal)).toEqual([0, 1]);
    const pageCursor = first.equity_replay.page.next_cursor;
    if (!pageCursor) throw new Error("P17 fixture did not issue a next-page cursor");
    const next = await replay.detail(scope, run.runId, { cursor: pageCursor, limit: 2 });
    expect(next.equity_replay.items.map((item) => item.playback_ordinal)).toEqual([2]);

    const persisted = await pool.query<{
      evidence_sources: string;
      evidence_projections: string;
      replay_table: string | null;
      jobs: string;
      progress_events: string;
    }>(
      `SELECT
         (SELECT count(*) FROM research.run_evidence_sources_v1 WHERE workspace_id = $1 AND run_id = $2)::text AS evidence_sources,
         (SELECT count(*) FROM research.run_evidence_projections_v1 WHERE workspace_id = $1 AND run_id = $2)::text AS evidence_projections,
         to_regclass('research.run_replay_receipts_v1')::text AS replay_table,
         (SELECT count(*) FROM research.run_producers WHERE workspace_id = $1 AND run_id = $2)::text AS jobs,
         (SELECT count(*) FROM research.run_progress_events WHERE workspace_id = $1 AND run_id = $2)::text AS progress_events`,
      [scope.workspaceId, run.runId],
    );
    // P17 is only a bounded reader over the existing P13 receipt. Seeking
    // cannot create a queue item, a replay snapshot or a synthetic execution
    // event sequence; source chronology remains the retained equity sample.
    expect(persisted.rows[0]).toEqual({
      evidence_sources: "1",
      evidence_projections: "1",
      replay_table: null,
      jobs: "1",
      progress_events: "1",
    });
  });

  it("P16-T01/T02/T03/T06/T08/T11/T13/T14: verifies retained current-P04 bindings without creating a freeze receipt, job or source read", async () => {
    const run = await createDispatchedRun();
    const manifest = await pool.query<{ manifest_digest: string }>(
      `SELECT manifest_digest FROM research.run_producers
        WHERE workspace_id = $1 AND run_id = $2 AND worker_attempt_id = $3`,
      [scope.workspaceId, run.runId, run.workerAttemptId],
    );
    const manifestDigest = manifest.rows[0]?.manifest_digest;
    if (!manifestDigest) throw new Error("P16 fixture did not retain immutable producer manifest");
    const splitRepository = new ResearchSplitRepository(pool);
    const splitService = new ResearchSplitService(splitRepository, {
      ...config,
      FEATURE_RESEARCH_SPLIT: "true",
    } as ControlApiConfig);
    const p14Service = new ResearchProgressService(
      progress,
      metadata,
      new ResearchProgressFanout(),
      new FakeProgressPortalClient() as never,
      new FakeEvidenceService() as never,
      splitService,
      new FakeReportService() as never,
      config,
    );
    const fixture = p14SplitSourceFixture({ manifestDigest });
    const source = {
      ...fixture,
      protocol: {
        ...fixture.protocol,
        selection: {
          ...fixture.protocol.selection,
          parameter_bundle_digest: sha256ResearchJson(P04_DELTA_FIXED_PARAMETERS),
        },
      },
    };
    const completed = snapshot(run.runId, run.workerAttemptId, run.leaseEpoch, 1, {
      status: "COMPLETED",
      readiness: { mandatory: "SEALED", optional: "NOT_APPLICABLE" },
      overall: { pct: 100, elapsed_s: 2, eta_s: null, trials_done: 1, trials_declared: 1, tqdm_line: "sealed" },
      mandatory_bundle: { digest: "c".repeat(64), size: "42" },
    });
    await p14Service.ingest(ingress({
      ...run, sequence: 1, eventType: "run_completed", progress: completed, split: source,
    }));

    const freeze = new ResearchFreezeService(splitRepository, {
      ...config,
      FEATURE_RESEARCH_FREEZE: "true",
    } as ControlApiConfig);
    const detail = await freeze.detail(scope, run.runId, { fold: 1 });
    expect(detail).toMatchObject({
      availability: { state: "AVAILABLE", reason_code: null },
      readiness: "PARTIAL",
      revision: expect.stringMatching(/^p16r1_[0-9a-f]{64}$/),
      freeze: {
        inspection: { requested_fold: 1, state: "NOT_APPLICABLE" },
        selection: { state: "FIXED_PARAMETER_PROFILE", selected_trial_ref: null, selection_artifact_ref: null },
        ordering: { state: "NOT_ASSERTED", data_time: { chronology_kind: "THREE_WINDOW_CURRENT" } },
        integrity: {
          state: "PARTIAL",
          verification_scope: "PORTAL_RETAINED_DIGEST_BINDING_ONLY",
          source_artifact_bytes: { state: "NOT_ATTESTED" },
        },
        what_if: { state: "NOT_APPLICABLE", actions: { diagnostic_evaluate: { may_submit: false }, sibling_draft: { may_create: false } } },
      },
    });
    expect(detail.freeze.integrity.checks.map((check) => check.state)).toEqual(["MATCH", "MATCH", "MATCH"]);
    expect(detail.freeze.frozen_parameters).toHaveLength(Object.keys(P04_DELTA_FIXED_PARAMETERS).length);
    await expect(freeze.verify(scope, run.runId, { fold: 1 })).resolves.toMatchObject({
      result: "PARTIAL_MATCH", freeze_revision: detail.revision,
    });
    expect(JSON.stringify(detail)).not.toMatch(/"worker_attempt_id"|"lease_epoch"|"artifact_store_path"|"raw_ohlcv"|"diagnostic_job"/);

    const persisted = await pool.query<{ sources: string; projections: string; freeze_table: string | null }>(
      `SELECT
         (SELECT count(*) FROM research.run_split_sources_v1 WHERE workspace_id = $1 AND run_id = $2)::text AS sources,
         (SELECT count(*) FROM research.run_split_projections_v1 WHERE workspace_id = $1 AND run_id = $2)::text AS projections,
         to_regclass('research.run_freeze_receipts_v1')::text AS freeze_table`,
      [scope.workspaceId, run.runId],
    );
    // P16 does not persist a new “verification” row and cannot enqueue work:
    // it reads the one immutable P14 receipt already retained for the run.
    expect(persisted.rows[0]).toEqual({ sources: "1", projections: "1", freeze_table: null });
  });
});
