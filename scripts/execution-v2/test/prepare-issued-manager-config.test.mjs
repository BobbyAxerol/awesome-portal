import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { issueExistingManagerCsr, CLIENT_URI } from '../issue-existing-manager-csr.mjs';
const require = createRequire(import.meta.url);
const { verifyIssuedManagerMaterial } = require('../prepare-issued-manager-config.cjs');

// TEST_ONLY temporary PKI. No existing Research custody/config/private key is opened.
const base = mkdtempSync(join(tmpdir(), 'manager-issued-config-test-'));
const file = n => join(base, n);
const hash = b => createHash('sha256').update(b).digest('hex');
const run = args => execFileSync('openssl', args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 });
let expected, originals;
before(() => {
  chmodSync(base, 0o700);
  run(['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes',
    '-subj', '/CN=Isolated Preparation CA', '-days', '30', '-addext', 'basicConstraints=critical,CA:TRUE',
    '-addext', 'keyUsage=critical,keyCertSign,cRLSign', '-keyout', file('ca.key'), '-out', file('ca.crt')]);
  chmodSync(file('ca.key'), 0o600);
  run(['req', '-new', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes',
    '-subj', '/CN=portal-research-core009', '-keyout', file('client.key'), '-out', file('client.csr')]);
  chmodSync(file('client.key'), 0o600);
  writeFileSync(file('leaf.ext'), extensions(), { mode: 0o600 });
  const ca = new X509Certificate(readFileSync(file('ca.crt')));
  const pub = run(['req', '-in', file('client.csr'), '-pubkey', '-noout']);
  const der = execFileSync('openssl', ['pkey', '-pubin', '-outform', 'DER'], { input: pub, stdio: ['pipe', 'pipe', 'pipe'] });
  expected = {
    csr: hash(readFileSync(file('client.csr'))), issuer: ca.fingerprint256.replaceAll(':', '').toLowerCase(),
    root: ca.fingerprint256.replaceAll(':', '').toLowerCase(), clientSpki: hash(der),
    serverCa: hash(readFileSync(file('ca.crt'))), extensions: hash(readFileSync(file('leaf.ext'))),
  };
  const outputDir = file('original');
  issueExistingManagerCsr({ csr: file('client.csr'), issuerCert: file('ca.crt'), issuerKey: file('ca.key'),
    rootCert: file('ca.crt'), serverCa: file('ca.crt'), extensions: file('leaf.ext'), outputDir, expected, days: 7 });
  originals = Object.fromEntries(readdirSync(outputDir).map(name => [name, readFileSync(join(outputDir, name))]));
});
after(() => rmSync(base, { recursive: true, force: true }));

function extensions({ san = CLIENT_URI, eku = 'clientAuth', usage = 'digitalSignature', ca = 'FALSE' } = {}) {
  return `basicConstraints=critical,CA:${ca}\nkeyUsage=critical,${usage}\nextendedKeyUsage=${eku}\nsubjectAltName=URI:${san}\n`;
}
let counter = 0;
function specimen(mutate = () => {}) {
  const issuedDir = file(`specimen-${++counter}`);
  mkdirSync(issuedDir, { mode: 0o700 });
  for (const [name, bytes] of Object.entries(originals)) writeFileSync(join(issuedDir, name), bytes, { mode: 0o600 });
  const receipt = JSON.parse(originals['issuance-receipt.json']);
  mutate(receipt, issuedDir);
  writeFileSync(join(issuedDir, 'issuance-receipt.json'), JSON.stringify(receipt), { mode: 0o600 });
  return { issuedDir, issuerCert: file('ca.crt'), rootCert: file('ca.crt'), serverCa: file('ca.crt'), expected };
}
function replaceLeaf(receipt, dir, opts = {}, selfSigned = false) {
  const extensionFile = join(dir, 'replacement.ext');
  writeFileSync(extensionFile, extensions(opts), { mode: 0o600 });
  const signer = selfSigned ? ['-signkey', file('client.key')] : ['-CA', file('ca.crt'), '-CAkey', file('ca.key')];
  const bytes = run(['x509', '-req', '-in', file('client.csr'), ...signer, '-set_serial', '0x4321',
    '-days', '7', '-sha256', '-extfile', extensionFile]);
  const chain = Buffer.concat([bytes, readFileSync(file('ca.crt'))]);
  writeFileSync(join(dir, 'research-client.crt.pem'), bytes, { mode: 0o600 });
  writeFileSync(join(dir, 'research-client.chain.pem'), chain, { mode: 0o600 });
  // These are exactly the formerly sufficient editable assertions. Actual leaf
  // checks must reject even when the receipt still claims the approved shape.
  receipt.leaf_sha256 = hash(bytes); receipt.chain_sha256 = hash(chain);
}

test('derives public leaf metadata and verifies actual pinned chain without modifying artifacts', () => {
  const input = specimen();
  const before = readdirSync(input.issuedDir).map(n => [n, hash(readFileSync(join(input.issuedDir, n)))]);
  const result = verifyIssuedManagerMaterial(input);
  assert.deepEqual(result.clientLeaf.key_usage, ['digitalSignature']);
  assert.equal(result.clientLeaf.san_uri, CLIENT_URI);
  assert.deepEqual(result.clientLeaf.eku, ['clientAuth']);
  assert.equal(result.clientLeaf.ca, false);
  assert.equal(result.clientLeaf.public_key_sha256, expected.clientSpki);
  assert.equal(result.caSha256, expected.serverCa);
  assert.deepEqual(readdirSync(input.issuedDir).map(n => [n, hash(readFileSync(join(input.issuedDir, n)))]), before);
});

for (const [name, value] of [
  ['san_uri', 'spiffe://unapproved/client'], ['eku', ['serverAuth']], ['ca', true],
  ['not_before', '2026-01-01T00:00:00Z'], ['not_after', '2036-01-01T00:00:00Z'],
  ['issuer_fingerprint_sha256', '0'.repeat(64)], ['root_fingerprint_sha256', '0'.repeat(64)],
  ['server_ca_sha256', '0'.repeat(64)], ['client_spki_sha256', '0'.repeat(64)],
]) {
  test(`rejects receipt metadata forged independently of the actual certificate: ${name}`, () => {
    assert.throws(() => verifyIssuedManagerMaterial(specimen(receipt => { receipt[name] = value; })),
      /ISSUANCE_METADATA_MISMATCH/);
  });
}

test('rejects same-key wrong-SAN leaf even with matching edited file hashes', () => {
  assert.throws(() => verifyIssuedManagerMaterial(specimen((r, dir) => replaceLeaf(r, dir, { san: 'spiffe://wrong/client' }))),
    /LEAF_SAN_MISMATCH/);
});
test('rejects same-key serverAuth leaf even when the receipt claims clientAuth', () => {
  assert.throws(() => verifyIssuedManagerMaterial(specimen((r, dir) => replaceLeaf(r, dir, { eku: 'serverAuth' }))),
    /LEAF_EKU_NOT_CLIENT_AUTH_ONLY/);
});
test('rejects actual key usage without digitalSignature instead of publishing hardcoded usage', () => {
  assert.throws(() => verifyIssuedManagerMaterial(specimen((r, dir) => replaceLeaf(r, dir, { usage: 'keyEncipherment' }))),
    /LEAF_KEY_USAGE_INVALID/);
});
test('rejects a same-key self-signed leaf despite a plausible issuer receipt and matching hashes', () => {
  assert.throws(() => verifyIssuedManagerMaterial(specimen((r, dir) => replaceLeaf(r, dir, {}, true))),
    /LEAF_SIGNATURE_OR_CA_INVALID/);
});
test('rejects actual expiry even when the receipt claims a later validity', () => {
  const input = specimen(receipt => { receipt.not_after = '2036-01-01T00:00:00Z'; });
  const leaf = new X509Certificate(originals['research-client.crt.pem']);
  assert.throws(() => verifyIssuedManagerMaterial({ ...input, nowMs: Date.parse(leaf.validTo) + 1000 }),
    /CERTIFICATE_NOT_CURRENTLY_VALID/);
});
test('rejects a not-yet-valid actual leaf even when receipt dates are editable', () => {
  const input = specimen();
  const leaf = new X509Certificate(originals['research-client.crt.pem']);
  assert.throws(() => verifyIssuedManagerMaterial({ ...input, nowMs: Date.parse(leaf.validFrom) - 1000 }),
    /CERTIFICATE_NOT_CURRENTLY_VALID/);
});
test('rejects substituted chain content even when its editable hash is updated', () => {
  const input = specimen((receipt, dir) => {
    const chain = Buffer.concat([readFileSync(file('ca.crt')), readFileSync(file('ca.crt'))]);
    writeFileSync(join(dir, 'research-client.chain.pem'), chain);
    receipt.chain_sha256 = hash(chain);
  });
  assert.throws(() => verifyIssuedManagerMaterial(input), /ISSUED_CHAIN_CONTENT_MISMATCH/);
});
for (const [name, code] of [['issuer', 'ISSUER_PIN_MISMATCH'], ['root', 'ROOT_PIN_MISMATCH'], ['serverCa', 'SERVER_CA_PIN_MISMATCH']]) {
  test(`rejects independently pinned public trust mismatch: ${name}`, () => {
    const input = specimen();
    assert.throws(() => verifyIssuedManagerMaterial({ ...input, expected: { ...expected, [name]: '0'.repeat(64) } }), new RegExp(code));
  });
}
