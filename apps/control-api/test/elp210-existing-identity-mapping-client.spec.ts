/** TEST_ONLY loopback TLS1.3/mTLS with ephemeral in-memory certificates.
 * Replies are synthetic protocol vectors, NOT actual accepted TS identities,
 * installed policy, production commissioning or a fence through Core COMMIT.
 * RFC5280 fixture is mechanically reused from current-human transport tests. */
import { createHash, createPublicKey, generateKeyPairSync, randomBytes, randomUUID, sign, X509Certificate,
  type KeyObject, type KeyPairKeyObjectResult } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { createServer, type Server } from "node:https";
import type { Socket } from "node:net";
import type { TLSSocket } from "node:tls";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { unqualifiedAccessRelations } from "../src/execution-v2/access-policy";
import type { AccessTrustProvider } from "../src/execution-v2/access-trust";
import { ExistingIdentityMappingClient, withExistingIdentityMapping,
  type ExistingIdentityMappingClientConfig } from "../src/execution-v2/existing-identity-mapping-client";

type Certificate = { key: Buffer; cert: Buffer; ca: Buffer; fingerprint: string };
type TestAuthority = { key: KeyObject; name: Buffer; certificate: Buffer };
type Reply = { status?: number; body?: string | Buffer; neverReply?: boolean;
  content_type?: string; content_encoding?: string; abort?: boolean };
const selection = { human_issuer: "urn:TEST_ONLY:accepted-stable-issuer", workspace_id: "TEST_ONLY-workspace",
  environment: "paper" as const, workload_id: "TEST_ONLY-accepted-workload" };
const subject = "TEST_ONLY-portal-target", userId = randomUUID();
const mapping = { ts_user_id: userId, revision: `ts-user:${userId}:7` };
const result = (request: Record<string, unknown>, changes: Record<string, unknown> = {}) =>
  JSON.stringify({ ...request, schema_version: "pma.existing-human-mapping-result.v1", status: "FOUND", ...mapping, ...changes });
const unavailable = { code: "EXISTING_IDENTITY_MAPPING_UNAVAILABLE" };

const der = (tag: number, ...values: Buffer[]) => {
  const bytes = Buffer.concat(values), length = bytes.length;
  const encoded = length < 128 ? Buffer.from([length]) : (() => {
    let hex = length.toString(16); if (hex.length % 2) hex = `0${hex}`;
    const size = Buffer.from(hex, "hex"); return Buffer.concat([Buffer.from([0x80 | size.length]), size]);
  })();
  return Buffer.concat([Buffer.from([tag]), encoded, bytes]);
};
const seq = (...values: Buffer[]) => der(0x30, ...values);
const oid = (hex: string) => der(0x06, Buffer.from(hex, "hex"));
const boolean = () => der(0x01, Buffer.from([0xff]));
const ecSha256 = seq(oid("2a8648ce3d040302"));
const pem = (bytes: Buffer) => Buffer.from(`-----BEGIN CERTIFICATE-----\n${bytes.toString("base64").match(/.{1,64}/g)!.join("\n")}\n-----END CERTIFICATE-----\n`);
const commonName = (name: string) => seq(der(0x31, seq(oid("550403"), der(0x0c, Buffer.from(name)))));
function testCertificate(name: Buffer, key: KeyPairKeyObjectResult, issuer: { name: Buffer; key: KeyObject }, ca: boolean,
  correctHostname = true) {
  const time = (at: number) => der(0x17, Buffer.from(new Date(at).toISOString().replace(/[-:]/g, "").replace("T", "").slice(2, 14) + "Z"));
  const extension = (id: string, value: Buffer, critical = false) => seq(oid(id), ...(critical ? [boolean()] : []), der(0x04, value));
  const extensions = [extension("551d13", ca ? seq(boolean()) : seq(), true),
    extension("551d0f", der(0x03, Buffer.from(ca ? [1, 6] : [7, 0x80])), true)];
  if (!ca) extensions.push(extension("551d25", seq(oid("2b06010505070301"), oid("2b06010505070302"))),
    extension("551d11", seq(der(0x87, Buffer.from(correctHostname ? [127, 0, 0, 1] : [127, 0, 0, 2])),
      der(0x82, Buffer.from(correctHostname ? "localhost" : "TEST_ONLY.invalid")))));
  const now = Date.now();
  const tbs = seq(der(0xa0, der(0x02, Buffer.from([2]))), der(0x02, Buffer.from([1]), randomBytes(15)), ecSha256,
    issuer.name, seq(time(now - 60_000), time(now + 86_400_000)), name,
    key.publicKey.export({ type: "spki", format: "der" }) as Buffer, der(0xa3, seq(...extensions)));
  const certificate = pem(seq(tbs, ecSha256, der(0x03, Buffer.from([0]), sign("sha256", tbs, issuer.key))));
  expect(new X509Certificate(certificate).verify(createPublicKey(issuer.key))).toBe(true);
  return certificate;
}

describe("ELP2-10 existing identity mapping client (TEST_ONLY real loopback mTLS)", () => {
  let core: Certificate, source: Certificate, otherSource: Certificate,
    foreignCore: Certificate, foreignSource: Certificate, wrongHost: Certificate;
  const allocated: { server: Server; sockets: Set<Socket> }[] = [];
  const authority = (label: string): TestAuthority => {
    const key = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), name = commonName(`TEST_ONLY_${label}`);
    return { key: key.privateKey, name, certificate: testCertificate(name, key, { name, key: key.privateKey }, true) };
  };
  const leaf = (label: string, ca: TestAuthority, correctHostname = true): Certificate => {
    const key = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const cert = testCertificate(commonName(`TEST_ONLY_${label}`), key, ca, false, correctHostname);
    return { key: Buffer.from(key.privateKey.export({ type: "pkcs8", format: "pem" })), cert, ca: ca.certificate,
      fingerprint: `sha256:${createHash("sha256").update(new X509Certificate(cert).raw).digest("hex")}` };
  };
  const peer = async (certificate = source,
    handler: (req: IncomingMessage, body: Record<string, unknown>) => Reply = (_req, body) => ({ body: result(body) }),
    maximumVersion: "TLSv1.2" | "TLSv1.3" = "TLSv1.3") => {
    let requests = 0, bytes = 0, connections = 0;
    const bodies: Record<string, unknown>[] = [], sockets = new Set<Socket>();
    const server = createServer({ key: certificate.key, cert: certificate.cert, ca: core.ca,
      requestCert: true, rejectUnauthorized: true,
      minVersion: maximumVersion, maxVersion: maximumVersion }, (req, res) => {
      requests++;
      const chunks: Buffer[] = [];
      req.on("error", () => { /* Exact owned test connection may be aborted. */ });
      req.on("data", (chunk: Buffer) => { bytes += chunk.length; chunks.push(chunk); });
      req.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>; bodies.push(body);
        const reply = handler(req, body);
        if (reply.neverReply) return;
        if (reply.abort) { req.socket.destroy(); return; }
        res.writeHead(reply.status ?? 200, { "content-type": reply.content_type ?? "application/json",
          "connection": "close", ...(reply.content_encoding ? { "content-encoding": reply.content_encoding } : {}) });
        res.end(reply.body ?? "{}");
      });
    });
    allocated.push({ server, sockets });
    server.on("connection", socket => { connections++; sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
    server.on("secureConnection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
    server.on("tlsClientError", () => { /* Expected negative TLS lane; no credential logging. */ });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject); server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("TEST_ONLY_LISTEN_REQUIRED");
    return { origin: `https://127.0.0.1:${address.port}`, requests: () => requests,
      bytes: () => bytes, connections: () => connections, bodies };
  };
  const client = (origin: string, changes: Partial<ExistingIdentityMappingClientConfig> = {}) =>
    new ExistingIdentityMappingClient({ origin, tls: { key: core.key, cert: core.cert, ca: core.ca },
      source_certificate_sha256: source.fingerprint, ...selection, deadline_ms: 1000, response_bytes: 8192,
      max_inflight: 2, installation_expires_at_utc_ms: Date.now() + 60_000, ...changes });

  beforeAll(() => {
    const trusted = authority("mapping_root"), foreign = authority("foreign_mapping_root");
    core = leaf("core", trusted); source = leaf("source", trusted); otherSource = leaf("other_source", trusted);
    foreignCore = leaf("foreign_core", foreign); foreignSource = leaf("foreign_source", foreign);
    wrongHost = leaf("wrong_host", trusted, false);
  }, 15000);
  afterEach(async () => {
    vi.restoreAllMocks();
    for (const { server, sockets } of allocated.splice(0)) {
      const closing = new Promise<void>(resolve => server.close(() => resolve()));
      for (const socket of sockets) socket.destroy();
      server.closeAllConnections(); await closing;
    }
  });
  afterAll(() => { for (const identity of [core, source, otherSource, foreignCore, foreignSource, wrongHost]) identity?.key.fill(0); });

  it("sends only the exact fixed token-free mapping query after TLS1.3/mTLS and correlates the result", async () => {
    const lane = await peer(source, (req, body) => {
      expect(req.url).toBe("/internal/elp210/current-human/mapping"); expect(req.method).toBe("POST");
      expect((req.socket as TLSSocket).getProtocol()).toBe("TLSv1.3");
      expect((req.socket as TLSSocket).authorized).toBe(true);
      expect(body).toEqual({ schema_version: "pma.existing-human-mapping.v1", request_id: expect.any(String), subject, ...selection });
      expect(body.request_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(req.headers.authorization).toBeUndefined(); expect(req.headers.cookie).toBeUndefined();
      return { body: result(body) };
    });
    expect(await client(lane.origin).lookup(subject, selection.workspace_id)).toEqual(mapping);
    expect(lane.requests()).toBe(1);
  });
  it("does not cache, pool or fall back when an existing mapping becomes unavailable", async () => {
    let attempt = 0;
    const lane = await peer(source, (_req, body) => ({ body: ++attempt === 1 ? result(body) :
      JSON.stringify({ ...body, schema_version: "pma.existing-human-mapping-result.v1", status: "NOT_FOUND" }) }));
    const selected = client(lane.origin);
    expect(await selected.lookup(subject, selection.workspace_id)).toEqual(mapping);
    expect(await selected.lookup(subject, selection.workspace_id)).toBeNull();
    expect(lane.requests()).toBe(2); expect(lane.connections()).toBe(2);
    expect(lane.bodies[0].request_id).not.toBe(lane.bodies[1].request_id);
  });
  it("rejects a wrong workspace before any connection or metadata", async () => {
    const lane = await peer();
    await expect(client(lane.origin).lookup(subject, "TEST_ONLY-other-workspace"))
      .rejects.toMatchObject({ code: "EXISTING_IDENTITY_MAPPING_SCOPE_MISMATCH" });
    expect(lane.connections()).toBe(0); expect(lane.bytes()).toBe(0);
  });
  it.each(["", " leading", "trailing ", "hidden\u0000subject", "x".repeat(513), "界".repeat(171)])("rejects malformed subject %# before I/O", async subject => {
    const lane = await peer();
    await expect(client(lane.origin).lookup(subject, selection.workspace_id))
      .rejects.toMatchObject({ code: "EXISTING_IDENTITY_MAPPING_REQUEST_INVALID" });
    expect(lane.connections()).toBe(0);
  });
  it.each(["human_issuer", "workspace_id", "workload_id"] as const)("rejects UTF-8 byte overflow in pinned %s before I/O", async key => {
    const lane = await peer();
    expect(() => client(lane.origin, { [key]: "界".repeat(171) }))
      .toThrow(expect.objectContaining({ code: "EXISTING_IDENTITY_MAPPING_CONFIG_INVALID" }));
    expect(lane.connections()).toBe(0);
  });
  it("accepts exact 512-byte identifiers without relaxing the 8192-byte request bound", async () => {
    const identifier = `${"界".repeat(170)}ab`, lane = await peer();
    const selected = client(lane.origin, { human_issuer: identifier, workspace_id: identifier, workload_id: identifier });
    expect(Buffer.byteLength(identifier)).toBe(512);
    expect(await selected.lookup(identifier, identifier)).toEqual(mapping);
    expect(lane.bytes()).toBeLessThanOrEqual(8192);
  });
  it.each(["request_id", "human_issuer", "subject", "workspace_id", "environment", "workload_id"] as const)
    ("rejects wrong response %s correlation without retries", async key => {
      const changed = key === "request_id" ? randomUUID() : key === "environment" ? "live" : "TEST_ONLY-other";
      const lane = await peer(source, (_req, body) => ({ body: result(body, { [key]: changed }) }));
      await expect(client(lane.origin).lookup(subject, selection.workspace_id)).rejects.toMatchObject(unavailable);
      expect(lane.requests()).toBe(1);
    });
  it.each([`ts-user:${userId}:0`, `ts-user:${userId}:01`, `ts-user:${userId}:-1`, `ts-user:${userId}:1.0`,
    `ts-user:${randomUUID()}:7`, `TS-USER:${userId}:7`, `ts-user:${userId}:NaN`,
    `ts-user:${userId}:9223372036854775808`, `ts-user:${userId}:10000000000000000000`])("rejects invalid or differently bound revision %#", async revision => {
    const lane = await peer(source, (_req, body) => ({ body: result(body, { revision }) }));
    await expect(client(lane.origin).lookup(subject, selection.workspace_id)).rejects.toMatchObject(unavailable);
  });
  it("preserves the exact maximum signed-bigint revision without Number rounding", async () => {
    const revision = `ts-user:${userId}:9223372036854775807`;
    const lane = await peer(source, (_req, body) => ({ body: result(body, { revision }) }));
    expect(await client(lane.origin).lookup(subject, selection.workspace_id)).toEqual({ ts_user_id: userId, revision });
  });
  it.each([userId.toUpperCase(), "TEST_ONLY-not-a-uuid", `${userId} `])("rejects noncanonical TS UUID %#", async ts_user_id => {
    const lane = await peer(source, (_req, body) => ({ body: result(body, { ts_user_id }) }));
    await expect(client(lane.origin).lookup(subject, selection.workspace_id)).rejects.toMatchObject(unavailable);
  });
  it.each(["malformed", "invalid-utf8", "extra", "nested", "duplicate", "escaped-alias", "not-found-residue"])
    ("rejects strict wire violation %s", async variant => {
      const lane = await peer(source, (_req, body) => {
        const normal = result(body);
        const raw: Record<string, string | Buffer> = {
          malformed: "{", "invalid-utf8": Buffer.from([0xff]), extra: result(body, { extra: true }),
          nested: result(body, { mapping }), duplicate: normal.replace('"status":"FOUND"', '"status":"NOT_FOUND","status":"FOUND"'),
          "escaped-alias": normal.replace('"status":"FOUND"', '"status":"NOT_FOUND","st\\u0061tus":"FOUND"'),
          "not-found-residue": result(body, { status: "NOT_FOUND" }),
        };
        return { body: raw[variant] };
      });
      await expect(client(lane.origin).lookup(subject, selection.workspace_id)).rejects.toMatchObject(unavailable);
    });
  it("rejects a foreign server CA before HTTP headers or mapping bytes", async () => {
    const lane = await peer(foreignSource);
    await expect(client(lane.origin, { source_certificate_sha256: foreignSource.fingerprint })
      .lookup(subject, selection.workspace_id)).rejects.toMatchObject(unavailable);
    expect(lane.requests()).toBe(0); expect(lane.bytes()).toBe(0);
  });
  it("rejects a CA-valid wrong server leaf before HTTP headers or mapping bytes", async () => {
    const lane = await peer(otherSource);
    await expect(client(lane.origin).lookup(subject, selection.workspace_id)).rejects.toMatchObject(unavailable);
    expect(lane.requests()).toBe(0); expect(lane.bytes()).toBe(0);
  });
  it("checks hostname independently of a matching leaf pin before mapping bytes", async () => {
    const lane = await peer(wrongHost);
    await expect(client(lane.origin, { source_certificate_sha256: wrongHost.fingerprint })
      .lookup(subject, selection.workspace_id)).rejects.toMatchObject(unavailable);
    expect(lane.requests()).toBe(0); expect(lane.bytes()).toBe(0);
  });
  it("requires trusted client identity, not only trusted server TLS", async () => {
    const lane = await peer();
    await expect(client(lane.origin, { tls: { key: foreignCore.key, cert: foreignCore.cert, ca: core.ca } })
      .lookup(subject, selection.workspace_id)).rejects.toMatchObject(unavailable);
    expect(lane.requests()).toBe(0); expect(lane.bytes()).toBe(0);
  });
  it("rejects missing client certificate before the server handles any mapping query", async () => {
    const lane = await peer();
    await expect(client(lane.origin, { tls: { key: Buffer.alloc(0), cert: Buffer.alloc(0), ca: core.ca } })
      .lookup(subject, selection.workspace_id)).rejects.toMatchObject(unavailable);
    expect(lane.requests()).toBe(0); expect(lane.bytes()).toBe(0);
  });
  it("does not downgrade to TLS1.2", async () => {
    const lane = await peer(source, undefined, "TLSv1.2");
    await expect(client(lane.origin).lookup(subject, selection.workspace_id)).rejects.toMatchObject(unavailable);
    expect(lane.requests()).toBe(0); expect(lane.bytes()).toBe(0);
  });
  it.each(["oversize", "redirect", "wrong-content-type", "compressed", "server-error", "aborted"])
    ("bounds or rejects %s response without retries", async variant => {
      const replies: Record<string, Reply> = { oversize: { body: "x".repeat(257) }, redirect: { status: 307 },
        "wrong-content-type": { content_type: "text/plain" }, compressed: { content_encoding: "gzip" },
        "server-error": { status: 503 }, aborted: { abort: true } };
      const lane = await peer(source, () => replies[variant]);
      await expect(client(lane.origin, { response_bytes: 256 }).lookup(subject, selection.workspace_id)).rejects.toMatchObject(unavailable);
      expect(lane.requests()).toBe(1);
    });
  it("times out a nonresponding source, closes its request and exposes no peer details", async () => {
    const lane = await peer(source, () => ({ neverReply: true }));
    const error = await client(lane.origin, { deadline_ms: 150 }).lookup(subject, selection.workspace_id).catch(error => error);
    expect(error).toMatchObject(unavailable);
    expect(error.message).toBe("The existing identity mapping is not available.");
    expect(lane.requests()).toBe(1);
  });
  it.each(["http://127.0.0.1:1", "https://user:password@127.0.0.1:1", "https://127.0.0.1:1/other",
    "https://127.0.0.1:1/?query", "https://127.0.0.1:1/#fragment"])("rejects unsafe origin %# before I/O", origin => {
    expect(() => client(origin)).toThrow();
  });
  it.each([{ deadline_ms: 0 }, { deadline_ms: 10001 }, { deadline_ms: 1.5 }, { response_bytes: 0 }, { response_bytes: 8193 },
    { response_bytes: 1.5 }, { human_issuer: "" }, { workload_id: " leading" }, { workspace_id: "" },
    { source_certificate_sha256: "sha256:INVALID" }, { max_inflight: 0 }, { max_inflight: 129 }, { max_inflight: 1.5 },
    { max_inflight: undefined }, { installation_expires_at_utc_ms: undefined }, { installation_expires_at_utc_ms: 0 },
    { installation_expires_at_utc_ms: Number.MAX_SAFE_INTEGER + 1 }])("rejects invalid pinned configuration %#", changes => {
    expect(() => client("https://127.0.0.1:1", changes)).toThrow();
  });

  it("rejects already expired and exactly-at-expiry installations at construction", () => {
    const current = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(current);
    try {
      for (const expiry of [current - 1, current])
        expect(() => client("https://127.0.0.1:1", { installation_expires_at_utc_ms: expiry })).toThrow();
    } finally { clock.mockRestore(); }
  });
  it("denies expiry at the request boundary before any connection or metadata", async () => {
    const lane = await peer(), current = Date.now(), expiry = current + 1000;
    const selected = client(lane.origin, { installation_expires_at_utc_ms: expiry });
    const clock = vi.spyOn(Date, "now").mockReturnValue(expiry);
    try {
      await expect(selected.lookup(subject, selection.workspace_id))
        .rejects.toMatchObject({ code: "EXISTING_IDENTITY_MAPPING_INSTALLATION_EXPIRED" });
      expect(lane.connections()).toBe(0); expect(lane.bytes()).toBe(0);
    } finally { clock.mockRestore(); }
  });
  it.each(["FOUND", "NOT_FOUND"])("denies installation expiry after I/O even for a valid %s result", async status => {
    const current = Date.now(), expiry = current + 1000;
    let expire!: () => void;
    const clock = vi.spyOn(Date, "now").mockReturnValue(current);
    try {
      const lane = await peer(source, (_req, body) => {
        expire();
        return { body: status === "FOUND" ? result(body) :
          JSON.stringify({ ...body, schema_version: "pma.existing-human-mapping-result.v1", status }) };
      });
      const selected = client(lane.origin, { installation_expires_at_utc_ms: expiry });
      expire = () => clock.mockReturnValue(expiry);
      await expect(selected.lookup(subject, selection.workspace_id))
        .rejects.toMatchObject({ code: "EXISTING_IDENTITY_MAPPING_INSTALLATION_EXPIRED" });
      expect(lane.requests()).toBe(1);
    } finally { clock.mockRestore(); }
  });
  it("reserves aggregate inflight slots before connecting, rejects busy without queueing and releases after success", async () => {
    const lane = await peer(), selected = client(lane.origin, { max_inflight: 1 });
    const first = selected.lookup(subject, selection.workspace_id);
    await expect(selected.lookup("TEST_ONLY-other-target", selection.workspace_id))
      .rejects.toMatchObject({ code: "EXISTING_IDENTITY_MAPPING_BUSY" });
    expect(await first).toEqual(mapping);
    expect(lane.requests()).toBe(1); expect(lane.connections()).toBe(1);
    expect(await selected.lookup(subject, selection.workspace_id)).toEqual(mapping);
    expect(lane.requests()).toBe(2);
  });
  it.each(["NOT_FOUND", "malformed", "timeout", "aborted"])("releases admission after %s so a later lookup can recover", async outcome => {
    let attempt = 0;
    const lane = await peer(source, (_req, body) => {
      if (++attempt > 1) return { body: result(body) };
      if (outcome === "NOT_FOUND") return { body: JSON.stringify({ ...body,
        schema_version: "pma.existing-human-mapping-result.v1", status: "NOT_FOUND" }) };
      if (outcome === "timeout") return { neverReply: true };
      if (outcome === "aborted") return { abort: true };
      return { body: "{" };
    });
    const selected = client(lane.origin, { max_inflight: 1, deadline_ms: 250 });
    if (outcome === "NOT_FOUND") expect(await selected.lookup(subject, selection.workspace_id)).toBeNull();
    else await expect(selected.lookup(subject, selection.workspace_id)).rejects.toMatchObject(unavailable);
    expect(await selected.lookup(subject, selection.workspace_id)).toEqual(mapping);
    expect(lane.requests()).toBe(2);
  });
  it("releases admission after TLS rejection instead of turning subsequent lookups into busy", async () => {
    const lane = await peer(otherSource), selected = client(lane.origin, { max_inflight: 1 });
    for (let attempt = 0; attempt < 2; attempt++)
      await expect(selected.lookup(subject, selection.workspace_id)).rejects.toMatchObject(unavailable);
    expect(lane.requests()).toBe(0); expect(lane.bytes()).toBe(0);
  });

  it("forwards every base callback with its original receiver, replacing only mapping", async () => {
    const lane = await peer();
    let base: AccessTrustProvider;
    const check = () => expect(base).toBeDefined();
    base = {
      verifyPolicy: vi.fn(async function (this: AccessTrustProvider) { check(); expect(this).toBe(base); return null; }),
      verifyReceipt: vi.fn(async function (this: AccessTrustProvider) { expect(this).toBe(base); return null; }),
      verifyRootReceipt: vi.fn(async function (this: AccessTrustProvider) { expect(this).toBe(base); return null; }),
      qualifyDelegatedReceipt: vi.fn(async function (this: AccessTrustProvider) { expect(this).toBe(base); return null; }),
      readPublication: vi.fn(async function (this: AccessTrustProvider) { expect(this).toBe(base); return null; }),
      relations: vi.fn(async function (this: AccessTrustProvider) { expect(this).toBe(base); return unqualifiedAccessRelations(); }),
      verifiedHumanMapping: vi.fn(async () => null),
    };
    const selected = withExistingIdentityMapping(base, client(lane.origin)), input = { TEST_ONLY: true };
    expect(await selected.verifyPolicy(input)).toBeNull(); expect(base.verifyPolicy).toHaveBeenCalledExactlyOnceWith(input);
    expect(await selected.verifyReceipt(input)).toBeNull(); expect(base.verifyReceipt).toHaveBeenCalledExactlyOnceWith(input);
    expect(await selected.verifyRootReceipt!(input)).toBeNull(); expect(base.verifyRootReceipt).toHaveBeenCalledExactlyOnceWith(input);
    const delegatedScope = { workspace_id: selection.workspace_id, subject_user_id: subject, principal_ids: [subject] };
    expect(await selected.qualifyDelegatedReceipt!(input, delegatedScope)).toBeNull();
    expect(base.qualifyDelegatedReceipt).toHaveBeenCalledExactlyOnceWith(input, delegatedScope);
    const publication = { TEST_ONLY: "publication" } as unknown as Parameters<NonNullable<AccessTrustProvider["readPublication"]>>[0];
    expect(await selected.readPublication!(publication)).toBeNull(); expect(base.readPublication).toHaveBeenCalledExactlyOnceWith(publication);
    expect(await selected.relations(subject, selection.workspace_id)).toEqual(unqualifiedAccessRelations());
    expect(base.relations).toHaveBeenCalledExactlyOnceWith(subject, selection.workspace_id);
    expect(await selected.verifiedHumanMapping(subject, selection.workspace_id)).toEqual(mapping);
    expect(base.verifiedHumanMapping).not.toHaveBeenCalled();
  });
  it("keeps absent optional authority ports absent and never replaces source failure with base mapping", async () => {
    const lane = await peer(source, () => ({ status: 503 }));
    const fallback = vi.fn(async () => mapping);
    const base: AccessTrustProvider = { verifyPolicy: async () => null, verifyReceipt: async () => null,
      relations: async () => unqualifiedAccessRelations(), verifiedHumanMapping: fallback };
    const selected = withExistingIdentityMapping(base, client(lane.origin));
    expect(selected.verifyRootReceipt).toBeUndefined(); expect(selected.qualifyDelegatedReceipt).toBeUndefined();
    expect(selected.readPublication).toBeUndefined();
    await expect(selected.verifiedHumanMapping(subject, selection.workspace_id)).rejects.toMatchObject(unavailable);
    expect(fallback).not.toHaveBeenCalled();
  });
});
