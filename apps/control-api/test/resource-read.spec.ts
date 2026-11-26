import { describe, expect, it, vi } from "vitest";
import { ControlApiConfig } from "../src/config";
import { AuthSession, PortalUser } from "../src/domain";
import {
  ExecutionProfileProjectionRepository,
  ProfileProjectionDocument,
  ProfileProjectionSnapshot,
  ProjectionRelation,
  ProjectionScalar,
} from "../src/execution/profile-projection.repository";
import { ResourceReadService } from "../src/resource-read/resource-read.service";
import { ResourceReadController, ResourceReadError } from "../src/resource-read/resource-read.controller";
import { wireStageValue } from "../src/execution/stage-screen-wire";
import { testConfig } from "./harness";
import type { ManagerCurrentAccounts } from "../src/execution-v2/manager-current-accounts";

type Row = Record<string, ProjectionScalar>;

const workspaceId = "ws_eds04";
const user: PortalUser = {
  userId: "usr_bobby", username: "bobby", displayName: "Bobby", role: "ADMIN", status: "ACTIVE",
  mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, sessionVersion: 1,
  createdAt: new Date("2026-09-05T00:00:00Z"), updatedAt: new Date("2026-09-05T00:00:00Z"), disabledAt: null,
  accountRevision: 1, archivedAt: null,
};
const session: AuthSession = {
  sessionId: "ses_eds04", userId: user.userId, state: "ACTIVE", sessionVersion: 1,
  authenticationTime: new Date("2026-09-05T00:00:00Z"),
  idleExpiresAt: new Date("2026-09-06T00:00:00Z"), absoluteExpiresAt: new Date("2026-09-06T08:00:00Z"),
};

const RELATION = {
  strategies: "manager.strategies:strategies",
  deployments: "manager.deployments:strategy_deployments",
  accounts: "manager.accounts:accounts",
  balances: "manager.accounts:account_balances",
  margins: "manager.accounts:margin_balances",
  accountSync: "manager.accounts:account_sync_effective",
  brokerSync: "manager.accounts:broker_account_sync_effective",
  venueAccounts: "manager.venue-accounts:venue_accounts",
  portfolios: "manager.portfolios:portfolios",
  allocations: "manager.portfolios:portfolio_allocations",
  positions: "manager.positions:positions_v2",
  sessions: "manager.sessions:execution_sessions",
  orders: "manager.orders:orders",
  fills: "manager.fills:fills",
  performance: "manager.performance:performance_snapshots",
  accountEquity: "manager.performance:account_equity_snapshots",
  portfolioEquity: "manager.performance:portfolio_equity_snapshots",
  reconciliation: "manager.reconciliation:reconciliation_findings",
  journal: "manager.command-journal:command_journal",
} as const;

class FakeProjectionRepository {
  constructor(private readonly snapshots: ReadonlyMap<string, ProfileProjectionSnapshot>) {}

  async snapshot(_workspace: string, environment: "paper" | "sandbox" | "live", profileId: string) {
    return this.snapshots.get(`${environment}:${profileId}`) ?? null;
  }
}

function config(): ControlApiConfig {
  // ResourceReadService only reads these local projection fields.  Starting
  // from the normal test config preserves the production configuration shape
  // while avoiding an Edge/network activation in a unit test.
  return {
    ...testConfig(),
    FEATURE_EXECUTION_LOCAL_PROJECTION: "true",
    EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: workspaceId,
    EXECUTION_EDGE_PAPER_PROFILE_ID: "PAPER_PROFILE",
    EXECUTION_EDGE_SANDBOX_PROFILE_ID: "SANDBOX_PROFILE",
    EXECUTION_EDGE_LIVE_PROFILE_ID: "LIVE_PROFILE",
    EXECUTION_LOCAL_PROJECTION_STALE_CEILING_MS: 60_000,
  } as ControlApiConfig;
}

function relation(name: string, rows: readonly Row[], completeness: "COMPLETE" | "PARTIAL" = "COMPLETE"): ProjectionRelation {
  return {
    source_id: "manager.test", relation: name, availability: "AVAILABLE", reason_code: null,
    as_of: "2026-09-05T12:00:00.000Z", freshness: "FRESH", completeness,
    items: rows.map((fields) => ({
      lineage: { workspace_id: workspaceId, profile_id: "PAPER_PROFILE", source_contract_revision: "manager-v2.current.v1" },
      fields,
    })),
  };
}

function snapshot(relations: Record<string, ProjectionRelation>): ProfileProjectionSnapshot {
  const document: ProfileProjectionDocument = {
    schema_version: "portal.execution.profile-projection.v1", workspace_id: workspaceId,
    environment: "paper", profile_id: "PAPER_PROFILE", source_contract_revision: "manager-v2.current.v1", relations,
  };
  const now = new Date();
  return {
    document, sourceEpoch: "epoch-eds04", sourceCursor: "opaque-source-cursor-must-not-leak",
    sourceAsOf: new Date("2026-09-05T12:00:00.000Z"), receivedAt: now, lastSuccessfulRefreshAt: now,
    completeness: "COMPLETE", projectionEpoch: "projection-eds04", projectionSequence: 17,
    payloadDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", sourceCatalogueSha256: null,
  };
}

function service(relations: Record<string, ProjectionRelation>) {
  const repository = new FakeProjectionRepository(new Map([["paper:PAPER_PROFILE", snapshot(relations)]]));
  return new ResourceReadService(config(), repository as unknown as ExecutionProfileProjectionRepository);
}

function principal() { return { user, session, workspaceId }; }

describe("EDS-04 named resource BFFs", () => {
  it("selects native Accounts explicitly and preserves the real principal/response without retained projection reads", async () => {
    const repository = { snapshot: vi.fn() }, response = {} as never, beforeDispatch = vi.fn();
    const current = { hasNativeCurrentRelations: () => true, readNative: vi.fn(async () => {}), read: vi.fn() };
    const reader = new ResourceReadService(config(), repository as unknown as ExecutionProfileProjectionRepository,
      undefined, current as unknown as ManagerCurrentAccounts), actor = principal();
    expect(reader.hasNativeCurrentAccount()).toBe(true);
    await reader.readNativeAccount(actor, "actual-account", "paper", response, beforeDispatch);
    expect(current.readNative).toHaveBeenCalledWith(actor, "actual-account", "paper", response, beforeDispatch);
    expect(current.read).not.toHaveBeenCalled(); expect(repository.snapshot).not.toHaveBeenCalled();
  });
  it("does not native-deliver without the installed composer or for another environment", async () => {
    const repository = { snapshot: vi.fn() }, current = { hasNativeCurrentRelations: () => true, readNative: vi.fn() };
    const uninstalled = new ResourceReadService(config(), repository as unknown as ExecutionProfileProjectionRepository);
    expect(uninstalled.hasNativeCurrentAccount()).toBe(false);
    await expect(uninstalled.readNativeAccount(principal(), "actual-account", "paper", {} as never, vi.fn()))
      .rejects.toMatchObject({ code: "EXECUTION_READ_AUTHORITY_UNAVAILABLE", status: 503 });
    const installed = new ResourceReadService(config(), repository as unknown as ExecutionProfileProjectionRepository,
      undefined, current as unknown as ManagerCurrentAccounts);
    await expect(installed.readNativeAccount(principal(), "actual-account", "live", {} as never, vi.fn()))
      .rejects.toMatchObject({ code: "EXECUTION_READ_AUTHORITY_UNAVAILABLE", status: 503 });
    expect(current.readNative).not.toHaveBeenCalled(); expect(repository.snapshot).not.toHaveBeenCalled();
  });
  it("propagates native Accounts refusal instead of trying a retained/ordinary reader", async () => {
    const repository = { snapshot: vi.fn() }, failure = new Error("TEST_ONLY_NATIVE_UNKNOWN");
    const current = { hasNativeCurrentRelations: () => true, readNative: vi.fn(async () => { throw failure; }), read: vi.fn() };
    const reader = new ResourceReadService(config(), repository as unknown as ExecutionProfileProjectionRepository,
      undefined, current as unknown as ManagerCurrentAccounts);
    await expect(reader.readNativeAccount(principal(), "actual-account", "paper", {} as never, vi.fn())).rejects.toBe(failure);
    expect(current.read).not.toHaveBeenCalled(); expect(repository.snapshot).not.toHaveBeenCalled();
  });
  it("routes commissioned Paper Accounts with the original principal and never treats them as broker bindings", async () => {
    const repository = { snapshot: vi.fn(async () => null) };
    const current = { read: vi.fn(async (..._input: unknown[]) => ({ TEST_ONLY: "current-account" })) };
    const reader = new ResourceReadService(config(), repository as unknown as ExecutionProfileProjectionRepository,
      undefined, current as unknown as ManagerCurrentAccounts);
    const actor = principal();
    expect(await reader.read(actor, "ACCOUNT", "actual-source-account", "paper")).toEqual({ TEST_ONLY: "current-account" });
    expect(current.read).toHaveBeenLastCalledWith(actor, "actual-source-account", "paper");
    expect(current.read.mock.calls[0]![0]).toBe(actor);
    expect(repository.snapshot).not.toHaveBeenCalled();
    await reader.read(actor, "ACCOUNT", "actual-source-account");
    expect(current.read).toHaveBeenLastCalledWith(actor, "actual-source-account", undefined);
    current.read.mockClear();
    for (const [kind, environment] of [["BINDING", "paper"], ["PORTFOLIO", "paper"], ["ACCOUNT", "live"]] as const)
      await reader.read(actor, kind, "actual-source-account", environment);
    expect(current.read).not.toHaveBeenCalled();
  });
  it("does not fall back to retained rows when the commissioned Account read is refused", async () => {
    const repository = { snapshot: vi.fn(async () => null) }, failure = new Error("TEST_ONLY_AUTHORITY_REVOKED");
    const current = { read: vi.fn(async () => { throw failure; }) };
    const reader = new ResourceReadService(config(), repository as unknown as ExecutionProfileProjectionRepository,
      undefined, current as unknown as ManagerCurrentAccounts);
    await expect(reader.read(principal(), "ACCOUNT", "actual-source-account", "paper")).rejects.toBe(failure);
    expect(repository.snapshot).not.toHaveBeenCalled();
  });
  it("reuses only bounded DATA after a fresh snapshot load, never actor/clocks or an outage fallback", async () => {
    const fact = snapshot({ [RELATION.portfolios]: relation("portfolios", [{ portfolio_id: "pf_target", name: "Target" }]) });
    const repo = new ExecutionProfileProjectionRepository({ query: vi.fn() } as any, undefined,
      { EXECUTION_READ_PROFILE: "retained_review_v1", FEATURE_EXECUTION_DURABLE_MIRROR: "false",
        FEATURE_EXECUTION_DURABLE_MIRROR_READS: "false" });
    const load = vi.spyOn(repo, "snapshot").mockResolvedValue(fact);
    const reader = new ResourceReadService({ ...config(), EXECUTION_READ_PROFILE: "retained_review_v1" }, repo);
    const prepare = vi.spyOn(reader as any, "prepare");
    const first = await reader.read(principal(), "PORTFOLIO", "pf_target", "paper") as any;
    const next = await reader.read({ ...principal(), user: { ...user, userId: "viewer", username: "reviewer", role: "USER" } },
      "PORTFOLIO", "pf_target", "paper") as any;
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(2);
    expect(next.actor).toEqual({ user_id: "viewer", username: "reviewer", roles: ["USER"] });
    expect(first.actor.user_id).toBe(user.userId);
    expect(next.panels.positions.clocks.read_at_ms).toBe(next.read_at_ms);
    expect(next.read_at_ms).toBeGreaterThan(0);
    load.mockRejectedValueOnce(new Error("DOMAIN_OUTAGE"));
    await expect(reader.read(principal(), "PORTFOLIO", "pf_target", "paper")).rejects.toThrow("DOMAIN_OUTAGE");
    // Even an unchanged document/digest with changed accepted clocks is a
    // different exact representation key, not a hit on prior metadata.
    fact.receivedAt = new Date(fact.receivedAt.getTime() + 1);
    await reader.read(principal(), "PORTFOLIO", "pf_target", "paper");
    expect(prepare).toHaveBeenCalledTimes(2);
  });

  it("coalesces only pending exact retained documents and attaches every actor/current read clock independently", async () => {
    const fact = snapshot({ [RELATION.portfolios]: relation("portfolios", [{ portfolio_id: "pf_target", name: "Target" }]) });
    const repository = new FakeProjectionRepository(new Map([["paper:PAPER_PROFILE", fact]]));
    const reader = new ResourceReadService({ ...config(), EXECUTION_READ_PROFILE: "retained_review_v1" },
      repository as unknown as ExecutionProfileProjectionRepository);
    const prepare = vi.spyOn(reader as any, "prepare");
    const values = await Promise.all(Array.from({ length: 20 }, (_, index) => reader.read({ ...principal(),
      user: { ...user, userId: `actor_${index}`, username: `reader_${index}`, role: index === 0 ? "ADMIN" : "USER" } },
      "PORTFOLIO", "pf_target", "paper")));
    expect(prepare).toHaveBeenCalledTimes(1);
    values.forEach((value, index) => {
      expect(value.actor).toEqual({ user_id: `actor_${index}`, username: `reader_${index}`, roles: [index === 0 ? "ADMIN" : "USER"] });
      expect(value.read_at_ms).toBeGreaterThan(0);
      for (const panel of Object.values(value.panels as Record<string, any>)) expect(panel.clocks.read_at_ms).toBe(value.read_at_ms);
      expect(Buffer.byteLength(JSON.stringify(value))).toBeLessThanOrEqual(1024 * 1024);
    });
    // A completed result is NEVER a cache entry. Changes on the same object,
    // including an unchanged digest, must be recomputed on the next batch.
    fact.document.relations[RELATION.portfolios].items[0].fields.name = "Changed";
    const next = await reader.read(principal(), "PORTFOLIO", "pf_target", "paper") as any;
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(next.data.portfolio.name).toBe("Changed");
    expect(next.actor.user_id).toBe(user.userId);
    expect(next.read_at_ms).toBeGreaterThan(values[0].read_at_ms as number);
  });

  it("isolates workspace/resource/profile/document identity and clears failed preparations", async () => {
    const first = snapshot({ [RELATION.portfolios]: relation("portfolios", [{ portfolio_id: "pf_target", name: "First" }]) });
    const second = snapshot({ [RELATION.portfolios]: relation("portfolios", [{ portfolio_id: "pf_target", name: "Second" }]) });
    const repo = { snapshot: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second).mockResolvedValue(first) };
    const reader = new ResourceReadService({ ...config(), EXECUTION_READ_PROFILE: "retained_review_v1" }, repo as any);
    const prepare = vi.spyOn(reader as any, "prepare");
    const values = await Promise.all([
      reader.read(principal(), "PORTFOLIO", "pf_target", "paper"),
      reader.read(principal(), "PORTFOLIO", "pf_target", "paper"),
      reader.read({ ...principal(), workspaceId: "ws_other" }, "PORTFOLIO", "pf_target", "paper"),
      reader.read(principal(), "PORTFOLIO", "pf_missing", "paper"),
      reader.read(principal(), "PORTFOLIO", "pf_target", "sandbox"),
    ]) as any[];
    expect(prepare).toHaveBeenCalledTimes(5);
    expect(values[0].data.portfolio.name).toBe("First");
    expect(values[1].data.portfolio.name).toBe("Second");
    expect(values[2].workspace_id).toBe("ws_other");
    prepare.mockImplementationOnce(() => { throw new Error("TEST_PREPARATION_FAILED"); });
    await expect(reader.read(principal(), "PORTFOLIO", "pf_target", "paper")).rejects.toThrow("TEST_PREPARATION_FAILED");
    await expect(reader.read(principal(), "PORTFOLIO", "pf_target", "paper")).resolves.toMatchObject({ data: { portfolio: { name: "First" } } });
  });

  it("bounds pending followers with the existing typed capacity refusal, without retaining the refusal", async () => {
    const reader = new ResourceReadService({ ...config(), EXECUTION_READ_PROFILE: "retained_review_v1" },
      new FakeProjectionRepository(new Map([["paper:PAPER_PROFILE", snapshot({})]])) as any);
    const values = await Promise.allSettled(Array.from({ length: 65 }, () => reader.read(principal(), "PORTFOLIO", "missing", "paper")));
    expect(values.filter(value => value.status === "fulfilled")).toHaveLength(64);
    expect(values.find(value => value.status === "rejected")).toMatchObject({ reason: { code: "EXECUTION_POOL_BUSY" } });
    await expect(reader.read(principal(), "PORTFOLIO", "missing", "paper")).resolves.toBeDefined();
  });

  it("memoizes wire facts only in the supplied per-read graph", () => {
    const value = { updated_at: "2026-09-05T12:00:00.000Z", price: "10.000000000000000001" };
    const memo = new WeakMap<object, unknown>();
    const a = wireStageValue(value, memo) as any;
    expect(wireStageValue(value, memo)).toBe(a);
    expect(a.updated_at_ms).toBe(Date.parse(value.updated_at));
    expect(a.price).toBe(value.price);
    value.price = "12";
    expect(wireStageValue(value)).toEqual({ ...a, price: "12" });
    expect(wireStageValue(value, new WeakMap())).not.toBe(a);
  });

  it("scopes/counts all retained rows but copies only the 200-row public prefix", async () => {
    let copied = 0;
    const positions: Row[] = Array.from({ length: 5000 }, (_, index) => {
      const row: Row = { position_id: `p_${index}`, deployment_id: "dep_target", mode: "paper" };
      Object.defineProperty(row, "notional", { enumerable: true, get: () => { copied++; return "10"; } });
      return row;
    });
    const value = await service({
      [RELATION.portfolios]: relation("portfolios", [{ portfolio_id: "pf_target", name: "Target" }]),
      [RELATION.deployments]: relation("strategy_deployments", [{ deployment_id: "dep_target",
        strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE", portfolio_id: "pf_target" }]),
      [RELATION.positions]: relation("positions_v2", positions),
    }).read(principal(), "PORTFOLIO", "pf_target", "paper") as Record<string, any>;
    expect(copied).toBe(200);
    expect(value.data.positions).toHaveLength(200);
    expect(value.panels.positions.coverage).toMatchObject({ source_total: "5000", filtered_total: "5000",
      returned_count: 200, truncated: true, has_more: true, next_cursor: null });
    expect(value.panels.positions.reason_code).toBe("EDS04_RESOURCE_RELATION_ROW_BOUND");
    expect(JSON.stringify(value)).not.toContain("p_201");
  });
  it("refuses a named foreign workspace, so the projection is never relabelled", async () => {
    const read = vi.fn();
    const controller = new ResourceReadController(
      { read } as unknown as ResourceReadService,
      { canReadExecution: vi.fn(async () => true) } as never,
      config(),
    );
    const request = { portalUser: user, portalWorkspaceId: "ws_other", portalSession: session } as never;

    await expect(controller.alpha(request, "alpha_target", { workspace_id: "ws_other" })).rejects.toMatchObject({
      code: "EDS04_PROJECTION_WORKSPACE_NOT_FOUND",
      status: 404,
    } satisfies Partial<ResourceReadError>);
    expect(read).not.toHaveBeenCalled();
  });

  it("reads the projection's own workspace when the caller names none, whatever the session's personal workspace is (DR-30)", async () => {
    const read = vi.fn(async () => ({ ok: true }));
    const canReadExecution = vi.fn(async () => true);
    const controller = new ResourceReadController(
      { read } as unknown as ResourceReadService,
      { canReadExecution } as never,
      config(),
    );
    const request = { portalUser: user, portalWorkspaceId: "ws_personal_of_another_member", portalSession: session } as never;

    await controller.alpha(request, "alpha_target", {});
    expect(canReadExecution).toHaveBeenCalledWith(workspaceId, user.userId, undefined);
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId }),
      "ALPHA",
      "alpha_target",
      undefined,
    );
  });

  it("still refuses a member of no projection workspace", async () => {
    const read = vi.fn();
    const controller = new ResourceReadController(
      { read } as unknown as ResourceReadService,
      { canReadExecution: vi.fn(async () => false) } as never,
      config(),
    );
    const request = { portalUser: user, portalWorkspaceId: "ws_other", portalSession: session } as never;

    await expect(controller.alpha(request, "alpha_target", {})).rejects.toMatchObject({
      code: "WORKSPACE_NOT_FOUND",
      status: 404,
    } satisfies Partial<ResourceReadError>);
    expect(read).not.toHaveBeenCalled();
  });

  it("resolves Alpha after the first 200 global rows, scopes child facts, and redacts projection-only fields", async () => {
    const strategies: Row[] = Array.from({ length: 205 }, (_, index) => ({
      strategy_id: `str_noise_${index}`, alpha_id: `alpha_noise_${index}`, label: `Noise ${index}`,
      version: "1", mode: "paper", updated_at: "2026-09-05T10:00:00.000Z",
    }));
    strategies.push({
      strategy_id: "str_target", alpha_id: "alpha_target", label: "Target alpha", version: "4.2", trader_id: "owner-a",
      state: "READY", active: true, mode: "paper", updated_at: "2026-09-05T12:00:00.000Z", secret_token: "never-leak",
    });
    const value = await service({
      [RELATION.strategies]: relation("strategies", strategies),
      [RELATION.deployments]: relation("strategy_deployments", [{
        deployment_id: "dep_target", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE",
        currency: "USDT", portfolio_id: "pf_target", active: true, state: "ACTIVE", updated_at: "2026-09-05T12:00:00.000Z",
      }]),
      [RELATION.accounts]: relation("accounts", [{
        account_id: "acc_target", strategy_id: "str_target", mode: "paper", venue: "BINANCE", base_currency: "USDT",
        external_account_ref: "private-broker-ref", updated_at: "2026-09-05T12:00:00.000Z",
      }]),
      [RELATION.positions]: relation("positions_v2", [
        { position_id: "pos_target", deployment_id: "dep_target", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE", instrument_id: "BTCUSDT", notional: "6100", updated_at: "2026-09-05T12:00:00.000Z" },
        { position_id: "pos_foreign", deployment_id: "dep_foreign", strategy_id: "str_foreign", account_id: "acc_foreign", mode: "paper", venue: "BINANCE", instrument_id: "ETHUSDT", notional: "999999", updated_at: "2026-09-05T12:00:00.000Z" },
      ]),
    })
      .read(principal(), "ALPHA", "alpha_target", "paper") as Record<string, any>;

    expect(value).toMatchObject({ schema_version: "execution.alpha-resource.v1", resource: { kind: "ALPHA", id: "alpha_target" } });
    expect(value.data.alpha.alpha_id).toBe("alpha_target");
    expect(value.data.positions).toHaveLength(1);
    expect(value.data.positions[0].position_id).toBe("pos_target");
    expect(value.as_of_ms).toBe(Date.parse("2026-09-05T12:00:00.000Z"));
    const serialized = JSON.stringify(value);
    expect(serialized).not.toContain("pos_foreign");
    expect(serialized).not.toContain("secret_token");
    expect(serialized).not.toContain("never-leak");
    expect(serialized).not.toContain("private-broker-ref");
    expect(serialized).not.toContain("opaque-source-cursor-must-not-leak");
  });

  it("never selects a portfolio transactional row by portfolio id alone", async () => {
    const value = await service({
      [RELATION.portfolios]: relation("portfolios", [{ portfolio_id: "pf_target", name: "Target", base_currency: "USDT", state: "ACTIVE", updated_at: "2026-09-05T12:00:00.000Z" }]),
      [RELATION.allocations]: relation("portfolio_allocations", [{ allocation_id: "alloc_target", portfolio_id: "pf_target", deployment_id: "dep_target", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE", currency: "USDT", allocated_capital: "1000" }]),
      [RELATION.deployments]: relation("strategy_deployments", [{ deployment_id: "dep_target", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE", portfolio_id: "pf_target", currency: "USDT", active: true, state: "ACTIVE", updated_at: "2026-09-05T12:00:00.000Z" }]),
      [RELATION.positions]: relation("positions_v2", [{ position_id: "ambiguous", portfolio_id: "pf_target", strategy_id: "str_target", mode: "paper", venue: "BINANCE", notional: "999999", updated_at: "2026-09-05T12:00:00.000Z" }]),
    }).read(principal(), "PORTFOLIO", "pf_target", "paper") as Record<string, any>;

    expect(value.data.positions).toEqual([]);
    expect(value.panels.positions.reason_code).toBe("EDS04_TRANSACTIONAL_SCOPE_AMBIGUOUS");
    expect(JSON.stringify(value)).not.toContain("999999");
  });

  it("does not expand portfolio scope through an allocation contradicting its deployment", async () => {
    const value = await service({
      [RELATION.portfolios]: relation("portfolios", [{ portfolio_id: "pf_target", name: "Target", mode: "paper" }]),
      [RELATION.allocations]: relation("portfolio_allocations", [{ allocation_id: "alloc_conflict", portfolio_id: "pf_target",
        deployment_id: "dep_foreign", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE", currency: "USDT", allocated_capital: "10" }]),
      [RELATION.deployments]: relation("strategy_deployments", [{ deployment_id: "dep_foreign", strategy_id: "str_foreign",
        account_id: "acc_foreign", mode: "paper", venue: "BINANCE", active: true }]),
      [RELATION.accounts]: relation("accounts", [{ account_id: "acc_foreign", mode: "paper", venue: "BINANCE" }]),
      [RELATION.orders]: relation("orders", [{ deployment_id: "dep_foreign", order_id: "foreign_order", mode: "paper", status: "NEW" }]),
    }).read(principal(), "PORTFOLIO", "pf_target", "paper") as Record<string, any>;
    expect(value.data.deployments).toEqual([]);
    expect(value.data.accounts).toEqual([]);
    expect(value.data.orders).toEqual([]);
    expect(value.data.portfolio_allocations).toEqual([]);
    expect(value.panels.portfolio_allocations.reason_code).toBe("EDS04_ALLOCATION_DEPLOYMENT_SCOPE_MISMATCH");
    expect(JSON.stringify(value)).not.toContain("foreign_order");
  });

  it("does not treat a malformed published allocation identity as an absent field", async () => {
    const value = await service({
      [RELATION.portfolios]: relation("portfolios", [{ portfolio_id: "pf_target", mode: "paper" }]),
      [RELATION.allocations]: relation("portfolio_allocations", [{ allocation_id: "alloc_bad", portfolio_id: "pf_target",
        deployment_id: "dep_target", account_id: 7, mode: "paper" }]),
      [RELATION.deployments]: relation("strategy_deployments", [{ deployment_id: "dep_target", strategy_id: "str_target",
        account_id: "acc_target", mode: "paper", venue: "BINANCE" }]),
    }).read(principal(), "PORTFOLIO", "pf_target", "paper") as Record<string, any>;
    expect(value.data.deployments).toEqual([]);
    expect(value.data.portfolio_allocations).toEqual([]);
    expect(value.panels.portfolio_allocations.reason_code).toBe("EDS04_ALLOCATION_DEPLOYMENT_SCOPE_MISMATCH");
  });

  it("withholds Alpha allocation facts that contradict the selected deployment", async () => {
    const value = await service({
      [RELATION.strategies]: relation("strategies", [{ strategy_id: "str_target", alpha_id: "alpha_target", mode: "paper" }]),
      [RELATION.deployments]: relation("strategy_deployments", [{ deployment_id: "dep_target", strategy_id: "str_target",
        account_id: "acc_target", mode: "paper", venue: "BINANCE", active: true }]),
      [RELATION.allocations]: relation("portfolio_allocations", [{ allocation_id: "alloc_conflict", portfolio_id: "pf_target",
        deployment_id: "dep_target", strategy_id: "str_target", account_id: "acc_foreign", mode: "paper", venue: "BINANCE", currency: "USDT", allocated_capital: "10" }]),
    }).read(principal(), "ALPHA", "alpha_target", "paper") as Record<string, any>;
    expect(value.data.portfolio_allocations).toEqual([]);
    expect(value.panels.portfolio_allocations.reason_code).toBe("EDS04_ALLOCATION_DEPLOYMENT_SCOPE_MISMATCH");
  });

  it("does not count an incomplete allocation set when a matching identity names an unknown deployment", async () => {
    const value = await service({
      [RELATION.strategies]: relation("strategies", [{ strategy_id: "str_target", alpha_id: "alpha_target", mode: "paper" }]),
      [RELATION.deployments]: relation("strategy_deployments", [{ deployment_id: "dep_target", strategy_id: "str_target",
        account_id: "acc_target", mode: "paper", venue: "BINANCE", active: true }]),
      [RELATION.allocations]: relation("portfolio_allocations", [
        { allocation_id: "alloc_valid", deployment_id: "dep_target", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE", currency: "USDT", allocated_capital: "20" },
        { allocation_id: "alloc_unknown", deployment_id: "dep_missing", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE", currency: "USDT", allocated_capital: "30" },
      ]),
    }).read(principal(), "ALPHA", "alpha_target", "paper") as Record<string, any>;
    expect(value.data.portfolio_allocations.map((row: Row) => row.allocation_id)).toEqual(["alloc_valid"]);
    expect(value.panels.portfolio_allocations.reason_code).toBe("EDS04_ALLOCATION_DEPLOYMENT_SCOPE_MISMATCH");
    expect(value.data.alpha.allocations).toEqual([expect.objectContaining({ currency: "USDT", value: null, state: "UNAVAILABLE" })]);
  });

  it("does not invent position PnL or exposure currency, or zero for an unavailable positions population", async () => {
    const relations: Record<string, ProjectionRelation> = {
      [RELATION.strategies]: relation("strategies", [{ strategy_id: "str_target", alpha_id: "alpha_target", mode: "paper" }]),
      [RELATION.deployments]: relation("strategy_deployments", [{ deployment_id: "dep_target", strategy_id: "str_target",
        account_id: "acc_target", mode: "paper", venue: "BINANCE", currency: "USDT", active: true }]),
      [RELATION.accounts]: relation("accounts", [{ account_id: "acc_target", strategy_id: "str_target", mode: "paper", venue: "BINANCE", base_currency: "USDT" }]),
      [RELATION.positions]: relation("positions_v2", [{ position_id: "pos_target", strategy_id: "str_target",
        account_id: "acc_target", mode: "paper", venue: "BINANCE", instrument_id: "BTCUSDT",
        realized_pnl: "12", unrealized_pnl: "4", notional: "100" }]),
    };
    const complete = await service(relations).read(principal(), "ALPHA", "alpha_target", "paper") as Record<string, any>;
    expect(complete.data.positions).toHaveLength(1); // Raw source fact is retained.
    expect(complete.data.alpha.deployments).toEqual([expect.objectContaining({ position_fact_count: 1,
      position_count_availability: "AVAILABLE", realized_pnl: null, unrealized_pnl: null, net_pnl: null, exposure: null,
      position_metrics_availability: "UNAVAILABLE", position_metrics_reason_code: "POSITION_FINANCIAL_SOURCE_NOT_QUALIFIED" })]);
    expect(complete.data.alpha.position_pnl).toEqual([expect.objectContaining({ currency: "USDT", realized: null,
      unrealized: null, net: null, state: "UNAVAILABLE", reason_code: "POSITION_FINANCIAL_SOURCE_NOT_QUALIFIED" })]);
    expect(complete.data.alpha.metrics_availability.current_position_pnl).toEqual({ state: "UNAVAILABLE",
      reason_code: "POSITION_FINANCIAL_SOURCE_NOT_QUALIFIED" });

    relations[RELATION.positions] = relation("positions_v2", [], "PARTIAL");
    const partial = await service(relations).read(principal(), "ALPHA", "alpha_target", "paper") as Record<string, any>;
    expect(partial.data.alpha.deployments).toEqual([expect.objectContaining({ position_fact_count: null,
      position_count_availability: "UNAVAILABLE", position_count_reason_code: "POSITION_POPULATION_NOT_QUALIFIED", net_pnl: null })]);
    relations[RELATION.positions] = relation("positions_v2", []);
    const empty = await service(relations).read(principal(), "ALPHA", "alpha_target", "paper") as Record<string, any>;
    expect(empty.data.alpha.deployments).toEqual([expect.objectContaining({ position_fact_count: 0,
      position_count_availability: "AVAILABLE", net_pnl: null })]);
    relations[RELATION.positions] = relation("positions_v2", [
      { position_id: "pos_target", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE", instrument_id: "BTCUSDT", notional: "100" },
      { position_id: "pos_target", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE", instrument_id: "BTCUSDT", notional: "200" },
    ]);
    const conflicted = await service(relations).read(principal(), "ALPHA", "alpha_target", "paper") as Record<string, any>;
    expect(conflicted.panels.positions.reason_code).toBe("EDS04_RESOURCE_FINANCIAL_IDENTITY_CONFLICT");
    expect(conflicted.data.alpha.deployments).toEqual([expect.objectContaining({ position_fact_count: null,
      position_count_availability: "UNAVAILABLE", exposure: null })]);
    relations[RELATION.positions] = relation("positions_v2", [
      { position_id: "pos_target", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE", instrument_id: "BTCUSDT", notional: "100" },
      { position_id: "pos_target", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE", instrument_id: "ETHUSDT", notional: "100" },
    ]);
    const changedInstrument = await service(relations).read(principal(), "ALPHA", "alpha_target", "paper") as Record<string, any>;
    expect(changedInstrument.panels.positions.reason_code).toBe("EDS04_RESOURCE_FINANCIAL_IDENTITY_CONFLICT");
    expect(changedInstrument.data.alpha.deployments[0].position_fact_count).toBeNull();
  });

  it("does not turn missing, partial or multiple financial inputs into Alpha balance or allocation totals", async () => {
    const relations: Record<string, ProjectionRelation> = {
      [RELATION.strategies]: relation("strategies", [{ strategy_id: "str_target", alpha_id: "alpha_target", mode: "paper" }]),
      [RELATION.deployments]: relation("strategy_deployments", [{ deployment_id: "dep_target", strategy_id: "str_target",
        account_id: "acc_target", portfolio_id: "pf_target", mode: "paper", venue: "BINANCE", currency: "USDT", active: true }]),
      [RELATION.accounts]: relation("accounts", [{ account_id: "acc_target", strategy_id: "str_target", mode: "paper", venue: "BINANCE", base_currency: "USDT" }]),
      [RELATION.balances]: relation("account_balances", [{ account_id: "acc_target", currency: "USDT", total: "10", free: "0", locked: "10" }]),
      [RELATION.allocations]: relation("portfolio_allocations", [{ allocation_id: "alloc_1", portfolio_id: "pf_target", deployment_id: "dep_target",
        strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE", currency: "USDT", allocated_capital: "20" }]),
    };
    const read = () => service(relations).read(principal(), "ALPHA", "alpha_target", "paper") as Promise<Record<string, any>>;
    let alpha = (await read()).data.alpha;
    expect(alpha.balances).toEqual([expect.objectContaining({ currency: "USDT", total: "10", free: "0", locked: "10", state: "AVAILABLE" })]);
    expect(alpha.allocations).toEqual([expect.objectContaining({ currency: "USDT", value: "20", state: "AVAILABLE" })]);

    relations[RELATION.balances] = relation("account_balances", [{ account_id: "acc_target", currency: "USDT", total: "10", free: null, locked: "10" }]);
    alpha = (await read()).data.alpha;
    expect(alpha.balances).toEqual([expect.objectContaining({ currency: "USDT", total: "10", free: null, locked: "10", state: "UNAVAILABLE" })]);

    relations[RELATION.balances] = relation("account_balances", [{ account_id: "acc_target", currency: "USDT", total: "10", free: "0", locked: "10" }], "PARTIAL");
    alpha = (await read()).data.alpha;
    expect(alpha.balances).toEqual([expect.objectContaining({ currency: "USDT", total: null, free: null, locked: null, state: "UNAVAILABLE" })]);

    relations[RELATION.balances] = relation("account_balances", [
      { account_id: "acc_target", currency: "USDT", total: "10", free: "0", locked: "10" },
      { account_id: "acc_target", currency: "UNKNOWN", total: "10", free: "0", locked: "10" },
    ]);
    alpha = (await read()).data.alpha;
    expect(alpha.balances.every((row: Row) => row.state === "UNAVAILABLE")).toBe(true);

    relations[RELATION.allocations] = relation("portfolio_allocations", [
      { allocation_id: "alloc_1", portfolio_id: "pf_target", deployment_id: "dep_target", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE", currency: "USDT", allocated_capital: "20" },
      { allocation_id: "alloc_2", portfolio_id: "pf_target", deployment_id: "dep_target", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE", currency: "USDT", allocated_capital: "30" },
    ]);
    const ambiguous = await read();
    expect(ambiguous.data.portfolio_allocations).toHaveLength(2);
    expect(ambiguous.data.alpha.allocations).toEqual([expect.objectContaining({ currency: "USDT", value: null, state: "UNAVAILABLE" })]);
    relations[RELATION.allocations] = relation("portfolio_allocations", [
      { allocation_id: "alloc_1", portfolio_id: "pf_target", deployment_id: "dep_target", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE", currency: "USDT", allocated_capital: "20" },
      { allocation_id: "alloc_1", portfolio_id: "pf_target", deployment_id: "dep_target", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE", currency: "USDC", allocated_capital: "20" },
    ]);
    const changedCurrency = await read();
    expect(changedCurrency.panels.portfolio_allocations.reason_code).toBe("EDS04_RESOURCE_FINANCIAL_IDENTITY_CONFLICT");
    // Preserve both observed currency labels for diagnosis, but neither
    // conflicting amount may become an available allocation.
    expect(changedCurrency.data.alpha.allocations).toEqual([
      expect.objectContaining({ currency: "USDC", value: null, state: "UNAVAILABLE" }),
      expect.objectContaining({ currency: "USDT", value: null, state: "UNAVAILABLE" }),
    ]);
  });

  it("qualifies deployment financial details against the same complete, unambiguous currency population", async () => {
    const balances = [{ account_id: "acc_target", currency: "USDT", total: "100.125", free: "0", locked: "100.125" }];
    const allocations = [{ allocation_id: "alloc_1", portfolio_id: "pf_target", deployment_id: "dep_target",
      strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE", currency: "USDT", allocated_capital: "20.5" }];
    const relations: Record<string, ProjectionRelation> = {
      [RELATION.strategies]: relation("strategies", [{ strategy_id: "str_target", alpha_id: "alpha_target", mode: "paper" }]),
      [RELATION.deployments]: relation("strategy_deployments", [{ deployment_id: "dep_target", strategy_id: "str_target",
        account_id: "acc_target", portfolio_id: "pf_target", mode: "paper", venue: "BINANCE", currency: "USDT", active: true }]),
      [RELATION.accounts]: relation("accounts", [{ account_id: "acc_target", strategy_id: "str_target", mode: "paper", venue: "BINANCE", base_currency: "USDT" }]),
      [RELATION.balances]: relation("account_balances", balances),
      [RELATION.allocations]: relation("portfolio_allocations", allocations),
    };
    const read = () => service(relations).read(principal(), "ALPHA", "alpha_target", "paper") as Promise<Record<string, any>>;
    let value = await read();
    expect(value.data.alpha.deployments[0]).toMatchObject({ currency: "USDT", allocation: "20.5", balance_total: "100.125", balance_free: "0", balance_locked: "100.125" });

    relations[RELATION.balances] = relation("account_balances", balances, "PARTIAL");
    value = await read();
    expect(value.data.account_balances).toHaveLength(1); // Retain the observation; do not present it as a qualified balance.
    expect(value.data.alpha.deployments[0]).toMatchObject({ balance_total: null, balance_free: null, balance_locked: null });

    relations[RELATION.balances] = relation("account_balances", balances);
    relations[RELATION.allocations] = relation("portfolio_allocations", allocations, "PARTIAL");
    value = await read();
    expect(value.data.portfolio_allocations).toHaveLength(1);
    expect(value.data.alpha.deployments[0].allocation).toBeNull();

    relations[RELATION.allocations] = relation("portfolio_allocations", [{ ...allocations[0], currency: "USDC" }]);
    value = await read();
    expect(value.data.alpha.deployments[0]).toMatchObject({ currency: "USDT", allocation: null });

    relations[RELATION.allocations] = relation("portfolio_allocations", [{ ...allocations[0], currency: null }]);
    value = await read();
    expect(value.data.alpha.deployments[0].allocation).toBeNull();

    relations[RELATION.balances] = relation("account_balances", [balances[0], { ...balances[0], total: "999" }]);
    value = await read();
    expect(value.data.alpha.deployments[0]).toMatchObject({ balance_total: null, balance_free: null, balance_locked: null });

    relations[RELATION.balances] = relation("account_balances", [balances[0], { ...balances[0], currency: null }]);
    value = await read();
    expect(value.data.alpha.deployments[0].balance_total).toBeNull();

    // Fractional JSON numbers have already passed through binary floating
    // point; keep them unavailable while preserving an exact numeric zero.
    relations[RELATION.balances] = relation("account_balances", [{ ...balances[0], total: 100.125, free: 0 }]);
    value = await read();
    expect(value.data.alpha.deployments[0]).toMatchObject({ balance_total: null, balance_free: "0" });

    relations[RELATION.allocations] = relation("portfolio_allocations", [allocations[0], { ...allocations[0], allocation_id: "alloc_2" }]);
    value = await read();
    expect(value.data.alpha.deployments[0].allocation).toBeNull();
  });

  it("does not turn missing reconciliation or deployments into a healthy Alpha", async () => {
    const relations: Record<string, ProjectionRelation> = {
      [RELATION.strategies]: relation("strategies", [{ strategy_id: "str_target", alpha_id: "alpha_target", mode: "paper" }]),
      [RELATION.deployments]: relation("strategy_deployments", [{ deployment_id: "dep_target", strategy_id: "str_target",
        account_id: "acc_target", mode: "paper", venue: "BINANCE", active: true }]),
    };
    const read = () => service(relations).read(principal(), "ALPHA", "alpha_target", "paper") as Promise<Record<string, any>>;
    let alpha = (await read()).data.alpha;
    expect(alpha.deployments[0].health).toBe("UNKNOWN");
    expect(alpha.health).toBe("UNKNOWN");
    relations[RELATION.reconciliation] = relation("reconciliation_findings", [], "PARTIAL");
    alpha = (await read()).data.alpha;
    expect(alpha.deployments[0].health).toBe("UNKNOWN");
    expect(alpha.health).toBe("UNKNOWN");
    relations[RELATION.reconciliation] = relation("reconciliation_findings", []);
    alpha = (await read()).data.alpha;
    expect(alpha.deployments[0].health).toBe("READY");
    expect(alpha.health).toBe("READY");
    relations[RELATION.reconciliation] = relation("reconciliation_findings", [{ deployment_id: "dep_target",
      account_id: "acc_target", strategy_id: "str_target", venue: "BINANCE", mode: "paper", status: "RESOLVED" }]);
    alpha = (await read()).data.alpha;
    expect(alpha.health).toBe("READY");
    relations[RELATION.reconciliation] = relation("reconciliation_findings", [{ deployment_id: "dep_target",
      account_id: "acc_target", strategy_id: "str_target", venue: "BINANCE", mode: "paper", status: "OPEN" }]);
    alpha = (await read()).data.alpha;
    expect(alpha.deployments[0].health).toBe("FINDING");
    expect(alpha.health).toBe("ATTENTION");
    delete relations[RELATION.deployments];
    alpha = (await read()).data.alpha;
    expect(alpha.health).toBe("UNKNOWN");
    relations[RELATION.deployments] = relation("strategy_deployments", []);
    alpha = (await read()).data.alpha;
    expect(alpha.health).toBe("RESEARCH_ONLY");
  });

  it("permits a full unique deployment tuple but rejects the same tuple when it is duplicated", async () => {
    const base: Record<string, ProjectionRelation> = {
      [RELATION.accounts]: relation("accounts", [{ account_id: "acc_target", strategy_id: "str_target", mode: "paper", venue: "BINANCE", base_currency: "USDT", updated_at: "2026-09-05T12:00:00.000Z" }]),
      [RELATION.deployments]: relation("strategy_deployments", [{ deployment_id: "dep_one", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE", currency: "USDT", active: true, state: "ACTIVE", updated_at: "2026-09-05T12:00:00.000Z" }]),
      [RELATION.orders]: relation("orders", [{ order_id: "ord_tuple", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE", quantity: "1", status: "NEW", updated_at: "2026-09-05T12:00:00.000Z" }]),
    };
    const exact = await service(base).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(exact.data.orders).toHaveLength(1);
    expect(exact.data.orders[0].deployment_id).toBe("dep_one");

    base[RELATION.deployments] = relation("strategy_deployments", [
      ...(base[RELATION.deployments].items.map((item) => item.fields)),
      { deployment_id: "dep_two", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE", currency: "USDT", active: true, state: "ACTIVE", updated_at: "2026-09-05T12:00:01.000Z" },
    ]);
    const duplicate = await service(base).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(duplicate.data.orders).toEqual([]);
    expect(duplicate.panels.orders.reason_code).toBe("EDS04_TRANSACTIONAL_SCOPE_AMBIGUOUS");
  });

  it("links a unique Paper deployment and transactional tuple regardless of source casing, without admitting Live", async () => {
    const base: Record<string, ProjectionRelation> = {
      [RELATION.accounts]: relation("accounts", [{ account_id: "acc_target", mode: "PAPER", venue: "BINANCE" }]),
      [RELATION.deployments]: relation("strategy_deployments", [
        { deployment_id: "dep_paper", strategy_id: "str_target", account_id: "acc_target", mode: "PAPER", venue: "BINANCE" },
        { deployment_id: "dep_live", strategy_id: "str_target", account_id: "acc_target", mode: "LIVE", venue: "BINANCE" },
      ]),
      [RELATION.orders]: relation("orders", [
        { order_id: "ord_paper", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE", status: "NEW" },
        { order_id: "ord_live", strategy_id: "str_target", account_id: "acc_target", mode: "LIVE", venue: "BINANCE", status: "NEW" },
      ]),
    };
    const paper = await service(base).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(paper.data.orders.map((row: Row) => [row.order_id, row.deployment_id])).toEqual([["ord_paper", "dep_paper"]]);
    expect(JSON.stringify(paper)).not.toContain("ord_live");

    base[RELATION.deployments] = relation("strategy_deployments", [
      { deployment_id: "dep_paper", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE" },
    ]);
    base[RELATION.orders] = relation("orders", [
      { order_id: "ord_paper", strategy_id: "str_target", account_id: "acc_target", mode: "PAPER", venue: "BINANCE", status: "NEW" },
    ]);
    const alternate = await service(base).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(alternate.data.orders.map((row: Row) => [row.order_id, row.deployment_id])).toEqual([["ord_paper", "dep_paper"]]);
  });

  it("treats Paper deployments with case-only mode differences as one ambiguous tuple", async () => {
    const value = await service({
      [RELATION.accounts]: relation("accounts", [{ account_id: "acc_target", mode: "paper", venue: "BINANCE" }]),
      [RELATION.deployments]: relation("strategy_deployments", [
        { deployment_id: "dep_one", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE" },
        { deployment_id: "dep_two", strategy_id: "str_target", account_id: "acc_target", mode: "PAPER", venue: "BINANCE" },
      ]),
      [RELATION.orders]: relation("orders", [{ order_id: "ord_ambiguous", strategy_id: "str_target", account_id: "acc_target",
        mode: "paper", venue: "BINANCE", status: "NEW" }]),
    }).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(value.data.orders).toEqual([]);
    expect(value.panels.orders.reason_code).toBe("EDS04_TRANSACTIONAL_SCOPE_AMBIGUOUS");
  });

  it("does not attach an order tuple to a Portfolio when another Portfolio has the same deployment tuple", async () => {
    const value = await service({
      [RELATION.portfolios]: relation("portfolios", [{ portfolio_id: "pf_target", mode: "paper" }]),
      [RELATION.allocations]: relation("portfolio_allocations", [
        { allocation_id: "allocation_target", portfolio_id: "pf_target", deployment_id: "dep_target", mode: "paper" },
        { allocation_id: "allocation_other", portfolio_id: "pf_other", deployment_id: "dep_other", mode: "paper" },
      ]),
      [RELATION.deployments]: relation("strategy_deployments", [
        { deployment_id: "dep_target", portfolio_id: "pf_target", strategy_id: "str_same", account_id: "acc_same", mode: "paper", venue: "BINANCE" },
        { deployment_id: "dep_other", portfolio_id: "pf_other", strategy_id: "str_same", account_id: "acc_same", mode: "PAPER", venue: "BINANCE" },
      ]),
      [RELATION.orders]: relation("orders", [{ order_id: "ord_ambiguous", strategy_id: "str_same", account_id: "acc_same",
        mode: "paper", venue: "BINANCE", status: "NEW" }]),
    }).read(principal(), "PORTFOLIO", "pf_target", "paper") as Record<string, any>;
    expect(value.data.orders).toEqual([]);
    expect(value.panels.orders.reason_code).toBe("EDS04_TRANSACTIONAL_SCOPE_AMBIGUOUS");
  });

  it.each(["partial", "truncated", "lineage-held"] as const)("does not prove a unique tuple from a %s deployment population", async limitation => {
    const deployments = relation("strategy_deployments", [
      { deployment_id: "dep_target", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE" },
    ], limitation === "partial" ? "PARTIAL" : "COMPLETE");
    if (limitation === "truncated") deployments.window = { days: 1, max_rows: 1, basis: "MERGED_SNAPSHOT_LADDER", truncated: true };
    if (limitation === "lineage-held") deployments.lineage_rejects = { UNKNOWN_PARENT: 1 };
    const value = await service({
      [RELATION.accounts]: relation("accounts", [{ account_id: "acc_target", mode: "paper", venue: "BINANCE" }]),
      [RELATION.deployments]: deployments,
      [RELATION.orders]: relation("orders", [{ order_id: "ord_unproven", strategy_id: "str_target", account_id: "acc_target",
        mode: "paper", venue: "BINANCE", status: "NEW" }]),
    }).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(value.data.orders).toEqual([]);
    expect(value.panels.orders.reason_code).toBe("EDS04_TRANSACTIONAL_SCOPE_AMBIGUOUS");
  });

  it.each(["strategy_id", "account_id", "mode", "venue"] as const)(
    "does not prove a unique tuple when another deployment omits %s", async missing => {
      const tuple: Row = { strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE" };
      const other: Row = { ...tuple, deployment_id: "dep_other" };
      other[missing] = null;
      const value = await service({
        [RELATION.accounts]: relation("accounts", [{ account_id: "acc_target", mode: "paper", venue: "BINANCE" }]),
        [RELATION.deployments]: relation("strategy_deployments", [{ ...tuple, deployment_id: "dep_target" }, other]),
        [RELATION.orders]: relation("orders", [{ ...tuple, order_id: "order_tuple", status: "NEW" }]),
      }).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
      expect(value.data.orders).toEqual([]);
      expect(value.panels.orders.reason_code).toBe("EDS04_TRANSACTIONAL_SCOPE_AMBIGUOUS");
    },
  );

  it("does not reinterpret a malformed published deployment ID as a tuple-only order", async () => {
    const tuple: Row = { strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE" };
    const value = await service({
      [RELATION.accounts]: relation("accounts", [{ account_id: "acc_target", mode: "paper", venue: "BINANCE" }]),
      [RELATION.deployments]: relation("strategy_deployments", [{ ...tuple, deployment_id: "dep_target" }]),
      [RELATION.orders]: relation("orders", [{ ...tuple, deployment_id: 7, order_id: "malformed_id", status: "NEW" }]),
    }).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(value.data.orders).toEqual([]);
    expect(value.panels.orders.reason_code).toBe("EDS04_TRANSACTIONAL_SCOPE_AMBIGUOUS");
  });

  it("does not alias a foreign transaction through delimiters embedded in tuple fields", async () => {
    const value = await service({
      [RELATION.accounts]: relation("accounts", [{ account_id: "acc_target", mode: "paper", venue: "VENUE\u001fpaper\u001fOTHER" }]),
      [RELATION.deployments]: relation("strategy_deployments", [{ deployment_id: "dep_target", strategy_id: "str_target",
        account_id: "acc_target", mode: "paper", venue: "VENUE\u001fpaper\u001fOTHER", active: true }]),
      [RELATION.orders]: relation("orders", [{ order_id: "foreign_order", strategy_id: "str_target",
        account_id: "acc_target\u001fpaper\u001fVENUE", mode: "paper", venue: "OTHER", quantity: "1", status: "NEW" }]),
    }).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(value.data.orders).toEqual([]);
    expect(JSON.stringify(value)).not.toContain("foreign_order");
  });

  it("does not collapse distinct retained order facts containing delimiters", async () => {
    const value = await service({
      [RELATION.accounts]: relation("accounts", [{ account_id: "acc_target", mode: "paper", venue: "BINANCE" }]),
      [RELATION.deployments]: relation("strategy_deployments", [{ deployment_id: "dep_target", strategy_id: "str_target",
        account_id: "acc_target", mode: "paper", venue: "BINANCE", active: true }]),
      [RELATION.orders]: relation("orders", [
        { order_id: "ord", deployment_id: "dep_target", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE", instrument_id: "BTC\u001fUSD", symbol: "PERP", status: "NEW" },
        { order_id: "ord", deployment_id: "dep_target", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE", instrument_id: "BTC", symbol: "USD\u001fPERP", status: "NEW" },
      ]),
    }).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(value.data.orders).toHaveLength(2);
  });

  it.each(["account_id", "strategy_id", "venue"])("withholds an explicit-deployment transaction with contradictory %s", async field => {
    const common = { deployment_id: "dep_target", strategy_id: "str_target", account_id: "acc_target",
      mode: "paper", venue: "BINANCE" };
    const value = await service({
      [RELATION.accounts]: relation("accounts", [{ account_id: "acc_target", mode: "paper", venue: "BINANCE" }]),
      [RELATION.deployments]: relation("strategy_deployments", [{ ...common, active: true }]),
      [RELATION.orders]: relation("orders", [{ ...common, order_id: "foreign_order", [field]: "different", status: "NEW" },
        { deployment_id: "dep_target", order_id: "order_with_id_only", mode: "paper", status: "NEW" }]),
    }).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(value.data.orders.map((row: Row) => row.order_id)).toEqual(["order_with_id_only"]);
    expect(value.panels.orders.reason_code).toBe("EDS04_TRANSACTIONAL_SCOPE_AMBIGUOUS");
  });

  it("does not treat a malformed published transaction identity as an absent field", async () => {
    const common = { deployment_id: "dep_target", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE" };
    const value = await service({
      [RELATION.accounts]: relation("accounts", [{ account_id: "acc_target", mode: "paper", venue: "BINANCE" }]),
      [RELATION.deployments]: relation("strategy_deployments", [common]),
      [RELATION.orders]: relation("orders", [{ ...common, order_id: "bad_order", account_id: 7 }]),
    }).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(value.data.orders).toEqual([]);
    expect(value.panels.orders.reason_code).toBe("EDS04_TRANSACTIONAL_SCOPE_AMBIGUOUS");
  });

  it("does not accept a deployment id duplicated outside the selected account", async () => {
    const value = await service({
      [RELATION.accounts]: relation("accounts", [{ account_id: "acc_target", mode: "paper", venue: "BINANCE" }]),
      [RELATION.deployments]: relation("strategy_deployments", [
        { deployment_id: "dep_duplicate", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE" },
        { deployment_id: "dep_duplicate", strategy_id: "str_other", account_id: "acc_other", mode: "paper", venue: "BINANCE" },
      ]),
      [RELATION.orders]: relation("orders", [{ deployment_id: "dep_duplicate", order_id: "ambiguous_order", mode: "paper", status: "NEW" }]),
    }).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(value.data.orders).toEqual([]);
    expect(JSON.stringify(value)).not.toContain("ambiguous_order");
  });

  it.each(["truncated", "lineage-held"] as const)("does not call an account absent from a %s source", async condition => {
    const accounts = relation("accounts", [{ account_id: "acc_other", mode: "paper", venue: "BINANCE" }]);
    if (condition === "truncated") accounts.window = { days: 1, max_rows: 1, basis: "MERGED_SNAPSHOT_LADDER", truncated: true };
    else accounts.lineage_rejects = { missing_parent: 1 };
    const value = await service({ [RELATION.accounts]: accounts }).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(value.capabilities).toContainEqual(expect.objectContaining({ capability_id: "resource.account.identity", state: "PARTIAL",
      reason_code: "EDS04_ACCOUNT_OUTSIDE_RETAINED_WINDOW" }));
  });

  it("keeps account currencies separate, derives only server-side comparison/headroom, and emits a typed binding resource", async () => {
    const relations: Record<string, ProjectionRelation> = {
      [RELATION.accounts]: relation("accounts", [{ account_id: "acc_target", strategy_id: "str_target", mode: "paper", venue: "BINANCE", base_currency: "USDT", external_account_ref: "private-ref", updated_at: "2026-09-05T12:00:00.000Z" }]),
      [RELATION.venueAccounts]: relation("venue_accounts", [{ venue_account_id: "va_target", binding_id: "acc_target@BINANCE", account_id: "acc_target", mode: "paper", venue: "BINANCE", state: "ACTIVE", updated_at: "2026-09-05T12:00:00.000Z" }]),
      [RELATION.balances]: relation("account_balances", [
        { account_id: "acc_target", currency: "USDT", total: "100", free: "80", locked: "20", updated_at: "2026-09-05T12:00:00.000Z" },
        { account_id: "acc_target", currency: "USDC", total: "50", free: "40", locked: "10", updated_at: "2026-09-05T12:00:00.000Z" },
      ]),
      [RELATION.margins]: relation("margin_balances", [{ account_id: "acc_target", currency: "USDT", initial: "15", maintenance: "10", updated_at: "2026-09-05T12:00:00.000Z" }]),
      [RELATION.brokerSync]: relation("broker_account_sync_effective", [{ sync_id: "sync_target", external_account_ref: "private-ref", mode: "paper", venue: "BINANCE", status: "SYNCED", currency: "USDT", buying_power: "79", synced_at: "2026-09-05T12:00:00.000Z" }]),
    };
    const account = await service(relations).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(account.data.exposure_headroom).toEqual(expect.arrayContaining([
      expect.objectContaining({ currency: "USDT", free: "80", maintenance: "10", headroom: "70", verdict: "AVAILABLE" }),
      expect.objectContaining({ currency: "USDC", free: "40", maintenance: null, headroom: null, verdict: "UNAVAILABLE" }),
    ]));
    expect(account.data.differences).toEqual([expect.objectContaining({ currency: "USDT", delta: "1", in_sync: false,
      portal_free: "80", broker_buying_power: "79", internal_value: "80", broker_value: "79" })]);
    expect(account.capabilities).toContainEqual(expect.objectContaining({ capability_id: "resource.account.differences", state: "PARTIAL", reason_code: "ACCOUNT_COMPARISON_INCOMPLETE" }));
    expect(JSON.stringify(account)).not.toContain("private-ref");

    const binding = await service(relations).read(principal(), "BINDING", "va_target", "paper") as Record<string, any>;
    expect(binding.data.binding).toMatchObject({ binding_id: "va_target", account_id: "acc_target", venue: "BINANCE", credential_state: "SYNC_SYNCED" });
    expect(JSON.stringify(binding)).not.toContain("private-ref");
  });

  it.each(["shared reference", "shared reference uppercase", "unknown other reference", "invalid other mode", "unknown other venue", "partial account census", "truncated account census", "lineage-held account census"] as const)(
    "does not attach another account's broker observation with %s", async variant => {
      const accounts = [
        { account_id: "acc_target", strategy_id: "str_target", mode: "paper", venue: "BINANCE", external_account_ref: "TEST_ONLY-shared-ref" },
        ...(["shared reference", "shared reference uppercase", "unknown other reference", "invalid other mode", "unknown other venue"].includes(variant) ? [{ account_id: "acc_other", strategy_id: "str_other",
          mode: variant === "shared reference uppercase" ? "PAPER" : variant === "invalid other mode" ? "INVALID" : "paper", venue: variant === "unknown other venue" ? null : "BINANCE",
          external_account_ref: variant === "unknown other reference" ? null : "TEST_ONLY-shared-ref" }] : []),
      ];
      const relations: Record<string, ProjectionRelation> = {
        [RELATION.accounts]: relation("accounts", accounts, variant === "partial account census" ? "PARTIAL" : "COMPLETE"),
        [RELATION.balances]: relation("account_balances", [{ account_id: "acc_target", currency: "USDT", free: "80" }]),
        [RELATION.brokerSync]: relation("broker_account_sync_effective", [{ sync_id: "sync_other", external_account_ref: "TEST_ONLY-shared-ref",
          mode: "paper", venue: "BINANCE", currency: "USDT", buying_power: "79", synced_at: "2026-09-05T12:00:00.000Z" }]),
      };
      if (variant === "truncated account census") relations[RELATION.accounts].window = {
        days: 1, max_rows: 1, basis: "MERGED_SNAPSHOT_LADDER", truncated: true,
      };
      if (variant === "lineage-held account census") relations[RELATION.accounts].lineage_rejects = { missing_parent: 1 };
      const account = await service(relations).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
      expect(account.data.broker_sync).toEqual([]);
      expect(account.data.differences).toEqual([]);
      expect(account.capabilities).toContainEqual(expect.objectContaining({ capability_id: "resource.account.differences", state: "UNAVAILABLE" }));
      expect(JSON.stringify(account)).not.toContain("sync_other");
    },
  );

  it("joins broker observations on the whole published venue, mode and reference grain", async () => {
    const relations: Record<string, ProjectionRelation> = {
      [RELATION.accounts]: relation("accounts", [
        { account_id: "acc_target", mode: "paper", venue: "BINANCE", external_account_ref: "TEST_ONLY-shared" },
        { account_id: "acc_other", mode: "paper", venue: "KRAKEN", external_account_ref: "TEST_ONLY-shared" },
      ]),
      [RELATION.balances]: relation("account_balances", [{ account_id: "acc_target", currency: "USDT", free: "80" }]),
      [RELATION.brokerSync]: relation("broker_account_sync_effective", [
        { sync_id: "sync_target", mode: "PAPER", venue: "BINANCE", external_account_ref: "TEST_ONLY-shared", currency: "USDT", buying_power: "79", synced_at: "2026-09-05T12:00:00.000Z" },
        { sync_id: "sync_other_venue", mode: "paper", venue: "KRAKEN", external_account_ref: "TEST_ONLY-shared", currency: "USDT", buying_power: "999" },
        { sync_id: "sync_other_mode", mode: "LIVE", venue: "BINANCE", external_account_ref: "TEST_ONLY-shared", currency: "USDT", buying_power: "999" },
      ]),
    };
    let account = await service(relations).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(account.data.broker_sync).toEqual([expect.objectContaining({ sync_id: "sync_target" })]);
    expect(account.data.differences).toEqual([expect.objectContaining({ currency: "USDT", delta: "1" })]);
    expect(JSON.stringify(account)).not.toContain("sync_other_");

    relations[RELATION.brokerSync].items.push({
      ...relations[RELATION.brokerSync].items[0],
      fields: { ...relations[RELATION.brokerSync].items[0].fields, sync_id: "sync_unknown_venue", venue: null },
    });
    account = await service(relations).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(account.data.broker_sync).toEqual([expect.objectContaining({ sync_id: "sync_target" })]);
    expect(account.panels.broker_sync.reason_code).toBe("EDS04_EXTERNAL_ACCOUNT_REF_AMBIGUOUS");
    expect(account.data.differences).toEqual([]);
    expect(JSON.stringify(account)).not.toContain("sync_unknown_venue");
  });

  it.each(["mode", "venue"] as const)("withholds broker data when the target account has no %s", async (missing) => {
    const accountRow: Row = { account_id: "acc_target", mode: "paper", venue: "BINANCE", external_account_ref: "TEST_ONLY-ref" };
    accountRow[missing] = null;
    const account = await service({
      [RELATION.accounts]: relation("accounts", [accountRow]),
      [RELATION.brokerSync]: relation("broker_account_sync_effective", [{ sync_id: "sync_unqualified", mode: "paper", venue: "BINANCE", external_account_ref: "TEST_ONLY-ref", currency: "USDT", buying_power: "79" }]),
    }).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(account.data.broker_sync).toEqual([]);
    expect(account.panels.broker_sync.reason_code).toBe("EDS04_EXTERNAL_ACCOUNT_REF_UNAVAILABLE");
    expect(JSON.stringify(account)).not.toContain("sync_unqualified");
  });

  it.each([
    ["brokerSync", "truncated"], ["brokerSync", "lineage rejected"],
    ["balances", "truncated"], ["balances", "lineage rejected"],
  ] as const)("does not compare a %s source with %s rows", async (source, condition) => {
    const relations: Record<string, ProjectionRelation> = {
      [RELATION.accounts]: relation("accounts", [{ account_id: "acc_target", mode: "paper", venue: "BINANCE", external_account_ref: "TEST_ONLY-ref" }]),
      [RELATION.balances]: relation("account_balances", [{ account_id: "acc_target", currency: "USDT", free: "80" }]),
      [RELATION.brokerSync]: relation("broker_account_sync_effective", [{ sync_id: "sync_target", mode: "paper", venue: "BINANCE", external_account_ref: "TEST_ONLY-ref", currency: "USDT", buying_power: "79", synced_at: "2026-09-05T12:00:00.000Z" }]),
    };
    const partial = relations[RELATION[source]];
    if (condition === "truncated") partial.window = { days: 1, max_rows: 1, basis: "MERGED_SNAPSHOT_LADDER", truncated: true };
    else partial.lineage_rejects = { missing_parent: 1 };
    const account = await service(relations).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(account.data.differences).toEqual([]);
    expect(account.capabilities).toContainEqual(expect.objectContaining({ capability_id: "resource.account.differences", state: "UNAVAILABLE" }));
  });

  it("compares source mode without rewriting PAPER and does not count LIVE as the Paper account", async () => {
    const relations: Record<string, ProjectionRelation> = {
      [RELATION.accounts]: relation("accounts", [
        { account_id: "acc_target", mode: "PAPER", venue: "BINANCE", external_account_ref: "TEST_ONLY-paper" },
        { account_id: "acc_live", mode: "LIVE", venue: "BINANCE", external_account_ref: "TEST_ONLY-paper" },
      ]),
      [RELATION.balances]: relation("account_balances", [{ account_id: "acc_target", mode: "PAPER", currency: "USDT", free: "80" }]),
      [RELATION.brokerSync]: relation("broker_account_sync_effective", [{ sync_id: "paper-sync", mode: "PAPER",
        venue: "BINANCE", external_account_ref: "TEST_ONLY-paper", currency: "USDT", buying_power: "79", synced_at: "2026-09-05T12:00:00.000Z" }]),
    };
    const account = await service(relations).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(account.data.accounts).toEqual([expect.objectContaining({ account_id: "acc_target", mode: "PAPER" })]);
    expect(account.data.differences).toEqual([expect.objectContaining({ currency: "USDT", delta: "1" })]);
    expect(JSON.stringify(account)).not.toContain("acc_live");
  });

  it.each([0.1, 9007199254740992])("withholds a resource comparison and headroom from inexact numeric money %s", async amount => {
    const relations: Record<string, ProjectionRelation> = {
      [RELATION.accounts]: relation("accounts", [{ account_id: "acc_target", strategy_id: "str_target", mode: "paper", venue: "BINANCE", external_account_ref: "private-ref" }]),
      [RELATION.balances]: relation("account_balances", [{ account_id: "acc_target", currency: "USDT", free: "0.1" }]),
      [RELATION.margins]: relation("margin_balances", [{ account_id: "acc_target", currency: "USDT", maintenance: "0" }]),
      [RELATION.brokerSync]: relation("broker_account_sync_effective", [{ sync_id: "sync_target", mode: "paper", venue: "BINANCE", external_account_ref: "private-ref", currency: "USDT", buying_power: "0.1", synced_at: "2026-09-05T12:00:00.000Z" }]),
    };
    const baseline = await service(relations).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(baseline.data.differences).toEqual([expect.objectContaining({ currency: "USDT", delta: "0", in_sync: true })]);
    expect(baseline.data.exposure_headroom).toEqual([expect.objectContaining({ currency: "USDT", headroom: "0.1", verdict: "AVAILABLE" })]);
    relations[RELATION.balances] = relation("account_balances", [{ account_id: "acc_target", currency: "USDT", free: amount }]);
    const account = await service(relations).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(account.data.differences).toEqual([]);
    expect(account.capabilities).toContainEqual(expect.objectContaining({ capability_id: "resource.account.differences", state: "UNAVAILABLE" }));
    expect(account.data.exposure_headroom).toEqual([expect.objectContaining({ currency: "USDT", free: null,
      maintenance: null, headroom: null, verdict: "UNAVAILABLE" })]);
    relations[RELATION.balances] = relation("account_balances", [{ account_id: "acc_target", currency: "USDT", free: "10" }]);
    relations[RELATION.margins] = relation("margin_balances", [{ account_id: "acc_target", currency: "USDT", maintenance: amount }]);
    const missingMaintenance = await service(relations).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(missingMaintenance.data.exposure_headroom).toEqual([expect.objectContaining({ currency: "USDT", free: "10",
      maintenance: null, headroom: null, verdict: "UNAVAILABLE" })]);
  });

  it("withholds Resource comparison and headroom when exact arithmetic exceeds the 128-character bound", async () => {
    const relations: Record<string, ProjectionRelation> = {
      [RELATION.accounts]: relation("accounts", [{ account_id: "acc_target", strategy_id: "str_target", mode: "paper", venue: "BINANCE", external_account_ref: "private-ref" }]),
      [RELATION.balances]: relation("account_balances", [{ account_id: "acc_target", currency: "USDT", free: "9".repeat(128) }]),
      [RELATION.margins]: relation("margin_balances", [{ account_id: "acc_target", currency: "USDT", maintenance: "1" }]),
      [RELATION.brokerSync]: relation("broker_account_sync_effective", [{ sync_id: "sync_target", mode: "paper", venue: "BINANCE", external_account_ref: "private-ref", currency: "USDT", buying_power: "-1", synced_at: "2026-09-05T12:00:00.000Z" }]),
    };
    relations[RELATION.brokerSync] = relation("broker_account_sync_effective", [{ sync_id: "sync_target", mode: "paper", venue: "BINANCE", external_account_ref: "private-ref", currency: "USDT", buying_power: "0", synced_at: "2026-09-05T12:00:00.000Z" }]);
    let account = await service(relations).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(account.data.differences).toEqual([expect.objectContaining({ currency: "USDT", delta: "9".repeat(128) })]);
    relations[RELATION.brokerSync] = relation("broker_account_sync_effective", [{ sync_id: "sync_target", mode: "paper", venue: "BINANCE", external_account_ref: "private-ref", currency: "USDT", buying_power: "-1", synced_at: "2026-09-05T12:00:00.000Z" }]);
    account = await service(relations).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(account.data.differences).toEqual([]);
    expect(account.capabilities).toContainEqual(expect.objectContaining({ capability_id: "resource.account.differences", state: "UNAVAILABLE" }));
    relations[RELATION.balances] = relation("account_balances", [{ account_id: "acc_target", currency: "USDT", free: `-${"9".repeat(127)}` }]);
    account = await service(relations).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(account.data.exposure_headroom).toEqual([expect.objectContaining({ currency: "USDT", maintenance: "1",
      headroom: null, verdict: "UNAVAILABLE" })]);
  });

  it("does not drop an unknown maintenance amount or unknown currency when deriving account headroom", async () => {
    const relations: Record<string, ProjectionRelation> = {
      [RELATION.accounts]: relation("accounts", [{ account_id: "acc_target", strategy_id: "str_target", mode: "paper", venue: "BINANCE" }]),
      [RELATION.balances]: relation("account_balances", [{ account_id: "acc_target", currency: "USDT", free: "80" }]),
      [RELATION.margins]: relation("margin_balances", [
        { account_id: "acc_target", currency: "USDT", maintenance: "10" },
        { account_id: "acc_target", currency: "USDT", maintenance: null },
      ]),
    };
    let account = await service(relations).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(account.data.exposure_headroom).toEqual([expect.objectContaining({ currency: "USDT", free: "80", maintenance: null, headroom: null, verdict: "UNAVAILABLE" })]);
    expect(account.panels.margin_balances.reason_code).toBe("EDS04_RESOURCE_FINANCIAL_IDENTITY_CONFLICT");
    relations[RELATION.margins] = relation("margin_balances", [
      { account_id: "acc_target", currency: "USDT", maintenance: "10", updated_at: "2026-09-05T11:00:00.000Z" },
      { account_id: "acc_target", currency: "USDT", maintenance: "11", updated_at: "2026-09-05T12:00:00.000Z" },
    ]);
    account = await service(relations).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(account.data.exposure_headroom).toEqual([expect.objectContaining({ currency: "USDT", free: "80", maintenance: null, headroom: null, verdict: "UNAVAILABLE" })]);
    expect(account.panels.margin_balances.reason_code).toBe("EDS04_RESOURCE_FINANCIAL_IDENTITY_CONFLICT");
    relations[RELATION.margins] = relation("margin_balances", [
      { account_id: "acc_target", currency: "USDT", maintenance: "10" }, { account_id: "acc_target", maintenance: "3" },
    ]);
    account = await service(relations).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(account.data.exposure_headroom).toEqual([expect.objectContaining({ currency: "USDT", free: "80", maintenance: null, headroom: null, verdict: "UNAVAILABLE" })]);
    relations[RELATION.margins] = relation("margin_balances", [
      { account_id: "acc_target", currency: "USDT", maintenance: "10" },
    ], "PARTIAL");
    account = await service(relations).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(account.data.exposure_headroom).toEqual([expect.objectContaining({ currency: "USDT", free: "80", maintenance: null, headroom: null, verdict: "UNAVAILABLE" })]);
  });

  it("does not combine account headroom across separate profile environments", async () => {
    const relations: Record<string, ProjectionRelation> = {
      [RELATION.accounts]: relation("accounts", [{ account_id: "acc_target", mode: "paper" }]),
      [RELATION.balances]: relation("account_balances", [{ account_id: "acc_target", currency: "USDT", free: "80" }]),
      [RELATION.margins]: relation("margin_balances", [{ account_id: "acc_target", currency: "USDT", maintenance: "10" }]),
    };
    const paper = snapshot(relations);
    const live = structuredClone(paper);
    live.document.environment = "live";
    live.document.profile_id = "LIVE_PROFILE";
    for (const item of Object.values(live.document.relations)) for (const row of item.items) {
      row.lineage.profile_id = "LIVE_PROFILE";
      if (row.fields.mode === "paper") row.fields.mode = "live";
    }
    const repository = new FakeProjectionRepository(new Map([["paper:PAPER_PROFILE", paper], ["live:LIVE_PROFILE", live]]));
    const reader = new ResourceReadService(config(), repository as unknown as ExecutionProfileProjectionRepository);
    const account = await reader.read(principal(), "ACCOUNT", "acc_target") as Record<string, any>;
    expect(account.data.exposure_headroom.length).toBeGreaterThan(0);
    for (const row of account.data.exposure_headroom) expect(row).toMatchObject({ maintenance: null, headroom: null, verdict: "UNAVAILABLE" });
  });

  it("does not compare broker buying power across partial snapshots or tied latest records", async () => {
    const relations: Record<string, ProjectionRelation> = {
      [RELATION.accounts]: relation("accounts", [{ account_id: "acc_target", mode: "paper", venue: "BINANCE", external_account_ref: "ref-1" }]),
      [RELATION.balances]: relation("account_balances", [{ account_id: "acc_target", currency: "USDT", free: "80" }]),
      [RELATION.brokerSync]: relation("broker_account_sync_effective", [
        { sync_id: "sync-1", mode: "paper", venue: "BINANCE", external_account_ref: "ref-1", currency: "USDT", buying_power: "79", synced_at: "2026-09-05T12:00:00.000Z" },
      ]),
    };
    let account = await service(relations).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(account.data.differences).toEqual([expect.objectContaining({ currency: "USDT", delta: "1" })]);
    expect(account.capabilities).toContainEqual(expect.objectContaining({ capability_id: "resource.account.differences", state: "AVAILABLE", reason_code: null }));
    relations[RELATION.brokerSync] = relation("broker_account_sync_effective", [
      { sync_id: "sync-1", mode: "paper", venue: "BINANCE", external_account_ref: "ref-1", currency: "USDT", buying_power: "79", synced_at: "2026-09-05T12:00:00.000Z" },
      { sync_id: "sync-2", mode: "paper", venue: "BINANCE", external_account_ref: "ref-1", currency: "USDT", buying_power: "78", synced_at: "2026-09-05T12:00:00.000Z" },
    ]);
    account = await service(relations).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(account.data.differences).toEqual([]);
    expect(account.capabilities).toContainEqual(expect.objectContaining({ capability_id: "resource.account.differences", state: "UNAVAILABLE", reason_code: "ACCOUNT_COMPARISON_INCOMPLETE" }));
    relations[RELATION.brokerSync] = relation("broker_account_sync_effective", [
      { sync_id: "sync-1", mode: "paper", venue: "BINANCE", external_account_ref: "ref-1", currency: "USDT", buying_power: "79", synced_at: "2026-09-05T12:00:00.000Z" },
      { sync_id: "sync-1", mode: "paper", venue: "BINANCE", external_account_ref: "ref-1", currency: "USDT", buying_power: "78", synced_at: "2026-09-05T12:00:00.000Z" },
    ]);
    account = await service(relations).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(account.data.differences).toEqual([]);
    expect(account.panels.broker_sync.reason_code).toBe("EDS04_RESOURCE_FINANCIAL_IDENTITY_CONFLICT");
    relations[RELATION.brokerSync] = relation("broker_account_sync_effective", [
      { sync_id: "sync-1", mode: "paper", venue: "BINANCE", external_account_ref: "ref-1", currency: "USDT", buying_power: "79", synced_at: "2026-09-05T12:00:00.000Z" },
    ], "PARTIAL");
    account = await service(relations).read(principal(), "ACCOUNT", "acc_target", "paper") as Record<string, any>;
    expect(account.data.differences).toEqual([]);
  });

  it("does not publish a binding sync label from partial or conflicting broker observations", async () => {
    const rows: Row[] = [{ sync_id: "sync-1", external_account_ref: "ref-1", mode: "paper", venue: "BINANCE",
      status: "SYNCED", currency: "USDT", synced_at: "2026-09-05T12:00:00.000Z" }];
    const relations: Record<string, ProjectionRelation> = {
      [RELATION.accounts]: relation("accounts", [{ account_id: "acc_target", mode: "paper", venue: "BINANCE", external_account_ref: "ref-1" }]),
      [RELATION.venueAccounts]: relation("venue_accounts", [{ venue_account_id: "va_target", binding_id: "acc_target@BINANCE", account_id: "acc_target", mode: "paper", venue: "BINANCE" }]),
      [RELATION.brokerSync]: relation("broker_account_sync_effective", rows),
    };
    let binding = await service(relations).read(principal(), "BINDING", "va_target", "paper") as Record<string, any>;
    expect(binding.data.binding.credential_state).toBe("SYNC_SYNCED");
    relations[RELATION.brokerSync] = relation("broker_account_sync_effective", rows, "PARTIAL");
    binding = await service(relations).read(principal(), "BINDING", "va_target", "paper") as Record<string, any>;
    expect(binding.data.binding.credential_state).toBe("NOT_PUBLISHED");
    relations[RELATION.brokerSync] = relation("broker_account_sync_effective", [rows[0], { ...rows[0], sync_id: "sync-2", status: "FAILED" }]);
    binding = await service(relations).read(principal(), "BINDING", "va_target", "paper") as Record<string, any>;
    expect(binding.data.binding.credential_state).toBe("NOT_PUBLISHED");
  });

  it("keeps a resolved resource within the 200-row and 1 MiB browser bounds without minting a cursor", async () => {
    // Includes UTF-8 multibyte + JSON escaping: the byte bound is not a
    // character count or an estimate of just one duplicated data branch.
    const longInstrument = "BTCUSDT_" + '漢字😀"\\\n'.repeat(1200);
    const positions: Row[] = Array.from({ length: 200 }, (_, index) => ({
      position_id: `pos_${index.toString().padStart(3, "0")}`,
      deployment_id: "dep_target", strategy_id: "str_target", account_id: "acc_target",
      mode: "paper", venue: "BINANCE", instrument_id: longInstrument,
      notional: String(index + 1), updated_at: "2026-09-05T12:00:00.000Z",
    }));
    const value = await service({
      [RELATION.strategies]: relation("strategies", [{ strategy_id: "str_target", alpha_id: "alpha_target", label: "Target", mode: "paper", updated_at: "2026-09-05T12:00:00.000Z" }]),
      [RELATION.deployments]: relation("strategy_deployments", [{ deployment_id: "dep_target", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE", currency: "USDT", active: true, state: "ACTIVE", updated_at: "2026-09-05T12:00:00.000Z" }]),
      [RELATION.accounts]: relation("accounts", [{ account_id: "acc_target", mode: "paper", venue: "BINANCE", base_currency: "USDT", updated_at: "2026-09-05T12:00:00.000Z" }]),
      [RELATION.positions]: relation("positions_v2", positions),
    }).read(principal(), "ALPHA", "alpha_target", "paper") as Record<string, any>;

    expect(value.panels.positions.reason_code).toBe("EDS04_RESOURCE_RESPONSE_BYTE_BOUND");
    expect(value.panels.positions.coverage).toMatchObject({ truncated: true, has_more: true, next_cursor: null, source_total: "200" });
    expect(value.data.positions.length).toBeLessThan(200);
    expect(Buffer.byteLength(JSON.stringify(value), "utf8")).toBeLessThanOrEqual(1024 * 1024);
  });
});

describe("Account360 native controller ownership (synthetic port, no actual custody)", () => {
  function nativeController() {
    const read = vi.fn(), canReadExecution = vi.fn(async () => true);
    const readNativeAccount = vi.fn(async (..._args: unknown[]) => {});
    const controller = new ResourceReadController({ read, readNativeAccount, hasNativeCurrentAccount: () => true } as unknown as ResourceReadService,
      { canReadExecution } as never, config());
    const request = { portalUser: user, portalWorkspaceId: "personal-workspace", portalViewerWorkspaceId: "viewer-workspace",
      portalSession: session } as never;
    const raw = { headersSent: false, writableEnded: false, destroyed: false, destroy: vi.fn() };
    const reply = { raw, sent: false, hijack: vi.fn() };
    return { controller, read, readNativeAccount, canReadExecution, request, raw, reply };
  }
  it("does not hijack before the actual native beforeDispatch callback and never returns a DTO", async () => {
    const f = nativeController();
    f.readNativeAccount.mockImplementation(async (...args) => {
      expect(f.reply.hijack).not.toHaveBeenCalled();
      expect(args.slice(0, 4)).toEqual([{ user, session, workspaceId, viewerWorkspaceId: "viewer-workspace" },
        "actual-account", "paper", f.raw]);
      (args[4] as () => void)(); (args[4] as () => void)();
    });
    await expect(f.controller.account(f.request, "actual-account", { environment: "paper" }, f.reply as never)).resolves.toBeUndefined();
    expect(f.reply.hijack).toHaveBeenCalledTimes(1); expect(f.raw.destroy).not.toHaveBeenCalled(); expect(f.read).not.toHaveBeenCalled();
  });
  it("preserves ordinary typed errors before physical response ownership", async () => {
    const f = nativeController(), error = Object.assign(new Error("TEST_ONLY_REVOKED"), { code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
    f.readNativeAccount.mockRejectedValue(error);
    await expect(f.controller.account(f.request, "actual-account", {}, f.reply as never)).rejects.toBe(error);
    expect(f.reply.hijack).not.toHaveBeenCalled(); expect(f.raw.destroy).not.toHaveBeenCalled(); expect(f.read).not.toHaveBeenCalled();
  });
  it("destroys after native ownership/ACK failure without a second framework response", async () => {
    const f = nativeController();
    f.readNativeAccount.mockImplementation(async (...args) => { (args[4] as () => void)(); throw new Error("TEST_ONLY_ACK_UNKNOWN"); });
    await expect(f.controller.account(f.request, "actual-account", {}, f.reply as never)).resolves.toBeUndefined();
    expect(f.reply.hijack).toHaveBeenCalledTimes(1); expect(f.raw.destroy).toHaveBeenCalledTimes(1); expect(f.read).not.toHaveBeenCalled();
  });
  it.each(["headersSent", "writableEnded", "destroyed"] as const)("refuses competing response ownership (%s)", async flag => {
    const f = nativeController(); f.raw[flag] = true;
    f.readNativeAccount.mockImplementation(async (...args) => { (args[4] as () => void)(); });
    const call = f.controller.account(f.request, "actual-account", {}, f.reply as never);
    if (flag === "writableEnded") await expect(call).rejects.toMatchObject({ code: "EXECUTION_READ_AUTHORITY_UNAVAILABLE", status: 503 });
    else await expect(call).resolves.toBeUndefined();
    expect(f.reply.hijack).not.toHaveBeenCalled(); expect(f.read).not.toHaveBeenCalled();
  });
  it("requires an actual response rather than silently falling back to an ordinary DTO", async () => {
    const f = nativeController();
    await expect(f.controller.account(f.request, "actual-account", {}))
      .rejects.toMatchObject({ code: "EXECUTION_READ_AUTHORITY_UNAVAILABLE", status: 503 });
    expect(f.readNativeAccount).not.toHaveBeenCalled(); expect(f.read).not.toHaveBeenCalled();
  });
  it("checks workspace membership before entering native response ownership", async () => {
    const f = nativeController(); f.canReadExecution.mockResolvedValue(false);
    await expect(f.controller.account(f.request, "actual-account", {}, f.reply as never))
      .rejects.toMatchObject({ code: "WORKSPACE_NOT_FOUND", status: 404 });
    expect(f.readNativeAccount).not.toHaveBeenCalled(); expect(f.reply.hijack).not.toHaveBeenCalled();
  });
});

describe("Portfolio 360 over a profile that holds the portfolio row but no deployment for it (stable v1.5 acceptance)", () => {
  const pf = [{ portfolio_id: "pf_target", name: "Target", base_currency: "USDT", state: "ACTIVE" }];
  const dep = { deployment_id: "dep_target", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "OKX", portfolio_id: "pf_target", active: true };

  it("links the deployment by its own portfolio id when the allocations relation is available but empty", async () => {
    const value = await service({
      [RELATION.portfolios]: relation("portfolios", pf),
      [RELATION.allocations]: relation("portfolio_allocations", []),
      [RELATION.deployments]: relation("strategy_deployments", [dep]),
    }).read(principal(), "PORTFOLIO", "pf_target", "paper") as Record<string, any>;
    expect(value.data.deployments).toHaveLength(1);
    expect(value.data.deployments[0].deployment_id).toBe("dep_target");
    expect(JSON.stringify(value.unavailable_branches)).toContain("EDS04_PORTFOLIO_ALLOCATIONS_EMPTY_DIRECT_DEPLOYMENT_FALLBACK");
  });

  it("states 'no deployment in this profile' instead of 'portfolio not found' when the profile holds the portfolio but no deployment", async () => {
    const value = await service({
      [RELATION.portfolios]: relation("portfolios", pf),
      [RELATION.allocations]: relation("portfolio_allocations", []),
      [RELATION.deployments]: relation("strategy_deployments", []),
    }).read(principal(), "PORTFOLIO", "pf_target", "paper") as Record<string, any>;
    expect(value.data.deployments).toEqual([]);
    const codes = value.unavailable_branches.map((branch: { reason_code?: string }) => branch.reason_code);
    expect(codes).toContain("EDS04_PORTFOLIO_NO_DEPLOYMENT_IN_PROFILE");
    expect(codes).not.toContain("EDS04_PORTFOLIO_NOT_FOUND");
  });

  it("does not print a sibling profile's NOT_FOUND over the profile that found the portfolio", async () => {
    const paper = snapshot({
      [RELATION.portfolios]: relation("portfolios", pf),
      [RELATION.allocations]: relation("portfolio_allocations", []),
      [RELATION.deployments]: relation("strategy_deployments", []),
    });
    const sandbox: ProfileProjectionSnapshot = { ...snapshot({ [RELATION.portfolios]: relation("portfolios", []) }),
      document: { ...snapshot({ [RELATION.portfolios]: relation("portfolios", []) }).document, environment: "sandbox", profile_id: "SANDBOX_PROFILE" } };
    const repository = new FakeProjectionRepository(new Map([["paper:PAPER_PROFILE", paper], ["sandbox:SANDBOX_PROFILE", sandbox]]));
    const reader = new ResourceReadService(config(), repository as unknown as ExecutionProfileProjectionRepository);
    const value = await reader.read(principal(), "PORTFOLIO", "pf_target") as Record<string, any>;
    const relationReasons = value.capabilities
      .filter((capability: { capability_id: string }) => capability.capability_id.startsWith("resource.portfolio."))
      .map((capability: { reason_code: string | null }) => capability.reason_code);
    expect(relationReasons).not.toContain("EDS04_PORTFOLIO_NOT_FOUND");
    expect(relationReasons).toContain("EDS04_PORTFOLIO_NO_DEPLOYMENT_IN_PROFILE");
  });
});

describe("Portfolio 360 per-request Paper profile (profile_id)", () => {
  const okx = { ...config(), EXECUTION_EDGE_PAPER_PROFILE_ID: "PAPER_BINANCE_USDM" } as ControlApiConfig;
  const pf = [{ portfolio_id: "pf_target", name: "Target", base_currency: "USDT", state: "ACTIVE" }];
  const dep = { deployment_id: "dep_okx", strategy_id: "str_okx", account_id: "acc_okx", mode: "paper", venue: "OKX", portfolio_id: "pf_target", active: true };
  const doc = (profileId: string, rows: Record<string, ProjectionRelation>): ProfileProjectionSnapshot => {
    const base = snapshot(rows);
    return { ...base, document: { ...base.document, profile_id: profileId } };
  };
  const repo = () => new FakeProjectionRepository(new Map([
    ["paper:PAPER_BINANCE_USDM", doc("PAPER_BINANCE_USDM", { [RELATION.portfolios]: relation("portfolios", pf), [RELATION.deployments]: relation("strategy_deployments", []) })],
    ["paper:PAPER_OKX_SWAP", doc("PAPER_OKX_SWAP", { [RELATION.portfolios]: relation("portfolios", pf), [RELATION.deployments]: relation("strategy_deployments", [dep]) })],
  ]));

  it("reads the default profile without a selection and the selected profile's own deployments with one", async () => {
    const reader = new ResourceReadService(okx, repo() as unknown as ExecutionProfileProjectionRepository);
    const byDefault = await reader.read(principal(), "PORTFOLIO", "pf_target", "paper") as Record<string, any>;
    expect(byDefault.data.deployments).toEqual([]);
    expect(byDefault.data.profile_coverage.paper.profile_id).toBe("PAPER_BINANCE_USDM");
    const selected = await reader.read({ ...principal(), paperProfileId: "PAPER_OKX_SWAP" }, "PORTFOLIO", "pf_target", "paper") as Record<string, any>;
    expect(selected.data.deployments).toHaveLength(1);
    expect(selected.data.deployments[0].deployment_id).toBe("dep_okx");
    expect(selected.data.profile_coverage.paper.profile_id).toBe("PAPER_OKX_SWAP");
  });
});

describe("resource controller profile_id allow-list", () => {
  it("refuses a profile off the allow-list with a typed 400 and never reads the default", async () => {
    const read = vi.fn();
    const controller = new ResourceReadController({ read } as unknown as ResourceReadService,
      { canReadExecution: vi.fn(async () => true) } as never, config());
    const request = { portalUser: user, portalWorkspaceId: workspaceId, portalSession: session } as never;
    await expect(controller.portfolio(request, "pf_target", { profile_id: "PAPER_OKX_SWAP" }))
      .rejects.toMatchObject({ code: "PAPER_PROFILE_NOT_ALLOWED", status: 400 });
    await expect(controller.alpha(request, "alpha_target", { profile_id: "PAPER_OKX_SWAP" }))
      .rejects.toMatchObject({ code: "EDS04_RESOURCE_QUERY_INVALID", status: 400 });
    expect(read).not.toHaveBeenCalled();
  });
});

describe("resource controller profile_id for an Account 360", () => {
  it("takes profile_id on the account route: off the allow-list it is a typed 400 (not the generic query refusal), and the reader is never reached", async () => {
    const read = vi.fn(async () => ({ ok: true }));
    const controller = new ResourceReadController({ read } as unknown as ResourceReadService,
      { canReadExecution: vi.fn(async () => true) } as never, config());
    const request = { portalUser: user, portalWorkspaceId: workspaceId, portalSession: session } as never;
    await expect(controller.account(request, "acct_1", { profile_id: "PAPER_OKX_SWAP" }))
      .rejects.toMatchObject({ code: "PAPER_PROFILE_NOT_ALLOWED", status: 400 });
    expect(read).not.toHaveBeenCalled();
  });
});
