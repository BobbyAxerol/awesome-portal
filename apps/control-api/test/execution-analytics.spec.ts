import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import {
  AnalyticsBulkhead,
  AnalyticsProxyError,
  analyticsResource,
  managerQueryAnalyticsTarget,
  typedUpstreamProblemCode,
} from "../src/execution/analytics.proxy";
import {
  bindCapitalPreviewRequest,
  shadowQueryBody,
} from "../src/execution/analytics.controller";
import { LocalQueryAnalyticsService } from "../src/execution/local-query-analytics.service";
import { ExecutionProfileProjectionRepository } from "../src/execution/profile-projection.repository";

describe("EX-BE-07b analytics screen boundary", () => {
  const base = {
    DATABASE_URL: "postgres://portal:portal@localhost/portal",
    PORTAL_ENV: "local",
    AUTH_MODE: "dev",
  };

  it("builds only allowlisted exact delegated resources", () => {
    expect(analyticsResource("gate-r2", "approval-1")).toBe(
      "execution:screen:gate-r2:approval-1",
    );
    expect(analyticsResource("portfolio-360", "PF_1")).toBe(
      "execution:screen:portfolio-360:PF_1",
    );
    expect(analyticsResource("paper-workbench", "dep_74")).toBe(
      "execution:screen:paper-workbench:dep_74",
    );
    expect(() => analyticsResource("blotter", "../other"))
      .toThrowError(AnalyticsProxyError);
  });

  it("binds each N25 subject to one fixed private path and delegated screen resource", () => {
    expect(managerQueryAnalyticsTarget("deployment", "dep_74")).toEqual({
      path: "/internal/v1/query-analytics/deployment/dep_74",
      resource: "execution:current-source:EXECUTION_PAPER_WORKBENCH_SCREEN:read",
    });
    expect(managerQueryAnalyticsTarget("alpha", "alpha_1").resource).toBe(
      "execution:current-source:EXECUTION_ALPHA_360_SCREEN:read",
    );
    expect(managerQueryAnalyticsTarget("portfolio", "PF_1").resource).toBe(
      "execution:current-source:EXECUTION_PORTFOLIO_360_SCREEN:read",
    );
    expect(managerQueryAnalyticsTarget("live-gate", "AP_1").resource).toBe(
      "execution:current-source:EXECUTION_CANARY_CONTROL_ROOM_SCREEN:read",
    );
    expect(() => managerQueryAnalyticsTarget("deployment", "../escape"))
      .toThrowError(AnalyticsProxyError);
  });

  it("keeps analytics disabled by default", () => {
    const config = loadConfig(base);
    expect(config.FEATURE_EXECUTION_ANALYTICS_QUERY).toBe("false");
    expect(config.FEATURE_EXECUTION_SHADOW_QUERY).toBe("false");
    expect(config.FEATURE_EXECUTION_PAPER_WORKBENCH_SHADOW).toBe("false");
    expect(config.EXECUTION_EDGE_ANALYTICS_MAXIMUM_CONCURRENCY).toBe(64);
    expect(config.EXECUTION_EDGE_ANALYTICS_MAXIMUM_QUEUE).toBe(128);
    expect(config.EXECUTION_EDGE_ANALYTICS_REQUEST_TIMEOUT_MS).toBe(5_000);
  });

  it("keeps the commissioned Paper screen independently gated", () => {
    expect(() => loadConfig({
      ...base,
      FEATURE_EXECUTION_PAPER_WORKBENCH_SHADOW: "true",
    })).toThrowError(/FEATURE_EXECUTION_SHADOW_QUERY/);
    expect(() => loadConfig({
      ...base,
      FEATURE_EXECUTION_SHADOW_QUERY: "true",
    })).toThrowError(/FEATURE_EXECUTION_EDGE/);
  });

  it("composes bounded exact analytics from one local projection read without cross-subject leakage", async () => {
    const config = loadConfig({
      ...base,
      FEATURE_EXECUTION_LOCAL_PROJECTION: "true",
      FEATURE_EXECUTION_EDGE: "true",
      FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true",
      EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: "ws_projection",
      EXECUTION_EDGE_PRIVATE_KEY_FILE: "/tmp/delegation.pem",
      EXECUTION_EDGE_CA_FILE: "/tmp/ca.pem",
      EXECUTION_EDGE_CLIENT_CERT_FILE: "/tmp/client.pem",
      EXECUTION_EDGE_CLIENT_KEY_FILE: "/tmp/client-key.pem",
      EXECUTION_EDGE_PAPER_ORIGIN: "https://paper.execution.internal",
      EXECUTION_EDGE_PAPER_AUDIENCE: "portal-execution-edge-paper",
      EXECUTION_EDGE_PAPER_PROFILE_ID: "PAPER_BINANCE_USDM",
      EXECUTION_EDGE_SANDBOX_PROFILE_ID: "SANDBOX_BINANCE_USDM",
      EXECUTION_EDGE_LIVE_PROFILE_ID: "LIVE_BINANCE_USDM",
    });
    let reads = 0;
    const row = (fields: Record<string, string | number | boolean | null>) => ({
      lineage: {
        workspace_id: "ws_projection", profile_id: "PAPER_BINANCE_USDM",
        source_contract_revision: "manager-v2",
      },
      fields,
    });
    const relation = (source_id: string, name: string, items: ReturnType<typeof row>[]) => ({
      source_id, relation: name, availability: "AVAILABLE" as const, reason_code: null,
      as_of: "2026-09-02T06:00:00.000Z", freshness: "FRESH" as const,
      completeness: "COMPLETE" as const, items,
    });
    const repository = {
      async snapshot() {
        reads += 1;
        return {
          document: {
            schema_version: "portal.execution.profile-projection.v1" as const,
            workspace_id: "ws_projection", environment: "paper" as const,
            profile_id: "PAPER_BINANCE_USDM", source_contract_revision: "manager-v2",
            relations: {
              "manager.deployments:strategy_deployments": relation("manager.deployments", "strategy_deployments", [
                row({ deployment_id: "dep_a", strategy_id: "alpha_a", account_id: "acc_a", portfolio_id: "pf_a", currency: "USDT", mode: "paper" }),
                row({ deployment_id: "dep_b", strategy_id: "alpha_b", account_id: "acc_b", portfolio_id: "pf_b", currency: "USDT", mode: "paper" }),
              ]),
              "manager.sessions:execution_sessions": relation("manager.sessions", "execution_sessions", [
                row({ execution_session_id: "ses_a", strategy_id: "alpha_a", account_id: "acc_a", submitted_count: 3, risk_rejected_count: 1, broker_rejected_count: 0, filled_count: 2, updated_at: "2026-09-02T06:00:00Z" }),
              ]),
              "manager.orders:orders": relation("manager.orders", "orders", [
                row({ order_id: "ord_a", client_order_id: "client_a", strategy_id: "alpha_a", account_id: "acc_a", status: "FILLED", quantity: "0.100000000000000001", submitted_at: "2026-09-02T05:00:00Z" }),
                row({ order_id: "ord_b", client_order_id: "client_b", strategy_id: "alpha_b", account_id: "acc_b", status: "OPEN", quantity: "99", submitted_at: "2026-09-02T05:00:00Z" }),
              ]),
              "manager.fills:fills": relation("manager.fills", "fills", [
                row({ fill_id: "fill_a", client_order_id: "client_a", strategy_id: "alpha_a", account_id: "acc_a", quantity: "0.100000000000000001", price: "60000.123456789012345678", realized_pnl: "1.000000000000000001", trade_time: "2026-09-02T05:01:00Z" }),
              ]),
              "manager.positions:positions_v2": relation("manager.positions", "positions_v2", [
                row({ position_id: "pos_a", strategy_id: "alpha_a", account_id: "acc_a", quantity: "0.1", notional: "6000.012345678901234568", realized_pnl: "1.000000000000000001", updated_at: "2026-09-02T05:02:00Z" }),
              ]),
              "manager.performance:account_equity_snapshots": relation("manager.performance", "account_equity_snapshots", [
                row({ id: "eq_a", deployment_id: "dep_a", strategy_id: "alpha_a", account_id: "acc_a", currency: "USDT", equity: "10000.000000000000000001", ts: "2026-09-02T05:03:00Z" }),
              ]),
            },
          },
          sourceEpoch: "source-epoch", sourceCursor: "source-cursor",
          sourceAsOf: new Date("2026-09-02T06:00:00Z"),
          receivedAt: new Date(), lastSuccessfulRefreshAt: new Date(), completeness: "COMPLETE" as const,
          projectionEpoch: "3b2d15c5-e36f-4a2f-91bf-18bb58ba76f4",
          projectionSequence: 7, payloadDigest: `sha256:${"2".repeat(64)}`,
        };
      },
    } as unknown as ExecutionProfileProjectionRepository;
    const service = new LocalQueryAnalyticsService(config, repository);
    const response = await service.query({
      user: { userId: "usr_a" } as never,
      session: { sessionId: "ses_a" } as never,
      workspaceId: "ws_viewer",
    }, "alpha", "alpha_a");
    expect(reads).toBe(1);
    expect(response).toMatchObject({
      schema_version: "execution.query-analytics-envelope.v1",
      source_side_effect_requested: false,
      repository_query_count: 1,
      analytics: {
        subject_kind: "ALPHA", subject_id: "alpha_a", source_fact_count: 6,
        order_funnel: { total_orders: 1, status_counts: { FILLED: 1 } },
        execution_quality: { submitted_count: 3, risk_rejected_count: 1, filled_count: 2 },
      },
    });
    const analytics = response.analytics as Record<string, unknown>;
    expect((analytics.capabilities as unknown[])).toHaveLength(12);
    expect(JSON.stringify(response)).not.toContain("ord_b");
    expect(JSON.stringify(response)).toContain("10000.000000000000000001");
  });

  it("normalizes only bounded screen query fields and never accepts deployment scope", () => {
    expect(shadowQueryBody({
      limit: 50,
      status: "OPEN,PARTIALLY_FILLED",
      currency: "USDT",
      instrument_id: "BTC",
      sort: "as_of",
      direction: "desc",
    })).toEqual({
      limit: 50,
      filters: [
        { field: "status", operator: "in", values: ["OPEN", "PARTIALLY_FILLED"] },
        { field: "currency", operator: "in", values: ["USDT"] },
        { field: "instrument_id", operator: "contains", values: ["BTC"] },
      ],
      sorts: [{ field: "as_of", direction: "desc" }],
      after: undefined,
      before: undefined,
    });
    expect(() => shadowQueryBody({
      limit: 10,
      status: Array.from({ length: 21 }, (_, index) => `S${index}`).join(","),
      sort: "status",
      direction: "asc",
    })).toThrowError(AnalyticsProxyError);
  });

  it("preserves only bounded typed Rust errors with an exact status", () => {
    expect(typedUpstreamProblemCode(
      Buffer.from(JSON.stringify({ code: "N07_CURSOR_RESNAPSHOT_REQUIRED", status: 409 })),
      true,
      409,
    )).toBe("N07_CURSOR_RESNAPSHOT_REQUIRED");
    expect(typedUpstreamProblemCode(
      Buffer.from(JSON.stringify({ code: "N07_CURSOR_RESNAPSHOT_REQUIRED", status: 500 })),
      true,
      409,
    )).toBeNull();
    expect(typedUpstreamProblemCode(
      Buffer.from(JSON.stringify({ code: "SOURCE_SECRET_DETAIL", status: 502 })),
      true,
      502,
    )).toBeNull();
    expect(typedUpstreamProblemCode(
      Buffer.from(JSON.stringify({ error: { code: "N25_PROJECTION_CYCLE_NOT_FOUND", message: "not forwarded" } })),
      true,
      503,
    )).toBe("N25_PROJECTION_CYCLE_NOT_FOUND");
    expect(typedUpstreamProblemCode(
      Buffer.from(JSON.stringify({ error: { code: "SOURCE_SECRET_DETAIL", message: "not forwarded" } })),
      true,
      503,
    )).toBeNull();
  });

  it("bounds analytics concurrency and queue depth", async () => {
    const bulkhead = new AnalyticsBulkhead(1, 1, 1_000);
    const releaseFirst = await bulkhead.acquire();
    const second = bulkhead.acquire();
    await expect(bulkhead.acquire()).rejects.toMatchObject({
      code: "ANALYTICS_QUEUE_FULL",
      status: 503,
    });
    releaseFirst();
    const releaseSecond = await second;
    releaseSecond();
  });

  it("expires queued analytics work without leaking a permit", async () => {
    const bulkhead = new AnalyticsBulkhead(1, 1, 10);
    const releaseFirst = await bulkhead.acquire();
    await expect(bulkhead.acquire()).rejects.toMatchObject({
      code: "ANALYTICS_QUEUE_TIMEOUT",
      status: 503,
    });
    releaseFirst();
    const releaseNext = await bulkhead.acquire();
    releaseNext();
  });

  it("fails closed unless edge identity and mTLS material are configured", () => {
    expect(() => loadConfig({
      ...base,
      FEATURE_EXECUTION_ANALYTICS_QUERY: "true",
    })).toThrowError(/FEATURE_EXECUTION_EDGE/);
    expect(() => loadConfig({
      ...base,
      FEATURE_EXECUTION_EDGE: "true",
      FEATURE_EXECUTION_ANALYTICS_QUERY: "true",
      EXECUTION_EDGE_PRIVATE_KEY_FILE: "/run/secrets/delegation.key",
    })).toThrowError(/mTLS/);
  });

  it("requires an environment-matched Manager profile for N25 analytics", () => {
    const configured = {
      ...base,
      FEATURE_EXECUTION_EDGE: "true",
      FEATURE_EXECUTION_ANALYTICS_QUERY: "true",
      EXECUTION_EDGE_ORIGIN: "https://edge.internal:8443",
      EXECUTION_EDGE_PRIVATE_KEY_FILE: "/run/secrets/delegation.key",
      EXECUTION_EDGE_CA_FILE: "/run/secrets/ca.crt",
      EXECUTION_EDGE_CLIENT_CERT_FILE: "/run/secrets/client.crt",
      EXECUTION_EDGE_CLIENT_KEY_FILE: "/run/secrets/client.key",
    };
    expect(() => loadConfig(configured)).toThrowError(/exact Manager-v2 profile binding/);
    expect(() => loadConfig({
      ...configured,
      EXECUTION_EDGE_MANAGER_V2_PROFILE_ID: "LIVE_BINANCE_USDM",
      EXECUTION_EDGE_PROJECTION_WORKSPACE_ID: "workspace_execution_manager",
    })).toThrowError(/profile must match/);
    expect(() => loadConfig({
      ...configured,
      EXECUTION_EDGE_MANAGER_V2_PROFILE_ID: "PAPER_BINANCE_USDM",
    })).toThrowError(/projection workspace binding/);
    expect(loadConfig({
      ...configured,
      EXECUTION_EDGE_MANAGER_V2_PROFILE_ID: "PAPER_BINANCE_USDM",
      EXECUTION_EDGE_PROJECTION_WORKSPACE_ID: "workspace_execution_manager",
    }).FEATURE_EXECUTION_ANALYTICS_QUERY).toBe("true");
  });

  it("binds capital preview to the immutable approval portfolio and currency", () => {
    const scope = {
      approvalId: "approval-1",
      workspaceId: "workspace-1",
      portfolioId: "PF_1",
      currency: "USDT",
    };
    expect(bindCapitalPreviewRequest({
      portfolio_id: "PF_1",
      requested_amount: "125.250000000000000001",
      currency: "USDT",
    }, scope)).toEqual({
      portfolio_id: "PF_1",
      requested_amount: "125.250000000000000001",
      currency: "USDT",
    });
    expect(() => bindCapitalPreviewRequest({
      portfolio_id: "PF_OTHER",
      requested_amount: "1",
      currency: "USDT",
    }, scope)).toThrowError(AnalyticsProxyError);
    expect(() => bindCapitalPreviewRequest({
      portfolio_id: "PF_1",
      requested_amount: 1,
      currency: "USDT",
    }, scope)).toThrowError(AnalyticsProxyError);
  });
});
