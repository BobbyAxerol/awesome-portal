import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "../../apps/control-api/node_modules/pg";

import type { ControlApiConfig } from "../../apps/control-api/src/config";
import type { PortalUser } from "../../apps/control-api/src/domain";
import type { ResearchScope } from "../../apps/control-api/src/research/contracts";
import { P04_DELTA_BINDING } from "../../apps/control-api/src/research/p04-delta.binding";
import { ResearchP04DeltaBindingService } from "../../apps/control-api/src/research/p04-delta-binding.service";
import { sha256ResearchJson } from "../../apps/control-api/src/research/preflight.service";
import type { ResearchRequestedSpec } from "../../apps/control-api/src/research/preflight.contract";
import { ResearchMetadataRepository } from "../../apps/control-api/src/research/repository";
import { ResearchRunAdmissionService } from "../../apps/control-api/src/research/run-admission.service";
import { ResearchRunCreateError } from "../../apps/control-api/src/research/run-create.error";
import { ResearchRunCreateService } from "../../apps/control-api/src/research/run-create.service";
import { migrateTestDatabase, truncateAll } from "../../apps/control-api/test/harness";

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const scope: ResearchScope = { workspaceId: "p10-workspace", actorUserId: "p10-admin" };
const memberScope: ResearchScope = { workspaceId: "p10-workspace", actorUserId: "p10-member" };

const admin: PortalUser = {
  userId: scope.actorUserId, username: "p10-admin", displayName: "P10 Admin", role: "ADMIN", status: "ACTIVE",
  mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, sessionVersion: 1,
  createdAt: new Date("2026-09-21T00:00:00.000Z"), updatedAt: new Date("2026-09-21T00:00:00.000Z"),
  disabledAt: null, accountRevision: 1, archivedAt: null,
};

const member: PortalUser = {
  ...admin,
  userId: memberScope.actorUserId,
  username: "p10-member",
  displayName: "P10 Member",
  role: "USER",
};

const config = {
  FEATURE_RESEARCH_RUN_PRODUCER: "true",
  RESEARCH_RUN_PRODUCER_LEASE_SECONDS: 15,
} as ControlApiConfig;

function requested(overrides: Partial<ResearchRequestedSpec> = {}): ResearchRequestedSpec {
  return {
    schema_version: "research.requested-spec.v1",
    alpha_binding: {
      alpha_id: P04_DELTA_BINDING.alphaId,
      alpha_version_id: P04_DELTA_BINDING.alphaVersionId,
    },
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
    ...overrides,
  } as ResearchRequestedSpec;
}

async function seedIdentity(pool: Pool): Promise<void> {
  await pool.query(
    `INSERT INTO portal_users (user_id, username, display_name, role, status, must_change_password)
     VALUES ($1, 'p10-admin', 'P10 Admin', 'ADMIN', 'ACTIVE', false),
            ($2, 'p10-member', 'P10 Member', 'USER', 'ACTIVE', false)`,
    [scope.actorUserId, memberScope.actorUserId],
  );
  await pool.query(
    `INSERT INTO workspaces (workspace_id, name, owner_user_id)
     VALUES ($1, 'P10 Workspace', $2)`,
    [scope.workspaceId, scope.actorUserId],
  );
  await pool.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role)
     VALUES ($1, $2, 'OWNER'), ($1, $3, 'MEMBER')`,
    [scope.workspaceId, scope.actorUserId, memberScope.actorUserId],
  );
}

async function seedManifest(
  repository: ResearchMetadataRepository,
  actorScope: ResearchScope,
  spec: ResearchRequestedSpec,
  token = "rpft_p10_immutable_manifest",
): Promise<void> {
  const requestedDigest = sha256ResearchJson(spec);
  const effectiveSpec = {
    schema_version: "research.effective-spec.v1",
    requested_spec_digest: requestedDigest,
    engine: {
      engine_release_id: "er_quantbt_111",
      execution_route: "signal_notional",
    },
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
  await repository.storePreflightManifest(actorScope, {
    preflightToken: token,
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
  mode: "accept" | "throw" | "reject" = "accept";
  calls: Array<Record<string, unknown>> = [];

  async handleWrite(input: Record<string, unknown>) {
    this.calls.push(input);
    if (this.mode === "throw") throw new Error("simulated private-hop loss");
    if (this.mode === "reject") return { status: 403, body: { error: "rejected" }, idempotencyKey: input.idempotencyKey, replayed: false };
    const body = JSON.parse(String(input.body)) as { run_id: string };
    return { status: 202, body: { run_id: body.run_id }, idempotencyKey: input.idempotencyKey, replayed: false };
  }
}

function createService(repository: ResearchMetadataRepository, proxy: FakePrivatePortalProxy): ResearchRunCreateService {
  const admission = new ResearchRunAdmissionService(repository, config);
  return new ResearchRunCreateService(repository, admission, proxy as never, config);
}

async function expectP10Error(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ResearchRunCreateError);
    expect((error as ResearchRunCreateError).code).toBe(code);
    return;
  }
  throw new Error(`Expected P10 ${code}.`);
}

describe("Research Loop P10 · New Run durable producer", () => {
  let pool: Pool;
  let repository: ResearchMetadataRepository;

  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL);
    pool = new Pool({ connectionString: DATABASE_URL });
    repository = new ResearchMetadataRepository(pool);
  }, 60_000);

  afterEach(async () => { await truncateAll(pool); });
  afterAll(async () => { await pool?.end(); });

  async function installAndManifest(spec = requested()): Promise<void> {
    await seedIdentity(pool);
    await new ResearchP04DeltaBindingService(repository).install(admin, scope);
    await seedManifest(repository, scope, spec);
  }

  it("P10-T01/T02/T03: installs only the compiled immutable P04 binding and replays it exactly", async () => {
    await seedIdentity(pool);
    const binding = new ResearchP04DeltaBindingService(repository);
    const first = await binding.install(admin, scope);
    const replay = await binding.install(admin, scope);
    expect(first).toMatchObject({
      alpha_id: P04_DELTA_BINDING.alphaId,
      alpha_version_id: P04_DELTA_BINDING.alphaVersionId,
      execution_adapter_id: "p04.delta-rsi.v1",
      replayed: false,
    });
    expect(replay).toMatchObject({ adapter_contract_digest: first.adapter_contract_digest, replayed: true });
    const row = await pool.query(
      `SELECT source_file_ref, lifecycle_state, adapter_id, contract_digest
         FROM research.alpha_versions version
         JOIN research.execution_adapter_bindings binding
           ON binding.workspace_id = version.workspace_id AND binding.alpha_version_id = version.alpha_version_id
        WHERE version.workspace_id = $1`,
      [scope.workspaceId],
    );
    expect(row.rows).toEqual([{
      source_file_ref: null,
      lifecycle_state: "ACTIVE",
      adapter_id: "p04.delta-rsi.v1",
      contract_digest: first.adapter_contract_digest,
    }]);
    // P08 must be able to read the installed server binding's declared data
    // requirements without pretending it has a user import receipt. This is
    // the narrow additive exception in loadAlphaVersionDataContract.
    await expect(repository.loadAlphaVersionDataContract(
      scope,
      P04_DELTA_BINDING.alphaId,
      P04_DELTA_BINDING.alphaVersionId,
    )).resolves.toMatchObject({
      alphaId: P04_DELTA_BINDING.alphaId,
      alphaVersionId: P04_DELTA_BINDING.alphaVersionId,
      declaredContract: {
        required_columns: ["open", "high", "low", "close", "volume"],
        warmup_bars: 300,
      },
    });
  });

  it("P10-T04/T05/T06/T08: persists one immutable intent before the signed compatibility hop and replays it", async () => {
    await installAndManifest();
    const proxy = new FakePrivatePortalProxy();
    const service = createService(repository, proxy);
    const input = {
      schema_version: "research.run-create.v1" as const,
      client_intent_id: "p10-intent-accepted",
      preflight_token: "rpft_p10_immutable_manifest",
      requested_spec: requested(),
      intent_kind: "NEW" as const,
    };
    const accepted = await service.create(admin, scope, input, "p10-request-a");
    const replay = await service.create(admin, scope, input, "p10-request-b");
    expect(accepted.status).toBe("QUEUED");
    expect(replay).toMatchObject({ run_id: accepted.run_id, replayed: true });
    expect(proxy.calls).toHaveLength(1);
    const privateBody = JSON.parse(String(proxy.calls[0]?.body)) as Record<string, unknown>;
    expect(privateBody).toMatchObject({
      run_id: accepted.run_id,
      strategy_id: P04_DELTA_BINDING.alphaId,
      protocol: "three_window_decay",
    });
    expect(privateBody).not.toHaveProperty("snapshot_path");
    expect(privateBody).not.toHaveProperty("source_file_ref");
    expect((privateBody.research as Record<string, unknown>).p04_parameters).toEqual(P04_DELTA_BINDING.fixedParameters);
    const durable = await pool.query(
      `SELECT producer.dispatch_state, attempt.state AS attempt_state, run.state AS run_state,
              job.state AS job_state, producer.legacy_request
         FROM research.run_producers producer
         JOIN research.attempts attempt ON attempt.workspace_id = producer.workspace_id AND attempt.attempt_id = producer.attempt_id
         JOIN research.runs run ON run.workspace_id = producer.workspace_id AND run.run_id = producer.run_id
         JOIN research.jobs job ON job.workspace_id = producer.workspace_id AND job.job_id = producer.job_id
        WHERE producer.workspace_id = $1`,
      [scope.workspaceId],
    );
    expect(durable.rows).toHaveLength(1);
    expect(durable.rows[0]).toMatchObject({
      dispatch_state: "DISPATCHED",
      attempt_state: "CLAIMED",
      run_state: "RUNNING",
      job_state: "CLAIMED",
    });
    expect(JSON.stringify(durable.rows[0].legacy_request)).not.toContain("frame.parquet");
  });

  it("P10-T07/T09/T10: rejects non-admin callers, stale specs and unsupported rich-wizard values before private dispatch", async () => {
    await installAndManifest();
    const proxy = new FakePrivatePortalProxy();
    const service = createService(repository, proxy);
    const base = {
      schema_version: "research.run-create.v1" as const,
      client_intent_id: "p10-intent-denied",
      preflight_token: "rpft_p10_immutable_manifest",
      requested_spec: requested(),
      intent_kind: "NEW" as const,
    };
    // Another actor's opaque token deliberately looks absent rather than
    // leaking that an ADMIN owns it.
    await expectP10Error(service.create(member, memberScope, base, "p10-member"), "RESEARCH_RUN_NOT_FOUND");
    await seedManifest(repository, memberScope, requested(), "rpft_p10_member_manifest");
    await expectP10Error(service.create(member, memberScope, {
      ...base,
      client_intent_id: "p10-intent-member-owned",
      preflight_token: "rpft_p10_member_manifest",
    }, "p10-member-owned"), "RESEARCH_RUN_CREATE_FORBIDDEN");
    await expectP10Error(service.create(admin, scope, {
      ...base,
      client_intent_id: "p10-intent-stale",
      requested_spec: requested({ random_seed: 7 }),
    }, "p10-stale"), "RESEARCH_RUN_PREFLIGHT_STALE");
    await expectP10Error(service.create(admin, scope, {
      ...base,
      client_intent_id: "p10-intent-unsupported",
      requested_spec: requested({ optuna_trials: 2 }),
    }, "p10-unsupported"), "RESEARCH_RUN_PREFLIGHT_STALE");
    const unsupported = requested({ optuna_trials: 2 });
    await seedManifest(repository, scope, unsupported, "rpft_p10_unsupported_manifest");
    await expectP10Error(service.create(admin, scope, {
      ...base,
      client_intent_id: "p10-intent-unsupported-current",
      preflight_token: "rpft_p10_unsupported_manifest",
      requested_spec: unsupported,
    }, "p10-unsupported-current"), "RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE");
    expect(proxy.calls).toHaveLength(0);
    expect((await pool.query(`SELECT * FROM research.run_producers`)).rowCount).toBe(0);
  });

  it("P10-T11/T12: transport-unknown leaves one recoverable intent and a later exact retry takes a fresh fenced lease", async () => {
    await installAndManifest();
    const proxy = new FakePrivatePortalProxy();
    proxy.mode = "throw";
    const service = createService(repository, proxy);
    const input = {
      schema_version: "research.run-create.v1" as const,
      client_intent_id: "p10-intent-recover",
      preflight_token: "rpft_p10_immutable_manifest",
      requested_spec: requested(),
      intent_kind: "NEW" as const,
    };
    await expectP10Error(service.create(admin, scope, input, "p10-lost"), "RESEARCH_RUN_TRANSPORT_UNKNOWN");
    const first = await pool.query<{ job_id: string; worker_attempt_id: string; lease_epoch: string }>(
      `SELECT producer.job_id, producer.worker_attempt_id, producer.lease_epoch
         FROM research.run_producers producer WHERE producer.workspace_id = $1`,
      [scope.workspaceId],
    );
    expect(first.rows[0]?.worker_attempt_id).toBeTruthy();
    await pool.query(
      `UPDATE research.worker_attempts
          SET expires_at = now() - interval '1 second'
        WHERE workspace_id = $1 AND worker_attempt_id = $2`,
      [scope.workspaceId, first.rows[0]?.worker_attempt_id],
    );
    expect(await repository.recoverExpiredDurableJobs(scope)).toEqual({ recovered: 1, terminal: 0 });
    // Recovery intentionally applies a one-second anti-hot-loop delay. The
    // test advances only its disposable cell past that documented fence.
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    proxy.mode = "accept";
    const recovered = await service.create(admin, scope, input, "p10-recover");
    expect(recovered).toMatchObject({ status: "QUEUED", replayed: true });
    expect(proxy.calls).toHaveLength(2);
    const second = await pool.query<{ worker_attempt_id: string; lease_epoch: string; dispatch_state: string }>(
      `SELECT worker_attempt_id, lease_epoch, dispatch_state FROM research.run_producers WHERE workspace_id = $1`,
      [scope.workspaceId],
    );
    expect(second.rows[0]).toMatchObject({ dispatch_state: "DISPATCHED" });
    expect(second.rows[0]?.worker_attempt_id).not.toBe(first.rows[0]?.worker_attempt_id);
  });
});
