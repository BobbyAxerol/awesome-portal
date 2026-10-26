/** Actual named Fastify route, SessionGuard/password session, disposable PG
 * policy/projection and native finite custody/HTTP. External current relations,
 * qualified-shaped projection bytes and loopback PKI are TEST_ONLY vectors:
 * NOT a native producer/publication/financial commissioning receipt. */
import "reflect-metadata";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { request, type ServerResponse } from "node:http";
import { join } from "node:path";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import cookie from "@fastify/cookie";
import type { FastifyReply } from "fastify";
import { jwtVerify } from "jose";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AdminService } from "../src/admin/admin.service";
import { AuthService } from "../src/auth/auth.service";
import { SESSION_COOKIE } from "../src/auth/cookies";
import { SessionGuard } from "../src/facade/session.guard";
import { HttpErrorFilter } from "../src/http-error.filter";
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { WorkspacesRepository } from "../src/repos/workspaces";
import { CONTROL_API_CONFIG } from "../src/tokens";
import { accessDigest } from "../src/execution-v2/access-digest";
import { grantBindingDigest } from "../src/execution-v2/access-current-relations";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import { policyReady, type AccessEvaluationContext } from "../src/execution-v2/access-policy";
import { unqualifiedAccessTrust, type ReviewedPolicyArtifact } from "../src/execution-v2/access-trust";
import { ManagerModelController } from "../src/execution-v2/manager-model.controller";
import { ManagerModelService } from "../src/execution-v2/manager-model.service";
import {ManagerSeriesController} from "../src/execution-v2/manager-series.controller";
import {ManagerSeriesService} from "../src/execution-v2/manager-series.service";
import {managerSeriesResponse} from "../src/execution-v2/manager-series.contract";
import {managerScorePopulationDigest} from "../src/execution-v2/manager-score-publication";
import { managerDatasetResponse, type ManagerModelDocument } from "../src/execution-v2/manager-model.contract";
import { NativeCurrentAccountScopes } from "../src/execution-v2/native-current-runtime";
import { NativeCurrentRelationsProvider, type NativeCurrentRelationsProviderConfig } from "../src/execution-v2/native-current-relations-provider";
import type { NativeCurrentRelationsPort } from "../src/execution-v2/native-current-relations-port";
import { NativeReadEgress } from "../src/execution-v2/native-read-egress";
import { EXECUTION_PUBLICATION_CATALOGUE } from "../src/execution-v2/publication-source.generated";
import { BUSINESS_READ_FIELDS } from "../src/execution-v2/read-fields";
import { ExecutionReadScopes, ExecutionReadScopeError } from "../src/execution-v2/read-scope";
import type { ExecutionReadPublicationRequest } from "../src/execution-v2/read-publication";
import { rootWireFacts } from "./fixtures/elp210-native-root-wire";
import { currentRelationsWireReply } from "./fixtures/elp210-native-current-relations-wire";
import { currentRelationsTestEndpoint } from "./fixtures/elp210-native-current-relations-server";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const database = process.env.TEST_DATABASE_URL;
const next = (label: string) => `TEST_ONLY:${label}:${randomUUID()}`;

describe("native named Account/Alpha route selection and physical writer ownership (synthetic boundary doubles)", () => {
  function fixture(installed = true) {
    const ordinary = vi.fn(async () => ({ TEST_ONLY: "ordinary unchanged" }));
    const native = vi.fn(async (_p: unknown, _q: unknown, _id: string, _raw: unknown, beforeDispatch: () => void) => {
      beforeDispatch(); beforeDispatch();
    });
    const nativeAlpha = vi.fn(async (_p: unknown, _q: unknown, _id: string, _raw: unknown, beforeDispatch: () => void) => {
      beforeDispatch(); beforeDispatch();
    });
    const nativeManager = vi.fn(async (_p: unknown, _q: unknown, _surface: string, _id: string | undefined,
      _raw: unknown, beforeDispatch: () => void) => { beforeDispatch(); beforeDispatch(); });
    const models = { hasNativeCurrentRelations: () => installed, read: ordinary, readNativeAccount: native,
      readNativeAlpha: nativeAlpha, readNativeManager: nativeManager };
    const controller = new ManagerModelController(models as unknown as ManagerModelService,
      { canReadExecution: async () => true } as unknown as WorkspacesRepository);
    const req = { portalUser: { userId: "TEST_ONLY:user" }, portalSession: {}, portalWorkspaceId: "TEST_ONLY:workspace" } as any;
    const raw = { headersSent: false, writableEnded: false, destroyed: false, destroy: vi.fn() };
    const reply = { raw, sent: false, hijack: vi.fn(() => { raw.headersSent = true; }) } as unknown as FastifyReply;
    return { controller, ordinary, native, nativeAlpha, nativeManager, req, raw, reply };
  }
  it.each(["account", "alpha"] as const)("selects ONLY named Paper %s, hijacks once across repeated physical permit checks, and never returns a detached body", async surface => {
    const f = fixture();
    expect(await f.controller[surface](f.req, { environment: "paper" }, "TEST_ONLY:entity", f.reply)).toBeUndefined();
    expect(surface === "account" ? f.native : f.nativeAlpha).toHaveBeenCalledOnce();
    expect(surface === "account" ? f.nativeAlpha : f.native).not.toHaveBeenCalled();
    expect(f.reply.hijack).toHaveBeenCalledOnce(); expect(f.ordinary).not.toHaveBeenCalled();
  });
  it.each(["fund", "fleet", "portfolio", "deployment"] as const)("selects finite native Paper %s with exact surface and entity", async surface => {
    const f = fixture();
    const id = surface === "portfolio" || surface === "deployment" ? "TEST_ONLY:entity" : undefined;
    const value = id ? await f.controller[surface as "portfolio"](f.req, { environment: "paper" }, id, f.reply)
      : await f.controller[surface as "fund"](f.req, {}, f.reply);
    expect(value).toBeUndefined();
    expect(f.nativeManager).toHaveBeenCalledWith(expect.anything(), expect.anything(), surface.toUpperCase(), id, f.raw, expect.any(Function));
    expect(f.reply.hijack).toHaveBeenCalledOnce(); expect(f.ordinary).not.toHaveBeenCalled();
  });
  it("never falls back after a finite native Fleet refusal", async () => {
    const f = fixture();
    f.nativeManager.mockRejectedValueOnce(new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409));
    await expect(f.controller.fleet(f.req, { environment: "paper" }, f.reply)).rejects.toMatchObject({ status: 409 });
    expect(f.ordinary).not.toHaveBeenCalled(); expect(f.reply.hijack).not.toHaveBeenCalled();
  });
  it("keeps ordinary Fleet ALL, non-Paper and uninstalled named routes unchanged", async () => {
    const f = fixture();
    for (const response of [await f.controller.fleet(f.req, { environment: "ALL" }),
      await f.controller.portfolio(f.req, { environment: "sandbox" }, "TEST_ONLY:portfolio"),
      await f.controller.account(f.req, { environment: "sandbox" }, "TEST_ONLY:account", f.reply),
      await f.controller.alpha(f.req, { environment: "sandbox" }, "TEST_ONLY:alpha", f.reply),
      await f.controller.alpha(f.req, { environment: "live" }, "TEST_ONLY:alpha", f.reply)])
      expect(response).toEqual({ TEST_ONLY: "ordinary unchanged" });
    expect(f.ordinary).toHaveBeenCalledTimes(5); expect(f.native).not.toHaveBeenCalled(); expect(f.nativeAlpha).not.toHaveBeenCalled();
    expect(f.reply.hijack).not.toHaveBeenCalled();
    const absent = fixture(false);
    for (const surface of ["account", "alpha"] as const)
      expect(await absent.controller[surface](absent.req, { environment: "paper" }, "TEST_ONLY:entity", absent.reply)).toEqual({ TEST_ONLY: "ordinary unchanged" });
    expect(absent.native).not.toHaveBeenCalled(); expect(absent.nativeAlpha).not.toHaveBeenCalled(); expect(absent.reply.hijack).not.toHaveBeenCalled();
  });
  it.each(["account", "alpha"] as const)("never falls back after native %s refusal, sanitizes arbitrary errors, and leaves pre-send typed errors to Fastify", async surface => {
    const f = fixture(), selected = surface === "account" ? f.native : f.nativeAlpha;
    selected.mockRejectedValueOnce(new Error("TEST_ONLY:private-source-secret"));
    await expect(f.controller[surface](f.req, { environment: "paper" }, "TEST_ONLY:entity", f.reply))
      .rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 400 });
    expect(f.reply.hijack).not.toHaveBeenCalled(); expect(f.ordinary).not.toHaveBeenCalled();
    selected.mockRejectedValueOnce(new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409));
    await expect(f.controller[surface](f.req, { environment: "paper" }, "TEST_ONLY:entity", f.reply))
      .rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
  });
  it.each(["account", "alpha"] as const)("does not attempt a second framework response after native %s dispatch or an unsent physical abort", async surface => {
    const f = fixture(), selected = surface === "account" ? f.native : f.nativeAlpha;
    selected.mockImplementationOnce(async (_p, _q, _id, _raw, send) => { send(); throw Error("TEST_ONLY:ACK lost"); });
    expect(await f.controller[surface](f.req, { environment: "paper" }, "TEST_ONLY:entity", f.reply)).toBeUndefined();
    expect(f.raw.destroy).toHaveBeenCalledOnce(); expect(f.ordinary).not.toHaveBeenCalled();
    const aborted = fixture(); aborted.raw.destroyed = true;
    (surface === "account" ? aborted.native : aborted.nativeAlpha).mockRejectedValueOnce(Error("TEST_ONLY:aborted"));
    expect(await aborted.controller[surface](aborted.req, { environment: "paper" }, "TEST_ONLY:entity", aborted.reply)).toBeUndefined();
    expect(aborted.raw.destroy).toHaveBeenCalledOnce(); expect(aborted.reply.hijack).not.toHaveBeenCalled();
  });
});

describe("native finite application policy flag (TEST_ONLY port double, no database or source authority)", () => {
  function fixture(incomingFlag: boolean, allowTestOnly?: boolean) {
    const pool = {} as Pool;
    const context: AccessEvaluationContext = { principal_id: "TEST_ONLY:actor", workspace_id: "TEST_ONLY:workspace",
      now_ms: 1, actor_current: true, grants: [], active_principals: new Set(["TEST_ONLY:actor"]),
      allow_test_only: incomingFlag, relationsFor: () => ({ qualified: false, revision: "UNQUALIFIED",
        own_alpha_ids: [], member_portfolio_ids: [], roots: {}, membership: null }),
      policy: { workspace_id: "TEST_ONLY:workspace", revision: "TEST_ONLY:policy", artifact_digest: accessDigest("TEST_ONLY:policy"),
        approval_ref: "TEST_ONLY:fixture-only", state: "REVIEWED", qualification: "TEST_ONLY", protected_owner_user_id: "TEST_ONLY:actor",
        researcher_fields: { state: "PENDING", policy_ref: null, fields: [] } } };
    const currentRelations: NativeCurrentRelationsPort = {
      usesPool: candidate => candidate === pool,
      observe: async () => { throw Error("TEST_ONLY_UNEXPECTED_OBSERVE"); },
      sendFinite: async input => {
        expect(await input.build(context)).toEqual(Buffer.from("TEST_ONLY"));
        input.assertAllowed(context);
      },
    };
    const trust = { ...unqualifiedAccessTrust, currentRelations };
    const service = allowTestOnly === undefined ? new ExecutionAccessService(pool, {} as AuthService, trust)
      : new ExecutionAccessService(pool, {} as AuthService, trust, allowTestOnly);
    const run = async (expected: boolean) => {
      const callbacks: AccessEvaluationContext[] = [];
      await service.deliverNativeCurrent({ user_id: "TEST_ONLY:actor", session_id: "TEST_ONLY:session", session_generation: 1 },
        "TEST_ONLY:workspace", "account.read", [{ kind: "ACCOUNT", id: "TEST_ONLY:account" }], {} as ServerResponse,
        async current => { callbacks.push(current); expect(current.allow_test_only).toBe(expected); expect(policyReady(current)).toBe(expected); return Buffer.from("TEST_ONLY"); },
        current => { callbacks.push(current); expect(current.allow_test_only).toBe(expected); expect(policyReady(current)).toBe(expected); });
      expect(callbacks).toHaveLength(2);
      for (const current of callbacks) expect(current).not.toBe(context);
      expect(context.allow_test_only).toBe(incomingFlag);
    };
    return { run };
  }
  it("preserves the private TEST_ONLY opt-in consistently in both callbacks, independently of the incoming provider flag", async () => {
    await fixture(false, true).run(true);
  });
  it("forces default/explicit production false even when the incoming provider claims TEST_ONLY permission", async () => {
    await fixture(true).run(false);
    await fixture(true, false).run(false);
  });
});

describe.skipIf(!database).sequential("native named Paper Account/Alpha routes: actual PG + HTTP (TEST_ONLY external source)", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>, pool: Pool, auth: AuthService;
  let owner: string, token: string;
  const endpoints: Awaited<ReturnType<typeof currentRelationsTestEndpoint>>[] = [];
  const applications: NestFastifyApplication[] = [];
  beforeAll(async () => {
    const url = new URL(database!);
    if (!/^control-api-test-postgres-[a-zA-Z0-9_-]+$/.test(url.hostname) || url.pathname !== "/portal_control_test")
      throw Error("NATIVE_MANAGER_ACCOUNT_DISPOSABLE_DATABASE_REQUIRED");
    await migrateTestDatabase(database!);
    ctx = await setupApp({ DATABASE_URL: database!, EXECUTION_EDGE_PAPER_PROFILE_ID: "PAPER_BINANCE_USDM" });
    pool = new Pool({ connectionString: database, max: 1, connectionTimeoutMillis: 2000, query_timeout: 6000 });
    auth = ctx.app.get(AuthService);
    // CF assertion is an explicit TEST_ONLY external boundary. Local activation,
    // password hashing, session issuance and SessionGuard all remain real.
    vi.spyOn(auth, "verifyAccessIdentity").mockImplementation(async assertion => ({
      iss: "https://test-only.cloudflareaccess.com", sub: `TEST_ONLY:${assertion}`, aud: "test-audience",
      email: `${assertion}@azdag.com`, normalizedEmail: `${assertion}@azdag.com`,
      authenticationTime: new Date(), tokenExpiresAt: new Date(Date.now() + 60000),
    }));
    const username = `native-account-${randomUUID()}`, admin = new AdminService(ctx.pool, ctx.config, auth);
    const user = await admin.createUser({ username, displayName: "TEST_ONLY native Account", role: "USER" });
    owner = user.userId;
    const activation = await admin.resetCredential(owner);
    const initial = await auth.login({ assertion: username, username, credential: activation.activationToken });
    const password = `T7!${randomUUID()}aZ`;
    await auth.changePassword({ sessionToken: initial.token, csrfToken: initial.csrfToken,
      currentPassword: activation.activationToken, newPassword: password });
    token = (await auth.login({ assertion: username, username, credential: password })).token;
    await new OwnerAccessRepository(pool).claimOwner({ userId: owner, claimedBy: "TEST_ONLY_NATIVE_ACCOUNT_COMPONENT" });
  });
  afterEach(async () => {
    for (const app of applications.splice(0)) await app.close();
    for (const endpoint of endpoints.splice(0)) await endpoint.close();
    if (pool) { await pool.query("TRUNCATE portal_native_current_read_obligations"); await pool.query("DROP SCHEMA IF EXISTS elp210_candidate CASCADE"); }
    vi.restoreAllMocks();
  });
  afterAll(async () => { if (pool) await pool.end(); if (ctx) await teardownApp(ctx); });

  async function fixture(surface: "ACCOUNT" | "ALPHA" | "FUND" | "FLEET" | "PORTFOLIO" | "DEPLOYMENT" | "SERIES" = "ACCOUNT",
    options: { includeAlphaAction?: boolean; missingAlphaTarget?: boolean; nativeToken?:boolean } = {}) {
    await pool.query(await readFile(join(__dirname, "../src/execution-v2/current-human-candidate.sql"), "utf8"));
    const id = randomUUID(), now = Date.now(), workspace = next("workspace"), account = next("account"), facts = rootWireFacts(now);
    await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY native Account',$2)", [workspace, owner]);
    await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER')", [workspace, owner]);
    const tuple = { alpha_id: next("alpha"), alpha_version_id: next("av"), portfolio_id: next("portfolio"), deployment_id: next("deployment"), account_id: account };
    const resources = [{ kind: "ALPHA" as const, id: tuple.alpha_id }, { kind: "ALPHA_VERSION" as const, id: tuple.alpha_version_id },
      { kind: "PORTFOLIO" as const, id: tuple.portfolio_id }, { kind: "DEPLOYMENT" as const, id: tuple.deployment_id }, { kind: "ACCOUNT" as const, id: account }];
    const policy = { workspace_id: workspace, revision: next("policy"), artifact_digest: accessDigest(id), approval_ref: "TEST_ONLY-not-owner-approval",
      state: "REVIEWED" as const, qualification: "TEST_ONLY" as const, protected_owner_user_id: owner,
      researcher_fields: { state: "QUALIFIED" as const, policy_ref: "TEST_ONLY-fields", fields: [...BUSINESS_READ_FIELDS] } };
    const grant = { ...facts.grant, grant_id: next("grant"), subject_user_id: owner, issued_by: owner, workspace_id: workspace, policy_revision: policy.revision };
    const artifact: ReviewedPolicyArtifact = { policy, root_grants: [grant], provenance_ref: "TEST_ONLY-component" };
    const fact = { ...facts.fact, portal_user_id: owner, human_requester_user_id: owner, workspace_id: workspace,
      receipt_id: next("receipt"), grant_id: grant.grant_id, policy_revision: policy.revision, grant_digest: accessDigest(grant),
      policy_artifact_digest: policy.artifact_digest, policy_install_digest: accessDigest(artifact), approval_ref: policy.approval_ref };
    const relations = { ...facts.relations, subject_user_id: owner, workspace_id: workspace,
      resources: [{ ...facts.relations.resources[0], member_portfolio_ids: [tuple.portfolio_id],
        roots: [{ ...facts.relations.resources[0].roots[0], resources }] }],
      grants: [{ ...facts.relations.grants[0], grant_id: grant.grant_id, binding_digest: grantBindingDigest(grant), accepted: fact,
        targets: [{ kind: "ROOT" as const, id: facts.grant.selector.kind === "ROOT_SCOPE" ? facts.grant.selector.root_id : "" }, ...resources]
          .map(resource => ({ resource, environment: "paper" as const, revision: "TEST_ONLY-native-original",
            native_reference_digest: accessDigest(["TEST_ONLY", resource]), valid_from_ms: now - 1000, valid_until_ms: now + 60000 })) }] };
    const rootReceiptInput = Object.freeze({ TEST_ONLY_root_receipt: randomUUID() });
    const baseTrust = { ...unqualifiedAccessTrust, verifyPolicy: async (input: unknown) => input === artifact ? artifact : null,
      // The external accepted fact is explicitly synthetic. Install it through
      // the real private intake so route authorization checks a genuine stored
      // Core receipt/digest, not a manually updated grant or a bypass evaluator.
      verifyRootReceipt: async (input: unknown) => input === rootReceiptInput ? {
        fact, mapping: { ts_user_id: fact.ts_user_id, revision: fact.mapping_revision },
        membership: { receipt_id: fact.receipt_id, revision: fact.membership_revision, mapping_revision: fact.mapping_revision },
        current_authority: relations,
        assertCurrent: () => { if (Date.now() >= fact.expires_at_ms!) throw Error("TEST_ONLY_ROOT_RECEIPT_EXPIRED"); },
        release: async () => {},
      } : null,
      readPublication: async (input: ExecutionReadPublicationRequest) => ({ ...input, qualification: "TEST_ONLY" as const, publication_revision: "TEST_ONLY-publication",
        population_coverage: "COMPLETE_FOR_DATASET_WINDOW" as const, provenance_ref: "TEST_ONLY-no-source-proof", resources, tuples: [tuple], current_linkage: null }) };
    const installer = new ExecutionAccessService(pool, auth, baseTrust, true);
    await installer.installReviewedPolicy(artifact);
    expect((await installer.acceptRootTsReceipt(rootReceiptInput)).receipt.outcome).toBe("TS_APPLIED");
    const sourceRelations = options.missingAlphaTarget ? { ...relations,
      grants: relations.grants.map(g => ({ ...g, targets: g.targets.filter(t => t.resource.kind !== "ALPHA") })) } : relations;
    const terminal = generateKeyPairSync("ed25519"), states = new Map<string, string>(), terminals: Record<string, unknown>[] = [];
    let onEnter: (() => Promise<void>) | undefined;
    let dropResolve = false;
    const endpoint = await currentRelationsTestEndpoint(async (base, action, res, body) => {
      expect((await pool.query("SELECT 1 AS n")).rows[0].n).toBe(1); // no Core client held over source I/O
      const key = base.binding.lease_id, reply = currentRelationsWireReply(base, action, sourceRelations);
      if (action === "issue") states.set(key, "ISSUED");
      if (action === "enter") { states.set(key, "ENTERED"); await onEnter?.(); }
      if (action === "cancel-unentered") states.set(key, "CANCELLED");
      if (action === "status") return { ...reply, recovery: states.get(key) === "CANCELLED"
        ? { state: "RECORDED", phase: "CANCELLED", terminal_authority: false, release_permitted: false }
        : { state: "RECORDED", phase: states.get(key), source_digest: "c".repeat(64), expires_at: base.deadline, terminal_authority: false, release_permitted: false } };
      if (action === "resolve") {
        const claims = (await jwtVerify(String(body.signed_terminal), terminal.publicKey,
          { issuer: "TEST_ONLY-core-terminal", audience: "TEST_ONLY-pm-terminal", algorithms: ["EdDSA"] })).payload;
        expect(claims).toMatchObject({ purpose: "pma.native-business-to-core-terminal.v1", operation: "READ", lease_id: key,
          attempt_id: base.binding.attempt_id, binding_digest: accessDigest(base.binding).slice(7), source_digest: "c".repeat(64) });
        terminals.push({ ...claims }); states.set(key, String(claims.phase));
        if (dropResolve) { res.destroy(); return; }
        return { ...reply, recovery: { state: "SETTLED", phase: claims.phase, terminal_authority: true, release_permitted: true } };
      }
      return reply;
    }); endpoints.push(endpoint);
    const config: NativeCurrentRelationsProviderConfig = { bindings: [{ actor_id: owner, principal_id: owner,
      source: { human_issuer: "TEST_ONLY-core", subject: "TEST_ONLY-native-human", workspace_id: workspace, environment: "paper", workload_id: "TEST_ONLY-native-current" },
      registration: { correspondence_id: next("correspondence"), expected_version: "9007199254741001", manifest_sha256: "a".repeat(64) },
      original: { grant_id: grant.grant_id, accepted_fact_digest: accessDigest(fact) },
      correspondence: { registry_revision: accessDigest("TEST_ONLY-registry"), payload_sha256: "b".repeat(64), approval_ref: "TEST_ONLY-independent-review" },
      allowed_actions: ["access.read", "account.read",
        ...(["FUND","SERIES"].includes(surface) ? ["business.read_all" as const] : []),
        ...(["PORTFOLIO","SERIES"].includes(surface) ? ["portfolio.read" as const] : []),
        ...(["ALPHA", "FLEET", "DEPLOYMENT","SERIES"].includes(surface) && options.includeAlphaAction !== false ? ["alpha.read" as const] : [])] }],
      maximum_retained: 128, maximum_unresolved: 8, maximum_recoveries: 8, maximum_principals: 8,
      attempt_ms: 30000, terminal: { issuer: "TEST_ONLY-core-terminal", audience: "TEST_ONLY-pm-terminal", key_id: "TEST_ONLY-terminal", private_key: terminal.privateKey, ttl_seconds: 30 } };
    const provider = new NativeCurrentRelationsProvider(pool, endpoint.client,
      new NativeReadEgress({ maximum_response_bytes: 1048576, maximum_inflight: 2, send_timeout_ms: 5000, quiesce_timeout_ms: 50 }), config);
    const routeConfig=surface==="SERIES"?{...ctx.config,EXECUTION_READ_PROFILE:"native_manager_review_v1" as const,
      EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID:workspace}:ctx.config;
    const nativeScopes = new ExecutionReadScopes(pool, new ExecutionAccessService(pool, auth, provider.compose(baseTrust), true), routeConfig);
    const ordinaryScopes = new ExecutionReadScopes(pool, new ExecutionAccessService(pool, auth, baseTrust, true), routeConfig);
    const nativeToken=options.nativeToken===false?undefined:new NativeCurrentAccountScopes(nativeScopes);
    const model = new ManagerModelService(pool, ordinaryScopes, routeConfig, undefined, nativeToken);
    const series=new ManagerSeriesService(pool,ordinaryScopes,routeConfig,undefined,nativeToken);
    const doc: ManagerModelDocument = { schema_version: "portal.execution.manager-model-input.v1", workspace_id: workspace,
      environment: "paper", profile_id: "PAPER_BINANCE_USDM", qualification: "SOURCE_VERIFIED", family_id: "alpha_fleet_overview",
      revision: next("projection"), supersedes_revision: null, source_epoch: next("epoch"), source_sequence: "1", projection_generation: next("generation"),
      catalogue_digest: EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest, source_set_digest: accessDigest([tuple]),
      as_of_ms: now, recorded_through_ms: now, facts_through_ms: now, observed_at_ms: now,
      source_quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] }, members: [{ tuple, stage: "PAPER", name: "TEST_ONLY native Account",
        owner_user_id: owner, lifecycle: "ACTIVE", venue: "TEST_ONLY", health: null, source_state: null, binding_ref: null,
        assignment_revision: "TEST_ONLY:r1", owner_revision: "TEST_ONLY:r1", binding_revision: "TEST_ONLY:r1", valid_from_ms: now - 1000, valid_to_ms: null }], facts: [] };
    if(surface==="SERIES"){
      const partition={economic_domain:"PAPER" as const,currency:"USDT",basis:"TEST_ONLY:nav-ledger",
        native_profile_ref:"TEST_ONLY:ledger",domain_proof_ref:"TEST_ONLY:domain-proof"};
      const from=now-30*86_400_000;
      // Explicit qualified-shaped synthetic financial originals. This proves
      // source→scope→physical HTTP composition, not financial commissioning.
      doc.precomputed_series=(["manager_book","portfolio","alpha"] as const).map(type=>({
        binding:{subject_type:type,subject_id:type==="manager_book"?workspace:type==="portfolio"?tuple.portfolio_id:tuple.alpha_id,
          tuple_population_digest:managerScorePopulationDigest(doc.members),stage_filter:["PAPER"],metric:"NAV",partition,
          window_start_ms:from,window_end_ms:now},
        series:{unit:"MONEY",currency:"USDT",ratio_scale:null,basis:partition.basis,methodology_ref:"TEST_ONLY:source-nav.v1",
          points:[{ts_ms:from,value:"100.000000000000000001"},{ts_ms:now-86_400_000,value:"101.25"}],gaps:[]},
        quality:{completeness:"COMPLETE",freshness:"FRESH",reasons:[]},source_confidence:"VERIFIED",
        provenance:{scope:{workspace_id:workspace,environment:"paper",profile_id:doc.profile_id,catalogue_digest:doc.catalogue_digest},
          source_revision:doc.revision,source_set_digest:doc.source_set_digest,source_qualification:"SOURCE_VERIFIED",
          input_digest:accessDigest(["TEST_ONLY:series-input",type]),calculation_revision:"TEST_ONLY:source-calc",policy_revision:policy.revision,source_as_of_ms:now}}));
    }
    // Explicit disposable projection fixture, not persistManagerProjection and
    // not source qualification. Reader receives real hash-checked PG bytes.
    const digest = accessDigest(doc);
    await pool.query(`INSERT INTO execution_manager_model_revisions(workspace_id,environment,profile_id,revision,source_epoch,source_sequence,projection_generation,payload_digest,payload)
      VALUES($1,'paper',$2,$3,$4,1,$5,$6,$7::jsonb)`, [workspace, doc.profile_id, doc.revision, doc.source_epoch, doc.projection_generation, digest, JSON.stringify(doc)]);
    await pool.query(`INSERT INTO execution_manager_model_heads(workspace_id,environment,profile_id,revision,source_epoch,source_sequence,projection_generation,payload_digest,catalogue_digest)
      VALUES($1,'paper',$2,$3,$4,1,$5,$6,$7)`, [workspace, doc.profile_id, doc.revision, doc.source_epoch, doc.projection_generation, digest, doc.catalogue_digest]);
    @Module({ controllers: [ManagerModelController,ManagerSeriesController], providers: [{ provide: ManagerModelService, useValue: model },
      {provide:ManagerSeriesService,useValue:series},...(nativeToken?[{provide:NativeCurrentAccountScopes,useValue:nativeToken}]:[]),
      { provide: WorkspacesRepository, useValue: new WorkspacesRepository(pool, routeConfig) }, { provide: AuthService, useValue: auth },
      { provide: CONTROL_API_CONFIG, useValue: routeConfig }, SessionGuard] }) class TestOnlyRouteModule {}
    const app = await NestFactory.create<NestFastifyApplication>(TestOnlyRouteModule, new FastifyAdapter(), { logger: false, abortOnError: false });
    applications.push(app); app.useGlobalFilters(new HttpErrorFilter()); await app.register(cookie as never); await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address(); if (!address || typeof address === "string") throw Error("TEST_ONLY_ROUTE_ADDRESS");
    const alpha = tuple.alpha_id;
    const route = surface === "ACCOUNT" ? `accounts/${encodeURIComponent(account)}/overview` :
      surface === "ALPHA" ? `alphas/${encodeURIComponent(alpha)}/overview` :
      surface === "PORTFOLIO" ? `portfolios/${encodeURIComponent(tuple.portfolio_id)}/overview` :
      surface === "DEPLOYMENT" ? `deployments/${encodeURIComponent(tuple.deployment_id)}/overview` :
      surface === "FUND" ? "fund-overview" : surface==="SERIES"?"series":"fleet";
    const subjects=[{subject_type:"FUND"},{subject_type:"PORTFOLIO",subject_id:tuple.portfolio_id},{subject_type:"ALPHA",subject_id:alpha}];
    const path = `/api/v1/execution/manager/${route}?environment=paper&workspace_id=${encodeURIComponent(workspace)}`+
      (surface==="SERIES"?`&metric=NAV&window=30D&subjects=${encodeURIComponent(JSON.stringify(subjects))}`:"");
    return { provider, endpoint, model, series,nativeScopes, ordinaryScopes, terminals, workspace, account, alpha, path,
      onEnter(hook: () => Promise<void>) { onEnter = hook; },
      loseResolveResponse(value: boolean) { dropResolve = value; },
      rows: async () => (await pool.query("SELECT * FROM portal_native_current_read_obligations WHERE source_config_digest=$1 ORDER BY created_at,lease_id", [provider.source_config_digest])).rows,
      get: (target = path, credential = token) => new Promise<{ status: number; body: string; complete: boolean; cache?: string }>(resolve => {
        const req = request(`http://127.0.0.1:${address.port}${target}`, { agent: false, headers: credential ? { cookie: `${SESSION_COOKIE}=${credential}` } : {} }, res => {
          const chunks: Buffer[] = []; const finish = () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8"), complete: res.complete, cache: res.headers["cache-control"] });
          res.on("data", chunk => chunks.push(Buffer.from(chunk))); res.once("end", finish); res.once("error", finish); res.once("aborted", finish);
        }); req.setTimeout(10000, () => req.destroy()); req.once("error", () => resolve({ status: 0, body: "", complete: false })); req.end();
      }) };
  }
  it("native_review SessionGuard admits the exact Series route only with its real native token, holding mixed purposes through ONE HTTP send",async()=>{
    const f=await fixture("SERIES"),fallback=vi.spyOn(f.ordinaryScopes,"deliver"),detached=vi.spyOn(f.series,"read");
    const result=await f.get();
    expect(result.status,JSON.stringify({response:result,source_actions:f.endpoint.requests.map(call=>call.action)})).toBe(200);
    expect(result.complete).toBe(true);expect(result.cache).toBe("private, no-store");
    const body=managerSeriesResponse.parse(JSON.parse(result.body));
    expect(body.series.map(entry=>entry.subject.subject_type)).toEqual(["FUND","PORTFOLIO","ALPHA"]);
    for(const entry of body.series){expect(entry.state).toBe("AVAILABLE");expect(entry.points.map(point=>point.value)).toEqual(["100.000000000000000001","101.25"]);}
    expect(body.comparison.state).toBe("ALIGNED");
    await vi.waitFor(async()=>expect((await f.rows()).filter(row=>row.phase==="SERVED")).toHaveLength(3));
    await vi.waitFor(async()=>expect((await f.rows()).every(row=>row.source_settled)).toBe(true));
    const served=(await f.rows()).filter(row=>row.phase==="SERVED"),entered=f.endpoint.requests.filter(call=>call.action==="enter");
    expect(entered.map(call=>call.base.purpose.action)).toEqual(["business.read_all","portfolio.read","alpha.read"]);
    expect(new Set(served.map(row=>row.flight_id)).size).toBe(1);
    expect(new Set(served.map(row=>row.terminal_fact.observation.binding.lease_id)).size).toBe(1);
    expect(new Set(served.map(row=>row.terminal_fact.observation.binding.scope_digest)).size).toBe(1);
    expect(new Set(served.map(row=>row.lease_id)).size).toBe(3);expect(f.terminals).toHaveLength(3);
    for(const row of served)expect(row.terminal_fact.observation).toMatchObject({outcome:"FINISHED",bytes:Buffer.byteLength(result.body)});
    expect(fallback).not.toHaveBeenCalled();expect(detached).not.toHaveBeenCalled();
  });
  it("native_review Series rejects the missing native token at SessionGuard, without source I/O or an ordinary fallback",async()=>{
    const f=await fixture("SERIES",{nativeToken:false}),detached=vi.spyOn(f.series,"read");
    expect((await f.get()).status).toBe(403);expect(f.endpoint.requests).toHaveLength(0);expect(await f.rows()).toHaveLength(0);
    expect(detached).not.toHaveBeenCalled();
  });
  it("native_review Series projection generation changing during ENTER aborts ALL mixed-purpose originals with zero bytes",async()=>{
    const f=await fixture("SERIES"),detached=vi.spyOn(f.series,"read");
    f.onEnter(async()=>{await pool.query("UPDATE execution_manager_model_heads SET projection_generation=$2 WHERE workspace_id=$1",[f.workspace,next("series-replaced")]);});
    const result=await f.get();expect(result.complete).toBe(false);expect(result.body).toBe("");
    await vi.waitFor(async()=>expect((await f.rows()).filter(row=>row.phase==="ABORTED"&&row.source_settled)).toHaveLength(3));
    expect((await f.rows()).some(row=>row.phase==="SERVED")).toBe(false);
    expect(f.terminals).toHaveLength(3);for(const terminal of f.terminals)expect(terminal).toMatchObject({phase:"ABORTED",evidence_kind:"FINAL_HTTP_ABORT_CONFIRMED"});
    expect(f.endpoint.requests.filter(call=>call.action==="enter")).toHaveLength(3);expect(detached).not.toHaveBeenCalled();
  });
  it.each(["ACCOUNT", "ALPHA", "FUND", "FLEET", "PORTFOLIO", "DEPLOYMENT"] as const)("serves the actual named %s route once, through native ENTER/SENDING/physical finish/terminal ACK, never ordinary delivery", async surface => {
    const f = await fixture(surface), fallback = vi.spyOn(f.ordinaryScopes, "deliver"), detached = vi.spyOn(f.model, "read");
    const result = await f.get();
    expect(result.status, JSON.stringify({ response: result, source_actions: f.endpoint.requests.map(call => call.action) })).toBe(200);
    expect(result.complete).toBe(true);
    expect(result.cache).toBe("private, no-store"); const body = managerDatasetResponse.parse(JSON.parse(result.body));
    expect(body.surface).toBe(surface); expect(body.page.returned_count).toBe(1);
    expect(body.items[0].children[0][surface === "ACCOUNT" ? "account_id" : "alpha_id"]).toBe(surface === "ACCOUNT" ? f.account : f.alpha);
    // HTTP finish can precede the source ACK; wait on actual durable rows, not a
    // guessed delay or a fabricated source terminal.
    await vi.waitFor(async () => expect((await f.rows()).filter(r => r.phase === "SERVED")).toHaveLength(1));
    await vi.waitFor(async () => expect((await f.rows()).every(r => r.source_settled)).toBe(true));
    const sent = (await f.rows()).find(r => r.phase === "SERVED"); expect(sent.terminal_fact.observation.outcome).toBe("FINISHED");
    expect(f.terminals).toHaveLength(1); expect(f.terminals[0]).toMatchObject({ phase: "SERVED", evidence_kind: "FINAL_HTTP_SEND_COMPLETED" });
    expect(f.endpoint.requests.filter(call => call.action === "enter")).toHaveLength(1);
    expect(f.endpoint.requests.find(call => call.action === "enter")!.base.purpose.action).toBe(
      surface === "ACCOUNT" ? "account.read" : surface === "FUND" ? "business.read_all" : surface === "PORTFOLIO" ? "portfolio.read" : "alpha.read");
    expect(fallback).not.toHaveBeenCalled(); expect(detached).not.toHaveBeenCalled();
  });
  it.each(["ACCOUNT", "ALPHA"] as const)("a real %s projection-head change during source ENTER aborts unsent response and authenticates only ABORTED", async surface => {
    const f = await fixture(surface), detached = vi.spyOn(f.model, "read");
    f.onEnter(async () => {
      if (surface === "ALPHA") {
        // An actual revoke cannot jump the native source/custody fence. Do
        // not manufacture an authority mutation while this flight is live.
        await expect(pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [f.workspace, owner]))
          .rejects.toMatchObject({ code: "P0001" });
        expect((await pool.query("SELECT 1 FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [f.workspace, owner])).rowCount).toBe(1);
      }
      await pool.query("UPDATE execution_manager_model_heads SET projection_generation=$2 WHERE workspace_id=$1", [f.workspace, next("replaced")]);
    });
    const result = await f.get();
    expect(result.complete, JSON.stringify({ response: result, source_actions: f.endpoint.requests.map(call => call.action) })).toBe(false);
    expect(result.body).toBe("");
    await vi.waitFor(async () => expect((await f.rows()).some(r => r.phase === "ABORTED" && r.source_settled)).toBe(true));
    expect(f.terminals).toHaveLength(1); expect(f.terminals[0]).toMatchObject({ phase: "ABORTED", evidence_kind: "FINAL_HTTP_ABORT_CONFIRMED" });
    expect(detached).not.toHaveBeenCalled();
    if (surface === "ALPHA") {
      // After authenticated ABORTED/ACK, the same real revocation is admitted
      // and the next request cannot enter or deliver that retained projection.
      await expect(pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [f.workspace, owner])).resolves.toMatchObject({ rowCount: 1 });
      const calls = f.endpoint.requests.length;
      expect((await f.get()).status).toBe(404);
      expect(f.endpoint.requests).toHaveLength(calls);
    }
  });
  it.each(["ACCOUNT", "ALPHA"] as const)("actual %s SessionGuard/query/workspace refusals emit no source ENTER, no native bytes and no ordinary fallback", async surface => {
    const f = await fixture(surface), detached = vi.spyOn(f.model, "read");
    expect((await f.get(f.path, "")).status).toBe(401);
    expect((await f.get(`${f.path}&relation=private`)).status).toBe(400);
    expect((await f.get(f.path.replace(encodeURIComponent(f.workspace), "TEST_ONLY-foreign-workspace"))).status).toBe(404);
    expect(f.endpoint.requests).toHaveLength(0); expect(await f.rows()).toHaveLength(0); expect(detached).not.toHaveBeenCalled();
  });
  it("an account.read source binding does not authorize Alpha delivery or ENTER an Alpha source attempt", async () => {
    const f = await fixture("ALPHA", { includeAlphaAction: false }), detached = vi.spyOn(f.model, "read");
    expect((await f.get()).status).toBe(503);
    // Advisory access.read remains its own genuine cancelled purpose; it must
    // not become alpha.read or enter the physical source fence.
    expect(f.endpoint.requests.every(call => call.base.purpose.action === "access.read")).toBe(true);
    expect(f.endpoint.requests.some(call => call.action === "enter")).toBe(false);
    expect((await f.rows()).every(row => row.phase === "CANCELLED" && row.source_settled)).toBe(true);
    expect(detached).not.toHaveBeenCalled();
  });
  it("an accepted original without the exact Alpha target refuses before ENTER, never borrowing its Account/root sibling", async () => {
    const f = await fixture("ALPHA", { missingAlphaTarget: true }), detached = vi.spyOn(f.model, "read");
    expect([404, 503]).toContain((await f.get()).status);
    expect(f.endpoint.requests.some(call => call.action === "enter")).toBe(false);
    expect((await f.rows()).every(row => row.phase === "CANCELLED" && row.source_settled)).toBe(true);
    expect(detached).not.toHaveBeenCalled();
  });
  it("another Alpha id and an actual removed workspace membership cannot ENTER or leak the retained projection", async () => {
    const f = await fixture("ALPHA"), detached = vi.spyOn(f.model, "read");
    const wrong = await f.get(f.path.replace(encodeURIComponent(f.alpha), "TEST_ONLY:unaccepted-alpha"));
    expect([404, 503]).toContain(wrong.status);
    expect(f.endpoint.requests.some(call => call.action === "enter")).toBe(false);
    await pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [f.workspace, owner]);
    const calls = f.endpoint.requests.length;
    expect((await f.get()).status).toBe(404);
    expect(f.endpoint.requests).toHaveLength(calls); expect(detached).not.toHaveBeenCalled();
  });
  it("lost Alpha terminal ACK preserves the served original and recovers it without a second HTTP body or ordinary fallback", async () => {
    const f = await fixture("ALPHA"), detached = vi.spyOn(f.model, "read"), selected = vi.spyOn(f.model, "readNativeAlpha");
    f.loseResolveResponse(true);
    const result = await f.get();
    expect(result.status).toBe(200); expect(result.complete).toBe(true);
    expect(managerDatasetResponse.parse(JSON.parse(result.body)).surface).toBe("ALPHA");
    await vi.waitFor(() => expect(selected).toHaveBeenCalledOnce());
    await expect(selected.mock.results[0].value).rejects.toBeDefined();
    const before = (await f.rows()).find(row => row.phase === "SERVED");
    expect(before).toMatchObject({ source_settled: false });
    expect(before.terminal_fact.observation.outcome).toBe("FINISHED");
    expect(detached).not.toHaveBeenCalled();
    const calls = f.endpoint.requests.length;
    f.loseResolveResponse(false);
    await expect(f.provider.recover()).resolves.toEqual({ remaining: 0 });
    const after = (await f.rows()).find(row => row.lease_id === before.lease_id);
    expect(after).toMatchObject({ phase: "SERVED", source_settled: true, attempt_id: before.attempt_id,
      terminal_receipt_id: before.terminal_receipt_id, terminal_receipt_digest: before.terminal_receipt_digest });
    expect(after.terminal_fact).toEqual(before.terminal_fact);
    expect(f.endpoint.requests.slice(calls).map(call => call.action)).toEqual(["status", "resolve"]);
    expect(new Set(f.terminals.map(fact => String(fact.receipt_id)))).toEqual(new Set([before.terminal_receipt_id]));
    expect(f.endpoint.requests.filter(call => call.action === "enter")).toHaveLength(1);
  });
});
