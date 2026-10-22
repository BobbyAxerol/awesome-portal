import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import childProcess, { execFileSync } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { createHash, X509Certificate } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, statSync, readdirSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { issueExistingManagerCsr, CLIENT_URI } from '../issue-existing-manager-csr.mjs';

// Isolated TEST_ONLY PKI; never uses the actual Research signer/custody.
const base = mkdtempSync(join(tmpdir(), 'manager-csr-test-'));
const hash = b => createHash('sha256').update(b).digest('hex');
const file = n => join(base, n);
const run = args => execFileSync('openssl', args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 });
let expected;
before(() => {
  run(['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes',
    '-subj', '/CN=Isolated Manager Test CA', '-days', '30', '-addext', 'basicConstraints=critical,CA:TRUE',
    '-keyout', file('ca.key'), '-out', file('ca.crt')]);
  chmodSync(file('ca.key'), 0o600);
  run(['req', '-new', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes',
    '-subj', '/CN=portal-research-core009', '-keyout', file('client.key'), '-out', file('client.csr')]);
  writeFileSync(file('leaf.ext'), `basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=clientAuth\nsubjectAltName=URI:${CLIENT_URI}\n`, { mode: 0o600 });
  const ca = new X509Certificate(readFileSync(file('ca.crt')));
  const pub = run(['req', '-in', file('client.csr'), '-pubkey', '-noout']);
  const der = execFileSync('openssl', ['pkey', '-pubin', '-outform', 'DER'], { input: pub, stdio: ['pipe', 'pipe', 'pipe'] });
  expected = {
    csr: hash(readFileSync(file('client.csr'))), issuer: ca.fingerprint256.replaceAll(':', '').toLowerCase(),
    root: ca.fingerprint256.replaceAll(':', '').toLowerCase(), clientSpki: hash(der),
    serverCa: hash(readFileSync(file('ca.crt'))), extensions: hash(readFileSync(file('leaf.ext'))),
  };
});
after(() => rmSync(base, { recursive: true, force: true }));
let counter = 0;
const input = overrides => ({
  csr: file('client.csr'), issuerCert: file('ca.crt'), issuerKey: file('ca.key'), rootCert: file('ca.crt'),
  serverCa: file('ca.crt'), extensions: file('leaf.ext'), outputDir: file(`issued-${++counter}`),
  days: 7, expected, ...overrides,
});

test('issues only a client leaf on the existing CSR; no issuer/key mutation or installation', () => {
  const old = ['ca.key', 'ca.crt', 'client.key', 'client.csr'].map(n => [n, hash(readFileSync(file(n))), statSync(file(n)).mtimeMs]);
  const options = input(), result = issueExistingManagerCsr(options);
  assert.equal(result.state, 'ISSUED_VERIFIED_NOT_INSTALLED');
  assert.equal(result.client_spki_sha256, expected.clientSpki);
  assert.equal(result.generated_keys, 0);
  assert.equal(result.runtime_installed, false);
  assert.equal(result.grants_issued, 0);
  assert.equal(result.connected_qualification, 'NOT_RUN');
  assert.equal(result.san_uri, CLIENT_URI);
  assert.deepEqual(result.eku, ['clientAuth']);
  assert.equal(statSync(options.outputDir).mode & 0o777, 0o700);
  assert.deepEqual(readdirSync(options.outputDir).sort(), ['issuance-receipt.json', 'research-client.chain.pem', 'research-client.crt.pem']);
  for (const n of readdirSync(options.outputDir)) assert.equal(statSync(join(options.outputDir, n)).mode & 0o777, 0o600);
  for (const [n, bytesHash, mtime] of old) {
    assert.equal(hash(readFileSync(file(n))), bytesHash);
    assert.equal(statSync(file(n)).mtimeMs, mtime);
  }
  assert.equal(readdirSync(base).some(n => n.endsWith('.srl')), false);
  assert.equal(hash(readFileSync(join(options.outputDir, 'research-client.crt.pem'))), result.leaf_sha256);
});

for (const name of ['csr', 'issuer', 'root', 'clientSpki', 'serverCa', 'extensions']) {
  test(`refuses ${name} pin mismatch`, () => {
    assert.throws(() => issueExistingManagerCsr(input({ expected: { ...expected, [name]: '0'.repeat(64) } })),
      /PUBLIC_INPUT_PIN_MISMATCH|CSR_KEY_PIN_MISMATCH/);
  });
}
for (const days of [0, -1, 8, 1.5, NaN]) {
  test(`refuses validity outside the explicit one-to-seven-day bound: ${days}`, () => {
    assert.throws(() => issueExistingManagerCsr(input({ days })), /INVALID_RESEARCH_VALIDITY/);
  });
}
test('requires every expected pin explicitly', () => {
  assert.throws(() => issueExistingManagerCsr(input({ expected: {} })), /EXPLICIT_EXPECTED_PINS_REQUIRED/);
});
test('cannot overwrite a previous issued artifact directory', () => {
  const options = input(); issueExistingManagerCsr(options);
  const old = hash(readFileSync(join(options.outputDir, 'research-client.crt.pem')));
  assert.throws(() => issueExistingManagerCsr(options), /EEXIST/);
  assert.equal(hash(readFileSync(join(options.outputDir, 'research-client.crt.pem'))), old);
});
test('refuses an issuer key with group/world permissions', () => {
  chmodSync(file('ca.key'), 0o644);
  try { assert.throws(() => issueExistingManagerCsr(input()), /UNSAFE_INPUT_REFERENCE/); }
  finally { chmodSync(file('ca.key'), 0o600); }
});
test('refuses symlink custody references', () => {
  symlinkSync(file('ca.key'), file('ca-link.key'));
  assert.throws(() => issueExistingManagerCsr(input({ issuerKey: file('ca-link.key') })), /UNSAFE_INPUT_REFERENCE/);
});
test('refuses a nonprivate output parent before signing', () => {
  const publicParent = file('public-parent');
  execFileSync('mkdir', [publicParent]); chmodSync(publicParent, 0o755);
  assert.throws(() => issueExistingManagerCsr(input({ outputDir: join(publicParent, 'leaf') })), /OUTPUT_PARENT_NOT_PRIVATE/);
});
test('a late custody change fails before publishing a successful issuance receipt', () => {
  const originalCsr = readFileSync(file('client.csr'));
  const actualExec = childProcess.execFileSync, options = input();
  const patch = mock.method(childProcess, 'execFileSync', (command, args, ...rest) => {
    const result = actualExec(command, args, ...rest);
    if (command === 'openssl' && args[0] === 'verify' && args.includes('sslclient'))
      writeFileSync(file('client.csr'), Buffer.concat([originalCsr, Buffer.from('\n')]));
    return result;
  });
  syncBuiltinESMExports();
  try {
    assert.throws(() => issueExistingManagerCsr(options), /CUSTODY_CHANGED_DURING_ISSUANCE/);
    assert.equal(existsSync(join(options.outputDir, 'issuance-receipt.json')), false);
    assert.deepEqual(readdirSync(options.outputDir).sort(), ['research-client.chain.pem', 'research-client.crt.pem']);
  } finally {
    patch.mock.restore(); syncBuiltinESMExports();
    writeFileSync(file('client.csr'), originalCsr);
  }
});
