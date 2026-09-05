import { describe, expect, it, vi } from "vitest";
import { ControlApiConfig } from "../src/config";
import { AuthSession, PortalUser } from "../src/domain";
import { OperationalCompositionService } from "../src/execution/operational-composition.service";
import {
  PortalDerivationError,
  PortalDerivationsService,
} from "../src/execution/portal-derivations.service";
import { PortalDerivationsController } from "../src/execution/portal-derivations.controller";
import {
  ExecutionProfileProjectionRepository,
  ProfileProjectionDocument,
  ProfileProjectionSnapshot,
  ProjectionRelation,
  ProjectionScalar,
} from "../src/execution/profile-projection.repository";
import { testConfig } from "./harness";

type Row = Record<string, ProjectionScalar>;

const workspaceId = "ws_eds05";
const paperProfile = "PAPER_PROFILE";
const user: PortalUser = {
  userId: "usr_bobby", username: "bobby", displayName: "Bobby", role: "ADMIN", status: "ACTIVE",
  mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, sessionVersion: 1,
  createdAt: new Date("2026-09-05T00:00:00.000Z"), updatedAt: new Date("2026-09-05T00:00:00.000Z"), disabledAt: null,
};
const session: AuthSession = {
  sessionId: "ses_eds05", userId: user.userId, state: "ACTIVE", sessionVersion: 1,
  authenticationTime: new Date("2026-09-05T00:00:00.000Z"),
  idleExpiresAt: new Date("2026-09-06T00:00:00.000Z"), absoluteExpiresAt: new Date("2026-09-06T08:00:00.000Z"),
};

const RELATION = {
  strategies: "manager.strategies:strategies",
  deployments: "manager.deployments:strategy_deployments",
  accounts: "manager.accounts:accounts",
  balances: "manager.accounts:account_balances",
  portfolios: "manager.portfolios:portfolios",
  allocations: "manager.portfolios:portfolio_allocations",
  sessions: "manager.sessions:execution_sessions",
  orders: "manager.orders:orders",
  fills: "manager.fills:fills",
  groups: "manager.conditional-orders:conditional_order_groups",
  legs: "manager.conditional-orders:conditional_order_group_legs",
  journal: "manager.command-journal:command_journal",
} as const;

class FakeProjectionRepository {
  reads = 0;
  constructor(private readonly snapshots: ReadonlyMap<string, ProfileProjectionSnapshot>) {}
  async snapshot(_workspace: string, environment: "paper" | "sandbox" | "live", profileId: string) {
    this.reads += 1;
    return this.snapshots.get(`${environment}:${profileId}`) ?? null;
  }
}

function config(): ControlApiConfig {
  return {
    ...testConfig(),
    FEATURE_EXECUTION_LOCAL_PROJECTION: "true",
    EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: workspaceId,
    EXECUTION_EDGE_PAPER_PROFILE_ID: paperProfile,
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
      lineage: { workspace_id: workspaceId, profile_id: paperProfile, source_contract_revision: "manager-v2.current.v1" },
      fields,
    })),
  };
}

function snapshot(relations: Record<string, ProjectionRelation>): ProfileProjectionSnapshot {
  const now = new Date();
  const document: ProfileProjectionDocument = {
    schema_version: "portal.execution.profile-projection.v1", workspace_id: workspaceId, environment: "paper",
    profile_id: paperProfile, source_contract_revision: "manager-v2.current.v1", relations,
  };
  return {
    document, sourceEpoch: "epoch-eds05", sourceCursor: "opaque-source-cursor-must-not-leak",
    sourceAsOf: new Date("2026-09-05T12:00:00.000Z"), receivedAt: now, lastSuccessfulRefreshAt: now,
    completeness: "COMPLETE", projectionEpoch: "projection-eds05", projectionSequence: 17,
    payloadDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  };
}

function service(relations: Record<string, ProjectionRelation>) {
  const repository = new FakeProjectionRepository(new Map([[`paper:${paperProfile}`, snapshot(relations)]]));
  return {
    repository,
    service: new PortalDerivationsService(config(), repository as unknown as ExecutionProfileProjectionRepository),
  };
}

function principal() { return { user, session, workspaceId }; }

describe("EDS-05 Portal derivations and operational composition", () => {
  it("derives exact deployment counters with an explicit rational denominator and never leaks a source cursor", async () => {
    const { service: derivations } = service({
      [RELATION.deployments]: relation("strategy_deployments", [{
        deployment_id: "dep_target", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE",
      }]),
      [RELATION.sessions]: relation("execution_sessions", [{
        strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE",
        submitted_count: "11", risk_rejected_count: "2", broker_rejected_count: "1", filled_count: "7",
      }]),
      [RELATION.orders]: relation("orders", [{ order_id: "ord_target", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE" }]),
      [RELATION.fills]: relation("fills", [{ fill_id: "fill_target", strategy_id: "str_target", account_id: "acc_target", mode: "paper", venue: "BINANCE" }]),
    });

    const value = await derivations.deploymentQuality(principal(), "dep_target", "paper") as Record<string, any>;
    expect(value).toMatchObject({
      schema_version: "execution.derivation.deployment-quality.v1",
      state: "AVAILABLE",
      data: { submitted_count: "11", rejected_count: "3", reject_rate: { numerator: "3", denominator: "11" } },
    });
    const serialized = JSON.stringify(value);
    expect(serialized).not.toContain("opaque-source-cursor-must-not-leak");
    expect(serialized).not.toContain("source_epoch");
  });

  it("keeps a conditional group exact, emits only its declared legs, and propagates incomplete inputs", async () => {
    const { service: derivations } = service({
      [RELATION.groups]: relation("conditional_order_groups", [{ group_id: "grp_target", strategy_id: "str_target", state: "ACTIVE" }]),
      [RELATION.legs]: relation("conditional_order_group_legs", [
        { group_id: "grp_target", leg_id: "leg_2", sequence: "2", secret: "must-not-leak" },
        { group_id: "grp_target", leg_id: "leg_1", sequence: "1" },
        { group_id: "grp_foreign", leg_id: "leg_foreign", sequence: "1" },
      ], "PARTIAL"),
    });
    const value = await derivations.conditionalLegs(principal(), "grp_target", "paper") as Record<string, any>;
    expect(value.state).toBe("PARTIAL");
    expect(value.data.legs.map((row: { leg_id: string }) => row.leg_id)).toEqual(["leg_1", "leg_2"]);
    expect(JSON.stringify(value)).not.toContain("leg_foreign");
    // The source field is intentionally tested here: the derived DTO must
    // redact unlisted relation fields rather than returning raw projection rows.
    expect(JSON.stringify(value)).not.toContain("must-not-leak");
  });

  it("partitions portfolio amounts by exact currency and leaves unpublished ledger/reservations typed partial", async () => {
    const { service: derivations } = service({
      [RELATION.portfolios]: relation("portfolios", [{ portfolio_id: "pf_target", name: "Target" }]),
      [RELATION.allocations]: relation("portfolio_allocations", [
        { portfolio_id: "pf_target", account_id: "acc_a", currency: "USDT", allocated_capital: "10.25", max_capital: "100" },
        { portfolio_id: "pf_target", account_id: "acc_b", currency: "USDT", allocated_capital: "2.75", max_capital: "50" },
        { portfolio_id: "pf_target", account_id: "acc_b", currency: "USDC", allocated_capital: "3", max_capital: "30" },
      ]),
      [RELATION.balances]: relation("account_balances", [
        { account_id: "acc_a", currency: "USDT", total: "20", free: "12", locked: "8" },
        { account_id: "acc_b", currency: "USDC", total: "7", free: "7", locked: "0" },
      ]),
    });
    const value = await derivations.portfolioCapital(principal(), "pf_target", "paper") as Record<string, any>;
    expect(value).toMatchObject({ state: "PARTIAL", reason_code: "EDS05_PORTFOLIO_CAPITAL_LEDGER_NOT_PUBLISHED" });
    expect(value.data.allocation_by_currency).toEqual([
      { currency: "USDC", population: "1", allocated_capital: "3", max_capital: "30" },
      { currency: "USDT", population: "2", allocated_capital: "13", max_capital: "150" },
    ]);
    expect(value.data.account_balance_by_currency).toEqual([
      { currency: "USDC", population: "1", total: "7", free: "7", locked: "0" },
      { currency: "USDT", population: "1", total: "20", free: "12", locked: "8" },
    ]);
    expect(value.data.currency_policy).toBe("EXACT_PARTITION_BY_SOURCE_CURRENCY_NO_FX_AGGREGATE");
  });

  it("resolves alpha activity only through the declared strategy identity and does not infer replay history", async () => {
    const { service: derivations } = service({
      [RELATION.strategies]: relation("strategies", [{ strategy_id: "str_target", alpha_id: "alpha_target" }]),
      [RELATION.deployments]: relation("strategy_deployments", [
        { deployment_id: "dep_target", strategy_id: "str_target", state: "ACTIVE" },
        { deployment_id: "dep_foreign", strategy_id: "str_foreign", state: "ACTIVE" },
      ]),
      [RELATION.sessions]: relation("execution_sessions", [{ session_id: "ses_target", strategy_id: "str_target", state: "RUNNING" }]),
      [RELATION.orders]: relation("orders", [{ order_id: "ord_target", strategy_id: "str_target", status: "NEW" }]),
      [RELATION.fills]: relation("fills", [{ fill_id: "fill_target", strategy_id: "str_target" }]),
    });
    const value = await derivations.alphaActivity(principal(), "alpha_target", "paper") as Record<string, any>;
    expect(value.data).toMatchObject({
      strategy_id: "str_target", deployment_population: "1", session_population: "1", order_population: "1", fill_population: "1",
      retained_input_range_not_event_replay: true,
    });
    expect(JSON.stringify(value)).not.toContain("dep_foreign");
  });

  it("pins derivation requests to the configured local-projection workspace before reading", async () => {
    const sourceHealth = vi.fn();
    const controller = new PortalDerivationsController(
      { sourceHealth } as unknown as PortalDerivationsService,
      { isMember: vi.fn(async () => true) } as never,
      config(),
    );
    const request = { portalUser: user, portalWorkspaceId: "ws_other", portalSession: session } as never;
    await expect(controller.sourceHealth(request, {})).rejects.toMatchObject({
      code: "EDS05_PROJECTION_WORKSPACE_NOT_FOUND", status: 404,
    } satisfies Partial<PortalDerivationError>);
    expect(sourceHealth).not.toHaveBeenCalled();
  });

  it("composes Portal workflow state with redacted accepted journal rows without changing command authority", async () => {
    const relations = {
      [RELATION.journal]: relation("command_journal", [{
        command_id: "cmd_1", command_key: "ops/read", state: "BLOCKED", payload: "never-leak", client_order_id: "also-never-leak",
      }]),
    };
    const { service: derivations, repository } = service(relations);
    const compose = new OperationalCompositionService(
      config(), derivations, repository as unknown as ExecutionProfileProjectionRepository,
      { detail: vi.fn(), r2Detail: vi.fn() } as never,
      { detail: vi.fn() } as never,
      { list: vi.fn() } as never,
      { detail: vi.fn() } as never,
      { snapshot: vi.fn() } as never,
      { taskCatalogue: vi.fn(() => ({ entries: [] })) } as never,
    );
    const value = await compose.adminActionDrawer(principal()) as Record<string, any>;
    expect(value).toMatchObject({
      schema_version: "execution.operational-composition.v1",
      command_authority: { state: "UNCHANGED_FAIL_CLOSED", source_side_effect_requested: false },
      canary_twin_comparison: { reason_code: "E5_CANARY_TWIN_COMPARISON_NOT_QUALIFIED" },
    });
    expect(value.redacted_command_journal.rows).toEqual([expect.objectContaining({ command_id: "cmd_1", command_key: "ops/read", state: "BLOCKED" })]);
    const serialized = JSON.stringify(value);
    expect(serialized).not.toContain("never-leak");
    expect(serialized).not.toContain("client_order_id");
    expect(repository.reads).toBeGreaterThan(0);
  });
});
