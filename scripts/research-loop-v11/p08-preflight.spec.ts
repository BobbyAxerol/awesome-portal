import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "../../apps/control-api/node_modules/pg";

import type { ControlApiConfig } from "../../apps/control-api/src/config";
import type { PortalUser } from "../../apps/control-api/src/domain";
import {
  ResearchPreflightPrivateResponseSchema,
  type ResearchPreflightPrivateResponse,
  type ResearchRequestedSpec,
} from "../../apps/control-api/src/research/preflight.contract";
import { ResearchPreflightError } from "../../apps/control-api/src/research/preflight.error";
import { ResearchPreflightService, sha256ResearchJson } from "../../apps/control-api/src/research/preflight.service";
import type { ResearchPreflightSnapshotClient } from "../../apps/control-api/src/research/preflight.client";
import { type ResearchScope, ResearchMetadataError } from "../../apps/control-api/src/research/contracts";
import { ResearchMetadataRepository } from "../../apps/control-api/src/research/repository";
import { migrateTestDatabase, truncateAll } from "../../apps/control-api/test/harness";

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const scopeA: ResearchScope = { workspaceId: "p08-workspace", actorUserId: "p08-user-a" };
const scopeB: ResearchScope = { workspaceId: "p08-workspace", actorUserId: "p08-user-b" };
const scopeOther: ResearchScope = { workspaceId: "p08-other-workspace", actorUserId: "p08-user-b" };
const digest = (seed: string): string => sha256ResearchJson({ seed });

const admin: PortalUser = {
  userId: scopeA.actorUserId, username: "p08-user-a", displayName: "P08 User A", role: "ADMIN", status: "ACTIVE",
  mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, sessionVersion: 1,
  createdAt: new Date("2026-09-20T00:00:00.000Z"), updatedAt: new Date("2026-09-20T00:00:00.000Z"),
  disabledAt: null, accountRevision: 1, archivedAt: null,
};

function requested(overrides: Partial<ResearchRequestedSpec> = {}): ResearchRequestedSpec {
  return {
    schema_version: "research.requested-spec.v1",
    alpha_binding: null,
    not_publishable: true,
    strategy_id: "p08-alpha",
    execution_route: "signal_notional",
    route_params: {},
    data: { dataset_id: "crypto-binance-1m", symbol: "BTCUSDT", timeframe: "1h" },
    protocol: "three_window_decay",
    windows: {
      is: { start: "2026-01-04T00:00:00", end_exclusive: "2026-01-10T00:00:00" },
      oos: { start: "2026-01-10T00:00:00", end_exclusive: "2026-01-14T00:00:00" },
      holdout: { start: "2026-01-14T00:00:00", end_exclusive: "2026-01-18T00:00:00" },
    },
    optimization_mode: "mode_1_decay", optimization_schedule: "global", parameter_space_overrides: [],
    optuna_trials: 8, early_stopping: null, random_seed: 42, optimization_config: {},
    client: { engine_release_id: "er_quantbt_111", config_digest: "a".repeat(64) },
    ...overrides,
  } as ResearchRequestedSpec;
}

function privateResponse(spec: ResearchRequestedSpec): ResearchPreflightPrivateResponse {
  const requestedSpecDigest = sha256ResearchJson(spec);
  const capability = {
    engine_release_id: "er_quantbt_111", engine_catalog_digest: "b".repeat(64), execution_route: "signal_notional",
    required_input_class: "candle", route_axes: { engine: "SUPPORTED", integration: "ADAPTER_AVAILABLE", evidence: "EVIDENCE_MAPPED", admission: "P04_BASELINE_ONLY" },
    preflight_admission: "PREFLIGHT_ONLY" as const, optimization_mode: "mode_1_decay", optimization_schedule: "global",
  };
  const range = { start_utc: "2026-01-04T00:00:00+00:00", end_exclusive_utc: "2026-01-10T00:00:00+00:00", start_utc_ms: 1_767_484_800_000, end_exclusive_utc_ms: 1_768_003_200_000, bars: 144 };
  const topology: ResearchPreflightPrivateResponse["topology"] = {
    protocol: "three_window_decay", topology_digest: digest("topology"),
    folds: [{ fold_id: "fold_000", train: range, outer_oos: { ...range, start_utc: "2026-01-10T00:00:00+00:00", end_exclusive_utc: "2026-01-14T00:00:00+00:00", start_utc_ms: 1_768_003_200_000, end_exclusive_utc_ms: 1_768_348_800_000, bars: 96 }, state: "BOUNDARY_FIXED_NOT_EVALUATED" }],
    sealed_holdout: { ...range, start_utc: "2026-01-14T00:00:00+00:00", end_exclusive_utc: "2026-01-18T00:00:00+00:00", start_utc_ms: 1_768_348_800_000, end_exclusive_utc_ms: 1_768_694_400_000, bars: 96, evaluation_state: "NOT_EVALUATED", snapshot_read_state: "OPAQUE_SNAPSHOT_ONLY", disclosure: "Snapshot integrity metadata only; no raw sealed-holdout values are returned." },
  };
  const dataBinding = {
    snapshot_id: "dss_0123456789abcdef0123456789abcdef", snapshot_content_hash: "c".repeat(64), market_content_hash: "d".repeat(64), source_manifest_digest: "e".repeat(64), timezone: "UTC", calendar_policy: "CRYPTO_24_7", closed_bar_policy: "CLOSED_BARS_ONLY" as const, columns: ["open", "high", "low", "close", "volume"], warmup_bars: 0, range_start_utc_ms: 1_767_484_800_000, range_end_exclusive_utc_ms: 1_768_694_400_000,
  };
  const effectiveSpec: ResearchPreflightPrivateResponse["effective_spec"] = {
    schema_version: "research.effective-spec.v1", requested_spec_digest: requestedSpecDigest, engine: capability, data_binding: dataBinding, topology,
    optimization: { mode: "mode_1_decay", schedule: "global", trial_count: spec.optuna_trials, early_stopping: spec.early_stopping, random_seed: spec.random_seed, scope: "per_study_per_fold_per_seed" },
    intent: { kind: "NEW", reproduction_semantics: "P10 supplies archived effective inputs.", upgrade_semantics: "P10 creates an explicit upgrade." },
  };
  const datasetBinding: ResearchPreflightPrivateResponse["dataset_binding"] = {
    schema_version: "research.dataset-binding.v1", snapshot_id: dataBinding.snapshot_id,
    snapshot_content_hash: dataBinding.snapshot_content_hash, market_content_hash: dataBinding.market_content_hash,
    source_manifest_digest: dataBinding.source_manifest_digest, dataset_id: "crypto-binance-1m", symbol: "BTCUSDT", timeframe: "1h",
    range_start_utc_ms: dataBinding.range_start_utc_ms, range_end_exclusive_utc_ms: dataBinding.range_end_exclusive_utc_ms,
    timezone: dataBinding.timezone, calendar_policy: dataBinding.calendar_policy, closed_bar_policy: dataBinding.closed_bar_policy,
  };
  return {
    schema_version: "research.preflight-snapshot.v1", requested_spec_digest: requestedSpecDigest,
    effective_spec: effectiveSpec, effective_spec_digest: sha256ResearchJson(effectiveSpec),
    dataset_binding: datasetBinding, dataset_binding_digest: sha256ResearchJson(datasetBinding),
    snapshot: {
      snapshot_id: "dss_0123456789abcdef0123456789abcdef", snapshot_content_hash: "c".repeat(64), market_content_hash: "d".repeat(64), source_manifest_digest: "e".repeat(64),
      row_count: 336, byte_count: 16_384, query: range, logical_range: range, warmup: { ...range, requested_bars: 0, state: "BOUNDARY_ONLY_NOT_FIT" },
      timezone: "UTC", calendar_policy: "CRYPTO_24_7", closed_bar_policy: "CLOSED_BARS_ONLY", columns: ["open", "high", "low", "close", "volume"],
      quality: { passed: true, rows: 336, gaps: 0, duplicates: 0, gap_ratio: 0, reason_codes: [], missing_bar_count: 0, state: "SNAPSHOT_INTEGRITY_ONLY" }, provenance: { loader_contract: "hmd-loader-v1" },
    },
    topology, resource_estimate: { schema_version: "research.resource-estimate.v1", scope: "per_study_per_fold_per_seed; no product-wide trial claim is implied", trial_count: spec.optuna_trials, seed_count: 1, outer_fold_count: 1, evaluation_count: spec.optuna_trials, raw_frame_bytes: 16_384, snapshot_bytes: 16_384, estimated_memory_bytes: 8_388_608, estimated_scratch_bytes: 32_768, estimated_cpu_seconds: 1, admission_state: "PREFLIGHT_WITHIN_P10_DECLARATION_CEILING", disclosure: "Estimate only. P10 must reserve worker resources." },
    capability,
  };
}

class FakeSnapshotClient {
  calls: Array<{ requiredColumns: readonly string[]; warmupBars: number; requiresFunding: boolean }> = [];
  response: ResearchPreflightPrivateResponse | null = null;
  async create(_user: PortalUser, input: { requestedSpec: Record<string, unknown>; requiredColumns: readonly string[]; warmupBars: number; requiresFunding: boolean }): Promise<ResearchPreflightPrivateResponse> {
    this.calls.push(input);
    return this.response ?? privateResponse(input.requestedSpec as ResearchRequestedSpec);
  }
}

async function expectResearchError<T>(promise: Promise<T>, code: string): Promise<void> {
  try { await promise; } catch (error) {
    expect(error).toBeInstanceOf(ResearchMetadataError);
    expect((error as ResearchMetadataError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ResearchMetadataError ${code}.`);
}

describe("Research Loop P08 · data snapshots, effective spec and preflight", () => {
  let pool: Pool;
  let repository: ResearchMetadataRepository;
  let service: ResearchPreflightService;
  let client: FakeSnapshotClient;

  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL);
    pool = new Pool({ connectionString: DATABASE_URL });
    repository = new ResearchMetadataRepository(pool);
    client = new FakeSnapshotClient();
    service = new ResearchPreflightService(repository, client as unknown as ResearchPreflightSnapshotClient, {
      RESEARCH_PREFLIGHT_TTL_SECONDS: 600,
      RESEARCH_PREFLIGHT_MAXIMUM_ACTIVE_MANIFESTS_PER_ACTOR: 2,
    } as ControlApiConfig);
  }, 60_000);

  afterEach(async () => { await truncateAll(pool); client.calls = []; client.response = null; });
  afterAll(async () => { await pool?.end(); });

  async function seedIdentity(): Promise<void> {
    await pool.query(
      `INSERT INTO portal_users (user_id, username, display_name, role, status, must_change_password)
       VALUES ($1, 'p08-user-a', 'P08 User A', 'ADMIN', 'ACTIVE', false),
              ($2, 'p08-user-b', 'P08 User B', 'USER', 'ACTIVE', false)`,
      [scopeA.actorUserId, scopeB.actorUserId],
    );
    await pool.query(`INSERT INTO workspaces (workspace_id, name, owner_user_id) VALUES ($1, 'P08 Workspace', $2)`, [scopeA.workspaceId, scopeA.actorUserId]);
    await pool.query(`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'OWNER'), ($1, $3, 'MEMBER')`, [scopeA.workspaceId, scopeA.actorUserId, scopeB.actorUserId]);
  }

  it("P08 fixture itself satisfies the generated private manifest shape", () => {
    const parsed = ResearchPreflightPrivateResponseSchema.safeParse(privateResponse(requested()));
    if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
    expect(parsed.data.schema_version).toBe("research.preflight-snapshot.v1");
  });

  it("P08 canonical SHA is byte-compatible with Python sort_keys for mixed-case metadata", () => {
    // Generated once by Python `sha256_json`; this protects the cross-service
    // manifest pin from locale-sensitive JavaScript sorting.
    expect(sha256ResearchJson({ z: 1, A: 2, _: 3, a: { Z: 4, b: 5 } }))
      .toBe("d09a8f29f320a43a007393ba817b1bf83bf4ea93ebffdcf218052c8725913d07");
  });

  it("P08-T06/T10/T12: persists the exact requested/effective/data manifest and rejects material token reuse", async () => {
    await seedIdentity();
    const spec = requested();
    const result = await service.create(admin, scopeA, spec, "p08-request");
    expect(result).toMatchObject({ schema_version: "research.preflight.v1", may_create_run: false, requested_spec_digest: sha256ResearchJson(spec), capability: { preflight_admission: "PREFLIGHT_ONLY" } });
    expect(result.snapshot.closed_bar_policy).toBe("CLOSED_BARS_ONLY");
    expect(client.calls[0]).toMatchObject({ requiredColumns: ["open", "high", "low", "close", "volume"], warmupBars: 0, requiresFunding: false });
    expect(await service.get(scopeA, result.preflight_token)).toMatchObject({ manifest_digest: result.manifest_digest, may_create_run: false });
    await expectResearchError(
      service.assertFreshForRequestedSpec(scopeA, result.preflight_token, requested({ random_seed: 43 })),
      "RESEARCH_PREFLIGHT_STALE",
    );
  });

  it("P08-T05/T08/T11: database metadata contains no HMD rows or sealed-holdout evaluation", async () => {
    await seedIdentity();
    const result = await service.create(admin, scopeA, requested(), "p08-request");
    const row = await pool.query(
      `SELECT requested_spec, effective_spec, dataset_binding, topology, resource_estimate, snapshot
         FROM research.preflight_manifests WHERE workspace_id = $1 AND preflight_token = $2`,
      [scopeA.workspaceId, result.preflight_token],
    );
    const encoded = JSON.stringify(row.rows[0]);
    expect(encoded).not.toContain("frame.parquet");
    expect(encoded).not.toContain('"points"');
    expect(encoded).toContain("NOT_EVALUATED");
    expect(encoded).toContain("OPAQUE_SNAPSHOT_ONLY");
  });

  it("P08 rejects a structurally valid but digest-tampered stored manifest before browser materialization", async () => {
    await seedIdentity();
    const created = await service.create(admin, scopeA, requested(), "p08-storage-tamper");
    const row = (await pool.query(
      `SELECT workspace_id, preflight_token, actor_user_id, requested_spec_digest,
              effective_spec_digest, dataset_binding_digest, requested_spec,
              effective_spec, dataset_binding, topology, resource_estimate,
              snapshot, expires_at
         FROM research.preflight_manifests
        WHERE workspace_id = $1 AND preflight_token = $2`,
      [scopeA.workspaceId, created.preflight_token],
    )).rows[0];
    await pool.query(
      `DELETE FROM research.preflight_manifests
        WHERE workspace_id = $1 AND preflight_token = $2`,
      [scopeA.workspaceId, created.preflight_token],
    );
    await pool.query(
      `INSERT INTO research.preflight_manifests
         (workspace_id, preflight_token, actor_user_id, requested_spec_digest,
          effective_spec_digest, dataset_binding_digest, manifest_digest,
          requested_spec, effective_spec, dataset_binding, topology,
          resource_estimate, snapshot, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7,
               $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb,
               $12::jsonb, $13::jsonb, $14)`,
      [
        row.workspace_id, row.preflight_token, row.actor_user_id,
        row.requested_spec_digest, row.effective_spec_digest,
        row.dataset_binding_digest, "0".repeat(64),
        JSON.stringify(row.requested_spec), JSON.stringify(row.effective_spec),
        JSON.stringify(row.dataset_binding), JSON.stringify(row.topology),
        JSON.stringify(row.resource_estimate), JSON.stringify(row.snapshot),
        row.expires_at,
      ],
    );
    await expect(service.get(scopeA, created.preflight_token)).rejects.toMatchObject({
      code: "RESEARCH_PREFLIGHT_REJECTED",
    } satisfies Partial<ResearchPreflightError>);
  });

  it("P08-T01/T04: AlphaVersion data requirements are exact, workspace-local and never browser-authored", async () => {
    await seedIdentity();
    const future = new Date(Date.now() + 60_000).toISOString();
    await pool.query(
      `INSERT INTO research.import_sources (workspace_id, source_file_ref, actor_user_id, original_filename, source_bytes, source_digest, source_schema_version, analysis_digest, declared_contract, parsed_mirror, expires_at)
       VALUES ($1, 'p08-source', $2, 'alpha.py', $3, $4, 'research.alpha-source.v1', $5,
               $6::jsonb, '[]'::jsonb, $7)`,
      [scopeA.workspaceId, scopeA.actorUserId, Buffer.from("source"), "f".repeat(64), "a".repeat(64), JSON.stringify({ schema_version: "research.alpha-source.v1", version: "0.1.0", entrypoint: "generate", timeframes: ["1h"], required_columns: ["open", "close"], warmup_bars: 7, determinism: { seed_required: true }, parameter_space: {} }), future],
    );
    await pool.query(`INSERT INTO research.alphas (workspace_id, alpha_id, name, owner_user_id, execution_subject_id) VALUES ($1, 'p08-alpha', 'P08 Alpha', $2, 'research:p08-alpha')`, [scopeA.workspaceId, scopeA.actorUserId]);
    await pool.query(
      `INSERT INTO research.alpha_versions (workspace_id, alpha_version_id, alpha_id, code_digest, entrypoint, dependency_ref, declared_contract, source_file_ref, lifecycle_state, registered_by_user_id)
       VALUES ($1, 'av_p08_alpha_0_1_0', 'p08-alpha', $2, 'generate', 'research.alpha-source.v1', $3::jsonb, 'p08-source', 'DRAFT', $4)`,
      [scopeA.workspaceId, "f".repeat(64), JSON.stringify({ schema_version: "research.alpha-source.v1", version: "0.1.0", entrypoint: "generate", timeframes: ["1h"], required_columns: ["open", "close"], warmup_bars: 7, determinism: { seed_required: true }, parameter_space: {} }), scopeA.actorUserId],
    );
    const spec = requested({ alpha_binding: { alpha_id: "p08-alpha", alpha_version_id: "av_p08_alpha_0_1_0" }, not_publishable: false });
    await service.create(admin, scopeA, spec, "p08-request");
    expect(client.calls[0]).toMatchObject({ requiredColumns: ["open", "close"], warmupBars: 7 });
    // An imported AlphaVersion is deliberately reusable by another member of
    // the same workspace, but it must never cross a workspace boundary.
    await pool.query(`INSERT INTO workspaces (workspace_id, name, owner_user_id) VALUES ($1, 'P08 Other', $2)`, [scopeOther.workspaceId, scopeB.actorUserId]);
    await pool.query(`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'OWNER')`, [scopeOther.workspaceId, scopeB.actorUserId]);
    await expectResearchError(repository.loadAlphaVersionDataContract(scopeOther, "p08-alpha", "av_p08_alpha_0_1_0"), "RESEARCH_PREFLIGHT_NOT_FOUND");
  });

  it("P08-T07/T09: actor admission is bounded and does not claim a global trial reservation", async () => {
    await seedIdentity();
    await service.create(admin, scopeA, requested(), "p08-a");
    await service.create(admin, scopeA, requested({ random_seed: 43 }), "p08-b");
    await expectResearchError(service.create(admin, scopeA, requested({ random_seed: 44 }), "p08-c"), "RESEARCH_ADMISSION_SATURATED");
    const resource = (await service.get(scopeA, (await pool.query<{ preflight_token: string }>(`SELECT preflight_token FROM research.preflight_manifests ORDER BY created_at LIMIT 1`)).rows[0].preflight_token)).resource_estimate;
    expect(resource.scope).toContain("per_study_per_fold_per_seed");
  });

  it("P08 immutability/DR: expired actor-only metadata is bounded-cleanable and runtime role cannot update it", async () => {
    await seedIdentity();
    const now = new Date(Date.now() - 1_000).toISOString();
    await pool.query(
      `INSERT INTO research.preflight_manifests (workspace_id, preflight_token, actor_user_id, requested_spec_digest, effective_spec_digest, dataset_binding_digest, manifest_digest, requested_spec, effective_spec, dataset_binding, topology, resource_estimate, snapshot, created_at, expires_at)
       VALUES ($1, 'rpft_expired', $2, $3, $3, $3, $3, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, $4::jsonb, now() - interval '2 seconds', $5)`,
      [scopeA.workspaceId, scopeA.actorUserId, "a".repeat(64), JSON.stringify({ snapshot_id: "dss_0123456789abcdef0123456789abcdef", snapshot_content_hash: "b".repeat(64), source_manifest_digest: "c".repeat(64) }), now],
    );
    await expect(pool.query("UPDATE research.preflight_manifests SET manifest_digest = manifest_digest")).rejects.toMatchObject({ code: "55000" });
    const runtime = await pool.connect();
    try {
      await runtime.query("BEGIN");
      await runtime.query("SET LOCAL ROLE portal_research_runtime");
      await expect(runtime.query("UPDATE research.preflight_manifests SET manifest_digest = manifest_digest")).rejects.toMatchObject({ code: "42501" });
      await runtime.query("ROLLBACK");
    } finally { runtime.release(); }
    expect(await repository.cleanupExpiredPreflightManifests(scopeA, 1)).toBe(1);
  });

  it("P08 rejects private digest inconsistency before it can become durable authority", async () => {
    await seedIdentity();
    client.response = { ...privateResponse(requested()), effective_spec_digest: "0".repeat(64) };
    await expect(service.create(admin, scopeA, requested(), "p08-request")).rejects.toMatchObject({ code: "RESEARCH_PREFLIGHT_REJECTED" } satisfies Partial<ResearchPreflightError>);
    expect((await pool.query("SELECT count(*)::integer AS count FROM research.preflight_manifests")).rows[0].count).toBe(0);
  });

  it("P08 rejects private capability/binding mismatch or oversize metadata before persistence", async () => {
    await seedIdentity();
    const mismatch = privateResponse(requested());
    mismatch.effective_spec = {
      ...mismatch.effective_spec,
      engine: { ...mismatch.capability, execution_route: "pct_equity" },
    };
    mismatch.effective_spec_digest = sha256ResearchJson(mismatch.effective_spec);
    client.response = mismatch;
    await expect(service.create(admin, scopeA, requested(), "p08-mismatch")).rejects.toMatchObject({
      code: "RESEARCH_PREFLIGHT_REJECTED",
    } satisfies Partial<ResearchPreflightError>);

    // Each sub-document can satisfy its individual schema while pointing at a
    // different immutable snapshot. P08 rejects that split authority before
    // it can become a P10 worker input.
    const splitBinding = privateResponse(requested({ random_seed: 43 }));
    splitBinding.effective_spec = {
      ...splitBinding.effective_spec,
      data_binding: {
        ...splitBinding.effective_spec.data_binding,
        snapshot_id: "dss_ffffffffffffffffffffffffffffffff",
      },
    };
    splitBinding.effective_spec_digest = sha256ResearchJson(splitBinding.effective_spec);
    client.response = splitBinding;
    await expect(service.create(admin, scopeA, requested({ random_seed: 43 }), "p08-split-binding")).rejects.toMatchObject({
      code: "RESEARCH_PREFLIGHT_REJECTED",
    } satisfies Partial<ResearchPreflightError>);

    const oversize = privateResponse(requested({ random_seed: 43 }));
    oversize.snapshot = {
      ...oversize.snapshot,
      provenance: { loader_contract: "hmd-loader-v1", oversized: "x".repeat(70_000) },
    };
    client.response = oversize;
    await expect(service.create(admin, scopeA, requested({ random_seed: 43 }), "p08-oversize")).rejects.toMatchObject({
      code: "RESEARCH_PREFLIGHT_REJECTED",
    } satisfies Partial<ResearchPreflightError>);
    expect((await pool.query("SELECT count(*)::integer AS count FROM research.preflight_manifests")).rows[0].count).toBe(0);
  });
});
