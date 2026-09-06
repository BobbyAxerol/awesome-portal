import { describe, expect, it, vi } from "vitest";
import { managerPage } from "../src/paper-read/manager-records";
import { ExecutionProductReadSource } from "../src/execution/product-read-source";
import { CurrentSourceProxyError } from "../src/execution/current-source.proxy";
import { testConfig } from "./harness";

const profileId = "PAPER_BINANCE_USDM";
const asOfMs = Date.parse("2026-09-06T08:30:00.000Z");

function principal() {
  const now = new Date("2026-09-06T08:00:00.000Z");
  return {
    user: {
      userId: "usr_bobby",
      username: "bobby",
      displayName: "Bobby",
      role: "ADMIN" as const,
      status: "ACTIVE" as const,
      mustChangePassword: false,
      failedLoginCount: 0,
      lockedUntil: null,
      sessionVersion: 1,
      createdAt: now,
      updatedAt: now,
      disabledAt: null,
    },
    session: {
      sessionId: "ses_bobby",
      userId: "usr_bobby",
      state: "ACTIVE" as const,
      sessionVersion: 1,
      authenticationTime: now,
      idleExpiresAt: new Date("2026-09-06T09:00:00.000Z"),
      absoluteExpiresAt: new Date("2026-09-06T16:00:00.000Z"),
    },
    workspaceId: "ws_default",
  };
}

function currentSessionsPage() {
  return {
    schema_version: "portal.execution.eds11r.manager-relation-page.v1",
    logical_operation_id: "managerExecutionSessionsPageV1",
    field_id: "managerExecutionSessionsCurrent",
    environment: "paper",
    profile_id: profileId,
    source_contract_revision: "trading-system.portal-execution.manager-v2.runtime.v1",
    source_catalogue_sha256: "sha256:6da3dcc3e2373481fe0336d74726cbd90cf0343756c27c0b5c5c6baf02037a36",
    source_health: {
      availability: "AVAILABLE",
      freshness: "FRESH",
      completeness: "COMPLETE",
      as_of_ms: asOfMs,
    },
    page: { next_cursor: "p1_test_named_continuation", has_more: true },
    records: [{
      // This is deliberately present in the input to prove the compatibility
      // adapter never leaks it through the old Manager-page envelope.
      resource_id: "por1_internal_portal_identity",
      values: {
        execution_session_id: "ses_exec_1",
        account_id: "acc_1",
        strategy_id: "str_1",
        mode: "paper",
        venue: "BINANCE",
        state: "COMPLETED",
        submitted_count: "9007199254740993",
        started_at: asOfMs,
      },
    }],
  };
}

function source(
  configOverrides: Record<string, string>,
  relationPage = vi.fn().mockResolvedValue(currentSessionsPage()),
  snapshot = vi.fn().mockResolvedValue(null),
) {
  return {
    instance: new ExecutionProductReadSource(
      testConfig({
        FEATURE_EXECUTION_EDGE: "true",
        FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true",
        EXECUTION_EDGE_PAPER_ORIGIN: "https://paper-edge.internal",
        EXECUTION_EDGE_PAPER_PROFILE_ID: profileId,
        EXECUTION_EDGE_PAPER_AUDIENCE: "portal-execution-edge-paper",
        EXECUTION_EDGE_PRIVATE_KEY_FILE: "/run/secrets/test/delegation.pem",
        EXECUTION_EDGE_CA_FILE: "/run/secrets/test/ca.crt",
        EXECUTION_EDGE_CLIENT_CERT_FILE: "/run/secrets/test/client.crt",
        EXECUTION_EDGE_CLIENT_KEY_FILE: "/run/secrets/test/client.key",
        ...configOverrides,
      }),
      { snapshot } as never,
      { relationPage } as never,
    ),
    relationPage,
  };
}

describe("EDS-11R rich-screen named warm-up", () => {
  it("uses the static R1 operation while projection is disabled and preserves exact UTC/integer values", async () => {
    const { instance, relationPage } = source({ FEATURE_EXECUTION_LOCAL_PROJECTION: "false" });

    const response = await instance.relation(
      principal(), "paper", "PAPER_TRADING_SCREEN", "manager.sessions", "execution_sessions", { limit: 25 },
    );

    expect(relationPage).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "ws_default" }), "execution-sessions", {
      environment: "paper", limit: 25,
    });
    const parsed = managerPage(response, "execution_sessions", [
      "execution_session_id", "submitted_count", "started_at", "mode",
    ]);
    expect(parsed).toMatchObject({
      asOf: "2026-09-06T08:30:00.000Z",
      freshness: "FRESH",
      completeness: "COMPLETE",
      nextCursor: "p1_test_named_continuation",
      items: [{
        execution_session_id: "ses_exec_1",
        submitted_count: "9007199254740993",
        started_at: "2026-09-06T08:30:00.000Z",
        mode: "paper",
      }],
    });
    expect(JSON.stringify(response)).not.toContain("por1_internal_portal_identity");
    expect(JSON.stringify(response)).not.toContain("manager.current.execution-sessions");
  });

  it("uses R1 only for an initial missing local projection, never for stale or scoped reads", async () => {
    const warm = source({
      FEATURE_EXECUTION_LOCAL_PROJECTION: "true",
      EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: "ws_projection",
    });
    await warm.instance.relation(
      principal(), "paper", "PAPER_TRADING_SCREEN", "manager.sessions", "execution_sessions", { limit: 1 },
    );
    expect(warm.relationPage).toHaveBeenCalledTimes(1);

    const scoped = source({ FEATURE_EXECUTION_LOCAL_PROJECTION: "false" });
    await expect(scoped.instance.relation(
      principal(), "paper", "EXECUTION_FULL_BLOTTER_SCREEN", "manager.orders", "orders",
      { limit: 1, status: "FILLED" },
    )).rejects.toMatchObject<Partial<CurrentSourceProxyError>>({
      code: "PHASE2_LOCAL_QUERY_REQUIRED",
    });
    expect(scoped.relationPage).not.toHaveBeenCalled();
  });

  it("keeps non-screen-bound projection inputs typed instead of falling back to a generic relation read", async () => {
    const { instance, relationPage } = source({ FEATURE_EXECUTION_LOCAL_PROJECTION: "false" });

    await expect(instance.relation(
      principal(), "paper", "PAPER_TRADING_SCREEN", "manager.performance", "performance_snapshots", { limit: 1 },
    )).rejects.toMatchObject<Partial<CurrentSourceProxyError>>({
      code: "EDS11R_PANEL_REQUIRES_PROJECTION",
    });
    expect(relationPage).not.toHaveBeenCalled();
  });
});
