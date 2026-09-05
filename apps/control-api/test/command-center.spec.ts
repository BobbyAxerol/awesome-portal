import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AdminService } from "../src/admin/admin.service";
import { Argon2CredentialService } from "../src/auth/argon";
import { AuthService } from "../src/auth/auth.service";
import { CommandCenterRepository } from "../src/command-center/command-center.repository";
import { CommandCenterError, CommandCenterService } from "../src/command-center/command-center.service";
import {
  CommandCenterInputs,
  ExactSourceSlice,
  FleetCell,
  FleetSnapshot,
  SourceAuthority,
  SourceStatus,
  TodayCandidate,
  TriageCandidate,
  composeCommandCenterSnapshot,
  unavailableSource,
} from "../src/command-center/contracts";
import { PortalUser } from "../src/domain";
import { WorkspacesRepository } from "../src/repos/workspaces";
import { migrateTestDatabase, setupApp, teardownApp, testConfig } from "./harness";

const DATABASE_URL = process.env.TEST_DATABASE_URL
  ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const READ_AT = new Date("2026-08-22T12:00:00.000Z");
const actor: PortalUser = {
  userId: "usr_bobby",
  username: "bobby",
  displayName: "Bobby",
  role: "ADMIN",
  status: "ACTIVE",
  mustChangePassword: false,
  failedLoginCount: 0,
  lockedUntil: null,
  sessionVersion: 1,
  createdAt: READ_AT,
  updatedAt: READ_AT,
  disabledAt: null,
};

function availableStatus(
  source: SourceStatus["source"],
  authority: SourceAuthority,
  freshness: SourceStatus["freshness_state"] = "OK",
): SourceStatus {
  return {
    source,
    authority,
    availability: "AVAILABLE",
    reason: null,
    as_of: freshness === "STALE" ? "2026-08-22T11:45:00.000Z" : "2026-08-22T11:59:59.000Z",
    source_cursor: source === "PORTAL_GOVERNANCE" ? null : `cursor-${source.toLowerCase()}`,
    source_sequence: source === "PORTAL_GOVERNANCE" ? null : 41,
    projection_epoch: source === "PORTAL_GOVERNANCE" ? null : "epoch_fixture",
    projection_sequence: source === "PORTAL_GOVERNANCE" ? null : 81,
    source_completeness: source === "EXECUTION_FLEET" ? "POLL_BOUNDED" : "EVENT_SOURCED",
    poll_interval_ms: source === "EXECUTION_FLEET" ? 5_000 : null,
    freshness_state: freshness,
    age_seconds: freshness === "STALE" ? 900 : 1,
    lag_ms: freshness === "STALE" ? 900_000 : 0,
    capability_snapshot_id: source === "PORTAL_GOVERNANCE" ? null : "cap_fixture",
    delivery_profile: "fixture",
  };
}

function slice<T>(
  source: SourceStatus["source"],
  authority: SourceAuthority,
  items: T[],
  total = items.length,
  freshness: SourceStatus["freshness_state"] = "OK",
): ExactSourceSlice<T> {
  return { status: availableStatus(source, authority, freshness), exact_total_count: total, items };
}

const fleetCells: FleetCell[] = [
  { code: "LIVE_FULL", label: "Live", value: 1, href: "/deployments/live" },
  { code: "LIVE_CANARY", label: "Canary", value: 1, href: "/deployments/live?stage=canary" },
  { code: "SANDBOX", label: "Sandbox", value: 1, href: "/deployments/sandbox" },
  { code: "PAPER", label: "Paper", value: 1, href: "/deployments/paper" },
  { code: "BROKER_SYNC_ISSUES", label: "Broker sync", value: 0, href: "/execution/operations?filter=broker_sync" },
  { code: "OPEN_FINDINGS", label: "Findings", value: 0, href: "/execution/operations?filter=findings" },
];

function emptyInputs(overrides: Partial<CommandCenterInputs> = {}): CommandCenterInputs {
  return {
    workspaceId: "ws_fixture",
    actor,
    readAt: READ_AT,
    triageSources: [
      slice("PORTAL_GOVERNANCE", "PORTAL", []),
      slice("EXECUTION_INCIDENTS", "EXECUTION", []),
      slice("EXECUTION_OPERATIONS", "EXECUTION", []),
    ],
    fleet: slice<FleetSnapshot>("EXECUTION_FLEET", "EXECUTION", [{
      total_deployments: 0,
      cells: fleetCells.map((cell) => ({ ...cell, value: 0 })),
      deployment_labels: {},
    }], 0),
    pins: [],
    todaySources: [
      slice("PORTAL_GOVERNANCE", "PORTAL", []),
      slice("EXECUTION_OPERATIONS", "EXECUTION", []),
    ],
    ...overrides,
  };
}

function candidate(
  id: string,
  kind: TriageCandidate["kind"],
  severity: TriageCandidate["severity"],
  dueAt: string | null,
  createdAt: string,
): TriageCandidate {
  return {
    id,
    kind,
    title: id,
    summary: `${kind} ${id}`,
    severity,
    sla_state: dueAt === null ? "NONE" : "DUE_SOON",
    sla_due_at: dueAt,
    created_at: createdAt,
    updated_at: "2026-08-22T11:59:59.000Z",
    authority: kind === "APPROVAL" ? "PORTAL" : "EXECUTION",
    as_of: "2026-08-22T11:59:59.000Z",
    href: `/execution/${id}`,
    action_label: "Open",
  };
}

describe("PRE-IAM-03 pure Command Center composition", () => {
  it("ranks severity then SLA then age, caps at ten and keeps an exact denominator", () => {
    const approvals = [candidate("AP-1", "APPROVAL", "MEDIUM", "2026-08-22T13:00:00.000Z", "2026-08-21T12:00:00.000Z")];
    const incidents = [
      candidate("inc-younger", "INCIDENT", "CRITICAL", "2026-08-22T12:05:00.000Z", "2026-08-22T11:30:00.000Z"),
      candidate("inc-older", "INCIDENT", "CRITICAL", "2026-08-22T12:05:00.000Z", "2026-08-22T10:30:00.000Z"),
    ];
    const operations = Array.from({ length: 10 }, (_, index) => candidate(
      `op-${index}`,
      "OPERATION",
      index === 0 ? "HIGH" : "LOW",
      `2026-08-22T${String(12 + Math.floor(index / 6)).padStart(2, "0")}:${String(index % 6).padStart(2, "0")}:00.000Z`,
      `2026-08-22T${String(9 + Math.floor(index / 6)).padStart(2, "0")}:00:00.000Z`,
    ));
    const response = composeCommandCenterSnapshot(emptyInputs({
      triageSources: [
        slice("PORTAL_GOVERNANCE", "PORTAL", approvals),
        slice("EXECUTION_INCIDENTS", "EXECUTION", incidents),
        slice("EXECUTION_OPERATIONS", "EXECUTION", operations),
      ],
    }));
    expect(response.panels.needs_you.items).toHaveLength(10);
    expect(response.panels.needs_you.items.slice(0, 3).map((item) => item.id)).toEqual([
      "inc-older",
      "inc-younger",
      "op-0",
    ]);
    expect(response.panels.needs_you).toMatchObject({
      formula_version: "command-center.triage-rank.v1",
      exact_total: true,
      total_count: 13,
      observed_total_count: 13,
      truncated: true,
    });
  });

  it("calls the screen QUIET only when every contributing source is complete and empty", () => {
    const response = composeCommandCenterSnapshot(emptyInputs());
    expect(response.mode).toBe("QUIET");
    expect(response.panels.needs_you).toMatchObject({ panel_state: "empty", total_count: 0 });
    expect(response.panels.fleet_health).toMatchObject({ panel_state: "empty", total_deployments: 0 });
    expect(response.warnings).toEqual([]);
  });

  it("fails source gaps closed without hiding available Portal work", () => {
    const approval = candidate("AP-352", "APPROVAL", "HIGH", "2026-08-22T11:30:00.000Z", "2026-08-21T12:00:00.000Z");
    const response = composeCommandCenterSnapshot(emptyInputs({
      triageSources: [
        slice("PORTAL_GOVERNANCE", "PORTAL", [approval]),
        unavailableSource("EXECUTION_INCIDENTS", "EXECUTION", "INCIDENT_SOURCE_NOT_COMMISSIONED"),
        unavailableSource("EXECUTION_OPERATIONS", "EXECUTION", "OPERATION_SOURCE_NOT_COMMISSIONED"),
      ],
      fleet: unavailableSource("EXECUTION_FLEET", "EXECUTION", "FLEET_SOURCE_NOT_COMMISSIONED"),
      todaySources: [
        slice<TodayCandidate>("PORTAL_GOVERNANCE", "PORTAL", [{
          id: "review:AP-352",
          kind: "REVIEW_DUE",
          label: "R2 review",
          scheduled_at: "2026-08-22T12:30:00.000Z",
          authority: "PORTAL",
          as_of: "2026-08-22T11:59:59.000Z",
          href: "/governance/approvals/AP-352/r2",
        }]),
        unavailableSource("EXECUTION_OPERATIONS", "EXECUTION", "OPERATION_SOURCE_NOT_COMMISSIONED"),
      ],
    }));
    expect(response.mode).toBe("DEGRADED");
    expect(response.panels.needs_you).toMatchObject({
      panel_state: "partial",
      exact_total: false,
      total_count: null,
      observed_total_count: 1,
      returned_count: 1,
      truncated: null,
    });
    expect(response.panels.fleet_health.cells.every((cell) => cell.value === null)).toBe(true);
    expect(response.warnings[0].code).toBe("COMMAND_CENTER_SOURCE_GAP");
  });

  it("propagates the oldest input and worst freshness instead of a global green flag", () => {
    const response = composeCommandCenterSnapshot(emptyInputs({
      triageSources: [
        slice("PORTAL_GOVERNANCE", "PORTAL", []),
        slice("EXECUTION_INCIDENTS", "EXECUTION", [], 0, "STALE"),
        slice("EXECUTION_OPERATIONS", "EXECUTION", []),
      ],
      fleet: slice<FleetSnapshot>("EXECUTION_FLEET", "EXECUTION", [{
        total_deployments: 4,
        cells: fleetCells,
        deployment_labels: { dep_88: "Carry v3.2" },
      }], 4, "STALE"),
    }));
    expect(response.panels.needs_you).toMatchObject({
      panel_state: "stale",
      freshness_state: "STALE",
      as_of: "2026-08-22T11:45:00.000Z",
    });
    expect(response.panels.fleet_health.panel_state).toBe("stale");
  });

  it("fails a contradictory exact Fleet snapshot closed", () => {
    const response = composeCommandCenterSnapshot(emptyInputs({
      fleet: slice<FleetSnapshot>("EXECUTION_FLEET", "EXECUTION", [{
        total_deployments: 4,
        cells: fleetCells,
        deployment_labels: {},
      }], 5),
    }));
    expect(response.mode).toBe("DEGRADED");
    expect(response.panels.fleet_health).toMatchObject({
      panel_state: "unavailable",
      exact_total: false,
      total_deployments: null,
      source: {
        availability: "ERROR",
        reason: "FLEET_SNAPSHOT_INVARIANT_FAILED",
        freshness_state: "UNKNOWN",
      },
    });
    expect(response.panels.fleet_health.cells.every((cell) => cell.value === null)).toBe(true);
  });

  it("fails service errors safely and enforces the serialized response budget", async () => {
    const failing = new CommandCenterService(
      { read: async () => { throw new Error("postgres://secret@private-host/data"); } } as unknown as CommandCenterRepository,
      testConfig({ AUTH_MODE: "dev", FEATURE_EXECUTION_COMMAND_CENTER_SNAPSHOT: "true" }),
    );
    await expect(failing.snapshot(actor, "ws_fixture")).rejects.toMatchObject({
      code: "COMMAND_CENTER_SNAPSHOT_UNAVAILABLE",
      status: 503,
      message: "Command Center snapshot is unavailable.",
    });

    const huge = emptyInputs({
      triageSources: [
        slice("PORTAL_GOVERNANCE", "PORTAL", [candidate(
          "AP-HUGE", "APPROVAL", "HIGH", "2026-08-22T12:10:00.000Z", "2026-08-22T10:00:00.000Z",
        )]),
        slice("EXECUTION_INCIDENTS", "EXECUTION", []),
        slice("EXECUTION_OPERATIONS", "EXECUTION", []),
      ],
    });
    huge.triageSources[0].items[0].summary = "x".repeat(20_000);
    const bounded = new CommandCenterService(
      { read: async () => huge } as unknown as CommandCenterRepository,
      testConfig({
        AUTH_MODE: "dev",
        FEATURE_EXECUTION_COMMAND_CENTER_SNAPSHOT: "true",
        COMMAND_CENTER_MAX_RESPONSE_BYTES: String(16 * 1024),
      }),
    );
    await expect(bounded.snapshot(actor, "ws_fixture")).rejects.toMatchObject({
      code: "COMMAND_CENTER_RESPONSE_BUDGET_EXCEEDED",
      status: 503,
    });
  });

  it("is disabled by default without requiring an execution-edge identity", async () => {
    const config = testConfig({ AUTH_MODE: "dev" });
    expect(config.FEATURE_EXECUTION_COMMAND_CENTER_SNAPSHOT).toBe("false");
    const service = new CommandCenterService(
      { read: async () => emptyInputs() } as unknown as CommandCenterRepository,
      config,
    );
    await expect(service.snapshot(actor, "ws_fixture")).rejects.toBeInstanceOf(CommandCenterError);
    await expect(service.snapshot(actor, "ws_fixture")).rejects.toMatchObject({
      code: "COMMAND_CENTER_SNAPSHOT_DISABLED",
      status: 404,
    });
  });
});

describe("PRE-IAM-03 PostgreSQL repository and session-bound API", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let auth: AuthService;
  let admin: AdminService;
  let sessionCookie: string;
  let workspaceId: string;
  let bobbyId: string;
  let stanId: string;

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
    bobbyId = (await admin.createUser({ username: "bobby", displayName: "Bobby", role: "ADMIN" })).userId;
    stanId = (await admin.createUser({ username: "stan", displayName: "Stan", role: "USER" })).userId;
    const { activationToken } = await admin.resetCredential(bobbyId);
    const activationSession = await auth.login({
      devEmail: "bobby@azdag.com",
      username: "bobby",
      credential: activationToken,
    });
    await auth.changePassword({
      sessionToken: activationSession.token,
      csrfToken: activationSession.csrfToken,
      currentPassword: activationToken,
      newPassword: "C0balt-River!Snapshot-42",
    });
    const activeSession = await auth.login({
      devEmail: "bobby@azdag.com",
      username: "bobby",
      credential: "C0balt-River!Snapshot-42",
    });
    sessionCookie = `__Host-portal_session=${activeSession.token}`;
    workspaceId = await new WorkspacesRepository(ctx.pool).ensurePersonal(bobbyId, "bobby");
  });

  afterAll(async () => {
    await teardownApp(ctx);
  });

  const get = (url: string, cookie = sessionCookie) => ctx.app.getHttpAdapter().getInstance().inject({
    method: "GET",
    url,
    headers: cookie ? { cookie, "x-request-id": "req-command-center" } : { "x-request-id": "req-command-center" },
  });

  it("requires a live session and hides foreign workspaces", async () => {
    expect((await get("/api/v1/execution/command-center", "")).statusCode).toBe(401);
    const otherWorkspace = "ws_other_command_center";
    await ctx.pool.query(
      `INSERT INTO workspaces (workspace_id, name, owner_user_id) VALUES ($1, 'Other', $2)`,
      [otherWorkspace, stanId],
    );
    await ctx.pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'OWNER')`,
      [otherWorkspace, stanId],
    );
    const denied = await get(`/api/v1/execution/command-center?workspace_id=${otherWorkspace}`);
    expect(denied.statusCode).toBe(404);
    expect(denied.json().error.code).toBe("WORKSPACE_NOT_FOUND");
  });

  it("serves bounded real Portal governance, exact observed count and honest source gaps", async () => {
    await ctx.pool.query(
      `INSERT INTO governance_approval_requests
         (approval_id, workspace_id, gate, subject_type, subject_id, subject_label,
          environment, target_label, requester_user_id, requester_username,
          artifact_creator_user_id, artifact_creator_username, status, policy_version,
          quorum_required, evidence_set_hash, evidence_complete, blocker_count,
          sla_due_at, expires_at, created_at, updated_at)
       SELECT 'AP-CC-' || lpad(item::text, 6, '0'), $1, 'R1', 'ALPHA_VERSION',
              'av_' || item::text, 'Command Center alpha ' || item::text,
              'RESEARCH', 'R1', $2, 'stan', $2, 'stan', 'PENDING', 'approval.v3',
              1, 'sha256:' || repeat('0', 64), true, 0,
              now() + interval '1 hour' + item * interval '1 second',
              now() + interval '48 hours', now() - interval '2 hours', now()
         FROM generate_series(1, 20000) item`,
      [workspaceId, stanId],
    );
    await ctx.pool.query(
      `INSERT INTO execution_command_center_pins
         (workspace_id, user_id, slot, entity_type, entity_id, label, href)
       VALUES ($1, $2, 1, 'DEPLOYMENT', 'dep_88', 'Carry v3.2', '/deployments/paper/dep_88')`,
      [workspaceId, bobbyId],
    );

    const startedAt = performance.now();
    const response = await get(`/api/v1/execution/command-center?workspace_id=${workspaceId}`);
    const elapsedMs = performance.now() - startedAt;
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      schema_version: "execution.command-center-snapshot.v1",
      delivery_profile: "portal_sgp_projection",
      mode: "DEGRADED",
      snapshot: { cursor: null, stream_available: false },
      panels: {
        needs_you: {
          // P4-H: reconciliation joined needs_you; with the projection off the
          // panel honestly reports partial coverage instead of a false green.
          panel_state: "partial",
          exact_total: false,
          total_count: null,
          observed_total_count: 20000,
          returned_count: 10,
          limit: 10,
        },
        fleet_health: {
          panel_state: "unavailable",
          exact_total: false,
          total_deployments: null,
        },
        pinned_watchlist: {
          panel_state: "partial",
          total_count: 1,
        },
      },
    });
    expect(body.panels.needs_you.items).toHaveLength(10);
    expect(body.panels.fleet_health.cells.every((cell: { value: unknown }) => cell.value === null)).toBe(true);
    expect(Buffer.byteLength(response.body, "utf8")).toBeLessThan(128 * 1024);
    expect(elapsedMs).toBeLessThan(1_500);
    expect(JSON.stringify(body)).not.toContain("postgres://");
  }, 30_000);

  it("joins reconciliation findings and the 24h journal window from the committed projections (P4-H / F12)", async () => {
    const nowIso = new Date().toISOString();
    const oldIso = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const document = {
      schema_version: "portal.execution.profile-projection.v1",
      environment: "paper",
      profile_id: "PAPER_BINANCE_USDM",
      source_contract_revision: "rev-cc-p4h",
      relations: {
        "manager.deployments:strategy_deployments": { availability: "AVAILABLE", items: [] },
        "manager.reconciliation:reconciliation_findings": {
          availability: "AVAILABLE",
          items: [
            { fields: { finding_id: "rec_1", finding_type: "POSITION", venue: "BINANCE", severity: "CRITICAL", status: "OPEN", created_at: nowIso } },
            { fields: { finding_id: "rec_closed", finding_type: "BALANCE", venue: "BINANCE", severity: "WARNING", status: "RESOLVED", created_at: nowIso } },
          ],
        },
        "manager.command-journal:command_journal": {
          availability: "AVAILABLE",
          items: [
            { fields: { command_id: "cmd_1", command_kind: "INSPECT", aggregate_key: "dep_1", outcome_class: "SUCCESS", updated_at: nowIso } },
            { fields: { command_id: "cmd_old", command_kind: "INSPECT", aggregate_key: "dep_1", outcome_class: "SUCCESS", updated_at: oldIso } },
          ],
        },
      },
    };
    await ctx.pool.query(
      `INSERT INTO execution_profile_projection_snapshots
         (workspace_id, environment, profile_id, source_contract_revision, source_epoch,
          source_cursor, source_as_of, received_at, last_successful_refresh_at, completeness,
          projection_epoch, projection_sequence, payload_digest, payload)
       VALUES ($1,'paper','PAPER_BINANCE_USDM','rev-cc-p4h','epoch','cursor',now(),now(),now(),
               'COMPLETE','00000000-0000-4000-8000-0000000000cc',1,$2,$3::jsonb)
       ON CONFLICT (workspace_id,environment,profile_id) DO UPDATE SET
          last_successful_refresh_at=now(), payload=EXCLUDED.payload, payload_digest=EXCLUDED.payload_digest`,
      [workspaceId, `sha256:${"c".repeat(64)}`, JSON.stringify(document)],
    );
    const repository = new CommandCenterRepository(ctx.pool, testConfig({
      AUTH_MODE: "dev",
      FEATURE_EXECUTION_COMMAND_CENTER_SNAPSHOT: "true",
      FEATURE_EXECUTION_LOCAL_PROJECTION: "true",
      FEATURE_EXECUTION_EDGE: "true",
      FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true",
      EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: workspaceId,
      EXECUTION_EDGE_PRIVATE_KEY_FILE: "/tmp/delegation.pem",
      EXECUTION_EDGE_CA_FILE: "/tmp/ca.pem",
      EXECUTION_EDGE_CLIENT_CERT_FILE: "/tmp/client.pem",
      EXECUTION_EDGE_CLIENT_KEY_FILE: "/tmp/client-key.pem",
      EXECUTION_EDGE_PAPER_ORIGIN: "https://paper.execution.internal",
      EXECUTION_EDGE_PAPER_AUDIENCE: "portal-execution-edge-paper",
      EXECUTION_EDGE_PAPER_PROFILE_ID: "PAPER_BINANCE_USDM",
      EXECUTION_EDGE_SANDBOX_PROFILE_ID: "SANDBOX_BINANCE_USDM",
      EXECUTION_EDGE_LIVE_PROFILE_ID: "LIVE_BINANCE_USDM",
    }));
    const inputs = await repository.read(workspaceId, actor, new Date());

    const reconciliation = inputs.triageSources.find((source) => source.status.source === "EXECUTION_RECONCILIATION");
    expect(reconciliation).toBeDefined();
    // The resolved finding is excluded; the open CRITICAL one ranks as a real alert.
    expect(reconciliation!.exact_total_count).toBe(1);
    expect(reconciliation!.items[0]).toMatchObject({
      kind: "RECONCILIATION",
      severity: "CRITICAL",
      title: "POSITION · BINANCE",
      summary: "OPEN · paper profile",
      authority: "EXECUTION",
    });

    const journal = inputs.todaySources.find((source) => source.status.source === "EXECUTION_JOURNAL");
    expect(journal).toBeDefined();
    // The three-day-old command sits outside the bounded 24h window.
    expect(journal!.exact_total_count).toBe(1);
    expect(journal!.items[0]).toMatchObject({
      kind: "JOURNAL_COMMAND",
      label: "INSPECT · dep_1 · SUCCESS",
      href: "/deployments/blotter",
    });
    const response = composeCommandCenterSnapshot(inputs);
    expect(response.snapshot.cursor).toBeNull();
    expect(response.panels.fleet_health.source.source_cursor).toBeNull();
    // `cursor` remains a nullable presentation field for the local SSE
    // protocol, but the source checkpoint supplied by the projection must
    // never cross this browser-facing snapshot boundary.
    expect(JSON.stringify(response)).not.toContain('"cursor":"cursor"');
    expect(JSON.stringify(response)).not.toContain('"source_cursor":"cursor"');
  });

  it("enforces the five-slot, user-scoped watchlist in PostgreSQL", async () => {
    await expect(ctx.pool.query(
      `INSERT INTO execution_command_center_pins
         (workspace_id, user_id, slot, entity_type, entity_id, label, href)
       VALUES ($1, $2, 6, 'DEPLOYMENT', 'dep_99', 'Too many', '/deployments/paper/dep_99')`,
      [workspaceId, bobbyId],
    )).rejects.toThrow(/execution_command_center_pins_slot_check/);
    await expect(ctx.pool.query(
      `INSERT INTO execution_command_center_pins
         (workspace_id, user_id, slot, entity_type, entity_id, label, href)
       VALUES ($1, $2, 2, 'DEPLOYMENT', 'dep_bad', 'Bad path', 'https://private.invalid')`,
      [workspaceId, bobbyId],
    )).rejects.toThrow(/execution_command_center_pins_href_check/);
  });
});
