import {ActivationController} from "../src/activation/activation.controller";
import {ActivationRepository} from "../src/activation/activation.repository";
import {ActivationService} from "../src/activation/activation.service";
import {StagedActivationPlanRequestSchema} from "../src/activation/contracts";
import {CurrentActivationRepository} from "../src/activation/current-activation.repository";
import {CurrentActivationReads} from "../src/activation/current-activation.service";
import {currentActivationCapabilities,currentActivationPlanRead} from "../src/activation/current-activation.contract";
import { FollowingParentRepository,type FollowingFamily } from "../src/governance/following-parent.repository";
import { FollowingParentReads } from "../src/governance/following-parent.service";
import { followingParentRead, followingSteps } from "../src/governance/following-parent.contract";
import { SandboxCertificationController } from "../src/sandbox/sandbox-certification.controller";
import { SandboxCertificationService, evaluateSandboxCertification } from "../src/sandbox/sandbox-certification.service";
import { SandboxCertificationRepository } from "../src/sandbox/sandbox-certification.repository";
import { CanaryController } from "../src/canary/canary.controller";
import { CanaryService } from "../src/canary/canary.service";
import { LiveParentRepository } from "../src/governance/live-parent.repository";
import { LiveParentReads } from "../src/governance/live-parent.service";
import { liveParentRead } from "../src/governance/live-parent.contract";
import { LiveOperationsService } from "../src/live/live-operations.service";
import {LiveOperationsController} from "../src/live/live-operations.controller";
import {ProfileReadService} from "../src/profile-read/profile-read.service";
import {ExecutionProductReadSource} from "../src/execution/product-read-source";
import {SCOPED_LIVE_SPECS} from "../src/profile-read/scoped-live-source";
import {liveSourceOperationsRead} from "../src/live/live-source.contract";
import type {ProfileProjectionDocument,ProjectionRow} from "../src/execution/profile-projection.repository";
import type {ExecutionReadPublication,ExecutionReadPublicationRequest} from "../src/execution-v2/read-publication";
import {BUSINESS_READ_FIELDS} from "../src/execution-v2/read-fields";
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
import { GovernanceRepository, type EvidenceRecord } from "../src/governance/governance.repository";
import { OperationalReadRepository } from "../src/operations/operational-read.repository";
import { OperationalReadService } from "../src/operations/operational-read.service";
import { ExecutionOperationsRepository } from "../src/operations/operations.repository";
import { operationalWorkflow } from "../src/operations/operational-read.contract";
import { computeEvidenceManifestHash } from "../src/governance/evidence-manifest";
import { ExecutionProfileProjectionRepository, projectionDigest } from "../src/execution/profile-projection.repository";
import { ExecutionOperationsService } from "../src/operations/operations.service";
import { OperationalCompositionService } from "../src/execution/operational-composition.service";
import { OperationalCompositionController } from "../src/execution/operational-composition.controller";
import { OperationsWorkflowService } from "../src/operations/workflow.service";
import { PositiveParentRepository, type PositiveParentFamily } from "../src/governance/positive-parent.repository";
import { PositiveParentReads } from "../src/governance/positive-parent.service";
import { r2ParentRead, paperExitParentRead, r2ParentOperationRead, paperExitParentOperationRead } from "../src/governance/positive-parent.contract";
import { parentFieldSetDigest, type ParentFieldPurpose, type ParentReadFieldSeal } from "../src/execution-v2/parent-read-fields";
import type { AccessActor, AccessResource, ReviewedAccessPolicy, ScopedAccessGrant } from "../src/execution-v2/access.contract";
import { accessDigest, canonicalSelector, type AccessRelations } from "../src/execution-v2/access-policy";
import { AccessRepository } from "../src/execution-v2/access.repository";
import { currentAccessRelations, grantBindingDigest, type CurrentAccessRelations } from "../src/execution-v2/access-current-relations";
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
  async function approval(workspace: string, id: string, gate: "R1" | "R2" | "PAPER_EXIT" | "LIVE_GATE", subject: string, entries: EvidenceRecord[],
    extra: Record<string, unknown> = {}) {
    const now = await dbNow();
    await insert("governance_approval_requests", { approval_id: id, workspace_id: workspace, gate,
      subject_type: gate === "R1" ? "ALPHA_VERSION" : "DEPLOYMENT", subject_id: subject, subject_label: PRIVATE,
      environment: gate === "R1" ? "RESEARCH" : gate === "LIVE_GATE" ? "LIVE" : "PAPER", target_label: PRIVATE,
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
  type FixtureOptions = { activation?:boolean; grantTtlMs?:number; purposes?: ParentFieldPurpose[]; account?: Account; gate?: boolean; pendingAnchor?: "DEPLOYMENT" | "PORTFOLIO" | "ROOT";
    nativeTtlMs?: number; fieldTtlMs?: number; operationFieldTtlMs?: number; unrelatedAudit?: boolean; nativeEnvironment?:"paper"|"sandbox"|"live";
    liveRoot?:boolean; gateAction?:ScopedAccessGrant["action"] };
  async function fixture(options: FixtureOptions = {}) {
    if(options.activation&&options.liveRoot)throw Error("TEST_ONLY mixed parent scope is not a fixture authority");
    const env=options.nativeEnvironment??"paper";
    const account = options.account ?? reader, data = await captured(account), now = await dbNow();
    const purposes:ParentFieldPurpose[] = options.purposes ?? (options.activation?
      ["ACTIVATION_CAPABILITIES","ACTIVATION_PLAN_ROOT","ACTIVATION_PLAN_EVIDENCE","ACTIVATION_PLAN_COMPATIBILITY"]:
      ["R2_ROOT", "R2_LINEAGE", "PAPER_EXIT_ROOT", "PAPER_EXIT_REVIEW", "PAPER_EXIT_LINEAGE"]);
    const seals: ParentReadFieldSeal[] = purposes.map(purpose => ({ purpose, environment: env, contract_revision: "portal.execution.parent-fields.v1",
      field_policy_ref: `TEST_ONLY:${purpose}`, field_set_sha256: parentFieldSetDigest(purpose), valid_from_ms: now - 60_000,
      valid_until_ms: now + (purpose === "DECISION_OPERATION" ? options.operationFieldTtlMs ?? options.fieldTtlMs ?? 600_000 : options.fieldTtlMs ?? 600_000) }));
    const policy: ReviewedAccessPolicy = { workspace_id: data.workspace, revision: next(), artifact_digest: accessDigest(next()),
      approval_ref: "TEST_ONLY-not-owner-runtime-review", state: "REVIEWED", qualification: "TEST_ONLY",
      protected_owner_user_id: owner.user.userId, researcher_fields: { state: "PENDING", policy_ref: null, fields: [] }, parent_read_fields: seals };
    const targets: AccessResource[] = options.activation?[{kind:"ROOT",id:next()}]:[
      {kind:"DEPLOYMENT",id:data.deployment},...(options.liveRoot?[]:[{kind:"PORTFOLIO" as const,id:data.portfolio}])];
    const base = (action: ScopedAccessGrant["action"], target: AccessResource): ScopedAccessGrant => ({ grant_id: next(),
      workspace_id: data.workspace, subject_user_id: account.user.userId, action, effect: "ALLOW",
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: target.kind, ids: [target.id] }, environments: [env],
      valid_from_ms: now - 60_000, valid_until_ms: now + (action==="maintenance.read"?options.grantTtlMs??600_000:600_000), delegable_actions: [], issued_by: owner.user.userId,
      parent_grant_id: null, revision: next(), policy_revision: policy.revision, revoked_at_ms: null,
      requires_ts_acceptance: action === "audit.read", ts_receipt: null, field_policy_ref: null });
    const audits = seals.flatMap(seal => targets.map(target => ({ ...base("audit.read", target), field_policy_ref: seal.field_policy_ref })));
    const gate = base(options.gateAction??(options.activation?"maintenance.read":options.liveRoot?"governance.live.read":
      env==="live"?"governance.canary.read":"governance.r2.read"),targets[0]!);
    const unrelatedAudits = options.unrelatedAudit ? targets.map(target => ({ ...base("audit.read",target),
      requires_ts_acceptance:false, field_policy_ref:null })) : [];
    const artifact: ReviewedPolicyArtifact = { policy, root_grants: [...audits, ...unrelatedAudits,
      ...(options.gate === false ? [] : [gate])], provenance_ref: "TEST_ONLY-parent-reviewed-artifact" };
    const mapping = next(), tsUser = next();
    const facts: TsRootMembershipAcceptance[] = audits.map(grant => ({ context: "REVIEWED_POLICY_ROOT", source: "TEST_ONLY-parent-source",
      source_contract: "TEST_ONLY-normalized-root", trust_profile: "TEST_ONLY", receipt_id: next(), portal_user_id: account.user.userId,
      ts_user_id: tsUser, mapping_revision: mapping, human_requester_user_id: owner.user.userId, workspace_id: data.workspace,
      action: "audit.read", selector_digest: accessDigest(canonicalSelector(grant.selector)), environments: [env],
      previous_membership_revision: null, membership_revision: next(), effective_at_ms: now - 1000, expires_at_ms: now + (options.nativeTtlMs ?? 600_000),
      outcome: "ACCEPTED", payload_digest: accessDigest(next()), provenance_ref: "TEST_ONLY-not-native-proof", policy_revision: policy.revision,
      policy_artifact_digest: policy.artifact_digest, policy_install_digest: accessDigest(artifact), approval_ref: policy.approval_ref,
      grant_id: grant.grant_id, grant_digest: accessDigest(grant), expected_grant_revision: grant.revision }));
    const source: CurrentAccessRelations = { schema_version: "pma.core-current-relations.v1", subject_user_id: account.user.userId,
      workspace_id: data.workspace, ts_user_id: tsUser, mapping_revision: mapping, resources: [{ environment: env, revision: next(),
        own_alpha_ids: [], member_portfolio_ids: [], roots: options.activation?[{root_id:targets[0]!.id,revision:next(),complete:true,resources:[{kind:"DEPLOYMENT",id:data.deployment}]}]:[] }], grants: audits.map((grant, index) => ({ grant_id: grant.grant_id,
        binding_digest: grantBindingDigest(grant), accepted: structuredClone(facts[index]!), targets: [{ resource: targets[index % targets.length]!,
          environment: env, revision: next(), native_reference_digest: accessDigest(next()), valid_from_ms: now - 1000,
          valid_until_ms: now + (options.nativeTtlMs ?? 600_000) }] })) };
    // These are bounded requested-perspective TEST_ONLY authorities, not an
    // installed all-family operator publication or a measured capacity receipt.
    expect(source.grants.length).toBeLessThanOrEqual(64);
    expect(Buffer.byteLength(JSON.stringify(source),"utf8")).toBeLessThanOrEqual(32768);
    expect(currentAccessRelations.safeParse(source).success).toBe(true);
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
    const followingRepository=new FollowingParentRepository(trackedPool),followingService=new FollowingParentReads(followingRepository,access,scopes);
    const activationRepository=new CurrentActivationRepository(trackedPool),activationService=new CurrentActivationReads(activationRepository,access);
    const liveRepository=new LiveParentRepository(trackedPool),liveService=new LiveParentReads(liveRepository,access);
    const principal: ReadScopePrincipal = { user: account.user, session: account.session, workspaceId: data.workspace, viewerWorkspaceId: data.workspace };
    return { ...data, account, policy, artifact, gate, audits, accepted, facts, source, targets, grants, trust, forbidden, relations,
      access, scopes, repository, service, followingRepository,followingService,activationRepository,activationService,liveRepository,liveService,principal, sql, held: () => held };
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
  async function withHttp<T>(f: Fixture, run: (http: FastifyInstance, legacy: ReturnType<typeof vi.fn>, current: OperationalReadService) => Promise<T>, liveSource?:LiveOperationsService): Promise<T> {
    const current = new OperationalReadService(new OperationalReadRepository(ctx.pool), f.access, f.scopes, f.config);
    const legacy = vi.fn(async () => { throw Error(PRIVATE); });
    const deniedLegacy = { list: legacy, detail: legacy, r2Detail: legacy, liveDetail: legacy, r1Detail: legacy, operation: legacy };
    const compositions = new OperationalCompositionService(f.config,
      { sourceHealth: legacy } as never,
      { snapshot: legacy, snapshotMetadata: legacy, rawSnapshot: legacy } as never,
      deniedLegacy as never, deniedLegacy as never, deniedLegacy as never, deniedLegacy as never,
      deniedLegacy as never, deniedLegacy as never,
      new WorkspacesRepository(ctx.pool, f.config), f.scopes, undefined, f.service, f.liveService);
    // Existing GovernanceController, no test-only route or replacement guard.
    // Main must wire PositiveParentReads into the two established GET branches.
    const app = await NestFactory.create<NestFastifyApplication>({ module: PositiveParentTestModule,
      controllers: [GovernanceController, OperationalCompositionController,SandboxCertificationController,CanaryController,ActivationController,LiveOperationsController],
      providers: [SessionGuard, { provide: AuthService, useValue: auth }, { provide: CONTROL_API_CONFIG, useValue: f.config },
        { provide: WorkspacesRepository, useValue: new WorkspacesRepository(ctx.pool, f.config) },
        { provide: GovernanceService, useValue: deniedLegacy }, { provide: PaperExitService, useValue: deniedLegacy },
        { provide: GovernanceReviewCaptureService, useValue: deniedLegacy }, { provide: ExecutionOperationsService, useValue: deniedLegacy },
        { provide: OperationsWorkflowService, useValue: deniedLegacy }, { provide: ExecutionReadScopes, useValue: f.scopes },
        { provide: PositiveParentReads, useValue: f.service }, { provide: OperationalReadService, useValue: current },
        { provide: LiveParentReads, useValue: f.liveService },
        { provide: LiveOperationsService, useValue:liveSource??{detail:legacy} },
        {provide:FollowingParentReads,useValue:f.followingService},
        {provide:CurrentActivationReads,useValue:f.activationService},{provide:ActivationService,useValue:{capabilities:legacy,detail:legacy}},
        {provide:SandboxCertificationService,useValue:new SandboxCertificationService(deniedLegacy as never,deniedLegacy as never,f.scopes,f.followingService)},
        {provide:CanaryService,useValue:new CanaryService(deniedLegacy as never,deniedLegacy as never,deniedLegacy as never,f.scopes,f.followingService)},
        { provide: OperationalCompositionService, useValue: compositions }] }, new FastifyAdapter(), { logger: false, abortOnError: false });
    try { app.useGlobalFilters(new HttpErrorFilter()); await app.register(cookiePlugin as never); await app.init();
      const http = app.getHttpAdapter().getInstance<FastifyInstance>(); await http.ready(); return await run(http, legacy, current);
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
  async function afterDb(deadline: number, maximumWaitMs = 5000) {
    const stop = Date.now() + maximumWaitMs;
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
  async function seededPaper(f: Fixture, options: { findingCount?: number; partial?: boolean; foreignPanel?: boolean; wrongHash?: boolean;
    approvalExtra?: Record<string, unknown> } = {}) {
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
    await approval(f.workspace, id, "PAPER_EXIT", f.deployment, entries, options.approvalExtra);
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
  // N04-parent-operation: TEST_ONLY initial plan seeds obey real constraints
  // and guards. They are NOT actual source decisions or historical attestation.
  const operationPurposes: ParentFieldPurpose[] = ["R2_ROOT", "PAPER_EXIT_ROOT", "DECISION_OPERATION"];
  const operationPath = (f: Fixture, id: string) =>
    "/api/v1/execution/operations/"+encodeURIComponent(id)+"?workspace_id="+encodeURIComponent(f.workspace);
  async function seedOperation(f: Fixture, family: PositiveParentFamily, options: {
    id?: string; status?: "PLANNED" | "APPLIED" | "EXPIRED"; expired?: boolean; wrongHash?: boolean; wrongSource?: boolean;
  } = {}) {
    const id = options.id ?? next(), status = options.status ?? "PLANNED", now = await dbNow();
    const a = (await ctx.pool.query("SELECT evidence_set_hash FROM governance_approval_requests WHERE approval_id=$1", [idFor(f,family)])).rows[0];
    const common = { operation_id:id,workspace_id:f.workspace,actor_user_id:owner.user.userId,request_key:next(),
      command_version:1,payload_hash:accessDigest(PRIVATE),reason:PRIVATE,evidence_set_hash:options.wrongHash ? accessDigest(next()) : a.evidence_set_hash,
      evidence_hashes:[],blocker_codes:["TEST_ONLY_BLOCKED"],warning_codes:[],apply_key_id:PRIVATE,
      apply_token_hash:"1".repeat(64),status,response_json:status === "APPLIED" ? { TEST_ONLY_PRIVATE:PRIVATE } : null,
      created_at:new Date(now-120_000),expires_at:new Date(options.expired ? now-60_000 : now+60_000),
      applied_at:status === "APPLIED" ? new Date(now-90_000) : null };
    if (family === "R2") {
      const parent = (await ctx.pool.query("SELECT evidence_set_hash FROM governance_approval_requests WHERE approval_id=$1", [f.r1])).rows[0];
      await insert("governance_decision_plans", { ...common,approval_id:f.r2,command_type:"GOVERNANCE_R2_DECISION",decision:"DENY",
        expected_approval_version:2,quorum_required:1,policy_version:"TEST_ONLY-operation-policy",
        parent_approval_id:f.r1,parent_approval_version:1,parent_evidence_set_hash:parent.evidence_set_hash });
    } else {
      const review = (await ctx.pool.query("SELECT source_snapshot_hash FROM governance_paper_exit_reviews WHERE review_id=$1", [f.paper])).rows[0];
      await insert("governance_paper_exit_decision_plans", { ...common,review_id:f.paper,command_type:"GOVERNANCE_PAPER_EXIT_DECISION",decision:"REJECT",
        extension_days:null,expected_review_version:1,evaluation_state:"UNAVAILABLE",
        source_snapshot_hash:options.wrongSource ? accessDigest(next()) : review.source_snapshot_hash });
    }
    return id;
  }
  async function actualF0(f: Fixture, id = next()) {
    return (await new ExecutionOperationsRepository(ctx.pool).create({ operationId:id,workspaceId:f.workspace,actorUserId:owner.user.userId,
      requestKey:next(),commandKey:"account/sync",environment:"PAPER",targetType:"DEPLOYMENT",targetId:f.deployment,expectedTargetVersion:1,
      payloadHash:accessDigest(next()),planDigest:accessDigest(next()),conditions:[],riskTier:"R2_SANDBOX",
      blockerCodes:["COMMAND_RELAY_DISABLED"],warningCodes:[],expiresAt:new Date(await dbNow()+60_000),requestId:next(),auditEventId:next() })).record;
  }
  it("bounded operation identity preserves the nested selected JSON for parents, F0 and absent IDs",async()=>{
    const f=await fixture({purposes:operationPurposes});
    for(const family of families){
      const id=await seedOperation(f,family);
      expect(await f.repository.operationIdentityCandidate(f.workspace,id)).toEqual({kind:"PARENT",selected:{
        operationId:id,parent:{workspaceId:f.workspace,family,approvalId:idFor(f,family),
          r1ApprovalId:f.r1,r2ApprovalId:f.r2,deploymentId:f.deployment,portfolioId:f.portfolio,environment:"PAPER"}}});
    }
    const f0=await actualF0(f);
    expect(await f.repository.operationIdentityCandidate(f.workspace,f0.operationId)).toEqual({kind:"F0"});
    expect(await f.repository.operationIdentityCandidate(f.workspace,next())).toEqual({kind:"UNAVAILABLE"});
    expect(f.held()).toBe(0);
  });
  it.each(families.flatMap(family => (["PLANNED","APPLIED","EXPIRED"] as const).map(status => ({family,status}))))(
    "$family/$status selected HTTP DTO is finite, other-author readable, historical and no-GET-write", async ({family,status}) => {
      const f = await fixture({purposes:operationPurposes}), id = await seedOperation(f,family,{status,expired:true});
      expect(f.account.user.userId).not.toBe(owner.user.userId); expect(f.account.user.role).toBe("USER");
      const before = await businessState(f), privateRead = restore(vi.spyOn(f.repository,"protectedDetails"));
      await withHttp(f,async (http,legacy,current) => {
        const f0 = restore(vi.spyOn(current,"workflow"));
        const response = await http.inject({method:"GET",url:operationPath(f,id),headers:headers(f)});
        expect(response.statusCode,response.body).toBe(200); expect(response.headers["cache-control"]).toBe("private, no-store");
        const body=response.json(); (family==="R2"?r2ParentOperationRead:paperExitParentOperationRead).parse(body);
        expect(body).toMatchObject({schema_version:"portal.execution.governance-parent-operation.v2",operation_id:id,family,status,
          record_authority:"PORTAL",provenance_basis:"CURRENT_CORE_BASELINE",command_version:1,
          approval:{approval_id:idFor(f,family)},source:{source_verdict:"NOT_ASSERTED",source_side_effect_requested:false}});
        expect(body.expires_at_ms).toBeLessThan(await dbNow()); expect(body.status).toBe(status); // expiry never rewrites stored status
        expect(body).not.toHaveProperty("receipt"); expect(body).not.toHaveProperty("verification_result");
        expect(body).not.toHaveProperty("lineage"); expect(body).not.toHaveProperty("evaluation"); finite(body);
        expect(f0).not.toHaveBeenCalled(); expect(legacy).not.toHaveBeenCalled();
      });
      expect(privateRead).toHaveBeenCalledWith(expect.objectContaining({approvalId:idFor(f,family)}),id,{includeCurrency:false});
      expect(f.sql.join("\n")).not.toMatch(/s\.currency|l\.grant_id/);
      // Paper panel reason is an original hash preimage, not command content.
      // Keep the command SQL and finite public DTO privacy checks separate.
      const commandReads=f.sql.filter(sql=>/FROM\s+governance_(?:paper_exit_)?decision_plans\s+c\b/i.test(sql));
      expect(commandReads.length).toBeGreaterThan(0);
      expect(commandReads.join("\n")).not.toMatch(/\bc\.(?:response_json|reason|actor_user_id|apply_token_hash|apply_key_id)\b/);
      expect(await businessState(f)).toEqual(before); expect(f.held()).toBe(0); expect(f.forbidden).not.toHaveBeenCalled();
    });
  it.each(families)("actual %s createPlan producer is readable under current read authority, without creator/decide receipt disclosure",async family => {
    const f=await fixture({purposes:operationPurposes}), id=next();
    const own=(await ctx.pool.query("SELECT evidence_set_hash FROM governance_approval_requests WHERE approval_id=$1",[idFor(f,family)])).rows[0];
    const common={operationId:id,workspaceId:f.workspace,actor:owner.user,actorUserId:owner.user.userId,requestKey:next(),payloadHash:accessDigest(next()),
      decision:"DENY" as const,reason:PRIVATE,evidenceSetHash:own.evidence_set_hash,evidenceHashes:[],blockerCodes:["TEST_ONLY_BLOCKED"],warningCodes:[],
      applyKeyId:PRIVATE,applyTokenHash:"2".repeat(64),expiresAt:new Date(await dbNow()+60_000),requestId:next(),auditEventId:next(),outboxMessageId:next()};
    if(family==="R2") await new GovernanceRepository(ctx.pool).createPlan({...common,commandType:"GOVERNANCE_R2_DECISION",approvalId:f.r2,
      policyVersion:"TEST_ONLY-capture-policy",expectedApprovalVersion:2,quorumRequired:1,conditions:[]});
    else {
      const review=(await ctx.pool.query("SELECT source_snapshot_hash FROM governance_paper_exit_reviews WHERE review_id=$1",[f.paper])).rows[0];
      await f.exits.createPlan({...common,reviewId:f.paper,decision:"REJECT",extensionDays:null,expectedReviewVersion:1,
        sourceSnapshotHash:review.source_snapshot_hash,evaluationState:"UNAVAILABLE"});
    }
    const before=await businessState(f),body=await f.service.operationOrNull(f.principal,id);
    expect(body).toMatchObject({operation_id:id,family,status:"PLANNED",parent_approval_id:null,parent_approval_version:null,parent_evidence_set_hash:null});
    expect(await businessState(f)).toEqual(before); finite(body);
  });
  it.each(families)("%s ROOT-only permission does not authorize selected plan SQL",async family => {
    const f=await fixture({purposes:[purposeFor(family)]}),id=await seedOperation(f,family);
    const read=restore(vi.spyOn(f.repository,"protectedDetails")),confirm=restore(vi.spyOn(f.access,"confirmReadContext"));
    await refused(f.service.operationOrNull(f.principal,id),503,"GOVERNANCE_PARENT_FIELD_PURPOSE_UNAVAILABLE");
    expect(read).not.toHaveBeenCalled(); expect(confirm).toHaveBeenCalledOnce();
  });
  it.each(families.flatMap(family=>(["DEPLOYMENT","PORTFOLIO"] as const).map(anchor=>({family,anchor}))))(
    "$family operation seal needs its OWN current $anchor leaf, not an unrelated accepted ROOT leaf",async ({family,anchor})=>{
      const f=await fixture({purposes:operationPurposes}),id=await seedOperation(f,family),read=restore(vi.spyOn(f.repository,"protectedDetails"));
      const leaf=f.accepted.find(g=>g.field_policy_ref==="TEST_ONLY:DECISION_OPERATION"&&g.selector.kind==="EXPLICIT_RESOURCE_SET"&&g.selector.resource_kind===anchor)!;
      await f.grants.saveGrant({...leaf,revision:next(),revoked_at_ms:await dbNow()});
      await refused(f.service.operationOrNull(f.principal,id),503,"GOVERNANCE_PARENT_FIELD_PURPOSE_UNAVAILABLE");expect(read).not.toHaveBeenCalled();
    });
  it.each(["parent-parent","parent-f0","unknown"] as const)(
    "%s is current-fenced uniform not-found and never tries F0 or legacy",async variant=>{
      const f=await fixture({purposes:operationPurposes}),id=variant==="unknown"?next():await seedOperation(f,"R2");
      if(variant==="parent-parent") await seedOperation(f,"PAPER_EXIT",{id});
      if(variant==="parent-f0") await actualF0(f,id);
      const read=restore(vi.spyOn(f.repository,"protectedDetails"));
      await withHttp(f,async(http,legacy,current)=>{
        const f0=restore(vi.spyOn(current,"workflow")),confirm=restore(vi.spyOn(f.access,"confirmReadContext"));
        const response=await http.inject({method:"GET",url:operationPath(f,id),headers:headers(f)});
        expect(response.statusCode,response.body).toBe(404);expect(response.json().error.code).toBe("OPERATIONAL_READ_NOT_FOUND");
        expect(confirm).toHaveBeenCalledOnce();expect(f0).not.toHaveBeenCalled();expect(legacy).not.toHaveBeenCalled();finite(response.json());
      });
      expect(read).not.toHaveBeenCalled();
    });
  it("actual F0 keeps unchanged decoder/provenance; current change cannot become F0 fallback",async()=>{
    const f=await fixture(),record=await actualF0(f);
    await withHttp(f,async(http,legacy,current)=>{
      const workflow=restore(vi.spyOn(current,"workflow"));
      const response=await http.inject({method:"GET",url:operationPath(f,record.operationId),headers:headers(f)});
      expect(response.statusCode,response.body).toBe(200);operationalWorkflow.parse(response.json());expect(workflow).toHaveBeenCalledOnce();
      const original=f.repository.operationIdentityCandidate.bind(f.repository);
      restore(vi.spyOn(f.repository,"operationIdentityCandidate").mockImplementation(async(...args)=>{
        const route=await original(...args);expect(route.kind).toBe("F0");await revoke(f,"PORTFOLIO");return route;
      }));
      workflow.mockClear();
      const changed=await http.inject({method:"GET",url:operationPath(f,record.operationId),headers:headers(f)});
      expect(changed.statusCode).toBe(409);expect(changed.json().error.code).toBe("OPERATIONAL_READ_CHANGED");
      expect(workflow).not.toHaveBeenCalled();expect(legacy).not.toHaveBeenCalled();
    });
  });
  it.each(families.flatMap(family=>(["decode","equality"] as const).flatMap(stage=>
    (["core-deployment","core-portfolio","source-deployment","source-portfolio"] as const).map(change=>({family,stage,change})))) )(
    "$family selected operation $change after $stage stays behind final current fence",async({family,stage,change})=>{
      const f=await fixture({purposes:operationPurposes}),id=await seedOperation(f,family);let changed=false;
      const mutate=async()=>{if(changed)return;changed=true;expect(f.held()).toBe(0);
        const anchor=change.endsWith("deployment")?"DEPLOYMENT":"PORTFOLIO";
        if(change.startsWith("core"))await revoke(f,anchor);
        else for(const entry of f.source.grants)entry.targets=entry.targets.filter(t=>t.resource.kind!==anchor);
      };
      if(stage==="decode"){const original=f.repository.protectedDetails.bind(f.repository);restore(vi.spyOn(f.repository,"protectedDetails").mockImplementation(async(...args)=>{
        expect(args[1]).toBe(id);const snapshot=await original(...args);await mutate();return snapshot;}));}
      else{const original=f.repository.isUnchanged.bind(f.repository);restore(vi.spyOn(f.repository,"isUnchanged").mockImplementation(async(...args)=>{
        expect(args[2]).toBe(id);const same=await original(...args);expect(same).toBe(true);await mutate();return same;}));}
      await refused(f.service.operationOrNull(f.principal,id),change.startsWith("core")?409:404,change.startsWith("core")?"OPERATIONAL_READ_CHANGED":"OPERATIONAL_READ_NOT_FOUND");
      expect(changed).toBe(true);
    });
  it.each(["identity","private","equality"] as const)("selected operation held %s failure reaches genuine LAST Core after error assembly",async stage=>{
    const f=await fixture({purposes:operationPurposes}),id=await seedOperation(f,"R2"),trace:string[]=[];
    const confirm=f.access.confirmReadContext.bind(f.access);
    restore(vi.spyOn(f.access,"confirmReadContext").mockImplementation(async(...args)=>{trace.push("LAST_CORE");return confirm(...args);}));
    const fail=async()=>{expect(f.held()).toBe(0);trace.push("ERROR_ASSEMBLED");await revoke(f,"PORTFOLIO");throw Error(PRIVATE);};
    if(stage==="identity"){const original=f.repository.operationIdentityCandidate.bind(f.repository);restore(vi.spyOn(f.repository,"operationIdentityCandidate").mockImplementation(async(...args)=>{await original(...args);return fail();}));}
    else if(stage==="private"){const original=f.repository.protectedDetails.bind(f.repository);restore(vi.spyOn(f.repository,"protectedDetails").mockImplementation(async(...args)=>{await original(...args);return fail();}));}
    else{const original=f.repository.isUnchanged.bind(f.repository);restore(vi.spyOn(f.repository,"isUnchanged").mockImplementation(async(...args)=>{await original(...args);return fail();}));}
    await refused(f.service.operationOrNull(f.principal,id),409,"OPERATIONAL_READ_CHANGED");expect(trace).toEqual(["ERROR_ASSEMBLED","LAST_CORE"]);
  });
  it.each(families)("stored %s expected versions/pins stay historical after legal parent lifecycle advance",async family=>{
    const f=await fixture({purposes:operationPurposes}),id=await seedOperation(f,family);
    await ctx.pool.query("UPDATE governance_approval_requests SET approval_version=approval_version+1,updated_at=clock_timestamp() WHERE approval_id=ANY($1::text[])",[[f.r1,f.r2]]);
    await ctx.pool.query("UPDATE governance_paper_exit_reviews SET review_version=review_version+1,updated_at=clock_timestamp() WHERE review_id=$1",[f.paper]);
    const body=await f.service.operationOrNull(f.principal,id);expect(body?.expected_version).toBe(family==="R2"?2:1);
    if(family==="R2")expect(body?.parent_approval_version).toBe(1);finite(body);
  });
  it.each(["manifest","source"] as const)("selected operation initial %s mismatch is fixed safe error through final Core",async variant=>{
    const f=await fixture({purposes:operationPurposes}),id=await seedOperation(f,variant==="manifest"?"R2":"PAPER_EXIT",
      {wrongHash:variant==="manifest",wrongSource:variant==="source"}),confirm=restore(vi.spyOn(f.access,"confirmReadContext"));
    await refused(f.service.operationOrNull(f.principal,id),503,"GOVERNANCE_PARENT_INTEGRITY_UNAVAILABLE");expect(confirm).toHaveBeenCalledOnce();
  });

  it.each(["session","policy","operation-field-expiry","native-expiry"] as const)(
    "selected operation terminal %s suppresses body AFTER actual local equality and genuine last Core",async change=>{
      const account=await activated("USER"),f=await fixture({account,purposes:operationPurposes,
        ...(change==="native-expiry"?{nativeTtlMs:60_000}:change==="operation-field-expiry"?{operationFieldTtlMs:60_000}:{})}),id=await seedOperation(f,"PAPER_EXIT");
      if(change==="session"||change==="policy"){
        const original=f.repository.isUnchanged.bind(f.repository);let changed=false;
        restore(vi.spyOn(f.repository,"isUnchanged").mockImplementation(async(...args)=>{
          const same=await original(...args);expect(same).toBe(true);
          if(!changed){changed=true;
            if(change==="session")await ctx.pool.query("UPDATE auth_sessions SET state='REVOKED',revoked_at=clock_timestamp(),revoke_reason='TEST_ONLY operation' WHERE session_id=$1",[account.session.sessionId]);
            else await f.grants.putPolicy({...f.policy,revision:next()});
          }return same;
        }));
      }else{
        const deadline=change==="native-expiry"?f.facts[0]!.expires_at_ms!:f.policy.parent_read_fields!.find(s=>s.purpose==="DECISION_OPERATION")!.valid_until_ms;
        const confirm=f.access.confirmReadContext.bind(f.access);
        restore(vi.spyOn(f.access,"confirmReadContext").mockImplementation(async(...args)=>{
          const current=await confirm(...args);expect(await dbNow()).toBeLessThan(deadline);
          expect(current.actor_lease_until_ms!).toBeGreaterThan(deadline+10);
          restore(vi.spyOn(Date,"now").mockReturnValue(deadline+10));return current;
        }));
      }
      await refused(f.service.operationOrNull(f.principal,id),change==="session"?403:change==="policy"?409:change==="native-expiry"?404:503,
        change==="session"?"OPERATIONAL_READ_AUTHORITY_REQUIRED":change==="policy"?"OPERATIONAL_READ_CHANGED":
          change==="native-expiry"?"OPERATIONAL_READ_NOT_FOUND":"GOVERNANCE_PARENT_FIELD_PURPOSE_UNAVAILABLE");
    });
  it("a same-millisecond selected plan transition cannot pass the exact private revision check",async()=>{
    const f=await fixture({purposes:operationPurposes}),id=await seedOperation(f,"R2",{status:"APPLIED"});
    await ctx.pool.query("UPDATE governance_decision_plans SET applied_at=date_trunc('milliseconds',applied_at)+interval '100 microseconds' WHERE operation_id=$1",[id]);
    const candidate=await f.repository.operationIdentityCandidate(f.workspace,id);
    if(candidate.kind!=="PARENT")throw Error("TEST_ONLY expected exact parent metadata");
    const before=await f.service.operationOrNull(f.principal,id),snapshot=await f.repository.protectedDetails(candidate.selected.parent,id,{includeCurrency:false});
    await ctx.pool.query("UPDATE governance_decision_plans SET applied_at=applied_at+interval '1 microsecond' WHERE operation_id=$1",[id]);
    expect(await f.repository.isUnchanged(candidate.selected.parent,snapshot.revision,id,{includeCurrency:false})).toBe(false);
    expect((await f.service.operationOrNull(f.principal,id))?.applied_at_ms).toBe(before?.applied_at_ms);
  });
  it("a queue collision inserted after selected SQL is refused through the parent local equality fence, never F0 fallback",async()=>{
    const f=await fixture({purposes:operationPurposes}),id=await seedOperation(f,"R2"),original=f.repository.protectedDetails.bind(f.repository);let inserted=false;
    restore(vi.spyOn(f.repository,"protectedDetails").mockImplementation(async(...args)=>{
      const snapshot=await original(...args);
      if(!inserted){inserted=true;expect(f.held()).toBe(0);await actualF0(f,id);}
      return snapshot;
    }));
    await refused(f.service.operationOrNull(f.principal,id),404,"OPERATIONAL_READ_NOT_FOUND");expect(inserted).toBe(true);
  });

  it("foreign opposite-family collision is ignored; same-workspace unsupported ownership is not F0",async()=>{
    const f=await fixture({purposes:operationPurposes}),foreign=await fixture({purposes:operationPurposes}),id=await seedOperation(f,"R2");
    await seedOperation(foreign,"PAPER_EXIT",{id});
    expect(await f.service.operationOrNull(f.principal,id)).toMatchObject({operation_id:id,family:"R2"});
    const unsupported=next(),root=(await ctx.pool.query("SELECT evidence_set_hash FROM governance_approval_requests WHERE approval_id=$1",[f.r1])).rows[0];
    await insert("governance_decision_plans",{operation_id:unsupported,workspace_id:f.workspace,approval_id:f.r1,actor_user_id:owner.user.userId,
      request_key:next(),command_type:"GOVERNANCE_R1_DECISION",command_version:1,payload_hash:accessDigest(next()),decision:"DENY",reason:PRIVATE,
      expected_approval_version:1,quorum_required:1,evidence_set_hash:root.evidence_set_hash,evidence_hashes:[],apply_key_id:PRIVATE,
      apply_token_hash:"4".repeat(64),status:"PLANNED",created_at:new Date(await dbNow()-1000),expires_at:new Date(await dbNow()+60_000)});
    const read=restore(vi.spyOn(f.repository,"protectedDetails"));
    await withHttp(f,async(http,legacy,current)=>{
      const workflow=restore(vi.spyOn(current,"workflow"));
      const response=await http.inject({method:"GET",url:operationPath(f,unsupported),headers:headers(f)});
      expect(response.statusCode).toBe(404);expect(response.json().error.code).toBe("OPERATIONAL_READ_NOT_FOUND");
      expect(workflow).not.toHaveBeenCalled();expect(legacy).not.toHaveBeenCalled();
    });expect(read).not.toHaveBeenCalled();
  });
  it("queue-only unsupported workflow retains the existing F0-reader 503 instead of becoming an unknown parent",async()=>{
    const f=await fixture(),id=next(),now=new Date(await dbNow());
    await insert("execution_operation_queue_items",{operation_id:id,workspace_id:f.workspace,operation_kind:"EXECUTION_COMMAND",
      command_key:"account/sync",environment:"PAPER",target_type:"DEPLOYMENT",target_id:f.deployment,risk_tier:"R2_SANDBOX",severity:"WARNING",
      source_authority:"PORTAL",source_status:"BLOCKED",verification_result:"NOT_STARTED",triage_state:"UNACKNOWLEDGED",workflow_version:1,
      created_at:now,updated_at:now});
    await withHttp(f,async(http,legacy,current)=>{
      const workflow=restore(vi.spyOn(current,"workflow"));
      const response=await http.inject({method:"GET",url:operationPath(f,id),headers:headers(f)});
      expect(response.statusCode).toBe(503);expect(response.json().error.code).toBe("OPERATIONAL_READ_FAMILY_NOT_SUPPORTED");
      expect(workflow).toHaveBeenCalledOnce();expect(legacy).not.toHaveBeenCalled();
    });
  });

  // Operation-path negative addendum. Reuse the SAME fixture, real publisher,
  // HTTP controller and actual PG; no replacement guard/context/decoder.
  it.each(families.flatMap(family => (["before", "after"] as const).map(stage => ({ family, stage }))))(
    "$family operation actual read obligation lost $stage protected SQL never returns a body or falls back", async ({ family, stage }) => {
      // Owner remains a current principal after membership removal. This
      // makes Paper's actor_member obligation independently observable.
      const f = await fixture({ account: owner, purposes: operationPurposes }), id = await seedOperation(f, family);
      expect(await f.scopes.coreSelectionMode(f.principal)).toBe("SCOPED_V2");
      let changed = false;
      const mutate = async () => {
        if (changed) return; changed = true; expect(f.held()).toBe(0);
        if (family === "R2") await f.grants.saveGrant({ ...f.gate, grant_id: next(), revision: next(), effect: "DENY" }, true);
        else await ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [f.workspace, owner.user.userId]);
      };
      const original = f.repository.protectedDetails.bind(f.repository);
      const privateRead = restore(vi.spyOn(f.repository, "protectedDetails"));
      const confirm = restore(vi.spyOn(f.access, "confirmReadContext"));
      if (stage === "before") await mutate();
      else privateRead.mockImplementation(async (...args) => {
        expect(args[1]).toBe(id); const snapshot = await original(...args); await mutate(); return snapshot;
      });
      if (family === "PAPER_EXIT" && stage === "before") {
        // HTTP workspace() MUST reject a nonmember before entering the reader.
        // Exercise the actual operation service to prove its own member check,
        // with real Core (owner exception), policy and native audit facts.
        await refused(f.service.operationOrNull(f.principal, id), 404, "OPERATIONAL_READ_NOT_FOUND");
      } else await withHttp(f, async (http, legacy, current) => {
        const f0 = restore(vi.spyOn(current, "workflow"));
        const response = await http.inject({ method: "GET", url: operationPath(f, id), headers: headers(f) });
        expect(response.statusCode, response.body).toBe(stage === "before" ? 404 : 409);
        expect(response.json().error.code).toBe(stage === "before" ? "OPERATIONAL_READ_NOT_FOUND" : "OPERATIONAL_READ_CHANGED");
        finite(response.json()); expect(f0).not.toHaveBeenCalled(); expect(legacy).not.toHaveBeenCalled();
      });
      expect(changed).toBe(true); expect(confirm).toHaveBeenCalledOnce();
      if (stage === "before") expect(privateRead).not.toHaveBeenCalled();
      else expect(privateRead).toHaveBeenCalled();
      expect(f.held()).toBe(0);
    });

  it.each(["actor-generation", "session-lease", "field", "native"] as const)(
    "held operation error cannot cross genuine current %s loss/expiry", async variant => {
      const account = await activated("USER");
      const f = await fixture({ account, purposes: operationPurposes,
        ...(variant === "field" ? { operationFieldTtlMs: 8000 } : variant === "native" ? { nativeTtlMs: 8000 } : {}) });
      const id = await seedOperation(f, "PAPER_EXIT"), trace: string[] = [];
      const original = f.repository.protectedDetails.bind(f.repository);
      restore(vi.spyOn(f.repository, "protectedDetails").mockImplementation(async (...args) => {
        const snapshot = await original(...args); expect(snapshot.raw.operations[0]!.operation_id).toBe(id);
        expect(f.held()).toBe(0); trace.push("ERROR_ASSEMBLED");
        if (variant === "actor-generation") await ctx.pool.query(
          "UPDATE portal_users SET session_version=session_version+1 WHERE user_id=$1", [account.user.userId]);
        throw Error(PRIVATE); // Only after actual qualified, released SQL.
      }));
      const confirmActual = f.access.confirmReadContext.bind(f.access);
      const confirm = restore(vi.spyOn(f.access, "confirmReadContext").mockImplementation(async (...args) => {
        trace.push("LAST_CORE_ENTERED");
        let deadline: number | undefined;
        if (variant === "session-lease") deadline = Number((await ctx.pool.query(
          "UPDATE auth_sessions SET idle_expires_at=clock_timestamp()+interval '1200 milliseconds' WHERE session_id=$1 " +
          "RETURNING floor(extract(epoch FROM least(idle_expires_at,absolute_expires_at))*1000)::bigint AS ms",
          [account.session.sessionId])).rows[0].ms);
        const current = await confirmActual(...args); // No fabricated positive context.
        trace.push("LAST_CORE_CAPTURED");
        if (variant === "session-lease") expect(current.actor_lease_until_ms).toBe(deadline);
        else if (variant === "field") deadline = f.policy.parent_read_fields!.find(seal => seal.purpose === "DECISION_OPERATION")!.valid_until_ms;
        else if (variant === "native") deadline = f.facts[0]!.expires_at_ms!;
        if (deadline === undefined) throw Error("TEST_ONLY unexpected current actor confirmation");
        expect(await dbNow()).toBeLessThan(deadline);
        if (variant !== "session-lease") expect(current.actor_lease_until_ms!).toBeGreaterThan(deadline + 10);
        // Real DB/wall time only. The finite deadline was present in actual
        // policy/source/session facts at the genuine capture above.
        await afterDb(deadline + 10, 12_000); trace.push("DEADLINE_CROSSED");
        return current;
      }));
      await withHttp(f, async (http, legacy, current) => {
        const f0 = restore(vi.spyOn(current, "workflow"));
        const response = await http.inject({ method: "GET", url: operationPath(f, id), headers: headers(f) });
        expect(response.statusCode, response.body).toBe(variant === "field" ? 503 : variant === "native" ? 404 : 403);
        expect(response.json().error.code).toBe(variant === "field" ? "GOVERNANCE_PARENT_FIELD_PURPOSE_UNAVAILABLE" :
          variant === "native" ? "OPERATIONAL_READ_NOT_FOUND" : "OPERATIONAL_READ_AUTHORITY_REQUIRED");
        finite(response.json()); expect(f0).not.toHaveBeenCalled(); expect(legacy).not.toHaveBeenCalled();
      });
      expect(confirm).toHaveBeenCalledOnce();
      expect(trace).toEqual(variant === "actor-generation" ? ["ERROR_ASSEMBLED", "LAST_CORE_ENTERED"] :
        ["ERROR_ASSEMBLED", "LAST_CORE_ENTERED", "LAST_CORE_CAPTURED", "DEADLINE_CROSSED"]);
      expect(f.held()).toBe(0);
    }, 20_000);

  it.each(["malformed-id", "unsupported-command", "invalid-parent-join"] as const)(
    "operation %s is a current-fenced uniform404, never a F0 ownership proof", async variant => {
      const f = await fixture({ purposes: operationPurposes });
      const id = variant === "malformed-id" ? "TEST_ONLY.invalid+id" : next();
      if (variant !== "malformed-id") {
        const approvalId = variant === "invalid-parent-join" ? f.r1 : f.r2;
        const root = (await ctx.pool.query("SELECT evidence_set_hash FROM governance_approval_requests WHERE approval_id=$1", [approvalId])).rows[0];
        // One upfront legal constrained INSERT. No root/plan UPDATE, trigger
        // disable, missing FK, extra source acceptance or invented positive.
        await insert("governance_decision_plans", { operation_id: id, workspace_id: f.workspace,
          approval_id: approvalId, actor_user_id: owner.user.userId, request_key: next(),
          command_type: variant === "unsupported-command" ? "GOVERNANCE_LIVE_DECISION" : "GOVERNANCE_R2_DECISION",
          command_version: 1, payload_hash: accessDigest(next()), decision: "DENY", reason: PRIVATE,
          expected_approval_version: 1, quorum_required: 1, evidence_set_hash: root.evidence_set_hash, evidence_hashes: [],
          blocker_codes: ["TEST_ONLY_UNSUPPORTED_IDENTITY"], apply_key_id: PRIVATE, apply_token_hash: "5".repeat(64),
          status: "PLANNED", created_at: new Date(await dbNow() - 1000), expires_at: new Date(await dbNow() + 60_000) });
      }
      const identity = restore(vi.spyOn(f.repository, "operationIdentityCandidate"));
      const privateRead = restore(vi.spyOn(f.repository, "protectedDetails"));
      const confirm = restore(vi.spyOn(f.access, "confirmReadContext"));
      await withHttp(f, async (http, legacy, current) => {
        const f0 = restore(vi.spyOn(current, "workflow"));
        const response = await http.inject({ method: "GET", url: operationPath(f, id), headers: headers(f) });
        expect(response.statusCode, response.body).toBe(404); expect(response.json().error.code).toBe("OPERATIONAL_READ_NOT_FOUND");
        finite(response.json()); expect(f0).not.toHaveBeenCalled(); expect(legacy).not.toHaveBeenCalled();
      });
      if (variant === "malformed-id") expect(identity).not.toHaveBeenCalled();
      else expect(identity).toHaveBeenCalledOnce();
      expect(privateRead).not.toHaveBeenCalled(); expect(confirm).toHaveBeenCalledOnce(); expect(f.held()).toBe(0);
    });

async function followingFixture(family:FollowingFamily,options:{rootOnly?:boolean;pendingAnchor?:"DEPLOYMENT"|"PORTFOLIO";gate?:boolean;
    account?:Account;historicalApproval?:boolean;preciseUpdatedAt?:boolean}={}){
    const initial=await fixture({account:options.account,nativeEnvironment:family==="SANDBOX"?"sandbox":"live",pendingAnchor:options.pendingAnchor,gate:options.gate,
      purposes:family==="SANDBOX"?(options.rootOnly?["SANDBOX_ROOT"]:["SANDBOX_ROOT","SANDBOX_STEPS","SANDBOX_LINEAGE"]):
        (options.rootOnly?["CANARY_ROOT"]:["CANARY_ROOT","CANARY_PROPOSAL","CANARY_LINEAGE"])});
    const historicalAt=await dbNow();
    // History is seeded once under forward guards. These are declared fixture
    // times, not a claim that the current capture ran days ago or a fake clock.
    const f=options.historicalApproval?{...initial,paper:await seededPaper(initial,{approvalExtra:{
      created_at:new Date(historicalAt-3*86_400_000),updated_at:new Date(historicalAt-2*86_400_000),
      decided_at:new Date(historicalAt-2*86_400_000),sla_due_at:new Date(historicalAt-2*86_400_000),
      expires_at:new Date(historicalAt-86_400_000)}})}:initial;
    const review=(await ctx.pool.query("SELECT artifact_digest,source_snapshot_hash,venue FROM governance_paper_exit_reviews WHERE workspace_id=$1 AND review_id=$2",
      [f.workspace,f.paper])).rows[0];
    const approvalHash=(await ctx.pool.query("SELECT evidence_set_hash FROM governance_approval_requests WHERE workspace_id=$1 AND approval_id=$2",
      [f.workspace,f.paper])).rows[0].evidence_set_hash;
    const grant=next(),certification=next(),plan=next(),envelope=next(),now=await dbNow();
    const preciseTime=new Date(now-1000).toISOString().slice(0,-1)+"789Z";
    const updatedAt=options.preciseUpdatedAt?preciseTime:new Date(now-1000);
    // Explicit TEST_ONLY fixtures for captured history. Existing actual INSERT
    // guards run; no trigger disable, immutable UPDATE or claimed native run.
    await insert("governance_promotion_authority_grants",{grant_id:grant,workspace_id:f.workspace,review_id:f.paper,deployment_id:f.deployment,
      target_stage:"SANDBOX_VALIDATION",grant_state:"AVAILABLE",evidence_set_hash:approvalHash,source_snapshot_hash:review.source_snapshot_hash,
      policy_version:"TEST_ONLY-sandbox-policy",created_by_user_id:owner.user.userId});
    const hash=accessDigest(["TEST_ONLY-sandbox-evidence",certification]);
    await insert("governance_sandbox_certifications",{certification_id:certification,workspace_id:f.workspace,deployment_id:f.deployment,
      promotion_grant_id:grant,paper_exit_review_id:f.paper,portfolio_id:f.portfolio,venue:review.venue,account_id:next(),
      external_account_ref:PRIVATE,artifact_digest:review.artifact_digest,r1_approval_id:f.r1,r2_approval_id:f.r2,
      policy_version:"TEST_ONLY-sandbox-policy",formula_version:"TEST_ONLY-sandbox.v1",created_by_user_id:owner.user.userId,
      workflow_state:"APPROVED",workflow_version:3,submitted_at:new Date(now-2000),submitted_by_user_id:owner.user.userId,
      submitted_evidence_set_hash:hash,decided_at:new Date(now-1000),decided_by_user_id:owner.user.userId,
      decided_evidence_set_hash:hash,decision_reason:PRIVATE,created_at:new Date(now-10000),updated_at:updatedAt});
    if(family==="CANARY"){
      await insert("governance_sandbox_promotion_plans",{plan_id:plan,certification_id:certification,workspace_id:f.workspace,
        actor_user_id:owner.user.userId,request_key:next(),request_digest:accessDigest(next()),expected_workflow_version:3,
        target_stage:"CANARY",evidence_set_hash:hash,status:"BLOCKED",blocker_codes:["TEST_ONLY_NOT_NATIVE_EXECUTION"]});
      await insert("governance_canary_envelopes",{envelope_id:envelope,workspace_id:f.workspace,deployment_id:f.deployment,
        certification_id:certification,promotion_plan_id:plan,revision:1,previous_envelope_id:null,base_risk_profile_revision:"TEST_ONLY-proposal",
        currency:"USDT",capital_cap:"9007199254740993.123456789123456789",gross_notional_cap:"9007199254740994.000000000000000001",
        daily_loss_cap:"1.000000000000000001",max_open_orders:10,duration_days:7,actor_user_id:owner.user.userId,
        request_key:next(),request_digest:accessDigest(next()),expected_certification_version:3,evidence_set_hash:hash,reason:PRIVATE});
    }
    return {...f,family,certification,envelope,plan,grant,hash};
  }
  const followingPath=(f:Awaited<ReturnType<typeof followingFixture>>)=>
    `/api/v1/execution/deployments/${f.deployment}/${f.family==="SANDBOX"?"certification":"canary"}?workspace_id=${encodeURIComponent(f.workspace)}`;
  it.each(["SANDBOX","CANARY"] as const)("%s existing HTTP publishes actual stored root under CURRENT native association only",async family=>{
    const f=await followingFixture(family),before=await businessState(f);
    await withHttp(f,async(http,legacy)=>{
      const response=await http.inject({method:"GET",url:followingPath(f),headers:headers(f)});
      expect(response.statusCode,response.body).toBe(200);expect(response.headers["cache-control"]).toBe("private, no-store");
      const body=followingParentRead.parse(response.json());
      expect(body.anchors).toMatchObject({deployment_id:f.deployment,portfolio_id:f.portfolio,
        environment:family==="SANDBOX"?"SANDBOX":"LIVE",captured_environment_attested:false,
        association_basis:"CURRENT_NATIVE_TARGET_CORRESPONDENCE"});
      expect(body.source).toMatchObject({source_verdict:"NOT_ASSERTED",source_side_effect_requested:false,
        runtime_activation_requested:false,promotion_execution_requested:false});
      if(body.family==="SANDBOX"){
        expect(body.certification.workflow_state).toBe("APPROVED");
        expect(body.steps.availability).toBe("AVAILABLE");
        if(body.steps.availability==="AVAILABLE")expect(body.steps.items.every(s=>s.availability==="NOT_RECORDED")).toBe(true);
      }else{
        expect(body.envelope.status).toBe("DRAFT");expect(body.envelope.production_command_active).toBe(false);
        expect(body.proposal).toMatchObject({availability:"AVAILABLE",basis:"PROPOSED_NOT_EFFECTIVE",
          capital_cap:"9007199254740993.123456789123456789",daily_loss_cap:"1.000000000000000001"});
      }
      finite(body);expect(legacy).not.toHaveBeenCalled();
    });
    expect(await businessState(f)).toEqual(before);expect(f.forbidden).not.toHaveBeenCalled();expect(f.held()).toBe(0);
  });
  it.each(["SANDBOX","CANARY"] as const)("%s ROOT does not read optional evidence/proposal or disclose references",async family=>{
    const f=await followingFixture(family,{rootOnly:true});
    const body=await f.followingService.detail(f.principal,family,f.deployment);
    expect(body.lineage.availability).toBe("NOT_PUBLISHED");
    if(body.family==="SANDBOX")expect(body.steps.availability).toBe("NOT_PUBLISHED");
    else expect(body.proposal.availability).toBe("NOT_PUBLISHED");
    expect(f.sql.join("\n")).not.toMatch(/q\.evidence_id|e\.capital_cap/);finite(body);
  });
  it.each((["SANDBOX","CANARY"] as const).flatMap(family=>(["DEPLOYMENT","PORTFOLIO"] as const).map(anchor=>({family,anchor}))))(
    "$family refuses missing $anchor source root before protected SQL",async({family,anchor})=>{
      const f=await followingFixture(family,{pendingAnchor:anchor}),spy=restore(vi.spyOn(f.followingRepository,"protectedDetails"));
      await refused(f.followingService.detail(f.principal,family,f.deployment),404,"OPERATIONAL_READ_NOT_FOUND");expect(spy).not.toHaveBeenCalled();
  });
  it("Canary gate read stays independent from current exact audit and owner role",async()=>{
    const f=await followingFixture("CANARY",{gate:false}),spy=restore(vi.spyOn(f.followingRepository,"protectedDetails"));
    await refused(f.followingService.detail(f.principal,"CANARY",f.deployment),404,"OPERATIONAL_READ_NOT_FOUND");expect(spy).not.toHaveBeenCalled();
  });
  it("Sandbox member revoke after authorized decode is fenced through LAST Core",async()=>{
    const f=await followingFixture("SANDBOX"),original=f.followingRepository.protectedDetails.bind(f.followingRepository);
    const confirm=restore(vi.spyOn(f.access,"confirmReadContext"));let decoded=false;
    restore(vi.spyOn(f.followingRepository,"protectedDetails").mockImplementation(async(...args)=>{
      const snapshot=await original(...args);
      if(!decoded){decoded=true;expect(f.held()).toBe(0);
        const removed=await ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2",
          [f.workspace,f.account.user.userId]);expect(removed.rowCount).toBe(1);}
      return snapshot;
    }));
    await refused(f.followingService.detail(f.principal,"SANDBOX",f.deployment),404,"OPERATIONAL_READ_NOT_FOUND");
    expect(decoded).toBe(true);expect(confirm).toHaveBeenCalledOnce();expect(f.held()).toBe(0);
  });
  it("Canary latest revision changes after decode yield retry, not stale latest body",async()=>{
    const f=await followingFixture("CANARY"),original=f.followingRepository.protectedDetails.bind(f.followingRepository);let inserted=false;
    restore(vi.spyOn(f.followingRepository,"protectedDetails").mockImplementation(async(...args)=>{
      const snapshot=await original(...args);
      if(!inserted){inserted=true;await ctx.pool.query(`INSERT INTO governance_canary_envelopes
        (envelope_id,workspace_id,deployment_id,certification_id,promotion_plan_id,revision,previous_envelope_id,
         base_risk_profile_revision,currency,capital_cap,gross_notional_cap,daily_loss_cap,max_open_orders,duration_days,
         actor_user_id,request_key,request_digest,expected_certification_version,evidence_set_hash,reason)
        SELECT $1,workspace_id,deployment_id,certification_id,promotion_plan_id,revision+1,envelope_id,
          base_risk_profile_revision,currency,capital_cap,gross_notional_cap,daily_loss_cap,max_open_orders,duration_days,
          actor_user_id,$2,request_digest,expected_certification_version,evidence_set_hash,reason
        FROM governance_canary_envelopes WHERE workspace_id=$3 AND envelope_id=$4`,[next(),next(),f.workspace,f.envelope]);}
      return snapshot;
    }));
    await refused(f.followingService.detail(f.principal,"CANARY",f.deployment),409,"OPERATIONAL_READ_CHANGED");
  });

// Additional following-family vectors: logical target is the current fixture
  // repairs + operation/contract/negative proposals + following-family proposal.
  // These are genuine disposable PG rows with TEST_ONLY policy/native facts.
  // No positive result is a source/runtime/commissioning acceptance receipt.
  type FollowingFixture = Awaited<ReturnType<typeof followingFixture>>;
  async function storedFollowingStep(f: FollowingFixture, step: (typeof followingSteps)[number],
    options: { state?: "PASS" | "FAIL" | "UNAVAILABLE"; expired?: boolean; createdAt?: string } = {}) {
    const now = await dbNow(), id = next(), state = options.state ?? "PASS";
    const authority = { CONNECT: "BROKER", SYNC: "BROKER", ORDER_TYPES: "BROKER",
      RECONCILIATION: "DERIVED", TIMEBOXED_RUN: "EXECUTION", CLEANUP: "DERIVED", EXIT_REVIEW: "PORTAL" } as const;
    await insert("governance_sandbox_step_evidence", {
      evidence_id: id, certification_id: f.certification, workspace_id: f.workspace, step_key: step,
      source_authority: authority[step], evaluation_state: state,
      evidence_hash: state === "UNAVAILABLE" ? null : accessDigest(["TEST_ONLY step bytes", id]),
      evidence_schema_version: "TEST_ONLY-sandbox-step.v1",
      source_verification_state: state === "UNAVAILABLE" ? "UNAVAILABLE" : "VERIFIED",
      summary: PRIVATE, as_of: state === "UNAVAILABLE" ? null : new Date(now - 10_000),
      expires_at: state === "UNAVAILABLE" ? null : new Date(now + (options.expired ? -1000 : 60_000)),
      capability_snapshot_id: PRIVATE, source_cursor: PRIVATE, projection_epoch: PRIVATE, projection_sequence: "17",
      created_at: options.createdAt ?? new Date(now).toISOString(),
    });
    return id;
  }
  async function followingBusinessState(f: FollowingFixture) {
    // Extend preservation coverage to the very families this reader serves;
    // comparing only R1/R2/Paper tables would miss a reader-side write here.
    return { parents: await businessState(f), following: (await ctx.pool.query(`SELECT jsonb_build_object(
      'certification',(SELECT jsonb_agg(to_jsonb(c) ORDER BY certification_id)
        FROM governance_sandbox_certifications c WHERE workspace_id=$1),
      'step_evidence',(SELECT jsonb_agg(to_jsonb(s) ORDER BY evidence_id)
        FROM governance_sandbox_step_evidence s WHERE workspace_id=$1),
      'promotion',(SELECT jsonb_agg(to_jsonb(p) ORDER BY plan_id)
        FROM governance_sandbox_promotion_plans p WHERE workspace_id=$1),
      'envelope',(SELECT jsonb_agg(to_jsonb(e) ORDER BY envelope_id)
        FROM governance_canary_envelopes e WHERE workspace_id=$1)) AS state`, [f.workspace])).rows[0].state };
  }

  it("Sandbox HTTP publishes finite STORED step metadata, not private prose or recomputed PASS freshness", async () => {
    const f = await followingFixture("SANDBOX");
    const pass = await storedFollowingStep(f, "CONNECT", { expired: true });
    const fail = await storedFollowingStep(f, "SYNC", { state: "FAIL" });
    const unavailable = await storedFollowingStep(f, "ORDER_TYPES", { state: "UNAVAILABLE" });
    const before = await followingBusinessState(f);
    await withHttp(f, async (http, legacy) => {
      const response = await http.inject({ method: "GET", url: followingPath(f), headers: headers(f) });
      expect(response.statusCode, response.body).toBe(200);
      const body = followingParentRead.parse(response.json());
      if (body.family !== "SANDBOX" || body.steps.availability !== "AVAILABLE") throw Error("TEST_ONLY missing step section");
      expect(body.steps.basis).toBe("CURRENT_LATEST_STORED");
      expect(body.steps.items.find(s => s.step_key === "CONNECT")).toMatchObject({
        availability: "AVAILABLE", evidence_id: pass, stored_evaluation_state: "PASS", source_authority: "BROKER",
        source_verification_state: "VERIFIED" });
      expect(body.steps.items.find(s => s.step_key === "CONNECT")!.expires_at_ms!).toBeLessThan(await dbNow());
      expect(body.steps.items.find(s => s.step_key === "SYNC")).toMatchObject({
        availability: "AVAILABLE", evidence_id: fail, stored_evaluation_state: "FAIL" });
      expect(body.steps.items.find(s => s.step_key === "ORDER_TYPES")).toMatchObject({
        availability: "AVAILABLE", evidence_id: unavailable, stored_evaluation_state: "UNAVAILABLE",
        source_verification_state: "UNAVAILABLE", as_of_ms: null, expires_at_ms: null });
      expect(body.steps.items.filter(s => s.availability === "NOT_RECORDED")).toHaveLength(4);
      expect(JSON.stringify(body)).not.toMatch(/"(?:summary|evidence_hash|capability_snapshot_id|source_cursor|projection_epoch|projection_sequence)"\s*:/);
      finite(body); expect(legacy).not.toHaveBeenCalled();
    });
    expect(await followingBusinessState(f)).toEqual(before);
    expect(f.forbidden).not.toHaveBeenCalled(); expect(f.held()).toBe(0);
  });

  it("an actually stored Sandbox step is NOT queried when only its exact PORTFOLIO field leaf is revoked", async () => {
    const f = await followingFixture("SANDBOX");
    await storedFollowingStep(f, "CONNECT");
    const optional = f.accepted.find(g => g.field_policy_ref === "TEST_ONLY:SANDBOX_STEPS" &&
      g.selector.kind === "EXPLICIT_RESOURCE_SET" && g.selector.resource_kind === "PORTFOLIO")!;
    expect(optional.ts_receipt).not.toBeNull();
    await f.grants.saveGrant({ ...optional, revision: next(), revoked_at_ms: await dbNow() });
    const start = f.sql.length, before = await followingBusinessState(f);
    const body = await f.followingService.detail(f.principal, "SANDBOX", f.deployment);
    if (body.family !== "SANDBOX") throw Error("TEST_ONLY wrong family");
    expect(body.steps).toEqual({ availability: "NOT_PUBLISHED", reason_code: "PARENT_FIELD_PURPOSE_NOT_QUALIFIED" });
    expect(body.lineage.availability).toBe("AVAILABLE"); // ROOT/other-purpose leaves cannot rescue this one.
    expect(f.sql.slice(start).join("\n")).not.toMatch(/q\.evidence_id|FROM governance_sandbox_step_evidence/);
    expect(await followingBusinessState(f)).toEqual(before); finite(body);
  });

  const optionalRevocations = [
    { family: "SANDBOX", kind: "core", variant: "body" },
    { family: "SANDBOX", kind: "core", variant: "held-error" },
    { family: "CANARY", kind: "source", variant: "body" },
    { family: "CANARY", kind: "source", variant: "held-error" },
  ] as const;
  it.each(optionalRevocations)("$family optional $kind revoke fences $variant after released actual SQL", async ({ family, kind, variant }) => {
    const f = await followingFixture(family);
    if (family === "SANDBOX") await storedFollowingStep(f, "CONNECT");
    const purpose = family === "SANDBOX" ? "SANDBOX_STEPS" : "CANARY_PROPOSAL";
    const selected = f.accepted.find(g => g.field_policy_ref === `TEST_ONLY:${purpose}` &&
      g.selector.kind === "EXPLICIT_RESOURCE_SET" && g.selector.resource_kind === "PORTFOLIO")!;
    const original = f.followingRepository.protectedDetails.bind(f.followingRepository);
    const trace: string[] = [], confirmActual = f.access.confirmReadContext.bind(f.access);
    let changed = false;
    const confirm = restore(vi.spyOn(f.access, "confirmReadContext").mockImplementation(async (...args) => {
      trace.push("LAST_CORE"); return confirmActual(...args);
    }));
    restore(vi.spyOn(f.followingRepository, "protectedDetails").mockImplementation(async (...args) => {
      const snapshot = await original(...args);
      expect(args[1][family === "SANDBOX" ? "steps" : "proposal"]).toBe(true);
      expect(f.held()).toBe(0);
      if (!changed) {
        changed = true; trace.push("PROTECTED_READ");
        if (kind === "core") await f.grants.saveGrant({ ...selected, revision: next(), revoked_at_ms: await dbNow() });
        else {
          const entry = f.source.grants.find(g => g.grant_id === selected.grant_id)!;
          expect(entry.targets).toHaveLength(1); entry.targets = [];
        }
        if (variant === "held-error") { trace.push("HELD_ERROR"); throw Error(PRIVATE); }
      }
      return snapshot;
    }));
    await withHttp(f, async (http, legacy) => {
      const response = await http.inject({ method: "GET", url: followingPath(f), headers: headers(f) });
      expect(response.statusCode, response.body).toBe(409); expect(response.json().error.code).toBe("OPERATIONAL_READ_CHANGED");
      finite(response.json()); expect(legacy).not.toHaveBeenCalled();
    });
    expect(changed).toBe(true); expect(confirm).toHaveBeenCalledOnce();
    expect(trace).toEqual(variant === "held-error" ? ["PROTECTED_READ", "HELD_ERROR", "LAST_CORE"] : ["PROTECTED_READ", "LAST_CORE"]);
    expect(f.forbidden).not.toHaveBeenCalled(); expect(f.held()).toBe(0);
  });

  it.each((["SANDBOX", "CANARY"] as const).flatMap(family =>
    (["before", "after"] as const).map(stage => ({ family, stage }))))(
    "$family own gate loss $stage protected SQL is independent from the owner's current actor", async ({ family, stage }) => {
      const f = await followingFixture(family, { account: owner });
      const actor = { user_id: owner.user.userId, session_id: f.account.session.sessionId,
        session_generation: f.account.session.sessionVersion };
      let changed = false;
      const mutate = async () => {
        if (changed) return; changed = true; expect(f.held()).toBe(0);
        if (family === "CANARY") await f.grants.saveGrant({ ...f.gate, grant_id: next(), revision: next(), effect: "DENY" }, true);
        else await ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [f.workspace, owner.user.userId]);
        const actual = await f.access.readContext(actor, f.workspace);
        expect(actual.actor_current).toBe(true); expect(actual.active_principals.has(owner.user.userId)).toBe(true);
        if (family === "SANDBOX") expect(actual.actor_member).toBe(false);
      };
      const original = f.followingRepository.protectedDetails.bind(f.followingRepository);
      const privateRead = restore(vi.spyOn(f.followingRepository, "protectedDetails"));
      const confirm = restore(vi.spyOn(f.access, "confirmReadContext"));
      if (stage === "before") await mutate();
      else privateRead.mockImplementation(async (...args) => { const snapshot = await original(...args); await mutate(); return snapshot; });
      if (family === "SANDBOX" && stage === "before") {
        // HTTP workspace resolution is stricter and rejects a nonmember first;
        // direct service still runs its actual Core+native+member authorizer.
        await refused(f.followingService.detail(f.principal, family, f.deployment), 404, "OPERATIONAL_READ_NOT_FOUND");
      } else await withHttp(f, async (http, legacy) => {
        const response = await http.inject({ method: "GET", url: followingPath(f), headers: headers(f) });
        expect(response.statusCode, response.body).toBe(stage === "before" ? 404 : 409);
        expect(response.json().error.code).toBe(stage === "before" ? "OPERATIONAL_READ_NOT_FOUND" : "OPERATIONAL_READ_CHANGED");
        finite(response.json()); expect(legacy).not.toHaveBeenCalled();
      });
      expect(confirm).toHaveBeenCalledOnce(); expect(changed).toBe(true);
      if (stage === "before") expect(privateRead).not.toHaveBeenCalled(); else expect(privateRead).toHaveBeenCalled();
      expect(f.held()).toBe(0); expect(f.forbidden).not.toHaveBeenCalled();
    });

  it.each(["present-invalid", "portfolio-environment", "deployment-native-target"] as const)(
    "present current source %s never falls back to flat membership, owner or another target", async variant => {
      const f = await followingFixture("CANARY", { account: owner });
      if (variant === "present-invalid") {
        (f.source as unknown as { schema_version: string }).schema_version = "TEST_ONLY-invalid-current-schema";
      } else {
        const anchor = variant === "portfolio-environment" ? "PORTFOLIO" : "DEPLOYMENT";
        for (const entry of f.source.grants) for (const target of entry.targets) if (target.resource.kind === anchor) {
          if (variant === "portfolio-environment") target.environment = "paper";
          else target.resource.id = next();
        }
      }
      const privateRead = restore(vi.spyOn(f.followingRepository, "protectedDetails"));
      const confirm = restore(vi.spyOn(f.access, "confirmReadContext"));
      await withHttp(f, async (http, legacy) => {
        const response = await http.inject({ method: "GET", url: followingPath(f), headers: headers(f) });
        expect(response.statusCode, response.body).toBe(404); expect(response.json().error.code).toBe("OPERATIONAL_READ_NOT_FOUND");
        finite(response.json()); expect(legacy).not.toHaveBeenCalled();
      });
      expect(privateRead).not.toHaveBeenCalled(); expect(confirm).toHaveBeenCalledOnce();
      expect(f.forbidden).not.toHaveBeenCalled(); expect(f.held()).toBe(0);
    });

  it.each(["SANDBOX", "CANARY"] as const)("%s historical expired approval is readable under current native/app/field authority", async family => {
    const f = await followingFixture(family, { historicalApproval: true });
    const expired = (await ctx.pool.query(`SELECT status,floor(extract(epoch FROM expires_at)*1000)::bigint AS expiry
      FROM governance_approval_requests WHERE workspace_id=$1 AND approval_id=$2`, [f.workspace, f.paper])).rows[0];
    expect(expired.status).toBe("APPROVED"); expect(Number(expired.expiry)).toBeLessThan(await dbNow());
    const before = await followingBusinessState(f);
    await withHttp(f, async (http, legacy) => {
      const response = await http.inject({ method: "GET", url: followingPath(f), headers: headers(f) });
      expect(response.statusCode, response.body).toBe(200);
      const body = followingParentRead.parse(response.json());
      expect(body.family).toBe(family); expect(body.anchors.captured_environment_attested).toBe(false);
      // No certification expiry exists in 0010; don't invent one or reuse
      // a historical approval expiry as the current field/source read lease.
      if (body.family === "CANARY") expect(body.envelope.expected_certification_version).toBe(3);
      else expect(body.certification.workflow_state).toBe("APPROVED");
      finite(body); expect(legacy).not.toHaveBeenCalled();
    });
    expect(await followingBusinessState(f)).toEqual(before); expect(f.held()).toBe(0);
  });

  it("lawful append-only Sandbox step changes the CURRENT evaluation without invalidating the old captured Canary draft", async () => {
    const f = await followingFixture("CANARY"), repository = new SandboxCertificationRepository(ctx.pool);
    const now = await dbNow(), firstCreated = new Date(now - 2000).toISOString(), nextCreated = new Date(now - 1000).toISOString();
    for (const step of followingSteps) await storedFollowingStep(f, step, { createdAt: firstCreated });
    const old = evaluateSandboxCertification(await repository.detailByDeployment(f.workspace, f.deployment));
    const id = await storedFollowingStep(f, "CONNECT", { state: "FAIL", createdAt: nextCreated });
    const current = evaluateSandboxCertification(await repository.detailByDeployment(f.workspace, f.deployment));
    expect(current.evidenceSetHash).not.toBe(old.evidenceSetHash); expect(current.eligible).toBe(false);
    const pins = (await ctx.pool.query(`SELECT c.decided_evidence_set_hash,e.evidence_set_hash,e.expected_certification_version
      FROM governance_canary_envelopes e JOIN governance_sandbox_certifications c
        ON c.workspace_id=e.workspace_id AND c.certification_id=e.certification_id
      WHERE e.workspace_id=$1 AND e.envelope_id=$2`, [f.workspace, f.envelope])).rows[0];
    expect(pins.decided_evidence_set_hash).toBe(f.hash); expect(pins.evidence_set_hash).toBe(f.hash);
    expect(current.evidenceSetHash).not.toBe(pins.decided_evidence_set_hash);
    expect(current.steps.find(s => s.stepKey === "CONNECT")!.evidence!.evidence_id).toBe(id);
    const before = await followingBusinessState(f);
    const body = await f.followingService.detail(f.principal, "CANARY", f.deployment);
    if (body.family !== "CANARY") throw Error("TEST_ONLY wrong family");
    expect(body.envelope).toMatchObject({ envelope_id: f.envelope, expected_certification_version: 3,
      status: "DRAFT", production_command_active: false });
    expect(await followingBusinessState(f)).toEqual(before); finite(body); expect(f.held()).toBe(0);
  });

  it("the actual PG local equality witness retains microseconds that the public epoch-ms intentionally omits", async () => {
    const f = await followingFixture("SANDBOX", { preciseUpdatedAt: true });
    const candidate = (await f.followingRepository.identityCandidate(f.workspace, "SANDBOX", f.deployment))!;
    const sections = { steps: true, lineage: true, proposal: false };
    const snapshot = await f.followingRepository.protectedDetails(candidate, sections), exact = snapshot.raw.root.updated_at;
    expect(typeof exact).toBe("string"); expect(exact).toMatch(/\.\d{3}789(?:Z|\+00:00)$/);
    const publicMs = Date.parse(String(exact)); expect(Number.isSafeInteger(publicMs)).toBe(true);
    const rounded = structuredClone(snapshot.raw); rounded.root.updated_at = new Date(publicMs).toISOString();
    expect(snapshot.revision).toBe(accessDigest({ domain: "following-parent-current-local-view.v1", raw: snapshot.raw }));
    expect(snapshot.revision).not.toBe(accessDigest({ domain: "following-parent-current-local-view.v1", raw: rounded }));
    expect(await f.followingRepository.isUnchanged(candidate, snapshot.revision, sections)).toBe(true);
    const body = await f.followingService.detail(f.principal, "SANDBOX", f.deployment);
    if (body.family !== "SANDBOX") throw Error("TEST_ONLY wrong family");
    expect(body.certification.updated_at_ms).toBe(publicMs); finite(body); expect(f.held()).toBe(0);
    // This precision test is not a claim of an actual same-ms workflow race.
    // No immutable UPDATE or unauthorized version-less transition is used.
  });


  // Original04 next family: constrained stored LIVE_GATE fixture, not a new
  // product producer, TS source acceptance or Live execution commissioning.
  async function seededLive(f:Fixture,options:{count?:number;schema?:string;capturedAt?:Date;extra?:Record<string,unknown>}={}){
    const id=next(),entries=Array.from({length:options.count??1},(_,n)=>evidence(n,options.capturedAt??new Date(Date.now()-120_000),options.schema));
    await approval(f.workspace,id,"LIVE_GATE",f.deployment,entries,options.extra);return id;
  }
  const liveFixture=(options:Omit<FixtureOptions,"activation"|"liveRoot"|"nativeEnvironment">={})=>
    fixture({...options,liveRoot:true,nativeEnvironment:"live",purposes:options.purposes??["LIVE_ROOT"]});
  const livePath=(f:Fixture,id:string)=>`/api/v1/execution/governance/approvals/${id}/live?workspace_id=${encodeURIComponent(f.workspace)}`;
  it("Live positive GET uses ONE genuine captured deployment anchor, not R2 Portfolio/lineage; no effects",async()=>{
    const f=await liveFixture(),id=await seededLive(f),before=await businessState(f);
    expect(f.targets).toEqual([{kind:"DEPLOYMENT",id:f.deployment}]);
    expect((await ctx.pool.query("SELECT count(*)::int n FROM governance_approval_analytics_scopes WHERE approval_id=$1",[id])).rows[0].n).toBe(0);
    await withHttp(f,async(http,legacy)=>{
      const response=await http.inject({method:"GET",url:livePath(f,id),headers:headers(f)});
      expect(response.statusCode,response.body).toBe(200);expect(response.headers["cache-control"]).toBe("private, no-store");
      const body=liveParentRead.parse(response.json());expect(body).toMatchObject({family:"LIVE_GATE",record_authority:"PORTAL",
        provenance_basis:"CURRENT_CORE_BASELINE",anchors:{deployment_id:f.deployment,environment:"LIVE"},
        approval:{approval_id:id,gate:"LIVE_GATE",status:"APPROVED",evidence_complete:true},
        source:{source_verdict:"NOT_ASSERTED",source_side_effect_requested:false,runtime_activation_requested:false},
        accepted_manager_facts:{availability:"NOT_PUBLISHED",reason_code:"PARENT_ROOT_NOT_SOURCE_SCREEN_COMPOSITION"}});
      expect(body.anchors).not.toHaveProperty("portfolio_id");finite(body);expect(legacy).not.toHaveBeenCalled();
    });
    expect(await businessState(f)).toEqual(before);expect(f.forbidden).not.toHaveBeenCalled();expect(f.held()).toBe(0);
    expect(f.sql.join("\n")).not.toMatch(/governance_(?:r2_lineage|approval_analytics_scopes|decision_plans|approval_findings)|paper_exit/);
  });
  it("Live composition retains the SAME flight, typed source absence and LAST Core; no rich-source call",async()=>{
    const f=await liveFixture(),id=await seededLive(f),trace:string[]=[],confirm=f.access.confirmReadContext.bind(f.access);
    restore(vi.spyOn(f.access,"confirmReadContext").mockImplementation(async(...args)=>{const c=await confirm(...args);trace.push("LAST_CORE");return c;}));
    await withHttp(f,async(http,legacy)=>{
      const result=await http.inject({method:"GET",url:`/api/v1/execution/compositions/approvals/${id}?workspace_id=${encodeURIComponent(f.workspace)}&view=live`,headers:headers(f)});
      expect(result.statusCode,result.body).toBe(200);expect(result.headers["cache-control"]).toBe("private, no-store");
      const body=result.json();liveParentRead.parse(body.data.governance);
      expect(body).toMatchObject({record_authority:"PORTAL_CONTROL",source_authority:"PORTAL_CONTROL_ONLY",
        source_health:{state:"UNAVAILABLE",reason_code:"CURRENT_AUDIT_SOURCE_PURPOSE_NOT_QUALIFIED"},
        command_authority:{state:"UNCHANGED_FAIL_CLOSED",source_side_effect_requested:false}});
      expect(body.data.accepted_manager_facts).toEqual(body.data.governance.accepted_manager_facts);
      expect(trace).toEqual(["LAST_CORE"]);finite(body);expect(legacy).not.toHaveBeenCalled();
    });expect(f.held()).toBe(0);
  });
  it.each(["governance.r1.read","governance.r2.read","governance.canary.read","governance.live.decide"] as const)(
    "%s is not governance.live.read",async gateAction=>{
      const f=await liveFixture({gateAction}),id=await seededLive(f),protectedRead=restore(vi.spyOn(f.liveRepository,"protectedDetails"));
      await refused(f.liveService.detail(f.principal,id),404,"OPERATIONAL_READ_NOT_FOUND");expect(protectedRead).not.toHaveBeenCalled();
    });
  it("ADMIN/protected owner is not a replacement for the independent Live read gate",async()=>{
    const f=await liveFixture({account:owner,gate:false}),id=await seededLive(f),privateRead=restore(vi.spyOn(f.liveRepository,"protectedDetails"));
    await refused(f.liveService.detail(f.principal,id),404,"OPERATIONAL_READ_NOT_FOUND");expect(privateRead).not.toHaveBeenCalled();
  });
  it.each(["pending-audit","missing-field","wrong-native-environment","exact-audit-deny","exact-live-deny"] as const)(
    "Live %s is refused before protected SQL/hash",async variant=>{
      const f=await liveFixture(variant==="pending-audit"?{pendingAnchor:"DEPLOYMENT"}:
        variant==="missing-field"?{purposes:["CANARY_ROOT"]}:{}),id=await seededLive(f);
      if(variant==="wrong-native-environment")for(const g of f.source.grants)for(const t of g.targets)t.environment="paper";
      if(variant==="exact-audit-deny"||variant==="exact-live-deny")await f.grants.saveGrant({...f.gate,grant_id:next(),revision:next(),
        action:variant==="exact-audit-deny"?"audit.read":"governance.live.read",effect:"DENY"},true);
      const privateRead=restore(vi.spyOn(f.liveRepository,"protectedDetails"));
      await refused(f.liveService.detail(f.principal,id),variant==="missing-field"?503:404,
        variant==="missing-field"?"GOVERNANCE_PARENT_FIELD_PURPOSE_UNAVAILABLE":"OPERATIONAL_READ_NOT_FOUND");
      expect(privateRead).not.toHaveBeenCalled();
    });
  it("unknown, wrong family/environment and cross-workspace Live roots share404 without protected decoding",async()=>{
    const f=await liveFixture(),id=await seededLive(f),foreign=await liveFixture();
    const wrong=await seededLive(f,{extra:{environment:"PAPER"}}),wrongSubject=await seededLive(f,{extra:{subject_type:"ALPHA_VERSION"}});
    const privateRead=restore(vi.spyOn(f.liveRepository,"protectedDetails"));
    for(const candidate of [next(),f.r2,wrong,wrongSubject])await refused(f.liveService.detail(f.principal,candidate),404,"OPERATIONAL_READ_NOT_FOUND");
    // Both workspaces have real sticky reviewed V2 policy; no legacy-only
    // workspace is falsely treated as a scoped-parent negative.
    await refused(foreign.liveService.detail(foreign.principal,id),404,"OPERATIONAL_READ_NOT_FOUND");
    expect(privateRead).not.toHaveBeenCalled();
  });
  it("expired stored Live approval remains readable; immutable initial expiry is never refreshed by GET",async()=>{
    const f=await liveFixture(),now=await dbNow(),id=await seededLive(f,{capturedAt:new Date(now-3*86_400_000-120_000),extra:{status:"EXPIRED",quorum_met:0,decision_actor_ids:[],
      created_at:new Date(now-3*86_400_000),sla_due_at:new Date(now-2*86_400_000),expires_at:new Date(now-86_400_000),
      updated_at:new Date(now-86_400_000),decided_at:new Date(now-86_400_000),decided_by_user_id:null}}),before=await businessState(f);
    const body=await f.liveService.detail(f.principal,id);expect(body.approval.status).toBe("EXPIRED");
    expect(body.approval.expires_at_ms).toBeLessThan(await dbNow());expect(await businessState(f)).toEqual(before);
    await expect(ctx.pool.query("UPDATE governance_approval_requests SET expires_at=expires_at+interval '1 microsecond' WHERE approval_id=$1",[id]))
      .rejects.toMatchObject({code:"55000"});
  });
  it.each(["manifest","BC-time","infinite-time"] as const)("authorized Live %s corruption is fixed503; no private error body",async variant=>{
    const f=await liveFixture(),id=await seededLive(f,{extra:variant==="manifest"?{evidence_set_hash:accessDigest("TEST_ONLY mismatch")}:
      {created_at:variant==="BC-time"?"0001-01-01 00:00:00 BC":"-infinity"}});
    await refused(f.liveService.detail(f.principal,id),503,"GOVERNANCE_PARENT_INTEGRITY_UNAVAILABLE");
    finite(await f.liveService.detail(f.principal,await seededLive(f)));
  });
  it("hidden corrupt Live root never becomes a hash503 oracle",async()=>{
    const f=await liveFixture({gate:false}),id=await seededLive(f,{extra:{evidence_set_hash:accessDigest("TEST_ONLY corrupt")}});
    const privateRead=restore(vi.spyOn(f.liveRepository,"protectedDetails"));
    await refused(f.liveService.detail(f.principal,id),404,"OPERATIONAL_READ_NOT_FOUND");expect(privateRead).not.toHaveBeenCalled();
  });
  it.each([256,257])("Live exact manifest cohort%i uses SQL cap+1/byte bounds, never silent truncation",async count=>{
    const f=await liveFixture(),id=await seededLive(f,{count});
    if(count===256)expect((await f.liveService.detail(f.principal,id)).approval.approval_id).toBe(id);
    else await refused(f.liveService.detail(f.principal,id),503,"OPERATIONAL_READ_RESPONSE_BOUND");
    expect(f.sql.some(q=>q.includes("governance_approval_evidence")&&q.includes("LIMIT 257")&&q.includes("octet_length"))).toBe(true);
  });
  it("huge unrelated Live root does not poison a readable selected parent; UTF-8 is bounded before JS",async()=>{
    const f=await liveFixture(),huge=await seededLive(f,{schema:"界".repeat(12_000)}),id=await seededLive(f);
    await refused(f.liveService.detail(f.principal,huge),503,"OPERATIONAL_READ_RESPONSE_BOUND");
    expect((await f.liveService.detail(f.principal,id)).approval.approval_id).toBe(id);
  });
  it.each(["decode","local-equality"] as const)("Live source revoke after %s suppresses the positive body at the same final fence",async stage=>{
    const f=await liveFixture(),id=await seededLive(f);let changed=false;
    const mutate=()=>{if(!changed){changed=true;expect(f.held()).toBe(0);for(const g of f.source.grants)g.targets=[];}};
    if(stage==="decode"){
      const original=f.liveRepository.protectedDetails.bind(f.liveRepository);
      restore(vi.spyOn(f.liveRepository,"protectedDetails").mockImplementation(async(...args)=>{const r=await original(...args);mutate();return r;}));
    }else{
      const original=f.liveRepository.isUnchanged.bind(f.liveRepository);
      restore(vi.spyOn(f.liveRepository,"isUnchanged").mockImplementation(async(...args)=>{const r=await original(...args);mutate();return r;}));
    }
    await refused(f.liveService.detail(f.principal,id),404,"OPERATIONAL_READ_NOT_FOUND");expect(changed).toBe(true);
  });
  it.each(["body","held-integrity-error"] as const)("Live current Core gate revoke wins over %s after protected SQL",async variant=>{
    const f=await liveFixture(),id=await seededLive(f,variant==="body"?{}:{extra:{evidence_set_hash:accessDigest("TEST_ONLY corrupt")}});
    const original=f.liveRepository.protectedDetails.bind(f.liveRepository);let changed=false;
    restore(vi.spyOn(f.liveRepository,"protectedDetails").mockImplementation(async(...args)=>{
      try{return await original(...args);}finally{if(!changed){changed=true;expect(f.held()).toBe(0);
        await f.grants.saveGrant({...f.gate,revision:next(),revoked_at_ms:await dbNow()});}}
    }));
    await refused(f.liveService.detail(f.principal,id),409,"OPERATIONAL_READ_CHANGED");expect(changed).toBe(true);
  });
  it.each(["source","field"] as const)("Live terminal %s expiry after LAST actual Core capture cannot leak body",async variant=>{
    const f=await liveFixture(variant==="source"?{nativeTtlMs:60_000}:{fieldTtlMs:60_000}),id=await seededLive(f);
    const deadline=variant==="source"?f.facts[0]!.expires_at_ms!:f.policy.parent_read_fields![0]!.valid_until_ms;
    const confirm=f.access.confirmReadContext.bind(f.access);let captured=false;
    restore(vi.spyOn(f.access,"confirmReadContext").mockImplementation(async(...args)=>{
      const current=await confirm(...args);expect(await dbNow()).toBeLessThan(deadline);
      expect(current.actor_lease_until_ms!).toBeGreaterThan(deadline+10);captured=true;
      restore(vi.spyOn(Date,"now").mockReturnValue(deadline+10));return current;
    }));
    await refused(f.liveService.detail(f.principal,id),variant==="source"?404:503,
      variant==="source"?"OPERATIONAL_READ_NOT_FOUND":"GOVERNANCE_PARENT_FIELD_PURPOSE_UNAVAILABLE");expect(captured).toBe(true);
  });
  it.each(["body","held-error"] as const)("actual natural session deadline wins over Live %s after LAST Core snapshot",async variant=>{
    const f=await liveFixture(),id=await seededLive(f),login=await auth.login({assertion:reader.username,username:reader.username,credential:password});
    const session=(await auth.sessionFromToken(login.token))!,principal={...f.principal,session};
    if(variant==="held-error")restore(vi.spyOn(f.liveRepository,"identityCandidate").mockRejectedValue(Error(PRIVATE)));
    const confirm=f.access.confirmReadContext.bind(f.access);let captured=false;
    restore(vi.spyOn(f.access,"confirmReadContext").mockImplementation(async(...args)=>{
      const deadline=Number((await ctx.pool.query("UPDATE auth_sessions SET idle_expires_at=clock_timestamp()+interval '1200 milliseconds' WHERE session_id=$1 RETURNING floor(extract(epoch FROM least(idle_expires_at,absolute_expires_at))*1000)::bigint ms",[session.sessionId])).rows[0].ms);
      const current=await confirm(...args);expect(current.actor_lease_until_ms).toBe(deadline);captured=true;
      await afterDb(deadline+10);return current;
    }));
    await refused(f.liveService.detail(principal,id),403,"OPERATIONAL_READ_AUTHORITY_REQUIRED");expect(captured).toBe(true);
  },12_000);
  it("Live genuine renewed session survives its old lease while preserving the stable exact target proof",async()=>{
    const f=await liveFixture(),id=await seededLive(f),login=await auth.login({assertion:reader.username,username:reader.username,credential:password});
    const session=(await auth.sessionFromToken(login.token))!,principal={...f.principal,session};
    const old=Number((await ctx.pool.query("UPDATE auth_sessions SET idle_expires_at=clock_timestamp()+interval '2 seconds' WHERE session_id=$1 RETURNING floor(extract(epoch FROM idle_expires_at)*1000)::bigint ms",[session.sessionId])).rows[0].ms);
    const original=f.liveRepository.protectedDetails.bind(f.liveRepository);let once=false;
    restore(vi.spyOn(f.liveRepository,"protectedDetails").mockImplementation(async(...args)=>{
      const r=await original(...args);if(!once){once=true;expect(await dbNow()).toBeLessThan(old);await new SessionsRepository(ctx.pool).markSeen(session.sessionId);
        const renewed=(await auth.sessionFromToken(login.token))!;expect(renewed.idleExpiresAt.getTime()).toBeGreaterThan(old);await afterDb(old);}return r;
    }));
    expect((await f.liveService.detail(principal,id)).approval.approval_id).toBe(id);expect(await dbNow()).toBeGreaterThan(old);
  },12_000);
  it("same-flight Live local witness retains SQL microseconds without publishing its private hash/preimage",async()=>{
    const f=await liveFixture(),now=await dbNow(),exact=new Date(now-30_000).toISOString().replace("Z","789Z");
    const id=await seededLive(f,{extra:{updated_at:exact}}),candidate=(await f.liveRepository.identityCandidate(f.workspace,id))!;
    const snapshot=await f.liveRepository.protectedDetails(candidate);
    expect(snapshot.approval.updated_at).toMatch(/\.\d{3}789(?:Z|\+00:00)$/);
    expect(await f.liveRepository.isUnchanged(candidate,snapshot.revision)).toBe(true);
    const body=await f.liveService.detail(f.principal,id);expect(body.approval.updated_at_ms).toBe(Date.parse(exact));
    expect(body).not.toHaveProperty("revision");expect(body).not.toHaveProperty("evidence_set_hash");finite(body);
  });
  it("Live finite contract rejects private fields and invented anchors/verdict/execution",async()=>{
    const f=await liveFixture(),id=await seededLive(f),body=await f.liveService.detail(f.principal,id);
    for(const key of ["actor","lineage","evidence_set_hash","reason","source_reference","signature","snapshot_digest"])
      expect(liveParentRead.safeParse({...body,[key]:PRIVATE}).success).toBe(false);
    expect(liveParentRead.safeParse({...body,anchors:{...body.anchors,portfolio_id:f.portfolio}}).success).toBe(false);
    expect(liveParentRead.safeParse({...body,source:{...body.source,source_verdict:"ACCEPTED"}}).success).toBe(false);
    expect(liveParentRead.safeParse({...body,source:{...body.source,production_command_active:true}}).success).toBe(false);
  });
  // The old NEW-proposal assertion demanded the pre-source commissioning
  // barrier. It is superseded only by the independent source tests below;
  // no original160 parent definition is removed or relaxed.

  describe("N04 Live source / same actual PG+HTTP harness / TEST_ONLY",()=>{
  /** SAME PG/HTTP harness; distinct source fixture, not a LiveRoot grant.
   * Policy + current source + publication are declared TEST_ONLY adapters.
   * Real installer/intake/Core/projection/reader/controller are exercised.
   * No installed PM/Edge qualification or source currentness is inferred. */
  async function liveSourceFixture(options:{account?:Account;gate?:boolean;alpha?:boolean;accountRead?:boolean;
    fields?:readonly string[];deny?:"ALPHA"|"ACCOUNT";nativeTtlMs?:number;
    mutate?:(document:ProfileProjectionDocument,own:LiveTuple,peer:LiveTuple)=>void}={}){
    const base=await fixture({liveRoot:true,nativeEnvironment:"live",purposes:["LIVE_ROOT"],account:options.account});
    const now=await dbNow(), account=base.account, profile="LIVE_BINANCE_USDM", sourceContract="TEST_ONLY-live-source.v1";
    const own:LiveTuple={alpha_id:next(),alpha_version_id:next(),portfolio_id:next(),deployment_id:base.deployment,
      account_id:next(),strategy_id:next()};
    const peer:LiveTuple={alpha_id:next(),alpha_version_id:next(),portfolio_id:next(),deployment_id:next(),
      account_id:next(),strategy_id:next()};
    const tuples=[own,peer].map(({strategy_id:_,...tuple})=>tuple);
    const resources:AccessResource[]=[...new Map(tuples.flatMap(t=>[
      {kind:"ALPHA" as const,id:t.alpha_id},{kind:"ALPHA_VERSION" as const,id:t.alpha_version_id},
      {kind:"PORTFOLIO" as const,id:t.portfolio_id},{kind:"DEPLOYMENT" as const,id:t.deployment_id},
      {kind:"ACCOUNT" as const,id:t.account_id}]).map(r=>[JSON.stringify(r),r])).values()];
    const policy:ReviewedAccessPolicy={workspace_id:base.workspace,revision:next(),artifact_digest:accessDigest(next()),
      approval_ref:"TEST_ONLY-live-source-reviewed-not-production",state:"REVIEWED",qualification:"TEST_ONLY",
      protected_owner_user_id:owner.user.userId,parent_read_fields:[],researcher_fields:{state:"QUALIFIED",
        policy_ref:next(),fields:[...(options.fields??BUSINESS_READ_FIELDS)]}};
    const make=(action:ScopedAccessGrant["action"],resource:AccessResource):ScopedAccessGrant=>({grant_id:next(),
      workspace_id:base.workspace,subject_user_id:account.user.userId,action,effect:"ALLOW",
      selector:{kind:"EXPLICIT_RESOURCE_SET",resource_kind:resource.kind,ids:[resource.id]},environments:["live"],
      valid_from_ms:now-60_000,valid_until_ms:now+600_000,delegable_actions:[],issued_by:owner.user.userId,
      parent_grant_id:null,revision:next(),policy_revision:policy.revision,revoked_at_ms:null,
      requires_ts_acceptance:action!=="governance.live.read",ts_receipt:null,
      field_policy_ref:action==="governance.live.read"?null:policy.researcher_fields.policy_ref});
    const gate=make("governance.live.read",{kind:"DEPLOYMENT",id:own.deployment_id});
    const alpha=make("alpha.read",{kind:"ALPHA",id:own.alpha_id}),accountGrant=make("account.read",{kind:"ACCOUNT",id:own.account_id});
    const business=[...(options.alpha===false?[]:[alpha]),...(options.accountRead===false?[]:[accountGrant])];
    const deny=options.deny?{...make("business.read_all",{kind:options.deny,id:options.deny==="ALPHA"?own.alpha_id:own.account_id}),
      effect:"DENY" as const,requires_ts_acceptance:false,field_policy_ref:null}:null;
    const artifact:ReviewedPolicyArtifact={policy,root_grants:[...business,...(options.gate===false?[]:[gate]),...(deny?[deny]:[])],
      provenance_ref:"TEST_ONLY-live-source-policy"};
    const mapping=next(),tsUser=next();
    const facts:TsRootMembershipAcceptance[]=business.map(grant=>{
      if(grant.action!=="alpha.read"&&grant.action!=="account.read")throw Error("TEST_ONLY exact business receipt action");
      return {context:"REVIEWED_POLICY_ROOT",source:"TEST_ONLY-current-live",
      source_contract:"TEST_ONLY-normalized-root",trust_profile:"TEST_ONLY",receipt_id:next(),portal_user_id:account.user.userId,
      ts_user_id:tsUser,mapping_revision:mapping,human_requester_user_id:owner.user.userId,workspace_id:base.workspace,
      action:grant.action,selector_digest:accessDigest(canonicalSelector(grant.selector)),environments:["live"],
      previous_membership_revision:null,membership_revision:next(),effective_at_ms:now-1000,
      expires_at_ms:now+(options.nativeTtlMs??600_000),outcome:"ACCEPTED",payload_digest:accessDigest(next()),
      provenance_ref:"TEST_ONLY-source-not-installed-proof",policy_revision:policy.revision,
      policy_artifact_digest:policy.artifact_digest,policy_install_digest:accessDigest(artifact),approval_ref:policy.approval_ref,
      grant_id:grant.grant_id,grant_digest:accessDigest(grant),expected_grant_revision:grant.revision};});
    const source:CurrentAccessRelations={schema_version:"pma.core-current-relations.v1",subject_user_id:account.user.userId,
      workspace_id:base.workspace,ts_user_id:tsUser,mapping_revision:mapping,resources:[{environment:"live",revision:next(),
        own_alpha_ids:[],member_portfolio_ids:[],roots:[]}],grants:business.map((grant,index)=>({grant_id:grant.grant_id,
        binding_digest:grantBindingDigest(grant),accepted:structuredClone(facts[index]!),targets:[{
          resource:grant.action==="alpha.read"?{kind:"ALPHA",id:own.alpha_id}:{kind:"ACCOUNT",id:own.account_id},
          environment:"live",revision:next(),native_reference_digest:accessDigest(next()),valid_from_ms:now-1000,
          valid_until_ms:now+(options.nativeTtlMs??600_000)}]}))};
    expect(currentAccessRelations.safeParse(source).success).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(source))).toBeLessThanOrEqual(32768);
    const config={...base.config,PORTAL_ENV:"local" as const,AUTH_MODE:"dev" as const,EXECUTION_DATABASE_URL:DATABASE_URL!,
      FEATURE_EXECUTION_LOCAL_PROJECTION:"true" as const,
      FEATURE_EXECUTION_CURRENT_SOURCE_PAPER:"false" as const,FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX:"false" as const,
      FEATURE_EXECUTION_CURRENT_SOURCE_LIVE:"false" as const,EXECUTION_READ_PROFILE:"retained_review_v1" as const,
      EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID:base.workspace,EXECUTION_EDGE_LIVE_PROFILE_ID:profile};
    const projection=new ExecutionProfileProjectionRepository(ctx.pool,undefined,config);
    const catalogue=accessDigest("TEST_ONLY-live-source-catalogue"),lineage={workspace_id:base.workspace,
      profile_id:profile,source_contract_revision:sourceContract,source_catalogue_sha256:catalogue};
    const row=(fields:ProjectionRow["fields"]):ProjectionRow=>({lineage:{...lineage},fields});
    const anchored=(t:LiveTuple)=>({...t,mode:"live",venue:"TEST_ONLY-venue"});
    const document:ProfileProjectionDocument={schema_version:"portal.execution.profile-projection.v1",workspace_id:base.workspace,
      environment:"live",profile_id:profile,source_contract_revision:sourceContract,source_catalogue_sha256:catalogue,relations:{}};
    for(const spec of SCOPED_LIVE_SPECS)document.relations[`${spec.source}:${spec.relation}`]={source_id:spec.source,
      relation:spec.relation,availability:"AVAILABLE",reason_code:null,as_of:new Date(now).toISOString(),freshness:"STALE",
      completeness:"PARTIAL",source_catalogue_sha256:catalogue,items:[]};
    const set=(key:keyof import("../src/live/live-source.contract").LiveSourceOperationsRead["data"],fields:ProjectionRow["fields"][])=>{
      const spec=SCOPED_LIVE_SPECS.find(s=>s.key===key)!;
      document.relations[`${spec.source}:${spec.relation}`].items=fields.map(row);
    };
    set("deployments",[{...anchored(own),currency:"USDT",state:"ACTIVE"},{...anchored(peer),currency:PRIVATE,state:PRIVATE}]);
    set("positions",[{...anchored(own),position_id:next(),signed_qty:"0",quantity:"12345678901234567890.123456789",
      notional:"0",realized_pnl:"0",unrealized_pnl:null,updated_at:"2026-10-01T12:34:56.123456Z"},
      {...anchored(peer),position_id:next(),quantity:[PRIVATE],state:PRIVATE}]);
    set("sessions",[{...anchored(own),execution_session_id:next(),state:"FINISHED",submitted_count:"9007199254740993",
      filled_count:"0",updated_at:"2026-10-01T12:34:56.123456Z"}]);
    set("orders",[{...anchored(own),order_id:next(),quantity:"0",price:"12345678901234567890.123456789",status:"OPEN",
      submitted_at:"2026-10-01T12:34:56.123456Z",error_message:PRIVATE},
      {...anchored(peer),order_id:next(),quantity:[PRIVATE],status:PRIVATE}]);
    set("fills",[{...anchored(own),fill_id:next(),quantity:"0.125",price:"0",realized_pnl:null,
      trade_time:"2026-10-01T12:34:56.123456Z"}]);
    set("accounts",[{account_id:own.account_id,mode:"live",base_currency:"USDT",external_account_ref:PRIVATE},
      {account_id:peer.account_id,mode:"live",base_currency:PRIVATE}]);
    set("account_balances",[{account_id:own.account_id,currency:"USDT",total:"0",free:null,locked:"1.000000000000000001"},
      {account_id:peer.account_id,currency:PRIVATE,total:[PRIVATE]}]);
    set("margin_balances",[{account_id:own.account_id,currency:"USDT",initial:"0",maintenance:null}]);
    set("account_sync",[{account_id:own.account_id,mode:"live",currency:"USDT",status:"SOURCE_OBSERVED",source:PRIVATE}]);
    // Exact original direct tuple avoids inventing a missing parent/session.
    set("reconciliation",[{...anchored(own),status:"OPEN",created_at:"2026-10-01T12:34:56.123456Z",finding_type:PRIVATE}]);
    options.mutate?.(document,own,peer);
    const commit=async(value=document)=>projection.commit(value,{sourceEpoch:"TEST_ONLY-live-epoch",sourceCursor:next(),
      sourceAsOf:null,receivedAt:new Date(),completeness:"PARTIAL",retentionSeconds:3600,maximumJournalEntries:32});
    await commit();
    const leases=new Map<object,QualifiedRootMembershipReceipt>(),forbidden=vi.fn(async()=>{throw Error(PRIVATE);});
    const relations=vi.fn(async(userId:string,ws:string):Promise<AccessRelations>=>userId===account.user.userId&&ws===base.workspace?
      {qualified:true,revision:"TEST_ONLY-current-business",own_alpha_ids:[],member_portfolio_ids:[],roots:{},
        membership:facts[0]?{receipt_id:facts[0].receipt_id,revision:facts[0].membership_revision,mapping_revision:mapping}:null,
        current_authority:structuredClone(source)}:
      {qualified:false,revision:"UNQUALIFIED",own_alpha_ids:[],member_portfolio_ids:[],roots:{},membership:null});
    const publication=vi.fn(async(request:ExecutionReadPublicationRequest):Promise<ExecutionReadPublication|null>=>{
      const metadata=await projection.snapshotMetadata(base.workspace,"live",profile);
      if(request.workspace_id!==base.workspace||request.environment!=="live"||request.profile_id!==profile||!metadata||
        request.binding.source_revision!==metadata.payloadDigest||request.binding.projection_generation!==metadata.projectionEpoch||
        request.binding.catalogue_revision!==metadata.sourceCatalogueSha256||
        !SCOPED_LIVE_SPECS.some(s=>request.binding.dataset_id===`relation:${s.source}:${s.relation}`))return null;
      return {...request,qualification:"TEST_ONLY",publication_revision:"TEST_ONLY-original-correlated-population",
        population_coverage:"COMPLETE_FOR_DATASET_WINDOW",provenance_ref:"TEST_ONLY-not-native-publication",resources,tuples,
        current_linkage:{qualification:"TEST_ONLY",revision:"TEST_ONLY-current-links",provenance_ref:"TEST_ONLY-links",
          pairs:tuples.map(t=>({alpha_id:t.alpha_id,portfolio_id:t.portfolio_id}))},
        strategy_lineage:{qualification:"TEST_ONLY",revision:"TEST_ONLY-explicit-strategy-namespace",provenance_ref:"TEST_ONLY-lineage",
          pairs:[own,peer].map(t=>({strategy_id:t.strategy_id,alpha_id:t.alpha_id}))}};
    });
    const trust:AccessTrustProvider={verifyPolicy:async value=>value===artifact?artifact:null,
      verifyRootReceipt:async token=>leases.get(token as object)??null,verifyReceipt:forbidden,verifiedHumanMapping:forbidden,relations,
      readPublication:publication};
    const access=new ExecutionAccessService(ctx.pool,auth,trust,true),grants=new AccessRepository(ctx.pool);
    await access.installReviewedPolicy(artifact);
    for(const fact of facts){
      const token=Object.freeze({TEST_ONLY:next()}),release=vi.fn(async()=>{});
      leases.set(token,{fact:structuredClone(fact),mapping:{ts_user_id:tsUser,revision:mapping},
        membership:{receipt_id:fact.receipt_id,revision:fact.membership_revision,mapping_revision:mapping},
        current_authority:structuredClone(source),assertCurrent(){},release});
      expect((await access.acceptRootTsReceipt(token)).receipt.outcome).toBe("TS_APPLIED");
      expect(release).toHaveBeenCalledOnce();
    }
    const accepted=(await ctx.pool.query<{grant_fact:ScopedAccessGrant}>(
      "SELECT grant_fact FROM portal_access_grants_v2 WHERE workspace_id=$1 AND grant_fact->>'policy_revision'=$2",[base.workspace,policy.revision])).rows.map(r=>r.grant_fact);
    for(const leaf of accepted.filter(g=>g.requires_ts_acceptance)){
      expect(leaf.ts_acceptance_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect((await ctx.pool.query("SELECT count(*)::int n FROM portal_access_policy_events WHERE workspace_id=$1 AND grant_id=$2 AND operation='TS_RECEIPT'",
        [base.workspace,leaf.grant_id])).rows[0].n).toBe(1);
    }
    const scopes=new ExecutionReadScopes(ctx.pool,access,config),product=new ExecutionProductReadSource(config,projection,
      {relationPage:forbidden,deploymentPage:forbidden} as never,scopes),profileReads=new ProfileReadService(product);
    const liveOperations=new LiveOperationsService({latestByDeployment:forbidden,lineageFor:forbidden} as never,profileReads,
      config,{effectiveAccess:forbidden} as never,scopes);
    const principal={...base.principal,user:account.user,session:account.session};
    return {...base,config,policy,artifact,gate,source,facts,accepted,grants,trust,forbidden,relations,access,scopes,principal,
      own,peer,document,commit,projection,publication,product,profileReads,liveOperations};
  }
  type LiveTuple={alpha_id:string;alpha_version_id:string;portfolio_id:string;deployment_id:string;account_id:string;strategy_id:string};
  type LiveSourceFixture=Awaited<ReturnType<typeof liveSourceFixture>>;
  const sourceRead=(f:LiveSourceFixture,principal=f.principal)=>f.liveOperations.detail(principal.user,principal.session,
    f.workspace,f.own.deployment_id,principal.viewerWorkspaceId);
  const livePath=(f:LiveSourceFixture,id=f.own.deployment_id,ws=f.workspace)=>
    `/api/v1/execution/deployments/${encodeURIComponent(id)}/live?workspace_id=${encodeURIComponent(ws)}`;
  const sourceRefused=(run:Promise<unknown>,status:number,code:string)=>expect(run).rejects.toMatchObject({status,code,
    message:"The requested Execution read is not available."});
  async function sourceState(f:LiveSourceFixture){
    return {business:await businessState(f),projection:(await ctx.pool.query(`SELECT jsonb_build_object(
      'snapshots',(SELECT jsonb_agg(to_jsonb(s) ORDER BY profile_id,environment) FROM execution_profile_projection_snapshots s WHERE workspace_id=$1),
      'journal',(SELECT count(*) FROM execution_profile_projection_journal WHERE workspace_id=$1)) state`,[f.workspace])).rows[0].state};
  }
  const originalBody=(document:ProfileProjectionDocument,key:string)=>document.relations[`manager.${key}:${key}`];

  it("Live source HTTP is independently business-qualified, finite, exact and read-only without a Canary or Live approval",async()=>{
    const f=await liveSourceFixture(),before=await sourceState(f);
    expect(f.account.user.role).toBe("USER");
    // New reviewed policy contains no audit leaf/parent seal. The genuine
    // Alpha/Account acceptance is separate from the app-only Live gate.
    expect(f.policy.parent_read_fields).toEqual([]);
    expect(f.accepted.filter(g=>g.policy_revision===f.policy.revision).map(g=>g.action).sort())
      .toEqual(["account.read","alpha.read","governance.live.read"]);
    await withHttp(f,async(http,legacy)=>{
      const response=await http.inject({method:"GET",url:livePath(f),headers:headers(f)});
      expect(response.statusCode,response.body).toBe(200);expect(response.headers["cache-control"]).toBe("private, no-store");
      const body=liveSourceOperationsRead.parse(response.json());
      expect(body).toMatchObject({schema_version:"portal.execution.live-source-operations.v2",workspace_id:f.workspace,
        deployment_id:f.own.deployment_id,environment:"live",record_authority:"PORTAL_RETAINED_OBSERVATION",
        source_verdict:"NOT_ASSERTED",coverage:"AUTHORIZED_ONLY",source_side_effect_requested:false,runtime_activation_requested:false});
      expect(body.data.positions.records[0].values).toMatchObject({signed_qty:"0",quantity:"12345678901234567890.123456789",
        notional:"0",realized_pnl:"0",unrealized_pnl:null});
      expect(body.data.orders.records[0].values.price).toBe("12345678901234567890.123456789");
      expect(body.data.sessions.records[0].values).toMatchObject({submitted_count:"9007199254740993",filled_count:"0"});
      expect(body.data.fills.records[0].values.price).toBe("0");
      expect(body.data.account_balances.records[0].values).toMatchObject({total:"0",free:null,locked:"1.000000000000000001"});
      expect(body.data.margin_balances.records[0].values).toMatchObject({initial:"0",maintenance:null});
      expect(body.data.orders.records[0].values.created_at_ms).toBe(Date.parse("2026-10-01T12:34:56.123Z"));
      expect(body.data.broker_sync).toMatchObject({state:"NOT_PUBLISHED",reason_code:"BROKER_PURPOSE_NOT_COMMISSIONED"});
      for(const panel of Object.values(body.data))expect(panel).toMatchObject({source_as_of_ms:null,exact_total:null,
        source_clock_reason:"SOURCE_CLOCK_NOT_SCOPED",provenance:{source_completeness:"UNKNOWN",source_revision:null,source_cursor:null}});
      expect(JSON.stringify(body)).not.toContain(f.peer.alpha_id);expect(JSON.stringify(body)).not.toContain(f.peer.account_id);
      const privateSnapshot=await f.projection.snapshotMetadata(f.workspace,"live","LIVE_BINANCE_USDM");
      expect(JSON.stringify(body)).not.toContain(privateSnapshot!.payloadDigest);
      expect(JSON.stringify(body)).not.toContain(privateSnapshot!.projectionEpoch);
      expect(JSON.stringify(body)).not.toContain(PRIVATE);finite(body);expect(legacy).not.toHaveBeenCalled();
    },f.liveOperations);
    expect(await sourceState(f)).toEqual(before);expect(f.forbidden).not.toHaveBeenCalled();
  });
  it.each(["gate","alpha","accountRead"] as const)("Live %s is independent; other positive purposes never substitute",async missing=>{
    const f=await liveSourceFixture({[missing]:false}),raw=restore(vi.spyOn(f.projection,"rawSnapshot"));
    await sourceRefused(sourceRead(f),404,"EXECUTION_READ_NOT_AVAILABLE");expect(f.forbidden).not.toHaveBeenCalled();
    if(missing!=="accountRead")expect(raw).not.toHaveBeenCalled();
    // Account identity is established from an already authorized deployment
    // before requesting account.read; that later denial still emits no body.
  });
  it.each(["ALPHA","ACCOUNT"] as const)("current business.read_all DENY on %s wins over exact accepted positive leaves",async deny=>{
    const f=await liveSourceFixture({deny});await sourceRefused(sourceRead(f),404,"EXECUTION_READ_NOT_AVAILABLE");
  });
  it.each(["absent","partial"] as const)("current %s original publication refuses before raw bytes despite valid app and entity grants",async variant=>{
    const f=await liveSourceFixture(),publication=f.trust.readPublication!,raw=restore(vi.spyOn(f.projection,"rawSnapshot"));
    f.trust.readPublication=async(...args)=>{const result=await publication(...args);
      return variant==="absent"?null:result?{...result,population_coverage:"PARTIAL"}:null;};
    await sourceRefused(sourceRead(f),503,"EXECUTION_READ_PUBLICATION_NOT_QUALIFIED");
    expect(raw).not.toHaveBeenCalled();expect(f.forbidden).not.toHaveBeenCalled();
  });
  it("a denied/corrupt scalar is never decoded, fingerprinted or promoted to a zero",async()=>{
    const f=await liveSourceFixture({fields:BUSINESS_READ_FIELDS.filter(k=>k!=="price"),mutate:document=>{
      originalBody(document,"orders").items[0].fields.price=[PRIVATE];
    }}),body=liveSourceOperationsRead.parse(await sourceRead(f));
    expect(body.data.orders.records[0].values).not.toHaveProperty("price");
    expect(body.data.fills.records[0].values).not.toHaveProperty("price");expect(JSON.stringify(body)).not.toContain(PRIVATE);
  });
  it("authorized malformed scalar is fixed503; hidden peer corruption is not an oracle",async()=>{
    const f=await liveSourceFixture({mutate:document=>{originalBody(document,"orders").items[0].fields.quantity=[PRIVATE];}});
    await sourceRefused(sourceRead(f),503,"EXECUTION_READ_PUBLICATION_NOT_QUALIFIED");
    await withHttp(f,async(http)=>{
      const response=await http.inject({method:"GET",url:livePath(f),headers:headers(f)});
      expect(response.statusCode,response.body).toBe(503);
      expect(response.json()).toMatchObject({error:{code:"EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",
        message:"The requested Execution read is not available."}});
      expect(response.json().request_id).toBeTruthy();expect(response.body).not.toContain(PRIVATE);
    },f.liveOperations);
  });
  it("source strategy-id equality is not Alpha lineage and cannot fabricate the requested deployment",async()=>{
    const f=await liveSourceFixture({mutate:(document,own)=>{
      document.relations["manager.deployments:strategy_deployments"].items[0].fields.strategy_id=own.alpha_id;
    }});expect(f.own.strategy_id).not.toBe(f.own.alpha_id);
    await sourceRefused(sourceRead(f),404,"EXECUTION_READ_NOT_AVAILABLE");expect(f.forbidden).not.toHaveBeenCalled();
  });
  it("missing captured panel is typed absence, but an authorized genuinely empty panel is not source failure",async()=>{
    const f=await liveSourceFixture({mutate:document=>{
      delete document.relations["manager.fills:fills"];document.relations["manager.positions:positions_v2"].items=[];
    }}),body=liveSourceOperationsRead.parse(await sourceRead(f));
    expect(body.data.fills).toMatchObject({state:"NOT_PUBLISHED",reason_code:"SOURCE_PANEL_NOT_CAPTURED",returned_count:0,has_more:false});
    expect(body.data.positions).toMatchObject({state:"PARTIAL",reason_code:"NO_AUTHORIZED_RETAINED_OBSERVATION",returned_count:0,has_more:false});
    expect(body.data.positions.exact_total).toBeNull();
  });
  it("201 authorized retained rows report truncation honestly; no complete-history or invented continuation claim",async()=>{
    const f=await liveSourceFixture({mutate:document=>{
      const relation=originalBody(document,"orders"),first=relation.items[0];
      relation.items=Array.from({length:201},(_,i)=>({...structuredClone(first),fields:{...first.fields,order_id:`TEST_ONLY-order-${i}`}}));
    }}),body=liveSourceOperationsRead.parse(await sourceRead(f));
    expect(body.data.orders).toMatchObject({state:"PARTIAL",returned_count:200,has_more:true,exact_total:null,limit:200});
    expect(body.data.orders.provenance.history_semantics).toBe("BOUNDED_RETAINED_NOT_FULL_HISTORY");
    expect(new Set(body.data.orders.records.map(r=>r.observation_id)).size).toBe(200);
    expect(body.data.orders.next_cursor).toMatch(/^lps2\./);
    // This cap case alone is not traversal proof; actual HTTP round-trip below.
  });
  it("response byte bound is an error that still passes final source/Core fencing",async()=>{
    const f=await liveSourceFixture({mutate:document=>{
      for(const key of ["manager.orders:orders","manager.sessions:execution_sessions"]){
        const relation=document.relations[key],first=relation.items[0];
        relation.items=Array.from({length:200},(_,i)=>({...structuredClone(first),fields:{...first.fields,
          order_id:`TEST_ONLY-${i}`,position_id:`TEST_ONLY-${i}`,status:"x".repeat(4096),state:"x".repeat(4096)}}));
      }
    }});let lastScope=false,reconciliations=0,final=false;
    const original=f.access.confirmReadContext.bind(f.access),authorize=f.scopes.authorize.bind(f.scopes);
    restore(vi.spyOn(f.scopes,"authorize").mockImplementation(async(...args)=>{
      const result=await authorize(...args);
      if(args[2].dataset?.dataset_id==="relation:manager.reconciliation:reconciliation_findings"&&++reconciliations===2)lastScope=true;
      return result;
    }));
    restore(vi.spyOn(f.access,"confirmReadContext").mockImplementation(async(...args)=>{
      const result=await original(...args);if(lastScope)final=true;return result;}));
    await sourceRefused(sourceRead(f),503,"EXECUTION_READ_SCOPE_LIMIT");expect(final).toBe(true);
  });
  it("hidden-peer changes do not change an authorized public observation id",async()=>{
    const f=await liveSourceFixture(),first=liveSourceOperationsRead.parse(await sourceRead(f));
    const changed=structuredClone(f.document);originalBody(changed,"orders").items[1].fields.status="TEST_ONLY-different-hidden-status";
    await f.commit(changed);const second=liveSourceOperationsRead.parse(await sourceRead(f));
    expect(second.data.orders.records).toEqual(first.data.orders.records);
    expect(second.data.account_balances.records).toEqual(first.data.account_balances.records);
  });
  it("retained snapshot replacement during the actual raw read fails original publication renewal before any old result escapes",async()=>{
    const f=await liveSourceFixture(),raw=f.projection.rawSnapshot.bind(f.projection),
      confirm=f.access.confirmReadContext.bind(f.access);let once=false,lastCore=false;
    restore(vi.spyOn(f.access,"confirmReadContext").mockImplementation(async(...args)=>{
      const result=await confirm(...args);lastCore=true;return result;
    }));
    restore(vi.spyOn(f.projection,"rawSnapshot").mockImplementation(async(...args)=>{
      const result=await raw(...args);if(!once){once=true;const changed=structuredClone(f.document);
        originalBody(changed,"orders").items[0].fields.status="CLOSED";await f.commit(changed);}return result;
    }));
    // The captured snapshot first trips its409 fence, then renewal of the
    // ORIGINAL publication fails against the genuinely replaced source. That
    // independent authority503 outranks a held409; never mask it or fall back.
    await sourceRefused(sourceRead(f),503,"EXECUTION_READ_PUBLICATION_NOT_QUALIFIED");
    expect(once).toBe(true);expect(lastCore).toBe(true);expect(f.forbidden).not.toHaveBeenCalled();
  });
  it.each(["source","core","member","session"] as const)("original Alpha obligation survives later Account renewal: actual %s change suppresses whole body",async change=>{
    const account=await activated("USER"),f=await liveSourceFixture({account}),authorize=f.scopes.authorize.bind(f.scopes);
    let count=0,changed=false;
    restore(vi.spyOn(f.scopes,"authorize").mockImplementation(async(...args)=>{
      const result=await authorize(...args);
      if(args[2].dataset?.dataset_id==="relation:manager.accounts:account_balances"&&++count===2){
        changed=true;
        if(change==="source")f.source.grants=f.source.grants.filter(g=>g.accepted.action!=="alpha.read");
        if(change==="core"){
          const grant=f.accepted.find(g=>g.action==="alpha.read")!;
          await f.grants.saveGrant({...grant,revision:next(),revoked_at_ms:await dbNow()});
        }
        if(change==="member")await ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2",[f.workspace,account.user.userId]);
        if(change==="session")await new SessionsRepository(ctx.pool).revokeSession(account.session.sessionId,"TEST_ONLY-source-read");
      }return result;
    }));
    await sourceRefused(sourceRead(f),change==="member"||change==="session"?404:409,
      change==="member"||change==="session"?"EXECUTION_READ_NOT_AVAILABLE":"EXECUTION_READ_ACCESS_CHANGED");
    expect(changed).toBe(true);expect(f.forbidden).not.toHaveBeenCalled();
  });
  it("held corrupt-body error cannot mask a later actual Alpha acceptance revocation",async()=>{
    const f=await liveSourceFixture({mutate:document=>{originalBody(document,"orders").items[0].fields.quantity=[PRIVATE];}});
    const authorize=f.scopes.authorize.bind(f.scopes);let count=0,changed=false;
    restore(vi.spyOn(f.scopes,"authorize").mockImplementation(async(...args)=>{
      const result=await authorize(...args);
      if(args[2].dataset?.dataset_id==="relation:manager.accounts:account_balances"&&++count===2){
        changed=true;f.source.grants=f.source.grants.filter(g=>g.accepted.action!=="alpha.read");}
      return result;
    }));await sourceRefused(sourceRead(f),409,"EXECUTION_READ_ACCESS_CHANGED");expect(changed).toBe(true);
  });
  it("genuine renewed Core session survives its original lease while all original source purposes remain required",async()=>{
    const account=await activated("USER"),f=await liveSourceFixture({account});
    const deadline=Number((await ctx.pool.query("UPDATE auth_sessions SET idle_expires_at=clock_timestamp()+interval '2 seconds' WHERE session_id=$1 RETURNING floor(extract(epoch FROM idle_expires_at)*1000)::bigint ms",
      [account.session.sessionId])).rows[0].ms),raw=f.projection.rawSnapshot.bind(f.projection);let renewed=false;
    restore(vi.spyOn(f.projection,"rawSnapshot").mockImplementation(async(...args)=>{
      const result=await raw(...args);if(!renewed){expect(await dbNow()).toBeLessThan(deadline);
        await new SessionsRepository(ctx.pool).markSeen(account.session.sessionId);renewed=true;await afterDb(deadline);}
      return result;
    }));expect(liveSourceOperationsRead.parse(await sourceRead(f)).deployment_id).toBe(f.own.deployment_id);expect(renewed).toBe(true);
  },12_000);
  it.each(["body","held-error"] as const)("natural actual lease expiry after LAST Core hides %s; no provider await follows",async variant=>{
    const account=await activated("USER"),f=await liveSourceFixture({account,...(variant==="held-error"?{
      mutate:(document:ProfileProjectionDocument)=>{originalBody(document,"orders").items[0].fields.quantity=[PRIVATE];}}:{})});
    const authorize=f.scopes.authorize.bind(f.scopes),confirm=f.access.confirmReadContext.bind(f.access),trace:string[]=[];
    const relations=f.trust.relations,publication=f.trust.readPublication!;
    f.trust.relations=async(...args)=>{trace.push("SOURCE_RELATIONS");return relations(...args);};
    f.trust.readPublication=async(...args)=>{trace.push("SOURCE_PUBLICATION");return publication(...args);};
    let lastScope=false,reconciliations=0,captured=false;
    restore(vi.spyOn(f.scopes,"authorize").mockImplementation(async(...args)=>{
      const result=await authorize(...args);
      if(args[2].dataset?.dataset_id==="relation:manager.reconciliation:reconciliation_findings"&&++reconciliations===2)lastScope=true;
      return result;
    }));
    restore(vi.spyOn(f.access,"confirmReadContext").mockImplementation(async(...args)=>{
      if(!lastScope)return confirm(...args);
      const deadline=Number((await ctx.pool.query("UPDATE auth_sessions SET idle_expires_at=clock_timestamp()+interval '1200 milliseconds' WHERE session_id=$1 RETURNING floor(extract(epoch FROM least(idle_expires_at,absolute_expires_at))*1000)::bigint ms",
        [account.session.sessionId])).rows[0].ms);
      const current=await confirm(...args);expect(current.actor_lease_until_ms).toBe(deadline);
      trace.push("LAST_CORE");captured=true;await afterDb(deadline+10);return current;
    }));
    await sourceRefused(sourceRead(f),404,"EXECUTION_READ_NOT_AVAILABLE");expect(captured).toBe(true);expect(trace.at(-1)).toBe("LAST_CORE");
  },12_000);
  it("source acceptance deadline is checked at actual terminal clock, not only before pure projection",async()=>{
    const f=await liveSourceFixture({nativeTtlMs:60_000}),deadline=f.facts[0].expires_at_ms!;
    const authorize=f.scopes.authorize.bind(f.scopes),confirm=f.access.confirmReadContext.bind(f.access);
    let lastScope=false,reconciliations=0,captured=false;
    restore(vi.spyOn(f.scopes,"authorize").mockImplementation(async(...args)=>{
      const result=await authorize(...args);
      if(args[2].dataset?.dataset_id==="relation:manager.reconciliation:reconciliation_findings"&&++reconciliations===2)lastScope=true;
      return result;
    }));
    restore(vi.spyOn(f.access,"confirmReadContext").mockImplementation(async(...args)=>{
      const current=await confirm(...args);if(lastScope){expect(current.actor_lease_until_ms!).toBeGreaterThan(deadline+10);
        captured=true;restore(vi.spyOn(Date,"now").mockReturnValue(deadline+10));}return current;
    }));await sourceRefused(sourceRead(f),409,"EXECUTION_READ_ACCESS_CHANGED");expect(captured).toBe(true);
  });
  it("HTTP hidden exact deployment and workspace mismatch stay finite refusals, not legacy fallback",async()=>{
    const f=await liveSourceFixture();await withHttp(f,async(http,legacy)=>{
      for(const [id,ws,code] of [[f.peer.deployment_id,f.workspace,"EXECUTION_READ_NOT_AVAILABLE"],
        [f.own.deployment_id,next(),"WORKSPACE_NOT_FOUND"]]){
        const response=await http.inject({method:"GET",url:livePath(f,id,ws),headers:headers(f)});
        expect(response.statusCode,response.body).toBe(404);expect(response.json()).toMatchObject({error:{code}});
        expect(response.json().request_id).toBeTruthy();expect(response.body).not.toContain(PRIVATE);
        expect(response.body).not.toContain(f.peer.account_id);
      }expect(legacy).not.toHaveBeenCalled();
    },f.liveOperations);expect(f.forbidden).not.toHaveBeenCalled();
  });
  it("same real Live HTTP GET continues exact401 own rows200/200/1 and back with no GET writes or cohort fallback",async()=>{
    const f=await liveSourceFixture({mutate:document=>{
      const relation=originalBody(document,"orders"),first=relation.items[0],peer=relation.items[1];
      relation.items=[...Array.from({length:401},(_,i)=>({...structuredClone(first),
        fields:{...first.fields,order_id:String(i+1),quantity:i===400?"0":"1.000000000000000001"}})),peer];
    }}),before=await sourceState(f);
    await withHttp(f,async(http,legacy)=>{
      const get=async(panel?:string,cursor?:string)=>{
        const query=panel?`&panel=${encodeURIComponent(panel)}${cursor?`&cursor=${encodeURIComponent(cursor)}`:""}`:"";
        const response=await http.inject({method:"GET",url:livePath(f)+query,headers:headers(f)});
        expect(response.statusCode,response.body).toBe(200);expect(response.headers["cache-control"]).toBe("private, no-store");
        expect(response.body).not.toContain(PRIVATE);expect(response.body).not.toContain(f.peer.account_id);
        return liveSourceOperationsRead.parse(response.json());
      };
      const first=await get(),middle=await get("orders",first.data.orders.next_cursor!),
        last=await get("orders",middle.data.orders.next_cursor!),back=await get("orders",middle.data.orders.previous_cursor!);
      expect([first,middle,last].map(b=>b.data.orders.returned_count)).toEqual([200,200,1]);
      expect(new Set([first,middle,last].flatMap(b=>b.data.orders.records.map(r=>r.observation_id))).size).toBe(401);
      expect(back.data.orders.records).toEqual(first.data.orders.records);expect(last.data.orders.next_cursor).toBeNull();
      expect(last.data.orders.records[0].values.quantity).toBe("0");expect(first.data.orders.grain).toBe("DEPLOYMENT");
      expect(first.data.account_balances.grain).toBe("ACCOUNT");expect(first.data.orders.exact_total).toBeNull();
      const crossed=await http.inject({method:"GET",url:livePath(f)+"&panel=fills&cursor="+encodeURIComponent(first.data.orders.next_cursor!),headers:headers(f)});
      expect(crossed.statusCode,crossed.body).toBe(400);
      expect(crossed.json()).toMatchObject({error:{code:"EXECUTION_READ_CURSOR_INVALID"},request_id:expect.any(String)});
      expect(crossed.body).not.toContain(PRIVATE);expect(legacy).not.toHaveBeenCalled();
    },f.liveOperations);
    expect(await sourceState(f)).toEqual(before);expect(f.forbidden).not.toHaveBeenCalled();
  },40_000); // Five sequential HTTP authority flights plus real fixture/hash checks; not a per-read SLO.
  it("a genuine stored projection replacement invalidates an old Live continuation even with unchanged public first-page rows",async()=>{
    const f=await liveSourceFixture({mutate:document=>{
      const relation=originalBody(document,"orders"),first=relation.items[0];
      relation.items=Array.from({length:201},(_,i)=>({...structuredClone(first),fields:{...first.fields,order_id:String(i+1)}}));
    }}),first=liveSourceOperationsRead.parse(await sourceRead(f)),changed=structuredClone(f.document);
    originalBody(changed,"orders").items[200].fields.status="TEST_ONLY-new-last-row";await f.commit(changed);
    await withHttp(f,async(http,legacy)=>{
      const response=await http.inject({method:"GET",url:livePath(f)+"&panel=orders&cursor="+encodeURIComponent(first.data.orders.next_cursor!),headers:headers(f)});
      expect(response.statusCode,response.body).toBe(400);expect(response.json().error.code).toBe("EXECUTION_READ_CURSOR_INVALID");
      expect(response.body).not.toContain(PRIVATE);expect(legacy).not.toHaveBeenCalled();
    },f.liveOperations);
  });
  it("held malformed continuation is still suppressed by actual membership removal during later purpose renewal",async()=>{
    const account=await activated("USER"),f=await liveSourceFixture({account}),authorize=f.scopes.authorize.bind(f.scopes);
    let renewals=0,reconciliations=0,changed=false,lastReady=false,last=false;const confirm=f.access.confirmReadContext.bind(f.access);
    restore(vi.spyOn(f.scopes,"authorize").mockImplementation(async(...args)=>{
      try{
        const result=await authorize(...args);
        if(args[2].dataset?.dataset_id==="relation:manager.accounts:account_balances"&&++renewals===2){
          await ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2",[f.workspace,account.user.userId]);changed=true;
        }return result;
      }finally{
        if(args[2].dataset?.dataset_id==="relation:manager.reconciliation:reconciliation_findings"&&++reconciliations===2)lastReady=true;
      }
    }));
    restore(vi.spyOn(f.access,"confirmReadContext").mockImplementation(async(...args)=>{
      try{return await confirm(...args);}finally{if(changed&&lastReady)last=true;}
    }));
    await withHttp(f,async(http,legacy)=>{
      const response=await http.inject({method:"GET",url:livePath(f)+"&panel=orders&cursor=malformed",headers:headers(f)});
      expect(response.statusCode,response.body).toBe(404);expect(response.json().error.code).toBe("EXECUTION_READ_NOT_AVAILABLE");
      expect(changed).toBe(true);expect(last).toBe(true);expect(response.body).not.toContain(PRIVATE);expect(legacy).not.toHaveBeenCalled();
    },f.liveOperations);
  });
  }); // N04 Live source: Main may select this affected-only group.

  // Activation shares this SAME disposable PG/HTTP/actual Core harness.
  // Initial TEST_ONLY captures below are not native installation or runtime proof.
  const activationPurposes:ParentFieldPurpose[]=["ACTIVATION_CAPABILITIES","ACTIVATION_PLAN_ROOT",
    "ACTIVATION_PLAN_EVIDENCE","ACTIVATION_PLAN_COMPATIBILITY"];
  async function activationPlan(f:Fixture,options:{historical?:boolean;invalidExpiry?:boolean;wrongHash?:boolean;count?:number;gap?:boolean;capability?:"QUERY"|"PROJECTION"}={}){
    const request=StagedActivationPlanRequestSchema.parse({schema_version:"execution.staged-activation-plan-request.v1",
      workspace_id:f.workspace,request_key:next(),capability_key:options.capability??"QUERY",action:"PROMOTE",target_profile:"shadow",
      expected_capability_version:1,reason:PRIVATE,
      evidence_refs:[{kind:"CONTRACT",reference_id:next(),artifact_digest:accessDigest("TEST_ONLY-artifact"),
        schema_version:"TEST_ONLY.v1",signer_fingerprint:accessDigest(PRIVATE),detached_signature:"x".repeat(43),
        compatibility_revision:"TEST_ONLY.compat.v1",expires_at:"2030-01-01T07:00:00.000+07:00"}],
      compatibility_requirements:[{kind:"CAPABILITY",component:"Zulu",exact_revision:"TEST_ONLY.v1",expected_digest:accessDigest("z")},
        {kind:"CONTRACT",component:"Alpha",exact_revision:"TEST_ONLY.v1",expected_digest:accessDigest("a")}]});
    if(options.count!==undefined)request.evidence_refs=Array.from({length:options.count},(_,i)=>({...request.evidence_refs[0]!,reference_id:"TEST_ONLY:ref"+i}));
    const ev=request.evidence_refs.map(e=>({...e,expires_at:new Date(e.expires_at).toISOString()}));
    const req=[...request.compatibility_requirements].sort((a,b)=>(a.kind+":"+a.component).localeCompare(b.kind+":"+b.component));
    let id=next();
    // Actual repository transaction; an explicitly declared initial TEST_ONLY
    // wrong pin/overlimit cohort is not claimed as original public writer output.
    await new ActivationRepository(ctx.pool).createPlan({planId:id,actorUserId:owner.user.userId,actorUsername:owner.user.username,
      requestId:next(),requestDigest:accessDigest({...request,evidence_refs:ev,compatibility_requirements:req}),
      evidenceSetHash:options.wrongHash?accessDigest("TEST_ONLY_WRONG_PIN"):accessDigest(ev),
      compatibilitySetHash:accessDigest(req),status:"BLOCKED",blockers:["SOURCE_DARK_RUNTIME_LOCK"],
      expiresAt:new Date(await dbNow()+600_000),request});
    if(options.historical||options.invalidExpiry){
      // Initial TEST_ONLY history clone, not a claim that the public writer ran
      // in the past. Existing captured-column/child guards remain enabled.
      // Do NOT ask the real writer for expiry<created and mislabel it history.
      const original=id,initial=(await ctx.pool.query("SELECT * FROM execution_activation_plans WHERE plan_id=$1",[original])).rows[0];
      const at=await dbNow(),requestKey=next();id=next();
      await insert("execution_activation_plans",{...initial,plan_id:id,request_key:requestKey,
        request_digest:accessDigest({...request,request_key:requestKey,evidence_refs:ev,compatibility_requirements:req}),
        created_at:new Date(at-120_000),updated_at:new Date(at-90_000),
        expires_at:new Date(at-(options.invalidExpiry?180_000:60_000))});
      for(const table of ["execution_activation_evidence_refs","execution_activation_compatibility_requirements"]){
        const children=(await ctx.pool.query("SELECT * FROM "+identifier(table)+" WHERE plan_id=$1 ORDER BY ordinal",[original])).rows;
        for(const row of children)await insert(table,{...row,plan_id:id,created_at:new Date(at-120_000)});
      }
    }
    if(options.gap){
      // No immutable UPDATE: append an initial legal extra child with gap; DB
      // ordinal CHECK alone permits it, ROOT verifier must reject the cohort.
      const first=(await ctx.pool.query("SELECT * FROM execution_activation_evidence_refs WHERE plan_id=$1 AND ordinal=0",[id])).rows[0];
      await insert("execution_activation_evidence_refs",{...first,ordinal:2,reference_id:next()});
    }
    return id;
  }
  async function appliedActivation(f:Fixture,capability:"QUERY"|"PROJECTION"){
    const producer=new ActivationService(new ActivationRepository(ctx.pool));
    const request=StagedActivationPlanRequestSchema.parse({schema_version:"execution.staged-activation-plan-request.v1",workspace_id:f.workspace,
      request_key:next(),capability_key:capability,action:"ROLLBACK",target_profile:"fixture",expected_capability_version:1,
      reason:PRIVATE,evidence_refs:[],compatibility_requirements:[]});
    const id=(await producer.plan(owner.user,request,next())).plan.plan_id;
    await producer.apply(owner.user,id,{schema_version:"execution.staged-activation-apply-request.v1",workspace_id:f.workspace,
      request_key:next(),expected_plan_version:1,expected_capability_version:1},next());return id;
  }
  const activationPath=(f:Fixture,id?:string,env="paper")=>"/api/v1/execution/activation/"+
    (id?"plans/"+encodeURIComponent(id):"capabilities")+"?workspace_id="+encodeURIComponent(f.workspace)+"&environment="+env;
  const activationRead=(f:Fixture,id?:string,env:unknown="paper")=>id?
    f.activationService.detail(f.principal,id,env):f.activationService.capabilities(f.principal,env);
  async function activationState(f:Fixture){
    return (await ctx.pool.query("SELECT jsonb_build_object("+
      "'caps',(SELECT jsonb_agg(to_jsonb(c) ORDER BY capability_key) FROM execution_activation_capabilities c WHERE workspace_id=$1),"+
      "'plans',(SELECT jsonb_agg(to_jsonb(p) ORDER BY plan_id) FROM execution_activation_plans p WHERE workspace_id=$1),"+
      "'events',(SELECT count(*) FROM execution_activation_events e JOIN execution_activation_plans p USING(plan_id) WHERE p.workspace_id=$1),"+
      "'audit',(SELECT count(*) FROM product_audit_events WHERE workspace_id=$1),"+
      "'outbox',(SELECT count(*) FROM outbox_messages WHERE workspace_id=$1)) AS value",[f.workspace])).rows[0].value;
  }
  it.each(["paper","sandbox","live"] as const)("Activation %s is an explicit current ROOT perspective, never target profile origin",async env=>{
    const f=await fixture({activation:true,nativeEnvironment:env}),producer=new ActivationService(new ActivationRepository(ctx.pool));
    const beforeEmpty=await activationState(f);
    const empty=currentActivationCapabilities.parse(await activationRead(f,undefined,env));
    expect(empty.capabilities).toHaveLength(7);expect(empty.capabilities.every(c=>c.record_state==="NOT_RECORDED")).toBe(true);
    expect(await activationState(f)).toEqual(beforeEmpty);
    expect(f.sql.join("\n")).not.toMatch(/execution_activation_evidence_refs|execution_activation_compatibility_requirements|actor_user_id|actor_username|request_key|request_digest|reason|detached_signature/);
    // Genuine existing public producer path exercises normalization and PG writer.
    const request=StagedActivationPlanRequestSchema.parse({schema_version:"execution.staged-activation-plan-request.v1",workspace_id:f.workspace,
      request_key:next(),capability_key:"PROJECTION",action:"ROLLBACK",target_profile:"fixture",expected_capability_version:1,
      reason:PRIVATE,evidence_refs:[],compatibility_requirements:[]});
    const created=await producer.plan(owner.user,request,next()),id=created.plan.plan_id;
    const before=await activationState(f);
    await withHttp(f,async(http,legacy)=>{
      for(const path of [activationPath(f),activationPath(f,id)].map(p=>p.replace("environment=paper","environment="+env))){
        const response=await http.inject({method:"GET",url:path,headers:headers(f)});
        expect(response.statusCode,response.body).toBe(200);expect(response.headers["cache-control"]).toBe("private, no-store");
        const body=path.includes("/plans/")?currentActivationPlanRead.parse(response.json()):currentActivationCapabilities.parse(response.json());
        expect(body.perspective).toEqual({environment:env,root_id:f.targets[0]!.id,basis:"CURRENT_PUBLISHED_TECHNICAL_ROOT",captured_native_environment:null});
        const {snapshot_revision,observed_at_ms,...publicBody}=body;expect(snapshot_revision).toBe(accessDigest(publicBody));finite(body);
      }
      expect(legacy).not.toHaveBeenCalled();
    });
    expect(await activationState(f)).toEqual(before);expect(f.forbidden).not.toHaveBeenCalled();expect(f.held()).toBe(0);
    for(const grant of f.accepted.filter(g=>g.action==="audit.read"))expect(grant.ts_acceptance_digest).toBeTruthy();
  });
  it("Activation identity is bounded read-only metadata and releases before any protected decoder",async()=>{
    const f=await fixture({activation:true}),id=await activationPlan(f),start=f.sql.length;
    expect(await f.activationRepository.identityCandidate(f.workspace,id)).toEqual({
      workspaceId:f.workspace,planId:id,capabilityKey:"QUERY"});
    const sql=f.sql.slice(start);
    expect(sql[0]).toBe("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(sql.some(q=>/^SET LOCAL statement_timeout='(?:2s|2000ms)'$/.test(q))).toBe(true);
    expect(sql.some(q=>/^SET LOCAL idle_in_transaction_session_timeout='(?:5s|5000ms)'$/.test(q))).toBe(true);
    expect(sql.at(-1)).toBe("COMMIT");
    expect(sql.filter(q=>q.startsWith("SELECT"))).toHaveLength(1);
    expect(sql.join("\n")).not.toMatch(/p\.status|evidence_set_hash|compatibility_set_hash|reason|actor|signature/);
    expect(f.held()).toBe(0);
    const decode=restore(vi.spyOn(f.activationRepository,"protectedDetails"));
    const confirm=restore(vi.spyOn(f.access,"confirmReadContext"));
    await refused(activationRead(f,next()),404,"OPERATIONAL_READ_NOT_FOUND");
    expect(decode).not.toHaveBeenCalled();expect(confirm).toHaveBeenCalledOnce();expect(f.held()).toBe(0);
  });
  it("Activation initially legal expiry-before-creation is corrupt, not expired historical authority",async()=>{
    const f=await fixture({activation:true}),id=await activationPlan(f,{invalidExpiry:true});
    const initial=(await ctx.pool.query("SELECT created_at,expires_at FROM execution_activation_plans WHERE plan_id=$1",[id])).rows[0];
    expect(initial.expires_at.getTime()).toBeLessThan(initial.created_at.getTime());
    const before=await activationState(f),confirm=restore(vi.spyOn(f.access,"confirmReadContext"));
    await refused(activationRead(f,id),503,"ACTIVATION_METADATA_INTEGRITY_UNAVAILABLE");
    expect(confirm).toHaveBeenCalledOnce();expect(await activationState(f)).toEqual(before);expect(f.held()).toBe(0);
    await expect(ctx.pool.query("UPDATE execution_activation_plans SET expires_at=created_at+interval '1 day' WHERE plan_id=$1",[id]))
      .rejects.toMatchObject({code:"55000"}); // No repair/refresh of immutable history.
  });
  it("Activation normalizes offset expiry and sorted hash requirements but returns original stored ordinals; history expiry is not read expiry",async()=>{
    const f=await fixture({activation:true}),id=await activationPlan(f,{historical:true}),body=currentActivationPlanRead.parse(await activationRead(f,id));
    expect(body.plan.stored_status).toBe("BLOCKED");expect(body.plan.created_at_ms).toBeLessThan(body.plan.expires_at_ms);
    expect(body.plan.expires_at_ms).toBeLessThan(await dbNow());
    expect(body.evidence.availability).toBe("AVAILABLE");expect(body.compatibility.availability).toBe("AVAILABLE");
    if(body.evidence.availability!=="AVAILABLE"||body.compatibility.availability!=="AVAILABLE")throw Error("TEST_ONLY sections");
    expect(body.evidence.items[0]!.expires_at_ms).toBe(Date.parse("2030-01-01T00:00:00.000Z"));
    expect(body.compatibility.items.map(r=>r.component)).toEqual(["Zulu","Alpha"]);finite(body);
    expect(JSON.stringify(body)).not.toMatch(/detached_signature|signer_fingerprint|request_digest|evidence_set_hash|compatibility_set_hash|reason|actor/);
    await expect(ctx.pool.query("UPDATE execution_activation_plans SET expires_at=expires_at+interval '1 microsecond' WHERE plan_id=$1",[id]))
      .rejects.toMatchObject({code:"55000"});
  });
  it.each(["ACTIVATION_PLAN_EVIDENCE","ACTIVATION_PLAN_COMPATIBILITY"] as const)("Activation optional %s cannot disclose through ROOT integrity",async omitted=>{
    const f=await fixture({activation:true,purposes:activationPurposes.filter(p=>p!==omitted)}),id=await activationPlan(f);
    const body=currentActivationPlanRead.parse(await activationRead(f,id));
    expect(omitted==="ACTIVATION_PLAN_EVIDENCE"?body.evidence:body.compatibility).toEqual({availability:"NOT_AUTHORIZED"});
    // Both children ARE read transiently under the explicit ROOT integrity
    // footprint. The absence claim is about disclosure, not zero private SQL.
    expect(f.sql.some(q=>q.includes("execution_activation_evidence_refs"))).toBe(true);
    expect(f.sql.some(q=>q.includes("execution_activation_compatibility_requirements"))).toBe(true);finite(body);
  });
  it.each(["no-maintenance","no-maintenance-owner","pending-root","gate-deny","no-root-seal","native-missing","wrong-environment","ambiguous-root"] as const)(
    "Activation %s refuses before protected SQL",async change=>{
      const f=await fixture({activation:true,...(["no-maintenance","no-maintenance-owner"].includes(change)?{gate:false}:{}),
        ...(change==="no-maintenance-owner"?{account:owner}:{}),...(change==="pending-root"?{pendingAnchor:"ROOT" as const}:{}),
        ...(change==="no-root-seal"?{purposes:activationPurposes.filter(p=>p!=="ACTIVATION_PLAN_ROOT")}:{})});
      const id=await activationPlan(f);
      if(change==="gate-deny")await f.grants.saveGrant({...f.gate,grant_id:next(),revision:next(),effect:"DENY"},true);
      if(change==="native-missing")for(const grant of f.source.grants)grant.targets=[];
      if(change==="ambiguous-root")f.source.resources[0]!.roots.push({...f.source.resources[0]!.roots[0]!,root_id:next()});
      const decode=restore(vi.spyOn(f.activationRepository,"protectedDetails")),confirm=restore(vi.spyOn(f.access,"confirmReadContext"));
      await refused(activationRead(f,id,change==="wrong-environment"?"sandbox":"paper"),
        change==="no-root-seal"?503:404,change==="no-root-seal"?"ACTIVATION_FIELD_PURPOSE_UNAVAILABLE":"OPERATIONAL_READ_NOT_FOUND");
      expect(decode).not.toHaveBeenCalled();expect(confirm).toHaveBeenCalledOnce();expect(f.held()).toBe(0);
    });
  it.each([undefined,"fixture",["paper","live"]] as const)("Activation invalid explicit perspective %j is held through actor fence",async env=>{
    const f=await fixture({activation:true}),confirm=restore(vi.spyOn(f.access,"confirmReadContext")),privateRead=restore(vi.spyOn(f.activationRepository,"protectedDetails"));
    await refused(f.activationService.capabilities(f.principal,env),400,"ACTIVATION_PERSPECTIVE_REQUIRED");
    expect(confirm).toHaveBeenCalledOnce();expect(privateRead).not.toHaveBeenCalled();
  });
  it.each(["wrong-pin","17th","ordinal-gap","foreign-head","wrong-key-head"] as const)("Activation initial legal TEST_ONLY %s cohort fails closed with guards intact",async change=>{
    const f=await fixture({activation:true}),id=await activationPlan(f,{wrongHash:change==="wrong-pin",count:change==="17th"?17:undefined,gap:change==="ordinal-gap"});
    if(change==="wrong-key-head"){
      const other=await appliedActivation(f,"PROJECTION");
      await ctx.pool.query("UPDATE execution_activation_capabilities SET capability_version=2,last_plan_id=$2 WHERE workspace_id=$1 AND capability_key='QUERY'",[f.workspace,other]);
    }
    if(change==="foreign-head"){
      const foreign=await fixture({activation:true}),foreignId=await appliedActivation(foreign,"QUERY");
      // Mutable head FK is global; own-scope reader must reject the foreign ID.
      await ctx.pool.query("UPDATE execution_activation_capabilities SET capability_version=2,last_plan_id=$2 WHERE workspace_id=$1 AND capability_key='QUERY'",[f.workspace,foreignId]);
    }
    await refused(activationRead(f,id),503,change==="17th"?"OPERATIONAL_READ_RESPONSE_BOUND":"ACTIVATION_METADATA_INTEGRITY_UNAVAILABLE");
  });
  it.each(["body","held-error"] as const)("Activation %s cannot escape revoked ROOT audit after released actual SQL",async variant=>{
    const f=await fixture({activation:true}),id=await activationPlan(f),actual=f.activationRepository.protectedDetails.bind(f.activationRepository),trace:string[]=[];
    restore(vi.spyOn(f.activationRepository,"protectedDetails").mockImplementation(async(...args)=>{
      const result=await actual(...args);expect(f.held()).toBe(0);trace.push("READ_RELEASED");
      const grant=f.accepted.find(g=>g.action==="audit.read")!;
      await f.grants.saveGrant({...grant,revision:next(),revoked_at_ms:await dbNow()});
      if(variant==="held-error"){trace.push("ERROR_ASSEMBLED");throw Error(PRIVATE);}return result;
    }));
    const confirm=f.access.confirmReadContext.bind(f.access);
    restore(vi.spyOn(f.access,"confirmReadContext").mockImplementation(async(...args)=>{trace.push("LAST_CORE");return confirm(...args);}));
    await withHttp(f,async(http,legacy)=>{
      const response=await http.inject({method:"GET",url:activationPath(f,id),headers:headers(f)});
      expect(response.statusCode,response.body).toBe(409);expect(response.json().error.code).toBe("OPERATIONAL_READ_CHANGED");
      expect(response.headers["cache-control"]).toBe("private, no-store");expect(legacy).not.toHaveBeenCalled();
    });expect(trace.at(-1)).toBe("LAST_CORE");
  });
  it.each(["maintenance","optional-field","native-root","root-head","membership"] as const)("Activation %s revoke after actual local equality defeats the body",async change=>{
    const f=await fixture({activation:true}),id=await activationPlan(f),actual=f.activationRepository.isUnchanged.bind(f.activationRepository);
    restore(vi.spyOn(f.activationRepository,"isUnchanged").mockImplementation(async(...args)=>{
      const same=await actual(...args);expect(same).toBe(true);expect(f.held()).toBe(0);
      if(change==="native-root")for(const grant of f.source.grants)grant.targets=[];
      else if(change==="root-head")f.source.resources[0]!.roots[0]!.root_id=next();
      else if(change==="membership")await ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2",[f.workspace,f.account.user.userId]);
      else{const grant=change==="maintenance"?f.gate:f.accepted.find(g=>g.field_policy_ref==="TEST_ONLY:ACTIVATION_PLAN_EVIDENCE")!;
        await f.grants.saveGrant({...grant,revision:next(),revoked_at_ms:await dbNow()});}return same;
    }));
    const hidden=["native-root","root-head","membership"].includes(change);
    await refused(activationRead(f,id),hidden?404:409,hidden?"OPERATIONAL_READ_NOT_FOUND":"OPERATIONAL_READ_CHANGED");
  });
  it.each(["body","held-error"] as const)("Activation %s genuine renewed session is not bound to its old idle clock",async variant=>{
    const f=await fixture({activation:true}),id=await activationPlan(f),login=await auth.login({assertion:reader.username,username:reader.username,credential:password});
    const session=(await auth.sessionFromToken(login.token))!,principal={...f.principal,session};
    const deadline=Number((await ctx.pool.query("UPDATE auth_sessions SET idle_expires_at=clock_timestamp()+interval '2 seconds' WHERE session_id=$1 RETURNING floor(extract(epoch FROM idle_expires_at)*1000)::bigint AS ms",[session.sessionId])).rows[0].ms);
    const actual=f.activationRepository.protectedDetails.bind(f.activationRepository);let once=false;
    restore(vi.spyOn(f.activationRepository,"protectedDetails").mockImplementation(async(...args)=>{
      const value=await actual(...args);
      if(!once){once=true;expect(await dbNow()).toBeLessThan(deadline);await new SessionsRepository(ctx.pool).markSeen(session.sessionId);
        expect((await auth.sessionFromToken(login.token))!.idleExpiresAt.getTime()).toBeGreaterThan(deadline);await afterDb(deadline+10);}
      if(variant==="held-error")throw Error(PRIVATE);return value;
    }));
    const pending=f.activationService.detail(principal,id,"paper");
    if(variant==="body")expect(currentActivationPlanRead.parse(await pending).plan.plan_id).toBe(id);
    else await refused(pending,503,"ACTIVATION_METADATA_UNAVAILABLE");
  },12_000);
  it.each([
    {variant:"body",change:"session"},{variant:"body",change:"field"},{variant:"body",change:"native"},{variant:"body",change:"grant"},
    {variant:"held-error",change:"session"},{variant:"held-error",change:"field"},{variant:"held-error",change:"native"},{variant:"held-error",change:"grant"},
    {variant:"held-error",change:"actor"},
  ] as const)(
    "Activation $variant cannot cross genuine terminal $change loss",async({variant,change}:{variant:"body"|"held-error";change:"actor"|"session"|"field"|"native"|"grant"})=>{
    const account=await activated("USER"),f=await fixture({activation:true,account,
      ...(change==="field"?{fieldTtlMs:8000}:change==="native"?{nativeTtlMs:8000}:change==="grant"?{grantTtlMs:8000}:{})}),id=await activationPlan(f);
    const actual=f.activationRepository.protectedDetails.bind(f.activationRepository),trace:string[]=[];
    restore(vi.spyOn(f.activationRepository,"protectedDetails").mockImplementation(async(...args)=>{
      const value=await actual(...args);trace.push("READ_RELEASED");if(change==="actor")await ctx.pool.query("UPDATE portal_users SET session_version=session_version+1 WHERE user_id=$1",[account.user.userId]);
      if(variant==="held-error"){trace.push("ERROR_ASSEMBLED");throw Error(PRIVATE);}return value;
    }));
    const confirm=f.access.confirmReadContext.bind(f.access);
    restore(vi.spyOn(f.access,"confirmReadContext").mockImplementation(async(...args)=>{
      trace.push("LAST_CORE_ENTERED");let deadline:number|undefined;
      if(change==="session")deadline=Number((await ctx.pool.query("UPDATE auth_sessions SET idle_expires_at=clock_timestamp()+interval '1200 milliseconds' WHERE session_id=$1 RETURNING floor(extract(epoch FROM least(idle_expires_at,absolute_expires_at))*1000)::bigint AS ms",[account.session.sessionId])).rows[0].ms);
      const current=await confirm(...args);trace.push("LAST_CORE_CAPTURED");
      if(change==="field")deadline=f.policy.parent_read_fields!.find(s=>s.purpose==="ACTIVATION_PLAN_ROOT")!.valid_until_ms;
      if(change==="native")deadline=f.facts[0]!.expires_at_ms!;
      if(change==="grant")deadline=f.gate.valid_until_ms!;
      if(deadline===undefined)throw Error("TEST_ONLY actor must fail actual confirmation");
      expect(await dbNow()).toBeLessThan(deadline);await afterDb(deadline+10,12_000);return current;
    }));
    await withHttp(f,async(http,legacy)=>{
      const response=await http.inject({method:"GET",url:activationPath(f,id),headers:headers(f)});
      expect(response.statusCode,response.body).toBe(change==="field"?503:change==="grant"?409:change==="native"?404:403);
      expect(response.json().error.code).toBe(change==="field"?"ACTIVATION_FIELD_PURPOSE_UNAVAILABLE":
        change==="grant"?"OPERATIONAL_READ_CHANGED":change==="native"?"OPERATIONAL_READ_NOT_FOUND":"OPERATIONAL_READ_AUTHORITY_REQUIRED");
      expect(response.headers["cache-control"]).toBe("private, no-store");expect(legacy).not.toHaveBeenCalled();
    });
    expect(trace[0]).toBe("READ_RELEASED");expect(trace.includes("ERROR_ASSEMBLED")).toBe(variant==="held-error");expect(trace).toContain("LAST_CORE_ENTERED");
  },20_000);

  it("Activation genuine fixture rollback apply/verify maintains same-workspace capability head and historical plan linkage",async()=>{
    const f=await fixture({activation:true}),producer=new ActivationService(new ActivationRepository(ctx.pool));
    const request=StagedActivationPlanRequestSchema.parse({schema_version:"execution.staged-activation-plan-request.v1",workspace_id:f.workspace,
      request_key:next(),capability_key:"QUERY",action:"ROLLBACK",target_profile:"fixture",expected_capability_version:1,
      reason:PRIVATE,evidence_refs:[],compatibility_requirements:[]});
    const created=await producer.plan(owner.user,request,next()),id=created.plan.plan_id;
    await producer.apply(owner.user,id,{schema_version:"execution.staged-activation-apply-request.v1",workspace_id:f.workspace,
      request_key:next(),expected_plan_version:1,expected_capability_version:1},next());
    const applied=currentActivationPlanRead.parse(await activationRead(f,id));
    expect(applied.plan.stored_status).toBe("APPLIED");expect(applied.capability).toMatchObject({record_state:"RECORDED",capability_version:2,last_plan_id:id});
    await producer.verify(owner.user,id,{schema_version:"execution.staged-activation-verify-request.v1",workspace_id:f.workspace,
      request_key:next(),expected_plan_version:2,expected_capability_version:2},next());
    const verified=currentActivationPlanRead.parse(await activationRead(f,id));
    expect(verified.plan.stored_status).toBe("VERIFIED");expect(verified.plan.verified_at_ms).not.toBeNull();
    // These are actual source-dark producer transitions in the disposable test
    // DB, not source/runtime activation, and never invoked by the GET.
    expect(verified.capability).toMatchObject({source_enabled:false,runtime_enabled:false,kill_switch_engaged:true});
    await expect(ctx.pool.query("UPDATE execution_activation_capabilities SET source_enabled=true WHERE workspace_id=$1 AND capability_key='QUERY'",[f.workspace]))
      .rejects.toMatchObject({code:"23514"});
  });
  it("Activation exact microsecond private witness changes while unchanged authorized public milliseconds keep their revision",async()=>{
    const f=await fixture({activation:true}),id=await activationPlan(f);
    await ctx.pool.query("UPDATE execution_activation_capabilities SET updated_at=date_trunc('milliseconds',updated_at)+interval '1789 microseconds' WHERE workspace_id=$1 AND capability_key='QUERY'",[f.workspace]);
    const candidate=(await f.activationRepository.identityCandidate(f.workspace,id))!,sections={evidence:true,compatibility:true};
    const before=await f.activationRepository.protectedDetails(f.workspace,candidate,sections),bodyBefore=currentActivationPlanRead.parse(await activationRead(f,id));
    await ctx.pool.query("UPDATE execution_activation_capabilities SET updated_at=updated_at+interval '1 microsecond' WHERE workspace_id=$1 AND capability_key='QUERY'",[f.workspace]);
    expect(await f.activationRepository.isUnchanged(f.workspace,before.witness,candidate,sections)).toBe(false);
    const bodyAfter=currentActivationPlanRead.parse(await activationRead(f,id));
    expect(bodyAfter.capability).toEqual(bodyBefore.capability);expect(bodyAfter.snapshot_revision).toBe(bodyBefore.snapshot_revision);
    // Not a fabricated source-positive or same-ms command race; one legally
    // mutable timestamp changes, actual PG precision distinguishes its witness.
  });

});
