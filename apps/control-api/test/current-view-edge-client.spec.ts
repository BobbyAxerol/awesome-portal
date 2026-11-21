/** TEST_ONLY real loopback TLS1.3/mTLS. Synthetic authority methods exercise
 * custody/transport ordering; not installed provider or connected acceptance. */
import { createHash, generateKeyPairSync, X509Certificate } from "node:crypto";
import { createServer, type Server } from "node:https";
import type { Duplex } from "node:stream";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { CurrentViewAuthority, CurrentViewDecision, CurrentViewOperation, CurrentViewRegistration, CurrentViewSelection } from "../src/execution-v2/current-view-authority";
import { CurrentViewAuthorityError } from "../src/execution-v2/current-view-authority";
import { CurrentViewEdgeClient, type CurrentViewEdgeClientConfig, type SelectedCurrentViewEdgeRead } from "../src/execution-v2/current-view-edge-client";
import type { ReadScopePrincipal } from "../src/execution-v2/read-scope";
import { commonName, testCertificate, type TestAuthority } from "./fixtures/elp210-test-certificates";

type Identity = { key: Buffer; cert: Buffer; ca: Buffer; pin: string };
const token = "T".repeat(43), digest = `sha256:${"a".repeat(64)}`;
const selected: SelectedCurrentViewEdgeRead = { authority: { resource_ref: "accounts",
  binding: { environment: "paper", profileId: "TEST_ONLY-profile" },
  read_requirement: { action: "account.read", resource: { kind: "ACCOUNT", id: "TEST_ONLY-account" },
    dataset: { dataset_id: "TEST_ONLY-dataset", source_revision: "TEST_ONLY-revision", window: null } }, fields: ["equity"] },
  resource: "accounts", query: { limit: 200, max_bytes: 4096, entity_id: "TEST_ONLY-account" } };
const principal = { user: { userId: "TEST_ONLY-user" }, session: { sessionId: "TEST_ONLY-session", sessionVersion: 7 },
  workspaceId: "TEST_ONLY-workspace" } as ReadScopePrincipal;

describe("Core→Edge finite current-view client (TEST_ONLY)", () => {
  let core: Identity, edge: Identity, other: Identity;
  const servers: { server: Server; sockets: Set<Duplex> }[] = [];
  beforeAll(() => {
    const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), name = commonName("TEST_ONLY-ca");
    const ca: TestAuthority = { key: pair.privateKey, name, certificate: testCertificate(name, pair, { key: pair.privateKey, name }, true) };
    const identity = (label: string) => {
      const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), cert = testCertificate(commonName(label), keys, ca, false);
      return { key: Buffer.from(keys.privateKey.export({ type: "pkcs8", format: "pem" })), cert, ca: ca.certificate,
        pin: `sha256:${createHash("sha256").update(new X509Certificate(cert).raw).digest("hex")}` };
    };
    core = identity("TEST_ONLY-core"); edge = identity("TEST_ONLY-edge"); other = identity("TEST_ONLY-other");
  });
  afterEach(async () => {
    for (const { server, sockets } of servers.splice(0)) {
      sockets.forEach(socket => socket.destroy());
      if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
  async function start(options: { deadline?: number; capacity?: number; pin?: string; dns?: string; bytes?: number;
    handler?: Parameters<typeof createServer>[1] } = {}) {
    const requests: { url: string; headers: Record<string, unknown>; protocol: string | null; authorized: boolean }[] = [];
    const server = createServer({ ...edge, requestCert: true, rejectUnauthorized: true, minVersion: "TLSv1.3", maxVersion: "TLSv1.3" }, (req, res) => {
      const socket = req.socket as import("node:tls").TLSSocket;
      requests.push({ url: req.url!, headers: req.headers, protocol: socket.getProtocol(), authorized: socket.authorized });
      if (options.handler) { options.handler(req, res); return; }
      const body = JSON.stringify({ TEST_ONLY: true, equity: "12.3" });
      res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body), connection: "close" }); res.end(body);
    });
    const sockets = new Set<Duplex>(); servers.push({ server, sockets });
    server.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
    server.on("tlsClientError", () => undefined);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
    });
    const address = server.address(); if (!address || typeof address === "string") throw new Error("TEST_ONLY-address");
    let active = false;
    const release = vi.fn(() => { active = false; });
    const authority = {
      withOriginalContext: vi.fn(async (_principal: ReadScopePrincipal, _workload: string, _selection: CurrentViewSelection,
        _operation: CurrentViewOperation, use: (registration: CurrentViewRegistration) => Promise<unknown>) => {
        active = true;
        try { return await use({ original_context: token, context_digest: digest, expires_at_ms: Date.now() + 60_000 }); }
        finally { release(); }
      }),
      resolve: vi.fn(async () => { expect(active).toBe(true); return { decision_digest: digest } as CurrentViewDecision; }),
      deliver: vi.fn(async (_binding: unknown, read: (scope: unknown) => Promise<unknown>) => { expect(active).toBe(true); return read({}); }),
    };
    const config: CurrentViewEdgeClientConfig = { origin: `https://127.0.0.1:${address.port}`, tls: core,
      peer: { certificate_sha256: options.pin ?? edge.pin, dns_name: options.dns ?? "localhost" },
      limits: { maximum_in_flight: options.capacity ?? 2, deadline_ms: options.deadline ?? 1000, response_bytes: options.bytes ?? 8192 } };
    const client = new CurrentViewEdgeClient(authority as unknown as Pick<CurrentViewAuthority, "withOriginalContext" | "resolve" | "deliver">, config);
    const read = (operation: CurrentViewOperation = "CURRENT", source = selected, signal?: AbortSignal) => client.read(principal, "TEST_ONLY-workload", source, operation, signal);
    return { client, config, requests, authority, read, release };
  }

  it.each(["CURRENT", "HISTORY", "EXPORT"] as const)("fully reads %s with original custody, no browser credential and final current fence", async operation => {
    const f = await start(); const result = await f.read(operation);
    expect(result.status).toBe(200); expect(JSON.parse(result.body.toString())).toEqual({ TEST_ONLY: true, equity: "12.3" });
    expect(f.requests).toHaveLength(1);
    expect(f.requests[0]).toMatchObject({ protocol: "TLSv1.3", authorized: true, headers: { authorization: `Bearer ${token}` } });
    expect(f.requests[0].url).toBe(`/internal/v2/scoped/accounts/${operation === "CURRENT" ? "query" : operation.toLowerCase()}?limit=200&max_bytes=4096&entity_id=TEST_ONLY-account`);
    expect(f.requests[0].headers).not.toHaveProperty("cookie"); expect(JSON.stringify(f.requests)).not.toContain("TEST_ONLY-session");
    expect(f.authority.deliver).toHaveBeenCalledWith(expect.objectContaining({ operation, decision_digest: digest, original_context: token }), expect.any(Function));
    expect(f.release).toHaveBeenCalledOnce(); expect(f.client.snapshot()).toEqual({ in_flight: 0 });
  });
  it.each(["STREAM", "REPLAY"] as const)("does not masquerade %s as a finite operation", async operation => {
    const f = await start(); await expect(f.read(operation)).rejects.toMatchObject({ code: "CURRENT_VIEW_EDGE_OPERATION_NOT_FINITE" });
    expect(f.authority.withOriginalContext).not.toHaveBeenCalled(); expect(f.requests).toHaveLength(0);
  });
  it("fails closed on unpinned or wrong-SAN server before sending the original context", async () => {
    for (const options of [{ pin: other.pin }, { dns: "wrong.test" }]) {
      const f = await start(options); await expect(f.read()).rejects.toMatchObject({ code: "CURRENT_VIEW_EDGE_UNAVAILABLE" });
      expect(f.requests).toHaveLength(0); expect(f.authority.deliver).toHaveBeenCalledOnce(); expect(f.release).toHaveBeenCalledOnce();
    }
  });
  it("never follows redirects or leaks private upstream prose, and final-checks held errors", async () => {
    const f = await start({ handler: (_req, res) => { res.writeHead(302, { location: "https://example.invalid/private" }); res.end("TEST_ONLY-private-driver-cookie"); } });
    await expect(f.read()).rejects.toMatchObject({ code: "CURRENT_VIEW_EDGE_UNAVAILABLE", message: "The selected Execution read is unavailable." });
    expect(f.requests).toHaveLength(1); expect(f.authority.deliver).toHaveBeenCalledOnce(); expect(f.release).toHaveBeenCalledOnce();
  });
  it("revocation after upstream I/O wins over both a body and a held source error", async () => {
    for (const handler of [undefined, ((_req, res) => { res.writeHead(503); res.end(); }) as Parameters<typeof createServer>[1]]) {
      const f = await start({ handler });
      f.authority.deliver.mockRejectedValueOnce(new CurrentViewAuthorityError("CURRENT_VIEW_AUTHORITY_CHANGED", 409));
      await expect(f.read()).rejects.toMatchObject({ code: "CURRENT_VIEW_AUTHORITY_CHANGED" }); expect(f.release).toHaveBeenCalledOnce();
    }
  });
  it.each([
    { "content-type": "application/json", "content-length": "5000" },
    { "content-type": "application/json", "content-encoding": "gzip", "content-length": "2" },
    { "content-type": "text/plain", "content-length": "2" },
  ])("refuses unsafe framing without returning partial bytes", async headers => {
    const f = await start({ handler: (_req, res) => { res.writeHead(200, headers); res.end("{}"); } });
    await expect(f.read()).rejects.toMatchObject({ code: "CURRENT_VIEW_EDGE_UNAVAILABLE" }); expect(f.authority.deliver).toHaveBeenCalledOnce();
  });
  it("refuses malformed UTF8/JSON, not a successful empty document", async () => {
    for (const raw of [Buffer.from("{bad}"), Buffer.from([0xff])]) {
      const f = await start({ handler: (_req, res) => { res.writeHead(200, { "content-type": "application/json", "content-length": raw.length }); res.end(raw); } });
      await expect(f.read()).rejects.toMatchObject({ code: "CURRENT_VIEW_EDGE_UNAVAILABLE" }); expect(f.release).toHaveBeenCalledOnce();
    }
  });
  it("holds capacity through pending registration even after deadline; does not start late I/O", async () => {
    const f = await start({ capacity: 1, deadline: 40 });
    let unblock!: () => void; const wait = new Promise<void>(resolve => { unblock = resolve; });
    const original = f.authority.withOriginalContext.getMockImplementation()!;
    f.authority.withOriginalContext.mockImplementationOnce(async (...args) => { await wait; return original(...args); });
    const pending = f.read(); const rejected = expect(pending).rejects.toMatchObject({ code: "CURRENT_VIEW_EDGE_DEADLINE" });
    await new Promise(resolve => setTimeout(resolve, 70));
    expect(f.client.snapshot()).toEqual({ in_flight: 1 }); await expect(f.read()).rejects.toMatchObject({ code: "CURRENT_VIEW_EDGE_BUSY" });
    unblock(); await rejected; expect(f.requests).toHaveLength(0); expect(f.release).toHaveBeenCalledOnce();
  });
  it("deadline and explicit abort destroy the physical read, final-check and clean the same custody", async () => {
    for (const aborted of [false, true]) {
      const f = await start({ deadline: 200, handler: () => undefined }), controller = new AbortController();
      const pending = f.read("CURRENT", selected, controller.signal);
      const rejected = expect(pending).rejects.toMatchObject({ code: aborted ? "CURRENT_VIEW_EDGE_ABORTED" : "CURRENT_VIEW_EDGE_DEADLINE" });
      await vi.waitFor(() => expect(f.requests).toHaveLength(1));
      if (aborted) controller.abort(); await rejected;
      expect(f.authority.deliver).toHaveBeenCalledOnce(); expect(f.release).toHaveBeenCalledOnce(); expect(f.client.snapshot().in_flight).toBe(0);
    }
  });
  it("does not let delayed microtasks return a body beyond the absolute monotonic deadline", async () => {
    const f = await start({ deadline: 100 });
    f.authority.deliver.mockImplementationOnce(async (_input, read) => {
      const held = await read({}); const until = performance.now() + 130;
      while (performance.now() < until) { /* TEST_ONLY event-loop starvation. */ } return held;
    });
    await expect(f.read()).rejects.toMatchObject({ code: "CURRENT_VIEW_EDGE_DEADLINE" }); expect(f.release).toHaveBeenCalledOnce();
  });
  it("rejects arbitrary origins, resource traversal, unknown query keys and unsafe bounds before authority/network", async () => {
    const f = await start();
    for (const origin of ["http://localhost", `${f.config.origin}/path`, "https://user:password@localhost", `${f.config.origin}?q=x`])
      expect(() => new CurrentViewEdgeClient(f.authority as unknown as CurrentViewAuthority, { ...f.config, origin })).toThrow("unavailable");
    for (const source of [{ ...selected, resource: "../admin" }, { ...selected, resource: "portfolios" },
      { ...selected, query: { ...selected.query, sql: "select-secret" } },
      { ...selected, query: { ...selected.query, max_bytes: 100_000 } }, { ...selected, query: { ...selected.query, from_ms: NaN } },
      { ...selected, query: { ...selected.query, from_ms: -1 } },
      { ...selected, query: { ...selected.query, from_ms: 3, to_ms: 2 } }])
      await expect(f.read("CURRENT", source)).rejects.toMatchObject({ code: "CURRENT_VIEW_EDGE_INPUT_INVALID" });
    expect(f.authority.resolve).not.toHaveBeenCalled(); expect(f.requests).toHaveLength(0);
  });
});
