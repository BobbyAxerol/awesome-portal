/** Actual disposable PostgreSQL + mounted Nest/Fastify/SessionGuard.
 * All acceptance/membership providers below are TEST_ONLY, not installed TS
 * authority. Existing detail/native-proof matrices stay in their own suites;
 * repeated focused/hook executions are never counted as new unique coverage.
 */
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import cookiePlugin from "@fastify/cookie";
import type { FastifyInstance } from "fastify";
import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AdminService } from "../src/admin/admin.service";
import { AuthService } from "../src/auth/auth.service";
import { SESSION_COOKIE } from "../src/auth/cookies";
import type { ControlApiConfig } from "../src/config";
import { SessionGuard } from "../src/facade/session.guard";
import { HttpErrorFilter } from "../src/http-error.filter";
import { KeysetCursorCodec } from "../src/query/cursor";
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { SessionsRepository } from "../src/repos/sessions";
import { WorkspacesRepository } from "../src/repos/workspaces";
import { CONTROL_API_CONFIG } from "../src/tokens";
import { ExecutionOperationsRepository } from "../src/operations/operations.repository";
import { ExecutionF0ReadController } from "../src/operations/f0-read.controller";
import { ExecutionF0ReadService } from "../src/operations/f0-read.service";
import { f0Collection, f0BlockedOperation, type F0Collection } from "../src/operations/f0-read.contract";
import type { AccessActor, AccessResource, ReviewedAccessPolicy, ScopedAccessGrant } from "../src/execution-v2/access.contract";
import { accessDigest, evaluateAccess, validateDelegation, type AccessRelations } from "../src/execution-v2/access-policy";
import { AccessRepository } from "../src/execution-v2/access.repository";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import type { AccessTrustProvider } from "../src/execution-v2/access-trust";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const URL = process.env.TEST_DATABASE_URL;
const next = () => `TEST_ONLY:${randomUUID()}`;
const password = "TEST-only-F0-collection-correct-horse-battery-2026";
const secret = "TEST_ONLY_PRIVATE_SQL_PAYLOAD_MUST_NOT_ESCAPE";
const contracts = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const commandProblem = new Ajv2020({ strict: true, allErrors: true }).compile(JSON.parse(readFileSync(
  resolve(contracts, "openapi/execution-trusted-commands.openapi.json"), "utf8")).components.schemas.CommandProblem);
const cursorKeys = { activeKeyId: "test-only", keys: {
  "test-only": "TEST_ONLY_f0_collection_cursor_not_product_0123456789" }, ttlSeconds: 900 };
const environments = ["paper", "sandbox", "live"] as const;
type Environment = typeof environments[number];
type Kind = "ACCOUNT" | "PORTFOLIO" | "DEPLOYMENT";
type Response = { statusCode: number; headers: Record<string, unknown>; body: string; json(): unknown };
type Http = { get(q?: Record<string, string>, token?: string | null): Promise<Response>;
  raw(q: string | null): Promise<Response>; detail(id: string): Promise<Response> };
@Module({}) class F0CollectionTestModule {}

describe.skipIf(!URL)("ELP2-04 F0-only exact-own collection / actual PG HTTP / TEST_ONLY", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>, auth: AuthService;
  type Account = { username: string; user: NonNullable<Awaited<ReturnType<AuthService["users"]["findById"]>>>;
    session: Awaited<ReturnType<AuthService["login"]>>; actor: AccessActor };
  let owner: Account, creator: Account, delegator: Account;
  beforeAll(async () => {
    // Destructive harness setup: ONLY Main's explicitly disposable test DB.
    await migrateTestDatabase(URL!); ctx = await setupApp({ DATABASE_URL: URL! }); auth = ctx.app.get(AuthService);
    vi.spyOn(auth, "verifyAccessIdentity").mockImplementation(async assertion => ({
      iss: "https://test-only.cloudflareaccess.com", sub: `TEST_ONLY:${assertion}`, aud: "test-audience",
      email: `${assertion}@azdag.com`, normalizedEmail: `${assertion}@azdag.com`,
      authenticationTime: new Date(), tokenExpiresAt: new Date(Date.now() + 600_000),
    }));
    async function activated(): Promise<Account> {
      const admin = new AdminService(ctx.pool, ctx.config, auth), username = `elp204-f0-list-${randomUUID()}`;
      const made = await admin.createUser({ username, displayName: username, role: "USER" });
      const activation = await admin.resetCredential(made.userId);
      const initial = await auth.login({ assertion: username, username, credential: activation.activationToken });
      await auth.changePassword({ sessionToken: initial.token, csrfToken: initial.csrfToken,
        currentPassword: activation.activationToken, newPassword: password });
      const session = await auth.login({ assertion: username, username, credential: password });
      const user = (await auth.users.findById(made.userId))!;
      await new WorkspacesRepository(ctx.pool, ctx.config).ensurePersonal(user.userId, username);
      return { username, user, session, actor: { user_id: user.userId,
        session_id: session.sessionId, session_generation: user.sessionVersion } };
    }
    owner = await activated(); creator = await activated(); delegator = await activated();
    await new OwnerAccessRepository(ctx.pool).claimOwner({ userId: owner.user.userId, claimedBy: "ELP204_F0_COLLECTION_TEST_ONLY" });
  });
  afterAll(async () => { vi.restoreAllMocks(); if (ctx) await teardownApp(ctx); });
  const dbNow = async () => Number((await ctx.pool.query(
    "SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0].ms);
  async function workspace() {
    const ws = next();
    await ctx.pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY F0 collection',$2)", [ws, owner.user.userId]);
    for (const account of [owner, creator, delegator]) await ctx.pool.query(
      "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,$3)",
      [ws, account.user.userId, account === owner ? "OWNER" : "MEMBER"]);
    return ws;
  }
  async function fixture(kind: Kind = "PORTFOLIO", environment: Environment = "paper", configured = true) {
    const ws = await workspace(), now = await dbNow(), resource: AccessResource = { kind, id: next() };
    const repo = new AccessRepository(ctx.pool), operations = new ExecutionOperationsRepository(ctx.pool);
    const policy: ReviewedAccessPolicy = { workspace_id: ws, revision: next(), artifact_digest: accessDigest(next()), approval_ref: next(),
      state: "REVIEWED", qualification: "TEST_ONLY", protected_owner_user_id: owner.user.userId,
      researcher_fields: { state: "PENDING", policy_ref: null, fields: [] } };
    const membership = { receipt_id: next(), revision: next(), mapping_revision: next() };
    const grant: ScopedAccessGrant = { grant_id: next(), workspace_id: ws, subject_user_id: creator.user.userId,
      action: "audit.read", effect: "ALLOW", selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: kind, ids: [resource.id] },
      environments: [environment], valid_from_ms: now - 60_000, valid_until_ms: now + 600_000, delegable_actions: [],
      issued_by: owner.user.userId, parent_grant_id: null, revision: next(), policy_revision: policy.revision,
      revoked_at_ms: null, requires_ts_acceptance: true, field_policy_ref: null,
      ts_receipt: { receipt_id: membership.receipt_id, membership_revision: membership.revision,
        mapping_revision: membership.mapping_revision, effective_at_ms: now - 1000, expires_at_ms: now + 600_000 } };
    await repo.putPolicy(policy); await repo.saveGrant(grant, true);
    const relations: AccessRelations = { qualified: true, revision: membership.revision,
      own_alpha_ids: [], member_portfolio_ids: [], roots: {}, membership: { ...membership } };
    const forbidden = vi.fn(async () => { throw new Error(`TEST_ONLY forbidden source/command IO ${secret}`); });
    const trust: AccessTrustProvider = { verifyPolicy: forbidden, verifyReceipt: forbidden,
      relations: vi.fn(async () => structuredClone(relations)), verifiedHumanMapping: forbidden, readPublication: forbidden };
    const access = new ExecutionAccessService(ctx.pool, auth, trust, true);
    const service = new ExecutionF0ReadService(operations, access, configured ? cursorKeys : undefined);
    return { workspace: ws, resource, environment, repo, operations, policy, membership, grant, relations, forbidden, trust, access, service };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function replaceGrant(f: Fixture, patch: Partial<ScopedAccessGrant>) {
    f.grant = { ...f.grant, ...patch, revision: next() }; await f.repo.saveGrant(f.grant);
  }
  async function seed(f: Fixture, q: { author?: Account; resource?: AccessResource; environment?: Environment;
    key?: string; warnings?: string[] } = {}) {
    const target = q.resource ?? f.resource;
    return (await f.operations.create({ operationId: next(), workspaceId: f.workspace,
      actorUserId: (q.author ?? creator).user.userId, requestKey: next(), commandKey: q.key ?? "account/sync",
      environment: (q.environment ?? f.environment).toUpperCase() as "PAPER" | "SANDBOX" | "LIVE",
      targetType: target.kind, targetId: target.id, expectedTargetVersion: 1,
      payloadHash: accessDigest([secret, "payload"]), planDigest: accessDigest([secret, "plan"]), conditions: [], riskTier: "R2_SANDBOX",
      blockerCodes: ["COMMAND_RELAY_DISABLED"], warningCodes: q.warnings ?? [], expiresAt: new Date(Date.now() + 300_000),
      requestId: next(), auditEventId: next() })).record;
  }
  /** Valid immutable persisted fixtures. Explicit times avoid flaky tie tests;
   * no UPDATE/DELETE, trigger disable, source acceptance or queue is fabricated.
   * Only read-bound stress uses this fast INSERT rather than planning N times. */
  async function bulk(f: Fixture, count: number, q: { author?: Account; resource?: AccessResource;
    environment?: Environment; created?: number; warnings?: string[]; firstId?: string } = {}) {
    const target = q.resource ?? f.resource, created = q.created ?? await dbNow() - 600_000;
    const ids = Array.from({ length: count }, (_, index) => index === 0 && q.firstId !== undefined ? q.firstId : next());
    await ctx.pool.query(`INSERT INTO execution_command_plans_f0(operation_id,workspace_id,actor_user_id,request_key,
      command_key,environment,target_type,target_id,expected_target_version,payload_hash,plan_digest,payload_json,
      conditions,risk_tier,blocker_codes,warning_codes,expires_at,created_at,updated_at)
      SELECT x,$2,$3,x,'account/sync',$4,$5,$6,1,$7,$8,'{}','[]','R2_SANDBOX',
      ARRAY['COMMAND_RELAY_DISABLED'],$9::text[],to_timestamp(($10::double precision+300000)/1000),
      to_timestamp($10::double precision/1000),to_timestamp($10::double precision/1000)
      FROM unnest($1::text[]) AS x`, [ids, f.workspace, (q.author ?? creator).user.userId,
      (q.environment ?? f.environment).toUpperCase(), target.kind, target.id,
      accessDigest("TEST_ONLY:bulk-payload"), accessDigest("TEST_ONLY:bulk-plan"), q.warnings ?? [], created]);
    return ids;
  }
  async function mounted(f: Fixture, run: (http: Http) => Promise<void>, config: ControlApiConfig = ctx.config, service = f.service) {
    const app = await NestFactory.create<NestFastifyApplication>({ module: F0CollectionTestModule,
      controllers: [ExecutionF0ReadController], providers: [SessionGuard,
        { provide: AuthService, useValue: auth }, { provide: CONTROL_API_CONFIG, useValue: config },
        { provide: WorkspacesRepository, useValue: new WorkspacesRepository(ctx.pool, config) },
        { provide: ExecutionF0ReadService, useValue: service }] }, new FastifyAdapter(), { logger: false, abortOnError: false });
    try {
      app.useGlobalFilters(new HttpErrorFilter()); await app.register(cookiePlugin as never); await app.init();
      await app.getHttpAdapter().getInstance().ready(); const http = app.getHttpAdapter().getInstance() as FastifyInstance;
      const fields = { workspace_id: f.workspace, resource_kind: f.resource.kind, resource_id: f.resource.id, environment: f.environment };
      const headers = (token: string | null) => ({ "x-request-id": "TEST_ONLY-f0-collection",
        ...(token === null ? {} : { cookie: `${SESSION_COOKIE}=${token}` }) });
      const inject = (query: string | null, token: string | null) => http.inject({ method: "GET", headers: headers(token),
        url: `/api/v1/execution/operations/f0${query === null ? "" : `?${query}`}` });
      await run({ get: (q = {}, token = creator.session.token) => inject(new URLSearchParams({ ...fields, ...q }).toString(), token),
        raw: q => inject(q, creator.session.token), detail: id => http.inject({ method: "GET", headers: headers(creator.session.token),
          url: `/api/v1/execution/operations/f0/${encodeURIComponent(id)}?workspace_id=${encodeURIComponent(f.workspace)}` }) });
    } finally { await app.close(); }
  }
  function error(r: Response, status: number, code: string) {
    expect(r.statusCode).toBe(status); expect(r.headers["cache-control"]).toBe("private, no-store");
    expect(commandProblem(r.json()), JSON.stringify(commandProblem.errors)).toBe(true);
    expect(r.json()).toMatchObject({ error: { code }, request_id: "TEST_ONLY-f0-collection" });
    expect(r.body).not.toMatch(new RegExp(`${secret}|private_relation|SELECT secret|ZodError|QueryContractError|stack|HMAC`));
  }
  function page(r: Response): F0Collection {
    expect(r.statusCode).toBe(200); expect(r.headers["cache-control"]).toBe("private, no-store");
    const value = f0Collection.parse(r.json());
    expect(Object.keys(value).sort()).toEqual(["schema_version", "family", "coverage", "resource", "environment", "items", "page"].sort());
    expect(value).toMatchObject({ schema_version: "portal.execution.f0-command-collection.v1",
      family: "F0_BLOCKED_INTENTS_ONLY", coverage: "CURRENT_ACTOR_EXACT_RESOURCE_ONLY" });
    for (const item of value.items) expect(Object.keys(f0BlockedOperation.parse(item))).toHaveLength(12);
    expect(r.body).not.toMatch(/payload_hash|plan_digest|request_key|actor_user_id|target_type|conditions|expires_at|ts_user_id/);
    return value;
  }

  it.each((["ACCOUNT", "PORTFOLIO", "DEPLOYMENT"] as const).flatMap(kind => environments.map(environment => ({ kind, environment }))))(
    "reads only current exact-own $kind/$environment and agrees with existing detail", async ({ kind, environment }) => {
      const f = await fixture(kind, environment), record = await seed(f);
      await seed(f, { resource: { kind, id: next() }, warnings: [secret] }); await seed(f, { author: delegator, warnings: [secret] });
      await seed(f, { environment: environment === "paper" ? "live" : "paper", warnings: [secret] });
      await mounted(f, async http => {
        const p = page(await http.get()); expect(p).toMatchObject({ resource: f.resource, environment,
          page: { limit: 25, returned_count: 1, has_more: false, next_cursor: null } });
        expect(p.items).toHaveLength(1); expect(p.items[0].operation_id).toBe(record.operationId);
        expect(p.items[0]).toEqual(f0BlockedOperation.parse((await http.detail(record.operationId)).json()));
      });
    });
  it("whole AppModule routes literal/f0 to collection, without unlocking generic operation parent", async () => {
    const f = await fixture(), record = await seed(f), appService = ctx.app.get(ExecutionF0ReadService);
    // Only the service's TEST_ONLY authority dependencies are delegated. The
    // actual complete AppModule router/guards/controller/contract stay mounted.
    const delegate = vi.spyOn(appService, "collection").mockImplementation((actor, raw) => f.service.collection(actor, raw));
    const http = ctx.app.getHttpAdapter().getInstance() as FastifyInstance;
    const headers = { cookie: `${SESSION_COOKIE}=${creator.session.token}`, "x-request-id": "TEST_ONLY-f0-collection" };
    try {
      const query = new URLSearchParams({ workspace_id: f.workspace, resource_kind: f.resource.kind,
        resource_id: f.resource.id, environment: f.environment, limit: "1" });
      const result = page(await http.inject({ method: "GET", headers,
        url: `/api/v1/execution/operations/f0?${query.toString()}` }));
      expect(result.items.map(item => item.operation_id)).toEqual([record.operationId]);
      expect(delegate).toHaveBeenCalledTimes(1);
      expect(delegate).toHaveBeenCalledWith(creator.actor, expect.objectContaining({ workspace_id: f.workspace,
        resource_kind: f.resource.kind, resource_id: f.resource.id, environment: f.environment, limit: 1 }));
      const generic = await http.inject({ method: "GET", headers,
        url: `/api/v1/execution/operations/op_TEST_ONLY_nonexistent?workspace_id=${encodeURIComponent(f.workspace)}` });
      error(generic, 503, "OPERATIONS_SCOPED_PARENT_NOT_COMMISSIONED");
      expect(delegate).toHaveBeenCalledTimes(1); expect(f.forbidden).not.toHaveBeenCalled();
      // Route precedence + explicit fixture authority only, not PM commissioning.
    } finally { delegate.mockRestore(); }
  });
  it("authorized empty is exact-own only, never global queue or inferred authority", async () => {
    const f = await fixture(); await seed(f, { author: delegator });
    await f.repo.saveGrant({ ...f.grant, grant_id: next(), subject_user_id: owner.user.userId, revision: next() }, true);
    await mounted(f, async http => {
      expect(page(await http.get()).items).toEqual([]);
      await seed(f); expect(page(await http.get({}, owner.session.token)).items).toEqual([]);
      const unknown = await http.get({ resource_id: next() }); error(unknown, 404, "COMMAND_RESOURCE_NOT_FOUND");
      await replaceGrant(f, { revoked_at_ms: Date.now() });
      const denied = await http.get(); error(denied, 404, "COMMAND_RESOURCE_NOT_FOUND"); expect(denied.json()).toEqual(unknown.json());
    });
  });
  it("strict required scalar query rejects omissions, duplicates and unsupported kinds before census", async () => {
    const f = await fixture(), scan = vi.spyOn(f.operations, "listF0ReadCandidates");
    const base = { workspace_id: f.workspace, resource_kind: f.resource.kind, resource_id: f.resource.id, environment: f.environment };
    try { await mounted(f, async http => {
      for (const key of Object.keys(base)) {
        const absent = { ...base } as Record<string, string>; delete absent[key];
        error(await http.raw(new URLSearchParams(absent).toString()), 400, "COMMAND_INPUT_INVALID");
      }
      const query = new URLSearchParams(base).toString();
      for (const q of [null, "", `${query}&workspace_id=${encodeURIComponent(f.workspace)}`, `${query}&limit=1&limit=2`,
        `${query}&after=x&after=y`, `${query}&from_source=true`]) error(await http.raw(q), 400, "COMMAND_INPUT_INVALID");
      const invalid: Array<Record<string, string>> = [{ resource_kind: "ROOT" }, { resource_kind: "ORDER" }, { resource_id: "bad/id" }, { environment: "PAPER" },
        { environment: "all" }, { limit: "0" }, { limit: "101" }, { limit: "1.5" }, { after: "" }, { after: "x".repeat(4097) }];
      for (const q of invalid)
        error(await http.get(q), 400, "COMMAND_INPUT_INVALID");
      error(await http.get({}, null), 401, "SESSION_REQUIRED"); expect(scan).not.toHaveBeenCalled();
    }); } finally { scan.mockRestore(); }
  });
  it.each(["app-only", "business-only", "wrong-env", "unqualified", "truthy-qualified", "revoked"] as const)(
    "%s cannot reach census despite retained own rows", async variant => {
      const f = await fixture(); await seed(f); const scan = vi.spyOn(f.operations, "listF0ReadCandidates");
      if (variant === "unqualified" || variant === "truthy-qualified") Object.assign(f.relations, { qualified: variant === "unqualified" ? false : "true" });
      else await replaceGrant(f, variant === "app-only" ? { requires_ts_acceptance: false, ts_receipt: null }
        : variant === "business-only" ? { action: "business.read_all" } : variant === "wrong-env" ? { environments: ["live"] }
          : { revoked_at_ms: Date.now() });
      try { await mounted(f, async http => {
        const r = await http.get(); error(r, 404, "COMMAND_RESOURCE_NOT_FOUND");
        expect(r.json()).toEqual((await http.get({ resource_id: next() })).json()); expect(scan).not.toHaveBeenCalled();
      }); } finally { scan.mockRestore(); }
    });
  async function delegated(f: Fixture, effect: "ALLOW" | "DENY") {
    const parent: ScopedAccessGrant = { ...f.grant, grant_id: next(), subject_user_id: delegator.user.userId,
      action: "access.grant", delegable_actions: ["audit.read"], requires_ts_acceptance: false, ts_receipt: null,
      valid_from_ms: f.grant.valid_from_ms - 1000, valid_until_ms: f.grant.valid_until_ms! + 1000, revision: next() };
    await f.repo.saveGrant(parent, true);
    validateDelegation(await f.access.readContext(delegator.actor, f.workspace), { subject_user_id: creator.user.userId,
      action: "audit.read", effect, selector: f.grant.selector, environments: f.grant.environments,
      valid_from_ms: f.grant.valid_from_ms, valid_until_ms: f.grant.valid_until_ms, delegable_actions: [],
      ceiling_grant_id: parent.grant_id, expected_ceiling_revision: parent.revision, expected_policy_revision: f.policy.revision,
      expected_ts_membership_revision: f.membership.revision, reason: "TEST_ONLY genuine delegated collection graph" });
    await f.repo.saveGrant({ ...f.grant, grant_id: next(), effect, parent_grant_id: parent.grant_id,
      issued_by: delegator.user.userId, revision: next() }, true); return parent;
  }
  it("keeps complete delegated DENY graph rather than selecting the independent accepted ALLOW", async () => {
    const f = await fixture(); await seed(f); await delegated(f, "DENY");
    expect(evaluateAccess(await f.access.readContext(creator.actor, f.workspace), "audit.read", f.resource, f.environment).allowed).toBe(false);
    const scan = vi.spyOn(f.operations, "listF0ReadCandidates");
    try { await mounted(f, async http => { error(await http.get(), 404, "COMMAND_RESOURCE_NOT_FOUND"); expect(scan).not.toHaveBeenCalled(); }); }
    finally { scan.mockRestore(); }
  });
  it("delegated accepted audit retains app-only ceiling and denies after that real ancestor is revoked", async () => {
    const f = await fixture(); await seed(f); const parent = await delegated(f, "ALLOW");
    await replaceGrant(f, { revoked_at_ms: Date.now() });
    await mounted(f, async http => {
      expect(page(await http.get()).items).toHaveLength(1);
      await f.repo.saveGrant({ ...parent, revision: next(), revoked_at_ms: Date.now() });
      error(await http.get(), 404, "COMMAND_RESOURCE_NOT_FOUND");
    });
  });
  it("expired original plan remains historical; descending time/id-ascending ties page without duplicate or skip", async () => {
    const f = await fixture(), time = await dbNow() - 7200_000;
    const old = await bulk(f, 3, { created: time }), newer = await bulk(f, 1, { created: time + 1000 });
    const expected = [...newer, ...old.sort()];
    await mounted(f, async http => {
      const a = page(await http.get({ limit: "2" })), b = page(await http.get({ limit: "2", after: a.page.next_cursor! }));
      expect([...a.items, ...b.items].map(x => x.operation_id)).toEqual(expected);
      expect(new Set([...a.items, ...b.items].map(x => x.operation_id)).size).toBe(4);
      expect(a.page.has_more).toBe(true); expect(b.page).toMatchObject({ returned_count: 2, has_more: false, next_cursor: null });
    });
  });
  it("hidden creator/resource/environment insertions and their malformed bodies never affect cursor or overflow", async () => {
    const f = await fixture(); await bulk(f, 3);
    await mounted(f, async http => {
      const first = page(await http.get({ limit: "1" })), after = first.page.next_cursor!;
      const before = page(await http.get({ limit: "1", after }));
      await bulk(f, 1025, { resource: { ...f.resource, id: next() }, warnings: [secret] });
      await bulk(f, 2, { author: delegator, warnings: [secret] }); await bulk(f, 2, { environment: "live", warnings: [secret] });
      const result = page(await http.get({ limit: "1", after })); expect(result.items).toEqual(before.items);
      expect(result.page.has_more).toBe(before.page.has_more); expect(page(await http.get({ limit: "1" })).items).toEqual(first.items);
      // Tokens can rotate issued_at. Successful decode and equal contents are
      // the privacy oracle, not signed-token byte equality.
    });
  });
  it("new visible own intent invalidates continuation; immutable records are not edited to simulate mutation", async () => {
    const f = await fixture(); await bulk(f, 3);
    await mounted(f, async http => {
      const first = page(await http.get({ limit: "1" })); await seed(f);
      error(await http.get({ limit: "1", after: first.page.next_cursor! }), 409, "COMMAND_COLLECTION_CURSOR_CHANGED");
    });
  });
  it("cursor binds actor/session, exact resource/environment/workspace and limit, never grants a query", async () => {
    const f = await fixture(), other = await fixture(), target = { ...f.resource, id: next() };
    await f.repo.saveGrant({ ...f.grant, grant_id: next(), revision: next(), selector: {
      kind: "EXPLICIT_RESOURCE_SET", resource_kind: f.resource.kind, ids: [target.id] } }, true);
    await f.repo.saveGrant({ ...f.grant, grant_id: next(), revision: next(), environments: ["sandbox"] }, true);
    await f.repo.saveGrant({ ...f.grant, grant_id: next(), revision: next(), subject_user_id: owner.user.userId }, true);
    // The mounted TEST_ONLY provider must be coherent in both workspaces;
    // otherwise a cross-workspace probe would only prove a404 source absence.
    await other.repo.saveGrant({ ...other.grant, revision: next(), ts_receipt: f.grant.ts_receipt });
    await bulk(f, 2); await seed(other);
    const session = await auth.login({ assertion: creator.username, username: creator.username, credential: password });
    await mounted(f, async http => {
      const after = page(await http.get({ limit: "1" })).page.next_cursor!;
      const changedQueries: Array<Record<string, string>> = [{ limit: "2" }, { resource_id: target.id }, { environment: "sandbox" },
        { workspace_id: other.workspace, resource_id: other.resource.id }];
      for (const q of changedQueries)
        error(await http.get({ limit: "1", after, ...q }), 409, "COMMAND_COLLECTION_CURSOR_CHANGED");
      error(await http.get({ limit: "1", after }, session.token), 409, "COMMAND_COLLECTION_CURSOR_CHANGED");
      error(await http.get({ limit: "1", after }, owner.session.token), 409, "COMMAND_COLLECTION_CURSOR_CHANGED");
      error(await http.get({ limit: "1", after, resource_id: next() }), 404, "COMMAND_RESOURCE_NOT_FOUND");
      const tampered = `${after[0] === "a" ? "b" : "a"}${after.slice(1)}`;
      error(await http.get({ limit: "1", after: tampered }), 400, "COMMAND_COLLECTION_CURSOR_INVALID");
    });
  });
  it("visible off-page corruption is safe503, not silently omitted; revoke still wins over that refusal", async () => {
    const f = await fixture(); await seed(f); await bulk(f, 1, { warnings: [secret] });
    const original = f.operations.listF0ReadCandidates.bind(f.operations);
    await mounted(f, async http => { error(await http.get({ limit: "1" }), 503, "COMMAND_STATUS_UNVERIFIED"); });
    const race = vi.spyOn(f.operations, "listF0ReadCandidates").mockImplementation(async (...args) => {
      const rows = await original(...args); await replaceGrant(f, { revoked_at_ms: Date.now() }); return rows;
    });
    try { await mounted(f, async http => { error(await http.get({ limit: "1" }), 409, "ACCESS_RETRY_REQUIRED"); }); }
    finally { race.mockRestore(); }
  });
  it("valid signatures do not excuse malformed semantic boundaries, vanished pairs, expired tokens or another family", async () => {
    const f = await fixture(); await bulk(f, 3);
    await mounted(f, async http => {
      const token = page(await http.get({ limit: "1" })).page.next_cursor!;
      const payload = JSON.parse(Buffer.from(token.split(".")[2], "base64url").toString("utf8"));
      const codec = new KeysetCursorCodec(cursorKeys);
      const input = { resource_id: payload.resource_id, workspace_id: payload.workspace_id,
        direction: "after" as const, query_fingerprint: payload.query_fingerprint };
      for (const boundary of [[String(payload.boundary[0]), payload.boundary[1]], [-1, payload.boundary[1]],
        [payload.boundary[0] + 0.5, payload.boundary[1]], [payload.boundary[0], true], [payload.boundary[0], "bad/id"]])
        error(await http.get({ limit: "1", after: codec.encode({ ...input, boundary }) }), 400, "COMMAND_COLLECTION_CURSOR_INVALID");
      error(await http.get({ limit: "1", after: codec.encode({ ...input, boundary: [0, next()] }) }), 409, "COMMAND_COLLECTION_CURSOR_CHANGED");
      error(await http.get({ limit: "1", after: codec.encode({ ...input, resource_id: "execution.capital-commands.v1", boundary: payload.boundary }) }),
        409, "COMMAND_COLLECTION_CURSOR_CHANGED");
      const old = new KeysetCursorCodec({ ...cursorKeys, now: () => Math.floor(Date.now()/1000)-1800 });
      error(await http.get({ limit: "1", after: old.encode({ ...input, boundary: payload.boundary }) }), 400, "COMMAND_COLLECTION_CURSOR_INVALID");
    });
  });
  it("census is complete through1024 and finite overflow at1025, not a silently partial100-row page", async () => {
    const f = await fixture(); await bulk(f, 1024);
    await mounted(f, async http => {
      const full = page(await http.get({ limit: "100" })); expect(full.page).toMatchObject({ returned_count: 100, has_more: true });
      await seed(f); error(await http.get({ limit: "100" }), 503, "COMMAND_COLLECTION_OVERFLOW");
    });
  });
  it("SQL bounds a real constraint-valid oversized visible key instead of returning private raw bytes", async () => {
    const f = await fixture(); await seed(f, { key: `account/${"x".repeat(16_384)}` });
    const rows = await f.operations.listF0ReadCandidates(f.workspace, creator.user.userId, f.resource, f.environment);
    expect(rows).toHaveLength(1); expect(rows[0].command_key).toBeNull();
    await mounted(f, async http => { error(await http.get(), 503, "COMMAND_STATUS_UNVERIFIED"); });
  });
  it("SQL NULL-bounds unrestricted operation_id; safe503 still passes real after-SELECT revoke fence", async () => {
    const f = await fixture(), oversized = "x".repeat(512);
    // Original operation_id is text PRIMARY KEY, without the public191 bound.
    //512bytes stays below ordinary index-tuple limits and needs no constraint
    //or trigger bypass. The public detail input cannot address this bad row.
    await bulk(f, 1, { firstId: oversized });
    const original = f.operations.listF0ReadCandidates.bind(f.operations);
    const rows = await original(f.workspace, creator.user.userId, f.resource, f.environment);
    expect(rows).toHaveLength(1); expect(rows[0].operation_id).toBeNull();
    await mounted(f, async http => {
      const r = await http.get(); error(r, 503, "COMMAND_STATUS_UNVERIFIED"); expect(r.body).not.toContain(oversized);
    });
    let changed = false;
    const race = vi.spyOn(f.operations, "listF0ReadCandidates").mockImplementation(async (...args) => {
      const selected = await original(...args); await replaceGrant(f, { revoked_at_ms: Date.now() }); changed = true; return selected;
    });
    try { await mounted(f, async http => {
      const r = await http.get(); error(r, 409, "ACCESS_RETRY_REQUIRED"); expect(changed).toBe(true); expect(r.body).not.toContain(oversized);
      error(await http.get(), 404, "COMMAND_RESOURCE_NOT_FOUND");
    }); } finally { race.mockRestore(); }
  });
  it.each(["valid", "bad-cursor", "overflow", "dependency"] as const)("%s response/error traverses final revoke fence", async variant => {
    const f = await fixture(); if (variant === "overflow") await bulk(f, 1025); else await seed(f);
    const original = f.operations.listF0ReadCandidates.bind(f.operations); let changed = false;
    const race = vi.spyOn(f.operations, "listF0ReadCandidates").mockImplementation(async (...args) => {
      const rows = await original(...args); await replaceGrant(f, { revoked_at_ms: Date.now() }); changed = true;
      if (variant === "dependency") throw new Error(`SELECT secret FROM private_relation ${secret}`);
      return rows;
    });
    try { await mounted(f, async http => {
      error(await http.get(variant === "bad-cursor" ? { after: "not-a-keyset-cursor" } : {}), 409, "ACCESS_RETRY_REQUIRED");
      expect(changed).toBe(true); error(await http.get(), 404, "COMMAND_RESOURCE_NOT_FOUND");
    }); } finally { race.mockRestore(); }
  });
  it.each(["session", "membership"] as const)("actual %s removal after real released SELECT prevents body delivery", async variant => {
    const f = await fixture(); await seed(f);
    const session = await auth.login({ assertion: creator.username, username: creator.username, credential: password });
    const original = f.operations.listF0ReadCandidates.bind(f.operations); let changed = false;
    const race = vi.spyOn(f.operations, "listF0ReadCandidates").mockImplementation(async (...args) => {
      const rows = await original(...args); if (!changed) { changed = true;
        if (variant === "session") await ctx.pool.query("UPDATE auth_sessions SET state='REVOKED',revoked_at=clock_timestamp(),revoke_reason='TEST_ONLY F0 collection race' WHERE session_id=$1", [session.sessionId]);
        else await ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [f.workspace, creator.user.userId]);
      } return rows;
    });
    try { await mounted(f, async http => {
      const response = await http.get({}, session.token); expect(changed).toBe(true);
      error(response, variant === "session" ? 403 : 404, variant === "session" ? "CURRENT_ACTOR_AUTHORITY_REQUIRED" : "COMMAND_RESOURCE_NOT_FOUND");
      expect(response.body).not.toContain(f.resource.id);
    }); } finally { race.mockRestore(); }
  });
  it.each(["grant", "receipt"] as const)("real %s expiry after final DB clock capture cannot leak the page or cursor error", async variant => {
    const f = await fixture(); await seed(f); const original = f.access.confirmReadContext.bind(f.access);
    let deadline = 0, waited = false;
    const delayed = vi.spyOn(f.access, "confirmReadContext").mockImplementation(async (...args) => {
      const current = await original(...args); expect(current.now_ms).toBeLessThan(deadline);
      const delay = deadline - Date.now() + 10; expect(delay).toBeGreaterThan(0); expect(delay).toBeLessThan(2600);
      await new Promise(resolve => setTimeout(resolve, delay)); waited = true; return current;
    });
    try { await mounted(f, async http => {
      deadline = await dbNow() + 1500;
      await replaceGrant(f, variant === "grant" ? { valid_until_ms: deadline }
        : { ts_receipt: { ...f.grant.ts_receipt!, expires_at_ms: deadline } });
      error(await http.get({ after: "not-a-keyset-cursor" }), 404, "COMMAND_RESOURCE_NOT_FOUND"); expect(waited).toBe(true);
    }); } finally { delayed.mockRestore(); }
  }, 10_000);
  it("actual captured session lease expires naturally before delivery and wins over bad cursor", async () => {
    const f = await fixture(); await seed(f);
    // Use a separate real session, never shorten/revoke the shared creator's
    // main session. Narrow the actual DB lease BEFORE original final capture;
    // changing it afterwards would test a stale fabricated lease instead.
    const session = await auth.login({ assertion: creator.username, username: creator.username, credential: password });
    const original = f.access.confirmReadContext.bind(f.access); let waited = false, deadline = 0;
    const delayed = vi.spyOn(f.access, "confirmReadContext").mockImplementation(async (...args) => {
      expect(args[0].session_id).toBe(session.sessionId);
      const stored = await ctx.pool.query(`UPDATE auth_sessions
        SET idle_expires_at=clock_timestamp()+interval '1500 milliseconds'
        WHERE session_id=$1 AND user_id=$2 AND state='ACTIVE'
        RETURNING floor(extract(epoch FROM least(idle_expires_at,absolute_expires_at))*1000)::bigint AS lease_until_ms`,
      [session.sessionId, creator.user.userId]);
      expect(stored.rowCount).toBe(1); deadline = Number(stored.rows[0].lease_until_ms);
      expect(Number.isSafeInteger(deadline)).toBe(true);
      const current = await original(...args);
      expect(current.actor_lease_until_ms).toBe(deadline); expect(current.now_ms).toBeLessThan(deadline);
      const delay = deadline - Date.now() + 10; expect(delay).toBeGreaterThan(0); expect(delay).toBeLessThan(2600);
      await new Promise(resolve => setTimeout(resolve, delay)); waited = true;
      return current; // Unchanged actual DB snapshot, including its finite lease.
    });
    try { await mounted(f, async http => {
      const response = await http.get({ after: "not-a-keyset-cursor" }, session.token);
      error(response, 403, "CURRENT_ACTOR_AUTHORITY_REQUIRED"); expect(waited).toBe(true);
      expect(Date.now()).toBeGreaterThanOrEqual(deadline);
      expect(response.body).not.toMatch(/COMMAND_COLLECTION_CURSOR_INVALID|COMMAND_COLLECTION_CURSOR_CHANGED|next_cursor/);
      expect(response.json()).not.toHaveProperty("page"); expect(response.json()).not.toHaveProperty("items");
      delayed.mockRestore(); expect(page(await http.get()).items).toHaveLength(1);
    }); } finally { delayed.mockRestore(); }
  }, 10_000);
  it("both genuine Core captures carry their current lease, rather than retaining the earlier deadline", async () => {
    const f = await fixture(), session = await auth.login({ assertion: creator.username, username: creator.username, credential: password });
    const actor = { ...creator.actor, session_id: session.sessionId };
    const deadline = async (seconds: number) => Number((await ctx.pool.query(`UPDATE auth_sessions
      SET idle_expires_at=clock_timestamp()+$2*interval '1 second' WHERE session_id=$1
      RETURNING floor(extract(epoch FROM least(idle_expires_at,absolute_expires_at))*1000)::bigint AS ms`,
    [session.sessionId, seconds])).rows[0].ms);
    const first = await deadline(60), context = await f.access.readContext(actor, f.workspace);
    expect(context.actor_lease_until_ms).toBe(first);
    const second = await deadline(120), current = await f.access.confirmReadContext(actor, f.workspace, context);
    expect(current.actor_lease_until_ms).toBe(second); expect(second).toBeGreaterThan(first);
    expect(current.authority_fingerprint).toBe(context.authority_fingerprint);
  });
  it.each(["valid", "bad-cursor"] as const)("%s uses the renewed genuine lease after census outlives initial capture", async variant => {
    const f = await fixture(); await seed(f);
    const session = await auth.login({ assertion: creator.username, username: creator.username, credential: password });
    const read = f.access.readContext.bind(f.access), select = f.operations.listF0ReadCandidates.bind(f.operations);
    let initialDeadline = 0, renewed = false;
    const capture = vi.spyOn(f.access, "readContext").mockImplementation(async (...args) => {
      const stored = await ctx.pool.query(`UPDATE auth_sessions
        SET idle_expires_at=clock_timestamp()+interval '1500 milliseconds'
        WHERE session_id=$1 AND state='ACTIVE'
        RETURNING floor(extract(epoch FROM least(idle_expires_at,absolute_expires_at))*1000)::bigint AS ms`, [session.sessionId]);
      expect(stored.rowCount).toBe(1); initialDeadline = Number(stored.rows[0].ms);
      const context = await read(...args);
      expect(context.actor_lease_until_ms).toBe(initialDeadline); expect(context.now_ms).toBeLessThan(initialDeadline);
      return context; // Genuine capture, never a fabricated/extended context.
    });
    const held = vi.spyOn(f.operations, "listF0ReadCandidates").mockImplementation(async (...args) => {
      const rows = await select(...args); // The SQL transaction is already released.
      expect((await auth.sessionFromToken(session.token))?.state).toBe("ACTIVE");
      // Same repository renewal used by ordinary authenticated activity, while
      // the original session is still valid. Do not revive an expired session.
      await new SessionsRepository(ctx.pool).markSeen(session.sessionId); renewed = true;
      const delay = initialDeadline - Date.now() + 10;
      expect(delay).toBeGreaterThan(0); expect(delay).toBeLessThan(2600);
      await new Promise(resolve => setTimeout(resolve, delay));
      expect(Date.now()).toBeGreaterThanOrEqual(initialDeadline);
      return rows;
    });
    try { await mounted(f, async http => {
      const response = await http.get(variant === "bad-cursor" ? { after: "not-a-keyset-cursor" } : {}, session.token);
      if (variant === "valid") expect(page(response).items).toHaveLength(1);
      else error(response, 400, "COMMAND_COLLECTION_CURSOR_INVALID");
      expect(renewed).toBe(true); expect(capture).toHaveBeenCalledTimes(1); expect(held).toHaveBeenCalledTimes(1);
    }); } finally { capture.mockRestore(); held.mockRestore(); }
  }, 10_000);
  it("missing key configuration and failed lookup are sanitized503, never a false empty or generic fallback", async () => {
    const missing = await fixture("ACCOUNT", "paper", false), scan = vi.spyOn(missing.operations, "listF0ReadCandidates");
    try { await mounted(missing, async http => { error(await http.get(), 503, "COMMAND_COLLECTION_NOT_CONFIGURED"); expect(scan).not.toHaveBeenCalled(); }); }
    finally { scan.mockRestore(); }
    const originalConfirm = missing.access.confirmReadContext.bind(missing.access);
    const revoke = vi.spyOn(missing.access, "confirmReadContext").mockImplementation(async (...args) => {
      await replaceGrant(missing, { revoked_at_ms: Date.now() }); return originalConfirm(...args);
    });
    try { await mounted(missing, async http => {
      error(await http.get(), 409, "ACCESS_RETRY_REQUIRED"); expect(revoke).toHaveBeenCalledTimes(1);
    }); } finally { revoke.mockRestore(); }
    const f = await fixture(); await seed(f);
    const failed = vi.spyOn(f.operations, "listF0ReadCandidates").mockRejectedValueOnce(new Error(`SELECT secret FROM private_relation ${secret}`));
    try { await mounted(f, async http => { error(await http.get(), 503, "COMMAND_UNAVAILABLE"); }); } finally { failed.mockRestore(); }
  });
  it("actual census is read-only repeatable-read/5s, exact-own target/env before1025, release before final confirmation", async () => {
    const f = await fixture(); await seed(f); let released = false;
    const observed: Array<{ sql: string; params: unknown[]; readOnly: string; isolation: string; timeout: string }> = [];
    const pool = { connect: async () => {
      const db = await ctx.pool.connect(); released = false;
      return { query: async (sql: string, params: unknown[] = []) => {
        if (/FROM\s+execution_command_plans_f0\b/i.test(sql)) observed.push({ sql, params: [...params],
          readOnly: (await db.query("SHOW transaction_read_only")).rows[0].transaction_read_only,
          isolation: (await db.query("SHOW transaction_isolation")).rows[0].transaction_isolation,
          timeout: (await db.query("SHOW statement_timeout")).rows[0].statement_timeout });
        return db.query(sql, params);
      }, release: () => { db.release(); released = true; } } as unknown as PoolClient;
    } } as unknown as Pool;
    const service = new ExecutionF0ReadService(new ExecutionOperationsRepository(pool), f.access, cursorKeys);
    const original = f.access.confirmReadContext.bind(f.access);
    const confirm = vi.spyOn(f.access, "confirmReadContext").mockImplementation(async (...args) => {
      expect(released).toBe(true); expect(observed).toHaveLength(1); return original(...args);
    });
    try { await mounted(f, async http => { page(await http.get()); }, ctx.config, service);
      expect(confirm).toHaveBeenCalledTimes(1); const row = observed[0];
      expect(row).toMatchObject({ readOnly: "on", isolation: "repeatable read", timeout: "5s" });
      expect(row.sql).not.toMatch(/SELECT\s+\*|COUNT\s*\(|payload|conditions|hash|request_key|expires_at\s*[<>]|FOR\s+UPDATE/i);
      for (const [column, value] of [["workspace_id", f.workspace], ["actor_user_id", creator.user.userId],
        ["target_type", f.resource.kind], ["target_id", f.resource.id], ["environment", f.environment.toUpperCase()]] as const) {
        const index = row.params.indexOf(value); expect(index).toBeGreaterThanOrEqual(0);
        expect(row.sql).toMatch(new RegExp(`${column}\\s*=\\s*\\$${index + 1}(?![0-9])`, "i"));
      }
      expect(/LIMIT\s+1025/i.test(row.sql) || /LIMIT\s+\$[0-9]+/i.test(row.sql) && row.params.includes(1025)).toBe(true);
    } finally { confirm.mockRestore(); }
  });
  async function businessLedger(f: Fixture) {
    const snapshot: Record<string, unknown> = {};
    for (const table of ["execution_command_plans_f0", "execution_operation_queue_items", "execution_operation_workflow_events",
      "product_audit_events", "execution_trusted_commands", "portal_access_policy_state", "portal_access_grants_v2",
      "portal_access_policy_events", "portal_access_proposals"]) snapshot[table] = (await ctx.pool.query(
      `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS rows FROM ${table} t WHERE workspace_id=$1`,
      [f.workspace])).rows[0].rows;
    snapshot.commandEvents = (await ctx.pool.query(`SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY to_jsonb(e)::text),'[]'::jsonb) AS rows
      FROM execution_trusted_command_events e JOIN execution_trusted_commands c USING(command_id) WHERE c.workspace_id=$1`,
      [f.workspace])).rows[0].rows;
    return snapshot;
  }
  it("retained profile keeps original Core workspace and all GET paths leave business/audit/grant ledgers unchanged", async () => {
    const f = await fixture(), record = await seed(f), source = await workspace();
    await ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [source, creator.user.userId]);
    const config: ControlApiConfig = { ...ctx.config, EXECUTION_READ_PROFILE: "retained_review_v1",
      FEATURE_EXECUTION_LOCAL_PROJECTION: "true", EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: source };
    const before = await businessLedger(f), create = vi.spyOn(f.operations, "create"), generic = vi.spyOn(f.operations, "find");
    try { await mounted(f, async http => {
      expect(page(await http.get()).items[0].operation_id).toBe(record.operationId); page(await http.get());
      error(await http.get({ after: "not-a-keyset-cursor" }), 400, "COMMAND_COLLECTION_CURSOR_INVALID");
      error(await http.get({ resource_id: next() }), 404, "COMMAND_RESOURCE_NOT_FOUND");
      error(await http.get({ workspace_id: source }), 404, "COMMAND_RESOURCE_NOT_FOUND");
      error(await http.get({ limit: "0" }), 400, "COMMAND_INPUT_INVALID");
    }, config);
      expect(await businessLedger(f)).toEqual(before); expect(create).not.toHaveBeenCalled(); expect(generic).not.toHaveBeenCalled();
      expect(f.forbidden).not.toHaveBeenCalled(); expect(f.trust.relations).toHaveBeenCalled();
      // SessionGuard may update ordinary identity/session/personal-workspace
      // bookkeeping. This is intentionally not an assertion of zero SQL writes.
    } finally { create.mockRestore(); generic.mockRestore(); }
  });
});
