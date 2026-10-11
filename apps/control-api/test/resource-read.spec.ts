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

type Row = Record<string, ProjectionScalar>;

const workspaceId = "ws_eds04";
const user: PortalUser = {
  userId: "usr_bobby", username: "bobby", displayName: "Bobby", role: "ADMIN", status: "ACTIVE",
  mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, sessionVersion: 1,
  createdAt: new Date("2026-09-05T00:00:00Z"), updatedAt: new Date("2026-09-05T00:00:00Z"), disabledAt: null,
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
    payloadDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  };
}

function service(relations: Record<string, ProjectionRelation>) {
  const repository = new FakeProjectionRepository(new Map([["paper:PAPER_PROFILE", snapshot(relations)]]));
  return new ResourceReadService(config(), repository as unknown as ExecutionProfileProjectionRepository);
}

function principal() { return { user, session, workspaceId }; }

describe("EDS-04 named resource BFFs", () => {
  it("reuses only bounded DATA after a fresh snapshot load, never actor/clocks or an outage fallback", async () => {
    const fact = snapshot({ [RELATION.portfolios]: relation("portfolios", [{ portfolio_id: "pf_target", name: "Target" }]) });
    const repo = new ExecutionProfileProjectionRepository({ query: vi.fn() } as any, undefined,
      { EXECUTION_READ_PROFILE: "retained_review_v1" });
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
    expect(account.data.differences).toEqual([expect.objectContaining({ currency: "USDT", delta: "1", in_sync: false })]);
    expect(JSON.stringify(account)).not.toContain("private-ref");

    const binding = await service(relations).read(principal(), "BINDING", "acc_target@BINANCE", "paper") as Record<string, any>;
    expect(binding.data.binding).toMatchObject({ binding_id: "acc_target@BINANCE", account_id: "acc_target", venue: "BINANCE", credential_state: "SYNC_SYNCED" });
    expect(JSON.stringify(binding)).not.toContain("private-ref");
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
