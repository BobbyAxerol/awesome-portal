/** Mounted HTTP + disposable PostgreSQL; only Portal
 * Auth/session, stored status and current graph boundaries are exercised.
 * Relations/acceptance/receipt rows are explicitly TEST_ONLY synthetic facts,
 * NOT native PM authority, economic execution, cryptographic qualification,
 * grant-issuance HTTP or a held cross-authority COMMIT fence. */
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import cookiePlugin from "@fastify/cookie";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AdminService } from "../src/admin/admin.service";
import { AuthService } from "../src/auth/auth.service";
import { SESSION_COOKIE } from "../src/auth/cookies";
import { SessionGuard } from "../src/facade/session.guard";
import { HttpErrorFilter } from "../src/http-error.filter";
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { WorkspacesRepository } from "../src/repos/workspaces";
import { CONTROL_API_CONFIG } from "../src/tokens";
import type { ControlApiConfig } from "../src/config";
import type { AccessActor, ReviewedAccessPolicy, ScopedAccessGrant } from "../src/execution-v2/access.contract";
import { accessDigest, evaluateAccess, validateDelegation } from "../src/execution-v2/access-policy";
import { AccessRepository } from "../src/execution-v2/access.repository";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import type { AccessTrustProvider } from "../src/execution-v2/access-trust";
import { commandIntent, commandStatus, type CommandIntent, type CommandStatus } from "../src/execution-v2/command.contract";
import { commandCollection, type CommandCollection } from "../src/execution-v2/command-collection.contract";
import { ExecutionCommandController } from "../src/execution-v2/command.controller";
import { ExecutionCommandService, intentHash } from "../src/execution-v2/command.service";
import { CommandStore, type CommandRecord } from "../src/execution-v2/command.store";
import { KeysetCursorCodec } from "../src/query/cursor";
import { commandAuthorization, type CommandTrust } from "../src/execution-v2/command-trust";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const next = () => `TEST_ONLY:${randomUUID()}`;
const missing = "ecm_00000000000000000000000000000000";
const cursorKeys = { activeKeyId: "test-only", keys: { "test-only": "TEST_ONLY_collection_key_not_product_0123456789" }, ttlSeconds: 900 };
const password = "TEST-only-ELP204-collection-correct-horse-battery-2026";
const invalidQueries: Array<Record<string, string>> = [{ limit: "0" }, { limit: "101" }, { limit: "1.5" },
  { environment: "demo" }, { resource_kind: "ACCOUNT" }, { resource_id: "" },
  { workspace_id: "" }, { after: "" }, { invented: "true" }];
type Resource = CommandIntent["resource"];
type Environment = CommandIntent["environment"];
type Response = { statusCode: number; headers: Record<string, unknown>; body: string; json(): unknown };
@Module({}) class CommandCollectionTestModule {}

describe.skipIf(!process.env.TEST_DATABASE_URL)("ELP2-04 trusted command collection: real PG + mounted HTTP / TEST_ONLY source", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>, auth: AuthService;
  type Account = { user: NonNullable<Awaited<ReturnType<AuthService["users"]["findById"]>>>;
    session: Awaited<ReturnType<AuthService["login"]>>; actor: AccessActor; username: string };
  let owner: Account, viewer: Account, delegator: Account;
  beforeAll(async () => {
    // Only the primary's disposable approved cell; harness resets its test data.
    await migrateTestDatabase(process.env.TEST_DATABASE_URL!);
    ctx = await setupApp({ DATABASE_URL: process.env.TEST_DATABASE_URL! }); auth = ctx.app.get(AuthService);
    vi.spyOn(auth, "verifyAccessIdentity").mockImplementation(async assertion => ({
      iss: "https://test-only.cloudflareaccess.com", sub: `TEST_ONLY:${assertion}`, aud: "test-audience",
      email: `${assertion}@azdag.com`, normalizedEmail: `${assertion}@azdag.com`,
      authenticationTime: new Date(), tokenExpiresAt: new Date(Date.now() + 60_000),
    }));
    async function activated(): Promise<Account> {
      const admin = new AdminService(ctx.pool, ctx.config, auth), username = `elp204-collection-${randomUUID()}`;
      const made = await admin.createUser({ username, displayName: username, role: "USER" });
      const activation = await admin.resetCredential(made.userId);
      const initial = await auth.login({ assertion: username, username, credential: activation.activationToken });
      await auth.changePassword({ sessionToken: initial.token, csrfToken: initial.csrfToken,
        currentPassword: activation.activationToken, newPassword: password });
      const session = await auth.login({ assertion: username, username, credential: password });
      const user = (await auth.users.findById(made.userId))!;
      await new WorkspacesRepository(ctx.pool, ctx.config).ensurePersonal(user.userId, username);
      return { username, user, session, actor: { user_id: user.userId, session_id: session.sessionId, session_generation: user.sessionVersion } };
    }
    owner = await activated(); viewer = await activated(); delegator = await activated();
    await new OwnerAccessRepository(ctx.pool).claimOwner({ userId: owner.user.userId, claimedBy: "ELP204_COLLECTION_TEST_ONLY" });
  });
  afterAll(async () => { vi.restoreAllMocks(); if (ctx) await teardownApp(ctx); });

  async function workspace() {
    const id = next();
    await ctx.pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY exact command collection',$2)", [id, owner.user.userId]);
    await ctx.pool.query(`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES
      ($1,$2,'OWNER'),($1,$3,'MEMBER'),($1,$4,'MEMBER')`, [id, owner.user.userId, viewer.user.userId, delegator.user.userId]);
    return id;
  }
  async function fixture(kind: Resource["kind"] = "PORTFOLIO", environment: Environment = "paper", configured = true) {
    const ws = await workspace(), now = Date.now(), resource = { kind, id: next() }, repo = new AccessRepository(ctx.pool);
    const policy: ReviewedAccessPolicy = { workspace_id: ws, revision: next(), artifact_digest: accessDigest(next()), approval_ref: next(),
      state: "REVIEWED", qualification: "TEST_ONLY", protected_owner_user_id: owner.user.userId,
      researcher_fields: { state: "PENDING", policy_ref: null, fields: [] } };
    const membership = { revision: next(), mapping_revision: next(), receipt_id: next() };
    const grant: ScopedAccessGrant = { grant_id: next(), workspace_id: ws, subject_user_id: viewer.user.userId,
      action: "audit.read", effect: "ALLOW", selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: kind, ids: [resource.id] },
      environments: [environment], valid_from_ms: now - 1000, valid_until_ms: now + 600_000, delegable_actions: [],
      issued_by: owner.user.userId, parent_grant_id: null, revision: next(), policy_revision: policy.revision,
      revoked_at_ms: null, requires_ts_acceptance: true, field_policy_ref: null,
      ts_receipt: { receipt_id: membership.receipt_id, membership_revision: membership.revision,
        mapping_revision: membership.mapping_revision, effective_at_ms: now - 1000, expires_at_ms: now + 600_000 } };
    await repo.putPolicy(policy); await repo.saveGrant(grant, true);
    const trust: AccessTrustProvider = { verifyPolicy: async () => null, verifyReceipt: async () => null,
      relations: async () => ({ qualified: true, revision: membership.revision, own_alpha_ids: [],
        member_portfolio_ids: kind === "PORTFOLIO" ? [resource.id] : [], roots: {}, membership: { ...membership } }),
      verifiedHumanMapping: async id => ({ ts_user_id: `TEST_ONLY:ts:${id}`, revision: membership.mapping_revision }) };
    const access = new ExecutionAccessService(ctx.pool, auth, trust, true);
    const commandTrust: CommandTrust = { prepare: vi.fn(async () => { throw new Error("TEST_ONLY unexpected GET prepare"); }),
      send: vi.fn(async () => { throw new Error("TEST_ONLY unexpected GET send"); }),
      lookup: vi.fn(async () => { throw new Error("TEST_ONLY unexpected GET lookup"); }) };
    const commands = new ExecutionCommandService(ctx.pool, access, commandTrust, true, configured ? cursorKeys : undefined);
    return { workspace: ws, resource, environment, policy, membership, grant, repo, access, commandTrust, commands,
      store: new CommandStore(ctx.pool) };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;

  async function seed(f: Fixture, target = f.resource, environment = f.environment): Promise<CommandRecord> {
    const now = Date.now(), root = target.kind === "ROOT";
    const intent = commandIntent.parse({ schema_version: "execution.capital-intent.v2", workspace_id: f.workspace,
      resource: target, environment, expected_policy_revision: f.policy.revision,
      business_payload: { schema_version: "pma.capital-command.v1.1", operation: root ? "SET_ROOT_LIMIT" : "TOP_UP",
        idempotency_key: next(), recipient_kind: root ? "ROOT" : target.kind === "DEPLOYMENT" ? "DEPLOYMENT_ACCOUNT" : "PORTFOLIO",
        currency: "USDT", reason: "TEST_ONLY stored receipt; no PM send",
        ...(root ? { target_root_limit: "10.000000000000000001", expected_versions: { budget: "9007199254740993", source: "2" } }
          : { amount: "10.000000000000000001", expected_versions: { budget: "9007199254740993", source: "2", parent: "3" } }),
        ...(target.kind === "DEPLOYMENT" ? { recipient_deployment_id: target.id, recipient_account_id: next() } : {}) } });
    const hash = intentHash(viewer.actor, intent);
    const authorization = commandAuthorization.parse({ qualification: "TEST_ONLY", reference: next(), authority_ref: "TEST_ONLY:pm",
      profile_ref: `TEST_ONLY:${environment}`, audience: "pma.management.v1", actor_id: viewer.user.userId,
      ts_user_id: `TEST_ONLY:ts:${viewer.user.userId}`, workload_ref: "TEST_ONLY:workload", delegation_ref: "TEST_ONLY:delegation",
      mapping_revision: f.membership.mapping_revision, membership_revision: f.membership.revision,
      membership_receipt_ref: f.membership.receipt_id, workspace_id: f.workspace, environment, operation: intent.business_payload.operation,
      resource_kind: target.kind, resource_id: target.id, policy_revision: f.policy.revision, intent_hash: hash,
      source_intent_digest: accessDigest(["TEST_ONLY resolved intent", intent]).slice(7), expected_versions: intent.business_payload.expected_versions,
      issued_at_ms: now - 1000, expires_at_ms: now + 30_000, idempotency_retained_until_ms: now + 600_000,
      approval_required: false, required_approval_gate: null, approval: null, r2_basis: null,
      commit_checks: { human: true, workload: true, membership: true, scope: true, versions: true, capacity: true, approval: true } });
    const db = await ctx.pool.connect();
    try { await db.query("BEGIN"); const row = await f.store.insert(db, viewer.user.userId, intent, hash, authorization);
      await db.query("COMMIT"); return row;
    } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
  }

  async function mounted(f: Fixture, run: (http: { get(q?: Record<string, string>, token?: string | null): Promise<Response>;
    detail(id: string): Promise<Response>; preview(): Promise<Response> }) => Promise<void>, config: ControlApiConfig = ctx.config) {
    const app = await NestFactory.create<NestFastifyApplication>({ module: CommandCollectionTestModule,
      controllers: [ExecutionCommandController], providers: [SessionGuard,
        { provide: AuthService, useValue: auth }, { provide: CONTROL_API_CONFIG, useValue: config },
        { provide: WorkspacesRepository, useValue: new WorkspacesRepository(ctx.pool, config) },
        { provide: ExecutionCommandService, useValue: f.commands }] }, new FastifyAdapter(), { logger: false, abortOnError: false });
    try {
      app.useGlobalFilters(new HttpErrorFilter()); await app.register(cookiePlugin as never); await app.init();
      await app.getHttpAdapter().getInstance().ready(); const http = app.getHttpAdapter().getInstance() as FastifyInstance;
      const headers = (token: string | null) => token === null ? {} : { cookie: `${SESSION_COOKIE}=${token}` };
      await run({ get: (q = {}, token = viewer.session.token) => http.inject({ method: "GET", headers: headers(token),
        url: `/api/v1/execution/capital-commands?${new URLSearchParams({ workspace_id: f.workspace,
          resource_kind: f.resource.kind, resource_id: f.resource.id, environment: f.environment, ...q })}` }),
        detail: id => http.inject({ method: "GET", headers: headers(viewer.session.token),
          url: `/api/v1/execution/capital-commands/${id}?workspace_id=${encodeURIComponent(f.workspace)}` }),
        preview: () => http.inject({ method: "POST", headers: headers(viewer.session.token),
          url: "/api/v1/execution/capital-commands/preview", payload: {} }) });
    } finally { await app.close(); }
  }
  function page(response: Response): CommandCollection {
    expect(response.statusCode).toBe(200); expect(response.headers["cache-control"]).toContain("no-store");
    return commandCollection.parse(response.json());
  }
  function error(response: Response, status: number, code: string) {
    expect(response.statusCode).toBe(status); expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.json()).toMatchObject({ error: { code } });
  }

  it.each(["status", "workflow", "collection"] as const)("%s refuses a genuine session lease that expires after its final actual Core capture", async reader => {
    const f = await fixture(), record = await seed(f);
    const session = await auth.login({ assertion: viewer.username, username: viewer.username, credential: password });
    const actor = { ...viewer.actor, session_id: session.sessionId };
    const request = async () => reader === "status" ? f.commands.status(actor, f.workspace, record.id) : reader === "workflow"
      ? (await f.commands.workflow(actor, f.workspace, record.id)).status
      : (await f.commands.collection(actor, { workspace_id: f.workspace, resource_kind: f.resource.kind, resource_id: f.resource.id,
        environment: f.environment, limit: 25 })).items[0];
    expect(await request()).toEqual(record.status);
    const original = f.access.confirmReadContext.bind(f.access); let captured = false;
    const delay = vi.spyOn(f.access, "confirmReadContext").mockImplementation(async (...args) => {
      const row = (await ctx.pool.query(`UPDATE auth_sessions SET idle_expires_at=clock_timestamp()+interval '1500 milliseconds'
        WHERE session_id=$1 AND state='ACTIVE'
        RETURNING floor(extract(epoch FROM least(idle_expires_at,absolute_expires_at))*1000)::bigint AS ms`,
      [session.sessionId])).rows[0];
      const current = await original(...args), until = Number(row.ms);
      expect(current.actor_lease_until_ms).toBe(until); expect(current.now_ms).toBeLessThan(until);
      const wait = until-Date.now()+10; expect(wait).toBeGreaterThan(0); expect(wait).toBeLessThan(2600);
      await new Promise(resolve => setTimeout(resolve, wait)); captured = true; return current;
    });
    try {
      await expect(request())
        .rejects.toMatchObject({ code: "CURRENT_ACTOR_AUTHORITY_REQUIRED", status: 403 });
      expect(captured).toBe(true);
    } finally { delay.mockRestore(); }
    expect(await f.commands.status(viewer.actor, f.workspace, record.id)).toEqual(record.status);
    expect(f.commandTrust.prepare).not.toHaveBeenCalled(); expect(f.commandTrust.lookup).not.toHaveBeenCalled();
    expect(f.commandTrust.send).not.toHaveBeenCalled();
  }, 10_000);

  it.each(["ROOT", "PORTFOLIO", "DEPLOYMENT"] as const)("serves only exact %s status tuples, without private authorization bodies", async kind => {
    const f = await fixture(kind), record = await seed(f);
    await seed(f, { kind, id: next() }); await seed(f, f.resource, "sandbox");
    await mounted(f, async http => {
      const response = await http.get(), body = page(response);
      expect(body).toMatchObject({ family: "TRUSTED_CAPITAL_COMMANDS_ONLY", coverage: "EXACT_AUTHORIZED_RESOURCE_ONLY",
        resource: f.resource, environment: "paper", items: [record.status],
        page: { limit: 25, returned_count: 1, has_more: false, next_cursor: null } });
      expect(response.body).not.toMatch(/intent_hash|ts_user_id|workload_ref|delegation_ref|membership_receipt_ref|expected_versions|idempotency_key/);
      expect(Object.keys(body).sort()).toEqual(["schema_version", "family", "coverage", "resource", "environment", "items", "page"].sort());
    });
  });

  it("returns authorized empty, not a global queue or a grant inferred from zero rows", async () => {
    const f = await fixture();
    await mounted(f, async http => {
      expect(page(await http.get()).items).toEqual([]);
      error(await http.get({ resource_id: next() }), 404, "COMMAND_RESOURCE_NOT_FOUND");
    });
  });

  it.each(["business-only", "app-only-audit", "wrong-resource", "wrong-environment", "stale-receipt", "revoked"] as const)(
    "refuses %s before any status-candidate scan, regardless of hidden or absent rows", async variant => {
      const f = await fixture(); await seed(f); let g: ScopedAccessGrant = { ...f.grant, revision: next() };
      if (variant === "business-only") g = { ...g, action: "business.read_all" };
      if (variant === "app-only-audit") g = { ...g, requires_ts_acceptance: false, ts_receipt: null };
      if (variant === "wrong-resource") g = { ...g, selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: f.resource.kind, ids: [next()] } };
      if (variant === "wrong-environment") g = { ...g, environments: ["sandbox"] };
      if (variant === "stale-receipt") g = { ...g, ts_receipt: { ...g.ts_receipt!, membership_revision: next() } };
      if (variant === "revoked") g = { ...g, revoked_at_ms: Date.now() };
      await f.repo.saveGrant(g);
      const scan = vi.spyOn(CommandStore.prototype, "statusCandidates");
      try { await mounted(f, async http => {
        const hidden = await http.get(), absent = await http.get({ resource_id: next() });
        error(hidden, 404, "COMMAND_RESOURCE_NOT_FOUND"); expect(hidden.json()).toEqual(absent.json());
        expect(scan).not.toHaveBeenCalled();
      }); } finally { scan.mockRestore(); }
    });

  async function delegated(f: Fixture, effect: "ALLOW" | "DENY") {
    // Protected owner != delegator != actor. Intervals, selector and onward
    // actions deliberately satisfy the genuine current evaluator/validator.
    const ceiling: ScopedAccessGrant = { ...f.grant, grant_id: next(), subject_user_id: delegator.user.userId,
      action: "access.grant", delegable_actions: ["audit.read"], requires_ts_acceptance: false, ts_receipt: null,
      valid_from_ms: f.grant.valid_from_ms - 1000, valid_until_ms: f.grant.valid_until_ms! + 1000, revision: next() };
    await f.repo.saveGrant(ceiling, true);
    const context = await f.access.readContext(delegator.actor, f.workspace);
    validateDelegation(context, { subject_user_id: viewer.user.userId, action: "audit.read", effect,
      selector: f.grant.selector, environments: f.grant.environments, valid_from_ms: f.grant.valid_from_ms,
      valid_until_ms: f.grant.valid_until_ms, delegable_actions: [], ceiling_grant_id: ceiling.grant_id,
      expected_ceiling_revision: ceiling.revision, expected_policy_revision: f.policy.revision,
      expected_ts_membership_revision: f.membership.revision, reason: "TEST_ONLY reachable delegated graph" });
    const leaf: ScopedAccessGrant = { ...f.grant, grant_id: next(), effect, issued_by: delegator.user.userId,
      parent_grant_id: ceiling.grant_id, revision: next() };
    await f.repo.saveGrant(leaf, true); return leaf;
  }
  it("a genuine delegated DENY keeps its app-only access.grant ancestor and blocks collection before SQL AND detail", async () => {
    const f = await fixture(), record = await seed(f); await delegated(f, "DENY");
    expect(evaluateAccess(await f.access.readContext(viewer.actor, f.workspace), "audit.read", f.resource, f.environment).allowed).toBe(false);
    const scan = vi.spyOn(CommandStore.prototype, "statusCandidates"), detail = vi.spyOn(CommandStore.prototype, "workflowCandidate");
    try { await mounted(f, async http => {
      error(await http.get(), 404, "COMMAND_RESOURCE_NOT_FOUND"); expect(scan).not.toHaveBeenCalled();
      error(await http.detail(record.id), 404, "COMMAND_RESOURCE_NOT_FOUND"); expect(detail).toHaveBeenCalled();
    }); } finally { scan.mockRestore(); detail.mockRestore(); }
  });
  it("an accepted delegated audit ALLOW retains a valid app-only access.grant parent without rescuing app-only audit leaves", async () => {
    const f = await fixture(), record = await seed(f);
    await f.repo.saveGrant({ ...f.grant, revoked_at_ms: Date.now(), revision: next() });
    await delegated(f, "ALLOW");
    await mounted(f, async http => { expect(page(await http.get()).items).toEqual([record.status]);
      expect((await http.detail(record.id)).statusCode).toBe(200); });
  });

  it.each(["command-id", "resource", "environment", "malformed"] as const)("rejects visible %s status corruption rather than omitting it", async variant => {
    const f = await fixture(), record = await seed(f);
    const status: Record<string, unknown> = structuredClone(record.status);
    if (variant === "command-id") status.command_id = missing;
    if (variant === "resource") status.resource = { ...f.resource, id: next() };
    if (variant === "environment") status.environment = "sandbox";
    if (variant === "malformed") status.business = { state: "UNKNOWN", PRIVATE_SQL: "TEST_ONLY_HIDDEN" };
    // Deliberate TEST_ONLY persistence corruption, NOT an accepted source receipt.
    await ctx.pool.query("UPDATE execution_trusted_commands SET status=$2 WHERE command_id=$1", [record.id, status]);
    await mounted(f, async http => {
      const response = await http.get(); error(response, 503, variant === "malformed" ? "COMMAND_UNAVAILABLE" : "COMMAND_STATUS_UNVERIFIED");
      expect(response.body).not.toMatch(/TEST_ONLY_HIDDEN|PRIVATE_SQL/);
    });
  });

  /** Explicit bounded persistence fixtures for deterministic ties/read limits.
   * These use valid closed DTOs but bypass ordinary intake's 100-pending and
   * 1024-total checks, only to exercise read defense. No grant/source/send is
   * implied. A normal CommandStore seed provides the template and provenance. */
  async function bulk(f: Fixture, base: CommandRecord, count: number, sameClock = false): Promise<CommandStatus[]> {
    const rows = Array.from({ length: count }, (_, index) => {
      const id = `ecm_${randomUUID().replaceAll("-", "")}`, intent = structuredClone(base.intent);
      intent.business_payload.idempotency_key = next(); const hash = intentHash(viewer.actor, intent);
      const clock = sameClock ? base.status.created_at_ms : base.status.created_at_ms + index + 1;
      const status = commandStatus.parse({ ...base.status, command_id: id, created_at_ms: clock, updated_at_ms: clock,
        delivery: "ACKNOWLEDGED", business: { state: "APPLIED", receipt_ref: "TEST_ONLY:synthetic-applied",
          source_event_ref: "TEST_ONLY:synthetic-event", revision: "9223372036854775807",
          amounts: { requested: "10.000000000000000001", applied: "10.000000000000000001", pending: "0", cancelled: "0", rejected: "0" } },
        projection: "CATCHING_UP", venue: "NOT_APPLICABLE", next_action: "REVIEW_RECEIPT" });
      const authorization = commandAuthorization.parse({ ...base.authorization, intent_hash: hash,
        source_intent_digest: accessDigest(["TEST_ONLY bulk resolved intent", intent]).slice(7) });
      return { id, key_hash: accessDigest(intent.business_payload.idempotency_key), hash, intent, auth_fact: authorization, status, clock };
    });
    await ctx.pool.query(`INSERT INTO execution_trusted_commands
      (command_id,workspace_id,actor_user_id,key_hash,intent_hash,intent,authorization_fact,status,created_at_ms,updated_at_ms)
      SELECT x.id,$2,$3,x.key_hash,x.hash,x.intent,x.auth_fact,x.status,x.clock,x.clock
      FROM jsonb_to_recordset($1::jsonb) AS x(id text,key_hash text,hash text,intent jsonb,auth_fact jsonb,status jsonb,clock bigint)`,
      [JSON.stringify(rows), f.workspace, viewer.user.userId]);
    return rows.map(row => row.status);
  }
  it("orders timestamp ties by exact id and walks without duplicates, retaining valid delivery/business distinctions", async () => {
    const f = await fixture(), first = await seed(f), added = await bulk(f, first, 3, true);
    const expected = [first.status, ...added].sort((a, b) => a.command_id < b.command_id ? -1 : 1);
    await mounted(f, async http => {
      const one = page(await http.get({ limit: "2" })), two = page(await http.get({ limit: "2", after: one.page.next_cursor! }));
      expect([...one.items, ...two.items]).toEqual(expected); expect(new Set([...one.items, ...two.items].map(x => x.command_id)).size).toBe(4);
      expect(one.page.has_more).toBe(true); expect(two.page).toMatchObject({ returned_count: 2, has_more: false, next_cursor: null });
      expect(added[0].business.amounts!.applied).toBe("10.000000000000000001");
    });
  });
  it("hidden target additions/status changes do not alter an existing authorized cursor", async () => {
    const f = await fixture(), first = await seed(f); await bulk(f, first, 2);
    const hidden = await seed(f, { ...f.resource, id: next() });
    await mounted(f, async http => {
      const one = page(await http.get({ limit: "1" })), before = page(await http.get({ limit: "1", after: one.page.next_cursor! }));
      await seed(f, hidden.intent.resource);
      await f.store.update(f.workspace, hidden.id, null, old => ({ ...old.status, projection: "STALE" }));
      const after = page(await http.get({ limit: "1", after: one.page.next_cursor! }));
      // Cursor issued_at may move at second boundaries: compare delivery content
      // and next-cursor payload through successful traversal, not ciphertext time.
      expect(after.items).toEqual(before.items); expect(after.page.has_more).toBe(before.page.has_more);
      expect(page(await http.get({ limit: "1" })).items).toEqual(one.items);
    });
  });
  it("a visible status update invalidates continuation instead of mixing snapshots", async () => {
    const f = await fixture(), first = await seed(f); await bulk(f, first, 2);
    await mounted(f, async http => {
      const one = page(await http.get({ limit: "1" }));
      await f.store.update(f.workspace, first.id, null, old => ({ ...old.status, projection: "STALE" }));
      error(await http.get({ limit: "1", after: one.page.next_cursor! }), 409, "COMMAND_COLLECTION_CURSOR_CHANGED");
    });
  });
  it("cursors cannot authorize a different limit, resource, workspace, session or actor", async () => {
    const f = await fixture(), first = await seed(f); await bulk(f, first, 1);
    const session = await auth.login({ assertion: viewer.username, username: viewer.username, credential: password });
    await mounted(f, async http => {
      const one = page(await http.get({ limit: "1" })), after = one.page.next_cursor!;
      error(await http.get({ limit: "2", after }), 409, "COMMAND_COLLECTION_CURSOR_CHANGED");
      error(await http.get({ limit: "1", after }, session.token), 409, "COMMAND_COLLECTION_CURSOR_CHANGED");
      error(await http.get({ limit: "1", after, resource_id: next() }), 404, "COMMAND_RESOURCE_NOT_FOUND");
      error(await http.get({ limit: "1", after }, delegator.session.token), 404, "COMMAND_RESOURCE_NOT_FOUND");
      const other = await fixture();
      // The test adapter's legacy TEST_ONLY membership must be coherent for
      // both workspaces; otherwise this would test source absence (404), not
      // an independently authorized cross-workspace cursor mismatch (409).
      await other.repo.saveGrant({ ...other.grant, ts_receipt: { ...other.grant.ts_receipt!,
        receipt_id: f.membership.receipt_id, membership_revision: f.membership.revision,
        mapping_revision: f.membership.mapping_revision } });
      error(await http.get({ limit: "1", after, workspace_id: other.workspace, resource_id: other.resource.id }), 409, "COMMAND_COLLECTION_CURSOR_CHANGED");
    });
  });
  it("malformed cursors are finite 400 rather than SQL or decoding diagnostics", async () => {
    const f = await fixture();
    await mounted(f, async http => {
      const response = await http.get({ after: "TEST_ONLY:not-a-signed-cursor" });
      error(response, 400, "COMMAND_COLLECTION_CURSOR_INVALID"); expect(response.body).not.toMatch(/SyntaxError|SELECT|stack|HMAC/);
    });
  });

  it.each(["grant", "session"] as const)("a real %s revoke after actual status read prevents delivery", async variant => {
    const f = await fixture(); await seed(f);
    const session = await auth.login({ assertion: viewer.username, username: viewer.username, credential: password });
    const original = CommandStore.prototype.statusCandidates; let changed = false;
    const intercepted = vi.spyOn(CommandStore.prototype, "statusCandidates").mockImplementation(async function (this: CommandStore, ...args) {
      const rows = await original.apply(this, args); // real PG + completed read-only transaction
      if (args[0] === f.workspace && !changed) { changed = true;
        if (variant === "grant") await f.repo.saveGrant({ ...f.grant, revoked_at_ms: Date.now(), revision: next() });
        else await ctx.pool.query("UPDATE auth_sessions SET state='REVOKED',revoked_at=clock_timestamp(),revoke_reason='TEST_ONLY collection race' WHERE session_id=$1", [session.sessionId]);
      }
      return rows;
    });
    try { await mounted(f, async http => {
      const response = await http.get({}, session.token); expect(changed).toBe(true);
      error(response, variant === "grant" ? 409 : 403, variant === "grant" ? "ACCESS_RETRY_REQUIRED" : "CURRENT_ACTOR_AUTHORITY_REQUIRED");
      expect(response.body).not.toContain(f.resource.id);
      const subsequent = await http.get({}, session.token); expect(subsequent.statusCode).toBe(variant === "grant" ? 404 : 401);
    }); } finally { intercepted.mockRestore(); }
  });

  it.each(invalidQueries)(
    "strict collection query refuses %j before scan", async q => {
      const f = await fixture(), scan = vi.spyOn(CommandStore.prototype, "statusCandidates");
      try { await mounted(f, async http => { error(await http.get(q), 400, "COMMAND_INPUT_INVALID"); expect(scan).not.toHaveBeenCalled(); }); }
      finally { scan.mockRestore(); }
    });

  it.each(["bad-cursor", "overflow", "corrupt-status", "loader"] as const)(
    "collection %s cannot bypass the final Core grant fence", async failure => {
      const f = await fixture(), record = await seed(f);
      if (failure === "overflow") await bulk(f, record, 1024); // Actual1025-row census, not a duplicated lookahead mock.
      const original = CommandStore.prototype.statusCandidates; let reached = false;
      const scan = vi.spyOn(CommandStore.prototype, "statusCandidates").mockImplementation(async function (this: CommandStore, ...args) {
        const rows = await original.apply(this, args);
        if (args[0] !== f.workspace) return rows;
        reached = true;
        await f.repo.saveGrant({ ...f.grant, revoked_at_ms: Date.now(), revision: next() });
        if (failure === "loader") throw new Error("PRIVATE_COLLECTION_DIAGNOSTIC SELECT private_source");
        if (failure === "corrupt-status") return rows.map((row, index) => index ? row : {
          ...row, status: { PRIVATE_SQL: "PRIVATE_COLLECTION_DIAGNOSTIC" } });
        return rows;
      });
      try { await mounted(f, async http => {
        const response = await http.get(failure === "bad-cursor" ? { after: "TEST_ONLY:not-a-signed-cursor" } : {});
        expect(reached).toBe(true); error(response, 409, "ACCESS_RETRY_REQUIRED");
        expect(response.body).not.toMatch(/PRIVATE_COLLECTION_DIAGNOSTIC|PRIVATE_SQL|SELECT|SyntaxError|HMAC/);
        expect(response.body).not.toContain(record.id);
      }); } finally { scan.mockRestore(); }
    });

  it("collection rejects corrupt rows outside the requested page instead of silently returning a partial trusted cohort", async () => {
    const f = await fixture(), first = await seed(f); await bulk(f, first, 2);
    const original = CommandStore.prototype.statusCandidates;
    const scan = vi.spyOn(CommandStore.prototype, "statusCandidates").mockImplementation(async function (this: CommandStore, ...args) {
      const rows = await original.apply(this, args);
      if (args[0] !== f.workspace) return rows;
      // Cursor census validates every authorized row, not just the selected
      // first page. Keep the newest rows valid, corrupt the oldest status.
      const oldest = rows.reduce((a, b) => (a.status as CommandStatus).created_at_ms < (b.status as CommandStatus).created_at_ms ? a : b);
      return rows.map(row => row === oldest ? { ...row, status: { PRIVATE_SQL: "PRIVATE_LOOKAHEAD_DIAGNOSTIC" } } : row);
    });
    try { await mounted(f, async http => {
      const response = await http.get({ limit: "1" }); error(response, 503, "COMMAND_UNAVAILABLE");
      expect(response.body).not.toMatch(/PRIVATE_LOOKAHEAD_DIAGNOSTIC|PRIVATE_SQL/);
    }); } finally { scan.mockRestore(); }
  });

  it("a genuine renewed Core session replaces the initial lease after a delayed census", async () => {
    const f = await fixture(), record = await seed(f);
    const session = await auth.login({ assertion: viewer.username, username: viewer.username, credential: password });
    const actor = { ...viewer.actor, session_id: session.sessionId };
    let initialDeadline: number | undefined, initialContext = true, delayed = false;
    const readContext = f.access.readContext.bind(f.access), census = CommandStore.prototype.statusCandidates;
    const capture = vi.spyOn(f.access, "readContext").mockImplementation(async (...args) => {
      if (initialContext && args[0].session_id === session.sessionId && args[1] === f.workspace) {
        initialContext = false;
        await ctx.pool.query("UPDATE auth_sessions SET idle_expires_at=clock_timestamp()+interval '1500 milliseconds' WHERE session_id=$1 AND state='ACTIVE'", [session.sessionId]);
        const current = await readContext(...args); initialDeadline = current.actor_lease_until_ms;
        expect(Number.isSafeInteger(initialDeadline)).toBe(true); return current;
      }
      return readContext(...args);
    });
    const scan = vi.spyOn(CommandStore.prototype, "statusCandidates").mockImplementation(async function (this: CommandStore, ...args) {
      const rows = await census.apply(this, args);
      if (args[0] !== f.workspace) return rows;
      // Renew BEFORE the original genuine lease expires: no expired-session
      // resurrection. Then cross the old deadline outside all read locks.
      const renewed = await ctx.pool.query(`UPDATE auth_sessions SET idle_expires_at=clock_timestamp()+interval '10 minutes'
        WHERE session_id=$1 AND state='ACTIVE' AND idle_expires_at>clock_timestamp() AND absolute_expires_at>clock_timestamp()
        RETURNING floor(extract(epoch FROM least(idle_expires_at,absolute_expires_at))*1000)::bigint AS ms`, [session.sessionId]);
      expect(renewed.rowCount).toBe(1); expect(Number(renewed.rows[0].ms)).toBeGreaterThan(initialDeadline!);
      const wait = initialDeadline! - Date.now() + 10; expect(wait).toBeGreaterThan(0); expect(wait).toBeLessThan(2600);
      await new Promise(resolve => setTimeout(resolve, wait)); delayed = true; return rows;
    });
    try {
      const result = await f.commands.collection(actor, { workspace_id: f.workspace, resource_kind: f.resource.kind,
        resource_id: f.resource.id, environment: f.environment, limit: 25 });
      expect(delayed).toBe(true); expect(Date.now()).toBeGreaterThan(initialDeadline!);
      expect(result.items).toEqual([record.status]);
    } finally { scan.mockRestore(); capture.mockRestore(); }
    expect(f.commandTrust.prepare).not.toHaveBeenCalled(); expect(f.commandTrust.send).not.toHaveBeenCalled();
    expect(f.commandTrust.lookup).not.toHaveBeenCalled();
  }, 10_000);

  it.each(["bad-cursor", "overflow", "corrupt-status", "loader"] as const)(
    "collection %s is constructed or held BEFORE the last actual Core confirmation", async failure => {
      const f = await fixture(), record = await seed(f), trace: string[] = [];
      if (failure === "overflow") await bulk(f, record, 1024);
      const census = CommandStore.prototype.statusCandidates, confirm = f.access.confirmReadContext.bind(f.access);
      const decode = KeysetCursorCodec.prototype.decode;
      const cursor = vi.spyOn(KeysetCursorCodec.prototype, "decode").mockImplementation(function (this: KeysetCursorCodec, ...args) {
        trace.push("failure"); return decode.apply(this, args);
      });
      const scan = vi.spyOn(CommandStore.prototype, "statusCandidates").mockImplementation(async function (this: CommandStore, ...args) {
        const rows = await census.apply(this, args);
        if (args[0] !== f.workspace) return rows;
        if (failure === "loader") { trace.push("failure"); throw new Error("PRIVATE_COLLECTION_DIAGNOSTIC"); }
        if (failure === "overflow") return new Proxy(rows, { get(target, property, receiver) {
          if (property === "length") trace.push("failure"); return Reflect.get(target, property, receiver);
        } });
        if (failure === "corrupt-status") {
          Object.defineProperty(rows[0], "status", { enumerable: true, get() {
            trace.push("failure"); return { PRIVATE_SQL: "PRIVATE_COLLECTION_DIAGNOSTIC" };
          } });
        }
        return rows;
      });
      const final = vi.spyOn(f.access, "confirmReadContext").mockImplementation(async (...args) => {
        const current = await confirm(...args); trace.push("confirmed"); return current;
      });
      try { await mounted(f, async http => {
        const response = await http.get(failure === "bad-cursor" ? { after: "TEST_ONLY:not-a-signed-cursor" } : {});
        error(response, failure === "bad-cursor" ? 400 : 503,
          failure === "bad-cursor" ? "COMMAND_COLLECTION_CURSOR_INVALID" : failure === "overflow" ? "COMMAND_COLLECTION_OVERFLOW" : "COMMAND_UNAVAILABLE");
        expect(trace).toContain("failure"); expect(trace.at(-1)).toBe("confirmed");
        expect(trace.lastIndexOf("confirmed")).toBeGreaterThan(trace.lastIndexOf("failure"));
        expect(response.body).not.toMatch(/PRIVATE_COLLECTION_DIAGNOSTIC|PRIVATE_SQL|SELECT|SyntaxError|HMAC/);
      }); } finally { scan.mockRestore(); final.mockRestore(); cursor.mockRestore(); }
    });

  it("missing login is 401 and missing cursor configuration fails honestly after authorization", async () => {
    const f = await fixture("PORTFOLIO", "paper", false), scan = vi.spyOn(CommandStore.prototype, "statusCandidates");
    try { await mounted(f, async http => {
      expect((await http.get({}, null)).statusCode).toBe(401);
      error(await http.get(), 503, "COMMAND_COLLECTION_NOT_CONFIGURED"); expect(scan).not.toHaveBeenCalled();
    }); } finally { scan.mockRestore(); }
  });
  it.each([1024, 1025])("explicit persisted %i-row defense is complete or finite overflow, never a silently truncated page", async total => {
    const f = await fixture(), base = await seed(f); await bulk(f, base, total - 1);
    await mounted(f, async http => {
      const response = await http.get({ limit: "100" });
      if (total === 1025) error(response, 503, "COMMAND_COLLECTION_OVERFLOW");
      else { const body = page(response); expect(body.items).toHaveLength(100); expect(body.page).toMatchObject({ limit: 100, returned_count: 100, has_more: true }); }
    });
  });
  it("store failures are sanitized, without source calls or diagnostic prose", async () => {
    const f = await fixture(), failure = vi.spyOn(CommandStore.prototype, "statusCandidates").mockRejectedValueOnce(new Error("SELECT secret FROM private_relation; PRIVATE_KEY"));
    try { await mounted(f, async http => { const response = await http.get(); error(response, 503, "COMMAND_UNAVAILABLE");
      expect(response.body).not.toMatch(/private_relation|PRIVATE_KEY|SELECT secret|stack/); }); }
    finally { failure.mockRestore(); }
  });
  it("retained mode exempts ONLY collection's Core read; mutations and neighboring detail retain their source fences", async () => {
    const f = await fixture(), record = await seed(f), source = await workspace();
    // Remove actor's source entry: collection relies on genuine Core grants,
    // whereas a non-Core retained route must still refuse source access.
    await ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [source, viewer.user.userId]);
    const config: ControlApiConfig = { ...ctx.config, EXECUTION_READ_PROFILE: "retained_review_v1",
      FEATURE_EXECUTION_LOCAL_PROJECTION: "true", EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: source };
    const detail = vi.spyOn(f.commands, "status"), preview = vi.spyOn(f.commands, "preview");
    try { await mounted(f, async http => {
      expect(page(await http.get()).items).toEqual([record.status]);
      expect((await http.detail(record.id)).statusCode).toBe(404); expect(detail).not.toHaveBeenCalled();
      expect((await http.preview()).statusCode).toBe(403); expect(preview).not.toHaveBeenCalled();
    }, config); } finally { detail.mockRestore(); preview.mockRestore(); }
  });
  it("GET never sends, looks up, recovers, reconciles, mutates commands or writes command/audit history", async () => {
    const f = await fixture(), record = await seed(f);
    const ledger = async () => (await ctx.pool.query(`SELECT c.status,c.updated_at_ms,c.attempt_id,
      (SELECT count(*)::int FROM execution_trusted_command_events e WHERE e.command_id=c.command_id) AS command_events,
      (SELECT count(*)::int FROM product_audit_events a WHERE a.aggregate_id=c.command_id) AS audit_events
      FROM execution_trusted_commands c WHERE c.workspace_id=$1 AND c.command_id=$2`, [f.workspace, record.id])).rows[0];
    const before = await ledger(), recover = vi.spyOn(f.commands, "recover"), reconcile = vi.spyOn(f.commands, "reconcile"),
      submit = vi.spyOn(f.commands, "submit"), preview = vi.spyOn(f.commands, "preview");
    try { await mounted(f, async http => { page(await http.get()); page(await http.get()); });
      expect(await ledger()).toEqual(before);
      for (const call of [recover, reconcile, submit, preview, f.commandTrust.prepare, f.commandTrust.send, f.commandTrust.lookup]) expect(call).not.toHaveBeenCalled();
    } finally { recover.mockRestore(); reconcile.mockRestore(); submit.mockRestore(); preview.mockRestore(); }
  });
});
