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
  assertPortalRunSsePath,
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

  it("accepts only a canonical bounded run-event path", () => {
    expect(() => assertPortalRunSsePath("/api/runs/run_01/events")).not.toThrow();
    for (const path of [
      "/api/runs/run.01/events",
      "/api/runs/%2e%2e/events",
      "/api/runs/run%2F01/events",
      "/api/runs//events",
      `/api/runs/${"r".repeat(129)}/events`,
    ]) {
      expect(() => assertPortalRunSsePath(path)).toThrowError(/run event path is invalid/);
    }
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
    /*
     * A browser attaches `Origin` to every non-GET request, so the harness
     * does too — otherwise these tests would exercise a shape no real client
     * produces, and the facade's new Origin check would look like a break.
     *
     * A test that wants the header genuinely ABSENT passes `origin: ""`, which
     * the server reads as missing. That is the non-browser caller
     * `mutationSecurityDenial` exists to refuse, and it is worth testing
     * precisely because `originAllowed` on its own answers `true` for it.
     */
    const method = String(options.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD" && !("origin" in headers)) {
      headers.origin = ctx.config.PORTAL_PUBLIC_ORIGIN;
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
    // A4-1: the shared decision names the stage it refused at. The previous
    // hand-copy in this controller called `originAllowed` bare — which passes
    // a request with NO Origin header — and never compared the header to the
    // cookie at all.
    expect(response.json().error.code).toBe("CSRF_MISSING");
  });

  it("refuses a Planning mutation that carries no Origin at all", async () => {
    // The bypass the drifted copy left open: `originAllowed` returns true for
    // an absent header, so a non-browser caller skipped the origin gate
    // entirely.
    const { cookie, csrf } = await seedUser("bobby", "ADMIN", "Bobby");
    const response = await inject(
      "/roadmap-task-board/api/v1/tasks/TASK-1/transition",
      {
        method: "POST",
        headers: {
          cookie,
          origin: "",
          "x-portal-csrf": csrf,
          "content-type": "application/json",
        },
        payload: { status: "Done", expected_version: 1 },
      },
    );
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("ORIGIN_MISSING");
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

  it("authenticates and streams QuantBT run events without changing SSE headers", async () => {
    let captured: Record<string, unknown> = {};
    upstream
      .intercept({ path: "/api/runs/run_01/events", method: "GET" })
      .reply(
        200,
        (options) => {
          captured = { ...options.headers };
          return 'data: {"state":"RUNNING"}\n\ndata: {"final":true,"state":"COMPLETED"}\n\n';
        },
        {
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-cache",
            "x-accel-buffering": "no",
          },
        },
      );

    const { cookie } = await seedUser("bobby", "ADMIN");
    const response = await inject("/api/runs/run_01/events", {
      headers: { cookie, "x-request-id": "req-u10-sse" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.headers["cache-control"]).toBe("no-cache");
    expect(response.headers["x-accel-buffering"]).toBe("no");
    expect(response.headers["x-request-id"]).toBe("req-u10-sse");
    expect(response.body).toContain('"state":"RUNNING"');
    expect(response.body).toContain('"final":true');
    expect(captured.accept).toBe("text/event-stream");
    expect(captured["x-request-id"]).toBe("req-u10-sse");
    const principal = new PrincipalService(
      ctx.config.INTERNAL_PRINCIPAL_SECRET!,
    ).verify(captured["x-portal-principal"] as string);
    expect(principal?.username).toBe("bobby");
  });

  it("does not expose the run-event stream without a Portal session", async () => {
    const response = await inject("/api/runs/run_01/events");
    expect(response.statusCode).toBe(401);
  });

  it("fails closed when the run-event upstream is not an SSE response", async () => {
    upstream
      .intercept({ path: "/api/runs/run_invalid/events", method: "GET" })
      .reply(200, { state: "RUNNING" }, { headers: { "content-type": "application/json" } });
    const { cookie } = await seedUser("bobby", "ADMIN");
    const response = await inject("/api/runs/run_invalid/events", { headers: { cookie } });
    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe("SSE_UPSTREAM_INVALID_RESPONSE");
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

  it("scopes legacy export to the selected workspace and rejects encoded aliases", async () => {
    const owner = await seedUser("bobby", "ADMIN");
    expect((await inject("/api/workspaces", { headers: { cookie: owner.cookie } })).statusCode).toBe(200);
    const workspace = await ctx.pool.query<{ workspace_id: string }>(
      "SELECT workspace_id FROM workspaces WHERE owner_user_id = $1",
      [owner.userId],
    );
    const workspaceId = workspace.rows[0]!.workspace_id;
    await ctx.pool.query(
      `INSERT INTO run_read_models (run_id, workspace_id, owner_user_id, status)
       VALUES ($1, $2, $3, $4)`,
      ["run_export_owned", workspaceId, owner.userId, "COMPLETED"],
    );
    const other = await seedUser("stan", "USER");
    expect((await inject("/api/workspaces", { headers: { cookie: other.cookie } })).statusCode).toBe(200);
    const otherWorkspace = await ctx.pool.query<{ workspace_id: string }>(
      "SELECT workspace_id FROM workspaces WHERE owner_user_id = $1",
      [other.userId],
    );
    await ctx.pool.query(
      `INSERT INTO run_read_models (run_id, workspace_id, owner_user_id, status)
       VALUES ($1, $2, $3, $4)`,
      ["run_export_foreign_owner", otherWorkspace.rows[0]!.workspace_id, owner.userId, "COMPLETED"],
    );
    const nonOwner = await inject("/api/runs/run_export_foreign_owner/export", {
      headers: { cookie: other.cookie },
    });
    expect(nonOwner.statusCode).toBe(403);
    expect(nonOwner.json().error.code).toBe("PERMISSION_DENIED");
    const path = "/api/runs/run_export_owned/export";
    expect((await inject(path)).statusCode).toBe(401);
    const denied = await inject(path, { headers: { cookie: other.cookie } });
    expect(denied.statusCode).toBe(404);
    expect(denied.json().error.code).toBe("RUN_NOT_FOUND");
    const alias = await inject("/api/runs/run_export_owned/%65xport", {
      headers: { cookie: owner.cookie },
    });
    expect(alias.statusCode).toBe(400);
    const crossWrite = await inject(path, { method: "POST", headers: {
      cookie: other.cookie, "x-portal-csrf": other.csrf,
    } });
    expect(crossWrite.statusCode).toBe(404);
    const noCsrf = await inject(path, { method: "POST", headers: { cookie: owner.cookie } });
    expect(noCsrf.statusCode).toBe(403);
    upstream.intercept({ path, method: "POST" }).reply(201, { download_href: path });
    const prepared = await inject(path, { method: "POST", headers: {
      cookie: owner.cookie, "x-portal-csrf": owner.csrf,
    } });
    expect(prepared.statusCode).toBe(201);
    expect(prepared.json().download_href).toBe(path);
    upstream.intercept({ path, method: "GET" }).reply(
      200,
      "prepared archive",
      { headers: { "content-type": "application/zip" } },
    );
    const allowed = await inject(path, { headers: { cookie: owner.cookie } });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.body).toBe("prepared archive");
  });

  it("denies USER sessions from writing runs (config) through the proxy", async () => {
    const { cookie } = await seedUser("stan", "USER");
    const response = await inject("/api/runs", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      payload: {},
    });
    expect(response.statusCode).toBe(403);
    // The CODE, not just the status: once the facade also enforces CSRF, a
    // bare 403 no longer distinguishes "your role may not" from "you forgot a
    // header", and this test would keep passing with the ADMIN-only rule
    // deleted.
    expect(response.json().error.code).toBe("PERMISSION_DENIED");
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
    expect(denied.json().error.code).toBe("PERMISSION_DENIED");
    const admin = await seedUser("bobby", "ADMIN");
    const allowed = await inject("/api/v1/alphas/import", {
      method: "POST",
      headers: {
        cookie: admin.cookie,
        // A4-FE-BE-GAP-01: the facade write path now requires the same proof
        // every other Portal mutation does. Being ADMIN answers "may this
        // person write"; these answer "did this person ask".
        origin: ctx.config.PORTAL_PUBLIC_ORIGIN,
        "x-portal-csrf": admin.csrf,
      },
      payload: {},
    });
    expect(allowed.statusCode).toBe(201);
  });

  describe("A4-FE-BE-GAP-01 · the facade write path proves intent, not just role", () => {
    /*
     * The hole this closes was not theoretical. `SameSite=Lax` stops a
     * cross-SITE post, but SameSite is scoped to the site rather than the
     * origin, and `dev-portal.primusspark.com` shares a registrable domain
     * with production while carrying no Access policy — so a page there sends
     * the session cookie to production. Three of the four upstream writes then
     * die on content type; `POST /api/runs/{id}/cancel` declares no body, so
     * it does not, and a plain `enctype="text/plain"` form cancelled a running
     * backtest.
     */
    /*
     * Counts what actually reached upstream, not just what the caller was
     * told.
     *
     * A denial test that asserts only `403` proves nothing about whether the
     * write happened: move the gate BELOW `proxyService.handleWrite` and every
     * such test stays green while `run_x` is genuinely cancelled, an
     * `outbox_messages` row is written and the caller still sees 403. The harm
     * this block exists to prevent would be fully reinstated by a refactor
     * with a green suite. So the assertion is the upstream counter.
     */
    let upstreamCancels = 0;

    const adminWrite = async (headers: Record<string, string>) => {
      upstreamCancels = 0;
      upstream
        .intercept({ path: "/api/runs/run_x/cancel", method: "POST" })
        .reply(200, () => {
          upstreamCancels += 1;
          return { run_id: "run_x", status: "CANCELLING" };
        })
        .persist();
      const response = await inject("/api/runs/run_x/cancel", {
        method: "POST",
        headers,
      });
      return {
        status: response.statusCode,
        code: response.json()?.error?.code as string | undefined,
        reachedUpstream: upstreamCancels,
      };
    };

    it("admits the write that carries an allowed Origin and a matching CSRF pair", async () => {
      const admin = await seedUser("bobby", "ADMIN");
      const result = await adminWrite({
        cookie: admin.cookie,
        origin: ctx.config.PORTAL_PUBLIC_ORIGIN,
        "x-portal-csrf": admin.csrf,
      });
      expect(result.status).toBe(200);
      expect(result.reachedUpstream).toBe(1);
    });

    it("refuses the same-site form that a page on dev-portal could actually send", async () => {
      /*
       * The attack, spelled exactly. A cross-origin form DOES send an Origin —
       * its own — and CANNOT send a header, because HTML forms have no way to
       * set one. The browser attaches the session cookie by itself because
       * dev-portal shares a registrable domain with production. Before this
       * change that was a 200 and a cancelled backtest.
       */
      const admin = await seedUser("bobby", "ADMIN");
      const result = await adminWrite({
        cookie: admin.cookie,
        origin: "https://dev-portal.primusspark.com",
      });
      expect(result.status).toBe(403);
      expect(result.code).toBe("ORIGIN_DENIED");
      expect(result.reachedUpstream).toBe(0);
    });

    it("refuses a missing Origin rather than reading it as consent", async () => {
      // `originAllowed` on its own returns true for an absent header — the
      // trap `mutationSecurityDenial` exists to close for non-browser callers.
      const admin = await seedUser("bobby", "ADMIN");
      const result = await adminWrite({
        cookie: admin.cookie,
        origin: "",
        "x-portal-csrf": admin.csrf,
      });
      expect(result.status).toBe(403);
      expect(result.code).toBe("ORIGIN_MISSING");
      expect(result.reachedUpstream).toBe(0);
    });

    it("refuses a CSRF header that does not match the session", async () => {
      const admin = await seedUser("bobby", "ADMIN");
      const result = await adminWrite({
        cookie: admin.cookie,
        origin: ctx.config.PORTAL_PUBLIC_ORIGIN,
        "x-portal-csrf": "not-the-token",
      });
      expect(result.status).toBe(403);
      expect(result.code).toBe("CSRF_INVALID");
      expect(result.reachedUpstream).toBe(0);
    });

    it("refuses a write with no CSRF header at all", async () => {
      const admin = await seedUser("bobby", "ADMIN");
      const result = await adminWrite({
        cookie: admin.cookie,
        origin: ctx.config.PORTAL_PUBLIC_ORIGIN,
      });
      expect(result.status).toBe(403);
      expect(result.code).toBe("CSRF_MISSING");
      expect(result.reachedUpstream).toBe(0);
    });

    it("checks role BEFORE mutation security, so the error is not an oracle", async () => {
      /*
       * A USER with a DELIBERATELY WRONG CSRF token. If the two checks were
       * swapped, this would answer CSRF_INVALID — telling a prober that their
       * role would otherwise have been accepted. The assertion is the code,
       * not the status: both orderings return 403.
       */
      const stan = await seedUser("stan", "USER");
      const result = await adminWrite({
        cookie: stan.cookie,
        origin: ctx.config.PORTAL_PUBLIC_ORIGIN,
        "x-portal-csrf": "not-the-token",
      });
      expect(result.status).toBe(403);
      expect(result.code).toBe("PERMISSION_DENIED");
      expect(result.reachedUpstream).toBe(0);
    });

    it("gates DELETE the same way it gates POST", async () => {
      // The route list accepts all four write verbs; only POST had coverage,
      // so a gate that checked the method wrongly would have gone unnoticed.
      const admin = await seedUser("bobby", "ADMIN");
      const response = await inject("/api/v1/alphas/av_1", {
        method: "DELETE",
        headers: {
          cookie: admin.cookie,
          origin: "https://dev-portal.primusspark.com",
        },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("ORIGIN_DENIED");
    });
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

    const { cookie, csrf } = await seedUser("bobby", "ADMIN");
    const payload = {
      strategy_id: "delta-rsi-polynomial-alpha",
      dataset_id: "eth-1d",
      symbol: "ETHUSDT",
      timeframe: "1d",
      protocol: "three_window_decay",
    };
    const first = await inject("/api/runs", {
      method: "POST",
      headers: {
        cookie,
        "x-portal-csrf": csrf,
        "x-portal-idempotency-key": "create-run-1",
      },
      payload,
    });
    expect(first.statusCode).toBe(202);
    expect(first.json().run_id).toBe("run_0123456789abcdef");

    const replay = await inject("/api/runs", {
      method: "POST",
      headers: {
        cookie,
        "x-portal-csrf": csrf,
        "x-portal-idempotency-key": "create-run-1",
      },
      payload,
    });
    expect(replay.statusCode).toBe(202);
    expect(replay.json().run_id).toBe("run_0123456789abcdef");
    expect(upstreamPosts).toBe(1);

    const conflict = await inject("/api/runs", {
      method: "POST",
      headers: {
        cookie,
        "x-portal-csrf": csrf,
        "x-portal-idempotency-key": "create-run-1",
      },
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
