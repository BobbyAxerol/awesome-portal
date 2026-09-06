import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AuthSession, PortalUser } from "../src/domain";
import { ExecutionCurrentSourceProxy, CurrentSourceProxyError } from "../src/execution/current-source.proxy";
import {
  EDS11R_MANAGER_RELATION_OPERATION_REGISTRY,
  EDS11R_MANAGER_NON_BROWSER_RELATION_DISPOSITIONS,
  EDS11R_MANAGER_RELATION_REGISTRY_MANIFEST,
  browserManagerRelationOperationManifest,
  managerRelationOperationByRoute,
} from "../src/execution/eds11r-manager-relation.registry";
import {
  MaximumDataOperationPrincipal,
  MaximumDataOperationService,
} from "../src/execution/maximum-data-operation.service";
import { MaximumDataOperationController } from "../src/execution/maximum-data-operation.controller";
import { MAXIMUM_DATA_INTAKE_V1 } from "../src/execution/maximum-data-intake";

const user: PortalUser = {
  userId: "usr_eds11r", username: "eds11r", displayName: "EDS-11R", role: "ADMIN", status: "ACTIVE",
  mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, sessionVersion: 1,
  createdAt: new Date("2026-09-06T00:00:00.000Z"), updatedAt: new Date("2026-09-06T00:00:00.000Z"), disabledAt: null,
};

const session: AuthSession = {
  sessionId: "ses_eds11r", userId: user.userId, state: "ACTIVE", sessionVersion: 1,
  authenticationTime: new Date("2026-09-06T00:00:00.000Z"),
  idleExpiresAt: new Date("2026-09-06T01:00:00.000Z"),
  absoluteExpiresAt: new Date("2026-09-06T08:00:00.000Z"),
};

const principal: MaximumDataOperationPrincipal = { user, session, workspaceId: "ws_eds11r" };

type Environment = "paper" | "sandbox" | "live";

class FakeCurrentSource {
  calls: Array<Record<string, unknown>> = [];
  response: unknown = envelope("paper");
  failure: Error | null = null;

  async relationForCataloguedOperation(
    _principal: unknown,
    environment: Environment,
    policy: Record<string, unknown>,
    query: Record<string, unknown>,
  ): Promise<unknown> {
    this.calls.push({ environment, policy, query });
    if (this.failure) throw this.failure;
    return this.response;
  }
}

class FakeContinuations {
  issued: Array<{ scope: Record<string, unknown>; sourceCursor: string }> = [];

  async issue(scope: Record<string, unknown>, sourceCursor: string): Promise<string> {
    this.issued.push({ scope, sourceCursor });
    return "mdc1.00000000-0000-4000-8000-000000000001";
  }

  async resolve(_scope: Record<string, unknown>, cursor: string): Promise<string> {
    if (cursor !== "mdc1.00000000-0000-4000-8000-000000000001") throw new Error("unexpected cursor");
    return "source-private-continuation";
  }
}

function profile(environment: Environment): string {
  return environment === "paper" ? "PAPER_BINANCE_USDM"
    : environment === "sandbox" ? "SANDBOX_BINANCE_USDM"
      : "LIVE_BINANCE_USDM";
}

function row(options: { invalidDecimal?: boolean; relation?: string } = {}) {
  return {
    relation: { schema: "public", relation: options.relation ?? "account_balances" },
    record_key: "raw-source-key-must-not-cross-browser",
    fields: {
      account_id: { kind: "TEXT", value: "account-001" },
      currency: { kind: "TEXT", value: "USDT" },
      total: { kind: "DECIMAL", value: options.invalidDecimal ? "not-a-decimal" : "1000.000000000000000000" },
      locked: { kind: "DECIMAL", value: "50.000000000000000000" },
      free: { kind: "DECIMAL", value: "950.000000000000000000" },
      updated_at: { kind: "TIMESTAMP", value: "2026-09-06T00:02:03.000Z" },
      raw: { kind: "OBJECT", value: { credential: "must-not-cross" } },
      unselected_secret: { kind: "TEXT", value: "must-not-cross" },
    },
  };
}

function envelope(
  environment: Environment,
  options: {
    items?: unknown[];
    nextCursor?: string | null;
    profileId?: string;
    relation?: string;
    catalogueSha256?: string;
    availability?: string;
  } = {},
) {
  const profileId = options.profileId ?? profile(environment);
  return {
    schema_version: "portal.execution.current-source-bff.v2",
    authority: "PORTAL_CONTROL_API",
    requested_environment: environment,
    source_environment: environment,
    profile_id: profileId,
    source: {
      contract_version: MAXIMUM_DATA_INTAKE_V1.returnPack.managerContractRevision,
      authority: "EXECUTION_CELL",
      profile_id: profileId,
      catalogue_sha256: options.catalogueSha256 ?? MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueDigest,
      availability: options.availability ?? "AVAILABLE",
      freshness: "FRESH",
      completeness: "COMPLETE",
      as_of: "2026-09-06T00:02:04.000Z",
      data: {
        relation: { schema: "public", relation: options.relation ?? "account_balances" },
        items: options.items ?? [row()],
        next_cursor: options.nextCursor ?? null,
      },
    },
  };
}

describe("EDS-11R1 generated named Manager relation authority", () => {
  it("is reproducible from the accepted immutable catalogue evidence", () => {
    const result = spawnSync(
      process.execPath,
      ["tooling/generate-eds11r-manager-relation-registry.mjs", "--check"],
      { cwd: resolve(__dirname, ".."), env: process.env, encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
  });

  it("compiles all 54 and only the 54 SCREEN_BOUND relations into named operations", () => {
    expect(EDS11R_MANAGER_RELATION_OPERATION_REGISTRY).toHaveLength(54);
    expect(new Set(EDS11R_MANAGER_RELATION_OPERATION_REGISTRY.map((item) => item.operationId)).size).toBe(54);
    expect(new Set(EDS11R_MANAGER_RELATION_OPERATION_REGISTRY.map((item) => item.routeId)).size).toBe(54);
    expect(EDS11R_MANAGER_RELATION_REGISTRY_MANIFEST).toMatchObject({
      relationCount: 96,
      screenBoundRelationCount: 54,
      nonBrowserClassificationCounts: { projectionInput: 16, auditOnly: 13, internalOnly: 13 },
      sourceCatalogueSha256: MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueDigest,
      sourceContractRevision: MAXIMUM_DATA_INTAKE_V1.returnPack.managerContractRevision,
    });
    for (const operation of EDS11R_MANAGER_RELATION_OPERATION_REGISTRY) {
      expect(operation.fields.length).toBeGreaterThan(0);
      expect(operation.screenIds.length).toBeGreaterThan(0);
      expect(operation.identityFields.every((field) => operation.fields.some((candidate) => candidate.name === field))).toBe(true);
      expect(operation.fields.every((field) => ["BOOLEAN", "INTEGER", "DECIMAL", "TEXT", "TIMESTAMP"].includes(field.kind))).toBe(true);
    }
    expect(EDS11R_MANAGER_NON_BROWSER_RELATION_DISPOSITIONS).toHaveLength(42);
    expect(EDS11R_MANAGER_NON_BROWSER_RELATION_DISPOSITIONS).toEqual(expect.arrayContaining([
      expect.objectContaining({ classification: "PROJECTION_INPUT", browser_disposition: "PORTAL_PROJECTION_ONLY" }),
      expect.objectContaining({ classification: "AUDIT_ONLY", browser_disposition: "AUDIT_REPOSITORY_ONLY" }),
      expect.objectContaining({ classification: "INTERNAL_ONLY", browser_disposition: "NOT_BROWSER_ADMISSIBLE" }),
    ]));
  });

  it("publishes a frontend mapping manifest without schema, relation, source alias or transport leakage", () => {
    const manifest = browserManagerRelationOperationManifest();
    expect(manifest).toMatchObject({
      schema_version: "portal.execution.eds11r.named-operation-manifest.v1",
      screen_bound_relation_count: 54,
      non_browser_classification_counts: { projectionInput: 16, auditOnly: 13, internalOnly: 13 },
    });
    const serialized = JSON.stringify(manifest);
    for (const forbidden of ["public.", "source_id", "manager.current.", "relation\"", "cursor", "mtls", "jwt", "account_balances"]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    expect(manifest.operations).toContainEqual(expect.objectContaining({
      operation_id: "managerAccountBalancesPageV1",
      route_id: "account-balances",
    }));
  });

  it("resolves a static operation into a bounded safe page and strips raw source values", async () => {
    const source = new FakeCurrentSource();
    const continuations = new FakeContinuations();
    const service = new MaximumDataOperationService(
      source as unknown as ExecutionCurrentSourceProxy,
      continuations as never,
    );
    source.response = envelope("paper", { nextCursor: "raw-source-cursor" });
    const result = await service.relationPage(principal, "account-balances", {
      environment: "paper", limit: 50,
    });
    expect(result).toMatchObject({
      schema_version: "portal.execution.eds11r.manager-relation-page.v1",
      logical_operation_id: "managerAccountBalancesPageV1",
      field_id: "managerAccountBalancesCurrent",
      environment: "paper",
      profile_id: "PAPER_BINANCE_USDM",
      source_health: {
        freshness: "FRESH",
        completeness: "COMPLETE",
        as_of_ms: Date.parse("2026-09-06T00:02:04.000Z"),
        replay_eligible: false,
      },
      page: { has_more: true, next_cursor: expect.stringMatching(/^mdc1\./) },
      state: "POPULATED",
      records: [{
        resource_id: expect.stringMatching(/^por1_[a-f0-9]{64}$/),
        values: {
          account_id: "account-001",
          currency: "USDT",
          total: "1000.000000000000000000",
          updated_at: Date.parse("2026-09-06T00:02:03.000Z"),
        },
      }],
    });
    const serialized = JSON.stringify(result);
    for (const forbidden of [
      "raw-source-key-must-not-cross-browser", "raw-source-cursor", "must-not-cross",
      "account_balances", "manager.current.account-balances", "\"schema\"", "\"relation\"",
    ]) expect(serialized).not.toContain(forbidden);
    expect(source.calls).toEqual([expect.objectContaining({
      environment: "paper",
      policy: expect.objectContaining({
        operationId: "managerAccountBalancesPageV1",
        sourceId: "manager.current.account-balances",
        relation: "account_balances",
      }),
      query: { limit: 50 },
    })]);
    expect(continuations.issued[0]).toMatchObject({
      sourceCursor: "raw-source-cursor",
      scope: expect.objectContaining({ operationId: "managerAccountBalancesPageV1", environment: "paper" }),
    });
  });

  it("keeps every profile isolated and rejects unknown, drifted or malformed source data", async () => {
    const source = new FakeCurrentSource();
    const service = new MaximumDataOperationService(source as unknown as ExecutionCurrentSourceProxy, new FakeContinuations() as never);
    await expect(service.relationPage(principal, "not-a-real-operation", { environment: "paper", limit: 1 }))
      .rejects.toMatchObject({ code: "EDS11R_OPERATION_NOT_FOUND", status: 404 });

    for (const response of [
      envelope("paper", { profileId: "PAPER_OTHER" }),
      envelope("paper", { relation: "orders" }),
      envelope("paper", { items: [row({ relation: "orders" })] }),
      envelope("paper", { items: [row({ invalidDecimal: true })] }),
      envelope("paper", { catalogueSha256: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
      envelope("paper", { availability: "UNAVAILABLE" }),
    ]) {
      source.response = response;
      await expect(service.relationPage(principal, "account-balances", { environment: "paper", limit: 1 }))
        .rejects.toMatchObject({
          code: expect.stringMatching(/^EDS11R_(SOURCE_CONTRACT_REJECTED|SOURCE_UNAVAILABLE)$/),
          status: expect.any(Number),
        });
    }

    source.failure = new CurrentSourceProxyError("N13B_DELEGATED_IDENTITY_REJECTED", 403);
    await expect(service.relationPage(principal, "account-balances", { environment: "live", limit: 1 }))
      .rejects.toMatchObject({ code: "N13B_DELEGATED_IDENTITY_REJECTED", status: 403 });
    expect(managerRelationOperationByRoute("account-balances")?.relation).toBe("account_balances");
  });

  it("keeps the HTTP boundary named: generic source/relation parameters are rejected before a BFF call", async () => {
    const controller = new MaximumDataOperationController(
      { relationPage: async () => ({ accepted: true }) } as unknown as MaximumDataOperationService,
      { isMember: async () => true } as never,
    );
    const request = {
      portalUser: user,
      portalSession: session,
      portalWorkspaceId: principal.workspaceId,
    } as never;
    await expect(controller.currentRelation(request, "account-balances", {
      environment: "paper", relation: "orders", source: "manager.orders",
    })).rejects.toMatchObject({ code: "EDS11R_OPERATION_QUERY_INVALID", status: 400 });
    await expect(controller.currentRelation(request, "../orders", { environment: "paper" }))
      .rejects.toMatchObject({ code: "EDS11R_OPERATION_NOT_FOUND", status: 404 });
  });
});
