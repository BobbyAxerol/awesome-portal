/** Real ephemeral Ed25519/X509 files and the actual private loader/composer.
 * TEST_ONLY custody/config correctness: no DB, network listener, source grant,
 * installed human authority, production trust or runtime commissioning proof.
 * The CA private key exists only in memory; each party receives its own secrets.
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, randomUUID,
  sign, X509Certificate, type KeyObject, type KeyPairKeyObjectResult } from "node:crypto";
import { chmodSync, cpSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportJWK } from "jose";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { candidateTrustManifest, composeCurrentHumanCandidateInstallation, loadCurrentHumanCandidateTrust,
  type CandidateTrustManifest, type CandidateTrustSelection } from "../src/execution-v2/current-human-installation";

const fingerprint = (bytes: Buffer | string) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const publicDer = (key: KeyObject): Buffer => key.export({ type: "spki", format: "der" }) as Buffer;
const privatePem = (key: KeyObject) => key.export({ type: "pkcs8", format: "pem" });
const publicPem = (key: KeyObject) => key.export({ type: "spki", format: "pem" });
const privateWrite = (path: string, bytes: Buffer | string) => writeFileSync(path, bytes, { mode: 0o600, flag: "wx" });

// Independent TEST_ONLY RFC5280 fixture, as in the real transport test. This
// keeps the standard pinned API image dependency-free: Node's actual X509/TLS
// stack verifies these signatures; no mocked parser, openssl binary or fixture CA.
const der = (tag: number, ...parts: Buffer[]) => {
  const bytes = Buffer.concat(parts);
  const length = bytes.length < 128 ? Buffer.from([bytes.length]) : (() => {
    let hex = bytes.length.toString(16); if (hex.length % 2) hex = `0${hex}`;
    const size = Buffer.from(hex, "hex"); return Buffer.concat([Buffer.from([0x80 | size.length]), size]);
  })();
  return Buffer.concat([Buffer.from([tag]), length, bytes]);
};
const seq = (...parts: Buffer[]) => der(0x30, ...parts);
const oid = (hex: string) => der(0x06, Buffer.from(hex, "hex"));
const yes = () => der(0x01, Buffer.from([0xff]));
const algorithm = seq(oid("2b6570"));
const name = (value: string) => seq(der(0x31, seq(oid("550403"), der(0x0c, Buffer.from(value)))));
const pem = (bytes: Buffer) => Buffer.from(`-----BEGIN CERTIFICATE-----\n${bytes.toString("base64").match(/.{1,64}/g)!.join("\n")}\n-----END CERTIFICATE-----\n`);
type LeafOptions = { hostname?: string; ip?: number[]; not_before_ms?: number; not_after_ms?: number;
  client_usage?: boolean; server_usage?: boolean; is_ca?: boolean };
function certificate(subject: Buffer, keys: KeyPairKeyObjectResult, issuer: { subject: Buffer; key: KeyObject },
  ca: boolean, now: number, options: LeafOptions = {}): Buffer {
  const date = (at: number) => der(0x18, Buffer.from(new Date(at).toISOString()
    .replace(/[-:]/g, "").replace("T", "").slice(0, 14) + "Z"));
  const extension = (id: string, value: Buffer, critical = false) =>
    seq(oid(id), ...(critical ? [yes()] : []), der(0x04, value));
  const extensions = [extension("551d13", ca ? seq(yes(), der(0x02, Buffer.from([0]))) : seq(), true),
    extension("551d0f", der(0x03, Buffer.from(ca ? [1, 6] : [7, 0x80])), true)];
  if (!ca) {
    const usages = [...(options.server_usage !== false ? [oid("2b06010505070301")] : []),
      ...(options.client_usage !== false ? [oid("2b06010505070302")] : [])];
    extensions.push(extension("551d25", seq(...usages)), extension("551d11", seq(
      der(0x82, Buffer.from(options.hostname!)), der(0x87, Buffer.from(options.ip ?? [127, 0, 0, 1])))));
  }
  const tbs = seq(der(0xa0, der(0x02, Buffer.from([2]))),
    der(0x02, Buffer.from([1]), randomBytes(15)), algorithm, issuer.subject,
    seq(date(options.not_before_ms ?? now - 60_000), date(options.not_after_ms ?? now + 86_400_000)),
    subject, publicDer(keys.publicKey), der(0xa3, seq(...extensions)));
  return pem(seq(tbs, algorithm, der(0x03, Buffer.from([0]), sign(null, tbs, issuer.key))));
}

describe("ELP2-10 candidate installation trust custody (TEST_ONLY real X509 files)", () => {
  let root: string;
  let base: CandidateTrustSelection, foreign: CandidateTrustSelection;
  const copies: string[] = [];
  const fixture = (options: { core?: LeafOptions; pm?: LeafOptions } = {}): CandidateTrustSelection => {
    const directory = mkdtempSync(join(root, "bundle-")); chmodSync(directory, 0o700);
    copies.push(directory);
    const coreDirectory = join(directory, "core"), pmDirectory = join(directory, "pm");
    mkdirSync(coreDirectory, { mode: 0o700 }); mkdirSync(pmDirectory, { mode: 0o700 });
    const now = Date.now(), candidate_id = `elp210-${randomUUID()}`;
    const ca = generateKeyPairSync("ed25519"), caSubject = name(`TEST_ONLY_${candidate_id}`);
    const caPem = certificate(caSubject, ca, { subject: caSubject, key: ca.privateKey }, true, now);
    const leaves = Object.fromEntries((["core", "pm"] as const).map(party => {
      const tls = generateKeyPairSync("ed25519"), signer = generateKeyPairSync("ed25519");
      const settings = options[party] ?? {}, hostname = `${party}.elp210.candidate.invalid`;
      const cert = certificate(name(hostname), tls, { subject: caSubject, key: ca.privateKey },
        settings.is_ca === true, now, { hostname, ...settings });
      const target = join(directory, party);
      privateWrite(join(target, "tls.key.pem"), privatePem(tls.privateKey));
      privateWrite(join(target, "tls.crt.pem"), cert);
      privateWrite(join(target, "signer.key.pem"), privatePem(signer.privateKey));
      privateWrite(join(target, "signer.pub.pem"), publicPem(signer.publicKey));
      return [party, { cert, signer }];
    })) as Record<"core" | "pm", { cert: Buffer; signer: KeyPairKeyObjectResult }>;
    const manifest = {
      schema_version: "elp210.candidate-trust.v1", qualification: "CANDIDATE_ONLY_NOT_BUSINESS_AUTHORITY",
      candidate_id, workspace_id: "TEST_ONLY-workspace", environment: "paper", created_at_ms: now,
      expires_at_ms: now + 3_600_000,
      core: { issuer: `urn:${candidate_id}:core`, audience: `urn:${candidate_id}:pm`, key_id: `${candidate_id}:core`,
        hostname: "core.elp210.candidate.invalid", certificate_sha256: fingerprint(new X509Certificate(leaves.core.cert).raw),
        signer_spki_sha256: fingerprint(publicDer(leaves.core.signer.publicKey)) },
      pm: { issuer: `urn:${candidate_id}:pm`, audience: `urn:${candidate_id}:core`, key_id: `${candidate_id}:pm`,
        hostname: "pm.elp210.candidate.invalid", certificate_sha256: fingerprint(new X509Certificate(leaves.pm.cert).raw),
        signer_spki_sha256: fingerprint(publicDer(leaves.pm.signer.publicKey)), workload_id: `${candidate_id}:pm` },
      ca_certificate_sha256: fingerprint(new X509Certificate(caPem).raw),
      authority: { mapping: "NOT_INSTALLED", grants: "NOT_INSTALLED", application_policy: "NOT_INSTALLED",
        field_policy: "NOT_INSTALLED", business_reads: false, commands: false, live: false },
    };
    const raw = `${JSON.stringify(manifest, null, 2)}\n`;
    for (const party of ["core", "pm"] as const) {
      const target = join(directory, party), peer = party === "core" ? "pm" : "core";
      privateWrite(join(target, "trust.json"), raw); privateWrite(join(target, "ca.pem"), caPem);
      privateWrite(join(target, "peer-tls.crt.pem"), leaves[peer].cert);
      privateWrite(join(target, "peer-signer.pub.pem"), publicPem(leaves[peer].signer.publicKey));
    }
    // This construction never writes a CA key or either party's peer secrets.
    return { directory: coreDirectory, candidate_id, manifest_sha256: fingerprint(raw), workspace_id: manifest.workspace_id };
  };
  const copy = (): CandidateTrustSelection => {
    const directory = mkdtempSync(join(root, "core-copy-")); chmodSync(directory, 0o700);
    cpSync(base.directory, directory, { recursive: true }); copies.push(directory);
    return { ...base, directory };
  };
  const manifestOf = (selection: CandidateTrustSelection) =>
    JSON.parse(readFileSync(join(selection.directory, "trust.json"), "utf8")) as CandidateTrustManifest;
  const writeManifest = (selection: CandidateTrustSelection, value: unknown): CandidateTrustSelection => {
    const raw = `${JSON.stringify(value)}\n`;
    writeFileSync(join(selection.directory, "trust.json"), raw, { mode: 0o600 });
    return { ...selection, manifest_sha256: fingerprint(raw) };
  };
  const invalid = (selection: CandidateTrustSelection) =>
    expect(loadCurrentHumanCandidateTrust(selection)).rejects.toMatchObject({ code: "CURRENT_HUMAN_INSTALLATION_TRUST_INVALID" });
  const replace = (selection: CandidateTrustSelection, destination: string, from: string) =>
    writeFileSync(join(selection.directory, destination), readFileSync(from), { mode: 0o600 });

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "elp210-installation-test-")); chmodSync(root, 0o700);
    base = fixture(); foreign = fixture();
    // Baseline fixtures remain immutable across cases; only their owned copies
    // and independently generated malformed bundles are removed after each case.
    copies.splice(0);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    for (const directory of copies.splice(0)) rmSync(directory, { recursive: true, force: true });
  });
  afterAll(() => { if (root) rmSync(root, { recursive: true, force: true }); });

  it("loads exact selected real certificates and separate Ed25519 signing keys without a source authority", async () => {
    const loaded = await loadCurrentHumanCandidateTrust(base);
    expect(candidateTrustManifest.parse(manifestOf(base))).toEqual(loaded.manifest);
    expect(loaded.candidate.issuer).toBe(loaded.manifest.core.issuer);
    expect(loaded.candidate.source.issuer).toBe(loaded.manifest.pm.issuer);
    expect(loaded.candidate.source.workload_id).toBe(loaded.manifest.pm.workload_id);
    expect(loaded.candidate.installation_scope).toEqual({ workspace_id: base.workspace_id,
      environment: "paper", valid_until_ms: loaded.manifest.expires_at_ms });
    const own = await exportJWK(loaded.candidate.private_key), source = await exportJWK(loaded.candidate.source.public_key);
    expect(own).toMatchObject({ kty: "OKP", crv: "Ed25519" }); expect(own.d).toBeTypeOf("string");
    expect(source).toMatchObject({ kty: "OKP", crv: "Ed25519" }); expect(source.d).toBeUndefined();
    expect(source.x).not.toBe(own.x);
    expect(loaded.manifest.authority).toEqual({ mapping: "NOT_INSTALLED", grants: "NOT_INSTALLED",
      application_policy: "NOT_INSTALLED", field_policy: "NOT_INSTALLED", business_reads: false, commands: false, live: false });
    expect(Object.keys(loaded).sort()).toEqual(["candidate", "manifest", "tls"]);
    expect(readdirSync(base.directory).sort()).toEqual(["ca.pem", "peer-signer.pub.pem", "peer-tls.crt.pem",
      "signer.key.pem", "signer.pub.pem", "tls.crt.pem", "tls.key.pem", "trust.json"]);
    for (const file of readdirSync(base.directory)) expect(statSync(join(base.directory, file)).mode & 0o777).toBe(0o600);
    expect(createPublicKey(createPrivateKey(loaded.tls.key as Buffer)).export({ type: "spki", format: "der" }))
      .toEqual(new X509Certificate(loaded.tls.cert as Buffer).publicKey.export({ type: "spki", format: "der" }));
  });

  it("composes an unbound private server with the same unused real Pool, without DB/network/grant seeding", async () => {
    const pool = new Pool({ host: "127.0.0.1", port: 1, connectionTimeoutMillis: 1000, query_timeout: 1000, max: 1 });
    let installation: Awaited<ReturnType<typeof composeCurrentHumanCandidateInstallation>> | undefined;
    try {
      const input = {
        source_origin: "https://127.0.0.1:6443", candidate_limits: { ttl_ms: 5000, maximum_unresolved: 2, maximum_retained: 8 },
        transport_limits: { maximum_in_flight: 2, request_bytes: 32768, deadline_ms: 1000 },
        mutation_limits: { maximum_intents: 8, maximum_recoveries_per_request: 2 },
        recovery_limits: { deadline_ms: 1000, response_bytes: 32768 },
      };
      await expect(composeCurrentHumanCandidateInstallation(pool, base, { ...input,
        source_origin: "https://production.example.com" }))
        .rejects.toMatchObject({ code: "CURRENT_HUMAN_INSTALLATION_TRUST_INVALID" });
      installation = await composeCurrentHumanCandidateInstallation(pool, base, input);
      expect(installation.candidate.usesPool(pool)).toBe(true); expect(installation.mutations.usesPool(pool)).toBe(true);
      expect(pool.totalCount).toBe(0); expect(pool.waitingCount).toBe(0);
      expect(installation.transport.server.listening).toBe(false); expect(installation.transport.server.address()).toBeNull();
      expect(installation.transport.snapshot()).toEqual({ in_flight: 0, accepted: 0, denied: 0, timed_out: 0 });
      expect(installation.metadata).toMatchObject({ candidate_id: base.candidate_id, workspace_id: base.workspace_id,
        environment: "paper", qualification: "CANDIDATE_ONLY_NOT_BUSINESS_AUTHORITY", business_reads: false, commands: false, live: false });
      expect(Object.isFrozen(installation.metadata)).toBe(true);
      expect(JSON.stringify(installation.metadata)).not.toMatch(/BEGIN|private_key|signer|session|token|password/);
      const actor = { user_id: "TEST_ONLY-unverified-user", session_id: "TEST_ONLY-unverified-session", session_generation: 0 };
      const binding = { workspace_id: base.workspace_id, environment: "paper" as const,
        workload_id: manifestOf(base).pm.workload_id, request_digest: `sha256:${"a".repeat(64)}` };
      // These are refusal proofs only: no actor is authenticated and no SQL is
      // allowed to run, even though the Pool intentionally points to a dead port.
      await expect(installation.candidate.issue(actor, { ...binding, workspace_id: "TEST_ONLY-other-workspace" }))
        .rejects.toMatchObject({ code: "CURRENT_HUMAN_INSTALLATION_SCOPE_INVALID" });
      await expect(installation.candidate.issue(actor, { ...binding, environment: "live" }))
        .rejects.toMatchObject({ code: "CURRENT_HUMAN_INSTALLATION_SCOPE_INVALID" });
      await expect(installation.candidate.issue(actor, { ...binding, environment: "sandbox" }))
        .rejects.toMatchObject({ code: "CURRENT_HUMAN_INSTALLATION_SCOPE_INVALID" });
      vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(manifestOf(base).expires_at_ms + 1);
      await expect(installation.candidate.issue(actor, binding))
        .rejects.toMatchObject({ code: "CURRENT_HUMAN_INSTALLATION_SCOPE_INVALID" });
      expect(pool.totalCount).toBe(0); expect(pool.waitingCount).toBe(0);
    } finally {
      vi.useRealTimers();
      if (installation) await new Promise<void>(resolve => installation!.transport.server.close(() => resolve()));
      await pool.end();
    }
  });

  it.each(["candidate_id", "workspace_id"] as const)("requires the independent selected %s", async key => {
    await invalid({ ...base, [key]: key === "candidate_id" ? `elp210-${randomUUID()}` : "TEST_ONLY-other-workspace" });
  });
  it("rejects an unpinned or differently pinned manifest", async () => {
    await invalid({ ...base, manifest_sha256: "" });
    await invalid({ ...base, manifest_sha256: `sha256:${"0".repeat(64)}` });
  });
  it("does not accept a relative trust directory", async () => { await invalid({ ...base, directory: "." }); });
  it("rejects a directory readable by another account", async () => {
    const selection = copy(); chmodSync(selection.directory, 0o750); await invalid(selection);
  });
  it.each(["trust.json", "tls.key.pem", "signer.key.pem", "ca.pem"])("rejects public/group-readable %s", async file => {
    const selection = copy(); chmodSync(join(selection.directory, file), 0o640); await invalid(selection);
  });
  it("rejects a directory symlink and an ancestor symlink", async () => {
    const directory = mkdtempSync(join(root, "symlinks-")); copies.push(directory);
    symlinkSync(base.directory, join(directory, "direct"));
    await invalid({ ...base, directory: join(directory, "direct") });
    symlinkSync(join(base.directory, ".."), join(directory, "ancestor"));
    await invalid({ ...base, directory: join(directory, "ancestor", "core") });
  });
  it.each(["trust.json", "tls.key.pem", "peer-signer.pub.pem"])("never follows a %s symlink", async file => {
    const selection = copy(); unlinkSync(join(selection.directory, file));
    symlinkSync(join(base.directory, file), join(selection.directory, file)); await invalid(selection);
  });
  it("rejects a hard-linked private file", async () => {
    const selection = copy(); linkSync(join(selection.directory, "signer.key.pem"), join(selection.directory, "extra-key-link"));
    await invalid(selection);
  });
  it.each([0, 32769])("rejects a file of %i bytes before parsing it", async bytes => {
    const selection = copy(); writeFileSync(join(selection.directory, "signer.pub.pem"), Buffer.alloc(bytes)); await invalid(selection);
  });
  it("rejects a missing key instead of falling back to environment/default material", async () => {
    const selection = copy(); unlinkSync(join(selection.directory, "signer.key.pem")); await invalid(selection);
  });
  it("rejects a changed manifest even if it still has valid JSON", async () => {
    const selection = copy(); writeFileSync(join(selection.directory, "trust.json"), `${readFileSync(join(selection.directory, "trust.json"), "utf8")} `);
    await invalid(selection);
  });
  it("rejects duplicate JSON wire keys even after their exact bytes are independently pinned", async () => {
    const selection = copy(), original = readFileSync(join(selection.directory, "trust.json"), "utf8").trim();
    const raw = `${original.slice(0, -1)},"workspace_id":"${base.workspace_id}"}`;
    writeFileSync(join(selection.directory, "trust.json"), raw); await invalid({ ...selection, manifest_sha256: fingerprint(raw) });
  });
  it("rejects an escaped duplicate key inside a nested party even with the exact manifest hash", async () => {
    const selection = copy(), m = manifestOf(selection);
    const raw = JSON.stringify(m).replace('"core":{', `"core":{"\\u0069ssuer":${JSON.stringify(m.core.issuer)},`);
    writeFileSync(join(selection.directory, "trust.json"), raw);
    await invalid({ ...selection, manifest_sha256: fingerprint(raw) });
  });
  it.each(["null", "[]", '{"issuer":}', '{"issuer":true,}', '"unterminated'])
    ("rejects malformed or forbidden nested manifest value %s", async malformed => {
      const selection = copy(), m = manifestOf(selection);
      const raw = JSON.stringify(m).replace(JSON.stringify(m.core), malformed);
      writeFileSync(join(selection.directory, "trust.json"), raw);
      await invalid({ ...selection, manifest_sha256: fingerprint(raw) });
    });
  it("rejects trailing JSON instead of accepting a valid manifest prefix", async () => {
    const selection = copy(), raw = `${JSON.stringify(manifestOf(selection))}\n{}`;
    writeFileSync(join(selection.directory, "trust.json"), raw);
    await invalid({ ...selection, manifest_sha256: fingerprint(raw) });
  });
  it("rejects excessive nested objects and key counts within the file byte bound", async () => {
    const selection = copy(), m = manifestOf(selection);
    await invalid(writeManifest(selection, { ...m, core: { a: { b: { c: { d: 1 } } } } }));
    await invalid(writeManifest(selection, { ...m, core: Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`k${i}`, true])) }));
  });
  it("rejects an oversized manifest even when its exact bytes are pinned", async () => {
    const selection = copy(), raw = `${JSON.stringify(manifestOf(selection))}${" ".repeat(32769)}`;
    writeFileSync(join(selection.directory, "trust.json"), raw);
    await invalid({ ...selection, manifest_sha256: fingerprint(raw) });
  });
  it("rejects a non-finite numeric manifest literal", async () => {
    const selection = copy(), m = manifestOf(selection);
    const raw = JSON.stringify(m).replace(`"created_at_ms":${m.created_at_ms}`, '"created_at_ms":1e309');
    writeFileSync(join(selection.directory, "trust.json"), raw);
    await invalid({ ...selection, manifest_sha256: fingerprint(raw) });
  });
  it("rejects non-UTF8 manifest bytes with the correct file pin", async () => {
    const selection = copy(), raw = Buffer.from([0xff, 0xfe, 0x7b, 0x7d]);
    writeFileSync(join(selection.directory, "trust.json"), raw); await invalid({ ...selection, manifest_sha256: fingerprint(raw) });
  });
  it("rejects unknown manifest fields rather than installing a provider from extra JSON", async () => {
    const selection = copy(); await invalid(writeManifest(selection, { ...manifestOf(selection), current_provider: { allowed: true } }));
  });
  it("rejects a future manifest and expired manifest", async () => {
    const selection = copy(), m = manifestOf(selection);
    await invalid(writeManifest(selection, { ...m, created_at_ms: Date.now() + 60_000 }));
    await invalid(writeManifest(selection, { ...m, created_at_ms: Date.now() - 120_000, expires_at_ms: Date.now() - 60_000 }));
  });
  it("rejects zero or more-than-one-day manifest validity", async () => {
    const selection = copy(), m = manifestOf(selection);
    await invalid(writeManifest(selection, { ...m, expires_at_ms: m.created_at_ms }));
    await invalid(writeManifest(selection, { ...m, expires_at_ms: m.created_at_ms + 86_400_001 }));
  });
  it.each(["issuer", "audience", "key_id"] as const)("requires isolated matching Core %s", async field => {
    const selection = copy(), m = manifestOf(selection);
    await invalid(writeManifest(selection, { ...m, core: { ...m.core, [field]: "TEST_ONLY-foreign-binding" } }));
  });
  it.each(["issuer", "audience", "key_id", "workload_id"] as const)("requires isolated matching PM %s", async field => {
    const selection = copy(), m = manifestOf(selection);
    await invalid(writeManifest(selection, { ...m, pm: { ...m.pm, [field]: "TEST_ONLY-foreign-binding" } }));
  });
  it.each(["business_reads", "commands", "live"] as const)("does not allow manifest configuration to grant %s", async field => {
    const selection = copy(), m = manifestOf(selection);
    await invalid(writeManifest(selection, { ...m, authority: { ...m.authority, [field]: true } }));
  });
  it.each(["mapping", "grants", "application_policy", "field_policy"] as const)("does not accept invented installed %s", async field => {
    const selection = copy(), m = manifestOf(selection);
    await invalid(writeManifest(selection, { ...m, authority: { ...m.authority, [field]: "INSTALLED" } }));
  });
  it("does not accept a Live scope or a runtime-approved qualification label", async () => {
    const selection = copy(), m = manifestOf(selection);
    await invalid(writeManifest(selection, { ...m, environment: "live" }));
    await invalid(writeManifest(selection, { ...m, qualification: "RUNTIME_APPROVED" }));
  });
  it.each(["ca_certificate_sha256", "core", "pm"] as const)("checks the %s certificate pin", async target => {
    const selection = copy(), m = manifestOf(selection), wrong = `sha256:${"f".repeat(64)}`;
    await invalid(writeManifest(selection, target === "ca_certificate_sha256" ? { ...m, [target]: wrong }
      : { ...m, [target]: { ...m[target], certificate_sha256: wrong } }));
  });
  it.each(["core", "pm"] as const)("checks the %s Ed25519 public-key pin", async target => {
    const selection = copy(), m = manifestOf(selection);
    await invalid(writeManifest(selection, { ...m, [target]: { ...m[target], signer_spki_sha256: `sha256:${"e".repeat(64)}` } }));
  });
  it("rejects a CA-valid certificate issued for the wrong hostname", async () => {
    await invalid(fixture({ core: { hostname: "other.elp210.candidate.invalid" } }));
  });
  it("rejects a CA-valid leaf without the selected loopback IP", async () => {
    await invalid(fixture({ pm: { ip: [127, 0, 0, 2] } }));
  });
  it("rejects a CA-valid leaf without both client and server EKUs", async () => {
    await invalid(fixture({ core: { client_usage: false } }));
    await invalid(fixture({ pm: { server_usage: false } }));
  });
  it("rejects a CA certificate substituted for a leaf", async () => { await invalid(fixture({ core: { is_ca: true } })); });
  it("rejects a leaf that is not valid yet", async () => {
    await invalid(fixture({ core: { not_before_ms: Date.now() + 60_000 } }));
  });
  it("does not extend a certificate lifetime by editing manifest expiry", async () => {
    await invalid(fixture({ pm: { not_after_ms: Date.now() + 60_000 } }));
  });
  it("rejects a foreign CA even when its own digest is supplied", async () => {
    const selection = copy(); replace(selection, "ca.pem", join(foreign.directory, "ca.pem"));
    const m = manifestOf(selection), ca = new X509Certificate(readFileSync(join(selection.directory, "ca.pem")));
    await invalid(writeManifest(selection, { ...m, ca_certificate_sha256: fingerprint(ca.raw) }));
  });
  it("rejects a different TLS private key", async () => {
    const selection = copy(); replace(selection, "tls.key.pem", join(foreign.directory, "tls.key.pem")); await invalid(selection);
  });
  it("rejects a different signing private key", async () => {
    const selection = copy(); replace(selection, "signer.key.pem", join(foreign.directory, "signer.key.pem")); await invalid(selection);
  });
  it("rejects replacement of both own signing files when the independently pinned SPKI is unchanged", async () => {
    const selection = copy();
    for (const file of ["signer.key.pem", "signer.pub.pem"]) replace(selection, file, join(foreign.directory, file));
    await invalid(selection);
  });
  it("rejects replacement of the peer public signer even when its format/algorithm are valid", async () => {
    const selection = copy(); replace(selection, "peer-signer.pub.pem", join(foreign.directory, "peer-signer.pub.pem")); await invalid(selection);
  });
  it("requires disjoint peer and Core signing keys even if an attacker edits the peer hash", async () => {
    const selection = copy(); replace(selection, "peer-signer.pub.pem", join(selection.directory, "signer.pub.pem"));
    const m = manifestOf(selection), key = createPublicKey(readFileSync(join(selection.directory, "signer.pub.pem")));
    await invalid(writeManifest(selection, { ...m, pm: { ...m.pm, signer_spki_sha256: fingerprint(publicDer(key)) } }));
  });
  it("rejects a non-Ed25519 signing key pair", async () => {
    const selection = copy(), keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    writeFileSync(join(selection.directory, "signer.key.pem"), privatePem(keys.privateKey));
    writeFileSync(join(selection.directory, "signer.pub.pem"), publicPem(keys.publicKey));
    const m = manifestOf(selection);
    await invalid(writeManifest(selection, { ...m, core: { ...m.core, signer_spki_sha256: fingerprint(publicDer(keys.publicKey)) } }));
  });
});
