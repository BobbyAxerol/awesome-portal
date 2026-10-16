/**
 * ELP2-04 mounted history reader: isolated Core + Execution databases in the
 * one private test PostgreSQL. Real login/session cookies and SQL rows; every
 * business/source/topology/field-policy assertion is explicitly TEST_ONLY.
 * These definitions do not qualify TS or activate an existing runtime.
 */
import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { createControlApiApp } from "../src/app";
import { AdminService } from "../src/admin/admin.service";
import { AuthService } from "../src/auth/auth.service";
import { SESSION_COOKIE } from "../src/auth/cookies";
import { runControlApiMigrations } from "../src/cli/migrate";
import type { PortalUser, VerifiedAccessIdentity } from "../src/domain";
import { migrateExecutionStore } from "../src/execution/store-schema";
import { ExecutionProfileProjectionRepository } from "../src/execution/profile-projection.repository";
import type { AccessAction, ReviewedAccessPolicy, ResourceSelector, ScopedAccessGrant } from "../src/execution-v2/access.contract";
import { accessDigest, type AccessRelations } from "../src/execution-v2/access-policy";
import { AccessRepository } from "../src/execution-v2/access.repository";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import type { AccessTrustProvider, ReviewedPolicyArtifact } from "../src/execution-v2/access-trust";
import type { ExecutionReadPublication, ExecutionReadPublicationRequest } from "../src/execution-v2/read-publication";
import { ExecutionReadScopes } from "../src/execution-v2/read-scope";
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { testConfig } from "./harness";

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const KEY = "manager.performance:account_equity_snapshots";
const PROFILE = "PAPER_BINANCE_USDM", SANDBOX = "SANDBOX_BINANCE_USDM";
const PASSWORD = "elp204-history-test-only-correct-horse-2026";
const OWN = { alpha_id: "TEST_ONLY-own", alpha_version_id: "TEST_ONLY-own-v1", portfolio_id: "TEST_ONLY-shared-pf",
  deployment_id: "TEST_ONLY-own-deployment", account_id: "TEST_ONLY-shared-account" };
const PEER = { alpha_id: "TEST_ONLY-peer", alpha_version_id: "TEST_ONLY-peer-v1", portfolio_id: OWN.portfolio_id,
  deployment_id: "TEST_ONLY-peer-deployment", account_id: "TEST_ONLY-peer-account" };
const SHARED = { ...PEER, deployment_id: "TEST_ONLY-peer-shared-deployment", account_id: OWN.account_id };
const ORPHAN = { alpha_id: "TEST_ONLY-orphan", alpha_version_id: "TEST_ONLY-orphan-v1", portfolio_id: "TEST_ONLY-unknown-pf",
  deployment_id: "TEST_ONLY-orphan-deployment", account_id: "TEST_ONLY-orphan-account" };
const UNLINKED = { ...OWN, portfolio_id: "TEST_ONLY-former-pf", deployment_id: "TEST_ONLY-former-deployment", account_id: "TEST_ONLY-former-account" };
const TUPLES = [OWN, PEER, SHARED, ORPHAN, UNLINKED];
const RESOURCES = [...new Map(TUPLES.flatMap(t => [
  { kind: "ALPHA" as const, id: t.alpha_id }, { kind: "ALPHA_VERSION" as const, id: t.alpha_version_id },
  { kind: "PORTFOLIO" as const, id: t.portfolio_id }, { kind: "DEPLOYMENT" as const, id: t.deployment_id },
  { kind: "ACCOUNT" as const, id: t.account_id },
]).map(r => [JSON.stringify(r), r])).values()];
const FIELDS = ["alpha_id", "alpha_version_id", "portfolio_id", "deployment_id", "account_id", "equity", "currency", "timestamp_ms", "fill_id", "order_id", "price", "quantity", "state"];
const OWN_TIMES = ["2026-09-02T00:00:00.001Z", "2026-09-04T00:00:00.002Z", "2026-09-06T00:00:00.003Z"];
const EQUITY = "100.1234567890123456789";
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe.skipIf(!DATABASE_URL)("ELP2-04 mounted history read authorization, TEST_ONLY trust / real SQL", () => {
  const coreName = "elp204_history_core_" + randomUUID().replaceAll("-", "");
  const domainName = "elp204_history_exec_" + randomUUID().replaceAll("-", "");
  const created: string[] = [];
  const apps = new Set<Awaited<ReturnType<typeof createControlApiApp>>>();
  const url = (database: string) => { const value = new URL(DATABASE_URL!); value.pathname = "/" + database; return value.toString(); };
  let core: Pool, domain: Pool, bootstrap: Awaited<ReturnType<typeof createControlApiApp>>, auth: AuthService;
  type Session = Awaited<ReturnType<AuthService["login"]>>;
  type Account = { user: PortalUser; session: Session; assertion: string };
  let owner: Account, researcher: Account;
  let sequence = 0;
  const next = (label: string) => `elp204-history-${label}-${++sequence}`;
  const config = (workspace: string) => testConfig({ AUTH_MODE: "dev", DATABASE_URL: url(coreName), EXECUTION_DATABASE_URL: url(domainName),
    EXECUTION_READ_PROFILE: "retained_review_v1", FEATURE_EXECUTION_LOCAL_PROJECTION: "true",
    EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: workspace, EXECUTION_EDGE_PAPER_PROFILE_ID: PROFILE,
    EXECUTION_EDGE_SANDBOX_PROFILE_ID: SANDBOX, EXECUTION_EDGE_LIVE_PROFILE_ID: "LIVE_BINANCE_USDM" });

  beforeAll(async () => {
    const adminPool = new Pool({ connectionString: url("postgres"), max: 1 });
    try {
      for (const database of [coreName, domainName]) { await adminPool.query(`CREATE DATABASE ${database}`); created.push(database); }
    } finally { await adminPool.end(); }
    core = new Pool({ connectionString: url(coreName), max: 2 });
    domain = new Pool({ connectionString: url(domainName), max: 2 });
    await runControlApiMigrations(url(coreName), undefined, () => {});
    await migrateExecutionStore(domain);
    bootstrap = await createControlApiApp(testConfig({ DATABASE_URL: url(coreName), EXECUTION_DATABASE_URL: url(domainName) }), core, domain);
    auth = bootstrap.get(AuthService);
    vi.spyOn(auth, "verifyAccessIdentity").mockImplementation(async assertion => ({
      iss: "https://test-only.cloudflareaccess.com", sub: `TEST_ONLY:${assertion}`, aud: "test-audience",
      email: `${assertion}@azdag.com`, normalizedEmail: `${assertion}@azdag.com`,
      authenticationTime: new Date(), tokenExpiresAt: new Date(Date.now() + 3_600_000),
    } satisfies VerifiedAccessIdentity));
    const admin = new AdminService(core, testConfig({ DATABASE_URL: url(coreName) }), auth);
    const active = async (label: string, role: "ADMIN" | "USER"): Promise<Account> => {
      const username = next(label), user = await admin.createUser({ username, displayName: username, role });
      const activation = await admin.resetCredential(user.userId);
      const initial = await auth.login({ assertion: username, username, credential: activation.activationToken });
      await auth.changePassword({ sessionToken: initial.token, csrfToken: initial.csrfToken,
        currentPassword: activation.activationToken, newPassword: PASSWORD });
      return { user: (await auth.users.findById(user.userId))!, assertion: username,
        session: await auth.login({ assertion: username, username, credential: PASSWORD }) };
    };
    owner = await active("owner", "ADMIN");
    await new OwnerAccessRepository(core).claimOwner({ userId: owner.user.userId, claimedBy: "ELP2-04_HISTORY_TEST_ONLY" });
    researcher = await active("researcher", "USER");
  }, 90_000);

  afterEach(async () => { for (const app of apps) await app.close(); apps.clear(); });
  afterAll(async () => {
    if (bootstrap) await bootstrap.close();
    vi.restoreAllMocks();
    await Promise.all([core?.end(), domain?.end()]);
    const adminPool = new Pool({ connectionString: url("postgres"), max: 1 });
    try { for (const database of created) await adminPool.query(`DROP DATABASE ${database} WITH (FORCE)`); }
    finally { await adminPool.end(); }
  });

  class TestOnlyHistoryTrust implements AccessTrustProvider {
    readonly requests: ExecutionReadPublicationRequest[] = [];
    readonly membership = { revision: "TEST_ONLY-membership-r1", receipt_id: "TEST_ONLY-membership-receipt", mapping_revision: "TEST_ONLY-mapping-r1" };
    publicationQualification: "SOURCE_VERIFIED" | "TEST_ONLY" = "TEST_ONLY";
    bindingRevisionOverride: string | undefined;
    constructor(readonly artifact: ReviewedPolicyArtifact) {}
    async verifyPolicy(input: unknown) { return input === this.artifact ? this.artifact : null; }
    async verifyReceipt() { return null; }
    async verifiedHumanMapping() { return null; }
    async relations(userId: string, workspace: string): Promise<AccessRelations> {
      return { qualified: workspace === this.artifact.policy.workspace_id, revision: "TEST_ONLY-history-relations-r1",
        own_alpha_ids: userId === researcher.user.userId ? [OWN.alpha_id] : [],
        member_portfolio_ids: userId === researcher.user.userId ? [OWN.portfolio_id] : [],
        roots: { "TEST_ONLY-history-root": structuredClone(RESOURCES) }, membership: { ...this.membership } };
    }
    async readPublication(request: ExecutionReadPublicationRequest): Promise<ExecutionReadPublication> {
      this.requests.push(structuredClone(request));
      return { workspace_id: request.workspace_id, environment: request.environment, profile_id: request.profile_id,
        qualification: this.publicationQualification, publication_revision: "TEST_ONLY-history-population-r1",
        binding: { ...structuredClone(request.binding), source_revision: this.bindingRevisionOverride ?? request.binding.source_revision }, population_coverage: "COMPLETE_FOR_DATASET_WINDOW",
        provenance_ref: "TEST_ONLY-NOT-SOURCE-QUALIFICATION", resources: structuredClone(RESOURCES), tuples: structuredClone(TUPLES),
        strategy_lineage:{qualification:"TEST_ONLY",revision:"TEST_ONLY-strategy-r1",provenance_ref:"TEST_ONLY-not-source-proof",
          pairs:[...new Set(TUPLES.map(t=>t.alpha_id))].map(alpha_id=>({alpha_id,strategy_id:`strategy:${alpha_id}`}))},
        current_linkage: { qualification: "TEST_ONLY", revision: "TEST_ONLY-history-link-r1", provenance_ref: "TEST_ONLY-current-topology",
          pairs: [{ alpha_id: OWN.alpha_id, portfolio_id: OWN.portfolio_id }, { alpha_id: PEER.alpha_id, portfolio_id: OWN.portfolio_id }] } };
    }
  }

  async function fixture(options: { legacy?: boolean; defaultTrust?: boolean; full?: boolean } = {}) {
    const workspace = next("workspace"), cfg = config(workspace);
    await core.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,$2,$3)", [workspace, "TEST_ONLY history", owner.user.userId]);
    for (const account of [owner, researcher]) await core.query(
      "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,$3)",
      [workspace, account.user.userId, account === owner ? "OWNER" : "MEMBER"]);
    const policy: ReviewedAccessPolicy = { workspace_id: workspace, revision: next("policy-r1"),
      artifact_digest: accessDigest(["TEST_ONLY-history-policy", workspace]), approval_ref: "TEST_ONLY-NOT-OWNER-APPROVAL",
      state: "REVIEWED", qualification: "TEST_ONLY", protected_owner_user_id: owner.user.userId,
      researcher_fields: { state: "QUALIFIED", policy_ref: "TEST_ONLY-history-fields-v1", fields: [...FIELDS] } };
    const artifact: ReviewedPolicyArtifact = { policy, root_grants: [], provenance_ref: "TEST_ONLY-history-policy" };
    const trust = new TestOnlyHistoryTrust(artifact);
    const access = new ExecutionAccessService(core, auth, trust, true);
    const addGrant = async (action: AccessAction, selector: ResourceSelector, subject = researcher): Promise<ScopedAccessGrant> => {
      const now = Date.now();
      const grant: ScopedAccessGrant = { grant_id: next("grant"), subject_user_id: subject.user.userId, workspace_id: workspace,
        action, effect: "ALLOW", selector, environments: ["paper", "sandbox"], valid_from_ms: now - 60_000,
        valid_until_ms: now + 3_600_000, delegable_actions: [], issued_by: owner.user.userId, parent_grant_id: null,
        revision: next("grant-r1"), policy_revision: policy.revision, revoked_at_ms: null,
        requires_ts_acceptance: true, ts_receipt: { receipt_id: trust.membership.receipt_id,
          mapping_revision: trust.membership.mapping_revision, membership_revision: trust.membership.revision,
          effective_at_ms: now - 60_000, expires_at_ms: now + 3_600_000 }, field_policy_ref: policy.researcher_fields.policy_ref };
      // Accepted facts are injected only into disposable PostgreSQL beneath the
      // production verifier. This is not proof of TS acceptance/publication.
      await new AccessRepository(core).saveGrant(grant, true);
      return grant;
    };
    let ownGrant: ScopedAccessGrant | null = null;
    if (!options.legacy) {
      await access.installReviewedPolicy(artifact);
      ownGrant = options.full ? await addGrant("business.read_all", { kind: "ROOT_SCOPE", root_id: "TEST_ONLY-history-root" })
        : await addGrant("alpha.read", { kind: "OWN_ALPHA" });
      if (!options.full) await addGrant("portfolio.read_restricted", { kind: "PORTFOLIO_MEMBERSHIP", portfolio_ids: [OWN.portfolio_id] });
    }
    const sourceRevision = "sha256:" + accessDigest([workspace, "TEST_ONLY-history-source"]).replace(/^sha256:/, "");
    for (const [environment, profile] of [["paper", PROFILE], ["sandbox", SANDBOX]] as const) {
      const payload = { schema_version: "portal.execution.profile-projection.v1", workspace_id: workspace, environment,
        profile_id: profile, source_contract_revision: "TEST_ONLY", relations: {} };
      await domain.query(`INSERT INTO execution_profile_projection_snapshots(workspace_id,environment,profile_id,source_epoch,source_cursor,
        source_contract_revision,source_as_of,received_at,last_successful_refresh_at,completeness,projection_epoch,projection_sequence,payload_digest,payload)
        VALUES($1,$2,$3,'TEST_ONLY','TEST_ONLY','TEST_ONLY',NULL,clock_timestamp(),clock_timestamp(),'PARTIAL',$4,1,$5,$6::jsonb)`,
      [workspace, environment, profile, randomUUID(), sourceRevision, JSON.stringify(payload)]);
    }
    const insert = async (id: string, ts: string, tuple: typeof OWN, equity: string, environment = "paper", profile = PROFILE) => {
      await domain.query(`INSERT INTO execution_timeseries_history(workspace_id,environment,profile_id,relation_key,row_id,ts,fields)
        VALUES($1,$2,$3,$4,$5,$6::timestamptz,$7::jsonb)`, [workspace, environment, profile, KEY, id, ts,
        JSON.stringify({ ...tuple, ts, equity, currency: "USDT", physical_balance: "TEST_ONLY-HIDDEN-CUSTODY", private_key: "TEST_ONLY-MUST-NOT-LEAVE" })]);
    };
    for (const [index, ts] of OWN_TIMES.entries()) await insert(`own-${index}`, ts, OWN, index === 0 ? EQUITY : String(101 + index));
    await insert("peer-old", "2026-09-01T00:00:00.000Z", PEER, "900001.123456789");
    await insert("peer-new", "2026-09-09T00:00:00.000Z", PEER, "900002.123456789");
    await insert("shared-account-peer", "2026-09-03T00:00:00.000Z", SHARED, "900003.123456789");
    await insert("orphan", "2026-09-10T00:00:00.000Z", ORPHAN, "900004.123456789");
    await insert("unlinked", "2026-09-11T00:00:00.000Z", UNLINKED, "900005.123456789");
    await insert("sandbox-own", OWN_TIMES[0], OWN, "800001.123456789", "sandbox", SANDBOX);
    const app = await createControlApiApp(cfg, core, domain, { allowTestOnlyExecutionAccess: true,
      ...(options.defaultTrust ? {} : { executionAccessTrust: trust }) });
    apps.add(app);
    const server = app.getHttpAdapter().getInstance();
    const get = (query: Record<string, string | number> = {}, account = researcher, environment = "paper") => {
      const params = new URLSearchParams(Object.entries(query).map(([key, value]) => [key, String(value)]));
      return server.inject({ method: "GET", url: `/api/v1/execution/history/${environment}/${encodeURIComponent(KEY)}?${params}`,
        headers: { cookie: `${SESSION_COOKIE}=${account.session.token}` } });
    };
    return { workspace, cfg, app, trust, policy, ownGrant, sourceRevision, get, addGrant, insert };
  }

  it("T04-01/04 scopes exact tuples before count, bounds and page; shared accounts do not reveal peer finance", async () => {
    const f = await fixture(), response = await f.get({ limit: 1 });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.read_scope).toMatchObject({ visibility: "SCOPED", coverage: "AUTHORIZED_ONLY", policy_revision: f.policy.revision });
    expect(body.schema_version).toBe("portal.execution.timeseries-history.v2");
    expect(body.coverage).toMatchObject({ row_count: 3, oldest_ms: Date.parse(OWN_TIMES[0]), newest_ms: Date.parse(OWN_TIMES[2]) });
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ ...OWN, equity: EQUITY });
    expect(body.page).toMatchObject({ returned_count: 1, has_more: true });
    expect(body.page.next_cursor).toEqual(expect.any(String));
    expect(body.page).not.toHaveProperty("next_after_id");
    expect(body.page).not.toHaveProperty("next_after_ts");
    for (const hidden of ["900001.123456789", "900002.123456789", "900003.123456789", "900004.123456789", "900005.123456789", "TEST_ONLY-HIDDEN-CUSTODY", "TEST_ONLY-MUST-NOT-LEAVE"])
      expect(response.body).not.toContain(hidden);
    expect(Object.keys(body.items[0]).every(key => FIELDS.includes(key))).toBe(true);
  });

  it("T04-03/08 opaque continuation keeps whole authorized coverage, not the last page population", async () => {
    const f = await fixture();
    const first = await f.get({ limit: 1 }), second = await f.get({ limit: 1, cursor: first.json().page.next_cursor });
    const third = await f.get({ limit: 1, cursor: second.json().page.next_cursor });
    expect([first.statusCode, second.statusCode, third.statusCode]).toEqual([200, 200, 200]);
    expect([first.json().items[0].timestamp_ms, second.json().items[0].timestamp_ms, third.json().items[0].timestamp_ms]).toEqual(OWN_TIMES.map(Date.parse));
    for (const response of [first, second, third]) expect(response.json().coverage.row_count).toBe(3);
    expect(third.json().page).toMatchObject({ has_more: false, next_cursor: null });
  });

  it("T04-03 the trusted publication binds the selected history and exact requested UTC window", async () => {
    const f = await fixture();
    const response = await f.get({ from: OWN_TIMES[1], to: OWN_TIMES[2], limit: 20 });
    expect(response.statusCode).toBe(200);
    expect(response.json().coverage).toMatchObject({ row_count: 1, oldest_ms: Date.parse(OWN_TIMES[1]), newest_ms: Date.parse(OWN_TIMES[1]), range: "START_INCLUSIVE_END_EXCLUSIVE" });
    expect(f.trust.requests.length).toBeGreaterThan(0);
    for (const request of f.trust.requests) expect(request).toMatchObject({ workspace_id: f.workspace, environment: "paper", profile_id: PROFILE,
      binding: { dataset_id: `history:${KEY}`, source_revision: f.sourceRevision,
        window: { from_ms: Date.parse(OWN_TIMES[1]), to_ms: Date.parse(OWN_TIMES[2]) } } });
  });

  it("T04-03 history-derived extrema filter peer rows before counts and bucket selection", async () => {
    const f=await fixture(),repository=f.app.get(ExecutionProfileProjectionRepository);
    const metadata=(await repository.snapshotMetadata(f.workspace,"paper",PROFILE))!;
    const scopes=f.app.get(ExecutionReadScopes);
    const scope=await scopes.authorize({user:researcher.user,session:(await auth.sessionFromToken(researcher.session.token))!,workspaceId:f.workspace},
      {environment:"paper",profileId:PROFILE},{action:"alpha.read",dataset:{dataset_id:`history:${KEY}`,source_revision:metadata.payloadDigest,
        projection_generation:metadata.projectionEpoch,catalogue_revision:metadata.sourceCatalogueSha256,window:null}});
    const read=await scopes.deliver(scope,()=>repository.timeSeriesHistoryDownsampled(f.workspace,"paper",PROFILE,KEY,
      {from:"2026-09-01T00:00:00Z",seriesField:"account_id",valueField:"equity",targetPoints:2,scope}));
    expect(read.sourceRows).toBe(3);
    expect(read.downsample).toMatchObject({input_rows:3,series_count:1});
    expect(read.rows.every(row=>row.fields.alpha_id===OWN.alpha_id)).toBe(true);
    expect(JSON.stringify(read)).not.toMatch(/900001|900002|900003|900004|900005/);
    await expect(repository.timeSeriesHistoryDownsampled(f.workspace,"paper",PROFILE,KEY,
      {from:"2026-09-01T00:00:00Z",seriesField:"account_id",valueField:"physical_balance",targetPoints:2,scope}))
      .rejects.toMatchObject({code:"EXECUTION_READ_FIELD_POLICY_PENDING"});
  });

  it("T04-03 downsample exact fallback keeps the same scope and end-exclusive window", async () => {
    const f=await fixture(),repository=f.app.get(ExecutionProfileProjectionRepository);
    const metadata=(await repository.snapshotMetadata(f.workspace,"paper",PROFILE))!;
    const from=OWN_TIMES[0],to=OWN_TIMES[2],scopes=f.app.get(ExecutionReadScopes);
    const scope=await scopes.authorize({user:researcher.user,session:(await auth.sessionFromToken(researcher.session.token))!,workspaceId:f.workspace},
      {environment:"paper",profileId:PROFILE},{action:"alpha.read",dataset:{dataset_id:`history:${KEY}`,source_revision:metadata.payloadDigest,
        projection_generation:metadata.projectionEpoch,catalogue_revision:metadata.sourceCatalogueSha256,window:{from_ms:Date.parse(from),to_ms:Date.parse(to)}}});
    const read=await repository.timeSeriesHistoryDownsampled(f.workspace,"paper",PROFILE,KEY,
      {from,to,seriesField:"account_id",valueField:"equity",targetPoints:20,scope});
    expect(read.sourceRows).toBe(2);expect(read.downsample).toBeNull();expect(read.rows).toHaveLength(2);
    expect(read.rows.every(row=>Date.parse(row.ts)<Date.parse(to)&&row.fields.alpha_id===OWN.alpha_id)).toBe(true);
  });

  it("T04-04/08 scoped subject fills use exact SQL count, microsecond keyset and qualified Alpha identity", async()=>{
    const f=await fixture(),key="manager.fills:fills";
    const relation={source_id:"manager.fills",relation:"fills",availability:"AVAILABLE",reason_code:null,as_of:null,
      freshness:"STALE",completeness:"PARTIAL",items:[]};
    await domain.query("UPDATE execution_profile_projection_snapshots SET payload=jsonb_set(payload,ARRAY['relations',$2],$3::jsonb) WHERE workspace_id=$1 AND environment='paper'",
      [f.workspace,key,JSON.stringify(relation)]);
    for(const [id,tuple,ts] of [["own-first",OWN,"2026-09-04T00:00:00.000001Z"],["own-second",OWN,"2026-09-04T00:00:00.000002Z"],["peer",PEER,"2026-09-04T00:00:00.000003Z"]] as const)
      await domain.query(`INSERT INTO execution_timeseries_history(workspace_id,environment,profile_id,relation_key,row_id,ts,fields)
        VALUES($1,'paper',$2,$3,$4,$5::timestamptz,$6::jsonb)`,[f.workspace,PROFILE,key,id,ts,
        JSON.stringify({...tuple,strategy_id:`strategy:${tuple.alpha_id}`,fill_id:id,price:"10.1234567890123456789",quantity:"0",physical_balance:"HIDDEN_CUSTODY"})]);
    const server=f.app.getHttpAdapter().getInstance();
    const get=(after?:string)=>server.inject({method:"GET",url:`/api/v1/execution/resources/alphas/${OWN.alpha_id}/fills?environment=paper&workspace_id=${f.workspace}&limit=1${after?`&after=${encodeURIComponent(after)}`:""}`,
      headers:{cookie:`${SESSION_COOKIE}=${researcher.session.token}`}});
    const first=await get();expect(first.statusCode,first.body).toBe(200);
    expect(first.json()).toMatchObject({schema_version:"portal.execution.subject-records.v2",coverage:{retained_row_count:2},
      records:[{record_id:"own-second",values:{price:"10.1234567890123456789",quantity:"0"}}]});
    const second=await get(first.json().page.next_cursor);expect(second.statusCode,second.body).toBe(200);
    expect(second.json().records[0].record_id).toBe("own-first");expect(second.json().page.next_cursor).toBeNull();
    expect(first.body+second.body).not.toMatch(/HIDDEN_CUSTODY|TEST_ONLY-peer/);
    await new AccessRepository(core).saveGrant({...f.ownGrant!,revoked_at_ms:Date.now(),revision:next("revoked")});
    expect([403,404,409]).toContain((await get(first.json().page.next_cursor)).statusCode);
  });

  it.each(["physical_balance", "private_key", "sort", "filter"])("T04-05/10 rejects hidden or unreviewed query key %s before inference", async field => {
    const f = await fixture();
    expect((await f.get({ [field]: "TEST_ONLY-HIDDEN", limit: 1 })).statusCode).toBe(400);
  });

  it("T04-09 hidden and unknown account filters have the same safe refusal/authorized-empty disposition", async () => {
    const f = await fixture();
    const hidden = await f.get({ account_id: PEER.account_id }), unknown = await f.get({ account_id: "TEST_ONLY-never-published-account" });
    expect(hidden.statusCode).toBe(unknown.statusCode);
    expect([200, 404]).toContain(hidden.statusCode);
    if (hidden.statusCode === 200) for (const response of [hidden, unknown]) {
      expect(response.json()).toMatchObject({ state: "EMPTY", items: [], coverage: { row_count: 0, oldest_ms: null, newest_ms: null } });
    }
    else expect(hidden.json().error).toEqual(unknown.json().error);
  });

  it.each(["after_ts", "after_id"])("T04-08 V2 forbids raw keyset parameter %s instead of accepting a forged continuation", async key => {
    const f = await fixture();
    expect((await f.get({ [key]: key === "after_ts" ? OWN_TIMES[0] : "own-0" })).statusCode).toBe(400);
  });

  it("T04-08 cursor binds profile, page shape, actor/session and current authority", async () => {
    const f = await fixture();
    const first = await f.get({ limit: 1 });
    expect(first.statusCode).toBe(200);
    const cursor = first.json().page.next_cursor;
    await f.addGrant("business.read_all", { kind: "ROOT_SCOPE", root_id: "TEST_ONLY-history-root" }, owner);
    // Paper's relation is not in the Sandbox catalogue. Catalogue refusal
    // precedes cursor validation; inserting a row cannot commission a route.
    const unavailable = await f.get({ limit: 1, cursor }, researcher, "sandbox");
    expect(unavailable.statusCode).toBe(404);
    expect(unavailable.json().error.code).toBe("N33_HISTORY_RELATION_NOT_ACCEPTED");
    expect(unavailable.body).not.toContain(EQUITY);
    for (const response of [await f.get({ limit: 2, cursor }),
      await f.get({ limit: 1, cursor }, owner)]) expect([400, 409]).toContain(response.statusCode);
    await new AccessRepository(core).saveGrant({ ...f.ownGrant!, revision: next("grant-r2") });
    expect([400, 409]).toContain((await f.get({ limit: 1, cursor })).statusCode);
  });

  it("T04-08 workspace mismatch cannot reuse another source workspace's cursor", async () => {
    const first = await fixture(), firstResponse = await first.get({ limit: 1 });
    expect(firstResponse.statusCode).toBe(200);
    const other = await fixture(), cursor = firstResponse.json().page.next_cursor;
    expect((await first.get({ workspace_id: other.workspace, limit: 1, cursor })).statusCode).toBe(404);
    expect([400, 409]).toContain((await other.get({ limit: 1, cursor })).statusCode);
  });

  it("T04-01 explicit full-business permission preserves all retained lineage, including orphan history", async () => {
    const f = await fixture({ full: true }), response = await f.get({ limit: 50 });
    expect(response.statusCode).toBe(200);
    expect(response.json().coverage.row_count).toBe(8);
    expect(response.json().items).toHaveLength(8);
    expect(response.json().items.some((item: Record<string, unknown>) => item.alpha_id === ORPHAN.alpha_id)).toBe(true);
    expect(response.body).not.toContain("TEST_ONLY-MUST-NOT-LEAVE");
  });

  it("T04-07/12 final in-flight grant revocation blocks rows already read from SQL", async () => {
    const f = await fixture(), entered = deferred(), release = deferred();
    const repository = f.app.get(ExecutionProfileProjectionRepository);
    const original = repository.timeSeriesHistory.bind(repository);
    const spy = vi.spyOn(repository, "timeSeriesHistory").mockImplementation(async (...args: Parameters<typeof original>) => {
      const page = await original(...args); entered.resolve(); await release.promise; return page;
    });
    const responsePromise = f.get({ limit: 1 });
    try {
      await Promise.race([entered.promise, responsePromise.then(() => { throw new Error("Mounted history SQL barrier was not reached."); })]);
      await new AccessRepository(core).saveGrant({ ...f.ownGrant!, revoked_at_ms: Date.now(), revision: next("revoked") });
    } finally { release.resolve(); }
    const response = await responsePromise;
    spy.mockRestore();
    expect([404, 409]).toContain(response.statusCode);
    expect(response.body).not.toContain(EQUITY);
    expect(response.json()).not.toHaveProperty("items");
  });

  it("T04-03 default-unqualified producer cannot turn installed V2 policy into a broad retained read", async () => {
    const f = await fixture({ defaultTrust: true }), response = await f.get();
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED");
    expect(response.body).not.toContain(EQUITY);
  });

  it("T04-03 refuses mismatched qualified-publication binding instead of treating request echo as source proof", async () => {
    const f = await fixture();
    f.trust.bindingRevisionOverride = "TEST_ONLY-wrong-revision";
    const response = await f.get();
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED");
    expect(response.body).not.toContain(EQUITY);
  });

  it("T04-08 accepts exact workspace routing but refuses equal-endpoint V2 ranges with a query error", async () => {
    const f = await fixture();
    expect((await f.get({ workspace_id: f.workspace })).statusCode).toBe(200);
    const response = await f.get({ from: OWN_TIMES[0], to: OWN_TIMES[0] });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("N33_HISTORY_RANGE_INVALID");
  });

  it("T04-08 private keyset preserves microseconds even though public time is UTC milliseconds", async () => {
    const f = await fixture();
    await f.insert("own-micro-1", "2026-09-02T00:00:00.001123Z", OWN, "104");
    await f.insert("own-micro-2", "2026-09-02T00:00:00.001456Z", OWN, "105");
    const values: string[] = [], cursors = new Set<string>();
    let cursor: string | null = null;
    for (let count = 0; count < 6; count++) {
      const response = await f.get({ limit: 1, ...(cursor ? { cursor } : {}) });
      expect(response.statusCode).toBe(200);
      const body = response.json(); values.push(...body.items.map((item: { equity: string }) => item.equity));
      cursor = body.page.next_cursor;
      if (!cursor) break;
      expect(cursors.has(cursor)).toBe(false); cursors.add(cursor);
    }
    expect(values).toEqual([EQUITY, "104", "105", "102", "103"]);
    expect(cursor).toBeNull();
  });

  it("T04-03 count and page share the same SQL snapshot under concurrent append", async () => {
    const f = await fixture(), repository = f.app.get(ExecutionProfileProjectionRepository);
    const original = repository.timeSeriesHistory.bind(repository);
    const spy = vi.spyOn(repository, "timeSeriesHistory").mockImplementation(async (...args: Parameters<typeof original>) => {
      const page = await original(...args);
      await f.insert("late-own", "2026-09-07T00:00:00.001Z", OWN, "104");
      return page;
    });
    const response = await f.get({ limit: 20 }); spy.mockRestore();
    expect(response.statusCode).toBe(200);
    expect(response.json().items).toHaveLength(3);
    expect(response.json().coverage.row_count).toBe(3);
  });

  it("T04-12 refuses a source revision cutover after SQL instead of delivering old authority with new metadata", async () => {
    const f = await fixture(), repository = f.app.get(ExecutionProfileProjectionRepository);
    const original = repository.timeSeriesHistory.bind(repository);
    const spy = vi.spyOn(repository, "timeSeriesHistory").mockImplementation(async (...args: Parameters<typeof original>) => {
      const page = await original(...args);
      const changed = await domain.query("UPDATE execution_profile_projection_snapshots SET payload_digest=$2 WHERE workspace_id=$1",
        [f.workspace, "sha256:" + accessDigest([f.workspace, "TEST_ONLY-new-source-revision"]).replace(/^sha256:/, "")]);
      expect(changed.rowCount).toBeGreaterThan(0);
      return page;
    });
    const response = await f.get({ limit: 1 }); spy.mockRestore();
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("EXECUTION_READ_ACCESS_CHANGED");
    expect(response.body).not.toContain(EQUITY);
  });

  it("T04-12 same payload in a different projection epoch invalidates both an in-flight response and an old cursor", async () => {
    const f = await fixture(), first = await f.get({ limit: 1 });
    expect(first.statusCode).toBe(200);
    const cursor = first.json().page.next_cursor;
    const repository = f.app.get(ExecutionProfileProjectionRepository), original = repository.timeSeriesHistory.bind(repository);
    const spy = vi.spyOn(repository, "timeSeriesHistory").mockImplementation(async (...args: Parameters<typeof original>) => {
      const page = await original(...args);
      await domain.query("UPDATE execution_profile_projection_snapshots SET projection_epoch=$2 WHERE workspace_id=$1", [f.workspace, randomUUID()]);
      return page;
    });
    const response = await f.get({ limit: 1 }); spy.mockRestore();
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("EXECUTION_READ_ACCESS_CHANGED");
    expect(response.body).not.toContain(EQUITY);
    const continued = await f.get({ limit: 1, cursor });
    expect([400, 409]).toContain(continued.statusCode);
    expect(continued.json()).not.toHaveProperty("items");
  });

  it("T04-11 published invalid financial scalars are refused, never coerced or shown as zero", async () => {
    const f = await fixture();
    await domain.query("UPDATE execution_timeseries_history SET fields=jsonb_set(fields,'{equity}','123'::jsonb) WHERE workspace_id=$1 AND row_id='own-0'", [f.workspace]);
    const response = await f.get();
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("N33_HISTORY_SCOPE_RESPONSE_INVALID");
    expect(response.json()).not.toHaveProperty("items");
  });

  it("T04-06 legacy compatibility preserves historical items and raw pagination, never labels it scoped V2", async () => {
    const f = await fixture({ legacy: true }), response = await f.get({ limit: 1 });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.coverage.row_count).toBe(8);
    expect(body.page).toMatchObject({ returned_count: 1, has_more: true, next_after_id: "peer-old", next_after_ts: "2026-09-01T00:00:00.000Z" });
    expect(body).not.toHaveProperty("read_scope");
    expect(body.page).not.toHaveProperty("next_cursor");
  });
});
