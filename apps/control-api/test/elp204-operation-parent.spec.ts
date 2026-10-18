/** Mounted HTTP + disposable PG; source receipt/mapping is TEST_ONLY.
 * This proves Portal routing/current policy boundaries, NOT PM/TS qualification,
 * source cryptography, real financial authority or upstream execution. */
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import cookiePlugin from "@fastify/cookie";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AdminService } from "../src/admin/admin.service";
import { AuthService } from "../src/auth/auth.service";
import { SESSION_COOKIE } from "../src/auth/cookies";
import { SessionGuard } from "../src/facade/session.guard";
import { HttpErrorFilter } from "../src/http-error.filter";
import { GovernanceController } from "../src/governance/governance.controller";
import { GovernanceService } from "../src/governance/governance.service";
import { PaperExitService } from "../src/governance/paper-exit.service";
import { GovernanceReviewCaptureService } from "../src/governance/review-capture.service";
import { ExecutionOperationsRepository } from "../src/operations/operations.repository";
import { ExecutionOperationsService } from "../src/operations/operations.service";
import { OperationsWorkflowService } from "../src/operations/workflow.service";
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { ProductAuditRepository } from "../src/repos/outbox";
import { WorkspacesRepository } from "../src/repos/workspaces";
import { CONTROL_API_CONFIG } from "../src/tokens";
import type { AccessActor, ReviewedAccessPolicy, ScopedAccessGrant } from "../src/execution-v2/access.contract";
import { accessDigest } from "../src/execution-v2/access-policy";
import { AccessRepository } from "../src/execution-v2/access.repository";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import type { AccessTrustProvider } from "../src/execution-v2/access-trust";
import { commandStatus, type CommandIntent } from "../src/execution-v2/command.contract";
import { ExecutionCommandService, intentHash } from "../src/execution-v2/command.service";
import { CommandStore } from "../src/execution-v2/command.store";
import { commandAuthorization, type CommandTrust } from "../src/execution-v2/command-trust";
import { ExecutionReadScopes } from "../src/execution-v2/read-scope";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const next = () => `TEST_ONLY:${randomUUID()}`;
const missingCommand = "ecm_00000000000000000000000000000000";
@Module({}) class OperationParentTestModule {}
type HttpResponse = { statusCode: number; headers: Record<string, unknown>; body: string; json(): unknown };
type HttpLane = {
  get(id?: string, workspace?: string, token?: string): Promise<HttpResponse>;
  queue(): Promise<HttpResponse>;
};

describe.skipIf(!process.env.TEST_DATABASE_URL)("ELP2-04 exact trusted-command parent (TEST_ONLY source)", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>, auth: AuthService;
  let user: NonNullable<Awaited<ReturnType<AuthService["users"]["findById"]>>>;
  let session: Awaited<ReturnType<AuthService["login"]>>, actor: AccessActor;
  let username: string;
  const password = "TEST-only-ELP204-parent-correct-horse-battery-2026";

  beforeAll(async () => {
    // TEST_DATABASE_URL must be primary's isolated, approved disposable cell.
    // setupApp truncates its known test relations; never point at a product DB.
    await migrateTestDatabase(process.env.TEST_DATABASE_URL!);
    ctx = await setupApp({ DATABASE_URL: process.env.TEST_DATABASE_URL! });
    auth = ctx.app.get(AuthService);
    vi.spyOn(auth, "verifyAccessIdentity").mockImplementation(async assertion => ({
      iss: "https://test-only.cloudflareaccess.com", sub: `TEST_ONLY:${assertion}`, aud: "test-audience",
      email: `${assertion}@azdag.com`, normalizedEmail: `${assertion}@azdag.com`,
      authenticationTime: new Date(), tokenExpiresAt: new Date(Date.now() + 60000),
    }));
    const admin = new AdminService(ctx.pool, ctx.config, auth);
    username = `elp204-parent-${randomUUID()}`;
    const made = await admin.createUser({ username, displayName: username, role: "USER" });
    const activation = await admin.resetCredential(made.userId);
    const initial = await auth.login({ assertion: username, username, credential: activation.activationToken });
    await auth.changePassword({ sessionToken: initial.token, csrfToken: initial.csrfToken,
      currentPassword: activation.activationToken, newPassword: password });
    session = await auth.login({ assertion: username, username, credential: password });
    user = (await auth.users.findById(made.userId))!;
    actor = { user_id: user.userId, session_id: session.sessionId, session_generation: user.sessionVersion };
    await new OwnerAccessRepository(ctx.pool).claimOwner({ userId: user.userId, claimedBy: "ELP204_PARENT_TEST_ONLY" });
  });
  afterAll(async () => { vi.restoreAllMocks(); if (ctx) await teardownApp(ctx); });

  async function workspace() {
    const id = next();
    await ctx.pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY operation parent',$2)", [id, user.userId]);
    await ctx.pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER')", [id, user.userId]);
    return id;
  }

  async function fixture(legacy = false) {
    const ws = await workspace(), now = Date.now(), resource = { kind: "PORTFOLIO" as const, id: next() };
    const repo = new AccessRepository(ctx.pool);
    const policy: ReviewedAccessPolicy = { workspace_id: ws, revision: next(), artifact_digest: accessDigest(next()),
      approval_ref: next(), state: "REVIEWED", qualification: "TEST_ONLY", protected_owner_user_id: user.userId,
      researcher_fields: { state: "PENDING", policy_ref: null, fields: [] } };
    const membership = { revision: next(), mapping_revision: next(), receipt_id: next() };
    const grant: ScopedAccessGrant = { grant_id: next(), workspace_id: ws, subject_user_id: user.userId,
      action: "audit.read", effect: "ALLOW", selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "PORTFOLIO", ids: [resource.id] },
      environments: ["paper"], valid_from_ms: now - 1000, valid_until_ms: now + 600000, delegable_actions: [],
      issued_by: user.userId, parent_grant_id: null, revision: next(), policy_revision: policy.revision,
      revoked_at_ms: null, requires_ts_acceptance: true, ts_receipt: { receipt_id: membership.receipt_id,
        membership_revision: membership.revision, mapping_revision: membership.mapping_revision,
        effective_at_ms: now - 1000, expires_at_ms: now + 600000 }, field_policy_ref: null };
    if (!legacy) { await repo.putPolicy(policy); await repo.saveGrant(grant, true); }
    const trust: AccessTrustProvider = { verifyPolicy: async () => null, verifyReceipt: async () => null,
      relations: async () => ({ qualified: true, revision: membership.revision, own_alpha_ids: [],
        member_portfolio_ids: [resource.id], roots: {}, membership }),
      verifiedHumanMapping: async () => ({ ts_user_id: `TEST_ONLY:ts:${user.userId}`, revision: membership.mapping_revision }) };
    const access = new ExecutionAccessService(ctx.pool, auth, trust, true);
    const commandTrust: CommandTrust = {
      prepare: vi.fn(async () => { throw new Error("TEST_ONLY: unexpected prepare from GET"); }),
      send: vi.fn(async () => { throw new Error("TEST_ONLY: unexpected send from GET"); }),
      lookup: vi.fn(async () => { throw new Error("TEST_ONLY: unexpected lookup from GET"); }),
    };
    const commands = new ExecutionCommandService(ctx.pool, access, commandTrust, true);
    const scopes = new ExecutionReadScopes(ctx.pool, access, ctx.config);
    const intent: CommandIntent = { schema_version: "execution.capital-intent.v2", workspace_id: ws, resource,
      environment: "paper", expected_policy_revision: policy.revision,
      business_payload: { schema_version: "pma.capital-command.v1.1", operation: "TOP_UP", idempotency_key: next(),
        recipient_kind: "PORTFOLIO", currency: "USDT", reason: "TEST_ONLY stored operation receipt",
        amount: "10.000000000000000001", expected_versions: { budget: "9007199254740993", source: "2", parent: "3" } } };
    const authorization = commandAuthorization.parse({ qualification: "TEST_ONLY", reference: next(), authority_ref: "TEST_ONLY:pm",
      profile_ref: "TEST_ONLY:paper", audience: "pma.management.v1", actor_id: user.userId,
      ts_user_id: `TEST_ONLY:ts:${user.userId}`, workload_ref: "TEST_ONLY:workload", delegation_ref: "TEST_ONLY:delegation",
      mapping_revision: membership.mapping_revision, membership_revision: membership.revision,
      membership_receipt_ref: membership.receipt_id, workspace_id: ws, environment: "paper", operation: "TOP_UP",
      resource_kind: resource.kind, resource_id: resource.id, policy_revision: policy.revision,
      intent_hash: intentHash(actor, intent), source_intent_digest: accessDigest(["TEST_ONLY resolved intent", intent]).slice(7),
      expected_versions: intent.business_payload.expected_versions, issued_at_ms: now - 1000, expires_at_ms: now + 30000,
      idempotency_retained_until_ms: now + 600000, approval_required: false, required_approval_gate: null, approval: null, r2_basis: null,
      commit_checks: { human: true, workload: true, membership: true, scope: true, versions: true, capacity: true, approval: true } });
    // Seed only a durable PREPARED TEST_ONLY record via the real repository.
    // No preview/submit/source call or claimed TS economic effect occurs.
    const store = new CommandStore(ctx.pool), db = await ctx.pool.connect();
    const record = await (async () => {
      try { await db.query("BEGIN"); const r = await store.insert(db, user.userId, intent, intentHash(actor, intent), authorization);
        await db.query("COMMIT"); return r;
      } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
    })();
    const legacyRepo = new ExecutionOperationsRepository(ctx.pool);
    const legacyService = new ExecutionOperationsService(legacyRepo, new ProductAuditRepository(ctx.pool), {} as never, ctx.config);
    const legacyRead = vi.spyOn(legacyService, "operationOrNull");
    const paperRead = vi.fn(async () => null), governanceRead = vi.fn(async () => { throw new Error("TEST_ONLY: unexpected unqualified parent read"); });
    const queueRead = vi.fn(async () => { throw new Error("TEST_ONLY: unexpected unqualified queue read"); });
    return { workspace: ws, resource, repo, policy, grant, membership, access, commands, scopes, commandTrust, record,
      legacyRepo, legacyService, legacyRead, paperRead, governanceRead, queueRead };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;

  async function mounted(f: Fixture, run: (http: HttpLane) => Promise<void>) {
    const app = await NestFactory.create<NestFastifyApplication>({ module: OperationParentTestModule,
      controllers: [GovernanceController], providers: [SessionGuard,
        { provide: AuthService, useValue: auth }, { provide: CONTROL_API_CONFIG, useValue: ctx.config },
        { provide: WorkspacesRepository, useValue: new WorkspacesRepository(ctx.pool, ctx.config) },
        { provide: ExecutionReadScopes, useValue: f.scopes }, { provide: ExecutionCommandService, useValue: f.commands },
        { provide: ExecutionOperationsService, useValue: f.legacyService },
        { provide: OperationsWorkflowService, useValue: { list: f.queueRead } },
        { provide: GovernanceService, useValue: { operation: f.governanceRead } },
        { provide: PaperExitService, useValue: { operationOrNull: f.paperRead } },
        { provide: GovernanceReviewCaptureService, useValue: {} },
      ] }, new FastifyAdapter(), { logger: false, abortOnError: false });
    try {
      app.useGlobalFilters(new HttpErrorFilter()); await app.register(cookiePlugin as never); await app.init();
      await app.getHttpAdapter().getInstance().ready(); const http = app.getHttpAdapter().getInstance();
      const headers = (token: string) => ({ cookie: `${SESSION_COOKIE}=${token}`, "x-request-id": "TEST_ONLY-operation-parent" });
      await run({
        get: async (id = f.record.id, ws = f.workspace, token = session.token) => await http.inject({ method: "GET",
          url: `/api/v1/execution/operations/${encodeURIComponent(id)}?workspace_id=${encodeURIComponent(ws)}`, headers: headers(token) }),
        queue: async () => await http.inject({ method: "GET",
          url: `/api/v1/execution/operations?workspace_id=${encodeURIComponent(f.workspace)}`, headers: headers(session.token) }),
      });
    } finally { await app.close(); }
  }

  async function ledger(f: Fixture) {
    return (await ctx.pool.query(`SELECT c.status,c.updated_at_ms,c.attempt_id,
      (SELECT count(*)::int FROM execution_trusted_command_events e WHERE e.command_id=c.command_id) AS command_events,
      (SELECT count(*)::int FROM product_audit_events a WHERE a.aggregate_id=c.command_id) AS audit_events
      FROM execution_trusted_commands c WHERE c.workspace_id=$1 AND c.command_id=$2`, [f.workspace, f.record.id])).rows[0];
  }

  it("serves exact current audit authority on Core workspace, retaining TEST_ONLY and no-store", async () => {
    const f = await fixture(), status = vi.spyOn(f.commands, "status");
    await mounted(f, async http => {
      const response = await http.get(); expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toContain("no-store");
      const body = commandStatus.parse(response.json());
      expect(body).toEqual(f.record.status);
      expect(body).toMatchObject({ schema_version: "portal.execution.command-status.v1", resource: f.resource,
        environment: "paper", authority: "TEST_ONLY", delivery: "PREPARED", business: { state: "UNKNOWN" } });
      expect(status).toHaveBeenCalledWith(actor, f.workspace, f.record.id);
      expect(response.body).not.toMatch(/ts_user_id|workload_ref|delegation_ref|expected_versions|csrf|JWT/);
      expect(f.legacyRead).not.toHaveBeenCalled(); expect(f.paperRead).not.toHaveBeenCalled(); expect(f.governanceRead).not.toHaveBeenCalled();
    });
  });

  it.each(["business-only", "app-only-audit", "wrong-resource", "wrong-environment", "stale-membership"] as const)("hides a financial receipt for %s", async variant => {
    const f = await fixture(); let grant = { ...f.grant, revision: next() };
    if (variant === "business-only") grant = { ...grant, action: "business.read_all" };
    if (variant === "app-only-audit") grant = { ...grant, requires_ts_acceptance: false, ts_receipt: null };
    if (variant === "wrong-resource") grant = { ...grant, selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "PORTFOLIO", ids: [next()] } };
    if (variant === "wrong-environment") grant = { ...grant, environments: ["sandbox"] };
    if (variant === "stale-membership") grant = { ...grant, ts_receipt: { ...f.grant.ts_receipt!, membership_revision: next() } };
    await f.repo.saveGrant(grant);
    await mounted(f, async http => {
      const hidden = await http.get(), unknown = await http.get(missingCommand);
      expect(hidden.statusCode).toBe(404); expect(unknown.statusCode).toBe(404);
      expect(hidden.json()).toEqual(unknown.json());
      expect(hidden.json()).toMatchObject({ error: { code: "COMMAND_RESOURCE_NOT_FOUND" }, public_copy_key: "COMMAND_RESOURCE_NOT_FOUND" });
      expect(hidden.headers["cache-control"]).toContain("no-store");
      expect(f.legacyRead).not.toHaveBeenCalled(); expect(f.paperRead).not.toHaveBeenCalled();
    });
  });

  it("does not resolve a valid id through another workspace, including one the actor can enter", async () => {
    const f = await fixture(), other = await workspace();
    await mounted(f, async http => {
      const wrong = await http.get(f.record.id, other), unknown = await http.get(missingCommand, other);
      expect(wrong.statusCode).toBe(404); expect(wrong.json()).toEqual(unknown.json());
      expect(wrong.json()).toMatchObject({ error: { code: "COMMAND_RESOURCE_NOT_FOUND" } });
      const noMembership = await http.get(f.record.id, next());
      expect(noMembership.statusCode).toBe(404); expect(noMembership.body).not.toContain(f.resource.id);
    });
  });

  it.each(["ecm_short", `ecm_${"A".repeat(32)}`, `${missingCommand}suffix`])("rejects malformed ecm prefix %s without legacy dispatch", async id => {
    const f = await fixture();
    await mounted(f, async http => {
      const response = await http.get(id); expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: "COMMAND_INPUT_INVALID" } });
      expect(f.legacyRead).not.toHaveBeenCalled(); expect(f.paperRead).not.toHaveBeenCalled(); expect(f.governanceRead).not.toHaveBeenCalled();
    });
  });

  it("rejects a grant revoke after real stored bytes are read, before delivery", async () => {
    const f = await fixture(), original = CommandStore.prototype.get;
    let changed = false;
    const pause = vi.spyOn(CommandStore.prototype, "get").mockImplementation(async function (this: CommandStore, ws, id) {
      const row = await original.call(this, ws, id);
      if (ws === f.workspace && id === f.record.id && !changed) {
        changed = true; await f.repo.saveGrant({ ...f.grant, revoked_at_ms: Date.now(), revision: next() });
      }
      return row;
    });
    try { await mounted(f, async http => {
      const response = await http.get(); expect(changed).toBe(true); expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ error: { code: "ACCESS_RETRY_REQUIRED" } });
      expect(response.body).not.toContain(f.resource.id);
      const revoked = await http.get(); expect(revoked.statusCode).toBe(404);
      expect(revoked.json()).toEqual((await http.get(missingCommand)).json());
    }); } finally { pause.mockRestore(); }
  });

  it("rejects a session revoked after the guard and real stored read", async () => {
    const f = await fixture(), otherSession = await auth.login({ assertion: username, username, credential: password });
    const original = CommandStore.prototype.get; let changed = false;
    const pause = vi.spyOn(CommandStore.prototype, "get").mockImplementation(async function (this: CommandStore, ws, id) {
      const row = await original.call(this, ws, id);
      if (ws === f.workspace && id === f.record.id && !changed) {
        changed = true;
        await ctx.pool.query("UPDATE auth_sessions SET state='REVOKED',revoked_at=clock_timestamp(),revoke_reason='TEST_ONLY delayed GET' WHERE session_id=$1", [otherSession.sessionId]);
      }
      return row;
    });
    try { await mounted(f, async http => {
      const response = await http.get(f.record.id, f.workspace, otherSession.token);
      expect(changed).toBe(true); expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: { code: "CURRENT_ACTOR_AUTHORITY_REQUIRED" } });
      expect(response.body).not.toContain(f.resource.id);
      expect((await http.get(f.record.id, f.workspace, otherSession.token)).statusCode).toBe(401);
    }); } finally { pause.mockRestore(); }
  });

  it("GET never sends, looks up, recovers, submits or mutates the durable ledger", async () => {
    const f = await fixture(), before = await ledger(f);
    const recover = vi.spyOn(f.commands, "recover"), reconcile = vi.spyOn(f.commands, "reconcile");
    const submit = vi.spyOn(f.commands, "submit"), preview = vi.spyOn(f.commands, "preview");
    await mounted(f, async http => {
      expect((await http.get()).statusCode).toBe(200); expect((await http.get()).statusCode).toBe(200);
      expect((await http.get(missingCommand)).statusCode).toBe(404);
    });
    expect(await ledger(f)).toEqual(before);
    for (const call of [f.commandTrust.prepare, f.commandTrust.send, f.commandTrust.lookup, recover, reconcile, submit, preview]) expect(call).not.toHaveBeenCalled();
  });

  it("sanitizes command-store failure without falling into an unqualified parent", async () => {
    const f = await fixture();
    const broken = vi.spyOn(CommandStore.prototype, "get").mockRejectedValueOnce(new Error("SELECT secret FROM private_relation; PRIVATE_KEY"));
    try { await mounted(f, async http => {
      const response = await http.get(); expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ error: { code: "COMMAND_UNAVAILABLE" }, safe_next_action: "QUERY_SAME_INTENT" });
      expect(response.body).not.toMatch(/private_relation|PRIVATE_KEY|SELECT secret/);
      expect(f.legacyRead).not.toHaveBeenCalled(); expect(f.paperRead).not.toHaveBeenCalled(); expect(f.governanceRead).not.toHaveBeenCalled();
    }); } finally { broken.mockRestore(); }
  });

  it("without the finite operational provider, keeps other ids and queue closed before legacy reads", async () => {
    const f = await fixture();
    await mounted(f, async http => {
      for (const response of [await http.get("op_TEST_ONLY_unqualified"), await http.queue()]) {
        expect(response.statusCode).toBe(503);
        expect(response.json()).toMatchObject({ error: { code: "OPERATIONAL_READ_NOT_CONFIGURED" } });
        expect(response.body).not.toContain(f.resource.id);
      }
      expect(f.legacyRead).not.toHaveBeenCalled(); expect(f.paperRead).not.toHaveBeenCalled();
      expect(f.governanceRead).not.toHaveBeenCalled(); expect(f.queueRead).not.toHaveBeenCalled();
    });
  });

  it("preserves a real legacy F0 blocked record without treating it as a trusted command", async () => {
    const f = await fixture(true), operationId = `op_${randomUUID().replaceAll("-", "")}`;
    const { record } = await f.legacyRepo.create({ operationId, workspaceId: f.workspace, actorUserId: user.userId,
      requestKey: next(), commandKey: "ops/account-sync", environment: "PAPER", targetType: "ACCOUNT", targetId: next(),
      expectedTargetVersion: 1, payloadHash: accessDigest("TEST_ONLY payload"), planDigest: accessDigest("TEST_ONLY F0"),
      conditions: [], riskTier: "BLOCKED", blockerCodes: ["COMMAND_RELAY_DISABLED"], warningCodes: [],
      expiresAt: new Date(Date.now() + 60000), requestId: next(), auditEventId: next() });
    const trustedStatus = vi.spyOn(f.commands, "status");
    await mounted(f, async http => {
      const response = await http.get(operationId); expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ schema_version: "execution.command-operation.v1", operation_id: record.operationId,
        status: "BLOCKED", verification_result: "NOT_STARTED", relay_receipt: null, source_side_effect_requested: false });
      expect(f.legacyRead).toHaveBeenCalledWith(expect.objectContaining({ userId: user.userId, sessionVersion: user.sessionVersion }), f.workspace, operationId);
      expect(trustedStatus).not.toHaveBeenCalled(); expect(f.paperRead).not.toHaveBeenCalled();
    });
  });
});
