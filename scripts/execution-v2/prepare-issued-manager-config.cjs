#!/usr/bin/env node
// Actual issued public material -> additive INACTIVE proposal. No referenced
// private key is opened; no Docker/network/DB/environment installation.
const assert = require('node:assert/strict');
const { createHash, X509Certificate } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { readFileSync, lstatSync, realpathSync, mkdirSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { createRequire } = require('node:module');
const sha = b => createHash('sha256').update(b).digest('hex');
const fingerprint = cert => cert.fingerprint256.replaceAll(':', '').toLowerCase();
const spki = cert => sha(cert.publicKey.export({ type: 'spki', format: 'der' }));
const CLIENT_URI = 'spiffe://primusspark/portal/control-api/paper';
const repo = resolve(__dirname, '../..');
const AUTHORITY = '/home/bobby/secure/portal-execution-pki-v1/authority';
const RESEARCH_PREPARATION_PINS = Object.freeze({
  csr: '41a94f899574d5bdf3e2dea139d23a5e2c4fcb1c467b2c5fdece14e3acea7f05',
  issuer: '78a6de84cde14837ff64afe39dde694d9488fe5124ffeaa44437babd7166bc2c',
  root: '036ce3ad9d03ddf9aa94c3b7165c5f1e74eef061a43d48749d53ecc4976dece2',
  clientSpki: 'c164a42f98c9cb16103b4705d424eb23984d997a76cbcf2059321bd4fbcc192f',
  serverCa: '8fff563d58edd385e8be0963050e0e3619227dcbc6cea2b8dfcba7e3acf302b7',
  extensions: 'c518d5e37e8f32c9f98e185ac74637cfc5a769e92233c9c2c88c2ae2e5453f1e',
});
const read = path => {
  const st = lstatSync(path);
  assert.ok(st.isFile() && !st.isSymbolicLink() && st.nlink === 1 && st.size > 0 && st.size <= 65536 &&
    realpathSync(path) === resolve(path), 'UNSAFE_PUBLIC_INPUT_REFERENCE');
  return readFileSync(path);
};
const certificates = (bytes, count) => {
  const text = bytes.toString('utf8');
  const blocks = text.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
  assert.equal(blocks.length, count, 'CERTIFICATE_BUNDLE_INVALID');
  assert.equal(text.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, '').trim(), '',
    'CERTIFICATE_BUNDLE_INVALID');
  return blocks.map(pem => new X509Certificate(pem));
};
const openssl = (args, input) => {
  try {
    return execFileSync('openssl', args, { input, stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000, maxBuffer: 65536 });
  } catch { throw new Error('PUBLIC_CERTIFICATE_VERIFICATION_FAILED'); }
};
const iso = ms => new Date(ms).toISOString().replace('.000Z', 'Z');

/** Public-only crypto verification. Explicit test pins permit isolated TEST_ONLY
 * PKI; the CLI below always uses the closed, independently reviewed real pins. */
function verifyIssuedManagerMaterial({ issuedDir, issuerCert, rootCert, serverCa, expected, nowMs = Date.now() }) {
  assert.ok(Number.isFinite(nowMs), 'EXPLICIT_VALIDATION_CLOCK_REQUIRED');
  assert.ok(expected && Object.keys(RESEARCH_PREPARATION_PINS).every(k => /^[a-f0-9]{64}$/.test(expected[k] ?? '')),
    'EXPLICIT_EXPECTED_PINS_REQUIRED');
  const captured = new Map();
  const capture = path => { const bytes = read(path); captured.set(path, bytes); return bytes; };
  const issuerBytes = capture(issuerCert), rootBytes = capture(rootCert), serverBytes = capture(serverCa);
  const [issuer] = certificates(issuerBytes, 1), [root] = certificates(rootBytes, 1);
  assert.equal(fingerprint(issuer), expected.issuer, 'ISSUER_PIN_MISMATCH');
  assert.equal(fingerprint(root), expected.root, 'ROOT_PIN_MISMATCH');
  assert.equal(sha(serverBytes), expected.serverCa, 'SERVER_CA_PIN_MISMATCH');
  assert.ok(issuer.ca && root.ca && issuer.checkIssued(root) && issuer.verify(root.publicKey) &&
    root.checkIssued(root) && root.verify(root.publicKey), 'ISSUER_CHAIN_INVALID');
  const issuanceBytes = capture(join(issuedDir, 'issuance-receipt.json'));
  const issuance = JSON.parse(issuanceBytes);
  assert.equal(issuance.schema_version, 'portal.research-manager-client-issuance.v1');
  assert.equal(issuance.state, 'ISSUED_VERIFIED_NOT_INSTALLED');
  assert.equal(issuance.generated_keys, 0);
  assert.equal(issuance.issuer_state_modified, false);
  assert.equal(issuance.runtime_installed, false);
  assert.equal(issuance.grants_issued, 0);
  assert.equal(issuance.connected_qualification, 'NOT_RUN');
  const leafBytes = capture(join(issuedDir, 'research-client.crt.pem'));
  const chainBytes = capture(join(issuedDir, 'research-client.chain.pem'));
  const [leaf] = certificates(leafBytes, 1), chain = certificates(chainBytes, 2);
  assert.ok(chain[0].raw.equals(leaf.raw) && chain[1].raw.equals(issuer.raw), 'ISSUED_CHAIN_CONTENT_MISMATCH');
  assert.ok(!leaf.ca && leaf.checkIssued(issuer) && leaf.verify(issuer.publicKey), 'LEAF_SIGNATURE_OR_CA_INVALID');
  assert.equal(leaf.subject, 'CN=portal-research-core009', 'LEAF_SUBJECT_MISMATCH');
  assert.equal(spki(leaf), expected.clientSpki, 'LEAF_KEY_PIN_MISMATCH');
  assert.equal(leaf.subjectAltName, `URI:${CLIENT_URI}`, 'LEAF_SAN_MISMATCH');
  assert.deepEqual(leaf.keyUsage, ['1.3.6.1.5.5.7.3.2'], 'LEAF_EKU_NOT_CLIENT_AUTH_ONLY');
  const usageText = openssl(['x509', '-noout', '-ext', 'keyUsage'], leafBytes).toString('utf8').trim().split('\n');
  assert.match(usageText.shift() ?? '', /^X509v3 Key Usage:(?: critical)?$/, 'LEAF_KEY_USAGE_MISSING');
  const labels = usageText.join(' ').split(',').map(v => v.trim());
  const names = { 'Digital Signature': 'digitalSignature', 'Key Encipherment': 'keyEncipherment' };
  assert.ok(labels.includes('Digital Signature') && labels.every(v => Object.hasOwn(names, v)), 'LEAF_KEY_USAGE_INVALID');
  const keyUsage = labels.map(v => names[v]);
  const from = Date.parse(leaf.validFrom), until = Date.parse(leaf.validTo);
  for (const cert of [leaf, issuer, root]) {
    assert.ok(nowMs >= Date.parse(cert.validFrom) && nowMs < Date.parse(cert.validTo), 'CERTIFICATE_NOT_CURRENTLY_VALID');
  }
  assert.ok(Number.isInteger(issuance.validity_days) && issuance.validity_days >= 1 && issuance.validity_days <= 7 &&
    until - from === issuance.validity_days * 86400000, 'LEAF_VALIDITY_BOUND_MISMATCH');
  assert.ok([issuer, root].every(cert => from >= Date.parse(cert.validFrom) && until <= Date.parse(cert.validTo)),
    'LEAF_VALIDITY_OUTSIDE_ISSUER');
  // OpenSSL independently checks client purpose, path constraints and certificate validity.
  // Pass the captured leaf via stdin; no client or issuer private key is opened.
  openssl(['verify', '-purpose', 'sslclient', '-attime', String(Math.floor(nowMs / 1000)),
    '-CAfile', rootCert, '-untrusted', issuerCert], leafBytes);
  const actual = {
    csr_sha256: expected.csr, issuer_fingerprint_sha256: fingerprint(issuer), root_fingerprint_sha256: fingerprint(root),
    leaf_sha256: sha(leafBytes), chain_sha256: sha(chainBytes), leaf_fingerprint_sha256: fingerprint(leaf),
    client_spki_sha256: spki(leaf), server_ca_sha256: sha(serverBytes), extensions_sha256: expected.extensions,
    san_uri: CLIENT_URI, eku: ['clientAuth'], ca: false, serial: leaf.serialNumber,
    not_before: iso(from), not_after: iso(until),
  };
  for (const [name, value] of Object.entries(actual)) assert.deepEqual(issuance[name], value, `ISSUANCE_METADATA_MISMATCH:${name}`);
  for (const [path, bytes] of captured) assert.equal(sha(read(path)), sha(bytes), 'PUBLIC_CUSTODY_CHANGED_DURING_PREPARATION');
  return {
    issuanceBytes, caSha256: actual.server_ca_sha256,
    clientLeaf: {
      kind: 'issued_leaf', sha256: actual.leaf_sha256, public_key_sha256: actual.client_spki_sha256,
      san_uri: actual.san_uri, eku: actual.eku, ca: leaf.ca, key_usage: keyUsage,
      issuer_ref: `sgp-client-ca-v1@${actual.issuer_fingerprint_sha256}`,
      not_before: actual.not_before, not_after: actual.not_after,
    },
  };
}

function prepareIssuedManagerConfig(issuedDir, outputDir) {
  const nowMs = Date.now();
  const material = verifyIssuedManagerMaterial({ issuedDir, expected: RESEARCH_PREPARATION_PINS, nowMs,
    issuerCert: join(AUTHORITY, 'sgp-client-ca.crt'), rootCert: join(AUTHORITY, 'offline-root.crt'),
    serverCa: '/home/bobby/secure/portal-execution-pki-v1/sgp/control-api/edge-server-ca.crt' });
  const source = join(repo, 'apps/control-api/src/execution-v2/manager-data-leg-config.ts');
  const sourceBytes = read(source);
  assert.equal(sha(sourceBytes), 'ec6d1863e72c41a3852688daca3d60bcaaa38ea0805963574bf81c4b0d00ab24');
  const localRequire = createRequire(join(repo, 'apps/control-api/package.json'));
  const ts = localRequire('typescript'), previousLoader = localRequire.extensions['.ts'];
  let validator;
  try {
    localRequire.extensions['.ts'] = (mod, filename) => {
      const compiled = ts.transpileModule(filename === source ? sourceBytes.toString('utf8') : read(filename).toString('utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      });
      mod._compile(compiled.outputText, filename);
    };
    validator = localRequire(source);
  } finally {
    if (previousLoader) localRequire.extensions['.ts'] = previousLoader;
    else delete localRequire.extensions['.ts'];
  }
  const baseBytes = read('/home/bobby/.local/state/portal-execution-elp210/20261022-manager-inactive-kmiFsIL7/inactive-config.json');
  assert.equal(sha(baseBytes), '3efc634667d34866ea624bd065c4b2d29cc7869d811fe64b36de1bdc16096438');
  const config = JSON.parse(baseBytes);
  assert.equal(material.clientLeaf.public_key_sha256, config.public_inputs.client_public_key_sha256);
  assert.equal(RESEARCH_PREPARATION_PINS.csr, config.public_inputs.client_csr_sha256);
  config.public_inputs.ca_sha256 = material.caSha256;
  config.public_inputs.client_leaf = material.clientLeaf;
  const bytes = Buffer.from(JSON.stringify(config));
  const report = validator.inspectManagerDataLegConfigBytes(bytes, {
    expectedWorkspaceId: config.workspace_id, nowMs, requireIssuedLeaf: true,
    reviewedKids: ['research-20261021-c185ee3d'],
  });
  assert.equal(report.ok, true, JSON.stringify(report));
  const parent = lstatSync(resolve(issuedDir));
  assert.ok(parent.isDirectory() && !parent.isSymbolicLink() && (parent.mode & 0o077) === 0 &&
    parent.uid === process.getuid() && realpathSync(issuedDir) === resolve(issuedDir), 'OUTPUT_PARENT_NOT_PRIVATE');
  assert.equal(resolve(outputDir, '..'), resolve(issuedDir));
  mkdirSync(outputDir, { mode: 0o700 });
  const put = (name, b) => writeFileSync(join(outputDir, name), b, { flag: 'wx', mode: 0o600 });
  put('issued-inactive-config.json', bytes);
  const receipt = {
    schema_version: 'portal.manager-issued-inactive-preparation.v1', created_at: new Date().toISOString(),
    state: 'ISSUED_CONFIG_VALIDATED_NOT_INSTALLED', source_sha256: sha(sourceBytes),
    previous_config_sha256: sha(baseBytes), issuance_receipt_sha256: sha(material.issuanceBytes),
    config_sha256: sha(bytes), report,
    runtime_installed: false, edge_jwks_reconciled: false, grants_issued: 0,
    connected_qualification: 'NOT_RUN',
    note: 'Per-mode READ flags describe the existing inactive proposal only; no runtime grant or STREAM, command or Live trading authority.',
  };
  put('configuration-receipt.json', JSON.stringify(receipt));
  return receipt;
}

module.exports = { verifyIssuedManagerMaterial, prepareIssuedManagerConfig };
if (require.main === module) {
  try {
    assert.equal(process.argv.length, 4, 'ISSUED_DIRECTORY_AND_NEW_OUTPUT_REQUIRED');
    process.umask(0o077);
    console.log(JSON.stringify(prepareIssuedManagerConfig(...process.argv.slice(2))));
  } catch {
    process.stderr.write('ISSUED_CONFIG_PREPARATION_FAILED\n'); process.exitCode = 1;
  }
}
