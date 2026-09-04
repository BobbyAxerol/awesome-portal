import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { testConfig, migrateTestDatabase, truncateAll } from "./harness";
import { AuthSession, PortalUser } from "../src/domain";
import {
  CurrentSourceProxyError,
  ExecutionCurrentSourceProxy,
} from "../src/execution/current-source.proxy";
import { MaximumDataContinuationRepository } from "../src/execution/maximum-data-continuation.repository";
import { MaximumDataOperationPrincipal, MaximumDataOperationService } from "../src/execution/maximum-data-operation.service";
import { MaximumDataOperationController } from "../src/execution/maximum-data-operation.controller";
import { MAXIMUM_DATA_DEPLOYMENT_OPERATION } from "../src/execution/maximum-data-operation.registry";

const DATABASE_URL = process.env.TEST_DATABASE_URL ??
  "postgres://portal:portal@127.0.0.1:5432/portal_control_test";

const user: PortalUser = {
  userId: "usr_eds01", username: "eds01", displayName: "EDS-01", role: "ADMIN", status: "ACTIVE",
  mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, sessionVersion: 1,
  createdAt: new Date("2026-09-04T00:00:00.000Z"), updatedAt: new Date("2026-09-04T00:00:00.000Z"), disabledAt: null,
};

const session: AuthSession = {
    sessionId: "ses_eds01",
    userId: "usr_eds01",
    state: "ACTIVE",
    sessionVersion: 1,
    authenticationTime: new Date("2026-09-04T00:00:00.000Z"),
    idleExpiresAt: new Date("2026-09-04T01:00:00.000Z"),
    absoluteExpiresAt: new Date("2026-09-04T08:00:00.000Z"),
};

const principal: MaximumDataOperationPrincipal = {
  user,
  session,
  workspaceId: "ws_eds01",
};

type Environment = "paper" | "sandbox" | "live";

class FakeCurrentSource {
  calls: Array<Record<string, unknown>> = [];
  response: unknown = sourceEnvelope("paper");
  failure: Error | null = null;

  async relationForNamedOperation(
    _principal: unknown,
    environment: Environment,
    screenId: string,
    sourceId: string,
    relation: string,
    query: Record<string, unknown>,
    policy: Record<string, unknown>,
  ): Promise<unknown> {
    this.calls.push({ environment, screenId, sourceId, relation, query, policy });
    if (this.failure) throw this.failure;
    return this.response;
  }
}

function profile(environment: Environment): string {
  return environment === "paper" ? "PAPER_BINANCE_USDM"
    : environment === "sandbox" ? "SANDBOX_BINANCE_USDM"
      : "LIVE_BINANCE_USDM";
}

function screen(environment: Environment): string {
  return environment === "paper" ? "PAPER_TRADING_SCREEN"
    : environment === "sandbox" ? "SANDBOX_TRADING_SCREEN"
      : "LIVE_OPERATIONS_SCREEN";
}

function row(id = "dep-001") {
  return {
    relation: { schema: "public", relation: "strategy_deployments" },
    record_key: `source-private-${id}`,
    fields: {
      deployment_id: { kind: "TEXT", value: id },
      strategy_id: { kind: "TEXT", value: "strategy-001" },
      account_id: { kind: "TEXT", value: "account-001" },
      portfolio_id: { kind: "TEXT", value: "portfolio-001" },
      mode: { kind: "TEXT", value: "PAPER" },
      venue: { kind: "TEXT", value: "BINANCE_USDM" },
      currency: { kind: "TEXT", value: "USDT" },
      state: { kind: "TEXT", value: "RUNNING" },
      active: { kind: "BOOLEAN", value: true },
      created_at: { kind: "TIMESTAMP", value: "2026-09-04T00:00:00.000Z" },
      updated_at: { kind: "TIMESTAMP", value: "2026-09-04T00:01:00.000Z" },
      secret_column: { kind: "TEXT", value: "must-not-cross" },
    },
  };
}

function sourceEnvelope(
  environment: Environment,
  options: {
    items?: unknown[];
    nextCursor?: string | null;
    freshness?: string;
    completeness?: string;
    relation?: { schema: string; relation: string };
    profileId?: string;
    catalogueSha256?: string;
  } = {},
) {
  const expectedProfile = profile(environment);
  return {
    schema_version: "portal.execution.current-source-bff.v2",
    authority: "PORTAL_CONTROL_API",
    requested_environment: environment,
    source_environment: environment,
    profile_id: options.profileId ?? expectedProfile,
    source: {
      contract_version: "trading-system.portal-execution.manager-v2.runtime.v1",
      authority: "EXECUTION_CELL",
      profile_id: options.profileId ?? expectedProfile,
      catalogue_sha256: options.catalogueSha256 ?? MAXIMUM_DATA_DEPLOYMENT_OPERATION.sourceCatalogueSha256,
      availability: "AVAILABLE",
      freshness: options.freshness ?? "FRESH",
      completeness: options.completeness ?? "COMPLETE",
      trace_id: "source-trace-private",
      as_of: "2026-09-04T00:02:00.000Z",
      data: {
        relation: options.relation ?? { schema: "public", relation: "strategy_deployments" },
        items: options.items ?? [row()],
        next_cursor: options.nextCursor ?? null,
      },
    },
  };
}

describe("EDS-01 sealed Manager-v2 deployment operation", () => {
  let pool: Pool;
  let source: FakeCurrentSource;
  let service: MaximumDataOperationService;

  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL);
    pool = new Pool({ connectionString: DATABASE_URL });
  });

  beforeEach(async () => {
    await truncateAll(pool);
    await pool.query(
      `INSERT INTO portal_users
         (user_id,username,display_name,role,status,must_change_password)
       VALUES ('usr_eds01','eds01','EDS-01','ADMIN','ACTIVE',false)`,
    );
    await pool.query(
      "INSERT INTO workspaces (workspace_id,name,owner_user_id) VALUES ('ws_eds01','EDS-01','usr_eds01')",
    );
    source = new FakeCurrentSource();
    service = new MaximumDataOperationService(
      source as unknown as ExecutionCurrentSourceProxy,
      new MaximumDataContinuationRepository(pool, testConfig()),
    );
  });

  afterAll(async () => pool.end());

  it("maps the fixed E5 deployment page for Paper, Sandbox and Live without raw source leakage", async () => {
    for (const environment of ["paper", "sandbox", "live"] as const) {
      source.response = sourceEnvelope(environment, {
        items: environment === "live" ? [] : [row(`dep-${environment}`)],
        completeness: environment === "sandbox" ? "PARTIAL" : "COMPLETE",
      });
      const result = await service.deploymentPage(principal, { environment, limit: 100 });
      expect(result).toMatchObject({
        schema_version: "portal.execution.maximum-data.deployment-page.v1",
        logical_operation_id: "maximumDataDeploymentPageV1",
        field_id: "deployment_current",
        environment,
        profile_id: profile(environment),
        source_health: {
          availability: "AVAILABLE",
          as_of_ms: Date.parse("2026-09-04T00:02:00.000Z"),
          global_sequence: null,
          retention_floor_ms: null,
          replay_eligible: false,
        },
      });
      expect(result.state).toBe(environment === "live" ? "EMPTY" : environment === "sandbox" ? "PARTIAL" : "POPULATED");
      const serialized = JSON.stringify(result);
      for (const forbidden of ["source-private", "source-trace-private", "secret_column", "must-not-cross"]) {
        expect(serialized).not.toContain(forbidden);
      }
      if (environment !== "live") {
        expect(result.records[0]).toMatchObject({
          deployment_id: `dep-${environment}`,
          active: true,
          created_at: Date.parse("2026-09-04T00:00:00.000Z"),
          updated_at: Date.parse("2026-09-04T00:01:00.000Z"),
        });
      }
    }
    expect(source.calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ environment: "paper", screenId: screen("paper"), sourceId: "manager.deployments", relation: "strategy_deployments" }),
      expect.objectContaining({ environment: "sandbox", screenId: screen("sandbox") }),
      expect.objectContaining({ environment: "live", screenId: screen("live") }),
    ]));
    for (const call of source.calls) {
      expect(call.policy).toMatchObject({
        operationId: "maximumDataDeploymentPageV1",
        maximumResponseBytes: 1_048_576,
      });
    }
  });

  it("binds the source cursor server-side and rejects cross-environment continuation replay", async () => {
    source.response = sourceEnvelope("paper", { nextCursor: "raw-source-cursor-do-not-expose" });
    const first = await service.deploymentPage(principal, { environment: "paper", limit: 10 });
    expect(first.page).toMatchObject({ has_more: true, next_cursor: expect.stringMatching(/^mdc1\./) });
    expect(JSON.stringify(first)).not.toContain("raw-source-cursor-do-not-expose");

    source.response = sourceEnvelope("paper", { items: [], nextCursor: null });
    await service.deploymentPage(principal, {
      environment: "paper",
      limit: 10,
      cursor: first.page.next_cursor!,
    });
    expect(source.calls.at(-1)?.query).toEqual({ limit: 10, cursor: "raw-source-cursor-do-not-expose" });
    await expect(service.deploymentPage(principal, {
      environment: "sandbox",
      limit: 10,
      cursor: first.page.next_cursor!,
    })).rejects.toMatchObject({ code: "EDS01_CURSOR_INVALID_OR_EXPIRED", status: 400 });
  });

  it("fails closed on source relation/profile/catalogue/row contract drift", async () => {
    for (const response of [
      sourceEnvelope("paper", { relation: { schema: "public", relation: "orders" } }),
      sourceEnvelope("paper", { profileId: "PAPER_OTHER" }),
      sourceEnvelope("paper", { catalogueSha256: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
      sourceEnvelope("paper", { items: Array.from({ length: 201 }, (_, index) => row(`dep-${index}`)) }),
    ]) {
      source.response = response;
      await expect(service.deploymentPage(principal, { environment: "paper", limit: 200 }))
        .rejects.toMatchObject({ code: "EDS01_SOURCE_CONTRACT_REJECTED", status: 502 });
    }
  });

  it("keeps the emitted product page within the accepted 1 MiB bound", async () => {
    const largeText = "x".repeat(4_096);
    source.response = sourceEnvelope("paper", {
      items: Array.from({ length: 200 }, (_, index) => ({
        ...row(`dep-large-${index}`),
        fields: {
          ...row(`dep-large-${index}`).fields,
          strategy_id: { kind: "TEXT", value: largeText },
          account_id: { kind: "TEXT", value: largeText },
          portfolio_id: { kind: "TEXT", value: largeText },
          mode: { kind: "TEXT", value: largeText },
          venue: { kind: "TEXT", value: largeText },
          currency: { kind: "TEXT", value: largeText },
          state: { kind: "TEXT", value: largeText },
        },
      })),
    });
    await expect(service.deploymentPage(principal, { environment: "paper", limit: 200 }))
      .rejects.toMatchObject({ code: "EDS01_RESPONSE_TOO_LARGE", status: 502 });
  });

  it("preserves bounded typed transport refusals rather than retrying or translating them to empty", async () => {
    for (const status of [400, 401, 403, 404, 502, 503]) {
      source.failure = new CurrentSourceProxyError(`TEST_${status}`, status);
      await expect(service.deploymentPage(principal, { environment: "paper", limit: 1 }))
        .rejects.toMatchObject({ code: `TEST_${status}`, status });
    }
  });

  it("rejects cursor/path injection at the same-origin controller before an operation is selected", async () => {
    const controller = new MaximumDataOperationController(
      { deploymentPage: async () => ({ ok: true }) } as unknown as MaximumDataOperationService,
      { isMember: async () => true } as never,
    );
    const request = { portalUser: principal.user, portalSession: principal.session, portalWorkspaceId: principal.workspaceId } as never;
    await expect(controller.deployments(request, {
      environment: "paper", relation: "orders", source: "manager.orders",
    })).rejects.toMatchObject({ code: "EDS01_OPERATION_QUERY_INVALID", status: 400 });
    await expect(service.deploymentPage(principal, {
      environment: "paper", limit: 10, cursor: "raw-source-cursor",
    }))
      .rejects.toMatchObject({ code: "EDS01_CURSOR_INVALID_OR_EXPIRED", status: 400 });
  });
});
