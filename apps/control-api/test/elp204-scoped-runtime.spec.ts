/** Mounted real Auth/SessionGuard + disposable PG readers and scope issuer.
 * TEST_ONLY policy/relations and seeded local observations, not PM qualification,
 * source transport, login/credential issuance or production store isolation. */
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import cookiePlugin from "@fastify/cookie";
import type { FastifyInstance } from "fastify";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AuthService } from "../src/auth/auth.service";
import { SESSION_COOKIE } from "../src/auth/cookies";
import { HttpErrorFilter } from "../src/http-error.filter";
import { SessionGuard } from "../src/facade/session.guard";
import { WorkspacesRepository } from "../src/repos/workspaces";
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { CONTROL_API_CONFIG } from "../src/tokens";
import type { PortalUser } from "../src/domain";
import { AccessRepository } from "../src/execution-v2/access.repository";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import { accessDigest, type AccessRelations } from "../src/execution-v2/access-policy";
import type { AccessAction, ReviewedAccessPolicy, ScopedAccessGrant } from "../src/execution-v2/access.contract";
import type { AccessTrustProvider } from "../src/execution-v2/access-trust";
import { ExecutionReadScopes, type ReadEnvironment } from "../src/execution-v2/read-scope";
import { executionScopedRuntimeManifestSchema } from "../src/execution-v2/technical-read.contract";
import { ExecutionRuntimeManifestController } from "../src/execution/runtime-manifest.controller";
import { ExecutionScopedRuntimeManifestController } from "../src/execution/scoped-runtime-manifest.controller";
import { ExecutionRuntimeManifestService } from "../src/execution/runtime-manifest.service";
import { ExecutionScopedRuntimeManifestService } from "../src/execution/scoped-runtime-manifest.service";
import { ExecutionProfileProjectionRepository } from "../src/execution/profile-projection.repository";
import { ExecutionDurableMirrorRepository } from "../src/execution/durable-mirror.repository";
import { migrateExecutionStore } from "../src/execution/store-schema";
import { migrateTestDatabase, setupApp, teardownApp, testConfig } from "./harness";

const database = process.env.TEST_DATABASE_URL;
const next = () => `elp204-${randomUUID()}`;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const bindings = [
  { environment: "paper", profileId: "PAPER_BINANCE_USDM" },
  { environment: "sandbox", profileId: "SANDBOX_BINANCE_USDM" },
  { environment: "live", profileId: "LIVE_BINANCE_USDM" },
] as const;
const root = "TEST_ONLY-runtime-root";
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
@Module({}) class RuntimeTestModule {}

describe.skipIf(!database)("ELP2-04 finite technical runtime: real PG + mounted HTTP", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>, auth: AuthService, owner: PortalUser;
  const domainName = "elp204_runtime_exec_" + randomUUID().replaceAll("-", "");
  const pgLimits = { connectionTimeoutMillis: 2000, query_timeout: 15000,
    statement_timeout: 15000, idle_in_transaction_session_timeout: 15000 };
  const databaseUrl = (name: string) => {
    const value = new URL(database!); value.pathname = "/" + name; return value.toString();
  };
  let domain: Pool, domainCreated = false;
  const apps = new Set<NestFastifyApplication>();
  async function active(role: "ADMIN" | "USER" = "USER") {
    const username = next();
    const invited = await auth.users.create({ userId: next(), username, displayName: username, role });
    return (await auth.users.applyLifecycleChange({ userId: invited.userId, expectedRevision: invited.accountRevision,
      status: "ACTIVE", mustChangePassword: false }))!;
  }
  beforeAll(async () => {
    await migrateTestDatabase(database!);
    ctx = await setupApp({ DATABASE_URL: database! }); auth = ctx.app.get(AuthService);
    const admin = new Pool({ connectionString: databaseUrl("postgres"), max: 1, ...pgLimits });
    try { await admin.query(`CREATE DATABASE ${domainName}`); domainCreated = true; }
    finally { await admin.end(); }
    domain = new Pool({ connectionString: databaseUrl(domainName), max: 2, ...pgLimits });
    await migrateExecutionStore(domain);
    owner = await active("ADMIN");
    await new OwnerAccessRepository(ctx.pool).claimOwner({ userId: owner.userId, claimedBy: "ELP204_RUNTIME_TEST_ONLY" });
  });
  afterEach(async () => { vi.restoreAllMocks(); for (const app of apps) await app.close(); apps.clear(); });
  afterAll(async () => {
    try { if (ctx) await teardownApp(ctx); }
    finally {
      try { if (domain) await domain.end(); }
      finally {
        if (domainCreated) {
          const admin = new Pool({ connectionString: databaseUrl("postgres"), max: 1, ...pgLimits });
          try { await admin.query(`DROP DATABASE ${domainName} WITH (FORCE)`); }
          finally { await admin.end(); }
        }
      }
    }
  });

  async function fixture(options: { role?: "ADMIN" | "USER"; action?: AccessAction | null;
    sourceMember?: boolean; retainedGrant?: boolean; sourceV2?: boolean;
    grantEnvironments?: ReadEnvironment[]; observed?: boolean; healthObserved?: boolean } = {}) {
    const user = await active(options.role), source = next(), repo = new AccessRepository(ctx.pool);
    const workspace = await new WorkspacesRepository(ctx.pool).ensurePersonal(user.userId, user.username);
    await ctx.pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY runtime storage',$2)", [source, owner.userId]);
    await ctx.pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'MEMBER')", [workspace, owner.userId]);
    if (options.sourceMember !== false) await ctx.pool.query(
      "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'MEMBER')", [source, user.userId]);
    if (options.retainedGrant) await ctx.pool.query(`INSERT INTO execution_retained_review_access
      (workspace_id,user_id,issued_by,expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '10 minutes')`, [source, user.userId, owner.userId]);
    const config = testConfig({ DATABASE_URL: database!, AUTH_MODE: "dev", EXECUTION_DATABASE_URL: databaseUrl(domainName),
      EXECUTION_READ_PROFILE: "retained_review_v1", FEATURE_EXECUTION_LOCAL_PROJECTION: "true",
      EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: source, EXECUTION_EDGE_PAPER_PROFILE_ID: bindings[0].profileId,
      EXECUTION_EDGE_SANDBOX_PROFILE_ID: bindings[1].profileId, EXECUTION_EDGE_LIVE_PROFILE_ID: bindings[2].profileId });
    const policies = new Map<string, ReviewedAccessPolicy>();
    const policy = (id: string): ReviewedAccessPolicy => ({ workspace_id: id, revision: next(), artifact_digest: accessDigest(["TEST_ONLY", id]),
      approval_ref: "TEST_ONLY-not-owner-approval", state: "REVIEWED", qualification: "TEST_ONLY", protected_owner_user_id: owner.userId,
      researcher_fields: { state: "PENDING", policy_ref: null, fields: [] } });
    async function install(id: string) { const p = policy(id); await repo.putPolicy(p); policies.set(id, p); return p; }
    await install(workspace);
    const membership = { revision: "TEST_ONLY-member", receipt_id: "TEST_ONLY-receipt", mapping_revision: "TEST_ONLY-mapping" };
    const roots: AccessRelations["roots"] = { [root]: [] };
    const trust: AccessTrustProvider = { verifyPolicy: async () => null, verifyReceipt: async () => null,
      verifiedHumanMapping: async () => null, relations: async () => ({ qualified: true, revision: "TEST_ONLY-relations",
        own_alpha_ids: [], member_portfolio_ids: [], roots: structuredClone(roots), membership: { ...membership } }),
      readPublication: vi.fn(async () => { throw new Error("TEST_ONLY runtime must not read business publication"); }) };
    const grants: ScopedAccessGrant[] = [];
    async function grant(id: string, action: AccessAction = "maintenance.read", envs = options.grantEnvironments ?? ["paper"] as ReadEnvironment[]) {
      const p = policies.get(id)!, now = Date.now();
      const g: ScopedAccessGrant = { grant_id: next(), workspace_id: id, subject_user_id: user.userId, action, effect: "ALLOW",
        selector: { kind: "ROOT_SCOPE", root_id: root }, environments: envs, valid_from_ms: now - 1000, valid_until_ms: now + 600_000,
        delegable_actions: [], issued_by: owner.userId, parent_grant_id: null, revision: next(), policy_revision: p.revision,
        revoked_at_ms: null, requires_ts_acceptance: true, field_policy_ref: null, ts_receipt: { receipt_id: membership.receipt_id,
          membership_revision: membership.revision, mapping_revision: membership.mapping_revision, effective_at_ms: now - 1000, expires_at_ms: now + 600_000 } };
      await repo.saveGrant(g, true); grants.push(g); return g;
    }
    if (options.action !== null) await grant(workspace, options.action ?? "maintenance.read");
    if (options.sourceV2) { await install(source); await grant(source); }
    const token = next(), sessionId = next(), now = Date.now();
    await auth.sessions.create({ sessionId, userId: user.userId, tokenHash: hash(token), csrfSecretHash: hash(next()),
      accessSubject: null, accessTokenExpiresAt: null, activationId: null, sessionVersion: user.sessionVersion,
      idleExpiresAt: new Date(now + 600_000), absoluteExpiresAt: new Date(now + 600_000) });
    const access = new ExecutionAccessService(ctx.pool, auth, trust, true), scopes = new ExecutionReadScopes(ctx.pool, access, config);
    const projection = new ExecutionProfileProjectionRepository(domain, undefined, config);
    const mirror = new ExecutionDurableMirrorRepository(config, domain), workspaces = new WorkspacesRepository(ctx.pool, config);
    await domain.query("INSERT INTO execution_workspace_references(workspace_id,core_reference_receipt) VALUES($1,'TEST_ONLY_RUNTIME_CORE_REFERENCE')", [source]);
    if (options.observed) for (const binding of bindings) await domain.query(`INSERT INTO execution_profile_projection_snapshots
      (workspace_id,environment,profile_id,source_contract_revision,source_epoch,source_cursor,source_as_of,received_at,
       last_successful_refresh_at,completeness,projection_epoch,projection_sequence,payload_digest,payload)
      VALUES($1,$2,$3,'TEST_ONLY-contract','TEST_ONLY-epoch','PRIVATE_CURSOR',NULL,clock_timestamp()-interval '5 seconds',
       clock_timestamp()-interval '5 seconds','PARTIAL',$4,1,$5,'{"secret_business":"PRIVATE_BUSINESS"}'::jsonb)`,
      [source, binding.environment, binding.profileId, randomUUID(), accessDigest("TEST_ONLY-payload")]);
    if (options.observed && options.healthObserved !== false) for (const binding of bindings)
      await domain.query(`INSERT INTO execution_profile_projection_refresh_health
        (workspace_id,environment,profile_id,state,consecutive_failures)
        VALUES($1,$2,$3,'HEALTHY',0)`, [source, binding.environment, binding.profileId]);
    const service = new ExecutionScopedRuntimeManifestService(config, scopes, workspaces, projection, mirror);
    const app = await NestFactory.create<NestFastifyApplication>({ module: RuntimeTestModule,
      controllers: [ExecutionRuntimeManifestController, ExecutionScopedRuntimeManifestController], providers: [SessionGuard,
        { provide: CONTROL_API_CONFIG, useValue: config }, { provide: AuthService, useValue: auth },
        { provide: WorkspacesRepository, useValue: workspaces }, { provide: ExecutionReadScopes, useValue: scopes },
        { provide: ExecutionRuntimeManifestService, useValue: new ExecutionRuntimeManifestService(config) },
        { provide: ExecutionScopedRuntimeManifestService, useValue: service },
      ] }, new FastifyAdapter(), { logger: false, abortOnError: false });
    apps.add(app); app.useGlobalFilters(new HttpErrorFilter());
    await app.register(cookiePlugin as never); await app.init(); await app.getHttpAdapter().getInstance().ready();
    const http = app.getHttpAdapter().getInstance() as FastifyInstance;
    const get = (suffix = "/v2?environment=paper", authenticated = true) => http.inject({ method: "GET",
      url: `/api/v1/execution/runtime-manifest${suffix}`, headers: authenticated ? { cookie: `${SESSION_COOKIE}=${token}` } : {} });
    return { app, get, user, workspace, source, repo, config, policies, install, grant, grants, roots, trust,
      projection, mirror, scopes, sessionId };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function race(f: Fixture, change: () => Promise<unknown>) {
    const entered = deferred(), release = deferred(), original = f.projection.snapshotMetadata.bind(f.projection);
    vi.spyOn(f.projection, "snapshotMetadata").mockImplementationOnce(async (...args) => {
      const result = await original(...args); entered.resolve(); await release.promise; return result;
    });
    const request = f.get();
    try {
      await Promise.race([entered.promise, request.then(response => { throw new Error(`Request finished before metadata gate: ${response.statusCode}`); })]);
      await change();
    } finally { release.resolve(); }
    return request;
  }

  it("V2 keeps Core while reading exact separate retained storage; no full snapshot or ledger write", async () => {
    const f = await fixture({ observed: true }), snapshot = vi.spyOn(f.projection, "snapshot"), metadata = vi.spyOn(f.projection, "snapshotMetadata");
    const ledger = async () => ({ ...(await ctx.pool.query(`SELECT
      (SELECT count(*)::int FROM portal_access_policy_events) AS access_events,
      (SELECT count(*)::int FROM execution_trusted_commands) AS commands,
      (SELECT count(*)::int FROM execution_trusted_command_events) AS command_events`)).rows[0],
      ...(await domain.query("SELECT count(*)::int AS projection_events FROM execution_profile_projection_journal")).rows[0] });
    const before = await ledger(), response = await f.get();
    expect(response.statusCode).toBe(200); expect(response.headers["cache-control"]).toContain("no-store");
    const data = executionScopedRuntimeManifestSchema.parse(response.json());
    expect(data.workspace_id).toBe(f.workspace); expect(data.workspace_id).not.toBe(f.source);
    expect(data.local_projection.profiles).toEqual([{ environment: "paper", profile_id: bindings[0].profileId,
      component: "LOCAL_PROJECTION", state: "HEALTHY", health: "OBSERVED", lag_ms: expect.any(Number), last_error_code: null }]);
    expect(data.local_projection.profiles[0].lag_ms).toBeGreaterThanOrEqual(0);
    expect(data.durable_mirror[0]).toMatchObject({ state: "UNAVAILABLE", reason_code: "EDS06_MIRROR_DISABLED", revision: null, observed_at: null });
    expect(metadata.mock.calls).toEqual([[f.source, "paper", bindings[0].profileId]]);
    expect(snapshot).not.toHaveBeenCalled(); expect(f.trust.readPublication).not.toHaveBeenCalled();
    expect(await ledger()).toEqual(before);
    expect(response.body).not.toMatch(new RegExp(`${f.source}|PRIVATE_CURSOR|PRIVATE_BUSINESS|contract_status|source_origin|findings|total_count|command_readiness`));
  });
  it("no snapshot or health observation remains NOT_PUBLISHED/null", async () => {
    const f = await fixture(), response = await f.get(); expect(response.statusCode).toBe(200);
    expect(response.json().local_projection.profiles[0]).toMatchObject({ state: "NOT_PUBLISHED", health: "NOT_PUBLISHED", lag_ms: null });
  });
  it("snapshot clock alone cannot publish HEALTHY when the health row is absent", async () => {
    const f = await fixture({ observed: true, healthObserved: false }), response = await f.get();
    expect(response.statusCode).toBe(200);
    expect(response.json().local_projection.profiles[0]).toMatchObject({ state: "NOT_PUBLISHED", health: "OBSERVED", lag_ms: expect.any(Number) });
    expect(response.json().local_projection.profiles[0].lag_ms).toBeGreaterThanOrEqual(0);
  });
  it("source V2 needs an independent technical grant in addition to the Core grant", async () => {
    const f = await fixture({ sourceV2: true }); expect((await f.get()).statusCode).toBe(200);
    const grant = f.grants.find(g => g.workspace_id === f.source)!;
    await f.repo.saveGrant({ ...grant, revoked_at_ms: Date.now(), revision: next() });
    expect((await f.get()).statusCode).toBe(404);
  });
  it("legacy retained delegation authorizes only source reading, not Core technical maintenance", async () => {
    const f = await fixture({ sourceMember: false, retainedGrant: true }); expect((await f.get()).statusCode).toBe(200);
    await f.repo.saveGrant({ ...f.grants[0], revoked_at_ms: Date.now(), revision: next() });
    expect((await f.get()).statusCode).toBe(404);
  });
  it("all-profile request requires every configured environment; explicit Paper is independent", async () => {
    const f = await fixture(); expect((await f.get("/v2")).statusCode).toBe(404);
    expect((await f.get()).statusCode).toBe(200);
    await f.grant(f.workspace, "maintenance.read", ["sandbox", "live"]);
    const response = await f.get("/v2"); expect(response.statusCode).toBe(200);
    expect(response.json().local_projection.profiles.map((p: { environment: string }) => p.environment)).toEqual(["paper", "sandbox", "live"]);
    expect(response.json().durable_mirror.map((p: { environment: string }) => p.environment)).toEqual(["paper", "sandbox", "live"]);
  });
  it.each([{ role: "USER" as const, action: "business.read_all" as const }, { role: "ADMIN" as const, action: null }])(
    "role=$role/action=$action does not imply technical authorization", async options => {
      const f = await fixture(options), read = vi.spyOn(f.projection, "snapshotMetadata");
      expect((await f.get()).statusCode).toBe(404); expect(read).not.toHaveBeenCalled();
    });
  it.each([0, 2])("%i qualified roots cannot be guessed into one technical ROOT", async count => {
    const f = await fixture(), read = vi.spyOn(f.projection, "snapshotMetadata");
    delete (f.roots as Record<string, unknown>)[root];
    for (let index = 0; index < count; index++) (f.roots as Record<string, unknown>)[`TEST_ONLY-root-${index}`] = [];
    expect((await f.get()).statusCode).toBe(503); expect(read).not.toHaveBeenCalled();
  });
  it("source membership/delegation is required even when Core maintenance is allowed", async () => {
    const f = await fixture({ sourceMember: false }), read = vi.spyOn(f.projection, "snapshotMetadata");
    expect((await f.get()).statusCode).toBe(404); expect(read).not.toHaveBeenCalled();
  });
  it.each(["grant", "session", "source-membership", "source-policy"] as const)("current %s change during scalar I/O refuses retained bytes", async kind => {
    const f = await fixture({ observed: true });
    const response = await race(f, async () => {
      if (kind === "grant") return f.repo.saveGrant({ ...f.grants[0], revoked_at_ms: Date.now(), revision: next() });
      if (kind === "session") return auth.sessions.revokeSession(f.sessionId, "TEST_ONLY runtime race");
      if (kind === "source-membership") return ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [f.source, f.user.userId]);
      return f.install(f.source);
    });
    expect([404, 409]).toContain(response.statusCode); expect(response.body).not.toContain("PRIVATE_BUSINESS");
    expect(response.headers["cache-control"]).toContain("no-store");
  });
  it("sanitizes an asynchronous real PostgreSQL read error into typed 503", async () => {
    const f = await fixture(), original = f.projection.snapshotMetadata.bind(f.projection);
    // Deliberate read-only driver fault injection in this disposable DB, not
    // a genuine outage/recovery or source transport acceptance receipt.
    vi.spyOn(f.projection, "snapshotMetadata").mockImplementationOnce(async (...args) => {
      await domain.query('SELECT "PRIVATE_SQL_SENTINEL" FROM execution_profile_projection_snapshots LIMIT 1');
      return original(...args);
    });
    const response = await f.get();
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("EXECUTION_READ_AUTHORITY_UNAVAILABLE");
    expect(response.body).not.toMatch(/PRIVATE_SQL_SENTINEL|SELECT|column|execution_profile_projection_snapshots|42703/);
    expect(response.headers["cache-control"]).toContain("no-store");
  });
  it("rejects configuration drift during final Core revalidation without another authority await", async () => {
    const f = await fixture({ observed: true }), original = f.scopes.revalidate.bind(f.scopes);
    let coreRevalidations = 0;
    vi.spyOn(f.scopes, "revalidate").mockImplementation(async scope => {
      await original(scope);
      if (scope.workspaceId === f.workspace && ++coreRevalidations === 2)
        f.config.EXECUTION_EDGE_PAPER_PROFILE_ID = "PAPER_TEST_ONLY_CHANGED";
    });
    const response = await f.get();
    expect(coreRevalidations).toBe(2); expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("EXECUTION_READ_ACCESS_CHANGED");
    expect(response.body).not.toContain("PAPER_TEST_ONLY_CHANGED");
  });
  it("V1 retains source rebasing and its unchanged schema, V2 retains the Core workspace", async () => {
    const f = await fixture(), old = await f.get("");
    expect(old.statusCode).toBe(200); expect(old.json()).toMatchObject({ schema_version: "portal.execution.runtime-manifest.v1", workspace_id: f.source });
    expect(old.json().contract_status).toBeDefined();
    const current = await f.get(); expect(current.statusCode).toBe(200); expect(current.json().workspace_id).toBe(f.workspace);
  });
  it("mounted route rejects missing auth, unknown workspace and strict-query attacks", async () => {
    const f = await fixture(); expect((await f.get("/v2", false)).statusCode).toBe(401);
    expect((await f.get(`/v2?workspace_id=${next()}&environment=paper`)).statusCode).toBe(404);
    for (const suffix of ["/v2?environment=unknown", "/v2?profile_id=PAPER_OTHER", "/v2?environment=paper&actor=owner",
      `/v2?workspace_id=${"x".repeat(97)}`]) expect((await f.get(suffix)).statusCode).toBe(400);
  });
  it("closed schema rejects hidden extras, mismatched profiles and nonfinite/oversized observations", async () => {
    const f = await fixture(), response = await f.get(); expect(response.statusCode).toBe(200); const valid = response.json();
    for (const candidate of [
      { ...valid, source_workspace_id: f.source },
      { ...valid, local_projection: { ...valid.local_projection, profiles: [] } },
      { ...valid, durable_mirror: [...valid.durable_mirror, ...valid.durable_mirror] },
      { ...valid, durable_mirror: [{ ...valid.durable_mirror[0], profile_id: "PAPER_OTHER" }] },
      { ...valid, durable_mirror: [{ ...valid.durable_mirror[0], findings: [] }] },
      { ...valid, local_projection: { ...valid.local_projection, profiles: [{ ...valid.local_projection.profiles[0], lag_ms: Infinity }] } },
    ]) expect(executionScopedRuntimeManifestSchema.safeParse(candidate).success).toBe(false);
  });
});
