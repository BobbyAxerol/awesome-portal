/** TEST_ONLY CA and keys live solely inside an owned temporary directory. */
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, X509Certificate } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { preflightC2PublicTrust, type C2PublicTrustInput } from "../src/execution-v2/c2-public-trust-preflight";

describe("C2 public trust preflight is not installation", () => {
  let cell: string, input: C2PublicTrustInput, otherCsr: Buffer, shortClient: Buffer, foreignCa: Buffer, badServer: Buffer, badClient: Buffer, badClientCsr: Buffer;
  const run = (...args: string[]) => execFileSync("/usr/bin/openssl", args, { cwd: cell, stdio: "ignore", timeout: 10_000 });
  const read = (name: string) => readFileSync(join(cell, name));
  const request = (name: string, purpose: string) => run("req", "-new", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1",
    "-nodes", "-subj", `/CN=TEST_ONLY_${name}`, "-keyout", `${name}.key`, "-out", `${name}.csr`, "-addext", purpose,
    ...(["server", "badserver"].includes(name) ? ["-addext", "subjectAltName=DNS:core.test.invalid"] : []));
  const sign = (name: string, serial: string, days: string) => run("x509", "-req", "-in", `${name}.csr`, "-CA", "ca.pem", "-CAkey", "ca.key",
    "-set_serial", serial, "-days", days, "-copy_extensions", "copy", "-out", `${name}.pem`);
  beforeAll(() => {
    cell = mkdtempSync(join(tmpdir(), "c2-public-trust-test-"));
    try {
      run("req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes",
        "-subj", "/CN=TEST_ONLY_CA", "-keyout", "ca.key", "-out", "ca.pem", "-days", "365",
        "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign");
      run("req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes",
        "-subj", "/CN=TEST_ONLY_FOREIGN_CA", "-keyout", "foreign.key", "-out", "foreign.pem", "-days", "365",
        "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign");
      foreignCa = read("foreign.pem");
      request("server", "extendedKeyUsage=serverAuth"); sign("server", "1", "180");
      request("client", "extendedKeyUsage=clientAuth"); sign("client", "2", "180");
      request("other", "extendedKeyUsage=clientAuth"); otherCsr = read("other.csr");
      request("badserver", "extendedKeyUsage=clientAuth"); sign("badserver", "4", "180"); badServer = read("badserver.pem");
      request("badclient", "extendedKeyUsage=serverAuth"); sign("badclient", "5", "180"); badClient = read("badclient.pem"); badClientCsr = read("badclient.csr");
      const server = read("server.pem"), proof = generateKeyPairSync("ed25519");
      input = { ca_pem: read("ca.pem"), server_certificate_pem: server, client_certificate_pem: read("client.pem"),
        client_csr_pem: read("client.csr"), source_proof_public_key_pem: Buffer.from(proof.publicKey.export({ type: "spki", format: "pem" })),
        server_hostname: "core.test.invalid", server_der_sha256: createHash("sha256").update(new X509Certificate(server).raw).digest("hex") };
      sign("client", "3", "30"); shortClient = read("client.pem");
    } catch (error) { rmSync(cell, { recursive: true, force: true }); throw error; }
  }, 20_000);
  afterAll(() => { if (cell) rmSync(cell, { recursive: true, force: true }); });
  const rejects = (value: C2PublicTrustInput) => expect(preflightC2PublicTrust(value)).rejects.toThrow("C2_PUBLIC_TRUST_INVALID");
  it("accepts CSR-matched P-256 client with independent Ed25519 proof only as uninstalled public material", async () => {
    await expect(preflightC2PublicTrust(input)).resolves.toMatchObject({ state: "PUBLIC_MATERIAL_VALID_NOT_INSTALLED", server_der_sha256: input.server_der_sha256 });
  });
  it("rejects a different valid signed CSR and corrupted CSR signature", async () => {
    await rejects({ ...input, client_csr_pem: otherCsr });
    const encoded = input.client_csr_pem.toString().replace(/-----[^-]+-----|\s/g, "");
    const der = Buffer.from(encoded, "base64"); der[der.length - 1] = der[der.length - 1]! ^ 1;
    const body = der.toString("base64").match(/.{1,64}/g)!.join("\n");
    await rejects({ ...input, client_csr_pem: Buffer.from(`-----BEGIN CERTIFICATE REQUEST-----\n${body}\n-----END CERTIFICATE REQUEST-----\n`) });
  });
  it("rejects untrusted CA, incorrect hostname and server leaf pin", async () => {
    await rejects({ ...input, ca_pem: foreignCa });
    await rejects({ ...input, server_hostname: "other.test.invalid" });
    await rejects({ ...input, server_der_sha256: "0".repeat(64) });
  });
  it("rejects mismatched server and client EKUs", async () => {
    const badPin = createHash("sha256").update(new X509Certificate(badServer).raw).digest("hex");
    await rejects({ ...input, server_certificate_pem: badServer, server_der_sha256: badPin });
    await rejects({ ...input, client_certificate_pem: badClient, client_csr_pem: badClientCsr });
  });
  it("rejects client certificates with less than 120 days remaining", async () => {
    await rejects({ ...input, client_certificate_pem: shortClient });
  });
  it("rejects non-Ed25519 and private proof keys", async () => {
    const ec = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    await rejects({ ...input, source_proof_public_key_pem: Buffer.from(ec.publicKey.export({ type: "spki", format: "pem" })) });
    const ed = generateKeyPairSync("ed25519");
    await rejects({ ...input, source_proof_public_key_pem: Buffer.from(ed.privateKey.export({ type: "pkcs8", format: "pem" })) });
  });
});
