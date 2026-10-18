/** ELP2-04 finite positive parent integration tests.
 * Runs only in the existing explicit disposable PostgreSQL test cell.
 * Existing disposable PG + setupApp + actual controller/session guard only.
 * TEST_ONLY projection, R1/lifecycle seeds, policy and normalized source facts
 * are NOT native wire/source acceptance, historical-original proof or a PASS.
 */
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import cookiePlugin from "@fastify/cookie";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AdminService } from "../src/admin/admin.service";
import { AuthService } from "../src/auth/auth.service";
import { OwnerAccessService } from "../src/auth/owner-access.service";
import { SESSION_COOKIE } from "../src/auth/cookies";
import { SessionGuard } from "../src/facade/session.guard";
import { HttpErrorFilter } from "../src/http-error.filter";
import { CONTROL_API_CONFIG } from "../src/tokens";
import { WorkspacesRepository } from "../src/repos/workspaces";
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { SessionsRepository } from "../src/repos/sessions";
import { GovernanceController } from "../src/governance/governance.controller";
import { GovernanceService } from "../src/governance/governance.service";
import { GovernanceReviewCaptureService } from "../src/governance/review-capture.service";
import { PaperExitRepository } from "../src/governance/paper-exit.repository";
import { PaperExitService, computePaperExitSourceSnapshotHash } from "../src/governance/paper-exit.service";
import type { EvidenceRecord } from "../src/governance/governance.repository";
import { computeEvidenceManifestHash } from "../src/governance/evidence-manifest";
import { ExecutionProfileProjectionRepository, projectionDigest } from "../src/execution/profile-projection.repository";
import { ExecutionOperationsService } from "../src/operations/operations.service";
import { OperationalCompositionService } from "../src/execution/operational-composition.service";
import { OperationalCompositionController } from "../src/execution/operational-composition.controller";
import { OperationsWorkflowService } from "../src/operations/workflow.service";
import { PositiveParentRepository, type PositiveParentFamily } from "../src/governance/positive-parent.repository";
import { PositiveParentReads } from "../src/governance/positive-parent.service";
import { r2ParentRead, paperExitParentRead } from "../src/governance/positive-parent.contract";
import { parentFieldSetDigest, type ParentFieldPurpose, type ParentReadFieldSeal } from "../src/execution-v2/parent-read-fields";
import type { AccessActor, AccessResource, ReviewedAccessPolicy, ScopedAccessGrant } from "../src/execution-v2/access.contract";
import { accessDigest, canonicalSelector, type AccessRelations } from "../src/execution-v2/access-policy";
import { AccessRepository } from "../src/execution-v2/access.repository";
import { grantBindingDigest, type CurrentAccessRelations } from "../src/execution-v2/access-current-relations";
import { type QualifiedRootMembershipReceipt, type TsRootMembershipAcceptance } from "../src/execution-v2/access-root-receipt";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import { ExecutionReadScopes, type ReadScopePrincipal } from "../src/execution-v2/read-scope";
import type { AccessTrustProvider, ReviewedPolicyArtifact } from "../src/execution-v2/access-trust";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const next = () => `TEST_ONLY:${randomUUID()}`;
const PRIVATE = "TEST_ONLY_PRIVATE_PARENT_PROSE_NEVER_PUBLIC";
const password = "TEST-only-parent-correct-horse-2026";
const families = ["R2", "PAPER_EXIT"] as const;
const purposeFor = (family: PositiveParentFamily): ParentFieldPurpose => family === "R2" ? "R2_ROOT" : "PAPER_EXIT_ROOT";
@Module({}) class PositiveParentTestModule {}

describe.skipIf(!DATABASE_URL)("ELP2-04 finite positive parents / actual PG+HTTP / TEST_ONLY", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>, auth: AuthService;
  type Account = { username: string; user: NonNullable<Awaited<ReturnType<AuthService["users"]["findById"]>>>;
    login: Awaited<ReturnType<AuthService["login"]>>;
    session: NonNullable<Awaited<ReturnType<AuthService["sessionFromToken"]>>>; actor: AccessActor };
  let owner: Account, reader: Account;
  const restorations: (() => void)[] = [];
  const restore = <T extends { mockRestore(): void }>(spy: T): T => { restorations.push(() => spy.mockRestore()); return spy; };
  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL!);
    ctx = await setupApp({ DATABASE_URL: DATABASE_URL! }); auth = ctx.app.get(AuthService);
    vi.spyOn(auth, "verifyAccessIdentity").mockImplementation(async assertion => ({
      iss: "https://test-only.cloudflareaccess.com", sub: `TEST_ONLY:${assertion}`, aud: "test-audience",
      email: `${assertion}@azdag.com`, normalizedEmail: `${assertion}@azdag.com`,
      authenticationTime: new Date(), tokenExpiresAt: new Date(Date.now() + 600_000),
    }));
    owner = await activated("ADMIN"); reader = await activated("USER");
    await new OwnerAccessRepository(ctx.pool).claimOwner({ userId: owner.user.userId, claimedBy: "TEST_ONLY_PARENT_READ" });
  });
  afterEach(() => { while (restorations.length) restorations.pop()!(); });
  afterAll(async () => { vi.restoreAllMocks(); if (ctx) await teardownApp(ctx); });
  async function activated(role: "ADMIN" | "USER"): Promise<Account> {
    const admin = new AdminService(ctx.pool, ctx.config, auth), username = `parent-${randomUUID()}`;
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
  const dbNow = async () => Number((await ctx.pool.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0].ms);
  const identifier = (name: string) => { if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw Error("TEST_ONLY identifier"); return `"${name}"`; };
  // Only server-authored constant table/column names enter this fixture helper.
  async function insert(table: string, row: Record<string, unknown>) {
    const entries = Object.entries(row);
    await ctx.pool.query(`INSERT INTO ${identifier(table)} (${entries.map(([key]) => identifier(key)).join(",")})
      VALUES (${entries.map((_, index) => `$${index + 1}`).join(",")})`, entries.map(([, value]) => value));
  }
  function evidence(ordinal: number, capturedAt: Date, schemaVersion = "TEST_ONLY-artifact.v1"): EvidenceRecord {
    return { evidenceId: next(), ordinal, kind: "ALPHA_ARTIFACT", label: PRIVATE, displayValue: PRIVATE, note: PRIVATE,
      verification: "TEST_ONLY", artifactId: next(), sha256: accessDigest(["TEST_ONLY-artifact", ordinal]), sizeBytes: "17",
      mediaType: "application/json", schemaVersion, sourceAuthority: "RESEARCH", sourceReference: PRIVATE,
      required: true, capturedAt, retentionClass: "TEST_ONLY", accessPolicy: PRIVATE };
  }
  async function evidenceRows(approvalId: string, entries: EvidenceRecord[]) {
    for (const e of entries) await insert("governance_approval_evidence", { evidence_id: e.evidenceId, approval_id: approvalId,
      ordinal: e.ordinal, kind: e.kind, label: e.label, display_value: e.displayValue, note: e.note, verification: e.verification,
      artifact_id: e.artifactId, sha256: e.sha256, size_bytes: e.sizeBytes, media_type: e.mediaType, schema_version: e.schemaVersion,
      source_authority: e.sourceAuthority, source_reference: e.sourceReference, required: e.required, captured_at: e.capturedAt,
      retention_class: e.retentionClass, access_policy: e.accessPolicy });
  }
  async function approval(workspace: string, id: string, gate: "R1" | "R2" | "PAPER_EXIT", subject: string, entries: EvidenceRecord[],
    extra: Record<string, unknown> = {}) {
    const now = await dbNow();
    await insert("governance_approval_requests", { approval_id: id, workspace_id: workspace, gate,
      subject_type: gate === "R1" ? "ALPHA_VERSION" : "DEPLOYMENT", subject_id: subject, subject_label: PRIVATE,
      environment: gate === "R1" ? "RESEARCH" : "PAPER", target_label: PRIVATE,
      requester_user_id: owner.user.userId, requester_username: PRIVATE, artifact_creator_user_id: owner.user.userId,
      artifact_creator_username: PRIVATE, status: "APPROVED", policy_version: "TEST_ONLY-capture-policy",
      quorum_required: 1, quorum_met: 1, decision_actor_ids: [owner.user.userId], approval_version: 1,
      evidence_set_hash: computeEvidenceManifestHash(entries), evidence_complete: true, blocker_count: 0,
      sla_due_at: new Date(now + 86_400_000), expires_at: new Date(now + 172_800_000),
      created_at: new Date(now - 60_000), updated_at: new Date(now - 30_000),
      decided_at: new Date(now - 30_000), decided_by_user_id: owner.user.userId, ...extra });
    await evidenceRows(id, entries);
  }
  async function workspace(account: Account) {
    const id = next(); await insert("workspaces", { workspace_id: id, name: "TEST_ONLY positive parents", owner_user_id: owner.user.userId });
    for (const a of new Set([owner, account])) await insert("workspace_members", {
      workspace_id: id, user_id: a.user.userId, role: a === owner ? "OWNER" : "MEMBER" });
    return id;
  }

  /** Actual Portal capture code over declared TEST_ONLY input. R1 acceptance
   * and R2 APPROVED lifecycle below are SQL test fixtures, NOT native verdicts.
   * No immutable UPDATE, trigger disable, private migration load or relay. */
  async function captured(account: Account) {
    const ws = await workspace(account), alpha = next(), deployment = next(), portfolio = `pf_${randomUUID()}`, risk = next();
    const r1 = next(); await approval(ws, r1, "R1", alpha, [evidence(0, new Date(await dbNow() - 120_000))]);
    const relation = (items: Record<string, string>[]) => ({ availability: "AVAILABLE", freshness: "FRESH", completeness: "COMPLETE",
      as_of: new Date().toISOString(), items: items.map(fields => ({ fields, lineage: {
        workspace_id: ws, profile_id: "PAPER_BINANCE_USDM", source_contract_revision: "TEST_ONLY-parent-v1" } })) });
    const document = { schema_version: "portal.execution.profile-projection.v1", workspace_id: ws, environment: "paper",
      profile_id: "PAPER_BINANCE_USDM", source_contract_revision: "TEST_ONLY-parent-v1", relations: {
        "manager.deployments:strategy_deployments": relation([{ deployment_id: deployment, strategy_id: alpha, portfolio_id: portfolio,
          account_id: "TEST_ONLY_account", venue: "BINANCE" }]),
        "manager.risk:risk_grants": relation([{ risk_grant_id: risk, strategy_id: alpha, account_id: "TEST_ONLY_account" }]),
        "manager.portfolios:portfolios": relation([{ portfolio_id: portfolio }]),
      } };
    const digest = projectionDigest(document), config = { ...ctx.config, FEATURE_EXECUTION_LOCAL_PROJECTION: "true" as const,
      FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true" as const, EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: ws,
      EXECUTION_EDGE_PAPER_PROFILE_ID: "PAPER_BINANCE_USDM" };
    await ctx.pool.query(`INSERT INTO execution_profile_projection_snapshots
      (workspace_id,environment,profile_id,source_contract_revision,source_epoch,source_cursor,source_as_of,received_at,
       last_successful_refresh_at,completeness,projection_epoch,projection_sequence,payload_digest,payload)
      VALUES($1,'paper','PAPER_BINANCE_USDM','TEST_ONLY-parent-v1','TEST_ONLY-epoch','TEST_ONLY-cursor',clock_timestamp(),
        clock_timestamp(),clock_timestamp(),'COMPLETE',$2,1,$3,$4)`, [ws, randomUUID(), digest, JSON.stringify(document)]);
    const exits = new PaperExitRepository(ctx.pool), captures = new GovernanceReviewCaptureService(ctx.pool, config,
      new ExecutionProfileProjectionRepository(ctx.pool, undefined, config), exits, ctx.app.get(OwnerAccessService));
    const r2Result = await captures.createR2(owner.user, { workspace_id: ws, request_key: next(), summary: PRIVATE,
      r1_approval_id: r1, expected_r1_version: 1, portfolio_id: portfolio, currency: "USDT", deployment_id: deployment,
      risk_grant_id: risk, expected_projection_digest: digest }, next());
    const producedId = (value: unknown): string => { if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,191}$/.test(value)) throw Error("TEST_ONLY invalid capture identity"); return value; };
    const r2 = producedId(r2Result.aggregate_id);
    expect(r2Result).toMatchObject({ authority: "PORTAL", source_verdict: "NOT_ASSERTED", source_side_effect_requested: false });
    // Legal lifecycle fixture only; genuine decision-plan/apply is separately
    // covered by governance-product.spec.ts, not asserted by this test.
    await ctx.pool.query(`UPDATE governance_approval_requests SET status='APPROVED',quorum_met=quorum_required,
      decision_actor_ids=ARRAY[$2]::text[],approval_version=approval_version+1,decided_at=clock_timestamp(),
      decided_by_user_id=$2,updated_at=clock_timestamp() WHERE approval_id=$1`, [r2, owner.user.userId]);
    const paperResult = await captures.createPaperExit(owner.user, { workspace_id: ws, request_key: next(), summary: PRIVATE,
      r2_approval_id: r2, expected_r2_version: 2, deployment_id: deployment, expected_projection_digest: digest }, next());
    expect(paperResult).toMatchObject({ authority: "PORTAL", source_verdict: "NOT_ASSERTED", source_side_effect_requested: false });
    return { workspace: ws, r1, r2, paper: producedId(paperResult.aggregate_id), deployment, portfolio, risk, exits, config };
  }
  type FixtureOptions = { purposes?: ParentFieldPurpose[]; account?: Account; gate?: boolean; pendingAnchor?: "DEPLOYMENT" | "PORTFOLIO";
    nativeTtlMs?: number; fieldTtlMs?: number; unrelatedAudit?: boolean };
  async function fixture(options: FixtureOptions = {}) {
    const account = options.account ?? reader, data = await captured(account), now = await dbNow();
    const purposes = options.purposes ?? ["R2_ROOT", "R2_LINEAGE", "PAPER_EXIT_ROOT", "PAPER_EXIT_REVIEW", "PAPER_EXIT_LINEAGE"];
    const seals: ParentReadFieldSeal[] = purposes.map(purpose => ({ purpose, environment: "paper", contract_revision: "portal.execution.parent-fields.v1",
      field_policy_ref: `TEST_ONLY:${purpose}`, field_set_sha256: parentFieldSetDigest(purpose), valid_from_ms: now - 60_000,
      valid_until_ms: now + (options.fieldTtlMs ?? 600_000) }));
    const policy: ReviewedAccessPolicy = { workspace_id: data.workspace, revision: next(), artifact_digest: accessDigest(next()),
      approval_ref: "TEST_ONLY-not-owner-runtime-review", state: "REVIEWED", qualification: "TEST_ONLY",
      protected_owner_user_id: owner.user.userId, researcher_fields: { state: "PENDING", policy_ref: null, fields: [] }, parent_read_fields: seals };
    const targets: AccessResource[] = [{ kind: "DEPLOYMENT", id: data.deployment }, { kind: "PORTFOLIO", id: data.portfolio }];
    const base = (action: ScopedAccessGrant["action"], target: AccessResource): ScopedAccessGrant => ({ grant_id: next(),
      workspace_id: data.workspace, subject_user_id: account.user.userId, action, effect: "ALLOW",
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: target.kind, ids: [target.id] }, environments: ["paper"],
      valid_from_ms: now - 60_000, valid_until_ms: now + 600_000, delegable_actions: [], issued_by: owner.user.userId,
      parent_grant_id: null, revision: next(), policy_revision: policy.revision, revoked_at_ms: null,
      requires_ts_acceptance: action === "audit.read", ts_receipt: null, field_policy_ref: null });
    const audits = seals.flatMap(seal => targets.map(target => ({ ...base("audit.read", target), field_policy_ref: seal.field_policy_ref })));
    const gate = base("governance.r2.read", targets[0]!);
    const unrelatedAudits = options.unrelatedAudit ? targets.map(target => ({ ...base("audit.read",target),
      requires_ts_acceptance:false, field_policy_ref:null })) : [];
    const artifact: ReviewedPolicyArtifact = { policy, root_grants: [...audits, ...unrelatedAudits,
      ...(options.gate === false ? [] : [gate])], provenance_ref: "TEST_ONLY-parent-reviewed-artifact" };
    const mapping = next(), tsUser = next();
    const facts: TsRootMembershipAcceptance[] = audits.map(grant => ({ context: "REVIEWED_POLICY_ROOT", source: "TEST_ONLY-parent-source",
      source_contract: "TEST_ONLY-normalized-root", trust_profile: "TEST_ONLY", receipt_id: next(), portal_user_id: account.user.userId,
      ts_user_id: tsUser, mapping_revision: mapping, human_requester_user_id: owner.user.userId, workspace_id: data.workspace,
      action: "audit.read", selector_digest: accessDigest(canonicalSelector(grant.selector)), environments: ["paper"],
      previous_membership_revision: null, membership_revision: next(), effective_at_ms: now - 1000, expires_at_ms: now + (options.nativeTtlMs ?? 600_000),
      outcome: "ACCEPTED", payload_digest: accessDigest(next()), provenance_ref: "TEST_ONLY-not-native-proof", policy_revision: policy.revision,
      policy_artifact_digest: policy.artifact_digest, policy_install_digest: accessDigest(artifact), approval_ref: policy.approval_ref,
      grant_id: grant.grant_id, grant_digest: accessDigest(grant), expected_grant_revision: grant.revision }));
    const source: CurrentAccessRelations = { schema_version: "pma.core-current-relations.v1", subject_user_id: account.user.userId,
      workspace_id: data.workspace, ts_user_id: tsUser, mapping_revision: mapping, resources: [{ environment: "paper", revision: next(),
        own_alpha_ids: [], member_portfolio_ids: [], roots: [] }], grants: audits.map((grant, index) => ({ grant_id: grant.grant_id,
        binding_digest: grantBindingDigest(grant), accepted: structuredClone(facts[index]!), targets: [{ resource: targets[index % 2]!,
          environment: "paper", revision: next(), native_reference_digest: accessDigest(next()), valid_from_ms: now - 1000,
          valid_until_ms: now + (options.nativeTtlMs ?? 600_000) }] })) };
    const leases = new Map<object, QualifiedRootMembershipReceipt>();
    let held = 0; const sql: string[] = [];
    // Actual pg client/query/release underneath; no row substitution. Only the
    // repository pool is observed, so source calls prove its RR TX is released.
    const trackedPool = { connect: async () => {
      const client = await ctx.pool.connect(); held++;
      return new Proxy(client, { get(target, property) {
        if (property === "query") return (...args: unknown[]) => { sql.push(String(args[0])); return Reflect.apply(target.query, target, args); };
        if (property === "release") return () => { held--; target.release(); };
        const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
      } });
    } } as Pool;
    const forbidden = vi.fn(async () => { throw Error(PRIVATE); });
    const relations = vi.fn(async (userId: string, ws: string): Promise<AccessRelations> => {
      expect(held).toBe(0);
      if (userId !== account.user.userId || ws !== data.workspace) return {
        qualified: false, revision: "UNQUALIFIED", own_alpha_ids: [], member_portfolio_ids: [], roots: {}, membership: null };
      return { qualified: true, revision: "TEST_ONLY-versioned-current", own_alpha_ids: [], member_portfolio_ids: [], roots: {},
        membership: { receipt_id: facts[0]!.receipt_id, revision: facts[0]!.membership_revision, mapping_revision: mapping },
        current_authority: structuredClone(source) };
    });
    const trust: AccessTrustProvider = { verifyPolicy: async value => value === artifact ? artifact : null,
      verifyRootReceipt: async value => leases.get(value as object) ?? null,
      verifyReceipt: forbidden, verifiedHumanMapping: forbidden, readPublication: forbidden, relations };
    const access = new ExecutionAccessService(ctx.pool, auth, trust, true), grants = new AccessRepository(ctx.pool);
    await access.installReviewedPolicy(artifact);
    for (const [index, fact] of facts.entries()) {
      const grant = audits[index]!;
      if (grant.selector.kind === "EXPLICIT_RESOURCE_SET" && grant.selector.resource_kind === options.pendingAnchor) continue;
      const token = Object.freeze({ TEST_ONLY_root: randomUUID() });
      const release = vi.fn(async () => {});
      leases.set(token, { fact: structuredClone(fact), mapping: { ts_user_id: tsUser, revision: mapping },
        membership: { receipt_id: fact.receipt_id, revision: fact.membership_revision, mapping_revision: mapping },
        current_authority: structuredClone(source), assertCurrent() {}, release });
      expect((await access.acceptRootTsReceipt(token)).receipt.outcome).toBe("TS_APPLIED");
      expect(release).toHaveBeenCalledOnce();
    }
    const accepted = (await ctx.pool.query<{ grant_fact: ScopedAccessGrant }>(
      "SELECT grant_fact FROM portal_access_grants_v2 WHERE workspace_id=$1", [data.workspace])).rows.map(row => row.grant_fact);
    // A positive audit leaf must have come through the real publisher, not
    // directly seeded receipt JSON. The current versioned entry remains needed.
    for (const grant of accepted.filter(g => g.action === "audit.read" && g.ts_receipt !== null)) {
      expect(grant.ts_acceptance_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect((await ctx.pool.query("SELECT count(*)::int AS n FROM portal_access_policy_events WHERE workspace_id=$1 AND grant_id=$2 AND operation='TS_RECEIPT'",
        [data.workspace, grant.grant_id])).rows[0].n).toBe(1);
    }
    const repository = new PositiveParentRepository(trackedPool), scopes = new ExecutionReadScopes(ctx.pool, access, data.config);
    const service = new PositiveParentReads(repository, access, scopes);
    const principal: ReadScopePrincipal = { user: account.user, session: account.session, workspaceId: data.workspace, viewerWorkspaceId: data.workspace };
    return { ...data, account, policy, artifact, gate, audits, accepted, facts, source, targets, grants, trust, forbidden, relations,
      access, scopes, repository, service, principal, sql, held: () => held };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const idFor = (f: Fixture, family: PositiveParentFamily) => family === "R2" ? f.r2 : f.paper;
  const read = (f: Fixture, family: PositiveParentFamily, id = idFor(f, family)) => f.service.detail(f.principal, family, id);
  async function refused(run: Promise<unknown>, status: number, code: string) {
    await expect(run).rejects.toMatchObject({ status, code,
      message: "The operational read is not available. Review its scope or refresh the page." });
  }
  function finite(value: unknown) {
    expect(JSON.stringify(value)).not.toMatch(new RegExp(`${PRIVATE}|requester|username|actor_user|ts_user|apply_token|response_json|exact_value|source_href|source_reference|display_value|request_key|observation_summary|recommendation|reason_code.*ACCEPTED_EXIT`));
  }
  async function revoke(f: Fixture, kind: "DEPLOYMENT" | "PORTFOLIO") {
    for (const grant of f.accepted.filter(g => g.action === "audit.read" && g.selector.kind === "EXPLICIT_RESOURCE_SET" && g.selector.resource_kind === kind))
      await f.grants.saveGrant({ ...grant, revision: next(), revoked_at_ms: await dbNow() });
  }
  async function withHttp<T>(f: Fixture, run: (http: FastifyInstance, legacy: ReturnType<typeof vi.fn>) => Promise<T>): Promise<T> {
    const legacy = vi.fn(async () => { throw Error(PRIVATE); });
    const deniedLegacy = { list: legacy, detail: legacy, r2Detail: legacy, liveDetail: legacy, r1Detail: legacy, operation: legacy };
    const compositions = new OperationalCompositionService(f.config,
      { sourceHealth: legacy } as never,
      { snapshot: legacy, snapshotMetadata: legacy, rawSnapshot: legacy } as never,
      deniedLegacy as never, deniedLegacy as never, deniedLegacy as never, deniedLegacy as never,
      deniedLegacy as never, deniedLegacy as never,
      new WorkspacesRepository(ctx.pool, f.config), f.scopes, undefined, f.service);
    // Existing GovernanceController, no test-only route or replacement guard.
    // Main must wire PositiveParentReads into the two established GET branches.
    const app = await NestFactory.create<NestFastifyApplication>({ module: PositiveParentTestModule,
      controllers: [GovernanceController, OperationalCompositionController],
      providers: [SessionGuard, { provide: AuthService, useValue: auth }, { provide: CONTROL_API_CONFIG, useValue: f.config },
        { provide: WorkspacesRepository, useValue: new WorkspacesRepository(ctx.pool, f.config) },
        { provide: GovernanceService, useValue: deniedLegacy }, { provide: PaperExitService, useValue: deniedLegacy },
        { provide: GovernanceReviewCaptureService, useValue: deniedLegacy }, { provide: ExecutionOperationsService, useValue: deniedLegacy },
        { provide: OperationsWorkflowService, useValue: deniedLegacy }, { provide: ExecutionReadScopes, useValue: f.scopes },
        { provide: PositiveParentReads, useValue: f.service },
        { provide: OperationalCompositionService, useValue: compositions }] }, new FastifyAdapter(), { logger: false, abortOnError: false });
    try { app.useGlobalFilters(new HttpErrorFilter()); await app.register(cookiePlugin as never); await app.init();
      const http = app.getHttpAdapter().getInstance<FastifyInstance>(); await http.ready(); return await run(http, legacy);
    } finally { await app.close(); }
  }
  const path = (f: Fixture, family: PositiveParentFamily, id = idFor(f, family), ws = f.workspace) =>
    `/api/v1/execution/governance/${family === "R2" ? `approvals/${id}/r2` : `exit-reviews/${id}`}?workspace_id=${encodeURIComponent(ws)}`;
  const headers = (f: Fixture) => ({ cookie: `${SESSION_COOKIE}=${f.account.login.token}`, "x-request-id": "TEST_ONLY-parent-read" });
  async function businessState(f: Fixture) {
    return (await ctx.pool.query(`SELECT jsonb_build_object(
      'approvals',(SELECT jsonb_agg(to_jsonb(a) ORDER BY approval_id) FROM governance_approval_requests a WHERE workspace_id=$1),
      'reviews',(SELECT jsonb_agg(to_jsonb(r) ORDER BY review_id) FROM governance_paper_exit_reviews r WHERE workspace_id=$1),
      'evidence',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.evidence_id) FROM governance_approval_evidence e
        JOIN governance_approval_requests a USING(approval_id) WHERE a.workspace_id=$1),
      'scopes',(SELECT jsonb_agg(to_jsonb(s) ORDER BY approval_id) FROM governance_approval_analytics_scopes s WHERE workspace_id=$1),
      'r2_lineage',(SELECT jsonb_agg(to_jsonb(l) ORDER BY r2_approval_id) FROM governance_r2_lineage l WHERE workspace_id=$1),
      'paper_lineage',(SELECT jsonb_agg(to_jsonb(l) ORDER BY lineage_id) FROM governance_paper_exit_lineage l
        JOIN governance_paper_exit_reviews r USING(review_id) WHERE r.workspace_id=$1),
      'panels',(SELECT jsonb_agg(to_jsonb(p) ORDER BY panel_id) FROM governance_paper_exit_panels p
        JOIN governance_paper_exit_reviews r USING(review_id) WHERE r.workspace_id=$1),
      'findings',(SELECT jsonb_agg(to_jsonb(g) ORDER BY finding_id) FROM governance_paper_exit_findings g
        JOIN governance_paper_exit_reviews r USING(review_id) WHERE r.workspace_id=$1),
      'captures',(SELECT count(*) FROM governance_review_captures WHERE workspace_id=$1),
      'audit',(SELECT count(*) FROM product_audit_events WHERE workspace_id=$1),
      'access_events',(SELECT count(*) FROM portal_access_policy_events WHERE workspace_id=$1),
      'plans',(SELECT count(*) FROM governance_decision_plans WHERE workspace_id=$1),
      'exit_plans',(SELECT count(*) FROM governance_paper_exit_decision_plans WHERE workspace_id=$1),
      'queue',(SELECT count(*) FROM execution_operation_queue_items WHERE workspace_id=$1)) AS state`, [f.workspace])).rows[0].state;
  }

  it.each(families)("actual %s HTTP positive is finite, historical/current-baseline, read-only and never calls the rich legacy reader", async family => {
    const f = await fixture(), before = await businessState(f);
    expect(f.account.user.role).toBe("USER");
    await withHttp(f, async (http, legacy) => {
      const response = await http.inject({ method: "GET", url: path(f, family), headers: headers(f) });
      expect(response.statusCode, response.body).toBe(200); expect(response.headers["cache-control"]).toBe("private, no-store");
      // Actual existing governance route returns the response body directly;
      // there is no test-only {data} envelope around the additive variant.
      const body = response.json();
      (family === "R2" ? r2ParentRead : paperExitParentRead).parse(body);
      expect(body).toMatchObject({ family, record_authority: "PORTAL", provenance_basis: "CURRENT_CORE_BASELINE",
        anchors: { deployment_id: f.deployment, portfolio_id: f.portfolio, environment: "PAPER" },
        source: { source_verdict: "NOT_ASSERTED", source_side_effect_requested: false } });
      if (family === "R2") expect(body.lineage).toMatchObject({ availability: "AVAILABLE", r1_approval_id: f.r1, currency: "USDT" });
      else {
        expect(body.lineage).toMatchObject({ availability: "AVAILABLE", basis: "VERIFIED_CURRENT_STORED_BYTES_NOT_SOURCE_ACCEPTANCE" });
        expect(body.evaluation.panels).toHaveLength(4); expect(body.evaluation.findings).toHaveLength(4);
        expect(body.evaluation.panels.every((panel: { panel_state: string }) => panel.panel_state === "UNAVAILABLE")).toBe(true);
        expect(body.evaluation.findings.every((finding: { outcome: string }) => finding.outcome === "INSUFFICIENT")).toBe(true);
      }
      finite(body); expect(legacy).not.toHaveBeenCalled();
    });
    expect(await businessState(f)).toEqual(before); expect(f.forbidden).not.toHaveBeenCalled(); expect(f.held()).toBe(0);
    expect(f.sql.some(sql => /REPEATABLE READ,? READ ONLY/.test(sql))).toBe(true);
    expect(f.sql.join("\n")).not.toMatch(/FROM governance_(?:decision_plans|approval_findings|approval_decisions|paper_exit_decisions)|promotion/i);
  });
  it.each(families)("actual %s composition stays in the same qualified flight, with no source call or await after LAST Core", async family => {
    const f = await fixture(), trace: string[] = [];
    const original = f.access.confirmReadContext.bind(f.access);
    restore(vi.spyOn(f.access, "confirmReadContext").mockImplementation(async (...args) => {
      const result = await original(...args); trace.push("LAST_CORE"); return result;
    }));
    await withHttp(f, async (http, legacy) => {
      const scope = `workspace_id=${encodeURIComponent(f.workspace)}`;
      const route = family === "R2" ? `approvals/${f.r2}?${scope}&view=r2` : `exit-reviews/${f.paper}?${scope}`;
      const response = await http.inject({ method: "GET", headers: headers(f), url: `/api/v1/execution/compositions/${route}` });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.headers["cache-control"]).toBe("private, no-store");
      const body = response.json();
      expect(body).toMatchObject({ record_authority: "PORTAL_CONTROL", source_authority: "PORTAL_CONTROL_ONLY",
        source_health: { state: "UNAVAILABLE", reason_code: "CURRENT_AUDIT_SOURCE_PURPOSE_NOT_QUALIFIED" },
        command_authority: { state: "UNCHANGED_FAIL_CLOSED", source_side_effect_requested: false } });
      const parent = family === "R2" ? body.data.governance : body.data.exit_review;
      (family === "R2" ? r2ParentRead : paperExitParentRead).parse(parent);
      if (family === "R2") expect(body.data.accepted_manager_facts).toBeNull();
      expect(trace).toEqual(["LAST_CORE"]); expect(legacy).not.toHaveBeenCalled(); finite(body);
    });
    expect(f.forbidden).not.toHaveBeenCalled(); expect(f.held()).toBe(0);
  });
  it("ROOT's exact integrity footprint does not publish Paper preimages or imply optional sections; R2 currency is not selected without its seal", async () => {
    const f = await fixture({ purposes: ["R2_ROOT", "PAPER_EXIT_ROOT"] });
    const original = f.repository.protectedDetails.bind(f.repository);
    const protectedRead = restore(vi.spyOn(f.repository, "protectedDetails").mockImplementation(async (...args) => {
      expect(args[2]).toEqual({ includeCurrency: false });
      const result = await original(...args); expect(result.raw.scope.currency).toBeNull();
      expect(result.raw.lineage.historical_risk_grant_id).toBeNull(); return result;
    }));
    for (const family of families) {
      const body = await read(f, family); expect(body.lineage.availability).toBe("NOT_PUBLISHED");
      if (body.family === "PAPER_EXIT") expect(body.evaluation.availability).toBe("NOT_PUBLISHED"); finite(body);
    }
    expect(protectedRead).toHaveBeenCalled();
    // Exact SELECT-only opt-in is observed on actual SQL, not just the DTO.
    expect(f.sql.join("\n")).toContain("NULL::text AS currency");
    expect(f.sql.join("\n")).not.toMatch(/s\.currency|l\.grant_id/);
  });
  it.each(families)("%s needs its finite ROOT seal even when both exact native audit anchors remain accepted", async family => {
    const f = await fixture({ purposes: [family === "R2" ? "R2_LINEAGE" : "PAPER_EXIT_LINEAGE"] });
    const privateRead = restore(vi.spyOn(f.repository, "protectedDetails"));
    await refused(read(f, family), 503, "GOVERNANCE_PARENT_FIELD_PURPOSE_UNAVAILABLE"); expect(privateRead).not.toHaveBeenCalled();
  });
  it.each(families.flatMap(family => (["DEPLOYMENT", "PORTFOLIO"] as const).map(anchor => ({ family, anchor }))))(
    "$family refuses a still-pending $anchor audit root before protected decode", async ({ family, anchor }) => {
      const f = await fixture({ pendingAnchor: anchor }), privateRead = restore(vi.spyOn(f.repository, "protectedDetails"));
      await refused(read(f, family), 404, "OPERATIONAL_READ_NOT_FOUND"); expect(privateRead).not.toHaveBeenCalled();
    });
  it("R2 requires its actual current app read action; USER with it succeeds and ADMIN/owner without it does not", async () => {
    const f = await fixture({ account: owner, gate: false }), privateRead = restore(vi.spyOn(f.repository, "protectedDetails"));
    await refused(read(f, "R2"), 404, "OPERATIONAL_READ_NOT_FOUND"); expect(privateRead).not.toHaveBeenCalled();
  });
  it("Paper Exit requires actual workspace membership, not the protected-owner current-principal exception", async () => {
    const f = await fixture({ account: owner });
    await ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [f.workspace, owner.user.userId]);
    const privateRead = restore(vi.spyOn(f.repository, "protectedDetails"));
    await refused(read(f, "PAPER_EXIT"), 404, "OPERATIONAL_READ_NOT_FOUND"); expect(privateRead).not.toHaveBeenCalled();
  });
  it.each(["app-only-audit", "preattached-receipt", "wrong-field-ref", "wrong-environment"] as const)(
    "reviewed installation refuses %s instead of manufacturing a parent audit acceptance", async variant => {
      const f = await fixture(), policy = { ...f.policy, revision: next() };
      const grant: ScopedAccessGrant = { ...f.audits[0]!, grant_id: next(), revision: next(), policy_revision: policy.revision };
      if (variant === "app-only-audit") grant.requires_ts_acceptance = false;
      if (variant === "preattached-receipt") grant.ts_receipt = { receipt_id: next(), membership_revision: next(), mapping_revision: next(),
        effective_at_ms: await dbNow() - 1000, expires_at_ms: await dbNow() + 60_000 };
      if (variant === "wrong-field-ref") grant.field_policy_ref = "TEST_ONLY-unreviewed-fields";
      if (variant === "wrong-environment") grant.environments = ["sandbox"];
      const artifact: ReviewedPolicyArtifact = { policy, root_grants: [grant], provenance_ref: "TEST_ONLY-invalid-install" };
      const access = new ExecutionAccessService(ctx.pool, auth, { ...f.trust, verifyPolicy: async value => value === artifact ? artifact : null }, true);
      await expect(access.installReviewedPolicy(artifact)).rejects.toMatchObject({ code: "RECEIPT_BINDING_MISMATCH", status: 403 });
      expect((await f.grants.policy(f.workspace))!.revision).toBe(f.policy.revision);
    });
  it.each(["foreign-workspace", "other-family", "nonexistent"] as const)("HTTP %s is uniform and never opens protected rows", async variant => {
    const f = await fixture(), foreign = await workspace(reader), privateRead = restore(vi.spyOn(f.repository, "protectedDetails"));
    if (variant === "foreign-workspace") {
      // A workspace with no V2 policy intentionally keeps legacy routing. This
      // negative concerns two SCOPED_V2 workspaces, not a legacy-reader stub.
      // Install an actual empty reviewed policy: it supplies no read grant.
      const artifact: ReviewedPolicyArtifact = { policy: { ...f.policy, workspace_id: foreign,
        revision: next(), artifact_digest: accessDigest(next()), parent_read_fields: [] },
        root_grants: [], provenance_ref: "TEST_ONLY-foreign-empty-reviewed-policy" };
      const access = new ExecutionAccessService(ctx.pool, auth, { ...f.trust,
        verifyPolicy: async value => value === artifact ? artifact : null }, true);
      await access.installReviewedPolicy(artifact);
    }
    await withHttp(f, async (http, legacy) => {
      const url = variant === "foreign-workspace" ? path(f, "R2", f.r2, foreign) : path(f, "R2", variant === "other-family" ? f.paper : next());
      const response = await http.inject({ method: "GET", url, headers: headers(f) });
      expect(response.statusCode).toBe(404); expect(response.json().error.code).toBe("OPERATIONAL_READ_NOT_FOUND"); finite(response.json());
      expect(legacy).not.toHaveBeenCalled();
    });
    expect(privateRead).not.toHaveBeenCalled();
  });
  it.each(["wrong-environment", "no-current-native-leg", "present-invalid-versioned", "exact-deny"] as const)(
    "%s cannot be rescued by genuinely installed unrelated APP-only audit leaves", async variant => {
      const f = await fixture({ unrelatedAudit:true }), privateRead = restore(vi.spyOn(f.repository, "protectedDetails"));
      expect(f.accepted.filter(grant=>grant.action==="audit.read"&&!grant.requires_ts_acceptance&&grant.field_policy_ref===null)).toHaveLength(2);
      if (variant === "wrong-environment") for (const entry of f.source.grants) for (const target of entry.targets) target.environment = "sandbox";
      if (variant === "no-current-native-leg") for (const entry of f.source.grants) entry.targets = [];
      if (variant === "present-invalid-versioned") f.source.mapping_revision = next();
      if (variant === "exact-deny") await f.grants.saveGrant({ ...f.gate, grant_id: next(), revision: next(), action: "audit.read", effect: "DENY",
        selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "PORTFOLIO", ids: [f.portfolio] } }, true);
      await refused(read(f, "R2"), 404, "OPERATIONAL_READ_NOT_FOUND"); expect(privateRead).not.toHaveBeenCalled();
    });

  /** Every mutation is made after the actual private read OR after the actual
   * local equality read has released its PG client. Never fake a positive
   * access context or treat revocation after LAST snapshot as linearizable. */
  it.each(families.flatMap(family => (["decode", "equality"] as const).flatMap(stage =>
    (["core-deployment", "core-portfolio", "source-deployment", "source-portfolio"] as const).map(change => ({ family, stage, change })))))(
    "$family $change after $stage cannot deliver the selected body", async ({ family, stage, change }) => {
      const f = await fixture(); let changed = false;
      const mutate = async () => {
        if (changed) return; changed = true; expect(f.held()).toBe(0);
        const anchor = change.endsWith("deployment") ? "DEPLOYMENT" : "PORTFOLIO";
        if (change.startsWith("core")) await revoke(f, anchor);
        else for (const entry of f.source.grants) entry.targets = entry.targets.filter(target => target.resource.kind !== anchor);
      };
      if (stage === "decode") {
        const original = f.repository.protectedDetails.bind(f.repository);
        restore(vi.spyOn(f.repository, "protectedDetails").mockImplementation(async (...args) => { const result = await original(...args); await mutate(); return result; }));
      } else {
        const original = f.repository.isUnchanged.bind(f.repository);
        restore(vi.spyOn(f.repository, "isUnchanged").mockImplementation(async (...args) => {
          const same = await original(...args); expect(same).toBe(true); await mutate(); return same;
        }));
      }
      await refused(read(f, family), change.startsWith("core") ? 409 : 404,
        change.startsWith("core") ? "OPERATIONAL_READ_CHANGED" : "OPERATIONAL_READ_NOT_FOUND"); expect(changed).toBe(true);
    });
  it.each(["gate-deny", "membership", "session", "policy"] as const)("last actual Core fence rejects %s after a decoded R2 body", async change => {
    const f = await fixture(), login = await auth.login({ assertion: reader.username, username: reader.username, credential: password });
    const session = (await auth.sessionFromToken(login.token))!, principal = { ...f.principal, session };
    const prepared = await f.service.prepare(principal, "R2", f.r2);
    if (change === "gate-deny") await f.grants.saveGrant({ ...f.gate, grant_id: next(), revision: next(), effect: "DENY" }, true);
    if (change === "membership") await ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [f.workspace, reader.user.userId]);
    if (change === "session") await ctx.pool.query("UPDATE auth_sessions SET state='REVOKED',revoked_at=clock_timestamp(),revoke_reason='TEST_ONLY parent' WHERE session_id=$1", [session.sessionId]);
    if (change === "policy") await f.grants.putPolicy({ ...f.policy, revision: next() });
    await refused(f.service.finish(prepared), change === "membership" ? 404 : change === "session" ? 403 : 409,
      change === "membership" ? "OPERATIONAL_READ_NOT_FOUND" : change === "session" ? "OPERATIONAL_READ_AUTHORITY_REQUIRED" : "OPERATIONAL_READ_CHANGED");
  });
  it.each(["credential-generation", "disabled", "must-change-password"] as const)("current actor %s defeats an already prepared parent body", async change => {
    const account = await activated("USER"), f = await fixture({ account }), prepared = await f.service.prepare(f.principal, "PAPER_EXIT", f.paper);
    if (change === "credential-generation") await ctx.pool.query("UPDATE portal_users SET session_version=session_version+1 WHERE user_id=$1", [account.user.userId]);
    if (change === "disabled") await ctx.pool.query("UPDATE portal_users SET status='DISABLED' WHERE user_id=$1", [account.user.userId]);
    if (change === "must-change-password") await ctx.pool.query("UPDATE portal_users SET must_change_password=true WHERE user_id=$1", [account.user.userId]);
    await refused(f.service.finish(prepared), 403, "OPERATIONAL_READ_AUTHORITY_REQUIRED");
  });
  it.each(["identity-loader", "private-loader", "local-equality"] as const)("held %s failure still reaches LAST genuine Core/session confirmation", async stage => {
    const f = await fixture(), trace: string[] = [], originalConfirm = f.access.confirmReadContext.bind(f.access);
    restore(vi.spyOn(f.access, "confirmReadContext").mockImplementation(async (...args) => { trace.push("LAST_CORE"); return originalConfirm(...args); }));
    if (stage === "identity-loader") {
      const original = f.repository.identityCandidate.bind(f.repository);
      restore(vi.spyOn(f.repository, "identityCandidate").mockImplementation(async (...args) => {
        await original(...args); trace.push("ERROR_ASSEMBLED"); await revoke(f, "PORTFOLIO"); throw Error(PRIVATE);
      }));
    } else if (stage === "private-loader") {
      const original = f.repository.protectedDetails.bind(f.repository);
      restore(vi.spyOn(f.repository, "protectedDetails").mockImplementation(async (...args) => {
        await original(...args); trace.push("ERROR_ASSEMBLED"); await revoke(f, "PORTFOLIO"); throw Error(PRIVATE);
      }));
    } else {
      const original = f.repository.isUnchanged.bind(f.repository);
      restore(vi.spyOn(f.repository, "isUnchanged").mockImplementation(async (...args) => {
        await original(...args); trace.push("ERROR_ASSEMBLED"); await revoke(f, "PORTFOLIO"); throw Error(PRIVATE);
      }));
    }
    await refused(read(f, "R2"), 409, "OPERATIONAL_READ_CHANGED");
    expect(trace).toEqual(["ERROR_ASSEMBLED", "LAST_CORE"]); expect(f.held()).toBe(0);
  });
  it("a decoded contextual error is held through fresh native source AND LAST Core, never exposed as a parse oracle", async () => {
    const f = await fixture(), original = f.repository.protectedDetails.bind(f.repository), trace: string[] = [];
    const confirm = f.access.confirmReadContext.bind(f.access);
    restore(vi.spyOn(f.access, "confirmReadContext").mockImplementation(async (...args) => { trace.push("LAST_CORE"); return confirm(...args); }));
    restore(vi.spyOn(f.repository, "protectedDetails").mockImplementation(async (...args) => {
      await original(...args); trace.push("ERROR_ASSEMBLED");
      for (const entry of f.source.grants) entry.targets = []; throw Error(PRIVATE);
    }));
    await refused(read(f, "PAPER_EXIT"), 404, "OPERATIONAL_READ_NOT_FOUND"); expect(trace).toEqual(["ERROR_ASSEMBLED", "LAST_CORE"]);
  });
  it("genuine DB lease renewal changes no stable target proof and remains readable past the OLD idle deadline", async () => {
    const f = await fixture(), login = await auth.login({ assertion: reader.username, username: reader.username, credential: password });
    const session = (await auth.sessionFromToken(login.token))!, principal = { ...f.principal, session };
    // Two seconds is not a race assertion: the held actual store read renews
    // while still active, then waits on PostgreSQL's clock past the old bound.
    const old = Number((await ctx.pool.query(`UPDATE auth_sessions SET idle_expires_at=clock_timestamp()+interval '2 seconds'
      WHERE session_id=$1 RETURNING floor(extract(epoch FROM idle_expires_at)*1000)::bigint AS ms`, [session.sessionId])).rows[0].ms);
    const original = f.repository.protectedDetails.bind(f.repository); let once = false;
    restore(vi.spyOn(f.repository, "protectedDetails").mockImplementation(async (...args) => {
      const result = await original(...args);
      if (!once) { once = true; expect(await dbNow()).toBeLessThan(old); await new SessionsRepository(ctx.pool).markSeen(session.sessionId);
        const renewed = (await auth.sessionFromToken(login.token))!; expect(renewed.idleExpiresAt.getTime()).toBeGreaterThan(old);
        await afterDb(old); }
      return result;
    }));
    expect((await f.service.detail(principal, "R2", f.r2)).family).toBe("R2"); expect(await dbNow()).toBeGreaterThan(old);
  }, 12_000);
  async function afterDb(deadline: number) {
    const stop = Date.now() + 5000;
    while (await dbNow() <= deadline) { if (Date.now() >= stop) throw Error("TEST_ONLY bounded DB clock wait exceeded"); await new Promise(resolve => setTimeout(resolve, 15)); }
  }
  it.each(["body", "held-error"] as const)("natural lease expiry AFTER last actual DB capture rejects %s at the terminal clock", async variant => {
    const f = await fixture(), login = await auth.login({ assertion: reader.username, username: reader.username, credential: password });
    const session = (await auth.sessionFromToken(login.token))!, principal = { ...f.principal, session };
    if (variant === "held-error") restore(vi.spyOn(f.repository, "identityCandidate").mockRejectedValue(Error(PRIVATE)));
    const confirm = f.access.confirmReadContext.bind(f.access); let captured = false;
    restore(vi.spyOn(f.access, "confirmReadContext").mockImplementation(async (...args) => {
      const deadline = Number((await ctx.pool.query(`UPDATE auth_sessions SET idle_expires_at=clock_timestamp()+interval '1200 milliseconds'
        WHERE session_id=$1 RETURNING floor(extract(epoch FROM least(idle_expires_at,absolute_expires_at))*1000)::bigint AS ms`, [session.sessionId])).rows[0].ms);
      const current = await confirm(...args); expect(current.actor_lease_until_ms).toBe(deadline); captured = true;
      await afterDb(deadline + 10); return current;
    }));
    await refused(f.service.detail(principal, "R2", f.r2), 403, "OPERATIONAL_READ_AUTHORITY_REQUIRED"); expect(captured).toBe(true);
  }, 12_000);
  it.each(["native", "field"] as const)("terminal %s deadline after genuine last Core capture still suppresses the body", async variant => {
    const f = await fixture(variant === "native" ? { nativeTtlMs: 60_000 } : { fieldTtlMs: 60_000 });
    const login = await auth.login({ assertion: reader.username, username: reader.username, credential: password });
    const session = (await auth.sessionFromToken(login.token))!, principal = { ...f.principal, session };
    const deadline = variant === "native" ? f.facts[0]!.expires_at_ms! : f.policy.parent_read_fields![0]!.valid_until_ms;
    const confirm = f.access.confirmReadContext.bind(f.access); let captured = false;
    restore(vi.spyOn(f.access, "confirmReadContext").mockImplementation(async (...args) => {
      const current = await confirm(...args); expect(await dbNow()).toBeLessThan(deadline); captured = true;
      expect(current.actor_lease_until_ms!).toBeGreaterThan(deadline + 10);
      // No fabricated positive context: actual Core/source captures above are
      // retained. Move only the terminal clock past the stored source/policy
      // deadline, as the existing operational-current terminal-clock tests do.
      // Natural PostgreSQL session expiry is tested separately above.
      restore(vi.spyOn(Date, "now").mockReturnValue(deadline + 10)); return current;
    }));
    await refused(f.service.detail(principal, "R2", f.r2), variant === "native" ? 404 : 503,
      variant === "native" ? "OPERATIONAL_READ_NOT_FOUND" : "GOVERNANCE_PARENT_FIELD_PURPOSE_UNAVAILABLE"); expect(captured).toBe(true);
  }, 12_000);

  /** Initial INSERTs under the actual guards, not corruption by disabling
   * immutability. Positive producer captures above remain distinct fixtures. */
  async function seededR2(f: Fixture, options: { count?: number; schema?: string; extra?: Record<string, unknown> } = {}) {
    const id = next(), entries = Array.from({ length: options.count ?? 1 }, (_, index) => evidence(index, new Date(Date.now() - 120_000), options.schema));
    await approval(f.workspace, id, "R2", f.deployment, entries, options.extra);
    await insert("governance_approval_analytics_scopes", { approval_id: id, workspace_id: f.workspace, portfolio_id: f.portfolio, currency: "USDT" });
    await insert("governance_r2_lineage", { r2_approval_id: id, workspace_id: f.workspace, r1_approval_id: f.r1,
      grant_id: f.risk, grant_name: PRIVATE, approver_role: "ADMIN", plan_author_user_id: owner.user.userId, plan_author_username: PRIVATE });
    return id;
  }
  it("initially expired immutable approval remains a historical read; GET cannot refresh or rewrite it", async () => {
    const f = await fixture(), now = await dbNow();
    const id = await seededR2(f, { extra: { status: "EXPIRED", quorum_met: 0, decision_actor_ids: [], decided_by_user_id: null,
      created_at: new Date(now - 3 * 86_400_000), updated_at: new Date(now - 86_400_000), decided_at: new Date(now - 86_400_000),
      sla_due_at: new Date(now - 2 * 86_400_000), expires_at: new Date(now - 86_400_000) } });
    const before = await businessState(f), body = await read(f, "R2", id);
    expect(body.approval.status).toBe("EXPIRED"); expect(body.approval.expires_at_ms).toBeLessThan(await dbNow());
    expect(await businessState(f)).toEqual(before);
    await expect(ctx.pool.query("UPDATE governance_approval_requests SET expires_at=expires_at+interval '1 microsecond' WHERE approval_id=$1", [id]))
      .rejects.toMatchObject({ code: "55000" });
  });
  it.each(["manifest", "infinite-timestamp", "BC-timestamp"] as const)("actual PG %s corruption is a fixed safe error, not an authority or prose oracle", async variant => {
    const f = await fixture();
    const extra = variant === "manifest" ? { evidence_set_hash: accessDigest("TEST_ONLY-wrong-manifest") }
      : { created_at: variant === "BC-timestamp" ? "0001-01-01 00:00:00 BC" : "-infinity" };
    const id = await seededR2(f, { extra }), trace: string[] = [], confirm = f.access.confirmReadContext.bind(f.access);
    restore(vi.spyOn(f.access, "confirmReadContext").mockImplementation(async (...args) => { trace.push("LAST_CORE"); return confirm(...args); }));
    await refused(read(f, "R2", id), 503, "GOVERNANCE_PARENT_INTEGRITY_UNAVAILABLE"); expect(trace).toEqual(["LAST_CORE"]);
  });
  it.each([256, 257])( "evidence cap %i is enforced on exact scoped SQL, not after JS truncation", async count => {
    const f = await fixture(), id = await seededR2(f, { count });
    if (count === 256) expect((await read(f, "R2", id)).approval.approval_id).toBe(id);
    else await refused(read(f, "R2", id), 503, "OPERATIONAL_READ_RESPONSE_BOUND");
    expect(f.sql.some(sql => /governance_approval_evidence/.test(sql) && /LIMIT 257/.test(sql) && /octet_length/.test(sql))).toBe(true);
  });
  it("row-byte bound counts UTF-8 before JS decode and a huge unrelated sibling cannot hide a readable root", async () => {
    const f = await fixture(), huge = await seededR2(f, { schema: "界".repeat(12_000) });
    await refused(read(f, "R2", huge), 503, "OPERATIONAL_READ_RESPONSE_BOUND");
    expect((await read(f, "R2")).approval.approval_id).toBe(f.r2); finite(await read(f, "R2"));
  });
  it("cumulative SQL budget rejects many individually sub-32KiB rows before materializing an unbounded raw snapshot", async () => {
    const f = await fixture(), id = await seededR2(f, { count: 80, schema: "界".repeat(9000) });
    // Each manifest row is ~27KiB, but the exact own cohort exceeds2MiB.
    await refused(read(f, "R2", id), 503, "OPERATIONAL_READ_RESPONSE_BOUND"); expect(f.held()).toBe(0);
  });
  async function seededPaper(f: Fixture, options: { findingCount?: number; partial?: boolean; foreignPanel?: boolean; wrongHash?: boolean } = {}) {
    const stored = (await f.exits.detail(f.workspace, f.paper))!, id = next();
    const entries = stored.evidence.map(item => ({ ...item, evidenceId: next() }));
    const manifest = computeEvidenceManifestHash(entries);
    const panels = options.partial ? [] : stored.panels.map(item => ({ ...item, panelId: next() }));
    // Keep the genuine FK and UNIQUE(panel_id,ordinal). A cross-review panel
    // must reach the reader; reusing ordinal0 would fail INSERT first.
    const foreignOrdinal = options.foreignPanel ? Number((await ctx.pool.query<{ ordinal: number }>(
      "SELECT COALESCE(max(ordinal),-1)+1 AS ordinal FROM governance_paper_exit_findings WHERE panel_id=$1",
      [stored.panels[0]!.panelId])).rows[0]!.ordinal) : 0;
    const findings = options.partial ? [] : Array.from({ length: options.findingCount ?? 4 }, (_, index) => ({
      ...stored.findings[index % stored.findings.length]!, findingId: next(),
      panelId: options.foreignPanel && index === 0 ? stored.panels[0]!.panelId : panels[index % panels.length]!.panelId,
      ordinal: options.foreignPanel && index === 0 ? foreignOrdinal : Math.floor(index / panels.length),
      metricKey: `TEST_ONLY_metric_${index}`, label: PRIVATE,
    }));
    const lineage = options.partial ? [] : stored.lineage.map(item => ({ ...item, lineageId: next(),
      ...(item.kind === "EVIDENCE_PACK" ? { value: id, digest: manifest } : {}) }));
    const review = { ...stored.review, reviewId: id, evidencePackId: id, evidencePackDigest: manifest };
    const hash = computePaperExitSourceSnapshotHash({ review, approval: { evidenceSetHash: manifest }, lineage, panels, findings });
    await approval(f.workspace, id, "PAPER_EXIT", f.deployment, entries);
    await insert("governance_paper_exit_reviews", { review_id: id, workspace_id: f.workspace, deployment_id: f.deployment,
      portfolio_id: f.portfolio, venue: review.venue, promote_to: review.promoteTo, artifact_digest: review.artifactDigest,
      r1_approval_id: f.r1, r2_approval_id: f.r2, observation_policy_id: review.observationPolicyId,
      observation_policy_version: review.observationPolicyVersion, observation_policy_digest: review.observationPolicyDigest,
      evidence_pack_id: id, evidence_pack_digest: manifest, evaluation_policy_version: review.evaluationPolicyVersion,
      evaluation_formula_version: review.evaluationFormulaVersion, source_snapshot_hash: options.wrongHash ? accessDigest(PRIVATE) : hash,
      observation_summary: PRIVATE, recommendation: PRIVATE });
    for (const row of lineage) await insert("governance_paper_exit_lineage", { lineage_id: row.lineageId, review_id: id,
      ordinal: row.ordinal, kind: row.kind, label: row.label, value: row.value, href: row.href,
      digest: row.digest, source_authority: row.sourceAuthority, required: row.required });
    for (const row of panels) await insert("governance_paper_exit_panels", { panel_id: row.panelId, review_id: id,
      ordinal: row.ordinal, panel_kind: row.panelKind, title: row.title, source_authority: row.sourceAuthority,
      source_reference: row.sourceReference, source_href: row.sourceHref, panel_state: row.panelState, reason: row.reason,
      as_of: row.asOf, freshness_state: row.freshnessState, source_completeness: row.sourceCompleteness,
      poll_interval_ms: row.pollIntervalMs, formula_version: row.formulaVersion });
    for (const row of findings) await insert("governance_paper_exit_findings", { finding_id: row.findingId, review_id: id,
      panel_id: row.panelId, ordinal: row.ordinal, metric_key: row.metricKey, label: row.label, outcome: row.outcome,
      blocking: row.blocking, required: row.required, carries_to: row.carriesTo, exact_value: row.exactValue,
      unit: row.unit, currency: row.currency, threshold_value: row.thresholdValue, source_label: row.sourceLabel,
      source_href: row.sourceHref, evidence_hash: row.evidenceHash, formula_version: row.formulaVersion, as_of: row.asOf });
    return id;
  }
  it.each([256, 257])("Paper finding cap %i uses genuine constrained rows and an initially matching complete source hash", async count => {
    const f = await fixture(), id = await seededPaper(f, { findingCount: count });
    if (count === 256) {
      const body = await read(f, "PAPER_EXIT", id);
      expect(body.family === "PAPER_EXIT" && body.evaluation.availability === "AVAILABLE" && body.evaluation.findings.length).toBe(256);
    } else await refused(read(f, "PAPER_EXIT", id), 503, "OPERATIONAL_READ_RESPONSE_BOUND");
  });
  it.each(["cross-review-panel", "wrong-source-hash"] as const)("initially inserted Paper %s refuses rather than faking source validity", async variant => {
    const f = await fixture(), id = await seededPaper(f, { foreignPanel: variant === "cross-review-panel", wrongHash: variant === "wrong-source-hash" });
    await refused(read(f, "PAPER_EXIT", id), 503, "GOVERNANCE_PARENT_INTEGRITY_UNAVAILABLE");
  });
  it("self-consistent missing Paper children stay empty/partial, never fabricated as accepted panels or lineage", async () => {
    const f = await fixture(), id = await seededPaper(f, { partial: true }), body = await read(f, "PAPER_EXIT", id);
    expect(body.family).toBe("PAPER_EXIT");
    if (body.family === "PAPER_EXIT" && body.evaluation.availability === "AVAILABLE") {
      expect(body.evaluation.panels).toEqual([]); expect(body.evaluation.findings).toEqual([]);
    } else throw Error("TEST_ONLY expected qualified finite evaluation section");
    expect(body.source.source_verdict).toBe("NOT_ASSERTED"); finite(body);
  });
  it("legal same-millisecond PG lifecycle change invalidates the private equality witness without changing the public timestamp type", async () => {
    const f = await fixture(), selected = (await f.repository.identityCandidate(f.workspace, "R2", f.r2))!;
    await ctx.pool.query(`UPDATE governance_approval_requests SET updated_at=date_trunc('milliseconds',updated_at)
      +interval '1100 microseconds' WHERE approval_id=$1`, [f.r2]);
    const before = (await read(f, "R2")).approval.updated_at_ms;
    const snapshot = await f.repository.protectedDetails(selected, undefined, { includeCurrency: true });
    await ctx.pool.query("UPDATE governance_approval_requests SET updated_at=updated_at+interval '1 microsecond' WHERE approval_id=$1", [f.r2]);
    expect(await f.repository.isUnchanged(selected, snapshot.revision, undefined, { includeCurrency: true })).toBe(false);
    expect((await read(f, "R2")).approval.updated_at_ms).toBe(before); expect(Number.isSafeInteger(before)).toBe(true);
  });
  it("actual Portal Paper snapshot uses unchanged production hash, with private reason/value/URL bytes never returned", async () => {
    const f = await fixture(), stored = (await f.exits.detail(f.workspace, f.paper))!;
    expect(computePaperExitSourceSnapshotHash(stored)).toBe(stored.review.sourceSnapshotHash);
    const body = await read(f, "PAPER_EXIT");
    expect(body.family).toBe("PAPER_EXIT");
    if (body.family === "PAPER_EXIT" && body.lineage.availability === "AVAILABLE") expect(body.lineage.source_snapshot_hash).toBe(stored.review.sourceSnapshotHash);
    finite(body);
  });
});
