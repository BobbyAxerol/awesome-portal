import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { loadConfig } from "../src/config";
import {
  ExecutionSharedReadRepository,
  SharedReadScope,
  sharedReadIdentity,
  sourceMetadata,
} from "../src/execution/shared-read.repository";
import { migrateTestDatabase } from "./harness";

const DATABASE_URL = process.env.TEST_DATABASE_URL ??
  "postgres://portal:portal@127.0.0.1:5432/portal_control_test";

const envelope = {
  schema_version: "trading-system.portal-execution.manager-v2.runtime.v1",
  authority: "EXECUTION_CELL",
  profile_id: "PAPER_BINANCE_USDM",
  availability: "AVAILABLE",
  freshness: "FRESH",
  completeness: "COMPLETE",
  as_of: "2026-08-30T10:00:00.000Z",
  data: { rows: [{ id: "opaque-1", pnl: "12.5000" }] },
};

const scope: SharedReadScope = {
  sourceId: "manager-v2",
  profileId: "PAPER_BINANCE_USDM",
  workspaceId: "ws_n21",
  principalId: "usr_n21",
  principalRole: "ADMIN",
  adapterRevision: "MANAGER_V2_CURRENT_AS_IS",
  requestPath: "/internal/v2/manager/relations/public/orders?limit=100",
};

function config(overrides: Record<string, string> = {}) {
  return loadConfig({
    DATABASE_URL,
    PORTAL_ENV: "local",
    AUTH_MODE: "dev",
    ...overrides,
  });
}

describe("N21 PostgreSQL shared admission, coalescing and freshness", () => {
  let pool: Pool;

  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL);
    pool = new Pool({ connectionString: DATABASE_URL, max: 12 });
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE
      execution_shared_read_cache,
      execution_shared_read_flights,
      execution_shared_admission_leases,
      execution_shared_admission_state,
      workspaces,
      portal_users CASCADE`);
    await pool.query(
      `INSERT INTO portal_users
         (user_id,username,display_name,role,status,must_change_password)
       VALUES ('usr_n21','n21','N21','ADMIN','ACTIVE',false)`,
    );
    await pool.query(
      `INSERT INTO workspaces (workspace_id,name,owner_user_id)
       VALUES ('ws_n21','N21','usr_n21'),('ws_other','Other','usr_n21')`,
    );
  });

  afterAll(async () => pool.end());

  it("coalesces a stampede across repository replicas and preserves provenance", async () => {
    const repositoryA = new ExecutionSharedReadRepository(pool, config());
    const repositoryB = new ExecutionSharedReadRepository(pool, config());
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const attemptScope = {
        ...scope,
        requestPath: `${scope.requestPath}&stampede_attempt=${attempt}`,
      };
      const leader = await repositoryA.begin(attemptScope);
      expect(leader.kind).toBe("LEADER");
      if (leader.kind !== "LEADER") throw new Error("expected leader");
      const follower = await repositoryB.begin(attemptScope);
      expect(follower).toMatchObject({ kind: "FOLLOWER", cacheKey: leader.cacheKey });
      if (follower.kind !== "FOLLOWER") throw new Error("expected follower");

      const waiting = repositoryB.waitForLeader(attemptScope, follower.cacheKey);
      await new Promise((resolve) => setTimeout(resolve, 30));
      const completed = await repositoryA.complete(attemptScope, leader, envelope);
      const coalesced = await waiting;
      expect(coalesced).toEqual(completed);
      expect(completed).toMatchObject({
        etag: expect.stringMatching(/^"sha256-[0-9a-f]{64}"$/),
        metadata: {
          authority: "EXECUTION_CELL",
          freshness: "FRESH",
          completeness: "COMPLETE",
          asOf: "2026-08-30T10:00:00.000Z",
        },
        body: envelope,
      });
      await expect(repositoryB.begin(attemptScope)).resolves.toMatchObject({
        kind: "CACHE_HIT",
        cacheKey: leader.cacheKey,
      });
    }
  });

  it("never shares cache or flights across workspace, principal, profile or request", () => {
    const baseline = sharedReadIdentity(scope).cacheKey;
    for (const changed of [
      { ...scope, workspaceId: "ws_other" },
      { ...scope, principalId: "usr_other" },
      { ...scope, profileId: "PAPER_OTHER" },
      { ...scope, requestPath: `${scope.requestPath}&cursor=opaque` },
      { ...scope, adapterRevision: "MANAGER_V2_FUTURE" },
    ]) {
      expect(sharedReadIdentity(changed).cacheKey).not.toBe(baseline);
    }
  });

  it("enforces concurrency and source rate globally without dispatch retry", async () => {
    const concurrency = new ExecutionSharedReadRepository(pool, config({
      EXECUTION_EDGE_CURRENT_SOURCE_MAXIMUM_CONCURRENCY: "1",
      EXECUTION_EDGE_CURRENT_SOURCE_MAX_REQUESTS_PER_SECOND: "15",
    }));
    const first = await concurrency.begin(scope);
    expect(first.kind).toBe("LEADER");
    const second = await concurrency.begin({ ...scope, requestPath: `${scope.requestPath}&cursor=a` });
    expect(second).toMatchObject({
      kind: "DENIED",
      reasonCode: "N21_SHARED_CONCURRENCY_EXHAUSTED",
    });
    if (first.kind === "LEADER") await concurrency.fail(first);

    await pool.query(`TRUNCATE execution_shared_read_flights,
      execution_shared_admission_leases,execution_shared_admission_state`);
    const rate = new ExecutionSharedReadRepository(pool, config({
      EXECUTION_EDGE_CURRENT_SOURCE_MAX_REQUESTS_PER_SECOND: "2",
      EXECUTION_EDGE_CURRENT_SOURCE_MAXIMUM_PACE_WAIT_MS: "80",
    }));
    const admitted = await rate.begin(scope);
    expect(admitted.kind).toBe("LEADER");
    if (admitted.kind === "LEADER") await rate.fail(admitted);
    const denied = await rate.begin({ ...scope, requestPath: `${scope.requestPath}&cursor=b` });
    expect(denied).toMatchObject({
      kind: "DENIED",
      reasonCode: "N21_SHARED_RATE_BUDGET_EXHAUSTED",
    });
  });

  it("honors the EDS-01 named-operation profile caps and coalesces one, ten and one hundred callers", async () => {
    const repository = new ExecutionSharedReadRepository(pool, config());
    const operationScope: SharedReadScope = {
      ...scope,
      sourceId: "manager.deployments",
      adapterRevision: "PORTAL_E5_DEPLOYMENT_PAGE_V1",
      requestPath: "/internal/v2/manager/relations/public/strategy_deployments?limit=100",
      admission: { sourceMaximumConcurrency: 4, profileMaximumConcurrency: 1 },
    };
    const paperLeader = await repository.begin(operationScope);
    expect(paperLeader.kind).toBe("LEADER");
    const paperSecond = await repository.begin({
      ...operationScope,
      requestPath: `${operationScope.requestPath}&cursor=next-page`,
    });
    expect(paperSecond).toMatchObject({
      kind: "DENIED",
      reasonCode: "N21_SHARED_CONCURRENCY_EXHAUSTED",
    });
    if (paperLeader.kind === "LEADER") await repository.fail(paperLeader);

    await pool.query(`TRUNCATE execution_shared_read_flights,
      execution_shared_admission_leases,execution_shared_admission_state,execution_shared_read_cache`);
    const liveScope: SharedReadScope = {
      ...operationScope,
      profileId: "LIVE_BINANCE_USDM",
      admission: { sourceMaximumConcurrency: 4, profileMaximumConcurrency: 2 },
    };
    const liveOne = await repository.begin(liveScope);
    const liveTwo = await repository.begin({ ...liveScope, requestPath: `${liveScope.requestPath}&cursor=one` });
    const liveThree = await repository.begin({ ...liveScope, requestPath: `${liveScope.requestPath}&cursor=two` });
    expect(liveOne.kind).toBe("LEADER");
    expect(liveTwo.kind).toBe("LEADER");
    expect(liveThree).toMatchObject({
      kind: "DENIED",
      reasonCode: "N21_SHARED_CONCURRENCY_EXHAUSTED",
    });
    if (liveOne.kind === "LEADER") await repository.fail(liveOne);
    if (liveTwo.kind === "LEADER") await repository.fail(liveTwo);

    await pool.query(`TRUNCATE execution_shared_read_flights,
      execution_shared_admission_leases,execution_shared_admission_state,execution_shared_read_cache`);
    for (const callers of [1, 10, 100]) {
      const admissions = await Promise.all(Array.from({ length: callers }, () => repository.begin(operationScope)));
      const leaders = admissions.filter((admission) => admission.kind === "LEADER");
      const followers = admissions.filter((admission) => admission.kind === "FOLLOWER");
      expect(leaders).toHaveLength(1);
      expect(followers).toHaveLength(callers - 1);
      const leader = leaders[0];
      if (leader.kind !== "LEADER") throw new Error("expected one operation leader");
      const waiting = followers.map((follower) => {
        if (follower.kind !== "FOLLOWER") throw new Error("expected follower");
        return repository.waitForLeader(operationScope, follower.cacheKey);
      });
      const completed = await repository.complete(operationScope, leader, envelope);
      expect(await Promise.all(waiting)).toEqual(Array.from({ length: callers - 1 }, () => completed));
      // A real named operation has exactly one upstream leader for this cache
      // key; all 1/10/100 same-browser arrivals now observe the cached result.
      await expect(repository.begin(operationScope)).resolves.toMatchObject({ kind: "CACHE_HIT" });
      await pool.query(`TRUNCATE execution_shared_read_flights,
        execution_shared_admission_leases,execution_shared_admission_state,execution_shared_read_cache`);
    }
  });

  it("enforces the Paper/Sandbox/Live cap across distinct named operations and exposes only profile-safe aggregate telemetry", async () => {
    // Separate instances model separate Control API replicas.  The profile
    // cap must stay global even when each named BFF operation is handled by a
    // different process.
    const repositoryA = new ExecutionSharedReadRepository(pool, config());
    const repositoryB = new ExecutionSharedReadRepository(pool, config());
    const paperOrders: SharedReadScope = {
      ...scope,
      sourceId: "manager.orders",
      adapterRevision: "PORTAL_EDS11R_MANAGER_RELATION_V1",
      requestPath: "/internal/v2/manager/relations/public/orders?limit=100",
      admission: { sourceMaximumConcurrency: 4, profileMaximumConcurrency: 1 },
    };
    const paperFills: SharedReadScope = {
      ...paperOrders,
      sourceId: "manager.fills",
      requestPath: "/internal/v2/manager/relations/public/fills?limit=100",
    };
    const paperLeader = await repositoryA.begin(paperOrders);
    expect(paperLeader.kind).toBe("LEADER");
    await expect(repositoryB.begin(paperFills)).resolves.toMatchObject({
      kind: "DENIED",
      reasonCode: "N21_SHARED_CONCURRENCY_EXHAUSTED",
    });

    const liveOrders: SharedReadScope = {
      ...paperOrders,
      profileId: "LIVE_BINANCE_USDM",
      admission: { sourceMaximumConcurrency: 4, profileMaximumConcurrency: 2 },
    };
    const liveFills: SharedReadScope = {
      ...paperFills,
      profileId: "LIVE_BINANCE_USDM",
      admission: { sourceMaximumConcurrency: 4, profileMaximumConcurrency: 2 },
    };
    const livePositions: SharedReadScope = {
      ...liveOrders,
      sourceId: "manager.positions",
      requestPath: "/internal/v2/manager/relations/public/positions_v2?limit=100",
    };
    const liveOne = await repositoryA.begin(liveOrders);
    const liveTwo = await repositoryB.begin(liveFills);
    expect(liveOne.kind).toBe("LEADER");
    expect(liveTwo.kind).toBe("LEADER");
    await expect(repositoryA.begin(livePositions)).resolves.toMatchObject({
      kind: "DENIED",
      reasonCode: "N21_SHARED_CONCURRENCY_EXHAUSTED",
    });

    const inventory = await repositoryB.admissionInventory([
      "PAPER_BINANCE_USDM",
      "SANDBOX_BINANCE_USDM",
      "LIVE_BINANCE_USDM",
    ]);
    expect(inventory.profiles).toEqual([
      expect.objectContaining({
        profileId: "LIVE_BINANCE_USDM",
        activeLeases: 2,
        activeOperationCount: 2,
        maximumConcurrency: 2,
        maximumRequestsPerSecond: 15,
      }),
      expect.objectContaining({
        profileId: "PAPER_BINANCE_USDM",
        activeLeases: 1,
        activeOperationCount: 1,
        maximumConcurrency: 1,
        maximumRequestsPerSecond: 15,
      }),
      expect.objectContaining({
        profileId: "SANDBOX_BINANCE_USDM",
        activeLeases: 0,
        activeOperationCount: 0,
        maximumConcurrency: null,
        maximumRequestsPerSecond: null,
      }),
    ]);
    const storedProfileKeys = await pool.query<{ scope_key: string }>(
      "SELECT scope_key FROM execution_shared_admission_state WHERE scope_kind='PROFILE' ORDER BY scope_key ASC",
    );
    expect(storedProfileKeys.rows.map((row) => row.scope_key)).toEqual([
      "LIVE_BINANCE_USDM",
      "PAPER_BINANCE_USDM",
    ]);

    if (paperLeader.kind === "LEADER") await repositoryA.fail(paperLeader);
    if (liveOne.kind === "LEADER") await repositoryA.fail(liveOne);
    if (liveTwo.kind === "LEADER") await repositoryB.fail(liveTwo);
  });

  it("recovers an abandoned leader and permit only after bounded lease expiry", async () => {
    const repositoryA = new ExecutionSharedReadRepository(pool, config({
      EXECUTION_EDGE_CURRENT_SOURCE_LEASE_TTL_MS: "500",
      EXECUTION_EDGE_CURRENT_SOURCE_MAX_REQUESTS_PER_SECOND: "15",
    }));
    const repositoryB = new ExecutionSharedReadRepository(pool, config({
      EXECUTION_EDGE_CURRENT_SOURCE_LEASE_TTL_MS: "500",
      EXECUTION_EDGE_CURRENT_SOURCE_MAX_REQUESTS_PER_SECOND: "15",
    }));
    expect((await repositoryA.begin(scope)).kind).toBe("LEADER");
    expect((await repositoryB.begin(scope)).kind).toBe("FOLLOWER");
    await new Promise((resolve) => setTimeout(resolve, 550));
    const recovered = await repositoryB.begin(scope);
    expect(recovered.kind).toBe("LEADER");
    if (recovered.kind === "LEADER") await repositoryB.fail(recovered);
  });

  it("rejects a cache write unless source authority/freshness/completeness/as_of are exact", () => {
    expect(sourceMetadata(envelope)).toMatchObject({ authority: "EXECUTION_CELL" });
    for (const invalid of [
      { ...envelope, authority: "" },
      { ...envelope, freshness: "RECENTISH" },
      { ...envelope, completeness: "MOSTLY" },
      { ...envelope, as_of: "tomorrow-ish" },
    ]) expect(() => sourceMetadata(invalid)).toThrow(/provenance/);
  });
});
