/** Real disposable PostgreSQL MVCC/retained-view checks. Scope adapters are
 * explicitly TEST_ONLY: this is not a session, source or connected receipt. */
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ControlApiConfig } from "../src/config";
import { ExecutionProfileProjectionRepository, type ProfileProjectionDocument } from "../src/execution/profile-projection.repository";
import { ObservedReadService } from "../src/execution-v2/observed-read.service";
import { observedReadResponse } from "../src/execution-v2/observed-read.contract";
import { migrateTestDatabase, truncateAll } from "./harness";

const DATABASE = process.env.TEST_DATABASE_URL;
const WS = "TEST_ONLY-observed-pg", PROFILE = "PAPER_OKX_SWAP", NOW = 1_795_478_400_000;
const principal = { user: { userId: "TEST_ONLY-user" }, session: { sessionId: "TEST_ONLY-session" }, workspaceId: WS } as never;
describe.skipIf(!DATABASE)("Observed retained view on disposable PostgreSQL", () => {
  let pool: Pool, repository: ExecutionProfileProjectionRepository;
  beforeAll(async () => {
    if (!DATABASE?.includes("control-api-test-postgres-") || !DATABASE.endsWith("/portal_control_test"))
      throw Error("DISPOSABLE_DATABASE_REQUIRED");
    await migrateTestDatabase(DATABASE);
    pool = new Pool({ connectionString: DATABASE, max: 3, connectionTimeoutMillis: 2000, query_timeout: 6000 });
    repository = new ExecutionProfileProjectionRepository(pool);
  });
  beforeEach(async () => { await truncateAll(pool); await commit("TEST_ONLY-cursor-1"); });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => { await pool?.end(); });

  async function commit(cursor: string, equity = "20000") {
    const lineage = { workspace_id: WS, profile_id: PROFILE, source_contract_revision: "TEST_ONLY-source" };
    const relation = (source_id: string, name: string, fields: Record<string, string>) => ({ source_id, relation: name,
      availability: "AVAILABLE" as const, reason_code: null, freshness: "FRESH" as const, completeness: "COMPLETE" as const,
      as_of: new Date(NOW).toISOString(), items: [{ lineage, fields }] });
    const document: ProfileProjectionDocument = { schema_version: "portal.execution.profile-projection.v1",
      workspace_id: WS, environment: "paper", profile_id: PROFILE, source_contract_revision: "TEST_ONLY-source",
      relations: {
        "manager.accounts:accounts": relation("manager.accounts", "accounts", { account_id: "TEST_ONLY-A", base_currency: "USD" }),
        "manager.performance:account_equity_snapshots": relation("manager.performance", "account_equity_snapshots",
          { id: "10", account_id: "TEST_ONLY-A", ts: new Date(NOW).toISOString(), equity, net_pnl: "0", currency: "USD", mode: "paper" }),
      } };
    return repository.commit(document, { sourceEpoch: "TEST_ONLY-epoch", sourceCursor: cursor,
      sourceAsOf: new Date(NOW), receivedAt: new Date(NOW), completeness: "COMPLETE", retentionSeconds: 86400, maximumJournalEntries: 10 });
  }
  function service(afterCapture?: () => Promise<void>) {
    let authorizations = 0;
    const scopes = { selectionMode: async () => "LEGACY_COMPATIBILITY", authorize: async () => {
      if (++authorizations === 3) await afterCapture?.();
      return { mode: "LEGACY_COMPATIBILITY" };
    }, deliver: async (_scope: unknown, read: () => Promise<unknown>) => read() };
    const config = { FEATURE_EXECUTION_OBSERVED_READ: "true", EXECUTION_READ_PROFILE: "retained_review_v1",
      EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: WS, EXECUTION_EDGE_PAPER_PROFILE_ID: PROFILE,
      EXECUTION_EDGE_PAPER_READ_PROFILE_ID: PROFILE } as unknown as ControlApiConfig;
    const instance = new ObservedReadService(config, scopes as never, repository);
    instance.clock = () => NOW;
    return instance;
  }
  it("serves unchanged raw+retained view without comparing their unequal digests", async () => {
    const body = await service().overview(principal, "paper");
    expect(observedReadResponse.safeParse(body).success).toBe(true);
    expect(body.figures.find(row => row.figure_id === "NAV")).toMatchObject({ value: "20000", availability: "PARTIAL",
      accounts_total: 1, accounts_reported: 1, quality: { completeness: "PARTIAL", freshness: "STALE" } });
    const metadata = await repository.snapshotMetadata(WS, "paper", PROFILE);
    expect(body.projection.payload_digest).not.toBe(metadata!.payloadDigest);
    expect(body.figures.find(row => row.figure_id === "RETURN")).toMatchObject({ value: null, availability: "UNAVAILABLE" });
    expect(pool.totalCount - pool.idleCount).toBe(0);
  });
  it("refuses a new committed source after capture rather than releasing the prior derived answer", async () => {
    await expect(service(async () => { await commit("TEST_ONLY-cursor-2", "21000"); }).overview(principal, "paper"))
      .rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
    expect(pool.waitingCount).toBe(0);
    expect(pool.totalCount - pool.idleCount).toBe(0);
  });
  it("rolls back and releases the MVCC reader when the source query fails", async () => {
    vi.spyOn(repository, "snapshot").mockRejectedValueOnce(new Error("TEST_ONLY-source-query-refused"));
    await expect(service().overview(principal, "paper")).rejects.toThrow("TEST_ONLY-source-query-refused");
    expect(pool.totalCount - pool.idleCount).toBe(0);
    expect((await pool.query("SELECT 1 AS healthy")).rows[0].healthy).toBe(1);
  });
});
