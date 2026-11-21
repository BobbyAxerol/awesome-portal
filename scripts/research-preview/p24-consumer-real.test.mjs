import assert from 'node:assert/strict';
import test from 'node:test';
import { assertNoApiWrites, byteHash, expectedAuditReads, expectedRefusalConsole, loadPaths, manifestFacts, requireConsumerConfig, readonlyDeclarationRequest, scopedHref, workspaceBoundRead } from './p24-consumer-real.mjs';

const image = 'sha256:' + 'a'.repeat(64);
const owned = () => ({ project: 'portal-research-p23-ol12', base_url: 'http://127.0.0.1:8096', origin: 'http://127.0.0.1:8096',
  username: 'p23-reader-95', workspace_id: 'ws-test', runs: { fixed: 'rrun_' + '1'.repeat(32), causal: 'rrun_' + '2'.repeat(32), global: 'rrun_' + '3'.repeat(32) },
  expected_images: { 'control-api': image, 'portal-web': image } });
test('owned loopback, QA and exact final image pins are mandatory before browser launches', () => {
  assert.equal(requireConsumerConfig(owned()).project, 'portal-research-p23-ol12');
  for (const value of ['http://localhost:8095', 'http://127.0.0.1:8095', 'https://portal.primusspark.com'])
    assert.throws(() => requireConsumerConfig({ ...owned(), base_url: value }));
  assert.throws(() => requireConsumerConfig({ ...owned(), username: 'bobby' }));
  assert.throws(() => requireConsumerConfig({ ...owned(), expected_images: {} }));
  assert.throws(() => requireConsumerConfig({ ...owned(), origin: 'https://portal.primusspark.com' }));
});
test('unknown/false applicability never allocates a read; true means only one GET', () => {
  assert.equal(expectedAuditReads(true), 1);
  for (const value of [false, null, undefined, 'SINGLE_PARAMETER_SET']) assert.equal(expectedAuditReads(value), 0);
});
test('manifest scopes never substitute a preflight pin for an absent source artifact', () => {
  assert.deepEqual(manifestFacts({ provenance: { manifest_digest: 'preflight', source_manifest_digest: null, manifest_digest_scope: 'PREFLIGHT_DATASET_SPEC' } }),
    { preflight: 'preflight', source: null, preflight_scope: 'PREFLIGHT_DATASET_SPEC' });
});
test('read load uses only named bounded Library and Progress endpoints', () => {
  const paths = loadPaths('rrun_' + '1'.repeat(32), 'ws&foreign');
  assert.equal(paths.length, 2);
  assert(paths[0].includes('limit=1'));
  assert(paths.every(path => new URL(path, 'http://127.0.0.1:8096').searchParams.get('workspace_id') === 'ws&foreign'));
  assert.throws(() => loadPaths('../private', 'ws'));
});
test('any product API mutation is a hard failure, not a silent allowlist', () => {
  assert.doesNotThrow(() => assertNoApiWrites([{ method: 'GET' }]));
  for (const method of ['POST', 'PATCH', 'DELETE', 'PUT']) assert.throws(() => assertNoApiWrites([{ method }]));
});
test('only named metadata-estimate POST in the explicit clone cell can be admitted as read-only', () => {
  const read = { cell: 'new-run-clone-scoped', method: 'POST', path: '/api/v1/research/datasets/declaration-estimates' };
  assert.equal(readonlyDeclarationRequest(read), true);
  assert.throws(() => assertNoApiWrites([read]));
  assert.doesNotThrow(() => assertNoApiWrites([read], true));
  for (const path of ['/api/v1/research/preflights', '/api/v1/research/runs', '/api/v1/research/alphas/import/register', '/api/v1/research/datasets/declaration-estimates/other']) assert.throws(() => assertNoApiWrites([{ ...read, path }], true));
  assert.throws(() => assertNoApiWrites([{ ...read, cell: 'library-filter-workspace' }], true));
});
test('workspace scope preserves the fold cursor and replaces stale scope exactly once', () => {
  const href = scopedHref('/research/quantbt/runs/rrun_test/search?workspace_id=old#fold=3', 'ws&new');
  const url = new URL(href, 'http://127.0.0.1:8096');
  assert.equal(url.hash, '#fold=3');
  assert.deepEqual(url.searchParams.getAll('workspace_id'), ['ws&new']);
  assert.throws(() => scopedHref('//portal.primusspark.com/private', 'ws'));
});
test('workspace assertion applies to Research named reads, never global authentication/bootstrap routes', () => {
  for (const path of ['/api/v1/research/alphas?workspace_id=x', '/api/v1/quantbt/runs?ids=x', '/api/v1/quantbt/runs/x/report']) assert.equal(workspaceBoundRead(path), true);
  for (const path of ['/api/auth/me', '/api/v1/capabilities', '/api/v1/quantbt/releases/current']) assert.equal(workspaceBoundRead(path), false);
});
test('a resource console line is expected only for its exact typed final-audit 409', () => {
  const path = '/api/v1/research/runs/rrun_test/final-audit?workspace_id=ws';
  const message = { message: 'Failed to load resource: the server responded with a status of 409', path };
  const response = { path, status: 409, code: 'RESEARCH_FINAL_AUDIT_NOT_APPLICABLE' };
  assert.equal(expectedRefusalConsole(message, [response]), true);
  assert.equal(expectedRefusalConsole({ ...message, path: '/api/other' }, [response]), false);
  assert.equal(expectedRefusalConsole(message, [{ ...response, status: 503 }]), false);
  assert.equal(expectedRefusalConsole(message, [{ ...response, code: 'UNAVAILABLE' }]), false);
  assert.equal(expectedRefusalConsole({ ...message, message: 'React warning' }, [response]), false);
});
test('file digest hashes raw bytes, not the JSON representation of a Buffer', () => {
  assert.equal(byteHash(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
