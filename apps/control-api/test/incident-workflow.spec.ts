import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AdminService } from "../src/admin/admin.service";
import { Argon2CredentialService } from "../src/auth/argon";
import { AuthService } from "../src/auth/auth.service";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

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

describe("EX-BE-05b/F1b Portal incident detail", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let auth: AuthService;
  let admin: AdminService;
  let bobby: Actor;
  let reader: Actor;
  let workspaceId: string;
  const mitigationHash = `sha256:${"a".repeat(64)}`;
  const cleanDryRunHash = `sha256:${"b".repeat(64)}`;

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
    bobby = await createActor("incident-bobby", "ADMIN");
    reader = await createActor("incident-reader", "USER");
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
      "TRUNCATE execution_incident_events, execution_incident_evidence, " +
      "execution_incident_annotations, execution_incident_operation_links, execution_incidents, " +
      "execution_operation_workflow_events, execution_operation_queue_items, " +
      "execution_command_plans_f0, outbox_messages, product_audit_events CASCADE",
    );
    await insertOperation("op-incident-1", workspaceId);
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

  async function insertOperation(operationId: string, targetWorkspaceId: string) {
    await ctx.pool.query(
      `INSERT INTO execution_operation_queue_items
         (operation_id, workspace_id, operation_kind, command_key, environment,
          target_type, target_id, risk_tier, severity, source_authority,
          source_status, verification_result, triage_state, workflow_version,
          created_at, updated_at)
       VALUES ($1, $2, 'EXECUTION_COMMAND', 'account/sync', 'PAPER',
               'ACCOUNT', 'paper-account-1', 'R1_PAPER_MUTATION', 'WARNING', 'PORTAL',
               'BLOCKED', 'NOT_STARTED', 'UNACKNOWLEDGED', 1, now(), now())`,
      [operationId, targetWorkspaceId],
    );
  }

  function createPayload(overrides: Record<string, unknown> = {}) {
    return {
      schema_version: "execution.incident-create-request.v1",
      workspace_id: workspaceId,
      request_key: "incident:create:1",
      title: "Paper account sync is blocked",
      summary: "The Portal detected a blocked source-dark paper operation.",
      severity: "ERROR",
      environment: "PAPER",
      target: { type: "ACCOUNT", id: "paper-account-1" },
      correlated_operation_ids: ["op-incident-1"],
      ...overrides,
    };
  }

  function mutationBase(schemaVersion: string, requestKey: string, expectedVersion: number) {
    return {
      schema_version: schemaVersion,
      workspace_id: workspaceId,
      request_key: requestKey,
      expected_workflow_version: expectedVersion,
    };
  }

  async function createIncident(requestKey = "incident:create:1") {
    return mutation(bobby, "/api/v1/execution/operations/incidents", createPayload({ request_key: requestKey }));
  }

  async function withConcurrentInsertDelay<T>(run: () => Promise<T>): Promise<T> {
    await ctx.pool.query(`
      CREATE OR REPLACE FUNCTION test_incident_insert_delay() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM pg_sleep(0.15);
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER test_incident_insert_delay
      BEFORE INSERT ON execution_incidents
      FOR EACH ROW EXECUTE FUNCTION test_incident_insert_delay();
    `);
    try {
      return await run();
    } finally {
      await ctx.pool.query(`
        DROP TRIGGER IF EXISTS test_incident_insert_delay ON execution_incidents;
        DROP FUNCTION IF EXISTS test_incident_insert_delay();
      `);
    }
  }

  it("is ADMIN-only, workspace-bound, idempotent and source-dark", async () => {
    expect((await rawInject("/api/v1/execution/operations/incidents/inc_missing?workspace_id=x")).statusCode)
      .toBe(401);
    const denied = await mutation(reader, "/api/v1/execution/operations/incidents", createPayload());
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe("ADMIN_ROLE_REQUIRED");

    const first = await createIncident();
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({
      record_authority: "PORTAL",
      source_integration_state: "UNAVAILABLE",
      source_side_effect_requested: false,
      deployment_resume_requested: false,
      replayed: false,
      detail: {
        incident: { workflow_state: "OPEN", workflow_version: 1 },
        correlated_operations: { total_count: 1, returned_count: 1, truncated: false },
        resolution_gate: { eligible: false, deployment_resume_requested: false },
      },
    });
    expect(first.json().detail.source_panels).toHaveLength(4);
    expect(first.json().detail.source_panels.every(
      (panel: {
        source_authority: string;
        panel_state: string;
        freshness_state: string;
        delivery_profile: string;
        read_at: string;
        data: unknown;
      }) =>
        panel.source_authority === "EXECUTION" &&
        panel.panel_state === "unavailable" &&
        panel.freshness_state === "UNKNOWN" &&
        panel.delivery_profile === "fixture" &&
        panel.read_at === first.json().detail.read_at &&
        panel.data === null,
    )).toBe(true);

    const replay = await createIncident();
    expect(replay.statusCode).toBe(201);
    expect(replay.json().detail.incident.incident_id).toBe(first.json().detail.incident.incident_id);
    expect(replay.json().replayed).toBe(true);
    const conflict = await mutation(
      bobby,
      "/api/v1/execution/operations/incidents",
      createPayload({ summary: "This payload drift must conflict with the existing request key." }),
    );
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe("REQUEST_KEY_INCIDENT_CONFLICT");

    const counts = await ctx.pool.query<{ incidents: string; events: string; audits: string; outbox: string }>(
      `SELECT
         (SELECT count(*) FROM execution_incidents)::text AS incidents,
         (SELECT count(*) FROM execution_incident_events)::text AS events,
         (SELECT count(*) FROM product_audit_events WHERE aggregate_type = 'execution_incident')::text AS audits,
         (SELECT count(*) FROM outbox_messages)::text AS outbox`,
    );
    expect(counts.rows[0]).toEqual({ incidents: "1", events: "1", audits: "1", outbox: "0" });
  });

  it("enforces acknowledgement, assignment, mitigation and clean-dry-run resolution gates", async () => {
    const created = await createIncident("incident:create:workflow");
    const incidentId = created.json().detail.incident.incident_id;
    const route = `/api/v1/execution/operations/incidents/${incidentId}`;

    const earlyMitigation = await mutation(bobby, `${route}/mitigate`, {
      ...mutationBase("execution.incident-mitigate-request.v1", "incident:mitigate:early", 1),
      mitigation_evidence_hash: mitigationHash,
    });
    expect(earlyMitigation.statusCode).toBe(409);
    expect(earlyMitigation.json().error.code).toBe("INCIDENT_MITIGATION_BLOCKED");
    expect(earlyMitigation.json().details).toMatchObject({
      blockers: [
        "INCIDENT_ACKNOWLEDGEMENT_REQUIRED",
        "INCIDENT_ASSIGNEE_REQUIRED",
        "MITIGATION_EVIDENCE_REQUIRED",
      ],
    });

    const acknowledged = await mutation(bobby, `${route}/acknowledge`,
      mutationBase("execution.incident-acknowledge-request.v1", "incident:ack:1", 1));
    expect(acknowledged.statusCode).toBe(201);
    expect(acknowledged.json().detail.incident.workflow_version).toBe(2);

    const assigned = await mutation(bobby, `${route}/assign`, {
      ...mutationBase("execution.incident-assign-request.v1", "incident:assign:1", 2),
      assignee_user_id: bobby.userId,
    });
    expect(assigned.statusCode).toBe(201);
    expect(assigned.json().detail.incident).toMatchObject({
      workflow_version: 3,
      assigned_to_user_id: bobby.userId,
    });

    const rejectedSecret = await mutation(bobby, `${route}/annotations`, {
      ...mutationBase("execution.incident-annotate-request.v1", "incident:annotation:secret", 3),
      body: "token=must-never-enter-an-incident-note",
    });
    expect(rejectedSecret.statusCode).toBe(400);
    const annotated = await mutation(bobby, `${route}/annotations`, {
      ...mutationBase("execution.incident-annotate-request.v1", "incident:annotation:1", 3),
      body: "Operator confirmed the paper blast radius is limited to one account.",
    });
    expect(annotated.statusCode).toBe(201);
    expect(annotated.json().detail.annotations).toMatchObject({ total_count: 1, returned_count: 1 });

    const mitigationEvidence = await mutation(bobby, `${route}/evidence`, {
      ...mutationBase("execution.incident-evidence-request.v1", "incident:evidence:mitigation", 4),
      evidence_kind: "MITIGATION_ATTESTATION",
      sha256: mitigationHash,
      evidence_schema_version: "incident.mitigation.v1",
      declared_source_authority: "PORTAL",
      summary: "Hash-only operator attestation for the completed mitigation.",
      captured_at: "2026-08-23T12:00:00Z",
    });
    expect(mitigationEvidence.statusCode).toBe(201);

    const mitigated = await mutation(bobby, `${route}/mitigate`, {
      ...mutationBase("execution.incident-mitigate-request.v1", "incident:mitigate:1", 5),
      mitigation_evidence_hash: mitigationHash,
    });
    expect(mitigated.statusCode).toBe(201);
    expect(mitigated.json().detail.incident).toMatchObject({
      workflow_state: "MITIGATED",
      workflow_version: 6,
      mitigation_evidence_hash: mitigationHash,
    });

    const earlyResolve = await mutation(bobby, `${route}/resolve`, {
      ...mutationBase("execution.incident-resolve-request.v1", "incident:resolve:early", 6),
      reason: "The source-dark paper incident has been mitigated and reviewed.",
      clean_dry_run_evidence_hash: cleanDryRunHash,
    });
    expect(earlyResolve.statusCode).toBe(409);
    expect(earlyResolve.json().error.code).toBe("INCIDENT_RESOLUTION_BLOCKED");
    expect(earlyResolve.json().details).toMatchObject({
      blockers: ["CLEAN_DRY_RUN_EVIDENCE_REQUIRED"],
    });

    const cleanEvidence = await mutation(bobby, `${route}/evidence`, {
      ...mutationBase("execution.incident-evidence-request.v1", "incident:evidence:clean", 6),
      evidence_kind: "CLEAN_DRY_RUN",
      sha256: cleanDryRunHash,
      evidence_schema_version: "incident.clean-dry-run.v1",
      declared_source_authority: "PORTAL",
      summary: "Hash-only clean dry-run result reviewed by the Portal administrator.",
      captured_at: "2026-08-23T12:05:00Z",
    });
    expect(cleanEvidence.statusCode).toBe(201);

    const resolved = await mutation(bobby, `${route}/resolve`, {
      ...mutationBase("execution.incident-resolve-request.v1", "incident:resolve:1", 7),
      reason: "The paper incident is mitigated and the clean dry-run evidence passed review.",
      clean_dry_run_evidence_hash: cleanDryRunHash,
    });
    expect(resolved.statusCode).toBe(201);
    expect(resolved.json()).toMatchObject({
      source_side_effect_requested: false,
      deployment_resume_requested: false,
      detail: {
        incident: {
          workflow_state: "RESOLVED",
          workflow_version: 8,
          clean_dry_run_evidence_hash: cleanDryRunHash,
          source_side_effect_requested: false,
          deployment_resume_requested: false,
        },
        evidence: { total_count: 2, returned_count: 2 },
        timeline: { total_count: 8, returned_count: 8 },
        resolution_gate: {
          eligible: false,
          blocker_codes: ["INCIDENT_ALREADY_RESOLVED"],
          deployment_resume_requested: false,
        },
      },
    });
    expect((await ctx.pool.query("SELECT 1 FROM outbox_messages")).rowCount).toBe(0);

    await expect(ctx.pool.query(
      `UPDATE execution_incidents
       SET workflow_version = workflow_version + 1, deployment_resume_requested = true
       WHERE incident_id = $1`, [incidentId],
    )).rejects.toThrow();
    await expect(ctx.pool.query(
      `UPDATE execution_incident_annotations SET body = 'rewritten' WHERE incident_id = $1`, [incidentId],
    )).rejects.toThrow(/append-only/);
  });

  it("rejects optimistic-lock drift and cross-workspace operation correlation atomically", async () => {
    const created = await createIncident("incident:create:conflict");
    const incidentId = created.json().detail.incident.incident_id;
    const route = `/api/v1/execution/operations/incidents/${incidentId}`;
    const acknowledgement = await mutation(bobby, `${route}/acknowledge`,
      mutationBase("execution.incident-acknowledge-request.v1", "incident:ack:conflict", 1));
    expect(acknowledgement.statusCode).toBe(201);
    const stale = await mutation(bobby, `${route}/assign`, {
      ...mutationBase("execution.incident-assign-request.v1", "incident:assign:stale", 1),
      assignee_user_id: bobby.userId,
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe("INCIDENT_WORKFLOW_VERSION_CONFLICT");
    expect(stale.json().details).toMatchObject({
      current_workflow_version: 2,
    });

    const otherWorkspace = "ws-incident-other";
    await ctx.pool.query(
      `INSERT INTO workspaces (workspace_id, name, owner_user_id) VALUES ($1, 'Other incident cell', $2)`,
      [otherWorkspace, bobby.userId],
    );
    await insertOperation("op-other-workspace", otherWorkspace);
    const crossSource = await mutation(bobby, `${route}/operations`, {
      ...mutationBase("execution.incident-correlate-operation-request.v1", "incident:link:cross", 2),
      operation_id: "op-other-workspace",
      relationship: "RELATED",
    });
    expect(crossSource.statusCode).toBe(404);
    expect(crossSource.json().error.code).toBe("INCIDENT_OPERATION_NOT_FOUND");
    const detail = await inject(bobby, `${route}?workspace_id=${workspaceId}`);
    expect(detail.statusCode).toBe(200);
    expect(detail.json().incident.workflow_version).toBe(2);
    expect(detail.json().correlated_operations.total_count).toBe(1);
  });

  it("serializes equal concurrent creates into one durable incident and one replay", async () => {
    await withConcurrentInsertDelay(async () => {
      const [first, second] = await Promise.all([
        createIncident("incident:create:concurrent"),
        createIncident("incident:create:concurrent"),
      ]);
      expect([first.statusCode, second.statusCode]).toEqual([201, 201]);
      expect(first.json().detail.incident.incident_id).toBe(second.json().detail.incident.incident_id);
      expect([first.json().replayed, second.json().replayed].sort()).toEqual([false, true]);
    });
    const counts = await ctx.pool.query<{ incidents: string; events: string; audits: string }>(
      `SELECT
         (SELECT count(*) FROM execution_incidents)::text AS incidents,
         (SELECT count(*) FROM execution_incident_events)::text AS events,
         (SELECT count(*) FROM product_audit_events WHERE aggregate_type = 'execution_incident')::text AS audits`,
    );
    expect(counts.rows[0]).toEqual({ incidents: "1", events: "1", audits: "1" });
  });
});
