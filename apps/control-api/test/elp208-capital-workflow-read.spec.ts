/** ELP2-07/08 local workflow reader correctness; not source commissioning.
 * Real disposable PostgreSQL + mounted HTTP/current Core access graph. PM
 * relations, acceptance and historical receipt facts are synthetic TEST_ONLY.
 * Never import another spec: its hooks would execute a second fixture suite.
 */
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
import { ExecutionCommandController } from "../src/execution-v2/command.controller";
import { ExecutionCommandService, intentHash } from "../src/execution-v2/command.service";
import { CommandStore, type CommandRecord } from "../src/execution-v2/command.store";
import { commandAuthorization, type CommandTrust } from "../src/execution-v2/command-trust";
import { workflowCapital } from "../src/execution-v2/workflow.contract";
import { coreExecutionRead } from "../src/execution/retained-read-profile";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const next = () => `TEST_ONLY:${randomUUID()}`;
const missing = "ecm_00000000000000000000000000000000";
const password = "TEST-only-ELP208-workflow-correct-horse-battery-2026";
const exactAmount = "10.000000000000000001";
const strictQueries: Array<Record<string, string>> = [{ workspace_id: "" }, { invented: "true" }, { currency: "USDT" }, { environment: "paper" }, { after: "x" }];
type Resource = CommandIntent["resource"];
type Environment = CommandIntent["environment"];
type Operation = CommandIntent["business_payload"]["operation"];
type Workflow = ReturnType<typeof workflowCapital.parse>;
type RawCandidate = NonNullable<Awaited<ReturnType<CommandStore["workflowCandidate"]>>>;
type Response = { statusCode: number; headers: Record<string, unknown>; body: string; json(): unknown };
@Module({}) class CapitalWorkflowTestModule {}

describe.skipIf(!process.env.TEST_DATABASE_URL)("ELP2-07/08 capital workflow GET: actual PG/HTTP, synthetic TEST_ONLY source", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>, auth: AuthService;
  type Account = { user: NonNullable<Awaited<ReturnType<AuthService["users"]["findById"]>>>;
    session: Awaited<ReturnType<AuthService["login"]>>; actor: AccessActor; username: string };
  let owner: Account, viewer: Account, delegator: Account;
  beforeAll(async () => {
    await migrateTestDatabase(process.env.TEST_DATABASE_URL!);
    ctx = await setupApp({ DATABASE_URL: process.env.TEST_DATABASE_URL! }); auth = ctx.app.get(AuthService);
    vi.spyOn(auth, "verifyAccessIdentity").mockImplementation(async assertion => ({
      iss: "https://test-only.cloudflareaccess.com", sub: `TEST_ONLY:${assertion}`, aud: "test-audience",
      email: `${assertion}@azdag.com`, normalizedEmail: `${assertion}@azdag.com`,
      authenticationTime: new Date(), tokenExpiresAt: new Date(Date.now() + 60_000),
    }));
    async function activated(): Promise<Account> {
      const admin = new AdminService(ctx.pool, ctx.config, auth), username = `elp208-workflow-${randomUUID()}`;
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
    await new OwnerAccessRepository(ctx.pool).claimOwner({ userId: owner.user.userId, claimedBy: "ELP208_WORKFLOW_TEST_ONLY" });
  });
  afterAll(async () => { vi.restoreAllMocks(); if (ctx) await teardownApp(ctx); });

  async function workspace() {
    const id = next();
    await ctx.pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY capital workflow',$2)", [id, owner.user.userId]);
    await ctx.pool.query(`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES
      ($1,$2,'OWNER'),($1,$3,'MEMBER'),($1,$4,'MEMBER')`, [id, owner.user.userId, viewer.user.userId, delegator.user.userId]);
    return id;
  }
  async function fixture(kind: Resource["kind"] = "PORTFOLIO", environment: Environment = "paper") {
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
    const commandTrust: CommandTrust = { prepare: vi.fn(async () => { throw new Error("TEST_ONLY GET must not prepare"); }),
      send: vi.fn(async () => { throw new Error("TEST_ONLY GET must not send"); }),
      lookup: vi.fn(async () => { throw new Error("TEST_ONLY GET must not lookup"); }) };
    // No cursor keyring or source sender is needed for one immutable local read.
    const commands = new ExecutionCommandService(ctx.pool, access, commandTrust, true);
    return { workspace: ws, resource, environment, policy, membership, grant, repo, access, commandTrust, commands,
      store: new CommandStore(ctx.pool) };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;

  async function seed(f: Fixture, operation: Operation = f.resource.kind === "ROOT" ? "SET_ROOT_LIMIT" : "TOP_UP",
    options: { target?: Resource; environment?: Environment; currency?: string; expiredOriginal?: boolean } = {}): Promise<CommandRecord> {
    const target = options.target ?? f.resource, environment = options.environment ?? f.environment;
    const versions: Record<Operation, readonly string[]> = { FUND: ["budget", "source", "claim"], INITIAL_GRANT: ["budget", "source", "parent"],
      TOP_UP: ["budget", "source", "parent"], IMMEDIATE_DECREASE: ["budget", "source", "parent", "book"],
      RECALL_PARTIAL: ["budget", "source", "parent", "book"], RECALL_FULL: ["budget", "source", "parent", "book"],
      ADJUST_TARGET_BUDGET: ["budget", "source", "parent", "book"], SET_ROOT_LIMIT: ["budget", "source"] };
    const field = operation === "SET_ROOT_LIMIT" ? "target_root_limit" : operation === "ADJUST_TARGET_BUDGET" ? "target_budget"
      : operation === "RECALL_FULL" ? null : "amount";
    const intent = commandIntent.parse({ schema_version: "execution.capital-intent.v2", workspace_id: f.workspace,
      resource: target, environment, expected_policy_revision: f.policy.revision,
      business_payload: { schema_version: "pma.capital-command.v1.1", operation,
        idempotency_key: next(), recipient_kind: target.kind === "ROOT" ? "ROOT" : target.kind === "DEPLOYMENT" ? "DEPLOYMENT_ACCOUNT" : "PORTFOLIO",
        currency: options.currency ?? "USDT", reason: "TEST_ONLY stored receipt, no native PM call",
        expected_versions: Object.fromEntries(versions[operation].map((key, index) => [key, String(9007199254740993n + BigInt(index))])),
        ...(field ? { [field]: exactAmount } : {}), ...(operation === "FUND" ? { source_ref: next() } : {}),
        ...(target.kind === "DEPLOYMENT" ? { recipient_deployment_id: target.id, recipient_account_id: next() } : {}) } });
    const now = Date.now(), hash = intentHash(viewer.actor, intent), before = options.expiredOriginal ? now - 120_000 : now - 1000;
    const authorization = commandAuthorization.parse({ qualification: "TEST_ONLY", reference: next(), authority_ref: "TEST_ONLY:pm",
      profile_ref: `TEST_ONLY:${environment}`, audience: "pma.management.v1", actor_id: viewer.user.userId,
      ts_user_id: `TEST_ONLY:ts:${viewer.user.userId}`, workload_ref: "TEST_ONLY:workload", delegation_ref: "TEST_ONLY:delegation",
      mapping_revision: f.membership.mapping_revision, membership_revision: f.membership.revision,
      membership_receipt_ref: f.membership.receipt_id, workspace_id: f.workspace, environment, operation,
      resource_kind: target.kind, resource_id: target.id, policy_revision: f.policy.revision, intent_hash: hash,
      source_intent_digest: accessDigest(["TEST_ONLY synthetic resolved intent", intent]).slice(7), expected_versions: intent.business_payload.expected_versions,
      issued_at_ms: before, expires_at_ms: before + 30_000, idempotency_retained_until_ms: before + 60_000,
      approval_required: false, required_approval_gate: null, approval: null, r2_basis: null,
      commit_checks: { human: true, workload: true, membership: true, scope: true, versions: true, capacity: true, approval: true } });
    const db = await ctx.pool.connect();
    try { await db.query("BEGIN"); const value = await f.store.insert(db, viewer.user.userId, intent, hash, authorization);
      await db.query("COMMIT"); return value;
    } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
  }
  async function business(f: Fixture, record: CommandRecord, state: CommandStatus["business"]["state"], nonamount = false) {
    const amounts = state === "UNKNOWN" || nonamount ? null : state === "PARTIALLY_APPLIED" ? {
      requested: exactAmount, applied: "6", pending: "4.000000000000000001", cancelled: "0", rejected: "0" }
      : state === "PARTIALLY_APPLIED_CANCELLED" ? { requested: exactAmount, applied: "6", pending: "0", cancelled: "4.000000000000000001", rejected: "0" }
      : { requested: exactAmount, applied: state === "APPLIED" ? exactAmount : "0",
        pending: state === "WAITING_ENCUMBRANCE" ? exactAmount : "0", cancelled: state === "CANCELLED" ? exactAmount : "0", rejected: state === "REJECTED" ? exactAmount : "0" };
    return f.store.update(f.workspace, record.id, null, old => commandStatus.parse({ ...old.status,
      delivery: state === "UNKNOWN" ? "DELIVERY_UNKNOWN" : "ACKNOWLEDGED", projection: "STALE", venue: "PENDING",
      business: { state, receipt_ref: state === "UNKNOWN" ? null : next(), source_event_ref: state === "UNKNOWN" ? null : next(),
        revision: state === "UNKNOWN" ? null : "9223372036854775807", amounts }, next_action: state === "UNKNOWN" ? "QUERY_SAME_INTENT" : "REVIEW_RECEIPT" }));
  }

  async function mounted(f: Fixture, run: (http: { get(id: string, query?: Record<string, string>, token?: string | null): Promise<Response>;
    raw(url: string, token?: string | null): Promise<Response>; detail(id: string): Promise<Response>; preview(): Promise<Response> }) => Promise<void>, config: ControlApiConfig = ctx.config) {
    const app = await NestFactory.create<NestFastifyApplication>({ module: CapitalWorkflowTestModule,
      controllers: [ExecutionCommandController], providers: [SessionGuard,
        { provide: AuthService, useValue: auth }, { provide: CONTROL_API_CONFIG, useValue: config },
        { provide: WorkspacesRepository, useValue: new WorkspacesRepository(ctx.pool, config) },
        { provide: ExecutionCommandService, useValue: f.commands }] }, new FastifyAdapter(), { logger: false, abortOnError: false });
    try {
      app.useGlobalFilters(new HttpErrorFilter()); await app.register(cookiePlugin as never); await app.init();
      await app.getHttpAdapter().getInstance().ready(); const http = app.getHttpAdapter().getInstance() as FastifyInstance;
      const headers = (token: string | null) => token === null ? {} : { cookie: `${SESSION_COOKIE}=${token}` };
      const raw = (url: string, token: string | null = viewer.session.token) => http.inject({ method: "GET", headers: headers(token), url });
      await run({ raw,
        get: (id, query = {}, token = viewer.session.token) => raw(`/api/v1/execution/capital-commands/${id}/workflow?${new URLSearchParams({ workspace_id: f.workspace, ...query })}`, token),
        detail: id => raw(`/api/v1/execution/capital-commands/${id}?workspace_id=${encodeURIComponent(f.workspace)}`),
        preview: () => http.inject({ method: "POST", headers: headers(viewer.session.token), url: "/api/v1/execution/capital-commands/preview", payload: {} }) });
    } finally { await app.close(); }
  }
  function read(response: Response): Workflow {
    expect(response.statusCode).toBe(200); expect(response.headers["cache-control"]).toBe("private, no-store");
    return workflowCapital.parse(response.json());
  }
  function refusal(response: Response, status: number, code?: string) {
    expect(response.statusCode).toBe(status); expect(response.headers["cache-control"]).toContain("no-store");
    if (code) expect(response.json()).toMatchObject({ error: { code } });
    expect(response.body).not.toMatch(/PRIVATE_WF_DIAGNOSTIC|PRIVATE_SQL|SELECT secret|ZodError|stack|expected_versions|source_intent_digest/);
  }
  async function delegated(f: Fixture, effect: "ALLOW" | "DENY") {
    const ceiling: ScopedAccessGrant = { ...f.grant, grant_id: next(), subject_user_id: delegator.user.userId,
      action: "access.grant", delegable_actions: ["audit.read"], requires_ts_acceptance: false, ts_receipt: null,
      valid_from_ms: f.grant.valid_from_ms - 1000, valid_until_ms: f.grant.valid_until_ms! + 1000, revision: next() };
    await f.repo.saveGrant(ceiling, true);
    validateDelegation(await f.access.readContext(delegator.actor, f.workspace), { subject_user_id: viewer.user.userId, action: "audit.read", effect,
      selector: f.grant.selector, environments: f.grant.environments, valid_from_ms: f.grant.valid_from_ms,
      valid_until_ms: f.grant.valid_until_ms, delegable_actions: [], ceiling_grant_id: ceiling.grant_id,
      expected_ceiling_revision: ceiling.revision, expected_policy_revision: f.policy.revision,
      expected_ts_membership_revision: f.membership.revision, reason: "TEST_ONLY current reachable delegation" });
    const leaf: ScopedAccessGrant = { ...f.grant, grant_id: next(), effect, issued_by: delegator.user.userId, parent_grant_id: ceiling.grant_id, revision: next() };
    await f.repo.saveGrant(leaf, true); return { leaf, ceiling };
  }

  it("reuses the validated migration136 persisted JSON bounds instead of an unbounded raw one-row read", async () => {
    const constraints = (await ctx.pool.query(`SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conrelid='execution_trusted_commands'::regclass
        AND contype='c' AND convalidated`)).rows.map(row => String(row.definition));
    for (const column of ["intent", "authorization_fact", "status"])
      expect(constraints.some(definition => definition.includes(`octet_length((${column})::text) <= 32768`))).toBe(true);
    // At most96KiB of JSON crosses this exact-row read. These are genuine DB
    // constraints, not a claimed production QPS/latency or source qualification.
  });
  it.each(["ROOT", "PORTFOLIO", "DEPLOYMENT"] as const)("serves exact %s context, immutable currency and four independent dimensions", async kind => {
    const f = await fixture(kind), first = await seed(f, kind === "ROOT" ? "SET_ROOT_LIMIT" : "FUND", { currency: "USDC" });
    const record = await business(f, first, "APPLIED", kind === "ROOT"), earliest = Date.now();
    await mounted(f, async http => {
      const response = await http.get(record.id), body = read(response);
      expect(body).toMatchObject({ currency: "USDC", status: record.status, context: { workspace_id: f.workspace, resource: f.resource,
        environment: f.environment, policy_revision: f.policy.revision, source_as_of_ms: null },
        effect_kind: kind === "ROOT" ? "NOMINAL_ROOT_CAP" : "ECONOMIC_ASSIGNMENT", automatic_resend: false,
        physical_transfer_performed: false, refresh: "GET_ORIGINAL_COMMAND_NO_RESUBMIT" });
      expect(body.context.observed_at_ms).toBeGreaterThanOrEqual(earliest);
      expect(body.context.observed_at_ms).toBeLessThanOrEqual(Date.now());
      expect(body.status).toMatchObject({ delivery: "ACKNOWLEDGED", business: { state: "APPLIED" }, projection: "STALE", venue: "PENDING", authority: "TEST_ONLY" });
      expect(response.body).not.toMatch(/intent_hash|ts_user_id|workload_ref|delegation_ref|membership_receipt_ref|expected_versions|idempotency_key|authority_fingerprint/);
    });
  });
  it.each(["UNKNOWN", "APPLIED", "PARTIALLY_APPLIED", "WAITING_ENCUMBRANCE", "CANCELLED", "PARTIALLY_APPLIED_CANCELLED", "REJECTED"] as const)(
    "preserves real stored %s partition/copy without ACK, projection or venue promotion", async state => {
      const f = await fixture(), initial = await seed(f), record = await business(f, initial, state);
      await mounted(f, async http => {
        const body = read(await http.get(record.id)); expect(body.status).toEqual(record.status);
        expect(body.public_copy_key).toBe(state === "UNKNOWN" ? "QUERY_SAME_INTENT" : state === "REJECTED" ? "SOURCE_REJECTED"
          : state === "PARTIALLY_APPLIED_CANCELLED" ? "APPLIED_PART_RETAINED" : ["PARTIALLY_APPLIED", "WAITING_ENCUMBRANCE"].includes(state) ? "PARTIAL_REMAINDER_PENDING" : "REVIEW_RECEIPT");
        if (state === "UNKNOWN") expect(body.status.business).toMatchObject({ receipt_ref: null, source_event_ref: null, revision: null, amounts: null });
        else expect(body.status.business.amounts?.requested).toBe(exactAmount);
      });
    });
  it.each(["ADJUST_TARGET_BUDGET", "SET_ROOT_LIMIT"] as const)("retains known nonamount %s outcome without inventing a transfer partition", async operation => {
    const f = await fixture(operation === "SET_ROOT_LIMIT" ? "ROOT" : "PORTFOLIO"), first = await seed(f, operation);
    const record = await business(f, first, "REJECTED", true);
    await mounted(f, async http => { const body = read(await http.get(record.id));
      expect(body.status.business.amounts).toBeNull(); expect(body.status.business.receipt_ref).not.toBeNull();
      expect(body.public_copy_key).toBe("SOURCE_REJECTED"); expect(body.physical_transfer_performed).toBe(false); });
  });
  it("RECALL_FULL still needs a source-resolved exact partition despite having no request amount", async () => {
    const f = await fixture(), first = await seed(f, "RECALL_FULL"), record = await business(f, first, "APPLIED");
    await mounted(f, async http => { expect(read(await http.get(record.id)).status.business.amounts?.applied).toBe(exactAmount); });
  });
  it("expired original new-send/lookup proof remains readable under current accepted report authority", async () => {
    const f = await fixture(), initial = await seed(f, "TOP_UP", { expiredOriginal: true }), record = await business(f, initial, "APPLIED");
    expect(record.authorization.expires_at_ms).toBeLessThan(Date.now());
    expect(record.authorization.idempotency_retained_until_ms).toBeLessThan(Date.now());
    await mounted(f, async http => { expect(read(await http.get(record.id)).status).toEqual(record.status); });
  });
  it("a different currently authorized audit reviewer reads history using the original actor's immutable hash", async () => {
    const f = await fixture(), record = await seed(f);
    await f.repo.saveGrant({ ...f.grant, grant_id: next(), subject_user_id: delegator.user.userId, revision: next() }, true);
    await mounted(f, async http => { expect(read(await http.get(record.id, {}, delegator.session.token)).status.command_id).toBe(record.id); });
  });

  it.each(["business-only", "mutation-only", "app-only-audit", "wrong-resource", "wrong-environment", "stale-receipt", "revoked"] as const)(
    "normalizes %s hidden receipts and missing receipts to the same finite404", async variant => {
      const f = await fixture(), record = await seed(f); let g: ScopedAccessGrant = { ...f.grant, revision: next() };
      if (variant === "business-only") g = { ...g, action: "business.read_all" };
      if (variant === "mutation-only") g = { ...g, action: "capital.top_up" };
      if (variant === "app-only-audit") g = { ...g, requires_ts_acceptance: false, ts_receipt: null };
      if (variant === "wrong-resource") g = { ...g, selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: f.resource.kind, ids: [next()] } };
      if (variant === "wrong-environment") g = { ...g, environments: ["sandbox"] };
      if (variant === "stale-receipt") g = { ...g, ts_receipt: { ...g.ts_receipt!, membership_revision: next() } };
      if (variant === "revoked") g = { ...g, revoked_at_ms: Date.now() };
      await f.repo.saveGrant(g);
      await mounted(f, async http => { const hidden = await http.get(record.id), absent = await http.get(missing);
        refusal(hidden, 404, "COMMAND_RESOURCE_NOT_FOUND"); expect(hidden.json()).toEqual(absent.json());
        expect(hidden.body).not.toContain(record.id); });
    });
  it("workspace/resource/environment are taken from the immutable stored tuple, not query/body overrides", async () => {
    const f = await fixture(), record = await seed(f), other = await fixture();
    const hiddenTarget = await seed(f, "TOP_UP", { target: { ...f.resource, id: next() } });
    const hiddenEnv = await seed(f, "TOP_UP", { environment: "sandbox" });
    await mounted(f, async http => {
      for (const response of [await http.get(record.id, { workspace_id: other.workspace }), await http.get(hiddenTarget.id), await http.get(hiddenEnv.id)])
        refusal(response, 404, "COMMAND_RESOURCE_NOT_FOUND");
      refusal(await http.get(record.id, { resource_id: f.resource.id }), 400, "COMMAND_INPUT_INVALID");
      refusal(await http.get(record.id, { currency: "USD" }), 400, "COMMAND_INPUT_INVALID");
    });
  });
  it("a real delegated DENY keeps its app-only access.grant ancestor and defeats an independent accepted ALLOW", async () => {
    const f = await fixture(), record = await seed(f); await delegated(f, "DENY");
    expect(evaluateAccess(await f.access.readContext(viewer.actor, f.workspace), "audit.read", f.resource, f.environment).allowed).toBe(false);
    await mounted(f, async http => { refusal(await http.get(record.id), 404, "COMMAND_RESOURCE_NOT_FOUND"); });
  });
  it("an accepted delegated ALLOW keeps its valid app-only access.grant ancestor", async () => {
    const f = await fixture(), record = await seed(f);
    await f.repo.saveGrant({ ...f.grant, revoked_at_ms: Date.now(), revision: next() }); await delegated(f, "ALLOW");
    await mounted(f, async http => { expect(read(await http.get(record.id)).status.command_id).toBe(record.id); });
  });
  it("a revoked delegation ceiling invalidates its accepted audit descendant", async () => {
    const f = await fixture(), record = await seed(f);
    await f.repo.saveGrant({ ...f.grant, revoked_at_ms: Date.now(), revision: next() }); const { ceiling } = await delegated(f, "ALLOW");
    await f.repo.saveGrant({ ...ceiling, revoked_at_ms: Date.now(), revision: next() });
    await mounted(f, async http => { refusal(await http.get(record.id), 404, "COMMAND_RESOURCE_NOT_FOUND"); });
  });

  /** Read-fault injection occurs AFTER a genuine read of the seeded PostgreSQL
   * row. Never disable immutable DB triggers or edit original authority rows.
   * Each case proves the reader validates a corrupt adapter/persistence result.
   */
  async function fault(f: Fixture, mutate: (raw: RawCandidate) => void, run: () => Promise<void>) {
    const original = CommandStore.prototype.workflowCandidate;
    const interception = vi.spyOn(CommandStore.prototype, "workflowCandidate").mockImplementation(async function (this: CommandStore, ...args) {
      const raw = await original.apply(this, args);
      if (raw && args[0] === f.workspace) { const changed = structuredClone(raw); mutate(changed); return changed; }
      return raw;
    });
    try { await run(); } finally { interception.mockRestore(); }
  }
  it.each(["status-shape", "status-id", "status-operation", "status-resource", "status-environment", "status-profile", "status-qualification",
    "intent-currency", "intent-workspace", "record-workspace", "record-id", "record-hash", "original-actor", "authorization-actor", "authorization-hash",
    "authorization-resource", "authorization-environment", "authorization-operation", "authorization-policy", "authorization-versions"] as const)(
    "sanitizes authorized %s inconsistency instead of mixing identities or exposing parser/source prose", async variant => {
      const f = await fixture(), record = await seed(f);
      await fault(f, raw => {
        const value = raw as unknown as { id: string; workspace: string; actor: string; hash: string; intent: CommandIntent;
          authorization: ReturnType<typeof commandAuthorization.parse>; status: Record<string, unknown> };
        if (variant === "status-shape") value.status.business = { PRIVATE_SQL: "PRIVATE_WF_DIAGNOSTIC" };
        if (variant === "status-id") value.status.command_id = missing;
        if (variant === "status-operation") value.status.operation = "FUND";
        if (variant === "status-resource") value.status.resource = { ...f.resource, id: next() };
        if (variant === "status-environment") value.status.environment = "sandbox";
        if (variant === "status-profile") value.status.profile_ref = next();
        if (variant === "status-qualification") value.status.authority = "OWNER_VERIFIED";
        if (variant === "intent-currency") value.intent.business_payload.currency = "PRIVATE_WF_DIAGNOSTIC";
        if (variant === "intent-workspace") value.intent.workspace_id = next();
        if (variant === "record-workspace") value.workspace = next();
        if (variant === "record-id") value.id = missing;
        if (variant === "record-hash") value.hash = accessDigest(next());
        if (variant === "original-actor") value.actor = delegator.user.userId;
        if (variant === "authorization-actor") value.authorization.actor_id = delegator.user.userId;
        if (variant === "authorization-hash") value.authorization.intent_hash = accessDigest(next());
        if (variant === "authorization-resource") value.authorization.resource_id = next();
        if (variant === "authorization-environment") value.authorization.environment = "sandbox";
        if (variant === "authorization-operation") value.authorization.operation = "FUND";
        if (variant === "authorization-policy") value.authorization.policy_revision = next();
        if (variant === "authorization-versions") value.authorization.expected_versions.budget = "1";
      }, async () => { await mounted(f, async http => { const response = await http.get(record.id);
        refusal(response, 503); expect((response.json() as { error: { code: string } }).error.code).toMatch(/^COMMAND_(?:STATUS_UNVERIFIED|UNAVAILABLE)$/); }); });
    });
  it("corrupt hidden status is the same404 as missing; authorization runs before full raw status parsing", async () => {
    const f = await fixture(), record = await seed(f); await f.repo.saveGrant({ ...f.grant, revoked_at_ms: Date.now(), revision: next() });
    await fault(f, raw => { (raw as unknown as { status: unknown }).status = { PRIVATE_SQL: "PRIVATE_WF_DIAGNOSTIC" }; }, async () => {
      await mounted(f, async http => { const hidden = await http.get(record.id), absent = await http.get(missing);
        refusal(hidden, 404, "COMMAND_RESOURCE_NOT_FOUND"); expect(hidden.json()).toEqual(absent.json()); });
    });
  });
  it("raw store failures have fixed public503 copy, never SQL/parser diagnostics", async () => {
    const f = await fixture(), record = await seed(f);
    const failure = vi.spyOn(CommandStore.prototype, "workflowCandidate").mockRejectedValueOnce(new Error("SELECT secret PRIVATE_WF_DIAGNOSTIC"));
    try { await mounted(f, async http => { refusal(await http.get(record.id), 503, "COMMAND_UNAVAILABLE"); }); }
    finally { failure.mockRestore(); }
  });

  it.each(["grant", "session", "session-expiry"] as const)("real %s invalidation after actual PG candidate read prevents workflow delivery", async variant => {
    const f = await fixture(), record = await seed(f), session = await auth.login({ assertion: viewer.username, username: viewer.username, credential: password });
    const original = CommandStore.prototype.workflowCandidate; let changed = false;
    const interception = vi.spyOn(CommandStore.prototype, "workflowCandidate").mockImplementation(async function (this: CommandStore, ...args) {
      const raw = await original.apply(this, args);
      if (args[0] === f.workspace && !changed) { changed = true;
        if (variant === "grant") await f.repo.saveGrant({ ...f.grant, revoked_at_ms: Date.now(), revision: next() });
        else if (variant === "session") await ctx.pool.query("UPDATE auth_sessions SET state='REVOKED',revoked_at=clock_timestamp(),revoke_reason='TEST_ONLY workflow race' WHERE session_id=$1", [session.sessionId]);
        else await ctx.pool.query("UPDATE auth_sessions SET idle_expires_at=clock_timestamp()-interval '1 second' WHERE session_id=$1", [session.sessionId]);
      }
      return raw;
    });
    try { await mounted(f, async http => { const response = await http.get(record.id, {}, session.token); expect(changed).toBe(true);
      refusal(response, variant === "grant" ? 409 : 403, variant === "grant" ? "ACCESS_RETRY_REQUIRED" : "CURRENT_ACTOR_AUTHORITY_REQUIRED");
      expect(response.body).not.toContain(record.id); }); } finally { interception.mockRestore(); }
  });
  it.each(["grant-expiry", "receipt-expiry", "future-deny"] as const)("the final synchronous wall clock detects %s after the last DB confirmation", async variant => {
    const f = await fixture(), record = await seed(f), future = f.grant.valid_until_ms! + 1;
    if (variant === "receipt-expiry") await f.repo.saveGrant({ ...f.grant, valid_until_ms: future + 60_000,
      ts_receipt: { ...f.grant.ts_receipt!, expires_at_ms: future - 1 }, revision: next() });
    if (variant === "future-deny") {
      await f.repo.saveGrant({ ...f.grant, valid_until_ms: future + 60_000, ts_receipt: { ...f.grant.ts_receipt!, expires_at_ms: future + 60_000 }, revision: next() });
      await f.repo.saveGrant({ ...f.grant, grant_id: next(), effect: "DENY", valid_from_ms: future,
        valid_until_ms: future + 60_000, requires_ts_acceptance: false, ts_receipt: null, revision: next() }, true);
    }
    const original = f.access.confirmReadContext.bind(f.access); let clock: { mockRestore(): void } | undefined;
    const confirmation = vi.spyOn(f.access, "confirmReadContext").mockImplementation(async (...args) => {
      const current = await original(...args); clock = vi.spyOn(Date, "now").mockReturnValue(future); return current;
    });
    try { await mounted(f, async http => { refusal(await http.get(record.id), 404, "COMMAND_RESOURCE_NOT_FOUND"); }); }
    finally { clock?.mockRestore(); confirmation.mockRestore(); }
  });

  it("unchanged authorized data keeps snapshot identity despite observation time and unrelated hidden changes", async () => {
    const f = await fixture(), record = await seed(f), hidden = await seed(f, "TOP_UP", { target: { ...f.resource, id: next() } });
    await mounted(f, async http => {
      const one = read(await http.get(record.id));
      await f.store.update(f.workspace, hidden.id, null, old => ({ ...old.status, projection: "STALE" }));
      await f.repo.saveGrant({ ...f.grant, grant_id: next(), selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: f.resource.kind, ids: [next()] }, revision: next() }, true);
      const two = read(await http.get(record.id)); expect(two.context.snapshot_ref).toBe(one.context.snapshot_ref);
      expect(two.status).toEqual(one.status); expect(two.context.observed_at_ms).toBeGreaterThanOrEqual(one.context.observed_at_ms);
      await f.store.update(f.workspace, record.id, null, old => ({ ...old.status, projection: "CATCHING_UP" }));
      const changed = read(await http.get(record.id)); expect(changed.context.snapshot_ref).not.toBe(one.context.snapshot_ref);
      expect(changed.context.source_as_of_ms).toBeNull();
    });
  });
  it("current policy changes the scoped snapshot but does not invalidate immutable history's original policy", async () => {
    const f = await fixture(), record = await seed(f);
    await mounted(f, async http => {
      const one = read(await http.get(record.id)), revision = next();
      await f.repo.putPolicy({ ...f.policy, revision }); await f.repo.saveGrant({ ...f.grant, policy_revision: revision, revision: next() });
      const two = read(await http.get(record.id)); expect(two.context.policy_revision).toBe(revision);
      expect(two.context.snapshot_ref).not.toBe(one.context.snapshot_ref); expect(two.status).toEqual(one.status);
    });
  });
  it.each(strictQueries)(
    "strict query refuses %j before raw command read", async query => {
      const f = await fixture(), record = await seed(f), candidate = vi.spyOn(CommandStore.prototype, "workflowCandidate");
      try { await mounted(f, async http => { refusal(await http.get(record.id, query), 400, "COMMAND_INPUT_INVALID"); expect(candidate).not.toHaveBeenCalled(); }); }
      finally { candidate.mockRestore(); }
    });
  it("requires session, exact command id and workspace rather than accepting a generic path or repeated query", async () => {
    const f = await fixture(), record = await seed(f), candidate = vi.spyOn(CommandStore.prototype, "workflowCandidate");
    try { await mounted(f, async http => {
      expect((await http.get(record.id, {}, null)).statusCode).toBe(401);
      refusal(await http.get("not-a-command"), 400, "COMMAND_INPUT_INVALID");
      refusal(await http.raw(`/api/v1/execution/capital-commands/${record.id}/workflow`), 400, "COMMAND_INPUT_INVALID");
      refusal(await http.raw(`/api/v1/execution/capital-commands/${record.id}/workflow?workspace_id=${encodeURIComponent(f.workspace)}&workspace_id=other`), 400, "COMMAND_INPUT_INVALID");
      expect(candidate).not.toHaveBeenCalled();
    }); } finally { candidate.mockRestore(); }
  });
  it("retained mode uses exact workflow Core workspace without widening neighboring detail or mutations", async () => {
    const f = await fixture(), record = await seed(f), source = await workspace();
    await ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [source, viewer.user.userId]);
    const config: ControlApiConfig = { ...ctx.config, EXECUTION_READ_PROFILE: "retained_review_v1",
      FEATURE_EXECUTION_LOCAL_PROJECTION: "true", EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: source };
    const detail = vi.spyOn(f.commands, "status"), preview = vi.spyOn(f.commands, "preview");
    try { await mounted(f, async http => {
      expect(read(await http.get(record.id)).context.workspace_id).toBe(f.workspace);
      expect((await http.detail(record.id)).statusCode).toBe(404); expect(detail).not.toHaveBeenCalled();
      expect((await http.preview()).statusCode).toBe(403); expect(preview).not.toHaveBeenCalled();
    }, config); } finally { detail.mockRestore(); preview.mockRestore(); }
    expect(coreExecutionRead(`/api/v1/execution/capital-commands/${record.id}/workflow`)).toBe(true);
    for (const path of [`/api/v1/execution/capital-commands/${record.id}`, "/api/v1/execution/capital-commands/arbitrary/workflow",
      `/api/v1/execution/capital-commands/${record.id}/workflow/extra`, `/api/v1/execution/capital-commands/${record.id}/reconcile`])
      expect(coreExecutionRead(path)).toBe(false);
  });
  it("workflow GET does not call prepare/send/lookup/recovery/reconcile or change command, event or audit rows", async () => {
    const f = await fixture(), record = await seed(f);
    const ledger = async () => (await ctx.pool.query(`SELECT row_to_json(c) AS command_row,
      (SELECT jsonb_agg(to_jsonb(e) ORDER BY to_jsonb(e)::text) FROM execution_trusted_command_events e WHERE e.command_id=c.command_id) AS command_events,
      (SELECT jsonb_agg(to_jsonb(a) ORDER BY to_jsonb(a)::text) FROM product_audit_events a WHERE a.aggregate_id=c.command_id) AS audit_events
      FROM execution_trusted_commands c WHERE c.workspace_id=$1 AND c.command_id=$2`, [f.workspace, record.id])).rows[0];
    const before = await ledger(), recover = vi.spyOn(f.commands, "recover"), reconcile = vi.spyOn(f.commands, "reconcile"),
      submit = vi.spyOn(f.commands, "submit"), preview = vi.spyOn(f.commands, "preview"), update = vi.spyOn(CommandStore.prototype, "update"),
      insert = vi.spyOn(CommandStore.prototype, "insert"), claim = vi.spyOn(CommandStore.prototype, "claim");
    try { await mounted(f, async http => { read(await http.get(record.id)); read(await http.get(record.id)); });
      expect(await ledger()).toEqual(before);
      for (const call of [recover, reconcile, submit, preview, update, insert, claim,
        f.commandTrust.prepare, f.commandTrust.send, f.commandTrust.lookup]) expect(call).not.toHaveBeenCalled();
    } finally { for (const spy of [recover, reconcile, submit, preview, update, insert, claim]) spy.mockRestore(); }
  });
});
