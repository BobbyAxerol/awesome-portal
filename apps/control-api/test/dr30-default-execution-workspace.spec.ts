/** DR-30 unit proofs (no database). Real SQL and migration behaviour is in dr30-default-execution-workspace-pg.spec.ts. */
import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuthService } from "../src/auth/auth.service";
import { SESSION_COOKIE } from "../src/auth/cookies";
import { SessionGuard } from "../src/facade/session.guard";
import { WorkspacesRepository } from "../src/repos/workspaces";
import { defaultWorkspacePath, grantCovers, requestRequiredEnvironments, requiredEnvironments, readMethod,
  defaultWorkspaceGrantsEnabled } from "../src/execution/default-execution-workspace";

const BOUND = "TEST_ONLY-bound-ws", PERSONAL = "TEST_ONLY-personal-ws";
const cfg = (extra: Record<string, string> = {}) => ({ FEATURE_EXECUTION_DEFAULT_WORKSPACE_GRANTS: "true",
  EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: BOUND, EXECUTION_READ_PROFILE: "source_current_v1", ...extra }) as never;

/** pool whose grant query returns the given rows; isMember queries return `member`. */
function repo(rows: Array<{ workspace_id: string; execution_environments: string[] }>, member = false, config = cfg()) {
  const query = vi.fn(async (sql: string) => /execution_retained_review_access/.test(sql) && /execution_environments/.test(sql)
    ? { rows, rowCount: rows.length } : /workspace_members/.test(sql) ? { rows: [], rowCount: member ? 1 : 0 } : { rows: [], rowCount: 0 });
  return { repository: new WorkspacesRepository({ query } as never, config), query };
}
const granted = (...envs: string[]) => [{ workspace_id: BOUND, execution_environments: envs }];

describe("DR-30 pure rules", () => {
  it("maps environments: default is paper, all needs every environment, canary is live, unknown is denied", () => {
    expect(requiredEnvironments(undefined)).toEqual(["paper"]);
    expect(requiredEnvironments("live")).toEqual(["live"]);
    expect(requiredEnvironments("all")).toEqual(["paper", "sandbox", "live"]);
    expect(requiredEnvironments("canary")).toEqual(["live"]);
    expect(requiredEnvironments("prod")).toBeNull();
    expect(requiredEnvironments(["live"])).toBeNull();
    expect(grantCovers(["paper"], requiredEnvironments("all"))).toBe(false);
    expect(grantCovers(["paper", "sandbox"], requiredEnvironments("live"))).toBe(false);
    expect(grantCovers(["live"], null)).toBe(false);
  });
  it("unions query and screen-path environments and fails closed on malformed values", () => {
    expect(requestRequiredEnvironments("/api/v1/execution/alphas", {})).toEqual(["paper"]);
    expect(requestRequiredEnvironments("/api/v1/execution/screens/live", {})).toEqual(["live"]);
    expect(requestRequiredEnvironments("/api/v1/execution/screens/live", { environment: "paper" })?.slice().sort()).toEqual(["live", "paper"]);
    expect(requestRequiredEnvironments("/api/v1/execution/alphas", { environments: "paper,live" })?.slice().sort()).toEqual(["live", "paper"]);
    expect(requestRequiredEnvironments("/api/v1/execution/alphas", { environment: ["paper", "live"] })).toBeNull();
    expect(requestRequiredEnvironments("/api/v1/execution/alphas", { environments: "paper,nope" })).toBeNull();
  });
  it("only projection read families are eligible; Governance, command-center, live detail and streams are not", () => {
    for (const ok of ["/api/v1/execution/alphas", "/api/v1/execution/portfolios", "/api/v1/execution/manager/fleet",
      "/api/v1/execution/screens/sandbox", "/api/v1/execution/resources/alphas/a1"]) expect(defaultWorkspacePath(ok), ok).toBe(true);
    for (const no of ["/api/v1/execution/governance/approvals", "/api/v1/execution/command-center", "/api/v1/execution/deployments/d/live",
      "/api/v1/execution/profiles/live/stream", "/api/v1/execution/operations/incidents/i", "/api/v1/execution/alphasX", "/api/research/runs"])
      expect(defaultWorkspacePath(no), no).toBe(false);
    expect(readMethod("GET")).toBe(true); expect(readMethod("HEAD")).toBe(true);
    for (const m of ["POST", "PUT", "PATCH", "DELETE", undefined]) expect(readMethod(m as string)).toBe(false);
  });
  it("flag and configured workspace are both required", () => {
    expect(defaultWorkspaceGrantsEnabled({ FEATURE_EXECUTION_DEFAULT_WORKSPACE_GRANTS: "true" })).toBe(false);
    expect(defaultWorkspaceGrantsEnabled({ EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: BOUND })).toBe(false);
    expect(defaultWorkspaceGrantsEnabled({ FEATURE_EXECUTION_DEFAULT_WORKSPACE_GRANTS: "true", EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: BOUND })).toBe(true);
  });
});

describe("DR-30 resolver states (AMBIGUOUS / NONE / UNAVAILABLE fail closed)", () => {
  it("GRANTED only for the configured workspace with a non-empty scope", async () => {
    expect(await repo(granted("paper", "live")).repository.defaultExecutionGrant("u")).toEqual({ state: "GRANTED", workspaceId: BOUND, environments: ["paper", "live"] });
  });
  it("NONE without a grant, for a grant on another workspace, or with only unknown tokens", async () => {
    expect(await repo([]).repository.defaultExecutionGrant("u")).toEqual({ state: "NONE" });
    expect(await repo([{ workspace_id: "other", execution_environments: ["paper"] }]).repository.defaultExecutionGrant("u")).toEqual({ state: "NONE" });
    expect(await repo(granted("bogus")).repository.defaultExecutionGrant("u")).toEqual({ state: "NONE" });
  });
  it("AMBIGUOUS for grants on two workspaces: nothing is chosen", async () => {
    const rows = [...granted("paper"), { workspace_id: "other", execution_environments: ["paper"] }];
    const { repository } = repo(rows);
    expect(await repository.defaultExecutionGrant("u")).toEqual({ state: "AMBIGUOUS" });
    expect(await repository.defaultExecutionWorkspaceFor("u", ["paper"])).toBeNull();
    expect(await repository.canReadExecution(BOUND, "u", "paper")).toBe(false);
  });
  it("UNAVAILABLE when the flag is off or the workspace is not configured, and the grant table is not even queried", async () => {
    for (const config of [cfg({ FEATURE_EXECUTION_DEFAULT_WORKSPACE_GRANTS: "false" }), cfg({ EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: "" })]) {
      const { repository, query } = repo(granted("paper"), false, config);
      expect(await repository.defaultExecutionGrant("u")).toEqual({ state: "UNAVAILABLE" });
      expect(query).not.toHaveBeenCalled();
    }
  });
});

describe("DR-30 canReadExecution: granted vs not granted, per environment, isolation", () => {
  it("each environment is an explicit allow; Live is never implied by paper or sandbox", async () => {
    const { repository } = repo(granted("paper", "sandbox"));
    expect(await repository.canReadExecution(BOUND, "u", "paper")).toBe(true);
    expect(await repository.canReadExecution(BOUND, "u", "sandbox")).toBe(true);
    expect(await repository.canReadExecution(BOUND, "u", "live")).toBe(false);
    expect(await repository.canReadExecution(BOUND, "u", "canary")).toBe(false);
    expect(await repository.canReadExecution(BOUND, "u", "all")).toBe(false);
    expect(await repository.canReadExecution(BOUND, "u", "bogus")).toBe(false);
    expect(await repository.canReadExecution(BOUND, "u", undefined)).toBe(true); // route default is paper
  });
  it("a live-only grant cannot read the paper default and a full grant covers all/canary", async () => {
    expect(await repo(granted("live")).repository.canReadExecution(BOUND, "u", undefined)).toBe(false);
    const full = repo(granted("paper", "sandbox", "live")).repository;
    for (const env of ["paper", "sandbox", "live", "all", "canary"]) expect(await full.canReadExecution(BOUND, "u", env), env).toBe(true);
  });
  it("without a grant the old behaviour is unchanged: membership decides", async () => {
    expect(await repo([], false).repository.canReadExecution(BOUND, "u", "paper")).toBe(false);
    expect(await repo([], true).repository.canReadExecution(BOUND, "u", "paper")).toBe(true);
  });
  it("isolation: a grant never opens any other workspace, even when named explicitly", async () => {
    const { repository } = repo(granted("paper", "sandbox", "live"));
    expect(await repository.canReadExecution("TEST_ONLY-someone-elses-ws", "u", "paper")).toBe(false);
    expect(await repository.canReadExecution(PERSONAL, "u", "paper")).toBe(false);
  });
  it("flag off: a scoped grant is inert", async () => {
    const { repository } = repo(granted("paper"), false, cfg({ FEATURE_EXECUTION_DEFAULT_WORKSPACE_GRANTS: "false" }));
    expect(await repository.canReadExecution(BOUND, "u", "paper")).toBe(false);
  });
});

function guardFixture(rows: Array<{ workspace_id: string; execution_environments: string[] }>, request: Record<string, unknown>,
  config = cfg()) {
  const user = { userId: "TEST_ONLY-user", username: "stan", status: "ACTIVE", mustChangePassword: false };
  const session = { userId: user.userId, sessionId: "s1", sessionVersion: 3, state: "ACTIVE" };
  const { repository } = repo(rows, false, config);
  const ensurePersonal = vi.fn().mockResolvedValue(PERSONAL);
  const workspaces = Object.assign(Object.create(repository), { ensurePersonal });
  const req: Record<string, unknown> = { method: "GET", cookies: { [SESSION_COOKIE]: "TEST_ONLY-cookie" }, query: {}, ...request };
  const context = { switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({ header: vi.fn() }) }) } as ExecutionContext;
  const guard = new SessionGuard({ sessionFromToken: vi.fn().mockResolvedValue(session), users: { findById: vi.fn().mockResolvedValue(user) } } as unknown as AuthService,
    workspaces as never, config);
  return { req, context, guard, user };
}

describe("DR-30 SessionGuard", () => {
  it("granted GET on a projection family resolves the bound workspace; viewer stays personal, actor stays the user", async () => {
    const f = guardFixture(granted("paper", "sandbox", "live"), { url: "/api/v1/execution/alphas?environment=live", query: { environment: "live" } });
    await expect(f.guard.canActivate(f.context)).resolves.toBe(true);
    expect(f.req).toMatchObject({ portalWorkspaceId: BOUND, portalViewerWorkspaceId: PERSONAL, portalUser: f.user });
  });
  it("granted but environment not covered: stays on the personal workspace (today's empty/404 behaviour)", async () => {
    const f = guardFixture(granted("paper"), { url: "/api/v1/execution/screens/live" });
    await f.guard.canActivate(f.context);
    expect(f.req).toMatchObject({ portalWorkspaceId: PERSONAL, portalViewerWorkspaceId: PERSONAL });
  });
  it("not granted: unchanged personal workspace", async () => {
    const f = guardFixture([], { url: "/api/v1/execution/alphas" });
    await f.guard.canActivate(f.context);
    expect(f.req).toMatchObject({ portalWorkspaceId: PERSONAL });
  });
  it.each(["POST", "PUT", "PATCH", "DELETE"])("write path unchanged: %s keeps the personal workspace even when granted", async method => {
    const f = guardFixture(granted("paper", "sandbox", "live"), { method, url: "/api/v1/execution/alphas" });
    await f.guard.canActivate(f.context);
    expect(f.req).toMatchObject({ portalWorkspaceId: PERSONAL });
  });
  it.each(["/api/v1/execution/governance/approvals", "/api/v1/execution/command-center", "/api/v1/execution/deployments/d1/live",
    "/api/v1/execution/profiles/paper/stream", "/api/v1/runs"])("non-projection route %s keeps the personal workspace", async url => {
    const f = guardFixture(granted("paper", "sandbox", "live"), { url });
    await f.guard.canActivate(f.context);
    expect(f.req).toMatchObject({ portalWorkspaceId: PERSONAL });
  });
  it("AMBIGUOUS grants and a disabled flag never pick a workspace", async () => {
    const rows = [...granted("paper"), { workspace_id: "other", execution_environments: ["paper"] }];
    const a = guardFixture(rows, { url: "/api/v1/execution/alphas" }); await a.guard.canActivate(a.context);
    expect(a.req).toMatchObject({ portalWorkspaceId: PERSONAL });
    const b = guardFixture(granted("paper"), { url: "/api/v1/execution/alphas" }, cfg({ FEATURE_EXECUTION_DEFAULT_WORKSPACE_GRANTS: "false" }));
    await b.guard.canActivate(b.context);
    expect(b.req).toMatchObject({ portalWorkspaceId: PERSONAL });
  });
  it("malformed environment (array) fails closed to the personal workspace", async () => {
    const f = guardFixture(granted("paper", "sandbox", "live"), { url: "/api/v1/execution/alphas?environment=paper&environment=live",
      query: { environment: ["paper", "live"] } });
    await f.guard.canActivate(f.context);
    expect(f.req).toMatchObject({ portalWorkspaceId: PERSONAL });
  });
});

/** S3 decision: self-context keeps its wire contract (OpenAPI enums, FE strict reader). A scoped default-workspace grant
 * is deliberately NOT a membership candidate there, so these pin the unchanged behaviour. Execution routes resolve the
 * workspace through the DR-30 resolver, never through self-context. */
import { resolveDefaultWorkspace } from "../src/execution-v2/self-context";
describe("DR-30 self-context rule is unchanged", () => {
  it("a granted non-member with no membership stays NONE; the resolver, not self-context, serves execution", () => {
    expect(resolveDefaultWorkspace([])).toEqual({ state: "NONE", reason_class: "NO_WORKSPACE_MEMBERSHIP" });
  });
  it("personal membership only resolves to that personal workspace, never the bound one", () => {
    expect(resolveDefaultWorkspace([{ workspace_id: PERSONAL, has_current_grant_record: false }]))
      .toEqual({ state: "RESOLVED", workspace_id: PERSONAL, rule: "SOLE_MEMBERSHIP" });
  });
  it("two memberships stay AMBIGUOUS: the server never guesses", () => {
    const r = resolveDefaultWorkspace([{ workspace_id: PERSONAL, has_current_grant_record: false }, { workspace_id: BOUND, has_current_grant_record: false }]);
    expect(r.state).toBe("AMBIGUOUS");
  });
});
