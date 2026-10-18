/** Actual disposable-PG / HTTP regression.
 * Actual disposable Core PostgreSQL + mounted HTTP; local TEST_ONLY relations
 * and acceptance, NOT installed PM authority or a held TS revocation fence.
 * No spec imports, shared fixture edits, external source calls or engine runs.
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
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { ProductAuditRepository } from "../src/repos/outbox";
import { WorkspacesRepository } from "../src/repos/workspaces";
import { CONTROL_API_CONFIG } from "../src/tokens";
import { ExecutionOperationsRepository, type F0ReadCandidate } from "../src/operations/operations.repository";
import { ExecutionOperationsService } from "../src/operations/operations.service";
import { ExecutionCommandPlanRequestSchema } from "../src/operations/contracts";
import { ExecutionF0ReadController } from "../src/operations/f0-read.controller";
import { ExecutionF0ReadService } from "../src/operations/f0-read.service";
import { f0BlockedOperation } from "../src/operations/f0-read.contract";
import type { ExecutionProfileReadAdapterService } from "../src/execution/profile-read-adapter.service";
import { tsRootMembershipAcceptance, type AccessActor, type AccessResource,
  type ReviewedAccessPolicy, type ScopedAccessGrant } from "../src/execution-v2/access.contract";
import { accessDigest, canonicalSelector, evaluateAccess, validateDelegation,
  type AccessRelations } from "../src/execution-v2/access-policy";
import { currentAccessRelations, grantBindingDigest,
  type CurrentAccessRelations } from "../src/execution-v2/access-current-relations";
import { AccessRepository } from "../src/execution-v2/access.repository";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import type { AccessTrustProvider } from "../src/execution-v2/access-trust";
import { ExecutionCommandController } from "../src/execution-v2/command.controller";
import { commandIntent } from "../src/execution-v2/command.contract";
import { ExecutionCommandService, intentHash } from "../src/execution-v2/command.service";
import { CommandStore } from "../src/execution-v2/command.store";
import { commandAuthorization, type CommandTrust } from "../src/execution-v2/command-trust";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const URL = process.env.TEST_DATABASE_URL;
const next = () => `TEST_ONLY:${randomUUID()}`;
const absent = "TEST_ONLY:f0:absent";
const password = "TEST-only-ELP204-collection-correct-horse-battery-2026";
const secret = "TEST_ONLY_PRIVATE_SQL_host_token_DO_NOT_DISCLOSE";
const contracts = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const commandProblem = new Ajv2020({ strict: true, allErrors: true }).compile(JSON.parse(readFileSync(
  resolve(contracts, "openapi/execution-trusted-commands.openapi.json"), "utf8")).components.schemas.CommandProblem);
const environments = ["paper", "sandbox", "live"] as const;
type Environment = typeof environments[number];
type Response = { statusCode: number; headers: Record<string, unknown>; body: string; json(): unknown };
const tuples = (["ACCOUNT", "PORTFOLIO", "DEPLOYMENT"] as const)
  .flatMap(kind => environments.map(environment => ({ kind, environment })));
const cursorKeys = { activeKeyId: "test-only", keys: {
  "test-only": "TEST_ONLY_f0_command_cursor_not_product_0123456789" }, ttlSeconds: 900 };
@Module({}) class F0ReadTestModule {}

describe.skipIf(!URL)("ELP2-04 finite F0 read: real PG + mounted HTTP / TEST_ONLY source", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>, auth: AuthService;
  type Account = { user: NonNullable<Awaited<ReturnType<AuthService["users"]["findById"]>>>;
    session: Awaited<ReturnType<AuthService["login"]>>; actor: AccessActor; username: string };
  let owner: Account, creator: Account, delegator: Account, administrator: Account;
  beforeAll(async () => {
    // Destructive harness setup is authorized ONLY for Main's disposable cell.
    await migrateTestDatabase(URL!); ctx = await setupApp({ DATABASE_URL: URL! }); auth = ctx.app.get(AuthService);
    vi.spyOn(auth, "verifyAccessIdentity").mockImplementation(async assertion => ({
      iss: "https://test-only.cloudflareaccess.com", sub: `TEST_ONLY:${assertion}`, aud: "test-audience",
      email: `${assertion}@azdag.com`, normalizedEmail: `${assertion}@azdag.com`,
      authenticationTime: new Date(), tokenExpiresAt: new Date(Date.now() + 600_000),
    }));
    async function activated(role: "ADMIN" | "USER" = "USER"): Promise<Account> {
      const admin = new AdminService(ctx.pool, ctx.config, auth), username = `elp204-f0-${randomUUID()}`;
      const made = await admin.createUser({ username, displayName: username, role });
      const activation = await admin.resetCredential(made.userId);
      const initial = await auth.login({ assertion: username, username, credential: activation.activationToken });
      await auth.changePassword({ sessionToken: initial.token, csrfToken: initial.csrfToken,
        currentPassword: activation.activationToken, newPassword: password });
      const session = await auth.login({ assertion: username, username, credential: password });
      const user = (await auth.users.findById(made.userId))!;
      await new WorkspacesRepository(ctx.pool, ctx.config).ensurePersonal(user.userId, username);
      return { user, username, session, actor: { user_id: user.userId,
        session_id: session.sessionId, session_generation: user.sessionVersion } };
    }
    owner = await activated(); creator = await activated(); delegator = await activated(); administrator = await activated("ADMIN");
    await new OwnerAccessRepository(ctx.pool).claimOwner({ userId: owner.user.userId, claimedBy: "ELP204_F0_TEST_ONLY" });
  });
  afterAll(async () => { vi.restoreAllMocks(); if (ctx) await teardownApp(ctx); });
  const dbNow = async () => Number((await ctx.pool.query(
    "SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0].ms);

  async function workspace() {
    const ws = next();
    await ctx.pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY F0 read',$2)", [ws, owner.user.userId]);
    for (const account of [owner, creator, delegator, administrator]) await ctx.pool.query(
      "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,$3)",
      [ws, account.user.userId, account === owner ? "OWNER" : "MEMBER"]);
    return ws;
  }
  async function fixture(kind: AccessResource["kind"] = "PORTFOLIO", environment: Environment = "paper", reader = creator, issueGrant = true) {
    const ws = await workspace(), now = await dbNow(), resource: AccessResource = { kind, id: next() };
    const repo = new AccessRepository(ctx.pool), operations = new ExecutionOperationsRepository(ctx.pool);
    const policy: ReviewedAccessPolicy = { workspace_id: ws, revision: next(), artifact_digest: accessDigest(next()),
      approval_ref: next(), state: "REVIEWED", qualification: "TEST_ONLY", protected_owner_user_id: owner.user.userId,
      researcher_fields: { state: "PENDING", policy_ref: null, fields: [] } };
    const membership = { receipt_id: next(), revision: next(), mapping_revision: next() };
    const grant: ScopedAccessGrant = { grant_id: next(), workspace_id: ws, subject_user_id: reader.user.userId,
      action: "audit.read", effect: "ALLOW", selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: kind, ids: [resource.id] },
      environments: [environment], valid_from_ms: now - 60_000, valid_until_ms: now + 600_000, delegable_actions: [],
      issued_by: owner.user.userId, parent_grant_id: null, revision: next(), policy_revision: policy.revision,
      revoked_at_ms: null, requires_ts_acceptance: true, field_policy_ref: null,
      ts_receipt: { receipt_id: membership.receipt_id, membership_revision: membership.revision,
        mapping_revision: membership.mapping_revision, effective_at_ms: now - 1000, expires_at_ms: now + 600_000 } };
    await repo.putPolicy(policy); if (issueGrant) await repo.saveGrant(grant, true);
    const relations: AccessRelations = { qualified: true, revision: membership.revision, own_alpha_ids: [],
      member_portfolio_ids: kind === "PORTFOLIO" ? [resource.id] : [], roots: {}, membership: { ...membership } };
    const parentRelations: AccessRelations = { ...relations, own_alpha_ids: [], member_portfolio_ids: [] };
    const publication = vi.fn(async () => { throw new Error("TEST_ONLY forbidden business publication"); });
    const mapping = vi.fn(async () => { throw new Error("TEST_ONLY forbidden command mapping"); });
    const trust: AccessTrustProvider = { verifyPolicy: vi.fn(async () => null), verifyReceipt: vi.fn(async () => null),
      relations: vi.fn(async id => structuredClone(id === reader.user.userId ? relations : parentRelations)),
      verifiedHumanMapping: mapping, readPublication: publication };
    const access = new ExecutionAccessService(ctx.pool, auth, trust, true);
    const commandTrust: CommandTrust = { prepare: vi.fn(async () => { throw new Error("TEST_ONLY forbidden prepare"); }),
      send: vi.fn(async () => { throw new Error("TEST_ONLY forbidden send"); }),
      lookup: vi.fn(async () => { throw new Error("TEST_ONLY forbidden lookup"); }) };
    const commands = new ExecutionCommandService(ctx.pool, access, commandTrust, true, cursorKeys);
    const localRead = vi.fn(async () => { throw new Error("TEST_ONLY forbidden local/source read"); });
    const localReads = new Proxy({}, { get: () => localRead }) as ExecutionProfileReadAdapterService;
    const legacy = new ExecutionOperationsService(operations, new ProductAuditRepository(ctx.pool), localReads, ctx.config);
    const service = new ExecutionF0ReadService(operations, access);
    return { workspace: ws, resource, environment, reader, repo, operations, policy, membership, grant,
      relations, parentRelations, trust, access, commands, commandTrust, service, legacy, publication, mapping, localRead };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  type SeedOptions = { id?: string; author?: Account; targetType?: string; targetId?: string;
    environment?: "PAPER" | "SANDBOX" | "LIVE"; key?: string; blockers?: string[]; warnings?: string[] };
  async function seed(f: Fixture, input: SeedOptions = {}) {
    return (await f.operations.create({ operationId: input.id ?? next(), workspaceId: f.workspace,
      actorUserId: (input.author ?? f.reader).user.userId, requestKey: next(), commandKey: input.key ?? "account/sync",
      environment: input.environment ?? f.environment.toUpperCase() as "PAPER" | "SANDBOX" | "LIVE",
      targetType: input.targetType ?? f.resource.kind, targetId: input.targetId ?? f.resource.id,
      expectedTargetVersion: 1, payloadHash: accessDigest([secret, "payload"]), planDigest: accessDigest([secret, "plan"]),
      conditions: [], riskTier: "R2_SANDBOX", blockerCodes: input.blockers ?? ["COMMAND_RELAY_DISABLED"],
      warningCodes: input.warnings ?? [], expiresAt: new Date(Date.now() + 300_000), requestId: next(), auditEventId: next() })).record;
  }
  async function replaceGrant(f: Fixture, patch: Partial<ScopedAccessGrant>) {
    f.grant = { ...f.grant, ...patch, revision: next() }; await f.repo.saveGrant(f.grant);
  }
  async function nativeProof(f: Fixture): Promise<CurrentAccessRelations> {
    const now = await dbNow(), g = { ...f.grant, ts_receipt: null };
    delete g.ts_acceptance_digest;
    const source: CurrentAccessRelations = { schema_version: "pma.core-current-relations.v1", subject_user_id: f.reader.user.userId,
      workspace_id: f.workspace, ts_user_id: next(), mapping_revision: f.membership.mapping_revision,
      resources: [{ environment: f.environment, revision: next(), own_alpha_ids: [], member_portfolio_ids: [], roots: [] }], grants: [] };
    const fact = tsRootMembershipAcceptance.parse({ context: "REVIEWED_POLICY_ROOT", source: "TEST_ONLY:PM",
      source_contract: "TEST_ONLY:normalized", trust_profile: "TEST_ONLY:uninstalled", receipt_id: next(),
      portal_user_id: g.subject_user_id, ts_user_id: source.ts_user_id, mapping_revision: source.mapping_revision,
      human_requester_user_id: g.issued_by, workspace_id: f.workspace, action: g.action,
      selector_digest: accessDigest(canonicalSelector(g.selector)), environments: [...g.environments], previous_membership_revision: null,
      membership_revision: next(), effective_at_ms: now - 1000, expires_at_ms: now + 240_000, outcome: "ACCEPTED",
      payload_digest: accessDigest(["TEST_ONLY:acceptance", g.grant_id]), provenance_ref: "TEST_ONLY:NOT_NATIVE_ACCEPTANCE",
      policy_revision: f.policy.revision, policy_artifact_digest: f.policy.artifact_digest,
      policy_install_digest: accessDigest(["TEST_ONLY:install", f.workspace]), approval_ref: f.policy.approval_ref,
      grant_id: g.grant_id, grant_digest: accessDigest(g), expected_grant_revision: g.revision });
    f.grant = { ...g, ts_receipt: { receipt_id: fact.receipt_id, membership_revision: fact.membership_revision,
      mapping_revision: fact.mapping_revision, effective_at_ms: fact.effective_at_ms, expires_at_ms: fact.expires_at_ms },
      ts_acceptance_digest: accessDigest(fact) };
    source.grants.push({ grant_id: g.grant_id, binding_digest: grantBindingDigest(f.grant), accepted: fact,
      targets: [{ resource: f.resource, environment: f.environment, revision: next(),
        native_reference_digest: accessDigest(["TEST_ONLY:leg", f.resource]), valid_from_ms: now - 1000, valid_until_ms: now + 120_000 }] });
    currentAccessRelations.parse(source); await f.repo.saveGrant(f.grant); f.relations.current_authority = source;
    return source;
  }
  type Http = { get(id: string, query?: string | null, token?: string | null): Promise<Response>;
    command(id: string, suffix?: string): Promise<Response>; collection(): Promise<Response>; mutation(): Promise<Response> };
  async function mounted(f: Fixture, run: (http: Http) => Promise<void>, config: ControlApiConfig = ctx.config,
    service = f.service) {
    const app = await NestFactory.create<NestFastifyApplication>({ module: F0ReadTestModule,
      controllers: [ExecutionF0ReadController, ExecutionCommandController], providers: [SessionGuard,
        { provide: AuthService, useValue: auth }, { provide: CONTROL_API_CONFIG, useValue: config },
        { provide: WorkspacesRepository, useValue: new WorkspacesRepository(ctx.pool, config) },
        { provide: ExecutionF0ReadService, useValue: service }, { provide: ExecutionCommandService, useValue: f.commands }] },
      new FastifyAdapter(), { logger: false, abortOnError: false });
    try {
      app.useGlobalFilters(new HttpErrorFilter()); await app.register(cookiePlugin as never); await app.init();
      await app.getHttpAdapter().getInstance().ready(); const http = app.getHttpAdapter().getInstance() as FastifyInstance;
      const headers = (token: string | null) => ({ "x-request-id": "TEST_ONLY-f0-reader",
        ...(token === null ? {} : { cookie: `${SESSION_COOKIE}=${token}` }) });
      await run({ get: (id, query = new URLSearchParams({ workspace_id: f.workspace }).toString(), token = f.reader.session.token) =>
        http.inject({ method: "GET", url: `/api/v1/execution/operations/f0/${encodeURIComponent(id)}${query === null ? "" : `?${query}`}`,
          headers: headers(token) }),
        command: (id, suffix = "") => http.inject({ method: "GET", headers: headers(f.reader.session.token),
          url: `/api/v1/execution/capital-commands/${id}${suffix}?workspace_id=${encodeURIComponent(f.workspace)}` }),
        collection: () => http.inject({ method: "GET", headers: headers(f.reader.session.token), url:
          `/api/v1/execution/capital-commands?${new URLSearchParams({ workspace_id: f.workspace,
            resource_kind: f.resource.kind, resource_id: f.resource.id, environment: f.environment })}` }),
        mutation: () => http.inject({ method: "POST", headers: headers(f.reader.session.token),
          url: "/api/v1/execution/capital-commands/preview", payload: {} }) });
    } finally { await app.close(); }
  }
  function failure(response: Response, status: number, code: string) {
    expect(response.statusCode).toBe(status); expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(commandProblem(response.json()), JSON.stringify(commandProblem.errors)).toBe(true);
    expect(response.json()).toMatchObject({ error: { code }, request_id: "TEST_ONLY-f0-reader" });
    expect(response.body).not.toMatch(new RegExp(`${secret}|SELECT secret|private_relation|ZodError|stack`));
  }
  function body(response: Response) {
    expect(response.statusCode).toBe(200); expect(response.headers["cache-control"]).toBe("private, no-store");
    const value = f0BlockedOperation.parse(response.json());
    expect(Object.keys(value).sort()).toEqual(["schema_version", "operation_id", "command_type", "command_key", "status",
      "verification_result", "blockers", "warnings", "relay_receipt", "source_side_effect_requested", "created_at", "updated_at"].sort());
    expect(response.body).not.toMatch(/payload_hash|plan_digest|request_key|target_id|target_type|actor_user_id|conditions|expires_at/);
    return value;
  }

  it.each(tuples)("publishes only finite current-authorized $kind/$environment intent", async ({ kind, environment }) => {
    const f = await fixture(kind, environment), record = await seed(f);
    await mounted(f, async http => {
      expect(body(await http.get(record.operationId))).toEqual({ schema_version: "execution.command-operation.v1",
        operation_id: record.operationId, command_type: "EXECUTION_COMMAND", command_key: "account/sync", status: "BLOCKED",
        verification_result: "NOT_STARTED", blockers: record.blockerCodes, warnings: [], relay_receipt: null,
        source_side_effect_requested: false, created_at: record.createdAt.toISOString(), updated_at: record.updatedAt.toISOString() });
    });
  });
  it("reads a real ADMIN catalogue plan and a compatible opaque non-ULID history id", async () => {
    const f = await fixture("ACCOUNT", "paper", administrator);
    const plan = await f.legacy.plan(administrator.user, ExecutionCommandPlanRequestSchema.parse({
      schema_version: "execution.command-plan-request.v1", workspace_id: f.workspace, request_key: next(),
      command_type: "EXECUTION_COMMAND", command_version: 1, command_key: "account/sync", environment: "PAPER",
      target: { type: "ACCOUNT", id: f.resource.id }, expected_target_version: 1, payload: {}, conditions: [] }), next());
    const historical = await seed(f, { id: `f0.compat:${randomUUID()}` });
    await mounted(f, async http => { expect(body(await http.get(plan.operation_id)).blockers).toContain("COMMAND_RELAY_DISABLED");
      expect(body(await http.get(historical.operationId)).operation_id).toBe(historical.operationId); });
  });
  it("requires both creator ceiling and exact current audit; protected owner and ADMIN are not read overrides", async () => {
    const f = await fixture(), record = await seed(f);
    for (const account of [owner, delegator, administrator]) await f.repo.saveGrant({ ...f.grant,
      grant_id: next(), subject_user_id: account.user.userId, revision: next() }, true);
    await mounted(f, async http => {
      body(await http.get(record.operationId)); const unknown = await http.get(absent);
      for (const account of [owner, delegator, administrator]) {
        const hidden = await http.get(record.operationId, undefined, account.session.token);
        failure(hidden, 404, "COMMAND_RESOURCE_NOT_FOUND"); expect(hidden.json()).toEqual(unknown.json());
      }
      await replaceGrant(f, { revoked_at_ms: Date.now() });
      const creatorWithoutAudit = await http.get(record.operationId);
      failure(creatorWithoutAudit, 404, "COMMAND_RESOURCE_NOT_FOUND"); expect(creatorWithoutAudit.json()).toEqual(unknown.json());
    });
  });
  it("refuses malformed or additional query fields before F0 SELECT, without silently choosing personal workspace", async () => {
    const f = await fixture(), record = await seed(f), scan = vi.spyOn(f.operations, "findF0ReadCandidate");
    try { await mounted(f, async http => {
      const q = new URLSearchParams({ workspace_id: f.workspace }).toString();
      for (const query of [null, "", "workspace_id=", "workspace_id=ab", `${q}&${q}`,
        `${q}&environment=paper`, `${q}&resource_id=x`, `${q}&from_source=true`, `${q}&after=x`])
        failure(await http.get(record.operationId, query), 400, "COMMAND_INPUT_INVALID");
      failure(await http.get("bad/id"), 400, "COMMAND_INPUT_INVALID"); expect(scan).not.toHaveBeenCalled();
      failure(await http.get(record.operationId, undefined, null), 401, "SESSION_REQUIRED"); expect(scan).not.toHaveBeenCalled();
    }); } finally { scan.mockRestore(); }
  });
  it("keeps wrong member/nonmember workspace, other creator and another actual command family uniformly hidden", async () => {
    const f = await fixture(), record = await seed(f), other = await workspace(), noMember = await workspace();
    await ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [noMember, creator.user.userId]);
    const foreign = await seed(f, { author: delegator }); const command = await seedCommand(f);
    const oldParent = vi.spyOn(f.legacy, "operationOrNull"), currentStatus = vi.spyOn(f.commands, "status");
    try { await mounted(f, async http => {
      const unknown = await http.get(absent); failure(unknown, 404, "COMMAND_RESOURCE_NOT_FOUND");
      for (const response of [await http.get(record.operationId, new URLSearchParams({ workspace_id: other }).toString()),
        await http.get(record.operationId, new URLSearchParams({ workspace_id: noMember }).toString()),
        await http.get(foreign.operationId), await http.get(command.id)]) {
        failure(response, 404, "COMMAND_RESOURCE_NOT_FOUND"); expect(response.json()).toEqual(unknown.json());
      }
      expect(oldParent).not.toHaveBeenCalled(); expect(currentStatus).not.toHaveBeenCalled();
    }); } finally { oldParent.mockRestore(); currentStatus.mockRestore(); }
  });
  it.each([{ targetType: "SYSTEM", permission: "ROOT" }, { targetType: "ORDER", permission: "ACCOUNT" },
    { targetType: "BROKER_BINDING", permission: "BINDING" }] as const)("never aliases requested $targetType into $permission", async test => {
    const f = await fixture(test.permission), record = await seed(f, { targetType: test.targetType });
    await mounted(f, async http => { const response = await http.get(record.operationId);
      failure(response, 404, "COMMAND_RESOURCE_NOT_FOUND"); expect(response.json()).toEqual((await http.get(absent)).json()); });
  });
  it.each(["app-only", "business-only", "mutation-only", "wrong-resource", "wrong-env", "stale-receipt", "revoked", "expired", "future", "policy"] as const)(
    "does not substitute %s for exact accepted audit.read", async variant => {
      const f = await fixture(), record = await seed(f); let patch: Partial<ScopedAccessGrant> = {};
      if (variant === "app-only") patch = { requires_ts_acceptance: false, ts_receipt: null };
      if (variant === "business-only") patch = { action: "business.read_all" };
      if (variant === "mutation-only") patch = { action: "capital.top_up" };
      if (variant === "wrong-resource") patch = { selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: f.resource.kind, ids: [next()] } };
      if (variant === "wrong-env") patch = { environments: ["sandbox"] };
      if (variant === "stale-receipt") patch = { ts_receipt: { ...f.grant.ts_receipt!, membership_revision: next() } };
      if (variant === "revoked") patch = { revoked_at_ms: Date.now() };
      if (variant === "expired") patch = { valid_until_ms: Date.now() - 1 };
      if (variant === "future") patch = { valid_from_ms: Date.now() + 60_000 };
      if (variant === "policy") patch = { policy_revision: next() };
      await replaceGrant(f, patch);
      await mounted(f, async http => { const response = await http.get(record.operationId);
        failure(response, 404, "COMMAND_RESOURCE_NOT_FOUND"); expect(response.json()).toEqual((await http.get(absent)).json()); });
    });
  it("a reviewed policy with genuinely no grants cannot infer audit authority from an existing intent", async () => {
    const f = await fixture("PORTFOLIO", "paper", creator, false), record = await seed(f);
    expect(await f.repo.grants(f.workspace)).toEqual([]);
    await mounted(f, async http => { const hidden = await http.get(record.operationId);
      failure(hidden, 404, "COMMAND_RESOURCE_NOT_FOUND"); expect(hidden.json()).toEqual((await http.get(absent)).json()); });
  });
  it.each(["missing-leg", "subject", "workspace", "null", "malformed", "binding", "digest", "native-expired"] as const)(
    "denies versioned %s proof without matching-singleton fallback", async variant => {
      const f = await fixture(), record = await seed(f), source = await nativeProof(f);
      // Legacy tuple still matches the attached receipt: invalid present native proof cannot fall back.
      f.relations.membership = { receipt_id: f.grant.ts_receipt!.receipt_id,
        revision: f.grant.ts_receipt!.membership_revision, mapping_revision: f.grant.ts_receipt!.mapping_revision };
      if (variant === "missing-leg") source.grants[0].targets = [];
      if (variant === "subject") source.subject_user_id = delegator.user.userId;
      if (variant === "workspace") source.workspace_id = next();
      if (variant === "null") f.relations.current_authority = null;
      if (variant === "malformed") f.relations.current_authority = { schema_version: "invalid" } as unknown as CurrentAccessRelations;
      if (variant === "binding") source.grants[0].binding_digest = accessDigest("TEST_ONLY:wrong-binding");
      if (variant === "digest") { f.grant.ts_acceptance_digest = accessDigest("TEST_ONLY:wrong-fact"); await f.repo.saveGrant(f.grant); }
      if (variant === "native-expired") source.grants[0].targets[0].valid_until_ms = Date.now() - 1;
      await mounted(f, async http => { const response = await http.get(record.operationId);
        failure(response, 404, "COMMAND_RESOURCE_NOT_FOUND"); expect(response.json()).toEqual((await http.get(absent)).json()); });
    });
  it("accepts an exact versioned proof without requiring flattened membership or ownership", async () => {
    const f = await fixture("ACCOUNT"), record = await seed(f); await nativeProof(f); f.relations.membership = null;
    await mounted(f, async http => { body(await http.get(record.operationId)); });
  });
  it.each(["false", "truthy-string"] as const)("qualified=%s cannot reuse matching legacy audit in F0, command detail, collection or workflow", async variant => {
    const f = await fixture(), record = await seed(f), command = await seedCommand(f);
    await mounted(f, async http => {
      body(await http.get(record.operationId)); expect((await http.command(command.id)).statusCode).toBe(200);
      expect((await http.collection()).statusCode).toBe(200); expect((await http.command(command.id, "/workflow")).statusCode).toBe(200);
      // Deliberate malformed provider variant: truthiness must not replace literal true.
      Object.assign(f.relations, { qualified: variant === "false" ? false : "true" });
      for (const response of [await http.get(record.operationId), await http.command(command.id),
        await http.collection(), await http.command(command.id, "/workflow")]) failure(response, 404, "COMMAND_RESOURCE_NOT_FOUND");
    });
  });
  async function delegated(f: Fixture, effect: "ALLOW" | "DENY") {
    const parent: ScopedAccessGrant = { ...f.grant, grant_id: next(), subject_user_id: delegator.user.userId,
      action: "access.grant", delegable_actions: ["audit.read"], requires_ts_acceptance: false, ts_receipt: null,
      valid_from_ms: f.grant.valid_from_ms - 1000, valid_until_ms: f.grant.valid_until_ms! + 1000, revision: next() };
    await f.repo.saveGrant(parent, true);
    validateDelegation(await f.access.readContext(delegator.actor, f.workspace), { subject_user_id: f.reader.user.userId,
      action: "audit.read", effect, selector: f.grant.selector, environments: f.grant.environments,
      valid_from_ms: f.grant.valid_from_ms, valid_until_ms: f.grant.valid_until_ms, delegable_actions: [],
      ceiling_grant_id: parent.grant_id, expected_ceiling_revision: parent.revision,
      expected_policy_revision: f.policy.revision, expected_ts_membership_revision: f.membership.revision,
      reason: "TEST_ONLY genuinely reachable F0 delegated graph" });
    const child = { ...f.grant, grant_id: next(), effect, issued_by: delegator.user.userId,
      parent_grant_id: parent.grant_id, revision: next() };
    await f.repo.saveGrant(child, true); return { parent, child };
  }
  it("retains delegated DENY ancestry even with independent accepted ALLOW", async () => {
    const f = await fixture(), record = await seed(f); await delegated(f, "DENY");
    expect(evaluateAccess(await f.access.readContext(creator.actor, f.workspace), "audit.read", f.resource, f.environment).allowed).toBe(false);
    await mounted(f, async http => { failure(await http.get(record.operationId), 404, "COMMAND_RESOURCE_NOT_FOUND"); });
  });
  it.each(["revoke", "expire", "issuer-deny"] as const)("accepted delegated ALLOW retains app-only ancestor and honors %s", async variant => {
    const f = await fixture(), record = await seed(f); await replaceGrant(f, { revoked_at_ms: Date.now() });
    // Build child from the unrevoked immutable original meaning, not a revoked leaf.
    const original = f.grant; f.grant = { ...original, revoked_at_ms: null };
    const { parent } = await delegated(f, "ALLOW"); f.grant = original;
    await mounted(f, async http => {
      body(await http.get(record.operationId));
      if (variant === "issuer-deny") await f.repo.saveGrant({ ...parent, grant_id: next(), effect: "DENY", revision: next() }, true);
      else await f.repo.saveGrant({ ...parent, revision: next(), ...(variant === "revoke"
        ? { revoked_at_ms: Date.now() } : { valid_until_ms: Date.now() - 1 }) });
      failure(await http.get(record.operationId), 404, "COMMAND_RESOURCE_NOT_FOUND");
    });
  });
  it("expired original five-minute planning TTL is historical data, not a current authority expiry", async () => {
    const f = await fixture(), id = next();
    // Real immutable historical INSERT; no trigger/constraint is disabled.
    await ctx.pool.query(`INSERT INTO execution_command_plans_f0(operation_id,workspace_id,actor_user_id,request_key,
      command_key,environment,target_type,target_id,expected_target_version,payload_hash,plan_digest,payload_json,
      conditions,risk_tier,blocker_codes,warning_codes,expires_at,created_at,updated_at)
      VALUES($1,$2,$3,$4,'account/sync','PAPER','PORTFOLIO',$5,1,$6,$7,'{}','[]','R2_SANDBOX',
      ARRAY['COMMAND_RELAY_DISABLED'],'{}',clock_timestamp()-interval '1 hour',clock_timestamp()-interval '2 hours',clock_timestamp()-interval '2 hours')`,
      [id, f.workspace, creator.user.userId, next(), f.resource.id, accessDigest("TEST_ONLY:old-payload"), accessDigest("TEST_ONLY:old-plan")]);
    await mounted(f, async http => { body(await http.get(id)); });
  });
  it.each(["grant", "session", "corrupt-and-grant", "membership"] as const)("fences actual %s change after real SELECT", async variant => {
    const f = await fixture(), record = await seed(f, variant === "corrupt-and-grant" ? { warnings: [secret] } : {});
    const session = await auth.login({ assertion: creator.username, username: creator.username, credential: password });
    const original = f.operations.findF0ReadCandidate.bind(f.operations); let changed = false;
    const intercepted = vi.spyOn(f.operations, "findF0ReadCandidate").mockImplementation(async (...args) => {
      const row = await original(...args); if (!changed) { changed = true;
        if (variant === "session") await ctx.pool.query("UPDATE auth_sessions SET state='REVOKED',revoked_at=clock_timestamp(),revoke_reason='TEST_ONLY F0 race' WHERE session_id=$1", [session.sessionId]);
        else if (variant === "membership") await ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [f.workspace, creator.user.userId]);
        else await replaceGrant(f, { revoked_at_ms: Date.now() });
      } return row;
    });
    try { await mounted(f, async http => {
      const response = await http.get(record.operationId, undefined, session.token); expect(changed).toBe(true);
      failure(response, variant === "session" ? 403 : variant === "membership" ? 404 : 409,
        variant === "session" ? "CURRENT_ACTOR_AUTHORITY_REQUIRED" : variant === "membership" ? "COMMAND_RESOURCE_NOT_FOUND" : "ACCESS_RETRY_REQUIRED");
      expect(response.body).not.toContain(record.operationId);
      failure(await http.get(record.operationId, undefined, session.token), variant === "session" ? 401 : 404,
        variant === "session" ? "SESSION_REQUIRED" : "COMMAND_RESOURCE_NOT_FOUND");
    }); } finally { intercepted.mockRestore(); }
  });
  it.each(["grant", "receipt", "native", "corrupt-and-grant"] as const)("uses conservative final clock for real %s expiry", async variant => {
    const f = await fixture(), record = await seed(f, variant === "corrupt-and-grant" ? { warnings: [secret] } : {});
    const source = variant === "native" ? await nativeProof(f) : null;
    const original = f.access.confirmReadContext.bind(f.access); let deadline = 0, waited = false;
    const delayed = vi.spyOn(f.access, "confirmReadContext").mockImplementation(async (...args) => {
      const current = await original(...args); expect(current.now_ms).toBeLessThan(deadline);
      const delay = deadline - Date.now() + 10; expect(delay).toBeGreaterThan(0); expect(delay).toBeLessThan(2600);
      await new Promise(resolve => setTimeout(resolve, delay)); waited = true;
      expect(Date.now()).toBeGreaterThanOrEqual(deadline); return current;
    });
    try { await mounted(f, async http => {
      // Arm AFTER app readiness, before first context; no fake clock or held PG lease.
      deadline = await dbNow() + 1500;
      if (variant === "receipt") await replaceGrant(f, { ts_receipt: { ...f.grant.ts_receipt!, expires_at_ms: deadline } });
      else if (source) source.grants[0].targets[0].valid_until_ms = deadline;
      else await replaceGrant(f, { valid_until_ms: deadline });
      failure(await http.get(record.operationId), 404, "COMMAND_RESOURCE_NOT_FOUND"); expect(waited).toBe(true);
    }); } finally { delayed.mockRestore(); }
  }, 10_000);
  it.each(["unknown-key", "warning", "blocker", "duplicate-blocker", "too-many-blockers", "oversized-blocker"] as const)("real persisted %s corruption is safe503 only after current authorization", async variant => {
    const f = await fixture(), record = await seed(f, variant === "unknown-key" ? { key: "unregistered/test-only" }
      : variant === "warning" ? { warnings: [secret] }
        : variant === "duplicate-blocker" ? { blockers: ["COMMAND_RELAY_DISABLED", "COMMAND_RELAY_DISABLED"] }
          : variant === "too-many-blockers" ? { blockers: ["COMMAND_RELAY_DISABLED", "OWNER_REVIEW_REQUIRED",
            "N16B_TARGET_SCOPE_UNSUPPORTED", "N16B_RUNTIME_ACTIVATION_PENDING"] }
            : { blockers: ["COMMAND_RELAY_DISABLED", variant === "oversized-blocker" ? "X".repeat(1024) : secret] });
    await mounted(f, async http => {
      failure(await http.get(record.operationId), 503, "COMMAND_STATUS_UNVERIFIED");
      const unknown = await http.get(absent); await replaceGrant(f, { revoked_at_ms: Date.now() });
      const hidden = await http.get(record.operationId); failure(hidden, 404, "COMMAND_RESOURCE_NOT_FOUND");
      expect(hidden.json()).toEqual(unknown.json());
    });
  });
  it.each(["target_id", "command_key"] as const)("bounds persisted oversized %s in SQL without truncating identity", async column => {
    const f = await fixture(), huge = "x".repeat(16_384), key = column === "command_key";
    // Both values satisfy the original table constraints. No trigger or check
    // is disabled, and no authorized target is invented for the huge value.
    const record = await seed(f, key ? { key: `account/${huge}` } : { targetId: huge });
    const candidate = await f.operations.findF0ReadCandidate(f.workspace, f.reader.user.userId, record.operationId);
    expect(candidate).not.toBeNull(); expect(candidate![column]).toBeNull();
    await mounted(f, async http => {
      failure(await http.get(record.operationId), key ? 503 : 404,
        key ? "COMMAND_STATUS_UNVERIFIED" : "COMMAND_RESOURCE_NOT_FOUND");
      await replaceGrant(f, { revoked_at_ms: Date.now() });
      const hidden = await http.get(record.operationId);
      failure(hidden, 404, "COMMAND_RESOURCE_NOT_FOUND");
      expect(hidden.json()).toEqual((await http.get(absent)).json());
    });
  });
  it.each(["status", "dates", "identity", "target", "environment"] as const)("post-SELECT %s fault injection stays sanitized, without bypassing PG constraints", async variant => {
    const f = await fixture(), record = await seed(f), original = f.operations.findF0ReadCandidate.bind(f.operations);
    const intercepted = vi.spyOn(f.operations, "findF0ReadCandidate").mockImplementation(async (...args) => {
      const row = await original(...args); if (!row) return row;
      const fault: Partial<F0ReadCandidate> = variant === "status" ? { status: "APPLIED" }
        : variant === "dates" ? { updated_at: new Date(0) } : variant === "identity" ? { actor_user_id: delegator.user.userId }
          : variant === "target" ? { target_id: `${secret}/invalid` } : { environment: "paper" };
      return { ...row, ...fault };
    });
    try { await mounted(f, async http => {
      const corrupt = await http.get(record.operationId), publicBodyFault = variant === "status" || variant === "dates";
      failure(corrupt, publicBodyFault ? 503 : 404, publicBodyFault ? "COMMAND_STATUS_UNVERIFIED" : "COMMAND_RESOURCE_NOT_FOUND");
      await replaceGrant(f, { revoked_at_ms: Date.now() });
      const hidden = await http.get(record.operationId); failure(hidden, 404, "COMMAND_RESOURCE_NOT_FOUND");
      expect(hidden.json()).toEqual((await http.get(absent)).json());
    }); } finally { intercepted.mockRestore(); }
  });
  it.each(["candidate", "authority"] as const)("sanitizes %s dependency exception without a false empty/fallback", async variant => {
    const f = await fixture(), record = await seed(f), error = new Error(`SELECT secret FROM private_relation ${secret}`);
    const failing = variant === "candidate" ? vi.spyOn(f.operations, "findF0ReadCandidate").mockRejectedValueOnce(error)
      : vi.spyOn(f.access, "readContext").mockRejectedValueOnce(error);
    try { await mounted(f, async http => { failure(await http.get(record.operationId), 503, "COMMAND_UNAVAILABLE"); }); }
    finally { failing.mockRestore(); }
  });
  it("observes actual F0 SELECT in read-only repeatable-read transaction, 5s timeout and exact three predicates", async () => {
    const f = await fixture(), record = await seed(f);
    const observations: Array<{ readOnly: string; isolation: string; timeout: string; sql: string; params: unknown[] }> = [];
    // Narrow I/O observer delegates every query to the real borrowed PG client.
    // No shared pool/prototype is patched and no transactional constraint is relaxed.
    const observedPool = { connect: async () => {
      const client = await ctx.pool.connect();
      return { query: async (sql: string, params: unknown[] = []) => {
        if (/FROM\s+execution_command_plans_f0\b/i.test(sql)) {
          const readOnly = (await client.query("SHOW transaction_read_only")).rows[0].transaction_read_only;
          const isolation = (await client.query("SHOW transaction_isolation")).rows[0].transaction_isolation;
          const timeout = (await client.query("SHOW statement_timeout")).rows[0].statement_timeout;
          observations.push({ readOnly, isolation, timeout, sql, params: [...params] });
        } return client.query(sql, params);
      }, release: () => client.release() } as unknown as PoolClient;
    } } as unknown as Pool;
    const observed = new ExecutionOperationsRepository(observedPool);
    await mounted(f, async http => { body(await http.get(record.operationId)); }, ctx.config, new ExecutionF0ReadService(observed, f.access));
    expect(observations).toHaveLength(1); const selected = observations[0];
    expect(selected).toMatchObject({ readOnly: "on", isolation: "repeatable read", timeout: "5s",
      params: [f.workspace, creator.user.userId, record.operationId] });
    expect(selected.sql).not.toMatch(/SELECT\s+\*|payload|conditions|hash|request_key|FOR\s+UPDATE/i);
    expect(selected.sql).toMatch(/workspace_id\s*=\s*\$1/i); expect(selected.sql).toMatch(/actor_user_id\s*=\s*\$2/i);
    expect(selected.sql).toMatch(/operation_id\s*=\s*\$3/i);
    expect(selected.sql).toMatch(/octet_length\(target_id\) BETWEEN 1 AND 191/);
    expect(selected.sql).toMatch(/octet_length\(command_key\) BETWEEN 3 AND 128/);
  });
  it("keeps retained F0 Core authority independent of configured source membership and leaves mutations closed", async () => {
    const f = await fixture(), record = await seed(f), source = await workspace();
    await ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [source, creator.user.userId]);
    const config: ControlApiConfig = { ...ctx.config, EXECUTION_READ_PROFILE: "retained_review_v1",
      FEATURE_EXECUTION_LOCAL_PROJECTION: "true", EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: source };
    const preview = vi.spyOn(f.commands, "preview");
    try { await mounted(f, async http => {
      body(await http.get(record.operationId)); failure(await http.get(record.operationId, null), 400, "COMMAND_INPUT_INVALID");
      failure(await http.get(record.operationId, new URLSearchParams({ workspace_id: source }).toString()), 404, "COMMAND_RESOURCE_NOT_FOUND");
      expect((await http.mutation()).statusCode).toBe(403); expect(preview).not.toHaveBeenCalled();
    }, config); } finally { preview.mockRestore(); }
  });
  async function businessLedger(f: Fixture) {
    const results: Record<string, unknown> = {};
    for (const table of ["execution_command_plans_f0", "execution_operation_queue_items", "execution_operation_workflow_events",
      "product_audit_events", "execution_trusted_commands", "portal_access_policy_state", "portal_access_grants_v2",
      "portal_access_policy_events", "portal_access_proposals"])
      results[table] = (await ctx.pool.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS rows
        FROM ${table} t WHERE workspace_id=$1`, [f.workspace])).rows[0].rows;
    results.events = (await ctx.pool.query(`SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY to_jsonb(e)::text),'[]'::jsonb) AS rows
      FROM execution_trusted_command_events e JOIN execution_trusted_commands c USING(command_id) WHERE c.workspace_id=$1`,
      [f.workspace])).rows[0].rows;
    return results;
  }
  it("GET does not plan/apply, dispatch, reconcile, refresh source or write business/audit/grant history", async () => {
    const f = await fixture(), record = await seed(f), bad = await seed(f, { warnings: [secret] }); await seedCommand(f);
    const denied = await seed(f, { targetId: next() });
    const plan = vi.spyOn(f.legacy, "plan"), apply = vi.spyOn(f.legacy, "apply"), oldRead = vi.spyOn(f.legacy, "operationOrNull");
    const reconcile = vi.spyOn(f.commands, "reconcile"), recover = vi.spyOn(f.commands, "recover"), submit = vi.spyOn(f.commands, "submit");
    const before = await businessLedger(f);
    try { await mounted(f, async http => {
      body(await http.get(record.operationId)); body(await http.get(record.operationId));
      failure(await http.get(bad.operationId), 503, "COMMAND_STATUS_UNVERIFIED");
      failure(await http.get(denied.operationId), 404, "COMMAND_RESOURCE_NOT_FOUND");
      failure(await http.get(absent), 404, "COMMAND_RESOURCE_NOT_FOUND");
      failure(await http.get(record.operationId, "workspace_id="), 400, "COMMAND_INPUT_INVALID");
      expect((await http.get(record.operationId, undefined, null)).statusCode).toBe(401);
    }); expect(await businessLedger(f)).toEqual(before);
      for (const spy of [plan, apply, oldRead, reconcile, recover, submit, f.commandTrust.prepare, f.commandTrust.send,
        f.commandTrust.lookup, f.publication, f.mapping, f.localRead, f.trust.verifyPolicy, f.trust.verifyReceipt])
        expect(spy).not.toHaveBeenCalled();
      expect(f.trust.relations).toHaveBeenCalled(); // Required local authority reads are not forbidden source dispatch.
    } finally { for (const spy of [plan, apply, oldRead, reconcile, recover, submit]) spy.mockRestore(); }
  });

  async function seedCommand(f: Fixture) {
    if (f.resource.kind !== "PORTFOLIO" && f.resource.kind !== "DEPLOYMENT") throw new Error("TEST_ONLY command seed requires a capital resource");
    const now = await dbNow(), intent = commandIntent.parse({ schema_version: "execution.capital-intent.v2", workspace_id: f.workspace,
      resource: f.resource, environment: f.environment, expected_policy_revision: f.policy.revision,
      business_payload: { schema_version: "pma.capital-command.v1.1", operation: "TOP_UP", idempotency_key: next(),
        recipient_kind: f.resource.kind === "DEPLOYMENT" ? "DEPLOYMENT_ACCOUNT" : "PORTFOLIO", currency: "USDT",
        reason: "TEST_ONLY stored receipt, no PM send", amount: "10.000000000000000001",
        expected_versions: { budget: "9007199254740993", source: "2", parent: "3" },
        ...(f.resource.kind === "DEPLOYMENT" ? { recipient_deployment_id: f.resource.id, recipient_account_id: next() } : {}) } });
    const hash = intentHash(f.reader.actor, intent), r = f.grant.ts_receipt!;
    const authorization = commandAuthorization.parse({ qualification: "TEST_ONLY", reference: next(), authority_ref: "TEST_ONLY:PM",
      profile_ref: `TEST_ONLY:${f.environment}`, audience: "pma.management.v1", actor_id: f.reader.user.userId,
      ts_user_id: `TEST_ONLY:ts:${f.reader.user.userId}`, workload_ref: "TEST_ONLY:workload", delegation_ref: "TEST_ONLY:delegation",
      mapping_revision: r.mapping_revision, membership_revision: r.membership_revision, membership_receipt_ref: r.receipt_id,
      workspace_id: f.workspace, environment: f.environment, operation: intent.business_payload.operation,
      resource_kind: f.resource.kind, resource_id: f.resource.id, policy_revision: f.policy.revision, intent_hash: hash,
      source_intent_digest: accessDigest(["TEST_ONLY:resolved", intent]).slice(7), expected_versions: intent.business_payload.expected_versions,
      issued_at_ms: now - 1000, expires_at_ms: now + 30_000, idempotency_retained_until_ms: now + 600_000,
      approval_required: false, required_approval_gate: null, approval: null, r2_basis: null,
      commit_checks: { human: true, workload: true, membership: true, scope: true, versions: true, capacity: true, approval: true } });
    const db = await ctx.pool.connect();
    try { await db.query("BEGIN"); const row = await new CommandStore(ctx.pool).insert(db, f.reader.user.userId, intent, hash, authorization);
      await db.query("COMMIT"); return row;
    } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
  }
});
