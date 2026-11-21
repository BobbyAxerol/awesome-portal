/** TEST_ONLY loopback TLS/mTLS over actual AuthService/ExecutionReadScopes.
 * PostgreSQL rows/native publication are synthetic boundary doubles. This is
 * Core composition proof, NOT installed Edge/provider or runtime acceptance. */
import { createHash, generateKeyPairSync, X509Certificate } from "node:crypto";
import { createServer, request, type Server } from "node:https";
import type { Duplex } from "node:stream";
import type { ServerResponse } from "node:http";
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
import { ManagerCurrentAccounts } from "../src/execution-v2/manager-current-accounts";
import { loadManagerCurrentCommissioning, managerCurrentMetadataDigest, type ManagerCurrentMetadata } from "../src/execution-v2/manager-current-publication";
import { commonName, testCertificate, type TestAuthority } from "./fixtures/elp210-test-certificates";

type Identity = { key: Buffer; cert: Buffer; ca: Buffer; pin: string };
const id = (part: string) => `TEST_ONLY-composition-${part}`;
function coreFixture(native = false) {
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
  const sent: Buffer[] = [], stages: string[] = [];
  let enterHook: (() => Promise<void>) | undefined, dispatchHook: (() => void) | undefined;
  const nativeDeliver = vi.fn(async (...args: Parameters<ExecutionAccessService["deliverNativeCurrentComposition"]>) => {
    const [, , purposes, , , build, assertAllowed, validation] = args;
    // Explicit TEST_ONLY source/egress port. The reverse callback below uses
    // real mTLS + Core auth/scopes, but does NOT prove actual source custody.
    stages.push("PRIVATE_BUILD");
    const bytes = await build(purposes.map(() => context()));
    stages.push("ENTER_DOUBLE"); await enterHook?.(); await validation?.afterEnter?.();
    assertAllowed(purposes.map(() => context()));
    stages.push("CORE_FINAL_DOUBLE"); dispatchHook?.(); validation?.beforeDispatch?.();
    sent.push(bytes); stages.push("SEND_DOUBLE");
  });
  const access = { hasNativeCurrentRelations: () => native,
    readContext: vi.fn(async () => context()), confirmReadContext: vi.fn(async () => context()),
    readPublication: vi.fn(async () => structuredClone(publication)), deliverNativeCurrentComposition: nativeDeliver } as unknown as ExecutionAccessService;
  const config = { AUTH_MODE: "dev" } as ControlApiConfig;
  const auth = new AuthService(pool, config, new Argon2CredentialService({ memoryKib: 8192, iterations: 1, parallelism: 1 }));
  const scopes = new ExecutionReadScopes(pool, access, config);
  const selected: SelectedCurrentViewEdgeRead = { resource: "accounts", authority: { resource_ref: "accounts", binding: { environment: "paper", profileId: profile },
    read_requirement: { action: "business.read_all", resource: root, dataset }, fields: ["equity"] }, query: { limit: 200, max_bytes: 4096 } };
  return { auth, scopes, principal, selected, query, end, grants, policy, tuple, nativeDeliver, sent, stages,
    afterEnter: (callback: () => Promise<void>) => { enterHook = callback; },
    beforeDispatch: (callback: () => void) => { dispatchHook = callback; },
    onIdentity: (callback: () => Promise<void>) => { beforeIdentity = callback; } };
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
  const policyRead = (origin: string, original_context: string, resource_ref = "accounts") => new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
    const body = JSON.stringify({ schema_version: "portal.execution.current-view-resolve.v1", original_context,
      workload_id: id("workload"), operation: "CURRENT", resource_ref });
    const req = request(`${origin}/internal/elp210/current-view/resolve`, { ...edge, method: "POST", agent: false,
      rejectUnauthorized: true, minVersion: "TLSv1.3", maxVersion: "TLSv1.3", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } }, res => {
      const chunks: Buffer[] = []; res.on("data", chunk => chunks.push(chunk)); res.on("error", reject);
      res.once("end", () => resolve({ status: res.statusCode!, body: JSON.parse(Buffer.concat(chunks).toString()) }));
    });
    req.on("error", reject); req.end(body);
  });
  async function setup(options: { hold?: boolean; shutdownMs?: number; native?: boolean; page?: () => unknown } = {}) {
    const fixture = coreFixture(options.native), captured: { token?: string; maxBytes?: string; policy?: { status: number; body: Record<string, unknown> } } = {};
    let origin = "", hits = 0;
    const server = createServer({ ...edge, requestCert: true, rejectUnauthorized: true, minVersion: "TLSv1.3", maxVersion: "TLSv1.3" }, (req, res) => {
      hits++; captured.token = req.headers.authorization?.slice(7);
      captured.maxBytes = new URL(req.url!, "https://localhost").searchParams.get("max_bytes") ?? undefined;
      const resource = new URL(req.url!, "https://localhost").pathname.split("/").at(-2)!;
      void policyRead(origin, captured.token!, resource).then(policy => {
        captured.policy = policy;
        if (options.hold) return;
        const body = JSON.stringify(options.page ? options.page() : { equity: "123.45", TEST_ONLY: true });
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
  async function accountProfileFixture() {
    let page: unknown;
    const f = await setup({ native: true, page: () => page });
    const now = Date.now(), account = f.tuple.account_id, entity = id("account-entity"), revision = accessDigest(id("account-revision"));
    const binding = { ...f.selected.authority.read_requirement.dataset, dataset_id: "manager-current:ACCOUNT",
      catalogue_revision: id("catalogue") };
    Object.assign(f.selected.authority.read_requirement.dataset, binding);
    const metadata: ManagerCurrentMetadata = { schema_version: "portal.execution.manager-current-metadata.v1",
      scope: { workspace_id: f.principal.workspaceId, environment: "paper", profile_id: f.selected.authority.binding.profileId },
      binding, source_workspace_id: id("source-workspace"), adapter_revision: id("adapter"), publication_revision: id("publication"),
      state: "ACTIVE", issued_at_ms: now - 1000, expires_at_ms: now + 60_000, source_read_at_ms: now - 1000, observed_at_ms: now - 500,
      receipt_pins: { source_read: id("source"), transport_trust: id("trust"), privacy: id("privacy"), field_policy: id("field-policy") },
      grains: [{ grain: "manager.account", source_fields: ["account_id"], fields: ["account_id"],
        selections: [{ resource_ref: "accounts", resource: { kind: "ACCOUNT", id: account }, entity_ids: [entity] }],
        entities: [{ entity_id: entity, account_id: account, payload_digest: revision }] },
        { grain: "relation.account_balances", source_fields: ["account_id"], fields: ["account_id"], selections: [], entities: [] },
        { grain: "relation.account_policies", source_fields: ["account_id"], fields: ["account_id"], selections: [], entities: [] }] };
    const artifact = JSON.stringify({ schema_version: "portal.execution.manager-current-commissioning.v1", scope: metadata.scope,
      binding, source_workspace_id: metadata.source_workspace_id, adapter_revision: metadata.adapter_revision,
      source_metadata_digest: managerCurrentMetadataDigest(metadata), receipt_pins: metadata.receipt_pins });
    const commissioning = loadManagerCurrentCommissioning(artifact, { artifact_sha256: `sha256:${createHash("sha256").update(artifact).digest("hex")}`,
      approval_ref: id("synthetic-approval"), approved_at_ms: now - 2000, valid_until_ms: now + 60_000 }, now);
    page = { schema_version: "portal.execution.manager-current.v1", projection_generation: binding.projection_generation,
      source_continuity_epoch: binding.source_revision, source_read_at_ms: metadata.source_read_at_ms, produced_at_ms: now,
      availability: "AVAILABLE", source_basis: "MANAGER_COMMITTED_POLL_BOUNDED_SNAPSHOT", history_capability: "UNAVAILABLE",
      coverage: "CURRENT_PAGE_ONLY", count_status: "COMPLETE_AUTHORIZED_SELECTION",
      rows: [{ entity_id: entity, revision, payload: { account_id: { kind: "TEXT", value: account } } }], next_cursor: null, resume_cursor: null };
    const service = new ManagerCurrentAccounts({ request: { ...metadata.scope, binding }, commissioning,
      source: async () => structuredClone(metadata), core: f.composition });
    await f.start();
    return { ...f, service, account, setPage: (value: unknown) => { page = value; } };
  }
  it("connects the real Account profile adapter to mTLS field authority and synthetic native custody", async () => {
    const f = await accountProfileFixture(), dispatch = vi.fn();
    await f.service.readNativeProfile(f.principal, f.account, "paper", {} as ServerResponse, dispatch);
    expect(f.hits()).toBe(1); expect(f.captured.policy?.status).toBe(200); expect(f.captured.maxBytes).toBe("8192");
    expect(f.sent).toHaveLength(1); expect(JSON.parse(f.sent[0]!.toString())).toMatchObject({
      schema_version: "portal.execution.account-profile.v1", workspace_id: f.principal.workspaceId, account_id: f.account });
    expect(dispatch).toHaveBeenCalledOnce();
  });
  it("does not dispatch an Account profile after grant revocation at the synthetic ENTER boundary", async () => {
    const f = await accountProfileFixture(), dispatch = vi.fn();
    f.afterEnter(async () => { f.grants[0]!.revoked_at_ms = Date.now(); });
    await expect(f.service.readNativeProfile(f.principal, f.account, "paper", {} as ServerResponse, dispatch)).rejects.toBeInstanceOf(Error);
    expect(f.sent).toHaveLength(0); expect(dispatch).not.toHaveBeenCalled();
  });
  it("does not dispatch an Account profile when the real mTLS client receives a malformed private source page", async () => {
    const f = await accountProfileFixture(), dispatch = vi.fn();
    f.setPage({ TEST_ONLY: "malformed" });
    await expect(f.service.readNativeProfile(f.principal, f.account, "paper", {} as ServerResponse, dispatch)).rejects.toBeInstanceOf(Error);
    expect(f.hits()).toBe(1); expect(f.sent).toHaveLength(0); expect(dispatch).not.toHaveBeenCalled();
  });
  it("rejects a different workspace before the Account profile makes an mTLS read", async () => {
    const f = await accountProfileFixture(), dispatch = vi.fn();
    await expect(f.service.readNativeProfile({ ...f.principal, workspaceId: id("other-workspace") }, f.account,
      "paper", {} as ServerResponse, dispatch)).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
    expect(f.hits()).toBe(0); expect(f.sent).toHaveLength(0); expect(dispatch).not.toHaveBeenCalled();
  });
  it("keeps target + source purposes through two actual mTLS reads and one synthetic native final egress", async () => {
    const f = await setup({ native: true }); await f.start();
    const balances: SelectedCurrentViewEdgeRead = { ...structuredClone(f.selected), resource: "balances",
      authority: { ...structuredClone(f.selected.authority), resource_ref: "balances" } };
    const target = structuredClone(f.selected.authority);
    target.read_requirement.resource = { kind: "ACCOUNT", id: f.tuple.account_id };
    const after = vi.fn(async () => { expect(f.sent).toHaveLength(0); expect(f.hits()).toBe(2); });
    const before = vi.fn(() => { expect(f.sent).toHaveLength(0); });
    await f.composition.deliverNative(f.principal, [target, f.selected.authority, balances.authority], {} as ServerResponse,
      async read => {
        const a = await read(f.selected), b = await read(balances);
        expect(f.sent).toHaveLength(0); expect(f.composition.snapshot().pending_reads).toBe(1);
        return Buffer.from(JSON.stringify({ account: JSON.parse(a.body.toString()), balance: JSON.parse(b.body.toString()) }));
      }, { validateAfterEnter: after, validateBeforeDispatch: before });
    expect(f.nativeDeliver).toHaveBeenCalledTimes(1);
    expect(f.nativeDeliver.mock.calls[0]![2]).toHaveLength(2);
    expect(f.sent).toHaveLength(1); expect(JSON.parse(f.sent[0]!.toString())).toMatchObject({ account: { TEST_ONLY: true }, balance: { TEST_ONLY: true } });
    expect(f.stages).toEqual(["PRIVATE_BUILD", "ENTER_DOUBLE", "CORE_FINAL_DOUBLE", "SEND_DOUBLE"]);
    expect(after).toHaveBeenCalledTimes(1); expect(before).toHaveBeenCalledTimes(1);
    expect(f.composition.snapshot()).toMatchObject({ pending_reads: 0, owned_contexts: 0, edge_in_flight: 0 });
    expect((await policyRead(f.origin(), f.captured.token!, "balances")).status).toBe(403);
  });
  it("native installation cannot use the detached ordinary read or deliver path", async () => {
    const f = await setup({ native: true }); await f.start();
    await expect(f.composition.read(f.principal, f.selected, "CURRENT")).rejects.toBeInstanceOf(Error);
    await expect(f.composition.deliver(f.principal, f.selected.authority, "CURRENT", async () => Buffer.from("private"))).rejects.toBeInstanceOf(Error);
    expect(f.hits()).toBe(0); expect(f.nativeDeliver).not.toHaveBeenCalled(); expect(f.sent).toHaveLength(0);
  });
  it("does not drop a restricted detail field when native selections share one purpose", async () => {
    const f = await setup({ native: true }); await f.start();
    f.grants[0]!.action = "account.read";
    f.policy.researcher_fields.fields.push("filled_quantity");
    const requirement = { ...structuredClone(f.selected.authority.read_requirement), action: "account.read" as const,
      resource: { kind: "ACCOUNT" as const, id: f.tuple.account_id } };
    const first = { ...structuredClone(f.selected.authority), read_requirement: requirement, detail_fields: ["filled_quantity"] };
    const second = { ...structuredClone(f.selected.authority), read_requirement: requirement,
      resource_ref: "balances", detail_fields: ["commission"] };
    await expect(f.composition.deliverNative(f.principal, [first, second], {} as ServerResponse, async () => Buffer.from("private")))
      .rejects.toMatchObject({ code: "CURRENT_VIEW_AUTHORITY_CHANGED" });
    expect(f.hits()).toBe(0); expect(f.nativeDeliver).not.toHaveBeenCalled(); expect(f.sent).toHaveLength(0);
  });
  it("carries an explicitly authorized detail field through the native composition", async () => {
    const f = await setup({ native: true }); await f.start();
    f.grants[0]!.action = "account.read";
    f.policy.researcher_fields.fields.push("filled_quantity");
    const selected: SelectedCurrentViewEdgeRead = { ...structuredClone(f.selected), authority: { ...structuredClone(f.selected.authority),
      read_requirement: { ...structuredClone(f.selected.authority.read_requirement), action: "account.read",
        resource: { kind: "ACCOUNT", id: f.tuple.account_id } }, detail_fields: ["filled_quantity"] } };
    await f.composition.deliverNative(f.principal, [selected.authority], {} as ServerResponse, async read => (await read(selected)).body);
    expect(f.hits()).toBe(1); expect(f.sent).toHaveLength(1);
    expect(f.captured.policy?.body.detail_fields).toContain("filled_quantity");
    expect(f.captured.policy?.body.detail_fields).not.toContain("commission");
  });
  it("does not dispatch after a requested detail field is revoked during the native flight", async () => {
    const f = await setup({ native: true }); await f.start();
    f.grants[0]!.action = "account.read";
    f.policy.researcher_fields.fields.push("filled_quantity");
    const selected: SelectedCurrentViewEdgeRead = { ...structuredClone(f.selected), authority: { ...structuredClone(f.selected.authority),
      read_requirement: { ...structuredClone(f.selected.authority.read_requirement), action: "account.read",
        resource: { kind: "ACCOUNT", id: f.tuple.account_id } }, detail_fields: ["filled_quantity"] } };
    f.afterEnter(async () => { f.policy.researcher_fields.fields = f.policy.researcher_fields.fields.filter(field => field !== "filled_quantity"); });
    await expect(f.composition.deliverNative(f.principal, [selected.authority], {} as ServerResponse, async read => (await read(selected)).body))
      .rejects.toBeDefined();
    expect(f.hits()).toBe(1); expect(f.sent).toHaveLength(0);
  });
  it("refuses a retargeted native query before network even under the same held source purpose", async () => {
    const f = await setup({ native: true }); await f.start();
    const wrong: SelectedCurrentViewEdgeRead = { ...structuredClone(f.selected), resource: "balances",
      authority: { ...structuredClone(f.selected.authority), resource_ref: "balances" } };
    await expect(f.composition.deliverNative(f.principal, [f.selected.authority], {} as ServerResponse, async read =>
      (await read(wrong)).body)).rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_REQUIRED" });
    expect(f.hits()).toBe(0); expect(f.sent).toHaveLength(0);
    expect(f.composition.snapshot()).toMatchObject({ pending_reads: 0, owned_contexts: 0 });
  });
  it("a revoke after private mTLS build and source ENTER prevents the entire final response", async () => {
    const f = await setup({ native: true }); await f.start();
    f.afterEnter(async () => { f.grants[0]!.revoked_at_ms = Date.now(); });
    await expect(f.composition.deliverNative(f.principal, [f.selected.authority], {} as ServerResponse, async read =>
      (await read(f.selected)).body)).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED" });
    expect(f.hits()).toBe(1); expect(f.sent).toHaveLength(0); expect(f.stages).toEqual(["PRIVATE_BUILD", "ENTER_DOUBLE"]);
  });
  it("metadata validation failure after ENTER cannot send a body or fall back to an ordinary reply", async () => {
    const f = await setup({ native: true }); await f.start();
    await expect(f.composition.deliverNative(f.principal, [f.selected.authority], {} as ServerResponse, async read =>
      (await read(f.selected)).body, { validateAfterEnter: async () => { throw new Error("TEST_ONLY metadata changed"); } })).rejects.toThrow("TEST_ONLY metadata changed");
    expect(f.sent).toHaveLength(0); expect(f.nativeDeliver).toHaveBeenCalledTimes(1); expect(f.hits()).toBe(1);
  });
  it("rejects an asynchronous pre-dispatch validator rather than sending between awaits", async () => {
    const f = await setup({ native: true }); await f.start();
    await expect(f.composition.deliverNative(f.principal, [f.selected.authority], {} as ServerResponse, async read =>
      (await read(f.selected)).body, { validateBeforeDispatch: async () => undefined })).rejects.toMatchObject({ code: "EXECUTION_READ_AUTHORITY_UNAVAILABLE" });
    expect(f.sent).toHaveLength(0); expect(f.hits()).toBe(1);
  });
  it("rejects five distinct purposes before authority or source admission instead of silently dropping one", async () => {
    const f = await setup({ native: true }); await f.start(); const before = f.query.mock.calls.length;
    const selected = Array.from({ length: 5 }, (_, index) => ({ ...structuredClone(f.selected.authority),
      read_requirement: { ...structuredClone(f.selected.authority.read_requirement), resource: { kind: "ACCOUNT" as const, id: id(`account-${index}`) } } }));
    await expect(f.composition.deliverNative(f.principal, selected, {} as ServerResponse, async () => Buffer.from("private")))
      .rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_LIMIT" });
    expect(f.query.mock.calls.length).toBe(before); expect(f.nativeDeliver).not.toHaveBeenCalled(); expect(f.hits()).toBe(0); expect(f.sent).toHaveLength(0);
  });
  it("a revoke between source grains invalidates the complete BFF, including the first private body", async () => {
    const f = await setup({ native: true }); await f.start();
    const balance: SelectedCurrentViewEdgeRead = { ...structuredClone(f.selected), resource: "balances",
      authority: { ...structuredClone(f.selected.authority), resource_ref: "balances" } };
    await expect(f.composition.deliverNative(f.principal, [f.selected.authority, balance.authority], {} as ServerResponse, async read => {
      const first = await read(f.selected); expect(first.status).toBe(200); expect(f.sent).toHaveLength(0);
      f.grants[0]!.revoked_at_ms = Date.now(); return (await read(balance)).body;
    })).rejects.toBeInstanceOf(Error);
    expect(f.hits()).toBe(1); expect(f.sent).toHaveLength(0); expect(f.stages).toEqual(["PRIVATE_BUILD"]);
    expect(f.composition.snapshot()).toMatchObject({ pending_reads: 0, owned_contexts: 0 });
  });
});
