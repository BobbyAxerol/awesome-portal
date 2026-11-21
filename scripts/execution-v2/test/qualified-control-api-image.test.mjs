import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, symlinkSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { exportQualifiedBuild, packageQualifiedBuild, NODE_IMAGE } from '../qualified-control-api-image.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const dockerfile = readFileSync(new URL('../../../deploy/images/control-api.Dockerfile', import.meta.url), 'utf8');
const required = ['main', 'app.module', 'execution-v2/native-cache-observation', 'execution-v2/native-core-runtime',
  'execution-v2/native-core-composition', 'cli/execution-native-cache-observation'];
function put(root, path, data) { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), data); }
function git(root, args) { const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); }
function fixture(t) {
  const base = mkdtempSync(join(tmpdir(), 'qualified-control-api-test-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const sourceRoot = join(base, 'repo'), workDir = join(base, 'work'), outputDirectory = join(base, 'artifact'), packaged = join(base, 'packaged');
  for (const path of [sourceRoot, workDir, outputDirectory, packaged]) mkdirSync(path, { mode: 0o700 });
  const sources = {
    'apps/control-api/package.json': JSON.stringify({ scripts: { build: 'tsc -p tsconfig.build.json' } }),
    'apps/control-api/package-lock.json': JSON.stringify({ packages: { 'node_modules/typescript': { version: '5.9.3' } } }),
    'apps/control-api/tsconfig.json': JSON.stringify({ compilerOptions: { strict: true } }),
    'apps/control-api/tsconfig.build.json': JSON.stringify({ extends: './tsconfig.json', compilerOptions: { sourceMap: false } }),
    'apps/control-api/migrations/001-test.sql': 'SELECT 1;',
    'apps/control-api/src/execution-v2/current-human-candidate.sql': 'SELECT 2;',
    'deploy/images/control-api.Dockerfile': dockerfile,
    'deploy/control-api/bootstrap-users.yaml': 'users: []\n',
    'scripts/control-api-test.sh': '#!/bin/sh\n# Synthetic TEST_ONLY gate, not an actual gate receipt.\n',
  };
  for (const path of required) sources[`apps/control-api/src/${path}.ts`] = `export const name = ${JSON.stringify(path)};\n`;
  for (const [path, bytes] of Object.entries(sources)) {
    put(sourceRoot, path, bytes);
    if (path.startsWith('apps/control-api/')) put(workDir, path.slice('apps/control-api/'.length), bytes);
    else if (path === 'deploy/control-api/bootstrap-users.yaml') put(workDir, path, bytes);
  }
  for (const path of required) put(workDir, `dist/${path}.js`, `"use strict";exports.name=${JSON.stringify(path)};\n`);
  put(workDir, '.qualified-control-api-toolchain.json', JSON.stringify({ node_version: 'v22.23.2', typescript_version: '5.9.3',
    typescript_js_sha256: sha('TEST_ONLY-compiler'), typescript_tsc_sha256: sha('TEST_ONLY-tsc') }));
  git(sourceRoot, ['init', '-q']); git(sourceRoot, ['add', '.']);
  const options = { sourceRoot, sourceTree: git(sourceRoot, ['write-tree']), workDir, outputDirectory,
    qualification: { gate_script_sha256: sha(sources['scripts/control-api-test.sh']), gate_exit_code: 0,
      build_command: 'npm run build', test_command: 'npm test', restore: 'PASS' } };
  return { ...options, options, base, packaged, sources };
}
const refused = action => assert.throws(action, /QUALIFIED_CONTROL_API_IMAGE_REFUSED/);

test('captures exact synthetic build and packages identical final runtime stage, no second compiler', t => {
  const f = fixture(t);
  f.qualification.test_command = 'npm test -- test/native-cache-observation.spec.ts test/native-core-bootstrap.spec.ts';
  const result = exportQualifiedBuild(f.options);
  assert.equal(result.dist_files, required.length);
  const receiptBytes = readFileSync(join(f.outputDirectory, 'qualification.json'));
  assert.equal(sha(receiptBytes), result.receipt_sha256);
  const receipt = JSON.parse(receiptBytes);
  assert.equal(receipt.source_tree, f.sourceTree);
  assert.equal(receipt.qualification.test_command, f.qualification.test_command);
  assert.match(receipt.provenance, /NOT_CONNECTED_AUTHORITY/);
  const packaged = packageQualifiedBuild({ artifactDirectory: f.outputDirectory, receiptSha256: result.receipt_sha256, outputDirectory: f.packaged });
  const next = readFileSync(join(f.packaged, 'Dockerfile.qualified'), 'utf8');
  assert.equal(next.slice(next.lastIndexOf('\nFROM ') + 1), dockerfile.slice(dockerfile.lastIndexOf('\nFROM ') + 1));
  assert.match(next, /RUN npm ci --no-audit --no-fund && npm prune --omit=dev/);
  assert.doesNotMatch(next, /npm run build|noCheck|transpile/);
  assert.equal(packaged.qualification, 'PACKAGING_ONLY_NOT_IMAGE_OR_CONNECTED_PASS');
  assert.equal(readFileSync(join(f.packaged, 'dist/execution-v2/native-cache-observation.js'), 'utf8'),
    readFileSync(join(f.workDir, 'dist/execution-v2/native-cache-observation.js'), 'utf8'));
  assert.equal(readFileSync(join(f.packaged, 'deploy/control-api/bootstrap-users.yaml')).length, f.sources['deploy/control-api/bootstrap-users.yaml'].length);
  assert.equal(readdirSync(f.packaged).includes('node_modules'), false);
});

test('refuses unsuccessful restore/build, another compiler mode/image or gate pin', t => {
  const f = fixture(t);
  for (const patch of [{ restore: 'NOT_RUN' }, { gate_exit_code: 1 }, { build_command: 'tsc --noCheck' },
    { test_command: 'echo pass' }, { gate_script_sha256: 'a'.repeat(64) }])
    refused(() => exportQualifiedBuild({ ...f.options, qualification: { ...f.qualification, ...patch } }));
  refused(() => exportQualifiedBuild({ ...f.options, nodeImage: NODE_IMAGE.replace('c610', 'd610') }));
  assert.deepEqual(readdirSync(f.outputDirectory), []);
});

test('refuses source/worktree drift and extra untracked source before any artifact write', t => {
  const f = fixture(t);
  put(f.workDir, 'src/main.ts', 'export const changed = true;');
  refused(() => exportQualifiedBuild(f.options));
  put(f.workDir, 'src/main.ts', f.sources['apps/control-api/src/main.ts']);
  put(f.workDir, 'src/untracked.ts', 'secret source must not ship');
  refused(() => exportQualifiedBuild(f.options));
  assert.deepEqual(readdirSync(f.outputDirectory), []);
});

test('refuses missing native observer, foreign dist file, root symlinks and wrong toolchain', t => {
  const f = fixture(t);
  rmSync(join(f.workDir, 'dist/execution-v2/native-cache-observation.js'));
  refused(() => exportQualifiedBuild(f.options));
  put(f.workDir, 'dist/execution-v2/native-cache-observation.js', 'exports.x = 1;');
  put(f.workDir, 'dist/secret.env', 'no');
  refused(() => exportQualifiedBuild(f.options));
  rmSync(join(f.workDir, 'dist/secret.env'));
  put(f.workDir, '.qualified-control-api-toolchain.json', JSON.stringify({ node_version: 'v18.0.0', typescript_version: '5.9.3',
    typescript_js_sha256: sha('TEST_ONLY'), typescript_tsc_sha256: sha('TEST_ONLY') }));
  refused(() => exportQualifiedBuild(f.options));
  rmSync(join(f.workDir, 'dist'), { recursive: true }); mkdirSync(join(f.base, 'elsewhere'));
  symlinkSync(join(f.base, 'elsewhere'), join(f.workDir, 'dist'));
  refused(() => exportQualifiedBuild(f.options));
});

test('refuses a noCheck configuration even when the package build command looks normal', t => {
  const f = fixture(t), config = JSON.stringify({ compilerOptions: { noCheck: true } });
  put(f.sourceRoot, 'apps/control-api/tsconfig.json', config); put(f.workDir, 'tsconfig.json', config);
  git(f.sourceRoot, ['add', '.']); f.options.sourceTree = git(f.sourceRoot, ['write-tree']);
  refused(() => exportQualifiedBuild(f.options));
});

test('requires an empty owner-private output outside repo, without overwriting', t => {
  const f = fixture(t);
  chmodSync(f.outputDirectory, 0o755); refused(() => exportQualifiedBuild(f.options)); chmodSync(f.outputDirectory, 0o700);
  put(f.outputDirectory, 'existing', 'preserve'); refused(() => exportQualifiedBuild(f.options));
  assert.equal(readFileSync(join(f.outputDirectory, 'existing'), 'utf8'), 'preserve');
  const inside = join(f.sourceRoot, 'inside'); mkdirSync(inside, { mode: 0o700 });
  refused(() => exportQualifiedBuild({ ...f.options, outputDirectory: inside }));
});

test('packaging rejects wrong receipt pin, mutated artifacts, extra files and symlink outputs', t => {
  const f = fixture(t), result = exportQualifiedBuild(f.options);
  const options = { artifactDirectory: f.outputDirectory, receiptSha256: result.receipt_sha256, outputDirectory: f.packaged };
  refused(() => packageQualifiedBuild({ ...options, receiptSha256: 'a'.repeat(64) }));
  put(f.outputDirectory, 'dist/main.js', 'mutated'); refused(() => packageQualifiedBuild(options));
  assert.equal(existsSync(join(f.packaged, 'Dockerfile.qualified')), false);
});
