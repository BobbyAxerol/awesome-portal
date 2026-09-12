import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AdminService } from "../src/admin/admin.service";
import { AuthService } from "../src/auth/auth.service";
import { ExecutionProfileProjectionRepository } from "../src/execution/profile-projection.repository";
import { ExecutionProfileRealtimeService } from "../src/execution/profile-realtime.service";
import { LocalQueryAnalyticsService } from "../src/execution/local-query-analytics.service";
import { Portfolio360LocalService } from "../src/execution/portfolio360-local.service";
import { ExecutionLocalReadAuthority } from "../src/execution/local-read-authority";
import { migrateTestDatabase, setupApp, teardownApp, testConfig } from "./harness";

describe("BE-R2-8 authenticated local read authority", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  const actors: Record<string, { userId: string; cookie: string }> = {};
  const workspace = "ws_execution_ar01";
  const read = vi.fn().mockResolvedValue({ schema_version: "isolated-test-result" });
  const routes = [
    "/realtime/diagnostics",
    "/profiles/paper/realtime-snapshot", "/profiles/paper/stream",
    "/adapters/paper/broker-acknowledgement", "/history/paper/manager.performance:account_equity_snapshots",
    "/alphas/equity-sparklines", "/alphas/a/stage-drift",
    "/alphas/a/query-analytics", "/deployments/d/query-analytics", "/portfolios/p/query-analytics",
    "/portfolios/p/correlation", "/portfolios/p/capital-ledger", "/portfolios/p/cross-equity",
    "/views/observed-timeline?environment=paper&subject_kind=alpha&subject_id=a",
  ];

  beforeAll(async () => {
    await migrateTestDatabase(testConfig().DATABASE_URL);
    // Bootstrap dark: no test is allowed to load runtime PKI or reach an Edge.
    ctx = await setupApp({ AUTH_MODE: "dev" });
    Object.assign(ctx.config, testConfig({ AUTH_MODE: "dev", FEATURE_EXECUTION_EDGE: "true",
      EXECUTION_EDGE_PRIVATE_KEY_FILE: "/run/secrets/test/delegation.pem",
      EXECUTION_EDGE_CA_FILE: "/run/secrets/test/ca.crt", EXECUTION_EDGE_CLIENT_CERT_FILE: "/run/secrets/test/client.crt",
      EXECUTION_EDGE_CLIENT_KEY_FILE: "/run/secrets/test/client.key",
      FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true", EXECUTION_EDGE_PAPER_ORIGIN: "https://paper-edge.internal",
      EXECUTION_EDGE_PAPER_PROFILE_ID: "PAPER_BINANCE_USDM", EXECUTION_EDGE_PAPER_AUDIENCE: "portal-execution-edge-paper",
      FEATURE_EXECUTION_LOCAL_PROJECTION: "true", EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: workspace,
    }));
    const auth = ctx.app.get(AuthService);
    const admin = ctx.app.get(AdminService);
    for (const [username, role] of [["ar01-member", "USER"], ["ar01-outsider", "ADMIN"]] as const) {
      await admin.createUser({ username, displayName: username, role });
      const user = (await auth.users.findByUsername(username))!;
      const token = (await admin.resetCredential(user.userId)).activationToken;
      const first = await inject(username, "/api/auth/login", "POST", { username, credential: token });
      const initial = cookie(first);
      const csrf = /__Host-portal_csrf=([^;]+)/.exec(initial)![1];
      const password = "river-falcon-lantern-cloud-morning";
      const changed = await inject(username, "/api/auth/change-password", "POST",
        { current_password: token, new_password: password }, { cookie: initial, "x-portal-csrf": csrf });
      expect(changed.statusCode).toBe(201);
      const login = await inject(username, "/api/auth/login", "POST", { username, credential: password });
      expect(login.statusCode).toBe(201);
      actors[username] = { userId: user.userId, cookie: cookie(login) };
    }
    await ctx.pool.query("INSERT INTO workspaces(workspace_id, name, owner_user_id) VALUES ($1,'Execution',$2)", [workspace, actors["ar01-member"].userId]);
    await ctx.pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ($1,$2,'MEMBER')", [workspace, actors["ar01-member"].userId]);
    vi.spyOn(ctx.app.get(ExecutionProfileProjectionRepository), "snapshot").mockImplementation(read);
    vi.spyOn(ctx.app.get(ExecutionProfileRealtimeService), "snapshot").mockImplementation(read);
    for (const method of ["query", "observedTimeline", "equitySparklines", "stageDrift"] as const) {
      vi.spyOn(ctx.app.get(LocalQueryAnalyticsService), method).mockImplementation(read);
    }
    for (const method of ["correlation", "capitalLedger", "crossEquity"] as const) {
      vi.spyOn(ctx.app.get(Portfolio360LocalService), method).mockImplementation(read);
    }
  }, 30_000);
  afterAll(async () => { vi.restoreAllMocks(); if (ctx) await teardownApp(ctx); });

  function inject(username: string, url: string, method = "GET", payload?: unknown, headers = {}) {
    return ctx.app.getHttpAdapter().getInstance().inject({ method, url, payload,
      headers: { "x-dev-access-email": `${username}@azdag.com`, origin: ctx.config.PORTAL_PUBLIC_ORIGIN, ...headers } });
  }
  function get(username: string, path: string) {
    return inject(username, `/api/v1/execution${path}`, "GET", undefined, { cookie: actors[username].cookie });
  }
  function cookie(response: { headers: Record<string, unknown> }) {
    const raw = response.headers["set-cookie"];
    return (Array.isArray(raw) ? raw : [raw]).filter((v): v is string => typeof v === "string").map(v => v.split(";")[0]).join("; ");
  }

  it("rejects every local alias for a nonmember ADMIN before protected data access", async () => {
    read.mockClear();
    for (const route of routes) {
      const response = await get("ar01-outsider", route);
      expect(response.statusCode, route).toBe(404);
      expect(response.json().error.code, route).toBe("WORKSPACE_NOT_FOUND");
    }
    expect(read).not.toHaveBeenCalled();
  });
  it("allows a normal member and binds analytics to execution, not their personal workspace", async () => {
    read.mockClear();
    expect((await get("ar01-member", "/alphas/a/query-analytics?environment=paper&account_id=acc_1")).statusCode).toBe(200);
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: workspace }), "alpha", "a",
      expect.objectContaining({ environment: "paper", accountId: "acc_1" }));
    expect((await get("ar01-member", "/profiles/paper/realtime-snapshot")).statusCode).toBe(200);
  });
  it("does not read a disabled profile, including an already-authenticated member", async () => {
    read.mockClear();
    expect((await get("ar01-member", "/alphas/a/query-analytics?environment=live")).statusCode).toBe(404);
    expect(read).not.toHaveBeenCalled();
  });
  it("detects membership revocation on both next read and stream authorization lease", async () => {
    await ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [workspace, actors["ar01-member"].userId]);
    read.mockClear();
    expect((await get("ar01-member", "/profiles/paper/realtime-snapshot")).statusCode).toBe(404);
    const user = (await ctx.app.get(AuthService).users.findById(actors["ar01-member"].userId))!;
    expect(await ctx.app.get(ExecutionLocalReadAuthority).remainsAuthorized({ portalUser: user,
      portalSession: {} as never, portalWorkspaceId: "personal" }, "paper")).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });
});
