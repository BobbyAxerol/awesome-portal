/** TEST_ONLY loopback TLS1.3/mTLS; authority methods mocked. Does not prove
 * live Portal/Edge/PM authority, source publication or commissioned runtime. */
import { createHash, generateKeyPairSync, X509Certificate } from "node:crypto";
import { request, type Server } from "node:https";
import type { Duplex } from "node:stream";
import { connect as connectTls } from "node:tls";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CurrentViewAuthorityError, type CurrentViewDecision } from "../src/execution-v2/current-view-authority";
import { createCurrentViewTransport } from "../src/execution-v2/current-view-transport";
import { commonName, testCertificate, type TestAuthority } from "./fixtures/elp210-test-certificates";

const digest = `sha256:${"a".repeat(64)}`;
const body = { schema_version: "portal.execution.current-view-resolve.v1", original_context: "T".repeat(43),
  workload_id: "TEST_ONLY-edge", operation: "CURRENT", resource_ref: "TEST_ONLY-account" };
const decision: CurrentViewDecision = { schema_version: "portal.execution.current-view-decision.v1",
  context_digest: digest, decision_digest: digest, workload_digest: digest, principal_digest: digest, session_digest: digest,
  operation: "CURRENT", workspace_id: "TEST_ONLY-workspace", environment: "paper", profile_id: "TEST_ONLY-profile",
  resource_ref: body.resource_ref, resource: { kind: "ACCOUNT", id: "TEST_ONLY-account" }, policy_revision: "TEST_ONLY-policy",
  field_policy_ref: "TEST_ONLY-fields", whole_population: false,
  dataset_binding: { dataset_id: "TEST_ONLY-dataset", source_revision: "TEST_ONLY-revision", window: null },
  allowed_tuples: [], resources: [{ kind: "ACCOUNT", id: "TEST_ONLY-account" }], fields: ["equity"], detail_fields: [],
  expires_at_ms: Date.now() + 30_000 };
type Identity = { key: Buffer; cert: Buffer; ca: Buffer; pin: string };

describe("current-view private transport (TEST_ONLY)", () => {
  let core: Identity, edge: Identity, foreign: Identity;
  const allocated: { server: Server; sockets: Set<Duplex> }[] = [];
  beforeAll(() => {
    const key = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), name = commonName("TEST_ONLY-ca");
    const ca: TestAuthority = { key: key.privateKey, name, certificate: testCertificate(name, key, { name, key: key.privateKey }, true) };
    const identity = (label: string): Identity => {
      const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
      const cert = testCertificate(commonName(label), pair, ca, false);
      return { key: Buffer.from(pair.privateKey.export({ type: "pkcs8", format: "pem" })), cert, ca: ca.certificate,
        pin: `sha256:${createHash("sha256").update(new X509Certificate(cert).raw).digest("hex")}` };
    };
    core = identity("TEST_ONLY-core"); edge = identity("TEST_ONLY-edge"); foreign = identity("TEST_ONLY-foreign");
  });
  afterEach(async () => {
    for (const { server, sockets } of allocated.splice(0)) {
      for (const socket of sockets) socket.destroy();
      if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
  async function start(overrides: Partial<{ deadline_ms: number; maximum_in_flight: number; dns_name: string; response_bytes: number }> = {}) {
    const resolve = vi.fn().mockResolvedValue(decision), recheck = vi.fn().mockResolvedValue(decision);
    const transport = createCurrentViewTransport({ resolve, recheck }, {
      tls: { key: core.key, cert: core.cert, ca: core.ca },
      peer: { certificate_sha256: edge.pin, dns_name: overrides.dns_name ?? "localhost", workload_id: body.workload_id },
      limits: { maximum_in_flight: overrides.maximum_in_flight ?? 2, request_bytes: 8192,
        response_bytes: overrides.response_bytes ?? 65536, deadline_ms: overrides.deadline_ms ?? 1000 },
    });
    const sockets = new Set<Duplex>();
    allocated.push({ server: transport.server, sockets });
    transport.server.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
    transport.server.on("secureConnection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
    transport.server.on("tlsClientError", () => undefined);
    await new Promise<void>((resolve, reject) => {
      transport.server.once("error", reject);
      transport.server.listen(0, "127.0.0.1", () => { transport.server.off("error", reject); resolve(); });
    });
    const address = transport.server.address();
    if (!address || typeof address === "string") throw new Error("TEST_ONLY_ADDRESS_REQUIRED");
    return { ...transport, resolve, recheck, origin: `https://127.0.0.1:${address.port}` };
  }
  const post = (origin: string, raw: string = JSON.stringify(body), path = "/internal/elp210/current-view/resolve",
    identity?: Identity, headers: Record<string, string> = {}) => new Promise<{ status: number; body: string }>((resolve, reject) => {
    const cert = identity ?? edge;
    const req = request(new URL(path, origin), { key: cert.key, cert: cert.cert, ca: core.ca, agent: false,
      method: "POST", rejectUnauthorized: true, minVersion: "TLSv1.3", maxVersion: "TLSv1.3",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(raw), ...headers },
    }, res => {
      const chunks: Buffer[] = [];
      res.on("data", chunk => chunks.push(Buffer.from(chunk)));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }));
      res.on("error", reject);
    });
    req.on("error", reject); req.setTimeout(2000, () => req.destroy(new Error("TEST_ONLY_DEADLINE"))); req.end(raw);
  });
  it("resolve and recheck bind exact original context and do not echo token", async () => {
    const t = await start();
    const resolved = await post(t.origin);
    expect(resolved.status).toBe(200);
    expect(JSON.parse(resolved.body)).toEqual(decision);
    expect(resolved.body).not.toContain(body.original_context);
    const checked = await post(t.origin, JSON.stringify({ ...body,
      schema_version: "portal.execution.current-view-recheck.v1", decision_digest: digest }), "/internal/elp210/current-view/recheck");
    expect(checked.status).toBe(200); expect(t.recheck).toHaveBeenCalledOnce();
    expect(t.snapshot()).toMatchObject({ in_flight: 0, accepted: 2 });
  });
  it.each([
    ["duplicate", JSON.stringify(body).replace('"CURRENT"', '"CURRENT","operation":"EXPORT"')],
    ["actor injection", JSON.stringify({ ...body, actor_id: "TEST_ONLY-other" })],
    ["unknown operation", JSON.stringify({ ...body, operation: "ADMIN" })],
    ["wrong version", JSON.stringify({ ...body, schema_version: "portal.execution.current-view-resolve.v2" })],
    ["malformed", "{bad"],
  ])("refuses %s before authority I/O", async (_name, raw) => {
    const t = await start(); const response = await post(t.origin, raw);
    expect(response.status).toBe(400); expect(t.resolve).not.toHaveBeenCalled();
  });
  it("authenticates workload independently of the original human", async () => {
    const t = await start(); const response = await post(t.origin, JSON.stringify({ ...body, workload_id: "TEST_ONLY-other" }));
    expect(response.status).toBe(403); expect(t.resolve).not.toHaveBeenCalled();
  });
  it("disconnects CA-valid unpinned peer before authority I/O", async () => {
    const t = await start(); await expect(post(t.origin, undefined, undefined, foreign)).rejects.toThrow();
    expect(t.resolve).not.toHaveBeenCalled();
  });
  it("requires exact DNS SAN even with a pinned certificate", async () => {
    const t = await start({ dns_name: "wrong.test" }); await expect(post(t.origin)).rejects.toThrow();
    expect(t.resolve).not.toHaveBeenCalled();
  });
  it("refuses decompression/oversized input and never logs source prose", async () => {
    const t = await start();
    expect((await post(t.origin, JSON.stringify(body), undefined, undefined, { "content-encoding": "gzip" })).status).toBe(400);
    expect((await post(t.origin, " ".repeat(8193))).status).toBe(413);
    t.resolve.mockRejectedValueOnce(new Error("TEST_ONLY-sensitive-sql-cookie"));
    const error = await post(t.origin); expect(error.status).toBe(503);
    expect(error.body).not.toContain("sensitive");
  });
  it("preserves typed authority error without disclosing message", async () => {
    const t = await start(); t.resolve.mockRejectedValueOnce(new CurrentViewAuthorityError("CURRENT_VIEW_CONTEXT_EXPIRED", 409));
    const response = await post(t.origin); expect(response.status).toBe(409);
    expect(JSON.parse(response.body).code).toBe("CURRENT_VIEW_CONTEXT_EXPIRED");
  });
  it.each(["idle", "partial headers"] as const)("closes an authenticated TLS peer with %s at the pre-header deadline", async mode => {
    const t = await start({ deadline_ms: 100 });
    const address = new URL(t.origin);
    let secured = false, securedAt = 0, elapsed = 0;
    await new Promise<void>((resolve, reject) => {
      const socket = connectTls({ host: address.hostname, port: Number(address.port),
        key: edge.key, cert: edge.cert, ca: core.ca, rejectUnauthorized: true,
        minVersion: "TLSv1.3", maxVersion: "TLSv1.3" }, () => {
        secured = true; securedAt = performance.now();
        if (mode === "partial headers") {
          socket.write("POST /internal/elp210/current-view/resolve HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\n");
        }
      });
      const guard = setTimeout(() => {
        socket.destroy(); reject(new Error("TEST_ONLY_PREHEADER_DEADLINE_NOT_ENFORCED"));
      }, 2000);
      socket.once("error", reject);
      socket.once("close", () => {
        clearTimeout(guard); elapsed = performance.now() - securedAt; resolve();
      });
    });
    expect(secured).toBe(true);
    expect(elapsed).toBeLessThan(1500);
    expect(t.resolve).not.toHaveBeenCalled(); expect(t.recheck).not.toHaveBeenCalled();
    expect(t.snapshot()).toMatchObject({ timed_out: 1, accepted: 0, in_flight: 0 });
    // Expired pre-header sockets do not consume/release any DB request slot.
    expect((await post(t.origin)).status).toBe(200);
  });
  it("does not release quota on timeout while underlying operation is running", async () => {
    const t = await start({ deadline_ms: 80, maximum_in_flight: 1 });
    let finish!: (value: CurrentViewDecision) => void;
    t.resolve.mockImplementationOnce(() => new Promise<CurrentViewDecision>(resolve => { finish = resolve; }));
    expect((await post(t.origin)).status).toBe(504);
    expect(t.snapshot().in_flight).toBe(1);
    expect((await post(t.origin)).status).toBe(503);
    finish(decision);
    await vi.waitFor(() => expect(t.snapshot().in_flight).toBe(0));
    expect(t.snapshot().accepted).toBe(0);
  });
  it("refuses malformed and oversized authority responses rather than truncating", async () => {
    const t = await start({ response_bytes: 256 });
    expect((await post(t.origin)).status).toBe(503);
    t.resolve.mockResolvedValueOnce({ ...decision, accidental_token: body.original_context });
    const response = await post(t.origin); expect(response.status).toBe(503);
    expect(response.body).not.toContain(body.original_context);
  });
  it("refuses late microtask completion even before its timer callback runs", async () => {
    const t = await start({ deadline_ms: 40 });
    t.resolve.mockImplementationOnce(async () => {
      const until = performance.now() + 60;
      while (performance.now() < until) { /* TEST_ONLY event-loop starvation. */ }
      return decision;
    });
    expect((await post(t.origin)).status).toBe(504); expect(t.snapshot().accepted).toBe(0);
  });
  it("never discloses an already expired context returned by a faulty dependency", async () => {
    const t = await start(); t.resolve.mockResolvedValueOnce({ ...decision, expires_at_ms: 1 });
    expect((await post(t.origin)).status).toBe(409);
  });
});
