import { describe, expect, it, vi } from "vitest";
import { AuthSession, PortalUser } from "../src/domain";
import { ExecutionProductReadSource } from "../src/execution/product-read-source";
import { ProfileReadController } from "../src/profile-read/profile-read.controller";
import { ProfileReadService } from "../src/profile-read/profile-read.service";
import { WorkspacesRepository } from "../src/repos/workspaces";

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
  readonly calls: Array<{ environment: string; screenId: string; relation: string; query: Record<string, unknown> }> = [];
  readonly rows = new Map<string, RecordInput[]>();
  readonly failures = new Set<string>();

  constructor(readonly profile: "sandbox" | "live") {}

  async relation(
    _principal: unknown,
    environment: string,
    screenId: string,
    _sourceId: string,
    relation: string,
    query: Record<string, unknown> = {},
  ) {
    this.calls.push({ environment, screenId, relation, query });
    if (this.failures.has(relation)) throw new Error("upstream detail must not escape");
    const scope = deploymentScope(query);
    const items = scope
      ? scopedFixtureRows(relation, this.rows.get(relation) ?? [defaultRecord(this.profile, relation)], scope)
      : this.rows.get(relation) ?? [defaultRecord(this.profile, relation)];
    return managerResponse(this.profile, relation, items, scope ? { state: "EXACT", reasonCode: null } : undefined);
  }

  async resolveDeploymentScope(
    _principal: unknown,
    _environment: string,
    _screenId: string,
    deploymentId: string,
  ) {
    const deployment = (this.rows.get("strategy_deployments") ?? [defaultRecord(this.profile, "strategy_deployments")])
      .find((row) => row.deployment_id === deploymentId);
    if (!deployment) return { state: "EMPTY" as const, reasonCode: "EDS03_DEPLOYMENT_NOT_FOUND" };
    const strategyId = typeof deployment.strategy_id === "string" ? deployment.strategy_id : null;
    const accountId = typeof deployment.account_id === "string" ? deployment.account_id : null;
    const mode = typeof deployment.mode === "string" ? deployment.mode : null;
    const venue = typeof deployment.venue === "string" ? deployment.venue : null;
    if (!strategyId || !accountId || mode !== this.profile || !venue) {
      return { state: "PARTIAL" as const, reasonCode: "EDS03_DEPLOYMENT_SCOPE_INCOMPLETE" };
    }
    const account = (this.rows.get("accounts") ?? [defaultRecord(this.profile, "accounts")])
      .filter((row) => row.account_id === accountId)
      .map((row) => row.external_account_ref)
      .filter((value): value is string => typeof value === "string");
    return {
      state: "FOUND" as const,
      reasonCode: null,
      deployment,
      scope: {
        deploymentId,
        strategyId,
        accountId,
        mode: this.profile,
        venue,
        portfolioId: typeof deployment.portfolio_id === "string" ? deployment.portfolio_id : null,
        externalAccountRef: account.length === 1 ? account[0] : null,
        tupleUnique: true,
      },
    };
  }
}

type FixtureScope = {
  deploymentId: string;
  strategyId: string;
  accountId: string;
  mode: string;
  venue: string;
  portfolioId: string | null;
  externalAccountRef: string | null;
};

function deploymentScope(query: Record<string, unknown>): FixtureScope | null {
  const candidate = query.deploymentScope;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const scope = candidate as Record<string, unknown>;
  return typeof scope.deploymentId === "string" && typeof scope.strategyId === "string" &&
    typeof scope.accountId === "string" && typeof scope.mode === "string" && typeof scope.venue === "string"
    ? scope as FixtureScope : null;
}

function scopedFixtureRows(relation: string, rows: RecordInput[], scope: FixtureScope): RecordInput[] {
  if (relation === "strategy_deployments") return rows.filter((row) => row.deployment_id === scope.deploymentId);
  if (["accounts", "account_balances", "margin_balances", "account_sync_effective", "venue_accounts"].includes(relation)) {
    return rows.filter((row) => row.account_id === scope.accountId);
  }
  if (relation === "broker_account_sync_effective") {
    return scope.externalAccountRef === null ? [] : rows.filter((row) => row.external_account_ref === scope.externalAccountRef);
  }
  if (relation === "portfolio_equity_snapshots") {
    return scope.portfolioId === null ? [] : rows.filter((row) => row.portfolio_id === scope.portfolioId);
  }
  if (rows.some((row) => row.deployment_id !== undefined)) {
    return rows.filter((row) => row.deployment_id === scope.deploymentId);
  }
  return rows.filter((row) => row.strategy_id === scope.strategyId && row.account_id === scope.accountId &&
    row.mode === scope.mode && (row.venue === undefined || row.venue === scope.venue));
}

function service(source: FakeCurrentSource): ProfileReadService {
  return new ProfileReadService(source as unknown as ExecutionProductReadSource);
}

function principal(workspaceId = "ws_primary") { return { user, session, workspaceId }; }

function defaultRecord(profile: "sandbox" | "live", relation: string): RecordInput {
  const values: Record<string, RecordInput> = {
    strategy_deployments: { deployment_id: `dep_${profile}`, strategy_id: "str_1", account_id: "acc_1", mode: profile, venue: "BINANCE" },
    positions_v2: { position_id: `pos_${profile}`, strategy_id: "str_1", account_id: "acc_1", mode: profile, venue: "BINANCE" },
    execution_sessions: { execution_session_id: `ses_${profile}`, strategy_id: "str_1", account_id: "acc_1", mode: profile, venue: "BINANCE" },
    reconciliation_findings: { finding_id: `finding_${profile}`, strategy_id: "str_1", account_id: "acc_1", mode: profile, venue: "BINANCE" },
    accounts: { account_id: "acc_1", strategy_id: "str_1", mode: profile, venue: "BINANCE", external_account_ref: "external_1" },
    account_balances: { account_id: "acc_1", currency: "USDT", total: "1000" },
    margin_balances: { account_id: "acc_1", currency: "USDT", initial: "10" },
    account_sync_effective: { sync_id: "sync_1", account_id: "acc_1", mode: profile, venue: "BINANCE", status: "SYNCED" },
    broker_account_sync_effective: { sync_id: "bsync_1", external_account_ref: "external_1", mode: profile, venue: "BINANCE", status: "SYNCED" },
    orders: { order_id: `ord_${profile}`, strategy_id: "str_1", account_id: "acc_1", mode: profile, venue: "BINANCE" },
    fills: { fill_id: `fill_${profile}`, strategy_id: "str_1", account_id: "acc_1", mode: profile, venue: "BINANCE" },
  };
  return values[relation] ?? { mode: profile };
}

function managerResponse(
  profile: "sandbox" | "live",
  relation: string,
  rows: RecordInput[],
  scope?: { state: "EXACT" | "PARTIAL"; reasonCode: string | null },
) {
  const profileId = profile === "sandbox" ? "SANDBOX_BINANCE_USDM" : "LIVE_BINANCE_USDM";
  return {
    schema_version: "portal.execution.current-source-bff.v2",
    source_environment: profile,
    profile_id: profileId,
    source: {
      authority: "EXECUTION_CELL", profile_id: profileId, availability: "AVAILABLE",
      freshness: "FRESH", completeness: "COMPLETE", as_of: "2026-08-30T12:00:00Z",
      data: {
        relation: { schema: "public", relation },
        items: rows.map((fields) => ({
          relation: { schema: "public", relation }, record_key: "must-not-leak",
          fields: Object.fromEntries(Object.entries({ ...fields, raw: "must-not-leak" }).map(([key, value]) => [key, tagged(value)])),
        })),
        next_cursor: null,
        ...(scope ? { scope: { state: scope.state, reason_code: scope.reasonCode } } : {}),
      },
    },
  };
}

function tagged(value: string | number | boolean | null) {
  if (value === null) return { kind: "NULL", value };
  if (typeof value === "boolean") return { kind: "BOOLEAN", value };
  if (typeof value === "number") return { kind: "INTEGER", value };
  return { kind: "TEXT", value };
}

describe("N23 Sandbox and Live profile reads", () => {
  it("composes Account/Broker 360 for one exact account without cross-account rows", async () => {
    const source = new FakeCurrentSource("live");
    source.rows.set("accounts", [
      { account_id: "acc_1", strategy_id: "str_1", mode: "live", venue: "BINANCE", external_account_ref: "external_1" },
      { account_id: "acc_other", strategy_id: "str_other", mode: "live", venue: "BINANCE", external_account_ref: "external_other" },
    ]);
    source.rows.set("account_balances", [
      { account_id: "acc_1", currency: "USDT", total: "1000.10", free: "800.10", locked: "200" },
      { account_id: "acc_other", currency: "USDT", total: "999999", free: "999999" },
    ]);
    source.rows.set("margin_balances", [
      { account_id: "acc_1", currency: "USDT", initial: "100", maintenance: "50.05" },
    ]);
    source.rows.set("broker_account_sync_effective", [
      { sync_id: "broker_1", external_account_ref: "external_1", mode: "live", venue: "BINANCE", status: "SYNCED", currency: "USDT", buying_power: "799.90", synced_at: "2026-08-30T12:00:00Z" },
      { sync_id: "broker_other", external_account_ref: "external_other", mode: "live", venue: "BINANCE", status: "SYNCED", currency: "USDT", buying_power: "1" },
    ]);
    source.rows.set("venue_accounts", [
      { venue_account_id: "venue_1", binding_id: "bind_1", account_id: "acc_1", mode: "live", venue: "BINANCE" },
      { venue_account_id: "venue_other", binding_id: "bind_other", account_id: "acc_other", mode: "live", venue: "BINANCE" },
    ]);

    const result = await service(source).accountBroker(principal(), "acc_1", "live") as Record<string, any>;
    expect(result).toMatchObject({
      schema_version: "execution.account-broker-360.v1",
      selected_environment: "live",
      resource: { kind: "ACCOUNT", id: "acc_1" },
      state: "ready",
    });
    expect(result.data.accounts).toHaveLength(1);
    expect(result.data.venue_accounts).toHaveLength(1);
    expect(result.data.differences).toEqual([expect.objectContaining({ delta: "0.2", in_sync: false })]);
    expect(result.data.exposure_headroom).toEqual([expect.objectContaining({ headroom: "750.05", verdict: "AVAILABLE" })]);
    expect(JSON.stringify(result)).not.toContain("acc_other");
  });

  it("returns a typed empty Account 360 rather than borrowing another account", async () => {
    const source = new FakeCurrentSource("sandbox");
    source.rows.set("accounts", []);
    const result = await service(source).accountBroker(principal(), "missing", "sandbox") as Record<string, any>;
    expect(result.state).toBe("empty");
    expect(result.unavailable_branches).toContainEqual(expect.objectContaining({
      reason_code: "PHASE2_ACCOUNT_NOT_FOUND",
    }));
  });

  it("serves bounded Sandbox source facts through the exact Sandbox profile", async () => {
    const source = new FakeCurrentSource("sandbox");
    const result = await service(source).overview(principal(), "sandbox") as Record<string, any>;
    expect(result).toMatchObject({
      schema_version: "execution.sandbox-overview.v1",
      delivery_profile: "SANDBOX_BINANCE_USDM",
      requested_environment: "sandbox",
      source_environment: "sandbox",
      state: "ready",
    });
    expect(source.calls).toHaveLength(4);
    expect(source.calls.every((item) => item.environment === "sandbox" && item.screenId === "SANDBOX_TRADING_SCREEN")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
  });

  it("returns an honest EMPTY Live overview when every source relation has no rows", async () => {
    const source = new FakeCurrentSource("live");
    for (const relation of [
      "strategy_deployments", "positions_v2", "execution_sessions", "accounts", "account_balances",
      "margin_balances", "account_sync_effective", "broker_account_sync_effective",
    ]) source.rows.set(relation, []);
    const result = await service(source).overview(principal(), "live") as Record<string, any>;
    expect(result).toMatchObject({
      schema_version: "execution.live-overview.v1",
      delivery_profile: "LIVE_BINANCE_USDM",
      state: "empty",
      completeness: "COMPLETE",
    });
    expect(Object.values(result.data).every((rows) => Array.isArray(rows) && rows.length === 0)).toBe(true);
  });

  it("never relabels an unscoped Paper balance as Live truth", async () => {
    const source = new FakeCurrentSource("live");
    source.rows.set("strategy_deployments", []);
    source.rows.set("accounts", []);
    source.rows.set("positions_v2", []);
    source.rows.set("execution_sessions", []);
    source.rows.set("account_balances", [
      { account_id: "paper_account_only", currency: "USDT", total: "999999" },
    ]);
    source.rows.set("margin_balances", []);
    source.rows.set("account_sync_effective", []);
    source.rows.set("broker_account_sync_effective", []);

    const result = await service(source).overview(principal(), "live") as Record<string, any>;

    expect(result.state).toBe("partial");
    expect(result.completeness).toBe("PARTIAL");
    expect(result.data.account_balances).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("paper_account_only");
    expect(result.capabilities).toContainEqual(expect.objectContaining({
      capability_id: "source.account_balances",
      state: "PARTIAL",
      reason_code: "N30_PROFILE_LINEAGE_REJECTED",
    }));
  });

  it("rejects cross-profile rows and never turns source failure into EMPTY", async () => {
    const cross = new FakeCurrentSource("sandbox");
    cross.rows.set("positions_v2", [{ position_id: "live-secret", mode: "live", venue: "BINANCE" }]);
    const rejected = await service(cross).overview(principal(), "sandbox") as Record<string, any>;
    expect(rejected.state).toBe("partial");
    expect(rejected.data.positions).toEqual([]);
    expect(JSON.stringify(rejected)).not.toContain("live-secret");
    expect(rejected.capabilities).toContainEqual(expect.objectContaining({
      capability_id: "source.positions", state: "UNAVAILABLE", reason_code: "N23_CROSS_PROFILE_ROW_REJECTED",
    }));

    const failed = new FakeCurrentSource("live");
    failed.failures.add("accounts");
    const partial = await service(failed).overview(principal(), "live") as Record<string, any>;
    expect(partial.state).toBe("partial");
    expect(partial.capabilities).toContainEqual(expect.objectContaining({
      capability_id: "source.accounts", state: "UNAVAILABLE", reason_code: "N23_SOURCE_UNAVAILABLE",
    }));
  });

  it("composes Canary governance over Live facts without inventing a canary source mode", async () => {
    const source = new FakeCurrentSource("live");
    const result = await service(source).snapshot(
      principal(), "canary", "EXECUTION_CANARY_CONTROL_ROOM_SCREEN", "dep_live",
    ) as Record<string, any>;
    expect(result).toMatchObject({
      schema_version: "execution.canary-live-facts.v1",
      delivery_profile: "LIVE_BINANCE_USDM",
      requested_environment: "canary",
      source_environment: "live",
      composition: "PORTAL_CANARY_GOVERNANCE_OVER_LIVE_FACTS",
    });
    expect(source.calls.every((item) => item.environment === "canary")).toBe(true);
    expect(result.data.deployments).toHaveLength(1);
  });

  it("scopes detail facts to one deployment and its account", async () => {
    const source = new FakeCurrentSource("live");
    source.rows.set("strategy_deployments", [
      defaultRecord("live", "strategy_deployments"),
      { deployment_id: "dep_other", strategy_id: "str_2", account_id: "acc_2", mode: "live", venue: "BINANCE" },
    ]);
    source.rows.set("orders", [
      defaultRecord("live", "orders"),
      { order_id: "ord_other", strategy_id: "str_2", account_id: "acc_2", mode: "live", venue: "BINANCE" },
    ]);
    const result = await service(source).snapshot(
      principal(), "live", "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN", "dep_live",
    ) as Record<string, any>;
    expect(result.data.deployments.map((item: any) => item.deployment_id)).toEqual(["dep_live"]);
    expect(result.data.orders.map((item: any) => item.order_id)).toEqual(["ord_live"]);
    expect(result.panels.orders).toMatchObject({ state: "READY", coverage: { returned_count: 1, truncated: false } });
    expect(result.read_at_ms).toEqual(expect.any(Number));
    expect(result.unavailable_branches).toEqual([expect.objectContaining({ capability_id: "market.ticks" })]);
  });

  it("EDS-03 resolves Live detail identity before bounded current rows and preserves canonical UTC milliseconds", async () => {
    const source = new FakeCurrentSource("live");
    source.rows.set("strategy_deployments", Array.from({ length: 201 }, (_, index) => ({
      deployment_id: `dep_${index}`,
      strategy_id: `str_${index}`,
      account_id: `acc_${index}`,
      portfolio_id: `pf_${index}`,
      mode: "live",
      venue: "BINANCE",
    })));
    source.rows.set("fills", [
      { fill_id: "fill_first", strategy_id: "str_0", account_id: "acc_0", mode: "live", venue: "BINANCE", trade_time: "2026-09-05T00:00:00.000Z" },
      { fill_id: "fill_target", strategy_id: "str_200", account_id: "acc_200", mode: "live", venue: "BINANCE", trade_time: "2026-09-05T00:01:00.000Z" },
    ]);

    const result = await service(source).snapshot(
      principal(), "live", "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN", "dep_200",
    ) as Record<string, any>;

    expect(result.data.deployments).toEqual([expect.objectContaining({ deployment_id: "dep_200" })]);
    expect(result.data.fills).toEqual([expect.objectContaining({
      fill_id: "fill_target", trade_time_ms: Date.parse("2026-09-05T00:01:00.000Z"),
    })]);
    expect(result.panels.fills).toMatchObject({ state: "READY", coverage: { returned_count: 1 } });
    expect(source.calls.every((call) => {
      const scope = call.query.deploymentScope as Record<string, unknown> | undefined;
      return scope?.deploymentId === "dep_200" && scope.strategyId === "str_200" && scope.accountId === "acc_200";
    })).toBe(true);
    expect(JSON.stringify(result)).not.toContain("fill_first");
  });

  it("EDS-03 maps a complete absent Live deployment to typed EMPTY without reading a first page", async () => {
    const source = new FakeCurrentSource("live");
    source.rows.set("strategy_deployments", [{
      deployment_id: "dep_present", strategy_id: "str_present", account_id: "acc_present", mode: "live", venue: "BINANCE",
    }]);

    const result = await service(source).snapshot(
      principal(), "live", "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN", "dep_missing",
    ) as Record<string, any>;

    expect(result).toMatchObject({
      state: "empty",
      resource_resolution: { state: "EMPTY", reason_code: "EDS03_DEPLOYMENT_NOT_FOUND" },
    });
    expect(result.data.orders).toEqual([]);
    expect(result.panels.orders).toMatchObject({ state: "EMPTY", reason_code: "EDS03_DEPLOYMENT_NOT_FOUND" });
    expect(source.calls).toHaveLength(0);
  });

  it("keeps bounded fan-out under load and recovers after source loss", async () => {
    const source = new FakeCurrentSource("sandbox");
    source.failures.add("execution_sessions");
    const degraded = await service(source).overview(principal(), "sandbox") as Record<string, any>;
    expect(degraded.state).toBe("partial");
    expect(degraded.capabilities).toContainEqual(expect.objectContaining({
      capability_id: "source.sessions", state: "UNAVAILABLE", reason_code: "N23_SOURCE_UNAVAILABLE",
    }));

    source.failures.delete("execution_sessions");
    source.calls.length = 0;
    const pages = await Promise.all(
      Array.from({ length: 20 }, () => service(source).overview(principal(), "sandbox")),
    ) as Array<Record<string, any>>;
    expect(pages.every((page) => page.state === "ready")).toBe(true);
    expect(source.calls).toHaveLength(80);
    expect(source.calls.every((call) => call.environment === "sandbox")).toBe(true);
    expect(Math.max(...pages.map((page) => Buffer.byteLength(JSON.stringify(page), "utf8"))))
      .toBeLessThan(1_048_576);
  });

  it("rejects unknown query fields and foreign workspaces before source access", async () => {
    const reads = { overview: vi.fn(), accountBroker: vi.fn() };
    const memberships = { isMember: vi.fn().mockResolvedValue(false) };
    const controller = new ProfileReadController(
      reads as unknown as ProfileReadService,
      memberships as unknown as WorkspacesRepository,
    );
    const request = {
      portalUser: user,
      portalSession: session,
      portalWorkspaceId: "ws_primary",
    } as any;
    await expect(controller.sandbox(request, { arbitrary_source: "manager.orders" }))
      .rejects.toMatchObject({ code: "N23_QUERY_INVALID", status: 400 });
    await expect(controller.live(request, { workspace_id: "ws_foreign" }))
      .rejects.toMatchObject({ code: "WORKSPACE_NOT_FOUND", status: 404 });
    await expect(controller.account(request, "bad/account", {}))
      .rejects.toMatchObject({ code: "PHASE2_ACCOUNT_QUERY_INVALID", status: 400 });
    expect(reads.overview).not.toHaveBeenCalled();
    expect(reads.accountBroker).not.toHaveBeenCalled();
  });
});
