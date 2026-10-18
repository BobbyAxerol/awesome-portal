/**
 * ELP2-03 real disposable-PG and mounted Nest/Fastify regression definitions.
 * The explicit TEST_DATABASE_URL is the only database target. The synthetic
 * reviewed policy, human mapping, relations and receipt verifier below are
 * TEST_ONLY dependency injection, never TS producer/runtime qualification.
 * No public socket is opened; HTTP assertions use Fastify.inject().
 */
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import fastifyCookie from "@fastify/cookie";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { generateKeyPair, SignJWT } from "jose";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AdminService } from "../src/admin/admin.service";
import { AuthService } from "../src/auth/auth.service";
import { CSRF_COOKIE, SESSION_COOKIE } from "../src/auth/cookies";
import { PortalUser, VerifiedAccessIdentity } from "../src/domain";
import { SessionGuard } from "../src/facade/session.guard";
import { HttpErrorFilter } from "../src/http-error.filter";
import { AccountLifecycleRepository } from "../src/repos/account-lifecycle";
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { WorkspacesRepository } from "../src/repos/workspaces";
import { CONTROL_API_CONFIG } from "../src/tokens";
import { AccessAction, AccessActor, GrantChange, ReviewedAccessPolicy,
  ScopedAccessGrant, TsMembershipAcceptance } from "../src/execution-v2/access.contract";
import { AccessRelations, accessDigest, canonicalChange, canonicalSelector } from "../src/execution-v2/access-policy";
import { grantBindingDigest, type CurrentAccessRelations } from "../src/execution-v2/access-current-relations";
import { ExecutionAccessController } from "../src/execution-v2/access.controller";
import { AccessReceipt, AccessRepository } from "../src/execution-v2/access.repository";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import { AccessTrustProvider, ReviewedPolicyArtifact } from "../src/execution-v2/access-trust";
import { CurrentHumanCandidate, type CurrentHumanBinding, type CurrentHumanCandidateConfig } from "../src/execution-v2/current-human-candidate";
import { CurrentHumanMutations, type CurrentHumanRecoveryPort } from "../src/execution-v2/current-human-mutations";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const PASSWORD = "elp203-test-only-correct-horse-battery-2026";
const BASE = "/api/admin/profile-access/v2";
type Session = Awaited<ReturnType<AuthService["login"]>>;
type Account = { user: PortalUser; session: Session; assertion: string };
type Submitted = Awaited<ReturnType<ExecutionAccessService["propose"]>>;

@Module({})
class TestOnlyAccessModule {}

describe.skipIf(!DATABASE_URL)("ELP2-03 TEST_ONLY policy with real PostgreSQL authority fences", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let auth: AuthService;
  let admin: AdminService;
  let owner: Account;
  let manager: Account;
  let researcher: Account;
  let peer: Account;
  let sequence = 0;
  const next = (label: string) => `elp203-${label}-${++sequence}`;
  const actor = (account: Account): AccessActor => ({ user_id: account.user.userId,
    session_id: account.session.sessionId, session_generation: account.user.sessionVersion });
  const cookie = (session: Session) => `${SESSION_COOKIE}=${session.token}; ${CSRF_COOKIE}=${session.csrfToken}`;
  const headers = (session: Session, key = next("http")): Record<string, string> => ({
    cookie: cookie(session), origin: ctx.config.PORTAL_PUBLIC_ORIGIN,
    "x-portal-csrf": session.csrfToken, "x-portal-idempotency-key": key,
  });

  async function active(label: string, role: "ADMIN" | "USER" = "USER"): Promise<Account> {
    const username = next(label);
    const created = await admin.createUser({ username, displayName: username, role });
    const activation = await admin.resetCredential(created.userId);
    const initial = await auth.login({ assertion: username, username, credential: activation.activationToken });
    await auth.changePassword({ sessionToken: initial.token, csrfToken: initial.csrfToken,
      currentPassword: activation.activationToken, newPassword: PASSWORD });
    const session = await auth.login({ assertion: username, username, credential: PASSWORD });
    return { user: (await auth.users.findById(created.userId))!, session, assertion: username };
  }

  /** Only exact in-memory verifier handles qualify; raw receipt-shaped JSON does not. */
  class TestOnlyTrust implements AccessTrustProvider {
    readonly receipts = new Map<object, TsMembershipAcceptance>();
    readonly memberships = new Map<string, AccessRelations["membership"]>();
    readonly currentAuthorities = new Map<string, CurrentAccessRelations>();
    beforeHumanMapping?: () => Promise<void>;
    constructor(readonly artifact: ReviewedPolicyArtifact, readonly resources: AccessRelations["roots"]) {}
    async verifyPolicy(input: unknown) { return input === this.artifact ? this.artifact : null; }
    async verifyReceipt(input: unknown) {
      return typeof input === "object" && input !== null ? this.receipts.get(input) ?? null : null;
    }
    async relations(userId: string, workspace: string): Promise<AccessRelations> {
      if (workspace !== this.artifact.policy.workspace_id) return { qualified: false, revision: "UNQUALIFIED",
        own_alpha_ids: [], member_portfolio_ids: [], roots: {}, membership: null };
      const membership = this.memberships.get(userId) ?? null;
      return { qualified: true, revision: `TEST_ONLY-relations:${membership?.revision ?? "none"}`,
        own_alpha_ids: userId === researcher.user.userId ? ["TEST_ONLY-alpha-1"] : [],
        member_portfolio_ids: ["TEST_ONLY-portfolio-1"], roots: this.resources, membership,
        ...(this.currentAuthorities.has(userId)?{membership:null,current_authority:structuredClone(this.currentAuthorities.get(userId)!)}:{}) };
    }
    async verifiedHumanMapping(userId: string, workspace: string) {
      if (this.beforeHumanMapping) await this.beforeHumanMapping();
      return workspace === this.artifact.policy.workspace_id
        ? { ts_user_id: `TEST_ONLY-ts:${userId}`, revision: "TEST_ONLY-human-mapping-v1" } : null;
    }
    seal(fact: TsMembershipAcceptance, publishCurrent = fact.outcome === "ACCEPTED"): object {
      const handle = Object.freeze({ TEST_ONLY_verified_receipt: next("proof") });
      this.receipts.set(handle, structuredClone(fact));
      if (publishCurrent) this.memberships.set(fact.portal_user_id, { revision: fact.membership_revision,
        receipt_id: fact.receipt_id, mapping_revision: fact.mapping_revision });
      return handle;
    }
  }

  async function fixture(issuingManager = manager) {
    const workspace = next("workspace");
    await ctx.pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,$2,$3)",
      [workspace, "TEST_ONLY ELP2-03 workspace", owner.user.userId]);
    const accounts = [...new Map([owner, issuingManager, researcher, peer].map(a => [a.user.userId, a])).values()];
    for (const account of accounts) await ctx.pool.query(
      "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,$3)",
      [workspace, account.user.userId, account === owner ? "OWNER" : "MEMBER"]);
    const now = Date.now();
    const policy: ReviewedAccessPolicy = { workspace_id: workspace, revision: `TEST_ONLY-policy:${workspace}`,
      artifact_digest: accessDigest(["TEST_ONLY-reviewed-policy", workspace]), approval_ref: "TEST_ONLY-not-owner-approval",
      state: "REVIEWED", qualification: "TEST_ONLY", protected_owner_user_id: owner.user.userId,
      researcher_fields: { state: "PENDING", policy_ref: null, fields: [] } };
    const rootId = `TEST_ONLY-root:${workspace}`;
    const resources: AccessRelations["roots"] = { [rootId]: [
      ...accounts.map(a => ({ kind: "USER" as const, id: a.user.userId })),
      { kind: "PORTFOLIO", id: "TEST_ONLY-portfolio-1" },
      { kind: "PORTFOLIO", id: "TEST_ONLY-portfolio-2" }, { kind: "ALPHA", id: "TEST_ONLY-alpha-1" },
    ] };
    const actions: AccessAction[] = ["users.read", "access.grant", "access.read", "audit.read", "portfolio.read"];
    const root = (subject: Account, action: AccessAction): ScopedAccessGrant => ({
      grant_id: `TEST_ONLY-root-grant:${workspace}:${subject.user.userId}:${action}`,
      subject_user_id: subject.user.userId, workspace_id: workspace, action, effect: "ALLOW",
      selector: { kind: "ROOT_SCOPE", root_id: rootId }, environments: ["paper", "sandbox"],
      valid_from_ms: now - 60_000, valid_until_ms: now + 3_600_000,
      delegable_actions: action === "access.grant" ? actions : [], issued_by: owner.user.userId,
      parent_grant_id: null, revision: `TEST_ONLY-root-revision:${workspace}:${subject.user.userId}:${action}`,
      policy_revision: policy.revision, revoked_at_ms: null, requires_ts_acceptance: false,
      ts_receipt: null, field_policy_ref: null,
    });
    const rootGrants = [root(owner, "access.grant"), root(owner, "access.revoke"), root(owner, "audit.read"),
      root(owner, "access.read"), root(issuingManager, "access.grant"), root(issuingManager, "access.revoke")];
    const artifact: ReviewedPolicyArtifact = { policy, root_grants: rootGrants, provenance_ref: "TEST_ONLY-isolated-harness" };
    const trust = new TestOnlyTrust(artifact, resources);
    const service = new ExecutionAccessService(ctx.pool, auth, trust, true);
    await service.installReviewedPolicy(artifact);
    for (const account of [owner, issuingManager]) await new AccountLifecycleRepository(ctx.pool).grantStepUp({
      stepUpId: next("stepup"), sessionId: account.session.sessionId, userId: account.user.userId, ttlSeconds: 600,
    });
    const managerRoot = rootGrants.find(g => g.subject_user_id === issuingManager.user.userId && g.action === "access.grant")!;
    const ownerRoot = rootGrants.find(g => g.subject_user_id === owner.user.userId && g.action === "access.grant")!;
    const change = (overrides: Partial<GrantChange> = {}): GrantChange => ({
      subject_user_id: researcher.user.userId, action: "users.read", effect: "ALLOW",
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "USER", ids: [peer.user.userId] },
      environments: ["paper"], valid_from_ms: now - 1_000, valid_until_ms: now + 1_800_000,
      delegable_actions: [], ceiling_grant_id: managerRoot.grant_id, expected_ceiling_revision: managerRoot.revision,
      expected_policy_revision: policy.revision, expected_ts_membership_revision: null,
      reason: "TEST_ONLY scoped regression", ...overrides,
    });
    const submit = async (request = change(), key = next("submit"), by = issuingManager) => {
      const preview = await service.preview(actor(by), workspace, request);
      return service.propose(actor(by), workspace, request, preview.preview_digest, key);
    };
    return { workspace, policy, trust, service, managerRoot, ownerRoot, change, submit, issuingManager };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;

  /** Real isolated Core candidate and services, ephemeral TEST_ONLY signatures.
   * No mocked coordinator result is treated as source terminal authority. */
  async function withCurrentHuman(f:Fixture,by:Account,run:(cell:{
    pool:Pool;candidate:CurrentHumanCandidate;binding:CurrentHumanBinding;
    enter():Promise<{lease_id:string}>;resolve(leaseId:string,phase?:"COMMITTED"|"UNKNOWN"):Promise<unknown>;
    service(recover:CurrentHumanRecoveryPort["recover"],trust?:AccessTrustProvider):ExecutionAccessService;
  })=>Promise<void>,ttlMs=30000) {
    const pool=new Pool({connectionString:DATABASE_URL!,max:1,connectionTimeoutMillis:500,query_timeout:6000});
    let installed=false;
    const originalRelations=f.trust.relations.bind(f.trust);
    const relations=vi.spyOn(f.trust,"relations").mockImplementation(async(id,workspace)=>{
      expect(pool.totalCount-pool.idleCount).toBe(0);
      // This single-connection query would time out if a source adapter were
      // called from either of the coordinator's Core transactions.
      await pool.query("SELECT user_id FROM portal_users WHERE user_id=$1 FOR UPDATE NOWAIT",[by.user.userId]);
      return originalRelations(id,workspace);
    });
    try {
      const [humanKey,sourceKey]=await Promise.all([
        generateKeyPair("EdDSA",{crv:"Ed25519",extractable:true}),
        generateKeyPair("EdDSA",{crv:"Ed25519",extractable:true}),
      ]);
      const binding:CurrentHumanBinding={workspace_id:f.workspace,environment:"paper",workload_id:"TEST_ONLY-access-pm",
        request_digest:accessDigest(["TEST_ONLY-source-request",next("request")])};
      const config:CurrentHumanCandidateConfig={issuer:"TEST_ONLY-access-portal",audience:"TEST_ONLY-access-pm",key_id:"TEST_ONLY-access-human-key",
        private_key:humanKey.privateKey,source:{issuer:"TEST_ONLY-access-source",audience:"TEST_ONLY-access-core",
          key_id:"TEST_ONLY-access-source-key",public_key:sourceKey.publicKey,workload_id:binding.workload_id},
        limits:{ttl_ms:ttlMs,maximum_unresolved:4,maximum_retained:12}};
      await pool.query(await readFile(join(__dirname,"../src/execution-v2/current-human-candidate.sql"),"utf8"));
      installed=true;
      const candidate=await CurrentHumanCandidate.create(pool,config);
      const proof=async(leaseId:string,phase:"ENTER"|"COMMITTED"|"UNKNOWN")=>{
        const now=Math.floor(Date.now()/1000),terminal=phase==="COMMITTED";
        return new SignJWT({iss:config.source.issuer,aud:config.source.audience,sub:config.source.workload_id,
          jti:next("proof"),iat:now,nbf:now,exp:now+60,purpose:"pma.current-human-lease.v1",
          lease_id:leaseId,attempt_id:`TEST_ONLY-attempt-${leaseId}`,...binding,phase,
          source_receipt_id:terminal?`TEST_ONLY-terminal-${leaseId}`:null,
          source_receipt_digest:terminal?accessDigest(["TEST_ONLY-terminal",leaseId]):null,
        }).setProtectedHeader({alg:"EdDSA",kid:config.source.key_id,typ:"JWT"}).sign(sourceKey.privateKey);
      };
      await run({pool,candidate,binding,
        enter:async()=>{
          const lease=await candidate.issue({user_id:by.user.userId,session_id:by.session.sessionId,
            session_generation:by.user.sessionVersion},binding);
          await candidate.enter(lease.token,await proof(lease.lease_id,"ENTER"));return lease;
        },resolve:async(leaseId,phase="COMMITTED")=>candidate.resolve(await proof(leaseId,phase)),
        service:(recover,trust=f.trust)=>new ExecutionAccessService(pool,auth,trust,true,new CurrentHumanMutations(pool,candidate,{
          recover:async attempt=>{
            expect(pool.totalCount-pool.idleCount).toBe(0);
            await pool.query("SELECT user_id FROM portal_users WHERE user_id=$1 FOR UPDATE NOWAIT",[by.user.userId]);
            return recover(attempt);
          },
        },{maximum_intents:12,maximum_recoveries_per_request:4})),
      });
    } finally {
      relations.mockRestore();
      try{if(installed)await pool.query("DROP SCHEMA elp210_candidate CASCADE");}
      finally{await pool.end();}
    }
  }

  async function storedGrant(id: string): Promise<ScopedAccessGrant> {
    return (await ctx.pool.query("SELECT grant_fact FROM portal_access_grants_v2 WHERE grant_id=$1", [id])).rows[0].grant_fact;
  }
  async function state(f: Fixture) {
    return (await ctx.pool.query(`SELECT
      (SELECT count(*)::int FROM portal_access_proposals WHERE workspace_id=$1) AS proposals,
      (SELECT count(*)::int FROM portal_access_grants_v2 WHERE workspace_id=$1) AS grants,
      (SELECT count(*)::int FROM portal_access_policy_events WHERE workspace_id=$1) AS events`, [f.workspace])).rows[0];
  }
  /** Preserve PostgreSQL's full timestamp precision rather than comparing JS
   * Date objects, which would miss a same-millisecond update during replay. */
  async function authorityRows(f: Fixture) {
    return (await ctx.pool.query(`SELECT 'policy' AS kind,workspace_id AS id,row_to_json(p)::text AS bytes
      FROM portal_access_policy_state p WHERE workspace_id=$1
      UNION ALL SELECT 'grant',grant_id,row_to_json(g)::text
      FROM portal_access_grants_v2 g WHERE workspace_id=$1
      UNION ALL SELECT 'proposal',proposal_id,row_to_json(p)::text
      FROM portal_access_proposals p WHERE workspace_id=$1
      UNION ALL SELECT 'event',event_id,row_to_json(e)::text
      FROM portal_access_policy_events e WHERE workspace_id=$1
      ORDER BY kind,id`, [f.workspace])).rows;
  }
  function emptyRootArtifact(f: Fixture, label: string): ReviewedPolicyArtifact {
    const revision = next(label);
    return {
      policy: { ...f.policy, revision, artifact_digest: accessDigest(["TEST_ONLY-reviewed-revision", revision]) },
      root_grants: [], provenance_ref: `TEST_ONLY-reviewed-provenance:${revision}`,
    };
  }
  async function installEmptyRootRevision(f: Fixture, label: string) {
    const artifact = emptyRootArtifact(f, label);
    Object.assign(f.trust.artifact, structuredClone(artifact));
    await f.service.installReviewedPolicy(f.trust.artifact);
    return artifact;
  }
  async function ownGrant(f: Fixture, receipt: AccessReceipt) {
    return (await f.service.effective(actor(researcher), f.workspace)).grants.find(g => g.grant_id === receipt.grant_id)!;
  }
  async function business(f: Fixture) {
    const request = f.change({ action: "portfolio.read", selector: { kind: "EXPLICIT_RESOURCE_SET",
      resource_kind: "PORTFOLIO", ids: ["TEST_ONLY-portfolio-1"] } });
    return { request, submitted: await f.submit(request) };
  }
  async function tsFact(f: Fixture, submitted: Submitted,
    overrides: Partial<TsMembershipAcceptance> = {}): Promise<TsMembershipAcceptance> {
    const row = (await ctx.pool.query("SELECT request_digest,change FROM portal_access_proposals WHERE proposal_id=$1",
      [submitted.receipt.proposal_id])).rows[0] as { request_digest: string; change: GrantChange };
    return { source: "TEST_ONLY-ts-producer", source_contract: "TEST_ONLY-membership.v1",
      trust_profile: "TEST_ONLY-NOT-QUALIFIED-IN-PRODUCTION", receipt_id: next("ts-receipt"),
      proposal_id: submitted.receipt.proposal_id!, proposal_digest: row.request_digest,
      portal_user_id: row.change.subject_user_id, ts_user_id: `TEST_ONLY-ts:${row.change.subject_user_id}`,
      mapping_revision: "TEST_ONLY-human-mapping-v1", human_requester_user_id: f.issuingManager.user.userId,
      workspace_id: f.workspace, action: row.change.action, selector_digest: accessDigest(canonicalSelector(row.change.selector)),
      environments: row.change.environments, previous_membership_revision: row.change.expected_ts_membership_revision,
      membership_revision: next("membership-revision"), effective_at_ms: row.change.valid_from_ms,
      expires_at_ms: row.change.valid_until_ms, outcome: "ACCEPTED", payload_digest: accessDigest(["TEST_ONLY", row.request_digest]),
      provenance_ref: "TEST_ONLY-verifier-proof", ...overrides };
  }
  async function withHttp(service: ExecutionAccessService, run: (app: NestFastifyApplication) => Promise<void>) {
    const app = await NestFactory.create<NestFastifyApplication>({ module: TestOnlyAccessModule,
      controllers: [ExecutionAccessController], providers: [SessionGuard,
        { provide: ExecutionAccessService, useValue: service }, { provide: AuthService, useValue: auth },
        { provide: WorkspacesRepository, useValue: new WorkspacesRepository(ctx.pool, ctx.config) },
        { provide: CONTROL_API_CONFIG, useValue: ctx.config },
      ] }, new FastifyAdapter(), { logger: false, abortOnError: false });
    try {
      app.useGlobalFilters(new HttpErrorFilter());
      await app.register(fastifyCookie as never);
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
      await run(app);
    } finally { await app.close(); }
  }

  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL!);
    ctx = await setupApp({ DATABASE_URL: DATABASE_URL! });
    auth = ctx.app.get(AuthService);
    admin = new AdminService(ctx.pool, ctx.config, auth);
    vi.spyOn(auth, "verifyAccessIdentity").mockImplementation(async assertion => {
      if (!assertion) throw new Error("TEST_ONLY_VERIFIED_IDENTITY_REQUIRED");
      return { iss: "https://test-only.cloudflareaccess.com", sub: `TEST_ONLY:${assertion}`,
        aud: "test-audience", email: `${assertion}@azdag.com`, normalizedEmail: `${assertion}@azdag.com`,
        authenticationTime: new Date(), tokenExpiresAt: new Date(Date.now() + 60_000) } satisfies VerifiedAccessIdentity;
    });
    owner = await active("protected-owner", "ADMIN");
    await new OwnerAccessRepository(ctx.pool).claimOwner({ userId: owner.user.userId, claimedBy: "ELP2-03_TEST_ONLY" });
    manager = await active("bounded-manager");
    researcher = await active("linked-researcher");
    peer = await active("owner-like-name-admin", "ADMIN");
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    if (ctx) await teardownApp(ctx);
  });

  it("T03-01/05 no migration or default service makes TEST_ONLY policy into production authority", async () => {
    expect((await ctx.pool.query("SELECT count(*)::int AS n FROM portal_access_policy_state")).rows[0].n).toBe(0);
    const f = await fixture();
    const defaultService = new ExecutionAccessService(ctx.pool, auth);
    expect(await defaultService.effective(actor(manager), f.workspace)).toMatchObject({ availability: "POLICY_PENDING",
      grants: expect.arrayContaining([expect.objectContaining({ current: false })]) });
    await expect(defaultService.installReviewedPolicy(f.trust.artifact)).rejects.toMatchObject({ code: "RECEIPT_NOT_QUALIFIED", status: 503 });
    await expect(new ExecutionAccessService(ctx.pool, auth, f.trust).installReviewedPolicy(f.trust.artifact))
      .rejects.toMatchObject({ code: "RECEIPT_NOT_QUALIFIED" });
    await expect(defaultService.acceptTsReceipt({ outcome: "ACCEPTED" })).rejects.toMatchObject({ code: "RECEIPT_NOT_QUALIFIED" });
  });

  it("T03-06 reinstall is idempotent only for the exact original policy and root-grant artifact", async () => {
    const f = await fixture(), before = await state(f);
    const originalGrants = (await ctx.pool.query("SELECT grant_fact FROM portal_access_grants_v2 WHERE workspace_id=$1 ORDER BY grant_id", [f.workspace])).rows;
    await f.service.installReviewedPolicy(f.trust.artifact);
    expect(await state(f)).toEqual(before);
    // Keep the policy revision unchanged but remove a root from the verified
    // TEST_ONLY artifact. The prior install's digest must still bind the roots.
    f.trust.artifact.root_grants = f.trust.artifact.root_grants.slice(0, -1);
    await expect(f.service.installReviewedPolicy(f.trust.artifact))
      .rejects.toMatchObject({ code: "POLICY_REVISION_CONFLICT", status: 409 });
    expect(await state(f)).toEqual(before);
    expect((await ctx.pool.query("SELECT grant_fact FROM portal_access_grants_v2 WHERE workspace_id=$1 ORDER BY grant_id", [f.workspace])).rows).toEqual(originalGrants);
  });

  it("ELP2-10 historical empty-root policy replay cannot roll the current revision back or rewrite timestamps", async () => {
    const f = await fixture();
    const historical = await installEmptyRootRevision(f, "TEST_ONLY-historical-B");
    const current = await installEmptyRootRevision(f, "TEST_ONLY-current-C");
    const before = await authorityRows(f);
    Object.assign(f.trust.artifact, structuredClone(historical));
    await f.service.installReviewedPolicy(f.trust.artifact);
    expect(await authorityRows(f)).toEqual(before);
    expect((await new AccessRepository(ctx.pool).policy(f.workspace))?.revision).toBe(current.policy.revision);
  });

  it.each(["policy", "roots", "provenance"] as const)(
    "ELP2-10 historical policy replay rejects changed %s under an installed revision without writes", async changed => {
      const f = await fixture();
      const historical = await installEmptyRootRevision(f, "TEST_ONLY-historical-mismatch-B");
      await installEmptyRootRevision(f, "TEST_ONLY-current-mismatch-C");
      const altered = structuredClone(historical);
      if (changed === "policy") altered.policy.artifact_digest = accessDigest(["TEST_ONLY-changed-artifact", historical.policy.revision]);
      if (changed === "roots") altered.root_grants = [{ ...f.managerRoot, grant_id: next("TEST_ONLY-new-historical-root"),
        revision: next("TEST_ONLY-new-historical-root-revision"), policy_revision: historical.policy.revision }];
      if (changed === "provenance") altered.provenance_ref = "TEST_ONLY-different-historical-provenance";
      const before = await authorityRows(f);
      Object.assign(f.trust.artifact, altered);
      await expect(f.service.installReviewedPolicy(f.trust.artifact))
        .rejects.toMatchObject({ code: "POLICY_REVISION_CONFLICT", status: 409 });
      expect(await authorityRows(f)).toEqual(before);
    });

  it("ELP2-10 historical policy replay acknowledges its original receipt without restoring a revoked root", async () => {
    const f = await fixture(), original = structuredClone(f.trust.artifact);
    const revoked = await f.service.revoke(actor(owner), f.workspace, f.managerRoot.grant_id,
      f.policy.revision, f.managerRoot.revision, next("TEST_ONLY-revoke-before-policy-replay"));
    expect(revoked.receipt.outcome).toBe("REVOKED");
    const current = await installEmptyRootRevision(f, "TEST_ONLY-after-root-revoke");
    const before = await authorityRows(f);
    Object.assign(f.trust.artifact, original);
    await f.service.installReviewedPolicy(f.trust.artifact);
    expect(await authorityRows(f)).toEqual(before);
    expect(await storedGrant(f.managerRoot.grant_id)).toMatchObject({
      revision: revoked.receipt.grant_revision, revoked_at_ms: expect.any(Number),
    });
    expect((await new AccessRepository(ctx.pool).policy(f.workspace))?.revision).toBe(current.policy.revision);
  });

  it("ELP2-10 historical policy replay preserves a later TS acceptance and its immutable source receipt", async () => {
    const f = await fixture(), original = structuredClone(f.trust.artifact);
    const { submitted } = await business(f), fact = await tsFact(f, submitted);
    const accepted = await f.service.acceptTsReceipt(f.trust.seal(fact));
    expect(accepted.receipt.outcome).toBe("TS_APPLIED");
    const grant = await storedGrant(submitted.receipt.grant_id!);
    expect(grant.ts_receipt?.receipt_id).toBe(fact.receipt_id);
    const current = await installEmptyRootRevision(f, "TEST_ONLY-after-ts-acceptance");
    const before = await authorityRows(f);
    Object.assign(f.trust.artifact, original);
    await f.service.installReviewedPolicy(f.trust.artifact);
    expect(await authorityRows(f)).toEqual(before);
    expect(await storedGrant(grant.grant_id)).toEqual(grant);
    expect((await new AccessRepository(ctx.pool).policy(f.workspace))?.revision).toBe(current.policy.revision);
  });

  it("ELP2-10 a current policy without an immutable install receipt conflicts instead of repairing authority", async () => {
    const f = await fixture(), revision = next("TEST_ONLY-missing-install");
    const artifact: ReviewedPolicyArtifact = {
      policy: { ...f.policy, revision, artifact_digest: accessDigest(["TEST_ONLY-missing-install", revision]) },
      root_grants: [], provenance_ref: "TEST_ONLY-incomplete-historical-import",
    };
    // Isolated fixture corruption only: do not delete or alter immutable events.
    await new AccessRepository(ctx.pool).putPolicy(artifact.policy);
    expect(await new AccessRepository(ctx.pool).policyInstall(f.workspace, revision)).toBeNull();
    const before = await authorityRows(f);
    Object.assign(f.trust.artifact, artifact);
    await expect(f.service.installReviewedPolicy(f.trust.artifact))
      .rejects.toMatchObject({ code: "POLICY_REVISION_CONFLICT", status: 409 });
    expect(await authorityRows(f)).toEqual(before);
  });

  it("ELP2-10 reviewed artifact drains an entered source attempt, installs once after signed recovery and replays without a session", async () => {
    const f = await fixture(), artifact = emptyRootArtifact(f, "TEST_ONLY-coordinated-policy");
    await withCurrentHuman(f, manager, async cell => {
      const lease = await cell.enter(), before = await authorityRows(f);
      let terminal = false, calls = 0;
      const recover: CurrentHumanRecoveryPort["recover"] = async attempt => {
        calls++;
        expect(attempt.lease_id).toBe(lease.lease_id);
        return terminal ? cell.resolve(attempt.lease_id) : { phase: "COMMITTED", TEST_ONLY_untrusted_ack: true };
      };
      Object.assign(f.trust.artifact, structuredClone(artifact));
      await expect(cell.service(recover).installReviewedPolicy(f.trust.artifact))
        .rejects.toMatchObject({ code: "ACCESS_RETRY_REQUIRED", status: 503 });
      expect(calls).toBe(1);
      expect(await authorityRows(f)).toEqual(before);
      const pending = (await cell.pool.query(`SELECT mutation_id,family,actor_id,session_id,session_revision,state
        FROM elp210_candidate.mutations`)).rows;
      expect(pending).toEqual([{ mutation_id: expect.any(String), family: "REVIEWED_POLICY",
        actor_id: null, session_id: null, session_revision: null, state: "PENDING" }]);
      expect((await cell.pool.query("SELECT drain_id FROM elp210_candidate.authority WHERE singleton")).rows[0].drain_id)
        .toBe(pending[0].mutation_id);
      expect((await cell.pool.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1", [lease.lease_id])).rows[0].phase)
        .toBe("ENTERED");

      // Recreated private services reuse durable intent; the helper's max1
      // pool proves actual signed source recovery runs outside every Core TX.
      terminal = true;
      await cell.service(recover).installReviewedPolicy(f.trust.artifact);
      expect(calls).toBe(2);
      expect((await new AccessRepository(cell.pool).policy(f.workspace))?.revision).toBe(artifact.policy.revision);
      expect((await cell.pool.query("SELECT state FROM elp210_candidate.mutations")).rows).toEqual([{ state: "FINISHED" }]);
      expect((await cell.pool.query("SELECT drain_id FROM elp210_candidate.authority WHERE singleton")).rows[0].drain_id).toBeNull();
      expect((await cell.pool.query(`SELECT count(*)::int AS n FROM portal_access_policy_events
        WHERE workspace_id=$1 AND policy_revision=$2 AND operation='POLICY_INSTALL'`, [f.workspace, artifact.policy.revision])).rows[0].n).toBe(1);
      const after = await authorityRows(f);
      await cell.service(recover).installReviewedPolicy(f.trust.artifact);
      expect(calls).toBe(2);
      expect(await authorityRows(f)).toEqual(after);
      expect((await cell.pool.query("SELECT state FROM elp210_candidate.mutation_events ORDER BY event_id")).rows)
        .toEqual([{ state: "PENDING" }, { state: "FINISHED" }]);
    });
  });

  it("ELP2-10 a reviewed artifact stays pending after signed UNKNOWN outlives the actual lease expiry", async () => {
    const f = await fixture(), artifact = emptyRootArtifact(f, "TEST_ONLY-unknown-policy");
    await withCurrentHuman(f, manager, async cell => {
      const lease = await cell.enter();
      await cell.resolve(lease.lease_id, "UNKNOWN");
      await cell.pool.query(`SELECT pg_sleep(GREATEST(
        (expires_at_ms::double precision-extract(epoch FROM clock_timestamp())*1000)/1000,0)+0.05)
        FROM elp210_candidate.leases WHERE lease_id=$1`, [lease.lease_id]);
      expect((await cell.pool.query(`SELECT expires_at_ms<=floor(extract(epoch FROM clock_timestamp())*1000) AS expired
        FROM elp210_candidate.leases WHERE lease_id=$1`, [lease.lease_id])).rows[0].expired).toBe(true);
      const before = await authorityRows(f);
      Object.assign(f.trust.artifact, artifact);
      const recover = async () => ({ phase: "COMMITTED", TEST_ONLY_untrusted_ack: true });
      for (let attempt = 0; attempt < 2; attempt++) {
        await expect(cell.service(recover).installReviewedPolicy(f.trust.artifact))
          .rejects.toMatchObject({ code: "ACCESS_RETRY_REQUIRED", status: 503 });
        expect(await authorityRows(f)).toEqual(before);
        expect((await cell.pool.query("SELECT state FROM elp210_candidate.mutations")).rows).toEqual([{ state: "PENDING" }]);
        expect((await cell.pool.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1", [lease.lease_id])).rows[0].phase)
          .toBe("UNKNOWN");
        expect((await cell.pool.query("SELECT drain_id FROM elp210_candidate.authority WHERE singleton")).rows[0].drain_id).not.toBeNull();
      }
    }, 2000);
  });

  it("ELP2-10 changing a pending reviewed artifact conflicts without replacing its original intent", async () => {
    const f = await fixture(), artifact = emptyRootArtifact(f, "TEST_ONLY-pending-artifact-conflict");
    await withCurrentHuman(f, manager, async cell => {
      await cell.enter();
      let calls = 0;
      const recover = async () => { calls++; return undefined; };
      Object.assign(f.trust.artifact, artifact);
      await expect(cell.service(recover).installReviewedPolicy(f.trust.artifact))
        .rejects.toMatchObject({ code: "ACCESS_RETRY_REQUIRED", status: 503 });
      const before = await authorityRows(f);
      const intents = (await cell.pool.query("SELECT row_to_json(m)::text AS bytes FROM elp210_candidate.mutations m")).rows;
      f.trust.artifact.provenance_ref = "TEST_ONLY-changed-pending-provenance";
      await expect(cell.service(recover).installReviewedPolicy(f.trust.artifact))
        .rejects.toMatchObject({ code: "POLICY_REVISION_CONFLICT", status: 409 });
      expect(calls).toBe(1);
      expect(await authorityRows(f)).toEqual(before);
      expect((await cell.pool.query("SELECT row_to_json(m)::text AS bytes FROM elp210_candidate.mutations m")).rows).toEqual(intents);
      expect((await cell.pool.query("SELECT state FROM elp210_candidate.mutation_events ORDER BY event_id")).rows)
        .toEqual([{ state: "PENDING" }]);
    });
  });

  it("ELP2-10 FINISHED historical artifact replay leaves a new entered source lease and the newer policy untouched", async () => {
    const f = await fixture(), historical = emptyRootArtifact(f, "TEST_ONLY-finished-history-B"),
      current = emptyRootArtifact(f, "TEST_ONLY-finished-current-C");
    await withCurrentHuman(f, manager, async cell => {
      const recover = vi.fn(async () => undefined);
      for (const artifact of [historical, current]) {
        Object.assign(f.trust.artifact, structuredClone(artifact));
        await cell.service(recover).installReviewedPolicy(f.trust.artifact);
      }
      const lease = await cell.enter(), before = await authorityRows(f);
      const authority = (await cell.pool.query("SELECT row_to_json(a)::text AS bytes FROM elp210_candidate.authority a")).rows;
      const intents = (await cell.pool.query("SELECT row_to_json(m)::text AS bytes FROM elp210_candidate.mutations m ORDER BY mutation_id")).rows;
      Object.assign(f.trust.artifact, structuredClone(historical));
      await cell.service(recover).installReviewedPolicy(f.trust.artifact);
      expect(recover).not.toHaveBeenCalled();
      expect(await authorityRows(f)).toEqual(before);
      expect((await new AccessRepository(cell.pool).policy(f.workspace))?.revision).toBe(current.policy.revision);
      expect((await cell.pool.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1", [lease.lease_id])).rows[0].phase)
        .toBe("ENTERED");
      expect((await cell.pool.query("SELECT row_to_json(a)::text AS bytes FROM elp210_candidate.authority a")).rows).toEqual(authority);
      expect((await cell.pool.query("SELECT row_to_json(m)::text AS bytes FROM elp210_candidate.mutations m ORDER BY mutation_id")).rows).toEqual(intents);
    });
  });

  it("ELP2-10 a pre-coordinator install receipt is a readonly ACK even behind an unrelated UNKNOWN", async () => {
    const f = await fixture();
    await withCurrentHuman(f, manager, async cell => {
      const lease = await cell.enter(); await cell.resolve(lease.lease_id, "UNKNOWN");
      const before = await authorityRows(f), recover = vi.fn(async () => undefined);
      const authority = (await cell.pool.query("SELECT * FROM elp210_candidate.authority WHERE singleton")).rows;
      await cell.service(recover).installReviewedPolicy(f.trust.artifact);
      expect(await authorityRows(f)).toEqual(before); expect(recover).not.toHaveBeenCalled();
      expect((await cell.pool.query("SELECT * FROM elp210_candidate.authority WHERE singleton")).rows).toEqual(authority);
      expect((await cell.pool.query("SELECT * FROM elp210_candidate.mutations")).rows).toEqual([]);
      expect((await cell.pool.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1", [lease.lease_id])).rows[0].phase).toBe("UNKNOWN");
    });
  });

  it("ELP2-10 an unqualified or wrong-owner artifact cannot open an authority drain", async () => {
    const f = await fixture(), artifact = emptyRootArtifact(f, "TEST_ONLY-refused-policy");
    await withCurrentHuman(f, manager, async cell => {
      const lease = await cell.enter(), before = await authorityRows(f), recover = vi.fn(async () => undefined);
      Object.assign(f.trust.artifact, artifact);
      const verify = vi.spyOn(f.trust, "verifyPolicy").mockResolvedValue(null);
      try {
        await expect(cell.service(recover).installReviewedPolicy(f.trust.artifact))
          .rejects.toMatchObject({ code: "RECEIPT_NOT_QUALIFIED", status: 503 });
      } finally { verify.mockRestore(); }
      f.trust.artifact.policy.protected_owner_user_id = peer.user.userId;
      await expect(cell.service(recover).installReviewedPolicy(f.trust.artifact))
        .rejects.toMatchObject({ code: "RECEIPT_BINDING_MISMATCH" });
      expect(recover).not.toHaveBeenCalled();
      expect(await authorityRows(f)).toEqual(before);
      expect((await cell.pool.query("SELECT count(*)::int AS n FROM elp210_candidate.mutations")).rows[0].n).toBe(0);
      expect((await cell.pool.query("SELECT drain_id FROM elp210_candidate.authority WHERE singleton")).rows[0].drain_id).toBeNull();
      expect((await cell.pool.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1", [lease.lease_id])).rows[0].phase)
        .toBe("ENTERED");
    });
  });

  it("ELP2-10 verified-purpose metadata cannot fabricate a human session or omit one for a human family", async () => {
    const f = await fixture();
    await withCurrentHuman(f, manager, async cell => {
      for (const [family, sessionRevision] of [["REVIEWED_POLICY", 0], ["QUALIFIED_DELEGATED_RECEIPT", 0], ["ACCOUNT_LIFECYCLE", null]] as const) {
        const key = accessDigest(["TEST_ONLY-invalid-purpose-binding", family, next("invalid-metadata")]);
        await expect(cell.pool.query(`INSERT INTO elp210_candidate.mutations
          (mutation_id,key_digest,binding_digest,replay_digest,family,actor_id,session_id,session_revision)
          VALUES($1,$2,$3,$3,$4,$5,$6,$7)`, [next("invalid-mutation"), key, accessDigest(["TEST_ONLY-invalid", family]),
          family, manager.user.userId, manager.session.sessionId, sessionRevision])).rejects.toMatchObject({ code: "23514" });
      }
      const coordinator = new CurrentHumanMutations(cell.pool, cell.candidate, { recover: async () => undefined },
        { maximum_intents: 12, maximum_recoveries_per_request: 4 });
      const fabricated = { family: "REVIEWED_POLICY" as const, operation: "INSTALL_POLICY" as const,
        key_digest: accessDigest(["TEST_ONLY-fabricated-key"]), request_digest: accessDigest(["TEST_ONLY-fabricated-request"]),
        target_id: f.workspace, actor_id: manager.user.userId, session_id: manager.session.sessionId, session_revision: 0 };
      const authorize = vi.fn(async () => undefined), apply = vi.fn(async () => undefined);
      await expect(coordinator.executeVerified(fabricated, { authorize, apply,
        terminal: () => ({ outcome: "APPLIED", receipt_ref: null, reason_code: null }) })).rejects.toMatchObject({ name: "ZodError" });
      await expect(coordinator.executeVerified({ ...fabricated, family: "QUALIFIED_DELEGATED_RECEIPT", operation: "ACCEPT_RECEIPT" },
        { authorize, apply, terminal: () => ({ outcome: "APPLIED", receipt_ref: null, reason_code: null }) }))
        .rejects.toMatchObject({ name: "ZodError" });
      expect(authorize).not.toHaveBeenCalled();
      expect(apply).not.toHaveBeenCalled();
      expect((await cell.pool.query("SELECT count(*)::int AS n FROM elp210_candidate.mutations")).rows[0].n).toBe(0);
      expect((await cell.pool.query("SELECT count(*)::int AS n FROM elp210_candidate.mutation_events")).rows[0].n).toBe(0);
      expect((await cell.pool.query("SELECT drain_id FROM elp210_candidate.authority WHERE singleton")).rows[0].drain_id).toBeNull();
    });
  });

  it("T03-05 a verified TEST_ONLY artifact cannot install capital.fund as app-only authority", async () => {
    const f = await fixture(), before = await state(f), originalPolicy = structuredClone(f.policy);
    const policyRevision = next("forbidden-app-only-policy");
    f.trust.artifact.policy = { ...f.policy, revision: policyRevision,
      artifact_digest: accessDigest(["TEST_ONLY-forbidden-capital-root", policyRevision]) };
    f.trust.artifact.root_grants = [{ ...f.managerRoot, grant_id: next("forbidden-capital-root"),
      revision: next("forbidden-capital-root-revision"), policy_revision: policyRevision,
      action: "capital.fund", delegable_actions: [], requires_ts_acceptance: false }];
    await expect(f.service.installReviewedPolicy(f.trust.artifact)).rejects.toMatchObject({ code: "RECEIPT_BINDING_MISMATCH" });
    expect(await state(f)).toEqual(before);
    expect((await ctx.pool.query("SELECT policy FROM portal_access_policy_state WHERE workspace_id=$1", [f.workspace])).rows[0].policy).toEqual(originalPolicy);
    expect((await ctx.pool.query("SELECT count(*)::int AS n FROM portal_access_grants_v2 WHERE workspace_id=$1 AND grant_fact->>'action'='capital.fund'", [f.workspace])).rows[0].n).toBe(0);
  });

  it("T03-05/08 installer cannot copy a portfolio acceptance receipt into a capital.fund root", async () => {
    const f = await fixture(), { submitted } = await business(f), fact = await tsFact(f, submitted);
    await f.service.acceptTsReceipt(f.trust.seal(fact));
    const acceptedGrant = await storedGrant(submitted.receipt.grant_id!), before = await state(f);
    expect(acceptedGrant.ts_receipt).not.toBeNull();
    const revision = next("TEST_ONLY-copied-receipt-policy");
    f.trust.artifact.policy = { ...f.policy, revision, artifact_digest: accessDigest(["TEST_ONLY-copied-receipt", revision]) };
    f.trust.artifact.root_grants = [{ ...acceptedGrant, grant_id: next("TEST_ONLY-copied-capital-root"),
      revision: next("TEST_ONLY-copied-capital-revision"), policy_revision: revision,
      issued_by: owner.user.userId, parent_grant_id: null, action: "capital.fund", requires_ts_acceptance: true }];
    await expect(f.service.installReviewedPolicy(f.trust.artifact)).rejects.toMatchObject({ code: "RECEIPT_BINDING_MISMATCH" });
    expect(await state(f)).toEqual(before);
    expect(await storedGrant(acceptedGrant.grant_id)).toEqual(acceptedGrant);
    expect(await ownGrant(f, submitted.receipt)).toMatchObject({ current: true, action: "portfolio.read", ts_authority: "ACCEPTED" });
    expect((await ctx.pool.query("SELECT revision FROM portal_access_policy_state WHERE workspace_id=$1", [f.workspace])).rows[0].revision).toBe(f.policy.revision);
  });

  it("T03-02 preview is advisory; app proposal atomically stores a scoped grant and immutable receipt", async () => {
    const f = await fixture(), request = f.change(), before = await state(f);
    const preview = await f.service.preview(actor(manager), f.workspace, request);
    expect(preview).toMatchObject({ allowed: true, app_outcome: "ELIGIBLE", effective_business_right: false, ts_authority: "NOT_REQUIRED" });
    expect(await state(f)).toEqual(before);
    const result = await f.service.propose(actor(manager), f.workspace, request, preview.preview_digest, next("apply"));
    expect(result).toMatchObject({ replayed: false, receipt: { outcome: "APP_APPLIED", http_status: 201, ts_authority: "NOT_REQUIRED" } });
    expect(await ownGrant(f, result.receipt)).toMatchObject({ current: true, action: "users.read" });
    expect(await state(f)).toEqual({ proposals: 1, grants: before.grants + 1, events: before.events + 1 });
    const event = (await ctx.pool.query("SELECT before_fact,after_fact,receipt FROM portal_access_policy_events WHERE event_id=$1",
      [result.receipt.operation_id])).rows[0];
    expect(event.before_fact).toBeNull();
    expect(event.after_fact).toEqual(await storedGrant(result.receipt.grant_id!));
    expect(event.receipt).toEqual(result.receipt);
  });

  it("ELP2-10 new-target relations resolve before ANY Core connection or mutation lock is held",async()=>{
    const f=await fixture(),seen=new Set<string>();
    const pool=new Pool({connectionString:DATABASE_URL!,max:1,connectionTimeoutMillis:500});
    const original=f.trust.relations.bind(f.trust);
    const spy=vi.spyOn(f.trust,"relations").mockImplementation(async(id,workspace)=>{
      expect(pool.totalCount-pool.idleCount).toBe(0);
      // A single-connection pool cannot service this source callback if the
      // access transaction is still holding its Core connection. NOWAIT also
      // proves the actor row is not locked through another Core connection.
      await pool.query("SELECT user_id FROM portal_users WHERE user_id=$1 FOR UPDATE NOWAIT",[manager.user.userId]);
      seen.add(id);return original(id,workspace);
    });
    try {
      const service=new ExecutionAccessService(pool,auth,f.trust,true),request=f.change();
      const preview=await service.preview(actor(manager),f.workspace,request);
      expect(preview.allowed).toBe(true);
      expect(seen.has(request.subject_user_id)).toBe(true); // Not yet in the grant graph.
      expect((await service.propose(actor(manager),f.workspace,request,preview.preview_digest,next("no-lock-io")))
        .receipt.outcome).toBe("APP_APPLIED");
    } finally {spy.mockRestore();await pool.end();}
  });

  it("ELP2-10 a Core ceiling changed during a relation await fails the final DB-only fence",async()=>{
    const f=await fixture(),request=f.change(),preview=await f.service.preview(actor(manager),f.workspace,request);
    const before=await state(f),original=f.trust.relations.bind(f.trust);let changed=false;
    const spy=vi.spyOn(f.trust,"relations").mockImplementation(async(id,workspace)=>{
      if(!changed){
        changed=true;
        await new AccessRepository(ctx.pool).saveGrant({...f.managerRoot,
          revision:next("TEST_ONLY-concurrent-ceiling"),revoked_at_ms:Date.now()});
      }
      return original(id,workspace);
    });
    try {
      await expect(f.service.propose(actor(manager),f.workspace,request,preview.preview_digest,next("source-await-race")))
        .rejects.toMatchObject({code:"ACCESS_RETRY_REQUIRED",status:409});
      expect(changed).toBe(true);expect(await state(f)).toEqual(before);
    } finally {spy.mockRestore();}
  });

  it("T03-06 replay returns the original app receipt even after the grant was revoked", async () => {
    const f = await fixture(), request = f.change(), key = next("immutable-replay"), applied = await f.submit(request, key);
    const original = structuredClone(applied.receipt);
    const revokeKey = next("revoke");
    const revoked = await f.service.revoke(actor(owner), f.workspace, applied.receipt.grant_id!, f.policy.revision,
      applied.receipt.grant_revision!, revokeKey);
    expect(revoked.receipt).toMatchObject({ outcome: "REVOKED", ts_authority: "NOT_REQUIRED" });
    expect(await f.service.revoke(actor(owner), f.workspace, original.grant_id!, f.policy.revision,
      original.grant_revision!, revokeKey)).toEqual({ receipt: revoked.receipt, replayed: true });
    await expect(f.service.revoke(actor(owner), f.workspace, original.grant_id!, f.policy.revision,
      revoked.receipt.grant_revision!, revokeKey)).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_PAYLOAD_CONFLICT", status: 409 });
    const replay = await f.submit(request, key);
    expect(replay).toEqual({ receipt: original, replayed: true });
    expect(await ownGrant(f, original)).toMatchObject({ current: false, revision: revoked.receipt.grant_revision });
    expect((await f.service.proposal(actor(manager), f.workspace, original.proposal_id!)).submission_receipt).toEqual(original);
    const event = (await ctx.pool.query("SELECT before_fact,after_fact FROM portal_access_policy_events WHERE event_id=$1", [revoked.receipt.operation_id])).rows[0];
    expect(event.before_fact).toMatchObject({ revoked_at_ms: null, revision: original.grant_revision });
    expect(event.after_fact).toMatchObject({ grant: { revision: revoked.receipt.grant_revision, revoked_at_ms: expect.any(Number) }, reason: "Access revoked." });
    await expect(f.service.revoke(actor(owner), f.workspace, original.grant_id!, f.policy.revision,
      original.grant_revision!, next("stale-revoke"))).rejects.toMatchObject({ code: "GRANT_REVISION_CONFLICT" });
  });

  it("T03-06 the same key cannot bind changed payload or another currently authorized actor", async () => {
    const f = await fixture(), request = f.change(), key = next("bound-key"), original = await f.submit(request, key);
    await expect(f.submit({ ...request, reason: "TEST_ONLY changed reason" }, key))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_PAYLOAD_CONFLICT", status: 409 });
    const byOwner = { ...request, ceiling_grant_id: f.ownerRoot.grant_id, expected_ceiling_revision: f.ownerRoot.revision };
    await expect(f.submit(byOwner, key, owner)).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_PAYLOAD_CONFLICT", status: 409 });
    expect((await f.submit(request, key)).receipt).toEqual(original.receipt);
    expect((await state(f)).proposals).toBe(1);
  });

  it.each([
    ["policy", "POLICY_REVISION_CONFLICT"], ["ceiling", "GRANT_REVISION_CONFLICT"],
    ["membership", "TS_MEMBERSHIP_REVISION_CONFLICT"], ["digest", "POLICY_REVISION_CONFLICT"],
  ] as const)("T03-06 stale %s or preview digest never creates a proposal", async (kind, code) => {
    const f = await fixture(), request = kind === "membership" ? f.change({ action: "portfolio.read",
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "PORTFOLIO", ids: ["TEST_ONLY-portfolio-1"] } }) : f.change();
    const preview = await f.service.preview(actor(manager), f.workspace, request);
    const stale: GrantChange = { ...request,
      ...(kind === "policy" ? { expected_policy_revision: "TEST_ONLY-stale-policy" } : {}),
      ...(kind === "ceiling" ? { expected_ceiling_revision: "TEST_ONLY-stale-ceiling" } : {}),
      ...(kind === "membership" ? { expected_ts_membership_revision: "TEST_ONLY-stale-membership" } : {}),
    };
    const before = await state(f);
    const key = next("stale"), digest = kind === "digest" ? accessDigest("TEST_ONLY-wrong-preview")
      : (await f.service.preview(actor(manager), f.workspace, stale)).preview_digest;
    const attempt = () => f.service.propose(actor(manager), f.workspace, stale, digest, key);
    await expect(attempt()).rejects.toMatchObject({ code, status: 409 });
    const originalDenial = (await ctx.pool.query(`SELECT * FROM portal_access_policy_events
      WHERE workspace_id=$1 AND operation='DENIED'`, [f.workspace])).rows;
    expect(originalDenial).toHaveLength(1);
    expect(originalDenial[0]).toMatchObject({ subject_user_id: null, before_fact: null, after_fact: null,
      receipt: { outcome: "DENIED", http_status: 409, reason_code: code } });
    await expect(attempt()).rejects.toMatchObject({ code, status: 409 });
    expect((await ctx.pool.query(`SELECT * FROM portal_access_policy_events
      WHERE workspace_id=$1 AND operation='DENIED'`, [f.workspace])).rows).toEqual(originalDenial);
    expect(await state(f)).toEqual({ ...before, events: before.events + 1 });
    expect(preview.allowed).toBe(true);
  });

  it("T03-06 concurrent same-key submissions have one durable effect and exact replay after retry", async () => {
    const f = await fixture(), request = f.change(), key = next("race-key"), preview = await f.service.preview(actor(manager), f.workspace, request);
    const attempt = () => f.service.propose(actor(manager), f.workspace, request, preview.preview_digest, key);
    const results = await Promise.allSettled([attempt(), attempt()]);
    expect(results.some(r => r.status === "fulfilled")).toBe(true);
    for (const result of results) if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "ACCESS_RETRY_REQUIRED", status: 409 });
    const original = results.find(r => r.status === "fulfilled") as PromiseFulfilledResult<Submitted>;
    expect(await attempt()).toEqual({ receipt: original.value.receipt, replayed: true });
    expect((await state(f)).proposals).toBe(1);
    expect((await ctx.pool.query("SELECT count(*)::int AS n FROM portal_access_policy_events WHERE workspace_id=$1 AND operation='PROPOSE'", [f.workspace])).rows[0].n).toBe(1);
  });

  it("T03-06 concurrent changed-payload/key race cannot overwrite the winning immutable receipt", async () => {
    const f = await fixture(), first = f.change(), second = { ...first, reason: "TEST_ONLY other contender" }, key = next("payload-race");
    const firstPreview = await f.service.preview(actor(manager), f.workspace, first);
    const secondPreview = await f.service.preview(actor(manager), f.workspace, second);
    const submit = async (change: GrantChange) => f.service.propose(actor(manager), f.workspace, change,
      change === first ? firstPreview.preview_digest : secondPreview.preview_digest, key);
    const results = await Promise.allSettled([submit(first), submit(second)]);
    const winners = results.flatMap((r, i) => r.status === "fulfilled" ? [{ index: i, value: r.value }] : []);
    expect(winners).toHaveLength(1);
    const winner = winners[0];
    const loserChange = winner.index === 0 ? second : first;
    await expect(submit(loserChange)).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_PAYLOAD_CONFLICT", status: 409 });
    expect((await submit(winner.index === 0 ? first : second)).receipt).toEqual(winner.value.receipt);
    expect((await state(f)).proposals).toBe(1);
  });

  it.each(["self", "owner"] as const)("T03-03 %s privilege changes remain protected at preview and submit", async target => {
    const f = await fixture(), request = f.change({ subject_user_id: target === "self" ? manager.user.userId : owner.user.userId });
    const code = target === "self" ? "SELF_PRIVILEGE_CHANGE_DENIED" : "PROTECTED_OWNER_CHANGE_DENIED";
    const preview = await f.service.preview(actor(manager), f.workspace, request);
    expect(preview).toMatchObject({ allowed: false, reason_code: code });
    await expect(f.service.propose(actor(manager), f.workspace, request, preview.preview_digest, next("protected")))
      .rejects.toMatchObject({ code, status: 403 });
    expect((await state(f)).proposals).toBe(0);
  });

  it("T03-01/02 ADMIN and a suggestive display name do not provide a delegation ceiling", async () => {
    const f = await fixture(), request = f.change({ subject_user_id: researcher.user.userId });
    await expect(f.service.propose(actor(peer), f.workspace, request, accessDigest("TEST_ONLY"), next("admin-deny")))
      .rejects.toMatchObject({ code: "STEP_UP_REQUIRED" });
    await new AccountLifecycleRepository(ctx.pool).grantStepUp({ stepUpId: next("admin-stepup"),
      sessionId: peer.session.sessionId, userId: peer.user.userId, ttlSeconds: 600 });
    expect(await f.service.preview(actor(peer), f.workspace, request)).toMatchObject({ allowed: false, reason_code: "DELEGATION_CEILING_EXCEEDED" });
    await expect(f.service.propose(actor(peer), f.workspace, request, accessDigest("TEST_ONLY"), next("admin-deny")))
      .rejects.toMatchObject({ code: "DELEGATION_CEILING_EXCEEDED" });
  });

  it.each(["missing", "revoked", "expired", "generation", "disabled", "archived"] as const)(
    "T03-07 current actor/session %s invalidates both a queued submit and a prior receipt replay", async mode => {
      const account = await active(`actor-${mode}`), f = await fixture(account), request = f.change(), key = next("auth-replay");
      const applied = await f.submit(request, key), preview = await f.service.preview(actor(account), f.workspace, request);
      if (mode === "revoked") await auth.sessions.revokeSession(account.session.sessionId, "TEST_ONLY_REVOKE");
      if (mode === "expired") await ctx.pool.query("UPDATE auth_sessions SET idle_expires_at=clock_timestamp()-interval '1 second' WHERE session_id=$1", [account.session.sessionId]);
      if (mode === "generation") await auth.users.bumpSessionVersion(account.user.userId);
      if (mode === "disabled") await auth.users.update({ userId: account.user.userId, status: "DISABLED" });
      if (mode === "archived") await ctx.pool.query("UPDATE portal_users SET archived_at=clock_timestamp() WHERE user_id=$1", [account.user.userId]);
      const stale = mode === "missing" ? { ...actor(account), session_id: "TEST_ONLY-no-current-session" } : actor(account);
      for (const attemptKey of [key, next("queued")]) await expect(f.service.propose(stale, f.workspace, request, preview.preview_digest, attemptKey))
        .rejects.toMatchObject({ code: "CURRENT_ACTOR_AUTHORITY_REQUIRED", status: 403 });
      expect((await state(f)).proposals).toBe(1);
      expect((await storedGrant(applied.receipt.grant_id!)).revoked_at_ms).toBeNull();
    });

  it("T03-07 a session cannot borrow another session's step-up, including immutable replay", async () => {
    const account = await active("stepup-bound"), f = await fixture(account), request = f.change(), key = next("stepup-replay");
    await f.submit(request, key);
    const second = await auth.login({ assertion: account.assertion, username: account.user.username, credential: PASSWORD });
    const secondActor = { ...actor(account), session_id: second.sessionId };
    const preview = await f.service.preview(secondActor, f.workspace, request);
    expect(preview.allowed).toBe(true);
    await expect(f.service.propose(secondActor, f.workspace, request, preview.preview_digest, key)).rejects.toMatchObject({ code: "STEP_UP_REQUIRED" });
    await ctx.pool.query("UPDATE owner_step_up_grants SET revoked_at=clock_timestamp() WHERE session_id=$1", [account.session.sessionId]);
    await expect(f.submit(request, key)).rejects.toMatchObject({ code: "STEP_UP_REQUIRED" });
    expect((await state(f)).proposals).toBe(1);
  });

  it("T03-07 expired step-up cannot submit; delegated password proof creates no capability", async () => {
    const account = await active("expired-stepup"), f = await fixture(account), request = f.change();
    await ctx.pool.query("UPDATE owner_step_up_grants SET expires_at=clock_timestamp()-interval '1 second' WHERE session_id=$1", [account.session.sessionId]);
    const before = await state(f);
    await expect(f.submit(request)).rejects.toMatchObject({ code: "STEP_UP_REQUIRED" });
    await expect(f.service.stepUp(actor(account), f.workspace, "TEST_ONLY-wrong-password"))
      .rejects.toMatchObject({ code: "STEP_UP_REJECTED" });
    expect(await state(f)).toEqual(before);
    expect(await f.service.stepUp(actor(account), f.workspace, PASSWORD)).toMatchObject({ state: "ACTIVE", expires_at_ms: expect.any(Number) });
    expect((await f.submit(request)).receipt.outcome).toBe("APP_APPLIED");
    const unprivileged = await f.service.stepUp(actor(peer), f.workspace, PASSWORD).catch(error => error);
    expect(unprivileged).toMatchObject({ code: "ACCESS_DENIED" });
    expect((await f.service.effective(actor(peer), f.workspace)).grants).toEqual([]);
  });

  it("T03-07 mounted wrong-password step-up refusal is redacted and changes no proof or capability", async () => {
    const account = await active("wrong-password-stepup"), f = await fixture(account);
    const wrongPassword = next("TEST_ONLY-private-wrong-password"), rawKey = next("TEST_ONLY-private-stepup-key");
    const proofRows = (await ctx.pool.query("SELECT * FROM owner_step_up_grants WHERE user_id=$1 ORDER BY step_up_id", [account.user.userId])).rows;
    const legacyGrants = (await ctx.pool.query("SELECT * FROM portal_capability_grants WHERE grantee_user_id=$1 ORDER BY grant_id", [account.user.userId])).rows;
    const effective = await f.service.effective(actor(account), f.workspace), before = await state(f);
    await withHttp(f.service, async app => {
      const response = await app.getHttpAdapter().getInstance().inject({ method: "POST", url: `${BASE}/step-up`,
        headers: headers(account.session, rawKey), payload: { workspace_id: f.workspace, password: wrongPassword } });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("STEP_UP_REJECTED");
    });
    expect((await ctx.pool.query("SELECT * FROM owner_step_up_grants WHERE user_id=$1 ORDER BY step_up_id", [account.user.userId])).rows).toEqual(proofRows);
    expect((await ctx.pool.query("SELECT * FROM portal_capability_grants WHERE grantee_user_id=$1 ORDER BY grant_id", [account.user.userId])).rows).toEqual(legacyGrants);
    expect(await f.service.effective(actor(account), f.workspace)).toEqual(effective);
    expect(await state(f)).toEqual(before);
    const rows = (await ctx.pool.query(`SELECT * FROM auth_audit_events
      WHERE event_type='portal_scoped_access_refused' AND actor_user_id=$1`, [account.user.userId])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor_user_id: account.user.userId, target_user_id: null, access_subject: null,
      request_id: null, source_ip: null, user_agent_hash: null, result: "DENIED", reason_code: "STEP_UP_REJECTED" });
    expect(rows[0].metadata_json).toEqual({ schema_version: "portal.access-refusal.v1", http_status: 403 });
    const encoded = JSON.stringify(rows);
    for (const sensitive of [wrongPassword, PASSWORD, rawKey, account.session.token, account.session.csrfToken,
      account.session.sessionId, account.assertion]) expect(encoded).not.toContain(sensitive);
  });

  it("T03-04/07 a principal with only a current DENY access.grant cannot obtain step-up", async () => {
    const account = await active("deny-only-stepup"), f = await fixture(account);
    await ctx.pool.query("UPDATE owner_step_up_grants SET revoked_at=clock_timestamp() WHERE user_id=$1", [account.user.userId]);
    const revision = next("TEST_ONLY-deny-only-policy");
    f.trust.artifact.policy = { ...f.policy, revision,
      artifact_digest: accessDigest(["TEST_ONLY-deny-only-policy", revision]) };
    const denial: ScopedAccessGrant = { ...f.managerRoot, grant_id: next("TEST_ONLY-deny-root"),
      revision: next("TEST_ONLY-deny-root-revision"), policy_revision: revision, effect: "DENY", delegable_actions: [] };
    f.trust.artifact.root_grants = [denial];
    await f.service.installReviewedPolicy(f.trust.artifact);
    const effective = await f.service.effective(actor(account), f.workspace);
    expect(effective.grants.filter(grant => grant.current)).toEqual([
      expect.objectContaining({ grant_id: denial.grant_id, action: "access.grant", effect: "DENY", current: true }),
    ]);
    const proofs = (await ctx.pool.query("SELECT * FROM owner_step_up_grants WHERE user_id=$1 ORDER BY step_up_id", [account.user.userId])).rows;
    const before = await state(f);
    await expect(f.service.stepUp(actor(account), f.workspace, PASSWORD))
      .rejects.toMatchObject({ code: "ACCESS_DENIED", status: 403 });
    expect((await ctx.pool.query("SELECT * FROM owner_step_up_grants WHERE user_id=$1 ORDER BY step_up_id", [account.user.userId])).rows).toEqual(proofs);
    expect((await ctx.pool.query(`SELECT count(*)::int AS n FROM owner_step_up_grants
      WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp()`, [account.user.userId])).rows[0].n).toBe(0);
    expect(await f.service.effective(actor(account), f.workspace)).toEqual(effective);
    expect(await state(f)).toEqual(before);
  });

  it("T03-07 refused step-up/current authority appends only redacted auth-audit facts", async () => {
    const account = await active("redacted-auth-refusal"), f = await fixture(account);
    const rawKey = next("TEST_ONLY-raw-idempotency-key"), passwordMarker = `TEST_ONLY-private-password:${PASSWORD}`;
    const request = f.change({ reason: passwordMarker });
    const preview = await f.service.preview(actor(account), f.workspace, request);
    await ctx.pool.query("UPDATE owner_step_up_grants SET revoked_at=clock_timestamp() WHERE session_id=$1", [account.session.sessionId]);
    const before = await state(f);
    await expect(f.service.propose(actor(account), f.workspace, request, preview.preview_digest, rawKey))
      .rejects.toMatchObject({ code: "STEP_UP_REQUIRED", status: 403 });
    await auth.sessions.revokeSession(account.session.sessionId, "TEST_ONLY_REDACTED_AUTHORITY_FAILURE");
    await expect(f.service.propose(actor(account), f.workspace, request, preview.preview_digest, rawKey))
      .rejects.toMatchObject({ code: "CURRENT_ACTOR_AUTHORITY_REQUIRED", status: 403 });
    const rows = (await ctx.pool.query(`SELECT actor_user_id,target_user_id,access_subject,request_id,
      source_ip,user_agent_hash,result,reason_code,metadata_json FROM auth_audit_events
      WHERE event_type='portal_scoped_access_refused' AND actor_user_id=$1`, [account.user.userId])).rows;
    expect(rows).toHaveLength(2);
    expect(rows.map(row => row.reason_code).sort()).toEqual(["CURRENT_ACTOR_AUTHORITY_REQUIRED", "STEP_UP_REQUIRED"]);
    for (const row of rows) expect(row).toMatchObject({ actor_user_id: account.user.userId,
      target_user_id: null, access_subject: null, request_id: null, source_ip: null, user_agent_hash: null,
      result: "DENIED", metadata_json: { schema_version: "portal.access-refusal.v1", http_status: 403 } });
    const encoded = JSON.stringify(rows);
    for (const sensitive of [rawKey, passwordMarker, PASSWORD, account.session.token, account.session.csrfToken,
      account.session.sessionId, researcher.user.userId, request.reason]) expect(encoded).not.toContain(sensitive);
    expect(await state(f)).toEqual(before);
  });

  it("T03-07 revoking the current ceiling after preview blocks both submit and historical replay", async () => {
    const f = await fixture(), request = f.change(), key = next("ceiling-replay");
    const original = await f.submit(request, key);
    const preview = await f.service.preview(actor(manager), f.workspace, request);
    await f.service.revoke(actor(owner), f.workspace, f.managerRoot.grant_id, f.policy.revision,
      f.managerRoot.revision, next("ceiling-revoke"));
    for (const attemptKey of [key, next("new-key-after-ceiling-revoke")])
      await expect(f.service.propose(actor(manager), f.workspace, request, preview.preview_digest, attemptKey))
        .rejects.toMatchObject({ code: "DELEGATION_CEILING_EXCEEDED", status: 403 });
    expect(await ownGrant(f, original.receipt)).toMatchObject({ current: false });
    expect((await state(f)).proposals).toBe(1);
  });

  it.each(["nonmember", "disabled", "archived"] as const)(
    "T03-02 current target %s cannot receive a grant after preview", async mode => {
      const target = await active(`target-${mode}`), f = await fixture();
      if (mode !== "nonmember") await ctx.pool.query(
        "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'MEMBER')", [f.workspace, target.user.userId]);
      const request = f.change({ subject_user_id: target.user.userId });
      const preview = await f.service.preview(actor(manager), f.workspace, request);
      expect(preview.allowed).toBe(mode !== "nonmember");
      if (mode === "nonmember") expect(preview.reason_code).toBe("ACCESS_RESOURCE_NOT_FOUND");
      if (mode === "disabled") await auth.users.update({ userId: target.user.userId, status: "DISABLED" });
      if (mode === "archived") await ctx.pool.query("UPDATE portal_users SET archived_at=clock_timestamp() WHERE user_id=$1", [target.user.userId]);
      const before = await state(f);
      await expect(f.service.propose(actor(manager), f.workspace, request, preview.preview_digest, next("target-deny")))
        .rejects.toMatchObject({ code: "ACCESS_RESOURCE_NOT_FOUND", status: 404 });
      expect(await state(f)).toEqual({ ...before, events: before.events + 1 });
    });

  it("T03-07 current lifecycle row lock prevents a stale submit crossing a disable transaction", async () => {
    const account = await active("row-lock-disable"), f = await fixture(account), request = f.change();
    const preview = await f.service.preview(actor(account), f.workspace, request);
    const blocker = await ctx.pool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query("UPDATE portal_users SET status='DISABLED' WHERE user_id=$1", [account.user.userId]);
      const pending = f.service.propose(actor(account), f.workspace, request, preview.preview_digest, next("locked-submit"));
      // Attach the assertion before releasing the real row lock to avoid an unhandled rejection.
      const assertion = expect(pending).rejects.toMatchObject({ code: "CURRENT_ACTOR_AUTHORITY_REQUIRED" });
      await blocker.query("COMMIT");
      await assertion;
      expect((await state(f)).proposals).toBe(0);
    } finally { await blocker.query("ROLLBACK"); blocker.release(); }
  });

  it("T03-07 revoked parent invalidates descendants immediately without rewriting history", async () => {
    const f = await fixture();
    const onward = f.change({ action: "access.grant", delegable_actions: ["users.read"],
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "USER", ids: [peer.user.userId] } });
    const parent = await f.submit(onward);
    await new AccountLifecycleRepository(ctx.pool).grantStepUp({ stepUpId: next("researcher-stepup"),
      sessionId: researcher.session.sessionId, userId: researcher.user.userId, ttlSeconds: 600 });
    const childRequest = f.change({ subject_user_id: peer.user.userId, ceiling_grant_id: parent.receipt.grant_id!,
      expected_ceiling_revision: parent.receipt.grant_revision! });
    const child = await f.submit(childRequest, next("child"), researcher);
    expect((await f.service.effective(actor(peer), f.workspace)).grants.find(g => g.grant_id === child.receipt.grant_id)?.current).toBe(true);
    const immutableChild = await storedGrant(child.receipt.grant_id!);
    const queued = await f.service.preview(actor(researcher), f.workspace, childRequest);
    await f.service.revoke(actor(owner), f.workspace, parent.receipt.grant_id!, f.policy.revision, parent.receipt.grant_revision!, next("ancestor-revoke"));
    expect((await f.service.effective(actor(peer), f.workspace)).grants.find(g => g.grant_id === child.receipt.grant_id)?.current).toBe(false);
    expect(await storedGrant(child.receipt.grant_id!)).toEqual(immutableChild);
    await expect(f.service.propose(actor(researcher), f.workspace, childRequest, queued.preview_digest, next("queued-descendant")))
      .rejects.toMatchObject({ code: "DELEGATION_CEILING_EXCEEDED" });
    await expect(f.service.revoke(actor(manager), f.workspace, f.managerRoot.grant_id, f.policy.revision,
      f.managerRoot.revision, next("self-revoke"))).rejects.toMatchObject({ code: "SELF_PRIVILEGE_CHANGE_DENIED" });
    await expect(f.service.revoke(actor(manager), f.workspace, f.ownerRoot.grant_id, f.policy.revision,
      f.ownerRoot.revision, next("owner-revoke"))).rejects.toMatchObject({ code: "PROTECTED_OWNER_CHANGE_DENIED" });
  });

  it("T03-05 pending business proposal never activates a right; only a verified current membership does", async () => {
    const f = await fixture(), { submitted } = await business(f);
    expect(submitted.receipt).toMatchObject({ outcome: "TS_PENDING", ts_authority: "PENDING" });
    expect(await ownGrant(f, submitted.receipt)).toMatchObject({ current: false, ts_authority: "PENDING" });
    const fact = await tsFact(f, submitted);
    await expect(f.service.acceptTsReceipt(fact)).rejects.toMatchObject({ code: "RECEIPT_NOT_QUALIFIED" });
    const accepted = await f.service.acceptTsReceipt(f.trust.seal(fact));
    expect(accepted.receipt).toMatchObject({ outcome: "TS_APPLIED", ts_authority: "ACCEPTED" });
    expect(await ownGrant(f, accepted.receipt)).toMatchObject({ current: true, ts_authority: "ACCEPTED" });
    const proposal = await f.service.proposal(actor(manager), f.workspace, submitted.receipt.proposal_id!);
    expect(proposal).toMatchObject({ state: "TS_APPLIED", submission_receipt: submitted.receipt });
    f.trust.memberships.set(researcher.user.userId, null);
    expect(await ownGrant(f, accepted.receipt)).toMatchObject({ current: false });
  });

  it("ELP2-10 delegated receipt relations and mapping await with the Core connection released",async()=>{
    const f=await fixture(),{submitted}=await business(f),fact=await tsFact(f,submitted);
    const pool=new Pool({connectionString:DATABASE_URL!,max:1,connectionTimeoutMillis:500});
    const original=f.trust.relations.bind(f.trust);let mappingRead=false,relationReads=0;
    const proveReleased=async()=>{
      expect(pool.totalCount-pool.idleCount).toBe(0);
      await pool.query("SELECT user_id FROM portal_users WHERE user_id=$1 FOR UPDATE NOWAIT",[manager.user.userId]);
      await pool.query("SELECT workspace_id FROM portal_access_policy_state WHERE workspace_id=$1 FOR UPDATE NOWAIT",[f.workspace]);
    };
    const spy=vi.spyOn(f.trust,"relations").mockImplementation(async(id,workspace)=>{
      await proveReleased();relationReads++;return original(id,workspace);
    });
    f.trust.beforeHumanMapping=async()=>{await proveReleased();mappingRead=true;};
    try {
      const service=new ExecutionAccessService(pool,auth,f.trust,true);
      const result=await service.acceptTsReceipt(f.trust.seal(fact));
      expect(result.receipt).toMatchObject({outcome:"TS_APPLIED",ts_authority:"ACCEPTED"});
      expect(mappingRead).toBe(true);expect(relationReads).toBeGreaterThan(1);
      expect((await storedGrant(submitted.receipt.grant_id!)).ts_receipt?.receipt_id).toBe(fact.receipt_id);
    } finally {spy.mockRestore();await pool.end();}
  });

  it("original08 ordinary versioned intake persists the verified FULL fact digest, not a matching receipt ID",async()=>{
    const f=await fixture(),{submitted}=await business(f),fact=await tsFact(f,submitted);
    const pending=await storedGrant(submitted.receipt.grant_id!);
    const resource={kind:"PORTFOLIO" as const,id:"TEST_ONLY-portfolio-1"};
    const current:CurrentAccessRelations={schema_version:"pma.core-current-relations.v1",
      subject_user_id:pending.subject_user_id,workspace_id:f.workspace,ts_user_id:fact.ts_user_id,mapping_revision:fact.mapping_revision,
      resources:pending.environments.map(environment=>({environment,revision:"TEST_ONLY:current-cut",own_alpha_ids:[],
        member_portfolio_ids:[resource.id],roots:[]})),
      grants:[{grant_id:pending.grant_id,binding_digest:grantBindingDigest(pending),accepted:structuredClone(fact),
        targets:pending.environments.map(environment=>({environment,resource,revision:"TEST_ONLY:current-leg",
          native_reference_digest:accessDigest(["TEST_ONLY:original-native",environment,resource]),
          valid_from_ms:fact.effective_at_ms,valid_until_ms:fact.expires_at_ms!}))}]};
    f.trust.currentAuthorities.set(pending.subject_user_id,current);
    const proof=f.trust.seal(fact,false);
    await withCurrentHuman(f,manager,async cell=>{
      const held=delegatedTrust(f,cell.pool,fact);
      expect((await cell.service(async()=>undefined,held.trust).acceptTsReceipt(proof)).receipt.outcome).toBe("TS_APPLIED");
      expect(held.calls()).toBe(1);expect(held.releases()).toBe(1);expect(held.held()).toBe(0);
      const stored=await storedGrant(pending.grant_id);
      expect(stored.ts_acceptance_digest).toBe(accessDigest(fact));
      expect(await ownGrant(f,{...submitted.receipt,grant_id:stored.grant_id})).toMatchObject({current:true});
      current.grants[0].accepted={...fact,provenance_ref:"TEST_ONLY:different-original-provenance"};
      expect(await ownGrant(f,{...submitted.receipt,grant_id:stored.grant_id})).toMatchObject({current:false});
      expect(await storedGrant(pending.grant_id)).toEqual(stored);
    });
    // An authenticated immutable ACK remains a read even with the source now
    // changed and no coordinator installed; it cannot regrant or open a drain.
    const before=await authorityRows(f);
    expect(await f.service.acceptTsReceipt(proof)).toMatchObject({replayed:true,receipt:{outcome:"TS_APPLIED"}});
    expect(await authorityRows(f)).toEqual(before);
  });

  it.each(["subject","parent-only"] as const)(
    "original08 %s versioned observations require the real held coordinator before ANY receipt writes",async mode=>{
      const f=await fixture(),{submitted}=await business(f),fact=await tsFact(f,submitted);
      const principal=mode==="subject"?fact.portal_user_id:manager.user.userId;
      f.trust.currentAuthorities.set(principal,{schema_version:"pma.core-current-relations.v1",
        subject_user_id:principal,workspace_id:f.workspace,ts_user_id:`TEST_ONLY-ts:${principal}`,
        mapping_revision:fact.mapping_revision,resources:[{environment:"paper",revision:"TEST_ONLY:current-cut",
          own_alpha_ids:[],member_portfolio_ids:["TEST_ONLY-portfolio-1"],roots:[]}],grants:[]});
      const before=await authorityRows(f),grant=await storedGrant(submitted.receipt.grant_id!);
      await expect(f.service.acceptTsReceipt(f.trust.seal(fact,false)))
        .rejects.toMatchObject({code:"RECEIPT_NOT_QUALIFIED",status:503});
      expect(await authorityRows(f)).toEqual(before);
      expect(await storedGrant(submitted.receipt.grant_id!)).toEqual(grant);
    });

  it("ELP2-10 revoking a ceiling during delegated mapping refuses acceptance without a stale write",async()=>{
    const f=await fixture(),{submitted}=await business(f),fact=await tsFact(f,submitted);
    let revoked=false;
    f.trust.beforeHumanMapping=async()=>{
      revoked=true;
      await f.service.revoke(actor(owner),f.workspace,f.managerRoot.grant_id,f.policy.revision,
        f.managerRoot.revision,next("mapping-ceiling-revoke"));
    };
    await expect(f.service.acceptTsReceipt(f.trust.seal(fact)))
      .rejects.toMatchObject({code:"RECEIPT_REVISION_CONFLICT",status:409});
    expect(revoked).toBe(true);
    expect((await storedGrant(submitted.receipt.grant_id!)).ts_receipt).toBeNull();
    expect((await ctx.pool.query(`SELECT count(*)::int AS n FROM portal_access_policy_events
      WHERE workspace_id=$1 AND operation='TS_RECEIPT'`,[f.workspace])).rows[0].n).toBe(0);
    expect((await ctx.pool.query("SELECT state FROM portal_access_proposals WHERE proposal_id=$1",
      [submitted.receipt.proposal_id])).rows[0].state).toBe("TS_PENDING");
  });

  it.each(["ceiling_revoked", "issuer_disabled"] as const)(
    "T03-07/08 verified acceptance after %s cannot activate the pending grant", async mode => {
      const account = await active(`pending-${mode}`), f = await fixture(account);
      const { submitted } = await business(f), fact = await tsFact(f, submitted);
      if (mode === "ceiling_revoked") await f.service.revoke(actor(owner), f.workspace, f.managerRoot.grant_id,
        f.policy.revision, f.managerRoot.revision, next("pending-ceiling-revoke"));
      else await auth.users.update({ userId: account.user.userId, status: "DISABLED" });
      const before = await state(f), originalGrant = await storedGrant(submitted.receipt.grant_id!);
      // Even a TEST_ONLY verifier reporting the exact accepted current TS
      // revision cannot bypass revoked local delegation or issuer lifecycle.
      await expect(f.service.acceptTsReceipt(f.trust.seal(fact))).rejects.toMatchObject({
        code: mode === "ceiling_revoked" ? "DELEGATION_CEILING_EXCEEDED" : "CURRENT_ACTOR_AUTHORITY_REQUIRED",
      });
      expect(await state(f)).toEqual(before);
      expect(await storedGrant(submitted.receipt.grant_id!)).toEqual(originalGrant);
      expect(await ownGrant(f, submitted.receipt)).toMatchObject({ current: false, ts_authority: "PENDING" });
      expect((await f.service.proposal(actor(researcher), f.workspace, submitted.receipt.proposal_id!)).state).toBe("TS_PENDING");
      expect((await ctx.pool.query(`SELECT count(*)::int AS n FROM portal_access_policy_events
        WHERE workspace_id=$1 AND operation='TS_RECEIPT' AND receipt->>'outcome'='TS_APPLIED'`, [f.workspace])).rows[0].n).toBe(0);
    });

  it("T03-07/08 real-clock grant expiry during verified mapping rolls back acceptance and its event", async () => {
    const f = await fixture();
    const now = Number((await ctx.pool.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0].ms);
    const request = f.change({ action: "portfolio.read", selector: { kind: "EXPLICIT_RESOURCE_SET",
      resource_kind: "PORTFOLIO", ids: ["TEST_ONLY-portfolio-1"] }, valid_until_ms: now + 2_000 });
    const submitted = await f.submit(request), fact = await tsFact(f, submitted), before = await state(f);
    let mappingAwaited = false;
    f.trust.beforeHumanMapping = async () => {
      mappingAwaited = true;
      // Bounded to the remaining two-second TEST_ONLY grant interval plus
      // 50 ms, using PostgreSQL's real clock rather than a mocked service time.
      await ctx.pool.query(`SELECT pg_sleep(GREATEST(
        ($1::double precision-extract(epoch FROM clock_timestamp())*1000)/1000,0)+0.05)`, [request.valid_until_ms]);
    };
    await expect(f.service.acceptTsReceipt(f.trust.seal(fact)))
      .rejects.toMatchObject({ code: "RECEIPT_REVISION_CONFLICT", status: 409 });
    expect(mappingAwaited).toBe(true);
    expect(await state(f)).toEqual(before);
    expect((await storedGrant(submitted.receipt.grant_id!)).ts_receipt).toBeNull();
    expect(await ownGrant(f, submitted.receipt)).toMatchObject({ current: false, ts_authority: "PENDING" });
    expect((await f.service.proposal(actor(researcher), f.workspace, submitted.receipt.proposal_id!)).state).toBe("TS_PENDING");
    expect((await ctx.pool.query(`SELECT count(*)::int AS n FROM portal_access_policy_events
      WHERE workspace_id=$1 AND operation='TS_RECEIPT'`, [f.workspace])).rows[0].n).toBe(0);
  });

  it.each(["REJECTED", "UNKNOWN"] as const)("T03-05 %s preserves the original accepted grant and submission receipt", async outcome => {
    const f = await fixture(), first = await business(f), acceptedFact = await tsFact(f, first.submitted);
    await f.service.acceptTsReceipt(f.trust.seal(acceptedFact));
    const request = { ...first.request, expected_ts_membership_revision: acceptedFact.membership_revision,
      selector: { kind: "EXPLICIT_RESOURCE_SET" as const, resource_kind: "PORTFOLIO" as const, ids: ["TEST_ONLY-portfolio-2"] } };
    const replacement = await f.submit(request);
    expect(await ownGrant(f, first.submitted.receipt)).toMatchObject({ current: true });
    const fact = await tsFact(f, replacement, { outcome });
    const decision = await f.service.acceptTsReceipt(f.trust.seal(fact));
    expect(decision.receipt).toMatchObject({ outcome: outcome === "REJECTED" ? "TS_REJECTED" : "TS_UNKNOWN", ts_authority: outcome });
    expect(await ownGrant(f, replacement.receipt)).toMatchObject({ current: false, ts_authority: outcome });
    expect(await ownGrant(f, first.submitted.receipt)).toMatchObject({ current: true });
    expect((await f.service.proposal(actor(manager), f.workspace, replacement.receipt.proposal_id!)).submission_receipt).toEqual(replacement.receipt);
    if (outcome === "UNKNOWN") {
      const reconciled = await tsFact(f, replacement);
      expect((await f.service.acceptTsReceipt(f.trust.seal(reconciled))).receipt.outcome).toBe("TS_APPLIED");
      expect(await ownGrant(f, replacement.receipt)).toMatchObject({ current: true });
    }
  });

  it("T03-08 unchanged receipt replay is exact; changed duplicate and out-of-order receipts are refused", async () => {
    const f = await fixture(), { submitted } = await business(f), fact = await tsFact(f, submitted);
    const proof = f.trust.seal(fact), accepted = await f.service.acceptTsReceipt(proof), before = await state(f);
    expect(await f.service.acceptTsReceipt(proof)).toEqual({ receipt: accepted.receipt, replayed: true });
    const changed = f.trust.seal({ ...fact, payload_digest: accessDigest("TEST_ONLY-changed-source-payload") }, false);
    await expect(f.service.acceptTsReceipt(changed)).rejects.toMatchObject({ code: "RECEIPT_PAYLOAD_CONFLICT", status: 409 });
    const outOfOrder = f.trust.seal({ ...fact, receipt_id: next("out-of-order"), outcome: "UNKNOWN" }, false);
    await expect(f.service.acceptTsReceipt(outOfOrder)).rejects.toMatchObject({ code: "RECEIPT_REVISION_CONFLICT", status: 409 });
    expect(await state(f)).toEqual(before);
  });

  it.each([
    "proposal_digest", "portal_user_id", "ts_user_id", "mapping_revision", "human_requester_user_id",
    "action", "selector_digest", "environments", "previous_membership_revision", "membership_revision",
    "effective_at_ms", "expires_at_ms", "source_contract", "trust_profile", "provenance_ref", "payload_digest",
  ] as const)("T03-08 verified receipt misbinding %s cannot establish accepted authority", async field => {
    const f = await fixture(), { submitted } = await business(f), fact = await tsFact(f, submitted);
    const changed: TsMembershipAcceptance = { ...fact };
    if (field === "environments") changed.environments = ["live"];
    else if (field === "action") changed.action = "capital.fund";
    else if (field === "effective_at_ms") changed.effective_at_ms = fact.effective_at_ms - 1;
    else if (field === "expires_at_ms") changed.expires_at_ms = fact.expires_at_ms! + 1;
    else if (field === "previous_membership_revision") changed.previous_membership_revision = "TEST_ONLY-wrong-prior";
    else if (field === "membership_revision") changed.membership_revision = "";
    else changed[field] = ["source_contract", "trust_profile", "provenance_ref", "payload_digest"].includes(field)
      ? "" : "TEST_ONLY-misbound";
    const before = await state(f);
    await expect(f.service.acceptTsReceipt(f.trust.seal(changed))).rejects.toMatchObject({ code: "RECEIPT_BINDING_MISMATCH", status: 409 });
    expect(await ownGrant(f, submitted.receipt)).toMatchObject({ current: false, ts_authority: "PENDING" });
    expect(await state(f)).toEqual(before);
  });

  it("T03-08 proposal/workspace binding and exact current TS revision refuse stale accepted receipts", async () => {
    const f = await fixture(), { submitted } = await business(f), fact = await tsFact(f, submitted);
    for (const changed of [{ ...fact, proposal_id: "TEST_ONLY-absent-proposal" }, { ...fact, workspace_id: next("absent-workspace") }])
      await expect(f.service.acceptTsReceipt(f.trust.seal(changed, false))).rejects.toMatchObject({ code: "RECEIPT_REVISION_CONFLICT", status: 409 });
    await expect(f.service.acceptTsReceipt(f.trust.seal(fact, false))).rejects.toMatchObject({ code: "TS_MEMBERSHIP_REVISION_CONFLICT", status: 409 });
    f.trust.memberships.set(researcher.user.userId, { revision: "TEST_ONLY-newer-current", receipt_id: "TEST_ONLY-newer-receipt", mapping_revision: fact.mapping_revision });
    await expect(f.service.acceptTsReceipt(f.trust.seal(fact, false))).rejects.toMatchObject({ code: "TS_MEMBERSHIP_REVISION_CONFLICT" });
    expect(await ownGrant(f, submitted.receipt)).toMatchObject({ current: false });
  });

  it("T03-07/08 app revoke is immediate and late verified acceptance cannot re-enable a pending grant", async () => {
    const f = await fixture(), { submitted } = await business(f), fact = await tsFact(f, submitted);
    const revoked = await f.service.revoke(actor(owner), f.workspace, submitted.receipt.grant_id!, f.policy.revision,
      submitted.receipt.grant_revision!, next("pending-revoke"));
    expect(revoked.receipt).toMatchObject({ outcome: "REVOKED", ts_authority: "UNKNOWN" });
    await expect(f.service.acceptTsReceipt(f.trust.seal(fact))).rejects.toMatchObject({ code: "RECEIPT_REVISION_CONFLICT", status: 409 });
    expect(await ownGrant(f, submitted.receipt)).toMatchObject({ current: false });
    expect((await f.service.proposal(actor(manager), f.workspace, submitted.receipt.proposal_id!)).state).toBe("REVOKED");
  });

  it("T03-07/08 an accepted receipt replay after revoke is historical, not renewed authority", async () => {
    const f = await fixture(), { submitted } = await business(f), fact = await tsFact(f, submitted), proof = f.trust.seal(fact);
    const accepted = await f.service.acceptTsReceipt(proof);
    await f.service.revoke(actor(owner), f.workspace, accepted.receipt.grant_id!, f.policy.revision, accepted.receipt.grant_revision!, next("accepted-revoke"));
    expect(await ownGrant(f, accepted.receipt)).toMatchObject({ current: false, ts_authority: "ACCEPTED" });
    expect(await f.service.acceptTsReceipt(proof)).toEqual({ receipt: accepted.receipt, replayed: true });
    expect(await ownGrant(f, accepted.receipt)).toMatchObject({ current: false });
  });

  it("T03-06 migration guards reject event mutation and submission-receipt rewrite", async () => {
    const f = await fixture(), submitted = await f.submit();
    await expect(ctx.pool.query("UPDATE portal_access_policy_events SET request_digest=$2 WHERE event_id=$1",
      [submitted.receipt.operation_id, accessDigest("TEST_ONLY-tamper")])).rejects.toThrow("immutable");
    await expect(ctx.pool.query("DELETE FROM portal_access_policy_events WHERE event_id=$1", [submitted.receipt.operation_id])).rejects.toThrow("immutable");
    await expect(ctx.pool.query("UPDATE portal_access_proposals SET submission_receipt='{}'::jsonb WHERE proposal_id=$1",
      [submitted.receipt.proposal_id])).rejects.toThrow("immutable");
    expect((await f.service.proposal(actor(manager), f.workspace, submitted.receipt.proposal_id!)).submission_receipt).toEqual(submitted.receipt);
  });

  it("T03-02 revoke preview shows advisory before/after without mutating authority",async()=>{
    const f=await fixture(),submitted=await f.submit(),before=await state(f);
    const preview=await f.service.previewRevoke(actor(owner),f.workspace,submitted.receipt.grant_id!,f.policy.revision,
      submitted.receipt.grant_revision!,"TEST_ONLY revoke diff");
    expect(preview).toMatchObject({advisory_only:true,step_up_required:true,before:{grant_id:submitted.receipt.grant_id,effect:"ALLOW",revoked_at_ms:null},
      after:{grant_state:"REVOKED_ON_COMMIT",effective_access:"CURRENT_POLICY_REEVALUATED",ts_revocation:"NOT_REQUIRED",committed_obligations:"CONTINUE"}});
    await expect(f.service.previewRevoke(actor(peer),f.workspace,submitted.receipt.grant_id!,f.policy.revision,
      submitted.receipt.grant_revision!,"TEST_ONLY")).rejects.toMatchObject({code:"ACCESS_RESOURCE_NOT_FOUND",status:404});
    await expect(f.service.previewRevoke(actor(owner),f.workspace,submitted.receipt.grant_id!,f.policy.revision,
      "TEST_ONLY stale","TEST_ONLY")).rejects.toMatchObject({code:"GRANT_REVISION_CONFLICT",status:409});
    expect(await state(f)).toEqual(before);
  });

  it("T03-03/07 only the current protected owner may preview/remove DENY, including before receipt replay", async () => {
    const f = await fixture(), denied = await f.submit(f.change({ effect: "DENY" })), before = await state(f);
    const id = denied.receipt.grant_id!, revision = denied.receipt.grant_revision!, reason = "TEST_ONLY remove explicit constraint";
    await expect(f.service.previewRevoke(actor(manager), f.workspace, id, f.policy.revision, revision, reason))
      .rejects.toMatchObject({ code: "DELEGATION_CEILING_EXCEEDED", status: 403 });
    await expect(f.service.revoke(actor(manager), f.workspace, id, f.policy.revision, revision, next("manager-deny-removal"), reason))
      .rejects.toMatchObject({ code: "DELEGATION_CEILING_EXCEEDED", status: 403 });
    expect(await state(f)).toEqual(before);
    expect(await ownGrant(f, denied.receipt)).toMatchObject({ effect: "DENY", current: true });
    expect(await f.service.previewRevoke(actor(owner), f.workspace, id, f.policy.revision, revision, reason))
      .toMatchObject({ before: { effect: "DENY" }, after: { grant_state: "REVOKED_ON_COMMIT", effective_access: "CURRENT_POLICY_REEVALUATED" } });
    const key = next("owner-deny-removal"), revoked = await f.service.revoke(actor(owner), f.workspace, id, f.policy.revision, revision, key, reason);
    expect(revoked.receipt.outcome).toBe("REVOKED");
    await expect(f.service.revoke(actor(manager), f.workspace, id, f.policy.revision, revision, key, reason))
      .rejects.toMatchObject({ code: "DELEGATION_CEILING_EXCEEDED", status: 403 });
    expect(await f.service.revoke(actor(owner), f.workspace, id, f.policy.revision, revision, key, reason))
      .toEqual({ receipt: revoked.receipt, replayed: true });
    expect(await ownGrant(f, denied.receipt)).toMatchObject({ effect: "DENY", current: false });
  });

  it("T03-07 audit rechecks permission after an awaited read crosses the real grant expiry", async () => {
    const f = await fixture();
    await f.submit();
    const now = Number((await ctx.pool.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0].ms);
    const deadline = now + 2_000, revision = next("TEST_ONLY-expiring-audit-policy");
    f.trust.artifact.policy = { ...f.policy, revision, artifact_digest: accessDigest(["TEST_ONLY-expiring-audit", revision]) };
    f.trust.artifact.root_grants = f.trust.artifact.root_grants.map(grant => ({ ...grant,
      grant_id: next("TEST_ONLY-expiring-audit-root"), revision: next("TEST_ONLY-expiring-audit-root-revision"),
      policy_revision: revision, valid_until_ms: grant.action === "audit.read" ? deadline : grant.valid_until_ms }));
    await f.service.installReviewedPolicy(f.trust.artifact);
    const before = await state(f), original = AccessRepository.prototype.events;
    let readAwaited = false;
    const spy = vi.spyOn(AccessRepository.prototype, "events").mockImplementation(async function(this: AccessRepository,
      workspace: string, subject: string, limit: number, after: null | { time: string; id: string }) {
      const rows = await original.call(this, workspace, subject, limit, after);
      if (workspace === f.workspace && subject === researcher.user.userId) {
        expect(rows.length).toBeGreaterThan(0);
        readAwaited = true;
        await ctx.pool.query(`SELECT pg_sleep(GREATEST(
          ($1::double precision-extract(epoch FROM clock_timestamp())*1000)/1000,0)+0.05)`, [deadline]);
      }
      return rows;
    });
    try {
      await expect(f.service.audit(actor(owner), f.workspace, researcher.user.userId, 25))
        .rejects.toMatchObject({ code: "ACCESS_RESOURCE_NOT_FOUND", status: 404 });
      expect(readAwaited).toBe(true);
      expect(await state(f)).toEqual(before);
    } finally { spy.mockRestore(); }
  });

  it("T03-02/11 target and workspace isolation hide proposal/audit data from unrelated principals", async () => {
    const f = await fixture(), submitted = await f.submit();
    for (const id of [submitted.receipt.proposal_id!, "TEST_ONLY-nonexistent-proposal"])
      await expect(f.service.proposal(actor(peer), f.workspace, id)).rejects.toMatchObject({ code: "ACCESS_RESOURCE_NOT_FOUND", status: 404 });
    await expect(f.service.audit(actor(peer), f.workspace, researcher.user.userId, 25))
      .rejects.toMatchObject({ code: "ACCESS_RESOURCE_NOT_FOUND", status: 404 });
    const other = await fixture();
    await expect(f.service.proposal(actor(manager), other.workspace, submitted.receipt.proposal_id!))
      .rejects.toMatchObject({ code: "ACCESS_RESOURCE_NOT_FOUND", status: 404 });
    await ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [f.workspace, peer.user.userId]);
    await expect(f.service.effective(actor(peer), f.workspace)).rejects.toMatchObject({ code: "ACCESS_RESOURCE_NOT_FOUND", status: 404 });
    const unknownTarget = f.change({ subject_user_id: "TEST_ONLY-missing-user" });
    await expect(f.submit(unknownTarget)).rejects.toMatchObject({ code: "ACCESS_RESOURCE_NOT_FOUND", status: 404 });
  });

  it("T03-02 mounted delegated USER preview/proposal/replay returns the real committed contract", async () => {
    const f = await fixture(), change = f.change(), key = next("http-replay");
    expect(manager.user.role).toBe("USER");
    await withHttp(f.service, async app => {
      const http = app.getHttpAdapter().getInstance();
      const preview = await http.inject({ method: "POST", url: `${BASE}/preview`, headers: headers(manager.session), payload: { workspace_id: f.workspace, change } });
      expect(preview.statusCode).toBe(200);
      expect(preview.headers["cache-control"]).toContain("no-store");
      expect(preview.json()).toMatchObject({ allowed: true, effective_business_right: false });
      const payload = { workspace_id: f.workspace, change, preview_digest: preview.json().preview_digest };
      const applied = await http.inject({ method: "POST", url: `${BASE}/proposals`, headers: headers(manager.session, key), payload });
      expect(applied.statusCode).toBe(201);
      expect(applied.json()).toMatchObject({ schema_version: "portal.access-result.v1", replayed: false, receipt: { outcome: "APP_APPLIED" } });
      const replay = await http.inject({ method: "POST", url: `${BASE}/proposals`, headers: headers(manager.session, key), payload });
      expect(replay.statusCode).toBe(201);
      expect(replay.json()).toEqual({ ...applied.json(), replayed: true });
      const own = await http.inject({ method: "GET", url: `${BASE}/effective?workspace_id=${f.workspace}`, headers: { cookie: cookie(researcher.session) } });
      expect(own.statusCode).toBe(200);
      expect(own.json()).toMatchObject({ user_id: researcher.user.userId, grants: expect.arrayContaining([
        expect.objectContaining({ grant_id: applied.json().receipt.grant_id, current: true }),
      ]) });
    });
  });

  it("T03-02 mounted revoke preview returns the advisory contract and enforces strict input/CSRF without authority writes", async () => {
    const f = await fixture(), submitted = await f.submit(), grant = await storedGrant(submitted.receipt.grant_id!);
    const before = await state(f), effective = await ownGrant(f, submitted.receipt);
    const proofs = (await ctx.pool.query("SELECT * FROM owner_step_up_grants WHERE user_id=$1 ORDER BY step_up_id", [manager.user.userId])).rows;
    const payload = { workspace_id: f.workspace, expected_policy_revision: f.policy.revision,
      expected_grant_revision: submitted.receipt.grant_revision!, reason: "TEST_ONLY mounted advisory revoke" };
    const url = `${BASE}/grants/${submitted.receipt.grant_id}/preview-revoke`;
    await withHttp(f.service, async app => {
      const http = app.getHttpAdapter().getInstance();
      const response = await http.inject({ method: "POST", url, headers: headers(manager.session), payload });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toContain("no-store");
      expect(response.json()).toMatchObject({ schema_version: "portal.access-revoke-preview.v1",
        policy_revision: f.policy.revision, advisory_only: true, step_up_required: true,
        before: { grant_id: grant.grant_id, grant_revision: grant.revision, action: grant.action, effect: "ALLOW",
          selector: grant.selector, environments: grant.environments, revoked_at_ms: null },
        after: { grant_state: "REVOKED_ON_COMMIT", effective_access: "CURRENT_POLICY_REEVALUATED", ts_revocation: "NOT_REQUIRED",
          descendants: "CURRENT_CHAIN_RECHECKED", committed_obligations: "CONTINUE" } });
      expect(response.json().preview_digest).toBe(accessDigest([manager.user.userId, f.workspace,
        grant.grant_id, f.policy.revision, grant.revision, payload.reason]));
      const invalid = await http.inject({ method: "POST", url, headers: headers(manager.session),
        payload: { ...payload, actor_user_id: owner.user.userId } });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json().error.code).toBe("ACCESS_INPUT_INVALID");
      for (const overrides of [{ "x-portal-csrf": "TEST_ONLY-invalid-csrf" }, { origin: "" }]) {
        const denied = await http.inject({ method: "POST", url,
          headers: { ...headers(manager.session), ...overrides }, payload });
        expect(denied.statusCode).toBe(403);
      }
    });
    expect(await state(f)).toEqual(before);
    expect(await storedGrant(grant.grant_id)).toEqual(grant);
    expect(await ownGrant(f, submitted.receipt)).toEqual(effective);
    expect((await ctx.pool.query("SELECT * FROM owner_step_up_grants WHERE user_id=$1 ORDER BY step_up_id", [manager.user.userId])).rows).toEqual(proofs);
  });

  it("T03-02 mounted endpoints require a current session and reject CSRF/origin/idempotency failures", async () => {
    const f = await fixture(), change = f.change(), before = await state(f);
    await withHttp(f.service, async app => {
      const http = app.getHttpAdapter().getInstance();
      expect((await http.inject({ method: "GET", url: `${BASE}/effective?workspace_id=${f.workspace}` })).statusCode).toBe(401);
      for (const overrides of [{ origin: "" }, { origin: "https://untrusted.invalid" }, { "x-portal-csrf": "wrong" },
        { "x-portal-csrf": "" }, { cookie: `${SESSION_COOKIE}=${manager.session.token}` }]) {
        const response = await http.inject({ method: "POST", url: `${BASE}/preview`,
          headers: { ...headers(manager.session), ...overrides }, payload: { workspace_id: f.workspace, change } });
        expect(response.statusCode).toBe(403);
      }
      for (const key of ["", "short", "x".repeat(129), "invalid key spaces"]) {
        expect((await http.inject({ method: "POST", url: `${BASE}/preview`, headers: headers(manager.session, key),
          payload: { workspace_id: f.workspace, change } })).statusCode).toBe(400);
      }
    });
    expect(await state(f)).toEqual(before);
  });

  it("T03-03/11 mounted strict schemas refuse spoofed actors, identities, ownership and acceptance facts", async () => {
    const f = await fixture(), change = f.change(), before = await state(f);
    await withHttp(f.service, async app => {
      const http = app.getHttpAdapter().getInstance();
      const extras = [{ actor_user_id: owner.user.userId }, { issuer: "TEST_ONLY-forged" }, { owner_user_id: owner.user.userId },
        { role: "ADMIN" }, { ts_state: "APPLIED" }, { accepted: true }, { verifier: "TEST_ONLY" },
        { sql: "SELECT 1" }, { url: "https://untrusted.invalid" }];
      for (const extra of extras) {
        const top = await http.inject({ method: "POST", url: `${BASE}/preview`, headers: headers(owner.session),
          payload: { workspace_id: f.workspace, change, ...extra } });
        const nested = await http.inject({ method: "POST", url: `${BASE}/preview`, headers: headers(owner.session),
          payload: { workspace_id: f.workspace, change: { ...change, ...extra } } });
        expect([top.statusCode, nested.statusCode]).toEqual([400, 400]);
        expect(top.json().error.code).toBe("ACCESS_INPUT_INVALID");
      }
      const badSelector = await http.inject({ method: "POST", url: `${BASE}/preview`, headers: headers(manager.session),
        payload: { workspace_id: f.workspace, change: { ...change, selector: { kind: "OWN_ALPHA", owner_user_id: owner.user.userId } } } });
      expect(badSelector.statusCode).toBe(400);
    });
    expect(await state(f)).toEqual(before);
  });

  it("T03-03 mounted deny reasons and step-up cannot be bypassed by ADMIN or a copied preview", async () => {
    const f = await fixture(), change = f.change(), preview = await f.service.preview(actor(manager), f.workspace, change);
    await withHttp(f.service, async app => {
      const http = app.getHttpAdapter().getInstance();
      const denied = await http.inject({ method: "POST", url: `${BASE}/preview`, headers: headers(peer.session), payload: { workspace_id: f.workspace, change } });
      expect(denied.statusCode).toBe(200);
      expect(denied.json()).toMatchObject({ allowed: false, reason_code: "DELEGATION_CEILING_EXCEEDED" });
      const submit = await http.inject({ method: "POST", url: `${BASE}/proposals`, headers: headers(peer.session),
        payload: { workspace_id: f.workspace, change, preview_digest: preview.preview_digest } });
      expect(submit.statusCode).toBe(403);
      expect(["STEP_UP_REQUIRED", "DELEGATION_CEILING_EXCEEDED"]).toContain(submit.json().error.code);
    });
    expect((await state(f)).proposals).toBe(0);
  });

  it("T03-05/08 neither mounted test nor default application publishes policy-install or TS-acceptance writers", async () => {
    const f = await fixture();
    await withHttp(f.service, async app => {
      for (const http of [app.getHttpAdapter().getInstance(), ctx.app.getHttpAdapter().getInstance()]) {
        for (const path of ["policy", "policy/install", "install-reviewed-policy", "ts-receipts", "accept-ts-receipt", "proposals/TEST_ONLY/accept"]) {
          const response = await http.inject({ method: "POST", url: `${BASE}/${path}`, headers: headers(owner.session),
            payload: { policy: f.policy, outcome: "ACCEPTED", qualification: "OWNER_VERIFIED" } });
          expect(response.statusCode, path).toBe(404);
        }
      }
      const defaultEffective = await ctx.app.getHttpAdapter().getInstance().inject({ method: "GET",
        url: `${BASE}/effective?workspace_id=${f.workspace}`, headers: { cookie: cookie(manager.session) } });
      expect(defaultEffective.statusCode).toBe(200);
      expect(defaultEffective.json().availability).toBe("POLICY_PENDING");
    });
  });

  type DelegatedLease = NonNullable<Awaited<ReturnType<NonNullable<AccessTrustProvider["qualifyDelegatedReceipt"]>>>>;
  function delegatedTrust(f: Fixture, pool: Pool, fact: TsMembershipAcceptance, options: {
    omitPort?: boolean; refuse?: boolean; transform?(lease: DelegatedLease): void;
    guard?(): void; release?(): Promise<void>;
  } = {}) {
    let calls = 0, releases = 0, held = 0;
    const trust: AccessTrustProvider = {
      verifyPolicy: f.trust.verifyPolicy.bind(f.trust), verifyReceipt: f.trust.verifyReceipt.bind(f.trust),
      relations: f.trust.relations.bind(f.trust), verifiedHumanMapping: f.trust.verifiedHumanMapping.bind(f.trust),
    };
    if (!options.omitPort) trust.qualifyDelegatedReceipt = async (input, scope) => {
      calls++;
      expect(await f.trust.verifyReceipt(input)).toEqual(fact);
      expect(pool.totalCount - pool.idleCount).toBe(0);
      // A real max1 query would time out if qualification held a Core client;
      // NOWAIT also rules out another Core TX holding the actual actor row.
      await pool.query("SELECT user_id FROM portal_users WHERE user_id=$1 FOR UPDATE NOWAIT", [f.issuingManager.user.userId]);
      const grants = await new AccessRepository(pool).grants(f.workspace);
      const ids = [...new Set([f.issuingManager.user.userId, fact.portal_user_id,
        ...grants.flatMap(grant => [grant.issued_by, grant.subject_user_id])])].sort();
      expect(scope).toEqual({ workspace_id: f.workspace, subject_user_id: fact.portal_user_id, principal_ids: ids });
      if (options.refuse) return null;
      const mapping = structuredClone(await f.trust.verifiedHumanMapping(fact.portal_user_id, f.workspace));
      const relations: { principal_id: string; relations: AccessRelations }[] = [];
      for (const principal_id of ids) relations.push({ principal_id,
        relations: structuredClone(await f.trust.relations(principal_id, f.workspace)) });
      const lease: DelegatedLease = {
        fact: structuredClone(fact), mapping, relations,
        assertCurrent: () => options.guard?.(),
        release: async () => {
          expect(pool.totalCount - pool.idleCount).toBe(0);
          try {
            expect((await pool.query("SELECT 1 AS released_after_core")).rows[0].released_after_core).toBe(1);
            await options.release?.();
          } finally { held--; releases++; }
        },
      };
      held++;
      options.transform?.(lease);
      return lease;
    };
    return { trust, calls: () => calls, releases: () => releases, held: () => held };
  }

  it("ELP2-10 NEW coordinated delegation requires a held provider before opening a drain", async () => {
    const f = await fixture(), { submitted } = await business(f), fact = await tsFact(f, submitted), proof = f.trust.seal(fact);
    await withCurrentHuman(f, manager, async cell => {
      const before = await authorityRows(f), h = delegatedTrust(f, cell.pool, fact, { omitPort: true });
      await expect(cell.service(async () => undefined, h.trust).acceptTsReceipt(proof))
        .rejects.toMatchObject({ code: "RECEIPT_NOT_QUALIFIED", status: 503 });
      expect(await authorityRows(f)).toEqual(before);
      expect((await cell.pool.query("SELECT count(*)::int AS n FROM elp210_candidate.mutations")).rows[0].n).toBe(0);
      expect((await cell.pool.query("SELECT drain_id FROM elp210_candidate.authority WHERE singleton")).rows[0].drain_id).toBeNull();
    });
  });

  it("ELP2-10 detached receipt binding refusal cannot acquire a provider or open an authority drain", async () => {
    const f = await fixture(), { submitted } = await business(f), fact = await tsFact(f, submitted);
    const proof = f.trust.seal({ ...fact, proposal_digest: accessDigest("TEST_ONLY-wrong-proposal") }, false);
    await withCurrentHuman(f, manager, async cell => {
      const before = await authorityRows(f), h = delegatedTrust(f, cell.pool, fact);
      await expect(cell.service(async () => undefined, h.trust).acceptTsReceipt(proof))
        .rejects.toMatchObject({ code: "RECEIPT_BINDING_MISMATCH", status: 409 });
      expect(h.calls()).toBe(0); expect(await authorityRows(f)).toEqual(before);
      expect((await cell.pool.query("SELECT count(*)::int AS n FROM elp210_candidate.mutations")).rows[0].n).toBe(0);
    });
  });

  it("ELP2-10 delegated receipt recovers the signed source first, then holds exact qualification through Core outcome", async () => {
    const f = await fixture(), { submitted } = await business(f), fact = await tsFact(f, submitted), proof = f.trust.seal(fact);
    await withCurrentHuman(f, manager, async cell => {
      const lease = await cell.enter(), h = delegatedTrust(f, cell.pool, fact), before = await authorityRows(f);
      let terminal = false, recoveries = 0;
      const recover: CurrentHumanRecoveryPort["recover"] = async attempt => {
        recoveries++; expect(h.held()).toBe(0); expect(attempt.lease_id).toBe(lease.lease_id);
        return terminal ? cell.resolve(attempt.lease_id) : { phase: "COMMITTED", TEST_ONLY_unsigned_ack: true };
      };
      await expect(cell.service(recover, h.trust).acceptTsReceipt(proof))
        .rejects.toMatchObject({ code: "ACCESS_RETRY_REQUIRED", status: 503 });
      expect(h.calls()).toBe(0); expect(await authorityRows(f)).toEqual(before);
      const intent = (await cell.pool.query("SELECT * FROM elp210_candidate.mutations")).rows[0];
      expect(intent).toMatchObject({ family: "QUALIFIED_DELEGATED_RECEIPT", state: "PENDING",
        actor_id: null, session_id: null, session_revision: null });
      const changed = f.trust.seal({ ...fact, payload_digest: accessDigest("TEST_ONLY-pending-source-change") }, false);
      await expect(cell.service(recover, h.trust).acceptTsReceipt(changed))
        .rejects.toMatchObject({ code: "RECEIPT_PAYLOAD_CONFLICT", status: 409 });
      expect(recoveries).toBe(1); expect(h.calls()).toBe(0);
      terminal = true;
      const result = await cell.service(recover, h.trust).acceptTsReceipt(proof);
      expect(result).toMatchObject({ replayed: false, receipt: { outcome: "TS_APPLIED", ts_authority: "ACCEPTED" } });
      expect(recoveries).toBe(2); expect(h.calls()).toBe(1); expect(h.releases()).toBe(1); expect(h.held()).toBe(0);
      expect((await cell.pool.query("SELECT mutation_id,state FROM elp210_candidate.mutations")).rows)
        .toEqual([{ mutation_id: intent.mutation_id, state: "FINISHED" }]);
      const after = await authorityRows(f);
      expect(await cell.service(recover, h.trust).acceptTsReceipt(proof)).toEqual({ receipt: result.receipt, replayed: true });
      expect(await authorityRows(f)).toEqual(after); expect(h.calls()).toBe(1); expect(recoveries).toBe(2);
      expect((await cell.pool.query("SELECT state,submission_receipt FROM portal_access_proposals WHERE proposal_id=$1",
        [submitted.receipt.proposal_id])).rows[0]).toEqual({ state: "TS_APPLIED", submission_receipt: submitted.receipt });
    });
  });

  it("ELP2-10 delegated receipt cannot turn an expired UNKNOWN source lease into authority", async () => {
    const f = await fixture(), { submitted } = await business(f), fact = await tsFact(f, submitted), proof = f.trust.seal(fact);
    await withCurrentHuman(f, manager, async cell => {
      const lease = await cell.enter(), h = delegatedTrust(f, cell.pool, fact), before = await authorityRows(f);
      await cell.resolve(lease.lease_id, "UNKNOWN");
      const service = cell.service(async () => undefined, h.trust);
      await expect(service.acceptTsReceipt(proof)).rejects.toMatchObject({ code: "ACCESS_RETRY_REQUIRED", status: 503 });
      const intent = (await cell.pool.query("SELECT * FROM elp210_candidate.mutations")).rows[0];
      await cell.pool.query(`SELECT pg_sleep(GREATEST(
        (expires_at_ms::double precision-extract(epoch FROM clock_timestamp())*1000)/1000,0)+0.05)
        FROM elp210_candidate.leases WHERE lease_id=$1`, [lease.lease_id]);
      await expect(cell.service(async () => undefined, h.trust).acceptTsReceipt(proof))
        .rejects.toMatchObject({ code: "ACCESS_RETRY_REQUIRED", status: 503 });
      expect((await cell.pool.query("SELECT * FROM elp210_candidate.mutations")).rows).toEqual([intent]);
      expect((await cell.pool.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1", [lease.lease_id])).rows[0].phase).toBe("UNKNOWN");
      expect(h.calls()).toBe(0); expect(await authorityRows(f)).toEqual(before);
    }, 2000);
  });

  it.each(["fact", "mapping", "missing-principal", "extra-principal", "duplicate-principal", "relations", "unqualified", "membership"] as const)(
    "ELP2-10 post-recovery %s mismatch cannot widen or substitute delegated authority", async part => {
      const f = await fixture(), { submitted } = await business(f), fact = await tsFact(f, submitted), proof = f.trust.seal(fact);
      await withCurrentHuman(f, manager, async cell => {
        let altered = true;
        const h = delegatedTrust(f, cell.pool, fact, { transform: lease => {
          if (!altered) return;
          if (part === "fact") lease.fact.payload_digest = accessDigest("TEST_ONLY-other-qualified-fact");
          else if (part === "mapping") lease.mapping = { ...lease.mapping!, revision: "TEST_ONLY-other-mapping" };
          else if (part === "missing-principal") lease.relations = lease.relations.slice(1);
          else if (part === "extra-principal") lease.relations = [...lease.relations,
            { principal_id: "TEST_ONLY-not-in-core-graph", relations: structuredClone(lease.relations[0].relations) }];
          else if (part === "duplicate-principal") lease.relations = [...lease.relations, structuredClone(lease.relations[0])];
          else {
            const subject = lease.relations.find(item => item.principal_id === fact.portal_user_id)!;
            if (part === "relations") subject.relations.member_portfolio_ids = ["TEST_ONLY-other-portfolio"];
            if (part === "unqualified") subject.relations.qualified = false;
            if (part === "membership") subject.relations.membership = { ...subject.relations.membership!, revision: "TEST_ONLY-other-membership" };
          }
        } });
        const before = await authorityRows(f);
        await expect(cell.service(async () => undefined, h.trust).acceptTsReceipt(proof))
          .rejects.toMatchObject({ code: "RECEIPT_BINDING_MISMATCH", status: 409 });
        expect(await authorityRows(f)).toEqual(before); expect(h.releases()).toBe(1); expect(h.held()).toBe(0);
        const intent = (await cell.pool.query("SELECT mutation_id,state FROM elp210_candidate.mutations")).rows[0];
        expect(intent.state).toBe("PENDING");
        altered = false;
        expect((await cell.service(async () => undefined, h.trust).acceptTsReceipt(proof)).receipt.outcome).toBe("TS_APPLIED");
        expect((await cell.pool.query("SELECT mutation_id,state FROM elp210_candidate.mutations")).rows)
          .toEqual([{ mutation_id: intent.mutation_id, state: "FINISHED" }]);
      });
    });

  it("ELP2-10 equivalent declared relation sets may be reordered without losing delegated qualification", async () => {
    const f = await fixture(), { submitted } = await business(f), fact = await tsFact(f, submitted), proof = f.trust.seal(fact);
    await withCurrentHuman(f, manager, async cell => {
      const h = delegatedTrust(f, cell.pool, fact, { transform: lease => {
        lease.relations = [...lease.relations].reverse();
        for (const entry of lease.relations) {
          entry.relations.own_alpha_ids = [...entry.relations.own_alpha_ids].reverse();
          entry.relations.member_portfolio_ids = [...entry.relations.member_portfolio_ids].reverse();
          entry.relations.roots = Object.fromEntries(Object.entries(entry.relations.roots)
            .map(([root_id, resources]) => [root_id, [...resources].reverse()]));
        }
      } });
      expect((await cell.service(async () => undefined, h.trust).acceptTsReceipt(proof)).receipt.outcome).toBe("TS_APPLIED");
      expect(h.calls()).toBe(1); expect(h.releases()).toBe(1); expect(h.held()).toBe(0);
    });
  });

  it.each(["REJECTED", "UNKNOWN"] as const)("ELP2-10 coordinated %s records source outcome without inventing accepted authority", async outcome => {
    const f = await fixture(), { submitted } = await business(f), fact = await tsFact(f, submitted, { outcome }), proof = f.trust.seal(fact);
    const grantBefore = await storedGrant(submitted.receipt.grant_id!);
    await withCurrentHuman(f, manager, async cell => {
      const h = delegatedTrust(f, cell.pool, fact), service = cell.service(async () => undefined, h.trust);
      const result = await service.acceptTsReceipt(proof);
      expect(result.receipt).toMatchObject({ outcome: outcome === "REJECTED" ? "TS_REJECTED" : "TS_UNKNOWN", ts_authority: outcome });
      expect(await storedGrant(submitted.receipt.grant_id!)).toEqual(grantBefore);
      expect((await new AccessRepository(cell.pool).proposal(f.workspace, submitted.receipt.proposal_id!))?.submission_receipt)
        .toEqual(submitted.receipt);
      expect((await cell.pool.query("SELECT state FROM elp210_candidate.mutations")).rows).toEqual([{ state: "FINISHED" }]);
      const after = await authorityRows(f);
      expect(await service.acceptTsReceipt(proof)).toEqual({ receipt: result.receipt, replayed: true });
      expect(await authorityRows(f)).toEqual(after); expect(h.calls()).toBe(1); expect(h.releases()).toBe(1);
    });
  });

  it("ELP2-10 provider refusal cannot apply a delegation and preserves the same retryable intent", async () => {
    const f = await fixture(), { submitted } = await business(f), fact = await tsFact(f, submitted), proof = f.trust.seal(fact);
    await withCurrentHuman(f, manager, async cell => {
      const options = { refuse: true }, h = delegatedTrust(f, cell.pool, fact, options), before = await authorityRows(f);
      await expect(cell.service(async () => undefined, h.trust).acceptTsReceipt(proof))
        .rejects.toMatchObject({ code: "RECEIPT_NOT_QUALIFIED", status: 503 });
      expect(h.calls()).toBe(1); expect(h.releases()).toBe(0); expect(await authorityRows(f)).toEqual(before);
      const intent = (await cell.pool.query("SELECT mutation_id,state FROM elp210_candidate.mutations")).rows[0];
      expect(intent.state).toBe("PENDING");
      options.refuse = false;
      expect((await cell.service(async () => undefined, h.trust).acceptTsReceipt(proof)).receipt.outcome).toBe("TS_APPLIED");
      expect((await cell.pool.query("SELECT mutation_id,state FROM elp210_candidate.mutations")).rows)
        .toEqual([{ mutation_id: intent.mutation_id, state: "FINISHED" }]);
    });
  });

  it("ELP2-10 a Core ceiling changed during detached mapping cannot enter a delegated receipt drain", async () => {
    const f = await fixture(), { submitted } = await business(f), fact = await tsFact(f, submitted), proof = f.trust.seal(fact);
    await withCurrentHuman(f, manager, async cell => {
      const h = delegatedTrust(f, cell.pool, fact); let changed = false;
      f.trust.beforeHumanMapping = async () => {
        if (changed) return; changed = true;
        await new AccessRepository(ctx.pool).saveGrant({ ...f.managerRoot, revision: next("TEST_ONLY-raced-root"), revoked_at_ms: Date.now() });
      };
      await expect(cell.service(async () => undefined, h.trust).acceptTsReceipt(proof))
        .rejects.toMatchObject({ code: "RECEIPT_REVISION_CONFLICT", status: 409 });
      expect(changed).toBe(true); expect(h.calls()).toBe(0);
      expect((await storedGrant(submitted.receipt.grant_id!)).ts_receipt).toBeNull();
      expect((await cell.pool.query("SELECT count(*)::int AS n FROM elp210_candidate.mutations")).rows[0].n).toBe(0);
      expect((await cell.pool.query("SELECT state FROM portal_access_proposals WHERE proposal_id=$1", [submitted.receipt.proposal_id])).rows[0].state).toBe("TS_PENDING");
    });
  });

  it.each(["sync", "async"] as const)("ELP2-10 a %s held-fence failure after the source event rolls back all delegated writes", async kind => {
    const f = await fixture(), { submitted } = await business(f), fact = await tsFact(f, submitted), proof = f.trust.seal(fact);
    await withCurrentHuman(f, manager, async cell => {
      let valid = true;
      const h = delegatedTrust(f, cell.pool, fact, { guard: (() => {
        if (valid) return;
        if (kind === "async") return Promise.resolve();
        throw new Error("TEST_ONLY-held-source-revoked");
      }) as () => void });
      const before = await authorityRows(f), original = AccessRepository.prototype.event;
      const event = vi.spyOn(AccessRepository.prototype, "event").mockImplementation(async function (this: AccessRepository, input) {
        await original.call(this, input); if (input.operation === "TS_RECEIPT") valid = false;
      });
      try {
        await expect(cell.service(async () => undefined, h.trust).acceptTsReceipt(proof))
          .rejects.toMatchObject({ code: "RECEIPT_NOT_QUALIFIED", status: 503 });
        expect(await authorityRows(f)).toEqual(before); expect(h.releases()).toBe(1); expect(h.held()).toBe(0);
        expect((await cell.pool.query("SELECT state FROM elp210_candidate.mutations")).rows).toEqual([{ state: "PENDING" }]);
      } finally { event.mockRestore(); }
      valid = true;
      expect((await cell.service(async () => undefined, h.trust).acceptTsReceipt(proof)).receipt.outcome).toBe("TS_APPLIED");
    });
  });

  it.each(["missing-current-target", "expired-current-target"] as const)(
    "ordinary final-clock %s after actual TS_RECEIPT INSERT rolls back all authority writes (detached TEST_ONLY source)", async fault => {
      const f = await fixture(), { submitted } = await business(f), fact = await tsFact(f, submitted);
      const pending = await storedGrant(submitted.receipt.grant_id!), resource = { kind: "PORTFOLIO" as const, id: "TEST_ONLY-portfolio-1" };
      const source: CurrentAccessRelations = { schema_version: "pma.core-current-relations.v1",
        subject_user_id: pending.subject_user_id, workspace_id: f.workspace, ts_user_id: fact.ts_user_id,
        mapping_revision: fact.mapping_revision,
        resources: pending.environments.map(environment => ({ environment, revision: "TEST_ONLY:current-cut",
          own_alpha_ids: [], member_portfolio_ids: [resource.id], roots: [] })),
        grants: [{ grant_id: pending.grant_id, binding_digest: grantBindingDigest(pending), accepted: structuredClone(fact),
          targets: pending.environments.map(environment => ({ environment, resource, revision: "TEST_ONLY:current-leg",
            native_reference_digest: accessDigest(["TEST_ONLY:original-native", environment, resource]),
            valid_from_ms: fact.effective_at_ms, valid_until_ms: fact.expires_at_ms! })) }] };
      f.trust.currentAuthorities.set(pending.subject_user_id, source);
      const proof = f.trust.seal(fact, false), sourceBefore = structuredClone(source);
      await withCurrentHuman(f, manager, async cell => {
        const h = delegatedTrust(f, cell.pool, fact), service = cell.service(async () => undefined, h.trust);
        const before = await authorityRows(f), originalEvent = AccessRepository.prototype.event;
        // Observe the actual private binding call and forward it unchanged.
        // No replacement authority, DB, timestamp, coordinator or native lease.
        const inspected = service as unknown as { validateTsBinding(...args: unknown[]): void };
        const originalBinding = inspected.validateTsBinding.bind(service);
        let inTx: CurrentAccessRelations | undefined, expiry: number | undefined, writes = 0;
        const clocks: number[] = [];
        const binding = vi.spyOn(inspected, "validateTsBinding").mockImplementation((...args: unknown[]) => {
          inTx = (args[5] as AccessRelations | undefined)?.current_authority ?? undefined;
          clocks.push(args[6] as number); return originalBinding(...args);
        });
        const event = vi.spyOn(AccessRepository.prototype, "event").mockImplementation(async function (this: AccessRepository, input) {
          await originalEvent.call(this, input);
          if (input.operation !== "TS_RECEIPT" || input.workspace_id !== f.workspace) return;
          writes++;
          expect((await this.sourceEvent(fact.source, fact.receipt_id))?.event_id).toBe(input.event_id);
          expect((await this.proposal(f.workspace, submitted.receipt.proposal_id!))?.state).toBe("TS_APPLIED");
          expect((await this.grants(f.workspace)).find(g => g.grant_id === pending.grant_id)?.ts_receipt?.receipt_id).toBe(fact.receipt_id);
          expect(inTx).toBeDefined();
          const entry = inTx!.grants.find(g => g.grant_id === pending.grant_id)!;
          if (fault === "missing-current-target") entry.targets = [];
          else {
            expiry = Number((await this.db.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0].ms);
            for (const target of entry.targets) target.valid_until_ms = expiry;
          }
        });
        try {
          await expect(service.acceptTsReceipt(proof)).rejects.toMatchObject({ code: "TS_MEMBERSHIP_REVISION_CONFLICT", status: 409 });
          expect(writes).toBe(1); expect(clocks.length).toBeGreaterThanOrEqual(3); // authorization, application, final DB clock
          if (expiry !== undefined) expect(clocks.at(-1)).toBeGreaterThanOrEqual(expiry);
          expect(await authorityRows(f)).toEqual(before);
          expect(await storedGrant(pending.grant_id)).toEqual(pending);
          expect((await new AccessRepository(cell.pool).proposal(f.workspace, submitted.receipt.proposal_id!))?.submission_receipt)
            .toEqual(submitted.receipt);
          expect((await cell.pool.query("SELECT state FROM elp210_candidate.mutations")).rows).toEqual([{ state: "PENDING" }]);
          expect(h.releases()).toBe(1); expect(h.held()).toBe(0);
          expect(source).toEqual(sourceBefore); // provider input was not mutated or rewritten to make the test pass
        } finally { event.mockRestore(); binding.mockRestore(); }
        // Same authenticated intent can retry against the unchanged source;
        // no new receipt, source timestamp, request key or proposal is invented.
        const accepted = await service.acceptTsReceipt(proof);
        expect(accepted.receipt.outcome).toBe("TS_APPLIED");
        expect((await cell.pool.query("SELECT state FROM elp210_candidate.mutations")).rows).toEqual([{ state: "FINISHED" }]);
        const committed = await authorityRows(f), calls = h.calls();
        const legacyInspected = f.service as unknown as { validateTsBinding(...args: unknown[]): void };
        const historicalBinding = vi.spyOn(legacyInspected, "validateTsBinding").mockImplementation(() => {
          throw new Error("TEST_ONLY immutable ACK must not enter new-intake validation");
        });
        try {
          source.grants[0].targets = [];
          expect(await f.service.acceptTsReceipt(proof)).toEqual({ receipt: accepted.receipt, replayed: true });
          expect(historicalBinding).not.toHaveBeenCalled(); expect(h.calls()).toBe(calls);
          expect(await authorityRows(f)).toEqual(committed);
        } finally { historicalBinding.mockRestore(); }
      });
    });

  it.each(["initial", "after-insert"] as const)(
    "legacy ACCEPTED %s qualification refusal rolls back exact authority rows and permits the same proof after requalification", async phase => {
      const f = await fixture(), { submitted } = await business(f), fact = await tsFact(f, submitted), proof = f.trust.seal(fact);
      const pending = await storedGrant(submitted.receipt.grant_id!), before = await authorityRows(f);
      const membership = structuredClone(f.trust.memberships.get(fact.portal_user_id)!);
      const originalRelations = f.trust.relations.bind(f.trust);
      let qualified = phase !== "initial";
      const relations = vi.spyOn(f.trust, "relations").mockImplementation(async (id, workspace) => {
        const value = await originalRelations(id, workspace);
        if (id !== fact.portal_user_id || workspace !== f.workspace) return value;
        expect(Object.hasOwn(value, "current_authority")).toBe(false);
        return { ...value, qualified };
      });
      const inspected = f.service as unknown as { validateTsBinding(...args: unknown[]): void };
      const originalBinding = inspected.validateTsBinding.bind(f.service), originalEvent = AccessRepository.prototype.event;
      let inTx: AccessRelations | undefined, writes = 0, afterWriteNow: number | undefined;
      const clocks: number[] = [];
      const binding = vi.spyOn(inspected, "validateTsBinding").mockImplementation((...args: unknown[]) => {
        inTx = args[5] as AccessRelations | undefined;clocks.push(args[6] as number);
        expect(inTx?.membership).toEqual(membership);
        return originalBinding(...args);
      });
      const event = vi.spyOn(AccessRepository.prototype, "event").mockImplementation(async function (this: AccessRepository, input) {
        await originalEvent.call(this, input);
        if (input.workspace_id !== f.workspace || input.operation !== "TS_RECEIPT") return;
        writes++;
        expect((await this.sourceEvent(fact.source, fact.receipt_id))?.event_id).toBe(input.event_id);
        expect((await this.proposal(f.workspace, submitted.receipt.proposal_id!))?.state).toBe("TS_APPLIED");
        expect((await this.grants(f.workspace)).find(g => g.grant_id === pending.grant_id)?.ts_receipt?.receipt_id).toBe(fact.receipt_id);
        afterWriteNow = Number((await this.db.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0].ms);
        expect(inTx?.qualified).toBe(true);
        // Existing fault-injection seam: alter only the detached TEST_ONLY
        // snapshot after REAL writes, never the provider fact, DB clock or lease.
        inTx!.qualified = false;
      });
      try {
        try {
          await expect(f.service.acceptTsReceipt(proof)).rejects.toMatchObject({ code: "TS_MEMBERSHIP_REVISION_CONFLICT", status: 409 });
          expect(writes).toBe(phase === "initial" ? 0 : 1);
          expect(clocks).toHaveLength(phase === "initial" ? 1 : 2);
          if (phase === "after-insert") expect(clocks.at(-1)).toBeGreaterThanOrEqual(afterWriteNow!);
          expect(await authorityRows(f)).toEqual(before);
          expect(await storedGrant(pending.grant_id)).toEqual(pending);
          expect((await new AccessRepository(ctx.pool).proposal(f.workspace, submitted.receipt.proposal_id!)))
            .toMatchObject({ state: "TS_PENDING", submission_receipt: submitted.receipt });
          expect(await new AccessRepository(ctx.pool).sourceEvent(fact.source, fact.receipt_id)).toBeNull();
          expect(f.trust.memberships.get(fact.portal_user_id)).toEqual(membership);
          expect(f.trust.receipts.get(proof)).toEqual(fact);
        } finally { event.mockRestore(); binding.mockRestore(); }
        qualified = true;
        const accepted = await f.service.acceptTsReceipt(proof);
        expect(accepted).toMatchObject({ replayed: false, receipt: { outcome: "TS_APPLIED", ts_authority: "ACCEPTED" } });
        const grant = await storedGrant(pending.grant_id);
        expect(grant.ts_acceptance_digest).toBe(accessDigest(fact));
        expect(grant.ts_receipt).toMatchObject({ receipt_id: fact.receipt_id, membership_revision: fact.membership_revision,
          mapping_revision: fact.mapping_revision });
        expect((await new AccessRepository(ctx.pool).proposal(f.workspace, submitted.receipt.proposal_id!)))
          .toMatchObject({ state: "TS_APPLIED", submission_receipt: submitted.receipt });
        await f.service.revoke(actor(owner), f.workspace, grant.grant_id, f.policy.revision, grant.revision, next("legacy-intake-history-revoke"));
        qualified = false;relations.mockClear();
        const historicalRows = await authorityRows(f);
        const mapping = vi.spyOn(f.trust, "verifiedHumanMapping").mockRejectedValue(new Error("TEST_ONLY historical ACK needs no fresh mapping"));
        const historicalBinding = vi.spyOn(inspected, "validateTsBinding").mockImplementation(() => {
          throw new Error("TEST_ONLY historical ACK must not activate a legacy grant");
        });
        try {
          expect(await f.service.acceptTsReceipt(proof)).toEqual({ receipt: accepted.receipt, replayed: true });
          expect(relations).not.toHaveBeenCalled();expect(mapping).not.toHaveBeenCalled();expect(historicalBinding).not.toHaveBeenCalled();
          expect(await authorityRows(f)).toEqual(historicalRows);
          expect((await storedGrant(pending.grant_id)).revoked_at_ms).not.toBeNull();
          expect(f.trust.memberships.get(fact.portal_user_id)).toEqual(membership);
          expect(f.trust.receipts.get(proof)).toEqual(fact);
        } finally { historicalBinding.mockRestore(); mapping.mockRestore(); }
      } finally { relations.mockRestore(); }
    });

  it.each(["future-effective", "already-expired"] as const)(
    "ordinary legacy ACCEPTED fact with %s wall-clock bounds never enters authority/event writes", async fault => {
      const f = await fixture(), { submitted } = await business(f);
      const now = Number((await ctx.pool.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0].ms);
      const fact = await tsFact(f, submitted, fault === "future-effective"
        ? { effective_at_ms: now + 60_000 } : { expires_at_ms: now - 1 });
      const proof = f.trust.seal(fact), before = await authorityRows(f), pending = await storedGrant(submitted.receipt.grant_id!);
      expect(f.trust.currentAuthorities.has(fact.portal_user_id)).toBe(false); // exact legacy-extension-ABSENT lane
      const original = AccessRepository.prototype.event; let writes = 0;
      const event = vi.spyOn(AccessRepository.prototype, "event").mockImplementation(async function (this: AccessRepository, input) {
        if (input.workspace_id === f.workspace && input.operation === "TS_RECEIPT") writes++;
        await original.call(this, input);
      });
      try {
        await expect(f.service.acceptTsReceipt(proof)).rejects.toMatchObject({ code: "RECEIPT_BINDING_MISMATCH", status: 409 });
        expect(writes).toBe(0); expect(await authorityRows(f)).toEqual(before);
        expect(await storedGrant(pending.grant_id)).toEqual(pending);
        expect((await f.service.proposal(actor(manager), f.workspace, submitted.receipt.proposal_id!)).submission_receipt).toEqual(submitted.receipt);
      } finally { event.mockRestore(); }
    });

  it.each(["REJECTED", "UNKNOWN"] as const)(
    "ordinary %s observation survives unqualified legacy membership and expiry without ACCEPTED activation", async outcome => {
      const f = await fixture(), { submitted } = await business(f);
      const now = Number((await ctx.pool.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0].ms);
      const fact = await tsFact(f, submitted, { outcome, expires_at_ms: now - 1 });
      const proof = f.trust.seal(fact, false), pending = await storedGrant(submitted.receipt.grant_id!);
      // Retaining a tuple is not an accepted entitlement. Authentication of
      // this negative observation remains the verifier's separate fact.
      f.trust.memberships.set(fact.portal_user_id, { receipt_id: fact.receipt_id,
        revision: fact.membership_revision, mapping_revision: fact.mapping_revision });
      const originalRelations = f.trust.relations.bind(f.trust);
      const relations = vi.spyOn(f.trust, "relations").mockImplementation(async (id, workspace) => {
        const value = await originalRelations(id, workspace);
        if (id !== fact.portal_user_id || workspace !== f.workspace) return value;
        expect(Object.hasOwn(value, "current_authority")).toBe(false);
        return { ...value, qualified: false };
      });
      try {
        const result = await f.service.acceptTsReceipt(proof);
        expect(result.receipt).toMatchObject({ outcome: outcome === "REJECTED" ? "TS_REJECTED" : "TS_UNKNOWN", ts_authority: outcome });
        expect(await storedGrant(pending.grant_id)).toEqual(pending);
        const proposal = await f.service.proposal(actor(manager), f.workspace, submitted.receipt.proposal_id!);
        expect(proposal.submission_receipt).toEqual(submitted.receipt);
        expect(proposal.state).toBe(outcome === "REJECTED" ? "TS_REJECTED" : "TS_UNKNOWN");
        const before = await authorityRows(f);
        expect(await f.service.acceptTsReceipt(proof)).toEqual({ receipt: result.receipt, replayed: true });
        expect(await authorityRows(f)).toEqual(before);
      } finally { relations.mockRestore(); }
    });

  it("ELP2-10 historical delegated replay skips qualification and drain despite revoke and unrelated UNKNOWN work", async () => {
    const f = await fixture(), { submitted } = await business(f), fact = await tsFact(f, submitted), proof = f.trust.seal(fact);
    const accepted = await f.service.acceptTsReceipt(proof), grant = await storedGrant(submitted.receipt.grant_id!);
    await f.service.revoke(actor(owner), f.workspace, grant.grant_id, f.policy.revision, grant.revision, next("TEST_ONLY-revoke-before-history"));
    await withCurrentHuman(f, manager, async cell => {
      const lease = await cell.enter(); await cell.resolve(lease.lease_id, "UNKNOWN");
      const h = delegatedTrust(f, cell.pool, fact, { omitPort: true }), recover = vi.fn(async () => undefined), before = await authorityRows(f);
      const authority = (await cell.pool.query("SELECT * FROM elp210_candidate.authority")).rows;
      expect(await cell.service(recover, h.trust).acceptTsReceipt(proof)).toEqual({ receipt: accepted.receipt, replayed: true });
      expect(recover).not.toHaveBeenCalled(); expect(h.calls()).toBe(0); expect(await authorityRows(f)).toEqual(before);
      expect((await cell.pool.query("SELECT * FROM elp210_candidate.authority")).rows).toEqual(authority);
      expect((await cell.pool.query("SELECT count(*)::int AS n FROM elp210_candidate.mutations")).rows[0].n).toBe(0);
      expect((await cell.pool.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1", [lease.lease_id])).rows[0].phase).toBe("UNKNOWN");
      const changed = f.trust.seal({ ...fact, payload_digest: accessDigest("TEST_ONLY-changed-history") }, false);
      await expect(cell.service(recover, h.trust).acceptTsReceipt(changed))
        .rejects.toMatchObject({ code: "RECEIPT_PAYLOAD_CONFLICT", status: 409 });
      expect(await authorityRows(f)).toEqual(before); expect(recover).not.toHaveBeenCalled();
    });
  });

  it("ELP2-10 lost qualified-provider release ACK preserves FINISHED and retry cannot double apply", async () => {
    const f = await fixture(), { submitted } = await business(f), fact = await tsFact(f, submitted), proof = f.trust.seal(fact);
    await withCurrentHuman(f, manager, async cell => {
      const h = delegatedTrust(f, cell.pool, fact, { release: async () => {
        expect((await storedGrant(submitted.receipt.grant_id!)).ts_receipt?.receipt_id).toBe(fact.receipt_id);
        expect((await cell.pool.query("SELECT state FROM elp210_candidate.mutations")).rows).toEqual([{ state: "FINISHED" }]);
        throw new Error("TEST_ONLY-provider-release-ACK-lost");
      } });
      await expect(cell.service(async () => undefined, h.trust).acceptTsReceipt(proof))
        .rejects.toMatchObject({ code: "ACCESS_RETRY_REQUIRED", status: 503 });
      const committed = await authorityRows(f), replay = await cell.service(async () => undefined, h.trust).acceptTsReceipt(proof);
      expect(replay).toMatchObject({ replayed: true, receipt: { outcome: "TS_APPLIED" } });
      expect(await authorityRows(f)).toEqual(committed); expect(h.calls()).toBe(1); expect(h.releases()).toBe(1); expect(h.held()).toBe(0);
    });
  });

  it("ELP2-10 lost physical COMMIT ACK cannot turn a finished delegated receipt into REFUSED or reapply", async () => {
    const f = await fixture(), { submitted } = await business(f), fact = await tsFact(f, submitted), proof = f.trust.seal(fact);
    await withCurrentHuman(f, manager, async cell => {
      const lost = new Error("TEST_ONLY-delegated-COMMIT-ACK-lost"), h = delegatedTrust(f, cell.pool, fact);
      const original = AccessRepository.prototype.event; let restored = false;
      const event = vi.spyOn(AccessRepository.prototype, "event").mockImplementationOnce(async function (this: AccessRepository, input) {
        await original.call(this, input);
        expect(input.operation).toBe("TS_RECEIPT");
        const db = this.db as import("pg").PoolClient, originalQuery = db.query, hadOwn = Object.hasOwn(db, "query");
        const invoke = (...args: unknown[]) => (originalQuery as (...args: unknown[]) => Promise<unknown>).apply(db, args);
        const restore = () => { if (hadOwn) db.query = originalQuery; else Reflect.deleteProperty(db, "query"); restored = db.query === originalQuery; };
        db.query = (async (...args: unknown[]) => {
          const command = typeof args[0] === "string" ? args[0] : (args[0] as { text?: unknown })?.text;
          if (command === "COMMIT") { try { await invoke(...args); throw lost; } finally { restore(); } }
          if (command === "ROLLBACK") { try { return await invoke(...args); } finally { restore(); } }
          return invoke(...args);
        }) as typeof db.query;
      });
      try {
        await expect(cell.service(async () => undefined, h.trust).acceptTsReceipt(proof)).rejects.toBe(lost);
        expect(restored).toBe(true);
        expect((await cell.pool.query("SELECT state FROM elp210_candidate.mutations")).rows).toEqual([{ state: "FINISHED" }]);
        const committed = await authorityRows(f);
        expect((await cell.service(async () => undefined, h.trust).acceptTsReceipt(proof)).replayed).toBe(true);
        expect(await authorityRows(f)).toEqual(committed); expect(h.calls()).toBe(1); expect(h.releases()).toBe(1);
      } finally { event.mockRestore(); }
    });
  });

  for(const operation of ["propose","revoke"] as const)it(`ELP2-10 ${operation}: signed source terminal proof gates the actual writer, restart and immutable replay`,async()=>{
    const f=await fixture(),request=f.change(),key=next("coordinated-access"),by=operation==="propose"?manager:owner;
    const preview=await f.service.preview(actor(manager),f.workspace,request);
    const existing=operation==="revoke"?await f.submit(request):null,before=await state(f);
    await withCurrentHuman(f,by,async cell=>{
      const lease=await cell.enter();let allowTerminal=false,calls=0;
      const recover:CurrentHumanRecoveryPort["recover"]=async attempt=>{
        calls++;expect(attempt).toMatchObject({lease_id:lease.lease_id,workspace_id:f.workspace,
          workload_id:cell.binding.workload_id,subject:by.user.userId,session_id:by.session.sessionId});
        if(!allowTerminal)return {phase:"COMMITTED",TEST_ONLY_untrusted_ack:true};
        return cell.resolve(attempt.lease_id);
      };
      const execute=(service:ExecutionAccessService)=>operation==="propose"
        ?service.propose(actor(by),f.workspace,request,preview.preview_digest,key)
        :service.revoke(actor(by),f.workspace,existing!.receipt.grant_id!,f.policy.revision,existing!.receipt.grant_revision!,key);
      await expect(execute(cell.service(recover))).rejects.toMatchObject({code:"ACCESS_RETRY_REQUIRED",status:503,
        cause:{code:"CURRENT_HUMAN_MUTATION_PENDING"}});
      expect(calls).toBe(1);expect(await state(f)).toEqual(before);
      expect((await cell.pool.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1",[lease.lease_id])).rows[0].phase).toBe("ENTERED");
      expect((await cell.pool.query("SELECT state FROM elp210_candidate.mutations")).rows).toEqual([{state:"PENDING"}]);

      // A changed body on the same key is a permanent conflict, not a false
      // pending503 and never a new grant/revoke. The exact preview is bound too.
      const changed={...request,reason:"TEST_ONLY changed request on existing intent"};
      const changedPreview=accessDigest({actor_user_id:by.user.userId,workspace_id:f.workspace,change:canonicalChange(changed)});
      await expect(operation==="propose"
        ?cell.service(recover).propose(actor(by),f.workspace,changed,changedPreview,key)
        :cell.service(recover).revoke(actor(by),f.workspace,existing!.receipt.grant_id!,f.policy.revision,
          existing!.receipt.grant_revision!,key,"TEST_ONLY changed revoke request"))
        .rejects.toMatchObject({code:"IDEMPOTENCY_KEY_PAYLOAD_CONFLICT",status:409});
      if(operation==="propose")await expect(cell.service(recover).propose(actor(by),f.workspace,request,accessDigest("TEST_ONLY wrong preview"),key))
        .rejects.toMatchObject({code:"POLICY_REVISION_CONFLICT",status:409});
      expect(calls).toBe(1);expect(await state(f)).toEqual(before);

      // A new service/coordinator retries the original durable request. Only
      // Core's genuine signed terminal resolution permits its writer.
      allowTerminal=true;
      const applied=await execute(cell.service(recover));
      expect(applied).toMatchObject({replayed:false,receipt:{outcome:operation==="propose"?"APP_APPLIED":"REVOKED"}});
      expect(calls).toBe(2);
      expect((await cell.pool.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1",[lease.lease_id])).rows[0].phase).toBe("COMMITTED");
      expect((await cell.pool.query("SELECT drain_id FROM elp210_candidate.authority WHERE singleton")).rows[0].drain_id).toBeNull();
      expect((await cell.pool.query("SELECT state FROM elp210_candidate.mutations")).rows).toEqual([{state:"FINISHED"}]);
      const after=await state(f);
      expect(after).toEqual({proposals:before.proposals+(operation==="propose"?1:0),
        grants:before.grants+(operation==="propose"?1:0),events:before.events+1});
      expect(await execute(cell.service(recover))).toEqual({receipt:applied.receipt,replayed:true});
      expect(await state(f)).toEqual(after);expect(calls).toBe(2);
      if(operation==="propose"){
        await cell.service(recover).revoke(actor(owner),f.workspace,applied.receipt.grant_id!,f.policy.revision,
          applied.receipt.grant_revision!,next("revoke-coordinated-output"));
        expect(await execute(cell.service(recover))).toEqual({receipt:applied.receipt,replayed:true});
        expect((await storedGrant(applied.receipt.grant_id!)).revoked_at_ms).not.toBeNull();
      }
      const event=(await cell.pool.query("SELECT receipt FROM portal_access_policy_events WHERE event_id=$1",[applied.receipt.operation_id])).rows[0];
      expect(event.receipt).toEqual(applied.receipt);
    });
  });

  it.each(["ceiling","target","step-up","preview","cas"] as const)("ELP2-10 ineligible %s cannot open a global access drain",async axis=>{
    const account=await active(`coordinator-${axis}`),f=await fixture(account),request=f.change(),key=next("pre-drain-refusal");
    const preview=await f.service.preview(actor(account),f.workspace,request);
    if(axis==="ceiling")await new AccessRepository(ctx.pool).saveGrant({...f.managerRoot,revision:next("revoked-pre-drain"),revoked_at_ms:Date.now()});
    if(axis==="target")await ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2",[f.workspace,request.subject_user_id]);
    if(axis==="step-up")await ctx.pool.query("UPDATE owner_step_up_grants SET revoked_at=clock_timestamp() WHERE session_id=$1",[account.session.sessionId]);
    if(axis==="cas")request.expected_ceiling_revision=next("stale-ceiling");
    const expected=axis==="ceiling"?{code:"DELEGATION_CEILING_EXCEEDED",status:403}:axis==="target"?{code:"ACCESS_RESOURCE_NOT_FOUND",status:404}:
      axis==="step-up"?{code:"STEP_UP_REQUIRED",status:403}:axis==="cas"?{code:"GRANT_REVISION_CONFLICT",status:409}:{code:"POLICY_REVISION_CONFLICT",status:409};
    const before=await state(f);
    await withCurrentHuman(f,account,async cell=>{
      const recover=vi.fn(async()=>null);
      await expect(cell.service(recover).propose(actor(account),f.workspace,request,
        axis==="preview"?accessDigest("TEST_ONLY stale preview"):preview.preview_digest,key)).rejects.toMatchObject(expected);
      expect(recover).not.toHaveBeenCalled();expect(await state(f)).toEqual(before);
      expect((await cell.pool.query("SELECT 1 FROM elp210_candidate.mutations")).rowCount).toBe(0);
      expect((await cell.pool.query("SELECT drain_id FROM elp210_candidate.authority WHERE singleton")).rows[0].drain_id).toBeNull();
    });
  });

  it("ELP2-10 access actor expiry during signed recovery refuses final apply and clears only the terminal drain",async()=>{
    const account=await active("coordinator-expiring-actor"),f=await fixture(account),request=f.change();
    const preview=await f.service.preview(actor(account),f.workspace,request),before=await state(f);
    await withCurrentHuman(f,account,async cell=>{
      // Before a lease exists, shortening this fixture session is an ordinary
      // authority update. Time expiry itself does not forge source rollback.
      const deadline=(await cell.pool.query<{expires_at:Date}>(`UPDATE auth_sessions
        SET idle_expires_at=clock_timestamp()+interval '1.5 seconds' WHERE session_id=$1 RETURNING idle_expires_at AS expires_at`,[account.session.sessionId])).rows[0].expires_at;
      const lease=await cell.enter();let calls=0;
      const recover:CurrentHumanRecoveryPort["recover"]=async()=>{
        calls++;await cell.pool.query("SELECT pg_sleep(GREATEST(0,extract(epoch FROM ($1::timestamptz-clock_timestamp())))+0.025)",[deadline]);
        return cell.resolve(lease.lease_id);
      };
      await expect(cell.service(recover).propose(actor(account),f.workspace,request,preview.preview_digest,next("expiry-coordinated")))
        .rejects.toMatchObject({code:"CURRENT_ACTOR_AUTHORITY_REQUIRED",status:403});
      expect(calls).toBe(1);expect(await state(f)).toEqual(before);
      expect((await cell.pool.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1",[lease.lease_id])).rows[0].phase).toBe("COMMITTED");
      expect((await cell.pool.query("SELECT state FROM elp210_candidate.mutations")).rows).toEqual([{state:"REFUSED"}]);
      expect((await cell.pool.query("SELECT drain_id FROM elp210_candidate.authority WHERE singleton")).rows[0].drain_id).toBeNull();
    });
  });

  it("ELP2-10 coordinated keys remain distinct across operation and workspace",async()=>{
    const f=await fixture(),other=await fixture(),key=next("shared-coordinator-key"),request=f.change(),otherRequest=other.change();
    const preview=await f.service.preview(actor(manager),f.workspace,request),otherPreview=await other.service.preview(actor(manager),other.workspace,otherRequest);
    await withCurrentHuman(f,manager,async cell=>{
      const recover=vi.fn(async()=>null),service=cell.service(recover);
      const applied=await service.propose(actor(manager),f.workspace,request,preview.preview_digest,key);
      const otherApplied=await cell.service(recover,other.trust).propose(actor(manager),other.workspace,otherRequest,otherPreview.preview_digest,key);
      const revoked=await service.revoke(actor(owner),f.workspace,applied.receipt.grant_id!,f.policy.revision,applied.receipt.grant_revision!,key);
      expect(otherApplied.receipt.operation_id).not.toBe(applied.receipt.operation_id);
      expect(revoked.receipt.outcome).toBe("REVOKED");expect(recover).not.toHaveBeenCalled();
      expect((await cell.pool.query("SELECT family,state FROM elp210_candidate.mutations")).rows).toEqual([
        {family:"EXECUTION_ACCESS",state:"FINISHED"},{family:"EXECUTION_ACCESS",state:"FINISHED"},{family:"EXECUTION_ACCESS",state:"FINISHED"},
      ]);
    });
  });
  // C3 actual Nest/Fastify + isolated PostgreSQL. Add within existing describe,
  // reusing its real auth/workspace/TEST_ONLY trust fixture. NOT_RUN draft.
  async function c3AcceptedPortfolioRead(f: Fixture, by: Account) {
    const submitted = await f.submit(f.change({subject_user_id:by.user.userId,action:"portfolio.read",
      selector:{kind:"EXPLICIT_RESOURCE_SET",resource_kind:"PORTFOLIO",ids:["TEST_ONLY-portfolio-1"]}}));
    await f.service.acceptTsReceipt(f.trust.seal(await tsFact(f, submitted)));
    return submitted;
  }
  it("C3 own non-admin row eligibility is current/advisory, not a family or command permit", async () => {
    const f = await fixture(), { submitted } = await business(f);
    await f.service.acceptTsReceipt(f.trust.seal(await tsFact(f, submitted)));
    const before = await state(f);
    await withHttp(f.service, async app => {
      const http = app.getHttpAdapter().getInstance();
      const query = new URLSearchParams({ workspace_id: f.workspace, environment: "paper",
        resource_kind: "PORTFOLIO", resource_id: "TEST_ONLY-portfolio-1", actions: "portfolio.read,capital.top_up,audit.read" });
      const response = await http.inject({ method: "GET", url: `${BASE}/eligibility?${query}`,
        headers: { cookie: cookie(researcher.session) } });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toContain("no-store");
      expect(response.json()).toMatchObject({ schema_version: "portal.self-eligibility.v1", current_only: true, advisory_only: true,
        actions: [ { action: "portfolio.read", permission: "ALLOWED", authority_mode: "LEGACY_COMPATIBILITY",
          grant_ref: submitted.receipt.grant_id, reason_class: "FAMILY_CHECK_REQUIRED", command_readiness: "NOT_CHECKED" },
        { action: "capital.top_up", permission: "UNAVAILABLE", grant_ref: null },
        { action: "audit.read", permission: "UNAVAILABLE", grant_ref: null } ] });
      const navigation = await http.inject({ method: "GET", url: `${BASE}/self-navigation?workspace_id=${f.workspace}&environment=paper`,
        headers: { cookie: cookie(researcher.session) } });
      expect(navigation.statusCode).toBe(200);
      expect(navigation.json()).toMatchObject({ self_entry: { permission: "ALLOWED", mode: "SELF_ONLY", route: null,
        consumer_state: "AWAITING_CONSUMER_ROUTER" }, features: [ { feature: "EXECUTION_PORTFOLIOS", state: "ENTERABLE" },
        { feature: "EXECUTION_ACCOUNTS_BINDINGS", state: "HIDDEN" }, { feature: "EXECUTION_OPERATIONS", state: "HIDDEN" },
        { feature: "EXECUTION_BLOTTER", state: "HIDDEN" } ] });
      expect(JSON.stringify(navigation.json())).not.toContain(submitted.receipt.grant_id);
      for (const id of ["TEST_ONLY-portfolio-2", "TEST_ONLY-no-row"]) {
        query.set("resource_id", id); query.set("actions", "portfolio.read");
        const unavailable = await http.inject({ method: "GET", url: `${BASE}/eligibility?${query}`, headers: { cookie: cookie(researcher.session) } });
        expect(unavailable.statusCode).toBe(200);
        expect(unavailable.json().actions).toEqual([expect.objectContaining({ permission: "UNAVAILABLE", grant_ref: null,
          reason_class: "NO_CURRENT_PERMISSION" })]);
      }
      query.set("resource_id", "TEST_ONLY-portfolio-1");
      const byAdmin = await http.inject({ method: "GET", url: `${BASE}/eligibility?${query}`, headers: { cookie: cookie(peer.session) } });
      expect(byAdmin.statusCode).toBe(200);
      expect(byAdmin.json().actions[0].permission).toBe("UNAVAILABLE");
    });
    expect(await state(f)).toEqual(before);
  });

  it("C3 own entry remains available when policy is pending, without widening the owner administration page", async () => {
    const f = await fixture(), defaultService = new ExecutionAccessService(ctx.pool, auth);
    await withHttp(defaultService, async app => {
      const http = app.getHttpAdapter().getInstance();
      const headers = { cookie: cookie(researcher.session) };
      const nav = await http.inject({ method: "GET", url: `${BASE}/self-navigation?workspace_id=${f.workspace}&environment=paper`, headers });
      expect(nav.statusCode).toBe(200);
      expect(nav.json().self_entry).toMatchObject({ permission: "ALLOWED", mode: "SELF_ONLY", route: null });
      expect(nav.json().features.every((row: {state:string}) => row.state === "HIDDEN")).toBe(true);
      const read = await http.inject({ method: "GET", url: `${BASE}/eligibility?workspace_id=${f.workspace}&environment=paper&resource_kind=PORTFOLIO&resource_id=TEST_ONLY-portfolio-1&actions=portfolio.read`, headers });
      expect(read.json().actions[0]).toMatchObject({ permission: "UNAVAILABLE", reason_class: "POLICY_PENDING" });
    });
  });

  it("C3 GET schemas reject actor, as-of, repeated and ambiguous query fields; missing session still denies", async () => {
    const f = await fixture(), before = await state(f);
    await withHttp(f.service, async app => {
      const http = app.getHttpAdapter().getInstance();
      const base = `${BASE}/eligibility?workspace_id=${f.workspace}&environment=paper&resource_kind=PORTFOLIO&resource_id=TEST_ONLY-portfolio-1&actions=portfolio.read`;
      const unauthenticated = await http.inject({ method: "GET", url: base });
      expect(unauthenticated.statusCode).toBe(401);
      expect(unauthenticated.headers["cache-control"]).toBe("private, no-store");
      for (const suffix of ["&actor_user_id=TEST_ONLY-spoof", "&subject_user_id=TEST_ONLY-spoof", "&as_of_ms=", "&environment=live",
        "&actions=capital.top_up", "&resource_id=other", "&policy=REVIEWED", "&actions[]=portfolio.read"]) {
        const response = await http.inject({ method: "GET", url: base + suffix, headers: { cookie: cookie(researcher.session) } });
        expect(response.statusCode, suffix).toBe(400);
        expect(response.headers["cache-control"]).toBe("private, no-store");
        expect(response.json().error.code).toBe("ACCESS_INPUT_INVALID");
      }
      const invalid = await http.inject({ method: "GET", url: base.replace("actions=portfolio.read", "actions=*"), headers: { cookie: cookie(researcher.session) } });
      expect(invalid.statusCode).toBe(400);
    });
    expect(await state(f)).toEqual(before);
  });

  it.each(["revoke", "membership", "disable", "generation"] as const)("C3 %s during source await cannot expose stale eligibility", async fault => {
    const by = fault === "disable" || fault === "generation" ? await active("c3-ephemeral") : researcher;
    const f = await fixture();
    if (by !== researcher) await ctx.pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'MEMBER')", [f.workspace, by.user.userId]);
    const submitted = await c3AcceptedPortfolioRead(f, by);
    const original = f.trust.relations.bind(f.trust); let changed = false;
    vi.spyOn(f.trust, "relations").mockImplementation(async (id, ws) => {
      const value = await original(id, ws);
      if (!changed) {
        changed = true;
        if (fault === "revoke") {
          const grant = await storedGrant(submitted.receipt.grant_id!);
          await new AccessRepository(ctx.pool).saveGrant({ ...grant, revoked_at_ms: Date.now(), revision: next("C3-revoked") });
        } else if (fault === "membership") await ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [f.workspace, by.user.userId]);
        else if (fault === "disable") await ctx.pool.query("UPDATE portal_users SET status='DISABLED' WHERE user_id=$1", [by.user.userId]);
        else await ctx.pool.query("UPDATE portal_users SET session_version=session_version+1 WHERE user_id=$1", [by.user.userId]);
      }
      return value;
    });
    try {
      await withHttp(f.service, async app => {
        const response = await app.getHttpAdapter().getInstance().inject({ method: "GET",
          url: `${BASE}/eligibility?workspace_id=${f.workspace}&environment=paper&resource_kind=PORTFOLIO&resource_id=TEST_ONLY-portfolio-1&actions=portfolio.read`,
          headers: { cookie: cookie(by.session) } });
        expect(response.statusCode).toBe(fault === "revoke" ? 409 : fault === "membership" ? 404 : 403);
        expect(changed).toBe(true); // The real source-await mutation was reached.
        expect(response.headers["cache-control"]).toBe("private, no-store");
        expect(response.json()).not.toHaveProperty("actions");
      });
    } finally { vi.mocked(f.trust.relations).mockRestore(); }
  });

  it("C3 source refusal is redacted and membership loss wins over its held error", async () => {
    const f = await fixture();
    await c3AcceptedPortfolioRead(f, researcher);
    vi.spyOn(f.trust, "relations").mockImplementation(async () => { throw new Error("TEST_ONLY-private-adapter-detail"); });
    try {
      await withHttp(f.service, async app => {
        const http = app.getHttpAdapter().getInstance();
        const url = `${BASE}/self-navigation?workspace_id=${f.workspace}&environment=paper`;
        const initial = await http.inject({ method: "GET", url, headers: { cookie: cookie(researcher.session) } });
        expect(initial.statusCode).toBe(503);
        expect(initial.json().error.code).toBe("SOURCE_RELATION_NOT_QUALIFIED");
        expect(initial.body).not.toContain("private-adapter");
        vi.mocked(f.trust.relations).mockImplementation(async () => {
          await ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [f.workspace, researcher.user.userId]);
          throw new Error("TEST_ONLY-private-adapter-detail");
        });
        const denied = await http.inject({ method: "GET", url, headers: { cookie: cookie(researcher.session) } });
        expect(denied.statusCode).toBe(404);
        expect(denied.body).not.toContain("private-adapter");
      });
    } finally { vi.mocked(f.trust.relations).mockRestore(); }
  });

  it("C3 uses the renewed genuine Core lease after its last adapter await", async () => {
    const by = await active("c3-renewal"), f = await fixture();
    await ctx.pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'MEMBER')", [f.workspace, by.user.userId]);
    await c3AcceptedPortfolioRead(f, by);
    // Direct service entry avoids the HTTP guard's ordinary idle refresh. The
    // authority, session, lease and renewal are still actual PostgreSQL rows.
    await ctx.pool.query("UPDATE auth_sessions SET idle_expires_at=clock_timestamp()+interval '500 milliseconds' WHERE session_id=$1", [by.session.sessionId]);
    const original = f.trust.relations.bind(f.trust); let renewed = false;
    vi.spyOn(f.trust, "relations").mockImplementation(async (id, ws) => {
      if (!renewed) {
        renewed = true;
        await ctx.pool.query("UPDATE auth_sessions SET idle_expires_at=clock_timestamp()+interval '30 seconds' WHERE session_id=$1", [by.session.sessionId]);
        await ctx.pool.query("SELECT pg_sleep(0.6)");
      }
      return original(id, ws);
    });
    try {
      const result = await f.service.selfNavigation(actor(by), {workspace_id:f.workspace,environment:"paper"});
      expect(renewed).toBe(true);
      expect(result.self_entry.permission).toBe("ALLOWED");
      const lease = await ctx.pool.query("SELECT idle_expires_at>clock_timestamp() AS valid FROM auth_sessions WHERE session_id=$1", [by.session.sessionId]);
      expect(lease.rows[0].valid).toBe(true);
    } finally { vi.mocked(f.trust.relations).mockRestore(); }
  });

  it("C3 actual grant revocation wins409 over a held private source error", async () => {
    const f = await fixture(), {submitted} = await business(f);
    await f.service.acceptTsReceipt(f.trust.seal(await tsFact(f, submitted)));
    vi.spyOn(f.trust, "relations").mockImplementation(async () => {
      const grant = await storedGrant(submitted.receipt.grant_id!);
      await new AccessRepository(ctx.pool).saveGrant({...grant,revoked_at_ms:Date.now(),revision:next("C3-revoked-error")});
      throw new Error("TEST_ONLY-private-held-error");
    });
    try {
      await expect(f.service.selfNavigation(actor(researcher), {workspace_id:f.workspace,environment:"paper"}))
        .rejects.toMatchObject({code:"ACCESS_RETRY_REQUIRED",status:409});
    } finally { vi.mocked(f.trust.relations).mockRestore(); }
  });

  it("C3 no own entity grant never invokes an unrelated source provider for navigation or eligibility", async () => {
    const f = await fixture(), before = await state(f);
    const relations = vi.spyOn(f.trust, "relations").mockImplementation(async () => {
      throw new Error("TEST_ONLY-unrelated-provider-must-not-run");
    });
    try {
      await withHttp(f.service, async app => {
        const http = app.getHttpAdapter().getInstance(), headers = { cookie: cookie(researcher.session) };
        const navigation = await http.inject({ method: "GET",
          url: `${BASE}/self-navigation?workspace_id=${f.workspace}&environment=paper`, headers });
        expect(navigation.statusCode).toBe(200);
        expect(navigation.headers["cache-control"]).toBe("private, no-store");
        expect(navigation.json().self_entry).toMatchObject({ permission: "ALLOWED", mode: "SELF_ONLY" });
        expect(navigation.json().features.every((row: {state:string}) => row.state === "HIDDEN")).toBe(true);
        const eligibility = await http.inject({ method: "GET", headers,
          url: `${BASE}/eligibility?workspace_id=${f.workspace}&environment=paper&resource_kind=PORTFOLIO&resource_id=TEST_ONLY-no-row&actions=portfolio.read` });
        expect(eligibility.statusCode).toBe(200);
        expect(eligibility.headers["cache-control"]).toBe("private, no-store");
        expect(eligibility.json().actions).toEqual([expect.objectContaining({ permission: "UNAVAILABLE", grant_ref: null })]);
        expect(relations).not.toHaveBeenCalled();
      });
      expect(await state(f)).toEqual(before);
    } finally { relations.mockRestore(); }
  });

  it("C3 held source error crosses the genuine final Core actor lease and yields403, never its stale503", async () => {
    const f = await fixture(); await c3AcceptedPortfolioRead(f, researcher);
    // Spy wraps the ACTUAL capture: no fabricated positive context, fingerprint,
    // session or lease. Only physical Date.now crosses AFTER final DB capture.
    const capturePort = f.service as unknown as { captureSelfProjectionContext(by:ReturnType<typeof actor>,workspace:string):
      Promise<{now:number;lease_until_ms:number}> };
    const originalCapture = capturePort.captureSelfProjectionContext.bind(f.service), originalNow = Date.now.bind(Date);
    let captures = 0, crossed = false, lease = 0;
    const trace: string[] = [];
    const capture = vi.spyOn(capturePort, "captureSelfProjectionContext").mockImplementation(async (by, workspace) => {
      const fact = await originalCapture(by, workspace);
      captures++; trace.push("core:" + captures);
      if (captures === 2) { lease = fact.lease_until_ms; crossed = true; }
      return fact;
    });
    const now = vi.spyOn(Date, "now").mockImplementation(() => {
      if (!crossed) return originalNow();
      trace.push("terminal-clock"); return lease;
    });
    const relations = vi.spyOn(f.trust, "relations").mockImplementation(async () => {
      trace.push("source-error"); throw new Error("TEST_ONLY-private-held-source-error");
    });
    try {
      await withHttp(f.service, async app => {
        const response = await app.getHttpAdapter().getInstance().inject({ method: "GET",
          url: `${BASE}/self-navigation?workspace_id=${f.workspace}&environment=paper`,
          headers: { cookie: cookie(researcher.session) } });
        expect(response.statusCode).toBe(403);
        expect(response.headers["cache-control"]).toBe("private, no-store");
        expect(response.json().error.code).toBe("CURRENT_ACTOR_AUTHORITY_REQUIRED");
        expect(response.json()).not.toHaveProperty("features");
        expect(response.body).not.toContain("private-held-source");
        expect(relations).toHaveBeenCalledOnce(); expect(captures).toBe(2);
        expect(trace.indexOf("core:2")).toBeGreaterThan(trace.indexOf("source-error"));
        expect(trace.indexOf("terminal-clock")).toBeGreaterThan(trace.indexOf("core:2"));
      });
    } finally { now.mockRestore(); capture.mockRestore(); relations.mockRestore(); }
  });

  // Same disposable PG/Nest harness. TEST_ONLY history/grants are explicit
  // routing vectors only, never installed native/provider authority.
  async function c3ModeWorkspace() {
    const workspace = next("mode-workspace");
    await ctx.pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,$2,$3)",
      [workspace, "TEST_ONLY mode workspace", owner.user.userId]);
    for (const account of [owner, researcher]) await ctx.pool.query(
      "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,$3)",
      [workspace, account.user.userId, account === owner ? "OWNER" : "MEMBER"]);
    return workspace;
  }

  it("C3 HTTP exposes genuine no-policy LEGACY and installed SCOPED modes without granting a menu", async () => {
    const f = await fixture(), legacyWorkspace = await c3ModeWorkspace();
    const relations = vi.spyOn(f.trust, "relations");
    try {
      await withHttp(f.service, async app => {
        for (const [workspace, mode] of [[legacyWorkspace, "LEGACY_COMPATIBILITY"], [f.workspace, "SCOPED_V2"]]) {
          const response = await app.getHttpAdapter().getInstance().inject({ method:"GET",
            url:`${BASE}/self-navigation?workspace_id=${workspace}&environment=paper`, headers:{cookie:cookie(researcher.session)} });
          expect(response.statusCode).toBe(200);
          expect(response.headers["cache-control"]).toBe("private, no-store");
          expect(response.json().current_read_mode).toBe(mode);
          expect(response.json().features.every((row:{state:string})=>row.state==="HIDDEN")).toBe(true);
        }
      });
      expect(relations).not.toHaveBeenCalled();
    } finally { relations.mockRestore(); }
  });

  it("C3 deleting an installed policy and its root grants cannot erase sticky event history", async () => {
    const f = await fixture();
    await ctx.pool.query("DELETE FROM portal_access_policy_state WHERE workspace_id=$1", [f.workspace]);
    // Fresh fixture has no delegated children/proposals. Immutable events are
    // deliberately NOT deleted or disabled, preserving genuine install history.
    await ctx.pool.query("DELETE FROM portal_access_grants_v2 WHERE workspace_id=$1", [f.workspace]);
    const rows = await ctx.pool.query("SELECT count(*)::int AS n FROM portal_access_policy_events WHERE workspace_id=$1", [f.workspace]);
    expect(rows.rows[0].n).toBeGreaterThan(0);
    const result = await f.service.selfNavigation(actor(researcher), {workspace_id:f.workspace,environment:"paper"});
    expect(result.current_read_mode).toBe("SCOPED_V2");
    expect(result.features.every(row=>row.state==="HIDDEN")).toBe(true);
  });

  it("C3 a stored grant alone pins SCOPED routing without becoming a menu permission", async () => {
    const f = await fixture(), workspace = await c3ModeWorkspace(), now = Date.now();
    const grant:ScopedAccessGrant = {grant_id:next("mode-grant"),workspace_id:workspace,subject_user_id:researcher.user.userId,
      issued_by:owner.user.userId,action:"access.read",effect:"ALLOW",selector:{kind:"EXPLICIT_RESOURCE_SET",resource_kind:"USER",ids:[researcher.user.userId]},
      environments:["paper"],valid_from_ms:now-1,valid_until_ms:now+60000,parent_grant_id:null,revision:next("mode-revision"),
      policy_revision:next("non-installed-policy"),revoked_at_ms:null,delegable_actions:[],requires_ts_acceptance:false,ts_receipt:null,field_policy_ref:null};
    await new AccessRepository(ctx.pool).saveGrant(grant,true);
    const result = await f.service.selfNavigation(actor(researcher), {workspace_id:workspace,environment:"paper"});
    expect(result.current_read_mode).toBe("SCOPED_V2");
    expect(result.features.every(row=>row.state==="HIDDEN")).toBe(true);
    expect((await ctx.pool.query("SELECT count(*)::int AS n FROM portal_access_policy_events WHERE workspace_id=$1",[workspace])).rows[0].n).toBe(0);
  });

  it("C3 mode-only history transition fences self projection without changing the shared Core fingerprint", async () => {
    const f = await fixture(), workspace = await c3ModeWorkspace();
    type Captured={authority_fingerprint:string;self_projection_fingerprint:string;current_read_mode:string};
    const capturePort=f.service as unknown as {captureSelfProjectionContext(by:AccessActor,workspace:string):Promise<Captured>};
    const original=capturePort.captureSelfProjectionContext.bind(f.service), facts:Captured[]=[];
    const capture=vi.spyOn(capturePort,"captureSelfProjectionContext").mockImplementation(async(by,ws)=>{
      const fact=await original(by,ws); facts.push(fact);
      if(facts.length===1){
        const id=next("TEST_ONLY-mode-event");
        await new AccessRepository(ctx.pool).event({event_id:id,workspace_id:workspace,actor_user_id:owner.user.userId,
          subject_user_id:researcher.user.userId,operation:"DENIED",key_digest:null,request_digest:accessDigest(id),
          policy_revision:null,grant_id:null,proposal_id:null,source:null,source_receipt_id:null,before_fact:null,after_fact:null,
          receipt:{schema_version:"portal.access-operation.v1",operation_id:id,proposal_id:null,grant_id:null,outcome:"DENIED",
            http_status:403,reason_code:"TEST_ONLY_NOT_AUTHORITY",policy_revision:null,grant_revision:null,decided_at_ms:Date.now(),ts_authority:"NOT_REQUIRED"}});
      }
      return fact;
    });
    const relations=vi.spyOn(f.trust,"relations");
    try {
      await expect(f.service.selfNavigation(actor(researcher),{workspace_id:workspace,environment:"paper"}))
        .rejects.toMatchObject({code:"ACCESS_RETRY_REQUIRED",status:409});
      expect(facts).toHaveLength(2);
      expect(facts.map(fact=>fact.current_read_mode)).toEqual(["LEGACY_COMPATIBILITY","SCOPED_V2"]);
      expect(facts[0].authority_fingerprint).toBe(facts[1].authority_fingerprint);
      expect(facts[0].self_projection_fingerprint).not.toBe(facts[1].self_projection_fingerprint);
      expect(relations).not.toHaveBeenCalled();
    } finally {capture.mockRestore();relations.mockRestore();}
  });

  it.each(["policy-body","policy-error","membership-body","membership-error","actor-body","actor-error"] as const)(
    "C3 %s across an actual source await releases neither stale navigation nor a held source error",async fault=>{
      const f=await fixture(),by=await active("mode-fence");
      await ctx.pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'MEMBER')",[f.workspace,by.user.userId]);
      await c3AcceptedPortfolioRead(f,by);
      const original=f.trust.relations.bind(f.trust);let changed=false;
      const relations=vi.spyOn(f.trust,"relations").mockImplementation(async(id,ws)=>{
        const value=await original(id,ws);
        if(!changed){changed=true;
          if(fault.startsWith("policy"))await ctx.pool.query("DELETE FROM portal_access_policy_state WHERE workspace_id=$1",[f.workspace]);
          else if(fault.startsWith("membership"))await ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2",[f.workspace,by.user.userId]);
          else await ctx.pool.query("UPDATE auth_sessions SET state='REVOKED',revoked_at=clock_timestamp(),revoke_reason='TEST_ONLY_MODE_FENCE' WHERE session_id=$1",[by.session.sessionId]);
        }
        if(fault.endsWith("error"))throw new Error("TEST_ONLY-private-mode-provider-error");
        return value;
      });
      try{await withHttp(f.service,async app=>{
        const response=await app.getHttpAdapter().getInstance().inject({method:"GET",
          url:`${BASE}/self-navigation?workspace_id=${f.workspace}&environment=paper`,headers:{cookie:cookie(by.session)}});
        expect(changed).toBe(true);
        expect(response.statusCode).toBe(fault.startsWith("policy")?409:fault.startsWith("membership")?404:403);
        expect(response.headers["cache-control"]).toBe("private, no-store");
        expect(response.json()).not.toHaveProperty("features");
        expect(response.json()).not.toHaveProperty("current_read_mode");
        expect(response.body).not.toContain("private-mode-provider");
      });}finally{relations.mockRestore();}
    });

});
