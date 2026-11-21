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
import { PositiveParentRepository } from "../src/governance/positive-parent.repository";
import { PositiveParentReads } from "../src/governance/positive-parent.service";
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
    key?: string; time?: string; source?: "PORTAL" | "EXECUTION" | "BROKER"; status?: string; verification?: string;
    severity?: string; triage?: "UNACKNOWLEDGED" | "ACKNOWLEDGED" | "RESOLVED" } = {}) {
    const id = q.id ?? next(), target = q.target ?? f.target, time = q.time ?? "2026-01-02T03:04:05.000000Z", triage = q.triage ?? "UNACKNOWLEDGED";
    await ctx.pool.query(`INSERT INTO execution_operation_queue_items(operation_id,workspace_id,operation_kind,
      command_key,environment,target_type,target_id,risk_tier,severity,source_authority,source_status,
      verification_result,triage_state,workflow_version,created_at,updated_at,acknowledged_at,acknowledged_by_user_id,
      resolved_at,resolved_by_user_id,resolution_reason,resolution_evidence_hash)
      VALUES($1,$2,'EXECUTION_COMMAND',$3,$4,$5,$6,'R2_SANDBOX',$9,$7,$10,$11,$12,1,$8,$8,
      CASE WHEN $12<>'UNACKNOWLEDGED' THEN $8::timestamptz END, CASE WHEN $12<>'UNACKNOWLEDGED' THEN $13 END,
      CASE WHEN $12='RESOLVED' THEN $8::timestamptz END, CASE WHEN $12='RESOLVED' THEN $13 END,
      CASE WHEN $12='RESOLVED' THEN 'TEST_ONLY resolution reason' END, CASE WHEN $12='RESOLVED' THEN $14 END)`,
    [id, f.workspace, q.key ?? "account/sync", (q.environment ?? f.environment).toUpperCase(), target.kind, target.id, q.source ?? "PORTAL", time,
      q.severity ?? "WARNING", q.status ?? "BLOCKED", q.verification ?? "NOT_STARTED", triage, other.user.userId, accessDigest("TEST_ONLY resolution")]);
    return id;
  }
  async function incident(f: Fixture, target: { kind: string; id: string } = f.target, env: Environment = f.environment, fixedId?: string) {
    const id = fixedId ?? next();
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
  async function link(f: Fixture, incidentId: string, operationId: string, at?: string,
    relationship: "TRIGGERED_BY" | "MITIGATES" | "RELATED" = "TRIGGERED_BY", workspaceId = f.workspace) {
    await ctx.pool.query(`INSERT INTO execution_incident_operation_links(incident_id,workspace_id,operation_id,relationship,linked_by_user_id,created_at)
      VALUES($1,$2,$3,$4,$5,COALESCE($6::timestamptz,clock_timestamp()))`, [incidentId, workspaceId, operationId, relationship, other.user.userId, at ?? null]);
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
      expect(detail.intent.operation_id).toBe(record.operationId); { const { incident_links, ...row } = page.page.rows[0]; // FE-042 extends the queue ROW only; the detail item is unextended
        expect(detail.operation).toEqual(row); expect(incident_links).toMatchObject({ authorized_link_count: 0, items: [] }); }
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
  // ---- FE-042 incident links / FE-043 status counts -------------------------------------------
  const linksOf = (page: OperationalQueue, id: string) => page.page.rows.find(row => row.operation_id === id)!.incident_links!;
  const linkedIds = (links: { items: Array<{ state: string; incident_id?: string }> }) => links.items.map(item => item.incident_id);
  it("FE-042 lists only incidents whose OWN target is authorized: operation access never implies incident access", async () => {
    const f = await fixture("ACCOUNT", "paper"), second = { kind: "PORTFOLIO" as const, id: next() }, hiddenTarget = { kind: "PORTFOLIO" as const, id: next() };
    await additional(f, second);
    const op = await queue(f), shown = await incident(f), alsoShown = await incident(f, second), hidden = await incident(f, hiddenTarget);
    const wrongEnv = await incident(f, f.target, "live"), unsupported = await incident(f, { kind: "SYSTEM", id: f.target.id });
    for (const [index, id] of [shown, alsoShown, hidden, wrongEnv, unsupported].entries())
      await link(f, id, op, `2026-01-02T03:04:0${index}.000000Z`);
    const page = await read(f), links = linksOf(page, op);
    // Newest authorized first; the three unauthorized incidents are neither listed nor counted.
    expect(linkedIds(links)).toEqual([alsoShown, shown]); expect(links).toMatchObject({ authorized_link_count: 2, truncated: false, bound: 3,
      basis: "CURRENT_LINK_ROWS_AUTHORIZED_INCIDENTS_ONLY" });
    expect(links.items[0]).toMatchObject({ state: "LINKED", relationship: "TRIGGERED_BY", incident: { target: { type: "PORTFOLIO", id: second.id },
      environment: "PAPER", severity: "WARNING", workflow_state: "OPEN" }, link_history: { availability: "NOT_PUBLISHED", reason_code: "ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED" } });
    const text = JSON.stringify(page);
    for (const absent of [hidden, wrongEnv, unsupported, hiddenTarget.id, secret]) expect(text).not.toContain(absent);
    expect(page.page.rows[0]).not.toHaveProperty("incident_id"); // no single guessed "the" incident
  });
  it("FE-042 operation authorized but incident NOT authorized yields an explicit empty set that discloses nothing", async () => {
    const f = await fixture(), op = await queue(f), foreign = await incident(f, { kind: "ACCOUNT", id: next() });
    await link(f, foreign, op);
    const page = await read(f), links = linksOf(page, op);
    expect(links).toEqual({ basis: "CURRENT_LINK_ROWS_AUTHORIZED_INCIDENTS_ONLY", bound: 3, authorized_link_count: 0, truncated: false, items: [] });
    expect(JSON.stringify(page)).not.toContain(foreign);
  });
  it("FE-042 incident authorized but operation NOT authorized: the operation (and so its links) is never returned", async () => {
    const f = await fixture(), hiddenTarget = { kind: "ACCOUNT" as const, id: next() };
    const op = await queue(f, { target: hiddenTarget }), visible = await incident(f); await link(f, visible, op);
    const page = await read(f); expect(page.page.rows).toEqual([]); expect(JSON.stringify(page)).not.toContain(visible);
  });
  it("FE-042 bound of 3 is applied AFTER authorization, newest first with a byte-order tie-break, and states truncation", async () => {
    const f = await fixture(), op = await queue(f), hiddenTarget = { kind: "ACCOUNT" as const, id: next() };
    const ids: string[] = [];
    for (let index = 0; index < 5; index += 1) ids.push(await incident(f, f.target, f.environment, `TEST_ONLY:tie-${index}`));
    // Two share a timestamp: incident id DESC in byte order decides. Unauthorized newer links do not use up slots.
    const times = ["2026-01-02T03:04:01.000001Z", "2026-01-02T03:04:02.000002Z", "2026-01-02T03:04:02.000002Z", "2026-01-02T03:04:00.000009Z", "2026-01-02T03:04:03.000001Z"];
    for (const [index, id] of ids.entries()) await link(f, id, op, times[index]);
    for (let index = 0; index < 4; index += 1) await link(f, await incident(f, hiddenTarget), op, "2026-01-02T03:05:00.000000Z");
    const links = linksOf(await read(f), op);
    expect(linkedIds(links)).toEqual(["TEST_ONLY:tie-4", "TEST_ONLY:tie-2", "TEST_ONLY:tie-1"]);
    expect(links).toMatchObject({ authorized_link_count: 5, truncated: true }); expect(links.items).toHaveLength(3);
  });
  it("FE-042 an authorized link whose incident id cannot be represented is a typed NOT_ATTESTED slot, never dropped", async () => {
    const f = await fixture(), op = await queue(f), good = await incident(f), odd = await incident(f, f.target, f.environment, "x".repeat(200));
    await link(f, good, op, "2026-01-02T03:04:01.000000Z"); await link(f, odd, op, "2026-01-02T03:04:02.000000Z");
    const links = linksOf(await read(f), op);
    expect(links).toMatchObject({ authorized_link_count: 2, truncated: false });
    expect(links.items[0]).toEqual({ state: "NOT_ATTESTED", reason_code: "INCIDENT_LINK_IDENTITY_NOT_REPRESENTABLE",
      link_history: { availability: "NOT_PUBLISHED", reason_code: "ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED" } });
    expect(links.items[1]).toMatchObject({ state: "LINKED", incident_id: good }); expect(JSON.stringify(links)).not.toContain("xxxxxxxxxx");
  });
  it("FE-042 another workspace's incident, link or same-named target never appears and a foreign workspace_id is refused", async () => {
    const f = await fixture(), op = await queue(f), other_ws = await workspace();
    const foreignOp = await queue({ ...f, workspace: other_ws } as Fixture), foreignIncident = await incident({ ...f, workspace: other_ws } as Fixture);
    await link({ ...f, workspace: other_ws } as Fixture, foreignIncident, foreignOp, undefined, "TRIGGERED_BY", other_ws);
    const page = await read(f);
    expect(page.page.rows.map(row => row.operation_id)).toEqual([op]); expect(linksOf(page, op).items).toEqual([]);
    expect(JSON.stringify(page)).not.toContain(foreignIncident); expect(JSON.stringify(page)).not.toContain(foreignOp);
    await refusal(f.service.queue(f.principal, { workspace_id: other_ws }), 400, "OPERATIONAL_READ_INPUT_INVALID");
  });
  it("FE-042 revoking the INCIDENT end's grant while a page is held refuses the held body", async () => {
    const f = await fixture("ACCOUNT", "paper"), second = { kind: "PORTFOLIO" as const, id: next() }, op = await queue(f);
    const grant = await additional(f, second); await link(f, await incident(f, second), op);
    const prepared = await f.service.prepareQueue(f.principal, query(f));
    await f.grants.saveGrant({ ...grant, revision: next(), revoked_at_ms: Date.now() });
    await refusal(f.service.finish(prepared), 409, "OPERATIONAL_READ_CHANGED");
    expect(linksOf(await read(f), op).items).toEqual([]);
  });
  it("FE-042 revoking the OPERATION end's grant while a page is held refuses the held body", async () => {
    const f = await fixture("ACCOUNT", "paper"), second = { kind: "PORTFOLIO" as const, id: next() }, op = await queue(f);
    await additional(f, second); await link(f, await incident(f, second), op);
    const prepared = await f.service.prepareQueue(f.principal, query(f));
    await change(f, { revoked_at_ms: Date.now() });
    await refusal(f.service.finish(prepared), 409, "OPERATIONAL_READ_CHANGED");
  });
  /** Deterministic population: every status dimension, a hidden peer, and two environments. */
  async function population(f: Fixture) {
    const rows = [
      { severity: "WARNING", status: "SUCCEEDED", verification: "SUCCEEDED", triage: "RESOLVED" },
      { severity: "WARNING", status: "UNCERTAIN", verification: "UNCERTAIN", triage: "ACKNOWLEDGED" },
      { severity: "ERROR", status: "PENDING", verification: "PENDING", triage: "UNACKNOWLEDGED" },
      { severity: "ERROR", status: "SUCCEEDED", verification: "PENDING", triage: "UNACKNOWLEDGED" },
      { severity: "CRITICAL", status: "FAILED", verification: "FAILED", triage: "UNACKNOWLEDGED" },
      { severity: "INFO", status: "BLOCKED", verification: "NOT_STARTED", triage: "UNACKNOWLEDGED" },
    ] as const;
    for (const [index, row] of rows.entries()) await queue(f, { ...row, time: `2026-01-02T03:04:0${index}.000000Z` });
    // Hidden peers must not alter ANY dimension: other target, other environment.
    await queue(f, { target: { ...f.target, id: next() }, status: "FAILED", severity: "CRITICAL" });
    await queue(f, { environment: "live", status: "FAILED", severity: "CRITICAL" });
    return rows;
  }
  const tally = (rows: ReadonlyArray<Record<string, string>>, field: string) => {
    const out: Record<string, number> = {}; for (const row of rows) out[row[field]] = (out[row[field]] ?? 0) + 1; return out;
  };
  const dim = (page: OperationalQueue, field: "triage_state" | "verification_result" | "source_status" | "severity") =>
    page.page.status_counts!.dimensions[field] as { own_filter_applied: boolean; total: number; counts: Record<string, number> };
  const nonZero = (counts: Record<string, number>) => Object.fromEntries(Object.entries(counts).filter(([, value]) => value > 0));
  it("FE-043 unfiltered counts equal the authorized total on every dimension; hidden peers are not counted", async () => {
    const f = await fixture(), rows = await population(f), page = await read(f);
    expect(page.page).toMatchObject({ total_count: 6, filtered_count: 6 });
    for (const [field, key] of [["triage_state", "triage"], ["verification_result", "verification"], ["source_status", "status"], ["severity", "severity"]] as const) {
      expect(dim(page, field)).toMatchObject({ own_filter_applied: false, total: 6 });
      expect(nonZero(dim(page, field).counts)).toEqual(tally(rows as never, key));
    }
    expect(page.page.status_counts).toMatchObject({ basis: "SAME_SNAPSHOT_AUTHORIZED_SCOPE_AND_FILTERS_EXCLUDING_OWN_DIMENSION", succeeded_means: "PORTAL_QUEUE_RECORD_STATE_ONLY" });
    expect(Object.keys(dim(page, "verification_result").counts)).toHaveLength(8); // zero-filled closed domain
  });
  it.each([
    ["one filter", { severity: "ERROR" }],
    ["two filters on different dimensions", { severity: "ERROR", verification_result: "PENDING" }],
    ["a filter plus a non-dimension filter", { source_status: "SUCCEEDED", environment: "PAPER" }],
    ["every supported predicate", { triage_state: "UNACKNOWLEDGED", verification_result: "PENDING", source_status: "PENDING", severity: "ERROR" }],
  ])("FE-043 %s: each dimension ignores ONLY its own filter, over the same snapshot as filtered_count", async (_label, filters) => {
    const f = await fixture(), rows = await population(f), page = await read(f, filters);
    const keys = { triage_state: "triage", verification_result: "verification", source_status: "status", severity: "severity" } as const;
    const match = (row: Record<string, string>, ignore?: string) => Object.entries(filters).every(([field, value]) =>
      field === ignore || field === "environment" || row[keys[field as keyof typeof keys]] === value);
    expect(page.page.filtered_count).toBe(rows.filter(row => match(row as never)).length);
    for (const field of Object.keys(keys) as Array<keyof typeof keys>) {
      const expected = rows.filter(row => match(row as never, field)), own = field in filters;
      expect(dim(page, field).own_filter_applied).toBe(own); expect(dim(page, field).total).toBe(expected.length);
      expect(nonZero(dim(page, field).counts)).toEqual(tally(expected as never, keys[field]));
      if (!own) expect(dim(page, field).total).toBe(page.page.filtered_count);
      else expect(dim(page, field).counts[(filters as Record<string, string>)[field]] ?? 0).toBe(page.page.filtered_count);
    }
  });
  it("FE-043 counts are for the whole filtered query, not the page: limit, cursor and sort do not change them", async () => {
    const f = await fixture(); await population(f);
    const whole = await read(f, { severity: "ERROR" }), first = await read(f, { severity: "ERROR", limit: "1" });
    const second = await read(f, { severity: "ERROR", limit: "1", after: first.page.next_cursor! }), ascending = await read(f, { severity: "ERROR", limit: "1", sort: "created_at:asc" });
    expect(first.page.rows).toHaveLength(1);
    for (const page of [first, second, ascending]) expect(page.page.status_counts).toEqual(whole.page.status_counts);
    expect(dim(first, "triage_state").total).toBe(2);
  });
  it("FE-043 a write committed after the page statement is invisible to counts and links: ONE repeatable-read snapshot", async () => {
    const f = await fixture(), op = await queue(f), good = await incident(f); await link(f, good, op);
    const seen: Array<{ isolation: string; snapshot: string }> = []; let injected = false;
    const pool = { connect: async () => {
      const db = await ctx.pool.connect();
      return { query: async (sql: string, params: unknown[] = []) => {
        const result = await db.query(sql, params);
        if (/execution_operation_queue_v2|execution_incident_operation_links/.test(sql)) {
          seen.push({ isolation: (await db.query("SHOW transaction_isolation")).rows[0].transaction_isolation,
            snapshot: (await db.query("SELECT txid_current_snapshot()::text AS s")).rows[0].s });
          if (!injected && /LIMIT/.test(sql) && /ORDER BY/.test(sql) && /execution_operation_queue_v2/.test(sql)) {
            injected = true; // committed from ANOTHER connection between the page statement and every later statement
            const id = await queue(f, { status: "FAILED", severity: "CRITICAL" });
            await link(f, await incident(f), id);
          }
        }
        return result;
      }, release: () => db.release() } as unknown as PoolClient;
    } } as unknown as Pool;
    const service = new OperationalReadService(new OperationalReadRepository(pool), f.access, f.scopes, f.config);
    const page = operationalQueue.parse(await service.queue(f.principal, query(f)));
    expect(injected).toBe(true); expect(page.page).toMatchObject({ total_count: 1, filtered_count: 1 });
    expect(dim(page, "source_status").total).toBe(1); expect(dim(page, "severity").counts.CRITICAL).toBe(0);
    expect(new Set(seen.map(row => row.snapshot)).size).toBe(1); expect(seen.every(row => row.isolation === "repeatable read")).toBe(true);
    expect(seen.length).toBeGreaterThanOrEqual(7); // total, page, 4 dimensions, links (no filter, so no separate filtered count)
    expect(page.page.rows.map(row => row.operation_id)).toEqual([op]);
    const fresh = await read(f); expect(fresh.page.total_count).toBe(2); expect(dim(fresh, "severity").counts.CRITICAL).toBe(1);
  });
  it("FE-043 SUCCEEDED is a Portal queue record state, never financial APPLIED, projection convergence or venue success", async () => {
    const f = await fixture(); await queue(f, { status: "SUCCEEDED", verification: "SUCCEEDED", triage: "RESOLVED" });
    const page = await read(f), text = JSON.stringify(page);
    expect(page.page.status_counts!.succeeded_means).toBe("PORTAL_QUEUE_RECORD_STATE_ONLY");
    expect(dim(page, "source_status").counts.SUCCEEDED).toBe(1); expect(dim(page, "verification_result").counts.SUCCEEDED).toBe(1);
    expect(text).not.toMatch(/APPLIED|CONVERG|VENUE|FILLED/);
    expect(operationalQueue.safeParse({ ...page, page: { ...page.page, status_counts: { ...page.page.status_counts, succeeded_means: "FINANCIAL_APPLIED" } } }).success).toBe(false);
  });
  it("FE-042/043 unsupported or unknown predicates stay refused, and an empty authorized scope is EMPTY with zero counts", async () => {
    const f = await fixture(); await refusal(read(f, { assigned_to: "me" }), 400, "OPERATIONAL_READ_FILTER_NOT_SUPPORTED");
    await refusal(read(f, { status_counts: "off" }), 400, "OPERATIONAL_READ_INPUT_INVALID");
    const empty = await read(f); expect(empty.read_truth.state).toBe("EMPTY");
    expect(dim(empty, "severity")).toMatchObject({ own_filter_applied: false, total: 0 });
    expect(Object.values(dim(empty, "triage_state").counts).every(value => value === 0)).toBe(true);
  });
  it("FE-043 a status filter value outside the closed domain (severity=BOGUS) is a typed 400, never a 503, and leaves a valid read unaffected", async () => {
    const f = await fixture(); await population(f);
    for (const filters of [{ severity: "BOGUS" }, { source_status: "APPLIED" }, { triage_state: "bogus" }, { verification_result: "" }])
      await refusal(read(f, filters), 400, "OPERATIONAL_READ_INPUT_INVALID");
    const page = await read(f, { severity: "ERROR" }); // the same cohort still reads, with the own-bucket count intact
    expect(page.page.filtered_count).toBe(2); expect(dim(page, "severity").counts.ERROR).toBe(2); expect(dim(page, "severity").counts.BOGUS).toBeUndefined();
  });
  const walkPlan = (node: Record<string, unknown>, out: Array<{ type: string; index?: string }> = []) => {
    out.push({ type: String(node["Node Type"]), index: node["Index Name"] as string | undefined });
    for (const child of (node.Plans as Array<Record<string, unknown>> | undefined) ?? []) walkPlan(child, out);
    return out;
  };
  it("FE-042 M1: the links table has the (workspace_id, operation_id, created_at DESC, incident_id DESC) lookup index from the migration", async () => {
    const found = await ctx.pool.query<{ indexname: string; indexdef: string }>(
      "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'execution_incident_operation_links' ORDER BY indexname");
    const lookup = found.rows.find(row => row.indexname === "execution_incident_operation_links_operation_idx");
    expect(lookup?.indexdef).toMatch(/\(workspace_id, operation_id, created_at DESC, incident_id DESC\)$/);
    expect(lookup?.indexdef).not.toMatch(/UNIQUE|WHERE/); // additive, non-unique, non-partial: no new constraint on writers
    expect(found.rows.length).toBeGreaterThanOrEqual(2); // the primary key is still there
    expect((await ctx.pool.query("SELECT 1 FROM pgmigrations WHERE name = '1723680000145_execution-incident-links-operation-lookup-index'")).rowCount).toBe(1);
  });
  it("BE-P18 B1: the queue table has the scope lookup index whose expression is the view's target_id expression (migration 148)", async () => {
    const found = await ctx.pool.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'execution_operation_queue_scope_idx'");
    expect(found.rowCount).toBe(1);
    expect(found.rows[0].indexdef).not.toMatch(/UNIQUE|WHERE/);
    expect(found.rows[0].indexdef.replace(/\s+/g, " ")).toMatch(/\(workspace_id, \( ?CASE WHEN \(\(octet_length\(target_id\) >= 1\) AND \(octet_length\(target_id\) <= 191\)\) THEN target_id ELSE NULL::text END\), target_type, environment\)$/);
    expect((await ctx.pool.query("SELECT 1 FROM pgmigrations WHERE name = '1723680000149_execution-operation-queue-scope-lookup-index'")).rowCount).toBe(1);
    // The view's target_id must be that very expression, or the index could never be used by the queue.
    const view = (await ctx.pool.query<{ def: string }>("SELECT pg_get_viewdef('execution_operation_queue_v2'::regclass) AS def")).rows[0].def.replace(/\s+/g, " ");
    expect(view).toContain("CASE WHEN ((octet_length(target_id) >= 1) AND (octet_length(target_id) <= 191)) THEN target_id ELSE NULL::text END AS target_id");
  });
  it("FE-042 M1: on 60k link rows the planner seq-scans a PK-only table but uses exactly this index definition for the queue's (workspace_id, operation_id = ANY) lookup", async () => {
    const real = (await ctx.pool.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'execution_incident_operation_links_operation_idx'")).rows[0].indexdef;
    const probeDef = real.replace(/ON \S*execution_incident_operation_links /, "ON links_probe ").replace("execution_incident_operation_links_operation_idx", "links_probe_idx");
    expect(probeDef).toContain("ON links_probe "); expect(probeDef).toContain("links_probe_idx");
    const db = await ctx.pool.connect();
    try { // a TEMP table copy of the shape: bulk rows without the FK fixtures, discarded with this connection
      await db.query(`CREATE TEMP TABLE links_probe (incident_id text NOT NULL, workspace_id text NOT NULL, operation_id text NOT NULL,
        relationship text NOT NULL, linked_by_user_id text NOT NULL, created_at timestamptz NOT NULL, PRIMARY KEY (incident_id, operation_id))`);
      await db.query(`INSERT INTO links_probe SELECT 'inc' || (i % 997), 'w' || (i % 25), 'op' || i, 'RELATED', 'u',
        timestamptz '2026-01-01 UTC' + i * interval '1 second' FROM generate_series(1, 60000) AS i`);
      await db.query("ANALYZE links_probe");
      const ids = Array.from({ length: 100 }, (_, n) => `op${3 + 25 * n}`); // all in workspace w3, as one queue page would be
      const explain = async () => {
        const plan = await db.query(`EXPLAIN (FORMAT JSON) SELECT operation_id, incident_id, relationship, created_at FROM links_probe l
          WHERE l.workspace_id = 'w3' AND l.operation_id = ANY($1::text[])`, [ids]);
        return walkPlan((plan.rows[0]["QUERY PLAN"] as Array<{ Plan: Record<string, unknown> }>)[0].Plan);
      };
      expect((await explain()).some(node => node.type === "Seq Scan")).toBe(true); // control: without the index the lookup scans the table
      await db.query(probeDef); await db.query("ANALYZE links_probe");
      const nodes = await explain();
      expect(nodes.some(node => node.type === "Seq Scan")).toBe(false);
      expect(nodes.some(node => node.index === "links_probe_idx" && /Index|Bitmap/.test(node.type))).toBe(true);
    } finally { await db.query("DROP TABLE IF EXISTS pg_temp.links_probe").catch(() => undefined); db.release(); }
  });
  it("FE-042/043 the full 250-row page with maximum-length identifiers and 3 links each stays inside the 1 MiB bound", () => {
    const long = "a".repeat(191), history = { availability: "NOT_PUBLISHED", reason_code: "ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED" } as const;
    const link = { state: "LINKED", incident_id: long, relationship: "RELATED", linked_at: "2026-01-02T03:04:05.123456Z",
      incident: { target: { type: "DEPLOYMENT", id: long }, environment: "SANDBOX", severity: "CRITICAL", workflow_state: "MITIGATED" }, link_history: history } as const;
    const row = { operation_id: long, operation_kind: "EXECUTION_COMMAND", command_key: `${"a".repeat(60)}/${"b".repeat(60)}`, target: { type: "DEPLOYMENT", id: long },
      environment: "SANDBOX", risk_tier: "R4_LIVE_RISK_INCREASING", severity: "CRITICAL", source_authority: "BROKER", source_status: "UNCERTAIN",
      verification_result: "NOT_STARTED", triage_state: "UNACKNOWLEDGED", workflow_version: Number.MAX_SAFE_INTEGER, acknowledged_at: null, resolved_at: null,
      created_at: "2026-01-02T03:04:05.123456Z", updated_at: "2026-01-02T03:04:05.123456Z",
      incident_links: { basis: "CURRENT_LINK_ROWS_AUTHORIZED_INCIDENTS_ONLY", bound: 3, authorized_link_count: 9, truncated: true, items: [link, { ...link, incident_id: "b" }, { ...link, incident_id: "c" }] } };
    const dimensionOf = (counts: Record<string, number>) => ({ own_filter_applied: false, total: 250, counts });
    const body = { schema_version: "portal.execution.operational-queue.v2", workspace_id: "ws_TEST_ONLY_bound", record_authority: "PORTAL",
      record_basis: "PORTAL_CURRENT_OPERATIONAL_WORKFLOW", coverage: "AUTHORIZED_SUPPORTED_TARGETS_ONLY", supported_target_types: ["ACCOUNT", "PORTFOLIO", "DEPLOYMENT"],
      source_integration_state: "UNAVAILABLE", source_side_effect_requested: false, source_as_of_ms: null, observed_at_ms: 0,
      read_truth: { state: "AVAILABLE", reason_code: null, scope: "REQUEST" },
      page: { rows: Array(250).fill(row), total_count: 250, filtered_count: 250, next_cursor: null, prev_cursor: null, has_more: false, has_previous: false,
        applied_filters: [], applied_sort: [{ field: "created_at", direction: "desc" }, { field: "operation_id", direction: "desc" }],
        status_counts: { basis: "SAME_SNAPSHOT_AUTHORIZED_SCOPE_AND_FILTERS_EXCLUDING_OWN_DIMENSION", succeeded_means: "PORTAL_QUEUE_RECORD_STATE_ONLY", dimensions: {
          triage_state: dimensionOf({ UNACKNOWLEDGED: 250, ACKNOWLEDGED: 0, RESOLVED: 0 }),
          verification_result: dimensionOf({ NOT_STARTED: 250, PENDING: 0, SUCCEEDED: 0, FAILED: 0, PARTIAL: 0, UNCERTAIN: 0, DENIED: 0, EXPIRED: 0 }),
          source_status: dimensionOf({ BLOCKED: 0, PENDING: 0, RUNNING: 0, SUCCEEDED: 0, FAILED: 0, EXPIRED: 0, UNCERTAIN: 250 }),
          severity: dimensionOf({ INFO: 0, WARNING: 0, ERROR: 0, CRITICAL: 250 }) } } } };
    expect(operationalQueue.safeParse(body).success).toBe(true);
    const bytes = Buffer.byteLength(JSON.stringify(body), "utf8");
    expect(bytes).toBeLessThan(1_048_576); expect(bytes).toBeGreaterThan(500_000);
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
        { provide: PositiveParentReads, useValue: new PositiveParentReads(new PositiveParentRepository(ctx.pool), f.access, f.scopes) },
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
