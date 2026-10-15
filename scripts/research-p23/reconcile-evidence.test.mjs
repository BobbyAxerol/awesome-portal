import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, test } from 'node:test';
import { HISTORICAL_TEST_MANIFEST_LOSSES as losses } from './historical-manifest-exceptions.mjs';
import { RECONCILIATION_POLICY, reconcileEvidence } from './reconcile-evidence.mjs';

// All measurements/identities below are technical verifier fixtures only;
// these tests never generate product receipts or claim actual qualification.
const owned = [];
afterEach(() => { for (const dir of owned.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function fixture(id = 'P23-T02') {
  const home = mkdtempSync(join(tmpdir(), 'p23-reconcile-verifier-')); owned.push(home);
  const repo = join(home, 'repo'); mkdirSync(repo, { mode: 0o700 });
  const proofs = join(home, 'proofs'); mkdirSync(proofs, { mode: 0o700 });
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--quiet');
  for (const path of RECONCILIATION_POLICY[id].paths) {
    const file = /\.(?:json|yaml|mjs|py|ts|toml)$/.test(path) ? path : `${path}/technical-fixture.txt`;
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), 'Technical source fixture, not production code.\n');
  }
  const commit = message => {
    git('add', '.');
    git('-c', 'user.name=Technical verifier', '-c', 'user.email=verifier@example.invalid', 'commit', '--quiet', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  const originSha = commit('technical origin fixture');
  writeFileSync(join(repo, 'notes.md'), 'Docs-only technical candidate fixture.\n');
  const candidateSha = commit('technical docs-only candidate');
  const proof = (name, value) => {
    const locator = join(proofs, name);
    writeFileSync(locator, typeof value === 'string' ? value : JSON.stringify(value), { mode: 0o600 });
    return { locator, sha256: createHash('sha256').update(readFileSync(locator)).digest('hex') };
  };
  const config = { engine: { pin: '1.1.1' }, storage: { format: 'P05' }, security: { fresh_authority: true },
    limits: { bytes: 5_000_000_000 }, features: { commands: false }, database: { profile: 'p23' }, network: { source: false } };
  const runtime = (label, sourceSha, image) => ({
    identity: proof(`${label}-identity.json`, { source_sha: sourceSha, source_is_exact_committed_build: true, project: 'portal-research-p23-verifier',
      control_image: `sha256:${image.repeat(64)}` }),
    source_sha_pointer: '/source_sha', exact_commit_pointer: '/source_is_exact_committed_build',
    project_pointer: '/project', image_pointers: ['/control_image'],
    config: proof(`${label}-config.json`, config),
    config_pointers: Object.fromEntries(Object.keys(config).map(key => [key, `/${key}`])),
  });
  const origin = { source_sha: originSha, receipt: proof('origin.json', { test_id: id, passed: true, fixture_only: true }),
    gate_id_pointer: '/test_id', result_pointer: '/passed', result_equals: true, runtime: runtime('origin', originSha, 'a') };
  const row = { gate_id: id, scope: 'Technical verifier fixture only, never an actual qualification.', origin,
    evidence: [proof('actual-command.log', 'Technical verifier fixture, not an actual runtime log.\n')] };
  const input = { schema_version: 'research.p23-evidence-reconciliation-input.v1', repository: repo,
    evidence_roots: [proofs], candidate: { source_sha: candidateSha, runtime: runtime('candidate', candidateSha, 'b') }, gates: [row] };
  const current = () => reconcileEvidence(input).gates.find(gate => gate.gate_id === id);
  const candidateCommit = () => {
    input.candidate.source_sha = commit('technical candidate change');
    const identity = JSON.parse(readFileSync(input.candidate.runtime.identity.locator, 'utf8'));
    input.candidate.runtime.identity = proof('candidate-identity.json', { ...identity, source_sha: input.candidate.source_sha });
  };
  return { home, repo, proofs, git, proof, config, input, row, current, candidateCommit };
}

test('exact source/config/evidence reuse keeps old image identity and never emits qualification', () => {
  const f = fixture(); const result = reconcileEvidence(f.input); const gate = f.current();
  assert.equal(gate.disposition, 'REUSED_VERIFIED');
  assert.equal(gate.same_image_ids, false);
  assert.equal(gate.dependency_verification.origin_sha256, gate.dependency_verification.candidate_sha256);
  assert.deepEqual(gate.dependency_verification.changed_paths, []);
  assert.equal(result.reconciliation_complete, false); // fourteen absent origins remain explicit.
  assert.equal(result.gates.filter(row => row.disposition === 'UNVERIFIED').length, 14);
  assert.equal(result.qualification_issued, false);
  assert.equal(result.same_candidate_all_gates_passed, false);
  assert.equal(result.product_active, false);
  assert.deepEqual(result.strict_historical_integrity.verified, 83);
  assert.equal(result.strict_historical_integrity.full_store_integrity_passed, false);
});
test('a relevant source change, addition or deletion requires a retake', () => {
  for (const change of ['edit', 'add', 'delete']) {
    const f = fixture(); const file = join(f.repo, 'apps/portal/backend/src/portal_api/workers/technical-fixture.txt');
    if (change === 'edit') writeFileSync(file, 'changed\n');
    if (change === 'add') writeFileSync(join(dirname(file), 'another.py'), 'additional dependency\n');
    if (change === 'delete') unlinkSync(file);
    f.candidateCommit();
    assert.equal(f.current().disposition, 'RETAKE_REQUIRED', change);
    assert.equal(f.current().reason, 'P23_RECONCILE_SOURCE_DEPENDENCIES_CHANGED', change);
  }
});
test('security and governance are minimum dependencies for isolation/reference gates', () => {
  const f = fixture('P23-T14');
  writeFileSync(join(f.repo, 'apps/control-api/src/governance/technical-fixture.txt'), 'new R2/Live executor\n');
  f.candidateCommit();
  f.row.additional_paths = []; // cannot remove the mandatory authority scope.
  const gate = f.current();
  assert.equal(gate.disposition, 'RETAKE_REQUIRED');
  assert(gate.dependency_verification.changed_paths.some(path => path.includes('/governance/')));
});
test('a changed required configuration category requires retake but unrelated metadata does not', () => {
  const f = fixture();
  f.input.candidate.runtime.config = f.proof('candidate-config.json', { ...f.config, note: 'harmless operator metadata' });
  assert.equal(f.current().disposition, 'REUSED_VERIFIED');
  f.input.candidate.runtime.config = f.proof('candidate-config.json', { ...f.config, limits: { bytes: 8_000_000_000 } });
  assert.equal(f.current().disposition, 'RETAKE_REQUIRED');
  assert.equal(f.current().reason, 'P23_RECONCILE_RUNTIME_CONFIG_SCOPE_CHANGED');
});
test('missing raw files, missing configuration, malformed and tampered evidence stay unverified', () => {
  for (const mutate of [
    f => unlinkSync(f.row.origin.receipt.locator),
    f => unlinkSync(f.row.evidence[0].locator),
    f => writeFileSync(f.row.evidence[0].locator, 'changed bytes'),
    f => { f.input.candidate.runtime.config_pointers = {}; },
    f => { f.row.origin.runtime.identity = f.proof('bad-identity.json', 'not JSON'); },
  ]) {
    const f = fixture(); mutate(f);
    assert.equal(f.current().disposition, 'UNVERIFIED');
  }
});
test('raw failures do not become reused success just because the bytes have a valid digest', () => {
  const f = fixture();
  f.row.origin.receipt = f.proof('origin.json', { test_id: f.row.gate_id, passed: false });
  assert.equal(f.current().disposition, 'RETAKE_REQUIRED');
  assert.equal(f.current().reason, 'P23_RECONCILE_ORIGIN_DID_NOT_PASS');
  f.row.origin.result_equals = false;
  assert.equal(f.current().disposition, 'UNVERIFIED');
});
test('a dirty or untracked scoped dependency cannot claim a committed candidate', () => {
  const f = fixture();
  writeFileSync(join(f.repo, 'apps/portal/backend/src/portal_api/workers/technical-fixture.txt'), 'not committed');
  assert.equal(f.current().disposition, 'UNVERIFIED');
  f.git('restore', 'apps/portal/backend/src/portal_api/workers/technical-fixture.txt');
  writeFileSync(join(f.repo, 'apps/portal/backend/src/portal_api/workers/unlanded.py'), 'not committed');
  assert.equal(f.current().disposition, 'UNVERIFIED');
});
test('evidence rejects symlinks, public files, path escape, wrong source binding and floating images', () => {
  for (const mutate of [
    f => {
      const copied = f.proof('other.json', readFileSync(f.row.origin.receipt.locator));
      unlinkSync(f.row.origin.receipt.locator); symlinkSync(copied.locator, f.row.origin.receipt.locator);
    },
    f => chmodSync(f.row.origin.receipt.locator, 0o644),
    f => { f.row.evidence[0].locator = join(f.repo, 'notes.md'); },
    f => { f.row.origin.runtime.identity = f.proof('wrong-identity.json', { source_sha: 'a'.repeat(40),
      project: 'portal-research-p23-verifier', control_image: `sha256:${'a'.repeat(64)}` }); },
    f => { f.input.candidate.runtime.image_pointers = ['/project']; },
    f => { f.row.additional_paths = ['../notes.md']; },
    f => { f.row.additional_paths = ['apps/**']; },
  ]) {
    const f = fixture(); mutate(f); assert.equal(f.current().disposition, 'UNVERIFIED');
  }
});
test('tracked dependency symlinks and uncommitted executable-mode changes stay unverified', () => {
  const f = fixture();
  const path = join(f.repo, 'apps/portal/backend/src/portal_api/workers/technical-fixture.txt');
  chmodSync(path, 0o755);
  assert.equal(f.current().disposition, 'UNVERIFIED');
  chmodSync(path, 0o644);
  const target = join(f.repo, 'notes.md');
  unlinkSync(path); symlinkSync(target, path); f.candidateCommit();
  assert.equal(f.current().reason, 'P23_RECONCILE_DEPENDENCY_SYMLINK_OR_SUBMODULE_REFUSED');
});
test('absent declared dependency, unrelated origin and invalid candidate are not blanket reusable', () => {
  const f = fixture();
  f.row.additional_paths = ['does-not-exist.py'];
  assert.equal(f.current().disposition, 'UNVERIFIED');
  delete f.row.additional_paths;
  f.row.origin.source_sha = 'a'.repeat(40);
  assert.equal(f.current().disposition, 'UNVERIFIED');
  f.input.candidate.source_sha = 'main';
  assert.throws(() => reconcileEvidence(f.input), /P23_RECONCILE_FULL_EXISTING_COMMIT_REQUIRED/);
});
test('only exact historical loss accounting is accepted, never strict 86/86 or a new exception', () => {
  const f = fixture('P23-T06');
  const receipt = { schema_version: 'research.p23-historical-test-loss.v1',
    authority: 'BOBBY_APPROVED_2026_10_03_EXACT_TEST_LOSS_ACCOUNTING', state: 'EXACT_HISTORICAL_EXCEPTION_ACCOUNTED',
    exception_accounting_passed: true, full_store_integrity_passed: false, byte_recovery_performed: false,
    details: losses.map(row => ({ ...row, state: 'MISSING', recovered: false })) };
  const population = { verified_artifacts: 83, missing_manifests: losses.map(row => ({ artifact_id: row.artifact_id,
    expected_manifest_digest: row.expected_manifest_digest, state: 'MISSING' })) };
  f.row.historical_exception = { receipt: f.proof('exception.json', receipt), population: f.proof('population.json', population),
    verified_pointer: '/verified_artifacts', missing_pointer: '/missing_manifests' };
  assert.equal(f.current().disposition, 'APPROVED_EXCEPTION');
  assert.equal(f.current().historical_exception.full_store_integrity_passed, false);
  f.row.historical_exception.receipt = f.proof('exception.json', { ...receipt, full_store_integrity_passed: true });
  assert.equal(f.current().disposition, 'UNVERIFIED');
  f.row.historical_exception.receipt = f.proof('exception.json', receipt);
  f.row.historical_exception.population = f.proof('population.json', { ...population,
    missing_manifests: [...population.missing_manifests.slice(0, 2), { ...population.missing_manifests[2], artifact_id: 'new_loss' }] });
  assert.equal(f.current().disposition, 'UNVERIFIED');
});
test('canonical gate identifiers remain unique and all fifteen appear even without supplied evidence', () => {
  const f = fixture();
  f.input.gates = [];
  assert.equal(reconcileEvidence(f.input).gates.length, 15);
  f.input.gates = [f.row, f.row];
  assert.throws(() => reconcileEvidence(f.input), /P23_RECONCILE_UNIQUE_CANONICAL_GATE_IDS_REQUIRED/);
});
test('a generic all-pass origin and a pre-commit source label cannot manufacture cross-gate reuse', () => {
  const f = fixture();
  f.row.origin.receipt = f.proof('generic.json', { passed: true });
  assert.equal(f.current().disposition, 'UNVERIFIED');
  f.row.origin.receipt = f.proof('generic.json', { test_id: 'P23-T01', passed: true });
  assert.equal(f.current().reason, 'P23_RECONCILE_ORIGIN_GATE_BINDING_MISMATCH');
  f.row.origin.receipt = f.proof('generic.json', { test_id: 'P23-T02', passed: true });
  const identity = JSON.parse(readFileSync(f.row.origin.runtime.identity.locator));
  f.row.origin.runtime.identity = f.proof('precommit.json', { ...identity, source_is_exact_committed_build: false });
  assert.equal(f.current().reason, 'P23_RECONCILE_EXACT_RUNTIME_COMMIT_ATTESTATION_REQUIRED');
});
test('a same-source affected retake is named separately and CLI refuses output overwrite', () => {
  const f = fixture();
  f.row.origin.source_sha = f.input.candidate.source_sha;
  f.row.origin.runtime = f.input.candidate.runtime;
  assert.equal(f.current().disposition, 'AFFECTED_RETAKE_VERIFIED');
  const manifest = f.proof('manifest.json', f.input);
  const output = join(f.proofs, 'reconciled.json');
  const script = new URL('./reconcile-evidence.mjs', import.meta.url);
  assert.throws(() => execFileSync(process.execPath, [script.pathname, manifest.locator, output], { stdio: 'pipe' }));
  const generated = readFileSync(output, 'utf8');
  assert.equal(JSON.parse(generated).qualification_issued, false);
  assert.throws(() => execFileSync(process.execPath, [script.pathname, manifest.locator, output], { stdio: 'pipe' }));
  assert.equal(readFileSync(output, 'utf8'), generated);
});
