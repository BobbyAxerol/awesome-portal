import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AdminService } from "../src/admin/admin.service";
import { Argon2CredentialService } from "../src/auth/argon";
import { AuthService } from "../src/auth/auth.service";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const ARTIFACT_HASH = `sha256:${"a".repeat(64)}`;

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
    (item): item is string =>
      typeof item === "string" && item.startsWith("__Host-portal_csrf="),
  );
  if (!value) throw new Error("csrf cookie missing");
  return value.split(";")[0].split("=")[1];
}

describe("N29 governance product closeout", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let auth: AuthService;
  let admin: AdminService;
  let bobby: Actor;
  let lan: Actor;
  let stan: Actor;
  let workspaceId: string;

  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL);
    ctx = await setupApp({
      AUTH_MODE: "dev",
      FEATURE_EXECUTION_COMMAND_CENTER_SNAPSHOT: "true",
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
    bobby = await createActor("bobby-n29", "ADMIN");
    lan = await createActor("lan-n29", "ADMIN");
    stan = await createActor("stan-n29", "USER");
    const workspaces = await request(bobby, "/api/workspaces");
    workspaceId = workspaces.json().workspaces[0].workspace_id;
    await ctx.pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'MEMBER'), ($1, $3, 'MEMBER')`,
      [workspaceId, lan.userId, stan.userId],
    );
  }, 30_000);

  afterAll(async () => teardownApp(ctx));

  beforeEach(async () => {
    await ctx.pool.query(
      `TRUNCATE governance_approval_decisions, governance_decision_plans,
                governance_approval_known_limitations, governance_approval_findings,
                governance_approval_evidence, governance_approval_requests,
                run_read_models, outbox_messages, product_audit_events CASCADE`,
    );
    await ctx.pool.query(
      `INSERT INTO run_read_models
         (run_id, workspace_id, owner_user_id, status, protocol, strategy_id,
          dataset_id, source_cursor, artifact_sha256, artifact_schema_version,
          artifact_creator_user_id, methodology_claim_ids, updated_at)
       VALUES ('run_n29', $1, $2, 'COMPLETED', 'BACKTEST', 'alpha_n29',
               'dataset_n29', 'cursor_n29', $3, 'quant.run-artifact.v1', $2,
               ARRAY['claim_n29'], '2026-08-30T12:00:00Z')`,
      [workspaceId, stan.userId, ARTIFACT_HASH],
    );
  });

  async function raw(url: string, options: Record<string, unknown> = {}) {
    const headers = { ...((options.headers as Record<string, string>) ?? {}) };
    if (!("x-dev-access-email" in headers)) headers["x-dev-access-email"] = "dev@azdag.com";
    return ctx.app.getHttpAdapter().getInstance().inject({ method: "GET", url, ...options, headers });
  }

  async function request(actor: Actor, url: string, options: Record<string, unknown> = {}) {
    return raw(url, {
      ...options,
      headers: {
        cookie: actor.cookie,
        "x-dev-access-email": `${actor.username}@azdag.com`,
        ...((options.headers as Record<string, string>) ?? {}),
      },
    });
  }

  async function mutation(actor: Actor, url: string, payload: unknown) {
    return request(actor, url, {
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
    const user = await auth.users.findByUsername(username);
    const { activationToken } = await admin.resetCredential(user!.userId);
    const first = await raw("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": `${username}@azdag.com` },
      payload: { username, credential: activationToken },
    });
    const changed = await raw("/api/auth/change-password", {
      method: "POST",
      headers: {
        cookie: cookies(first),
        "x-portal-csrf": csrfCookie(first),
        "x-dev-access-email": `${username}@azdag.com`,
      },
      payload: {
        current_password: activationToken,
        new_password: `cedar-river-${username}-governance-safe`,
      },
    });
    expect(changed.statusCode).toBe(201);
    const login = await raw("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": `${username}@azdag.com` },
      payload: { username, credential: `cedar-river-${username}-governance-safe` },
    });
    expect(login.statusCode).toBe(201);
    return { userId: user!.userId, username, cookie: cookies(login), csrf: csrfCookie(login) };
  }

  function createPayload(requestKey = "n29-create-1", summary = "Ready for independent R1 review.") {
    return {
      schema_version: "governance.approval-create-request.v1",
      workspace_id: workspaceId,
      request_key: requestKey,
      gate: "R1",
      alpha_id: "alpha_n29",
      evidence_run_id: "run_n29",
      methodology_claim_id: "claim_n29",
      summary,
    };
  }

  it("pins server-owned evidence, is idempotent and rejects duplicate open work", async () => {
    const missingCsrf = await request(stan, "/api/v1/execution/governance/approvals", {
      method: "POST",
      payload: createPayload(),
    });
    expect(missingCsrf.statusCode).toBe(403);

    const created = await mutation(stan, "/api/v1/execution/governance/approvals", createPayload());
    expect(created.statusCode).toBe(201);
    expect(created.json().replayed).toBe(false);
    expect(created.json().approval.requester.user_id).toBe(stan.userId);
    expect(created.json().approval.creator.user_id).toBe(stan.userId);
    expect(created.json().approval.evidence_complete).toBe(true);

    const replayed = await mutation(stan, "/api/v1/execution/governance/approvals", createPayload());
    expect(replayed.statusCode).toBe(201);
    expect(replayed.json().replayed).toBe(true);
    expect(replayed.json().approval.approval_id).toBe(created.json().approval.approval_id);

    const keyConflict = await mutation(
      stan,
      "/api/v1/execution/governance/approvals",
      createPayload("n29-create-1", "A materially different approval request summary."),
    );
    expect(keyConflict.statusCode).toBe(409);
    expect(keyConflict.json().error.code).toBe("REQUEST_KEY_PAYLOAD_CONFLICT");

    const duplicate = await mutation(
      stan,
      "/api/v1/execution/governance/approvals",
      createPayload("n29-create-2"),
    );
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe("DUPLICATE_OPEN_APPROVAL");
    expect(duplicate.json().details.approval_id).toBe(created.json().approval.approval_id);

    const stored = await ctx.pool.query(
      `SELECT request.source_run_id, request.methodology_claim_id, evidence.sha256,
              evidence.source_reference, audit.event_type
         FROM governance_approval_requests request
         JOIN governance_approval_evidence evidence USING (approval_id)
         JOIN product_audit_events audit ON audit.aggregate_id = request.approval_id`,
    );
    expect(stored.rows).toEqual([
      expect.objectContaining({
        source_run_id: "run_n29",
        methodology_claim_id: "claim_n29",
        sha256: ARTIFACT_HASH,
        source_reference: "run_n29",
        event_type: "governance.r1_request.created",
      }),
    ]);
  });

  it("fails closed for missing/ineligible evidence and workspace scope", async () => {
    const missing = await mutation(stan, "/api/v1/execution/governance/approvals", {
      ...createPayload(),
      request_key: "missing-run",
      evidence_run_id: "run_missing",
    });
    expect(missing.statusCode).toBe(422);
    expect(missing.json().error.code).toBe("EVIDENCE_RUN_NOT_FOUND");

    await ctx.pool.query("UPDATE run_read_models SET status = 'RUNNING' WHERE run_id = 'run_n29'");
    const ineligible = await mutation(
      stan,
      "/api/v1/execution/governance/approvals",
      createPayload("ineligible-run"),
    );
    expect(ineligible.statusCode).toBe(422);
    expect(ineligible.json().error.code).toBe("EVIDENCE_RUN_NOT_ELIGIBLE");

    const crossWorkspace = await mutation(stan, "/api/v1/execution/governance/approvals", {
      ...createPayload("cross-workspace"),
      workspace_id: "ws_not_visible",
    });
    expect(crossWorkspace.statusCode).toBe(404);
  });

  it("serializes concurrent retries and duplicate alpha/run intents", async () => {
    const sameKey = await Promise.all([
      mutation(stan, "/api/v1/execution/governance/approvals", createPayload("n29-race-same")),
      mutation(stan, "/api/v1/execution/governance/approvals", createPayload("n29-race-same")),
    ]);
    expect(sameKey.map((item) => item.statusCode)).toEqual([201, 201]);
    expect(new Set(sameKey.map((item) => item.json().approval.approval_id)).size).toBe(1);
    expect(sameKey.map((item) => item.json().replayed).sort()).toEqual([false, true]);

    await ctx.pool.query(
      `TRUNCATE governance_approval_decisions, governance_decision_plans,
                governance_approval_known_limitations, governance_approval_findings,
                governance_approval_evidence, governance_approval_requests,
                outbox_messages, product_audit_events CASCADE`,
    );
    const distinctKeys = await Promise.all([
      mutation(stan, "/api/v1/execution/governance/approvals", createPayload("n29-race-a")),
      mutation(stan, "/api/v1/execution/governance/approvals", createPayload("n29-race-b")),
    ]);
    expect(distinctKeys.map((item) => item.statusCode).sort()).toEqual([201, 409]);
    expect(distinctKeys.find((item) => item.statusCode === 409)?.json().error.code)
      .toBe("DUPLICATE_OPEN_APPROVAL");
  });

  it("persists decision conditions and serves exact stateful keyset rows", async () => {
    const created = await mutation(stan, "/api/v1/execution/governance/approvals", createPayload());
    const approvalId = created.json().approval.approval_id as string;
    const plan = await mutation(lan, "/api/v1/execution/commands/plans", {
      schema_version: "governance.r1-decision-plan-request.v1",
      workspace_id: workspaceId,
      request_key: "n29-condition-plan",
      command_type: "GOVERNANCE_R1_DECISION",
      command_version: 1,
      target: { approval_id: approvalId },
      expected_approval_version: 1,
      payload: {
        decision: "APPROVE_WITH_CONDITION",
        reason: "Accept with a time-bounded operating condition.",
        conditions: [{
          text: "Keep paper exposure below the certified envelope.",
          owner: "risk-team",
          deadline: null,
          expires_at: "2099-09-03",
          blocking: true,
        }],
        evidence_hashes: [ARTIFACT_HASH],
      },
    });
    expect(plan.statusCode).toBe(201);
    expect(plan.json().blockers).toEqual([]);
    const applied = await mutation(
      lan,
      `/api/v1/execution/operations/${plan.json().operation_id}/apply`,
      {
        schema_version: "governance.r1-decision-apply-request.v1",
        workspace_id: workspaceId,
        apply_token: plan.json().apply_token,
      },
    );
    expect(applied.statusCode).toBe(202);

    const waiver = await request(
      bobby,
      `/api/v1/execution/governance/waivers?workspace_id=${workspaceId}&kind=WAIVER&limit=1`,
    );
    expect(waiver.statusCode).toBe(200);
    expect(waiver.json().schema_version).toBe("governance.conditions-register.v1");
    expect(waiver.json().page.total_count).toBe(1);
    expect(waiver.json().page.filtered_count).toBe(1);
    expect(waiver.json().page.rows[0]).toEqual(expect.objectContaining({
      approval_id: approvalId,
      kind: "WAIVER",
      state: "WAIVED",
      blocking: false,
    }));

    await ctx.pool.query(
      `INSERT INTO governance_approval_known_limitations
         (limitation_id, approval_id, ordinal, kind, label, statement, expires_at)
       VALUES ('lim_lapsed', $1, 1, 'RESTRICTION', 'Expired control',
               'This control is deliberately expired for the state transition test.',
               now() - interval '1 day')`,
      [approvalId],
    );
    const lapsed = await request(
      bobby,
      `/api/v1/execution/governance/waivers?workspace_id=${workspaceId}&state=LAPSED`,
    );
    expect(lapsed.statusCode).toBe(200);
    expect(lapsed.json().page.total_count).toBe(2);
    expect(lapsed.json().page.filtered_count).toBe(1);
    expect(lapsed.json().page.rows[0]).toEqual(expect.objectContaining({
      condition_id: "lim_lapsed",
      state: "LAPSED",
      blocking: true,
    }));
    const commandCenter = await request(
      stan,
      `/api/v1/execution/command-center?workspace_id=${workspaceId}`,
    );
    expect(commandCenter.statusCode).toBe(200);
    expect(commandCenter.json().panels.today.items).toContainEqual(expect.objectContaining({
      id: "condition:lim_lapsed",
      kind: "CONDITION_EXPIRY",
      href: "/governance/waivers",
    }));
  });
});
