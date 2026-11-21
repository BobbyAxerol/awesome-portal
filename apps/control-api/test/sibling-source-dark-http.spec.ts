import "reflect-metadata";
import { readFileSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { resolve } from "node:path";
import { Injectable, Module, type ExecutionContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { FastifyInstance } from "fastify";
import Ajv2020 from "ajv/dist/2020";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "../src/auth/auth.service";
import { SiblingSourceDarkController } from "../src/execution-v2/sibling-source-dark.controller";
import { ManagerCurrentAccounts } from "../src/execution-v2/manager-current-accounts";
import { SiblingNativeDelivery } from "../src/execution-v2/sibling-native-delivery";
import { CurrentViewAuthorityError } from "../src/execution-v2/current-view-authority";
import { SessionGuard } from "../src/facade/session.guard";
import { HttpErrorFilter } from "../src/http-error.filter";
import { WorkspacesRepository } from "../src/repos/workspaces";
import { ExecutionReadScopeError } from "../src/execution-v2/read-scope";
import type { ResourceEnvironment, ResourceReadPrincipal } from "../src/resource-read/resource-read.service";

// Route serialization and workspace refusals only: this synthetic harness is
// not an actual session, field authority, source, native egress or receipt.
@Module({}) class SyntheticSiblingModule {}
const contracts = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const routes = [
  { family: "order-detail", problem: "OrderDetailProblem", path: "/api/v1/execution/orders/order-1/detail" },
  { family: "account-profile", problem: "AccountProfileProblem", path: "/api/v1/execution/accounts/account-1/profile" },
  { family: "reconciliation", problem: "ReconciliationProblem", path: "/api/v1/execution/reconciliation" },
  { family: "obligations", problem: "ObligationsProblem", path: "/api/v1/execution/obligations" },
] as const;

describe("source-dark sibling HTTP routes", () => {
  let app: NestFastifyApplication, http: FastifyInstance, member = true, nativeEnabled = false, siblingsEnabled = false;
  const readAccess = vi.fn(async (workspace: string) => member && workspace === "ws-1");
  const nativeProfile = vi.fn(async (_actor: ResourceReadPrincipal, accountId: string, _environment: ResourceEnvironment | undefined,
    response: ServerResponse, beforeDispatch: () => void) => {
    beforeDispatch(); response.writeHead(200, { "content-type": "application/json", "cache-control": "private, no-store" });
    response.end(JSON.stringify({ schema_version: "portal.execution.account-profile.v1", workspace_id: "ws-1",
      record_authority: "PORTAL_PROJECTION", read_at_ms: 123, account_id: accountId }));
  });
  const nativeSibling = vi.fn(async (_actor: ResourceReadPrincipal, family: string, targetType: string, targetId: string,
    response: ServerResponse, beforeDispatch: () => void, _page?: { cursor: string | null; pageSize: number }) => {
    beforeDispatch(); response.writeHead(200, { "content-type": "application/json", "cache-control": "private, no-store" });
    response.end(JSON.stringify({ schema_version: `portal.execution.${family}.v1`, workspace_id: "ws-1",
      record_authority: "PORTAL_PROJECTION", read_at_ms: 123,
      ...(family === "order-detail" ? { order_id: targetId } : { subject: { type: targetType, id: targetId } }) }));
  });
  @Injectable() class SyntheticGuard { canActivate(ctx: ExecutionContext) {
    ctx.switchToHttp().getResponse().header("Cache-Control", "private, no-store");
    const request = ctx.switchToHttp().getRequest();
    if (request.headers["x-test-session"] !== "valid") throw new AuthError("SESSION_REQUIRED", "Authentication required.", 401);
    request.portalUser = { userId: "user-1" }; request.portalSession = { sessionId: "session-1" };
    request.portalWorkspaceId = "ws-1"; return true;
  } }
  let originalGuards: unknown;
  beforeAll(async () => {
    originalGuards = Reflect.getMetadata("__guards__", SiblingSourceDarkController);
    Reflect.defineMetadata("__guards__", [SyntheticGuard], SiblingSourceDarkController);
    app = await NestFactory.create<NestFastifyApplication>({ module: SyntheticSiblingModule,
      controllers: [SiblingSourceDarkController], providers: [SyntheticGuard,
        { provide: WorkspacesRepository, useValue: { canReadExecution: readAccess } },
        { provide: ManagerCurrentAccounts, useValue: { hasNativeCurrentRelations: () => nativeEnabled, readNativeProfile: nativeProfile } },
        { provide: SiblingNativeDelivery, useValue: { hasNativeCurrentRelations: () => siblingsEnabled, deliver: nativeSibling } }] },
    new FastifyAdapter(), { logger: false, abortOnError: false });
    app.useGlobalFilters(new HttpErrorFilter()); await app.init();
    http = app.getHttpAdapter().getInstance() as FastifyInstance; await http.ready();
  });
  beforeEach(() => { member = true; nativeEnabled = false; siblingsEnabled = false; readAccess.mockClear(); nativeProfile.mockClear(); nativeSibling.mockClear(); });
  afterAll(async () => { if (app) await app.close();
    Reflect.defineMetadata("__guards__", originalGuards ?? [SessionGuard], SiblingSourceDarkController); });
  const get = (url: string, session = true) => http.inject({ method: "GET", url,
    headers: session ? { "x-test-session": "valid" } : {} });

  for (const route of routes) {
    it(`${route.family}: validates dark, session, workspace and query responses against the contract`, async () => {
      const api = JSON.parse(readFileSync(resolve(contracts, `openapi/execution-${route.family}.openapi.json`), "utf8"));
      const validate = new Ajv2020({ strict: true }).compile(api.components.schemas[route.problem]);
      for (const [url, session, status] of [[route.path, true, 503], [route.path, false, 401],
        [`${route.path}?workspace_id=ws-2`, true, 404], [`${route.path}?extra=1`, true, 400]] as const) {
        const response = await get(url, session);
        expect(response.statusCode, response.body).toBe(status);
        expect(response.headers["cache-control"]).toBe("private, no-store");
        expect(validate(response.json()), JSON.stringify(validate.errors)).toBe(true);
        expect(response.body).not.toMatch(/order_id|account_id|obligation_id|break_id/);
      }
    });
  }
  it("does not treat workspace access as a resource or source grant", async () => {
    member = false;
    const response = await get(routes[0].path);
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("EXECUTION_READ_NOT_AVAILABLE");
  });
  it("routes a commissioned account profile only through the native response owner", async () => {
    nativeEnabled = true;
    const response = await get(routes[1].path + "?workspace_id=ws-1&environment=paper");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ schema_version: "portal.execution.account-profile.v1", workspace_id: "ws-1",
      record_authority: "PORTAL_PROJECTION", read_at_ms: 123, account_id: "account-1" });
    const api = JSON.parse(readFileSync(resolve(contracts, "openapi/execution-account-profile.openapi.json"), "utf8"));
    expect(new Ajv2020({ strict: true }).compile(api.components.schemas.AccountProfile)(response.json())).toBe(true);
    expect(nativeProfile).toHaveBeenCalledOnce();
    expect(nativeProfile.mock.calls[0]![0]).toMatchObject({ workspaceId: "ws-1", viewerWorkspaceId: "ws-1",
      user: { userId: "user-1" }, session: { sessionId: "session-1" } });
    expect((await get(routes[1].path + "?workspace_id=ws-2")).statusCode).toBe(404);
    expect((await get(routes[1].path + "?environment=live")).statusCode).toBe(503);
    expect(nativeProfile).toHaveBeenCalledOnce();
  });
  it.each([["EXECUTION_READ_ACCESS_CHANGED", 409], ["EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503]] as const)(
    "serializes source or authority refusal %s against the account contract", async (code, status) => {
      nativeEnabled = true; nativeProfile.mockRejectedValueOnce(new ExecutionReadScopeError(code, status));
      const response = await get(routes[1].path);
      expect(response.statusCode).toBe(status);
      const api = JSON.parse(readFileSync(resolve(contracts, "openapi/execution-account-profile.openapi.json"), "utf8"));
      expect(new Ajv2020({ strict: true }).compile(api.components.schemas.AccountProfileProblem)(response.json())).toBe(true);
      expect(response.json().error.code).toBe(code);
    });
  it("fails closed if the provider returns without taking native HTTP custody", async () => {
    nativeEnabled = true; nativeProfile.mockResolvedValueOnce(undefined);
    const response = await get(routes[1].path);
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("EXECUTION_READ_AUTHORITY_UNAVAILABLE");
  });
  it.each([
    ["order-detail", "/api/v1/execution/orders/order-1/detail", "OrderDetail", "ORDER", "order-1"],
    ["reconciliation", "/api/v1/execution/reconciliation?subject_type=ACCOUNT&subject_id=account-1", "Reconciliation", "ACCOUNT", "account-1"],
    ["obligations", "/api/v1/execution/obligations?subject_type=ACCOUNT&subject_id=account-1", "Obligations", "ACCOUNT", "account-1"],
  ] as const)("%s routes a synthetic positive only through the native response owner", async (family, url, schema, type, target) => {
    siblingsEnabled = true;
    const response = await get(url);
    expect(response.statusCode, response.body).toBe(200);
    const api = JSON.parse(readFileSync(resolve(contracts, `openapi/execution-${family}.openapi.json`), "utf8"));
    expect(new Ajv2020({ strict: true }).compile(api.components.schemas[schema])(response.json())).toBe(true);
    expect(nativeSibling).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "ws-1" }), family, type, target,
      expect.anything(), expect.any(Function), family === "order-detail" ? undefined : { cursor: null, pageSize: 100 });
    member = false;
    expect((await get(url)).statusCode).toBe(404);
    expect(nativeSibling).toHaveBeenCalledOnce();
  });
  it("does not send an implicit success if a sibling provider fails to take custody", async () => {
    siblingsEnabled = true; nativeSibling.mockResolvedValueOnce(undefined);
    const response = await get(routes[0].path);
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("EXECUTION_READ_AUTHORITY_UNAVAILABLE");
  });
  it("maps provider failures and an authority change to public contract problems", async () => {
    siblingsEnabled = true;
    for (const [error, status, code] of [
      [new Error("private-source-credential"), 503, "EXECUTION_READ_AUTHORITY_UNAVAILABLE"],
      [new CurrentViewAuthorityError("CURRENT_VIEW_AUTHORITY_CHANGED", 409), 409, "EXECUTION_READ_ACCESS_CHANGED"],
    ] as const) {
      nativeSibling.mockRejectedValueOnce(error);
      const response = await get(routes[0].path);
      expect(response.statusCode).toBe(status); expect(response.json().error.code).toBe(code);
      expect(response.body).not.toContain("private-source-credential");
      const api = JSON.parse(readFileSync(resolve(contracts, "openapi/execution-order-detail.openapi.json"), "utf8"));
      expect(new Ajv2020({ strict: true }).compile(api.components.schemas.OrderDetailProblem)(response.json())).toBe(true);
    }
  });
  it("bounds page requests and forwards the opaque cursor without interpreting it as permission", async () => {
    siblingsEnabled = true;
    for (const suffix of ["page_size=0", "page_size=201", "page_size=1.5", "cursor=with%20space"]) {
      expect((await get(`/api/v1/execution/obligations?subject_type=ACCOUNT&subject_id=account-1&${suffix}`)).statusCode).toBe(400);
    }
    expect(nativeSibling).not.toHaveBeenCalled();
    expect((await get("/api/v1/execution/obligations?subject_type=ACCOUNT&subject_id=account-1&page_size=200&cursor=sp1.a.b.c.d")).statusCode).toBe(200);
    expect(nativeSibling.mock.calls[0]![6]).toEqual({ cursor: "sp1.a.b.c.d", pageSize: 200 });
  });
});
