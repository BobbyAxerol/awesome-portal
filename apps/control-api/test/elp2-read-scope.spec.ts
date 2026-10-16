/**
 * ELP2-04 server-minted scopes, real disposable PostgreSQL authority fences.
 * TEST_DATABASE_URL is the only database target. Policy approval, accepted TS
 * membership, resource population and field policy are synthetic TEST_ONLY
 * dependencies, not qualification of any current producer or runtime profile.
 * No public listener, remote connection, shared volume or browser is used.
 */
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AdminService } from "../src/admin/admin.service";
import { AuthService } from "../src/auth/auth.service";
import type { AuthSession, PortalUser, VerifiedAccessIdentity } from "../src/domain";
import type { AccessAction, AccessResource, ReviewedAccessPolicy, ResourceSelector,
  ScopedAccessGrant } from "../src/execution-v2/access.contract";
import { accessDigest, type AccessRelations } from "../src/execution-v2/access-policy";
import { AccessRepository } from "../src/execution-v2/access.repository";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import { ScopedReplayCursorCodec,ScopedReplayHub,scopedNoticeGuard } from "../src/execution-v2/realtime";
import type { ScopedRealtimeFrame } from "../src/execution-v2/realtime.contract";
import type { AccessTrustProvider, ReviewedPolicyArtifact } from "../src/execution-v2/access-trust";
import { readPublication, type ExecutionReadPublication, type ExecutionReadPublicationRequest } from "../src/execution-v2/read-publication";
import { assertExecutionReadScope, ExecutionReadScopeError, ExecutionReadScopes,
  scopeAllowsField, scopeAllowsQueryField, scopeResources, scopeTuples, scopeReadPopulation,
  scopeRealtimeIdentity,
  type AuthorizedExecutionReadScope, type ReadScopeBinding,
  type ReadScopePrincipal, type ReadScopeRequirement } from "../src/execution-v2/read-scope";
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { SessionsRepository } from "../src/repos/sessions";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const PASSWORD = "elp204-test-only-correct-horse-battery-2026";
const BUSINESS_FIELDS = ["alpha_id", "alpha_version_id", "portfolio_id", "deployment_id", "account_id", "binding_id", "display_name", "lifecycle"];
const BINDING: ReadScopeBinding = { environment: "paper", profileId: "TEST_ONLY-paper-profile" };
const DATASET = { dataset_id: "TEST_ONLY-correlated-fleet", source_revision: "TEST_ONLY-source-r1",
  window: { from_ms: 1_800_000_000_000, to_ms: 1_800_086_400_000 } };
const OWN: AccessResource = { kind: "ALPHA", id: "TEST_ONLY-own-alpha" };
const PEER: AccessResource = { kind: "ALPHA", id: "TEST_ONLY-peer-alpha" };
const LINKED: AccessResource = { kind: "PORTFOLIO", id: "TEST_ONLY-linked-portfolio" };
const UNLINKED: AccessResource = { kind: "PORTFOLIO", id: "TEST_ONLY-unlinked-portfolio" };
const OWN_BINDING: AccessResource = { kind: "BINDING", id: "TEST_ONLY-own-account-binding" };
const PEER_BINDING: AccessResource = { kind: "BINDING", id: "TEST_ONLY-peer-account-binding" };
const OWN_TUPLE = { alpha_id: OWN.id, alpha_version_id: "TEST_ONLY-own-version", portfolio_id: LINKED.id,
  deployment_id: "TEST_ONLY-own-deployment", account_id: "TEST_ONLY-own-account" };
const PEER_TUPLE = { alpha_id: PEER.id, alpha_version_id: "TEST_ONLY-peer-version", portfolio_id: LINKED.id,
  deployment_id: "TEST_ONLY-peer-deployment", account_id: "TEST_ONLY-peer-account" };
const UNLINKED_TUPLE = { alpha_id: OWN.id, alpha_version_id: OWN_TUPLE.alpha_version_id, portfolio_id: UNLINKED.id,
  deployment_id: "TEST_ONLY-unlinked-deployment", account_id: "TEST_ONLY-unlinked-account" };
const tuples = [OWN_TUPLE, PEER_TUPLE, UNLINKED_TUPLE];
const lineage = (t: typeof OWN_TUPLE): AccessResource[] => [
  { kind: "ALPHA", id: t.alpha_id }, { kind: "ALPHA_VERSION", id: t.alpha_version_id },
  { kind: "PORTFOLIO", id: t.portfolio_id }, { kind: "DEPLOYMENT", id: t.deployment_id }, { kind: "ACCOUNT", id: t.account_id },
];
const RESOURCES = [...new Map(tuples.flatMap(lineage).map(r => [JSON.stringify(r), r])).values()];
const row = (t: typeof OWN_TUPLE) => [t.alpha_id, t.alpha_version_id, t.portfolio_id, t.deployment_id, t.account_id];
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe.skipIf(!DATABASE_URL)("ELP2-04 TEST_ONLY scoped reads with real PostgreSQL", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let auth: AuthService;
  let admin: AdminService;
  let owner: PortalUser;
  let researcher: PortalUser;
  let outsider: PortalUser;
  let sequence = 0;
  const next = (label: string) => `elp204-scope-${label}-${++sequence}`;

  async function active(label: string, role: "ADMIN" | "USER" = "USER"): Promise<PortalUser> {
    const username = next(label);
    const created = await admin.createUser({ username, displayName: username, role });
    const activation = await admin.resetCredential(created.userId);
    const initial = await auth.login({ assertion: username, username, credential: activation.activationToken });
    await auth.changePassword({ sessionToken: initial.token, csrfToken: initial.csrfToken,
      currentPassword: activation.activationToken, newPassword: PASSWORD });
    return (await auth.users.findById(created.userId))!;
  }

  /** Cheap isolated sessions use the real repository, avoiding repeated password
   * hashing for each authority-matrix case. No credential escapes the test cell. */
  async function principal(user: PortalUser, workspaceId: string): Promise<ReadScopePrincipal> {
    const current = (await auth.users.findById(user.userId))!;
    const sessionId = next("session"), now = new Date();
    const session: AuthSession = { sessionId, userId: current.userId, state: "ACTIVE",
      sessionVersion: current.sessionVersion, authenticationTime: now,
      idleExpiresAt: new Date(now.valueOf() + 600_000), absoluteExpiresAt: new Date(now.valueOf() + 3_600_000) };
    await new SessionsRepository(ctx.pool).create({ sessionId, userId: current.userId,
      tokenHash: createHash("sha256").update(next("test-token")).digest("hex"), accessSubject: null,
      accessTokenExpiresAt: null, csrfSecretHash: createHash("sha256").update(next("test-csrf")).digest("hex"),
      activationId: null, sessionVersion: current.sessionVersion,
      idleExpiresAt: session.idleExpiresAt, absoluteExpiresAt: session.absoluteExpiresAt });
    return { user: current, session, workspaceId, viewerWorkspaceId: workspaceId };
  }

  class TestOnlyTrust implements AccessTrustProvider {
    beforePublication?: (request: ExecutionReadPublicationRequest) => Promise<void>;
    beforeRelations?: (userId: string) => Promise<void>;
    ownAlphaIds = [OWN.id];
    memberPortfolioIds = [LINKED.id];
    rootResources = structuredClone(RESOURCES);
    qualified = true;
    relationRevision = "TEST_ONLY-relations-r1";
    readonly membership = { revision: "TEST_ONLY-membership-r1", receipt_id: "TEST_ONLY-receipt-r1", mapping_revision: "TEST_ONLY-mapping-r1" };
    constructor(readonly artifact: ReviewedPolicyArtifact, public publication: ExecutionReadPublication) {}
    async verifyPolicy(input: unknown) { return input === this.artifact ? this.artifact : null; }
    async verifyReceipt() { return null; }
    async verifiedHumanMapping() { return null; }
    async relations(userId: string): Promise<AccessRelations> {
      await this.beforeRelations?.(userId);
      return { qualified: this.qualified, revision: this.relationRevision,
        own_alpha_ids: userId === researcher.userId ? [...this.ownAlphaIds] : [],
        member_portfolio_ids: userId === researcher.userId ? [...this.memberPortfolioIds] : [],
        roots: { "TEST_ONLY-root": structuredClone(this.rootResources) }, membership: { ...this.membership } };
    }
    async readPublication(request: ExecutionReadPublicationRequest) {
      await this.beforePublication?.(request);
      return this.publication;
    }
  }

  async function fixture(options: { legacy?: boolean; full?: boolean; allowTestOnly?: boolean } = {}) {
    const workspace = next("workspace");
    await ctx.pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,$2,$3)",
      [workspace, "TEST_ONLY ELP2-04 scope workspace", owner.userId]);
    for (const user of [owner, researcher]) await ctx.pool.query(
      "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,$3)",
      [workspace, user.userId, user === owner ? "OWNER" : "MEMBER"]);
    const policy: ReviewedAccessPolicy = { workspace_id: workspace, revision: next("policy-r1"),
      artifact_digest: accessDigest(["TEST_ONLY-reviewed-policy", workspace]),
      approval_ref: "TEST_ONLY-NOT-OWNER-APPROVAL", state: "REVIEWED", qualification: "TEST_ONLY",
      protected_owner_user_id: owner.userId,
      researcher_fields: { state: "QUALIFIED", policy_ref: "TEST_ONLY-researcher-fields-v1", fields: [...BUSINESS_FIELDS] } };
    const artifact: ReviewedPolicyArtifact = { policy, root_grants: [], provenance_ref: "TEST_ONLY-isolated-scope-tests" };
    const trust = new TestOnlyTrust(artifact, { workspace_id: workspace, environment: BINDING.environment,
      profile_id: BINDING.profileId, qualification: "TEST_ONLY", publication_revision: "TEST_ONLY-population-r1",
      binding: structuredClone(DATASET), population_coverage: "COMPLETE_FOR_DATASET_WINDOW",
      provenance_ref: "TEST_ONLY-NOT-A-REAL-SOURCE", resources: structuredClone(RESOURCES), tuples: structuredClone(tuples),
      // This is today's independent topology, not a cross-product of ownership
      // and membership IDs and not an assertion about every historical tuple.
      current_linkage: { qualification: "TEST_ONLY", revision: "TEST_ONLY-current-linkage-r1",
        provenance_ref: "TEST_ONLY-NOT-A-REAL-CURRENT-LINKAGE-SOURCE", pairs: [
          { alpha_id: OWN.id, portfolio_id: LINKED.id }, { alpha_id: PEER.id, portfolio_id: LINKED.id },
        ] } });
    const service = new ExecutionAccessService(ctx.pool, auth, trust, options.allowTestOnly !== false);
    const scopes = new ExecutionReadScopes(ctx.pool, service, ctx.config);
    const p = await principal(researcher, workspace);
    const addGrant = async (action: AccessAction, selector: ResourceSelector, overrides: Partial<ScopedAccessGrant> = {}) => {
      const now = Date.now();
      const grant: ScopedAccessGrant = { grant_id: next("grant"), subject_user_id: p.user.userId, workspace_id: workspace,
        action, effect: "ALLOW", selector, environments: ["paper"], valid_from_ms: now - 60_000,
        valid_until_ms: now + 3_600_000, delegable_actions: [], issued_by: owner.userId, parent_grant_id: null,
        revision: next("grant-r1"), policy_revision: policy.revision, revoked_at_ms: null,
        requires_ts_acceptance: true, ts_receipt: { receipt_id: trust.membership.receipt_id, mapping_revision: trust.membership.mapping_revision,
          membership_revision: trust.membership.revision, effective_at_ms: now - 60_000, expires_at_ms: now + 3_600_000 },
        field_policy_ref: policy.researcher_fields.policy_ref, ...overrides };
      // Test-only accepted fact injection is intentionally below the private
      // production receipt verifier; this does not prove TS owner acceptance.
      await new AccessRepository(ctx.pool).saveGrant(grant, true);
      return grant;
    };
    let ownGrant: ScopedAccessGrant | undefined;
    if (!options.legacy) {
      // Install first with the test-enabled private verifier so the durable
      // activation marker remains even in the explicit no-opt-in tests.
      await new ExecutionAccessService(ctx.pool, auth, trust, true).installReviewedPolicy(artifact);
      if (options.full) ownGrant = await addGrant("business.read_all", { kind: "ROOT_SCOPE", root_id: "TEST_ONLY-root" });
      else {
        ownGrant = await addGrant("alpha.read", { kind: "OWN_ALPHA" });
        await addGrant("portfolio.read_restricted", { kind: "PORTFOLIO_MEMBERSHIP", portfolio_ids: [LINKED.id] });
      }
    }
    const requirement: ReadScopeRequirement = { action: "alpha.read", dataset: structuredClone(DATASET) };
    const authorize = (r: ReadScopeRequirement = requirement, b: ReadScopeBinding = BINDING) => scopes.authorize(p, b, r);
    return { workspace, policy, artifact, trust, service, scopes, p, addGrant, ownGrant, requirement, authorize };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function bindingFixture(options: { full?: boolean; allowTestOnly?: boolean } = {}) {
    const f = await fixture(options);
    f.trust.publication.resources.push(OWN_BINDING, PEER_BINDING);
    f.trust.rootResources.push(OWN_BINDING, PEER_BINDING);
    f.trust.publication.binding_lineage = { qualification: "TEST_ONLY", revision: "TEST_ONLY-binding-lineage-r1",
      provenance_ref: "TEST_ONLY-NOT-A-REAL-BINDING-SOURCE", bindings: [
        { binding_id: OWN_BINDING.id, account_id: OWN_TUPLE.account_id },
        { binding_id: PEER_BINDING.id, account_id: PEER_TUPLE.account_id },
      ] };
    if (!options.full) await f.addGrant("binding.read",
      { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "BINDING", ids: [OWN_BINDING.id] });
    const requirement: ReadScopeRequirement = { action: "binding.read", resource: OWN_BINDING, dataset: structuredClone(DATASET) };
    return { ...f, bindingRequirement: requirement, authorizeBinding: () => f.authorize(requirement) };
  }
  async function revoke(f: Fixture) {
    const grant = f.ownGrant!;
    await new AccessRepository(ctx.pool).saveGrant({ ...grant, revoked_at_ms: Date.now(), revision: next("revoked") });
  }
  const refused = async (read: Promise<unknown>) => { await expect(read).rejects.toBeInstanceOf(ExecutionReadScopeError); };

  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL!);
    ctx = await setupApp({ DATABASE_URL: DATABASE_URL! });
    auth = ctx.app.get(AuthService);
    admin = new AdminService(ctx.pool, ctx.config, auth);
    vi.spyOn(auth, "verifyAccessIdentity").mockImplementation(async assertion => ({
      iss: "https://test-only.cloudflareaccess.com", sub: `TEST_ONLY:${assertion}`, aud: "test-audience",
      email: `${assertion}@azdag.com`, normalizedEmail: `${assertion}@azdag.com`,
      authenticationTime: new Date(), tokenExpiresAt: new Date(Date.now() + 60_000),
    } satisfies VerifiedAccessIdentity));
    owner = await active("protected-owner", "ADMIN");
    await new OwnerAccessRepository(ctx.pool).claimOwner({ userId: owner.userId, claimedBy: "ELP2-04_TEST_ONLY" });
    researcher = await active("current-researcher");
    outsider = await active("owner-like-name-admin", "ADMIN");
  }, 30_000);
  afterAll(async () => { vi.restoreAllMocks(); if (ctx) await teardownApp(ctx); });

  it("T04-01/04 mints exact correlated own-alpha tuples, never peers or a cross-product", async () => {
    const f = await fixture(), scope = await f.authorize();
    expect(scope).toMatchObject({ mode: "SCOPED_V2", workspaceId: f.workspace,
      viewerWorkspaceId: f.workspace, wholePopulation: false, fieldPolicyRef: f.policy.researcher_fields.policy_ref });
    expect(Object.isFrozen(scope)).toBe(true);
    expect(scopeTuples(scope)).toEqual({ columns: ["alpha_id", "alpha_version_id", "portfolio_id", "deployment_id", "account_id"],
      allowedTuples: [row(OWN_TUPLE)], fingerprint: scope.fingerprint });
    expect(scopeResources(scope)).toContainEqual(OWN);
    expect(scopeResources(scope)).not.toContainEqual(PEER);
    expect(scopeResources(scope)).not.toContainEqual({ kind: "ACCOUNT", id: PEER_TUPLE.account_id });
    expect(scopeAllowsField(scope, "balance_total")).toBe(false);
    expect(scopeAllowsQueryField(scope, "balance_total")).toBe(false);
    expect(await f.scopes.deliver(scope, async () => "TEST_ONLY-authorized-bytes")).toBe("TEST_ONLY-authorized-bytes");
  });

  it("T04-11 raw stream stays legacy-only even with full business permission", async () => {
    const f = await fixture({ full: true });
    await expect(f.scopes.assertLegacyStream(f.p)).rejects.toMatchObject({ code: "EXECUTION_SCOPED_STREAM_NOT_COMMISSIONED", status: 503 });
  });

  it("T09 current read permission never substitutes for exact stream capability", async () => {
    const f=await fixture();const emit=vi.fn(()=>true);
    await expect(f.scopes.deliverRealtime(await f.authorize(),OWN,emit)).rejects.toMatchObject({code:"ACCESS_DENIED"});
    expect(emit).not.toHaveBeenCalled();
    await f.addGrant("stream.subscribe",{kind:"OWN_ALPHA"});
    expect(await f.scopes.deliverRealtime(await f.authorize(),OWN,emit)).toBe(true);
    expect(emit).toHaveBeenCalledOnce();
  });

  it("T09 replay identity survives document advancement, not changed authorization", async () => {
    const f=await fixture();const before=await f.authorize();
    const request=structuredClone(f.requirement);request.dataset!.source_revision="TEST_ONLY-source-r2";
    f.trust.publication.binding=structuredClone(request.dataset!);
    f.trust.publication.publication_revision="TEST_ONLY-publication-r2";
    const after=await f.authorize(request);
    expect(after.fingerprint).not.toBe(before.fingerprint);
    expect(scopeRealtimeIdentity(after)).toBe(scopeRealtimeIdentity(before));
    f.trust.rootResources.push({kind:"ALPHA",id:"TEST_ONLY:hidden-addition"});
    expect(scopeRealtimeIdentity(await f.authorize(request))).toBe(scopeRealtimeIdentity(after));
    f.trust.relationRevision="TEST_ONLY-current-authority-r2";
    expect(scopeRealtimeIdentity(await f.authorize(request))).not.toBe(scopeRealtimeIdentity(after));
  });

  it("T09 revoke between prefetch and synchronous delivery emits no bytes", async () => {
    const f=await fixture();await f.addGrant("stream.subscribe",{kind:"OWN_ALPHA"});
    const scope=await f.authorize(),emit=vi.fn(()=>true);
    await revoke(f);
    await expect(f.scopes.deliverRealtime(scope,OWN,emit)).rejects.toBeDefined();
    expect(emit).not.toHaveBeenCalled();
  });

  it("T09 revoke while source publication is pending wins the final delivery fence", async () => {
    const f=await fixture();await f.addGrant("stream.subscribe",{kind:"OWN_ALPHA"});
    const scope=await f.authorize(),emit=vi.fn(()=>true),entered=deferred(),release=deferred();
    f.trust.beforePublication=async()=>{entered.resolve();await release.promise;};
    const result=f.scopes.deliverRealtime(scope,OWN,emit);
    const refused=expect(result).rejects.toBeDefined();
    await entered.promise;await revoke(f);release.resolve();await refused;
    expect(emit).not.toHaveBeenCalled();
  });

  it("T09 local replay race: committed app revoke purges a prefetched batch before any protected write", async () => {
    const f=await fixture();await f.addGrant("stream.subscribe",{kind:"OWN_ALPHA"});
    const scope=await f.authorize(),entered=deferred(),release=deferred(),frames:ScopedRealtimeFrame[]=[];
    const now=Date.now();
    const hub=new ScopedReplayHub({read:async()=>{entered.resolve();await release.promise;
      return{notices:[{resume_cursor:"TEST_ONLY.scan2",projection_generation:"TEST_ONLY:g1",quality:{
        completeness:"PARTIAL",freshness:"UNKNOWN",coverage:"AUTHORIZED_ONLY",source_as_of_ms:null,
        portal_observed_at_ms:now,source_set_ref:"TEST_ONLY:source",confidence:"PROVISIONAL",reasons:["TEST_ONLY"]}}],
        next_cursor:"TEST_ONLY.scan2",caught_up:true};}},
      new ScopedReplayCursorCodec("test",{test:"TEST_ONLY-not-a-runtime-key-".repeat(3)},60000),
      {maximumClients:2,maximumEntriesPerClient:4,maximumFrameBytes:8192,maximumClientBytes:32768,
        maximumTotalBytes:65536,maximumNoticesPerRead:4,readTimeoutMs:5000});
    try{
      await hub.subscribe({binding:{workspace_id:f.workspace,environment:"paper",profile_id:BINDING.profileId,
        principal_scope_digest:scopeRealtimeIdentity(scope),app_policy_revision:f.policy.revision,
        field_policy_revision:f.policy.researcher_fields.policy_ref!,model_revision:"TEST_ONLY:model",
        schema_revision:"portal.execution.scoped-realtime.v1",dataset:"alpha_fleet_overview",query_digest:"TEST_ONLY:query",
        source_set_digest:"TEST_ONLY:source",source_continuity_epoch:"TEST_ONLY:epoch",projection_generation:"TEST_ONLY:g1",
        snapshot_id:"TEST_ONLY:snapshot",window:DATASET.window},baselineCursor:"TEST_ONLY.scan1",
        guard:scopedNoticeGuard(f.scopes,()=>f.authorize(),OWN),write:frame=>{frames.push(frame);return true;}});
      const work=hub.poll();await entered.promise;
      await revoke(f);const revokedAt=Date.now(),start=process.hrtime.bigint();
      release.resolve();await work;
      const elapsed=Number(process.hrtime.bigint()-start)/1e6;
      expect(frames.map(v=>v.event_type)).toEqual(["access_revoked"]);
      expect(frames[0]).toMatchObject({resume_cursor:null,projection_generation:null,quality:null});
      expect(hub.diagnostics()).toMatchObject({clients:0,queued_bytes:0});
      // Measured local DB race only: no cross-host propagation/SLA assertion.
      console.info(JSON.stringify({proof:"ELP2_09_LOCAL_APP_REVOKE",revoked_at_ms:revokedAt,
        terminal_after_ms:elapsed,protected_writes_after_revoke:0,source:"TEST_ONLY_NOTICE_ADAPTER"}));
    }finally{release.resolve();hub.stop();}
  });

  it("T09 expiry of stream-only grant is checked after a valid business scope", async () => {
    const f=await fixture();const grant=await f.addGrant("stream.subscribe",{kind:"OWN_ALPHA"});
    const scope=await f.authorize(),emit=vi.fn(()=>true);
    await new AccessRepository(ctx.pool).saveGrant({...grant,valid_until_ms:Date.now()-1,revision:next("expired")});
    await expect(f.scopes.deliverRealtime(scope,OWN,emit)).rejects.toBeDefined();
    expect(emit).not.toHaveBeenCalled();
  });

  it("T09 deactivated session cannot emit even with retained scope and stream grant", async () => {
    const f=await fixture();await f.addGrant("stream.subscribe",{kind:"OWN_ALPHA"});
    const scope=await f.authorize(),emit=vi.fn(()=>true);
    await ctx.pool.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1",[f.p.session.sessionId]);
    await expect(f.scopes.deliverRealtime(scope,OWN,emit)).rejects.toBeDefined();
    expect(emit).not.toHaveBeenCalled();
  });

  it("T09 pending app-revoke lock prevents a delivery; ingestion is a separate authority", async () => {
    const f=await fixture();await f.addGrant("stream.subscribe",{kind:"OWN_ALPHA"});
    const scope=await f.authorize(),emit=vi.fn(()=>true),client=await ctx.pool.connect();
    try{
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`portal-access-v2:${f.workspace}`]);
      await expect(f.scopes.deliverRealtime(scope,OWN,emit)).rejects.toMatchObject({code:"ACCESS_RETRY_REQUIRED"});
      expect(emit).not.toHaveBeenCalled();
    }finally{await client.query("ROLLBACK");client.release();}
    expect(await f.scopes.deliverRealtime(await f.authorize(),OWN,emit)).toBe(true);
    expect(emit).toHaveBeenCalledOnce();
  });

  it("policy mode selection is sticky routing, never a minted read capability", async () => {
    const f = await fixture({ legacy: true });
    expect(await f.scopes.selectionMode(f.p)).toBe("LEGACY_COMPATIBILITY");
    await f.service.installReviewedPolicy(f.artifact);
    expect(await f.scopes.selectionMode(f.p)).toBe("SCOPED_V2");
    await ctx.pool.query("DELETE FROM portal_access_policy_state WHERE workspace_id=$1", [f.workspace]);
    expect(await f.scopes.selectionMode(f.p)).toBe("SCOPED_V2");
    await refused(f.authorize());
  });

  it("Core policy routing preserves its own workspace and never grants retained source access", async () => {
    const f = await fixture({ legacy: true });
    const scopes = new ExecutionReadScopes(ctx.pool, f.service, { ...ctx.config,
      EXECUTION_READ_PROFILE: "retained_review_v1", EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: "different-source-workspace" });
    expect(await scopes.coreSelectionMode(f.p)).toBe("LEGACY_COMPATIBILITY");
    await expect(scopes.selectionMode(f.p)).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE" });
    await f.service.installReviewedPolicy(f.artifact);
    await ctx.pool.query("DELETE FROM portal_access_policy_state WHERE workspace_id=$1", [f.workspace]);
    expect(await scopes.coreSelectionMode(f.p)).toBe("SCOPED_V2");
    await ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [f.workspace, f.p.user.userId]);
    await expect(scopes.coreSelectionMode(f.p)).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE" });
  });

  it("T04-11 legacy stream is stopped by sticky V2 activation history", async () => {
    const f = await fixture({ legacy: true });
    await expect(f.scopes.assertLegacyStream(f.p)).resolves.toBeUndefined();
    await f.service.installReviewedPolicy(f.artifact);
    await ctx.pool.query("DELETE FROM portal_access_policy_state WHERE workspace_id=$1", [f.workspace]);
    await expect(f.scopes.assertLegacyStream(f.p)).rejects.toMatchObject({ code: "EXECUTION_SCOPED_STREAM_NOT_COMMISSIONED" });
  });

  it("T04-01 whole business read covers the verified population without implying technical fields", async () => {
    const f = await fixture({ full: true }), scope = await f.authorize({ ...f.requirement, requireWholePopulation: true });
    expect(scope.wholePopulation).toBe(true);
    expect(scopeTuples(scope)!.allowedTuples).toEqual(tuples.map(row));
    expect(scopeAllowsField(scope, "display_name")).toBe(true);
    expect(scopeAllowsField(scope, "private_key")).toBe(false);
    expect(scopeAllowsField(scope, "physical_balance")).toBe(false);
  });

  it.each(["scoped", "legacy"] as const)(
    "T04-03 %s whole-population assertion requires a qualified dataset, not just resource permission", async mode => {
      const f = await fixture({ legacy: mode === "legacy", full: true });
      await expect(f.authorize({ action: "alpha.read", resource: OWN, requireWholePopulation: true }))
        .rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
      // The new assertion does not disable the ordinary legacy compatibility
      // read, or the existing qualified full-business dataset path.
      if (mode === "legacy") expect((await f.authorize()).mode).toBe("LEGACY_COMPATIBILITY");
      else expect((await f.authorize({ ...f.requirement, requireWholePopulation: true })).wholePopulation).toBe(true);
    });

  it("T04-04 full-business binding purpose selects only its exact mapped account, not all root tuples", async () => {
    const f = await bindingFixture({ full: true }), scope = await f.authorizeBinding();
    expect(scopeTuples(scope)!.allowedTuples).toEqual([row(OWN_TUPLE)]);
    expect(scopeTuples(scope)!.allowedTuples).not.toContainEqual(row(PEER_TUPLE));
    expect(scopeTuples(scope)!.allowedTuples).not.toContainEqual(row(UNLINKED_TUPLE));
    expect(scopeResources(scope)).toContainEqual(OWN_BINDING);
  });

  it("T04-04 exact non-global binding grant uses finite reviewed fields and needs no fictional alpha ownership", async () => {
    const f = await bindingFixture();
    f.trust.ownAlphaIds = [];
    f.trust.memberPortfolioIds = [];
    f.trust.publication.current_linkage = null;
    const scope = await f.authorizeBinding();
    expect(scope.wholePopulation).toBe(false);
    expect(scope.fieldPolicyRef).toBe(f.policy.researcher_fields.policy_ref);
    expect(scopeTuples(scope)!.allowedTuples).toEqual([row(OWN_TUPLE)]);
    expect(scopeResources(scope)).toContainEqual(OWN_BINDING);
    expect(scopeResources(scope)).not.toContainEqual(PEER_BINDING);
    expect(scopeResources(scope)).not.toContainEqual({ kind: "ACCOUNT", id: PEER_TUPLE.account_id });
    expect(scopeAllowsField(scope, "binding_id")).toBe(true);
    for (const field of ["balance_total", "physical_balance", "private_key", "host"])
      expect(scopeAllowsField(scope, field), field).toBe(false);
  });

  it("T04-04 binding collection uses qualified permitted pairs, not all account or alpha grants", async () => {
    const f = await bindingFixture();
    const scope = await f.authorize({ action: "binding.read", dataset: structuredClone(DATASET) });
    expect(scopeTuples(scope)!.allowedTuples).toEqual([row(OWN_TUPLE)]);
    expect(scopeResources(scope)).toContainEqual(OWN_BINDING);
    expect(scopeResources(scope)).not.toContainEqual(PEER_BINDING);
    expect(scopeReadPopulation(scope).bindingPairs).toEqual([{ binding_id: OWN_BINDING.id, account_id: OWN_TUPLE.account_id }]);
    const detached = scopeReadPopulation(scope); detached.bindingPairs.length = 0;
    expect(scopeReadPopulation(scope).bindingPairs).toHaveLength(1);
  });

  it("T04-04 binding collection respects DENY even under full-business authority", async () => {
    const f = await bindingFixture({ full: true });
    await f.addGrant("binding.read", { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "BINDING", ids: [PEER_BINDING.id] },
      { effect: "DENY", requires_ts_acceptance: false, ts_receipt: null });
    const scope = await f.authorize({ action: "binding.read", dataset: structuredClone(DATASET) });
    expect(scopeTuples(scope)!.allowedTuples).toEqual([row(OWN_TUPLE)]);
    expect(scopeResources(scope)).not.toContainEqual(PEER_BINDING);
  });

  it("T04-04 binding collection distinguishes qualified empty from unpublished linkage", async () => {
    const f = await bindingFixture();
    f.trust.publication.binding_lineage!.bindings = [];
    await expect(f.authorize({ action: "binding.read", dataset: structuredClone(DATASET) }))
      .rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED" });
    f.trust.publication.binding_lineage!.empty_binding_ids = [OWN_BINDING.id];
    const scope = await f.authorize({ action: "binding.read", dataset: structuredClone(DATASET) });
    expect(scopeTuples(scope)!.allowedTuples).toEqual([]);
    expect(scopeResources(scope)).toEqual([OWN_BINDING]);
  });

  it.each(["missing", "null", "TEST_ONLY-without-opt-in"] as const)(
    "T04-03 binding purpose refuses %s qualified exact lineage", async variant => {
      const f = await bindingFixture({ full: true, allowTestOnly: variant !== "TEST_ONLY-without-opt-in" });
      if (variant === "missing") delete f.trust.publication.binding_lineage;
      else if (variant === "null") f.trust.publication.binding_lineage = null;
      else {
        f.policy.qualification = "OWNER_VERIFIED";
        f.trust.publication.qualification = "SOURCE_VERIFIED";
        f.trust.publication.current_linkage!.qualification = "SOURCE_VERIFIED";
        await new AccessRepository(ctx.pool).putPolicy(f.policy);
      }
      await expect(f.authorizeBinding()).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
    });

  it.each(["binding", "account"] as const)(
    "T04-03 binding map cannot reference a %s outside the complete resource population", async kind => {
      const f = await bindingFixture({ full: true });
      if (kind === "binding") f.trust.publication.binding_lineage!.bindings[0].binding_id = "TEST_ONLY-not-published-binding";
      else f.trust.publication.binding_lineage!.bindings[0].account_id = "TEST_ONLY-not-published-account";
      await expect(f.authorizeBinding()).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
    });

  it("T04-03 duplicate binding/account pairs fail schema validation before minting", async () => {
    const f = await bindingFixture();
    f.trust.publication.binding_lineage!.bindings.push({ ...f.trust.publication.binding_lineage!.bindings[0] });
    expect(readPublication.safeParse(f.trust.publication).success).toBe(false);
    await expect(f.authorizeBinding()).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
  });

  it("T04-04 a peer binding's map cannot cross-product or prove the requested binding is empty", async () => {
    const f = await bindingFixture();
    f.trust.publication.binding_lineage!.bindings = [{ binding_id: PEER_BINDING.id, account_id: PEER_TUPLE.account_id }];
    await expect(f.authorizeBinding()).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
  });

  it("T04-04 a qualified explicit empty-binding fact permits an authorized zero-account scope", async () => {
    const f = await bindingFixture();
    f.trust.publication.binding_lineage!.bindings = [{ binding_id: PEER_BINDING.id, account_id: PEER_TUPLE.account_id }];
    f.trust.publication.binding_lineage!.empty_binding_ids = [OWN_BINDING.id];
    const scope = await f.authorizeBinding();
    // Explicit current zero-account evidence is independent of the grant and
    // cannot be substituted by a missing mapping or a peer binding's data.
    expect(scopeTuples(scope)!.allowedTuples).toEqual([]);
    expect(scopeResources(scope)).toContainEqual(OWN_BINDING);
    expect(scopeResources(scope)).not.toContainEqual(PEER_BINDING);
    expect(scopeResources(scope)).not.toContainEqual({ kind: "ACCOUNT", id: PEER_TUPLE.account_id });
  });

  it("T04-04 component DENY removes a mapped account despite full-business and binding authority", async () => {
    const f = await bindingFixture({ full: true });
    await f.addGrant("alpha.read", { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ACCOUNT", ids: [OWN_TUPLE.account_id] },
      { effect: "DENY", requires_ts_acceptance: false, ts_receipt: null });
    const scope = await f.authorizeBinding();
    expect(scope.wholePopulation).toBe(false);
    expect(scopeTuples(scope)!.allowedTuples).toEqual([]);
    expect(scopeResources(scope)).not.toContainEqual({ kind: "ACCOUNT", id: OWN_TUPLE.account_id });
  });

  it.each(["binding.read", "alpha.read"] as const)(
    "T04-04 %s DENY on BINDING overrides full-business authority before any binding bytes", async action => {
    const f = await bindingFixture({ full: true });
    await f.addGrant(action, { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "BINDING", ids: [OWN_BINDING.id] },
      { effect: "DENY", requires_ts_acceptance: false, ts_receipt: null });
    await expect(f.authorizeBinding()).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
  });

  it("T04-08 binding lineage revision invalidates a minted scope while preserving the exact account map", async () => {
    const f = await bindingFixture(), scope = await f.authorizeBinding();
    f.trust.publication.binding_lineage!.revision = "TEST_ONLY-binding-lineage-r2";
    await refused(f.scopes.revalidate(scope));
    expect(scopeTuples(await f.authorizeBinding())!.allowedTuples).toEqual([row(OWN_TUPLE)]);
  });

  it("T04-05 non-global binding read cannot bypass a pending reviewed field policy", async () => {
    const f = await bindingFixture();
    f.policy.researcher_fields = { state: "PENDING", policy_ref: null, fields: [] };
    await new AccessRepository(ctx.pool).putPolicy(f.policy);
    await expect(f.authorizeBinding()).rejects.toMatchObject({ code: "EXECUTION_READ_FIELD_POLICY_PENDING", status: 503 });
  });

  it("T04-03 source-qualified binding lineage works without enabling test-only trust", async () => {
    const f = await bindingFixture({ full: true, allowTestOnly: false });
    // Synthetic ordinary-branch coverage, not real producer qualification.
    f.policy.qualification = "OWNER_VERIFIED";
    f.trust.publication.qualification = "SOURCE_VERIFIED";
    f.trust.publication.current_linkage = null;
    f.trust.publication.binding_lineage!.qualification = "SOURCE_VERIFIED";
    await new AccessRepository(ctx.pool).putPolicy(f.policy);
    expect(scopeTuples(await f.authorizeBinding())!.allowedTuples).toEqual([row(OWN_TUPLE)]);
  });

  it.each(["report.export", "stream.subscribe", "maintenance.read", "development.read", "audit.read"] as const)(
    "review002 denies dataset purpose %s without exact permission, including full business readers", async action => {
      const f = await fixture({ full: true });
      await refused(f.authorize({ action, dataset: structuredClone(DATASET) }));
      await refused(f.authorize({ action, resource: { kind: "ROOT", id: "TEST_ONLY-root" }, dataset: structuredClone(DATASET) }));
    });
  it.each(["report.export", "stream.subscribe", "maintenance.read", "development.read", "audit.read"] as const)(
    "review002 compatibility membership does not mint %s authority", async action => {
      const f = await fixture({ legacy: true });
      await refused(f.authorize({ action, dataset: structuredClone(DATASET) }));
      await refused(f.authorize({ action, resource: { kind: "ROOT", id: "TEST_ONLY-root" }, dataset: structuredClone(DATASET) }));
    });

  it.each([
    ["ALPHA_VERSION", OWN_TUPLE.alpha_version_id, "alpha.read"],
    ["DEPLOYMENT", OWN_TUPLE.deployment_id, "alpha.read"],
    ["ACCOUNT", OWN_TUPLE.account_id, "account.read"],
  ] as const)("review003 current explicit DENY of %s removes its entire correlated tuple", async (kind, id, action) => {
    const f = await fixture();
    await f.addGrant(action, { kind: "EXPLICIT_RESOURCE_SET", resource_kind: kind, ids: [id] },
      { effect: "DENY", requires_ts_acceptance: false, ts_receipt: null });
    const scope = await f.authorize({ ...f.requirement, resource: OWN });
    expect(scopeTuples(scope)!.allowedTuples).not.toContainEqual(row(OWN_TUPLE));
    expect(scopeTuples(scope)!.allowedTuples).toHaveLength(0);
  });

  it("review003 whole business grant cannot bypass a narrower account DENY", async () => {
    const f = await fixture({ full: true });
    await f.addGrant("account.read", { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ACCOUNT", ids: [PEER_TUPLE.account_id] },
      { effect: "DENY", requires_ts_acceptance: false, ts_receipt: null });
    const scope = await f.authorize();
    expect(scope.wholePopulation).toBe(false);
    expect(scopeTuples(scope)!.allowedTuples).not.toContainEqual(row(PEER_TUPLE));
    await refused(f.authorize({ ...f.requirement, requireWholePopulation: true }));
  });

  it.each([
    ["ALPHA_VERSION", PEER_TUPLE.alpha_version_id],
    ["DEPLOYMENT", PEER_TUPLE.deployment_id],
    ["ACCOUNT", PEER_TUPLE.account_id],
  ] as const)("review003 whole business read honors alpha.read DENY on permitted %s selectors", async (kind, id) => {
    const f = await fixture({ full: true });
    // The public grant contract permits this finite action/resource-kind pair;
    // the read boundary must not invent a narrower action-kind restriction.
    await f.addGrant("alpha.read", { kind: "EXPLICIT_RESOURCE_SET", resource_kind: kind, ids: [id] },
      { effect: "DENY", requires_ts_acceptance: false, ts_receipt: null });
    const scope = await f.authorize();
    expect(scope.wholePopulation).toBe(false);
    expect(scopeTuples(scope)!.allowedTuples).toEqual([row(OWN_TUPLE), row(UNLINKED_TUPLE)]);
    expect(scopeResources(scope)).not.toContainEqual({ kind, id });
    expect(scopeResources(scope)).toContainEqual(OWN);
    await refused(f.authorize({ ...f.requirement, requireWholePopulation: true }));
  });

  it.each(["portfolio.discover_linked", "portfolio.read_restricted"] as const)(
    "review004 %s detail needs current own/link relation, not an old accepted grant", async action => {
      const f = await fixture();
      if (action === "portfolio.discover_linked") await f.addGrant(action,
        { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "PORTFOLIO", ids: [LINKED.id] });
      await expect(f.authorize({ action, resource: LINKED })).rejects.toMatchObject({
        code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503,
      });
      const request: ReadScopeRequirement = { action, resource: LINKED, dataset: structuredClone(DATASET) };
      const scope = await f.authorize(request);
      expect(scopeResources(scope)).toContainEqual(LINKED);
      expect(scopeTuples(scope)!.allowedTuples).toEqual([row(OWN_TUPLE)]);
      expect(scopeResources(scope)).not.toContainEqual(PEER);
      expect(scopeResources(scope)).not.toContainEqual({ kind: "ACCOUNT", id: PEER_TUPLE.account_id });
      expect(scopeAllowsField(scope, "display_name")).toBe(true);
      expect(scopeAllowsField(scope, "balance_total")).toBe(false);
      f.trust.ownAlphaIds = [];
      await refused(f.authorize(request));
      f.trust.ownAlphaIds = [OWN.id];
      f.trust.memberPortfolioIds = [];
      await refused(f.authorize(request));
      await refused(f.scopes.revalidate(scope));
    });

  it("review004 unqualified current relation cannot authorize linked detail", async () => {
    const f = await fixture();
    f.trust.qualified = false;
    await refused(f.authorize({ action: "portfolio.read_restricted", resource: LINKED, dataset: structuredClone(DATASET) }));
  });

  it.each(["portfolio.discover_linked", "portfolio.read_restricted"] as const)(
    "review004 %s rejects current pair removal while accepted grants and both flat ID sets stay unchanged", async action => {
      const f = await fixture();
      if (action === "portfolio.discover_linked") await f.addGrant(action,
        { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "PORTFOLIO", ids: [LINKED.id] });
      const request: ReadScopeRequirement = { action, resource: LINKED, dataset: structuredClone(DATASET) };
      const scope = await f.authorize(request);
      const actor = { user_id: f.p.user.userId, session_id: f.p.session.sessionId,
        session_generation: f.p.session.sessionVersion };
      const before = await f.service.readContext(actor, f.workspace);
      const historicalTuples = structuredClone(f.trust.publication.tuples);
      const ownIds = [...f.trust.ownAlphaIds], memberIds = [...f.trust.memberPortfolioIds];
      expect(scopeResources(scope)).toContainEqual(LINKED);
      // PEER remains linked to LINKED, so membership can legitimately survive.
      // The researcher's own alpha was unlinked; historical evidence stays put.
      f.trust.publication.current_linkage!.pairs = [{ alpha_id: PEER.id, portfolio_id: LINKED.id }];
      f.trust.publication.current_linkage!.revision = "TEST_ONLY-current-linkage-r2-unlinked";
      expect(f.trust.ownAlphaIds).toEqual(ownIds);
      expect(f.trust.memberPortfolioIds).toEqual(memberIds);
      expect(f.trust.publication.tuples).toEqual(historicalTuples);
      const after = await f.service.readContext(actor, f.workspace);
      expect(after.grants).toEqual(before.grants);
      await expect(f.authorize(request)).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
      await refused(f.scopes.revalidate(scope));
      const read = vi.fn(async () => "must-not-deliver-unlinked-portfolio");
      await refused(f.scopes.deliver(scope, read));
      expect(read).not.toHaveBeenCalled();
    });

  it("review004 flat ownership and membership cannot cross-product mismatching current pairs", async () => {
    const f = await fixture();
    f.trust.publication.current_linkage!.pairs = [
      { alpha_id: OWN.id, portfolio_id: UNLINKED.id }, { alpha_id: PEER.id, portfolio_id: LINKED.id },
    ];
    expect(f.trust.ownAlphaIds).toEqual([OWN.id]);
    expect(f.trust.memberPortfolioIds).toEqual([LINKED.id]);
    await refused(f.authorize({ action: "portfolio.read_restricted", resource: LINKED, dataset: structuredClone(DATASET) }));
    await refused(f.authorize());
  });

  it("review004 null current linkage cannot grant a restricted read from historical tuples", async () => {
    const f = await fixture();
    f.trust.publication.current_linkage = null;
    await refused(f.authorize());
    await refused(f.authorize({ action: "portfolio.read_restricted", resource: LINKED, dataset: structuredClone(DATASET) }));
  });

  it("review004 a TEST_ONLY current linkage is not source-qualified without test opt-in", async () => {
    const f = await fixture({ allowTestOnly: false });
    f.policy.qualification = "OWNER_VERIFIED";
    f.trust.publication.qualification = "SOURCE_VERIFIED";
    await new AccessRepository(ctx.pool).putPolicy(f.policy);
    expect(f.trust.publication.current_linkage!.qualification).toBe("TEST_ONLY");
    await refused(f.authorize());
    await refused(f.authorize({ action: "portfolio.read_restricted", resource: LINKED, dataset: structuredClone(DATASET) }));
  });

  it("review004 duplicate current linkage pairs fail the adapter schema and cannot mint a scope", async () => {
    const f = await fixture();
    f.trust.publication.current_linkage!.pairs.push({ ...f.trust.publication.current_linkage!.pairs[0] });
    expect(readPublication.safeParse(f.trust.publication).success).toBe(false);
    await expect(f.authorize()).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
  });

  it("review004 whole business permission reads historical tuples without current linkage", async () => {
    const f = await fixture({ full: true });
    f.trust.publication.current_linkage = null;
    const scope = await f.authorize({ ...f.requirement, requireWholePopulation: true });
    expect(scope.wholePopulation).toBe(true);
    expect(scopeTuples(scope)!.allowedTuples).toEqual(tuples.map(row));
    expect(scopeResources(scope)).toContainEqual(UNLINKED);
    expect(await f.scopes.deliver(scope, async () => "authorized-historical-business-data"))
      .toBe("authorized-historical-business-data");
  });

  it("review004 source-qualified full business read needs no current linkage or test-only bypass", async () => {
    const f = await fixture({ full: true, allowTestOnly: false });
    // SOURCE_VERIFIED selects the ordinary code path only. These dependencies
    // remain synthetic and do not qualify a real producer/profile/runtime.
    f.policy.qualification = "OWNER_VERIFIED";
    f.trust.publication.qualification = "SOURCE_VERIFIED";
    f.trust.publication.current_linkage = null;
    await new AccessRepository(ctx.pool).putPolicy(f.policy);
    const scope = await f.authorize({ ...f.requirement, requireWholePopulation: true });
    expect(scope.wholePopulation).toBe(true);
    expect(scopeTuples(scope)!.allowedTuples).toEqual(tuples.map(row));
    expect(scopeResources(scope)).toContainEqual(UNLINKED);
  });

  it("review004 current linkage revision invalidates a minted restricted scope even when pairs stay unchanged", async () => {
    const f = await fixture(), scope = await f.authorize();
    f.trust.publication.current_linkage!.revision = "TEST_ONLY-current-linkage-r2-same-pairs";
    await refused(f.scopes.revalidate(scope));
    expect(scopeTuples(await f.authorize())!.allowedTuples).toEqual([row(OWN_TUPLE)]);
  });

  it.each(["private_key", "token", "custody", "physical_balance", "host", "technical.topology", "unpublished_finance"])(
    "review005 hidden field/query %s is not enabled by arbitrary policy strings", async field => {
      const f = await fixture();
      f.policy.researcher_fields.fields.push(field);
      await new AccessRepository(ctx.pool).putPolicy(f.policy);
      const scope = await f.authorize();
      expect(scopeAllowsField(scope, field)).toBe(false);
      expect(scopeAllowsQueryField(scope, field)).toBe(false);
      expect(scopeAllowsField(scope, "display_name")).toBe(true);
      expect(scopeAllowsQueryField(scope, "alpha_id")).toBe(true);
    });

  it("review005 legacy compatibility is a finite business DTO surface, not arbitrary secret access", async () => {
    const f = await fixture({ legacy: true }), scope = await f.authorize();
    expect(scope.mode).toBe("LEGACY_COMPATIBILITY");
    expect(scopeTuples(scope)).toBeNull();
    expect(scopeAllowsField(scope, "display_name")).toBe(true);
    for (const field of ["private_key", "token", "host", "physical_balance", "custody", "unknown_field"])
      expect(scopeAllowsField(scope, field), field).toBe(false);
  });

  it("review006 removing current policy after durable install cannot fall back to legacy", async () => {
    const f = await fixture(), scope = await f.authorize();
    expect((await ctx.pool.query("SELECT count(*)::int AS n FROM portal_access_policy_events WHERE workspace_id=$1 AND operation='POLICY_INSTALL'", [f.workspace])).rows[0].n).toBe(1);
    await ctx.pool.query("DELETE FROM portal_access_policy_state WHERE workspace_id=$1", [f.workspace]);
    await refused(f.authorize());
    await refused(f.scopes.revalidate(scope));
  });

  it("review006 installing pending policy invalidates an already minted legacy flight", async () => {
    const f = await fixture({ legacy: true }), scope = await f.authorize();
    f.policy.state = "PENDING";
    await new AccessRepository(ctx.pool).putPolicy(f.policy);
    const read = vi.fn(async () => "legacy-bytes");
    await refused(f.scopes.deliver(scope, read));
    expect(read).not.toHaveBeenCalled();
  });

  it("review007 empty complete publication cannot grant collection authority vacuously", async () => {
    const f = await fixture();
    f.trust.publication.resources = [];
    f.trust.publication.tuples = [];
    await refused(f.authorize());
  });

  it("review007 authorized empty has an explicit root grant independent of population", async () => {
    const f = await fixture({ full: true });
    f.trust.publication.resources = [];
    f.trust.publication.tuples = [];
    const scope = await f.authorize({ ...f.requirement, action: "business.read_all", resource: { kind: "ROOT", id: "TEST_ONLY-root" } });
    expect(scope.mode).toBe("SCOPED_V2");
    expect(scopeTuples(scope)!.allowedTuples).toHaveLength(0);
  });

  it.each(["partial", "workspace", "environment", "profile", "dataset", "source-revision", "window", "duplicate-resource", "missing-tuple-component"] as const)(
    "T04-03/08 refuses %s publication before issuing a scope", async variant => {
      const f = await fixture();
      const p = f.trust.publication;
      if (variant === "partial") p.population_coverage = "PARTIAL";
      if (variant === "workspace") p.workspace_id = next("different-workspace");
      if (variant === "environment") p.environment = "sandbox";
      if (variant === "profile") p.profile_id = "TEST_ONLY-different-profile";
      if (variant === "dataset") p.binding.dataset_id = "TEST_ONLY-different-dataset";
      if (variant === "source-revision") p.binding.source_revision = "TEST_ONLY-different-source";
      if (variant === "window") p.binding.window!.to_ms += 1;
      if (variant === "duplicate-resource") p.resources.push({ ...p.resources[0] });
      if (variant === "missing-tuple-component") p.resources = p.resources.filter(r => r.id !== OWN_TUPLE.account_id);
      await expect(f.authorize()).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
    });

  it("T04-03 TEST_ONLY policy/publication requires explicit test opt-in", async () => {
    const f = await fixture({ allowTestOnly: false });
    await expect(f.authorize()).rejects.toMatchObject({ code: "EXECUTION_READ_POLICY_PENDING" });
  });

  it("T04-03 OWNER_VERIFIED policy still does not qualify a TEST_ONLY publication", async () => {
    const f = await fixture({ allowTestOnly: false });
    f.policy.qualification = "OWNER_VERIFIED";
    await new AccessRepository(ctx.pool).putPolicy(f.policy);
    await expect(f.authorize()).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
  });

  it("T04-03 qualified policy and source publication do not require a test-only bypass", async () => {
    const f = await fixture({ allowTestOnly: false });
    // Values remain explicitly synthetic test dependencies. This checks the
    // ordinary branch selection; it is not source/runtime qualification.
    f.policy.qualification = "OWNER_VERIFIED";
    f.trust.publication.qualification = "SOURCE_VERIFIED";
    f.trust.publication.current_linkage!.qualification = "SOURCE_VERIFIED";
    await new AccessRepository(ctx.pool).putPolicy(f.policy);
    expect(scopeTuples(await f.authorize())!.allowedTuples).toEqual([row(OWN_TUPLE)]);
  });

  it("T04-05 pending researcher fields block restricted reads but not full business permission", async () => {
    const restricted = await fixture();
    restricted.policy.researcher_fields = { state: "PENDING", policy_ref: null, fields: [] };
    await new AccessRepository(ctx.pool).putPolicy(restricted.policy);
    await expect(restricted.authorize()).rejects.toMatchObject({ code: "EXECUTION_READ_FIELD_POLICY_PENDING", status: 503 });
    const full = await fixture({ full: true });
    full.policy.researcher_fields = { state: "PENDING", policy_ref: null, fields: [] };
    await new AccessRepository(ctx.pool).putPolicy(full.policy);
    expect((await full.authorize({ ...full.requirement, requireWholePopulation: true })).wholePopulation).toBe(true);
  });

  it("T04-11 exact maintenance permission uses a finite technical DTO, not business or credentials", async () => {
    const f = await fixture();
    const resource: AccessResource = { kind: "ROOT", id: "TEST_ONLY-root" };
    await f.addGrant("maintenance.read", { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ROOT", ids: [resource.id] },
      { requires_ts_acceptance: false, ts_receipt: null });
    const scope = await f.authorize({ action: "maintenance.read", resource });
    expect(scopeAllowsField(scope, "component")).toBe(true);
    for (const field of ["display_name", "balance_total", "private_key", "host", "token"])
      expect(scopeAllowsField(scope, field), field).toBe(false);
    const profileScope=await f.scopes.authorizeTechnicalProfile(f.p,BINDING);
    expect(scopeAllowsField(profileScope,"component")).toBe(true);
    expect(scopeAllowsField(profileScope,"balance_total")).toBe(false);
  });

  it("a full business grant never implies technical profile read",async()=>{
    const f=await fixture({full:true});
    await expect(f.scopes.authorizeTechnicalProfile(f.p,BINDING)).rejects.toMatchObject({code:"EXECUTION_READ_NOT_AVAILABLE"});
  });

  it("T04-06 rejects forged scopes and genuine scopes from another issuer", async () => {
    const f = await fixture(), scope = await f.authorize();
    for (const forged of [{ ...scope }, JSON.parse(JSON.stringify(scope)), null]) {
      expect(() => assertExecutionReadScope(forged as AuthorizedExecutionReadScope)).toThrow(ExecutionReadScopeError);
      expect(() => scopeResources(forged as AuthorizedExecutionReadScope)).toThrow(ExecutionReadScopeError);
    }
    const other = new ExecutionReadScopes(ctx.pool, f.service, ctx.config);
    await expect(other.revalidate(scope)).rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_REQUIRED" });
    const read = vi.fn(async () => "not-authorized");
    await expect(other.deliver(scope, read)).rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_REQUIRED" });
    expect(read).not.toHaveBeenCalled();
  });

  it("T04-08 source scope does not discard viewer-workspace context", async () => {
    const f = await fixture();
    const scoped = await f.scopes.authorize({ ...f.p, viewerWorkspaceId: "TEST_ONLY-viewer-workspace" }, BINDING, f.requirement);
    expect(scoped.viewerWorkspaceId).toBe("TEST_ONLY-viewer-workspace");
    expect(scoped.fingerprint).not.toBe((await f.authorize()).fingerprint);
  });

  it("T04-06 member legacy business read is preserved, nonmember ADMIN is not an authority fallback", async () => {
    const f = await fixture({ legacy: true });
    expect((await f.authorize()).mode).toBe("LEGACY_COMPATIBILITY");
    const outsiderPrincipal = await principal(outsider, f.workspace);
    await expect(f.scopes.authorize(outsiderPrincipal, BINDING, f.requirement)).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
  });

  it("T04-09 unknown and hidden detail share a safe public refusal without resource prose", async () => {
    const f = await fixture();
    for (const resource of [PEER, { kind: "ALPHA" as const, id: "TEST_ONLY-never-published" }]) {
      await expect(f.authorize({ action: "alpha.read", resource })).rejects.toMatchObject({
        code: "EXECUTION_READ_NOT_AVAILABLE", status: 404, message: "The requested Execution read is not available.",
      });
    }
  });

  it.each(["cache-hit", "coalesced-follower", "cache-miss"] as const)(
    "T04-07/12 fences %s after the data await when its grant was revoked", async lane => {
      const f = await fixture(), scope = await f.authorize();
      const entered = deferred(), release = deferred();
      const read = vi.fn(async () => { entered.resolve(); await release.promise; return { lane, secret: "must-not-deliver" }; });
      const observed = f.scopes.deliver(scope, read).then(value => ({ value, error: null }), error => ({ value: null, error }));
      await entered.promise;
      await revoke(f);
      release.resolve();
      const outcome = await observed;
      expect(outcome.value).toBeNull();
      expect(outcome.error).toBeInstanceOf(ExecutionReadScopeError);
      expect(read).toHaveBeenCalledTimes(1);
    });

  it.each([
    ["publication", "grant-revoke"], ["publication", "session-generation"],
    ["relations", "grant-revoke"], ["relations", "session-generation"],
  ] as const)("review001 final %s adapter await cannot resurrect %s authority", async (adapter, mutation) => {
    const f = await fixture(), scope = await f.authorize();
    let afterRead = false, intercepted = false;
    const entered = deferred(), release = deferred();
    const barrier = async () => {
      if (afterRead && !intercepted) { intercepted = true; entered.resolve(); await release.promise; }
    };
    if (adapter === "publication") f.trust.beforePublication = barrier;
    else f.trust.beforeRelations = async id => { if (id === researcher.userId) await barrier(); };
    const result = f.scopes.deliver(scope, async () => { afterRead = true; return "must-not-deliver"; })
      .then(value => ({ value, error: null }), error => ({ value: null, error }));
    await entered.promise;
    try {
      if (mutation === "grant-revoke") await revoke(f);
      else await ctx.pool.query("UPDATE portal_users SET session_version=session_version+1 WHERE user_id=$1", [f.p.user.userId]);
      // The adapter returns the same publication/membership revision as before.
      // Only the post-adapter DB fence can reject this final-delivery race.
    } finally { release.resolve(); }
    const outcome = await result;
    expect(intercepted).toBe(true);
    expect(outcome.value).toBeNull();
    expect(outcome.error).toBeInstanceOf(ExecutionReadScopeError);
  });

  it("review001 final relations await cannot deliver a linkage-only unlink after its first publication snapshot", async () => {
    const f = await fixture(), scope = await f.authorize();
    const repository = new AccessRepository(ctx.pool);
    const grantsBefore = await repository.grants(f.workspace);
    const sessionBefore = (await ctx.pool.query(
      "SELECT state,session_version,idle_expires_at,absolute_expires_at FROM auth_sessions WHERE session_id=$1",
      [f.p.session.sessionId])).rows[0];
    const ownBefore = [...f.trust.ownAlphaIds], memberBefore = [...f.trust.memberPortfolioIds];
    const tuplesBefore = structuredClone(f.trust.publication.tuples);
    let afterRead = false, finalPublicationCalls = 0, intercepted = false;
    const entered = deferred(), release = deferred();
    f.trust.beforePublication = async () => { if (afterRead) finalPublicationCalls += 1; };
    f.trust.beforeRelations = async id => {
      // Skip the first final-fence context capture. Block its later relations
      // pass only AFTER the first publication snapshot was already parsed.
      if (afterRead && finalPublicationCalls === 1 && id === researcher.userId && !intercepted) {
        intercepted = true;
        entered.resolve();
        await release.promise;
      }
    };
    const read = vi.fn(async () => { afterRead = true; return "must-not-deliver-after-source-unlink"; });
    const result = f.scopes.deliver(scope, read)
      .then(value => ({ value, error: null }), error => ({ value: null, error }));
    try {
      await Promise.race([entered.promise, result.then(() => { throw new Error("Final post-publication relations fence was not reached."); })]);
      expect(finalPublicationCalls).toBe(1);
      f.trust.publication.current_linkage!.pairs = [{ alpha_id: PEER.id, portfolio_id: LINKED.id }];
      f.trust.publication.current_linkage!.revision = "TEST_ONLY-current-linkage-r2-during-final-relations";
      expect(f.trust.ownAlphaIds).toEqual(ownBefore);
      expect(f.trust.memberPortfolioIds).toEqual(memberBefore);
      expect(f.trust.publication.tuples).toEqual(tuplesBefore);
      expect(await repository.grants(f.workspace)).toEqual(grantsBefore);
      expect((await ctx.pool.query(
        "SELECT state,session_version,idle_expires_at,absolute_expires_at FROM auth_sessions WHERE session_id=$1",
        [f.p.session.sessionId])).rows[0]).toEqual(sessionBefore);
    } finally { release.resolve(); }
    const outcome = await result;
    expect(intercepted).toBe(true);
    expect(finalPublicationCalls).toBeGreaterThanOrEqual(2);
    expect(read).toHaveBeenCalledTimes(1);
    expect(outcome.value).toBeNull();
    expect(outcome.error).toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
  });

  it("T04-07/12 grant expiry invalidates cached bytes even with unchanged grant revision", async () => {
    const f = await fixture(), scope = await f.authorize();
    const entered = deferred(), release = deferred();
    const result = f.scopes.deliver(scope, async () => { entered.resolve(); await release.promise; return "expired-bytes"; })
      .then(value => ({ value, error: null }), error => ({ value: null, error }));
    await entered.promise;
    // Expire in PostgreSQL without sleeping or changing revision; a stale
    // pre-await decision or revision-only cache must not survive this fact.
    await new AccessRepository(ctx.pool).saveGrant({ ...f.ownGrant!, valid_until_ms: Date.now() - 1 });
    release.resolve();
    const outcome = await result;
    expect(outcome.value).toBeNull();
    expect(outcome.error).toBeInstanceOf(ExecutionReadScopeError);
  });

  it("T04-07 revoking membership invalidates an accepted grant and a prior scope", async () => {
    const f = await fixture(), scope = await f.authorize();
    await ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [f.workspace, f.p.user.userId]);
    await refused(f.authorize());
    await refused(f.scopes.revalidate(scope));
  });

  it.each(["state", "idle", "absolute"] as const)("T04-12 stale session %s is not a read lease", async variant => {
    const f = await fixture(), scope = await f.authorize();
    const column = variant === "state" ? "state='REVOKED'" : variant === "idle" ? "idle_expires_at=clock_timestamp()-interval '1 second'" : "absolute_expires_at=clock_timestamp()-interval '1 second'";
    await ctx.pool.query(`UPDATE auth_sessions SET ${column} WHERE session_id=$1`, [f.p.session.sessionId]);
    await refused(f.authorize());
    await refused(f.scopes.revalidate(scope));
  });

  it("T04-08 stale policy and TS membership revisions invalidate old cursor scope", async () => {
    const f = await fixture(), scope = await f.authorize();
    f.trust.relationRevision = "TEST_ONLY-relations-r2";
    f.trust.membership.revision = "TEST_ONLY-membership-r2";
    await refused(f.scopes.revalidate(scope));
    f.policy.revision = next("policy-r2");
    await new AccessRepository(ctx.pool).putPolicy(f.policy);
    await refused(f.scopes.revalidate(scope));
  });

  it("T04-08 caller mutation during publication wait cannot widen the captured request", async () => {
    const f = await fixture(), entered = deferred(), release = deferred();
    let captured: ExecutionReadPublicationRequest | undefined;
    f.trust.beforePublication = async request => { captured = structuredClone(request); entered.resolve(); await release.promise; };
    const principalInput = { ...f.p, user: { ...f.p.user }, session: { ...f.p.session } };
    const bindingInput = structuredClone(BINDING), requirementInput = structuredClone(f.requirement);
    const result = f.scopes.authorize(principalInput, bindingInput, requirementInput);
    await entered.promise;
    principalInput.user.role = "ADMIN";
    principalInput.workspaceId = "TEST_ONLY-other-workspace";
    bindingInput.environment = "live";
    bindingInput.profileId = "TEST_ONLY-other-profile";
    requirementInput.dataset!.source_revision = "TEST_ONLY-mutated-source";
    release.resolve();
    const scope = await result;
    expect(captured).toMatchObject({ workspace_id: f.workspace, environment: "paper", profile_id: BINDING.profileId, binding: DATASET });
    expect(scope).toMatchObject({ workspaceId: f.workspace, environment: "paper", profileId: BINDING.profileId });
    expect(scopeTuples(scope)!.allowedTuples).toEqual([row(OWN_TUPLE)]);
  });

  it("T04-08 provider and consumer mutation cannot rewrite an already minted tuple capability", async () => {
    const f = await fixture(), scope = await f.authorize();
    const first = scopeTuples(scope)!;
    first.allowedTuples[0][0] = PEER.id;
    const resources = scopeResources(scope) as AccessResource[];
    if (resources[0]) resources[0].id = "TEST_ONLY-consumer-rewrite";
    f.trust.publication.tuples[0].account_id = PEER_TUPLE.account_id;
    f.trust.ownAlphaIds = [PEER.id];
    expect(scopeTuples(scope)!.allowedTuples).toEqual([row(OWN_TUPLE)]);
    expect(scopeResources(scope)).toContainEqual(OWN);
    await refused(f.scopes.revalidate(scope));
  });
});
