import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { AnalyticsProxyError, analyticsResource } from "../src/execution/analytics.proxy";
import { bindCapitalPreviewRequest } from "../src/execution/analytics.controller";

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
    expect(() => analyticsResource("blotter", "../other"))
      .toThrowError(AnalyticsProxyError);
  });

  it("keeps analytics disabled by default", () => {
    expect(loadConfig(base).FEATURE_EXECUTION_ANALYTICS_QUERY)
      .toBe("false");
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
