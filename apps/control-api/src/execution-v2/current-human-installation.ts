import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { createHash, createPrivateKey, createPublicKey, X509Certificate } from "node:crypto";
import { isAbsolute, join, resolve } from "node:path";
import { importPKCS8, importSPKI, type KeyLike } from "jose";
import type { Pool } from "pg";
import { z } from "zod";
import { CurrentHumanCandidate, CurrentHumanLeaseError, type CurrentHumanCandidateConfig } from "./current-human-candidate";
import { CurrentHumanMutations } from "./current-human-mutations";
import { CurrentHumanRecoveryClient } from "./current-human-recovery-client";
import { createCurrentHumanTransport, type CurrentHumanTransportConfig } from "./current-human-transport";

const text = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const time = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const party = z.object({ issuer: text, audience: text, key_id: text,
  hostname: z.literal("core.elp210.candidate.invalid"), certificate_sha256: digest, signer_spki_sha256: digest }).strict();
export const candidateTrustManifest = z.object({
  schema_version: z.literal("elp210.candidate-trust.v1"),
  qualification: z.literal("CANDIDATE_ONLY_NOT_BUSINESS_AUTHORITY"),
  candidate_id: z.string().regex(/^elp210-[a-f0-9-]{36}$/),
  workspace_id: text, environment: z.literal("paper"), created_at_ms: time, expires_at_ms: time,
  core: party,
  pm: party.extend({ hostname: z.literal("pm.elp210.candidate.invalid"), workload_id: text }).strict(),
  ca_certificate_sha256: digest,
  // Deliberately impossible to grant business or Live authority by editing config.
  authority: z.object({ mapping: z.literal("NOT_INSTALLED"), grants: z.literal("NOT_INSTALLED"),
    application_policy: z.literal("NOT_INSTALLED"), field_policy: z.literal("NOT_INSTALLED"),
    business_reads: z.literal(false), commands: z.literal(false), live: z.literal(false) }).strict(),
}).strict();
export type CandidateTrustManifest = z.infer<typeof candidateTrustManifest>;
export interface CandidateTrustSelection {
  directory: string;
  /** Independent provisioning/selection receipt, not a value read back from trust.json. */
  candidate_id: string;
  manifest_sha256: string;
  workspace_id: string;
}
export interface LoadedCandidateTrust {
  manifest: CandidateTrustManifest;
  candidate: Pick<CurrentHumanCandidateConfig, "issuer" | "audience" | "key_id" | "private_key" | "source" | "installation_scope">;
  tls: CurrentHumanTransportConfig["tls"];
}
const hash = (value: Buffer) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const fail = (): never => { throw new CurrentHumanLeaseError("CURRENT_HUMAN_INSTALLATION_TRUST_INVALID"); };

// The HTTP wire parser intentionally only accepts flat string/boolean messages;
// do not widen that security boundary to load this nested configuration. Parse
// the small manifest grammar separately, rejecting duplicate/escaped-alias keys
// at EVERY level before Zod validates its exact shape. No arrays, null, coercion,
// non-finite values or unbounded nesting are part of this contract.
function parseManifest(bytes: Buffer): unknown {
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const quoted = /"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y;
  const numeric = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
  let i = 0, keys = 0;
  const ws = () => { while (i < source.length && /[\x20\t\n\r]/.test(source[i]!)) i++; };
  const string = (): string => {
    quoted.lastIndex = i;
    const match = quoted.exec(source);
    if (!match) return fail();
    i = quoted.lastIndex;
    return JSON.parse(match[0]) as string;
  };
  const value = (depth: number): unknown => {
    ws();
    if (source[i] === '"') return string();
    if (source[i] === "{") {
      if (depth > 3) return fail();
      i++; ws();
      const object: Record<string, unknown> = Object.create(null);
      if (source[i] !== "}") for (;;) {
        const key = string();
        if (++keys > 64 || Object.hasOwn(object, key)) return fail();
        ws(); if (source[i++] !== ":") return fail();
        object[key] = value(depth + 1);
        ws(); if (source[i] !== ",") break;
        i++; ws();
      }
      if (source[i++] !== "}") return fail();
      return object;
    }
    if (source.slice(i, i + 4) === "true") { i += 4; return true; }
    if (source.slice(i, i + 5) === "false") { i += 5; return false; }
    numeric.lastIndex = i;
    const match = numeric.exec(source);
    if (!match) return fail();
    i = numeric.lastIndex;
    const number = Number(match[0]);
    if (!Number.isFinite(number)) return fail();
    return number;
  };
  const result = value(0);
  ws(); if (i !== source.length) return fail();
  return result;
}

/** No process-global CA, environment secrets, alternate file names or symlink
 * traversal. Opens each fixed file once with O_NOFOLLOW; bounds before/after
 * read and requires private regular single-link files owned by this account.
 * Every returned Buffer stays in process memory, never metadata/log output. */
async function privateFile(directory: string, name: string): Promise<Buffer> {
  const file = await open(join(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.geteuid?.()
      || (stat.mode & 0o077) !== 0 || stat.size < 1 || stat.size > 32768) fail();
    const buffer = Buffer.alloc(Number(stat.size) + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    const after = await file.stat();
    if (bytesRead !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs
      || after.ctimeMs !== stat.ctimeMs) fail();
    return buffer.subarray(0, bytesRead);
  } finally { await file.close(); }
}

function publicBytes(key: ReturnType<typeof createPublicKey>): Buffer {
  if (key.asymmetricKeyType !== "ed25519") fail();
  return key.export({ type: "spki", format: "der" });
}

/** Load only Core's half. PM's private TLS/signing keys are never mounted/read.
 * Fresh CA+leaf verification plus exact independently selected manifest hash,
 * issuer/audience/kid/workspace, hostname, key pair and lifetime checks precede
 * construction of any provider, socket or database operation. Still NOT a
 * verified TS mapping/grant/current-policy provider. */
export async function loadCurrentHumanCandidateTrust(selection: CandidateTrustSelection): Promise<LoadedCandidateTrust> {
  try {
    if (!isAbsolute(selection.directory) || !digest.safeParse(selection.manifest_sha256).success) fail();
    const directory = resolve(selection.directory), stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.geteuid?.()
      || (stat.mode & 0o077) !== 0 || await realpath(directory) !== directory) fail();
    const raw = await privateFile(directory, "trust.json");
    if (hash(raw) !== selection.manifest_sha256) fail();
    const manifest = candidateTrustManifest.parse(parseManifest(raw));
    const now = Date.now();
    if (manifest.candidate_id !== selection.candidate_id || manifest.workspace_id !== selection.workspace_id
      || manifest.created_at_ms > now || manifest.expires_at_ms <= now
      || manifest.expires_at_ms - manifest.created_at_ms > 86400_000
      || manifest.expires_at_ms <= manifest.created_at_ms) fail();
    // The naming convention is an isolation constraint, not a policy grant.
    const prefix = `urn:${manifest.candidate_id}`;
    if (manifest.core.issuer !== `${prefix}:core` || manifest.pm.issuer !== `${prefix}:pm`
      || manifest.core.audience !== manifest.pm.issuer || manifest.pm.audience !== manifest.core.issuer
      || manifest.core.key_id !== `${manifest.candidate_id}:core` || manifest.pm.key_id !== `${manifest.candidate_id}:pm`
      || manifest.pm.workload_id !== `${manifest.candidate_id}:pm`) fail();
    const [caPem, certPem, keyPem, signerPem, signerPublicPem, peerCertPem, peerSignerPem] = await Promise.all(
      ["ca.pem", "tls.crt.pem", "tls.key.pem", "signer.key.pem", "signer.pub.pem", "peer-tls.crt.pem", "peer-signer.pub.pem"]
        .map(name => privateFile(directory, name)));
    const ca = new X509Certificate(caPem), cert = new X509Certificate(certPem), peer = new X509Certificate(peerCertPem);
    if (!ca.ca || !ca.verify(ca.publicKey) || cert.ca || peer.ca
      || !cert.checkIssued(ca) || !cert.verify(ca.publicKey) || !peer.checkIssued(ca) || !peer.verify(ca.publicKey)
      || hash(ca.raw) !== manifest.ca_certificate_sha256 || hash(cert.raw) !== manifest.core.certificate_sha256
      || hash(peer.raw) !== manifest.pm.certificate_sha256 || manifest.core.certificate_sha256 === manifest.pm.certificate_sha256
      || cert.checkHost(manifest.core.hostname) !== manifest.core.hostname
      || peer.checkHost(manifest.pm.hostname) !== manifest.pm.hostname
      || cert.checkIP("127.0.0.1") !== "127.0.0.1" || peer.checkIP("127.0.0.1") !== "127.0.0.1") fail();
    for (const certificate of [ca, cert, peer]) {
      if (Date.parse(certificate.validFrom) > now || Date.parse(certificate.validTo) < manifest.expires_at_ms
        || Date.parse(certificate.validTo) <= now) fail();
    }
    for (const certificate of [cert, peer])
      if (!certificate.keyUsage?.includes("1.3.6.1.5.5.7.3.1") || !certificate.keyUsage.includes("1.3.6.1.5.5.7.3.2")) fail();
    const tlsKey = createPrivateKey(keyPem), signerKey = createPrivateKey(signerPem);
    const signerPublic = createPublicKey(signerPublicPem), peerSigner = createPublicKey(peerSignerPem);
    if (tlsKey.asymmetricKeyType !== "ed25519" || signerKey.asymmetricKeyType !== "ed25519"
      || !publicBytes(createPublicKey(tlsKey)).equals(publicBytes(cert.publicKey))
      || !publicBytes(createPublicKey(signerKey)).equals(publicBytes(signerPublic))
      || hash(publicBytes(signerPublic)) !== manifest.core.signer_spki_sha256
      || hash(publicBytes(peerSigner)) !== manifest.pm.signer_spki_sha256) fail();
    const distinct = [ca.publicKey, cert.publicKey, peer.publicKey, signerPublic, peerSigner].map(k => publicBytes(k).toString("hex"));
    if (new Set(distinct).size !== distinct.length) fail();
    const private_key = await importPKCS8(signerPem.toString("utf8"), "EdDSA");
    const sourceKey = await importSPKI(peerSignerPem.toString("utf8"), "EdDSA");
    return { manifest, candidate: {
      issuer: manifest.core.issuer, audience: manifest.core.audience, key_id: manifest.core.key_id, private_key,
      installation_scope: { workspace_id: manifest.workspace_id, environment: manifest.environment, valid_until_ms: manifest.expires_at_ms },
      source: { issuer: manifest.pm.issuer, audience: manifest.pm.audience, key_id: manifest.pm.key_id,
        public_key: sourceKey as KeyLike, workload_id: manifest.pm.workload_id },
    }, tls: { ca: caPem, cert: certPem, key: keyPem } };
  } catch { return fail(); }
}

/** Explicit private composition only. Never installs SQL, seeds a user/grant,
 * listens, issues a session/token, imports into main.ts or enables read/command
 * providers. Caller must inject mutations into createControlApi using THIS
 * Core pool before allowing any issuance. Private listener allocation belongs
 * to the approved installer/cell, and must close before pool.end(). */
export async function composeCurrentHumanCandidateInstallation(pool: Pool, selection: CandidateTrustSelection,
  input: {
    source_origin: string;
    candidate_limits: CurrentHumanCandidateConfig["limits"];
    transport_limits: CurrentHumanTransportConfig["limits"];
    mutation_limits: { maximum_intents: number; maximum_recoveries_per_request: number };
    recovery_limits: { deadline_ms: number; response_bytes: number };
  }) {
  const trust = await loadCurrentHumanCandidateTrust(selection);
  let origin: URL;
  try { origin = new URL(input.source_origin); } catch { return fail(); }
  if (!["127.0.0.1", trust.manifest.pm.hostname].includes(origin.hostname)) fail();
  const candidate = await CurrentHumanCandidate.create(pool, { ...trust.candidate, limits: input.candidate_limits });
  const recovery = new CurrentHumanRecoveryClient({ origin: input.source_origin, tls: trust.tls,
    source_certificate_sha256: trust.manifest.pm.certificate_sha256, ...input.recovery_limits });
  const mutations = new CurrentHumanMutations(pool, candidate, recovery, input.mutation_limits);
  const transport = createCurrentHumanTransport(candidate, { tls: trust.tls,
    source_certificate_sha256: trust.manifest.pm.certificate_sha256, limits: input.transport_limits });
  return { candidate, mutations, transport,
    metadata: Object.freeze({ candidate_id: trust.manifest.candidate_id, workspace_id: trust.manifest.workspace_id,
      environment: trust.manifest.environment, expires_at_ms: trust.manifest.expires_at_ms,
      qualification: trust.manifest.qualification, business_reads: false, commands: false, live: false }) };
}
