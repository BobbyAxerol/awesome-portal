import test from 'node:test';
import assert from 'node:assert/strict';
import { requireConfig, publishInput, assertDelivered, assessDownload, parseExportWorkerOutput, validateExportContinuation,
  lineageReadPath, PARENT, CHILD, hash } from './p24-publication-export-edges.mjs';

const digest = 'a'.repeat(64);
const config = { project: 'portal-research-p23-ol12', base_url: 'http://127.0.0.1:8096', origin: 'http://127.0.0.1:8096',
  user: { username: 'p24-edge-publish', password: 'private-example-not-real' }, workspace_id: 'ws_example',
  out: '/home/bobby/.local/state/portal-research-p23/20261004/test-publication-edges',
  expected_images: Object.fromEntries(['control-api', 'portal-api', 'quant-worker-py', 'portal-web'].map(key => [key, `sha256:${digest}`])) };
const publication = { state: 'NOT_PUBLISHED', may_publish: true, candidate_relation: 'CURRENT',
  pack_digest: digest, source: { availability: 'AVAILABLE', eligible_methodology_claim_ids: ['claim:sha256:example'] } };

test('exact owned clone and named ordinary actor only; no shared/prod or image substitution', () => {
  assert.equal(requireConfig(structuredClone(config)).project, config.project);
  assert.equal(requireConfig(structuredClone(config)).lane, 'PUBLICATION_AND_EXPORT');
  assert.equal(requireConfig({ ...structuredClone(config), lane: 'EXPORT_ONLY' }).lane, 'EXPORT_ONLY');
  for (const bad of [{ base_url: 'http://127.0.0.1:8095' }, { project: 'portal-stable' },
    { user: { username: 'bobby', password: 'no' } }, { expected_images: {} }, { lane: 'FORCE_SEAL' }])
    assert.throws(() => requireConfig({ ...config, ...bad }));
});
test('publish exact server-listed claim and pack; no reason bypass/fake source', () => {
  assert.deepEqual(publishInput(publication), { schema_version: 'research.release-candidate-publish-request.v1',
    expected_pack_digest: digest, methodology_claim_id: 'claim:sha256:example' });
  for (const bad of [{ state: 'DELIVERED' }, { may_publish: false, blocked_reason: 'P22_CURRENT_SOURCE_CHANGED' },
    { source: { availability: 'PARTIAL', eligible_methodology_claim_ids: ['claim'] } }])
    assert.throws(() => publishInput({ ...publication, ...bad }));
});
test('retry preserves real actor, RC/R1, pack and receipt; cannot fabricate success', () => {
  const prior = { state: 'DELIVERED', release_candidate_id: 'rc_example', pack_digest: digest,
    published: { by_user_id: 'usr_example', approval_id: 'apr_example', receipt_digest: digest }, replayed: false };
  assertDelivered(prior, 'usr_example', 'rc_example');
  assertDelivered({ ...prior, replayed: true }, 'usr_example', 'rc_example', prior);
  assert.throws(() => assertDelivered({ ...prior, replayed: true,
    published: { ...prior.published, approval_id: 'apr_duplicate' } }, 'usr_example', 'rc_example', prior));
  assert.throws(() => assertDelivered({ ...prior, replayed: true }, 'usr_other', 'rc_example', prior));
});
test('download proves actual bytes/size and sealed export hash, never patched metadata', () => {
  const bytes = Buffer.from('{"schema_version":"test.fixture-only"}\n');
  const status = { state: 'READY', size_bytes: bytes.length, sha256: hash(bytes) };
  assert.deepEqual(assessDownload(status, bytes), { size_bytes: bytes.length, sha256: hash(bytes) });
  assert.throws(() => assessDownload({ ...status, size_bytes: bytes.length + 1 }, bytes));
  assert.throws(() => assessDownload({ ...status, sha256: digest }, bytes));
  assert.throws(() => assessDownload({ ...status, state: 'QUEUED' }, bytes));
});
test('finite CLI accepts only Nest framework logs plus exact owned terminal records', () => {
  const ids = ['rpex_a', 'rpex_b'];
  const records = ids.map(job_id => ({ event: 'research_report_export_completed', job_id }))
    .concat({ event: 'research_report_export_worker_complete', processed: 2 });
  const output = '\u001b[32m[Nest] 12 - 10/04/2026, 12:00:00 PM LOG [NestFactory] Starting Nest application...\u001b[39m\n'
    + records.map(row => JSON.stringify(row)).join('\n');
  assert.deepEqual(parseExportWorkerOutput(output, ids), records);
  assert.throws(() => parseExportWorkerOutput('unrecognized output\n' + output, ids));
  assert.throws(() => parseExportWorkerOutput(output.replace('rpex_b', 'rpex_unowned'), ids));
  assert.throws(() => parseExportWorkerOutput(output.replace('"processed":2', '"processed":1'), ids));
});
test('completed-export continuation is original-source, actor, candidate and two exact jobs only', () => {
  const prior = { schema_version: 'research.p24-publication-export-edges.v1', project: config.project,
    base_url: config.base_url, actor: 'p24-edge-publish', workspace_id: config.workspace_id,
    parent_run_id: PARENT, child_run_id: CHILD, release_candidate_id: 'rc_example', original_report_revision: 'report_example',
    immutable_source_preserved: true, runtime: { images: config.expected_images }, scenarios: { 'SC-19': { status: 'SCOPED_PASS' } },
    exports: ['REPORT_JSON', 'REPORT_CSV'].map((format, i) => ({ created: { job_id: `rpex_${i}`, format,
      run_id: PARENT, report_revision: 'report_example' } })) };
  assert.deepEqual(validateExportContinuation(prior, config), ['rpex_0', 'rpex_1']);
  for (const bad of [{ actor: 'bobby' }, { workspace_id: 'other' }, { immutable_source_preserved: false },
    { scenarios: { 'SC-19': { status: 'NOT_RUN' } } }, { exports: [prior.exports[0], prior.exports[0]] }])
    assert.throws(() => validateExportContinuation({ ...prior, ...bad }, config));
});
test('Lineage uses the named Alpha operation with exact scope, not a nonexistent run route', () => {
  assert.equal(lineageReadPath({ run: { binding: { alpha_id: 'delta-rsi-polynomial-alpha' } } }, 'ws_example'),
    '/api/v1/research/alphas/delta-rsi-polynomial-alpha/lineage?workspace_id=ws_example&limit=128');
  assert.throws(() => lineageReadPath({ run: { binding: null } }, 'ws_example'));
  assert.throws(() => lineageReadPath({ run: { binding: { alpha_id: '../other' } } }, 'ws_example'));
});
