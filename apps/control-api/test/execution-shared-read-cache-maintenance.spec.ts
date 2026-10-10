import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { loadConfig } from "../src/config";
import { ExecutionSharedReadCacheMaintenanceWorker, runSharedReadCacheSweep } from "../src/execution/shared-read-cache-maintenance";
import { ExecutionSharedReadRepository, SharedReadScope, sharedReadIdentity } from "../src/execution/shared-read.repository";
import { migrateTestDatabase } from "./harness";

const DATABASE_URL = process.env.TEST_DATABASE_URL ??
  "postgres://portal:portal@127.0.0.1:5432/portal_control_test";

const scope: SharedReadScope = {
  sourceId: "manager-v2",
  profileId: "PAPER_BINANCE_USDM",
  workspaceId: "ws_cache_maintenance",
  principalId: "usr_cache_maintenance",
  principalRole: "ADMIN",
  adapterRevision: "MANAGER_V2_CURRENT_AS_IS",
  requestPath: "/internal/v2/manager/relations/public/orders?limit=100",
};

function config(overrides: Record<string, string> = {}) {
  return loadConfig({
    DATABASE_URL,
    PORTAL_ENV: "local",
    AUTH_MODE: "dev",
    EXECUTION_SHARED_READ_CACHE_SWEEPER_BATCH_ROWS: "2",
    EXECUTION_SHARED_READ_CACHE_SWEEPER_BATCH_BYTES: String(64 * 1024),
    EXECUTION_SHARED_READ_CACHE_SWEEPER_MAX_RUNTIME_MS: "30000",
    EXECUTION_SHARED_READ_CACHE_SWEEPER_STARTUP_JITTER_MS: "0",
    ...overrides,
  });
}

describe("BE-R2-1 bounded shared-read cache lifecycle", () => {
  let pool: Pool;

  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL);
    pool = new Pool({ connectionString: DATABASE_URL, max: 16 });
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE
      execution_shared_read_cache,
      execution_shared_read_flights,
      execution_shared_admission_leases,
      execution_shared_admission_state,
      workspaces,
      portal_users CASCADE`);
    await pool.query(`INSERT INTO portal_users
      (user_id,username,display_name,role,status,must_change_password)
      VALUES ('usr_cache_maintenance','cache-maintenance','Cache Maintenance','ADMIN','ACTIVE',false)`);
    await pool.query(`INSERT INTO workspaces (workspace_id,name,owner_user_id)
      VALUES ('ws_cache_maintenance','Cache Maintenance','usr_cache_maintenance')`);
  });

  afterAll(async () => pool.end());

  it("dry-runs first, deletes only expired batches, and preserves fresh cache hits", async () => {
    const repository = new ExecutionSharedReadRepository(pool, config());
    await insertCache(pool, 1, "PAPER_BINANCE_USDM", -4_000);
    await insertCache(pool, 2, "PAPER_BINANCE_USDM", -3_000);
    await insertCache(pool, 3, "SANDBOX_BINANCE_USDM", -2_000);
    await insertCache(pool, 4, "PAPER_BINANCE_USDM", 30_000);

    const before = await repository.inventory(2);
    expect(before.expiredSampleRows).toBe(2);
    expect(before.expiredSampleHasMore).toBe(true);
    expect(before.profiles.find((profile) => profile.profileId === "PAPER_BINANCE_USDM")?.activeRows).toBe(1);

    const dryRun = await runSharedReadCacheSweep(repository, config(), { dryRun: true, workerId: "test-dry-run" });
    expect(dryRun).toMatchObject({ mode: "DRY_RUN", outcome: "DRY_RUN", deletedRows: 0 });
    await expect(rowCount(pool, "expires_at <= clock_timestamp()")).resolves.toBe(3);

    // A simultaneous reader sees the fresh row while a separate bounded
    // transaction removes only old rows. A concurrent leader completes a new
    // cache value at the same time; this guards reader/writer/sweeper behavior
    // across replicas without ever querying a source from the sweeper.
    const freshScope = { ...scope, requestPath: `${scope.requestPath}&fresh-row=4` };
    const writerScope = { ...scope, requestPath: `${scope.requestPath}&writer-row=5` };
    await insertScopeCache(pool, freshScope, 4, 30_000);
    const writerAdmission = await repository.begin(writerScope);
    expect(writerAdmission.kind).toBe("LEADER");
    if (writerAdmission.kind !== "LEADER") throw new Error("writer fixture must become leader");
    const [admission, written, applied] = await Promise.all([
      repository.begin(freshScope),
      repository.complete(writerScope, writerAdmission, {
        authority: "EXECUTION_CELL",
        freshness: "FRESH",
        completeness: "COMPLETE",
        as_of: "2026-09-11T00:00:00.000Z",
        items: [{ id: "writer-row-5" }],
      }),
      runSharedReadCacheSweep(repository, config(), { dryRun: false, workerId: "test-apply" }),
    ]);
    expect(admission.kind).toBe("CACHE_HIT");
    expect(written.expiresAt).toBeTruthy();
    expect(applied).toMatchObject({ mode: "APPLY", outcome: "DRAINED", deletedRows: 3, batches: 2 });
    await expect(rowCount(pool, "expires_at <= clock_timestamp()")).resolves.toBe(0);
    await expect(rowCount(pool, "expires_at > clock_timestamp()")).resolves.toBe(3);
    await expect(repository.begin(writerScope)).resolves.toMatchObject({ kind: "CACHE_HIT" });
    expect(applied.profiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ profileId: "PAPER_BINANCE_USDM", deletedRows: 2 }),
      expect.objectContaining({ profileId: "SANDBOX_BINANCE_USDM", deletedRows: 1 }),
    ]));
  });

  it("uses the expiry index, SKIP LOCKED batches, cancellation and a bounded time budget", async () => {
    const repositoryA = new ExecutionSharedReadRepository(pool, config());
    const repositoryB = new ExecutionSharedReadRepository(pool, config());
    for (let index = 0; index < 12; index += 1) {
      await insertCache(pool, index + 10, "PAPER_BINANCE_USDM", -1_000 - index);
    }

    await pool.query("SET enable_seqscan = off");
    try {
      const plan = await pool.query<{ "QUERY PLAN": unknown }>(
        `EXPLAIN (FORMAT JSON)
         SELECT cache_key FROM execution_shared_read_cache
         WHERE expires_at <= clock_timestamp()
         ORDER BY expires_at ASC,cache_key ASC LIMIT 2`,
      );
      expect(JSON.stringify(plan.rows)).toContain("execution_shared_read_cache_expiry_idx");
    } finally {
      await pool.query("RESET enable_seqscan");
    }

    const [left, right] = await Promise.all([
      repositoryA.sweepExpiredBatch(2, 64 * 1024),
      repositoryB.sweepExpiredBatch(2, 64 * 1024),
    ]);
    expect(left.deletedRows + right.deletedRows).toBe(4);
    await expect(rowCount(pool, "expires_at <= clock_timestamp()")).resolves.toBe(8);

    const cancelled = await runSharedReadCacheSweep(repositoryA, config(), {
      dryRun: false,
      isCancelled: () => true,
      workerId: "test-cancelled",
    });
    expect(cancelled).toMatchObject({ outcome: "CANCELLED", deletedRows: 0 });
    await expect(rowCount(pool, "expires_at <= clock_timestamp()")).resolves.toBe(8);

    const bounded = await runSharedReadCacheSweep(repositoryA, config(), {
      dryRun: false,
      maximumRuntimeMs: 50,
      workerId: "test-budget",
    });
    expect(["DRAINED", "TIME_BUDGET"]).toContain(bounded.outcome);
    expect(bounded.deletedRows).toBeGreaterThanOrEqual(0);
  });

  it("keeps the stored body when a refresh carries the same bytes, and replaces it when they differ", async () => {
    const repository = new ExecutionSharedReadRepository(pool, config());
    const body = (note: string) => ({
      authority: "EXECUTION_CELL", freshness: "FRESH", completeness: "COMPLETE", as_of: "2026-09-11T00:00:00.000Z",
      // incompressible enough to be stored out of line (TOAST) so the chunk id is observable
      rows: Array.from({ length: 4000 }, (_, i) => `${note}-${(i * 2654435761 % 4294967296).toString(36)}`),
    });
    const chunkId = async () => {
      const toast = (await pool.query<{ name: string }>(
        "SELECT reltoastrelid::regclass::text AS name FROM pg_class WHERE oid = 'execution_shared_read_cache'::regclass")).rows[0]!.name;
      return (await pool.query<{ id: string }>(`SELECT min(chunk_id)::text AS id FROM ${toast}`)).rows[0]!.id;
    };
    const refresh = async (note: string) => {
      await pool.query("UPDATE execution_shared_read_cache SET stored_at = clock_timestamp() - interval '3 seconds', expires_at = clock_timestamp() - interval '1 second'");
      const admission = await repository.begin(scope);
      expect(admission.kind).toBe("LEADER");
      if (admission.kind !== "LEADER") throw new Error("expected leader");
      return repository.complete(scope, admission, body(note));
    };

    await refresh("a");
    const first = await chunkId();
    const same = await refresh("a");
    expect(await chunkId()).toBe(first);
    expect(same.body).toEqual(body("a"));
    const changed = await refresh("b");
    expect(await chunkId()).not.toBe(first);
    expect(changed.body).toEqual(body("b"));
  });

  it("gives the file back only when it has outgrown the limit and nothing in it is live", async () => {
    const repository = new ExecutionSharedReadRepository(pool, config());
    await insertCache(pool, 900, "PAPER_BINANCE_USDM", -4_000);

    await expect(repository.reclaimPhysicalSpace(64 * 1024 * 1024)).resolves.toMatchObject({ reclaimed: false, reason: "WITHIN_LIMIT" });
    await expect(rowCount(pool, "true")).resolves.toBe(1);

    await insertCache(pool, 901, "PAPER_BINANCE_USDM", 30_000);
    await expect(repository.reclaimPhysicalSpace(1)).resolves.toMatchObject({ reclaimed: false, reason: "LIVE_ENTRIES" });
    await expect(rowCount(pool, "true")).resolves.toBe(2);

    await pool.query("DELETE FROM execution_shared_read_cache WHERE expires_at > clock_timestamp()");
    await expect(repository.reclaimPhysicalSpace(1)).resolves.toMatchObject({ reclaimed: true, reason: "RECLAIMED" });
    await expect(rowCount(pool, "true")).resolves.toBe(0);

    await insertCache(pool, 902, "PAPER_BINANCE_USDM", -1_000);
    const report = await runSharedReadCacheSweep(repository, config({ EXECUTION_SHARED_READ_CACHE_PHYSICAL_LIMIT_BYTES: "0" }), { workerId: "guard-off", dryRun: false });
    expect(report.physicalReclaim.reason).toBe("DISABLED");
    const guarded = await runSharedReadCacheSweep(repository, config({ EXECUTION_SHARED_READ_CACHE_PHYSICAL_LIMIT_BYTES: "1" }), { workerId: "guard-on", dryRun: false });
    expect(guarded.physicalReclaim.reason).toBe("RECLAIMED");
  });

  it("reserves capacity before admitting a leader, so a fresh leader always has cache space", async () => {
    const capacityConfig = config({
      EXECUTION_SHARED_READ_CACHE_MAXIMUM_ROWS: "128",
      EXECUTION_SHARED_READ_CACHE_MAXIMUM_BYTES: String(8 * 1024 * 1024),
    });
    const repository = new ExecutionSharedReadRepository(pool, capacityConfig);
    for (let index = 0; index < 128; index += 1) {
      await insertCache(pool, index + 100, "PAPER_BINANCE_USDM", 60_000);
    }
    const denied = await repository.begin({ ...scope, requestPath: `${scope.requestPath}&capacity=full` });
    expect(denied).toMatchObject({
      kind: "DENIED",
      reasonCode: "N21_SHARED_CACHE_CAPACITY_EXHAUSTED",
    });
    await expect(rowCount(pool, "true", "execution_shared_read_flights")).resolves.toBe(0);
  });

  it("backpressures new leaders under physical pressure without evicting live hits", async () => {
    const freshScope = { ...scope, requestPath: `${scope.requestPath}&physical=live` };
    await insertScopeCache(pool, freshScope, 950, 30_000);
    const guarded = new ExecutionSharedReadRepository(pool, config({
      EXECUTION_SHARED_READ_CACHE_PHYSICAL_LIMIT_BYTES: "1048576",
    }));
    await expect(guarded.begin(freshScope)).resolves.toMatchObject({ kind: "CACHE_HIT" });
    const miss = { ...scope, requestPath: `${scope.requestPath}&physical=miss` };
    const denied = await guarded.begin(miss);
    expect(denied).toMatchObject({ kind: "DENIED", reasonCode: "N21_SHARED_CACHE_CAPACITY_EXHAUSTED" });
    await expect(rowCount(pool, "expires_at > clock_timestamp()")).resolves.toBe(1);
    expect((await pool.query("SELECT count(*)::integer AS count FROM execution_shared_read_flights")).rows[0].count).toBe(0);
    const unguarded = new ExecutionSharedReadRepository(pool, config({
      EXECUTION_SHARED_READ_CACHE_PHYSICAL_LIMIT_BYTES: "0",
    }));
    const accepted = await unguarded.begin(miss);
    expect(accepted.kind).toBe("LEADER");
    if (accepted.kind === "LEADER") await unguarded.fail(accepted);
  });

  it("defers physical reclaim at a short lock timeout and leaves cache rows intact", async () => {
    await insertCache(pool, 951, "PAPER_BINANCE_USDM", -4_000);
    const blocker = await pool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query("LOCK TABLE execution_shared_read_cache IN ACCESS SHARE MODE");
      const repository = new ExecutionSharedReadRepository(pool, config());
      await expect(repository.reclaimPhysicalSpace(1)).resolves.toMatchObject({ reclaimed: false, reason: "LOCKED" });
      await expect(rowCount(pool, "true")).resolves.toBe(1);
    } finally { await blocker.query("ROLLBACK"); blocker.release(); }
  });

  it("keeps the operational lifecycle disabled by default and honorably stops on shutdown", async () => {
    const disabled = new ExecutionSharedReadCacheMaintenanceWorker(
      config(), new ExecutionSharedReadRepository(pool, config()),
    );
    await expect(disabled.runOnce()).resolves.toBeNull();

    const enabledConfig = config({
      FEATURE_EXECUTION_SHARED_READ_CACHE_SWEEPER: "true",
      EXECUTION_SHARED_READ_CACHE_SWEEPER_DRY_RUN: "true",
    });
    const worker = new ExecutionSharedReadCacheMaintenanceWorker(
      enabledConfig, new ExecutionSharedReadRepository(pool, enabledConfig),
    );
    await expect(worker.runOnce()).resolves.toMatchObject({ mode: "DRY_RUN", outcome: "DRY_RUN" });
    await worker.onApplicationShutdown();
    await expect(worker.runOnce()).resolves.toBeNull();
  });
});

async function insertCache(pool: Pool, index: number, profileId: string, expiresOffsetMs: number): Promise<void> {
  const cacheKey = `sha256:${index.toString(16).padStart(64, "0")}`;
  await pool.query(
    `INSERT INTO execution_shared_read_cache
       (cache_key,source_id,profile_id,workspace_id,principal_digest,adapter_revision,request_digest,
        etag,authority,freshness,completeness,as_of,response_body,response_bytes,stored_at,expires_at)
     VALUES ($1,'manager-v2',$2,'ws_cache_maintenance',$3,'MANAGER_V2_CURRENT_AS_IS',$4,
             $5,'EXECUTION_CELL','FRESH','COMPLETE',clock_timestamp(),$6::jsonb,512,
             clock_timestamp() - interval '10 seconds',
             clock_timestamp() + ($7::integer * interval '1 millisecond'))`,
    [
      cacheKey,
      profileId,
      `sha256:${"a".repeat(64)}`,
      `sha256:${"b".repeat(64)}`,
      `"sha256-${"c".repeat(64)}"`,
      JSON.stringify({ authority: "EXECUTION_CELL", freshness: "FRESH", completeness: "COMPLETE", as_of: "2026-09-11T00:00:00.000Z" }),
      expiresOffsetMs,
    ],
  );
}

async function insertScopeCache(pool: Pool, sharedScope: SharedReadScope, _index: number, expiresOffsetMs: number): Promise<void> {
  // This fixture deliberately matches the scope-derived identity only for the
  // fresh-reader assertion above; it is a cache read test, not source I/O.
  const identity = sharedReadIdentity(sharedScope);
  await pool.query(
    `INSERT INTO execution_shared_read_cache
       (cache_key,source_id,profile_id,workspace_id,principal_digest,adapter_revision,request_digest,
        etag,authority,freshness,completeness,as_of,response_body,response_bytes,stored_at,expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'EXECUTION_CELL','FRESH','COMPLETE',clock_timestamp(),$9::jsonb,512,
             clock_timestamp() - interval '10 seconds',
             clock_timestamp() + ($10::integer * interval '1 millisecond'))`,
    [
      identity.cacheKey,
      sharedScope.sourceId,
      sharedScope.profileId,
      sharedScope.workspaceId,
      identity.principalDigest,
      sharedScope.adapterRevision,
      identity.requestDigest,
      `"sha256-${"d".repeat(64)}"`,
      JSON.stringify({ authority: "EXECUTION_CELL", freshness: "FRESH", completeness: "COMPLETE", as_of: "2026-09-11T00:00:00.000Z" }),
      expiresOffsetMs,
    ],
  );
}

async function rowCount(pool: Pool, where: string, table = "execution_shared_read_cache"): Promise<number> {
  const result = await pool.query<{ count: string }>(`SELECT count(*)::bigint AS count FROM ${table} WHERE ${where}`);
  return Number(result.rows[0]?.count ?? "0");
}
