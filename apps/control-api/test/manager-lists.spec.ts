import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { AuthSession, PortalUser } from "../src/domain";
import { ExecutionProductReadSource } from "../src/execution/product-read-source";
import { ManagerListsRepository } from "../src/manager-lists/manager-lists.repository";
import { ManagerListsService } from "../src/manager-lists/manager-lists.service";
import { AlphaFleetQuerySchema, BindingsQuerySchema } from "../src/manager-lists/contracts";
import { migrateTestDatabase, testConfig, truncateAll } from "./harness";

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const user: PortalUser = {
  userId: "usr_bobby", username: "bobby", displayName: "Bobby", role: "ADMIN", status: "ACTIVE",
  mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, sessionVersion: 1,
  createdAt: new Date("2026-08-31T00:00:00Z"), updatedAt: new Date("2026-08-31T00:00:00Z"), disabledAt: null,
};
const session: AuthSession = {
  sessionId: "ses_bobby", userId: user.userId, state: "ACTIVE", sessionVersion: 1,
  authenticationTime: new Date("2026-08-31T00:00:00Z"),
  idleExpiresAt: new Date("2026-09-01T00:00:00Z"), absoluteExpiresAt: new Date("2026-09-01T08:00:00Z"),
};

type Scalar = string | number | boolean | null;

class FakeSource {
  readonly calls: string[] = [];
  pause: Promise<void> | null = null;
  leakUnscopedChildren = false;
  readonly rows: Record<string, Array<Record<string, Scalar>>> = {
    strategies: [
      { strategy_id: "str_a", alpha_id: "alpha_a", label: "Carry A", version: "3.2", trader_id: "Bobby-001", state: "READY", active: true, updated_at: "2026-08-31T09:00:00Z", secret_token: "never" },
      { strategy_id: "str_b", alpha_id: "alpha_b", label: "Breakout B", version: "1.1", trader_id: "Bobby-001", state: "READY", active: true, updated_at: "2026-08-31T08:00:00Z" },
    ],
    strategy_deployments: [
      { deployment_id: "dep_a", strategy_id: "str_a", account_id: "acc_a", mode: "paper", venue: "BINANCE", currency: "USDT", portfolio_id: "pf_main", state: "ACTIVE", active: true, updated_at: "2026-08-31T10:00:00Z" },
      { deployment_id: "dep_b", strategy_id: "str_b", account_id: "acc_b", mode: "paper", venue: "BYBIT", currency: "USDT", portfolio_id: "pf_main", state: "ACTIVE", active: true, updated_at: "2026-08-31T08:30:00Z" },
    ],
    accounts: [
      { account_id: "acc_a", trader_id: "Bobby-001", strategy_id: "str_a", mode: "paper", venue: "BINANCE", base_currency: "USDT", external_account_ref: "ext_a", active: true, updated_at: "2026-08-31T09:30:00Z" },
      { account_id: "acc_b", trader_id: "Bobby-001", strategy_id: "str_b", mode: "paper", venue: "BYBIT", base_currency: "USDT", external_account_ref: "ext_b", active: false, updated_at: "2026-08-31T08:30:00Z" },
    ],
    account_balances: [
      { account_id: "acc_a", currency: "USDT", total: "20123.19605", locked: "0", free: "20123.19605", updated_at: "2026-08-31T10:00:00Z" },
      { account_id: "acc_b", currency: "USDT", total: "10000", locked: "100", free: "9900", updated_at: "2026-08-31T08:30:00Z" },
    ],
    portfolios: [{ portfolio_id: "pf_main", name: "Main", owner: "bobby", base_currency: "USDT", state: "ACTIVE", updated_at: "2026-08-31T09:00:00Z" }],
    portfolio_allocations: [
      { allocation_id: "alloc_a", portfolio_id: "pf_main", strategy_id: "str_a", deployment_id: "dep_a", account_id: "acc_a", mode: "paper", venue: "BINANCE", currency: "USDT", allocated_capital: "20000", max_capital: "25000", state: "ACTIVE", updated_at: "2026-08-31T09:00:00Z" },
      { allocation_id: "alloc_b", portfolio_id: "pf_main", strategy_id: "str_b", deployment_id: "dep_b", account_id: "acc_b", mode: "paper", venue: "BYBIT", currency: "USDT", allocated_capital: "10000", max_capital: "12000", state: "ACTIVE", updated_at: "2026-08-31T08:00:00Z" },
    ],
    positions_v2: [
      { position_id: "pos_a", strategy_id: "str_a", account_id: "acc_a", mode: "paper", venue: "BINANCE", instrument_id: "ETHUSDT.BINANCE", realized_pnl: "123.19605", unrealized_pnl: "0", notional: "0", updated_at: "2026-08-31T10:00:00Z" },
    ],
    reconciliation_findings: [],
    venue_accounts: [],
    broker_account_sync_effective: [
      { sync_id: "sync_a", external_account_ref: "ext_a", mode: "paper", venue: "BINANCE", status: "SYNCED", synced_at: "2026-08-31T09:31:00Z" },
    ],
  };

  async relation(
    _principal: unknown, environment: string, screenId: string, _sourceId: string,
    relation: string, query: { cursor?: string },
  ) {
    this.calls.push(`${environment}:${screenId}:${relation}`);
    if (this.pause) await this.pause;
    const acceptedAccounts = new Set(this.rows.accounts
      .filter((row) => row.mode === environment)
      .map((row) => String(row.account_id)));
    const acceptedRefs = new Set(this.rows.accounts
      .filter((row) => row.mode === environment)
      .map((row) => String(row.external_account_ref ?? "")));
    const all = (this.rows[relation] ?? []).filter((row) => {
      if (typeof row.mode === "string") return row.mode.toLowerCase() === environment;
      if (!this.leakUnscopedChildren && relation === "account_balances") {
        return acceptedAccounts.has(String(row.account_id));
      }
      if (!this.leakUnscopedChildren && relation === "broker_account_sync_effective") {
        return acceptedRefs.has(String(row.external_account_ref));
      }
      return true;
    });
    const start = query.cursor ? Number(query.cursor) : 0;
    const slice = all.slice(start, start + 1);
    const next = start + 1 < all.length ? String(start + 1) : null;
    return managerResponse(environment, relation, slice, next);
  }
}

function tagged(value: Scalar) {
  if (value === null) return { kind: "NULL", value };
  if (typeof value === "boolean") return { kind: "BOOLEAN", value };
  if (typeof value === "number") return { kind: "INTEGER", value };
  return { kind: value.includes("T") && value.endsWith("Z") ? "TIMESTAMP" : "TEXT", value };
}

function managerResponse(environment: string, relation: string, rows: Array<Record<string, Scalar>>, next: string | null) {
  const profileId = `${environment.toUpperCase()}_BINANCE_USDM`;
  return {
    schema_version: "portal.execution.current-source-bff.v2",
    source_environment: environment,
    profile_id: profileId,
    source: {
      authority: "EXECUTION_CELL", profile_id: profileId, availability: "AVAILABLE",
      freshness: "FRESH", completeness: "COMPLETE", as_of: "2026-08-31T10:00:00Z",
      data: {
        relation: { schema: "public", relation },
        items: rows.map((fields) => ({
          relation: { schema: "public", relation }, record_key: "opaque-source-key",
          fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, tagged(value)])),
        })),
        next_cursor: next,
      },
    },
  };
}

describe("BR-EX-72 manager list repository and API contracts", () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let source: FakeSource;
  let service: ManagerListsService;

  beforeAll(async () => migrateTestDatabase(DATABASE_URL));
  beforeEach(async () => {
    await truncateAll(pool);
    source = new FakeSource();
    service = new ManagerListsService(
      new ManagerListsRepository(pool),
      source as unknown as ExecutionProductReadSource,
      testConfig(),
    );
  });
  afterAll(async () => pool.end());

  const principal = (workspaceId = "ws_primary") => ({ user, session, workspaceId });

  it("projects the complete Fleet source, returns exact filtered counts, and never exposes source secrets", async () => {
    const full = await service.fleet(principal(), { environment: "all", limit: 1 }) as Record<string, any>;
    expect(full).toMatchObject({
      schema_version: "execution.alpha-fleet-list.v2", record_authority: "PORTAL_PROJECTION",
      source_authority: "TRADING_SYSTEM", delivery_profile: "ALL_EXECUTION_PROFILES",
      environment: "all", freshness: "FRESH", completeness: "COMPLETE",
    });
    expect(full.page.total_count).toBe(2);
    expect(full.page.rows).toHaveLength(1);
    expect(full.page.next_cursor).toMatch(/^kc1\./);
    expect(full.summary).toMatchObject({
      alpha_count: 2, deployment_count: 2, portfolio_count: 1,
      allocation_by_currency: [{ currency: "USDT", value: "30000" }],
    });
    expect(JSON.stringify(full)).not.toContain("secret_token");
    expect(JSON.stringify(full)).not.toContain("opaque-source-key");

    const fleetCalls = source.calls.filter((call) => call.includes(":EXECUTION_ALPHA_FLEET_LIST_SCREEN:"));
    const lastPaper = fleetCalls.map((call) => call.startsWith("paper:")).lastIndexOf(true);
    const firstSandbox = fleetCalls.findIndex((call) => call.startsWith("sandbox:"));
    const lastSandbox = fleetCalls.map((call) => call.startsWith("sandbox:")).lastIndexOf(true);
    const firstLive = fleetCalls.findIndex((call) => call.startsWith("live:"));
    expect(lastPaper).toBeGreaterThanOrEqual(0);
    expect(firstSandbox).toBeGreaterThan(lastPaper);
    expect(firstLive).toBeGreaterThan(lastSandbox);

    const filtered = await service.fleet(principal(), {
      environment: "all", limit: 10, search: "Carry", stage: "PAPER",
    }) as Record<string, any>;
    expect(filtered.page.total_count).toBe(2);
    expect(filtered.page.filtered_count).toBe(1);
    expect(filtered.page.rows[0]).toMatchObject({
      alpha_id: "alpha_a", alpha_label: "Carry A", version: "3.2", stage: "PAPER",
      stages: ["PAPER"],
      owner: "Bobby-001", portfolios: [{ portfolio_id: "pf_main", name: "Main", base_currency: "USDT" }],
      allocations: [{ currency: "USDT", value: "20000" }],
      position_pnl: [{ currency: "USDT", realized: "123.19605", unrealized: "0", net: "123.19605" }],
      deployments: [expect.objectContaining({
        deployment_id: "dep_a", stage: "PAPER", venue: "BINANCE", account_id: "acc_a",
        balance_locked: "0", position_fact_count: 1,
      })],
    });
  });

  it("combines accepted profiles without FX mixing and filters by every stage presence", async () => {
    source.rows.strategy_deployments.push({
      deployment_id: "dep_a_sbx", strategy_id: "str_a", account_id: "acc_a_sbx",
      mode: "sandbox", venue: "BINANCE", currency: "USDC", portfolio_id: "pf_main",
      state: "ACTIVE", active: true, updated_at: "2026-08-31T11:00:00Z",
    });
    source.rows.accounts.push({
      account_id: "acc_a_sbx", trader_id: "Bobby-001", strategy_id: "str_a", mode: "sandbox",
      venue: "BINANCE", base_currency: "USDC", active: true, updated_at: "2026-08-31T11:00:00Z",
    });
    source.rows.account_balances.push({
      account_id: "acc_a_sbx", currency: "USDC", total: "5000", locked: "10", free: "4990",
      updated_at: "2026-08-31T11:00:00Z",
    });
    source.rows.portfolio_allocations.push({
      allocation_id: "alloc_a_sbx", portfolio_id: "pf_main", strategy_id: "str_a",
      deployment_id: "dep_a_sbx", account_id: "acc_a_sbx", mode: "sandbox", venue: "BINANCE",
      currency: "USDC", allocated_capital: "5000", state: "ACTIVE", updated_at: "2026-08-31T11:00:00Z",
    });

    const all = await service.fleet(principal(), { environment: "all", limit: 50 }) as Record<string, any>;
    const carry = all.page.rows.find((row: any) => row.alpha_id === "alpha_a");
    expect(carry).toMatchObject({ stage: "SANDBOX", stages: ["SANDBOX", "PAPER"] });
    expect(carry.allocations).toEqual([
      { currency: "USDC", value: "5000" },
      { currency: "USDT", value: "20000" },
    ]);
    expect(carry.balances).toEqual([
      { currency: "USDC", total: "5000", free: "4990", locked: "10" },
      { currency: "USDT", total: "20123.19605", free: "20123.19605", locked: "0" },
    ]);
    expect(all.summary.stage_counts).toMatchObject({ PAPER: 2, SANDBOX: 1 });

    const paper = await service.fleet(principal(), { environment: "all", limit: 50, stage: "PAPER" }) as Record<string, any>;
    const sandbox = await service.fleet(principal(), { environment: "all", limit: 50, stage: "SANDBOX" }) as Record<string, any>;
    expect(paper.page.rows.map((row: any) => row.alpha_id).sort()).toEqual(["alpha_a", "alpha_b"]);
    expect(sandbox.page.rows.map((row: any) => row.alpha_id)).toEqual(["alpha_a"]);
  });

  it("publishes list/detail bindings without credentials and isolates workspaces", async () => {
    const primary = await service.bindings(principal(), { environment: "paper", limit: 10 }) as Record<string, any>;
    expect(primary.page.total_count).toBe(2);
    expect(primary.page.rows).toContainEqual(expect.objectContaining({
      binding_id: "acc_a@BINANCE", account_id: "acc_a", venue: "BINANCE",
      state: "ACTIVE", credential_state: "SYNC_SYNCED",
    }));
    expect(JSON.stringify(primary)).not.toContain("external_account_ref");
    expect(source.calls.some((call) => call.endsWith(":venue_credentials"))).toBe(false);

    const detail = await service.binding(principal(), "paper", "acc_a@BINANCE") as Record<string, any>;
    expect(detail).toMatchObject({ schema_version: "execution.binding-detail.v1", item: { binding_id: "acc_a@BINANCE" } });

    source.rows.accounts = [{ account_id: "acc_other", mode: "paper", venue: "OKX", active: true, updated_at: "2026-08-31T11:00:00Z" }];
    source.rows.broker_account_sync_effective = [];
    const other = await service.bindings(principal("ws_other"), { environment: "paper", limit: 10 }) as Record<string, any>;
    expect(other.page.rows.map((item: any) => item.account_id)).toEqual(["acc_other"]);
    const primaryAgain = await service.bindings(principal(), { environment: "paper", limit: 10 }) as Record<string, any>;
    expect(primaryAgain.page.rows.map((item: any) => item.account_id).sort()).toEqual(["acc_a", "acc_b"]);
  });

  it("drops unscoped foreign account children before a profile projection commit", async () => {
    source.leakUnscopedChildren = true;
    source.rows.account_balances.push({
      account_id: "foreign_live_account", currency: "USDT", total: "999999",
      locked: "0", free: "999999", updated_at: "2026-08-31T10:00:00Z",
    });

    const paper = await service.fleet(principal(), { environment: "paper", limit: 50 }) as Record<string, any>;

    expect(JSON.stringify(paper)).not.toContain("foreign_live_account");
    expect(JSON.stringify(paper)).not.toContain("999999");
    expect(paper.completeness).toBe("PARTIAL");
  });

  it("keeps cursor pages pinned to the committed projection instead of refreshing mid-walk", async () => {
    const first = await service.fleet(principal(), { environment: "paper", limit: 1 }) as Record<string, any>;
    source.rows.strategies = [];
    source.rows.strategy_deployments = [];
    const second = await service.fleet(principal(), {
      environment: "paper", limit: 1, after: first.page.next_cursor,
    }) as Record<string, any>;
    expect(second.page.rows).toHaveLength(1);
    expect(second.page.total_count).toBe(2);
  });

  it("serves a committed Fleet snapshot immediately while one stale refresh is coalesced", async () => {
    const initial = await service.fleet(principal(), { environment: "paper", limit: 50 }) as Record<string, any>;
    expect(initial.page.rows.map((item: any) => item.alpha_label)).toContain("Carry A");
    await pool.query(
      `UPDATE execution_manager_projection_snapshots
          SET refreshed_at = now() - interval '1 hour'
        WHERE workspace_id = 'ws_primary' AND environment = 'paper'
          AND projection_kind = 'ALPHA_FLEET'`,
    );
    source.rows.strategies[0] = { ...source.rows.strategies[0], label: "Carry A refreshed" };
    let release!: () => void;
    source.pause = new Promise<void>((resolve) => { release = resolve; });

    let settled = false;
    const staleRead = service.fleet(principal(), { environment: "paper", limit: 50 })
      .then((value) => { settled = true; return value as Record<string, any>; });
    try {
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(settled).toBe(true);
      const served = await staleRead;
      expect(served.page.rows.map((item: any) => item.alpha_label)).toContain("Carry A");
      expect(served.page.rows.map((item: any) => item.alpha_label)).not.toContain("Carry A refreshed");
    } finally {
      release();
      source.pause = null;
    }

    let projectedLabel = "";
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const projected = await pool.query<{ alpha_label: string }>(
        `SELECT alpha_label FROM execution_alpha_fleet_projection
          WHERE scope_id = 'ws_primary:paper' AND alpha_id = 'alpha_a'`,
      );
      projectedLabel = projected.rows[0]?.alpha_label ?? "";
      if (projectedLabel === "Carry A refreshed") break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(projectedLabel).toBe("Carry A refreshed");
  });

  it("serves the all-profile portfolio identity list with membership and exact capital (P4-A / BR-EX-76)", async () => {
    const result = await service.portfolios(principal(), { environment: "all" }) as Record<string, any>;
    expect(result).toMatchObject({
      schema_version: "execution.portfolio-list.v1",
      record_authority: "PORTAL_PROJECTION",
      source_authority: "TRADING_SYSTEM",
      delivery_profile: "ALL_EXECUTION_PROFILES",
      environment: "all",
      total_portfolios: 1,
      truncated: false,
    });
    // pf_main identity row has no mode, so it projects in all three profiles;
    // its allocations exist only in paper.
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      portfolio_id: "pf_main", name: "Main", owner: "bobby", state: "ACTIVE",
      base_currency: "USDT", environments: ["paper", "sandbox", "live"],
      allocation_count: 2, deployment_count: 2,
      allocated_by_currency: [{ currency: "USDT", value: "30000" }],
    });
    expect(result.environments.paper).toEqual({ state: "AVAILABLE", reason_code: null });
    expect(JSON.stringify(result)).not.toContain("opaque-source-key");
  });

  it("keeps the portfolio list serving when one profile read fails, labeled PARTIAL (P4-A)", async () => {
    const original = source.relation.bind(source);
    (source as unknown as { relation: unknown }).relation = async (
      principal: unknown, environment: string, screenId: string, sourceId: string,
      relation: string, query: { cursor?: string },
    ) => {
      if (environment === "live") throw new Error("live source down");
      return original(principal, environment, screenId, sourceId, relation, query);
    };
    const result = await service.portfolios(principal(), { environment: "all" }) as Record<string, any>;
    expect(result.completeness).toBe("PARTIAL");
    expect(result.environments.live).toMatchObject({ state: "UNAVAILABLE" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].environments).toEqual(["paper", "sandbox"]);
  });

  it("drops allocation rows whose portfolio parent is not an accepted identity row (P4-A / N30)", async () => {
    source.rows.portfolio_allocations.push({
      allocation_id: "alloc_orphan", portfolio_id: "pf_ghost", strategy_id: "str_a",
      deployment_id: "dep_ghost", account_id: "acc_a", mode: "paper", venue: "BINANCE",
      currency: "USDT", allocated_capital: "999999", max_capital: "999999", state: "ACTIVE",
      updated_at: "2026-08-31T09:00:00Z",
    });
    const result = await service.portfolios(principal(), { environment: "paper" }) as Record<string, any>;
    expect(result.items).toHaveLength(1);
    expect(result.items[0].allocated_by_currency).toEqual([{ currency: "USDT", value: "30000" }]);
    expect(result.environments.paper).toEqual({ state: "PARTIAL", reason_code: "N30_PROFILE_LINEAGE_REJECTED" });
    expect(result.completeness).toBe("PARTIAL");
    expect(JSON.stringify(result.items)).not.toContain("pf_ghost");
  });

  it("labels freshness by the ingestion-class budget and declares it on the envelope (P4-C / F3)", async () => {
    const fresh = await service.fleet(principal(), { environment: "all", limit: 1 }) as Record<string, any>;
    // Default projection poll is 15 s: FRESH within 30 s, AGING within 60 s.
    expect(fresh.freshness).toBe("FRESH");
    expect(fresh.freshness_budget_ms).toEqual({ fresh: 30_000, stale: 60_000 });
    const cursor = fresh.page.next_cursor as string;

    // A cursor-paged read never triggers the coalesced background refresh, so
    // the backdated timestamp cannot race a concurrent snapshot commit.
    await pool.query(
      `UPDATE execution_manager_projection_snapshots
          SET refreshed_at = now() - interval '45 seconds'
        WHERE projection_kind = 'ALPHA_FLEET'`,
    );
    const aging = await service.fleet(principal(), { environment: "all", limit: 1, after: cursor }) as Record<string, any>;
    expect(aging.freshness).toBe("AGING");

    await pool.query(
      `UPDATE execution_manager_projection_snapshots
          SET refreshed_at = now() - interval '90 seconds'
        WHERE projection_kind = 'ALPHA_FLEET'`,
    );
    const stale = await service.fleet(principal(), { environment: "all", limit: 1, after: cursor }) as Record<string, any>;
    expect(stale.freshness).toBe("STALE");
  });

  it("rejects page sizes above the published BR-EX-72 bound", () => {
    expect(AlphaFleetQuerySchema.parse({}).environment).toBe("all");
    expect(AlphaFleetQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(BindingsQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
  });
});
