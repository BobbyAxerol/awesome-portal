import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assessUtility, utilityTarget, exportPath, EXPORT_FORMATS } from './utility-receipt.mjs';
import { PROJECT, BASE_URL } from './cell.mjs';

function good() {
  const selection = { params: { rvol: '1.2' }, objective: '-0.177' };
  return { project: PROJECT, base_url: BASE_URL, primary_run_id: 'primary', diagnostic_run_id: 'diagnostic',
    primary_running: { body: { current: { source_latest_sequence: 1 } } },
    samples: [0, 1].map(() => ({ resource: { all_active_services_bounded: true, within_base_limit: true },
      jobs: [{ run_id: 'primary', state: 'RUNNING' }, { run_id: 'diagnostic', state: 'RUNNING' }] })),
    primary_final: { body: { current: { effective_status: 'COMPLETED', terminal_materialization: 'READY' } } },
    diagnostic_final: { body: { current: { effective_status: 'COMPLETED', terminal_materialization: 'READY', source_latest_sequence: 5 } } },
    evaluate: { status: 200, body: { job: { run_id: 'diagnostic' } } },
    retry: { status: 200, body: { outcome: 'REPLAYED', job: { run_id: 'diagnostic' } } },
    changed_grid: { status: 409, body: { error: { code: 'RESEARCH_WHATIF_GRID_CHANGED' } } },
    pins_before: 'same', pins_after: 'same', jobs_added: 2, diagnostic_rows_before: 2, diagnostic_rows: 3,
    freeze_before: { body: { frozen_selection: selection } },
    freeze_after: { body: { frozen_selection: selection, what_if: { actions: { evaluate_grid: { state: 'NOTHING_TO_EVALUATE' } },
      coverage: { evaluated_unique: 63, unique_evaluations: 63 } } } },
    exports: Array.from({ length: 8 }, (_, i) => ({ created: { body: { job_id: `job${i}` } }, retry: { body: { job_id: `job${i}` } },
      final: { body: { state: 'READY', size_bytes: 8192 } } })),
    verifies: Array.from({ length: 6 }, () => ({ status: 200, body: { artifact_bytes: { state: 'MATCH' } } })) };
}
test('utility receipt is scoped: neither a unit fixture nor a runtime subset certifies all T12', () => {
  assert.equal(assessUtility(good()).scoped_passed, true);
  assert.equal(assessUtility(good()).full_t12_passed, false);
});
test('bounded utility overlap requires typed retained audit reuse, not prose or a fabricated child', () => {
  const receipt = good();
  receipt.exports = receipt.exports.slice(0, 2);
  receipt.parent_run_id = 'rrun_' + 'a'.repeat(32);
  receipt.audit_reuse = { status: 200, body: {
    fields: [{ key: 'final_audit_run_id', value: receipt.parent_run_id }],
    pack: [{ key: 'FINAL_AUDIT_REPLAY', status: 'COMPLETE' }],
  } };
  receipt.audit_split = { body: { stitch: { boundary_check: 'MATCH' } } };
  assert.equal(assessUtility(receipt, 2, true).scoped_passed, true);
  receipt.audit_reuse.body.fields[0].value = 'other';
  assert.equal(assessUtility(receipt, 2, true).checks.audit_reuse, false);
});
test('overlap, caps, source pins, dedupe, sealed results and bytes are all required', () => {
  const mutations = [r => { r.project = 'production'; }, r => { r.samples[0].resource.within_base_limit = false; },
    r => { r.samples.forEach(s => { s.jobs[0].state = 'COMPLETED'; }); }, r => { r.pins_after = 'changed'; },
    r => { r.freeze_after.body.frozen_selection = {}; }, r => { r.jobs_added++; }, r => { r.diagnostic_rows++; },
    r => { r.retry.body.job.run_id = 'different'; }, r => { r.changed_grid.status = 200; },
    r => { r.exports[0].final.body.size_bytes = 512 * 1024 + 1; }, r => { r.verifies[0].body.artifact_bytes.state = 'MISMATCH'; },
    r => { r.diagnostic_final.body.current.effective_status = 'FAILED'; }, r => { r.freeze_after.body.what_if.coverage.evaluated_unique = 1; },
    r => { r.primary_running.body.current.source_latest_sequence = 0; }, r => { r.diagnostic_final.body.current.source_latest_sequence = 0; }];
  for (const mutate of mutations) { const r = good(); mutate(r); assert.equal(assessUtility(r).scoped_passed, false); }
});
test('a real primary lease and queued utility is the declared workload, not two concurrent engine claims', () => {
  const r = good(); r.samples.forEach(s => { s.jobs[0].state = 'CLAIMED'; s.jobs[1].state = 'QUEUED'; });
  assert.equal(assessUtility(r).checks.queued_utility_overlap, true);
  r.primary_running.body.current.source_latest_sequence = 0;
  assert.equal(assessUtility(r).checks.queued_utility_overlap, false);
});
test('foreign targets and unsafe receipt labels are refused', () => {
  assert.deepEqual(utilityTarget('rrun_' + 'a'.repeat(32), 'utility-actual'), { runId: 'rrun_' + 'a'.repeat(32), label: 'utility-actual' });
  for (const [run, label] of [['legacy', 'ok'], ['rrun_' + 'a'.repeat(32), '../overwrite']]) assert.throws(() => utilityTarget(run, label));
});
test('runtime export formats match the published producer contract, never guessed presentation names', () => {
  const source = readFileSync(new URL('../../apps/control-api/src/research/report.contract.ts', import.meta.url), 'utf8');
  const declared = source.match(/ResearchReportExportFormatSchema = z.enum\(\[([^\]]+)\]\)/);
  assert(declared, 'SOURCE_ENUM_REQUIRED');
  assert.deepEqual(EXPORT_FORMATS, JSON.parse('[' + declared[1] + ']'));
});
test('members retain their own identity while every export operation explicitly binds the parent workspace', () => {
  const run = 'rrun_' + 'a'.repeat(32);
  assert.equal(exportPath(run, 'ws_owned'), `/api/v1/quantbt/runs/${run}/report/exports?workspace_id=ws_owned`);
  assert.equal(exportPath(run, 'ws_owned', 'rpex_AB123'), `/api/v1/quantbt/runs/${run}/report/exports/rpex_AB123?workspace_id=ws_owned`);
  assert.throws(() => exportPath(run, '../foreign')); assert.throws(() => exportPath(run, 'ws_owned', '../foreign'));
  const source = readFileSync(new URL('./utility-receipt.mjs', import.meta.url), 'utf8');
  assert(source.indexOf('REAL_QUEUED_EXPORT_REQUIRED') < source.indexOf('receipt.primary_create ='));
});
test('runtime proof cannot manufacture audit, alter memberships or mutate parent/source SQL', () => {
  const source = readFileSync(new URL('./utility-receipt.mjs', import.meta.url), 'utf8');
  assert(!/INSERT INTO|UPDATE research\.|DELETE FROM|workspace_memberships/.test(source));
  assert(source.includes('--limit=8')); assert(source.includes('NEGATIVE_QUOTA_BOUNDARIES'));
  assert(source.includes('current-source/freeze')); assert(source.includes('full_t12_passed: false'));
});
