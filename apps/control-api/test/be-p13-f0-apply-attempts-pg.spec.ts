/**
 * BE-P13 · RV-13 · migration 1723680000146 (execution_f0_apply_attempts) on a disposable PostgreSQL,
 * through real HTTP.  Two lanes in one file:
 *
 *  - always on (no PG): the migration file is the only one of its number, and its Down section
 *    removes exactly what its Up section created;
 *  - `TEST_DATABASE_URL` set (the lead runs it under the heavy lock; never against a shared DB):
 *      * the Up migration is applied by `migrateTestDatabase`; its Down section is executed inside a
 *        transaction and rolled back (DDL is transactional), so Up -> Down -> table gone -> rollback;
 *      * insert / replay / conflict / concurrency of `POST /api/v1/execution/operations/:id/apply`
 *        against the REAL control-api app (session cookie + CSRF + Origin, the shipped wiring);
 *      * the read-only lookup `GET /api/v1/execution/operations/f0/:id/apply-attempts/:key` mounted
 *        with a TEST_ONLY access trust (same pattern as elp204-f0-reader): NONE / FOUND / CONFLICT,
 *        actor and workspace isolation, absence, no existence oracle, revoke before and after the await;
 *      * the CHECK constraints and the append-only trigger rejecting what the contract says is
 *        unrepresentable.
 *
 * Qualification: TEST_ONLY grants and trust.  This proves the table, the SQL and the two routes; it is
 * NOT an installed-authority or connected-source proof, and nothing here is sent to a source.
 */
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import cookiePlugin from "@fastify/cookie";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AdminService } from "../src/admin/admin.service";
import { AuthService } from "../src/auth/auth.service";
import { CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE } from "../src/auth/cookies";
import { SessionGuard } from "../src/facade/session.guard";
import { HttpErrorFilter } from "../src/http-error.filter";
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { WorkspacesRepository } from "../src/repos/workspaces";
import { CONTROL_API_CONFIG } from "../src/tokens";
import { ExecutionOperationsRepository } from "../src/operations/operations.repository";
import { ExecutionF0ReadController } from "../src/operations/f0-read.controller";
import { ExecutionF0ReadService } from "../src/operations/f0-read.service";
import { f0ApplyAttemptLookup, f0ApplyDeniedProblem, f0ApplyKeyConflictProblem } from "../src/operations/f0-apply.contract";
import type { AccessActor, AccessResource, ReviewedAccessPolicy, ScopedAccessGrant } from "../src/execution-v2/access.contract";
import { accessDigest, type AccessRelations } from "../src/execution-v2/access-policy";
import { AccessRepository } from "../src/execution-v2/access.repository";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import type { AccessTrustProvider } from "../src/execution-v2/access-trust";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const MIGRATIONS = resolve(__dirname, "../migrations");
const MIGRATION = "1723680000146_execution-f0-apply-attempts.sql";
const contracts = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const fixture = (name: string) => JSON.parse(readFileSync(resolve(contracts, "fixtures", name), "utf8"));

describe("BE-P13 migration 146: file hygiene (no PostgreSQL)", () => {
  const files = readdirSync(MIGRATIONS).filter(name => name.endsWith(".sql"));
  const sql = readFileSync(resolve(MIGRATIONS, MIGRATION), "utf8");
  const [up, down] = sql.split("-- Down Migration");

  it("is the only migration with its number, and the numbers from 143 are strictly increasing", () => {
    expect(files.filter(name => name.startsWith("1723680000146_"))).toEqual([MIGRATION]);
    const numbers = files.map(name => Number(name.split("_")[0])).filter(number => number >= 1723680000143).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers[0]).toBe(1723680000143);
    expect(numbers.every((number, index) => index === 0 || number === numbers[index - 1] + 1)).toBe(true);
  });
  it("is the only migration that touches the table, and Down removes what Up creates", () => {
    expect(files.filter(name => name !== MIGRATION
      && readFileSync(resolve(MIGRATIONS, name), "utf8").includes("execution_f0_apply_attempts"))).toEqual([]);
    expect(up).toMatch(/CREATE TABLE execution_f0_apply_attempts/);
    expect(up).toMatch(/CREATE FUNCTION reject_execution_f0_apply_attempt_mutation\(\)/);
    expect(up).toMatch(/CREATE TRIGGER execution_f0_apply_attempts_immutable/);
    expect(down).toMatch(/DROP TRIGGER execution_f0_apply_attempts_immutable ON execution_f0_apply_attempts;/);
    expect(down).toMatch(/DROP FUNCTION reject_execution_f0_apply_attempt_mutation\(\);/);
    expect(down).toMatch(/DROP TABLE execution_f0_apply_attempts;/);
    expect(down.indexOf("DROP TRIGGER")).toBeLessThan(down.indexOf("DROP FUNCTION"));
    expect(down.indexOf("DROP TRIGGER")).toBeLessThan(down.indexOf("DROP TABLE"));
  });
  it("is additive: Up alters and drops nothing that exists", () => {
    expect(up).not.toMatch(/\b(ALTER|DROP)\s+TABLE\b|\bDROP\s+(COLUMN|CONSTRAINT|INDEX|TRIGGER)\b/i);
  });
});

const URL = process.env.TEST_DATABASE_URL;
const next = () => `TEST_ONLY:${randomUUID()}`;
const password = "TEST-only-BE-P13-apply-attempts-correct-horse-battery-2026";
const absentOperation = "TEST_ONLY:f0:absent";
type Response = { statusCode: number; headers: Record<string, unknown>; body: string; json(): any };
@Module({}) class ApplyAttemptsTestModule {}

describe.skipIf(!URL)("BE-P13 migration 146 + F0 apply-attempts: real PG + real HTTP / TEST_ONLY trust", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>, auth: AuthService;
  type Account = { userId: string; username: string; actor: AccessActor;
    session: Awaited<ReturnType<AuthService["login"]>> };
  let owner: Account, alice: Account, bob: Account, outsider: Account;

  beforeAll(async () => {
    // Destructive harness setup: ONLY a disposable cell (the lead's), never a shared DB.
    await migrateTestDatabase(URL!);
    ctx = await setupApp({ DATABASE_URL: URL! });
    auth = ctx.app.get(AuthService);
    vi.spyOn(auth, "verifyAccessIdentity").mockImplementation(async assertion => ({
      iss: "https://test-only.cloudflareaccess.com", sub: `TEST_ONLY:${assertion}`, aud: "test-audience",
      email: `${assertion}@azdag.com`, normalizedEmail: `${assertion}@azdag.com`,
      authenticationTime: new Date(), tokenExpiresAt: new Date(Date.now() + 600_000),
    }));
    async function activated(role: "ADMIN" | "USER"): Promise<Account> {
      const admin = new AdminService(ctx.pool, ctx.config, auth), username = `be-p13-146-${randomUUID()}`;
      const made = await admin.createUser({ username, displayName: username, role });
      const activation = await admin.resetCredential(made.userId);
      const initial = await auth.login({ assertion: username, username, credential: activation.activationToken });
      await auth.changePassword({ sessionToken: initial.token, csrfToken: initial.csrfToken,
        currentPassword: activation.activationToken, newPassword: password });
      const session = await auth.login({ assertion: username, username, credential: password });
      const user = (await auth.users.findById(made.userId))!;
      await new WorkspacesRepository(ctx.pool, ctx.config).ensurePersonal(user.userId, username);
      return { userId: user.userId, username, session,
        actor: { user_id: user.userId, session_id: session.sessionId, session_generation: user.sessionVersion } };
    }
    owner = await activated("USER"); alice = await activated("ADMIN"); bob = await activated("ADMIN");
    outsider = await activated("ADMIN");
    await new OwnerAccessRepository(ctx.pool).claimOwner({ userId: owner.userId, claimedBy: "BE_P13_146_TEST_ONLY" });
  });
  afterAll(async () => { vi.restoreAllMocks(); if (ctx) await teardownApp(ctx); });

  const dbNow = async () => Number((await ctx.pool.query(
    "SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0].ms);
  const attempts = async (workspace: string) => (await ctx.pool.query(
    "SELECT actor_user_id, request_key, operation_id, decision, reason_code, retry_allowed, source_request_sent, created_at " +
    "FROM execution_f0_apply_attempts WHERE workspace_id=$1 ORDER BY actor_user_id, request_key", [workspace])).rows;
  const audits = async (workspace: string, result: string) => Number((await ctx.pool.query(
    "SELECT count(*) AS n FROM product_audit_events WHERE workspace_id=$1 AND event_type='execution.command.apply_rejected' AND result=$2",
    [workspace, result])).rows[0].n);

  /** One workspace: owner + alice + bob + (optionally) a second workspace alice also belongs to. Each reader has her own PORTFOLIO. */
  async function world() {
    const workspace = next(), now = await dbNow();
    await ctx.pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY BE-P13 146',$2)", [workspace, owner.userId]);
    for (const account of [owner, alice, bob]) await ctx.pool.query(
      "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,$3)", [workspace, account.userId, account === owner ? "OWNER" : "MEMBER"]);
    const repo = new AccessRepository(ctx.pool), operations = new ExecutionOperationsRepository(ctx.pool);
    const policy: ReviewedAccessPolicy = { workspace_id: workspace, revision: next(), artifact_digest: accessDigest(next()),
      approval_ref: next(), state: "REVIEWED", qualification: "TEST_ONLY", protected_owner_user_id: owner.userId,
      researcher_fields: { state: "PENDING", policy_ref: null, fields: [] } };
    await repo.putPolicy(policy);
    const membership = { receipt_id: next(), revision: next(), mapping_revision: next() };
    const resources = new Map<string, AccessResource>(), grants = new Map<string, ScopedAccessGrant>();
    for (const reader of [alice, bob]) {
      const resource: AccessResource = { kind: "PORTFOLIO", id: next() };
      const grant: ScopedAccessGrant = { grant_id: next(), workspace_id: workspace, subject_user_id: reader.userId,
        action: "audit.read", effect: "ALLOW", selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "PORTFOLIO", ids: [resource.id] },
        environments: ["paper"], valid_from_ms: now - 60_000, valid_until_ms: now + 600_000, delegable_actions: [],
        issued_by: owner.userId, parent_grant_id: null, revision: next(), policy_revision: policy.revision,
        revoked_at_ms: null, requires_ts_acceptance: true, field_policy_ref: null,
        ts_receipt: { receipt_id: membership.receipt_id, membership_revision: membership.revision,
          mapping_revision: membership.mapping_revision, effective_at_ms: now - 1000, expires_at_ms: now + 600_000 } };
      await repo.saveGrant(grant, true); resources.set(reader.userId, resource); grants.set(reader.userId, grant);
    }
    const relationsFor = (userId: string): AccessRelations => ({ qualified: true, revision: membership.revision, own_alpha_ids: [],
      member_portfolio_ids: resources.has(userId) ? [resources.get(userId)!.id] : [], roots: {}, membership: { ...membership } });
    const trust: AccessTrustProvider = { verifyPolicy: vi.fn(async () => null), verifyReceipt: vi.fn(async () => null),
      relations: vi.fn(async id => structuredClone(relationsFor(id))),
      verifiedHumanMapping: vi.fn(async () => { throw new Error("TEST_ONLY forbidden command mapping"); }),
      readPublication: vi.fn(async () => { throw new Error("TEST_ONLY forbidden business publication"); }) };
    const access = new ExecutionAccessService(ctx.pool, auth, trust, true);
    const service = new ExecutionF0ReadService(operations, access);
    const seed = async (author: Account, id = next()) => (await operations.create({ operationId: id, workspaceId: workspace,
      actorUserId: author.userId, requestKey: next(), commandKey: "account/sync", environment: "PAPER",
      targetType: "PORTFOLIO", targetId: resources.get(author.userId)!.id, expectedTargetVersion: 1,
      payloadHash: accessDigest([id, "payload"]), planDigest: accessDigest([id, "plan"]), conditions: [], riskTier: "R2_SANDBOX",
      blockerCodes: ["COMMAND_RELAY_DISABLED"], warningCodes: [], expiresAt: new Date(Date.now() + 300_000),
      requestId: next(), auditEventId: next() })).record.operationId;
    const revoke = async (reader: Account) => { const grant = grants.get(reader.userId)!;
      const revoked = { ...grant, revoked_at_ms: Date.now(), revision: next() }; grants.set(reader.userId, revoked); await repo.saveGrant(revoked); };
    return { workspace, operations, seed, service, revoke, access, resources };
  }
  type World = Awaited<ReturnType<typeof world>>;

  /** The REAL control-api app: the shipped route, guard, CSRF/Origin rules and error filter. */
  const rawApply = (account: Account, operationId: string, body: unknown, over: { csrf?: string | null; origin?: string | null; token?: string | null } = {}) => {
    const csrf = over.csrf === undefined ? account.session.csrfToken : over.csrf;
    const token = over.token === undefined ? account.session.token : over.token;
    const origin = over.origin === undefined ? ctx.config.PORTAL_PUBLIC_ORIGIN : over.origin;
    const cookie = [token === null ? null : `${SESSION_COOKIE}=${token}`, csrf === null ? null : `${CSRF_COOKIE}=${csrf}`]
      .filter(Boolean).join("; ");
    return ctx.app.getHttpAdapter().getInstance().inject({ method: "POST", url: `/api/v1/execution/operations/${encodeURIComponent(operationId)}/apply`,
      headers: { "content-type": "application/json", "x-request-id": "TEST_ONLY-be-p13-apply", cookie,
        ...(csrf === null ? {} : { [CSRF_HEADER]: csrf }), ...(origin === null ? {} : { origin }) },
      payload: body as never }) as unknown as Promise<Response>;
  };
  const applyBody = (workspace: string, requestKey: string) => ({ schema_version: "execution.command-apply-request.v1",
    workspace_id: workspace, request_key: requestKey, command_type: "EXECUTION_COMMAND" });
  const apply = (account: Account, w: World, operationId: string, requestKey: string) =>
    rawApply(account, operationId, applyBody(w.workspace, requestKey));

  type Http = { lookup(operationId: string, requestKey: string, over?: { account?: Account; query?: string | null; token?: string | null }): Promise<Response> };
  /** Only the read-only lookup route, over the same pool, with the TEST_ONLY trust. */
  async function mounted(w: World, run: (http: Http) => Promise<void>) {
    const app = await NestFactory.create<NestFastifyApplication>({ module: ApplyAttemptsTestModule,
      controllers: [ExecutionF0ReadController], providers: [SessionGuard, { provide: AuthService, useValue: auth },
        { provide: CONTROL_API_CONFIG, useValue: ctx.config },
        { provide: WorkspacesRepository, useValue: new WorkspacesRepository(ctx.pool, ctx.config) },
        { provide: ExecutionF0ReadService, useValue: w.service }] },
      new FastifyAdapter({ routerOptions: { maxParamLength: 256 } }), { logger: false, abortOnError: false });
    try {
      app.useGlobalFilters(new HttpErrorFilter()); await app.register(cookiePlugin as never); await app.init();
      const http = app.getHttpAdapter().getInstance() as FastifyInstance; await http.ready();
      await run({ lookup: (operationId, requestKey, over = {}) => {
        const account = over.account ?? alice, token = over.token === undefined ? account.session.token : over.token;
        const query = over.query === undefined ? new URLSearchParams({ workspace_id: w.workspace }).toString() : over.query;
        return http.inject({ method: "GET", headers: { "x-request-id": "TEST_ONLY-be-p13-lookup",
            ...(token === null ? {} : { cookie: `${SESSION_COOKIE}=${token}` }) },
          url: `/api/v1/execution/operations/f0/${encodeURIComponent(operationId)}/apply-attempts/${encodeURIComponent(requestKey)}${query === null ? "" : `?${query}`}` }) as unknown as Promise<Response>;
      } });
    } finally { await app.close(); }
  }
  function refused(response: Response, status: number, code: string) {
    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject({ error: { code }, request_id: expect.any(String) });
    expect(response.body).not.toMatch(/ZodError|stack|SELECT |execution_f0_apply_attempts|intent_hash/);
  }
  function found(response: Response, operationId: string, requestKey: string) {
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    const value = f0ApplyAttemptLookup.parse(response.json());
    expect(value).toMatchObject({ schema_version: "portal.execution.f0-apply-attempt.v1", operation_id: operationId, request_key: requestKey });
    return value;
  }

  // ----------------------------------------------------------------------------------------- the migration itself
  it("applied: the table exists with the contract's columns, the key as primary key, and the three FKs", async () => {
    const columns = (await ctx.pool.query(
      "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name='execution_f0_apply_attempts' ORDER BY ordinal_position")).rows;
    expect(columns.map(row => row.column_name)).toEqual(["workspace_id", "actor_user_id", "request_key", "operation_id",
      "intent_hash", "decision", "reason_code", "retry_allowed", "source_request_sent", "created_at"]);
    expect(columns.every(row => row.is_nullable === "NO")).toBe(true);
    const primary = (await ctx.pool.query(
      `SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey)
        WHERE i.indrelid='execution_f0_apply_attempts'::regclass AND i.indisprimary ORDER BY array_position(i.indkey::int2[], a.attnum)`)).rows;
    expect(primary.map(row => row.attname)).toEqual(["workspace_id", "actor_user_id", "request_key"]);
    const references = (await ctx.pool.query(
      "SELECT confrelid::regclass::text AS parent FROM pg_constraint WHERE conrelid='execution_f0_apply_attempts'::regclass AND contype='f' ORDER BY 1")).rows;
    expect(references.map(row => row.parent)).toEqual(["execution_command_plans_f0", "portal_users", "workspaces"]);
    expect((await ctx.pool.query("SELECT 1 FROM pgmigrations WHERE name=$1", [MIGRATION.replace(/\.sql$/, "")])).rowCount).toBe(1);
  });
  it("Down removes the trigger, function and table (inside a rolled-back transaction); Up state is intact afterwards", async () => {
    const [, down] = readFileSync(resolve(MIGRATIONS, MIGRATION), "utf8").split("-- Down Migration");
    const client = await ctx.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(down);
      const gone = await client.query(`SELECT to_regclass('execution_f0_apply_attempts') AS t,
        to_regprocedure('reject_execution_f0_apply_attempt_mutation()') AS f`);
      expect(gone.rows[0]).toEqual({ t: null, f: null });
    } finally { await client.query("ROLLBACK"); client.release(); }
    const back = await ctx.pool.query(`SELECT to_regclass('execution_f0_apply_attempts') AS t,
      to_regprocedure('reject_execution_f0_apply_attempt_mutation()') AS f`);
    expect(back.rows[0].t).toBe("execution_f0_apply_attempts"); expect(back.rows[0].f).not.toBeNull();
  });

  // ---------------------------------------------------------------------------------- constraints and immutability
  it("makes 'sent', 'retryable', another decision, a bad key or hash, and a dangling operation unrepresentable", async () => {
    const w = await world(), operationId = await w.seed(alice), hash = accessDigest("TEST_ONLY:intent");
    const insert = (over: Record<string, unknown> = {}) => {
      const row = { workspace_id: w.workspace, actor_user_id: alice.userId, request_key: next().replace("TEST_ONLY:", "k-"),
        operation_id: operationId, intent_hash: hash, ...over };
      const names = Object.keys(row);
      return ctx.pool.query(`INSERT INTO execution_f0_apply_attempts(${names.join(",")}) VALUES(${names.map((_, i) => `$${i + 1}`).join(",")})`,
        Object.values(row));
    };
    await expect(insert()).resolves.toBeDefined();
    await expect(insert({ retry_allowed: true })).rejects.toMatchObject({ code: "23514" });
    await expect(insert({ source_request_sent: true })).rejects.toMatchObject({ code: "23514" });
    await expect(insert({ decision: "ACCEPTED" })).rejects.toMatchObject({ code: "23514" });
    await expect(insert({ reason_code: "OTHER" })).rejects.toMatchObject({ code: "23514" });
    for (const request_key of ["", "-leading", "has space", "k".repeat(193)]) await expect(insert({ request_key })).rejects.toMatchObject({ code: "23514" });
    await expect(insert({ request_key: "k".repeat(192) })).resolves.toBeDefined();
    await expect(insert({ intent_hash: "sha256:xyz" })).rejects.toMatchObject({ code: "23514" });
    await expect(insert({ operation_id: "TEST_ONLY:no-such-plan" })).rejects.toMatchObject({ code: "23503" });
    await expect(insert({ actor_user_id: "TEST_ONLY:no-such-user" })).rejects.toMatchObject({ code: "23503" });
    await expect(insert({ workspace_id: "TEST_ONLY:no-such-workspace" })).rejects.toMatchObject({ code: "23503" });
    const duplicate = next().replace("TEST_ONLY:", "dup-");
    await insert({ request_key: duplicate });
    await expect(insert({ request_key: duplicate })).rejects.toMatchObject({ code: "23505" });
  });
  it("is append-only: UPDATE and DELETE are rejected by the trigger (55000), and the plan it references cannot be deleted", async () => {
    const w = await world(), operationId = await w.seed(alice);
    expect((await apply(alice, w, operationId, "immutable-0001")).statusCode).toBe(409);
    const before = await attempts(w.workspace); expect(before).toHaveLength(1);
    await expect(ctx.pool.query("UPDATE execution_f0_apply_attempts SET operation_id=operation_id WHERE workspace_id=$1", [w.workspace]))
      .rejects.toMatchObject({ code: "55000" });
    await expect(ctx.pool.query("UPDATE execution_f0_apply_attempts SET intent_hash=$2 WHERE workspace_id=$1", [w.workspace, accessDigest("x")]))
      .rejects.toMatchObject({ code: "55000" });
    await expect(ctx.pool.query("DELETE FROM execution_f0_apply_attempts WHERE workspace_id=$1", [w.workspace]))
      .rejects.toMatchObject({ code: "55000" });
    await expect(ctx.pool.query("DELETE FROM execution_command_plans_f0 WHERE operation_id=$1", [operationId])).rejects.toBeDefined();
    expect(await attempts(w.workspace)).toEqual(before);
  });

  // ------------------------------------------------------------------------------ POST apply: insert, replay, conflict
  it("insert: the first apply is the typed 409 denial, nothing sent, one stored attempt and one DENIED audit event", async () => {
    const w = await world(), operationId = await w.seed(alice);
    const first = await apply(alice, w, operationId, "apply:first:0001");
    expect(first.statusCode).toBe(409);
    expect(f0ApplyDeniedProblem.safeParse(first.json()).success, JSON.stringify(first.json())).toBe(true);
    const fixtureKeys = (name: string) => Object.keys(fixture(name).details).sort();
    expect(Object.keys(first.json().details).sort()).toEqual(fixtureKeys("execution-command-apply-denied.valid.json"));
    expect(first.json()).toMatchObject({ error: { code: "COMMAND_RELAY_DISABLED" },
      details: { operation_id: operationId, decision: "DENIED", reason: "COMMAND_RELAY_DISABLED", retry_allowed: false,
        source_request_sent: false, request_key: "apply:first:0001", replayed: false } });
    const rows = await attempts(w.workspace);
    expect(rows).toEqual([expect.objectContaining({ actor_user_id: alice.userId, request_key: "apply:first:0001", operation_id: operationId,
      decision: "DENIED", reason_code: "COMMAND_RELAY_DISABLED", retry_allowed: false, source_request_sent: false })]);
    expect(await audits(w.workspace, "DENIED")).toBe(1);
    expect(Number((await ctx.pool.query("SELECT count(*) AS n FROM outbox_messages WHERE workspace_id=$1", [w.workspace])).rows[0].n)).toBe(0);
  });
  it("idempotence: the same key + operation replays the stored answer (replayed:true), keeps ONE row and its timestamp", async () => {
    const w = await world(), operationId = await w.seed(alice);
    const first = await apply(alice, w, operationId, "apply:replay:0001"), stored = await attempts(w.workspace);
    const again = await apply(alice, w, operationId, "apply:replay:0001"), third = await apply(alice, w, operationId, "apply:replay:0001");
    for (const response of [again, third]) {
      expect(response.statusCode).toBe(409);
      expect(f0ApplyDeniedProblem.safeParse(response.json()).success).toBe(true);
      expect(response.json().details).toEqual({ ...first.json().details, replayed: true });
    }
    expect(await attempts(w.workspace)).toEqual(stored);                      // first use wins, never updated
    expect(await audits(w.workspace, "DENIED")).toBe(3);                      // 1 recorded with the row + 1 per replay
  });
  it("concurrency: five simultaneous identical applies produce exactly one stored attempt and one replayed:false", async () => {
    const w = await world(), operationId = await w.seed(alice);
    const responses = await Promise.all(Array.from({ length: 5 }, () => apply(alice, w, operationId, "apply:race:0001")));
    expect(responses.map(response => response.statusCode)).toEqual([409, 409, 409, 409, 409]);
    expect(responses.every(response => f0ApplyDeniedProblem.safeParse(response.json()).success)).toBe(true);
    expect(responses.filter(response => response.json().details.replayed === false)).toHaveLength(1);
    expect((await attempts(w.workspace))).toHaveLength(1);
  });
  it("conflict: the same key for a different operation of the same actor is REQUEST_KEY_PAYLOAD_CONFLICT, records nothing, names nothing", async () => {
    const w = await world(), one = await w.seed(alice), two = await w.seed(alice);
    expect((await apply(alice, w, one, "apply:conflict:0001")).statusCode).toBe(409);
    const stored = await attempts(w.workspace);
    const conflict = await apply(alice, w, two, "apply:conflict:0001");
    expect(conflict.statusCode).toBe(409);
    expect(f0ApplyKeyConflictProblem.safeParse(conflict.json()).success, JSON.stringify(conflict.json())).toBe(true);
    expect(conflict.json()).toMatchObject({ error: { code: "REQUEST_KEY_PAYLOAD_CONFLICT" },
      details: { request_key: "apply:conflict:0001", source_request_sent: false } });
    expect(conflict.body).not.toContain(one);
    expect(await attempts(w.workspace)).toEqual(stored);
    expect(await audits(w.workspace, "CONFLICT")).toBe(1);
  });
  it("refuses without storing: keyless body, bad key grammar, no CSRF, wrong Origin, no session, unknown operation", async () => {
    const w = await world(), operationId = await w.seed(alice);
    const { request_key: _omitted, ...keyless } = applyBody(w.workspace, "x");
    const typed = await rawApply(alice, operationId, keyless);
    expect(typed.statusCode).toBe(400); expect(typed.json().error.code).toBe("INVALID_EXECUTION_COMMAND_APPLY");
    for (const bad of ["", "-leading", "has space", "k".repeat(193)])
      expect((await rawApply(alice, operationId, applyBody(w.workspace, bad))).statusCode, bad).toBe(400);
    const good = applyBody(w.workspace, "apply:refuse:0001");
    expect((await rawApply(alice, operationId, good, { csrf: null })).statusCode).toBe(403);
    expect((await rawApply(alice, operationId, good, { csrf: "TEST_ONLY-forged" })).statusCode).toBe(403);
    expect((await rawApply(alice, operationId, good, { origin: "https://evil.example" })).statusCode).toBe(403);
    expect((await rawApply(alice, operationId, good, { token: null })).statusCode).toBe(401);
    const unknown = await rawApply(alice, absentOperation, good);
    expect(unknown.statusCode).toBe(404); expect(unknown.json().error.code).toBe("OPERATION_NOT_FOUND");
    expect(await attempts(w.workspace)).toEqual([]);
  });

  // ------------------------------------------------------------------------------------- tenant / actor isolation
  it("isolation on POST: another actor, another workspace and a non-member cannot reach or collide with a key", async () => {
    const w = await world(), other = await world();
    const mine = await w.seed(alice), bobs = await w.seed(bob), inOther = await other.seed(alice);
    expect((await apply(alice, w, mine, "shared-key-0001")).json().details.replayed).toBe(false);
    // Bob cannot apply Alice's operation (creator-scoped plan lookup): the same 404 as an unknown one.
    const hidden = await apply(bob, w, mine, "shared-key-0001"), unknown = await apply(bob, w, absentOperation, "shared-key-0001");
    expect(hidden.statusCode).toBe(404); expect(hidden.json().error.code).toBe("OPERATION_NOT_FOUND");
    expect(hidden.json().error).toEqual(unknown.json().error);
    // The same key text is independent per actor: Bob's own operation records Bob's own row.
    const own = await apply(bob, w, bobs, "shared-key-0001");
    expect(own.statusCode).toBe(409); expect(own.json().details.replayed).toBe(false);
    expect((await attempts(w.workspace)).map(row => [row.actor_user_id, row.operation_id]).sort())
      .toEqual([[alice.userId, mine], [bob.userId, bobs]].sort());
    // Workspace is part of the key: Alice's operation of the other workspace, same key text, is a separate attempt.
    expect((await apply(alice, other, inOther, "shared-key-0001")).json().details.replayed).toBe(false);
    expect(await attempts(other.workspace)).toHaveLength(1);
    // Naming a workspace the caller is not a member of is WORKSPACE_NOT_FOUND; a member workspace without the plan is OPERATION_NOT_FOUND.
    const stranger = await rawApply(outsider, mine, applyBody(w.workspace, "shared-key-0001"));
    expect(stranger.statusCode).toBe(404); expect(stranger.json().error.code).toBe("WORKSPACE_NOT_FOUND");
    const crossed = await rawApply(alice, mine, applyBody(other.workspace, "shared-key-0002"));
    expect(crossed.statusCode).toBe(404); expect(crossed.json().error.code).toBe("OPERATION_NOT_FOUND");
    expect(await attempts(w.workspace)).toHaveLength(2); expect(await attempts(other.workspace)).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------------- GET lookup: NONE / FOUND / CONFLICT
  it("lookup after response loss: NONE before any apply, FOUND after (the stored denial, the stored time), CONFLICT for another operation", async () => {
    const w = await world(), one = await w.seed(alice), two = await w.seed(alice), key = "lookup:key:0001";
    await mounted(w, async http => {
      const none = found(await http.lookup(one, key), one, key);
      expect(none).toMatchObject({ state: "NONE", relay_decision: null, first_recorded_at: null });
      expect(Object.keys(none).sort()).toEqual(Object.keys(fixture("execution-command-apply-attempt.none.valid.json")).sort());
      const sent = await apply(alice, w, one, key); expect(sent.statusCode).toBe(409);
      const stored = (await attempts(w.workspace))[0];
      const hit = found(await http.lookup(one, key), one, key);
      expect(hit).toMatchObject({ state: "FOUND", first_recorded_at: new Date(stored.created_at).toISOString(),
        relay_decision: { schema_version: "execution.command-relay-decision.v1", operation_id: one, decision: "DENIED",
          reason: "COMMAND_RELAY_DISABLED", retry_allowed: false, source_request_sent: false } });
      expect(Object.keys(hit).sort()).toEqual(Object.keys(fixture("execution-command-apply-attempt.found.valid.json")).sort());
      // It is the answer the POST gave: the lookup's relay_decision equals the POST's details minus the key/replay bits.
      const { request_key: _k, replayed: _r, ...decision } = sent.json().details;
      expect((hit as { relay_decision: unknown }).relay_decision).toEqual(decision);
      // The key is bound to `one`: asking about `two` is CONFLICT and does not name `one`.
      const conflictResponse = await http.lookup(two, key);
      const conflict = found(conflictResponse, two, key);
      expect(conflict).toMatchObject({ state: "CONFLICT", relay_decision: null, first_recorded_at: null });
      expect(Object.keys(conflict).sort()).toEqual(Object.keys(fixture("execution-command-apply-attempt.conflict.valid.json")).sort());
      expect(conflictResponse.body).not.toContain(one);
      // A replay does not change what the lookup answers.
      await apply(alice, w, one, key);
      expect(found(await http.lookup(one, key), one, key)).toEqual(hit);
    });
  });
  it("lookup is read-only: it never writes an attempt, an audit event or an outbox row", async () => {
    const w = await world(), operationId = await w.seed(alice);
    await apply(alice, w, operationId, "readonly:0001");
    const snapshot = async () => JSON.stringify([await attempts(w.workspace),
      (await ctx.pool.query("SELECT count(*) FROM product_audit_events WHERE workspace_id=$1", [w.workspace])).rows,
      (await ctx.pool.query("SELECT count(*) FROM outbox_messages WHERE workspace_id=$1", [w.workspace])).rows]);
    const before = await snapshot();
    await mounted(w, async http => {
      for (const key of ["readonly:0001", "readonly:never-used"]) await http.lookup(operationId, key);
      expect((await http.lookup(operationId, "readonly:0001", { query: new URLSearchParams({ workspace_id: w.workspace }).toString() })).statusCode).toBe(200);
    });
    expect(await snapshot()).toBe(before);
  });
  it("lookup isolation: another actor sees nothing of Alice's key, and the same key text is independent per actor and per workspace", async () => {
    const w = await world(), other = await world(), key = "iso:key:0001";
    const mine = await w.seed(alice), bobs = await w.seed(bob), inOther = await other.seed(alice);
    await apply(alice, w, mine, key);
    await mounted(w, async http => {
      const unknown = await http.lookup(absentOperation, key, { account: bob });
      refused(unknown, 404, "COMMAND_RESOURCE_NOT_FOUND");
      // Bob asks about Alice's operation: indistinguishable from an unknown operation, whatever the key.
      const hidden = await http.lookup(mine, key, { account: bob });
      refused(hidden, 404, "COMMAND_RESOURCE_NOT_FOUND"); expect(hidden.json().error).toEqual(unknown.json().error);
      // Bob asks about HIS operation with Alice's key text: NONE (her row is not his), then his own row once he applies.
      expect(found(await http.lookup(bobs, key, { account: bob }), bobs, key)).toMatchObject({ state: "NONE" });
      await apply(bob, w, bobs, key);
      expect(found(await http.lookup(bobs, key, { account: bob }), bobs, key)).toMatchObject({ state: "FOUND" });
      expect(found(await http.lookup(mine, key), mine, key)).toMatchObject({ state: "FOUND" });
      expect(await attempts(w.workspace)).toHaveLength(2);
      // Another workspace: Alice's membership of `w` does not carry; the operation of `other` is not found through `w`.
      refused(await http.lookup(inOther, key), 404, "COMMAND_RESOURCE_NOT_FOUND");
      // A workspace she is not a member of / does not exist: same answer.
      for (const response of [await http.lookup(mine, key, { query: new URLSearchParams({ workspace_id: next() }).toString() }),
        await http.lookup(mine, key, { account: outsider })]) {
        expect(response.statusCode).toBe(404);
        expect(response.body).not.toMatch(/"state"|COMMAND_RELAY_DISABLED|first_recorded_at/);
      }
    });
    await mounted(other, async http => {
      expect(found(await http.lookup(inOther, key), inOther, key)).toMatchObject({ state: "NONE" });   // same key text, other workspace
    });
  });
  it("absence: an unknown operation is 404 (never NONE), malformed input is 400 before any SELECT, a missing session is 401", async () => {
    const w = await world(), operationId = await w.seed(alice), scan = vi.spyOn(w.operations, "findApplyAttempt");
    try {
      await mounted(w, async http => {
        refused(await http.lookup(absentOperation, "absent:0001"), 404, "COMMAND_RESOURCE_NOT_FOUND");
        const qs = new URLSearchParams({ workspace_id: w.workspace }).toString();
        for (const query of [null, "", "workspace_id=", "workspace_id=ab", `${qs}&${qs}`, `${qs}&environment=paper`, `${qs}&request_key=x`])
          refused(await http.lookup(operationId, "absent:0001", { query }), 400, "COMMAND_INPUT_INVALID");
        for (const key of ["-leading", "has space", "k".repeat(193)])
          refused(await http.lookup(operationId, key), 400, "COMMAND_INPUT_INVALID");
        refused(await http.lookup(operationId, "absent:0001", { token: null }), 401, "SESSION_REQUIRED");
        expect(scan).not.toHaveBeenCalled();                                  // none of the above reached the attempts table
        const hit = await http.lookup(operationId, "k".repeat(192));
        expect(found(hit, operationId, "k".repeat(192))).toMatchObject({ state: "NONE" });
      });
    } finally { scan.mockRestore(); }
  });
  it("no existence oracle: after the reader's audit.read is revoked the lookup is the unknown-operation 404, FOUND or not", async () => {
    const w = await world(), operationId = await w.seed(alice), key = "revoked:0001";
    await apply(alice, w, operationId, key);
    await mounted(w, async http => {
      expect(found(await http.lookup(operationId, key), operationId, key)).toMatchObject({ state: "FOUND" });
      const unknown = await http.lookup(absentOperation, key);
      await w.revoke(alice);
      for (const k of [key, "revoked:never-used"]) {
        const response = await http.lookup(operationId, k);
        refused(response, 404, "COMMAND_RESOURCE_NOT_FOUND"); expect(response.json().error).toEqual(unknown.json().error);
        expect(response.body).not.toMatch(/"state"|COMMAND_RELAY_DISABLED|first_recorded_at/);
      }
    });
  });
  it("revoke AFTER the attempt SELECT: the final fence withholds the body (nothing of FOUND leaks), and the next read is the 404", async () => {
    const w = await world(), operationId = await w.seed(alice), key = "revoked:after:0001";
    await apply(alice, w, operationId, key);
    const original = w.operations.findApplyAttempt.bind(w.operations); let changed = false;
    const intercepted = vi.spyOn(w.operations, "findApplyAttempt").mockImplementation(async (...args) => {
      const row = await original(...args); if (!changed) { changed = true; await w.revoke(alice); } return row;
    });
    try {
      await mounted(w, async http => {
        const response = await http.lookup(operationId, key);
        expect(changed).toBe(true);
        expect(response.statusCode).not.toBe(200);
        expect(response.body).not.toMatch(/FOUND|COMMAND_RELAY_DISABLED|first_recorded_at|relay_decision/);
        refused(await http.lookup(operationId, key), 404, "COMMAND_RESOURCE_NOT_FOUND");
      });
    } finally { intercepted.mockRestore(); }
  });
  it("a repository failure is a fixed refusal: no driver text, never NONE", async () => {
    const w = await world(), operationId = await w.seed(alice);
    const failing = vi.spyOn(w.operations, "findApplyAttempt").mockRejectedValueOnce(new Error("TEST_ONLY_PRIVATE_SQL_host_token_DO_NOT_DISCLOSE"));
    try {
      await mounted(w, async http => {
        const response = await http.lookup(operationId, "failing:0001");
        expect(response.statusCode).toBeGreaterThanOrEqual(500);
        expect(response.body).not.toMatch(/TEST_ONLY_PRIVATE_SQL|"state"/);
      });
    } finally { failing.mockRestore(); }
  });
});
