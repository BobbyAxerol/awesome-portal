#!/usr/bin/env node
// Actual issued public material -> additive INACTIVE proposal. No referenced
// private key is opened; no Docker/network/DB/environment installation.
const assert = require('node:assert/strict');
const { createHash, X509Certificate } = require('node:crypto');
const { readFileSync, lstatSync, mkdirSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { createRequire } = require('node:module');
const sha = b => createHash('sha256').update(b).digest('hex');
const repo = resolve(__dirname, '../..');
const [issuedDir, outputDir] = process.argv.slice(2);
assert.equal(process.argv.length, 4, 'ISSUED_DIRECTORY_AND_NEW_OUTPUT_REQUIRED');
const read = path => {
  const st = lstatSync(path);
  assert.ok(st.isFile() && !st.isSymbolicLink() && st.nlink === 1 && st.size > 0 && st.size <= 65536);
  return readFileSync(path);
};
const source = join(repo, 'apps/control-api/src/execution-v2/manager-data-leg-config.ts');
const sourceBytes = read(source);
assert.equal(sha(sourceBytes), 'ec6d1863e72c41a3852688daca3d60bcaaa38ea0805963574bf81c4b0d00ab24');
const localRequire = createRequire(join(repo, 'apps/control-api/package.json'));
const ts = localRequire('typescript');
localRequire.extensions['.ts'] = (mod, filename) => {
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  mod._compile(compiled.outputText, filename);
};
const validator = localRequire(source);
const baseBytes = read('/home/bobby/.local/state/portal-execution-elp210/20261022-manager-inactive-kmiFsIL7/inactive-config.json');
assert.equal(sha(baseBytes), '3efc634667d34866ea624bd065c4b2d29cc7869d811fe64b36de1bdc16096438');
const config = JSON.parse(baseBytes);
const issuanceBytes = read(join(issuedDir, 'issuance-receipt.json'));
const issuance = JSON.parse(issuanceBytes);
assert.equal(issuance.state, 'ISSUED_VERIFIED_NOT_INSTALLED');
assert.equal(issuance.generated_keys, 0);
assert.equal(issuance.runtime_installed, false);
assert.equal(issuance.issuer_fingerprint_sha256, '78a6de84cde14837ff64afe39dde694d9488fe5124ffeaa44437babd7166bc2c');
const leafBytes = read(join(issuedDir, 'research-client.crt.pem'));
const chainBytes = read(join(issuedDir, 'research-client.chain.pem'));
assert.equal(sha(leafBytes), issuance.leaf_sha256);
assert.equal(sha(chainBytes), issuance.chain_sha256);
const leaf = new X509Certificate(leafBytes);
assert.equal(sha(leaf.publicKey.export({ type: 'spki', format: 'der' })), config.public_inputs.client_public_key_sha256);
assert.equal(issuance.csr_sha256, config.public_inputs.client_csr_sha256);
config.public_inputs.ca_sha256 = issuance.server_ca_sha256;
config.public_inputs.client_leaf = {
  kind: 'issued_leaf', sha256: issuance.leaf_sha256, public_key_sha256: issuance.client_spki_sha256,
  san_uri: issuance.san_uri, eku: issuance.eku, ca: false,
  key_usage: ['digitalSignature', 'keyEncipherment'],
  issuer_ref: `sgp-client-ca-v1@${issuance.issuer_fingerprint_sha256}`,
  not_before: issuance.not_before, not_after: issuance.not_after,
};
const bytes = Buffer.from(JSON.stringify(config));
const report = validator.inspectManagerDataLegConfigBytes(bytes, {
  expectedWorkspaceId: config.workspace_id, nowMs: Date.now(), requireIssuedLeaf: true,
  reviewedKids: ['research-20261021-c185ee3d'],
});
assert.equal(report.ok, true, JSON.stringify(report));
const parent = lstatSync(resolve(issuedDir));
assert.ok(parent.isDirectory() && !parent.isSymbolicLink() && (parent.mode & 0o077) === 0);
assert.equal(resolve(outputDir, '..'), resolve(issuedDir));
mkdirSync(outputDir, { mode: 0o700 });
const put = (name, b) => writeFileSync(join(outputDir, name), b, { flag: 'wx', mode: 0o600 });
put('issued-inactive-config.json', bytes);
const receipt = {
  schema_version: 'portal.manager-issued-inactive-preparation.v1', created_at: new Date().toISOString(),
  state: 'ISSUED_CONFIG_VALIDATED_NOT_INSTALLED', source_sha256: sha(sourceBytes),
  previous_config_sha256: sha(baseBytes), issuance_receipt_sha256: sha(issuanceBytes),
  config_sha256: sha(bytes), report,
  runtime_installed: false, edge_jwks_reconciled: false, grants_issued: 0,
  connected_qualification: 'NOT_RUN',
  note: 'Per-mode READ flags describe the existing inactive proposal only; no runtime grant or STREAM, command or Live trading authority.',
};
put('configuration-receipt.json', JSON.stringify(receipt));
console.log(JSON.stringify(receipt));
