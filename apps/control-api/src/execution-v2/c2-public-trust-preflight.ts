import { spawn } from "node:child_process";
import { createHash, createPublicKey, X509Certificate, type KeyObject } from "node:crypto";
import { mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Public-material check only: never selects a source, installs authority,
 * signs a certificate or grants permission to run a listener. */
export interface C2PublicTrustInput {
  ca_pem: Buffer;
  server_certificate_pem: Buffer;
  client_certificate_pem: Buffer;
  client_csr_pem: Buffer;
  source_proof_public_key_pem: Buffer;
  server_hostname: string;
  server_der_sha256: string;
}
export interface C2PublicTrustPreflightResult {
  readonly state: "PUBLIC_MATERIAL_VALID_NOT_INSTALLED";
  readonly server_der_sha256: string;
  readonly client_der_sha256: string;
  readonly client_remaining_ms: number;
}

const fail = (): never => { throw new Error("C2_PUBLIC_TRUST_INVALID"); };
const MAX_PEM_BYTES = 32768;
const MIN_CLIENT_REMAINING_MS = 120 * 24 * 60 * 60 * 1000;
const SERVER_AUTH = "1.3.6.1.5.5.7.3.1", CLIENT_AUTH = "1.3.6.1.5.5.7.3.2";
const bytes = (input: Buffer): Buffer => {
  if (!Buffer.isBuffer(input) || input.length < 1 || input.length > MAX_PEM_BYTES) return fail();
  return Buffer.from(input);
};
const hash = (input: Buffer) => createHash("sha256").update(input).digest("hex");
const spki = (key: KeyObject): Buffer => key.export({ type: "spki", format: "der" });
const publicPem = (input: Buffer, label: "CERTIFICATE" | "PUBLIC KEY"): Buffer => {
  const copied = bytes(input), text = copied.toString("ascii");
  if (!new RegExp(`^-----BEGIN ${label}-----\\r?\\n(?:[A-Za-z0-9+/=]+\\r?\\n)+-----END ${label}-----\\r?\\n?$`).test(text)) return fail();
  return copied;
};

/** OpenSSL verifies the CSR's actual signature and returns its embedded public
 * key. No shell, no files and bounded execution/output. Exit status alone is
 * insufficient: some OpenSSL versions report a bad CSR signature on stderr
 * while returning zero, therefore require the explicit verification result. */
async function openssl(args: string[], input: Buffer): Promise<{ code: number | null; stdout: Buffer; stderr: Buffer }> {
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/openssl", args, {
      env: { LC_ALL: "C" }, stdio: ["pipe", "pipe", "pipe"],
    });
    const output: Buffer[] = [], errors: Buffer[] = [];
    let total = 0, finished = false;
    const stop = () => { try { child.kill("SIGKILL"); } catch { /* Fail closed below. */ } };
    const timer = setTimeout(() => { stop(); end(new Error("C2_CSR_TIMEOUT")); }, 3000);
    timer.unref();
    const end = (error?: Error, code: number | null = null) => {
      if (finished) return; finished = true; clearTimeout(timer);
      if (error) reject(error); else resolve({ code, stdout: Buffer.concat(output), stderr: Buffer.concat(errors) });
    };
    const collect = (target: Buffer[]) => (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_PEM_BYTES) { stop(); end(new Error("C2_CSR_OUTPUT_TOO_LARGE")); return; }
      target.push(Buffer.from(chunk));
    };
    child.stdout.on("data", collect(output)); child.stderr.on("data", collect(errors));
    child.on("error", () => end(new Error("C2_CSR_PROCESS_ERROR")));
    child.stdin.on("error", () => { stop(); end(new Error("C2_CSR_INPUT_ERROR")); });
    child.on("close", code => end(undefined, code));
    child.stdin.end(input);
  });
}

async function verifiedCsrPublicKey(csr: Buffer): Promise<KeyObject> {
  const text = csr.toString("ascii");
  if (!/^-----BEGIN CERTIFICATE REQUEST-----\r?\n(?:[A-Za-z0-9+/=]+\r?\n)+-----END CERTIFICATE REQUEST-----\r?\n?$/.test(text)) return fail();
  const checked = await openssl(["req", "-verify", "-noout", "-pubkey"], csr);
  if (checked.code !== 0 || checked.stderr.toString("utf8").trim() !== "Certificate request self-signature verify OK") return fail();
  return createPublicKey(checked.stdout);
}

/** Verify actual X.509 path/purpose constraints, not only issuer signatures.
 * The CA is public; an exact owned 0700 temporary directory is always cleaned. */
async function verifyChains(ca: Buffer, server: Buffer, client: Buffer): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "c2-public-ca-")), caFile = join(dir, "ca.pem");
  try {
    await writeFile(caFile, ca, { mode: 0o600, flag: "wx" });
    for (const [purpose, cert] of [["sslserver", server], ["sslclient", client]] as const) {
      const checked = await openssl(["verify", "-CAfile", caFile, "-purpose", purpose], cert);
      if (checked.code !== 0 || checked.stdout.toString("utf8").trim() !== "stdin: OK" || checked.stderr.length !== 0) return fail();
    }
  } finally {
    try { await unlink(caFile); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    await rmdir(dir);
  }
}

export async function preflightC2PublicTrust(input: C2PublicTrustInput): Promise<C2PublicTrustPreflightResult> {
  try {
    const now = Date.now(), host = input.server_hostname, pin = input.server_der_sha256;
    const caBytes = publicPem(input.ca_pem, "CERTIFICATE"), serverBytes = publicPem(input.server_certificate_pem, "CERTIFICATE");
    const clientBytes = publicPem(input.client_certificate_pem, "CERTIFICATE");
    const ca = new X509Certificate(caBytes), server = new X509Certificate(serverBytes), client = new X509Certificate(clientBytes);
    const proof = createPublicKey(publicPem(input.source_proof_public_key_pem, "PUBLIC KEY"));
    const csrKey = await verifiedCsrPublicKey(bytes(input.client_csr_pem));
    if (!Number.isSafeInteger(now) || now < 0 || typeof host !== "string" || host.length < 1 || host.length > 253 ||
      /[^A-Za-z0-9.:-]/.test(host) || !/^[a-f0-9]{64}$/.test(pin)) return fail();
    const hostname = isIP(host) ? server.checkIP(host) : server.checkHost(host, { subject: "never" });
    const current = (cert: X509Certificate) => Date.parse(cert.validFrom) <= now && Date.parse(cert.validTo) > now;
    const caExpiry = Date.parse(ca.validTo), clientExpiry = Date.parse(client.validTo);
    if (!ca.ca || !ca.verify(ca.publicKey) || server.ca || client.ca ||
      !server.checkIssued(ca) || !server.verify(ca.publicKey) || !client.checkIssued(ca) || !client.verify(ca.publicKey) ||
      !current(ca) || !current(server) || !current(client) || !Number.isFinite(caExpiry) || !Number.isFinite(clientExpiry) ||
      clientExpiry - now < MIN_CLIENT_REMAINING_MS || clientExpiry > caExpiry || Date.parse(server.validTo) > caExpiry ||
      !hostname || !server.keyUsage?.includes(SERVER_AUTH) || !client.keyUsage?.includes(CLIENT_AUTH) ||
      hash(server.raw) !== pin ||
      csrKey.asymmetricKeyType !== "ec" || csrKey.asymmetricKeyDetails?.namedCurve !== "prime256v1" ||
      !spki(csrKey).equals(spki(client.publicKey)) || proof.asymmetricKeyType !== "ed25519" ||
      spki(proof).equals(spki(client.publicKey)) || spki(proof).equals(spki(server.publicKey)) ||
      spki(proof).equals(spki(ca.publicKey))) return fail();
    await verifyChains(caBytes, serverBytes, clientBytes);
    const completedAt = Date.now();
    if (!Number.isSafeInteger(completedAt) || completedAt < now || Date.parse(server.validTo) <= completedAt ||
      caExpiry <= completedAt || clientExpiry - completedAt < MIN_CLIENT_REMAINING_MS) return fail();
    return Object.freeze({ state: "PUBLIC_MATERIAL_VALID_NOT_INSTALLED", server_der_sha256: hash(server.raw),
      client_der_sha256: hash(client.raw), client_remaining_ms: clientExpiry - completedAt });
  } catch { return fail(); }
}
