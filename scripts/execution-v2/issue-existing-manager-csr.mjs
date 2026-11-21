#!/usr/bin/env node
/** Explicit Research-only issuance using existing custody. Never generates keys,
 * edits issuer state, installs a certificate or enables a profile/grant. */
import { createHash, randomBytes, X509Certificate } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw new Error(code); };
const openssl = args => {
  try { return execFileSync('openssl', args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000, maxBuffer: 65536 }); }
  catch { return fail('OPENSSL_VALIDATION_OR_ISSUANCE_FAILED'); }
};
function regular(path, secret = false) {
  const st = lstatSync(path);
  if (!st.isFile() || st.isSymbolicLink() || st.nlink !== 1 || st.size < 1 || st.size > 65536 ||
      realpathSync(path) !== resolve(path) || (secret && ((st.mode & 0o077) !== 0 || st.uid !== process.getuid())))
    fail('UNSAFE_INPUT_REFERENCE');
  return st;
}
const publicFile = path => { regular(path); return readFileSync(path); };
const spki = cert => digest(cert.publicKey.export({ type: 'spki', format: 'der' }));
const fingerprint = cert => cert.fingerprint256.replaceAll(':', '').toLowerCase();

export const RESEARCH_ISSUANCE_PINS = Object.freeze({
  csr: '41a94f899574d5bdf3e2dea139d23a5e2c4fcb1c467b2c5fdece14e3acea7f05',
  issuer: '78a6de84cde14837ff64afe39dde694d9488fe5124ffeaa44437babd7166bc2c',
  root: '036ce3ad9d03ddf9aa94c3b7165c5f1e74eef061a43d48749d53ecc4976dece2',
  clientSpki: 'c164a42f98c9cb16103b4705d424eb23984d997a76cbcf2059321bd4fbcc192f',
  serverCa: '8fff563d58edd385e8be0963050e0e3619227dcbc6cea2b8dfcba7e3acf302b7',
  extensions: 'c518d5e37e8f32c9f98e185ac74637cfc5a769e92233c9c2c88c2ae2e5453f1e',
});
export const CLIENT_URI = 'spiffe://primusspark/portal/control-api/paper';

/** `expected` is an explicit input to permit isolated TEST_ONLY PKI tests. CLI
 * pins are closed to the independently reviewed existing Research material. */
export function issueExistingManagerCsr(input) {
  const { csr, issuerCert, issuerKey, rootCert, serverCa, extensions, outputDir, expected, days } = input;
  if (!Number.isInteger(days) || days < 1 || days > 7) fail('INVALID_RESEARCH_VALIDITY');
  if (!expected || Object.keys(RESEARCH_ISSUANCE_PINS).some(k => !/^[a-f0-9]{64}$/.test(expected[k] ?? '')))
    fail('EXPLICIT_EXPECTED_PINS_REQUIRED');
  const csrBytes = publicFile(csr), issuerBytes = publicFile(issuerCert), rootBytes = publicFile(rootCert);
  const serverBytes = publicFile(serverCa), extBytes = publicFile(extensions);
  const issuer = new X509Certificate(issuerBytes), root = new X509Certificate(rootBytes);
  if (digest(csrBytes) !== expected.csr || fingerprint(issuer) !== expected.issuer ||
      fingerprint(root) !== expected.root || digest(serverBytes) !== expected.serverCa ||
      digest(extBytes) !== expected.extensions) fail('PUBLIC_INPUT_PIN_MISMATCH');
  if (!issuer.ca || !root.ca || !issuer.verify(root.publicKey)) fail('ISSUER_CHAIN_INVALID');
  const now = Date.now(), requestedEnd = now + days * 86400000;
  if (now < Date.parse(issuer.validFrom) || requestedEnd >= Date.parse(issuer.validTo) ||
      now < Date.parse(root.validFrom) || requestedEnd >= Date.parse(root.validTo)) fail('ISSUER_VALIDITY_TOO_SHORT');
  regular(issuerKey, true);
  const caSpki = openssl(['pkey', '-in', issuerKey, '-pubout', '-outform', 'DER']);
  if (digest(caSpki) !== spki(issuer)) fail('ISSUER_KEY_MISMATCH');
  openssl(['req', '-in', csr, '-verify', '-noout']);
  const subject = openssl(['req', '-in', csr, '-noout', '-subject', '-nameopt', 'RFC2253']).toString().trim();
  if (subject !== 'subject=CN=portal-research-core009') fail('CSR_SUBJECT_MISMATCH');
  const csrPublic = openssl(['req', '-in', csr, '-pubkey', '-noout']);
  const csrDer = execFileSync('openssl', ['pkey', '-pubin', '-outform', 'DER'],
    { input: csrPublic, stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000 });
  if (digest(csrDer) !== expected.clientSpki) fail('CSR_KEY_PIN_MISMATCH');
  openssl(['verify', '-CAfile', rootCert, issuerCert]);
  const parent = lstatSync(dirname(resolve(outputDir)));
  if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o077) !== 0 || parent.uid !== process.getuid())
    fail('OUTPUT_PARENT_NOT_PRIVATE');
  // Exclusive reservation happens before signing. Never overwrite an old issuance.
  mkdirSync(outputDir, { mode: 0o700 });
  const serial = `0x${randomBytes(16).toString('hex')}`;
  const leafBytes = openssl(['x509', '-req', '-in', csr, '-CA', issuerCert, '-CAkey', issuerKey,
    '-set_serial', serial, '-days', String(days), '-sha256', '-extfile', extensions]);
  const leaf = new X509Certificate(leafBytes);
  if (leaf.ca || !leaf.verify(issuer.publicKey) || spki(leaf) !== expected.clientSpki ||
      leaf.subjectAltName !== `URI:${CLIENT_URI}` || leaf.keyUsage?.join(',') !== '1.3.6.1.5.5.7.3.2')
    fail('ISSUED_LEAF_POSTCHECK_FAILED');
  const output = (name, bytes) => writeFileSync(join(outputDir, name), bytes, { flag: 'wx', mode: 0o600 });
  output('research-client.crt.pem', leafBytes);
  output('research-client.chain.pem', Buffer.concat([leafBytes, issuerBytes]));
  openssl(['verify', '-purpose', 'sslclient', '-CAfile', rootCert, '-untrusted', issuerCert,
    join(outputDir, 'research-client.crt.pem')]);
  // A failed final custody check must never leave a success-looking receipt.
  // Keep partial public outputs for diagnosis; none is an issuance receipt.
  for (const [path, bytes] of [[csr, csrBytes], [issuerCert, issuerBytes], [rootCert, rootBytes],
    [serverCa, serverBytes], [extensions, extBytes]]) {
    if (digest(publicFile(path)) !== digest(bytes)) fail('CUSTODY_CHANGED_DURING_ISSUANCE');
  }
  const receipt = {
    schema_version: 'portal.research-manager-client-issuance.v1', issued_at: new Date().toISOString(),
    state: 'ISSUED_VERIFIED_NOT_INSTALLED', validity_days: days, serial: leaf.serialNumber,
    csr_sha256: expected.csr, issuer_fingerprint_sha256: fingerprint(issuer), root_fingerprint_sha256: fingerprint(root),
    leaf_sha256: digest(leafBytes), chain_sha256: digest(Buffer.concat([leafBytes, issuerBytes])),
    leaf_fingerprint_sha256: fingerprint(leaf), client_spki_sha256: spki(leaf),
    server_ca_sha256: digest(serverBytes), extensions_sha256: digest(extBytes),
    san_uri: CLIENT_URI, eku: ['clientAuth'], ca: false,
    not_before: new Date(leaf.validFrom).toISOString().replace('.000Z', 'Z'),
    not_after: new Date(leaf.validTo).toISOString().replace('.000Z', 'Z'),
    generated_keys: 0, issuer_state_modified: false, runtime_installed: false,
    grants_issued: 0, connected_qualification: 'NOT_RUN',
  };
  output('issuance-receipt.json', JSON.stringify(receipt));
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2), values = {};
    const names = new Map([['--csr', 'csr'], ['--issuer-cert', 'issuerCert'], ['--issuer-key', 'issuerKey'],
      ['--root-cert', 'rootCert'], ['--server-ca', 'serverCa'], ['--extensions', 'extensions'],
      ['--output-dir', 'outputDir'], ['--days', 'days']]);
    for (let i = 0; i < args.length; i += 2) {
      const key = names.get(args[i]);
      if (!key || !args[i + 1] || values[key] !== undefined) fail('USAGE');
      values[key] = args[i + 1];
    }
    if (Object.keys(values).length !== names.size) fail('USAGE');
    process.umask(0o077);
    const receipt = issueExistingManagerCsr({ ...values, days: Number(values.days), expected: RESEARCH_ISSUANCE_PINS });
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
  } catch (error) {
    const code = /^[A-Z0-9_]+$/.test(error.message ?? '') ? error.message : 'RESEARCH_ISSUANCE_FAILED';
    process.stderr.write(`${code}\n`); process.exitCode = 1;
  }
}
