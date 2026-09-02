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
    ctx = await setupApp({
      AUTH_MODE: "dev",
      FEATURE_EXECUTION_LOCAL_R0_TASKS: "true",
      EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: "ws_phase2_projection",
      EXECUTION_EDGE_PAPER_PROFILE_ID: "PAPER_BINANCE_USDM",
      EXECUTION_EDGE_SANDBOX_PROFILE_ID: "SANDBOX_BINANCE_USDM",
      EXECUTION_EDGE_LIVE_PROFILE_ID: "LIVE_BINANCE_USDM",
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
      "TRUNCATE execution_incidents, execution_operation_workflow_events, execution_operation_queue_items, " +
      "execution_command_plans_f0, outbox_messages, product_audit_events CASCADE",
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

  async function withConcurrentWorkflowDelay<T>(run: () => Promise<T>): Promise<T> {
    await ctx.pool.query(`
      CREATE OR REPLACE FUNCTION test_execution_workflow_update_delay() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM pg_sleep(0.15);
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER test_execution_workflow_update_delay
      BEFORE UPDATE ON execution_operation_queue_items
      FOR EACH ROW EXECUTE FUNCTION test_execution_workflow_update_delay();
    `);
    try {
      return await run();
    } finally {
      await ctx.pool.query(`
        DROP TRIGGER IF EXISTS test_execution_workflow_update_delay
          ON execution_operation_queue_items;
        DROP FUNCTION IF EXISTS test_execution_workflow_update_delay();
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
    expect(testConfig({ AUTH_MODE: "dev" }).FEATURE_EXECUTION_LOCAL_R0_TASKS).toBe("false");
    expect(() => testConfig({
      AUTH_MODE: "dev",
      FEATURE_EXECUTION_COMMAND_RELAY: "true",
    })).toThrowError(/not commissioned/);
    expect(() => testConfig({
      AUTH_MODE: "dev",
      FEATURE_EXECUTION_LOCAL_R0_TASKS: "true",
    })).toThrowError(/local R0 tasks require/);
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

  it("publishes the exact N27 operator-task overlay and classifies every source action", async () => {
    expect((await rawInject("/api/v1/execution/commands/tasks")).statusCode).toBe(401);
    const denied = await inject(user, `/api/v1/execution/commands/tasks?workspace_id=${workspaceId}`);
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe("ADMIN_ROLE_REQUIRED");

    const response = await inject(
      bobby,
      `/api/v1/execution/commands/tasks?workspace_id=${workspaceId}`,
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      schema_version: "execution.command-tasks.v1",
      catalogue_revision: 3,
      source_catalogue_revision: 2,
      relay_state: "LOCAL_R0_ONLY",
      total_tasks: 24,
      classification_counts: {
        CONNECTED: 4,
        SUPPORTED_BUT_INACTIVE: 13,
        SEMANTICALLY_INCOMPATIBLE: 7,
      },
      scope: {
        workspace_id: workspaceId,
        actor_user_id: bobby.userId,
        actor_role: "ADMIN",
      },
    });
    expect(response.json().task_groups).toEqual([
      "READ_INSPECT", "PORTFOLIO_CAPITAL", "DEPLOYMENT_RISK", "ACCOUNT",
      "BROKER_SYNC_RECONCILIATION", "EMERGENCY_DESTRUCTIVE",
    ]);
    expect(response.json().tasks).toHaveLength(24);
    expect(response.json().tasks.map((task: { task_id: string }) => task.task_id)).toEqual([
      "health", "inspect", "capital", "performance", "sizing", "broker-read",
      "redis-inspect", "portfolio-create", "portfolio-state", "allocation-change",
      "config-plan", "deployment-state", "trading-state", "risk-profile",
      "alpha-register", "account-policy", "account-seed-paper", "account-sync",
      "reconcile-positions", "reconcile-open-orders", "broker-reconcile",
      "emergency-close", "testnet-hard-reset", "lab-reset",
    ]);
    expect(response.json().tasks.every(
      (task: { params: unknown[]; authority: { runtime_active: boolean }; source_request_sent: boolean }) =>
        task.params.length <= 8 && !task.source_request_sent,
    )).toBe(true);
    expect(response.json().tasks.filter(
      (task: { state: string }) => task.state === "CONNECTED",
    ).map((task: { task_id: string }) => task.task_id)).toEqual([
      "inspect", "capital", "performance", "broker-read",
    ]);
    expect(response.json().tasks.filter(
      (task: { state: string; authority: { runtime_active: boolean } }) => task.state === "CONNECTED",
    ).every((task: { authority: { runtime_active: boolean } }) => task.authority.runtime_active)).toBe(true);
    expect(response.json().tasks.find((task: { task_id: string }) => task.task_id === "health"))
      .toMatchObject({
        key: null,
        state: "SUPPORTED_BUT_INACTIVE",
        unlisted_reason: "CATALOG_ENTRY_NOT_PUBLISHED",
      });
    expect(response.json().tasks.find(
      (task: { task_id: string }) => task.task_id === "redis-inspect",
    )).toMatchObject({
      state: "SEMANTICALLY_INCOMPATIBLE",
      reason_code: "DIRECT_REDIS_ACCESS_FORBIDDEN",
    });
    expect(response.json().tasks.find(
      (task: { task_id: string }) => task.task_id === "emergency-close",
    )).toMatchObject({
      state: "SUPPORTED_BUT_INACTIVE",
      reason_code: "N16B_COMPATIBLE_COMMAND_IDENTITY_NOT_ACTIVATED",
      authority: { two_man_rule: true, runtime_active: false },
      source_request_sent: false,
    });

    const catalogue = await inject(
      bobby,
      `/api/v1/execution/commands/catalog?workspace_id=${workspaceId}`,
    );
    expect(catalogue.statusCode).toBe(200);
    expect(catalogue.json().entries).toHaveLength(64);
    expect(catalogue.json().entries.every(
      (entry: { classification: { state: string } }) =>
        ["CONNECTED", "SUPPORTED_BUT_INACTIVE", "SEMANTICALLY_INCOMPATIBLE"]
          .includes(entry.classification.state),
    )).toBe(true);
    expect(catalogue.json().entries.some(
      (entry: { classification: { state: string } }) => entry.classification.state === "CONNECTED",
    )).toBe(false);
  });

  it("keeps N27 read and mutation tasks fail-closed with typed audit and hash-only plans", async () => {
    const read = await mutation(
      bobby,
      "/api/v1/execution/commands/tasks/health/run",
      {
        schema_version: "execution.command-run-request.v1",
        workspace_id: workspaceId,
        request_key: "n27:health:1",
        params: { mode: "all" },
      },
    );
    expect(read.statusCode).toBe(409);
    expect(read.json()).toMatchObject({
      error: { code: "TYPED_SOURCE_OPERATION_NOT_PUBLISHED" },
      details: {
        task_id: "health",
        classification: "SUPPORTED_BUT_INACTIVE",
        source_request_sent: false,
      },
    });

    const unknownParam = await mutation(
      bobby,
      "/api/v1/execution/commands/tasks/portfolio-state/plan",
      {
        schema_version: "execution.command-task-plan-request.v1",
        workspace_id: workspaceId,
        request_key: "n27:portfolio:bad",
        environment: "PAPER",
        target: { type: "PORTFOLIO", id: "PF-MAIN" },
        expected_target_version: 1,
        params: { portfolio_id: "PF-MAIN", state: "HALTED", reason: "operator stop", shell: "rm" },
        conditions: [],
      },
    );
    expect(unknownParam.statusCode).toBe(400);
    expect(unknownParam.json().error.code).toBe("COMMAND_PARAM_NOT_DECLARED");

    const sensitiveValue = await mutation(
      bobby,
      "/api/v1/execution/commands/tasks/portfolio-state/plan",
      {
        schema_version: "execution.command-task-plan-request.v1",
        workspace_id: workspaceId,
        request_key: "n27:portfolio:sensitive",
        environment: "PAPER",
        target: { type: "PORTFOLIO", id: "PF-MAIN" },
        expected_target_version: 1,
        params: { portfolio_id: "PF-MAIN", state: "HALTED", reason: "token=must-not-persist" },
        conditions: [],
      },
    );
    expect(sensitiveValue.statusCode).toBe(400);
    expect(sensitiveValue.json().error.code).toBe("INVALID_COMMAND_TASK_PLAN");

    const planned = await mutation(
      bobby,
      "/api/v1/execution/commands/tasks/portfolio-state/plan",
      {
        schema_version: "execution.command-task-plan-request.v1",
        workspace_id: workspaceId,
        request_key: "n27:portfolio:1",
        environment: "PAPER",
        target: { type: "PORTFOLIO", id: "PF-MAIN" },
        expected_target_version: 1,
        params: { portfolio_id: "PF-MAIN", state: "HALTED", reason: "operator stop" },
        conditions: [],
      },
    );
    expect(planned.statusCode).toBe(201);
    expect(planned.json()).toMatchObject({
      command_key: "portfolio/state",
      status: "BLOCKED",
      relay_capability: "DISABLED",
      source_side_effect_requested: false,
      payload_storage_policy: "HASH_ONLY_NO_RAW",
    });
    expect((await ctx.pool.query("SELECT 1 FROM outbox_messages")).rowCount).toBe(0);
    expect((await ctx.pool.query(
      "SELECT 1 FROM product_audit_events WHERE event_type='execution.command.run_rejected' " +
      "AND reason_code='TYPED_SOURCE_OPERATION_NOT_PUBLISHED'",
    )).rowCount).toBe(1);
  });

  it("runs only the connected R0 subset from the bounded SGP projection and audits its digest", async () => {
    const sourceWorkspace = "ws_phase2_projection";
    const document = {
      schema_version: "portal.execution.profile-projection.v1",
      workspace_id: sourceWorkspace,
      environment: "paper",
      profile_id: "PAPER_BINANCE_USDM",
      source_contract_revision: "trading-system.portal-execution.manager-v2.runtime.v1",
      relations: {
        "manager.strategies:strategies": {
          source_id: "manager.strategies",
          relation: "strategies",
          availability: "AVAILABLE",
          reason_code: null,
          as_of: new Date().toISOString(),
          freshness: "FRESH",
          completeness: "COMPLETE",
          items: [{
            lineage: { workspace_id: sourceWorkspace, profile_id: "PAPER_BINANCE_USDM", source_contract_revision: "trading-system.portal-execution.manager-v2.runtime.v1" },
            fields: { strategy_id: "alpha_42", alpha_id: "alpha_42", mode: "paper", name: "Bounded alpha" },
          }, {
            lineage: { workspace_id: sourceWorkspace, profile_id: "PAPER_BINANCE_USDM", source_contract_revision: "trading-system.portal-execution.manager-v2.runtime.v1" },
            fields: { strategy_id: "alpha_other", alpha_id: "alpha_other", mode: "paper", name: "Must not leak" },
          }],
        },
      },
    };
    await ctx.pool.query(
      `INSERT INTO execution_profile_projection_snapshots
         (workspace_id, environment, profile_id, source_contract_revision, source_epoch,
          source_cursor, source_as_of, received_at, last_successful_refresh_at, completeness,
          projection_epoch, projection_sequence, payload_digest, payload)
       VALUES ($1,'paper','PAPER_BINANCE_USDM',$2,'epoch','cursor',now(),now(),now(),
               'COMPLETE',$3,1,$4,$5::jsonb)
       ON CONFLICT (workspace_id,environment,profile_id) DO UPDATE SET
          last_successful_refresh_at=now(), payload=EXCLUDED.payload, payload_digest=EXCLUDED.payload_digest`,
      [sourceWorkspace, document.source_contract_revision, "00000000-0000-4000-8000-000000000042",
        `sha256:${"4".repeat(64)}`, JSON.stringify(document)],
    );
    const response = await mutation(
      bobby,
      "/api/v1/execution/commands/tasks/inspect/run",
      {
        schema_version: "execution.command-run-request.v1",
        workspace_id: workspaceId,
        request_key: "phase2:inspect:1",
        params: { mode: "paper", alpha_id: "alpha_42" },
      },
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      schema_version: "execution.command-run-result.v1",
      task_id: "inspect",
      classification: "CONNECTED",
      transport: "SGP_LOCAL_PROJECTION",
      source_request_sent: false,
      result: {
        viewer_workspace_id: workspaceId,
        environment: "paper",
        relations: {
          "manager.strategies:strategies": {
            state: "AVAILABLE",
            returned_count: 1,
            items: [{ strategy_id: "alpha_42" }],
          },
        },
      },
    });
    expect(JSON.stringify(response.json())).not.toContain("alpha_other");
    expect(response.json().response_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    const audit = await ctx.pool.query(
      `SELECT result, reason_code, metadata_json
         FROM product_audit_events WHERE idempotency_key='phase2:inspect:1'`,
    );
    expect(audit.rows[0]).toMatchObject({
      result: "SUCCESS",
      reason_code: "PHASE2_LOCAL_PROJECTION_TASK_ACTIVE",
      metadata_json: expect.objectContaining({ source_request_sent: false, transport: "SGP_LOCAL_PROJECTION" }),
    });
  });

  it("classifies only the exact N16B current emergency-close primitive and keeps it dark", async () => {
    const catalogue = await inject(
      bobby,
      `/api/v1/execution/commands/catalog?workspace_id=${workspaceId}&environment=LIVE`,
    );
    expect(catalogue.statusCode).toBe(200);
    const emergency = catalogue.json().entries.find(
      (entry: { key: string }) => entry.key === "ops/emergency-close",
    );
    expect(emergency).toMatchObject({
      source_route_state: "CURRENT_PRIMITIVE_CONFIRMED",
      blocked_reason: "N16B_RUNTIME_ACTIVATION_PENDING",
      current_primitive_state: "ACCEPTED_CURRENT_PRIMITIVE",
      current_capability_id: "live.emergency-close",
      accepted_environments: ["LIVE"],
      accepted_target_types: ["ACCOUNT"],
      portal_reachable: false,
      runtime_active: false,
    });

    const planned = await mutation(
      bobby,
      "/api/v1/execution/commands/plans",
      payload({
        request_key: "ops:emergency-close:account-1",
        command_key: "ops/emergency-close",
        environment: "LIVE",
        target: { type: "ACCOUNT", id: "live-account-1" },
        payload: {
          confirmation: "CLOSE LIVE ACCOUNT",
          mode: "live",
          product: "USD_M",
          reason: "Operator requested protective containment",
          venue: "BINANCE",
        },
      }),
    );
    expect(planned.statusCode).toBe(201);
    expect(planned.json()).toMatchObject({
      status: "BLOCKED",
      blockers: expect.arrayContaining([
        "COMMAND_RELAY_DISABLED",
        "N16B_RUNTIME_ACTIVATION_PENDING",
        "OWNER_REVIEW_REQUIRED",
      ]),
      current_primitive: {
        id: "live.emergency-close",
        source_environment: "LIVE_FULL",
        target_types: ["ACCOUNT"],
        runtime_active: false,
        source_side_effect_requested: false,
      },
      source_side_effect_requested: false,
    });
    expect((await ctx.pool.query("SELECT 1 FROM outbox_messages")).rowCount).toBe(0);
  });

  it("returns typed N16B blockers for widened target or malformed source intent", async () => {
    const baseEmergency = {
      command_key: "ops/emergency-close",
      environment: "LIVE",
      payload: {
        confirmation: "CLOSE LIVE ACCOUNT",
        mode: "live",
        product: "USD_M",
        reason: "Operator requested protective containment",
        venue: "BINANCE",
      },
    };
    const widened = await mutation(
      bobby,
      "/api/v1/execution/commands/plans",
      payload({
        ...baseEmergency,
        request_key: "ops:emergency-close:portfolio",
        target: { type: "PORTFOLIO", id: "portfolio-1" },
      }),
    );
    expect(widened.statusCode).toBe(201);
    expect(widened.json().blockers).toContain("N16B_TARGET_SCOPE_UNSUPPORTED");

    const malformed = await mutation(
      bobby,
      "/api/v1/execution/commands/plans",
      payload({
        ...baseEmergency,
        request_key: "ops:emergency-close:malformed",
        target: { type: "ACCOUNT", id: "live-account-1" },
        payload: { ...baseEmergency.payload, mode: "paper" },
      }),
    );
    expect(malformed.statusCode).toBe(201);
    expect(malformed.json().blockers).toContain("N16B_CURRENT_PRIMITIVE_PLAN_INVALID");
    expect((await ctx.pool.query("SELECT 1 FROM outbox_messages")).rowCount).toBe(0);
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

  it("projects blocked plans into an ADMIN-only, exact-count and bidirectional operations queue", async () => {
    expect((await rawInject("/api/v1/execution/operations")).statusCode).toBe(401);
    const denied = await inject(user, `/api/v1/execution/operations?workspace_id=${workspaceId}`);
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe("QUERY_FORBIDDEN");

    for (let index = 0; index < 4; index += 1) {
      const created = await mutation(bobby, "/api/v1/execution/commands/plans", payload({
        request_key: `ops:queue:${index}`,
        target: { type: "ACCOUNT", id: `paper-account-${index}` },
      }));
      expect(created.statusCode).toBe(201);
    }
    const first = await inject(
      bobby,
      `/api/v1/execution/operations?workspace_id=${workspaceId}` +
      "&triage_state=UNACKNOWLEDGED&environment=PAPER&limit=2",
    );
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      schema_version: "execution.operations-queue.v1",
      record_authority: "PORTAL",
      delivery_profile: "fixture",
      source_integration_state: "UNAVAILABLE",
      page: {
        total_count: 4,
        filtered_count: 4,
        has_more: true,
        has_previous: false,
      },
    });
    expect(first.json().page.rows).toHaveLength(2);
    expect(first.json().page.rows.every(
      (item: { source_status: string; verification_result: string }) =>
        item.source_status === "BLOCKED" && item.verification_result === "NOT_STARTED",
    )).toBe(true);

    const second = await inject(
      bobby,
      `/api/v1/execution/operations?workspace_id=${workspaceId}` +
      "&triage_state=UNACKNOWLEDGED&environment=PAPER&limit=2" +
      `&after=${encodeURIComponent(first.json().page.next_cursor)}`,
    );
    expect(second.statusCode).toBe(200);
    expect(second.json().page.rows).toHaveLength(2);
    expect(second.json().page.has_previous).toBe(true);
    expect(second.json().page.prev_cursor).toBeTypeOf("string");
    const previous = await inject(
      bobby,
      `/api/v1/execution/operations?workspace_id=${workspaceId}` +
      "&triage_state=UNACKNOWLEDGED&environment=PAPER&limit=2" +
      `&before=${encodeURIComponent(second.json().page.prev_cursor)}`,
    );
    expect(previous.statusCode).toBe(200);
    expect(previous.json().page.rows.map((item: { operation_id: string }) => item.operation_id))
      .toEqual(first.json().page.rows.map((item: { operation_id: string }) => item.operation_id));
  });

  it("defines Mine as explicit assignment and publishes the correlated incident id", async () => {
    const assigned = await mutation(bobby, "/api/v1/execution/commands/plans", payload({
      request_key: "ops:mine:assigned",
      target: { type: "ACCOUNT", id: "paper-account-assigned" },
    }));
    const unassigned = await mutation(bobby, "/api/v1/execution/commands/plans", payload({
      request_key: "ops:mine:unassigned",
      target: { type: "ACCOUNT", id: "paper-account-unassigned" },
    }));
    const operationId = assigned.json().operation_id;
    const acknowledged = await mutation(
      bobby,
      `/api/v1/execution/operations/${operationId}/acknowledge`,
      {
        schema_version: "execution.operation-acknowledge-request.v1",
        workspace_id: workspaceId,
        request_key: "ops:mine:ack",
        expected_workflow_version: 1,
      },
    );
    expect(acknowledged.statusCode).toBe(201);
    expect(acknowledged.json().operation.assigned_to).toEqual({
      user_id: bobby.userId,
      username: bobby.username,
    });
    expect(acknowledged.json().operation.assigned_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    await ctx.pool.query(
      `INSERT INTO execution_incidents
         (incident_id, workspace_id, title, summary, severity, environment,
          target_type, target_id, workflow_state, workflow_version, opened_by_user_id)
       VALUES ('inc-mine-1', $1, 'Assigned queue incident',
               'Portal-local incident correlated to the assigned operation.',
               'WARNING', 'PAPER', 'ACCOUNT', 'paper-account-assigned',
               'OPEN', 1, $2)`,
      [workspaceId, bobby.userId],
    );
    await ctx.pool.query(
      `INSERT INTO execution_incident_operation_links
         (incident_id, workspace_id, operation_id, relationship, linked_by_user_id)
       VALUES ('inc-mine-1', $1, $2, 'TRIGGERED_BY', $3)`,
      [workspaceId, operationId, bobby.userId],
    );

    const mine = await inject(
      bobby,
      `/api/v1/execution/operations?workspace_id=${workspaceId}&assigned_to=me`,
    );
    expect(mine.statusCode).toBe(200);
    expect(mine.json().page).toMatchObject({ total_count: 2, filtered_count: 1 });
    expect(mine.json().page.rows).toMatchObject([{
      operation_id: operationId,
      assigned_to: { user_id: bobby.userId, username: bobby.username },
      incident_id: "inc-mine-1",
    }]);
    expect(mine.json().page.rows.map((row: { operation_id: string }) => row.operation_id))
      .not.toContain(unassigned.json().operation_id);
  });

  it("keeps acknowledgement and resolution local, ordered, audited and idempotent", async () => {
    const created = await mutation(bobby, "/api/v1/execution/commands/plans", payload());
    const operationId = created.json().operation_id;
    const premature = await mutation(
      bobby,
      `/api/v1/execution/operations/${operationId}/resolve`,
      {
        schema_version: "execution.operation-resolve-request.v1",
        workspace_id: workspaceId,
        request_key: "resolve-before-ack",
        expected_workflow_version: 1,
        reason: "Evidence confirms the blocked plan is no longer actionable.",
        evidence_hash: `sha256:${"a".repeat(64)}`,
      },
    );
    expect(premature.statusCode).toBe(409);
    expect(premature.json().error.code).toBe("OPERATION_REQUIRES_ACKNOWLEDGEMENT");

    const acknowledgement = {
      schema_version: "execution.operation-acknowledge-request.v1",
      workspace_id: workspaceId,
      request_key: "ack-operation-1",
      expected_workflow_version: 1,
    };
    expect((await mutation(
      user,
      `/api/v1/execution/operations/${operationId}/acknowledge`,
      acknowledgement,
    )).statusCode).toBe(403);
    const acknowledged = await mutation(
      bobby,
      `/api/v1/execution/operations/${operationId}/acknowledge`,
      acknowledgement,
    );
    expect(acknowledged.statusCode).toBe(201);
    expect(acknowledged.json()).toMatchObject({
      schema_version: "execution.operation-workflow.v1",
      source_status_unchanged: true,
      source_side_effect_requested: false,
      replayed: false,
      operation: {
        triage_state: "ACKNOWLEDGED",
        workflow_version: 2,
        source_status: "BLOCKED",
        verification_result: "NOT_STARTED",
      },
    });
    const replay = await mutation(
      bobby,
      `/api/v1/execution/operations/${operationId}/acknowledge`,
      acknowledgement,
    );
    expect(replay.statusCode).toBe(201);
    expect(replay.json().replayed).toBe(true);

    const stale = await mutation(
      bobby,
      `/api/v1/execution/operations/${operationId}/resolve`,
      {
        schema_version: "execution.operation-resolve-request.v1",
        workspace_id: workspaceId,
        request_key: "resolve-stale",
        expected_workflow_version: 1,
        reason: "Evidence confirms the blocked plan is no longer actionable.",
        evidence_hash: `sha256:${"b".repeat(64)}`,
      },
    );
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe("OPERATION_WORKFLOW_VERSION_CONFLICT");

    const resolved = await mutation(
      bobby,
      `/api/v1/execution/operations/${operationId}/resolve`,
      {
        schema_version: "execution.operation-resolve-request.v1",
        workspace_id: workspaceId,
        request_key: "resolve-operation-1",
        expected_workflow_version: 2,
        reason: "Evidence confirms the blocked plan is no longer actionable.",
        evidence_hash: `sha256:${"c".repeat(64)}`,
      },
    );
    expect(resolved.statusCode).toBe(201);
    expect(resolved.json().operation).toMatchObject({
      triage_state: "RESOLVED",
      workflow_version: 3,
      source_status: "BLOCKED",
      verification_result: "NOT_STARTED",
    });
    const counts = await ctx.pool.query<{
      events: string; audits: string; outbox: string;
    }>(
      `SELECT
         (SELECT count(*) FROM execution_operation_workflow_events)::text AS events,
         (SELECT count(*) FROM product_audit_events
          WHERE event_type IN ('execution.operation.acknowledged', 'execution.operation.resolved'))::text AS audits,
         (SELECT count(*) FROM outbox_messages)::text AS outbox`,
    );
    expect(counts.rows[0]).toEqual({ events: "2", audits: "2", outbox: "0" });
    await expect(ctx.pool.query(
      "UPDATE execution_operation_queue_items SET source_status = 'SUCCEEDED' WHERE operation_id = $1",
      [operationId],
    )).rejects.toThrow(/immutable/);
  });

  it("serializes concurrent equal workflow request keys into one event and one replay", async () => {
    const created = await mutation(bobby, "/api/v1/execution/commands/plans", payload());
    const operationId = created.json().operation_id;
    const acknowledgement = {
      schema_version: "execution.operation-acknowledge-request.v1",
      workspace_id: workspaceId,
      request_key: "ack-concurrent-operation-1",
      expected_workflow_version: 1,
    };
    await withConcurrentWorkflowDelay(async () => {
      const [first, second] = await Promise.all([
        mutation(
          bobby,
          `/api/v1/execution/operations/${operationId}/acknowledge`,
          acknowledgement,
        ),
        mutation(
          bobby,
          `/api/v1/execution/operations/${operationId}/acknowledge`,
          acknowledgement,
        ),
      ]);
      expect([first.statusCode, second.statusCode]).toEqual([201, 201]);
      expect([first.json().replayed, second.json().replayed].sort()).toEqual([false, true]);
      expect(first.json().operation.operation_id).toBe(second.json().operation.operation_id);
    });
    const counts = await ctx.pool.query<{ events: string; audits: string }>(
      `SELECT
         (SELECT count(*) FROM execution_operation_workflow_events)::text AS events,
         (SELECT count(*) FROM product_audit_events
          WHERE event_type = 'execution.operation.acknowledged')::text AS audits`,
    );
    expect(counts.rows[0]).toEqual({ events: "1", audits: "1" });
  });

  it("keeps exact counts and bounded pages over the 182k queue design corpus", async () => {
    await ctx.pool.query(
      `INSERT INTO execution_operation_queue_items
         (operation_id, workspace_id, operation_kind, command_key, environment,
          target_type, target_id, risk_tier, severity, source_authority,
          source_status, verification_result, triage_state, workflow_version,
          created_at, updated_at)
       SELECT 'op_load_' || lpad(value::text, 12, '0'), $1,
              'EXECUTION_COMMAND', 'account/sync', 'PAPER', 'ACCOUNT',
              'load-' || value, 'BLOCKED', 'WARNING', 'PORTAL', 'BLOCKED',
              'NOT_STARTED', 'UNACKNOWLEDGED', 1,
              timestamptz '2026-01-01 00:00:00+00' + value * interval '1 millisecond',
              timestamptz '2026-01-01 00:00:00+00' + value * interval '1 millisecond'
       FROM generate_series(1, 182000) AS value`,
      [workspaceId],
    );
    const started = performance.now();
    const response = await inject(
      bobby,
      `/api/v1/execution/operations?workspace_id=${workspaceId}&limit=250`,
    );
    expect(response.statusCode).toBe(200);
    expect(response.json().page).toMatchObject({
      total_count: 182000,
      filtered_count: 182000,
      has_more: true,
      has_previous: false,
    });
    expect(response.json().page.rows).toHaveLength(250);
    expect(performance.now() - started).toBeLessThan(2_500);
  }, 15_000);
});
