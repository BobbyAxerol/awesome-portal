import { beforeAll, afterAll, afterEach, describe, expect, it } from "vitest";
import { MockAgent, setGlobalDispatcher, Agent } from "undici";
import { migrateTestDatabase, setupApp, teardownApp, testConfig } from "./harness";
import { createControlApiApp } from "../src/app";
import { getPool } from "../src/db/pool";
import { AuthService } from "../src/auth/auth.service";
import { Argon2CredentialService, sha256 } from "../src/auth/argon";
import { AdminService } from "../src/admin/admin.service";
import { PrincipalService } from "../src/auth/principal";
import {
  buildPortalUpstreamUrl,
  planningUpstreamPath,
} from "../src/facade/proxy.service";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://portal:portal@127.0.0.1:5432/portal_control_test";

function cookies(response: { headers: Record<string, unknown> }): string {
  const setCookie = response.headers["set-cookie"];
  const values = Array.isArray(setCookie) ? setCookie : [setCookie];
  return values
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.split(";")[0])
    .join("; ");
}

function csrfCookie(response: { headers: Record<string, unknown> }): string {
  const setCookie = response.headers["set-cookie"];
  const values = Array.isArray(setCookie) ? setCookie : [setCookie];
  const value = values.find(
    (item): item is string =>
      typeof item === "string" && item.startsWith("__Host-portal_csrf="),
  );
  if (!value) throw new Error("csrf cookie missing");
  return value.split(";")[0].split("=")[1];
}

describe("Portal upstream URL boundary", () => {
  it("keeps an allowed API path and query on the configured origin", () => {
    const target = buildPortalUpstreamUrl(
      "http://portal-api:8000",
      "/api/runs/run_01",
      "limit=25&cursor=next",
    );
    expect(target.href).toBe(
      "http://portal-api:8000/api/runs/run_01?limit=25&cursor=next",
    );
  });

  it.each([
    "https://attacker.example/api/runs",
    "//attacker.example/api/runs",
    "/api/runs/../admin",
    "/api/runs/%2e%2e/admin",
    "/api/runs/%5c%5cattacker.example",
    "/not-api/runs",
  ])("rejects an unsafe upstream path: %s", (path) => {
    expect(() =>
      buildPortalUpstreamUrl("http://portal-api:8000", path, undefined),
    ).toThrowError(/Portal API path is invalid/);
  });

  it.each([
    "file:///tmp/portal-api",
    "http://user:password@portal-api:8000",
    "http://portal-api:8000/internal",
  ])("rejects an unsafe configured upstream origin: %s", (origin) => {
    expect(() =>
      buildPortalUpstreamUrl(origin, "/api/runs", undefined),
    ).toThrowError(/configured Portal API origin is invalid/);
  });
});

describe("Planning upstream path boundary", () => {
  it("maps only the public Planning API prefix", () => {
    expect(
      planningUpstreamPath("/roadmap-task-board/api/v1/tasks/TASK-1/move"),
    ).toBe("/api/v1/tasks/TASK-1/move");
  });

  it.each([
    "/api/v1/tasks",
    "/roadmap-task-board/api/../admin",
    "/roadmap-task-board/api/%2e%2e/admin",
    "/roadmap-task-board/api/%5cattacker",
    "//attacker.example/roadmap-task-board/api/v1/tasks",
  ])("rejects an unsafe Planning path: %s", (path) => {
    expect(() => planningUpstreamPath(path)).toThrowError(
      /Planning API path is invalid/,
    );
  });
});

describe("control api facade (proxy, workspaces, outbox)", () => {
  let mockAgent: MockAgent;
  let upstream: ReturnType<MockAgent["get"]>;
  let planningUpstream: ReturnType<MockAgent["get"]>;

  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL);
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    upstream = mockAgent.get("http://portal-api:8000");
    planningUpstream = mockAgent.get("http://roadmap-task-board-api:8000");
    setGlobalDispatcher(mockAgent);
  });
  afterAll(async () => {
    setGlobalDispatcher(new Agent());
  });

  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let auth: AuthService;
  let admin: AdminService;

  beforeAll(async () => {
    ctx = await setupApp({
      AUTH_MODE: "dev",
      PORTAL_API_BASE_URL: "http://portal-api:8000",
    });
    auth = new AuthService(
      ctx.pool,
      ctx.config,
      new Argon2CredentialService({
        memoryKib: ctx.config.ARGON2_MEMORY_KIB,
        iterations: ctx.config.ARGON2_ITERATIONS,
        parallelism: ctx.config.ARGON2_PARALLELISM,
      }),
    );
    admin = new AdminService(ctx.pool, ctx.config, auth);
  });

  afterAll(async () => {
    await teardownApp(ctx);
  });

  afterEach(async () => {
    await ctx.pool.query(
      `TRUNCATE outbox_messages, product_audit_events, run_read_models,
        workspace_members, workspaces, auth_audit_events, auth_sessions,
        activation_credentials, password_credentials,
        external_identity_bindings, portal_users CASCADE`,
    );
  });

  const inject = (path: string, options: Record<string, unknown> = {}) => {
    const headers = { ...((options.headers as Record<string, string>) ?? {}) };
    if (!("x-dev-access-email" in headers)) {
      headers["x-dev-access-email"] = "dev@azdag.com";
    }
    return ctx.app.getHttpAdapter().getInstance().inject({
      method: "GET",
      url: path,
      ...options,
      headers,
    });
  };

  async function seedUser(
    username: string,
    role: "ADMIN" | "USER",
    displayName = username,
  ) {
    await admin.createUser({ username, displayName, role });
    const user = await auth.users.findByUsername(username);
    const { activationToken } = await admin.resetCredential(user!.userId);
    const login = await inject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": `${username}@azdag.com` },
      payload: { username, credential: activationToken },
    });
    expect(login.statusCode).toBe(201);
    const csrf = (login.headers["set-cookie"] as string[])
      .find((v) => v.startsWith("__Host-portal_csrf="))!
      .split(";")[0]
      .split("=")[1];
    const changed = await inject("/api/auth/change-password", {
      method: "POST",
      headers: {
        cookie: cookies(login),
        "x-portal-csrf": csrf,
        "x-dev-access-email": `${username}@azdag.com`,
      },
      payload: {
        current_password: activationToken,
        new_password: `${username}-secure-phrase-2026-ok`,
      },
    });
    expect(changed.statusCode).toBe(201);
    const login2 = await inject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": `${username}@azdag.com` },
      payload: { username, credential: `${username}-secure-phrase-2026-ok` },
    });
    expect(login2.statusCode).toBe(201);
    return {
      userId: user!.userId,
      cookie: cookies(login2),
      csrf: csrfCookie(login2),
    };
  }

  it("requires an authenticated session on facade paths", async () => {
    const response = await inject("/api/v1/portal/summary");
    expect(response.statusCode).toBe(401);
  });

  it("requires an authenticated session on Planning API paths", async () => {
    const response = await inject("/roadmap-task-board/api/v1/tasks");
    expect(response.statusCode).toBe(401);
  });

  it("derives the Planning actor from the authenticated session", async () => {
    let captured: Record<string, unknown> = {};
    planningUpstream
      .intercept({ path: "/api/v1/tasks/TASK-1/move", method: "POST" })
      .reply(200, (options) => {
        captured = { ...options.headers };
        return {
          item: { id: "TASK-1", status: "In Progress" },
          version: 2,
        };
      });

    const { cookie, csrf } = await seedUser("bobby", "ADMIN", "Bobby");
    const response = await inject(
      "/roadmap-task-board/api/v1/tasks/TASK-1/move",
      {
        method: "POST",
        headers: {
          cookie,
          "x-portal-csrf": csrf,
          "content-type": "application/json",
        },
        payload: { status: "In Progress", position: 0, expected_version: 1 },
      },
    );

    expect(response.statusCode).toBe(200);
    expect(captured["x-portal-actor"]).toBe("Bobby");
    const principal = new PrincipalService(
      ctx.config.INTERNAL_PRINCIPAL_SECRET!,
    ).verify(captured["x-portal-principal"] as string);
    expect(principal?.username).toBe("bobby");
  });

  it("requires CSRF for Planning mutations", async () => {
    const { cookie } = await seedUser("bobby", "ADMIN", "Bobby");
    const response = await inject(
      "/roadmap-task-board/api/v1/tasks/TASK-1/transition",
      {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        payload: { status: "Done", expected_version: 1 },
      },
    );
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("CSRF_REQUIRED");
  });

  it("allows USER task moves but denies destructive imports", async () => {
    planningUpstream
      .intercept({ path: "/api/v1/tasks/TASK-2/transition", method: "POST" })
      .reply(200, {
        item: { id: "TASK-2", status: "Validating" },
        version: 3,
      });
    const { cookie, csrf } = await seedUser("stan", "USER", "Stan");
    const moved = await inject(
      "/roadmap-task-board/api/v1/tasks/TASK-2/transition",
      {
        method: "POST",
        headers: {
          cookie,
          "x-portal-csrf": csrf,
          "content-type": "application/json",
        },
        payload: { status: "Validating", expected_version: 2 },
      },
    );
    expect(moved.statusCode).toBe(200);

    const denied = await inject("/roadmap-task-board/api/v1/tasks/import", {
      method: "POST",
      headers: {
        cookie,
        "x-portal-csrf": csrf,
        "content-type": "application/json",
      },
      payload: { items: [], confirm_replace: true },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe("PERMISSION_DENIED");
  });

  it("allows USER task creation and edits while preserving the session actor", async () => {
    const captured: Array<Record<string, unknown>> = [];
    planningUpstream
      .intercept({ path: "/api/v1/tasks", method: "POST" })
      .reply(201, (options) => {
        captured.push({ ...options.headers });
        return { item: { id: "TASK-3", title: "Created" }, version: 1 };
      });
    planningUpstream
      .intercept({ path: "/api/v1/tasks/TASK-3", method: "PATCH" })
      .reply(200, (options) => {
        captured.push({ ...options.headers });
        return { item: { id: "TASK-3", title: "Edited" }, version: 2 };
      });
    const { cookie, csrf } = await seedUser("stan", "USER", "Stan");
    const headers = {
      cookie,
      "x-portal-csrf": csrf,
      "content-type": "application/json",
      "x-portal-actor": "forged-browser-actor",
    };

    const created = await inject("/roadmap-task-board/api/v1/tasks", {
      method: "POST",
      headers,
      payload: { id: "TASK-3", title: "Created" },
    });
    const edited = await inject("/roadmap-task-board/api/v1/tasks/TASK-3", {
      method: "PATCH",
      headers,
      payload: { title: "Edited", expected_version: 1 },
    });

    expect(created.statusCode).toBe(201);
    expect(edited.statusCode).toBe(200);
    expect(captured).toHaveLength(2);
    expect(captured.every((item) => item["x-portal-actor"] === "Stan")).toBe(true);
  });

  it("denies USER task deletion and every Roadmap mutation", async () => {
    const { cookie, csrf } = await seedUser("stan", "USER", "Stan");
    const mutationHeaders = {
      cookie,
      "x-portal-csrf": csrf,
    };
    const deleted = await inject(
      "/roadmap-task-board/api/v1/tasks/TASK-3?expected_version=2",
      { method: "DELETE", headers: mutationHeaders },
    );
    const roadmap = await inject("/roadmap-task-board/api/v1/roadmap", {
      method: "POST",
      headers: { ...mutationHeaders, "content-type": "application/json" },
      payload: { id: "P1", name: "Restricted", start: 1, end: 2 },
    });

    for (const response of [deleted, roadmap]) {
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("PERMISSION_DENIED");
    }
  });

  it("allows ADMIN snapshot initialization and rejects foreign origins", async () => {
    planningUpstream
      .intercept({ path: "/api/v1/tasks/import", method: "POST" })
      .reply(200, { items: [] });
    const { cookie, csrf } = await seedUser("bobby", "ADMIN", "Bobby");
    const allowed = await inject("/roadmap-task-board/api/v1/tasks/import", {
      method: "POST",
      headers: {
        cookie,
        "x-portal-csrf": csrf,
        "content-type": "application/json",
      },
      payload: { items: [], confirm_replace: true },
    });
    expect(allowed.statusCode).toBe(200);

    const denied = await inject("/roadmap-task-board/api/v1/tasks/import", {
      method: "POST",
      headers: {
        cookie,
        "x-portal-csrf": csrf,
        "content-type": "application/json",
        origin: "https://attacker.example",
      },
      payload: { items: [], confirm_replace: true },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe("ORIGIN_DENIED");
  });

  it("proxies read-only portal metadata with parity and freshness passthrough", async () => {
    upstream
      .intercept({ path: "/api/v1/portal/summary", method: "GET" })
      .reply(200, {
        schema_version: "portal.summary.v1",
        overall_availability: {
          state: "degraded",
          checked_at: "2026-08-15T18:00:00Z",
          as_of: "2026-08-15T17:59:30Z",
        },
      });

    const { cookie } = await seedUser("bobby", "ADMIN");
    const response = await inject("/api/v1/portal/summary", {
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().overall_availability.checked_at).toBe(
      "2026-08-15T18:00:00Z",
    );
    expect(response.json().overall_availability.as_of).toBe(
      "2026-08-15T17:59:30Z",
    );
  });

  it("signs the downstream principal header on proxied requests", async () => {
    let captured: Record<string, unknown> = {};
    upstream
      .intercept({ path: "/api/strategies", method: "GET" })
      .reply(200, (options) => {
        captured = { ...options.headers };
        return { strategies: [] };
      });

    const { cookie } = await seedUser("bobby", "ADMIN");
    const response = await inject("/api/strategies", { headers: { cookie } });
    expect(response.statusCode).toBe(200);

    const principalToken = captured["x-portal-principal"] as string;
    const verified = new PrincipalService(
      ctx.config.INTERNAL_PRINCIPAL_SECRET!,
    ).verify(principalToken);
    expect(verified).not.toBeNull();
    expect(verified!.username).toBe("bobby");
    expect(verified!.role).toBe("ADMIN");
  });

  it("lets any authenticated USER read runs through the proxy (cross-user)", async () => {
    upstream
      .intercept({ path: "/api/runs", method: "GET" })
      .reply(200, { runs: [{ run_id: "run_cross", status: "COMPLETED" }] });
    const { cookie } = await seedUser("stan", "USER");
    const response = await inject("/api/runs", { headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json().runs[0].run_id).toBe("run_cross");
  });

  it("denies USER sessions from writing runs (config) through the proxy", async () => {
    const { cookie } = await seedUser("stan", "USER");
    const response = await inject("/api/runs", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      payload: {},
    });
    expect(response.statusCode).toBe(403);
  });

  it("proxies read-only catalogs for USER sessions", async () => {
    const upstreamPaths = [
      "/api/v1/alphas",
      "/api/v1/portal/capabilities",
      "/api/config/options",
    ];
    for (const path of upstreamPaths) {
      upstream.intercept({ path, method: "GET" }).reply(200, { path });
    }
    const { cookie } = await seedUser("stan", "USER");
    for (const path of upstreamPaths) {
      const response = await inject(path, { headers: { cookie } });
      expect(response.statusCode).toBe(200);
    }
  });

  it("keeps alpha import mutation ADMIN-only through the proxy", async () => {
    upstream
      .intercept({ path: "/api/v1/alphas/import", method: "POST" })
      .reply(201, { state: "QUARANTINED" });
    const user = await seedUser("stan", "USER");
    const denied = await inject("/api/v1/alphas/import", {
      method: "POST",
      headers: { cookie: user.cookie },
      payload: {},
    });
    expect(denied.statusCode).toBe(403);
    const admin = await seedUser("bobby", "ADMIN");
    const allowed = await inject("/api/v1/alphas/import", {
      method: "POST",
      headers: { cookie: admin.cookie },
      payload: {},
    });
    expect(allowed.statusCode).toBe(201);
  });

  it("serves workspace run read models with cross-workspace isolation", async () => {
    const bobby = await seedUser("bobby", "ADMIN");
    const stan = await seedUser("stan", "USER");

    const bobbyWorkspaces = await inject("/api/workspaces", {
      headers: { cookie: bobby.cookie },
    });
    expect(bobbyWorkspaces.statusCode).toBe(200);
    const bobbyWorkspaceId = bobbyWorkspaces.json().workspaces[0].workspace_id;
    expect(bobbyWorkspaceId).toMatch(/^ws_[0-9A-HJKMNP-TV-Z]{26}$/);

    const stanWorkspaces = await inject("/api/workspaces", {
      headers: { cookie: stan.cookie },
    });
    const stanWorkspaceId = stanWorkspaces.json().workspaces[0].workspace_id;
    expect(stanWorkspaceId).not.toBe(bobbyWorkspaceId);

    const denied = await inject(`/api/workspaces/${bobbyWorkspaceId}/runs`, {
      headers: { cookie: stan.cookie },
    });
    expect(denied.statusCode).toBe(404);
  });

  it("records outbox/audit/read-model on proxied writes and replays idempotently", async () => {
    let upstreamPosts = 0;
    upstream
      .intercept({ path: "/api/runs", method: "POST" })
      .reply(202, () => {
        upstreamPosts += 1;
        return { run_id: "run_0123456789abcdef", status: "QUEUED" };
      });

    const { cookie } = await seedUser("bobby", "ADMIN");
    const payload = {
      strategy_id: "delta-rsi-polynomial-alpha",
      dataset_id: "eth-1d",
      symbol: "ETHUSDT",
      timeframe: "1d",
      protocol: "three_window_decay",
    };
    const first = await inject("/api/runs", {
      method: "POST",
      headers: { cookie, "x-portal-idempotency-key": "create-run-1" },
      payload,
    });
    expect(first.statusCode).toBe(202);
    expect(first.json().run_id).toBe("run_0123456789abcdef");

    const replay = await inject("/api/runs", {
      method: "POST",
      headers: { cookie, "x-portal-idempotency-key": "create-run-1" },
      payload,
    });
    expect(replay.statusCode).toBe(202);
    expect(replay.json().run_id).toBe("run_0123456789abcdef");
    expect(upstreamPosts).toBe(1);

    const conflict = await inject("/api/runs", {
      method: "POST",
      headers: { cookie, "x-portal-idempotency-key": "create-run-1" },
      payload: { ...payload, symbol: "BTCUSDT" },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe("IDEMPOTENCY_KEY_REUSE");
    expect(upstreamPosts).toBe(1);

    const outboxRows = await ctx.pool.query(
      `SELECT idempotency_key, state, response_status, actor_user_id, workspace_id
       FROM outbox_messages`,
    );
    expect(outboxRows.rows).toHaveLength(1);
    expect(outboxRows.rows[0].state).toBe("PUBLISHED");
    expect(outboxRows.rows[0].actor_user_id).not.toBeNull();
    expect(outboxRows.rows[0].workspace_id).toMatch(/^ws_/);

    const auditRows = await ctx.pool.query(
      `SELECT event_type, result FROM product_audit_events ORDER BY occurred_at`,
    );
    const types = auditRows.rows.map((r: { event_type: string }) => r.event_type);
    expect(types).toContain("run.command.v1");
    expect(types).toContain("command_replayed");
    expect(types).toContain("command_conflict");

    const runRows = await ctx.pool.query(`SELECT * FROM run_read_models`);
    expect(runRows.rows).toHaveLength(1);
    expect(runRows.rows[0].run_id).toBe("run_0123456789abcdef");
  });

  it("rolls back cleanly when the proxy feature flag is disabled", async () => {
    const { cookie } = await seedUser("bobby", "ADMIN");
    const offConfig = testConfig({
      AUTH_MODE: "dev",
      PORTAL_API_BASE_URL: "http://portal-api:8000",
      FEATURE_PROXY_PORTAL: "false",
    });
    const off = await createControlApiApp(offConfig, getPool());
    try {
      const response = await off.getHttpAdapter().getInstance().inject({
        method: "GET",
        url: "/api/v1/portal/registry",
        headers: { cookie, "x-dev-access-email": "bobby@azdag.com" },
      });
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("FAÇADE_PROXY_DISABLED");
    } finally {
      await off.close();
    }
  });
});
