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
