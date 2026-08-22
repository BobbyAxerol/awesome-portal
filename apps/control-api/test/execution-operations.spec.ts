import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AdminService } from "../src/admin/admin.service";
import { Argon2CredentialService } from "../src/auth/argon";
import { AuthService } from "../src/auth/auth.service";
import { migrateTestDatabase, setupApp, teardownApp, testConfig } from "./harness";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://portal:portal@127.0.0.1:5432/portal_control_test";

interface Actor {
  userId: string;
  username: string;
  cookie: string;
  csrf: string;
}

function cookies(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers["set-cookie"];
  return (Array.isArray(raw) ? raw : [raw])
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.split(";")[0])
    .join("; ");
}

function csrfCookie(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers["set-cookie"];
  const value = (Array.isArray(raw) ? raw : [raw]).find(
    (item): item is string => typeof item === "string" && item.startsWith("__Host-portal_csrf="),
  );
  if (!value) throw new Error("csrf cookie missing");
  return value.split(";")[0].split("=")[1];
}

describe("EX-BE-05b/F0 execution operations foundation", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let auth: AuthService;
  let admin: AdminService;
  let bobby: Actor;
  let user: Actor;
  let workspaceId: string;

  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL);
    ctx = await setupApp({ AUTH_MODE: "dev" });
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
    bobby = await createActor("ops-bobby", "ADMIN");
    user = await createActor("ops-reader", "USER");
    const workspaces = await inject(bobby, "/api/workspaces");
    workspaceId = workspaces.json().workspaces[0].workspace_id;
    await ctx.pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'MEMBER')`,
      [workspaceId, user.userId],
    );
  }, 30_000);

  afterAll(async () => teardownApp(ctx));

  beforeEach(async () => {
    await ctx.pool.query(
      "TRUNCATE execution_command_plans_f0, outbox_messages, product_audit_events CASCADE",
    );
  });

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

  async function mutation(actor: Actor, url: string, payload: unknown) {
    return inject(actor, url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-portal-csrf": actor.csrf,
        origin: ctx.config.PORTAL_PUBLIC_ORIGIN,
      },
      payload,
    });
  }

  async function createActor(username: string, role: "ADMIN" | "USER"): Promise<Actor> {
    await admin.createUser({ username, displayName: username, role });
    const portalUser = await auth.users.findByUsername(username);
    const { activationToken } = await admin.resetCredential(portalUser!.userId);
    const activated = await rawInject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": `${username}@azdag.com` },
      payload: { username, credential: activationToken },
    });
    const initialCsrf = csrfCookie(activated);
    const password = `cedar-river-${username}-execution-safe`;
    expect((await rawInject("/api/auth/change-password", {
      method: "POST",
      headers: {
        cookie: cookies(activated),
        "x-portal-csrf": initialCsrf,
        "x-dev-access-email": `${username}@azdag.com`,
      },
      payload: { current_password: activationToken, new_password: password },
    })).statusCode).toBe(201);
    const loggedIn = await rawInject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": `${username}@azdag.com` },
      payload: { username, credential: password },
    });
    return {
      userId: portalUser!.userId,
      username,
      cookie: cookies(loggedIn),
      csrf: csrfCookie(loggedIn),
    };
  }

  function payload(overrides: Record<string, unknown> = {}) {
    return {
      schema_version: "execution.command-plan-request.v1",
      workspace_id: workspaceId,
      request_key: "ops:account-sync:1",
      command_type: "EXECUTION_COMMAND",
      command_version: 1,
      command_key: "account/sync",
      environment: "PAPER",
      target: { type: "ACCOUNT", id: "paper-account-1" },
      expected_target_version: 1,
      payload: { dry_run: true },
      conditions: [],
      ...overrides,
    };
  }

  it("keeps relay feature flags dark and rejects an attempted activation", () => {
    expect(testConfig({ AUTH_MODE: "dev" }).FEATURE_EXECUTION_COMMAND_RELAY).toBe("false");
    expect(() => testConfig({
      AUTH_MODE: "dev",
      FEATURE_EXECUTION_COMMAND_RELAY: "true",
    })).toThrowError(/not commissioned/);
  });

  it("serves exactly 64 authenticated, unreachable catalogue entries", async () => {
    expect((await rawInject("/api/v1/execution/commands/catalog")).statusCode).toBe(401);
    const response = await inject(user, "/api/v1/execution/commands/catalog");
    expect(response.statusCode).toBe(200);
    expect(response.json().entries).toHaveLength(64);
    expect(response.json().entries.every((entry: { portal_reachable: boolean }) => !entry.portal_reachable)).toBe(true);
    for (const key of [
      "ops/trace-order", "ops/dead-letters", "ops/findings", "ops/streams",
      "ops/command-journal", "ops/redis-retention", "ops/alerts", "ops/alpha-activity",
    ]) {
      expect(response.json().entries.find((entry: { key: string }) => entry.key === key))
        .toMatchObject({ source_route_state: "UNPUBLISHED", portal_reachable: false });
    }
  });

  it("creates only an immutable BLOCKED plan and never creates an outbox message", async () => {
    const response = await mutation(bobby, "/api/v1/execution/commands/plans", payload());
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      command_type: "EXECUTION_COMMAND",
      command_key: "account/sync",
      status: "BLOCKED",
      apply_token: null,
      relay_capability: "DISABLED",
      source_side_effect_requested: false,
      replayed: false,
    });
    expect(response.json().blockers).toContain("COMMAND_RELAY_DISABLED");
    const counts = await ctx.pool.query<{ plans: string; audits: string; outbox: string }>(
      `SELECT
         (SELECT count(*) FROM execution_command_plans_f0)::text AS plans,
         (SELECT count(*) FROM product_audit_events WHERE event_type = 'execution.command.plan_blocked')::text AS audits,
         (SELECT count(*) FROM outbox_messages)::text AS outbox`,
    );
    expect(counts.rows[0]).toEqual({ plans: "1", audits: "1", outbox: "0" });
    await expect(ctx.pool.query(
      "UPDATE execution_command_plans_f0 SET updated_at = now() WHERE operation_id = $1",
      [response.json().operation_id],
    )).rejects.toThrow(/immutable/);
  });

  it("replays equal intents and conflicts on request-key payload drift", async () => {
    const first = await mutation(bobby, "/api/v1/execution/commands/plans", payload());
    const replay = await mutation(bobby, "/api/v1/execution/commands/plans", payload());
    expect(replay.statusCode).toBe(201);
    expect(replay.json().operation_id).toBe(first.json().operation_id);
    expect(replay.json().replayed).toBe(true);
    const conflict = await mutation(
      bobby,
      "/api/v1/execution/commands/plans",
      payload({ payload: { dry_run: false } }),
    );
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe("REQUEST_KEY_PAYLOAD_CONFLICT");
    expect((await ctx.pool.query("SELECT 1 FROM execution_command_plans_f0")).rowCount).toBe(1);
    expect((await ctx.pool.query(
      "SELECT 1 FROM product_audit_events WHERE reason_code = 'REQUEST_KEY_PAYLOAD_CONFLICT'",
    )).rowCount).toBe(1);
  });

  it("denies non-admin planning, unknown commands, and all apply attempts", async () => {
    const denied = await mutation(user, "/api/v1/execution/commands/plans", payload());
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe("ADMIN_ROLE_REQUIRED");
    const unknown = await mutation(
      bobby,
      "/api/v1/execution/commands/plans",
      payload({ command_key: "ops/not-published" }),
    );
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().error.code).toBe("UNKNOWN_EXECUTION_COMMAND");
    expect((await ctx.pool.query(
      "SELECT 1 FROM product_audit_events WHERE reason_code = 'UNKNOWN_EXECUTION_COMMAND'",
    )).rowCount).toBe(1);

    const planned = await mutation(bobby, "/api/v1/execution/commands/plans", payload());
    const operationId = planned.json().operation_id;
    const apply = await mutation(
      bobby,
      `/api/v1/execution/operations/${operationId}/apply`,
      {
        schema_version: "execution.command-apply-request.v1",
        workspace_id: workspaceId,
        command_type: "EXECUTION_COMMAND",
      },
    );
    expect(apply.statusCode).toBe(409);
    expect(apply.json().error.code).toBe("COMMAND_RELAY_DISABLED");
    expect(apply.json().details).toMatchObject({
      source_request_sent: false,
      retry_allowed: false,
    });
    expect((await ctx.pool.query("SELECT 1 FROM outbox_messages")).rowCount).toBe(0);
    expect((await ctx.pool.query(
      "SELECT 1 FROM product_audit_events WHERE reason_code = 'COMMAND_RELAY_DISABLED'",
    )).rowCount).toBeGreaterThanOrEqual(1);

    const read = await inject(
      bobby,
      `/api/v1/execution/operations/${operationId}?workspace_id=${workspaceId}`,
    );
    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({
      status: "BLOCKED",
      verification_result: "NOT_STARTED",
      relay_receipt: null,
      source_side_effect_requested: false,
    });
  });
});
