/** BE-P22 wiring regressions on the REAL code paths:
 *   ExecutionCurrentSourceProxy.request()  ->  MaximumDataOperationService
 *   (prepareDeploymentData / prepareNativeManagerPage)  ->  NativeManagerReadConsumer.deliver()
 * Doubles are only at the edges: the shared-read repository (begin / complete /
 * waitForLeader / fail), the h2 transport (getSession / sendRequest), the Core
 * pool + current READ evaluation, and the native Candidate (acquire / send /
 * reconcile). This proves the observer wiring, HIT vs MISS vs COALESCED
 * distinction and isolation on the real branches; it is NOT connected-source
 * acceptance (no real cache row, socket, Core database or egress is used). */
import { createHash, randomBytes } from "node:crypto";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { chmodSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPair, type KeyLike } from "jose";
import type { FastifyReply } from "fastify";
import type { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config";
import type { AuthSession, PortalUser } from "../src/domain";
import type { ManagerDomainReadDecision } from "../src/execution-v2/access.contract";
import { CurrentHumanCandidate, type PreparedCurrentHumanNativeHTTP, type NativeHTTPRecovery } from "../src/execution-v2/current-human-candidate";
import { evaluateManagerDomainRead } from "../src/execution-v2/current-human-snapshot";
import { SelectedNativeBusinessReadSource } from "../src/execution-v2/native-business-read-selected-source";
import { NativeManagerReadConsumer, type NativeManagerRequest } from "../src/execution-v2/native-manager-consumer";
import type { NativeCoreSelection } from "../src/execution-v2/native-core-composition";
import {
  FileNativeCacheObservationSink, MemoryNativeCacheObservationSink, NativeCacheObserver,
  buildNativeCacheObservation, correlateNativeCacheObservation, loadNativeCacheObservationKey,
  nativeCacheIdentityMatches, takeCacheBranch, type NativeCacheObservationRecord,
  type NativeCacheObservationSink, type NativeCacheState,
} from "../src/execution-v2/native-cache-observation";
import {
  CurrentSourceBulkhead, CurrentSourceProxyError, CurrentSourceRateLimiter, ExecutionCurrentSourceProxy,
} from "../src/execution/current-source.proxy";
import { MaximumDataContinuationRepository } from "../src/execution/maximum-data-continuation.repository";
import { MaximumDataOperationService, type MaximumDataOperationPrincipal } from "../src/execution/maximum-data-operation.service";
import { MAXIMUM_DATA_DEPLOYMENT_OPERATION, maximumDataDeploymentBinding, maximumDataDeploymentPolicy } from "../src/execution/maximum-data-operation.registry";
import { sharedReadIdentity, sourceMetadata, type SharedReadScope } from "../src/execution/shared-read.repository";

// Lets one test run the very same chain with the proxy's branch note disabled,
// to prove that noting the branch changes no response byte.
const hooks = vi.hoisted(() => ({ disableNote: false }));
vi.mock("../src/execution-v2/native-cache-observation", async original => {
  const actual = await original<typeof import("../src/execution-v2/native-cache-observation")>();
  return { ...actual, noteCacheBranch: (target: unknown, capture: never) => hooks.disableNote ? target : actual.noteCacheBranch(target, capture) };
});
vi.mock("../src/execution-v2/current-human-snapshot", async original => ({
  ...await original<typeof import("../src/execution-v2/current-human-snapshot")>(),
  evaluateManagerDomainRead: vi.fn(), evaluateManagerDomainStream: vi.fn(),
}));

const raw = (c: string) => c.repeat(64), hash = (c: string) => "sha256:" + raw(c);
const AS_OF = "2026-10-21T00:00:00.000Z";
let key: KeyLike;
beforeAll(async () => { key = (await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true })).privateKey; });
beforeEach(() => { hooks.disableNote = false; vi.mocked(evaluateManagerDomainRead).mockReset(); });
afterEach(() => vi.restoreAllMocks());

/* ---------------- fixtures (same shape as native-manager-preparation.spec.ts) ---------------- */

function principal(): MaximumDataOperationPrincipal {
  const now = new Date(), user: PortalUser = { userId: "TEST_ONLY-stan", username: "TEST_ONLY-stan", displayName: "TEST_ONLY Stan", role: "USER",
    status: "ACTIVE", mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, sessionVersion: 7,
    createdAt: now, updatedAt: now, disabledAt: null, accountRevision: 1, archivedAt: null };
  const session: AuthSession = { sessionId: "TEST_ONLY-session", userId: user.userId, state: "ACTIVE", sessionVersion: 7,
    authenticationTime: now, idleExpiresAt: new Date(now.getTime() + 60000), absoluteExpiresAt: new Date(now.getTime() + 120000) };
  return { user, session, workspaceId: "TEST_ONLY-workspace" };
}
function selection(): NativeCoreSelection {
  const now = Date.now(), until = now + 60000, p = principal();
  const domain = { profile_id: "PAPER_BINANCE_USDM", catalogue_sha256: MAXIMUM_DATA_DEPLOYMENT_OPERATION.sourceCatalogueSha256.slice(7),
    profile_sha256: raw("b"), field_policy_sha256: raw("c") };
  const selected_source = new SelectedNativeBusinessReadSource({
    transport: { origin: "https://10.70.0.2:9443", tls: { ca: "TEST_ONLY-no-socket-ca", cert: "TEST_ONLY-no-socket-cert", key: "TEST_ONLY-no-socket-key" },
      pm_leaf_sha256: hash("f"), workload_id: "TEST_ONLY-pm", deadline_ms: 1000, request_bytes: 32768, response_bytes: 32768, max_inflight: 2 },
    pins: { binding: { human_issuer: "TEST_ONLY-human", subject: p.user.userId, workspace_id: p.workspaceId, environment: "paper", workload_id: "TEST_ONLY-pm" }, domain,
      human: { issuer: "TEST_ONLY-human", subject: p.user.userId, portal_user_id: p.user.userId,
        ts_user_id: "33333333-3333-3333-3333-333333333333", mapping_revision: "ts-user:33333333-3333-3333-3333-333333333333:1" },
      native: { revision: "1", receipt_id: "44444444-4444-4444-4444-444444444444", receipt_digest: hash("1"), document_digest: hash("2"), policy_revision: "1",
        owner_mapping_revision: "ts-user:33333333-3333-3333-3333-333333333333:1", semantic_revision: hash("3"),
        effective_from: new Date(now - 60000).toISOString(), expires_at: new Date(until).toISOString() }, source_fingerprint: raw("e") },
    installation_expires_at_utc_ms: until });
  return { selector: { portal_user_id: p.user.userId, human_issuer: "TEST_ONLY-human", subject: p.user.userId, workspace_id: p.workspaceId,
    environment: "paper", domain: { ...domain } },
    config: { issuer: "TEST_ONLY-human", audience: "TEST_ONLY-pm", key_id: "TEST_ONLY-kid", private_key: key, selected_source,
      limits: { ttl_ms: 10000, maximum_unresolved: 16, maximum_retained: 128 },
      installation_scope: { workspace_id: p.workspaceId, environment: "paper", valid_until_ms: until },
      terminal: { issuer: "TEST_ONLY-terminal", audience: "TEST_ONLY-pm", key_id: "TEST_ONLY-kid", private_key: key, ttl_seconds: 30 },
      egress: { maximum_response_bytes: 1048576, maximum_inflight: 4, send_timeout_ms: 1000, quiesce_timeout_ms: 1000 } } };
}
function decision(p = principal()): ManagerDomainReadDecision {
  return { authority_fingerprint: hash("d"), scope_digest: hash("e"), field_policy_sha256: raw("c"), field_policy_ref: "TEST_ONLY-field-policy",
    valid_until_ms: Date.now() + 30000, now_ms: Date.now(), policy_revision: "1", grant_id: "TEST_ONLY-grant", grant_revision: "1",
    actor: { user_id: p.user.userId, session_id: p.session.sessionId, session_generation: p.session.sessionVersion } };
}
/** The SOURCE body the h2 transport would return (what the cache stores). */
const sourceBody = () => ({
  contract_version: MAXIMUM_DATA_DEPLOYMENT_OPERATION.sourceContractRevision, authority: "EXECUTION_CELL",
  profile_id: "PAPER_BINANCE_USDM", catalogue_sha256: MAXIMUM_DATA_DEPLOYMENT_OPERATION.sourceCatalogueSha256,
  availability: "AVAILABLE", freshness: "FRESH", completeness: "COMPLETE", as_of: AS_OF,
  data: { relation: { schema: "public", relation: "strategy_deployments" }, items: [], next_cursor: null },
});
function fakePool() {
  const client = { query: vi.fn(async () => ({ rows: [] })), release: vi.fn() };
  return { pool: { options: { connectionTimeoutMillis: 2000, query_timeout: 6000 }, connect: vi.fn(async () => client), query: vi.fn() } as unknown as Pool, client };
}
function reply() {
  const rawResponse = new ServerResponse(new IncomingMessage(new Socket()));
  return { raw: rawResponse, hijack: vi.fn() } as unknown as FastifyReply;
}

/** Double of the shared-read repository: the branch is chosen per request path
 * (so concurrent requests can take different branches), the cache key is the
 * REAL sharedReadIdentity(scope). */
class SharedReadsDouble {
  readonly scopes: SharedReadScope[] = [];
  readonly failed: unknown[] = [];
  branch: (scope: SharedReadScope) => NativeCacheState | "DENIED" = () => "MISS";
  private value() {
    const body = sourceBody();
    return { body, etag: 'W/"TEST_ONLY-etag"', metadata: sourceMetadata(body), storedAt: AS_OF, expiresAt: "2026-10-21T00:05:00.000Z" };
  }
  begin = vi.fn(async (scope: SharedReadScope) => {
    this.scopes.push(structuredClone(scope));
    const cacheKey = sharedReadIdentity(scope).cacheKey, branch = this.branch(scope);
    if (branch === "HIT") return { kind: "CACHE_HIT" as const, cacheKey, value: this.value() };
    if (branch === "COALESCED") return { kind: "FOLLOWER" as const, cacheKey };
    if (branch === "DENIED") return { kind: "DENIED" as const, cacheKey, reasonCode: "N21_SHARED_CONCURRENCY_EXHAUSTED" as const };
    return { kind: "LEADER" as const, cacheKey, leaderId: "bff:TEST_ONLY", leaseId: "TEST_ONLY-lease", waitMs: 0 };
  });
  waitForLeader = vi.fn(async () => this.value());
  complete = vi.fn(async () => this.value());
  fail = vi.fn(async (admission: unknown) => { this.failed.push(admission); });
}

/** The REAL ExecutionCurrentSourceProxy.request() with only the transport and
 * the shared-read repository replaced (same Object.create pattern the existing
 * proxy specs use for private fields). */
function realProxy(shared: SharedReadsDouble, transport: { fail?: boolean } = {}) {
  const config = loadConfig({ DATABASE_URL: "postgres://portal:portal@localhost/portal", PORTAL_ENV: "local", AUTH_MODE: "dev" });
  const proxy = Object.create(ExecutionCurrentSourceProxy.prototype) as ExecutionCurrentSourceProxy;
  const sendRequest = vi.fn(async () => {
    if (transport.fail) throw new CurrentSourceProxyError("TEST_ONLY_SOURCE_DOWN", 503);
    return { status: 200, body: sourceBody(), responseBytes: 512, itemCount: 0 };
  });
  Object.assign(proxy as unknown as Record<string, unknown>, {
    config, tls: { ca: Buffer.alloc(0), cert: Buffer.alloc(0), key: Buffer.alloc(0) }, sharedReads: shared,
    profiles: new Map([["paper", { environment: "paper", profileId: "PAPER_BINANCE_USDM", session: null, connecting: null,
      delegation: { issueReadAssertion: vi.fn(async () => "TEST_ONLY-assertion") } }]]),
    bulkheads: new Map([["PAPER_BINANCE_USDM", new CurrentSourceBulkhead(4, 16, 1000)]]),
    rateLimiters: new Map([["PAPER_BINANCE_USDM", new CurrentSourceRateLimiter(15, 1000)]]),
    counters: new Map(), operationCounters: new Map([["PAPER_BINANCE_USDM", new Map()]]),
    getSession: vi.fn(async () => ({})), sendRequest,
  });
  return { proxy, sendRequest };
}

const browserPrincipal = (p = principal(), nativeEpochDigest?: string) => ({
  user: p.user, session: { ...p.session, authenticationTime: p.session.authenticationTime }, workspaceId: p.workspaceId,
  ...(nativeEpochDigest ? { nativeEpochDigest } : {}),
}) as never;
const proxyCall = (proxy: ExecutionCurrentSourceProxy, epoch = hash("a")) => {
  const binding = maximumDataDeploymentBinding("paper"), operation = MAXIMUM_DATA_DEPLOYMENT_OPERATION;
  return proxy.relationForNamedOperation(browserPrincipal(principal(), epoch), "paper", binding.screenId,
    operation.sourceId, operation.relation, { limit: 100 }, maximumDataDeploymentPolicy("paper"));
};
/** request_id is a fresh randomUUID per response; everything else is deterministic. */
const stable = (response: unknown) => JSON.stringify(response).replace(/"request_id":"[0-9a-f-]{36}"/, '"request_id":"X"');

/* ---------------- 1. proxy: the real three branches ---------------- */

describe("ExecutionCurrentSourceProxy.request(): actual HIT / MISS / COALESCED", () => {
  it.each([["HIT", "HIT"], ["COALESCED", "COALESCED"], ["MISS", "MISS"]] as const)("notes %s from the real admission kind, keyed by the real cache key", async (branch, expected) => {
    const shared = new SharedReadsDouble(); shared.branch = () => branch;
    const { proxy, sendRequest } = realProxy(shared);
    const response = await proxyCall(proxy);
    const cacheKey = sharedReadIdentity(shared.scopes[0]!).cacheKey;
    expect((response as { gateway: { cache: { state: string } } }).gateway.cache.state).toBe(expected);
    // Only the leader touches the source; HIT / follower never do.
    expect(sendRequest).toHaveBeenCalledTimes(branch === "MISS" ? 1 : 0);
    expect(shared.waitForLeader).toHaveBeenCalledTimes(branch === "COALESCED" ? 1 : 0);
    expect(takeCacheBranch(response)).toEqual({ cache_state: expected, cache_identity: cacheKey });
    expect(takeCacheBranch(response)).toBeUndefined(); // one-shot
  });

  it("a repeated GET is not a HIT: the state comes from admission, so two back-to-back leaders are both MISS", async () => {
    const shared = new SharedReadsDouble(); shared.branch = () => "MISS";
    const { proxy } = realProxy(shared);
    const first = await proxyCall(proxy), second = await proxyCall(proxy);
    expect([takeCacheBranch(first)?.cache_state, takeCacheBranch(second)?.cache_state]).toEqual(["MISS", "MISS"]);
  });

  it("a DENIED admission and a failing leader note nothing, propagate the same error, and release the lease", async () => {
    const denied = new SharedReadsDouble(); denied.branch = () => "DENIED";
    await expect(proxyCall(realProxy(denied).proxy)).rejects.toMatchObject({ code: "N21_SHARED_CONCURRENCY_EXHAUSTED", status: 503 });
    const shared = new SharedReadsDouble(); shared.branch = () => "MISS";
    await expect(proxyCall(realProxy(shared, { fail: true }).proxy)).rejects.toMatchObject({ code: "TEST_ONLY_SOURCE_DOWN", status: 503 });
    expect(shared.failed).toHaveLength(1);
    expect(shared.complete).not.toHaveBeenCalled();
  });

  it("the response is byte-identical with and without the branch note, and carries no extra key", async () => {
    const bytes: string[] = [];
    for (const disableNote of [false, true]) {
      hooks.disableNote = disableNote;
      const shared = new SharedReadsDouble(); shared.branch = () => "HIT";
      const response = await proxyCall(realProxy(shared).proxy);
      expect(Reflect.ownKeys(response as object).every(k => typeof k === "string")).toBe(true); // no symbol / hidden slot
      expect(takeCacheBranch(response) === undefined).toBe(disableNote);
      bytes.push(stable(response));
    }
    expect(bytes[0]).toBe(bytes[1]);
    expect(bytes[0]).not.toContain("cache_identity");
  });

  it("the shared-read scope (and therefore the cache key) is unchanged and carries no observation field", async () => {
    const shared = new SharedReadsDouble();
    await proxyCall(realProxy(shared).proxy, hash("a"));
    expect(Object.keys(shared.scopes[0]!).sort()).toEqual(["admission", "adapterRevision", "nativeEpochDigest", "principalId",
      "principalRole", "profileId", "requestPath", "sourceId", "workspaceId"].sort());
    expect(shared.scopes[0]!.nativeEpochDigest).toBe(hash("a"));
  });
});

/* ---------------- 2. service: prepareNativeManagerPage / public path ---------------- */

async function serviceFixture(branch: (scope: SharedReadScope) => NativeCacheState = () => "MISS") {
  const shared = new SharedReadsDouble(); shared.branch = branch;
  const { proxy } = realProxy(shared);
  const db = fakePool(), e = selection(), p = principal();
  const continuation = { resolve: vi.fn(async () => "TEST_ONLY-source-cursor"), issue: vi.fn(async () => "mdc1.11111111-1111-1111-1111-111111111111") };
  const operations = new MaximumDataOperationService(proxy, continuation as unknown as MaximumDataContinuationRepository,
    undefined, undefined, undefined, db.pool);
  vi.mocked(evaluateManagerDomainRead).mockResolvedValue(decision(p));
  return { shared, proxy, db, e, p, operations, continuation };
}

describe("MaximumDataOperationService: private branch hand-over", () => {
  it.each(["HIT", "COALESCED", "MISS"] as const)("prepareNativeManagerPage returns the %s branch beside, not inside, the DTO", async branch => {
    const f = await serviceFixture(() => branch);
    const prepared = await f.operations.prepareNativeManagerPage(f.db.pool, f.p, { kind: "DEPLOYMENTS" }, { environment: "paper", limit: 100 }, f.e.config.selected_source);
    expect(prepared.cacheBranch).toEqual({ cache_state: branch, cache_identity: sharedReadIdentity(f.shared.scopes[0]!).cacheKey });
    expect(prepared.cacheBranch?.cache_identity).toBe(sharedReadIdentity({ ...f.shared.scopes[0]! }).cacheKey);
    // The native epoch the observer will MAC is the one that was folded into the cache key.
    expect(f.shared.scopes[0]!.nativeEpochDigest).toBe(prepared.nativeEpochDigest);
    expect(JSON.stringify(prepared.dto)).not.toContain("cache_");
    expect(Reflect.ownKeys(prepared.dto as object).every(k => typeof k === "string")).toBe(true);
    expect(takeCacheBranch(prepared.dto)).toBeUndefined(); // already taken, one-shot
  });

  it("the DTO is byte-identical with and without the observer carrier, and to the public deploymentPage DTO", async () => {
    const bytes: string[] = [];
    for (const disableNote of [false, true]) {
      hooks.disableNote = disableNote;
      const f = await serviceFixture(() => "HIT");
      const prepared = await f.operations.prepareNativeManagerPage(f.db.pool, f.p, { kind: "DEPLOYMENTS" }, { environment: "paper", limit: 100 }, f.e.config.selected_source);
      expect(prepared.cacheBranch === undefined).toBe(disableNote);
      bytes.push(JSON.stringify(prepared.dto));
    }
    expect(bytes[0]).toBe(bytes[1]);
    // Public (non-native) read: same safe shape, no branch ever surfaces.
    const f = await serviceFixture(() => "MISS");
    const publicDto = await f.operations.deploymentPage(f.p, { environment: "paper", limit: 100 });
    expect(JSON.stringify(publicDto)).toBe(bytes[0]);
    expect(JSON.stringify(publicDto)).not.toContain("cache_");
  });

  it("no branch note means no cacheBranch (absent, not guessed)", async () => {
    hooks.disableNote = true;
    const f = await serviceFixture(() => "HIT");
    const prepared = await f.operations.prepareNativeManagerPage(f.db.pool, f.p, { kind: "DEPLOYMENTS" }, { environment: "paper", limit: 100 }, f.e.config.selected_source);
    expect(prepared.cacheBranch).toBeUndefined();
  });
});

/* ---------------- 3. consumer: real proxy -> real service -> real consumer ---------------- */

const KEY32 = randomBytes(32);
const dirs: string[] = [];
afterAll(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

async function consumerFixture(options: { branch?: (scope: SharedReadScope) => NativeCacheState; sink?: NativeCacheObservationSink | null } = {}) {
  const f = await serviceFixture(options.branch ?? (() => "MISS"));
  const events: string[] = [];
  const candidate = await CurrentHumanCandidate.createNativeRead(f.db.pool, f.e.config);
  const handle = Object.freeze({}) as PreparedCurrentHumanNativeHTTP;
  const leases: string[] = [], attempts: string[] = [];
  const acquire = vi.spyOn(candidate, "acquireNativeRead").mockImplementation(async (_actor, rawBase) => {
    const base = rawBase as unknown as { binding: { lease_id: string; attempt_id: string } };
    events.push("native-acquire"); leases.push(base.binding.lease_id); attempts.push(base.binding.attempt_id); return handle;
  });
  const sent: Buffer[] = [];
  const reconciled: NativeHTTPRecovery = { state: "RECONCILED", context: {} as never };
  const send = vi.spyOn(candidate, "sendNativeRead").mockImplementation(async (_handle, _response, body) => {
    events.push("sole-final-send"); sent.push(Buffer.from(body)); return reconciled;
  });
  const recover = vi.spyOn(candidate, "reconcileNativeRead").mockImplementation(async () => { events.push("reconcile"); return { state: "UNKNOWN", context: {} as never }; });
  // find() is synchronous on every sink used here that is later read back.
  const sink = (options.sink === null ? undefined : (options.sink ?? new MemoryNativeCacheObservationSink())) as MemoryNativeCacheObservationSink | undefined;
  const observer = sink ? new NativeCacheObserver(KEY32, { append: r => { events.push("observer-append"); return sink.append(r); }, find: (l, a) => sink.find(l, a) }) : undefined;
  const consumer = new NativeManagerReadConsumer(f.db.pool, f.operations, { selectedCandidate: () => candidate }, [f.e], undefined, observer);
  const request = (limit = 100): NativeManagerRequest => ({ principal: f.p, operation: { kind: "DEPLOYMENTS" }, query: { environment: "paper", limit } });
  return { ...f, events, candidate, acquire, send, recover, sink, observer, consumer, request, sent, leases, attempts, reconciled };
}

describe("NativeManagerReadConsumer.deliver(): private cache observation on the real chain", () => {
  it.each(["HIT", "COALESCED", "MISS"] as const)("records the actual %s branch with the lease/attempt and body digest of the delivered response", async branch => {
    const f = await consumerFixture({ branch: () => branch });
    expect(await f.consumer.serve(f.request(), reply())).toBe(true);
    const record = f.sink!.find(f.leases[0]!, f.attempts[0]!) as NativeCacheObservationRecord;
    expect(record.cache_state).toBe(branch);
    expect(record.body_digest).toBe(`sha256:${createHash("sha256").update(f.sent[0]!).digest("hex")}`);
    expect(record.operation_id).toBe(MAXIMUM_DATA_DEPLOYMENT_OPERATION.logicalOperationId);
    const scope = f.shared.scopes[0]!, cacheKey = sharedReadIdentity(scope).cacheKey;
    expect(nativeCacheIdentityMatches(KEY32, record, cacheKey)).toBe(true);
    expect(record.native_epoch_mac).toBe(buildNativeCacheObservation(KEY32, { lease_id: f.leases[0]!, attempt_id: f.attempts[0]!,
      operation_id: record.operation_id, capture: { cache_state: branch, cache_identity: cacheKey }, native_epoch_digest: scope.nativeEpochDigest!,
      body_digest: record.body_digest, egress_phase: "UNKNOWN" }).native_epoch_mac);
  });

  it("the real RECONCILED return (no phase) is recorded as not-observed and joins durable SERVED as CORRELATED", async () => {
    const f = await consumerFixture({ branch: () => "HIT" });
    await f.consumer.serve(f.request(), reply());
    const record = f.sink!.find(f.leases[0]!, f.attempts[0]!)!;
    // send() returned RECONCILED in this fixture:
    expect(record.egress_evidence_kind).toBe("EGRESS_NOT_OBSERVED_IN_RETURN");
    const durable = (phase: string) => ({ lease_id: record.lease_id, attempt_id: record.attempt_id, phase, body_digest: record.body_digest,
      receipt_digest: hash("9"), source_ack_digest: hash("8"), source_reconciled: true });
    expect(correlateNativeCacheObservation(record, durable("SERVED")).verdict).toBe("CORRELATED");
    expect(correlateNativeCacheObservation(record, durable("ABORTED")).durable_egress).toBe("ABORTED");
    expect(correlateNativeCacheObservation(record, { ...durable("SERVED"), body_digest: hash("0") }).verdict).toBe("MISMATCH");
  });

  it.each([
    ["TERMINAL SERVED", { state: "TERMINAL", phase: "SERVED", context: {}, terminal: "jwt" }, "FINAL_HTTP_SEND_COMPLETED"],
    ["TERMINAL ABORTED", { state: "TERMINAL", phase: "ABORTED", context: {}, terminal: "jwt" }, "FINAL_HTTP_ABORT_CONFIRMED"],
    ["UNKNOWN", { state: "UNKNOWN", context: {} }, "NO_FINAL_WITNESS"],
    ["UNSENT_FENCED", { state: "UNSENT_FENCED", context: {} }, "NO_FINAL_WITNESS"],
    ["RECONCILED", { state: "RECONCILED", context: {} }, "EGRESS_NOT_OBSERVED_IN_RETURN"],
  ] as const)("maps the send() return %s to %s", async (_name, returned, expected) => {
    const f = await consumerFixture({ branch: () => "MISS" });
    f.send.mockResolvedValue(returned as unknown as NativeHTTPRecovery);
    await f.consumer.serve(f.request(), reply());
    expect(f.sink!.find(f.leases[0]!, f.attempts[0]!)!.egress_evidence_kind).toBe(expected);
  });

  it("after a send failure the recovery return is what is recorded; a failing recovery is 'not observed', never 'no witness'", async () => {
    const withUnknown = await consumerFixture();
    withUnknown.send.mockRejectedValue(new Error("TEST_ONLY-lost-ACK"));
    const response = reply();
    expect(await withUnknown.consumer.serve(withUnknown.request(), response)).toBe(true);
    expect(response.raw.destroyed).toBe(true);
    expect(withUnknown.recover).toHaveBeenCalledWith(withUnknown.leases[0]);
    expect(withUnknown.sink!.find(withUnknown.leases[0]!, withUnknown.attempts[0]!)!.egress_evidence_kind).toBe("NO_FINAL_WITNESS");
    const withThrow = await consumerFixture();
    withThrow.send.mockRejectedValue(new Error("TEST_ONLY-lost-ACK"));
    withThrow.recover.mockRejectedValue(new Error("TEST_ONLY-recovery-down"));
    expect(await withThrow.consumer.serve(withThrow.request(), reply())).toBe(true);
    expect(withThrow.sink!.find(withThrow.leases[0]!, withThrow.attempts[0]!)!.egress_evidence_kind).toBe("EGRESS_NOT_OBSERVED_IN_RETURN");
  });

  it("orders private fetch, acquire, final send and recovery exactly as before; the observer runs last", async () => {
    const f = await consumerFixture();
    f.send.mockRejectedValue(new Error("TEST_ONLY-lost-ACK"));
    await f.consumer.serve(f.request(), reply());
    expect(f.events).toEqual(["native-acquire", "reconcile", "observer-append"]);
    const ok = await consumerFixture();
    await ok.consumer.serve(ok.request(), reply());
    expect(ok.events).toEqual(["native-acquire", "sole-final-send", "observer-append"]);
    // No observation before the final-send decision: nothing is appended while acquire is still pending.
    const held = await consumerFixture(); let release!: () => void, entered!: () => void;
    const wait = new Promise<void>(r => { release = r; }), seen = new Promise<void>(r => { entered = r; });
    held.acquire.mockImplementation(async () => { entered(); await wait; return Object.freeze({}) as PreparedCurrentHumanNativeHTTP; });
    const pending = held.consumer.serve(held.request(), reply()); await seen;
    expect(held.events).toEqual([]); expect(held.send).not.toHaveBeenCalled(); release(); await pending;
    expect(held.events).toEqual(["sole-final-send", "observer-append"]); // (the held acquire mock logs nothing)
  });

  it("the delivered bytes, the candidate calls and the custody arguments are identical with and without an observer", async () => {
    const plain = await consumerFixture({ sink: null }), observed = await consumerFixture();
    // Make the two runs comparable: same lease/attempt are random, so compare the safe body and the call shapes.
    await plain.consumer.serve(plain.request(), reply()); await observed.consumer.serve(observed.request(), reply());
    expect(observed.sent[0]!.equals(plain.sent[0]!)).toBe(true);
    for (const f of [plain, observed]) {
      expect(f.acquire).toHaveBeenCalledTimes(1); expect(f.send).toHaveBeenCalledTimes(1); expect(f.recover).not.toHaveBeenCalled();
      expect(f.acquire.mock.calls[0]![2]).toBe(hash("e")); // decision.scope_digest, untouched
    }
    expect(plain.sink).toBeUndefined();
    expect(plain.events).toEqual(["native-acquire", "sole-final-send"]);
    // The unobserved consumer used the exact same cache scope (cache key) as the observed one.
    expect(Object.keys(plain.shared.scopes[0]!)).toEqual(Object.keys(observed.shared.scopes[0]!));
    expect(plain.shared.scopes[0]!.requestPath).toBe(observed.shared.scopes[0]!.requestPath);
    expect(plain.shared.scopes[0]!.nativeEpochDigest).toMatch(/^sha256:[a-f0-9]{64}$/); // per-actor/decision epoch: differs per fixture by design
  });

  it("default is absent: a consumer built without an observer records nothing and needs no sink", async () => {
    const f = await consumerFixture({ sink: null });
    expect(await f.consumer.serve(f.request(), reply())).toBe(true);
    expect(f.observer).toBeUndefined();
  });

  it("a throwing, rejecting or refusing observer never changes the response, the return value or recovery", async () => {
    for (const sink of [
      { append() { throw new Error(`disk ${KEY32.toString("hex")}`); }, find: () => undefined },
      { append: async () => { throw new Error("async disk"); }, find: () => undefined },
    ] as NativeCacheObservationSink[]) {
      const f = await consumerFixture({ sink });
      const response = reply();
      expect(await f.consumer.serve(f.request(), response)).toBe(true);
      expect(f.send).toHaveBeenCalledTimes(1); expect(f.recover).not.toHaveBeenCalled(); expect(response.raw.destroyed).toBe(false);
    }
    // And the observer itself failing to even build (it is a real class, so make record() reject):
    const f = await consumerFixture();
    vi.spyOn(f.observer!, "record").mockRejectedValue(new Error("TEST_ONLY-boom"));
    expect(await f.consumer.serve(f.request(), reply())).toBe(true);
  });

  it("concurrent requests with different branches keep their own observation (isolation)", async () => {
    const f = await consumerFixture({ branch: scope => scope.requestPath.includes("limit=50") ? "COALESCED" : "HIT" });
    const byLimit = new Map<number, ServerResponse>();
    const requests = [100, 50, 100, 50].map(limit => { const r = reply(); byLimit.set(byLimit.size, r.raw); return { limit, r }; });
    const leaseOfResponse = new Map<ServerResponse, string>();
    f.acquire.mockImplementation(async (_actor, rawBase) => { const base = rawBase as unknown as { binding: { lease_id: string; attempt_id: string } };
      f.leases.push(base.binding.lease_id); f.attempts.push(base.binding.attempt_id);
      return { lease: base.binding.lease_id } as unknown as PreparedCurrentHumanNativeHTTP; });
    f.send.mockImplementation(async (handle, response) => { leaseOfResponse.set(response, (handle as unknown as { lease: string }).lease); return f.reconciled; });
    f.leases.length = 0; f.attempts.length = 0;
    await Promise.all(requests.map(({ limit, r }) => f.consumer.serve(f.request(limit), r)));
    expect(leaseOfResponse.size).toBe(4);
    for (const { limit, r } of requests) {
      const lease = leaseOfResponse.get(r.raw)!, attempt = f.attempts[f.leases.indexOf(lease)]!;
      expect(f.sink!.find(lease, attempt)!.cache_state).toBe(limit === 50 ? "COALESCED" : "HIT");
    }
    // limit changes the request path, hence the cache identity MAC.
    const macs = new Set(requests.map(({ r }) => f.sink!.find(leaseOfResponse.get(r.raw)!, f.attempts[f.leases.indexOf(leaseOfResponse.get(r.raw)!)]!)!.cache_identity_mac));
    expect(macs.size).toBe(2);
  });

  it("the private log contains no secret, identity, epoch, session, cookie or body", async () => {
    const dir = mkdtempSync(join(tmpdir(), "native-cache-wiring-")); dirs.push(dir); chmodSync(dir, 0o700);
    const fileKey = loadNativeCacheObservationKey(dir, true);
    const sink = new FileNativeCacheObservationSink(dir);
    const f = await consumerFixture({ branch: () => "HIT", sink: null });
    const consumer = new NativeManagerReadConsumer(f.db.pool, f.operations, { selectedCandidate: () => f.candidate }, [f.e], undefined, new NativeCacheObserver(fileKey, sink));
    await consumer.serve(f.request(), reply());
    const log = readFileSync(join(dir, "observation.jsonl"), "utf8");
    const scope = f.shared.scopes[0]!, cacheKey = sharedReadIdentity(scope).cacheKey;
    expect(log.trim().split("\n")).toHaveLength(1);
    for (const secret of [fileKey.toString("hex"), fileKey.toString("base64"), cacheKey, cacheKey.slice(7), scope.nativeEpochDigest!, scope.nativeEpochDigest!.slice(7),
      scope.principalId, scope.workspaceId, f.p.session.sessionId, "TEST_ONLY", "cookie", "token", "base_body", "authorization", "Bearer", "eyJ", "records", "items",
      scope.requestPath])
      expect(log).not.toContain(secret);
    expect(Object.keys(JSON.parse(log))).toEqual(["schema_version", "lease_id", "attempt_id", "operation_id", "cache_state",
      "cache_identity_mac", "native_epoch_mac", "body_digest", "egress_evidence_kind", "egress_semantics"]);
  });
});
