/** TEST_ONLY: pure routing ceiling and mocked guard composition. These are not
 * source-provider, financial, membership-database or runtime qualification. */
import type { ExecutionContext, FactoryProvider } from "@nestjs/common";
import type { Pool } from "pg";
import { AppModule } from "../src/app.module";
import { describe, expect, it, vi } from "vitest";
import { AuthService } from "../src/auth/auth.service";
import { SESSION_COOKIE } from "../src/auth/cookies";
import type { ControlApiConfig } from "../src/config";
import type { CurrentHumanWorkspaceProvisioner } from "../src/execution-v2/current-human-workspace";
import { EDS11R_MANAGER_RELATION_OPERATION_REGISTRY } from "../src/execution/eds11r-manager-relation.registry";
import { nativeResearchReadAllowed, nativeResearchReview } from "../src/execution/native-review-profile";
import { retainedReview } from "../src/execution/retained-read-profile";
import { SessionGuard } from "../src/facade/session.guard";
import { ManagerCurrentAccounts } from "../src/execution-v2/manager-current-accounts";
import { NativeCurrentAccountScopes } from "../src/execution-v2/native-current-runtime";
import { CommandStatusComposition } from "../src/execution-v2/command-status-composition";
import { CONTROL_API_CONFIG } from "../src/tokens";
import { WorkspacesRepository } from "../src/repos/workspaces";

const workspace = "TEST_ONLY-native-workspace";
const config = { EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: workspace };
const fixedRoutes = [
  "/api/v1/execution/manager/deployments", "/api/v1/execution/manager/operations",
  "/api/v1/execution/profiles/paper/realtime-snapshot", "/api/v1/execution/profiles/paper/stream",
];
const namedRoutes = EDS11R_MANAGER_RELATION_OPERATION_REGISTRY.map(operation =>
  `/api/v1/execution/manager/current/${operation.routeId}`);
const allowedRoutes = [...fixedRoutes, ...namedRoutes];
const allowed = (path: string, query: Record<string, unknown> = {}, method = "GET") =>
  nativeResearchReadAllowed(config, method, path, query);

describe("Research native Manager profile classification", () => {
  it("requires the explicit exact marker and never reclassifies retained/default profiles", () => {
    expect(nativeResearchReview({ EXECUTION_READ_PROFILE: "native_manager_review_v1" })).toBe(true);
    expect(retainedReview({ EXECUTION_READ_PROFILE: "native_manager_review_v1" })).toBe(false);
    expect(retainedReview({ EXECUTION_READ_PROFILE: "retained_review_v1" })).toBe(true);
    expect(nativeResearchReview()).toBe(false);
    for (const marker of [undefined, "", "default", "retained_review_v1", "native_manager_review_v2",
      "NATIVE_MANAGER_REVIEW_V1", " native_manager_review_v1", "native_manager_review_v1 "])
      expect(nativeResearchReview({ EXECUTION_READ_PROFILE: marker })).toBe(false);
  });
});

describe("Research native Manager closed read surface", () => {
  it("opens only the separately commissioned basic CURRENT Account360 route", () => {
    const route = "/api/v1/execution/resources/accounts/TEST_ONLY-account:1";
    const current = (path = route, query: Record<string, unknown> = {}, method = "GET") =>
      nativeResearchReadAllowed(config, method, path, query, false, false, true);
    expect(allowed(route)).toBe(false);
    // The broader Manager-native composition cannot enable this by accident.
    expect(nativeResearchReadAllowed(config, "GET", route, {}, true, true)).toBe(false);
    expect(current()).toBe(true);
    expect(current(route, { environment: "paper", workspace_id: workspace })).toBe(true);
    for (const environment of ["sandbox", "live", "all", ["paper"], null])
      expect(current(route, { environment })).toBe(false);
    expect(current(route, { workspace_id: "TEST_ONLY-foreign" })).toBe(false);
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])
      expect(current(route, {}, method)).toBe(false);
    for (const path of [route + "/", route + "\n", route + "/orders", route + "?environment=paper",
      "/api/v1/execution/resources/accounts/", "/api/v1/execution/resources/accounts/" + "a".repeat(161),
      "/api/v1/execution/resources/alphas/TEST_ONLY-alpha", "/api/v1/execution/resources/bindings/TEST_ONLY-binding",
      "/api/v1/execution/manager/accounts/TEST_ONLY-account/overview"])
      expect(current(path)).toBe(false);
  });
  it("private STATUS opens exact original lookup/reconcile, never submit/preview or arbitrary command",()=>{
    const path="/api/v1/execution/capital-commands/ecm_"+"a".repeat(32);
    for(const [method,target] of [["GET",path],["GET",path+"/workflow"],["POST",path+"/reconcile"]]){
      expect(nativeResearchReadAllowed(config,method,target,{},false,false)).toBe(false);
      expect(nativeResearchReadAllowed(config,method,target,{},false,true)).toBe(true);
    }
    for(const [method,target] of [["POST",path],["POST","/api/v1/execution/capital-commands"],
      ["POST","/api/v1/execution/capital-commands/preview"],["GET",path+"/reconcile"],
      ["GET","/api/v1/execution/capital-commands/not-an-original"],["GET",path+"/extra"]])
      expect(nativeResearchReadAllowed(config,method,target,{},false,true)).toBe(false);
    expect(nativeResearchReadAllowed(config,"POST",path+"/reconcile",{workspace_id:"foreign"},false,true)).toBe(false);
  });
  it.each(["/api/v1/execution/manager/accounts/TEST_ONLY-account/overview", "/api/v1/execution/manager/alphas/TEST_ONLY-alpha/overview",
    "/api/v1/execution/manager/portfolios/TEST_ONLY-portfolio/overview", "/api/v1/execution/manager/deployments/TEST_ONLY-deployment/overview",
    "/api/v1/execution/manager/fund-overview", "/api/v1/execution/manager/fleet"])("opens exact finite Manager route %s only with private composition",path=>{
    expect(allowed(path)).toBe(false);
    expect(nativeResearchReadAllowed(config,"GET",path,{environment:"paper"},true)).toBe(true);
    for(const environment of ["live","sandbox","all",["paper"],null])
      expect(nativeResearchReadAllowed(config,"GET",path,{environment},true)).toBe(false);
    for(const suffix of ["/","\n","/extra","?environment=paper"])
      expect(nativeResearchReadAllowed(config,"GET",path+suffix,{},true)).toBe(false);
    expect(nativeResearchReadAllowed(config,"POST",path,{},true)).toBe(false);
    expect(nativeResearchReadAllowed(config,"GET",path,{workspace_id:"foreign"},true)).toBe(false);
  });
  it.each(allowedRoutes)("accepts only the checked-in GET surface: %s", path => {
    expect(allowed(path)).toBe(true);
    expect(allowed(path, { environment: "paper", workspace_id: workspace })).toBe(true);
    expect(allowed(path, { environment: "paper" })).toBe(true);
    expect(allowed(path, { workspace_id: workspace })).toBe(true);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "get", ""])("rejects method %s even on valid routes", method => {
    for (const path of allowedRoutes) expect(allowed(path, {}, method)).toBe(false);
  });

  it.each(["live", "sandbox", "all", "canary", "Paper", "", null, ["paper"],
    ["paper", "live"], { environment: "paper" }, 1, true])("rejects non-scalar/non-Paper environment %j", environment => {
    for (const path of allowedRoutes) expect(allowed(path, { environment })).toBe(false);
  });

  it.each(["TEST_ONLY-other-workspace", "", null, [workspace], [workspace, "other"],
    { workspace_id: workspace }, 1, true])("rejects foreign or ambiguous workspace %j", workspace_id => {
    for (const path of allowedRoutes) expect(allowed(path, { workspace_id })).toBe(false);
  });

  it("requires a configured nonempty workspace, even when the client omits workspace", () => {
    for (const value of [undefined, ""])
      for (const path of allowedRoutes)
        expect(nativeResearchReadAllowed({ EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: value }, "GET", path, {})).toBe(false);
  });

  it.each([
    "/api/v1/execution/bootstrap", "/api/v1/execution/profiles/paper/bootstrap",
    "/api/v1/execution/profiles/live/realtime-snapshot", "/api/v1/execution/profiles/sandbox/stream",
    "/api/v1/execution/stream", "/api/v1/execution/realtime-snapshot", "/api/v1/execution/retained-review",
    "/api/v1/execution/fleet", "/api/v1/execution/portfolios", "/api/v1/execution/history",
    "/api/v1/execution/command-center", "/api/v1/execution/commands/catalog",
    "/api/v1/execution/capital-commands", "/api/v1/execution/governance",
    "/api/v1/execution/manager/current/unknown-test-only-alias", "/api/v1/execution/manager/current/public.table",
    "/api/v1/execution/manager/current/", "/api/v1/execution/manager/current/a",
    "/api/v1/execution/manager/deployments/", "/api/v1/execution/manager/operations/command",
    "/api/v1/execution/manager/deployments?environment=paper", "/api/v1/execution/manager/../operations",
    "/api/v1/execution/manager/current/%2e%2e", "/api/v1/research/runs", "/health",
  ])("does not widen commissioning to legacy, commands or unknown paths: %s", path => {
    expect(allowed(path)).toBe(false);
  });

  it("requires exact named-route termination, rejecting suffixes and control characters", () => {
    for (const path of namedRoutes)
      for (const suffix of ["/", "/extra", "\n", "\r\n", "\0", "?environment=paper", "%0A"])
        expect(allowed(path + suffix)).toBe(false);
  });
});

function guardFixture(path = fixedRoutes[0]!, query: Record<string, unknown> = {}, account360 = false) {
  const user = { userId: "TEST_ONLY-native-human", username: "TEST_ONLY-native-name", status: "ACTIVE", mustChangePassword: false };
  const session = { userId: user.userId, sessionId: "TEST_ONLY-native-session", sessionVersion: 3, state: "ACTIVE" };
  const sessionFromToken = vi.fn().mockResolvedValue(session), findById = vi.fn().mockResolvedValue(user);
  const ensure = vi.fn().mockResolvedValue("TEST_ONLY-personal-workspace");
  const ensurePersonal = vi.fn().mockResolvedValue("TEST_ONLY-legacy-workspace");
  const personalWorkspace = vi.fn().mockResolvedValue({ workspaceId: "TEST_ONLY-personal-workspace" });
  const canReadExecution = vi.fn().mockResolvedValue(true), header = vi.fn();
  const request: Record<string, unknown> = { url: path, method: "GET", query, cookies: { [SESSION_COOKIE]: "TEST_ONLY-cookie" } };
  const context = { switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ header }) }) } as ExecutionContext;
  const guard = new SessionGuard({ sessionFromToken, users: { findById } } as unknown as AuthService,
    { ensurePersonal, personalWorkspace, canReadExecution } as unknown as WorkspacesRepository,
    { ...config, EXECUTION_READ_PROFILE: "native_manager_review_v1" } as ControlApiConfig,
    { ensure } as unknown as CurrentHumanWorkspaceProvisioner, undefined, undefined,
    account360 ? {} as ManagerCurrentAccounts : undefined);
  return { user, session, ensure, ensurePersonal, personalWorkspace, canReadExecution, header, request, context, guard, findById, sessionFromToken };
}

describe("Research native SessionGuard authority composition", () => {
  it("the actual AppModule factory forwards optional installed compositions to its guard", async () => {
    // This inspects/calls the actual registered factory without constructing an
    // app/listener or source authority. Manual new SessionGuard alone missed
    // the old factory dropping all optional commissioning dependencies.
    const db = { end: vi.fn() } as unknown as Pool;
    const module = AppModule.register({ NODE_ENV: "test" } as ControlApiConfig, db);
    const factory = module.providers!.find(provider => typeof provider === "object" && provider !== null &&
      "provide" in provider && provider.provide === SessionGuard) as FactoryProvider;
    expect(factory.inject).toEqual([AuthService, WorkspacesRepository, CONTROL_API_CONFIG,
      { token: NativeCurrentAccountScopes, optional: true }, { token: CommandStatusComposition, optional: true },
      { token: ManagerCurrentAccounts, optional: true }]);
    const path = "/api/v1/execution/resources/accounts/TEST_ONLY-account", f = guardFixture(path);
    const auth = { sessionFromToken: f.sessionFromToken, users: { findById: f.findById } };
    const workspaces = { canReadExecution: f.canReadExecution, personalWorkspace: f.personalWorkspace, ensurePersonal: f.ensurePersonal };
    const cfg = { ...config, EXECUTION_READ_PROFILE: "native_manager_review_v1" };
    const absent = factory.useFactory(auth, workspaces, cfg) as SessionGuard;
    await expect(absent.canActivate(f.context)).rejects.toMatchObject({ status: 403 });
    const installed = factory.useFactory(auth, workspaces, cfg, undefined, undefined, {}) as SessionGuard;
    await expect(installed.canActivate(f.context)).resolves.toBe(true);
    f.request.url = "/api/v1/execution/manager/accounts/TEST_ONLY-account/overview";
    await expect(installed.canActivate(f.context)).rejects.toMatchObject({ status: 403 });
    const finite = factory.useFactory(auth, workspaces, cfg, {}) as SessionGuard;
    await expect(finite.canActivate(f.context)).resolves.toBe(true);
    expect(db.end).not.toHaveBeenCalled();
    expect(f.ensure).not.toHaveBeenCalled(); expect(f.ensurePersonal).not.toHaveBeenCalled();
  });
  it("uses installed basic Account360 presence independently of native Manager and never provisions a workspace", async () => {
    const path = "/api/v1/execution/resources/accounts/TEST_ONLY-account";
    const absent = guardFixture(path);
    await expect(absent.guard.canActivate(absent.context)).rejects.toMatchObject({ status: 403 });
    expect(absent.canReadExecution).not.toHaveBeenCalled();
    const installed = guardFixture(path, { workspace_id: workspace, environment: "paper" }, true);
    await expect(installed.guard.canActivate(installed.context)).resolves.toBe(true);
    expect(installed.canReadExecution).toHaveBeenCalledWith(workspace, installed.user.userId, "paper");
    expect(installed.ensure).not.toHaveBeenCalled(); expect(installed.ensurePersonal).not.toHaveBeenCalled();
    expect(installed.request.portalWorkspaceId).toBe(workspace);
    expect(installed.header).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    // This guard checks routing/session/workspace only. The real CURRENT
    // composer, not this TEST_ONLY presence marker, owns business authorization.
  });
  it("rejects an uncommissioned route before provisioning or membership lookup", async () => {
    const f = guardFixture("/api/v1/execution/command-center");
    await expect(f.guard.canActivate(f.context)).rejects.toMatchObject({ status: 403 });
    expect(f.ensure).not.toHaveBeenCalled(); expect(f.ensurePersonal).not.toHaveBeenCalled();
    expect(f.personalWorkspace).not.toHaveBeenCalled();
    expect(f.canReadExecution).not.toHaveBeenCalled(); expect(f.request).not.toHaveProperty("portalUser");
    expect(f.header).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  });

  it("does not treat a valid session or query actor as configured-workspace membership", async () => {
    const f = guardFixture(fixedRoutes[0], { user_id: "TEST_ONLY-forged-user" });
    f.canReadExecution.mockResolvedValueOnce(false);
    await expect(f.guard.canActivate(f.context)).rejects.toMatchObject({ status: 404 });
    expect(f.canReadExecution).toHaveBeenCalledExactlyOnceWith(workspace, f.user.userId, "paper");
    expect(f.request).not.toHaveProperty("portalWorkspaceId"); expect(f.request).not.toHaveProperty("portalSession");
    expect(f.ensurePersonal).not.toHaveBeenCalled(); expect(f.ensure).not.toHaveBeenCalled();
    expect(f.personalWorkspace).not.toHaveBeenCalled();
  });

  it("keeps personal viewer scope separate from the authorized Paper source workspace", async () => {
    const f = guardFixture(fixedRoutes[0], { workspace_id: workspace, environment: "paper" });
    await expect(f.guard.canActivate(f.context)).resolves.toBe(true);
    expect(f.ensure).not.toHaveBeenCalled();
    expect(f.personalWorkspace).toHaveBeenCalledExactlyOnceWith(f.user.userId);
    expect(f.canReadExecution).toHaveBeenCalledExactlyOnceWith(workspace, f.user.userId, "paper");
    expect(f.request).toMatchObject({ portalWorkspaceId: workspace,
      portalViewerWorkspaceId: "TEST_ONLY-personal-workspace", portalUser: f.user, portalSession: f.session });
    expect(f.ensurePersonal).not.toHaveBeenCalled();
  });

  it("refuses a missing personal workspace without provisioning, fallback or attached authority", async () => {
    const f = guardFixture(); f.personalWorkspace.mockResolvedValueOnce(null);
    await expect(f.guard.canActivate(f.context)).rejects.toMatchObject({ status: 404 });
    expect(f.canReadExecution).toHaveBeenCalledExactlyOnceWith(workspace, f.user.userId, "paper");
    expect(f.personalWorkspace).toHaveBeenCalledExactlyOnceWith(f.user.userId);
    expect(f.ensure).not.toHaveBeenCalled(); expect(f.ensurePersonal).not.toHaveBeenCalled();
    expect(f.request).not.toHaveProperty("portalWorkspaceId"); expect(f.request).not.toHaveProperty("portalViewerWorkspaceId");
    expect(f.request).not.toHaveProperty("portalSession"); expect(f.request).not.toHaveProperty("portalUser");
  });

  it("rejects an unknown actor before provisioning or membership lookup", async () => {
    const f = guardFixture(); f.findById.mockResolvedValueOnce(null);
    await expect(f.guard.canActivate(f.context)).rejects.toMatchObject({ status: 401 });
    expect(f.ensure).not.toHaveBeenCalled(); expect(f.canReadExecution).not.toHaveBeenCalled();
    expect(f.ensurePersonal).not.toHaveBeenCalled(); expect(f.request).not.toHaveProperty("portalUser");
    expect(f.personalWorkspace).not.toHaveBeenCalled();
  });
});
