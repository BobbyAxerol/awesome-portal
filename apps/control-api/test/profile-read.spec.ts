import { describe, expect, it, vi } from "vitest";
import { AuthSession, PortalUser } from "../src/domain";
import { ExecutionCurrentSourceProxy } from "../src/execution/current-source.proxy";
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
  readonly calls: Array<{ environment: string; screenId: string; relation: string }> = [];
  readonly rows = new Map<string, RecordInput[]>();
  readonly failures = new Set<string>();

  constructor(readonly profile: "sandbox" | "live") {}

  async relation(
    _principal: unknown,
    environment: string,
    screenId: string,
    _sourceId: string,
    relation: string,
  ) {
    this.calls.push({ environment, screenId, relation });
    if (this.failures.has(relation)) throw new Error("upstream detail must not escape");
    return managerResponse(this.profile, relation, this.rows.get(relation) ?? [defaultRecord(this.profile, relation)]);
  }
}

function service(source: FakeCurrentSource): ProfileReadService {
  return new ProfileReadService(source as unknown as ExecutionCurrentSourceProxy);
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

function managerResponse(profile: "sandbox" | "live", relation: string, rows: RecordInput[]) {
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
    expect(result.unavailable_branches).toEqual([expect.objectContaining({ capability_id: "market.ticks" })]);
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
    const reads = { overview: vi.fn() };
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
    expect(reads.overview).not.toHaveBeenCalled();
  });
});
