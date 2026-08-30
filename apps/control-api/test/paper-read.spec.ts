import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { AuthSession, PortalUser } from "../src/domain";
import { ExecutionCurrentSourceProxy } from "../src/execution/current-source.proxy";
import { PaperReadService } from "../src/paper-read/paper-read.service";

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
  readonly calls: Array<{ screenId: string; relation: string; query: { limit?: number; cursor?: string } }> = [];
  readonly rows = new Map<string, RecordInput[]>();
  readonly next = new Map<string, string | null>();
  readonly failures = new Set<string>();
  readonly stale = new Set<string>();

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
    );
  }
}

function defaultRecord(relation: string): RecordInput {
  const defaults: Record<string, RecordInput> = {
    strategy_deployments: { deployment_id: "dep_default", mode: "paper" },
    positions_v2: { position_id: "pos_default", mode: "paper" },
    execution_sessions: { execution_session_id: "ses_default", mode: "paper" },
    orders: { order_id: 1, mode: "paper" },
    fills: { fill_id: 1, mode: "paper" },
    performance_snapshots: { id: 1, mode: "paper" },
    account_equity_snapshots: { id: 1, mode: "paper" },
    portfolio_equity_snapshots: { id: 1, portfolio_id: "pf_default" },
    conditional_order_groups: { group_id: "grp_default", mode: "paper" },
    conditional_order_group_legs: { group_id: "grp_default", leg_id: "leg_default" },
    reconciliation_findings: { finding_id: "finding_default", mode: "paper" },
    command_journal: { command_id: "cmd_default", mode: "paper" },
  };
  return defaults[relation] ?? { mode: "paper" };
}

function service(source: FakeCurrentSource): PaperReadService {
  const config = loadConfig({
    DATABASE_URL: "postgres://portal:portal@localhost/portal",
    PORTAL_ENV: "local",
    AUTH_MODE: "dev",
  });
  return new PaperReadService(source as unknown as ExecutionCurrentSourceProxy, config);
}

function principal(workspaceId = "ws_primary") { return { user, session, workspaceId }; }

function managerResponse(
  relation: string,
  rows: RecordInput[],
  nextCursor: string | null,
  freshness: "FRESH" | "STALE",
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
    source.rows.set("strategy_deployments", [{ deployment_id: "dep_1", strategy_id: "str_1", account_id: "acc_1", mode: "paper", venue: "BINANCE" }]);
    source.rows.set("positions_v2", [{ position_id: "pos_1", strategy_id: "str_1", account_id: "acc_1", mode: "paper", venue: "BINANCE", quantity: "1.25" }]);
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
    expect(result.data.deployments[0]).toEqual(expect.objectContaining({ deployment_id: "dep_1" }));
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
    expect(Object.values(empty.data).every((items) => Array.isArray(items) && items.length === 0)).toBe(true);

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

  it("wraps the Manager cursor and binds it to workspace and limit", async () => {
    const source = new FakeCurrentSource();
    source.next.set("orders", "manager-next-cursor");
    const first = await service(source).blotter(principal(), { limit: 25 }) as Record<string, any>;
    expect(first.data.page.next_cursor).toMatch(/^kc1\./);
    expect(first.data.exact_total).toBeNull();
    expect(first.capabilities).toContainEqual(expect.objectContaining({
      capability_id: "blotter.exact-query", reason_code: "N25_EXACT_QUERY_NOT_ACTIVE",
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
