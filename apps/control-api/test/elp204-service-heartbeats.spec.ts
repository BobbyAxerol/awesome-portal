/** Retained service heartbeat mounted HTTP/PG regressions.
 * Mounted HTTP/Auth/SessionGuard + actual disposable Core/Execution PG. Source
 * records, relations, policies and receipt pins are explicitly SYNTHETIC TEST_ONLY.
 * No source/TLS/native-COMMIT/runtime/browser qualification is claimed. */
import "reflect-metadata";
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
import type { AuthSession, PortalUser } from "../src/domain";
import { HttpErrorFilter } from "../src/http-error.filter";
import { SessionGuard } from "../src/facade/session.guard";
import { WorkspacesRepository } from "../src/repos/workspaces";
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { CONTROL_API_CONFIG } from "../src/tokens";
import { querySigningKeys } from "../src/config";
import { AccessRepository } from "../src/execution-v2/access.repository";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import { accessDigest, type AccessRelations } from "../src/execution-v2/access-policy";
import type { AccessAction, ReviewedAccessPolicy, ScopedAccessGrant } from "../src/execution-v2/access.contract";
import type { AccessTrustProvider } from "../src/execution-v2/access-trust";
import type { ExecutionReadPublication, ExecutionReadPublicationRequest } from "../src/execution-v2/read-publication";
import { ExecutionReadScopes, type ReadEnvironment, type ReadScopePrincipal } from "../src/execution-v2/read-scope";
import { serviceHeartbeatsPageSchema } from "../src/execution-v2/service-heartbeats.contract";
import { ExecutionServiceHeartbeatsService } from "../src/execution/service-heartbeats.service";
import { ExecutionServiceHeartbeatsController } from "../src/execution/service-heartbeats.controller";
import { ExecutionProfileProjectionRepository, type ProfileProjectionDocument } from "../src/execution/profile-projection.repository";
import { migrateExecutionStore } from "../src/execution/store-schema";
import { migrateTestDatabase, setupApp, teardownApp, testConfig } from "./harness";

const database = process.env.TEST_DATABASE_URL;
const next = () => `elp204-hb-${randomUUID()}`;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const ROOT = "TEST_ONLY-service-heartbeat-root";
const SOURCE = "manager.current.service-heartbeats", RELATION = "service_heartbeats", KEY = `${SOURCE}:${RELATION}`;
const DATASET = `relation:${KEY}`, ROUTE = "/api/v1/execution/technical/service-heartbeats";
const CATALOGUE = accessDigest("TEST_ONLY-HEARTBEAT-CATALOGUE-NOT-QUALIFIED");
const PROFILE = { paper: "PAPER_BINANCE_USDM", sandbox: "SANDBOX_BINANCE_USDM", live: "LIVE_BINANCE_USDM" } as const;
const PRIVATE = "PRIVATE_HEARTBEAT_SOURCE_SENTINEL";
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
};
@Module({}) class HeartbeatTestModule {}

describe.skipIf(!database)("ELP2-04 retained heartbeat HTTP / real PG, TEST_ONLY source", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>, auth: AuthService, owner: PortalUser;
  let domain: Pool, domainCreated = false;
  const domainName = "elp204_hb_exec_" + randomUUID().replaceAll("-", "");
  const pgLimits = { connectionTimeoutMillis: 2000, query_timeout: 15000,
    statement_timeout: 15000, idle_in_transaction_session_timeout: 15000 };
  const databaseUrl = (name: string) => {
    const value = new URL(database!); value.pathname = "/" + name; return value.toString();
  };
  const apps = new Set<NestFastifyApplication>();
  async function active(role: "ADMIN" | "USER" = "USER") {
    const username = next(), user = await auth.users.create({ userId: next(), username, displayName: username, role });
    return (await auth.users.applyLifecycleChange({ userId: user.userId, expectedRevision: user.accountRevision,
      status: "ACTIVE", mustChangePassword: false }))!;
  }
  async function session(user: PortalUser) {
    const token = next(), sessionId = next(), now = Date.now();
    const value: AuthSession = { sessionId, userId: user.userId, state: "ACTIVE", sessionVersion: user.sessionVersion,
      authenticationTime: new Date(now), idleExpiresAt: new Date(now + 600_000), absoluteExpiresAt: new Date(now + 600_000) };
    await auth.sessions.create({ sessionId, userId: user.userId, tokenHash: hash(token), csrfSecretHash: hash(next()),
      accessSubject: null, accessTokenExpiresAt: null, activationId: null, sessionVersion: user.sessionVersion,
      idleExpiresAt: value.idleExpiresAt, absoluteExpiresAt: value.absoluteExpiresAt });
    return { token, value };
  }
  beforeAll(async () => {
    await migrateTestDatabase(database!); ctx = await setupApp({ DATABASE_URL: database! }); auth = ctx.app.get(AuthService);
    const admin = new Pool({ connectionString: databaseUrl("postgres"), max: 1, ...pgLimits });
    try { await admin.query(`CREATE DATABASE ${domainName}`); domainCreated = true; }
    finally { await admin.end(); }
    domain = new Pool({ connectionString: databaseUrl(domainName), max: 2, ...pgLimits });
    await migrateExecutionStore(domain);
    owner = await active("ADMIN");
    await new OwnerAccessRepository(ctx.pool).claimOwner({ userId: owner.userId, claimedBy: "ELP204_HEARTBEAT_TEST_ONLY" });
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
    coreLegacy?: boolean; sourceMember?: boolean; retainedGrant?: boolean; sourceV2?: boolean;
    sourceGrant?: boolean; environments?: ReadEnvironment[]; rows?: number; seed?: boolean } = {}) {
    const user = await active(options.role), repo = new AccessRepository(ctx.pool);
    const workspace = await new WorkspacesRepository(ctx.pool).ensurePersonal(user.userId, user.username), source = next();
    await ctx.pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY heartbeat storage',$2)", [source, owner.userId]);
    await ctx.pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'MEMBER')", [workspace, owner.userId]);
    if (options.sourceMember !== false) await ctx.pool.query(
      "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'MEMBER')", [source, user.userId]);
    if (options.retainedGrant) await ctx.pool.query(`INSERT INTO execution_retained_review_access
      (workspace_id,user_id,issued_by,expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '10 minutes')`, [source, user.userId, owner.userId]);
    await domain.query("INSERT INTO execution_workspace_references(workspace_id,core_reference_receipt) VALUES($1,'TEST_ONLY_HEARTBEAT_CORE_REFERENCE')", [source]);
    const config = testConfig({ DATABASE_URL: database!, AUTH_MODE: "dev", EXECUTION_DATABASE_URL: databaseUrl(domainName),
      EXECUTION_READ_PROFILE: "retained_review_v1", FEATURE_EXECUTION_LOCAL_PROJECTION: "true",
      EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: source, EXECUTION_EDGE_PAPER_PROFILE_ID: PROFILE.paper,
      EXECUTION_EDGE_SANDBOX_PROFILE_ID: PROFILE.sandbox, EXECUTION_EDGE_LIVE_PROFILE_ID: PROFILE.live });
    const projection = new ExecutionProfileProjectionRepository(domain, undefined, config), policies = new Map<string, ReviewedAccessPolicy>();
    async function install(id: string) {
      const policy: ReviewedAccessPolicy = { workspace_id: id, revision: next(), artifact_digest: accessDigest(["TEST_ONLY", id]),
        approval_ref: "TEST_ONLY-NOT-OWNER-APPROVAL", state: "REVIEWED", qualification: "TEST_ONLY", protected_owner_user_id: owner.userId,
        researcher_fields: { state: "PENDING", policy_ref: null, fields: [] } };
      await repo.putPolicy(policy); policies.set(id, policy); return policy;
    }
    if (!options.coreLegacy) await install(workspace);
    const membership = { revision: "TEST_ONLY-member", receipt_id: "TEST_ONLY-receipt", mapping_revision: "TEST_ONLY-mapping" };
    const roots: AccessRelations["roots"] = { [ROOT]: [] };
    const sourceState: { revision: string; publicationRevision: string; publicationMissing: boolean;
      mutate?: (p: ExecutionReadPublication) => void; beforePublication?: (r: ExecutionReadPublicationRequest) => Promise<void> } = {
      revision: "TEST_ONLY-current-relations", publicationRevision: "TEST_ONLY-publication", publicationMissing: false,
    };
    // Echo EXACT fixture metadata, not the incoming request's claimed binding.
    // This is a synthetic adapter stand-in, not source qualification or mTLS.
    const trust: AccessTrustProvider = { verifyPolicy: async () => null, verifyReceipt: async () => null,
      verifiedHumanMapping: async () => null,
      relations: async () => ({ qualified: true, revision: sourceState.revision, own_alpha_ids: [], member_portfolio_ids: [],
        roots: structuredClone(roots), membership: { ...membership } }),
      readPublication: vi.fn(async (request: ExecutionReadPublicationRequest) => {
        await sourceState.beforePublication?.(request);
        if (sourceState.publicationMissing || !policies.has(request.workspace_id)) return null;
        const stored = (await domain.query<{ payload_digest: string; projection_epoch: string; source_catalogue_sha256: string | null }>(
          `SELECT payload_digest,projection_epoch::text,source_catalogue_sha256 FROM execution_profile_projection_snapshots
           WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3`, [source, request.environment, request.profile_id])).rows[0];
        if (!stored) return null;
        const publication: ExecutionReadPublication = { workspace_id: request.workspace_id, environment: request.environment,
          profile_id: request.profile_id, qualification: "TEST_ONLY", publication_revision: sourceState.publicationRevision,
          binding: { dataset_id: DATASET, source_revision: stored.payload_digest, projection_generation: stored.projection_epoch,
            catalogue_revision: stored.source_catalogue_sha256, window: null }, population_coverage: "COMPLETE_FOR_DATASET_WINDOW",
          provenance_ref: "TEST_ONLY-NOT-SOURCE-COMMISSIONED", current_linkage: null, resources: [{ kind: "ROOT", id: ROOT }], tuples: [] };
        sourceState.mutate?.(publication); return publication;
      }),
    };
    const grants: ScopedAccessGrant[] = [];
    async function grant(id = workspace, action: AccessAction = "maintenance.read", envs = options.environments ?? ["paper"] as ReadEnvironment[]) {
      const now = Date.now(), value: ScopedAccessGrant = { grant_id: next(), workspace_id: id, subject_user_id: user.userId,
        action, effect: "ALLOW", selector: { kind: "ROOT_SCOPE", root_id: ROOT }, environments: envs,
        valid_from_ms: now - 1000, valid_until_ms: now + 600_000, delegable_actions: [], issued_by: owner.userId,
        parent_grant_id: null, revision: next(), policy_revision: policies.get(id)!.revision, revoked_at_ms: null,
        requires_ts_acceptance: true, field_policy_ref: null, ts_receipt: { receipt_id: membership.receipt_id,
          membership_revision: membership.revision, mapping_revision: membership.mapping_revision,
          effective_at_ms: now - 1000, expires_at_ms: now + 600_000 } };
      await repo.saveGrant(value, true); grants.push(value); return value;
    }
    if (!options.coreLegacy && options.action !== null) await grant(workspace, options.action ?? "maintenance.read");
    if (options.sourceV2) { await install(source); if (options.sourceGrant !== false) await grant(source); }
    const observed = new Date(Date.now() - 10_000), epoch = randomUUID();
    function document(environment: ReadEnvironment, rows: number): ProfileProjectionDocument {
      return { schema_version: "portal.execution.profile-projection.v1", workspace_id: source, environment,
        profile_id: PROFILE[environment], source_contract_revision: "TEST_ONLY-heartbeat-contract", source_catalogue_sha256: CATALOGUE,
        relations: { [KEY]: { source_id: SOURCE, relation: RELATION, source_catalogue_sha256: CATALOGUE,
          availability: "AVAILABLE", reason_code: null, as_of: observed.toISOString(), freshness: "FRESH", completeness: "COMPLETE",
          items: Array.from({ length: rows }, (_, index) => ({ lineage: { workspace_id: source, profile_id: PROFILE[environment],
            source_contract_revision: "TEST_ONLY-heartbeat-contract", source_catalogue_sha256: CATALOGUE },
          fields: { service_name: `${PRIVATE}-${index}`, last_seen_at: observed.toISOString(), status: `${PRIVATE}-UNINTERPRETED` } })) },
          "manager.accounts:accounts": { source_id: "manager.accounts", relation: "accounts", availability: "AVAILABLE",
            reason_code: null, as_of: observed.toISOString(), freshness: "FRESH", completeness: "COMPLETE",
            items: [{ lineage: { workspace_id: source, profile_id: PROFILE[environment], source_contract_revision: "TEST_ONLY-heartbeat-contract" },
              fields: { account_id: PRIVATE, equity: "987654321.123456789" } }] } } };
    }
    async function write(doc: ProfileProjectionDocument, projectionEpoch = epoch) {
      // Synthetic retained input only. The production reader must remain read-only.
      await domain.query(`INSERT INTO execution_profile_projection_snapshots
        (workspace_id,environment,profile_id,source_contract_revision,source_catalogue_sha256,source_epoch,source_cursor,
         source_as_of,received_at,last_successful_refresh_at,completeness,projection_epoch,projection_sequence,payload_digest,payload)
        VALUES($1,$2,$3,$4,$5,'TEST_ONLY-source-epoch','PRIVATE_CURSOR',$6,$6,$6,'COMPLETE',$7,1,$8,$9::jsonb)
        ON CONFLICT(workspace_id,environment,profile_id) DO UPDATE SET payload=EXCLUDED.payload,payload_digest=EXCLUDED.payload_digest,
          projection_epoch=EXCLUDED.projection_epoch,projection_sequence=execution_profile_projection_snapshots.projection_sequence+1,
          received_at=EXCLUDED.received_at,last_successful_refresh_at=EXCLUDED.last_successful_refresh_at`,
      [source, doc.environment, doc.profile_id, doc.source_contract_revision, CATALOGUE, observed, projectionEpoch, accessDigest(doc), JSON.stringify(doc)]);
    }
    const docs = new Map<ReadEnvironment, ProfileProjectionDocument>();
    if (options.seed !== false) for (const environment of options.environments ?? ["paper"] as ReadEnvironment[]) {
      const doc = document(environment, options.rows ?? 3); await write(doc); docs.set(environment, doc);
    }
    const storedSession = await session(user), principal: ReadScopePrincipal = { user, session: storedSession.value,
      workspaceId: workspace, viewerWorkspaceId: workspace };
    const access = new ExecutionAccessService(ctx.pool, auth, trust, true), scopes = new ExecutionReadScopes(ctx.pool, access, config);
    const workspaces = new WorkspacesRepository(ctx.pool, config);
    const service = new ExecutionServiceHeartbeatsService(config, scopes, workspaces, projection);
    const app = await NestFactory.create<NestFastifyApplication>({ module: HeartbeatTestModule,
      controllers: [ExecutionServiceHeartbeatsController], providers: [SessionGuard,
        { provide: CONTROL_API_CONFIG, useValue: config }, { provide: AuthService, useValue: auth },
        { provide: WorkspacesRepository, useValue: workspaces }, { provide: ExecutionReadScopes, useValue: scopes },
        { provide: ExecutionServiceHeartbeatsService, useValue: service }] }, new FastifyAdapter(), { logger: false, abortOnError: false });
    apps.add(app); app.useGlobalFilters(new HttpErrorFilter());
    await app.register(cookiePlugin as never); await app.init(); await app.getHttpAdapter().getInstance().ready();
    const http = app.getHttpAdapter().getInstance() as FastifyInstance;
    const get = (query = "environment=paper", token: string | null = storedSession.token) => http.inject({ method: "GET",
      url: `${ROUTE}${query ? "?" + query : ""}`, headers: token === null ? {} : { cookie: `${SESSION_COOKIE}=${token}` } });
    return { get, user, workspace, source, repo, config, policies, install, grant, grants, roots, trust, sourceState,
      projection, access, scopes, principal, service, workspaces, sessionId: storedSession.value.sessionId, docs, write, document, epoch, observed };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function revoke(f: Fixture, id = f.workspace) {
    const value = f.grants.find(g => g.workspace_id === id)!;
    await f.repo.saveGrant({ ...value, revision: next(), revoked_at_ms: Date.now() });
  }
  async function raceRaw(f: Fixture, change: () => Promise<unknown>) {
    const entered = deferred(), release = deferred(), original = f.projection.rawSnapshot.bind(f.projection);
    const spy = vi.spyOn(f.projection, "rawSnapshot").mockImplementationOnce(async (...args) => {
      const result = await original(...args); entered.resolve(); await release.promise; return result;
    });
    const pending = f.get();
    try {
      await Promise.race([entered.promise, pending.then(r => { throw new Error(`Read finished before raw gate: ${r.statusCode}`); })]);
      await change();
    } finally { release.resolve(); }
    return { response: await pending, spy };
  }
  async function first(f: Fixture, limit = 1) {
    const response = await f.get(`environment=paper&limit=${limit}`); expect(response.statusCode).toBe(200);
    return serviceHeartbeatsPageSchema.parse(response.json());
  }
  async function ledger() {
    return { ...(await ctx.pool.query(`SELECT (SELECT count(*)::int FROM portal_access_policy_events) AS access_events,
      (SELECT count(*)::int FROM execution_trusted_commands) AS commands,
      (SELECT count(*)::int FROM execution_trusted_command_events) AS command_events`)).rows[0],
      ...(await domain.query("SELECT count(*)::int AS projection_events FROM execution_profile_projection_journal")).rows[0] };
  }

  it("Core maintenance-only reads exact separate storage with no business census or writes", async () => {
    const f = await fixture(), raw = vi.spyOn(f.projection, "rawSnapshot"), before = await ledger(), response = await f.get();
    expect(response.statusCode).toBe(200); expect(response.headers["cache-control"]).toContain("no-store");
    const body = serviceHeartbeatsPageSchema.parse(response.json());
    expect(body.workspace_id).toBe(f.workspace); expect(body.workspace_id).not.toBe(f.source);
    expect(body.records).toHaveLength(3); expect(body.page).toEqual({ limit: 100, maximum_page_rows: 200, returned_count: 3, next_cursor: null });
    expect(body.records[0]).toMatchObject({ component: "SERVICE_HEARTBEAT", source_status: null, health: null,
      source_last_seen_at_ms: f.observed.valueOf(), source_last_seen_reason_code: null });
    expect(body.source_as_of_ms).toBe(f.observed.valueOf()); expect(body.snapshot_received_at_ms).toBe(f.observed.valueOf());
    expect(raw.mock.calls).toEqual([[f.source, "paper", PROFILE.paper]]);
    expect(await ledger()).toEqual(before);
    expect(response.body).not.toMatch(new RegExp(`${PRIVATE}|${f.source}|PRIVATE_CURSOR|service_name|instance_id|987654321|equity|total_count|source_revision`));
    const requests = vi.mocked(f.trust.readPublication!).mock.calls.map(([request]) => request);
    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) expect(request).toMatchObject({ workspace_id: f.workspace, environment: "paper", profile_id: PROFILE.paper,
      binding: { dataset_id: DATASET, projection_generation: f.epoch, catalogue_revision: CATALOGUE, window: null } });
    expect(f.policies.get(f.workspace)!.researcher_fields.state).toBe("PENDING");
  });
  it("strict bounded paging visits retained records once without returning source PKs", async () => {
    const f = await fixture({ rows: 201 }), a = await first(f, 200);
    expect(a.records).toHaveLength(200); expect(a.page.next_cursor).toEqual(expect.any(String));
    const response = await f.get(`environment=paper&limit=200&after=${encodeURIComponent(a.page.next_cursor!)}`);
    expect(response.statusCode).toBe(200); const b = serviceHeartbeatsPageSchema.parse(response.json());
    expect(b.records).toHaveLength(1); expect(b.page.next_cursor).toBeNull(); expect(b.revision).toBe(a.revision);
    expect(new Set([...a.records, ...b.records].map(r => r.record_id)).size).toBe(201);
    expect(response.body).not.toContain(PRIVATE);
  });
  it("source V2 requires a separate maintenance grant, not its membership alone", async () => {
    const f = await fixture({ sourceV2: true }); expect((await f.get()).statusCode).toBe(200);
    await revoke(f, f.source); expect((await f.get()).statusCode).toBe(404);
    const missing = await fixture({ sourceV2: true, sourceGrant: false }); expect((await missing.get()).statusCode).toBe(404);
  });
  it("legacy retained delegation is storage eligibility only and cannot replace Core maintenance", async () => {
    const f = await fixture({ sourceMember: false, retainedGrant: true }); expect((await f.get()).statusCode).toBe(200);
    await revoke(f); expect((await f.get()).statusCode).toBe(404);
  });
  it.each([{ action: "business.read_all" as const }, { action: "development.read" as const },
    { action: null, role: "ADMIN" as const }, { coreLegacy: true }])("no technical fallback: %o", async options => {
    const f = await fixture(options), raw = vi.spyOn(f.projection, "rawSnapshot"), metadata = vi.spyOn(f.projection, "snapshotMetadata");
    expect([403, 404]).toContain((await f.get()).statusCode); expect(raw).not.toHaveBeenCalled(); expect(metadata).not.toHaveBeenCalled();
  });
  it.each([0, 2])("%i ROOTs cannot be guessed into one heartbeat scope", async count => {
    const f = await fixture(), raw = vi.spyOn(f.projection, "rawSnapshot"); delete (f.roots as Record<string, unknown>)[ROOT];
    for (let i = 0; i < count; i++) (f.roots as Record<string, unknown>)[`TEST_ONLY-other-root-${i}`] = [];
    expect((await f.get()).statusCode).toBe(503); expect(raw).not.toHaveBeenCalled();
  });
  it("a changed ROOT, wrong granted environment and unreadable source all refuse without raw data", async () => {
    const changed = await fixture(); delete (changed.roots as Record<string, unknown>)[ROOT];
    (changed.roots as Record<string, unknown>)["TEST_ONLY-different-root"] = [];
    expect((await changed.get()).statusCode).toBe(404);
    const wrong = await fixture(); expect((await wrong.get("environment=sandbox")).statusCode).toBe(404);
    const unreadable = await fixture({ sourceMember: false }), raw = vi.spyOn(unreadable.projection, "rawSnapshot");
    expect((await unreadable.get()).statusCode).toBe(404); expect(raw).not.toHaveBeenCalled();
  });
  it.each(["missing", "workspace", "environment", "profile", "root", "coverage", "revision", "generation", "catalogue", "tuples"] as const)(
    "exact synthetic publication refuses %s mismatch", async axis => {
      const f = await fixture(), raw = vi.spyOn(f.projection, "rawSnapshot");
      // The mismatch is stable across the initial/confirming publication reads.
      // Generating a different workspace per read tests a causal change (409),
      // not an unqualified but unchanged publication (503).
      const wrongWorkspace = next();
      if (axis === "missing") f.sourceState.publicationMissing = true;
      f.sourceState.mutate = p => {
        if (axis === "workspace") p.workspace_id = wrongWorkspace;
        if (axis === "environment") p.environment = "sandbox";
        if (axis === "profile") p.profile_id = "TEST_ONLY-other-profile";
        if (axis === "root") p.resources = [{ kind: "ROOT", id: "TEST_ONLY-other-root" }];
        if (axis === "coverage") p.population_coverage = "PARTIAL";
        if (axis === "revision") p.binding.source_revision = "TEST_ONLY-other-payload";
        if (axis === "generation") p.binding.projection_generation = "TEST_ONLY-other-epoch";
        if (axis === "catalogue") p.binding.catalogue_revision = accessDigest("TEST_ONLY-other-catalogue");
        if (axis === "tuples") p.tuples = [{ alpha_id: "PRIVATE-alpha", alpha_version_id: "PRIVATE-version", portfolio_id: "PRIVATE-portfolio",
          deployment_id: "PRIVATE-deployment", account_id: "PRIVATE-account" }];
      };
      const response = await f.get(); expect(response.statusCode).toBe(503); expect(raw).not.toHaveBeenCalled();
      expect(response.body).not.toMatch(/PRIVATE-|PRIVATE_HEARTBEAT/);
    });
  it("confirming publication/context changes are not retried when metadata did not move", async () => {
    for (const axis of ["publication", "context"] as const) {
      const f = await fixture(); let count = 0;
      f.sourceState.beforePublication = async () => {
        if (++count === (axis === "publication" ? 2 : 1)) {
          if (axis === "publication") f.sourceState.publicationRevision = next(); else f.sourceState.revision = next();
        }
      };
      const response = await f.get(); expect(response.statusCode).toBe(409);
    }
  });
  it.each(["grant", "session", "source-member", "source-policy"] as const)("final delivery refuses actual %s change during raw PG read", async axis => {
    const f = await fixture(), { response, spy } = await raceRaw(f, async () => {
      if (axis === "grant") return revoke(f);
      if (axis === "session") return auth.sessions.revokeSession(f.sessionId, "TEST_ONLY heartbeat raw race");
      if (axis === "source-member") return ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [f.source, f.user.userId]);
      return f.install(f.source);
    });
    expect([404, 409]).toContain(response.statusCode); expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.body).not.toContain(PRIVATE); expect(spy).toHaveBeenCalledTimes(1);
  });
  it("persistent raw generation mismatch cannot be retried into an authorized snapshot", async () => {
    const f = await fixture(), original = f.projection.rawSnapshot.bind(f.projection);
    vi.spyOn(f.projection, "rawSnapshot").mockImplementation(async (...args) => {
      const snapshot = await original(...args); return snapshot && { ...snapshot, projectionEpoch: randomUUID() };
    });
    const response = await f.get(); expect(response.statusCode).toBe(409); expect(response.body).not.toContain(PRIVATE);
  });
  it("publication-only withdrawal during final awaited eligibility refuses the assembled page", async () => {
    const f = await fixture(), metadata = await f.projection.snapshotMetadata(f.source, "paper", PROFILE.paper), before = await ledger();
    const originalParse = serviceHeartbeatsPageSchema.parse.bind(serviceHeartbeatsPageSchema);
    const originalEligibility = f.workspaces.canReadExecution.bind(f.workspaces);
    let assembled = false, withdrawn = false;
    vi.spyOn(serviceHeartbeatsPageSchema, "parse").mockImplementation((value, params) => {
      const result = originalParse(value, params); assembled = true; return result;
    });
    // Target the last eligibility await AFTER DTO assembly, not a fragile
    // call count. All real grants, ROOT relations and snapshot metadata stay
    // unchanged; only this SYNTHETIC TEST_ONLY publication becomes absent.
    vi.spyOn(f.workspaces, "canReadExecution").mockImplementation(async (...args) => {
      const allowed = await originalEligibility(...args);
      if (assembled && !withdrawn) { withdrawn = true; f.sourceState.publicationMissing = true; }
      return allowed;
    });
    const raw = vi.spyOn(f.projection, "rawSnapshot"), response = await f.get();
    expect(assembled).toBe(true); expect(withdrawn).toBe(true); expect(raw).toHaveBeenCalledTimes(1);
    expect(response.statusCode).toBe(503); expect(response.json().error.code).toBe("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED");
    expect(response.headers["cache-control"]).toContain("no-store"); expect(response.body).not.toContain(PRIVATE);
    expect(await f.projection.snapshotMetadata(f.source, "paper", PROFILE.paper)).toEqual(metadata);
    expect(await ledger()).toEqual(before);
  });
  it("publishes the exact projector read clock, preserving source plus one millisecond as typed future absence", async () => {
    const f = await fixture(), readAtMs = f.observed.valueOf() + 1000, doc = structuredClone(f.docs.get("paper")!);
    const future = new Date(readAtMs + 1).toISOString(); doc.relations[KEY].as_of = future;
    for (const item of doc.relations[KEY].items) item.fields.last_seen_at = future;
    await f.write(doc);
    const original = f.projection.rawSnapshot.bind(f.projection);
    let clock: { mockRestore(): void } | undefined;
    vi.spyOn(f.projection, "rawSnapshot").mockImplementationOnce(async (...args) => {
      const snapshot = await original(...args);
      // Only the next synchronous projection clock read is controlled.
      // Subsequent real Auth/PG/final fences continue using the real clock.
      clock = vi.spyOn(Date, "now").mockReturnValueOnce(readAtMs); return snapshot;
    });
    let response: Awaited<ReturnType<Fixture["get"]>>;
    try { response = await f.get(); } finally { clock?.mockRestore(); }
    expect(clock).toBeDefined(); expect(response.statusCode).toBe(200);
    const body = serviceHeartbeatsPageSchema.parse(response.json());
    expect(body.read_at_ms).toBe(readAtMs); expect(body.snapshot_received_at_ms).toBe(f.observed.valueOf());
    expect(body.source_as_of_ms).toBeNull(); expect(body.source_as_of_reason_code).toBe("SOURCE_CLOCK_AHEAD_OF_READ");
    expect(body.records).toHaveLength(3);
    for (const record of body.records) {
      expect(record.source_last_seen_at_ms).toBeNull(); expect(record.source_last_seen_reason_code).toBe("SOURCE_CLOCK_AHEAD_OF_READ");
    }
  });
  it("native PostgreSQL diagnostics become a typed sanitized 503", async () => {
    const f = await fixture(); vi.spyOn(f.projection, "rawSnapshot").mockImplementationOnce(async () => {
      await domain.query('SELECT "PRIVATE_SQL_HEARTBEAT_SENTINEL" FROM execution_profile_projection_snapshots LIMIT 1'); return null;
    });
    const response = await f.get(); expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("EXECUTION_READ_AUTHORITY_UNAVAILABLE");
    expect(response.body).not.toMatch(/PRIVATE_SQL_HEARTBEAT_SENTINEL|SELECT|column|42703|execution_profile_projection_snapshots/);
  });
  it("missing capture, authorized-empty and partial-empty remain different typed facts", async () => {
    const missing = await fixture({ seed: false }), a = await first(missing);
    expect(a.capture_state).toBe("SNAPSHOT_NOT_CAPTURED"); expect(a.availability).toBe("UNAVAILABLE"); expect(a.records).toEqual([]);
    const empty = await fixture({ rows: 0 }), b = await first(empty);
    expect(b.capture_state).toBe("EMPTY_COMPLETE"); expect(b.availability).toBe("AVAILABLE");
    const doc = empty.docs.get("paper")!; doc.relations[KEY].completeness = "PARTIAL"; await empty.write(doc);
    const c = await first(empty); expect(c.capture_state).toBe("EMPTY_INCOMPLETE"); expect(c.captured_source_completeness).toBe("PARTIAL");
    expect(c.revision).not.toBe(b.revision);
  });
  it("same finite observations preserve revision/cursor across hidden finance and uninterpreted status changes", async () => {
    const f = await fixture(), a = await first(f), cursor = a.page.next_cursor!;
    const doc = structuredClone(f.docs.get("paper")!);
    doc.relations["manager.accounts:accounts"].items[0].fields.equity = "112233445566.99";
    doc.relations[KEY].items[0].fields.status = `${PRIVATE}-DIFFERENT-RAW-STATUS`;
    await f.write(doc);
    const b = await first(f); expect(b.revision).toBe(a.revision); expect(b.records).toEqual(a.records);
    const continued = await f.get(`environment=paper&limit=1&after=${encodeURIComponent(cursor)}`);
    expect(continued.statusCode).toBe(200); expect(continued.json().revision).toBe(a.revision);
    expect(continued.body).not.toMatch(/112233445566|DIFFERENT-RAW-STATUS/);
  });
  it("one coherent metadata refresh can retry without making hidden finance a cursor oracle", async () => {
    const f = await fixture(), a = await first(f), { response } = await raceRaw(f, async () => {
      const doc = structuredClone(f.docs.get("paper")!); doc.relations["manager.accounts:accounts"].items[0].fields.equity = "7";
      await f.write(doc);
    });
    expect(response.statusCode).toBe(200); expect(response.json().revision).toBe(a.revision);
  });
  it("actual heartbeat value changes invalidate a previous finite-projection cursor", async () => {
    const f = await fixture(), a = await first(f), doc = structuredClone(f.docs.get("paper")!);
    doc.relations[KEY].items[0].fields.last_seen_at = new Date(f.observed.valueOf() + 1000).toISOString(); await f.write(doc);
    expect((await first(f)).revision).not.toBe(a.revision);
    expect((await f.get(`environment=paper&limit=1&after=${encodeURIComponent(a.page.next_cursor!)}`)).statusCode).toBe(409);
  });
  it("cursor is not authority after grant revoke, in another actor/workspace, environment, session or limit", async () => {
    const f = await fixture({ environments: ["paper", "sandbox"] }), a = await first(f), cursor = encodeURIComponent(a.page.next_cursor!);
    expect((await f.get(`environment=paper&limit=2&after=${cursor}`)).statusCode).toBe(409);
    expect((await f.get(`environment=sandbox&limit=1&after=${cursor}`)).statusCode).toBe(409);
    const replacementSession = await session(f.user);
    expect((await f.get(`environment=paper&limit=1&after=${cursor}`, replacementSession.token)).statusCode).toBe(409);
    const peer = await fixture(); expect((await peer.get(`environment=paper&limit=1&after=${cursor}`)).statusCode).toBe(409);
    await revoke(f); expect((await f.get(`environment=paper&limit=1&after=${cursor}`)).statusCode).toBe(404);
  });
  it("tampered cursor and arbitrary source/root selectors cannot bypass current authorization", async () => {
    const f = await fixture(), a = await first(f), token = a.page.next_cursor!;
    const changed = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    expect((await f.get(`environment=paper&limit=1&after=${encodeURIComponent(changed)}`)).statusCode).toBe(409);
    for (const query of [`environment=paper&after=${encodeURIComponent(token)}&root_id=${ROOT}`,
      `environment=paper&source_workspace_id=${f.source}`, `environment=paper&profile_id=${PROFILE.paper}`])
      expect((await f.get(query)).statusCode).toBe(400);
  });
  it("opaque record IDs are keyed and same private name is isolated by profile/workspace/key", async () => {
    const f = await fixture({ environments: ["paper", "sandbox"] }), paper = await first(f, 100);
    const sandbox = serviceHeartbeatsPageSchema.parse((await f.get("environment=sandbox")).json());
    const peer = await fixture(), other = await first(peer, 100);
    expect(paper.records.map(r => r.record_id)).not.toEqual(sandbox.records.map(r => r.record_id));
    expect(paper.records.map(r => r.record_id)).not.toEqual(other.records.map(r => r.record_id));
    const rawGuesses = new Set([`${PRIVATE}-0`, `${PRIVATE}-1`, `${PRIVATE}-2`].map(name => `por1_${hash(name)}`));
    expect(paper.records.every(r => !rawGuesses.has(r.record_id))).toBe(true);
    const changedConfig = { ...f.config, QUERY_CURSOR_ACTIVE_KEY_ID: "test-next", QUERY_CURSOR_KEYS_JSON: JSON.stringify({
      ...querySigningKeys(f.config), "test-next": "TEST_ONLY-replacement-heartbeat-key-at-least-32-characters" }) };
    const changedService = new ExecutionServiceHeartbeatsService(changedConfig, f.scopes,
      new WorkspacesRepository(ctx.pool, changedConfig), f.projection);
    const rotated = await changedService.read(f.principal, { environment: "paper", limit: 100 });
    expect(rotated.records.map(r => r.record_id)).not.toEqual(paper.records.map(r => r.record_id));
  });
  it("configuration drift at the final Core fence refuses instead of retargeting profiles", async () => {
    const f = await fixture(), original = f.scopes.revalidate.bind(f.scopes); let core = 0;
    vi.spyOn(f.scopes, "revalidate").mockImplementation(async scope => {
      await original(scope);
      if (scope.workspaceId === f.workspace && ++core === 4) f.config.EXECUTION_EDGE_PAPER_PROFILE_ID = "PAPER_TEST_ONLY_CHANGED";
    });
    const response = await f.get(); expect(core).toBeGreaterThanOrEqual(4); expect(response.statusCode).toBe(409);
    expect(response.body).not.toContain("PAPER_TEST_ONLY_CHANGED");
  });
  it("real session auth and strict route query reject malformed or unknown scope selectors", async () => {
    const f = await fixture(); expect((await f.get("environment=paper", null)).statusCode).toBe(401);
    expect((await f.get(`environment=paper&workspace_id=${next()}`)).statusCode).toBe(404);
    for (const query of ["", "environment=unknown", "environment=all", "environment=paper&limit=0", "environment=paper&limit=201",
      "environment=paper&limit=1.5", "environment=paper&environment=live", "environment=paper&actor=owner",
      `environment=paper&workspace_id=${"x".repeat(97)}`, `environment=paper&after=${"x".repeat(4097)}`]) {
      const response = await f.get(query); expect(response.statusCode).toBe(400); expect(response.headers["cache-control"]).toContain("no-store");
    }
  });
});
