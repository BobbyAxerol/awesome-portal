/** Real loopback TLS1.3/mTLS transport proof with ephemeral TEST_ONLY certs.
 * Candidate DB operations alone are mocked. This is NOT installed authority,
 * real human/source crypto, PM COMMIT proof, capacity or commissioning evidence.
 * TEST_ONLY private keys are ephemeral process memory, never fixture files. */
import { createHash, generateKeyPairSync, X509Certificate } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { createServer, request, type Server } from "node:https";
import type { Socket } from "node:net";
import type { ConnectionOptions } from "node:tls";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CurrentHumanCandidate } from "../src/execution-v2/current-human-candidate";
import type { CurrentHumanRecoveryAttempt } from "../src/execution-v2/current-human-mutations";
import { CurrentHumanRecoveryClient } from "../src/execution-v2/current-human-recovery-client";
import { createCurrentHumanTransport } from "../src/execution-v2/current-human-transport";
import { commonName, testCertificate, type TestAuthority } from "./fixtures/elp210-test-certificates";

type Certificate = { key: Buffer; cert: Buffer; ca: Buffer; fingerprint: string };
type Reply = { status: number; body: string };
const enterPath = "/internal/elp210/current-human/enter";
const resolvePath = "/internal/elp210/current-human/resolve";
const enterBody = { schema_version: "pma.current-human-enter.v1", human_token: "TEST_ONLY-human-opaque",
  source_assertion: "TEST_ONLY-source-opaque" };
const binding: CurrentHumanRecoveryAttempt = { lease_id: "TEST_ONLY-lease", attempt_id: "TEST_ONLY-attempt",
  workspace_id: "TEST_ONLY-workspace", environment: "paper", workload_id: "TEST_ONLY-source-workload",
  request_digest: `sha256:${"a".repeat(64)}`, human_issuer: "TEST_ONLY-Core", subject: "TEST_ONLY-human",
  session_id: "TEST_ONLY-session", session_revision: 2, authority_revision: 3, expires_at: 1 };
const recoveryAck = { schema_version: "pma.current-human-recover-ack.v1", lease_id: binding.lease_id,
  attempt_id: binding.attempt_id, phase: "ROLLED_BACK", portal_acknowledged: true };

describe("ELP2-10 private current-human real TLS transport (TEST_ONLY candidate operations)", () => {
  let core: Certificate, source: Certificate, otherCore: Certificate,
    otherSource: Certificate, foreignCore: Certificate, foreignSource: Certificate;
  const allocated: { server: Server; sockets: Set<Socket> }[] = [];

  const authority = (label: string): TestAuthority => {
    const key = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), name = commonName(`TEST_ONLY_${label}`);
    return { key: key.privateKey, name, certificate: testCertificate(name, key, { name, key: key.privateKey }, true) };
  };
  const leaf = (label: string, ca: TestAuthority): Certificate => {
    const key = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const cert = testCertificate(commonName(`TEST_ONLY_${label}`), key, ca, false);
    return { key: Buffer.from(key.privateKey.export({ type: "pkcs8", format: "pem" })), cert, ca: ca.certificate,
      fingerprint: `sha256:${createHash("sha256").update(new X509Certificate(cert).raw).digest("hex")}` };
  };
  const listen = async (server: Server): Promise<string> => {
    const sockets = new Set<Socket>();
    allocated.push({ server, sockets });
    server.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
    server.on("secureConnection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
    server.on("tlsClientError", () => { /* Expected negative TLS lane, no credential logging. */ });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject); server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("TEST_ONLY_LISTEN_REQUIRED");
    return `https://127.0.0.1:${address.port}`;
  };
  const post = (origin: string, identity: Certificate, raw: string | Buffer,
    path = enterPath, headers: Record<string, string> = {}): Promise<Reply> => new Promise((resolve, reject) => {
    const body = Buffer.from(raw);
    const req = request(new URL(path, origin), { method: "POST", key: identity.key, cert: identity.cert, ca: core.ca,
      minVersion: "TLSv1.3", maxVersion: "TLSv1.3", rejectUnauthorized: true, agent: false,
      headers: { "content-type": "application/json", "content-length": String(body.length), "connection": "close", ...headers },
    }, res => {
      const chunks: Buffer[] = [];
      res.on("data", chunk => chunks.push(Buffer.from(chunk)));
      res.on("error", reject);
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }));
    });
    req.on("error", reject);
    req.setTimeout(2000, () => req.destroy(new Error("TEST_ONLY_CLIENT_DEADLINE")));
    req.end(body);
  });
  const transport = (limits: Partial<{ maximum_in_flight: number; request_bytes: number; deadline_ms: number }> = {}) => {
    const enter = vi.fn().mockResolvedValue({ lease_id: binding.lease_id, attempt_id: binding.attempt_id });
    const resolve = vi.fn().mockResolvedValue({ replayed: false, phase: "UNKNOWN" });
    const candidate = { enter, resolve } as unknown as CurrentHumanCandidate;
    return { ...createCurrentHumanTransport(candidate, { tls: { key: core.key, cert: core.cert, ca: core.ca },
      source_certificate_sha256: source.fingerprint,
      limits: { maximum_in_flight: 2, request_bytes: 32768, deadline_ms: 1000, ...limits } }), enter, resolve };
  };
  const recoveryServer = async (certificate: Certificate,
    handler: (req: IncomingMessage, raw: string) => { status?: number; body?: string; neverReply?: boolean } = () => ({ body: JSON.stringify(recoveryAck) })) => {
    let requests = 0, bytes = 0;
    const bodies: string[] = [];
    const server = createServer({ key: certificate.key, cert: certificate.cert, ca: core.ca,
      requestCert: true, rejectUnauthorized: true, minVersion: "TLSv1.3", maxVersion: "TLSv1.3" }, (req, res) => {
      requests++;
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => { bytes += chunk.length; chunks.push(chunk); });
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString(); bodies.push(body);
        const reply = handler(req, body);
        if (reply.neverReply) return;
        res.writeHead(reply.status ?? 200, { "content-type": "application/json", "connection": "close" });
        res.end(reply.body ?? "{}");
      });
    });
    const origin = await listen(server);
    return { origin, server, bodies, requests: () => requests, bytes: () => bytes };
  };
  const recovery = (origin: string, changes: Partial<ConstructorParameters<typeof CurrentHumanRecoveryClient>[0]> = {}) =>
    new CurrentHumanRecoveryClient({ origin, tls: { key: core.key, cert: core.cert, ca: core.ca },
      source_certificate_sha256: source.fingerprint, deadline_ms: 1000, response_bytes: 32768, ...changes });

  beforeAll(() => {
    const trusted = authority("root"), foreign = authority("foreign_root");
    core = leaf("core", trusted); source = leaf("source", trusted);
    otherCore = leaf("other_core", trusted); otherSource = leaf("other_source", trusted);
    foreignCore = leaf("foreign_core", foreign); foreignSource = leaf("foreign_source", foreign);
  }, 15000);
  afterEach(async () => {
    for (const { server, sockets } of allocated.splice(0)) {
      const closing = new Promise<void>(resolve => server.close(() => resolve()));
      for (const socket of sockets) socket.destroy();
      server.closeAllConnections();
      await closing;
    }
  });
  afterAll(() => { for (const identity of [core, source, otherCore, otherSource, foreignCore, foreignSource]) identity?.key.fill(0); });

  it("constructs unbound, then exchanges exact ENTER/UNKNOWN ACKs over real TLS1.3+mTLS", async () => {
    const lane = transport();
    expect(lane.server.listening).toBe(false);
    expect(lane.snapshot().in_flight).toBe(0);
    const origin = await listen(lane.server);
    const entered = await post(origin, source, JSON.stringify(enterBody));
    expect(entered.status).toBe(200);
    expect(JSON.parse(entered.body)).toEqual({ schema_version: "pma.current-human-enter-ack.v1",
      lease_id: binding.lease_id, attempt_id: binding.attempt_id });
    expect(lane.enter).toHaveBeenCalledExactlyOnceWith(enterBody.human_token, enterBody.source_assertion);
    const resolved = await post(origin, source, JSON.stringify({ schema_version: "pma.current-human-resolve.v1",
      source_assertion: "TEST_ONLY-source-opaque" }), resolvePath);
    expect(JSON.parse(resolved.body)).toEqual({ replayed: false, phase: "UNKNOWN" });
    expect(lane.snapshot()).toMatchObject({ in_flight: 0, accepted: 2 });
  });
  it("rejects a foreign-CA source before HTTP/candidate processing", async () => {
    const lane = transport(), origin = await listen(lane.server);
    await expect(post(origin, foreignSource, JSON.stringify(enterBody))).rejects.toThrow();
    expect(lane.enter).not.toHaveBeenCalled(); expect(lane.resolve).not.toHaveBeenCalled();
    expect(lane.snapshot().in_flight).toBe(0);
  });
  it("rejects a CA-valid wrong source leaf before body parsing/DB operation", async () => {
    const lane = transport(), origin = await listen(lane.server);
    await expect(post(origin, otherSource, JSON.stringify(enterBody))).rejects.toThrow();
    expect(lane.enter).not.toHaveBeenCalled(); expect(lane.resolve).not.toHaveBeenCalled();
    expect(lane.snapshot().in_flight).toBe(0);
  });
  it("rejects absent client certificate instead of trusting a peer header", async () => {
    const lane = transport(), origin = await listen(lane.server);
    await expect(post(origin, { ...source, key: Buffer.alloc(0), cert: Buffer.alloc(0) },
      JSON.stringify(enterBody), enterPath, { "x-forwarded-client-cert": source.fingerprint })).rejects.toThrow();
    expect(lane.enter).not.toHaveBeenCalled();
  });
  it("rejects malformed UTF8/JSON, extra fields and duplicate keys before candidate calls", async () => {
    const lane = transport(), origin = await listen(lane.server);
    const duplicate = '{"schema_version":"pma.current-human-enter.v1","human_token":"FIRST",'
      + '"human_token":"SECOND","source_assertion":"TEST_ONLY-source"}';
    const escapedDuplicate = '{"schema_version":"pma.current-human-enter.v1","human_token":"FIRST",'
      + '"human_\\u0074oken":"SECOND","source_assertion":"TEST_ONLY-source"}';
    for (const raw of ["{", Buffer.from([0xff]), JSON.stringify({ ...enterBody, extra: true }), duplicate, escapedDuplicate]) {
      expect((await post(origin, source, raw)).status).toBe(400);
    }
    expect(lane.enter).not.toHaveBeenCalled(); expect(lane.snapshot().in_flight).toBe(0);
  });
  it("rejects oversize declared body and does not begin an authority operation", async () => {
    const lane = transport({ request_bytes: 256 }), origin = await listen(lane.server);
    expect((await post(origin, source, JSON.stringify({ ...enterBody, human_token: "x".repeat(257) }))).status).toBe(413);
    expect(lane.enter).not.toHaveBeenCalled(); expect(lane.snapshot().in_flight).toBe(0);
  });
  it("rejects unknown paths/content encoding without fallback or authority calls", async () => {
    const lane = transport(), origin = await listen(lane.server);
    expect((await post(origin, source, JSON.stringify(enterBody), "/internal/other")).status).toBe(404);
    expect((await post(origin, source, JSON.stringify(enterBody), enterPath, { "content-encoding": "gzip" })).status).toBe(400);
    expect(lane.enter).not.toHaveBeenCalled();
  });
  it("keeps quota after lost deadline ACK until the underlying operation actually completes", async () => {
    const lane = transport({ maximum_in_flight: 1, deadline_ms: 400 });
    let terminal!: (value: { lease_id: string; attempt_id: string }) => void;
    lane.enter.mockImplementation(() => new Promise(resolve => { terminal = resolve; }));
    const origin = await listen(lane.server);
    const first = post(origin, source, JSON.stringify(enterBody));
    try {
      await expect.poll(() => lane.enter.mock.calls.length).toBe(1);
      expect((await post(origin, source, JSON.stringify(enterBody))).status).toBe(503);
      expect((await first).status).toBe(504);
      expect(lane.snapshot()).toMatchObject({ in_flight: 1, timed_out: 1 });
    } finally { terminal?.({ lease_id: binding.lease_id, attempt_id: binding.attempt_id }); }
    await expect.poll(() => lane.snapshot().in_flight).toBe(0);
    expect(lane.enter).toHaveBeenCalledTimes(1);
  });
  it("releases a disconnected partial-upload slot without starting candidate/pretending rollback", async () => {
    const lane = transport({ deadline_ms: 1000 }), origin = await listen(lane.server);
    const req = request(new URL(enterPath, origin), { method: "POST", agent: false,
      key: source.key, cert: source.cert, ca: core.ca, minVersion: "TLSv1.3", maxVersion: "TLSv1.3",
      headers: { "content-type": "application/json", "content-length": "100" } });
    req.on("error", () => { /* Exact owned aborted upload. */ });
    req.write("{");
    await expect.poll(() => lane.snapshot().in_flight).toBe(1);
    req.destroy();
    await expect.poll(() => lane.snapshot().in_flight).toBe(0);
    expect(lane.enter).not.toHaveBeenCalled(); expect(lane.resolve).not.toHaveBeenCalled();
  });

  it("recovery client sends the exact token-free attempt and preserves UNKNOWN ACK", async () => {
    const lane = await recoveryServer(source, (req, raw) => {
      expect(req.url).toBe("/internal/elp210/current-human/recover");
      expect(req.method).toBe("POST");
      expect(JSON.parse(raw)).toEqual({ schema_version: "pma.current-human-recover.v1", attempt: binding });
      return { body: JSON.stringify({ ...recoveryAck, phase: "UNKNOWN", portal_acknowledged: true }) };
    });
    expect(await recovery(lane.origin).recover(binding)).toEqual({ ...recoveryAck, phase: "UNKNOWN", portal_acknowledged: true });
    expect(lane.requests()).toBe(1); expect(lane.bodies[0]).not.toContain("human_token");
  });
  it("recovery wrong server CA rejects before any HTTP headers or attempt bytes reach peer", async () => {
    const lane = await recoveryServer(foreignSource);
    await expect(recovery(lane.origin, { source_certificate_sha256: foreignSource.fingerprint }).recover(binding))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_RECOVERY_UNAVAILABLE" });
    expect(lane.requests()).toBe(0); expect(lane.bytes()).toBe(0);
  });
  it("recovery CA-valid wrong server leaf rejects before any HTTP headers or attempt bytes", async () => {
    const lane = await recoveryServer(otherSource);
    await expect(recovery(lane.origin).recover(binding)).rejects.toMatchObject({ code: "CURRENT_HUMAN_RECOVERY_UNAVAILABLE" });
    expect(lane.requests()).toBe(0); expect(lane.bytes()).toBe(0);
  });
  it("recovery independently requires an accepted client CA, not just server pinning", async () => {
    const lane = await recoveryServer(source);
    await expect(recovery(lane.origin, { tls: { key: foreignCore.key, cert: foreignCore.cert, ca: core.ca } }).recover(binding))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_RECOVERY_UNAVAILABLE" });
    expect(lane.requests()).toBe(0); expect(lane.bytes()).toBe(0);
  });
  it("recovery rejects mismatched ACK correlation, duplicate keys and malformed JSON", async () => {
    for (const body of [JSON.stringify({ ...recoveryAck, lease_id: "OTHER" }), "{",
      JSON.stringify({ ...recoveryAck, extra: true }),
      JSON.stringify(recoveryAck).replace('"phase":"ROLLED_BACK"', '"phase":"UNKNOWN","phase":"ROLLED_BACK"')]) {
      const lane = await recoveryServer(source, () => ({ body }));
      await expect(recovery(lane.origin).recover(binding)).rejects.toMatchObject({ code: "CURRENT_HUMAN_RECOVERY_UNAVAILABLE" });
      expect(lane.requests()).toBe(1);
    }
  });
  it("recovery bounds response bytes, refuses redirects and never retries a new request", async () => {
    for (const response of [{ body: "x".repeat(257) }, { status: 307, body: JSON.stringify(recoveryAck) }]) {
      const lane = await recoveryServer(source, () => response);
      await expect(recovery(lane.origin, { response_bytes: 256 }).recover(binding))
        .rejects.toMatchObject({ code: "CURRENT_HUMAN_RECOVERY_UNAVAILABLE" });
      expect(lane.requests()).toBe(1);
    }
  });
  it("recovery deadline closes a nonresponding peer and leaves outcome unavailable", async () => {
    const lane = await recoveryServer(source, () => ({ neverReply: true }));
    await expect(recovery(lane.origin, { deadline_ms: 150 }).recover(binding))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_RECOVERY_UNAVAILABLE" });
    expect(lane.requests()).toBe(1);
  });
  it("recovery rejects HTTP and credential-bearing origins before creating a listener/client request", () => {
    for (const origin of ["http://127.0.0.1:1", "https://user:password@127.0.0.1:1", "https://127.0.0.1:1/other"])
      expect(() => recovery(origin)).toThrow();
    // Wrong-leaf certificates are distinct despite sharing the same issuing CA.
    expect(otherCore.fingerprint).not.toBe(core.fingerprint);
  });
});
