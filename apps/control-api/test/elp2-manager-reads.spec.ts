/** Real PostgreSQL scope + raw Manager reader; topology and source facts are
 * TEST_ONLY. This does not qualify a production TS publication or field policy. */
import "reflect-metadata";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AdminService } from "../src/admin/admin.service";
import { AuthService } from "../src/auth/auth.service";
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { SessionsRepository } from "../src/repos/sessions";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import { AccessRepository } from "../src/execution-v2/access.repository";
import { accessDigest, type AccessRelations } from "../src/execution-v2/access-policy";
import type { AccessAction, AccessResource, ResourceSelector, ScopedAccessGrant, ReviewedAccessPolicy } from "../src/execution-v2/access.contract";
import type { AccessTrustProvider, ReviewedPolicyArtifact } from "../src/execution-v2/access-trust";
import type { ExecutionReadPublicationRequest, ExecutionReadPublication } from "../src/execution-v2/read-publication";
import { ExecutionReadScopes, type ReadScopePrincipal } from "../src/execution-v2/read-scope";
import { ExecutionProfileProjectionRepository, type ProfileProjectionDocument } from "../src/execution/profile-projection.repository";
import { ScopedManagerReader, composeManagerItems } from "../src/manager-lists/scoped-manager.reader";
import { ExecutionProfileReadAdapterService } from "../src/execution/profile-read-adapter.service";
import { ExecutionFinancialChartService } from "../src/execution/financial-chart.service";
import { ExecutionDurableFinancialRepository } from "../src/execution/durable-financial.repository";
import { ExecutionDurableMirrorRepository } from "../src/execution/durable-mirror.repository";
import { ExecutionFinancialQueryCursorRepository } from "../src/execution/financial-query-cursor.repository";
import { migrateExecutionStore } from "../src/execution/store-schema";
import { CommandCenterRepository } from "../src/command-center/command-center.repository";
import { AlphaFleetQuerySchema, BindingsQuerySchema } from "../src/manager-lists/contracts";
import { scopedManagerResponseSchema } from "../src/manager-lists/scoped-manager.contract";
import type { AuthSession, PortalUser, VerifiedAccessIdentity } from "../src/domain";
import { migrateTestDatabase, setupApp, teardownApp, testConfig } from "./harness";
import { productReadFixture, OWN as PRODUCT_OWN } from "./elp2-product-read.fixture";
import { ManagerModelService } from "../src/execution-v2/manager-model.service";
import { persistManagerProjection, prepareManagerProjection } from "../src/execution-v2/manager-model.store";
import type { ManagerModelDocument } from "../src/execution-v2/manager-model.contract";
import type { DatasetPublication } from "../src/execution-v2/publication.contract";
import { ManagerProjectionLeases } from "../src/execution-v2/manager-lease";
import { loadPublicationCommissioning } from "../src/execution-v2/publication-adapter";
import { EXECUTION_PUBLICATION_CATALOGUE } from "../src/execution-v2/publication-source.generated";

const OWN = { alpha_id: "TEST-own", alpha_version_id: "TEST-av", portfolio_id: "TEST-shared-pf", deployment_id: "TEST-own-dep", account_id: "TEST-shared-account" };
const PEER = { alpha_id: "TEST-peer", alpha_version_id: "TEST-peer-av", portfolio_id: OWN.portfolio_id, deployment_id: "TEST-peer-dep", account_id: OWN.account_id };
const PRIVATE = { ...PEER, portfolio_id: "TEST-private-pf", account_id: "TEST-peer-account", deployment_id: "TEST-private-dep" };
const tuples = [OWN, PEER, PRIVATE];
const resources: AccessResource[] = [...new Map(tuples.flatMap(tuple => [
  { kind: "ALPHA" as const, id: tuple.alpha_id }, { kind: "ALPHA_VERSION" as const, id: tuple.alpha_version_id },
  { kind: "PORTFOLIO" as const, id: tuple.portfolio_id }, { kind: "DEPLOYMENT" as const, id: tuple.deployment_id },
  { kind: "ACCOUNT" as const, id: tuple.account_id },
]).map(resource => [JSON.stringify(resource), resource])).values(), { kind: "BINDING", id: "TEST-own-binding" }, { kind: "BINDING", id: "TEST-peer-binding" }];
const PROFILE = "PAPER_BINANCE_USDM", SANDBOX = "SANDBOX_BINANCE_USDM";
const fields = ["alpha_id", "alpha_version_id", "portfolio_id", "deployment_id", "account_id", "binding_id", "name", "state", "stage", "venue", "currency", "base_currency", "allocation", "balance_total", "balance_free", "balance_locked", "realized_pnl", "unrealized_pnl", "exposure", "updated_at", "timestamp_ms", "equity", "strategy_id", "risk_grant_id", "created_at", "environment"];

describe("ELP2-06 current Manager position relation compatibility / TEST_ONLY", () => {
  async function positionFacts(options: { canonical?: boolean; legacy?: boolean; unavailable?: boolean }) {
    const f = productReadFixture({ fields });
    const relation = (name: string, unrealized: string, unavailable = false) => ({
      source_id: "manager.positions", relation: name, availability: unavailable ? "UNAVAILABLE" as const : "AVAILABLE" as const,
      reason_code: unavailable ? "SOURCE_NOT_PUBLISHED" : null, as_of: null,
      freshness: "UNKNOWN" as const, completeness: "PARTIAL" as const,
      // Actual positions_v2 carries strategy/account identity, not the full
      // deployment tuple. Currency is not published by this relation either.
      items: [
        { position_id: "position-own", strategy_id: "strategy-own", account_id: PRODUCT_OWN.account_id,
          realized_pnl: "0", unrealized_pnl: unrealized, notional: "123.0000000000000001" },
        { position_id: "position-peer", strategy_id: "strategy-peer", account_id: PRODUCT_OWN.account_id,
          realized_pnl: "0", unrealized_pnl: "990001", notional: "990002" },
      ].map(value => ({ lineage: { workspace_id: f.principal.workspaceId, profile_id: "PAPER_BINANCE_USDM",
        source_contract_revision: "TEST_ONLY" }, fields: value })),
    });
    f.snapshot.document.relations = {
      ...(options.canonical ? { "manager.positions:positions_v2": relation("positions_v2", "2.1000000000000001", options.unavailable) } : {}),
      ...(options.legacy ? { "historical:positions": relation("positions", "9.2") } : {}),
    };
    const scope = await f.scopes.authorize(f.principal, { environment: "paper", profileId: "PAPER_BINANCE_USDM" }, {
      action: "alpha.read", dataset: { dataset_id: "manager:ALPHA_FLEET", source_revision: f.snapshot.payloadDigest,
        projection_generation: f.snapshot.projectionEpoch, catalogue_revision: f.snapshot.sourceCatalogueSha256, window: null },
    });
    return composeManagerItems(scope, f.snapshot, "ALPHA_FLEET").find(item => item.identity.alpha_id === PRODUCT_OWN.alpha_id &&
      item.identity.portfolio_id === PRODUCT_OWN.portfolio_id)!;
  }

  it("reads authoritative positions_v2 with exact permitted strategy/account attribution", async () => {
    const item = await positionFacts({ canonical: true });
    expect(item.financial_facts).toEqual([{ kind: "POSITION_PNL", facts: { account_id: PRODUCT_OWN.account_id,
      realized_pnl: "0", unrealized_pnl: "2.1000000000000001", exposure: "123.0000000000000001" } }]);
    expect(item.financial_totals).toEqual([]); // Missing source currency never becomes an invented total.
    expect(JSON.stringify(item)).not.toMatch(/990001|990002|position-peer/);
  });
  it("retains explicitly historical positions-only documents", async () => {
    const item = await positionFacts({ legacy: true });
    expect(item.financial_facts).toHaveLength(1);
    expect(item.financial_facts[0].facts.unrealized_pnl).toBe("9.2");
  });
  it("never adds a historical alias alongside the canonical relation", async () => {
    const item = await positionFacts({ canonical: true, legacy: true });
    expect(item.financial_facts).toHaveLength(1);
    expect(item.financial_facts[0].facts.unrealized_pnl).toBe("2.1000000000000001");
  });
  it("never falls back to historical amounts when the canonical source is unavailable", async () => {
    const item = await positionFacts({ canonical: true, legacy: true, unavailable: true });
    expect(item.financial_facts).toEqual([]);
    expect(item.financial_availability.state).toBe("NOT_PUBLISHED");
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("ELP2-04 scoped Manager raw reads / TEST_ONLY authority", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>, auth: AuthService, owner: PortalUser, researcher: PortalUser;
  const domainName = "elp204_manager_exec_" + randomUUID().replaceAll("-", "");
  const databaseUrl = (database: string) => {
    const value = new URL(testConfig().DATABASE_URL); value.pathname = "/" + database; return value.toString();
  };
  let domain: Pool, domainCreated = false;
  beforeAll(async () => {
    await migrateTestDatabase(testConfig().DATABASE_URL); ctx = await setupApp(); auth = ctx.app.get(AuthService);
    const adminPool = new Pool({ connectionString: databaseUrl("postgres"), max: 1 });
    try { await adminPool.query(`CREATE DATABASE ${domainName}`); domainCreated = true; }
    finally { await adminPool.end(); }
    domain = new Pool({ connectionString: databaseUrl(domainName), max: 2 });
    await migrateExecutionStore(domain);
    vi.spyOn(auth, "verifyAccessIdentity").mockImplementation(async assertion => ({
      iss: "https://test-only.cloudflareaccess.com", sub: assertion, aud: "test-audience", email: `${assertion}@azdag.com`,
      normalizedEmail: `${assertion}@azdag.com`, authenticationTime: new Date(), tokenExpiresAt: new Date(Date.now() + 3600000),
    } satisfies VerifiedAccessIdentity));
    const admin = new AdminService(ctx.pool, ctx.config, auth);
    const active = async (role: "ADMIN" | "USER") => {
      const username = `manager-${randomUUID()}`, created = await admin.createUser({ username, displayName: username, role });
      const activation = await admin.resetCredential(created.userId), initial = await auth.login({ assertion: username, username, credential: activation.activationToken });
      await auth.changePassword({ sessionToken: initial.token, csrfToken: initial.csrfToken, currentPassword: activation.activationToken,
        newPassword: "manager-elp204-correct-horse-test-only-2026" });
      return (await auth.users.findById(created.userId))!;
    };
    owner = await active("ADMIN"); researcher = await active("USER");
    await new OwnerAccessRepository(ctx.pool).claimOwner({ userId: owner.userId, claimedBy: "TEST_ONLY_MANAGER" });
  }, 90_000);
  afterAll(async () => {
    vi.restoreAllMocks();
    try { if (ctx) await teardownApp(ctx); }
    finally {
      try { if (domain) await domain.end(); }
      finally {
        if (domainCreated) {
          const adminPool = new Pool({ connectionString: databaseUrl("postgres"), max: 1 });
          try { await adminPool.query(`DROP DATABASE ${domainName} WITH (FORCE)`); }
          finally { await adminPool.end(); }
        }
      }
    }
  });

  async function fixture(options: { full?: boolean; binding?: boolean; legacy?: boolean; missingDeploymentRelation?: boolean;
    allowUnrecordedLive?: boolean; contradictoryStrategy?: boolean } = {}) {
    const workspace = `manager-${randomUUID()}`, now = Date.now();
    await ctx.pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY Manager',$2)", [workspace, owner.userId]);
    for (const user of [owner, researcher]) await ctx.pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'MEMBER')", [workspace, user.userId]);
    await domain.query("INSERT INTO execution_workspace_references(workspace_id,core_reference_receipt) VALUES($1,'TEST_ONLY_MANAGER_CORE_REFERENCE')", [workspace]);
    const session: AuthSession = { sessionId: randomUUID(), userId: researcher.userId, state: "ACTIVE", sessionVersion: researcher.sessionVersion,
      authenticationTime: new Date(now), idleExpiresAt: new Date(now + 600000), absoluteExpiresAt: new Date(now + 3600000) };
    await new SessionsRepository(ctx.pool).create({ sessionId: session.sessionId, userId: researcher.userId,
      tokenHash: createHash("sha256").update(randomUUID()).digest("hex"), accessSubject: null, accessTokenExpiresAt: null,
      csrfSecretHash: createHash("sha256").update(randomUUID()).digest("hex"), activationId: null,
      sessionVersion: researcher.sessionVersion, idleExpiresAt: session.idleExpiresAt, absoluteExpiresAt: session.absoluteExpiresAt });
    const principal: ReadScopePrincipal = { user: researcher, session, workspaceId: workspace };
    const policy: ReviewedAccessPolicy = { workspace_id: workspace, revision: randomUUID(), artifact_digest: accessDigest(workspace),
      approval_ref: "TEST_ONLY", state: "REVIEWED", qualification: "TEST_ONLY", protected_owner_user_id: owner.userId,
      researcher_fields: { state: "QUALIFIED", policy_ref: "TEST_ONLY_MANAGER_FIELDS", fields } };
    const artifact: ReviewedPolicyArtifact = { policy, root_grants: [], provenance_ref: "TEST_ONLY" };
    const membership = { revision: "TEST-membership", receipt_id: "TEST-receipt", mapping_revision: "TEST-mapping" };
    const trust: AccessTrustProvider = {
      verifyPolicy: async value => value === artifact ? artifact : null, verifyReceipt: async () => null, verifiedHumanMapping: async () => null,
      relations: async (userId): Promise<AccessRelations> => ({ qualified: true, revision: "TEST-relations",
        own_alpha_ids: userId === researcher.userId ? [OWN.alpha_id] : [], member_portfolio_ids: userId === researcher.userId ? [OWN.portfolio_id] : [],
        roots: { "TEST-root": resources }, membership }),
      readPublication: async (request: ExecutionReadPublicationRequest): Promise<ExecutionReadPublication> => ({
        workspace_id: workspace, environment: request.environment, profile_id: request.profile_id, qualification: "TEST_ONLY",
        publication_revision: "TEST-publication", binding: request.binding, population_coverage: "COMPLETE_FOR_DATASET_WINDOW", provenance_ref: "TEST_ONLY",
        resources, tuples, current_linkage: { qualification: "TEST_ONLY", revision: "TEST-link", provenance_ref: "TEST_ONLY",
          pairs: [{ alpha_id: OWN.alpha_id, portfolio_id: OWN.portfolio_id }, { alpha_id: PEER.alpha_id, portfolio_id: OWN.portfolio_id }] },
        strategy_lineage: { qualification: "TEST_ONLY", revision: "TEST-strategy", provenance_ref: "TEST_ONLY",
          pairs: [{ strategy_id: "strategy-own", alpha_id: OWN.alpha_id }, { strategy_id: "strategy-peer", alpha_id: PEER.alpha_id }] },
        binding_lineage: { qualification: "TEST_ONLY", revision: "TEST-binding", provenance_ref: "TEST_ONLY",
          bindings: [{ binding_id: "TEST-own-binding", account_id: OWN.account_id }, { binding_id: "TEST-peer-binding", account_id: PRIVATE.account_id }] },
      }),
    };
    const access = new ExecutionAccessService(ctx.pool, auth, trust, true), grants: ScopedAccessGrant[] = [];
    const grant = async (action: AccessAction, selector: ResourceSelector) => {
      const value: ScopedAccessGrant = { grant_id: randomUUID(), subject_user_id: researcher.userId, workspace_id: workspace, action, effect: "ALLOW", selector,
        environments: options.allowUnrecordedLive ? ["paper", "sandbox", "live"] : ["paper", "sandbox"],
        valid_from_ms: now - 60000, valid_until_ms: now + 3600000, delegable_actions: [],
        issued_by: owner.userId, parent_grant_id: null, revision: randomUUID(), policy_revision: policy.revision, revoked_at_ms: null,
        requires_ts_acceptance: true, ts_receipt: { receipt_id: membership.receipt_id, mapping_revision: membership.mapping_revision,
          membership_revision: membership.revision, effective_at_ms: now - 60000, expires_at_ms: now + 3600000 }, field_policy_ref: policy.researcher_fields.policy_ref };
      await new AccessRepository(ctx.pool).saveGrant(value, true); grants.push(value);
    };
    if (!options.legacy) {
      await access.installReviewedPolicy(artifact);
      if (options.full) await grant("business.read_all", { kind: "ROOT_SCOPE", root_id: "TEST-root" });
      else if (options.binding) await grant("binding.read", { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "BINDING", ids: ["TEST-own-binding"] });
      else { await grant("alpha.read", { kind: "OWN_ALPHA" }); await grant("portfolio.read_restricted", { kind: "PORTFOLIO_MEMBERSHIP", portfolio_ids: [OWN.portfolio_id] }); }
    }
    const cfg = testConfig({ AUTH_MODE: "dev", DATABASE_URL: ctx.config.DATABASE_URL, EXECUTION_DATABASE_URL: databaseUrl(domainName),
      EXECUTION_READ_PROFILE: "retained_review_v1", FEATURE_EXECUTION_LOCAL_PROJECTION: "true",
      EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: workspace, EXECUTION_EDGE_PAPER_PROFILE_ID: PROFILE,
      EXECUTION_EDGE_SANDBOX_PROFILE_ID: SANDBOX, EXECUTION_EDGE_LIVE_PROFILE_ID: "LIVE_BINANCE_USDM" });
    const repository = new ExecutionProfileProjectionRepository(domain, undefined, cfg);
    const document = (environment: "paper" | "sandbox", profile: string): ProfileProjectionDocument => {
      const relation = (name: string, rows: Record<string, string>[]) => ({ source_id: `manager.${name}`, relation: name,
        availability: "AVAILABLE" as const, reason_code: null, as_of: null, freshness: "UNKNOWN" as const, completeness: "PARTIAL" as const,
        items: rows.map(fields => ({ lineage: { workspace_id: workspace, profile_id: profile, source_contract_revision: "TEST" }, fields })) });
      return { schema_version: "portal.execution.profile-projection.v1", workspace_id: workspace, environment, profile_id: profile,
        source_contract_revision: "TEST", relations: {
          "manager.strategies:strategies": relation("strategies", [options.contradictoryStrategy
            ? { strategy_id: "strategy-peer", alpha_id: OWN.alpha_id, name: "CONTRADICTORY_PEER_LABEL" }
            : { strategy_id: "strategy-own", name: "Own Alpha" }, { strategy_id: "strategy-peer", name: "Hidden Peer" }]),
          ...(options.missingDeploymentRelation ? {} : {
            "manager.deployments:strategy_deployments": relation("strategy_deployments", [{ ...OWN, state: "PAPER" }, { ...PEER, state: "PAPER" }]),
          }),
          portfolios: relation("portfolios", [{ portfolio_id: OWN.portfolio_id, name: "Shared Portfolio" }, { portfolio_id: PRIVATE.portfolio_id, name: "Private Portfolio" }]),
          allocations: relation("portfolio_allocations", [{ ...OWN, allocated_capital: "100.0000000000000001", currency: "USD" }, { ...PEER, allocated_capital: "990001", currency: "USD" }]),
          balances: relation("account_balances", [{ account_id: OWN.account_id, total: "880002", currency: "USD", physical_balance: "PRIVATE_CUSTODY" }]),
          positions: relation("positions", [{ ...OWN, realized_pnl: "0", unrealized_pnl: "2.1", currency: "USD" }]),
          bindings: relation("venue_accounts", [{ binding_id: "TEST-own-binding", account_id: OWN.account_id, venue: "TEST", private_key: "MUST_NOT_LEAVE" },
            { binding_id: "TEST-peer-binding", account_id: PRIVATE.account_id, venue: "PRIVATE" }]),
        } };
    };
    for (const [environment, profile] of [["paper", PROFILE], ["sandbox", SANDBOX]] as const) await domain.query(
      `INSERT INTO execution_profile_projection_snapshots(workspace_id,environment,profile_id,source_epoch,source_cursor,source_contract_revision,
       source_as_of,received_at,last_successful_refresh_at,completeness,projection_epoch,projection_sequence,payload_digest,payload)
       VALUES($1,$2,$3,'TEST','TEST','TEST',NULL,clock_timestamp(),clock_timestamp(),'PARTIAL',$4,1,$5,$6::jsonb)`,
      [workspace, environment, profile, randomUUID(), accessDigest([workspace, environment]), JSON.stringify(document(environment, profile))]);
    const scopes = new ExecutionReadScopes(ctx.pool, access, cfg), reader = new ScopedManagerReader(repository, scopes, cfg), legacy = vi.fn(async () => ({ legacy: true }));
    const read = async (surface: "ALPHA_FLEET" | "PORTFOLIOS" | "BINDINGS" | "BINDING_DETAIL", query: Record<string, unknown> = {}, id?: string) =>
      reader.read(principal, surface, surface === "PORTFOLIOS" ? { environment: "paper", ...query } :
        surface === "BINDINGS" || surface === "BINDING_DETAIL" ? BindingsQuerySchema.parse({ environment: "paper", ...query }) :
          AlphaFleetQuerySchema.parse({ environment: "paper", ...query }), legacy, id);
    const adapter = new ExecutionProfileReadAdapterService(cfg, repository, scopes);
    const financialRepository = new ExecutionDurableFinancialRepository(domain, cfg);
    const financial = new ExecutionFinancialChartService(cfg, financialRepository, new ExecutionDurableMirrorRepository(cfg, domain),
      new ExecutionFinancialQueryCursorRepository(domain, cfg), scopes);
    const seedFinancial = async () => {
      const batch = randomUUID(), revision = randomUUID(), epoch = randomUUID(), digest = accessDigest([workspace, "financial"]);
      await domain.query(`INSERT INTO execution_durable_mirror_batches(batch_id,workspace_id,environment,profile_id,source_contract_revision,
        source_epoch,source_cursor_digest,received_at,completeness,projection_epoch,projection_sequence,payload_digest,read_model_revision,relation_count,state)
        VALUES($1,$2,'paper',$3,'TEST','TEST',$4,clock_timestamp(),'PARTIAL',$5,1,$4,$6,1,'COMMITTED')`, [batch, workspace, PROFILE, digest, epoch, revision]);
      await domain.query(`INSERT INTO execution_durable_mirror_revisions(read_model_revision,batch_id,workspace_id,environment,profile_id,
        projection_epoch,projection_sequence,payload_digest,state,is_current) VALUES($1,$2,$3,'paper',$4,$5,1,$6,'COMMITTED',true)`,
      [revision, batch, workspace, PROFILE, epoch, digest]);
      const insert = async (id: string, at: string, tuple: typeof OWN, value: string, strategy = "strategy-own") => domain.query(
        `INSERT INTO execution_timeseries_history(workspace_id,environment,profile_id,relation_key,row_id,ts,fields)
         VALUES($1,'paper',$2,'manager.performance:performance_snapshots',$3,$4,$5::jsonb)`,
        [workspace, PROFILE, id, at, JSON.stringify({ ...tuple, strategy_id: strategy, equity: value, currency: "USD" })]);
      await insert("own1", "2026-09-01T00:00:00Z", OWN, "100.0000000000000001");
      await insert("own2", "2026-09-02T00:00:00Z", OWN, "200");
      await insert("own3", "2026-09-03T00:00:00Z", OWN, "300");
      await insert("peer-old", "2026-08-01T00:00:00Z", PEER, "990001", "strategy-peer");
      await insert("peer-new", "2026-10-01T00:00:00Z", PRIVATE, "990002", "strategy-peer");
      for (const [id, tuple, strategy] of [["risk-own-1", OWN, "strategy-own"], ["risk-own-2", OWN, "strategy-own"], ["risk-peer", PEER, "strategy-peer"]] as const)
        await domain.query(`INSERT INTO execution_timeseries_history(workspace_id,environment,profile_id,relation_key,row_id,ts,fields)
          VALUES($1,'paper',$2,'manager.risk:risk_grants',$3,'2026-09-02T00:00:00Z',$4::jsonb)`,
        [workspace, PROFILE, id, JSON.stringify({ ...tuple, risk_grant_id: id, strategy_id: strategy, mode: "PAPER", venue: "TEST", created_at: "2026-09-02T00:00:00Z" })]);
    };
    const commandCenter = new CommandCenterRepository(ctx.pool, cfg, domain, repository, undefined, undefined, scopes);
    return { workspace, repository, scopes, read, legacy, grants, principal, adapter, financial, financialRepository, seedFinancial, commandCenter, config: cfg };
  }

  it.each(["current", "grant-revoke", "session-revoke", "leader-session-revoke"] as const)(
    "T04-11 physical Manager document leader/follower with real current authority: %s", async fault => {
      const f = await fixture(), now = Date.now();
      // Same actor/workspace, genuinely distinct current Core sessions. This
      // isolates per-delivery session authority; cross-actor mixing is unproven.
      let followerPrincipal = f.principal;
      if (fault === "leader-session-revoke") {
        const session: AuthSession = { ...f.principal.session, sessionId: randomUUID() };
        await new SessionsRepository(ctx.pool).create({ sessionId: session.sessionId, userId: researcher.userId,
          tokenHash: createHash("sha256").update(randomUUID()).digest("hex"), accessSubject: null,
          accessTokenExpiresAt: null, csrfSecretHash: createHash("sha256").update(randomUUID()).digest("hex"),
          activationId: null, sessionVersion: researcher.sessionVersion,
          idleExpiresAt: session.idleExpiresAt, absoluteExpiresAt: session.absoluteExpiresAt });
        followerPrincipal = { ...f.principal, session };
        expect(followerPrincipal.session.sessionId).not.toBe(f.principal.session.sessionId);
      }
      const modelScope = { workspace_id: f.workspace, environment: "paper" as const, profile_id: PROFILE };
      // Reuse the commissioning/store fixture pattern. These pins and source
      // facts are deliberately synthetic, never actual source acceptance.
      const artifact = { schema_version: "portal.execution.publication-commissioning.v1", scope: modelScope,
        catalogue_digest: EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest,
        adapter_id: "TEST_ONLY:physical-coalescer", family_ids: ["alpha_fleet_overview"], purposes: ["BUSINESS"],
        receipt_pins: { source_read: "TEST_ONLY:read", transport_trust: "TEST_ONLY:transport",
          privacy: "TEST_ONLY:privacy", field_policy: "TEST_ONLY:fields" } };
      const bytes = JSON.stringify(artifact);
      const commissioning = loadPublicationCommissioning(bytes, {
        artifact_sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
        adapter_id: artifact.adapter_id, approval_ref: "TEST_ONLY_NOT_OWNER_APPROVAL",
        approved_at_ms: now - 1000, valid_until_ms: now + 60_000,
      }, now);
      const doc: ManagerModelDocument = { schema_version: "portal.execution.manager-model-input.v1", ...modelScope,
        qualification: "SOURCE_VERIFIED", family_id: "alpha_fleet_overview", revision: `TEST_ONLY:${randomUUID()}`,
        supersedes_revision: null, source_epoch: "TEST_ONLY:epoch", source_sequence: "1",
        projection_generation: "TEST_ONLY:g1", catalogue_digest: artifact.catalogue_digest,
        source_set_digest: accessDigest(tuples), as_of_ms: now - 100, recorded_through_ms: now - 50,
        facts_through_ms: now - 100, observed_at_ms: now,
        source_quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] },
        members: tuples.map(tuple => ({ tuple: { ...tuple }, stage: "PAPER", name: tuple.alpha_id === OWN.alpha_id
          ? "TEST_ONLY:own-public-name" : "TEST_ONLY:PRIVATE_PEER_MUST_NOT_LEAVE",
          owner_user_id: researcher.userId, lifecycle: "ACTIVE", venue: null, health: null, source_state: null,
          binding_ref: null, assignment_revision: "TEST_ONLY:a", owner_revision: "TEST_ONLY:o",
          binding_revision: "TEST_ONLY:b", valid_from_ms: now - 1000, valid_to_ms: null })), facts: [] };
      const contracts = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
      const publication = JSON.parse(readFileSync(resolve(contracts,
        "fixtures/execution-dataset-publication.synthetic.valid.json"), "utf8")).value as DatasetPublication;
      Object.assign(publication, { family_id: doc.family_id, catalogue_digest: doc.catalogue_digest,
        environment: doc.environment, profile_id: doc.profile_id, issued_at_ms: now - 1000,
        expires_at_ms: now + 60_000, source_as_of_ms: doc.as_of_ms, observed_at_ms: now,
        history_capability: "CURRENT_ONLY", barrier: null });
      for (const axis of ["source_read", "transport_trust", "privacy", "field_policy"] as const)
        publication[axis] = { qualification: "SOURCE_VERIFIED", receipt_ref: artifact.receipt_pins[axis] };
      publication.authority = { ...publication.authority, ...modelScope, qualification: "SOURCE_VERIFIED",
        publication_revision: "TEST_ONLY:physical-publication", tuples: structuredClone(tuples), resources: structuredClone(resources),
        binding: { dataset_id: doc.family_id, source_revision: doc.revision, projection_generation: doc.projection_generation,
          catalogue_revision: doc.catalogue_digest, window: null } };
      const leases = new ManagerProjectionLeases(domain), lease = await leases.acquire(modelScope, randomUUID(), 15_000);
      expect(lease).not.toBeNull();
      try {
        const prepared = prepareManagerProjection(doc, publication, { nowMs: now, commissioning, lease: lease! });
        const writer = await domain.connect();
        try { await writer.query("BEGIN"); await persistManagerProjection(writer, prepared); await writer.query("COMMIT"); }
        catch (error) { await writer.query("ROLLBACK"); throw error; }
        finally { writer.release(); }
      } finally { if (lease) await leases.release(lease); }

      let documentSelects = 0;
      // Observe actual SQL without replacing either query results or the
      // repository/service/scope implementation. Only DATA is coalesced.
      const counted = { query: (text: string, values?: unknown[]) => {
        if (text.includes("FROM execution_manager_model_revisions")) documentSelects++;
        return domain.query({ text, values, query_timeout: 4000 });
      } } as unknown as Pool;
      const service = new ManagerModelService(counted, f.scopes, f.config);
      const inflight = (service as unknown as { repository: {
        flights: Map<string, unknown>; waitingReaders: number } }).repository;
      // Separate connection avoids consuming the domain pool slot needed by
      // the follower's fresh head/authority reads. Never lock a runtime DB.
      const locks = new Pool({ connectionString: databaseUrl(domainName), max: 1,
        connectionTimeoutMillis: 2000, query_timeout: 4000 });
      let client: PoolClient | undefined;
      const pending: Array<Promise<{ value: Awaited<ReturnType<ManagerModelService["read"]>> | null; error: unknown }>> = [];
      const read = (principal = f.principal) => service.read(principal, "FLEET", { environment: "paper" })
        .then(value => ({ value, error: null }), error => ({ value: null, error }));
      try {
        client = await locks.connect();
        // Borrowed clients emit asynchronous transport/idle-timeout errors.
        // Observe them without crashing the worker; query promises still
        // reject normally, and finally destroys this exact test connection.
        client.on("error", () => undefined);
        const actual = (await client.query<{ name: string }>("SELECT current_database() AS name")).rows[0].name;
        if (actual !== domainName || !/^elp204_manager_exec_[a-f0-9]{32}$/.test(actual))
          throw new Error("TEST_ONLY_MANAGER_LOCK_DATABASE_INVALID");
        await client.query("BEGIN");
        await client.query("SET LOCAL lock_timeout='1s'");
        await client.query("SET LOCAL idle_in_transaction_session_timeout='10s'");
        await client.query("LOCK TABLE execution_manager_model_revisions IN ACCESS EXCLUSIVE MODE");
        pending.push(read());
        await expect.poll(() => inflight.waitingReaders, { timeout: 2000, interval: 10 }).toBe(1);
        pending.push(read(followerPrincipal));
        await expect.poll(() => inflight.waitingReaders, { timeout: 2000, interval: 10 }).toBe(2);
        expect(inflight.flights.size).toBe(1); expect(documentSelects).toBe(1);
        await expect.poll(async () => Number((await client!.query<{ n: number }>(`SELECT count(*)::int AS n
          FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid
          WHERE a.datname=current_database() AND a.pid<>pg_backend_pid() AND a.state='active'
            AND a.wait_event_type='Lock' AND l.relation='execution_manager_model_revisions'::regclass
            AND l.mode='AccessShareLock' AND NOT l.granted
            AND a.query LIKE '%FROM execution_manager_model_revisions%'`)).rows[0].n),
          { timeout: 2000, interval: 10 }).toBe(1);
        if (fault === "grant-revoke") await new AccessRepository(ctx.pool).saveGrant({
          ...f.grants[0], revoked_at_ms: Date.now(), revision: randomUUID() });
        if (fault === "session-revoke" || fault === "leader-session-revoke") await auth.sessions.revokeSession(f.principal.session.sessionId,
          "TEST_ONLY physical coalescer current-session race");
        await client.query("COMMIT");
        const outcomes = await Promise.all(pending);
        expect(documentSelects).toBe(1); expect(inflight.waitingReaders).toBe(0); expect(inflight.flights.size).toBe(0);
        for (const [index, outcome] of outcomes.entries()) {
          if (fault === "current" || fault === "leader-session-revoke" && index === 1) {
            expect(outcome.error).toBeNull();
            expect(outcome.value!.page.returned_count).toBe(1);
            expect(outcome.value!.items[0].alpha_id).toBe(OWN.alpha_id);
            expect(outcome.value!.items[0].name).toBe("TEST_ONLY:own-public-name");
            expect(JSON.stringify(outcome.value)).not.toContain("PRIVATE_PEER_MUST_NOT_LEAVE");
          } else {
            expect(outcome.value).toBeNull();
            expect(outcome.error).toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
            expect(JSON.stringify(outcome)).not.toContain("own-public-name");
          }
        }
        if (fault === "current") {
          await service.read(f.principal, "FLEET", { environment: "paper" });
          expect(documentSelects).toBe(2); // no completed-response/permission cache
        } else {
          await expect(service.read(f.principal, "FLEET", { environment: "paper" }))
            .rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
          expect(documentSelects).toBe(1); // revoked requests never reach DATA
          if (fault === "leader-session-revoke") {
            const fresh = await service.read(followerPrincipal, "FLEET", { environment: "paper" });
            expect(fresh.items[0].alpha_id).toBe(OWN.alpha_id);
            expect(documentSelects).toBe(2); // unrelated current session stays usable
          }
        }
      } finally {
        try { if (client) await client.query("ROLLBACK"); }
        finally {
          // Destroy the test lock connection even after assertion/SQL failure;
          // unfinished readers must settle before the fixture DB is dropped.
          client?.release(true);
          try { await Promise.all(pending); } finally { await locks.end(); }
        }
      }
    }, 20_000);

  it("filters raw fleet before page/count; preserves exact own finances and hides shared-account totals/peers", async () => {
    const f = await fixture(), result = scopedManagerResponseSchema.parse(await f.read("ALPHA_FLEET", { limit: 1 }));
    expect(result.page.visible_count).toBe(1); expect(result.items[0].identity).toMatchObject({ alpha_id: OWN.alpha_id, alpha_version_id: OWN.alpha_version_id, portfolio_id: OWN.portfolio_id, name: "Own Alpha" });
    expect(result.items[0].financial_facts).toContainEqual({ kind: "ALLOCATION", facts: { ...OWN, allocation: "100.0000000000000001", currency: "USD" } });
    expect(JSON.stringify(result)).not.toMatch(/Hidden Peer|990001|880002|PRIVATE_CUSTODY|MUST_NOT_LEAVE/); expect(f.legacy).not.toHaveBeenCalled();
  });
  it("bypasses the actual warm retained compatibility cache and still rejects revoked authority", async () => {
    const f = await fixture();
    // Actual retainedSnapshot + retainedViews cache, not a fabricated cached
    // payload or policy mock. Separate existing udb-retained-review.spec.ts and
    // udb-retained-data-flights.spec.ts own coalescing/leader/follower mechanics;
    // this case proves V2 authority and raw transaction bypass over warm data.
    const cached = await f.repository.snapshot(f.workspace, "paper", PROFILE);
    expect(cached).not.toBeNull();
    expect(JSON.stringify(cached)).toContain("Hidden Peer");
    expect(cached!.payloadDigest).not.toBe((await f.repository.snapshotMetadata(f.workspace, "paper", PROFILE))!.payloadDigest);
    expect(await f.repository.snapshot(f.workspace, "paper", PROFILE)).toBe(cached);
    const snapshotRead = vi.spyOn(f.repository, "snapshot");
    try {
      const result = scopedManagerResponseSchema.parse(await f.read("ALPHA_FLEET"));
      expect(result.page.visible_count).toBe(1);
      expect(result.items[0].identity.alpha_id).toBe(OWN.alpha_id);
      expect(JSON.stringify(result)).not.toMatch(/Hidden Peer|990001|880002|PRIVATE_CUSTODY|MUST_NOT_LEAVE/);
      expect(snapshotRead).toHaveBeenCalledOnce();
      const reader = snapshotRead.mock.calls[0][3];
      expect(reader).toBeDefined(); expect(reader).not.toBe(domain); expect(reader).not.toBe(ctx.pool);
      expect(f.legacy).not.toHaveBeenCalled();
      await new AccessRepository(ctx.pool).saveGrant({ ...f.grants[0], revoked_at_ms: Date.now(), revision: randomUUID() });
      snapshotRead.mockClear();
      await expect(f.read("ALPHA_FLEET")).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
      expect(snapshotRead).not.toHaveBeenCalled();
    } finally { snapshotRead.mockRestore(); }
  });
  it("discovers shared portfolio shell with own rows but no private identity or account totals", async () => {
    const f = await fixture(), result = scopedManagerResponseSchema.parse(await f.read("PORTFOLIOS"));
    expect(result.items).toHaveLength(1); expect(result.items[0].identity).toMatchObject({ portfolio_id: OWN.portfolio_id, name: "Shared Portfolio" });
    expect(result.items[0].is_full_resource).toBe(false); expect(result.items[0].instances).toEqual([OWN]);
    expect(JSON.stringify(result)).not.toMatch(/TEST-peer|Private Portfolio|990001|880002/);
  });
  it("Command Center keeps positive own Fleet and labels unresolved workflow cards, never global counters", async () => {
    const f = await fixture();
    const result = await f.commandCenter.readAuthorized(f.principal, new Date(), (inputs, scoped) => ({ inputs, scoped }));
    expect(result.scoped).toBe(true);
    expect(result.inputs.fleet.items[0].total_deployments).toBe(2);
    expect(result.inputs.fleet.items[0].cells.find(cell => cell.code === "PAPER")?.value).toBe(1);
    expect(result.inputs.fleet.items[0].cells.find(cell => cell.code === "SANDBOX")?.value).toBe(1);
    expect(result.inputs.fleet.items[0].cells.find(cell => cell.code === "LIVE_FULL")?.value).toBeNull();
    expect(result.inputs.triageSources[0].status.reason).toBe("PORTAL_WORKFLOW_TARGET_LINEAGE_NOT_PUBLISHED");
    expect(JSON.stringify(result)).not.toContain("TEST-peer-dep");
  });
  it("Command Center preserves the specific unavailable deployment-field reason", async () => {
    const f = await fixture({ missingDeploymentRelation: true });
    const result = await f.commandCenter.readAuthorized(f.principal, new Date(), inputs => inputs.fleet);
    expect(result.status.reason).toBe("SCOPED_DEPLOYMENT_FIELDS_NOT_PUBLISHED");
    expect(result.status.availability).toBe("UNAVAILABLE");
    expect(result.items).toEqual([]);
  });
  it("full manager gets the permitted population and scope-bound forward/back cursors", async () => {
    const f = await fixture({ full: true }), first = scopedManagerResponseSchema.parse(await f.read("ALPHA_FLEET", { limit: 1 }));
    expect(first.page.visible_count).toBe(3); expect(first.page.next_cursor).toBeTruthy();
    const second = scopedManagerResponseSchema.parse(await f.read("ALPHA_FLEET", { limit: 1, after: first.page.next_cursor }));
    expect(second.items[0].identity).not.toEqual(first.items[0].identity); expect(second.page.previous_cursor).toBeTruthy();
    const back = scopedManagerResponseSchema.parse(await f.read("ALPHA_FLEET", { limit: 1, before: second.page.previous_cursor }));
    expect(back.items).toEqual(first.items);
    await expect(f.read("ALPHA_FLEET", { limit: 2, after: first.page.next_cursor })).rejects.toMatchObject({ code: "CURSOR_CONTEXT_MISMATCH" });
  });
  it("portfolio scoped pages can actually continue beyond the first bounded page", async () => {
    const f = await fixture({ full: true }), first = scopedManagerResponseSchema.parse(await f.read("PORTFOLIOS", { limit: 1 }));
    expect(first.page.visible_count).toBe(2); expect(first.page.next_cursor).toBeTruthy();
    const second = scopedManagerResponseSchema.parse(await f.read("PORTFOLIOS", { limit: 1, after: first.page.next_cursor }));
    expect(second.items[0].identity.portfolio_id).not.toBe(first.items[0].identity.portfolio_id);
    expect(second.page.next_cursor).toBeNull();
  });
  it("qualified binding collection attaches only its own mapped accounts and never credentials", async () => {
    const f = await fixture({ binding: true }), result = scopedManagerResponseSchema.parse(await f.read("BINDINGS"));
    expect(result.items).toHaveLength(1); expect(result.items[0].identity.binding_id).toBe("TEST-own-binding");
    expect(result.items[0].instances.every(row => row.account_id === OWN.account_id)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/TEST-peer-account|TEST-peer-binding|MUST_NOT_LEAVE|credential/);
    await expect(f.read("BINDING_DETAIL", {}, "TEST-peer-binding")).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
  });
  it("rejects hidden/unsupported query dimensions instead of applying them to global data", async () => {
    const f = await fixture();
    await expect(f.read("ALPHA_FLEET", { owner: "hidden-owner" })).rejects.toMatchObject({ status: 400 });
    await expect(f.read("ALPHA_FLEET", { sort: "balance_total:desc" })).rejects.toMatchObject({ status: 400 });
    const result = scopedManagerResponseSchema.parse(await f.read("ALPHA_FLEET", { search: "Hidden Peer" }));
    expect(result.items).toEqual([]); expect(result.page.visible_count).toBe(0);
  });
  it("separates identical IDs between environments and never refreshes legacy snapshots", async () => {
    const f = await fixture({ full: true }), result = scopedManagerResponseSchema.parse(await f.read("ALPHA_FLEET", { environment: "sandbox" }));
    expect(result.items.every(item => item.environment === "sandbox")).toBe(true); expect(f.legacy).not.toHaveBeenCalled();
  });
  it("all environments preserves permitted profiles and explicitly reports the denied profile", async () => {
    const f = await fixture(), result = scopedManagerResponseSchema.parse(await f.read("ALPHA_FLEET", { environment: "all" }));
    expect(result.items.map(item => item.environment).sort()).toEqual(["paper", "sandbox"]);
    expect(result.profile_dispositions.find(profile => profile.environment === "live")?.state).toBe("DENIED");
    expect(result.page.visible_count).toBe(2);
  });
  it("all environments retains allowed data when an authorized source has no snapshot", async () => {
    const f = await fixture({ allowUnrecordedLive: true });
    const result = scopedManagerResponseSchema.parse(await f.read("ALPHA_FLEET", { environment: "all" }));
    expect(result.items.map(item => item.environment).sort()).toEqual(["paper", "sandbox"]);
    expect(result.profile_dispositions.find(profile => profile.environment === "live")).toMatchObject({
      state: "UNAVAILABLE", reason_code: "SCOPED_PROFILE_SNAPSHOT_NOT_RECORDED" });
    await expect(f.read("ALPHA_FLEET", { environment: "live" })).rejects.toMatchObject({ status: 503 });
  });
  it("does not expose snapshot availability for a denied profile", async () => {
    const f = await fixture();
    const result = scopedManagerResponseSchema.parse(await f.read("ALPHA_FLEET", { environment: "all" }));
    const live = result.profile_dispositions.find(profile => profile.environment === "live");
    expect(live?.state).toBe("DENIED"); expect(live?.reason_code).not.toContain("SNAPSHOT");
  });
  it("rejects source appearance after an authorized missing-profile observation", async () => {
    const f = await fixture({ allowUnrecordedLive: true }), original = f.repository.snapshotMetadata.bind(f.repository);
    let liveReads = 0;
    vi.spyOn(f.repository, "snapshotMetadata").mockImplementation(async (...args) => {
      if (args[1] === "live" && ++liveReads > 1) return original(args[0], "paper", PROFILE);
      return original(...args);
    });
    await expect(f.read("ALPHA_FLEET", { environment: "all" })).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
  });
  it("does not publish a label from contradictory strategy-to-alpha identity", async () => {
    const f = await fixture({ contradictoryStrategy: true });
    const result = scopedManagerResponseSchema.parse(await f.read("ALPHA_FLEET"));
    expect(result.items[0].identity.alpha_id).toBe(OWN.alpha_id);
    expect(result.items[0].identity.name).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("CONTRADICTORY_PEER_LABEL");
  });
  it("revalidates grant revocation after raw snapshot assembly", async () => {
    const f = await fixture(), original = f.repository.snapshot.bind(f.repository); let done = false;
    vi.spyOn(f.repository, "snapshot").mockImplementation(async (...args) => {
      const value = await original(...args);
      if (!done) { done = true; await new AccessRepository(ctx.pool).saveGrant({ ...f.grants[0], revoked_at_ms: Date.now(), revision: randomUUID() }); }
      return value;
    });
    await expect(f.read("ALPHA_FLEET")).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE" });
  });
  it("preserves explicit legacy response under fresh authority fences", async () => {
    const f = await fixture({ legacy: true }); expect(await f.read("ALPHA_FLEET")).toEqual({ legacy: true }); expect(f.legacy).toHaveBeenCalledOnce();
  });
  it("scopes adapter rows before caller filters and rejects string-alias alpha guesses", async () => {
    const f = await fixture();
    const own = await f.adapter.readAuthorized(f.principal, "paper", "admin.inspect", { alpha_id: OWN.alpha_id }) as Record<string, any>;
    expect(own.schema_version).toBe("portal.execution.profile-read-adapter.v2");
    expect(own.relations.strategies.items).toEqual([{ alpha_id: OWN.alpha_id, strategy_id: "strategy-own", name: "Own Alpha" }]);
    const alias = await f.adapter.readAuthorized(f.principal, "paper", "admin.inspect", { alpha_id: "strategy-own" }) as Record<string, any>;
    expect(alias.relations.strategies.items).toEqual([]);
    expect(JSON.stringify(own)).not.toMatch(/Hidden Peer|payload_digest|projection_epoch|source_cursor|PRIVATE_CUSTODY/);
  });
  it("adapter completion/audit callback stays inside final current-authority fence", async () => {
    const f = await fixture();
    await expect(f.adapter.readAuthorized(f.principal, "paper", "admin.inspect", {}, async result => {
      await new AccessRepository(ctx.pool).saveGrant({ ...f.grants[0], revoked_at_ms: Date.now(), revision: randomUUID() });
      return result;
    })).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE" });
  });
  const chartQuery = { environment: "paper" as const, subject: { kind: "alpha" as const, id: OWN.alpha_id }, metric: "equity" as const,
    fromMs: Date.parse("2026-09-01T00:00:00Z"), toMs: Date.parse("2026-09-03T00:00:00Z"), viewportPx: 256, includeBenchmark: false };
  it("financial SQL scopes before count, extents and series; end-exclusive exact amounts survive", async () => {
    const f = await fixture(); await f.seedFinancial();
    const result = await f.financial.chart(f.principal, chartQuery);
    expect(result.panel.coverage).toMatchObject({ filtered_total: "2", from_ms: chartQuery.fromMs, to_ms: Date.parse("2026-09-02T00:00:00Z") });
    expect(result.panel.data?.series[0].points.map(point => point[1])).toEqual(["100.0000000000000001", "200"]);
    expect(result.panel.formula).toBeNull(); expect(JSON.stringify(result)).not.toMatch(/990001|990002|payload_digest|strategy-peer/);
  });
  it("financial detail refuses hidden peer and raw strategy alias before data read", async () => {
    const f = await fixture(); await f.seedFinancial();
    for (const id of [PEER.alpha_id, "strategy-own"]) await expect(f.financial.chart(f.principal,
      { ...chartQuery, subject: { kind: "alpha", id } })).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
  });
  it("financial delivery rejects grant revocation after series SQL", async () => {
    const f = await fixture(); await f.seedFinancial();
    const original = f.financialRepository.series.bind(f.financialRepository);
    vi.spyOn(f.financialRepository, "series").mockImplementation(async input => {
      const result = await original(input);
      await new AccessRepository(ctx.pool).saveGrant({ ...f.grants[0], revoked_at_ms: Date.now(), revision: randomUUID() }); return result;
    });
    await expect(f.financial.chart(f.principal, chartQuery)).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
  });
  it("risk-decision rows/count/cursor use the same permitted Alpha population", async () => {
    const f = await fixture(); await f.seedFinancial();
    const query = { environment: "paper" as const, subject: { kind: "alpha" as const, id: OWN.alpha_id }, decisionKind: "risk_grants" as const,
      fromMs: null, toMs: null, limit: 1, after: null };
    const first = await f.financial.decisionRecords(f.principal, query);
    expect(first.panel.coverage.filtered_total).toBe("2"); expect(first.panel.coverage.next_cursor).toMatch(/^fqc1\./);
    expect(first.panel.data?.records[0].id).toBe("risk-own-1"); expect(first.panel.formula).toBeNull();
    const second = await f.financial.decisionRecords(f.principal, { ...query, after: first.panel.coverage.next_cursor });
    expect(second.panel.data?.records[0].id).toBe("risk-own-2"); expect(JSON.stringify([first, second])).not.toContain("risk-peer");
  });
});
