#!/usr/bin/env node
/** Explicit ELP2-10 candidate credential provisioning. Never run by app startup.
 * No production trust, user mapping, business grant, policy or listener is made.
 * Secret bytes are never printed. Output is one metadata-only directory locator.
 */
import { createPublicKey, generateKeyPairSync, randomUUID, X509Certificate, createHash } from "node:crypto";
import { chmodSync, constants, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync,
  rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const fingerprint = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const identifier = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value);
const privateWrite = (file, contents) => writeFileSync(file, contents, {
  mode: 0o600, flag: constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
});
const retirePrivate = file => {
  let stat;
  try { stat = lstatSync(file); } catch (error) { if (error.code === "ENOENT") return; throw error; }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.uid !== process.geteuid())
    throw new Error("CANDIDATE_TRUST_KEY_RETIREMENT_FAILED");
  const result = spawnSync("shred", ["--iterations=1", "--zero", "--remove=unlink", "--", file],
    { stdio: "ignore", timeout: 10000 });
  if (result.error || result.status !== 0) throw new Error("CANDIDATE_TRUST_KEY_RETIREMENT_FAILED");
};

export function provisionCandidateTrust({ parent, workspace_id, environment }) {
  if (!isAbsolute(parent ?? "") || !identifier(workspace_id) || environment !== "paper")
    throw new Error("CANDIDATE_TRUST_ARGUMENT_INVALID");
  const root = resolve(parent), stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(root) !== root
    || stat.uid !== process.geteuid() || (stat.mode & 0o077) !== 0)
    throw new Error("CANDIDATE_TRUST_PRIVATE_PARENT_REQUIRED");
  // New exclusive child. Never replace an earlier trust bundle or extend its life.
  const directory = mkdtempSync(join(root, "elp210-trust-"));
  const candidate_id = `elp210-${randomUUID()}`;
  const created_at_ms = Date.now();
  const openssl = (args, input) => {
    const result = spawnSync("openssl", args, { cwd: directory, encoding: "utf8", timeout: 10000,
      input, maxBuffer: 65536, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, OPENSSL_CONF: "/dev/null" } });
    if (result.error || result.status !== 0) throw new Error("CANDIDATE_TRUST_OPENSSL_FAILED");
  };
  const jwtKey = party => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    privateWrite(join(directory, party, "signer.key.pem"), privateKey.export({ type: "pkcs8", format: "pem" }));
    privateWrite(join(directory, party, "signer.pub.pem"), publicKey.export({ type: "spki", format: "pem" }));
  };
  const caPrivate = Buffer.from(generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }));
  try {
    // Exclusive0600 transient CA key; retire it before returning a usable
    // bundle. Never retain or distribute an expandable signing authority.
    privateWrite(join(directory, "candidate-ca.key.pem"), caPrivate);
    openssl(["req", "-x509", "-new", "-key", "candidate-ca.key.pem", "-days", "1",
      "-out", "candidate-ca.pem", "-subj", `/CN=${candidate_id}`,
      "-addext", "basicConstraints=critical,CA:TRUE,pathlen:0", "-addext", "keyUsage=critical,keyCertSign,cRLSign"]);
    for (const party of ["core", "pm"]) {
      mkdirSync(join(directory, party), { mode: 0o700 });
      const tlsKey = generateKeyPairSync("ed25519").privateKey;
      privateWrite(join(directory, party, "tls.key.pem"), tlsKey.export({ type: "pkcs8", format: "pem" }));
      openssl(["req", "-new", "-key", `${party}/tls.key.pem`,
        "-out", `${party}.csr.pem`, "-subj", `/CN=${party}.elp210.candidate.invalid`]);
      privateWrite(join(directory, `${party}.extensions`),
        `basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth,clientAuth\nsubjectAltName=DNS:${party}.elp210.candidate.invalid,IP:127.0.0.1\n`);
      openssl(["x509", "-req", "-in", `${party}.csr.pem`, "-CA", "candidate-ca.pem", "-CAkey", "candidate-ca.key.pem",
        "-set_serial", `0x${randomUUID().replaceAll("-", "")}`, "-days", "1", "-out", `${party}/tls.crt.pem`,
        "-extfile", `${party}.extensions`]);
      chmodSync(join(directory, party, "tls.crt.pem"), 0o600);
      jwtKey(party);
      rmSync(join(directory, `${party}.csr.pem`));
      rmSync(join(directory, `${party}.extensions`));
    }
    const core = new X509Certificate(readFileSync(join(directory, "core", "tls.crt.pem")));
    const pm = new X509Certificate(readFileSync(join(directory, "pm", "tls.crt.pem")));
    const ca = new X509Certificate(readFileSync(join(directory, "candidate-ca.pem")));
    chmodSync(join(directory, "candidate-ca.pem"), 0o600);
    const metadata = {
      schema_version: "elp210.candidate-trust.v1", qualification: "CANDIDATE_ONLY_NOT_BUSINESS_AUTHORITY",
      candidate_id, workspace_id, environment, created_at_ms,
      expires_at_ms: Math.min(Date.parse(ca.validTo), Date.parse(core.validTo), Date.parse(pm.validTo)),
      core: { issuer: `urn:${candidate_id}:core`, audience: `urn:${candidate_id}:pm`, key_id: `${candidate_id}:core`,
        signer_spki_sha256: fingerprint(createPublicKey(readFileSync(join(directory, "core", "signer.pub.pem"))).export({ type: "spki", format: "der" })),
        hostname: "core.elp210.candidate.invalid", certificate_sha256: fingerprint(core.raw) },
      pm: { issuer: `urn:${candidate_id}:pm`, audience: `urn:${candidate_id}:core`, key_id: `${candidate_id}:pm`,
        signer_spki_sha256: fingerprint(createPublicKey(readFileSync(join(directory, "pm", "signer.pub.pem"))).export({ type: "spki", format: "der" })),
        workload_id: `${candidate_id}:pm`, hostname: "pm.elp210.candidate.invalid", certificate_sha256: fingerprint(pm.raw) },
      ca_certificate_sha256: fingerprint(ca.raw),
      authority: { mapping: "NOT_INSTALLED", grants: "NOT_INSTALLED", application_policy: "NOT_INSTALLED",
        field_policy: "NOT_INSTALLED", business_reads: false, commands: false, live: false },
    };
    privateWrite(join(directory, "trust.json"), `${JSON.stringify(metadata, null, 2)}\n`);
    for (const party of ["core", "pm"]) {
      const peer = party === "core" ? "pm" : "core";
      privateWrite(join(directory, party, "trust.json"), readFileSync(join(directory, "trust.json")));
      privateWrite(join(directory, party, "ca.pem"), ca.toString());
      privateWrite(join(directory, party, "peer-tls.crt.pem"), readFileSync(join(directory, peer, "tls.crt.pem")));
      privateWrite(join(directory, party, "peer-signer.pub.pem"), readFileSync(join(directory, peer, "signer.pub.pem")));
    }
    return { directory, core_directory: join(directory, "core"), pm_directory: join(directory, "pm"),
      candidate_id, trust_sha256: fingerprint(readFileSync(join(directory, "trust.json"))),
      expires_at_ms: metadata.expires_at_ms };
  } catch (error) {
    // Only this exact newly-created child is ours. Keep nonsecret failure marker;
    // retire credential files from the failed bundle, never any previous bundle.
    let retirementFailed = false;
    for (const name of ["core/tls.key.pem", "pm/tls.key.pem",
      "core/signer.key.pem", "pm/signer.key.pem"])
      try { retirePrivate(join(directory, name)); } catch { retirementFailed = true; }
    if (retirementFailed) throw new Error("CANDIDATE_TRUST_KEY_RETIREMENT_FAILED");
    throw error;
  } finally {
    caPrivate.fill(0);
    const path = join(directory, "candidate-ca.key.pem");
    try { retirePrivate(path); } catch {
      // Keep failure closed, with no usable/distributed private bundle result.
      for (const party of ["core", "pm"])
        for (const name of ["tls.key.pem", "signer.key.pem"])
          try { retirePrivate(join(directory, party, name)); } catch { /* Keep private; report failure. */ }
      throw new Error("CANDIDATE_TRUST_CA_RETIREMENT_FAILED");
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  try {
    const args = process.argv.slice(2);
    if (args.length !== 6 || args[0] !== "--parent" || args[2] !== "--workspace" || args[4] !== "--environment")
      throw new Error("CANDIDATE_TRUST_ARGUMENT_INVALID");
    const result = provisionCandidateTrust({ parent: args[1], workspace_id: args[3], environment: args[5] });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    // Never echo openssl stderr, a path argument, PEM or config contents.
    process.stderr.write(`${error?.message?.startsWith("CANDIDATE_TRUST_") ? error.message : "CANDIDATE_TRUST_PROVISION_FAILED"}\n`);
    process.exitCode = 1;
  }
}
