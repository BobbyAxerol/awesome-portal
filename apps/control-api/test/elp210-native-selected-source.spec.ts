/** SYNTHETIC TEST_ONLY wire for the private unmounted selected source.
 * Actual ephemeral TLS1.3/mTLS + genuine client/codec witnesses. No signer,
 * source lease, app grant, held permission, production credential or release.
 */
import { createHash, generateKeyPairSync, X509Certificate, type KeyObject } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer, type Server } from "node:https";
import type { Socket } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NativeBusinessReadClient } from "../src/execution-v2/native-business-read-client";
import { prepareNativeBusinessReadRequest, type NativeBusinessReadAction,
  type NativeBusinessReadResult } from "../src/execution-v2/native-business-read-codec";
import { SelectedNativeBusinessReadSource, nativeBusinessReadDeliveryDigest,
  selectedNativeBusinessReadObservation, selectedNativeBusinessReadSelection,
  type NativeReadContext, type SelectedNativeBusinessReadConfig } from "../src/execution-v2/native-business-read-selected-source";
import { commonName, testCertificate } from "./fixtures/elp210-test-certificates";

const HASH = (value: string | Uint8Array) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const LIMITS = { request_bytes: 32768, response_bytes: 32768 };
const TOKEN = "TEST_ONLY-opaque-assertion-not-signed-or-authority";
const WORKLOAD = "TEST_ONLY-selected-native-read";
const UUID = "33333333-3333-3333-3333-333333333333";
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const utc = (milliseconds: number) => new Date(milliseconds).toISOString();
function context(at = Date.now()): NativeReadContext {
  return { binding: { lease_id: "11111111-1111-1111-1111-111111111111",
    attempt_id: "22222222-2222-2222-2222-222222222222", human_issuer: "urn:TEST_ONLY:portal",
    subject: "TEST_ONLY-human", workspace_id: "TEST_ONLY-workspace", environment: "paper",
    workload_id: WORKLOAD, request_digest: "a".repeat(64), operation: "READ" },
    domain: { profile_id: "PAPER_TEST_ONLY", catalogue_sha256: "b".repeat(64),
      profile_sha256: "c".repeat(64), field_policy_sha256: "d".repeat(64) },
    manager_intent: { schema_version: "pma.manager-read-intent.v1", action: "relation_page", digest: "a".repeat(64) },
    deadline: utc(at + 60000) };
}
function pins(input: NativeReadContext, at = Date.now()): SelectedNativeBusinessReadConfig["pins"] {
  return { binding: { human_issuer: input.binding.human_issuer, subject: input.binding.subject,
    workspace_id: input.binding.workspace_id, environment: input.binding.environment,
    workload_id: input.binding.workload_id }, domain: copy(input.domain),
    human: { issuer: input.binding.human_issuer, subject: input.binding.subject, portal_user_id: "TEST_ONLY-human",
      ts_user_id: UUID, mapping_revision: `ts-user:${UUID}:9` },
    native: { revision: "1", receipt_id: "44444444-4444-4444-4444-444444444444",
      receipt_digest: HASH("TEST_ONLY-receipt"), document_digest: HASH("TEST_ONLY-document"),
      policy_revision: "1", owner_mapping_revision: `ts-user:${UUID}:7`, semantic_revision: HASH("TEST_ONLY-semantic"),
      effective_from: utc(at - 60000), expires_at: utc(at + 120000) }, source_fingerprint: "f".repeat(64) };
}
function reply(action: NativeBusinessReadAction, input: NativeReadContext,
  selected: SelectedNativeBusinessReadConfig["pins"]): NativeBusinessReadResult {
  const common = { schema_version: "pma.native-business-read.result.v1" as const,
    binding: copy(input.binding), component: "NATIVE_BUSINESS_READ_ONLY" as const };
  if (action === "issue") return { ...common, state: "ISSUED", human: copy(selected.human),
    domain: { ...copy(selected.domain), environment: input.binding.environment },
    permission: { scope_kind: "MANAGER_CATALOGUE_DOMAIN", action: "business.read_all", delegable: false },
    native: copy(selected.native), lease: { source_digest: "e".repeat(64),
      source_fingerprint: selected.source_fingerprint, expires_at: input.deadline } };
  if (action === "enter") return { ...common, state: "ENTERED" };
  if (action === "unknown") return { ...common, state: "UNKNOWN" };
  if (action === "status") return { ...common, state: "OBSERVATION", may_authorize_read: false,
    recovery: { state: "ABSENT", terminal_authority: false, release_permitted: false } };
  if (action === "cancel-unentered") return { ...common, state: "CANCELLED", may_authorize_read: false,
    recovery: { state: "CANCELLED", cancellation_authority: true, release_permitted: true } };
  return { ...common, state: "SETTLED", may_authorize_read: false,
    recovery: { state: "SETTLED", phase: "SERVED", terminal_authority: true, release_permitted: true } };
}
function call(source: SelectedNativeBusinessReadSource, action: NativeBusinessReadAction, input: NativeReadContext) {
  if (action === "issue") return source.issue(input, TOKEN);
  if (action === "enter") return source.enter(input, TOKEN);
  if (action === "unknown") return source.unknown(input);
  if (action === "status") return source.status(input);
  if (action === "cancel-unentered") return source.cancelUnentered(input);
  return source.resolve(input, TOKEN);
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
type Authority = { key: KeyObject; name: Buffer; cert: Buffer };
type Identity = { key: Buffer; cert: Buffer; ca: Buffer; pin: string };
function authority(): Authority {
  const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), name = commonName("TEST_ONLY_selected_root");
  return { key: keys.privateKey, name, cert: testCertificate(name, keys, { name, key: keys.privateKey }, true) };
}
function identity(label: string, ca: Authority): Identity {
  const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const cert = testCertificate(commonName(`TEST_ONLY_${label}`), keys, ca, false);
  return { key: Buffer.from(keys.privateKey.export({ type: "pkcs8", format: "pem" })), cert, ca: ca.cert,
    pin: HASH(new X509Certificate(cert).raw) };
}

describe("NC02 selected native source — genuine local TLS witness, synthetic source facts", () => {
  let core: Identity, pm: Identity;
  const allocations: Array<{ server: Server; sockets: Set<Socket> }> = [];
  beforeAll(() => { const ca = authority(); core = identity("selected_core", ca); pm = identity("selected_pm", ca); }, 15000);
  afterEach(async () => {
    vi.restoreAllMocks();
    for (const { server, sockets } of allocations.splice(0)) {
      const closed = new Promise<void>(resolve => server.close(() => resolve()));
      for (const socket of sockets) socket.destroy(); server.closeAllConnections(); await closed;
    }
  });
  afterAll(() => { core?.key.fill(0); pm?.key.fill(0); });
  function json(response: ServerResponse, value: NativeBusinessReadResult) {
    const bytes = Buffer.from(JSON.stringify(value)); response.writeHead(200, { "content-type": "application/json",
      "content-length": String(bytes.length), "cache-control": "no-store", connection: "close" }); response.end(bytes);
  }
  async function endpoint(handler: (req: IncomingMessage, response: ServerResponse, body: Buffer) => void | Promise<void>) {
    const sockets = new Set<Socket>(), received: Array<{ path: string; body: Buffer }> = [];
    const server = createServer({ key: pm.key, cert: pm.cert, ca: core.ca, requestCert: true, rejectUnauthorized: true,
      minVersion: "TLSv1.3", maxVersion: "TLSv1.3" }, (req, response) => {
      const chunks: Buffer[] = []; req.on("error", () => undefined); response.on("error", () => undefined);
      req.on("data", chunk => chunks.push(Buffer.from(chunk))); req.on("end", () => {
        const body = Buffer.concat(chunks); received.push({ path: req.url ?? "", body });
        void Promise.resolve(handler(req, response, body)).catch(() => response.destroy());
      });
    });
    server.on("tlsClientError", () => undefined); server.on("clientError", (_error, socket) => socket.destroy());
    server.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
    allocations.push({ server, sockets });
    await new Promise<void>((resolve, reject) => { server.once("error", reject);
      server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); }); });
    const address = server.address(); if (!address || typeof address === "string") throw new Error("TEST_ONLY_LISTEN");
    return { origin: `https://127.0.0.1:${address.port}`, received };
  }
  function config(origin: string, input: NativeReadContext, at = Date.now()): SelectedNativeBusinessReadConfig {
    return { transport: { origin, tls: { ca: pm.ca, key: core.key, cert: core.cert }, pm_leaf_sha256: pm.pin,
      workload_id: WORKLOAD, deadline_ms: 2000, request_bytes: 32768, response_bytes: 32768, max_inflight: 2 },
      pins: pins(input, at), installation_expires_at_utc_ms: at + 120000 };
  }

  it.each(["issue", "enter", "unknown", "status", "cancel-unentered", "resolve"] as const)(
    "captures the exact %s result only from its genuine private TLS client", async action => {
      const input = context(), selected = pins(input), expected = reply(action, input, selected);
      const lane = await endpoint((_req, response) => json(response, expected));
      const cfg = config(lane.origin, input); cfg.pins = selected;
      const source = new SelectedNativeBusinessReadSource(cfg), observation = await call(source, action, input);
      const view = selectedNativeBusinessReadObservation(source, observation);
      const prepared = prepareNativeBusinessReadRequest(action, { schema_version: "pma.native-business-read.request.v1", ...input,
        ...(action === "issue" || action === "enter" ? { human_token: TOKEN } : action === "resolve" ? { signed_terminal: TOKEN } : {}) }, LIMITS);
      expect(lane.received).toEqual([{ path: `/internal/elp210/business-root-read/${action}`, body: Buffer.from(prepared.body) }]);
      expect(view).toMatchObject({ action, base_body: prepared.base_body, binding_digest: prepared.binding_digest,
        stable_core_digest: prepared.stable_core_digest, response_sha256: HASH(JSON.stringify(expected)), result: expected,
        source_identity_digest: selectedNativeBusinessReadSelection(source).source_identity_digest });
      expect(Object.isFrozen(view)).toBe(true); expect(Object.isFrozen(view.result.binding)).toBe(true);
      expect(view).not.toHaveProperty("held_handle"); expect(view).not.toHaveProperty("release_permitted");
      expect(JSON.parse(view.base_body)).not.toHaveProperty("human_token");
      expect(JSON.parse(view.base_body)).not.toHaveProperty("signed_terminal");
    });

  it.each(["issue", "enter"] as const)("uses actual prepare's exact %s preimage for non-ASCII and UTC microseconds", action => {
    const input = context(); input.binding.subject = "研究者-é"; input.binding.workspace_id = "研究-workspace";
    input.deadline = "2026-10-17T14:00:00.123456+00:00";
    const prepared = prepareNativeBusinessReadRequest(action,
      { schema_version: "pma.native-business-read.request.v1", ...input, human_token: TOKEN }, LIMITS);
    expect(nativeBusinessReadDeliveryDigest(action, input)).toBe(prepared.provider_delivery_digest);
    expect(prepared.unsigned_body).toBe(prepared.base_body);
    expect(JSON.parse(prepared.base_body).deadline).toBe(input.deadline);
    expect(prepared.base_body).toContain("研究者-é");
    expect(nativeBusinessReadDeliveryDigest(action === "issue" ? "enter" : "issue", input)).not.toBe(prepared.provider_delivery_digest);
  });

  it("does not derive result witnesses from a later replaced client prototype", async () => {
    const input = context(), selected = pins(input);
    const lane = await endpoint((_req, response) => json(response, reply("status", input, selected)));
    const spy = vi.spyOn(NativeBusinessReadClient.prototype, "call").mockResolvedValue(reply("unknown", input, selected));
    const source = new SelectedNativeBusinessReadSource(config(lane.origin, input));
    const view = selectedNativeBusinessReadObservation(source, await source.status(input));
    expect(view.result.state).toBe("OBSERVATION"); expect(spy).not.toHaveBeenCalled(); expect(lane.received).toHaveLength(1);
  });

  it("detaches the exact request context synchronously before the first network await", async () => {
    const input = context(), original = copy(input), selected = pins(input);
    const lane = await endpoint((_req, response) => json(response, reply("status", original, selected)));
    const source = new SelectedNativeBusinessReadSource(config(lane.origin, input)), pending = source.status(input);
    input.binding.subject += "-mutated"; input.domain.profile_id += "_MUTATED"; input.deadline = utc(Date.now() - 1);
    const view = selectedNativeBusinessReadObservation(source, await pending);
    expect(JSON.parse(view.base_body)).toEqual({ schema_version: "pma.native-business-read.request.v1", ...original });
    expect(lane.received).toHaveLength(1); expect(JSON.parse(lane.received[0].body.toString())).toEqual(JSON.parse(view.base_body));
  });

  it("rejects copied/cross-source/getter/Proxy carriers and forged source instances without reflection", async () => {
    const input = context(), selected = pins(input);
    const lane = await endpoint((_req, response) => json(response, reply("status", input, selected)));
    const cfg = config(lane.origin, input), source = new SelectedNativeBusinessReadSource(cfg), other = new SelectedNativeBusinessReadSource(cfg);
    const observation = await source.status(input); let traps = 0;
    const getter = {}; Object.defineProperty(getter, "result", { enumerable: true, get() { traps++; throw new Error("PRIVATE_GETTER"); } });
    const proxy = new Proxy(observation, { get() { traps++; throw new Error("PRIVATE_PROXY"); },
      ownKeys() { traps++; throw new Error("PRIVATE_PROXY"); }, getPrototypeOf() { traps++; throw new Error("PRIVATE_PROXY"); } });
    const revoked = Proxy.revocable(observation, {}); revoked.revoke();
    for (const carrier of [{ ...observation }, copy(observation), selectedNativeBusinessReadObservation(source, observation), getter, proxy, revoked.proxy, null])
      expect(() => selectedNativeBusinessReadObservation(source, carrier)).toThrowError(expect.objectContaining({ code: "NATIVE_READ_OBSERVATION_UNVERIFIED" }));
    expect(() => selectedNativeBusinessReadObservation(other, observation)).toThrowError(expect.objectContaining({ code: "NATIVE_READ_OBSERVATION_UNVERIFIED" }));
    for (const fake of [Object.create(SelectedNativeBusinessReadSource.prototype), new Proxy(source, {}), getter, null]) {
      expect(() => selectedNativeBusinessReadSelection(fake)).toThrowError(expect.objectContaining({ code: "NATIVE_READ_INSTANCE_UNVERIFIED" }));
      await expect(SelectedNativeBusinessReadSource.prototype.status.call(fake, input)).rejects.toMatchObject({ code: "NATIVE_READ_INSTANCE_UNVERIFIED" });
    }
    expect(traps).toBe(0); expect(lane.received).toHaveLength(1);
  });

  it.each(["issuer", "subject", "workspace", "environment", "workload", "domain"] as const)(
    "refuses wrong selected %s before opening HTTP", async axis => {
      const input = context(), selected = pins(input);
      const lane = await endpoint((_req, response) => json(response, reply("status", input, selected)));
      const source = new SelectedNativeBusinessReadSource(config(lane.origin, input)), changed = copy(input);
      if (axis === "issuer") changed.binding.human_issuer += ":other";
      if (axis === "subject") changed.binding.subject += "-other";
      if (axis === "workspace") changed.binding.workspace_id += "-other";
      if (axis === "environment") changed.binding.environment = "sandbox";
      if (axis === "workload") changed.binding.workload_id += "-other";
      if (axis === "domain") changed.domain.profile_id += "_OTHER";
      await expect(source.status(changed)).rejects.toMatchObject({ code: "NATIVE_READ_REQUEST_INVALID" }); expect(lane.received).toEqual([]);
    });

  it.each(["human", "mapping", "native-receipt", "native-owner", "source-fingerprint"] as const)(
    "refuses an actual TLS-issued reply with wrong pinned %s", async axis => {
      const input = context(), selected = pins(input), result = reply("issue", input, selected);
      if (result.state !== "ISSUED") throw new Error("TEST_ONLY_ISSUED");
      if (axis === "human") result.human.portal_user_id += "-other";
      if (axis === "mapping") result.human.mapping_revision = `ts-user:${UUID}:10`;
      if (axis === "native-receipt") result.native.receipt_id = "55555555-5555-5555-5555-555555555555";
      if (axis === "native-owner") result.native.owner_mapping_revision = `ts-user:${UUID}:8`;
      if (axis === "source-fingerprint") result.lease.source_fingerprint = "0".repeat(64);
      const lane = await endpoint((_req, response) => json(response, result)), cfg = config(lane.origin, input); cfg.pins = selected;
      await expect(new SelectedNativeBusinessReadSource(cfg).issue(input, TOKEN)).rejects.toMatchObject({ code: "NATIVE_READ_RESPONSE_INVALID" });
      expect(lane.received).toHaveLength(1);
    });

  it("preserves a genuinely earlier issued lease expiry, never extending it to original Base", async () => {
    const input = context(), selected = pins(input), result = reply("issue", input, selected);
    if (result.state !== "ISSUED") throw new Error("TEST_ONLY_ISSUED");
    const earlier = utc(Date.now() + 30000); result.lease.expires_at = earlier;
    const lane = await endpoint((_req, response) => json(response, result)), cfg = config(lane.origin, input); cfg.pins = selected;
    const source = new SelectedNativeBusinessReadSource(cfg), view = selectedNativeBusinessReadObservation(source, await source.issue(input, TOKEN));
    expect(view.result.state === "ISSUED" && view.result.lease.expires_at).toBe(earlier);
    expect(JSON.parse(view.base_body).deadline).toBe(input.deadline); expect(earlier).not.toBe(input.deadline);
  });

  it.each(["past", "deadline", "native"] as const)("refuses issued lease expiry outside actual %s bound", async axis => {
    const input = context(), selected = pins(input);
    if (axis === "native") selected.native.expires_at = utc(Date.now() + 30000);
    const result = reply("issue", input, selected); if (result.state !== "ISSUED") throw new Error("TEST_ONLY_ISSUED");
    result.lease.expires_at = axis === "past" ? utc(Date.now() - 1) : axis === "deadline" ? utc(Date.parse(input.deadline) + 1) : input.deadline;
    const lane = await endpoint((_req, response) => json(response, result)), cfg = config(lane.origin, input); cfg.pins = selected;
    await expect(new SelectedNativeBusinessReadSource(cfg).issue(input, TOKEN)).rejects.toMatchObject({ code: "NATIVE_READ_RESPONSE_INVALID" });
  });

  it.each(["unknown", "status", "cancel-unentered", "resolve"] as const)("keeps exact expired Base for authenticated %s recovery", async action => {
    const old = Date.now() - 300000, input = context(old), selected = pins(input, old);
    const lane = await endpoint((_req, response) => json(response, reply(action, input, selected))), cfg = config(lane.origin, input, old);
    cfg.pins = selected;
    const source = new SelectedNativeBusinessReadSource(cfg), view = selectedNativeBusinessReadObservation(source, await call(source, action, input));
    expect(JSON.parse(view.base_body).deadline).toBe(input.deadline); expect(view.action).toBe(action); expect(lane.received).toHaveLength(1);
    expect(view).not.toHaveProperty("operational_current"); expect(view).not.toHaveProperty("held_handle");
  });

  it.each(["issue", "enter"] as const)("refuses expired %s acquisition before HTTP", async action => {
    const old = Date.now() - 300000, input = context(old), selected = pins(input, old);
    const lane = await endpoint((_req, response) => json(response, reply(action, input, selected))), cfg = config(lane.origin, input, old); cfg.pins = selected;
    await expect(call(new SelectedNativeBusinessReadSource(cfg), action, input)).rejects.toMatchObject({ code: "NATIVE_READ_EXPIRED" });
    expect(lane.received).toEqual([]);
  });

  it.each(["installation", "deadline", "native"] as const)("refuses %s expiry while awaiting already-sent acquisition", async axis => {
    const input = context(), selected = pins(input), entered = deferred(), release = deferred();
    const lane = await endpoint(async (_req, response) => { entered.resolve(); await release.promise; json(response, reply("enter", input, selected)); });
    const cfg = config(lane.origin, input); cfg.pins = selected;
    if (axis === "installation") cfg.installation_expires_at_utc_ms = Date.now() + 30000;
    if (axis === "native") selected.native.expires_at = utc(Date.now() + 30000);
    const expires = axis === "installation" ? cfg.installation_expires_at_utc_ms : Date.parse(axis === "deadline" ? input.deadline : selected.native.expires_at);
    const source = new SelectedNativeBusinessReadSource(cfg), pending = source.enter(input, TOKEN);
    // Handle rejection immediately, so handshake failure is not an unhandled
    // rejection plus an indefinitely awaited acceptance gate.
    const acceptance = Promise.race([entered.promise, pending.then(() => { throw new Error("TEST_ONLY_PREMATURE_REPLY"); })]);
    try {
      await acceptance;
      // Only after actual TLS handshake + HTTP request acceptance, not before.
      const clock = vi.spyOn(Date, "now").mockReturnValue(expires);
      try { release.resolve(); await expect(pending).rejects.toMatchObject({ code: "NATIVE_READ_EXPIRED" }); }
      finally { clock.mockRestore(); }
    } finally { release.resolve(); await pending.catch(() => undefined); }
    expect(lane.received).toHaveLength(1);
  });

  it("captures mutable config/pins/PEM once and keeps source identity independent of local budget/lifetime", async () => {
    const input = context(), selected = pins(input);
    const lane = await endpoint((_req, response) => json(response, reply("status", input, selected)));
    const cfg = config(lane.origin, input); cfg.pins = copy(selected);
    cfg.transport.tls = { ca: Buffer.from(pm.ca), key: Buffer.from(core.key), cert: Buffer.from(core.cert) };
    const source = new SelectedNativeBusinessReadSource(cfg), identity = selectedNativeBusinessReadSelection(source);
    const renewed = config(lane.origin, input); renewed.pins = copy(selected); renewed.installation_expires_at_utc_ms += 50000;
    renewed.transport.deadline_ms = 1000; renewed.transport.max_inflight = 1; renewed.transport.request_bytes = 4096;
    expect(selectedNativeBusinessReadSelection(new SelectedNativeBusinessReadSource(renewed))).toEqual(identity);
    cfg.transport.origin = "https://unapproved.invalid"; cfg.transport.pm_leaf_sha256 = HASH("OTHER");
    for (const value of Object.values(cfg.transport.tls)) if (Buffer.isBuffer(value)) value.fill(0);
    cfg.pins.binding.subject += "-mutated"; cfg.pins.native.revision = "999"; cfg.installation_expires_at_utc_ms = 1;
    const view = selectedNativeBusinessReadObservation(source, await source.status(input));
    expect(view.source_identity_digest).toBe(identity.source_identity_digest); expect(lane.received).toHaveLength(1);
    expect(Object.isFrozen(identity)).toBe(true); expect(Object.isFrozen(identity.native)).toBe(true);
    expect(identity).not.toHaveProperty("tls"); expect(identity).not.toHaveProperty("installation_expires_at_utc_ms");
    const changed = config(lane.origin, input); changed.pins = copy(selected); changed.pins.source_fingerprint = "0".repeat(64);
    expect(selectedNativeBusinessReadSelection(new SelectedNativeBusinessReadSource(changed)).source_identity_digest).not.toBe(identity.source_identity_digest);
  });

  it("refuses configuration/context getters, live or revoked Proxies with zero hooks", async () => {
    const input = context(), cfg = config("https://127.0.0.1:1", input); let traps = 0;
    const handler = { get() { traps++; throw new Error("PRIVATE_GET"); }, ownKeys() { traps++; throw new Error("PRIVATE_KEYS"); },
      getPrototypeOf() { traps++; throw new Error("PRIVATE_PROTO"); } };
    const getter = { ...cfg }; Object.defineProperty(getter, "pins", { enumerable: true, get() { traps++; throw new Error("PRIVATE_PINS"); } });
    const revoked = Proxy.revocable(cfg, handler); revoked.revoke();
    for (const bad of [getter, new Proxy(cfg, handler), revoked.proxy, { ...cfg, pins: new Proxy(cfg.pins, handler) }])
      expect(() => new SelectedNativeBusinessReadSource(bad)).toThrowError(expect.objectContaining({ code: "NATIVE_READ_CONFIG_INVALID" }));
    const source = new SelectedNativeBusinessReadSource(cfg), contextGetter = { ...input };
    Object.defineProperty(contextGetter, "binding", { enumerable: true, get() { traps++; throw new Error("PRIVATE_BINDING"); } });
    for (const bad of [contextGetter, new Proxy(input, handler), { ...input, domain: new Proxy(input.domain, handler) }])
      await expect(source.status(bad)).rejects.toMatchObject({ code: "NATIVE_READ_REQUEST_INVALID" });
    expect(traps).toBe(0);
  });

  it.each(["origin", "leaf", "human", "native", "domain"] as const)("changes source identity when selected %s changes", axis => {
    const input = context(), cfg = config("https://127.0.0.1:1", input), altered = config("https://127.0.0.1:1", input);
    altered.pins = copy(cfg.pins);
    if (axis === "origin") altered.transport.origin = "https://127.0.0.1:2";
    if (axis === "leaf") altered.transport.pm_leaf_sha256 = HASH("TEST_ONLY-other-leaf");
    if (axis === "human") altered.pins.human.portal_user_id += "-other";
    if (axis === "native") altered.pins.native.revision = "2";
    if (axis === "domain") altered.pins.domain.profile_id += "_OTHER";
    expect(selectedNativeBusinessReadSelection(new SelectedNativeBusinessReadSource(altered)).source_identity_digest)
      .not.toBe(selectedNativeBusinessReadSelection(new SelectedNativeBusinessReadSource(cfg)).source_identity_digest);
  });

  it("does not widen v1 scope to the new PM v2 scoped-notice Manager intent", async () => {
    const input = context(), source = new SelectedNativeBusinessReadSource(config("https://127.0.0.1:1", input));
    const future = { ...input, manager_intent: { schema_version: "pma.manager-read-intent.v2", action: "scoped_notice", digest: "a".repeat(64) } };
    await expect(source.status(future as unknown as NativeReadContext)).rejects.toMatchObject({ code: "NATIVE_READ_REQUEST_INVALID" });
  });
});
