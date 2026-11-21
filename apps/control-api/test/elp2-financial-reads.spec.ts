import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { ExecutionDurableFinancialRepository } from "../src/execution/durable-financial.repository";
import type { AuthorizedExecutionReadScope } from "../src/execution-v2/read-scope";
import { testConfig } from "./harness";

describe("ELP2-04 financial repository rejects unminted scopes", () => {
  it("never treats a JSON scope as authority before reading counts or financial rows", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("SELECT r.read_model_revision") ? { rows: [{ read_model_revision: "revision", projection_epoch: "epoch",
      projection_sequence: "1", payload_digest: "digest", source_catalogue_sha256: null, received_at: new Date() }] } : { rows: [] });
    const release = vi.fn(), pool = { connect: async () => ({ query, release }) } as unknown as Pool;
    const repository = new ExecutionDurableFinancialRepository(pool, testConfig({ AUTH_MODE: "dev",
      EXECUTION_DATABASE_URL: "postgres://test_only:test_only@127.0.0.1:1/isolated_not_connected",
      EXECUTION_READ_PROFILE: "retained_review_v1", FEATURE_EXECUTION_LOCAL_PROJECTION: "true",
      EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: "workspace", EXECUTION_EDGE_PAPER_PROFILE_ID: "PAPER_BINANCE_USDM",
      EXECUTION_EDGE_SANDBOX_PROFILE_ID: "SANDBOX_BINANCE_USDM", EXECUTION_EDGE_LIVE_PROFILE_ID: "LIVE_BINANCE_USDM" }));
    await expect(repository.series({ workspaceId: "workspace", environment: "paper", profileId: "PAPER_TEST",
      relationKey: "manager.performance:performance_snapshots", valueField: "equity", subject: { kind: "alpha", id: "alpha" },
      fromMs: null, toMs: null, targetPoints: 512, authorizedScope: { mode: "SCOPED_V2" } as AuthorizedExecutionReadScope }))
      .rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_REQUIRED" });
    expect(query.mock.calls.some(([sql]) => sql.includes("count(*)") || sql.includes("WITH scoped AS"))).toBe(false);
    expect(release).toHaveBeenCalledOnce();
  });
});
