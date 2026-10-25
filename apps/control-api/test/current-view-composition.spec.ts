/** TEST_ONLY loopback TLS/mTLS over actual AuthService/ExecutionReadScopes.
 * PostgreSQL rows/native publication are synthetic boundary doubles. This is
 * Core composition proof, NOT installed Edge/provider or runtime acceptance. */
import { createHash, generateKeyPairSync, X509Certificate } from "node:crypto";
import { createServer, request, type Server } from "node:https";
import type { Duplex } from "node:stream";
import type { Pool } from "pg";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AuthService } from "../src/auth/auth.service";
import { Argon2CredentialService } from "../src/auth/argon";
import type { ControlApiConfig } from "../src/config";
import type { AuthSession, PortalUser } from "../src/domain";
import { accessDigest, type AccessEvaluationContext } from "../src/execution-v2/access-policy";
import type { AccessResource, ReviewedAccessPolicy, ScopedAccessGrant } from "../src/execution-v2/access.contract";
import type { ExecutionAccessService } from "../src/execution-v2/access.service";
import { CurrentViewCoreComposition, type CurrentViewCompositionConfig } from "../src/execution-v2/current-view-composition";
import type { SelectedCurrentViewEdgeRead } from "../src/execution-v2/current-view-edge-client";
import { ExecutionReadScopes, type ReadScopePrincipal } from "../src/execution-v2/read-scope";
import type { ExecutionReadPublication } from "../src/execution-v2/read-publication";
import { commonName, testCertificate, type TestAuthority } from "./fixtures/elp210-test-certificates";

type Identity = { key: Buffer; cert: Buffer; ca: Buffer; pin: string };
const id = (part: string) => `TEST_ONLY-composition-${part}`;
function coreFixture() {
  const now = Date.now(), workspace = id("workspace"), owner = id("owner"), profile = id("profile");
  const user: PortalUser = { userId: id("user"), username: id("user"), displayName: "TEST_ONLY User", role: "USER", status: "ACTIVE",
    mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, sessionVersion: 7, createdAt: new Date(now - 1000),
    updatedAt: new Date(now - 1000), disabledAt: null, accountRevision: 1, archivedAt: null };
  const session: AuthSession = { userId: user.userId, sessionId: id("session"), sessionVersion: 7, state: "ACTIVE",
    authenticationTime: new Date(now - 1000), idleExpiresAt: new Date(now + 60_000), absoluteExpiresAt: new Date(now + 60_000) };
  const principal: ReadScopePrincipal = { user, session, workspaceId: workspace, viewerWorkspaceId: workspace };
  const root: AccessResource = { kind: "ROOT", id: id("root") };
  const tuple = { alpha_id: id("alpha"), alpha_version_id: id("version"), portfolio_id: id("portfolio"), deployment_id: id("deployment"), account_id: id("account") };
  const resources: AccessResource[] = [root, { kind: "ACCOUNT", id: tuple.account_id }, { kind: "ALPHA", id: tuple.alpha_id },
    { kind: "ALPHA_VERSION", id: tuple.alpha_version_id }, { kind: "PORTFOLIO", id: tuple.portfolio_id }, { kind: "DEPLOYMENT", id: tuple.deployment_id }];
  const dataset = { dataset_id: id("dataset"), source_revision: id("source-r1"), projection_generation: id("generation"), window: null };
  const policy: ReviewedAccessPolicy = { workspace_id: workspace, revision: id("policy"), artifact_digest: accessDigest(id("artifact")),
    approval_ref: id("NOT_OWNER_APPROVAL"), qualification: "TEST_ONLY", state: "REVIEWED", protected_owner_user_id: owner,
    researcher_fields: { state: "QUALIFIED", policy_ref: id("fields"), fields: ["equity"] } };
  const membership = { revision: id("membership"), receipt_id: id("receipt"), mapping_revision: id("mapping") };
  const grants: ScopedAccessGrant[] = [{ grant_id: id("grant"), action: "business.read_all", workspace_id: workspace,
    subject_user_id: user.userId, issued_by: owner, effect: "ALLOW", selector: { kind: "ROOT_SCOPE", root_id: root.id },
    environments: ["paper"], valid_from_ms: now - 1000, valid_until_ms: now + 60_000, delegable_actions: [], parent_grant_id: null,
    revision: id("grant-r1"), policy_revision: policy.revision, revoked_at_ms: null, requires_ts_acceptance: true,
    ts_receipt: { ...membership, membership_revision: membership.revision, effective_at_ms: now - 1000, expires_at_ms: now + 60_000 }, field_policy_ref: null }];
  const publication: ExecutionReadPublication = { workspace_id: workspace, environment: "paper", profile_id: profile,
    qualification: "TEST_ONLY", publication_revision: id("publication"), binding: dataset, population_coverage: "COMPLETE_FOR_DATASET_WINDOW",
    provenance_ref: id("NOT_SOURCE_QUALIFICATION"), resources, tuples: [tuple], current_linkage: { qualification: "TEST_ONLY", revision: id("linkage"),
      provenance_ref: id("NOT_NATIVE_LINKAGE"), pairs: [{ alpha_id: tuple.alpha_id, portfolio_id: tuple.portfolio_id }] } };
  let beforeIdentity: (() => Promise<void>) | undefined;
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("AS exact_session_id")) {
      await beforeIdentity?.();
      return { rows: [{ user_id: user.userId, username: user.username, display_name: user.displayName, role: user.role, status: user.status,
        must_change_password: false, failed_login_count: 0, locked_until: null, session_version: user.sessionVersion,
        created_at: user.createdAt, updated_at: user.updatedAt, disabled_at: null, account_revision: 1, archived_at: null,
        exact_session_id: session.sessionId, exact_session_state: session.state, exact_session_version: session.sessionVersion,
        authentication_time: session.authenticationTime, idle_expires_at: session.idleExpiresAt, absolute_expires_at: session.absoluteExpiresAt }], rowCount: 1 };
    }
    return { rows: [{ role: user.role, session_version: user.sessionVersion, policy, policy_revision: policy.revision,
      policy_seen: true, workspace_exists: true, member: true, owner: false, retained: [] }], rowCount: 1 };
  });
  const end = vi.fn(), pool = { query, end } as unknown as Pool;
  const context = (): AccessEvaluationContext => ({ principal_id: user.userId, workspace_id: workspace, now_ms: Date.now(), actor_current: true,
    actor_role: user.role, actor_lease_until_ms: session.absoluteExpiresAt.valueOf(), actor_member: true, policy, grants, active_principals: new Set([owner, user.userId]),
    authority_fingerprint: accessDigest({ user: user.userId, generation: user.sessionVersion, grants, policy }),
    relationsFor: () => ({ qualified: true, revision: membership.revision, own_alpha_ids: [], member_portfolio_ids: [], roots: { [root.id]: resources }, membership }), allow_test_only: true });
  const access = { hasNativeCurrentRelations: () => false,
    readContext: vi.fn(async () => context()), confirmReadContext: vi.fn(async () => context()),
    readPublication: vi.fn(async () => structuredClone(publication)) } as unknown as ExecutionAccessService;
  const config = { AUTH_MODE: "dev" } as ControlApiConfig;
  const auth = new AuthService(pool, config, new Argon2CredentialService({ memoryKib: 8192, iterations: 1, parallelism: 1 }));
  const scopes = new ExecutionReadScopes(pool, access, config);
  const selected: SelectedCurrentViewEdgeRead = { resource: "accounts", authority: { resource_ref: "accounts", binding: { environment: "paper", profileId: profile },
    read_requirement: { action: "business.read_all", resource: root, dataset }, fields: ["equity"] }, query: { limit: 200, max_bytes: 4096 } };
  return { auth, scopes, principal, selected, query, end, grants, onIdentity: (callback: () => Promise<void>) => { beforeIdentity = callback; } };
}

describe("Core current-view lifecycle composition", () => {
  let core: Identity, edge: Identity;
  const compositions: CurrentViewCoreComposition[] = [], servers: { server: Server; sockets: Set<Duplex> }[] = [];
  beforeAll(() => {
    const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), name = commonName(id("ca"));
    const ca: TestAuthority = { key: keys.privateKey, name, certificate: testCertificate(name, keys, { name, key: keys.privateKey }, true) };
    const identity = (label: string) => {
      const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), cert = testCertificate(commonName(label), pair, ca, false);
      return { key: Buffer.from(pair.privateKey.export({ type: "pkcs8", format: "pem" })), cert, ca: ca.certificate,
        pin: `sha256:${createHash("sha256").update(new X509Certificate(cert).raw).digest("hex")}` };
    };
    core = identity(id("core")); edge = identity(id("edge"));
  });
  afterEach(async () => {
    for (const composition of compositions.splice(0)) await composition.shutdown();
    for (const { server, sockets } of servers.splice(0)) {
      sockets.forEach(socket => socket.destroy());
      if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
  const policyRead = (origin: string, original_context: string) => new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
    const body = JSON.stringify({ schema_version: "portal.execution.current-view-resolve.v1", original_context,
      workload_id: id("workload"), operation: "CURRENT", resource_ref: "accounts" });
    const req = request(`${origin}/internal/elp210/current-view/resolve`, { ...edge, method: "POST", agent: false,
      rejectUnauthorized: true, minVersion: "TLSv1.3", maxVersion: "TLSv1.3", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } }, res => {
      const chunks: Buffer[] = []; res.on("data", chunk => chunks.push(chunk)); res.on("error", reject);
      res.once("end", () => resolve({ status: res.statusCode!, body: JSON.parse(Buffer.concat(chunks).toString()) }));
    });
    req.on("error", reject); req.end(body);
  });
  async function setup(options: { hold?: boolean; shutdownMs?: number } = {}) {
    const fixture = coreFixture(), captured: { token?: string; policy?: { status: number; body: Record<string, unknown> } } = {};
    let origin = "", hits = 0;
    const server = createServer({ ...edge, requestCert: true, rejectUnauthorized: true, minVersion: "TLSv1.3", maxVersion: "TLSv1.3" }, (req, res) => {
      hits++; captured.token = req.headers.authorization?.slice(7);
      void policyRead(origin, captured.token!).then(policy => {
        captured.policy = policy;
        if (options.hold) return;
        const body = JSON.stringify({ equity: "123.45", TEST_ONLY: true });
        res.writeHead(policy.status, { "content-type": "application/json", "content-length": Buffer.byteLength(body), connection: "close" }); res.end(body);
      }).catch(() => { res.writeHead(503); res.end(); });
    });
    const sockets = new Set<Duplex>(); servers.push({ server, sockets });
    server.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); if (!address || typeof address === "string") throw new Error("TEST_ONLY-address");
    const config: CurrentViewCompositionConfig = { authority: { ttl_ms: 30_000, maximum_contexts: 8 }, shutdown_deadline_ms: options.shutdownMs ?? 1000,
      transport: { tls: core, peer: { certificate_sha256: edge.pin, dns_name: "localhost", workload_id: id("workload") },
        limits: { maximum_in_flight: 2, request_bytes: 8192, response_bytes: 65536, deadline_ms: 1000 } },
      edge: { origin: `https://127.0.0.1:${address.port}`, tls: core, peer: { certificate_sha256: edge.pin, dns_name: "localhost" },
        limits: { maximum_in_flight: 2, deadline_ms: 1000, response_bytes: 8192 } } };
    const composition = new CurrentViewCoreComposition(fixture.auth, fixture.scopes, config); compositions.push(composition);
    const start = async () => { const target = await composition.start({ host: "127.0.0.1", port: 0 }); origin = `https://127.0.0.1:${target.port}`; return target; };
    return { ...fixture, composition, start, captured, hits: () => hits, origin: () => origin };
  }
  it("constructs unbound, rejects premature reads, and never closes shared Auth/Execution pools", async () => {
    const f = await setup(); expect(f.composition.snapshot()).toMatchObject({ state: "CREATED", listener: null, owned_contexts: 0 });
    expect(f.query).not.toHaveBeenCalled();
    await expect(f.composition.read(f.principal, f.selected, "CURRENT")).rejects.toMatchObject({ code: "CURRENT_VIEW_COMPOSITION_NOT_RUNNING" });
    await f.composition.shutdown(); expect(f.composition.snapshot().state).toBe("STOPPED"); expect(f.end).not.toHaveBeenCalled();
    await expect(f.start()).rejects.toMatchObject({ code: "CURRENT_VIEW_COMPOSITION_CONFIG_INVALID" });
  });
  it("binds only explicit private numeric targets, never default public/DNS listeners", async () => {
    const f = await setup();
    for (const host of ["0.0.0.0", "::", "8.8.8.8", "localhost", "example.invalid"])
      await expect(f.composition.start({ host, port: 0 })).rejects.toMatchObject({ code: "CURRENT_VIEW_COMPOSITION_CONFIG_INVALID" });
    expect(f.composition.snapshot()).toMatchObject({ state: "CREATED", listener: null });
  });
  it("composes actual Core identity/scopes, private mTLS resolve and finite Edge read, then releases the exact context", async () => {
    const f = await setup(); await f.start(); const before = f.query.mock.calls.length;
    const result = await f.composition.read(f.principal, f.selected, "CURRENT");
    expect(JSON.parse(result.body.toString())).toEqual({ equity: "123.45", TEST_ONLY: true });
    expect(f.captured.policy).toMatchObject({ status: 200, body: { resource_ref: "accounts", operation: "CURRENT", whole_population: true } });
    expect(f.query.mock.calls.length).toBeGreaterThan(before); expect(f.hits()).toBe(1);
    expect(f.composition.snapshot()).toMatchObject({ state: "RUNNING", owned_contexts: 0, pending_reads: 0, edge_in_flight: 0 });
    expect((await policyRead(f.origin(), f.captured.token!)).status).toBe(403);
    expect(f.end).not.toHaveBeenCalled();
  });
  it("does not commission HISTORY/REPLAY/export by lifecycle or by CURRENT permission", async () => {
    const f = await setup(); await f.start();
    await expect(f.composition.read(f.principal, f.selected, "HISTORY")).rejects.toMatchObject({ code: "CURRENT_VIEW_OPERATION_NOT_COMMISSIONED" });
    await expect(f.composition.read(f.principal, f.selected, "REPLAY")).rejects.toMatchObject({ code: "CURRENT_VIEW_EDGE_OPERATION_NOT_FINITE" });
    await expect(f.composition.read(f.principal, f.selected, "EXPORT")).rejects.toBeInstanceOf(Error);
    expect(f.hits()).toBe(0); expect(f.composition.snapshot().owned_contexts).toBe(0);
  });
  it("fences the entire multi-grain BFF result after an in-callback grant revoke", async () => {
    const f = await setup(); await f.start();
    await expect(f.composition.deliver(f.principal, f.selected.authority, "CURRENT", async () => {
      f.grants[0]!.revoked_at_ms = Date.now();
      return { TEST_ONLY_secret: "must not leave callback" };
    })).rejects.toBeInstanceOf(Error);
    expect(f.hits()).toBe(0);
    expect(f.composition.snapshot()).toMatchObject({ owned_contexts: 0, pending_reads: 0 });
  });
  it("tracks the compound delivery and nested finite read under the same real principal", async () => {
    const f = await setup(); await f.start();
    const result = await f.composition.deliver(f.principal, f.selected.authority, "CURRENT", async () => {
      expect(f.composition.snapshot()).toMatchObject({ owned_contexts: 1, pending_reads: 1 });
      return f.composition.read(f.principal, f.selected, "CURRENT");
    });
    expect(JSON.parse(result.body.toString())).toMatchObject({ TEST_ONLY: true });
    expect(f.composition.snapshot()).toMatchObject({ owned_contexts: 0, pending_reads: 0 });
  });
  it("shutdown releases the owned active context, aborts I/O and rejects new reads without altering source grants", async () => {
    const f = await setup({ hold: true }); await f.start(); const grants = structuredClone(f.grants);
    const pending = f.composition.read(f.principal, f.selected, "CURRENT"), rejected = expect(pending).rejects.toBeInstanceOf(Error);
    await vi.waitFor(() => expect(f.captured.policy?.status).toBe(200));
    expect(f.composition.snapshot().owned_contexts).toBe(1);
    await f.composition.shutdown(); await rejected;
    expect(f.composition.snapshot()).toMatchObject({ state: "STOPPED", listener: null, owned_contexts: 0, pending_reads: 0, edge_in_flight: 0, policy_in_flight: 0 });
    expect(f.grants).toEqual(grants); expect(f.end).not.toHaveBeenCalled();
    await expect(f.composition.read(f.principal, f.selected, "CURRENT")).rejects.toMatchObject({ code: "CURRENT_VIEW_COMPOSITION_NOT_RUNNING" });
  });
  it("does not claim drained while registration is pending; late custody is released, not leaked or rebound", async () => {
    const f = await setup({ shutdownMs: 30 }); await f.start();
    let unblock!: () => void; const blocked = new Promise<void>(resolve => { unblock = resolve; }); let entered = false;
    f.onIdentity(async () => { if (!entered) { entered = true; await blocked; } });
    const pending = f.composition.read(f.principal, f.selected, "CURRENT"), rejected = expect(pending).rejects.toBeInstanceOf(Error);
    await vi.waitFor(() => expect(entered).toBe(true));
    await expect(f.composition.shutdown()).rejects.toMatchObject({ code: "CURRENT_VIEW_COMPOSITION_SHUTDOWN_PENDING" });
    expect(f.composition.snapshot()).toMatchObject({ state: "STOPPING", pending_reads: 1 });
    unblock(); await rejected; await f.composition.shutdown();
    expect(f.composition.snapshot()).toMatchObject({ state: "STOPPED", owned_contexts: 0, pending_reads: 0 }); expect(f.hits()).toBe(0);
  });
  it("settles an explicit start/shutdown race without leaving a listener behind", async () => {
    const f = await setup(); const starting = f.start(), refused = expect(starting).rejects.toBeInstanceOf(Error);
    await f.composition.shutdown(); await refused;
    expect(f.composition.snapshot()).toMatchObject({ state: "STOPPED", listener: null, owned_contexts: 0 });
  });
});
