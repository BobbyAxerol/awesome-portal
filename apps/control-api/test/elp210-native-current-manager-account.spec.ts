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

describe("native Account route selection and physical writer ownership (synthetic boundary doubles)", () => {
  function fixture() {
    const ordinary = vi.fn(async () => ({ TEST_ONLY: "ordinary unchanged" }));
    const native = vi.fn(async (_p: unknown, _q: unknown, _id: string, _raw: unknown, beforeDispatch: () => void) => {
      beforeDispatch(); beforeDispatch();
    });
    const models = { hasNativeCurrentRelations: () => true, read: ordinary, readNativeAccount: native };
    const controller = new ManagerModelController(models as unknown as ManagerModelService,
      { canReadExecution: async () => true } as unknown as WorkspacesRepository);
    const req = { portalUser: { userId: "TEST_ONLY:user" }, portalSession: {}, portalWorkspaceId: "TEST_ONLY:workspace" } as any;
    const raw = { headersSent: false, writableEnded: false, destroyed: false, destroy: vi.fn() };
    const reply = { raw, sent: false, hijack: vi.fn(() => { raw.headersSent = true; }) } as unknown as FastifyReply;
    return { controller, ordinary, native, req, raw, reply };
  }
  it("selects ONLY Paper Account, hijacks once across repeated physical permit checks, and never returns a detached body", async () => {
    const f = fixture();
    expect(await f.controller.account(f.req, { environment: "paper" }, "TEST_ONLY:account", f.reply)).toBeUndefined();
    expect(f.native).toHaveBeenCalledOnce(); expect(f.reply.hijack).toHaveBeenCalledOnce(); expect(f.ordinary).not.toHaveBeenCalled();
  });
  it("keeps ordinary Fleet ALL, Portfolio and non-Paper Account paths unchanged", async () => {
    const f = fixture();
    for (const response of [await f.controller.fleet(f.req, { environment: "ALL" }),
      await f.controller.portfolio(f.req, { environment: "paper" }, "TEST_ONLY:portfolio"),
      await f.controller.account(f.req, { environment: "sandbox" }, "TEST_ONLY:account", f.reply)])
      expect(response).toEqual({ TEST_ONLY: "ordinary unchanged" });
    expect(f.ordinary).toHaveBeenCalledTimes(3); expect(f.native).not.toHaveBeenCalled(); expect(f.reply.hijack).not.toHaveBeenCalled();
  });
  it("never falls back after native refusal, sanitizes arbitrary errors, and leaves pre-send typed errors to Fastify", async () => {
    const f = fixture(); f.native.mockRejectedValueOnce(new Error("TEST_ONLY:private-source-secret"));
    await expect(f.controller.account(f.req, { environment: "paper" }, "TEST_ONLY:account", f.reply))
      .rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 400 });
    expect(f.reply.hijack).not.toHaveBeenCalled(); expect(f.ordinary).not.toHaveBeenCalled();
    f.native.mockRejectedValueOnce(new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409));
    await expect(f.controller.account(f.req, { environment: "paper" }, "TEST_ONLY:account", f.reply))
      .rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
  });
  it("does not attempt a second framework response after dispatch or an unsent physical abort", async () => {
    const f = fixture();
    f.native.mockImplementationOnce(async (_p, _q, _id, _raw, send) => { send(); throw Error("TEST_ONLY:ACK lost"); });
    expect(await f.controller.account(f.req, { environment: "paper" }, "TEST_ONLY:account", f.reply)).toBeUndefined();
    expect(f.raw.destroy).toHaveBeenCalledOnce(); expect(f.ordinary).not.toHaveBeenCalled();
    const aborted = fixture(); aborted.raw.destroyed = true; aborted.native.mockRejectedValueOnce(Error("TEST_ONLY:aborted"));
    expect(await aborted.controller.account(aborted.req, { environment: "paper" }, "TEST_ONLY:account", aborted.reply)).toBeUndefined();
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

describe.skipIf(!database).sequential("native named Paper Account route: actual PG + HTTP (TEST_ONLY external source)", () => {
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

  async function fixture() {
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
    const terminal = generateKeyPairSync("ed25519"), states = new Map<string, string>(), terminals: Record<string, unknown>[] = [];
    let onEnter: (() => Promise<void>) | undefined;
    const endpoint = await currentRelationsTestEndpoint(async (base, action, res, body) => {
      expect((await pool.query("SELECT 1 AS n")).rows[0].n).toBe(1); // no Core client held over source I/O
      const key = base.binding.lease_id, reply = currentRelationsWireReply(base, action, relations);
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
        return { ...reply, recovery: { state: "SETTLED", phase: claims.phase, terminal_authority: true, release_permitted: true } };
      }
      return reply;
    }); endpoints.push(endpoint);
    const config: NativeCurrentRelationsProviderConfig = { bindings: [{ actor_id: owner, principal_id: owner,
      source: { human_issuer: "TEST_ONLY-core", subject: "TEST_ONLY-native-human", workspace_id: workspace, environment: "paper", workload_id: "TEST_ONLY-native-current" },
      registration: { correspondence_id: next("correspondence"), expected_version: "9007199254741001", manifest_sha256: "a".repeat(64) },
      original: { grant_id: grant.grant_id, accepted_fact_digest: accessDigest(fact) },
      correspondence: { registry_revision: accessDigest("TEST_ONLY-registry"), payload_sha256: "b".repeat(64), approval_ref: "TEST_ONLY-independent-review" },
      allowed_actions: ["access.read", "account.read"] }], maximum_retained: 128, maximum_unresolved: 8, maximum_recoveries: 8, maximum_principals: 8,
      attempt_ms: 30000, terminal: { issuer: "TEST_ONLY-core-terminal", audience: "TEST_ONLY-pm-terminal", key_id: "TEST_ONLY-terminal", private_key: terminal.privateKey, ttl_seconds: 30 } };
    const provider = new NativeCurrentRelationsProvider(pool, endpoint.client,
      new NativeReadEgress({ maximum_response_bytes: 1048576, maximum_inflight: 2, send_timeout_ms: 5000, quiesce_timeout_ms: 50 }), config);
    const nativeScopes = new ExecutionReadScopes(pool, new ExecutionAccessService(pool, auth, provider.compose(baseTrust), true), ctx.config);
    const ordinaryScopes = new ExecutionReadScopes(pool, new ExecutionAccessService(pool, auth, baseTrust, true), ctx.config);
    const model = new ManagerModelService(pool, ordinaryScopes, ctx.config, undefined, new NativeCurrentAccountScopes(nativeScopes));
    const doc: ManagerModelDocument = { schema_version: "portal.execution.manager-model-input.v1", workspace_id: workspace,
      environment: "paper", profile_id: "PAPER_BINANCE_USDM", qualification: "SOURCE_VERIFIED", family_id: "alpha_fleet_overview",
      revision: next("projection"), supersedes_revision: null, source_epoch: next("epoch"), source_sequence: "1", projection_generation: next("generation"),
      catalogue_digest: EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest, source_set_digest: accessDigest([tuple]),
      as_of_ms: now, recorded_through_ms: now, facts_through_ms: now, observed_at_ms: now,
      source_quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] }, members: [{ tuple, stage: "PAPER", name: "TEST_ONLY native Account",
        owner_user_id: owner, lifecycle: "ACTIVE", venue: "TEST_ONLY", health: null, source_state: null, binding_ref: null,
        assignment_revision: "TEST_ONLY:r1", owner_revision: "TEST_ONLY:r1", binding_revision: "TEST_ONLY:r1", valid_from_ms: now - 1000, valid_to_ms: null }], facts: [] };
    // Explicit disposable projection fixture, not persistManagerProjection and
    // not source qualification. Reader receives real hash-checked PG bytes.
    const digest = accessDigest(doc);
    await pool.query(`INSERT INTO execution_manager_model_revisions(workspace_id,environment,profile_id,revision,source_epoch,source_sequence,projection_generation,payload_digest,payload)
      VALUES($1,'paper',$2,$3,$4,1,$5,$6,$7::jsonb)`, [workspace, doc.profile_id, doc.revision, doc.source_epoch, doc.projection_generation, digest, JSON.stringify(doc)]);
    await pool.query(`INSERT INTO execution_manager_model_heads(workspace_id,environment,profile_id,revision,source_epoch,source_sequence,projection_generation,payload_digest,catalogue_digest)
      VALUES($1,'paper',$2,$3,$4,1,$5,$6,$7)`, [workspace, doc.profile_id, doc.revision, doc.source_epoch, doc.projection_generation, digest, doc.catalogue_digest]);
    @Module({ controllers: [ManagerModelController], providers: [{ provide: ManagerModelService, useValue: model },
      { provide: WorkspacesRepository, useValue: new WorkspacesRepository(pool, ctx.config) }, { provide: AuthService, useValue: auth },
      { provide: CONTROL_API_CONFIG, useValue: ctx.config }, SessionGuard] }) class TestOnlyRouteModule {}
    const app = await NestFactory.create<NestFastifyApplication>(TestOnlyRouteModule, new FastifyAdapter(), { logger: false, abortOnError: false });
    applications.push(app); app.useGlobalFilters(new HttpErrorFilter()); await app.register(cookie as never); await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address(); if (!address || typeof address === "string") throw Error("TEST_ONLY_ROUTE_ADDRESS");
    const path = `/api/v1/execution/manager/accounts/${encodeURIComponent(account)}/overview?environment=paper&workspace_id=${encodeURIComponent(workspace)}`;
    return { provider, endpoint, model, nativeScopes, ordinaryScopes, terminals, workspace, account, path,
      onEnter(hook: () => Promise<void>) { onEnter = hook; },
      rows: async () => (await pool.query("SELECT * FROM portal_native_current_read_obligations WHERE source_config_digest=$1 ORDER BY created_at,lease_id", [provider.source_config_digest])).rows,
      get: (target = path, credential = token) => new Promise<{ status: number; body: string; complete: boolean; cache?: string }>(resolve => {
        const req = request(`http://127.0.0.1:${address.port}${target}`, { agent: false, headers: credential ? { cookie: `${SESSION_COOKIE}=${credential}` } : {} }, res => {
          const chunks: Buffer[] = []; const finish = () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8"), complete: res.complete, cache: res.headers["cache-control"] });
          res.on("data", chunk => chunks.push(Buffer.from(chunk))); res.once("end", finish); res.once("error", finish); res.once("aborted", finish);
        }); req.setTimeout(10000, () => req.destroy()); req.once("error", () => resolve({ status: 0, body: "", complete: false })); req.end();
      }) };
  }
  it("serves the actual named route once, through native ENTER/SENDING/physical finish/terminal ACK, never ordinary delivery", async () => {
    const f = await fixture(), fallback = vi.spyOn(f.ordinaryScopes, "deliver"), detached = vi.spyOn(f.model, "read");
    const result = await f.get();
    expect(result.status, JSON.stringify({ response: result, source_actions: f.endpoint.requests.map(call => call.action) })).toBe(200);
    expect(result.complete).toBe(true);
    expect(result.cache).toBe("private, no-store"); const body = managerDatasetResponse.parse(JSON.parse(result.body));
    expect(body.surface).toBe("ACCOUNT"); expect(body.page.returned_count).toBe(1); expect(body.items[0].children[0].account_id).toBe(f.account);
    // HTTP finish can precede the source ACK; wait on actual durable rows, not a
    // guessed delay or a fabricated source terminal.
    await vi.waitFor(async () => expect((await f.rows()).filter(r => r.phase === "SERVED")).toHaveLength(1));
    await vi.waitFor(async () => expect((await f.rows()).every(r => r.source_settled)).toBe(true));
    const sent = (await f.rows()).find(r => r.phase === "SERVED"); expect(sent.terminal_fact.observation.outcome).toBe("FINISHED");
    expect(f.terminals).toHaveLength(1); expect(f.terminals[0]).toMatchObject({ phase: "SERVED", evidence_kind: "FINAL_HTTP_SEND_COMPLETED" });
    expect(fallback).not.toHaveBeenCalled(); expect(detached).not.toHaveBeenCalled();
  });
  it("a real projection-head change during source ENTER aborts unsent response and authenticates only ABORTED", async () => {
    const f = await fixture(), detached = vi.spyOn(f.model, "read");
    f.onEnter(async () => { await pool.query("UPDATE execution_manager_model_heads SET projection_generation=$2 WHERE workspace_id=$1", [f.workspace, next("replaced")]); });
    const result = await f.get();
    expect(result.complete, JSON.stringify({ response: result, source_actions: f.endpoint.requests.map(call => call.action) })).toBe(false);
    expect(result.body).toBe("");
    await vi.waitFor(async () => expect((await f.rows()).some(r => r.phase === "ABORTED" && r.source_settled)).toBe(true));
    expect(f.terminals).toHaveLength(1); expect(f.terminals[0]).toMatchObject({ phase: "ABORTED", evidence_kind: "FINAL_HTTP_ABORT_CONFIRMED" });
    expect(detached).not.toHaveBeenCalled();
  });
  it("actual SessionGuard/query/workspace refusals emit no source ENTER, no native bytes and no ordinary fallback", async () => {
    const f = await fixture(), detached = vi.spyOn(f.model, "read");
    expect((await f.get(f.path, "")).status).toBe(401);
    expect((await f.get(`${f.path}&relation=private`)).status).toBe(400);
    expect((await f.get(f.path.replace(encodeURIComponent(f.workspace), "TEST_ONLY-foreign-workspace"))).status).toBe(404);
    expect(f.endpoint.requests).toHaveLength(0); expect(await f.rows()).toHaveLength(0); expect(detached).not.toHaveBeenCalled();
  });
});
