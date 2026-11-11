/** TEST_ONLY private TLS1.3/mTLS with a mocked issuer. These tests do NOT
 * prove financial-source acceptance, real user authority or installed runtime. */
import { createHash, generateKeyPairSync, X509Certificate } from "node:crypto";
import { request, type Server } from "node:https";
import type { ClientRequest, IncomingHttpHeaders } from "node:http";
import type { Duplex } from "node:stream";
import { connect as connectTls } from "node:tls";
import { performance } from "node:perf_hooks";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FinancialSourceAssertionError } from "../src/execution-v2/financial-source-assertion";
import { createFinancialSourceAssertionTransport,createFinancialSourceAssertionTestCustodyTransport,
  type FinancialSourceAssertionTransportConfig } from "../src/execution-v2/financial-source-assertion-transport";
import { pmHttpRequestDigest } from "../src/execution-v2/pm-http-request-binding";
import { commonName, testCertificate, type TestAuthority } from "./fixtures/elp210-test-certificates";

const route = "/internal/elp210/financial-source/assertion";
const token = "T".repeat(43), digest = `sha256:${"a".repeat(64)}`;
const path = "/financial/dataset", financialBody = '{"TEST_ONLY_exact_decimal":"1.2300"}';
const body = { schema_version: "portal.execution.financial-source-assertion-request.v1", binding_digest: digest,
  receiver_id: "research-edge", workload_id: "edge-financial-source", method: "POST", path,
  delivery_sequence: 0, previous_lease_id: null,
  body_utf8: financialBody, request_digest: pmHttpRequestDigest({ method: "POST", raw_path: Buffer.from(path),
    query_string: Buffer.alloc(0), body: Buffer.from(financialBody) }, { request_bytes: 2_129_920 }) };
const response = () => { const now = Date.now(); return { schema_version: "portal.execution.financial-source-assertion-response.v1",
  binding_digest: body.binding_digest, receiver_id: body.receiver_id, workload_id: body.workload_id,
  method: "POST", path: body.path, request_digest: body.request_digest, assertion: "TEST_ONLY-private-assertion",
  delivery_sequence: 0, previous_lease_id: null,
  lease_id: "TEST_ONLY-lease", issued_at_ms: now, expires_at_ms: now + 30_000,
  authority_revision: 1 }; };
type Identity = { key: Buffer; cert: Buffer; ca: Buffer; pin: string };
type Exchange = { status: number; body: string; headers: IncomingHttpHeaders };

describe("financial source assertion private transport (TEST_ONLY)", () => {
  let core: Identity, edge: Identity, foreign: Identity;
  const allocated: { server: Server; sockets: Set<Duplex> }[] = [];
  beforeAll(() => {
    const key = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), name = commonName("TEST_ONLY-assertion-ca");
    const ca: TestAuthority = { key: key.privateKey, name, certificate: testCertificate(name, key, { name, key: key.privateKey }, true) };
    const identity = (label: string): Identity => {
      const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
      const cert = testCertificate(commonName(label), pair, ca, false);
      return { key: Buffer.from(pair.privateKey.export({ type: "pkcs8", format: "pem" })), cert, ca: ca.certificate,
        pin: `sha256:${createHash("sha256").update(new X509Certificate(cert).raw).digest("hex")}` };
    };
    core = identity("TEST_ONLY-assertion-core"); edge = identity("TEST_ONLY-assertion-edge"); foreign = identity("TEST_ONLY-assertion-foreign");
  });
  afterEach(async () => {
    for (const { server, sockets } of allocated.splice(0)) {
      for (const socket of sockets) socket.destroy();
      if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
  const config = (limits: Partial<FinancialSourceAssertionTransportConfig["limits"]> = {}, dns = "localhost"): FinancialSourceAssertionTransportConfig => ({
    tls: { key: core.key, cert: core.cert, ca: core.ca },
    peer: { certificate_sha256: edge.pin, dns_name: dns, workload_id: body.workload_id },
    limits: { maximum_in_flight: 2, request_bytes: 2_129_920, response_bytes: 65_536, deadline_ms: 1500, ...limits },
  });
  async function start(limits: Partial<FinancialSourceAssertionTransportConfig["limits"]> = {}, dns?: string,
    delivery?:Parameters<typeof createFinancialSourceAssertionTestCustodyTransport>[2]) {
    const issue = vi.fn().mockImplementation(async () => response());
    const complete = vi.fn().mockImplementation(async (_context, input) => ({
      schema_version: "portal.execution.financial-source-assertion-completion-response.v1",
      delivery_sequence: input.delivery_sequence, lease_id: input.lease_id, request_digest: input.request_digest,
      response_digest: input.response_digest, completed: true,
    }));
    const transport = delivery ? createFinancialSourceAssertionTestCustodyTransport({issue,complete},config(limits,dns),delivery)
      : createFinancialSourceAssertionTransport({ issue, complete }, config(limits, dns));
    const sockets = new Set<Duplex>(); allocated.push({ server: transport.server, sockets });
    for (const event of ["connection", "secureConnection"] as const)
      transport.server.on(event, socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
    transport.server.on("tlsClientError", () => undefined);
    await new Promise<void>((resolve, reject) => {
      transport.server.once("error", reject);
      transport.server.listen(0, "127.0.0.1", () => { transport.server.off("error", reject); resolve(); });
    });
    const address = transport.server.address();
    if (!address || typeof address === "string") throw new Error("TEST_ONLY_ADDRESS_REQUIRED");
    return { ...transport, issue, complete, sockets, origin: `https://127.0.0.1:${address.port}` };
  }
  function exchange(origin: string, raw: string | Buffer = JSON.stringify(body), options: {
    path?: string; method?: string; identity?: Identity; headers?: Record<string, string | string[] | undefined>;
  } = {}) {
    let client!: ClientRequest;
    const result = new Promise<Exchange>((resolve, reject) => {
      const cert = options.identity ?? edge;
      const headers = Object.fromEntries(Object.entries({ "content-type": "application/json", "content-length": Buffer.byteLength(raw),
        authorization: `Bearer ${token}`, ...options.headers }).filter(([, value]) => value !== undefined));
      client = request(new URL(options.path ?? route, origin), { key: cert.key, cert: cert.cert, ca: core.ca, agent: false,
        method: options.method ?? "POST", rejectUnauthorized: true, minVersion: "TLSv1.3", maxVersion: "TLSv1.3",
        headers,
      }, res => {
        const chunks: Buffer[] = [];
        res.on("data", chunk => chunks.push(Buffer.from(chunk)));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString(), headers: res.headers }));
        res.on("error", reject);
      });
      client.on("error", reject); client.setTimeout(2500, () => client.destroy(new Error("TEST_ONLY_CLIENT_DEADLINE"))); client.end(raw);
    });
    return { result, client };
  }
  const post = (origin: string, raw?: string | Buffer, options?: Parameters<typeof exchange>[2]) => exchange(origin, raw, options).result;

  it("is unbound on construction and has no authority side effects", () => {
    const issue = vi.fn(), t = createFinancialSourceAssertionTransport({ issue, complete: vi.fn() }, config());
    expect(t.server.listening).toBe(false); expect(t.server.address()).toBeNull(); expect(issue).not.toHaveBeenCalled();
    expect(t.snapshot()).toEqual({ in_flight: 0, accepted: 0, denied: 0, timed_out: 0 });
  });
  it.each([
    { maximum_in_flight: 0 }, { maximum_in_flight: 17 }, { request_bytes: 2_129_921 }, { response_bytes: 65_537 },
    { deadline_ms: 0 }, { deadline_ms: 5001 }, { request_bytes: 255 },
  ])("rejects out-of-bound configuration %j", limits => {
    expect(() => createFinancialSourceAssertionTransport({ issue: vi.fn(), complete: vi.fn() }, config(limits))).toThrow("FINANCIAL_SOURCE_ASSERTION_TRANSPORT_CONFIG_INVALID");
  });
  it("passes the exact Bearer context and request bytes to the issuer, with a private no-store response", async () => {
    const t = await start(), served = await post(t.origin);
    expect(served.status).toBe(200); expect(JSON.parse(served.body)).toMatchObject({ assertion: "TEST_ONLY-private-assertion", request_digest: body.request_digest });
    expect(t.issue).toHaveBeenCalledExactlyOnceWith(token, body);
    expect(served.headers["cache-control"]).toBe("no-store"); expect(served.headers.vary).toBe("Authorization");
    expect(served.headers["x-content-type-options"]).toBe("nosniff");
    expect(served.body).not.toContain(token); expect(t.snapshot()).toMatchObject({ in_flight: 0, accepted: 1 });
    expect(t.complete).not.toHaveBeenCalled();
  });
  it("routes a validated assertion through TEST_ONLY custody without implicit completion",async()=>{
    const delivery=vi.fn<Parameters<typeof createFinancialSourceAssertionTestCustodyTransport>[2]>(async(_context,_request,output,res)=>{
      const done=new Promise<void>(resolve=>res.once("finish",resolve));
      res.writeHead(200,{"content-type":"application/json","cache-control":"no-store"});res.end(JSON.stringify(output));await done;
    });
    const t=await start({},undefined,delivery),served=await post(t.origin);
    expect(served.status).toBe(200);expect(JSON.parse(served.body).lease_id).toBe("TEST_ONLY-lease");
    expect(delivery).toHaveBeenCalledOnce();expect(delivery.mock.calls[0][0]).toBe(token);
    expect(delivery.mock.calls[0][1]).toEqual(body);expect(t.complete).not.toHaveBeenCalled();
    await vi.waitFor(()=>expect(t.snapshot().in_flight).toBe(0));expect(t.snapshot().accepted).toBe(1);
  });
  it("refuses a TEST_ONLY custody callback that returns without sending",async()=>{
    const t=await start({},undefined,async()=>{}),served=await post(t.origin);
    expect(served.status).toBe(503);expect(served.body).not.toContain("TEST_ONLY-private-assertion");
    expect(t.snapshot().accepted).toBe(0);
  });
  it("does not call custody for an assertion bound to a different request",async()=>{
    const delivery=vi.fn<Parameters<typeof createFinancialSourceAssertionTestCustodyTransport>[2]>(async()=>{});
    const t=await start({},undefined,delivery);
    t.issue.mockImplementationOnce(async()=>({...response(),request_digest:`sha256:${"d".repeat(64)}`}));
    expect((await post(t.origin)).status).toBe(503);expect(delivery).not.toHaveBeenCalled();
    expect(t.snapshot().accepted).toBe(0);
  });
  it("destroys a partial custody response rather than appending an error payload",async()=>{
    const t=await start({},undefined,async(_context,_request,_output,res)=>{
      res.writeHead(200,{"content-type":"application/json"});res.write("TEST_ONLY_partial");
      throw new Error("TEST_ONLY_delivery_failed");
    });
    await expect(post(t.origin)).rejects.toThrow();
    await vi.waitFor(()=>expect(t.snapshot().in_flight).toBe(0));expect(t.snapshot().accepted).toBe(0);
  });
  it("retains capacity and destroys the response if custody times out",async()=>{
    let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});
    const delivery=vi.fn<Parameters<typeof createFinancialSourceAssertionTestCustodyTransport>[2]>(async()=>pending);
    const t=await start({deadline_ms:150,maximum_in_flight:1},undefined,delivery);
    const result=post(t.origin).then(()=>"response",()=>"closed");
    try {
      await vi.waitFor(()=>expect(delivery).toHaveBeenCalledOnce());
      expect(await result).toBe("closed");expect(t.snapshot()).toMatchObject({in_flight:1,timed_out:1,accepted:0});
    } finally {release();}
    await vi.waitFor(()=>expect(t.snapshot().in_flight).toBe(0));expect(t.complete).not.toHaveBeenCalled();
  });
  const completed = () => ({ schema_version: "portal.execution.financial-source-assertion-completion-request.v1",
    binding_digest: body.binding_digest, receiver_id: body.receiver_id, workload_id: body.workload_id,
    delivery_sequence: 0, lease_id: "TEST_ONLY-lease", request_digest: body.request_digest,
    response_digest: `sha256:${"b".repeat(64)}` });
  it("routes explicit completion to the same pinned mTLS/Bearer context and never mints an identity", async () => {
    const t = await start(), input = completed();
    const served = await post(t.origin, JSON.stringify(input), { path: "/internal/elp210/financial-source/complete" });
    expect(served.status).toBe(200);
    expect(JSON.parse(served.body)).toEqual({ schema_version: "portal.execution.financial-source-assertion-completion-response.v1",
      delivery_sequence: 0, lease_id: input.lease_id, request_digest: input.request_digest,
      response_digest: input.response_digest, completed: true });
    expect(t.complete).toHaveBeenCalledExactlyOnceWith(token, input); expect(t.issue).not.toHaveBeenCalled();
    expect(served.headers["cache-control"]).toBe("no-store"); expect(served.headers.vary).toBe("Authorization");
  });
  it("refuses a completion for a different machine workload before calling authority", async () => {
    const t = await start();
    expect((await post(t.origin, JSON.stringify({ ...completed(), workload_id: "different" }),
      { path: "/internal/elp210/financial-source/complete" })).status).toBe(403);
    expect(t.complete).not.toHaveBeenCalled(); expect(t.issue).not.toHaveBeenCalled();
  });
  it("refuses completion ACKs that change the authenticated original response digest", async () => {
    const t = await start(); t.complete.mockImplementationOnce(async (_token, input) => ({
      schema_version: "portal.execution.financial-source-assertion-completion-response.v1",
      delivery_sequence: input.delivery_sequence, lease_id: input.lease_id, request_digest: input.request_digest,
      response_digest: `sha256:${"c".repeat(64)}`, completed: true,
    }));
    expect((await post(t.origin, JSON.stringify(completed()),
      { path: "/internal/elp210/financial-source/complete" })).status).toBe(503);
    expect(t.issue).not.toHaveBeenCalled();
  });
  it.each([
    ["duplicate key", JSON.stringify(body).replace('"method":"POST"', '"method":"POST","method":"POST"')],
    ["escaped duplicate", JSON.stringify(body).replace('"method":"POST"', '"method":"POST","\\u006dethod":"POST"')],
    ["extra actor", JSON.stringify({ ...body, actor_id: "TEST_ONLY-other" })],
    ["body token injection", JSON.stringify({ ...body, original_context: token })],
    ["nested body", JSON.stringify({ ...body, body_utf8: {} })],
    ["wrong version", JSON.stringify({ ...body, schema_version: "portal.execution.financial-source-assertion-request.v2" })],
    ["malformed", "{bad"], ["invalid UTF8", Buffer.from([0x7b, 0xff, 0x7d])],
  ])("rejects %s before authority I/O", async (_name, raw) => {
    const t = await start(); expect((await post(t.origin, raw)).status).toBe(400); expect(t.issue).not.toHaveBeenCalled();
  });
  it.each([undefined, "Basic TEST_ONLY", `Bearer ${"T".repeat(42)}`, `bearer ${token}`, `Bearer  ${token}`])(
    "rejects malformed or missing original-context Authorization %j", async authorization => {
      const t = await start(); expect((await post(t.origin, undefined, { headers: { authorization } })).status).toBe(403);
      expect(t.issue).not.toHaveBeenCalled();
    });
  it("rejects duplicate Authorization even when both values match", async () => {
    const t = await start(); expect((await post(t.origin, undefined, { headers: { authorization: [`Bearer ${token}`, `Bearer ${token}`] } })).status).toBe(403);
    expect(t.issue).not.toHaveBeenCalled();
  });
  it.each(["forwarded", "x-forwarded-for", "x-forwarded-client-cert", "x-real-ip", "x-client-cert", "x-ssl-client-cert"])(
    "refuses forwarded identity header %s instead of accepting proxy authority", async name => {
      const t = await start(); expect((await post(t.origin, undefined, { headers: { [name]: "TEST_ONLY" } })).status).toBe(403);
      expect(t.issue).not.toHaveBeenCalled();
    });
  it("matches the body workload to the authenticated pinned machine", async () => {
    const t = await start(); expect((await post(t.origin, JSON.stringify({ ...body, workload_id: "TEST_ONLY-other" }))).status).toBe(403);
    expect(t.issue).not.toHaveBeenCalled();
  });
  it.each([`${route}?other=1`, "/internal/elp210/current-view/resolve", "/financial/dataset"])("does not route %s", async path => {
    const t = await start(); expect((await post(t.origin, undefined, { path })).status).toBe(404); expect(t.issue).not.toHaveBeenCalled();
  });
  it("never routes GET", async () => {
    const t = await start(); expect((await post(t.origin, undefined, { method: "GET" })).status).toBe(404); expect(t.issue).not.toHaveBeenCalled();
  });
  it("disconnects CA-valid but unpinned clients", async () => {
    const t = await start(); await expect(post(t.origin, undefined, { identity: foreign })).rejects.toThrow(); expect(t.issue).not.toHaveBeenCalled();
  });
  it("requires the exact certificate SAN, not its CN or the request Host", async () => {
    const t = await start({}, "wrong.test"); await expect(post(t.origin)).rejects.toThrow(); expect(t.issue).not.toHaveBeenCalled();
  });
  it.each([{ "content-type": "text/plain" }, { "content-encoding": "gzip" }])("refuses unsupported content framing %j", async headers => {
    const t = await start(); expect((await post(t.origin, undefined, { headers })).status).toBe(400); expect(t.issue).not.toHaveBeenCalled();
  });
  it("refuses an oversized body before starting authority", async () => {
    const t = await start({ request_bytes: 8192 }); expect((await post(t.origin, " ".repeat(8193))).status).toBe(413);
    expect(t.issue).not.toHaveBeenCalled();
  });
  it("accepts a bounded financial request larger than the current-view 8192-byte ceiling", async () => {
    const t = await start(), rawBody = JSON.stringify({ TEST_ONLY: "x".repeat(12_000) });
    const large = { ...body, body_utf8: rawBody, request_digest: pmHttpRequestDigest({ method: "POST", raw_path: Buffer.from(path),
      query_string: Buffer.alloc(0), body: Buffer.from(rawBody) }, { request_bytes: 2_129_920 }) };
    t.issue.mockResolvedValueOnce({ ...response(), request_digest: large.request_digest });
    expect(Buffer.byteLength(JSON.stringify(large))).toBeGreaterThan(8192);
    expect((await post(t.origin, JSON.stringify(large))).status).toBe(200);
    expect(t.issue).toHaveBeenCalledExactlyOnceWith(token, large);
  });
  it("preserves typed error code/status, never dependency messages or assertions", async () => {
    const t = await start();
    t.issue.mockRejectedValueOnce(new FinancialSourceAssertionError("FINANCIAL_SOURCE_ASSERTION_CONTEXT_EXPIRED", 409));
    const typed = await post(t.origin); expect(typed.status).toBe(409); expect(JSON.parse(typed.body).code).toBe("FINANCIAL_SOURCE_ASSERTION_CONTEXT_EXPIRED");
    t.issue.mockRejectedValueOnce(new Error("TEST_ONLY-sensitive-cookie-SQL-assertion"));
    const refused = await post(t.origin); expect(refused.status).toBe(503); expect(refused.body).not.toContain("sensitive"); expect(refused.body).not.toContain(token);
  });
  it.each(["extra key", "wrong workload", "expired"] as const)("never serves a faulty issuer response: %s", async mode => {
    const t = await start();
    t.issue.mockResolvedValueOnce(mode === "extra key" ? { ...response(), accidental_cookie: token } :
      mode === "wrong workload" ? { ...response(), workload_id: "TEST_ONLY-other" } : { ...response(), issued_at_ms: 0, expires_at_ms: 1 });
    const served = await post(t.origin); expect(served.status).toBe(mode === "expired" ? 409 : 503); expect(served.body).not.toContain(token);
    expect(t.snapshot().accepted).toBe(0);
  });
  it("refuses an oversized response, not a truncated private assertion", async () => {
    const t = await start({ response_bytes: 256 }); expect((await post(t.origin)).status).toBe(503); expect(t.snapshot().accepted).toBe(0);
  });
  it.each([
    { binding_digest: `sha256:${"b".repeat(64)}` }, { receiver_id: "TEST_ONLY-other" }, { path: "/financial/other" },
    { request_digest: `sha256:${"c".repeat(64)}` },
  ])("refuses a schema-valid issuer response bound to another request %j", async mismatch => {
    const t = await start(); t.issue.mockResolvedValueOnce({ ...response(), ...mismatch });
    expect((await post(t.origin)).status).toBe(503); expect(t.snapshot().accepted).toBe(0);
  });
  it("holds capacity until the actual issuer settles, even after response timeout", async () => {
    const t = await start({ deadline_ms: 100, maximum_in_flight: 1 }); let finish!: (value: ReturnType<typeof response>) => void;
    t.issue.mockImplementationOnce(() => new Promise<ReturnType<typeof response>>(resolve => { finish = resolve; }));
    expect((await post(t.origin)).status).toBe(504); expect(t.snapshot().in_flight).toBe(1);
    expect((await post(t.origin)).status).toBe(503); expect(t.issue).toHaveBeenCalledTimes(1);
    finish(response()); await vi.waitFor(() => expect(t.snapshot().in_flight).toBe(0)); expect(t.snapshot().accepted).toBe(0);
  });
  it("does not free pending authority on client abort or server shutdown", async () => {
    const t = await start({ maximum_in_flight: 1 }); let settle!: (value: ReturnType<typeof response>) => void;
    t.issue.mockImplementationOnce(() => new Promise<ReturnType<typeof response>>(resolve => { settle = resolve; }));
    const pending = exchange(t.origin), failure = pending.result.catch(error => error);
    await vi.waitFor(() => expect(t.issue).toHaveBeenCalledOnce()); pending.client.destroy(); await failure;
    for (const socket of t.sockets) socket.destroy();
    await new Promise<void>(resolve => t.server.close(() => resolve()));
    expect(t.snapshot().in_flight).toBe(1); settle(response());
    await vi.waitFor(() => expect(t.snapshot().in_flight).toBe(0)); expect(t.snapshot().accepted).toBe(0);
  });
  it.each(["idle", "partial headers"] as const)("bounds a pinned TLS client with %s before a request exists", async mode => {
    const t = await start({ deadline_ms: 100 }), url = new URL(t.origin);
    const began = performance.now();
    await new Promise<void>((resolve, reject) => {
      const socket = connectTls({ host: url.hostname, port: Number(url.port), key: edge.key, cert: edge.cert, ca: core.ca,
        rejectUnauthorized: true, minVersion: "TLSv1.3", maxVersion: "TLSv1.3" }, () => {
        if (mode === "partial headers") socket.write(`POST ${route} HTTP/1.1\r\nHost: localhost\r\n`);
      });
      const guard = setTimeout(() => { socket.destroy(); reject(new Error("TEST_ONLY_HEADER_DEADLINE_NOT_ENFORCED")); }, 2000);
      socket.once("error", reject); socket.once("close", () => { clearTimeout(guard); resolve(); });
    });
    expect(performance.now() - began).toBeLessThan(1500); expect(t.issue).not.toHaveBeenCalled();
    expect(t.snapshot()).toMatchObject({ in_flight: 0, accepted: 0, timed_out: 1 });
  });
  it("bounds a partial request body without calling authority or keeping its slot", async () => {
    const t = await start({ deadline_ms: 100 }), url = new URL(t.origin);
    await new Promise<void>((resolve, reject) => {
      const socket = connectTls({ host: url.hostname, port: Number(url.port), key: edge.key, cert: edge.cert, ca: core.ca,
        rejectUnauthorized: true, minVersion: "TLSv1.3", maxVersion: "TLSv1.3" }, () => {
        socket.write(`POST ${route} HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer ${token}\r\nContent-Type: application/json\r\nContent-Length: 1000\r\n\r\n{`);
      });
      socket.on("data", () => undefined);
      const guard = setTimeout(() => { socket.destroy(); reject(new Error("TEST_ONLY_BODY_DEADLINE_NOT_ENFORCED")); }, 2000);
      socket.once("error", reject); socket.once("close", () => { clearTimeout(guard); resolve(); });
    });
    expect(t.issue).not.toHaveBeenCalled(); expect(t.snapshot()).toMatchObject({ in_flight: 0, timed_out: 1 });
  });
  it("refuses a late microtask result even if the timer has not run yet", async () => {
    const t = await start({ deadline_ms: 40 });
    t.issue.mockImplementationOnce(async () => {
      const until = performance.now() + 65; while (performance.now() < until) { /* TEST_ONLY event-loop starvation. */ }
      return response();
    });
    expect((await post(t.origin)).status).toBe(504); expect(t.snapshot().accepted).toBe(0);
  });
});
