import { execFileSync } from "node:child_process";
import { createHash, createPublicKey, randomBytes, X509Certificate } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportSPKI, generateKeyPair, importJWK, jwtVerify, SignJWT } from "jose";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prepareC2IssuerPublicAndReverse, type C2SourceRegistration } from "../src/execution-v2/c2-human-issuer-composition";
import { CurrentHumanCandidate, type CurrentHumanCandidateConfig } from "../src/execution-v2/current-human-candidate";
import type { C2PublicTrustInput } from "../src/execution-v2/c2-public-trust-preflight";
import type { CurrentHumanTransportConfig } from "../src/execution-v2/current-human-transport";
import { RestoreIndependentCustodyCandidate } from "../src/execution-v2/restore-independent-custody-candidate";
import { C2SourceProofVault } from "../src/execution-v2/restore-c2-source-proof-vault";

/** Candidate construction has no DB I/O. These keys and IDs are isolated test
 * material, not the Research issuer, source registration or P7 authority. */
const pool = { options: { connectionTimeoutMillis: 2000, query_timeout: 6000 } } as unknown as Pool;
async function specimen() {
  const own = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  const source = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  const pem = await exportSPKI(source.publicKey);
  const spki = createPublicKey(pem).export({ type: "spki", format: "der" });
  const registration: C2SourceRegistration = { source_issuer: "test-only-source", source_key_id: "test-only-source-key",
    source_spki_sha256: createHash("sha256").update(spki).digest("hex"), source_audience: "test-only-source-aud",
    source_workload_id: "test-only-workload", source_client_csr_sha256: "1".repeat(64), server_hostname: "core.test.invalid",
    server_certificate_der_sha256: "2".repeat(64), workspace_id: "test-only-paper", protected_owner_subject: "test-only-owner" };
  const config: CurrentHumanCandidateConfig = { issuer: "test-only-portal", audience: "test-only-audience", key_id: "test-only-kid",
    private_key: own.privateKey, source: { issuer: registration.source_issuer, audience: registration.source_audience,
      key_id: registration.source_key_id, public_key: source.publicKey, workload_id: registration.source_workload_id },
    limits: { ttl_ms: 30_000, maximum_unresolved: 3, maximum_retained: 10 },
    installation_scope: { environment: "paper", workspace_id: registration.workspace_id, valid_until_ms: Date.now() + 60_000 } };
  return { own, source, config, registration };
}

describe("unmounted C2 issuer/public JWKS composition", () => {
  it("requires the C2 delivery schema even when the input does not select it", async () => {
    const { config, registration } = await specimen();
    expect(config.c2_delivery_schema_required).toBeUndefined();
    const create = vi.spyOn(CurrentHumanCandidate, "create");
    try {
      await prepareC2IssuerPublicAndReverse(pool, config, registration);
      expect(create).toHaveBeenCalledOnce();
      expect(create).toHaveBeenCalledWith(pool, expect.objectContaining({ c2_delivery_schema_required: true }));
    } finally {
      create.mockRestore();
    }
  });

  it("pins one public key and kid from exactly the candidate's signing key", async () => {
    const { own, config, registration } = await specimen();
    const result = await prepareC2IssuerPublicAndReverse(pool, config, registration);
    const parsed = JSON.parse(result.jwks_json);
    expect(Object.keys(parsed)).toEqual(["keys"]);
    expect(parsed.keys).toHaveLength(1);
    expect(parsed.keys[0]).toMatchObject({ kty: "OKP", crv: "Ed25519", kid: config.key_id, alg: "EdDSA", use: "sig" });
    expect(parsed.keys[0]).not.toHaveProperty("d");
    // Exact published bytes are authority pins: object-key order and a final
    // newline are observable and cannot be normalized after publication.
    expect(result.jwks_json).toBe(JSON.stringify({ keys: [{ kty: "OKP", crv: "Ed25519", x: parsed.keys[0].x,
      kid: config.key_id, alg: "EdDSA", use: "sig" }] }));
    expect(result.jwks_json.endsWith("\n")).toBe(false);
    expect(result.jwks_sha256).toBe(createHash("sha256").update(result.jwks_json).digest("hex"));
    expect(result.protected_owner_subject).toBe(registration.protected_owner_subject);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result).not.toHaveProperty("candidate");
    expect(result).not.toHaveProperty("issue");
    const key = await importJWK(parsed.keys[0], "EdDSA");
    const token = await new SignJWT({ purpose: "test-only" }).setProtectedHeader({ alg: "EdDSA", kid: config.key_id })
      .sign(own.privateKey);
    expect((await jwtVerify(token, key)).protectedHeader.kid).toBe(config.key_id);
  });

  it("rotation changes the exact public bytes and cannot verify the prior issuer", async () => {
    const one = await specimen();
    const old = await prepareC2IssuerPublicAndReverse(pool, one.config, one.registration);
    const rotated = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
    const next = await prepareC2IssuerPublicAndReverse(pool, { ...one.config, key_id: "test-only-rotated", private_key: rotated.privateKey }, one.registration);
    expect(next.jwks_sha256).not.toBe(old.jwks_sha256);
    const oldKey = await importJWK(JSON.parse(old.jwks_json).keys[0], "EdDSA");
    const token = await new SignJWT({}).setProtectedHeader({ alg: "EdDSA", kid: "test-only-rotated" }).sign(rotated.privateKey);
    await expect(jwtVerify(token, oldKey)).rejects.toThrow();
  });

  it.each(["source_issuer", "source_key_id", "source_spki_sha256", "source_audience", "source_workload_id", "workspace_id"] as const)(
    "fails closed on %s mismatch instead of silently registering another source", async field => {
      const { config, registration } = await specimen();
      const value = field === "source_spki_sha256" ? "0".repeat(64) : "test-only-other";
      await expect(prepareC2IssuerPublicAndReverse(pool, config, { ...registration, [field]: value }))
        .rejects.toThrow("C2_HUMAN_ISSUER_COMPOSITION_INVALID");
    });

  it("rejects expired scope, legacy issuer, same human/source key and unapproved native mode", async () => {
    const { config, registration, source } = await specimen();
    for (const invalid of [
      { ...config, installation_scope: { ...config.installation_scope!, valid_until_ms: Date.now() - 1 } },
      { ...config, issuer: "portal-control-api.native-manager-read" },
      { ...config, private_key: source.privateKey },
      { ...config, native_read_custody: {} as NonNullable<CurrentHumanCandidateConfig["native_read_custody"]> },
    ]) await expect(prepareC2IssuerPublicAndReverse(pool, invalid, registration)).rejects.toThrow("C2_HUMAN_ISSUER_COMPOSITION_INVALID");
  });
});

describe("reverse transport rejects mismatched C2 trust before creating a server", () => {
  let cell: string, ca: Buffer, serverCert: Buffer, serverKey: Buffer, clientCert: Buffer, clientCsr: Buffer, otherCsr: Buffer;
  const run = (...args: string[]) => execFileSync("/usr/bin/openssl", args, { cwd: cell, stdio: "ignore", timeout: 10_000 });
  const read = (name: string) => readFileSync(join(cell, name));
  const request = (name: string, purpose: string) => run("req", "-new", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1",
    "-nodes", "-subj", `/CN=TEST_ONLY_${name}`, "-keyout", `${name}.key`, "-out", `${name}.csr`, "-addext", purpose,
    ...(name === "server" ? ["-addext", "subjectAltName=DNS:core.test.invalid"] : []));
  beforeAll(() => {
    cell = mkdtempSync(join(tmpdir(), "c2-issuer-trust-test-"));
    try {
      run("req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes",
        "-subj", "/CN=TEST_ONLY_CA", "-keyout", "ca.key", "-out", "ca.pem", "-days", "365",
        "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign");
      request("server", "extendedKeyUsage=serverAuth"); request("client", "extendedKeyUsage=clientAuth");
      request("other", "extendedKeyUsage=clientAuth");
      for (const [name, serial] of [["server", "1"], ["client", "2"]])
        run("x509", "-req", "-in", `${name}.csr`, "-CA", "ca.pem", "-CAkey", "ca.key", "-set_serial", serial,
          "-days", "180", "-copy_extensions", "copy", "-out", `${name}.pem`);
      ca = read("ca.pem"); serverCert = read("server.pem"); serverKey = read("server.key");
      clientCert = read("client.pem"); clientCsr = read("client.csr"); otherCsr = read("other.csr");
    } catch (error) { rmSync(cell, { recursive: true, force: true }); throw error; }
  }, 20_000);
  afterAll(() => { if (cell) rmSync(cell, { recursive: true, force: true }); });
  async function setup() {
    const { config, registration, own, source } = await specimen();
    const trust: C2PublicTrustInput = { ca_pem: ca, server_certificate_pem: serverCert, client_certificate_pem: clientCert,
      client_csr_pem: clientCsr, source_proof_public_key_pem: Buffer.from(await exportSPKI(config.source.public_key)),
      server_hostname: "core.test.invalid", server_der_sha256: createHash("sha256").update(new X509Certificate(serverCert).raw).digest("hex") };
    const selected = { ...registration, source_client_csr_sha256: createHash("sha256").update(clientCsr).digest("hex"),
      server_hostname: trust.server_hostname, server_certificate_der_sha256: trust.server_der_sha256 };
    const transport: CurrentHumanTransportConfig = { tls: { key: serverKey, cert: serverCert, ca },
      source_certificate_sha256: `sha256:${createHash("sha256").update(new X509Certificate(clientCert).raw).digest("hex")}`,
      limits: { maximum_in_flight: 2, request_bytes: 32768, deadline_ms: 1000 } };
    const otherPool={options:{connectionTimeoutMillis:2000,query_timeout:6000}} as unknown as Pool;
    const custodyConfig={custody_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      source_system_identifier:"1",authority_system_identifier:"2",workspace_id:registration.workspace_id,
      workload_id:registration.source_workload_id,protected_owner_subject:registration.protected_owner_subject,maximum_events:10,
      source_proof_vault:new C2SourceProofVault(randomBytes(32),"test-only-key"),
      original:{issuer:config.issuer,audience:config.audience,key_id:config.key_id,public_key:own.publicKey},
      source:{issuer:config.source.issuer,audience:config.source.audience,key_id:config.source.key_id,public_key:source.publicKey}};
    const custody=new RestoreIndependentCustodyCandidate(pool,otherPool,custodyConfig);
    const otherCustody=new RestoreIndependentCustodyCandidate(pool,otherPool,{...custodyConfig,custody_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"});
    return { prepared: await prepareC2IssuerPublicAndReverse(pool, config, selected), trust, transport, custody, otherCustody,
      custodyConfig,otherPool };
  }
  it("creates exactly one unbound server only after matched issuer, A1 CSR, certificate and pin checks", async () => {
    const { prepared, trust, transport, custody } = await setup();
    await expect(prepared.create_reverse_transport(transport,trust,undefined as unknown as RestoreIndependentCustodyCandidate))
      .rejects.toThrow("C2_HUMAN_ISSUER_COMPOSITION_INVALID");
    const result = await prepared.create_reverse_transport(transport, trust, custody);
    expect(result.server.listening).toBe(false);
    await expect(prepared.create_reverse_transport(transport, trust, custody)).rejects.toThrow("C2_HUMAN_ISSUER_COMPOSITION_INVALID");
  });
  it("rejects a different CSR, source proof key, hostname, leaf pin, CA or TLS private key", async () => {
    const { prepared, trust, transport, custody } = await setup();
    const other = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
    const rejects = (t: CurrentHumanTransportConfig, m: C2PublicTrustInput) =>
      expect(prepared.create_reverse_transport(t, m, custody)).rejects.toThrow("C2_HUMAN_ISSUER_COMPOSITION_INVALID");
    await rejects(transport, { ...trust, client_csr_pem: otherCsr });
    await rejects(transport, { ...trust, client_certificate_pem: serverCert });
    await rejects(transport, { ...trust, source_proof_public_key_pem: Buffer.from(await exportSPKI(other.publicKey)) });
    await rejects(transport, { ...trust, server_hostname: "different.test.invalid" });
    await rejects(transport, { ...trust, server_der_sha256: "0".repeat(64) });
    await rejects({ ...transport, source_certificate_sha256: `sha256:${"0".repeat(64)}` }, trust);
    await rejects({ ...transport, tls: { ...transport.tls, ca: serverCert } }, trust);
    await rejects({ ...transport, tls: { ...transport.tls, key: read("other.key") } }, trust);
    // Refusals release the local construction reservation, not source custody.
    expect((await prepared.create_reverse_transport(transport, trust, custody)).server.listening).toBe(false);
  });
  it("captures trust and TLS bytes before asynchronous verification", async () => {
    const { prepared, trust, transport, custody } = await setup();
    const copied = { ...transport, tls: { key: Buffer.from(serverKey), cert: Buffer.from(serverCert), ca: Buffer.from(ca) } };
    const material = { ...trust, ca_pem: Buffer.from(trust.ca_pem), server_certificate_pem: Buffer.from(trust.server_certificate_pem),
      client_certificate_pem: Buffer.from(trust.client_certificate_pem), client_csr_pem: Buffer.from(trust.client_csr_pem),
      source_proof_public_key_pem: Buffer.from(trust.source_proof_public_key_pem) };
    const pending = prepared.create_reverse_transport(copied, material, custody);
    copied.tls.cert.fill(0); material.client_csr_pem.fill(0);
    expect((await pending).server.listening).toBe(false);
  });
  it("refuses splitting issuance and reverse settlement across custody stores",async()=>{
    const {prepared,trust,transport,custody,otherCustody}=await setup();
    expect(Object.isFrozen(prepared.bind_custodied_issuer(custody))).toBe(true);
    await expect(prepared.create_reverse_transport(transport,trust,otherCustody)).rejects.toThrow("C2_HUMAN_ISSUER_COMPOSITION_INVALID");
    expect((await prepared.create_reverse_transport(transport,trust,custody)).server.listening).toBe(false);
  });
  it("rejects custody with a different public key even if issuer, audience and kid match",async()=>{
    const {prepared,trust,transport,custody,custodyConfig,otherPool}=await setup();
    const alternate=await generateKeyPair("EdDSA",{crv:"Ed25519",extractable:true});
    for(const changed of [
      {...custodyConfig,original:{...custodyConfig.original,public_key:alternate.publicKey}},
      {...custodyConfig,source:{...custodyConfig.source,public_key:alternate.publicKey}},
    ]) {
      const wrong=new RestoreIndependentCustodyCandidate(pool,otherPool,changed);
      expect(()=>prepared.bind_custodied_issuer(wrong)).toThrow("C2_HUMAN_ISSUER_COMPOSITION_INVALID");
      await expect(prepared.create_reverse_transport(transport,trust,wrong)).rejects.toThrow("C2_HUMAN_ISSUER_COMPOSITION_INVALID");
    }
    expect((await prepared.create_reverse_transport(transport,trust,custody)).server.listening).toBe(false);
  });
  it("never issues or resumes using candidate registration without qualified P7, while allowing reverse settlement",async()=>{
    const {prepared,trust,transport,custody}=await setup();
    const issuer=prepared.bind_custodied_issuer(custody);
    const actor={user_id:"test-only-owner",session_id:"test-only-session",session_generation:1};
    const request={method:"POST" as const,raw_path:Buffer.from("/test"),query_string:Buffer.alloc(0),body:Buffer.from("{}")};
    const bounds={request_bytes:1024};
    await expect(issuer.issue(actor,request,bounds)).rejects.toThrow("C2_P7_AUTHORITY_NOT_COMMISSIONED");
    await expect(issuer.resume(actor,request,bounds,"test-only-lease")).rejects.toThrow("C2_P7_AUTHORITY_NOT_COMMISSIONED");
    expect((await prepared.create_reverse_transport(transport,trust,custody)).server.listening).toBe(false);
  });
  it("rechecks the selected custody after asynchronous trust verification",async()=>{
    const {prepared,trust,transport,custody,otherCustody}=await setup();
    const pending=prepared.create_reverse_transport(transport,trust,custody);
    prepared.bind_custodied_issuer(otherCustody);
    await expect(pending).rejects.toThrow("C2_HUMAN_ISSUER_COMPOSITION_INVALID");
    expect((await prepared.create_reverse_transport(transport,trust,otherCustody)).server.listening).toBe(false);
  });
});
