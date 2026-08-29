import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ActivationRepository } from "../src/activation/activation.repository";
import { AdminService } from "../src/admin/admin.service";
import { Argon2CredentialService } from "../src/auth/argon";
import { AuthService } from "../src/auth/auth.service";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const DATABASE_URL = process.env.TEST_DATABASE_URL ??
  "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const SHA_A = `sha256:${"a".repeat(64)}`;
const SHA_B = `sha256:${"b".repeat(64)}`;
const SIGNATURE = "A".repeat(86);

interface Actor { userId: string; username: string; cookie: string; csrf: string }

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

describe("N13A source-dark staged activation", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let auth: AuthService;
  let admin: AdminService;
  let bobby: Actor;
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
    admin = new AdminService(ctx.pool, ctx.config, auth);
    bobby = await createActor("n13a-bobby", "ADMIN");
    reader = await createActor("n13a-reader", "USER");
    const workspaces = await inject(bobby, "/api/workspaces");
    workspaceId = workspaces.json().workspaces[0].workspace_id;
    await ctx.pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'MEMBER')`,
      [workspaceId, reader.userId],
    );
  }, 30_000);

  afterAll(async () => teardownApp(ctx));

  beforeEach(async () => {
    await ctx.pool.query(
      `TRUNCATE execution_activation_events,
                execution_activation_compatibility_requirements,
                execution_activation_evidence_refs,
                execution_activation_capabilities,
                execution_activation_plans,
                product_audit_events, outbox_messages CASCADE`,
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

  async function mutation(actor: Actor, url: string, payload: unknown, extras: Record<string, string> = {}) {
    return inject(actor, url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-portal-csrf": actor.csrf,
        origin: ctx.config.PORTAL_PUBLIC_ORIGIN,
        ...extras,
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
    const password = `cedar-river-${username}-source-dark`;
    expect((await rawInject("/api/auth/change-password", {
      method: "POST",
      headers: {
        cookie: cookies(activated), "x-portal-csrf": initialCsrf,
        "x-dev-access-email": `${username}@azdag.com`,
      },
      payload: { current_password: activationToken, new_password: password },
    })).statusCode).toBe(201);
    const loggedIn = await rawInject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": `${username}@azdag.com` },
      payload: { username, credential: password },
    });
    return { userId: portalUser!.userId, username, cookie: cookies(loggedIn), csrf: csrfCookie(loggedIn) };
  }

  function evidence(expiresAt = new Date(Date.now() + 3_600_000).toISOString()) {
    return ["CONTRACT", "IMAGE", "SCHEMA", "QUALIFICATION", "ROLLBACK"].map((kind, index) => ({
      kind,
      reference_id: `owner/${kind.toLowerCase()}/revision-1`,
      artifact_digest: SHA_A,
      schema_version: `${kind.toLowerCase()}.v1`,
      signer_fingerprint: SHA_B,
      detached_signature: `${SIGNATURE}${index}`,
      compatibility_revision: "revision-1",
      expires_at: expiresAt,
    }));
  }

  function planBody(overrides: Record<string, unknown> = {}) {
    return {
      schema_version: "execution.staged-activation-plan-request.v1",
      workspace_id: workspaceId,
      request_key: "n13a-plan-1",
      capability_key: "QUERY",
      action: "PROMOTE",
      target_profile: "shadow",
      expected_capability_version: 1,
      compatibility_requirements: [{
        kind: "CONTRACT", component: "d4-paper-read",
        exact_revision: "revision-1", expected_digest: SHA_A,
      }],
      evidence_refs: evidence(),
      reason: "Prepare a source-dark staged activation plan only.",
      ...overrides,
    };
  }

  it("publishes seven independent fixture capabilities with every runtime authority false", async () => {
    const response = await inject(bobby, `/api/v1/execution/activation/capabilities?workspace_id=${workspaceId}`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      delivery_profile: "fixture",
      source_integration_state: "DARK",
      runtime_activation_requested: false,
      source_side_effect_requested: false,
      owner_artifact_imported: false,
    });
    expect(response.json().capabilities).toHaveLength(7);
    for (const capability of response.json().capabilities) {
      expect(capability).toMatchObject({
        effective_profile: "fixture", desired_profile: "fixture",
        source_enabled: false, runtime_enabled: false, kill_switch_engaged: true,
      });
    }
  });

  it("stores structurally valid owner references as untrusted and blocks promotion", async () => {
    const response = await mutation(bobby, "/api/v1/execution/activation/plans", planBody());
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json().plan).toMatchObject({
      status: "BLOCKED", from_profile: "fixture", target_profile: "shadow",
      blocker_codes: ["N06_REAL_PAPER_EVIDENCE_REQUIRED", "OWNER_ACCEPTANCE_REQUIRED", "SOURCE_DARK_RUNTIME_LOCK"],
    });
    expect(response.json().evidence_refs).toHaveLength(5);
    for (const reference of response.json().evidence_refs) {
      expect(reference).toMatchObject({
        structure_valid: true, owner_accepted: false,
        trusted_for_activation: false, detached_signature_present: true,
      });
    }
    const apply = await mutation(
      bobby,
      `/api/v1/execution/activation/plans/${response.json().plan.plan_id}/apply`,
      {
        schema_version: "execution.staged-activation-apply-request.v1",
        workspace_id: workspaceId, request_key: "n13a-apply-blocked",
        expected_plan_version: 1, expected_capability_version: 1,
      },
    );
    expect(apply.statusCode).toBe(409);
    expect(apply.json().error.code).toBe("ACTIVATION_PLAN_BLOCKED");
  });

  it("classifies partial, stale, incompatible and illegal plans without trusting them", async () => {
    const partial = await mutation(bobby, "/api/v1/execution/activation/plans", planBody({
      request_key: "n13a-partial", evidence_refs: [], compatibility_requirements: [],
    }));
    expect(partial.json().plan.blocker_codes).toContain("EVIDENCE_PARTIAL");

    const stale = await mutation(bobby, "/api/v1/execution/activation/plans", planBody({
      request_key: "n13a-stale", evidence_refs: evidence("2020-01-01T00:00:00.000Z"),
    }));
    expect(stale.statusCode, stale.body).toBe(201);
    expect(stale.json().plan.blocker_codes).toContain("EVIDENCE_STALE");

    const incompatible = await mutation(bobby, "/api/v1/execution/activation/plans", planBody({
      request_key: "n13a-incompatible",
      compatibility_requirements: [{
        kind: "CONTRACT", component: "d4-paper-read",
        exact_revision: "revision-2", expected_digest: SHA_B,
      }],
    }));
    expect(incompatible.json().plan.blocker_codes).toContain("CONTRACT_INCOMPATIBLE");

    const illegal = await mutation(bobby, "/api/v1/execution/activation/plans", planBody({
      request_key: "n13a-illegal", target_profile: "live_full",
    }));
    expect(illegal.json().plan).toMatchObject({ status: "DENIED" });
    expect(illegal.json().plan.blocker_codes).toContain("ILLEGAL_PROFILE_TRANSITION");
  });

  it("replays exact plans, rejects request-key drift and enforces optimistic concurrency", async () => {
    const body = planBody();
    const first = await mutation(bobby, "/api/v1/execution/activation/plans", body);
    const replay = await mutation(bobby, "/api/v1/execution/activation/plans", body);
    expect(replay.statusCode, replay.body).toBe(201);
    expect(replay.json()).toMatchObject({ replayed: true });
    expect(replay.json().plan.plan_id).toBe(first.json().plan.plan_id);
    const conflict = await mutation(bobby, "/api/v1/execution/activation/plans", planBody({ target_profile: "paper" }));
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe("REQUEST_KEY_ACTIVATION_PLAN_CONFLICT");
    const versionConflict = await mutation(bobby, "/api/v1/execution/activation/plans", planBody({
      request_key: "n13a-version-conflict", expected_capability_version: 2,
    }));
    expect(versionConflict.statusCode).toBe(409);
    expect(versionConflict.json().error.code).toBe("ACTIVATION_CAPABILITY_VERSION_CONFLICT");
  });

  it("applies and verifies an affected-capability-only fixture rollback across repository restart", async () => {
    const planned = await mutation(bobby, "/api/v1/execution/activation/plans", planBody({
      request_key: "n13a-rollback-plan", capability_key: "SSE",
      action: "ROLLBACK", target_profile: "fixture",
      evidence_refs: [], compatibility_requirements: [],
    }));
    expect(planned.json().plan.status).toBe("READY");
    const planId = planned.json().plan.plan_id;
    const applied = await mutation(bobby, `/api/v1/execution/activation/plans/${planId}/apply`, {
      schema_version: "execution.staged-activation-apply-request.v1",
      workspace_id: workspaceId, request_key: "n13a-rollback-apply",
      expected_plan_version: 1, expected_capability_version: 1,
    });
    expect(applied.statusCode).toBe(202);
    expect(applied.json()).toMatchObject({
      plan: { status: "APPLIED", plan_version: 2, resulting_capability_version: 2 },
      capability: {
        capability_key: "SSE", capability_version: 2, effective_profile: "fixture",
        source_enabled: false, runtime_enabled: false, kill_switch_engaged: true,
      },
    });
    const replay = await mutation(bobby, `/api/v1/execution/activation/plans/${planId}/apply`, {
      schema_version: "execution.staged-activation-apply-request.v1",
      workspace_id: workspaceId, request_key: "n13a-rollback-apply",
      expected_plan_version: 1, expected_capability_version: 1,
    });
    expect(replay.statusCode).toBe(202);
    expect(replay.json().replayed).toBe(true);

    const verified = await mutation(bobby, `/api/v1/execution/activation/plans/${planId}/verify`, {
      schema_version: "execution.staged-activation-verify-request.v1",
      workspace_id: workspaceId, request_key: "n13a-rollback-verify",
      expected_plan_version: 2, expected_capability_version: 2,
    });
    expect(verified.statusCode).toBe(201);
    expect(verified.json().plan).toMatchObject({ status: "VERIFIED", plan_version: 3 });

    const restartedRepository = new ActivationRepository(ctx.pool);
    const persisted = await restartedRepository.detail(workspaceId, planId);
    expect(persisted.plan.status).toBe("VERIFIED");
    expect(persisted.capability).toMatchObject({ capability_key: "SSE", capability_version: 2 });
    const untouched = await inject(bobby, `/api/v1/execution/activation/capabilities?workspace_id=${workspaceId}`);
    expect(untouched.json().capabilities.find((item: { capability_key: string }) => item.capability_key === "QUERY"))
      .toMatchObject({ capability_version: 1, last_plan_id: null });

    const counts = await ctx.pool.query<{ audit: number; outbox: number }>(
      `SELECT (SELECT count(*)::integer FROM product_audit_events) AS audit,
              (SELECT count(*)::integer FROM outbox_messages) AS outbox`,
    );
    expect(counts.rows[0]).toEqual({ audit: 3, outbox: 3 });
  });

  it("enforces session, origin, CSRF, RBAC and database source-dark constraints", async () => {
    expect((await rawInject(`/api/v1/execution/activation/capabilities?workspace_id=${workspaceId}`)).statusCode).toBe(401);
    expect((await inject(reader, `/api/v1/execution/activation/capabilities?workspace_id=${workspaceId}`)).statusCode).toBe(200);
    expect((await mutation(reader, "/api/v1/execution/activation/plans", planBody({ request_key: "reader-denied" }))).statusCode).toBe(403);
    expect((await inject(bobby, "/api/v1/execution/activation/plans", {
      method: "POST", headers: { "content-type": "application/json" }, payload: planBody(),
    })).statusCode).toBe(403);
    expect((await mutation(bobby, "/api/v1/execution/activation/plans", planBody(), {
      origin: "https://attacker.invalid",
    })).statusCode).toBe(403);

    const rollback = await mutation(bobby, "/api/v1/execution/activation/plans", planBody({
      request_key: "constraint-plan", action: "ROLLBACK", target_profile: "fixture",
      evidence_refs: evidence(), compatibility_requirements: [],
    }));
    await expect(ctx.pool.query(
      `UPDATE execution_activation_capabilities SET runtime_enabled = true
       WHERE workspace_id = $1 AND capability_key = 'QUERY'`,
      [workspaceId],
    )).rejects.toThrow();
    await expect(ctx.pool.query(
      `UPDATE execution_activation_evidence_refs SET owner_accepted = true WHERE plan_id = $1`,
      [rollback.json().plan.plan_id],
    )).rejects.toThrow();
    expect(rollback.json()).toMatchObject({
      source_side_effect_requested: false,
      runtime_activation_requested: false,
      owner_artifact_imported: false,
    });
  });
});
