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
import { computePortfolioStatistics, LocalQueryAnalyticsService } from "../src/execution/local-query-analytics.service";
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
        source_facts: {
          deployments: [{ deployment_id: "dep_a" }],
          positions: [{ position_id: "pos_a" }],
          orders: [{ order_id: "ord_a" }],
          fills: [{ fill_id: "fill_a" }],
        },
      },
    });
    const analytics = response.analytics as Record<string, unknown>;
    expect((analytics.capabilities as unknown[])).toHaveLength(12);
    expect(JSON.stringify(response)).not.toContain("ord_b");
    expect(JSON.stringify(response)).toContain("10000.000000000000000001");
  });

  it("serves the subject's 30-day mirror depth in the stage-equity series (owner directive 2026-09-03)", async () => {
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
    const historyCalls: unknown[][] = [];
    const now = Date.now();
    const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000).toISOString();
    const repository = {
      async snapshot() {
        return {
          document: {
            schema_version: "portal.execution.profile-projection.v1" as const,
            workspace_id: "ws_projection", environment: "paper" as const,
            profile_id: "PAPER_BINANCE_USDM", source_contract_revision: "manager-v2",
            relations: {
              "manager.strategies:strategies": relation("manager.strategies", "strategies", [
                row({ strategy_id: "alpha_a", alpha_id: "alpha_display_a" }),
              ]),
              "manager.deployments:strategy_deployments": relation("manager.deployments", "strategy_deployments", [
                row({ deployment_id: "dep_a", strategy_id: "alpha_a", account_id: "acc_a", currency: "USDT", mode: "paper" }),
              ]),
              // The bounded snapshot window holds ONE newest point.
              "manager.performance:account_equity_snapshots": relation("manager.performance", "account_equity_snapshots", [
                row({ id: 900, deployment_id: "dep_a", strategy_id: "alpha_a", account_id: "acc_a", currency: "USDT", equity: "10100", ts: iso(1) }),
              ]),
            },
          },
          sourceEpoch: "source-epoch", sourceCursor: "source-cursor",
          sourceAsOf: new Date(), receivedAt: new Date(), lastSuccessfulRefreshAt: new Date(),
          completeness: "COMPLETE" as const,
          projectionEpoch: "3b2d15c5-e36f-4a2f-91bf-18bb58ba76f4",
          projectionSequence: 9, payloadDigest: `sha256:${"4".repeat(64)}`,
        };
      },
      async timeSeriesHistoryDownsampled(...args: unknown[]) {
        historyCalls.push(args);
        const relationKey = args[3] as string;
        const query = args[4] as { entity?: { field: string; value: string } };
        if (relationKey !== "manager.performance:account_equity_snapshots") return { rows: [], sourceRows: 0, downsample: null };
        // The alpha subject resolves through the strategies relation.
        expect(query.entity).toEqual({ field: "strategy_id", value: "alpha_a" });
        return {
          sourceRows: 720,
          downsample: null,
          rows: Array.from({ length: 720 }, (_, index) => ({
            rowId: String(index),
            ts: iso(720 - index),
            fields: {
              id: index, deployment_id: "dep_a", strategy_id: "alpha_a", account_id: "acc_a",
              currency: "USDT", equity: "10000", ts: iso(720 - index),
            },
          })),
        };
      },
    } as unknown as ExecutionProfileProjectionRepository;
    const service = new LocalQueryAnalyticsService(config, repository);
    const response = await service.query({
      user: { userId: "usr_a" } as never,
      session: { sessionId: "ses_a" } as never,
      workspaceId: "ws_viewer",
    }, "alpha", "alpha_display_a") as Record<string, any>;
    // The stage-equity series carries the full 30-day mirror depth, declared.
    expect(response.analytics.chart_series[0].points).toHaveLength(720);
    expect(response.analytics.history_windows.accountEquity).toMatchObject({
      days: 30, basis: "PORTAL_SGP_HISTORY_MIRROR", returned_rows: 720,
      source_rows: 720, truncated: false,
    });
    expect(response.repository_query_count).toBe(5);
    expect(historyCalls).toHaveLength(2);
  });

  it("sums a multi-account subject into one declared DERIVED line instead of interleaving raw points", async () => {
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
    const now = Date.now();
    const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000).toISOString();
    const repository = {
      async snapshot() {
        return {
          document: {
            schema_version: "portal.execution.profile-projection.v1" as const,
            workspace_id: "ws_projection", environment: "paper" as const,
            profile_id: "PAPER_BINANCE_USDM", source_contract_revision: "manager-v2",
            relations: {
              "manager.deployments:strategy_deployments": relation("manager.deployments", "strategy_deployments", [
                row({ deployment_id: "dep_a", strategy_id: "alpha_a", account_id: "acc_a", currency: "USDT", mode: "paper" }),
                row({ deployment_id: "dep_a", strategy_id: "alpha_a", account_id: "acc_b", currency: "USDT", mode: "paper" }),
              ]),
              // Two accounts at unrelated equity levels: interleaving their
              // raw points once drew needle spikes between 100 and 9000.
              "manager.performance:account_equity_snapshots": relation("manager.performance", "account_equity_snapshots", [
                row({ id: 1, deployment_id: "dep_a", account_id: "acc_a", currency: "USDT", equity: "100", ts: iso(3) }),
                row({ id: 2, deployment_id: "dep_a", account_id: "acc_b", currency: "USDT", equity: "9000", ts: iso(2) }),
                row({ id: 3, deployment_id: "dep_a", account_id: "acc_a", currency: "USDT", equity: "110", ts: iso(1) }),
              ]),
            },
          },
          sourceEpoch: "source-epoch", sourceCursor: "source-cursor",
          sourceAsOf: new Date(), receivedAt: new Date(), lastSuccessfulRefreshAt: new Date(),
          completeness: "COMPLETE" as const,
          projectionEpoch: "3b2d15c5-e36f-4a2f-91bf-18bb58ba76f4",
          projectionSequence: 9, payloadDigest: `sha256:${"4".repeat(64)}`,
        };
      },
      async timeSeriesHistoryDownsampled() { return { rows: [], sourceRows: 0, downsample: null }; },
    } as unknown as ExecutionProfileProjectionRepository;
    const service = new LocalQueryAnalyticsService(config, repository);
    const response = await service.query({
      user: { userId: "usr_a" } as never,
      session: { sessionId: "ses_a" } as never,
      workspaceId: "ws_viewer",
    }, "deployment", "dep_a") as Record<string, any>;
    const series = response.analytics.chart_series[0];
    expect(series).toMatchObject({
      series_id: "equity",
      authority: "DERIVED",
      formula_version: "equity-account-sum.v1",
    });
    // Forward-filled exact sum from the moment both accounts exist: never a
    // raw 9000-next-to-110 zig-zag.
    expect(series.points.map((point: { value: string }) => point.value)).toEqual(["9100", "9110"]);
  });

  it("derives an exact portfolio equity series while the source relation stays rejected (P4-D / F7)", async () => {
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
        return {
          document: {
            schema_version: "portal.execution.profile-projection.v1" as const,
            workspace_id: "ws_projection", environment: "paper" as const,
            profile_id: "PAPER_BINANCE_USDM", source_contract_revision: "manager-v2",
            relations: {
              "manager.portfolios:portfolios": relation("manager.portfolios", "portfolios", [
                row({ portfolio_id: "pf_a", name: "Pf A", base_currency: "USDT" }),
              ]),
              "manager.portfolios:portfolio_allocations": relation("manager.portfolios", "portfolio_allocations", [
                row({ allocation_id: "al_a", portfolio_id: "pf_a", strategy_id: "alpha_a", deployment_id: "dep_a", account_id: "acc_a", currency: "USDT", allocated_capital: "1000" }),
                row({ allocation_id: "al_b", portfolio_id: "pf_a", strategy_id: "alpha_b", deployment_id: "dep_b", account_id: "acc_b", currency: "USDT", allocated_capital: "1000" }),
              ]),
              "manager.deployments:strategy_deployments": relation("manager.deployments", "strategy_deployments", [
                row({ deployment_id: "dep_a", strategy_id: "alpha_a", account_id: "acc_a", portfolio_id: "pf_a", currency: "USDT", mode: "paper" }),
                row({ deployment_id: "dep_b", strategy_id: "alpha_b", account_id: "acc_b", portfolio_id: "pf_a", currency: "USDT", mode: "paper" }),
              ]),
              "manager.performance:account_equity_snapshots": relation("manager.performance", "account_equity_snapshots", [
                row({ id: "eq_a1", deployment_id: "dep_a", strategy_id: "alpha_a", account_id: "acc_a", currency: "USDT", equity: "10000.000000000000000001", ts: "2026-09-02T05:00:00Z" }),
                row({ id: "eq_b1", deployment_id: "dep_b", strategy_id: "alpha_b", account_id: "acc_b", currency: "USDT", equity: "5000.5", ts: "2026-09-02T05:10:00Z" }),
                row({ id: "eq_a2", deployment_id: "dep_a", strategy_id: "alpha_a", account_id: "acc_a", currency: "USDT", equity: "10100", ts: "2026-09-02T05:20:00Z" }),
              ]),
            },
          },
          sourceEpoch: "source-epoch", sourceCursor: "source-cursor",
          sourceAsOf: new Date("2026-09-02T06:00:00Z"),
          receivedAt: new Date(), lastSuccessfulRefreshAt: new Date(), completeness: "COMPLETE" as const,
          projectionEpoch: "3b2d15c5-e36f-4a2f-91bf-18bb58ba76f4",
          projectionSequence: 8, payloadDigest: `sha256:${"3".repeat(64)}`,
        };
      },
    } as unknown as ExecutionProfileProjectionRepository;
    const service = new LocalQueryAnalyticsService(config, repository);
    const response = await service.query({
      user: { userId: "usr_a" } as never,
      session: { sessionId: "ses_a" } as never,
      workspaceId: "ws_viewer",
    }, "portfolio", "pf_a") as Record<string, any>;
    const series = response.analytics.chart_series;
    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({
      series_id: "portfolio_equity_derived",
      authority: "DERIVED",
      formula_version: "portfolio-equity-derived.v1",
      currency: "USDT",
    });
    // Points begin only once BOTH member accounts have reported (05:10), and
    // every sum is exact-decimal: 10000.000000000000000001 + 5000.5, then the
    // forward-filled 10100 + 5000.5.
    expect(series[0].points).toEqual([
      { timestamp: "2026-09-02T05:10:00.000Z", value: "15000.500000000000000001" },
      { timestamp: "2026-09-02T05:20:00.000Z", value: "15100.5" },
    ]);
  });

  it("admits the colon-joined composite deployment id as an analytics subject (P4-G / F13)", async () => {
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
    const repository = {
      async snapshot() { return null; },
    } as unknown as ExecutionProfileProjectionRepository;
    const service = new LocalQueryAnalyticsService(config, repository);
    // The id is valid; the missing snapshot must surface as the projection
    // state, never as an identifier rejection.
    await expect(
      service.query({
        user: { userId: "usr_a" } as never,
        session: { sessionId: "ses_a" } as never,
        workspaceId: "ws_viewer",
      }, "deployment", "adaptive_hma_cpp_00115m:paper:BINANCE:paper-binance-adaptive_hma_cpp_00115m"),
    ).rejects.toMatchObject({ code: expect.not.stringMatching(/IDENTIFIER_INVALID/) });
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

describe("cross-alpha statistics from the mirror (§14 E1)", () => {
  it("computes correlation pairs and drawdown overlap from daily closes", () => {
    const closes: Array<{ strategyId: string; accountId: string; day: string; value: string }> = [];
    const day = (index: number) => `2026-08-${String(10 + index).padStart(2, "0")}`;
    // Anti-phase zig-zags: on odd days alpha_up gains 2% while alpha_down
    // loses 2%; even days are flat for both. Returns therefore deviate in
    // exact opposition (a monotone falling LINE would still correlate
    // positively — correlation measures co-variation, not trend direction).
    let levelUp = 100;
    let levelDown = 100;
    for (let index = 0; index < 12; index += 1) {
      if (index > 0 && index % 2 === 1) { levelUp *= 1.02; levelDown *= 0.98; }
      closes.push({ strategyId: "alpha_up", accountId: "acc_1", day: day(index), value: levelUp.toFixed(6) });
      closes.push({ strategyId: "alpha_twin", accountId: "acc_2", day: day(index), value: (2 * levelUp).toFixed(6) });
      closes.push({ strategyId: "alpha_down", accountId: "acc_3", day: day(index), value: levelDown.toFixed(6) });
    }
    const statistics = computePortfolioStatistics(closes)!;
    expect(statistics.window).toMatchObject({ days: 12, basis: "PORTAL_SGP_HISTORY_MIRROR" });
    const pair = (left: string, right: string) =>
      statistics.correlation.pairs.find((entry) => entry.left_alpha === left && entry.right_alpha === right)!;
    // Monotone rising twins correlate to +1; the falling alpha correlates
    // negatively (returns on different bases are not exactly -1).
    expect(pair("alpha_twin", "alpha_up").correlation).toBeCloseTo(1, 3);
    expect(pair("alpha_twin", "alpha_up").overlapping_days).toBe(11);
    expect(pair("alpha_down", "alpha_up").correlation).toBeLessThan(-0.99);
    // Drawdown: rising alphas never draw down; the falling one bottoms at
    // (100/111 - 1) and stays counted from its running peak.
    const down = statistics.drawdownOverlap.alphas.find((entry) => entry.alpha_id === "alpha_down")!;
    expect(down.max_drawdown).toBeCloseTo(0.98 ** 6 - 1, 4);
    expect(down.max_drawdown_at).toBe(day(11));
    const up = statistics.drawdownOverlap.alphas.find((entry) => entry.alpha_id === "alpha_up")!;
    expect(up.max_drawdown).toBe(0);
    // Only one alpha is ever in drawdown, so no overlap window exists.
    expect(statistics.drawdownOverlap.overlaps).toEqual([]);
  });

  it("returns null when the mirror has no usable closes", () => {
    expect(computePortfolioStatistics([])).toBeNull();
  });
});
