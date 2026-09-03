import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { AuthSession, PortalUser } from "../src/domain";
import { ExecutionProductReadSource } from "../src/execution/product-read-source";
import { ExecutionAnalyticsProxy } from "../src/execution/analytics.proxy";
import { PaperReadService } from "../src/paper-read/paper-read.service";
import { PaperBlotterQuerySchema } from "../src/paper-read/contracts";

const user: PortalUser = {
  userId: "usr_bobby", username: "bobby", displayName: "Bobby", role: "ADMIN", status: "ACTIVE",
  mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, sessionVersion: 1,
  createdAt: new Date("2026-08-30T00:00:00Z"), updatedAt: new Date("2026-08-30T00:00:00Z"), disabledAt: null,
};
const session: AuthSession = {
  sessionId: "ses_bobby", userId: user.userId, state: "ACTIVE", sessionVersion: 1,
  authenticationTime: new Date("2026-08-30T00:00:00Z"),
  idleExpiresAt: new Date("2026-08-31T00:00:00Z"), absoluteExpiresAt: new Date("2026-09-01T00:00:00Z"),
};

type RecordInput = Record<string, string | number | boolean | null>;

class FakeCurrentSource {
  readonly calls: Array<{ screenId: string; relation: string; query: { limit?: number; cursor?: string; statuses?: readonly string[] } }> = [];
  readonly rows = new Map<string, RecordInput[]>();
  readonly next = new Map<string, string | null>();
  readonly failures = new Set<string>();
  readonly stale = new Set<string>();
  readonly exactTotals = new Map<string, number>();
  readonly filteredTotals = new Map<string, number>();
  readonly previous = new Map<string, string>();
  readonly aggregates = new Map<string, Record<string, Record<string, number>>>();

  async relation(
    _principal: unknown,
    _environment: string,
    screenId: string,
    _sourceId: string,
    relation: string,
    query: { limit?: number; cursor?: string },
  ) {
    this.calls.push({ screenId, relation, query });
    if (this.failures.has(relation)) throw new Error("source detail must not escape");
    return managerResponse(
      relation,
      this.rows.get(relation) ?? [defaultRecord(relation)],
      this.next.get(relation) ?? null,
      this.stale.has(relation) ? "STALE" : "FRESH",
      {
        exactTotal: this.exactTotals.get(relation),
        filteredTotal: this.filteredTotals.get(relation),
        previousCursor: this.previous.get(relation),
        aggregates: this.aggregates.get(relation),
      },
    );
  }
}

function defaultRecord(relation: string): RecordInput {
  const defaults: Record<string, RecordInput> = {
    strategy_deployments: { deployment_id: "dep_default", strategy_id: "str_default", account_id: "acc_default", portfolio_id: "pf_default", mode: "paper" },
    positions_v2: { position_id: "pos_default", strategy_id: "str_default", account_id: "acc_default", mode: "paper" },
    execution_sessions: { execution_session_id: "ses_default", strategy_id: "str_default", account_id: "acc_default", mode: "paper" },
    orders: { order_id: 1, strategy_id: "str_default", account_id: "acc_default", mode: "paper" },
    fills: { fill_id: 1, strategy_id: "str_default", account_id: "acc_default", mode: "paper" },
    performance_snapshots: { id: 1, deployment_id: "dep_default", strategy_id: "str_default", account_id: "acc_default", mode: "paper" },
    account_equity_snapshots: { id: 1, deployment_id: "dep_default", strategy_id: "str_default", account_id: "acc_default", mode: "paper" },
    portfolio_equity_snapshots: { id: 1, portfolio_id: "pf_default" },
    conditional_order_groups: { group_id: "grp_default", mode: "paper" },
    conditional_order_group_legs: { group_id: "grp_default", leg_id: "leg_default" },
    reconciliation_findings: { finding_id: "finding_default", mode: "paper" },
    command_journal: { command_id: "cmd_default", mode: "paper" },
  };
  return defaults[relation] ?? { mode: "paper" };
}

function service(
  source: FakeCurrentSource,
  analytics?: Pick<ExecutionAnalyticsProxy, "managerQueryAnalytics">,
): PaperReadService {
  const config = loadConfig({
    DATABASE_URL: "postgres://portal:portal@localhost/portal",
    PORTAL_ENV: "local",
    AUTH_MODE: "dev",
  });
  return new PaperReadService(
    source as unknown as ExecutionProductReadSource,
    config,
    analytics as ExecutionAnalyticsProxy | undefined,
  );
}

function principal(workspaceId = "ws_primary") { return { user, session, workspaceId }; }

function managerResponse(
  relation: string,
  rows: RecordInput[],
  nextCursor: string | null,
  freshness: "FRESH" | "STALE",
  metadata: {
    exactTotal?: number;
    filteredTotal?: number;
    previousCursor?: string;
    aggregates?: Record<string, Record<string, number>>;
  } = {},
) {
  return {
    schema_version: "portal.execution.current-source-bff.v2",
    source_environment: "paper",
    profile_id: "PAPER_BINANCE_USDM",
    source: {
      contract_version: "trading-system.portal-execution.manager-v2.runtime.v1",
      authority: "EXECUTION_CELL",
      profile_id: "PAPER_BINANCE_USDM",
      availability: "AVAILABLE",
      freshness,
      completeness: "COMPLETE",
      as_of: "2026-08-30T12:00:00Z",
      data: {
        relation: { schema: "public", relation },
        items: rows.map((fields, index) => ({
          relation: { schema: "public", relation },
          record_key: `opaque-${relation}-${index}`,
          fields: Object.fromEntries(Object.entries({ ...fields, raw_response: "must-not-leak" })
            .map(([name, value]) => [name, tagged(value)])),
        })),
        next_cursor: nextCursor,
        ...(metadata.previousCursor ? { previous_cursor: metadata.previousCursor } : {}),
        ...(metadata.exactTotal === undefined ? {} : { projected_total_items: metadata.exactTotal }),
        ...(metadata.filteredTotal === undefined ? {} : { filtered_total_items: metadata.filteredTotal }),
        ...(metadata.aggregates === undefined ? {} : { window_aggregates: metadata.aggregates }),
      },
    },
  };
}

function tagged(value: string | number | boolean | null) {
  if (value === null) return { kind: "NULL", value };
  if (typeof value === "boolean") return { kind: "BOOLEAN", value };
  if (typeof value === "number") return Number.isInteger(value)
    ? { kind: "INTEGER", value }
    : { kind: "DECIMAL", value: String(value) };
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return { kind: "TIMESTAMP", value };
  return { kind: "TEXT", value };
}

describe("N22 full Paper read product BFF", () => {
  it("composes the Paper overview with bounded fan-out and strips source internals", async () => {
    const source = new FakeCurrentSource();
    source.rows.set("strategy_deployments", [{ deployment_id: "dep_default", strategy_id: "str_default", account_id: "acc_default", portfolio_id: "pf_default", mode: "paper", venue: "BINANCE" }]);
    source.rows.set("positions_v2", [{ position_id: "pos_1", strategy_id: "str_default", account_id: "acc_default", mode: "paper", venue: "BINANCE", quantity: "1.25" }]);
    const result = await service(source).overview(principal()) as Record<string, any>;
    expect(result).toMatchObject({
      schema_version: "execution.paper-overview.v1",
      record_authority: "PORTAL_CONTROL",
      source_authority: "TRADING_SYSTEM",
      delivery_profile: "PAPER_BINANCE_USDM",
      state: "ready",
      freshness: "FRESH",
    });
    expect(source.calls).toHaveLength(6);
    expect(result.data.deployments[0]).toEqual(expect.objectContaining({ deployment_id: "dep_default" }));
    expect(JSON.stringify(result)).not.toContain("record_key");
    expect(JSON.stringify(result)).not.toContain("raw_response");
    expect(JSON.stringify(result)).not.toContain("opaque-strategy");
  });

  it("preserves the current runtime-verified source fields for every Paper overview relation", async () => {
    const source = new FakeCurrentSource();
    source.rows.set("strategy_deployments", [{
      deployment_id: "dep_1", strategy_id: "str_1", account_id: "acc_1", mode: "paper",
      venue: "BINANCE", active: true, portfolio_id: "pf_1",
    }]);
    source.rows.set("positions_v2", [{
      position_id: "pos_1", strategy_id: "str_1", account_id: "acc_1", mode: "paper",
      venue: "BINANCE", instrument_id: "BTCUSDT", side: "LONG", signed_qty: "1.25",
      avg_px_open: "60000", mark_price: "61000", unrealized_pnl: "1250",
    }]);
    source.rows.set("execution_sessions", [{
      execution_session_id: "ses_1", strategy_id: "str_1", account_id: "acc_1", mode: "paper",
      venue: "BINANCE", state: "ACTIVE", submitted_count: 11, filled_count: 9,
    }]);
    source.rows.set("performance_snapshots", [{
      id: 1, ts: "2026-08-30T12:00:00Z", deployment_id: "dep_1", strategy_id: "str_1",
      account_id: "acc_1", mode: "paper", venue: "BINANCE", equity: "101250",
      net_pnl: "1250", total_fills: 9,
    }]);
    source.rows.set("account_equity_snapshots", [{
      id: 2, ts: "2026-08-30T12:00:00Z", deployment_id: "dep_1", strategy_id: "str_1",
      account_id: "acc_1", mode: "paper", venue: "BINANCE", cash_free: "90000",
      margin_initial: "5000", equity: "101250", drawdown: "0.0125",
    }]);
    source.rows.set("portfolio_equity_snapshots", [{
      id: 3, ts: "2026-08-30T12:00:00Z", portfolio_id: "pf_1", currency: "USDT",
      allocated_capital: "100000", account_count: 1, equity: "101250", drawdown: "0.0125",
    }]);

    const result = await service(source).overview(principal()) as Record<string, any>;
    expect(result.data.deployments[0]).toMatchObject({ active: true, portfolio_id: "pf_1" });
    expect(result.data.positions[0]).toMatchObject({ signed_qty: "1.25", avg_px_open: "60000" });
    expect(result.data.sessions[0]).toMatchObject({ submitted_count: 11, filled_count: 9 });
    expect(result.data.performance[0]).toMatchObject({ deployment_id: "dep_1", equity: "101250" });
    expect(result.data.account_equity[0]).toMatchObject({ margin_initial: "5000", drawdown: "0.0125" });
    expect(result.data.portfolio_equity[0]).toMatchObject({ portfolio_id: "pf_1", account_count: 1 });
  });

  it("returns honest empty, stale and partial states without fabricating rows", async () => {
    const emptySource = new FakeCurrentSource();
    for (const relation of ["strategy_deployments", "positions_v2", "execution_sessions", "performance_snapshots", "account_equity_snapshots", "portfolio_equity_snapshots"]) {
      emptySource.rows.set(relation, []);
    }
    const empty = await service(emptySource).overview(principal()) as Record<string, any>;
    expect(empty.state).toBe("empty");
    // P4-G: `derived_insights` is a derived block, null on an empty source.
    expect(empty.data.derived_insights).toBeNull();
    const { derived_insights: _ignored, ...relations } = empty.data;
    expect(Object.values(relations).every((items) => Array.isArray(items) && items.length === 0)).toBe(true);

    const staleSource = new FakeCurrentSource();
    staleSource.stale.add("positions_v2");
    const stale = await service(staleSource).overview(principal()) as Record<string, any>;
    expect(stale).toMatchObject({ state: "stale", freshness: "STALE" });

    const failedSource = new FakeCurrentSource();
    failedSource.failures.add("positions_v2");
    const partial = await service(failedSource).overview(principal()) as Record<string, any>;
    expect(partial).toMatchObject({ state: "partial", completeness: "PARTIAL" });
    expect(partial.capabilities).toContainEqual(expect.objectContaining({
      capability_id: "source.positions", state: "UNAVAILABLE", reason_code: "N22_SOURCE_UNAVAILABLE",
    }));
  });

  it("derives overview insights from fetched relations without extra fan-out (P4-G / F15)", async () => {
    const source = new FakeCurrentSource();
    source.rows.set("execution_sessions", [
      { execution_session_id: "ses_1", strategy_id: "str_default", account_id: "acc_default", mode: "paper",
        submitted_count: 10, filled_count: 6, risk_rejected_count: 1, broker_rejected_count: 1,
        updated_at: "2026-09-02T10:00:00Z" },
    ]);
    source.rows.set("account_equity_snapshots", [
      { id: "eq1", deployment_id: "dep_default", strategy_id: "str_default", account_id: "acc_default", mode: "paper",
        currency: "USDT", equity: "10000", ts: "2026-09-01T00:00:00Z" },
      { id: "eq2", deployment_id: "dep_default", strategy_id: "str_default", account_id: "acc_default", mode: "paper",
        currency: "USDT", equity: "10100", ts: "2026-09-02T00:00:00Z" },
    ]);
    const result = await service(source).overview(principal()) as Record<string, any>;
    const insights = result.data.derived_insights;
    expect(insights).toMatchObject({
      formula_version: "paper-overview-insights.v1",
      order_funnel_7d: { total_orders: 10, status_counts: { FILLED: 6, REJECTED: 2, WORKING: 2 } },
    });
    expect(insights.cumulative_return[0]).toMatchObject({ deployment_id: "dep_default", currency: "USDT" });
    expect(insights.cumulative_return[0].points.at(-1).return_pct).toBeCloseTo(1, 3);
    expect(result.capabilities).toContainEqual(expect.objectContaining({
      capability_id: "paper.derived-insights", state: expect.stringMatching(/AVAILABLE|PARTIAL/),
    }));
    expect(source.calls.length).toBe(6);
  });

  it("publishes the versioned observation policy and an honest gate verdict (P4-I / F16)", async () => {
    const source = new FakeCurrentSource();
    source.rows.set("strategy_deployments", [
      { deployment_id: "dep_1", strategy_id: "str_1", account_id: "acc_1", mode: "paper",
        venue: "BINANCE", created_at: "2026-08-01T00:00:00Z", updated_at: "2026-09-02T00:00:00Z" },
    ]);
    source.rows.set("fills", [
      { fill_id: "fill_1", order_id: "ord_1", strategy_id: "str_1", account_id: "acc_1",
        mode: "paper", trade_time: "2026-08-05T10:00:00Z" },
      { fill_id: "fill_2", order_id: "ord_2", strategy_id: "str_1", account_id: "acc_1",
        mode: "paper", trade_time: "2026-09-01T10:00:00Z" },
    ]);
    const result = await service(source).workbench(principal(), "dep_1", false) as Record<string, any>;
    const gate = result.data.observation_gate;
    // The policy is published — the old NOT_PUBLISHED placeholder is gone.
    expect(gate).toMatchObject({
      policy_version: "execution.observation-policy.v1",
      policy_minimum_observed_days: 30,
      policy_minimum_trade_count: 300,
      observed_days: 32,
      trade_count: 2,
      window_bounded: false,
      state: "NOT_MET",
      reason_code: null,
    });
    expect(result.capabilities).toContainEqual(expect.objectContaining({
      capability_id: "workbench.observation-gate", state: "AVAILABLE", reason_code: null,
    }));
    expect(JSON.stringify(result)).not.toContain("PHASE2_OBSERVATION_POLICY_NOT_PUBLISHED");
  });

  it("labels a truncated fills window PARTIAL instead of faking a gate verdict (P4-I / F16)", async () => {
    const source = new FakeCurrentSource();
    source.rows.set("strategy_deployments", [
      { deployment_id: "dep_1", strategy_id: "str_1", account_id: "acc_1", mode: "paper",
        venue: "BINANCE", created_at: "2026-08-01T00:00:00Z", updated_at: "2026-09-02T00:00:00Z" },
    ]);
    source.rows.set("fills", [
      { fill_id: "fill_1", order_id: "ord_1", strategy_id: "str_1", account_id: "acc_1",
        mode: "paper", trade_time: "2026-08-05T10:00:00Z" },
    ]);
    source.next.set("fills", "more-fills-beyond-the-window");
    const result = await service(source).workbench(principal(), "dep_1", false) as Record<string, any>;
    expect(result.data.observation_gate).toMatchObject({
      state: "PARTIAL",
      window_bounded: true,
      reason_code: "N22_OBSERVATION_WINDOW_BOUNDED",
    });
    expect(result.capabilities).toContainEqual(expect.objectContaining({
      capability_id: "workbench.observation-gate", state: "PARTIAL",
      reason_code: "N22_OBSERVATION_WINDOW_BOUNDED",
    }));
  });

  it("maps versioned source order-status words and preserves provenance (P4-F)", async () => {
    const source = new FakeCurrentSource();
    source.rows.set("strategy_deployments", [
      { deployment_id: "dep_1", strategy_id: "str_1", account_id: "acc_1", mode: "paper", venue: "BINANCE" },
    ]);
    source.rows.set("orders", [
      { order_id: "ord_ok", status: "FILLED", strategy_id: "str_1", account_id: "acc_1", mode: "paper" },
      { order_id: "ord_risk", status: "RISK_REJECTED", strategy_id: "str_1", account_id: "acc_1", mode: "paper" },
    ]);
    const result = await service(source).workbench(principal(), "dep_1", false) as Record<string, any>;
    const risk = result.data.orders.find((item: any) => item.order_id === "ord_risk");
    // The mapped word is canonical for every consumer; the source word stays.
    expect(risk).toMatchObject({ status: "REJECTED", source_status: "RISK_REJECTED" });
    expect(result.data.orders.find((item: any) => item.order_id === "ord_ok")).toMatchObject({ status: "FILLED" });
    expect(result.capabilities).toContainEqual(expect.objectContaining({
      capability_id: "source.orders", state: "AVAILABLE",
    }));
  });

  it("quarantines a genuinely unknown order-status row without failing the branch (P4-F)", async () => {
    const source = new FakeCurrentSource();
    source.rows.set("strategy_deployments", [
      { deployment_id: "dep_1", strategy_id: "str_1", account_id: "acc_1", mode: "paper", venue: "BINANCE" },
    ]);
    source.rows.set("orders", [
      { order_id: "ord_ok", status: "FILLED", strategy_id: "str_1", account_id: "acc_1", mode: "paper" },
      { order_id: "ord_alien", status: "TOTALLY_NEW_WORD", strategy_id: "str_1", account_id: "acc_1", mode: "paper" },
    ]);
    const result = await service(source).workbench(principal(), "dep_1", false) as Record<string, any>;
    // The surviving row renders; the quarantined row is a stated, counted gap.
    expect(result.data.orders.map((item: any) => item.order_id)).toEqual(["ord_ok"]);
    expect(JSON.stringify(result)).not.toContain("TOTALLY_NEW_WORD");
    expect(result.capabilities).toContainEqual(expect.objectContaining({
      capability_id: "source.orders",
      state: "PARTIAL",
      reason_code: "N22_ORDER_STATUS_QUARANTINED",
      quarantined_rows: 1,
      status_map_version: "order-status-map.v1",
    }));
  });

  it("rejects cross-profile records at the product boundary without leaking them", async () => {
    const source = new FakeCurrentSource();
    source.rows.set("positions_v2", [{ position_id: "live-secret", mode: "live", venue: "BINANCE" }]);
    const result = await service(source).overview(principal()) as Record<string, any>;
    expect(result.state).toBe("partial");
    expect(result.data.positions).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("live-secret");
    expect(result.capabilities).toContainEqual(expect.objectContaining({
      capability_id: "source.positions",
      reason_code: "N22_CROSS_PROFILE_ROW_REJECTED",
    }));
  });

  it("scopes Workbench facts to the selected deployment and keeps unavailable analytics typed", async () => {
    const source = new FakeCurrentSource();
    source.rows.set("strategy_deployments", [
      { deployment_id: "dep_1", strategy_id: "str_1", account_id: "acc_1", mode: "paper", venue: "BINANCE" },
      { deployment_id: "dep_2", strategy_id: "str_2", account_id: "acc_2", mode: "paper", venue: "BINANCE" },
    ]);
    source.rows.set("orders", [
      { order_id: "ord_1", strategy_id: "str_1", account_id: "acc_1", mode: "paper", venue: "BINANCE" },
      { order_id: "ord_2", strategy_id: "str_2", account_id: "acc_2", mode: "paper", venue: "BINANCE" },
    ]);
    const result = await service(source).workbench(principal(), "dep_1", true) as Record<string, any>;
    expect(result).toMatchObject({
      schema_version: "execution.paper-workbench-vnm.v1",
      resource: { kind: "DEPLOYMENT", id: "dep_1" },
    });
    expect(result.data.orders.map((item: any) => item.order_id)).toEqual(["ord_1"]);
    expect(result.capabilities).toContainEqual(expect.objectContaining({
      capability_id: "market.candles", state: "UNAVAILABLE",
      reason_code: "N28_MARKET_CANDLES_SOURCE_NOT_ACTIVATED",
    }));
    expect(result.capabilities).toContainEqual(expect.objectContaining({ capability_id: "venue.calendar" }));
    expect(source.calls).toHaveLength(7);
  });

  it("composes the N25 Rust analytics envelope without recomputing it in TypeScript", async () => {
    const source = new FakeCurrentSource();
    source.rows.set("strategy_deployments", [
      { deployment_id: "dep_1", strategy_id: "str_1", account_id: "acc_1", mode: "paper" },
    ]);
    const calls: Array<{ kind: string; id: string }> = [];
    const analytics = {
      async managerQueryAnalytics(_principal: unknown, kind: string, id: string) {
        calls.push({ kind, id });
        return {
          schema_version: "execution.query-analytics-envelope.v1",
          projection_state_digest: `sha256:${"2".repeat(64)}`,
          repository_query_count: 1,
        };
      },
    };

    const result = await service(
      source,
      analytics as Pick<ExecutionAnalyticsProxy, "managerQueryAnalytics">,
    ).workbench(principal(), "dep_1", false) as Record<string, any>;

    expect(calls).toEqual([{ kind: "deployment", id: "dep_1" }]);
    expect(result.data.query_analytics).toEqual(expect.objectContaining({
      schema_version: "execution.query-analytics-envelope.v1",
      repository_query_count: 1,
    }));
    expect(result.capabilities).toContainEqual(expect.objectContaining({
      capability_id: "workbench.analytics",
      state: "AVAILABLE",
      reason_code: null,
    }));
  });

  it("wraps the Manager cursor and binds it to workspace and limit", async () => {
    const source = new FakeCurrentSource();
    source.next.set("orders", "manager-next-cursor");
    const first = await service(source).blotter(principal(), { limit: 25 }) as Record<string, any>;
    expect(first.data.page.next_cursor).toMatch(/^kc1\./);
    expect(first.data.exact_total).toBeNull();
    expect(first.capabilities).toContainEqual(expect.objectContaining({
      capability_id: "blotter.exact-query", reason_code: "PHASE2_LOCAL_EXACT_QUERY_NOT_ACTIVE",
    }));

    const reused = new FakeCurrentSource();
    await service(reused).blotter(principal(), { limit: 25, cursor: first.data.page.next_cursor });
    expect(reused.calls.find((call) => call.relation === "orders")?.query.cursor).toBe("manager-next-cursor");
    await expect(service(new FakeCurrentSource()).blotter(
      principal("ws_other"),
      { limit: 25, cursor: first.data.page.next_cursor },
    )).rejects.toMatchObject({ code: "CURSOR_CONTEXT_MISMATCH" });
    await expect(service(new FakeCurrentSource()).blotter(
      principal(),
      { limit: 26, cursor: first.data.page.next_cursor },
    )).rejects.toMatchObject({ code: "CURSOR_CONTEXT_MISMATCH" });
  });

  it("publishes exact population counts, server buckets and bidirectional cursors", async () => {
    const source = new FakeCurrentSource();
    source.rows.set("orders", [{ order_id: 7, status: "FILLED", mode: "paper" }]);
    source.exactTotals.set("orders", 12);
    source.filteredTotals.set("orders", 1);
    source.previous.set("orders", "manager-prev-cursor");
    source.aggregates.set("orders", { status: { FILLED: 1, REJECTED: 3 }, venue: { BINANCE: 12 } });

    const result = await service(source).blotter(principal(), {
      limit: 50, status_bucket: "FILLED", sort: "submitted_at_desc",
    }) as Record<string, any>;

    expect(source.calls.find((call) => call.relation === "orders")?.query.statuses).toEqual(["FILLED"]);
    expect(result.data).toMatchObject({
      exact_total: 12,
      filtered_total: 1,
      aggregates: { status: { FILLED: 1, REJECTED: 3 }, venue: { BINANCE: 12 } },
      query: { filters: { status_bucket: "FILLED" }, count_scope: "COMMITTED_HOT_PROJECTION" },
    });
    expect(result.data.page.previous_cursor).toMatch(/^kc1\./);
    expect(result.capabilities).toContainEqual(expect.objectContaining({
      capability_id: "blotter.exact-query", state: "AVAILABLE", reason_code: null,
    }));
    expect(PaperBlotterQuerySchema.safeParse({ status: "NOT_A_REAL_STATUS" }).success).toBe(false);
  });

  it("keeps the exact-query plane active when source rows need status normalization (P4-G / F14)", async () => {
    const source = new FakeCurrentSource();
    source.rows.set("orders", [
      { order_id: "ord_ok", status: "FILLED", mode: "paper" },
      { order_id: "ord_risk", status: "RISK_REJECTED", mode: "paper" },
    ]);
    source.exactTotals.set("orders", 364);
    source.filteredTotals.set("orders", 2);
    source.aggregates.set("orders", { status: { FILLED: 200, RISK_REJECTED: 30 } });

    const result = await service(source).blotter(principal(), { limit: 50 }) as Record<string, any>;

    // The dev finding F14: one RISK_REJECTED row used to fail the whole orders
    // branch, erasing exact_total/aggregates. Normalization must keep them.
    expect(result.data.orders).toHaveLength(2);
    expect(result.data.orders[1]).toMatchObject({ status: "REJECTED", source_status: "RISK_REJECTED" });
    expect(result.data.exact_total).toBe(364);
    expect(result.data.aggregates.status.RISK_REJECTED).toBe(30);
    expect(result.capabilities).toContainEqual(expect.objectContaining({
      capability_id: "blotter.exact-query", state: "AVAILABLE", reason_code: null,
    }));
    const orders = result.capabilities.find((cap: any) => cap.capability_id === "source.orders");
    expect(orders.state).not.toBe("UNAVAILABLE");
  });

  it("keeps concurrent Paper overview load inside fixed fan-out and response bounds", async () => {
    const source = new FakeCurrentSource();
    const positionRows = Array.from({ length: 200 }, (_, index) => ({
      position_id: `pos_${index}`, strategy_id: "str_1", account_id: "acc_1", mode: "paper",
      venue: "BINANCE", instrument_id: `instrument_${index}`, side: "LONG", quantity: "1.0",
    }));
    source.rows.set("positions_v2", positionRows);

    const responses = await Promise.all(Array.from({ length: 20 }, () => service(source).overview(principal())));
    expect(source.calls).toHaveLength(120);
    expect(source.calls.every((call) => (call.query.limit ?? 0) > 0 && (call.query.limit ?? 0) <= 200)).toBe(true);
    expect(responses.every((response) => Buffer.byteLength(JSON.stringify(response)) < 1_048_576)).toBe(true);
  });
});
