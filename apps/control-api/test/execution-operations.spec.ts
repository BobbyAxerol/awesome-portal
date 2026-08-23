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

  async function withConcurrentInsertDelay<T>(run: () => Promise<T>): Promise<T> {
    await ctx.pool.query(`
      CREATE OR REPLACE FUNCTION test_execution_plan_insert_delay() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM pg_sleep(0.15);
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER test_execution_plan_insert_delay
      BEFORE INSERT ON execution_command_plans_f0
      FOR EACH ROW EXECUTE FUNCTION test_execution_plan_insert_delay();
    `);
    try {
      return await run();
    } finally {
      await ctx.pool.query(`
        DROP TRIGGER IF EXISTS test_execution_plan_insert_delay ON execution_command_plans_f0;
        DROP FUNCTION IF EXISTS test_execution_plan_insert_delay();
      `);
    }
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

  it("serves an ADMIN-only, workspace-bound and filterable unreachable catalogue", async () => {
    expect((await rawInject("/api/v1/execution/commands/catalog")).statusCode).toBe(401);
    const denied = await inject(user, "/api/v1/execution/commands/catalog");
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe("ADMIN_ROLE_REQUIRED");

    const response = await inject(
      bobby,
      `/api/v1/execution/commands/catalog?workspace_id=${workspaceId}` +
      "&environment=PAPER&target_type=ACCOUNT&target_id=paper-account-1",
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      catalogue_revision: 2,
      total_entries: 64,
      returned_entries: 64,
      scope: {
        workspace_id: workspaceId,
        actor_user_id: bobby.userId,
        actor_role: "ADMIN",
        environment: "PAPER",
        entity: { type: "ACCOUNT", id: "paper-account-1" },
        requested_risk_tier: null,
        capability_state: "DISABLED",
        freshness_state: "UNAVAILABLE",
        policy_revision: "execution.command-catalogue.f0.v2",
      },
    });
    expect(response.json().entries).toHaveLength(64);
    expect(response.json().entries.every((entry: { portal_reachable: boolean }) => !entry.portal_reachable)).toBe(true);
    for (const key of [
      "ops/trace-order", "ops/dead-letters", "ops/findings", "ops/streams",
      "ops/command-journal", "ops/redis-retention", "ops/alerts", "ops/alpha-activity",
    ]) {
      expect(response.json().entries.find((entry: { key: string }) => entry.key === key))
        .toMatchObject({ source_route_state: "UNPUBLISHED", portal_reachable: false });
    }

    const filtered = await inject(
      bobby,
      `/api/v1/execution/commands/catalog?workspace_id=${workspaceId}&risk_tier=R1_PAPER_MUTATION`,
    );
    expect(filtered.statusCode).toBe(200);
    expect(filtered.json().returned_entries).toBeGreaterThan(0);
    expect(filtered.json().returned_entries).toBeLessThan(64);
    expect(filtered.json().scope.requested_risk_tier).toBe("R1_PAPER_MUTATION");
    expect(filtered.json().entries.every(
      (entry: { risk_tier: string }) => entry.risk_tier === "R1_PAPER_MUTATION",
    )).toBe(true);

    expect((await inject(
      bobby,
      `/api/v1/execution/commands/catalog?workspace_id=${workspaceId}&target_type=ACCOUNT`,
    )).statusCode).toBe(400);
    expect((await inject(
      bobby,
      "/api/v1/execution/commands/catalog?workspace_id=ws_not_a_membership",
    )).statusCode).toBe(404);
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
      payload_storage_policy: "HASH_ONLY_NO_RAW",
      replayed: false,
    });
    expect(response.json().blockers).toContain("COMMAND_RELAY_DISABLED");
    expect(response.json().blockers).toContain("OWNER_REVIEW_REQUIRED");
    const counts = await ctx.pool.query<{ plans: string; audits: string; outbox: string }>(
      `SELECT
         (SELECT count(*) FROM execution_command_plans_f0)::text AS plans,
         (SELECT count(*) FROM product_audit_events WHERE event_type = 'execution.command.plan_blocked')::text AS audits,
         (SELECT count(*) FROM outbox_messages)::text AS outbox`,
    );
    expect(counts.rows[0]).toEqual({ plans: "1", audits: "1", outbox: "0" });
    const stored = await ctx.pool.query<{
      payload_json: Record<string, unknown>;
      payload_storage_policy: string;
      payload_hash: string;
    }>(
      `SELECT payload_json, payload_storage_policy, payload_hash
       FROM execution_command_plans_f0 WHERE operation_id = $1`,
      [response.json().operation_id],
    );
    expect(stored.rows[0].payload_json).toEqual({});
    expect(stored.rows[0].payload_storage_policy).toBe("HASH_ONLY_NO_RAW");
    expect(stored.rows[0].payload_hash).toBe(response.json().payload_hash);
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

  it("retries real concurrent SERIALIZABLE duplicates and returns one replay", async () => {
    await withConcurrentInsertDelay(async () => {
      const [first, second] = await Promise.all([
        mutation(bobby, "/api/v1/execution/commands/plans", payload()),
        mutation(bobby, "/api/v1/execution/commands/plans", payload()),
      ]);
      expect([first.statusCode, second.statusCode]).toEqual([201, 201]);
      expect(first.json().operation_id).toBe(second.json().operation_id);
      expect([first.json().replayed, second.json().replayed].sort()).toEqual([false, true]);
    });
    const counts = await ctx.pool.query<{ plans: string; audits: string; outbox: string }>(
      `SELECT
         (SELECT count(*) FROM execution_command_plans_f0)::text AS plans,
         (SELECT count(*) FROM product_audit_events WHERE event_type = 'execution.command.plan_blocked')::text AS audits,
         (SELECT count(*) FROM outbox_messages)::text AS outbox`,
    );
    expect(counts.rows[0]).toEqual({ plans: "1", audits: "1", outbox: "0" });
  });

  it("retries a concurrent request-key conflict and returns one typed 409", async () => {
    await withConcurrentInsertDelay(async () => {
      const [first, second] = await Promise.all([
        mutation(bobby, "/api/v1/execution/commands/plans", payload()),
        mutation(
          bobby,
          "/api/v1/execution/commands/plans",
          payload({ payload: { dry_run: false } }),
        ),
      ]);
      expect([first.statusCode, second.statusCode].sort()).toEqual([201, 409]);
      const conflict = first.statusCode === 409 ? first : second;
      expect(conflict.json().error.code).toBe("REQUEST_KEY_PAYLOAD_CONFLICT");
    });
    expect((await ctx.pool.query("SELECT 1 FROM execution_command_plans_f0")).rowCount).toBe(1);
    expect((await ctx.pool.query(
      "SELECT 1 FROM product_audit_events WHERE reason_code = 'REQUEST_KEY_PAYLOAD_CONFLICT'",
    )).rowCount).toBe(1);
  });

  it("rejects sensitive, excessive and semantically invalid plan payloads without storage", async () => {
    const sensitive = await mutation(
      bobby,
      "/api/v1/execution/commands/plans",
      payload({ payload: { nested: { api_key: "must-never-persist" } } }),
    );
    expect(sensitive.statusCode).toBe(400);
    expect(sensitive.json().error.code).toBe("SENSITIVE_PAYLOAD_FIELD_FORBIDDEN");

    let deep: Record<string, unknown> = { value: true };
    for (let index = 0; index < 8; index += 1) deep = { nested: deep };
    const excessive = await mutation(
      bobby,
      "/api/v1/execution/commands/plans",
      payload({ request_key: "ops:account-sync:deep", payload: deep }),
    );
    expect(excessive.statusCode).toBe(400);
    expect(excessive.json().error.code).toBe("INVALID_EXECUTION_COMMAND_PLAN");

    const excessiveUtf8 = await mutation(
      bobby,
      "/api/v1/execution/commands/plans",
      payload({
        request_key: "ops:account-sync:utf8",
        payload: { note: "界".repeat(1_400) },
      }),
    );
    expect(excessiveUtf8.statusCode).toBe(400);
    expect(excessiveUtf8.json().error.code).toBe("INVALID_EXECUTION_COMMAND_PLAN");

    const invalidCondition = await mutation(
      bobby,
      "/api/v1/execution/commands/plans",
      payload({
        request_key: "ops:account-sync:condition",
        conditions: [{
          text: "valid condition text",
          owner: "   ",
          deadline: "2026-08-23",
          expires_at: "2026-08-22",
          blocking: true,
        }],
      }),
    );
    expect(invalidCondition.statusCode).toBe(400);
    expect(invalidCondition.json().error.code).toBe("INVALID_EXECUTION_COMMAND_PLAN");
    expect((await ctx.pool.query("SELECT 1 FROM execution_command_plans_f0")).rowCount).toBe(0);
    expect((await ctx.pool.query(
      "SELECT metadata_json::text FROM product_audit_events WHERE metadata_json::text LIKE '%must-never-persist%'",
    )).rowCount).toBe(0);
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
