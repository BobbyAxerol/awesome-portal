/** ELP2-04 original04-008/009. Actual disposable PG, genuine Core actors and
 * current audit graph; all source acceptance fixtures are TEST_ONLY. These
 * tests do not commission an upstream writer, relay, source journal or UI.
 * Main alone schedules their bounded DB/build lane; an unrun test is NOT PASS.
 */
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import cookiePlugin from "@fastify/cookie";
import type { FastifyInstance } from "fastify";
import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AdminService } from "../src/admin/admin.service";
import { AuthService } from "../src/auth/auth.service";
import { SESSION_COOKIE } from "../src/auth/cookies";
import type { ControlApiConfig } from "../src/config";
import { SessionGuard } from "../src/facade/session.guard";
import { HttpErrorFilter } from "../src/http-error.filter";
import { WorkspacesRepository } from "../src/repos/workspaces";
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { SessionsRepository } from "../src/repos/sessions";
import { CONTROL_API_CONFIG } from "../src/tokens";
import { GovernanceController } from "../src/governance/governance.controller";
import { GovernanceService } from "../src/governance/governance.service";
import { PaperExitService } from "../src/governance/paper-exit.service";
import { GovernanceReviewCaptureService } from "../src/governance/review-capture.service";
import { ExecutionOperationsService } from "../src/operations/operations.service";
import { OperationsWorkflowService } from "../src/operations/workflow.service";
import { ExecutionOperationsRepository } from "../src/operations/operations.repository";
import { IncidentController } from "../src/operations/incident.controller";
import { IncidentService } from "../src/operations/incident.service";
import { OperationalReadRepository } from "../src/operations/operational-read.repository";
import { OperationalReadService } from "../src/operations/operational-read.service";
import { operationalQueue, operationalWorkflow, operationalIncident, type OperationalQueue } from "../src/operations/operational-read.contract";
import type { AccessActor, AccessResource, ReviewedAccessPolicy, ScopedAccessGrant } from "../src/execution-v2/access.contract";
import { accessDigest, evaluateAccess, validateDelegation, type AccessRelations } from "../src/execution-v2/access-policy";
import { AccessRepository } from "../src/execution-v2/access.repository";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import { ExecutionReadScopes, type ReadScopePrincipal } from "../src/execution-v2/read-scope";
import type { AccessTrustProvider } from "../src/execution-v2/access-trust";
import { OperationalCompositionController } from "../src/execution/operational-composition.controller";
import { OperationalCompositionService } from "../src/execution/operational-composition.service";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const URL = process.env.TEST_DATABASE_URL;
const next = () => `TEST_ONLY:${randomUUID()}`;
const password = "TEST-only-operational-current-correct-horse-2026";
const secret = "TEST_ONLY_PRIVATE_OPERATIONAL_PROSE_NEVER_PUBLIC";
const environments = ["paper", "sandbox", "live"] as const;
type Environment = typeof environments[number];
type Kind = "ACCOUNT" | "PORTFOLIO" | "DEPLOYMENT";
type Response = { statusCode: number; headers: Record<string, unknown>; body: string; json(): unknown };
@Module({}) class OperationalCurrentTestModule {}

describe.skipIf(!URL)("ELP2-04 current operational parents / actual PG+HTTP / TEST_ONLY", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>, auth: AuthService;
  type Account = { username: string; user: NonNullable<Awaited<ReturnType<AuthService["users"]["findById"]>>>;
    login: Awaited<ReturnType<AuthService["login"]>>; session: NonNullable<Awaited<ReturnType<AuthService["sessionFromToken"]>>>; actor: AccessActor };
  let owner: Account, reader: Account, other: Account, delegator: Account;
  beforeAll(async () => {
    await migrateTestDatabase(URL!); ctx = await setupApp({ DATABASE_URL: URL! }); auth = ctx.app.get(AuthService);
    vi.spyOn(auth, "verifyAccessIdentity").mockImplementation(async assertion => ({
      iss: "https://test-only.cloudflareaccess.com", sub: `TEST_ONLY:${assertion}`, aud: "test-audience",
      email: `${assertion}@azdag.com`, normalizedEmail: `${assertion}@azdag.com`,
      authenticationTime: new Date(), tokenExpiresAt: new Date(Date.now() + 600_000),
    }));
    async function activated(role: "ADMIN" | "USER" = "USER"): Promise<Account> {
      const admin = new AdminService(ctx.pool, ctx.config, auth), username = `elp204-current-${randomUUID()}`;
      const made = await admin.createUser({ username, displayName: username, role });
      const activation = await admin.resetCredential(made.userId);
      const initial = await auth.login({ assertion: username, username, credential: activation.activationToken });
      await auth.changePassword({ sessionToken: initial.token, csrfToken: initial.csrfToken,
        currentPassword: activation.activationToken, newPassword: password });
      const login = await auth.login({ assertion: username, username, credential: password });
      const user = (await auth.users.findById(made.userId))!, session = (await auth.sessionFromToken(login.token))!;
      await new WorkspacesRepository(ctx.pool, ctx.config).ensurePersonal(user.userId, username);
      return { username, user, login, session, actor: { user_id: user.userId, session_id: session.sessionId,
        session_generation: user.sessionVersion } };
    }
    owner = await activated("ADMIN"); reader = await activated(); other = await activated(); delegator = await activated();
    await new OwnerAccessRepository(ctx.pool).claimOwner({ userId: owner.user.userId, claimedBy: "ELP204_OPERATIONAL_TEST_ONLY" });
  });
  afterAll(async () => { vi.restoreAllMocks(); if (ctx) await teardownApp(ctx); });
  const dbNow = async () => Number((await ctx.pool.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0].ms);
  async function workspace() {
    const ws = next();
    await ctx.pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY current operations',$2)", [ws, owner.user.userId]);
    for (const account of [owner, reader, other, delegator]) await ctx.pool.query(
      "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,$3)",
      [ws, account.user.userId, account === owner ? "OWNER" : "MEMBER"]);
    return ws;
  }
  async function fixture(kind: Kind = "PORTFOLIO", environment: Environment = "paper") {
    const ws = await workspace(), now = await dbNow(), target: AccessResource = { kind, id: next() };
    const grants = new AccessRepository(ctx.pool), operations = new ExecutionOperationsRepository(ctx.pool);
    const repository = new OperationalReadRepository(ctx.pool);
    const policy: ReviewedAccessPolicy = { workspace_id: ws, revision: next(), artifact_digest: accessDigest(next()), approval_ref: next(),
      state: "REVIEWED", qualification: "TEST_ONLY", protected_owner_user_id: owner.user.userId,
      researcher_fields: { state: "PENDING", policy_ref: null, fields: [] } };
    const membership = { receipt_id: next(), revision: next(), mapping_revision: next() };
    const grant: ScopedAccessGrant = { grant_id: next(), workspace_id: ws, subject_user_id: reader.user.userId,
      action: "audit.read", effect: "ALLOW", selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: kind, ids: [target.id] },
      environments: [environment], valid_from_ms: now - 60_000, valid_until_ms: now + 600_000, delegable_actions: [],
      issued_by: owner.user.userId, parent_grant_id: null, revision: next(), policy_revision: policy.revision,
      revoked_at_ms: null, requires_ts_acceptance: true, field_policy_ref: null,
      ts_receipt: { receipt_id: membership.receipt_id, membership_revision: membership.revision,
        mapping_revision: membership.mapping_revision, effective_at_ms: now - 1000, expires_at_ms: now + 600_000 } };
    await grants.putPolicy(policy); await grants.saveGrant(grant, true);
    const relations: AccessRelations = { qualified: true, revision: membership.revision,
      own_alpha_ids: [], member_portfolio_ids: [], roots: {}, membership: { ...membership } };
    const forbidden = vi.fn(async () => { throw new Error(`TEST_ONLY source/mutation forbidden ${secret}`); });
    const trust: AccessTrustProvider = { verifyPolicy: forbidden, verifyReceipt: forbidden,
      relations: vi.fn(async () => structuredClone(relations)), verifiedHumanMapping: forbidden, readPublication: forbidden };
    const access = new ExecutionAccessService(ctx.pool, auth, trust, true);
    const config: ControlApiConfig = { ...ctx.config, QUERY_CURSOR_ACTIVE_KEY_ID: "test-only",
      QUERY_CURSOR_KEYS_JSON: JSON.stringify({ "test-only": "TEST_ONLY_operational_current_cursor_0123456789abcdef" }), QUERY_CURSOR_TTL_SECONDS: 900 };
    const scopes = new ExecutionReadScopes(ctx.pool, access, config), service = new OperationalReadService(repository, access, scopes, config);
    const principal: ReadScopePrincipal = { user: reader.user, session: reader.session, workspaceId: ws, viewerWorkspaceId: ws };
    return { workspace: ws, target, environment, grants, operations, repository, policy, membership, grant, relations,
      forbidden, trust, access, scopes, config, service, principal };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function change(f: Fixture, patch: Partial<ScopedAccessGrant>) {
    f.grant = { ...f.grant, ...patch, revision: next() }; await f.grants.saveGrant(f.grant);
  }
  async function additional(f: Fixture, target: AccessResource, envs: Environment[] = [f.environment], account = reader) {
    const grant: ScopedAccessGrant = { ...f.grant, grant_id: next(), revision: next(), subject_user_id: account.user.userId,
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: target.kind, ids: [target.id] }, environments: envs };
    await f.grants.saveGrant(grant, true); return grant;
  }
  async function f0(f: Fixture, q: { author?: Account; target?: AccessResource; environment?: Environment; warning?: string } = {}) {
    const target = q.target ?? f.target;
    return (await f.operations.create({ operationId: next(), workspaceId: f.workspace,
      actorUserId: (q.author ?? other).user.userId, requestKey: next(), commandKey: "account/sync",
      environment: (q.environment ?? f.environment).toUpperCase() as "PAPER" | "SANDBOX" | "LIVE",
      targetType: target.kind, targetId: target.id, expectedTargetVersion: 1,
      payloadHash: accessDigest([secret, "payload"]), planDigest: accessDigest([secret, "plan"]), conditions: [], riskTier: "R2_SANDBOX",
      blockerCodes: ["COMMAND_RELAY_DISABLED"], warningCodes: q.warning ? [q.warning] : [], expiresAt: new Date(Date.now() + 300_000),
      requestId: next(), auditEventId: next() })).record;
  }
  /** Legal immutable fixture INSERT, not rewriting existing business identity.
   * A bare queue root intentionally does not claim an F0 provenance family. */
  async function queue(f: Fixture, q: { id?: string; target?: AccessResource; environment?: Environment;
    key?: string; time?: string; source?: "PORTAL" | "EXECUTION" | "BROKER" } = {}) {
    const id = q.id ?? next(), target = q.target ?? f.target, time = q.time ?? "2026-01-02T03:04:05.000000Z";
    await ctx.pool.query(`INSERT INTO execution_operation_queue_items(operation_id,workspace_id,operation_kind,
      command_key,environment,target_type,target_id,risk_tier,severity,source_authority,source_status,
      verification_result,triage_state,workflow_version,created_at,updated_at)
      VALUES($1,$2,'EXECUTION_COMMAND',$3,$4,$5,$6,'R2_SANDBOX','WARNING',$7,'BLOCKED','NOT_STARTED','UNACKNOWLEDGED',1,$8,$8)`,
    [id, f.workspace, q.key ?? "account/sync", (q.environment ?? f.environment).toUpperCase(), target.kind, target.id, q.source ?? "PORTAL", time]);
    return id;
  }
  async function incident(f: Fixture, target: AccessResource = f.target, env: Environment = f.environment) {
    const id = next();
    await ctx.pool.query(`INSERT INTO execution_incidents(incident_id,workspace_id,title,summary,severity,environment,
      target_type,target_id,workflow_state,workflow_version,opened_by_user_id,created_at,updated_at)
      VALUES($1,$2,$3,$3,'WARNING',$4,$5,$6,'OPEN',1,$7,clock_timestamp(),clock_timestamp())`,
    [id, f.workspace, secret, env.toUpperCase(), target.kind, target.id, other.user.userId]);
    await ctx.pool.query(`INSERT INTO execution_incident_annotations(annotation_id,incident_id,workspace_id,author_user_id,body,redaction_state)
      VALUES($1,$2,$3,$4,$5,'CLEAR')`, [next(), id, f.workspace, other.user.userId, secret]);
    await ctx.pool.query(`INSERT INTO execution_incident_evidence(evidence_id,incident_id,workspace_id,evidence_kind,sha256,
      schema_version,declared_source_authority,source_verification_state,summary,captured_at,attached_by_user_id)
      VALUES($1,$2,$3,'OTHER',$4,'TEST_ONLY','PORTAL','UNAVAILABLE',$5,clock_timestamp(),$6)`,
    [next(), id, f.workspace, accessDigest(secret), secret, other.user.userId]);
    return id;
  }
  const query = (f: Fixture, q: Record<string, unknown> = {}) => ({ workspace_id: f.workspace, ...q });
  async function read(f: Fixture, q: Record<string, unknown> = {}): Promise<OperationalQueue> {
    return operationalQueue.parse(await f.service.queue(f.principal, query(f, q)));
  }
  async function refusal(run: Promise<unknown>, status: number, code: string) {
    await expect(run).rejects.toMatchObject({ status, code, message: "The operational read is not available. Review its scope or refresh the page." });
  }
  function finite(value: unknown) {
    expect(JSON.stringify(value)).not.toMatch(new RegExp(`${secret}|actor_user_id|assigned_to_user_id|payload_hash|plan_digest|request_key|incident_id|ts_user_id|resolution_reason`));
  }

  it.each((["ACCOUNT", "PORTFOLIO", "DEPLOYMENT"] as const).flatMap(kind => environments.map(environment => ({ kind, environment }))))(
    "exact current $kind/$environment cohort admits another author's queue and immutable F0 detail", async ({ kind, environment }) => {
      const f = await fixture(kind, environment), record = await f0(f);
      const page = await read(f); expect(page.page.rows.map(x => x.operation_id)).toEqual([record.operationId]);
      expect(page).toMatchObject({ coverage: "AUTHORIZED_SUPPORTED_TARGETS_ONLY", record_authority: "PORTAL",
        source_integration_state: "UNAVAILABLE", source_side_effect_requested: false,
        page: { total_count: 1, filtered_count: 1 }, read_truth: { state: "AVAILABLE", scope: "REQUEST" } }); finite(page);
      const detail = operationalWorkflow.parse(await f.service.workflow(f.principal, record.operationId));
      expect(detail.intent.operation_id).toBe(record.operationId); expect(detail.operation).toEqual(page.page.rows[0]);
      expect(detail.provenance_basis).toBe("SQL_EXACT_SOURCE_TIMESTAMP");
      expect(detail.intent).toMatchObject({ status: "BLOCKED", warnings: [], relay_receipt: null, source_side_effect_requested: false });
      expect(f.forbidden).not.toHaveBeenCalled(); finite(detail);
    });
  it("actual new F0 writer copies PostgreSQL created/updated timestamps exactly, without a JS Date round trip", async () => {
    const f = await fixture(), record = await f0(f);
    const observed = (await ctx.pool.query(`SELECT f.created_at=q.created_at AS exact_created,
      f.updated_at=q.updated_at AS exact_updated FROM execution_command_plans_f0 f
      JOIN execution_operation_queue_items q ON q.operation_id=f.operation_id AND q.workspace_id=f.workspace_id
      WHERE f.workspace_id=$1 AND f.operation_id=$2`, [f.workspace, record.operationId])).rows[0];
    expect(observed).toEqual({ exact_created: true, exact_updated: true });
    expect((await f.service.workflow(f.principal, record.operationId)).provenance_basis).toBe("SQL_EXACT_SOURCE_TIMESTAMP");
  });
  it("one accepted graph scopes tuple-kind AND target AND environment before both counts and page filters", async () => {
    const f = await fixture("ACCOUNT", "paper"), portfolio = { kind: "PORTFOLIO" as const, id: next() };
    await additional(f, portfolio, ["sandbox", "live"]);
    const visible = [await queue(f), await queue(f, { target: portfolio, environment: "sandbox" }), await queue(f, { target: portfolio, environment: "live" })];
    await queue(f, { target: portfolio, environment: "paper" }); await queue(f, { environment: "live" });
    await queue(f, { target: { kind: "DEPLOYMENT", id: f.target.id } }); await queue(f, { target: { ...portfolio, id: next() } });
    const page = await read(f); expect(page.page.total_count).toBe(3); expect(new Set(page.page.rows.map(x => x.operation_id))).toEqual(new Set(visible));
    const filtered = await read(f, { target_id: portfolio.id, environment: "SANDBOX" });
    expect(filtered.page).toMatchObject({ total_count: 3, filtered_count: 1 }); expect(filtered.page.rows[0].environment).toBe("SANDBOX");
    expect(filtered.page.applied_filters).toEqual(expect.arrayContaining([{ field: "target_id", op: "eq", value: portfolio.id }]));
  });
  it("qualified ROOT_SCOPE expands only its source census; exact descendant DENY preserves environment correlation", async () => {
    const f = await fixture("ACCOUNT", "paper"), root = next(), portfolio = { kind: "PORTFOLIO" as const, id: next() };
    Object.assign(f.relations, { roots: { [root]: [f.target, portfolio] } });
    await change(f, { selector: { kind: "ROOT_SCOPE", root_id: root }, environments: ["paper", "live"] });
    await f.grants.saveGrant({ ...f.grant, grant_id: next(), revision: next(), effect: "DENY",
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "PORTFOLIO", ids: [portfolio.id] }, environments: ["paper"] }, true);
    const visible = [await queue(f), await queue(f, { environment: "live" }), await queue(f, { target: portfolio, environment: "live" })];
    await queue(f, { target: portfolio, environment: "paper" }); await queue(f, { target: { ...portfolio, id: next() } });
    await queue(f, { environment: "sandbox" });
    const page = await read(f, { limit: "1" }); expect(page.page).toMatchObject({ total_count: 3, filtered_count: 3 });
    expect(page.page.rows).toHaveLength(1); expect(visible).toContain(page.page.rows[0].operation_id);
    const narrow = await read(f, { target_id: portfolio.id });
    expect(narrow.page).toMatchObject({ total_count: 3, filtered_count: 1 });
    expect(narrow.page.rows.map(x => [x.target.type, x.target.id, x.environment])).toEqual([["PORTFOLIO", portfolio.id, "LIVE"]]);
  });
  it("zero authorized rows is EMPTY; hidden rows, creator and global ADMIN do not grant a scope", async () => {
    const f = await fixture(); await queue(f, { target: { ...f.target, id: next() } });
    const empty = await read(f); expect(empty.page).toMatchObject({ total_count: 0, filtered_count: 0, rows: [] });
    expect(empty.read_truth).toEqual({ state: "EMPTY", reason_code: "NO_MATCHING_AUTHORIZED_PORTAL_OPERATIONS", scope: "REQUEST" });
    const own = await f0(f, { author: reader }); await change(f, { revoked_at_ms: Date.now() });
    await refusal(read(f), 404, "OPERATIONAL_READ_NOT_FOUND");
    await refusal(f.service.workflow(f.principal, own.operationId), 404, "OPERATIONAL_READ_NOT_FOUND");
    await refusal(f.service.queue({ ...f.principal, user: owner.user, session: owner.session }, query(f)), 404, "OPERATIONAL_READ_NOT_FOUND");
  });
  it.each(["app-only", "business-only", "revoked", "expired", "receipt-expired"] as const)("%s does not create current accepted audit authority", async variant => {
    const f = await fixture(); await queue(f);
    await change(f, variant === "app-only" ? { requires_ts_acceptance: false, ts_receipt: null } : variant === "business-only" ? { action: "business.read_all" }
      : variant === "revoked" ? { revoked_at_ms: Date.now() } : variant === "expired" ? { valid_until_ms: Date.now() - 1 }
        : { ts_receipt: { ...f.grant.ts_receipt!, expires_at_ms: Date.now() - 1 } });
    await refusal(read(f), 404, "OPERATIONAL_READ_NOT_FOUND");
  });
  it("wrong environment yields only the independently authorized empty cohort, never the retained wrong-env operation", async () => {
    const f = await fixture("ACCOUNT", "live"), record = await f0(f, { environment: "paper" });
    expect((await read(f)).page.rows).toEqual([]); await refusal(f.service.workflow(f.principal, record.operationId), 404, "OPERATIONAL_READ_NOT_FOUND");
  });
  it("unqualified source relations refuse before data disclosure rather than becoming a false empty", async () => {
    const f = await fixture(); await queue(f); Object.assign(f.relations, { qualified: false });
    await refusal(read(f), 503, "OPERATIONAL_READ_AUTHORITY_UNAVAILABLE");
  });
  it("present-invalid versioned source proof never falls back to otherwise valid legacy membership", async () => {
    const f = await fixture(); await queue(f); Object.assign(f.relations, { current_authority: null });
    await refusal(read(f), 404, "OPERATIONAL_READ_NOT_FOUND");
  });
  async function delegate(f: Fixture, effect: "ALLOW" | "DENY") {
    const parent: ScopedAccessGrant = { ...f.grant, grant_id: next(), subject_user_id: delegator.user.userId,
      action: "access.grant", delegable_actions: ["audit.read"], requires_ts_acceptance: false, ts_receipt: null,
      valid_from_ms: f.grant.valid_from_ms - 1000, valid_until_ms: f.grant.valid_until_ms! + 1000, revision: next() };
    await f.grants.saveGrant(parent, true);
    validateDelegation(await f.access.readContext(delegator.actor, f.workspace), { subject_user_id: reader.user.userId,
      action: "audit.read", effect, selector: f.grant.selector, environments: f.grant.environments,
      valid_from_ms: f.grant.valid_from_ms, valid_until_ms: f.grant.valid_until_ms, delegable_actions: [], ceiling_grant_id: parent.grant_id,
      expected_ceiling_revision: parent.revision, expected_policy_revision: f.policy.revision,
      expected_ts_membership_revision: f.membership.revision, reason: "TEST_ONLY complete operational delegation graph" });
    await f.grants.saveGrant({ ...f.grant, grant_id: next(), effect, parent_grant_id: parent.grant_id,
      issued_by: delegator.user.userId, revision: next() }, true); return parent;
  }
  it("complete delegated DENY wins even when an independent accepted ALLOW exists", async () => {
    const f = await fixture(); await queue(f); await delegate(f, "DENY");
    expect(evaluateAccess(await f.access.readContext(reader.actor, f.workspace), "audit.read", f.target, f.environment).allowed).toBe(false);
    await refusal(read(f), 404, "OPERATIONAL_READ_NOT_FOUND");
  });
  it("delegated audit retains its real app-only issuer ceiling and rejects the same reader after ancestor revoke", async () => {
    const f = await fixture(); await queue(f); const parent = await delegate(f, "ALLOW"); await change(f, { revoked_at_ms: Date.now() });
    expect((await read(f)).page.rows).toHaveLength(1);
    await f.grants.saveGrant({ ...parent, revision: next(), revoked_at_ms: Date.now() });
    await refusal(read(f), 404, "OPERATIONAL_READ_NOT_FOUND");
  });
  it("hidden peer oversized bytes cannot alter counts, page, cursors or turn a valid request into corruption503", async () => {
    const f = await fixture(); const visible = [await queue(f), await queue(f)];
    const first = await read(f, { limit: "1" }); const nextBefore = await read(f, { limit: "1", after: first.page.next_cursor! });
    await queue(f, { target: { ...f.target, id: next() }, key: secret.repeat(512) });
    await queue(f, { environment: "live", id: "x".repeat(512), key: secret.repeat(512) });
    const after = await read(f, { limit: "1", after: first.page.next_cursor! });
    expect(after.page.rows).toEqual(nextBefore.page.rows); expect(after.page.total_count).toBe(2);
    expect(new Set([first.page.rows[0].operation_id, after.page.rows[0].operation_id])).toEqual(new Set(visible)); finite(after);
  });
  it("actual fixed-six-digit µs and id ties paginate forward and backward without missing or duplicate roots", async () => {
    const f = await fixture(), time = "2026-01-02T03:04:05.";
    const ids = [await queue(f, { id: "TEST_ONLY:micro-z", time: `${time}000001Z` }),
      await queue(f, { id: "TEST_ONLY:micro-b", time: `${time}000002Z` }),
      await queue(f, { id: "TEST_ONLY:micro-a", time: `${time}000002Z` }),
      await queue(f, { id: "TEST_ONLY:micro-last", time: `${time}000003Z` })];
    // Shared engine inherits the primary sort direction for its ID tie-break.
    const expected = [ids[3], ids[1], ids[2], ids[0]];
    const first = await read(f, { limit: "2" }), last = await read(f, { limit: "2", after: first.page.next_cursor! });
    expect([...first.page.rows, ...last.page.rows].map(x => x.operation_id)).toEqual(expected);
    expect(first.page.rows[0].created_at).toBe(`${time}000003Z`); expect(last.page.has_more).toBe(false);
    const back = await read(f, { limit: "2", before: last.page.prev_cursor! }); expect(back.page.rows).toEqual(first.page.rows);
    const ascending = await read(f, { limit: "250", sort: "created_at:asc" });
    expect(ascending.page.rows.map(x => x.operation_id)).toEqual([ids[0], ids[2], ids[1], ids[3]]);
  });
  it("existing signed cursor binds filters, limit and the complete current cohort, not just target ids", async () => {
    const f = await fixture(); await queue(f); await queue(f);
    const token = (await read(f, { limit: "1" })).page.next_cursor!;
    await refusal(read(f, { limit: "2", after: token }), 409, "OPERATIONAL_READ_CHANGED");
    await refusal(read(f, { limit: "1", after: token, severity: "WARNING" }), 409, "OPERATIONAL_READ_CHANGED");
    await additional(f, { kind: "ACCOUNT", id: next() });
    await refusal(read(f, { limit: "1", after: token }), 409, "OPERATIONAL_READ_CHANGED");
    await refusal(read(f, { after: "not-a-keyset-cursor" }), 400, "OPERATIONAL_READ_CURSOR_INVALID");
  });
  it("visible oversize queue scalar is SQL NULL-bounded and safely refused, never silently omitted", async () => {
    const f = await fixture(); await queue(f, { key: secret.repeat(512) });
    expect((await ctx.pool.query("SELECT command_key FROM execution_operation_queue_v2 WHERE workspace_id=$1", [f.workspace])).rows[0].command_key).toBeNull();
    await refusal(read(f), 503, "OPERATIONAL_READ_UNAVAILABLE");
  });
  it("bare real Portal queue remains listable but does not invent F0 family detail or fall back to legacy", async () => {
    const f = await fixture(), id = await queue(f);
    expect((await read(f)).page.rows[0].operation_id).toBe(id);
    await refusal(f.service.workflow(f.principal, id), 503, "OPERATIONAL_READ_FAMILY_NOT_SUPPORTED");
    await refusal(f.service.workflow(f.principal, next()), 404, "OPERATIONAL_READ_NOT_FOUND");
  });
  it("finite generic detail rejects a real F0/queue identity mismatch instead of blessing a same-id join", async () => {
    const f = await fixture(), target = { kind: "ACCOUNT" as const, id: next() }; await additional(f, target);
    const id = next(), now = new Date();
    await ctx.pool.query(`INSERT INTO execution_command_plans_f0(operation_id,workspace_id,actor_user_id,request_key,command_key,
      environment,target_type,target_id,expected_target_version,payload_hash,plan_digest,payload_json,conditions,risk_tier,
      blocker_codes,warning_codes,expires_at,created_at,updated_at)
      VALUES($1,$2,$3,$1,'account/sync','PAPER',$4,$5,1,$6,$7,'{}','[]','R2_SANDBOX',ARRAY['COMMAND_RELAY_DISABLED'],ARRAY[]::text[],$8,$9,$9)`,
    [id, f.workspace, other.user.userId, f.target.kind, f.target.id, accessDigest(secret), accessDigest("TEST_ONLY mismatch"), new Date(Date.now() + 300_000), now]);
    await queue(f, { id, target, time: now.toISOString() });
    await refusal(f.service.workflow(f.principal, id), 503, "OPERATIONAL_READ_PROVENANCE_INVALID");
  });
  it.each(["known-millisecond-copy", "larger-mismatch"] as const)("historical %s has an explicit provenance disposition without rewriting history", async variant => {
    const f = await fixture(), id = next(), sourceTime = "2026-01-02T03:04:05.123456Z";
    const queueTime = variant === "known-millisecond-copy" ? "2026-01-02T03:04:05.123000Z" : "2026-01-02T03:04:05.125000Z";
    await ctx.pool.query(`INSERT INTO execution_command_plans_f0(operation_id,workspace_id,actor_user_id,request_key,command_key,
      environment,target_type,target_id,expected_target_version,payload_hash,plan_digest,payload_json,conditions,risk_tier,
      blocker_codes,warning_codes,expires_at,created_at,updated_at)
      VALUES($1,$2,$3,$1,'account/sync','PAPER',$4,$5,1,$6,$7,'{}','[]','R2_SANDBOX',ARRAY['COMMAND_RELAY_DISABLED'],ARRAY[]::text[],
      clock_timestamp()+interval '1 hour',$8,$8)`, [id, f.workspace, other.user.userId, f.target.kind, f.target.id,
      accessDigest(secret), accessDigest("TEST_ONLY known prior Date writer"), sourceTime]);
    await queue(f, { id, time: queueTime });
    const before = (await ctx.pool.query(`SELECT to_char(f.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS f0,
      to_char(q.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS queue
      FROM execution_command_plans_f0 f JOIN execution_operation_queue_items q USING(operation_id,workspace_id)
      WHERE f.workspace_id=$1 AND f.operation_id=$2`, [f.workspace, id])).rows[0];
    expect(before).toEqual({ f0: sourceTime, queue: queueTime });
    if (variant === "known-millisecond-copy") {
      const detail = operationalWorkflow.parse(await f.service.workflow(f.principal, id));
      expect(detail.provenance_basis).toBe("LEGACY_DATE_MILLISECOND_COPY");
      expect(detail.intent.operation_id).toBe(id);
    } else await refusal(f.service.workflow(f.principal, id), 503, "OPERATIONAL_READ_PROVENANCE_INVALID");
    const unchanged = (await ctx.pool.query(`SELECT f.created_at=$3::timestamptz AND q.created_at=$4::timestamptz AS same
      FROM execution_command_plans_f0 f JOIN execution_operation_queue_items q USING(operation_id,workspace_id)
      WHERE f.workspace_id=$1 AND f.operation_id=$2`, [f.workspace, id, sourceTime, queueTime])).rows[0];
    expect(unchanged).toEqual({ same: true });
  });
  async function governanceCollision(workspaceId: string, operationId: string) {
    const approval = next(), hash = accessDigest("TEST_ONLY genuine bounded governance collision");
    await ctx.pool.query(`INSERT INTO governance_approval_requests(approval_id,workspace_id,gate,subject_type,subject_id,
      subject_label,environment,target_label,requester_user_id,requester_username,artifact_creator_user_id,
      artifact_creator_username,status,policy_version,quorum_required,evidence_set_hash,evidence_complete,
      sla_due_at,expires_at) VALUES($1,$2,'R1','ALPHA_VERSION',$3,'TEST_ONLY','RESEARCH','TEST_ONLY',$4,$5,$4,$5,
      'PENDING','TEST_ONLY',1,$6,true,clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours')`,
    [approval, workspaceId, next(), other.user.userId, other.username, hash]);
    await ctx.pool.query(`INSERT INTO governance_decision_plans(operation_id,workspace_id,approval_id,actor_user_id,request_key,
      command_type,command_version,payload_hash,decision,reason,expected_approval_version,quorum_required,evidence_set_hash,
      evidence_hashes,apply_key_id,apply_token_hash,status,expires_at)
      VALUES($1,$2,$3,$4,$5,'GOVERNANCE_R1_DECISION',1,$6,'APPROVE','TEST_ONLY collision fixture',1,1,$6,
      ARRAY[$6]::text[],'TEST_ONLY',$7,'PLANNED',clock_timestamp()+interval '1 hour')`,
    [operationId, workspaceId, approval, other.user.userId, next(), hash, "a".repeat(64)]);
  }
  it.each(["same", "other"] as const)("%s-workspace family collision has only its authorized provenance effect", async where => {
    const f = await fixture(), record = await f0(f), initial = await f.service.workflow(f.principal, record.operationId);
    await governanceCollision(where === "same" ? f.workspace : await workspace(), record.operationId);
    if (where === "same") await refusal(f.service.workflow(f.principal, record.operationId), 404, "OPERATIONAL_READ_NOT_FOUND");
    else {
      const current = await f.service.workflow(f.principal, record.operationId);
      expect({ ...current, observed_at_ms: 0 }).toEqual({ ...initial, observed_at_ms: 0 });
    }
  });
  it("Incident exposes current exact root only and explicitly refuses to attest historical children", async () => {
    const f = await fixture(), id = await incident(f);
    const value = operationalIncident.parse(await f.service.incident(f.principal, id));
    expect(value).toMatchObject({ incident_id: id, record_authority: "PORTAL", record_basis: "CURRENT_ROOT_NOT_HISTORICAL_LINEAGE",
      target: { type: f.target.kind, id: f.target.id }, workflow_version: 1, source_side_effect_requested: false, deployment_resume_requested: false,
      historical_children: { availability: "NOT_PUBLISHED", reason_code: "ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED" } });
    expect(JSON.stringify(value)).not.toMatch(new RegExp(`${secret}|title|summary|annotations|sha256|opened_by|assigned_to|operation_links|counts`));
    await refusal(f.service.incident(f.principal, await incident(f, { ...f.target, id: next() })), 404, "OPERATIONAL_READ_NOT_FOUND");
    await refusal(f.service.incident(f.principal, next()), 404, "OPERATIONAL_READ_NOT_FOUND");
  });
  it.each(["target_id", "target_type", "environment"] as const)("forward Incident %s guard is immutable without old-child rewrite", async field => {
    const f = await fixture(), id = await incident(f), value = field === "target_id" ? next() : field === "target_type" ? "ACCOUNT" : "LIVE";
    await expect(ctx.pool.query(`UPDATE execution_incidents SET ${field}=$2,workflow_version=workflow_version+1 WHERE incident_id=$1`, [id, value])).rejects.toThrow(/identity\/authority is immutable/);
    expect((await ctx.pool.query("SELECT workflow_version FROM execution_incidents WHERE incident_id=$1", [id])).rows[0].workflow_version).toBe(1);
  });
  it("Incident root version changing after read is caught before final current authority confirmation", async () => {
    const f = await fixture(), id = await incident(f), prepared = await f.service.prepareIncident(f.principal, id);
    await ctx.pool.query("UPDATE execution_incidents SET workflow_version=workflow_version+1,updated_at=clock_timestamp() WHERE incident_id=$1", [id]);
    await refusal(f.service.finish(prepared), 409, "OPERATIONAL_READ_CHANGED");
  });
  it("private issuer-bound prepared bodies cannot be reconstructed or consumed twice", async () => {
    const f = await fixture(), sibling = await fixture(); await queue(f);
    const handle = await f.service.prepareQueue(f.principal, query(f));
    await refusal(sibling.service.finish(handle), 503, "OPERATIONAL_READ_SCOPE_REQUIRED");
    expect(operationalQueue.parse(await f.service.finish(handle)).page.rows).toHaveLength(1);
    await refusal(f.service.finish(handle), 503, "OPERATIONAL_READ_SCOPE_REQUIRED");
  });
  it.each(["success", "bad-cursor", "visible-corrupt"] as const)("prepared %s is held until the complete real revoke fence", async variant => {
    const f = await fixture(); await queue(f, { key: variant === "visible-corrupt" ? secret.repeat(512) : undefined });
    const prepared = await f.service.prepareQueue(f.principal, query(f, variant === "bad-cursor" ? { after: "bad" } : {}));
    await change(f, { revoked_at_ms: Date.now() });
    await refusal(f.service.finish(prepared), 404, "OPERATIONAL_READ_NOT_FOUND");
  });
  it("Core revoke during the final actual relation await is observed after that await, not only before it", async () => {
    const f = await fixture(); await queue(f);
    const prepared = await f.service.prepareQueue(f.principal, query(f));
    const raced = vi.mocked(f.trust.relations).mockImplementationOnce(async () => {
      await change(f, { revoked_at_ms: Date.now() }); return structuredClone(f.relations);
    });
    await refusal(f.service.finish(prepared), 409, "OPERATIONAL_READ_CHANGED");
    expect(raced).toHaveBeenCalled();
  });
  it.each(["session", "membership"] as const)("actual %s removal after body selection cannot deliver the held body", async variant => {
    const f = await fixture(); await queue(f);
    const login = await auth.login({ assertion: reader.username, username: reader.username, credential: password });
    const session = (await auth.sessionFromToken(login.token))!, principal = { ...f.principal, session };
    const prepared = await f.service.prepareQueue(principal, query(f));
    if (variant === "session") await ctx.pool.query(`UPDATE auth_sessions SET state='REVOKED',revoked_at=clock_timestamp(),
      revoke_reason='TEST_ONLY operational current fence' WHERE session_id=$1`, [session.sessionId]);
    else await ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [f.workspace, reader.user.userId]);
    await refusal(f.service.finish(prepared), variant === "session" ? 403 : 404,
      variant === "session" ? "OPERATIONAL_READ_AUTHORITY_REQUIRED" : "OPERATIONAL_READ_NOT_FOUND");
  });
  it("a safe dependency refusal is also re-fenced; raw SQL/provider prose is never the response", async () => {
    const f = await fixture(), original = f.repository.workflow.bind(f.repository); await f0(f);
    const held = vi.spyOn(f.repository, "workflow").mockImplementation(async (...args) => {
      await original(...args); await change(f, { revoked_at_ms: Date.now() }); throw new Error(`SELECT private_relation ${secret}`);
    });
    try { await refusal(f.service.workflow(f.principal, next()), 404, "OPERATIONAL_READ_NOT_FOUND"); }
    finally { held.mockRestore(); }
  });
  it("real session lease can renew during the released SQL interval without a false cohort change", async () => {
    const f = await fixture(); await queue(f);
    const login = await auth.login({ assertion: reader.username, username: reader.username, credential: password });
    const session = (await auth.sessionFromToken(login.token))!, principal = { ...f.principal, session };
    const old = Number((await ctx.pool.query(`UPDATE auth_sessions SET idle_expires_at=clock_timestamp()+interval '60 seconds'
      WHERE session_id=$1 RETURNING floor(extract(epoch FROM idle_expires_at)*1000)::bigint AS ms`, [session.sessionId])).rows[0].ms);
    const prepared = await f.service.prepareQueue(principal, query(f));
    await new SessionsRepository(ctx.pool).markSeen(session.sessionId);
    const current = (await auth.sessionFromToken(login.token))!; expect(current.idleExpiresAt.getTime()).toBeGreaterThan(old);
    expect(operationalQueue.parse(await f.service.finish(prepared)).page.rows).toHaveLength(1);
  });
  it("natural lease expiry after genuine final DB capture wins even over a previously held input refusal", async () => {
    const f = await fixture(); await queue(f);
    const login = await auth.login({ assertion: reader.username, username: reader.username, credential: password });
    const session = (await auth.sessionFromToken(login.token))!, principal = { ...f.principal, session };
    const original = f.access.confirmReadContext.bind(f.access); let deadline = 0;
    const delayed = vi.spyOn(f.access, "confirmReadContext").mockImplementation(async (...args) => {
      deadline = Number((await ctx.pool.query(`UPDATE auth_sessions SET idle_expires_at=clock_timestamp()+interval '1500 milliseconds'
        WHERE session_id=$1 AND state='ACTIVE' RETURNING floor(extract(epoch FROM least(idle_expires_at,absolute_expires_at))*1000)::bigint AS ms`,
      [session.sessionId])).rows[0].ms);
      const current = await original(...args); expect(current.actor_lease_until_ms).toBe(deadline);
      const delay = deadline - Date.now() + 10; expect(delay).toBeGreaterThan(0); expect(delay).toBeLessThan(2600);
      await new Promise(resolve => setTimeout(resolve, delay)); return current;
    });
    try { await refusal(f.service.queue(principal, query(f, { assigned_to: "me" })), 403, "OPERATIONAL_READ_AUTHORITY_REQUIRED");
      expect(Date.now()).toBeGreaterThanOrEqual(deadline); }
    finally { delayed.mockRestore(); }
  }, 10_000);
  it.each(["lease", "transition"] as const)("terminal %s clock after synchronous final proof still wins over a held input refusal", async variant => {
    const f = await fixture(); await queue(f); let transition = 0;
    if (variant === "transition") {
      transition = await dbNow() + 60_000;
      await f.grants.saveGrant({ ...f.grant, grant_id: next(), revision: next(), effect: "DENY", valid_from_ms: transition }, true);
    }
    const prepared = await f.service.prepareQueue(f.principal, query(f, { assigned_to: "me" }));
    const original = f.access.confirmReadContext.bind(f.access); let calls = 0;
    let restoreClock: (() => void) | undefined;
    const confirmation = vi.spyOn(f.access, "confirmReadContext").mockImplementation(async (...args) => {
      const current = await original(...args), deadline = variant === "lease" ? current.actor_lease_until_ms! : transition;
      // Keep the genuine last DB context unchanged. Only the wall clock moves
      // at the final synchronous response check; no fake lease or entitlement.
      // Context projection, cohort lease, then target evaluation each sample
      // the clock first. Cross the boundary only on the fourth, terminal
      // sample; an earlier jump correctly activates DENY inside evaluation.
      const clock = vi.spyOn(Date, "now").mockImplementation(() => ++calls <= 3 ? current.now_ms : deadline);
      restoreClock = () => clock.mockRestore();
      return current;
    });
    try {
      await refusal(f.service.finish(prepared), variant === "lease" ? 403 : 409,
        variant === "lease" ? "OPERATIONAL_READ_AUTHORITY_REQUIRED" : "OPERATIONAL_READ_CHANGED");
      expect(calls).toBeGreaterThanOrEqual(4);
    } finally { restoreClock?.(); confirmation.mockRestore(); }
  });
  it("query and repository release read-only repeatable-read transactions before the final Core confirmation", async () => {
    const f = await fixture(), record = await f0(f); const observed: Array<{ sql: string; readonly: string; isolation: string; timeout: string }> = [];
    let open = 0;
    const pool = { connect: async () => {
      const db = await ctx.pool.connect(); open++;
      return { query: async (sql: string, params: unknown[] = []) => {
        if (/FROM\s+"?execution_operation_queue_v2\b/i.test(sql)) observed.push({ sql,
          readonly: (await db.query("SHOW transaction_read_only")).rows[0].transaction_read_only,
          isolation: (await db.query("SHOW transaction_isolation")).rows[0].transaction_isolation,
          timeout: (await db.query("SHOW statement_timeout")).rows[0].statement_timeout });
        return db.query(sql, params);
      }, release: () => { db.release(); open--; } } as unknown as PoolClient;
    } } as unknown as Pool;
    const service = new OperationalReadService(new OperationalReadRepository(pool), f.access, f.scopes, f.config);
    const original = f.access.confirmReadContext.bind(f.access), confirm = vi.spyOn(f.access, "confirmReadContext").mockImplementation(async (...args) => {
      expect(open).toBe(0); expect(observed.length).toBeGreaterThan(0); return original(...args);
    });
    try { await service.queue(f.principal, query(f)); await service.workflow(f.principal, record.operationId); expect(confirm).toHaveBeenCalledTimes(2);
      for (const record of observed) { expect(record).toMatchObject({ readonly: "on", isolation: "repeatable read", timeout: "2s" });
        expect(record.sql).toMatch(/target_type/); expect(record.sql).toMatch(/target_id/); expect(record.sql).toMatch(/environment/);
        expect(record.sql).not.toMatch(/username|incident|payload_hash|plan_digest|FOR\s+UPDATE/i); }
    } finally { confirm.mockRestore(); }
  });

  async function mounted(f: Fixture, run: (http: FastifyInstance, headers: Record<string, string>) => Promise<void>) {
    const legacy = { list: vi.fn(() => { throw new Error(secret); }), detail: vi.fn(() => { throw new Error(secret); }),
      operation: vi.fn(() => { throw new Error(secret); }), operationOrNull: vi.fn(() => { throw new Error(secret); }) };
    const compositions = new OperationalCompositionService(f.config,
      { sourceHealth: f.forbidden } as never,
      { snapshot: f.forbidden, snapshotMetadata: f.forbidden, rawSnapshot: f.forbidden } as never,
      legacy as never, legacy as never, legacy as never, legacy as never, legacy as never, legacy as never,
      new WorkspacesRepository(ctx.pool, f.config), f.scopes, f.service);
    const app = await NestFactory.create<NestFastifyApplication>({ module: OperationalCurrentTestModule,
      controllers: [GovernanceController, IncidentController, OperationalCompositionController], providers: [SessionGuard,
        { provide: AuthService, useValue: auth }, { provide: CONTROL_API_CONFIG, useValue: f.config },
        { provide: WorkspacesRepository, useValue: new WorkspacesRepository(ctx.pool, f.config) },
        { provide: GovernanceService, useValue: legacy }, { provide: PaperExitService, useValue: legacy },
        { provide: GovernanceReviewCaptureService, useValue: legacy }, { provide: ExecutionOperationsService, useValue: legacy },
        { provide: OperationsWorkflowService, useValue: legacy }, { provide: IncidentService, useValue: legacy },
        { provide: ExecutionReadScopes, useValue: f.scopes }, { provide: OperationalReadService, useValue: f.service },
        { provide: OperationalCompositionService, useValue: compositions }] },
    new FastifyAdapter(), { logger: false, abortOnError: false });
    try {
      app.useGlobalFilters(new HttpErrorFilter()); await app.register(cookiePlugin as never); await app.init();
      await app.getHttpAdapter().getInstance().ready();
      await run(app.getHttpAdapter().getInstance() as FastifyInstance, {
        cookie: `${SESSION_COOKIE}=${reader.login.token}`, "x-request-id": "TEST_ONLY-current-operational" });
      for (const call of Object.values(legacy)) expect(call).not.toHaveBeenCalled();
    } finally { await app.close(); }
  }
  function httpError(r: Response, status: number, code: string) {
    expect(r.statusCode).toBe(status); expect(r.headers["cache-control"]).toBe("private, no-store");
    expect(r.json()).toMatchObject({ error: { code }, request_id: "TEST_ONLY-current-operational" });
    expect(r.body).not.toMatch(new RegExp(`${secret}|private_relation|ZodError|QueryContractError|stack|HMAC`));
  }
  it("actual SessionGuard/controllers serve finite V2 queue/detail/Incident and never legacy fallback", async () => {
    const f = await fixture(), record = await f0(f), id = await incident(f), ws = `workspace_id=${encodeURIComponent(f.workspace)}`;
    await mounted(f, async (http, headers) => {
      const list = await http.inject({ method: "GET", headers, url: `/api/v1/execution/operations?${ws}&limit=250` });
      expect(list.statusCode).toBe(200); expect(list.headers["cache-control"]).toBe("private, no-store");
      expect(operationalQueue.parse(list.json()).page.rows[0].operation_id).toBe(record.operationId);
      const detail = await http.inject({ method: "GET", headers, url: `/api/v1/execution/operations/${record.operationId}?${ws}` });
      expect(detail.statusCode).toBe(200); operationalWorkflow.parse(detail.json());
      const root = await http.inject({ method: "GET", headers, url: `/api/v1/execution/operations/incidents/${id}?${ws}` });
      expect(root.statusCode).toBe(200); operationalIncident.parse(root.json());
      for (const [path, bodyKey] of [["operations", "operations_queue"], [`incidents/${id}`, "incident"]] as const) {
        const result = await http.inject({ method: "GET", headers, url: `/api/v1/execution/compositions/${path}?${ws}` });
        expect(result.statusCode).toBe(200); expect(result.headers["cache-control"]).toBe("private, no-store");
        expect(result.json()).toMatchObject({ record_authority: "PORTAL_CONTROL", source_authority: "PORTAL_CONTROL_ONLY",
          workspace_id: f.workspace, source_health: { state: "UNAVAILABLE", reason_code: "CURRENT_AUDIT_SOURCE_PURPOSE_NOT_QUALIFIED" },
          redacted_command_journal: { state: "UNAVAILABLE", reason_code: "CURRENT_AUDIT_SOURCE_PURPOSE_NOT_QUALIFIED" } });
        const body = result.json<{ data: Record<string, unknown> }>().data[bodyKey];
        if (bodyKey === "operations_queue") operationalQueue.parse(body); else operationalIncident.parse(body);
      }
      expect(f.forbidden).not.toHaveBeenCalled();
      httpError(await http.inject({ method: "GET", headers, url: `/api/v1/execution/operations?${ws}&assigned_to=me` }), 400, "OPERATIONAL_READ_FILTER_NOT_SUPPORTED");
      httpError(await http.inject({ method: "GET", headers, url: `/api/v1/execution/operations?${ws}&after=bad` }), 400, "OPERATIONAL_READ_CURSOR_INVALID");
      httpError(await http.inject({ method: "GET", headers, url: `/api/v1/execution/operations/${next()}?${ws}` }), 404, "OPERATIONAL_READ_NOT_FOUND");
      await change(f, { revoked_at_ms: Date.now() });
      httpError(await http.inject({ method: "GET", headers, url: `/api/v1/execution/operations?${ws}` }), 404, "OPERATIONAL_READ_NOT_FOUND");
    });
  });
  it("unchanged multipage composition keeps its public revision when signed cursor issuance advances", async () => {
    const f = await fixture(); await queue(f); await queue(f); await queue(f);
    const ws = `workspace_id=${encodeURIComponent(f.workspace)}`;
    await mounted(f, async (http, headers) => {
      const url = `/api/v1/execution/compositions/operations?${ws}&limit=1`;
      const first = await http.inject({ method: "GET", headers, url }); expect(first.statusCode).toBe(200);
      const a = first.json<{ composite_revision: string; lineage: { workflow_digest: string }; data: { operations_queue: OperationalQueue } }>();
      expect(a.data.operations_queue.page).toMatchObject({ total_count: 3, filtered_count: 3, has_more: true });
      const tokenA = a.data.operations_queue.page.next_cursor!;
      // Bounded +2s observation offset exercises issuance changing without
      // expiring/reviving any real session, grant or source receipt. No timer,
      // engine run, database authority rewrite or fake Core context is used.
      const realNow = Date.now.bind(Date), shifted = realNow() + 2000;
      expect(Math.min(reader.session.idleExpiresAt.getTime(), reader.session.absoluteExpiresAt.getTime(),
        f.grant.valid_until_ms!, f.grant.ts_receipt!.expires_at_ms!)).toBeGreaterThan(shifted + 10_000);
      const clock = vi.spyOn(Date, "now").mockImplementation(() => realNow() + 2000);
      try {
        const second = await http.inject({ method: "GET", headers, url }); expect(second.statusCode).toBe(200);
        const b = second.json<typeof a>(), tokenB = b.data.operations_queue.page.next_cursor!;
        expect(tokenB).not.toBe(tokenA);
        const issuedAt = (token: string) => JSON.parse(Buffer.from(token.split(".")[2], "base64url").toString("utf8")).issued_at;
        expect(issuedAt(tokenB) - issuedAt(tokenA)).toBeGreaterThanOrEqual(2);
        expect(b.data.operations_queue.page.rows).toEqual(a.data.operations_queue.page.rows);
        expect(b.composite_revision).toBe(a.composite_revision); expect(b.lineage.workflow_digest).toBe(a.lineage.workflow_digest);
      } finally { clock.mockRestore(); }
    });
  });
  it("finite schemas reject unapproved actor/prose/history extensions instead of accepting and hiding them", async () => {
    const f = await fixture(), record = await f0(f), id = await incident(f);
    const page = await read(f), detail = await f.service.workflow(f.principal, record.operationId), root = await f.service.incident(f.principal, id);
    expect(operationalQueue.safeParse({ ...page, hidden_peer_count: 0 }).success).toBe(false);
    expect(operationalQueue.safeParse({ ...page, page: { ...page.page, rows: [{ ...page.page.rows[0], actor_user_id: other.user.userId }] } }).success).toBe(false);
    expect(operationalWorkflow.safeParse({ ...detail, payload_json: {} }).success).toBe(false);
    expect(operationalIncident.safeParse({ ...root, annotations: [] }).success).toBe(false);
    expect(operationalIncident.safeParse({ ...root, historical_children: { ...root.historical_children, count: 0 } }).success).toBe(false);
  });
  it("all reader paths preserve Portal workflow, original plan, audit and grant ledgers byte-for-byte", async () => {
    const f = await fixture(), record = await f0(f), id = await incident(f);
    async function digests() {
      const snapshot: Record<string, string> = {};
      for (const table of ["execution_command_plans_f0", "execution_operation_queue_items", "execution_operation_workflow_events",
        "execution_incidents", "execution_incident_annotations", "execution_incident_evidence", "execution_incident_events",
        "product_audit_events", "portal_access_grants_v2", "portal_access_policy_state", "portal_access_policy_events"]) {
        snapshot[table] = (await ctx.pool.query(`SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text) AS digest
          FROM ${table} t WHERE workspace_id=$1`, [f.workspace])).rows[0].digest;
      }
      return snapshot;
    }
    const before = await digests(); await read(f); await f.service.workflow(f.principal, record.operationId); await f.service.incident(f.principal, id);
    await refusal(read(f, { assigned_to: "me" }), 400, "OPERATIONAL_READ_FILTER_NOT_SUPPORTED");
    await refusal(read(f, { after: "bad" }), 400, "OPERATIONAL_READ_CURSOR_INVALID");
    expect(await digests()).toEqual(before); expect(f.forbidden).not.toHaveBeenCalled();
  });
});
