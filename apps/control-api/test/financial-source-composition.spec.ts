/** TEST_ONLY lifecycle doubles; no DB, source acceptance, credentials, listener
 * or runtime commissioning. Real mTLS/route/late-DB transport tests are separate.
 * One case calls the actual candidate factory with in-memory Ed25519 keys. */
import { EventEmitter } from "node:events";
import { generateKeyPairSync } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Pool } from "pg";
import { generateKeyPair } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CurrentHumanCandidate } from "../src/execution-v2/current-human-candidate";
import type { FinancialSourceAssertionAuthority } from "../src/execution-v2/financial-source-assertion";
import { FinancialSourceComposition, type FinancialSourceCompositionConfig } from "../src/execution-v2/financial-source-composition";
import { pmHttpRequestDigest } from "../src/execution-v2/pm-http-request-binding";
import { commonName, testCertificate, type TestAuthority } from "./fixtures/elp210-test-certificates";

const factories = vi.hoisted(() => ({ assertion: vi.fn(), reverse: vi.fn() }));
vi.mock("../src/execution-v2/financial-source-assertion-transport", () => ({ createFinancialSourceAssertionTransport: factories.assertion }));
vi.mock("../src/execution-v2/current-human-transport", () => ({ createCurrentHumanTransport: factories.reverse }));

class TestServer extends EventEmitter {
  listening = false;
  fail = false;
  holdClose = false;
  private generation = 0;
  private callbacks: (() => void)[] = [];
  private selected: AddressInfo | null = null;
  listen(port: number, host: string, done: () => void) {
    const generation = this.generation;
    queueMicrotask(() => {
      if (generation !== this.generation) return;
      if (this.fail) { this.emit("error", new Error("TEST_ONLY_BIND_FAILURE")); return; }
      this.listening = true;
      this.selected = { address: host, port: port || ++nextPort, family: "IPv4" };
      done();
    });
    return this;
  }
  address() { return this.selected; }
  close(callback?: () => void) {
    this.generation++; this.listening = false; this.selected = null;
    const finish = () => { this.emit("close"); callback?.(); };
    if (this.holdClose) this.callbacks.push(finish); else queueMicrotask(finish);
    return this;
  }
  finishClose() { this.holdClose = false; this.callbacks.splice(0).forEach(callback => callback()); }
}
let nextPort = 30000;
type Counts = { in_flight: number; accepted: number; denied: number; timed_out: number };
type Transport = { server: TestServer; counts: Counts; snapshot(): Counts };
const transports: Transport[] = [];
const actor = { user_id: "TEST_ONLY-user", session_id: "TEST_ONLY-session", session_generation: 7 };
const targets = { assertion: { host: "127.0.0.1", port: 0 }, reverse: { host: "127.0.0.1", port: 0 } };
const deferred = <T>() => { let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
function transport() {
  const value = { server: new TestServer(), counts: { in_flight: 0, accepted: 0, denied: 0, timed_out: 0 },
    snapshot() { return { ...this.counts }; } };
  transports.push(value); return value;
}

describe("private financial source Core composition (TEST_ONLY lifecycle)", () => {
  let key: Awaited<ReturnType<typeof generateKeyPair>>;
  const compositions: FinancialSourceComposition[] = [];
  beforeAll(async () => { key = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true }); });
  beforeEach(() => {
    factories.assertion.mockReset().mockImplementation(() => transport());
    factories.reverse.mockReset().mockImplementation(() => transport());
    transports.length = 0;
  });
  afterEach(async () => {
    for (const t of transports) t.server.finishClose();
    for (const composition of compositions.splice(0)) await composition.shutdown();
    vi.restoreAllMocks();
  });
  function config(): FinancialSourceCompositionConfig {
    return { candidate: { issuer: "TEST_ONLY-core", audience: "TEST_ONLY-pm", key_id: "TEST_ONLY-core-key", private_key: key.privateKey,
      source: { issuer: "TEST_ONLY-pm", audience: "TEST_ONLY-core", key_id: "TEST_ONLY-source-key", public_key: key.publicKey,
        workload_id: "TEST_ONLY-edge-workload" }, limits: { ttl_ms: 30_000, maximum_unresolved: 1, maximum_retained: 32 },
      installation_scope: { workspace_id: "TEST_ONLY-workspace", environment: "paper", valid_until_ms: Date.now() + 60_000 } },
      assertion_limits: { ttl_ms: 60_000, maximum_contexts: 2, maximum_requests_per_context: 6 },
      assertion_transport: { tls: { key: Buffer.from("TEST_ONLY-key"), cert: Buffer.from("TEST_ONLY-cert"), ca: Buffer.from("TEST_ONLY-ca") },
        peer: { certificate_sha256: `sha256:${"a".repeat(64)}`, dns_name: "localhost", workload_id: "TEST_ONLY-edge-workload" },
        limits: { maximum_in_flight: 2, request_bytes: 2_129_920, response_bytes: 65_536, deadline_ms: 1000 } },
      current_human_transport: { tls: { key: Buffer.from("TEST_ONLY-key"), cert: Buffer.from("TEST_ONLY-cert"), ca: Buffer.from("TEST_ONLY-ca") },
        source_certificate_sha256: `sha256:${"b".repeat(64)}`, limits: { maximum_in_flight: 2, request_bytes: 32768, deadline_ms: 1000 } },
      source_selection: { workspace_id: "TEST_ONLY-workspace", environment: "paper", workload_id: "TEST_ONLY-edge-workload",
        receiver_id: "TEST_ONLY-receiver", binding_digest: `sha256:${"c".repeat(64)}`,
        paths: ["/financial/dataset", "/financial/series", "/financial/snapshot", "/financial/page", "/financial/delta", "/financial/receipt"] },
      shutdown_deadline_ms: 30 };
  }
  function candidateDouble() {
    let ordinal = 0;
    const candidate = { issue: vi.fn(async (a, binding) => {
      const iat = Math.floor(Date.now() / 1000), exp = iat + 30, lease = `TEST_ONLY-lease-${++ordinal}`;
      const claims = { ...binding, purpose: "pma.identity.v1", sub: a.user_id, sid: a.session_id,
        session_revision: a.session_generation, authority_revision: 2, jti: lease, iat, exp };
      const token = [Buffer.from('{"alg":"TEST_ONLY"}').toString("base64url"),
        Buffer.from(JSON.stringify(claims)).toString("base64url"), "TEST_ONLY"].join(".");
      return { token, lease_id: lease, expires_at_ms: exp * 1000, authority_revision: 2 };
    }), revalidateIssue: vi.fn(async (): Promise<void> => undefined), enter: vi.fn(async () => ({ lease_id: "TEST_ONLY-lease", attempt_id: "TEST_ONLY-attempt" })),
      resolve: vi.fn(async () => ({ replayed: false, phase: "COMMITTED" })) };
    return candidate;
  }
  async function setup(input = config(), actualFactory = false) {
    const candidate = candidateDouble(), query = vi.fn(), end = vi.fn();
    const pool = { options: { connectionTimeoutMillis: 1000, query_timeout: 3000 }, query, end } as unknown as Pool;
    const factory = actualFactory ? undefined : vi.spyOn(CurrentHumanCandidate, "create").mockResolvedValue(candidate as unknown as CurrentHumanCandidate);
    const composition = await FinancialSourceComposition.create(pool, input); compositions.push(composition);
    const assertion = transports[0]!, reverse = transports[1]!;
    const issuer = factories.assertion.mock.calls[0]![0] as Pick<FinancialSourceAssertionAuthority, "issue">;
    const issue = async (context: string, request = requestFor(input)) => {
      assertion.counts.in_flight++;
      try { return await issuer.issue(context, request); }
      finally { assertion.counts.in_flight--; }
    };
    return { composition, pool, candidate, query, end, factory, issue, assertion, reverse };
  }
  function requestFor(input: FinancialSourceCompositionConfig) {
    const path = input.source_selection.paths[0]!, body = "{}";
    return { schema_version: "portal.execution.financial-source-assertion-request.v1",
      binding_digest: input.source_selection.binding_digest, receiver_id: input.source_selection.receiver_id,
      workload_id: input.source_selection.workload_id, method: "POST", path, body_utf8: body,
      delivery_sequence: 0, previous_lease_id: null,
      request_digest: pmHttpRequestDigest({ method: "POST", raw_path: Buffer.from(path), query_string: Buffer.alloc(0),
        body: Buffer.from(body) }, { request_bytes: 1_048_576 }) };
  }
  function compactRequest(input: FinancialSourceCompositionConfig) {
    return requestFor(input);
  }

  it("constructs with the actual candidate factory, no DB query, no listen and one shared recovery candidate", async () => {
    const f = await setup(config(), true);
    const shared = factories.reverse.mock.calls[0]![0] as CurrentHumanCandidate;
    expect(shared).toBeInstanceOf(CurrentHumanCandidate); expect(shared.usesPool(f.pool)).toBe(true);
    expect(f.query).not.toHaveBeenCalled(); expect(f.end).not.toHaveBeenCalled();
    expect(f.composition.snapshot()).toMatchObject({ state: "CREATED", listeners: { assertion: null, reverse: null } });
    await expect(f.composition.withPrincipal(actor, () => "no")).rejects.toMatchObject({ code: "FINANCIAL_SOURCE_COMPOSITION_NOT_RUNNING" });
  });
  it("rejects C2 candidate configuration before building the non-custodied financial listeners", async () => {
    const c=config();c.candidate.c2_delivery_schema_required=true;
    const pool={options:{connectionTimeoutMillis:1000,query_timeout:3000}} as unknown as Pool;
    const create=vi.spyOn(CurrentHumanCandidate,"create");
    await expect(FinancialSourceComposition.create(pool,c)).rejects.toMatchObject({code:"FINANCIAL_SOURCE_COMPOSITION_CONFIG_INVALID"});
    expect(create).not.toHaveBeenCalled();
    expect(factories.assertion).not.toHaveBeenCalled();expect(factories.reverse).not.toHaveBeenCalled();
  });
  it("shares exact candidate ISSUE/revalidation and reverse ENTER/terminal implementation without a second identity authority", async () => {
    const c = config(), f = await setup(c); await f.composition.start(targets);
    expect(f.factory).toHaveBeenCalledWith(f.pool, expect.objectContaining({ installation_scope: c.candidate.installation_scope }));
    expect(factories.reverse.mock.calls[0]![0]).toBe(f.candidate);
    const reply = await f.composition.withPrincipal(actor, context => f.issue(context, compactRequest(c)));
    expect(reply).toMatchObject({ lease_id: "TEST_ONLY-lease-1", request_digest: compactRequest(c).request_digest });
    expect(f.candidate.issue).toHaveBeenCalledWith(actor, { workspace_id: c.source_selection.workspace_id, environment: "paper",
      workload_id: c.source_selection.workload_id, request_digest: compactRequest(c).request_digest });
    expect(f.candidate.revalidateIssue).toHaveBeenCalledOnce(); expect(f.end).not.toHaveBeenCalled();
    expect(f.composition.snapshot()).toMatchObject({ owned_contexts: 0, pending_uses: 0 });
  });
  it("re-reads current session on exact retries and releases context even after callback failure", async () => {
    const c = config(), f = await setup(c); await f.composition.start(targets); let token = "";
    await expect(f.composition.withPrincipal(actor, async context => {
      token = context; await f.issue(context, compactRequest(c));
      f.candidate.revalidateIssue.mockRejectedValueOnce(new Error("TEST_ONLY-session-revoked"));
      return f.issue(context, compactRequest(c));
    })).rejects.toThrow("session-revoked");
    expect(f.candidate.issue).toHaveBeenCalledOnce(); expect(f.candidate.revalidateIssue).toHaveBeenCalledTimes(2);
    await expect(f.issue(token, compactRequest(c))).rejects.toMatchObject({ code: "FINANCIAL_ASSERTION_CONTEXT_REQUIRED" });
    expect(f.composition.snapshot()).toMatchObject({ owned_contexts: 0, pending_uses: 0 });
  });
  it("rejects malformed server actor instead of deriving a principal from body, role or workload", async () => {
    const f = await setup(); await f.composition.start(targets); const use = vi.fn();
    await expect(f.composition.withPrincipal({ ...actor, role: "ADMIN" } as typeof actor, use)).rejects.toThrow();
    expect(use).not.toHaveBeenCalled(); expect(f.candidate.issue).not.toHaveBeenCalled();
  });
  it("returns the actual immutable registration expiry to the explicit owner callback", async () => {
    const c = config(), f = await setup(c); await f.composition.start(targets);
    const before = Date.now();
    await f.composition.withPrincipal(actor, (_context, registration) => {
      expect(Object.isFrozen(registration)).toBe(true);
      expect(registration.expires_at_ms).toBeGreaterThanOrEqual(before + c.assertion_limits.ttl_ms);
      expect(registration.expires_at_ms).toBeLessThanOrEqual(Date.now() + c.assertion_limits.ttl_ms);
    });
    expect(f.candidate.issue).not.toHaveBeenCalled();
  });
  it("does not register or invoke a use for an already aborted owner signal", async () => {
    const f = await setup(); await f.composition.start(targets);
    const controller = new AbortController(); controller.abort(); const use = vi.fn();
    await expect(f.composition.withPrincipal(actor, use, { signal: controller.signal }))
      .rejects.toMatchObject({ code: "FINANCIAL_SOURCE_COMPOSITION_CANCELLED" });
    expect(use).not.toHaveBeenCalled(); expect(f.candidate.issue).not.toHaveBeenCalled();
    expect(f.composition.snapshot()).toMatchObject({ owned_contexts: 0, pending_uses: 0 });
  });
  it("aborting before callback dispatch retires admission without dispatching the callback", async () => {
    const f = await setup(); await f.composition.start(targets);
    const controller = new AbortController(), use = vi.fn();
    const result = f.composition.withPrincipal(actor, use, { signal: controller.signal });
    controller.abort();
    expect(f.composition.snapshot()).toMatchObject({ owned_contexts: 0, pending_uses: 1 });
    await expect(result).rejects.toMatchObject({ code: "FINANCIAL_SOURCE_COMPOSITION_CANCELLED" });
    expect(use).not.toHaveBeenCalled();
  });
  it("retires aborted context admission but retains callback ownership and reverse settlement until joined", async () => {
    const c = config(), f = await setup(c); await f.composition.start(targets);
    const controller = new AbortController(), held = deferred<string>(); let token = "", settled = false;
    const result = f.composition.withPrincipal(actor, context => {
      token = context; return held.promise;
    }, { signal: controller.signal }).catch(error => error).finally(() => { settled = true; });
    await vi.waitFor(() => expect(token).not.toBe("")); controller.abort();
    expect(f.composition.snapshot()).toMatchObject({ state: "RUNNING", owned_contexts: 0, pending_uses: 1 });
    expect(f.reverse.server.listening).toBe(true); expect(settled).toBe(false);
    await expect(f.issue(token, compactRequest(c))).rejects.toMatchObject({ code: "FINANCIAL_ASSERTION_CONTEXT_REQUIRED" });
    expect(f.candidate.issue).not.toHaveBeenCalled();
    held.resolve("TEST_ONLY-worker-stopped");
    expect(await result).toMatchObject({ code: "FINANCIAL_SOURCE_COMPOSITION_CANCELLED" });
    expect(f.composition.snapshot()).toMatchObject({ state: "RUNNING", pending_uses: 0 });
    expect(f.reverse.server.listening).toBe(true); expect(f.end).not.toHaveBeenCalled();
  });
  it("aborting an in-flight issue does not discard its original pending promise or report a drain", async () => {
    const c = config(), f = await setup(c), held = deferred<Awaited<ReturnType<typeof f.candidate.issue>>>();
    const original = f.candidate.issue.getMockImplementation()!;
    f.candidate.issue.mockImplementationOnce(() => held.promise); await f.composition.start(targets);
    const controller = new AbortController();
    const result = f.composition.withPrincipal(actor, context => f.issue(context, compactRequest(c)),
      { signal: controller.signal }).catch(error => error);
    await vi.waitFor(() => expect(f.candidate.issue).toHaveBeenCalledOnce()); controller.abort();
    expect(f.composition.snapshot()).toMatchObject({ state: "RUNNING", pending_uses: 1,
      authority: { pending: 1 }, assertion: { in_flight: 1 } });
    expect(f.reverse.server.listening).toBe(true);
    held.resolve(await original(actor, { workspace_id: c.source_selection.workspace_id, environment: "paper",
      workload_id: c.source_selection.workload_id, request_digest: compactRequest(c).request_digest }));
    await result;
    expect(f.composition.snapshot()).toMatchObject({ pending_uses: 0, authority: { pending: 0 } });
    expect(f.candidate.issue).toHaveBeenCalledOnce(); expect(f.end).not.toHaveBeenCalled();
  });
  const invalid: [string, (c: FinancialSourceCompositionConfig) => void][] = [
    ["missing Paper installation", c => { delete c.candidate.installation_scope; }],
    ["non-Paper installation", c => { Reflect.set(c.candidate.installation_scope!, "environment", "live"); }],
    ["zero identity ttl", c => { c.candidate.limits.ttl_ms = 0; }],
    ["identity ttl above 30s", c => { c.candidate.limits.ttl_ms = 30_001; }],
    ["fractional identity ttl", c => { c.candidate.limits.ttl_ms = 1000.5; }],
    ["shutdown above 5s", c => { c.shutdown_deadline_ms = 5001; }],
    ["zero shutdown", c => { c.shutdown_deadline_ms = 0; }],
    ["wrong workspace", c => { c.source_selection.workspace_id = "wrong"; }],
    ["wrong source workload", c => { c.candidate.source.workload_id = "wrong"; }],
    ["wrong peer workload", c => { c.assertion_transport.peer.workload_id = "wrong"; }],
    ["missing source path", c => { c.source_selection.paths.pop(); }],
    ["duplicate source path", c => { c.source_selection.paths[1] = c.source_selection.paths[0]!; }],
    ["unsafe source path", c => { c.source_selection.paths[0] = "/financial/../mutate"; }],
    ["invalid binding", c => { c.source_selection.binding_digest = "NOT_A_PIN"; }],
    ["non-Paper selection", c => { Reflect.set(c.source_selection, "environment", "live"); }],
  ];
  it.each(invalid)("refuses %s before candidate creation", async (_label, mutate) => {
    const c = config(); mutate(c); const factory = vi.spyOn(CurrentHumanCandidate, "create");
    await expect(FinancialSourceComposition.create({} as Pool, c)).rejects.toMatchObject({ code: "FINANCIAL_SOURCE_COMPOSITION_CONFIG_INVALID" });
    expect(factory).not.toHaveBeenCalled(); expect(factories.assertion).not.toHaveBeenCalled();
  });
  it.each(["0.0.0.0", "::", "8.8.8.8", "localhost", "example.invalid"])("refuses nonprivate/default/DNS target %s before listen", async host => {
    const f = await setup();
    await expect(f.composition.start({ ...targets, assertion: { host, port: 0 } })).rejects.toMatchObject({ code: "FINANCIAL_SOURCE_COMPOSITION_CONFIG_INVALID" });
    expect(f.composition.snapshot().state).toBe("CREATED"); expect(f.assertion.server.listening).toBe(false);
  });
  it("requires separate explicit targets and closes a partial first listener if the second bind fails", async () => {
    const f = await setup();
    await expect(f.composition.start({ assertion: { host: "127.0.0.1", port: 25000 }, reverse: { host: "127.0.0.1", port: 25000 } }))
      .rejects.toMatchObject({ code: "FINANCIAL_SOURCE_COMPOSITION_CONFIG_INVALID" });
    f.reverse.server.fail = true;
    await expect(f.composition.start(targets)).rejects.toMatchObject({ code: "FINANCIAL_SOURCE_COMPOSITION_START_FAILED" });
    expect(f.composition.snapshot()).toMatchObject({ state: "FAILED", listeners: { assertion: null, reverse: null } });
    await f.composition.shutdown(); expect(f.composition.snapshot().state).toBe("STOPPED");
  });
  it("preserves expired same-key reverse recovery without pretending an expired installation is new authority", async () => {
    const c = config(); c.candidate.installation_scope!.valid_until_ms = 1;
    const f = await setup(c, true); await f.composition.start(targets);
    const real = factories.reverse.mock.calls[0]![0] as CurrentHumanCandidate;
    await expect(f.composition.withPrincipal(actor, context => f.issue(context, compactRequest(c))))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_INSTALLATION_SCOPE_INVALID" });
    expect(real).toBeInstanceOf(CurrentHumanCandidate); expect(f.query).not.toHaveBeenCalled();
  });
  it("snapshots selection, candidate limits and TLS buffers before async create resolves", async () => {
    const c = config(), held = deferred<CurrentHumanCandidate>(), candidate = candidateDouble();
    const factory = vi.spyOn(CurrentHumanCandidate, "create").mockReturnValue(held.promise);
    const creating = FinancialSourceComposition.create({} as Pool, c);
    c.source_selection.paths[0] = "/changed"; c.source_selection.binding_digest = `sha256:${"e".repeat(64)}`;
    c.candidate.limits.ttl_ms = 60_000; (c.assertion_transport.tls.key as Buffer).fill(0);
    held.resolve(candidate as unknown as CurrentHumanCandidate);
    const composition = await creating; compositions.push(composition);
    expect(factory.mock.calls[0]![1].limits.ttl_ms).toBe(30_000);
    expect((factories.assertion.mock.calls[0]![1] as FinancialSourceCompositionConfig["assertion_transport"]).tls.key)
      .toEqual(Buffer.from("TEST_ONLY-key"));
    await composition.start(targets);
    const issuer = factories.assertion.mock.calls[0]![0] as Pick<FinancialSourceAssertionAuthority, "issue">;
    await composition.withPrincipal(actor, context => issuer.issue(context, compactRequest(config())));
    expect(candidate.issue).toHaveBeenCalledOnce();
  });
  it("holds unresolved ISSUE and callback custody after shutdown timeout, rejects new use, then drains without deleting lease", async () => {
    const c = config(), f = await setup(c), held = deferred<Awaited<ReturnType<typeof f.candidate.issue>>>();
    const original = f.candidate.issue.getMockImplementation()!; f.candidate.issue.mockImplementationOnce(() => held.promise);
    await f.composition.start(targets);
    const result = f.composition.withPrincipal(actor, context => f.issue(context, compactRequest(c))).catch(error => error);
    await vi.waitFor(() => expect(f.candidate.issue).toHaveBeenCalledOnce());
    await expect(f.composition.shutdown()).rejects.toMatchObject({ code: "FINANCIAL_SOURCE_COMPOSITION_SHUTDOWN_PENDING" });
    expect(f.composition.snapshot()).toMatchObject({ state: "STOPPING", pending_uses: 1, authority: { pending: 1 }, assertion: { in_flight: 1 } });
    await expect(f.composition.withPrincipal(actor, () => "no")).rejects.toMatchObject({ code: "FINANCIAL_SOURCE_COMPOSITION_NOT_RUNNING" });
    held.resolve(await original(actor, { workspace_id: c.source_selection.workspace_id, environment: "paper",
      workload_id: c.source_selection.workload_id, request_digest: compactRequest(c).request_digest }));
    await result; await f.composition.shutdown();
    expect(f.composition.snapshot()).toMatchObject({ state: "STOPPED", pending_uses: 0, assertion: { in_flight: 0 } });
    expect(f.end).not.toHaveBeenCalled(); expect(f.candidate.issue).toHaveBeenCalledOnce();
  });
  it("does not mistake pending revalidation or reverse DB operation for a drained issuer", async () => {
    const c = config(), f = await setup(c), held = deferred<void>(); await f.composition.start(targets);
    f.candidate.revalidateIssue.mockImplementationOnce(() => held.promise);
    const result = f.composition.withPrincipal(actor, context => f.issue(context, compactRequest(c))).catch(error => error);
    await vi.waitFor(() => expect(f.candidate.revalidateIssue).toHaveBeenCalledOnce());
    f.reverse.counts.in_flight = 1;
    await expect(f.composition.shutdown()).rejects.toMatchObject({ code: "FINANCIAL_SOURCE_COMPOSITION_SHUTDOWN_PENDING" });
    expect(f.composition.snapshot()).toMatchObject({ authority: { pending: 1 }, assertion: { in_flight: 1 }, reverse: { in_flight: 1 } });
    held.resolve(); await result;
    await expect(f.composition.shutdown()).rejects.toMatchObject({ code: "FINANCIAL_SOURCE_COMPOSITION_SHUTDOWN_PENDING" });
    f.reverse.counts.in_flight = 0; await f.composition.shutdown(); expect(f.end).not.toHaveBeenCalled();
  });
  it("waits for physical listener close and bounds start/shutdown races without leaving a bind", async () => {
    const f = await setup(); f.assertion.server.holdClose = true;
    const starting = f.composition.start(targets).catch(error => error);
    await expect(f.composition.shutdown()).rejects.toMatchObject({ code: "FINANCIAL_SOURCE_COMPOSITION_SHUTDOWN_PENDING" });
    f.assertion.server.finishClose(); await starting; await f.composition.shutdown();
    expect(f.composition.snapshot()).toMatchObject({ state: "STOPPED", closing_listeners: 0, listeners: { assertion: null, reverse: null } });
  });
  it.each([false, true])("uses the actual unbound TLS transports and closes both real loopback listeners (start race: %s)", async race => {
    const assertion = await vi.importActual<typeof import("../src/execution-v2/financial-source-assertion-transport")>("../src/execution-v2/financial-source-assertion-transport");
    const reverse = await vi.importActual<typeof import("../src/execution-v2/current-human-transport")>("../src/execution-v2/current-human-transport");
    factories.assertion.mockImplementation(assertion.createFinancialSourceAssertionTransport);
    factories.reverse.mockImplementation(reverse.createCurrentHumanTransport);
    const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), name = commonName("TEST_ONLY-financial-composition-ca");
    const ca: TestAuthority = { key: keys.privateKey, name, certificate: testCertificate(name, keys, { name, key: keys.privateKey }, true) };
    const own = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const tls = { key: Buffer.from(own.privateKey.export({ type: "pkcs8", format: "pem" })),
      cert: testCertificate(commonName("TEST_ONLY-financial-composition"), own, ca, false), ca: ca.certificate };
    const c = config(); c.assertion_transport.tls = tls; c.current_human_transport.tls = tls; c.shutdown_deadline_ms = 1000;
    const query = vi.fn(), end = vi.fn(), pool = { options: { connectionTimeoutMillis: 1000, query_timeout: 3000 }, query, end } as unknown as Pool;
    const composition = await FinancialSourceComposition.create(pool, c); compositions.push(composition);
    expect(composition.snapshot()).toMatchObject({ state: "CREATED", listeners: { assertion: null, reverse: null } });
    if (race) {
      const starting = composition.start(targets).catch(error => error);
      await composition.shutdown(); expect(await starting).toMatchObject({ code: "FINANCIAL_SOURCE_COMPOSITION_NOT_RUNNING" });
    } else {
      const addresses = await composition.start(targets); expect(addresses.assertion.port).not.toBe(addresses.reverse.port);
      expect(composition.snapshot().state).toBe("RUNNING"); await composition.shutdown();
    }
    expect(composition.snapshot()).toMatchObject({ state: "STOPPED", closing_listeners: 0, listeners: { assertion: null, reverse: null } });
    expect(query).not.toHaveBeenCalled(); expect(end).not.toHaveBeenCalled();
  });
});
