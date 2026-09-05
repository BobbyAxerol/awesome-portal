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
  it("pins a named resource read to the configured projection workspace before it can read data", async () => {
    const read = vi.fn();
    const controller = new ResourceReadController(
      { read } as unknown as ResourceReadService,
      { isMember: vi.fn(async () => true) } as never,
      config(),
    );
    const request = { portalUser: user, portalWorkspaceId: "ws_other", portalSession: session } as never;

    await expect(controller.alpha(request, "alpha_target", {})).rejects.toMatchObject({
      code: "EDS04_PROJECTION_WORKSPACE_NOT_FOUND",
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
    const longInstrument = "BTCUSDT_".padEnd(12_000, "x");
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
