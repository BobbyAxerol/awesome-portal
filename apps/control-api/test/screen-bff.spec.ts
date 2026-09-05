import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AdminService } from "../src/admin/admin.service";
import { Argon2CredentialService } from "../src/auth/argon";
import { AuthService } from "../src/auth/auth.service";
import { SCREEN_BFF_CATALOGUE } from "../src/screen-bff/catalogue";
import { SCREEN_BFF_UI_STATES } from "../src/screen-bff/contracts";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const DATABASE_URL = process.env.TEST_DATABASE_URL ??
  "postgres://portal:portal@127.0.0.1:5432/portal_control_test";

interface Actor { userId: string; username: string; cookie: string }

function cookies(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers["set-cookie"];
  return (Array.isArray(raw) ? raw : [raw])
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.split(";")[0]).join("; ");
}

function csrfCookie(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers["set-cookie"];
  const value = (Array.isArray(raw) ? raw : [raw]).find(
    (item): item is string => typeof item === "string" && item.startsWith("__Host-portal_csrf="),
  );
  if (!value) throw new Error("csrf cookie missing");
  return value.split(";")[0].split("=")[1];
}

describe("N20 canonical screen BFF catalogue", () => {
  it("covers the frozen E3 inventory plus the two classified BR-EX-72 list surfaces", () => {
    expect(SCREEN_BFF_CATALOGUE).toHaveLength(25);
    expect(new Set(SCREEN_BFF_CATALOGUE.map((item) => item.screenId)).size).toBe(25);
    expect(new Set(SCREEN_BFF_CATALOGUE.map((item) => item.dataApi.operationId)).size).toBe(25);
    const commissioned = new Set(
      SCREEN_BFF_CATALOGUE.flatMap((item) => item.requestIds)
        .filter((requestId) => /^BR-EX-(?:4[1-9]|5[0-9]|6[0-9]|7[0-2])$/.test(requestId)),
    );
    expect([...commissioned].sort()).toEqual(
      Array.from({ length: 32 }, (_, index) => `BR-EX-${index + 41}`),
    );
    expect(SCREEN_BFF_CATALOGUE.map((item) => item.screenId)).toEqual(
      expect.arrayContaining([
        "EXECUTION_NEW_APPROVAL_REQUEST_SCREEN",
        "EXECUTION_GATE_LIVE_REVIEW_SCREEN",
        "EXECUTION_WAIVERS_REGISTER_SCREEN",
        "EXECUTION_ALPHA_FLEET_LIST_SCREEN",
        "EXECUTION_ACCOUNTS_BINDINGS_LIST_SCREEN",
      ]),
    );
    const sandbox = SCREEN_BFF_CATALOGUE.find(
      (item) => item.screenId === "EXECUTION_SANDBOX_CERTIFICATION_SCREEN",
    );
    expect(sandbox?.requestIds).toEqual(
      expect.arrayContaining(["BR-EX-55", "BR-EX-58", "BR-EX-60", "BR-EX-61"]),
    );
    expect(sandbox?.readCapabilities).toEqual(
      expect.arrayContaining(["portal.entity-names", "portal.blocker-catalog"]),
    );
  });

  it("pins the exact request mapping for every commissioned screen", () => {
    const expected: Record<string, readonly string[]> = {
      PAPER_TRADING_SCREEN: ["BR-EX-41", "BR-EX-55"],
      SANDBOX_TRADING_SCREEN: ["BR-EX-60", "BR-EX-55"],
      LIVE_OPERATIONS_SCREEN: ["BR-EX-56", "BR-EX-55"],
      EXECUTION_COMMAND_CENTER_SCREEN: ["BR-EX-42", "BR-EX-43", "BR-EX-44", "BR-EX-45", "BR-EX-55"],
      EXECUTION_OPERATIONS_QUEUE_SCREEN: ["BR-EX-47", "BR-EX-55"],
      EXECUTION_INCIDENT_DETAIL_SCREEN: ["BR-EX-46", "BR-EX-55"],
      EXECUTION_APPROVAL_INBOX_SCREEN: ["BR-EX-35", "BR-EX-55"],
      EXECUTION_GATE_R1_REVIEW_SCREEN: ["BR-EX-67", "BR-EX-55"],
      EXECUTION_GATE_R2_REVIEW_SCREEN: ["BR-EX-67", "BR-EX-55"],
      EXECUTION_PAPER_EXIT_REVIEW_SCREEN: ["BR-EX-63", "BR-EX-55"],
      EXECUTION_PAPER_WORKBENCH_SCREEN: ["BR-EX-62", "BR-EX-55", "BR-EX-58"],
      EXECUTION_PAPER_WORKBENCH_VNM_SCREEN: ["BR-EX-62", "BR-EX-55", "BR-EX-58"],
      EXECUTION_SANDBOX_CERTIFICATION_SCREEN: ["BR-EX-60", "BR-EX-61", "BR-EX-55", "BR-EX-58"],
      EXECUTION_CANARY_CONTROL_ROOM_SCREEN: ["BR-EX-59", "BR-EX-55", "BR-EX-58"],
      EXECUTION_LIVE_FULL_OPERATIONS_SCREEN: ["BR-EX-57", "BR-EX-55", "BR-EX-58"],
      EXECUTION_FULL_BLOTTER_SCREEN: ["BR-EX-48", "BR-EX-55"],
      EXECUTION_ALPHA_FLEET_LIST_SCREEN: ["BR-EX-72", "BR-EX-55"],
      EXECUTION_ALPHA_360_SCREEN: ["BR-EX-49", "BR-EX-50", "BR-EX-64", "BR-EX-55"],
      EXECUTION_PORTFOLIO_360_SCREEN: ["BR-EX-51", "BR-EX-65", "BR-EX-66", "BR-EX-55"],
      EXECUTION_ACCOUNTS_BINDINGS_LIST_SCREEN: ["BR-EX-72", "BR-EX-55"],
      EXECUTION_ACCOUNT_BROKER_360_SCREEN: ["BR-EX-52", "BR-EX-53", "BR-EX-54", "BR-EX-55"],
      EXECUTION_ADMIN_ACTION_DRAWER_SCREEN: ["BR-EX-68", "BR-EX-55"],
      EXECUTION_NEW_APPROVAL_REQUEST_SCREEN: ["BR-EX-69", "BR-EX-55"],
      EXECUTION_GATE_LIVE_REVIEW_SCREEN: ["BR-EX-70", "BR-EX-55"],
      EXECUTION_WAIVERS_REGISTER_SCREEN: ["BR-EX-71", "BR-EX-55"],
    };
    expect(Object.fromEntries(SCREEN_BFF_CATALOGUE.map((item) => [item.screenId, item.requestIds]))).toEqual(expected);
  });

  it("publishes only narrow versioned paths and never raw Manager selectors", () => {
    const identifier = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,190}$/;
    for (const item of SCREEN_BFF_CATALOGUE) {
      expect(item.dataApi.pathTemplate).toMatch(/^\/api\/v1\/execution\//);
      expect(item.dataApi.responseContract).toMatch(/\.v[12]$/);
      expect(item.dataApi.operationId).toMatch(identifier);
      expect(item.dataApi.responseContract).toMatch(identifier);
      expect(item.dataApi.deliveryPhase).toMatch(identifier);
      expect(item.requestIds.length).toBeGreaterThan(0);
      expect(item.requestIds.every((requestId) => /^BR-EX-[0-9]{2}$/.test(requestId))).toBe(true);
      expect(item.authorities.length).toBeGreaterThan(0);
      expect(item.readCapabilities.length).toBeGreaterThan(0);
      expect(item.readCapabilities.every((capability) => identifier.test(capability))).toBe(true);
    }
    expect(JSON.stringify(SCREEN_BFF_CATALOGUE)).not.toMatch(
      /public\.|information_schema|pg_catalog|redis:|postgres:|\/internal\/v2\/manager\/relations/i,
    );
    expect(SCREEN_BFF_UI_STATES).toEqual([
      "ready", "empty", "stale", "partial", "denied", "unavailable", "error",
    ]);
  });
});

describe("N20 session, RBAC, workspace and resource boundary", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let auth: AuthService;
  let adminService: AdminService;
  let admin: Actor;
  let reader: Actor;
  let workspaceId: string;

  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL);
    ctx = await setupApp({ AUTH_MODE: "dev" });
    auth = new AuthService(ctx.pool, ctx.config, new Argon2CredentialService({
      memoryKib: ctx.config.ARGON2_MEMORY_KIB,
      iterations: ctx.config.ARGON2_ITERATIONS,
      parallelism: ctx.config.ARGON2_PARALLELISM,
    }));
    adminService = new AdminService(ctx.pool, ctx.config, auth);
    admin = await createActor("n20-bobby", "ADMIN");
    reader = await createActor("n20-reader", "USER");
    const workspaces = await inject(admin, "/api/workspaces");
    workspaceId = workspaces.json().workspaces[0].workspace_id;
    await ctx.pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'MEMBER')`,
      [workspaceId, reader.userId],
    );
  }, 30_000);

  afterAll(async () => teardownApp(ctx));

  async function rawInject(url: string, options: Record<string, unknown> = {}) {
    const headers = { ...((options.headers as Record<string, string>) ?? {}) };
    if (!("x-dev-access-email" in headers)) headers["x-dev-access-email"] = "dev@azdag.com";
    return ctx.app.getHttpAdapter().getInstance().inject({ method: "GET", url, ...options, headers });
  }

  async function inject(actor: Actor, url: string, options: Record<string, unknown> = {}) {
    return rawInject(url, {
      ...options,
      headers: {
        cookie: actor.cookie,
        "x-dev-access-email": `${actor.username}@azdag.com`,
        ...((options.headers as Record<string, string>) ?? {}),
      },
    });
  }

  async function createActor(username: string, role: "ADMIN" | "USER"): Promise<Actor> {
    await adminService.createUser({ username, displayName: username, role });
    const portalUser = await auth.users.findByUsername(username);
    const { activationToken } = await adminService.resetCredential(portalUser!.userId);
    const activated = await rawInject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": `${username}@azdag.com` },
      payload: { username, credential: activationToken },
    });
    const password = `Cobalt-River-${username}-N20!`;
    expect((await rawInject("/api/auth/change-password", {
      method: "POST",
      headers: {
        cookie: cookies(activated),
        "x-portal-csrf": csrfCookie(activated),
        "x-dev-access-email": `${username}@azdag.com`,
      },
      payload: { current_password: activationToken, new_password: password },
    })).statusCode).toBe(201);
    const loggedIn = await rawInject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": `${username}@azdag.com` },
      payload: { username, credential: password },
    });
    return { userId: portalUser!.userId, username, cookie: cookies(loggedIn) };
  }

  it("requires an active session and hides foreign workspaces", async () => {
    expect((await rawInject("/api/v1/execution/screen-contracts")).statusCode).toBe(401);
    const otherWorkspace = "ws_n20_foreign";
    await ctx.pool.query(
      `INSERT INTO workspaces (workspace_id, name, owner_user_id) VALUES ($1, 'Foreign', $2)`,
      [otherWorkspace, reader.userId],
    );
    await ctx.pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'OWNER')`,
      [otherWorkspace, reader.userId],
    );
    const denied = await inject(admin, `/api/v1/execution/screen-contracts?workspace_id=${otherWorkspace}`);
    expect(denied.statusCode).toBe(404);
    expect(denied.json().error.code).toBe("WORKSPACE_NOT_FOUND");
  });

  it("publishes the EDS-02 metadata authority only to an authenticated workspace member", async () => {
    expect((await rawInject("/api/v1/execution/contract-authority", { headers: {} })).statusCode).toBe(401);
    const response = await inject(admin, `/api/v1/execution/contract-authority?workspace_id=${workspaceId}`);
    expect(response.statusCode).toBe(200);
    const document = response.json();
    expect(document).toMatchObject({
      schema_version: "portal.execution.contract-authority.v1",
      workspace_id: workspaceId,
      generated_digests: { composite: expect.stringMatching(/^sha256:[a-f0-9]{64}$/) },
      redaction: { raw_source_relation: false, source_cursor: false, semantic_action_contains_url: false },
    });
    expect(document.screen_data_manifest.screen_count).toBe(25);
    expect(Buffer.byteLength(response.body, "utf8")).toBeLessThan(256 * 1024);
  });

  it("returns an exact role-filtered catalogue and enforces screen RBAC", async () => {
    const adminCatalogue = await inject(admin, `/api/v1/execution/screen-contracts?workspace_id=${workspaceId}`);
    expect(adminCatalogue.statusCode).toBe(200);
    expect(adminCatalogue.json()).toMatchObject({ exact_total: true, total_count: 25 });
    expect(Buffer.byteLength(adminCatalogue.body, "utf8")).toBeLessThan(96 * 1024);

    const readerCatalogue = await inject(reader, `/api/v1/execution/screen-contracts?workspace_id=${workspaceId}`);
    expect(readerCatalogue.statusCode).toBe(200);
    expect(readerCatalogue.json()).toMatchObject({ exact_total: true, total_count: 24 });
    expect(readerCatalogue.json().screens.some(
      (item: { screen_id: string }) => item.screen_id === "EXECUTION_ADMIN_ACTION_DRAWER_SCREEN",
    )).toBe(false);
    const denied = await inject(reader,
      `/api/v1/execution/screen-contracts/EXECUTION_ADMIN_ACTION_DRAWER_SCREEN?workspace_id=${workspaceId}`,
    );
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe("N20_SCREEN_ACCESS_DENIED");
  });

  it("binds resource screens and advertises the commissioned Phase 2 Account BFF", async () => {
    const missing = await inject(admin,
      `/api/v1/execution/screen-contracts/EXECUTION_ALPHA_360_SCREEN?workspace_id=${workspaceId}`,
    );
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.code).toBe("N20_RESOURCE_REQUIRED");

    const account = await inject(admin,
      `/api/v1/execution/screen-contracts/EXECUTION_ACCOUNT_BROKER_360_SCREEN?workspace_id=${workspaceId}&resource_id=account_42`,
    );
    expect(account.statusCode).toBe(200);
    expect(account.json()).toMatchObject({
      resource: { kind: "ACCOUNT", id: "account_42" },
      screen: { data_api: { status: "AVAILABLE", delivery_phase: "PHASE_2" } },
      delivery: { state: "ready", payload: null, retryable: false },
    });

    const ready = await inject(admin,
      `/api/v1/execution/screen-contracts/EXECUTION_COMMAND_CENTER_SCREEN?workspace_id=${workspaceId}`,
    );
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({
      resource: { kind: "WORKSPACE", id: null },
      screen: { data_api: { status: "AVAILABLE", operation_id: "executionCommandCenterSnapshot" } },
      delivery: { state: "ready", payload: null, reason_code: null },
    });
    expect(ready.json().screen.supported_ui_states).toEqual([
      "ready", "empty", "stale", "partial", "denied", "unavailable", "error",
    ]);
  });

  it("retires both raw Manager browser routes with a typed non-retryable response", async () => {
    for (const path of [
      "/api/v1/execution/current-source/paper/screens/PAPER_TRADING_SCREEN",
      "/api/v1/execution/current-source/paper/screens/PAPER_TRADING_SCREEN/sources/manager.positions/relations/positions_v2?limit=10",
    ]) {
      const response = await inject(admin, path);
      expect(response.statusCode).toBe(410);
      expect(response.json()).toMatchObject({
        error: { code: "N20_RAW_SOURCE_BROWSER_FORBIDDEN" },
        details: {
          availability: "UNAVAILABLE",
          reason_code: "USE_CANONICAL_SCREEN_BFF",
          retryable: false,
        },
      });
    }
  });

  it("guards N22 Paper product routes and degrades honestly while the source profile is dark", async () => {
    expect((await rawInject("/api/v1/execution/screens/paper")).statusCode).toBe(401);
    const foreignWorkspace = "ws_n22_foreign";
    await ctx.pool.query(
      `INSERT INTO workspaces (workspace_id, name, owner_user_id) VALUES ($1, 'N22 Foreign', $2)
       ON CONFLICT (workspace_id) DO NOTHING`,
      [foreignWorkspace, reader.userId],
    );
    await ctx.pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'OWNER')
       ON CONFLICT (workspace_id, user_id) DO NOTHING`,
      [foreignWorkspace, reader.userId],
    );
    const foreign = await inject(
      admin,
      `/api/v1/execution/screens/paper?workspace_id=${foreignWorkspace}`,
    );
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json().error.code).toBe("WORKSPACE_NOT_FOUND");

    const overview = await inject(
      admin,
      `/api/v1/execution/screens/paper?workspace_id=${workspaceId}`,
    );
    expect(overview.statusCode).toBe(200);
    expect(overview.json()).toMatchObject({
      schema_version: "execution.paper-overview.v1",
      delivery_profile: "PAPER_BINANCE_USDM",
      workspace_id: workspaceId,
      state: "unavailable",
      freshness: "UNKNOWN",
      completeness: "PARTIAL",
    });
    expect(overview.json().capabilities).toContainEqual(expect.objectContaining({
      capability_id: "source.deployments",
      state: "UNAVAILABLE",
      reason_code: "N13B_PROFILE_NOT_ACTIVATED",
    }));
    expect(JSON.stringify(overview.json())).not.toMatch(/record_key|raw_response|\/internal\/v2\/manager/i);

    for (const screenId of [
      "PAPER_TRADING_SCREEN",
      "EXECUTION_PAPER_WORKBENCH_SCREEN",
      "EXECUTION_PAPER_WORKBENCH_VNM_SCREEN",
      "EXECUTION_FULL_BLOTTER_SCREEN",
    ]) {
      const contract = await inject(
        admin,
        `/api/v1/execution/screen-contracts/${screenId}?workspace_id=${workspaceId}` +
          (screenId.includes("WORKBENCH") ? "&resource_id=dep_1" : ""),
      );
      expect(contract.statusCode).toBe(200);
      expect(contract.json().screen.data_api).toMatchObject({
        status: "AVAILABLE",
        unavailable_reason: null,
        delivery_phase: "N22",
      });
    }
  });
});
